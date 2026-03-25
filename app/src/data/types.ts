// ─── Card categories ──────────────────────────────────────────────────────────

export type BgCardCategory =
  | 'TAVERN_MINION'
  | 'HERO'
  | 'HERO_POWER'
  | 'BUDDY'
  | 'QUEST'
  | 'QUEST_REWARD'
  | 'ANOMALY'
  | 'TIMEWARPED_MAJOR'
  | 'TIMEWARPED_MINOR';

// ─── Projected card stored in IndexedDB ───────────────────────────────────────

export interface BgCard {
  /** HearthstoneJSON string card ID, e.g. "TB_BaconShop_HP_800" */
  id: string;
  /** Numeric DB ID — used for cross-references (anomaly, buddies, hero powers) */
  dbfId: number;
  name: string;
  /** Card text with HTML-like tags stripped */
  text: string;

  category: BgCardCategory;
  /** 1–6 for TAVERN_MINION; null for everything else */
  techLevel: number | null;

  attack: number | null;
  health: number | null;
  /** Mana cost for hero powers etc. */
  cost: number | null;
  /** Armor for hero cards */
  armor: number | null;

  /** Tribe(s), e.g. ["BEAST"] or ["MURLOC","BEAST"] for dual-type */
  races: string[];

  /** dbfId of this hero's hero power (set on HERO cards) */
  heroPowerDbfId: number | null;
  /** dbfId of this hero's buddy (set on HERO cards) */
  buddyDbfId: number | null;

  /**
   * Searchable keywords extracted from mechanics[] and synthetic additions.
   * Examples: "divine_shield", "windfury", "taunt", "buddy", "anomaly",
   * "timewarped", "tier1" … "tier6"
   */
  keywords: string[];
}

// ─── Game state pushed by the watcher ─────────────────────────────────────────

export interface GameState {
  mode: 'BATTLEGROUNDS' | 'OTHER' | 'UNKNOWN';
  phase: 'LOBBY' | 'IN_GAME' | 'ENDED';
  /** Card IDs of the (up to 8) heroes in this lobby */
  heroCardIds: string[];
  /** Race strings for tribes in the pool, e.g. ["BEAST","DRAGON"]. Empty = all tribes. */
  availableRaces: string[];
  /** Card ID of the active anomaly, or null */
  anomalyCardId: string | null;
  /** Card IDs of timewarped cards active this game */
  timewarpedCardIds: string[];
}

export const EMPTY_GAME_STATE: GameState = {
  mode: 'UNKNOWN',
  phase: 'LOBBY',
  heroCardIds: [],
  availableRaces: [],
  anomalyCardId: null,
  timewarpedCardIds: [],
};

// ─── Filter/UI state ──────────────────────────────────────────────────────────

export type PanelId =
  | 'TAVERN'
  | 'HEROES'
  | 'BUDDIES'
  | 'QUESTS'
  | 'ANOMALY'
  | 'TIMEWARPED';

export interface FilterState {
  searchQuery: string;
  /** Empty array = show all tribes */
  selectedRaces: string[];
  /** Empty array = show all tiers */
  selectedTiers: number[];
  activePanel: PanelId;
}
