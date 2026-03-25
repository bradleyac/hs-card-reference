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
        // dbfId → card lookup happens in the PWA; watcher passes the dbfId as a string key
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
        this.state.availableRaces = event.races;
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
