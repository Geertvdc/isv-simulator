import type { BlockTile } from '../../sim/level';
import type { TicketKind } from '../../sim/tickets';
import type { FloorTheme, WallTheme } from '../mapLook';
import type { WallPiece } from '../mapShape';
import { type Model, ModelBuilder, tint } from './kit';
import { CARD_SIZE, FRONT_WALL_HEIGHT, STATION_HEIGHT, WALL_HEIGHT } from './layout';
import { FLOOR_COLORS, PALETTE, WALL_COLORS } from './look';
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
const PAPER = 0xf7f3ea;
const WOOD_FRAME = COLOR.woodFrame;

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
      PAPER,
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
  hero.box(0.14, 0.1, 0.01, PAPER, { at: [0, TOP + 0.45, 0.06], rot: [-0.3, 0, 0] }, 0);
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
  b.sphere(0.09, PAPER, { at: [-0.08, h, 0.06] }, [1, 0.85, 1]);
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

/**
 * A conveyor belt's frame: a steel body like a counter with hazard-striped
 * rails and rollers at the ends; the running surface (with its moving
 * stripes) is drawn by `MapView`. Built carrying toward +z.
 */
export function conveyorModel(): Model {
  const b = new ModelBuilder();
  const steel = PALETTE.conveyor;
  b.slab(0.86, 0.06, 0.86, tint(steel, -0.5), 0, 0, 0);
  b.slab(0.94, TOP - 0.1, 0.96, steel, 0, 0.06, 0);
  // Rails either side of the belt, yellow and black.
  for (const x of [-0.38, 0.38]) {
    b.box(0.14, 0.08, 1, COLOR.graphite, { at: [x, TOP - 0.02, 0] }, 0.02);
    for (let i = 0; i < 4; i++) {
      b.box(0.141, 0.02, 0.12, COLOR.gold, { at: [x, TOP + 0.02, -0.375 + i * 0.25] }, 0);
    }
  }
  // Rollers under the belt, showing at the ends.
  for (const z of [-0.47, 0.47]) {
    b.cylinder(0.05, 0.05, 0.62, STEEL, { at: [0, TOP - 0.04, z], rot: [0, 0, Math.PI / 2] }, 12);
  }
  b.box(0.62, 0.04, 1, DARK, { at: [0, TOP - 0.018, 0] }, 0);
  return b.build();
}

/** One wall piece in a theme, `height` tall. */
export function wallModel(theme: WallTheme, piece: WallPiece): Model {
  const h = piece === 'wall-front' ? FRONT_WALL_HEIGHT : WALL_HEIGHT;
  const { face, top } = WALL_COLORS[theme];
  const b = new ModelBuilder();
  const cap = 0.06;
  if (theme === 'glass') {
    // A partition: a solid planter-like base, a slim frame and a pane on it.
    const base = Math.min(0.24, h);
    b.box(1, base, 1, tint(top, 0.25), { at: [0, base / 2, 0] }, 0.015);
    b.box(0.96, 0.02, 0.96, tint(top, -0.2), { at: [0, base + 0.005, 0] }, 0.006);
    if (h - base > 0.1) {
      const paneH = h - base - 0.04;
      for (const x of [-0.47, 0.47])
        b.box(0.05, paneH + 0.04, 0.09, top, { at: [x, base + (paneH + 0.04) / 2, 0] }, 0.01);
      b.box(1, 0.04, 0.09, top, { at: [0, h - 0.02, 0] }, 0.01);
      b.pane(0.9, paneH, 0.03, face, { at: [0, base + paneH / 2, 0] });
    }
    return b.build();
  }
  b.box(1, h - cap, 1, face, { at: [0, (h - cap) / 2, 0] }, 0.012);
  b.box(1.0, cap, 1.0, top, { at: [0, h - cap / 2, 0] }, 0.015);
  if (piece === 'wall') {
    // Skirting along the front face, and planks on wood.
    b.box(1, 0.07, 0.03, tint(face, -0.35), { at: [0, 0.035, 0.5] }, 0.006);
    if (theme === 'wood') {
      for (let i = 1; i < 5; i++)
        b.box(
          0.012,
          h - cap - 0.08,
          0.012,
          tint(face, -0.25),
          { at: [-0.5 + i * 0.2, (h - cap) / 2 + 0.04, 0.5] },
          0.003,
        );
    }
  }
  return b.build();
}

/** Things hung on the front of a wall (all in front of z = 0.5), by name. */
export const WALL_DECO_MODELS: Readonly<Record<string, () => Model>> = {
  whiteboard: () => {
    const b = new ModelBuilder();
    b.box(0.72, 0.42, 0.03, COLOR.chrome, { at: [0, 0.68, 0.515] }, 0.01);
    b.box(0.66, 0.36, 0.01, 0xfbfbf8, { at: [0, 0.68, 0.53] }, 0.004);
    for (const [x, y, w, c] of [
      [-0.12, 0.76, 0.3, 0x3a7be0],
      [-0.05, 0.69, 0.42, 0x3a7be0],
      [0.1, 0.6, 0.2, COLOR.signalRed],
    ] as const) {
      b.box(w, 0.018, 0.004, c, { at: [x, y, 0.537] }, 0.002);
    }
    b.box(0.5, 0.025, 0.06, COLOR.chrome, { at: [0, 0.465, 0.54] }, 0.008);
    return b.build();
  },
  clock: () => {
    const b = new ModelBuilder();
    b.cylinder(
      0.17,
      0.17,
      0.04,
      COLOR.signalRed,
      { at: [0, 0.78, 0.52], rot: [Math.PI / 2, 0, 0] },
      28,
    );
    b.cylinder(0.14, 0.14, 0.01, 0xffffff, { at: [0, 0.78, 0.542], rot: [Math.PI / 2, 0, 0] }, 28);
    b.box(0.015, 0.1, 0.006, INK, { at: [0, 0.82, 0.55] }, 0.002);
    b.box(0.07, 0.015, 0.006, INK, { at: [0.03, 0.78, 0.55] }, 0.002);
    return b.build();
  },
  poster: () => {
    const b = new ModelBuilder();
    b.box(0.42, 0.56, 0.015, COLOR.midnight, { at: [0, 0.66, 0.51] }, 0.004);
    b.cylinder(0.11, 0.11, 0.004, COLOR.amber, { at: [0, 0.72, 0.52], rot: [Math.PI / 2, 0, 0] });
    b.box(0.3, 0.04, 0.004, 0xffffff, { at: [0, 0.5, 0.52] }, 0.002);
    return b.build();
  },
  kanban: () => {
    const b = new ModelBuilder();
    b.box(0.8, 0.5, 0.02, 0xc9a77a, { at: [0, 0.66, 0.51] }, 0.006);
    const notes = [COLOR.noteYellow, COLOR.noteBlue, COLOR.notePink, COLOR.noteGreen];
    for (let c = 0; c < 3; c++) {
      for (let r = 0; r < 3 - c; r++) {
        b.box(
          0.14,
          0.12,
          0.006,
          notes[(c + r) % notes.length] ?? COLOR.noteYellow,
          {
            at: [-0.25 + c * 0.25, 0.8 - r * 0.15, 0.523],
            rot: [0, 0, ((c * 3 + r) % 3) * 0.05 - 0.05],
          },
          0.002,
        );
      }
    }
    return b.build();
  },
  dashboard: () => {
    const b = new ModelBuilder();
    b.box(0.6, 0.38, 0.04, INK, { at: [0, 0.72, 0.52] }, 0.012);
    b.screen(0.54, 0.32, COLOR.screenNavy, { at: [0, 0.72, 0.542] });
    for (let i = 0; i < 5; i++) {
      const h = [0.08, 0.14, 0.11, 0.2, 0.17][i] ?? 0.1;
      b.screen(0.06, h, COLOR.screenMint, { at: [-0.18 + i * 0.09, 0.6 + h / 2, 0.544] });
    }
    return b.build();
  },
  plants: () => {
    const b = new ModelBuilder();
    b.box(0.6, 0.04, 0.14, COLOR.woodFrame, { at: [0, 0.62, 0.57] }, 0.01);
    for (const x of [-0.18, 0.16]) {
      b.cylinder(0.06, 0.045, 0.1, COLOR.terracotta, { at: [x, 0.69, 0.57] });
      b.sphere(0.09, COLOR.leaf, { at: [x, 0.8, 0.57] }, [1, 1.1, 1]);
      b.sphere(0.06, 0x67b85e, { at: [x + 0.05, 0.86, 0.6] });
    }
    return b.build();
  },
  frames: () => {
    // Three framed pictures, hung a little unevenly: a team photo, a print, the first invoice.
    const b = new ModelBuilder();
    for (const [x, y, w, h, frame, art] of [
      [-0.24, 0.74, 0.22, 0.28, COLOR.graphite, 0x8aa0b8],
      [0.04, 0.8, 0.2, 0.16, WOOD_FRAME, 0xd8a070],
      [0.25, 0.66, 0.18, 0.22, COLOR.porcelain, PAPER],
    ] as const) {
      b.box(w, h, 0.02, frame, { at: [x, y, 0.515] }, 0.004);
      b.box(w - 0.05, h - 0.05, 0.004, art, { at: [x, y, 0.527] }, 0.001);
    }
    b.box(0.06, 0.012, 0.004, INK, { at: [0.25, 0.7, 0.53] }, 0.001);
    b.box(0.08, 0.012, 0.004, INK, { at: [0.25, 0.66, 0.53] }, 0.001);
    return b.build();
  },
  shelf: () => {
    // A floating shelf: books, a rubber duck, a little cactus.
    const b = new ModelBuilder();
    b.box(0.66, 0.035, 0.16, WOOD_FRAME, { at: [0, 0.62, 0.58] }, 0.006);
    const spines = [COLOR.clay, COLOR.dustyBlue, COLOR.khaki, COLOR.sage, COLOR.plum];
    spines.forEach((c, i) =>
      b.box(
        0.04,
        0.17 - (i % 3) * 0.025,
        0.12,
        c,
        { at: [-0.26 + i * 0.045, 0.72 - (i % 3) * 0.012, 0.58] },
        0,
      ),
    );
    b.sphere(0.045, COLOR.aqua, { at: [0.08, 0.67, 0.6] }, [1.2, 0.8, 1]);
    b.sphere(0.03, COLOR.aqua, { at: [0.1, 0.71, 0.6] });
    b.cylinder(0.04, 0.032, 0.06, COLOR.terracotta, { at: [0.24, 0.67, 0.58] }, 10);
    b.capsule(0.025, 0.06, COLOR.cactus, { at: [0.24, 0.74, 0.58] });
    return b.build();
  },
  pinboard: () => {
    // A cork board: printouts, a sticky note, a lanyard.
    const b = new ModelBuilder();
    b.box(0.6, 0.42, 0.02, 0xb8905a, { at: [0, 0.7, 0.51] }, 0.006);
    for (const [x, y, w, h, r] of [
      [-0.16, 0.76, 0.16, 0.2, -0.06],
      [0.06, 0.72, 0.14, 0.18, 0.05],
      [0.2, 0.8, 0.1, 0.1, 0.1],
    ] as const) {
      b.box(
        w,
        h,
        0.004,
        x > 0.15 ? COLOR.noteYellow : PAPER,
        { at: [x, y, 0.523], rot: [0, 0, r] },
        0.001,
      );
      b.sphere(0.012, COLOR.pinRed, { at: [x, y + h / 2 - 0.02, 0.528] });
    }
    b.box(0.02, 0.2, 0.004, COLOR.periwinkle, { at: [0.2, 0.62, 0.524] }, 0.001);
    b.box(0.07, 0.09, 0.004, PAPER, { at: [0.2, 0.52, 0.524] }, 0.001);
    return b.build();
  },
  braces: () => {
    // A neon sign: a pair of curly braces round a blinking cursor.
    const b = new ModelBuilder();
    b.box(0.6, 0.3, 0.02, 0x22262e, { at: [0, 0.74, 0.51] }, 0.008);
    const cyan = 0x5ce0ff;
    for (const s of [-1, 1]) {
      const x = s * 0.18;
      b.screen(0.025, 0.08, cyan, { at: [x, 0.79, 0.523], rot: [0, 0, s * 0.15] });
      b.screen(0.025, 0.08, cyan, { at: [x, 0.69, 0.523], rot: [0, 0, -s * 0.15] });
      b.screen(0.045, 0.022, cyan, { at: [x + s * 0.02, 0.74, 0.523] });
    }
    b.screen(0.05, 0.1, COLOR.hotPink, { at: [0, 0.74, 0.523] });
    return b.build();
  },
  tv: () => {
    // A wall TV in a light bezel with the build status: green checks, an amber and a red one.
    const b = new ModelBuilder();
    b.box(0.74, 0.44, 0.04, COLOR.lightSteel, { at: [0, 0.72, 0.52] }, 0.012);
    b.screen(0.68, 0.38, 0x162a3a, { at: [0, 0.72, 0.542] });
    for (let i = 0; i < 4; i++) {
      b.screen(0.4, 0.04, 0x2f4a5f, { at: [0.06, 0.84 - i * 0.08, 0.543] });
      b.screen(0.05, 0.05, i === 2 ? COLOR.amber : i === 3 ? COLOR.coral : COLOR.screenMint, {
        at: [-0.22, 0.84 - i * 0.08, 0.544],
      });
    }
    return b.build();
  },
};

/** A floor tile in a theme: tiles with grout, carpet, or planks. Instance colors tint it per tile. */
export function floorModel(theme: FloorTheme): Model {
  const [a, alt] = FLOOR_COLORS[theme];
  const b = new ModelBuilder();
  if (theme === 'concrete') {
    b.box(1, 0.01, 1, tint(a, -0.35), { at: [0, -0.012, 0] }, 0);
    b.box(0.95, 0.012, 0.95, a, { at: [0, -0.006, 0] }, 0.004);
  } else if (theme === 'parquet') {
    for (let i = 0; i < 4; i++) {
      b.box(0.24, 0.012, 0.98, i % 2 ? alt : a, { at: [-0.375 + i * 0.25, -0.006, 0] }, 0.004);
    }
  } else {
    b.box(1, 0.012, 1, a, { at: [0, -0.006, 0] }, 0);
  }
  return b.build();
}

/**
 * Folder colors: a feature is a manila folder, a bug pink, an incident red;
 * a front end sky blue, a back end green, and the two merged purple.
 */
const FOLDER_COLORS: Readonly<Record<TicketKind, number>> = {
  feature: 0xe8c77a,
  bug: 0xf29aa0,
  incident: 0xe8402f,
  frontend: 0x7ab8f0,
  backend: 0x6cbf7a,
  fullstack: 0x9a7ae0,
};

/** An expired ticket's folder: dull grey, its order ran out. */
const EXPIRED_FOLDER_COLOR = 0x8a8880;

/**
 * A ticket: a folder with a tab and a sheet peeking out, lying flat, its bottom at y = 0.
 * An expired one is a dull grey folder.
 */
export function ticketModel(kind: TicketKind, expired = false): Model {
  const { width: w, depth: d, thickness: t } = CARD_SIZE;
  const color = expired ? EXPIRED_FOLDER_COLOR : FOLDER_COLORS[kind];
  const b = new ModelBuilder();
  b.box(w, t * 0.45, d, tint(color, -0.12), { at: [0, t * 0.22, 0] }, 0.01);
  b.box(w * 0.92, t * 0.3, d * 0.9, PAPER, { at: [0.01, t * 0.55, -0.015] }, 0.004);
  b.box(w * 0.4, t * 0.2, d * 0.12, PALETTE.ink, { at: [-w * 0.12, t * 0.72, -d * 0.2] }, 0.002);
  b.box(w * 0.55, t * 0.2, d * 0.08, 0x9aa3b5, { at: [-w * 0.05, t * 0.72, 0] }, 0.002);
  b.box(w, t * 0.3, d, color, { at: [0, t * 0.85, 0.02], rot: [-0.06, 0, 0] }, 0.01);
  b.box(w * 0.35, t * 0.3, d * 0.16, color, { at: [-w * 0.28, t * 0.6, -d * 0.55] }, 0.01);
  if (kind === 'incident' && !expired) {
    // A flame-red warning stripe, so production fires can't be missed.
    b.box(
      w * 0.9,
      t * 0.12,
      d * 0.18,
      COLOR.gold,
      { at: [0, t * 1.02, 0.03], rot: [-0.06, 0, 0] },
      0.002,
    );
  }
  return b.build();
}
