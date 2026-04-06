/**
 * Smoke test using patterns from the real Power.log.
 * Run with: npx tsx src/test-parser.ts
 *
 * Propagation algorithm tests live in app/src/test-propagation.ts
 */

import { parseLine } from './logParser';
import { GameStateManager } from './gameStateManager';

// Lines matching the actual log format observed in the wild
const SAMPLE_LINES = [
  // Game start
  'D 16:12:15.9 GameState.DebugPrintPower() - CREATE_GAME',
  // GameEntity with dynamic ID (not 1)
  'D 16:12:15.9 GameState.DebugPrintPower() -     GameEntity EntityID=16',
  // BG mode detection via COIN_MANA_GEM
  'D 16:12:15.9 GameState.DebugPrintPower() -         tag=COIN_MANA_GEM value=1',
  // Anomaly
  'D 16:12:15.9 GameState.DebugPrintPower() -         tag=BACON_GLOBAL_ANOMALY_DBID value=102459',
  // Playing hero FULL_ENTITY block (BACON_HERO_CAN_BE_DRAFTED + PLAYER_LEADERBOARD_PLACE)
  'D 16:12:16.3 GameState.DebugPrintPower() -     FULL_ENTITY - Creating ID=77 CardID=BG25_HERO_100',
  'D 16:12:16.3 GameState.DebugPrintPower() -         tag=PLAYER_LEADERBOARD_PLACE value=3',
  'D 16:12:16.3 GameState.DebugPrintPower() -         tag=BACON_HERO_CAN_BE_DRAFTED value=1',
  // Another hero with initial placement = 1 (Bug A: should be captured)
  'D 16:12:16.3 GameState.DebugPrintPower() -     FULL_ENTITY - Creating ID=78 CardID=TB_BaconShop_HERO_93',
  'D 16:12:16.3 GameState.DebugPrintPower() -         tag=PLAYER_LEADERBOARD_PLACE value=1',
  'D 16:12:16.3 GameState.DebugPrintPower() -         tag=BACON_HERO_CAN_BE_DRAFTED value=1',
  // Placeholder hero — should NOT produce HERO_ENTITY or PLAYER_PLACEMENT
  'D 16:12:15.9 GameState.DebugPrintPower() -     FULL_ENTITY - Creating ID=27 CardID=TB_BaconShop_HERO_PH',
  'D 16:12:15.9 GameState.DebugPrintPower() -         tag=BACON_HERO_CAN_BE_DRAFTED value=1',
  // Timewarped card
  'D 16:12:20.0 GameState.DebugPrintPower() -     FULL_ENTITY - Creating ID=10 CardID=TB_BaconShop_TimeWarp_01',
  'D 16:12:20.0 GameState.DebugPrintPower() -         tag=BACON_TIMEWARPED value=1',
  // In-game step (flushes the TimeWarp entity above)
  'D 16:13:00.0 GameState.DebugPrintPower() - TAG_CHANGE Entity=16 tag=NEXT_STEP value=MAIN_ACTION',
  // Non-power line — must be ignored
  'D 16:13:01.0 Zone.ZoneChangeList.OneTurn() - some zone event',
  // Game end
  'D 16:30:00.0 GameState.DebugPrintPower() - TAG_CHANGE Entity=16 tag=NEXT_STEP value=FINAL_GAMEOVER',
];

let passed = 0;
let failed = 0;

function expect(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ ${label}`);
    console.error(`    expected: ${JSON.stringify(expected)}`);
    console.error(`    actual:   ${JSON.stringify(actual)}`);
    failed++;
  }
}

console.log('\n── Line Parser ─────────────────────────────────────────────────────');
expect('CREATE_GAME', parseLine(SAMPLE_LINES[0])[0]?.type, 'GAME_START');
expect('non-power line returns empty array', parseLine(SAMPLE_LINES[15]).length, 0);

console.log('\n── Game State Manager ──────────────────────────────────────────────');

const states: import('./types').GameState[] = [];
const manager = new GameStateManager((s) => states.push({ ...s }));

for (const line of SAMPLE_LINES) {
  for (const event of parseLine(line)) {
    manager.handleEvent(event);
  }
}

const final = states[states.length - 1];

expect('mode is BATTLEGROUNDS', final.mode, 'BATTLEGROUNDS');
expect('phase is ENDED', final.phase, 'ENDED');
// FULL_ENTITY boundaries flush the previous entity; the TimeWarp entity is flushed
// by the TAG_CHANGE line, so we get heroes + timewarp
expect('hero count (placeholder excluded)', final.heroCardIds.length, 2);
expect('hero 1', final.heroCardIds[0], 'BG25_HERO_100');
expect('hero 2', final.heroCardIds[1], 'TB_BaconShop_HERO_93');
expect('anomaly dbfId', final.anomalyCardId, '102459');
expect('timewarped card', final.timewarpedCardIds[0], 'TB_BaconShop_TimeWarp_01');

// ── Bug A: initial placement captured from FULL_ENTITY block ─────────────────
console.log('\n── Bug A fix: initial PLAYER_LEADERBOARD_PLACE from FULL_ENTITY ───');
expect('BG25_HERO_100 initial placement = 3', final.heroplacements['BG25_HERO_100'], 3);
expect('TB_BaconShop_HERO_93 initial placement = 1', final.heroplacements['TB_BaconShop_HERO_93'], 1);
expect('placeholder NOT in placements', final.heroplacements['TB_BaconShop_HERO_PH'], undefined);

// ── Bug A: placement update via TAG_CHANGE ────────────────────────────────────
console.log('\n── Placement update via TAG_CHANGE ─────────────────────────────────');
{
  const m2 = new GameStateManager(() => {});
  m2.handleEvent({ type: 'GAME_START' });
  m2.handleEvent({ type: 'HERO_ENTITY', cardId: 'BG25_HERO_100' });
  m2.handleEvent({ type: 'PLAYER_PLACEMENT', heroCardId: 'BG25_HERO_100', placement: 5 });
  expect('placement update', m2.getState().heroplacements['BG25_HERO_100'], 5);
}

// ── Bug B: hero zone→PLAY maps controller→heroCardId ─────────────────────────
console.log('\n── Bug B fix: TAG_CHANGE ZONE=PLAY maps controller to hero ─────────');
{
  // Simulate the sequence seen in real logs:
  // 1. Hero FULL_ENTITY is created (ZONE=SETASIDE, CONTROLLER=6)
  // 2. Hero moves to ZONE=PLAY via TAG_CHANGE (bracket form includes player=6)
  const bgLines = [
    'D 00:00:00.0 GameState.DebugPrintPower() - CREATE_GAME',
    'D 00:00:00.0 GameState.DebugPrintPower() -     GameEntity EntityID=1',
    'D 00:00:01.0 GameState.DebugPrintPower() -     Player EntityID=2 PlayerID=6 GameAccountId=[hi=1 lo=1]',
    'D 00:00:01.0 GameState.DebugPrintPower() -     Player EntityID=3 PlayerID=14 GameAccountId=[hi=0 lo=0]',
    'D 00:00:01.0 GameState.DebugPrintPower() -         tag=BACON_DUMMY_PLAYER value=1',
    // Hero choice for local player
    'D 00:00:02.0 GameState.DebugPrintPower() -     FULL_ENTITY - Creating ID=74 CardID=BG24_HERO_204_SKIN_E',
    'D 00:00:02.0 GameState.DebugPrintPower() -         tag=CONTROLLER value=6',
    'D 00:00:02.0 GameState.DebugPrintPower() -         tag=CARDTYPE value=HERO',
    'D 00:00:02.0 GameState.DebugPrintPower() -         tag=ZONE value=HAND',
    'D 00:00:02.0 GameState.DebugPrintPower() -         tag=BACON_HERO_CAN_BE_DRAFTED value=1',
    'D 00:00:02.0 GameState.DebugPrintPower() -         tag=PLAYER_LEADERBOARD_PLACE value=1',
    // Boundary: flush the above hero entity
    'D 00:00:03.0 GameState.DebugPrintPower() -     FULL_ENTITY - Creating ID=100 CardID=BGS_004',
    // Hero moves to PLAY (player picks it)
    'D 00:00:04.0 GameState.DebugPrintPower() - TAG_CHANGE Entity=[entityName=Clockwork Mechano id=74 zone=HAND zonePos=1 cardId=BG24_HERO_204_SKIN_E player=6] tag=ZONE value=PLAY',
    // Minion appears on board for player 6
    'D 00:00:05.0 GameState.DebugPrintPower() -     FULL_ENTITY - Creating ID=200 CardID=BGS_115t',
    'D 00:00:05.0 GameState.DebugPrintPower() -         tag=CONTROLLER value=6',
    'D 00:00:05.0 GameState.DebugPrintPower() -         tag=CARDTYPE value=MINION',
    'D 00:00:05.0 GameState.DebugPrintPower() -         tag=ZONE value=PLAY',
    'D 00:00:05.0 GameState.DebugPrintPower() -         tag=ATK value=3',
    'D 00:00:05.0 GameState.DebugPrintPower() -         tag=HEALTH value=3',
    'D 00:00:05.0 GameState.DebugPrintPower() -         tag=ZONE_POSITION value=1',
    // Boundary flush
    'D 00:00:06.0 GameState.DebugPrintPower() - TAG_CHANGE Entity=1 tag=NEXT_STEP value=MAIN_ACTION',
  ];

  const evts: import('./logParser').LogEvent[] = [];
  for (const l of bgLines) {
    for (const e of parseLine(l)) evts.push(e);
  }

  const boardEvent = evts.find(e => e.type === 'PLAYER_BOARD') as
    { type: 'PLAYER_BOARD'; heroCardId: string; minions: import('./types').BoardMinion[] } | undefined;

  expect('PLAYER_BOARD emitted', boardEvent?.type, 'PLAYER_BOARD');
  expect('board attributed to Clockwork Mechano', boardEvent?.heroCardId, 'BG24_HERO_204_SKIN_E');
  expect('board has 1 minion', boardEvent?.minions.length, 1);
  expect('minion stats 3/3', boardEvent?.minions[0] &&
    `${boardEvent.minions[0].attack}/${boardEvent.minions[0].health}`, '3/3');
}

// ── Pool minion tribe detection ───────────────────────────────────────────────

console.log('\n── Single-tribe pool minion → AVAILABLE_RACES ──────────────────────');
{
  const lines = [
    'D 00:00:00.0 GameState.DebugPrintPower() - CREATE_GAME',
    'D 00:00:00.0 GameState.DebugPrintPower() -     GameEntity EntityID=1',
    'D 00:00:01.0 GameState.DebugPrintPower() -     FULL_ENTITY - Creating ID=10 CardID=BGS_004',
    'D 00:00:01.0 GameState.DebugPrintPower() -         tag=IS_BACON_POOL_MINION value=1',
    'D 00:00:01.0 GameState.DebugPrintPower() -         tag=BACON_SUBSET_BEAST value=1',
    'D 00:00:02.0 GameState.DebugPrintPower() -     FULL_ENTITY - Creating ID=11 CardID=BGS_999',
  ];

  const events: import('./logParser').LogEvent[] = [];
  for (const line of lines) for (const e of parseLine(line)) events.push(e);

  const raceEvent = events.find(e => e.type === 'AVAILABLE_RACES');
  expect('AVAILABLE_RACES emitted', raceEvent?.type, 'AVAILABLE_RACES');
  expect('BEAST in races', (raceEvent as { type: 'AVAILABLE_RACES'; races: string[] } | undefined)
    ?.races.includes('BEAST'), true);
}

console.log('\n── Dual-tribe pool minion → RACE_CONSTRAINT ────────────────────────');
{
  const lines = [
    'D 00:00:00.0 GameState.DebugPrintPower() - CREATE_GAME',
    'D 00:00:00.0 GameState.DebugPrintPower() -     GameEntity EntityID=1',
    'D 00:00:01.0 GameState.DebugPrintPower() -     FULL_ENTITY - Creating ID=10 CardID=BG_DUAL',
    'D 00:00:01.0 GameState.DebugPrintPower() -         tag=IS_BACON_POOL_MINION value=1',
    'D 00:00:01.0 GameState.DebugPrintPower() -         tag=BACON_SUBSET_BEAST value=1',
    'D 00:00:01.0 GameState.DebugPrintPower() -         tag=BACON_SUBSET_NAGA value=1',
    'D 00:00:02.0 GameState.DebugPrintPower() -     FULL_ENTITY - Creating ID=11 CardID=BGS_999',
  ];

  const events: import('./logParser').LogEvent[] = [];
  for (const line of lines) for (const e of parseLine(line)) events.push(e);

  const constraintEvent = events.find(e => e.type === 'RACE_CONSTRAINT');
  expect('RACE_CONSTRAINT emitted', constraintEvent?.type, 'RACE_CONSTRAINT');
  const races = (constraintEvent as { type: 'RACE_CONSTRAINT'; races: string[] } | undefined)?.races ?? [];
  expect('constraint has BEAST and NAGA', races.includes('BEAST') && races.includes('NAGA'), true);
  expect('constraint has exactly 2 races', races.length, 2);
}

console.log('\n── Dual-tribe constraint stored in pendingConstraints ───────────────');
{
  const watcherStates: import('./types').GameState[] = [];
  const m = new GameStateManager(s => watcherStates.push({ ...s }));
  m.handleEvent({ type: 'GAME_START' });
  m.handleEvent({ type: 'RACE_CONSTRAINT', races: ['BEAST', 'NAGA'] });
  const s = watcherStates[watcherStates.length - 1];
  expect('constraint forwarded as-is (no propagation in watcher)', s.availableRaces.length, 0);
  expect('constraint in pendingConstraints', s.pendingConstraints.length, 1);
  expect('constraint races', s.pendingConstraints[0], ['BEAST', 'NAGA']);
}

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
