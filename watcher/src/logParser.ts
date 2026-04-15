/**
 * Line-by-line Power.log state machine.
 *
 * Key facts learned from real logs:
 * - GameEntity ID varies per session (e.g. EntityID=16, not 1)
 * - In CREATE_GAME there are only 2 Player blocks: the local player + Bob (BACON_DUMMY_PLAYER)
 * - Hero-choice FULL_ENTITY blocks appear with CONTROLLER=<local player ID>;
 *   the HERO_ENTITY tag in the Player block points to the placeholder (TB_BaconShop_HERO_PH)
 * - Opponent identity: BACON_CURRENT_COMBAT_PLAYER_ID fires with the opponent's BG slot,
 *   which maps via bgSlotToHeroCardId to their heroCardId (currentOpponentHeroCardId)
 * - Bug A fix: PLAYER_LEADERBOARD_PLACE in a FULL_ENTITY block is captured as the initial placement
 * - FULL_ENTITY block tags are indented; any non-indented line (top-level TAG_CHANGE, etc.)
 *   terminates the current open entity block and triggers a flush
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

const POWER_RE = /GameState\.DebugPrintPower\(\) - (.+)$/;
const CREATE_GAME_RE = /^CREATE_GAME$/;
const GAME_ENTITY_RE = /^\s+GameEntity EntityID=(\d+)/;
const PLAYER_BLOCK_RE = /^\s+Player EntityID=(\d+) PlayerID=(\d+)/;
const FULL_ENTITY_RE = /FULL_ENTITY - Creating ID=(\d+) CardID=(\S*)/;
const SHOW_ENTITY_CARDID_RE = /SHOW_ENTITY - Updating Entity=.+? CardID=(\S+)/;
/** Matches only indented block tags inside a FULL_ENTITY/Player/GameEntity block */
const BLOCK_TAG_RE = /^\s+tag=(\S+) value=(\S+)/;
const TAG_CHANGE_RE = /TAG_CHANGE Entity=(.+?) tag=(\S+) value=(\S+)/;

function extractEntityId(ref: string): string {
  if (/^\d+$/.test(ref)) return ref;
  const m = /\bid=(\d+)\b/.exec(ref);
  return m ? m[1] : '';
}

function extractCardId(ref: string): string {
  const m = /\bcardId=(\S+?)\s/.exec(ref);
  return m ? m[1] : '';
}

// ── BACON_SUBSET_* → race string ─────────────────────────────────────────────
const BACON_SUBSET_TO_RACE: Record<string, string> = {
  BEAST: 'BEAST',
  DEMON: 'DEMON',
  DRAGON: 'DRAGON',
  ELEMENTALS: 'ELEMENTAL',
  MECH: 'MECHANICAL',
  MURLOC: 'MURLOC',
  NAGA: 'NAGA',
  PIRATE: 'PIRATE',
  QUILLBOAR: 'QUILBOAR',
  UNDEAD: 'UNDEAD',
};

const PLACEHOLDER_HERO_ID = 'TB_BaconShop_HERO_PH';
const BOB_CARD_ID = 'TB_BaconShopBob';

function isBgHeroCardId(cardId: string): boolean {
  if (!cardId || cardId === PLACEHOLDER_HERO_ID || cardId === BOB_CARD_ID) return false;
  // Use a lookahead (?=$|[^a-z0-9]) so that \d+ cannot backtrack and allow a
  // trailing digit to satisfy [^a-z]. This correctly excludes hero powers like
  // BG24_HERO_204p (p is a-z → fails) and BG24_HERO_204pe6 (p is a-z → fails)
  // while accepting BG24_HERO_204 (end-of-string), BG24_HERO_204_SKIN_E (_ is [^a-z0-9]),
  // TB_BaconShop_HERO_43_SKIN_G, TB_BaconShop_HERO_93, etc.
  return /^BG\d+_HERO_\d+(?=$|[^a-z0-9])/.test(cardId) ||
    /^TB_BaconShop_HERO_\d+(?=$|[^a-z0-9])/.test(cardId);
}

// ── Parser state (reset on CREATE_GAME) ──────────────────────────────────────

let gameEntityId = '';

// Pool-minion accumulation
let currentEntityIsPoolMinion = false;
let currentEntitySubsets: string[] = [];
const availableRaceSet = new Set<string>();

// Current FULL_ENTITY / SHOW_ENTITY being accumulated
let currentEntityId = '';
let currentCardId = '';
let currentEntityController = '';
let currentEntityZone = '';
let currentEntityAtk = 0;
let currentEntityHealth = 0;
let currentEntityCardType = '';
let currentEntityZonePos = 0;
let currentEntityBgSlot = '';           // PLAYER_ID block tag (hero's BG slot 1-8)
let currentEntityInitialPlacement = 0; // Bug A: PLAYER_LEADERBOARD_PLACE from block
let currentEntityIsHero = false;        // BACON_HERO_CAN_BE_DRAFTED=1 seen
let currentEntityCopiedFrom = '';       // COPIED_FROM_ENTITY_ID from block tags

// Player block state (CREATE_GAME only)
let inPlayerBlock = false;
let currentPlayerId = '';
let firstPlayerBlockId = '';  // ID of the first Player block seen; used to derive localPlayerBgSlot
/** Controller ID of the opponent slot (always the local player's controller + 8 in practice) */
let opponentController = '';

// ── Hero → opponent mapping ───────────────────────────────────────────────────
/** BG slot (PLAYER_ID tag) → heroCardId */
const bgSlotToHeroCardId = new Map<string, string>();
/** BG slot of the local player — used to skip their BACON_CURRENT_COMBAT_PLAYER_ID firing */
let localPlayerBgSlot = '';
/** heroCardId of whoever is currently fighting the local player (controller 14) */
let currentOpponentHeroCardId = '';

// ── Board state ───────────────────────────────────────────────────────────────
interface BoardEntry {
  cardId: string;
  controller: string;
  bgSlot: string;
  zone: string;
  atk: number;
  health: number;
  zonePos: number;
}
const boardEntities = new Map<string, BoardEntry>();
const boardSnapshots = new Map<string, Map<string, BoardEntry>>();

/**
 * Stores stats for ALL FULL_ENTITY MINION blocks regardless of initial zone.
 * Used to seed boardEntities when a ZONE=PLAY TAG_CHANGE fires for an entity
 * that started in SETASIDE or HAND (tavern-bought minions).
 */
const entityRegistry = new Map<string, BoardEntry>();

/**
 * Maps entityId → the entityId it was COPIED_FROM (board-reset copies).
 * Used to evict the source entity from snapshots when the copy enters PLAY,
 * preventing stale reset-source entries from accumulating in the snapshot.
 */
const copiedFromMap = new Map<string, string>();

// ── Phase tracking ────────────────────────────────────────────────────────────
let inCombat = false;
let currentTurn = 0;
/**
 * Tracks which opponent heroCardIds have had their snapshot cleared (and started
 * fresh) during the current combat. Reset each time a new combat begins.
 * Ensures stale data from a prior encounter is evicted before the first new entry.
 */
const combatFreshenedHeroes = new Set<string>();

/**
 * Tracks which opponent heroCardIds have had their snapshot sealed against new
 * entity additions. Sealing happens when any minion's ATTACKING tag is set to 1
 * during combat — i.e. the first actual attack. This fires after START_OF_COMBAT
 * and Rally summons (which should be part of the snapshot) but before any
 * deathrattle summons (which should not), making it the correct boundary.
 */
const snapshotSealedHeroes = new Set<string>();

// ── Helpers ───────────────────────────────────────────────────────────────────

function heroCardIdForEntry(entry: BoardEntry): string | null {
  if (entry.controller !== opponentController) return null;
  return currentOpponentHeroCardId || null;
}

function snapshotToMinions(snapshot: Map<string, BoardEntry>): BoardMinion[] {
  let uniquePositionedMinions = new Map(Array.from(snapshot.values()).filter((e) => e.zone === 'PLAY').map(e => [e.zonePos, e]));
  return Array.from(uniquePositionedMinions.values())
    .sort((a, b) => a.zonePos - b.zonePos)
    .map((e) => ({ cardId: e.cardId, attack: e.atk, health: e.health, position: e.zonePos }));
}

/**
 * When a board-reset copy enters PLAY, evict its source entity from all
 * snapshots and boardEntities so it doesn't linger as a stale duplicate.
 */
function evictCopySource(sourceId: string): void {
  boardEntities.delete(sourceId);
  for (const snap of boardSnapshots.values()) {
    snap.delete(sourceId);
  }
}

// ── Entity flush ──────────────────────────────────────────────────────────────

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

/**
 * Flush the current FULL_ENTITY accumulator state and return any events to emit.
 * Called at every entity boundary (new FULL_ENTITY, new SHOW_ENTITY, or any
 * non-indented top-level line).
 */
function flushCurrentEntity(): LogEvent[] {
  if (!currentEntityId && !currentEntityIsHero) return [];
  const events: LogEvent[] = [];

  // Hero BG-slot mapping
  if (isBgHeroCardId(currentCardId)) {
    if (currentEntityBgSlot) {
      bgSlotToHeroCardId.set(currentEntityBgSlot, currentCardId);
    }
  }

  // Hero events (Bug A fix: emit HERO_ENTITY + initial placement from block)
  if (currentEntityIsHero && isBgHeroCardId(currentCardId)) {
    events.push({ type: 'HERO_ENTITY', cardId: currentCardId });
    if (currentEntityInitialPlacement > 0) {
      events.push({
        type: 'PLAYER_PLACEMENT',
        heroCardId: currentCardId,
        placement: currentEntityInitialPlacement,
      });
    }
  }

  // Pool-minion tribe detection
  const flush = flushEntitySubsets();
  if (flush?.kind === 'confirmed') {
    events.push({ type: 'AVAILABLE_RACES', races: Array.from(availableRaceSet) });
  } else if (flush?.kind === 'constraint') {
    events.push({ type: 'RACE_CONSTRAINT', races: flush.races });
  }

  // Board minion tracking
  if (currentEntityId && currentEntityCardType === 'MINION') {
    const entry: BoardEntry = {
      cardId: currentCardId,
      controller: currentEntityController,
      bgSlot: currentEntityBgSlot,
      zone: currentEntityZone,
      atk: currentEntityAtk,
      health: currentEntityHealth,
      zonePos: currentEntityZonePos,
    };

    // Always register every MINION entity so that ZONE=PLAY TAG_CHANGE events
    // can look up stats for minions that started in SETASIDE/HAND (tavern buys).
    entityRegistry.set(currentEntityId, { ...entry });
    if (currentEntityCopiedFrom) copiedFromMap.set(currentEntityId, currentEntityCopiedFrom);

    if (currentEntityZone === 'PLAY' && currentEntityController !== '') {
      entry.zone = 'PLAY';
      boardEntities.set(currentEntityId, entry);

      // Only opponent combat copies (opponent controller, during combat) are tracked in
      // boardSnapshots. Everything outside combat — including the local player's own
      // board — is either directly visible to the player or irrelevant.
      if (inCombat && currentEntityController === opponentController) {
        const heroCardId = heroCardIdForEntry(entry);
        if (heroCardId) {
          if (!boardSnapshots.has(heroCardId)) boardSnapshots.set(heroCardId, new Map());
          const snap = boardSnapshots.get(heroCardId)!;
          // On the first entry for this opponent in this combat, clear any stale data
          // from a prior encounter so we start fresh.
          if (!combatFreshenedHeroes.has(heroCardId)) {
            snap.clear();
            combatFreshenedHeroes.add(heroCardId);
          }
          // Don't add new entities once the snapshot is sealed. Sealing happens on
          // the first ATTACKING=1 tag during combat (first attack), after any
          // START_OF_COMBAT / Rally summons but before any deathrattle summons.
          if (!snapshotSealedHeroes.has(heroCardId)) {
            snap.set(currentEntityId, { ...entry });
            events.push({
              type: 'PLAYER_BOARD',
              heroCardId,
              minions: snapshotToMinions(snap),
              turn: currentTurn,
            });
          }
        }
      }
    }
  }

  return events;
}

function resetEntityAccumulators(): void {
  currentEntityId = '';
  currentCardId = '';
  currentEntityController = '';
  currentEntityZone = '';
  currentEntityAtk = 0;
  currentEntityHealth = 0;
  currentEntityCardType = '';
  currentEntityZonePos = 0;
  currentEntityBgSlot = '';
  currentEntityInitialPlacement = 0;
  currentEntityIsHero = false;
  currentEntityCopiedFrom = '';
}

function resetState(): void {
  gameEntityId = '';
  currentEntityIsPoolMinion = false;
  currentEntitySubsets = [];
  availableRaceSet.clear();
  resetEntityAccumulators();
  inPlayerBlock = false;
  currentPlayerId = '';
  firstPlayerBlockId = '';
  opponentController = '';
  bgSlotToHeroCardId.clear();
  localPlayerBgSlot = '';
  currentOpponentHeroCardId = '';
  boardEntities.clear();
  boardSnapshots.clear();
  entityRegistry.clear();
  copiedFromMap.clear();
  inCombat = false;
  combatFreshenedHeroes.clear();
  snapshotSealedHeroes.clear();
  currentTurn = 0;
}

// ── TAG_CHANGE handler (extracted to avoid duplication after flush) ────────────

function processTagChange(entityRef: string, tag: string, value: string): LogEvent[] {
  const entityId = extractEntityId(entityRef);

  // GameEntity-level
  const isGameEntity = entityRef === 'GameEntity' ||
    (gameEntityId !== '' && entityId === gameEntityId);
  if (isGameEntity) {
    if (tag === 'NEXT_STEP' && value === 'FINAL_GAMEOVER') return [{ type: 'GAME_PHASE', phase: 'ENDED' }];
    if (tag === 'NEXT_STEP' && value === 'MAIN_ACTION') return [{ type: 'GAME_PHASE', phase: 'IN_GAME' }];
    // NUM_TURNS_IN_PLAY increments once per phase (tavern + combat = 2 per actual turn),
    // so floor-divide by 2 to get the player-visible turn number.
    if (tag === 'NUM_TURNS_IN_PLAY') { currentTurn = Math.floor(parseInt(value, 10) / 2); return []; }
  }

  if (tag === 'BACON_CURRENT_COMBAT_PLAYER_ID') {
    if (value === '0') {
      inCombat = false;
      currentOpponentHeroCardId = '';
    } else {
      inCombat = true;
      if (value !== localPlayerBgSlot) {
        currentOpponentHeroCardId = bgSlotToHeroCardId.get(value) ?? '';
        combatFreshenedHeroes.clear();
        snapshotSealedHeroes.clear();
      }
    }
    return [];
  }

  // PLAYER_LEADERBOARD_PLACE via TAG_CHANGE — emit HERO_ENTITY too so heroes
  // whose block tags don't include PLAYER_LEADERBOARD_PLACE (e.g. the local
  // player's chosen hero which only receives this via TAG_CHANGE) still appear
  // in heroCardIds. The manager deduplicates.
  if (tag === 'PLAYER_LEADERBOARD_PLACE') {
    const cardId = extractCardId(entityRef);
    if (cardId && isBgHeroCardId(cardId)) {
      return [
        { type: 'HERO_ENTITY', cardId },
        { type: 'PLAYER_PLACEMENT', heroCardId: cardId, placement: parseInt(value, 10) },
      ];
    }
  }

  // BACON_TIMEWARPED via TAG_CHANGE
  if (tag === 'BACON_TIMEWARPED' && value === '1') {
    const cardId = extractCardId(entityRef) || currentCardId;
    if (cardId) return [{ type: 'TIMEWARPED_ENTITY', cardId }];
  }

  // Hero ZONE transitions — heroes moving in/out of PLAY don't affect snapshot tracking;
  // the current opponent is determined solely by BACON_CURRENT_COMBAT_PLAYER_ID.
  if (tag === 'ZONE' && entityId) {
    const cardId = extractCardId(entityRef);
    if (cardId && isBgHeroCardId(cardId)) {
      return [];
    }

    // Minion entering PLAY for the first time (started in SETASIDE/HAND — tavern buy).
    // The initial FULL_ENTITY block had zone≠PLAY so it was only stored in entityRegistry.
    // Now that it's entering PLAY, seed it into boardEntities and update the snapshot.
    if (value === 'PLAY' && !boardEntities.has(entityId)) {
      const reg = entityRegistry.get(entityId);
      if (reg) {
        const playerMatch = /\bplayer=(\d+)\b/.exec(entityRef);
        const controller = playerMatch ? playerMatch[1] : reg.controller;
        // Update the registry entry with the confirmed controller
        reg.controller = controller;
        const entry: BoardEntry = { ...reg, zone: 'PLAY' };
        // Evict the reset source before adding the copy so the snapshot stays clean.
        const sourceId = copiedFromMap.get(entityId);
        if (sourceId) evictCopySource(sourceId);
        boardEntities.set(entityId, entry);
        if (inCombat && entry.controller === opponentController) {
          const heroCardId = heroCardIdForEntry(entry);
          if (heroCardId) {
            if (!boardSnapshots.has(heroCardId)) boardSnapshots.set(heroCardId, new Map());
            const snap = boardSnapshots.get(heroCardId)!;
            if (!combatFreshenedHeroes.has(heroCardId)) {
              snap.clear();
              combatFreshenedHeroes.add(heroCardId);
            }
            if (!snapshotSealedHeroes.has(heroCardId)) {
              snap.set(entityId, { ...entry });
              return [{ type: 'PLAYER_BOARD', heroCardId, minions: snapshotToMinions(snap), turn: currentTurn }];
            }
          }
        }
      }
    }
  }

  // First attack during combat seals the opponent's snapshot. This fires before
  // any deathrattle summons and after any START_OF_COMBAT / Rally summons, so it
  // correctly captures the board as it stands when actual combat begins.
  if (tag === 'ATTACKING' && value === '1' && inCombat && currentOpponentHeroCardId) {
    snapshotSealedHeroes.add(currentOpponentHeroCardId);
    return [];
  }

  // Board entity updates
  if (entityId && boardEntities.has(entityId)) {
    const entry = boardEntities.get(entityId)!;

    if (tag === 'ATK' || tag === 'HEALTH') {
      const v = parseInt(value, 10);
      if (tag === 'ATK') entry.atk = v; else entry.health = v;
      const heroCardId = heroCardIdForEntry(entry);
      if (heroCardId && boardSnapshots.has(heroCardId)) {
        const snap = boardSnapshots.get(heroCardId)!;
        if (snap.has(entityId)) {
          const se = snap.get(entityId)!;
          if (tag === 'ATK') se.atk = v; else se.health = v;
          return [{ type: 'PLAYER_BOARD', heroCardId, minions: snapshotToMinions(snap), turn: currentTurn }];
        }
      }
      return [];
    }

    if (tag === 'ZONE') {
      const prevZone = entry.zone;
      entry.zone = value;
      if (value === 'PLAY') {
        const heroCardId = heroCardIdForEntry(entry);
        if (heroCardId) {
          if (!boardSnapshots.has(heroCardId)) boardSnapshots.set(heroCardId, new Map());
          const snap = boardSnapshots.get(heroCardId)!;
          snap.set(entityId, { ...entry });
          return [{ type: 'PLAYER_BOARD', heroCardId, minions: snapshotToMinions(snap), turn: currentTurn }];
        }
      } else if (prevZone === 'PLAY') {
        boardEntities.delete(entityId);
        const heroCardId = heroCardIdForEntry(entry);
        if (heroCardId && boardSnapshots.has(heroCardId) && !inCombat) {
          boardSnapshots.get(heroCardId)!.delete(entityId);
          return [{ type: 'PLAYER_BOARD', heroCardId, minions: snapshotToMinions(boardSnapshots.get(heroCardId)!), turn: currentTurn }];
        }
      }
      return [];
    }

    if (tag === 'ZONE_POSITION') {
      const newPos = parseInt(value, 10);
      entry.zonePos = newPos;
      // ZONE_POSITION=0 during combat is the engine's pre-death cleanup — skip it
      // so the snapshot preserves the entity's last real board position.
      // All other position updates (including during combat for newly-spawned minions)
      // should be reflected in the snapshot.
      if (inCombat) return [];
      const heroCardId = heroCardIdForEntry(entry);
      if (heroCardId && boardSnapshots.has(heroCardId)) {
        const snap = boardSnapshots.get(heroCardId)!;
        if (snap.has(entityId)) {
          snap.get(entityId)!.zonePos = newPos;
          return [{ type: 'PLAYER_BOARD', heroCardId, minions: snapshotToMinions(snap), turn: currentTurn }];
        }
      }
      return [];
    }

    if (tag === 'CONTROLLER') {
      const oldHero = heroCardIdForEntry(entry);
      if (oldHero && boardSnapshots.has(oldHero)) boardSnapshots.get(oldHero)!.delete(entityId);
      entry.controller = value;
      const newHero = heroCardIdForEntry(entry);
      if (newHero) {
        if (!boardSnapshots.has(newHero)) boardSnapshots.set(newHero, new Map());
        boardSnapshots.get(newHero)!.set(entityId, { ...entry });
      }
      return [];
    }
  }

  // Standalone TAG_CHANGE for COPIED_FROM_ENTITY_ID (fires outside FULL_ENTITY blocks).
  if (tag === 'COPIED_FROM_ENTITY_ID' && entityId && value && value !== '0') {
    copiedFromMap.set(entityId, value);
  }

  return [];
}

// ── Main parse function ───────────────────────────────────────────────────────

export function parseLine(line: string): LogEvent[] {
  const powerMatch = POWER_RE.exec(line);
  if (!powerMatch) return [];

  const raw = powerMatch[1];
  const content = raw.trim();

  try {
    // ── CREATE_GAME ───────────────────────────────────────────────────────────
    if (CREATE_GAME_RE.test(content)) {
      resetState();
      return [{ type: 'GAME_START' }];
    }

    // ── GameEntity EntityID=N ─────────────────────────────────────────────────
    const gameEntityMatch = GAME_ENTITY_RE.exec(raw);
    if (gameEntityMatch) {
      gameEntityId = gameEntityMatch[1];
      inPlayerBlock = false;
      return [];
    }

    // ── Player EntityID=N PlayerID=M ─────────────────────────────────────────
    const playerBlockMatch = PLAYER_BLOCK_RE.exec(raw);
    if (playerBlockMatch) {
      inPlayerBlock = true;
      currentPlayerId = playerBlockMatch[2];
      if (!firstPlayerBlockId) firstPlayerBlockId = currentPlayerId;
      // If Bob was already identified (his block came first), this must be the local player
      if (opponentController !== '' && currentPlayerId !== opponentController) {
        localPlayerBgSlot = currentPlayerId;
      }
      return [];
    }

    // ── FULL_ENTITY - Creating ────────────────────────────────────────────────
    const fullEntityMatch = FULL_ENTITY_RE.exec(content);
    if (fullEntityMatch) {
      const events = flushCurrentEntity();
      resetEntityAccumulators();
      currentEntityId = fullEntityMatch[1];
      currentCardId = fullEntityMatch[2];
      inPlayerBlock = false;
      return events;
    }

    // ── SHOW_ENTITY ───────────────────────────────────────────────────────────
    const showEntityMatch = SHOW_ENTITY_CARDID_RE.exec(content);
    if (showEntityMatch) {
      const events = flushCurrentEntity();
      resetEntityAccumulators();
      currentCardId = showEntityMatch[1];
      inPlayerBlock = false;
      return events;
    }

    // ── Indented block tags (inside open entity/player/gameentity block) ──────
    const blockTagMatch = BLOCK_TAG_RE.exec(raw);
    if (blockTagMatch) {
      const [, tagName, tagValue] = blockTagMatch;

      if (inPlayerBlock) {
        if (tagName === 'BACON_DUMMY_PLAYER' && tagValue === '1') {
          opponentController = currentPlayerId;
          // The local player's BG slot equals their PlayerID from the Player block.
          // That's whichever block ID we've seen so far that isn't Bob's.
          if (firstPlayerBlockId && firstPlayerBlockId !== currentPlayerId) {
            localPlayerBgSlot = firstPlayerBlockId;
          }
          // If Bob's block came first, localPlayerBgSlot is set in the Player block handler below.
        }
        return [];
      }

      // Tags on the GameEntity
      if (tagName === 'COIN_MANA_GEM' && tagValue === '1') return [{ type: 'BG_MODE_CONFIRMED' }];
      if (tagName === 'BACON_GLOBAL_ANOMALY_DBID' && tagValue !== '0') {
        return [{ type: 'ANOMALY_DBID', dbfId: parseInt(tagValue, 10) }];
      }

      // Tags on the current FULL_ENTITY
      if (currentEntityId) {
        switch (tagName) {
          case 'CONTROLLER': currentEntityController = tagValue; break;
          case 'ZONE': currentEntityZone = tagValue; break;
          case 'CARDTYPE': currentEntityCardType = tagValue; break;
          case 'ATK': currentEntityAtk = parseInt(tagValue, 10); break;
          case 'HEALTH': currentEntityHealth = parseInt(tagValue, 10); break;
          case 'ZONE_POSITION': currentEntityZonePos = parseInt(tagValue, 10); break;
          case 'PLAYER_ID': currentEntityBgSlot = tagValue; break;
          case 'COPIED_FROM_ENTITY_ID': currentEntityCopiedFrom = tagValue; break;
          // Bug A fix: PLAYER_LEADERBOARD_PLACE is the signal that this entity is an
          // in-game hero (not merely a draft choice shown to the player). Capture the
          // initial placement and mark it as a real hero.
          case 'PLAYER_LEADERBOARD_PLACE':
            currentEntityInitialPlacement = parseInt(tagValue, 10);
            currentEntityIsHero = true;
            break;
        }
      }

      if (tagName === 'BACON_TIMEWARPED' && tagValue === '1' && currentCardId) {
        return [{ type: 'TIMEWARPED_ENTITY', cardId: currentCardId }];
      }
      if (tagName === 'IS_BACON_POOL_MINION' && tagValue === '1') {
        currentEntityIsPoolMinion = true;
        return [];
      }
      if (currentEntityIsPoolMinion && tagValue === '1' && tagName.startsWith('BACON_SUBSET_')) {
        currentEntitySubsets.push(tagName.slice('BACON_SUBSET_'.length));
      }

      return [];
    }

    // ── TAG_CHANGE (top-level, non-indented) ──────────────────────────────────
    const tagMatch = TAG_CHANGE_RE.exec(content);
    if (tagMatch) {
      const [, entityRef, tag, value] = tagMatch;

      // Any non-indented line closes the open FULL_ENTITY block
      const flushEvents = flushCurrentEntity();
      resetEntityAccumulators();
      inPlayerBlock = false;

      const tagEvents = processTagChange(entityRef, tag, value);
      return flushEvents.length > 0 ? [...flushEvents, ...tagEvents] : tagEvents;
    }

  } catch (e) {
    console.log(e);
    // Never crash on a bad line
  }

  return [];
}
