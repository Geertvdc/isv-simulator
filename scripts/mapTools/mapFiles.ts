/// <reference types="node" />

/**
 * Where the current and draft maps of a campaign level live, for the level
 * redesign tools (phase 23). Node only: used by the `sketch` and
 * `level-report` scripts.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CHAPTERS, LEVELS } from '../../src/sim/levels';

export const MAPS_DIR = 'maps';
export const DRAFTS_DIR = join(MAPS_DIR, 'drafts');
export const SKETCH_DIR = join('docs', 'plan', 'images', 'level-redesign');

/** Campaign level ids, in level select order. */
export const LEVEL_IDS: readonly string[] = LEVELS.map((l) => l.id);

/** `maps/level-NN-*.txt` for a campaign level: files are numbered in campaign order. */
export function currentMapPath(id: string): string | null {
  const file = levelMapFile(id, readdirSync(MAPS_DIR));
  return file ? join(MAPS_DIR, file) : null;
}

/** Which of `files` (names in `maps/`) is the campaign level's map, or `null`. */
export function levelMapFile(id: string, files: readonly string[]): string | null {
  const index = LEVEL_IDS.indexOf(id);
  if (index < 0) return null;
  const prefix = `level-${String(index + 1).padStart(2, '0')}-`;
  return files.find((f) => f.startsWith(prefix) && f.endsWith('.txt')) ?? null;
}

/** `maps/drafts/<id>.txt`, whether it exists or not. */
export function draftMapPath(id: string): string {
  return join(DRAFTS_DIR, `${id}.txt`);
}

/** Level ids with a draft in `maps/drafts/`, in campaign order (unknown ids last). */
export function draftIds(): string[] {
  if (!existsSync(DRAFTS_DIR)) return [];
  const ids = readdirSync(DRAFTS_DIR)
    .filter((f) => f.endsWith('.txt'))
    .map((f) => f.slice(0, -'.txt'.length));
  const order = (id: string): number => {
    const i = LEVEL_IDS.indexOf(id);
    return i < 0 ? LEVEL_IDS.length : i;
  };
  return ids.sort((a, b) => order(a) - order(b) || a.localeCompare(b));
}

/** `1-3 Down the Hall` for a campaign level id, or the id itself. */
export function levelLabel(id: string): string {
  for (const [c, chapter] of CHAPTERS.entries()) {
    const l = chapter.levels.findIndex((level) => level.id === id);
    const level = chapter.levels[l];
    if (level) return `${c + 1}-${l + 1} ${level.name}`;
  }
  return id;
}

export function readText(path: string): string | null {
  return existsSync(path) ? readFileSync(path, 'utf8') : null;
}
