import type { LevelMap } from '../../../sim/level';
import type { Scene } from './types';

/**
 * Hypergrowth's world (level 3-2, scene `hypergrowth`; see
 * `docs/plan/hypergrowth-environment.md`): the ground and first floor of
 * 3-1's mid-rise on a rainy spring day. Stub: the World track builds it.
 */
export function hypergrowthScene(map: LevelMap): Scene {
  return { horizon: map.width > 0 ? 0x5d6670 : 0x5d6670, ground: [], pieces: [], people: [], tufts: [] };
}
