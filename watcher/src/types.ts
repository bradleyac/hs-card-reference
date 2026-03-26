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
}

export const EMPTY_GAME_STATE: GameState = {
  mode: 'UNKNOWN',
  phase: 'LOBBY',
  heroCardIds: [],
  availableRaces: [],
  pendingConstraints: [],
  anomalyCardId: null,
  timewarpedCardIds: [],
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
