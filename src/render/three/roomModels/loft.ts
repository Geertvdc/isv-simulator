import * as THREE from 'three';
import { type WallPiece, tileHash } from '../../mapShape';
import { type Model, ModelBuilder, type Place, tint } from '../kit';
import { SLAB_DEPTH, STATION_HEIGHT, WALL_HEIGHT } from '../layout';
import { FLOOR_COLORS, WALL_COLORS } from '../look';
import { COLOR } from '../palette';
import type { CounterRun } from '../rooms/counterRun';
import { LOFT_ART_HALF, POLISHED_WEAR, POLISHED_WEAR_KINDS } from '../rooms/loftRoom';
import { lettering } from '../setDressing/businessPark';
import type { StationModel } from '../stationModels';

/**
 * The rooftop loft of the Seed Round level (wall theme `loft`, floor theme
 * `polished`), built in code: white-painted brick over a birch-ply band of
 * built-in shelving, black steel trim and the odd steel column, cool light
 * coping, the building's board-marked concrete under a galvanised coping,
 * polished concrete with saw cuts and its wear, black steel trestle desks
 * with dark-stained ply tops, the lift door, the roof door, what hangs on
 * the back wall and the linear LED pendants.
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
type Face = (u: number, y: number) => Place;
/** The four faces of a block `half` out from its middle: front, back, left, right. */
function faces(half: number): Face[] {
  return [
    (u, y) => ({ at: [u, y, half], rot: [0, 0, 0] }),
    (u, y) => ({ at: [u, y, -half], rot: [0, 0, 0] }),
    (u, y) => ({ at: [-half, y, u], rot: [0, Math.PI / 2, 0] }),
    (u, y) => ({ at: [half, y, u], rot: [0, Math.PI / 2, 0] }),
  ];
}

/** A glowing box (a lit line on a screen, a neon tube), in the glow layer. */
function glowBox(
  b: ModelBuilder,
  w: number,
  h: number,
  d: number,
  color: number,
  place: Place,
): void {
  b.add(new THREE.BoxGeometry(w, h, d), color, place, 'glow');
}

// ---- Materials ----

/** Black powder-coated steel: the trim, the columns, the trestles, the door frames. */
export const BLACK_STEEL = 0x2a2d32;
/** Birch plywood (the built-in shelving band) and its darker ply layers and cubby backs. */
const BIRCH = 0xc6a676;
const BIRCH_DARK = tint(BIRCH, -0.3);
const CUBBY = 0x5a4a3a;
/** The building's board-marked concrete and its galvanised coping. */
const CONCRETE = 0x80868a;
const GALVANISED = 0xa3aaaf;
/** The founders' kilim rug: muted terracotta, a charcoal border, cream lines, a dusty rose motif. */
const RUG = { field: 0x9a6a58, border: 0x4a4246, line: 0xd8c8a8, motif: 0xb88a86 } as const;
/** Dark-stained ply: the desk tops, a near-neutral dark grey-brown, darker than every station top. */
export const STAINED_PLY = 0x474442;

// ---- Walls ----

/** Heights up a wall: the steel skirting, the top of the birch-ply band, a brick course. */
const SKIRTING = 0.06;
const PLY_TOP = 0.46;
const COURSE = 0.1;
const BRICK_LENGTH = 0.25;
/** The cap's lip past the wall's faces. */
const CAP = 0.045;
const CAP_LIP = 0.022;
/** Looks a wall comes in: a socket and conduit, scuffs and stickers, a patch, plain ply. */
export const LOFT_WALL_LOOKS = 4;
/** The glazed cap: black steel edges along the run, a mullion every half tile, glass between. */
const CAP_EDGE = 0.03;
const MULLION = 0.025;
const CAP_GLASS = 0x858c92;
const CAP_SHEEN = 0xafb6bc;

/**
 * The steel-and-glass cap on top of a wall `h` tall, its run along x or z:
 * a cool steel coping slab on a black steel angle, black steel edge strips
 * along both long edges (down the slab's sides too), a steel mullion across
 * every half tile, and between them inset glass panels with a lighter sheen
 * across each, so the wall tops read as the loft's glazing, not a worktop.
 */
function cap(b: ModelBuilder, h: number, along: 'x' | 'z'): void {
  const { top } = WALL_COLORS.loft;
  const body = h - CAP;
  const lip = 1 + CAP_LIP * 2;
  // A box `l` along the run, `w` across it, at (u along, y, v across).
  const run = (l: number, hh: number, w: number, color: number, u: number, y: number, v: number) =>
    along === 'x'
      ? b.box(l, hh, w, color, { at: [u, y, v] }, 0)
      : b.box(w, hh, l, color, { at: [v, y, u] }, 0);
  b.box(1.03, 0.016, 1.03, BLACK_STEEL, { at: [0, body - 0.008, 0] }, 0);
  b.box(lip, CAP, lip, top, { at: [0, h - CAP / 2, 0] }, 0);
  for (const s of [-1, 1]) {
    // The long edges: a strip on top and down the slab's side.
    run(1, 0.008, CAP_EDGE, BLACK_STEEL, 0, h + 0.004, s * (lip / 2 - CAP_EDGE / 2));
    run(1, CAP + 0.008, 0.006, BLACK_STEEL, 0, h - CAP / 2 + 0.004, s * (lip / 2 + 0.003));
  }
  const inner = lip - CAP_EDGE * 2;
  for (const u of [-0.5, 0]) run(MULLION, 0.007, inner, BLACK_STEEL, u, h + 0.0035, 0);
  // The glass between: inset a little from the steel, a sheen across it on the slant.
  const pane = 0.5 - MULLION - 0.024;
  const across = inner - 0.03;
  for (const u of [-0.25, 0.25]) {
    run(pane, 0.003, across, CAP_GLASS, u, h + 0.0015, 0);
    for (const [du, dv, w, l] of [
      [-0.04, -0.12, 0.05, 0.3],
      [0.06, -0.05, 0.018, 0.2],
    ] as const) {
      const turn = along === 'x' ? -0.75 : 0.75;
      const [x, z] = along === 'x' ? [u + du, dv] : [dv, u + du];
      b.box(w, 0.002, l, CAP_SHEEN, { at: [x, h + 0.0034, z], rot: [0, turn, 0] }, 0);
    }
  }
}

/** White-painted brick from `y0` to `y1` on a face: courses, staggered joints, a few bricks off. */
function paintedBrick(b: ModelBuilder, on: Face, y0: number, y1: number, seed: number): void {
  const paint = WALL_COLORS.loft.face;
  const mortar = tint(paint, -0.13);
  const courses = Math.floor((y1 - y0) / COURSE);
  for (let i = 1; i <= courses; i++) {
    const y = y0 + i * COURSE;
    if (y < y1 - 0.02) b.box(1, 0.01, 0.004, mortar, on(0, y), 0);
  }
  for (let i = 0; i < courses + 1; i++) {
    const c0 = y0 + i * COURSE;
    const hh = Math.min(COURSE, y1 - c0);
    if (hh < 0.02) continue;
    const shift = i % 2 ? BRICK_LENGTH / 2 : 0;
    for (let u = -0.5 + BRICK_LENGTH - shift; u < 0.49; u += BRICK_LENGTH)
      if (u > -0.49) b.box(0.01, hh - 0.01, 0.004, mortar, on(u, c0 + hh / 2), 0);
    // A brick a shade off here and there: the paint over old brick is never quite even.
    const h = tileHash(i + seed * 7, seed + 11);
    if (h % 3 === 0) {
      const u = -0.5 + shift + BRICK_LENGTH * ((h >> 3) % 4) + BRICK_LENGTH / 2;
      if (u < 0.4 && u > -0.4)
        b.box(
          BRICK_LENGTH - 0.016,
          hh - 0.02,
          0.005,
          tint(paint, h % 2 ? -0.05 : 0.05),
          on(u, c0 + hh / 2),
          0,
        );
    }
  }
}

/** The muted spines of books and binders in the cubbies. */
const SPINES = [0x4a5a6e, 0x7a4a44, 0x8a8f96, 0x3a3d44, 0x5f7062, 0xb59a5e];

/**
 * The birch-ply band of built-in shelving on a face: two cubbies a tile
 * with a shelf across, dark backs, books and boxes in some (by `seed`), the
 * sheet joint between them, a black steel angle along its top.
 */
function plyBand(b: ModelBuilder, on: Face, seed: number, cubbies: boolean): void {
  if (cubbies) {
    for (const [i, u] of [-0.25, 0.25].entries()) {
      for (const [j, y] of [
        [0, (SKIRTING + 0.26) / 2 + 0.01],
        [1, (0.28 + PLY_TOP) / 2 - 0.01],
      ] as const) {
        const hh = j === 0 ? 0.18 : 0.15;
        b.box(0.4, hh, 0.004, CUBBY, on(u, y), 0);
        const h = tileHash(seed * 5 + i, j + seed);
        const kind = h % 4;
        if (kind === 0) {
          // A row of books, one leaning.
          for (let k = 0; k < 5; k++)
            b.box(
              0.045,
              hh - 0.03 - ((h >> (k + 2)) % 3) * 0.015,
              0.01,
              SPINES[(h + k) % SPINES.length] ?? COLOR.paper,
              on(u - 0.14 + k * 0.05, y - 0.01 - ((h >> (k + 2)) % 3) * 0.0075),
              0,
            );
        } else if (kind === 1) {
          // A storage box with a label.
          b.box(0.26, hh - 0.03, 0.012, 0xd8d2c4, on(u + 0.03, y - 0.012), 0);
          b.box(0.08, 0.03, 0.014, 0xf4f1ea, on(u + 0.03, y), 0);
        } else if (kind === 2) {
          // A router, its lights on.
          b.box(0.22, 0.05, 0.012, 0xe6e6e2, on(u, y - hh / 2 + 0.04), 0);
          for (let k = 0; k < 3; k++)
            b.box(
              0.012,
              0.012,
              0.016,
              COLOR.ledGreen,
              on(u - 0.06 + k * 0.03, y - hh / 2 + 0.04),
              0,
            );
        }
      }
    }
    // The ply frame: the shelf, the uprights and the sheet joint.
    b.box(0.98, 0.016, 0.008, BIRCH, on(0, 0.27), 0);
    for (const u of [-0.47, 0, 0.47])
      b.box(0.03, PLY_TOP - SKIRTING, 0.008, BIRCH, on(u, (PLY_TOP + SKIRTING) / 2), 0);
    b.box(0.006, PLY_TOP - SKIRTING, 0.01, BIRCH_DARK, on(0, (PLY_TOP + SKIRTING) / 2), 0);
  } else {
    // Plain ply sheets: a joint halfway, the grain faint.
    b.box(0.008, PLY_TOP - SKIRTING, 0.005, BIRCH_DARK, on(0, (PLY_TOP + SKIRTING) / 2), 0);
    for (const [u, y] of [
      [-0.24, 0.2],
      [0.22, 0.32],
    ] as const)
      b.box(0.34, 0.006, 0.005, tint(BIRCH, -0.08), on(u, y), 0);
  }
}

/**
 * A wall of the loft: white-painted brick above a birch-ply band of
 * built-in shelving, black steel skirting and a steel angle on the band,
 * cool light coping on top. All four faces carry it, so the side walls show
 * it too; `look` adds a socket and conduit, scuffs and stickers, a fresh
 * paint patch, or a black steel column at the tile's edge. The low front
 * wall is the building's concrete upstand with the same coping.
 */
export function loftWallModel(piece: WallPiece, look: number): Model {
  const { face } = WALL_COLORS.loft;
  const b = new ModelBuilder();
  if (piece === 'wall-front') {
    // The wall cut down: the birch-ply band on its own, black steel kick strip, the coping.
    const h = 0.2;
    const body = h - CAP;
    b.box(1, body, 1, BIRCH, { at: [0, body / 2, 0] }, 0);
    b.box(1.012, 0.05, 1.012, BLACK_STEEL, { at: [0, 0.025, 0] }, 0);
    for (const on of faces(0.503).slice(0, 2)) {
      b.box(
        0.008,
        body - 0.05,
        0.005,
        BIRCH_DARK,
        on(-0.5 + 0.5 * (look % 2), (body + 0.05) / 2),
        0,
      );
      b.box(0.4, 0.005, 0.005, tint(BIRCH, -0.08), on(0.15 - 0.3 * (look % 2), 0.1), 0);
    }
    cap(b, h, 'x');
    return b.build();
  }
  const h = WALL_HEIGHT;
  const body = h - CAP;
  b.box(1, body, 1, face, { at: [0, body / 2, 0] }, 0);
  b.box(1.006, PLY_TOP, 1.006, BIRCH, { at: [0, PLY_TOP / 2, 0] }, 0);
  b.box(1.018, SKIRTING, 1.018, BLACK_STEEL, { at: [0, SKIRTING / 2, 0] }, 0.004);
  b.box(1.02, 0.026, 1.02, BLACK_STEEL, { at: [0, PLY_TOP + 0.01, 0] }, 0.004);
  faces(0.503).forEach((on, f) => {
    paintedBrick(b, on, PLY_TOP + 0.023, body - 0.01, look * 4 + f);
    plyBand(b, on, look * 4 + f, f < 2 && look !== 3);
    const mark = (w: number, hh: number, color: number, u: number, y: number, turn = 0) => {
      const p = on(u, y);
      b.box(w, hh, 0.007, color, { at: p.at, rot: [0, p.rot?.[1] ?? 0, turn] }, 0);
    };
    if (f >= 2) return;
    if (look === 0) {
      // A black conduit down from the coping to a double socket on the ply.
      mark(0.025, body - PLY_TOP - 0.02, BLACK_STEEL, 0.38, (body + PLY_TOP) / 2);
      mark(0.13, 0.08, 0xf1efe8, 0.38, PLY_TOP - 0.06);
      mark(0.025, 0.035, 0x4a4d52, 0.35, PLY_TOP - 0.06);
      mark(0.025, 0.035, 0x4a4d52, 0.41, PLY_TOP - 0.06);
    } else if (look === 1) {
      // Scuffs from scooter handlebars, a few laptop stickers on the paint.
      for (const [u, y, w] of [
        [-0.26, PLY_TOP + 0.24, 0.16],
        [-0.12, PLY_TOP + 0.21, 0.1],
      ] as const)
        mark(w, 0.022, tint(face, -0.22), u, y, 0.08);
      for (const [u, y, c, r] of [
        [0.18, PLY_TOP + 0.3, 0x6a8fb8, 0.2],
        [0.28, PLY_TOP + 0.36, 0xc87a8a, -0.15],
        [0.22, PLY_TOP + 0.43, 0x5a5f68, 0.05],
      ] as const)
        mark(0.07, 0.05, c, u, y, r);
    } else if (look === 2) {
      // A fresh patch of paint where a shelf came down, one hole never filled.
      mark(0.3, 0.2, tint(face, 0.08), -0.08, PLY_TOP + 0.3);
      mark(0.016, 0.016, 0x3b3833, 0.24, PLY_TOP + 0.32);
    }
  });
  // A side wall runs down the map (its tiles stacked in z), the rest across.
  cap(b, h, piece === 'wall-inner' ? 'z' : 'x');
  return b.build();
}

/**
 * A black steel column standing on a wall's inner face (toward +z), its
 * middle at x = 0: an I-section with lighter flange edges, a bolted base
 * plate and a cap plate into the coping's steel edge. `rooms/loft` places
 * them at the corners and every few tiles (`LoftRoom.posts`).
 */
export function loftPostModel(): Model {
  const b = new ModelBuilder();
  const h = WALL_HEIGHT + 0.012;
  const z = 0.5 + 0.03;
  b.box(0.075, h, 0.05, BLACK_STEEL, { at: [0, h / 2, z] }, 0.004);
  for (const s of [-1, 1])
    b.box(0.012, h - 0.04, 0.052, tint(BLACK_STEEL, 0.22), { at: [s * 0.032, h / 2, z] }, 0);
  b.box(0.022, h - 0.06, 0.008, tint(BLACK_STEEL, -0.25), { at: [0, h / 2, z + 0.026] }, 0);
  b.box(0.14, 0.018, 0.09, BLACK_STEEL, { at: [0, 0.009, z + 0.01] }, 0.003);
  for (const s of [-1, 1])
    b.cylinder(0.009, 0.009, 0.01, 0x5a6068, { at: [s * 0.05, 0.022, z + 0.03] }, 8);
  b.box(0.1, 0.014, 0.08, BLACK_STEEL, { at: [0, h - 0.007, z - 0.012] }, 0.003);
  return b.build();
}

// ---- The building's concrete under the room ----

/** Looks the concrete comes in: clean, a rust run under a coping joint, a water stain. */
export const LOFT_PLINTH_LOOKS = 3;

/**
 * The building's board-marked concrete under each tile, the diorama's base
 * standing in for a parapet: a galvanised steel coping round the top edge
 * with its drip line, board marks and tie holes on every face, and by
 * `look` a rust run or a water stain down it.
 */
export function loftPlinthModel(look: number): Model {
  const b = new ModelBuilder();
  const top = -0.013;
  const bottom = top - SLAB_DEPTH;
  const concrete = tint(CONCRETE, [0, -0.04, 0.04][look] ?? 0);
  b.box(1.002, SLAB_DEPTH, 1.002, concrete, { at: [0, top - SLAB_DEPTH / 2, 0] }, 0);
  b.box(1.014, 0.035, 1.014, GALVANISED, { at: [0, top - 0.0175, 0] }, 0);
  b.box(1.016, 0.006, 1.016, tint(GALVANISED, -0.35), { at: [0, top - 0.037, 0] }, 0);
  faces(0.503).forEach((on, f) => {
    for (let y = top - 0.04 - 0.09; y > bottom + 0.02; y -= 0.09)
      b.box(1.002, 0.006, 0.004, tint(concrete, -0.08), on(0, y), 0);
    const shift = (tileHash(f, look) % 3) * 0.2 - 0.2;
    b.box(
      0.006,
      SLAB_DEPTH - 0.06,
      0.004,
      tint(concrete, -0.1),
      on(shift, top - 0.04 - (SLAB_DEPTH - 0.06) / 2),
      0,
    );
    for (const u of [-0.25, 0.25])
      for (const y of [top - 0.15, top - 0.33])
        b.box(0.022, 0.022, 0.006, tint(concrete, -0.25), on(u + shift * 0.2, y), 0);
    if (look === 1) {
      b.box(0.04, 0.22, 0.006, mix(concrete, 0x8a5a3a, 0.4), on(0.12, top - 0.15), 0);
      b.box(0.02, 0.12, 0.007, mix(concrete, 0x8a5a3a, 0.55), on(0.12, top - 0.1), 0);
    } else if (look === 2) {
      b.box(0.3, 0.16, 0.006, tint(concrete, -0.1), on(-0.18, bottom + 0.08), 0);
    }
    b.box(1.004, 0.04, 0.005, tint(concrete, -0.18), on(0, bottom + 0.02), 0);
  });
  return b.build();
}

// ---- Polished concrete ----

/**
 * The two scooters' tyre tracks from the lift: how far across the tile each
 * runs at depth `s` (tiles in from the lift), and where it fades out.
 */
const TYRE_ARCS: readonly { at: (s: number) => number; end: number }[] = [
  { at: (s) => -0.05 - 0.045 * s * s, end: 2.6 },
  { at: (s) => 0.07 + 0.03 * s * s - 0.02 * s, end: 3 },
];
/** The floor-box channel's black steel lid, across. */
const CHANNEL_WIDTH = 0.06;

/** Mottled looks the concrete comes in, picked per tile by its hash. */
const POLISHED_MOTTLES = 4;

/** A floor look: its wear, its mottle, and whether the bay's saw cuts run along its −x and −z edges. */
export function polishedLook(x: number, y: number, wear: number): number {
  const jx = ((x % 2) + 2) % 2 === 0 ? 1 : 0;
  const jz = ((y % 2) + 2) % 2 === 0 ? 2 : 0;
  const mottle = (tileHash(x + 11, y + 23) >>> 4) % POLISHED_MOTTLES;
  return (wear * POLISHED_MOTTLES + mottle) * 4 + jx + jz;
}

/** A tile's brightness: ±3.5% per 2×2 bay (the pours), a touch more per tile; within 4%. */
export function polishedTone(x: number, y: number, salt: number): number {
  const bx = Math.floor(x / 2);
  const by = Math.floor(y / 2);
  const bay = ((Math.imul(bx + 31, 73856093) ^ Math.imul(by + 17, 19349663) ^ salt) >>> 0) % 1001;
  const own = (tileHash(x + 3, y + 5) ^ salt) % 101;
  return 1 + (bay / 1000 - 0.5) * 0.07 + (own / 100 - 0.5) * 0.008;
}

/**
 * A floor tile of polished concrete (`look` from `polishedLook`): light warm
 * grey, mottled in soft cloudy patches the way power-floated concrete is,
 * a polished sheen, flecks of aggregate, thin saw cuts on the edges of the
 * 2×2 bays, and its wear (see `POLISHED_WEAR`).
 */
export function polishedFloorModel(look: number): Model {
  const [base, joint] = FLOOR_COLORS.polished;
  const mottle = Math.floor(look / 4) % POLISHED_MOTTLES;
  const wear = Math.floor(look / 4 / POLISHED_MOTTLES) % POLISHED_WEAR_KINDS;
  const b = new ModelBuilder();
  b.box(1, 0.012, 1, base, { at: [0, -0.006, 0] }, 0);
  const mark = (w: number, d: number, color: number, x: number, z: number, y = 0.0012, turn = 0) =>
    b.box(w, 0.002, d, color, { at: [x, y, z], rot: [0, turn, 0] }, 0);
  // Cloudy patches a shade off, inside the tile, and a sheen across one of them.
  for (let i = 0; i < 3; i++) {
    const h = tileHash(i + 5, mottle + 31);
    const r = 0.16 + (h % 5) * 0.03;
    const x = ((h >> 4) % 60) / 100 - 0.3;
    const z = ((h >> 10) % 60) / 100 - 0.3;
    const lift = (h >> 6) % 2 ? 0.035 : -0.03;
    b.cylinder(r, r, 0.002, tint(base, lift), { at: [x, 0.0006 + i * 0.0001, z] }, 18);
    b.cylinder(
      r * 0.6,
      r * 0.6,
      0.002,
      tint(base, lift * 1.5),
      { at: [x + 0.03, 0.0008 + i * 0.0001, z - 0.02] },
      14,
    );
  }
  // Aggregate flecks.
  for (let i = 0; i < 10; i++) {
    const h = tileHash(i + 3, mottle * 13 + (look & 3) + 7);
    const s = 0.012 + (h % 3) * 0.006;
    mark(
      s,
      s,
      h % 2 ? tint(base, -0.16) : tint(base, 0.12),
      ((h >> 3) % 90) / 100 - 0.45,
      ((h >> 9) % 90) / 100 - 0.45,
      0.0014,
      (h % 7) * 0.4,
    );
  }
  // The saw cuts, with a lighter arris beside them where the edge was polished.
  if (look & 1) {
    mark(0.016, 1, joint, -0.492, 0, 0.0018);
    mark(0.012, 1, tint(base, 0.08), -0.478, 0, 0.0018);
  }
  if (look & 2) {
    mark(1, 0.016, joint, 0, -0.492, 0.0018);
    mark(1, 0.012, tint(base, 0.08), 0, -0.478, 0.0018);
  }
  const dark = (t: number) => mix(base, 0x3a3632, t);
  switch (wear) {
    case POLISHED_WEAR.tyres:
    case POLISHED_WEAR.tyresX:
    case POLISHED_WEAR.tyresMid:
    case POLISHED_WEAR.tyresMidX:
    case POLISHED_WEAR.tyresFaint:
    case POLISHED_WEAR.tyresFaintX: {
      // Two scooters' tyre tracks in from the lift, side by side at the door, then arcing
      // apart; each tile draws its stretch of the arcs (its depth in from the lift), the
      // third tile fainter and fading out.
      const depth =
        wear === POLISHED_WEAR.tyres || wear === POLISHED_WEAR.tyresX
          ? 0
          : wear === POLISHED_WEAR.tyresMid || wear === POLISHED_WEAR.tyresMidX
            ? 1
            : 2;
      const across =
        wear === POLISHED_WEAR.tyresX ||
        wear === POLISHED_WEAR.tyresMidX ||
        wear === POLISHED_WEAR.tyresFaintX;
      for (const arc of TYRE_ARCS) {
        const steps = 8;
        for (let k = 0; k < steps; k++) {
          const s0 = depth + k / steps;
          const s1 = depth + (k + 1) / steps;
          if (s1 > arc.end + 1e-9) break;
          const [a0, a1] = [arc.at(s0), arc.at(s1)];
          if (Math.abs(a0) > 0.47 || Math.abs(a1) > 0.47) continue;
          // Along the tile from the lift's side (−) inward (+); across it by the arc.
          const [z0, z1] = [s0 - depth - 0.5, s1 - depth - 0.5];
          const fade = depth < 2 ? 0 : (s0 - 2) * 0.7;
          const c = mix(base, 0x3a3632, (depth < 2 ? 0.36 : 0.26) * (1 - fade));
          const len = Math.hypot(z1 - z0, a1 - a0) + 0.004;
          const turn = Math.atan2(a1 - a0, z1 - z0);
          const [px, pz] = across ? [(z0 + z1) / 2, (a0 + a1) / 2] : [(a0 + a1) / 2, (z0 + z1) / 2];
          b.box(
            0.042,
            0.002,
            len,
            c,
            {
              at: [px, 0.002, pz],
              rot: [0, across ? Math.PI / 2 - turn : turn, 0],
            },
            0,
          );
        }
      }
      break;
    }
    case POLISHED_WEAR.scuffs: {
      // Castor arcs and a dull patch where the chair rolls.
      mark(0.62, 0.52, tint(base, -0.05), 0.02, 0.04, 0.0018);
      for (const [x, z, r] of [
        [-0.14, 0.12, 0.6],
        [0.16, 0.02, -0.5],
        [0.02, -0.16, 0.15],
        [-0.04, 0.24, -0.2],
        [0.12, 0.2, 1.1],
      ] as const)
        mark(0.26, 0.016, dark(0.18), x, z, 0.002, r);
      break;
    }
    case POLISHED_WEAR.channelX:
    case POLISHED_WEAR.channelZ:
    case POLISHED_WEAR.floorBox:
    case POLISHED_WEAR.floorBoxZ: {
      // The floor-box cable channel: a black steel lid flush in the slab, its screws; a floor
      // box (lid up, cables out) where it meets a desk.
      const turn =
        wear === POLISHED_WEAR.channelZ || wear === POLISHED_WEAR.floorBoxZ ? Math.PI / 2 : 0;
      b.box(1, 0.004, CHANNEL_WIDTH, BLACK_STEEL, { at: [0, 0.002, 0], rot: [0, turn, 0] }, 0);
      b.box(
        1,
        0.0045,
        0.008,
        tint(BLACK_STEEL, 0.25),
        { at: [0, 0.0025, 0], rot: [0, turn, 0] },
        0,
      );
      if (wear === POLISHED_WEAR.floorBox || wear === POLISHED_WEAR.floorBoxZ) {
        b.box(0.3, 0.005, 0.3, BLACK_STEEL, { at: [0, 0.0025, 0] }, 0);
        b.box(0.24, 0.006, 0.24, 0x5a6068, { at: [0, 0.003, 0] }, 0);
        // The lid flipped up on its hinge, a socket's plugs and their leads.
        b.box(0.24, 0.12, 0.012, 0x5a6068, { at: [0, 0.06, -0.12], rot: [0.25, 0, 0] }, 0.003);
        b.box(0.07, 0.03, 0.05, 0xd8dadc, { at: [0.05, 0.016, 0.02] }, 0.005);
        b.box(0.012, 0.012, 0.3, 0x2b2f38, { at: [0.05, 0.006, 0.17] }, 0);
        b.box(0.012, 0.012, 0.22, 0x3a6ab8, { at: [-0.04, 0.006, 0.14], rot: [0, 0.3, 0] }, 0);
      } else
        for (const u of [-0.25, 0.25]) {
          const [x, z] = turn ? [0, u] : [u, 0];
          b.cylinder(0.008, 0.008, 0.006, 0x8a929c, { at: [x, 0.004, z] }, 8);
        }
      break;
    }
    case POLISHED_WEAR.rugNW:
    case POLISHED_WEAR.rugNE:
    case POLISHED_WEAR.rugSW:
    case POLISHED_WEAR.rugSE: {
      // A quarter of the founders' kilim rug (a 2×2 rug): its border on the outer edges, a diamond.
      const sx = wear === POLISHED_WEAR.rugNE || wear === POLISHED_WEAR.rugSE ? 1 : -1;
      const sz = wear === POLISHED_WEAR.rugSW || wear === POLISHED_WEAR.rugSE ? 1 : -1;
      const inset = 0.12;
      // The rug reaches from the tile's inner edge to `inset` short of its outer edges.
      const w = 1 - inset;
      const cx = (-sx * inset) / 2;
      const cz = (-sz * inset) / 2;
      b.box(w, 0.008, w, RUG.field, { at: [cx, 0.004, cz] }, 0);
      const band = 0.09;
      b.box(w, 0.009, band, RUG.border, { at: [cx, 0.0045, sz * (0.5 - inset - band / 2)] }, 0);
      b.box(band, 0.009, w, RUG.border, { at: [sx * (0.5 - inset - band / 2), 0.0045, cz] }, 0);
      b.box(w, 0.0095, 0.014, RUG.line, { at: [cx, 0.0047, sz * (0.5 - inset - band - 0.03)] }, 0);
      b.box(0.014, 0.0095, w, RUG.line, { at: [sx * (0.5 - inset - band - 0.03), 0.0047, cz] }, 0);
      // A quarter of the big diamond at the rug's middle (the tile's inner corner), a small one out here.
      for (const [r, y, c] of [
        [0.36, 0.0091, RUG.motif],
        [0.2, 0.0093, RUG.field],
      ] as const) {
        const [ix, iz] = [-sx * 0.5, -sz * 0.5];
        quarterDiamond(b, [ix, iz], [ix + sx * r, iz], [ix, iz + sz * r], y, c);
      }
      b.box(
        0.12,
        0.0098,
        0.12,
        RUG.border,
        { at: [sx * 0.1, 0.0047, sz * 0.1], rot: [0, Math.PI / 4, 0] },
        0,
      );
      // Fringe on the short edges.
      for (let i = 0; i < 9; i++)
        b.box(
          0.012,
          0.004,
          0.05,
          RUG.line,
          { at: [cx - w / 2 + 0.05 + i * ((w - 0.1) / 8), 0.002, sz * (0.5 - inset + 0.02)] },
          0,
        );
      break;
    }
    case POLISHED_WEAR.grit: {
      // Roof gravel tracked in: a few specks and a faint scuff of grime.
      mark(0.7, 0.4, tint(base, -0.03), 0, 0.18, 0.0018);
      for (let i = 0; i < 10; i++) {
        const h = tileHash(i + 40, 9);
        b.box(
          0.018,
          0.01,
          0.016,
          h % 2 ? 0x8a8a84 : 0x6f6c66,
          { at: [((h >> 3) % 70) / 100 - 0.35, 0.005, ((h >> 9) % 50) / 100], rot: [0, h % 5, 0] },
          0,
        );
      }
      break;
    }
  }
  return b.build();
}

/** A flat triangle on the floor at height `y` through three (x, z) corners, facing up. */
function quarterDiamond(
  b: ModelBuilder,
  a: readonly [number, number],
  c: readonly [number, number],
  d: readonly [number, number],
  y: number,
  color: number,
): void {
  // Shapes lie in x/y; turned flat, shape y becomes −z.
  const shape = new THREE.Shape([a, c, d].map(([x, z]) => new THREE.Vector2(x, -z)));
  b.add(new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2), color, { at: [0, y, 0] });
}

// ---- Desks ----

const DESK_TOP = 0.05;
/** The birch ply edge under the desk's stained face. */
const DESK_BIRCH = 0.015;

/**
 * A desk of the loft: a black steel trestle frame and a dark-stained ply
 * top (one sheet along the run) with a thin birch ply edge on a steel rim, built from where it sits in its run of
 * counters (x along the run). Trestles stand at the run's ends and every
 * second tile, so the legs never read as a row of glyphs; a steel rail runs
 * along under the top between them.
 */
export function loftDeskCounter(run: CounterRun): StationModel {
  const b = new ModelBuilder();
  const top = STATION_HEIGHT;
  const { minusEnd, plusEnd } = run;
  const [base] = FLOOR_COLORS.polished;
  b.box(1, 0.002, 0.94, tint(base, -0.18), { at: [0, 0.002, 0] }, 0);
  const x0 = minusEnd ? -0.46 : -0.5;
  const x1 = plusEnd ? 0.46 : 0.5;
  const mid = (x0 + x1) / 2;
  const len = x1 - x0;
  for (const z of [-0.36, 0.36])
    b.box(len - 0.02, 0.035, 0.03, BLACK_STEEL, { at: [mid, top - DESK_TOP - 0.018, z] }, 0);
  if (run.legs) {
    const xs = minusEnd && plusEnd ? [-0.38, 0.38] : minusEnd ? [-0.38] : plusEnd ? [0.38] : [0];
    const legH = top - DESK_TOP - 0.03;
    for (const x of xs) {
      // An A-frame trestle across the desk: two splayed legs, a top beam and a brace.
      for (const s of [-1, 1])
        b.box(
          0.035,
          legH + 0.02,
          0.035,
          BLACK_STEEL,
          { at: [x, legH / 2, s * 0.33], rot: [s * 0.1, 0, 0] },
          0.006,
        );
      b.box(0.045, 0.035, 0.8, BLACK_STEEL, { at: [x, top - DESK_TOP - 0.02, 0] }, 0.006);
      b.box(0.03, 0.025, 0.62, BLACK_STEEL, { at: [x, 0.16, 0] }, 0);
      for (const s of [-1, 1]) b.box(0.06, 0.012, 0.06, 0x1d1f23, { at: [x, 0.006, s * 0.37] }, 0);
    }
  }
  // The top, one sheet along the run: a black steel rim, a thin birch ply edge over it, the
  // stained face inset so the birch shows as a hairline round it. No seams, no grain.
  const rim = DESK_TOP - DESK_BIRCH;
  b.box(len, rim, 0.92, BLACK_STEEL, { at: [mid, top - DESK_BIRCH - rim / 2, 0] }, 0.003);
  b.box(len, DESK_BIRCH, 0.91, BIRCH, { at: [mid, top - DESK_BIRCH / 2, 0] }, 0);
  const inset = 0.008;
  b.box(
    len - (minusEnd ? inset : 0) - (plusEnd ? inset : 0),
    0.004,
    0.91 - inset * 2,
    STAINED_PLY,
    { at: [mid + ((minusEnd ? inset : 0) - (plusEnd ? inset : 0)) / 2, top + 0.002, 0] },
    0,
  );
  if (run.knob) {
    // A cable grommet, a laptop charger's lead out of it.
    b.cylinder(0.035, 0.035, 0.004, 0x1d1f23, { at: [0.3, top + 0.006, -0.32] }, 14);
    b.box(0.012, 0.01, 0.12, 0xe8e8e4, { at: [0.3, top + 0.01, -0.38] }, 0);
  }
  return { base: b.build(), hero: null, heroAt: [0, 0] };
}

// ---- What hangs on the back wall ----

/** Muted greens, reds and ambers for the screens and charts: under the stations' own. */
const SCREEN = 0x172030;
const ALERT = 0xff4a3a;
/** A screen washed red by the alert: dark enough for the graph and the figures to read on it. */
const ALERT_WASH = 0x3a0c10;
const OK = 0x4ac07a;
const AMBER = 0xffb347;

/**
 * Things hung on the loft's back wall (all in front of z = 0.5), by name, for
 * the room's story pieces (see `loftRoom`); `dashboard` and `cheque` span two
 * tiles, centred between them.
 */
export const LOFT_WALL_ART: Readonly<Record<string, () => Model>> = {
  dashboard: () => {
    // The big status dashboard, three tiles wide: prod is on fire. The whole screen washed red,
    // an INCIDENT banner, a traffic graph climbing then falling off a cliff, 500s in big figures.
    const b = new ModelBuilder();
    const w = LOFT_ART_HALF.dashboard * 2 - 0.06;
    const [h, cy] = [0.58, 0.79];
    b.box(w + 0.06, h + 0.06, 0.04, 0x15171b, { at: [0, cy, 0.52] }, 0.012);
    glowBox(b, w, h, 0.004, ALERT_WASH, { at: [0, cy, 0.542] });
    // The banner across the top.
    const bannerY = cy + h / 2 - 0.06;
    glowBox(b, w - 0.04, 0.1, 0.004, ALERT, { at: [0, bannerY, 0.546] });
    lettering(b, 'PROD INCIDENT', -0.35, bannerY, 0.549, 0.016, 0xfff4ee, 0.003);
    lettering(b, 'SEV 1', 0.78, bannerY, 0.549, 0.014, 0xfff4ee, 0.003);
    // The graph: a grid, the line rising (green) then falling off a cliff (red).
    const gx0 = -w / 2 + 0.08;
    const gx1 = 0.3;
    const gy0 = cy - h / 2 + 0.07;
    const gy1 = bannerY - 0.09;
    for (let i = 0; i <= 3; i++)
      b.box(
        gx1 - gx0,
        0.005,
        0.003,
        0x5a2a2e,
        { at: [(gx0 + gx1) / 2, gy0 + ((gy1 - gy0) * i) / 3, 0.548] },
        0,
      );
    const pts: [number, number][] = [
      [0, 0.4],
      [0.1, 0.5],
      [0.2, 0.46],
      [0.3, 0.62],
      [0.42, 0.7],
      [0.52, 0.9],
      [0.62, 0.55],
      [0.72, 0.22],
      [0.86, 0.1],
      [1, 0.03],
    ];
    for (let i = 0; i + 1 < pts.length; i++) {
      const [ax, ay] = pts[i] ?? [0, 0];
      const [bx, by] = pts[i + 1] ?? [0, 0];
      const p0 = [gx0 + ax * (gx1 - gx0), gy0 + ay * (gy1 - gy0)] as const;
      const p1 = [gx0 + bx * (gx1 - gx0), gy0 + by * (gy1 - gy0)] as const;
      const len = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
      const red = ax >= 0.52;
      glowBox(b, len + 0.02, red ? 0.03 : 0.02, 0.004, red ? 0xff6a5a : OK, {
        at: [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2, 0.552],
        rot: [0, 0, Math.atan2(p1[1] - p0[1], p1[0] - p0[0])],
      });
    }
    // The error count, big, and the status tiles under it: all red but one amber.
    const rx = (gx1 + w / 2) / 2;
    glowBox(b, w / 2 - gx1 - 0.08, 0.2, 0.003, mix(ALERT, SCREEN, 0.55), {
      at: [rx, gy1 - 0.08, 0.547],
    });
    lettering(b, '500', rx, gy1 - 0.08, 0.55, 0.03, 0xfff4ee, 0.004);
    [ALERT, ALERT, AMBER, ALERT].forEach((c, i) => {
      const tx = rx - 0.27 + i * 0.18;
      const ty = gy0 + 0.06;
      glowBox(b, 0.15, 0.1, 0.003, mix(c, SCREEN, 0.45), { at: [tx, ty, 0.547] });
      glowBox(b, 0.1, 0.02, 0.003, c, { at: [tx, ty + 0.018, 0.55] });
      b.box(0.06, 0.014, 0.003, 0xf0d8d4, { at: [tx - 0.02, ty - 0.024, 0.55] }, 0);
    });
    // The wall mount's cable dropping to the ply band.
    b.box(
      0.02,
      cy - h / 2 - 0.47,
      0.012,
      BLACK_STEEL,
      { at: [w / 2 - 0.15, (cy - h / 2 + 0.47) / 2, 0.51] },
      0,
    );
    return b.build();
  },
  errors: () => {
    // The second screen: the error rate per minute, the bars climbing into the red, 5XX on top.
    const b = new ModelBuilder();
    const w = LOFT_ART_HALF.errors * 2 - 0.06;
    const [h, cy] = [0.46, 0.8];
    b.box(w + 0.06, h + 0.06, 0.04, 0x15171b, { at: [0, cy, 0.52] }, 0.01);
    glowBox(b, w, h, 0.004, ALERT_WASH, { at: [0, cy, 0.542] });
    const headY = cy + h / 2 - 0.05;
    glowBox(b, w - 0.03, 0.07, 0.004, mix(ALERT, SCREEN, 0.2), { at: [0, headY, 0.546] });
    lettering(b, '5XX/MIN', 0, headY, 0.549, 0.011, 0xfff4ee, 0.003);
    const base = cy - h / 2 + 0.05;
    const heights = [0.04, 0.05, 0.04, 0.06, 0.05, 0.09, 0.16, 0.24, 0.28];
    heights.forEach((bh, i) => {
      const x = -w / 2 + 0.07 + i * ((w - 0.14) / (heights.length - 1));
      const c = bh > 0.1 ? 0xff6a5a : bh > 0.055 ? AMBER : OK;
      glowBox(b, 0.045, bh, 0.003, c, { at: [x, base + bh / 2, 0.549] });
    });
    b.box(w - 0.08, 0.004, 0.003, 0xf0d8d4, { at: [0, base + 0.12, 0.55] }, 0);
    return b.build();
  },
  cheque: () => {
    // The oversized novelty cheque from the investors, a little crooked on two screws.
    const b = new ModelBuilder();
    const [w, h, cy] = [1.46, 0.5, 0.8];
    const turn = 0.03;
    const at = (x: number, y: number, z: number): Place => ({ at: [x, y, z] });
    b.box(w, h, 0.02, 0xeef2ee, at(0, cy, 0.515), 0.006);
    b.box(w, 0.05, 0.004, 0x5d8fbf, at(0, cy + h / 2 - 0.025, 0.527));
    b.box(w, 0.02, 0.004, 0x5d8fbf, at(0, cy - h / 2 + 0.01, 0.527));
    // Bank name, date line, payee line, the amount box, the memo, the signature.
    lettering(b, 'SEED BANK', -0.5, cy + 0.15, 0.528, 0.01, 0x2e4a6b, 0.003);
    b.box(0.3, 0.006, 0.003, 0x8a96a3, at(0.45, cy + 0.15, 0.528));
    lettering(b, 'PAY TO', -0.6, cy + 0.04, 0.528, 0.008, 0x5a6470, 0.003);
    lettering(b, 'THE STARTUP', -0.24, cy + 0.045, 0.528, 0.013, 0x1d2a3a, 0.003);
    b.box(0.8, 0.005, 0.003, 0x8a96a3, at(-0.2, cy + 0.005, 0.528));
    b.box(0.5, 0.2, 0.004, 0xffffff, at(0.42, cy - 0.09, 0.528));
    b.box(0.5, 0.008, 0.004, 0x5d8fbf, at(0.42, cy - 0.19, 0.531));
    // The amount, big: $2M (an S with its bar through it).
    lettering(b, 'S2M', 0.42, cy - 0.09, 0.531, 0.03, 0x1d2a3a, 0.004);
    b.box(0.016, 0.2, 0.004, 0x1d2a3a, at(0.42 - 4 * 0.03, cy - 0.09, 0.536));
    b.box(0.5, 0.005, 0.003, 0x8a96a3, at(-0.36, cy - 0.15, 0.528));
    for (const [x, y, r, l] of [
      [-0.5, -0.13, 0.6, 0.08],
      [-0.44, -0.13, -0.7, 0.07],
      [-0.38, -0.125, 0.5, 0.09],
      [-0.31, -0.13, -0.3, 0.1],
    ] as const)
      b.box(l, 0.008, 0.003, 0x24426e, { at: [x, cy + y, 0.53], rot: [0, 0, r] }, 0);
    for (const s of [-1, 1])
      b.cylinder(
        0.012,
        0.012,
        0.01,
        0x8a929c,
        { at: [s * (w / 2 - 0.05), cy + 0.2, 0.528], rot: [Math.PI / 2, 0, 0] },
        8,
      );
    // Hung a little crooked: the whole cheque turned about its middle.
    const model = b.build();
    for (const g of [model.body, model.glow, model.glass])
      g?.translate(0, -cy, 0).rotateZ(turn).translate(0, cy, 0);
    return model;
  },
  growthChart: () => {
    // The whiteboard with the growth chart: a hockey stick in green marker, the arrow off the top.
    const b = new ModelBuilder();
    const cy = 0.76;
    b.box(0.76, 0.5, 0.03, 0xb8bec8, { at: [0, cy, 0.515] }, 0.01);
    b.box(0.7, 0.44, 0.008, 0xf6f7f4, { at: [0, cy, 0.532] }, 0);
    const ink = 0x2b2f38;
    b.box(0.008, 0.32, 0.003, ink, { at: [-0.27, cy - 0.01, 0.537] }, 0);
    b.box(0.5, 0.008, 0.003, ink, { at: [-0.02, cy - 0.17, 0.537] }, 0);
    const green = 0x3a9a5c;
    let [px, py] = [-0.26, cy - 0.15];
    for (let i = 1; i <= 8; i++) {
      const t = i / 8;
      const nx = -0.26 + t * 0.42;
      const ny = cy - 0.15 + Math.pow(t, 3) * 0.3;
      b.box(
        Math.hypot(nx - px, ny - py) + 0.006,
        0.012,
        0.003,
        green,
        { at: [(px + nx) / 2, (py + ny) / 2, 0.538], rot: [0, 0, Math.atan2(ny - py, nx - px)] },
        0,
      );
      [px, py] = [nx, ny];
    }
    b.box(0.05, 0.012, 0.003, green, { at: [px - 0.012, py + 0.012, 0.538], rot: [0, 0, -0.6] }, 0);
    b.box(0.05, 0.012, 0.003, green, { at: [px + 0.016, py - 0.012, 0.538], rot: [0, 0, 2.2] }, 0);
    lettering(b, 'MRR', -0.18, cy + 0.16, 0.536, 0.012, 0x3a6ab8, 0.003);
    // Sticky notes down the right edge, a marker tray with markers.
    for (const [y, c] of [
      [cy + 0.12, 0xe8d77a],
      [cy + 0.02, 0xe8a0b0],
      [cy - 0.08, 0xe8d77a],
    ] as const)
      b.box(0.08, 0.08, 0.004, c, { at: [0.27, y, 0.538], rot: [0, 0, (y - cy) * 0.6] }, 0);
    b.box(0.5, 0.025, 0.06, 0xb8bec8, { at: [0, cy - 0.255, 0.54] }, 0.008);
    for (const [x, c] of [
      [-0.1, 0x2b2f38],
      [-0.02, green],
      [0.06, COLOR.signalRed],
    ] as const)
      b.box(0.08, 0.018, 0.018, c, { at: [x, cy - 0.235, 0.545] }, 0.004);
    return b.build();
  },
  neon: () => {
    // The startup's logo in neon on a dark acrylic backer: a sprout in a ring.
    const b = new ModelBuilder();
    const cy = 0.84;
    b.box(0.6, 0.42, 0.02, 0x1d2027, { at: [0, cy, 0.515] }, 0.01);
    for (const [x, y] of [
      [-0.26, 0.17],
      [0.26, 0.17],
      [-0.26, -0.17],
      [0.26, -0.17],
    ] as const)
      b.cylinder(
        0.012,
        0.012,
        0.03,
        0xb8bec8,
        { at: [x, cy + y, 0.53], rot: [Math.PI / 2, 0, 0] },
        8,
      );
    const pink = 0xff6aa8;
    const leaf = 0xffc6dc;
    b.add(new THREE.TorusGeometry(0.15, 0.012, 8, 32), pink, { at: [0, cy, 0.54] }, 'glow');
    glowBox(b, 0.016, 0.16, 0.016, leaf, { at: [0, cy - 0.04, 0.545] });
    for (const s of [-1, 1]) {
      const g = new THREE.SphereGeometry(0.05, 12, 8);
      g.scale(1.3, 0.55, 0.3);
      b.add(
        g,
        leaf,
        { at: [s * 0.058, cy + 0.06 - (s + 1) * 0.015, 0.545], rot: [0, 0, s * 0.5] },
        'glow',
      );
    }
    // The flex down the wall to its transformer on the ply.
    b.box(0.014, cy - 0.21 - 0.42, 0.01, 0xe8e8e4, { at: [0.24, (cy - 0.21 + 0.42) / 2, 0.51] }, 0);
    b.box(0.08, 0.05, 0.04, 0x2b2f38, { at: [0.24, 0.4, 0.52] }, 0.006);
    return b.build();
  },
  beacon: () => {
    // The red incident beacon on a steel bracket, high up: someone switched it on.
    const b = new ModelBuilder();
    const y = 0.96;
    b.box(0.08, 0.12, 0.02, BLACK_STEEL, { at: [0, y - 0.02, 0.51] }, 0.006);
    b.box(0.05, 0.02, 0.14, BLACK_STEEL, { at: [0, y - 0.06, 0.57] }, 0.004);
    b.cylinder(0.055, 0.06, 0.04, 0x1d1f23, { at: [0, y - 0.03, 0.62] }, 16);
    b.add(
      new THREE.CylinderGeometry(0.045, 0.05, 0.08, 16),
      ALERT,
      { at: [0, y + 0.03, 0.62] },
      'glow',
    );
    b.add(
      new THREE.SphereGeometry(0.045, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2),
      ALERT,
      { at: [0, y + 0.07, 0.62] },
      'glow',
    );
    for (let i = 0; i < 4; i++) {
      const t = (i / 4) * Math.PI * 2 + 0.4;
      b.box(
        0.006,
        0.12,
        0.006,
        0x3a3d44,
        { at: [Math.cos(t) * 0.052, y + 0.04, 0.62 + Math.sin(t) * 0.052] },
        0,
      );
    }
    // A cable down to the shelf.
    b.box(0.012, y - 0.45, 0.01, BLACK_STEEL, { at: [0.03, (y + 0.45) / 2 - 0.05, 0.505] }, 0);
    return b.build();
  },
};

// ---- Doors ----

/** The lift's brushed steel. */
const LIFT_STEEL = 0xa9b0b6;

/** The "LOFT 7" plaque and the lift's call buttons, on the wall `x` along from the door's middle. */
function liftPlaque(b: ModelBuilder, x: number, faceZ: number): void {
  b.box(0.3, 0.13, 0.016, 0x1d2027, { at: [x, 0.84, faceZ + 0.008] }, 0.006);
  lettering(b, 'LOFT 7', x, 0.84, faceZ + 0.016, 0.014, 0xe8e2d4, 0.003);
  b.box(0.08, 0.16, 0.012, LIFT_STEEL, { at: [x, 0.58, faceZ + 0.006] }, 0.004);
  b.add(
    new THREE.CylinderGeometry(0.018, 0.018, 0.008, 12),
    AMBER,
    { at: [x, 0.62, faceZ + 0.014], rot: [Math.PI / 2, 0, 0] },
    'glow',
  );
  b.cylinder(
    0.018,
    0.018,
    0.008,
    0xd8dadc,
    { at: [x, 0.55, faceZ + 0.014], rot: [Math.PI / 2, 0, 0] },
    12,
  );
}

/**
 * The lift door from the building's core round the inbox (`span` tiles
 * wide), its opening toward −z: a black steel portal up both sides and over
 * it, the floor indicator lit on the lintel (7, going up), the brushed steel
 * car behind with its handrail, the landing doors slid back into the jambs,
 * and on the wall beside it the "LOFT 7" plaque over the call buttons. On
 * the front edge, which the camera looks over, only a low steel threshold
 * and the plaque on the wall top.
 */
export function liftDoorModel(span: number, low: boolean): Model {
  const b = new ModelBuilder();
  const half = span / 2;
  if (low) {
    b.box(span, 0.02, 0.12, LIFT_STEEL, { at: [0, 0.01, 0.44] }, 0.004);
    for (const s of [-1, 1])
      b.box(0.08, 0.42, 0.1, BLACK_STEEL, { at: [s * (half + 0.04), 0.21, 0.45] }, 0.01);
    return b.build();
  }
  const top = WALL_HEIGHT;
  // The car behind the opening: brushed steel walls, a handrail, a mirror strip.
  const carH = top - STATION_HEIGHT;
  const carW = span - 0.2;
  b.box(carW, carH, 0.03, LIFT_STEEL, { at: [0, STATION_HEIGHT + carH / 2, -0.48] }, 0);
  for (let i = 0; i < 6; i++)
    b.box(
      0.004,
      carH - 0.04,
      0.003,
      tint(LIFT_STEEL, -0.12),
      { at: [-carW / 2 + ((i + 0.5) * carW) / 6, STATION_HEIGHT + carH / 2, -0.464] },
      0,
    );
  b.box(carW - 0.1, 0.025, 0.04, COLOR.chrome, { at: [0, STATION_HEIGHT + 0.22, -0.44] }, 0.008);
  b.box(carW * 0.5, 0.26, 0.004, 0xc8d4dc, { at: [0, STATION_HEIGHT + 0.38, -0.462] }, 0);
  // The landing doors, slid back into the jambs.
  for (const s of [-1, 1])
    b.box(
      0.14,
      top - 0.04,
      0.03,
      tint(LIFT_STEEL, -0.08),
      { at: [s * (half - 0.16), (top - 0.04) / 2, -0.42] },
      0.004,
    );
  // The black steel portal.
  for (const s of [-1, 1]) {
    b.box(0.1, top, 0.14, BLACK_STEEL, { at: [s * (half - 0.05), top / 2, -0.36] }, 0.01);
    b.box(
      0.02,
      top - 0.02,
      0.144,
      tint(BLACK_STEEL, 0.25),
      { at: [s * (half - 0.1), (top - 0.02) / 2, -0.36] },
      0,
    );
  }
  b.box(span + 0.02, 0.17, 0.16, BLACK_STEEL, { at: [0, top - 0.085, -0.36] }, 0.012);
  // The floor indicator on the lintel: 7, the up arrow lit.
  b.box(0.34, 0.1, 0.012, 0x101216, { at: [0, top - 0.085, -0.274] }, 0.004);
  lettering(b, '7', 0.07, top - 0.085, -0.268, 0.014, AMBER, 0.003);
  const up = new THREE.ConeGeometry(0.03, 0.05, 3);
  b.add(up, AMBER, { at: [-0.07, top - 0.085, -0.264] }, 'glow');
  for (let i = 0; i < 4; i++)
    b.box(
      0.012,
      0.012,
      0.004,
      i === 3 ? AMBER : 0x3a2e1e,
      { at: [-0.12 + i * 0.024 + 0.13, top - 0.12, -0.266] },
      0,
    );
  // The threshold and the plaque on the wall to the left.
  b.box(span - 0.2, 0.012, 0.1, LIFT_STEEL, { at: [0, 0.006, -0.32] }, 0);
  liftPlaque(b, -half - 0.3, 0.5);
  return b.build();
}

/** Door glass: pale blue-grey, cooler in the blue hour. */
const DOOR_GLASS = 0x9cc0d4;

/**
 * A bi-fold glass door folded back outside the opening at `x` (two leaves
 * `w` wide and `h` tall in black steel frames, zig-zagged against each
 * other), standing out onto the roof from the wall's outside face at z.
 */
function foldedLeaves(
  b: ModelBuilder,
  x: number,
  z: number,
  w: number,
  h: number,
  s: number,
): void {
  const rail = 0.035;
  for (let i = 0; i < 2; i++) {
    const turn = (i === 0 ? 0.35 : -0.35) * s;
    const lx = x + s * (0.03 + i * 0.07);
    const lz = z + w / 2 + 0.02;
    const at = (dx: number, y: number, dz: number): Place => ({
      at: [
        lx + dx * Math.cos(turn) + dz * Math.sin(turn),
        y,
        lz - dx * Math.sin(turn) + dz * Math.cos(turn),
      ],
      rot: [0, turn, 0],
    });
    // In the leaf's own frame its width runs along z.
    b.box(0.03, rail, w, BLACK_STEEL, at(0, rail / 2, 0), 0.004);
    b.box(0.03, rail, w, BLACK_STEEL, at(0, h - rail / 2, 0), 0.004);
    for (const e of [-1, 1])
      b.box(0.03, h, rail, BLACK_STEEL, at(0, h / 2, (e * (w - rail)) / 2), 0.004);
    b.pane(0.012, h - rail * 2, w - rail * 2, DOOR_GLASS, at(0, h / 2, 0));
    b.box(0.014, h - rail * 2 - 0.04, 0.03, 0xdbe8f0, at(0.004, h / 2, -w * 0.18));
  }
}

/**
 * The door out onto the roof plant deck at the ship hatch on the front
 * edge (`span` tiles wide): low, as everything in front must be. Black steel
 * jambs past the opening, a steel threshold, its bi-fold glass doors folded
 * back out onto the roof either side, and on the wall top beside it a lit
 * "PROD" sign on two legs, its arrow pointing out to the roof.
 */
export function roofDoorFrontModel(span: number): Model {
  const b = new ModelBuilder();
  const half = span / 2;
  const h = 0.46;
  for (const s of [-1, 1]) {
    const x = s * (half + 0.05);
    b.box(0.08, h, 0.12, BLACK_STEEL, { at: [x, h / 2, 0.45] }, 0.008);
    b.box(0.02, h - 0.02, 0.124, tint(BLACK_STEEL, 0.3), { at: [x - s * 0.035, h / 2, 0.45] }, 0);
    foldedLeaves(b, x, 0.51, 0.36, 0.42, s);
  }
  b.box(span + 0.1, 0.016, 0.14, LIFT_STEEL, { at: [0, 0.008, 0.5] }, 0.003);
  // The sign on the wall top left of the opening: a dark box on legs, PROD and an arrow lit.
  const sx = -half - 0.5;
  const sy = 0.33;
  for (const e of [-1, 1])
    b.box(0.025, 0.07, 0.025, BLACK_STEEL, { at: [sx + e * 0.2, 0.235, 0.05] }, 0);
  b.box(0.58, 0.17, 0.06, 0x1d2027, { at: [sx, sy, 0.05] }, 0.012);
  glowBox(b, 0.54, 0.13, 0.004, 0x2f7a5c, { at: [sx, sy, 0.082] });
  lettering(b, 'PROD', sx - 0.06, sy, 0.085, 0.022, 0xeafff4, 0.003);
  b.add(
    new THREE.ConeGeometry(0.04, 0.08, 3),
    0xeafff4,
    { at: [sx + 0.19, sy, 0.088], rot: [0, 0, Math.PI] },
    'glow',
  );
  return b.build();
}

/**
 * The door out onto the roof on a back or side edge (opening toward −z): a
 * tall black steel frame round the ship hatch, a glass side light, the glass
 * leaf swung open outward onto the roof, and the lit "PROD" sign over it.
 */
export function roofDoorTallModel(span: number): Model {
  const b = new ModelBuilder();
  const half = span / 2;
  const top = WALL_HEIGHT + 0.04;
  for (const x of [-half + 0.04, half - 0.04])
    b.box(0.08, top, 0.12, BLACK_STEEL, { at: [x, top / 2, -0.4] }, 0.008);
  b.box(span + 0.04, 0.08, 0.14, BLACK_STEEL, { at: [0, top, -0.4] }, 0.008);
  b.box(
    0.04,
    top - STATION_HEIGHT,
    0.06,
    BLACK_STEEL,
    { at: [0, (top + STATION_HEIGHT) / 2, -0.42] },
    0.004,
  );
  b.pane(span - 0.12, top - STATION_HEIGHT - 0.06, 0.02, 0xdfeaf0, {
    at: [0, (top + STATION_HEIGHT) / 2, -0.46],
  });
  // The leaf, swung out onto the roof.
  const leafH = top - 0.06;
  b.box(0.04, leafH, 0.5, BLACK_STEEL, { at: [half - 0.06, leafH / 2, -0.72] }, 0.006);
  b.pane(0.03, leafH - 0.12, 0.42, DOOR_GLASS, { at: [half - 0.06, leafH / 2, -0.72] });
  // The sign over the frame.
  b.box(0.34, 0.11, 0.05, 0x1d2027, { at: [0, top + 0.11, -0.38] }, 0.008);
  glowBox(b, 0.3, 0.08, 0.004, 0x2a6a50, { at: [0, top + 0.11, -0.354] });
  lettering(b, 'PROD', -0.03, top + 0.11, -0.351, 0.012, 0xeafff4, 0.003);
  b.add(
    new THREE.ConeGeometry(0.024, 0.044, 3),
    0xeafff4,
    { at: [0.11, top + 0.11, -0.35] },
    'glow',
  );
  return b.build();
}

// ---- Pendants ----

/** The globe's lit opal glass: the room's cool-white LED light (the Light track's lamp colour). */
export const PENDANT_GLOW = 0xeef2ff;
/** How far a pendant's suspension runs up from the fitting to the wire. */
export const PENDANT_HANG = 0.3;
/** The catenary wire and the drops: mid steel, thin, so they never cross a station as a black line. */
const WIRE = 0x666c73;
const WIRE_THICK = 0.006;

/**
 * An opal globe pendant, built round the light (at the origin): the globe
 * in the glow layer (so it blooms and reads as lit from above), a black
 * gallery cap holding it, and one black flex straight up to a clip on the
 * wire `PENDANT_HANG` above.
 */
export function loftPendantModel(): Model {
  const b = new ModelBuilder();
  b.add(new THREE.SphereGeometry(0.1, 18, 12), PENDANT_GLOW, { at: [0, 0, 0] }, 'glow');
  b.cylinder(0.045, 0.06, 0.05, 0x1d1f23, { at: [0, 0.105, 0] }, 16);
  b.cylinder(0.02, 0.02, 0.03, 0x1d1f23, { at: [0, 0.145, 0] }, 10);
  const cord = PENDANT_HANG - 0.16;
  b.box(WIRE_THICK, cord, WIRE_THICK, 0x2a2d32, { at: [0, 0.16 + cord / 2, 0] }, 0);
  b.box(0.022, 0.02, 0.016, WIRE, { at: [0, PENDANT_HANG, 0] }, 0.004);
  return b.build();
}

/**
 * The steel cable the pendants hang from, through `points` (`[x, y]`),
 * sagging a little between them, tied off at each end to a slim black steel
 * post on the wall top with a turnbuckle.
 */
export function loftWireModel(points: readonly [number, number][]): Model {
  const b = new ModelBuilder();
  const sag = 0.035;
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
        {
          at: [(ax + bx) / 2, (ay + by) / 2, 0],
          rot: [0, 0, Math.atan2(by - ay, bx - ax)],
        },
        0,
      );
    }
  }
  for (const [p, s] of [
    [points[0], 1],
    [points[points.length - 1], -1],
  ] as const)
    if (p) {
      const x = p[0] - s * 0.06;
      const postH = p[1] + 0.03 - WALL_HEIGHT;
      if (postH > 0)
        b.box(0.024, postH, 0.024, BLACK_STEEL, { at: [x, WALL_HEIGHT + postH / 2, 0] }, 0.004);
      b.box(0.06, 0.012, 0.06, BLACK_STEEL, { at: [x, WALL_HEIGHT + 0.006, 0] }, 0.003);
      b.box(0.05, 0.016, 0.016, 0x8a929c, { at: [x + s * 0.04, p[1] + 0.03, 0] }, 0.004);
    }
  return b.build();
}
