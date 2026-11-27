import * as THREE from 'three';
import { type ModelBuilder, tint } from '../kit';
import { hash01 } from './midRise';
import { looks, nth, type SetPiece } from './shared';

/**
 * The Reorg's world pieces (level 4-3, scene `the-reorg`; see
 * `docs/plan/the-reorg-environment.md`): YOTTA Tower's boardroom floor on
 * the summer day the consultants move every wall, twice before lunch.
 *
 * Behind the back wall, 4-2's executive reception turned into the move's
 * staging area: blue removal crates with numbered lids, roll cages,
 * partition trolleys, a pallet truck, bubble-wrap rolls, a stepladder, a
 * coffee machine on a trolley, a consultant's laptop on a crate, a "MOVE 3
 * OF 3" stand, and the logo swap: the old brushed-steel `YOTTA` half
 * unscrewed off the wall (the O hanging by one screw, the Y on the floor in
 * bubble wrap) while the new lit lowercase `yotta` hangs from a gantry's
 * hoist, its full stop carried in separately like a precious object. Prod
 * rides a removal dolly with three MOVE stickers on its pot.
 *
 * Outside: removal lorries far below on the left, MONOLITH's tower across
 * the river melting down on the right (its crown letters gone or dangling,
 * half its windows dark, a crowd of staff with desk boxes at its foot, its
 * own removal van, its helicopter leaving), and in the front corners the
 * setback roofs where the spare partitions are dumped.
 *
 * Chunky shapes and few bold colors: crate blue, tape yellow, consultancy
 * teal, YOTTA violet; everything a touch greyed so the stations stay the
 * brightest things on screen.
 */

type V3 = [number, number, number];

/** Built-to-measure pieces are cached, so the same scene gives the same pieces (and tests compare). */
const made = new Map<string, SetPiece>();
function once(key: string, make: () => SetPiece): SetPiece {
  let piece = made.get(key);
  if (!piece) {
    piece = make();
    made.set(key, piece);
  }
  return piece;
}

/** A flat box (no bevel). */
function flat(b: ModelBuilder, w: number, h: number, d: number, color: number, at: V3, rot?: V3) {
  b.box(w, h, d, color, rot ? { at, rot } : { at }, 0);
}

/** A flat glowing box (a lit letter's face, an LED strip). */
function glowBox(b: ModelBuilder, w: number, h: number, d: number, color: number, at: V3) {
  b.add(new THREE.BoxGeometry(w, h, d), color, { at }, 'glow');
}

/** A bar from `a` to `c`, `t` thick: a rope, a rail, a strut; `glow` for a neon tube. */
function bar(
  b: ModelBuilder,
  a: V3,
  c: V3,
  t: number,
  color: number,
  layer: 'body' | 'glow' = 'body',
): void {
  const d = new THREE.Vector3(c[0] - a[0], c[1] - a[1], c[2] - a[2]);
  const len = d.length();
  if (len < 1e-4) return;
  const g = new THREE.CylinderGeometry(t / 2, t / 2, len, 8);
  g.applyQuaternion(
    new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()),
  );
  b.add(g, color, { at: [(a[0] + c[0]) / 2, (a[1] + c[1]) / 2, (a[2] + c[2]) / 2] }, layer);
}

/** `a` mixed toward `c` by `t`. */
function mix(a: number, c: number, t: number): number {
  return new THREE.Color(a).lerp(new THREE.Color(c), t).getHex();
}

// ---- Lettering (the same blocky alphabet as 4-1's and 4-2's signs) ----

const FONT: Readonly<Record<string, string>> = {
  A: '111101111101101',
  D: '110101101101110',
  E: '111100110100111',
  F: '111100110100100',
  G: '011100101101011',
  H: '101101111101101',
  I: '111010010010111',
  L: '100100100100111',
  M: '101111111101101',
  N: '110101101101101',
  O: '111101101101111',
  R: '110101110101101',
  S: '011100010001110',
  T: '111010010010010',
  V: '101101101101010',
  W: '101101111111101',
  Y: '101101010010010',
  '1': '010110010010111',
  '2': '110001010100111',
  '3': '111001011001111',
  ' ': '000000000000000',
};

/** Whether every glyph of `text` is in the alphabet. */
export function spellable(text: string): boolean {
  return Array.from(text).every((ch) => ch in FONT);
}

/** How wide `text` runs in pixels: 3 a glyph and 1 between. */
function textWidth(text: string): number {
  return Array.from(text).length * 4 - 1;
}

/** Calls `cell(u, row, w, k)` for each run of lit pixels of `text`, centred on 0; row 0 is the top. */
function glyphs(text: string, cell: (u: number, row: number, w: number, k: number) => void): void {
  const cols = textWidth(text);
  Array.from(text).forEach((ch, k) => {
    const glyph = FONT[ch] ?? '';
    for (let r = 0; r < 5; r++) {
      let c = 0;
      while (c < 3) {
        if (glyph[r * 3 + c] !== '1') {
          c++;
          continue;
        }
        let e = c;
        while (e < 3 && glyph[r * 3 + e] === '1') e++;
        cell(k * 4 + c + (e - c) / 2 - cols / 2, r, e - c, k);
        c = e;
      }
    }
  });
}

/** Letters on a face at depth z facing +z, centred on (x, y), `px` a pixel. */
function letters(
  b: ModelBuilder,
  text: string,
  x: number,
  y: number,
  z: number,
  px: number,
  color: number,
): void {
  glyphs(text, (u, r, w) => {
    flat(b, w * px, px, 0.006, color, [x + u * px, y + (2 - r) * px, z + 0.003]);
  });
}

// ---- Colors ----

/** The tower's floors stand this high off the ground (the level's floor). */
export const FLOOR = 0.463;
/** YOTTA violet, and the new sign's lit tubes (a pale violet that blooms). */
export const VIOLET = 0x8a64d8;
const NEON = 0xe2d2ff;
const NEON_CORE = 0xfaf4ff;
/** The consultants' kit, a touch greyed: crate blue, tape yellow, consultancy teal. */
export const CRATE = 0x3f6c9e;
const CRATE_LID = 0x2e5280;
export const TAPE = 0xd2b44c;
export const TEAL = 0x3a958e;
/** Partition frames: powder-coated white, matte and a touch grey; frosted infill. */
const FRAME = 0xd8d8d4;
const FROST = 0xb4bcc0;
/** Steel, chrome, rubber, cardboard, bubble wrap. */
const STEEL = 0x8c9298;
const STEEL_DARK = 0x4c5258;
const RUBBER = 0x24262a;
const CARDBOARD = 0xb08c5e;
const WRAP = 0xdfe6ea;
/** The old logo's brushed steel, over a dark return so each letter stands off the slats. */
const LETTER_FACE = 0xd2d8de;
const LETTER_RETURN = 0x5c636a;
/** Where a letter came off: the slats behind it cleaner and paler, so its shape still reads. */
const GHOST = 0xc4beb2;
/** Plain colors for the far-off tiny people: greyed shirts and skins. */
const SHIRTS = [0x7a8ca0, 0xb0a898, 0x6a6e78, 0xa07a6a, 0x8a9a7a, 0xc8c4bc] as const;
const SKINS = [0xc8a890, 0xa08070, 0x8a6a5a] as const;
/** MONOLITH's black. */
const MONO_BLACK = 0x15171c;
/** MONOLITH's crown letters, what's left of them: still bright, so the gaps read. */
const MONO_WHITE = 0xe8eef8;

// ---- Castors, the kit's common foot ----

/** A castor at (x, z): a swivel fork and a black wheel, `r` the wheel's radius. */
function castor(b: ModelBuilder, x: number, z: number, r = 0.035): void {
  flat(b, 0.03, 0.02, 0.03, STEEL_DARK, [x, r * 2 + 0.01, z]);
  b.cylinder(r, r, 0.022, RUBBER, { at: [x, r, z], rot: [Math.PI / 2, 0, 0] }, 10);
}

// ---- The staging area: crates, cages, trolleys ----

/**
 * Blue removal crates with lids, stacked 1 to 3 high (`v` + 1), each 0.6 ×
 * 0.4 × 0.3 with a white number label on its front and the lid's handles.
 * About 0.31 a crate.
 */
export const CRATE_H = 0.31;
export const crateStack = looks([0.62, 0.42], 3, (b, v) => {
  for (let k = 0; k <= v; k++) {
    const y = k * CRATE_H;
    const dx = (hash01(k, v, 401) - 0.5) * 0.05;
    const yaw = (hash01(k, v, 403) - 0.5) * 0.08;
    b.box(0.6, 0.26, 0.4, CRATE, { at: [dx, y + 0.13, 0], rot: [0, yaw, 0] }, 0.02);
    // The tapered sides' ribs, the lid in two leaves, the label.
    flat(b, 0.62, 0.03, 0.42, CRATE_LID, [dx, y + 0.275, 0], [0, yaw, 0]);
    flat(b, 0.012, 0.02, 0.42, tint(CRATE_LID, -0.2), [dx, y + 0.295, 0], [0, yaw, 0]);
    flat(b, 0.14, 0.08, 0.006, 0xeceae4, [dx - 0.12, y + 0.15, 0.203], [0, yaw, 0]);
    flat(b, 0.06, 0.04, 0.004, 0x2a2c30, [dx - 0.12, y + 0.15, 0.207], [0, yaw, 0]);
    flat(b, 0.12, 0.03, 0.006, tint(CRATE, -0.25), [dx + 0.16, y + 0.2, 0.203], [0, yaw, 0]);
  }
});

/** A roll cage on castors, 1.3 high: steel mesh sides, cardboard boxes and a bubble-wrap bag inside. */
export const rollCage = looks([0.72, 0.6], 2, (b, v) => {
  const w = 0.7;
  const d = 0.56;
  const h = 1.3;
  flat(b, w, 0.04, d, STEEL_DARK, [0, 0.1, 0]);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) castor(b, (sx * w) / 2.4, (sz * d) / 2.4);
  // Corner posts and rails, mesh on three sides (the front open: its gate swung back).
  for (const sx of [-1, 1])
    for (const sz of [-1, 1])
      flat(b, 0.03, h, 0.03, STEEL, [(sx * w) / 2, 0.1 + h / 2, (sz * d) / 2]);
  for (const y of [0.12, 0.6, h + 0.08]) {
    flat(b, w, 0.025, 0.025, STEEL, [0, y, -d / 2]);
    for (const sx of [-1, 1]) flat(b, 0.025, 0.025, d, STEEL, [(sx * w) / 2, y, 0]);
  }
  for (let x = -w / 2 + 0.1; x < w / 2; x += 0.1)
    flat(b, 0.008, h, 0.008, STEEL, [x, 0.1 + h / 2, -d / 2]);
  for (const sx of [-1, 1])
    for (let z = -d / 2 + 0.1; z < d / 2; z += 0.1)
      flat(b, 0.008, h, 0.008, STEEL, [(sx * w) / 2, 0.1 + h / 2, z]);
  for (let y = 0.25; y < h; y += 0.15) flat(b, w, 0.008, 0.008, STEEL, [0, y, -d / 2]);
  // What's in it.
  const boxes: [number, number, number, number, number][] =
    v === 0
      ? [
          [-0.15, 0.12, 0.34, 0.3, 0.42],
          [0.17, 0.12, 0.3, 0.26, 0.4],
          [-0.12, 0.42, 0.36, 0.28, 0.38],
          [0.16, 0.38, 0.28, 0.22, 0.36],
        ]
      : [
          [0, 0.12, 0.6, 0.34, 0.46],
          [-0.12, 0.46, 0.34, 0.3, 0.4],
        ];
  for (const [x, y, bw, bh, bd] of boxes) {
    b.box(
      bw,
      bh,
      bd,
      mix(CARDBOARD, 0xffffff, hash01(x * 10, y * 10, 405) * 0.12),
      {
        at: [x, y + bh / 2, 0],
      },
      0.01,
    );
    flat(b, bw + 0.004, 0.04, 0.05, TAPE, [x, y + bh - 0.01, 0]);
  }
  if (v === 1) b.sphere(0.22, WRAP, { at: [0.12, 0.98, 0] }, [1.2, 0.9, 1]);
});

/**
 * A partition trolley along x, 1.2 long: a low steel deck on four castors,
 * four of the consultants' panels standing on edge in it, a push handle at
 * the −x end whose bar is `TROLLEY_HANDLE` high (where a pushing man's hands
 * are), `TROLLEY_HANDLE_X` from the middle.
 */
export const TROLLEY_HANDLE = 0.6;
export const TROLLEY_HANDLE_X = -0.66;
export const partitionTrolley = looks([1.3, 0.5], 1, (b) => {
  flat(b, 1.2, 0.05, 0.42, STEEL_DARK, [0, 0.11, 0]);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) castor(b, sx * 0.52, sz * 0.16);
  // The uprights that hold the panels, the handle.
  for (const sx of [-1, 1]) flat(b, 0.03, 0.5, 0.03, STEEL, [sx * 0.5, 0.38, 0]);
  flat(b, 1.04, 0.025, 0.025, STEEL, [0, 0.62, 0]);
  bar(b, [-0.58, 0.14, -0.18], [TROLLEY_HANDLE_X, TROLLEY_HANDLE, -0.18], 0.03, STEEL);
  bar(b, [-0.58, 0.14, 0.18], [TROLLEY_HANDLE_X, TROLLEY_HANDLE, 0.18], 0.03, STEEL);
  bar(
    b,
    [TROLLEY_HANDLE_X, TROLLEY_HANDLE, -0.2],
    [TROLLEY_HANDLE_X, TROLLEY_HANDLE, 0.2],
    0.035,
    RUBBER,
  );
  // The panels on edge, along x, a little apart.
  for (let k = 0; k < 4; k++) {
    const z = -0.13 + k * 0.085;
    b.add(new THREE.BoxGeometry(1.1, 0.9, 0.035), FRAME, { at: [0, 0.6, z] });
    b.add(new THREE.BoxGeometry(1.0, 0.8, 0.04), FROST, { at: [0, 0.6, z] });
    flat(b, 1.0, 0.06, 0.045, TEAL, [0, 0.72, z]);
  }
  // A paper sign taped to the outer panel.
  flat(b, 0.22, 0.16, 0.004, 0xf0ece0, [0.25, 0.5, 0.155]);
  letters(b, 'SILO', 0.25, 0.5, 0.157, 0.012, 0x3a3c40);
});

/**
 * A hand pallet truck (a yellow one, the tape's yellow) under a pallet of
 * wrapped boxes, its handle up; 0.6 high at the load, the handle to 0.95.
 */
export const palletTruck = looks([1.3, 0.7], 1, (b) => {
  // The pallet and its load, shrink-wrapped.
  flat(b, 0.9, 0.12, 0.7, 0xb89a6a, [0, 0.1, 0]);
  for (const z of [-0.3, 0, 0.3]) flat(b, 0.9, 0.035, 0.1, 0xc8aa78, [0, 0.175, z]);
  b.box(0.82, 0.42, 0.62, CARDBOARD, { at: [0, 0.4, 0] }, 0.02);
  b.box(0.86, 0.36, 0.66, WRAP, { at: [0, 0.4, 0] }, 0.03);
  flat(b, 0.86, 0.04, 0.67, TAPE, [0, 0.5, 0]);
  // The forks under it, the pump, the handle.
  for (const s of [-1, 1]) flat(b, 1.0, 0.04, 0.12, TAPE, [0.05, 0.03, s * 0.2]);
  b.box(0.16, 0.22, 0.4, TAPE, { at: [0.55, 0.13, 0] }, 0.02);
  castor(b, 0.6, 0, 0.05);
  bar(b, [0.6, 0.24, 0], [0.82, 0.92, 0], 0.035, TAPE);
  bar(b, [0.82, 0.92, -0.1], [0.82, 0.92, 0.1], 0.04, RUBBER);
});

/** Bubble-wrap rolls lying on their sides, three in a heap; 0.5 high. */
export const bubbleRolls = looks([1.1, 0.7], 1, (b) => {
  for (const [x, y, z, len] of [
    [-0.25, 0.2, -0.15, 0.9],
    [0.25, 0.2, 0.08, 0.9],
    [0, 0.5, -0.04, 0.8],
  ] as const) {
    b.cylinder(0.2, 0.2, len, WRAP, { at: [x, y, z], rot: [Math.PI / 2, 0, 0] }, 16);
    b.cylinder(0.06, 0.06, len + 0.02, CARDBOARD, { at: [x, y, z], rot: [Math.PI / 2, 0, 0] }, 10);
    for (const e of [-0.3, 0.3]) b.torus(0.2, 0.012, tint(WRAP, -0.12), { at: [x, y, z + e] });
  }
});

/** An aluminium stepladder, open, 1.45 high, its paint tray up top. */
export const stepladder = looks([0.6, 0.6], 1, (b) => {
  const h = 1.45;
  for (const s of [-1, 1]) {
    bar(b, [-0.2, 0, 0.32], [-0.17, h, 0.02], 0.04, 0xb8bcc0);
    bar(b, [0.2, 0, 0.32], [0.17, h, 0.02], 0.04, 0xb8bcc0);
    bar(b, [s * 0.2, 0, -0.3], [s * 0.17, h, -0.02], 0.035, 0x9ca0a6);
  }
  for (let y = 0.3; y < h - 0.1; y += 0.3) {
    const z = 0.32 - (y / h) * 0.3;
    flat(b, 0.36, 0.025, 0.08, 0xa8acb2, [0, y, z]);
  }
  flat(b, 0.36, 0.05, 0.22, 0x9ca0a6, [0, h + 0.02, 0]);
  // A screwdriver and the screws in a cup on top.
  b.cylinder(0.03, 0.025, 0.06, 0xe8e4d8, { at: [0.08, h + 0.08, 0] }, 8);
  bar(b, [-0.1, h + 0.06, 0.04], [0.02, h + 0.06, -0.05], 0.02, 0xc84a3a);
});

/** A coffee machine on a steel trolley, cups stacked, water bottles below; 1.15 high. The steam's at `COFFEE_STEAM`. */
export const COFFEE_STEAM: V3 = [-0.12, 1.12, 0.04];
export const coffeeTrolley = looks([0.75, 0.5], 1, (b) => {
  for (const y of [0.18, 0.72]) flat(b, 0.7, 0.03, 0.46, STEEL, [0, y, 0]);
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      flat(b, 0.025, 0.66, 0.025, STEEL, [sx * 0.33, 0.43, sz * 0.21]);
      castor(b, sx * 0.31, sz * 0.19);
    }
  bar(b, [0.36, 0.72, -0.2], [0.42, 0.84, -0.2], 0.025, STEEL);
  bar(b, [0.36, 0.72, 0.2], [0.42, 0.84, 0.2], 0.025, STEEL);
  bar(b, [0.42, 0.84, -0.2], [0.42, 0.84, 0.2], 0.03, RUBBER);
  // The machine: black, a chrome spout, a lit button, its drip tray.
  b.box(0.3, 0.36, 0.34, 0x24262a, { at: [-0.12, 0.92, -0.02] }, 0.03);
  flat(b, 0.2, 0.06, 0.04, 0x3a3c40, [-0.12, 1.06, 0.16]);
  flat(b, 0.04, 0.05, 0.03, 0xc4c8cc, [-0.12, 0.88, 0.16]);
  flat(b, 0.18, 0.02, 0.1, 0x4a4c50, [-0.12, 0.75, 0.12]);
  b.led(0.012, 0x7ad0a0, { at: [-0.05, 1.04, 0.165] });
  // Paper cups in sleeves, a stack and two out, one with a lid.
  b.cylinder(0.04, 0.032, 0.22, 0xece8e0, { at: [0.16, 0.85, 0.06] }, 10);
  for (const [x, z] of [
    [0.06, 0.15],
    [0.22, -0.1],
  ] as const) {
    b.cylinder(0.035, 0.028, 0.09, 0xece8e0, { at: [x, 0.78, z] }, 10);
    flat(b, 0.072, 0.03, 0.072, TEAL, [x, 0.78, z]);
  }
  // Water bottles below.
  for (let k = 0; k < 4; k++)
    b.cylinder(0.04, 0.04, 0.22, 0x9cc4d8, { at: [-0.2 + k * 0.11, 0.31, 0.05] }, 10);
});

/** A consultant's laptop open on a blue crate, showing the plan's slide; 0.55 high. */
export const laptopCrate = looks([0.62, 0.42], 1, (b) => {
  b.box(0.6, 0.26, 0.4, CRATE, { at: [0, 0.13, 0] }, 0.02);
  flat(b, 0.62, 0.03, 0.42, CRATE_LID, [0, 0.275, 0]);
  flat(b, 0.34, 0.015, 0.24, 0x9aa0a8, [0, 0.297, 0.04]);
  flat(b, 0.34, 0.22, 0.012, 0x3a3e44, [0, 0.41, -0.08], [-0.25, 0, 0]);
  b.add(
    new THREE.PlaneGeometry(0.3, 0.18),
    0xf2f4f6,
    { at: [0, 0.41, -0.072], rot: [-0.25, 0, 0] },
    'glow',
  );
  flat(b, 0.22, 0.03, 0.004, TEAL, [0, 0.47, -0.064], [-0.25, 0, 0]);
  for (let k = 0; k < 3; k++)
    flat(
      b,
      0.16 - k * 0.03,
      0.012,
      0.004,
      0x8a9098,
      [-0.02, 0.43 - k * 0.03, -0.064],
      [-0.25, 0, 0],
    );
  // A clicker beside it, a coffee cup.
  flat(b, 0.03, 0.015, 0.09, 0x24262a, [0.22, 0.298, 0.1]);
  b.cylinder(0.035, 0.028, 0.09, 0xece8e0, { at: [-0.22, 0.335, 0.1] }, 10);
});

/** The "MOVE 3 OF 3" stand: a teal board on a chrome pole and foot, white words, the date on tape; 1.5 high. */
export const moveSign = looks([0.6, 0.4], 1, (b) => {
  b.cylinder(0.18, 0.2, 0.03, STEEL_DARK, { at: [0, 0.015, 0] }, 16);
  b.cylinder(0.018, 0.018, 1.0, 0xc4c8cc, { at: [0, 0.5, 0] }, 8);
  b.box(0.82, 0.62, 0.04, TEAL, { at: [0, 1.2, 0] }, 0.02);
  flat(b, 0.76, 0.56, 0.005, tint(TEAL, -0.12), [0, 1.2, 0.02]);
  letters(b, 'MOVE', 0, 1.33, 0.022, 0.05, 0xf4f4f0);
  letters(b, '3 OF 3', 0, 1.06, 0.022, 0.04, 0xf4f4f0);
  // The earlier ones, taped over and crossed out, peeking out under it.
  flat(b, 0.3, 0.06, 0.004, 0xeceae2, [-0.2, 0.86, 0.02], [0, 0, 0.1]);
  flat(b, 0.32, 0.012, 0.004, 0xc84a3a, [-0.2, 0.86, 0.024], [0, 0, 0.1]);
});

/** Cardboard wardrobe boxes, two side by side, taped, a hanging rail's top showing; 1.0 high. */
export const wardrobeBoxes = looks([1.1, 0.55], 1, (b) => {
  for (const [x, h] of [
    [-0.27, 1.0],
    [0.27, 0.92],
  ] as const) {
    b.box(0.5, h, 0.5, CARDBOARD, { at: [x, h / 2, 0] }, 0.015);
    flat(b, 0.06, h + 0.004, 0.504, TAPE, [x, h / 2, 0]);
    flat(b, 0.2, 0.12, 0.004, 0xeceae2, [x + 0.12, h * 0.7, 0.252]);
  }
});

// ---- The logo swap ----

/** The old logo's pixel: big enough that Y-O-T-T-A reads from across the room. */
export const OLD_PX = 0.156;
/** How much bigger the old logo's pieces are than the 0.12 pixel they were drawn round. */
const OLD_K = OLD_PX / 0.12;

/**
 * The old steel `YOTTA` coming off the wall, `px` a pixel, centred on x = 0
 * with its foot at y = 0, face toward +z: the Y gone (only its cleaner ghost
 * on the stone and four screw holes), the O gone from its place (it hangs by
 * one screw: `hangingO`), T, T and A still up, each brushed face over a
 * darker return, one T already a little skew.
 */
export const oldLogo = looks([textWidth('YOTTA') * OLD_PX, 0.1], 1, (b) => {
  const px = OLD_PX;
  const cy = px * 2.5;
  glyphs('YOTTA', (u, r, w, k) => {
    const at: V3 = [u * px, cy + (2 - r) * px, 0.04];
    if (k < 2) {
      // The ghost where it stood: cleaner and paler than the slats round it, a hair proud.
      flat(b, w * px, px, 0.004, GHOST, [at[0], at[1], 0.054]);
      return;
    }
    const skew = k === 2 ? 0.05 : 0;
    flat(b, w * px, px, 0.06, LETTER_RETURN, at, [0, 0, skew]);
    flat(b, w * px - 0.012, px - 0.012, 0.006, LETTER_FACE, [at[0], at[1], 0.073], [0, 0, skew]);
    flat(b, w * px, 0.02, 0.062, 0xe4e8ec, [at[0], at[1] + px / 2 - 0.01, 0.041], [0, 0, skew]);
  });
  // The screw holes where the Y and the O came off.
  const left = (-textWidth('YOTTA') / 2) * px;
  for (const [x, y] of [
    [0.3, 0.6],
    [2.6, 0.6],
    [1.5, 4.4],
    [4.3, 0.6],
    [6.6, 4.4],
  ] as const)
    b.cylinder(
      0.012,
      0.012,
      0.01,
      0x2a2a2e,
      { at: [left + x * px, y * px, 0.058], rot: [Math.PI / 2, 0, 0] },
      6,
    );
});

/**
 * The old logo's O, hanging by its last screw: its origin at the screw (its
 * top-right corner), the letter swung down and round. `sway` alive.
 */
export const hangingO = looks([0.4, 0.1], 1, (b) => {
  const px = OLD_PX;
  const turn = 0.62;
  const c = Math.cos(turn);
  const s = Math.sin(turn);
  // The O's pixels about its top-right corner, turned by `turn`.
  glyphs('O', (u, r, w) => {
    const lx = u * px - 1.5 * px;
    const ly = -(r + 0.5) * px;
    const x = lx * c - ly * s;
    const y = lx * s + ly * c;
    flat(b, w * px, px, 0.06, LETTER_RETURN, [x, y, 0.04], [0, 0, turn]);
    flat(b, w * px - 0.012, px - 0.012, 0.006, LETTER_FACE, [x, y, 0.073], [0, 0, turn]);
  });
  b.cylinder(0.016, 0.016, 0.1, 0x5a5c60, { at: [0, 0, 0.05], rot: [Math.PI / 2, 0, 0] }, 6);
});

/** The old Y on the floor, leaning back on a crate, wrapped in bubble wrap and taped; 0.9 high. */
export const wrappedY = looks([0.6, 0.5], 1, (b) => {
  const px = OLD_PX;
  const lean = -0.35;
  glyphs('Y', (u, r, w) => {
    const y = (4.5 - r) * px + 0.04;
    const at: V3 = [u * px, y * Math.cos(lean), 0.02 + y * Math.sin(lean) * -1];
    flat(b, w * px, px, 0.06, LETTER_RETURN, at, [lean, 0, 0]);
    flat(
      b,
      w * px - 0.012,
      px - 0.012,
      0.006,
      LETTER_FACE,
      [at[0], at[1], at[2] + 0.033],
      [lean, 0, 0],
    );
  });
  // Two bands of bubble wrap round it, puffy and pale, taped; the letter's face shows between.
  const k = OLD_K;
  for (const y of [0.2, 0.5])
    b.add(
      new THREE.BoxGeometry(0.5 * k, 0.11 * k, 0.15),
      WRAP,
      { at: [0, y * k * Math.cos(lean), 0.02 - y * k * Math.sin(lean) - 0.02], rot: [lean, 0, 0] },
      'glass',
    );
  flat(b, 0.06, 0.13 * k, 0.16, TAPE, [0.12 * k, 0.2 * k * Math.cos(lean), 0.02], [lean, 0, 0]);
  // The crate it leans on.
  b.box(0.6, 0.26, 0.4, CRATE, { at: [0, 0.13, -0.38] }, 0.02);
  flat(b, 0.62, 0.03, 0.42, CRATE_LID, [0, 0.275, -0.38]);
});

/** The gantry: its span between the legs' feet, the beam's height, and how far under the beam the hook hangs. */
export const GANTRY = { span: 4.6, beam: 2.45, hook: 0.34 } as const;

/**
 * A rolling A-frame gantry along x, `GANTRY.span` between its feet: a yellow
 * beam on two A-legs on castors, a chain hoist hanging from a trolley at its
 * middle (the hook `GANTRY.hook` under the beam, where `newSign` hangs), the
 * hand chain looping down, and a tag line from each end of the sign's rail
 * down to a crate. Its foot at y = 0.
 */
export const gantry = looks([GANTRY.span + 0.4, 0.8], 1, (b) => {
  const { span, beam, hook } = GANTRY;
  const half = span / 2;
  const yellow = TAPE;
  // The beam: a deep I-section with an end plate each side.
  flat(b, span + 0.3, 0.16, 0.08, yellow, [0, beam, 0]);
  for (const y of [beam - 0.085, beam + 0.085])
    flat(b, span + 0.3, 0.02, 0.18, tint(yellow, -0.1), [0, y, 0]);
  for (const s of [-1, 1]) {
    const x = s * half;
    // The A-legs: two struts down to a foot with castors, a cross brace.
    for (const sz of [-1, 1]) bar(b, [x, beam - 0.1, 0], [x, 0.12, sz * 0.38], 0.07, yellow);
    flat(b, 0.12, 0.08, 0.9, tint(yellow, -0.15), [x, 0.12, 0]);
    for (const sz of [-1, 1]) castor(b, x, sz * 0.4, 0.05);
    flat(b, 0.05, 0.05, 0.5, yellow, [x, 0.9, 0]);
    flat(b, 0.18, 0.14, 0.12, yellow, [x, beam - 0.02, 0]);
    // Its load plate.
    flat(b, 0.16, 0.08, 0.004, 0xf0ece0, [x, 0.6, 0.22]);
  }
  // The hoist: a trolley on the beam, the chain block, the load chain to the hook.
  flat(b, 0.22, 0.1, 0.24, STEEL_DARK, [0, beam - 0.15, 0]);
  b.box(0.2, 0.22, 0.16, 0xc84a3a, { at: [0, beam - 0.3, 0] }, 0.03);
  b.cylinder(
    0.09,
    0.09,
    0.05,
    STEEL_DARK,
    { at: [0, beam - 0.3, 0.1], rot: [Math.PI / 2, 0, 0] },
    14,
  );
  bar(b, [0, beam - 0.4, 0], [0, beam - hook, 0], 0.025, STEEL);
  // The hand chain looping down beside it.
  bar(b, [0.06, beam - 0.3, 0.12], [0.08, 0.9, 0.16], 0.015, STEEL);
  bar(b, [0.1, beam - 0.3, 0.12], [0.08, 0.9, 0.16], 0.015, STEEL);
  // The tag lines from the sign's ends to coils on the floor.
  for (const s of [-1, 1]) {
    const x = s * (SIGN.w / 2 + 0.05);
    bar(
      b,
      [x, beam - hook - SIGN.drop - SIGN.h + 0.04, 0],
      [s * (half - 0.4), 0.06, 0.3],
      0.018,
      0xd8c8a0,
    );
    b.torus(0.1, 0.02, 0xd8c8a0, { at: [s * (half - 0.4), 0.03, 0.3], rot: [Math.PI / 2, 0, 0] });
  }
});

/** The new sign: its letters' width, height (x-height to the descender) and how far its rail hangs under the hook. */
export const SIGN = { w: 3.6, h: 0.95, drop: 0.55 } as const;

/**
 * The new lowercase `yotta` in lit tubes, hanging from the hoist's hook:
 * its origin at the hook, a sling down to each end of a dark rail, the
 * letters standing on the rail's face below it, white-violet tubes over a
 * violet backing, a cut-out bracket where the full stop will go. Hot; `sway`
 * alive (it swings a little from the hook).
 */
export const newSign = looks([SIGN.w + 0.6, 0.2], 1, (b) => {
  const { w, drop } = SIGN;
  const rail = -drop;
  // The sling and its shackle.
  b.torus(0.04, 0.012, STEEL, { at: [0, -0.04, 0] });
  for (const s of [-1, 1])
    bar(b, [0, -0.06, 0], [s * (w / 2 - 0.1), rail + 0.04, 0], 0.02, 0xd8c8a0);
  // The rail.
  flat(b, w + 0.3, 0.07, 0.1, 0x2c2e34, [0, rail, -0.02]);
  for (const s of [-1, 1]) flat(b, 0.06, 0.06, 0.06, STEEL, [s * (w / 2 - 0.1), rail + 0.05, 0]);
  // The letters: x-height `xh`, tubes `t` thick, spaced along x.
  const xh = 0.5;
  const t = 0.085;
  const r = xh / 2 - t / 2;
  const base = rail - 0.1 - xh;
  const step = w / 5.4;
  const x0 = -w / 2 + step * 0.5;
  const tube = (a: V3, c: V3) => {
    bar(b, a, c, t, NEON, 'glow');
    bar(b, [a[0], a[1], a[2] - 0.05], [c[0], c[1], c[2] - 0.05], t + 0.05, tint(VIOLET, -0.2));
  };
  const ring = (x: number, y: number) => {
    b.add(new THREE.TorusGeometry(r, t / 2, 8, 28), NEON, { at: [x, y, 0] }, 'glow');
    b.add(new THREE.TorusGeometry(r, t / 2 + 0.025, 8, 28), tint(VIOLET, -0.2), {
      at: [x, y, -0.05],
    });
  };
  const mid = base + xh / 2;
  // y
  let x = x0;
  tube([x - r, base + xh, 0], [x, base + 0.05, 0]);
  tube([x + r, base + xh, 0], [x - r * 0.6, base - 0.36, 0]);
  // o
  x += step;
  ring(x, mid);
  // t t
  for (let k = 0; k < 2; k++) {
    x += step;
    tube([x - 0.05, base + xh + 0.24, 0], [x - 0.05, base + 0.06, 0]);
    tube([x - r * 0.9, base + xh - 0.02, 0], [x + r * 0.8, base + xh - 0.02, 0]);
    b.add(
      new THREE.TorusGeometry(0.1, t / 2, 6, 12, Math.PI / 2),
      NEON,
      {
        at: [x + 0.05, base + 0.1, 0],
        rot: [0, 0, Math.PI],
      },
      'glow',
    );
  }
  // a
  x += step;
  ring(x - 0.04, mid);
  tube([x + r - 0.02, base + xh, 0], [x + r - 0.02, base, 0]);
  // Each letter's hanger off the rail.
  for (let k = 0; k < 5; k++) {
    const hx = x0 + k * step;
    flat(b, 0.025, 0.12, 0.025, STEEL, [hx, rail - 0.08, -0.04]);
  }
  // The empty bracket where the full stop goes, with a taped "." label.
  const dx = x0 + 4.75 * step;
  b.torus(0.14, 0.016, STEEL, { at: [dx, base + 0.14, -0.03] });
  flat(b, 0.025, 0.24, 0.025, STEEL, [dx, rail - 0.12 - 0.06, -0.04]);
  // A white core down the middle of the tubes, so the letters read brightest at their centre.
  for (let k = 0; k < 5; k++) {
    const cx = x0 + k * step;
    glowBox(b, 0.02, 0.02, 0.02, NEON_CORE, [cx, mid, t / 2 + 0.01]);
  }
});

/**
 * The full stop, carried in on its own: the sign's missing dot, lit like
 * its letters (a pale white-violet disc, a white core, a violet halo ring)
 * on a dark back plate, tilted back so it faces the camera (`STOP.tilt` about x) and
 * centred `STOP.y` over its foot (where two men hold it at chest height by
 * its rim). Cardboard corners taped on, its power lead dangling with the
 * plug, a cardboard FRAGILE tag on a string. Hot.
 */
export const STOP = { r: 0.28, rim: 0.12, y: 0.6, tilt: -0.9 } as const;
export const fullStop = looks([0.7, 0.3], 1, (b) => {
  const { r, rim, y, tilt } = STOP;
  const face = new THREE.Matrix4()
    .makeTranslation(0, y, 0)
    .multiply(new THREE.Matrix4().makeRotationX(tilt));
  /** `g` placed at (x, y, z) in the dot's own plane (its face toward +z), turned by `rz` in it. */
  const on = (
    g: THREE.BufferGeometry,
    color: number,
    at: V3,
    layer: 'body' | 'glow' = 'body',
    rz = 0,
  ) => {
    g.applyMatrix4(
      new THREE.Matrix4()
        .multiplyMatrices(face, new THREE.Matrix4().makeTranslation(...at))
        .multiply(new THREE.Matrix4().makeRotationZ(rz)),
    );
    b.add(g, color, {}, layer);
  };
  const outer = r + rim / 2;
  // The back plate and the can's edge.
  on(
    new THREE.CylinderGeometry(outer + 0.015, outer + 0.015, 0.08, 32).rotateX(Math.PI / 2),
    tint(VIOLET, -0.55),
    [0, 0, -0.03],
  );
  // The dot itself, lit like the letters' tubes: a violet halo ring round a pale disc, its
  // white core brightest (a lamp, not a plate: no pale rim round a coloured middle).
  on(new THREE.TorusGeometry(r, rim / 2, 10, 36), tint(VIOLET, -0.1), [0, 0, 0.0], 'glow');
  on(new THREE.CircleGeometry(r, 32), NEON, [0, 0, 0.014], 'glow');
  on(new THREE.CircleGeometry(r * 0.55, 24), NEON_CORE, [0, 0, 0.018], 'glow');
  // Cardboard corners taped on.
  for (const a of [0.6, 2.5, 3.8, 5.6])
    on(
      new THREE.BoxGeometry(0.1, 0.1, 0.12),
      CARDBOARD,
      [Math.cos(a) * outer, Math.sin(a) * outer, -0.01],
      'body',
      a + Math.PI / 4,
    );
  // The power lead out of its foot, the plug swinging under it.
  bar(b, [0.04, y - outer * 0.75, -0.02], [0.08, 0.12, 0.08], 0.022, RUBBER);
  b.box(0.05, 0.07, 0.035, 0x2a2c30, { at: [0.08, 0.09, 0.08] }, 0);
  // The FRAGILE tag on its string, off the lower right ring.
  const tx = outer * 0.7;
  const ty = y - outer * 0.55;
  bar(b, [tx - 0.02, ty + 0.06, 0.06], [tx + 0.04, ty - 0.08, 0.12], 0.008, 0xe8e0c8);
  flat(b, 0.27, 0.1, 0.01, 0xd8c4a0, [tx + 0.06, ty - 0.13, 0.13]);
  letters(b, 'FRAGILE', tx + 0.06, ty - 0.13, 0.132, 0.0085, 0xc0302a);
});

// ---- Prod on its removal dolly ----

/** How high Prod's planter stands on its dolly. */
export const DOLLY_TOP = 0.14;

/** A removal dolly under Prod: a square deck on four castors, a push bar; "MOVE 3" sticker on its edge. */
export const prodDolly = looks([0.85, 0.85], 1, (b) => {
  b.box(0.82, 0.05, 0.82, 0x7a5a3a, { at: [0, DOLLY_TOP - 0.025, 0] }, 0.01);
  for (const s of [-1, 1]) flat(b, 0.84, 0.03, 0.06, 0x5a4434, [0, DOLLY_TOP - 0.06, s * 0.33]);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) castor(b, sx * 0.34, sz * 0.34, 0.035);
  // A ratchet strap round the planter, holding it on.
  flat(b, 0.72, 0.05, 0.72, 0xd07a30, [0, DOLLY_TOP + 0.3, 0]);
});

/**
 * Prod's three MOVE stickers on the planter's front (it faces +z): "1" and
 * "2" crossed out in red, "3" fresh; the origin at the planter's foot.
 */
export const moveStickers = looks([0.66, 0.05], 1, (b) => {
  for (let k = 0; k < 3; k++) {
    const x = -0.2 + k * 0.2;
    const y = 0.17 + (k % 2) * 0.04;
    const rot = (k - 1) * 0.12;
    flat(b, 0.16, 0.11, 0.004, k === 2 ? 0xf6e070 : 0xece8dc, [x, y, 0.333], [0, 0, rot]);
    letters(b, ['1', '2', '3'][k] ?? '', x, y, 0.334, 0.016, 0x2a2c30);
    if (k < 2) {
      flat(b, 0.17, 0.014, 0.004, 0xd03a2a, [x, y, 0.339], [0, 0, rot + 0.6]);
      flat(b, 0.17, 0.014, 0.004, 0xd03a2a, [x, y, 0.339], [0, 0, rot - 0.6]);
    }
  }
});

// ---- Far below and across the river ----

/**
 * A removal lorry far below along x (cab at −x, its back at +x), its long side toward the
 * camera (+z): a white box body with a big panel in `look`'s colors (teal
 * with "SWIFT / MOVES" in white, or YOTTA's violet), its back doors open and
 * the tail lift down at the back with partition panels on it. About 1.9
 * long and 0.8 high; the beacon is `lorryLight`, at `LORRY_BEACON`.
 */
export const LORRY_BEACON: V3 = [-0.6, 0.62, 0];
export const removalLorry = looks([1.9, 0.5], 2, (b, v) => {
  const band = v === 0 ? TEAL : VIOLET;
  // The chassis, the box body, its side panel and lettering.
  flat(b, 1.7, 0.06, 0.4, 0x3a3c40, [0.1, 0.12, 0]);
  b.box(1.22, 0.66, 0.46, 0xe4e2dc, { at: [0.19, 0.48, 0] }, 0.02);
  flat(b, 1.12, 0.56, 0.006, band, [0.19, 0.48, 0.232]);
  flat(b, 1.22, 0.04, 0.47, tint(0xe4e2dc, -0.12), [0.19, 0.79, 0]);
  if (v === 0) {
    letters(b, 'SWIFT', 0.19, 0.615, 0.234, 0.045, 0xf6f4ee);
    letters(b, 'MOVES', 0.19, 0.335, 0.234, 0.045, 0xf6f4ee);
  } else flat(b, 1.12, 0.08, 0.008, 0xf6f4ee, [0.19, 0.48, 0.234]);
  // The cab: windscreen, side window, a bumper.
  b.box(0.36, 0.5, 0.44, v === 0 ? 0xe8e6e0 : 0x5a4a8a, { at: [-0.6, 0.37, 0] }, 0.04);
  flat(b, 0.01, 0.18, 0.36, 0x34404e, [-0.785, 0.5, 0]);
  flat(b, 0.16, 0.14, 0.006, 0x34404e, [-0.62, 0.5, 0.222]);
  flat(b, 0.05, 0.06, 0.46, 0x5a5c60, [-0.79, 0.16, 0]);
  for (const x of [0.62, 0.38, -0.6])
    for (const sz of [-1, 1])
      b.cylinder(
        0.085,
        0.085,
        0.05,
        RUBBER,
        { at: [x, 0.085, sz * 0.2], rot: [Math.PI / 2, 0, 0] },
        12,
      );
  // The back doors swung open, the tail lift down, panels and a crate on it.
  for (const sz of [-1, 1])
    flat(b, 0.02, 0.62, 0.22, 0xd8d6d0, [0.86, 0.48, sz * 0.34], [0, -sz * 1.25, 0]);
  flat(b, 0.32, 0.025, 0.44, STEEL, [0.98, 0.02, 0]);
  for (let k = 0; k < 3; k++) flat(b, 0.03, 0.4, 0.36, FRAME, [1.04 - k * 0.06, 0.23, -0.02]);
  b.box(0.16, 0.12, 0.2, CRATE, { at: [0.92, 0.09, 0.12] }, 0.01);
});

/**
 * Two tiny removal men far below walking a partition panel down a lorry's
 * ramp between them, along x; about 0.2 high, like `tinyCrowd`'s people.
 */
export const panelCarry = looks([0.6, 0.15], 1, (b) => {
  for (const [k, x] of [-0.22, 0.22].entries()) {
    flat(b, 0.05, 0.08, 0.035, 0x3a3c44, [x, 0.04, 0]);
    b.box(0.065, 0.075, 0.045, 0x3a5a7a, { at: [x, 0.115, 0] }, 0.01);
    b.sphere(0.026, nth(SKINS, k), { at: [x, 0.175, 0] });
  }
  flat(b, 0.36, 0.2, 0.014, FRAME, [0, 0.15, 0.03]);
  flat(b, 0.3, 0.15, 0.016, FROST, [0, 0.15, 0.03]);
  flat(b, 0.3, 0.03, 0.018, TEAL, [0, 0.18, 0.03]);
});

/** The lorry's amber beacon, on the cab roof: blinks; hot. */
export const lorryLight = looks([0.1, 0.1], 1, (b) => {
  const [x, y, z] = LORRY_BEACON;
  b.cylinder(0.04, 0.045, 0.03, 0x5a3a10, { at: [x, y + 0.015, z] }, 8);
  b.led(0.05, 0xffa020, { at: [x, y + 0.05, z] });
});

/**
 * A handful of tiny people far below, `n` of them in a loose crowd about
 * `spread` across, standing round: greyed shirts, some carrying a desk box
 * or a partition panel (`look` 0: desk boxes, MONOLITH's staff outside its
 * tower; 1: panels, removal men at a lorry). About 0.2 high.
 */
export function tinyCrowd(n: number, spread: number, look: number): SetPiece {
  return once(`tinyCrowd:${n}:${spread.toFixed(2)}:${look}`, () =>
    looks([spread, spread / 2], 1, (b) => {
      for (let k = 0; k < n; k++) {
        const x = (hash01(k, look, 411) - 0.5) * spread;
        const z = (hash01(k, look, 413) - 0.5) * spread * 0.45;
        const shirt = look === 1 ? 0x3a5a7a : nth(SHIRTS, k * 3 + look);
        flat(b, 0.05, 0.08, 0.035, 0x3a3c44, [x, 0.04, z]);
        b.box(0.065, 0.075, 0.045, shirt, { at: [x, 0.115, z] }, 0.01);
        b.sphere(0.026, nth(SKINS, k), { at: [x, 0.175, z] });
        const holds = hash01(k, look, 415);
        if (look === 0 && holds < 0.75)
          flat(b, 0.075, 0.05, 0.06, mix(CARDBOARD, 0xffffff, holds * 0.2), [x, 0.125, z + 0.045]);
        if (look === 0 && holds > 0.9)
          flat(b, 0.01, 0.07, 0.01, 0x6a8a4a, [x + 0.02, 0.17, z + 0.045]);
        if (look === 1 && holds < 0.5) flat(b, 0.012, 0.2, 0.16, FRAME, [x + 0.04, 0.12, z]);
      }
    }),
  );
}

/** MONOLITH's own removal van far below: black, a white M on the side, its back doors open, boxes out. */
export const monoVan = looks([0.7, 0.3], 1, (b) => {
  b.box(0.5, 0.3, 0.28, MONO_BLACK, { at: [-0.05, 0.22, 0] }, 0.02);
  b.box(0.18, 0.2, 0.26, 0x1d1f26, { at: [0.27, 0.17, 0] }, 0.03);
  flat(b, 0.02, 0.09, 0.22, 0x34404e, [0.365, 0.22, 0]);
  letters(b, 'M', -0.05, 0.24, 0.14, 0.022, MONO_WHITE);
  for (const x of [-0.2, 0.25])
    for (const s of [-1, 1])
      b.cylinder(
        0.05,
        0.05,
        0.03,
        RUBBER,
        { at: [x, 0.05, s * 0.13], rot: [Math.PI / 2, 0, 0] },
        10,
      );
  for (const s of [-1, 1])
    flat(b, 0.015, 0.26, 0.13, MONO_BLACK, [-0.33, 0.22, s * 0.2], [0, s * 1.3, 0]);
  for (let k = 0; k < 3; k++)
    flat(b, 0.09, 0.07, 0.09, CARDBOARD, [
      -0.42 - (k % 2) * 0.1,
      0.035 + Math.floor(k / 2) * 0.07,
      (k - 1) * 0.06,
    ]);
});

/** MONOLITH's lit windows: cool grey office light in the daytime, and its dark ones. */
export const MONO_LIT = 0x6c7a8c;
const MONO_DARK = 0x0c0e12;
const MONO_SPANDREL = 0x464e58;

/** Whether MONOLITH's window `i` along floor `j` has gone dark: whole floors, and bays of three in clumps; about 40%. */
export function monoWindowOut(i: number, j: number): boolean {
  return hash01(j, 1, 421) < 0.16 || hash01(Math.floor(i / 3), j >> 1, 423) < 0.3;
}

/**
 * MONOLITH's tower going dark: a new skin for `monolithHQ(w, d, h)`'s front
 * and the side toward the room (its origin at the tower's front foot, like
 * the tower's): charcoal spandrels, and on every floor under the crown a
 * row of windows, about 60% lit cool grey and 40% dark, whole floors and
 * bays at a time (`monoWindowOut`).
 */
export function monoWindows(w: number, d: number, h: number): SetPiece {
  return once(`monoWindows:${w.toFixed(2)}:${d.toFixed(2)}:${h.toFixed(2)}`, () =>
    looks([w, 0.05], 1, (b) => {
      const row = 0.2;
      const top = h - 0.44;
      flat(b, w - 0.02, top, 0.004, MONO_SPANDREL, [0, top / 2, 0.006]);
      flat(b, 0.004, top, d - 0.02, MONO_SPANDREL, [-w / 2 - 0.006, top / 2, -d / 2]);
      const lit = (i: number, j: number) =>
        mix(MONO_LIT, 0xb8c4d2, 0.35 + hash01(i, j, 427) * 0.4 + (j % 3 === 0 ? 0.1 : 0));
      for (let y = top - row / 2, j = 0; y > 0.1; y -= row, j++) {
        for (let x = -w / 2 + 0.09, i = 0; x < w / 2 - 0.05; x += 0.14, i++)
          flat(b, 0.11, row * 0.7, 0.006, monoWindowOut(i, j) ? MONO_DARK : lit(i, j), [
            x,
            y,
            0.01,
          ]);
        for (let z = -0.09, i = 0; z > -d + 0.05; z -= 0.14, i++)
          flat(b, 0.006, row * 0.7, 0.11, monoWindowOut(i + 40, j) ? MONO_DARK : lit(i + 40, j), [
            -w / 2 - 0.01,
            y,
            z,
          ]);
      }
    }),
  );
}

/**
 * The red FOR LEASE banner hung off MONOLITH's front, `px` a letter pixel:
 * "FOR" over "LEASE" in white on red, a white border, two ropes up to its
 * top corners. Its origin at the middle of its top edge, face toward +z.
 */
export function forLease(px: number): SetPiece {
  return once(`forLease:${px}`, () =>
    looks([textWidth('LEASE') * px + 2 * px, 0.04], 1, (b) => {
      const w = (textWidth('LEASE') + 3) * px;
      const h = 13 * px;
      flat(b, w + px * 0.6, h + px * 0.6, 0.008, 0xf2eee6, [0, -h / 2, 0.004]);
      flat(b, w, h, 0.01, 0xc4362a, [0, -h / 2, 0.006]);
      letters(b, 'FOR', 0, -px * 3.5, 0.011, px, 0xf8f6f2);
      letters(b, 'LEASE', 0, -px * 9.5, 0.011, px, 0xf8f6f2);
      for (const s of [-1, 1])
        bar(b, [(s * w) / 2, 0, 0.008], [(s * w) / 2 + s * 0.02, px * 2.5, 0.008], 0.012, 0xd8d0c0);
    }),
  );
}

/**
 * MONOLITH's crown sign coming apart, the hot piece: "MONOLITH" in white
 * light, `px` a pixel, with its O and its L gone (only their dark brackets
 * left), its mark to the left; the hanging O is `danglingO`. Centred on x =
 * 0 at y = 0, face toward +z.
 */
export const BROKEN = [1, 4] as const;
export function brokenLogo(px: number): SetPiece {
  return once(`brokenLogo:${px}`, () =>
    looks([textWidth('MONOLITH') * px + px * 6, 0.05], 1, (b) => {
      const tw = textWidth('MONOLITH') * px;
      glyphs('MONOLITH', (u, r, w, k) => {
        const at: V3 = [px * 3 + u * px, (2 - r) * px, 0.004];
        if ((BROKEN as readonly number[]).includes(k)) return;
        glowBox(b, w * px, px, 0.004, MONO_WHITE, at);
      });
      for (const k of BROKEN) {
        const x = px * 3 + (k * 4 + 1.5 - textWidth('MONOLITH') / 2) * px;
        for (const y of [-1.5, 1.5]) flat(b, px * 3, px * 0.3, 0.01, 0x3a3e46, [x, y * px, 0.004]);
      }
      glowBox(b, px * 2, px * 7, 0.004, MONO_WHITE, [px * 3 - tw / 2 - px * 3, 0, 0.002]);
    }),
  );
}

/** The x of letter `k` of the broken logo's centre, from the logo's origin. */
export function brokenLetterX(px: number, k: number): number {
  return px * 3 + (k * 4 + 1.5 - textWidth('MONOLITH') / 2) * px;
}

/**
 * MONOLITH's O hanging off its crown by one corner, still lit: its origin
 * at that corner, the letter swung down below it. Hot, `sway` alive.
 */
export function danglingO(px: number): SetPiece {
  return once(`danglingO:${px}`, () =>
    looks([px * 4, 0.05], 1, (b) => {
      const turn = 0.85;
      const c = Math.cos(turn);
      const s = Math.sin(turn);
      const drop = px * 3.5;
      glyphs('O', (u, r, w) => {
        const lx = u * px - 1.5 * px;
        const ly = -(r + 0.5) * px;
        b.add(
          new THREE.BoxGeometry(w * px, px, 0.004),
          MONO_WHITE,
          {
            at: [lx * c - ly * s, lx * s + ly * c - drop, 0.004],
            rot: [0, 0, turn],
          },
          'glow',
        );
      });
      // The cable it hangs by.
      bar(b, [0, -drop, 0.004], [0, 0, 0.004], px * 0.25, 0x2a2c30);
    }),
  );
}

// ---- The setback roofs in front ----

/**
 * The partition graveyard: spare panels lying flat in a stack, wrapped in
 * plastic film, `n` stacks along x, each a different height; at most 0.3 high.
 */
export function panelGraveyard(n: number): SetPiece {
  return once(`panelGraveyard:${n}`, () =>
    looks([n * 0.75, 1.2], 1, (b) => {
      for (let k = 0; k < n; k++) {
        const x = (k - (n - 1) / 2) * 0.75;
        const count = 2 + Math.floor(hash01(k, n, 431) * 4);
        const yaw = (hash01(k, n, 433) - 0.5) * 0.3;
        for (let j = 0; j < count; j++) {
          const y = 0.03 + j * 0.05;
          const dz = (hash01(k, j, 435) - 0.5) * 0.08;
          flat(b, 0.62, 0.04, 1.1, FRAME, [x, y + 0.02, dz], [0, yaw, 0]);
          flat(b, 0.54, 0.042, 1.0, FROST, [x, y + 0.02, dz], [0, yaw, 0]);
          flat(b, 0.06, 0.044, 1.0, TEAL, [x + 0.12, y + 0.02, dz], [0, yaw, 0]);
        }
        // The film over the stack, the tape round it.
        const top = 0.03 + count * 0.05;
        b.add(
          new THREE.BoxGeometry(0.66, top, 1.14),
          0xe8eef2,
          { at: [x, top / 2, 0], rot: [0, yaw, 0] },
          'glass',
        );
        flat(b, 0.67, 0.012, 0.06, TAPE, [x, top + 0.004, 0.2], [0, yaw, 0]);
      }
      // A single panel on its own on the gravel, a castor foot off.
      flat(b, 0.6, 0.04, 1.06, FRAME, [0.1, 0.02, 0.95], [0, 1.2, 0]);
      flat(b, 0.52, 0.042, 0.96, FROST, [0.1, 0.02, 0.95], [0, 1.2, 0]);
    }),
  );
}

/** A dead pot plant, abandoned on the roof: a white pot, brown drooping leaves; 0.55 high. */
export const deadPlant = looks([0.4, 0.4], 1, (b) => {
  b.cylinder(0.15, 0.12, 0.28, 0xd8d4cc, { at: [0, 0.14, 0] }, 14);
  b.cylinder(0.14, 0.14, 0.02, 0x5a4434, { at: [0, 0.275, 0] }, 14);
  b.cylinder(0.012, 0.014, 0.26, 0x7a6a50, { at: [0, 0.4, 0] }, 6);
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    bar(
      b,
      [0, 0.4 + (k % 3) * 0.05, 0],
      [Math.cos(a) * 0.18, 0.3 - (k % 2) * 0.06, Math.sin(a) * 0.18],
      0.03,
      nth([0xa08a5a, 0x8a7448, 0xb09a68], k),
    );
  }
  flat(b, 0.12, 0.012, 0.08, 0xa08a5a, [0.2, 0.006, 0.12], [0, 0.6, 0]);
});

/** A roof access hatch, its lid propped open, a steel ladder's top rails showing; 0.45 high. */
export const roofHatch = looks([0.6, 0.6], 1, (b) => {
  b.box(0.56, 0.18, 0.56, 0x8a8e92, { at: [0, 0.09, 0] }, 0.02);
  flat(b, 0.44, 0.01, 0.44, 0x1c1e22, [0, 0.185, 0]);
  // The lid swung up and back, a stay holding it.
  flat(b, 0.52, 0.03, 0.5, 0x9a9ea2, [0, 0.36, -0.36], [-1.1, 0, 0]);
  bar(b, [0.22, 0.18, 0.12], [0.22, 0.32, -0.25], 0.015, STEEL_DARK);
  for (const s of [-1, 1]) bar(b, [s * 0.12, 0.05, 0.1], [s * 0.12, 0.42, 0.06], 0.02, 0xc8a040);
  flat(b, 0.24, 0.02, 0.02, 0xc8a040, [0, 0.42, 0.06]);
});

/** Removal crates dumped on the roof, low: two side by side, one on top skew; 0.62 high. */
export const roofCrates = looks([1.3, 0.5], 1, (b) => {
  for (const [x, y, yaw] of [
    [-0.32, 0, 0.05],
    [0.32, 0, -0.04],
    [0.02, CRATE_H, 0.35],
  ] as const) {
    b.box(0.6, 0.26, 0.4, CRATE, { at: [x, y + 0.13, 0], rot: [0, yaw, 0] }, 0.02);
    flat(b, 0.62, 0.03, 0.42, CRATE_LID, [x, y + 0.275, 0], [0, yaw, 0]);
  }
});

/**
 * The boardroom floor's good carpet, pulled up in strips and rolled: three
 * rolls lying side by side, grey-violet with the border showing at the ends,
 * taped; 0.28 high.
 */
export const carpetRolls = looks([1.2, 0.8], 1, (b) => {
  for (const [z, len, y] of [
    [-0.25, 1.1, 0.1],
    [0.0, 1.0, 0.1],
    [-0.12, 0.9, 0.27],
  ] as const) {
    b.cylinder(0.1, 0.1, len, 0x6a6478, { at: [0, y, z], rot: [0, 0, Math.PI / 2] }, 14);
    for (const s of [-1, 1])
      b.cylinder(
        0.102,
        0.102,
        0.04,
        tint(VIOLET, -0.3),
        { at: [s * (len / 2 - 0.02), y, z], rot: [0, 0, Math.PI / 2] },
        14,
      );
    flat(b, 0.05, 0.21, 0.21, TAPE, [0.15, y, z]);
  }
  // A loose strip unrolled on the gravel.
  flat(b, 0.9, 0.012, 0.22, 0x6a6478, [0.1, 0.006, 0.32], [0, 0.15, 0]);
});
