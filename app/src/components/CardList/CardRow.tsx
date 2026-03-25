import type { BgCard } from '../../data/types';

interface CardRowProps {
  card: BgCard;
  onClick: (card: BgCard) => void;
  style?: React.CSSProperties;
}

const TIER_COLORS = ['', '#888', '#1ea', '#48f', '#b5f', '#f80', '#fc0'];

export function CardRow({ card, onClick, style }: CardRowProps) {
  return (
    <div
      className="card-row"
      style={style}
      onClick={() => onClick(card)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onClick(card)}
      aria-label={card.name}
    >
      {card.techLevel !== null && (
        <span
          className="card-row__tier-pip"
          style={{ background: TIER_COLORS[card.techLevel] }}
          title={`Tier ${card.techLevel}`}
        />
      )}

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
  );
}
