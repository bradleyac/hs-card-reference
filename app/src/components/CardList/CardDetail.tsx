import { useEffect } from 'react';
import type { BgCard } from '../../data/types';
import { CardImage } from '../Common/CardImage';

interface CardDetailProps {
  card: BgCard;
  onClose: () => void;
}

const TIER_COLORS = ['', '#888', '#1ea', '#48f', '#b5f', '#f80', '#fc0', '#f44'];

export function CardDetail({ card, onClose }: CardDetailProps) {
  // Close on Escape key
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div className="card-detail-backdrop" onClick={onClose}>
      <div
        className="card-detail"
        onClick={(e) => e.stopPropagation()}
      >
        <button className="card-detail__close" onClick={onClose} aria-label="Close">
          ✕
        </button>

        <CardImage cardId={card.id} name={card.name} size={256} className="card-detail__image" />

        <div className="card-detail__meta">
          <h2 className="card-detail__name">{card.name}</h2>

          {card.techLevel && (
            <span
              className="card-detail__tier"
              style={{ color: TIER_COLORS[card.techLevel] }}
            >
              Tier {card.techLevel}
            </span>
          )}

          {card.races.length > 0 && (
            <span className="card-detail__race">{card.races.join(' / ')}</span>
          )}

          {(card.attack !== null || card.health !== null) && (
            <span className="card-detail__stats">
              {card.attack}/{card.health}
            </span>
          )}

          {card.text && <p className="card-detail__text">{card.text}</p>}

          {card.keywords.length > 0 && (
            <div className="card-detail__keywords">
              {card.keywords
                .filter((k) => !k.startsWith('tier'))
                .map((k) => (
                  <span key={k} className="keyword-chip">
                    {k.replace(/_/g, ' ')}
                  </span>
                ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
