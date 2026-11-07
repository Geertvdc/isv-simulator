import { type Model, ModelBuilder, tint } from '../kit';
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
  b.box(0.42, h, 0.3, 0x3a3e45, { at: [x, y + h / 2, z] }, 0.006);
  b.box(0.4, h - 0.012, 0.006, 0x2a2d32, { at: [x, y + h / 2, z + 0.152] }, 0);
  for (let i = 0; i < units; i++) {
    const ly = y + 0.0225 + i * 0.045;
    for (let k = 0; k < 6; k++)
      b.box(0.04, 0.008, 0.004, 0x4a4e56, { at: [x - 0.12 + k * 0.045, ly, z + 0.156] }, 0);
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

export const LOFT_WALL_TOP_PROPS: readonly (() => Model)[] = [
  prop((b) => {
    // The new monitors, still boxed, stacked three high; one out on its stand, its film still on.
    monitorBox(b, -0.06, 0, 0, 0.05);
    monitorBox(b, -0.04, 0.08, 0.01, -0.08);
    monitorBox(b, -0.07, 0.16, 0, 0.12);
    b.box(0.08, 0.012, 0.12, BLACK, { at: [0.26, 0.006, 0.02] }, 0.004);
    b.box(0.025, 0.16, 0.025, BLACK, { at: [0.26, 0.09, 0] }, 0.004);
    b.box(0.3, 0.19, 0.025, BLACK, { at: [0.26, 0.24, 0.02], rot: [0, -0.3, 0] }, 0.008);
    b.box(0.27, 0.16, 0.004, 0x3c4656, { at: [0.264, 0.24, 0.035], rot: [0, -0.3, 0] }, 0);
  }, 1.35),
  prop((b) => {
    // Cable drums: one of black power cable, one of network cable, a coil come loose.
    cableDrum(b, -0.1, 0, 0.13, BLACK);
    cableDrum(b, 0.16, 0.04, 0.1, 0x4d6f9a);
    for (let i = 0; i < 3; i++)
      b.torus(0.08 - i * 0.006, 0.009, 0x4d6f9a, {
        at: [0.18 + i * 0.006, 0.01 + i * 0.009, -0.14],
        rot: [Math.PI / 2, 0, 0],
      });
  }, 1.35),
  prop((b) => {
    // The servers that came before the cloud credits did: two stacked, a NAS on top, cables.
    server(b, 0, 0, 0, 2);
    server(b, 0.02, 0.09, -0.01, 1);
    b.box(0.14, 0.16, 0.2, 0x2f3238, { at: [-0.08, 0.215, 0] }, 0.01);
    for (let k = 0; k < 4; k++)
      b.box(0.022, 0.12, 0.004, 0x4a4e56, { at: [-0.13 + k * 0.032, 0.215, 0.102] }, 0);
    b.led(0.007, COLOR.ledGreen, { at: [-0.02, 0.27, 0.104] });
    b.box(0.012, 0.012, 0.3, 0x4d6f9a, { at: [0.12, 0.18, 0.05], rot: [0.3, 0.4, 0] }, 0);
  }, 1.35),
  prop((b) => {
    // Plants in concrete pots: a tall snake plant and a small one beside it.
    snakePlant(b, -0.05, 0, 0.11);
    snakePlant(b, 0.2, 0.06, 0.07);
  }, 1.4),
  prop((b) => {
    // Swag: boxes of branded hoodies and stickers, one open, a hoodie hanging out of it.
    swagBox(b, -0.08, 0, 0, [0.3, 0.16, 0.24], 0.05);
    swagBox(b, -0.06, 0.16, 0.01, [0.24, 0.12, 0.2], -0.15);
    swagBox(b, 0.22, 0, 0.04, [0.2, 0.13, 0.18], 0.2);
    b.box(0.22, 0.02, 0.16, 0x3a3d44, { at: [0.22, 0.14, 0.04], rot: [0, 0.2, 0] }, 0.006);
    b.box(0.08, 0.1, 0.03, 0x3a3d44, { at: [0.24, 0.1, 0.14], rot: [0.3, 0.2, 0] }, 0.006);
  }, 1.35),
  prop((b) => {
    // The VR headset someone expensed, on its box, a controller beside it.
    b.box(0.3, 0.1, 0.22, 0x3a3e45, { at: [0, 0.05, 0] }, 0.01);
    b.box(0.2, 0.004, 0.12, 0x5a6470, { at: [0, 0.101, 0] }, 0);
    b.box(0.2, 0.09, 0.11, 0xd8d8d4, { at: [0, 0.155, 0.02] }, 0.03);
    b.box(0.18, 0.07, 0.01, BLACK, { at: [0, 0.155, 0.078] }, 0.006);
    b.torus(0.09, 0.012, 0x3a3d44, { at: [0, 0.16, -0.06], rot: [Math.PI / 2, 0, 0] }, Math.PI);
    b.torus(0.04, 0.012, 0xe8e8e4, { at: [0.24, 0.05, 0.06], rot: [0.4, 0.3, 0] });
    b.box(0.03, 0.08, 0.03, 0xe8e8e4, { at: [0.24, 0.03, 0.02], rot: [0.5, 0.3, 0] }, 0.01);
  }, 1.35),
  prop((b) => {
    // A founder's e-scooter, folded and laid along the wall, its charger lead looped on it.
    b.box(0.5, 0.03, 0.12, 0x3a3e45, { at: [0, 0.05, 0] }, 0.01);
    b.box(0.46, 0.006, 0.1, 0x22252a, { at: [0, 0.067, 0] }, 0);
    for (const x of [-0.27, 0.27]) {
      b.cylinder(0.06, 0.06, 0.04, BLACK, { at: [x, 0.06, 0], rot: [Math.PI / 2, 0, 0] }, 16);
      b.cylinder(0.03, 0.03, 0.042, 0x8a929c, { at: [x, 0.06, 0], rot: [Math.PI / 2, 0, 0] }, 10);
    }
    b.box(0.5, 0.03, 0.03, 0x5a6068, { at: [0.02, 0.1, -0.03], rot: [0, 0, -0.06] }, 0.008);
    b.box(0.03, 0.03, 0.3, BLACK, { at: [-0.24, 0.12, -0.03] }, 0.008);
    b.led(0.012, 0xffe6b0, { at: [0.28, 0.11, -0.03] });
    b.torus(0.06, 0.008, BLACK, { at: [0.08, 0.075, 0.02], rot: [Math.PI / 2, 0, 0] });
  }, 1.35),
];

/** How tall a cluster on the low front wall may stand, so it never hides a player behind it. */
export const LOFT_FRONT_PROP_MAX_HEIGHT = 0.3;

/**
 * Clusters lying on the low front wall, which the camera looks over (each
 * under `LOFT_FRONT_PROP_MAX_HEIGHT`): a closed laptop covered in stickers
 * with its charger, the demo drone beside its case, and a tangle of
 * network cable round a power strip.
 */
export const LOFT_FRONT_WALL_PROPS: readonly (() => Model)[] = [
  prop((b) => {
    b.box(0.32, 0.022, 0.22, 0x9aa1a8, { at: [-0.04, 0.011, 0], rot: [0, 0.12, 0] }, 0.008);
    for (const [x, z, c, r] of [
      [-0.12, -0.04, 0x6a8fb8, 0.3],
      [0.02, 0.05, 0xc8708e, -0.2],
      [0.06, -0.06, 0x5a5f68, 0.5],
      [-0.06, 0.06, 0xd8c070, 0],
    ] as const)
      b.box(0.06, 0.004, 0.05, c, { at: [x, 0.023, z], rot: [0, r, 0] }, 0);
    b.box(0.06, 0.03, 0.06, 0xe8e8e4, { at: [0.22, 0.015, 0.04] }, 0.008);
    b.torus(0.05, 0.006, 0xe8e8e4, { at: [0.22, 0.006, -0.06], rot: [Math.PI / 2, 0, 0] });
  }, 1.75),
  prop((b) => {
    // The demo drone, its four rotors, beside its hard case.
    b.box(0.08, 0.035, 0.12, 0x5a6068, { at: [-0.1, 0.03, 0] }, 0.01);
    for (const [x, z] of [
      [-0.19, -0.08],
      [-0.01, -0.08],
      [-0.19, 0.08],
      [-0.01, 0.08],
    ] as const) {
      b.box(
        0.1,
        0.012,
        0.016,
        0x3a3e45,
        {
          at: [(x - 0.1) / 2, 0.03, z / 2],
          rot: [0, Math.atan2(-(z - 0), x + 0.1), 0],
        },
        0,
      );
      b.cylinder(0.045, 0.045, 0.006, 0x9aa1a8, { at: [x, 0.045, z] }, 14);
    }
    b.box(0.26, 0.07, 0.2, BLACK, { at: [0.2, 0.035, 0.02], rot: [0, -0.1, 0] }, 0.012);
    b.box(0.06, 0.012, 0.02, 0x5a6068, { at: [0.2, 0.072, 0.12], rot: [0, -0.1, 0] }, 0.004);
  }, 1.75),
  prop((b) => {
    // A power strip with its plugs, network cable tangled round it.
    b.box(0.3, 0.035, 0.06, 0xe8e8e4, { at: [0, 0.018, 0], rot: [0, 0.15, 0] }, 0.008);
    for (let i = 0; i < 4; i++)
      b.box(
        0.04,
        0.04,
        0.035,
        i % 2 ? BLACK : 0xe0e0dc,
        {
          at: [-0.1 + i * 0.065, 0.05, 0.01 * i],
          rot: [0, 0.15, 0],
        },
        0.006,
      );
    for (let i = 0; i < 3; i++)
      b.torus(0.09 - i * 0.012, 0.008, i === 1 ? 0xb88a4a : 0x4d6f9a, {
        at: [0.02 + i * 0.02, 0.012 + i * 0.006, 0.02 - i * 0.01],
        rot: [Math.PI / 2, 0, i * 0.4],
      });
    b.box(0.12, 0.05, 0.1, KRAFT, { at: [0.24, 0.025, -0.06], rot: [0, 0.3, 0] }, 0.006);
    // A delivery box of adapters under it all.
    b.box(0.122, 0.004, 0.03, tint(KRAFT, 0.3), { at: [0.24, 0.051, -0.06], rot: [0, 0.3, 0] }, 0);
  }, 1.75),
];
