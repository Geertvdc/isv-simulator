import type { FloorTheme, WallTheme } from '../mapLook';
import { type Model, ModelBuilder, tint } from './kit';
import { FRONT_WALL_HEIGHT, STATION_HEIGHT, WALL_HEIGHT } from './layout';
import { FLOOR_COLORS, PALETTE, WALL_COLORS } from './look';
import { COLOR } from './palette';
import { type WallPiece, tileHash } from '../mapShape';

/**
 * The room round the stations, built in code like the rest of the office
 * kit: conveyor belts, wall pieces, the decorations hung on walls and the
 * floor tiles.
 */

/**
 * A conveyor belt's frame: a steel body like a counter with hazard-striped
 * rails and rollers at the ends; the running surface (with its moving
 * stripes) is drawn by `MapView`. Built carrying toward +z.
 */
export function conveyorModel(): Model {
  const b = new ModelBuilder();
  const steel = PALETTE.conveyor;
  b.slab(0.86, 0.06, 0.86, tint(steel, -0.5), 0, 0, 0);
  b.slab(0.94, STATION_HEIGHT - 0.1, 0.96, steel, 0, 0.06, 0);
  // Rails either side of the belt, yellow and black.
  for (const x of [-0.38, 0.38]) {
    b.box(0.14, 0.08, 1, COLOR.graphite, { at: [x, STATION_HEIGHT - 0.02, 0] }, 0.02);
    for (let i = 0; i < 4; i++) {
      b.box(
        0.141,
        0.02,
        0.12,
        COLOR.gold,
        { at: [x, STATION_HEIGHT + 0.02, -0.375 + i * 0.25] },
        0,
      );
    }
  }
  // Rollers under the belt, showing at the ends.
  for (const z of [-0.47, 0.47]) {
    b.cylinder(
      0.05,
      0.05,
      0.62,
      COLOR.steel,
      { at: [0, STATION_HEIGHT - 0.04, z], rot: [0, 0, Math.PI / 2] },
      12,
    );
  }
  b.box(0.62, 0.04, 1, COLOR.charcoal, { at: [0, STATION_HEIGHT - 0.018, 0] }, 0);
  return b.build();
}

/** Item `i` of `colors`, wrapping round. */
function nthColor(colors: readonly number[], i: number): number {
  return colors[((i % colors.length) + colors.length) % colors.length] ?? COLOR.white;
}

/** One wall piece in a theme, `height` tall; garage walls come in `GARAGE_WALL_LOOKS` looks. */
export function wallModel(theme: WallTheme, piece: WallPiece, look = 0): Model {
  if (theme === 'garage') return garageWallModel(piece, look);
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
    b.box(0.015, 0.1, 0.006, PALETTE.ink, { at: [0, 0.82, 0.55] }, 0.002);
    b.box(0.07, 0.015, 0.006, PALETTE.ink, { at: [0.03, 0.78, 0.55] }, 0.002);
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
    b.box(0.6, 0.38, 0.04, PALETTE.ink, { at: [0, 0.72, 0.52] }, 0.012);
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
      [0.04, 0.8, 0.2, 0.16, COLOR.woodFrame, 0xd8a070],
      [0.25, 0.66, 0.18, 0.22, COLOR.porcelain, COLOR.paper],
    ] as const) {
      b.box(w, h, 0.02, frame, { at: [x, y, 0.515] }, 0.004);
      b.box(w - 0.05, h - 0.05, 0.004, art, { at: [x, y, 0.527] }, 0.001);
    }
    b.box(0.06, 0.012, 0.004, PALETTE.ink, { at: [0.25, 0.7, 0.53] }, 0.001);
    b.box(0.08, 0.012, 0.004, PALETTE.ink, { at: [0.25, 0.66, 0.53] }, 0.001);
    return b.build();
  },
  shelf: () => {
    // A floating shelf: books, a rubber duck, a little cactus.
    const b = new ModelBuilder();
    b.box(0.66, 0.035, 0.16, COLOR.woodFrame, { at: [0, 0.62, 0.58] }, 0.006);
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
        x > 0.15 ? COLOR.noteYellow : COLOR.paper,
        { at: [x, y, 0.523], rot: [0, 0, r] },
        0.001,
      );
      b.sphere(0.012, COLOR.pinRed, { at: [x, y + h / 2 - 0.02, 0.528] });
    }
    b.box(0.02, 0.2, 0.004, COLOR.periwinkle, { at: [0.2, 0.62, 0.524] }, 0.001);
    b.box(0.07, 0.09, 0.004, COLOR.paper, { at: [0.2, 0.52, 0.524] }, 0.001);
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
  // ---- On garage block ----
  pegboard: () => {
    // A pegboard with the tools on it, each over its painted outline.
    const b = new ModelBuilder();
    const board = 0xa47a52;
    b.box(0.84, 0.52, 0.02, board, { at: [0, 0.7, 0.515] }, 0);
    for (let r = 0; r < 6; r++)
      for (let c = 0; c < 10; c++)
        b.box(
          0.012,
          0.012,
          0.004,
          tint(board, -0.45),
          {
            at: [-0.36 + c * 0.08, 0.48 + r * 0.088, 0.526],
          },
          0,
        );
    const outline = 0x3a3330;
    const tool = (w: number, h: number, color: number, x: number, y: number, rz = 0) => {
      b.box(w + 0.03, h + 0.03, 0.002, outline, { at: [x, y, 0.527], rot: [0, 0, rz] }, 0);
      b.box(w, h, 0.016, color, { at: [x, y, 0.536], rot: [0, 0, rz] }, 0);
    };
    // A hammer, three spanners, a saw, three screwdrivers.
    tool(0.035, 0.22, COLOR.wood, -0.32, 0.66);
    tool(0.12, 0.04, COLOR.steel, -0.32, 0.78);
    for (let i = 0; i < 3; i++)
      tool(0.024, 0.2 - i * 0.04, COLOR.chrome, -0.18 + i * 0.05, 0.68 + i * 0.02);
    tool(0.26, 0.08, COLOR.lightSteel, 0.12, 0.84);
    tool(0.06, 0.08, COLOR.brickRed, -0.04, 0.84);
    for (const [i, c] of [COLOR.signalRed, COLOR.steelBlue, COLOR.forestGreen].entries()) {
      tool(0.03, 0.08, c, 0.08 + i * 0.07, 0.62);
      tool(0.01, 0.1, COLOR.chrome, 0.08 + i * 0.07, 0.53);
    }
    // A roll of duct tape on a peg.
    b.cylinder(
      0.055,
      0.055,
      0.04,
      COLOR.silver,
      { at: [0.32, 0.62, 0.56], rot: [Math.PI / 2, 0, 0] },
      16,
    );
    b.cylinder(0.03, 0.03, 0.042, board, { at: [0.32, 0.62, 0.56], rot: [Math.PI / 2, 0, 0] }, 12);
    return b.build();
  },
  paintShelf: () => {
    // Two steel shelves on brackets: paint tins, a box, spray cans.
    const b = new ModelBuilder();
    const steel = COLOR.pewter;
    for (const y of [0.5, 0.84]) {
      b.box(0.82, 0.03, 0.22, steel, { at: [0, y, 0.6] }, 0);
      for (const x of [-0.34, 0.34]) b.box(0.03, 0.12, 0.2, steel, { at: [x, y - 0.07, 0.59] }, 0);
    }
    const tins = [COLOR.porcelain, COLOR.sage, COLOR.terracotta, COLOR.dustyBlue, COLOR.khaki];
    for (const [i, x] of [-0.3, -0.16, -0.02].entries()) {
      const c = nthColor(tins, i);
      b.cylinder(0.06, 0.06, 0.12, COLOR.silver, { at: [x, 0.575, 0.6] }, 14);
      b.cylinder(0.061, 0.061, 0.06, c, { at: [x, 0.57, 0.6] }, 14);
      b.cylinder(0.02, 0.02, 0.004, c, { at: [x + 0.02, 0.637, 0.6] }, 8);
    }
    b.box(0.26, 0.17, 0.18, COLOR.cardboard, { at: [0.22, 0.6, 0.6] }, 0.01);
    b.box(0.262, 0.02, 0.05, 0xe8d4a8, { at: [0.22, 0.685, 0.6] }, 0);
    for (const [i, x] of [-0.28, -0.12].entries()) {
      b.cylinder(0.07, 0.07, 0.14, COLOR.silver, { at: [x, 0.925, 0.6] }, 14);
      b.cylinder(0.071, 0.071, 0.07, nthColor(tins, i + 3), { at: [x, 0.92, 0.6] }, 14);
    }
    for (const [i, x] of [0.06, 0.12, 0.18].entries()) {
      b.cylinder(
        0.025,
        0.025,
        0.15,
        nthColor([COLOR.signalRed, COLOR.charcoal, COLOR.leaf], i),
        { at: [x, 0.93, 0.62] },
        10,
      );
      b.cylinder(0.015, 0.015, 0.03, COLOR.white, { at: [x, 1.02, 0.62] }, 8);
    }
    b.box(0.12, 0.05, 0.15, COLOR.brickRed, { at: [0.3, 0.88, 0.6] }, 0.01);
    return b.build();
  },
  stickies: () => {
    // The founders' plan: a flipchart sheet taped to the block, sticky notes round it.
    const b = new ModelBuilder();
    b.box(0.4, 0.5, 0.006, COLOR.paper, { at: [-0.1, 0.72, 0.51], rot: [0, 0, -0.03] }, 0);
    for (const [x, y] of [
      [-0.28, 0.96],
      [0.08, 0.96],
    ] as const)
      b.box(0.08, 0.03, 0.004, 0xd8d0b0, { at: [x, y, 0.515] }, 0);
    // Boxes and arrows in marker: the architecture.
    const ink = COLOR.steelBlue;
    for (const [x, y, w, h] of [
      [-0.2, 0.84, 0.12, 0.07],
      [0.0, 0.84, 0.12, 0.07],
      [-0.1, 0.66, 0.16, 0.08],
    ] as const) {
      b.box(w, 0.012, 0.003, ink, { at: [x, y + h / 2, 0.515] }, 0);
      b.box(w, 0.012, 0.003, ink, { at: [x, y - h / 2, 0.515] }, 0);
      b.box(0.012, h, 0.003, ink, { at: [x - w / 2, y, 0.515] }, 0);
      b.box(0.012, h, 0.003, ink, { at: [x + w / 2, y, 0.515] }, 0);
    }
    b.box(0.012, 0.1, 0.003, COLOR.signalRed, { at: [-0.1, 0.755, 0.515], rot: [0, 0, 0.5] }, 0);
    b.box(0.2, 0.012, 0.003, COLOR.signalRed, { at: [-0.1, 0.55, 0.515] }, 0);
    const notes = [COLOR.noteYellow, COLOR.notePink, COLOR.noteGreen, COLOR.noteBlue];
    for (let i = 0; i < 7; i++) {
      const h = tileHash(i, 5);
      b.box(
        0.09,
        0.09,
        0.005,
        nthColor(notes, h),
        {
          at: [0.22 + (i % 2) * 0.11, 0.9 - Math.floor(i / 2) * 0.12, 0.515],
          rot: [0, 0, ((h >> 4) % 5) * 0.04 - 0.08],
        },
        0,
      );
    }
    return b.build();
  },
  stripLight: () => {
    // A fluorescent batten high on the wall, its cable stapled down to a socket.
    const b = new ModelBuilder();
    b.box(0.78, 0.05, 0.08, 0xd8d6cc, { at: [0, 1.0, 0.54] }, 0.01);
    b.screen(0.7, 0.026, 0xfff0d0, { at: [0, 0.972, 0.582], rot: [-0.6, 0, 0] });
    b.box(0.012, 0.5, 0.012, COLOR.white, { at: [0.36, 0.73, 0.512] }, 0);
    b.box(0.07, 0.09, 0.02, COLOR.white, { at: [0.36, 0.44, 0.515] }, 0.006);
    return b.build();
  },
  cordReel: () => {
    // An orange extension cord coiled on a hook, its end trailing to a power strip on the floor.
    const b = new ModelBuilder();
    const cord = COLOR.tangerine;
    b.box(0.04, 0.04, 0.1, COLOR.graphite, { at: [0, 0.86, 0.55] }, 0);
    for (let i = 0; i < 3; i++)
      b.torus(0.15 - i * 0.012, 0.016, cord, { at: [0, 0.71 - i * 0.012, 0.56 + i * 0.012] });
    b.box(0.016, 0.52, 0.016, cord, { at: [0.12, 0.33, 0.53], rot: [0, 0, 0.12] }, 0);
    b.box(0.3, 0.035, 0.06, COLOR.white, { at: [0.12, 0.018, 0.58] }, 0.01);
    b.led(0.01, COLOR.signalRed, { at: [0.25, 0.04, 0.58] });
    b.box(0.016, 0.016, 0.3, COLOR.charcoal, { at: [-0.05, 0.008, 0.66], rot: [0, 0.7, 0] }, 0);
    return b.build();
  },
};

/**
 * A floor tile in a theme: tiles with grout, carpet, planks, or a garage
 * slab in look `look` (see `slabFloorModel`). Instance colors tint it per tile.
 */
export function floorModel(theme: FloorTheme, look = 0): Model {
  if (theme === 'slab') return slabFloorModel(look);
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

// ---- The garage (wall theme `garage`, floor theme `slab`) ----

/** One course of cinder block, and the top of the grey-green dado painted along the bottom. */
const BLOCK_COURSE = 0.19;
const DADO_HEIGHT = 0.34;
const DADO = 0x6c7c74;
/** Paint on the block wears through to this. */
const BARE_BLOCK = 0x8f8c84;
/** Looks a garage wall comes in: clean, scuffed, chipped, water-stained. */
export const GARAGE_WALL_LOOKS = 4;

/**
 * A garage wall: painted cinder block in courses with staggered joints, a
 * grey-green dado along the bottom and a timber top plate. The courses and
 * joints run round the front and both sides, so side walls show them too;
 * `look` adds wear on the same faces.
 */
function garageWallModel(piece: WallPiece, look: number): Model {
  const h = piece === 'wall-front' ? FRONT_WALL_HEIGHT : WALL_HEIGHT;
  const { face, top } = WALL_COLORS.garage;
  const cap = 0.07;
  const body = h - cap;
  const dado = Math.min(DADO_HEIGHT, body);
  const b = new ModelBuilder();
  b.box(1, body, 1, face, { at: [0, body / 2, 0] }, 0);
  b.box(1.006, dado, 1.006, DADO, { at: [0, dado / 2, 0] }, 0);
  if (dado < body) b.box(1.01, 0.016, 1.01, tint(DADO, -0.3), { at: [0, dado, 0] }, 0);
  const mortar = (y: number) => (y < dado ? tint(DADO, -0.22) : tint(face, -0.14));
  // Bed joints all round, then head joints staggered course by course on the faces that show.
  for (let y = BLOCK_COURSE; y < body - 0.03; y += BLOCK_COURSE) {
    if (Math.abs(y - dado) > 0.02) b.box(1.012, 0.01, 1.012, mortar(y), { at: [0, y, 0] }, 0);
  }
  for (let i = 0, y0 = 0; y0 < body - 0.03; i++, y0 += BLOCK_COURSE) {
    const hh = Math.min(BLOCK_COURSE, body - y0);
    const mid = y0 + hh / 2;
    for (const o of i % 2 ? [0] : [-0.495, 0.495]) {
      b.box(0.01, hh, 0.01, mortar(mid), { at: [o, mid, 0.504] }, 0);
      for (const s of [-1, 1]) b.box(0.01, hh, 0.01, mortar(mid), { at: [s * 0.504, mid, o] }, 0);
    }
  }
  // Concrete coping on top, a little proud of the face, laid in stones.
  b.box(1, cap, 1.03, top, { at: [0, h - cap / 2, 0] }, 0);
  for (const x of [-0.495, 0.495])
    b.box(0.01, 0.004, 1.03, tint(top, -0.3), { at: [x, h + 0.001, 0] }, 0);
  for (const z of [-0.495, 0.495])
    b.box(1, 0.004, 0.012, tint(top, -0.3), { at: [0, h + 0.001, z] }, 0);
  b.box(1, 0.012, 0.012, tint(top, -0.4), { at: [0, h - cap, 0.512] }, 0);
  // Wear on the front and both sides: one look each.
  const faces: [number, number, number][] = [
    [0, 0.507, 0],
    [-0.507, 0, Math.PI / 2],
    [0.507, 0, Math.PI / 2],
  ];
  for (const [fx, fz, turn] of faces) {
    // Along the face: x on the front, z on the sides.
    const at = (u: number, y: number): [number, number, number] => (turn ? [fx, y, u] : [u, y, fz]);
    const rot: [number, number, number] = [0, turn, 0];
    if (look === 1) {
      // Scuffs on the dado: bikes, the mower, the founders' chairs.
      for (const [u, y, w] of [
        [-0.22, 0.08, 0.2],
        [0.18, 0.13, 0.14],
        [0.3, 0.05, 0.1],
      ] as const)
        if (y < dado) b.box(w, 0.035, 0.004, tint(DADO, -0.35), { at: at(u, y), rot }, 0);
    } else if (look === 2 && body > dado + 0.2) {
      // Paint chipped off the block.
      for (const [u, y, w, hh] of [
        [-0.25, dado + 0.22, 0.09, 0.06],
        [0.2, dado + 0.45, 0.06, 0.05],
        [0.05, dado + 0.1, 0.05, 0.035],
      ] as const)
        b.box(w, hh, 0.004, BARE_BLOCK, { at: at(u, y), rot }, 0);
    } else if (look === 3 && body > dado + 0.2) {
      // A water stain running down from the top plate.
      const len = body - dado - 0.1;
      b.box(0.14, len, 0.004, tint(face, -0.12), { at: at(0.12, body - len / 2), rot }, 0);
      b.box(0.07, 0.12, 0.004, tint(face, -0.12), { at: at(0.1, body - len - 0.05), rot }, 0);
    }
  }
  return b.build();
}

/** Expansion joints are cut every this many tiles. */
export const SLAB_JOINT_EVERY = 3;
/** Wear a slab tile comes in: none, scuffs, a patch, a crack, paint spills. */
export const SLAB_WEAR = 5;

/**
 * The look of the slab tile at (x, y) for a hash `hash`: joint bits (1 on
 * its west edge, 2 on its north edge) and the wear in the rest, about half
 * the tiles bare.
 */
export function slabLook(x: number, y: number, hash: number): number {
  const joints = (x % SLAB_JOINT_EVERY === 0 ? 1 : 0) | (y % SLAB_JOINT_EVERY === 0 ? 2 : 0);
  const roll = hash % 10;
  const wear = roll < 5 ? 0 : 1 + ((roll - 5) % (SLAB_WEAR - 1));
  return joints | (wear << 2);
}

/**
 * A tile of a garage's sealed concrete slab, no grout: saw-cut expansion
 * joints on its west and north edges when `look` says so (see `slabLook`),
 * and wear on top: boot and tyre scuffs, an old patch, a hairline crack,
 * paint spilt from the shelf.
 */
function slabFloorModel(look: number): Model {
  const [a, joint] = FLOOR_COLORS.slab;
  const b = new ModelBuilder();
  b.box(1, 0.012, 1, a, { at: [0, -0.006, 0] }, 0);
  // Decals lie just over the top, the joints a hair under the stains.
  const mark = (w: number, d: number, color: number, x: number, z: number, turn = 0) =>
    b.box(w, 0.002, d, color, { at: [x, 0.0005, z], rot: [0, turn, 0] }, 0);
  if (look & 1) mark(0.028, 1, joint, -0.5, 0);
  if (look & 2) mark(1, 0.028, joint, 0, -0.5);
  switch (look >> 2) {
    case 1:
      for (const [x, z, w, turn] of [
        [-0.15, 0.1, 0.34, 0.4],
        [0.05, 0.18, 0.26, 0.5],
        [0.22, -0.2, 0.18, -0.9],
      ] as const)
        mark(w, 0.025, tint(a, -0.2), x, z, turn);
      break;
    case 2:
      mark(0.44, 0.32, tint(a, 0.08), 0.1, -0.05, 0.12);
      break;
    case 3: {
      // A hairline crack wandering across.
      let [x, z] = [-0.42, -0.1];
      for (const [dx, dz] of [
        [0.2, 0.08],
        [0.16, -0.06],
        [0.22, 0.1],
        [0.18, 0.04],
      ] as const) {
        mark(
          Math.hypot(dx, dz),
          0.012,
          tint(a, -0.42),
          x + dx / 2,
          z + dz / 2,
          -Math.atan2(dz, dx),
        );
        x += dx;
        z += dz;
      }
      break;
    }
    case 4:
      for (const [x, z, r, color] of [
        [0.18, 0.12, 0.07, COLOR.porcelain],
        [0.28, 0.24, 0.03, COLOR.porcelain],
        [-0.22, -0.18, 0.045, COLOR.dustyBlue],
      ] as const)
        b.cylinder(r, r, 0.002, color, { at: [x, 0.0005, z] }, 14);
      break;
  }
  return b.build();
}

/**
 * The oil stain where the family car stood, about a tile and a half across:
 * a dark satin core in overlapping blots, a paler soaked ring round it, and
 * drips toward the door (+z).
 */
export function oilStainModel(): Model {
  const b = new ModelBuilder();
  const blots: readonly [number, number, number][] = [
    [0, 0, 0.34],
    [0.3, 0.1, 0.24],
    [-0.28, -0.04, 0.26],
    [0.08, -0.24, 0.2],
    [-0.1, 0.26, 0.18],
  ];
  for (const [x, z, r] of blots)
    b.cylinder(r + 0.12, r + 0.12, 0.003, 0x5e5d5a, { at: [x, 0.0015, z] }, 24);
  for (const [x, z, r] of blots) b.cylinder(r, r, 0.003, 0x262628, { at: [x, 0.003, z] }, 24);
  for (const [x, z, r] of [
    [0.16, 0.62, 0.06],
    [-0.24, 0.7, 0.04],
    [0.02, 0.86, 0.03],
    [0.5, -0.3, 0.05],
  ] as const)
    b.cylinder(r, r, 0.003, 0x2a2a2b, { at: [x, 0.003, z] }, 12);
  return b.build();
}

/** The steel of the roll-up doors and their trim. */
const DOOR_STEEL = 0xe0dcd0;
const TRIM = 0xe2dccd;

/**
 * The bottom of a closed sectional garage door, standing in for a front
 * wall: ribbed white steel at the wall's outer face with a rubber seal, the
 * cut top showing the panel's edge. `handle` puts the lift handle at its +x
 * edge (the middle of a two-tile door).
 */
export function garageDoorModel(handle: boolean): Model {
  const b = new ModelBuilder();
  const h = FRONT_WALL_HEIGHT + 0.14;
  const z = 0.3;
  b.box(1, h, 0.08, DOOR_STEEL, { at: [0, h / 2, z] }, 0);
  b.box(1, 0.03, 0.09, 0x2b2b2b, { at: [0, 0.015, z] }, 0);
  for (const y of [0.12, 0.24])
    b.box(1, 0.014, 0.084, tint(DOOR_STEEL, -0.3), { at: [0, y, z] }, 0);
  b.box(1, 0.012, 0.09, tint(DOOR_STEEL, 0.4), { at: [0, h - 0.006, z] }, 0);
  // The track the door runs in, along its inner side.
  b.box(1, 0.02, 0.05, COLOR.steel, { at: [0, 0.01, z - 0.12] }, 0);
  if (handle) {
    b.box(0.16, 0.035, 0.03, COLOR.graphite, { at: [0.5, 0.17, z + 0.055] }, 0);
    b.box(0.08, 0.06, 0.012, COLOR.chrome, { at: [0.5, 0.17, z + 0.044] }, 0);
  }
  return b.build();
}

/**
 * One side of the open roll-up door at the ship hatch: a painted wooden jamb
 * with the door's steel track inside it and a bump guard in hazard stripes,
 * standing on the pier just beside the opening. Thin and only knee high on a
 * developer, so it hides nothing behind. Symmetric, so one model does both sides.
 */
export function doorJambModel(): Model {
  const b = new ModelBuilder();
  const h = 0.62;
  const z = 0.3;
  b.box(0.12, h, 0.14, TRIM, { at: [0, h / 2, z] }, 0.012);
  b.box(0.05, h + 0.02, 0.05, COLOR.steel, { at: [0, (h + 0.02) / 2, z - 0.1] }, 0);
  for (let i = 0; i < 6; i++)
    b.box(0.13, 0.05, 0.15, i % 2 ? COLOR.gold : PALETTE.ink, { at: [0, 0.2 + i * 0.05, z] }, 0);
  return b.build();
}

/**
 * The door into the house round the inbox: white casing up both sides and a
 * header over it, and behind the station the warm hallway seen through it,
 * a coat hook and a picture on its wall. Built round a station on the back
 * edge, the opening toward −z.
 */
export function houseDoorModel(): Model {
  const b = new ModelBuilder();
  const top = WALL_HEIGHT + 0.08;
  for (const x of [-0.46, 0.46]) b.box(0.1, top, 0.16, TRIM, { at: [x, top / 2, -0.38] }, 0.01);
  b.box(1.06, 0.12, 0.18, TRIM, { at: [0, top + 0.02, -0.38] }, 0.015);
  // The hallway: a warm lit wall, a skirting, a picture and a coat on a hook.
  const hall = 0xe2b979;
  const hallH = top - STATION_HEIGHT;
  b.box(0.84, hallH, 0.03, hall, { at: [0, STATION_HEIGHT + hallH / 2, -0.47] }, 0);
  b.box(0.22, 0.16, 0.015, COLOR.woodFrame, { at: [0.18, STATION_HEIGHT + 0.42, -0.45] }, 0);
  b.box(0.16, 0.1, 0.004, 0x8ab0c8, { at: [0.18, STATION_HEIGHT + 0.42, -0.442] }, 0);
  b.box(0.12, 0.26, 0.06, COLOR.brickRed, { at: [-0.25, STATION_HEIGHT + 0.36, -0.43] }, 0.03);
  // The door itself, swung open into the house.
  b.box(0.05, top - 0.04, 0.42, 0xc9b48e, { at: [-0.39, (top - 0.04) / 2, -0.66] }, 0.01);
  b.sphere(0.022, COLOR.brass, { at: [-0.36, 0.52, -0.82] });
  return b.build();
}

/** A coir doormat in front of the house door, a pair of sneakers kicked off beside it. */
export function doormatModel(): Model {
  const b = new ModelBuilder();
  b.box(0.6, 0.014, 0.36, 0x6b5338, { at: [0, 0.007, -0.22] }, 0);
  b.box(0.5, 0.016, 0.26, 0x9a7a52, { at: [0, 0.008, -0.22] }, 0);
  for (const [x, turn] of [
    [0.4, 0.3],
    [0.48, 0.1],
  ] as const) {
    b.box(0.07, 0.04, 0.17, COLOR.white, { at: [x, 0.02, -0.3], rot: [0, turn, 0] }, 0.015);
    b.box(0.072, 0.012, 0.172, COLOR.brickRed, { at: [x, 0.006, -0.3], rot: [0, turn, 0] }, 0);
  }
  return b.build();
}

/** 3×5 letters, hand-painted on the banner, rows top first. */
const BANNER_FONT: Readonly<Record<string, readonly string[]>> = {
  S: ['###', '#..', '###', '..#', '###'],
  H: ['#.#', '#.#', '###', '#.#', '#.#'],
  I: ['###', '.#.', '.#.', '.#.', '###'],
  P: ['###', '#.#', '###', '#..', '#..'],
  T: ['###', '.#.', '.#.', '.#.', '.#.'],
  '!': ['#', '#', '#', '.', '#'],
  ' ': ['.', '.', '.', '.', '.'],
};
/** What the banner says, letter by letter. */
const BANNER_TEXT: readonly string[] = ['S', 'H', 'I', 'P', ' ', 'I', 'T', '!'];

/**
 * A bedsheet banner on two broom handles on top of the back wall, `width`
 * tiles wide, "SHIP IT!" painted on in red by hand: every dab a little off.
 * Leans back toward the camera so it reads.
 */
export function bannerModel(width: number): Model {
  const b = new ModelBuilder();
  const sheetW = width - 0.3;
  const sheetH = 0.5;
  const lean = -0.32;
  const cy = WALL_HEIGHT + 0.48;
  for (const s of [-1, 1]) {
    const x = s * (sheetW / 2 + 0.04);
    b.cylinder(0.022, 0.022, 0.86, COLOR.woodLight, { at: [x, WALL_HEIGHT + 0.43, 0] }, 8);
    b.box(0.06, 0.05, 0.06, COLOR.charcoal, { at: [x, WALL_HEIGHT + 0.06, 0] }, 0);
  }
  // The sheet, and the paint on it, in the sheet's leaned space (y up it, z out of it).
  const cos = Math.cos(lean);
  const sin = Math.sin(lean);
  const lay = (
    w: number,
    h: number,
    d: number,
    color: number,
    x: number,
    y: number,
    z: number,
    rz = 0,
  ) =>
    b.box(
      w,
      h,
      d,
      color,
      { at: [x, cy + y * cos - z * sin, y * sin + z * cos], rot: [lean, 0, rz] },
      0,
    );
  lay(sheetW, sheetH, 0.012, 0xebe4d4, 0, 0, 0);
  const paint = 0xc0392b;
  const columns = BANNER_TEXT.reduce((n, c) => n + (BANNER_FONT[c]?.[0]?.length ?? 0) + 1, -1);
  const px = Math.min((sheetW - 0.2) / columns, (sheetH - 0.12) / 5);
  let col = 0;
  let dab = 0;
  for (const c of BANNER_TEXT) {
    const rows = BANNER_FONT[c] ?? [];
    const w = rows[0]?.length ?? 0;
    rows.forEach((row, r) => {
      for (let i = 0; i < w; i++) {
        if (row[i] !== '#') continue;
        const h = tileHash(dab++, r + 11);
        const x = (col + i - columns / 2 + 0.5) * px + ((h % 7) - 3) * px * 0.03;
        const y = (2 - r) * px + (((h >> 3) % 7) - 3) * px * 0.03;
        lay(px * 1.02, px * 1.02, 0.006, paint, x, y, 0.008, (((h >> 6) % 5) - 2) * 0.04);
        // Now and then a drip under the bottom row.
        if (r === 4 && h % 3 === 0) lay(px * 0.2, px * 0.7, 0.005, paint, x, -2.6 * px, 0.008);
      }
    });
    col += w + 1;
  }
  return b.build();
}

/**
 * A bare bulb hanging on its flex from the rafters, built round the bulb (at
 * the origin) so it hangs where the room's warm lamps shine from. The bulb
 * draws in the glow layer, so it blooms.
 */
export function bulbModel(): Model {
  const b = new ModelBuilder();
  b.led(0.055, 0xffd890, { at: [0, 0, 0] });
  b.cylinder(0.03, 0.035, 0.07, COLOR.charcoal, { at: [0, 0.075, 0] }, 10);
  b.cylinder(0.006, 0.006, 1.2, COLOR.charcoal, { at: [0, 0.71, 0] }, 4);
  return b.build();
}
