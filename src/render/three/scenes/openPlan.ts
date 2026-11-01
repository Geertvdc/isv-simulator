import type { Scene } from './types';

/** The office park's asphalt, out to the horizon. */
const ASPHALT = 0x6b6e72;

/**
 * The Open Plan Office level's own world (level 1-2, scene `open-plan`):
 * the office park round the rented floor. A stub for now: an empty scene on
 * asphalt; see `docs/plan/open-plan-environment.md` for the brief.
 */
export function openPlanScene(): Scene {
  return { horizon: ASPHALT, ground: [], pieces: [], people: [], tufts: [] };
}
