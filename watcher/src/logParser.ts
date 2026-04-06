/**
 * Line-by-line Power.log state machine.
 *
 * Key facts learned from real logs:
 * - GameEntity ID varies per session (e.g. EntityID=4), NOT always 1
 * - BACON_HERO_CAN_BE_DRAFTED appears as an indented block tag, not TAG_CHANGE
 * - Anomaly is BACON_GLOBAL_ANOMALY_DBID in the CREATE_GAME GameEntity block
 * - BG mode detected from COIN_MANA_GEM tag on GameEntity
 * - Player blocks in CREATE_GAME map PlayerID → HERO_ENTITY value (hero entity ID)
 * - Hero entity ID → heroCardId from FULL_ENTITY Creating
 * - Board minions: ZONE=PLAY, CONTROLLER=playerID, tracked via FULL_ENTITY + TAG_CHANGE
 */

import type { BoardMinion } from './types';

export type LogEvent =
  | { type: 'GAME_START' }
  | { type: 'BG_MODE_CONFIRMED' }
  | { type: 'HERO_ENTITY'; cardId: string }
  | { type: 'ANOMALY_DBID'; dbfId: number }
  | { type: 'TIMEWARPED_ENTITY'; cardId: string }
  | { type: 'AVAILABLE_RACES'; races: string[] }
  | { type: 'RACE_CONSTRAINT'; races: string[] }
  | { type: 'GAME_PHASE'; phase: 'IN_GAME' | 'ENDED' }
  | { type: 'PLAYER_PLACEMENT'; heroCardId: string; placement: number }
  | { type: 'PLAYER_BOARD'; heroCardId: string; minions: BoardMinion[]; turn: number };

// ── Regex patterns ────────────────────────────────────────────────────────────

// Only parse GameState.DebugPrintPower lines (not PowerTaskList)
const POWER_RE = /GameState\.DebugPrintPower\(\) - (.+)$/;

const CREATE_GAME_RE = /^CREATE_GAME$/;

// GameEntity EntityID=N  (inside CREATE_GAME block)
const GAME_ENTITY_RE = /^\s+GameEntity EntityID=(\d+)/;

// Player EntityID=N PlayerID=M  (inside CREATE_GAME block)
const PLAYER_BLOCK_RE = /^\s+Player EntityID=(\d+) PlayerID=(\d+)/;

// FULL_ENTITY - Creating ID=N CardID=X
const FULL_ENTITY_RE = /FULL_ENTITY - Creating ID=(\d+) CardID=(\S*)/;

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

// ── Entity accumulation (per FULL_ENTITY block) ───────────────────────────────
let currentEntityId = '';
let currentEntityController = '';
let currentEntityZone = '';
let currentEntityAtk = 0;
let currentEntityHealth = 0;
let currentEntityCardType = '';
let currentEntityZonePos = 0;

// ── Player/hero mapping ───────────────────────────────────────────────────────
let inPlayerBlock = false;
let currentPlayerId = '';          // PlayerID of the Player block being parsed
let bobPlayerId = '';              // PlayerID of BACON_DUMMY_PLAYER (Bob)
const playerIdToHeroEntityId = new Map<string, string>(); // PlayerID → hero entity ID
const heroEntityIdToCardId = new Map<string, string>();   // hero entity ID → heroCardId

// ── Board state ───────────────────────────────────────────────────────────────
interface BoardEntry {
  cardId: string;
  controller: string;
  zone: string;
  atk: number;
  health: number;
  zonePos: number;
}
// Live board: entities currently in ZONE=PLAY for players (not Bob)
const boardEntities = new Map<string, BoardEntry>();
// Snapshots: heroCardId → array of BoardEntry (preserved through combat deaths)
const boardSnapshots = new Map<string, Map<string, BoardEntry>>();

// ── Phase tracking ────────────────────────────────────────────────────────────
let inCombat = false;
let currentTurn = 0;

// ── BACON_SUBSET_* tag suffix → HearthstoneJSON race string ──────────────────
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

// ── Pool minion flush ─────────────────────────────────────────────────────────

type FlushResult =
  | { kind: 'confirmed'; race: string }
  | { kind: 'constraint'; races: string[] }
  | null;

function flushEntitySubsets(): FlushResult {
  if (currentEntityIsPoolMinion) {
    if (currentEntitySubsets.length === 1) {
      const race = BACON_SUBSET_TO_RACE[currentEntitySubsets[0]];
      if (race && !availableRaceSet.has(race)) {
        availableRaceSet.add(race);
        currentEntityIsPoolMinion = false;
        currentEntitySubsets = [];
        return { kind: 'confirmed', race };
      }
    } else if (currentEntitySubsets.length === 2) {
      const a = BACON_SUBSET_TO_RACE[currentEntitySubsets[0]];
      const b = BACON_SUBSET_TO_RACE[currentEntitySubsets[1]];
      if (a && b) {
        currentEntityIsPoolMinion = false;
        currentEntitySubsets = [];
        return { kind: 'constraint', races: [a, b] };
      }
    }
  }
  currentEntityIsPoolMinion = false;
  currentEntitySubsets = [];
  return null;
}

// ── Board entity tracking ─────────────────────────────────────────────────────

/** Look up the heroCardId for a given player ID string. */
function heroCardIdForPlayerId(playerId: string): string | null {
  const heroEntityId = playerIdToHeroEntityId.get(playerId);
  if (!heroEntityId) return null;
  return heroEntityIdToCardId.get(heroEntityId) ?? null;
}

/** Build a BoardMinion[] from a snapshot map, sorted by position. */
function snapshotToMinions(snapshot: Map<string, BoardEntry>): BoardMinion[] {
  return Array.from(snapshot.values())
    .filter((e) => e.zone === 'PLAY')
    .sort((a, b) => a.zonePos - b.zonePos)
    .map((e) => ({
      cardId: e.cardId,
      attack: e.atk,
      health: e.health,
      position: e.zonePos,
    }));
}

/**
 * Called when a new FULL_ENTITY starts (or at entity boundary).
 * Records hero entity ID→cardId mapping and upserts board entries.
 * Returns heroCardId if a board snapshot changed, else null.
 */
function flushEntityInfo(): string | null {
  if (!currentEntityId) return null;

  // Record hero entity ID → cardId mapping
  if (isBgHeroCardId(currentCardId)) {
    heroEntityIdToCardId.set(currentEntityId, currentCardId);
  }

  // Track board minions: ZONE=PLAY, controller is a real player (not Bob, not unknown)
  if (
    currentEntityCardType === 'MINION' &&
    currentEntityZone === 'PLAY' &&
    currentEntityController !== '' &&
    currentEntityController !== bobPlayerId
  ) {
    const entry: BoardEntry = {
      cardId: currentCardId,
      controller: currentEntityController,
      zone: 'PLAY',
      atk: currentEntityAtk,
      health: currentEntityHealth,
      zonePos: currentEntityZonePos,
    };
    boardEntities.set(currentEntityId, entry);

    const heroCardId = heroCardIdForPlayerId(currentEntityController);
    if (heroCardId) {
      if (!boardSnapshots.has(heroCardId)) {
        boardSnapshots.set(heroCardId, new Map());
      }
      boardSnapshots.get(heroCardId)!.set(currentEntityId, { ...entry });
      return heroCardId;
    }
  }

  return null;
}

/** Reset all entity accumulator variables (not the maps). */
function resetEntityAccumulators(): void {
  currentEntityId = '';
  currentEntityController = '';
  currentEntityZone = '';
  currentEntityAtk = 0;
  currentEntityHealth = 0;
  currentEntityCardType = '';
  currentEntityZonePos = 0;
}

function resetState(): void {
  gameEntityId = '';
  currentCardId = '';
  currentEntityIsPoolMinion = false;
  currentEntitySubsets = [];
  availableRaceSet.clear();
  resetEntityAccumulators();
  inPlayerBlock = false;
  currentPlayerId = '';
  bobPlayerId = '';
  playerIdToHeroEntityId.clear();
  heroEntityIdToCardId.clear();
  boardEntities.clear();
  boardSnapshots.clear();
  inCombat = false;
  currentTurn = 0;
}

// ── Main parse function ───────────────────────────────────────────────────────

export function parseLine(line: string): LogEvent[] {
  const powerMatch = POWER_RE.exec(line);
  if (!powerMatch) return [];

  const raw = powerMatch[1]; // preserve leading whitespace
  const content = raw.trim();

  try {
    // ── CREATE_GAME ───────────────────────────────────────────────────────────
    if (CREATE_GAME_RE.test(content)) {
      resetState();
      return [{ type: 'GAME_START' }];
    }

    // ── GameEntity EntityID=N (inside CREATE_GAME) ────────────────────────────
    const gameEntityMatch = GAME_ENTITY_RE.exec(raw);
    if (gameEntityMatch) {
      gameEntityId = gameEntityMatch[1];
      inPlayerBlock = false;
      return [];
    }

    // ── Player EntityID=N PlayerID=M (inside CREATE_GAME) ────────────────────
    const playerBlockMatch = PLAYER_BLOCK_RE.exec(raw);
    if (playerBlockMatch) {
      inPlayerBlock = true;
      currentPlayerId = playerBlockMatch[2];
      return [];
    }

    // ── FULL_ENTITY - Creating ────────────────────────────────────────────────
    const fullEntityMatch = FULL_ENTITY_RE.exec(content);
    if (fullEntityMatch) {
      const events: LogEvent[] = [];

      // Flush previous entity info (board tracking)
      const changedHero = flushEntityInfo();
      if (changedHero) {
        events.push({
          type: 'PLAYER_BOARD',
          heroCardId: changedHero,
          minions: snapshotToMinions(boardSnapshots.get(changedHero)!),
          turn: currentTurn,
        });
      }

      // Flush pool minion subsets
      const flush = flushEntitySubsets();
      if (flush?.kind === 'confirmed') {
        events.push({ type: 'AVAILABLE_RACES', races: Array.from(availableRaceSet) });
      } else if (flush?.kind === 'constraint') {
        events.push({ type: 'RACE_CONSTRAINT', races: flush.races });
      }

      // Reset accumulators for the new entity
      resetEntityAccumulators();
      currentEntityId = fullEntityMatch[1];
      currentCardId = fullEntityMatch[2];
      inPlayerBlock = false;

      return events;
    }

    // ── SHOW_ENTITY ───────────────────────────────────────────────────────────
    const showEntityMatch = SHOW_ENTITY_CARDID_RE.exec(content);
    if (showEntityMatch) {
      const events: LogEvent[] = [];

      const changedHero = flushEntityInfo();
      if (changedHero) {
        events.push({
          type: 'PLAYER_BOARD',
          heroCardId: changedHero,
          minions: snapshotToMinions(boardSnapshots.get(changedHero)!),
          turn: currentTurn,
        });
      }

      const flush = flushEntitySubsets();
      if (flush?.kind === 'confirmed') {
        events.push({ type: 'AVAILABLE_RACES', races: Array.from(availableRaceSet) });
      } else if (flush?.kind === 'constraint') {
        events.push({ type: 'RACE_CONSTRAINT', races: flush.races });
      }

      resetEntityAccumulators();
      currentCardId = showEntityMatch[1];
      inPlayerBlock = false;

      return events;
    }

    // ── Indented block tags (tag=X value=Y within a FULL_ENTITY/GameEntity/Player block)
    const blockTagMatch = BLOCK_TAG_RE.exec(raw);
    if (blockTagMatch) {
      const [, tagName, tagValue] = blockTagMatch;

      // ── Tags inside a Player EntityID block ──────────────────────────────
      if (inPlayerBlock) {
        if (tagName === 'HERO_ENTITY') {
          // Maps PlayerID → hero entity ID
          playerIdToHeroEntityId.set(currentPlayerId, tagValue);
        } else if (tagName === 'BACON_DUMMY_PLAYER' && tagValue === '1') {
          // Bob's player ID — used to exclude his tavern minions from board tracking
          bobPlayerId = currentPlayerId;
        }
        return [];
      }

      // ── Tags inside a FULL_ENTITY block ──────────────────────────────────
      if (currentEntityId) {
        switch (tagName) {
          case 'CONTROLLER':   currentEntityController = tagValue; break;
          case 'ZONE':         currentEntityZone = tagValue; break;
          case 'CARDTYPE':     currentEntityCardType = tagValue; break;
          case 'ATK':          currentEntityAtk = parseInt(tagValue, 10); break;
          case 'HEALTH':       currentEntityHealth = parseInt(tagValue, 10); break;
          case 'ZONE_POSITION': currentEntityZonePos = parseInt(tagValue, 10); break;
        }
      }

      // ── GameEntity block tags ─────────────────────────────────────────────
      if (tagName === 'COIN_MANA_GEM' && tagValue === '1') {
        return [{ type: 'BG_MODE_CONFIRMED' }];
      }

      if (tagName === 'BACON_GLOBAL_ANOMALY_DBID' && tagValue !== '0') {
        return [{ type: 'ANOMALY_DBID', dbfId: parseInt(tagValue, 10) }];
      }

      // PLAYER_LEADERBOARD_PLACE in a hero FULL_ENTITY block = this hero is actually playing.
      // Guard: not inside a Player block (where HERO_ENTITY tag has a different meaning).
      if (tagName === 'PLAYER_LEADERBOARD_PLACE' && currentCardId && isBgHeroCardId(currentCardId)) {
        return [{ type: 'HERO_ENTITY', cardId: currentCardId }];
      }

      // Timewarped: BACON_TIMEWARPED within a FULL_ENTITY
      if (tagName === 'BACON_TIMEWARPED' && tagValue === '1' && currentCardId) {
        return [{ type: 'TIMEWARPED_ENTITY', cardId: currentCardId }];
      }

      // IS_BACON_POOL_MINION marks this entity as a pool minion
      if (tagName === 'IS_BACON_POOL_MINION' && tagValue === '1') {
        currentEntityIsPoolMinion = true;
        return [];
      }

      // Accumulate BACON_SUBSET_<TRIBE> tags on pool minions.
      if (currentEntityIsPoolMinion && tagValue === '1' && tagName.startsWith('BACON_SUBSET_')) {
        currentEntitySubsets.push(tagName.slice('BACON_SUBSET_'.length));
      }

      return [];
    }

    // ── TAG_CHANGE ────────────────────────────────────────────────────────────
    const tagMatch = TAG_CHANGE_RE.exec(content);
    if (tagMatch) {
      const [, entityRef, tag, value] = tagMatch;
      const entityId = extractEntityId(entityRef);

      // Game-level tags on the GameEntity
      const isGameEntity = entityRef === 'GameEntity' || (gameEntityId !== '' && entityId === gameEntityId);
      if (isGameEntity) {
        if (tag === 'NEXT_STEP' && value === 'FINAL_GAMEOVER') {
          return [{ type: 'GAME_PHASE', phase: 'ENDED' }];
        }
        if (tag === 'NEXT_STEP' && value === 'MAIN_ACTION') {
          return [{ type: 'GAME_PHASE', phase: 'IN_GAME' }];
        }
        if (tag === 'NUM_TURNS_IN_PLAY') {
          currentTurn = parseInt(value, 10);
          return [];
        }
      }

      // Combat phase tracking (BACON_CURRENT_COMBAT_PLAYER_ID on player entities)
      if (tag === 'BACON_CURRENT_COMBAT_PLAYER_ID') {
        inCombat = value !== '0';
        return [];
      }

      // tag=3026 on a BG hero entity = that hero is actually playing in this game
      if (tag === '3026') {
        const cardId = extractCardId(entityRef);
        if (cardId && isBgHeroCardId(cardId)) {
          return [{ type: 'HERO_ENTITY', cardId }];
        }
      }

      // PLAYER_LEADERBOARD_PLACE on hero bracket reference = placement update
      if (tag === 'PLAYER_LEADERBOARD_PLACE') {
        const cardId = extractCardId(entityRef);
        if (cardId && isBgHeroCardId(cardId)) {
          return [{
            type: 'PLAYER_PLACEMENT',
            heroCardId: cardId,
            placement: parseInt(value, 10),
          }];
        }
      }

      // BACON_TIMEWARPED as TAG_CHANGE (in-game reveals)
      if (tag === 'BACON_TIMEWARPED' && value === '1') {
        const cardId = extractCardId(entityRef) || currentCardId;
        if (cardId) return [{ type: 'TIMEWARPED_ENTITY', cardId }];
      }

      // Board entity stat/zone updates
      if (entityId && boardEntities.has(entityId)) {
        const entry = boardEntities.get(entityId)!;

        if (tag === 'ATK' || tag === 'HEALTH') {
          const numVal = parseInt(value, 10);
          if (tag === 'ATK') entry.atk = numVal;
          else entry.health = numVal;

          // Update snapshot and emit
          const heroCardId = heroCardIdForPlayerId(entry.controller);
          if (heroCardId && boardSnapshots.has(heroCardId)) {
            const snap = boardSnapshots.get(heroCardId)!;
            if (snap.has(entityId)) {
              const snapEntry = snap.get(entityId)!;
              if (tag === 'ATK') snapEntry.atk = numVal;
              else snapEntry.health = numVal;
              return [{
                type: 'PLAYER_BOARD',
                heroCardId,
                minions: snapshotToMinions(snap),
                turn: currentTurn,
              }];
            }
          }
          return [];
        }

        if (tag === 'ZONE') {
          const prevZone = entry.zone;
          entry.zone = value;

          if (value === 'PLAY') {
            // Minion entered play (e.g. reborn spawn)
            const heroCardId = heroCardIdForPlayerId(entry.controller);
            if (heroCardId) {
              if (!boardSnapshots.has(heroCardId)) boardSnapshots.set(heroCardId, new Map());
              const snap = boardSnapshots.get(heroCardId)!;
              snap.set(entityId, { ...entry });
              return [{
                type: 'PLAYER_BOARD',
                heroCardId,
                minions: snapshotToMinions(snap),
                turn: currentTurn,
              }];
            }
          } else if (prevZone === 'PLAY') {
            // Minion left play
            boardEntities.delete(entityId);
            const heroCardId = heroCardIdForPlayerId(entry.controller);
            if (heroCardId && boardSnapshots.has(heroCardId)) {
              if (!inCombat) {
                // Recruit phase: remove from snapshot (sold/discarded)
                boardSnapshots.get(heroCardId)!.delete(entityId);
                return [{
                  type: 'PLAYER_BOARD',
                  heroCardId,
                  minions: snapshotToMinions(boardSnapshots.get(heroCardId)!),
                  turn: currentTurn,
                }];
              }
              // Combat phase: don't remove from snapshot (preserve pre-combat board)
            }
          }
          return [];
        }

        if (tag === 'ZONE_POSITION') {
          entry.zonePos = parseInt(value, 10);
          const heroCardId = heroCardIdForPlayerId(entry.controller);
          if (heroCardId && boardSnapshots.has(heroCardId)) {
            const snap = boardSnapshots.get(heroCardId)!;
            if (snap.has(entityId)) {
              snap.get(entityId)!.zonePos = entry.zonePos;
            }
          }
          return [];
        }
      }

      // New minion entering play via TAG_CHANGE (not from a FULL_ENTITY block we saw)
      // Handle CONTROLLER change (buy from tavern: Bob's entity → player's)
      if (tag === 'CONTROLLER' && entityId) {
        // Check if this entity is in boardEntities under old controller
        const existing = boardEntities.get(entityId);
        if (existing) {
          const oldHeroCardId = heroCardIdForPlayerId(existing.controller);
          // Remove from old hero's snapshot
          if (oldHeroCardId && boardSnapshots.has(oldHeroCardId)) {
            boardSnapshots.get(oldHeroCardId)!.delete(entityId);
          }
          existing.controller = value;
          // If new controller is a real player, add to their snapshot
          if (value !== bobPlayerId && value !== '') {
            const newHeroCardId = heroCardIdForPlayerId(value);
            if (newHeroCardId) {
              if (!boardSnapshots.has(newHeroCardId)) boardSnapshots.set(newHeroCardId, new Map());
              boardSnapshots.get(newHeroCardId)!.set(entityId, { ...existing });
            }
          }
        }
      }

      return [];
    }
  } catch {
    // Never crash on a bad line
  }

  return [];
}
