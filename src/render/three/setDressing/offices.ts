import { tint } from '../kit';
import { COLOR } from '../palette';
import {
  books,
  CARDBOARD,
  DARK,
  desk,
  INK,
  looks,
  mug,
  nth,
  plantPot,
  WHITE,
  WOOD_DARK,
  WOOD_LIGHT,
} from './shared';

/** Scale-Up and Enterprise: office floors, cubicles and meeting pods. */

export const teamDesk = looks(
  [2, 2],
  8,
  (b, v) => {
    b.box(2, 0.02, 1.8, nth([0x3d4a5a, 0x4a4a52, 0x3d5250], v), { at: [0, 0.01, 0] }, 0);
    desk(b, v);
    plantPot(b, 0.75, -0.6, 0.6, v + 2);
  },
  [{ at: [0, 0.25], yaw: Math.PI, pose: 'typing' }],
);

export const meetingPod = looks(
  [2, 2],
  3,
  (b, v) => {
    const panel = nth([0x8fa3b3, 0x8a8a9a, 0x9aa89a], v);
    b.box(1.8, 0.04, 1.8, nth([0x5c6b7a, 0x6a5c5a, COLOR.greyGreen], v), { at: [0, 0.02, 0] }, 0);
    if (v === 1) b.box(1.0, 0.05, 0.6, WOOD_LIGHT, { at: [0, 0.55, 0] }, 0.02);
    else b.cylinder(0.45, 0.45, 0.05, COLOR.birch, { at: [0, 0.55, 0] }, 24);
    b.cylinder(0.05, 0.05, 0.5, DARK, { at: [0, 0.28, 0] }, 8);
    for (const x of [-0.85, 0.85]) b.box(0.05, 1.3, 1.7, panel, { at: [x, 0.65, 0] }, 0);
    b.pane(1.7, 1.2, 0.04, COLOR.glassClear, { at: [0, 0.65, -0.85] });
    b.box(1.75, 0.05, 1.75, panel, { at: [0, 1.32, 0] }, 0.02);
    if (v === 2) plantPot(b, 0.6, -0.6, 0.5, 3);
    if (v === 0) b.screen(0.6, 0.35, COLOR.screenBlue, { at: [0, 0.9, -0.82] });
  },
  [
    { at: [-0.5, 0.1], yaw: Math.PI / 2, pose: 'chatting' },
    { at: [0.5, -0.1], yaw: -Math.PI / 2, pose: 'chatting' },
  ],
);

/** A wall of screens: bar charts, a line graph, a map of the servers, a deploy board. */
export const screenWall = looks([2, 1], 4, (b, v) => {
  b.box(1.9, 1.3, 0.12, INK, { at: [0, 1.0, 0] }, 0.03);
  for (const x of [-0.6, 0.6]) b.box(0.08, 0.4, 0.08, DARK, { at: [x, 0.2, 0] }, 0);
  for (let i = 0; i < 4; i++) {
    const x = -0.47 + (i % 2) * 0.94;
    const y = 0.72 + Math.floor(i / 2) * 0.58;
    b.screen(0.88, 0.52, COLOR.screenNavy, { at: [x, y, 0.065] });
    const kind = (i + v) % 4;
    if (kind === 0) {
      for (let k = 0; k < 5; k++) {
        const h = 0.08 + ((i * 5 + k * 3 + v) % 7) * 0.05;
        b.screen(0.08, h, i === 2 ? COLOR.amber : COLOR.screenMint, {
          at: [x - 0.3 + k * 0.15, y - 0.2 + h / 2, 0.067],
        });
      }
    } else if (kind === 1) {
      for (let k = 0; k < 6; k++) {
        const a = Math.sin(k * 1.3 + v) * 0.08;
        b.screen(0.14, 0.02, COLOR.screenBlue, {
          at: [x - 0.32 + k * 0.13, y + a, 0.067],
          rot: [0, 0, Math.cos(k * 1.3 + v) * 0.5],
        });
      }
    } else if (kind === 2) {
      for (let k = 0; k < 9; k++)
        b.screen(0.04, 0.04, k % 4 === 0 ? COLOR.coral : COLOR.screenMint, {
          at: [x - 0.3 + ((k * 37) % 60) / 100, y - 0.15 + ((k * 23) % 30) / 100, 0.067],
        });
    } else {
      for (let k = 0; k < 4; k++)
        b.screen(0.7, 0.06, k === 1 ? COLOR.amber : COLOR.screenMint, {
          at: [x, y + 0.16 - k * 0.11, 0.067],
        });
    }
  }
});

export const sofa = looks([2, 1], 4, (b, v) => {
  const fabric = nth([0x6a7466, 0x6a5a6a, COLOR.blueGrey, 0x8a7a64], v);
  b.box(1.6, 0.35, 0.7, fabric, { at: [0, 0.25, 0] }, 0.08);
  b.box(1.6, 0.45, 0.2, tint(fabric, -0.15), { at: [0, 0.55, -0.28] }, 0.08);
  for (const x of [-0.78, 0.78])
    b.box(0.18, 0.5, 0.7, tint(fabric, -0.1), { at: [x, 0.35, 0] }, 0.08);
  // Cushions, or a laptop left on the seat.
  if (v % 2 === 0)
    b.box(0.3, 0.2, 0.08, 0xb89a7a, { at: [-0.4, 0.55, -0.12], rot: [-0.3, 0, 0] }, 0.05);
  else b.box(0.3, 0.02, 0.2, COLOR.lightSteel, { at: [0.3, 0.44, 0.05] }, 0);
  if (v === 2)
    b.box(0.28, 0.2, 0.08, COLOR.parchment, { at: [0.45, 0.55, -0.12], rot: [-0.3, 0, 0] }, 0.05);
});

export const cubicle = looks(
  [2, 2],
  6,
  (b, v) => {
    const panel = nth([COLOR.silver, 0x9a9488, 0x8a9aa0], v);
    b.box(1.8, 1.1, 0.06, panel, { at: [0, 0.55, -0.85] }, 0.02);
    b.box(0.06, 1.1, 1.7, panel, { at: [v % 2 ? 0.88 : -0.88, 0.55, 0] }, 0.02);
    b.box(1.8, 0.05, 0.07, tint(panel, -0.3), { at: [0, 1.12, -0.85] }, 0);
    desk(b, v + 1, [COLOR.oatmeal, 0xc8c0b0, 0xe0d8c8]);
    // A family photo, a stress ball, a calendar pinned up.
    b.box(0.12, 0.15, 0.02, COLOR.woodFrame, { at: [0.4, 0.6, -0.3] }, 0);
    if (v % 3 === 0) b.sphere(0.04, COLOR.dustyRose, { at: [-0.4, 0.56, -0.05] });
    if (v % 3 === 1) b.box(0.25, 0.3, 0.01, WHITE, { at: [-0.5, 0.95, -0.81] }, 0);
    if (v % 3 === 2) b.box(0.12, 0.12, 0.01, COLOR.noteYellow, { at: [0.6, 0.9, -0.81] }, 0);
  },
  [{ at: [0, 0.25], yaw: Math.PI, pose: 'typing' }],
);

export const waterCooler = looks(
  [2, 1],
  2,
  (b, v) => {
    b.box(0.36, 0.9, 0.36, nth([0xe8ecef, COLOR.aluminium], v), { at: [0, 0.45, 0] }, 0.04);
    b.pane(0.3, 0.42, 0.3, COLOR.noteBlue, { at: [0, 1.11, 0] });
    b.box(0.06, 0.05, 0.05, 0x3f86c8, { at: [-0.06, 0.7, 0.19] }, 0);
    b.box(0.06, 0.05, 0.05, COLOR.signalRed, { at: [0.06, 0.7, 0.19] }, 0);
    if (v === 1) b.cylinder(0.12, 0.1, 0.3, COLOR.pewter, { at: [0.45, 0.15, 0] }, 12);
  },
  [
    { at: [-0.65, 0.35], yaw: 1.9, pose: 'chatting' },
    { at: [0.65, 0.4], yaw: -1.9, pose: 'chatting' },
  ],
);

export const printer = looks([1, 1], 3, (b, v) => {
  if (v === 2) {
    // The big copier.
    b.box(0.8, 0.85, 0.6, 0xd8dde2, { at: [0, 0.43, 0] }, 0.04);
    b.box(0.7, 0.08, 0.5, 0xc0c6cc, { at: [0, 0.9, 0] }, 0.02);
    b.box(0.3, 0.02, 0.2, WHITE, { at: [0.45, 0.6, 0.1] }, 0);
    b.screen(0.15, 0.08, COLOR.screenBlue, { at: [0.25, 0.9, 0.26], rot: [-0.6, 0, 0] });
    return;
  }
  b.box(0.7, 0.55, 0.55, v ? COLOR.pewter : 0xd8dde2, { at: [0, 0.28, 0] }, 0.04);
  b.box(0.6, 0.18, 0.45, v ? COLOR.slate : 0xc0c6cc, { at: [0, 0.64, -0.03] }, 0.03);
  b.box(0.4, 0.02, 0.3, WHITE, { at: [0, 0.57, 0.22], rot: [0.2, 0, 0] }, 0);
  b.led(0.025, COLOR.ledGreen, { at: [0.25, 0.68, 0.2] });
  b.led(0.025, COLOR.amber, { at: [0.18, 0.68, 0.2] });
});

export const cabinets = looks([1, 1], 4, (b, v) => {
  const metal = nth([COLOR.aluminium, 0x9a9488, COLOR.metalGrey, 0xa0a8b0], v);
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

export const lobbySign = looks([3, 1], 1, (b) => {
  b.box(2.6, 0.9, 0.5, COLOR.graphite, { at: [0, 0.45, 0] }, 0.05);
  b.box(2.7, 0.06, 0.6, 0xc8b88a, { at: [0, 0.93, 0] }, 0.02);
  // The corporate logo: a big glowing ring.
  b.torus(0.2, 0.05, COLOR.screenBlue, { at: [-0.9, 0.5, 0.26] });
  for (let i = 0; i < 6; i++)
    b.screen(0.18, 0.12, 0xd6e8ff, { at: [-0.45 + i * 0.25, 0.5, 0.255] });
  plantPot(b, 1.15, 0.1, 0.7);
});

export const vending = looks([1, 1], 2, (b, v) => {
  b.box(0.75, 1.6, 0.6, nth([0x6a4a5a, COLOR.petrol], v), { at: [0, 0.8, 0] }, 0.04);
  b.screen(0.48, 1.05, 0xe8f0ff, { at: [-0.08, 0.95, 0.305] });
  for (let s = 0; s < 5; s++)
    for (let i = 0; i < 4; i++)
      b.box(
        0.08,
        0.12,
        0.05,
        nth([0xe0a050, COLOR.pistachio, 0xd07a6a, COLOR.lilac, 0x8ab0e0], s * 2 + i + v),
        {
          at: [-0.26 + i * 0.12, 0.55 + s * 0.2, 0.26],
        },
        0,
      );
  b.box(0.14, 0.3, 0.02, INK, { at: [0.27, 1.0, 0.31] }, 0);
  b.box(0.5, 0.12, 0.02, INK, { at: [-0.08, 0.25, 0.31] }, 0);
});

export const coatRack = looks([1, 1], 2, (b, v) => {
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
    nth([COLOR.umber, COLOR.slate], v),
    { at: [0.1, 1.2, 0.08], rot: [0, 0.3, 0] },
    0.05,
  );
  if (v === 1) b.sphere(0.1, COLOR.hazel, { at: [-0.1, 1.62, 0] }, [1.2, 0.6, 1.2]);
  else b.box(0.12, 0.4, 0.03, 0x8a3a3a, { at: [-0.12, 1.3, 0.05] }, 0);
});

export const shredder = looks([1, 1], 2, (b, v) => {
  b.box(0.45, 0.6, 0.35, COLOR.slate, { at: [-0.15, 0.3, 0] }, 0.03);
  b.box(0.45, 0.08, 0.35, DARK, { at: [-0.15, 0.64, 0] }, 0.02);
  b.led(0.02, COLOR.ledGreen, { at: [-0.0, 0.66, 0.18] });
  b.cylinder(0.15, 0.12, 0.42, nth([COLOR.pewter, COLOR.sage], v), { at: [0.25, 0.21, 0.15] }, 12);
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

export const lockers = looks([2, 1], 2, (b, v) => {
  const metal = nth([COLOR.stormGrey, COLOR.stone], v);
  for (let i = 0; i < 4; i++) {
    const x = -0.6 + i * 0.4;
    b.box(0.38, 1.6, 0.45, metal, { at: [x, 0.8, 0] }, 0.02);
    for (let k = 0; k < 3; k++)
      b.box(0.2, 0.015, 0.01, tint(metal, -0.3), { at: [x, 1.3 + k * 0.05, 0.23] }, 0);
    b.box(0.03, 0.12, 0.02, 0xd8dde2, { at: [x + 0.12, 0.85, 0.23] }, 0);
  }
  if (v === 1) b.box(0.4, 0.3, 0.35, CARDBOARD, { at: [-0.2, 1.75, 0] }, 0.02);
});

export const kitchenIsland = looks(
  [2, 1],
  2,
  (b, v) => {
    b.box(1.6, 0.85, 0.6, nth([COLOR.slate, COLOR.putty], v), { at: [0, 0.43, 0] }, 0.03);
    b.box(1.7, 0.05, 0.7, nth([COLOR.porcelain, 0x5a5a58], v), { at: [0, 0.88, 0] }, 0.02);
    b.cylinder(0.16, 0.12, 0.08, WHITE, { at: [-0.4, 0.95, 0] }, 14);
    for (const [x, z, c] of [
      [-0.45, 0.04, COLOR.ochre],
      [-0.36, -0.05, COLOR.grassGreen],
      [-0.4, 0.02, COLOR.terracotta],
    ] as const)
      b.sphere(0.05, c, { at: [x, 1.0, z] });
    mug(b, 0.2, 0.9, 0.1, v);
    mug(b, 0.4, 0.9, -0.05, v + 1);
  },
  [{ at: [0.3, 0.65], yaw: Math.PI, pose: 'chatting' }],
);

export const phoneBooth = looks([1, 1], 3, (b, v) => {
  const shell = nth([COLOR.blueGrey, COLOR.taupe, 0x4a5a52], v);
  b.box(0.85, 1.9, 0.85, shell, { at: [0, 0.95, -0.02] }, 0.04);
  b.pane(0.7, 1.5, 0.02, COLOR.glassClear, { at: [0, 0.95, 0.42] });
  b.box(0.75, 1.6, 0.78, tint(shell, -0.4), { at: [0, 0.95, 0.0] }, 0);
  b.box(0.4, 0.04, 0.25, WOOD_LIGHT, { at: [0, 0.95, -0.2] }, 0.01);
  b.led(0.04, v === 1 ? COLOR.coral : COLOR.ledGreen, { at: [0.3, 1.82, 0.43] });
});
