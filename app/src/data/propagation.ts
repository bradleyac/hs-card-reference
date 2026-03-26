/**
 * Constraint propagation for BG tribe detection.
 *
 * Every BG game has exactly TOTAL (5) active tribes. Given a set of confirmed
 * tribes and a list of "at least one of" constraints, this function infers
 * additional confirmed tribes via the connected-component rule:
 *
 *   For each unconfirmed tribe T:
 *     Remove T from every constraint, count connected components of the result.
 *     If #components > remaining slots → T must be active (confirm it).
 *
 * Two constraints are in the same component if they share any tribe.
 * Independent components each require ≥1 slot, so if there are more components
 * than remaining slots, the removed tribe T was load-bearing.
 */

const TOTAL_TRIBES = 5;

function countComponents(constraints: string[][]): number {
  const parent = new Map<string, string>();

  function find(x: string): string {
    if (!parent.has(x)) parent.set(x, x);
    const p = parent.get(x)!;
    if (p !== x) parent.set(x, find(p));
    return parent.get(x)!;
  }

  function union(x: string, y: string): void {
    parent.set(find(x), find(y));
  }

  for (const c of constraints) {
    for (let i = 1; i < c.length; i++) union(c[0], c[i]);
    if (c.length > 0) find(c[0]); // register singleton components
  }

  return new Set(constraints.flatMap(c => c.map(t => find(t)))).size;
}

/**
 * Runs constraint propagation to completion.
 *
 * @param directlyConfirmed  Races observed directly (single-tribe pool minions).
 * @param minionConstraints  "At least one of" constraints from dual-tribe pool minions.
 * @param heroConstraints    "At least one of" constraints from heroes' associated races.
 * @returns  Full set of confirmed tribes after propagation.
 */
export function propagateConstraints(
  directlyConfirmed: string[],
  minionConstraints: string[][],
  heroConstraints: string[][],
): string[] {
  const confirmed = new Set(directlyConfirmed);

  // Seed single-race hero signals as direct confirmations
  let constraints: string[][] = [];
  for (const c of [...minionConstraints, ...heroConstraints]) {
    if (c.length === 1) {
      confirmed.add(c[0]);
    } else if (c.length > 1) {
      constraints.push([...c]);
    }
  }

  let changed = true;
  while (changed) {
    changed = false;
    constraints = constraints.filter(c => !c.some(t => confirmed.has(t)));
    if (constraints.length === 0) break;
    const remaining = TOTAL_TRIBES - confirmed.size;
    if (remaining <= 0) break;

    const candidates = new Set(constraints.flat());
    for (const tribe of candidates) {
      if (confirmed.has(tribe)) continue;
      const reduced = constraints.map(c => c.filter(t => t !== tribe));
      if (reduced.some(c => c.length === 0)) {
        confirmed.add(tribe); changed = true; continue;
      }
      if (countComponents(reduced) > remaining) {
        confirmed.add(tribe); changed = true;
      }
    }
  }

  return Array.from(confirmed);
}
