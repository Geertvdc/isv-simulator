import * as THREE from 'three';
import { type WallPiece, tileHash } from '../../mapShape';
import { type Model, ModelBuilder, tint } from '../kit';
import { FRONT_WALL_HEIGHT, SLAB_DEPTH, STATION_HEIGHT, WALL_HEIGHT } from '../layout';
import { FLOOR_COLORS, WALL_COLORS } from '../look';
import { COLOR } from '../palette';
import type { CounterRun } from '../rooms/counterRun';
import { CARPET_WEAR } from '../rooms/officeParkRoom';
import type { StationModel } from '../stationModels';

/**
 * The business-park unit of the Open Plan Office (wall theme `officePark`,
 * floor theme `carpetTiles`), built in code: magnolia plasterboard walls, the
 * old glass partitions, the block's brick plinth, carpet tiles, beech-effect
 * desks, the lobby and front doors, the wall decorations and the strip
 * lights. Nothing here imports `roomModels.ts`, which takes the decorations
 * from here.
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

/** A face of a tile-sized block: where along it `u`, at height `y`, sits on it, and its turn. */
type Face = (
  u: number,
  y: number,
) => { at: [number, number, number]; rot: [number, number, number] };
/** The four faces of a block `half` out from its middle: front, back, left, right. */
function faces(half: number): Face[] {
  return [
    (u, y) => ({ at: [u, y, half], rot: [0, 0, 0] }),
    (u, y) => ({ at: [u, y, -half], rot: [0, 0, 0] }),
    (u, y) => ({ at: [-half, y, u], rot: [0, Math.PI / 2, 0] }),
    (u, y) => ({ at: [half, y, u], rot: [0, Math.PI / 2, 0] }),
  ];
}

// ---- Walls ----

/** Grey vinyl skirting, the dado rail, the paint below it a shade deeper. */
const SKIRTING = 0x7e8288;
const SKIRTING_HEIGHT = 0.1;
const DADO_RAIL = 0xa8a293;
const DADO_HEIGHT = 0.42;
/** The cap: a cool light trim with a lip, a thin shadow line under it. */
const CAP = 0.045;
const CAP_LIP = 0.02;
/** The block's brown brick, and its mortar. */
const BRICK = 0x84553f;
const MORTAR = 0xa39686;
/** Looks a wall comes in: a socket, scuffed, patched screw holes, the ghost of an old poster. */
export const OFFICE_PARK_WALL_LOOKS = 4;

/**
 * The cool light coping on top of a wall `h` tall (shaded a little by
 * `look`), its lip and the shadow line under it. Coping stones half a tile
 * long: a groove every 0.5 across the run (`along` x on the low front wall;
 * both ways on a full wall, which runs either way), a deeper joint at the
 * tile's edges.
 */
function cap(
  b: ModelBuilder,
  h: number,
  look: number,
  along: 'x' | 'both',
  width = 1,
  depth = 1,
): void {
  const { face, top } = WALL_COLORS.officePark;
  const body = h - CAP;
  b.box(width + 0.03, 0.012, depth + 0.03, tint(face, -0.42), { at: [0, body - 0.006, 0] }, 0);
  b.box(
    width + CAP_LIP * 2,
    CAP,
    depth + CAP_LIP * 2,
    tint(top, 0.06),
    { at: [0, h - CAP / 2, 0] },
    0,
  );
  // The top a shade darker than its lip, so it reads as coping.
  const shade = [0, 0.03, -0.03, 0.015][look] ?? 0;
  b.box(width - 0.02, 0.004, depth - 0.02, tint(top, shade), { at: [0, h + 0.002, 0] }, 0);
  const joint = tint(top, -0.3);
  const groove = tint(top, -0.12);
  const lipD = depth + CAP_LIP * 2;
  const lipW = width + CAP_LIP * 2;
  // Joints across x (lines down z): at the tile's edge, a groove halfway.
  b.box(0.014, 0.005, lipD, joint, { at: [-width / 2, h + 0.003, 0] }, 0);
  b.box(0.02, 0.005, lipD, groove, { at: [0, h + 0.003, 0] }, 0);
  // Down the front of the lip too, so the joints show from the front.
  for (const [u, w, c] of [
    [-width / 2, 0.014, joint],
    [0, 0.02, groove],
  ] as const)
    b.box(w, CAP, 0.004, c, { at: [u, h - CAP / 2, depth / 2 + CAP_LIP + 0.001] }, 0);
  if (along === 'both') {
    b.box(lipW, 0.005, 0.014, joint, { at: [0, h + 0.003, -depth / 2] }, 0);
    b.box(lipW, 0.005, 0.02, groove, { at: [0, h + 0.003, 0] }, 0);
    for (const [u, w, c] of [
      [-depth / 2, 0.014, joint],
      [0, 0.02, groove],
    ] as const)
      for (const s of [-1, 1])
        b.box(0.004, CAP, w, c, { at: [s * (width / 2 + CAP_LIP + 0.001), h - CAP / 2, u] }, 0);
  }
}

/**
 * A wall of the unit: magnolia plasterboard with taped sheet joints, grey
 * vinyl skirting, a dado rail with the paint a shade deeper under it, and
 * the cool light trim on top. Everything runs round all four faces, so side
 * walls show it too; `look` adds wear on the same faces. The low front wall
 * is the block's brick on its outside.
 */
export function officeParkWallModel(piece: WallPiece, look: number): Model {
  const { face } = WALL_COLORS.officePark;
  const b = new ModelBuilder();
  if (piece === 'wall-front') {
    const h = FRONT_WALL_HEIGHT;
    const body = h - CAP;
    b.box(1, body, 1, face, { at: [0, body / 2, 0] }, 0);
    b.box(
      1.006,
      Math.min(SKIRTING_HEIGHT, body),
      1.006,
      SKIRTING,
      { at: [0, SKIRTING_HEIGHT / 2, 0] },
      0,
    );
    // The outside, toward the car park: the plinth's brick carries on up.
    b.box(1, body, 0.01, BRICK, { at: [0, body / 2, 0.506] }, 0);
    for (let y = 0.075; y < body; y += 0.075)
      b.box(1.002, 0.01, 0.004, MORTAR, { at: [0, y, 0.512] }, 0);
    for (let i = 0, y0 = 0; y0 < body - 0.01; i++, y0 += 0.075) {
      const hh = Math.min(0.075, body - y0);
      for (let u = -0.5 + (i % 2 ? 0.125 : 0.25); u < 0.49; u += 0.25)
        b.box(0.01, hh, 0.004, MORTAR, { at: [u, y0 + hh / 2, 0.512] }, 0);
    }
    cap(b, h, look, 'x');
    return b.build();
  }
  const h = WALL_HEIGHT;
  const body = h - CAP;
  const lower = tint(face, -0.12);
  b.box(1, body, 1, face, { at: [0, body / 2, 0] }, 0);
  b.box(1.004, DADO_HEIGHT, 1.004, lower, { at: [0, DADO_HEIGHT / 2, 0] }, 0);
  b.box(1.018, 0.026, 1.018, DADO_RAIL, { at: [0, DADO_HEIGHT, 0] }, 0.004);
  b.box(1.014, 0.006, 1.014, tint(lower, -0.3), { at: [0, DADO_HEIGHT - 0.016, 0] }, 0);
  b.box(1.022, SKIRTING_HEIGHT, 1.022, SKIRTING, { at: [0, SKIRTING_HEIGHT / 2, 0] }, 0.004);
  b.box(1.024, 0.008, 1.024, tint(SKIRTING, 0.25), { at: [0, SKIRTING_HEIGHT, 0] }, 0);
  const seamShift = [0, 0.14, -0.1, 0.22][look] ?? 0;
  const seam = tint(face, -0.1);
  for (const on of faces(0.503)) {
    // Taped sheet joints: two sheets a tile, upright, a level joint over the dado on some.
    for (const u of [-0.25 + seamShift, 0.25 + seamShift]) {
      if (u < -0.47 || u > 0.47) continue;
      b.box(0.012, body - DADO_HEIGHT - 0.03, 0.004, seam, on(u, (body + DADO_HEIGHT) / 2), 0);
      b.box(
        0.012,
        DADO_HEIGHT - SKIRTING_HEIGHT - 0.03,
        0.004,
        tint(lower, -0.06),
        on(u, (DADO_HEIGHT + SKIRTING_HEIGHT) / 2),
        0,
      );
    }
    if (look % 2 === 1) b.box(0.98, 0.01, 0.004, seam, on(0, 0.86), 0);
    const wear = (w: number, hh: number, color: number, u: number, y: number) =>
      b.box(w, hh, 0.006, color, on(u, y), 0);
    if (look === 0) {
      // A double socket and a data point on the skirting.
      wear(0.15, 0.08, 0xf1efe8, 0.18, 0.16);
      wear(0.03, 0.035, 0x4a4d52, 0.14, 0.16);
      wear(0.03, 0.035, 0x4a4d52, 0.22, 0.16);
      wear(0.07, 0.07, 0xf1efe8, 0.34, 0.16);
      wear(0.03, 0.03, 0x3d6fa8, 0.34, 0.16);
    } else if (look === 1) {
      // Chairs and bags against the wall: scuffs under the dado, on the skirting.
      for (const [u, y, w] of [
        [-0.24, 0.22, 0.2],
        [-0.1, 0.27, 0.12],
        [0.2, 0.18, 0.16],
      ] as const)
        wear(w, 0.03, tint(lower, -0.28), u, y);
      wear(0.14, 0.02, tint(SKIRTING, -0.45), 0.05, 0.05);
    } else if (look === 2) {
      // Where shelves came down: filler patches a shade paler, one hole never filled.
      for (const [u, y] of [
        [-0.28, DADO_HEIGHT + 0.36],
        [0.12, DADO_HEIGHT + 0.36],
        [-0.08, DADO_HEIGHT + 0.12],
      ] as const)
        wear(0.06, 0.05, tint(face, 0.16), u, y);
      wear(0.016, 0.016, 0x3b3833, 0.3, DADO_HEIGHT + 0.36);
    } else {
      // The ghost of the old tenant's poster: cleaner paint, blu-tack at its corners.
      const [u, y, w, hh] = [-0.05, DADO_HEIGHT + 0.33, 0.36, 0.28];
      wear(w, hh, tint(face, 0.09), u, y);
      for (const sx of [-1, 1])
        for (const sy of [-1, 1])
          wear(0.022, 0.018, 0x8aa0c0, u + sx * (w / 2 - 0.02), y + sy * (hh / 2 - 0.02));
    }
  }
  cap(b, h, look, 'both');
  return b.build();
}

/** The aluminium of the partitions, the shopfront and the lobby door frame. */
const ALUMINIUM = 0x9aa1a8;
/** The front door's dark bronze anodised frame. */
const BRONZE = 0x4b4640;

/**
 * A tile of the old tenant's glass partition, its pane running down the map
 * (z), standing in for a side wall: a magnolia base with skirting, an
 * aluminium frame, clear glass with a frosted band across it at eye height,
 * and the cool trim along its head.
 */
export function partitionModel(): Model {
  const { face } = WALL_COLORS.officePark;
  const b = new ModelBuilder();
  const base = 0.3;
  b.box(1, base - 0.02, 1, face, { at: [0, (base - 0.02) / 2, 0] }, 0);
  b.box(1.022, SKIRTING_HEIGHT, 1.022, SKIRTING, { at: [0, SKIRTING_HEIGHT / 2, 0] }, 0.004);
  b.box(
    1.02,
    0.03,
    1.02,
    tint(WALL_COLORS.officePark.top, 0.05),
    { at: [0, base - 0.01, 0] },
    0.004,
  );
  const head = WALL_HEIGHT - 0.04;
  const paneH = head - base;
  // Mullions at each end, a transom low down, the head rail.
  for (const z of [-0.47, 0.47])
    b.box(0.07, paneH, 0.06, ALUMINIUM, { at: [0, base + paneH / 2, z] }, 0.008);
  b.box(0.07, 0.04, 1, ALUMINIUM, { at: [0, base + 0.02, 0] }, 0.006);
  b.box(0.09, 0.05, 1, ALUMINIUM, { at: [0, head + 0.02, 0] }, 0.008);
  b.box(0.12, 0.012, 1, tint(WALL_COLORS.officePark.top, 0.1), { at: [0, head + 0.05, 0] }, 0);
  b.pane(0.025, paneH - 0.06, 0.88, 0xdfeaf0, { at: [0, base + paneH / 2, 0] });
  // The frosted band, and a thin line above it.
  b.box(0.03, 0.14, 0.88, 0xe4e9ea, { at: [0, base + 0.36, 0] }, 0);
  b.box(0.031, 0.012, 0.88, 0xc8d0d4, { at: [0, base + 0.46, 0] }, 0);
  return b.build();
}

// ---- The brick plinth ----

/** Looks the plinth comes in: three shades of the same brick. */
export const BRICK_LOOKS = 3;
const COURSE = 0.075;
const BRICK_LENGTH = 0.25;

/**
 * The block's brown brick plinth under each tile, standing in for the
 * diorama's wooden slab: stretcher bond in courses all round, a slate damp
 * course under the floor, the odd brick a shade off.
 */
export function brickPlinthModel(look: number): Model {
  const b = new ModelBuilder();
  const top = -0.013;
  const bottom = top - SLAB_DEPTH;
  const brick = tint(BRICK, [0, -0.06, 0.05][look] ?? 0);
  b.box(1.002, SLAB_DEPTH, 1.002, brick, { at: [0, top - SLAB_DEPTH / 2, 0] }, 0);
  // The floor slab's pale edge, then the damp course.
  b.box(1.006, 0.016, 1.006, 0x8a8f93, { at: [0, top - 0.008, 0] }, 0);
  b.box(1.005, 0.012, 1.005, 0x45444a, { at: [0, top - 0.026, 0] }, 0);
  const courses = Math.floor((SLAB_DEPTH - 0.032) / COURSE);
  for (let i = 1; i <= courses; i++)
    b.box(1.006, 0.01, 1.006, MORTAR, { at: [0, top - 0.032 - i * COURSE, 0] }, 0);
  faces(0.503).forEach((on, f) => {
    for (let i = 0; i < courses; i++) {
      const y = top - 0.032 - (i + 0.5) * COURSE;
      const shift = i % 2 ? BRICK_LENGTH / 2 : 0;
      for (let u = -0.5 + BRICK_LENGTH - shift; u < 0.49; u += BRICK_LENGTH)
        if (u > -0.49) b.box(0.01, COURSE - 0.01, 0.004, MORTAR, on(u, y), 0);
      // A brick or two a shade off on each course.
      const h = tileHash(i + look * 7, f + 3);
      const u = -0.5 + shift + BRICK_LENGTH * ((h % 4) + 0.5);
      if (u < 0.45 && h % 3 !== 0)
        b.box(
          BRICK_LENGTH - 0.014,
          COURSE - 0.016,
          0.006,
          tint(brick, h % 2 ? -0.12 : 0.08),
          on(u, y),
          0,
        );
    }
    // Dirt splashed up from the ground.
    b.box(1.004, 0.05, 0.005, tint(brick, -0.2), on(0, bottom + 0.025), 0);
  });
  return b.build();
}

// ---- Carpet tiles ----

/**
 * A floor tile of carpet: four carpet tiles laid with their pile turned
 * alternately (a shade apart, a faint grain each way), thin joints, and its
 * wear on top (see `CARPET_WEAR`; the look is the wear).
 */
export function carpetFloorModel(look: number): Model {
  const [a, alt] = FLOOR_COLORS.carpetTiles;
  const b = new ModelBuilder();
  b.box(1, 0.012, 1, tint(a, -0.14), { at: [0, -0.006, 0] }, 0);
  for (let i = 0; i < 2; i++)
    for (let j = 0; j < 2; j++) {
      const across = (i + j) % 2 === 0;
      const c = across ? a : alt;
      const [x, z] = [-0.25 + i * 0.5, -0.25 + j * 0.5];
      b.box(0.488, 0.012, 0.488, c, { at: [x, -0.0056, z] }, 0);
      for (let k = -1; k <= 1; k++) {
        const g = tint(c, k === 0 ? 0.02 : -0.02);
        if (across) b.box(0.44, 0.002, 0.03, g, { at: [x, 0.0006, z + k * 0.13] }, 0);
        else b.box(0.03, 0.002, 0.44, g, { at: [x + k * 0.13, 0.0006, z] }, 0);
      }
    }
  const mark = (w: number, d: number, color: number, x: number, z: number, y = 0.0012, turn = 0) =>
    b.box(w, 0.002, d, color, { at: [x, y, z], rot: [0, turn, 0] }, 0);
  switch (look) {
    case CARPET_WEAR.path:
    case CARPET_WEAR.pathX:
    case CARPET_WEAR.pathFaint:
    case CARPET_WEAR.pathFaintX: {
      // Pile flattened by feet: paler and greyer, soft-edged.
      const faint = look === CARPET_WEAR.pathFaint || look === CARPET_WEAR.pathFaintX;
      const along = look === CARPET_WEAR.path || look === CARPET_WEAR.pathFaint;
      const worn = mix(a, 0xa8acae, faint ? 0.14 : 0.24);
      const core = mix(a, 0xb4b6b6, faint ? 0.22 : 0.36);
      const [w1, w2] = faint ? [0.5, 0.26] : [0.72, 0.42];
      if (along) {
        mark(w1, 1, worn, 0, 0);
        mark(w2, 1, core, 0.02, 0, 0.0016);
      } else {
        mark(1, w1, worn, 0, 0);
        mark(1, w2, core, 0, 0.02, 0.0016);
      }
      break;
    }
    case CARPET_WEAR.coffee: {
      // A spilt coffee, soaked in: translucent brown over the carpet, a darker rim.
      const [x, z] = [0.26, -0.24];
      b.cylinder(0.14, 0.14, 0.002, mix(a, 0x6a4a30, 0.28), { at: [x, 0.0012, z] }, 20);
      b.cylinder(0.11, 0.11, 0.002, mix(a, 0x6a4a30, 0.4), { at: [x + 0.01, 0.0016, z] }, 20);
      b.cylinder(
        0.05,
        0.05,
        0.002,
        mix(a, 0x6a4a30, 0.32),
        { at: [x - 0.16, 0.0016, z + 0.1] },
        14,
      );
      b.cylinder(
        0.025,
        0.025,
        0.002,
        mix(a, 0x6a4a30, 0.32),
        { at: [x - 0.08, 0.0016, z + 0.18] },
        10,
      );
      break;
    }
    case CARPET_WEAR.cableX:
    case CARPET_WEAR.cableZ: {
      // A grey rubber cable cover taped down along both edges.
      const turn = look === CARPET_WEAR.cableZ ? Math.PI / 2 : 0;
      b.box(1, 0.016, 0.1, 0x6b7076, { at: [0, 0.008, 0], rot: [0, turn, 0] }, 0.006);
      b.box(1, 0.004, 0.03, 0x878c92, { at: [0, 0.017, 0], rot: [0, turn, 0] }, 0);
      for (const s of [-1, 1]) {
        const off = s * 0.065;
        b.box(
          1,
          0.003,
          0.03,
          0x9c8f5c,
          { at: turn ? [off, 0.002, 0] : [0, 0.002, off], rot: [0, turn, 0] },
          0,
        );
      }
      break;
    }
    case CARPET_WEAR.chairMat: {
      // A clear chair mat: the carpet a shade paler and cooler through it, its lip, castor tracks.
      const pale = mix(a, 0xdde6ee, 0.16);
      mark(0.86, 0.76, tint(pale, -0.06), 0, 0.02);
      mark(0.82, 0.72, pale, 0, 0.02, 0.0016);
      for (const [x, z, r] of [
        [-0.12, 0.1, 0.5],
        [0.14, 0.05, -0.4],
        [0.02, -0.12, 0.1],
      ] as const)
        mark(0.3, 0.02, tint(pale, -0.08), x, z, 0.002, r);
      break;
    }
    case CARPET_WEAR.entrance: {
      // Ribbed entrance matting just inside the front door.
      mark(0.94, 0.9, 0x575e67, 0, 0, 0.0016);
      for (let i = -3; i <= 3; i++) mark(0.84, 0.03, 0x6a727c, 0, i * 0.11, 0.002);
      break;
    }
  }
  return b.build();
}

// ---- Desks ----

/** Beech-effect laminate: darker than every station top. */
export const BEECH = 0x887258;
const DESK_STEEL = 0x6f757c;
const DESK_TOP = 0.045;

/**
 * A cheap beech-effect office desk on a metal frame, built from where it
 * sits in its run of counters (x along the run): tops butt up with a seam,
 * a grey modesty panel down the middle, and a leg frame at the run's ends
 * and every second tile, so the legs never read as a row of glyphs.
 */
export function officeDeskCounter(run: CounterRun): StationModel {
  const b = new ModelBuilder();
  const top = STATION_HEIGHT;
  const { minusEnd, plusEnd } = run;
  // Its shadow on the carpet.
  b.box(1, 0.002, 0.96, 0x5f6976, { at: [0, 0.002, 0] }, 0);
  b.box(
    minusEnd || plusEnd ? 0.86 : 1,
    0.002,
    0.74,
    0x525b67,
    {
      at: [(minusEnd ? 0.07 : 0) - (plusEnd ? 0.07 : 0), 0.0025, 0],
    },
    0,
  );
  const x0 = minusEnd ? -0.46 : -0.5;
  const x1 = plusEnd ? 0.46 : 0.5;
  const mid = (x0 + x1) / 2;
  const len = x1 - x0;
  // The frame under the top, the modesty panel and its cable tray.
  for (const z of [-0.4, 0.4])
    b.box(len - 0.04, 0.04, 0.035, DESK_STEEL, { at: [mid, top - DESK_TOP - 0.02, z] }, 0);
  b.box(len - 0.02, 0.26, 0.02, 0x7d838a, { at: [mid, top - DESK_TOP - 0.15, 0] }, 0);
  b.box(len - 0.02, 0.012, 0.022, tint(0x7d838a, -0.3), { at: [mid, top - DESK_TOP - 0.28, 0] }, 0);
  b.box(len - 0.04, 0.05, 0.12, 0x5c6168, { at: [mid, top - DESK_TOP - 0.05, -0.1] }, 0);
  if (run.legs) {
    const xs = minusEnd && plusEnd ? [-0.4, 0.4] : minusEnd ? [-0.4] : plusEnd ? [0.4] : [0];
    for (const x of xs) {
      for (const z of [-0.38, 0.38])
        b.box(0.05, top - DESK_TOP, 0.05, DESK_STEEL, { at: [x, (top - DESK_TOP) / 2, z] }, 0.008);
      b.box(0.06, 0.035, 0.86, tint(DESK_STEEL, -0.15), { at: [x, 0.018, 0] }, 0.008);
      b.box(0.05, 0.04, 0.82, DESK_STEEL, { at: [x, top - DESK_TOP - 0.02, 0] }, 0);
    }
  }
  // The top: a darker edge band, the laminate face, a faint grain, a seam where desks meet.
  b.box(len, DESK_TOP, 0.94, tint(BEECH, -0.25), { at: [mid, top - DESK_TOP / 2, 0] }, 0.006);
  b.box(len - 0.02, 0.006, 0.9, BEECH, { at: [mid, top + 0.001, 0] }, 0);
  for (const [z, w] of [
    [-0.28, 0.7],
    [0.06, 0.5],
    [0.3, 0.6],
  ] as const)
    b.box(
      Math.min(w, len - 0.1),
      0.002,
      0.012,
      tint(BEECH, -0.07),
      { at: [mid + z * 0.2, top + 0.0045, z] },
      0,
    );
  if (!minusEnd) b.box(0.008, 0.002, 0.9, tint(BEECH, -0.4), { at: [-0.5, top + 0.0045, 0] }, 0);
  if (run.knob) {
    // A cable grommet, a cable out of it.
    b.cylinder(0.035, 0.035, 0.004, 0x3a3d42, { at: [0.32, top + 0.004, -0.32] }, 14);
    b.box(0.012, 0.01, 0.1, 0x2b2f38, { at: [0.32, top + 0.009, -0.38] }, 0);
  }
  return { base: b.build(), hero: null, heroAt: [0, 0] };
}

// ---- Wall decorations ----

/** Things hung on the unit's walls (all in front of z = 0.5), by name, for `WALL_DECO_MODELS`. */
export const OFFICE_PARK_DECOS: Readonly<Record<string, () => Model>> = {
  fireExit: () => {
    // The green running-man sign, high up, its cable run in a white trunking down the wall.
    const b = new ModelBuilder();
    const green = 0x2f8f5c;
    b.box(0.42, 0.17, 0.035, 0xf1efe8, { at: [0, 0.98, 0.52] }, 0.008);
    b.box(0.38, 0.13, 0.006, green, { at: [0, 0.98, 0.54] }, 0);
    const white = 0xf6f6f2;
    // The man: head, body leaning into his run, legs, arm, and the door and arrow beside him.
    b.sphere(0.014, white, { at: [-0.1, 1.02, 0.545] });
    b.box(0.018, 0.05, 0.004, white, { at: [-0.105, 0.985, 0.545], rot: [0, 0, -0.4] }, 0);
    b.box(0.014, 0.045, 0.004, white, { at: [-0.125, 0.95, 0.545], rot: [0, 0, 0.6] }, 0);
    b.box(0.014, 0.045, 0.004, white, { at: [-0.09, 0.952, 0.545], rot: [0, 0, -0.5] }, 0);
    b.box(0.04, 0.012, 0.004, white, { at: [-0.095, 0.99, 0.545], rot: [0, 0, 0.3] }, 0);
    b.box(0.04, 0.08, 0.004, white, { at: [-0.04, 0.98, 0.545] }, 0);
    b.box(0.09, 0.016, 0.004, white, { at: [0.08, 0.98, 0.545] }, 0);
    b.box(0.03, 0.016, 0.004, white, { at: [0.115, 0.99, 0.545], rot: [0, 0, -0.8] }, 0);
    b.box(0.03, 0.016, 0.004, white, { at: [0.115, 0.97, 0.545], rot: [0, 0, 0.8] }, 0);
    b.box(0.03, 0.34, 0.02, 0xeceae2, { at: [0.18, 0.72, 0.51] }, 0.004);
    return b.build();
  },
  officeClock: () => {
    // A plain office clock: black rim, white face, ten past ten.
    const b = new ModelBuilder();
    const face = (r: number, d: number, color: number, z: number) =>
      b.cylinder(r, r, d, color, { at: [0, 0.86, z], rot: [Math.PI / 2, 0, 0] }, 28);
    face(0.15, 0.04, 0x2b2f38, 0.52);
    face(0.13, 0.01, 0xf7f6f0, 0.542);
    for (let i = 0; i < 12; i++) {
      const t = (i / 12) * Math.PI * 2;
      b.box(
        0.008,
        i % 3 === 0 ? 0.03 : 0.016,
        0.004,
        0x2b2f38,
        {
          at: [Math.sin(t) * 0.11, 0.86 + Math.cos(t) * 0.11, 0.549],
          rot: [0, 0, -t],
        },
        0,
      );
    }
    b.box(0.012, 0.09, 0.004, 0x1a1d24, { at: [0.03, 0.895, 0.552], rot: [0, 0, -0.6] }, 0);
    b.box(0.014, 0.065, 0.004, 0x1a1d24, { at: [-0.025, 0.88, 0.552], rot: [0, 0, 0.9] }, 0);
    b.box(0.004, 0.1, 0.004, COLOR.signalRed, { at: [0, 0.82, 0.554], rot: [0, 0, 0.3] }, 0);
    return b.build();
  },
  thermostat: () => {
    // The thermostat (locked at 19) beside a light switch and the alarm's call point.
    const b = new ModelBuilder();
    b.box(0.12, 0.14, 0.035, 0xe6e2d6, { at: [-0.12, 0.66, 0.52] }, 0.012);
    b.box(0.08, 0.04, 0.006, 0x8fa88a, { at: [-0.12, 0.69, 0.54] }, 0);
    b.box(0.03, 0.016, 0.004, 0x30402e, { at: [-0.12, 0.69, 0.544] }, 0);
    b.cylinder(
      0.022,
      0.022,
      0.012,
      0xc8c4b8,
      { at: [-0.12, 0.625, 0.54], rot: [Math.PI / 2, 0, 0] },
      12,
    );
    b.box(0.09, 0.09, 0.02, 0xf1efe8, { at: [0.06, 0.62, 0.51] }, 0.006);
    b.box(0.025, 0.04, 0.008, 0xd8d4c8, { at: [0.06, 0.62, 0.522] }, 0.003);
    b.box(0.1, 0.1, 0.03, COLOR.signalRed, { at: [0.22, 0.86, 0.515] }, 0.008);
    b.box(0.06, 0.06, 0.006, 0xf1efe8, { at: [0.22, 0.86, 0.532] }, 0);
    return b.build();
  },
  motivation: () => {
    // A motivational poster in a black frame: a mountain at sunrise, one word underneath.
    const b = new ModelBuilder();
    b.box(0.42, 0.54, 0.02, 0x1f2228, { at: [0, 0.72, 0.51] }, 0.004);
    b.box(0.36, 0.34, 0.004, 0x7fa6c8, { at: [0, 0.78, 0.522] }, 0);
    b.box(0.36, 0.1, 0.004, 0xe8b07a, { at: [0, 0.68, 0.523] }, 0);
    b.cylinder(
      0.04,
      0.04,
      0.004,
      0xf6d48a,
      { at: [0.08, 0.74, 0.524], rot: [Math.PI / 2, 0, 0] },
      14,
    );
    b.box(0.26, 0.26, 0.004, 0x3c4a5a, { at: [-0.06, 0.64, 0.525], rot: [0, 0, Math.PI / 4] }, 0);
    b.box(0.08, 0.08, 0.004, 0xeef2f4, { at: [-0.06, 0.8, 0.526], rot: [0, 0, Math.PI / 4] }, 0);
    // Cover the peak's lower half and the frame's foot in the poster's black.
    b.box(0.4, 0.14, 0.006, 0x1f2228, { at: [0, 0.52, 0.528] }, 0);
    b.box(0.22, 0.025, 0.004, 0xf3efe4, { at: [0, 0.535, 0.532] }, 0);
    b.box(0.14, 0.01, 0.004, 0x9aa0a8, { at: [0, 0.505, 0.532] }, 0);
    return b.build();
  },
};

// ---- Doors ----

/**
 * The door to the shared lobby round the inbox (`span` tiles wide), its
 * opening toward −z: a grey painted frame up both sides and over it, the
 * lobby's pale wall behind with the post room's pigeonholes, and the fire
 * door wedged open into the lobby.
 */
export function lobbyDoorModel(span: number): Model {
  const b = new ModelBuilder();
  const frame = 0x8b9298;
  const top = WALL_HEIGHT + 0.06;
  const half = span / 2;
  for (const x of [-half + 0.04, half - 0.04])
    b.box(0.09, top, 0.16, frame, { at: [x, top / 2, -0.38] }, 0.01);
  b.box(span + 0.06, 0.1, 0.18, frame, { at: [0, top + 0.01, -0.38] }, 0.012);
  // A small "Unit 4" plate over it.
  b.box(0.2, 0.07, 0.02, 0xe8e6de, { at: [0, top + 0.01, -0.28] }, 0.006);
  b.box(0.12, 0.02, 0.004, 0x2b2f38, { at: [0, top + 0.01, -0.268] }, 0);
  // The lobby: a pale wall, pigeonholes with post in them, a skirting.
  const hallH = top - STATION_HEIGHT;
  const wallW = span - 0.16;
  b.box(wallW, hallH, 0.03, 0xcfd2cc, { at: [0, STATION_HEIGHT + hallH / 2, -0.47] }, 0);
  const cols = Math.max(3, Math.round(wallW / 0.14));
  const cw = Math.min(0.12, (wallW - 0.1) / cols);
  for (let c = 0; c < cols; c++)
    for (let r = 0; r < 2; r++) {
      const x = (c - (cols - 1) / 2) * (cw + 0.012);
      const y = STATION_HEIGHT + 0.3 + r * 0.12;
      b.box(cw, 0.1, 0.05, 0xa7896a, { at: [x, y, -0.44] }, 0.004);
      b.box(cw - 0.02, 0.08, 0.01, 0x5a4a3c, { at: [x, y, -0.414] }, 0);
      const h = tileHash(c, r + span);
      if (h % 3 !== 0)
        b.box(
          cw - 0.03,
          0.05,
          0.012,
          h % 4 === 0 ? 0xd8c09a : COLOR.paper,
          {
            at: [x, y - 0.01, -0.41],
            rot: [0, 0, ((h >> 4) % 3) * 0.08 - 0.08],
          },
          0,
        );
    }
  // The fire door, wedged open into the lobby, its vision panel.
  const doorH = top - 0.05;
  b.box(0.05, doorH, 0.44, 0x9fa6a0, { at: [-half + 0.1, doorH / 2, -0.66] }, 0.01);
  b.pane(0.052, 0.3, 0.08, 0xdfeaf0, { at: [-half + 0.1, 0.8, -0.66] });
  b.box(0.04, 0.03, 0.14, COLOR.chrome, { at: [-half + 0.14, 0.52, -0.8] }, 0.006);
  return b.build();
}

/**
 * The lobby door on the front edge, which the camera looks over: nothing
 * tall, only an aluminium threshold, two low jambs, the glass leaves pinned
 * open against the outside wall and a wire post tray on the wall top beside it.
 */
export function lobbyThresholdModel(span: number): Model {
  const b = new ModelBuilder();
  const half = span / 2;
  b.box(span, 0.02, 0.1, ALUMINIUM, { at: [0, 0.01, 0.46] }, 0.004);
  for (const s of [-1, 1]) {
    b.box(0.08, 0.5, 0.12, ALUMINIUM, { at: [s * (half + 0.04), 0.25, 0.44] }, 0.01);
    // The lobby's glass door, pinned open against the outside wall like the front door's.
    const leafW = Math.min(0.8, half + 0.05);
    pinnedGlassLeaf(b, s * (half + 0.1 + leafW / 2), 0.512, leafW, 0.46, -s);
  }
  // The post tray on the wall top to the left, letters in it.
  const tx = -half - 0.42;
  const y = FRONT_WALL_HEIGHT;
  b.box(0.3, 0.012, 0.22, 0x5c6168, { at: [tx, y + 0.006, 0.05] }, 0);
  for (const s of [-1, 1])
    b.box(0.3, 0.06, 0.012, 0x5c6168, { at: [tx, y + 0.03, 0.05 + s * 0.11] }, 0);
  for (const s of [-1, 1])
    b.box(0.012, 0.06, 0.22, 0x5c6168, { at: [tx + s * 0.15, y + 0.03, 0.05] }, 0);
  for (let i = 0; i < 4; i++)
    b.box(
      0.24,
      0.012,
      0.16,
      i === 2 ? 0xd8c09a : COLOR.paper,
      {
        at: [tx + (i % 2) * 0.02 - 0.01, y + 0.02 + i * 0.012, 0.05],
        rot: [0, ((tileHash(i, 9) % 5) - 2) * 0.06, 0],
      },
      0,
    );
  return b.build();
}

/** Entrance matting just inside the lobby door, `width` tiles wide, the post that came under the door on it. */
export function lobbyMatModel(width: number): Model {
  const b = new ModelBuilder();
  const w = width - 0.2;
  b.box(w, 0.012, 0.62, 0x4f565f, { at: [0, 0.006, -0.12] }, 0);
  b.box(w - 0.08, 0.014, 0.54, 0x666e78, { at: [0, 0.007, -0.12] }, 0);
  for (let i = 0; i < 5; i++) {
    const h = tileHash(i + width, 13);
    b.box(
      0.16,
      0.006,
      0.11,
      i === 1 ? 0xd8c09a : i === 3 ? 0xe9ddb0 : COLOR.paper,
      {
        at: [((h % 100) / 100 - 0.5) * (w - 0.3), 0.016 + i * 0.002, -0.3 + ((h >> 7) % 30) / 100],
        rot: [0, ((h >> 3) % 7) * 0.25, 0],
      },
      0,
    );
  }
  return b.build();
}

/** Door glass: pale blue-grey, and how much of the brick behind a pinned-open leaf shows through it. */
const DOOR_GLASS = 0x8fbcd6;
const DOOR_GLASS_SEEN = 0.75;

/**
 * A glass door leaf `w` wide and `h` tall, swung right round to lie flat
 * against the outside of the front wall, centred at x, its back on the
 * brick at z: a chunky aluminium frame standing 0.1 proud (its top and
 * inner edges catch the light, so it reads as a door and not a sign), the
 * glass set back in it with the brick seen through, sky streaks, a push bar
 * and a sticker (`PULL` on one, opening hours on the other). `s` is the
 * side it hinges toward the opening from.
 */
function pinnedGlassLeaf(
  b: ModelBuilder,
  x: number,
  z: number,
  w: number,
  h: number,
  s: number,
): void {
  const deep = 0.1;
  const fz = z + deep / 2;
  const rail = 0.045;
  b.box(w, rail + 0.02, deep, ALUMINIUM, { at: [x, (rail + 0.02) / 2, fz] }, 0.008);
  b.box(w, rail, deep, ALUMINIUM, { at: [x, h - rail / 2, fz] }, 0.008);
  for (const e of [-1, 1])
    b.box(rail, h, deep, ALUMINIUM, { at: [x + (e * (w - rail)) / 2, h / 2, fz] }, 0.008);
  // The frame's inner edge a shade darker, so the glass sits in a recess.
  const gw = w - rail * 2;
  const gh = h - rail * 2 - 0.02;
  const gy = rail + 0.02 + gh / 2;
  b.box(gw, gh, 0.01, mix(DOOR_GLASS, BRICK, 1 - DOOR_GLASS_SEEN), { at: [x, gy, z + 0.03] }, 0);
  for (const e of [-1, 1])
    b.box(
      gw,
      0.008,
      deep - 0.03,
      tint(ALUMINIUM, -0.3),
      {
        at: [x, gy + (e * gh) / 2, z + 0.05],
      },
      0,
    );
  // Sky caught in the glass: two pale streaks across it.
  for (const [o, sw] of [
    [-0.1, 0.06],
    [0.04, 0.03],
  ] as const)
    b.box(
      sw,
      gh - 0.06,
      0.004,
      0xdbe8f0,
      { at: [x + o * s, gy, z + 0.037], rot: [0, 0, 0.5 * s] },
      0,
    );
  // The push bar on stand-offs, and the sticker by the handle edge.
  const hx = x + s * (w / 2 - 0.12);
  b.box(w * 0.55, 0.025, 0.025, COLOR.chrome, { at: [x, 0.25, z + deep + 0.03] }, 0.008);
  for (const e of [-1, 1])
    b.box(0.02, 0.02, 0.04, COLOR.chrome, { at: [x + e * w * 0.24, 0.25, z + deep + 0.01] }, 0);
  b.box(0.1, 0.05, 0.004, 0xf3f1ea, { at: [hx, 0.36, z + 0.04] }, 0);
  b.box(0.07, 0.016, 0.004, s < 0 ? 0x2b2f38 : 0x3a8a7a, { at: [hx, 0.36, z + 0.043] }, 0);
}

/**
 * The glass front door onto the car park at the ship hatch, on the front
 * edge (`span` tiles wide): low, as everything in front must be. Aluminium
 * jambs just past the opening, a transom bar in front of the station's face,
 * a threshold, and both glass leaves pinned open flat against the outside
 * of the front wall.
 */
export function frontDoorModel(span: number): Model {
  const b = new ModelBuilder();
  const half = span / 2;
  const h = 0.58;
  for (const s of [-1, 1]) {
    const x = s * (half + 0.06);
    b.box(0.09, h, 0.12, ALUMINIUM, { at: [x, h / 2, 0.45] }, 0.008);
    b.box(0.02, h - 0.04, 0.124, tint(ALUMINIUM, -0.35), { at: [x - s * 0.035, h / 2, 0.45] }, 0);
    const leafW = Math.min(0.9, half + 0.1);
    pinnedGlassLeaf(b, s * (half + 0.12 + leafW / 2), 0.512, leafW, 0.5, -s);
  }
  b.box(span + 0.26, 0.05, 0.12, ALUMINIUM, { at: [0, h - 0.025, 0.52] }, 0.008);
  b.box(span + 0.2, 0.01, 0.124, tint(ALUMINIUM, -0.3), { at: [0, h - 0.055, 0.52] }, 0);
  b.box(span, 0.016, 0.12, ALUMINIUM, { at: [0, 0.008, 0.5] }, 0.003);
  // A door entry buzzer on the right jamb.
  b.box(0.06, 0.1, 0.02, 0xc8ccd0, { at: [half + 0.06, 0.36, 0.52] }, 0.006);
  b.led(0.008, COLOR.ledGreen, { at: [half + 0.06, 0.39, 0.532] });
  return b.build();
}

/**
 * The glass front door on a back or side edge (opening toward −z): a tall
 * dark bronze frame round the station, glass side lights, the leaf open outward.
 */
export function tallGlassDoorModel(span: number): Model {
  const b = new ModelBuilder();
  const half = span / 2;
  const top = WALL_HEIGHT + 0.04;
  for (const x of [-half + 0.04, half - 0.04])
    b.box(0.08, top, 0.12, BRONZE, { at: [x, top / 2, -0.4] }, 0.008);
  b.box(span + 0.04, 0.08, 0.14, BRONZE, { at: [0, top, -0.4] }, 0.008);
  b.pane(span - 0.12, top - STATION_HEIGHT - 0.06, 0.02, 0xdfeaf0, {
    at: [0, (top + STATION_HEIGHT) / 2, -0.47],
  });
  b.box(0.04, top - 0.06, 0.4, BRONZE, { at: [half - 0.08, (top - 0.06) / 2, -0.66] }, 0.006);
  return b.build();
}

// ---- Strip lights ----

/** How far a strip light's drop runs up from the fitting to the wire. */
export const STRIP_HANG = 0.3;
/** The catenary wire and the drops: pale galvanised steel, thin, so it never crosses a station as a black line. */
const WIRE = 0x6f747a;
const WIRE_THICK = 0.006;

/**
 * A fluorescent batten, built round the light (at the origin) so it hangs
 * where the room's lamps shine from: a white steel body, two bare tubes
 * showing on either side of it (drawn in the glow layer, so they bloom), on
 * one thin drop up to the wire `STRIP_HANG` over its middle, a small clip
 * where it meets it.
 */
export function stripLightModel(): Model {
  const b = new ModelBuilder();
  b.box(0.86, 0.04, 0.07, 0xe2e4e6, { at: [0, 0.01, 0] }, 0.01);
  for (const x of [-0.42, 0.42]) b.box(0.03, 0.06, 0.12, 0xcfd2d6, { at: [x, -0.012, 0] }, 0.006);
  for (const z of [-0.045, 0.045])
    b.add(
      new THREE.CylinderGeometry(0.02, 0.02, 0.8, 10),
      0xf0f6ff,
      {
        at: [0, -0.02, z],
        rot: [0, 0, Math.PI / 2],
      },
      'glow',
    );
  b.box(0.05, 0.012, 0.03, 0xcfd2d6, { at: [0, 0.036, 0] }, 0.004);
  b.box(
    WIRE_THICK,
    STRIP_HANG - 0.03,
    WIRE_THICK,
    WIRE,
    { at: [0, 0.03 + (STRIP_HANG - 0.03) / 2, 0] },
    0,
  );
  b.box(0.02, 0.02, 0.016, WIRE, { at: [0, STRIP_HANG, 0] }, 0.004);
  return b.build();
}

/**
 * The wire the battens hang from, through `points` (`[x, y]`), sagging a
 * little between them, tied off at each end to a slim post on the wall top.
 */
export function stripWireModel(points: readonly [number, number][]): Model {
  const b = new ModelBuilder();
  const sag = 0.04;
  const steps = 5;
  for (let i = 0; i + 1 < points.length; i++) {
    const [x0, y0] = points[i] ?? [0, 0];
    const [x1, y1] = points[i + 1] ?? [0, 0];
    const at = (t: number): [number, number] => [
      x0 + (x1 - x0) * t,
      y0 + (y1 - y0) * t - sag * 4 * t * (1 - t),
    ];
    for (let k = 0; k < steps; k++) {
      const [ax, ay] = at(k / steps);
      const [bx, by] = at((k + 1) / steps);
      b.box(
        Math.hypot(bx - ax, by - ay) + 0.002,
        WIRE_THICK,
        WIRE_THICK,
        WIRE,
        { at: [(ax + bx) / 2, (ay + by) / 2, 0], rot: [0, 0, Math.atan2(by - ay, bx - ax)] },
        0,
      );
    }
  }
  for (const [p, s] of [
    [points[0], 1],
    [points[points.length - 1], -1],
  ] as const)
    if (p) {
      // A slim steel post up from the wall top, the wire tied off at its head.
      const x = p[0] - s * 0.06;
      const postH = p[1] + 0.03 - WALL_HEIGHT;
      if (postH > 0)
        b.box(0.022, postH, 0.022, 0x8a8f93, { at: [x, WALL_HEIGHT + postH / 2, 0] }, 0.004);
      b.box(0.05, 0.012, 0.05, 0x7b8085, { at: [x, WALL_HEIGHT + 0.006, 0] }, 0.003);
      b.box(0.03, 0.02, 0.03, 0x8a8f93, { at: [x, p[1] + 0.03, 0] }, 0.004);
    }
  return b.build();
}
