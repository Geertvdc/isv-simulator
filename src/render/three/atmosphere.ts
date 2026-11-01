/**
 * Light and air per hand-built scene (`MapLook.scene`): the sun, sky and
 * fill, the backdrop, distance fog, a vignette and a few warm lamps inside
 * the room. Levels without a preset get `DEFAULT_ATMOSPHERE`, today's
 * neutral studio light, unchanged. Plain numbers and math, no three.js, so
 * it can be tested; `look.ts` and `stage.ts` turn it into lights and effects.
 */

import type { LevelMap } from '../../sim/level';
import { type CameraPose, type Vec3, gridToWorld, projectPoint } from '../projection';

/**
 * Where the sun shines from, relative to the map's center: `x`/`y` in grid
 * units (or shares of the map's size when `perMapSize`), `height` in world units.
 */
export interface SunPlacement {
  x: number;
  y: number;
  height: number;
  perMapSize: boolean;
}

export interface Atmosphere {
  sun: {
    color: number;
    intensity: number;
    from: SunPlacement;
    /** Half the shadow camera's size, as a share of the map's longer side. */
    reach: number;
  };
  /** Hemisphere light: sky color from above, bounce color from the ground. */
  sky: { sky: number; ground: number; intensity: number };
  /** A weak light from the camera side that lifts the shadow sides. */
  fill: { color: number; intensity: number };
  /** How much the soft room reflections show on materials. */
  environment: number;
  /** Behind the diorama, a radial gradient; none for the menus' dark blue. */
  backdrop?: { inner: number; outer: number };
  /**
   * Linear fog by view depth, starting `start` units behind the level's
   * farthest floor corner and solid `span` units later: far ground melts into
   * the backdrop instead of ending against it.
   */
  fog?: { color: number; start: number; span: number };
  /** Screen edges tinted toward `color`; `inner` is where it starts (share of the half-diagonal). */
  vignette?: { color: number; opacity: number; inner: number };
  /**
   * Warm point lights under the room's ceiling, no shadows; off on `low`.
   * One per `spacing` tiles along the room, `height` world units up.
   */
  lamps?: { color: number; intensity: number; distance: number; height: number; spacing: number };
  /** Dust drifting in the room's light: `perTile` motes per floor tile, faint and below bloom. */
  motes?: { color: number; opacity: number; perTile: number };
}

/** Today's look: a bright neutral studio, sun from behind and left about 58° up. */
export const DEFAULT_ATMOSPHERE: Atmosphere = {
  sun: {
    color: 0xffe9c7,
    intensity: 3.6,
    from: { x: -0.3, y: -0.45, height: 12, perMapSize: true },
    reach: 0.72,
  },
  sky: { sky: 0xc9dcff, ground: 0x6e5a48, intensity: 0.6 },
  fill: { color: 0xbfd4ff, intensity: 0.6 },
  environment: 0.2,
};

/**
 * Golden hour on a late-summer afternoon: a low warm sun from the back left
 * (about 38° up, so shadows run long toward the camera), a peach-lavender sky,
 * a cool blue fill in the shade, dusk-violet air at the edges, and the
 * garage's bare bulbs glowing warm inside.
 */
const GOLDEN_HOUR: Atmosphere = {
  sun: {
    color: 0xffbd7a,
    intensity: 3.9,
    from: { x: -7, y: -6, height: 7.2, perMapSize: false },
    reach: 0.95,
  },
  sky: { sky: 0xc9c6ec, ground: 0x8a6643, intensity: 0.8 },
  fill: { color: 0x9db6f0, intensity: 0.6 },
  environment: 0.16,
  backdrop: { inner: 0x7a6c86, outer: 0x463e58 },
  fog: { color: 0x74688a, start: 0.5, span: 8 },
  vignette: { color: 0x2a2238, opacity: 0.5, inner: 0.62 },
  lamps: { color: 0xffa955, intensity: 16, distance: 6.5, height: 2.1, spacing: 4 },
  motes: { color: 0xffe2b0, opacity: 0.55, perTile: 0.6 },
};

/** Presets per `MapLook.scene` id. */
export const ATMOSPHERES: Readonly<Record<string, Atmosphere>> = {
  garage: GOLDEN_HOUR,
};

/** The light and air for a scene id; the default for none or an unknown one. */
export function atmosphereFor(scene: string | undefined): Atmosphere {
  return scene !== undefined && Object.hasOwn(ATMOSPHERES, scene)
    ? (ATMOSPHERES[scene] ?? DEFAULT_ATMOSPHERE)
    : DEFAULT_ATMOSPHERE;
}

/** The sun's world position and where it points for a map. */
export function sunPlacement(
  atmosphere: Atmosphere,
  map: Pick<LevelMap, 'width' | 'height'>,
): { position: Vec3; target: Vec3; reach: number } {
  const { width, height } = map;
  const cx = (width - 1) / 2;
  const cy = (height - 1) / 2;
  const { from, reach } = atmosphere.sun;
  const sx = from.perMapSize ? width : 1;
  const sy = from.perMapSize ? height : 1;
  return {
    position: gridToWorld(cx + from.x * sx, cy + from.y * sy, from.height),
    target: gridToWorld(cx, cy),
    reach: Math.max(width, height) * reach,
  };
}

/** Where the lamps hang: evenly along the room's middle row, under the ceiling. */
export function lampSpots(atmosphere: Atmosphere, map: Pick<LevelMap, 'width' | 'height'>): Vec3[] {
  const lamps = atmosphere.lamps;
  if (!lamps) return [];
  const inner = Math.max(1, map.width - 2);
  const count = Math.max(1, Math.round(inner / lamps.spacing));
  const cy = (map.height - 1) / 2;
  return Array.from({ length: count }, (_, i) =>
    gridToWorld(0.5 + (inner * (i + 0.5)) / count, cy, lamps.height),
  );
}

/** Fog near and far for the camera: it starts behind the level's farthest floor corner. */
export function fogRange(
  atmosphere: Atmosphere,
  map: Pick<LevelMap, 'width' | 'height'>,
  pose: CameraPose,
): { near: number; far: number } | null {
  const fog = atmosphere.fog;
  if (!fog) return null;
  let farthest = 0;
  for (const [x, y] of [
    [-0.5, -0.5],
    [map.width - 0.5, -0.5],
    [-0.5, map.height - 0.5],
    [map.width - 0.5, map.height - 0.5],
  ] as const) {
    farthest = Math.max(farthest, projectPoint(pose, gridToWorld(x, y)).depth);
  }
  const near = farthest + fog.start;
  return { near, far: near + fog.span };
}

/** A dust mote: where it hangs (world units) and its drift phase in [0, 1). */
export interface MoteSeed {
  at: Vec3;
  phase: number;
}

/** Where the dust motes hang inside the room, the same every time for a map. */
export function moteSeeds(
  atmosphere: Atmosphere,
  map: Pick<LevelMap, 'width' | 'height'>,
): MoteSeed[] {
  const motes = atmosphere.motes;
  if (!motes) return [];
  const w = Math.max(1, map.width - 2);
  const h = Math.max(1, map.height - 2);
  const count = Math.round(w * h * motes.perTile);
  return Array.from({ length: count }, (_, i) => {
    const r = (salt: number) => unit(i, salt);
    return {
      at: gridToWorld(0.5 + r(1) * w, 0.5 + r(2) * h, 0.35 + r(3) * 1.6),
      phase: r(4),
    };
  });
}

/** A number in [0, 1) from an index and a salt, like `tileHash`. */
function unit(i: number, salt: number): number {
  const hash = Math.imul(i + 1, 0x9e3779b1) ^ Math.imul(salt, 0x85ebca6b);
  return ((Math.imul(hash ^ (hash >>> 15), 0x2c1b3c6d) >>> 0) % 10007) / 10007;
}

/** A CSS color with alpha. */
export function cssRgba(color: number, alpha: number): string {
  return `rgba(${(color >> 16) & 255}, ${(color >> 8) & 255}, ${color & 255}, ${alpha})`;
}
