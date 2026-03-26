// Star layout per tier — each inner array is one row of stars
const TIER_STAR_ROWS: number[][] = [
  [],           // 0 unused
  [1],          // Tier 1
  [2],          // Tier 2
  [2, 1],       // Tier 3
  [2, 2],       // Tier 4
  [2, 1, 2],    // Tier 5
  [2, 2, 2],    // Tier 6
  [2, 2, 2, 1], // Tier 7
];

interface TierStarsProps {
  tier: number;
  className?: string;
}

export function TierStars({ tier, className }: TierStarsProps) {
  const rows = TIER_STAR_ROWS[tier] ?? [];
  return (
    <span className={`tier-stars ${className ?? ''}`} data-tier={tier}>
      {rows.map((count, i) => (
        <span key={i} className="tier-stars__row">
          {Array.from({ length: count }, (_, j) => (
            <span key={j} className="tier-stars__star">★</span>
          ))}
        </span>
      ))}
    </span>
  );
}
