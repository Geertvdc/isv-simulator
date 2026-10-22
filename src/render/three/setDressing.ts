import { type Model, ModelBuilder, tint } from './kit';
import { PALETTE } from './look';

/**
 * Props for the world around a level (phase 15): what stands outside the
 * office, per chapter. Each stands on the ground at the origin, fronts
 * toward +z, and takes up `size` tiles (x by z) of ground. Some seat
 * people (`seats`): background characters placed and animated by
 * `surroundings.ts`.
 */

export type SeatPose = 'typing' | 'chatting' | 'idle';

export interface Seat {
  /** Where they stand, in the prop's space; they face `yaw` (0 is +z). */
  at: [number, number];
  yaw: number;
  pose: SeatPose;
}

export interface SetPiece {
  model: () => Model;
  /** Ground it covers, tiles along x and z. */
  size: [number, number];
  seats?: readonly Seat[];
}

const INK = PALETTE.ink;
const DARK = 0x2b2f38;
const WOOD = 0x9a6a42;
const LEAF = 0x4f9d4a;
const LEAF_LIGHT = 0x6cbf5a;
const POT = 0xd0704a;
const WHITE = PALETTE.white;

// ---- Shared bits ----

function plantPot(b: ModelBuilder, x: number, z: number, size = 1): ModelBuilder {
  b.cylinder(0.16 * size, 0.12 * size, 0.28 * size, POT, { at: [x, 0.14 * size, z] });
  b.sphere(0.22 * size, LEAF, { at: [x, 0.42 * size, z] }, [1, 1.1, 1]);
  b.sphere(0.16 * size, LEAF_LIGHT, { at: [x + 0.08 * size, 0.56 * size, z + 0.06 * size] });
  b.sphere(0.13 * size, LEAF, { at: [x - 0.1 * size, 0.6 * size, z - 0.04 * size] });
  return b;
}

/** A desk with a monitor and chair; the person sits at +z, facing the screen (−z). */
function desk(b: ModelBuilder, screen: number, top = 0xe8dcc4): ModelBuilder {
  b.box(1.1, 0.05, 0.6, top, { at: [0, 0.5, -0.1] }, 0.02);
  for (const x of [-0.5, 0.5]) b.box(0.05, 0.5, 0.5, DARK, { at: [x, 0.25, -0.1] }, 0);
  b.box(0.5, 0.32, 0.04, INK, { at: [0, 0.75, -0.3] }, 0.015);
  b.screen(0.44, 0.26, screen, { at: [0, 0.75, -0.277] });
  b.box(0.06, 0.18, 0.04, DARK, { at: [0, 0.6, -0.32] }, 0);
  b.box(0.36, 0.02, 0.12, 0x3a3f4a, { at: [0, 0.535, -0.04] }, 0);
  // The chair pushed back behind where they stand.
  b.box(0.42, 0.08, 0.4, 0x3a3f4a, { at: [0, 0.4, 0.8] }, 0.03);
  b.box(0.42, 0.42, 0.07, 0x3a3f4a, { at: [0, 0.68, 1.0] }, 0.03);
  b.cylinder(0.03, 0.03, 0.3, STEEL, { at: [0, 0.22, 0.8] }, 8);
  b.cylinder(0.2, 0.2, 0.03, DARK, { at: [0, 0.03, 0.8] }, 12);
  return b;
}

const STEEL = 0x8b939e;

// ---- Garage ----

const car: SetPiece = {
  size: [2, 3],
  model: () => {
    const b = new ModelBuilder();
    const paint = 0x9aa4ae;
    b.box(1.5, 0.45, 2.6, paint, { at: [0, 0.42, 0] }, 0.18);
    b.box(1.3, 0.42, 1.4, paint, { at: [0, 0.82, -0.15] }, 0.16);
    b.pane(1.32, 0.34, 1.2, 0xbfe2f0, { at: [0, 0.84, -0.15] });
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
    return b.build();
  },
};

const bike: SetPiece = {
  size: [1, 1],
  model: () => {
    const b = new ModelBuilder();
    for (const z of [-0.3, 0.3]) {
      b.torus(0.18, 0.025, INK, { at: [0, 0.2, z], rot: [0, Math.PI / 2, 0] });
    }
    b.box(0.03, 0.03, 0.6, 0x5a6470, { at: [0, 0.32, 0], rot: [0.3, 0, 0] }, 0);
    b.box(0.03, 0.25, 0.03, 0x5a6470, { at: [0, 0.35, 0.12] }, 0);
    b.box(0.06, 0.03, 0.14, INK, { at: [0, 0.48, 0.1] }, 0);
    b.box(0.32, 0.025, 0.025, STEEL, { at: [0, 0.48, -0.26] }, 0);
    return b.build();
  },
};

const shelves: SetPiece = {
  size: [2, 1],
  model: () => {
    const b = new ModelBuilder();
    for (const x of [-0.85, 0.85]) b.box(0.06, 1.4, 0.4, STEEL, { at: [x, 0.7, 0] }, 0);
    // Cardboard and dull tins: nothing in a player's color.
    const colors = [0xc8955a, 0x9a7a6a, 0x8a96a3, 0xb8a67a, 0x7a8a7a, 0xc8955a];
    for (let s = 0; s < 3; s++) {
      const y = 0.15 + s * 0.45;
      b.box(1.7, 0.04, 0.4, STEEL, { at: [0, y, 0] }, 0);
      for (let i = 0; i < 4; i++) {
        const c = colors[(s * 3 + i) % colors.length] ?? WOOD;
        if ((s + i) % 3 === 0) {
          b.cylinder(0.1, 0.1, 0.2, c, { at: [-0.6 + i * 0.38, y + 0.12, 0] }, 12);
        } else {
          b.box(0.3, 0.26, 0.3, c, { at: [-0.6 + i * 0.38, y + 0.15, 0] }, 0.02);
        }
      }
    }
    return b.build();
  },
};

const tree: SetPiece = {
  size: [2, 2],
  model: () => {
    const b = new ModelBuilder();
    b.cylinder(0.12, 0.16, 1.1, 0x7a5236, { at: [0, 0.55, 0] }, 10);
    b.sphere(0.7, LEAF, { at: [0, 1.4, 0] }, [1, 0.9, 1]);
    b.sphere(0.5, LEAF_LIGHT, { at: [0.35, 1.75, 0.2] });
    b.sphere(0.45, LEAF, { at: [-0.4, 1.65, -0.15] });
    return b.build();
  },
};

const bushes: SetPiece = {
  size: [1, 1],
  model: () => {
    const b = new ModelBuilder();
    b.sphere(0.32, LEAF, { at: [-0.12, 0.25, 0] }, [1, 0.8, 1]);
    b.sphere(0.26, LEAF_LIGHT, { at: [0.2, 0.22, 0.1] }, [1, 0.8, 1]);
    b.sphere(0.06, 0xff6b8a, { at: [0.1, 0.45, 0.2] });
    b.sphere(0.06, 0xffd166, { at: [-0.2, 0.48, 0.1] });
    return b.build();
  },
};

const hoop: SetPiece = {
  size: [1, 1],
  model: () => {
    const b = new ModelBuilder();
    b.cylinder(0.05, 0.05, 2, STEEL, { at: [0, 1, -0.2] }, 10);
    b.box(0.8, 0.55, 0.05, WHITE, { at: [0, 2, -0.1] }, 0.02);
    b.box(0.3, 0.22, 0.01, 0x8a6a5a, { at: [0, 1.92, -0.07] }, 0);
    b.torus(0.18, 0.02, 0xff7a2f, { at: [0, 1.78, 0.12], rot: [Math.PI / 2, 0, 0] });
    b.sphere(0.12, 0xff7a2f, { at: [0.3, 0.12, 0.4] });
    return b.build();
  },
};

const drums: SetPiece = {
  size: [1, 1],
  model: () => {
    const b = new ModelBuilder();
    b.cylinder(0.22, 0.22, 0.6, 0x7a6a5a, { at: [-0.15, 0.3, 0] }, 16);
    b.cylinder(0.2, 0.2, 0.55, 0x6a7a6a, { at: [0.25, 0.28, 0.1] }, 16);
    b.torus(0.21, 0.015, tint(0x7a6a5a, -0.3), { at: [-0.15, 0.45, 0], rot: [Math.PI / 2, 0, 0] });
    return b.build();
  },
};

const cat: SetPiece = {
  size: [1, 1],
  model: () => {
    const b = new ModelBuilder();
    const fur = 0xe08a3a;
    b.box(0.5, 0.06, 0.4, 0x8c5f3d, { at: [0, 0.03, 0] }, 0.02);
    b.sphere(0.16, fur, { at: [0, 0.16, 0] }, [1.3, 0.75, 1]);
    b.sphere(0.1, fur, { at: [0.18, 0.24, 0.05] });
    b.cone(0.04, 0.07, fur, { at: [0.15, 0.34, 0.03] }, 4);
    b.cone(0.04, 0.07, fur, { at: [0.22, 0.34, 0.08] }, 4);
    b.capsule(0.03, 0.22, fur, { at: [-0.22, 0.12, 0.1], rot: [0, 0.6, Math.PI / 2] });
    return b.build();
  },
};

// ---- Startup (a loft) ----

const beanbags: SetPiece = {
  size: [2, 1],
  model: () => {
    const b = new ModelBuilder();
    // Muted purple and teal: never a player's red, blue, yellow or green.
    b.sphere(0.32, 0x7a5a8c, { at: [-0.45, 0.22, 0] }, [1, 0.7, 1]);
    b.sphere(0.3, 0x4f8a80, { at: [0.4, 0.2, 0.1] }, [1, 0.7, 1]);
    b.box(0.6, 0.05, 0.4, WOOD, { at: [0, 0.03, 0.45] }, 0.02);
    return b.build();
  },
};

const pingPong: SetPiece = {
  size: [2, 2],
  model: () => {
    const b = new ModelBuilder();
    b.box(1.5, 0.05, 0.9, 0x2f7a5c, { at: [0, 0.7, 0] }, 0.02);
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
    return b.build();
  },
  seats: [
    { at: [-0.95, 0], yaw: Math.PI / 2, pose: 'chatting' },
    { at: [0.95, 0], yaw: -Math.PI / 2, pose: 'chatting' },
  ],
};

const bigPlant: SetPiece = {
  size: [1, 1],
  model: () => plantPot(new ModelBuilder(), 0, 0, 1.6).build(),
};

const neonSign: SetPiece = {
  size: [2, 1],
  model: () => {
    const b = new ModelBuilder();
    b.box(1.6, 0.8, 0.08, 0x2b2f38, { at: [0, 1.4, 0] }, 0.03);
    for (const x of [-0.7, 0.7]) b.box(0.05, 1.0, 0.05, DARK, { at: [x, 0.5, 0] }, 0);
    // "SHIP IT" as glowing bars, a rocket-ish shape beside it.
    const pink = 0xff4fa3;
    for (let i = 0; i < 6; i++) {
      b.screen(0.16, 0.05, pink, { at: [-0.55 + i * 0.2, 1.55, 0.045] });
      b.screen(0.05, 0.3, i % 2 ? 0x4fe0ff : pink, { at: [-0.55 + i * 0.2, 1.35, 0.045] });
    }
    return b.build();
  },
};

const coffeeBar: SetPiece = {
  size: [2, 1],
  model: () => {
    const b = new ModelBuilder();
    b.box(1.8, 0.9, 0.6, 0x4a3a30, { at: [0, 0.45, 0] }, 0.03);
    b.box(1.9, 0.06, 0.7, 0xe8dcc4, { at: [0, 0.93, 0] }, 0.02);
    // An espresso machine with a glowing dial, cups and a jar of beans.
    b.box(0.5, 0.42, 0.36, STEEL, { at: [-0.4, 1.17, -0.08] }, 0.04);
    b.box(0.42, 0.06, 0.2, DARK, { at: [-0.4, 1.0, 0.1] }, 0);
    b.led(0.04, 0x7cf0c8, { at: [-0.25, 1.3, 0.1] });
    for (let i = 0; i < 3; i++)
      b.cylinder(0.05, 0.04, 0.09, WHITE, { at: [0.15 + i * 0.15, 1.01, 0.1] });
    b.cylinder(0.09, 0.09, 0.22, 0xfff4e0, { at: [0.65, 1.07, -0.1] });
    return b.build();
  },
  seats: [{ at: [0, 0.75], yaw: Math.PI, pose: 'chatting' }],
};

const arcade: SetPiece = {
  size: [1, 1],
  model: () => {
    const b = new ModelBuilder();
    b.box(0.6, 1.5, 0.55, 0x5a4a78, { at: [0, 0.75, 0] }, 0.04);
    b.box(0.5, 0.42, 0.06, INK, { at: [0, 1.15, 0.26] }, 0.01);
    b.screen(0.42, 0.34, 0x5cf0ff, { at: [0, 1.15, 0.295] });
    b.box(0.5, 0.1, 0.25, DARK, { at: [0, 0.8, 0.35] }, 0);
    b.led(0.03, 0xff4f4f, { at: [-0.1, 0.87, 0.4] });
    b.led(0.03, 0xffd166, { at: [0.1, 0.87, 0.4] });
    return b.build();
  },
};

// ---- Scale-up and Enterprise ----

const teamDesk: SetPiece = {
  size: [2, 2],
  model: () => {
    const b = new ModelBuilder();
    b.box(2, 0.02, 1.8, 0x3d4a5a, { at: [0, 0.01, 0] }, 0);
    desk(b, 0x4ee08a);
    plantPot(b, 0.75, -0.6, 0.6);
    return b.build();
  },
  seats: [{ at: [0, 0.25], yaw: Math.PI, pose: 'typing' }],
};

const meetingPod: SetPiece = {
  size: [2, 2],
  model: () => {
    const b = new ModelBuilder();
    b.box(1.8, 0.04, 1.8, 0x5c6b7a, { at: [0, 0.02, 0] }, 0);
    b.cylinder(0.45, 0.45, 0.05, 0xe8dcc4, { at: [0, 0.55, 0] }, 24);
    b.cylinder(0.05, 0.05, 0.5, DARK, { at: [0, 0.28, 0] }, 8);
    for (const x of [-0.85, 0.85]) b.box(0.05, 1.3, 1.7, 0x8fa3b3, { at: [x, 0.65, 0] }, 0);
    b.pane(1.7, 1.2, 0.04, 0xd6f0fa, { at: [0, 0.65, -0.85] });
    b.box(1.75, 0.05, 1.75, 0x8fa3b3, { at: [0, 1.32, 0] }, 0.02);
    return b.build();
  },
  seats: [
    { at: [-0.5, 0.1], yaw: Math.PI / 2, pose: 'chatting' },
    { at: [0.5, -0.1], yaw: -Math.PI / 2, pose: 'chatting' },
  ],
};

const screenWall: SetPiece = {
  size: [2, 1],
  model: () => {
    const b = new ModelBuilder();
    b.box(1.9, 1.3, 0.12, INK, { at: [0, 1.0, 0] }, 0.03);
    for (const x of [-0.6, 0.6]) b.box(0.08, 0.4, 0.08, DARK, { at: [x, 0.2, 0] }, 0);
    for (let i = 0; i < 4; i++) {
      const x = -0.47 + (i % 2) * 0.94;
      const y = 0.72 + Math.floor(i / 2) * 0.58;
      b.screen(0.88, 0.52, 0x1d3a5a, { at: [x, y, 0.065] });
      for (let k = 0; k < 5; k++) {
        const h = 0.08 + ((i * 5 + k * 3) % 7) * 0.05;
        b.screen(0.08, h, i === 2 ? 0xffc04a : 0x5cf0a8, {
          at: [x - 0.3 + k * 0.15, y - 0.2 + h / 2, 0.067],
        });
      }
    }
    return b.build();
  },
};

const sofa: SetPiece = {
  size: [2, 1],
  model: () => {
    const b = new ModelBuilder();
    const fabric = 0x6a7466;
    b.box(1.6, 0.35, 0.7, fabric, { at: [0, 0.25, 0] }, 0.08);
    b.box(1.6, 0.45, 0.2, tint(fabric, -0.15), { at: [0, 0.55, -0.28] }, 0.08);
    for (const x of [-0.78, 0.78])
      b.box(0.18, 0.5, 0.7, tint(fabric, -0.1), { at: [x, 0.35, 0] }, 0.08);
    b.box(0.3, 0.2, 0.08, 0xb89a7a, { at: [-0.4, 0.55, -0.12], rot: [-0.3, 0, 0] }, 0.05);
    return b.build();
  },
};

const cubicle: SetPiece = {
  size: [2, 2],
  model: () => {
    const b = new ModelBuilder();
    const panel = 0x9aa3ad;
    b.box(1.8, 1.1, 0.06, panel, { at: [0, 0.55, -0.85] }, 0.02);
    b.box(0.06, 1.1, 1.7, panel, { at: [-0.88, 0.55, 0] }, 0.02);
    b.box(1.8, 0.05, 0.07, tint(panel, -0.3), { at: [0, 1.12, -0.85] }, 0);
    desk(b, 0x7ab8ff, 0xd8ccb0);
    // A family photo and a stress ball.
    b.box(0.12, 0.15, 0.02, 0x8c5f3d, { at: [0.4, 0.6, -0.3] }, 0);
    b.sphere(0.04, 0xe0402f, { at: [-0.4, 0.56, -0.05] });
    return b.build();
  },
  seats: [{ at: [0, 0.25], yaw: Math.PI, pose: 'typing' }],
};

const waterCooler: SetPiece = {
  size: [2, 1],
  model: () => {
    const b = new ModelBuilder();
    b.box(0.36, 0.9, 0.36, 0xe8ecef, { at: [0, 0.45, 0] }, 0.04);
    b.pane(0.3, 0.42, 0.3, 0x8fd3ff, { at: [0, 1.11, 0] });
    b.box(0.06, 0.05, 0.05, 0x3f86c8, { at: [-0.06, 0.7, 0.19] }, 0);
    b.box(0.06, 0.05, 0.05, 0xe0402f, { at: [0.06, 0.7, 0.19] }, 0);
    return b.build();
  },
  seats: [
    { at: [-0.65, 0.35], yaw: 1.9, pose: 'chatting' },
    { at: [0.65, 0.4], yaw: -1.9, pose: 'chatting' },
  ],
};

const printer: SetPiece = {
  size: [1, 1],
  model: () => {
    const b = new ModelBuilder();
    b.box(0.7, 0.55, 0.55, 0xd8dde2, { at: [0, 0.28, 0] }, 0.04);
    b.box(0.6, 0.18, 0.45, 0xc0c6cc, { at: [0, 0.64, -0.03] }, 0.03);
    b.box(0.4, 0.02, 0.3, WHITE, { at: [0, 0.57, 0.22], rot: [0.2, 0, 0] }, 0);
    b.led(0.025, 0x5cf08a, { at: [0.25, 0.68, 0.2] });
    b.led(0.025, 0xffc04a, { at: [0.18, 0.68, 0.2] });
    return b.build();
  },
};

const cabinets: SetPiece = {
  size: [1, 1],
  model: () => {
    const b = new ModelBuilder();
    for (const x of [-0.22, 0.22]) {
      b.box(0.4, 1.0, 0.5, 0x8a929c, { at: [x, 0.5, 0] }, 0.02);
      for (let d = 0; d < 3; d++) {
        b.box(0.12, 0.03, 0.02, 0xd8dde2, { at: [x, 0.25 + d * 0.3, 0.26] }, 0);
      }
    }
    plantPot(b, 0.22, 0, 0.5).box(0.3, 0.02, 0.2, WHITE, { at: [-0.22, 1.01, 0] }, 0);
    return b.build();
  },
};

const lobbySign: SetPiece = {
  size: [3, 1],
  model: () => {
    const b = new ModelBuilder();
    b.box(2.6, 0.9, 0.5, 0x3a3f4a, { at: [0, 0.45, 0] }, 0.05);
    b.box(2.7, 0.06, 0.6, 0xc8b88a, { at: [0, 0.93, 0] }, 0.02);
    // The corporate logo: a big glowing ring.
    b.torus(0.2, 0.05, 0x7ab8ff, { at: [-0.9, 0.5, 0.26] });
    for (let i = 0; i < 6; i++)
      b.screen(0.18, 0.12, 0xd6e8ff, { at: [-0.45 + i * 0.25, 0.5, 0.255] });
    plantPot(b, 1.15, 0.1, 0.7);
    return b.build();
  },
};

/**
 * What a chapter's world is made of, the ground it stands on (darker than
 * the office floor, so the eye stays inside), and what fills its rows.
 */
export interface Setting {
  ground: number;
  /** A strip along the left of the level (a driveway, an aisle), or none. */
  path: number | null;
  /** Props near the office walls, and further out. */
  near: readonly SetPiece[];
  far: readonly SetPiece[];
  /** Props that show once per level (the car, the cat), at the start of a far row. */
  rare: readonly SetPiece[];
  /** How many background people walk a loop. */
  walkers: number;
}

export const SETTINGS: Readonly<Record<string, Setting>> = {
  garage: {
    ground: 0x3e5a35,
    path: 0x3a3e46,
    near: [shelves, bike, drums],
    far: [tree, bushes],
    rare: [car, cat, hoop],
    walkers: 0,
  },
  startup: {
    // Polished concrete: apart from the wood walls and the slab's edge.
    ground: 0x3a3f47,
    path: null,
    near: [bigPlant, coffeeBar, arcade, beanbags],
    far: [pingPong, sofa],
    rare: [neonSign],
    walkers: 1,
  },
  'scale-up': {
    ground: 0x485666,
    path: 0x3f4b5a,
    near: [teamDesk, sofa, screenWall],
    far: [meetingPod, bigPlant],
    rare: [],
    walkers: 2,
  },
  enterprise: {
    ground: 0x6b6253,
    path: 0x5a5245,
    near: [cubicle, printer, cabinets, waterCooler],
    far: [meetingPod, bigPlant],
    rare: [lobbySign],
    walkers: 2,
  },
};

/** Things on top of full-height walls, picked per wall by a hash. */
export const WALL_TOP_PROPS: readonly (() => Model)[] = [
  () => plantPot(new ModelBuilder(), 0, 0, 0.55).build(),
  () => {
    const b = new ModelBuilder();
    const spines = [0x9a6a5a, 0x5a6a8a, 0xb8a67a, 0x6a7a6a, 0x7a5a8c];
    spines.forEach((c, i) =>
      b.box(0.06, 0.24 - (i % 2) * 0.04, 0.18, c, { at: [-0.14 + i * 0.07, 0.12, 0] }, 0),
    );
    return b.build();
  },
  () =>
    plantPot(new ModelBuilder(), 0, 0, 0.4)
      .cylinder(0.04, 0.035, 0.09, WHITE, { at: [0.2, 0.045, 0.05] })
      .build(),
];
