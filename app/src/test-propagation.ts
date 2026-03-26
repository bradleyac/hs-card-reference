/**
 * Tests for the constraint propagation algorithm.
 * Run with: npx tsx src/test-propagation.ts
 */

import { propagateConstraints } from './data/propagation';

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

function hasAll(races: string[], ...tribes: string[]) {
  return tribes.every(t => races.includes(t));
}

console.log('\n── Direct confirmations pass through ───────────────────────────────');
{
  const result = propagateConstraints(['BEAST', 'NAGA'], [], []);
  expect('confirmed tribes present', hasAll(result, 'BEAST', 'NAGA'), true);
  expect('no extras inferred', result.length, 2);
}

console.log('\n── Single-race hero constraint confirms immediately ─────────────────');
{
  const result = propagateConstraints([], [], [['PIRATE']]);
  expect('PIRATE confirmed', result.includes('PIRATE'), true);
}

console.log('\n── Single ambiguous constraint does NOT resolve ─────────────────────');
{
  const result = propagateConstraints([], [['BEAST', 'NAGA']], []);
  expect('no tribe confirmed', result.length, 0);
}

console.log('\n── Two overlapping minion constraints resolve (remaining=1) ─────────');
{
  // Confirmed 4: remaining=1. {BEAST,NAGA} + {NAGA,MURLOC} → removing NAGA gives 2 components > 1
  const result = propagateConstraints(
    ['UNDEAD', 'PIRATE', 'DEMON', 'DRAGON'],
    [['BEAST', 'NAGA'], ['NAGA', 'MURLOC']],
    [],
  );
  expect('NAGA confirmed', result.includes('NAGA'), true);
  expect('total = 5', result.length, 5);
}

console.log('\n── Multi-step propagation (Example C from design) ──────────────────');
{
  // Confirmed: MURLOC, PIRATE, NAGA → remaining=2
  // Round 1: remove MECH → {BEAST},{UNDEAD},{QUILBOAR},{QUILBOAR,DEMON},{DEMON,ELEMENTAL} = 3 components > 2 → MECH confirmed
  // Round 2: remaining=1; remove DEMON → {QUILBOAR},{ELEMENTAL} = 2 > 1 → DEMON confirmed
  const result = propagateConstraints(
    ['MURLOC', 'PIRATE', 'NAGA'],
    [
      ['MECHANICAL', 'BEAST'],
      ['MECHANICAL', 'UNDEAD'],
      ['MECHANICAL', 'QUILBOAR'],
      ['QUILBOAR', 'DEMON'],
      ['DEMON', 'ELEMENTAL'],
    ],
    [],
  );
  expect('MECHANICAL confirmed', result.includes('MECHANICAL'), true);
  expect('DEMON confirmed', result.includes('DEMON'), true);
  expect('total = 5', result.length, 5);
}

console.log('\n── Cross-source: minion + hero constraints combine ──────────────────');
{
  // remaining=1. Minion says {BEAST,NAGA}. Hero says {BEAST,DRAGON}.
  // Neither alone can confirm BEAST. Together: removing BEAST → {NAGA}+{DRAGON} = 2 components > 1 → BEAST confirmed.
  const result = propagateConstraints(
    ['UNDEAD', 'PIRATE', 'DEMON', 'MURLOC'],
    [['BEAST', 'NAGA']],      // minion constraint
    [['BEAST', 'DRAGON']],    // hero constraint
  );
  expect('BEAST confirmed by cross-source deduction', result.includes('BEAST'), true);
  expect('total = 5', result.length, 5);
}

console.log('\n── Hero single-race + minion constraint combine ─────────────────────');
{
  // Hero confirms PIRATE directly. Remaining goes from 2 to 1.
  // Minion constraint {BEAST,NAGA} now resolves? No — still ambiguous with remaining=1.
  // But adding another minion {BEAST,MURLOC} → remaining=1, remove BEAST → {NAGA}+{MURLOC} = 2 > 1 → BEAST confirmed.
  const result = propagateConstraints(
    ['UNDEAD', 'DEMON', 'DRAGON'],
    [['BEAST', 'NAGA'], ['BEAST', 'MURLOC']],
    [['PIRATE']],   // single-race hero: confirms PIRATE, remaining becomes 1
  );
  expect('PIRATE confirmed from hero', result.includes('PIRATE'), true);
  expect('BEAST confirmed after PIRATE reduces remaining', result.includes('BEAST'), true);
  expect('total = 5', result.length, 5);
}

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
