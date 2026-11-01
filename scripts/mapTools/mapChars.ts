/**
 * Map chars for the level redesign tools (phase 23). Draft maps in
 * `maps/drafts/` use the game's map chars (`src/sim/level.ts`) plus a few
 * future ones for mechanics that don't exist yet. The tools swap those for
 * stand-ins so the game's own parser and path code can read a draft. The
 * chars and stand-ins live in `src/sim/draftMap.ts`, which the game's
 * greybox loader (`?draft=`) shares.
 */

export { type FutureChar, FUTURE_CHARS, parseDraftMap, toStandIns } from '../../src/sim/draftMap';
import { FUTURE_CHARS } from '../../src/sim/draftMap';

/** The map's rows as written, with trailing blank lines dropped. Lenient: rows may differ in length. */
export function mapRows(text: string): string[] {
  const rows = text.replace(/\r\n?/g, '\n').split('\n');
  while (rows.length > 0 && rows[rows.length - 1] === '') rows.pop();
  return rows;
}

/** How many times each future char appears in the map. */
export function countFutureChars(text: string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const c of text) {
    if (FUTURE_CHARS[c]) counts[c] = (counts[c] ?? 0) + 1;
  }
  return counts;
}
