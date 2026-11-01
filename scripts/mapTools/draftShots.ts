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

/** URL params that load a draft (and a later reorg phase of it) in the game: `?draft=` in dev builds. */
export function draftQuery(id: string, phase = 1): string {
  return phase > 1 ? `draft=${id}&phase=${phase}` : `draft=${id}`;
}

/** The dev server URL to play a draft on the couch. */
export function draftPlayUrl(base: string, id: string, phase = 1): string {
  return `${base.replace(/\/$/, '')}/?${draftQuery(id, phase)}`;
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
