import { useFilterStore } from '../../state/filterStore';
import { useGameStore } from '../../state/gameStore';
import type { PanelId } from '../../data/types';

const PANELS: { id: PanelId; label: string; icon: string }[] = [
  { id: 'TAVERN', label: 'Tavern', icon: '🍺' },
  { id: 'HEROES', label: 'Heroes', icon: '👑' },
  { id: 'BUDDIES', label: 'Buddies', icon: '🤝' },
  { id: 'QUESTS', label: 'Quests', icon: '📜' },
  { id: 'ANOMALY', label: 'Anomaly', icon: '⚡' },
  { id: 'TIMEWARPED', label: 'Time', icon: '⏳' },
];

export function PanelNav() {
  const { activePanel, setActivePanel } = useFilterStore();
  const gameState = useGameStore((s) => s.gameState);

  const hasAnomaly = !!gameState.anomalyCardId;
  const hasTimewarped = gameState.timewarpedCardIds.length > 0;

  return (
    <nav className="panel-nav" role="tablist">
      {PANELS.map(({ id, label, icon }) => {
        const inactive =
          (id === 'ANOMALY' && !hasAnomaly) ||
          (id === 'TIMEWARPED' && !hasTimewarped);

        return (
          <button
            key={id}
            role="tab"
            aria-selected={activePanel === id}
            aria-label={label}
            className={`panel-nav__tab ${activePanel === id ? 'panel-nav__tab--active' : ''} ${inactive ? 'panel-nav__tab--dim' : ''}`}
            onClick={() => setActivePanel(id)}
            title={label}
          >
            <span aria-hidden="true">{icon}</span>
          </button>
        );
      })}
    </nav>
  );
}
