import FlexSearch from 'flexsearch';
import type { BgCard } from './types';

// Single document index, built once after card data loads
let searchIndex: FlexSearch.Document<BgCard> | null = null;

export function buildSearchIndex(cards: BgCard[]): void {
  searchIndex = new FlexSearch.Document<BgCard>({
    tokenize: 'forward',
    cache: 100,
    document: {
      id: 'id',
      store: false,
      index: [
        { field: 'name', tokenize: 'forward', resolution: 9 },
        { field: 'text', tokenize: 'forward', resolution: 3 },
        { field: 'keywords', tokenize: 'strict', resolution: 6 },
        { field: 'races', tokenize: 'strict', resolution: 5 },
      ],
    },
  });

  for (const card of cards) {
    searchIndex.add(card);
  }
}

/**
 * Returns a Set of card IDs matching the query, or null if no query / index not built.
 */
export function searchCards(query: string): Set<string> | null {
  if (!searchIndex || !query.trim()) return null;

  const results = searchIndex.search(query, { limit: 500, enrich: false });
  const ids = new Set<string>();
  for (const fieldResult of results) {
    for (const id of fieldResult.result) {
      ids.add(String(id));
    }
  }
  return ids;
}
