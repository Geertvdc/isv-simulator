/**
 * The consultants' mobile kit for 4-3 The Reorg, built in code with the kit
 * (`../kit.ts`): half-tile partition leaves (a pale powder-coated frame,
 * frosted infill with a consultancy-teal stripe at eye height, castor feet,
 * clips), their paper signs, the rolling bench desks, the meeting door, and
 * the badge speed gates and staff door on the badge line. Cheap, bright and
 * modular next to 4-2's walnut, but matte and no whiter than mid grey-white
 * so the stations stay the brightest things on screen. Every model stands at
 * its origin as `partitions.ts` and `gates.ts` place it.
 */

import * as THREE from 'three';
import { tileHash } from '../../mapShape';
import { type Model, ModelBuilder, tint } from '../kit';
import { STATION_HEIGHT, WALL_HEIGHT } from '../layout';

// ---- Colors ----

/** The powder-coated frame: a matte grey-white, under every station top's value. */
export const FRAME = 0xb9bec3;
const FRAME_SHADE = 0x9da3a9;
/** The frosted infill: cool grey with a hint of teal. */
const INFILL = 0x98a4a8;
const INFILL_LINE = 0x8d989c;
/** The consultancy's teal, a touch desaturated. */
export const TEAL = 0x3f8c88;
const TEAL_DARK = 0x2f6c69;
const FROST_GLASS = 0xd5dde0;
const RUBBER = 0x2a2c30;
const STEEL = 0xa8afb6;
const STEEL_DARK = 0x5f666d;
const INK = 0x22262c;
const PAPER = 0xe4e2dc;
/** Sticky notes, a touch quieter than the stations. */
const NOTES = [0xe6cc5c, 0xe19ab2, 0x8fbcd8, 0xa4cc8a] as const;
/** The desks' laminate: darker than every station top (the bin's grey included). */
const LAMINATE = 0x464a51;
const LAMINATE_EDGE = 0x5b6069;
const SCREEN = 0x3c5f78;
const TAPE = 0xcdb04e;

// ---- Sizes ----

/** A leaf: half a tile along its line, this thick, standing this high off the floor on its feet. */
export const LEAF_T = 0.11;
const LEAF_LEN = 0.5;
const GAP_UNDER = 0.075;
/** The lower section's top: a cut-down leaf stops here, frosted glass above it. */
export const LOW_TOP = 0.6;
const POST_W = 0.035;
const RAIL_H = 0.035;
const STRIPE_Y = 0.8;

// ---- Pixel lettering ----

/** A 3×5 pixel font for the signs and vinyl. */
const GLYPHS: Readonly<Record<string, string>> = {
  A: '010101111101101',
  B: '110101110101110',
  C: '011100100100011',
  D: '110101101101110',
  E: '111100110100111',
  F: '111100110100100',
  G: '011100101101011',
  H: '101101111101101',
  I: '111010010010111',
  K: '101101110101101',
  L: '100100100100111',
  M: '101111111101101',
  N: '110101101101101',
  O: '111101101101111',
  P: '110101110100100',
  Q: '010101101110011',
  R: '110101110110101',
  S: '011100010001110',
  T: '111010010010010',
  U: '101101101101111',
  V: '101101101101010',
  W: '101101111111101',
  ':': '000010000010000',
  ' ': '000000000000000',
  a: '000011101101011',
  o: '000111101101111',
  t: '010111010010011',
  y: '000101101011110',
  '.': '000000000000010',
};

/** The pixels of `text`, `px` each, centred on x = 0 and y = 0. */
export function pixelText(text: string, px: number): [number, number][] {
  const cols = text.length * 4 - 1;
  const out: [number, number][] = [];
  Array.from({ length: text.length }, (_, k) => text.charAt(k)).forEach((ch, k) => {
    const glyph = GLYPHS[ch];
    if (!glyph) return;
    for (let r = 0; r < 5; r++)
      for (let c = 0; c < 3; c++)
        if (glyph[r * 3 + c] === '1') out.push([(k * 4 + c - (cols - 1) / 2) * px, (2 - r) * px]);
  });
  return out;
}

/** Lettering on a face at depth `z` facing +z (or −z with `face` −1). */
function letter(
  b: ModelBuilder,
  text: string,
  px: number,
  x: number,
  y: number,
  z: number,
  color: number,
  face = 1,
): void {
  for (const [dx, dy] of pixelText(text, px))
    b.box(px, px, 0.003, color, { at: [x + face * dx, y + dy, z] }, 0);
}

function note(b: ModelBuilder, x: number, y: number, z: number, color: number, turn: number): void {
  b.box(0.07, 0.07, 0.004, color, { at: [x, y, z], rot: [0, 0, turn] }, 0);
}

// ---- Partition leaves ----

/** What a leaf carries. */
export interface LeafLook {
  /** Which end is the tile's edge (+1 the +x end): its frame post, clip and foot go there. */
  outer: 1 | -1;
  /** A castor foot at the outer end (thinned along runs). */
  foot: boolean;
  /** Variation (sticky notes). */
  salt: number;
}

/**
 * A leaf's lower section, its middle bottom at the origin, along x, faces
 * ±z: posts and rails in the frame color, frosted infill, a gap underneath
 * with the castor foot showing.
 */
export function leafLowerModel(look: LeafLook): Model {
  const b = new ModelBuilder();
  const o = look.outer;
  const half = LEAF_LEN / 2;
  // The infill, then the frame round it.
  const inH = LOW_TOP - GAP_UNDER - RAIL_H;
  b.box(
    LEAF_LEN,
    inH,
    LEAF_T - 0.03,
    INFILL,
    {
      at: [0, GAP_UNDER + RAIL_H + inH / 2, 0],
    },
    0,
  );
  b.box(LEAF_LEN, RAIL_H, LEAF_T, FRAME, { at: [0, GAP_UNDER + RAIL_H / 2, 0] }, 0.008);
  // The outer post (the tile's edge) and a slimmer mullion at the inner end.
  b.box(
    POST_W,
    LOW_TOP - GAP_UNDER,
    LEAF_T + 0.004,
    FRAME,
    {
      at: [o * (half - POST_W / 2), GAP_UNDER + (LOW_TOP - GAP_UNDER) / 2, 0],
    },
    0.006,
  );
  for (const side of [-1, 1]) {
    const z = side * ((LEAF_T - 0.03) / 2 + 0.002);
    // A quiet panel line in the frosting.
    b.box(LEAF_LEN - 0.08, 0.004, 0.003, INFILL_LINE, { at: [0, 0.34, z] }, 0);
  }
  // The top of the lower section, seen where the wall is cut down.
  b.box(LEAF_LEN, 0.02, LEAF_T, FRAME, { at: [0, LOW_TOP - 0.01, 0] }, 0.006);
  // A clip joining it to the next panel.
  b.box(0.05, 0.05, LEAF_T + 0.02, STEEL_DARK, { at: [o * half, 0.42, 0] }, 0.008);
  if (look.foot) {
    // A splayed foot across the panel, a castor at each end.
    b.box(0.04, 0.03, 0.42, STEEL, { at: [o * (half - 0.04), 0.045, 0] }, 0.008);
    b.box(0.03, 0.05, 0.03, STEEL_DARK, { at: [o * (half - 0.04), GAP_UNDER - 0.01, 0] }, 0);
    for (const z of [-0.19, 0.19])
      b.cylinder(
        0.026,
        0.026,
        0.024,
        RUBBER,
        {
          at: [o * (half - 0.04), 0.027, z],
          rot: [0, 0, Math.PI / 2],
        },
        10,
      );
  } else {
    // A short glide under the post.
    b.box(0.04, GAP_UNDER, 0.05, STEEL_DARK, { at: [o * (half - 0.03), GAP_UNDER / 2, 0] }, 0);
  }
  // A few sticky notes, both faces.
  const hash = tileHash(look.salt, 61);
  const count = hash % 3 === 0 ? 0 : hash % 3;
  for (let k = 0; k < count; k++) {
    const hk = tileHash(look.salt + k * 7, 23);
    const side = hk % 2 === 0 ? 1 : -1;
    note(
      b,
      (((hk >> 4) % 100) / 100) * 0.3 - 0.15,
      0.22 + (((hk >> 8) % 100) / 100) * 0.22,
      side * ((LEAF_T - 0.03) / 2 + 0.004),
      NOTES[(hk >> 12) % NOTES.length] ?? NOTES[0],
      (((hk >> 16) % 9) - 4) * 0.05,
    );
  }
  return b.build();
}

/** The full-height upper section, its bottom middle at the origin (at `LOW_TOP`): frosted, the teal stripe, the top rail. */
export function leafUpperModel(look: LeafLook): Model {
  const b = new ModelBuilder();
  const o = look.outer;
  const half = LEAF_LEN / 2;
  const h = WALL_HEIGHT - LOW_TOP;
  b.box(LEAF_LEN, h - RAIL_H, LEAF_T - 0.03, INFILL, { at: [0, (h - RAIL_H) / 2, 0] }, 0);
  for (const side of [-1, 1]) {
    const z = side * ((LEAF_T - 0.03) / 2 + 0.002);
    b.box(LEAF_LEN, 0.08, 0.004, TEAL, { at: [0, STRIPE_Y - LOW_TOP, z] }, 0);
    b.box(LEAF_LEN - 0.01, 0.008, 0.004, TEAL_DARK, { at: [0, STRIPE_Y - LOW_TOP - 0.045, z] }, 0);
  }
  b.box(LEAF_LEN, RAIL_H, LEAF_T + 0.004, FRAME, { at: [0, h - RAIL_H / 2, 0] }, 0.008);
  b.box(POST_W, h, LEAF_T + 0.004, FRAME, { at: [o * (half - POST_W / 2), h / 2, 0] }, 0.006);
  b.box(0.05, 0.05, LEAF_T + 0.02, STEEL_DARK, { at: [o * half, h - 0.16, 0] }, 0.008);
  const hash = tileHash(look.salt, 71);
  if (hash % 4 === 1) {
    const side = hash % 8 < 4 ? 1 : -1;
    note(
      b,
      (((hash >> 5) % 100) / 100) * 0.24 - 0.12,
      0.38,
      side * ((LEAF_T - 0.03) / 2 + 0.004),
      NOTES[(hash >> 9) % NOTES.length] ?? NOTES[0],
      0.08,
    );
  }
  return b.build();
}

/** A cut-down leaf's frosted glass over the lower section (its bottom middle at `LOW_TOP`), with the teal band. */
export function leafGlassModel(look: LeafLook): Model {
  const b = new ModelBuilder();
  const o = look.outer;
  const half = LEAF_LEN / 2;
  const h = WALL_HEIGHT - LOW_TOP;
  b.pane(LEAF_LEN - 0.01, h - 0.03, 0.014, FROST_GLASS, { at: [0, (h - 0.03) / 2, 0] });
  for (const side of [-1, 1])
    b.box(LEAF_LEN - 0.01, 0.045, 0.003, TEAL, { at: [0, STRIPE_Y - LOW_TOP, side * 0.009] }, 0);
  b.box(LEAF_LEN, 0.028, 0.04, FRAME, { at: [0, h - 0.014, 0] }, 0.006);
  b.box(0.022, h, 0.03, FRAME, { at: [o * (half - 0.011), h / 2, 0] }, 0);
  return b.build();
}

/** A paper sign taped to a leaf's +z face, its middle at the origin: a teal header and the org name. */
export function signModel(text: string): Model {
  const b = new ModelBuilder();
  const lines = text.split(' ');
  const longest = Math.max(...lines.map((l) => l.length));
  const px = Math.min(0.016, 0.3 / (longest * 4 - 1));
  const h = 0.06 + lines.length * px * 7;
  b.box(0.36, h, 0.004, PAPER, { at: [0, 0, 0] }, 0);
  b.box(0.36, 0.022, 0.005, TEAL, { at: [0, h / 2 - 0.011, 0] }, 0);
  lines.forEach((line, k) => {
    const y = h / 2 - 0.04 - px * 3 - k * px * 7;
    letter(b, line, px, 0, y, 0.004, INK);
  });
  // The tape at the top corners.
  for (const x of [-0.16, 0.16])
    b.box(
      0.06,
      0.02,
      0.006,
      0xd6d4c8,
      { at: [x, h / 2, 0.001], rot: [0, 0, x > 0 ? -0.4 : 0.4] },
      0,
    );
  return b.build();
}

// ---- The rolling desks ----

/**
 * A rolling bench desk, its floor middle at the origin, the user at +z:
 * a dark laminate top at station height on a steel frame with castors, a
 * monitor on an arm at the back, a "HOT DESK" tag and a cable tail.
 */
export function deskModel(salt: number): Model {
  const b = new ModelBuilder();
  const top = STATION_HEIGHT;
  b.box(0.92, 0.04, 0.86, LAMINATE, { at: [0, top - 0.02, 0] }, 0.012);
  b.box(0.93, 0.012, 0.87, LAMINATE_EDGE, { at: [0, top - 0.045, 0] }, 0);
  // The steel frame: two end frames, a beam, castors.
  for (const x of [-0.38, 0.38]) {
    b.box(0.04, top - 0.1, 0.04, STEEL, { at: [x, (top - 0.05) / 2 + 0.03, -0.3] }, 0);
    b.box(0.04, top - 0.1, 0.04, STEEL, { at: [x, (top - 0.05) / 2 + 0.03, 0.3] }, 0);
    b.box(0.05, 0.04, 0.72, STEEL_DARK, { at: [x, 0.07, 0] }, 0.01);
    for (const z of [-0.32, 0.32])
      b.cylinder(0.032, 0.032, 0.03, RUBBER, { at: [x, 0.034, z], rot: [0, 0, Math.PI / 2] }, 10);
  }
  b.box(0.76, 0.05, 0.04, STEEL_DARK, { at: [0, top - 0.09, -0.3] }, 0);
  // The monitor on its arm at the back edge.
  const mx = ((tileHash(salt, 13) % 3) - 1) * 0.12;
  b.box(0.12, 0.012, 0.09, STEEL_DARK, { at: [mx, top + 0.006, -0.36] }, 0);
  b.box(0.025, 0.2, 0.025, STEEL_DARK, { at: [mx, top + 0.1, -0.37] }, 0);
  b.box(0.4, 0.25, 0.03, INK, { at: [mx, top + 0.3, -0.35], rot: [-0.08, 0, 0] }, 0.01);
  b.screen(0.36, 0.21, SCREEN, { at: [mx, top + 0.3, -0.333], rot: [-0.08, 0, 0] });
  // The HOT DESK tag hanging off the front edge.
  b.box(0.2, 0.07, 0.006, PAPER, { at: [0.22, top - 0.075, 0.437] }, 0);
  b.box(0.2, 0.012, 0.007, TEAL, { at: [0.22, top - 0.046, 0.437] }, 0);
  letter(b, 'HOT DESK', 0.0058, 0.22, top - 0.083, 0.441, INK);
  // A mug on some.
  if (tileHash(salt, 5) % 2 === 0)
    b.cylinder(0.035, 0.032, 0.08, 0xd8d3c8, { at: [-0.28, top + 0.04, 0.05] }, 12);
  // The cable tail off the back leg.
  b.box(0.018, 0.012, 0.3, RUBBER, { at: [0.38, 0.01, -0.5], rot: [0, 0.3, 0] }, 0);
  return b.build();
}

/** A yellow tape X on the floor where a desk will stop. */
export function tapeXModel(): Model {
  const b = new ModelBuilder();
  for (const r of [Math.PI / 4, -Math.PI / 4])
    b.box(0.6, 0.006, 0.07, TAPE, { at: [0, 0.003, 0], rot: [0, r, 0] }, 0);
  return b.build();
}

// ---- Meeting doors ----

/** The door's frame in the partition line, along x, its floor middle at the origin: posts, head rail with the room's name. */
export function doorFrameModel(name: string): Model {
  const b = new ModelBuilder();
  for (const x of [-0.47, 0.47])
    b.box(0.07, WALL_HEIGHT, LEAF_T + 0.04, TEAL_DARK, { at: [x, WALL_HEIGHT / 2, 0] }, 0.008);
  b.box(1.0, 0.13, LEAF_T + 0.04, TEAL_DARK, { at: [0, WALL_HEIGHT - 0.065, 0] }, 0.008);
  for (const side of [-1, 1]) {
    const z = side * ((LEAF_T + 0.04) / 2 + 0.002);
    b.box(0.86, 0.09, 0.003, TEAL, { at: [0, WALL_HEIGHT - 0.065, z] }, 0);
    const px = Math.min(0.012, 0.78 / (name.length * 4 - 1));
    letter(b, name, px, 0, WALL_HEIGHT - 0.065, z + side * 0.002, 0xe8ecee, side);
  }
  // The lamp's housing on top.
  b.box(0.38, 0.05, 0.16, STEEL_DARK, { at: [0, WALL_HEIGHT + 0.025, 0] }, 0.01);
  return b.build();
}

/** The sliding glass leaf, along x, its bottom middle at the origin. */
export function doorLeafModel(): Model {
  const b = new ModelBuilder();
  const h = WALL_HEIGHT - 0.14;
  b.pane(0.86, h, 0.02, FROST_GLASS, { at: [0, h / 2, 0] });
  b.box(0.88, 0.04, 0.04, FRAME, { at: [0, 0.02, 0] }, 0);
  b.box(0.88, 0.03, 0.04, FRAME, { at: [0, h - 0.015, 0] }, 0);
  for (const x of [-0.43, 0.43]) b.box(0.03, h, 0.04, FRAME, { at: [x, h / 2, 0] }, 0);
  for (const side of [-1, 1]) b.box(0.84, 0.05, 0.003, TEAL, { at: [0, 0.75, side * 0.012] }, 0);
  b.box(0.02, 0.3, 0.06, STEEL, { at: [0.36, 0.5, 0] }, 0);
  return b.build();
}

// ---- The badge line ----

const CAB_W = 0.17;
const CAB_L = 0.82;
const CAB_H = 0.5;
/** The cabinets' middles either side of the passage. */
export const CAB_X = 0.39;
/** The flaps' hinges, on the cabinets' inner faces. */
export const FLAP_X = CAB_X - CAB_W / 2;
/** Where the glyph displays sit on a cabinet's top, toward each end. */
export const GLYPH_Z = 0.24;
export const GLYPH_Y = CAB_H + 0.012;

/** One speed-gate cabinet, its floor middle at the origin, the passage along z: brushed steel, a dark top, a badge reader at each end. */
export function gateCabinetModel(side: 1 | -1): Model {
  const b = new ModelBuilder();
  b.box(CAB_W, CAB_H - 0.03, CAB_L, STEEL, { at: [0, (CAB_H - 0.03) / 2, 0] }, 0.02);
  b.box(CAB_W + 0.01, 0.03, CAB_L + 0.01, INK, { at: [0, CAB_H - 0.015, 0] }, 0.01);
  b.box(CAB_W + 0.012, 0.05, CAB_L + 0.012, STEEL_DARK, { at: [0, 0.025, 0] }, 0.01);
  // A strip of light along the inner face.
  b.screen(0.005, 0.015, 0x9ad7d3, {
    at: [-side * (CAB_W / 2 + 0.001), CAB_H - 0.06, 0],
    rot: [0, (-side * Math.PI) / 2, 0],
  });
  b.box(
    0.004,
    0.015,
    CAB_L - 0.06,
    TEAL,
    { at: [-side * (CAB_W / 2 + 0.002), CAB_H - 0.06, 0] },
    0,
  );
  // Badge readers: dark wedges on the top at both ends, by the passage.
  for (const z of [-1, 1]) {
    b.box(
      0.08,
      0.03,
      0.1,
      INK,
      {
        at: [-side * 0.03, CAB_H + 0.02, z * (CAB_L / 2 - 0.08)],
        rot: [z * 0.3, 0, 0],
      },
      0.006,
    );
  }
  // `yotta.` vinyl on the face toward the camera.
  letter(b, 'yotta.', 0.011, 0, CAB_H * 0.55, CAB_L / 2 + 0.003, 0xe6e9ec);
  return b.build();
}

/** A glass flap, from its hinge at the origin along +x (toward the passage's middle). */
export function gateFlapModel(): Model {
  const b = new ModelBuilder();
  b.pane(0.22, 0.34, 0.016, 0xcfe2e6, { at: [0.11, 0.42, 0] });
  b.box(0.022, 0.36, 0.03, STEEL_DARK, { at: [0.008, 0.42, 0] }, 0);
  for (const side of [-1, 1]) letter(b, 'yotta.', 0.006, 0.12, 0.5, side * 0.0095, 0xf2f4f5, side);
  return b.build();
}

/** A flat arrow pointing +z, `w` wide and `l` long, lying in the xz plane (for glow glyphs). */
export function arrowGeometry(w: number, l: number): THREE.BufferGeometry {
  const s = new THREE.Shape();
  const shaft = w * 0.36;
  const head = l * 0.48;
  s.moveTo(-shaft / 2, -l / 2);
  s.lineTo(shaft / 2, -l / 2);
  s.lineTo(shaft / 2, l / 2 - head);
  s.lineTo(w / 2, l / 2 - head);
  s.lineTo(0, l / 2);
  s.lineTo(-w / 2, l / 2 - head);
  s.lineTo(-shaft / 2, l / 2 - head);
  s.closePath();
  // Lying face up (shape y → world −z), then turned so the tip points +z.
  return new THREE.ShapeGeometry(s).rotateX(-Math.PI / 2).rotateY(Math.PI);
}

/** A flat cross `size` across, in the xz plane. */
export function crossGeometry(size: number, bar: number): THREE.BufferGeometry {
  const a = new THREE.PlaneGeometry(size, bar).rotateX(-Math.PI / 2).rotateY(Math.PI / 4);
  const b = new THREE.PlaneGeometry(size, bar).rotateX(-Math.PI / 2).rotateY(-Math.PI / 4);
  const merged = new THREE.BufferGeometry();
  const pos = [...toArray(a), ...toArray(b)];
  merged.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  a.dispose();
  b.dispose();
  return merged;
}

function toArray(g: THREE.BufferGeometry): number[] {
  const flat = g.index ? g.toNonIndexed() : g;
  return [...(flat.getAttribute('position').array as Float32Array)];
}

/**
 * The staff door, in the badge line along x, its floor middle at the
 * origin, the floor side at −z: low jambs (the line stays cut down), the
 * leaf swung right back against the wall on the floor side with its STAFF
 * sign toward the camera, and a door stop.
 */
export function staffDoorModel(): Model {
  const b = new ModelBuilder();
  const h = 0.56;
  for (const x of [-0.47, 0.47]) b.box(0.07, h, 0.22, FRAME_SHADE, { at: [x, h / 2, 0] }, 0.01);
  // The leaf, open flat against the wall to the left.
  const lz = -0.14;
  b.box(0.86, h - 0.02, 0.04, 0x8d969c, { at: [-0.93, (h - 0.02) / 2, lz] }, 0.01);
  b.box(0.5, 0.17, 0.006, 0x2c6e9a, { at: [-0.93, 0.38, lz + 0.023] }, 0);
  letter(b, 'STAFF', 0.024, -0.93, 0.38, lz + 0.027, 0xf0f2f4);
  b.box(0.03, 0.08, 0.05, STEEL, { at: [-0.55, 0.3, lz + 0.03] }, 0);
  // The wedge stop on the floor.
  b.box(0.1, 0.035, 0.07, 0xb5462e, { at: [-1.32, 0.018, lz + 0.06], rot: [0, 0.3, 0] }, 0);
  // The threshold strip.
  b.box(0.9, 0.012, 0.2, STEEL, { at: [0, 0.006, 0] }, 0);
  return b.build();
}

/** A light tint of the frame color, for a fade. */
export const FRAME_LIGHT = tint(FRAME, 0.1);

/**
 * The panel trolley the trains roll on and off at a line's free end: a
 * steel dolly on castors with a few panels standing folded on it and a push
 * handle, along x, its floor middle at the origin.
 */
export function trolleyModel(): Model {
  const b = new ModelBuilder();
  b.box(0.46, 0.035, 0.3, STEEL_DARK, { at: [0, 0.065, 0] }, 0.01);
  for (const x of [-0.19, 0.19])
    for (const z of [-0.12, 0.12])
      b.cylinder(0.03, 0.03, 0.022, RUBBER, { at: [x, 0.03, z], rot: [Math.PI / 2, 0, 0] }, 10);
  for (const [k, z] of [-0.06, 0, 0.06].entries()) {
    b.box(0.42, 0.46, 0.035, k === 1 ? INFILL : FRAME, { at: [0, 0.31, z] }, 0.008);
    b.box(0.42, 0.04, 0.037, TEAL, { at: [0, 0.4, z] }, 0);
  }
  b.box(0.03, 0.4, 0.03, STEEL, { at: [0.22, 0.28, 0.13] }, 0);
  b.box(0.03, 0.4, 0.03, STEEL, { at: [0.22, 0.28, -0.13] }, 0);
  b.box(0.03, 0.03, 0.29, STEEL, { at: [0.22, 0.47, 0] }, 0);
  return b.build();
}
