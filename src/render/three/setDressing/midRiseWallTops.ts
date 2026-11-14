import * as THREE from 'three';
import { type Model, ModelBuilder } from '../kit';
import { lettering } from './businessPark';
import { segfaultCat } from './onCall';
import { plantPot } from './shared';

/**
 * On the partitions of the mid-rise floor (Middle Management): what stands
 * on top of them in stacked clusters, and what lies on the low front wall.
 * A new corporate office's things in muted colours, nothing in a station's
 * or a player's colour and nothing to eat: fat ring binders, a desk fan, a
 * framed team photo, a succulent, a stack of WELCOME TO YOTTA guides, reams
 * of paper, a snake plant, a wire letter tray. Plus the one-offs: the one
 * box of new lanyards, and Segfault asleep on Derek's chair.
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

const PAPER = 0xe4e4de;
const INK = 0x2a2d33;
const KRAFT = 0xa8916e;
/** YOTTA's violet, printed. */
const VIOLET = 0x6a52b0;
/** Binder spines, muted office colours: navy, slate, burgundy, charcoal, sage. */
const BINDERS = [0x34466a, 0x5a6878, 0x7a3a40, 0x3a3d44, 0x6a7a68] as const;
const WHITE_PLASTIC = 0xe2e4e4;

/** A fat ring binder standing on its foot at (x, z), turned `yaw`, spine facing +z. */
function binder(b: ModelBuilder, x: number, z: number, color: number, yaw = 0, lean = 0): void {
  b.box(0.07, 0.3, 0.26, color, { at: [x, 0.15, z], rot: [0, yaw, lean] }, 0.008);
  b.box(0.05, 0.08, 0.004, PAPER, { at: [x, 0.2, z + 0.131], rot: [0, yaw, lean] }, 0);
  b.cylinder(
    0.014,
    0.014,
    0.006,
    INK,
    { at: [x, 0.08, z + 0.132], rot: [Math.PI / 2, yaw, 0] },
    10,
  );
}

/** A ream of paper at (x, y, z): white, its wrapper's kraft band. */
function ream(b: ModelBuilder, x: number, y: number, z: number, yaw: number): void {
  b.box(0.21, 0.05, 0.3, PAPER, { at: [x, y + 0.025, z], rot: [0, yaw, 0] }, 0.004);
  b.box(0.212, 0.03, 0.12, KRAFT, { at: [x, y + 0.025, z], rot: [0, yaw, 0] }, 0);
}

/** A WELCOME TO YOTTA guide lying at (x, y, z): violet cover, white title. */
function guide(b: ModelBuilder, x: number, y: number, z: number, yaw: number): void {
  b.box(0.2, 0.022, 0.28, VIOLET, { at: [x, y + 0.011, z], rot: [0, yaw, 0] }, 0.004);
  b.box(0.19, 0.016, 0.27, PAPER, { at: [x + 0.004, y + 0.011, z + 0.004], rot: [0, yaw, 0] }, 0);
  const g = new ModelBuilder();
  lettering(g, 'WELCOME', 0, 0.04, 0, 0.007, 0xf0ecfa, 0.002);
  lettering(g, 'TO YOTTA', 0, -0.01, 0, 0.007, 0xf0ecfa, 0.002);
  const m = g.build();
  const turn = new THREE.Matrix4().compose(
    new THREE.Vector3(x, y + 0.023, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, yaw, 0, 'YXZ')),
    new THREE.Vector3(1, 1, 1),
  );
  m.body.applyMatrix4(turn);
  b.add(m.body, 0xf0ecfa, {});
}

export const MID_RISE_WALL_TOP_PROPS: readonly (() => Model)[] = [
  // Fat ring binders in a row, one leaning, a bookend.
  prop((b) => {
    BINDERS.slice(0, 4).forEach((c, k) => {
      binder(b, -0.15 + k * 0.08, 0, c, 0, k === 3 ? -0.25 : 0);
    });
    b.box(0.02, 0.16, 0.18, 0x8d949b, { at: [-0.2, 0.08, 0] }, 0.004);
  }, 1.15),
  // The desk fan: a white round cage on its stand, turned to the room.
  prop((b) => {
    b.cylinder(0.09, 0.1, 0.03, WHITE_PLASTIC, { at: [0, 0.015, 0] }, 18);
    b.box(0.03, 0.18, 0.03, WHITE_PLASTIC, { at: [0, 0.11, -0.02] }, 0.008);
    b.box(0.08, 0.08, 0.1, WHITE_PLASTIC, { at: [0, 0.21, -0.04] }, 0.02);
    b.torus(0.12, 0.008, WHITE_PLASTIC, { at: [0, 0.27, 0.03] });
    b.cylinder(0.12, 0.12, 0.004, 0xb8bcc0, { at: [0, 0.27, 0.035], rot: [Math.PI / 2, 0, 0] }, 20);
    for (let k = 0; k < 3; k++)
      b.box(
        0.17,
        0.05,
        0.006,
        0x9aa4ae,
        { at: [0, 0.27, 0.04], rot: [0, 0, (k * Math.PI * 2) / 3] },
        0,
      );
    b.cylinder(
      0.025,
      0.025,
      0.03,
      WHITE_PLASTIC,
      { at: [0, 0.27, 0.05], rot: [Math.PI / 2, 0, 0] },
      12,
    );
  }, 1.15),
  // The framed team photo, the founders and the first hires, on its easel back.
  prop((b) => {
    b.box(0.3, 0.24, 0.02, 0x2a2d33, { at: [0, 0.13, 0], rot: [-0.18, 0, 0] }, 0.006);
    b.box(0.26, 0.2, 0.004, 0xbcc8cc, { at: [0, 0.13, 0.011], rot: [-0.18, 0, 0] }, 0);
    // Six tiny people: heads and shirts.
    for (let k = 0; k < 6; k++) {
      const x = -0.1 + k * 0.04;
      const shirt = [0x5a6a8a, 0xa85a4a, 0x4a7a5a, 0xd0c8b0, 0x7a5aa0, 0x3a3d44][k] ?? INK;
      b.box(
        0.03,
        0.05,
        0.004,
        shirt,
        { at: [x, 0.09 + (k % 2) * 0.01, 0.018], rot: [-0.18, 0, 0] },
        0,
      );
      b.box(
        0.018,
        0.02,
        0.004,
        0xd8b090,
        { at: [x, 0.135 + (k % 2) * 0.01, 0.026], rot: [-0.18, 0, 0] },
        0,
      );
    }
    b.box(0.02, 0.2, 0.02, 0x2a2d33, { at: [0, 0.1, -0.08], rot: [0.4, 0, 0] }, 0.004);
    // A succulent beside it in a white pot.
    b.cylinder(0.05, 0.04, 0.07, 0xe8e6e0, { at: [0.2, 0.035, 0.04] }, 14);
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      b.sphere(
        0.022,
        0x6a8a6a,
        { at: [0.2 + Math.cos(a) * 0.022, 0.085, 0.04 + Math.sin(a) * 0.022] },
        [0.7, 1.2, 0.7],
      );
    }
    b.sphere(0.02, 0x7a9a72, { at: [0.2, 0.1, 0.04] });
  }, 1.2),
  // A stack of WELCOME TO YOTTA guides, fresh from the printer, one fanned off the top.
  prop((b) => {
    for (let k = 0; k < 5; k++) guide(b, 0, k * 0.022, 0, (k % 2) * 0.06 - 0.03);
    guide(b, 0.08, 0.11, 0.05, 0.4);
  }, 1.2),
  // Reams of paper and a stapler on top.
  prop((b) => {
    for (let k = 0; k < 3; k++) ream(b, 0, k * 0.05, 0, k * 0.05);
    ream(b, 0.2, 0, 0.04, -0.3);
    b.box(0.14, 0.04, 0.04, 0x2a2d33, { at: [0.02, 0.17, 0.02], rot: [0, 0.4, 0] }, 0.01);
  }, 1.15),
  // A snake plant in a grey pot.
  prop((b) => {
    plantPot(b, 0, 0, 0.64, 7);
  }, 1.0),
  // Binders lying in a stack, a wire letter tray with papers beside.
  prop((b) => {
    BINDERS.forEach((c, k) =>
      b.box(
        0.26,
        0.065,
        0.3,
        c,
        { at: [-0.06, 0.033 + k * 0.066, 0], rot: [0, (k % 2) * 0.1 - 0.05, 0] },
        0.008,
      ),
    );
    for (let k = 0; k < 2; k++) {
      const y = 0.03 + k * 0.08;
      b.box(0.24, 0.006, 0.3, 0x5a6068, { at: [0.2, y, 0.02] }, 0);
      for (const s of [-1, 1])
        b.box(0.006, 0.06, 0.3, 0x5a6068, { at: [0.2 + s * 0.12, y + 0.03, 0.02] }, 0);
      b.box(0.21, 0.02, 0.28, PAPER, { at: [0.2, y + 0.013, 0.02] }, 0);
    }
  }, 1.1),
  // A potted succulent on a pile of printouts.
  prop((b) => {
    for (let k = 0; k < 3; k++)
      b.box(
        0.21,
        0.01,
        0.29,
        PAPER,
        { at: [0.02 * k, 0.005 + k * 0.01, 0], rot: [0, k * 0.2, 0] },
        0,
      );
    b.cylinder(0.08, 0.065, 0.11, 0x7a8088, { at: [0, 0.085, 0] }, 16);
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      b.cone(
        0.03,
        0.09,
        0x5e8a6a,
        {
          at: [Math.cos(a) * 0.035, 0.18, Math.sin(a) * 0.035],
          rot: [Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5],
        },
        5,
      );
    }
  }, 1.2),
];

/** How high anything lying on the low front wall reaches at most (over the wall's top). */
export const MID_RISE_FRONT_PROP_MAX_HEIGHT = 0.25;

/** Low things lying on the front wall, the lift lobby beyond: never more than a hand high. */
export const MID_RISE_FRONT_WALL_PROPS: readonly (() => Model)[] = [
  // A fanned pile of printouts with a stapler on it.
  prop((b) => {
    for (let k = 0; k < 4; k++)
      b.box(
        0.21,
        0.006,
        0.29,
        PAPER,
        { at: [k * 0.02, 0.003 + k * 0.006, 0], rot: [0, k * 0.15, 0] },
        0,
      );
    b.box(0.13, 0.035, 0.04, 0x2a2d33, { at: [0.04, 0.045, 0.02], rot: [0, 0.6, 0] }, 0.01);
  }, 1.1),
  // A small cactus in a white pot.
  prop((b) => {
    b.cylinder(0.05, 0.04, 0.07, 0xe8e6e0, { at: [0, 0.035, 0] }, 14);
    b.capsule(0.03, 0.06, 0x5e8a6a, { at: [0, 0.12, 0] });
    b.capsule(0.015, 0.03, 0x5e8a6a, { at: [0.035, 0.12, 0], rot: [0, 0, -0.6] });
  }, 1.2),
  // A lost visitor badge and a mug.
  prop((b) => {
    b.box(0.07, 0.004, 0.1, 0xf2f2ee, { at: [-0.08, 0.002, 0], rot: [0, 0.4, 0] }, 0);
    b.box(0.06, 0.002, 0.02, VIOLET, { at: [-0.08, 0.005, -0.03], rot: [0, 0.4, 0] }, 0);
    b.torus(0.07, 0.006, VIOLET, { at: [-0.12, 0.006, -0.02], rot: [Math.PI / 2, 0, 0.3] });
    b.cylinder(0.035, 0.032, 0.08, 0x3a5a7a, { at: [0.1, 0.04, 0.02] }, 14);
  }, 1.15),
];

/**
 * The one box of new lanyards (built from the wall top): an open kraft box,
 * violet lanyards spilling over its lip, a few white badge holders.
 */
export const LANYARD_BOX: () => Model = prop((b) => {
  b.box(0.3, 0.14, 0.22, KRAFT, { at: [0, 0.07, 0] }, 0.008);
  b.box(0.27, 0.01, 0.19, 0x7a6448, { at: [0, 0.136, 0] }, 0);
  for (const s of [-1, 1])
    b.box(0.3, 0.008, 0.1, KRAFT, { at: [0, 0.16, s * 0.15], rot: [s * 0.9, 0, 0] }, 0.002);
  for (let k = 0; k < 5; k++)
    b.torus(0.06, 0.008, VIOLET, {
      at: [-0.1 + k * 0.05, 0.15, (k % 2) * 0.03],
      rot: [Math.PI / 2 - 0.3, 0, k * 0.5],
    });
  // Two spilling over the front edge, a badge holder on one.
  b.box(0.02, 0.14, 0.006, VIOLET, { at: [0.06, 0.08, 0.115] }, 0);
  b.box(0.06, 0.08, 0.004, 0xf2f2ee, { at: [0.06, 0.02, 0.12] }, 0.004);
  lettering(b, 'LANYARDS', 0, 0.07, 0.111, 0.0055, INK, 0.002);
}, 1.15);

/** The On Call cat's grey fur, and the lighter grey it shows on Derek's dark chair. */
const CAT_FUR = 0x8a8580;
export const SEGFAULT_FUR = 0x9a9590;

/**
 * Segfault asleep on Derek's leather chair: the On Call cat, a little
 * smaller, curled on the seat, its fur a shade lighter so it reads against
 * the charcoal leather.
 */
export const SEGFAULT_ON_CHAIR: () => Model = () => {
  const m = segfaultCat.model(1);
  const s = 0.95;
  for (const g of [m.body, m.glow, m.glass]) g?.scale(s, s, s);
  const from = new THREE.Color(CAT_FUR);
  const to = new THREE.Color(SEGFAULT_FUR);
  const colors = m.body.getAttribute('color');
  for (let i = 0; i < colors.count; i++)
    if (
      Math.abs(colors.getX(i) - from.r) < 1e-3 &&
      Math.abs(colors.getY(i) - from.g) < 1e-3 &&
      Math.abs(colors.getZ(i) - from.b) < 1e-3
    )
      colors.setXYZ(i, to.r, to.g, to.b);
  colors.needsUpdate = true;
  return m;
};
