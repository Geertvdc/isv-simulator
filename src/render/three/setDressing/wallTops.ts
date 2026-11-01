import { type Model, ModelBuilder, tint } from '../kit';
import { COLOR } from '../palette';
import {
  books,
  CARDBOARD,
  DARK,
  LEAF_DARK,
  mug,
  nth,
  plantPot,
  SPINES,
  STEEL,
  WOOD_DARK,
} from './shared';

/** On the office's own walls: what stands on top of them. */

/**
 * A thing to stand on top of a wall, built at desk size and grown by `scale`,
 * so small ones still read from the couch.
 */
function wallTop(build: (b: ModelBuilder) => void, scale = 1): () => Model {
  return () => {
    const b = new ModelBuilder();
    build(b);
    const model = b.build();
    for (const g of [model.body, model.glow, model.glass]) g?.scale(scale, scale, scale);
    return model;
  };
}

/**
 * Things on top of full-height walls, picked per wall by a hash (and never
 * the same as a wall close by): plants in five kinds and pots, book piles,
 * mugs, a rubber duck, a little robot, an old monitor, a lava lamp, a
 * trophy, a globe, a coffee maker, a router. The small ones are grown up to
 * about twice desk size: still clutter, not something to pick up.
 */
export const WALL_TOP_PROPS: readonly (() => Model)[] = [
  wallTop((b) => plantPot(b, 0, 0, 0.55, 0)),
  wallTop((b) => {
    books(b, -0.16, 0, 0, 5, 0);
  }, 1.3),
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
  }, 1.4),
  wallTop((b) => {
    // A rubber duck, the debugging kind.
    b.sphere(0.08, COLOR.aqua, { at: [0, 0.06, 0] }, [1.2, 0.8, 1]);
    b.sphere(0.05, COLOR.aqua, { at: [0.04, 0.14, 0] });
    b.box(0.05, 0.015, 0.04, COLOR.tangerine, { at: [0.09, 0.135, 0] }, 0);
    mug(b, -0.16, 0, 0.04, 1);
  }, 1.8),
  wallTop((b) => {
    // A little robot figurine.
    b.box(0.1, 0.12, 0.08, COLOR.silver, { at: [0, 0.1, 0] }, 0.02);
    b.box(0.08, 0.07, 0.07, 0xb8c0c8, { at: [0, 0.2, 0] }, 0.02);
    b.led(0.012, COLOR.screenGlow, { at: [-0.02, 0.21, 0.036] });
    b.led(0.012, COLOR.screenGlow, { at: [0.02, 0.21, 0.036] });
    for (const x of [-0.03, 0.03])
      b.box(0.03, 0.05, 0.04, COLOR.metalGrey, { at: [x, 0.025, 0] }, 0);
    b.cylinder(0.004, 0.004, 0.05, STEEL, { at: [0, 0.26, 0] }, 4);
  }, 1.9),
  wallTop((b) => {
    // An old grey CRT, still on: darker than any ticket.
    b.box(0.3, 0.24, 0.26, 0x6a6e76, { at: [0, 0.12, 0] }, 0.03);
    b.screen(0.22, 0.16, 0x3a8a6a, { at: [0, 0.13, 0.131] });
  }, 1.3),
  wallTop((b) => {
    // A lava lamp.
    b.cone(0.07, 0.08, STEEL, { at: [0, 0.04, 0] }, 12);
    b.cylinder(0.035, 0.055, 0.2, 0x5a3a6a, { at: [0, 0.18, 0] }, 12);
    b.led(0.025, COLOR.hotPink, { at: [0, 0.15, 0] });
    b.led(0.018, COLOR.hotPink, { at: [0, 0.22, 0] });
    b.cone(0.035, 0.04, STEEL, { at: [0, 0.3, 0], rot: [Math.PI, 0, 0] }, 12);
  }, 1.6),
  wallTop((b) => {
    // A trophy, for the hackathon nobody remembers.
    b.box(0.12, 0.05, 0.12, WOOD_DARK, { at: [0, 0.025, 0] }, 0.01);
    b.cylinder(0.015, 0.02, 0.08, COLOR.brass, { at: [0, 0.09, 0] }, 8);
    b.cylinder(0.07, 0.03, 0.1, COLOR.brass, { at: [0, 0.18, 0] }, 12);
  }, 1.8),
  wallTop((b) => {
    // A globe.
    b.cylinder(0.05, 0.06, 0.02, WOOD_DARK, { at: [0, 0.01, 0] }, 10);
    b.cylinder(0.008, 0.008, 0.08, STEEL, { at: [0, 0.05, 0] }, 4);
    b.sphere(0.09, 0x5a8aa0, { at: [0, 0.17, 0] });
    b.sphere(0.05, COLOR.fern, { at: [0.04, 0.2, 0.05] }, [1, 0.6, 0.6]);
  }, 1.8),
  wallTop((b) => {
    // A coffee maker and its pot.
    b.box(0.16, 0.24, 0.16, DARK, { at: [0, 0.12, 0] }, 0.02);
    b.cylinder(0.05, 0.06, 0.1, 0x8fb0c0, { at: [0, 0.06, 0.06] }, 10);
    b.led(0.012, 0xff7a4a, { at: [0.05, 0.2, 0.082] });
  }, 1.6),
  wallTop((b) => {
    // A Wi-Fi router with its antennas.
    b.box(0.24, 0.04, 0.16, COLOR.porcelain, { at: [0, 0.02, 0] }, 0.01);
    for (const x of [-0.09, 0, 0.09])
      b.box(0.015, 0.14, 0.015, DARK, { at: [x, 0.1, -0.07], rot: [0, 0, x * 2] }, 0);
    for (let i = 0; i < 4; i++)
      b.led(0.008, COLOR.ledGreen, { at: [-0.06 + i * 0.04, 0.03, 0.081] });
  }, 1.8),
];

/** Paint tins in the garage's colors: a lid, a band of label, a drip down the side. */
function paintTin(b: ModelBuilder, x: number, y: number, z: number, look: number, r = 0.07): void {
  const label = nth(
    [COLOR.porcelain, COLOR.sage, COLOR.terracotta, COLOR.dustyBlue, COLOR.khaki],
    look,
  );
  b.cylinder(r, r, r * 1.7, COLOR.silver, { at: [x, y + r * 0.85, z] }, 14);
  b.cylinder(r + 0.002, r + 0.002, r * 0.9, label, { at: [x, y + r * 0.8, z] }, 14);
  b.cylinder(r * 0.9, r * 0.9, 0.006, COLOR.chrome, { at: [x, y + r * 1.7 + 0.003, z] }, 14);
  b.box(0.02, r * 0.7, 0.01, label, { at: [x + r * 0.4, y + r * 1.4, z + r * 0.92] }, 0);
}

/**
 * Things on top of a garage's walls, piled up out of the way: each one a
 * little heap of its own, and set two to a cluster (see `garageRoom`), so the
 * wall tops carry a few full stacks rather than one item per tile. Paint tins
 * stacked three high, boxes on boxes, a coiled garden hose, a boombox on a
 * box, a box of cables, a potted geranium, a toolbox, pizza boxes and
 * energy-drink cans (the startup moved in), a spare tyre, the petrol can and
 * an extension cord, the Christmas lights. Neighbours in the list differ, so
 * a cluster never doubles up.
 */
export const GARAGE_WALL_TOP_PROPS: readonly (() => Model)[] = [
  wallTop((b) => {
    // Paint tins stacked three high: three, two, one.
    paintTin(b, -0.15, 0, 0, 0);
    paintTin(b, 0.0, 0, 0.03, 1);
    paintTin(b, 0.15, 0, -0.01, 3);
    paintTin(b, -0.075, 0.125, 0.01, 2);
    paintTin(b, 0.08, 0.125, 0.0, 4);
    paintTin(b, 0.0, 0.25, 0.01, 0, 0.06);
  }, 1.5),
  wallTop((b) => {
    // Two cardboard boxes, one on the other, taped; a tin beside them.
    b.box(0.4, 0.26, 0.32, CARDBOARD, { at: [0, 0.13, 0] }, 0.015);
    b.box(0.41, 0.03, 0.08, 0xe8d4a8, { at: [0, 0.255, 0] }, 0);
    b.box(0.3, 0.2, 0.26, 0xb8864e, { at: [0.03, 0.36, 0], rot: [0, 0.25, 0] }, 0.015);
    b.box(0.1, 0.06, 0.004, DARK, { at: [0.06, 0.38, 0.14], rot: [0, 0.25, 0] }, 0);
    paintTin(b, 0.28, 0, 0.08, 2, 0.06);
  }),
  wallTop((b) => {
    // A green garden hose, coiled flat, its nozzle on top.
    for (let i = 0; i < 5; i++)
      b.torus(0.16 - (i % 2) * 0.012, 0.022, i % 2 ? 0x3f8a3a : 0x4a9a44, {
        at: [(i % 2) * 0.01, 0.022 + i * 0.038, 0],
        rot: [Math.PI / 2, 0, 0],
      });
    b.box(0.14, 0.04, 0.05, COLOR.tangerine, { at: [0.04, 0.22, 0.04], rot: [0, 0.5, 0] }, 0.01);
    b.box(0.06, 0.03, 0.03, DARK, { at: [0.12, 0.22, -0.01], rot: [0, 0.5, 0] }, 0);
  }, 1.3),
  wallTop((b) => {
    // An old boombox on a cardboard box.
    b.box(0.4, 0.18, 0.3, CARDBOARD, { at: [0, 0.09, 0] }, 0.015);
    b.box(0.41, 0.025, 0.07, 0xe8d4a8, { at: [0, 0.178, 0] }, 0);
    const y = 0.18;
    b.box(0.38, 0.18, 0.12, COLOR.graphite, { at: [0, y + 0.09, 0] }, 0.02);
    for (const x of [-0.11, 0.11]) {
      b.cylinder(
        0.06,
        0.06,
        0.01,
        DARK,
        { at: [x, y + 0.09, 0.062], rot: [Math.PI / 2, 0, 0] },
        16,
      );
      b.cylinder(
        0.025,
        0.025,
        0.012,
        STEEL,
        {
          at: [x, y + 0.09, 0.064],
          rot: [Math.PI / 2, 0, 0],
        },
        10,
      );
    }
    b.box(0.3, 0.02, 0.02, STEEL, { at: [0, y + 0.22, 0] }, 0);
  }, 1.3),
  wallTop((b) => {
    // A box of cables, flaps open, leads spilling over the side.
    b.box(0.36, 0.2, 0.28, 0xb8864e, { at: [0, 0.1, 0] }, 0.012);
    for (const s of [-1, 1])
      b.box(0.36, 0.012, 0.12, CARDBOARD, { at: [0, 0.23, s * 0.19], rot: [s * 0.9, 0, 0] }, 0);
    for (const [x, c] of [
      [-0.1, DARK],
      [0.0, COLOR.tangerine],
      [0.1, 0x3a62a8],
    ] as const)
      b.torus(0.07, 0.014, c, { at: [x, 0.21, 0], rot: [Math.PI / 2 - 0.4, x * 3, 0] });
    b.box(0.016, 0.22, 0.016, DARK, { at: [0.19, 0.1, 0.1], rot: [0, 0, 0.2] }, 0);
    b.box(0.016, 0.18, 0.016, COLOR.tangerine, { at: [-0.12, 0.12, 0.15], rot: [0.5, 0, 0] }, 0);
  }, 1.3),
  wallTop((b) => {
    // A geranium in a terracotta pot, a little tin beside it.
    b.cylinder(0.11, 0.08, 0.16, COLOR.terracotta, { at: [0, 0.08, 0] }, 14);
    b.cylinder(0.115, 0.115, 0.03, tint(COLOR.terracotta, -0.12), { at: [0, 0.16, 0] }, 14);
    b.sphere(0.15, LEAF_DARK, { at: [0, 0.27, 0] }, [1, 0.75, 1]);
    for (const [x, z] of [
      [-0.06, 0.06],
      [0.07, 0.03],
      [0.0, -0.07],
      [0.05, 0.1],
    ] as const)
      b.sphere(0.04, 0xd8424a, { at: [x, 0.36, z] });
    paintTin(b, 0.2, 0, 0.05, 1, 0.05);
  }, 1.4),
  wallTop((b) => {
    // A red toolbox, lid shut, handle up, on two flat tins.
    for (const x of [-0.08, 0.1]) paintTin(b, x, 0, 0, 4, 0.08);
    const y = 0.14;
    b.box(0.34, 0.16, 0.18, COLOR.signalRed, { at: [0, y + 0.08, 0] }, 0.02);
    b.box(0.35, 0.02, 0.19, tint(COLOR.signalRed, -0.3), { at: [0, y + 0.12, 0] }, 0);
    b.box(0.18, 0.02, 0.03, DARK, { at: [0, y + 0.22, 0] }, 0);
    for (const x of [-0.08, 0.08]) b.box(0.02, 0.06, 0.03, DARK, { at: [x, y + 0.19, 0] }, 0);
  }, 1.3),
  wallTop((b) => {
    // Pizza boxes stacked high, energy-drink cans on top.
    for (let i = 0; i < 5; i++)
      b.box(
        0.36,
        0.045,
        0.36,
        i % 2 ? 0xd8b080 : CARDBOARD,
        {
          at: [0, 0.023 + i * 0.047, 0],
          rot: [0, (((i * 7) % 5) - 2) * 0.05, 0],
        },
        0.006,
      );
    for (const [x, z] of [
      [-0.08, 0.04],
      [0.04, -0.06],
      [0.1, 0.08],
    ] as const)
      b.cylinder(0.03, 0.03, 0.1, COLOR.neonLime, { at: [x, 0.29, z] }, 10);
  }, 1.3),
  wallTop((b) => {
    // A spare tyre lying flat, a paint tin on it.
    b.torus(0.18, 0.07, 0x2a2a2c, { at: [0, 0.07, 0], rot: [Math.PI / 2, 0, 0] });
    paintTin(b, 0, 0.0, 0, 3, 0.06);
  }, 1.2),
  wallTop((b) => {
    // The petrol can for the mower, an orange extension cord coiled against it.
    b.box(0.24, 0.26, 0.12, 0xb8322a, { at: [-0.08, 0.13, 0] }, 0.03);
    b.box(0.1, 0.03, 0.04, DARK, { at: [-0.12, 0.28, 0] }, 0);
    b.cylinder(0.02, 0.025, 0.1, DARK, { at: [0.02, 0.3, 0], rot: [0, 0, -0.6] }, 8);
    for (let i = 0; i < 3; i++)
      b.torus(0.11 - i * 0.008, 0.018, COLOR.tangerine, {
        at: [0.16, 0.02 + i * 0.03, 0.08],
        rot: [Math.PI / 2, 0, 0],
      });
  }, 1.3),
  wallTop((b) => {
    // A box marked for the Christmas lights, a string of them spilling out.
    b.box(0.34, 0.2, 0.26, CARDBOARD, { at: [0, 0.1, 0] }, 0.015);
    b.box(0.2, 0.06, 0.004, COLOR.signalRed, { at: [0, 0.12, 0.131] }, 0);
    for (let i = 0; i < 5; i++)
      b.led(0.018, nth([COLOR.signalRed, COLOR.leafLight, COLOR.amber, COLOR.noteBlue], i), {
        at: [-0.14 + i * 0.07, 0.21 + (i % 2) * 0.02, 0.1],
      });
  }, 1.3),
];

/**
 * Low things lying on a garage's front wall, the one the camera looks over:
 * nothing more than a hand high, so they never hide the floor behind. A
 * broom laid along it, a slumped bag of sand, a few spare blocks, work
 * gloves and a trowel, a watering can.
 */
export const GARAGE_FRONT_WALL_PROPS: readonly (() => Model)[] = [
  wallTop((b) => {
    // A broom laid along the wall.
    b.cylinder(
      0.016,
      0.016,
      0.5,
      WOOD_DARK,
      { at: [-0.05, 0.02, 0.04], rot: [0, 0.08, Math.PI / 2] },
      6,
    );
    b.box(0.08, 0.05, 0.24, 0x8a5a3a, { at: [0.22, 0.03, 0.03], rot: [0, 0.08, 0] }, 0.01);
    b.box(0.06, 0.03, 0.26, 0xc8a060, { at: [0.27, 0.02, 0.03], rot: [0, 0.08, 0] }, 0);
  }, 1.5),
  wallTop((b) => {
    // A half-used bag of sand, slumped, its top folded over.
    b.box(0.34, 0.09, 0.24, 0xd8c8a0, { at: [0, 0.045, 0], rot: [0, 0.2, 0] }, 0.04);
    b.box(0.2, 0.004, 0.1, 0x3a62a8, { at: [0, 0.092, 0], rot: [0, 0.2, 0] }, 0);
    b.box(0.12, 0.05, 0.22, 0xc8b890, { at: [0.2, 0.04, -0.04], rot: [0, 0.2, 0.3] }, 0.02);
  }, 1.5),
  wallTop((b) => {
    // Spare cinder blocks, one laid across two.
    const block = 0x9a9890;
    for (const x of [-0.13, 0.13]) b.box(0.22, 0.07, 0.12, block, { at: [x, 0.035, 0] }, 0.006);
    b.box(0.22, 0.07, 0.12, tint(block, -0.06), { at: [0, 0.105, 0], rot: [0, 0.25, 0] }, 0.006);
  }, 1.5),
  wallTop((b) => {
    // Work gloves and a trowel.
    for (const [x, turn] of [
      [-0.12, 0.3],
      [0.0, -0.4],
    ] as const) {
      b.box(0.08, 0.025, 0.14, COLOR.tangerine, { at: [x, 0.012, 0], rot: [0, turn, 0] }, 0.01);
      b.box(
        0.08,
        0.026,
        0.05,
        0xd8c8a0,
        { at: [x - Math.sin(turn) * 0.08, 0.013, -Math.cos(turn) * 0.08], rot: [0, turn, 0] },
        0,
      );
    }
    b.box(0.14, 0.008, 0.08, STEEL, { at: [0.2, 0.006, 0.02], rot: [0, 0.6, 0] }, 0);
    b.cylinder(
      0.014,
      0.014,
      0.1,
      WOOD_DARK,
      { at: [0.28, 0.03, -0.04], rot: [0, 0.6, Math.PI / 2] },
      6,
    );
  }, 1.5),
  wallTop((b) => {
    // A green watering can.
    b.cylinder(0.07, 0.08, 0.13, 0x4a8a5a, { at: [0, 0.065, 0] }, 14);
    b.cylinder(0.012, 0.016, 0.16, 0x4a8a5a, { at: [0.12, 0.09, 0], rot: [0, 0, -0.9] }, 6);
    b.torus(0.05, 0.01, 0x3a7048, { at: [-0.02, 0.14, 0], rot: [0, 0, 0] }, Math.PI);
  }, 1.5),
];
