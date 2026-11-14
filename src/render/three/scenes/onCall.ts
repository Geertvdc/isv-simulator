import type { LevelMap } from '../../../sim/level';
import type { Scene } from './types';

/**
 * On Call's world (see `docs/plan/on-call-environment.md`): the basement
 * under the loft building at 3 AM, its light wells, the boiler room, the
 * bike storage and the stairs up. A stub until the World track fills it in.
 */
export function onCallScene(map: LevelMap): Scene {
  return {
    horizon: map.width >= 0 ? 0x2a2c30 : 0x2a2c30,
    ground: [],
    pieces: [],
    people: [],
    tufts: [],
  };
}
