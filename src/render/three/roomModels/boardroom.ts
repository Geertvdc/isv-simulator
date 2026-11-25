import * as THREE from 'three';
import { tileHash } from '../../mapShape';
import { type Model, ModelBuilder, type Place, tint } from '../kit';
import { FRONT_WALL_HEIGHT, STATION_HEIGHT, WALL_HEIGHT } from '../layout';
import { FLOOR_COLORS, WALL_COLORS } from '../look';
import {
  BOARDROOM_FLOORS,
  BOARDROOM_WEAR,
  BOARDROOM_WEAR_KINDS,
  type BoardroomArt,
  type BoardroomFloor,
  type PendantRow,
  STUB_LOOKS,
  type StubScene,
  stubSwap,
  walnutSwap,
} from '../rooms/boardroomRoom';
import type { CounterRun } from '../rooms/counterRun';
import { STICKY } from '../setDressing/boardroomWallTops';
import type { StationModel } from '../stationModels';
import { framed, text } from './basement';
import { DOT_VIOLET, HEAD_TRACK, MULLION, TOWER_SWAP_MODELS, YOTTA_VIOLET } from './tower';

/**
 * YOTTA Tower's boardroom floor (wall theme `boardroom`, floor theme
 * `boardroomFloors`; see `docs/plan/synergy-environment.md`), built in code
 * on the tower's kit (its glass partitions and curtain wall): walnut panels
 * where art hangs on the reception's glass, the low walnut stubs with a
 * dark stone cap, the good carpet (deep charcoal, a violet border band
 * pinned in brass), the sides' warmer slate carpet and its wear, the
 * corridor's warm terrazzo, brass thresholds; walnut credenzas; the art
 * (the synergy matrix under its picture light, the board's portraits, Mom
 * among them, the agenda, a clock at twenty to four, the brass plaques,
 * vinyl and sticky notes on the glass, the KNOWN BUGS board, the ops
 * status screen); the stubs' scenes (the IDEAS board, HOW MIGHT WE…, Prod
 * as the parking lot, the name cards); the workshop's sticky-note wall
 * over the inbox, the PARKED box at the bin, the deploy desk at the ship;
 * the pendants' wire.
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

// ---- Materials ----

/** Walnut veneer: dark and fine, never warmer than a station. */
export const WALNUT = 0x5a3e2c;
const WALNUT_LIGHT = 0x6c4c37;
const WALNUT_DARK = 0x3f2a1e;
/** The dark stone of the stubs' caps and the panels' plinths. */
export const STONE = 0x5e5c59;
const STONE_DARK = 0x45433f;
const BRASS = 0xb08a4a;
const INK = 0x24272c;
const WHITE = 0xf1f2f4;
const BLACK = 0x18191c;
const STEEL = 0xa3abb2;
const STEEL_DARK = 0x5f676f;
const RED = 0xc0302a;
const sticky = (k: number) =>
  STICKY[((k % STICKY.length) + STICKY.length) % STICKY.length] ?? 0xe6d064;
/** A deterministic 0..1 from two counters. */
const rnd = (a: number, b: number) => (tileHash(a * 7 + 3, b * 13 + 5) % 997) / 997;

/** A face's front (the wall's +z face) and a small standoff. */
const FACE = 0.506;

// ---- The walls ----

/** The head track over a wall `h` tall: a lip round it and the cap's infill (`cap`). */
function head(b: ModelBuilder, h: number, cap: number, lip: number, lipH = 0.03): void {
  b.box(1.02, lipH, 1.02, lip, { at: [0, h - 0.004 - lipH / 2, 0] }, 0);
  b.box(0.96, 0.006, 0.96, cap, { at: [0, h - 0.002, 0] }, 0);
}

/**
 * A walnut panel in the reception's glass line where art hangs: book-matched
 * veneer flitches (faint, a shade apart) between shadow joints on a dark
 * stone plinth, under the partitions' head track.
 */
function walnutPanelModel(along: 'x' | 'z'): Model {
  const b = new ModelBuilder();
  b.box(1.0, 0.09, 1.0, STONE_DARK, { at: [0, 0.045, 0] }, 0);
  b.box(1.004, 0.01, 1.004, tint(STONE_DARK, 0.25), { at: [0, 0.095, 0] }, 0);
  const y0 = 0.1;
  const y1 = WALL_HEIGHT - 0.04;
  b.box(0.98, y1 - y0, 0.98, WALNUT, { at: [0, (y0 + y1) / 2, 0] }, 0);
  const on = (u: number, y: number, f: number): Place => {
    const s = f === 0 ? 1 : -1;
    return { at: [u * s, y, s * 0.491], rot: [0, f === 0 ? 0 : Math.PI, 0] };
  };
  for (const f of [0, 1]) {
    for (let k = 0; k < 4; k++)
      b.box(
        0.24,
        y1 - y0 - 0.02,
        0.003,
        k % 2 ? WALNUT_LIGHT : tint(WALNUT, 0.06),
        on(-0.36 + k * 0.24, (y0 + y1) / 2, f),
        0,
      );
    for (const u of [-0.24, 0, 0.24])
      b.box(0.004, y1 - y0, 0.004, WALNUT_DARK, on(u, (y0 + y1) / 2, f), 0);
    // The grain: long faint streaks.
    for (let k = 0; k < 6; k++)
      b.box(
        0.003,
        0.3 + rnd(k, f) * 0.4,
        0.004,
        tint(WALNUT, -0.18),
        on(-0.42 + k * 0.17, 0.3 + rnd(f, k) * 0.4, f),
        0,
      );
    // A brushed-steel reveal at the foot.
    b.box(0.98, 0.012, 0.004, STEEL_DARK, on(0, y0 + 0.02, f), 0);
  }
  for (const s of [-1, 1])
    b.box(
      0.04,
      y1 - y0,
      0.04,
      MULLION,
      { at: along === 'x' ? [s * 0.49, (y0 + y1) / 2, 0] : [0, (y0 + y1) / 2, s * 0.49] },
      0,
    );
  head(b, WALL_HEIGHT, 0x4c4d50, HEAD_TRACK);
  return b.build();
}

/**
 * A low stub in the boardroom's back line: walnut on a dark kick under a
 * dark honed-stone cap with a slim lip (never a pale slab), a brushed
 * reveal under it; each look its own flitch joint.
 */
function stubModel(look: number): Model {
  const b = new ModelBuilder();
  const h = FRONT_WALL_HEIGHT;
  b.box(1.0, 0.03, 1.0, STONE_DARK, { at: [0, 0.015, 0] }, 0);
  b.box(0.98, h - 0.06, 0.98, WALNUT, { at: [0, 0.03 + (h - 0.06) / 2, 0] }, 0);
  for (const s of [1, -1]) {
    b.box(0.004, h - 0.07, 0.004, WALNUT_DARK, { at: [(look - 1) * 0.3, h / 2, s * 0.491] }, 0);
    b.box(0.98, 0.006, 0.004, STEEL_DARK, { at: [0, h - 0.034, s * 0.491] }, 0);
  }
  b.box(1.03, 0.03, 1.03, STONE, { at: [0, h - 0.015, 0] }, 0.006);
  b.box(1.0, 0.003, 1.0, tint(STONE, 0.06), { at: [0, h + 0.0005, 0] }, 0);
  return b.build();
}

/** The wall in the theme's own look, where the plan gives no swap: a low stub or a walnut panel. */
export function boardroomWallModel(
  piece: 'wall' | 'wall-front' | 'wall-inner',
  look: number,
): Model {
  if (piece === 'wall-front') return stubModel(look % STUB_LOOKS);
  return walnutPanelModel('x');
}

/** Every wall swap model: the tower's, and the floor's own walnut panels and stubs. */
export const BOARDROOM_SWAP_MODELS: Readonly<Record<string, () => Model>> = (() => {
  const out: Record<string, () => Model> = { ...TOWER_SWAP_MODELS };
  out[walnutSwap('x')] = () => walnutPanelModel('x');
  out[walnutSwap('z')] = () => walnutPanelModel('z');
  for (let l = 0; l < STUB_LOOKS; l++) out[stubSwap(l)] = () => stubModel(l);
  return out;
})();

// ---- The floors ----

/** Variants a tile comes in, picked by its hash. */
const VARIANTS = 3;
/** Every floor look, for the tests. */
export const BOARDROOM_FLOOR_LOOKS = BOARDROOM_WEAR_KINDS * VARIANTS;

/** A floor look: its wear and its variant. */
export function boardroomLook(x: number, y: number, wear: number): number {
  const variant = (tileHash(x + 19, y + 31) >>> 4) % VARIANTS;
  return wear * VARIANTS + variant;
}

/** A tile's brightness: ±4% per tile, picked by the tile and the level. */
export function boardroomTone(x: number, y: number, salt: number): number {
  const own = ((Math.imul(x + 67, 73856093) ^ Math.imul(y + 17, 19349663) ^ salt) >>> 0) % 1001;
  return 1 + (own / 1000 - 0.5) * 0.08;
}

/** The sides' warm slate broadloom and its alternate, a violet and a warm fleck. */
export const SLATE = FLOOR_COLORS.boardroomFloors[0];
const SLATE_ALT = FLOOR_COLORS.boardroomFloors[1];
const FLECK_VIOLET = 0x7a6eaa;
const FLECK_WARM = 0x857868;
/** The good carpet: deep charcoal with a violet cast, its border band and the brass pin line. */
export const GOOD_CARPET = 0x4c4854;
export const BORDER = 0x544a70;
const PIN = 0x8a7652;
/** The corridor's warm terrazzo (darker than every station top), its chips and brass strips. */
export const TERRAZZO = 0x958e86;
const CHIPS = [0xa0968a, 0x7d766e, 0x8e8898, 0xa69c8e, 0x6f6a64] as const;
const WALK_LINE = mix(TERRAZZO, 0x736d66, 0.75);

/** A flat mark `w` × `d` on the floor at (x, z), `y` up, turned `turn`. */
function mark(
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

interface Area {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}
const WHOLE: Area = { x0: -0.5, x1: 0.5, z0: -0.5, z1: 0.5 };
const inArea = (a: Area, u: number, v: number): [number, number] => [
  a.x0 + 0.04 + (a.x1 - a.x0 - 0.08) * u,
  a.z0 + 0.04 + (a.z1 - a.z0 - 0.08) * v,
];

/** Broadloom over an area: its base, the pile's faint rows, flecks. */
function broadloom(
  b: ModelBuilder,
  a: Area,
  base: number,
  flecks: readonly number[],
  variant: number,
  rows = 0.125,
): void {
  const w = a.x1 - a.x0;
  const d = a.z1 - a.z0;
  b.box(w, 0.012, d, base, { at: [(a.x0 + a.x1) / 2, -0.006, (a.z0 + a.z1) / 2] }, 0);
  const row = tint(base, -0.035);
  for (let z = a.z0 + rows / 2; z < a.z1; z += rows)
    mark(b, w, 0.018, row, (a.x0 + a.x1) / 2, z, 0.0008);
  for (let k = 0; k < Math.round(10 * w * d); k++) {
    const [x, z] = inArea(a, rnd(variant * 31 + k, 3), rnd(variant * 31 + k, 7));
    const c =
      k % 4 < flecks.length
        ? (flecks[k % 4] ?? base)
        : k % 2
          ? tint(base, 0.12)
          : tint(base, -0.12);
    mark(b, 0.014, 0.014, c, x, z, 0.0016);
  }
}

/** Terrazzo over an area: its base, the chips, brass strips at its −x and −z tile edges. */
function terrazzo(b: ModelBuilder, a: Area, variant: number): void {
  const w = a.x1 - a.x0;
  const d = a.z1 - a.z0;
  b.box(w, 0.012, d, TERRAZZO, { at: [(a.x0 + a.x1) / 2, -0.006, (a.z0 + a.z1) / 2] }, 0);
  for (let k = 0; k < Math.round(30 * w * d); k++) {
    const [x, z] = inArea(a, rnd(variant * 17 + k, 11), rnd(variant * 17 + k, 17));
    const s = 0.016 + rnd(variant + k, 23) * 0.022;
    mark(
      b,
      s,
      s * 0.8,
      CHIPS[k % CHIPS.length] ?? TERRAZZO,
      x,
      z,
      0.0014,
      rnd(variant + k, 29) * 3,
    );
  }
  if (a.x0 <= -0.5) mark(b, 0.01, d, tint(PIN, -0.1), -0.495, (a.z0 + a.z1) / 2, 0.0022);
  if (a.z0 <= -0.5) mark(b, w, 0.01, tint(PIN, -0.1), (a.x0 + a.x1) / 2, -0.495, 0.0022);
}

function surface(b: ModelBuilder, f: BoardroomFloor, a: Area, variant: number): void {
  if (f === 'terrazzo') terrazzo(b, a, variant);
  else if (f === 'boardroom') broadloom(b, a, GOOD_CARPET, [tint(GOOD_CARPET, 0.1)], variant, 0.08);
  else broadloom(b, a, SLATE, [FLECK_VIOLET, FLECK_WARM], variant);
}

/** Short dashes, a few: heel scuffs or pile rubbed the wrong way. */
function scuffs(b: ModelBuilder, variant: number, color: number): void {
  for (let k = 0; k < 5; k++) {
    const [x, z] = inArea(WHOLE, rnd(variant + k, 41), rnd(variant + k, 43));
    mark(
      b,
      0.05 + rnd(variant + k, 47) * 0.05,
      0.008,
      color,
      x,
      z,
      0.0026,
      rnd(variant + k, 53) * 3,
    );
  }
}

/** A sticky note lost on the carpet near a corner, sometimes two. */
function strayNotes(b: ModelBuilder, variant: number): void {
  const corner = variant % 4;
  const sx = corner % 2 ? 1 : -1;
  const sz = corner < 2 ? 1 : -1;
  mark(b, 0.11, 0.11, sticky(variant + 1), sx * 0.34, sz * 0.32, 0.003, 0.5 + variant);
  mark(b, 0.03, 0.006, tint(INK, 0.3), sx * 0.36, sz * 0.34, 0.0045, 0.5 + variant);
  if (variant !== 1)
    mark(b, 0.11, 0.11, sticky(variant + 3), sx * 0.2, sz * 0.38, 0.0028, -0.3 - variant);
}

/**
 * A floor tile (`look` from `boardroomLook`): the sides' slate and its wear,
 * the boardroom's good carpet with its border band on the edges (a brass
 * pin line inside it), the corridor's terrazzo, the thresholds.
 */
export function boardroomFloorModel(look: number): Model {
  const variant = look % VARIANTS;
  const wear = Math.floor(look / VARIANTS) % BOARDROOM_WEAR_KINDS;
  const b = new ModelBuilder();
  const W = BOARDROOM_WEAR;
  if (wear >= W.threshold) {
    const t = wear - W.threshold;
    const neg = BOARDROOM_FLOORS[Math.floor(t / 3)] ?? 'terrazzo';
    const pos = BOARDROOM_FLOORS[t % 3] ?? 'slate';
    surface(b, neg, { x0: -0.5, x1: 0.5, z0: -0.5, z1: 0 }, variant);
    surface(b, pos, { x0: -0.5, x1: 0.5, z0: 0, z1: 0.5 }, variant + 1);
    b.box(1, 0.006, 0.06, tint(PIN, -0.15), { at: [0, 0.002, 0] }, 0);
    b.box(1, 0.004, 0.018, tint(BRASS, -0.1), { at: [0, 0.0055, 0] }, 0);
    return b.build();
  }
  if (wear >= W.boardroom && wear < W.terrazzo) {
    const edges = wear - W.boardroom;
    broadloom(b, WHOLE, GOOD_CARPET, [tint(GOOD_CARPET, 0.1), tint(BORDER, -0.1)], variant, 0.08);
    const band = 0.2;
    const sides: [number, Area][] = [
      [1, { x0: -0.5, x1: -0.5 + band, z0: -0.5, z1: 0.5 }],
      [2, { x0: 0.5 - band, x1: 0.5, z0: -0.5, z1: 0.5 }],
      [4, { x0: -0.5, x1: 0.5, z0: -0.5, z1: -0.5 + band }],
      [8, { x0: -0.5, x1: 0.5, z0: 0.5 - band, z1: 0.5 }],
    ];
    for (const [bit, a] of sides) {
      if (!(edges & bit)) continue;
      mark(b, a.x1 - a.x0, a.z1 - a.z0, BORDER, (a.x0 + a.x1) / 2, (a.z0 + a.z1) / 2, 0.0018);
      // The brass pin line along its inner edge.
      const vertical = bit < 4;
      const inner = bit === 1 ? a.x1 : bit === 2 ? a.x0 : bit === 4 ? a.z1 : a.z0;
      if (vertical) mark(b, 0.012, 1, PIN, inner, 0, 0.0024);
      else mark(b, 1, 0.012, PIN, 0, inner, 0.0024);
    }
    return b.build();
  }
  if (wear >= W.terrazzo) {
    terrazzo(b, WHOLE, variant);
    const line = wear >= W.scuff ? [0, 1, 2][wear - W.scuff] : wear - W.terrazzo;
    const band = (z: number) => {
      mark(b, 1, 0.3, WALK_LINE, 0, z, 0.0018);
      mark(b, 1, 0.06, mix(TERRAZZO, WALK_LINE, 0.5), 0, z + (z > 0 ? -0.18 : 0.18), 0.0018);
    };
    if (line === 1) band(0.35);
    else if (line === 2) band(-0.35);
    else if (line === 3) mark(b, 1, 0.3, WALK_LINE, 0, 0, 0.0018);
    if (wear >= W.scuff) scuffs(b, variant, mix(TERRAZZO, 0x4a4844, 0.45));
    return b.build();
  }
  broadloom(b, WHOLE, variant === 2 ? SLATE_ALT : SLATE, [FLECK_VIOLET, FLECK_WARM], variant);
  // Carpet tiles, half a tile square, each quarter's pile a touch lighter or darker.
  for (const [qx, qz] of [
    [-0.25, -0.25],
    [0.25, 0.25],
  ] as const)
    mark(b, 0.49, 0.49, tint(SLATE, variant === 1 ? -0.012 : 0.012), qx, qz, 0.0009);
  mark(b, 1, 0.006, tint(SLATE, -0.07), 0, 0, 0.0021);
  mark(b, 0.006, 1, tint(SLATE, -0.07), 0, 0, 0.0021);
  mark(b, 1, 0.006, tint(SLATE, -0.07), 0, -0.497, 0.0021);
  mark(b, 0.006, 1, tint(SLATE, -0.07), -0.497, 0, 0.0021);
  if (wear === W.castor) {
    for (const [x, z, r] of [
      [-0.18, -0.12, 0.2],
      [0.16, -0.18, 0.16],
      [0.02, 0.05, 0.24],
    ] as const)
      b.torus(
        r,
        0.007,
        tint(SLATE, 0.14),
        { at: [x, 0.0016, z], rot: [Math.PI / 2, 0, 0.4 + x * 3] },
        Math.PI * 0.7,
      );
  } else if (wear === W.walkX) {
    mark(b, 1, 0.36, tint(SLATE, 0.04), 0, -0.05, 0.0018);
    mark(b, 1, 0.18, tint(SLATE, 0.065), 0, -0.05, 0.002);
  } else if (wear === W.walkZ) {
    mark(b, 0.32, 1, tint(SLATE, 0.05), 0, 0, 0.0018);
    mark(b, 0.16, 1, tint(SLATE, 0.08), 0, 0, 0.002);
  } else if (wear === W.doorScuff) {
    scuffs(b, variant, tint(SLATE, 0.12));
  } else if (wear === W.sticky) {
    strayNotes(b, variant);
  }
  return b.build();
}

// ---- Counters ----

/** The credenzas' walnut top (darker than every station top), its edge, the dark body. */
export const COUNTER_TOP = 0x4e3626;
const COUNTER_BODY = 0x3c3430;

/** A counter as a walnut credenza on a dark stone plinth, a brass pull, the grain along its top. */
export function boardroomCounter(run: CounterRun): StationModel {
  const b = new ModelBuilder();
  const h = STATION_HEIGHT;
  const top = 0.045;
  b.box(0.9, 0.06, 0.8, STONE_DARK, { at: [0, 0.03, 0] }, 0);
  b.box(
    0.94,
    h - top - 0.06,
    0.86,
    COUNTER_BODY,
    { at: [0, 0.06 + (h - top - 0.06) / 2, 0] },
    0.01,
  );
  b.box(1.0, top, 0.98, COUNTER_TOP, { at: [0, h - top / 2, 0] }, 0.012);
  b.box(
    0.006,
    h - top - 0.1,
    0.004,
    tint(COUNTER_BODY, -0.35),
    { at: [0, 0.06 + (h - top - 0.08) / 2, 0.431] },
    0,
  );
  for (const s of [-1, 1])
    b.box(0.08, 0.012, 0.012, BRASS, { at: [s * 0.08, h - top - 0.08, 0.438] }, 0.003);
  for (const [z, w] of [
    [-0.3, 0.7],
    [-0.08, 0.5],
    [0.18, 0.8],
    [0.36, 0.4],
  ] as const)
    b.box(w, 0.002, 0.008, tint(COUNTER_TOP, -0.15), { at: [0.05, h + 0.0005, z] }, 0);
  if (run.minusEnd)
    b.box(
      0.006,
      h - top - 0.08,
      0.84,
      tint(COUNTER_BODY, -0.3),
      { at: [-0.471, 0.06 + (h - top - 0.06) / 2, 0] },
      0,
    );
  return { base: b.build(), hero: null, heroAt: [0, 0] };
}

// ---- Sticky notes ----

/**
 * A field of sticky notes on a face at depth z (facing +z): `cols` × `rows`
 * in the box centred on (cx, cy), `w` × `h`, a few missing, a few skewed or
 * peeling, a scribble on each. `seed` varies the field.
 */
function noteField(
  b: ModelBuilder,
  cx: number,
  cy: number,
  z: number,
  w: number,
  h: number,
  cols: number,
  rows: number,
  seed: number,
  size = 0.07,
): void {
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const k = r * cols + c + seed * 41;
      if (rnd(k, 1) < 0.12) continue;
      const x = cx - w / 2 + (w * (c + 0.5)) / cols + (rnd(k, 2) - 0.5) * 0.02;
      const y = cy + h / 2 - (h * (r + 0.5)) / rows + (rnd(k, 3) - 0.5) * 0.02;
      // Columns of a colour, a few strays: the way a workshop sorts them.
      const color = rnd(k, 4) < 0.75 ? sticky(c + seed) : sticky(k);
      const peel = rnd(k, 5) < 0.1;
      const turn = (rnd(k, 6) - 0.5) * 0.3;
      b.box(
        size,
        size,
        0.003,
        color,
        { at: [x, y, z + 0.0015], rot: [peel ? -0.5 : 0, 0, turn] },
        0,
      );
      b.box(
        size * 0.6,
        size * 0.1,
        0.002,
        tint(INK, 0.25),
        { at: [x, y + size * 0.12, z + 0.0035], rot: [peel ? -0.5 : 0, 0, turn] },
        0,
      );
      b.box(
        size * 0.4,
        size * 0.1,
        0.002,
        tint(INK, 0.35),
        { at: [x - size * 0.08, y - size * 0.1, z + 0.0035], rot: [peel ? -0.5 : 0, 0, turn] },
        0,
      );
    }
}

// ---- What hangs on the walls ----

/** A gilt-framed portrait with its brass name plate: a face over a suit, against a dark ground. */
function portrait(
  ground: number,
  suit: number,
  hair: number,
  skin: number,
  name: string,
  extra?: (p: ModelBuilder) => void,
): Model {
  const b = new ModelBuilder();
  const cy = 0.7;
  b.box(0.42, 0.5, 0.03, 0xa8864a, { at: [0, cy, FACE + 0.015] }, 0.008);
  b.box(0.36, 0.44, 0.004, tint(0xa8864a, -0.25), { at: [0, cy, FACE + 0.031] }, 0);
  b.box(0.33, 0.41, 0.004, ground, { at: [0, cy, FACE + 0.033] }, 0);
  const f = FACE + 0.035;
  // Shoulders, collar, tie, head and hair.
  b.box(0.26, 0.13, 0.004, suit, { at: [0, cy - 0.13, f] }, 0.02);
  b.box(0.05, 0.1, 0.004, 0xeeeeea, { at: [0, cy - 0.11, f + 0.001] }, 0);
  b.box(0.02, 0.08, 0.004, tint(suit, 0.4), { at: [0, cy - 0.12, f + 0.002] }, 0);
  b.cylinder(
    0.07,
    0.07,
    0.004,
    skin,
    { at: [0, cy + 0.03, f + 0.001], rot: [Math.PI / 2, 0, 0] },
    18,
  );
  b.cylinder(0.078, 0.078, 0.003, hair, { at: [0, cy + 0.07, f], rot: [Math.PI / 2, 0, 0] }, 18);
  b.box(0.008, 0.008, 0.003, INK, { at: [-0.025, cy + 0.04, f + 0.003] }, 0);
  b.box(0.008, 0.008, 0.003, INK, { at: [0.025, cy + 0.04, f + 0.003] }, 0);
  b.box(0.04, 0.006, 0.003, tint(skin, -0.3), { at: [0, cy, f + 0.003] }, 0);
  extra?.(b);
  // The brass name plate under it.
  b.box(0.22, 0.05, 0.006, BRASS, { at: [0, cy - 0.32, FACE + 0.003] }, 0.004);
  text(b, name, 0, cy - 0.32, FACE + 0.007, 0.0065, 0x2a1e10);
  // A picture light over it.
  b.box(0.02, 0.05, 0.02, BRASS, { at: [0, cy + 0.29, FACE + 0.02] }, 0.004);
  b.cylinder(
    0.018,
    0.018,
    0.26,
    BRASS,
    { at: [0, cy + 0.31, FACE + 0.07], rot: [0, 0, Math.PI / 2] },
    10,
  );
  b.screen(0.22, 0.01, 0xffe2a8, { at: [0, cy + 0.292, FACE + 0.072], rot: [-Math.PI / 2, 0, 0] });
  return b.build();
}

/** The synergy matrix: THE PLAN, rewritten as a 2×2 under a picture light: 1. BUILD IT, 2. SYNERGY, 3. PROFIT. */
function synergyMatrixModel(): Model {
  const outer = new ModelBuilder();
  const b = framed(outer, [0, 0.66 * (1 - 1.2), FACE * (1 - 1.2)], [0, 0, 0], 1.2);
  const cy = 0.66;
  b.box(0.66, 0.5, 0.03, 0x1b1d21, { at: [0, cy, FACE + 0.015] }, 0.006);
  b.box(0.6, 0.44, 0.004, 0xf2efe7, { at: [0, cy, FACE + 0.031] }, 0);
  const f = FACE + 0.034;
  // The grid and its axes.
  const gx = 0.03;
  const gy = cy - 0.02;
  b.box(0.42, 0.006, 0.002, INK, { at: [gx, gy, f] }, 0);
  b.box(0.006, 0.32, 0.002, INK, { at: [gx, gy, f] }, 0);
  b.box(0.44, 0.008, 0.002, INK, { at: [gx, gy - 0.16, f] }, 0);
  b.box(0.008, 0.34, 0.002, INK, { at: [gx - 0.21, gy, f] }, 0);
  text(b, 'LEVERAGE >', gx, gy - 0.185, f, 0.0055, INK);
  const v = framed(b, [gx - 0.24, gy, f], [0, 0, Math.PI / 2]);
  text(v, 'ALIGNMENT', 0, 0, 0, 0.0055, INK);
  // The three steps in their quadrants, the top-right one starred.
  const q = (x: number, y: number, color: number, label: string) => {
    b.box(0.17, 0.11, 0.003, color, { at: [x, y, f + 0.001], rot: [0, 0, (x - gx) * 0.2] }, 0);
    text(b, label, x, y, f + 0.003, 0.0048, INK);
  };
  q(gx - 0.11, gy - 0.08, sticky(2), '1. BUILD IT');
  q(gx + 0.11, gy + 0.08, sticky(0), '2. SYNERGY');
  q(gx + 0.11, gy - 0.08, sticky(3), '3. PROFIT');
  b.box(0.14, 0.006, 0.002, RED, { at: [gx, gy, f + 0.004], rot: [0, 0, 0.7] }, 0);
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2;
    b.box(
      0.006,
      0.03,
      0.002,
      RED,
      {
        at: [gx + 0.2 + Math.sin(a) * 0.012, gy + 0.15 + Math.cos(a) * 0.012, f + 0.004],
        rot: [0, 0, -a],
      },
      0,
    );
  }
  b.box(0.5, 0.05, 0.003, YOTTA_VIOLET, { at: [0, cy + 0.19, f] }, 0);
  text(b, 'THE PLAN V2', 0, cy + 0.19, f + 0.002, 0.0068, 0xffffff);
  // The picture light and the museum label.
  const ly = cy + 0.3;
  b.box(0.02, 0.06, 0.02, BRASS, { at: [0, ly - 0.02, FACE + 0.02] }, 0.004);
  b.box(0.02, 0.02, 0.1, BRASS, { at: [0, ly, FACE + 0.06] }, 0.004);
  b.cylinder(0.022, 0.022, 0.4, BRASS, { at: [0, ly, FACE + 0.11], rot: [0, 0, Math.PI / 2] }, 12);
  b.screen(0.36, 0.012, 0xffe2a8, { at: [0, ly - 0.022, FACE + 0.115], rot: [-Math.PI / 2, 0, 0] });
  b.box(0.1, 0.05, 0.004, 0xe8e6de, { at: [0.26, cy - 0.29, FACE + 0.002] }, 0);
  b.box(0.07, 0.006, 0.002, INK, { at: [0.26, cy - 0.28, FACE + 0.005] }, 0);
  return outer.build();
}

/** The board of directors' brass plaque: three seats, one of them MOM's. */
function boardPlaqueModel(): Model {
  const b = new ModelBuilder();
  const cy = 0.72;
  b.box(0.5, 0.42, 0.02, WALNUT_DARK, { at: [0, cy, FACE + 0.01] }, 0.006);
  b.box(0.44, 0.36, 0.006, BRASS, { at: [0, cy, FACE + 0.022] }, 0.004);
  const f = FACE + 0.026;
  text(b, 'BOARD OF', 0, cy + 0.12, f, 0.0085, 0x2a1e10);
  text(b, 'DIRECTORS', 0, cy + 0.07, f, 0.0085, 0x2a1e10);
  b.box(0.3, 0.004, 0.002, 0x2a1e10, { at: [0, cy + 0.035, f] }, 0);
  ['THE FOUNDERS', 'MOM', 'TBD'].forEach((n, i) => {
    text(b, n, 0, cy - 0.01 - i * 0.05, f, 0.0062, 0x2a1e10);
  });
  // A sticky note someone stuck over TBD: MONOLITH?
  b.box(0.09, 0.07, 0.003, sticky(1), { at: [0.13, cy - 0.11, f + 0.003], rot: [0, 0, 0.2] }, 0);
  text(b, 'M?', 0.13, cy - 0.11, f + 0.005, 0.006, INK);
  return b.build();
}

/** The day's agenda on a slim walnut-framed screen. */
function agendaModel(): Model {
  const b = new ModelBuilder();
  const cy = 0.72;
  b.box(0.62, 0.46, 0.03, WALNUT_DARK, { at: [0, cy, FACE + 0.015] }, 0.008);
  b.screen(0.56, 0.4, 0x15213a, { at: [0, cy, FACE + 0.031] });
  const f = FACE + 0.032;
  b.screen(0.56, 0.07, YOTTA_VIOLET, { at: [0, cy + 0.165, f] });
  text(b, 'SYNERGY WORKSHOP', 0, cy + 0.165, f + 0.001, 0.0068, 0xffffff);
  const lines: [string, number][] = [
    ['13:00 WELCOME', 0xc9d4e0],
    ['14:00 ALIGN', 0xc9d4e0],
    ['15:00 SYNERGIZE', 0xffd27a],
    ['16:00 ALIGN AGAIN', 0xc9d4e0],
    ['17:00 ???', 0xc9d4e0],
  ];
  lines.forEach(([t, c], i) => {
    text(b, t, -0.04, cy + 0.08 - i * 0.06, f + 0.001, 0.0058, c);
  });
  b.screen(0.02, 0.02, 0x3ee06a, { at: [-0.24, cy + 0.08 - 2 * 0.06, f + 0.001] });
  return b.build();
}

/** A walnut-rimmed clock at twenty to four (the workshop has run over). */
function clockModel(): Model {
  const b = new ModelBuilder();
  const cy = 0.8;
  const r = (a: number) => ({ rot: [Math.PI / 2, 0, 0] as [number, number, number], a });
  b.cylinder(0.16, 0.16, 0.035, WALNUT, { at: [0, cy, FACE + 0.017], rot: r(0).rot }, 28);
  b.cylinder(0.14, 0.14, 0.004, 0xf2f0ea, { at: [0, cy, FACE + 0.036], rot: r(0).rot }, 28);
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2;
    b.box(
      0.008,
      k % 3 ? 0.014 : 0.028,
      0.003,
      BRASS,
      { at: [Math.sin(a) * 0.115, cy + Math.cos(a) * 0.115, FACE + 0.039], rot: [0, 0, -a] },
      0,
    );
  }
  const hand = (len: number, a: number, w: number, c: number) =>
    b.box(
      w,
      len,
      0.003,
      c,
      {
        at: [Math.sin(a) * len * 0.5, cy + Math.cos(a) * len * 0.5, FACE + 0.041],
        rot: [0, 0, -a],
      },
      0,
    );
  hand(0.065, ((3 + 40 / 60) / 12) * Math.PI * 2, 0.012, INK);
  hand(0.1, (40 / 60) * Math.PI * 2, 0.008, INK);
  hand(0.11, 2.1, 0.003, RED);
  return b.build();
}

/** QUIET PLEASE – BOARD IN SESSION, in brass. */
function quietPleaseModel(): Model {
  const b = new ModelBuilder();
  const cy = 0.74;
  b.box(0.44, 0.2, 0.012, BRASS, { at: [0, cy, FACE + 0.006] }, 0.004);
  b.box(0.4, 0.16, 0.002, tint(BRASS, -0.15), { at: [0, cy, FACE + 0.0125] }, 0);
  text(b, 'QUIET PLEASE', 0, cy + 0.035, FACE + 0.014, 0.0075, 0x2a1e10);
  text(b, 'BOARD IN SESSION', 0, cy - 0.035, FACE + 0.014, 0.0058, 0x2a1e10);
  // A sticky note under it: AND WORKSHOP.
  b.box(
    0.1,
    0.08,
    0.003,
    sticky(0),
    { at: [0.12, cy - 0.17, FACE + 0.003], rot: [0, 0, -0.15] },
    0,
  );
  text(b, '+SYNERGY', 0.12, cy - 0.17, FACE + 0.005, 0.0032, INK);
  return b.build();
}

/** White vinyl on the reception's glass: MONOLITH VISITORS > PLEASE WAIT. */
function visitorsModel(): Model {
  const b = new ModelBuilder();
  const y = 0.86;
  b.box(0.8, 0.13, 0.002, 0x1b1d21, { at: [0, y, FACE + 0.002] }, 0);
  text(b, 'MONOLITH VISITORS', 0, y + 0.03, FACE + 0.004, 0.0068, WHITE);
  text(b, 'PLEASE WAIT >', 0, y - 0.03, FACE + 0.004, 0.0058, 0xc9c9c4);
  noteField(b, 0.2, 0.46, FACE, 0.22, 0.16, 2, 2, 7, 0.065);
  return b.build();
}

/** Sticky notes stuck on the glass in a loose cluster, someone's diagram among them. */
function glassNotesModel(seed: number): Model {
  const b = new ModelBuilder();
  noteField(b, (seed % 3) * 0.12 - 0.12, 0.84, FACE, 0.42, 0.26, 4, 3, seed);
  // A marker arrow on the glass between two of them.
  b.box(0.16, 0.006, 0.002, tint(INK, 0.2), { at: [0.1, 0.48, FACE + 0.002], rot: [0, 0, 0.3] }, 0);
  noteField(b, 0.26, 0.42, FACE, 0.14, 0.08, 2, 1, seed + 3);
  return b.build();
}

/** EXECUTIVE FLOOR in white vinyl over two panes, a violet rule under it, YOTTA × MONOLITH beneath. */
function execVinylModel(): Model {
  const b = new ModelBuilder();
  const y = 0.9;
  text(b, 'EXECUTIVE FLOOR', 0.5, y, FACE + 0.002, 0.012, WHITE, 0.003);
  b.box(0.9, 0.012, 0.003, YOTTA_VIOLET, { at: [0.5, y - 0.05, FACE + 0.002] }, 0);
  text(b, 'YOTTA X MONOLITH', 0.5, y - 0.1, FACE + 0.002, 0.0062, DOT_VIOLET, 0.003);
  return b.build();
}

/** KNOWN BUGS on a corkboard by the bug queue: red notes, a squashed bug drawn on one. */
function bugBoardModel(): Model {
  const b = new ModelBuilder();
  const cy = 0.7;
  b.box(0.7, 0.56, 0.03, WALNUT_DARK, { at: [0, cy, FACE + 0.015] }, 0.006);
  b.box(0.64, 0.5, 0.004, 0xa88a62, { at: [0, cy, FACE + 0.031] }, 0);
  const f = FACE + 0.033;
  b.box(0.4, 0.07, 0.003, RED, { at: [0, cy + 0.19, f] }, 0);
  text(b, 'KNOWN BUGS', 0, cy + 0.19, f + 0.002, 0.0072, 0xffffff);
  for (let k = 0; k < 9; k++) {
    const x = -0.22 + (k % 3) * 0.22 + (rnd(k, 9) - 0.5) * 0.04;
    const y = cy + 0.08 - Math.floor(k / 3) * 0.13;
    const c = k % 4 === 0 ? sticky(0) : 0xe08a8a;
    b.box(0.1, 0.1, 0.003, c, { at: [x, y, f + 0.001], rot: [0, 0, (rnd(k, 10) - 0.5) * 0.3] }, 0);
    b.cylinder(
      0.008,
      0.008,
      0.008,
      RED,
      { at: [x, y + 0.04, f + 0.004], rot: [Math.PI / 2, 0, 0] },
      8,
    );
    b.box(0.06, 0.006, 0.002, INK, { at: [x, y, f + 0.003] }, 0);
  }
  // The squashed bug.
  b.sphere(0.018, INK, { at: [0.22, cy - 0.18, f + 0.004] }, [1.2, 0.8, 0.2]);
  for (const s of [-1, 1])
    b.box(
      0.05,
      0.004,
      0.002,
      INK,
      { at: [0.22, cy - 0.18 + s * 0.008, f + 0.004], rot: [0, 0, s * 0.5] },
      0,
    );
  return b.build();
}

/** The ops side's status screen: ALL SYSTEMS ALIGNED, green bars and an uptime line. */
function opsScreenModel(): Model {
  const b = new ModelBuilder();
  const cy = 0.74;
  b.box(0.7, 0.44, 0.03, 0x22252c, { at: [0, cy, FACE + 0.015] }, 0.008);
  b.screen(0.66, 0.4, 0x0f1a26, { at: [0, cy, FACE + 0.031] });
  const f = FACE + 0.032;
  b.screen(0.66, 0.06, 0x1e5a3a, { at: [0, cy + 0.17, f] });
  text(b, 'ALL SYSTEMS ALIGNED', 0, cy + 0.17, f + 0.001, 0.0056, 0xe6ffe8);
  for (let k = 0; k < 6; k++) {
    const h = 0.06 + rnd(k, 21) * 0.14;
    b.screen(0.05, h, k === 4 ? 0xe0a03a : 0x3ec070, {
      at: [-0.25 + k * 0.07, cy - 0.15 + h / 2, f],
    });
  }
  for (let k = 0; k < 8; k++)
    b.screen(0.03, 0.006, 0x5ab8ff, {
      at: [0.12 + k * 0.026, cy + 0.02 + Math.sin(k) * 0.03, f],
      rot: [0, 0, Math.cos(k) * 0.6],
    });
  text(b, 'DEPLOYS 42', 0.22, cy - 0.12, f + 0.001, 0.0048, 0xc9d4e0);
  return b.build();
}

/**
 * `model` grown `s` times about the point (0, `cy`) on the face, so a piece
 * reads from the camera without being rebuilt; it stays on the face.
 */
function grown(model: Model, s: number, cy: number): Model {
  const m = new THREE.Matrix4()
    .makeTranslation(0, cy, FACE)
    .multiply(new THREE.Matrix4().makeScale(s, s, 1))
    .multiply(new THREE.Matrix4().makeTranslation(0, -cy, -FACE));
  for (const g of [model.body, model.glow, model.glass]) g?.applyMatrix4(m);
  return model;
}

/** `model` grown `s` times about the point `at`. */
function grownAt(model: Model, s: number, at: [number, number, number]): Model {
  const m = new THREE.Matrix4()
    .makeTranslation(...at)
    .multiply(new THREE.Matrix4().makeScale(s, s, s))
    .multiply(new THREE.Matrix4().makeTranslation(-at[0], -at[1], -at[2]));
  for (const g of [model.body, model.glow, model.glass]) g?.applyMatrix4(m);
  return model;
}

/** How much bigger than life the art hangs, so it reads from the camera. */
const ART_GROW = 1.3;

/** Every wall art model, by its name in the plan. */
export const BOARDROOM_ART_MODELS: Readonly<Record<BoardroomArt, () => Model>> = {
  synergyMatrix: () => grown(synergyMatrixModel(), 1.1, 0.68),
  portraitChair: () =>
    grown(portrait(0x2e3a4a, 0x2a2e38, 0xc9c6c2, 0xe2b896, 'THE CHAIR'), ART_GROW, 0.66),
  portraitMom: () =>
    grown(
      portrait(0x35503f, 0x6a4a7a, 0xc9c6c2, 0xe2b896, 'MOM', (p) => {
        // Her pearls and her bun.
        for (let k = 0; k < 7; k++)
          p.led(0.006, 0xfff6ea, {
            at: [-0.03 + k * 0.01, 0.6 - Math.sin((k / 6) * Math.PI) * 0.012, FACE + 0.04],
          });
        p.cylinder(
          0.03,
          0.03,
          0.004,
          0xc9c6c2,
          { at: [0, 0.83, FACE + 0.034], rot: [Math.PI / 2, 0, 0] },
          12,
        );
      }),
      ART_GROW,
      0.66,
    ),
  boardPlaque: () => grown(boardPlaqueModel(), 1.25, 0.68),
  agenda: () => grown(agendaModel(), 1.35, 0.68),
  clock: () => grown(clockModel(), 1.5, 0.74),
  quietPlease: () => grown(quietPleaseModel(), 1.5, 0.7),
  visitors: visitorsModel,
  glassNotes: () => glassNotesModel(1),
  execVinyl: execVinylModel,
  bugBoard: () => grown(bugBoardModel(), 1.2, 0.68),
  opsScreen: () => grown(opsScreenModel(), 1.2, 0.7),
};

/** A second and third look of the notes on the glass. */
export const GLASS_NOTES_LOOKS = 3;
export function glassNotesLook(look: number): Model {
  return glassNotesModel(look + 1);
}

// ---- The stubs' scenes ----

const STUB_TOP = FRONT_WALL_HEIGHT;
/** How far back the boards lean (toward the corridor), so they show their face to the camera. */
const BOARD_LEAN = 0.38;
/** The boards' height on the stubs: low, so the corridor behind still reads. */
export const BOARD_H = 0.5;

/** Sticky notes along a stub's low front face. */
function stubFaceNotes(b: ModelBuilder, span: number, seed: number): void {
  for (let k = 0; k < span * 4; k++) {
    if (rnd(k, seed + 60) < 0.3) continue;
    const x = -0.42 + k * 0.25 + (rnd(k, seed + 61) - 0.5) * 0.05;
    b.box(
      0.07,
      0.07,
      0.003,
      sticky(k + seed),
      { at: [x, STUB_TOP * 0.52, 0.507], rot: [0, 0, (rnd(k, seed + 62) - 0.5) * 0.4] },
      0,
    );
  }
}

/** A board on a stub run `span` tiles from the origin tile, leaned back, its face built by `face` (in board space, +z out). */
function leanedBoard(
  span: number,
  frame: number,
  face: number,
  build: (g: ModelBuilder, w: number) => void,
): Model {
  const b = new ModelBuilder();
  const w = span - 0.14;
  const cx = (span - 1) / 2;
  // The feet: two steel shoes on the cap.
  for (const s of [-1, 1])
    b.box(
      0.05,
      0.03,
      0.2,
      STEEL_DARK,
      { at: [cx + s * (w / 2 - 0.1), STUB_TOP + 0.015, 0.22] },
      0.004,
    );
  const g = framed(b, [cx, STUB_TOP + 0.02, 0.3], [-BOARD_LEAN, 0, 0]);
  g.box(w, BOARD_H, 0.03, frame, { at: [0, BOARD_H / 2, 0] }, 0.006);
  g.box(w - 0.04, BOARD_H - 0.04, 0.004, face, { at: [0, BOARD_H / 2, 0.016] }, 0);
  build(g, w);
  stubFaceNotes(b, span, span * 3 + 1);
  return b.build();
}

/** The IDEAS board: a whiteboard full of sticky notes in columns, a marker tray with markers and an eraser. */
function ideasBoardModel(span: number): Model {
  return leanedBoard(span, 0xb8bec4, 0xf4f5f2, (g, w) => {
    g.box(w * 0.3, 0.07, 0.003, YOTTA_VIOLET, { at: [-w * 0.3, BOARD_H - 0.055, 0.019] }, 0);
    text(g, 'IDEAS', -w * 0.3, BOARD_H - 0.055, 0.021, 0.011, 0xffffff);
    text(g, '> ALIGN > SYNERGY', w * 0.15, BOARD_H - 0.055, 0.019, 0.008, INK);
    noteField(
      g,
      0,
      BOARD_H / 2 - 0.035,
      0.018,
      w - 0.08,
      BOARD_H - 0.13,
      Math.round(w * 8),
      3,
      2,
      0.075,
    );
    g.box(w - 0.1, 0.02, 0.05, 0xa3abb2, { at: [0, 0.0, 0.03] }, 0.004);
    for (let k = 0; k < 4; k++)
      g.cylinder(
        0.009,
        0.009,
        0.1,
        k % 2 ? RED : 0x2f5aa8,
        { at: [-w / 2 + 0.2 + k * 0.12, 0.016, 0.03], rot: [0, 0, Math.PI / 2] },
        8,
      );
    g.box(0.1, 0.03, 0.04, 0x2e3238, { at: [w / 2 - 0.2, 0.025, 0.03] }, 0.006);
  });
}

/** HOW MIGHT WE… SYNERGIZE? on a foam board, a row of answers stuck under it. */
function howMightWeModel(span: number): Model {
  return leanedBoard(span, 0x2e3238, 0xf2efe7, (g, w) => {
    text(g, 'HOW MIGHT WE...', -w * 0.1, BOARD_H - 0.07, 0.019, 0.016, INK);
    text(g, '...SYNERGIZE?', w * 0.12, BOARD_H - 0.17, 0.019, 0.016, YOTTA_VIOLET);
    g.box(w * 0.6, 0.008, 0.003, RED, { at: [w * 0.12, BOARD_H - 0.225, 0.019] }, 0);
    noteField(g, 0, 0.075, 0.018, w - 0.12, 0.1, Math.round(w * 7), 1, 5, 0.07);
  });
}

/**
 * Prod as the workshop's parking lot: a small tree in a big walnut planter,
 * sticky notes stuck all over its leaves, PARKING LOT on the pot, a stake
 * sign of its own.
 */
function prodModel(): Model {
  const b = new ModelBuilder();
  const y = STUB_TOP;
  const z = -0.02;
  b.box(0.46, 0.2, 0.46, WALNUT, { at: [0, y + 0.1, z] }, 0.02);
  b.box(0.48, 0.02, 0.48, WALNUT_DARK, { at: [0, y + 0.2, z] }, 0.006);
  b.box(0.42, 0.01, 0.42, 0x4a3a2c, { at: [0, y + 0.205, z] }, 0);
  b.box(0.36, 0.06, 0.004, 0xf2efe7, { at: [0, y + 0.1, z + 0.232] }, 0);
  text(b, 'PARKING LOT', 0, y + 0.1, z + 0.235, 0.0068, INK);
  // The trunk and its canopy.
  b.cylinder(0.022, 0.03, 0.18, 0x6a4e36, { at: [0, y + 0.29, z] }, 10);
  const leaves = [0x5f8a52, 0x6e9a5e, 0x557c4a];
  const blobs: [number, number, number, number][] = [
    [0, 0.46, 0, 0.15],
    [-0.12, 0.41, 0.04, 0.11],
    [0.12, 0.42, -0.03, 0.12],
    [0.03, 0.55, -0.02, 0.1],
  ];
  blobs.forEach(([x, by, bz, r], k) => {
    b.sphere(r, leaves[k % leaves.length] ?? 0x5f8a52, { at: [x, y + by, z + bz] }, [1, 0.85, 1]);
    // Sticky notes on its leaves: the front of each blob.
    for (let n = 0; n < 4; n++) {
      const a = -0.9 + n * 0.6 + rnd(k, n) * 0.3;
      const e = (rnd(n, k) - 0.4) * 0.8;
      const px = x + Math.sin(a) * r * Math.cos(e);
      const py = y + by + Math.sin(e) * r * 0.85;
      const pz = z + bz + Math.cos(a) * r * Math.cos(e);
      b.box(
        0.05,
        0.05,
        0.003,
        sticky(n + k),
        { at: [px, py, pz + 0.004], rot: [-e * 0.8, a, (rnd(k + n, 7) - 0.5) * 0.5] },
        0,
      );
    }
  });
  // The stake sign in the soil: a little P on a post.
  b.box(0.008, 0.16, 0.008, STEEL_DARK, { at: [0.16, y + 0.28, z + 0.12] }, 0);
  b.box(0.07, 0.07, 0.005, 0x2f5aa8, { at: [0.16, y + 0.37, z + 0.125] }, 0.004);
  text(b, 'P', 0.16, y + 0.37, z + 0.129, 0.009, 0xffffff);
  stubFaceNotes(b, 1, 9);
  return b.build();
}

/** The name cards, waiting on a walnut tray: YOTTA, MONOLITH and MOM (she has a board seat). */
function credenzaModel(): Model {
  const b = new ModelBuilder();
  const y = STUB_TOP;
  b.box(0.9, 0.05, 0.5, WALNUT, { at: [0, y + 0.025, 0.02] }, 0.01);
  b.box(0.92, 0.012, 0.52, WALNUT_DARK, { at: [0, y + 0.056, 0.02] }, 0.004);
  b.box(0.3, 0.008, 0.02, BRASS, { at: [0, y + 0.03, 0.272] }, 0.003);
  const cards: [string, number, number][] = [
    ['YOTTA', YOTTA_VIOLET, 0xffffff],
    ['MONOLITH', BLACK, 0xffffff],
    ['MOM', 0xf2efe7, INK],
  ];
  cards.forEach(([name, bg, fg], i) => {
    const x = -0.29 + i * 0.29;
    const g = framed(b, [x, y + 0.062, 0.1 + (i % 2) * 0.04], [0, (i - 1) * 0.1, 0]);
    for (const s of [1, -1]) {
      const t = framed(g, [0, 0, s * 0.04], [s * 0.55, s > 0 ? 0 : Math.PI, 0]);
      t.box(0.29, 0.13, 0.004, bg, { at: [0, 0.065, 0] }, 0);
      text(t, name, 0, 0.065, 0.003, Math.min(0.013, 0.25 / (name.length * 4)), fg);
    }
  });
  // A jug of water and two glasses at the back.
  b.add(
    new THREE.CylinderGeometry(0.04, 0.05, 0.16, 14),
    0xe8f4fa,
    { at: [0.33, y + 0.14, -0.14] },
    'glass',
  );
  b.cylinder(0.036, 0.044, 0.08, 0x9fcbe2, { at: [0.33, y + 0.1, -0.14] }, 14);
  for (const x of [0.2, 0.25])
    b.add(
      new THREE.CylinderGeometry(0.024, 0.022, 0.07, 12),
      0xeef7fb,
      { at: [x, y + 0.097, -0.17 + x * 0.2] },
      'glass',
    );
  stubFaceNotes(b, 1, 13);
  return b.build();
}

/** A stub with only notes on it: a row on its face and a pad on its cap. */
function stubNotesModel(): Model {
  const b = new ModelBuilder();
  stubFaceNotes(b, 1, 17);
  b.box(0.1, 0.03, 0.1, sticky(2), { at: [0.2, STUB_TOP + 0.015, 0.1], rot: [0, 0.3, 0] }, 0);
  return b.build();
}

/** Every stub scene, by name, for a run `span` tiles long. */
export function stubSceneModel(scene: StubScene, span: number): Model {
  switch (scene) {
    case 'ideasBoard':
      return ideasBoardModel(span);
    case 'howMightWe':
      return howMightWeModel(span);
    case 'prod':
      return grownAt(prodModel(), 1.2, [0, STUB_TOP, 0.5]);
    case 'credenza':
      return credenzaModel();
    default:
      return stubNotesModel();
  }
}

// ---- The inbox, the bin and the ship ----

/** How tall the sticky-note wall stands over the inbox. */
export const IDEAS_WALL_TOP = WALL_HEIGHT;
const IDEAS_TILT = 0.38;

/**
 * The workshop's sticky-note wall over the inbox (`span` tiles, built with
 * its back to the outside, −z): a tall whiteboard on steel posts behind the
 * station, leaned back to the camera, an IDEAS header in YOTTA violet and
 * a dense field of sticky notes in five colours, a few peeling off.
 */
export function ideasWallModel(span: number): Model {
  const b = new ModelBuilder();
  const w = span - 0.1;
  const z = -0.47;
  const y0 = STATION_HEIGHT + 0.04;
  const y1 = IDEAS_WALL_TOP;
  const cy = (y0 + y1) / 2;
  for (const s of [-1, 1])
    b.box(0.04, y0, 0.03, STEEL_DARK, { at: [s * (w / 2 - 0.1), y0 / 2, z - 0.01] }, 0);
  const q = new THREE.Vector3(0, y0, z).applyMatrix4(
    new THREE.Matrix4().makeRotationX(-IDEAS_TILT),
  );
  const g = framed(b, [0, y0 - q.y, z - q.z], [-IDEAS_TILT, 0, 0]);
  g.box(w, y1 - y0, 0.03, 0xb8bec4, { at: [0, cy, z] }, 0.008);
  g.box(w - 0.04, y1 - y0 - 0.04, 0.004, 0xf4f5f2, { at: [0, cy, z + 0.016] }, 0);
  const f = z + 0.018;
  g.box(0.5, 0.08, 0.003, YOTTA_VIOLET, { at: [-w / 2 + 0.32, y1 - 0.07, f] }, 0);
  text(g, 'IDEAS', -w / 2 + 0.32, y1 - 0.07, f + 0.002, 0.012, 0xffffff);
  text(g, 'GO WILD!', w / 2 - 0.3, y1 - 0.07, f, 0.0075, RED);
  noteField(g, 0, cy - 0.05, f, w - 0.1, y1 - y0 - 0.2, Math.round(w * 9), 4, 11, 0.075);
  // Two notes come loose and hang off the bottom edge.
  for (const x of [-0.3, 0.42])
    g.box(
      0.075,
      0.075,
      0.003,
      sticky(Math.round(x * 10)),
      { at: [x * span * 0.5, y0 + 0.01, f + 0.01], rot: [0.6, 0, x] },
      0,
    );
  return b.build();
}

/**
 * The PARKED box at the bin, set against the wall beside it, facing the
 * camera: a cardboard archive box overflowing with crumpled sticky notes,
 * PARKED stencilled on a placard stuck in it.
 */
export function parkedBoxModel(): Model {
  const b = new ModelBuilder();
  const z = 0;
  const x = 0;
  b.box(0.36, 0.3, 0.24, 0xb89a6e, { at: [x, 0.15, z] }, 0.01);
  b.box(0.37, 0.035, 0.25, tint(0xb89a6e, -0.15), { at: [x, 0.29, z] }, 0.005);
  b.box(0.2, 0.05, 0.004, tint(0xb89a6e, -0.35), { at: [x, 0.2, z + 0.121] }, 0);
  for (let k = 0; k < 8; k++)
    b.sphere(
      0.045,
      sticky(k),
      { at: [x - 0.11 + (k % 4) * 0.075, 0.33 + (k > 3 ? 0.035 : 0), z - 0.05 + (k % 2) * 0.09] },
      [1, 0.7, 1],
    );
  const g = framed(b, [x + 0.02, 0.3, z - 0.06], [-0.3, 0, -0.06]);
  g.box(0.014, 0.4, 0.014, 0x8a6e4a, { at: [0, 0.2, 0] }, 0);
  g.box(0.42, 0.17, 0.012, 0xd8c49a, { at: [0, 0.44, 0.012] }, 0.005);
  text(g, 'PARKED', 0, 0.44, 0.019, 0.014, RED);
  return b.build();
}

/** How tall the deploy desk stands at most: the front strip's 0.6. */
export const DEPLOY_MAX_H = 0.6;

/**
 * The ops side's deploy desk at the ship (`span` tiles, built with its +z
 * to the outside): a walnut console front low in the wall line with a
 * violet DEPLOY strip lit along it, a DEPLOYS: 42 counter, and at its ends
 * two small screens on steel arms (a green pipeline, a graph) and the
 * rubber duck on its own little plinth.
 */
export function deployDeskModel(span: number): Model {
  const b = new ModelBuilder();
  const hx = span / 2;
  const z = 0.53;
  b.box(span - 0.04, 0.22, 0.07, WALNUT_DARK, { at: [0, 0.11, z] }, 0.01);
  b.box(span - 0.04, 0.012, 0.08, STEEL_DARK, { at: [0, 0.226, z] }, 0);
  b.box(span * 0.55, 0.075, 0.004, YOTTA_VIOLET, { at: [-hx * 0.36, 0.13, z + 0.036] }, 0);
  text(b, 'DEPLOY', -hx * 0.36, 0.13, z + 0.039, 0.011, 0xffffff);
  b.screen(span * 0.3, 0.075, 0x1a0e0c, { at: [hx * 0.58, 0.13, z + 0.037] });
  text(b, 'DEPLOYS 42', hx * 0.58, 0.13, z + 0.038, 0.0058, 0xff8a3a);
  b.box(span - 0.1, 0.01, 0.004, 0x3ec070, { at: [0, 0.05, z + 0.036] }, 0);
  for (const s of [-1, 1]) {
    const x = s * (hx - 0.1);
    b.box(0.05, 0.3, 0.05, STEEL_DARK, { at: [x, 0.3, z + 0.02] }, 0.008);
    const g = framed(b, [x, 0.42, z + 0.07], [-0.55, s * -0.3, 0]);
    g.box(0.3, 0.19, 0.025, 0x22252c, { at: [0, 0.0, 0] }, 0.01);
    g.screen(0.27, 0.16, 0x0f1a26, { at: [0, 0, 0.0135] });
    if (s < 0) {
      g.screen(0.27, 0.035, 0x1e5a3a, { at: [0, 0.06, 0.014] });
      text(g, 'PIPELINE', 0, 0.06, 0.015, 0.0045, 0xe6ffe8);
      for (let k = 0; k < 4; k++)
        g.screen(0.045, 0.045, k < 3 ? 0x3ec070 : 0xe0a03a, {
          at: [-0.09 + k * 0.06, -0.02, 0.014],
        });
    } else {
      for (let k = 0; k < 8; k++)
        g.screen(0.03, 0.007, 0x5ab8ff, {
          at: [-0.105 + k * 0.03, Math.sin(k) * 0.04, 0.014],
          rot: [0, 0, Math.cos(k) * 0.6],
        });
    }
  }
  // The rubber duck, on its own walnut plinth on the desk's top.
  const dx = -0.05;
  b.box(0.16, 0.04, 0.12, WALNUT, { at: [dx, 0.252, z] }, 0.008);
  b.sphere(0.065, 0xf2c83a, { at: [dx, 0.31, z] }, [1.25, 0.8, 1]);
  b.sphere(0.042, 0xf2c83a, { at: [dx + 0.045, 0.375, z + 0.015] });
  b.box(0.045, 0.016, 0.03, 0xe07a2a, { at: [dx + 0.09, 0.37, z + 0.02] }, 0.006);
  b.led(0.006, BLACK, { at: [dx + 0.06, 0.39, z + 0.05] });
  return b.build();
}

// ---- The pendants ----

/** How far the pendants' fine wires reach up from the fitting to the wire. */
export const PENDANT_HANG = 0.31;
/** A pendant's half length. */
export const PENDANT_HALF = 0.42;

/**
 * A slim linear pendant: a dark bronze body with a warm opal diffuser
 * along its face and underside (lit), end caps, and two fine drop wires
 * up to the wire it hangs from.
 */
export function boardroomPendantModel(): Model {
  const b = new ModelBuilder();
  const len = PENDANT_HALF * 2;
  b.box(len, 0.045, 0.05, 0x4a4036, { at: [0, 0, 0] }, 0.01);
  b.box(len - 0.02, 0.006, 0.052, 0x6a5a48, { at: [0, 0.022, 0] }, 0);
  b.add(
    new THREE.BoxGeometry(len - 0.05, 0.014, 0.004),
    0xfff0d8,
    { at: [0, -0.008, 0.0262] },
    'glow',
  );
  b.add(new THREE.BoxGeometry(len - 0.05, 0.004, 0.03), 0xfff0d8, { at: [0, -0.0235, 0] }, 'glow');
  for (const s of [-1, 1]) {
    b.box(0.02, 0.05, 0.056, 0x2e2a26, { at: [s * (len / 2), 0, 0] }, 0.006);
    b.box(
      0.008,
      PENDANT_HANG,
      0.008,
      0x3a3632,
      { at: [s * (len / 2 - 0.08), PENDANT_HANG / 2 + 0.02, 0] },
      0,
    );
    b.box(0.024, 0.014, 0.018, 0x3a3632, { at: [s * (len / 2 - 0.08), 0.03, 0] }, 0.004);
  }
  return b.build();
}

// ---- The pendants' wire ----

const WIRE = 0x8a9096;
const WIRE_THICK = 0.012;

/**
 * The wire a row of pendants hangs from, in world x and y at the row's z:
 * from a post on each end's wall top (at `base0`, `base1`), through the top
 * of each pendant's wires, sagging a little between.
 */
export function pendantWireModel(row: PendantRow): Model {
  const b = new ModelBuilder();
  const wy = row.y + PENDANT_HANG;
  const points: [number, number][] = [
    [row.x0, wy + 0.05],
    ...row.at.map((x): [number, number] => [x, wy]),
    [row.x1, wy + 0.05],
  ];
  for (let i = 0; i + 1 < points.length; i++) {
    const [x0, y0] = points[i] ?? [0, 0];
    const [x1, y1] = points[i + 1] ?? [0, 0];
    const at = (t: number): [number, number] => [
      x0 + (x1 - x0) * t,
      y0 + (y1 - y0) * t - 0.03 * 4 * t * (1 - t),
    ];
    for (let k = 0; k < 5; k++) {
      const [ax, ay] = at(k / 5);
      const [bx, by] = at((k + 1) / 5);
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
  for (const [x, base] of [
    [row.x0, row.base0],
    [row.x1, row.base1],
  ] as const) {
    const top = wy + 0.08;
    b.box(0.022, top - base, 0.022, STEEL_DARK, { at: [x, base + (top - base) / 2, 0] }, 0.004);
    b.box(0.06, 0.012, 0.06, STEEL_DARK, { at: [x, base + 0.006, 0] }, 0.003);
    b.box(0.03, 0.02, 0.03, STEEL, { at: [x, top, 0] }, 0.004);
  }
  return b.build();
}

/** The theme's cap colour, for the fallback walls. */
export const BOARDROOM_CAP = WALL_COLORS.boardroom.top;
