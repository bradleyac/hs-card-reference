import { useFilterStore } from '../../state/filterStore';
import { TierStars } from '../Common/TierStars';

interface TierFilterProps {
  tiers?: number[];
}

export function TierFilter({ tiers = [1, 2, 3, 4, 5, 6, 7] }: TierFilterProps) {
  const { selectedTiers, toggleTier } = useFilterStore();

  return (
    <div className="tier-filter" role="group" aria-label="Filter by tavern tier">
      {tiers.map((tier) => {
        const active = selectedTiers.includes(tier);
        return (
          <button
            key={tier}
            className={`tier-btn ${active ? 'tier-btn--active' : ''}`}
            onClick={() => toggleTier(tier)}
            aria-pressed={active}
            aria-label={`Tier ${tier}`}
            title={`Tier ${tier}`}
          >
            <TierStars tier={tier} />
          </button>
        );
      })}
    </div>
  );
}
