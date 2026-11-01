import * as THREE from 'three';
import { tileHash, type WallPiece } from '../../mapShape';
import { type Model, ModelBuilder, tint } from '../kit';
import { FRONT_WALL_HEIGHT, SLAB_DEPTH, STATION_HEIGHT, WALL_HEIGHT } from '../layout';
import { FLOOR_COLORS, WALL_COLORS } from '../look';
import { COLOR } from '../palette';
import { BOARD_WEAR, RUNNER } from '../rooms/warehouseRoom';
import type { CounterRun } from '../rooms/counterRun';
import type { StationModel } from '../stationModels';

/**
 * The biscuit works (wall theme `warehouse`, floor theme `boards`), built in
 * code: red brick walls in courses over a painted band with stone coping,
 * the dressed stone plinth, wide old floorboards and their wear, the
 * hallway runner, scaffold-board counters, the entrance-hall door, the
 * loading-bay door, the tenants' doors, what hangs on the brick, and the
 * Edison bulbs.
 */

/** `a` mixed `t` of the way toward `b`, per channel. */
function mix(a: number, b: number, t: number): number {
  const ch = (shift: number) => {
    const x = (a >> shift) & 0xff;
    const y = (b >> shift) & 0xff;
    return Math.round(x + (y - x) * t) << shift;
  };
  return ch(16) | ch(8) | ch(0);
}

/** A flat ellipse lying on the floor (or turned by `rot`), `rx` by `rz`. */
function ellipse(
  b: ModelBuilder,
  rx: number,
  rz: number,
  color: number,
  at: [number, number, number],
  rot: [number, number, number] = [0, 0, 0],
  h = 0.002,
): void {
  const g = new THREE.CylinderGeometry(1, 1, h, 20);
  g.scale(rx, 1, rz);
  b.add(g, color, { at, rot });
}

// ---- Brick walls ----

/** One course of brick, and a brick's length: four to a tile, every other course offset by half. */
const COURSE = 0.115;
const BRICK = 0.25;
/** The painted band along the bottom of the inside walls. */
const BAND = 0.36;
const BAND_PAINT = 0xd6cfbf;
const MORTAR = 0xb2a491;
/** How far the coping overhangs the brick, and how thick it is. */
const LIP = 0.035;
const CAP = 0.07;
/** Looks a brick wall comes in: clean, sooty, salt bloom (efflorescence), a patched section. */
export const WAREHOUSE_WALL_LOOKS = 4;

/** Brick tones: mostly the wall's own, a few darker, a few more orange, a rare purple-brown header. */
function brickTone(face: number, h: number): number {
  const r = h % 13;
  if (r < 6) return face;
  if (r < 8) return tint(face, -0.1);
  if (r < 10) return mix(face, 0xb86a44, 0.4);
  if (r < 12) return tint(face, 0.06);
  return mix(face, 0x5e3a34, 0.5);
}

/** The four faces of a wall tile: where along it `u` and up it `y` land, and its turn. */
const FACES: readonly {
  at: (u: number, y: number, d: number) => [number, number, number];
  turn: number;
}[] = [
  { at: (u, y, d) => [u, y, 0.5 + d], turn: 0 },
  { at: (u, y, d) => [-u, y, -0.5 - d], turn: 0 },
  { at: (u, y, d) => [0.5 + d, y, -u], turn: Math.PI / 2 },
  { at: (u, y, d) => [-0.5 - d, y, u], turn: Math.PI / 2 },
];

/**
 * A biscuit-works wall: red brick in courses with staggered joints (the
 * bricks proud of pale mortar, each in its own tone) round all four faces,
 * a limewashed band along the bottom of full walls with the coursing faint
 * through the paint, and cool stone coping with a lip on top. `look` adds
 * soot, a salt bloom or a patched section on the same faces, and shades
 * the coping stone, so a run of wall isn't one flat slab.
 */
export function warehouseWallModel(piece: WallPiece, look: number): Model {
  const b = new ModelBuilder();
  const h = piece === 'wall-front' ? FRONT_WALL_HEIGHT : WALL_HEIGHT;
  buildBrickWall(b, h, piece === 'wall-front' ? 0 : BAND, look);
  return b.build();
}

function buildBrickWall(b: ModelBuilder, h: number, bandHeight: number, look: number): void {
  const { face, top } = WALL_COLORS.warehouse;
  const body = h - CAP;
  const band = Math.min(bandHeight, body);
  b.box(1, body, 1, MORTAR, { at: [0, body / 2, 0] }, 0);
  if (band > 0) {
    b.box(1.012, band, 1.012, BAND_PAINT, { at: [0, band / 2, 0] }, 0);
    // The brick shows faintly through the limewash, and the paint's top edge.
    for (let y = COURSE; y < band - 0.02; y += COURSE)
      b.box(1.016, 0.01, 1.016, tint(BAND_PAINT, -0.07), { at: [0, y, 0] }, 0);
    b.box(1.018, 0.014, 1.018, tint(BAND_PAINT, -0.22), { at: [0, band, 0] }, 0);
    // A darker skirting where mops and boots hit it.
    b.box(1.016, 0.05, 1.016, tint(BAND_PAINT, -0.12), { at: [0, 0.025, 0] }, 0);
  }
  // Bricks on all four faces, course by course from the band up; courses line up from tile to tile.
  const first = Math.ceil(band / COURSE - 0.001);
  FACES.forEach((f, fi) => {
    const rot: [number, number, number] = [0, f.turn, 0];
    for (let c = first; c * COURSE < body - 0.02; c++) {
      const y0 = Math.max(c * COURSE, band);
      const y1 = Math.min((c + 1) * COURSE, body);
      if (y1 - y0 < 0.03) continue;
      const shift = c % 2 ? BRICK / 2 : 0;
      for (let k = -1; k < 1 / BRICK + 1; k++) {
        const u0 = Math.max(-0.5, -0.5 + k * BRICK - shift + 0.007);
        const u1 = Math.min(0.5, -0.5 + (k + 1) * BRICK - shift - 0.007);
        if (u1 - u0 < 0.02) continue;
        const tone = brickTone(face, tileHash(c * 7 + fi, k + 40 + look * 13));
        b.box(
          u1 - u0,
          y1 - y0 - 0.014,
          0.008,
          tone,
          {
            at: f.at((u0 + u1) / 2, (y0 + y1) / 2, 0.003),
            rot,
          },
          0,
        );
      }
    }
    const above = body - band;
    if (above < 0.3) return;
    // Wear on the face, over the bricks.
    const over = (u: number, y: number, w: number, hh: number, color: number, d = 0.009) =>
      b.box(w, hh, 0.004, color, { at: f.at(u, y, d), rot }, 0);
    if (look === 1) {
      // Soot from the old ovens: a dark wash under the coping, streaks running down from it.
      over(0, body - 0.06, 1, 0.12, tint(face, -0.22));
      for (const [u, w, len] of [
        [-0.28, 0.16, 0.42],
        [0.12, 0.1, 0.3],
        [0.34, 0.12, 0.5],
      ] as const) {
        over(u, body - len / 2, w, len, tint(face, -0.18), 0.01);
        over(u + 0.01, body - len / 3, w * 0.5, (len * 2) / 3, tint(face, -0.3), 0.011);
      }
    } else if (look === 2) {
      // Salt bloom (efflorescence): white blotches where damp dried out of the brick.
      const salt = mix(face, 0xf0ece0, 0.5);
      const faint = mix(face, 0xf0ece0, 0.28);
      for (const [u, y, w, hh] of [
        [-0.2, band + 0.12, 0.42, 0.1],
        [-0.12, band + 0.2, 0.22, 0.08],
        [0.22, band + 0.36, 0.26, 0.09],
        [0.28, band + 0.44, 0.12, 0.06],
      ] as const) {
        over(u, y, w + 0.08, hh + 0.05, faint, 0.01);
        over(u, y, w, hh, salt, 0.011);
      }
    } else if (look === 3) {
      // A patched section: newer, more orange brick in crisp courses where a window was bricked up.
      const [u0, u1] = [-0.36, 0.18];
      const y0 = band + COURSE * 1.5;
      const rows = Math.min(4, Math.floor((body - y0 - 0.06) / COURSE));
      if (rows >= 2) {
        over((u0 + u1) / 2, y0 + (rows * COURSE) / 2, u1 - u0, rows * COURSE, 0xc4b8a6, 0.01);
        for (let r = 0; r < rows; r++) {
          const s = r % 2 ? BRICK / 4 : 0;
          for (let u = u0 + s; u < u1 - 0.03; u += BRICK * 0.75) {
            const w = Math.min(BRICK * 0.75, u1 - u) - 0.014;
            const tone = tint(0xb4593a, ((tileHash(r, Math.round(u * 40)) % 3) - 1) * 0.05);
            b.box(
              w,
              COURSE - 0.016,
              0.006,
              tone,
              {
                at: f.at(u + w / 2 + 0.007, y0 + r * COURSE + COURSE / 2, 0.013),
                rot,
              },
              0,
            );
          }
        }
        // A concrete lintel over it, a reminder of the window that was there.
        over((u0 + u1) / 2, y0 + rows * COURSE + 0.03, u1 - u0 + 0.12, 0.06, 0x9c978d, 0.014);
      }
    }
  });
  // Stone coping on top, overhanging every face, a dark line in the shadow of its lip.
  const w = 1 + LIP * 2;
  b.box(1.03, 0.014, 1.03, tint(face, -0.5), { at: [0, body - 0.007, 0] }, 0);
  b.box(w, CAP * 0.45, w, tint(top, -0.14), { at: [0, body + CAP * 0.225, 0] }, 0);
  b.box(w - 0.02, CAP * 0.55, w - 0.02, top, { at: [0, h - CAP * 0.275, 0] }, 0);
  // Two stones to a tile, each its own shade, a joint between and at the tile's edges.
  const shades = [
    [0.03, -0.04],
    [-0.02, 0.05],
    [0.05, -0.01],
    [-0.05, 0.02],
  ][look] ?? [0, 0];
  shades.forEach((t, i) =>
    b.box(0.5, 0.004, 1, tint(top, t), { at: [-0.25 + i * 0.5, h + 0.002, 0] }, 0),
  );
  const joint = tint(top, -0.32);
  for (const x of [-0.5, 0]) b.box(0.016, 0.004, w - 0.02, joint, { at: [x, h + 0.003, 0] }, 0);
  b.box(w - 0.02, 0.004, 0.012, joint, { at: [0, h + 0.003, -0.5] }, 0);
  // A pale worn arris along the lip's front edge, and weathering: lichen and grime spots.
  b.box(w - 0.02, 0.004, 0.03, tint(top, 0.1), { at: [0, h + 0.0025, 0.5 + LIP - 0.03] }, 0);
  for (let i = 0; i < 5; i++) {
    const hh = tileHash(i + 9, look + 31);
    const lichen = i === 4 && look % 2 === 0;
    b.box(
      0.03 + (hh % 5) * 0.014,
      0.004,
      0.025 + ((hh >> 3) % 4) * 0.012,
      lichen ? mix(top, 0x9aa070, 0.45) : tint(top, -0.14),
      {
        at: [((hh >> 5) % 80) / 100 - 0.4, h + 0.0035, ((hh >> 11) % 80) / 100 - 0.4],
        rot: [0, ((hh >> 7) % 6) * 0.5, 0],
      },
      0,
    );
  }
}

/**
 * The cast-iron pipe under the coping of a back wall, along its face, on
 * brackets; at a run's end it turns back into the wall with an elbow.
 */
export function wallPipeModel(end: 'mid' | 'west' | 'east' | 'both'): Model {
  const b = new ModelBuilder();
  const iron = 0x3b3f42;
  const y = WALL_HEIGHT - CAP - 0.09;
  const z = 0.56;
  const x0 = end === 'west' || end === 'both' ? -0.3 : -0.5;
  const x1 = end === 'east' || end === 'both' ? 0.3 : 0.5;
  b.cylinder(
    0.032,
    0.032,
    x1 - x0,
    iron,
    { at: [(x0 + x1) / 2, y, z], rot: [0, 0, Math.PI / 2] },
    10,
  );
  // A collar at the joint, a bracket into the brick.
  b.cylinder(0.04, 0.04, 0.05, tint(iron, 0.1), { at: [0, y, z], rot: [0, 0, Math.PI / 2] }, 10);
  b.box(0.03, 0.03, 0.07, tint(iron, -0.2), { at: [0.25, y, z - 0.035] }, 0);
  for (const [x, on] of [
    [x0, end === 'west' || end === 'both'],
    [x1, end === 'east' || end === 'both'],
  ] as const) {
    if (!on) continue;
    b.sphere(0.04, iron, { at: [x, y, z] });
    b.cylinder(0.032, 0.032, 0.07, iron, { at: [x, y, z - 0.04], rot: [Math.PI / 2, 0, 0] }, 10);
  }
  return b.build();
}

// ---- The stone plinth ----

/** Looks the plinth comes in: tone, and damp at its foot on one. */
export const PLINTH_LOOKS = 3;
const PLINTH = 0x8e897f;

/**
 * The dressed stone plinth under a tile, standing in for the diorama's
 * wooden slab: two courses of squared blocks (staggered), each a shade of
 * its own, a weathered top course proud of the one below, a pale arris at
 * the floor's edge; on one look damp rising green-grey at its foot.
 */
export function plinthModel(look: number): Model {
  const b = new ModelBuilder();
  const top = -0.013;
  const bottom = top - SLAB_DEPTH;
  b.box(1.002, SLAB_DEPTH, 1.002, tint(PLINTH, -0.25), { at: [0, top - SLAB_DEPTH / 2, 0] }, 0);
  const courses: [number, number, number][] = [
    // [top, height, proud]
    [top, 0.19, 0.012],
    [top - 0.2, SLAB_DEPTH - 0.2, 0.004],
  ];
  FACES.forEach((f, fi) => {
    const rot: [number, number, number] = [0, f.turn, 0];
    courses.forEach(([y0, hh, proud], c) => {
      const shift = c % 2 ? 0.25 : 0;
      for (let k = -1; k < 3; k++) {
        const u0 = Math.max(-0.5, -0.5 + k * 0.5 - shift + 0.006);
        const u1 = Math.min(0.5, -0.5 + (k + 1) * 0.5 - shift - 0.006);
        if (u1 - u0 < 0.02) continue;
        const hs = tileHash(fi * 5 + c, k + 20 + look * 7);
        const tone = tint(PLINTH, ((hs % 7) - 3) * 0.025 + (look === 1 ? -0.03 : 0));
        b.box(
          u1 - u0,
          hh - 0.012,
          0.006 + proud,
          tone,
          {
            at: f.at((u0 + u1) / 2, y0 - hh / 2, proud / 2),
            rot,
          },
          0,
        );
        // Tooling: a few fine horizontal lines dressed into each block.
        if (c === 0)
          b.box(
            u1 - u0 - 0.04,
            0.006,
            0.004,
            tint(tone, -0.08),
            {
              at: f.at((u0 + u1) / 2, y0 - hh * 0.62, proud + 0.004),
              rot,
            },
            0,
          );
      }
    });
    // The arris at the floor's edge, and damp at the foot.
    b.box(1.03, 0.012, 0.006, tint(PLINTH, 0.16), { at: f.at(0, top - 0.006, 0.014), rot }, 0);
    if (look === 2) {
      const damp = mix(PLINTH, 0x55604f, 0.45);
      b.box(1.004, 0.08, 0.004, damp, { at: f.at(0, bottom + 0.04, 0.012), rot }, 0);
      b.box(0.3, 0.05, 0.004, damp, { at: f.at(0.12, bottom + 0.1, 0.012), rot }, 0);
    }
  });
  return b.build();
}

// ---- The floorboards ----

/** Board patterns (`look & 3`): where each of a tile's three boards has a butt joint, if anywhere. */
const BUTTS: readonly (readonly (number | null)[])[] = [
  [null, 0.18, -0.3],
  [0.32, null, 0.05],
  [-0.12, 0.4, null],
  [null, -0.24, 0.3],
];
/** Board tones, per board segment, around the floor's color. */
const BOARD_TONES = [0, -0.09, 0.06, -0.13, 0.09, -0.04, 0.03];

/** The look of the boards at (x, y) with `wear`: a board pattern, and the wear in the rest. */
export function boardLook(x: number, y: number, wear: number): number {
  return ((tileHash(x + 3, y + 11) >>> 4) % BUTTS.length) | (wear << 2);
}

/** A tile's brightness: a little up and down from tile to tile (the boards run on). */
export function boardTone(x: number, y: number, salt: number): number {
  const h = ((tileHash(x, y) ^ salt) >>> 3) % 101;
  return 1 + (h / 100 - 0.5) * 0.03;
}

/**
 * A tile of old wide floorboards, three across, running left to right: each
 * board in its own tone, dark gaps between, butt joints where the pattern
 * says, knots and grain; then its wear (see `BOARD_WEAR`) or its piece of
 * the hallway runner.
 */
export function boardsFloorModel(look: number): Model {
  const [a, gap] = FLOOR_COLORS.boards;
  const b = new ModelBuilder();
  const pattern = look & 3;
  const wear = look >> 2;
  b.box(1, 0.01, 1, gap, { at: [0, -0.009, 0] }, 0);
  const pale = mix(a, 0xe0cfae, 0.38);
  const width = 1 / 3;
  for (let i = 0; i < 3; i++) {
    const z = -0.5 + width * (i + 0.5);
    const butt = BUTTS[pattern]?.[i] ?? null;
    const segments: [number, number][] =
      butt === null
        ? [[-0.5, 0.5]]
        : [
            [-0.5, butt],
            [butt, 0.5],
          ];
    segments.forEach(([u0, u1], s) => {
      let tone = tint(a, BOARD_TONES[(pattern * 3 + i * 2 + s) % BOARD_TONES.length] ?? 0);
      if (wear === BOARD_WEAR.newBoard && i === 1) tone = mix(a, 0xd9b27c, 0.45);
      const gapU = 0.006;
      const x0 = u0 + (u0 > -0.5 ? gapU : 0);
      const x1 = u1 - (u1 < 0.5 ? gapU : 0);
      if (wear === BOARD_WEAR.path) {
        // The finish walked off: paler toward the middle of the tile, in pieces so the gaps still show.
        const n = 5;
        for (let k = 0; k < n; k++) {
          const p0 = x0 + ((x1 - x0) * k) / n;
          const p1 = x0 + ((x1 - x0) * (k + 1)) / n;
          const d = Math.hypot((p0 + p1) / 2, z * 1.3);
          const t = Math.max(0, 0.55 - d) / 0.55;
          b.box(
            p1 - p0,
            0.012,
            width - 0.012,
            mix(tone, pale, 0.35 + t * 0.4),
            {
              at: [(p0 + p1) / 2, -0.006, z],
            },
            0,
          );
        }
      } else {
        b.box(x1 - x0, 0.012, width - 0.012, tone, { at: [(x0 + x1) / 2, -0.006, z] }, 0);
      }
      // Grain: two long faint streaks.
      const hs = tileHash(pattern * 5 + i, s + 3);
      for (let g = 0; g < 2; g++)
        b.box(
          (x1 - x0) * (0.4 + ((hs >> (g * 3)) % 4) * 0.12),
          0.002,
          0.008,
          tint(tone, -0.1),
          {
            at: [(x0 + x1) / 2 + (((hs >> 6) % 5) - 2) * 0.04, 0.0006, z - 0.07 + g * 0.11],
          },
          0,
        );
    });
    // Nail heads at the joists' line, both ends of the tile.
    for (const x of [-0.46, 0.04])
      b.box(0.016, 0.002, 0.016, tint(a, -0.45), { at: [x, 0.0008, z + 0.07] }, 0);
  }
  // Knots on some patterns: a dark eye in a lighter ring.
  if (pattern % 2 === 1) {
    const [x, z] = pattern === 1 ? [-0.2, 0.0] : [0.27, -0.33];
    ellipse(b, 0.045, 0.028, tint(a, -0.06), [x, 0.0008, z]);
    ellipse(b, 0.024, 0.016, tint(a, -0.42), [x, 0.0012, z]);
  }
  if (wear === BOARD_WEAR.scuffs) {
    for (const [x, z, w, turn] of [
      [-0.18, 0.12, 0.3, 0.3],
      [0.08, 0.22, 0.22, 0.5],
      [0.24, -0.16, 0.16, -0.8],
    ] as const)
      b.box(w, 0.002, 0.02, tint(a, -0.14), { at: [x, 0.001, z], rot: [0, turn, 0] }, 0);
    // A pale arc where a chair swung round.
    b.add(new THREE.TorusGeometry(0.22, 0.008, 4, 20, 1.6), mix(a, pale, 0.6), {
      at: [0.05, 0.001, -0.05],
      rot: [-Math.PI / 2, 0, 0.4],
    });
  } else if (wear === BOARD_WEAR.hatch) {
    // An old goods hatch: its cut round the edge, strap hinges, a ring let into it.
    const s = 0.78;
    const line = tint(a, -0.42);
    for (const [w, d, x, z] of [
      [s, 0.014, 0, -s / 2],
      [s, 0.014, 0, s / 2],
      [0.014, s, -s / 2, 0],
      [0.014, s, s / 2, 0],
    ] as const)
      b.box(w, 0.002, d, line, { at: [x, 0.0012, z] }, 0);
    b.box(s - 0.02, 0.002, s - 0.02, tint(a, -0.04), { at: [0, 0.0008, 0] }, 0);
    for (const z of [-0.22, 0.22]) {
      b.box(0.26, 0.004, 0.05, 0x3e3d3b, { at: [-s / 2 + 0.13, 0.002, z] }, 0);
      b.cylinder(0.012, 0.012, 0.005, 0x6a6864, { at: [-s / 2 + 0.06, 0.003, z] }, 6);
    }
    b.add(new THREE.TorusGeometry(0.06, 0.012, 6, 18), 0x45433f, {
      at: [s / 2 - 0.14, 0.004, 0],
      rot: [-Math.PI / 2, 0, 0],
    });
    b.box(0.05, 0.004, 0.03, 0x3e3d3b, { at: [s / 2 - 0.07, 0.003, 0] }, 0);
  } else if (wear >= RUNNER) {
    runner(b, Math.floor((wear - RUNNER) / 3), (wear - RUNNER) % 3, a);
  }
  return b.build();
}

/** The runner's colors: a faded madder field, an ochre border, cream and slate in its pattern. */
const RUG = { field: 0xa45a4c, border: 0xcfa66e, line: 0x6a3e38, cream: 0xe0cba4, slate: 0x56707a };

/**
 * A tile's piece of the hallway runner: `part` 0 is a whole narrow runner,
 * 1 the top half of a wide one (its outer edge at the back), 2 the bottom
 * half; `end` 1 or 2 its west or east end, fringed.
 */
function runner(b: ModelBuilder, part: number, end: number, floor: number): void {
  const [z0, z1] = part === 1 ? [-0.22, 0.5] : part === 2 ? [-0.5, 0.22] : [-0.36, 0.36];
  const [x0, x1] = end === 1 ? [-0.3, 0.5] : end === 2 ? [-0.5, 0.3] : [-0.5, 0.5];
  const y = 0.004;
  const rect = (u0: number, u1: number, w0: number, w1: number, color: number, dy: number) =>
    b.box(u1 - u0, 0.004, w1 - w0, color, { at: [(u0 + u1) / 2, y + dy, (w0 + w1) / 2] }, 0);
  // Its shadow on the boards, then the border, then the field inside it.
  const outerZ0 = part === 2 ? z0 : z0 - 0.012;
  const outerZ1 = part === 1 ? z1 : z1 + 0.012;
  rect(
    end === 1 ? x0 - 0.012 : x0,
    end === 2 ? x1 + 0.012 : x1,
    outerZ0,
    outerZ1,
    tint(floor, -0.3),
    -0.003,
  );
  rect(x0, x1, z0, z1, RUG.border, 0);
  const bw = 0.09;
  const f0 = part === 2 ? z0 : z0 + bw;
  const f1 = part === 1 ? z1 : z1 - bw;
  const g0 = end === 1 ? x0 + bw : x0;
  const g1 = end === 2 ? x1 - bw : x1;
  rect(g0, g1, f0 - (part === 2 ? 0 : 0.014), f1 + (part === 1 ? 0 : 0.014), RUG.line, 0.0005);
  rect(g0 + (end === 1 ? 0.014 : 0), g1 - (end === 2 ? 0.014 : 0), f0, f1, RUG.field, 0.001);
  // A medallion on the runner's middle line, one a tile, and small lozenges between.
  const mid = part === 1 ? 0.5 : part === 2 ? -0.5 : 0;
  const size = part === 0 ? 0.36 : 0.5;
  const diamond = (x: number, s: number, color: number, dy: number) =>
    b.box(s, 0.004, s, color, { at: [x, y + dy, mid], rot: [0, Math.PI / 4, 0] }, 0);
  const cx = end === 1 ? 0.12 : end === 2 ? -0.12 : 0;
  diamond(cx, size / Math.SQRT2, RUG.cream, 0.0015);
  diamond(cx, (size * 0.72) / Math.SQRT2, RUG.slate, 0.002);
  diamond(cx, (size * 0.34) / Math.SQRT2, RUG.cream, 0.0025);
  if (end === 0) for (const x of [-0.5, 0.5]) diamond(x, 0.1, RUG.cream, 0.0015);
  // Fringe at the ends.
  if (end) {
    const fx = end === 1 ? x0 - 0.03 : x1 + 0.03;
    for (let z = z0 + 0.03; z < z1 - 0.01; z += 0.05)
      b.box(0.05, 0.003, 0.016, RUG.cream, { at: [fx, y - 0.001, z] }, 0);
  }
}

// ---- Counters ----

/** The scaffold boards' timber (darker than every station top) and the black pipe frame. */
export const SCAFFOLD = 0xa08866;
const PIPE = 0x2a2c2f;
const GALV = 0x9aa1a6;
const TOP = STATION_HEIGHT;
const BOARD_T = 0.05;

/**
 * A counter as scaffold boards on a black pipe frame: three boards along
 * the run, galvanised bands on their ends where the run ends, two pipe
 * ledgers running the length under the front and back, and on the tiles
 * `run.legs` says, a pair of uprights with a transom and base plates.
 */
export function scaffoldCounter(run: CounterRun): StationModel {
  const b = new ModelBuilder();
  const { minusEnd, plusEnd } = run;
  // The shadow it casts right under it.
  b.box(1, 0.002, 0.92, 0x5c4a38, { at: [0, 0.002, 0] }, 0);
  const x0 = minusEnd ? -0.46 : -0.5;
  const x1 = plusEnd ? 0.46 : 0.5;
  const zs = [-0.29, 0, 0.29];
  zs.forEach((z, i) => {
    const tone = tint(SCAFFOLD, [0.02, -0.04, 0.0][i] ?? 0);
    b.box(x1 - x0, BOARD_T, 0.27, tone, { at: [(x0 + x1) / 2, TOP - BOARD_T / 2, z] }, 0.006);
    // Grain and a saw mark on top.
    b.box(
      (x1 - x0) * 0.7,
      0.002,
      0.01,
      tint(tone, -0.12),
      { at: [0.05 - i * 0.06, TOP + 0.001, z + 0.05] },
      0,
    );
    for (const [end, x] of [
      [minusEnd, x0],
      [plusEnd, x1],
    ] as const) {
      if (!end) continue;
      const s = x < 0 ? 1 : -1;
      b.box(
        0.045,
        BOARD_T + 0.008,
        0.274,
        GALV,
        { at: [x + s * 0.03, TOP - BOARD_T / 2, z] },
        0.004,
      );
    }
  });
  const ledgerY = TOP - BOARD_T - 0.03;
  const lx0 = minusEnd ? -0.42 : -0.5;
  const lx1 = plusEnd ? 0.42 : 0.5;
  for (const z of [-0.37, 0.37]) {
    b.cylinder(
      0.024,
      0.024,
      lx1 - lx0,
      PIPE,
      { at: [(lx0 + lx1) / 2, ledgerY, z], rot: [0, 0, Math.PI / 2] },
      10,
    );
    b.cylinder(
      0.02,
      0.02,
      lx1 - lx0,
      PIPE,
      { at: [(lx0 + lx1) / 2, 0.14, z], rot: [0, 0, Math.PI / 2] },
      10,
    );
  }
  if (run.legs) {
    const x = minusEnd === plusEnd ? 0 : minusEnd ? -0.36 : 0.36;
    b.cylinder(
      0.022,
      0.022,
      0.8,
      PIPE,
      { at: [x, ledgerY - 0.03, 0], rot: [Math.PI / 2, 0, 0] },
      10,
    );
    for (const z of [-0.37, 0.37]) {
      b.cylinder(0.026, 0.026, ledgerY + 0.03, PIPE, { at: [x, (ledgerY + 0.03) / 2, z] }, 10);
      b.box(0.1, 0.012, 0.1, tint(PIPE, 0.15), { at: [x, 0.006, z] }, 0);
      // Couplers where the tubes meet.
      for (const y of [ledgerY, 0.14]) b.box(0.07, 0.06, 0.07, 0x55595d, { at: [x, y, z] }, 0.01);
    }
  }
  return { base: b.build(), hero: null, heroAt: [0, 0] };
}

// ---- The doors ----

const DOOR_GREEN = 0x4b6a57;
const TRIM_CREAM = 0xd8ccb2;

/**
 * The door from the shared entrance hall round the inbox, `width` tiles of
 * it: a stone surround with a lintel and a lit fanlight over it, and behind
 * the station the hall seen through it: green glazed tiles under cream
 * walls, warm light, a pair of green doors swung open into it, a stone step.
 * Built round the inbox group's middle, the hall toward −z; `low` (on the
 * front edge) keeps only the step and the surround's stumps.
 */
export function hallDoorModel(width: number, low = false): Model {
  const b = new ModelBuilder();
  const half = width / 2;
  const stone = 0xa29d93;
  // A stone threshold step out to the hall.
  b.box(width - 0.06, 0.05, 0.16, tint(stone, 0.05), { at: [0, 0.025, -0.56] }, 0.01);
  if (low) {
    // On the front edge: only stumps of the surround, no taller than the front wall.
    for (const s of [-1, 1])
      b.box(
        0.12,
        FRONT_WALL_HEIGHT + 0.04,
        0.2,
        stone,
        {
          at: [s * (half - 0.05), (FRONT_WALL_HEIGHT + 0.04) / 2, -0.4],
        },
        0.01,
      );
    return b.build();
  }
  const top = WALL_HEIGHT - 0.02;
  for (const s of [-1, 1]) {
    const x = s * (half - 0.05);
    b.box(0.12, top, 0.2, stone, { at: [x, top / 2, -0.4] }, 0.01);
    // Rusticated joints on the surround.
    for (let y = 0.22; y < top - 0.05; y += 0.22)
      b.box(0.124, 0.012, 0.204, tint(stone, -0.25), { at: [x, y, -0.4] }, 0);
  }
  // The lintel with a keystone, and the fanlight over it, lit from the hall.
  b.box(width + 0.06, 0.12, 0.22, stone, { at: [0, top + 0.06, -0.4] }, 0.012);
  b.box(0.16, 0.16, 0.24, tint(stone, 0.08), { at: [0, top + 0.08, -0.39] }, 0.01);
  const fanW = width - 0.3;
  b.box(fanW + 0.08, 0.26, 0.08, tint(stone, -0.05), { at: [0, top + 0.25, -0.44] }, 0.01);
  b.screen(fanW, 0.2, 0xffd590, { at: [0, top + 0.25, -0.395] });
  for (let i = 1; i < 5; i++)
    b.box(0.012, 0.2, 0.01, 0x2f3a33, { at: [-fanW / 2 + (fanW * i) / 5, top + 0.25, -0.39] }, 0);
  // The hall beyond: glazed green tiles up to a cream wall, warm.
  const hallH = top - STATION_HEIGHT;
  const tileH = 0.22;
  b.box(width - 0.22, tileH, 0.03, 0x5f8a6e, { at: [0, STATION_HEIGHT + tileH / 2, -0.48] }, 0);
  b.box(width - 0.22, 0.02, 0.035, 0x3f5f4c, { at: [0, STATION_HEIGHT + tileH, -0.478] }, 0);
  b.box(
    width - 0.22,
    hallH - tileH,
    0.03,
    0xe8c991,
    {
      at: [0, STATION_HEIGHT + tileH + (hallH - tileH) / 2, -0.48],
    },
    0,
  );
  // A brass "UNITS 1–12" plaque, a wall light.
  b.box(0.26, 0.1, 0.012, COLOR.brass, { at: [-0.3, STATION_HEIGHT + 0.42, -0.462] }, 0);
  for (let i = 0; i < 3; i++)
    b.box(
      0.16,
      0.012,
      0.004,
      0x6a5020,
      { at: [-0.3, STATION_HEIGHT + 0.44 - i * 0.025, -0.455] },
      0,
    );
  b.led(0.04, 0xffe0a0, { at: [0.4, STATION_HEIGHT + 0.46, -0.45] });
  // The doors, swung open into the hall.
  for (const s of [-1, 1]) {
    const leaf = half - 0.12;
    b.box(
      0.05,
      top - 0.06,
      leaf,
      DOOR_GREEN,
      {
        at: [s * (half - 0.14), (top - 0.06) / 2, -0.5 - leaf / 2],
      },
      0.01,
    );
    b.pane(0.052, 0.38, leaf - 0.14, 0xcfe6e0, {
      at: [s * (half - 0.14), top - 0.32, -0.5 - leaf / 2],
    });
    b.sphere(0.02, COLOR.brass, { at: [s * (half - 0.11), 0.5, -0.5 - leaf + 0.06] });
  }
  return b.build();
}

/** The sliding loading-bay door's painted timber, and its iron. */
const BAY_DOOR = 0x5d7a68;
const IRON = 0x2f3133;

/**
 * One tile of the sliding loading-bay door, parked open beside the opening
 * on the front edge, hung on the outside of the low front wall: vertical
 * planks from the coping down the plinth, ledges and a brace in a Z, the
 * iron rail over it with hanger wheels; `lead` is the side (−1 or 1) facing
 * the opening, where its handle is, or 0 for a middle tile.
 */
export function bayDoorFrontModel(lead: number): Model {
  const b = new ModelBuilder();
  const top = FRONT_WALL_HEIGHT + 0.04;
  const bottom = -SLAB_DEPTH - 0.01;
  const h = top - bottom;
  const z = 0.545;
  planks(b, 1, h, bottom, z, BAY_DOOR);
  for (const y of [bottom + 0.1, top - 0.1])
    b.box(0.96, 0.08, 0.025, tint(BAY_DOOR, -0.1), { at: [0, y, z + 0.035] }, 0.006);
  const len = Math.hypot(0.86, h - 0.28);
  b.box(
    len,
    0.07,
    0.022,
    tint(BAY_DOOR, -0.1),
    {
      at: [0, bottom + h / 2, z + 0.034],
      rot: [0, 0, Math.atan2(h - 0.28, 0.86) * (lead >= 0 ? -1 : 1)],
    },
    0.006,
  );
  // Hanger wheels on the rail.
  for (const x of [-0.3, 0.3]) {
    b.cylinder(
      0.05,
      0.05,
      0.03,
      IRON,
      { at: [x, top + 0.05, z + 0.01], rot: [Math.PI / 2, 0, 0] },
      14,
    );
    b.box(0.04, 0.09, 0.012, IRON, { at: [x, top, z + 0.03] }, 0);
  }
  if (lead !== 0)
    b.box(0.03, 0.16, 0.04, 0x8a8f92, { at: [lead * 0.44, bottom + h * 0.55, z + 0.05] }, 0.008);
  return b.build();
}

/** Vertical planks with dark gaps, `w` wide and `h` tall from `bottom`, their face at `z`. */
function planks(
  b: ModelBuilder,
  w: number,
  h: number,
  bottom: number,
  z: number,
  color: number,
): void {
  b.box(w, h, 0.05, tint(color, -0.4), { at: [0, bottom + h / 2, z] }, 0);
  const n = 5;
  for (let i = 0; i < n; i++) {
    const pw = w / n;
    const tone = tint(color, ((tileHash(i, 77) % 5) - 2) * 0.03);
    b.box(
      pw - 0.014,
      h - 0.006,
      0.012,
      tone,
      { at: [-w / 2 + pw * (i + 0.5), bottom + h / 2, z + 0.026] },
      0,
    );
    // Paint worn back to grey timber at the foot.
    b.box(
      pw - 0.014,
      0.05 + (i % 3) * 0.02,
      0.004,
      0x8a8478,
      {
        at: [-w / 2 + pw * (i + 0.5), bottom + 0.04, z + 0.033],
      },
      0,
    );
  }
}

/** The loading door's rail over the front edge, `span` tiles long, end stops on it. */
export function bayRailFrontModel(span: number): Model {
  const b = new ModelBuilder();
  const y = FRONT_WALL_HEIGHT + 0.1;
  const z = 0.56;
  b.box(span, 0.03, 0.02, IRON, { at: [0, y, z] }, 0);
  for (const s of [-1, 1]) b.box(0.05, 0.06, 0.04, IRON, { at: [s * (span / 2 - 0.03), y, z] }, 0);
  for (let x = -span / 2 + 0.25; x < span / 2; x += 0.5)
    b.box(0.03, 0.12, 0.05, IRON, { at: [x, y - 0.05, z - 0.03] }, 0);
  return b.build();
}

/**
 * One tile of the sliding loading-bay door parked open against the inside
 * face of a wall beside an opening on a side or back edge (face toward +z),
 * as tall as the wall short of its coping, with its own rail and hangers;
 * `lead` as for `bayDoorFrontModel`.
 */
export function bayDoorInsideModel(lead: number): Model {
  const b = new ModelBuilder();
  const h = WALL_HEIGHT - 0.2;
  const z = 0.55;
  planks(b, 1, h, 0.02, z, BAY_DOOR);
  for (const y of [0.14, h - 0.1, h / 2])
    b.box(0.96, 0.07, 0.025, tint(BAY_DOOR, -0.1), { at: [0, y, z + 0.035] }, 0.006);
  const len = Math.hypot(0.86, h / 2 - 0.2);
  for (const [y0, y1] of [
    [0.14, h / 2],
    [h / 2, h - 0.1],
  ] as const)
    b.box(
      len,
      0.06,
      0.022,
      tint(BAY_DOOR, -0.1),
      {
        at: [0, (y0 + y1) / 2, z + 0.034],
        rot: [0, 0, Math.atan2(y1 - y0 - 0.1, 0.86) * (lead >= 0 ? -1 : 1)],
      },
      0.006,
    );
  // The rail along the wall over it, past its leading edge, and the hangers.
  const ry = h + 0.08;
  b.box(1.0 + (lead !== 0 ? 0.4 : 0), 0.03, 0.025, IRON, { at: [lead * 0.2, ry, z + 0.02] }, 0);
  for (const x of [-0.3, 0.3]) {
    b.cylinder(
      0.045,
      0.045,
      0.03,
      IRON,
      { at: [x, ry + 0.04, z + 0.035], rot: [Math.PI / 2, 0, 0] },
      14,
    );
    b.box(0.04, 0.08, 0.012, IRON, { at: [x, ry - 0.03, z + 0.05] }, 0);
  }
  if (lead !== 0) {
    b.box(0.03, 0.18, 0.04, 0x8a8f92, { at: [lead * 0.44, 0.5, z + 0.06] }, 0.008);
    // A stop on the rail where the door closes against it, and the stencilled bay number.
    b.box(0.05, 0.07, 0.05, IRON, { at: [lead * 0.68, ry, z + 0.02] }, 0);
  }
  b.box(0.2, 0.26, 0.004, 0xe4dccb, { at: [-lead * 0.15, h * 0.6, z + 0.05] }, 0);
  stencil(b, '4', -lead * 0.15, h * 0.6, z + 0.054, 0.045, 0x3a3f3c);
  return b.build();
}

/** 3×5 letters for signs, rows top first. */
const FONT: Readonly<Record<string, readonly string[]>> = {
  S: ['###', '#..', '###', '..#', '###'],
  H: ['#.#', '#.#', '###', '#.#', '#.#'],
  I: ['###', '.#.', '.#.', '.#.', '###'],
  P: ['###', '#.#', '###', '#..', '#..'],
  T: ['###', '.#.', '.#.', '.#.', '.#.'],
  '4': ['#.#', '#.#', '###', '..#', '..#'],
  '!': ['#', '#', '#', '.', '#'],
  ' ': ['.', '.', '.', '.', '.'],
};

/** Letters of `text` as cells `px` wide, centered on (x, y), lying in the plane at `z`. */
function stencil(
  b: ModelBuilder,
  text: string,
  x: number,
  y: number,
  z: number,
  px: number,
  color: number,
  glow = false,
): void {
  const chars = Array.from(text);
  const columns = chars.reduce((n, c) => n + (FONT[c]?.[0]?.length ?? 0) + 1, -1);
  let col = 0;
  for (const c of chars) {
    const rows = FONT[c] ?? [];
    const w = rows[0]?.length ?? 0;
    rows.forEach((row, r) => {
      for (let i = 0; i < w; i++) {
        if (row[i] !== '#') continue;
        const at: [number, number, number] = [
          x + (col + i - columns / 2 + 0.5) * px,
          y + (2 - r) * px,
          z,
        ];
        if (glow) b.screen(px * 0.86, px * 0.86, color, { at });
        else b.box(px, px, 0.003, color, { at }, 0);
      }
    });
    col += w + 1;
  }
}

/** Which other tenant's door. */
export type TenantDoor = 'yoga' | 'brewery';

/**
 * A full storey of brick wall with another tenant's door in its face, for
 * the hallway's wall (even where the wall is low: the door rises out of it,
 * with nothing behind to hide): a four-panel door in the tenant's paint,
 * a cream architrave, a brass knob and kick plate, a lit fanlight, and the
 * tenant's sign over it: a lotus for the yoga studio, a hop for the brewery.
 */
export function tenantDoorModel(kind: TenantDoor, look: number): Model {
  const b = new ModelBuilder();
  buildBrickWall(b, WALL_HEIGHT, BAND, look);
  const paint = kind === 'yoga' ? 0x7f9c88 : 0x3e5a6c;
  const z = 0.5;
  const w = 0.58;
  const h = 0.84;
  // Architrave, the door, its panels.
  b.box(w + 0.12, h + 0.06, 0.03, TRIM_CREAM, { at: [0, (h + 0.06) / 2, z + 0.015] }, 0.006);
  b.box(w, h, 0.03, paint, { at: [0, h / 2, z + 0.03] }, 0.006);
  for (const [px, py, ph] of [
    [-0.12, 0.6, 0.3],
    [0.12, 0.6, 0.3],
    [-0.12, 0.22, 0.32],
    [0.12, 0.22, 0.32],
  ] as const)
    b.box(0.18, ph, 0.01, tint(paint, -0.12), { at: [px, py, z + 0.048] }, 0.003);
  b.sphere(0.022, COLOR.brass, { at: [0.19, 0.42, z + 0.06] });
  b.box(w - 0.04, 0.07, 0.006, COLOR.brass, { at: [0, 0.05, z + 0.048] }, 0);
  // The fanlight, lit from inside.
  b.box(w + 0.12, 0.12, 0.03, TRIM_CREAM, { at: [0, h + 0.12, z + 0.015] }, 0.006);
  b.screen(w - 0.04, 0.08, 0xffd590, { at: [0, h + 0.12, z + 0.032] });
  // The sign, on a bracket, over the door.
  const sy = h + 0.3;
  if (kind === 'yoga') {
    b.cylinder(
      0.12,
      0.12,
      0.025,
      0xe8e0cc,
      { at: [0, sy, z + 0.03], rot: [Math.PI / 2, 0, 0] },
      24,
    );
    for (const [rz, sx] of [
      [0, 1],
      [0.7, 0.85],
      [-0.7, 0.85],
    ] as const)
      ellipse(
        b,
        0.028 * sx,
        0.06 * sx,
        0x8a6aa8,
        [0, sy + 0.01, z + 0.046],
        [Math.PI / 2, 0, rz],
        0.004,
      );
    b.box(0.14, 0.012, 0.004, 0x8a6aa8, { at: [0, sy - 0.06, z + 0.046] }, 0);
  } else {
    b.box(0.26, 0.2, 0.025, 0x2c3a44, { at: [0, sy, z + 0.03] }, 0.01);
    b.box(0.27, 0.21, 0.02, COLOR.brass, { at: [0, sy, z + 0.025] }, 0.01);
    // A hop cone: overlapping scales, and its leaf.
    for (const [hx, hy, r] of [
      [0, 0.04, 0.03],
      [-0.025, 0.0, 0.032],
      [0.025, 0.0, 0.032],
      [0, -0.035, 0.03],
      [0, -0.065, 0.02],
    ] as const)
      b.sphere(r, 0x9cc46a, { at: [hx, sy + hy, z + 0.05] }, [1, 1, 0.5]);
    ellipse(b, 0.05, 0.022, 0x6a9a4a, [0.06, sy + 0.07, z + 0.05], [Math.PI / 2, 0, 0.5], 0.004);
  }
  return b.build();
}

// ---- On the brick ----

/** Things hung on the front of a brick wall (in front of z = 0.5), by name in `WallArt`. */
export const WAREHOUSE_WALL_ART: Readonly<Record<string, () => Model>> = {
  pigeonholes: () => {
    // The tenants' pigeonholes from the entrance hall: a wooden grid, the post sticking out.
    const b = new ModelBuilder();
    const wood = 0x8a6440;
    const [w, h, cy, z] = [0.72, 0.5, 0.78, 0.6];
    b.box(w, h, 0.18, wood, { at: [0, cy, z - 0.02] }, 0.008);
    const cols = 4;
    const rows = 3;
    const cw = (w - 0.04) / cols;
    const ch = (h - 0.04) / rows;
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++) {
        const x = -w / 2 + 0.02 + cw * (c + 0.5);
        const y = cy - h / 2 + 0.02 + ch * (r + 0.5);
        b.box(cw - 0.02, ch - 0.02, 0.02, 0x3a2a1e, { at: [x, y, z + 0.06] }, 0);
        b.box(cw * 0.5, 0.016, 0.004, 0xe8e0cc, { at: [x, y - ch / 2 + 0.006, z + 0.075] }, 0);
        const hs = tileHash(r, c + 9);
        if (hs % 3 !== 0)
          b.box(
            cw - 0.05,
            0.08 + (hs % 3) * 0.02,
            0.012,
            hs % 2 ? COLOR.paper : 0xd8b888,
            {
              at: [x + ((hs >> 3) % 3) * 0.01 - 0.01, y - 0.01, z + 0.085],
              rot: [-0.25, 0, ((hs >> 5) % 5) * 0.04 - 0.08],
            },
            0,
          );
      }
    // A parcel on top.
    b.box(
      0.26,
      0.12,
      0.16,
      COLOR.cardboard,
      { at: [0.12, cy + h / 2 + 0.06, z - 0.02], rot: [0, 0.1, 0] },
      0.01,
    );
    b.box(
      0.262,
      0.02,
      0.05,
      0xe8d4a8,
      { at: [0.12, cy + h / 2 + 0.11, z - 0.02], rot: [0, 0.1, 0] },
      0,
    );
    return b.build();
  },
  neon: () => neonModel(false),
  neonWide: () => neonModel(true),
  clock: () => {
    // The old factory clock: a big cream face in a black iron case, on a bracket.
    const b = new ModelBuilder();
    const [cy, z, r] = [0.72, 0.56, 0.2];
    b.box(0.06, 0.14, 0.08, IRON, { at: [0, cy + r + 0.02, 0.53] }, 0);
    b.cylinder(r + 0.03, r + 0.03, 0.08, IRON, { at: [0, cy, z], rot: [Math.PI / 2, 0, 0] }, 32);
    b.cylinder(r, r, 0.012, 0xece2c8, { at: [0, cy, z + 0.04], rot: [Math.PI / 2, 0, 0] }, 32);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const long = i % 3 === 0;
      b.box(
        0.014,
        long ? 0.05 : 0.028,
        0.004,
        0x2a2a2a,
        {
          at: [Math.sin(a) * (r - 0.04), cy + Math.cos(a) * (r - 0.04), z + 0.048],
          rot: [0, 0, -a],
        },
        0,
      );
    }
    // Ten to six: nearly home time.
    b.box(0.016, 0.15, 0.004, 0x1e1e1e, { at: [-0.06, cy + 0.04, z + 0.052], rot: [0, 0, 1.0] }, 0);
    b.box(0.02, 0.1, 0.004, 0x1e1e1e, { at: [0.0, cy - 0.05, z + 0.054], rot: [0, 0, 0.12] }, 0);
    b.box(
      0.006,
      0.17,
      0.004,
      COLOR.signalRed,
      { at: [0.04, cy + 0.03, z + 0.056], rot: [0, 0, -0.5] },
      0,
    );
    b.cylinder(
      0.018,
      0.018,
      0.01,
      0x1e1e1e,
      { at: [0, cy, z + 0.056], rot: [Math.PI / 2, 0, 0] },
      10,
    );
    return b.build();
  },
  bike: () => {
    // Somebody's bike, hung on two hooks: wheels, a teal frame, a brown saddle.
    const b = new ModelBuilder();
    const [cy, z] = [0.66, 0.6];
    const frame = 0x4a7a76;
    for (const x of [-0.27, 0.27]) {
      b.torus(0.17, 0.02, 0x26282a, { at: [x, cy, z] });
      b.torus(0.12, 0.006, 0x8a9096, { at: [x, cy, z] });
      b.cylinder(0.02, 0.02, 0.03, 0x8a9096, { at: [x, cy, z], rot: [Math.PI / 2, 0, 0] }, 8);
    }
    const tube = (x0: number, y0: number, x1: number, y1: number, r = 0.016) =>
      b.cylinder(
        r,
        r,
        Math.hypot(x1 - x0, y1 - y0),
        frame,
        {
          at: [(x0 + x1) / 2, (y0 + y1) / 2, z + 0.01],
          rot: [0, 0, Math.atan2(y1 - y0, x1 - x0) - Math.PI / 2],
        },
        8,
      );
    const bb = [-0.02, cy - 0.02] as const;
    const seat = [-0.1, cy + 0.2] as const;
    const head = [0.17, cy + 0.2] as const;
    tube(-0.27, cy, bb[0], bb[1]);
    tube(-0.27, cy, seat[0], seat[1]);
    tube(bb[0], bb[1], seat[0], seat[1]);
    tube(seat[0], seat[1], head[0], head[1]);
    tube(bb[0], bb[1], head[0], head[1], 0.02);
    tube(head[0], head[1], 0.27, cy);
    b.box(0.12, 0.03, 0.05, 0x6a4a32, { at: [seat[0] - 0.02, seat[1] + 0.05, z + 0.01] }, 0.01);
    b.box(0.03, 0.05, 0.02, 0x2a2a2a, { at: [seat[0] - 0.01, seat[1] + 0.025, z + 0.01] }, 0);
    b.box(
      0.03,
      0.03,
      0.2,
      0x2a2a2a,
      { at: [head[0] + 0.02, head[1] + 0.05, z], rot: [0, 0, 0] },
      0,
    );
    // The hooks.
    for (const x of [-0.27, 0.27]) b.box(0.03, 0.06, 0.1, IRON, { at: [x, cy + 0.19, 0.55] }, 0);
    return b.build();
  },
  gigPoster: () => {
    // Gig posters pasted over each other, one corner torn back.
    const b = new ModelBuilder();
    const z = 0.51;
    for (const [x, y, w, h, color, rz, d] of [
      [-0.16, 0.74, 0.3, 0.42, 0xc88a3a, -0.03, 0.0],
      [0.14, 0.7, 0.3, 0.42, 0x3f6f74, 0.04, 0.003],
      [-0.02, 0.62, 0.28, 0.36, 0xd8cbb0, 0.0, 0.006],
    ] as const) {
      b.box(w, h, 0.003, color, { at: [x, y, z + d], rot: [0, 0, rz] }, 0);
    }
    // The top poster: a band name block, a big red sun, the date strip.
    b.cylinder(
      0.08,
      0.08,
      0.003,
      0xb8483a,
      { at: [-0.02, 0.66, z + 0.009], rot: [Math.PI / 2, 0, 0] },
      20,
    );
    b.box(0.22, 0.04, 0.003, 0x2a2a2a, { at: [-0.02, 0.76, z + 0.009] }, 0);
    b.box(0.16, 0.02, 0.003, 0x2a2a2a, { at: [-0.02, 0.5, z + 0.009] }, 0);
    // What shows of the ones under it.
    b.box(0.1, 0.1, 0.003, 0x2a2a2a, { at: [-0.22, 0.88, z + 0.003] }, 0);
    b.box(0.06, 0.22, 0.003, 0xe8d8a8, { at: [0.24, 0.72, z + 0.006] }, 0);
    // The torn corner, curling.
    b.box(0.07, 0.07, 0.003, 0xa89a80, { at: [0.1, 0.46, z + 0.012], rot: [0.3, 0, 0.7] }, 0);
    return b.build();
  },
  downpipe: () => {
    // A cast-iron downpipe from a hopper head under the coping to a shoe at the floor.
    const b = new ModelBuilder();
    const iron = 0x3b3f42;
    const [x, z] = [0.28, 0.56];
    const top = WALL_HEIGHT - CAP - 0.04;
    b.cylinder(0.04, 0.04, top - 0.1, iron, { at: [x, (top - 0.1) / 2 + 0.05, z] }, 12);
    for (let y = 0.25; y < top - 0.1; y += 0.3) {
      b.cylinder(0.05, 0.05, 0.04, tint(iron, 0.08), { at: [x, y, z] }, 12);
      b.box(0.03, 0.03, 0.06, iron, { at: [x, y, z - 0.04] }, 0);
    }
    b.box(0.16, 0.12, 0.14, iron, { at: [x, top - 0.02, z] }, 0.01);
    b.cylinder(0.08, 0.05, 0.06, iron, { at: [x, top - 0.11, z] }, 12);
    b.cylinder(
      0.045,
      0.045,
      0.12,
      iron,
      { at: [x, 0.06, z + 0.05], rot: [Math.PI / 2 - 0.5, 0, 0] },
      12,
    );
    return b.build();
  },
  noticeBoard: () => {
    // The building's notice board: green baize, notices, a fire-drill sheet.
    const b = new ModelBuilder();
    b.box(0.6, 0.42, 0.03, 0x6a5038, { at: [0, 0.74, 0.515] }, 0.006);
    b.box(0.54, 0.36, 0.01, 0x3f6a4e, { at: [0, 0.74, 0.532] }, 0);
    for (const [x, y, w, h, c, rz] of [
      [-0.15, 0.78, 0.16, 0.2, COLOR.paper, -0.05],
      [0.06, 0.8, 0.14, 0.12, 0xf0d070, 0.06],
      [0.18, 0.66, 0.12, 0.16, COLOR.paper, 0.0],
      [-0.02, 0.64, 0.16, 0.1, 0xd88a7a, -0.03],
    ] as const) {
      b.box(w, h, 0.004, c, { at: [x, y, 0.54], rot: [0, 0, rz] }, 0);
      b.sphere(0.01, COLOR.pinRed, { at: [x, y + h / 2 - 0.02, 0.545] });
    }
    return b.build();
  },
};

/**
 * The "SHIP IT" neon on a dark backing board, pink tubes that glow: on one
 * line across two tiles (`wide`), else stacked SHIP over IT on one.
 */
function neonModel(wide: boolean): Model {
  const b = new ModelBuilder();
  const pink = 0xff6aa6;
  const z = 0.535;
  if (wide) {
    const px = 0.05;
    b.box(1.5, 0.36, 0.025, 0x23262c, { at: [0, 0.82, 0.515] }, 0.01);
    stencil(b, 'SHIP IT!', 0, 0.82, z, px, pink, true);
    for (const x of [-0.7, 0.7]) b.box(0.03, 0.03, 0.05, 0x8a8f92, { at: [x, 0.95, 0.53] }, 0);
  } else {
    const px = 0.042;
    b.box(0.72, 0.6, 0.025, 0x23262c, { at: [0, 0.78, 0.515] }, 0.01);
    stencil(b, 'SHIP', 0, 0.9, z, px, pink, true);
    stencil(b, 'IT!', 0, 0.64, z, px, pink, true);
  }
  // The transformer's cable down to a socket.
  b.box(0.012, 0.3, 0.012, 0x2a2a2a, { at: [wide ? 0.6 : 0.3, 0.5, 0.52] }, 0);
  return b.build();
}

// ---- Lamps ----

/** How far an Edison bulb's flex runs up to the wire it hangs from. */
export const EDISON_HANG = 0.3;

/**
 * A bare Edison bulb on a cloth flex, built round the bulb (at the origin)
 * so it hangs where the room's warm lamps shine from: a warm glowing
 * teardrop with a brass cap and a black bakelite holder, the flex running
 * up `EDISON_HANG` to the wire.
 */
export function edisonBulbModel(): Model {
  const b = new ModelBuilder();
  const g = new THREE.SphereGeometry(0.06, 14, 10);
  g.scale(1, 1.35, 1);
  b.add(g, 0xffc874, { at: [0, -0.03, 0] }, 'glow');
  b.cylinder(0.03, 0.034, 0.05, COLOR.brass, { at: [0, 0.065, 0] }, 12);
  b.cylinder(0.038, 0.038, 0.07, 0x1e1e1e, { at: [0, 0.115, 0] }, 12);
  b.cylinder(
    0.006,
    0.006,
    EDISON_HANG - 0.13,
    0x3a2a22,
    {
      at: [0, 0.13 + (EDISON_HANG - 0.13) / 2, 0],
    },
    5,
  );
  return b.build();
}
