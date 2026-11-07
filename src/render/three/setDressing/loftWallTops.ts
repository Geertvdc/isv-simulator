import { type Model, ModelBuilder } from '../kit';
import { COLOR } from '../palette';

/**
 * On the rooftop loft's walls (Seed Round): what stands on top of them in
 * stacked clusters, and what lies on the low front wall. A funded startup's
 * spillover in muted colors, nothing in a station's or a player's color and
 * nothing to eat or drink: monitors still boxed, cable drums, servers, plants
 * in concrete pots, swag boxes, a VR headset, a folded scooter.
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

const BLACK = 0x22252a;
const BOX_WHITE = 0xc4c2bc;
/** The startup's swag pink, muted, and the cardboard of the deliveries. */
const SWAG = 0xc8708e;
const KRAFT = 0xb89468;

/** A monitor lying in its box at (x, y, z): white box, a printed screen on the top, a stripe. */
function monitorBox(b: ModelBuilder, x: number, y: number, z: number, turn: number): void {
  b.box(0.42, 0.08, 0.28, BOX_WHITE, { at: [x, y + 0.04, z], rot: [0, turn, 0] }, 0.008);
  b.box(0.3, 0.004, 0.18, 0x2b2f38, { at: [x, y + 0.081, z], rot: [0, turn, 0] }, 0);
  b.box(0.422, 0.03, 0.06, 0x4a5a6e, { at: [x, y + 0.04, z], rot: [0, turn, 0] }, 0);
}

/** A rack server at (x, y, z), its front bezel toward +z, a few LEDs lit. */
function server(b: ModelBuilder, x: number, y: number, z: number, units: number): void {
  const h = 0.045 * units;
  b.box(0.42, h, 0.3, 0x50555d, { at: [x, y + h / 2, z] }, 0.006);
  b.box(0.4, h - 0.012, 0.006, 0x2a2d32, { at: [x, y + h / 2, z + 0.152] }, 0);
  for (let i = 0; i < units; i++) {
    const ly = y + 0.0225 + i * 0.045;
    for (let k = 0; k < 6; k++)
      b.box(0.04, 0.008, 0.004, 0x6a707a, { at: [x - 0.12 + k * 0.045, ly, z + 0.156] }, 0);
    b.led(0.006, i % 2 ? COLOR.ledGreen : 0x6ab0ff, { at: [x + 0.17, ly, z + 0.157] });
  }
}

/** A potted snake plant at (x, z) in a grey concrete pot `r` wide. */
function snakePlant(b: ModelBuilder, x: number, z: number, r: number): void {
  b.cylinder(r, r * 0.85, r * 1.6, 0x9a9d9e, { at: [x, r * 0.8, z] }, 16);
  b.cylinder(r * 0.9, r * 0.9, 0.01, 0x3a3028, { at: [x, r * 1.6 - 0.004, z] }, 16);
  for (let i = 0; i < 7; i++) {
    const t = (i / 7) * Math.PI * 2;
    const hh = 0.18 + (i % 3) * 0.05;
    b.box(
      0.03,
      hh,
      0.008,
      i % 2 ? 0x3f6a44 : 0x557a4c,
      {
        at: [x + Math.cos(t) * r * 0.4, r * 1.6 + hh / 2, z + Math.sin(t) * r * 0.4],
        rot: [Math.sin(t) * 0.18, -t, -Math.cos(t) * 0.18],
      },
      0,
    );
  }
}

/** A cable drum on its side at (x, z): ply cheeks, a black cable wound on. */
function cableDrum(b: ModelBuilder, x: number, z: number, r: number, cable: number): void {
  for (const s of [-1, 1])
    b.cylinder(r, r, 0.018, 0xc6a676, { at: [x, r, z + s * 0.07], rot: [Math.PI / 2, 0, 0] }, 18);
  b.cylinder(r * 0.78, r * 0.78, 0.13, cable, { at: [x, r, z], rot: [Math.PI / 2, 0, 0] }, 18);
  b.cylinder(r * 0.2, r * 0.2, 0.17, 0x8a7a5a, { at: [x, r, z], rot: [Math.PI / 2, 0, 0] }, 10);
}

/** A swag box: kraft with the pink logo band, at (x, y, z). */
function swagBox(
  b: ModelBuilder,
  x: number,
  y: number,
  z: number,
  [w, h, d]: readonly [number, number, number],
  turn = 0,
): void {
  b.box(w, h, d, KRAFT, { at: [x, y + h / 2, z], rot: [0, turn, 0] }, 0.006);
  b.box(w + 0.003, h * 0.3, d + 0.003, SWAG, { at: [x, y + h * 0.55, z], rot: [0, turn, 0] }, 0);
  b.box(w * 0.3, 0.004, d * 0.3, SWAG, { at: [x, y + h + 0.001, z], rot: [0, turn, 0] }, 0);
}

/** A closed laptop at height y, `turn`ed, a few stickers on its lid. */
function laptop(
  b: ModelBuilder,
  x: number,
  y: number,
  z: number,
  turn: number,
  color: number,
): void {
  b.box(0.32, 0.022, 0.22, color, { at: [x, y + 0.011, z], rot: [0, turn, 0] }, 0.008);
  b.box(0.322, 0.004, 0.222, 0x3a3d44, { at: [x, y + 0.004, z], rot: [0, turn, 0] }, 0);
}

/**
 * The wall-top clusters, each one composed pile on one tile (`loftRoom`
 * puts three on each long wall, the rest of the wall bare): every one 2–3
 * things high with a clear silhouette, inside about 0.85 of a tile so it
 * sits on any wall's cap.
 */
export const LOFT_WALL_TOP_PROPS: readonly (() => Model)[] = [
  prop((b) => {
    // The new monitors: two still boxed, stacked, one out on its stand on top, its film on;
    // the swag boxes beside them, a hoodie hanging out of the open one.
    monitorBox(b, -0.06, 0, -0.02, 0.04);
    monitorBox(b, -0.05, 0.08, -0.01, -0.06);
    b.box(0.1, 0.012, 0.1, BLACK, { at: [-0.05, 0.166, -0.02] }, 0.004);
    b.box(0.025, 0.12, 0.025, BLACK, { at: [-0.05, 0.22, -0.04] }, 0.004);
    b.box(0.36, 0.22, 0.025, BLACK, { at: [-0.05, 0.36, -0.02], rot: [-0.05, 0.08, 0] }, 0.008);
    b.box(0.33, 0.19, 0.004, 0x3c4656, { at: [-0.05, 0.36, -0.006], rot: [-0.05, 0.08, 0] }, 0);
    b.box(0.08, 0.19, 0.003, 0x56637a, { at: [-0.14, 0.36, -0.003], rot: [-0.05, 0.08, 0.3] }, 0);
    swagBox(b, 0.21, 0, 0.06, [0.18, 0.14, 0.16], 0.2);
    swagBox(b, 0.2, 0.14, 0.05, [0.13, 0.1, 0.12], -0.15);
    b.box(0.12, 0.02, 0.1, 0x3a3d44, { at: [0.22, 0.13, 0.17], rot: [0.5, 0.2, 0] }, 0.006);
  }, 1.35),
  prop((b) => {
    // The servers from before the cloud credits: three stacked, a NAS on top, a cable drum
    // leaning on them and a coil of patch cable slung over the edge of the wall.
    server(b, -0.06, 0, 0, 2);
    server(b, -0.05, 0.09, -0.01, 2);
    server(b, -0.07, 0.18, 0, 1);
    b.box(0.13, 0.15, 0.2, 0x2f3238, { at: [-0.12, 0.3, -0.02] }, 0.01);
    for (let k = 0; k < 3; k++)
      b.box(0.022, 0.11, 0.004, 0x4a4e56, { at: [-0.16 + k * 0.032, 0.3, 0.082] }, 0);
    b.led(0.007, COLOR.ledGreen, { at: [-0.07, 0.35, 0.084] });
    cableDrum(b, 0.24, 0.02, 0.12, 0x4d6f9a);
    // The patch cable: up off the drum, over the top server and down the wall's edge in a loop.
    b.box(0.012, 0.012, 0.22, 0x4d6f9a, { at: [0.08, 0.235, 0.1], rot: [0.2, 0.5, 0] }, 0);
    b.box(0.012, 0.012, 0.16, 0x4d6f9a, { at: [0.02, 0.12, 0.27], rot: [1.1, 0, 0] }, 0);
    b.torus(0.07, 0.009, 0x4d6f9a, { at: [0.02, -0.03, 0.4], rot: [0, 0, 0] });
  }, 1.35),
  prop((b) => {
    // Three snake plants in concrete pots, tall, middling, small, and the VR headset someone
    // expensed on its box beside them.
    snakePlant(b, -0.14, -0.06, 0.1);
    snakePlant(b, 0.04, -0.12, 0.075);
    snakePlant(b, -0.18, 0.15, 0.06);
    b.box(0.24, 0.09, 0.18, 0x3a3e45, { at: [0.15, 0.045, 0.1] }, 0.01);
    b.box(0.16, 0.004, 0.1, 0x5a6470, { at: [0.15, 0.091, 0.1] }, 0);
    b.box(0.18, 0.08, 0.1, 0xd8d8d4, { at: [0.15, 0.135, 0.11] }, 0.03);
    b.box(0.16, 0.06, 0.01, BLACK, { at: [0.15, 0.135, 0.165] }, 0.006);
    b.torus(0.08, 0.011, 0x3a3d44, { at: [0.15, 0.14, 0.05], rot: [Math.PI / 2, 0, 0] }, Math.PI);
  }, 1.4),
];

/** How tall a cluster on the low front wall may stand, so it never hides a player behind it. */
export const LOFT_FRONT_PROP_MAX_HEIGHT = 0.3;

/**
 * Low clusters lying on the low front wall, which the camera looks over
 * (each under `LOFT_FRONT_PROP_MAX_HEIGHT`, one compact pile, not a row of
 * singletons): three closed laptops stacked, stickers on the top one and its
 * charger on it; the demo drone parked on its hard case.
 */
export const LOFT_FRONT_WALL_PROPS: readonly (() => Model)[] = [
  prop((b) => {
    laptop(b, 0, 0, 0, 0.1, 0x9aa1a8);
    laptop(b, 0.01, 0.024, 0.005, -0.08, 0x3a3e45);
    laptop(b, -0.005, 0.048, -0.004, 0.18, 0xb8bec4);
    for (const [x, z, c, r] of [
      [-0.08, -0.04, 0x6a8fb8, 0.3],
      [0.05, 0.04, 0xc8708e, -0.2],
      [0.07, -0.05, 0x5a5f68, 0.5],
    ] as const)
      b.box(0.06, 0.004, 0.05, c, { at: [x, 0.072, z], rot: [0, r + 0.18, 0] }, 0);
    b.box(0.06, 0.028, 0.06, 0xe8e8e4, { at: [-0.02, 0.085, 0.05] }, 0.008);
    b.torus(0.05, 0.006, 0xe8e8e4, { at: [0.12, 0.015, 0.14], rot: [Math.PI / 2, 0, 0] });
  }, 1.75),
  prop((b) => {
    // The demo drone on its hard case, rotors out.
    b.box(0.3, 0.07, 0.22, BLACK, { at: [0, 0.035, 0], rot: [0, -0.1, 0] }, 0.012);
    b.box(0.07, 0.012, 0.02, 0x5a6068, { at: [0, 0.072, 0.115], rot: [0, -0.1, 0] }, 0.004);
    const y = 0.09;
    b.box(0.08, 0.035, 0.12, 0x5a6068, { at: [0, y, 0] }, 0.01);
    for (const [x, z] of [
      [-0.09, -0.08],
      [0.09, -0.08],
      [-0.09, 0.08],
      [0.09, 0.08],
    ] as const) {
      b.box(
        0.12,
        0.012,
        0.016,
        0x3a3e45,
        { at: [x / 2, y, z / 2], rot: [0, -Math.atan2(z, x), 0] },
        0,
      );
      b.cylinder(0.045, 0.045, 0.006, 0x9aa1a8, { at: [x, y + 0.016, z] }, 14);
    }
  }, 1.75),
];
