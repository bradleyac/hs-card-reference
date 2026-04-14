import type { BgCard, BgCardCategory } from './types';

// Raw shape from HearthstoneJSON cards.json (only the fields we care about)
export interface RawCard {
  id: string;
  dbfId: number;
  name?: string;
  text?: string;
  type?: string;
  techLevel?: number;
  attack?: number;
  health?: number;
  cost?: number;
  armor?: number;
  races?: string[];
  race?: string;
  mechanics?: string[];
  // Battlegrounds-specific boolean flags
  isBattlegroundsPoolMinion?: boolean;
  isBattlegroundsPoolSpell?: boolean;
  battlegroundsHero?: boolean;
  isBattlegroundsBuddy?: boolean;
  battlegroundsTimewarpCard?: number;
  // Cross-reference dbfIds
  heroPowerDbfId?: number;
  battlegroundsBuddyDbfId?: number;
  battlegroundsSkinParentId?: number;
  // Used to resolve hero powers → parent hero
  heroId?: string;
  battlegroundsAssociatedRaces?: string[];
  battlegroundsNormalDbfId?: number;
  battlegroundsPremiumDbfId?: number;
}

// User-facing search aliases for race strings that differ from the display name
const RACE_ALIASES: Record<string, string> = {
  MECHANICAL: 'mech',
};

// All tribe keywords — added to ALL-type cards so they match any tribe search
const ALL_TRIBE_KEYWORDS = ['beast', 'demon', 'dragon', 'elemental', 'mech', 'murloc', 'naga', 'pirate', 'quilboar', 'undead'];

// Mechanics that map to synthetic keyword strings
const MECHANIC_KEYWORD_MAP: Record<string, string> = {
  DIVINE_SHIELD: 'divine_shield',
  WINDFURY: 'windfury',
  MEGA_WINDFURY: 'mega_windfury',
  TAUNT: 'taunt',
  DEATHRATTLE: 'deathrattle',
  BATTLECRY: 'battlecry',
  STEALTH: 'stealth',
  POISON: 'poisonous',
  LIFESTEAL: 'lifesteal',
  RUSH: 'rush',
  REBORN: 'reborn',
  CLEAVE: 'cleave',
  MAGNETIC: 'magnetic',
};

function extractKeywords(raw: RawCard, category: BgCardCategory): string[] {
  const kw = new Set<string>();

  for (const m of raw.mechanics ?? []) {
    const mapped = MECHANIC_KEYWORD_MAP[m];
    if (mapped) kw.add(mapped);
    // Also add lowercase raw mechanic so users can search "reborn" etc.
    kw.add(m.toLowerCase());
  }

  // Race aliases — user-facing names that differ from the internal race string
  const races = getRaces(raw);
  if (races.includes('ALL')) {
    for (const kw_ of ALL_TRIBE_KEYWORDS) kw.add(kw_);
  } else {
    for (const race of races) {
      kw.add(RACE_ALIASES[race] ?? race.toLowerCase());
    }
  }

  // Synthetic keywords
  if (category === 'BUDDY') kw.add('buddy');
  if (category === 'ANOMALY') kw.add('anomaly');
  if (category === 'TIMEWARPED_MAJOR' || category === 'TIMEWARPED_MINOR') {
    kw.add('timewarped');
  }
  if (category === 'QUEST') kw.add('quest');
  if (category === 'TAVERN_MINION' && raw.techLevel) {
    kw.add(`tier${raw.techLevel}`);
  }

  return Array.from(kw);
}

function getRaces(raw: RawCard): string[] {
  if (raw.races && raw.races.length > 0) return raw.races;
  if (raw.race && raw.race !== 'INVALID') return [raw.race];
  return [];
}

function stripHtml(text: string): string {
  return text.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

// Duos-only spells that lack a BGDUO prefix but are not in the Solo pool
const DUOS_ONLY_IDS = new Set(['BG31_242', 'BG31_243', 'BG31_244']);

/**
 * Attempt to classify a raw card into a BG category.
 * Returns null if the card is not relevant to Battlegrounds.
 */
function classifyCategory(raw: RawCard, bgPlainMinionIds: Set<number>): BgCardCategory | null {
  // Duos-exclusive cards are not part of the Solo pool
  if (raw.id.startsWith('BGDUO')) return null;
  if (DUOS_ONLY_IDS.has(raw.id)) return null;

  // Timewarped cards are flagged with battlegroundsTimewarpCard in the card data
  // (not via mechanics).
  if (raw.battlegroundsTimewarpCard) {
    return (raw.techLevel ?? 0) >= 4 ? 'TIMEWARPED_MAJOR' : 'TIMEWARPED_MINOR';
  }

  if (bgPlainMinionIds.has(raw.dbfId) || (raw.battlegroundsNormalDbfId && bgPlainMinionIds.has(raw.battlegroundsNormalDbfId))) return 'TAVERN_MINION';
  if (raw.isBattlegroundsPoolSpell) return 'TAVERN_SPELL';

  const mechs = raw.mechanics ?? [];
  if (raw.battlegroundsHero) return 'HERO';
  // Skin variants: type=HERO + battlegroundsSkinParentId set (battlegroundsHero is null)
  if (raw.type === 'HERO' && raw.battlegroundsSkinParentId) return 'HERO';
  if (raw.isBattlegroundsBuddy) return 'BUDDY';

  // Anomaly cards
  if (mechs.includes('BACON_ACTION_CARD') || mechs.includes('BACON_ANOMALY')) {
    return 'ANOMALY';
  }

  // Quest cards
  if (mechs.includes('QUEST')) return 'QUEST';
  if (mechs.includes('QUESTLINE_PART')) return 'QUEST_REWARD';

  return 'OTHER';
}

/**
 * Hero powers are a special case: they're TYPE=HERO_POWER but need to be
 * linked to a BG hero via heroId. We build a set of valid BG hero IDs first,
 * then accept any HERO_POWER whose heroId is in that set.
 */
export function filterAndProjectCards(rawCards: RawCard[]): BgCard[] {
  // Pass 1: collect BG hero card IDs
  const bgHeroIds = new Set<string>();
  const bgHeroDbfIds = new Set<number>();
  for (const raw of rawCards) {
    if (raw.battlegroundsHero && raw.id) {
      bgHeroIds.add(raw.id);
      bgHeroDbfIds.add(raw.dbfId);
    }
  }
  const bgPlainMinionIds = new Set<number>();
  for (const raw of rawCards) {
    if (raw.isBattlegroundsPoolMinion) {
      bgPlainMinionIds.add(raw.dbfId);
    }
  }

  const results: BgCard[] = [];

  for (const raw of rawCards) {
    if (!raw.id || !raw.name) continue;

    let category = classifyCategory(raw, bgPlainMinionIds);

    // Hero powers: accept if linked hero is a BG hero
    if (
      category === null &&
      raw.type === 'HERO_POWER' &&
      raw.heroId &&
      bgHeroIds.has(raw.heroId)
    ) {
      category = 'HERO_POWER';
    }

    if (category === null) continue;

    const card: BgCard = {
      id: raw.id,
      dbfId: raw.dbfId,
      name: raw.name,
      text: raw.text ? stripHtml(raw.text) : '',
      category,
      cardType: raw.type ?? 'MINION',
      techLevel: raw.techLevel ?? null,
      attack: raw.attack ?? null,
      health: raw.health ?? null,
      cost: raw.cost ?? null,
      armor: raw.armor ?? null,
      races: getRaces(raw),
      golden: !!raw.battlegroundsNormalDbfId,
      heroPowerDbfId: raw.heroPowerDbfId ?? null,
      buddyDbfId: raw.battlegroundsBuddyDbfId ?? null,
      associatedRaces: raw.battlegroundsAssociatedRaces ?? [],
      keywords: extractKeywords(raw, category),
    };

    results.push(card);
  }

  return results;
}
