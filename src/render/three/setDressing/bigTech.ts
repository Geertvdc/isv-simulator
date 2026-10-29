import { tint } from '../kit';
import { COLOR } from '../palette';
import {
  CARDBOARD,
  DARK,
  FRAMES,
  INK,
  looks,
  mug,
  nth,
  SCREENS,
  STEEL,
  WHITE,
  WOOD,
  WOOD_DARK,
  WOOD_LIGHT,
} from './shared';

/** Big Tech: a campus with lawns. */

export const picnicTable = looks(
  [2, 2],
  4,
  (b, v) => {
    const wood = nth([WOOD, WOOD_LIGHT, COLOR.stone, WOOD_DARK], v);
    b.box(1.4, 0.06, 0.7, wood, { at: [0, 0.62, 0] }, 0.02);
    for (const z of [-0.6, 0.6]) b.box(1.4, 0.05, 0.25, wood, { at: [0, 0.38, z] }, 0.02);
    for (const x of [-0.55, 0.55]) {
      b.box(0.06, 0.62, 0.06, DARK, { at: [x, 0.31, 0] }, 0);
      b.box(0.06, 0.06, 1.4, DARK, { at: [x, 0.3, 0] }, 0);
    }
    // Lunch: laptops open, of course.
    b.box(0.3, 0.02, 0.22, COLOR.aluminium, { at: [-0.3, 0.66, -0.12] }, 0);
    b.screen(0.28, 0.18, nth(SCREENS, v), { at: [-0.3, 0.76, -0.22], rot: [-0.3, 0, 0] });
    mug(b, 0.35, 0.65, 0.1, v);
    if (v % 2 === 1) {
      // A parasol.
      b.cylinder(0.02, 0.02, 1.4, STEEL, { at: [0.05, 1.0, 0] }, 6);
      b.cone(0.85, 0.3, nth([COLOR.parchment, 0x8aa0a0], v), { at: [0.05, 1.75, 0] }, 10);
    }
  },
  [
    { at: [-0.4, 0.85], yaw: Math.PI, pose: 'chatting' },
    { at: [0.4, -0.85], yaw: 0, pose: 'typing' },
  ],
);

export const bikeRack = looks([2, 1], 4, (b, v) => {
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

export const foodTruck = looks(
  [3, 2],
  3,
  (b, v) => {
    const body = nth([COLOR.birch, 0x8aa0a0, 0xc8b8d0], v);
    const trim = nth([COLOR.terracotta, COLOR.petrol, COLOR.plum], v);
    b.box(2.4, 1.3, 1.1, body, { at: [0, 0.85, 0] }, 0.08);
    b.box(2.42, 0.25, 1.12, trim, { at: [0, 0.35, 0] }, 0.04);
    b.box(0.7, 0.9, 1.0, body, { at: [1.45, 0.65, 0] }, 0.08);
    b.screen(0.5, 0.35, 0x9fc4d8, { at: [1.81, 0.85, 0], rot: [0, Math.PI / 2, 0] });
    // The serving hatch, lit, with its awning, and what it sells on the roof.
    b.screen(1.2, 0.45, COLOR.warmLight, { at: [-0.2, 1.05, 0.56] });
    b.box(1.4, 0.04, 0.4, trim, { at: [-0.2, 1.45, 0.72], rot: [0.35, 0, 0] }, 0);
    b.box(1.2, 0.05, 0.2, COLOR.aluminium, { at: [-0.2, 0.8, 0.65] }, 0);
    if (v === 0) {
      b.cylinder(0.22, 0.18, 0.35, WHITE, { at: [-0.4, 1.7, 0] }, 14);
      b.cylinder(0.21, 0.21, 0.03, COLOR.walnut, { at: [-0.4, 1.86, 0] }, 14);
    } else if (v === 1) {
      b.cone(0.25, 0.5, COLOR.honey, { at: [-0.4, 1.78, 0], rot: [Math.PI, 0, 0] }, 12);
      b.sphere(0.22, 0xf0d0e0, { at: [-0.4, 2.05, 0] });
    } else {
      b.box(0.6, 0.25, 0.3, COLOR.ochre, { at: [-0.4, 1.65, 0] }, 0.1);
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

export const fountain = looks([2, 2], 1, (b) => {
  b.cylinder(0.85, 0.9, 0.3, 0xb8b2a6, { at: [0, 0.15, 0] }, 24);
  b.cylinder(0.75, 0.75, 0.04, 0x5aa8d8, { at: [0, 0.29, 0] }, 24);
  b.cylinder(0.12, 0.16, 0.6, 0xb8b2a6, { at: [0, 0.5, 0] }, 12);
  b.cylinder(0.35, 0.3, 0.08, 0xb8b2a6, { at: [0, 0.82, 0] }, 16);
  b.sphere(0.12, 0x9fd4f0, { at: [0, 0.95, 0] }, [1, 1.6, 1]);
});

/** A big abstract sculpture on the lawn: the company logo, a ring on a plinth. */
export const sculpture = looks([2, 2], 1, (b) => {
  b.box(1.0, 0.3, 1.0, 0xb8b2a6, { at: [0, 0.15, 0] }, 0.03);
  b.torus(0.55, 0.12, 0x6a8aa0, { at: [0, 0.95, 0], rot: [0, 0.4, 0] });
  b.sphere(0.18, COLOR.brass, { at: [0, 0.95, 0] });
});

export const bench = looks([2, 1], 3, (b, v) => {
  const wood = nth([WOOD, WOOD_LIGHT, COLOR.stone], v);
  b.box(1.4, 0.05, 0.4, wood, { at: [0, 0.42, 0] }, 0.01);
  if (v !== 2) b.box(1.4, 0.3, 0.05, wood, { at: [0, 0.65, -0.18], rot: [-0.15, 0, 0] }, 0.01);
  for (const x of [-0.6, 0.6]) b.box(0.06, 0.42, 0.38, DARK, { at: [x, 0.21, 0] }, 0);
  if (v === 1) b.box(0.3, 0.02, 0.22, COLOR.lightSteel, { at: [0.3, 0.46, 0.05] }, 0);
});

/** Bins for the campus: compost, recycling, landfill, in muted colors. */
export const sortingBins = looks([1, 1], 2, (b, v) => {
  for (let i = 0; i < 3; i++) {
    const c = nth([0x6a7a5a, COLOR.blueGrey, 0x5a5a5a], i + v);
    b.cylinder(0.12, 0.1, 0.55, c, { at: [-0.28 + i * 0.28, 0.28, 0] }, 12);
    b.cylinder(0.13, 0.13, 0.04, tint(c, -0.25), { at: [-0.28 + i * 0.28, 0.57, 0] }, 12);
  }
});

/** A charging dock with e-scooters. */
export const scooterDock = looks([2, 1], 2, (b, v) => {
  b.box(1.6, 0.06, 0.4, COLOR.pewter, { at: [0, 0.03, 0] }, 0.01);
  b.box(0.12, 0.9, 0.12, COLOR.graphite, { at: [-0.75, 0.45, -0.1] }, 0.02);
  b.screen(0.08, 0.15, COLOR.ledGreen, { at: [-0.75, 0.7, -0.035] });
  for (let i = 0; i < 3 + v; i++) {
    const x = -0.45 + i * 0.32;
    const paint = nth([COLOR.seaGreen, COLOR.blueGrey, COLOR.olive], i + v);
    b.box(0.08, 0.03, 0.42, paint, { at: [x, 0.12, 0] }, 0);
    for (const z of [-0.19, 0.19])
      b.cylinder(0.05, 0.05, 0.03, INK, { at: [x, 0.06, z], rot: [0, 0, Math.PI / 2] }, 8);
    b.box(0.025, 0.55, 0.025, STEEL, { at: [x, 0.38, 0.18], rot: [-0.1, 0, 0] }, 0);
    b.box(0.18, 0.02, 0.02, INK, { at: [x, 0.65, 0.2] }, 0);
  }
});

/** A delivery drone resting on its pad, or a lawn robot out mowing. */
export const dronePad = looks([1, 1], 2, (b, v) => {
  if (v === 1) {
    b.box(0.5, 0.15, 0.4, COLOR.porcelain, { at: [0, 0.12, 0] }, 0.06);
    b.box(0.3, 0.04, 0.25, COLOR.graphite, { at: [0, 0.21, 0] }, 0.02);
    for (const x of [-0.24, 0.24])
      for (const z of [-0.14, 0.14])
        b.cylinder(0.07, 0.07, 0.05, INK, { at: [x, 0.07, z], rot: [0, 0, Math.PI / 2] }, 10);
    b.led(0.025, COLOR.ledGreen, { at: [0.15, 0.24, 0.1] });
    return;
  }
  b.cylinder(0.42, 0.42, 0.04, COLOR.asphalt, { at: [0, 0.02, 0] }, 20);
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
      COLOR.aluminium,
      { at: [Math.cos(a) * 0.22, 0.25, Math.sin(a) * 0.22] },
      12,
    );
  }
  b.led(0.02, COLOR.screenBlue, { at: [0, 0.26, 0.1] });
});

/** Solar panels on a frame, tilted to the sky. */
export const solarPanels = looks([2, 1], 2, (b, v) => {
  const n = 2 + v;
  for (let i = 0; i < n; i++) {
    const x = -0.8 + 0.4 / n + i * (1.6 / n);
    b.box(1.6 / n - 0.05, 0.03, 0.7, COLOR.solarPanel, { at: [x, 0.5, 0], rot: [-0.5, 0, 0] }, 0);
    for (let k = 1; k < 3; k++)
      b.box(
        1.6 / n - 0.05,
        0.035,
        0.012,
        COLOR.hazeBlue,
        { at: [x, 0.5 + (k - 1.5) * 0.11, (k - 1.5) * -0.2], rot: [-0.5, 0, 0] },
        0,
      );
  }
  for (const x of [-0.7, 0.7]) {
    b.box(0.04, 0.6, 0.04, STEEL, { at: [x, 0.3, -0.25] }, 0);
    b.box(0.04, 0.3, 0.04, STEEL, { at: [x, 0.15, 0.25] }, 0);
  }
});

export const lampPost = looks([1, 1], 2, (b, v) => {
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
export const shuttleStop = looks([3, 1], 2, (b, v) => {
  b.box(2.4, 0.06, 0.9, 0x8a8a84, { at: [0, 0.03, 0] }, 0);
  b.box(2.5, 0.06, 1.0, nth([COLOR.graphite, COLOR.greyGreen], v), { at: [0, 1.65, 0] }, 0.02);
  for (const x of [-1.15, 1.15]) b.box(0.05, 1.6, 0.05, DARK, { at: [x, 0.82, -0.35] }, 0);
  b.pane(2.3, 1.4, 0.03, COLOR.glassClear, { at: [0, 0.85, -0.4] });
  b.box(1.4, 0.05, 0.3, WOOD, { at: [0, 0.45, -0.2] }, 0.01);
  b.box(0.5, 0.7, 0.05, INK, { at: [0.9, 0.9, -0.36] }, 0.01);
  b.screen(0.42, 0.6, COLOR.screenBlue, { at: [0.9, 0.9, -0.33] });
});
