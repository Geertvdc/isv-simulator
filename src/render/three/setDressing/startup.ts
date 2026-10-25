import { tint } from '../kit';
import {
  books,
  CARDBOARD,
  DARK,
  INK,
  looks,
  mug,
  nth,
  plantPot,
  rack,
  SCREENS,
  SPINES,
  STEEL,
  WHITE,
  WOOD,
  WOOD_LIGHT,
} from './shared';

/** Startup: a loft with coffee, games and a few desks. */

export const beanbags = looks([2, 1], 3, (b, v) => {
  // Muted purple, teal, rust, slate: never a player's red, blue, yellow or green.
  const fabric = [0x7a5a8c, 0x4f8a80, 0xa86a50, 0x5a6a7a, 0x8a7a5a];
  b.sphere(0.32, nth(fabric, v), { at: [-0.45, 0.22, 0] }, [1, 0.7, 1]);
  b.sphere(0.3, nth(fabric, v + 1), { at: [0.4, 0.2, 0.1] }, [1, 0.7, 1]);
  if (v === 2) b.sphere(0.26, nth(fabric, v + 2), { at: [0, 0.18, -0.35] }, [1, 0.7, 1]);
  b.box(0.6, 0.05, 0.4, WOOD, { at: [0, 0.03, 0.45] }, 0.02);
  if (v === 1) b.box(0.3, 0.02, 0.2, 0xc9ccd2, { at: [0.1, 0.06, 0.45] }, 0);
});

export const pingPong = looks(
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

export const bigPlant = looks([1, 1], 10, (b, v) => {
  plantPot(b, 0, 0, 1.3 + (v % 3) * 0.2, v);
});

export const neonSign = looks([2, 1], 1, (b) => {
  b.box(1.6, 0.8, 0.08, 0x2b2f38, { at: [0, 1.4, 0] }, 0.03);
  for (const x of [-0.7, 0.7]) b.box(0.05, 1.0, 0.05, DARK, { at: [x, 0.5, 0] }, 0);
  // "SHIP IT" as glowing bars, a rocket-ish shape beside it.
  const pink = 0xff4fa3;
  for (let i = 0; i < 6; i++) {
    b.screen(0.16, 0.05, pink, { at: [-0.55 + i * 0.2, 1.55, 0.045] });
    b.screen(0.05, 0.3, i % 2 ? 0x4fe0ff : pink, { at: [-0.55 + i * 0.2, 1.35, 0.045] });
  }
});

export const coffeeBar = looks(
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

export const arcade = looks([1, 1], 3, (b, v) => {
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
export const standingDesk = looks(
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

export const bookshelf = looks([2, 1], 3, (b, v) => {
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

export const foosball = looks(
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
export const whiteboardStand = looks([1, 1], 3, (b, v) => {
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

export const fridge = looks([1, 1], 2, (b, v) => {
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

export const highTable = looks(
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

export const serverRack = looks([1, 1], 3, (b, v) => {
  rack(b, 0, 1.2 + v * 0.3, v);
  if (v === 0) b.box(0.3, 0.06, 0.3, CARDBOARD, { at: [0, 1.29, 0] }, 0.01);
  // A cable spool beside the short one.
  if (v === 1) b.torus(0.12, 0.05, 0x3f6a9a, { at: [0.3, 0.17, 0.35], rot: [0, 0.5, 0] });
});

export const miniRamp = looks([2, 1], 2, (b, v) => {
  const ramp = nth([0x8a7a6a, 0x6a7a8a], v);
  for (const s of [-1, 1])
    b.box(0.6, 0.06, 0.8, ramp, { at: [s * 0.55, 0.22, 0], rot: [0, 0, s * 0.55] }, 0.01);
  b.box(0.5, 0.05, 0.8, ramp, { at: [0, 0.03, 0] }, 0);
  b.box(0.6, 0.03, 0.18, nth([0x4a3a5a, 0x5a4a3a], v), { at: [0.1, 0.07, 0.15] }, 0);
  for (const x of [-0.12, 0.32])
    b.cylinder(0.03, 0.03, 0.18, 0xe8e4da, { at: [x, 0.04, 0.15], rot: [Math.PI / 2, 0, 0] }, 8);
});
