/**
 * Pure parts of `scripts/draftShots.ts`: which drafts to render in 3D and
 * where the results go.
 */

import { LEVEL_IDS } from './mapFiles';

/** The screenshot (`scripts/screenshots.ts`) of a campaign level's scene. */
export function levelShotName(id: string): string {
  return `levels/${id}`;
}

/** File name of a draft's 3D render in the sketch folder; later reorg phases get their own. */
export function renderFileName(id: string, phase = 1): string {
  return phase > 1 ? `${id}-phase${phase}-3d.webp` : `${id}-3d.webp`;
}

/**
 * Render passes: the live maps can hold one phase of each level at a time,
 * so pass N renders phase N of every level that has one.
 */
export function phasePasses<T extends { phase: number }>(
  phasesById: ReadonlyMap<string, readonly T[]>,
): { id: string; draft: T }[][] {
  const passes: { id: string; draft: T }[][] = [];
  for (const [id, phases] of phasesById) {
    for (const draft of phases) (passes[draft.phase - 1] ??= []).push({ id, draft });
  }
  return passes.filter((pass) => pass.length > 0);
}

export type ShotRequest = { ids: string[] } | { error: string };

/**
 * The level ids to render from the command line: `--drafts` for every draft,
 * or a list of ids, each of which must be a campaign level with a draft.
 */
export function shotIds(args: readonly string[], drafts: readonly string[]): ShotRequest {
  const words = args.filter((a) => a !== '--');
  if (words.includes('--drafts')) {
    return drafts.length > 0 ? { ids: [...drafts] } : { error: 'No drafts in maps/drafts/' };
  }
  if (words.length === 0) return { error: 'Give level ids or --drafts' };
  const unknown = words.filter((id) => !LEVEL_IDS.includes(id));
  if (unknown.length > 0) return { error: `Unknown level id: ${unknown.join(', ')}` };
  const missing = words.filter((id) => !drafts.includes(id));
  if (missing.length > 0) return { error: `No draft for: ${missing.join(', ')}` };
  return { ids: [...new Set(words)] };
}
