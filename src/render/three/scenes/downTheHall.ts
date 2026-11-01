import type { Scene } from './types';

/** Old cobbles, out to the horizon. */
const COBBLES = 0x7a7066;

/**
 * The Down the Hall level's own world (level 1-3, scene `scale-up`): the
 * street round the converted warehouse. A stub for now: an empty scene on
 * cobbles; see `docs/plan/down-the-hall-environment.md` for the brief.
 */
export function downTheHallScene(): Scene {
  return { horizon: COBBLES, ground: [], pieces: [], people: [], tufts: [] };
}
