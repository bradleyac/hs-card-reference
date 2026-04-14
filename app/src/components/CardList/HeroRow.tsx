import { useMemo } from 'react';
import { getCardCache } from '../../data/cardSync';
import type { BgCard, BoardMinion, BoardSnapshot } from '../../data/types';
import { useGameStore } from '../../state/gameStore';
import { artCropUrl } from '../Common/CardImage';
import { SubCard } from './SubCard';

interface HeroRowProps {
  hero: BgCard;
  onCardClick: (card: BgCard) => void;
}

export function HeroRow({ hero, onCardClick }: HeroRowProps) {
  const heroplacements = useGameStore((s) => s.gameState.heroplacements);
  const playerBoards = useGameStore((s) => s.gameState.playerBoards);
  const placement = heroplacements[hero.id];
  const snapshot = playerBoards[hero.id];

  const { heroPower, buddy } = useMemo(() => {
    const cache = getCardCache();
    let heroPower: BgCard | null = null;
    let buddy: BgCard | null = null;
    for (const card of cache.values()) {
      if (hero.heroPowerDbfId && card.dbfId === hero.heroPowerDbfId) heroPower = card;
      if (hero.buddyDbfId && card.dbfId === hero.buddyDbfId) buddy = card;
      if (heroPower && buddy) break;
    }
    return { heroPower, buddy };
  }, [hero.heroPowerDbfId, hero.buddyDbfId]);

  return (
    <div className="hero-group">
      <SubCard card={hero} label={null} onCardClick={onCardClick} placement={placement} />
      {heroPower && <SubCard card={heroPower} label="Hero Power" onCardClick={onCardClick} />}
      {buddy && <SubCard card={buddy} label="Buddy" onCardClick={onCardClick} showTier />}
      {snapshot && snapshot.minions.length > 0 && <BoardRow snapshot={snapshot} />}
    </div>
  );
}


function BoardRow({ snapshot }: { snapshot: BoardSnapshot }) {
  const cache = getCardCache();
  const sorted = [...snapshot.minions].sort((a, b) => a.position - b.position);
  return (
    <div className="board-row">
      <span className="board-row__turn">t{snapshot.turn}</span>
      {sorted.map((m) => <MinionChip key={m.position} minion={m} cache={cache} />)}
    </div>
  );
}

function MinionChip({ minion, cache }: { minion: BoardMinion; cache: Map<string, BgCard> }) {
  const name = cache.get(minion.cardId)?.name ?? minion.cardId;
  return (
    <div className="board-minion-chip" title={name}>
      <span className="board-minion-chip__name">{name}</span>
      <div className="board-minion-chip__thumb">
        <img
          src={artCropUrl(minion.cardId)}
          title={name}
          onError={(e) => { (e.target as HTMLImageElement).parentElement!.style.display = 'none'; }}
        />
      </div>
      <span className="board-minion-chip__stats">{minion.attack}/{minion.health}</span>
    </div>
  );
}
