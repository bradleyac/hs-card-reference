import { useMemo } from 'react';
import { getCardCache } from '../../data/cardSync';
import type { BgCard } from '../../data/types';
import { SubCard } from './SubCard';

interface TrinketRowProps {
  trinket: BgCard;
  onCardClick: (card: BgCard) => void;
}

export function TrinketRow({ trinket, onCardClick }: TrinketRowProps) {
  const relatedCard = useMemo(() => {
    if (!trinket.relatedCardDbfId) return null;
    const cache = getCardCache();
    for (const card of cache.values()) {
      if (card.dbfId === trinket.relatedCardDbfId) return card;
    }
    return null;
  }, [trinket.relatedCardDbfId]);

  return (
    <div className="hero-group">
      <SubCard card={trinket} label={null} onCardClick={onCardClick} />
      {relatedCard && <SubCard card={relatedCard} label="Related" onCardClick={onCardClick} showTier />}
    </div>
  );
}
