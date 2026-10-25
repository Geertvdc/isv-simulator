import { tint } from '../kit';
import {
  books,
  CARDBOARD,
  DARK,
  FRAMES,
  INK,
  LEAF,
  LEAF_DARK,
  LEAF_LIGHT,
  looks,
  nth,
  STEEL,
  WHITE,
  WOOD,
  WOOD_DARK,
  WOOD_LIGHT,
} from './shared';

/** Garage: a suburban street round the founders' garage. */

/** Car paint: dull, never a player's color. */
const CAR_PAINT = [0x9aa4ae, 0x6a7a8a, 0x8a7a6a, 0x5a6a5a, 0xb8b0a0];

export const car = looks([2, 3], 3, (b, v) => {
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

export const bike = looks([1, 1], 4, (b, v) => {
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
export const shelves = looks([2, 1], 4, (b, v) => {
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
export const tree = looks([2, 2], 4, (b, v) => {
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

export const bushes = looks([1, 1], 4, (b, v) => {
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

export const hoop = looks([1, 1], 1, (b) => {
  b.cylinder(0.05, 0.05, 2, STEEL, { at: [0, 1, -0.2] }, 10);
  b.box(0.8, 0.55, 0.05, WHITE, { at: [0, 2, -0.1] }, 0.02);
  b.box(0.3, 0.22, 0.01, 0x8a6a5a, { at: [0, 1.92, -0.07] }, 0);
  b.torus(0.18, 0.02, 0xff7a2f, { at: [0, 1.78, 0.12], rot: [Math.PI / 2, 0, 0] });
  b.sphere(0.12, 0xff7a2f, { at: [0.3, 0.12, 0.4] });
});

export const drums = looks([1, 1], 3, (b, v) => {
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

export const cat = looks([1, 1], 1, (b) => {
  const fur = 0xe08a3a;
  b.box(0.5, 0.06, 0.4, 0x8c5f3d, { at: [0, 0.03, 0] }, 0.02);
  b.sphere(0.16, fur, { at: [0, 0.16, 0] }, [1.3, 0.75, 1]);
  b.sphere(0.1, fur, { at: [0.18, 0.24, 0.05] });
  b.cone(0.04, 0.07, fur, { at: [0.15, 0.34, 0.03] }, 4);
  b.cone(0.04, 0.07, fur, { at: [0.22, 0.34, 0.08] }, 4);
  b.capsule(0.03, 0.22, fur, { at: [-0.22, 0.12, 0.1], rot: [0, 0.6, Math.PI / 2] });
});

/** A workbench: a vise and tools, a PC being built, or a soldering corner. */
export const workbench = looks([2, 1], 3, (b, v) => {
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
export const bins = looks([1, 1], 3, (b, v) => {
  const n = v === 2 ? 1 : 2;
  for (let i = 0; i < n; i++) {
    const c = nth([0x5a6470, 0x4a6a4a, 0x6a5a4a], v + i);
    const x = n === 1 ? 0 : -0.2 + i * 0.4;
    b.box(0.34, 0.6, 0.4, c, { at: [x, 0.32, 0] }, 0.03);
    b.box(0.37, 0.04, 0.44, tint(c, -0.2), { at: [x, 0.64, 0.01] }, 0.01);
    b.cylinder(0.05, 0.05, 0.04, INK, { at: [x - 0.15, 0.05, -0.18], rot: [0, 0, Math.PI / 2] }, 8);
  }
});

export const tires = looks([1, 1], 3, (b, v) => {
  const n = 2 + v;
  for (let i = 0; i < n; i++)
    b.torus(0.26, 0.09, 0x2b2f38, {
      at: [((i * 7) % 3) * 0.02, 0.09 + i * 0.17, 0],
      rot: [Math.PI / 2, 0, 0],
    });
});

/** A pile of old computers: beige towers and a CRT. */
export const oldPCs = looks([1, 1], 2, (b, v) => {
  b.box(0.22, 0.45, 0.45, 0xd8d0b8, { at: [-0.22, 0.23, 0], rot: [0, 0.1 * v, 0] }, 0.02);
  b.box(0.36, 0.3, 0.32, 0xc8c0a8, { at: [0.15, 0.15, 0.05] }, 0.04);
  b.box(0.34, 0.06, 0.12, 0xb8b0a0, { at: [0.15, 0.33, 0.15] }, 0.01);
  if (v === 1) b.box(0.4, 0.06, 0.15, 0xd8d0b8, { at: [0.1, 0.36, -0.1], rot: [0, 0.3, 0] }, 0.01);
  else b.box(0.3, 0.26, 0.28, 0xe0d8c0, { at: [0.15, 0.45, 0.02] }, 0.04);
});

export const shed = looks([2, 2], 3, (b, v) => {
  const wall = nth([0x8a7a6a, 0x6a7a7a, 0x9a8a6a], v);
  const roof = nth([0x5a4a48, 0x4a5a5a, 0x6a4a3a], v);
  b.box(1.5, 1.1, 1.3, wall, { at: [0, 0.55, 0] }, 0.03);
  for (let i = 0; i < 6; i++)
    b.box(0.015, 1.08, 0.01, tint(wall, -0.2), { at: [-0.6 + i * 0.24, 0.55, 0.655] }, 0);
  b.box(1.7, 0.06, 1.55, roof, { at: [0, 1.2, 0], rot: [0.2, 0, 0] }, 0.02);
  b.box(0.5, 0.85, 0.03, tint(wall, -0.25), { at: [-0.3, 0.44, 0.66] }, 0.01);
  if (v !== 1) b.box(0.3, 0.25, 0.02, 0xbfe2f0, { at: [0.4, 0.75, 0.66] }, 0.01);
});

export const fencePanel = looks([2, 1], 2, (b, v) => {
  const c = nth([0xc8b8a0, 0x8a6a4a], v);
  for (const y of [0.22, 0.55]) b.box(1.8, 0.05, 0.04, c, { at: [0, y, -0.05] }, 0);
  for (let i = 0; i < (v ? 6 : 12); i++) {
    const w = v ? 0.28 : 0.1;
    const x = -0.9 + w / 2 + i * (1.8 / (v ? 6 : 12));
    b.box(w, v ? 0.75 : 0.65 + (i % 2) * 0.04, 0.03, c, { at: [x, v ? 0.375 : 0.34, 0] }, 0);
  }
});

export const kennel = looks([1, 1], 2, (b, v) => {
  const c = nth([0xa88a6a, 0x7a8a9a], v);
  b.box(0.6, 0.45, 0.65, c, { at: [0, 0.23, 0] }, 0.02);
  b.box(0.72, 0.05, 0.72, 0x6a4a3a, { at: [0.18, 0.55, 0], rot: [0, 0, -0.6] }, 0);
  b.box(0.72, 0.05, 0.72, 0x6a4a3a, { at: [-0.18, 0.55, 0], rot: [0, 0, 0.6] }, 0);
  b.box(0.24, 0.3, 0.02, INK, { at: [0, 0.18, 0.33] }, 0);
  b.cylinder(0.1, 0.08, 0.05, 0x8a96a3, { at: [0.3, 0.03, 0.42] }, 12);
});
