import { useGameStore } from '../../state/gameStore';

export function StatusBar() {
  const { connectionStatus, gameState } = useGameStore();

  const isActive =
    gameState.mode === 'BATTLEGROUNDS' &&
    gameState.phase !== 'ENDED' &&
    gameState.heroCardIds.length > 0;

  return (
    <div className="status-bar">
      <span
        className={`status-dot status-dot--${connectionStatus}`}
        title={connectionStatus}
      />
      <span className="status-label">
        {connectionStatus === 'connected'
          ? isActive
            ? 'Game active'
            : 'No game'
          : connectionStatus === 'connecting'
          ? 'Connecting…'
          : 'Watcher offline'}
      </span>
    </div>
  );
}
