import { filterAndProjectCards, type RawCard } from './cardFilter';
import {
  getAllCards,
  getStoredBuildNumber,
  storeBuildNumber,
  storeCards,
  getStoredFilterVersion,
  storeFilterVersion,
} from './cardDb';

// Bump this string whenever cardFilter.ts changes in a way that alters which
// cards are included — forces a re-index even if the HearthstoneJSON build
// number hasn't changed.
const FILTER_VERSION = '2';
import type { BgCard } from './types';

const INDEX_URL = 'https://api.hearthstonejson.com/v1/latest/';

// Module-level cache — loaded once at startup
let cardCache: Map<string, BgCard> | null = null;

export function getCardCache(): Map<string, BgCard> {
  if (!cardCache) throw new Error('Card cache not initialized — call syncCards() first');
  return cardCache;
}

function cardsUrl(build: string): string {
  return `https://api.hearthstonejson.com/v1/${build}/enUS/cards.json`;
}

/**
 * Fetches the HearthstoneJSON index page and extracts the current build number.
 * Returns null if offline or the page can't be parsed.
 */
async function fetchLatestBuildNumber(): Promise<string | null> {
  try {
    const res = await fetch(INDEX_URL);
    if (!res.ok) return null;
    const html = await res.text();
    const match = /href="\/v1\/(\d+)"/.exec(html);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

export type SyncStatus =
  | { type: 'loading'; message: string }
  | { type: 'ready'; cardCount: number; fromCache: boolean }
  | { type: 'error'; message: string };

/**
 * Main sync entry point. Checks build number, fetches if newer, loads from IDB.
 * Calls onStatus with progress updates.
 */
export async function syncCards(
  onStatus: (s: SyncStatus) => void
): Promise<Map<string, BgCard>> {
  onStatus({ type: 'loading', message: 'Checking card data version…' });

  const [storedBuild, latestBuild, storedFilterVersion] = await Promise.all([
    getStoredBuildNumber(),
    fetchLatestBuildNumber(),
    getStoredFilterVersion(),
  ]);

  const needsUpdate =
    (latestBuild && latestBuild !== storedBuild) ||
    storedFilterVersion !== FILTER_VERSION;

  if (needsUpdate) {
    onStatus({ type: 'loading', message: `Downloading card data (build ${latestBuild})…` });

    let rawCards: RawCard[];
    try {
      const res = await fetch(cardsUrl(latestBuild!));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      rawCards = await res.json() as RawCard[];
    } catch (err) {
      // Fall back to cached data if available
      const cached = await loadFromIdb();
      if (cached.size > 0) {
        cardCache = cached;
        onStatus({ type: 'ready', cardCount: cached.size, fromCache: true });
        return cached;
      }
      onStatus({ type: 'error', message: `Failed to fetch card data: ${String(err)}` });
      throw err;
    }

    onStatus({ type: 'loading', message: 'Processing cards…' });
    const bgCards = filterAndProjectCards(rawCards);

    onStatus({ type: 'loading', message: 'Storing cards…' });
    await storeCards(bgCards);
    if (latestBuild) await storeBuildNumber(latestBuild);
    await storeFilterVersion(FILTER_VERSION);

    cardCache = new Map(bgCards.map(c => [c.id, c]));
    onStatus({ type: 'ready', cardCount: bgCards.length, fromCache: false });
    return cardCache;
  }

  // Use cached data
  onStatus({ type: 'loading', message: 'Loading cards from cache…' });
  const cached = await loadFromIdb();

  if (cached.size === 0) {
    if (latestBuild === null) {
      // Offline and no cache — can't continue
      const msg = 'No card data cached and cannot reach HearthstoneJSON. Check your connection.';
      onStatus({ type: 'error', message: msg });
      throw new Error(msg);
    }
    // We have a build number but no cache — this shouldn't happen, but fetch now
    return syncCards(onStatus);
  }

  cardCache = cached;
  onStatus({ type: 'ready', cardCount: cached.size, fromCache: true });
  return cached;
}

async function loadFromIdb(): Promise<Map<string, BgCard>> {
  const cards = await getAllCards();
  return new Map(cards.map(c => [c.id, c]));
}
