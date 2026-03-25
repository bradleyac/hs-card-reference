import { openDB, type IDBPDatabase } from 'idb';
import type { BgCard } from './types';

const DB_NAME = 'hs-card-ref';
const DB_VERSION = 1;

type HsDB = IDBPDatabase<{
  meta: {
    key: string;
    value: string | number;
  };
  cards: {
    key: string;
    value: BgCard;
    indexes: {
      category: string;
      techLevel: number;
    };
  };
}>;

let dbPromise: Promise<HsDB> | null = null;

function getDb(): Promise<HsDB> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('meta')) {
          db.createObjectStore('meta');
        }
        if (!db.objectStoreNames.contains('cards')) {
          const store = db.createObjectStore('cards', { keyPath: 'id' });
          store.createIndex('category', 'category');
          store.createIndex('techLevel', 'techLevel');
        }
      },
    }) as Promise<HsDB>;
  }
  return dbPromise;
}

export async function getStoredBuildNumber(): Promise<string | null> {
  const db = await getDb();
  const val = await db.get('meta', 'buildNumber');
  return typeof val === 'string' ? val : null;
}

export async function storeBuildNumber(build: string): Promise<void> {
  const db = await getDb();
  await db.put('meta', build, 'buildNumber');
  await db.put('meta', Date.now(), 'lastSynced');
}

export async function getStoredFilterVersion(): Promise<string | null> {
  const db = await getDb();
  const val = await db.get('meta', 'filterVersion');
  return typeof val === 'string' ? val : null;
}

export async function storeFilterVersion(version: string): Promise<void> {
  const db = await getDb();
  await db.put('meta', version, 'filterVersion');
}

export async function storeCards(cards: BgCard[]): Promise<void> {
  const db = await getDb();
  const tx = db.transaction('cards', 'readwrite');
  await tx.store.clear();
  for (const card of cards) {
    tx.store.put(card);
  }
  await tx.done;
}

export async function getAllCards(): Promise<BgCard[]> {
  const db = await getDb();
  return db.getAll('cards');
}
