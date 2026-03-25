import { useFilterStore } from '../../state/filterStore';

const TIER_COLORS = ['#888', '#1ea', '#48f', '#b5f', '#f80', '#fc0'];

export function TierFilter() {
  const { selectedTiers, toggleTier } = useFilterStore();

  return (
    <div className="tier-filter" role="group" aria-label="Filter by tavern tier">
      {[1, 2, 3, 4, 5, 6].map((tier) => {
        const active = selectedTiers.includes(tier);
        return (
          <button
            key={tier}
            className={`tier-pip ${active ? 'tier-pip--active' : ''}`}
            style={{ '--tier-color': TIER_COLORS[tier - 1] } as React.CSSProperties}
            onClick={() => toggleTier(tier)}
            aria-pressed={active}
            aria-label={`Tier ${tier}`}
            title={`Tier ${tier}`}
          >
            {tier}
          </button>
        );
      })}
    </div>
  );
}
