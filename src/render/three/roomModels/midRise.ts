import * as THREE from 'three';
import { type WallPiece, tileHash } from '../../mapShape';
import { type Model, ModelBuilder, type Place, tint } from '../kit';
import { FRONT_WALL_HEIGHT, SLAB_DEPTH, STATION_HEIGHT, WALL_HEIGHT } from '../layout';
import { FLOOR_COLORS, WALL_COLORS } from '../look';
import type { CounterRun } from '../rooms/counterRun';
import {
  CARPET_WEAR,
  CARPET_WEAR_KINDS,
  MID_RISE_ART_HALF,
  PENDANT_HALF,
  PENDANT_WIRE,
  SOLID_LOOKS,
  STAIN_CORNERS,
  glassSwap,
  solidSwap,
} from '../rooms/midRiseRoom';
import type { StationModel } from '../stationModels';
import { framed, text } from './basement';

/**
 * A rented floor of a mid-rise office building (wall theme `midRise`, floor
 * theme `corporateCarpet`), built in code: plasterboard-and-glass office
 * partitions (light grey plasterboard on a brushed-aluminium skirting, a
 * glass band with a frosted YOTTA-violet manifestation stripe in slim
 * aluminium frames, a slim aluminium head track on top), solid panels where
 * art hangs, new two-tone carpet tiles with their placed wear, the floor
 * slab over the ceiling void of the floor below as the diorama's base,
 * light-oak bench desks on a grey cable spine, reception's pass-through at
 * the inbox, what hangs on the partitions, the chairs at the lone desks
 * (Derek's leather one) and the linear LED pendants on their wire.
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
    (u, y) => ({ at: [-u, y, -half], rot: [0, Math.PI, 0] }),
    (u, y) => ({ at: [-half, y, u], rot: [0, -Math.PI / 2, 0] }),
    (u, y) => ({ at: [half, y, -u], rot: [0, Math.PI / 2, 0] }),
  ];
}

// ---- Materials ----

/** Brushed aluminium: the frames, the transom and skirting, a darker edge. */
export const ALU = 0xb3b9bf;
const ALU_DARK = 0x8d949b;
/** What's seen through the glass band: a cool mid grey-blue, never a bright slab. */
export const GLASS_CORE = 0x93a1ab;
const GLASS_PANE = 0xdbe7ee;
const GLASS_GLINT = 0xb9c6ce;
const FROST = 0xc3cbd1;
/** YOTTA violet: the vinyl logo, and the manifestation dots muted. */
export const YOTTA_VIOLET = 0x6a4cc0;
const MANIFEST = 0x8676b8;
/** The desks: light oak veneer (darker than every station top), the grey cable spine, aluminium legs. */
export const DESK_TOP = 0xbb9f78;
const DESK_EDGE = 0x9a7f5a;
const SPINE = 0x6a7078;
const LEG = 0xa7adb3;
/** Paper, ink, a marker. */
const PAPER = 0xe2e2dc;
const INK = 0x2a2d33;
const SCREEN = 0x1d3550;
const PLASTIC = 0x34373d;

// ---- Walls ----

const SKIRT_H = 0.06;
/** The plasterboard's top, the transom over it, the head track's height. */
const PB_H = 0.56;
const TRANSOM_H = 0.034;
const HEAD_H = 0.05;
const GLASS0 = PB_H + TRANSOM_H;
const GLASS1 = WALL_HEIGHT - HEAD_H;
/** Where the frosted manifestation stripe runs. */
const MANIFEST_Y = GLASS0 + (GLASS1 - GLASS0) * 0.45;
/** Looks a partition comes in: a socket, trolley scuffs, a patched dent, plain. */
export const MID_RISE_WALL_LOOKS = 4;

/**
 * The head track on top of a partition `h` tall: a slim aluminium lip band
 * round it a little proud of the faces, and on top a slim aluminium frame
 * round the cool glass-grey infill (the double glazing seen from above),
 * a faint glint across it. A run reads as framed glass modules, never as a
 * row of flat slabs.
 */
function headTrack(b: ModelBuilder, h: number, lip = 0.035): void {
  const { top } = WALL_COLORS.midRise;
  const rim = 0.04;
  b.box(1.02, lip, 1.02, ALU, { at: [0, h - 0.004 - lip / 2, 0] }, 0);
  b.box(1.016, 0.006, 1.016, tint(ALU_DARK, -0.4), { at: [0, h - 0.004 - lip - 0.003, 0] }, 0);
  b.box(1, 0.02, 1, top, { at: [0, h - 0.01, 0] }, 0);
  for (const s of [-1, 1]) {
    b.box(1.02, 0.004, rim, ALU, { at: [0, h + 0.001, s * (0.51 - rim / 2)] }, 0);
    b.box(rim, 0.004, 1.02, ALU, { at: [s * (0.51 - rim / 2), h + 0.001, 0] }, 0);
    // The brushed sheen along the lip's top edge.
    b.box(1.02, 0.002, 0.006, tint(ALU, 0.25), { at: [0, h + 0.004, s * 0.507] }, 0);
    b.box(0.006, 0.002, 1.02, tint(ALU, 0.25), { at: [s * 0.507, h + 0.004, 0] }, 0);
  }
  // A glint across the glass-grey infill.
  b.box(0.08, 0.002, 0.7, tint(top, 0.1), { at: [0.05, h + 0.0012, 0], rot: [0, 0.75, 0] }, 0);
  b.box(0.03, 0.002, 0.5, tint(top, 0.1), { at: [0.2, h + 0.0012, 0.08], rot: [0, 0.75, 0] }, 0);
}

/** Plasterboard joints and the look's wear on a face from the skirting up to `y1`. */
function plasterboard(b: ModelBuilder, on: Face, f: number, look: number, y1: number): void {
  const { face } = WALL_COLORS.midRise;
  const seam = tint(face, -0.12);
  // Sheets 1.2 wide: one joint a tile, shifted by look and face.
  const u = [-0.3, 0.18, 0.42, -0.08][(look + f) % 4] ?? 0;
  b.box(0.01, y1 - SKIRT_H - 0.01, 0.004, seam, on(u, (y1 + SKIRT_H) / 2), 0);
  const mark = (w: number, hh: number, color: number, uu: number, y: number, turn = 0) => {
    const p = on(uu, y);
    b.box(w, hh, 0.006, color, { at: p.at, rot: [0, p.rot?.[1] ?? 0, turn] }, 0);
  };
  if (f >= 2) return;
  if (look === 0) {
    // A double socket and a data point on the plasterboard over the skirting.
    mark(0.14, 0.07, 0xeeeeea, 0.2, 0.15);
    mark(0.026, 0.03, 0x4a4d52, 0.165, 0.15);
    mark(0.026, 0.03, 0x4a4d52, 0.235, 0.15);
    mark(0.065, 0.065, 0xeeeeea, 0.34, 0.15);
    mark(0.024, 0.024, 0x3d6fa8, 0.34, 0.15);
  } else if (look === 1) {
    // Trolley-height scuffs: the post trolley and the cleaner's cart.
    for (const [uu, y, w, r] of [
      [-0.28, 0.2, 0.18, 0.04],
      [-0.12, 0.24, 0.1, -0.05],
      [0.16, 0.18, 0.15, 0.06],
    ] as const)
      mark(w, 0.012, tint(face, -0.2), uu, y, r);
  } else if (look === 2) {
    // A dent filled and painted a shade paler, never sanded.
    mark(0.1, 0.08, tint(face, 0.08), -0.14, 0.36);
    mark(0.04, 0.03, tint(face, -0.1), -0.13, 0.355);
  }
}

/**
 * The glass band on a face: the frosted stripe with its row of small violet
 * dashes, a diagonal glint, the mullion at the face's −u end (so every
 * corner of a tile gets one, and the run reads framed every tile).
 */
function glassBand(b: ModelBuilder, on: Face, inset: Face, f: number): void {
  const h = GLASS1 - GLASS0;
  const cy = GLASS0 + h / 2;
  b.box(0.028, h, 0.012, ALU, on(-0.486, cy), 0);
  // The frosted band and its dashes.
  b.box(0.97, 0.07, 0.004, FROST, inset(0, MANIFEST_Y), 0);
  for (let k = 0; k < 9; k++)
    b.box(0.045, 0.02, 0.004, MANIFEST, on(-0.4 + k * 0.1, MANIFEST_Y), 0);
  // A glint across the glass, low on one face, higher on the next.
  const g = inset(0.12 * (f % 2 ? -1 : 1), cy + 0.05);
  b.box(0.05, h * 0.9, 0.003, GLASS_GLINT, { at: g.at, rot: [0, g.rot?.[1] ?? 0, 0.6] }, 0);
  const g2 = inset(0.24 * (f % 2 ? -1 : 1), cy + 0.06);
  b.box(0.018, h * 0.7, 0.003, GLASS_GLINT, { at: g2.at, rot: [0, g2.rot?.[1] ?? 0, 0.6] }, 0);
}

/** The low front wall: plasterboard on its skirting under a slim track, a joint per `look`. */
function lowWall(b: ModelBuilder, look: number): void {
  const { face } = WALL_COLORS.midRise;
  const h = FRONT_WALL_HEIGHT;
  b.box(1, h - 0.03, 1, face, { at: [0, (h - 0.03) / 2, 0] }, 0);
  b.box(1.012, SKIRT_H, 1.012, ALU_DARK, { at: [0, SKIRT_H / 2, 0] }, 0);
  for (const on of faces(0.503))
    b.box(
      0.01,
      h - SKIRT_H - 0.04,
      0.004,
      tint(face, -0.12),
      on(-0.3 + 0.4 * (look % 2), (h + SKIRT_H) / 2 - 0.02),
      0,
    );
  headTrack(b, h, 0.026);
}

/**
 * A partition of the floor: light grey plasterboard on a brushed-aluminium
 * skirting up to a transom rail, over it a glass band (a cool core seen
 * through clear panes, the frosted manifestation stripe, glints, slim
 * mullions), under a slim aluminium head track. `look` adds wear on the
 * plasterboard. The low front wall is plasterboard on its skirting under a
 * slim track.
 */
export function midRiseWallModel(piece: WallPiece, look: number): Model {
  const { face } = WALL_COLORS.midRise;
  const b = new ModelBuilder();
  if (piece === 'wall-front') {
    lowWall(b, look);
    return b.build();
  }
  const h = WALL_HEIGHT;
  b.box(1, PB_H, 1, face, { at: [0, PB_H / 2, 0] }, 0);
  b.box(1.012, SKIRT_H, 1.012, ALU_DARK, { at: [0, SKIRT_H / 2, 0] }, 0);
  b.box(1.014, 0.004, 1.014, tint(ALU, 0.2), { at: [0, SKIRT_H, 0] }, 0);
  b.box(1.016, TRANSOM_H, 1.016, ALU, { at: [0, PB_H + TRANSOM_H / 2, 0] }, 0);
  b.box(1.018, 0.004, 1.018, tint(ALU, 0.25), { at: [0, PB_H + TRANSOM_H, 0] }, 0);
  b.box(0.96, GLASS1 - GLASS0, 0.96, GLASS_CORE, { at: [0, (GLASS0 + GLASS1) / 2, 0] }, 0);
  const outer = faces(0.506);
  const inner = faces(0.482);
  outer.forEach((on, f) => {
    plasterboard(b, on, f, look, PB_H);
    glassBand(b, on, inner[f] ?? on, f);
  });
  for (const on of faces(0.5)) {
    const p = on(0, (GLASS0 + GLASS1) / 2);
    b.pane(1, GLASS1 - GLASS0, 0.006, GLASS_PANE, p);
  }
  headTrack(b, h);
  return b.build();
}

/**
 * A solid partition panel (where art hangs): plasterboard full height on
 * the skirting, under the same head track, a joint per `look`, a slim
 * aluminium frame strip at its corners so it sits in the run's grid.
 */
export function solidPanelModel(look: number): Model {
  const { face } = WALL_COLORS.midRise;
  const b = new ModelBuilder();
  const h = WALL_HEIGHT;
  b.box(1, h - HEAD_H, 1, face, { at: [0, (h - HEAD_H) / 2, 0] }, 0);
  b.box(1.012, SKIRT_H, 1.012, ALU_DARK, { at: [0, SKIRT_H / 2, 0] }, 0);
  b.box(1.014, 0.004, 1.014, tint(ALU, 0.2), { at: [0, SKIRT_H, 0] }, 0);
  faces(0.505).forEach((on, f) => {
    b.box(0.024, h - HEAD_H - SKIRT_H, 0.01, ALU, on(-0.488, (h - HEAD_H + SKIRT_H) / 2), 0);
    const u = [0.3, -0.22][(look + f) % 2] ?? 0;
    b.box(
      0.01,
      h - HEAD_H - SKIRT_H - 0.02,
      0.004,
      tint(face, -0.1),
      on(u, (h - HEAD_H + SKIRT_H) / 2),
      0,
    );
  });
  headTrack(b, h);
  return b.build();
}

/** Every solid-panel swap model, by its name in the plan's `swaps`. */
export const SOLID_MODELS: Readonly<Record<string, () => Model>> = Object.fromEntries(
  Array.from({ length: SOLID_LOOKS }, (_, look) => [solidSwap(look), () => solidPanelModel(look)]),
);

/**
 * A low wall of Derek's office or the meeting room with a frameless glass
 * screen on its top along `along` (x, z or both at a corner): the low
 * partition, a slim aluminium shoe and top channel, the glass with its
 * frosted dots, so the rooms read as glass boxes without hiding anyone.
 */
export function glassScreenModel(along: 'x' | 'z' | 'xz', look: number): Model {
  const b = new ModelBuilder();
  lowWall(b, look);
  const y0 = FRONT_WALL_HEIGHT;
  const hh = GLASS_SCREEN_H;
  for (const turn of along === 'xz' ? [0, Math.PI / 2] : along === 'z' ? [Math.PI / 2] : [0]) {
    const g = framed(b, [0, 0, 0], [0, turn, 0]);
    g.box(1.0, 0.03, 0.05, ALU, { at: [0, y0 + 0.015, 0] }, 0.006);
    g.pane(1.0, hh, 0.012, GLASS_PANE, { at: [0, y0 + 0.03 + hh / 2, 0] });
    g.box(1.0, 0.018, 0.026, ALU, { at: [0, y0 + 0.03 + hh + 0.009, 0] }, 0.004);
    for (let k = 0; k < 9; k++)
      g.box(0.045, 0.018, 0.016, MANIFEST, { at: [-0.4 + k * 0.1, y0 + 0.03 + hh * 0.55, 0] }, 0);
    g.box(
      0.05,
      hh * 0.85,
      0.014,
      GLASS_GLINT,
      { at: [0.15, y0 + 0.03 + hh / 2, 0], rot: [0, 0, 0.6] },
      0,
    );
  }
  return b.build();
}

/** How tall the glass screens on the rooms' low walls stand over the wall. */
export const GLASS_SCREEN_H = 0.42;

/** Every glass-screen swap model, by its name in the plan's `swaps`. */
export const GLASS_SCREEN_MODELS: Readonly<Record<string, () => Model>> = Object.fromEntries(
  (['x', 'z', 'xz'] as const).map((along) => [glassSwap(along), () => glassScreenModel(along, 1)]),
);

// ---- The foundation: the floor slab over the ceiling void of the floor below ----

/** Looks the foundation comes in: plain, a duct in the void, a sprinkler pipe. */
export const MID_RISE_FOUNDATION_LOOKS = 3;
const SLAB = 0xa9aba9;
const VOID_DARK = 0x3a3f46;
const CEILING = 0xd9dbd8;

/**
 * Under each tile, the diorama's base: we're up on a floor of the building,
 * so it's a cut through it: the carpet's edge, the concrete slab with its
 * steel deck under, the ceiling void of the floor below (a duct or a red
 * sprinkler pipe through it by `look`, its hangers) and that floor's white
 * suspended ceiling grid at the bottom.
 */
export function midRiseFoundationModel(look: number): Model {
  const b = new ModelBuilder();
  const top = -0.013;
  const bottom = top - SLAB_DEPTH;
  const slabH = 0.16;
  const ceilH = 0.06;
  const slabBottom = top - slabH;
  const ceilTop = bottom + ceilH;
  b.box(1.004, slabH, 1.004, SLAB, { at: [0, top - slabH / 2, 0] }, 0);
  // The carpet's edge over the slab, then the screed line.
  b.box(
    1.008,
    0.014,
    1.008,
    mix(FLOOR_COLORS.corporateCarpet[0], 0x5a6068, 0.3),
    { at: [0, top - 0.007, 0] },
    0,
  );
  b.box(1.006, 0.006, 1.006, tint(SLAB, 0.12), { at: [0, top - 0.02, 0] }, 0);
  // The steel deck's ribs under the slab.
  b.box(1.004, 0.03, 1.004, 0x8a9096, { at: [0, slabBottom - 0.015, 0] }, 0);
  b.box(
    0.98,
    slabBottom - 0.03 - ceilTop,
    0.98,
    VOID_DARK,
    { at: [0, (slabBottom - 0.03 + ceilTop) / 2, 0] },
    0,
  );
  b.box(1.004, ceilH, 1.004, CEILING, { at: [0, bottom + ceilH / 2, 0] }, 0);
  faces(0.503).forEach((on, f) => {
    for (const u of [-0.375, -0.125, 0.125, 0.375])
      b.box(0.06, 0.012, 0.004, tint(0x8a9096, -0.25), on(u, slabBottom - 0.02), 0);
    // A form-joint in the slab, and a few pores.
    b.box(
      0.006,
      slabH - 0.03,
      0.004,
      tint(SLAB, -0.12),
      on(-0.5 + 0.5 * ((f + look) % 2), top - slabH / 2 - 0.01),
      0,
    );
    b.box(0.02, 0.012, 0.004, tint(SLAB, -0.18), on(0.22, top - 0.09), 0);
    // The ceiling grid's tees and a tile joint.
    b.box(1.004, 0.012, 0.006, 0xeeefec, on(0, ceilTop - 0.006), 0);
    b.box(0.012, ceilH, 0.006, 0xb8bab6, on(-0.5 + 0.6 * (f % 2), bottom + ceilH / 2), 0);
    // Hangers down through the void.
    for (const u of [-0.3, 0.3])
      b.box(
        0.008,
        slabBottom - 0.03 - ceilTop,
        0.006,
        0x8a9096,
        on(u, (slabBottom - 0.03 + ceilTop) / 2),
        0,
      );
    const voidY = (slabBottom - 0.03 + ceilTop) / 2;
    if (look === 1) b.box(1.004, 0.11, 0.006, 0xc0c6cc, on(0, voidY), 0);
    else if (look === 2) {
      b.box(1.004, 0.03, 0.008, 0xb03a30, on(0, voidY + 0.03), 0);
      b.box(0.02, 0.05, 0.01, 0xb03a30, on(0.1, voidY - 0.01), 0);
    } else b.box(0.5, 0.02, 0.006, 0x24272c, on(-0.1, voidY - 0.03), 0);
  });
  return b.build();
}

// ---- The carpet ----

/** Fleck variants a tile comes in, picked by its hash. */
const CARPET_VARIANTS = 3;
/** The middles of a tile's four quarter tiles: back-left, back-right, front-left, front-right. */
const QUARTERS: readonly (readonly [number, number])[] = [
  [-0.25, -0.25],
  [0.25, -0.25],
  [-0.25, 0.25],
  [0.25, 0.25],
];

/** A carpet look: its wear and its variant. */
export function carpetLook(x: number, y: number, wear: number): number {
  const variant = (tileHash(x + 13, y + 3) >>> 4) % CARPET_VARIANTS;
  return wear * CARPET_VARIANTS + variant;
}

/** A tile's brightness: ±4% per tile, picked by the tile and the level. */
export function carpetTone(x: number, y: number, salt: number): number {
  const own = ((Math.imul(x + 53, 73856093) ^ Math.imul(y + 11, 19349663) ^ salt) >>> 0) % 1001;
  return 1 + (own / 1000 - 0.5) * 0.08;
}

/** The walkway's lighter grey carpet, and the odd batch's bluer one. */
export const WALKWAY = 0x9fa5ab;
const ODD_BATCH = 0x7f8ea2;

/**
 * A tile of new carpet (`look` from `carpetLook`): four quarter tiles laid
 * quarter-turned in the two tones, each with its pile's faint stripe the
 * other way, a dark hairline seam between, a few flecks, and its wear (see
 * `CARPET_WEAR`).
 */
export function carpetFloorModel(look: number): Model {
  const variant = look % CARPET_VARIANTS;
  const wear = Math.floor(look / CARPET_VARIANTS) % CARPET_WEAR_KINDS;
  const [floorBase, floorAlt] = FLOOR_COLORS.corporateCarpet;
  const base =
    wear === CARPET_WEAR.walkway
      ? WALKWAY
      : wear === CARPET_WEAR.odd
        ? mix(floorBase, ODD_BATCH, 0.55)
        : floorBase;
  const alt =
    wear === CARPET_WEAR.walkway
      ? tint(WALKWAY, -0.035)
      : wear === CARPET_WEAR.odd
        ? mix(floorAlt, ODD_BATCH, 0.55)
        : floorAlt;
  const b = new ModelBuilder();
  b.box(1, 0.012, 1, base, { at: [0, -0.006, 0] }, 0);
  const mark = (w: number, d: number, color: number, x: number, z: number, y = 0.0012, turn = 0) =>
    b.box(w, 0.002, d, color, { at: [x, y, z], rot: [0, turn, 0] }, 0);
  QUARTERS.forEach(([x, z], i) => {
    const turned = i === 1 || i === 2;
    if (turned) mark(0.49, 0.49, alt, x, z);
    // The pile's stripe: faint lines, along x on one tone, along z on the other.
    const stripe = tint(turned ? alt : base, -0.035);
    for (const k of [-0.15, -0.05, 0.05, 0.15])
      if (turned) mark(0.04, 0.46, stripe, x + k, z, 0.0016);
      else mark(0.46, 0.04, stripe, x, z + k, 0.0016);
  });
  // Seams: the tile's back and left edges (the next tile draws the rest) and its middle cross.
  const seam = tint(base, -0.07);
  for (const z of [-0.494, 0]) mark(1, 0.012, seam, 0, z, 0.0019);
  for (const x of [-0.494, 0]) mark(0.012, 1, seam, x, 0, 0.0019);
  // Flecks in the yarn.
  for (let k = 0; k < 4; k++) {
    const h = tileHash(variant * 5 + k, 17);
    mark(
      0.014,
      0.014,
      tint(base, h % 2 ? 0.1 : -0.12),
      ((h % 89) / 89 - 0.5) * 0.9,
      (((h >> 7) % 83) / 83 - 0.5) * 0.9,
      0.0021,
    );
  }
  if (wear >= CARPET_WEAR.mat && wear < CARPET_WEAR.mat + 4)
    chairMat(b, wear - CARPET_WEAR.mat, base);
  else if (wear === CARPET_WEAR.castor) castorMarks(b, base, 0, 0);
  else if (wear >= CARPET_WEAR.coffee && wear < CARPET_WEAR.coffee + STAIN_CORNERS)
    coffeeStain(b, wear - CARPET_WEAR.coffee, base);
  return b.build();
}

/** Faint arcs where castors roll, round (cx, cz). */
function castorMarks(b: ModelBuilder, base: number, cx: number, cz: number, y = 0.0024): void {
  const c = mix(base, 0x4c525a, 0.22);
  for (const [r, a0, n] of [
    [0.22, 0.2, 5],
    [0.3, 2.4, 4],
    [0.16, 4.1, 4],
  ] as const)
    for (let k = 0; k < n; k++) {
      const a = a0 + k * 0.22;
      b.box(
        0.07,
        0.002,
        0.01,
        c,
        { at: [cx + Math.cos(a) * r, y, cz + Math.sin(a) * r], rot: [0, -a + Math.PI / 2, 0] },
        0,
      );
    }
}

/** A clear polycarbonate chair mat against edge `edge` (as `MAT_EDGES` counts them), its lip and castor tracks. */
function chairMat(b: ModelBuilder, edge: number, base: number): void {
  const alongX = edge < 2;
  const off = [-0.2, 0.2, -0.2, 0.2][edge] ?? 0;
  const [w, d] = alongX ? [0.74, 0.5] : [0.5, 0.74];
  const [cx, cz] = alongX ? [0, off] : [off, 0];
  const mat = mix(base, 0xdfe5ea, 0.16);
  b.box(w, 0.004, d, mat, { at: [cx, 0.003, cz] }, 0);
  // Its lip toward the desk, where the chair rolls under.
  const lip = 0.08;
  const [lx, lz] = alongX
    ? [0, off + Math.sign(off) * (d / 2 + lip / 2)]
    : [off + Math.sign(off) * (w / 2 + lip / 2), 0];
  b.box(alongX ? 0.36 : lip, 0.004, alongX ? lip : 0.36, mat, { at: [lx, 0.003, lz] }, 0);
  const edgeC = mix(base, 0xeef2f5, 0.3);
  for (const s of [-1, 1]) {
    b.box(w, 0.002, 0.012, edgeC, { at: [cx, 0.0055, cz + s * (d / 2 - 0.006)] }, 0);
    b.box(0.012, 0.002, d, edgeC, { at: [cx + s * (w / 2 - 0.006), 0.0055, cz] }, 0);
  }
  castorMarks(b, mat, cx, cz, 0.0058);
}

/** A small coffee stain in corner `corner`: a faint ring, a fainter fill, one splash. */
function coffeeStain(b: ModelBuilder, corner: number, base: number): void {
  const [qx, qz] = QUARTERS[corner] ?? [0, 0];
  const cx = qx * 1.2;
  const cz = qz * 1.2;
  const fill = mix(base, 0x7a5a40, 0.22);
  const ring = mix(base, 0x5e4230, 0.32);
  b.add(new THREE.CylinderGeometry(0.085, 0.085, 0.002, 18), fill, { at: [cx, 0.0024, cz] });
  b.add(new THREE.TorusGeometry(0.085, 0.006, 3, 24), ring, {
    at: [cx, 0.0026, cz],
    rot: [Math.PI / 2, 0, 0],
  });
  b.add(new THREE.CylinderGeometry(0.022, 0.022, 0.002, 10), fill, {
    at: [cx - qx * 0.5, 0.0024, cz - qz * 0.3],
  });
}

// ---- Counters: bench desks ----

/**
 * A counter as a light-oak bench desk, built from where it sits in its run
 * (x along the run): two oak tops either side of a grey cable spine, slim
 * aluminium frame legs at the run's ends and its `legs` tiles, a grey
 * modesty panel under; a laptop on the run's first tile, a monitor on an arm
 * clamped to the spine on its last, papers and a mug between. A lone desk
 * (a run of one) is a single workstation: its top on the front part of the
 * tile, its back part left free for the chair (`deskChair`). The tops are
 * darker than every station top.
 */
export function midRiseDeskCounter(run: CounterRun): StationModel {
  const { minusEnd, plusEnd } = run;
  if (minusEnd && plusEnd) return loneDesk();
  const b = new ModelBuilder();
  const top = STATION_HEIGHT;
  const x0 = minusEnd ? -0.46 : -0.5;
  const x1 = plusEnd ? 0.46 : 0.5;
  const mid = (x0 + x1) / 2;
  const len = x1 - x0;
  const t = 0.03;
  // Its shadow on the carpet.
  b.box(
    len + 0.02,
    0.002,
    0.94,
    mix(FLOOR_COLORS.corporateCarpet[0], 0x3a4048, 0.35),
    { at: [mid, 0.002, 0] },
    0,
  );
  // The two tops, their dark edge band, and the spine between.
  for (const s of [-1, 1]) {
    b.box(len, t, 0.44, DESK_EDGE, { at: [mid, top - t / 2, s * 0.25] }, 0.004);
    b.box(len - 0.012, 0.004, 0.43, DESK_TOP, { at: [mid, top + 0.001, s * 0.25] }, 0);
  }
  b.box(len, 0.03, 0.06, SPINE, { at: [mid, top - 0.016, 0] }, 0);
  b.box(len, 0.004, 0.02, tint(SPINE, -0.3), { at: [mid, top - 0.0, 0] }, 0);
  if (!minusEnd) b.box(0.006, 0.002, 0.9, tint(DESK_TOP, -0.25), { at: [-0.5, top + 0.004, 0] }, 0);
  // The cable tray under the spine, the modesty panel.
  b.box(len - 0.02, 0.06, 0.16, tint(SPINE, -0.1), { at: [mid, top - 0.08, 0] }, 0);
  b.box(len - 0.03, 0.22, 0.016, 0x8a9097, { at: [mid, top - 0.2, 0] }, 0);
  const frame = (x: number) => {
    for (const z of [-0.42, 0.42])
      b.box(0.04, top - t, 0.04, LEG, { at: [x, (top - t) / 2, z] }, 0.008);
    b.box(0.045, 0.03, 0.88, LEG, { at: [x, top - t - 0.015, 0] }, 0);
    b.box(0.05, 0.016, 0.9, tint(LEG, -0.25), { at: [x, 0.008, 0] }, 0);
  };
  if (minusEnd) frame(x0 + 0.03);
  if (plusEnd) frame(x1 - 0.03);
  if (run.legs && !minusEnd && !plusEnd) frame(0);
  // What's on it.
  if (minusEnd) laptop(b, mid + 0.18, top, -0.27, 0.1);
  else if (plusEnd) {
    monitorArm(b, mid + 0.26, top);
    mug(b, mid - 0.3, top, 0.3, 0x2f6f9a);
  } else if (run.legs) {
    papers(b, mid - 0.2, top, 0.28, 0.2);
    mug(b, mid + 0.3, top, -0.32, 0xe8e6e0);
  } else {
    papers(b, mid + 0.22, top, -0.26, -0.3);
  }
  return { base: b.build(), hero: null, heroAt: [0, 0] };
}

/** How far forward the lone desk's top starts (its back part is the chair's). */
export const LONE_DESK_BACK = -0.17;

/** A lone desk: an oak top on the tile's front part, aluminium legs, a modesty panel, a laptop and a mug. */
function loneDesk(): StationModel {
  const b = new ModelBuilder();
  const top = STATION_HEIGHT;
  const t = 0.03;
  const z0 = LONE_DESK_BACK;
  const z1 = 0.46;
  const d = z1 - z0;
  const cz = (z0 + z1) / 2;
  b.box(
    0.96,
    0.002,
    d + 0.04,
    mix(FLOOR_COLORS.corporateCarpet[0], 0x3a4048, 0.35),
    { at: [0, 0.002, cz] },
    0,
  );
  b.box(0.92, t, d, DESK_EDGE, { at: [0, top - t / 2, cz] }, 0.004);
  b.box(0.908, 0.004, d - 0.012, DESK_TOP, { at: [0, top + 0.001, cz] }, 0);
  for (const x of [-0.42, 0.42]) {
    for (const z of [z0 + 0.04, z1 - 0.04])
      b.box(0.04, top - t, 0.04, LEG, { at: [x, (top - t) / 2, z] }, 0.008);
    b.box(0.045, 0.03, d - 0.04, LEG, { at: [x, top - t - 0.015, cz] }, 0);
  }
  b.box(0.8, 0.24, 0.016, 0x8a9097, { at: [0, top - 0.17, z1 - 0.04] }, 0);
  laptop(b, -0.24, top, -0.02, Math.PI - 0.15);
  mug(b, 0.32, top, 0.06, 0xd8d4c8);
  return { base: b.build(), hero: null, heroAt: [0, 0] };
}

/** An open laptop on a top at `y`, its screen facing +z turned by `yaw`. */
function laptop(b: ModelBuilder, x: number, y: number, z: number, yaw: number): void {
  const g = framed(b, [x, y, z], [0, yaw, 0]);
  g.box(0.26, 0.014, 0.18, 0x9aa0a6, { at: [0, 0.007, 0.02] }, 0.005);
  g.box(0.22, 0.004, 0.08, 0x5a5f66, { at: [0, 0.015, 0.03] }, 0);
  const lid = framed(g, [0, 0.014, -0.07], [-0.3, 0, 0]);
  lid.box(0.26, 0.16, 0.012, 0x9aa0a6, { at: [0, 0.08, 0] }, 0.005);
  lid.screen(0.23, 0.13, SCREEN, { at: [0, 0.08, 0.0065] });
}

/** A monitor on an arm clamped to the spine at x, its screen facing +z. */
function monitorArm(b: ModelBuilder, x: number, y: number): void {
  b.box(0.05, 0.03, 0.05, PLASTIC, { at: [x, y + 0.015, 0] }, 0.006);
  b.box(0.02, 0.16, 0.02, ALU_DARK, { at: [x, y + 0.1, 0] }, 0);
  b.box(0.02, 0.02, 0.12, ALU_DARK, { at: [x, y + 0.18, 0.05] }, 0);
  b.box(0.3, 0.19, 0.03, PLASTIC, { at: [x, y + 0.23, 0.12] }, 0.008);
  b.screen(0.28, 0.17, SCREEN, { at: [x, y + 0.23, 0.136] });
}

/** A mug at (x, z) on a top at `y`. */
function mug(b: ModelBuilder, x: number, y: number, z: number, color: number): void {
  b.cylinder(0.035, 0.032, 0.08, color, { at: [x, y + 0.04, z] }, 14);
  b.cylinder(0.028, 0.028, 0.002, 0x4a3226, { at: [x, y + 0.078, z] }, 12);
  b.torus(0.02, 0.006, color, { at: [x + 0.04, y + 0.04, z], rot: [0, 0, Math.PI / 2] });
}

/** A few printed sheets fanned at (x, z) on a top at `y`, turned `turn`. */
function papers(b: ModelBuilder, x: number, y: number, z: number, turn: number): void {
  for (let k = 0; k < 3; k++)
    b.box(
      0.2,
      0.003,
      0.28,
      k === 1 ? 0xeeeeea : PAPER,
      { at: [x + k * 0.02, y + 0.002 + k * 0.003, z], rot: [0, turn + k * 0.12, 0] },
      0,
    );
  for (let k = 0; k < 4; k++)
    b.box(
      0.14,
      0.001,
      0.01,
      0x9a9c9e,
      { at: [x + 0.04, y + 0.0125, z - 0.08 + k * 0.035], rot: [0, turn + 0.24, 0] },
      0,
    );
}

// ---- Chairs ----

/** A mesh task chair, built at the back part of a lone desk's tile, facing +z (toward its desk). */
export function taskChairModel(): Model {
  const b = new ModelBuilder();
  const z = -0.32;
  chairBase(b, z, 0x2c2f34);
  b.box(0.34, 0.05, 0.3, 0x3a3e45, { at: [0, 0.42, z + 0.02] }, 0.02);
  // The mesh back and its frame.
  b.box(0.32, 0.36, 0.03, 0x2c2f34, { at: [0, 0.66, z - 0.15], rot: [-0.12, 0, 0] }, 0.02);
  b.box(0.27, 0.3, 0.032, 0x4a5058, { at: [0, 0.66, z - 0.148], rot: [-0.12, 0, 0] }, 0);
  for (const s of [-1, 1])
    b.box(0.03, 0.03, 0.2, 0x2c2f34, { at: [s * 0.18, 0.53, z], rot: [0, 0, 0] }, 0.008);
  return b.build();
}

/** A five-star base on castors and the gas lift, at `z`. */
function chairBase(b: ModelBuilder, z: number, color: number): void {
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2 + 0.3;
    b.box(
      0.2,
      0.025,
      0.035,
      color,
      { at: [Math.cos(a) * 0.1, 0.06, z + Math.sin(a) * 0.1], rot: [0, -a, 0] },
      0.008,
    );
    b.sphere(0.022, 0x1d1f23, { at: [Math.cos(a) * 0.19, 0.025, z + Math.sin(a) * 0.19] });
  }
  b.cylinder(0.02, 0.02, 0.32, ALU_DARK, { at: [0, 0.22, z] }, 10);
}

/** Derek's leather executive chair: high-backed, buttoned, oxblood-brown, chrome base. */
const LEATHER = 0x5a3428;
export function execChairModel(): Model {
  const b = new ModelBuilder();
  const z = -0.3;
  chairBase(b, z, 0x8d949b);
  // Pumped up high: Derek likes to look down on the room.
  b.cylinder(0.024, 0.024, 0.08, 0x8d949b, { at: [0, 0.4, z] }, 10);
  b.box(0.42, 0.09, 0.34, LEATHER, { at: [0, 0.46, z + 0.02] }, 0.035);
  // The high back, rolled at the top, its buttons.
  b.box(0.42, 0.56, 0.08, LEATHER, { at: [0, 0.8, z - 0.17], rot: [-0.1, 0, 0] }, 0.04);
  b.box(0.44, 0.09, 0.11, tint(LEATHER, 0.08), { at: [0, 1.09, z - 0.2], rot: [-0.1, 0, 0] }, 0.04);
  for (let r = 0; r < 3; r++)
    for (let c = 0; c < 3; c++)
      b.sphere(0.012, tint(LEATHER, -0.35), {
        at: [-0.12 + c * 0.12, 0.66 + r * 0.13, z - 0.12 + r * 0.013],
      });
  // Arms.
  for (const s of [-1, 1]) {
    b.box(0.07, 0.06, 0.3, LEATHER, { at: [s * 0.23, 0.6, z + 0.01] }, 0.025);
    b.box(0.03, 0.12, 0.03, 0x8d949b, { at: [s * 0.23, 0.52, z + 0.08] }, 0.008);
  }
  return b.build();
}

// ---- Derek's executive desk ----

/**
 * Over the lone desk at Derek's tile: a dark walnut top with a leather
 * desk pad, the brass DEREK nameplate facing his visitors, a green banker's
 * lamp, a closed laptop and a framed photo of himself shaking a hand.
 */
export function execDeskModel(): Model {
  const b = new ModelBuilder();
  const top = STATION_HEIGHT;
  const z0 = LONE_DESK_BACK - 0.01;
  const z1 = 0.48;
  const cz = (z0 + z1) / 2;
  const walnut = 0x5e4030;
  b.box(1.0, 0.024, z1 - z0, walnut, { at: [0, top + 0.012, cz] }, 0.006);
  b.box(1.0, 0.26, 0.03, tint(walnut, -0.15), { at: [0, top - 0.13, z1 - 0.015] }, 0.006);
  b.box(0.5, 0.004, 0.3, 0x2f3a2c, { at: [0, top + 0.026, cz - 0.03] }, 0);
  // The nameplate at the front edge, facing out.
  b.box(
    0.24,
    0.05,
    0.035,
    0x2a1e18,
    { at: [0.05, top + 0.05, z1 - 0.06], rot: [-0.3, 0, 0] },
    0.006,
  );
  b.box(0.22, 0.034, 0.004, 0xc8a050, { at: [0.05, top + 0.052, z1 - 0.04], rot: [-0.3, 0, 0] }, 0);
  const plate = framed(b, [0.05, top + 0.052, z1 - 0.037], [-0.3, 0, 0]);
  text(plate, 'DEREK', 0, 0, 0, 0.0045, 0x2a1e18);
  // The banker's lamp.
  b.cylinder(0.05, 0.06, 0.02, 0xb08a40, { at: [-0.36, top + 0.034, cz] }, 14);
  b.box(0.012, 0.12, 0.012, 0xb08a40, { at: [-0.36, top + 0.1, cz] }, 0);
  b.box(0.2, 0.05, 0.08, 0x1f5a3a, { at: [-0.36, top + 0.17, cz + 0.02], rot: [0.3, 0, 0] }, 0.02);
  b.box(0.17, 0.006, 0.05, 0xfff0c8, { at: [-0.36, top + 0.145, cz + 0.03] }, 0);
  // A closed laptop, the framed photo.
  b.box(
    0.28,
    0.02,
    0.2,
    0x9aa0a6,
    { at: [0.28, top + 0.034, cz - 0.04], rot: [0, -0.2, 0] },
    0.006,
  );
  b.box(
    0.12,
    0.15,
    0.015,
    0xb08a40,
    { at: [0.36, top + 0.1, z0 + 0.1], rot: [-0.2, 2.8, 0] },
    0.004,
  );
  return b.build();
}

// ---- Reception's pass-through at the inbox ----

/**
 * Reception's pass-through round the inbox (`span` tiles wide), the
 * reception desk's inner side toward −z: aluminium jambs at each end, a
 * plasterboard bulkhead over with RECEPTION on it, under the head track;
 * behind the inbox a light-oak transaction ledge on its upstand with the
 * visitor-badge printer (a badge coming out), the tray of clip-on badges
 * and violet lanyards, and the little PLEASE SIGN IN stand. On a front
 * edge, which the camera looks over, only the low ledge.
 */
export function receptionModel(span: number, low: boolean): Model {
  const b = new ModelBuilder();
  const half = span / 2;
  const { face } = WALL_COLORS.midRise;
  const ledgeY = 0.8;
  const lz = -0.44;
  b.box(
    span - 0.08,
    ledgeY - 0.03,
    0.12,
    mix(face, 0xbb9f78, 0.25),
    { at: [0, (ledgeY - 0.03) / 2, lz - 0.02] },
    0.01,
  );
  b.box(span - 0.04, 0.03, 0.22, DESK_TOP, { at: [0, ledgeY - 0.015, lz] }, 0.008);
  b.box(span - 0.04, 0.008, 0.222, DESK_EDGE, { at: [0, ledgeY - 0.026, lz] }, 0);
  // The badge printer at the left end, a badge sliding out.
  const px = -half + 0.24;
  b.box(0.2, 0.1, 0.16, 0xd8dbde, { at: [px, ledgeY + 0.05, lz] }, 0.02);
  b.box(0.12, 0.012, 0.03, 0x2a2d33, { at: [px, ledgeY + 0.07, lz + 0.081] }, 0);
  b.box(0.08, 0.004, 0.06, 0xf4f4f0, { at: [px, ledgeY + 0.072, lz + 0.11], rot: [-0.3, 0, 0] }, 0);
  b.box(
    0.06,
    0.003,
    0.012,
    YOTTA_VIOLET,
    { at: [px, ledgeY + 0.08, lz + 0.1], rot: [-0.3, 0, 0] },
    0,
  );
  b.led(0.008, 0x2ab060, { at: [px + 0.07, ledgeY + 0.09, lz + 0.08] });
  // The tray of badges and lanyards at the right end.
  const tx = half - 0.26;
  b.box(0.26, 0.03, 0.17, 0x2a2d33, { at: [tx, ledgeY + 0.015, lz] }, 0.008);
  for (let k = 0; k < 4; k++)
    b.box(
      0.05,
      0.006,
      0.07,
      0xf2f2ee,
      { at: [tx - 0.08 + k * 0.055, ledgeY + 0.034, lz - 0.02], rot: [0, (k - 1.5) * 0.15, 0] },
      0,
    );
  for (let k = 0; k < 3; k++)
    b.torus(0.04, 0.007, YOTTA_VIOLET, {
      at: [tx - 0.06 + k * 0.06, ledgeY + 0.036, lz + 0.05],
      rot: [Math.PI / 2, 0, k * 0.4],
    });
  // The PLEASE SIGN IN stand: an acrylic tent with a printed card.
  const sx = half - 0.6;
  const stand = framed(b, [sx, ledgeY, lz + 0.06], [-0.35, 0, 0]);
  stand.box(0.2, 0.12, 0.006, 0xf4f4f0, { at: [0, 0.06, 0] }, 0);
  text(stand, 'PLEASE', 0, 0.085, 0.004, 0.0065, INK);
  text(stand, 'SIGN IN', 0, 0.04, 0.004, 0.0065, YOTTA_VIOLET);
  stand.pane(0.21, 0.13, 0.004, GLASS_PANE, { at: [0, 0.062, 0.006] });
  if (low) return b.build();
  // The jambs, the bulkhead over the opening, the head track.
  const top = WALL_HEIGHT;
  for (const s of [-1, 1]) {
    b.box(
      0.05,
      top - 0.04,
      0.12,
      ALU,
      { at: [s * (half - 0.025), (top - 0.04) / 2, -0.44] },
      0.008,
    );
    b.box(
      0.008,
      top - 0.08,
      0.124,
      tint(ALU, -0.2),
      { at: [s * (half - 0.052), (top - 0.04) / 2, -0.44] },
      0,
    );
  }
  const bulk0 = 1.0;
  b.box(span, top - bulk0, 0.14, face, { at: [0, (top + bulk0) / 2, -0.44] }, 0);
  b.box(span + 0.02, 0.022, 0.15, ALU, { at: [0, bulk0 + 0.011, -0.44] }, 0);
  b.box(span + 0.02, 0.03, 0.16, ALU, { at: [0, top - 0.015, -0.44] }, 0);
  text(b, 'RECEPTION', 0, (top + bulk0) / 2 + 0.005, -0.369, 0.009, 0x6a7078);
  return b.build();
}

// ---- What hangs on the partitions ----

/** A fire exit pictogram lit green at (0, cy) on the face at z, hung from the head track. */
function fireExitSign(b: ModelBuilder, cy: number, z: number): void {
  for (const s of [-1, 1])
    b.box(
      0.006,
      WALL_HEIGHT - cy - 0.06,
      0.006,
      ALU_DARK,
      { at: [s * 0.13, (WALL_HEIGHT + cy) / 2 + 0.03, z] },
      0,
    );
  b.box(0.34, 0.15, 0.03, 0xe8eae6, { at: [0, cy, z] }, 0.008);
  b.add(new THREE.BoxGeometry(0.31, 0.12, 0.004), 0x17633e, { at: [0, cy, z + 0.016] }, 'glow');
  const white = 0xeef0ea;
  const f = z + 0.019;
  b.box(0.04, 0.08, 0.004, white, { at: [0.1, cy, f] }, 0);
  b.box(0.018, 0.018, 0.004, white, { at: [0.0, cy + 0.035, f] }, 0);
  b.box(0.014, 0.045, 0.004, white, { at: [-0.01, cy + 0.005, f], rot: [0, 0, -0.4] }, 0);
  b.box(0.012, 0.04, 0.004, white, { at: [0.006, cy - 0.03, f], rot: [0, 0, 0.6] }, 0);
  b.box(0.012, 0.04, 0.004, white, { at: [-0.028, cy - 0.028, f], rot: [0, 0, -0.7] }, 0);
  b.box(0.05, 0.012, 0.004, white, { at: [-0.09, cy, f] }, 0);
  b.add(new THREE.ConeGeometry(0.018, 0.03, 3), white, {
    at: [-0.12, cy, f],
    rot: [0, 0, Math.PI / 2],
  });
}

/** A framed box `w` × `h` on the face at z round (0, cy): aluminium frame, white mount. */
function frame(
  b: ModelBuilder,
  w: number,
  h: number,
  cy: number,
  z: number,
  mount = 0xf2f2ee,
): void {
  b.box(w, h, 0.025, 0x3a3e45, { at: [0, cy, z + 0.0125] }, 0.006);
  b.box(w - 0.03, h - 0.03, 0.004, mount, { at: [0, cy, z + 0.026] }, 0);
}

/** A box in the org chart: a white card with an ink border, its number over its label. */
function chartBox(
  b: ModelBuilder,
  num: string,
  label: string,
  x: number,
  y: number,
  z: number,
  w: number,
  color: number,
): void {
  const h = num ? 0.11 : 0.085;
  b.box(w, h, 0.003, color, { at: [x, y, z] }, 0);
  b.box(w - 0.016, h - 0.016, 0.003, 0xfbfbf8, { at: [x, y, z + 0.0015] }, 0);
  const px = Math.min(0.0095, (w - 0.04) / (label.length * 4 - 1));
  if (num) {
    text(b, num, x, y + 0.025, z + 0.003, 0.007, color === INK ? 0x7a8088 : color);
    text(b, label, x, y - 0.018, z + 0.003, px, color === INK ? INK : color);
  } else text(b, label, x, y, z + 0.003, px, INK);
}

/**
 * Things hung on the partitions (all in front of z = 0.5), by name, for
 * the room's story pieces (see `midRiseRoom`), each within its
 * `MID_RISE_ART_HALF` of the spot.
 */
export const MID_RISE_WALL_ART: Readonly<Record<string, () => Model>> = {
  yotta: () => {
    // YOTTA in cut vinyl letters, violet, big, on the solid panels beside reception, a thin
    // violet rule under it and the tagline in grey.
    const b = new ModelBuilder();
    const z = 0.506;
    text(b, 'YOTTA', 0, 0.94, z, 0.05, YOTTA_VIOLET, 0.006);
    b.box(0.96, 0.012, 0.004, YOTTA_VIOLET, { at: [0, 0.79, z + 0.002] }, 0);
    text(b, 'SHIP IT', 0, 0.72, z, 0.014, 0x7a8088, 0.004);
    return b.build();
  },
  orgChart: () => {
    // Derek's org chart, framed: DEREK on top, under him the plan in three boxes.
    const b = new ModelBuilder();
    const z = 0.506;
    const cy = 0.74;
    frame(b, 0.78, 0.56, cy, z);
    const f = z + 0.03;
    text(b, 'ORG CHART', 0, cy + 0.225, f, 0.0065, 0x7a8088);
    chartBox(b, '', 'DEREK', 0, cy + 0.13, f, 0.3, INK);
    // The lines down to his three reports.
    b.box(0.006, 0.05, 0.003, INK, { at: [0, cy + 0.065, f] }, 0);
    b.box(0.54, 0.006, 0.003, INK, { at: [0, cy + 0.04, f] }, 0);
    for (const x of [-0.24, 0, 0.24]) b.box(0.006, 0.04, 0.003, INK, { at: [x, cy + 0.02, f] }, 0);
    chartBox(b, '1.', 'BUILD IT', -0.245, cy - 0.05, f, 0.235, INK);
    chartBox(b, '2.', '???', 0, cy - 0.05, f, 0.235, 0xc0302a);
    chartBox(b, '3.', 'PROFIT', 0.245, cy - 0.05, f, 0.235, INK);
    // A note pinned under: Q3 STATUS?
    b.box(0.2, 0.08, 0.003, 0xe8d860, { at: [0.2, cy - 0.17, f], rot: [0, 0, 0.06] }, 0);
    text(b, 'STATUS?', 0.2, cy - 0.17, f + 0.002, 0.0055, INK);
    return b.build();
  },
  clock: () => {
    // A plain office clock, aluminium rim, white face, twenty past nine.
    const b = new ModelBuilder();
    const cy = 0.88;
    const disc = (r: number, d: number, color: number, z: number) =>
      b.cylinder(r, r, d, color, { at: [0, cy, z], rot: [Math.PI / 2, 0, 0] }, 28);
    disc(0.14, 0.035, ALU, 0.52);
    disc(0.122, 0.01, 0xf7f6f0, 0.54);
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      b.box(
        0.008,
        k % 3 === 0 ? 0.024 : 0.012,
        0.003,
        INK,
        { at: [Math.sin(a) * 0.1, cy + Math.cos(a) * 0.1, 0.546], rot: [0, 0, -a] },
        0,
      );
    }
    const hand = (len: number, a: number, w: number) =>
      b.box(
        w,
        len,
        0.003,
        INK,
        { at: [Math.sin(a) * len * 0.5, cy + Math.cos(a) * len * 0.5, 0.548], rot: [0, 0, -a] },
        0,
      );
    hand(0.06, (9.33 / 12) * Math.PI * 2, 0.012);
    hand(0.09, (20 / 60) * Math.PI * 2, 0.008);
    return b.build();
  },
  quietZone: () => {
    // QUIET ZONE: a printed sign hung from the head track, a finger over lips, a coffee ring on it.
    const b = new ModelBuilder();
    const z = 0.515;
    const cy = 0.86;
    for (const s of [-1, 1])
      b.box(
        0.006,
        WALL_HEIGHT - cy - 0.08,
        0.006,
        ALU_DARK,
        { at: [s * 0.2, (WALL_HEIGHT + cy) / 2 + 0.04, z] },
        0,
      );
    b.box(0.56, 0.17, 0.012, 0xf2f2ee, { at: [0, cy, z] }, 0.004);
    b.box(0.54, 0.05, 0.003, 0x3a6a8a, { at: [0, cy + 0.05, z + 0.007] }, 0);
    text(b, 'QUIET ZONE', 0, cy + 0.05, z + 0.009, 0.0095, 0xf4f4f0);
    text(b, 'PLEASE', 0, cy - 0.025, z + 0.007, 0.0065, INK);
    text(b, 'NO CALLS', 0, cy - 0.06, z + 0.007, 0.0065, INK);
    b.add(new THREE.TorusGeometry(0.03, 0.004, 3, 18), 0x8a6a50, {
      at: [0.2, cy - 0.04, z + 0.008],
    });
    return b.build();
  },
  booking: () => {
    // The room-booking panel by the meeting room's door: a small screen, red, BOOKED.
    const b = new ModelBuilder();
    const cy = 0.82;
    b.box(0.26, 0.18, 0.03, 0x2a2d33, { at: [0, cy, 0.52] }, 0.008);
    b.screen(0.22, 0.14, 0x3a0c0c, { at: [0, cy, 0.536] });
    text(b, 'BOOKED', 0, cy + 0.035, 0.537, 0.008, 0xff6a5a);
    text(b, 'ALL DAY', 0, cy - 0.025, 0.537, 0.0055, 0xffb0a8);
    b.led(0.008, 0xff3b30, { at: [0, cy + 0.1, 0.53] });
    b.led(0.008, 0xff3b30, { at: [0, cy - 0.1, 0.53] });
    return b.build();
  },
  fireExit: () => {
    const b = new ModelBuilder();
    fireExitSign(b, 0.96, 0.52);
    return b.build();
  },
  certificate: () => {
    // MONOLITH · 10 YEARS OF SERVICE, in a gilt frame on its easel back, standing on the low
    // wall of Derek's office, facing the room.
    const b = new ModelBuilder();
    const g = framed(b, [0, FRONT_WALL_HEIGHT, 0.12], [-0.22, 0, 0]);
    const cy = 0.2;
    g.box(0.54, 0.4, 0.03, 0xa88a40, { at: [0, cy, 0] }, 0.006);
    g.box(0.48, 0.34, 0.004, 0xf2ecd8, { at: [0, cy, 0.016] }, 0);
    const f = 0.019;
    text(g, 'MONOLITH', 0, cy + 0.11, f, 0.011, 0x1d2430);
    g.box(0.36, 0.004, 0.002, 0x1d2430, { at: [0, cy + 0.07, f] }, 0);
    text(g, '10 YEARS', 0, cy + 0.02, f, 0.009, INK);
    text(g, 'OF SERVICE', 0, cy - 0.04, f, 0.007, INK);
    g.cylinder(
      0.035,
      0.035,
      0.004,
      0xc0302a,
      { at: [0.15, cy - 0.11, f], rot: [Math.PI / 2, 0, 0] },
      14,
    );
    g.box(0.16, 0.003, 0.002, INK, { at: [-0.08, cy - 0.11, f] }, 0);
    b.box(
      0.02,
      0.3,
      0.02,
      0x5a4428,
      { at: [0, FRONT_WALL_HEIGHT + 0.14, 0.0], rot: [0.35, 0, 0] },
      0.004,
    );
    return b.build();
  },
  lanyardHook: () => {
    // A brass coat hook, Derek's old MONOLITH lanyard on it (charcoal strap, white badge), his coat.
    const b = new ModelBuilder();
    const z = 0.51;
    const hy = 0.92;
    b.box(0.08, 0.03, 0.02, 0xb08a40, { at: [-0.1, hy, z + 0.01] }, 0.006);
    b.box(0.014, 0.014, 0.05, 0xb08a40, { at: [-0.1, hy - 0.01, z + 0.04], rot: [0.5, 0, 0] }, 0);
    // The lanyard: two straps down to the badge.
    for (const s of [-1, 1])
      b.box(
        0.018,
        0.26,
        0.004,
        0x2a2f3a,
        { at: [-0.1 + s * 0.04, hy - 0.14, z + 0.05], rot: [0, 0, s * -0.15] },
        0,
      );
    b.box(0.1, 0.13, 0.006, 0xf2f2ee, { at: [-0.1, hy - 0.32, z + 0.052] }, 0.004);
    b.box(0.09, 0.03, 0.004, 0x1d2430, { at: [-0.1, hy - 0.27, z + 0.056] }, 0);
    text(b, 'MONOLITH', -0.1, hy - 0.27, z + 0.058, 0.0024, 0xf2f2ee);
    b.box(0.04, 0.05, 0.003, 0x9a9ea4, { at: [-0.1, hy - 0.335, z + 0.056] }, 0);
    // His coat on the second hook: a camel overcoat.
    b.box(0.08, 0.03, 0.02, 0xb08a40, { at: [0.14, hy, z + 0.01] }, 0.006);
    b.box(0.2, 0.46, 0.06, 0x9a7a52, { at: [0.14, hy - 0.25, z + 0.05] }, 0.03);
    b.box(0.08, 0.1, 0.064, tint(0x9a7a52, -0.15), { at: [0.14, hy - 0.04, z + 0.05] }, 0.02);
    return b.build();
  },
  statusSticky: () => {
    // STATUS UPDATE? on a yellow sticky on the glass, at eye height.
    const b = new ModelBuilder();
    const z = 0.508;
    const cy = 0.8;
    const g = framed(b, [0, cy, z], [0, 0, 0.08]);
    g.box(0.2, 0.18, 0.003, 0xf0dc58, { at: [0, 0, 0.0015] }, 0);
    text(g, 'STATUS', 0, 0.04, 0.003, 0.0085, INK);
    text(g, 'UPDATE?', 0, -0.03, 0.003, 0.0085, INK);
    return b.build();
  },
  meetingTv: () => {
    // The meeting room's TV on its low credenza stand on the back wall: STATUS UPDATE · 09:30.
    const b = new ModelBuilder();
    const base = FRONT_WALL_HEIGHT;
    b.box(0.5, 0.02, 0.16, 0x2a2d33, { at: [0, base + 0.01, 0.1] }, 0.006);
    b.box(0.05, 0.12, 0.03, 0x2a2d33, { at: [0, base + 0.07, 0.08] }, 0.006);
    const g = framed(b, [0, base + 0.33, 0.1], [-0.12, 0, 0]);
    g.box(1.16, 0.44, 0.035, 0x1d1f23, { at: [0, 0, 0] }, 0.012);
    g.screen(1.1, 0.38, 0x1c2c44, { at: [0, 0, 0.0185] });
    g.add(new THREE.BoxGeometry(1.1, 0.09, 0.002), 0x5a46a8, { at: [0, 0.145, 0.019] }, 'glow');
    text(g, 'STATUS UPDATE', 0, 0.045, 0.02, 0.017, 0xf2f2f8);
    text(g, '09:30', 0, -0.075, 0.02, 0.02, 0xffd070);
    text(g, 'MANDATORY', 0, -0.155, 0.02, 0.007, 0xb8c4d8);
    return b.build();
  },
};

// ---- The linear LED pendants and their wire ----

/** The wire and drops: pale aluminium, thin, so it never crosses a station as a black line. */
const WIRE = 0x8a9096;
const WIRE_THICK = 0.006;

/**
 * A long linear LED pendant, built round its middle (where it hangs): a
 * slim aluminium extrusion with a warm-white diffuser underneath (glow), end
 * caps, two fine cables up to the wire `PENDANT_WIRE` over it.
 */
export function pendantModel(): Model {
  const b = new ModelBuilder();
  const len = PENDANT_HALF * 2 - 0.04;
  b.box(len, 0.04, 0.06, 0xc4c9ce, { at: [0, 0, 0] }, 0.01);
  b.box(len - 0.02, 0.006, 0.062, tint(ALU, 0.3), { at: [0, 0.02, 0] }, 0);
  b.add(new THREE.BoxGeometry(len - 0.03, 0.008, 0.046), 0xfff2dc, { at: [0, -0.022, 0] }, 'glow');
  for (const s of [-1, 1]) {
    b.box(0.014, 0.046, 0.064, ALU_DARK, { at: [s * (len / 2), 0, 0] }, 0.004);
    b.box(
      WIRE_THICK * 0.7,
      PENDANT_WIRE - 0.02,
      WIRE_THICK * 0.7,
      WIRE,
      { at: [s * (len / 2 - 0.08), 0.02 + (PENDANT_WIRE - 0.02) / 2, 0] },
      0,
    );
    b.box(0.022, 0.014, 0.016, WIRE, { at: [s * (len / 2 - 0.08), PENDANT_WIRE, 0] }, 0.004);
  }
  return b.build();
}

/**
 * The wire the pendants hang from, through `points` (`[x, y]`), sagging a
 * little between them, tied off at each end to a slim aluminium post on the
 * partition top.
 */
export function pendantWireModel(points: readonly [number, number][]): Model {
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
        b.box(0.02, postH, 0.02, ALU_DARK, { at: [x, WALL_HEIGHT + postH / 2, 0] }, 0.004);
      b.box(0.05, 0.01, 0.05, ALU_DARK, { at: [x, WALL_HEIGHT + 0.005, 0] }, 0.003);
      b.box(0.028, 0.02, 0.028, ALU, { at: [x, p[1] + 0.03, 0] }, 0.004);
    }
  return b.build();
}

/** Within each art's half: re-exported for the tests. */
export const ART_HALF = MID_RISE_ART_HALF;
