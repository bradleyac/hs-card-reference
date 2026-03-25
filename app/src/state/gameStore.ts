import { create } from 'zustand';
import { EMPTY_GAME_STATE, type GameState } from '../data/types';

export type ConnectionStatus = 'connected' | 'disconnected' | 'connecting';

interface GameStore {
  gameState: GameState;
  connectionStatus: ConnectionStatus;
  setGameState: (state: GameState) => void;
  setConnectionStatus: (status: ConnectionStatus) => void;
}

export const useGameStore = create<GameStore>((set) => ({
  gameState: EMPTY_GAME_STATE,
  connectionStatus: 'disconnected',
  setGameState: (gameState) => set({ gameState }),
  setConnectionStatus: (connectionStatus) => set({ connectionStatus }),
}));
