import * as THREE from 'three';
import { tileHash } from '../../mapShape';
import { type Model, ModelBuilder, tint } from '../kit';
import { FRONT_WALL_HEIGHT, STATION_HEIGHT, WALL_HEIGHT } from '../layout';
import { FLOOR_COLORS } from '../look';
import type { CounterRun } from '../rooms/counterRun';
import { SOLID_LOOKS, solidSwap } from '../rooms/midRiseRoom';
import {
  CORE_LOOKS,
  FLOOR_WEAR,
  FLOOR_WEAR_KINDS,
  UPPER_ART_HALF,
  coreSwap,
} from '../rooms/upperFloorsRoom';
import type { StationModel } from '../stationModels';
import { framed, text } from './basement';
import { ALU, YOTTA_VIOLET, solidPanelModel } from './midRise';

/**
 * Hot Desking's three floors of the mid-rise (wall theme `upperFloors`,
 * floor theme `threeFloors`), built in code: the hot-desk floor's worn
 * carpet tiles with the grey walkway, the flattened pile by the lift, the
 * entrance mat and faint coffee rings; the test lab's pale sheet vinyl; the
 * meeting room's quieter carpet; the lift core's full-height plasterboard
 * panels; what hangs on the walls (the floor directories, the taped-off
 * stairwell door, the plan as a desk-booking spreadsheet, the booking
 * kiosk's SYSTEM DOWN, the clock at five to five, the lab's whiteboard of
 * bug repros, the meeting room's screen and its always-red BOOKED panel);
 * the front desk's pigeonholes behind the inbox, the revolving door at the
 * ship, the BUGS in-tray rack behind the bug queue, and the counters as
 * grey laminate returns shelves, darker than every station top.
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

const PAPER = 0xeeeee8;
const INK = 0x2a2d33;
const MARKER_RED = 0xc0302a;
const MARKER_BLUE = 0x2f5aa8;
const STEEL = 0xa3abb2;
const STEEL_DARK = 0x5f676f;
const TAPE_RED = 0xc8332e;
const TAPE_WHITE = 0xeeeeea;
const SIGN_GREEN = 0x2a9a5a;
const SCREEN_DARK = 0x16202c;

// ---- The floors ----

/** Variants a tile comes in, picked by its hash. */
const VARIANTS = 3;
/** Every floor look, for the tests. */
export const THREE_FLOOR_LOOKS = FLOOR_WEAR_KINDS * VARIANTS;

/** A floor look: its wear and its variant. */
export function threeLook(x: number, y: number, wear: number): number {
  const variant = (tileHash(x + 5, y + 21) >>> 4) % VARIANTS;
  return wear * VARIANTS + variant;
}

/** A tile's brightness: ±4% per tile, picked by the tile and the level. */
export function threeTone(x: number, y: number, salt: number): number {
  const own = ((Math.imul(x + 41, 73856093) ^ Math.imul(y + 7, 19349663) ^ salt) >>> 0) % 1001;
  return 1 + (own / 1000 - 0.5) * 0.08;
}

/** The walkway's grey carpet tiles, the lab's pale vinyl, the meeting room's dusky carpet. */
export const WALKWAY_GREY = 0xa2a7ab;
export const VINYL = 0x8e9593;
export const MEETING_CARPET = 0x8a849c;
const MAT = 0x4d5258;

/** The quarter tiles of a tile: back-left, back-right, front-left, front-right. */
const QUARTERS: readonly (readonly [number, number])[] = [
  [-0.25, -0.25],
  [0.25, -0.25],
  [-0.25, 0.25],
  [0.25, 0.25],
];

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

/** Carpet tiles: four quarter tiles laid quarter-turned in two tones, pile stripes, seams, flecks. */
function carpetTiles(b: ModelBuilder, base: number, alt: number, variant: number): void {
  b.box(1, 0.012, 1, base, { at: [0, -0.006, 0] }, 0);
  QUARTERS.forEach(([x, z], i) => {
    const turned = i === 1 || i === 2;
    if (turned) mark(b, 0.49, 0.49, alt, x, z);
    const stripe = tint(turned ? alt : base, -0.04);
    for (const k of [-0.15, -0.05, 0.05, 0.15])
      if (turned) mark(b, 0.04, 0.46, stripe, x + k, z, 0.0016);
      else mark(b, 0.46, 0.04, stripe, x, z + k, 0.0016);
  });
  const seam = tint(base, -0.06);
  for (const z of [-0.494, 0]) mark(b, 1, 0.012, seam, 0, z, 0.0019);
  for (const x of [-0.494, 0]) mark(b, 0.012, 1, seam, x, 0, 0.0019);
  for (let k = 0; k < 5; k++) {
    const h = tileHash(variant * 7 + k, 29);
    mark(
      b,
      0.016,
      0.016,
      tint(base, h % 2 ? 0.1 : -0.12),
      ((h % 89) / 89 - 0.5) * 0.9,
      (((h >> 7) % 83) / 83 - 0.5) * 0.9,
      0.0021,
    );
  }
}

/** A faint coffee ring in quarter `corner`: a ring, a fainter fill, one drip. */
function coffeeRing(b: ModelBuilder, corner: number, base: number): void {
  const [qx, qz] = QUARTERS[corner] ?? [0, 0];
  const cx = qx * 1.25;
  const cz = qz * 1.25;
  const fill = mix(base, 0x7a5a40, 0.16);
  const ring = mix(base, 0x5e4230, 0.3);
  b.add(new THREE.CylinderGeometry(0.075, 0.075, 0.002, 18), fill, { at: [cx, 0.0024, cz] });
  b.add(new THREE.TorusGeometry(0.075, 0.006, 3, 24), ring, {
    at: [cx, 0.0026, cz],
    rot: [Math.PI / 2, 0, 0],
  });
  // A second, fainter ring overlapping: someone put the mug down twice.
  b.add(new THREE.TorusGeometry(0.07, 0.004, 3, 24, Math.PI * 1.3), mix(base, 0x5e4230, 0.18), {
    at: [cx - qx * 0.16, 0.0026, cz - qz * 0.08],
    rot: [Math.PI / 2, 0, 0.8],
  });
}

/** Pile worn flat in an oval where everyone waits: a paler, flatter patch. */
function wornPatch(b: ModelBuilder, base: number): void {
  const g = new THREE.CylinderGeometry(0.4, 0.4, 0.002, 24);
  g.scale(1.15, 1, 0.8);
  b.add(g, mix(base, 0xb4b8bc, 0.18), { at: [0, 0.0023, 0] });
  const h = new THREE.CylinderGeometry(0.24, 0.24, 0.002, 20);
  h.scale(1.2, 1, 0.7);
  b.add(h, mix(base, 0xb4b8bc, 0.28), { at: [0.04, 0.0025, -0.02] });
}

/** The entrance mat: dark ribbed coir-look rubber, a border along `edges` (back 1, front 2, left 4, right 8). */
function entranceMat(b: ModelBuilder, edges: number): void {
  b.box(1, 0.016, 1, MAT, { at: [0, -0.004, 0] }, 0);
  for (let k = -4; k <= 4; k++) mark(b, 0.9, 0.03, tint(MAT, 0.12), 0, k * 0.1, 0.0045);
  const bw = 0.06;
  for (const [bit, dx, dz] of [
    [1, 0, -1],
    [2, 0, 1],
    [4, -1, 0],
    [8, 1, 0],
  ] as const) {
    if (!(edges & bit)) continue;
    const along = dz !== 0;
    b.box(
      along ? 1 : bw,
      0.02,
      along ? bw : 1,
      tint(MAT, -0.25),
      { at: [dx * (0.5 - bw / 2), 0.0, dz * (0.5 - bw / 2)] },
      0,
    );
  }
}

/** Sheet vinyl: pale, a weld seam per variant, a faint speckle, the sheen of a mop. */
function vinyl(b: ModelBuilder, variant: number, scuffed: boolean): void {
  b.box(1, 0.012, 1, VINYL, { at: [0, -0.006, 0] }, 0);
  // The sheet's weld seams: every tile along z, every other tile along x.
  mark(b, 0.008, 1, tint(VINYL, -0.12), -0.494, 0, 0.0016);
  if (variant !== 1) mark(b, 1, 0.008, tint(VINYL, -0.1), 0, -0.494, 0.0016);
  for (let k = 0; k < 14; k++) {
    const h = tileHash(variant * 13 + k, 61);
    mark(
      b,
      0.012,
      0.012,
      tint(VINYL, h % 3 === 0 ? -0.18 : 0.08),
      ((h % 97) / 97 - 0.5) * 0.92,
      (((h >> 7) % 89) / 89 - 0.5) * 0.92,
      0.0018,
    );
  }
  mark(b, 0.09, 0.8, tint(VINYL, 0.05), 0.18 - variant * 0.12, 0, 0.0014, 0.5);
  if (!scuffed) return;
  // Black heel and trolley scuffs, short arcs.
  for (const [x, z, a, w] of [
    [-0.2, -0.1, 0.4, 0.16],
    [0.15, 0.12, -0.3, 0.12],
    [0.05, -0.25, 1.2, 0.1],
    [-0.28, 0.24, -0.8, 0.09],
  ] as const)
    mark(b, w, 0.012, tint(VINYL, -0.32), x, z, 0.0022, a);
}

/** The meeting room's quieter carpet: one dusky broadloom, a small square pattern, its sheen. */
function meetingCarpet(b: ModelBuilder, variant: number, worn: boolean): void {
  b.box(1, 0.012, 1, MEETING_CARPET, { at: [0, -0.006, 0] }, 0);
  const dot = tint(MEETING_CARPET, -0.08);
  for (let i = 0; i < 4; i++)
    for (let j = 0; j < 4; j++)
      mark(b, 0.04, 0.04, dot, -0.375 + i * 0.25, -0.375 + j * 0.25, 0.0016, 0.785);
  mark(b, 0.9, 0.06, tint(MEETING_CARPET, 0.03), 0, -0.3 + variant * 0.25, 0.0014, 0.05);
  if (worn) wornPatch(b, MEETING_CARPET);
}

/**
 * A floor tile (`look` from `threeLook`): the hot-desk floor's worn carpet
 * tiles and their wear, the lab's vinyl, the meeting room's carpet (see
 * `FLOOR_WEAR`).
 */
export function threeFloorModel(look: number): Model {
  const variant = look % VARIANTS;
  const wear = Math.floor(look / VARIANTS) % FLOOR_WEAR_KINDS;
  const b = new ModelBuilder();
  const [base, alt] = FLOOR_COLORS.threeFloors;
  if (wear === FLOOR_WEAR.vinyl || wear === FLOOR_WEAR.vinylScuff) {
    vinyl(b, variant, wear === FLOOR_WEAR.vinylScuff);
    return b.build();
  }
  if (wear === FLOOR_WEAR.meeting || wear === FLOOR_WEAR.meetingWorn) {
    meetingCarpet(b, variant, wear === FLOOR_WEAR.meetingWorn);
    return b.build();
  }
  if (wear >= FLOOR_WEAR.mat && wear < FLOOR_WEAR.mat + 16) {
    entranceMat(b, wear - FLOOR_WEAR.mat);
    return b.build();
  }
  if (wear === FLOOR_WEAR.worn) {
    // Where everyone waits for the lift: the walkway's grey, worn a shade paler, no path down it.
    carpetTiles(b, tint(WALKWAY_GREY, 0.03), tint(WALKWAY_GREY, -0.01), variant);
    return b.build();
  }
  if (wear === FLOOR_WEAR.walkway) {
    carpetTiles(b, WALKWAY_GREY, tint(WALKWAY_GREY, -0.04), variant);
    // Trodden darker down the middle of the path.
    mark(b, 0.5, 0.5, mix(WALKWAY_GREY, 0x6c7178, 0.12), 0, 0, 0.0024, 0.785);
    return b.build();
  }
  carpetTiles(b, base, alt, variant);
  // Faded here and there: an older tile, a sun-bleached quarter.
  if (variant === 2) mark(b, 0.49, 0.49, mix(base, 0xb8bcc2, 0.1), 0.25, 0.25, 0.0013);
  if (wear >= FLOOR_WEAR.coffee && wear < FLOOR_WEAR.coffee + 4)
    coffeeRing(b, wear - FLOOR_WEAR.coffee, base);
  return b.build();
}

// ---- The walls: the core's full-height panels ----

/** Every full-height panel swap: the core's, and the solid panels behind art. */
export const CORE_MODELS: Readonly<Record<string, () => Model>> = {
  ...Object.fromEntries(
    Array.from({ length: CORE_LOOKS }, (_, look) => [coreSwap(look), () => solidPanelModel(look)]),
  ),
  ...Object.fromEntries(
    Array.from({ length: SOLID_LOOKS }, (_, look) => [
      solidSwap(look),
      () => solidPanelModel(look),
    ]),
  ),
};

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

/** The floor directory by a lift: all three floors, the one you're on marked violet. */
function directory(here: number): Model {
  const b = new ModelBuilder();
  const z = 0.506;
  const cy = 0.62;
  b.box(0.58, 0.34, 0.02, STEEL_DARK, { at: [0, cy, z + 0.01] }, 0.006);
  b.box(0.54, 0.3, 0.004, 0x2a2f36, { at: [0, cy, z + 0.021] }, 0);
  const f = z + 0.023;
  text(b, 'YOTTA', 0, cy + 0.11, f, 0.008, 0xb8a8ff);
  for (const [k, n, label] of [
    [0, 2, 'MEETING ROOM'],
    [1, 1, 'TEST LAB'],
    [2, 0, 'HOT DESKS'],
  ] as const) {
    const y = cy + 0.045 - k * 0.075;
    const mine = n === here;
    if (mine) b.box(0.52, 0.062, 0.002, YOTTA_VIOLET, { at: [0, y, f] }, 0);
    leftText(b, String(n), -0.24, y, f + 0.001, 0.009, mine ? 0xffffff : 0xffc070);
    leftText(b, label, -0.18, y, f + 0.001, 0.0072, mine ? 0xffffff : 0xdfe3e8);
  }
  return b.build();
}

/**
 * The stairwell door, taped off: a grey steel fire door with its vision
 * panel and push bar in a steel frame, red-and-white tape across it in an
 * X and a band, the A4 sign STAIRS CLOSED - HOT DESK REFIT, and the green
 * fire-exit sign over the frame.
 */
function stairsClosed(): Model {
  const b = new ModelBuilder();
  const z = 0.506;
  const doorW = 0.62;
  const doorH = 0.86;
  const door = 0x7d868f;
  // The frame and the door.
  b.box(
    doorW + 0.08,
    doorH + 0.04,
    0.02,
    STEEL_DARK,
    { at: [0, (doorH + 0.04) / 2, z + 0.01] },
    0.006,
  );
  b.box(doorW, doorH, 0.02, door, { at: [0, doorH / 2, z + 0.02] }, 0.006);
  const f = z + 0.031;
  // The vision panel (wired glass, dark), the push bar, the kick plate.
  b.box(0.12, 0.3, 0.004, 0x37414b, { at: [0.16, 0.6, f] }, 0);
  for (const k of [-0.06, 0, 0.06])
    b.box(0.12, 0.003, 0.002, 0x56616c, { at: [0.16, 0.6 + k, f + 0.002] }, 0);
  b.box(0.5, 0.03, 0.03, STEEL, { at: [0, 0.42, f + 0.02] }, 0.008);
  b.box(doorW - 0.04, 0.1, 0.003, tint(door, 0.12), { at: [0, 0.07, f] }, 0);
  // The tape: an X corner to corner and a band across, red and white stripes.
  const tape = (cx: number, cy: number, len: number, a: number) => {
    const g = framed(b, [cx, cy, f + 0.012], [0, 0, a]);
    const n = 12;
    for (let i = 0; i < n; i++)
      g.box(
        len / n + 0.002,
        0.05,
        0.004,
        i % 2 ? TAPE_WHITE : TAPE_RED,
        {
          at: [-len / 2 + (i + 0.5) * (len / n), 0, 0],
        },
        0,
      );
  };
  const diag = Math.hypot(doorW + 0.1, doorH - 0.1);
  const a = Math.atan2(doorH - 0.1, doorW + 0.1);
  tape(0, doorH / 2, diag, a);
  tape(0, doorH / 2, diag, -a);
  // The sign, taped over the X.
  const s = framed(b, [0, 0.66, f + 0.022], [0, 0, 0.04]);
  s.box(0.36, 0.2, 0.003, PAPER, {}, 0);
  s.box(0.34, 0.05, 0.002, TAPE_RED, { at: [0, 0.065, 0.002] }, 0);
  text(s, 'STAIRS CLOSED', 0, 0.065, 0.004, 0.0068, 0xffffff);
  text(s, 'HOT DESK', 0, 0.005, 0.003, 0.0085, INK);
  text(s, 'REFIT', 0, -0.055, 0.003, 0.0085, INK);
  s.box(0.06, 0.025, 0.002, 0xe8e2c8, { at: [-0.15, 0.1, 0.003], rot: [0, 0, 0.5] }, 0);
  s.box(0.06, 0.025, 0.002, 0xe8e2c8, { at: [0.15, 0.1, 0.003], rot: [0, 0, -0.5] }, 0);
  // The fire-exit sign over the frame.
  const cy = doorH + 0.15;
  b.box(0.36, 0.12, 0.016, SIGN_GREEN, { at: [0, cy, z + 0.008] }, 0.006);
  const g = z + 0.017;
  b.box(0.04, 0.08, 0.002, 0xf2f4f0, { at: [-0.12, cy, g] }, 0);
  b.box(0.026, 0.066, 0.002, SIGN_GREEN, { at: [-0.12, cy, g + 0.001] }, 0);
  b.sphere(0.011, 0xf2f4f0, { at: [-0.05, cy + 0.03, g] });
  b.box(0.018, 0.04, 0.002, 0xf2f4f0, { at: [-0.055, cy, g], rot: [0, 0, 0.4] }, 0);
  b.box(0.1, 0.018, 0.002, 0xf2f4f0, { at: [0.07, cy, g] }, 0);
  b.add(new THREE.ConeGeometry(0.026, 0.04, 3), 0xf2f4f0, {
    at: [0.13, cy, g],
    rot: [0, 0, -Math.PI / 2],
  });
  return b.build();
}

/**
 * The plan as the desk-booking spreadsheet: a printout on a little
 * aluminium board standing on the low back wall, leaning back: a header
 * row (DESK, WHO), the grid, rows of names crossed out, and the plan in
 * three rows: 1. BUILD IT, 2. ??? (in red), 3. PROFIT.
 */
function planBoard(): Model {
  const root = new ModelBuilder();
  const w = 0.7;
  const h = 0.5;
  const b = framed(root, [0, FRONT_WALL_HEIGHT, 0.04], [-0.18, 0, 0]);
  const cy = h / 2 + 0.06;
  b.box(w + 0.05, h + 0.05, 0.03, ALU, { at: [0, cy, -0.015] }, 0.008);
  b.box(w - 0.01, h - 0.01, 0.004, 0xf6f6f2, { at: [0, cy, 0.002] }, 0);
  const f = 0.005;
  // The header row in the spreadsheet's green, the grid.
  b.box(w - 0.03, 0.06, 0.002, 0x2f8a52, { at: [0, cy + h / 2 - 0.05, f] }, 0);
  text(b, 'DESK BOOKING', -0.05, cy + h / 2 - 0.05, f + 0.001, 0.0085, 0xffffff);
  const rowY = (k: number) => cy + h / 2 - 0.115 - k * 0.075;
  const colX = [-w / 2 + 0.06, -w / 2 + 0.16];
  for (let k = 0; k <= 5; k++)
    b.box(w - 0.04, 0.004, 0.002, 0xb8c0b8, { at: [0, rowY(k) + 0.037, f] }, 0);
  for (const x of [colX[0] ?? 0, (colX[1] ?? 0) - 0.04])
    b.box(0.004, h - 0.1, 0.002, 0xb8c0b8, { at: [x + 0.045, cy - 0.05, f] }, 0);
  for (const [k, label, color] of [
    [0, '1. BUILD IT', INK],
    [1, '2. ???', MARKER_RED],
    [2, '3. PROFIT', INK],
  ] as const) {
    leftText(b, `A${k + 1}`, (colX[0] ?? 0) - 0.03, rowY(k), f + 0.001, 0.0075, 0x6a7078);
    leftText(b, label, (colX[1] ?? 0) - 0.01, rowY(k), f + 0.001, 0.0095, color);
  }
  // The rest: names booked and crossed out.
  for (const k of [3, 4]) {
    leftText(b, `A${k + 1}`, (colX[0] ?? 0) - 0.03, rowY(k), f + 0.001, 0.0075, 0x6a7078);
    b.box(0.26, 0.012, 0.002, 0x8a9096, { at: [0.02, rowY(k), f] }, 0);
    b.box(0.3, 0.008, 0.002, MARKER_RED, { at: [0.02, rowY(k), f + 0.002], rot: [0, 0, 0.08] }, 0);
  }
  b.box(0.1, 0.05, 0.03, 0x2a2d33, { at: [0, cy + h / 2 + 0.005, 0.015] }, 0.006);
  root.box(
    0.02,
    0.36,
    0.02,
    ALU,
    { at: [0, FRONT_WALL_HEIGHT + 0.17, -0.06], rot: [0.32, 0, 0] },
    0.004,
  );
  root.box(0.62, 0.02, 0.06, ALU, { at: [0, FRONT_WALL_HEIGHT + 0.01, 0.03] }, 0.004);
  return root.build();
}

/**
 * The desk-booking kiosk on the front desk's end panel: a slim kiosk screen
 * on the wall showing DESK BOOKING over a red SYSTEM DOWN error, and under
 * it the paper sign-up sheet taped on, names scrawled down it.
 */
function kiosk(): Model {
  const b = new ModelBuilder();
  const z = 0.506;
  const cy = 0.62;
  b.box(0.36, 0.28, 0.03, 0x2a2e34, { at: [0, cy, z + 0.015] }, 0.01);
  const f = z + 0.031;
  b.screen(0.32, 0.24, 0x24364a, { at: [0, cy, f] });
  b.box(0.3, 0.05, 0.002, 0x3a5070, { at: [0, cy + 0.085, f + 0.0015] }, 0);
  text(b, 'DESK BOOKING', 0, cy + 0.085, f + 0.003, 0.0058, 0xe8eef6);
  b.screen(0.28, 0.09, 0xd8342c, { at: [0, cy - 0.01, f + 0.002] });
  text(b, 'SYSTEM', 0, cy + 0.01, f + 0.004, 0.0085, 0xffffff);
  text(b, 'DOWN', 0, cy - 0.032, f + 0.004, 0.0085, 0xffffff);
  b.box(0.03, 0.03, 0.002, 0xd8d8d8, { at: [0, cy - 0.095, f + 0.002] }, 0);
  // The paper sign-up sheet under it, taped on crooked.
  const s = framed(b, [0.02, cy - 0.27, z + 0.004], [0, 0, -0.06]);
  s.box(0.24, 0.2, 0.003, PAPER, {}, 0);
  text(s, 'SIGN UP', 0, 0.075, 0.003, 0.0065, INK);
  for (let k = 0; k < 4; k++) {
    s.box(0.18, 0.003, 0.002, 0xa0a8b0, { at: [0, 0.04 - k * 0.04, 0.002] }, 0);
    s.box(
      0.07 + (k % 3) * 0.03,
      0.01,
      0.002,
      k % 2 ? MARKER_BLUE : INK,
      {
        at: [-0.04 + (k % 2) * 0.03, 0.05 - k * 0.04, 0.003],
        rot: [0, 0, (k % 2 ? -1 : 1) * 0.05],
      },
      0,
    );
  }
  s.box(0.06, 0.025, 0.002, 0xe8e2c8, { at: [0, 0.1, 0.003] }, 0);
  return b.build();
}

/** The office clock, high on the panel: aluminium rim, white face, five to five on a Friday. */
function clock(): Model {
  const b = new ModelBuilder();
  const cy = 1.0;
  const disc = (r: number, d: number, color: number, z: number) =>
    b.cylinder(r, r, d, color, { at: [0, cy, z], rot: [Math.PI / 2, 0, 0] }, 28);
  disc(0.1, 0.03, ALU, 0.52);
  disc(0.087, 0.01, 0xf7f6f0, 0.536);
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2;
    b.box(
      0.007,
      k % 3 === 0 ? 0.02 : 0.01,
      0.003,
      INK,
      { at: [Math.sin(a) * 0.072, cy + Math.cos(a) * 0.072, 0.542], rot: [0, 0, -a] },
      0,
    );
  }
  const hand = (len: number, a: number, w: number, color = INK) =>
    b.box(
      w,
      len,
      0.003,
      color,
      { at: [Math.sin(a) * len * 0.5, cy + Math.cos(a) * len * 0.5, 0.545], rot: [0, 0, -a] },
      0,
    );
  hand(0.045, (4.92 / 12) * Math.PI * 2, 0.011);
  hand(0.066, (55 / 60) * Math.PI * 2, 0.007);
  return b.build();
}

/**
 * The test lab's whiteboard of bug repros: BUG REPROS in red, numbered
 * steps in blue, a phone taped to the corner, an arrow, a magnet or two.
 */
function reproBoard(): Model {
  const b = new ModelBuilder();
  const z = 0.506;
  const cy = 0.7;
  const w = 0.86;
  const h = 0.48;
  b.box(w + 0.04, h + 0.04, 0.02, ALU, { at: [0, cy, z + 0.01] }, 0.006);
  b.box(w, h, 0.004, 0xf4f6f6, { at: [0, cy, z + 0.021] }, 0);
  const f = z + 0.024;
  text(b, 'BUG REPROS', -0.12, cy + 0.18, f, 0.009, MARKER_RED);
  for (const [k, s] of [
    [0, '1. TAP SAVE'],
    [1, '2. TAP AGAIN'],
    [2, '3. ???'],
  ] as const)
    leftText(
      b,
      s,
      -w / 2 + 0.05,
      cy + 0.08 - k * 0.075,
      f,
      0.0078,
      k === 2 ? MARKER_RED : MARKER_BLUE,
    );
  b.box(0.14, 0.008, 0.002, MARKER_RED, { at: [0.2, cy - 0.06, f], rot: [0, 0, 0.5] }, 0);
  // A phone taped up as evidence.
  b.box(0.1, 0.18, 0.012, 0x2a2e34, { at: [0.3, cy + 0.04, f + 0.006] }, 0.008);
  b.screen(0.08, 0.15, 0x6a8fb0, { at: [0.3, cy + 0.04, f + 0.013] });
  b.box(0.12, 0.025, 0.002, 0xe8e2c8, { at: [0.3, cy + 0.13, f + 0.014], rot: [0, 0, 0.2] }, 0);
  for (const [x, c] of [
    [-0.32, 0xd84a3a],
    [0.05, 0x3a7ad8],
  ] as const)
    b.cylinder(
      0.018,
      0.018,
      0.012,
      c,
      { at: [x, cy - 0.17, f + 0.006], rot: [Math.PI / 2, 0, 0] },
      10,
    );
  b.box(w, 0.03, 0.04, ALU, { at: [0, cy - h / 2 - 0.02, z + 0.03] }, 0.006);
  return b.build();
}

/** The meeting room's screen: a wall TV showing today's bookings, every slot taken. */
function meetingScreen(): Model {
  const b = new ModelBuilder();
  const z = 0.506;
  const cy = 0.74;
  const w = 0.82;
  const h = 0.46;
  b.box(w + 0.04, h + 0.04, 0.03, 0x1c1f24, { at: [0, cy, z + 0.015] }, 0.01);
  const f = z + 0.031;
  b.screen(w, h, SCREEN_DARK, { at: [0, cy, f] });
  text(b, 'TODAY', -0.28, cy + 0.18, f + 0.002, 0.007, 0xc8d4e0);
  for (let k = 0; k < 5; k++) {
    const y = cy + 0.11 - k * 0.075;
    b.screen(w - 0.08, 0.055, k % 2 ? 0x8a5a2a : 0x6a3a8a, { at: [0, y, f + 0.001] });
    leftText(b, `${9 + k * 2}:00`, -w / 2 + 0.06, y, f + 0.002, 0.0055, 0xf0e8ff);
    leftText(b, k === 4 ? 'FRIDAY SYNC' : 'BOOKED', -w / 2 + 0.24, y, f + 0.002, 0.0065, 0xffffff);
  }
  return b.build();
}

/** The always-red BOOKED panel by the meeting room's door: a small steel-framed screen. */
function booked(): Model {
  const b = new ModelBuilder();
  const z = 0.506;
  const cy = 0.66;
  b.box(0.28, 0.18, 0.026, 0x2a2e34, { at: [0, cy, z + 0.013] }, 0.008);
  b.screen(0.24, 0.14, 0xd8342c, { at: [0, cy, z + 0.027] });
  text(b, 'BOOKED', 0, cy + 0.02, z + 0.029, 0.0085, 0xffffff);
  b.box(0.18, 0.012, 0.002, 0xffd0c8, { at: [0, cy - 0.04, z + 0.029] }, 0);
  return b.build();
}

/** What hangs on the walls, by name in the plan's `wallArt`. */
export const UPPER_WALL_ART: Readonly<Record<string, () => Model>> = {
  directory0: () => directory(0),
  directory1: () => directory(1),
  directory2: () => directory(2),
  stairsClosed,
  plan: planBoard,
  kiosk,
  clock,
  reproBoard,
  meetingScreen,
  booked,
};

// ---- The front desk, the revolving door, the bug rack ----

/**
 * The front desk behind the inbox (`span` tiles, the model's −z the
 * outside): a full-height panel along the back edge with a grid of
 * pigeonholes, post and parcels in a few, a FRONT DESK band over them, a
 * desk bell on the ledge.
 */
export function frontDeskModel(span: number): Model {
  const b = new ModelBuilder();
  const w = span;
  const zb = -0.5;
  const d = 0.16;
  const h = WALL_HEIGHT;
  const wood = 0x8a7458;
  b.box(w, h, d, wood, { at: [0, h / 2, zb + d / 2] }, 0.01);
  const f = zb + d + 0.002;
  // The band over the pigeonholes.
  b.box(w - 0.06, 0.12, 0.01, 0x3a3f46, { at: [0, h - 0.1, f] }, 0);
  text(b, 'FRONT DESK', 0, h - 0.1, f + 0.006, 0.012, 0xe8e4ff);
  // The pigeonholes: a grid from above the station top up to the band.
  const cols = Math.max(3, Math.round(w * 4));
  const rows = 3;
  const y0 = STATION_HEIGHT + 0.08;
  const y1 = h - 0.18;
  const cw = (w - 0.08) / cols;
  const ch = (y1 - y0) / rows;
  for (let i = 0; i < cols; i++)
    for (let j = 0; j < rows; j++) {
      const x = -w / 2 + 0.04 + (i + 0.5) * cw;
      const y = y0 + (j + 0.5) * ch;
      b.box(cw - 0.02, ch - 0.02, 0.01, tint(wood, -0.45), { at: [x, y, f - 0.004] }, 0);
      const h2 = tileHash(i + 3, j + 11) % 5;
      if (h2 === 0) b.box(cw - 0.05, 0.03, 0.012, PAPER, { at: [x, y - ch / 2 + 0.03, f] }, 0);
      else if (h2 === 1)
        b.box(cw - 0.06, ch * 0.5, 0.014, 0xb0946a, { at: [x, y - ch * 0.2, f] }, 0.004);
      else if (h2 === 2)
        b.box(
          cw - 0.05,
          0.05,
          0.012,
          0xd8d0f0,
          { at: [x, y - ch / 2 + 0.04, f], rot: [0, 0, 0.15] },
          0,
        );
    }
  return b.build();
}

/**
 * The revolving front door at the ship (`span` tiles wide; the model's +z
 * the street): a low glass drum straddling the front edge, its four wings,
 * a brushed-steel ring over it with a violet band, a round mat under it and
 * a ribbed mat in front on the pavement;
 * nothing over 0.6.
 */
export function revolvingDoorModel(span: number): Model {
  const b = new ModelBuilder();
  const r = Math.min(0.5, span * 0.3);
  const z = 0.5 + r * 0.55;
  const h = 0.5;
  b.cylinder(r + 0.08, r + 0.08, 0.012, 0x6a7076, { at: [0, 0.006, z] }, 32);
  // The ribbed entrance mat on the pavement in front of the drum.
  const matZ = z + r + 0.16;
  b.box(span * 0.7, 0.012, 0.26, 0x3f4449, { at: [0, 0.006, matZ] }, 0);
  for (let k = -3; k <= 3; k++)
    b.box(span * 0.66, 0.004, 0.012, 0x5a6066, { at: [0, 0.014, matZ + k * 0.032] }, 0);
  b.cylinder(r, r, 0.02, 0xa8aeb4, { at: [0, 0.012, z] }, 32);
  // The drum's curved glass, as two arcs with an open mouth each side.
  for (const a0 of [0.35, Math.PI + 0.35]) {
    const g = new THREE.CylinderGeometry(r, r, h, 24, 1, true, a0, Math.PI - 0.7);
    b.add(g, 0xd8e6ee, { at: [0, h / 2 + 0.02, z] }, 'glass');
    for (const a of [a0, a0 + Math.PI - 0.7])
      b.box(
        0.025,
        h,
        0.025,
        STEEL,
        { at: [Math.sin(a) * r, h / 2 + 0.02, z + Math.cos(a) * r] },
        0.006,
      );
  }
  // The wings, turned a little, in steel frames.
  for (let k = 0; k < 4; k++) {
    const a = 0.4 + (k * Math.PI) / 2;
    const g = framed(b, [0, h / 2 + 0.02, z], [0, a, 0]);
    g.box(r - 0.04, h - 0.04, 0.012, 0xc6d4dc, { at: [r / 2, 0, 0] }, 0);
    g.box(0.02, h - 0.04, 0.03, STEEL, { at: [r - 0.04, 0, 0] }, 0.005);
  }
  b.cylinder(0.025, 0.025, h, STEEL, { at: [0, h / 2 + 0.02, z] }, 10);
  // The steel ring over the drum, a YOTTA-violet band on it.
  b.torus(r, 0.03, STEEL, { at: [0, h + 0.03, z], rot: [Math.PI / 2, 0, 0] });
  b.torus(r + 0.01, 0.018, YOTTA_VIOLET, { at: [0, h + 0.06, z], rot: [Math.PI / 2, 0, 0] });
  return b.build();
}

/**
 * The BUGS in-tray rack behind the bug queue (`span` tiles long; the
 * model's −z the outside): a steel frame on the outer edge with stacked
 * wire in-trays, paper spilling, a red BUGS plate on top.
 */
export function bugRackModel(span: number): Model {
  const b = new ModelBuilder();
  const w = span - 0.1;
  const zb = -0.5;
  const h = WALL_HEIGHT - 0.05;
  b.box(w, h, 0.08, STEEL_DARK, { at: [0, h / 2, zb + 0.04] }, 0.008);
  const trays = 3;
  for (let i = 0; i < trays; i++) {
    const y = STATION_HEIGHT + 0.12 + i * 0.13;
    for (let j = 0; j < span * 2; j++) {
      const x = -w / 2 + (j + 0.5) * (w / (span * 2));
      b.box(
        w / (span * 2) - 0.04,
        0.02,
        0.16,
        0x8a9198,
        { at: [x, y, zb + 0.16], rot: [0.25, 0, 0] },
        0,
      );
      const pile = tileHash(i + 2, j + 5) % 3;
      if (pile)
        b.box(
          w / (span * 2) - 0.07,
          0.012 * (pile + 1),
          0.14,
          i === 2 ? 0xf0d0c8 : PAPER,
          {
            at: [x, y + 0.02, zb + 0.15],
            rot: [0.25, 0, 0],
          },
          0,
        );
    }
  }
  b.box(0.44, 0.12, 0.02, 0xc83a32, { at: [0, h - 0.05, zb + 0.09] }, 0.006);
  text(b, 'BUGS', 0, h - 0.05, zb + 0.101, 0.016, 0xffffff);
  return b.build();
}

// ---- Counters ----

/** The returns shelves' laminate top: grey, darker than every station top. */
export const COUNTER_TOP = 0x8e939a;
const COUNTER_BODY = 0x6e747c;

/**
 * A counter as a grey laminate returns shelf, from where it sits in its
 * run (x along it): a cabinet with shadow-gap doors, the top a shade
 * darker at its front lip, a handle per tile, a sticky label on the run's
 * end (RETURNS) and a mug on one tile.
 */
export function upperCounter(run: CounterRun): StationModel {
  const b = new ModelBuilder();
  const h = STATION_HEIGHT;
  b.box(0.98, h - 0.05, 0.9, COUNTER_BODY, { at: [0, (h - 0.05) / 2, 0] }, 0.01);
  b.box(1.0, 0.05, 0.98, COUNTER_TOP, { at: [0, h - 0.025, 0] }, 0.01);
  b.box(1.0, 0.012, 0.02, tint(COUNTER_TOP, -0.2), { at: [0, h - 0.04, 0.49] }, 0);
  // Door gaps and handles on the front.
  b.box(0.006, h - 0.12, 0.004, tint(COUNTER_BODY, -0.3), { at: [0, (h - 0.05) / 2, 0.451] }, 0);
  for (const s of [-1, 1])
    b.box(0.08, 0.014, 0.014, STEEL, { at: [s * 0.08, h - 0.14, 0.458] }, 0.004);
  if (run.minusEnd) {
    b.box(0.18, 0.07, 0.003, 0xf2e27a, { at: [-0.3, h - 0.14, 0.452], rot: [0, 0, 0.05] }, 0);
    text(b, 'RETURNS', -0.3, h - 0.14, 0.455, 0.0045, INK);
  }
  if (run.plusEnd && !run.minusEnd) {
    b.cylinder(0.04, 0.036, 0.09, 0xe4e4de, { at: [0.32, h + 0.045, -0.28] }, 14);
    b.torus(0.025, 0.008, 0xe4e4de, { at: [0.36, h + 0.05, -0.28], rot: [0, 0, Math.PI / 2] });
  }
  return { base: b.build(), hero: null, heroAt: [0, 0] };
}

/** Within each art's half: re-exported for the tests. */
export const ART_HALF = UPPER_ART_HALF;
