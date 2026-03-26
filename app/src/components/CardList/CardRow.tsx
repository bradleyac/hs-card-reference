import type { BgCard } from '../../data/types';
import { artCropUrl } from '../Common/CardImage';

interface CardRowProps {
  card: BgCard;
  onClick: (card: BgCard) => void;
}

// Star layout per tier — each inner array is one row of stars
const TIER_STAR_ROWS: number[][] = [
  [],          // 0 unused
  [1],         // Tier 1
  [2],         // Tier 2
  [2, 1],      // Tier 3
  [2, 2],      // Tier 4
  [2, 1, 2],   // Tier 5
  [2, 2, 2],   // Tier 6
  [2, 2, 2, 1], // Tier 7
];

function TierStars({ tier }: { tier: number }) {
  const rows = TIER_STAR_ROWS[tier] ?? [];
  return (
    <span className="card-row__tier-stars" data-tier={tier}>
      {rows.map((count, i) => (
        <span key={i} className="card-row__tier-star-row">
          {Array.from({ length: count }, (_, j) => (
            <span key={j} className="card-row__tier-star">★</span>
          ))}
        </span>
      ))}
    </span>
  );
}

export function CardRow({ card, onClick }: CardRowProps) {
  return (
    <div
      className="card-row"
      onClick={() => onClick(card)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onClick(card)}
      aria-label={card.name}
    >
      {card.techLevel !== null && <TierStars tier={card.techLevel} />}

      <div className="card-row__thumb">
        <img
          src={artCropUrl(card.id)}
          alt=""
          onError={(e) => { (e.target as HTMLImageElement).parentElement!.style.display = 'none'; }}
        />
      </div>

      <div className="card-row__body">
        <div className="card-row__header">
          <span className="card-row__name">{card.name}</span>

          {card.races.length > 0 && card.races[0] !== 'ALL' && (
            <span className="card-row__race">{card.races.map((r) => r[0]).join('/')}</span>
          )}

          {card.attack !== null && card.health !== null && (
            <span className="card-row__stats">
              {card.attack}/{card.health}
            </span>
          )}
        </div>

        {card.text && (
          <p className="card-row__text">{card.text}</p>
        )}
      </div>
    </div>
  );
}
