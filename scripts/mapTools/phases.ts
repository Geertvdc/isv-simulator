/**
 * Reorg layout phases of a draft (phase 23): `<id>.txt` is the layout at the
 * start, `<id>.phase2.txt` and on the layouts after each reorg. Only
 * partitions (`=`) and rolling desks (`D`) move, onto and off floor; walls,
 * stations, spawns and meeting rooms stay where they are.
 */

import { mapRows } from './mapChars';

/** Chars a reorg may change a tile between. */
const MOVABLE = new Set(['.', '=', 'D']);

/** What differs between phase 1 and a later phase that a reorg can't do; empty if fine. */
export function phaseProblems(first: string, later: string): string[] {
  const a = mapRows(first);
  const b = mapRows(later);
  const width = (rows: string[]): number => Math.max(0, ...rows.map((r) => r.length));
  if (a.length !== b.length || width(a) !== width(b)) {
    return [`size ${width(b)}×${b.length} is not ${width(a)}×${a.length}`];
  }
  const problems: string[] = [];
  a.forEach((row, y) => {
    for (let x = 0; x < width(a); x++) {
      const from = row.charAt(x) || ' ';
      const to = b[y]?.charAt(x) || ' ';
      if (from !== to && !(MOVABLE.has(from) && MOVABLE.has(to))) {
        problems.push(`${x},${y} '${from}' -> '${to}'`);
      }
    }
  });
  const desks = (rows: string[]): number => rows.join('').split('D').length - 1;
  if (desks(a) !== desks(b)) problems.push(`${desks(b)} rolling desks, not ${desks(a)}`);
  return problems;
}
