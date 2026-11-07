/**
 * Light and air per hand-built scene (`MapLook.scene`): the sun, sky and
 * fill, the backdrop, distance fog, a vignette and a few warm lamps inside
 * the room. Levels without a preset get `DEFAULT_ATMOSPHERE`, today's
 * neutral studio light, unchanged. Plain numbers and math, no three.js, so
 * it can be tested; `look.ts` and `stage.ts` turn it into lights and effects.
 */

import { type LevelMap, getTile } from '../../sim/level';
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
  /**
   * Screen edges tinted toward `color`; `inner` is where it starts (share of
   * the half-diagonal). `glow` adds a soft wash of light from one edge of the
   * frame, a low sky's last light: centred at `x`, `y` (shares of the canvas
   * width and height, so 0, 0.1 is the left edge near the top), gone
   * `reach` of the canvas width sideways and 1.4 × `reach` of its height
   * up and down away from there. Plain CSS over the canvas, on every quality.
   */
  vignette?: {
    color: number;
    opacity: number;
    inner: number;
    glow?: { color: number; opacity: number; x: number; y: number; reach: number };
  };
  /**
   * Warm point lights in a row just inside the back wall (and the front wall
   * of a room at least `frontFrom` rows deep), never over the open middle of
   * the floor; no shadows, off on `low`. One per `spacing` tiles along the
   * wall, `inset` grid units in from the wall's inner face, `height` world units up.
   */
  lamps?: {
    color: number;
    intensity: number;
    distance: number;
    height: number;
    spacing: number;
    inset: number;
    frontFrom: number;
  };
  /** Dust drifting in the room's light: `perTile` motes per floor tile, faint and below bloom. */
  motes?: { color: number; opacity: number; perTile: number };
  /**
   * Small motion in the scene round the level (see `WorldFx`), all of it off
   * on `low` and none of it moving within a tile of the play area: steam over
   * the coffee van's hatch, smoke from the narrowboat's chimney, light
   * streaks drifting on the canal, a soft halo round each lamp head, and the
   * room's lamps flickering by `flicker` (a share of their brightness).
   */
  ambient?: { steam: boolean; smoke: boolean; ripples: boolean; halos: boolean; flicker: number };
}

/** Marks what `Stage` hides on `low`: the ambient motion of `Atmosphere.ambient`. */
export const AMBIENT_KEY = 'ambient';

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
 * (about 45° up, so shadows run long toward the camera without swallowing
 * the floor by the back wall), a peach-lavender sky,
 * a cool blue fill in the shade, dusk-violet air at the edges, and the
 * garage's bare bulbs glowing warm inside.
 */
const GOLDEN_HOUR: Atmosphere = {
  sun: {
    color: 0xffcb8e,
    intensity: 3.9,
    from: { x: -7, y: -6, height: 9, perMapSize: false },
    reach: 0.95,
  },
  sky: { sky: 0xc9c6ec, ground: 0x7a7266, intensity: 1 },
  fill: { color: 0xb3c4ee, intensity: 1 },
  environment: 0.16,
  backdrop: { inner: 0x7a6c86, outer: 0x463e58 },
  fog: { color: 0x74688a, start: 0.5, span: 8 },
  vignette: { color: 0x2a2238, opacity: 0.35, inner: 0.7 },
  lamps: {
    color: 0xffa955,
    intensity: 6,
    distance: 4.5,
    height: 1.7,
    spacing: 4,
    inset: 0.55,
    // Front lamps would hang between the camera and the players: only a very deep room gets them.
    frontFrom: 12,
  },
  motes: { color: 0xffe2b0, opacity: 0.55, perTile: 0.6 },
};

/**
 * A bright, crisp Monday morning on a business park: a high, nearly white sun
 * from the right and a little in front (about 53° up, so shadows fall short toward the back
 * left and the back row stays lit), a pale blue sky at the frame edges, a soft
 * cool fill, and cool fluorescent strips humming along the back wall.
 */
const MONDAY_MORNING: Atmosphere = {
  sun: {
    color: 0xfff6ea,
    intensity: 4.5,
    from: { x: 8, y: 3.5, height: 11.5, perMapSize: false },
    reach: 0.95,
  },
  sky: { sky: 0xb4ccff, ground: 0x857a6c, intensity: 1.4 },
  fill: { color: 0xc4d4f4, intensity: 0.65 },
  environment: 0.05,
  backdrop: { inner: 0xc4dcf2, outer: 0x8fb2d6 },
  fog: { color: 0xb4cde6, start: 0.5, span: 9 },
  vignette: { color: 0x2c3e58, opacity: 0.35, inner: 0.7 },
  lamps: {
    color: 0xe8f2ff,
    intensity: 3,
    distance: 4.5,
    height: 2.05,
    spacing: 4,
    inset: 0.25,
    frontFrom: 12,
  },
};

/**
 * Late afternoon turning to evening by the canal: a warm sun low-ish from the
 * west (left and a little in front, about 42° up, so the back row still reads
 * and the factory's front catches it), a deepening blue sky at the frame edges,
 * warm Edison bulbs flickering along the back wall, steam over the coffee van
 * and light drifting on the canal.
 */
const CANAL_EVENING: Atmosphere = {
  sun: {
    color: 0xffe4c8,
    intensity: 5,
    from: { x: -9, y: 3.5, height: 8.5, perMapSize: false },
    reach: 0.95,
  },
  sky: { sky: 0xc2cef0, ground: 0x7a7068, intensity: 1.3 },
  fill: { color: 0xd8dcf0, intensity: 1.45 },
  environment: 0.18,
  backdrop: { inner: 0x6a7cb0, outer: 0x2a3462 },
  fog: { color: 0x52608e, start: 0.5, span: 8 },
  vignette: { color: 0x1a2a68, opacity: 0.35, inner: 0.7 },
  lamps: {
    color: 0xffb060,
    intensity: 6,
    distance: 4.5,
    height: 1.7,
    spacing: 4,
    inset: 0.55,
    frontFrom: 12,
  },
  motes: { color: 0xffe2b0, opacity: 0.45, perTile: 0.4 },
  ambient: { steam: true, smoke: true, ripples: true, halos: true, flicker: 0.05 },
};

/**
 * Blue hour on launch night, on a city-centre rooftop: the sun just set in
 * the west (left), its last rose-amber light grazing in low from the left
 * and a little behind (about 45° up, so the back row still reads), a deep
 * blue-violet sky at the frame edges, and cool-white LED pendants along the
 * back wall keeping the loft bright and clean. Cooler and crisper than the
 * canal evening: a near-white sky light and fill, so stations stay true.
 */
const BLUE_HOUR: Atmosphere = {
  sun: {
    color: 0xffd6bc,
    intensity: 3.3,
    from: { x: -8.5, y: -2, height: 8.5, perMapSize: false },
    reach: 0.95,
  },
  sky: { sky: 0xcdd8fa, ground: 0x6e7288, intensity: 1.6 },
  fill: { color: 0xe2e8ff, intensity: 1.4 },
  environment: 0.14,
  backdrop: { inner: 0x434f92, outer: 0x1b1d4a },
  fog: { color: 0x2e3a7a, start: 0.5, span: 11 },
  vignette: {
    color: 0x141a4c,
    opacity: 0.35,
    inner: 0.7,
    // The last of the sunset, low in the west.
    glow: { color: 0xff8a72, opacity: 0.3, x: 0, y: 0.08, reach: 0.4 },
  },
  lamps: {
    color: 0xeef2ff,
    intensity: 4,
    distance: 4.5,
    height: 2,
    spacing: 4,
    inset: 0.45,
    frontFrom: 12,
  },
};

/** Presets per `MapLook.scene` id. */
export const ATMOSPHERES: Readonly<Record<string, Atmosphere>> = {
  garage: GOLDEN_HOUR,
  'open-plan': MONDAY_MORNING,
  'scale-up': CANAL_EVENING,
  'seed-round': BLUE_HOUR,
};

/** The light and air for a scene id; the default for none or an unknown one. */
export function atmosphereFor(scene: string | undefined): Atmosphere {
  return scene !== undefined && Object.hasOwn(ATMOSPHERES, scene)
    ? (ATMOSPHERES[scene] ?? DEFAULT_ATMOSPHERE)
    : DEFAULT_ATMOSPHERE;
}

/** The scene id whose preset `atmosphere` is, if it is one. */
export function sceneOf(atmosphere: Atmosphere): string | undefined {
  return Object.keys(ATMOSPHERES).find((id) => ATMOSPHERES[id] === atmosphere);
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

/**
 * Where the lamps hang: a row just inside the back wall, and in a room at
 * least `frontFrom` rows deep a second one inside the front wall, over the
 * wall-side row and never over the open middle of the floor. With tiles (a
 * real map) each row spans only the room's inside along that wall, so an
 * L-shaped room keeps its lamps under its own ceiling, and a second room
 * whose back wall sits a row or two lower (two units off one hallway) gets
 * its own row along that wall.
 */
export function lampSpots(
  atmosphere: Atmosphere,
  map: Pick<LevelMap, 'width' | 'height'> & Partial<Pick<LevelMap, 'tiles'>>,
): Vec3[] {
  const lamps = atmosphere.lamps;
  if (!lamps) return [];
  // The wall's inner face is half a tile in from its row's center.
  const rows = backRows(map).map((r) => ({ ...r, y: r.inside - 0.5 + lamps.inset }));
  if (map.height >= lamps.frontFrom) {
    const [x0, x1] = insideSpan(map, map.height - 2);
    rows.push({ y: map.height - 1.5 - lamps.inset, inside: map.height - 2, x0, x1 });
  }
  return rows.flatMap(({ y, x0, x1 }) => {
    if (x1 < x0) return [];
    const length = x1 - x0 + 1;
    const count = Math.max(1, Math.round(length / lamps.spacing));
    return Array.from({ length: count }, (_, i) =>
      gridToWorld(x0 - 0.5 + (length * (i + 0.5)) / count, y, lamps.height),
    );
  });
}

/**
 * The runs of floor along a back wall: per column the first row inside the
 * room (from row 1, under the wall line), grouped into runs of neighbouring
 * columns that share it. Only rows near the top count, so a hallway's wall
 * in the middle of the map never gets lamps; runs beside the room's first row need three tiles. Without tiles, the
 * whole width along row 1.
 */
function backRows(
  map: Pick<LevelMap, 'width' | 'height'> & Partial<Pick<LevelMap, 'tiles'>>,
): { inside: number; x0: number; x1: number }[] {
  if (!map.tiles) return [{ inside: 1, x0: 1, x1: Math.max(1, map.width - 2) }];
  const full = map as LevelMap;
  const deepest = Math.max(1, Math.floor(map.height * 0.3));
  const tops: (number | null)[] = [];
  for (let x = 0; x < map.width; x++) {
    let top: number | null = null;
    for (let y = 1; y <= deepest && top === null; y++) {
      const tile = getTile(full, x, y);
      if (tile !== null && tile !== 'wall' && tile !== 'void') top = y;
    }
    tops.push(top);
  }
  const runs: { inside: number; x0: number; x1: number }[] = [];
  for (let x = 0; x < tops.length; x++) {
    const top = tops[x];
    if (top === null || top === undefined) continue;
    const last = runs[runs.length - 1];
    if (last && last.inside === top && last.x1 === x - 1) last.x1 = x;
    else runs.push({ inside: top, x0: x, x1: x });
  }
  if (runs.length === 0) return [];
  // The room's first row spans its whole inside along the wall (stubs and notches included)...
  const first = Math.min(...runs.map((r) => r.inside));
  const main = runs.filter((r) => r.inside === first);
  const x0 = Math.min(...main.map((r) => r.x0));
  const x1 = Math.max(...main.map((r) => r.x1));
  // ...and a deeper run counts only beside it, at least three tiles long: a second room.
  const apart = runs.filter(
    (r) => r.inside !== first && (r.x0 > x1 || r.x1 < x0) && r.x1 - r.x0 >= 2,
  );
  return [{ inside: first, x0, x1 }, ...apart];
}

/** The first and last column of a row inside the room: not wall or void (all but the edges without tiles). */
function insideSpan(
  map: Pick<LevelMap, 'width' | 'height'> & Partial<Pick<LevelMap, 'tiles'>>,
  y: number,
): [number, number] {
  if (!map.tiles) return [1, Math.max(1, map.width - 2)];
  const full = map as LevelMap;
  let x0 = map.width;
  let x1 = -1;
  for (let x = 0; x < map.width; x++) {
    const tile = getTile(full, x, y);
    if (tile === null || tile === 'wall' || tile === 'void') continue;
    x0 = Math.min(x0, x);
    x1 = Math.max(x1, x);
  }
  return [x0, x1];
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
