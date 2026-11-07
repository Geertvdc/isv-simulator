import type { Scene } from './types';

/** Grey roof membrane, out to the horizon. */
const ROOF = 0x5d6066;

/**
 * The Seed Round level's own world (level 2-1, scene `seed-round`): the
 * rooftop round the startup's loft. A stub for now: an empty scene on roof
 * membrane; see `docs/plan/seed-round-environment.md` for the brief.
 */
export function seedRoundScene(): Scene {
  return { horizon: ROOF, ground: [], pieces: [], people: [], tufts: [] };
}
