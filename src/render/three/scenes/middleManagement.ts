import type { LevelMap } from '../../../sim/level';
import type { Scene } from './types';

/**
 * Middle Management's world (see `docs/plan/middle-management-environment.md`):
 * the rest of YOTTA's rented floor in a mid-rise on a spring morning, the
 * reception, the lifts, Derek's corner office, and the city below. A stub
 * until the World track fills it in.
 */
export function middleManagementScene(map: LevelMap): Scene {
  return {
    horizon: map.width >= 0 ? 0x8a9098 : 0x8a9098,
    ground: [],
    pieces: [],
    people: [],
    tufts: [],
  };
}
