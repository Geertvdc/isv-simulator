/**
 * Map chars for the level redesign tools (phase 23). Draft maps in
 * `maps/drafts/` use the game's map chars (`src/sim/level.ts`) plus a few
 * future ones for mechanics that don't exist yet. The tools swap those for
 * stand-ins so the game's own parser and path code can read a draft.
 */

import { type LevelMap, parseLevelMap } from '../../src/sim/level';

export interface FutureChar {
  /** What it will be in the game. */
  name: string;
  /** The existing char the tools read in its place until the mechanic exists. */
  standIn: string;
}

/** Chars for mechanics still to build, and the stand-ins the tools use for them. */
export const FUTURE_CHARS: Readonly<Record<string, FutureChar>> = {
  _: { name: 'wet floor (spills)', standIn: '.' },
  // Startup
  o: { name: 'leaky tap', standIn: 'C' },
  '%': { name: 'spill zone (tap floods it)', standIn: '.' },
  r: { name: 'mop robot route', standIn: '.' },
  L: { name: 'lift cabin (lifts)', standIn: '.' },
  // Enterprise
  '=': { name: 'partition (reorgs)', standIn: '#' },
  // Scale-Up
  l: { name: 'express lift cabin (lifts)', standIn: '.' },
  H: { name: 'mail chute hatch (lifts)', standIn: 'C' },
  // Enterprise
  D: { name: 'rolling desk (reorgs)', standIn: 'C' },
  d: { name: 'meeting door (shut while in session)', standIn: '.' },
  '+': { name: 'badge turnstile (one way)', standIn: '.' },
};

/** The map text with every future char replaced by its stand-in. */
export function toStandIns(text: string): string {
  return Object.entries(FUTURE_CHARS).reduce(
    (result, [char, { standIn }]) => result.replaceAll(char, standIn),
    text,
  );
}

/** Parses a current or draft map with the game's own parser, future chars as stand-ins. */
export function parseDraftMap(text: string): LevelMap {
  return parseLevelMap(toStandIns(text));
}

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
