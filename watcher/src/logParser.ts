/**
 * Line-by-line Power.log state machine.
 *
 * Key facts learned from real logs:
 * - GameEntity ID varies per session (e.g. EntityID=4), NOT always 1
 * - BACON_HERO_CAN_BE_DRAFTED appears as an indented block tag, not TAG_CHANGE
 * - Anomaly is BACON_GLOBAL_ANOMALY_DBID in the CREATE_GAME GameEntity block
 * - BG mode detected from COIN_MANA_GEM tag on GameEntity
 */


export type LogEvent =
  | { type: 'GAME_START' }
  | { type: 'BG_MODE_CONFIRMED' }
  | { type: 'HERO_ENTITY'; cardId: string }
  | { type: 'ANOMALY_DBID'; dbfId: number }
  | { type: 'TIMEWARPED_ENTITY'; cardId: string }
  | { type: 'AVAILABLE_RACES'; races: string[] }
  | { type: 'GAME_PHASE'; phase: 'IN_GAME' | 'ENDED' };

// ── Regex patterns ────────────────────────────────────────────────────────────

// Only parse GameState.DebugPrintPower lines (not PowerTaskList)
const POWER_RE = /GameState\.DebugPrintPower\(\) - (.+)$/;

const CREATE_GAME_RE = /^CREATE_GAME$/;

// GameEntity EntityID=N  (inside CREATE_GAME block)
const GAME_ENTITY_RE = /^\s+GameEntity EntityID=(\d+)/;

// FULL_ENTITY - Creating ID=N CardID=X
const FULL_ENTITY_RE = /FULL_ENTITY - Creating ID=(\d+) CardID=(\S+)/;

// SHOW_ENTITY - Updating Entity=... CardID=X
const SHOW_ENTITY_CARDID_RE = /SHOW_ENTITY - Updating Entity=.+? CardID=(\S+)/;

// Indented block tag: "    tag=TAGNAME value=VALUE"
const BLOCK_TAG_RE = /^\s+tag=(\S+) value=(\S+)/;

// TAG_CHANGE (top-level or indented)
const TAG_CHANGE_RE = /TAG_CHANGE Entity=(.+?) tag=(\S+) value=(\S+)/;

// Extract entity ID from either a bare number or "[entityName=... id=N ...]"
function extractEntityId(ref: string): string {
  if (/^\d+$/.test(ref)) return ref;
  const m = /\bid=(\d+)\b/.exec(ref);
  return m ? m[1] : '';
}

// Extract cardId from entity reference "[entityName=... cardId=X ...]"
function extractCardId(ref: string): string {
  const m = /\bcardId=(\S+?)\s/.exec(ref);
  return m ? m[1] : '';
}

// ── Mutable parser state (reset on CREATE_GAME) ───────────────────────────────

let gameEntityId = '';              // entity ID of the GameEntity for this session
let currentCardId = '';             // card ID of current FULL_ENTITY block
let currentEntityIsPoolMinion = false;
let currentEntitySubsets: string[] = []; // BACON_SUBSET tribes seen on current entity
const availableRaceSet = new Set<string>(); // tribes confirmed for this game

// BACON_SUBSET_* tag suffix → HearthstoneJSON race string
const BACON_SUBSET_TO_RACE: Record<string, string> = {
  BEAST:      'BEAST',
  DEMON:      'DEMON',
  DRAGON:     'DRAGON',
  ELEMENTALS: 'ELEMENTAL',
  MECH:       'MECHANICAL',
  MURLOC:     'MURLOC',
  NAGA:       'NAGA',
  PIRATE:     'PIRATE',
  QUILLBOAR:  'QUILBOAR',
  UNDEAD:     'UNDEAD',
};

const PLACEHOLDER_HERO_ID = 'TB_BaconShop_HERO_PH';

function isBgHeroCardId(cardId: string): boolean {
  if (!cardId || cardId === PLACEHOLDER_HERO_ID) return false;
  return (
    /^BG\d+_HERO_/.test(cardId) ||
    /^TB_BaconShop_HERO_\d+/.test(cardId)
  );
}

// Called at each entity boundary. If the previous entity was a pure single-tribe
// pool minion, add that tribe to the available set.
function flushEntitySubsets(): string | null {
  if (currentEntityIsPoolMinion && currentEntitySubsets.length === 1) {
    const race = BACON_SUBSET_TO_RACE[currentEntitySubsets[0]];
    if (race && !availableRaceSet.has(race)) {
      availableRaceSet.add(race);
      return race;
    }
  }
  currentEntityIsPoolMinion = false;
  currentEntitySubsets = [];
  return null;
}

function resetState(): void {
  gameEntityId = '';
  currentCardId = '';
  currentEntityIsPoolMinion = false;
  currentEntitySubsets = [];
  availableRaceSet.clear();
}

// ── Main parse function ───────────────────────────────────────────────────────

export function parseLine(line: string): LogEvent | null {
  const powerMatch = POWER_RE.exec(line);
  if (!powerMatch) return null;

  const raw = powerMatch[1]; // preserve leading whitespace
  const content = raw.trim();

  try {
    // ── CREATE_GAME ───────────────────────────────────────────────────────────
    if (CREATE_GAME_RE.test(content)) {
      resetState();
      return { type: 'GAME_START' };
    }

    // ── GameEntity EntityID=N (inside CREATE_GAME) ────────────────────────────
    const gameEntityMatch = GAME_ENTITY_RE.exec(raw);
    if (gameEntityMatch) {
      gameEntityId = gameEntityMatch[1];
      return null;
    }

    // ── FULL_ENTITY - Creating ────────────────────────────────────────────────
    const fullEntityMatch = FULL_ENTITY_RE.exec(content);
    if (fullEntityMatch) {
      const newRace = flushEntitySubsets();
      currentCardId = fullEntityMatch[2];
      currentEntityIsPoolMinion = false;
      currentEntitySubsets = [];
      if (newRace) return { type: 'AVAILABLE_RACES', races: Array.from(availableRaceSet) };
      return null;
    }

    // ── SHOW_ENTITY ───────────────────────────────────────────────────────────
    const showEntityMatch = SHOW_ENTITY_CARDID_RE.exec(content);
    if (showEntityMatch) {
      const newRace = flushEntitySubsets();
      currentCardId = showEntityMatch[1];
      currentEntityIsPoolMinion = false;
      currentEntitySubsets = [];
      if (newRace) return { type: 'AVAILABLE_RACES', races: Array.from(availableRaceSet) };
      return null;
    }

    // ── Indented block tags (tag=X value=Y within a FULL_ENTITY/GameEntity block)
    const blockTagMatch = BLOCK_TAG_RE.exec(raw);
    if (blockTagMatch) {
      const [, tagName, tagValue] = blockTagMatch;

      // BG mode detection: COIN_MANA_GEM on GameEntity
      if (tagName === 'COIN_MANA_GEM' && tagValue === '1') {
        return { type: 'BG_MODE_CONFIRMED' };
      }

      if (tagName === 'BACON_GLOBAL_ANOMALY_DBID' && tagValue !== '0') {
        return { type: 'ANOMALY_DBID', dbfId: parseInt(tagValue, 10) };
      }

      // (BACON_HERO_CAN_BE_DRAFTED marks offered choices, not playing heroes — ignored)

      // PLAYER_LEADERBOARD_PLACE in a hero FULL_ENTITY block = this hero is actually playing.
      // This is the universal signal (tag=3026 only appears for heroes with a tribe bonus,
      // so Patchwerk and others without tribe bonuses are missed without this).
      if (tagName === 'PLAYER_LEADERBOARD_PLACE' && currentCardId && isBgHeroCardId(currentCardId)) {
        return { type: 'HERO_ENTITY', cardId: currentCardId };
      }

      // Timewarped: BACON_TIMEWARPED within a FULL_ENTITY
      if (tagName === 'BACON_TIMEWARPED' && tagValue === '1' && currentCardId) {
        return { type: 'TIMEWARPED_ENTITY', cardId: currentCardId };
      }

      // IS_BACON_POOL_MINION marks this entity as a pool minion — subsequent BACON_SUBSET_*
      // tags on the same entity tell us which tribe is in the pool this game.
      if (tagName === 'IS_BACON_POOL_MINION' && tagValue === '1') {
        currentEntityIsPoolMinion = true;
        return null;
      }

      // Accumulate BACON_SUBSET_<TRIBE> tags on pool minions.
      // We only confirm a tribe after the entity block closes (in flushEntitySubsets),
      // requiring exactly one BACON_SUBSET tag — dual-tribe minions are excluded.
      if (currentEntityIsPoolMinion && tagValue === '1' && tagName.startsWith('BACON_SUBSET_')) {
        currentEntitySubsets.push(tagName.slice('BACON_SUBSET_'.length));
      }

      return null;
    }

    // ── TAG_CHANGE ────────────────────────────────────────────────────────────
    const tagMatch = TAG_CHANGE_RE.exec(content);
    if (tagMatch) {
      const [, entityRef, tag, value] = tagMatch;
      const entityId = extractEntityId(entityRef);

      // Game-level tags on the GameEntity (referenced by ID or by name "GameEntity")
      const isGameEntity = entityRef === 'GameEntity' || (gameEntityId !== '' && entityId === gameEntityId);
      if (isGameEntity) {
        if (tag === 'NEXT_STEP' && value === 'FINAL_GAMEOVER') {
          return { type: 'GAME_PHASE', phase: 'ENDED' };
        }
        if (tag === 'NEXT_STEP' && value === 'MAIN_ACTION') {
          return { type: 'GAME_PHASE', phase: 'IN_GAME' };
        }
      }

      // tag=3026 on a BG hero entity = that hero is actually playing in this game
      if (tag === '3026') {
        const cardId = extractCardId(entityRef);
        if (cardId && isBgHeroCardId(cardId)) {
          return { type: 'HERO_ENTITY', cardId };
        }
      }

      // BACON_TIMEWARPED as TAG_CHANGE (in-game reveals)
      if (tag === 'BACON_TIMEWARPED' && value === '1') {
        const cardId = extractCardId(entityRef) || currentCardId;
        if (cardId) return { type: 'TIMEWARPED_ENTITY', cardId };
      }

      return null;
    }
  } catch {
    // Never crash on a bad line
  }

  return null;
}
