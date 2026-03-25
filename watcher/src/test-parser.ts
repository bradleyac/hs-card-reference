/**
 * Smoke test using patterns from the real Power.log.
 * Run with: npx tsx src/test-parser.ts
 */

import { parseLine } from './logParser';
import { GameStateManager } from './gameStateManager';

// Lines matching the actual log format observed in the wild
const SAMPLE_LINES = [
  // Game start
  'D 16:12:15.9 GameState.DebugPrintPower() - CREATE_GAME',
  // GameEntity with dynamic ID (4, not 1)
  'D 16:12:15.9 GameState.DebugPrintPower() -     GameEntity EntityID=4',
  // BG mode detection via COIN_MANA_GEM in GameEntity block
  'D 16:12:15.9 GameState.DebugPrintPower() -         tag=COIN_MANA_GEM value=1',
  // Anomaly in GameEntity block (BACON_GLOBAL_ANOMALY_DBID, not BACON_ANOMALY_DBID)
  'D 16:12:15.9 GameState.DebugPrintPower() -         tag=BACON_GLOBAL_ANOMALY_DBID value=102459',
  // Playing hero FULL_ENTITY block — has PLAYER_LEADERBOARD_PLACE (universal playing-hero signal)
  'D 16:12:16.3 GameState.DebugPrintPower() -     FULL_ENTITY - Creating ID=77 CardID=BG25_HERO_100',
  'D 16:12:16.3 GameState.DebugPrintPower() -         tag=PLAYER_LEADERBOARD_PLACE value=1',
  'D 16:12:16.3 GameState.DebugPrintPower() -         tag=BACON_HERO_CAN_BE_DRAFTED value=1',
  // Another playing hero (e.g. Patchwerk — no tribe bonus so no tag=3026)
  'D 16:12:16.3 GameState.DebugPrintPower() -     FULL_ENTITY - Creating ID=78 CardID=TB_BaconShop_HERO_93',
  'D 16:12:16.3 GameState.DebugPrintPower() -         tag=PLAYER_LEADERBOARD_PLACE value=1',
  'D 16:12:16.3 GameState.DebugPrintPower() -         tag=BACON_HERO_CAN_BE_DRAFTED value=1',
  // Placeholder hero — should NOT be emitted (no PLAYER_LEADERBOARD_PLACE)
  'D 16:12:15.9 GameState.DebugPrintPower() -     FULL_ENTITY - Creating ID=27 CardID=TB_BaconShop_HERO_PH',
  'D 16:12:15.9 GameState.DebugPrintPower() -         tag=BACON_HERO_CAN_BE_DRAFTED value=1',
  // Timewarped card
  'D 16:12:20.0 GameState.DebugPrintPower() -     FULL_ENTITY - Creating ID=10 CardID=TB_BaconShop_TimeWarp_01',
  'D 16:12:20.0 GameState.DebugPrintPower() -         tag=BACON_TIMEWARPED value=1',
  // In-game step via TAG_CHANGE on GameEntity (entity 4)
  'D 16:13:00.0 GameState.DebugPrintPower() - TAG_CHANGE Entity=4 tag=NEXT_STEP value=MAIN_ACTION',
  // Non-power line — must be ignored
  'D 16:13:01.0 Zone.ZoneChangeList.OneTurn() - some zone event',
  // Game end
  'D 16:30:00.0 GameState.DebugPrintPower() - TAG_CHANGE Entity=4 tag=NEXT_STEP value=FINAL_GAMEOVER',
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
expect('CREATE_GAME', parseLine(SAMPLE_LINES[0])?.type, 'GAME_START');
expect('non-power line returns null', parseLine(SAMPLE_LINES[13]), null);

console.log('\n── Game State Manager ──────────────────────────────────────────────');

const states: import('./types').GameState[] = [];
const manager = new GameStateManager((s) => states.push({ ...s }));

for (const line of SAMPLE_LINES) {
  const event = parseLine(line);
  if (event) manager.handleEvent(event);
}

const final = states[states.length - 1];

expect('mode is BATTLEGROUNDS', final.mode, 'BATTLEGROUNDS');
expect('phase is ENDED', final.phase, 'ENDED');
expect('hero count (placeholder excluded)', final.heroCardIds.length, 2);
expect('hero 1', final.heroCardIds[0], 'BG25_HERO_100');
expect('hero 2', final.heroCardIds[1], 'TB_BaconShop_HERO_93');
expect('anomaly dbfId', final.anomalyCardId, '102459');
expect('timewarped card', final.timewarpedCardIds[0], 'TB_BaconShop_TimeWarp_01');

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
