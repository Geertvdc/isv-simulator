import type { FloorTheme, WallTheme } from '../mapLook';
import type { WallPiece } from '../mapShape';
import { type Model, ModelBuilder, tint } from './kit';
import { FRONT_WALL_HEIGHT, STATION_HEIGHT, WALL_HEIGHT } from './layout';
import { FLOOR_COLORS, PALETTE, WALL_COLORS } from './look';
import { COLOR } from './palette';

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
