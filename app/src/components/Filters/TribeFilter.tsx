import { getCardCache } from '../../data/cardSync';
import { useFilterStore } from '../../state/filterStore';
import { useGameStore } from '../../state/gameStore';

// Tribe display names and colors
const TRIBE_META: Record<string, { label: string; color: string }> = {
  BEAST: { label: 'Beast', color: '#4a9' },
  DEMON: { label: 'Demon', color: '#9a4' },
  DRAGON: { label: 'Dragon', color: '#e64' },
  ELEMENTAL: { label: 'Elem', color: '#fa0' },
  MECHANICAL: { label: 'Mech', color: '#6ad' },
  MURLOC: { label: 'Murloc', color: '#4af' },
  NAGA: { label: 'Naga', color: '#a4f' },
  PIRATE: { label: 'Pirate', color: '#f94' },
  QUILBOAR: { label: 'Quilboar', color: '#c74' },
  UNDEAD: { label: 'Undead', color: '#888' },
};

export function TribeFilter() {
  const { selectedRaces, toggleRace } = useFilterStore();
  const gameState = useGameStore((s) => s.gameState);

  // Show only tribes that are available in the current game (if known), else all
  let tribes: string[];
  if (gameState.availableRaces.length > 0) {
    tribes = gameState.availableRaces.filter((r) => r !== 'ALL');
  } else {
    // Derive from card data
    try {
      const seen = new Set<string>();
      for (const card of getCardCache().values()) {
        if (card.category === 'TAVERN_MINION') {
          for (const r of card.races) {
            if (r !== 'ALL') seen.add(r);
          }
        }
      }
      tribes = Array.from(seen).sort();
    } catch {
      tribes = Object.keys(TRIBE_META);
    }
  }

  return (
    <div className="tribe-filter" role="group" aria-label="Filter by tribe">
      {tribes.map((race) => {
        const meta = TRIBE_META[race] ?? { label: race, color: '#666' };
        const active = selectedRaces.includes(race);
        return (
          <button
            key={race}
            className={`tribe-chip ${active ? 'tribe-chip--active' : ''}`}
            style={{ '--tribe-color': meta.color } as React.CSSProperties}
            onClick={() => toggleRace(race)}
            aria-pressed={active}
            aria-label={meta.label}
          >
            {meta.label}
          </button>
        );
      })}
    </div>
  );
}
