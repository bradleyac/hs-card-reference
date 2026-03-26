import { create } from 'zustand';
import { EMPTY_GAME_STATE, type GameState } from '../data/types';
import { getCardCache } from '../data/cardSync';
import { propagateConstraints } from '../data/propagation';

export type ConnectionStatus = 'connected' | 'disconnected' | 'connecting';

interface GameStore {
  gameState: GameState;
  connectionStatus: ConnectionStatus;
  setGameState: (state: GameState) => void;
  setConnectionStatus: (status: ConnectionStatus) => void;
}

/**
 * Derives availableRaces by running constraint propagation over all signals:
 *   - directlyConfirmed: single-tribe pool minions (from watcher)
 *   - minionConstraints: dual-tribe pool minions (from watcher)
 *   - heroConstraints: hero associatedRaces (from card DB)
 * All three are combined in one propagation pass so cross-source deductions work.
 */
function applyPropagation(state: GameState): GameState {
  let cardCache: ReturnType<typeof getCardCache>;
  try {
    cardCache = getCardCache();
  } catch {
    return state; // Card cache not ready yet
  }

  const heroConstraints: string[][] = [];
  for (const heroId of state.heroCardIds) {
    const hero = cardCache.get(heroId);
    if (hero && hero.associatedRaces.length > 0) {
      heroConstraints.push([...hero.associatedRaces]);
    }
  }

  const resolved = propagateConstraints(
    state.availableRaces,
    state.pendingConstraints,
    heroConstraints,
  );

  if (resolved.length === state.availableRaces.length) return state;
  return { ...state, availableRaces: resolved };
}

export const useGameStore = create<GameStore>((set) => ({
  gameState: EMPTY_GAME_STATE,
  connectionStatus: 'disconnected',
  setGameState: (state) => set({ gameState: applyPropagation(state) }),
  setConnectionStatus: (connectionStatus) => set({ connectionStatus }),
}));
