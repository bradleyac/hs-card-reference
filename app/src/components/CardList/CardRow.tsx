import type { BgCard } from '../../data/types';
import { artCropUrl } from '../Common/CardImage';
import { TierStars } from '../Common/TierStars';

interface CardRowProps {
  card: BgCard;
  onClick: (card: BgCard) => void;
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
      {card.techLevel !== null && <TierStars tier={card.techLevel} className="card-row__tier-stars" />}

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
