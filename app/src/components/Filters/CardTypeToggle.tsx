import { useFilterStore } from '../../state/filterStore';
import type { CardTypeFilter } from '../../data/types';

const OPTIONS: { value: CardTypeFilter; label: string }[] = [
  { value: 'ALL', label: 'All' },
  { value: 'MINION', label: 'Minions' },
  { value: 'SPELL', label: 'Spells' },
];

export function CardTypeToggle() {
  const { cardTypeFilter, setCardTypeFilter } = useFilterStore();

  return (
    <div className="card-type-toggle" role="group" aria-label="Filter by card type">
      {OPTIONS.map(({ value, label }) => (
        <button
          key={value}
          className={`card-type-btn ${cardTypeFilter === value ? 'card-type-btn--active' : ''}`}
          onClick={() => setCardTypeFilter(value)}
          aria-pressed={cardTypeFilter === value}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
