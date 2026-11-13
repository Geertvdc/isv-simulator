import type { LevelMap } from '../../../sim/level';
import type { Scene } from './types';

/**
 * Demo Day's world (see `docs/plan/demo-day-environment.md`): the
 * accelerator's stage, the giant LED screen, the wings and the audience.
 * A stub until the World track fills it in.
 */
export function demoDayScene(map: LevelMap): Scene {
  return { horizon: map.width >= 0 ? 0x1c1d24 : 0x1c1d24, ground: [], pieces: [], people: [], tufts: [] };
}
