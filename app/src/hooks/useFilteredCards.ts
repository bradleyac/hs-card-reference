import { useMemo } from 'react';
import type { BgCard, PanelId } from '../data/types';
import { searchCards } from '../data/search';
import { useGameStore } from '../state/gameStore';
import { useFilterStore } from '../state/filterStore';
import { getCardCache } from '../data/cardSync';

/** Cards for the current panel, filtered by game context + user filters + search */
export function useFilteredCards(cardsReady: boolean): BgCard[] {
  const gameState = useGameStore((s) => s.gameState);
  const { activePanel, selectedRaces, selectedTiers, searchQuery } = useFilterStore();

  return useMemo(() => {
    if (!cardsReady) return [];
    let cards: BgCard[];
    try {
      cards = Array.from(getCardCache().values());
    } catch {
      return [];
    }

    // ── Panel / category filter ─────────────────────────────────────────────
    cards = cards.filter((c) => categoryMatchesPanel(c, activePanel));

    // ── Game context filter ─────────────────────────────────────────────────
    cards = applyGameContextFilter(cards, activePanel, gameState);

    // ── User tribe filter ───────────────────────────────────────────────────
    if (selectedRaces.length > 0) {
      cards = cards.filter(
        (c) =>
          c.races.length === 0 ||
          c.races.some((r) => selectedRaces.includes(r)) ||
          c.races.includes('ALL')
      );
    }

    // ── User tier filter (Tavern only) ──────────────────────────────────────
    if (activePanel === 'TAVERN' && selectedTiers.length > 0) {
      cards = cards.filter((c) => c.techLevel !== null && selectedTiers.includes(c.techLevel));
    }

    // ── Full-text search ────────────────────────────────────────────────────
    if (searchQuery.trim()) {
      const matchIds = searchCards(searchQuery);
      if (matchIds) {
        cards = cards.filter((c) => matchIds.has(c.id));
      }
    }

    // ── Sort: tier asc, then name ───────────────────────────────────────────
    cards.sort((a, b) => {
      const tierDiff = (a.techLevel ?? 99) - (b.techLevel ?? 99);
      if (tierDiff !== 0) return tierDiff;
      return a.name.localeCompare(b.name);
    });

    return cards;
  }, [gameState, activePanel, selectedRaces, selectedTiers, searchQuery, cardsReady]);
}

function categoryMatchesPanel(card: BgCard, panel: PanelId): boolean {
  switch (panel) {
    case 'TAVERN': return card.category === 'TAVERN_MINION';
    case 'HEROES': return card.category === 'HERO' || card.category === 'HERO_POWER';
    case 'BUDDIES': return card.category === 'BUDDY';
    case 'QUESTS': return card.category === 'QUEST' || card.category === 'QUEST_REWARD';
    case 'ANOMALY': return card.category === 'ANOMALY';
    case 'TIMEWARPED': return card.category === 'TIMEWARPED_MAJOR' || card.category === 'TIMEWARPED_MINOR';
  }
}

function applyGameContextFilter(
  cards: BgCard[],
  panel: PanelId,
  gameState: ReturnType<typeof useGameStore.getState>['gameState']
): BgCard[] {
  const inGame = gameState.mode === 'BATTLEGROUNDS' && gameState.heroCardIds.length > 0;

  if (!inGame) return cards;

  // Build a set of hero dbfIds for quick lookup
  const heroCardIds = new Set(gameState.heroCardIds);

  switch (panel) {
    case 'HEROES':
      // Only show heroes (and their hero powers) that are in this lobby
      return cards.filter((c) => {
        if (c.category === 'HERO') return heroCardIds.has(c.id);
        // Hero power: show if it belongs to a hero in this lobby
        // We match via heroPowerDbfId cross-reference stored on hero cards
        // Since hero powers store heroPowerDbfId on the hero, we use a reverse lookup
        return true; // simplified — all hero powers shown; refine if needed
      });

    case 'BUDDIES': {
      // Only buddies whose parent hero is in this lobby
      // hero.buddyDbfId → buddy.dbfId
      const cache = getCardCache();
      const buddyIds = new Set<string>();
      for (const heroCardId of heroCardIds) {
        const hero = cache.get(heroCardId);
        if (hero?.buddyDbfId) {
          for (const [id, card] of cache) {
            if (card.dbfId === hero.buddyDbfId) {
              buddyIds.add(id);
            }
          }
        }
      }
      if (buddyIds.size === 0) return cards; // no data yet, show all
      return cards.filter((c) => buddyIds.has(c.id));
    }

    case 'TAVERN':
      // Filter by active tribes if we know them
      if (gameState.availableRaces.length > 0) {
        const activeRaces = new Set(gameState.availableRaces);
        return cards.filter((c) => {
          if (c.races.includes('ALL')) return true;
          // Tribal minion: show only if its tribe is active
          if (c.races.length > 0) return c.races.some((r) => activeRaces.has(r));
          // Neutral with a tribe association (e.g. Prophet of the Boar): show only if that tribe is active
          if (c.associatedRaces.length > 0) return c.associatedRaces.some((r) => activeRaces.has(r));
          // Truly neutral: always show
          return true;
        });
      }
      return cards;

    case 'ANOMALY':
      if (gameState.anomalyCardId) {
        return cards.filter(
          (c) =>
            c.id === gameState.anomalyCardId ||
            String(c.dbfId) === gameState.anomalyCardId
        );
      }
      return cards;

    case 'TIMEWARPED':
      if (gameState.timewarpedCardIds.length > 0) {
        const twIds = new Set(gameState.timewarpedCardIds);
        return cards.filter((c) => twIds.has(c.id));
      }
      return cards;

    default:
      return cards;
  }
}
