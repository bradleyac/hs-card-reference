import { EMPTY_GAME_STATE, type GameState } from './types';
import type { LogEvent } from './logParser';

export class GameStateManager {
  private state: GameState = { ...EMPTY_GAME_STATE };
  private onChange: (state: GameState) => void;

  constructor(onChange: (state: GameState) => void) {
    this.onChange = onChange;
  }

  handleEvent(event: LogEvent): void {
    switch (event.type) {
      case 'GAME_START':
        this.state = { ...EMPTY_GAME_STATE };
        this.emit();
        break;

      case 'BG_MODE_CONFIRMED':
        this.state.mode = 'BATTLEGROUNDS';
        this.emit();
        break;

      case 'HERO_ENTITY':
        if (!this.state.heroCardIds.includes(event.cardId)) {
          this.state.heroCardIds = [...this.state.heroCardIds, event.cardId];
          this.emit();
        }
        break;

      case 'ANOMALY_DBID':
        this.state.anomalyCardId = String(event.dbfId);
        this.emit();
        break;

      case 'TIMEWARPED_ENTITY':
        if (!this.state.timewarpedCardIds.includes(event.cardId)) {
          this.state.timewarpedCardIds = [...this.state.timewarpedCardIds, event.cardId];
          this.emit();
        }
        break;

      case 'AVAILABLE_RACES':
        // Direct observations from single-tribe pool minions; propagation runs app-side.
        this.state.availableRaces = event.races;
        this.emit();
        break;

      case 'RACE_CONSTRAINT':
        // "At least one of" signal from a dual-tribe pool minion; propagation runs app-side.
        this.state.pendingConstraints = [...this.state.pendingConstraints, event.races];
        this.emit();
        break;

      case 'GAME_PHASE':
        this.state.phase = event.phase;
        this.emit();
        break;
    }
  }

  getState(): GameState {
    return { ...this.state };
  }

  private emit(): void {
    this.onChange({ ...this.state });
  }
}
