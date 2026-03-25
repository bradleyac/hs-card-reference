import { useState, useEffect, useRef } from 'react';
import { FixedSizeList } from 'react-window';
import type { BgCard } from '../../data/types';
import { CardRow } from './CardRow';
import { CardDetail } from './CardDetail';
import { renderUrl, artCropUrl } from '../Common/CardImage';

interface CardListProps {
  cards: BgCard[];
  height: number;
}

const ROW_HEIGHT = 44;

// Tracks which card IDs have already been prefetched this session
const prefetched = new Set<string>();

function prefetchImages(cards: BgCard[], startIndex: number, count: number) {
  const end = Math.min(startIndex + count, cards.length);
  for (let i = startIndex; i < end; i++) {
    const id = cards[i].id;
    if (prefetched.has(id)) continue;
    prefetched.add(id);
    const img = new Image();
    img.src = renderUrl(id);
    img.onerror = () => {
      // If render PNG 404s, prime the art crop too
      const fallback = new Image();
      fallback.src = artCropUrl(id);
    };
  }
}

export function CardList({ cards, height }: CardListProps) {
  const [selectedCard, setSelectedCard] = useState<BgCard | null>(null);
  const listRef = useRef<FixedSizeList>(null);

  // Prefetch images for the first screenful whenever the card list changes
  useEffect(() => {
    const visibleCount = Math.ceil(height / 44) + 5;
    prefetchImages(cards, 0, visibleCount);
  }, [cards, height]);

  if (cards.length === 0) {
    return (
      <div className="card-list--empty">
        <span>No cards found</span>
      </div>
    );
  }

  return (
    <>
      <FixedSizeList
        ref={listRef}
        height={height}
        itemCount={cards.length}
        itemSize={ROW_HEIGHT}
        width="100%"
        className="card-list"
        onItemsRendered={({ visibleStopIndex }) => {
          // Prefetch a buffer of cards ahead of the visible window
          prefetchImages(cards, visibleStopIndex + 1, 15);
        }}
      >
        {({ index, style }) => (
          <CardRow
            card={cards[index]}
            onClick={setSelectedCard}
            style={style}
          />
        )}
      </FixedSizeList>

      {selectedCard && (
        <CardDetail card={selectedCard} onClose={() => setSelectedCard(null)} />
      )}
    </>
  );
}
