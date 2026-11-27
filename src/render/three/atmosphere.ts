/**
 * Light and air per hand-built scene (`MapLook.scene`): the sun, sky and
 * fill, the backdrop, distance fog, a vignette and a few warm lamps inside
 * the room. Levels without a preset get `DEFAULT_ATMOSPHERE`, today's
 * neutral studio light, unchanged. Plain numbers and math, no three.js, so
 * it can be tested; `look.ts` and `stage.ts` turn it into lights and effects.
 */

import { REORG_WARNING_TICKS } from '../../sim/balance';
import { type LevelMap, type Tile, getTile } from '../../sim/level';
import { withoutReorgTiles } from '../../sim/reorgs';
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
    /** The shadows' blur radius instead of the usual 4: higher for an overcast sky's soft ones. */
    softness?: number;
  };
  /**
   * The day passing with a reorg level's layouts: the sun and the fill per
   * phase (`phases[0]` for phase 1, the map's own; the last for any phase
   * past the end), blended over each reorg's warning up to its switch (see
   * `dayClock`), from the sim's tick, so a still of any moment is the same
   * every time. `sun` and `fill` are phase 1's. The sun keeps its `reach`
   * and `softness`; nothing else changes.
   */
  day?: { phases: DayLight[] };
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
   * One more soft warm wash per floor of a map made of separate rooms (see
   * `floorRows`, left to right), on top of `wash`: a spot light `height`
   * world units over a point `forward` grid units in front of the floor's
   * middle, aimed at a point `depth` rows in from the floor's back wall and
   * wide enough for a circle `radius` grid units round it (or the floor's
   * half-width, if larger), soft at the rim. `intensity` per floor in turn,
   * none for a floor past its end: an office's own lights, brighter on one
   * floor than on another. No shadows; on every quality, so `low` keeps it.
   */
  pools?: {
    color: number;
    intensity: number[];
    height: number;
    forward: number;
    depth: number;
    radius: number;
    /**
     * One pool per room of the map instead of per floor run (see `roomRows`:
     * each connected floor area, top to bottom, then left to right), so a
     * room low on the map gets its own; a room wider than two `radius` is
     * lit by a row of pools side by side, each its share of the room wide,
     * so no cone spills over the floors above it.
     */
    perRoom?: boolean;
    /**
     * One pool per meeting room instead (see `meetingRooms`: each connected
     * area of `meetingTiles`, top to bottom, then left to right), standing
     * over the room's middle and aimed straight down at it (`depth` unused):
     * a soft lit table in each glass box.
     */
    meetings?: boolean;
  };
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
    /**
     * A colour grade on the whole 3D frame: CSS `saturate()` on the canvas,
     * 1 for none. Plain CSS like the rest of the vignette, so every quality
     * gets the same picture. The HUD (DOM and Phaser) stays ungraded.
     */
    saturate?: number;
    /**
     * CSS `contrast()` on the canvas after `saturate`, 1 for none: a hard
     * midday sun's deeper darks and brighter whites, on every quality.
     */
    contrast?: number;
    /** More glows like `glow`, drawn over it in order: a second edge, a haze under the top. */
    glows?: { color: number; opacity: number; x: number; y: number; reach: number }[];
    /**
     * More glows like `glows`, on `low` quality only, drawn over them: the
     * light of the accent lamps `low` hides (see `accents`), where a part of
     * the frame is lit mostly by them.
     */
    lowGlows?: { color: number; opacity: number; x: number; y: number; reach: number }[];
    /**
     * The tone mapping exposure for this level instead of the stage's usual
     * 0.95: part of the grade, so every quality gets it.
     */
    exposure?: number;
  };
  /**
   * A little warm light on stations the room's own light misses (a back-row
   * station in its wall's shadow, one facing away from the sun): one point
   * light per run of neighbouring station tiles of one of `kinds`, `forward`
   * grid units out from the run's middle toward the open floor in front of
   * it and `height` world units up, reaching `distance`. No shadows, off on `low`.
   */
  stationFill?: {
    color: number;
    intensity: number;
    distance: number;
    height: number;
    forward: number;
    kinds: Tile[];
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
    /**
     * One row of lamps along the back of each floor of a map made of
     * separate rooms (see `floorRows`) instead of the usual back-wall rows:
     * per column the first floor tile from the top, down to half the map's
     * depth, whatever the stations in front of it.
     */
    everyFloor?: boolean;
    /**
     * One row along the back of each room (see `roomRows`) instead: also
     * for a room whose back wall is lower than half the map's depth (the
     * street-level floor under a cutaway's upper ones).
     */
    perRoom?: boolean;
    /**
     * Every room its own row, with the meeting rooms (`meetingRooms`) apart
     * from the floor round them: a row along the back of each floor run
     * (see `floorRows`) whose columns don't start in a meeting room, and a
     * single pendant at the back of each meeting room, over its middle.
     * Nothing along a hallway behind a meeting room's front wall.
     */
    meetingRooms?: boolean;
    /**
     * With `meetingRooms`, look for each column's first floor tile from this
     * row down instead of from row 1: the back of a hall behind an interior
     * wall line (a corridor along the back wall gets no lamps).
     */
    fromRow?: number;
    /**
     * One row along the back of the floor of a reorg level's fixed room
     * (its moving tiles as floor, so the lamps stay put in every layout),
     * leaving out the columns within `clear` tiles of a meeting room: the
     * pendants on a wire, never over the boardroom. Runs shorter than three
     * tiles get none.
     */
    backOfFloor?: { clear: number };
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
  shafts?: {
    color: number;
    opacity: number;
    length: number;
    radius: number;
    lean: number;
    /**
     * Sunlight through the building's left curtain wall instead of down the
     * light wells (see `sunShaftSpots`): `count` beams along the left side,
     * their feet `out` grid units outside the outline on the floor beside the
     * room, each running up toward the sun (`lean` unused). Never over the room.
     */
    side?: { count: number; out: number };
  };
  /**
   * Dust drifting in the room's light: `perTile` motes per floor tile, faint and below bloom.
   * With `outside`, the motes hang in the sunlit air outside the building
   * instead (see `moteSeeds`), never over the room, and are off on `low`:
   * `perSide` beside the outline on the sun's side (`side` 1: right, -1:
   * left), `near` to `far` grid units out, `low` to `high` world units up,
   * and `perBack` per column behind the back of each column whose first row
   * is room; `size` world units across instead of the usual.
   */
  motes?: {
    color: number;
    opacity: number;
    perTile: number;
    outside?: {
      side: 1 | -1;
      perSide: number;
      perBack: number;
      near: number;
      far: number;
      low: number;
      high: number;
      size: number;
      /**
       * Also `perVoid` over each void tile in the front half of the map (a
       * terrace or yard in front of the room, not a notch in its back wall),
       * `voidLow` to `voidHigh` world units up, kept `margin` grid units
       * inside the tile so their drift never crosses onto the room.
       */
      perVoid?: number;
      voidLow?: number;
      voidHigh?: number;
      margin?: number;
    };
  };
  /**
   * Blossom petals drifting down in the air outside the building, never over
   * the room (see `petalSeeds`): `perSide` petals down each side of the
   * outline, `near` to `far` grid units out, and `perVoid` over each of the
   * map's void tiles; each falls from `top` to `bottom` (world units) at
   * `fall` units a second, swaying `sway` units. Not additive, `size` world
   * units across. Off on `low`.
   */
  petals?: {
    color: number;
    opacity: number;
    perSide: number;
    perVoid: number;
    near: number;
    far: number;
    top: number;
    bottom: number;
    fall: number;
    sway: number;
    size: number;
  };
  /**
   * Rain falling outside the building, never over the room (see
   * `rainSeeds`): thin streaks `length` world units long, `perSide` down
   * each side of the outline and `perBack` per column behind the back of
   * every column whose first row is room (none behind void: that is inside
   * the building), `near` to `far` grid units out; each falls from `top` to
   * `bottom` (world units) at `fall` units a second, drifting `slant` units
   * sideways per unit it falls. Off on `low`.
   */
  rain?: {
    color: number;
    opacity: number;
    perSide: number;
    perBack: number;
    near: number;
    far: number;
    top: number;
    bottom: number;
    fall: number;
    length: number;
    slant: number;
  };
  /**
   * The curtain wall's mullions striped across the floor in the sun (see
   * `mullionShade`): soft `color` bars `width` grid units wide every `every`
   * units, running along the sun's direction, `opacity` on the sun's side of
   * the room and `fade` × that on the far side. A decal on the floor (never
   * over void), no light and no shadow map. On every quality.
   */
  mullions?: { color: number; opacity: number; width: number; every: number; fade: number };
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
   * The meeting tiles' rug (see `WorldFx`) in this level's own color and
   * opacity, idle and while an invite pulses it, instead of the usual
   * violet: for a carpet the usual one sinks into. On every quality.
   */
  rug?: {
    color: number;
    opacity: number;
    invited: number;
    /**
     * Each meeting room's own rug color instead (`meetingRooms` order), for
     * rooms on carpets of different tones: a tint per room so every rug
     * shows the same violet. `color` for a room past its end.
     */
    perRoom?: number[];
  };
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
 * a share `along` of its depth from the back (`left`, `right`); `out` grid
 * units behind the outline's back edge, a share `along` of its width from
 * the left (`back`: a room behind the back wall, say); over the
 * middle of the interior walls (`core`, none without them); in each
 * light well (`wells`, see `lightWellSpots`); or over the ship tiles,
 * pulled `out` toward the room and `shift` along x like `inbox` (`ship`:
 * a lobby's wall brackets either side of the goods lift).
 */
export type AccentAnchor =
  'inbox' | 'pager' | 'left' | 'right' | 'back' | 'core' | 'wells' | 'ship';

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

/** One phase's light in `Atmosphere.day`: the sun's color, strength and place, and the fill. */
export interface DayLight {
  sun: { color: number; intensity: number; from: SunPlacement };
  fill: { color: number; intensity: number };
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

/**
 * A bright, fresh spring morning on an upper floor of a mid-rise: a warm,
 * creamy sun from the back left through the building's curtain wall (about
 * 50° up, so the back wall's shadow spares the back row of stations), its
 * mullions striped faintly across the carpet and a few faint warm beams
 * slanting in on the floor beside the room; a soft, only slightly cool fill
 * and sky against it (bluer turns the yellow test benches olive), light
 * spring blue-grey air hazing the street far below, warm-white pools from
 * the linear pendants along the back wall, cherry-blossom petals drifting
 * past the glass outside, and a gentle saturation grade so the grey-and-glass
 * office reads as a sunny morning rather than an overcast one.
 */
const SPRING_MORNING: Atmosphere = {
  sun: {
    color: 0xfff0d8,
    intensity: 2.45,
    from: { x: -7.5, y: -4.5, height: 10.5, perMapSize: false },
    reach: 0.95,
  },
  sky: { sky: 0xd4e0f2, ground: 0x8c8478, intensity: 0.7 },
  fill: { color: 0xe8ecf4, intensity: 0.68 },
  environment: 0.12,
  backdrop: { inner: 0xd2dce8, outer: 0x96a8bc },
  fog: { color: 0xc6d2e0, start: 0.35, span: 10 },
  vignette: {
    color: 0x2a3a52,
    opacity: 0.35,
    inner: 0.7,
    // The morning sun pouring in through the curtain wall on the left.
    glow: { color: 0xfff0d8, opacity: 0.2, x: 0, y: 0.35, reach: 0.3 },
    saturate: 1.35,
  },
  // Low warm sun slanting in through the left curtain wall, on the floor beside the room only.
  shafts: {
    color: 0xfff0d0,
    opacity: 0.07,
    length: 3.2,
    radius: 0.5,
    lean: 0,
    side: { count: 4, out: 0.95 },
  },
  lamps: {
    color: 0xfff0dc,
    intensity: 8,
    distance: 3.4,
    height: 2.1,
    spacing: 3.5,
    inset: 0.45,
    // Back wall only: a pendant by the front wall would hang over the players' heads on screen.
    frontFrom: 99,
  },
  petals: {
    color: 0xf4a6c0,
    opacity: 0.95,
    perSide: 36,
    perVoid: 2,
    near: 0.9,
    far: 4.2,
    top: 3.2,
    bottom: -0.4,
    fall: 0.16,
    sway: 0.22,
    size: 0.5,
  },
  mullions: { color: 0x3c4a62, opacity: 0.22, width: 0.28, every: 1.5, fade: 0.3 },
};

/**
 * An overcast spring day of rain, lower down in the same mid-rise as the
 * spring morning: a high, soft, near-white key from the back left (about 50°
 * up, blurred shadows), a cool grey-blue sky and fill doing most of the
 * lighting, grey-blue air hazing the wet street, and the office's linear
 * pendants warm-white along the back of each floor, so the rooms glow
 * against the street. Rain streaks fall outside only, and a saturation grade
 * keeps the grey day from greying the stations down.
 */
const SPRING_RAIN: Atmosphere = {
  sun: {
    color: 0xf4f2ee,
    intensity: 1.7,
    from: { x: -5.5, y: -4, height: 8.1, perMapSize: false },
    reach: 0.95,
    softness: 9,
  },
  // The office's lights on: a soft warm-white wash on the rooms only, brighter than the street.
  wash: {
    color: 0xffd4a2,
    intensity: 2.1,
    from: { x: 0, y: 3, height: 12, perMapSize: false },
    spread: 0.8,
  },
  // Each floor's own lights on top: warm on the ground floor's grey-green rubber, and a touch
  // brighter upstairs, so the first floor reads as the lit office over the street.
  pools: { color: 0xffe2c0, intensity: [1.3, 2.8], height: 9, forward: 2, depth: 3, radius: 4 },
  sky: { sky: 0xc2d0e6, ground: 0x7e8680, intensity: 1.4 },
  fill: { color: 0xdce2ec, intensity: 1.05 },
  environment: 0.14,
  backdrop: { inner: 0xb2bcc8, outer: 0x7c8898 },
  fog: { color: 0x8a96a2, start: 0.35, span: 9 },
  vignette: {
    color: 0x2a3444,
    opacity: 0.3,
    inner: 0.7,
    saturate: 1.65,
    // Rain haze over the street behind, under the order cards: the far side of the street grey and wet.
    glows: [{ color: 0xc4cedc, opacity: 0.24, x: 0.5, y: 0, reach: 0.62 }],
  },
  lamps: {
    color: 0xffdcb0,
    intensity: 16,
    distance: 4.4,
    height: 2.1,
    spacing: 3.5,
    inset: 0.45,
    // Back walls only: a pendant by the front wall would hang over the players' heads on screen.
    frontFrom: 99,
    everyFloor: true,
  },
  rain: {
    color: 0xe4eaf4,
    opacity: 0.6,
    perSide: 70,
    perBack: 8,
    near: 0.9,
    far: 4.5,
    top: 4,
    bottom: -1.4,
    fall: 7,
    length: 0.42,
    slant: 0.12,
  },
};

/**
 * A bright spring Friday afternoon, higher up the same mid-rise: a low warm
 * sun from the right (west, about 40° up) throwing long soft shadows to the
 * left and catching the cutaway's slab edges and right-hand walls, a sky and
 * fill only a touch cooler than white (bluer turns the yellow and orange
 * stations olive), slightly cooler hazy air over the street and the city
 * outside, and the office's warm-white lights in a pool per room, the top
 * floor's meeting room brightest. The voids between the rooms (the shaft,
 * the slab gap) get none of it, so the three floors separate. Dust motes
 * hang in the sun outside only, and a light saturation grade keeps the
 * grey-and-glass office from greying the stations.
 */
const FRIDAY_AFTERNOON: Atmosphere = {
  sun: {
    color: 0xffd9a8,
    intensity: 2.5,
    // About 40° up, from the right and a little in front, so the slab and
    // terrace cut faces catch it and the street's shadows fall long to the left.
    from: { x: 6.55, y: 5.5, height: 7.2, perMapSize: false },
    reach: 0.95,
    softness: 6,
  },
  // The office's lights, room by room: the meeting room up top, the test lab, the hot-desk floor.
  pools: {
    color: 0xffd8a8,
    intensity: [2.6, 0.7, 1.6],
    height: 9,
    forward: 2,
    depth: 1.5,
    radius: 3,
    perRoom: true,
  },
  sky: { sky: 0xd8e0ec, ground: 0x8c8274, intensity: 0.75 },
  // Low hides the lamps and the station fill: the sky makes up for them there.
  lowSky: 0.9,
  fill: { color: 0xeceff5, intensity: 0.6 },
  environment: 0.12,
  backdrop: { inner: 0xd6dce4, outer: 0x9aa6b4 },
  // Cool haze: the rooftops a storey down beside the floors sit in it.
  fog: { color: 0x9aa6b2, start: 0.35, span: 9 },
  vignette: {
    color: 0x2e3346,
    opacity: 0.35,
    inner: 0.7,
    saturate: 1.55,
    exposure: 0.98,
    // The low sun on the right edge of the frame, under the mute button.
    glow: { color: 0xffd9a6, opacity: 0.2, x: 1, y: 0.4, reach: 0.28 },
  },
  lamps: {
    color: 0xffe2bc,
    intensity: 9,
    distance: 3.6,
    height: 2.1,
    spacing: 3.5,
    inset: 0.45,
    // Back walls only: a pendant by the front wall would hang over the players' heads on screen.
    frontFrom: 99,
    perRoom: true,
  },
  // The bug queue faces away from the sun and the pipelines sit in their wall's shadow.
  stationFill: {
    color: 0xffe2b8,
    intensity: 7,
    distance: 3,
    height: 1.3,
    forward: 0.85,
    kinds: ['bugQueue', 'pipeline'],
  },
  // Dust in the sun outside the building's west side, never over the room.
  motes: {
    color: 0xffe6c0,
    opacity: 0.55,
    perTile: 0,
    outside: {
      side: 1,
      perSide: 40,
      perBack: 1,
      near: 0.6,
      far: 3.2,
      low: 0.4,
      high: 3,
      size: 0.07,
    },
  },
};

/**
 * A summer heatwave morning high up in a glass tower: a high, hard, bleached
 * sun from the front left (about 55° up), so the walls throw short crisp
 * shadows back into the rooms and the back row stays in the light; a pale hot
 * sky going white at the horizon; a warm (never brown) haze over the city far
 * below; inside, a hot pale-straw key against a cool blue fill, a touch more
 * contrast and saturation in the grade, so it reads hot by its light and its
 * shadows, not by brown. Slim pendants along the back of each office and one
 * over each meeting room's table, with a soft pool on each glass box; a tint
 * per meeting rug so both show the same violet; faint heat shimmer in the air
 * over the city below only, never over the room or the terrace.
 */
const HEATWAVE_MORNING: Atmosphere = {
  sun: {
    // A hot pale-straw key, strong and crisp, against a cool fill: heat by contrast, not by brown.
    color: 0xffecd2,
    intensity: 3.3,
    // About 55° up, from the left and in front: hypot(5, 4) × tan 55° ≈ 9.1.
    from: { x: -5, y: 4, height: 9.1, perMapSize: false },
    reach: 0.95,
    softness: 2.5,
  },
  // The meeting rooms' own lights: a soft pool on each table, The Garage, then Mom.
  pools: {
    color: 0xfff0dc,
    intensity: [1.2, 1.2],
    height: 7,
    forward: 1.5,
    depth: 0,
    radius: 2.2,
    meetings: true,
  },
  sky: { sky: 0xdce8f4, ground: 0xc4b8a2, intensity: 0.7 },
  // Low hides the pendants and the station fill: the sky makes up for them there.
  lowSky: 0.74,
  fill: { color: 0xdce8f8, intensity: 0.45 },
  environment: 0.16,
  backdrop: { inner: 0xf8f5ee, outer: 0xbccddf },
  // Heat haze: the roofs far below sink into warm pale air, late enough that the city keeps its contrast.
  fog: { color: 0xf4e8d4, start: 8, span: 34 },
  vignette: {
    color: 0x34384a,
    opacity: 0.35,
    inner: 0.7,
    saturate: 1.5,
    // A hard midday sun: deeper darks, brighter whites.
    contrast: 1.1,
    exposure: 1.07,
    glows: [
      // The bleached horizon behind the city, under the order cards.
      { color: 0xffe6bc, opacity: 0.18, x: 0.5, y: 0, reach: 0.55 },
      // The sun's glare off the terrace, low on the left.
      { color: 0xffe0aa, opacity: 0.22, x: 0, y: 0.85, reach: 0.35 },
    ],
  },
  lamps: {
    color: 0xfff4e4,
    intensity: 7,
    distance: 3.4,
    height: 2.1,
    spacing: 3,
    inset: 0.45,
    // Back walls only: a pendant by the front wall would hang over the players' heads on screen.
    frontFrom: 99,
    meetingRooms: true,
  },
  // The bug queues face the sun's far side and the pipelines' belts sit low on the front wall.
  stationFill: {
    color: 0xfff0dc,
    intensity: 5,
    distance: 2.6,
    height: 1.3,
    forward: 0.85,
    kinds: ['bugQueue', 'pipeline'],
  },
  // The usual violet rug, a tint per room so The Garage's sage carpet and Mom's warm taupe show the same violet.
  rug: { color: 0x8e6bd8, opacity: 0.48, invited: 0.7, perRoom: [0x8a70c8, 0x6c78bc] },
  // Heat shimmer: a few faint motes in the air over the city far below only; over the
  // terrace they read as snow in a still (the condensers' shimmer panes carry the heat there).
  motes: {
    color: 0xfff4e0,
    opacity: 0.12,
    perTile: 0,
    outside: {
      side: -1,
      perSide: 36,
      perBack: 1,
      near: 0.8,
      far: 4,
      low: -2.6,
      high: -0.4,
      size: 0.05,
    },
  },
};

/**
 * A hot summer afternoon a few floors above 4-1, in the same tower: the sun
 * lower and warmer (about 40° up) from the front right, the west, so the
 * walls' shadows fall back and left, onto the corridor behind the hall and
 * never over its back row; warm late light raking across the carpet against
 * cool blue shadows; a warm cream sky, no longer bleached white; the city
 * far below golden, the haze pushed back so it keeps its contrast. Slim
 * pendants along the back of the dev and ops sides (behind the hall's wall
 * line, not along the corridor) and one at the back of the boardroom, with
 * a soft pool on its table; a little light on the ops stations, which face
 * away from the sun. No motes: nothing in the air that could read as snow.
 */
const SUMMER_AFTERNOON: Atmosphere = {
  sun: {
    // Late gold, warmer than 4-1's pale straw, never orange.
    color: 0xffd6a0,
    intensity: 3.6,
    // About 40° up, from the right and in front: hypot(5, 3.5) × tan 40° ≈ 5.1.
    from: { x: 5, y: 3.5, height: 5.1, perMapSize: false },
    reach: 0.95,
    softness: 3,
  },
  // The boardroom's own light: a soft pool on the long table.
  pools: {
    color: 0xfff0dc,
    intensity: [1],
    height: 7,
    forward: 1.5,
    depth: 0,
    radius: 2.4,
    meetings: true,
  },
  sky: { sky: 0xd4e0f0, ground: 0xbeb8ae, intensity: 0.85 },
  // Low hides the pendants and the station fill: the sky makes up for them there.
  lowSky: 0.92,
  // The shadows stay cool: a slightly blue fill from the camera side.
  fill: { color: 0xc8d8f4, intensity: 0.8 },
  environment: 0.16,
  backdrop: { inner: 0xfbeed8, outer: 0xb8c6d8 },
  // Golden haze over the city far below, late enough that the roofs keep their contrast.
  fog: { color: 0xf2dcb8, start: 10, span: 38 },
  vignette: {
    color: 0x34364a,
    opacity: 0.35,
    inner: 0.7,
    saturate: 1.2,
    contrast: 1.08,
    exposure: 1.24,
    glows: [
      // The warm sky behind the city, under the order cards.
      { color: 0xffdcae, opacity: 0.2, x: 0.5, y: 0, reach: 0.55 },
      // The low west sun off the right edge, under the mute button.
      { color: 0xffcf96, opacity: 0.2, x: 1, y: 0.45, reach: 0.3 },
      // The reception's cool, expensive light past the back glass, on every quality.
      { color: 0xe4ecfa, opacity: 0.16, x: 0.62, y: 0.05, reach: 0.3 },
    ],
    // On low the reception's downlights are off: the same cool light, a little stronger.
    lowGlows: [{ color: 0xe4ecfa, opacity: 0.24, x: 0.66, y: 0.06, reach: 0.3 }],
  },
  lamps: {
    color: 0xfff0dc,
    intensity: 6,
    distance: 3.4,
    height: 2.1,
    spacing: 3,
    inset: 0.45,
    // Back walls only: a pendant by the front wall would hang over the players' heads on screen.
    frontFrom: 99,
    meetingRooms: true,
    // The dev and ops sides start under the hall's back wall line (row 3), behind it is the corridor.
    fromRow: 4,
  },
  // The test benches and pipelines stand on the west wall, their fronts turned from the sun.
  stationFill: {
    color: 0xfff0dc,
    intensity: 5,
    distance: 2.6,
    height: 1.3,
    forward: 0.85,
    kinds: ['testBench', 'pipeline'],
  },
  // The executive reception behind the back glass: cool, expensive downlight on the stone,
  // one over each end of the desk and one over the suits by the gates.
  accents: [0.36, 0.6, 0.82].map((along) => ({
    anchor: 'back' as const,
    color: 0xb4c8ff,
    intensity: 40,
    distance: 9,
    height: 2.4,
    out: 1.6,
    along,
  })),
  // The usual violet, a touch lighter than 4-1's: on the good carpet's deep charcoal it glows.
  rug: { color: 0xaaa2c8, opacity: 0.3, invited: 0.55 },
};

/** 4-3's Silos, morning: warm white, about 40° up from the front left: hypot(5, 3.5) × tan 40° ≈ 5.1. */
const REORG_MORNING: DayLight = {
  sun: { color: 0xfff0da, intensity: 3.4, from: { x: -5, y: 3.5, height: 5.1, perMapSize: false } },
  fill: { color: 0xc8d8f4, intensity: 0.8 },
};

/** 4-3's morning, noon and after lunch (see `SUMMER_DAY`): the sun round the front, the fill cool. */
const REORG_DAY: DayLight[] = [
  REORG_MORNING,
  // Open Plan, noon: white and high, about 60° up and a little left: hypot(1.5, 2.5) × tan 60° ≈ 5.05.
  {
    sun: {
      color: 0xfffaf0,
      intensity: 3.8,
      from: { x: -1.5, y: 2.5, height: 5.05, perMapSize: false },
    },
    fill: { color: 0xd8e2f4, intensity: 0.6 },
  },
  // Matrix, after lunch: warmer, about 40° up from the front right.
  {
    sun: {
      color: 0xffdcae,
      intensity: 3.5,
      from: { x: 5, y: 3.5, height: 5.1, perMapSize: false },
    },
    fill: { color: 0xccdaf4, intensity: 0.8 },
  },
];

/**
 * The day after Synergy on the same floor, summer, all day: the round's
 * three layouts are three times of day (`day`, see `dayClock`), the sun
 * coming round the front from the left in the morning, high and white at
 * noon, lower and warmer from the right after lunch, the fill cool all
 * day. The city far below in a pale summer haze, late enough that it keeps
 * its contrast. Slim pendants on a wire along the back of the floor, never
 * over the boardroom (it keeps its soft pool on the table); the shipping
 * lobby a touch cooler and cleaner, lit by brackets either side of the
 * goods lift; a little light on the side walls' test benches, one side or
 * the other always away from the sun. A soft glow behind the `yotta.` sign
 * going up at the back right. No motes.
 */
const SUMMER_DAY: Atmosphere = {
  sun: { ...REORG_MORNING.sun, reach: 0.95, softness: 3 },
  day: { phases: REORG_DAY },
  pools: {
    color: 0xfff0dc,
    intensity: [0.9],
    height: 7,
    forward: 1.5,
    depth: 0,
    radius: 2.4,
    meetings: true,
  },
  sky: { sky: 0xd6e2f2, ground: 0xbcbab4, intensity: 0.85 },
  lowSky: 0.95,
  fill: REORG_MORNING.fill,
  environment: 0.16,
  backdrop: { inner: 0xfbf2e2, outer: 0xb6c8dc },
  fog: { color: 0xf0e4cc, start: 10, span: 38 },
  vignette: {
    color: 0x34364a,
    opacity: 0.35,
    inner: 0.7,
    saturate: 1.15,
    contrast: 1.06,
    exposure: 1.22,
    glows: [
      // The summer sky behind the city, under the order cards.
      { color: 0xffe4bc, opacity: 0.16, x: 0.4, y: 0, reach: 0.5 },
      // The lit `yotta.` going up at the back right, a soft cool-white glow behind it.
      { color: 0xeee8ff, opacity: 0.16, x: 0.7, y: 0.04, reach: 0.18 },
    ],
    // On low the lobby's brackets are off: a little cool light over it instead.
    lowGlows: [{ color: 0xe4ecfa, opacity: 0.14, x: 0.5, y: 0.78, reach: 0.2 }],
  },
  lamps: {
    color: 0xfff0dc,
    intensity: 6,
    distance: 3.4,
    height: 2.1,
    spacing: 3,
    inset: 0.45,
    // Back wall only: a pendant by the front wall would hang over the players' heads on screen.
    frontFrom: 99,
    backOfFloor: { clear: 1 },
  },
  // The side walls' test benches: in the morning the left one faces away from the sun, after lunch the right.
  stationFill: {
    color: 0xfff0dc,
    intensity: 4,
    distance: 2.6,
    height: 1.3,
    forward: 0.85,
    kinds: ['testBench'],
  },
  // The shipping lobby's wall brackets either side of the goods lift: cool and clean.
  accents: [-3.2, 3.2].map((shift) => ({
    anchor: 'ship' as const,
    color: 0xdce8ff,
    intensity: 6,
    distance: 4,
    height: 1.7,
    out: 1.4,
    shift,
  })),
  // The good carpet from yesterday, the same soft grey lavender.
  rug: { color: 0xaaa2c8, opacity: 0.3, invited: 0.55 },
};

/** Presets per `MapLook.scene` id. */
export const ATMOSPHERES: Readonly<Record<string, Atmosphere>> = {
  garage: GOLDEN_HOUR,
  'open-plan': MONDAY_MORNING,
  'scale-up': CANAL_EVENING,
  'seed-round': BLUE_HOUR,
  'demo-day': STAGE_LIGHTS,
  'on-call': NIGHT_SHIFT,
  'middle-management': SPRING_MORNING,
  hypergrowth: SPRING_RAIN,
  'hot-desking': FRIDAY_AFTERNOON,
  'back-to-back': HEATWAVE_MORNING,
  synergy: SUMMER_AFTERNOON,
  'the-reorg': SUMMER_DAY,
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

/** The per-floor washes (`Atmosphere.pools`): each spot's position, target, half-angle and intensity. */
export function poolPlacements(
  atmosphere: Atmosphere,
  map: Pick<LevelMap, 'width' | 'height'> & Partial<Pick<LevelMap, 'tiles' | 'meetingTiles'>>,
): { position: Vec3; target: Vec3; angle: number; intensity: number }[] {
  const pools = atmosphere.pools;
  if (!pools) return [];
  if (pools.meetings) {
    return meetingRooms(map).flatMap((room, i) => {
      const intensity = pools.intensity[i];
      if (intensity === undefined || intensity <= 0) return [];
      const cx = (room.x0 + room.x1) / 2;
      const cy = (room.inside + room.y1) / 2;
      const position = gridToWorld(cx, cy + pools.forward, pools.height);
      const target = gridToWorld(cx, cy);
      const distance = Math.hypot(
        position.x - target.x,
        position.y - target.y,
        position.z - target.z,
      );
      const radius = Math.max(pools.radius, (room.x1 - room.x0 + 1) / 2);
      return [{ position, target, angle: Math.atan2(radius, distance), intensity }];
    });
  }
  if (pools.perRoom) {
    return roomRows(map).flatMap((room, i) => {
      const intensity = pools.intensity[i];
      if (intensity === undefined || intensity <= 0) return [];
      const width = room.x1 - room.x0 + 1;
      const count = Math.max(1, Math.round(width / (2 * pools.radius)));
      const share = width / count;
      return Array.from({ length: count }, (_, k) => {
        const cx = room.x0 - 0.5 + share * (k + 0.5);
        const cy = room.inside + pools.depth;
        const position = gridToWorld(cx, cy + pools.forward, pools.height);
        const target = gridToWorld(cx, cy);
        const distance = Math.hypot(
          position.x - target.x,
          position.y - target.y,
          position.z - target.z,
        );
        const radius = Math.max(pools.radius, share / 2);
        return { position, target, angle: Math.atan2(radius, distance), intensity };
      });
    });
  }
  return floorRows(map).flatMap((run, i) => {
    const intensity = pools.intensity[i];
    if (intensity === undefined || intensity <= 0) return [];
    const cx = (run.x0 + run.x1) / 2;
    const cy = run.inside + pools.depth;
    const position = gridToWorld(cx, cy + pools.forward, pools.height);
    const target = gridToWorld(cx, cy);
    const distance = Math.hypot(
      position.x - target.x,
      position.y - target.y,
      position.z - target.z,
    );
    const radius = Math.max(pools.radius, (run.x1 - run.x0 + 1) / 2);
    return [{ position, target, angle: Math.atan2(radius, distance), intensity }];
  });
}

/**
 * Where the station fill lights hang (`Atmosphere.stationFill`): per run of
 * 4-neighbouring tiles of one of its kinds, `forward` grid units out from
 * the run's middle toward the side with the most floor beside it. None
 * without tiles or for a run with no floor beside it.
 */
export function stationFillSpots(
  atmosphere: Atmosphere,
  map: Pick<LevelMap, 'width' | 'height'> & Partial<Pick<LevelMap, 'tiles'>>,
): Vec3[] {
  const fill = atmosphere.stationFill;
  if (!fill || !map.tiles) return [];
  const full = map as LevelMap;
  const kinds = new Set<Tile>(fill.kinds);
  const seen = new Set<number>();
  const sides = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ] as const;
  const spots: Vec3[] = [];
  for (const start of tilesOf(full, (tile) => kinds.has(tile as Tile))) {
    if (seen.has(start.y * map.width + start.x)) continue;
    const kind = getTile(full, start.x, start.y);
    seen.add(start.y * map.width + start.x);
    const run = [start];
    for (let i = 0; i < run.length; i++) {
      const at = run[i];
      if (!at) break;
      for (const [dx, dy] of sides) {
        const x = at.x + dx;
        const y = at.y + dy;
        if (seen.has(y * map.width + x) || getTile(full, x, y) !== kind) continue;
        seen.add(y * map.width + x);
        run.push({ x, y });
      }
    }
    // The side most of the run's tiles open onto.
    let best: { dx: number; dy: number; n: number } | null = null;
    for (const [dx, dy] of sides) {
      const n = run.filter((t) => getTile(full, t.x + dx, t.y + dy) === 'floor').length;
      if (n > 0 && (best === null || n > best.n)) best = { dx, dy, n };
    }
    if (!best) continue;
    const mx = run.reduce((sum, t) => sum + t.x, 0) / run.length;
    const my = run.reduce((sum, t) => sum + t.y, 0) / run.length;
    spots.push(gridToWorld(mx + best.dx * fill.forward, my + best.dy * fill.forward, fill.height));
  }
  return spots;
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

/** What `dayClock` reads off the round: the tick, the layout now and the reorg schedule. */
export interface DayState {
  tick: number;
  reorgPhase: number;
  nextReorg: number;
  settings: { reorgs?: readonly { atTick: number; phase: number }[] };
}

/**
 * Where the day stands (`Atmosphere.day`): the layout's phase `from`, the
 * phase the next reorg brings (`to`), and how far the light has gone
 * between them (`t`, 0 to 1, eased). It moves over the reorg's warning,
 * `REORG_WARNING_TICKS` before the switch, and is all the way there on the
 * switch's tick, when the layout's phase becomes `to`; in between reorgs `t` is 0.
 */
export function dayClock(state: DayState): { from: number; to: number; t: number } {
  const from = state.reorgPhase;
  const step = state.settings.reorgs?.[state.nextReorg];
  if (!step) return { from, to: from, t: 0 };
  const left = step.atTick - state.tick;
  if (left >= REORG_WARNING_TICKS) return { from, to: from, t: 0 };
  const k = Math.min(1, Math.max(0, 1 - left / REORG_WARNING_TICKS));
  return { from, to: step.phase, t: k * k * (3 - 2 * k) };
}

/** The sun and fill for a moment of the day (see `dayClock`); the preset's own without `day`. */
export function dayLight(
  atmosphere: Atmosphere,
  clock: { from: number; to: number; t: number },
): DayLight {
  const phases = atmosphere.day?.phases ?? [];
  const own: DayLight = {
    sun: {
      color: atmosphere.sun.color,
      intensity: atmosphere.sun.intensity,
      from: atmosphere.sun.from,
    },
    fill: atmosphere.fill,
  };
  const at = (phase: number): DayLight =>
    phases[Math.min(Math.max(phase, 1), phases.length) - 1] ?? own;
  const a = at(clock.from);
  const b = at(clock.to);
  const t = clock.t;
  const mix = (p: number, q: number) => p + (q - p) * t;
  return {
    sun: {
      color: mixColor(a.sun.color, b.sun.color, t),
      intensity: mix(a.sun.intensity, b.sun.intensity),
      from: {
        x: mix(a.sun.from.x, b.sun.from.x),
        y: mix(a.sun.from.y, b.sun.from.y),
        height: mix(a.sun.from.height, b.sun.from.height),
        perMapSize: a.sun.from.perMapSize,
      },
    },
    fill: {
      color: mixColor(a.fill.color, b.fill.color, t),
      intensity: mix(a.fill.intensity, b.fill.intensity),
    },
  };
}

/** Two 0xrrggbb colors mixed channel by channel, `t` of the way from `a` to `b`. */
export function mixColor(a: number, b: number, t: number): number {
  let out = 0;
  for (const shift of [16, 8, 0]) {
    const p = (a >> shift) & 255;
    const q = (b >> shift) & 255;
    out |= Math.round(p + (q - p) * t) << shift;
  }
  return out;
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
  map: Pick<LevelMap, 'width' | 'height'> & Partial<Pick<LevelMap, 'tiles' | 'meetingTiles'>>,
): Vec3[] {
  const lamps = atmosphere.lamps;
  if (!lamps) return [];
  if (lamps.backOfFloor) {
    const fixed = map.tiles && 'phases' in map ? withoutReorgTiles(map as LevelMap) : map;
    const clear = lamps.backOfFloor.clear;
    const rooms = meetingRooms(map);
    const near = (x: number) => rooms.some((r) => x >= r.x0 - clear && x <= r.x1 + clear);
    return floorRows(fixed, false, lamps.fromRow)
      .flatMap((run) => {
        // Split the run round the meeting rooms' columns.
        const parts: { inside: number; x0: number; x1: number }[] = [];
        for (let x = run.x0; x <= run.x1; x++) {
          if (near(x)) continue;
          const last = parts[parts.length - 1];
          if (last && last.x1 === x - 1) last.x1 = x;
          else parts.push({ inside: run.inside, x0: x, x1: x });
        }
        return parts.filter((p) => p.x1 - p.x0 >= 2);
      })
      .flatMap(({ inside, x0, x1 }) => {
        const length = x1 - x0 + 1;
        const count = Math.max(1, Math.round(length / lamps.spacing));
        const y = inside - 0.5 + lamps.inset;
        return Array.from({ length: count }, (_, i) =>
          gridToWorld(x0 - 0.5 + (length * (i + 0.5)) / count, y, lamps.height),
        );
      });
  }
  if (lamps.meetingRooms) {
    const rows = floorRows(map, true, lamps.fromRow).flatMap(({ inside, x0, x1 }) => {
      const length = x1 - x0 + 1;
      const count = Math.max(1, Math.round(length / lamps.spacing));
      const y = inside - 0.5 + lamps.inset;
      return Array.from({ length: count }, (_, i) =>
        gridToWorld(x0 - 0.5 + (length * (i + 0.5)) / count, y, lamps.height),
      );
    });
    const pendants = meetingRooms(map).map(({ inside, x0, x1 }) =>
      gridToWorld((x0 + x1) / 2, inside - 0.5 + lamps.inset, lamps.height),
    );
    return [...rows, ...pendants];
  }
  // The wall's inner face is half a tile in from its row's center.
  const runs = lamps.perRoom ? roomRows(map) : lamps.everyFloor ? floorRows(map) : backRows(map);
  const rows = runs.map((r) => ({ ...r, y: r.inside - 0.5 + lamps.inset }));
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

/**
 * The back of each floor (`Atmosphere.lamps.everyFloor`): per column the
 * first floor tile from the top, down to half the map's depth (stations
 * against the back wall don't count), grouped into runs of neighbouring
 * columns that share it, each at least three tiles long. Without tiles, the
 * whole width along row 1.
 */
function floorRows(
  map: Pick<LevelMap, 'width' | 'height'> & Partial<Pick<LevelMap, 'tiles' | 'meetingTiles'>>,
  skipMeetings = false,
  fromRow = 1,
): { inside: number; x0: number; x1: number }[] {
  if (!map.tiles) return [{ inside: fromRow, x0: 1, x1: Math.max(1, map.width - 2) }];
  const full = map as LevelMap;
  const deepest = Math.max(fromRow, Math.floor(map.height * 0.5));
  const meeting = new Set(
    (skipMeetings ? (map.meetingTiles ?? []) : []).map((t) => t.y * map.width + t.x),
  );
  const runs: { inside: number; x0: number; x1: number }[] = [];
  for (let x = 0; x < map.width; x++) {
    let top: number | null = null;
    for (let y = fromRow; y <= deepest && top === null; y++)
      if (getTile(full, x, y) === 'floor') top = y;
    // A column that starts in a meeting room belongs to that room's own pendant.
    if (top === null || meeting.has(top * map.width + x)) continue;
    const last = runs[runs.length - 1];
    if (last && last.inside === top && last.x1 === x - 1) last.x1 = x;
    else runs.push({ inside: top, x0: x, x1: x });
  }
  return runs.filter((r) => r.x1 - r.x0 >= 2);
}

/**
 * The meeting rooms (`LevelMap.meetingTiles`): each connected area of
 * meeting tiles (4-neighbours), with its first and last row and column, top
 * to bottom, then left to right. None without meeting tiles.
 */
export function meetingRooms(
  map: Pick<LevelMap, 'width' | 'height'> & Partial<Pick<LevelMap, 'meetingTiles'>>,
): { inside: number; y1: number; x0: number; x1: number }[] {
  const tiles = map.meetingTiles ?? [];
  const left = new Set(tiles.map((t) => t.y * map.width + t.x));
  const rooms: { inside: number; y1: number; x0: number; x1: number }[] = [];
  for (const start of tiles) {
    const key = start.y * map.width + start.x;
    if (!left.has(key)) continue;
    left.delete(key);
    const room = { inside: start.y, y1: start.y, x0: start.x, x1: start.x };
    const stack = [start];
    for (let at = stack.pop(); at; at = stack.pop()) {
      room.inside = Math.min(room.inside, at.y);
      room.y1 = Math.max(room.y1, at.y);
      room.x0 = Math.min(room.x0, at.x);
      room.x1 = Math.max(room.x1, at.x);
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const) {
        const next = { x: at.x + dx, y: at.y + dy };
        const k = next.y * map.width + next.x;
        if (next.x < 0 || next.x >= map.width || !left.has(k)) continue;
        left.delete(k);
        stack.push(next);
      }
    }
    rooms.push(room);
  }
  return rooms.sort((a, b) => a.inside - b.inside || a.x0 - b.x0);
}

/**
 * The rug's color on each of the map's meeting tiles (`meetingTiles` order):
 * its room's own (`rug.perRoom`), else the level's `rug.color`, else `fallback`.
 */
export function rugColors(
  atmosphere: Atmosphere,
  map: Pick<LevelMap, 'width' | 'height' | 'meetingTiles'>,
  fallback: number,
): number[] {
  const color = atmosphere.rug?.color ?? fallback;
  const perRoom = atmosphere.rug?.perRoom ?? [];
  const rooms = meetingRooms(map);
  return map.meetingTiles.map((t) => {
    const i = rooms.findIndex((r) => t.x >= r.x0 && t.x <= r.x1 && t.y >= r.inside && t.y <= r.y1);
    return perRoom[i] ?? color;
  });
}

/**
 * The back of each room (`perRoom` pools and lamps): every connected area of
 * floor tiles (4-neighbours) at least three tiles wide, with the row most of
 * its columns start at (the deeper one on a tie, so lift cabins poking into
 * the back wall don't pull it up) and its first and last column, top to
 * bottom, then left to right. Without tiles, the whole width along row 1.
 */
export function roomRows(
  map: Pick<LevelMap, 'width' | 'height'> & Partial<Pick<LevelMap, 'tiles'>>,
): { inside: number; x0: number; x1: number }[] {
  if (!map.tiles) return [{ inside: 1, x0: 1, x1: Math.max(1, map.width - 2) }];
  const full = map as LevelMap;
  const { width, height } = map;
  const seen = new Array<boolean>(width * height).fill(false);
  const rooms: { inside: number; x0: number; x1: number }[] = [];
  for (let y0 = 0; y0 < height; y0++)
    for (let x0 = 0; x0 < width; x0++) {
      if (seen[y0 * width + x0] || getTile(full, x0, y0) !== 'floor') continue;
      seen[y0 * width + x0] = true;
      const stack = [[x0, y0] as const];
      const tops = new Map<number, number>();
      while (stack.length > 0) {
        const next = stack.pop();
        if (!next) break;
        const [x, y] = next;
        tops.set(x, Math.min(tops.get(x) ?? y, y));
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ] as const) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          if (seen[ny * width + nx] || getTile(full, nx, ny) !== 'floor') continue;
          seen[ny * width + nx] = true;
          stack.push([nx, ny]);
        }
      }
      const columns = [...tops.keys()];
      const lo = Math.min(...columns);
      const hi = Math.max(...columns);
      if (hi - lo < 2) continue;
      const counts = new Map<number, number>();
      for (const top of tops.values()) counts.set(top, (counts.get(top) ?? 0) + 1);
      let inside = -1;
      let most = 0;
      for (const [top, n] of counts)
        if (n > most || (n === most && top > inside)) {
          inside = top;
          most = n;
        }
      rooms.push({ inside, x0: lo, x1: hi });
    }
  return rooms.sort((a, b) => a.inside - b.inside || a.x0 - b.x0);
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
  map: Pick<LevelMap, 'width' | 'height'> & Partial<Pick<LevelMap, 'tiles'>>,
): MoteSeed[] {
  const motes = atmosphere.motes;
  if (!motes) return [];
  if (motes.outside) return outsideMotes(motes.outside, map);
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

/**
 * The motes in the sunlit air outside (`motes.outside`): down the sun's side
 * of the outline, and behind the back of each column whose first row is room
 * (behind void lies more building). Never over the room.
 */
function outsideMotes(
  spec: NonNullable<NonNullable<Atmosphere['motes']>['outside']>,
  map: Pick<LevelMap, 'width' | 'height'> & Partial<Pick<LevelMap, 'tiles'>>,
): MoteSeed[] {
  const out = (i: number) => spec.near + unit(i, 41) * (spec.far - spec.near);
  const up = (i: number) => spec.low + unit(i, 42) * (spec.high - spec.low);
  const side = Array.from({ length: spec.perSide }, (_, i) => {
    const x = spec.side < 0 ? -0.5 - out(i) : map.width - 0.5 + out(i);
    const z = -1.5 + unit(i, 43) * map.height;
    return { at: { x, y: up(i), z }, phase: unit(i, 44) };
  });
  const columns = Array.from({ length: map.width }, (_, x) => x).filter((x) => {
    if (!map.tiles) return true;
    const tile = getTile(map as LevelMap, x, 0);
    return tile !== null && tile !== 'void';
  });
  const back = columns.flatMap((x) =>
    Array.from({ length: spec.perBack }, (_, k) => {
      const i = 3000 + x * 16 + k;
      return { at: { x: x - 0.5 + unit(i, 45), y: up(i), z: -0.5 - out(i) }, phase: unit(i, 46) };
    }),
  );
  return [...side, ...back, ...voidMotes(spec, map)];
}

/** The motes over the void in front of the room (`motes.outside.perVoid`), well inside each tile. */
function voidMotes(
  spec: NonNullable<NonNullable<Atmosphere['motes']>['outside']>,
  map: Pick<LevelMap, 'width' | 'height'> & Partial<Pick<LevelMap, 'tiles'>>,
): MoteSeed[] {
  const per = spec.perVoid ?? 0;
  if (per <= 0 || !map.tiles) return [];
  const low = spec.voidLow ?? 0.1;
  const high = spec.voidHigh ?? 0.8;
  const spread = 1 - 2 * (spec.margin ?? 0.3);
  const front = tilesOf(map as LevelMap, (tile) => tile === 'void').filter(
    (t) => t.y >= map.height / 2,
  );
  return front.flatMap((t) =>
    Array.from({ length: per }, (_, k) => {
      const i = 6000 + (t.y * map.width + t.x) * 8 + k;
      return {
        at: gridToWorld(
          t.x + (unit(i, 47) - 0.5) * spread,
          t.y + (unit(i, 48) - 0.5) * spread,
          low + unit(i, 49) * (high - low),
        ),
        phase: unit(i, 50),
      };
    }),
  );
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
    case 'back':
      return [gridToWorld(-0.5 + map.width * (accent.along ?? 0.5), -0.5 - out, accent.height)];
    case 'wells':
      return wells.map((w) => ({ ...w.at, y: w.at.y + accent.height }));
    case 'inbox':
    case 'ship': {
      if (!map.tiles) return [];
      const full = map as LevelMap;
      const tiles = tilesOf(full, (t) => t === accent.anchor);
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

/** A blossom petal: where its fall starts (world units), how far it falls, and its phase in [0, 1). */
export interface PetalSeed {
  at: Vec3;
  drop: number;
  phase: number;
}

/**
 * The blossom petals outside the building, the same every time for a map:
 * `perSide` down each side of the outline from a tile behind it to its front,
 * `near` to `far` grid units out, and `perVoid` over each void tile (the air
 * outside the building on a map with notches), never over the room.
 */
export function petalSeeds(
  atmosphere: Atmosphere,
  map: Pick<LevelMap, 'width' | 'height'> & Partial<Pick<LevelMap, 'tiles'>>,
): PetalSeed[] {
  const petals = atmosphere.petals;
  if (!petals) return [];
  const drop = petals.top - petals.bottom;
  const sides = [-1, 1].flatMap((side, s) =>
    Array.from({ length: petals.perSide }, (_, k) => {
      const i = s * 1000 + k;
      const out = petals.near + unit(i, 21) * (petals.far - petals.near);
      const x = side < 0 ? -0.5 - out : map.width - 0.5 + out;
      const z = -1.5 + unit(i, 22) * (map.height + 1);
      return { at: { x, y: petals.top, z }, drop, phase: unit(i, 23) };
    }),
  );
  if (!map.tiles || petals.perVoid <= 0) return sides;
  const voids = tilesOf(map as LevelMap, (t) => t === 'void');
  const over = voids.flatMap((t, v) =>
    Array.from({ length: petals.perVoid }, (_, k) => {
      const i = 5000 + v * 16 + k;
      return {
        at: {
          x: t.x + (unit(i, 24) - 0.5) * 0.8,
          y: petals.top,
          z: t.y + (unit(i, 25) - 0.5) * 0.8,
        },
        drop,
        phase: unit(i, 26),
      };
    }),
  );
  return [...sides, ...over];
}

/** A raindrop: where its fall starts (world units), how far it falls, and its phase in [0, 1). */
export interface RainSeed {
  at: Vec3;
  drop: number;
  phase: number;
}

/**
 * The raindrops outside the building, the same every time for a map:
 * `perSide` down each side of the outline from a tile behind it to its
 * front, and `perBack` per column behind the back of each column whose first
 * row is room (behind void lies more building: a post room, a lift shaft),
 * `near` to `far` grid units out. Never over the room, never in front of it.
 */
export function rainSeeds(
  atmosphere: Atmosphere,
  map: Pick<LevelMap, 'width' | 'height'> & Partial<Pick<LevelMap, 'tiles'>>,
): RainSeed[] {
  const rain = atmosphere.rain;
  if (!rain) return [];
  const drop = rain.top - rain.bottom;
  const depth = (i: number) => rain.near + unit(i, 31) * (rain.far - rain.near);
  const sides = [-1, 1].flatMap((side, s) =>
    Array.from({ length: rain.perSide }, (_, k) => {
      const i = s * 1000 + k;
      const out = depth(i);
      const x = side < 0 ? -0.5 - out : map.width - 0.5 + out;
      const z = -1.5 + unit(i, 32) * map.height;
      return { at: { x, y: rain.top, z }, drop, phase: unit(i, 33) };
    }),
  );
  const columns = Array.from({ length: map.width }, (_, x) => x).filter((x) => {
    if (!map.tiles) return true;
    const tile = getTile(map as LevelMap, x, 0);
    return tile !== null && tile !== 'void';
  });
  const back = columns.flatMap((x) =>
    Array.from({ length: rain.perBack }, (_, k) => {
      const i = 3000 + x * 16 + k;
      return {
        at: { x: x - 0.5 + unit(i, 34), y: rain.top, z: -0.5 - depth(i) },
        drop,
        phase: unit(i, 35),
      };
    }),
  );
  return [...sides, ...back];
}

/** One sunbeam through the curtain wall: its foot on the floor and the unit direction up toward the sun. */
export interface SunShaft {
  foot: Vec3;
  dir: Vec3;
}

/**
 * The sunbeams through the left curtain wall (`Atmosphere.shafts.side`):
 * `count` feet spread down the map's left side, `out` grid units outside the
 * outline (never over the room), each beam running from its foot toward the sun.
 * None when the map's left column has void (with tiles): there the building's
 * wall hugs the room and no floor lies beside it for the light to land on.
 */
export function sunShaftSpots(
  atmosphere: Atmosphere,
  map: Pick<LevelMap, 'width' | 'height'> & Partial<Pick<LevelMap, 'tiles'>>,
): SunShaft[] {
  const side = atmosphere.shafts?.side;
  if (!side || side.count <= 0) return [];
  if (map.tiles) {
    for (let z = 0; z < map.height; z++) {
      const tile = getTile(map as LevelMap, 0, z);
      if (tile === null || tile === 'void') return [];
    }
  }
  const { position: p, target: t } = sunPlacement(atmosphere, map);
  const len = Math.hypot(p.x - t.x, p.y - t.y, p.z - t.z) || 1;
  const dir = { x: (p.x - t.x) / len, y: (p.y - t.y) / len, z: (p.z - t.z) / len };
  return Array.from({ length: side.count }, (_, k) => ({
    foot: { x: -0.5 - side.out, y: 0, z: ((k + 0.5) / side.count) * map.height - 0.5 },
    dir,
  }));
}

/**
 * How strongly the mullions' stripes (`Atmosphere.mullions`) darken the floor
 * at world `x`, `z`, in [0, opacity]: bars along the sun's direction across
 * the floor, soft at their edges, strongest on the sun's side and fading
 * away from it; 0 over void and off the map.
 */
export function mullionShade(
  atmosphere: Atmosphere,
  map: Pick<LevelMap, 'width' | 'height'> & Partial<Pick<LevelMap, 'tiles'>>,
  x: number,
  z: number,
): number {
  const m = atmosphere.mullions;
  if (!m) return 0;
  if (map.tiles) {
    const tile = getTile(map as LevelMap, Math.round(x), Math.round(z));
    if (tile === null || tile === 'void') return 0;
  } else if (x < -0.5 || z < -0.5 || x > map.width - 0.5 || z > map.height - 0.5) return 0;
  const { position: p, target: t } = sunPlacement(atmosphere, map);
  const len = Math.hypot(p.x - t.x, p.z - t.z) || 1;
  const dx = (p.x - t.x) / len;
  const dz = (p.z - t.z) / len;
  // Across the bars: which bar, and how far from its middle.
  const across = x * -dz + z * dx;
  const frac = (((across / m.every) % 1) + 1) % 1;
  const off = Math.abs(frac - 0.5) * m.every;
  const edge = 0.05;
  const bar = Math.min(1, Math.max(0, (m.width / 2 + edge - off) / (2 * edge)));
  if (bar === 0) return 0;
  // Along the sun: 1 on its side of the room, `fade` on the far side.
  const along = (x - t.x) * dx + (z - t.z) * dz;
  const half = (Math.abs(dx) * map.width + Math.abs(dz) * map.height) / 2;
  const s = Math.min(1, Math.max(-1, along / half));
  return m.opacity * bar * (m.fade + ((1 - m.fade) * (s + 1)) / 2);
}
