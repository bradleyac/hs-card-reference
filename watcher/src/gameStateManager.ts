import { EMPTY_GAME_STATE, type GameState, type BoardMinion, type BoardSnapshot } from './types';
import type { LogEvent } from './logParser';

function snapshotsEqual(
  prev: BoardSnapshot | undefined,
  minions: BoardMinion[],
  turn: number,
): boolean {
  if (!prev) return false;
  if (prev.turn !== turn) return false;
  if (prev.minions.length !== minions.length) return false;
  for (let i = 0; i < minions.length; i++) {
    const a = prev.minions[i];
    const b = minions[i];
    if (a.cardId !== b.cardId || a.attack !== b.attack || a.health !== b.health || a.position !== b.position) {
      return false;
    }
  }
  return true;
}

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
        this.state.availableRaces = event.races;
        this.emit();
        break;

      case 'RACE_CONSTRAINT':
        this.state.pendingConstraints = [...this.state.pendingConstraints, event.races];
        this.emit();
        break;

      case 'GAME_PHASE':
        this.state.phase = event.phase;
        this.emit();
        break;

      case 'PLAYER_PLACEMENT':
        if (this.state.heroplacements[event.heroCardId] !== event.placement) {
          this.state.heroplacements = {
            ...this.state.heroplacements,
            [event.heroCardId]: event.placement,
          };
          this.emit();
        }
        break;

      case 'PLAYER_BOARD': {
        const prev = this.state.playerBoards[event.heroCardId];
        if (!snapshotsEqual(prev, event.minions, event.turn)) {
          this.state.playerBoards = {
            ...this.state.playerBoards,
            [event.heroCardId]: { minions: event.minions, turn: event.turn },
          };
          this.emit();
        }
        break;
      }
    }
  }

  getState(): GameState {
    return { ...this.state };
  }

  private emit(): void {
    this.onChange({ ...this.state });
  }
}
