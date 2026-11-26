/**
 * The operable wall's pieces, built in code with the kit (`../kit.ts`):
 * the panel leaves (a walnut lower section with a violet-grey acoustic
 * fabric inset and a telescoping upper section that rides up for full
 * height and sinks in where the wall is cut down for the camera), the
 * walnut storage closets with their double doors and amber beacons, the
 * brushed-steel floor track, and the walnut boardroom table halves on
 * castors. Every model stands at its origin as `foldingWalls.ts` places it.
 */

import * as THREE from 'three';
import { tileHash } from '../../mapShape';
import { type Model, ModelBuilder, tint } from '../kit';
import { STATION_HEIGHT, WALL_HEIGHT } from '../layout';
import { DOT_VIOLET, YOTTA_VIOLET } from '../roomModels/tower';
import { type P2, type WallRun, pointAt } from './track';

// ---- Materials ----

/**
 * Walnut veneer: the panels' rails, the closets; a deeper one for the table
 * tops (under every station top). Smoked walnut, low in saturation: the warm
 * afternoon light adds the orange, and the stations must stay the most
 * saturated things on screen.
 */
export const WALNUT = 0x5c5550;
/** A panel's top and the head rail: darker end grain. */
export const CAP_WALNUT = 0x4d4844;
const WALNUT_LIGHT = 0x787068;
const WALNUT_DEEP = 0x403c39;
/** The bead framing each fabric inset: a shade lighter than the veneer, so it catches the light. */
const BEAD = 0x645d56;
export const TABLE_TOP = 0x4c4743;
const TABLE_EDGE = 0x2b2928;
const CLOSET_INSIDE = 0x2b2928;
/** The acoustic fabric: a quiet violet-grey. */
export const FABRIC = 0x7a7392;
const FABRIC_WEAVE = 0x706a87;
/** Brushed steel: edges, caps, the track; its darker kick plate and the black of a slot. */
export const STEEL = 0xb3bac2;
const STEEL_DARK = 0x5d646c;
/** The panels' edges: dark brushed steel, so a run's joints don't read as a ladder. */
const STEEL_EDGE = 0x6a6f76;
/** The brushed plinth the track is set in, under every partition tile and into the pockets. */
const TRACK_PLINTH = 0x6e7073;
/** The front run's frosted glass upper section, and its frosted manifestation band. */
const FROST_GLASS = 0xdfe3ea;
const FROST = 0xc4cad3;
/** The track's bed in the floor: brushed steel in shade. */
const TRACK_BED = 0x7c848c;
const RUBBER = 0x24262a;
const INK = 0x1f2226;
export const BRASS = 0xb89150;
const VINYL = 0xf1f2f4;
export const AMBER = 0xffa53d;
const AMBER_DIM = 0x5a3a16;
const LENS_OFF = 0x8a5418;
const LEATHER = 0x3a2b2a;
const CARD = 0xeeeae2;
/** Sticky notes, a touch quieter than the stations. */
export const NOTES = [0xf0d45e, 0xee9bb6, 0x8fc6e8, 0xa8d78c, 0xf2ae64] as const;

// ---- The panels ----

/** A panel's thickness and a leaf's length along the track (two leaves to a panel, one panel to a tile). */
export const PANEL_T = 0.2;
const LEAF = 0.5;
/** The gap at a panel's outer ends (so twice this between panels: a hairline). */
const END_GAP = 0.002;
/** The track's plinth: the panels stand on it. */
export const PLINTH_H = 0.012;
const PLINTH_W = 0.55;
/** The head rail over a whole run: walnut, wider than a panel, so a closed run's top reads as one wall cap. */
const RAIL_W = 0.26;
const RAIL_H = 0.04;
/** The lower section: a cut-down panel stands this tall. */
export const LOW_TOP = 0.6;
const KICK_H = 0.06;
/** The upper section and its steel cap; it rides from inside the lower one up to the wall's height. */
const UPPER_H = 0.55;
const CAP_H = 0.016;
const UPPER_T = PANEL_T - 0.024;
/** The violet dot band, the same height all round the room. */
const DOT_Y = 0.52;
const DOT_PITCH = 0.1665;
/** The vinyl's pixel (three letters to a leaf, so every joint falls between letters) and where its letters sit. */
const VINYL_PX = 1 / 24;
const VINYL_Y = 0.3;

/** Where the upper section's bottom sits for extension `ext` (0 sunk into the lower one, 1 full height). */
export function upperBase(ext: number): number {
  const low = LOW_TOP - UPPER_H;
  const high = WALL_HEIGHT - CAP_H - UPPER_H;
  return low + (high - low) * ext;
}

/** What one leaf carries. */
export interface LeafLook {
  /** Which end the hinge is at: +1 the +x end (the panel's first leaf), −1 the −x end. */
  hinge: 1 | -1;
  /** Vinyl pixels on the outer face: [x along the leaf, y], each `VINYL_PX` square. */
  vinyl: [number, number][];
  /** A pull handle near the outer end. */
  handle: boolean;
  /** Variation (sticky notes). */
  salt: number;
  /** Steel edges on its cap (every third panel), else walnut end grain, so a stack doesn't read as a pallet. */
  steelCap: boolean;
}

/** A sticky note on a face at depth `z` (facing ±z by `face`). */
function note(b: ModelBuilder, x: number, y: number, z: number, color: number, turn: number): void {
  b.box(0.074, 0.074, 0.004, color, { at: [x, y, z], rot: [0, 0, turn] }, 0);
  // Its curl: a lighter strip at the bottom edge.
  b.box(
    0.07,
    0.012,
    0.005,
    tint(color, 0.25),
    {
      at: [x + Math.sin(turn) * 0.03, y - Math.cos(turn) * 0.031, z],
      rot: [0, 0, turn],
    },
    0,
  );
}

/**
 * An acoustic fabric inset on the face at depth `side * z`: the fabric `w`
 * by `h` round (`cx`, `cy`), a few weave lines, framed by a proud walnut
 * bead with a dark shadow line inside it, so a face reads as an upholstered
 * panel, not slats.
 */
function fabricInset(
  b: ModelBuilder,
  cx: number,
  cy: number,
  w: number,
  h: number,
  z: number,
  side: number,
): void {
  const bead = 0.02;
  const f = side * (z + 0.002);
  b.box(w, h, 0.004, FABRIC, { at: [cx, cy, f] }, 0);
  for (let k = 1; k < 4; k++)
    b.box(0.003, h - 0.01, 0.0045, FABRIC_WEAVE, { at: [cx - w / 2 + (w * k) / 4, cy, f] }, 0);
  // The shadow line just inside the bead.
  const s = side * (z + 0.0025);
  b.box(w, 0.006, 0.004, INK, { at: [cx, cy + h / 2 - 0.003, s] }, 0);
  b.box(0.006, h, 0.004, INK, { at: [cx - w / 2 + 0.003, cy, s] }, 0);
  // The bead: proud of the veneer, lit along its top.
  const bz = side * (z + 0.004);
  for (const dy of [-1, 1])
    b.box(w + 2 * bead, bead, 0.008, BEAD, { at: [cx, cy + dy * (h / 2 + bead / 2), bz] }, 0.002);
  for (const dx of [-1, 1])
    b.box(bead, h, 0.008, BEAD, { at: [cx + dx * (w / 2 + bead / 2), cy, bz] }, 0.002);
  b.box(w + 2 * bead, 0.004, 0.009, WALNUT_LIGHT, { at: [cx, cy + h / 2 + bead, bz] }, 0);
}

/** The lower section of a leaf, its middle at the origin, along x, outer face +z. */
export function leafLowerModel(look: LeafLook): Model {
  const b = new ModelBuilder();
  const h = look.hinge;
  const outerEnd = -h * (LEAF / 2 - END_GAP);
  const hingeEnd = h * (LEAF / 2 - 0.002);
  const len = Math.abs(hingeEnd - outerEnd);
  const cx = (hingeEnd + outerEnd) / 2;
  const z = PANEL_T / 2;
  // Kick plate, walnut body, the steel lip round the top.
  b.box(len, KICK_H, PANEL_T + 0.006, STEEL_DARK, { at: [cx, KICK_H / 2, 0] }, 0.004);
  b.box(len, LOW_TOP - KICK_H, PANEL_T, WALNUT, { at: [cx, (LOW_TOP + KICK_H) / 2, 0] }, 0.006);
  for (const side of [-1, 1]) {
    const fz = side * (z + 0.0015);
    fabricInset(b, cx, 0.29, len - 0.11, 0.27, z, side);
    // A quiet grain line in the walnut rails above and below the fabric.
    b.box(len - 0.02, 0.004, 0.003, WALNUT_LIGHT, { at: [cx, 0.475, fz] }, 0);
    b.box(len - 0.02, 0.004, 0.003, WALNUT_DEEP, { at: [cx, 0.1, fz] }, 0);
    b.box(len, 0.012, 0.006, STEEL_EDGE, { at: [cx, LOW_TOP - 0.006, side * (z + 0.002)] }, 0);
  }
  // The lower section's top: walnut end grain, seen where the wall is cut down.
  b.box(len, 0.004, PANEL_T - 0.01, CAP_WALNUT, { at: [cx, LOW_TOP + 0.001, 0] }, 0);
  // The dark steel edge at the outer end: a hairline, not a bright stile.
  b.box(
    0.008,
    LOW_TOP - 0.004,
    PANEL_T + 0.002,
    STEEL_EDGE,
    { at: [outerEnd + h * 0.004, LOW_TOP / 2, 0] },
    0,
  );
  // The hinge: a steel post exactly in the panel's thickness, so a corner turns round it.
  if (h === 1)
    b.cylinder(
      PANEL_T / 2 - 0.004,
      PANEL_T / 2 - 0.004,
      LOW_TOP - 0.004,
      STEEL_EDGE,
      {
        at: [LEAF / 2, LOW_TOP / 2, 0],
      },
      16,
    );
  // The violet dot band (outer face), on a world pitch so it runs on across the leaves.
  for (let k = -1; k <= 1; k++)
    b.box(0.034, 0.034, 0.005, DOT_VIOLET, { at: [k * DOT_PITCH, DOT_Y, z + 0.0035] }, 0);
  for (const [x, y] of look.vinyl)
    b.box(VINYL_PX, VINYL_PX, 0.004, VINYL, { at: [x, y, z + 0.007] }, 0);
  if (look.handle) {
    const hx = outerEnd + h * 0.035;
    for (const side of [-1, 1]) {
      b.box(0.022, 0.11, 0.003, INK, { at: [hx, 0.34, side * (z + 0.003)] }, 0);
      b.box(0.012, 0.085, 0.01, STEEL, { at: [hx, 0.34, side * (z + 0.004)] }, 0);
    }
  }
  // The workshop's sticky notes on the inner face (−z).
  const hash = tileHash(look.salt, 41);
  const count = 1 + (hash % 3);
  for (let k = 0; k < count; k++) {
    const hk = tileHash(look.salt + k * 7, 17);
    const x = cx + ((hk % 100) / 100 - 0.5) * (len - 0.14);
    const y = 0.2 + (((hk >> 8) % 100) / 100) * 0.2;
    note(
      b,
      x,
      y,
      -(z + 0.009),
      NOTES[(hk >> 4) % NOTES.length] ?? NOTES[0],
      (((hk >> 12) % 9) - 4) * 0.04,
    );
  }
  return b.build();
}

/** The upper section of a leaf, its bottom middle at the origin, along x, outer face +z. */
export function leafUpperModel(look: LeafLook): Model {
  const b = new ModelBuilder();
  const h = look.hinge;
  const outerEnd = -h * (LEAF / 2 - END_GAP - 0.006);
  const hingeEnd = h * (LEAF / 2 - 0.008);
  const len = Math.abs(hingeEnd - outerEnd);
  const cx = (hingeEnd + outerEnd) / 2;
  const z = UPPER_T / 2;
  b.box(len, UPPER_H, UPPER_T, WALNUT, { at: [cx, UPPER_H / 2, 0] }, 0.006);
  for (const side of [-1, 1]) fabricInset(b, cx, 0.27, len - 0.1, 0.34, z, side);
  // The cap: walnut end grain, its long edges steel on every third panel and darker grain on the rest.
  const capLen = len + 0.012;
  const edge = look.steelCap ? STEEL_EDGE : tint(CAP_WALNUT, -0.3);
  b.box(capLen, CAP_H, PANEL_T + 0.004, CAP_WALNUT, { at: [cx, UPPER_H + CAP_H / 2, 0] }, 0.004);
  for (const side of [-1, 1])
    b.box(
      capLen,
      0.004,
      0.01,
      edge,
      {
        at: [cx, UPPER_H + CAP_H + 0.001, side * (PANEL_T / 2 - 0.004)],
      },
      0,
    );
  b.box(
    capLen - 0.03,
    0.002,
    0.014,
    tint(CAP_WALNUT, 0.05),
    { at: [cx, UPPER_H + CAP_H + 0.0005, 0] },
    0,
  );
  b.box(
    0.008,
    UPPER_H,
    UPPER_T + 0.002,
    STEEL_EDGE,
    { at: [outerEnd + h * 0.004, UPPER_H / 2, 0] },
    0,
  );
  if (h === 1)
    b.cylinder(
      PANEL_T / 2 - 0.006,
      PANEL_T / 2 - 0.006,
      UPPER_H + CAP_H - 0.002,
      STEEL_DARK,
      {
        at: [LEAF / 2, (UPPER_H + CAP_H - 0.002) / 2, 0],
      },
      16,
    );
  // A small violet YOTTA mark on some outer faces; notes higher up inside.
  const hash = tileHash(look.salt, 53);
  if (hash % 3 === 0) {
    b.torus(0.022, 0.007, YOTTA_VIOLET, { at: [cx, 0.47, z + 0.004] });
  }
  const count = hash % 4 === 0 ? 0 : 1 + ((hash >> 3) % 2);
  for (let k = 0; k < count; k++) {
    const hk = tileHash(look.salt + k * 11, 29);
    const x = cx + ((hk % 100) / 100 - 0.5) * (len - 0.14);
    const y = 0.16 + (((hk >> 8) % 100) / 100) * 0.22;
    note(
      b,
      x,
      y,
      -(z + 0.009),
      NOTES[(hk >> 4) % NOTES.length] ?? NOTES[0],
      (((hk >> 12) % 9) - 4) * 0.04,
    );
  }
  return b.build();
}

/** The front run's glass section's full height: from the lower section's top to the wall's. */
export const GLASS_H = WALL_HEIGHT - LOW_TOP;

/**
 * The frosted glass upper section of a leaf where the wall is cut down for
 * the camera (the front run), its bottom middle at the origin, along x,
 * `GLASS_H` tall (`foldingWalls.ts` scales it down as the walnut upper
 * rises): a frameless pane on a steel shoe, the frosted manifestation band
 * with its violet dots, a slim steel top rail. It reads full height and
 * hides neither the table nor the room's label.
 */
export function leafGlassModel(look: LeafLook): Model {
  const b = new ModelBuilder();
  const h = look.hinge;
  const outerEnd = -h * (LEAF / 2 - END_GAP);
  const hingeEnd = h * (LEAF / 2 - 0.002);
  const len = Math.abs(hingeEnd - outerEnd);
  const cx = (hingeEnd + outerEnd) / 2;
  b.box(len, 0.018, 0.04, STEEL_EDGE, { at: [cx, 0.009, 0] }, 0.003);
  b.pane(len - 0.004, GLASS_H - 0.04, 0.012, FROST_GLASS, { at: [cx, GLASS_H / 2, 0] });
  // The manifestation band, both faces, the dots on a world pitch like the walnut's.
  const band = 0.3;
  b.box(len - 0.004, 0.04, 0.003, FROST, { at: [cx, band, 0.0075] }, 0);
  b.box(len - 0.004, 0.006, 0.003, FROST, { at: [cx, band - 0.04, 0.0075] }, 0);
  for (let k = -1; k <= 1; k++)
    b.box(0.032, 0.032, 0.004, DOT_VIOLET, { at: [k * DOT_PITCH, band, 0.0095] }, 0);
  b.box(len, 0.022, 0.032, STEEL, { at: [cx, GLASS_H - 0.011, 0] }, 0.003);
  b.box(len, 0.004, 0.034, STEEL_EDGE, { at: [cx, GLASS_H - 0.024, 0] }, 0);
  // A slim steel post at the outer end, so the joints read as framed glass.
  b.box(0.012, GLASS_H, 0.022, STEEL_EDGE, { at: [outerEnd + h * 0.006, GLASS_H / 2, 0] }, 0);
  return b.build();
}

// ---- The vinyl ----

/** A 3×5 pixel font for the names the boardroom carries. */
const GLYPHS: Readonly<Record<string, string>> = {
  A: '010101111101101',
  B: '110101110101110',
  D: '110101101101110',
  H: '101101111101101',
  I: '111010010010111',
  L: '100100100100111',
  M: '101111111101101',
  N: '110101101101101',
  O: '111101101101111',
  R: '110101110110101',
  T: '111010010010010',
  Y: '101101010010010',
  '1': '010110010010111',
  '2': '110001010100111',
  '3': '110001010001110',
  '4': '101101111001001',
  '5': '111100110001110',
  '6': '011100111101111',
};

/** The pixels of `text` (3×5 glyphs, a column between), `px` each, its middle column `pivot` at x = 0, centred on y. */
export function pixels(text: string, px: number, pivot?: number): [number, number][] {
  const cols = text.length * 4 - 1;
  const mid = pivot ?? (cols - 1) / 2;
  const out: [number, number][] = [];
  Array.from({ length: text.length }, (_, k) => text.charAt(k)).forEach((ch, k) => {
    const glyph = GLYPHS[ch];
    if (!glyph) return;
    for (let r = 0; r < 5; r++)
      for (let c = 0; c < 3; c++)
        if (glyph[r * 3 + c] === '1') out.push([(k * 4 + c - mid) * px, (2 - r) * px]);
  });
  return out;
}

/**
 * "BOARDROOM" across the run's cut-down front, on the leaves' outer faces:
 * the word parts at the middle seam, "BOARD" on one train, "ROOM" on the
 * other. Returns each leaf's pixels (leaf `2k` and `2k + 1` are panel k's),
 * in the leaf's own x.
 */
export function vinylByLeaf(run: WallRun): [number, number][][] {
  const leaves: [number, number][][] = Array.from({ length: run.length * 2 }, () => []);
  const low = run.tall.flatMap((tall, i) => (tall ? [] : [i]));
  if (low.length < 2) return leaves;
  // The seam where the two trains meet, if it's on the cut-down front; else the front's middle.
  const first = low[0] as number;
  const last = low[low.length - 1] as number;
  const seam = run.split > first && run.split <= last ? run.split : (first + last + 1) / 2;
  // "BOARD" ends left of the seam: the gap column after D (column 19) sits on it.
  const word = 'BOARDROOM';
  for (const [x, y] of pixels(word, VINYL_PX, 19)) {
    const s = seam + x;
    const leaf = Math.floor(s * 2);
    const local = s - (leaf + 0.5) / 2;
    const list = leaves[leaf];
    // Drop pixels that would sit on a joint.
    if (!list || Math.abs(local) > LEAF / 2 - END_GAP) continue;
    // A leaf's x runs along the track for the outer face's reading direction.
    list.push([local, VINYL_Y + y]);
  }
  return leaves;
}

// ---- The pockets ----

/** The closet's height: a shade over the walls, so it reads as joinery. */
export const CLOSET_H = WALL_HEIGHT + 0.05;
const DOOR_H = 1.04;
/** Each door leaf's width; its hinge sits at ±`DOOR_HINGE` on the closet's front. */
const DOOR_W = 0.445;
export const DOOR_HINGE = 0.455;
const DOOR_T = 0.026;
/** The head box over the closet's opening: how far it stands proud and how far it rises over the closet. */
const HEAD_D = 0.11;
const HEAD_UP = 0.05;
/** The cornice round the closet's open top. */
const RIM_H = 0.05;
/** How far the closet's roof reaches from the back. */
const ROOF_D = 0.42;

/**
 * A walnut storage closet on a pocket tile, the track entering through its
 * front (+z): sides, back, a header with a brass plaque, a steel rim on
 * top (no roof: from above you see the stacked panels' caps), the
 * stacking-order card inside. `outer` is the side away from the room (±1
 * on x), where the beacon stands.
 */
export function closetModel(outer: number): Model {
  const b = new ModelBuilder();
  // Inside its own tile, clear of the stubs beside it.
  const w = 0.99;
  const half = w / 2;
  for (const side of [-1, 1]) {
    b.box(0.045, CLOSET_H, w, WALNUT, { at: [side * (half - 0.0225), CLOSET_H / 2, 0] }, 0.01);
    // The inside lining, darker; a steel strip down the front edge.
    b.box(
      0.004,
      CLOSET_H - 0.02,
      w - 0.06,
      CLOSET_INSIDE,
      {
        at: [side * (half - 0.047), CLOSET_H / 2, -0.01],
      },
      0,
    );
    // Felt-lined bays: the panels slide in against it.
    b.box(
      0.004,
      0.62,
      w - 0.16,
      tint(FABRIC, -0.35),
      { at: [side * (half - 0.05), 0.5, -0.03] },
      0,
    );
    b.box(
      0.014,
      CLOSET_H - 0.14,
      0.05,
      STEEL,
      { at: [side * (half - 0.02), (CLOSET_H - 0.14) / 2, half - 0.01] },
      0,
    );
    // Walnut grain on the visible side faces.
    for (const y of [0.32, 0.71, 0.98])
      b.box(0.003, 0.006, w - 0.08, WALNUT_LIGHT, { at: [side * (half + 0.001), y, 0] }, 0);
    // A plinth.
    b.box(0.05, 0.06, w, STEEL_DARK, { at: [side * (half - 0.022), 0.03, 0] }, 0.004);
  }
  b.box(w, CLOSET_H, 0.045, WALNUT, { at: [0, CLOSET_H / 2, -half + 0.0225] }, 0.01);
  b.box(w - 0.1, CLOSET_H - 0.2, 0.004, CLOSET_INSIDE, { at: [0, CLOSET_H / 2, -half + 0.047] }, 0);
  // The head box over the opening: solid walnut, proud of the front, its
  // brass "BOARDROOM" plate and a violet dot either side, a shadow line under it.
  const headH = CLOSET_H - DOOR_H + HEAD_UP;
  const headY = DOOR_H + headH / 2;
  const headZ = half - HEAD_D / 2 + 0.03;
  b.box(w + 0.02, headH, HEAD_D, WALNUT, { at: [0, headY, headZ] }, 0.01);
  b.box(
    w + 0.024,
    0.012,
    HEAD_D + 0.004,
    CAP_WALNUT,
    { at: [0, CLOSET_H + HEAD_UP - 0.006, headZ] },
    0.004,
  );
  b.box(w, 0.006, 0.004, INK, { at: [0, DOOR_H + 0.003, headZ + HEAD_D / 2 + 0.001] }, 0);
  b.box(
    w - 0.02,
    0.005,
    0.004,
    WALNUT_LIGHT,
    { at: [0, headY + headH / 2 - 0.03, headZ + HEAD_D / 2 + 0.001] },
    0,
  );
  const plateZ = headZ + HEAD_D / 2;
  const plateY = headY - 0.012;
  b.box(0.42, 0.075, 0.006, BRASS, { at: [0, plateY, plateZ + 0.002] }, 0.002);
  b.box(0.4, 0.06, 0.004, tint(BRASS, 0.12), { at: [0, plateY, plateZ + 0.004] }, 0);
  for (const [x, y] of pixels('BOARDROOM', 0.0105))
    b.box(0.0105, 0.0105, 0.004, tint(BRASS, -0.62), { at: [x, plateY + y, plateZ + 0.006] }, 0);
  for (const x of [-0.37, 0.37])
    b.box(0.032, 0.032, 0.005, DOT_VIOLET, { at: [x, plateY, plateZ + 0.002] }, 0);
  // The cornice round the open top: chunky walnut, a fine steel line on its inner edge.
  for (const side of [-1, 1]) {
    b.box(
      0.07,
      RIM_H,
      w,
      CAP_WALNUT,
      { at: [side * (half - 0.035), CLOSET_H + RIM_H / 2 - 0.02, 0] },
      0.006,
    );
    b.box(
      0.006,
      0.004,
      w - 0.14,
      tint(STEEL, -0.2),
      { at: [side * (half - 0.072), CLOSET_H + RIM_H - 0.02, 0] },
      0,
    );
  }
  b.box(w, RIM_H, 0.07, CAP_WALNUT, { at: [0, CLOSET_H + RIM_H / 2 - 0.02, -half + 0.035] }, 0.006);
  // A walnut roof over the back of the closet: from the front you still see down onto the stack.
  b.box(
    w - 0.02,
    0.03,
    ROOF_D,
    WALNUT,
    { at: [0, CLOSET_H + RIM_H - 0.035, -half + ROOF_D / 2] },
    0.006,
  );
  b.box(
    w - 0.06,
    0.004,
    0.012,
    tint(CAP_WALNUT, -0.3),
    { at: [0, CLOSET_H + RIM_H - 0.018, -half + ROOF_D] },
    0,
  );
  for (const x of [-0.25, 0.1, 0.32])
    b.box(
      0.008,
      0.002,
      ROOF_D - 0.1,
      WALNUT_LIGHT,
      { at: [x, CLOSET_H + RIM_H - 0.019, -half + ROOF_D / 2] },
      0,
    );
  b.box(
    w - 0.14,
    0.004,
    0.006,
    tint(STEEL, -0.2),
    { at: [0, CLOSET_H + RIM_H - 0.02, -half + 0.072] },
    0,
  );
  // Inside on the back: the stacking-order card (panels 1 to 6) and a coat hook for the pole.
  const card = -half + 0.05;
  b.box(0.3, 0.2, 0.004, CARD, { at: [0, 0.86, card] }, 0);
  b.box(0.28, 0.022, 0.005, YOTTA_VIOLET, { at: [0, 0.94, card + 0.001] }, 0);
  for (let k = 0; k < 6; k++) {
    b.box(
      0.03,
      0.08 + (k % 2) * 0.012,
      0.005,
      tint(WALNUT, 0.1),
      { at: [-0.11 + k * 0.044, 0.85, card + 0.001] },
      0,
    );
  }
  for (const [x, y] of pixels('123456', 0.0075))
    b.box(0.0075, 0.0075, 0.005, INK, { at: [x * 1.45, 0.79 + y, card + 0.002] }, 0);
  // The panel pole (to push panels home by hand), leaning in the back corner.
  b.cylinder(
    0.01,
    0.01,
    0.95,
    STEEL,
    { at: [outer * 0.4, 0.5, -half + 0.08], rot: [0.05, 0, -outer * 0.06] },
    8,
  );
  b.sphere(0.018, RUBBER, { at: [outer * 0.43, 0.975, -half + 0.08] });
  // The beacon's base on the header, on the outer side.
  b.cylinder(
    0.055,
    0.06,
    0.03,
    STEEL_DARK,
    { at: [outer * 0.37, CLOSET_H + 0.029, half - 0.06] },
    16,
  );
  return b.build();
}

/** Where the beacon's lens sits on a closet (local), for `foldingWalls.ts`. */
export function beaconAt(outer: number): [number, number, number] {
  return [outer * 0.37, CLOSET_H + 0.044, 0.51 - 0.06];
}

/** The beacon's lens: dark amber when it's off; the lit one is drawn over it. */
export function beaconLensModel(lit: boolean): Model {
  const b = new ModelBuilder();
  if (lit) {
    b.add(
      new THREE.CylinderGeometry(0.044, 0.048, 0.075, 16),
      0xc86a14,
      { at: [0, 0.0375, 0] },
      'glow',
    );
    b.add(
      new THREE.SphereGeometry(0.044, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2),
      0xc86a14,
      { at: [0, 0.075, 0] },
      'glow',
    );
  } else {
    b.cylinder(0.044, 0.048, 0.075, LENS_OFF, { at: [0, 0.0375, 0] }, 16);
    b.sphere(0.044, LENS_OFF, { at: [0, 0.075, 0] }, [1, 0.6, 1]);
    b.box(
      0.01,
      0.05,
      0.004,
      tint(LENS_OFF, 0.45),
      { at: [-0.02, 0.045, 0.045], rot: [0, -0.4, 0] },
      0,
    );
  }
  return b.build();
}

/** The beacon's turning reflector: a bright band on one side of the lens and a short sweep of light. */
export function beaconSweepModel(): Model {
  const b = new ModelBuilder();
  b.add(
    new THREE.CylinderGeometry(0.0455, 0.0495, 0.06, 8, 1, true, -0.5, 1),
    0xfff0c8,
    { at: [0, 0.04, 0] },
    'glow',
  );
  return b.build();
}

/** A sweep of beacon light: a flat fan out from the lens, faded along it (vertex colors, drawn additive). */
export function beamGeometry(): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  const reach = 0.55;
  const spread = 0.28;
  const pos = [0, 0, 0, reach, 0, -spread, reach, 0, spread];
  const col = [1, 0.62, 0.22, 0, 0, 0, 0, 0, 0];
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return g;
}

/**
 * A door leaf, hinged at the origin and reaching `dir` (±1) along x when
 * shut; its front +z. Walnut with a steel edge, a pull at the free edge and
 * the violet dot band at the walls' height.
 */
export function doorLeafModel(dir: number): Model {
  const b = new ModelBuilder();
  const cx = (dir * DOOR_W) / 2;
  b.box(DOOR_W - 0.006, DOOR_H - 0.02, DOOR_T, WALNUT, { at: [cx, DOOR_H / 2, DOOR_T / 2] }, 0.006);
  const fz = DOOR_T + 0.0015;
  // Book-matched veneer: a pale streak and two quiet grain lines, and a reveal framing a fabric panel.
  b.box(0.006, DOOR_H - 0.12, 0.003, WALNUT_LIGHT, { at: [cx - dir * 0.1, DOOR_H / 2, fz] }, 0);
  b.box(
    0.004,
    DOOR_H - 0.2,
    0.003,
    WALNUT_DEEP,
    { at: [cx + dir * 0.08, DOOR_H / 2 + 0.03, fz] },
    0,
  );
  b.box(DOOR_W - 0.1, 0.3, 0.003, INK, { at: [cx, 0.26, fz] }, 0);
  b.box(DOOR_W - 0.11, 0.286, 0.004, FABRIC, { at: [cx, 0.26, fz + 0.0005] }, 0);
  for (let k = -1; k <= 1; k++)
    b.box(0.03, 0.03, 0.005, DOT_VIOLET, { at: [cx + k * 0.12, DOT_Y, fz + 0.001] }, 0);
  // The free edge: steel, with a long bar pull.
  b.box(
    0.01,
    DOOR_H - 0.02,
    DOOR_T + 0.004,
    STEEL,
    { at: [dir * (DOOR_W - 0.01), DOOR_H / 2, DOOR_T / 2] },
    0,
  );
  b.box(0.014, 0.26, 0.014, STEEL, { at: [dir * (DOOR_W - 0.05), 0.62, fz + 0.016] }, 0);
  for (const y of [0.51, 0.73])
    b.box(0.01, 0.01, 0.018, STEEL_DARK, { at: [dir * (DOOR_W - 0.05), y, fz + 0.008] }, 0);
  // The back face, seen when the doors stand open: book-matched veneer, a bead-framed panel.
  const bz = -0.0015;
  b.box(DOOR_W - 0.1, DOOR_H - 0.2, 0.003, tint(WALNUT, 0.06), { at: [cx, DOOR_H / 2, bz] }, 0);
  b.box(
    0.005,
    DOOR_H - 0.26,
    0.004,
    WALNUT_LIGHT,
    { at: [cx + dir * 0.06, DOOR_H / 2, bz - 0.001] },
    0,
  );
  b.box(
    0.004,
    DOOR_H - 0.3,
    0.004,
    WALNUT_DEEP,
    { at: [cx - dir * 0.09, DOOR_H / 2, bz - 0.001] },
    0,
  );
  for (const y of [0.1, DOOR_H - 0.1])
    b.box(DOOR_W - 0.08, 0.016, 0.006, BEAD, { at: [cx, y, bz - 0.001] }, 0);
  // Two hinge knuckles.
  for (const y of [0.18, 0.86]) b.cylinder(0.012, 0.012, 0.08, STEEL, { at: [0, y, 0] }, 8);
  return b.build();
}

// ---- The floor track ----

/** The track's segments between `from` and `to` along `run` (split at its corners). */
function pieces(run: WallRun, from: number, to: number): { a: P2; b: P2 }[] {
  const cuts = [from, ...run.at.filter((s) => s > from && s < to), to];
  return cuts.slice(1).map((s, i) => ({
    a: pointAt(run, cuts[i] as number).p,
    b: pointAt(run, s).p,
  }));
}

/** A flat strip from `a` to `b` at height `y`, `w` wide, `off` to the side (along the left normal). */
function strip(
  bld: ModelBuilder,
  a: P2,
  b: P2,
  w: number,
  h: number,
  y: number,
  off: number,
  color: number,
  layer: 'body' | 'glow' = 'body',
  extend = 0,
): void {
  const len = Math.hypot(b.x - a.x, b.z - a.z);
  const t = { x: (b.x - a.x) / len, z: (b.z - a.z) / len };
  const n = { x: -t.z, z: t.x };
  const yaw = Math.atan2(-t.z, t.x);
  const at: [number, number, number] = [
    (a.x + b.x) / 2 + n.x * off,
    y + h / 2,
    (a.z + b.z) / 2 + n.z * off,
  ];
  const geometry = new THREE.BoxGeometry(len + extend, h, w);
  bld.add(geometry, color, { at, rot: [0, yaw, 0] }, layer);
}

/**
 * The brushed-steel track, pocket back to pocket back: a low brushed plinth
 * under every partition tile and into the pockets (so no carpet shows beside
 * a closed panel), and set in it the track's bed, its dark slot, rails and
 * unlit LED lines.
 */
export function trackModel(run: WallRun): Model {
  const b = new ModelBuilder();
  const y = PLINTH_H;
  for (const { a, b: e } of pieces(run, -0.97, run.length + 0.97)) {
    strip(b, a, e, PLINTH_W, PLINTH_H, 0, 0, TRACK_PLINTH, 'body', PLINTH_W);
    // A dark shadow line along each of its edges, and a fine bright arris on top.
    for (const side of [-1, 1]) {
      strip(b, a, e, 0.012, PLINTH_H + 0.001, 0, side * (PLINTH_W / 2 + 0.004), INK, 'body', 0);
      strip(b, a, e, 0.008, 0.001, y, side * (PLINTH_W / 2 - 0.006), tint(STEEL, -0.05));
    }
  }
  for (const { a, b: e } of pieces(run, -0.94, run.length + 0.94)) {
    strip(b, a, e, 0.075, 0.004, y, 0, TRACK_BED, 'body', 0.075);
    strip(b, a, e, 0.026, 0.005, y, 0, INK, 'body', 0.026);
    for (const side of [-1, 1]) {
      strip(b, a, e, 0.008, 0.0055, y, side * 0.022, tint(STEEL, -0.08), 'body', 0.008);
      strip(b, a, e, 0.01, 0.0045, y, side * 0.074, AMBER_DIM, 'body', 0.01);
    }
  }
  // Brass end stops at the pockets' backs and the brass socket where the two trains meet.
  for (const s of [-0.92, run.length + 0.92]) {
    const { p, t } = pointAt(run, s);
    b.box(
      0.09,
      0.05,
      0.09,
      BRASS,
      { at: [p.x, y + 0.025, p.z], rot: [0, Math.atan2(-t.z, t.x), 0] },
      0.012,
    );
  }
  const seam = pointAt(run, run.split);
  b.box(
    0.1,
    0.007,
    0.1,
    BRASS,
    {
      at: [seam.p.x, y + 0.0035, seam.p.z],
      rot: [0, Math.atan2(-seam.t.z, seam.t.x), 0],
    },
    0,
  );
  b.cylinder(0.018, 0.018, 0.009, INK, { at: [seam.p.x, y + 0.004, seam.p.z] }, 12);
  // A turning plate at each corner.
  const ends = [run.path[1], run.path[run.path.length - 2]];
  run.path.slice(1, -1).forEach((p) => {
    if (ends.some((e) => e && e.x === p.x && e.z === p.z)) return;
    b.box(0.2, 0.005, 0.2, tint(STEEL, -0.18), { at: [p.x, y + 0.0025, p.z] }, 0);
    b.cylinder(0.07, 0.07, 0.007, STEEL, { at: [p.x, y + 0.0035, p.z] }, 20);
  });
  return b.build();
}

/** The lit LED lines of track tile `i` (one tile of track), drawn glowing amber. */
export function trackLightModel(run: WallRun, i: number): Model {
  const b = new ModelBuilder();
  for (const { a, b: e } of pieces(run, i, i + 1))
    for (const side of [-1, 1])
      strip(b, a, e, 0.016, 0.006, PLINTH_H + 0.0005, side * 0.074, AMBER, 'glow', 0.016);
  return b.build();
}

/**
 * The head rail over a whole run (drawn only while every panel stands in
 * its place): over the full-height tiles a walnut cap wider than a panel,
 * with a steel lip under each edge and a fine grain line on top, so a closed
 * run's top reads as one wall cap, not a row of panel tops; over the
 * cut-down front a slim steel rail on the glass, so the joints read as one
 * glazed screen.
 */
export function headRailModel(run: WallRun): Model {
  const b = new ModelBuilder();
  const top = WALL_HEIGHT + PLINTH_H;
  // Each stretch of tiles of one height, as track pieces (split at the corners).
  let k = 0;
  while (k < run.length) {
    const tall = run.tall[k] ?? true;
    let end = k;
    while (end < run.length && (run.tall[end] ?? true) === tall) end++;
    // A tall stretch runs on over the cut-down ones' ends, so the corner reads mitred.
    for (const { a, b: e } of pieces(run, k, end)) {
      if (tall) {
        strip(b, a, e, RAIL_W, RAIL_H, top - 0.006, 0, CAP_WALNUT, 'body', RAIL_W);
        for (const side of [-1, 1])
          strip(
            b,
            a,
            e,
            0.01,
            0.01,
            top - 0.014,
            side * (RAIL_W / 2 - 0.004),
            STEEL_EDGE,
            'body',
            RAIL_W - 0.008,
          );
        strip(b, a, e, 0.016, 0.002, top + RAIL_H - 0.006, 0.05, tint(CAP_WALNUT, 0.06), 'body', 0);
        strip(
          b,
          a,
          e,
          0.012,
          0.002,
          top + RAIL_H - 0.006,
          -0.06,
          tint(CAP_WALNUT, -0.12),
          'body',
          0,
        );
      } else {
        strip(b, a, e, 0.036, 0.024, top - 0.024, 0, STEEL, 'body', 0);
      }
    }
    k = end;
  }
  return b.build();
}

/** A square of light on a warned tile (vertex colors, drawn additive), flat at the origin. */
export function washGeometry(): THREE.BufferGeometry {
  const n = 7;
  const g = new THREE.PlaneGeometry(1, 1, n, n).rotateX(-Math.PI / 2);
  const pos = g.getAttribute('position');
  const col: number[] = [];
  for (let k = 0; k < pos.count; k++) {
    // Half strength at the tile's edge, so warned neighbours add up to one even band of light.
    const edge = 0.5 - Math.max(Math.abs(pos.getX(k)), Math.abs(pos.getZ(k)));
    const v = 0.5 + 0.5 * Math.min(1, edge / 0.2);
    col.push(v, v, v);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return g;
}

// ---- The boardroom table ----

/** Castor wheels' radius: they turn with the distance rolled. */
export const WHEEL_R = 0.034;
/** The castors under a half, local to it (seam toward +x). */
export const CASTORS: readonly [number, number][] = [
  [-0.3, -0.27],
  [-0.3, 0.27],
  [0.3, -0.27],
  [0.3, 0.27],
];

/** A castor wheel: dark rubber with a steel hub and one bright spoke, so you see it turn; its axle along z. */
export function wheelModel(): Model {
  const b = new ModelBuilder();
  b.cylinder(WHEEL_R, WHEEL_R, 0.022, RUBBER, { rot: [Math.PI / 2, 0, 0] }, 14);
  b.cylinder(0.016, 0.016, 0.026, STEEL, { rot: [Math.PI / 2, 0, 0] }, 10);
  b.box(0.008, WHEEL_R * 1.7, 0.027, tint(STEEL, 0.15), {}, 0);
  return b.build();
}

/**
 * Half of the long walnut boardroom table, its seam toward +x (the halves
 * meet there; turn it for another way), the top at the stations' height
 * and darker than any station top: a rounded far end, a brass inlay, a
 * leather writing pad, a power grommet with its cable, a steel frame on
 * castors (the wheels are drawn apart, to turn).
 */
export function tableHalfModel(): Model {
  const b = new ModelBuilder();
  const top = STATION_HEIGHT;
  const r = 0.38;
  const endX = -0.1;
  // The top: a slab to the seam and a round far end, a dark edge under it.
  b.box(
    0.49 - endX + 0.005,
    0.05,
    2 * r,
    TABLE_TOP,
    { at: [(0.49 + endX) / 2, top - 0.025, 0] },
    0.01,
  );
  b.cylinder(r, r, 0.05, TABLE_TOP, { at: [endX, top - 0.025, 0] }, 32);
  b.box(
    0.49 - endX,
    0.014,
    2 * r - 0.02,
    TABLE_EDGE,
    { at: [(0.49 + endX) / 2, top - 0.057, 0] },
    0,
  );
  b.cylinder(r - 0.01, r - 0.01, 0.014, TABLE_EDGE, { at: [endX, top - 0.057, 0] }, 32);
  // The seam's end: a steel edge, so the split shows when the halves are together.
  b.box(0.008, 0.052, 2 * r, STEEL, { at: [0.492, top - 0.026, 0] }, 0);
  // Brass inlay along both long edges, a leather pad on top.
  for (const z of [-0.31, 0.31]) b.box(0.56, 0.002, 0.008, BRASS, { at: [0.2, top + 0.001, z] }, 0);
  b.box(0.36, 0.003, 0.3, LEATHER, { at: [0.12, top + 0.0015, 0] }, 0);
  // The power grommet by the seam and its cable down to a floor box.
  b.cylinder(0.04, 0.04, 0.004, STEEL, { at: [0.4, top + 0.002, 0.16] }, 16);
  b.cylinder(0.03, 0.03, 0.005, INK, { at: [0.4, top + 0.0025, 0.16] }, 16);
  b.box(0.012, 0.006, 0.008, AMBER, { at: [0.4, top + 0.005, 0.16] }, 0);
  b.cylinder(
    0.008,
    0.008,
    top - 0.1,
    RUBBER,
    { at: [0.4, top / 2 - 0.02, 0.16], rot: [0.12, 0, 0] },
    6,
  );
  // The steel frame: a spine, two posts, feet out to the castors.
  b.box(0.72, 0.04, 0.07, STEEL_DARK, { at: [0, top - 0.09, 0] }, 0.008);
  for (const x of [-0.3, 0.3]) {
    b.cylinder(0.028, 0.028, top - 0.16, STEEL_EDGE, { at: [x, (top - 0.08) / 2 + 0.04, 0] }, 12);
    b.box(0.06, 0.03, 0.62, STEEL_EDGE, { at: [x, 0.085, 0] }, 0.008);
    for (const z of [-0.27, 0.27]) {
      // A castor's fork; the wheel turns in it.
      b.box(0.05, 0.03, 0.036, STEEL_DARK, { at: [x, 0.06, z] }, 0.004);
    }
  }
  return b.build();
}

/** What lies on a half while the table is a boardroom table: name cards (`names`), a glass, a pad and pen. */
export function tableBoardModel(names: readonly string[], salt: number): Model {
  const b = new ModelBuilder();
  const top = STATION_HEIGHT;
  names.forEach((name, k) => {
    const x = -0.28 + k * 0.42;
    const z = -0.26;
    // A tent card, its name on the face toward the camera.
    b.box(0.17, 0.06, 0.006, CARD, { at: [x, top + 0.028, z + 0.012], rot: [-0.38, 0, 0] }, 0);
    b.box(0.17, 0.06, 0.006, CARD, { at: [x, top + 0.028, z - 0.012], rot: [0.38, 0, 0] }, 0);
    const color = name === 'YOTTA' ? YOTTA_VIOLET : name === 'MOM' ? 0xc0506e : INK;
    const px = Math.min(0.0085, 0.15 / (name.length * 4 - 1));
    for (const [px0, py] of pixels(name, px))
      b.box(
        px,
        px,
        0.003,
        color,
        {
          at: [x + px0, top + 0.03 + py * Math.cos(0.38), z + 0.0235 - py * Math.sin(0.38)],
          rot: [-0.38, 0, 0],
        },
        0,
      );
  });
  const h = tileHash(salt, 7);
  // A water glass and a notepad with a pen, off the middle where tickets land.
  b.pane(0.05, 0.09, 0.05, 0xcfe3ee, { at: [-0.34, top + 0.045, 0.22] });
  b.box(
    0.12,
    0.006,
    0.16,
    CARD,
    { at: [0.34, top + 0.003, 0.2], rot: [0, (h % 5) * 0.06 - 0.12, 0] },
    0,
  );
  b.cylinder(
    0.006,
    0.006,
    0.13,
    INK,
    { at: [0.36, top + 0.01, 0.2], rot: [0, 0.4, Math.PI / 2] },
    6,
  );
  return b.build();
}

/** What lies on a half while it's a workshop table: pads of sticky notes, markers, notes stuck down. */
export function tableWorkshopModel(salt: number): Model {
  const b = new ModelBuilder();
  const top = STATION_HEIGHT;
  for (let k = 0; k < 3; k++) {
    const color = NOTES[(salt + k) % NOTES.length] ?? NOTES[0];
    b.box(
      0.08,
      0.018,
      0.08,
      color,
      { at: [-0.32 + k * 0.03, top + 0.009 + k * 0.018, -0.24 + k * 0.012], rot: [0, k * 0.2, 0] },
      0,
    );
  }
  const markers = [0x2b6cd8, 0xd8402b, 0x2a2a2a];
  markers.forEach((c, k) => {
    b.cylinder(
      0.012,
      0.012,
      0.13,
      c,
      {
        at: [0.28 + k * 0.03, top + 0.012, -0.22 + k * 0.03],
        rot: [Math.PI / 2, 0.3 + k * 0.4, 0],
      },
      8,
    );
  });
  for (let k = 0; k < 6; k++) {
    const hk = tileHash(salt + k, 91);
    const x = ((hk % 100) / 100 - 0.5) * 0.7;
    const z = k % 2 === 0 ? 0.26 : -0.3;
    if (Math.abs(x) < 0.18 && z > 0) continue;
    b.box(
      0.07,
      0.003,
      0.07,
      NOTES[(hk >> 5) % NOTES.length] ?? NOTES[0],
      {
        at: [x, top + 0.0015, z],
        rot: [0, ((hk >> 9) % 7) * 0.12, 0],
      },
      0,
    );
  }
  return b.build();
}
