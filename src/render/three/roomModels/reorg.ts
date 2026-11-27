import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { tileHash } from '../../mapShape';
import { type Model, ModelBuilder, tint } from '../kit';
import { FRONT_WALL_HEIGHT, STATION_HEIGHT, WALL_HEIGHT } from '../layout';
import { FLOOR_COLORS, WALL_COLORS } from '../look';
import { tableBoardModel, tableHalfModel } from '../boardroom/models';
import type { CounterRun } from '../rooms/counterRun';
import {
  BADGE_LOOKS,
  CARPET_WEAR,
  LOBBY_WEAR,
  REORG_KIND,
  REORG_PANEL_SWAP,
  type ReorgArt,
  SIDE_LOOKS,
  STENCIL_NAMES,
  badgeLineSwap,
  reorgSideSwap,
  stencilOf,
} from '../rooms/reorgRoom';
import { CARDBOARD, CRATE_BLUE, TAPE_YELLOW, TEAL } from '../setDressing/reorgWallTops';
import type { StationModel } from '../stationModels';
import { framed, text } from './basement';
import { taskChairModel } from './midRise';
import { BOARDROOM_SWAP_MODELS, BORDER, GOOD_CARPET, SILL_STONE } from './boardroom';
import { HEAD_TRACK, MULLION, YOTTA_VIOLET } from './tower';

/**
 * YOTTA Tower's boardroom floor mid-reorg (wall theme `reorg`, floor theme
 * `reorgFloors`; see `docs/plan/the-reorg-environment.md`), on the tower's
 * and 4-2's kit: the side curtain wall with its blinds left at odd heights
 * (nobody owns them any more), the badge line's low stone wall with its
 * violet stripe; the work floor's stripped slate carpet with its access
 * tiles, ghost lines, floor tape, stencils, X marks, castor tracks and
 * litter, 4-2's good carpet in the boardroom, the lobby's clean cool stone
 * with BADGE IN mats and the goods lift's threshold; the walnut boardroom
 * table with BOARDROOM – DO NOT MOVE taped to it; the consultants' art on
 * the faces; the handover desk behind the inbox, the shredding console at
 * the bin, the goods lift at the ship; the back half's pendant wire.
 */

const INK = 0x24272c;
const WHITE = 0xf1f2f4;
const PAPER = 0xeeede6;
const RED = 0xc0302a;
const STEEL = 0xa3abb2;
const STEEL_DARK = 0x5f676f;
const BRUSHED = 0x9aa1a8;
const DARK = 0x22252b;
const FACE = 0.506;
/** A deterministic 0..1 from two counters. */
const rnd = (a: number, b: number) => (tileHash(a * 7 + 3, b * 13 + 5) % 997) / 997;

// ---- The side glass ----

const SIDE_STEEL = 0x8c939b;
const SIDE_GLASS = 0x9fb4c6;
const SIDE_BLIND = 0xd8d1c3;
const SIDE_RAIL = 0xd9cdb6;
const SIDE_DEPTH = 0.8;
/** The cut-down unit's head: under the front strip's 0.6. */
export const SIDE_LOW_TOP = 0.55;
/** How far down each look's blind comes (of the glass), and its skew: nobody owns them any more. */
const ODD_DROPS: readonly [number, number][] = [
  [0.12, 0],
  [0.72, 0.05],
  [0.4, -0.12],
  [0.9, 0],
  [0.55, 0.16],
];

/**
 * A unit of the side curtain wall (along z, the room on `room`'s side of
 * x): the dark spandrel, its aluminium sill, see-through cool glass framed
 * in slim steel, open above, and the blind inside it left at its own odd
 * height (one hung skew where a cord's gone).
 */
export function reorgSideModel(look: number, room: 1 | -1, low: boolean): Model {
  const b = new ModelBuilder();
  const sp = low ? 0.12 : 0.26;
  const g0 = sp + 0.022;
  const top = low ? SIDE_LOW_TOP : WALL_HEIGHT - 0.03;
  const gh = top - g0;
  const half = SIDE_DEPTH / 2;
  b.box(1.0, sp, 1.0, 0x525b66, { at: [0, sp / 2, 0] }, 0);
  b.box(1.006, 0.014, 1.006, tint(0x525b66, -0.4), { at: [0, 0.007, 0] }, 0);
  for (const s of [-1, 1])
    b.box(0.11, 0.022, 1.02, 0xb0b7be, { at: [s * (half + 0.05), sp + 0.011, 0] }, 0.004);
  b.box(SIDE_DEPTH, 0.022, 1.0, 0x51606e, { at: [0, sp + 0.011, 0] }, 0);
  for (const s of [-1, 1]) {
    b.pane(0.008, gh, 0.98, SIDE_GLASS, { at: [s * half, g0 + gh / 2, 0] });
    for (const z of [-0.48, 0.48])
      b.box(0.04, gh + 0.03, 0.04, SIDE_STEEL, { at: [s * half, g0 + gh / 2, z] }, 0);
    b.box(0.04, 0.03, 1.0, SIDE_STEEL, { at: [s * half, g0 + 0.015, 0] }, 0);
    if (!low) b.box(0.04, 0.024, 1.0, SIDE_STEEL, { at: [s * half, 0.92, 0] }, 0);
    b.box(0.05, 0.03, 1.0, SIDE_STEEL, { at: [s * half, top + 0.015, 0] }, 0);
  }
  for (const z of [-0.48, 0.48]) {
    b.box(SIDE_DEPTH + 0.04, 0.03, 0.04, SIDE_STEEL, { at: [0, top + 0.015, z] }, 0);
    b.pane(SIDE_DEPTH - 0.04, gh, 0.008, SIDE_GLASS, { at: [0, g0 + gh / 2, z * 1.02] });
  }
  const [share, skew] = ODD_DROPS[look % ODD_DROPS.length] ?? [0.5, 0];
  const drop = Math.max(0.05, gh * share);
  const bx = room * (half - 0.05);
  // The cassette on the head, the blind out of it a fair thickness, its slats' lines every 0.05.
  b.box(0.06, 0.06, 0.95, SIDE_BLIND, { at: [bx, top - 0.032, 0] }, 0.01);
  b.box(0.062, 0.008, 0.952, tint(SIDE_BLIND, -0.2), { at: [bx, top - 0.06, 0] }, 0);
  b.box(0.03, drop, 0.92, SIDE_BLIND, { at: [bx, top - 0.062 - drop / 2, 0] }, 0);
  const slats = Math.floor(drop / 0.05);
  for (let k = 1; k <= slats; k++)
    b.box(
      0.004,
      0.008,
      0.92,
      tint(SIDE_BLIND, -0.12),
      { at: [bx + room * 0.016, top - 0.062 - k * 0.05, 0] },
      0,
    );
  b.box(
    0.03,
    0.034,
    0.95,
    SIDE_RAIL,
    {
      at: [bx, top - 0.062 - drop - 0.017, 0],
      rot: [skew, 0, 0],
    },
    0.006,
  );
  b.box(
    0.006,
    0.16,
    0.006,
    0x6a7078,
    { at: [bx + room * 0.02, top - 0.062 - drop - 0.11, 0.4] },
    0,
  );
  return b.build();
}

// ---- The badge line ----

/** The badge line's honed cap and the pale stone under it. */
export const BADGE_CAP = SILL_STONE;
const BADGE_STONE = 0xb9bcbf;

/**
 * The badge line's low wall between the floor and the shipping lobby: pale
 * stone on a dark kick, coursed every look its own way, a YOTTA violet
 * stripe under a cool honed cap with a lip (never a pale slab).
 */
function badgeLineModel(look: number): Model {
  const b = new ModelBuilder();
  const h = FRONT_WALL_HEIGHT;
  b.box(1.0, 0.03, 1.0, 0x45474b, { at: [0, 0.015, 0] }, 0);
  b.box(0.98, h - 0.055, 0.98, BADGE_STONE, { at: [0, 0.03 + (h - 0.055) / 2, 0] }, 0);
  for (const s of [1, -1]) {
    b.box(
      0.006,
      h - 0.06,
      0.004,
      tint(BADGE_STONE, -0.2),
      { at: [(look - 1) * 0.3, h / 2, s * 0.491] },
      0,
    );
    b.box(0.98, 0.016, 0.004, YOTTA_VIOLET, { at: [0, h - 0.05, s * 0.491] }, 0);
  }
  b.box(1.02, 0.026, 1.02, BADGE_CAP, { at: [0, h - 0.013, 0] }, 0.004);
  b.box(1.024, 0.005, 1.024, tint(BADGE_CAP, -0.4), { at: [0, h - 0.027, 0] }, 0);
  return b.build();
}

/** The wall in the theme's own look, where the plan gives no swap. */
export function reorgWallModel(piece: 'wall' | 'wall-front' | 'wall-inner', look: number): Model {
  if (piece === 'wall-front') return badgeLineModel(look % BADGE_LOOKS);
  return (BOARDROOM_SWAP_MODELS['partition:x:0'] ?? (() => new ModelBuilder().build()))();
}

/** Every wall swap model: the tower's and 4-2's, the odd blinds, the badge line. */
export const REORG_SWAP_MODELS: Readonly<Record<string, () => Model>> = (() => {
  const out: Record<string, () => Model> = { ...BOARDROOM_SWAP_MODELS };
  for (let l = 0; l < SIDE_LOOKS; l++)
    for (const low of [false, true]) {
      out[reorgSideSwap('left', l, low)] = () => reorgSideModel(l, 1, low);
      out[reorgSideSwap('right', l, low)] = () => reorgSideModel(l, -1, low);
    }
  for (let l = 0; l < BADGE_LOOKS; l++) out[badgeLineSwap(l)] = () => badgeLineModel(l);
  out[REORG_PANEL_SWAP] = reorgPanelModel;
  return out;
})();

// ---- The floors ----

const VARIANTS = 3;

/** A floor look: its wear and its variant. */
export function reorgLook(x: number, y: number, wear: number): number {
  return wear * VARIANTS + ((tileHash(x + 23, y + 37) >>> 4) % VARIANTS);
}

/** A tile's brightness: ±4% per tile, by the tile and the level. */
export function reorgTone(x: number, y: number, salt: number): number {
  const own = ((Math.imul(x + 61, 73856093) ^ Math.imul(y + 13, 19349663) ^ salt) >>> 0) % 1001;
  return 1 + (own / 1000 - 0.5) * 0.08;
}

/** The stripped slate carpet (4-2's, a day older and dustier) and its alternate. */
export const CARPET = FLOOR_COLORS.reorgFloors[0];
const CARPET_ALT = FLOOR_COLORS.reorgFloors[1];
/** The raised-floor access tiles under it, their joints and lift-out handles. */
export const ACCESS = 0x70747a;
const ACCESS_JOINT = 0x666a70;
/** A desk's parking corners: a faint warm grey, quieter than the tape. */
const DESK_CORNER = 0x8f9096;
/** The tape on the floor: tape yellow, a little worn into the carpet. */
const TAPE = TAPE_YELLOW;
/** The lobby's clean cool stone and its joints. */
export const LOBBY_STONE = 0x8e9196;
const LOBBY_JOINT = 0x7a7d82;
/** The mats' grey and their lettering. */
export const MAT = 0x5c6066;

function mark(
  b: ModelBuilder,
  w: number,
  d: number,
  color: number,
  x: number,
  z: number,
  y = 0.0012,
  turn = 0,
) {
  b.box(w, 0.002, d, color, { at: [x, y, z], rot: [0, turn, 0] }, 0);
}

/** The four carpet tiles' (and access panels') middles in a floor tile. */
const QUADS: readonly [number, number][] = [
  [-0.25, -0.25],
  [0.25, -0.25],
  [-0.25, 0.25],
  [0.25, 0.25],
];

/**
 * Carpet over the whole tile: four carpet tiles laid quarter-turned (each
 * its pile rows the other way and a shade apart, so it reads as carpet
 * tiles, not tarmac), a few flecks, the joints between them.
 */
function carpet(b: ModelBuilder, variant: number): void {
  const base = variant === 2 ? CARPET_ALT : CARPET;
  b.box(1, 0.012, 1, base, { at: [0, -0.006, 0] }, 0);
  QUADS.forEach(([qx, qz], q) => {
    const turned = q === 1 || q === 2;
    const shade = tint(base, turned ? -0.025 : 0.012);
    mark(b, 0.49, 0.49, shade, qx, qz, 0.0005);
    for (let k = -0.2; k < 0.24; k += 0.1)
      if (turned) mark(b, 0.012, 0.47, tint(shade, -0.04), qx + k, qz, 0.0009);
      else mark(b, 0.47, 0.012, tint(shade, -0.04), qx, qz + k, 0.0009);
  });
  for (let k = 0; k < 4; k++)
    mark(
      b,
      0.014,
      0.014,
      tint(base, 0.1),
      -0.44 + rnd(variant * 31 + k, 3) * 0.88,
      -0.44 + rnd(variant * 31 + k, 7) * 0.88,
      0.0016,
    );
  for (const [w, d, x, z] of [
    [1, 0.006, 0, 0],
    [0.006, 1, 0, 0],
    [1, 0.006, 0, -0.497],
    [0.006, 1, -0.497, 0],
  ] as const)
    mark(b, w, d, tint(base, -0.07), x, z, 0.0021);
}

/** Which access panels (`QUADS`) each variant has bare: all four, three, or a half, so a strip runs ragged. */
const ACCESS_BARE: readonly (readonly number[])[] = [
  [0, 1, 2, 3],
  [0, 1, 3],
  [0, 2],
];

/**
 * Raised-floor access tiles where the carpet's pulled up, raggedly: the
 * carpet left on some quarters (its torn edge rolled along the bare ones),
 * the bare panels quiet with their lift-out handles; with `lift`, the first
 * panel lifted out (the void under it, its cables) and propped on its
 * neighbour.
 */
function access(b: ModelBuilder, variant: number, lift: boolean): void {
  carpet(b, variant);
  const bare = ACCESS_BARE[variant % ACCESS_BARE.length] ?? [0];
  const isBare = (q: number) => bare.includes(q);
  QUADS.forEach(([px, pz], q) => {
    if (!isBare(q)) return;
    mark(b, 0.5, 0.5, ACCESS_JOINT, px, pz, 0.0024);
    if (lift && q === 0) {
      // The void under it, its cables.
      mark(b, 0.47, 0.47, 0x55595e, px, pz, 0.0028);
      b.box(0.4, 0.012, 0.012, 0xa0704e, { at: [px, 0.006, pz - 0.08], rot: [0, 0.2, 0] }, 0);
      b.box(0.4, 0.012, 0.012, 0x4e6488, { at: [px, 0.006, pz + 0.06], rot: [0, -0.15, 0] }, 0);
      return;
    }
    b.box(0.47, 0.008, 0.47, tint(ACCESS, (px + pz) * 0.015), { at: [px, 0.006, pz] }, 0.002);
    mark(b, 0.08, 0.025, tint(ACCESS, -0.06), px, pz - 0.12, 0.0102);
  });
  if (lift && isBare(0)) {
    // Propped on its neighbour along x (or z, where that one's still carpet): low, a hand's height.
    const alongX = isBare(1);
    const [vx, vz] = QUADS[0] ?? [-0.25, -0.25];
    const a = 0.38;
    b.box(
      0.47,
      0.012,
      0.47,
      tint(ACCESS, 0.03),
      {
        at: [vx + (alongX ? 0.12 : 0), 0.1, vz + (alongX ? 0 : 0.12)],
        rot: alongX ? [0, 0, a] : [-a, 0, 0],
      },
      0.002,
    );
  }
  // The carpet's torn edge, rolled a little, along each bare quarter's side that meets carpet.
  QUADS.forEach(([px, pz], q) => {
    if (!isBare(q)) return;
    const nx = QUADS.findIndex(([x, z]) => x === -px && z === pz);
    const nz = QUADS.findIndex(([x, z]) => x === px && z === -pz);
    if (!isBare(nx)) b.box(0.03, 0.018, 0.5, CARPET, { at: [0, 0.009, pz] }, 0.008);
    if (!isBare(nz)) b.box(0.5, 0.018, 0.03, CARPET, { at: [px, 0.009, 0] }, 0.008);
  });
}

/** The floor tape along the edges in `flags`, a band 0.05 wide just inside each. */
function tape(b: ModelBuilder, flags: number): void {
  const F = CARPET_WEAR;
  const w = 0.05;
  const at = 0.5 - w / 2 - 0.02;
  if (flags & F.tapeN) mark(b, 1, w, TAPE, 0, -at, 0.0028);
  if (flags & F.tapeS) mark(b, 1, w, TAPE, 0, at, 0.0028);
  if (flags & F.tapeW) mark(b, w, 1, TAPE, -at, 0, 0.003);
  if (flags & F.tapeE) mark(b, w, 1, TAPE, at, 0, 0.003);
}

/** The zone's name stencilled on a strip of tape near the tile's front. */
function stencil(b: ModelBuilder, n: number): void {
  const name = STENCIL_NAMES[n - 1];
  if (!name) return;
  mark(b, 0.74, 0.14, tint(TAPE, -0.05), 0, 0.22, 0.0034);
  const t = framed(b, [0, 0.0046, 0.22], [-Math.PI / 2, 0, 0]);
  text(t, name, 0, 0, 0, 0.016, 0x3a3c40, 0.001);
}

/** The carpet's placed wear (`CARPET_WEAR` flags, the stencil apart). */
function carpetWear(b: ModelBuilder, flags: number, variant: number): void {
  const F = CARPET_WEAR;
  if (flags & F.ghostZ) {
    // Cleaner, darker carpet where yesterday's wall stood, its fixings' dots.
    mark(b, 0.22, 1, tint(CARPET, -0.08), 0, 0, 0.0017);
    for (const z of [-0.3, 0.2]) mark(b, 0.02, 0.02, tint(CARPET, -0.25), 0.08, z, 0.0019);
  }
  if (flags & F.ghostX) mark(b, 1, 0.22, tint(CARPET, -0.08), 0, 0, 0.0017);
  if (flags & F.castorX)
    for (const z of [-0.2, 0.2])
      mark(b, 1, 0.016, tint(CARPET, 0.12), 0, z + (variant - 1) * 0.03, 0.0024);
  if (flags & F.castorZ)
    for (const x of [-0.2, 0.2])
      mark(b, 0.016, 1, tint(CARPET, 0.12), x + (variant - 1) * 0.03, 0, 0.0024);
  if (flags & F.xMark) {
    // A desk's parking spot: faint grey L-shaped corner marks (a yellow X means one is arriving).
    const c = DESK_CORNER;
    for (const sx of [-1, 1])
      for (const sz of [-1, 1]) {
        mark(b, 0.16, 0.035, c, sx * 0.34, sz * 0.41, 0.0036);
        mark(b, 0.035, 0.16, c, sx * 0.415, sz * 0.335, 0.0037);
      }
  }
  if (flags & F.litter) {
    const corner = variant % 3;
    const sx = corner === 1 ? 1 : -1;
    if (corner === 0) {
      // A dropped lanyard and its badge.
      b.torus(
        0.12,
        0.008,
        YOTTA_VIOLET,
        { at: [sx * 0.24, 0.004, 0.24], rot: [Math.PI / 2, 0, 0.4] },
        Math.PI * 1.6,
      );
      mark(b, 0.07, 0.09, WHITE, sx * 0.2, 0.36, 0.006, 0.3);
    } else if (corner === 1) {
      for (let k = 0; k < 3; k++)
        mark(
          b,
          0.12,
          0.12,
          [0xe6d064, 0xe09ab0, 0x8ec0dc][k] ?? 0xe6d064,
          sx * (0.26 + k * 0.05),
          0.28 - k * 0.07,
          0.004 + k * 0.0004,
          k * 0.6,
        );
    } else {
      // A coil of cable.
      b.torus(0.1, 0.012, 0x4a4e55, { at: [sx * 0.26, 0.008, 0.26], rot: [Math.PI / 2, 0, 0] });
      b.torus(0.075, 0.012, 0x4a4e55, { at: [sx * 0.27, 0.02, 0.25], rot: [Math.PI / 2, 0, 0] });
    }
  }
  if (flags & F.mat) mat(b);
}

/** The mats' badge: a bold off-white, no lettering (it reads from the camera). */
const MAT_BADGE = 0xd4d6da;

/**
 * A mat at a turnstile, mid grey inside the tile's edge, a bold badge on
 * it (a card with its clip and photo): no direction, since the gates flip
 * theirs every layout.
 */
function mat(b: ModelBuilder): void {
  b.box(0.82, 0.012, 0.6, MAT, { at: [0, 0.006, 0] }, 0.004);
  b.box(0.7, 0.003, 0.48, tint(MAT, 0.12), { at: [0, 0.0125, 0] }, 0);
  b.box(0.66, 0.004, 0.44, MAT, { at: [0, 0.0135, 0] }, 0);
  b.box(0.26, 0.004, 0.3, MAT_BADGE, { at: [0, 0.015, 0.02] }, 0.01);
  b.box(0.08, 0.004, 0.03, MAT, { at: [0, 0.0175, -0.1] }, 0);
  b.box(0.08, 0.004, 0.09, tint(MAT, 0.05), { at: [-0.05, 0.0175, 0.04] }, 0);
  for (const z of [0.03, 0.08])
    b.box(0.07, 0.004, 0.018, tint(MAT, 0.05), { at: [0.07, 0.0175, z] }, 0);
}

/** Lobby stone over the tile: two big slabs a tile, a fine joint, a faint vein. */
function lobbyStone(b: ModelBuilder, variant: number): void {
  b.box(1, 0.012, 1, LOBBY_STONE, { at: [0, -0.006, 0] }, 0);
  mark(b, 1, 0.006, LOBBY_JOINT, 0, -0.497, 0.0015);
  mark(b, 0.006, 1, LOBBY_JOINT, -0.497, 0, 0.0015);
  mark(b, 0.006, 1, LOBBY_JOINT, 0, 0, 0.0015);
  mark(
    b,
    0.44,
    0.004,
    tint(LOBBY_STONE, 0.08),
    -0.22 + variant * 0.1,
    -0.1 + variant * 0.2,
    0.0016,
    0.4,
  );
}

/**
 * A floor tile (`look` from `reorgLook`): the work floor's carpet and its
 * wear (or the access tiles where it's pulled up), the good carpet with its
 * violet border, the lobby's stone with its mats and lift threshold, the
 * badge line's thresholds.
 */
export function reorgFloorModel(look: number): Model {
  const variant = look % VARIANTS;
  const wear = Math.floor(look / VARIANTS);
  const kind = Math.floor(wear / REORG_KIND);
  const flags = wear % REORG_KIND;
  const b = new ModelBuilder();
  if (kind === 1) {
    b.box(1, 0.012, 1, GOOD_CARPET, { at: [0, -0.006, 0] }, 0);
    for (let z = -0.46; z < 0.5; z += 0.08)
      mark(b, 1, 0.014, tint(GOOD_CARPET, -0.04), 0, z, 0.0008);
    const band = 0.2;
    for (const [bit, x0, x1, z0, z1] of [
      [1, -0.5, -0.5 + band, -0.5, 0.5],
      [2, 0.5 - band, 0.5, -0.5, 0.5],
      [4, -0.5, 0.5, -0.5, -0.5 + band],
      [8, -0.5, 0.5, 0.5 - band, 0.5],
    ] as const)
      if (flags & bit) mark(b, x1 - x0, z1 - z0, BORDER, (x0 + x1) / 2, (z0 + z1) / 2, 0.0018);
    return b.build();
  }
  if (kind === 2) {
    lobbyStone(b, variant);
    if (flags & LOBBY_WEAR.mat) mat(b);
    if (flags & LOBBY_WEAR.lift) {
      // The goods lift's steel threshold and the scuffs of a thousand trolleys.
      b.box(1, 0.008, 0.12, BRUSHED, { at: [0, 0.004, 0.44] }, 0);
      for (let k = 0; k < 6; k++)
        mark(
          b,
          0.012,
          0.3,
          tint(LOBBY_STONE, -0.12),
          -0.4 + k * 0.16,
          0.2,
          0.0018,
          (rnd(k, variant) - 0.5) * 0.3,
        );
    }
    return b.build();
  }
  if (kind === 3) {
    // The badge line's gap: the lobby stone running through, a steel strip each side.
    lobbyStone(b, variant);
    for (const z of [-0.47, 0.47]) b.box(1, 0.006, 0.05, STEEL, { at: [0, 0.003, z] }, 0);
    return b.build();
  }
  if (flags & CARPET_WEAR.access) access(b, variant, (flags & CARPET_WEAR.accessLift) !== 0);
  else carpet(b, variant);
  carpetWear(b, flags & ~(CARPET_WEAR.access | CARPET_WEAR.accessLift), variant);
  tape(b, flags);
  const n = stencilOf(flags);
  if (n > 0) stencil(b, n);
  return b.build();
}

// ---- The boardroom table ----

/** The table's walnut top (darker than every station top) and its dark pedestal. */
export const TABLE_TOP = 0x4a3a2e;
const TABLE_BODY = 0x3a332e;

/** `parts` (each turned by `yaw` and moved to `at`) as one model. */
function combine(parts: readonly [Model, [number, number, number], number][]): Model {
  const layer = (k: 'body' | 'glow' | 'glass') => {
    const list = parts.flatMap(([m, at, yaw]) => {
      const g = m[k];
      // An empty layer (a builder with nothing in it) has no attributes to merge.
      if (!g || !('position' in g.attributes)) return [];
      const t = new THREE.Matrix4()
        .makeTranslation(...at)
        .multiply(new THREE.Matrix4().makeRotationY(yaw));
      return [g.clone().applyMatrix4(t)];
    });
    for (const [m] of parts) m[k]?.dispose();
    if (list.length === 0) return null;
    const merged = mergeGeometries(list, false);
    for (const g of list) g.dispose();
    return merged;
  };
  return {
    body: layer('body') ?? new THREE.BufferGeometry(),
    glow: layer('glow'),
    glass: layer('glass'),
  };
}

/** How far out past the table's round end its chairs stand (their seats' middles, from the tile's middle). */
export const TABLE_CHAIR_X = 0.6;

/**
 * The boardroom table, the one thing that never moves: 4-2's long walnut
 * table (a half each end of the run, the seam between; a straight piece on
 * a tile between), two mesh chairs tucked in at each round end (none along
 * the sides, so the meeting's label stays clear), the name cards on the
 * first half, and on the run's first tile a paper sign taped to its front
 * edge, big enough to read: BOARDROOM – DO NOT MOVE. A one-tile run is a
 * plain walnut top.
 */
export function reorgCounter(run: CounterRun): StationModel {
  const h = STATION_HEIGHT;
  const b = new ModelBuilder();
  const parts: [Model, [number, number, number], number][] = [];
  const end = run.minusEnd !== run.plusEnd;
  if (end) {
    // The half's round end out toward the run's end (built round end toward −x).
    const yaw = run.minusEnd ? 0 : Math.PI;
    parts.push([tableHalfModel(), [0, 0, 0], yaw]);
    const out = run.minusEnd ? -1 : 1;
    for (const z of [-0.2, 0.2])
      parts.push([taskChairModel(), [out * (TABLE_CHAIR_X - 0.32), 0, z], -out * (Math.PI / 2)]);
    if (run.minusEnd) parts.push([tableBoardModel(['ALIGNCO', 'DEREK'], 3), [0, 0, 0], 0]);
  } else {
    const t = 0.05;
    b.box(0.7, 0.04, 0.6, 0x2e2a26, { at: [0, 0.02, 0] }, 0.01);
    b.box(0.6, h - t - 0.04, 0.5, TABLE_BODY, { at: [0, 0.04 + (h - t - 0.04) / 2, 0] }, 0.012);
    b.box(1.0, t, run.minusEnd ? 0.96 : 0.76, TABLE_TOP, { at: [0, h - t / 2, 0] }, 0.02);
  }
  if (run.minusEnd) {
    // The sign, taped on at the corners, centred on a two-tile table.
    const x = run.plusEnd ? 0 : 0.5;
    const z = (run.plusEnd ? 0.48 : 0.38) + 0.004;
    b.box(0.76, 0.2, 0.004, PAPER, { at: [x, h - 0.12, z], rot: [0, 0, -0.03] }, 0);
    text(b, 'BOARDROOM', x, h - 0.075, z + 0.003, 0.014, INK);
    text(b, 'DO NOT MOVE', x, h - 0.165, z + 0.003, 0.0145, RED);
    for (const sx of [-0.36, 0.36])
      b.box(
        0.07,
        0.03,
        0.003,
        0xd8d6c8,
        { at: [x + sx, h - 0.03, z + 0.004], rot: [0, 0, 0.6] },
        0,
      );
  }
  parts.push([b.build(), [0, 0, 0], 0]);
  return { base: combine(parts), hero: null, heroAt: [0, 0] };
}

// ---- What hangs on the faces ----

/** A paper sheet on the face, its four corners taped. */
function sheet(
  b: ModelBuilder,
  x: number,
  y: number,
  w: number,
  h: number,
  color = PAPER,
  turn = 0,
): void {
  b.box(w, h, 0.004, color, { at: [x, y, FACE + 0.002], rot: [0, 0, turn] }, 0);
  for (const [sx, sy] of [
    [-1, 1],
    [1, 1],
  ] as const)
    b.box(
      0.05,
      0.02,
      0.002,
      0xd8d6c8,
      {
        at: [x + sx * (w / 2 - 0.01), y + sy * (h / 2 - 0.005), FACE + 0.005],
        rot: [0, 0, sx * 0.6],
      },
      0,
    );
}

/** A framed board on the face: the frame, its ground. */
function board(
  b: ModelBuilder,
  w: number,
  h: number,
  cy: number,
  frame: number,
  ground: number,
): number {
  b.box(w, h, 0.03, frame, { at: [0, cy, FACE + 0.015] }, 0.006);
  b.box(w - 0.06, h - 0.06, 0.004, ground, { at: [0, cy, FACE + 0.031] }, 0);
  return FACE + 0.034;
}

function youAreHere(): Model {
  const b = new ModelBuilder();
  const cy = 0.68;
  // Three floor plans taped over each other, the last one askew.
  sheet(b, -0.05, cy + 0.02, 0.62, 0.46, 0xdedcd2, -0.04);
  sheet(b, 0.04, cy - 0.02, 0.56, 0.42, 0xe8e6dc, 0.05);
  sheet(b, 0, cy, 0.52, 0.4, PAPER, -0.1);
  const f = framed(b, [0, cy, FACE + 0.006], [0, 0, -0.1]);
  f.box(0.66, 0.18, 0.002, TEAL, { at: [0, 0.2, 0] }, 0);
  text(f, 'YOU ARE', 0, 0.24, 0.001, 0.023, WHITE);
  text(f, 'HERE?', 0, 0.16, 0.001, 0.023, WHITE);
  for (const [x, y, w, h] of [
    [-0.12, 0.02, 0.18, 0.14],
    [0.1, 0.04, 0.16, 0.1],
    [-0.02, -0.12, 0.34, 0.06],
  ] as const) {
    f.box(w, 0.006, 0.002, INK, { at: [x, y + h / 2, 0] }, 0);
    f.box(w, 0.006, 0.002, INK, { at: [x, y - h / 2, 0] }, 0);
    f.box(0.006, h, 0.002, INK, { at: [x - w / 2, y, 0] }, 0);
    f.box(0.006, h, 0.002, INK, { at: [x + w / 2, y, 0] }, 0);
  }
  // The red dot, and (PROBABLY) under it.
  f.cylinder(0.022, 0.022, 0.004, RED, { at: [0.04, -0.03, 0.002], rot: [Math.PI / 2, 0, 0] }, 12);

  return b.build();
}

function knownBugs(): Model {
  const b = new ModelBuilder();
  const cy = 0.7;
  const f = board(b, 0.72, 0.58, cy, 0x3a3e45, 0xa88a62);
  b.box(0.42, 0.07, 0.003, RED, { at: [0, cy + 0.19, f] }, 0);
  text(b, 'KNOWN BUGS', 0, cy + 0.19, f + 0.002, 0.0075, WHITE);
  for (let k = 0; k < 8; k++) {
    const x = -0.22 + (k % 3) * 0.22 + (rnd(k, 9) - 0.5) * 0.04;
    const y = cy + 0.07 - Math.floor(k / 3) * 0.12;
    b.box(
      0.1,
      0.1,
      0.003,
      k % 3 === 0 ? 0xe6d064 : 0xe08a8a,
      { at: [x, y, f + 0.001], rot: [0, 0, (rnd(k, 10) - 0.5) * 0.3] },
      0,
    );
    b.box(0.06, 0.006, 0.002, INK, { at: [x, y, f + 0.003] }, 0);
  }
  // A sticky note in the corner: MOVED TO WHICH DESK?
  b.box(0.13, 0.1, 0.003, 0x8ec0dc, { at: [0.22, cy - 0.2, f + 0.002], rot: [0, 0, 0.12] }, 0);
  text(b, 'MOVED?', 0.22, cy - 0.2, f + 0.004, 0.005, INK);
  return b.build();
}

/**
 * A bold poster: one or two big words (`title`, a line each, at `px`), an
 * accent rule under them and a picture (`draw`); no small print, so it
 * reads from the camera.
 */
function poster(
  title: readonly [string, number][],
  ground: number,
  accent: number,
  draw?: (b: ModelBuilder, cy: number, f: number) => void,
): Model {
  const b = new ModelBuilder();
  const cy = 0.68;
  b.box(0.8, 0.78, 0.012, ground, { at: [0, cy, FACE + 0.006] }, 0.004);
  const f = FACE + 0.013;
  let y = cy + 0.29;
  for (const [t, px] of title) {
    y -= px * 2.5;
    text(b, t, 0, y, f, px, WHITE);
    y -= px * 2.5 + 0.035;
  }
  b.box(0.6, 0.016, 0.002, accent, { at: [0, y + 0.01, f] }, 0);
  draw?.(b, cy, f);
  return b.build();
}

const reorgPoster = () =>
  poster(
    [
      ['REORG', 0.03],
      ['3.0', 0.036],
    ],
    TEAL,
    TAPE_YELLOW,
    (b, cy, f) => {
      // Three arrows, aligned (one isn't).
      for (let k = 0; k < 3; k++) {
        const y = cy - 0.15 - k * 0.075;
        const r = k === 2 ? 0.3 : 0;
        b.box(0.34, 0.035, 0.002, WHITE, { at: [-0.02, y, f], rot: [0, 0, r] }, 0);
        b.box(
          0.06,
          0.06,
          0.002,
          WHITE,
          { at: [0.16, y + r * 0.16, f], rot: [0, 0, Math.PI / 4 + r] },
          0,
        );
      }
    },
  );

const changePoster = () =>
  poster([['CHANGE', 0.03]], 0x34495e, TEAL, (b, cy, f) => {
    // A bar chart going up, a sticky note on it: AGAIN?
    for (let k = 0; k < 4; k++)
      b.box(
        0.09,
        0.07 + k * 0.06,
        0.002,
        TEAL,
        { at: [-0.2 + k * 0.12, cy - 0.3 + (0.07 + k * 0.06) / 2, f] },
        0,
      );
    b.box(0.3, 0.16, 0.003, 0xe6d064, { at: [0.12, cy + 0.0, f + 0.002], rot: [0, 0, 0.12] }, 0);
    text(b, 'AGAIN?', 0.12, cy + 0.0, f + 0.004, 0.011, INK);
  });

function orgChart(): Model {
  const b = new ModelBuilder();
  const cy = 0.68;
  sheet(b, 0, cy, 0.66, 0.5);
  const f = FACE + 0.006;
  text(b, 'ORG CHART V6', 0, cy + 0.19, f, 0.0075, INK);
  const node = (x: number, y: number, c: number) =>
    b.box(0.11, 0.06, 0.002, c, { at: [x, y, f] }, 0);
  node(0, cy + 0.1, YOTTA_VIOLET);
  for (const x of [-0.2, 0, 0.2]) {
    node(x, cy - 0.01, 0x8a96a4);
    b.box(0.004, 0.05, 0.002, INK, { at: [x, cy + 0.045, f] }, 0);
    for (const dx of [-0.05, 0.05]) node(x + dx, cy - 0.12, 0xb4bcc6);
  }
  b.box(0.42, 0.004, 0.002, INK, { at: [0, cy + 0.07, f] }, 0);
  // The red pen: arrows, crosses, a circle, ?!
  for (const [x, y, r] of [
    [-0.2, -0.01, 0.6],
    [0.15, -0.12, -0.5],
    [0.25, -0.12, 0.5],
  ] as const) {
    b.box(0.13, 0.008, 0.002, RED, { at: [x, cy + y, f + 0.002], rot: [0, 0, r] }, 0);
    b.box(0.13, 0.008, 0.002, RED, { at: [x, cy + y, f + 0.002], rot: [0, 0, -r] }, 0);
  }
  b.torus(0.07, 0.005, RED, { at: [0, cy - 0.01, f + 0.002] });
  b.box(0.28, 0.008, 0.002, RED, { at: [-0.05, cy - 0.06, f + 0.002], rot: [0, 0, -0.4] }, 0);
  text(b, '?!', 0.26, cy + 0.1, f + 0.002, 0.012, RED);
  return b.build();
}

function thePlan(): Model {
  // A projector screen over two faces: THE PLAN V3, p. 1 of 80.
  const b = new ModelBuilder();
  const cx = 0.5;
  const cy = 0.66;
  b.box(1.5, 0.05, 0.06, 0xd8d8d4, { at: [cx, cy + 0.42, FACE + 0.03] }, 0.012);
  b.box(1.4, 0.74, 0.006, 0xe6e6e2, { at: [cx, cy, FACE + 0.006] }, 0);
  b.screen(1.32, 0.6, 0x1f3a42, { at: [cx, cy + 0.02, FACE + 0.011] });
  const f = FACE + 0.012;
  b.screen(1.32, 0.12, TEAL, { at: [cx, cy + 0.26, f] });
  text(b, 'THE PLAN', cx, cy + 0.26, f + 0.001, 0.022, WHITE);
  // Page one of eighty, big: the reorg's whole joke.
  text(b, 'P. 1/80', cx, cy - 0.06, f + 0.001, 0.044, 0xffd27a);
  b.screen(0.02, 0.4, 0x0f1a20, { at: [cx, cy - 0.38, FACE + 0.006] });
  return b.build();
}

function raci(): Model {
  const b = new ModelBuilder();
  const cy = 0.7;
  const f = board(b, 0.64, 0.56, cy, 0xd8d8d4, 0xe8e8e4);
  text(b, 'WHO OWNS WHAT?', 0, cy + 0.2, f, 0.0075, INK);
  for (let r = 0; r < 4; r++)
    for (let c = 0; c < 4; c++) {
      const x = -0.18 + c * 0.12;
      const y = cy + 0.09 - r * 0.09;
      b.box(0.1, 0.07, 0.002, c === 0 ? 0xc8ccd2 : TEAL, { at: [x, y, f] }, 0);
      if (c > 0) text(b, '?', x, y, f + 0.001, 0.008, WHITE);
    }
  return b.build();
}

function moveSchedule(): Model {
  const b = new ModelBuilder();
  const cy = 0.7;
  const f = board(b, 0.64, 0.58, cy, 0x3a3e45, 0xeaeae4);
  b.box(0.54, 0.07, 0.002, CRATE_BLUE, { at: [0, cy + 0.2, f] }, 0);
  text(b, 'MOVE DAY', 0, cy + 0.2, f + 0.001, 0.009, WHITE);
  const rows: [string, boolean][] = [
    ['09:00 SILOS', true],
    ['11:00 OPEN PLAN', true],
    ['13:00 MATRIX', false],
    ['15:00 SILOS?', false],
  ];
  rows.forEach(([t, done], i) => {
    const y = cy + 0.09 - i * 0.09;
    text(b, t, 0.04, y, f, 0.0068, INK);
    b.box(0.04, 0.04, 0.002, done ? 0x3e9a5a : 0xc8ccd2, { at: [-0.23, y, f] }, 0);
  });
  return b.build();
}

function signOff(): Model {
  const b = new ModelBuilder();
  const cy = 0.7;
  const f = board(b, 0.66, 0.56, cy, 0x3a3e45, 0xa88a62);
  b.box(0.4, 0.07, 0.003, 0x3e8a5a, { at: [0, cy + 0.19, f] }, 0);
  text(b, 'SIGN-OFF', 0, cy + 0.19, f + 0.002, 0.009, WHITE);
  for (let k = 0; k < 4; k++) {
    const x = -0.16 + (k % 2) * 0.3;
    const y = cy + 0.05 - Math.floor(k / 2) * 0.16;
    b.box(
      0.2,
      0.13,
      0.003,
      PAPER,
      { at: [x, y, f + 0.001], rot: [0, 0, (rnd(k, 4) - 0.5) * 0.2] },
      0,
    );
    // APPROVED stamps in red, one PENDING.
    b.box(
      0.13,
      0.04,
      0.002,
      k === 3 ? 0xd09030 : RED,
      { at: [x, y - 0.02, f + 0.003], rot: [0, 0, 0.25] },
      0,
    );
  }
  // The rubber stamp on its shelf.
  b.box(0.14, 0.02, 0.07, 0x3a3e45, { at: [0.2, cy - 0.29, FACE + 0.035] }, 0.004);
  b.box(0.06, 0.03, 0.05, RED, { at: [0.2, cy - 0.265, FACE + 0.035] }, 0.006);
  b.cylinder(0.015, 0.015, 0.05, 0x5a3a2a, { at: [0.2, cy - 0.225, FACE + 0.035] }, 10);
  return b.build();
}

function hotDeskRules(): Model {
  const b = new ModelBuilder();
  const cy = 0.7;
  sheet(b, 0, cy, 0.52, 0.64);
  const f = FACE + 0.006;
  b.box(0.46, 0.07, 0.002, TAPE_YELLOW, { at: [0, cy + 0.24, f] }, 0);
  text(b, 'HOT DESK RULES', 0, cy + 0.24, f + 0.001, 0.0068, INK);
  ['1. NO DESK IS', '   YOURS', '2. NOT EVEN', '   THAT ONE', '3. SEE RULE 1'].forEach((t, i) => {
    text(b, t, 0, cy + 0.13 - i * 0.07, f, 0.0062, INK);
  });
  return b.build();
}

function clock(): Model {
  const b = new ModelBuilder();
  const cy = 0.78;
  const r: [number, number, number] = [Math.PI / 2, 0, 0];
  b.cylinder(0.2, 0.2, 0.04, 0xd8d8d4, { at: [0, cy, FACE + 0.02], rot: r }, 28);
  b.cylinder(0.175, 0.175, 0.004, 0xf2f0ea, { at: [0, cy, FACE + 0.041], rot: r }, 28);
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2;
    b.box(
      0.01,
      k % 3 ? 0.018 : 0.035,
      0.003,
      INK,
      { at: [Math.sin(a) * 0.145, cy + Math.cos(a) * 0.145, FACE + 0.044], rot: [0, 0, -a] },
      0,
    );
  }
  const hand = (len: number, a: number, w: number) =>
    b.box(
      w,
      len,
      0.003,
      INK,
      {
        at: [Math.sin(a) * len * 0.5, cy + Math.cos(a) * len * 0.5, FACE + 0.046],
        rot: [0, 0, -a],
      },
      0,
    );
  // Twenty to eleven: an hour and twenty to the next reorg.
  hand(0.08, ((10 + 40 / 60) / 12) * Math.PI * 2, 0.016);
  hand(0.13, (40 / 60) * Math.PI * 2, 0.01);
  b.box(0.14, 0.1, 0.003, 0xe6d064, { at: [0.16, cy - 0.2, FACE + 0.004], rot: [0, 0, -0.15] }, 0);
  text(b, 'MOVE IN 5', 0.16, cy - 0.2, FACE + 0.006, 0.0042, INK);
  return b.build();
}

function wrappedPortrait(): Model {
  // Mom's portrait from yesterday's boardroom, still on its hook, in bubble wrap and FRAGILE tape.
  const b = new ModelBuilder();
  const cy = 0.7;
  b.box(0.48, 0.58, 0.03, 0xa8864a, { at: [0, cy, FACE + 0.015] }, 0.008);
  b.box(0.4, 0.5, 0.004, 0x35503f, { at: [0, cy, FACE + 0.031] }, 0);
  b.cylinder(
    0.08,
    0.08,
    0.004,
    0xe2b896,
    { at: [0, cy + 0.05, FACE + 0.034], rot: [Math.PI / 2, 0, 0] },
    16,
  );
  b.box(0.28, 0.16, 0.004, 0x6a4a7a, { at: [0, cy - 0.14, FACE + 0.034] }, 0.02);
  for (let k = 0; k < 12; k++)
    b.sphere(
      0.07,
      0xc8d6de,
      { at: [-0.18 + (k % 4) * 0.12, cy + 0.2 - Math.floor(k / 4) * 0.2, FACE + 0.05] },
      [1, 1, 0.3],
    );
  b.box(0.56, 0.06, 0.006, RED, { at: [0, cy, FACE + 0.075], rot: [0, 0, 0.35] }, 0);
  text(b, 'FRAGILE', 0, cy, FACE + 0.079, 0.007, WHITE);
  b.box(0.3, 0.06, 0.004, PAPER, { at: [0, cy - 0.34, FACE + 0.003] }, 0);
  text(b, 'MOM - DO NOT', 0, cy - 0.33, FACE + 0.006, 0.0045, INK);
  text(b, 'SHRED', 0, cy - 0.35, FACE + 0.006, 0.0045, RED);
  return b.build();
}

function deskVinyl(): Model {
  // White vinyl on the glass: YOUR NEW DESK →, the arrow crossed out and redrawn twice.
  const b = new ModelBuilder();
  const y = 0.84;
  text(b, 'YOUR NEW DESK', 0, y, FACE + 0.002, 0.009, WHITE, 0.003);
  for (let k = 0; k < 3; k++) {
    const yy = y - 0.1 - k * 0.07;
    b.box(
      0.3,
      0.02,
      0.003,
      k === 2 ? TAPE_YELLOW : WHITE,
      { at: [0, yy, FACE + 0.002], rot: [0, 0, k === 1 ? Math.PI : 0] },
      0,
    );
    if (k < 2) b.box(0.32, 0.008, 0.003, RED, { at: [0, yy, FACE + 0.004], rot: [0, 0, 0.3] }, 0);
  }
  return b.build();
}

function mindTurnstile(): Model {
  const b = new ModelBuilder();
  const cy = 0.74;
  b.box(0.52, 0.34, 0.012, TAPE_YELLOW, { at: [0, cy, FACE + 0.006] }, 0.004);
  b.box(0.48, 0.3, 0.002, 0x2a2c30, { at: [0, cy, FACE + 0.013] }, 0);
  text(b, 'MIND THE', 0, cy + 0.07, FACE + 0.015, 0.011, TAPE_YELLOW);
  text(b, 'TURNSTILE', 0, cy, FACE + 0.015, 0.011, TAPE_YELLOW);
  text(b, 'IT CHANGED SIDES', 0, cy - 0.08, FACE + 0.015, 0.0055, WHITE);
  return b.build();
}

function lobbyDirectory(): Model {
  const b = new ModelBuilder();
  const cy = 0.72;
  b.box(0.54, 0.5, 0.03, 0x2a2d33, { at: [0, cy, FACE + 0.015] }, 0.006);
  const f = FACE + 0.031;
  text(b, 'FLOOR 40', 0, cy + 0.17, f, 0.0095, WHITE);
  // YOTTA in steel letters, the new lowercase one on a paper over it.
  text(b, 'YOTTA', 0, cy + 0.07, f, 0.012, STEEL);
  b.box(0.3, 0.09, 0.004, PAPER, { at: [0.04, cy + 0.03, f + 0.002], rot: [0, 0, -0.08] }, 0);
  lower(b, 0.04, cy + 0.03, f + 0.005, 0.011, YOTTA_VIOLET);
  text(b, 'GOODS LIFT >', 0, cy - 0.1, f, 0.0068, 0xc9d4e0);
  text(b, 'BADGE IN <', 0, cy - 0.17, f, 0.0068, 0xc9d4e0);
  return b.build();
}

/** The lowercase `yotta.` in its own pixel glyphs (the shared font has capitals only), centred on (x, y). */
const LOWER: Readonly<Record<string, string>> = {
  y: '000101101011001110',
  o: '000000111101101111',
  t: '010111010010010011',
  a: '000000011101101011',
  '.': '000000000000000010',
};
export function lower(
  b: ModelBuilder,
  x: number,
  y: number,
  z: number,
  px: number,
  color: number,
  s = 'yotta.',
): void {
  const cols = s.length * 4 - 1;
  for (let k = 0; k < s.length; k++) {
    const g = LOWER[s.charAt(k)] ?? '';
    for (let r = 0; r < 6; r++)
      for (let c = 0; c < 3; c++)
        if (g[r * 3 + c] === '1')
          b.box(
            px,
            px,
            0.002,
            color,
            { at: [x + (k * 4 + c + 0.5 - cols / 2) * px, y + (2.5 - r) * px, z + 0.001] },
            0,
          );
  }
}

/** How much bigger than life the art hangs, so it reads from the camera. */
const ART_GROW = 1.32;
function grown(model: Model, s: number, cy: number): Model {
  const m = new THREE.Matrix4()
    .makeTranslation(0, cy, FACE)
    .multiply(new THREE.Matrix4().makeScale(s, s, 1))
    .multiply(new THREE.Matrix4().makeTranslation(0, -cy, -FACE));
  for (const g of [model.body, model.glow, model.glass]) g?.applyMatrix4(m);
  return model;
}

/** Every face model, by its name in the plan. */
export const REORG_ART_MODELS: Readonly<Record<ReorgArt, () => Model>> = {
  youAreHere: () => grown(youAreHere(), ART_GROW, 0.68),
  knownBugs: () => grown(knownBugs(), ART_GROW, 0.68),
  reorgPoster: () => grown(reorgPoster(), 1.15, 0.68),
  orgChart: () => grown(orgChart(), ART_GROW, 0.68),
  // Scaled into its two faces.
  thePlan: () => {
    const m = thePlan();
    const t = new THREE.Matrix4()
      .makeTranslation(0.5, 0.66, FACE)
      .multiply(new THREE.Matrix4().makeScale(0.68, 0.68, 1))
      .multiply(new THREE.Matrix4().makeTranslation(-0.5, -0.66, -FACE));
    for (const g of [m.body, m.glow, m.glass]) g?.applyMatrix4(t);
    return m;
  },
  raci: () => grown(raci(), ART_GROW, 0.68),
  moveSchedule: () => grown(moveSchedule(), ART_GROW, 0.68),
  signOff: () => grown(signOff(), ART_GROW, 0.68),
  hotDeskRules: () => grown(hotDeskRules(), 1.15, 0.68),
  clock: () => grown(clock(), 1.3, 0.74),
  wrappedPortrait: () => grown(wrappedPortrait(), 1.1, 0.68),
  changePoster: () => grown(changePoster(), 1.15, 0.68),
  deskVinyl,
  mindTurnstile: () => grown(mindTurnstile(), 1.2, 0.72),
  lobbyDirectory: () => grown(lobbyDirectory(), 1.2, 0.72),
};

// ---- The story at the doors ----

/** How high the handover desk's sign stands at most (the wall's own height). */
export const HANDOVER_TOP = WALL_HEIGHT;

/**
 * The consultant's handover desk behind the inbox, in the back wall's line
 * (built facing the room, behind the station: z ≤ −0.4): a desk with a teal
 * HANDOVER sign on a post, binders, a stack of numbered envelopes, a
 * laptop showing a slide. Tickets come off it.
 */
export function handoverDeskModel(span: number): Model {
  const b = new ModelBuilder();
  const w = span;
  const z = -0.72;
  const top = 0.62;
  b.box(w * 0.9, 0.04, 0.5, 0xc8ccd0, { at: [0, top - 0.02, z] }, 0.01);
  for (const s of [-1, 1])
    b.box(
      0.04,
      top - 0.04,
      0.44,
      STEEL_DARK,
      { at: [s * (w * 0.45 - 0.04), (top - 0.04) / 2, z] },
      0,
    );
  // Binders standing in a row.
  [0x3c4a6a, TEAL, 0x6a7380, TEAL, YOTTA_VIOLET].forEach((c, k) =>
    b.box(0.06, 0.26, 0.22, c, { at: [-w * 0.42 + 0.06 + k * 0.07, top + 0.13, z - 0.08] }, 0.008),
  );
  // Numbered envelopes in a stack.
  for (let k = 0; k < 5; k++)
    b.box(
      0.26,
      0.016,
      0.18,
      k % 2 ? 0xd8c8a0 : 0xe2d4ae,
      { at: [0.02, top + 0.01 + k * 0.017, z + 0.02], rot: [0, (k - 2) * 0.08, 0] },
      0,
    );
  // The laptop showing a slide.
  const lx = w * 0.28;
  b.box(0.28, 0.014, 0.2, 0xa6acb3, { at: [lx, top + 0.007, z + 0.04] }, 0.006);
  b.box(0.28, 0.18, 0.012, 0xa6acb3, { at: [lx, top + 0.1, z - 0.06], rot: [-0.2, 0, 0] }, 0.006);
  b.screen(0.25, 0.15, 0x1f3a42, { at: [lx, top + 0.1, z - 0.052], rot: [-0.2, 0, 0] });
  b.screen(0.25, 0.04, TEAL, { at: [lx, top + 0.15, z - 0.05], rot: [-0.2, 0, 0] });
  // The sign on its post, leaning back a touch.
  b.box(
    0.03,
    HANDOVER_TOP - 0.2 - top,
    0.03,
    STEEL_DARK,
    { at: [-w * 0.05, top + (HANDOVER_TOP - 0.2 - top) / 2, z - 0.18] },
    0,
  );
  const s = framed(b, [-w * 0.05, HANDOVER_TOP - 0.11, z - 0.17], [-0.3, 0, 0]);
  s.box(Math.min(0.9, w * 0.48), 0.18, 0.02, TEAL, {}, 0.006);
  text(s, 'HANDOVER', 0, 0.01, 0.011, 0.014, WHITE);
  return b.build();
}

/** The shredding console's top height: below the side glass's head. */
export const SHREDDER_H = 0.82;

/**
 * The confidential shredding console behind the bin (its origin at the
 * bin's outer edge, built facing +z): a grey bin with a locked slot and a
 * CONFIDENTIAL – ORG CHARTS label, a pile of old org charts on the floor
 * beside it waiting their turn.
 */
export function shredderModel(): Model {
  const b = new ModelBuilder();
  b.box(0.32, SHREDDER_H - 0.04, 0.3, 0x4a5058, { at: [0, (SHREDDER_H - 0.04) / 2, 0] }, 0.02);
  b.box(0.34, 0.04, 0.32, 0x3a3e45, { at: [0, SHREDDER_H - 0.02, 0] }, 0.01);
  b.box(0.2, 0.012, 0.03, DARK, { at: [0, SHREDDER_H + 0.001, 0.04] }, 0);
  b.box(0.26, 0.16, 0.004, PAPER, { at: [0, SHREDDER_H - 0.2, 0.152] }, 0);
  text(b, 'CONFIDENTIAL', 0, SHREDDER_H - 0.17, 0.155, 0.0065, RED);
  text(b, 'ORG CHARTS', 0, SHREDDER_H - 0.23, 0.155, 0.0065, INK);
  b.box(0.04, 0.06, 0.02, 0xc8a040, { at: [0.11, SHREDDER_H - 0.08, 0.152] }, 0.006);
  // Org charts stacked and slumped beside it, one sticking out of the slot.
  for (let k = 0; k < 7; k++)
    b.box(
      0.3,
      0.025,
      0.22,
      k % 2 ? PAPER : 0xe2e0d6,
      { at: [0.02 + (k % 3) * 0.01, 0.012 + k * 0.026, 0.3], rot: [0, (k - 3) * 0.09, 0] },
      0,
    );
  b.box(0.18, 0.004, 0.12, YOTTA_VIOLET, { at: [0.02, 0.2, 0.3], rot: [0, 0.2, 0] }, 0);
  b.box(0.16, 0.12, 0.004, PAPER, { at: [0, SHREDDER_H + 0.05, 0.04], rot: [-0.1, 0, 0.05] }, 0);
  return b.build();
}

/** How tall the goods lift's frame stands at most (the front strip's 0.6). */
export const LIFT_MAX_H = 0.58;

/**
 * The goods lift round the ship, in the lobby's front wall (origin at the
 * ship's middle, built with +z to the outside): brushed-steel jambs on the
 * wall tiles either side, cut down low, a steel lintel strip along the
 * room-side edge of the ship with the doors' track, the SHIPPED ↓
 * indicator lit on the left jamb facing the camera, the call button and the
 * floor counter on the right one, the small `yotta.` vinyl on the jamb.
 */
export function goodsLiftModel(span: number): Model {
  const b = new ModelBuilder();
  const h = 0.4;
  const jx = span / 2 + 0.22;
  for (const s of [-1, 1]) {
    const x = s * jx;
    b.box(0.4, h, 0.7, STEEL_DARK, { at: [x, h / 2, -0.05] }, 0.012);
    b.box(0.36, 0.02, 0.66, BRUSHED, { at: [x, h + 0.01, -0.05] }, 0.004);
    for (let k = 0; k < 5; k++)
      b.box(
        0.004,
        h - 0.06,
        0.002,
        tint(STEEL_DARK, 0.25),
        {
          at: [x - 0.12 + k * 0.06, h / 2, -0.401],
        },
        0,
      );
    // Its brushed face toward the lift doors.
    b.box(0.02, h - 0.04, 0.6, BRUSHED, { at: [x - s * 0.205, h / 2, -0.05] }, 0);
  }
  // The doors' track and the scuffed steel threshold along the ship's room-side edge.
  b.box(span + 0.04, 0.014, 0.08, BRUSHED, { at: [0, 0.007, -0.46] }, 0);
  b.box(span + 0.04, 0.006, 0.02, DARK, { at: [0, 0.015, -0.46] }, 0);
  // SHIPPED and a down arrow over the left jamb, leaning back to the camera.
  const ind = framed(b, [-jx, h + 0.1, -0.2], [-0.5, 0, 0]);
  ind.box(0.36, 0.16, 0.05, DARK, {}, 0.01);
  ind.screen(0.32, 0.12, 0x10201a, { at: [0, 0, 0.026] });
  text(ind, 'SHIPPED', -0.04, 0.0, 0.027, 0.0075, 0x6ef08a);
  for (let r = 0; r < 4; r++)
    ind.screen(0.01 + (3 - r) * 0.011, 0.011, 0x6ef08a, { at: [0.12, 0.03 - r * 0.018, 0.028] });
  // The call button, the floor counter at 40, the small yotta. on the right jamb's top.
  const pan = framed(b, [jx, h + 0.06, -0.2], [-0.5, 0, 0]);
  pan.box(0.3, 0.1, 0.03, STEEL, {}, 0.008);
  pan.screen(0.1, 0.06, 0x2a1010, { at: [-0.07, 0, 0.016] });
  text(pan, '40', -0.07, 0, 0.017, 0.0075, 0xff8a5a);
  pan.led(0.018, 0x6ef08a, { at: [0.08, 0, 0.02] });
  lower(b, jx, h + 0.021, -0.02, 0.009, YOTTA_VIOLET);
  return b.build();
}

// ---- The uplighters ----

const BRONZE = 0x4a4036;
/** How far the uplighter's bowl stands out from the face, at most. */
export const UPLIGHTER_OUT = 0.2;

/**
 * A bronze wall-washer on a back face's top (its origin on the head track's
 * front edge, the room on +z): a clamp over the track, a short arm, a
 * shallow trough just in front of the face's top with its warm diffuser lit
 * along the open top (the camera looks down into it). Nothing hangs over
 * the floor.
 */
export function reorgUplighterModel(): Model {
  const b = new ModelBuilder();
  b.box(0.1, 0.02, 0.09, BRONZE, { at: [0, 0.012, -0.03] }, 0.004);
  b.box(0.1, 0.07, 0.016, BRONZE, { at: [0, -0.025, 0.01] }, 0.004);
  b.box(0.03, 0.024, 0.08, BRONZE, { at: [0, -0.05, 0.06] }, 0.004);
  // The trough, its rim a hair lighter, the diffuser lit along its top.
  b.box(0.42, 0.06, 0.1, BRONZE, { at: [0, -0.06, 0.14] }, 0.012);
  b.box(0.43, 0.01, 0.11, tint(BRONZE, 0.2), { at: [0, -0.028, 0.14] }, 0.003);
  for (const s of [-1, 1])
    b.box(0.014, 0.064, 0.104, tint(BRONZE, -0.3), { at: [s * 0.21, -0.06, 0.14] }, 0.004);
  b.add(new THREE.BoxGeometry(0.38, 0.006, 0.07), 0xfff0d8, { at: [0, -0.024, 0.14] }, 'glow');
  return b.build();
}

// ---- The art panels ----

/** The art panel's grey (the theme's face: darker than 4-1's and 4-2's, so the stations lead). */
const PANEL = WALL_COLORS.reorg.face;
const PANEL_PLINTH = tint(PANEL, -0.18);

/**
 * A solid partition panel where the consultants' art hangs, in this
 * floor's own grey: a darker plinth with an aluminium shoe, the panel with
 * a slim dark frame at its corners and a shadow joint, under the tower's
 * head track (the same line along the top as the glass beside it).
 */
export function reorgPanelModel(): Model {
  const b = new ModelBuilder();
  b.box(1.012, 0.09, 1.012, PANEL_PLINTH, { at: [0, 0.045, 0] }, 0);
  b.box(1.004, 0.012, 1.004, tint(PANEL_PLINTH, -0.5), { at: [0, 0.006, 0] }, 0);
  b.box(1.016, 0.03, 1.016, 0x8a9198, { at: [0, 0.105, 0] }, 0);
  const g0 = 0.12;
  const g1 = WALL_HEIGHT - 0.04;
  b.box(0.98, g1 - g0, 0.98, PANEL, { at: [0, (g0 + g1) / 2, 0] }, 0);
  for (const z of [-0.5, 0.5]) {
    b.box(0.04, g1 - g0, 0.014, MULLION, { at: [-0.48, (g0 + g1) / 2, z] }, 0);
    b.box(0.006, g1 - g0 - 0.04, 0.004, tint(PANEL, -0.14), { at: [0.3, (g0 + g1) / 2, z] }, 0);
  }
  // The head track: an aluminium lip proud of the faces, the cap's infill flush in it.
  const h = WALL_HEIGHT;
  b.box(1.02, 0.03, 1.02, HEAD_TRACK, { at: [0, h - 0.019, 0] }, 0);
  b.box(1.016, 0.005, 1.016, tint(HEAD_TRACK, -0.45), { at: [0, h - 0.0365, 0] }, 0);
  b.box(1.0, 0.012, 1.0, WALL_COLORS.reorg.top, { at: [0, h - 0.006, 0] }, 0);
  b.box(1.0, 0.004, 0.026, HEAD_TRACK, { at: [0, h + 0.002, 0] }, 0);
  return b.build();
}

/** The theme's colors, for the tests. */
export const REORG_STATIC_COLORS = [
  ACCESS,
  LOBBY_STONE,
  MAT,
  TABLE_TOP,
  BADGE_CAP,
  CARPET,
  CARDBOARD,
  HEAD_TRACK,
  MULLION,
] as const;

// ---- The lobby's wall brackets ----

/** How high the lobby brackets' lamps sit (the Light track's cool accents, 1.7). */
export const BRACKET_Y = 1.7;

/**
 * A wall bracket for the lobby's cool light, on a pier's top (its origin
 * there, the room on +x before it's turned): a slim steel post up from the
 * top, an arm reaching into the lobby, a cool cylinder lamp on its end.
 */
export function lobbyBracketModel(): Model {
  const b = new ModelBuilder();
  const post = BRACKET_Y - WALL_HEIGHT;
  b.box(0.08, 0.016, 0.08, STEEL_DARK, { at: [0, 0.008, 0] }, 0.004);
  b.box(0.026, post + 0.04, 0.026, STEEL_DARK, { at: [0, (post + 0.04) / 2, 0] }, 0.004);
  b.box(0.5, 0.022, 0.022, STEEL_DARK, { at: [0.25, post + 0.04, 0] }, 0.004);
  b.cylinder(0.05, 0.06, 0.12, 0xd8dce2, { at: [0.5, post, 0] }, 14);
  b.add(
    new THREE.CylinderGeometry(0.048, 0.048, 0.006, 14),
    0xe6f0ff,
    { at: [0.5, post - 0.062, 0] },
    'glow',
  );
  return b.build();
}
