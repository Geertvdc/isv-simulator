import * as THREE from 'three';
import { type WallPiece, tileHash } from '../../mapShape';
import { type Model, ModelBuilder, type Place, tint } from '../kit';
import { FRONT_WALL_HEIGHT, STATION_HEIGHT, WALL_HEIGHT } from '../layout';
import { FLOOR_COLORS, WALL_COLORS } from '../look';
import {
  BLOCK_LOOKS,
  type Banner,
  FLOOR_WEAR,
  FLOOR_WEAR_KINDS,
  LOWER_ART_HALF,
  BALUSTRADE_LOOKS,
  STAIR_RAMP,
  balustradeSwap,
  blockSwap,
  liftSwap,
} from '../rooms/lowerFloorsRoom';
import { CARPET_WEAR_KINDS } from '../rooms/midRiseRoom';
import type { StationModel } from '../stationModels';
import { framed, text } from './basement';
import { ALU, GLASS_CORE, MID_RISE_WALL_ART, YOTTA_VIOLET, carpetFloorModel } from './midRise';

/**
 * The ground and first floor of 3-1's mid-rise, mid-move-in (wall theme
 * `lowerFloors`, floor theme `mixedFloors`), built in code where it isn't
 * 3-1's: the ground floor's studded grey-green rubber with its walk-off
 * mat, trolley tracks, wet patch and the post room's pale lino; the
 * stairwell's concrete treads with steel nosings and its painted block
 * walls with their handrails; the lift's brushed-steel door frames and
 * floor indicators; the mail chute's steel hatches; the post room's
 * pigeonhole hatch at the inbox; the loading bay's open roller shutter at
 * the ship; what hangs on the walls; the welcome banner over the shaft.
 * The partitions, the carpet upstairs and the pendants are 3-1's.
 */

/** A face of a tile-sized block: where along it `u`, at height `y`, sits on it, and its turn. */
type Face = (u: number, y: number) => Place;
/** The four faces of a block `half` out from its middle: front, back, left, right. */
function faces(half: number): Face[] {
  return [
    (u, y) => ({ at: [u, y, half], rot: [0, 0, 0] }),
    (u, y) => ({ at: [-u, y, -half], rot: [0, Math.PI, 0] }),
    (u, y) => ({ at: [-half, y, u], rot: [0, -Math.PI / 2, 0] }),
    (u, y) => ({ at: [half, y, -u], rot: [0, Math.PI / 2, 0] }),
  ];
}

// ---- Materials ----

/** Brushed stainless: the lift's doors and frames, the chute. */
export const STEEL = 0xa3abb2;
/** The lift frame's top plate, seen from above: darker than the stations, never a white slab. */
export const LIFT_TOP = 0x7e868d;
const DOOR_SEAM = 0x3a3e44;
const STEEL_DARK = 0x737b83;
const STEEL_EDGE = 0x5a6168;
const INK = 0x2a2d33;
const PAPER = 0xe8e8e2;
const MARKER_RED = 0xc0302a;
/** Safety yellow and black, dulled a touch so it never outshines a station. */
const HAZARD = 0xd8b42a;
const HAZARD_BLACK = 0x2a2c30;
/** Safety yellow for the stairwell's handrail. */
export const RAIL_YELLOW = 0xc8a032;
/** The floor numbers stencilled on the stairwell's concrete. */
const STENCIL = 0xe8e4d8;
/** The first floor's slab edge. */
const SLAB_EDGE = 0x5a6168;

// ---- The floor ----

/** Looks per wear: the variant picked by the tile's hash (the same as `carpetLook`). */
const VARIANTS = 3;

/** A floor look: its wear and its variant (for the carpet, exactly `carpetLook`). */
export function mixedLook(x: number, y: number, wear: number): number {
  const variant = (tileHash(x + 13, y + 3) >>> 4) % VARIANTS;
  return wear * VARIANTS + variant;
}

/** A tile's brightness: ±4% per tile, picked by the tile and the level. */
export function mixedTone(x: number, y: number, salt: number): number {
  const own = ((Math.imul(x + 53, 73856093) ^ Math.imul(y + 11, 19349663) ^ salt) >>> 0) % 1001;
  return 1 + (own / 1000 - 0.5) * 0.08;
}

/** How many floor looks there are. */
export const MIXED_LOOKS = FLOOR_WEAR_KINDS * VARIANTS;

/** The walk-off mat's ribbed charcoal-blue, its border; the post room's pale lino and its edge strip. */
export const MAT = 0x68747e;
const MAT_BORDER = 0x4a525a;
export const LINO = 0xaab0a2;
const LINO_EDGE = 0x868b80;
/** Concrete treads and the steel nosings. */
export const TREAD = 0x9a9b95;
const NOSING = 0xa3abb2;
const INSERT = 0x3d4247;
const RISER = 0x4a4f55;

/** A thin decal on the floor (`w` along x, `d` along z), a hair over the surface. */
function decal(
  b: ModelBuilder,
  w: number,
  d: number,
  color: number,
  x: number,
  z: number,
  y = 0.0012,
  turn = 0,
): void {
  b.box(w, 0.002, d, color, { at: [x, y, z], rot: [0, turn, 0] }, 0);
}

/**
 * A tile of the mixed floors (`look` from `mixedLook`): the ground
 * floor's studded rubber sheet and its wear, 3-1's carpet tiles upstairs,
 * the stairwell's treads.
 */
export function mixedFloorModel(look: number): Model {
  const variant = look % VARIANTS;
  const wear = Math.floor(look / VARIANTS) % FLOOR_WEAR_KINDS;
  if (wear >= FLOOR_WEAR.carpet && wear < FLOOR_WEAR.carpet + CARPET_WEAR_KINDS)
    return warmed(carpetFloorModel((wear - FLOOR_WEAR.carpet) * VARIANTS + variant));
  if (wear >= FLOOR_WEAR.stairX) {
    const k = wear - FLOOR_WEAR.stairX;
    return stairModel(Math.floor(k / STAIR_RAMP), k % STAIR_RAMP, variant);
  }
  return rubberModel(wear, variant);
}

/**
 * 3-1's carpet tiles from a warmer batch: the same tiles and wear, each
 * colour pulled from 3-1's cool blue-grey to a neutral warm grey (the
 * engineering floor glows warm against the rainy street).
 */
export const WARM_CARPET = 0x8c8782;
function warmed(m: Model): Model {
  const from = new THREE.Color(FLOOR_COLORS.corporateCarpet[0]);
  const to = new THREE.Color(WARM_CARPET);
  const k = [to.r / from.r, to.g / from.g, to.b / from.b] as const;
  for (const g of [m.body, m.glow, m.glass]) {
    const c = g?.getAttribute('color');
    if (!c) continue;
    for (let i = 0; i < c.count; i++)
      c.setXYZ(i, c.getX(i) * k[0], c.getY(i) * k[1], c.getZ(i) * k[2]);
  }
  return m;
}

/**
 * The ground floor's sheet rubber, grey-green: round studs in a grid, a
 * soft sheen across the tile (it's glossy), and its wear: the walk-off
 * mat, the pale lino, the trolley tracks and wet footprints, a wet patch.
 */
function rubberModel(wear: number, variant: number): Model {
  const [base] = FLOOR_COLORS.mixedFloors;
  const b = new ModelBuilder();
  if (wear >= FLOOR_WEAR.mat) return matModel(b, wear - FLOOR_WEAR.mat);
  if (wear >= FLOOR_WEAR.lino) return linoModel(b, wear - FLOOR_WEAR.lino, variant);
  b.box(1, 0.012, 1, base, { at: [0, -0.006, 0] }, 0);
  // Studs: a grid of low round studs, a shade lighter, their shadow side a shade darker.
  const stud = tint(base, 0.06);
  const shade = tint(base, -0.06);
  for (const x of [-0.375, -0.125, 0.125, 0.375])
    for (const z of [-0.375, -0.125, 0.125, 0.375]) {
      b.cylinder(0.05, 0.05, 0.004, shade, { at: [x + 0.008, 0.001, z + 0.01] }, 10);
      b.cylinder(0.045, 0.048, 0.006, stud, { at: [x, 0.003, z] }, 10);
    }
  // The sheen: a wide faint lighter band across the tile, where the room's light catches it.
  decal(b, 1.3, 0.16, tint(base, 0.035), 0.05 * (variant - 1), 0.1 * (variant - 1), 0.0008, 0.75);
  // A welded seam on one tile in three (the sheet's 2 m rolls).
  if (variant === 0) decal(b, 0.008, 1, tint(base, -0.1), -0.494, 0, 0.0009);
  // Wet: 8% darker over a darker lane, tracks and prints a further step down, a glossy sheen.
  const wet = tint(base, -0.16);
  const sheen = tint(base, 0.2);
  if (wear === FLOOR_WEAR.trackX || wear === FLOOR_WEAR.trackZ) {
    const along = wear === FLOOR_WEAR.trackX ? 0 : Math.PI / 2;
    tracks(b, along, 0.5, wet, sheen, variant);
  } else if (wear >= FLOOR_WEAR.trackTurn && wear < FLOOR_WEAR.trackTurn + 4) {
    // A turn: from the middle toward the side along x it comes from, and the side along z.
    const corner = wear - FLOOR_WEAR.trackTurn;
    const sx = corner % 2 ? 1 : -1;
    const sz = corner >= 2 ? 1 : -1;
    tracksHalf(b, 0, sx, wet, sheen);
    tracksHalf(b, Math.PI / 2, sz, wet, sheen);
  } else if (wear === FLOOR_WEAR.wet) {
    // A wet patch dripped in from the rain: soft darker lobes with a lighter glint.
    for (const [x, z, w, d, t] of [
      [-0.05, 0.02, 0.5, 0.34, 0.3],
      [0.12, -0.1, 0.3, 0.24, -0.4],
      [-0.2, 0.14, 0.22, 0.16, 0.1],
    ] as const)
      decal(b, w, d, tint(base, -0.08), x, z, 0.0018, t);
    decal(b, 0.18, 0.03, sheen, 0.02, -0.02, 0.0022, 0.6);
  }
  return b.build();
}

/** The wet lane the trolley drags in: the rubber 8% darker. */
const LANE = () => tint(FLOOR_COLORS.mixedFloors[0], -0.08);

/** Trolley wheel tracks and wet footprints across a tile along `along` (0 along x). */
function tracks(
  b: ModelBuilder,
  along: number,
  len: number,
  wet: number,
  sheen: number,
  variant: number,
): void {
  const g = framed(b, [0, 0, 0], [0, along, 0]);
  // A wet lane the trolley's dragged in, glossy: the wheel tracks in it, a sheen down one side.
  decal(g, len * 2, 0.46, LANE(), 0, 0, 0.0016);
  for (const s of [-1, 1]) decal(g, len * 2, 0.05, wet, 0, s * 0.17, 0.0024);
  decal(g, len * 2, 0.03, sheen, 0, -0.1, 0.0026);
  // Footprints, alternating, a stride apart, wet, between the tracks.
  for (let k = 0; k < 2; k++) {
    const x = -0.25 + k * 0.5 + (variant - 1) * 0.04;
    const z = k % 2 ? 0.06 : -0.06;
    decal(g, 0.14, 0.08, wet, x, z, 0.0026);
    decal(g, 0.05, 0.07, wet, x - 0.11, z, 0.0026);
    decal(g, 0.05, 0.016, sheen, x + 0.02, z - 0.02, 0.003);
  }
}

/** Half a track, from the tile's middle out to the side `s` (−1 or 1) along `along`. */
function tracksHalf(b: ModelBuilder, along: number, s: number, wet: number, sheen: number): void {
  const g = framed(b, [0, 0, 0], [0, along, 0]);
  decal(g, 0.73, 0.46, LANE(), s * 0.135, 0, 0.0016);
  for (const k of [-1, 1]) decal(g, 0.5 + 0.17, 0.05, wet, s * 0.165, k * 0.17, 0.0024);
  decal(g, 0.5, 0.03, sheen, s * 0.25, -0.1, 0.0026);
  decal(g, 0.14, 0.08, wet, s * 0.28, 0.05, 0.0026);
  decal(g, 0.05, 0.07, wet, s * 0.28 - s * 0.11, 0.05, 0.0026);
}

/** The bit for each side of a mat or lino tile's `edges`: back, front, left, right. */
const EDGE_SIDES: readonly [number, number, number][] = [
  [1, 0, -1],
  [2, 0, 1],
  [4, -1, 0],
  [8, 1, 0],
];

/** The walk-off mat inside the loading bay: ribbed charcoal-blue, a rubber border where it ends. */
function matModel(b: ModelBuilder, edges: number): Model {
  const [base] = FLOOR_COLORS.mixedFloors;
  b.box(1, 0.012, 1, base, { at: [0, -0.006, 0] }, 0);
  // The mat runs to the tile's edges where it carries on, stops 0.06 short where it ends.
  const inset = (bit: number) => (edges & bit ? 0.06 : 0);
  // Never wider than 0.9 of the tile across the bay.
  const x0 = -0.5 + Math.max(0.05, inset(4));
  const x1 = 0.5 - Math.max(0.05, inset(8));
  const z0 = -0.5 + inset(1);
  const z1 = 0.5 - inset(2);
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  b.box(x1 - x0, 0.014, z1 - z0, MAT, { at: [cx, 0.007, cz] }, 0);
  // Ribs across the walking direction (along z), lighter.
  for (let k = 0; k < 9; k++) {
    const x = x0 + 0.06 + k * ((x1 - x0 - 0.12) / 8);
    b.box(0.03, 0.003, z1 - z0 - 0.06, tint(MAT, 0.14), { at: [x, 0.0155, cz] }, 0);
  }
  for (const [bit, dx, dz] of EDGE_SIDES) {
    if (!(edges & bit)) continue;
    const along = dx === 0;
    b.box(
      along ? x1 - x0 : 0.04,
      0.016,
      along ? 0.04 : z1 - z0,
      MAT_BORDER,
      {
        at: [
          dx === 0 ? cx : dx < 0 ? x0 + 0.02 : x1 - 0.02,
          0.008,
          dz === 0 ? cz : dz < 0 ? z0 + 0.02 : z1 - 0.02,
        ],
      },
      0,
    );
  }
  return b.build();
}

/** The post room's pale lino in front of its hatch: mottled, an edge strip where it meets the rubber. */
function linoModel(b: ModelBuilder, edges: number, variant: number): Model {
  b.box(1, 0.012, 1, LINO, { at: [0, -0.006, 0] }, 0);
  for (let k = 0; k < 7; k++) {
    const h = tileHash(variant * 7 + k, 41);
    decal(
      b,
      0.08 + (h % 5) * 0.02,
      0.05 + ((h >> 3) % 4) * 0.02,
      tint(LINO, h % 2 ? 0.05 : -0.05),
      ((h % 83) / 83 - 0.5) * 0.8,
      (((h >> 7) % 79) / 79 - 0.5) * 0.8,
      0.0012,
      (h % 7) * 0.4,
    );
  }
  // Scuffs where the post trolley turns.
  decal(b, 0.3, 0.012, tint(LINO, -0.12), -0.05, 0.2, 0.0016, 0.3);
  decal(b, 0.2, 0.01, tint(LINO, -0.1), 0.12, 0.26, 0.0016, -0.2);
  for (const [bit, dx, dz] of EDGE_SIDES) {
    if (!(edges & bit)) continue;
    const along = dx === 0;
    decal(b, along ? 1 : 0.035, along ? 0.035 : 1, LINO_EDGE, dx * 0.4825, dz * 0.4825, 0.0018);
  }
  return b.build();
}

/** A tread's tone `t` of the way up the flight (0 the foot, 1 the top): darker below, lighter above. */
const toned = (t: number) => -0.2 + 0.28 * Math.max(0, Math.min(1, t));
const treadTone = (t: number) => tint(TREAD, toned(t));

/**
 * A stretch of the stairwell's flight (`kind` 0 along x, 1 along z, 2 a
 * landing; `step` how far up the flight, of `STAIR_RAMP`): concrete treads a
 * third of a tile deep, each a shade lighter than the one below it (the
 * flight ramps from dark at the foot to light at the top), each with its
 * dark riser line on its lower edge, a steel nosing and its anti-slip insert,
 * a painted strip down each side.
 */
function stairModel(kind: number, step: number, variant: number): Model {
  const b = new ModelBuilder();
  const at = (k: number) => (step + k / 3) / (STAIR_RAMP - 1 + 2 / 3);
  const base = treadTone(at(1));
  b.box(1, 0.012, 1, base, { at: [0, -0.006, 0] }, 0);
  if (kind === 2) {
    // The landing: plain concrete with a nosing round it and a few pores.
    for (const [x, z] of [
      [-0.2, 0.1],
      [0.25, -0.2],
      [0.05, 0.3],
    ] as const)
      decal(b, 0.03, 0.02, tint(base, -0.1), x, z);
    decal(b, 0.94, 0.04, NOSING, 0, 0.45, 0.0018);
    decal(b, 0.94, 0.014, RISER, 0, 0.485, 0.0016);
    return b.build();
  }
  // Up the flight is local +x: along x toward +x, along z toward −z (the turn maps +x there).
  const g = framed(b, [0, 0, 0], [0, kind === 0 ? 0 : Math.PI / 2, 0]);
  for (let k = 0; k < 3; k++) {
    const x = -0.5 + (k + 0.5) / 3;
    const t = at(k);
    const tone = tint(TREAD, toned(t) + ((k + variant) % 2 ? 0.012 : -0.012));
    decal(g, 1 / 3 - 0.004, 0.94, tone, x, 0, 0.0008);
    // The riser on the tread's lower edge, then the nosing just over it and its insert.
    const nx = x - 1 / 6;
    decal(g, 0.02, 0.96, RISER, nx + 0.01, 0, 0.0014);
    decal(g, 0.045, 0.94, NOSING, nx + 0.0425, 0, 0.0018);
    decal(g, 0.014, 0.86, INSERT, nx + 0.045, 0, 0.0024);
    // A shadow line under the next nosing, at the tread's back.
    decal(g, 0.012, 0.92, tint(tone, -0.12), x + 1 / 6 - 0.008, 0, 0.0012);
  }
  // The painted strips down both sides (where the walls meet the treads).
  for (const s of [-1, 1]) decal(g, 1, 0.05, tint(base, -0.18), 0, s * 0.475, 0.003);
  return b.build();
}

/** A floor number stencilled on the stairwell's concrete, readable from the front: FLOOR over a big digit. */
export function floorNumberModel(n: number): Model {
  const b = new ModelBuilder();
  const g = framed(b, [0, 0.004, 0], [-Math.PI / 2, 0, 0]);
  text(g, `${n}`, 0, 0.04, 0, 0.055, STENCIL, 0.002);
  text(g, 'FLOOR', 0, -0.31, 0, 0.014, STENCIL, 0.002);
  return b.build();
}

/** The first floor's slab edge on an outer wall's face (+z): a dark band at the floor's level. */
export function slabEdgeModel(): Model {
  const b = new ModelBuilder();
  b.box(1.02, 0.08, 0.05, SLAB_EDGE, { at: [0, -0.02, 0.525] }, 0);
  b.box(1.02, 0.008, 0.052, tint(SLAB_EDGE, 0.2), { at: [0, 0.024, 0.525] }, 0);
  return b.build();
}

// ---- The stairwell's painted block ----

/** The stairwell's paint: pale above, a blue-grey dado below with its darker band, a dark kick plinth. */
export const BLOCK_UPPER = 0xc0c3bd;
export const BLOCK_DADO = 0x8c949a;
const BLOCK_BAND = 0x52606b;
const BLOCK_KICK = 0x3a4147;
const COPING_EDGE = 0x959a9e;
const KICK_H = 0.07;
const DADO_H = 0.46;
const BAND_H = 0.04;
const COURSE = 0.2;
const BLOCK_W = 0.4;
const CAP = 0.05;
const LIP = 0.03;
const LIP_H = 0.045;

/**
 * The wall's top at `h`: the blocks themselves seen from above, painted, in
 * a staggered bond (joints every course across, every block length along,
 * each block a shade off the next), a slim cast lip band round it.
 */
function blockTop(b: ModelBuilder, h: number, paint: number, seed: number): void {
  const lip = 1 + LIP * 2;
  const bandY = h - 0.008 - LIP_H / 2;
  b.box(lip, LIP_H, lip, COPING_EDGE, { at: [0, bandY, 0] }, 0);
  b.box(lip - 0.004, 0.008, lip - 0.004, tint(COPING_EDGE, -0.5), {
    at: [0, bandY - LIP_H / 2 - 0.004, 0],
  });
  b.box(1, CAP, 1, paint, { at: [0, h - CAP / 2, 0] }, 0);
  const joint = tint(paint, -0.15);
  const rows = Math.round(1 / COURSE);
  for (let r = 0; r < rows; r++) {
    const z = -0.5 + (r + 0.5) * COURSE;
    if (r > 0) b.box(1, 0.002, 0.016, joint, { at: [0, h + 0.001, z - COURSE / 2] }, 0);
    const shift = r % 2 ? BLOCK_W / 2 : 0;
    for (let u = -0.5 + shift, i = 0; u < 0.5; u += BLOCK_W, i++) {
      if (u > -0.49) b.box(0.016, 0.002, COURSE, joint, { at: [u, h + 0.001, z] }, 0);
      const hh = tileHash(r + seed * 5, i + seed);
      const k = ((hh % 5) - 2) * 0.018;
      const x0 = Math.max(-0.5, u);
      const x1 = Math.min(0.5, u + BLOCK_W);
      if (k !== 0 && x1 - x0 > 0.05)
        b.box(x1 - x0 - 0.018, 0.0012, COURSE - 0.018, tint(paint, k), {
          at: [(x0 + x1) / 2, h + 0.0004, z],
        });
    }
  }
}

/** The block's coursing on a face from `y0` to `y1`: grooves every course, the joints staggered, blocks a shade off. */
function coursing(
  b: ModelBuilder,
  on: Face,
  y0: number,
  y1: number,
  paint: number,
  seed: number,
): void {
  const groove = tint(paint, -0.18);
  const courses = Math.max(1, Math.round((y1 - y0) / COURSE));
  const hh = (y1 - y0) / courses;
  for (let i = 0; i < courses; i++) {
    const c0 = y0 + i * hh;
    if (i > 0) b.box(1, 0.016, 0.004, groove, on(0, c0), 0);
    const shift = i % 2 ? BLOCK_W / 2 : 0;
    for (let u = -0.5 + shift, j = 0; u < 0.5; u += BLOCK_W, j++) {
      if (u > -0.49) b.box(0.016, hh - 0.016, 0.004, groove, on(u, c0 + hh / 2), 0);
      const h = tileHash(i + seed * 7, j + seed + 13);
      const k = ((h % 5) - 2) * 0.02;
      const x0 = Math.max(-0.5, u);
      const x1 = Math.min(0.5, u + BLOCK_W);
      if (k !== 0 && x1 - x0 > 0.05)
        b.box(x1 - x0 - 0.02, hh - 0.02, 0.003, tint(paint, k), on((x0 + x1) / 2, c0 + hh / 2), 0);
    }
  }
}

/**
 * A wall of the stairwell: painted concrete block, two-tone (pale above, a
 * mid blue-grey dado below with a darker band) on a dark kick plinth, the
 * coursing on every face and on its top, a slim cast lip round the top.
 * `look` adds boot scuffs on the dado or a patched block. The low front
 * wall is the dado and its plinth, coursed, its top in the dado's paint.
 */
export function blockWallModel(piece: WallPiece, look: number): Model {
  const b = new ModelBuilder();
  if (piece === 'wall-front') {
    const h = FRONT_WALL_HEIGHT;
    b.box(1, h - CAP, 1, BLOCK_DADO, { at: [0, (h - CAP) / 2, 0] }, 0);
    b.box(1.01, 0.05, 1.01, BLOCK_KICK, { at: [0, 0.025, 0] }, 0);
    for (const on of faces(0.502))
      b.box(
        0.014,
        h - CAP - 0.06,
        0.004,
        tint(BLOCK_DADO, -0.16),
        on(-0.3 + 0.4 * (look % 2), 0.05 + (h - CAP - 0.05) / 2),
        0,
      );
    blockTop(b, h, tint(BLOCK_DADO, 0.06), look + 3);
    return b.build();
  }
  const h = WALL_HEIGHT;
  const body = h - CAP;
  b.box(1, body, 1, BLOCK_UPPER, { at: [0, body / 2, 0] }, 0);
  b.box(1.006, DADO_H, 1.006, BLOCK_DADO, { at: [0, DADO_H / 2, 0] }, 0);
  b.box(1.01, BAND_H, 1.01, BLOCK_BAND, { at: [0, DADO_H - BAND_H / 2, 0] }, 0);
  b.box(1.014, KICK_H, 1.014, BLOCK_KICK, { at: [0, KICK_H / 2, 0] }, 0);
  faces(0.505).forEach((on, f) => {
    coursing(b, on, KICK_H, DADO_H - BAND_H, BLOCK_DADO, look * 4 + f);
    coursing(b, faces(0.501)[f] ?? on, DADO_H, body - 0.02, BLOCK_UPPER, look * 4 + f + 2);
    if (f !== 0) return;
    const mark = (w: number, hh: number, color: number, u: number, y: number, turn = 0) => {
      const p = on(u, y);
      b.box(w, hh, 0.006, color, { at: p.at, rot: [0, p.rot?.[1] ?? 0, turn] }, 0);
    };
    if (look === 1) {
      // Boot scuffs on the dado where people take the stairs two at a time.
      for (const [u, y, w, r] of [
        [-0.26, KICK_H + 0.06, 0.18, 0.05],
        [-0.06, KICK_H + 0.1, 0.1, -0.06],
        [0.24, KICK_H + 0.05, 0.14, 0.08],
      ] as const)
        mark(w, 0.014, tint(BLOCK_DADO, -0.22), u, y, r);
    } else if (look === 2) {
      // A block patched with fresh paint, two rawlplug holes where a sign hung.
      mark(BLOCK_W - 0.02, COURSE - 0.02, tint(BLOCK_UPPER, 0.06), 0.1, DADO_H + COURSE * 1.5);
      mark(0.014, 0.014, tint(BLOCK_UPPER, -0.45), -0.28, 0.84);
      mark(0.014, 0.014, tint(BLOCK_UPPER, -0.45), -0.14, 0.84);
    }
  });
  blockTop(b, h, tint(BLOCK_UPPER, -0.3), look);
  return b.build();
}

/** Every block-wall swap model, by its name in the plan's `swaps`. */
export const BLOCK_MODELS: Readonly<Record<string, () => Model>> = Object.fromEntries(
  (['wall', 'wall-front', 'wall-inner'] as const).flatMap((piece) =>
    Array.from({ length: BLOCK_LOOKS }, (_, look) => [
      blockSwap(piece, look),
      () => blockWallModel(piece, look),
    ]),
  ),
);

/**
 * The stairwell's safety-yellow handrail: along a low wall's top on a post
 * (`post`, every second tile), or on a full wall's front face on a bracket.
 * The rail runs the tile's whole length, so a run reads continuous.
 */
export function railModel(low: boolean, post = true): Model {
  const b = new ModelBuilder();
  const steel = 0x5c6873;
  if (low) {
    const y = FRONT_WALL_HEIGHT + 0.2;
    const z = -0.3;
    b.cylinder(0.022, 0.022, 1.004, RAIL_YELLOW, { at: [0, y, z], rot: [0, 0, Math.PI / 2] }, 10);
    b.box(1.004, 0.004, 0.01, tint(RAIL_YELLOW, 0.3), { at: [0, y + 0.02, z - 0.006] }, 0);
    if (post) {
      b.box(0.032, y - FRONT_WALL_HEIGHT, 0.032, tint(RAIL_YELLOW, -0.2), {
        at: [0, (y + FRONT_WALL_HEIGHT) / 2, z],
      });
      b.box(0.08, 0.014, 0.08, steel, { at: [0, FRONT_WALL_HEIGHT + 0.007, z] }, 0);
    }
    return b.build();
  }
  const y = 0.68;
  const z = 0.58;
  b.cylinder(0.022, 0.022, 1.004, RAIL_YELLOW, { at: [0, y, z], rot: [0, 0, Math.PI / 2] }, 10);
  b.box(1.004, 0.004, 0.01, tint(RAIL_YELLOW, 0.3), { at: [0, y + 0.02, z - 0.004] }, 0);
  if (post) {
    b.box(0.024, 0.06, 0.08, steel, { at: [0, y - 0.035, 0.54] }, 0.006);
    b.box(0.05, 0.05, 0.012, tint(steel, -0.25), { at: [0, y - 0.06, 0.508] }, 0);
  }
  return b.build();
}

// ---- The glass balustrade over the stairs ----

const BAL_FACE = WALL_COLORS.midRise.face;
const BAL_GLASS = 0xdbe7ee;
const BAL_TOP = 0.98;

/**
 * The first floor's front wall over the stairs as 3-1's glass partition, cut
 * down to a balustrade: plasterboard to the low wall's height on its
 * aluminium skirting, then clear glass in an aluminium shoe up to a slim
 * aluminium head track, a post at the tile's −x end; `look` adds a glint.
 */
export function balustradeModel(look: number): Model {
  const b = new ModelBuilder();
  const h = FRONT_WALL_HEIGHT;
  b.box(1, h, 1, BAL_FACE, { at: [0, h / 2, 0] }, 0);
  b.box(1.012, 0.05, 1.012, 0x8d949b, { at: [0, 0.025, 0] }, 0);
  b.box(1.0, 0.012, 1.0, GLASS_CORE, { at: [0, h + 0.006, 0] }, 0);
  const z = 0.18;
  b.box(1.0, 0.05, 0.08, ALU, { at: [0, h + 0.025, z] }, 0.006);
  b.pane(1.0, BAL_TOP - h - 0.05, 0.014, BAL_GLASS, {
    at: [0, (BAL_TOP + h + 0.05) / 2, z],
  });
  b.box(1.004, 0.035, 0.07, ALU, { at: [0, BAL_TOP, z] }, 0.006);
  b.box(1.004, 0.004, 0.02, tint(ALU, 0.25), { at: [0, BAL_TOP + 0.019, z] }, 0);
  b.box(0.03, BAL_TOP - h, 0.05, tint(ALU, -0.1), { at: [-0.485, (BAL_TOP + h) / 2, z] }, 0.004);
  if (look % 2)
    b.box(0.05, (BAL_TOP - h) * 0.7, 0.016, 0xa3b0b9, {
      at: [0.18, (BAL_TOP + h) / 2, z + 0.004],
      rot: [0, 0, 0.6],
    });
  return b.build();
}

/** Every balustrade swap model, by its name in the plan's `swaps`. */
export const BALUSTRADE_MODELS: Readonly<Record<string, () => Model>> = Object.fromEntries(
  Array.from({ length: BALUSTRADE_LOOKS }, (_, look) => [
    balustradeSwap(look),
    () => balustradeModel(look),
  ]),
);

// ---- The lift ----

/** The corner posts at the shell's ends. */
const JAMB_W = 0.08;

/**
 * One tile of the lift car's shell, the wall round its cabin, its run along
 * `axis`: brushed-steel cladding with panel seams on both faces, a handrail
 * on each face at hip height (only the inside one shows from the car), a
 * steel kick strip, and the lift's head plate on top. The car's doors are
 * the doorway's (`liftCars.ts`), not the wall's. `ends` (− 1, + 2) marks the
 * run's ends, where the panels stop on a darker corner post.
 */
export function liftFrameModel(axis: 'x' | 'z', ends: number): Model {
  const b = new ModelBuilder();
  const g = framed(b, [0, 0, 0], [0, axis === 'x' ? 0 : -Math.PI / 2, 0]);
  const minus = (ends & 1) !== 0;
  const plus = (ends & 2) !== 0;
  const h = WALL_HEIGHT - 0.04;
  // The core in steel, its panels, the head plate on top.
  g.box(1, h, 0.84, STEEL, { at: [0, h / 2, 0] }, 0);
  g.box(1.02, 0.04, 1.02, STEEL_EDGE, { at: [0, WALL_HEIGHT - 0.02, 0] }, 0);
  g.box(0.86, 0.012, 0.8, LIFT_TOP, { at: [0, WALL_HEIGHT + 0.004, 0] }, 0);
  for (const k of [-0.25, 0, 0.25])
    g.box(0.84, 0.002, 0.006, tint(LIFT_TOP, 0.1), { at: [0, WALL_HEIGHT + 0.011, k] }, 0);
  for (const s of [-1, 1]) {
    const z = s * 0.421;
    // Panel seams: the tile's two panels, brushed lines across.
    for (const u of [-0.5, 0]) g.box(0.014, h, 0.004, DOOR_SEAM, { at: [u + 0.25, h / 2, z] }, 0);
    for (const k of [0.25, 0.5, 0.75])
      g.box(0.98, 0.005, 0.003, tint(STEEL, 0.1), { at: [0, h * k, z] }, 0);
    // The handrail on its brackets, the kick strip.
    g.box(1, 0.035, 0.035, STEEL_DARK, { at: [0, 0.48, z + s * 0.05] }, 0.012);
    for (const u of [-0.3, 0.3])
      g.box(0.025, 0.025, 0.05, STEEL_DARK, { at: [u, 0.48, z + s * 0.025] }, 0);
    g.box(1, 0.1, 0.01, STEEL_EDGE, { at: [0, 0.05, z + s * 0.004] }, 0);
  }
  for (const [on, u] of [
    [minus, -0.5 + JAMB_W / 2],
    [plus, 0.5 - JAMB_W / 2],
  ] as const)
    if (on) g.box(JAMB_W, h, 0.88, STEEL_DARK, { at: [u, h / 2, 0] }, 0.01);
  return b.build();
}

export const LIFT_MODELS: Readonly<Record<string, () => Model>> = Object.fromEntries(
  [0, 1, 2, 3].flatMap((floor) =>
    (['x', 'z'] as const).flatMap((axis) =>
      [0, 1, 2, 3].map((ends) => [liftSwap(floor, axis, ends), () => liftFrameModel(axis, ends)]),
    ),
  ),
);

/** The welcome banner: the wire over the shaft between its posts, the banner, the balloons. */
export function bannerModel(banner: Banner): Model {
  const b = new ModelBuilder();
  const half = (banner.x1 - banner.x0) / 2;
  const y = banner.y;
  const sag = 0.08;
  const wire = 0x8a9096;
  // The wire, sagging, in a few straight bits.
  const steps = 8;
  const at = (t: number): [number, number] => [-half + 2 * half * t, y - sag * 4 * t * (1 - t)];
  for (let k = 0; k < steps; k++) {
    const [ax, ay] = at(k / steps);
    const [bx, by] = at((k + 1) / steps);
    b.box(
      Math.hypot(bx - ax, by - ay) + 0.002,
      0.008,
      0.008,
      wire,
      {
        at: [(ax + bx) / 2, (ay + by) / 2, 0],
        rot: [0, 0, Math.atan2(by - ay, bx - ax)],
      },
      0,
    );
  }
  // The posts it's tied to, clamped to the wall tops.
  for (const s of [-1, 1]) {
    const x = s * half;
    b.box(
      0.03,
      y + 0.04 - WALL_HEIGHT,
      0.03,
      STEEL_DARK,
      { at: [x, (y + 0.04 + WALL_HEIGHT) / 2, 0] },
      0.006,
    );
    b.box(0.08, 0.03, 0.08, STEEL_DARK, { at: [x, WALL_HEIGHT + 0.03, 0] }, 0.006);
  }
  // The banner, hung from the wire by its corners and middle: violet, white letters.
  const bw = Math.min(2.4, half * 2 - 0.5);
  const bh = 0.28;
  const top = y - sag * 0.9;
  b.box(bw, bh, 0.012, YOTTA_VIOLET, { at: [0, top - bh / 2, 0] }, 0);
  b.box(bw, 0.014, 0.016, tint(YOTTA_VIOLET, 0.3), { at: [0, top - 0.007, 0] }, 0);
  b.box(bw, 0.014, 0.016, tint(YOTTA_VIOLET, -0.25), { at: [0, top - bh + 0.007, 0] }, 0);
  const px = Math.min(0.032, (bw - 0.16) / 63);
  text(b, 'WELCOME TO YOTTA', 0, top - bh / 2, 0.007, px, 0xf6f2ff, 0.003);
  for (const u of [-bw / 2 + 0.04, 0, bw / 2 - 0.04]) {
    const [, wy] = at((u + half) / (2 * half));
    b.box(0.006, wy - top + 0.004, 0.006, wire, { at: [u, (wy + top) / 2, 0] }, 0);
  }
  // Balloons tied to the posts: two at one end, one at the other.
  for (const [s, dx, dy, color] of [
    [-1, -0.04, 0.42, YOTTA_VIOLET],
    [-1, 0.12, 0.33, 0xeeeaf6],
    [1, 0.02, 0.38, YOTTA_VIOLET],
  ] as const) {
    const x = s * half;
    const bx = x + dx;
    const by = y + 0.04 + dy;
    b.sphere(0.1, color, { at: [bx, by, 0] }, [1, 1.18, 1]);
    b.cone(0.022, 0.03, tint(color, -0.2), { at: [bx, by - 0.125, 0], rot: [Math.PI, 0, 0] }, 8);
    const len = Math.hypot(dx, dy - 0.13);
    b.box(
      0.004,
      len,
      0.004,
      0xd8d8d8,
      {
        at: [(x + bx) / 2, (y + 0.04 + by - 0.13) / 2, 0],
        rot: [0, 0, -Math.atan2(dx, dy - 0.13)],
      },
      0,
    );
  }
  return b.build();
}

// ---- The post room's hatch and the loading bay ----

/**
 * The post room's pass-through round the inbox (`span` tiles wide), the
 * post room toward −z: on each side a tall column of pigeonholes (dark
 * cubbies, letters and parcels in some) in a light-oak carcass, a row of
 * them over the opening as its bulkhead, a white POST plaque on top facing
 * the room.
 */
export function postHatchModel(span: number): Model {
  const b = new ModelBuilder();
  const half = span / 2;
  const z = -0.42;
  const oak = 0x9e8460;
  const cubby = 0x2e3036;
  const colW = 0.2;
  const bulk0 = 0.86;
  const cell = (x: number, y: number, w: number, h: number, k: number) => {
    b.box(w - 0.02, h - 0.02, 0.012, cubby, { at: [x, y, z + 0.075] }, 0);
    const hash = tileHash(k, 71);
    if (hash % 3 !== 0) {
      const c = [0xf2f2ee, 0xe6e2d4, 0xc8a878, 0xf2f2ee][hash % 4] ?? PAPER;
      const hh = hash % 3 === 1 ? h * 0.35 : h * 0.55;
      b.box(w - 0.05, hh, 0.02, c, { at: [x, y - h / 2 + 0.02 + hh / 2, z + 0.08] }, 0);
    }
  };
  // The side columns, floor to wall top.
  for (const s of [-1, 1]) {
    const x = s * (half - colW / 2);
    b.box(colW, WALL_HEIGHT, 0.16, oak, { at: [x, WALL_HEIGHT / 2, z] }, 0.008);
    const rows = 6;
    for (let r = 0; r < rows; r++) {
      const y0 = 0.1 + (r * (WALL_HEIGHT - 0.16)) / rows;
      const hh = (WALL_HEIGHT - 0.16) / rows;
      cell(x, y0 + hh / 2, colW - 0.03, hh, r + (s > 0 ? 10 : 0));
    }
  }
  // The bulkhead of pigeonholes over the opening.
  const inner = span - colW * 2;
  b.box(inner, WALL_HEIGHT - bulk0, 0.16, oak, { at: [0, (WALL_HEIGHT + bulk0) / 2, z] }, 0.008);
  const cols = Math.max(3, Math.round(inner / 0.2));
  const cw = inner / cols;
  for (let c = 0; c < cols; c++)
    cell(
      -inner / 2 + cw * (c + 0.5),
      (WALL_HEIGHT + bulk0) / 2,
      cw,
      WALL_HEIGHT - bulk0 - 0.04,
      30 + c,
    );
  b.box(span + 0.02, 0.03, 0.18, tint(oak, -0.2), { at: [0, WALL_HEIGHT - 0.015, z] }, 0);
  // A label rail under the bulkhead, and the POST plaque on top.
  b.box(inner, 0.03, 0.02, 0xd8dad6, { at: [0, bulk0 + 0.015, z + 0.085] }, 0);
  const py = WALL_HEIGHT + 0.08;
  b.box(0.44, 0.15, 0.03, 0x2e3440, { at: [0, py, z + 0.04] }, 0.008);
  b.box(0.4, 0.11, 0.004, 0xf0efe8, { at: [0, py, z + 0.057] }, 0);
  text(b, 'POST', 0, py, z + 0.059, 0.016, INK, 0.003);
  for (const s of [-1, 1])
    b.box(0.02, 0.05, 0.02, STEEL_DARK, { at: [s * 0.15, WALL_HEIGHT + 0.0, z + 0.04] }, 0);
  return b.build();
}

/**
 * The loading bay round the ship hatch (`span` tiles wide), the street
 * toward −z: its roller shutter rolled up into a steel drum housing over
 * the opening, steel guide channels at the sides with yellow-black hazard
 * striping, black rubber dock bumpers low on the outside, a strip curtain
 * of clear PVC hanging in the opening, a checker-plate dock leveller at the
 * threshold, LOADING BAY on the housing.
 */
export function loadingBayModel(span: number): Model {
  const b = new ModelBuilder();
  const half = span / 2;
  const z = -0.44;
  const top = WALL_HEIGHT + 0.08;
  // The guide channels and their hazard striping.
  for (const s of [-1, 1]) {
    const x = s * (half - 0.05);
    b.box(0.1, top, 0.14, STEEL_DARK, { at: [x, top / 2, z] }, 0.008);
    for (let k = 0; k < 5; k++)
      b.box(
        0.104,
        0.07,
        0.02,
        k % 2 ? HAZARD_BLACK : HAZARD,
        {
          at: [x, 0.08 + k * 0.1, z + 0.07],
          rot: [0, 0, 0.0],
        },
        0,
      );
    // The dock bumpers, low on the outside.
    b.box(0.12, 0.22, 0.1, 0x1e2024, { at: [s * (half - 0.12), 0.16, -0.54] }, 0.02);
  }
  // The drum housing over the opening, the rolled-up shutter's slats showing under it.
  const hz = z + 0.02;
  b.box(span, 0.2, 0.24, 0x8b939a, { at: [0, top - 0.1, hz] }, 0.02);
  b.box(span - 0.2, 0.05, 0.2, 0x6c747b, { at: [0, top - 0.225, hz] }, 0.01);
  for (let k = 0; k < 3; k++)
    b.box(
      span - 0.22,
      0.008,
      0.002,
      tint(0x8b939a, -0.2),
      { at: [0, top - 0.04 - k * 0.05, hz + 0.121] },
      0,
    );
  // Its yellow-black header stripe along the front, LOADING BAY over it.
  const stripes = Math.round((span - 0.2) / 0.1);
  for (let k = 0; k < stripes; k++)
    b.box(
      0.1,
      0.04,
      0.012,
      k % 2 ? HAZARD_BLACK : HAZARD,
      {
        at: [-half + 0.15 + k * 0.1, top - 0.17, hz + 0.122],
      },
      0,
    );
  text(b, 'LOADING BAY', 0, top - 0.075, hz + 0.122, 0.013, 0x23262b, 0.003);
  // The strip curtain: overlapping clear PVC strips from the housing's foot down to the floor.
  const strips = Math.round((span - 0.2) / 0.11);
  for (let k = 0; k < strips; k++) {
    const x = -half + 0.1 + (k + 0.5) * ((span - 0.2) / strips);
    const h = top - 0.25 - 0.04;
    b.pane(0.1, h, 0.006, 0xb4cac8, {
      at: [x, 0.04 + h / 2, z + 0.01 + (k % 2) * 0.008],
      rot: [0, 0, ((k % 3) - 1) * 0.01],
    });
  }
  // The dock leveller at the threshold: checker plate.
  b.box(span - 0.2, 0.01, 0.12, 0x7a8188, { at: [0, 0.005, -0.44] }, 0);
  for (let k = 0; k < 10; k++)
    b.box(
      0.03,
      0.004,
      0.012,
      tint(0x7a8188, 0.15),
      {
        at: [-half + 0.2 + k * ((span - 0.4) / 9), 0.012, -0.44 + (k % 2 ? 0.03 : -0.03)],
        rot: [0, 0.8, 0],
      },
      0,
    );
  return b.build();
}

// ---- The mail chute ----

/** The hatch's steel top: darker than every station's top. */
export const HATCH_TOP = 0x6f777e;

/**
 * A mail chute hatch (the counter tile): a steel cabinet in the wall line,
 * a hinged steel flap in a raised frame on top, MAIL stamped on the flap's
 * front edge. Nothing tall: `Mechanics` draws the blinking arrow over it.
 */
export function chuteHatchCounter(): StationModel {
  const b = new ModelBuilder();
  const h = STATION_HEIGHT;
  b.box(0.96, h - 0.04, 0.96, STEEL_DARK, { at: [0, (h - 0.04) / 2, 0] }, 0.01);
  b.box(1.0, 0.05, 1.0, HATCH_TOP, { at: [0, h - 0.025, 0] }, 0.01);
  for (const on of faces(0.482))
    for (const u of [-0.24, 0, 0.24])
      b.box(0.008, h - 0.12, 0.004, tint(STEEL_DARK, 0.18), on(u, (h - 0.04) / 2), 0);
  // The flap's raised frame, the flap, its hinge along the back, its handle at the front.
  b.box(0.7, 0.025, 0.7, STEEL_EDGE, { at: [0, h + 0.012, -0.04] }, 0.006);
  b.box(0.62, 0.012, 0.62, STEEL, { at: [0, h + 0.03, -0.04] }, 0.004);
  b.cylinder(
    0.018,
    0.018,
    0.62,
    STEEL_EDGE,
    { at: [0, h + 0.035, -0.36], rot: [0, 0, Math.PI / 2] },
    8,
  );
  b.box(0.2, 0.02, 0.03, STEEL_EDGE, { at: [0, h + 0.045, 0.24] }, 0.006);
  const g = framed(b, [0, h + 0.037, 0.13], [-Math.PI / 2, 0, 0]);
  text(g, 'MAIL', 0, 0, 0, 0.022, INK, 0.003);
  return { base: b.build(), hero: null, heroAt: [0, 0] };
}

/**
 * The chute's face over the shaft (the model's +z): a steel duct from the
 * hatch down past the slab, with an enamel MAIL plate and a down arrow.
 */
export function chuteFaceModel(top: boolean): Model {
  const b = new ModelBuilder();
  const z = 0.5;
  const d = 0.12;
  const y0 = -0.42;
  const y1 = STATION_HEIGHT - 0.02;
  b.box(0.34, y1 - y0, d, STEEL, { at: [0, (y1 + y0) / 2, z + d / 2] }, 0.01);
  for (const y of [y0 + 0.12, 0.05, y1 - 0.06])
    b.box(0.36, 0.025, d + 0.02, STEEL_DARK, { at: [0, y, z + d / 2] }, 0.006);
  const py = 0.28;
  b.box(0.26, 0.16, 0.008, 0xf0efe8, { at: [0, py, z + d + 0.004] }, 0);
  b.box(0.26, 0.04, 0.009, top ? 0x2f5e9e : 0xc0302a, { at: [0, py + 0.06, z + d + 0.005] }, 0);
  text(b, 'MAIL', 0, py - 0.02, z + d + 0.008, 0.012, INK, 0.003);
  b.cone(0.05, 0.07, 0xd8b42a, { at: [0, 0.12, z + d + 0.01], rot: [Math.PI, 0, 0] }, 3);
  return b.build();
}

// ---- What hangs on the walls ----

/** `text` with its left edge at `left` (not centred). */
function leftText(
  b: ModelBuilder,
  s: string,
  left: number,
  y: number,
  z: number,
  px: number,
  color: number,
): void {
  text(b, s, left + ((s.length * 4 - 1) * px) / 2, y, z, px, color);
}

/** A checkbox at (x, y) on the face at z, ticked or not. */
function checkbox(b: ModelBuilder, x: number, y: number, z: number, ticked: boolean): void {
  const s = 0.04;
  b.box(s, s, 0.002, INK, { at: [x, y, z] }, 0);
  b.box(s - 0.012, s - 0.012, 0.002, 0xffffff, { at: [x, y, z + 0.001] }, 0);
  if (!ticked) return;
  b.box(
    0.012,
    0.024,
    0.002,
    0x2a8a4a,
    { at: [x - 0.008, y - 0.004, z + 0.002], rot: [0, 0, 0.7] },
    0,
  );
  b.box(
    0.012,
    0.046,
    0.002,
    0x2a8a4a,
    { at: [x + 0.01, y + 0.008, z + 0.002], rot: [0, 0, -0.5] },
    0,
  );
}

/**
 * Things hung on the walls (all in front of z = 0.5, built facing +z), by
 * name, each within its `LOWER_ART_HALF` of the spot.
 */
export const LOWER_WALL_ART: Readonly<Record<string, () => Model>> = {
  checklist: () => {
    // The plan, laminated, clipped to a little aluminium noticeboard standing on the low back
    // wall, leaning back: DAY 1 on a violet header, the ticks (laptop yes, desk no, chair no),
    // then the plan itself: 1. BUILD IT, 2. ???, 3. PROFIT.
    const root = new ModelBuilder();
    const w = 0.6;
    const h = 0.7;
    const lean = -0.16;
    const b = framed(root, [0, FRONT_WALL_HEIGHT, 0.02], [lean, 0, 0]);
    const cy = h / 2 + 0.05;
    const z = 0;
    b.box(w + 0.05, h + 0.05, 0.03, ALU, { at: [0, cy, z - 0.015] }, 0.008);
    b.box(w + 0.01, h + 0.01, 0.004, 0x9a7a58, { at: [0, cy, z + 0.001] }, 0);
    b.box(w - 0.02, h - 0.02, 0.004, 0xf6f6f2, { at: [0, cy, z + 0.004] }, 0);
    const f = z + 0.006;
    b.box(w - 0.02, 0.12, 0.002, YOTTA_VIOLET, { at: [0, cy + h / 2 - 0.07, f] }, 0);
    text(b, 'DAY 1', 0, cy + h / 2 - 0.07, f + 0.001, 0.016, 0xffffff);
    const lx = -w / 2 + 0.08;
    const row = (k: number) => cy + h / 2 - 0.19 - k * 0.08;
    for (const [k, label, ticked] of [
      [0, 'LAPTOP', true],
      [1, 'DESK', false],
      [2, 'CHAIR', false],
    ] as const) {
      checkbox(b, lx, row(k), f, ticked);
      leftText(b, label, lx + 0.045, row(k), f, 0.0095, INK);
    }
    b.box(w - 0.12, 0.006, 0.002, 0x9aa0a6, { at: [0, row(2) - 0.048, f] }, 0);
    for (const [k, label, color] of [
      [3.1, '1. BUILD IT', INK],
      [4.1, '2. ???', MARKER_RED],
      [5.1, '3. PROFIT', INK],
    ] as const)
      leftText(b, label, lx - 0.03, row(k), f, 0.0095, color);
    // The bulldog clip on top.
    b.box(0.1, 0.05, 0.03, 0x2a2d33, { at: [0, cy + h / 2 + 0.005, f + 0.01] }, 0.006);
    // Its back strut down to the wall top.
    root.box(
      0.02,
      0.5,
      0.02,
      ALU,
      { at: [0, FRONT_WALL_HEIGHT + 0.24, -0.1], rot: [0.32, 0, 0] },
      0.004,
    );
    return root.build();
  },
  newStarters: () => {
    // NEW STARTERS THIS WAY on a sign standing on the low back wall on two posts: a violet band,
    // an arrow up (the lift, the first floor).
    const b = new ModelBuilder();
    const z = 0.02;
    const cy = FRONT_WALL_HEIGHT + 0.42;
    for (const s of [-1, 1]) {
      b.box(
        0.025,
        cy - FRONT_WALL_HEIGHT,
        0.025,
        STEEL_DARK,
        {
          at: [s * 0.32, (cy + FRONT_WALL_HEIGHT) / 2, z - 0.02],
        },
        0.004,
      );
      b.box(
        0.08,
        0.02,
        0.08,
        STEEL_DARK,
        { at: [s * 0.32, FRONT_WALL_HEIGHT + 0.01, z - 0.02] },
        0,
      );
    }
    b.box(0.8, 0.26, 0.02, 0xf4f4f0, { at: [0, cy, z] }, 0.006);
    b.box(0.78, 0.11, 0.003, YOTTA_VIOLET, { at: [0, cy + 0.055, z + 0.011] }, 0);
    text(b, 'NEW STARTERS', -0.06, cy + 0.055, z + 0.013, 0.012, 0xffffff);
    text(b, 'THIS WAY', -0.06, cy - 0.06, z + 0.011, 0.012, INK);
    b.box(0.04, 0.1, 0.003, YOTTA_VIOLET, { at: [0.32, cy - 0.045, z + 0.012] }, 0);
    b.add(new THREE.ConeGeometry(0.055, 0.07, 3), YOTTA_VIOLET, {
      at: [0.32, cy + 0.035, z + 0.013],
    });
    return b.build();
  },
  desksTuesday: () => {
    // An A4 sheet taped to the glass: DESKS ARRIVING TUESDAY, TUESDAY struck out in red marker,
    // SOON? scrawled under it.
    const b = new ModelBuilder();
    const z = 0.508;
    const cy = 0.82;
    const g = framed(b, [0, cy, z], [0, 0, -0.05]);
    g.box(0.46, 0.34, 0.003, PAPER, { at: [0, 0, 0.0015] }, 0);
    text(g, 'DESKS', 0, 0.11, 0.003, 0.011, INK);
    text(g, 'ARRIVING', 0, 0.045, 0.003, 0.011, INK);
    text(g, 'TUESDAY', 0, -0.02, 0.003, 0.011, INK);
    g.box(0.34, 0.016, 0.002, MARKER_RED, { at: [0, -0.02, 0.006], rot: [0, 0, 0.06] }, 0);
    text(g, 'SOON?', 0.04, -0.105, 0.003, 0.012, MARKER_RED);
    g.box(0.08, 0.03, 0.002, 0xe8e2c8, { at: [0, 0.17, 0.004] }, 0);
    return b.build();
  },
  clock: MID_RISE_WALL_ART.clock ?? (() => new ModelBuilder().build()),
  fireExit: () => fireExitSign(),
  directory0: () => directory(0),
  directory1: () => directory(1),
  stencil1: () => stencil('1'),
  yotta: MID_RISE_WALL_ART.yottaSmall ?? (() => new ModelBuilder().build()),
};

/** A big green FIRE EXIT sign on the stairwell's block: the running figure, the door, an arrow up the flight. */
function fireExitSign(): Model {
  const b = new ModelBuilder();
  const z = 0.506;
  const cy = 0.86;
  const green = 0x2a9a5a;
  const white = 0xf2f4f0;
  b.box(0.44, 0.2, 0.016, green, { at: [0, cy, z + 0.008] }, 0.006);
  b.box(0.4, 0.16, 0.002, tint(green, 0.08), { at: [0, cy, z + 0.017] }, 0);
  const f = z + 0.019;
  // The door.
  b.box(0.05, 0.12, 0.002, white, { at: [-0.15, cy, f] }, 0);
  b.box(0.034, 0.104, 0.002, green, { at: [-0.15, cy, f + 0.001] }, 0);
  // The running figure.
  b.sphere(0.014, white, { at: [-0.07, cy + 0.045, f] });
  b.box(0.022, 0.05, 0.002, white, { at: [-0.075, cy + 0.008, f], rot: [0, 0, 0.4] }, 0);
  b.box(0.012, 0.045, 0.002, white, { at: [-0.095, cy - 0.035, f], rot: [0, 0, -0.6] }, 0);
  b.box(0.012, 0.045, 0.002, white, { at: [-0.055, cy - 0.032, f], rot: [0, 0, 0.7] }, 0);
  b.box(0.04, 0.01, 0.002, white, { at: [-0.06, cy + 0.02, f], rot: [0, 0, -0.3] }, 0);
  // The arrow, right and up the flight.
  b.box(0.12, 0.024, 0.002, white, { at: [0.08, cy, f] }, 0);
  b.add(new THREE.ConeGeometry(0.035, 0.05, 3), white, {
    at: [0.16, cy, f],
    rot: [0, 0, -Math.PI / 2],
  });
  return b.build();
}

/** The floor directory beside a lift: both floors, the one you're on marked violet. */
function directory(here: number): Model {
  const b = new ModelBuilder();
  const z = 0.506;
  const cy = 0.8;
  b.box(0.56, 0.36, 0.02, STEEL_DARK, { at: [0, cy, z + 0.01] }, 0.006);
  b.box(0.52, 0.32, 0.004, 0x2a2f36, { at: [0, cy, z + 0.021] }, 0);
  const f = z + 0.023;
  text(b, 'DIRECTORY', 0, cy + 0.12, f, 0.007, 0xb8c0c8);
  for (const [k, n, label] of [
    [0, '1', 'ENGINEERING'],
    [1, '0', 'POST ROOM'],
    [2, '0', 'LOADING BAY'],
  ] as const) {
    const y = cy + 0.045 - k * 0.075;
    const mine = Number(n) === here;
    if (mine) b.box(0.5, 0.06, 0.002, YOTTA_VIOLET, { at: [0, y, f] }, 0);
    leftText(b, n, -0.23, y, f + 0.001, 0.0085, mine ? 0xffffff : DIGIT);
    leftText(b, label, -0.17, y, f + 0.001, 0.0075, mine ? 0xffffff : 0xdfe3e8);
  }
  return b.build();
}
const DIGIT = 0xffc070;

/** A floor number stencilled big on the stairwell's block, with a small FLOOR over it. */
function stencil(n: string): Model {
  const b = new ModelBuilder();
  const z = 0.506;
  const paint = 0x2f3d4a;
  text(b, 'FLOOR', 0, 1.0, z, 0.014, paint, 0.002);
  text(b, n, 0, 0.72, z, 0.07, paint, 0.002);
  return b.build();
}

/** Within each art's half: re-exported for the tests. */
export const ART_HALF = LOWER_ART_HALF;
