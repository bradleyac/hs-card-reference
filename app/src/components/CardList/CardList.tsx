import { useState, useEffect, useRef } from 'react';
import type { BgCard, PanelId } from '../../data/types';
import { CardRow } from './CardRow';
import { HeroRow } from './HeroRow';
import { CardDetail } from './CardDetail';
import { renderUrl, artCropUrl } from '../Common/CardImage';

interface CardListProps {
  cards: BgCard[];
  height: number;
  panel?: PanelId;
}

// Tracks which card IDs have already been prefetched this session
const prefetched = new Set<string>();

function prefetchImages(ids: string[]) {
  for (const id of ids) {
    if (prefetched.has(id)) continue;
    prefetched.add(id);
    const img = new Image();
    img.src = renderUrl(id);
    img.onerror = () => {
      const fallback = new Image();
      fallback.src = artCropUrl(id);
    };
  }
}

export function CardList({ cards, height, panel }: CardListProps) {
  const [selectedCard, setSelectedCard] = useState<BgCard | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Prefetch images for the first screenful whenever the card list changes
  useEffect(() => {
    const visibleCount = Math.ceil(height / 66) + 5;
    prefetchImages(cards.slice(0, visibleCount).map(c => c.id));
  }, [cards, height]);

  // Prefetch on scroll
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    function onScroll() {
      const top = el!.scrollTop;
      const startIndex = Math.floor(top / 66);
      const count = Math.ceil(height / 66) + 15;
      prefetchImages(cards.slice(startIndex, startIndex + count).map(c => c.id));
    }
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
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
      <div
        ref={scrollRef}
        className="card-list"
        style={{ height, overflowY: 'auto' }}
      >
        {panel === 'HEROES'
          ? cards.map((card) => (
              <HeroRow key={card.id} hero={card} onCardClick={setSelectedCard} />
            ))
          : cards.map((card) => (
              <CardRow key={card.id} card={card} onClick={setSelectedCard} />
            ))
        }
      </div>

      {selectedCard && (
        <CardDetail card={selectedCard} onClose={() => setSelectedCard(null)} />
      )}
    </>
  );
}
