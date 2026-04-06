export interface BoardMinion {
  cardId: string;
  attack: number;
  /** HEALTH tag value (max/buffed health, not current HP) */
  health: number;
  /** ZONE_POSITION, 1-indexed board slot */
  position: number;
}

export interface BoardSnapshot {
  minions: BoardMinion[];
  /** NUM_TURNS_IN_PLAY value when this snapshot was last updated */
  turn: number;
}

export interface GameState {
  mode: 'BATTLEGROUNDS' | 'OTHER' | 'UNKNOWN';
  phase: 'LOBBY' | 'IN_GAME' | 'ENDED';
  heroCardIds: string[];
  /** Races confirmed directly from single-tribe pool minions. */
  availableRaces: string[];
  /** Raw "at least one of" constraints from dual-tribe pool minions. Propagation runs app-side. */
  pendingConstraints: string[][];
  anomalyCardId: string | null;
  timewarpedCardIds: string[];
  /** Current leaderboard placement for each hero: heroCardId → 1–8 */
  heroplacements: Record<string, number>;
  /** Last-known board snapshot for each hero: heroCardId → { minions, turn } */
  playerBoards: Record<string, BoardSnapshot>;
}

export const EMPTY_GAME_STATE: GameState = {
  mode: 'UNKNOWN',
  phase: 'LOBBY',
  heroCardIds: [],
  availableRaces: [],
  pendingConstraints: [],
  anomalyCardId: null,
  timewarpedCardIds: [],
  heroplacements: {},
  playerBoards: {},
};

// Numeric race enum values from GameTag / HearthstoneJSON
export const RACE_NAMES: Record<number, string> = {
  14: 'MURLOC',
  15: 'DEMON',
  17: 'MECHANICAL',
  18: 'ELEMENTAL',
  20: 'BEAST',
  23: 'PIRATE',
  24: 'DRAGON',
  26: 'ALL',
  43: 'QUILBOAR',
  92: 'NAGA',
  11: 'UNDEAD',
};
