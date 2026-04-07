import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as zlib from 'node:zlib';
import { GameStateManager } from './gameStateManager';
import { parseLine } from './logParser';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const logPath = path.resolve(__dirname, '../../docs/samples/Power.log.2.gz');
const raw = zlib.gunzipSync(fs.readFileSync(logPath)).toString('utf8');
const lines = raw.split('\n');

let state = null as import('./types').GameState | null;
const manager = new GameStateManager((s) => { state = { ...s }; });

let lineNo = 0;
for (const line of lines) {
  lineNo++;
  const turnMatch = /GameState\.DebugPrintPower\(\) -\s+TAG_CHANGE Entity=GameEntity tag=NUM_TURNS_IN_PLAY value=(\d+)/.exec(line);
  // NUM_TURNS_IN_PLAY increments twice per actual turn (tavern + combat).
  // Stop after actual turn 5 (raw value > 10).
  if (turnMatch && parseInt(turnMatch[1], 10) > 30) break;

  for (const event of parseLine(line)) {
    manager.handleEvent(event);
  }
}

console.log('\n═══ heroCardIds ═══');
console.log(JSON.stringify(state?.heroCardIds, null, 2));
console.log('\n═══ heroplacements ═══');
console.log(JSON.stringify(state?.heroplacements, null, 2));
console.log('\n═══ playerBoards ═══');
console.log(JSON.stringify(state?.playerBoards, null, 2));
