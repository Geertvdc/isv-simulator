import type { BlockTile } from '../../sim/level';
import type { TicketKind } from '../../sim/tickets';
import type { FloorTheme, WallTheme } from '../MapRenderer';
import type { WallPiece } from '../mapShape';
import { type Model, ModelBuilder, tint } from './kit';
import { CARD_SIZE, FRONT_WALL_HEIGHT, STATION_HEIGHT, WALL_HEIGHT } from './layout';
import { FLOOR_COLORS, PALETTE, WALL_COLORS } from './look';

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
const DARK = 0x2b2f38;
const STEEL = 0x8b939e;
const PAPER = 0xf7f3ea;

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
  base.box(0.56, 0.035, 0.2, 0x3a3f4a, { at: [-0.04, TOP + 0.018, 0.08] }, 0.012);
  const caps = [0xfdfdf6, 0xffc04a, 0x5cc8f0, 0xfdfdf6];
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 8; c++) {
      const cap = caps[(r * 3 + c) % caps.length] ?? 0xfdfdf6;
      base.box(
        0.05,
        0.02,
        0.045,
        r === 2 && c > 1 && c < 6 ? 0xfdfdf6 : cap,
        {
          at: [-0.04 - 0.21 + c * 0.06, TOP + 0.045, 0.02 + r * 0.06],
        },
        0,
      );
    }
  }
  base.sphere(0.045, 0x3a3f4a, { at: [0.33, TOP + 0.02, 0.1] }, [0.8, 0.45, 1.2]);
  base.cylinder(0.06, 0.055, 0.13, 0xffffff, { at: [0.36, TOP + 0.065, -0.25] });
  base.torus(0.04, 0.013, 0xffffff, { at: [0.42, TOP + 0.07, -0.25], rot: [0, 0, Math.PI / 2] });
  base.cylinder(0.05, 0.05, 0.004, 0x5a3a22, { at: [0.36, TOP + 0.128, -0.25] });

  const hero = monitor(new ModelBuilder(), 0.58, 0.36, 0x4ee08a);
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
  base.box(0.34, 0.05, 0.1, 0x8c5f3d, { at: [-0.2, TOP + 0.025, 0.2] }, 0.01);
  for (let i = 0; i < 4; i++) {
    const x = -0.32 + i * 0.08;
    base.cylinder(0.025, 0.025, 0.18, 0xe8f6ff, { at: [x, TOP + 0.1, 0.2] }, 10);
    base.cylinder(
      0.022,
      0.022,
      0.1 - (i % 2) * 0.03,
      i === 2 ? 0xff5f57 : 0x5cf08a,
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
  base.box(0.16, 0.006, 0.02, 0xe0402f, { at: [-0.22, TOP + 0.068, -0.18] }, 0);
  base.box(0.1, 0.006, 0.02, 0xe0402f, { at: [-0.26, TOP + 0.068, -0.12] }, 0);
  base.capsule(0.025, 0.24, 0xe0402f, {
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
    base.box(0.03, 0.006, 0.46, 0x4a505c, { at: [-0.4 + i * 0.16, TOP + 0.038, 0.12] }, 0);
  }
  // The hero: a chunky build server with blinking lights.
  const hero = new ModelBuilder();
  hero.box(0.62, 0.42, 0.24, 0x3a3f4a, { at: [0, TOP + 0.21, 0] }, 0.03);
  for (let i = 0; i < 3; i++) {
    const y = TOP + 0.09 + i * 0.12;
    hero.box(0.54, 0.08, 0.01, INK, { at: [0, y, 0.122] }, 0);
    hero.led(0.022, i === 1 ? 0xffc04a : 0x4ef07a, { at: [0.2, y, 0.13] });
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
  hero.box(0.02, 0.18, 0.02, 0xe0402f, { at: [0.13, TOP + 0.36, -0.06] }, 0);
  hero.box(0.02, 0.07, 0.1, 0xe0402f, { at: [0.13, TOP + 0.42, -0.02] }, 0);
  // A letter sticking out.
  hero.box(0.14, 0.1, 0.01, PAPER, { at: [0, TOP + 0.45, 0.06], rot: [-0.3, 0, 0] }, 0);
  return { base: base.build(), hero: hero.build(), heroAt: [0.36, -0.3] };
}

function bugQueueStation(): StationModel {
  const base = trayStation(PALETTE.station.bugQueue);
  // The hero: a big friendly ladybug-like bug, front toward the camera.
  const hero = new ModelBuilder();
  const bug = 0x2b2f38;
  hero.sphere(0.15, bug, { at: [0, TOP + 0.12, -0.03] }, [1, 0.62, 1.2]);
  hero.sphere(0.135, 0xe0402f, { at: [0, TOP + 0.17, -0.04] }, [1.05, 0.5, 1.15]);
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
    const c = i % 2 ? INK : 0xffd166;
    base.box(0.085, 0.03, 0.05, c, { at: [-0.3 + i * 0.085 + 0.04, TOP + 0.015, 0.355] }, 0);
    base.box(0.085, 0.03, 0.05, c, { at: [-0.3 + i * 0.085 + 0.04, TOP + 0.015, -0.195] }, 0);
  }
  // A big red mushroom button, front right.
  base.cylinder(0.09, 0.1, 0.05, 0xd8d2c6, { at: [0.38, TOP + 0.025, 0.36] });
  base.sphere(0.085, 0xe0402f, { at: [0.38, TOP + 0.07, 0.36] }, [1, 0.55, 1]);
  // The hero: a parcel with tape, ready to go.
  const hero = new ModelBuilder();
  hero.box(0.36, 0.28, 0.3, 0xc8955a, { at: [0, TOP + 0.14, 0] }, 0.02);
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
  b.sphere(0.08, 0xf6c4bd, { at: [0.1, h - 0.01, -0.02] }, [1, 0.8, 1]);
  b.sphere(0.07, 0xe8c77a, { at: [0.02, h + 0.02, 0.14] }, [1, 0.8, 1]);
  return { base: b.build(), hero: null, heroAt: [0, 0] };
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
    b.box(0.14, 0.08, 1, 0x3a3f4a, { at: [x, TOP - 0.02, 0] }, 0.02);
    for (let i = 0; i < 4; i++) {
      b.box(0.141, 0.02, 0.12, 0xffd166, { at: [x, TOP + 0.02, -0.375 + i * 0.25] }, 0);
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
    b.box(0.72, 0.42, 0.03, 0xb8bec8, { at: [0, 0.68, 0.515] }, 0.01);
    b.box(0.66, 0.36, 0.01, 0xfbfbf8, { at: [0, 0.68, 0.53] }, 0.004);
    for (const [x, y, w, c] of [
      [-0.12, 0.76, 0.3, 0x3a7be0],
      [-0.05, 0.69, 0.42, 0x3a7be0],
      [0.1, 0.6, 0.2, 0xe0402f],
    ] as const) {
      b.box(w, 0.018, 0.004, c, { at: [x, y, 0.537] }, 0.002);
    }
    b.box(0.5, 0.025, 0.06, 0xb8bec8, { at: [0, 0.465, 0.54] }, 0.008);
    return b.build();
  },
  clock: () => {
    const b = new ModelBuilder();
    b.cylinder(0.17, 0.17, 0.04, 0xe0402f, { at: [0, 0.78, 0.52], rot: [Math.PI / 2, 0, 0] }, 28);
    b.cylinder(0.14, 0.14, 0.01, 0xffffff, { at: [0, 0.78, 0.542], rot: [Math.PI / 2, 0, 0] }, 28);
    b.box(0.015, 0.1, 0.006, INK, { at: [0, 0.82, 0.55] }, 0.002);
    b.box(0.07, 0.015, 0.006, INK, { at: [0.03, 0.78, 0.55] }, 0.002);
    return b.build();
  },
  poster: () => {
    const b = new ModelBuilder();
    b.box(0.42, 0.56, 0.015, 0x2b3756, { at: [0, 0.66, 0.51] }, 0.004);
    b.cylinder(0.11, 0.11, 0.004, 0xffc04a, { at: [0, 0.72, 0.52], rot: [Math.PI / 2, 0, 0] });
    b.box(0.3, 0.04, 0.004, 0xffffff, { at: [0, 0.5, 0.52] }, 0.002);
    return b.build();
  },
  kanban: () => {
    const b = new ModelBuilder();
    b.box(0.8, 0.5, 0.02, 0xc9a77a, { at: [0, 0.66, 0.51] }, 0.006);
    const notes = [0xffe066, 0x8fd3ff, 0xff9fb0, 0xa6e88a];
    for (let c = 0; c < 3; c++) {
      for (let r = 0; r < 3 - c; r++) {
        b.box(
          0.14,
          0.12,
          0.006,
          notes[(c + r) % notes.length] ?? 0xffe066,
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
    b.screen(0.54, 0.32, 0x1d3a5a, { at: [0, 0.72, 0.542] });
    for (let i = 0; i < 5; i++) {
      const h = [0.08, 0.14, 0.11, 0.2, 0.17][i] ?? 0.1;
      b.screen(0.06, h, 0x5cf0a8, { at: [-0.18 + i * 0.09, 0.6 + h / 2, 0.544] });
    }
    return b.build();
  },
  plants: () => {
    const b = new ModelBuilder();
    b.box(0.6, 0.04, 0.14, 0x8c5f3d, { at: [0, 0.62, 0.57] }, 0.01);
    for (const x of [-0.18, 0.16]) {
      b.cylinder(0.06, 0.045, 0.1, 0xd0704a, { at: [x, 0.69, 0.57] });
      b.sphere(0.09, 0x4f9d4a, { at: [x, 0.8, 0.57] }, [1, 1.1, 1]);
      b.sphere(0.06, 0x67b85e, { at: [x + 0.05, 0.86, 0.6] });
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

/** Folder colors: a feature is a manila folder, a bug pink, an incident red. */
const FOLDER_COLORS: Readonly<Record<TicketKind, number>> = {
  feature: 0xe8c77a,
  bug: 0xf29aa0,
  incident: 0xe8402f,
};

/** A ticket: a folder with a tab and a sheet peeking out, lying flat, its bottom at y = 0. */
export function ticketModel(kind: TicketKind): Model {
  const { width: w, depth: d, thickness: t } = CARD_SIZE;
  const color = FOLDER_COLORS[kind];
  const b = new ModelBuilder();
  b.box(w, t * 0.45, d, tint(color, -0.12), { at: [0, t * 0.22, 0] }, 0.01);
  b.box(w * 0.92, t * 0.3, d * 0.9, PAPER, { at: [0.01, t * 0.55, -0.015] }, 0.004);
  b.box(w * 0.4, t * 0.2, d * 0.12, PALETTE.ink, { at: [-w * 0.12, t * 0.72, -d * 0.2] }, 0.002);
  b.box(w * 0.55, t * 0.2, d * 0.08, 0x9aa3b5, { at: [-w * 0.05, t * 0.72, 0] }, 0.002);
  b.box(w, t * 0.3, d, color, { at: [0, t * 0.85, 0.02], rot: [-0.06, 0, 0] }, 0.01);
  b.box(w * 0.35, t * 0.3, d * 0.16, color, { at: [-w * 0.28, t * 0.6, -d * 0.55] }, 0.01);
  if (kind === 'incident') {
    // A flame-red warning stripe, so production fires can't be missed.
    b.box(
      w * 0.9,
      t * 0.12,
      d * 0.18,
      0xffd166,
      { at: [0, t * 1.02, 0.03], rot: [-0.06, 0, 0] },
      0.002,
    );
  }
  return b.build();
}
