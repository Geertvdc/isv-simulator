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
  FRONT_SILL_LOOKS,
  SIDE_GLASS_LOOKS,
  SLATE_WEAR,
  frontSillSwap,
  sideGlassSwap,
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

/** Walnut veneer: dark, fine and cool enough (on screen saturation about 0.3) never to outshout a station. */
export const WALNUT = 0x5c5550;
const WALNUT_LIGHT = 0x787068;
const WALNUT_DARK = 0x403c39;
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
  stoneCap(b, h);
  return b.build();
}

// ---- The side glass ----

/** The side curtain wall's steel, glass tint, blinds and their warm cream bottom rail. */
const SIDE_STEEL = 0x8c939b;
const SIDE_GLASS = 0x9fb4c6;
const SIDE_BLIND = 0xd8d1c3;
const SIDE_RAIL = 0xd9cdb6;
/** The side glass's spandrel and its sill; its glazing's depth (across the wall). */
const SIDE_SPANDREL = 0.26;
const SIDE_DEPTH = 0.8;
/** The low unit's spandrel and head, where a side wall is cut down so the station behind it shows (the front strip's 0.6 at most). */
const SIDE_LOW_SPANDREL = 0.12;
export const SIDE_LOW_TOP = 0.55;
/** How far down the blinds come, of the glass's height, look by look: about 60%. */
const SIDE_DROP = [0.6, 0.55, 0.66] as const;

/**
 * A unit of the curtain wall down the hall's sides (its line along z, the
 * room either way across x), so it reads from above as glass, not a box: a
 * dark spandrel under an aluminium sill board, a double-glazed unit of
 * see-through glass tinted cool, framed in slim steel mullions and a
 * transom, the blind inside it down about 60% with its warm cream bottom
 * rail, the cassette under a slim steel head, open above, so the camera
 * looks down past the head into the glazing.
 */
export function sideGlassModel(look: number, room: 1 | -1, low: boolean): Model {
  const b = new ModelBuilder();
  const sp = low ? SIDE_LOW_SPANDREL : SIDE_SPANDREL;
  const g0 = sp + 0.022;
  const top = low ? SIDE_LOW_TOP : WALL_HEIGHT - 0.03;
  const transom = low ? null : 0.92;
  const gh = top - g0;
  const half = SIDE_DEPTH / 2;
  b.box(1.0, sp, 1.0, 0x525b66, { at: [0, sp / 2, 0] }, 0);
  b.box(1.006, 0.014, 1.006, tint(0x525b66, -0.4), { at: [0, 0.007, 0] }, 0);
  // Aluminium sill boards either side of the glazing; dark inside it, so the glass reads deep.
  for (const s of [-1, 1])
    b.box(
      0.5 - SIDE_DEPTH / 2 + 0.01,
      0.022,
      1.02,
      0xb0b7be,
      {
        at: [s * (SIDE_DEPTH / 2 + (0.5 - SIDE_DEPTH / 2) / 2), sp + 0.011, 0],
      },
      0.004,
    );
  b.box(SIDE_DEPTH, 0.022, 1.0, 0x51606e, { at: [0, sp + 0.011, 0] }, 0);
  // The glazing: a pane on each face and the lid, the frame round them.
  for (const s of [-1, 1]) {
    b.pane(0.008, gh, 0.98, SIDE_GLASS, { at: [s * half, g0 + gh / 2, 0] });
    // Mullions at the unit's ends, the transom, the sill and head rails.
    for (const z of [-0.48, 0.48])
      b.box(0.04, gh + 0.03, 0.04, SIDE_STEEL, { at: [s * half, g0 + gh / 2, z] }, 0);
    b.box(0.04, 0.03, 1.0, SIDE_STEEL, { at: [s * half, g0 + 0.015, 0] }, 0);
    if (transom) b.box(0.04, 0.024, 1.0, SIDE_STEEL, { at: [s * half, transom, 0] }, 0);
    b.box(0.05, 0.03, 1.0, SIDE_STEEL, { at: [s * half, top + 0.015, 0] }, 0);
    // The sky's glint across the face.
    b.box(
      0.004,
      0.012,
      0.6,
      tint(SIDE_GLASS, 0.5),
      { at: [s * (half + 0.006), g0 + gh * 0.72, 0.1], rot: [0.5, 0, 0] },
      0,
    );
  }
  for (const z of [-0.48, 0.48]) {
    b.box(SIDE_DEPTH + 0.04, 0.03, 0.04, SIDE_STEEL, { at: [0, top + 0.015, z] }, 0);
    // The unit's end glazing, so a lone unit reads as glass from the front too.
    b.pane(SIDE_DEPTH - 0.04, gh, 0.008, SIDE_GLASS, { at: [0, g0 + gh / 2, z * 1.02] });
    if (transom) b.box(SIDE_DEPTH + 0.04, 0.024, 0.04, SIDE_STEEL, { at: [0, transom, z] }, 0);
  }
  // The blind just inside the room's pane, down about 60%: its cassette, the fabric and its slats, the cream rail, the cord.
  const drop = gh * (SIDE_DROP[look % SIDE_DROP.length] ?? 0.6);
  const bx = room * (half - 0.035);
  b.box(0.05, 0.05, 0.94, SIDE_RAIL, { at: [bx, top - 0.03, 0] }, 0.006);
  b.box(0.006, drop, 0.92, SIDE_BLIND, { at: [bx, top - 0.055 - drop / 2, 0] }, 0);
  const slats = Math.round(drop / 0.05);
  for (let k = 1; k < slats; k++)
    b.box(
      0.004,
      0.006,
      0.92,
      tint(SIDE_BLIND, -0.12),
      {
        at: [bx + room * 0.004, top - 0.055 - (drop * k) / slats, 0],
      },
      0,
    );
  b.box(0.03, 0.034, 0.95, SIDE_RAIL, { at: [bx, top - 0.055 - drop - 0.017, 0] }, 0.006);
  b.box(0.032, 0.006, 0.952, tint(SIDE_RAIL, -0.3), { at: [bx, top - 0.055 - drop - 0.034, 0] }, 0);
  b.box(
    0.006,
    0.16,
    0.006,
    0x6a7078,
    { at: [bx + room * 0.01, top - 0.055 - drop - 0.11, 0.4] },
    0,
  );
  b.box(
    0.018,
    0.03,
    0.018,
    SIDE_RAIL,
    { at: [bx + room * 0.01, top - 0.055 - drop - 0.2, 0.4] },
    0.004,
  );
  return b.build();
}

// ---- The front sill ----

/** The front's window board: its height, and where its low glass stands (the outer edge, toward the camera). */
const SILL_H = 0.16;
const SILL_BOARD_T = 0.022;
const FRONT_GLASS_Z = 0.455;
const FRONT_GLASS_TOP = 0.34;
/** The window board's honed stone: a cool mid grey, so the kit on it reads and no station is outshone. */
export const SILL_STONE = 0x6f7176;

/**
 * The front's low wall: the curtain wall's dark spandrel (the façade's face
 * unchanged), a deep honed-stone window board on it with a darker nosing, where
 * the workshop leaves its kit, and the low glass at its outer edge (a dark
 * mullion at each unit's joint, a slim steel rail on top), so whatever
 * stands on the board shows over it.
 */
function frontSillModel(look: number): Model {
  const b = new ModelBuilder();
  b.box(1.0, SILL_H, 1.0, 0x525b66, { at: [0, SILL_H / 2, 0] }, 0);
  b.box(1.006, 0.012, 1.006, tint(0x525b66, -0.4), { at: [0, 0.006, 0] }, 0);
  for (const s of [1, -1])
    b.box(
      0.008,
      SILL_H - 0.05,
      0.004,
      tint(0x525b66, -0.3),
      {
        at: [((look + (s > 0 ? 0 : 1)) % 3) * 0.2 - 0.2, SILL_H / 2, s * 0.502],
      },
      0,
    );
  // The window board: honed stone, its veining, the darker nosing on the room side and a shadow under it.
  const y = SILL_H + SILL_BOARD_T / 2;
  b.box(1.0, SILL_BOARD_T, 0.92, SILL_STONE, { at: [0, y, -0.04] }, 0.004);
  for (const [z, w] of [
    [-0.32, 0.7],
    [-0.12, 0.5],
    [0.1, 0.8],
    [0.28, 0.4],
  ] as const)
    b.box(
      w,
      0.002,
      0.008,
      tint(WALNUT, -0.14),
      { at: [((look + w * 10) % 3) * 0.08 - 0.08, SILL_H + SILL_BOARD_T + 0.0005, z] },
      0,
    );
  b.box(1.0, SILL_BOARD_T + 0.006, 0.04, STONE, { at: [0, y, -0.5] }, 0.004);
  b.box(1.0, 0.006, 0.01, tint(STONE_DARK, -0.45), { at: [0, SILL_H - 0.004, -0.5] }, 0);
  // The low glass at the outer edge, its mullion and rail.
  const g0 = SILL_H;
  const gh = FRONT_GLASS_TOP - g0 - 0.02;
  b.box(1.0, 0.026, 0.06, MULLION, { at: [0, g0 + 0.013, FRONT_GLASS_Z] }, 0.004);
  b.pane(1.0, gh, 0.014, 0x6c8090, { at: [0, g0 + 0.026 + gh / 2, FRONT_GLASS_Z] });
  b.box(
    1.0,
    0.004,
    0.016,
    tint(0x6c8090, 0.45),
    { at: [0, g0 + 0.026 + gh * 0.7, FRONT_GLASS_Z] },
    0,
  );
  b.box(0.04, gh + 0.026, 0.04, MULLION, { at: [-0.49, g0 + (gh + 0.026) / 2, FRONT_GLASS_Z] }, 0);
  b.box(1.0, 0.02, 0.034, HEAD_TRACK, { at: [0, FRONT_GLASS_TOP - 0.01, FRONT_GLASS_Z] }, 0.004);
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
  for (let l = 0; l < SIDE_GLASS_LOOKS; l++) {
    for (const low of [false, true]) {
      out[sideGlassSwap('left', l, low)] = () => sideGlassModel(l, 1, low);
      out[sideGlassSwap('right', l, low)] = () => sideGlassModel(l, -1, low);
    }
  }
  for (let l = 0; l < FRONT_SILL_LOOKS; l++) out[frontSillSwap(l)] = () => frontSillModel(l);
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

/** A tile's brightness: ±2% per tile, picked by the tile and the level (placed wear does the rest). */
export function boardroomTone(x: number, y: number, salt: number): number {
  const own = ((Math.imul(x + 67, 73856093) ^ Math.imul(y + 17, 19349663) ^ salt) >>> 0) % 1001;
  return 1 + (own / 1000 - 0.5) * 0.04;
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

/** Sticky notes dropped on the carpet in a clump near a corner, two or three, one face down. */
function strayNotes(b: ModelBuilder, variant: number): void {
  const corner = variant % 4;
  const sx = corner % 2 ? 1 : -1;
  const sz = corner < 2 ? 1 : -1;
  const notes: [number, number, number][] = [
    [0.33, 0.3, 0.5],
    [0.2, 0.37, -0.3],
    [0.36, 0.14, 1.1],
  ];
  notes.forEach(([x, z, turn], k) => {
    if (k === 2 && variant === 1) return;
    const c = k === 1 ? tint(sticky(variant + k), -0.25) : sticky(variant + k + 1);
    mark(b, 0.13, 0.13, c, sx * x, sz * z, 0.003 + k * 0.0003, turn + variant);
    if (k !== 1)
      mark(b, 0.05, 0.008, tint(INK, 0.3), sx * x, sz * z, 0.0042 + k * 0.0003, turn + variant);
  });
}

/** The rug's ground (lum about 115 once lit, barely coloured), its walnut border and brass inlay. */
export const RUG = 0x5f5967;
const RUG_BAND = 0.08;
/** Its border: smoked walnut softened toward the rug (no dark frame mid-room), the brass inlay muted the same way. */
const RUG_EDGE = mix(RUG, WALNUT, 0.55);
const RUG_INLAY = mix(RUG, BRASS, 0.28);

/** The rug under the table's halves: a quiet ground, a soft walnut border band on its outer `edges`, a brass inlay inside it. */
function rugModel(b: ModelBuilder, edges: number, variant: number): void {
  broadloom(b, WHOLE, RUG, [tint(RUG, 0.08), tint(RUG, -0.08)], variant, 0.06);
  // The rug's own pile rows, the other way: it was laid on the good carpet.
  for (let k = 0; k < 6; k++) mark(b, 0.012, 1, tint(RUG, -0.04), -0.42 + k * 0.17, 0, 0.0014);
  const sides: [number, Area][] = [
    [1, { x0: -0.5, x1: -0.5 + RUG_BAND, z0: -0.5, z1: 0.5 }],
    [2, { x0: 0.5 - RUG_BAND, x1: 0.5, z0: -0.5, z1: 0.5 }],
    [4, { x0: -0.5, x1: 0.5, z0: -0.5, z1: -0.5 + RUG_BAND }],
    [8, { x0: -0.5, x1: 0.5, z0: 0.5 - RUG_BAND, z1: 0.5 }],
  ];
  for (const [bit, a] of sides) {
    if (!(edges & bit)) continue;
    mark(b, a.x1 - a.x0, a.z1 - a.z0, RUG_EDGE, (a.x0 + a.x1) / 2, (a.z0 + a.z1) / 2, 0.0022);
    // The walnut's outer arris, a shade darker.
    const outer = bit === 1 ? a.x0 : bit === 2 ? a.x1 : bit === 4 ? a.z0 : a.z1;
    const inner = bit === 1 ? a.x1 : bit === 2 ? a.x0 : bit === 4 ? a.z1 : a.z0;
    const step = bit === 1 || bit === 4 ? 1 : -1;
    if (bit < 4) {
      mark(b, 0.014, 1, tint(RUG_EDGE, -0.08), outer + step * 0.007, 0, 0.0026);
      mark(b, 0.012, 1, RUG_INLAY, inner + step * 0.03, 0, 0.0028);
    } else {
      mark(b, 1, 0.014, tint(RUG_EDGE, -0.08), 0, outer + step * 0.007, 0.0026);
      mark(b, 1, 0.012, RUG_INLAY, 0, inner + step * 0.03, 0.0028);
    }
  }
}

/** The slate's placed wear (`SLATE_WEAR` flags) over its carpet tiles. */
function slateWear(b: ModelBuilder, flags: number, variant: number): void {
  const F = SLATE_WEAR;
  if (flags & F.sun) {
    // Faded where the sun comes through the glass every afternoon.
    mark(b, 0.86, 0.72, tint(mix(SLATE, 0xa8a4a0, 0.25), 0.06), 0, 0, 0.0011);
    mark(b, 0.7, 0.56, tint(mix(SLATE, 0xa8a4a0, 0.3), 0.09), 0, 0, 0.0013);
  }
  const walk: [number, number, number][] = [
    [F.walkN, 0, -0.25],
    [F.walkS, 0, 0.25],
    [F.walkW, -0.25, 0],
    [F.walkE, 0.25, 0],
  ];
  if (flags & (F.walkN | F.walkS | F.walkW | F.walkE)) {
    mark(b, 0.5, 0.5, tint(SLATE, 0.11), 0, 0, 0.0018);
    mark(b, 0.26, 0.26, tint(SLATE, 0.16), 0, 0, 0.002);
    for (const [bit, x, z] of walk) {
      if (!(flags & bit)) continue;
      const alongX = x !== 0;
      mark(b, 0.5, 0.5, tint(SLATE, 0.11), x, z, 0.0018);
      mark(b, alongX ? 0.5 : 0.26, alongX ? 0.26 : 0.5, tint(SLATE, 0.16), x, z, 0.002);
    }
  }
  if (flags & F.castor) {
    for (const [x, z, a] of [
      [-0.12, 0.08, 0.2],
      [0.14, 0.02, 1.4],
      [0.0, -0.06, 2.6],
    ] as const)
      b.torus(
        0.35,
        0.016,
        tint(SLATE, -0.2),
        { at: [x, 0.0024, z], rot: [Math.PI / 2, 0, a] },
        Math.PI * 0.55,
      );
  }
  if (flags & F.scuff) {
    scuffs(b, variant, tint(SLATE, 0.16));
    scuffs(b, variant + 7, tint(SLATE, -0.16));
  }
  if (flags & F.sticky) strayNotes(b, variant);
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
  if (wear >= W.rug && wear < W.terrazzo) {
    rugModel(b, wear - W.rug, variant);
    return b.build();
  }
  if (wear >= W.boardroom && wear < W.rug) {
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
  // Carpet tiles, half a tile square, each quarter's pile a touch lighter or darker (faint: wear reads over it).
  for (const [qx, qz] of [
    [-0.25, -0.25],
    [0.25, 0.25],
  ] as const)
    mark(b, 0.49, 0.49, tint(SLATE, variant === 1 ? -0.006 : 0.006), qx, qz, 0.0004);
  mark(b, 1, 0.006, tint(SLATE, -0.07), 0, 0, 0.0021);
  mark(b, 0.006, 1, tint(SLATE, -0.07), 0, 0, 0.0021);
  mark(b, 1, 0.006, tint(SLATE, -0.07), 0, -0.497, 0.0021);
  mark(b, 0.006, 1, tint(SLATE, -0.07), -0.497, 0, 0.0021);
  slateWear(b, wear - W.slate, variant);
  return b.build();
}

// ---- Counters ----

/** The credenzas' walnut top (darker than every station top), its edge, the dark body. */
export const COUNTER_TOP = 0x4a3a2e;
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
/** How far back the boards lean (toward the corridor), so they show their face to the camera without catching the sky. */
const BOARD_LEAN = 0.64;
/** The boards' height on the stubs: low, so the corridor behind still reads. */
export const BOARD_H = 0.5;
/** The whiteboards' face: a used, matt board (never the brightest thing in the room), and the foam board's. */
export const BOARD_FACE = 0x64635f;
const FOAM_FACE = 0x68645e;
/** How much of a board run's length is left free at each end for the workshop's kit. */
const BOARD_END = 0.4;

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

/** The stubs' kit a little over life size, so it reads from the camera at the back of the hall. */
const STUB_KIT = 1.35;
/** A frame standing on a stub's cap at (x, z), turned `turn`, at the kit's size. */
const onCap = (b: ModelBuilder, x: number, z: number, turn = 0) =>
  framed(b, [x, STUB_TOP, z], [0, turn, 0], STUB_KIT);

/** The workshop timer: a dark cube, its red countdown, the button on top. */
function timerCube(b: ModelBuilder, x: number, z: number, turn = 0): void {
  const g = onCap(b, x, z, turn);
  g.box(0.12, 0.12, 0.12, 0x3a3f46, { at: [0, 0.06, 0] }, 0.014);
  g.box(0.09, 0.05, 0.004, 0x1a1214, { at: [0, 0.07, 0.061] }, 0);
  text(g, '4:59', 0, 0.07, 0.064, 0.0045, 0xe8584a);
  g.cylinder(0.022, 0.022, 0.012, RED, { at: [0, 0.126, 0] }, 10);
}

/** A Bluetooth speaker lying on its side, its violet light ring at the end. */
function speakerPill(b: ModelBuilder, x: number, z: number, turn = 0): void {
  const g = onCap(b, x, z, turn);
  g.cylinder(0.05, 0.05, 0.22, 0x2e3238, { at: [0, 0.05, 0], rot: [0, 0, Math.PI / 2] }, 14);
  for (const s of [-1, 1])
    g.cylinder(
      0.051,
      0.051,
      0.012,
      0x4a4f57,
      { at: [s * 0.11, 0.05, 0], rot: [0, 0, Math.PI / 2] },
      14,
    );
  g.torus(0.034, 0.006, DOT_VIOLET, { at: [0.118, 0.05, 0], rot: [0, Math.PI / 2, 0] });
  g.box(0.1, 0.004, 0.03, 0x4a4f57, { at: [0, 0.1, 0] }, 0);
}

/** A stack of sticky-note pads, each a little turned, the top one written on. */
function stickyStack(b: ModelBuilder, x: number, z: number, seed: number): void {
  const g = onCap(b, x, z);
  for (let k = 0; k < 3; k++)
    g.box(
      0.1,
      0.03,
      0.1,
      sticky(seed + k),
      { at: [0, 0.015 + k * 0.03, 0], rot: [0, (rnd(seed, k) - 0.5) * 0.8, 0] },
      0,
    );
  g.box(0.05, 0.002, 0.008, INK, { at: [0, 0.091, 0], rot: [0, 0.3, 0] }, 0);
}

/** An A4 sign in a clear acrylic stand, leaned back to the camera, its lines in marker. */
function a4Sign(
  b: ModelBuilder,
  x: number,
  z: number,
  lines: readonly [string, number][],
  turn = 0,
): void {
  const g = onCap(b, x, z, turn);
  g.add(new THREE.BoxGeometry(0.22, 0.016, 0.1), 0xdfe8ee, { at: [0, 0.008, 0] }, 'glass');
  const p = framed(g, [0, 0.016, -0.02], [-0.42, 0, 0]);
  p.box(0.2, 0.28, 0.004, 0xe9e6df, { at: [0, 0.14, 0] }, 0);
  p.add(new THREE.BoxGeometry(0.21, 0.29, 0.003), 0xdfe8ee, { at: [0, 0.14, 0.004] }, 'glass');
  lines.forEach(([t, c], k) => {
    text(p, t, 0, 0.22 - k * 0.06, 0.0025, Math.min(0.0075, 0.17 / (t.length * 4)), c);
  });
}

/** A tray of markers lying in a row, caps in four colours. */
function markerCaddy(b: ModelBuilder, x: number, z: number, turn = 0): void {
  const g = onCap(b, x, z, turn);
  g.box(0.2, 0.03, 0.1, 0x3a3f46, { at: [0, 0.015, 0] }, 0.006);
  [0x2a2e34, RED, 0x2f5aa8, 0x2f8a4a].forEach((c, k) => {
    g.cylinder(
      0.011,
      0.011,
      0.15,
      0xe9e8e2,
      { at: [-0.01, 0.034, -0.033 + k * 0.022], rot: [0, 0, Math.PI / 2] },
      8,
    );
    g.cylinder(
      0.012,
      0.012,
      0.04,
      c,
      { at: [0.08, 0.034, -0.033 + k * 0.022], rot: [0, 0, Math.PI / 2] },
      8,
    );
  });
}

/** A presenter's clicker, a red dot on its tip. */
function clickerOn(b: ModelBuilder, x: number, z: number, turn = 0): void {
  const g = onCap(b, x, z, turn);
  g.box(0.05, 0.02, 0.13, 0x24272c, { at: [0, 0.01, 0] }, 0.01);
  g.cylinder(0.008, 0.008, 0.004, RED, { at: [0, 0.022, 0.04] }, 8);
  g.box(0.02, 0.004, 0.03, 0x5f676f, { at: [0, 0.022, -0.01] }, 0.002);
}

/** A grey watering can, its spout over the planter: someone looks after Prod. */
function wateringCan(b: ModelBuilder, x: number, z: number, turn = 0): void {
  const g = onCap(b, x, z, turn);
  g.cylinder(0.06, 0.065, 0.13, 0x7f8c8a, { at: [0, 0.065, 0] }, 14);
  g.cylinder(0.061, 0.061, 0.01, tint(0x7f8c8a, -0.2), { at: [0, 0.13, 0] }, 14);
  g.cylinder(0.01, 0.014, 0.16, 0x7f8c8a, { at: [-0.1, 0.12, 0], rot: [0, 0, 0.9] }, 8);
  g.torus(0.045, 0.008, tint(0x7f8c8a, -0.15), { at: [0.03, 0.14, 0], rot: [0, 0, 0.3] }, Math.PI);
}

/** A cup of pens. */
function penCup(b: ModelBuilder, x: number, z: number): void {
  const g = onCap(b, x, z);
  g.cylinder(0.04, 0.036, 0.09, 0x3a3f46, { at: [0, 0.045, 0] }, 12);
  [0x2a2e34, RED, 0x2f5aa8].forEach((c, k) =>
    g.cylinder(0.007, 0.007, 0.13, c, {
      at: [(k - 1) * 0.014, 0.11, 0],
      rot: [(k - 1) * 0.2, 0, (k - 1) * 0.25],
    }),
  );
}

/** A cap with its lip: dark honed stone, a light arris along the long edges, a shadow reveal under it. */
function stoneCap(b: ModelBuilder, h: number): void {
  b.box(1.0, 0.008, 1.0, tint(STONE_DARK, -0.45), { at: [0, h - 0.034, 0] }, 0);
  b.box(1.04, 0.03, 1.04, STONE, { at: [0, h - 0.015, 0] }, 0.006);
  b.box(1.0, 0.003, 1.0, tint(STONE, 0.06), { at: [0, h + 0.0005, 0] }, 0);
  for (const s of [-1, 1])
    b.box(1.04, 0.006, 0.01, tint(STONE, 0.22), { at: [0, h - 0.002, s * 0.515] }, 0);
}

/** A board on a stub run `span` tiles from the origin tile, leaned back, its face built by `face` (in board space, +z out); its ends left free. */
function leanedBoard(
  span: number,
  frame: number,
  face: number,
  build: (g: ModelBuilder, w: number) => void,
  kit: (b: ModelBuilder) => void,
): Model {
  const b = new ModelBuilder();
  kit(b);
  const w = span - 2 * BOARD_END;
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
  // Ghosts of old diagrams, wiped but not quite.
  for (let k = 0; k < 4; k++)
    g.box(
      0.12 + rnd(k, span) * 0.2,
      0.006,
      0.002,
      tint(face, -0.07),
      {
        at: [-w / 2 + 0.15 + k * (w / 4.4), 0.12 + rnd(span, k) * 0.25, 0.0185],
        rot: [0, 0, (rnd(k, 9) - 0.5) * 0.6],
      },
      0,
    );
  build(g, w);
  stubFaceNotes(b, span, span * 3 + 1);
  return b.build();
}

/**
 * The IDEAS board: a whiteboard full of sticky notes in columns, a marker
 * tray with markers and an eraser; at its ends the workshop timer and a
 * stack of pads, the Bluetooth speaker and an A4 sign pointing to the
 * parking lot (Prod).
 */
function ideasBoardModel(span: number): Model {
  const right = span - 1 + 0.5 - BOARD_END / 2;
  return leanedBoard(
    span,
    0x9aa1a8,
    BOARD_FACE,
    (g, w) => {
      g.box(w * 0.34, 0.07, 0.003, YOTTA_VIOLET, { at: [-w * 0.28, BOARD_H - 0.055, 0.019] }, 0);
      text(g, 'IDEAS', -w * 0.28, BOARD_H - 0.055, 0.021, 0.011, 0xe9e6df);
      text(g, '> SYNERGY', w * 0.2, BOARD_H - 0.055, 0.019, 0.008, INK);
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
      g.box(w - 0.1, 0.02, 0.05, 0x8e959c, { at: [0, 0.0, 0.03] }, 0.004);
      for (let k = 0; k < 4; k++)
        g.cylinder(
          0.009,
          0.009,
          0.1,
          k % 2 ? RED : 0x2f5aa8,
          { at: [-w / 2 + 0.16 + k * 0.1, 0.016, 0.03], rot: [0, 0, Math.PI / 2] },
          8,
        );
      g.box(0.1, 0.03, 0.04, 0x2e3238, { at: [w / 2 - 0.16, 0.025, 0.03] }, 0.006);
    },
    (b) => {
      timerCube(b, -0.3, -0.18, 0.3);
      stickyStack(b, -0.3, 0.22, 3);
      speakerPill(b, right, -0.2, Math.PI / 2 - 0.2);
      a4Sign(b, right, 0.2, [
        ['PARKING', INK],
        ['LOT', INK],
        ['-->', YOTTA_VIOLET],
      ]);
    },
  );
}

/** HOW MIGHT WE… SYNERGIZE? on a foam board, a row of answers stuck under it; at its ends the house rules, markers, pads and the clicker. */
function howMightWeModel(span: number): Model {
  const right = span - 1 + 0.5 - BOARD_END / 2;
  return leanedBoard(
    span,
    0x2e3238,
    FOAM_FACE,
    (g, w) => {
      text(g, 'HOW MIGHT WE...', -w * 0.06, BOARD_H - 0.07, 0.019, 0.013, 0xe9e6df);
      text(g, '...SYNERGIZE?', w * 0.1, BOARD_H - 0.17, 0.019, 0.013, YOTTA_VIOLET);
      g.box(w * 0.6, 0.008, 0.003, RED, { at: [w * 0.1, BOARD_H - 0.225, 0.019] }, 0);
      noteField(g, 0, 0.075, 0.018, w - 0.12, 0.1, Math.round(w * 7), 1, 5, 0.07);
    },
    (b) => {
      a4Sign(b, -0.3, 0.2, [
        ['NO BAD', INK],
        ['IDEAS*', INK],
        ['*SOME', RED],
      ]);
      markerCaddy(b, -0.3, -0.2, Math.PI / 2 + 0.2);
      stickyStack(b, right, 0.22, 7);
      clickerOn(b, right, -0.18, 0.5);
    },
  );
}

/** How much bigger than life Prod stands, so he reads as the room's tree. */
const PROD_GROW = 1.2;

/**
 * Prod as the workshop's parking lot: a small tree in a big walnut planter,
 * sticky notes stuck all over its leaves, PARKING LOT on the pot, a stake
 * sign of its own; parked ideas lying on the cap in front, a stack of pads,
 * a cup of pens and a watering can (someone looks after him).
 */
function prodModel(): Model {
  const root = new ModelBuilder();
  // Prod himself, grown about the stub's front edge on the cap.
  const b = framed(
    root,
    [0, STUB_TOP * (1 - PROD_GROW), 0.5 * (1 - PROD_GROW)],
    [0, 0, 0],
    PROD_GROW,
  );
  const y = STUB_TOP;
  const z = -0.02;
  b.box(0.46, 0.2, 0.46, WALNUT, { at: [0, y + 0.1, z] }, 0.02);
  b.box(0.48, 0.02, 0.48, WALNUT_DARK, { at: [0, y + 0.2, z] }, 0.006);
  b.box(0.42, 0.01, 0.42, 0x4a3a2c, { at: [0, y + 0.205, z] }, 0);
  b.box(0.36, 0.06, 0.004, 0xe9e6df, { at: [0, y + 0.1, z + 0.232] }, 0);
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
  // Parked ideas lying on the cap in front of him, the kit at his sides.
  for (let k = 0; k < 3; k++)
    root.box(
      0.1,
      0.003,
      0.1,
      sticky(k + 2),
      {
        at: [-0.16 + k * 0.15, y + 0.002 + k * 0.0004, 0.36 + (k % 2) * 0.05],
        rot: [0, (k - 1) * 0.4, 0],
      },
      0,
    );
  stickyStack(root, -0.42, 0.26, 5);
  penCup(root, -0.42, -0.24);
  wateringCan(root, 0.41, -0.06, -0.3);
  return root.build();
}

/**
 * The visitors' welcome on the stub beside the right pocket (no name cards
 * here: they wait on the table): a walnut tray of visitor badges on
 * lanyards, YOTTA violet and MONOLITH black, a VISITORS tent card, the
 * coffee urn with its tap and drip tray, a stack of paper cups.
 */
function badgeTrayModel(): Model {
  const b = new ModelBuilder();
  const y = STUB_TOP;
  // The tray and its badges in two rows, leaned in their slots.
  const t = onCap(b, -0.16, 0.1, 0.12);
  t.box(0.42, 0.03, 0.26, WALNUT, { at: [0, 0.015, 0] }, 0.008);
  t.box(0.38, 0.01, 0.22, WALNUT_DARK, { at: [0, 0.028, 0] }, 0);
  for (let r = 0; r < 2; r++)
    for (let k = 0; k < 5; k++) {
      const g = framed(t, [-0.15 + k * 0.075, 0.03, -0.05 + r * 0.1], [-0.5, 0, 0]);
      g.box(0.064, 0.09, 0.004, 0xe9e6df, { at: [0, 0.045, 0] }, 0);
      g.box(0.064, 0.022, 0.005, (k + r) % 2 ? BLACK : YOTTA_VIOLET, { at: [0, 0.078, 0] }, 0);
      g.box(0.03, 0.006, 0.005, INK, { at: [0, 0.04, 0] }, 0);
    }
  // Lanyards coiled at the tray's end.
  for (let k = 0; k < 3; k++)
    t.torus(0.04, 0.006, k === 1 ? BLACK : YOTTA_VIOLET, {
      at: [0.17 + (k % 2) * 0.02, 0.034 + k * 0.006, -0.06 + k * 0.05],
      rot: [Math.PI / 2, 0, 0],
    });
  // VISITORS, on a tent card behind the tray.
  const c = onCap(b, -0.2, -0.27, -0.08);
  for (const s of [1, -1]) {
    const f = framed(c, [0, 0, s * 0.035], [s * 0.5, s > 0 ? 0 : Math.PI, 0]);
    f.box(0.3, 0.12, 0.004, BLACK, { at: [0, 0.06, 0] }, 0);
    text(f, 'VISITORS', 0, 0.06, 0.003, 0.0085, 0xe9e6df);
  }
  // The coffee urn: black base and lid, brushed body, the tap and its drip tray, a paper label.
  const u = onCap(b, 0.26, -0.16);
  u.box(0.2, 0.04, 0.22, BLACK, { at: [0, 0.02, 0] }, 0.01);
  u.cylinder(0.085, 0.085, 0.28, STEEL, { at: [0, 0.18, 0] }, 18);
  u.cylinder(0.088, 0.088, 0.02, tint(STEEL, -0.25), { at: [0, 0.1, 0] }, 18);
  u.cylinder(0.08, 0.09, 0.04, BLACK, { at: [0, 0.34, 0] }, 18);
  u.cylinder(0.02, 0.02, 0.03, BLACK, { at: [0, 0.37, 0] }, 10);
  u.box(0.03, 0.03, 0.05, BLACK, { at: [0, 0.09, 0.1] }, 0.006);
  u.box(0.012, 0.03, 0.012, BLACK, { at: [0, 0.07, 0.12] }, 0);
  u.box(0.1, 0.012, 0.08, tint(STEEL, -0.3), { at: [0, 0.046, 0.13] }, 0.004);
  u.box(0.09, 0.05, 0.004, 0xe9e6df, { at: [0, 0.22, 0.086] }, 0);
  text(u, 'COFFEE', 0, 0.22, 0.089, 0.0042, INK);
  // Paper cups, stacked, and one left out.
  b.cylinder(0.034, 0.028, 0.17, 0xe9e6df, { at: [0.34, y + 0.085, 0.2] }, 12);
  for (let k = 1; k < 6; k++)
    b.cylinder(0.035, 0.035, 0.004, tint(0xe9e6df, -0.12), { at: [0.34, y + k * 0.028, 0.2] }, 12);
  b.cylinder(0.034, 0.026, 0.07, 0xe9e6df, { at: [0.2, y + 0.035, 0.33] }, 12);
  b.cylinder(0.03, 0.03, 0.002, 0x4a3426, { at: [0.2, y + 0.068, 0.33] }, 12);
  stubFaceNotes(b, 1, 13);
  return b.build();
}

/** A stub with only notes on it: a row on its face, a pad, the timer and a speaker on its cap. */
function stubNotesModel(): Model {
  const b = new ModelBuilder();
  stubFaceNotes(b, 1, 17);
  stickyStack(b, 0.22, 0.12, 2);
  timerCube(b, -0.2, -0.1, 0.4);
  speakerPill(b, 0.1, -0.25, 0.2);
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
      return prodModel();
    case 'badgeTray':
      return badgeTrayModel();
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
