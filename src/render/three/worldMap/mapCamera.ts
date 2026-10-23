/**
 * Where the world map camera looks, as plain math (testable in Node): at the
 * van (on the selected flag once parked), held off the island's ends so
 * they don't show a sea of water, and only partly following the road up
 * and down so the view doesn't bob. It glides there instead of jumping.
 */

import type { MapPoint, WorldMap } from '../../../flow/worldMap';

/** How far the camera stays in from the island's left and right ends, in map tiles. */
const END_MARGIN = 8;
/**
 * How much of a flag's distance from the island's middle row the camera
 * follows: a little, so the whole depth of the island stays in view.
 */
const FOLLOW_Y = 0.15;
/** The camera looks this far in front of the middle row, so the near flags' numbers show. */
const LOOK_AHEAD = 0.6;
/** The glide's time constant: after this long, about two thirds of the way there. */
const GLIDE_MS = 220;

/** The map point the camera looks at with `node` selected. */
export function cameraTarget(map: Pick<WorldMap, 'width' | 'height'>, node: MapPoint): MapPoint {
  const middle = map.height / 2;
  const min = Math.min(END_MARGIN, map.width / 2);
  const max = Math.max(map.width - END_MARGIN, map.width / 2);
  return {
    x: Math.min(Math.max(node.x, min), max),
    y: middle + LOOK_AHEAD + (node.y - middle) * FOLLOW_Y,
  };
}

/** `from` moved toward `to` over `deltaMs`, easing out. */
export function glide(from: MapPoint, to: MapPoint, deltaMs: number): MapPoint {
  const k = 1 - Math.exp(-Math.max(0, deltaMs) / GLIDE_MS);
  return { x: from.x + (to.x - from.x) * k, y: from.y + (to.y - from.y) * k };
}
