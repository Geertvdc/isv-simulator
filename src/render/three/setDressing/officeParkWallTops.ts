import { type Model, ModelBuilder, tint } from '../kit';
import { COLOR } from '../palette';
import { nth } from './shared';

/**
 * On the business-park unit's walls (Open Plan Office): what stands on top
 * of them, and what lies on the low front wall. Office leftovers in muted
 * colors, nothing in a station's or a player's color: box files, a dead
 * plant, the kettle corner, a laser printer, paper, a desk fan.
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

/** Lever-arch file spines: navy, maroon, grey, black, a faded green. */
const FILES = [0x3b4a6b, 0x7a3a3a, 0x8a8f96, 0x2f3238, 0x5f7a62];
const PAPER = COLOR.paper;

/** A lever-arch file standing at (x, 0, z), leaning `lean`, its spine label toward +z. */
function boxFile(b: ModelBuilder, x: number, z: number, color: number, lean = 0): void {
  b.box(0.07, 0.3, 0.24, color, { at: [x, 0.15, z], rot: [0, 0, lean] }, 0.008);
  b.box(0.05, 0.08, 0.004, 0xf1ece0, { at: [x, 0.2, z + 0.121], rot: [0, 0, lean] }, 0);
  b.cylinder(
    0.018,
    0.018,
    0.004,
    0xf1ece0,
    { at: [x, 0.08, z + 0.121], rot: [Math.PI / 2, 0, 0] },
    10,
  );
}

/** A mug at (x, y, z), a handle toward +x. */
function mug(b: ModelBuilder, x: number, y: number, z: number, color: number): void {
  b.cylinder(0.04, 0.036, 0.09, color, { at: [x, y + 0.045, z] }, 12);
  b.cylinder(0.034, 0.034, 0.004, 0x4a3020, { at: [x, y + 0.088, z] }, 12);
  b.torus(0.025, 0.008, color, { at: [x + 0.045, y + 0.045, z], rot: [0, 0, Math.PI / 2] });
}

/** A ream of copier paper in its wrapper at (x, y, z). */
function ream(b: ModelBuilder, x: number, y: number, z: number, turn = 0): void {
  b.box(0.3, 0.05, 0.21, PAPER, { at: [x, y + 0.025, z], rot: [0, turn, 0] }, 0.004);
  b.box(0.302, 0.03, 0.08, 0x6a8ab0, { at: [x, y + 0.025, z], rot: [0, turn, 0] }, 0);
}

export const OFFICE_PARK_WALL_TOP_PROPS: readonly (() => Model)[] = [
  prop((b) => {
    // A row of box files, the last one fallen against the others.
    for (let i = 0; i < 4; i++) boxFile(b, -0.15 + i * 0.075, 0, nth(FILES, i));
    boxFile(b, 0.2, 0, nth(FILES, 4), -0.45);
  }, 1.4),
  prop((b) => {
    // The plant nobody waters: a grey pot, brown drooping leaves, two on the wall.
    b.cylinder(0.12, 0.09, 0.2, 0x8a8f96, { at: [0, 0.1, 0] }, 14);
    b.cylinder(0.11, 0.11, 0.015, 0x5a4030, { at: [0, 0.195, 0] }, 14);
    for (let i = 0; i < 6; i++) {
      const t = (i / 6) * Math.PI * 2;
      b.box(
        0.03,
        0.18,
        0.012,
        i % 2 ? 0x8a6a3a : 0x6f5a32,
        {
          at: [Math.cos(t) * 0.07, 0.25, Math.sin(t) * 0.07],
          rot: [Math.sin(t) * 0.9, 0, -Math.cos(t) * 0.9],
        },
        0,
      );
    }
    b.box(0.006, 0.18, 0.006, 0x5a4a2a, { at: [0, 0.29, 0] }, 0);
    for (const [x, z, r] of [
      [0.18, 0.06, 0.5],
      [-0.16, 0.1, 1.9],
    ] as const)
      b.box(0.08, 0.004, 0.03, 0x8a6a3a, { at: [x, 0.002, z], rot: [0, r, 0] }, 0);
  }, 1.4),
  prop((b) => {
    // The kettle corner: a kettle, mugs, the milk, a box of teabags.
    b.cylinder(0.08, 0.09, 0.03, 0x2f3238, { at: [-0.1, 0.015, 0] }, 16);
    b.cylinder(0.075, 0.085, 0.19, 0xd8dadc, { at: [-0.1, 0.125, 0] }, 16);
    b.box(0.03, 0.12, 0.05, 0x2f3238, { at: [-0.19, 0.13, 0] }, 0.01);
    b.box(0.06, 0.03, 0.03, 0xd8dadc, { at: [-0.01, 0.17, 0], rot: [0, 0, 0.5] }, 0.006);
    mug(b, 0.06, 0, 0.06, 0xe9e4d8);
    mug(b, 0.15, 0, -0.04, 0x3b4a6b);
    mug(b, 0.05, 0, -0.08, 0xb04a3a);
    b.box(0.06, 0.13, 0.06, 0xf4f4f0, { at: [0.2, 0.065, 0.08] }, 0.006);
    b.box(0.062, 0.03, 0.062, 0x3a7ab8, { at: [0.2, 0.1, 0.08] }, 0);
    b.box(0.12, 0.08, 0.07, 0xc84a3a, { at: [-0.1, 0.04, 0.14] }, 0.006);
  }, 1.45),
  prop((b) => {
    // A laser printer, a sheet half out, its jam light on.
    b.box(0.4, 0.2, 0.32, 0xc8c9c6, { at: [0, 0.1, 0] }, 0.02);
    b.box(0.34, 0.03, 0.2, 0x7d8085, { at: [0, 0.205, -0.03] }, 0.01);
    b.box(0.3, 0.06, 0.06, tint(0xc8c9c6, -0.2), { at: [0, 0.05, 0.17] }, 0.01);
    b.box(0.2, 0.004, 0.16, PAPER, { at: [0, 0.18, 0.12], rot: [-0.2, 0, 0] }, 0);
    b.box(0.08, 0.03, 0.006, 0x3a3f4a, { at: [0.12, 0.17, 0.162] }, 0);
    b.led(0.01, 0xff8a3a, { at: [0.15, 0.17, 0.166] });
    ream(b, 0.32, 0, 0.02, 0.2);
  }, 1.3),
  prop((b) => {
    // Paper reams stacked up, one opened, and a stapler on top.
    for (let i = 0; i < 3; i++) ream(b, 0, i * 0.05, 0, i * 0.12 - 0.1);
    b.box(0.2, 0.012, 0.15, PAPER, { at: [0.22, 0.006, 0.04], rot: [0, 0.4, 0] }, 0);
    b.box(0.16, 0.035, 0.04, 0x2f3238, { at: [0.02, 0.17, 0.02], rot: [0, 0.3, 0] }, 0.01);
  }, 1.4),
  prop((b) => {
    // A desk fan, switched off for the winter, and a tangle of its flex.
    b.cylinder(0.08, 0.09, 0.025, 0xe6e4de, { at: [0, 0.012, 0] }, 16);
    b.cylinder(0.012, 0.012, 0.2, 0xe6e4de, { at: [0, 0.12, 0] }, 8);
    b.cylinder(
      0.12,
      0.12,
      0.05,
      0xd8d6d0,
      { at: [0, 0.24, 0.02], rot: [Math.PI / 2 - 0.2, 0, 0] },
      20,
    );
    b.cylinder(
      0.04,
      0.04,
      0.06,
      0x8a9fb0,
      { at: [0, 0.24, 0.03], rot: [Math.PI / 2 - 0.2, 0, 0] },
      12,
    );
    b.torus(0.06, 0.008, 0x2f3238, { at: [0.16, 0.008, 0.02], rot: [Math.PI / 2, 0, 0] });
  }, 1.4),
  prop((b) => {
    // Box files lying flat, a desk organiser of pens on them.
    for (let i = 0; i < 3; i++)
      b.box(
        0.3,
        0.07,
        0.24,
        nth(FILES, i + 2),
        { at: [0, 0.035 + i * 0.07, 0], rot: [0, i * 0.1, 0] },
        0.008,
      );
    b.cylinder(0.04, 0.04, 0.09, 0x3a3f4a, { at: [0.06, 0.255, 0] }, 12);
    for (const [x, c] of [
      [0.05, 0x3a6ab8],
      [0.07, COLOR.signalRed],
      [0.06, 0x2f3238],
    ] as const)
      b.box(0.008, 0.08, 0.008, c, { at: [x, 0.32, 0.01], rot: [0.2, 0, x * 3 - 0.2] }, 0);
  }, 1.4),
];

/** Low things lying on the front wall, which the camera looks over: post, cable, a lanyard. */
export const OFFICE_PARK_FRONT_WALL_PROPS: readonly (() => Model)[] = [
  prop((b) => {
    // A coil of blue network cable.
    for (let i = 0; i < 3; i++)
      b.torus(0.12 - i * 0.01, 0.012, 0x3a6ab8, {
        at: [0.01 * i, 0.012 + i * 0.012, 0],
        rot: [Math.PI / 2, 0, 0],
      });
  }, 1.3),
  prop((b) => {
    // A small parcel nobody has opened, and a stack of post.
    b.box(0.22, 0.12, 0.18, COLOR.cardboard, { at: [0, 0.06, 0] }, 0.01);
    b.box(0.222, 0.004, 0.04, 0xc8a878, { at: [0, 0.121, 0] }, 0);
    for (let i = 0; i < 3; i++)
      b.box(
        0.16,
        0.008,
        0.1,
        i === 1 ? 0xd8c09a : PAPER,
        { at: [0.22, 0.004 + i * 0.008, 0], rot: [0, i * 0.2, 0] },
        0,
      );
  }, 1.3),
  prop((b) => {
    // A visitor lanyard and a stapler.
    b.box(0.07, 0.004, 0.09, PAPER, { at: [0, 0.004, 0] }, 0);
    b.torus(0.1, 0.006, 0x3a8a7a, { at: [0, 0.004, -0.1], rot: [Math.PI / 2, 0, 0] });
    b.box(0.16, 0.035, 0.04, 0x2f3238, { at: [0.22, 0.018, 0.02], rot: [0, 0.4, 0] }, 0.01);
  }, 1.3),
];
