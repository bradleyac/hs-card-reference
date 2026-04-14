import { useFilterStore } from '../../state/filterStore';
import type { TrinketTier } from '../../data/types';

const OPTIONS: { value: TrinketTier; label: string }[] = [
  { value: 'LESSER', label: 'Lesser' },
  { value: 'GREATER', label: 'Greater' },
];

export function TrinketTierToggle() {
  const { trinketTier, setTrinketTier } = useFilterStore();

  return (
    <div className="card-type-toggle" role="group" aria-label="Filter by trinket tier">
      {OPTIONS.map(({ value, label }) => (
        <button
          key={value}
          className={`card-type-btn ${trinketTier === value ? 'card-type-btn--active' : ''}`}
          onClick={() => setTrinketTier(value)}
          aria-pressed={trinketTier === value}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
