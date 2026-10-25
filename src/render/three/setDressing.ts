import { type Model, ModelBuilder, tint } from './kit';
import { PALETTE } from './look';

/**
 * Props for the world around a level (phase 15): what stands outside the
 * office, per chapter. Each stands on the ground at the origin, fronts
 * toward +z, and takes up `size` tiles (x by z) of ground. Some seat
 * people (`seats`): background characters placed and animated by
 * `surroundings.ts`.
 *
 * Most props come in a few looks (`variants`, phase 20): different plants
 * in a pot, other things on a shelf, another paint job. `surroundings.ts`
 * picks the look per placement and tints and sizes each one a little, so
 * two of the same prop rarely look alike.
 */

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

const INK = PALETTE.ink;
const DARK = 0x2b2f38;
const WOOD = 0x9a6a42;
const WOOD_LIGHT = 0xc8a070;
const WOOD_DARK = 0x6a4a32;
const LEAF = 0x4f9d4a;
const LEAF_LIGHT = 0x6cbf5a;
const LEAF_DARK = 0x3d7a45;
const POT = 0xd0704a;
const WHITE = PALETTE.white;
const STEEL = 0x8b939e;
const CARDBOARD = 0xc8955a;

/** Item `i` of `list`, wrapping round. */
function nth<T>(list: readonly T[], i: number): T {
  const item = list[((i % list.length) + list.length) % list.length];
  if (item === undefined) throw new Error('nth of an empty list');
  return item;
}

/** A piece with `variants` looks, built by `build(b, variant)`. */
function looks(
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
const POTS = [POT, 0xe8e4da, 0x3a3f4a, 0x8aa08a, 0xc8b48a];

/**
 * A potted plant, its pot's foot at (x, z), `size` times the base size. Five
 * plants: a leafy bush, a cactus, a snake plant, a little fiddle-leaf tree,
 * a trailing pothos; the pot comes in five colors.
 */
function plantPot(b: ModelBuilder, x: number, z: number, size = 1, look = 0): ModelBuilder {
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
    const c = 0x5f9a62;
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
      b.box(0.06 * s, h, 0.015 * s, i % 2 ? LEAF_DARK : 0x7aa86a, {
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
const MUGS = [WHITE, 0x3a3f4a, 0x9fd4c0, 0xd0704a];

function mug(b: ModelBuilder, x: number, y: number, z: number, look = 0): ModelBuilder {
  const c = nth(MUGS, look);
  b.cylinder(0.04, 0.035, 0.09, c, { at: [x, y + 0.045, z] }, 12);
  b.torus(0.022, 0.008, c, { at: [x + 0.045, y + 0.05, z] });
  return b;
}

/** Book spines, muted. */
const SPINES = [0x9a6a5a, 0x5a6a8a, 0xb8a67a, 0x6a7a6a, 0x7a5a8c, 0xc8b8a0, 0x4a5a6a];

/** A row of books standing from `x0` along x, on `y`, `n` of them. */
function books(b: ModelBuilder, x0: number, y: number, z: number, n: number, look = 0): number {
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
const SCREENS = [0x4ee08a, 0x7ab8ff, 0x9fe0c8, 0xffc77a, 0xc8a8ff];

/**
 * A desk with a monitor (or two) and a chair; the person sits at +z,
 * facing the screen (−z). `look` changes the top, the screens and what
 * stands on it.
 */
function desk(b: ModelBuilder, look: number, tops = [0xe8dcc4, 0xd8ccb0, 0xc8a070]): ModelBuilder {
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
    b.box(0.36, 0.24, 0.02, 0xc9ccd2, { at: [0, 0.74, -0.33], rot: [-0.2, 0, 0] }, 0.01);
    b.screen(0.32, 0.2, screen, { at: [0, 0.74, -0.318], rot: [-0.2, 0, 0] });
  } else {
    b.box(0.5, 0.32, 0.04, INK, { at: [0, 0.75, -0.3] }, 0.015);
    b.screen(0.44, 0.26, screen, { at: [0, 0.75, -0.277] });
  }
  b.box(0.06, 0.18, 0.04, DARK, { at: [0, 0.6, -0.32] }, 0);
  b.box(0.36, 0.02, 0.12, 0x3a3f4a, { at: [0, 0.535, -0.04] }, 0);
  // Something on the desk: a mug, a plant, a lamp, a rubber duck.
  const thing = look % 4;
  if (thing === 0) mug(b, 0.38, 0.525, -0.05, look);
  else if (thing === 1) plantPot(b, -0.42, -0.2, 0.32, look + 1);
  else if (thing === 2) {
    b.cylinder(0.05, 0.06, 0.02, DARK, { at: [0.42, 0.535, -0.25] }, 10);
    b.cylinder(0.01, 0.01, 0.3, DARK, { at: [0.42, 0.68, -0.22], rot: [0.3, 0, 0] }, 6);
    b.cone(0.06, 0.08, DARK, { at: [0.42, 0.82, -0.15], rot: [2.4, 0, 0] }, 10);
  } else {
    b.sphere(0.05, 0xf2c94c, { at: [-0.4, 0.57, -0.02] }, [1.1, 0.85, 1]);
    b.sphere(0.032, 0xf2c94c, { at: [-0.4, 0.635, 0.0] });
    b.box(0.03, 0.012, 0.03, 0xe08a3a, { at: [-0.4, 0.63, 0.035] }, 0);
  }
  // The chair pushed back behind where they stand.
  const chair = nth([0x3a3f4a, 0x4a5262, 0x5a4a48, 0x3f4a44], look);
  b.box(0.42, 0.08, 0.4, chair, { at: [0, 0.4, 0.8] }, 0.03);
  b.box(0.42, 0.42, 0.07, chair, { at: [0, 0.68, 1.0] }, 0.03);
  b.cylinder(0.03, 0.03, 0.3, STEEL, { at: [0, 0.22, 0.8] }, 8);
  b.cylinder(0.2, 0.2, 0.03, DARK, { at: [0, 0.03, 0.8] }, 12);
  return b;
}

/** A tall server rack: dark, with blinking-looking rows of LEDs. `units` tall. */
function rack(b: ModelBuilder, x: number, h: number, look: number): ModelBuilder {
  b.box(0.55, h, 0.6, 0x252a33, { at: [x, h / 2, 0] }, 0.02);
  const rows = Math.max(3, Math.floor((h - 0.2) / 0.14));
  for (let r = 0; r < rows; r++) {
    const y = 0.15 + r * ((h - 0.25) / rows);
    b.box(0.46, 0.08, 0.01, 0x3a4252, { at: [x, y, 0.302] }, 0);
    for (let k = 0; k < 3; k++) {
      const on = (r * 3 + k + look) % 5;
      b.led(0.014, on === 0 ? 0xffc04a : on === 3 ? 0x7ab8ff : 0x5cf08a, {
        at: [x - 0.18 + k * 0.04, y, 0.31],
      });
    }
  }
  b.box(0.57, 0.04, 0.62, 0x3a4252, { at: [x, h + 0.02, 0] }, 0.01);
  return b;
}

// ---- Garage ----

/** Car paint: dull, never a player's color. */
const CAR_PAINT = [0x9aa4ae, 0x6a7a8a, 0x8a7a6a, 0x5a6a5a, 0xb8b0a0];

const car = looks([2, 3], 3, (b, v) => {
  const paint = nth(CAR_PAINT, v * 2);
  b.box(1.5, 0.45, 2.6, paint, { at: [0, 0.42, 0] }, 0.18);
  if (v === 2) {
    // A camper van: a tall box behind the cab.
    b.box(1.45, 0.75, 1.7, tint(paint, 0.3), { at: [0, 1.0, -0.4] }, 0.12);
    b.pane(1.3, 0.3, 0.6, 0xbfe2f0, { at: [0, 0.82, 0.75] });
    b.box(1.47, 0.08, 1.72, tint(paint, -0.2), { at: [0, 0.8, -0.4] }, 0);
  } else {
    b.box(1.3, 0.42, v === 1 ? 1.9 : 1.4, paint, { at: [0, 0.82, v === 1 ? -0.35 : -0.15] }, 0.16);
    b.pane(1.32, 0.34, v === 1 ? 1.7 : 1.2, 0xbfe2f0, { at: [0, 0.84, v === 1 ? -0.35 : -0.15] });
  }
  if (v === 1) b.box(1.1, 0.06, 1.4, DARK, { at: [0, 1.06, -0.4] }, 0);
  for (const [x, z] of [
    [-0.72, 0.85],
    [0.72, 0.85],
    [-0.72, -0.85],
    [0.72, -0.85],
  ] as const) {
    b.cylinder(0.24, 0.24, 0.18, INK, { at: [x, 0.24, z], rot: [0, 0, Math.PI / 2] }, 16);
    b.cylinder(0.12, 0.12, 0.19, STEEL, { at: [x, 0.24, z], rot: [0, 0, Math.PI / 2] }, 12);
  }
  b.led(0.07, 0xfff4c0, { at: [-0.5, 0.48, 1.3] });
  b.led(0.07, 0xfff4c0, { at: [0.5, 0.48, 1.3] });
  b.led(0.06, 0xff5040, { at: [-0.55, 0.5, -1.3] });
  b.led(0.06, 0xff5040, { at: [0.55, 0.5, -1.3] });
});

const FRAMES = [0x5a6470, 0x8a6a5a, 0x5a7a7a, 0x7a6a8a, 0x9a9a8a];

const bike = looks([1, 1], 4, (b, v) => {
  const frame = nth(FRAMES, v);
  const r = v === 3 ? 0.13 : 0.18;
  const s = v === 3 ? 0.75 : 1;
  for (const z of [-0.3 * s, 0.3 * s]) {
    b.torus(r, 0.025, INK, { at: [0, r + 0.02, z], rot: [0, Math.PI / 2, 0] });
  }
  b.box(0.03, 0.03, 0.6 * s, frame, { at: [0, 0.32 * s, 0], rot: [0.3, 0, 0] }, 0);
  b.box(0.03, 0.25 * s, 0.03, frame, { at: [0, 0.35 * s, 0.12 * s] }, 0);
  b.box(0.06, 0.03, 0.14, INK, { at: [0, 0.48 * s, 0.1 * s] }, 0);
  b.box(0.32, 0.025, 0.025, STEEL, { at: [0, 0.48 * s, -0.26 * s] }, 0);
  // A basket on the front, or a crate on the back.
  if (v === 1) b.box(0.22, 0.14, 0.18, WOOD_LIGHT, { at: [0, 0.45, -0.38] }, 0.01);
  if (v === 2) b.box(0.24, 0.16, 0.24, CARDBOARD, { at: [0, 0.5, 0.28] }, 0.01);
});

/** Shelf stock: cardboard, dull tins, an old monitor, paint pots. Nothing in a player's color. */
const shelves = looks([2, 1], 4, (b, v) => {
  const post = nth([STEEL, WOOD, 0x5a6470, STEEL], v);
  for (const x of [-0.85, 0.85]) b.box(0.06, 1.4, 0.4, post, { at: [x, 0.7, 0] }, 0);
  const colors = [CARDBOARD, 0x9a7a6a, 0x8a96a3, 0xb8a67a, 0x7a8a7a, 0xa88a6a];
  for (let s = 0; s < 3; s++) {
    const y = 0.15 + s * 0.45;
    b.box(1.7, 0.04, 0.4, post, { at: [0, y, 0] }, 0);
    if (v === 1 && s === 1) {
      // A beige monitor from the nineties, and a stack of floppies.
      b.box(0.42, 0.34, 0.34, 0xd8d0b8, { at: [-0.35, y + 0.19, 0] }, 0.04);
      b.screen(0.3, 0.22, 0x3a6a5a, { at: [-0.35, y + 0.21, 0.172] });
      for (let k = 0; k < 4; k++)
        b.box(
          0.14,
          0.012,
          0.14,
          nth([INK, 0x5a6a8a, INK, 0x8a5a5a], k),
          { at: [0.3, y + 0.03 + k * 0.014, 0] },
          0,
        );
      continue;
    }
    if (v === 2 && s === 2) {
      books(b, -0.75, y + 0.02, 0, 14, s);
      continue;
    }
    for (let i = 0; i < 4; i++) {
      const c = nth(colors, s * 3 + i + v * 2);
      const kind = (s + i + v) % 3;
      if (kind === 0) {
        b.cylinder(0.1, 0.1, 0.2, c, { at: [-0.6 + i * 0.38, y + 0.12, 0] }, 12);
      } else if (kind === 1 || v !== 3) {
        b.box(0.3, 0.26, 0.3, c, { at: [-0.6 + i * 0.38, y + 0.15, 0] }, 0.02);
      } else {
        // A coil of cable.
        b.torus(0.1, 0.04, 0x3a3f4a, {
          at: [-0.6 + i * 0.38, y + 0.06, 0],
          rot: [Math.PI / 2, 0, 0],
        });
      }
    }
  }
});

/** The trees: a round oak, a pine, a birch, a fruit tree. */
const tree = looks([2, 2], 4, (b, v) => {
  if (v === 1) {
    b.cylinder(0.1, 0.14, 0.6, 0x6a4a32, { at: [0, 0.3, 0] }, 8);
    for (const [y, r, c] of [
      [0.85, 0.75, LEAF_DARK],
      [1.4, 0.58, 0x4a8a50],
      [1.9, 0.4, LEAF_DARK],
    ] as const) {
      b.cone(r, 0.8, c, { at: [0, y, 0] }, 9);
    }
  } else if (v === 2) {
    b.cylinder(0.07, 0.1, 1.6, 0xe8e4da, { at: [0, 0.8, 0] }, 8);
    for (const y of [0.4, 0.75, 1.1]) b.box(0.08, 0.02, 0.15, INK, { at: [0, y, 0.06] }, 0);
    b.sphere(0.45, 0x8ab85a, { at: [0.1, 1.75, 0] }, [0.9, 1.3, 0.9]);
    b.sphere(0.32, 0x9ac86a, { at: [-0.25, 1.5, 0.1] });
  } else {
    b.cylinder(0.12, 0.16, 1.1, 0x7a5236, { at: [0, 0.55, 0] }, 10);
    b.sphere(0.7, LEAF, { at: [0, 1.4, 0] }, [1, 0.9, 1]);
    b.sphere(0.5, LEAF_LIGHT, { at: [0.35, 1.75, 0.2] });
    b.sphere(0.45, LEAF, { at: [-0.4, 1.65, -0.15] });
    if (v === 3) {
      for (const [x, y, z] of [
        [0.4, 1.3, 0.45],
        [-0.3, 1.5, 0.5],
        [0.1, 1.85, 0.5],
        [-0.55, 1.25, 0.2],
      ] as const)
        b.sphere(0.07, 0xd88a5a, { at: [x, y, z] });
    }
  }
});

const bushes = looks([1, 1], 4, (b, v) => {
  if (v === 2) {
    // A clipped box hedge.
    b.box(0.8, 0.5, 0.6, LEAF_DARK, { at: [0, 0.25, 0] }, 0.08);
    return;
  }
  b.sphere(0.32, v === 3 ? LEAF_DARK : LEAF, { at: [-0.12, 0.25, 0] }, [1, 0.8, 1]);
  b.sphere(0.26, LEAF_LIGHT, { at: [0.2, 0.22, 0.1] }, [1, 0.8, 1]);
  const flowers = nth([[0xff6b8a, 0xffd166], [0xc8a8ff, 0xf4f1ea], [], [0xf4f1ea, 0xf4f1ea]], v);
  flowers.forEach((c, i) => b.sphere(0.06, c, { at: [i ? -0.2 : 0.1, 0.46, i ? 0.1 : 0.2] }));
});

const hoop = looks([1, 1], 1, (b) => {
  b.cylinder(0.05, 0.05, 2, STEEL, { at: [0, 1, -0.2] }, 10);
  b.box(0.8, 0.55, 0.05, WHITE, { at: [0, 2, -0.1] }, 0.02);
  b.box(0.3, 0.22, 0.01, 0x8a6a5a, { at: [0, 1.92, -0.07] }, 0);
  b.torus(0.18, 0.02, 0xff7a2f, { at: [0, 1.78, 0.12], rot: [Math.PI / 2, 0, 0] });
  b.sphere(0.12, 0xff7a2f, { at: [0.3, 0.12, 0.4] });
});

const drums = looks([1, 1], 3, (b, v) => {
  const a = nth([0x7a6a5a, 0x5a6a7a, 0x6a5a5a], v);
  b.cylinder(0.22, 0.22, 0.6, a, { at: [-0.15, 0.3, 0] }, 16);
  b.torus(0.21, 0.015, tint(a, -0.3), { at: [-0.15, 0.45, 0], rot: [Math.PI / 2, 0, 0] });
  if (v === 1) {
    b.box(0.3, 0.3, 0.3, CARDBOARD, { at: [0.25, 0.15, 0.1] }, 0.02);
    b.box(
      0.24,
      0.2,
      0.24,
      tint(CARDBOARD, -0.15),
      { at: [0.22, 0.4, 0.08], rot: [0, 0.4, 0] },
      0.02,
    );
  } else {
    b.cylinder(0.2, 0.2, 0.55, 0x6a7a6a, { at: [0.25, 0.28, 0.1] }, 16);
    if (v === 2) b.cylinder(0.18, 0.18, 0.5, 0x8a7a5a, { at: [0.05, 0.25, -0.3] }, 16);
  }
});

const cat = looks([1, 1], 1, (b) => {
  const fur = 0xe08a3a;
  b.box(0.5, 0.06, 0.4, 0x8c5f3d, { at: [0, 0.03, 0] }, 0.02);
  b.sphere(0.16, fur, { at: [0, 0.16, 0] }, [1.3, 0.75, 1]);
  b.sphere(0.1, fur, { at: [0.18, 0.24, 0.05] });
  b.cone(0.04, 0.07, fur, { at: [0.15, 0.34, 0.03] }, 4);
  b.cone(0.04, 0.07, fur, { at: [0.22, 0.34, 0.08] }, 4);
  b.capsule(0.03, 0.22, fur, { at: [-0.22, 0.12, 0.1], rot: [0, 0.6, Math.PI / 2] });
});

/** A workbench: a vise and tools, a PC being built, or a soldering corner. */
const workbench = looks([2, 1], 3, (b, v) => {
  const top = nth([WOOD_LIGHT, WOOD, 0x8a8a7a], v);
  b.box(1.6, 0.06, 0.6, top, { at: [0, 0.8, 0] }, 0.02);
  for (const x of [-0.72, 0.72])
    for (const z of [-0.24, 0.24]) b.box(0.06, 0.78, 0.06, WOOD_DARK, { at: [x, 0.39, z] }, 0);
  b.box(1.5, 0.04, 0.5, top, { at: [0, 0.2, 0] }, 0);
  // A pegboard behind it.
  b.box(1.6, 0.7, 0.03, 0xb8a888, { at: [0, 1.25, -0.28] }, 0.01);
  if (v === 0) {
    b.box(0.2, 0.12, 0.14, 0x5a6a7a, { at: [-0.55, 0.89, 0.15] }, 0.02);
    for (let i = 0; i < 4; i++)
      b.box(
        0.03,
        0.25 + (i % 2) * 0.1,
        0.02,
        nth([STEEL, 0x8a5a4a, STEEL, WOOD_DARK], i),
        { at: [-0.4 + i * 0.22, 1.3, -0.25] },
        0,
      );
    b.box(0.5, 0.25, 0.25, 0x7a5a4a, { at: [0.4, 0.96, 0.05] }, 0.03);
  } else if (v === 1) {
    // An open PC case, a fan glowing inside.
    b.box(0.25, 0.45, 0.45, 0x3a3f4a, { at: [-0.3, 1.06, 0] }, 0.02);
    b.screen(0.3, 0.3, 0x7ab8ff, { at: [-0.17, 1.06, 0], rot: [0, Math.PI / 2, 0] });
    b.box(0.3, 0.02, 0.2, 0x4a7a5a, { at: [0.3, 0.84, 0.05] }, 0);
    b.box(0.08, 0.02, 0.06, INK, { at: [0.3, 0.86, 0.05] }, 0);
  } else {
    // Soldering: a lamp, a board, a spool.
    b.cylinder(0.01, 0.01, 0.4, DARK, { at: [-0.5, 1.05, 0], rot: [0, 0, 0.3] }, 6);
    b.cylinder(0.07, 0.07, 0.03, DARK, { at: [-0.44, 1.25, 0.05] }, 12);
    b.led(0.04, 0xfff0c0, { at: [-0.44, 1.22, 0.05] });
    b.box(0.3, 0.015, 0.2, 0x3a7a5a, { at: [-0.3, 0.84, 0.1] }, 0);
    b.torus(0.06, 0.03, 0xc8b070, { at: [0.3, 0.87, 0.1], rot: [Math.PI / 2, 0, 0] });
  }
});

/** Wheelie bins: grey, green or brown lids. */
const bins = looks([1, 1], 3, (b, v) => {
  const n = v === 2 ? 1 : 2;
  for (let i = 0; i < n; i++) {
    const c = nth([0x5a6470, 0x4a6a4a, 0x6a5a4a], v + i);
    const x = n === 1 ? 0 : -0.2 + i * 0.4;
    b.box(0.34, 0.6, 0.4, c, { at: [x, 0.32, 0] }, 0.03);
    b.box(0.37, 0.04, 0.44, tint(c, -0.2), { at: [x, 0.64, 0.01] }, 0.01);
    b.cylinder(0.05, 0.05, 0.04, INK, { at: [x - 0.15, 0.05, -0.18], rot: [0, 0, Math.PI / 2] }, 8);
  }
});

const tires = looks([1, 1], 3, (b, v) => {
  const n = 2 + v;
  for (let i = 0; i < n; i++)
    b.torus(0.26, 0.09, 0x2b2f38, {
      at: [((i * 7) % 3) * 0.02, 0.09 + i * 0.17, 0],
      rot: [Math.PI / 2, 0, 0],
    });
});

/** A pile of old computers: beige towers and a CRT. */
const oldPCs = looks([1, 1], 2, (b, v) => {
  b.box(0.22, 0.45, 0.45, 0xd8d0b8, { at: [-0.22, 0.23, 0], rot: [0, 0.1 * v, 0] }, 0.02);
  b.box(0.36, 0.3, 0.32, 0xc8c0a8, { at: [0.15, 0.15, 0.05] }, 0.04);
  b.box(0.34, 0.06, 0.12, 0xb8b0a0, { at: [0.15, 0.33, 0.15] }, 0.01);
  if (v === 1) b.box(0.4, 0.06, 0.15, 0xd8d0b8, { at: [0.1, 0.36, -0.1], rot: [0, 0.3, 0] }, 0.01);
  else b.box(0.3, 0.26, 0.28, 0xe0d8c0, { at: [0.15, 0.45, 0.02] }, 0.04);
});

const shed = looks([2, 2], 3, (b, v) => {
  const wall = nth([0x8a7a6a, 0x6a7a7a, 0x9a8a6a], v);
  const roof = nth([0x5a4a48, 0x4a5a5a, 0x6a4a3a], v);
  b.box(1.5, 1.1, 1.3, wall, { at: [0, 0.55, 0] }, 0.03);
  for (let i = 0; i < 6; i++)
    b.box(0.015, 1.08, 0.01, tint(wall, -0.2), { at: [-0.6 + i * 0.24, 0.55, 0.655] }, 0);
  b.box(1.7, 0.06, 1.55, roof, { at: [0, 1.2, 0], rot: [0.2, 0, 0] }, 0.02);
  b.box(0.5, 0.85, 0.03, tint(wall, -0.25), { at: [-0.3, 0.44, 0.66] }, 0.01);
  if (v !== 1) b.box(0.3, 0.25, 0.02, 0xbfe2f0, { at: [0.4, 0.75, 0.66] }, 0.01);
});

const fencePanel = looks([2, 1], 2, (b, v) => {
  const c = nth([0xc8b8a0, 0x8a6a4a], v);
  for (const y of [0.22, 0.55]) b.box(1.8, 0.05, 0.04, c, { at: [0, y, -0.05] }, 0);
  for (let i = 0; i < (v ? 6 : 12); i++) {
    const w = v ? 0.28 : 0.1;
    const x = -0.9 + w / 2 + i * (1.8 / (v ? 6 : 12));
    b.box(w, v ? 0.75 : 0.65 + (i % 2) * 0.04, 0.03, c, { at: [x, v ? 0.375 : 0.34, 0] }, 0);
  }
});

const kennel = looks([1, 1], 2, (b, v) => {
  const c = nth([0xa88a6a, 0x7a8a9a], v);
  b.box(0.6, 0.45, 0.65, c, { at: [0, 0.23, 0] }, 0.02);
  b.box(0.72, 0.05, 0.72, 0x6a4a3a, { at: [0.18, 0.55, 0], rot: [0, 0, -0.6] }, 0);
  b.box(0.72, 0.05, 0.72, 0x6a4a3a, { at: [-0.18, 0.55, 0], rot: [0, 0, 0.6] }, 0);
  b.box(0.24, 0.3, 0.02, INK, { at: [0, 0.18, 0.33] }, 0);
  b.cylinder(0.1, 0.08, 0.05, 0x8a96a3, { at: [0.3, 0.03, 0.42] }, 12);
});

// ---- Startup (a loft) ----

const beanbags = looks([2, 1], 3, (b, v) => {
  // Muted purple, teal, rust, slate: never a player's red, blue, yellow or green.
  const fabric = [0x7a5a8c, 0x4f8a80, 0xa86a50, 0x5a6a7a, 0x8a7a5a];
  b.sphere(0.32, nth(fabric, v), { at: [-0.45, 0.22, 0] }, [1, 0.7, 1]);
  b.sphere(0.3, nth(fabric, v + 1), { at: [0.4, 0.2, 0.1] }, [1, 0.7, 1]);
  if (v === 2) b.sphere(0.26, nth(fabric, v + 2), { at: [0, 0.18, -0.35] }, [1, 0.7, 1]);
  b.box(0.6, 0.05, 0.4, WOOD, { at: [0, 0.03, 0.45] }, 0.02);
  if (v === 1) b.box(0.3, 0.02, 0.2, 0xc9ccd2, { at: [0.1, 0.06, 0.45] }, 0);
});

const pingPong = looks(
  [2, 2],
  2,
  (b, v) => {
    b.box(1.5, 0.05, 0.9, nth([0x2f7a5c, 0x2f5a7a], v), { at: [0, 0.7, 0] }, 0.02);
    b.box(1.5, 0.006, 0.02, WHITE, { at: [0, 0.73, 0] }, 0);
    b.box(0.02, 0.12, 0.92, WHITE, { at: [0, 0.78, 0] }, 0);
    for (const [x, z] of [
      [-0.65, -0.35],
      [0.65, -0.35],
      [-0.65, 0.35],
      [0.65, 0.35],
    ] as const) {
      b.box(0.05, 0.68, 0.05, DARK, { at: [x, 0.34, z] }, 0);
    }
    b.sphere(0.03, 0xffffff, { at: [0.3, 0.9, 0.1] });
  },
  [
    { at: [-0.95, 0], yaw: Math.PI / 2, pose: 'chatting' },
    { at: [0.95, 0], yaw: -Math.PI / 2, pose: 'chatting' },
  ],
);

const bigPlant = looks([1, 1], 10, (b, v) => {
  plantPot(b, 0, 0, 1.3 + (v % 3) * 0.2, v);
});

const neonSign = looks([2, 1], 1, (b) => {
  b.box(1.6, 0.8, 0.08, 0x2b2f38, { at: [0, 1.4, 0] }, 0.03);
  for (const x of [-0.7, 0.7]) b.box(0.05, 1.0, 0.05, DARK, { at: [x, 0.5, 0] }, 0);
  // "SHIP IT" as glowing bars, a rocket-ish shape beside it.
  const pink = 0xff4fa3;
  for (let i = 0; i < 6; i++) {
    b.screen(0.16, 0.05, pink, { at: [-0.55 + i * 0.2, 1.55, 0.045] });
    b.screen(0.05, 0.3, i % 2 ? 0x4fe0ff : pink, { at: [-0.55 + i * 0.2, 1.35, 0.045] });
  }
});

const coffeeBar = looks(
  [2, 1],
  3,
  (b, v) => {
    b.box(1.8, 0.9, 0.6, nth([0x4a3a30, 0x3a4048, 0x5a4a3a], v), { at: [0, 0.45, 0] }, 0.03);
    b.box(1.9, 0.06, 0.7, nth([0xe8dcc4, 0x9a9a92, WOOD_LIGHT], v), { at: [0, 0.93, 0] }, 0.02);
    // An espresso machine with a glowing dial (or a pour-over set), cups and a jar of beans.
    if (v === 1) {
      b.cone(0.1, 0.16, WHITE, { at: [-0.4, 1.16, 0], rot: [Math.PI, 0, 0] }, 12);
      b.cylinder(0.08, 0.09, 0.18, 0xbfe2f0, { at: [-0.4, 1.05, 0] }, 12);
      b.cylinder(0.06, 0.07, 0.22, STEEL, { at: [-0.1, 1.07, -0.1] }, 12);
    } else {
      b.box(0.5, 0.42, 0.36, v ? 0xd0704a : STEEL, { at: [-0.4, 1.17, -0.08] }, 0.04);
      b.box(0.42, 0.06, 0.2, DARK, { at: [-0.4, 1.0, 0.1] }, 0);
      b.led(0.04, 0x7cf0c8, { at: [-0.25, 1.3, 0.1] });
    }
    for (let i = 0; i < 2 + v; i++) mug(b, 0.15 + i * 0.15, 0.96, 0.1, i + v);
    b.cylinder(0.09, 0.09, 0.22, 0xfff4e0, { at: [0.75, 1.07, -0.1] });
  },
  [{ at: [0, 0.75], yaw: Math.PI, pose: 'chatting' }],
);

const arcade = looks([1, 1], 3, (b, v) => {
  const body = nth([0x5a4a78, 0x3a5a6a, 0x6a4a4a], v);
  b.box(0.6, 1.5, 0.55, body, { at: [0, 0.75, 0] }, 0.04);
  b.box(0.62, 0.2, 0.57, tint(body, 0.25), { at: [0, 1.52, 0] }, 0.03);
  b.box(0.5, 0.42, 0.06, INK, { at: [0, 1.15, 0.26] }, 0.01);
  b.screen(0.42, 0.34, nth([0x5cf0ff, 0xff8ad8, 0x9fff8a], v), { at: [0, 1.15, 0.295] });
  b.box(0.5, 0.1, 0.25, DARK, { at: [0, 0.8, 0.35] }, 0);
  b.led(0.03, 0xff4f4f, { at: [-0.1, 0.87, 0.4] });
  b.led(0.03, 0xffd166, { at: [0.1, 0.87, 0.4] });
});

/** A standing desk with a laptop or monitor, someone typing at it. */
const standingDesk = looks(
  [1, 1],
  3,
  (b, v) => {
    const top = nth([WOOD_LIGHT, 0xe8e4da, 0x3a3f4a], v);
    b.box(0.9, 0.04, 0.5, top, { at: [0, 1.0, -0.1] }, 0.01);
    for (const x of [-0.38, 0.38]) {
      b.box(0.05, 1.0, 0.05, DARK, { at: [x, 0.5, -0.1] }, 0);
      b.box(0.06, 0.03, 0.4, DARK, { at: [x, 0.015, -0.1] }, 0);
    }
    if (v === 1) {
      b.box(0.45, 0.28, 0.03, INK, { at: [0, 1.3, -0.28] }, 0.01);
      b.screen(0.4, 0.23, nth(SCREENS, v + 2), { at: [0, 1.3, -0.262] });
    } else {
      b.box(0.3, 0.012, 0.2, 0xc9ccd2, { at: [0, 1.03, -0.05] }, 0);
      b.box(0.3, 0.2, 0.012, 0xc9ccd2, { at: [0, 1.12, -0.15], rot: [-0.3, 0, 0] }, 0);
      b.screen(0.26, 0.16, nth(SCREENS, v), { at: [0, 1.12, -0.142], rot: [-0.3, 0, 0] });
    }
    mug(b, 0.3, 1.02, -0.15, v + 2);
  },
  [{ at: [0, 0.3], yaw: Math.PI, pose: 'typing' }],
);

const bookshelf = looks([2, 1], 3, (b, v) => {
  const wood = nth([WOOD, 0xb0aca2, 0x4a4a48], v);
  b.box(1.6, 1.6, 0.36, wood, { at: [0, 0.8, -0.02] }, 0.02);
  b.box(1.5, 1.5, 0.3, tint(wood, -0.35), { at: [0, 0.8, 0.02] }, 0);
  for (let s = 0; s < 4; s++) {
    const y = 0.08 + s * 0.38;
    b.box(1.5, 0.03, 0.32, wood, { at: [0, y, 0.02] }, 0);
    const end = books(b, -0.72, y + 0.015, 0.04, 6 + ((s + v) % 4) * 2, s + v * 4);
    // Something else on some shelves: a plant, a box, a trophy.
    const thing = (s + v) % 3;
    if (end < 0.4 && thing === 0) plantPot(b, 0.5, 0.04, 0.4, s + v);
    else if (end < 0.4 && thing === 1)
      b.box(0.3, 0.22, 0.25, nth(SPINES, s + v), { at: [0.5, y + 0.13, 0.04] }, 0.02);
    else if (end < 0.4) {
      b.cylinder(0.04, 0.06, 0.04, 0xc8a050, { at: [0.5, y + 0.035, 0.04] }, 10);
      b.cylinder(0.07, 0.03, 0.12, 0xc8a050, { at: [0.5, y + 0.12, 0.04] }, 10);
    }
  }
});

const foosball = looks(
  [2, 1],
  2,
  (b, v) => {
    b.box(1.3, 0.25, 0.7, nth([WOOD, 0x3a3f4a], v), { at: [0, 0.8, 0] }, 0.03);
    b.box(1.2, 0.02, 0.6, 0x3f7a4a, { at: [0, 0.9, 0] }, 0);
    for (const x of [-0.6, 0.6])
      for (const z of [-0.3, 0.3]) b.box(0.06, 0.7, 0.06, DARK, { at: [x, 0.35, z] }, 0);
    for (let i = 0; i < 6; i++) {
      const x = -0.5 + i * 0.2;
      b.cylinder(0.012, 0.012, 1.0, STEEL, { at: [x, 0.95, 0], rot: [Math.PI / 2, 0, 0] }, 6);
      b.box(0.04, 0.08, 0.04, i % 2 ? 0x8a6a8a : 0xd8d0c0, { at: [x, 0.93, 0] }, 0);
    }
  },
  [{ at: [0, 0.65], yaw: Math.PI, pose: 'chatting' }],
);

/** A whiteboard on wheels with a few kinds of scribble: a flow chart, a burndown, sticky notes. */
const whiteboardStand = looks([1, 1], 3, (b, v) => {
  b.box(0.9, 0.6, 0.03, WHITE, { at: [0, 1.2, 0] }, 0.01);
  b.box(0.94, 0.64, 0.02, 0x9aa3ad, { at: [0, 1.2, -0.02] }, 0.01);
  for (const x of [-0.42, 0.42]) {
    b.box(0.03, 1.2, 0.03, STEEL, { at: [x, 0.62, -0.03] }, 0);
    b.box(0.03, 0.03, 0.4, STEEL, { at: [x, 0.05, -0.03] }, 0);
  }
  if (v === 0) {
    for (const [x, y] of [
      [-0.25, 1.35],
      [0.05, 1.35],
      [0.3, 1.15],
      [-0.1, 1.05],
    ] as const)
      b.box(0.16, 0.08, 0.005, 0x5a7ad0, { at: [x, y, 0.02] }, 0);
    b.box(0.3, 0.012, 0.005, INK, { at: [-0.1, 1.35, 0.02] }, 0);
  } else if (v === 1) {
    for (let i = 0; i < 6; i++)
      b.box(
        0.12,
        0.012,
        0.005,
        0xd05a4a,
        { at: [-0.3 + i * 0.12, 1.4 - i * 0.05, 0.02], rot: [0, 0, -0.4] },
        0,
      );
    b.box(0.012, 0.4, 0.005, INK, { at: [-0.38, 1.2, 0.02] }, 0);
    b.box(0.7, 0.012, 0.005, INK, { at: [0, 1.0, 0.02] }, 0);
  } else {
    for (let i = 0; i < 6; i++)
      b.box(
        0.11,
        0.11,
        0.006,
        nth([0xffe066, 0x8fd3ff, 0xff9fb0, 0xa6e88a], i),
        {
          at: [-0.3 + (i % 3) * 0.25, 1.32 - Math.floor(i / 3) * 0.2, 0.022],
          rot: [0, 0, (i % 3) * 0.05 - 0.05],
        },
        0,
      );
  }
});

const fridge = looks([1, 1], 2, (b, v) => {
  b.box(0.65, 1.5, 0.6, nth([0xb8b4aa, 0x3a3f4a], v), { at: [0, 0.75, 0] }, 0.04);
  b.screen(0.5, 1.1, 0xd8f0ff, { at: [0, 0.8, 0.305] });
  for (let s = 0; s < 4; s++) {
    for (let i = 0; i < 4; i++)
      b.box(
        0.06,
        0.16,
        0.06,
        nth([0xd08a5a, 0x8ac87a, 0xc8a0e0, 0xe8d070], s + i),
        {
          at: [-0.17 + i * 0.11, 0.35 + s * 0.27, 0.25],
        },
        0,
      );
  }
  b.box(0.65, 0.18, 0.62, nth([0xd0704a, 0x4f8a80], v), { at: [0, 1.42, 0] }, 0.03);
});

const highTable = looks(
  [2, 1],
  2,
  (b, v) => {
    b.box(1.4, 0.05, 0.6, nth([WOOD_LIGHT, 0x3a3f4a], v), { at: [0, 1.0, 0] }, 0.02);
    for (const x of [-0.6, 0.6]) b.box(0.05, 1.0, 0.05, DARK, { at: [x, 0.5, 0] }, 0);
    for (const x of [-0.45, 0, 0.45]) {
      b.cylinder(
        0.14,
        0.14,
        0.05,
        nth([0xa86a50, 0x5a6a7a, 0x8a7a5a], v),
        { at: [x, 0.72, -0.45] },
        12,
      );
      b.cylinder(0.02, 0.02, 0.7, DARK, { at: [x, 0.35, -0.45] }, 6);
    }
    mug(b, -0.3, 1.025, 0.1, v);
    b.box(0.3, 0.012, 0.22, 0xc9ccd2, { at: [0.25, 1.03, 0.05] }, 0);
  },
  [{ at: [0.2, 0.55], yaw: Math.PI, pose: 'chatting' }],
);

const serverRack = looks([1, 1], 3, (b, v) => {
  rack(b, 0, 1.2 + v * 0.3, v);
  if (v === 0) b.box(0.3, 0.06, 0.3, CARDBOARD, { at: [0, 1.29, 0] }, 0.01);
  // A cable spool beside the short one.
  if (v === 1) b.torus(0.12, 0.05, 0x3f6a9a, { at: [0.3, 0.17, 0.35], rot: [0, 0.5, 0] });
});

const miniRamp = looks([2, 1], 2, (b, v) => {
  const ramp = nth([0x8a7a6a, 0x6a7a8a], v);
  for (const s of [-1, 1])
    b.box(0.6, 0.06, 0.8, ramp, { at: [s * 0.55, 0.22, 0], rot: [0, 0, s * 0.55] }, 0.01);
  b.box(0.5, 0.05, 0.8, ramp, { at: [0, 0.03, 0] }, 0);
  b.box(0.6, 0.03, 0.18, nth([0x4a3a5a, 0x5a4a3a], v), { at: [0.1, 0.07, 0.15] }, 0);
  for (const x of [-0.12, 0.32])
    b.cylinder(0.03, 0.03, 0.18, 0xe8e4da, { at: [x, 0.04, 0.15], rot: [Math.PI / 2, 0, 0] }, 8);
});

// ---- Scale-up and Enterprise ----

const teamDesk = looks(
  [2, 2],
  8,
  (b, v) => {
    b.box(2, 0.02, 1.8, nth([0x3d4a5a, 0x4a4a52, 0x3d5250], v), { at: [0, 0.01, 0] }, 0);
    desk(b, v);
    plantPot(b, 0.75, -0.6, 0.6, v + 2);
  },
  [{ at: [0, 0.25], yaw: Math.PI, pose: 'typing' }],
);

const meetingPod = looks(
  [2, 2],
  3,
  (b, v) => {
    const panel = nth([0x8fa3b3, 0x8a8a9a, 0x9aa89a], v);
    b.box(1.8, 0.04, 1.8, nth([0x5c6b7a, 0x6a5c5a, 0x5a6a62], v), { at: [0, 0.02, 0] }, 0);
    if (v === 1) b.box(1.0, 0.05, 0.6, WOOD_LIGHT, { at: [0, 0.55, 0] }, 0.02);
    else b.cylinder(0.45, 0.45, 0.05, 0xe8dcc4, { at: [0, 0.55, 0] }, 24);
    b.cylinder(0.05, 0.05, 0.5, DARK, { at: [0, 0.28, 0] }, 8);
    for (const x of [-0.85, 0.85]) b.box(0.05, 1.3, 1.7, panel, { at: [x, 0.65, 0] }, 0);
    b.pane(1.7, 1.2, 0.04, 0xd6f0fa, { at: [0, 0.65, -0.85] });
    b.box(1.75, 0.05, 1.75, panel, { at: [0, 1.32, 0] }, 0.02);
    if (v === 2) plantPot(b, 0.6, -0.6, 0.5, 3);
    if (v === 0) b.screen(0.6, 0.35, 0x7ab8ff, { at: [0, 0.9, -0.82] });
  },
  [
    { at: [-0.5, 0.1], yaw: Math.PI / 2, pose: 'chatting' },
    { at: [0.5, -0.1], yaw: -Math.PI / 2, pose: 'chatting' },
  ],
);

/** A wall of screens: bar charts, a line graph, a map of the servers, a deploy board. */
const screenWall = looks([2, 1], 4, (b, v) => {
  b.box(1.9, 1.3, 0.12, INK, { at: [0, 1.0, 0] }, 0.03);
  for (const x of [-0.6, 0.6]) b.box(0.08, 0.4, 0.08, DARK, { at: [x, 0.2, 0] }, 0);
  for (let i = 0; i < 4; i++) {
    const x = -0.47 + (i % 2) * 0.94;
    const y = 0.72 + Math.floor(i / 2) * 0.58;
    b.screen(0.88, 0.52, 0x1d3a5a, { at: [x, y, 0.065] });
    const kind = (i + v) % 4;
    if (kind === 0) {
      for (let k = 0; k < 5; k++) {
        const h = 0.08 + ((i * 5 + k * 3 + v) % 7) * 0.05;
        b.screen(0.08, h, i === 2 ? 0xffc04a : 0x5cf0a8, {
          at: [x - 0.3 + k * 0.15, y - 0.2 + h / 2, 0.067],
        });
      }
    } else if (kind === 1) {
      for (let k = 0; k < 6; k++) {
        const a = Math.sin(k * 1.3 + v) * 0.08;
        b.screen(0.14, 0.02, 0x7ab8ff, {
          at: [x - 0.32 + k * 0.13, y + a, 0.067],
          rot: [0, 0, Math.cos(k * 1.3 + v) * 0.5],
        });
      }
    } else if (kind === 2) {
      for (let k = 0; k < 9; k++)
        b.screen(0.04, 0.04, k % 4 === 0 ? 0xff7a6a : 0x5cf0a8, {
          at: [x - 0.3 + ((k * 37) % 60) / 100, y - 0.15 + ((k * 23) % 30) / 100, 0.067],
        });
    } else {
      for (let k = 0; k < 4; k++)
        b.screen(0.7, 0.06, k === 1 ? 0xffc04a : 0x5cf0a8, { at: [x, y + 0.16 - k * 0.11, 0.067] });
    }
  }
});

const sofa = looks([2, 1], 4, (b, v) => {
  const fabric = nth([0x6a7466, 0x6a5a6a, 0x5a6a7a, 0x8a7a64], v);
  b.box(1.6, 0.35, 0.7, fabric, { at: [0, 0.25, 0] }, 0.08);
  b.box(1.6, 0.45, 0.2, tint(fabric, -0.15), { at: [0, 0.55, -0.28] }, 0.08);
  for (const x of [-0.78, 0.78])
    b.box(0.18, 0.5, 0.7, tint(fabric, -0.1), { at: [x, 0.35, 0] }, 0.08);
  // Cushions, or a laptop left on the seat.
  if (v % 2 === 0)
    b.box(0.3, 0.2, 0.08, 0xb89a7a, { at: [-0.4, 0.55, -0.12], rot: [-0.3, 0, 0] }, 0.05);
  else b.box(0.3, 0.02, 0.2, 0xc9ccd2, { at: [0.3, 0.44, 0.05] }, 0);
  if (v === 2)
    b.box(0.28, 0.2, 0.08, 0xd8c8a8, { at: [0.45, 0.55, -0.12], rot: [-0.3, 0, 0] }, 0.05);
});

const cubicle = looks(
  [2, 2],
  6,
  (b, v) => {
    const panel = nth([0x9aa3ad, 0x9a9488, 0x8a9aa0], v);
    b.box(1.8, 1.1, 0.06, panel, { at: [0, 0.55, -0.85] }, 0.02);
    b.box(0.06, 1.1, 1.7, panel, { at: [v % 2 ? 0.88 : -0.88, 0.55, 0] }, 0.02);
    b.box(1.8, 0.05, 0.07, tint(panel, -0.3), { at: [0, 1.12, -0.85] }, 0);
    desk(b, v + 1, [0xd8ccb0, 0xc8c0b0, 0xe0d8c8]);
    // A family photo, a stress ball, a calendar pinned up.
    b.box(0.12, 0.15, 0.02, 0x8c5f3d, { at: [0.4, 0.6, -0.3] }, 0);
    if (v % 3 === 0) b.sphere(0.04, 0x8a5a5a, { at: [-0.4, 0.56, -0.05] });
    if (v % 3 === 1) b.box(0.25, 0.3, 0.01, WHITE, { at: [-0.5, 0.95, -0.81] }, 0);
    if (v % 3 === 2) b.box(0.12, 0.12, 0.01, 0xffe066, { at: [0.6, 0.9, -0.81] }, 0);
  },
  [{ at: [0, 0.25], yaw: Math.PI, pose: 'typing' }],
);

const waterCooler = looks(
  [2, 1],
  2,
  (b, v) => {
    b.box(0.36, 0.9, 0.36, nth([0xe8ecef, 0x8a929c], v), { at: [0, 0.45, 0] }, 0.04);
    b.pane(0.3, 0.42, 0.3, 0x8fd3ff, { at: [0, 1.11, 0] });
    b.box(0.06, 0.05, 0.05, 0x3f86c8, { at: [-0.06, 0.7, 0.19] }, 0);
    b.box(0.06, 0.05, 0.05, 0xe0402f, { at: [0.06, 0.7, 0.19] }, 0);
    if (v === 1) b.cylinder(0.12, 0.1, 0.3, 0x5a6470, { at: [0.45, 0.15, 0] }, 12);
  },
  [
    { at: [-0.65, 0.35], yaw: 1.9, pose: 'chatting' },
    { at: [0.65, 0.4], yaw: -1.9, pose: 'chatting' },
  ],
);

const printer = looks([1, 1], 3, (b, v) => {
  if (v === 2) {
    // The big copier.
    b.box(0.8, 0.85, 0.6, 0xd8dde2, { at: [0, 0.43, 0] }, 0.04);
    b.box(0.7, 0.08, 0.5, 0xc0c6cc, { at: [0, 0.9, 0] }, 0.02);
    b.box(0.3, 0.02, 0.2, WHITE, { at: [0.45, 0.6, 0.1] }, 0);
    b.screen(0.15, 0.08, 0x7ab8ff, { at: [0.25, 0.9, 0.26], rot: [-0.6, 0, 0] });
    return;
  }
  b.box(0.7, 0.55, 0.55, v ? 0x5a6470 : 0xd8dde2, { at: [0, 0.28, 0] }, 0.04);
  b.box(0.6, 0.18, 0.45, v ? 0x4a5262 : 0xc0c6cc, { at: [0, 0.64, -0.03] }, 0.03);
  b.box(0.4, 0.02, 0.3, WHITE, { at: [0, 0.57, 0.22], rot: [0.2, 0, 0] }, 0);
  b.led(0.025, 0x5cf08a, { at: [0.25, 0.68, 0.2] });
  b.led(0.025, 0xffc04a, { at: [0.18, 0.68, 0.2] });
});

const cabinets = looks([1, 1], 4, (b, v) => {
  const metal = nth([0x8a929c, 0x9a9488, 0x6a7280, 0xa0a8b0], v);
  const drawers = 2 + (v % 2);
  for (const x of [-0.22, 0.22]) {
    b.box(0.4, 1.0, 0.5, metal, { at: [x, 0.5, 0] }, 0.02);
    for (let d = 0; d < drawers; d++) {
      b.box(0.12, 0.03, 0.02, 0xd8dde2, { at: [x, 0.2 + d * (0.8 / drawers) + 0.1, 0.26] }, 0);
    }
  }
  if (v === 0 || v === 3) plantPot(b, 0.22, 0, 0.5, v);
  else mug(b, 0.22, 1.0, 0.05, v);
  if (v === 2) books(b, -0.38, 1.0, 0, 5, v);
  else b.box(0.3, 0.02, 0.2, WHITE, { at: [-0.22, 1.01, 0] }, 0);
});

const lobbySign = looks([3, 1], 1, (b) => {
  b.box(2.6, 0.9, 0.5, 0x3a3f4a, { at: [0, 0.45, 0] }, 0.05);
  b.box(2.7, 0.06, 0.6, 0xc8b88a, { at: [0, 0.93, 0] }, 0.02);
  // The corporate logo: a big glowing ring.
  b.torus(0.2, 0.05, 0x7ab8ff, { at: [-0.9, 0.5, 0.26] });
  for (let i = 0; i < 6; i++)
    b.screen(0.18, 0.12, 0xd6e8ff, { at: [-0.45 + i * 0.25, 0.5, 0.255] });
  plantPot(b, 1.15, 0.1, 0.7);
});

const vending = looks([1, 1], 2, (b, v) => {
  b.box(0.75, 1.6, 0.6, nth([0x6a4a5a, 0x3a5a6a], v), { at: [0, 0.8, 0] }, 0.04);
  b.screen(0.48, 1.05, 0xe8f0ff, { at: [-0.08, 0.95, 0.305] });
  for (let s = 0; s < 5; s++)
    for (let i = 0; i < 4; i++)
      b.box(
        0.08,
        0.12,
        0.05,
        nth([0xe0a050, 0x8ac87a, 0xd07a6a, 0xc8a0e0, 0x8ab0e0], s * 2 + i + v),
        {
          at: [-0.26 + i * 0.12, 0.55 + s * 0.2, 0.26],
        },
        0,
      );
  b.box(0.14, 0.3, 0.02, INK, { at: [0.27, 1.0, 0.31] }, 0);
  b.box(0.5, 0.12, 0.02, INK, { at: [-0.08, 0.25, 0.31] }, 0);
});

const coatRack = looks([1, 1], 2, (b, v) => {
  b.cylinder(0.2, 0.22, 0.04, DARK, { at: [0, 0.02, 0] }, 14);
  b.cylinder(0.025, 0.025, 1.6, WOOD_DARK, { at: [0, 0.8, 0] }, 8);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    b.box(
      0.16,
      0.02,
      0.02,
      WOOD_DARK,
      { at: [Math.cos(a) * 0.07, 1.55, Math.sin(a) * 0.07], rot: [0, -a, 0.4] },
      0,
    );
  }
  b.box(
    0.32,
    0.6,
    0.14,
    nth([0x5a4a48, 0x4a5262], v),
    { at: [0.1, 1.2, 0.08], rot: [0, 0.3, 0] },
    0.05,
  );
  if (v === 1) b.sphere(0.1, 0x8a6a4a, { at: [-0.1, 1.62, 0] }, [1.2, 0.6, 1.2]);
  else b.box(0.12, 0.4, 0.03, 0x8a3a3a, { at: [-0.12, 1.3, 0.05] }, 0);
});

const shredder = looks([1, 1], 2, (b, v) => {
  b.box(0.45, 0.6, 0.35, 0x4a5262, { at: [-0.15, 0.3, 0] }, 0.03);
  b.box(0.45, 0.08, 0.35, 0x2b2f38, { at: [-0.15, 0.64, 0] }, 0.02);
  b.led(0.02, 0x5cf08a, { at: [-0.0, 0.66, 0.18] });
  b.cylinder(0.15, 0.12, 0.42, nth([0x5a6470, 0x6a7a6a], v), { at: [0.25, 0.21, 0.15] }, 12);
  for (let i = 0; i < 3; i++)
    b.box(
      0.16,
      0.012,
      0.12,
      WHITE,
      { at: [0.22 + i * 0.03, 0.43 + i * 0.012, 0.15], rot: [0, i, 0.2] },
      0,
    );
});

const lockers = looks([2, 1], 2, (b, v) => {
  const metal = nth([0x6a7a8a, 0x8a8a7a], v);
  for (let i = 0; i < 4; i++) {
    const x = -0.6 + i * 0.4;
    b.box(0.38, 1.6, 0.45, metal, { at: [x, 0.8, 0] }, 0.02);
    for (let k = 0; k < 3; k++)
      b.box(0.2, 0.015, 0.01, tint(metal, -0.3), { at: [x, 1.3 + k * 0.05, 0.23] }, 0);
    b.box(0.03, 0.12, 0.02, 0xd8dde2, { at: [x + 0.12, 0.85, 0.23] }, 0);
  }
  if (v === 1) b.box(0.4, 0.3, 0.35, CARDBOARD, { at: [-0.2, 1.75, 0] }, 0.02);
});

const kitchenIsland = looks(
  [2, 1],
  2,
  (b, v) => {
    b.box(1.6, 0.85, 0.6, nth([0x4a5262, 0xb8b4aa], v), { at: [0, 0.43, 0] }, 0.03);
    b.box(1.7, 0.05, 0.7, nth([0xe8e4da, 0x5a5a58], v), { at: [0, 0.88, 0] }, 0.02);
    b.cylinder(0.16, 0.12, 0.08, WHITE, { at: [-0.4, 0.95, 0] }, 14);
    for (const [x, z, c] of [
      [-0.45, 0.04, 0xd8a050],
      [-0.36, -0.05, 0x8ab85a],
      [-0.4, 0.02, 0xd0704a],
    ] as const)
      b.sphere(0.05, c, { at: [x, 1.0, z] });
    mug(b, 0.2, 0.9, 0.1, v);
    mug(b, 0.4, 0.9, -0.05, v + 1);
  },
  [{ at: [0.3, 0.65], yaw: Math.PI, pose: 'chatting' }],
);

const phoneBooth = looks([1, 1], 3, (b, v) => {
  const shell = nth([0x5a6a7a, 0x7a6a5a, 0x4a5a52], v);
  b.box(0.85, 1.9, 0.85, shell, { at: [0, 0.95, -0.02] }, 0.04);
  b.pane(0.7, 1.5, 0.02, 0xd6f0fa, { at: [0, 0.95, 0.42] });
  b.box(0.75, 1.6, 0.78, tint(shell, -0.4), { at: [0, 0.95, 0.0] }, 0);
  b.box(0.4, 0.04, 0.25, WOOD_LIGHT, { at: [0, 0.95, -0.2] }, 0.01);
  b.led(0.04, v === 1 ? 0xff7a6a : 0x5cf08a, { at: [0.3, 1.82, 0.43] });
});

// ---- Big Tech: a campus with lawns ----

const picnicTable = looks(
  [2, 2],
  4,
  (b, v) => {
    const wood = nth([WOOD, WOOD_LIGHT, 0x8a8a7a, WOOD_DARK], v);
    b.box(1.4, 0.06, 0.7, wood, { at: [0, 0.62, 0] }, 0.02);
    for (const z of [-0.6, 0.6]) b.box(1.4, 0.05, 0.25, wood, { at: [0, 0.38, z] }, 0.02);
    for (const x of [-0.55, 0.55]) {
      b.box(0.06, 0.62, 0.06, DARK, { at: [x, 0.31, 0] }, 0);
      b.box(0.06, 0.06, 1.4, DARK, { at: [x, 0.3, 0] }, 0);
    }
    // Lunch: laptops open, of course.
    b.box(0.3, 0.02, 0.22, 0x8a929c, { at: [-0.3, 0.66, -0.12] }, 0);
    b.screen(0.28, 0.18, nth(SCREENS, v), { at: [-0.3, 0.76, -0.22], rot: [-0.3, 0, 0] });
    mug(b, 0.35, 0.65, 0.1, v);
    if (v % 2 === 1) {
      // A parasol.
      b.cylinder(0.02, 0.02, 1.4, STEEL, { at: [0.05, 1.0, 0] }, 6);
      b.cone(0.85, 0.3, nth([0xd8c8a8, 0x8aa0a0], v), { at: [0.05, 1.75, 0] }, 10);
    }
  },
  [
    { at: [-0.4, 0.85], yaw: Math.PI, pose: 'chatting' },
    { at: [0.4, -0.85], yaw: 0, pose: 'typing' },
  ],
);

const bikeRack = looks([2, 1], 4, (b, v) => {
  b.box(1.8, 0.05, 0.08, STEEL, { at: [0, 0.35, 0.3] }, 0);
  // Campus bikes in muted colors, nothing in a player's color; some slots empty.
  for (let i = 0; i < 3; i++) {
    if ((i + v) % 4 === 3) continue;
    const frame = nth(FRAMES, i + v * 2);
    const x = -0.6 + i * 0.6;
    for (const z of [-0.28, 0.28]) {
      b.torus(0.17, 0.022, INK, { at: [x, 0.19, z], rot: [0, Math.PI / 2, 0] });
    }
    b.box(0.03, 0.03, 0.56, frame, { at: [x, 0.3, 0], rot: [0.3, 0, 0] }, 0);
    b.box(0.03, 0.24, 0.03, frame, { at: [x, 0.33, 0.1] }, 0);
    b.box(0.3, 0.025, 0.025, STEEL, { at: [x, 0.46, -0.24] }, 0);
  }
});

const foodTruck = looks(
  [3, 2],
  3,
  (b, v) => {
    const body = nth([0xe8dcc4, 0x8aa0a0, 0xc8b8d0], v);
    const trim = nth([0xd0704a, 0x3a5a6a, 0x7a5a8c], v);
    b.box(2.4, 1.3, 1.1, body, { at: [0, 0.85, 0] }, 0.08);
    b.box(2.42, 0.25, 1.12, trim, { at: [0, 0.35, 0] }, 0.04);
    b.box(0.7, 0.9, 1.0, body, { at: [1.45, 0.65, 0] }, 0.08);
    b.screen(0.5, 0.35, 0x9fc4d8, { at: [1.81, 0.85, 0], rot: [0, Math.PI / 2, 0] });
    // The serving hatch, lit, with its awning, and what it sells on the roof.
    b.screen(1.2, 0.45, 0xffe2a8, { at: [-0.2, 1.05, 0.56] });
    b.box(1.4, 0.04, 0.4, trim, { at: [-0.2, 1.45, 0.72], rot: [0.35, 0, 0] }, 0);
    b.box(1.2, 0.05, 0.2, 0x8a929c, { at: [-0.2, 0.8, 0.65] }, 0);
    if (v === 0) {
      b.cylinder(0.22, 0.18, 0.35, WHITE, { at: [-0.4, 1.7, 0] }, 14);
      b.cylinder(0.21, 0.21, 0.03, 0x7a5236, { at: [-0.4, 1.86, 0] }, 14);
    } else if (v === 1) {
      b.cone(0.25, 0.5, 0xe8c070, { at: [-0.4, 1.78, 0], rot: [Math.PI, 0, 0] }, 12);
      b.sphere(0.22, 0xf0d0e0, { at: [-0.4, 2.05, 0] });
    } else {
      b.box(0.6, 0.25, 0.3, 0xd8a050, { at: [-0.4, 1.65, 0] }, 0.1);
      b.box(0.62, 0.05, 0.32, 0x6a8a4a, { at: [-0.4, 1.65, 0] }, 0);
    }
    for (const [x, z] of [
      [-0.8, -0.56],
      [0.8, -0.56],
      [-0.8, 0.56],
      [0.8, 0.56],
      [1.45, -0.5],
      [1.45, 0.5],
    ] as const) {
      b.cylinder(0.2, 0.2, 0.14, INK, { at: [x, 0.2, z], rot: [Math.PI / 2, 0, 0] });
    }
  },
  [{ at: [-0.2, 1.3], yaw: Math.PI, pose: 'idle' }],
);

const fountain = looks([2, 2], 1, (b) => {
  b.cylinder(0.85, 0.9, 0.3, 0xb8b2a6, { at: [0, 0.15, 0] }, 24);
  b.cylinder(0.75, 0.75, 0.04, 0x5aa8d8, { at: [0, 0.29, 0] }, 24);
  b.cylinder(0.12, 0.16, 0.6, 0xb8b2a6, { at: [0, 0.5, 0] }, 12);
  b.cylinder(0.35, 0.3, 0.08, 0xb8b2a6, { at: [0, 0.82, 0] }, 16);
  b.sphere(0.12, 0x9fd4f0, { at: [0, 0.95, 0] }, [1, 1.6, 1]);
});

/** A big abstract sculpture on the lawn: the company logo, a ring on a plinth. */
const sculpture = looks([2, 2], 1, (b) => {
  b.box(1.0, 0.3, 1.0, 0xb8b2a6, { at: [0, 0.15, 0] }, 0.03);
  b.torus(0.55, 0.12, 0x6a8aa0, { at: [0, 0.95, 0], rot: [0, 0.4, 0] });
  b.sphere(0.18, 0xc8a050, { at: [0, 0.95, 0] });
});

const bench = looks([2, 1], 3, (b, v) => {
  const wood = nth([WOOD, WOOD_LIGHT, 0x8a8a7a], v);
  b.box(1.4, 0.05, 0.4, wood, { at: [0, 0.42, 0] }, 0.01);
  if (v !== 2) b.box(1.4, 0.3, 0.05, wood, { at: [0, 0.65, -0.18], rot: [-0.15, 0, 0] }, 0.01);
  for (const x of [-0.6, 0.6]) b.box(0.06, 0.42, 0.38, DARK, { at: [x, 0.21, 0] }, 0);
  if (v === 1) b.box(0.3, 0.02, 0.22, 0xc9ccd2, { at: [0.3, 0.46, 0.05] }, 0);
});

/** Bins for the campus: compost, recycling, landfill, in muted colors. */
const sortingBins = looks([1, 1], 2, (b, v) => {
  for (let i = 0; i < 3; i++) {
    const c = nth([0x6a7a5a, 0x5a6a7a, 0x5a5a5a], i + v);
    b.cylinder(0.12, 0.1, 0.55, c, { at: [-0.28 + i * 0.28, 0.28, 0] }, 12);
    b.cylinder(0.13, 0.13, 0.04, tint(c, -0.25), { at: [-0.28 + i * 0.28, 0.57, 0] }, 12);
  }
});

/** A charging dock with e-scooters. */
const scooterDock = looks([2, 1], 2, (b, v) => {
  b.box(1.6, 0.06, 0.4, 0x5a6470, { at: [0, 0.03, 0] }, 0.01);
  b.box(0.12, 0.9, 0.12, 0x3a3f4a, { at: [-0.75, 0.45, -0.1] }, 0.02);
  b.screen(0.08, 0.15, 0x5cf08a, { at: [-0.75, 0.7, -0.035] });
  for (let i = 0; i < 3 + v; i++) {
    const x = -0.45 + i * 0.32;
    const paint = nth([0x4f8a80, 0x5a6a7a, 0x8a7a5a], i + v);
    b.box(0.08, 0.03, 0.42, paint, { at: [x, 0.12, 0] }, 0);
    for (const z of [-0.19, 0.19])
      b.cylinder(0.05, 0.05, 0.03, INK, { at: [x, 0.06, z], rot: [0, 0, Math.PI / 2] }, 8);
    b.box(0.025, 0.55, 0.025, STEEL, { at: [x, 0.38, 0.18], rot: [-0.1, 0, 0] }, 0);
    b.box(0.18, 0.02, 0.02, INK, { at: [x, 0.65, 0.2] }, 0);
  }
});

/** A delivery drone resting on its pad, or a lawn robot out mowing. */
const dronePad = looks([1, 1], 2, (b, v) => {
  if (v === 1) {
    b.box(0.5, 0.15, 0.4, 0xe8e4da, { at: [0, 0.12, 0] }, 0.06);
    b.box(0.3, 0.04, 0.25, 0x3a3f4a, { at: [0, 0.21, 0] }, 0.02);
    for (const x of [-0.24, 0.24])
      for (const z of [-0.14, 0.14])
        b.cylinder(0.07, 0.07, 0.05, INK, { at: [x, 0.07, z], rot: [0, 0, Math.PI / 2] }, 10);
    b.led(0.025, 0x5cf08a, { at: [0.15, 0.24, 0.1] });
    return;
  }
  b.cylinder(0.42, 0.42, 0.04, 0x4a505c, { at: [0, 0.02, 0] }, 20);
  b.box(0.3, 0.01, 0.06, 0xd8c070, { at: [0, 0.045, 0] }, 0);
  b.box(0.06, 0.01, 0.3, 0xd8c070, { at: [0, 0.045, 0] }, 0);
  b.box(0.22, 0.1, 0.22, WHITE, { at: [0, 0.2, 0] }, 0.03);
  b.box(0.16, 0.12, 0.16, CARDBOARD, { at: [0, 0.08, 0] }, 0.01);
  for (const a of [0.785, 2.356, 3.927, 5.498]) {
    b.box(
      0.22,
      0.02,
      0.03,
      DARK,
      { at: [Math.cos(a) * 0.12, 0.22, Math.sin(a) * 0.12], rot: [0, -a, 0] },
      0,
    );
    b.cylinder(
      0.08,
      0.08,
      0.01,
      0x8a929c,
      { at: [Math.cos(a) * 0.22, 0.25, Math.sin(a) * 0.22] },
      12,
    );
  }
  b.led(0.02, 0x7ab8ff, { at: [0, 0.26, 0.1] });
});

/** Solar panels on a frame, tilted to the sky. */
const solarPanels = looks([2, 1], 2, (b, v) => {
  const n = 2 + v;
  for (let i = 0; i < n; i++) {
    const x = -0.8 + 0.4 / n + i * (1.6 / n);
    b.box(1.6 / n - 0.05, 0.03, 0.7, 0x2b3a5a, { at: [x, 0.5, 0], rot: [-0.5, 0, 0] }, 0);
    for (let k = 1; k < 3; k++)
      b.box(
        1.6 / n - 0.05,
        0.035,
        0.012,
        0x8aa0c0,
        { at: [x, 0.5 + (k - 1.5) * 0.11, (k - 1.5) * -0.2], rot: [-0.5, 0, 0] },
        0,
      );
  }
  for (const x of [-0.7, 0.7]) {
    b.box(0.04, 0.6, 0.04, STEEL, { at: [x, 0.3, -0.25] }, 0);
    b.box(0.04, 0.3, 0.04, STEEL, { at: [x, 0.15, 0.25] }, 0);
  }
});

const lampPost = looks([1, 1], 2, (b, v) => {
  b.cylinder(0.08, 0.1, 0.1, DARK, { at: [0, 0.05, 0] }, 10);
  b.cylinder(0.03, 0.035, 2.0, DARK, { at: [0, 1.0, 0] }, 8);
  if (v === 0) {
    b.sphere(0.13, 0xfff0d0, { at: [0, 2.1, 0] });
  } else {
    b.box(0.5, 0.03, 0.04, DARK, { at: [0.2, 1.95, 0] }, 0);
    b.box(0.2, 0.06, 0.14, DARK, { at: [0.4, 1.93, 0] }, 0.01);
    b.screen(0.16, 0.1, 0xfff0d0, { at: [0.4, 1.9, 0], rot: [Math.PI / 2, 0, 0] });
  }
});

/** The shuttle stop: a glass shelter with a bench and a timetable screen. */
const shuttleStop = looks([3, 1], 2, (b, v) => {
  b.box(2.4, 0.06, 0.9, 0x8a8a84, { at: [0, 0.03, 0] }, 0);
  b.box(2.5, 0.06, 1.0, nth([0x3a3f4a, 0x5a6a62], v), { at: [0, 1.65, 0] }, 0.02);
  for (const x of [-1.15, 1.15]) b.box(0.05, 1.6, 0.05, DARK, { at: [x, 0.82, -0.35] }, 0);
  b.pane(2.3, 1.4, 0.03, 0xd6f0fa, { at: [0, 0.85, -0.4] });
  b.box(1.4, 0.05, 0.3, WOOD, { at: [0, 0.45, -0.2] }, 0.01);
  b.box(0.5, 0.7, 0.05, INK, { at: [0.9, 0.9, -0.36] }, 0.01);
  b.screen(0.42, 0.6, 0x7ab8ff, { at: [0.9, 0.9, -0.33] });
});

/**
 * What a chapter's world is made of, the ground it stands on (darker than
 * the office floor, so the eye stays inside), and what fills its rows.
 */
export interface Setting {
  ground: number;
  /** A strip along the left of the level (a driveway, an aisle), or none. */
  path: number | null;
  /** Props near the office walls, and further out. */
  near: readonly SetPiece[];
  far: readonly SetPiece[];
  /** Props that show once per level (the car, the cat), at the start of a far row. */
  rare: readonly SetPiece[];
  /** How many background people walk a loop. */
  walkers: number;
}

export const SETTINGS: Readonly<Record<string, Setting>> = {
  garage: {
    ground: 0x3e5a35,
    path: 0x3a3e46,
    near: [shelves, bike, drums, workbench, bins, tires, oldPCs],
    far: [tree, bushes, shed, fencePanel, kennel],
    rare: [car, cat, hoop],
    walkers: 0,
  },
  startup: {
    // Polished concrete: apart from the wood walls and the slab's edge.
    ground: 0x3a3f47,
    path: null,
    near: [bigPlant, coffeeBar, arcade, beanbags, standingDesk, bookshelf, whiteboardStand, fridge],
    far: [pingPong, sofa, foosball, highTable, serverRack, miniRamp],
    rare: [neonSign],
    walkers: 1,
  },
  'scale-up': {
    ground: 0x485666,
    path: 0x3f4b5a,
    near: [teamDesk, sofa, screenWall, standingDesk, whiteboardStand, bookshelf, bigPlant],
    far: [meetingPod, bigPlant, kitchenIsland, phoneBooth, serverRack, lockers],
    rare: [],
    walkers: 2,
  },
  enterprise: {
    ground: 0x6b6253,
    path: 0x5a5245,
    near: [cubicle, printer, cabinets, waterCooler, vending, coatRack, shredder],
    far: [meetingPod, bigPlant, bookshelf, lockers, serverRack, phoneBooth],
    rare: [lobbySign],
    walkers: 2,
  },
  'big-tech': {
    // Lawns round the campus, with a paved path.
    ground: 0x41663a,
    path: 0x5a5e66,
    near: [picnicTable, bikeRack, bigPlant, bench, sortingBins, scooterDock, dronePad, lampPost],
    far: [tree, foodTruck, bushes, solarPanels, shuttleStop],
    rare: [fountain, sculpture],
    walkers: 3,
  },
};

// ---- On the office's own walls ----

/** One small thing on top of a wall, from the hash's spread. */
function wallTop(build: (b: ModelBuilder) => void): () => Model {
  return () => {
    const b = new ModelBuilder();
    build(b);
    return b.build();
  };
}

/**
 * Things on top of full-height walls, picked per wall by a hash (and never
 * the same as a wall close by): plants in five kinds and pots, book piles,
 * mugs, a rubber duck, a little robot, an old monitor, a lava lamp, a
 * trophy, a globe, a desk fan, a coffee maker, a router.
 */
export const WALL_TOP_PROPS: readonly (() => Model)[] = [
  wallTop((b) => plantPot(b, 0, 0, 0.55, 0)),
  wallTop((b) => {
    books(b, -0.16, 0, 0, 5, 0);
  }),
  wallTop((b) => mug(plantPot(b, 0, 0, 0.4, 5), 0.2, 0, 0.05, 0)),
  wallTop((b) => plantPot(b, 0, 0, 0.5, 1)),
  wallTop((b) => plantPot(b, 0, 0, 0.5, 7)),
  wallTop((b) => plantPot(b, 0, 0, 0.45, 9)),
  wallTop((b) => {
    // A pile of books lying flat, a mug on top.
    for (let i = 0; i < 4; i++)
      b.box(
        0.24 - i * 0.02,
        0.045,
        0.17,
        nth(SPINES, i + 2),
        { at: [i * 0.01, 0.023 + i * 0.046, 0], rot: [0, i * 0.15, 0] },
        0,
      );
    mug(b, 0.0, 0.18, 0.0, 2);
  }),
  wallTop((b) => {
    // A rubber duck, the debugging kind.
    b.sphere(0.08, 0xf2c94c, { at: [0, 0.06, 0] }, [1.2, 0.8, 1]);
    b.sphere(0.05, 0xf2c94c, { at: [0.04, 0.14, 0] });
    b.box(0.05, 0.015, 0.04, 0xe08a3a, { at: [0.09, 0.135, 0] }, 0);
    mug(b, -0.16, 0, 0.04, 1);
  }),
  wallTop((b) => {
    // A little robot figurine.
    b.box(0.1, 0.12, 0.08, 0x9aa3ad, { at: [0, 0.1, 0] }, 0.02);
    b.box(0.08, 0.07, 0.07, 0xb8c0c8, { at: [0, 0.2, 0] }, 0.02);
    b.led(0.012, 0x7cf0c8, { at: [-0.02, 0.21, 0.036] });
    b.led(0.012, 0x7cf0c8, { at: [0.02, 0.21, 0.036] });
    for (const x of [-0.03, 0.03]) b.box(0.03, 0.05, 0.04, 0x6a7280, { at: [x, 0.025, 0] }, 0);
    b.cylinder(0.004, 0.004, 0.05, STEEL, { at: [0, 0.26, 0] }, 4);
  }),
  wallTop((b) => {
    // A beige CRT, still on.
    b.box(0.3, 0.24, 0.26, 0xd8d0b8, { at: [0, 0.12, 0] }, 0.03);
    b.screen(0.22, 0.16, 0x3a8a6a, { at: [0, 0.13, 0.131] });
  }),
  wallTop((b) => {
    // A lava lamp.
    b.cone(0.07, 0.08, STEEL, { at: [0, 0.04, 0] }, 12);
    b.cylinder(0.035, 0.055, 0.2, 0x5a3a6a, { at: [0, 0.18, 0] }, 12);
    b.led(0.025, 0xff7ab0, { at: [0, 0.15, 0] });
    b.led(0.018, 0xff7ab0, { at: [0, 0.22, 0] });
    b.cone(0.035, 0.04, STEEL, { at: [0, 0.3, 0], rot: [Math.PI, 0, 0] }, 12);
  }),
  wallTop((b) => {
    // A trophy, for the hackathon nobody remembers.
    b.box(0.12, 0.05, 0.12, WOOD_DARK, { at: [0, 0.025, 0] }, 0.01);
    b.cylinder(0.015, 0.02, 0.08, 0xc8a050, { at: [0, 0.09, 0] }, 8);
    b.cylinder(0.07, 0.03, 0.1, 0xc8a050, { at: [0, 0.18, 0] }, 12);
  }),
  wallTop((b) => {
    // A globe.
    b.cylinder(0.05, 0.06, 0.02, WOOD_DARK, { at: [0, 0.01, 0] }, 10);
    b.cylinder(0.008, 0.008, 0.08, STEEL, { at: [0, 0.05, 0] }, 4);
    b.sphere(0.09, 0x5a8aa0, { at: [0, 0.17, 0] });
    b.sphere(0.05, 0x7aa86a, { at: [0.04, 0.2, 0.05] }, [1, 0.6, 0.6]);
  }),
  wallTop((b) => {
    // A coffee maker and its pot.
    b.box(0.16, 0.24, 0.16, 0x2b2f38, { at: [0, 0.12, 0] }, 0.02);
    b.cylinder(0.05, 0.06, 0.1, 0x8fb0c0, { at: [0, 0.06, 0.06] }, 10);
    b.led(0.012, 0xff7a4a, { at: [0.05, 0.2, 0.082] });
  }),
  wallTop((b) => {
    // A Wi-Fi router with its antennas.
    b.box(0.24, 0.04, 0.16, 0xe8e4da, { at: [0, 0.02, 0] }, 0.01);
    for (const x of [-0.09, 0, 0.09])
      b.box(0.015, 0.14, 0.015, DARK, { at: [x, 0.1, -0.07], rot: [0, 0, x * 2] }, 0);
    for (let i = 0; i < 4; i++) b.led(0.008, 0x5cf08a, { at: [-0.06 + i * 0.04, 0.03, 0.081] });
  }),
];
