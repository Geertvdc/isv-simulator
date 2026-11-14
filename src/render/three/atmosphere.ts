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
  /**
   * A follow-spot style wash on the level only, no shadows: a spot light from
   * `from` (like the sun's) at the map's center, its cone just wide enough
   * for a circle `spread` × the map's longer side across, soft at the rim, so
   * the room is brighter than the world round it (a lit stage in a dark hall).
   */
  wash?: { color: number; intensity: number; from: SunPlacement; spread: number };
  /**
   * Working light in the world beside the room, never on it: `perSide` point
   * lights down each side, `out` grid units outside the outline and `height`
   * up, `left` and `right` colored, reaching `distance`. No shadows, off on `low`.
   */
  sides?: {
    left: number;
    right: number;
    intensity: number;
    distance: number;
    height: number;
    out: number;
    perSide: number;
  };
  /**
   * The sky light's intensity on `low` quality instead of `sky.intensity`:
   * low hides the point lights (`sides`, `lamps`), so a set lit mostly by
   * them gets its light back from the sky there. Every quality uses
   * `sky.intensity` when left out.
   */
  lowSky?: number;
  /** A weak light from the camera side that lifts the shadow sides. */
  fill: { color: number; intensity: number };
  /**
   * Ambient occlusion's strength instead of the stage's usual 3.5 (high and
   * medium only): lower for a dark set, where full occlusion turns its
   * corners and stacked cases to soot.
   */
  occlusion?: number;
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
   * up and down away from there. `band` tints the top, right and bottom
   * edges toward `color` as well, `opacity` at the edge and gone `depth` in
   * (a share of the canvas's height, or width for the right edge): the sky's color all round the frame,
   * where the corner-shaped vignette barely reaches the middles of the edges.
   * Plain CSS over the canvas, on every quality.
   */
  vignette?: {
    color: number;
    opacity: number;
    inner: number;
    glow?: { color: number; opacity: number; x: number; y: number; reach: number };
    band?: { opacity: number; depth: number };
    /** More glows like `glow`, drawn over it in order: a second edge, a haze under the top. */
    glows?: { color: number; opacity: number; x: number; y: number; reach: number }[];
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
    /** Colors cycled along the lamps (`lampSpots` order) instead of `color`: a stage's gelled par cans. */
    colors?: number[];
    /**
     * A soft glow round each lamp's lens (see `WorldFx`), in the lamp's own
     * color: `size` world units across, under the bloom. Off on `low`.
     */
    halo?: { size: number; opacity: number };
    /**
     * The lamps swell and dim in a slow wave along the row, a share `depth`
     * of their brightness, once every `seconds`: a live show's chase. Off on `low`.
     */
    chase?: { depth: number; seconds: number };
    /**
     * One tired tube: the lamp `index` (`lampSpots` order, from the end with a
     * negative one) drops out by `depth` in a short stutter once every
     * `seconds` (see `stutterLevel`), and is steady in between. Off on `low`.
     */
    stutter?: { index: number; depth: number; seconds: number };
  };
  /**
   * Coloured light from the world's own fittings, never from over the open
   * floor (see `accentSpots`): a beacon over the inbox, a glow off one side
   * of the outline, among the interior walls or in the light wells. Point
   * lights with no shadows, off on `low`; a `halo` draws a soft glow at the
   * light in its color, and `blink` switches it on and off that many times a
   * second (on for half of each beat).
   */
  accents?: Accent[];
  /**
   * Snow falling in the light wells behind the back wall (`lightWellSpots`):
   * `perWell` flakes each, `size` world units, drifting down `fall` units a
   * second through a column `spread` wide, never over the room. Off on `low`.
   */
  snow?: {
    color: number;
    opacity: number;
    perWell: number;
    size: number;
    fall: number;
    spread: number;
  };
  /**
   * Street light falling down each light well: a faint additive cone from
   * the top of the well, `length` long and `radius` wide at its foot, leaning
   * `lean` radians toward the camera. It lights nothing. Off on `low`.
   */
  shafts?: { color: number; opacity: number; length: number; radius: number; lean: number };
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
  /**
   * A rotating incident beacon (see `WorldFx`): a fan of `color` light swept
   * round `turns` times a second from the lens of the room's own beacon on
   * the back wall, `reach` world units long, bright enough to bloom at its
   * core and flaring each time it faces the camera. Off on `low`.
   */
  beacon?: { color: number; turns: number; reach: number };
  /**
   * A faint glint of each lamp (`lampSpots`) on a polished floor: a soft
   * round patch `size` world units across, `forward` grid units in front of
   * the lamp (toward the camera, where its reflection shows), and only on
   * open floor. Under the bloom threshold, off on `low` with the lamps.
   */
  glints?: { color: number; opacity: number; size: number; forward: number };
  /**
   * Moving heads sweeping through the haze (see `WorldFx`): `heads` faint
   * additive cones hung from the scene's truss rig, `length` world units
   * long and `radius` wide at their far end, leaning `lean` radians toward
   * the camera and swung side to side by up to `degrees` once every
   * `seconds`, neighbours in mirror. They light nothing (no light, no
   * shadows) and end high over the back wall, never over a station. Off on `low`.
   */
  sweep?: {
    color: number;
    opacity: number;
    heads: number;
    length: number;
    radius: number;
    lean: number;
    degrees: number;
    seconds: number;
  };
}

/**
 * Where an accent light hangs: over the inbox tiles, pulled `out` toward the
 * room (negative: out of it) and `shift` along x (`inbox`); over the middle
 * of the pager board's wall tile (`pagerTile`), pulled `out` the same way
 * (`pager`); `out` grid units outside the outline's left or right edge,
 * a share `along` of its depth from the back (`left`, `right`); over the
 * middle of the interior walls (`core`, none without them); or in each
 * light well (`wells`, see `lightWellSpots`).
 */
export type AccentAnchor = 'inbox' | 'pager' | 'left' | 'right' | 'core' | 'wells';

export interface Accent {
  anchor: AccentAnchor;
  color: number;
  intensity: number;
  distance: number;
  /** World units over the floor (for `wells`, over the well's middle). */
  height: number;
  out?: number;
  along?: number;
  /** World units along x after placing (`inbox`): the beacon sits off the board's middle. */
  shift?: number;
  blink?: number;
  halo?: { size: number; opacity: number };
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
  sky: { sky: 0xb4ccff, ground: 0x857a6c, intensity: 1.8 },
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
    color: 0xffe4d0,
    intensity: 3.3,
    from: { x: -8.5, y: -2, height: 8.5, perMapSize: false },
    reach: 0.95,
  },
  sky: { sky: 0xcdd8fa, ground: 0x6e7288, intensity: 1.6 },
  fill: { color: 0xe2e8ff, intensity: 1.4 },
  environment: 0.14,
  backdrop: { inner: 0x434f92, outer: 0x1b1d4a },
  fog: { color: 0x2a3c8c, start: 0.5, span: 11 },
  vignette: {
    color: 0x1a2a78,
    opacity: 0.38,
    inner: 0.7,
    // The last of the sunset, low in the west: over the terrace, under the order cards.
    glow: { color: 0xff8a72, opacity: 0.35, x: 0, y: 0.45, reach: 0.38 },
    band: { opacity: 0.32, depth: 0.1 },
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
  // Someone switched the incident beacon on: prod is down on launch night.
  beacon: { color: 0xff3a2a, turns: 1, reach: 0.7 },
  glints: { color: 0xeef2ff, opacity: 0.3, size: 1.1, forward: 1.2 },
};

/**
 * Stage lighting at the accelerator's Demo Day: a near-neutral front-of-house
 * key and wash (from the front and high, about 47° up, so shadows fall
 * upstage behind people and props and the back row stays lit), kept just
 * under the point where the station tops wash out to pastel, and only a
 * touch warm, so the dark wall caps stay grey. The hall round the stage is
 * dark, with soft blue-grey working light in the wings (it carries the
 * frame's brightness, not the stage key), faint blue and violet at the
 * edges and a haze glowing under the truss over the LED wall. Par cans on
 * the truss along the back wall swell in a slow chase, and two moving heads
 * sweep through the haze.
 */
const STAGE_LIGHTS: Atmosphere = {
  sun: {
    color: 0xffecd6,
    intensity: 4.2,
    from: { x: -2.5, y: 7.5, height: 8.5, perMapSize: false },
    reach: 0.95,
  },
  wash: {
    color: 0xfff2e4,
    intensity: 2.2,
    from: { x: 0, y: 9, height: 10, perMapSize: false },
    spread: 1.05,
  },
  sides: {
    left: 0xbcc6e2,
    right: 0xc6bce4,
    intensity: 180,
    distance: 4.6,
    height: 2.2,
    out: 3.6,
    perSide: 3,
  },
  sky: { sky: 0xeceef4, ground: 0x5c5a64, intensity: 1.3 },
  // Low hides the wings' working lights: the sky makes up for them there.
  lowSky: 2.6,
  fill: { color: 0xeef0ff, intensity: 1.0 },
  occlusion: 2.2,
  environment: 0.14,
  backdrop: { inner: 0x2c2658, outer: 0x0e0c20 },
  fog: { color: 0x1c1a40, start: 0.5, span: 10 },
  vignette: {
    color: 0x120e2c,
    opacity: 0.38,
    inner: 0.7,
    // Blue working light in the wings (left)...
    glow: { color: 0x6f8ee6, opacity: 0.16, x: 0, y: 0.55, reach: 0.3 },
    glows: [
      // ...YOTTA-violet back light on the tech side (right)...
      { color: 0x9a80ec, opacity: 0.16, x: 1, y: 0.55, reach: 0.3 },
      // ...and haze glowing under the truss, in front of the LED wall.
      { color: 0xc8b8ff, opacity: 0.26, x: 0.62, y: 0, reach: 0.3 },
    ],
  },
  lamps: {
    color: 0xfff0dc,
    intensity: 5,
    distance: 4.5,
    height: 2.2,
    spacing: 3,
    inset: 0.45,
    frontFrom: 12,
    colors: [0xfff0dc, 0xb8a4ff],
    halo: { size: 0.6, opacity: 0.5 },
    chase: { depth: 0.18, seconds: 6 },
  },
  glints: { color: 0xfff0dc, opacity: 0.22, size: 1.8, forward: 1.2 },
  // Two moving heads on the batten over the LED wall, sweeping through the haze.
  sweep: {
    color: 0xd8ccff,
    opacity: 0.12,
    heads: 2,
    length: 1.45,
    radius: 0.32,
    lean: 0.25,
    degrees: 20,
    seconds: 8,
  },
};

/**
 * 3 AM in the basement server room on a snowy winter night, lit for work:
 * a cool fluorescent key from the front and high (about 52° up, so the
 * back wall's shadow stays short and the back row reads), a fill only a
 * touch cool (bluer turns the yellow test benches olive), and fluorescent
 * tubes along the back wall, one of them tired. Round the room the
 * basement is dark grey-blue: the boiler glows orange off the left edge,
 * the racks glow blue-green among the server room's walls, the pager's red
 * beacon blinks on its board past the inbox, and orange street light falls down the
 * light wells at the back with snow in it.
 */
const NIGHT_SHIFT: Atmosphere = {
  sun: {
    color: 0xf6f8f8,
    intensity: 2.6,
    from: { x: 1.5, y: 7, height: 9, perMapSize: false },
    reach: 0.95,
  },
  // The work light: a little brighter on the room than on the basement round it.
  wash: {
    color: 0xfff4e0,
    intensity: 1.65,
    from: { x: 0, y: 6, height: 10, perMapSize: false },
    spread: 1.1,
  },
  sky: { sky: 0xc4d0de, ground: 0x4e565c, intensity: 0.74 },
  lowSky: 1.1,
  fill: { color: 0xe8eef8, intensity: 0.75 },
  environment: 0.08,
  backdrop: { inner: 0x3a434e, outer: 0x161b22 },
  fog: { color: 0x262e38, start: 0.5, span: 10 },
  vignette: {
    color: 0x0c1218,
    opacity: 0.35,
    inner: 0.7,
    // The boiler's warmth off the left edge.
    glow: { color: 0xff8a3a, opacity: 0.12, x: 0, y: 0.3, reach: 0.2 },
  },
  lamps: {
    color: 0xeef6ff,
    intensity: 4,
    distance: 4.5,
    height: 2.1,
    spacing: 3.5,
    inset: 0.4,
    // Back wall only: a tube by the front wall would hang over the players' heads on screen.
    frontFrom: 99,
    stutter: { index: -1, depth: 0.75, seconds: 7 },
  },
  accents: [
    // The beacon on top of the pager board, on the wall tile past the inbox's fire door (`pagerTile`).
    {
      anchor: 'pager',
      color: 0xff2a1e,
      intensity: 2.2,
      distance: 2.2,
      height: 1.51,
      out: -0.12,
      blink: 1,
      halo: { size: 0.32, opacity: 0.85 },
    },
    // The boiler's flame window, off the left edge.
    {
      anchor: 'left',
      color: 0xf09a60,
      intensity: 22,
      distance: 3.2,
      height: 1.0,
      out: 1.9,
      along: 0.15,
    },
    // A sodium pool on the floor in the front right corner, under the well-side vent.
    {
      anchor: 'right',
      color: 0xffa850,
      intensity: 3,
      distance: 1.8,
      height: 0.7,
      out: 1.3,
      along: 0.82,
    },
    // The racks, inside the server room's walls.
    { anchor: 'core', color: 0x3ad2bc, intensity: 2, distance: 4, height: 1.9 },
    // Sodium street light down the light wells.
    // High in the shaft, by the street, so the snow drift on the sill stays cold white.
    { anchor: 'wells', color: 0xffb060, intensity: 2.5, distance: 2.2, height: 0.55 },
  ],
  snow: { color: 0xe8f0ff, opacity: 0.95, perWell: 45, size: 0.12, fall: 0.22, spread: 0.8 },
  shafts: { color: 0xffa040, opacity: 0.22, length: 1.8, radius: 0.32, lean: 0.3 },
};

/** Presets per `MapLook.scene` id. */
export const ATMOSPHERES: Readonly<Record<string, Atmosphere>> = {
  garage: GOLDEN_HOUR,
  'open-plan': MONDAY_MORNING,
  'scale-up': CANAL_EVENING,
  'seed-round': BLUE_HOUR,
  'demo-day': STAGE_LIGHTS,
  'on-call': NIGHT_SHIFT,
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

/** The wash's spot light for a map: where it stands, where it points, and its cone's half-angle. */
export function washPlacement(
  atmosphere: Atmosphere,
  map: Pick<LevelMap, 'width' | 'height'>,
): { position: Vec3; target: Vec3; angle: number } | null {
  const wash = atmosphere.wash;
  if (!wash) return null;
  const { width, height } = map;
  const cx = (width - 1) / 2;
  const cy = (height - 1) / 2;
  const { from } = wash;
  const sx = from.perMapSize ? width : 1;
  const sy = from.perMapSize ? height : 1;
  const position = gridToWorld(cx + from.x * sx, cy + from.y * sy, from.height);
  const target = gridToWorld(cx, cy);
  const distance = Math.hypot(position.x - target.x, position.y - target.y, position.z - target.z);
  const radius = (Math.max(width, height) * wash.spread) / 2;
  return { position, target, angle: Math.atan2(radius, distance) };
}

/** Where the side working lights stand (`Atmosphere.sides`), each with its color. */
export function sideLightSpots(
  atmosphere: Atmosphere,
  map: Pick<LevelMap, 'width' | 'height'>,
): { at: Vec3; color: number }[] {
  const sides = atmosphere.sides;
  if (!sides) return [];
  const n = Math.max(1, sides.perSide);
  return [-1, 1].flatMap((side) =>
    Array.from({ length: n }, (_, i) => {
      const x = side < 0 ? -0.5 - sides.out : map.width - 0.5 + sides.out;
      const y = -0.5 + (map.height * (i + 0.5)) / n;
      return { at: gridToWorld(x, y, sides.height), color: side < 0 ? sides.left : sides.right };
    }),
  );
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

/** The color of the lamp at `index` in `lampSpots`: `colors` in turn, or `color`. */
export function lampColor(atmosphere: Atmosphere, index: number): number {
  const lamps = atmosphere.lamps;
  if (!lamps) return 0xffffff;
  const colors = lamps.colors ?? [];
  return colors.length > 0 ? (colors[index % colors.length] ?? lamps.color) : lamps.color;
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

/** Where the lamps' glints lie on the floor (`Atmosphere.glints`): in front of each lamp, on open floor only. */
export function glintSpots(atmosphere: Atmosphere, map: LevelMap): Vec3[] {
  const glints = atmosphere.glints;
  if (!glints) return [];
  return lampSpots(atmosphere, map).flatMap((lamp) => {
    const z = lamp.z + glints.forward;
    return getTile(map, Math.round(lamp.x), Math.round(z)) === 'floor'
      ? [{ x: lamp.x, y: 0, z }]
      : [];
  });
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

/** The default light well: behind the back wall's outer face and over the wall tops. */
export const LIGHT_WELL = { back: 0.45, height: 1.8, width: 0.9, tall: 0.6 } as const;

/** A light well's opening: its middle (world units, at the shaft's mid-depth) and its width and height. */
export interface LightWell {
  at: Vec3;
  w: number;
  h: number;
}

/**
 * Where the light wells open in the foundation wall behind the back wall,
 * when the scene doesn't say (see `lightWells.ts`): two on a narrow map,
 * three from 16 tiles wide, spread evenly along it, just over the wall tops.
 */
export function lightWellSpots(map: Pick<LevelMap, 'width' | 'height'>): LightWell[] {
  const count = map.width >= 16 ? 3 : 2;
  return Array.from({ length: count }, (_, i) => ({
    at: gridToWorld(
      -0.5 + (map.width * (i + 0.5)) / count,
      -0.5 - LIGHT_WELL.back,
      LIGHT_WELL.height,
    ),
    w: LIGHT_WELL.width,
    h: LIGHT_WELL.tall,
  }));
}

/** An accent light (`Atmosphere.accents`) where it hangs, by its index in `accents`. */
export interface AccentSpot {
  at: Vec3;
  accent: Accent;
  index: number;
}

/** Where the accent lights hang for a map (see `AccentAnchor`). */
export function accentSpots(
  atmosphere: Atmosphere,
  map: Pick<LevelMap, 'width' | 'height'> & Partial<Pick<LevelMap, 'tiles'>>,
  wells: LightWell[] = lightWellSpots(map),
): AccentSpot[] {
  return (atmosphere.accents ?? []).flatMap((accent, index) =>
    accentPoints(accent, map, wells).map((at) => ({ at, accent, index })),
  );
}

function accentPoints(
  accent: Accent,
  map: Pick<LevelMap, 'width' | 'height'> & Partial<Pick<LevelMap, 'tiles'>>,
  wells: LightWell[],
): Vec3[] {
  const out = accent.out ?? 0;
  const z = -0.5 + map.height * (accent.along ?? 0.5);
  switch (accent.anchor) {
    case 'left':
      return [gridToWorld(-0.5 - out, z, accent.height)];
    case 'right':
      return [gridToWorld(map.width - 0.5 + out, z, accent.height)];
    case 'wells':
      return wells.map((w) => ({ ...w.at, y: w.at.y + accent.height }));
    case 'inbox': {
      if (!map.tiles) return [];
      const full = map as LevelMap;
      const tiles = tilesOf(full, (t) => t === 'inbox');
      if (tiles.length === 0) return [];
      const mx = tiles.reduce((a, t) => a + t.x, 0) / tiles.length;
      const my = tiles.reduce((a, t) => a + t.y, 0) / tiles.length;
      // Toward the room: away from the nearest map edge.
      const edges = [
        { d: mx, dx: 1, dy: 0 },
        { d: map.width - 1 - mx, dx: -1, dy: 0 },
        { d: my, dx: 0, dy: 1 },
        { d: map.height - 1 - my, dx: 0, dy: -1 },
      ].sort((a, b) => a.d - b.d);
      const toward = edges[0] ?? { dx: 0, dy: 1 };
      const shift = accent.shift ?? 0;
      return [gridToWorld(mx + toward.dx * out + shift, my + toward.dy * out, accent.height)];
    }
    case 'pager': {
      if (!map.tiles) return [];
      const tile = pagerTile(map as LevelMap);
      if (!tile) return [];
      return [gridToWorld(tile.x + tile.into.dx * out, tile.y + tile.into.dy * out, accent.height)];
    }
    case 'core': {
      if (!map.tiles) return [];
      const full = map as LevelMap;
      // Interior walls: not on the map's edge and not beside a void.
      const inner = tilesOf(full, (t, x, y) => {
        if (t !== 'wall' || x === 0 || y === 0 || x === map.width - 1 || y === map.height - 1)
          return false;
        return [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ].every(([dx = 0, dy = 0]) => getTile(full, x + dx, y + dy) !== 'void');
      });
      if (inner.length === 0) return [];
      const mx = inner.reduce((a, t) => a + t.x, 0) / inner.length;
      const my = inner.reduce((a, t) => a + t.y, 0) / inner.length;
      return [gridToWorld(mx, my, accent.height)];
    }
  }
}

/**
 * The wall tile the pager board stands on: the first wall tile after the
 * inbox run along the inbox's edge, +x for an inbox on the back or front
 * edge, +y for one on the left or right edge (the same rule as the room's
 * `pagerBoardTile`), with the step `into` the room from that edge. Null
 * without an inbox or a wall past it.
 */
export function pagerTile(
  map: LevelMap,
): { x: number; y: number; into: { dx: number; dy: number } } | null {
  const tiles = tilesOf(map, (t) => t === 'inbox');
  if (tiles.length === 0) return null;
  const mx = tiles.reduce((a, t) => a + t.x, 0) / tiles.length;
  const my = tiles.reduce((a, t) => a + t.y, 0) / tiles.length;
  const edges = [
    { d: my, dx: 0, dy: 1 },
    { d: map.height - 1 - my, dx: 0, dy: -1 },
    { d: mx, dx: 1, dy: 0 },
    { d: map.width - 1 - mx, dx: -1, dy: 0 },
  ].sort((a, b) => a.d - b.d);
  const into = edges[0] ?? { dx: 0, dy: 1 };
  // Along the edge: +x on the back or front, +y on the left or right.
  const ax = into.dy !== 0 ? 1 : 0;
  const ay = 1 - ax;
  const line = tiles.filter((t) => (ax ? t.y === Math.round(my) : t.x === Math.round(mx)));
  const run = line.length > 0 ? line : tiles;
  let x = ax ? Math.max(...run.map((t) => t.x)) : Math.round(mx);
  let y = ay ? Math.max(...run.map((t) => t.y)) : Math.round(my);
  for (;;) {
    x += ax;
    y += ay;
    const tile = getTile(map, x, y);
    if (tile === null) return null;
    if (tile === 'wall') return { x, y, into: { dx: into.dx, dy: into.dy } };
  }
}

function tilesOf(
  map: LevelMap,
  test: (tile: string, x: number, y: number) => boolean,
): { x: number; y: number }[] {
  const found: { x: number; y: number }[] = [];
  for (let y = 0; y < map.height; y++)
    for (let x = 0; x < map.width; x++) {
      const tile = getTile(map, x, y);
      if (tile !== null && test(tile, x, y)) found.push({ x, y });
    }
  return found;
}

/** Whether a blinking accent is lit at `timeMs`: on for the first half of each of `perSecond` beats a second. */
export function blinkOn(timeMs: number, perSecond: number): boolean {
  if (perSecond <= 0) return true;
  return ((timeMs / 1000) * perSecond) % 1 < 0.5;
}

/**
 * A tired tube's brightness at `timeMs`, in [1 - depth, 1]: steady, then
 * once every `seconds` a short stutter (three quick drop-outs over about
 * half a second), the same every time.
 */
export function stutterLevel(timeMs: number, seconds: number, depth: number): number {
  const t = ((timeMs / 1000) % seconds) - (seconds - 0.6);
  if (t < 0) return 1;
  const out = (t > 0 && t < 0.07) || (t > 0.16 && t < 0.2) || (t > 0.32 && t < 0.46);
  return out ? 1 - depth : 1;
}

/** Which lamp of `count` stutters (`lamps.stutter.index`, negative from the end), or null. */
export function stutterIndex(atmosphere: Atmosphere, count: number): number | null {
  const stutter = atmosphere.lamps?.stutter;
  if (!stutter || count === 0) return null;
  const i = stutter.index < 0 ? count + stutter.index : stutter.index;
  return i >= 0 && i < count ? i : null;
}

/** A snowflake: its column's top (world units), how far it falls, and its fall phase in [0, 1). */
export interface FlakeSeed {
  at: Vec3;
  drop: number;
  phase: number;
}

/**
 * The snowflakes in the light wells, the same every time for a map: a column
 * `spread` wide over each well, from above the frame down to the well's sill,
 * all behind the back wall's outer face.
 */
export function snowSeeds(
  atmosphere: Atmosphere,
  map: Pick<LevelMap, 'width' | 'height'>,
  wells: LightWell[] = lightWellSpots(map),
): FlakeSeed[] {
  const snow = atmosphere.snow;
  if (!snow) return [];
  return wells.flatMap((well, w) => {
    // From the street over the opening down to its sill.
    const top = well.at.y + well.h / 2 + 1.0;
    const sill = well.at.y - well.h / 2;
    const spread = Math.min(snow.spread, well.w * 0.9);
    return Array.from({ length: snow.perWell }, (_, k) => {
      const i = w * 1000 + k;
      return {
        at: {
          x: well.at.x + (unit(i, 11) - 0.5) * spread,
          y: top,
          // In the shaft, never in front of the wall.
          z: well.at.z + (unit(i, 12) - 0.5) * 0.3,
        },
        drop: top - sill,
        phase: unit(i, 13),
      };
    });
  });
}
