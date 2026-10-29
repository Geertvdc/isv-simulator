import type { ChapterInfo } from '../../flow/save';
import { CHAPTERS, DEMO_LEVEL_IDS, LEVELS } from '../../sim/levels';

/** Every campaign level's id, in order: flow level indexes point into it. */
export const LEVEL_IDS: readonly string[] = LEVELS.map((l) => l.id);

/** The demo's levels, by index in `LEVEL_IDS`. */
export const DEMO_LEVELS: readonly number[] = DEMO_LEVEL_IDS.map((id) =>
  LEVEL_IDS.indexOf(id),
).filter((i) => i >= 0);

export const CHAPTER_INFO: readonly ChapterInfo[] = CHAPTERS.map((c) => ({
  levelIds: c.levels.map((l) => l.id),
  starGate: c.starGate,
}));

/** The id of the chapter holding level `index`, if any. */
export function chapterIdOf(index: number): string | null {
  const id = LEVEL_IDS[index];
  return CHAPTERS.find((c) => c.levels.some((l) => l.id === id))?.id ?? null;
}
