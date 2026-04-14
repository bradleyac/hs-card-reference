import type { BgCard } from '../../data/types';
import { artCropUrl } from '../Common/CardImage';
import { TierStars } from '../Common/TierStars';

interface SubCardProps {
  card: BgCard;
  label: string | null;
  onCardClick: (card: BgCard) => void;
  showTier?: boolean;
  placement?: number;
  sub?: boolean;
}

export function SubCard({ card, label, onCardClick, showTier, placement, sub }: SubCardProps) {
  return (
    <div
      className={`card-row${(label || sub) ? ' card-row--sub' : ''}`}
      onClick={() => onCardClick(card)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onCardClick(card)}
      aria-label={card.name}
    >
      {placement !== undefined ? (
        <span className="card-row__placement">#{placement}</span>
      ) : (
        showTier && card.techLevel !== null && (
          <TierStars tier={card.techLevel} className="card-row__tier-stars" />
        )
      )}

      <div className="card-row__thumb">
        <img
          src={artCropUrl(card.id)}
          alt=""
          onError={(e) => { (e.target as HTMLImageElement).parentElement!.style.display = 'none'; }}
        />
      </div>

      <div className="card-row__body">
        {label && <span className="card-row__sublabel">{label}</span>}
        <div className="card-row__header">
          <span className="card-row__name">{card.name}</span>

          {card.races.length > 0 && (
            <span className="card-row__race">
              {card.races.includes('ALL') ? 'ALL' : card.races.map((r) => r[0]).join('/')}
            </span>
          )}

          {card.armor !== null && (
            <span className="card-row__stats">{card.armor} armor</span>
          )}

          {card.attack !== null && card.health !== null && (
            <span className="card-row__stats">{card.attack}/{card.health}</span>
          )}
        </div>

        {card.text && <p className="card-row__text">{card.text}</p>}
      </div>
    </div>
  );
}
