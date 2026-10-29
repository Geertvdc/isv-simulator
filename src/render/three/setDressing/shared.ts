import { type Model, ModelBuilder } from '../kit';
import { PALETTE } from '../look';
import { COLOR } from '../palette';

/** Shared bits of the set dressing: types, colors, and pieces several props are built from. */

export type SeatPose = 'typing' | 'chatting' | 'idle';

export interface Seat {
  /** Where they stand, in the prop's space; they face `yaw` (0 is +z). */
  at: [number, number];
  yaw: number;
  pose: SeatPose;
}

export interface SetPiece {
  /** The prop in look `variant` (0 to `variants` − 1). */
  model: (variant: number) => Model;
  /** Ground it covers, tiles along x and z. */
  size: [number, number];
  /** How many looks it comes in; 1 when left out. */
  variants?: number;
  seats?: readonly Seat[];
}

export const INK = PALETTE.ink;
export const DARK = COLOR.charcoal;
export const WOOD = 0x9a6a42;
export const WOOD_LIGHT = COLOR.woodLight;
export const WOOD_DARK = COLOR.woodDark;
export const LEAF = COLOR.leaf;
export const LEAF_LIGHT = COLOR.leafLight;
export const LEAF_DARK = 0x3d7a45;
const POT = COLOR.terracotta;
export const WHITE = PALETTE.white;
export const STEEL = COLOR.steel;
export const CARDBOARD = COLOR.cardboard;

/** Item `i` of `list`, wrapping round. */
export function nth<T>(list: readonly T[], i: number): T {
  const item = list[((i % list.length) + list.length) % list.length];
  if (item === undefined) throw new Error('nth of an empty list');
  return item;
}

/** A piece with `variants` looks, built by `build(b, variant)`. */
export function looks(
  size: [number, number],
  variants: number,
  build: (b: ModelBuilder, v: number) => void,
  seats?: readonly Seat[],
): SetPiece {
  return {
    size,
    variants,
    model: (v) => {
      const b = new ModelBuilder();
      build(b, v);
      return b.build();
    },
    ...(seats ? { seats } : {}),
  };
}

// ---- Shared bits ----

/** Pots: terracotta, white, charcoal, sage, sand. Nothing in a player's color. */
const POTS = [POT, COLOR.porcelain, COLOR.graphite, 0x8aa08a, 0xc8b48a];

/**
 * A potted plant, its pot's foot at (x, z), `size` times the base size. Five
 * plants: a leafy bush, a cactus, a snake plant, a little fiddle-leaf tree,
 * a trailing pothos; the pot comes in five colors.
 */
export function plantPot(b: ModelBuilder, x: number, z: number, size = 1, look = 0): ModelBuilder {
  const s = size;
  const pot = nth(POTS, look * 3 + Math.floor(look / 5));
  const kind = look % 5;
  b.cylinder(0.16 * s, 0.12 * s, 0.28 * s, pot, { at: [x, 0.14 * s, z] });
  b.cylinder(0.15 * s, 0.15 * s, 0.02 * s, 0x5a4030, { at: [x, 0.275 * s, z] });
  if (kind === 0) {
    b.sphere(0.22 * s, LEAF, { at: [x, 0.42 * s, z] }, [1, 1.1, 1]);
    b.sphere(0.16 * s, LEAF_LIGHT, { at: [x + 0.08 * s, 0.56 * s, z + 0.06 * s] });
    b.sphere(0.13 * s, LEAF, { at: [x - 0.1 * s, 0.6 * s, z - 0.04 * s] });
  } else if (kind === 1) {
    // A cactus with two arms and a pink flower.
    const c = COLOR.cactus;
    b.capsule(0.08 * s, 0.34 * s, c, { at: [x, 0.5 * s, z] });
    b.capsule(0.045 * s, 0.12 * s, c, { at: [x + 0.12 * s, 0.52 * s, z] });
    b.capsule(0.04 * s, 0.1 * s, c, { at: [x - 0.11 * s, 0.44 * s, z] });
    b.box(0.08 * s, 0.03 * s, 0.03 * s, c, { at: [x + 0.08 * s, 0.44 * s, z] }, 0);
    b.sphere(0.04 * s, 0xe08aa8, { at: [x, 0.74 * s, z] });
  } else if (kind === 2) {
    // A snake plant: tall striped blades.
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const h = (0.38 + (i % 3) * 0.08) * s;
      b.box(0.06 * s, h, 0.015 * s, i % 2 ? LEAF_DARK : COLOR.fern, {
        at: [x + Math.cos(a) * 0.05 * s, 0.28 * s + h / 2, z + Math.sin(a) * 0.05 * s],
        rot: [Math.sin(a) * 0.15, a, Math.cos(a) * 0.15],
      });
    }
  } else if (kind === 3) {
    // A little tree: a thin trunk and three round heads.
    b.cylinder(0.018 * s, 0.024 * s, 0.5 * s, WOOD_DARK, { at: [x, 0.52 * s, z] }, 6);
    b.sphere(0.16 * s, LEAF_DARK, { at: [x, 0.82 * s, z] });
    b.sphere(0.12 * s, LEAF, { at: [x + 0.1 * s, 0.7 * s, z + 0.04 * s] });
    b.sphere(0.11 * s, LEAF_LIGHT, { at: [x - 0.09 * s, 0.94 * s, z - 0.03 * s] });
  } else {
    // A pothos spilling over the rim.
    b.sphere(0.17 * s, LEAF_LIGHT, { at: [x, 0.36 * s, z] }, [1.1, 0.7, 1.1]);
    for (const [dx, dz] of [
      [0.15, 0.05],
      [-0.13, 0.08],
      [0.02, 0.16],
    ] as const) {
      b.capsule(0.035 * s, 0.14 * s, LEAF, { at: [x + dx * s, 0.22 * s, z + dz * s] });
    }
  }
  return b;
}

/** Desk mugs: white, charcoal, mint, terracotta. */
const MUGS = [WHITE, COLOR.graphite, 0x9fd4c0, COLOR.terracotta];

export function mug(b: ModelBuilder, x: number, y: number, z: number, look = 0): ModelBuilder {
  const c = nth(MUGS, look);
  b.cylinder(0.04, 0.035, 0.09, c, { at: [x, y + 0.045, z] }, 12);
  b.torus(0.022, 0.008, c, { at: [x + 0.045, y + 0.05, z] });
  return b;
}

/** Book spines, muted. */
export const SPINES = [
  COLOR.clay,
  COLOR.dustyBlue,
  COLOR.khaki,
  COLOR.sage,
  COLOR.plum,
  COLOR.linen,
  0x4a5a6a,
];

/** A row of books standing from `x0` along x, on `y`, `n` of them. */
export function books(
  b: ModelBuilder,
  x0: number,
  y: number,
  z: number,
  n: number,
  look = 0,
): number {
  let x = x0;
  for (let i = 0; i < n; i++) {
    const h = 0.18 + ((i * 7 + look * 3) % 5) * 0.025;
    const w = 0.04 + ((i + look) % 3) * 0.012;
    b.box(w, h, 0.16, nth(SPINES, i * 3 + look), { at: [x + w / 2, y + h / 2, z] }, 0);
    x += w + 0.005;
  }
  return x;
}

/** Code-ish screens: an editor, a dashboard, a terminal, a call, a design. */
export const SCREENS = [COLOR.codeGreen, COLOR.screenBlue, 0x9fe0c8, 0xffc77a, COLOR.lavender];

/**
 * A desk with a monitor (or two) and a chair; the person sits at +z,
 * facing the screen (−z). `look` changes the top, the screens and what
 * stands on it.
 */
export function desk(
  b: ModelBuilder,
  look: number,
  tops = [COLOR.birch, COLOR.oatmeal, WOOD_LIGHT],
): ModelBuilder {
  const top = nth(tops, look);
  b.box(1.1, 0.05, 0.6, top, { at: [0, 0.5, -0.1] }, 0.02);
  for (const x of [-0.5, 0.5]) b.box(0.05, 0.5, 0.5, DARK, { at: [x, 0.25, -0.1] }, 0);
  const screen = nth(SCREENS, look * 2 + 1);
  if (look % 3 === 1) {
    // Two screens, angled in.
    for (const s of [-1, 1]) {
      b.box(0.4, 0.28, 0.04, INK, { at: [s * 0.22, 0.75, -0.28], rot: [0, -s * 0.2, 0] }, 0.015);
      b.screen(0.35, 0.23, screen, {
        at: [s * 0.22 + s * -0.004, 0.75, -0.257],
        rot: [0, -s * 0.2, 0],
      });
    }
  } else if (look % 3 === 2) {
    // A laptop on a stand.
    b.box(0.3, 0.1, 0.2, STEEL, { at: [0, 0.57, -0.25] }, 0.01);
    b.box(0.36, 0.24, 0.02, COLOR.lightSteel, { at: [0, 0.74, -0.33], rot: [-0.2, 0, 0] }, 0.01);
    b.screen(0.32, 0.2, screen, { at: [0, 0.74, -0.318], rot: [-0.2, 0, 0] });
  } else {
    b.box(0.5, 0.32, 0.04, INK, { at: [0, 0.75, -0.3] }, 0.015);
    b.screen(0.44, 0.26, screen, { at: [0, 0.75, -0.277] });
  }
  b.box(0.06, 0.18, 0.04, DARK, { at: [0, 0.6, -0.32] }, 0);
  b.box(0.36, 0.02, 0.12, COLOR.graphite, { at: [0, 0.535, -0.04] }, 0);
  // Something on the desk: a mug, a plant, a lamp, a rubber duck.
  const thing = look % 4;
  if (thing === 0) mug(b, 0.38, 0.525, -0.05, look);
  else if (thing === 1) plantPot(b, -0.42, -0.2, 0.32, look + 1);
  else if (thing === 2) {
    b.cylinder(0.05, 0.06, 0.02, DARK, { at: [0.42, 0.535, -0.25] }, 10);
    b.cylinder(0.01, 0.01, 0.3, DARK, { at: [0.42, 0.68, -0.22], rot: [0.3, 0, 0] }, 6);
    b.cone(0.06, 0.08, DARK, { at: [0.42, 0.82, -0.15], rot: [2.4, 0, 0] }, 10);
  } else {
    b.sphere(0.05, COLOR.aqua, { at: [-0.4, 0.57, -0.02] }, [1.1, 0.85, 1]);
    b.sphere(0.032, COLOR.aqua, { at: [-0.4, 0.635, 0.0] });
    b.box(0.03, 0.012, 0.03, COLOR.tangerine, { at: [-0.4, 0.63, 0.035] }, 0);
  }
  // The chair pushed back behind where they stand.
  const chair = nth([COLOR.graphite, COLOR.slate, COLOR.umber, 0x3f4a44], look);
  b.box(0.42, 0.08, 0.4, chair, { at: [0, 0.4, 0.8] }, 0.03);
  b.box(0.42, 0.42, 0.07, chair, { at: [0, 0.68, 1.0] }, 0.03);
  b.cylinder(0.03, 0.03, 0.3, STEEL, { at: [0, 0.22, 0.8] }, 8);
  b.cylinder(0.2, 0.2, 0.03, DARK, { at: [0, 0.03, 0.8] }, 12);
  return b;
}

/** A tall server rack: dark, with blinking-looking rows of LEDs. `units` tall. */
export function rack(b: ModelBuilder, x: number, h: number, look: number): ModelBuilder {
  b.box(0.55, h, 0.6, 0x252a33, { at: [x, h / 2, 0] }, 0.02);
  const rows = Math.max(3, Math.floor((h - 0.2) / 0.14));
  for (let r = 0; r < rows; r++) {
    const y = 0.15 + r * ((h - 0.25) / rows);
    b.box(0.46, 0.08, 0.01, 0x3a4252, { at: [x, y, 0.302] }, 0);
    for (let k = 0; k < 3; k++) {
      const on = (r * 3 + k + look) % 5;
      b.led(0.014, on === 0 ? COLOR.amber : on === 3 ? COLOR.screenBlue : COLOR.ledGreen, {
        at: [x - 0.18 + k * 0.04, y, 0.31],
      });
    }
  }
  b.box(0.57, 0.04, 0.62, 0x3a4252, { at: [x, h + 0.02, 0] }, 0.01);
  return b;
}

/** Bike frames: muted, never a player's color. */
export const FRAMES = [COLOR.pewter, COLOR.cinnamon, 0x5a7a7a, 0x7a6a8a, 0x9a9a8a];
