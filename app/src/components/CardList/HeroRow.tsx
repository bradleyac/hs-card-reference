import { useMemo } from 'react';
import { getCardCache } from '../../data/cardSync';
import type { BgCard, BoardMinion, BoardSnapshot } from '../../data/types';
import { useGameStore } from '../../state/gameStore';
import { artCropUrl } from '../Common/CardImage';
import { TierStars } from '../Common/TierStars';

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

interface SubCardProps {
  card: BgCard;
  label: string | null;
  onCardClick: (card: BgCard) => void;
  showTier?: boolean;
  placement?: number;
}

function SubCard({ card, label, onCardClick, showTier, placement }: SubCardProps) {
  return (
    <div
      className={`card-row${label ? ' card-row--sub' : ''}`}
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
