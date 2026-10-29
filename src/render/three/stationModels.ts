import type { BlockTile } from '../../sim/level';
import { type Model, ModelBuilder, tint } from './kit';
import { STATION_HEIGHT } from './layout';
import { PALETTE } from './look';
import { COLOR } from './palette';

/**
 * The office kit: every prop built in code from the kit's rounded boxes and
 * cylinders. Each model stands on the floor at the origin, fills one tile
 * and faces the camera (+z), which is where the player stands to work it.
 * Station tops are at `STATION_HEIGHT`, where tickets lie, and props on
 * them stay at the back so a ticket in the middle is never hidden.
 */

const TOP = STATION_HEIGHT;
const TOP_THICKNESS = 0.07;
const INK = PALETTE.ink;
const DARK = COLOR.charcoal;
const STEEL = COLOR.steel;

/** Tiles that get a station model: counters and stations (walls, belts and drops have their own). */
export type StationTile = Exclude<BlockTile, 'wall' | 'conveyor'>;

/**
 * A station: the `base` (counter and what lies on it) turns to face the
 * floor it's worked from; the `hero` prop that says what the station is
 * (a monitor, a magnifier, a mailbox) stands at `heroAt` on it, in the
 * station's own space, and turns toward the camera instead, so it never
 * shows its back or its edge.
 */
export interface StationModel {
  base: Model;
  hero: Model | null;
  /** Where the hero stands on the top, x and z in the station's space (front is +z). */
  heroAt: [number, number];
}

/**
 * The counter every station is built on: a body in `color` with a top
 * overhanging the front. Stations get a light top in their own color, so
 * they read from above; plain counters a laminate one.
 */
function counter(b: ModelBuilder, color: number, top: number = stationTop(color)): ModelBuilder {
  const bodyH = TOP - TOP_THICKNESS;
  // Kick plinth, set back and dark, so the counter seems to float a little.
  b.slab(0.86, 0.06, 0.8, tint(color, -0.55), 0, 0, -0.02);
  b.slab(0.94, bodyH - 0.06, 0.88, color, 0, 0.06, -0.01);
  // Two doors with a seam and handles on the front.
  b.slab(0.012, bodyH - 0.14, 0.01, tint(color, -0.35), 0, 0.1, 0.435);
  for (const x of [-0.08, 0.08]) {
    b.box(0.03, 0.12, 0.02, tint(color, 0.5), { at: [x, bodyH - 0.12, 0.445] }, 0.008);
  }
  b.box(1, TOP_THICKNESS, 0.98, top, { at: [0, TOP - TOP_THICKNESS / 2, 0.005] }, 0.02);
  return b;
}

function stationTop(color: number): number {
  return tint(color, 0.4);
}

/** A big monitor on a stand, its foot at the origin, screen toward +z, in `glow`. */
function monitor(b: ModelBuilder, w: number, h: number, glow: number, x = 0): ModelBuilder {
  b.cylinder(0.11, 0.13, 0.025, DARK, { at: [x, TOP + 0.012, 0] });
  b.box(0.05, 0.16, 0.04, DARK, { at: [x, TOP + 0.1, -0.01] }, 0.012);
  const cy = TOP + 0.17 + h / 2;
  b.box(w + 0.06, h + 0.06, 0.05, INK, { at: [x, cy, 0] }, 0.02);
  b.screen(w, h, glow, { at: [x, cy, 0.027] });
  return b;
}

function keyboardStation(): StationModel {
  const color = PALETTE.station.keyboard;
  const base = counter(new ModelBuilder(), color);
  // A wide keyboard with colored keycaps, a mouse and a mug, in front of the screen.
  base.box(0.56, 0.035, 0.2, COLOR.graphite, { at: [-0.04, TOP + 0.018, 0.08] }, 0.012);
  const caps = [COLOR.white, COLOR.amber, 0x5cc8f0, COLOR.white];
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 8; c++) {
      const cap = caps[(r * 3 + c) % caps.length] ?? COLOR.white;
      base.box(
        0.05,
        0.02,
        0.045,
        r === 2 && c > 1 && c < 6 ? COLOR.white : cap,
        {
          at: [-0.04 - 0.21 + c * 0.06, TOP + 0.045, 0.02 + r * 0.06],
        },
        0,
      );
    }
  }
  base.sphere(0.045, COLOR.graphite, { at: [0.33, TOP + 0.02, 0.1] }, [0.8, 0.45, 1.2]);
  base.cylinder(0.06, 0.055, 0.13, 0xffffff, { at: [0.36, TOP + 0.065, -0.25] });
  base.torus(0.04, 0.013, 0xffffff, { at: [0.42, TOP + 0.07, -0.25], rot: [0, 0, Math.PI / 2] });
  base.cylinder(0.05, 0.05, 0.004, COLOR.coffee, { at: [0.36, TOP + 0.128, -0.25] });

  const hero = monitor(new ModelBuilder(), 0.58, 0.36, COLOR.codeGreen);
  // Lines of "code", brighter, and a cursor.
  const lines = [0.32, 0.42, 0.2, 0.36, 0.26];
  lines.forEach((w, i) => {
    hero.screen(w, 0.03, i % 2 ? 0xdcfff0 : 0xffe48a, {
      at: [-0.26 + w / 2 + (i % 3) * 0.04, TOP + 0.47 - i * 0.06, 0.029],
    });
  });
  return { base: base.build(), hero: hero.build(), heroAt: [-0.04, -0.3] };
}

function testBench(): StationModel {
  const color = PALETTE.station.testBench;
  const base = counter(new ModelBuilder(), color);
  // A rack of test tubes with green liquid, front left.
  base.box(0.34, 0.05, 0.1, COLOR.woodFrame, { at: [-0.2, TOP + 0.025, 0.2] }, 0.01);
  for (let i = 0; i < 4; i++) {
    const x = -0.32 + i * 0.08;
    base.cylinder(0.025, 0.025, 0.18, 0xe8f6ff, { at: [x, TOP + 0.1, 0.2] }, 10);
    base.cylinder(
      0.022,
      0.022,
      0.1 - (i % 2) * 0.03,
      i === 2 ? 0xff5f57 : COLOR.ledGreen,
      {
        at: [x, TOP + 0.06, 0.2],
      },
      10,
    );
  }
  // The hero: a pass/fail light tower, red over green, and a small screen.
  const hero = new ModelBuilder();
  hero.cylinder(0.12, 0.14, 0.03, DARK, { at: [0, TOP + 0.015, 0] });
  hero.cylinder(0.03, 0.03, 0.42, STEEL, { at: [0, TOP + 0.21, 0] }, 10);
  hero.box(0.22, 0.36, 0.14, INK, { at: [0, TOP + 0.5, 0] }, 0.04);
  hero.led(0.075, 0xff5f57, { at: [0, TOP + 0.6, 0.06] });
  hero.led(0.075, 0x4ef07a, { at: [0, TOP + 0.41, 0.06] });
  return { base: base.build(), hero: hero.build(), heroAt: [0.22, -0.26] };
}

function reviewStation(): StationModel {
  const color = PALETTE.station.review;
  const base = counter(new ModelBuilder(), color);
  // A pile of printouts with red marks and a fat red pen.
  for (let i = 0; i < 4; i++) {
    base.box(
      0.3,
      0.014,
      0.36,
      COLOR.paper,
      {
        at: [-0.24, TOP + 0.007 + i * 0.015, -0.2],
        rot: [0, i % 2 ? 0.08 : -0.05, 0],
      },
      0,
    );
  }
  base.box(0.16, 0.006, 0.02, COLOR.signalRed, { at: [-0.22, TOP + 0.068, -0.18] }, 0);
  base.box(0.1, 0.006, 0.02, COLOR.signalRed, { at: [-0.26, TOP + 0.068, -0.12] }, 0);
  base.capsule(0.025, 0.24, COLOR.signalRed, {
    at: [0.25, TOP + 0.03, 0.22],
    rot: [0, 0, Math.PI / 2 - 0.3],
  });
  // The hero: a big magnifying glass standing up on a foot.
  const hero = new ModelBuilder();
  hero.cylinder(0.11, 0.13, 0.03, 0x3a2a1a, { at: [0, TOP + 0.015, 0] });
  hero.box(0.045, 0.24, 0.045, 0x3a2a1a, { at: [0, TOP + 0.13, 0] }, 0.015);
  hero.torus(0.17, 0.035, 0xc89a3a, { at: [0, TOP + 0.42, 0] });
  hero.pane(0.3, 0.3, 0.01, 0xcfefff, { at: [0, TOP + 0.42, 0] });
  hero.screen(0.06, 0.12, 0xffffff, { at: [-0.06, TOP + 0.46, 0.01], rot: [0, 0, 0.5] });
  return { base: base.build(), hero: hero.build(), heroAt: [0.18, -0.26] };
}

/** The pipeline's build server stands here on the top (station space); `WorldFx` puts its alarm there. */
export const PIPELINE_SERVER_AT: [number, number] = [0, -0.3];

function pipelineStation(): StationModel {
  const color = PALETTE.station.pipeline;
  const base = counter(new ModelBuilder(), color);
  // A conveyor across the top, with rollers peeking out at the ends and hazard stripes.
  base.box(0.98, 0.035, 0.5, DARK, { at: [0, TOP + 0.018, 0.12] }, 0.01);
  for (const x of [-0.47, 0.47]) {
    base.cylinder(0.04, 0.04, 0.52, STEEL, {
      at: [x, TOP + 0.018, 0.12],
      rot: [Math.PI / 2, 0, 0],
    });
  }
  for (let i = 0; i < 6; i++) {
    base.box(0.03, 0.006, 0.46, COLOR.asphalt, { at: [-0.4 + i * 0.16, TOP + 0.038, 0.12] }, 0);
  }
  // The hero: a chunky build server with blinking lights.
  const hero = new ModelBuilder();
  hero.box(0.62, 0.42, 0.24, COLOR.graphite, { at: [0, TOP + 0.21, 0] }, 0.03);
  for (let i = 0; i < 3; i++) {
    const y = TOP + 0.09 + i * 0.12;
    hero.box(0.54, 0.08, 0.01, INK, { at: [0, y, 0.122] }, 0);
    hero.led(0.022, i === 1 ? COLOR.amber : 0x4ef07a, { at: [0.2, y, 0.13] });
    hero.led(0.022, 0x4ef07a, { at: [0.14, y, 0.13] });
  }
  return { base: base.build(), hero: hero.build(), heroAt: PIPELINE_SERVER_AT };
}

/** A tray in the middle of the top for queued tickets: a dark floor, so any folder stands out. */
function trayStation(color: number): ModelBuilder {
  const b = counter(new ModelBuilder(), color);
  const wall = tint(color, -0.25);
  b.box(0.6, 0.012, 0.48, DARK, { at: [0, TOP + 0.006, 0.02] }, 0);
  b.box(0.66, 0.06, 0.04, wall, { at: [0, TOP + 0.03, 0.27] }, 0.012);
  b.box(0.66, 0.06, 0.04, wall, { at: [0, TOP + 0.03, -0.23] }, 0.012);
  b.box(0.04, 0.06, 0.5, wall, { at: [-0.32, TOP + 0.03, 0.02] }, 0.012);
  b.box(0.04, 0.06, 0.5, wall, { at: [0.32, TOP + 0.03, 0.02] }, 0.012);
  return b;
}

function inboxStation(): StationModel {
  const base = trayStation(PALETTE.station.inbox);
  // The hero: a mailbox on a post with its red flag up.
  const hero = new ModelBuilder();
  const blue = tint(PALETTE.station.inbox, -0.2);
  hero.box(0.05, 0.16, 0.05, DARK, { at: [0, TOP + 0.08, 0] }, 0.015);
  hero.box(0.22, 0.16, 0.3, blue, { at: [0, TOP + 0.24, 0] }, 0.04);
  hero.cylinder(0.11, 0.11, 0.3, blue, { at: [0, TOP + 0.32, 0], rot: [Math.PI / 2, 0, 0] }, 20);
  hero.box(0.16, 0.02, 0.01, INK, { at: [0, TOP + 0.33, 0.152] }, 0);
  hero.box(0.02, 0.18, 0.02, COLOR.signalRed, { at: [0.13, TOP + 0.36, -0.06] }, 0);
  hero.box(0.02, 0.07, 0.1, COLOR.signalRed, { at: [0.13, TOP + 0.42, -0.02] }, 0);
  // A letter sticking out.
  hero.box(0.14, 0.1, 0.01, COLOR.paper, { at: [0, TOP + 0.45, 0.06], rot: [-0.3, 0, 0] }, 0);
  return { base: base.build(), hero: hero.build(), heroAt: [0.36, -0.3] };
}

function bugQueueStation(): StationModel {
  const base = trayStation(PALETTE.station.bugQueue);
  // The hero: a big friendly ladybug-like bug, front toward the camera.
  const hero = new ModelBuilder();
  const bug = DARK;
  hero.sphere(0.15, bug, { at: [0, TOP + 0.12, -0.03] }, [1, 0.62, 1.2]);
  hero.sphere(0.135, COLOR.signalRed, { at: [0, TOP + 0.17, -0.04] }, [1.05, 0.5, 1.15]);
  for (const [x, z] of [
    [-0.06, -0.08],
    [0.06, -0.02],
    [-0.03, 0.05],
  ] as const) {
    hero.sphere(0.03, bug, { at: [x, TOP + 0.235, z] }, [1, 0.4, 1]);
  }
  hero.sphere(0.075, bug, { at: [0, TOP + 0.15, 0.17] });
  for (const s of [-1, 1]) {
    hero.sphere(0.025, 0xffffff, { at: [s * 0.035, TOP + 0.17, 0.235] });
    hero.sphere(0.012, INK, { at: [s * 0.035, TOP + 0.17, 0.257] });
    hero.cylinder(
      0.008,
      0.008,
      0.16,
      bug,
      { at: [s * 0.04, TOP + 0.26, 0.2], rot: [0.5, 0, s * 0.35] },
      6,
    );
    hero.sphere(0.02, bug, { at: [s * 0.07, TOP + 0.33, 0.24] });
    for (let i = 0; i < 3; i++) {
      hero.cylinder(
        0.012,
        0.012,
        0.14,
        bug,
        {
          at: [s * 0.15, TOP + 0.06, -0.1 + i * 0.09],
          rot: [0, 0, s * 1.1],
        },
        6,
      );
    }
  }
  return { base: base.build(), hero: hero.build(), heroAt: [0.3, -0.28] };
}

function shipStation(): StationModel {
  const color = PALETTE.station.ship;
  const base = counter(new ModelBuilder(), color);
  // A chute in the top, edged in yellow and black hazard stripes.
  base.box(0.6, 0.014, 0.5, INK, { at: [0, TOP + 0.003, 0.08] }, 0);
  for (let i = 0; i < 8; i++) {
    const c = i % 2 ? INK : COLOR.gold;
    base.box(0.085, 0.03, 0.05, c, { at: [-0.3 + i * 0.085 + 0.04, TOP + 0.015, 0.355] }, 0);
    base.box(0.085, 0.03, 0.05, c, { at: [-0.3 + i * 0.085 + 0.04, TOP + 0.015, -0.195] }, 0);
  }
  // A big red mushroom button, front right.
  base.cylinder(0.09, 0.1, 0.05, 0xd8d2c6, { at: [0.38, TOP + 0.025, 0.36] });
  base.sphere(0.085, COLOR.signalRed, { at: [0.38, TOP + 0.07, 0.36] }, [1, 0.55, 1]);
  // The hero: a parcel with tape, ready to go.
  const hero = new ModelBuilder();
  hero.box(0.36, 0.28, 0.3, COLOR.cardboard, { at: [0, TOP + 0.14, 0] }, 0.02);
  hero.box(0.37, 0.02, 0.06, 0xe8d4a8, { at: [0, TOP + 0.281, 0] }, 0);
  hero.box(0.06, 0.29, 0.305, 0xe8d4a8, { at: [0, TOP + 0.14, 0] }, 0);
  hero.box(0.1, 0.07, 0.005, 0xffffff, { at: [-0.1, TOP + 0.16, 0.152] }, 0);
  return { base: base.build(), hero: hero.build(), heroAt: [-0.32, -0.3] };
}

function plainCounter(): StationModel {
  return {
    base: counter(new ModelBuilder(), PALETTE.counterFront, PALETTE.counterTop).build(),
    hero: null,
    heroAt: [0, 0],
  };
}

function bin(): StationModel {
  const b = new ModelBuilder();
  // A recycling bin, wide enough to read from across the room, lid half open.
  const color = 0x3f9a5c;
  const h = TOP - 0.04;
  b.cylinder(0.34, 0.28, h, color, { at: [0, h / 2, 0] }, 24);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    b.box(
      0.04,
      h - 0.1,
      0.04,
      tint(color, -0.3),
      {
        at: [Math.cos(a) * 0.315, h / 2, Math.sin(a) * 0.315],
      },
      0,
    );
  }
  b.torus(0.33, 0.03, tint(color, 0.25), { at: [0, h, 0], rot: [Math.PI / 2, 0, 0] });
  b.cylinder(
    0.33,
    0.33,
    0.04,
    tint(color, 0.15),
    { at: [0, h + 0.14, -0.22], rot: [-1.1, 0, 0] },
    24,
  );
  // Crumpled paper sticking out.
  b.sphere(0.09, COLOR.paper, { at: [-0.08, h, 0.06] }, [1, 0.85, 1]);
  b.sphere(0.08, COLOR.blush, { at: [0.1, h - 0.01, -0.02] }, [1, 0.8, 1]);
  b.sphere(0.07, 0xe8c77a, { at: [0.02, h + 0.02, 0.14] }, [1, 0.8, 1]);
  return { base: b.build(), hero: null, heroAt: [0, 0] };
}

function whiteboardStation(): StationModel {
  const color = PALETTE.station.whiteboard;
  const base = counter(new ModelBuilder(), COLOR.zinc, tint(color, 0.2));
  // Markers and an eraser on the top.
  for (const [x, c] of [
    [-0.32, 0x3a7be0],
    [-0.22, COLOR.signalRed],
    [-0.12, 0x2f9a5c],
  ] as const) {
    base.capsule(0.02, 0.1, c, { at: [x, TOP + 0.02, 0.3], rot: [0, 0, Math.PI / 2] });
  }
  base.box(0.14, 0.04, 0.06, COLOR.graphite, { at: [0.3, TOP + 0.02, 0.3] }, 0.01);
  // The hero: a big whiteboard on legs, a sketch of boxes and arrows on it.
  const hero = new ModelBuilder();
  for (const x of [-0.42, 0.42]) {
    hero.box(0.04, 0.95, 0.04, COLOR.chrome, { at: [x, TOP + 0.47, 0] }, 0);
    hero.box(0.04, 0.04, 0.3, COLOR.chrome, { at: [x, TOP + 0.02, 0] }, 0);
  }
  hero.box(0.92, 0.6, 0.04, COLOR.chrome, { at: [0, TOP + 0.62, 0] }, 0.015);
  hero.box(0.86, 0.54, 0.01, 0xfbfbf8, { at: [0, TOP + 0.62, 0.025] }, 0);
  const ink = (w: number, h: number, x: number, y: number, c: number, rot = 0) =>
    hero.box(w, h, 0.004, c, { at: [x, TOP + y, 0.032], rot: [0, 0, rot] }, 0);
  // Three boxes with arrows between them, and a stick figure: a user flow.
  for (const [x, y] of [
    [-0.28, 0.72],
    [0.02, 0.72],
    [0.28, 0.52],
  ] as const) {
    ink(0.16, 0.012, x, y + 0.05, 0x3a7be0);
    ink(0.16, 0.012, x, y - 0.05, 0x3a7be0);
    ink(0.012, 0.1, x - 0.08, y, 0x3a7be0);
    ink(0.012, 0.1, x + 0.08, y, 0x3a7be0);
  }
  ink(0.12, 0.012, -0.13, 0.72, COLOR.signalRed);
  ink(0.16, 0.012, 0.17, 0.62, COLOR.signalRed, -0.8);
  ink(0.012, 0.08, -0.28, 0.48, 0x2f9a5c);
  ink(0.06, 0.012, -0.28, 0.5, 0x2f9a5c);
  hero.sphere(0.025, 0x2f9a5c, { at: [-0.28, TOP + 0.55, 0.032] }, [1, 1, 0.2]);
  return { base: base.build(), hero: hero.build(), heroAt: [0, -0.32] };
}

function mergeStation(): StationModel {
  const color = PALETTE.station.merge;
  const base = counter(new ModelBuilder(), color);
  // Two landing pads on the top, one for each part.
  base.box(0.36, 0.012, 0.34, 0x5a2e10, { at: [-0.22, TOP + 0.006, 0.08] }, 0);
  base.box(0.36, 0.012, 0.34, 0x5a2e10, { at: [0.22, TOP + 0.006, 0.08] }, 0);
  // The hero: a glowing git branch sign, two branches joining into one.
  const hero = new ModelBuilder();
  hero.box(0.05, 0.3, 0.05, DARK, { at: [0, TOP + 0.15, 0] }, 0);
  hero.box(0.56, 0.5, 0.06, INK, { at: [0, TOP + 0.55, 0] }, 0.03);
  const glow = 0xffb070;
  hero.screen(0.04, 0.36, glow, { at: [0.08, TOP + 0.55, 0.032] });
  hero.screen(0.04, 0.22, glow, { at: [-0.06, TOP + 0.6, 0.032], rot: [0, 0, -0.65] });
  // The commits: the main line white, the front end blue, the back end green.
  hero.led(0.045, 0xffffff, { at: [0.08, TOP + 0.38, 0.04] });
  hero.led(0.045, 0x7ab8f0, { at: [0.08, TOP + 0.72, 0.04] });
  hero.led(0.045, 0x6cbf7a, { at: [-0.14, TOP + 0.7, 0.04] });
  return { base: base.build(), hero: hero.build(), heroAt: [0, -0.32] };
}

/** Every station and the counter, by tile. */
export const STATION_MODELS: Readonly<Record<StationTile, () => StationModel>> = {
  counter: plainCounter,
  keyboard: keyboardStation,
  testBench,
  review: reviewStation,
  pipeline: pipelineStation,
  inbox: inboxStation,
  bugQueue: bugQueueStation,
  ship: shipStation,
  bin,
  whiteboard: whiteboardStation,
  merge: mergeStation,
};
