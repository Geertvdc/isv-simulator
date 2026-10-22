import type { Tile } from '../../sim/level';
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

export type StationTile = Exclude<Tile, 'floor' | 'wall'>;

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

/** A monitor on a stand at the back of a desk, its screen in `glow`. */
function monitor(
  b: ModelBuilder,
  x: number,
  z: number,
  w: number,
  h: number,
  glow: number,
  turn = 0,
): void {
  const sin = Math.sin(turn);
  const cos = Math.cos(turn);
  b.cylinder(0.09, 0.11, 0.02, DARK, { at: [x, TOP + 0.01, z] });
  b.box(0.04, 0.14, 0.03, DARK, { at: [x, TOP + 0.08, z] }, 0.01);
  const cy = TOP + 0.14 + h / 2;
  b.box(w + 0.05, h + 0.05, 0.045, INK, { at: [x, cy, z], rot: [0, turn, 0] }, 0.015);
  b.screen(w, h, glow, { at: [x + sin * 0.024, cy, z + cos * 0.024], rot: [0, turn, 0] });
}

function keyboardStation(): Model {
  const b = counter(new ModelBuilder(), PALETTE.station.keyboard);
  monitor(b, -0.08, -0.3, 0.42, 0.26, 0x6cf0a8);
  // Lines of "code" on the screen, a little brighter.
  for (let i = 0; i < 4; i++) {
    const w = [0.22, 0.3, 0.16, 0.26][i] ?? 0.2;
    b.screen(w, 0.025, 0xd9ffe9, {
      at: [-0.26 + w / 2 + (i % 2) * 0.04, TOP + 0.37 - i * 0.05, -0.27],
    });
  }
  // Keyboard and mouse in front of the monitor, mug on the side.
  b.box(0.38, 0.025, 0.13, 0x3a3f4a, { at: [-0.08, TOP + 0.013, -0.08] }, 0.01);
  for (let r = 0; r < 3; r++)
    b.box(0.34, 0.006, 0.025, 0x9aa3b5, { at: [-0.08, TOP + 0.028, -0.12 + r * 0.035] }, 0.002);
  b.sphere(0.035, 0x3a3f4a, { at: [0.17, TOP + 0.015, -0.08] }, [0.8, 0.45, 1.2]);
  b.cylinder(0.045, 0.04, 0.1, 0xffffff, { at: [0.33, TOP + 0.05, -0.28] });
  b.torus(0.03, 0.01, 0xffffff, { at: [0.375, TOP + 0.055, -0.28], rot: [0, 0, Math.PI / 2] });
  b.cylinder(0.038, 0.038, 0.004, 0x5a3a22, { at: [0.33, TOP + 0.098, -0.28] });
  return b.build();
}

function testBench(): Model {
  const b = counter(new ModelBuilder(), PALETTE.station.testBench);
  // Two screens: a pass and a fail.
  monitor(b, -0.2, -0.3, 0.26, 0.2, 0x5cf08a, 0.2);
  monitor(b, 0.2, -0.3, 0.26, 0.2, 0xff5f57, -0.2);
  // A tick and a cross on them, in white.
  b.screen(0.08, 0.02, 0xffffff, { at: [-0.215, TOP + 0.24, -0.27], rot: [0, 0.2, -0.8] });
  b.screen(0.04, 0.02, 0xffffff, { at: [-0.255, TOP + 0.225, -0.272], rot: [0, 0.2, 0.8] });
  b.screen(0.09, 0.02, 0xffffff, { at: [0.215, TOP + 0.24, -0.27], rot: [0, -0.2, 0.8] });
  b.screen(0.09, 0.02, 0xffffff, { at: [0.215, TOP + 0.24, -0.268], rot: [0, -0.2, -0.8] });
  // A test phone lying flat.
  b.box(0.09, 0.015, 0.17, INK, { at: [0.36, TOP + 0.008, 0.05], rot: [0, 0.3, 0] }, 0.01);
  b.screen(0.075, 0.15, 0x7ab8ff, {
    at: [0.36, TOP + 0.017, 0.05],
    rot: [-Math.PI / 2, 0, 0.3],
  });
  return b.build();
}

function reviewStation(): Model {
  const b = counter(new ModelBuilder(), PALETTE.station.review);
  // A pile of printouts with red marks, and a big magnifying glass.
  for (let i = 0; i < 4; i++) {
    b.box(
      0.26,
      0.012,
      0.32,
      PAPER,
      { at: [-0.22, TOP + 0.006 + i * 0.013, -0.22], rot: [0, i % 2 ? 0.08 : -0.05, 0] },
      0.003,
    );
  }
  b.box(0.12, 0.004, 0.015, 0xe0402f, { at: [-0.2, TOP + 0.06, -0.2] }, 0.001);
  b.box(0.08, 0.004, 0.015, 0xe0402f, { at: [-0.24, TOP + 0.06, -0.15] }, 0.001);
  b.torus(0.09, 0.018, 0x3a2a1a, { at: [0.2, TOP + 0.2, -0.28], rot: [0, -0.4, 0] });
  b.pane(0.15, 0.15, 0.01, 0xcfefff, { at: [0.2, TOP + 0.2, -0.28], rot: [0, -0.4, 0] });
  b.box(
    0.035,
    0.17,
    0.035,
    0x3a2a1a,
    { at: [0.25, TOP + 0.06, -0.24], rot: [0, -0.4, -0.5] },
    0.012,
  );
  return b.build();
}

function pipelineStation(): Model {
  const b = counter(new ModelBuilder(), PALETTE.station.pipeline);
  // A conveyor across the top, with rollers peeking out at the ends.
  b.box(0.98, 0.03, 0.5, DARK, { at: [0, TOP + 0.015, 0.06] }, 0.01);
  for (const x of [-0.47, 0.47]) {
    b.cylinder(0.035, 0.035, 0.52, STEEL, { at: [x, TOP + 0.015, 0.06], rot: [Math.PI / 2, 0, 0] });
  }
  for (let i = 0; i < 6; i++)
    b.box(0.02, 0.004, 0.46, 0x4a505c, { at: [-0.4 + i * 0.16, TOP + 0.032, 0.06] }, 0.001);
  // A little build server at the back with blinking lights.
  b.box(0.5, 0.3, 0.2, 0x3a3f4a, { at: [0, TOP + 0.15, -0.33] }, 0.02);
  for (let i = 0; i < 3; i++) {
    b.box(0.44, 0.06, 0.01, INK, { at: [0, TOP + 0.07 + i * 0.08, -0.225] }, 0.004);
    b.led(0.014, i === 1 ? 0xffc04a : 0x5cf08a, { at: [0.17, TOP + 0.07 + i * 0.08, -0.218] });
    b.led(0.014, 0x5cf08a, { at: [0.13, TOP + 0.07 + i * 0.08, -0.218] });
  }
  return b.build();
}

/** A low tray in the middle of the top for queued tickets, and something on the back. */
function trayStation(color: number): ModelBuilder {
  const b = counter(new ModelBuilder(), color);
  const wall = tint(color, -0.25);
  b.box(0.62, 0.05, 0.03, wall, { at: [0, TOP + 0.025, 0.24] }, 0.01);
  b.box(0.62, 0.05, 0.03, wall, { at: [0, TOP + 0.025, -0.24] }, 0.01);
  b.box(0.03, 0.05, 0.5, wall, { at: [-0.3, TOP + 0.025, 0] }, 0.01);
  b.box(0.03, 0.05, 0.5, wall, { at: [0.3, TOP + 0.025, 0] }, 0.01);
  return b;
}

function inboxStation(): Model {
  const b = trayStation(PALETTE.station.inbox);
  // An envelope standing in a letter holder at the back.
  b.box(0.3, 0.12, 0.06, tint(PALETTE.station.inbox, -0.3), { at: [0, TOP + 0.06, -0.39] }, 0.015);
  b.box(0.24, 0.16, 0.012, PAPER, { at: [0, TOP + 0.13, -0.39], rot: [-0.08, 0, 0] }, 0.004);
  b.cone(
    0.12,
    0.06,
    0xe4ddcc,
    { at: [0, TOP + 0.18, -0.382], rot: [Math.PI / 2 - 0.08, 0, Math.PI] },
    3,
  );
  return b.build();
}

function bugQueueStation(): Model {
  const b = trayStation(PALETTE.station.bugQueue);
  // A big friendly bug sits on the back edge.
  const bug = 0x2b2f38;
  b.sphere(0.09, bug, { at: [0.3, TOP + 0.08, -0.36] }, [1, 0.7, 1.25]);
  b.sphere(0.05, bug, { at: [0.3, TOP + 0.1, -0.24] });
  b.sphere(0.07, 0xd33b2c, { at: [0.3, TOP + 0.12, -0.38] }, [1.05, 0.5, 1.1]);
  for (const s of [-1, 1]) {
    b.sphere(0.014, 0xffffff, { at: [0.3 + s * 0.02, TOP + 0.12, -0.2] });
    b.cylinder(0.006, 0.006, 0.1, bug, {
      at: [0.3 + s * 0.03, TOP + 0.17, -0.22],
      rot: [0.5, 0, s * 0.4],
    });
    for (let i = 0; i < 3; i++) {
      b.cylinder(0.008, 0.008, 0.1, bug, {
        at: [0.3 + s * 0.09, TOP + 0.04, -0.38 + i * 0.06],
        rot: [0, 0, s * 1.1],
      });
    }
  }
  return b.build();
}

function shipStation(): Model {
  const b = counter(new ModelBuilder(), PALETTE.station.ship);
  // A hatch in the top with a chute, a rocket for luck and a big red button.
  b.box(0.56, 0.012, 0.5, INK, { at: [0, TOP + 0.002, 0.04] }, 0.004);
  b.box(0.6, 0.03, 0.04, tint(PALETTE.station.ship, -0.4), { at: [0, TOP + 0.015, 0.3] }, 0.01);
  b.box(0.6, 0.03, 0.04, tint(PALETTE.station.ship, -0.4), { at: [0, TOP + 0.015, -0.22] }, 0.01);
  b.cylinder(0.06, 0.06, 0.03, 0xe8e2d6, { at: [0.38, TOP + 0.015, -0.36] });
  b.cylinder(0.045, 0.05, 0.035, 0xe0402f, { at: [0.38, TOP + 0.045, -0.36] });
  b.cylinder(0.04, 0.04, 0.16, 0xf2efe8, { at: [-0.36, TOP + 0.1, -0.36] });
  b.cone(0.04, 0.08, 0xe0402f, { at: [-0.36, TOP + 0.22, -0.36] });
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    b.box(
      0.02,
      0.06,
      0.05,
      0xe0402f,
      {
        at: [-0.36 + Math.cos(a) * 0.045, TOP + 0.05, -0.36 + Math.sin(a) * 0.045],
        rot: [0, -a, 0],
      },
      0.005,
    );
  }
  b.sphere(0.018, 0x7ab8ff, { at: [-0.36, TOP + 0.14, -0.322] });
  return b.build();
}

function plainCounter(): Model {
  return counter(new ModelBuilder(), PALETTE.counterFront, PALETTE.counterTop).build();
}

function stationTop(color: number): number {
  return tint(color, 0.4);
}

function bin(): Model {
  const b = new ModelBuilder();
  const color = PALETTE.station.bin;
  b.cylinder(0.27, 0.22, TOP - 0.06, color, { at: [0, (TOP - 0.06) / 2, 0] }, 24);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    b.box(
      0.02,
      TOP - 0.14,
      0.02,
      tint(color, -0.3),
      { at: [Math.cos(a) * 0.25, (TOP - 0.06) / 2, Math.sin(a) * 0.25] },
      0.005,
    );
  }
  b.torus(0.265, 0.025, tint(color, 0.25), { at: [0, TOP - 0.06, 0], rot: [Math.PI / 2, 0, 0] });
  // Crumpled paper sticking out.
  b.sphere(0.07, PAPER, { at: [-0.06, TOP - 0.04, 0.03] }, [1, 0.85, 1]);
  b.sphere(0.06, 0xf6c4bd, { at: [0.08, TOP - 0.05, -0.05] }, [1, 0.8, 1]);
  return b.build();
}

/** Every station and the counter, by tile. */
export const STATION_MODELS: Readonly<Record<StationTile, () => Model>> = {
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
