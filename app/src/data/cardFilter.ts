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
  battlegroundsHero?: boolean;
  isBattlegroundsBuddy?: boolean;
  // Cross-reference dbfIds
  heroPowerDbfId?: number;
  battlegroundsBuddyDbfId?: number;
  battlegroundsSkinParentId?: number;
  // Used to resolve hero powers → parent hero
  heroId?: string;
}

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

/**
 * Attempt to classify a raw card into a BG category.
 * Returns null if the card is not relevant to Battlegrounds.
 */
function classifyCategory(raw: RawCard): BgCardCategory | null {
  if (raw.isBattlegroundsPoolMinion) return 'TAVERN_MINION';
  if (raw.battlegroundsHero) return 'HERO';
  // Skin variants: type=HERO + battlegroundsSkinParentId set (battlegroundsHero is null)
  if (raw.type === 'HERO' && raw.battlegroundsSkinParentId) return 'HERO';
  if (raw.isBattlegroundsBuddy) return 'BUDDY';

  const mechs = raw.mechanics ?? [];

  // Anomaly cards
  if (mechs.includes('BACON_ACTION_CARD') || mechs.includes('BACON_ANOMALY')) {
    return 'ANOMALY';
  }

  // Timewarped cards (major / minor distinguished by techLevel in card data)
  if (mechs.includes('BACON_TIMEWARPED_MAJOR')) return 'TIMEWARPED_MAJOR';
  if (mechs.includes('BACON_TIMEWARPED') || mechs.includes('TIMEWARPED')) {
    // Blizzard uses techLevel >= 4 for "major" — fallback heuristic
    return (raw.techLevel ?? 0) >= 4 ? 'TIMEWARPED_MAJOR' : 'TIMEWARPED_MINOR';
  }

  // Quest cards
  if (mechs.includes('QUEST')) return 'QUEST';
  if (mechs.includes('QUESTLINE_PART')) return 'QUEST_REWARD';

  return null;
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

  const results: BgCard[] = [];

  for (const raw of rawCards) {
    if (!raw.id || !raw.name) continue;

    let category = classifyCategory(raw);

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
      techLevel: raw.techLevel ?? null,
      attack: raw.attack ?? null,
      health: raw.health ?? null,
      cost: raw.cost ?? null,
      armor: raw.armor ?? null,
      races: getRaces(raw),
      heroPowerDbfId: raw.heroPowerDbfId ?? null,
      buddyDbfId: raw.battlegroundsBuddyDbfId ?? null,
      keywords: extractKeywords(raw, category),
    };

    results.push(card);
  }

  return results;
}
