# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development (run in separate terminals)
npm run dev       # React app on port 5173
npm run watch     # Watcher process tailing Power.log

# Build
npm run build     # Production build (app workspace)

# No test suite exists in this project
```

## Architecture Overview

This is a **Hearthstone Battlegrounds card reference PWA** with real-time game tracking. It's a monorepo with two independent services:

### Watcher (`/watcher/src`)
A Node.js process that tails `Power.log` and broadcasts game state over WebSocket (port 9876).

- `logWatcher.ts` — Chokidar-based tail of Power.log; handles HS restarts; replays from last `CREATE_GAME` on launch
- `logParser.ts` — Incremental line-by-line state machine producing structured events (GAME_START, HERO_ENTITY, ANOMALY_DBID, AVAILABLE_RACES, RACE_CONSTRAINT, etc.)
- `gameStateManager.ts` — Accumulates parser events into a `GameState` object
- `wsServer.ts` — Broadcasts `GameState` to all connected WebSocket clients

### App (`/app/src`)
An offline-first React PWA that consumes watcher broadcasts to show contextually filtered card data.

**Data flow:** Power.log → watcher → WebSocket → gameStore → useFilteredCards → CardList

**State (Zustand):**
- `state/gameStore.ts` — Holds `GameState` from watcher + `connectionStatus`; triggers constraint propagation on update
- `state/filterStore.ts` — User UI filters (search, tribes, tiers, active panel); persisted to `sessionStorage`
- `state/wsClient.ts` — WebSocket connection with auto-reconnect

**Data layer:**
- `data/cardSync.ts` — Fetches `cards.json` from HearthstoneJSON; caches in IndexedDB with build-number versioning
- `data/cardDb.ts` — IndexedDB wrapper (via `idb`) for persisting cards + metadata
- `data/cardFilter.ts` — Projects raw HearthstoneJSON cards into `BgCard` shape (BG-relevant fields only)
- `data/search.ts` — FlexSearch document index for full-text search (name, text, keywords, races)
- `data/propagation.ts` — **Core logic**: constraint propagation to infer which 5 tribes are active from dual-tribe minion pool. Uses connected-component analysis over "at least one of" constraints.
- `data/types.ts` — `BgCard`, `GameState`, `FilterState` interfaces (shared shapes)

**Key hook:** `hooks/useFilteredCards.ts` — Combines game context + user filters + search to produce the sorted card list shown in the UI.

**Components:** `AppShell.tsx` orchestrates layout; panels (TAVERN / HEROES / BUDDIES / QUESTS / ANOMALY / TIMEWARPED) each show contextually relevant card subsets; `CardList/` uses `react-window` for virtualization.

## Key Design Decisions

- **Exactly 5 tribes are active per BG game.** The propagation algorithm in `data/propagation.ts` deduces tribe availability from dual-tribe minions when some slots are already known — do not change the "5 tribes" invariant without understanding the full propagation logic.
- **Offline-first:** Cards are cached in IndexedDB; images cached via Service Worker (30-day expiry). The app works without the watcher running.
- **Card categories map 1:1 to UI panels.** `TAVERN_MINION`, `HERO`, `BUDDY`, `QUEST`, etc. are the canonical category keys used throughout `cardFilter.ts` and `useFilteredCards.ts`.
- **No test suite.** Validate changes by running the app and watcher together against a live or recorded log.
