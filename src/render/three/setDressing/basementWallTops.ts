import { type Model, ModelBuilder } from '../kit';
import { lettering } from './businessPark';

/**
 * On the basement's walls (On Call): what stands on top of them in stacked
 * clusters, and what lies on the low front wall. The server room's kit and
 * the night's firefight in muted colours, nothing in a station's or a
 * player's colour and nothing to eat (one small can pyramid excepted):
 * cable reels, spare drives, patch cables in loops, a rack-mount UPS, a
 * hard hat on a box of zip ties, Demo Day's lanyards. Plus the one-offs on
 * the server room's walls: Segfault asleep on the warmest server and the
 * rack with YOTTA's violet sticker.
 */

/** A thing built at desk size and grown by `scale`, so it reads from the couch. */
function prop(build: (b: ModelBuilder) => void, scale = 1): () => Model {
  return () => {
    const b = new ModelBuilder();
    build(b);
    const model = b.build();
    for (const g of [model.body, model.glow, model.glass]) g?.scale(scale, scale, scale);
    return model;
  };
}

const BLACK = 0x1d1f23;
const RACK = 0x25282d;
const SERVER = 0x33373e;
const GALV = 0x8c9399;
const KRAFT = 0xa08a6a;
const PAPER = 0xd8d6cc;
const INK = 0x2a2c30;
/** YOTTA's violet, printed (muted), and as a sticker. */
const VIOLET = 0x6a5a9a;
const STICKER = 0x6c48c0;
/** Patch cable colours, dulled: grey, yellow, slate blue, faded red, green. */
const PATCH = [0x7a7e84, 0xb89a3a, 0x5a6c82, 0x8a4a44, 0x4e7a56] as const;
const LED_BLUE = 0x1f6fc8;
const LED_GREEN = 0x2ab060;
const LED_AMBER = 0xc07818;

/** A cable reel on its side at (x, y, z): dark cheeks, cable wound on, a plug hanging off. */
function cableReel(
  b: ModelBuilder,
  x: number,
  y: number,
  z: number,
  r: number,
  cable: number,
): void {
  for (const s of [-1, 1])
    b.cylinder(
      r,
      r,
      0.016,
      0x4a4c52,
      { at: [x, y + r, z + s * 0.06], rot: [Math.PI / 2, 0, 0] },
      18,
    );
  b.cylinder(r * 0.8, r * 0.8, 0.11, cable, { at: [x, y + r, z], rot: [Math.PI / 2, 0, 0] }, 18);
  for (let i = 0; i < 3; i++)
    b.torus(r * 0.8, 0.006, 0x2c2d32, { at: [x, y + r, z - 0.035 + i * 0.035] });
  b.cylinder(r * 0.22, r * 0.22, 0.15, GALV, { at: [x, y + r, z], rot: [Math.PI / 2, 0, 0] }, 10);
  b.box(0.04, 0.025, 0.03, 0x3a3c42, { at: [x + r * 0.7, y + r * 1.7, z + 0.07] }, 0.006);
}

/** A coil of patch cable lying flat at (x, y, z). */
function coil(b: ModelBuilder, x: number, y: number, z: number, r: number, color: number): void {
  b.torus(r, 0.01, color, { at: [x, y + 0.01, z], rot: [Math.PI / 2, 0, 0] });
  b.torus(r * 0.86, 0.01, color, {
    at: [x + 0.01, y + 0.025, z - 0.005],
    rot: [Math.PI / 2 - 0.1, 0, 0],
  });
}

/** A rack server, `units` tall, at (x, y, z), its bezel facing +z with LEDs. */
function server(
  b: ModelBuilder,
  x: number,
  y: number,
  z: number,
  [w, d]: readonly [number, number],
  units: number,
  seed: number,
  turn = 0,
): void {
  const h = units * 0.045;
  const at = (dx: number, dy: number, dz: number): [number, number, number] => [
    x + dx * Math.cos(turn) + dz * Math.sin(turn),
    y + dy,
    z - dx * Math.sin(turn) + dz * Math.cos(turn),
  ];
  const rot: [number, number, number] = [0, turn, 0];
  b.box(w, h, d, SERVER, { at: at(0, h / 2, 0), rot }, 0.006);
  b.box(w - 0.02, h - 0.012, 0.006, 0x2a2d32, { at: at(0, h / 2, d / 2 + 0.002), rot }, 0);
  for (let k = 0; k < 5; k++)
    b.box(
      0.04,
      0.006,
      0.004,
      0x15171a,
      { at: at(-w / 2 + 0.1 + k * 0.06, h / 2, d / 2 + 0.006), rot },
      0,
    );
  for (let k = 0; k < units; k++) {
    const col = (seed + k) % 5 === 0 ? LED_AMBER : (seed + k) % 2 ? LED_BLUE : LED_GREEN;
    b.led(0.008, col, { at: at(w / 2 - 0.05, 0.022 + k * 0.045, d / 2 + 0.006) });
    b.led(0.006, LED_GREEN, { at: at(w / 2 - 0.08, 0.022 + k * 0.045, d / 2 + 0.006) });
  }
}

/** A cardboard box `w`×`h`×`d` resting on `y` at (x, z), taped shut, a label on it. */
function box(
  b: ModelBuilder,
  x: number,
  y: number,
  z: number,
  [w, h, d]: readonly [number, number, number],
  turn = 0,
  label?: string,
): void {
  b.box(w, h, d, KRAFT, { at: [x, y + h / 2, z], rot: [0, turn, 0] }, 0.006);
  b.box(w + 0.003, 0.004, 0.04, 0xb8a888, { at: [x, y + h + 0.001, z], rot: [0, turn, 0] }, 0);
  if (label && Math.abs(turn) < 0.3) {
    b.box(w * 0.6, h * 0.36, 0.004, PAPER, { at: [x, y + h * 0.5, z + d / 2 + 0.002] }, 0);
    lettering(
      b,
      label,
      x,
      y + h * 0.5,
      z + d / 2 + 0.004,
      Math.min(0.008, (w * 0.5) / (label.length * 4)),
      INK,
      0.002,
    );
  }
}

/** A spare drive (a 3.5" drive in its caddy) standing on edge at (x, y, z). */
function drive(b: ModelBuilder, x: number, y: number, z: number, turn = 0): void {
  b.box(0.03, 0.1, 0.15, 0x4a4e55, { at: [x, y + 0.05, z], rot: [0, turn, 0] }, 0.004);
  b.box(0.032, 0.02, 0.152, 0x6a2a24, { at: [x, y + 0.09, z], rot: [0, turn, 0] }, 0);
}

/** A closed laptop at height y, `turn`ed, a sticker on its lid. */
function laptop(
  b: ModelBuilder,
  x: number,
  y: number,
  z: number,
  turn: number,
  color: number,
): void {
  b.box(0.32, 0.022, 0.22, color, { at: [x, y + 0.011, z], rot: [0, turn, 0] }, 0.008);
  b.box(
    0.06,
    0.003,
    0.05,
    VIOLET,
    { at: [x - 0.06, y + 0.023, z + 0.03], rot: [0, turn + 0.3, 0] },
    0,
  );
}

/**
 * The wall-top clusters, each one composed pile on one tile
 * (`basementRoom` puts up to four on each long wall, the rest bare): each
 * 2–3 things high with a clear silhouette, inside about 0.85 of a tile.
 */
export const BASEMENT_WALL_TOP_PROPS: readonly (() => Model)[] = [
  prop((b) => {
    // Cable reels: a big one on a box, a smaller one leaning on it, a coil hung over the corner.
    box(b, -0.04, 0, 0, [0.46, 0.12, 0.34], 0.04);
    cableReel(b, -0.08, 0.12, 0, 0.15, 0x1d1e22);
    cableReel(b, 0.2, 0, 0.14, 0.09, 0x6a4a2a);
    coil(b, 0.18, 0.12, -0.08, 0.07, PATCH[0]);
  }, 1.3),
  prop((b) => {
    // Spare drives: an open box of caddies standing in a row, a closed box under, one drive out.
    box(b, 0, 0, 0, [0.44, 0.13, 0.32], -0.06, 'SPARES');
    b.box(0.36, 0.08, 0.26, KRAFT, { at: [-0.02, 0.17, -0.02] }, 0.004);
    b.box(0.32, 0.01, 0.22, 0x5a4a38, { at: [-0.02, 0.212, -0.02] }, 0);
    for (let k = 0; k < 6; k++) drive(b, -0.14 + k * 0.05, 0.14, -0.02, 0);
    drive(b, 0.22, 0.13, 0.1, 1.4);
  }, 1.3),
  prop((b) => {
    // Patch cables in loops: coils piled on a box, one hanging over its edge, a cable tester.
    box(b, -0.02, 0, 0, [0.42, 0.14, 0.32], 0.08);
    coil(b, -0.1, 0.14, -0.02, 0.09, PATCH[1]);
    coil(b, 0.06, 0.16, 0.02, 0.08, PATCH[2]);
    coil(b, -0.04, 0.19, 0.0, 0.07, PATCH[3]);
    b.torus(0.07, 0.009, PATCH[4], { at: [0.2, 0.08, 0.16], rot: [0.2, 0, 0.3] });
    b.box(0.08, 0.03, 0.12, 0xb89a3a, { at: [0.22, 0.155, -0.08], rot: [0, 0.3, 0] }, 0.008);
    b.box(0.05, 0.004, 0.04, 0x2a6a3a, { at: [0.22, 0.172, -0.09], rot: [0, 0.3, 0] }, 0);
  }, 1.3),
  prop((b) => {
    // The rack-mount UPS: a 2U black box with its green LCD, a battery pack, a power strip.
    b.box(0.52, 0.11, 0.34, BLACK, { at: [0, 0.055, 0] }, 0.008);
    b.box(0.5, 0.09, 0.006, 0x2a2d32, { at: [0, 0.055, 0.172] }, 0);
    b.screen(0.08, 0.035, 0x2a8a4a, { at: [-0.14, 0.065, 0.177] });
    for (let k = 0; k < 3; k++)
      b.led(0.007, k === 2 ? LED_AMBER : LED_GREEN, { at: [-0.04 + k * 0.03, 0.065, 0.176] });
    b.box(0.3, 0.12, 0.26, 0x2c2f34, { at: [-0.06, 0.17, -0.02], rot: [0, -0.08, 0] }, 0.008);
    lettering(b, 'UPS', -0.06, 0.17, 0.112, 0.008, 0x9a9ea4, 0.002);
    b.box(0.28, 0.04, 0.06, 0xc8c6bc, { at: [0.14, 0.25, 0.04], rot: [0, 0.3, 0] }, 0.006);
    b.led(0.006, 0xd03020, { at: [0.03, 0.27, 0.06] });
  }, 1.3),
  prop((b) => {
    // A hard hat on a box of zip ties, a torch beside, a few ties spilled.
    box(b, 0, 0, 0, [0.36, 0.14, 0.28], 0.06, 'ZIP TIES');
    b.sphere(0.12, 0xc0a038, { at: [-0.02, 0.15, -0.02] }, [1, 0.7, 1.1]);
    b.cylinder(0.15, 0.15, 0.012, 0xb09030, { at: [-0.02, 0.15, -0.0] }, 20);
    b.cylinder(
      0.025,
      0.025,
      0.16,
      BLACK,
      { at: [0.22, 0.03, 0.1], rot: [0, 0.4, Math.PI / 2] },
      10,
    );
    for (const [x, z, r] of [
      [0.2, -0.12, 0.4],
      [0.24, -0.06, -0.6],
      [-0.2, 0.18, 1.0],
    ] as const)
      b.box(0.1, 0.004, 0.008, 0xe0e0d8, { at: [x, 0.004, z], rot: [0, r, 0] }, 0);
  }, 1.3),
  prop((b) => {
    // Demo Day's lanyards in their box (YOTTA's violet), spilling out, a spare laptop under.
    laptop(b, 0, 0, 0, 0.1, 0x5a5e66);
    laptop(b, 0.01, 0.022, 0.0, -0.08, 0x3a3e45);
    b.box(0.3, 0.14, 0.24, KRAFT, { at: [-0.06, 0.044 + 0.07, -0.02], rot: [0, 0.12, 0] }, 0.006);
    b.box(0.303, 0.03, 0.243, VIOLET, { at: [-0.06, 0.044 + 0.09, -0.02], rot: [0, 0.12, 0] }, 0);
    for (let i = 0; i < 5; i++)
      b.box(
        0.012,
        0.004,
        0.22,
        i % 2 ? VIOLET : 0x8a7ab8,
        {
          at: [0.06 + i * 0.03, 0.19 - (i > 2 ? 0.08 : 0), 0.06 + (i > 2 ? 0.08 : 0)],
          rot: [i > 2 ? 0.9 : 0.1, 0.2 + i * 0.1, 0],
        },
        0,
      );
    b.box(0.07, 0.05, 0.004, PAPER, { at: [0.2, 0.12, 0.17], rot: [-0.6, 0.2, 0] }, 0);
  }, 1.3),
];

/** How tall a cluster on the low front wall may stand, so it never hides a player behind it. */
export const BASEMENT_FRONT_PROP_MAX_HEIGHT = 0.3;

/**
 * Low clusters lying on the low front wall, which the camera looks over
 * (each under `BASEMENT_FRONT_PROP_MAX_HEIGHT`): a coil of patch cable and
 * a crimp tool; a box of spare drives lying low; a cable reel on its side
 * with a few zip ties.
 */
export const BASEMENT_FRONT_WALL_PROPS: readonly (() => Model)[] = [
  prop((b) => {
    coil(b, -0.12, 0, 0, 0.1, PATCH[2]);
    coil(b, 0.1, 0, 0.06, 0.08, PATCH[0]);
    b.box(0.16, 0.025, 0.04, 0xa8302a, { at: [0.12, 0.012, -0.12], rot: [0, 0.5, 0] }, 0.006);
  }, 1.3),
  prop((b) => {
    box(b, -0.04, 0, 0, [0.36, 0.1, 0.24], 0.1, 'SPARES');
    drive(b, 0.22, 0, 0.05, 1.2);
  }, 1.3),
  prop((b) => {
    b.cylinder(0.12, 0.12, 0.08, 0x1d1e22, { at: [-0.06, 0.04, 0] }, 18);
    b.cylinder(0.13, 0.13, 0.012, 0x4a4c52, { at: [-0.06, 0.086, 0] }, 18);
    b.cylinder(0.03, 0.03, 0.09, GALV, { at: [-0.06, 0.05, 0] }, 10);
    for (const [x, z, r] of [
      [0.16, -0.06, 0.5],
      [0.2, 0.04, -0.4],
      [0.14, 0.12, 1.1],
    ] as const)
      b.box(0.1, 0.004, 0.008, 0xe0e0d8, { at: [x, 0.003, z], rot: [0, r, 0] }, 0);
  }, 1.3),
];

/**
 * A flat cluster lying on a low wall of the server room, which the players
 * look over: patch cable coils and a label printer.
 */
export const BASEMENT_INNER_LOW_PROP: () => Model = prop((b) => {
  coil(b, -0.18, 0, -0.04, 0.08, PATCH[1]);
  coil(b, 0.02, 0, 0.08, 0.07, PATCH[3]);
  b.box(0.14, 0.04, 0.1, 0x3a3e45, { at: [0.2, 0.02, -0.06], rot: [0, 0.3, 0] }, 0.008);
  b.box(0.05, 0.004, 0.08, PAPER, { at: [0.26, 0.004, 0.05], rot: [0, 0.3, 0] }, 0);
}, 1.2);

/**
 * The warmest server, Segfault's bed (built from the wall top): a 4U
 * server with its amber fault LED and a HOT sticker and a towel folded on
 * its lid. The cat itself is a living scene piece (`segfaultCat` in
 * `setDressing/onCall.ts`), so it can breathe.
 */
export const SEGFAULT_SERVER: () => Model = prop((b) => {
  server(b, 0, 0, 0, [0.56, 0.44], 4, 3);
  b.box(0.1, 0.04, 0.004, 0xd8a020, { at: [-0.16, 0.12, 0.226] }, 0);
  lettering(b, 'HOT', -0.16, 0.12, 0.228, 0.006, INK, 0.002);
  // A towel folded on the lid, where the cat sleeps.
  const top = 0.18;
  b.box(0.36, 0.02, 0.28, 0x8a8a96, { at: [0.0, top + 0.01, 0.0] }, 0.006);
}, 1.3);

/**
 * The rack with YOTTA's sticker (built from the wall top): a short black
 * rack cabinet, three servers in it with their LEDs, the violet YOTTA
 * sticker slapped on its door frame, a label maker on top.
 */
export const YOTTA_RACK: () => Model = prop((b) => {
  b.box(0.5, 0.42, 0.42, RACK, { at: [0, 0.21, 0] }, 0.01);
  b.box(0.44, 0.36, 0.006, 0x15171a, { at: [0, 0.21, 0.212] }, 0);
  for (let k = 0; k < 3; k++) server(b, 0, 0.04 + k * 0.12, 0.0, [0.42, 0.4], 2, k * 3 + 1);
  for (const s of [-1, 1]) b.box(0.03, 0.42, 0.02, 0x3a3e45, { at: [s * 0.235, 0.21, 0.215] }, 0);
  // The sticker: a violet rounded label with YOTTA's ring and name.
  b.box(0.2, 0.08, 0.004, STICKER, { at: [0.08, 0.37, 0.226], rot: [0, 0, -0.08] }, 0.01);
  b.torus(0.018, 0.006, 0xf0eaff, { at: [0.012, 0.375, 0.229] });
  lettering(b, 'YOTTA', 0.1, 0.365, 0.229, 0.0065, 0xf0eaff, 0.002);
  // A label maker and a strip of labels on top.
  b.box(0.12, 0.04, 0.08, 0xb89a3a, { at: [-0.12, 0.44, -0.04], rot: [0, 0.3, 0] }, 0.008);
  b.box(0.16, 0.003, 0.02, PAPER, { at: [0.08, 0.422, -0.06], rot: [0, -0.2, 0] }, 0);
}, 1.2);

/** The one small energy-drink can pyramid (built from the wall top): six cans, three high. */
export const CAN_PYRAMID: () => Model = prop((b) => {
  const r = 0.033;
  const h = 0.11;
  const rows = [3, 2, 1];
  rows.forEach((n, row) => {
    for (let k = 0; k < n; k++) {
      const x = (k - (n - 1) / 2) * (r * 2 + 0.004);
      const y = row * h;
      b.cylinder(r, r, h - 0.004, 0x2a5a5e, { at: [x, y + h / 2, 0] }, 12);
      b.cylinder(r * 1.01, r * 1.01, 0.022, 0xa8b0b4, { at: [x, y + h * 0.55, 0] }, 12);
      b.cylinder(r * 0.9, r * 0.9, 0.006, 0xa8b0b4, { at: [x, y + h - 0.003, 0] }, 12);
    }
  });
  // One crushed can lying beside.
  b.cylinder(r, r, 0.06, 0x2a5a5e, { at: [0.2, r, 0.08], rot: [Math.PI / 2, 0.4, 0] }, 10);
}, 1.25);
