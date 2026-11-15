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
  blockSwap,
  liftSwap,
} from '../rooms/lowerFloorsRoom';
import { CARPET_WEAR_KINDS } from '../rooms/midRiseRoom';
import type { StationModel } from '../stationModels';
import { framed, text } from './basement';
import { ALU, MID_RISE_WALL_ART, YOTTA_VIOLET, carpetFloorModel } from './midRise';

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

/** A glowing box (a lit display, an LED), in the glow layer. */
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

/** Brushed stainless: the lift's doors and frames, the chute. */
export const STEEL = 0xa3abb2;
const STEEL_DARK = 0x737b83;
const STEEL_EDGE = 0x5a6168;
/** The midRise partitions' plasterboard, for the lift frame's bulkhead. */
const PLASTER = WALL_COLORS.midRise.face;
const INK = 0x2a2d33;
const PAPER = 0xe8e8e2;
const MARKER_RED = 0xc0302a;
/** Safety yellow and black, dulled a touch so it never outshines a station. */
const HAZARD = 0xd8b42a;
const HAZARD_BLACK = 0x2a2c30;
/** The lit floor indicator's amber. */
const INDICATOR = 0xffb040;

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
export const MAT = 0x4c5661;
const MAT_BORDER = 0x3c434b;
export const LINO = 0xaab0a2;
const LINO_EDGE = 0x868b80;
/** Concrete treads and the steel nosings. */
export const TREAD = 0x9a9b95;
const NOSING = 0xb2b8bd;
const INSERT = 0x3d4247;

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
  if (wear >= FLOOR_WEAR.stairX) return stairModel(wear - FLOOR_WEAR.stairX, variant);
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
  const wet = tint(base, -0.13);
  const sheen = tint(base, 0.1);
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
  for (const s of [-1, 1]) decal(g, len * 2, 0.022, wet, 0, s * 0.17, 0.0024);
  decal(g, len * 2, 0.008, sheen, 0, -0.165, 0.0026);
  // Footprints, alternating, a stride apart, wet and faint, between the tracks.
  for (let k = 0; k < 2; k++) {
    const x = -0.25 + k * 0.5 + (variant - 1) * 0.04;
    const z = k % 2 ? 0.05 : -0.05;
    decal(g, 0.11, 0.06, wet, x, z, 0.0026);
    decal(g, 0.04, 0.05, wet, x - 0.085, z, 0.0026);
  }
}

/** Half a track, from the tile's middle out to the side `s` (−1 or 1) along `along`. */
function tracksHalf(b: ModelBuilder, along: number, s: number, wet: number, sheen: number): void {
  const g = framed(b, [0, 0, 0], [0, along, 0]);
  for (const k of [-1, 1])
    decal(g, 0.5 + 0.17, 0.022, wet, s * 0.165 + s * k * 0.0, k * 0.17, 0.0024);
  decal(g, 0.5, 0.008, sheen, s * 0.25, -0.165, 0.0026);
  decal(g, 0.11, 0.06, wet, s * 0.28, 0.04, 0.0026);
  decal(g, 0.04, 0.05, wet, s * 0.28 - s * 0.085, 0.04, 0.0026);
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
  const x0 = -0.5 + inset(4);
  const x1 = 0.5 - inset(8);
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

/**
 * A stretch of the stairwell's flight (`kind` 0 along x, 1 along z, 2 a
 * landing): concrete treads a third of a tile deep, each with a steel
 * nosing and its dark anti-slip insert across the walking direction and
 * the riser's shadow behind it, a painted strip down each side.
 */
function stairModel(kind: number, variant: number): Model {
  const b = new ModelBuilder();
  b.box(1, 0.012, 1, TREAD, { at: [0, -0.006, 0] }, 0);
  if (kind === 2) {
    // The landing: plain concrete with a nosing round it and a few pores.
    for (const [x, z] of [
      [-0.2, 0.1],
      [0.25, -0.2],
      [0.05, 0.3],
    ] as const)
      decal(b, 0.03, 0.02, tint(TREAD, -0.1), x, z);
    decal(b, 0.9, 0.03, tint(TREAD, 0.08), 0, 0.42, 0.0018);
    return b.build();
  }
  const g = framed(b, [0, 0, 0], [0, kind === 0 ? 0 : Math.PI / 2, 0]);
  // Three treads a tile, the nosings along z (across the flight running along x).
  for (let k = 0; k < 3; k++) {
    const x = -0.5 + (k + 0.5) / 3;
    const tone = tint(TREAD, (k + variant) % 2 ? 0.025 : -0.02);
    decal(g, 1 / 3 - 0.01, 0.9, tone, x, 0, 0.0008);
    // The riser's shadow behind each nosing, then the nosing and its insert.
    const nx = x - 1 / 6;
    decal(g, 0.045, 0.92, tint(TREAD, -0.28), nx + 0.05, 0, 0.0012);
    decal(g, 0.04, 0.94, NOSING, nx + 0.02, 0, 0.0018);
    decal(g, 0.014, 0.88, INSERT, nx + 0.02, 0, 0.0024);
  }
  // The painted strips down both sides (where the walls meet the treads).
  for (const s of [-1, 1]) decal(g, 1, 0.05, tint(TREAD, -0.18), 0, s * 0.475, 0.003);
  return b.build();
}

// ---- The stairwell's painted block ----

/** The stairwell's paint: pale above, a blue-grey dado below with its darker band, a dark kick plinth. */
export const BLOCK_UPPER = 0xc0c3bd;
export const BLOCK_DADO = 0x7d8b95;
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

/** Cast-concrete coping on a wall `h` tall: its slab, a lip band proud of the faces, a joint. */
function coping(b: ModelBuilder, h: number): void {
  const { top } = WALL_COLORS.lowerFloors;
  const lip = 1 + LIP * 2;
  const bandY = h - 0.008 - LIP_H / 2;
  b.box(lip, LIP_H, lip, COPING_EDGE, { at: [0, bandY, 0] }, 0);
  b.box(lip - 0.004, 0.008, lip - 0.004, tint(COPING_EDGE, -0.5), {
    at: [0, bandY - LIP_H / 2 - 0.004, 0],
  });
  b.box(1, CAP, 1, top, { at: [0, h - CAP / 2, 0] }, 0);
  b.box(0.008, 0.002, 1, tint(top, -0.2), { at: [-0.496, h + 0.001, 0] }, 0);
}

/** The block's coursing on a face from `y0` to `y1`: grooves every course, the joints staggered. */
function coursing(
  b: ModelBuilder,
  on: Face,
  y0: number,
  y1: number,
  paint: number,
  seed: number,
): void {
  const groove = tint(paint, -0.24);
  const courses = Math.max(1, Math.round((y1 - y0) / COURSE));
  const hh = (y1 - y0) / courses;
  for (let i = 0; i < courses; i++) {
    const c0 = y0 + i * hh;
    if (i > 0) b.box(1, 0.007, 0.004, groove, on(0, c0), 0);
    const shift = i % 2 ? BLOCK_W / 2 : 0;
    for (let u = -0.5 + shift; u < 0.5; u += BLOCK_W)
      if (u > -0.49) b.box(0.007, hh - 0.007, 0.004, groove, on(u, c0 + hh / 2), 0);
    const h = tileHash(i + seed * 7, seed + 13);
    if (h % 5 === 0) {
      const u = -0.5 + shift + BLOCK_W / 2 + BLOCK_W * ((h >> 4) % 2);
      if (Math.abs(u) < 0.3)
        b.box(
          BLOCK_W - 0.012,
          hh - 0.012,
          0.003,
          tint(paint, h % 2 ? 0.04 : -0.04),
          on(u, c0 + hh / 2),
          0,
        );
    }
  }
}

/**
 * A wall of the stairwell: painted concrete block, pale above and a
 * blue-grey dado below with a darker band, on a dark kick plinth, the
 * coursing on every face, under cast-concrete coping. `look` adds boot
 * scuffs on the dado or a patched block. The low front wall is the dado
 * and its plinth, coursed.
 */
export function blockWallModel(piece: WallPiece, look: number): Model {
  const b = new ModelBuilder();
  if (piece === 'wall-front') {
    const h = FRONT_WALL_HEIGHT;
    b.box(1, h - CAP, 1, BLOCK_DADO, { at: [0, (h - CAP) / 2, 0] }, 0);
    b.box(1.01, 0.05, 1.01, BLOCK_KICK, { at: [0, 0.025, 0] }, 0);
    for (const on of faces(0.502))
      b.box(
        0.007,
        h - CAP - 0.06,
        0.004,
        tint(BLOCK_DADO, -0.16),
        on(-0.3 + 0.4 * (look % 2), 0.05 + (h - CAP - 0.05) / 2),
        0,
      );
    coping(b, h);
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
        mark(w, 0.012, tint(BLOCK_DADO, -0.22), u, y, r);
    } else if (look === 2) {
      // A block patched with fresh paint, two rawlplug holes where a sign hung.
      mark(BLOCK_W - 0.02, COURSE - 0.02, tint(BLOCK_UPPER, 0.06), 0.1, DADO_H + COURSE * 1.5);
      mark(0.014, 0.014, tint(BLOCK_UPPER, -0.45), -0.28, 0.84);
      mark(0.014, 0.014, tint(BLOCK_UPPER, -0.45), -0.14, 0.84);
    }
  });
  coping(b, h);
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

/** A steel handrail: on brackets on a full wall's front face, or on short posts along a low wall's top. */
export function railModel(low: boolean): Model {
  const b = new ModelBuilder();
  const rail = 0x5c6873;
  if (low) {
    const y = FRONT_WALL_HEIGHT + 0.17;
    const z = -0.22;
    b.cylinder(0.022, 0.022, 1.0, rail, { at: [0, y, z], rot: [0, 0, Math.PI / 2] }, 10);
    b.box(
      0.03,
      y - FRONT_WALL_HEIGHT,
      0.03,
      tint(rail, -0.2),
      { at: [0, (y + FRONT_WALL_HEIGHT) / 2, z] },
      0.006,
    );
    b.box(0.07, 0.012, 0.07, tint(rail, -0.25), { at: [0, FRONT_WALL_HEIGHT + 0.006, z] }, 0);
    return b.build();
  }
  const y = 0.66;
  const z = 0.58;
  b.cylinder(0.02, 0.02, 1.0, rail, { at: [0, y, z], rot: [0, 0, Math.PI / 2] }, 10);
  b.box(0.022, 0.06, 0.08, tint(rail, -0.2), { at: [0, y - 0.035, 0.54] }, 0.006);
  b.box(0.05, 0.05, 0.012, tint(rail, -0.25), { at: [0, y - 0.06, 0.508] }, 0);
  return b.build();
}

// ---- The lift ----

/** The lift doors' height and the lintel over them. */
const DOOR_H = 0.9;
const LINTEL_H = 0.07;
const JAMB_W = 0.08;

/**
 * One tile of a lift's door frame in the wall beside its cabin, its run
 * along `axis`, the jambs at the ends in `ends` (− 1, + 2): brushed-steel
 * door leaves on both faces under a steel lintel (the closed doors' seam
 * where the run's middle is), the jambs proud of the wall, a steel sill, the
 * partition's plasterboard bulkhead over it under the head track, and on
 * the run's + end the call-button plate.
 */
export function liftFrameModel(axis: 'x' | 'z', ends: number): Model {
  const b = new ModelBuilder();
  const g = framed(b, [0, 0, 0], [0, axis === 'x' ? 0 : -Math.PI / 2, 0]);
  const minus = (ends & 1) !== 0;
  const plus = (ends & 2) !== 0;
  // The wall's core and the bulkhead over the doors, in the partitions' plasterboard.
  g.box(1, WALL_HEIGHT - 0.04, 0.84, PLASTER, { at: [0, (WALL_HEIGHT - 0.04) / 2, 0] }, 0);
  // The top: the lift's steel head frame, a dark border round a brushed plate, rivets.
  g.box(1.02, 0.04, 1.02, STEEL_EDGE, { at: [0, WALL_HEIGHT - 0.02, 0] }, 0);
  g.box(0.86, 0.012, 0.8, STEEL, { at: [0, WALL_HEIGHT + 0.004, 0] }, 0);
  for (const k of [-0.25, 0, 0.25])
    g.box(0.84, 0.002, 0.006, tint(STEEL, 0.12), { at: [0, WALL_HEIGHT + 0.011, k] }, 0);
  for (const [rx, rz] of [
    [-0.46, -0.44],
    [0.46, -0.44],
    [-0.46, 0.44],
    [0.46, 0.44],
  ] as const)
    g.box(0.02, 0.006, 0.02, STEEL_DARK, { at: [rx, WALL_HEIGHT + 0.003, rz] }, 0);
  for (const s of [-1, 1]) {
    const z = s * 0.45;
    const u0 = -0.5 + (minus ? JAMB_W : 0);
    const u1 = 0.5 - (plus ? JAMB_W : 0);
    const w = u1 - u0;
    const cu = (u0 + u1) / 2;
    // The leaf, its brushed lines, the seam where it meets the next (or its middle, alone).
    g.box(w, DOOR_H, 0.06, STEEL, { at: [cu, DOOR_H / 2, z] }, 0);
    for (const k of [0.2, 0.45, 0.7])
      g.box(w - 0.02, 0.006, 0.002, tint(STEEL, 0.1), { at: [cu, DOOR_H * k, z + s * 0.031] }, 0);
    const seams = minus && plus ? [cu] : [minus ? u1 : u0].filter((u) => Math.abs(u) > 0.4);
    for (const u of seams) g.box(0.014, DOOR_H, 0.064, STEEL_EDGE, { at: [u, DOOR_H / 2, z] }, 0);
    // The lintel and the sill.
    g.box(1.0, LINTEL_H, 0.08, STEEL_DARK, { at: [0, DOOR_H + LINTEL_H / 2, z] }, 0.008);
    g.box(1.0, 0.012, 0.12, STEEL_DARK, { at: [0, 0.006, z + s * 0.04] }, 0);
    // The jambs.
    for (const [on, u] of [
      [minus, -0.5 + JAMB_W / 2],
      [plus, 0.5 - JAMB_W / 2],
    ] as const)
      if (on)
        g.box(
          JAMB_W,
          DOOR_H + LINTEL_H,
          0.1,
          STEEL_DARK,
          { at: [u, (DOOR_H + LINTEL_H) / 2, z + s * 0.01] },
          0.01,
        );
    // The call button beside the + jamb: a steel plate, one lit button.
    if (plus) {
      const u = 0.5 - JAMB_W / 2;
      g.box(0.05, 0.14, 0.012, STEEL, { at: [u, 0.52, z + s * 0.066] }, 0);
      glowBox(g, 0.026, 0.026, 0.006, INDICATOR, { at: [u, 0.55, z + s * 0.073] });
      g.box(0.026, 0.026, 0.006, STEEL_DARK, { at: [u, 0.49, z + s * 0.073] }, 0);
    }
  }
  return b.build();
}

/** Every lift-frame swap model, by its name in the plan's `swaps`. */
export const LIFT_MODELS: Readonly<Record<string, () => Model>> = Object.fromEntries(
  [0, 1, 2, 3].flatMap((floor) =>
    (['x', 'z'] as const).flatMap((axis) =>
      [0, 1, 2, 3].map((ends) => [liftSwap(floor, axis, ends), () => liftFrameModel(axis, ends)]),
    ),
  ),
);

/** How tall the lift's floor indicator stands over the wall. */
export const LIFT_HEAD_H = 0.3;

/**
 * The lift's floor indicator, standing on the wall top over the doors and
 * facing the camera: a brushed-steel box, a black display with the floor's
 * number lit amber and the up and down arrows.
 */
export function liftHeadModel(floor: number): Model {
  const b = new ModelBuilder();
  const y0 = WALL_HEIGHT + 0.02;
  const h = LIFT_HEAD_H - 0.02;
  b.box(0.5, h, 0.1, STEEL, { at: [0, y0 + h / 2, 0] }, 0.012);
  b.box(0.44, 0.07, 0.004, 0x2a2f36, { at: [0, y0 + h - 0.05, 0.051] }, 0);
  text(b, 'LIFT', 0, y0 + h - 0.05, 0.053, 0.011, 0xe8ecf0, 0.003);
  b.box(0.36, h - 0.13, 0.004, 0x15171a, { at: [0, y0 + (h - 0.09) / 2, 0.051] }, 0);
  b.add(
    new THREE.PlaneGeometry(0.1, 0.11),
    0x3a2410,
    { at: [-0.06, y0 + (h - 0.09) / 2, 0.0535] },
    'glow',
  );
  const dy = y0 + (h - 0.09) / 2;
  text(b, `${floor}`, -0.06, dy, 0.054, 0.02, INDICATOR, 0.003);
  // Up and down arrows, the one it's going lit.
  const ax = 0.09;
  b.add(
    new THREE.ConeGeometry(0.03, 0.04, 3),
    floor === 0 ? INDICATOR : 0x4a3a20,
    {
      at: [ax, dy + 0.035, 0.055],
    },
    floor === 0 ? 'glow' : 'body',
  );
  b.add(
    new THREE.ConeGeometry(0.03, 0.04, 3),
    floor === 0 ? 0x4a3a20 : INDICATOR,
    {
      at: [ax, dy - 0.035, 0.055],
      rot: [0, 0, Math.PI],
    },
    floor === 0 ? 'body' : 'glow',
  );
  b.box(0.1, 0.012, 0.06, STEEL_DARK, { at: [0, y0 - 0.005, 0] }, 0);
  return b.build();
}

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
  fireExit: MID_RISE_WALL_ART.fireExit ?? (() => new ModelBuilder().build()),
  directory0: () => directory(0),
  directory1: () => directory(1),
  stencil1: () => stencil('1'),
  yotta: MID_RISE_WALL_ART.yottaSmall ?? (() => new ModelBuilder().build()),
};

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
