import { useMemo } from 'react';
import { getCardCache } from '../../data/cardSync';
import type { BgCard } from '../../data/types';
import { CardRow } from './CardRow';
import { SubCard } from './SubCard';

interface TavernRowProps {
  card: BgCard;
  onCardClick: (card: BgCard) => void;
}

export function TavernRow({ card, onCardClick }: TavernRowProps) {
  const relatedCard = useMemo(() => {
    if (!card.relatedCardDbfId) return null;
    const cache = getCardCache();
    for (const c of cache.values()) {
      if (c.dbfId === card.relatedCardDbfId) return c;
    }
    return null;
  }, [card.relatedCardDbfId]);

  if (!relatedCard) {
    return <CardRow card={card} onClick={onCardClick} />;
  }

  return (
    <div className="hero-group">
      <SubCard card={card} label={null} onCardClick={onCardClick} showTier />
      <SubCard card={relatedCard} label={null} sub onCardClick={onCardClick} showTier />
    </div>
  );
}
