import { useMemo } from 'react';
import type { BgCard, PanelId } from '../data/types';
import { searchCards } from '../data/search';
import { useGameStore } from '../state/gameStore';
import { useFilterStore } from '../state/filterStore';
import { getCardCache } from '../data/cardSync';

/** Cards for the current panel, filtered by game context + user filters + search */
export function useFilteredCards(cardsReady: boolean): BgCard[] {
  const gameState = useGameStore((s) => s.gameState);
  const { activePanel, selectedRaces, selectedTiers, searchQuery, cardTypeFilter } = useFilterStore();

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
          c.races.some((r) => selectedRaces.includes(r)) ||
          c.races.includes('ALL')
      );
    }

    // ── Card type filter (minion / spell) ───────────────────────────────────
    if ((activePanel === 'TAVERN' || activePanel === 'TIMEWARPED') && cardTypeFilter !== 'ALL') {
      if (cardTypeFilter === 'MINION') {
        cards = cards.filter((c) => c.cardType === 'MINION');
      } else {
        // SPELL: include BATTLEGROUND_SPELL and HERO_POWER (timewarped hero powers)
        cards = cards.filter((c) => c.cardType !== 'MINION');
      }
    }

    // ── User tier filter ────────────────────────────────────────────────────
    if ((activePanel === 'TAVERN' || activePanel === 'TIMEWARPED' || activePanel === 'BUDDIES') && selectedTiers.length > 0) {
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
  }, [gameState, activePanel, selectedRaces, selectedTiers, cardTypeFilter, searchQuery, cardsReady]);
}

function categoryMatchesPanel(card: BgCard, panel: PanelId): boolean {
  switch (panel) {
    case 'TAVERN': return card.category === 'TAVERN_MINION';
    case 'HEROES': return card.category === 'HERO';
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
      return cards.filter((c) => heroCardIds.has(c.id));

    case 'BUDDIES':
      // Filter by active tribes (same logic as TAVERN) — shows buddies
      // available in the "buddies in the tavern" variant for this game's tribes
      if (gameState.availableRaces.length > 0) {
        const activeRaces = new Set(gameState.availableRaces);
        return cards.filter((c) => {
          if (c.races.includes('ALL')) return true;
          if (c.races.length > 0) return c.races.some((r) => activeRaces.has(r));
          if (c.associatedRaces.length > 0) return c.associatedRaces.some((r) => activeRaces.has(r));
          return true;
        });
      }
      return cards;

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
      // Filter by active tribes the same way as TAVERN
      if (gameState.availableRaces.length > 0) {
        const activeRaces = new Set(gameState.availableRaces);
        return cards.filter((c) => {
          if (c.races.includes('ALL')) return true;
          if (c.races.length > 0) return c.races.some((r) => activeRaces.has(r));
          if (c.associatedRaces.length > 0) return c.associatedRaces.some((r) => activeRaces.has(r));
          return true;
        });
      }
      return cards;

    default:
      return cards;
  }
}
