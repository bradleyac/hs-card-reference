# HS Card Reference

A narrow floating reference app for Hearthstone Battlegrounds. Tracks your current game via log files and lets you browse/search cards by tribe, tier, and keyword.

## Setup

**Install dependencies:**
```sh
npm install
```

## Running

You need two things running: the watcher (reads your game log) and the app (in a browser).

**Terminal 1 — start the log watcher:**
```sh
npm run watch
```

This writes the required `log.config` for Hearthstone if it doesn't exist, then watches `Power.log` for game events.

**Terminal 2 — start the app:**
```sh
npm run dev
```

Open `http://localhost:5173` in a browser window. Size it to ~250px wide and position it beside Hearthstone.

## Features

- **Tavern panel** — all pool minions, filterable by tribe and tier (shows only tribes active in your current game once a game starts)
- **Heroes panel** — the 8 heroes in your current lobby
- **Buddies panel** — buddy cards for the current heroes
- **Quests panel** — quest and reward cards
- **Anomaly panel** — active anomaly card (tab dims when none)
- **Timewarped panel** — timewarped cards active this game
- **Search** — type to search card name, text, and keywords (press `/` or `Ctrl+K`)
- **Offline-first** — card data cached in IndexedDB, images cached by Service Worker. Auto-updates on new HS patches.

## Architecture

```
watcher/    Node.js — tails Power.log, pushes GameState via WebSocket (port 9876)
app/        React PWA — displays cards, connects to watcher WebSocket
```

Card data from [HearthstoneJSON](https://hearthstonejson.com/), updated automatically on each Hearthstone patch.

## First run

The first launch fetches `cards.json` from HearthstoneJSON (~40–60MB). Subsequent launches use the cached data from IndexedDB and only re-fetch when Hearthstone patches.
