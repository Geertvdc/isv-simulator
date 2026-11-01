/**
 * Draft maps of the level redesign (phase 23, `maps/drafts/`) as playable
 * levels, for the greybox step: a draft's layout with its campaign level's
 * settings. Drafts use a few chars for mechanics that don't exist yet; until
 * they do, those read as a stand-in the game knows.
 */

import { type LevelMap, parseLevelMap } from './level';
import type { Level } from './levels';

export interface FutureChar {
  /** What it will be in the game. */
  name: string;
  /** The existing char read in its place until the mechanic exists. */
  standIn: string;
}

/** Chars for mechanics still to build, and their stand-ins. */
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
  // Big Tech
  Q: { name: 'travelator (campus)', standIn: '.' },
  Y: { name: 'shuttle stop (campus)', standIn: '.' },
  '*': { name: 'revolving door (campus)', standIn: '.' },
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

/** File name of a draft in `maps/drafts/`: `<id>.txt`, later reorg phases `<id>.phase<N>.txt`. */
export function draftFileName(id: string, phase = 1): string {
  return phase > 1 ? `${id}.phase${phase}.txt` : `${id}.txt`;
}

/** The campaign level with the draft's layout: same id, name and settings, stand-ins for future chars. */
export function draftLevel(level: Level, draftText: string): Level {
  return { ...level, map: parseDraftMap(draftText) };
}

export type DraftRequest = { id: string; phase: number } | { error: string };

/**
 * The draft asked for in the URL, `?draft=<level-id>[&phase=<N>]`, or `null`
 * without `draft`. `levelIds` are the campaign levels.
 */
export function draftRequest(
  draft: string | null,
  phase: string | null,
  levelIds: readonly string[],
): DraftRequest | null {
  if (draft === null) return null;
  if (!levelIds.includes(draft)) return { error: `No campaign level '${draft}'` };
  if (phase === null) return { id: draft, phase: 1 };
  const n = Number(phase);
  if (!Number.isInteger(n) || n < 1) return { error: `Phase '${phase}' is not 1, 2, 3, …` };
  return { id: draft, phase: n };
}
