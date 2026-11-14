import type { LevelMap } from '../../sim/level';
import { type Atmosphere, type LightWell, lightWellSpots, sceneOf } from './atmosphere';
import { onCallLightWells } from './scenes/onCall';

/** The scenes that open light wells in their own walls, by scene id. */
const SCENE_WELLS: Readonly<Record<string, (map: LevelMap) => LightWell[]>> = {
  'on-call': onCallLightWells,
};

/**
 * The light wells the atmosphere's snow, shafts and well lights go in: the
 * scene's own openings where it has them (a real map), else the default
 * spots along the back (`lightWellSpots`).
 */
export function lightWellsFor(
  atmosphere: Atmosphere,
  map: Pick<LevelMap, 'width' | 'height'> & Partial<Pick<LevelMap, 'tiles'>>,
): LightWell[] {
  const id = sceneOf(atmosphere);
  const own = id === undefined ? undefined : SCENE_WELLS[id];
  return own && map.tiles ? own(map as LevelMap) : lightWellSpots(map);
}
