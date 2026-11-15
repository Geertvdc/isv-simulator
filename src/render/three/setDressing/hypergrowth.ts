import * as THREE from 'three';
import { type ModelBuilder, tint } from '../kit';
import { COLOR } from '../palette';
import { hash01 } from './midRise';
import { looks, nth, type SetPiece } from './shared';

/**
 * Hypergrowth's world pieces (level 3-2, scene `hypergrowth`; see
 * `docs/plan/hypergrowth-environment.md`): the ground and first floor of
 * 3-1's mid-rise on a rainy spring day, hiring faster than the desks arrive.
 * The post room behind the ground floor (pigeonholes, the franking machine,
 * the mail trolley, sacks and parcels), unopened flat-pack desk boxes and
 * violet welcome balloons, the open lift shaft between the floors (its car,
 * frame, counterweight and pit), the loading bay out into the rain (the
 * courier's van with its doors open, a pallet of desks on a pump truck, the
 * bin and an overflowing cardboard cage), the wet street (umbrellas, cars
 * with their lights on, the shops across the road, the hoarding round the
 * crane tower), rain on the glass, and Prod in a bigger pot on the landing.
 * 3-1's building pieces (`midRise.ts`) are reused by the scene, not copied.
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

/** A bar from `a` to `c`, `t` thick: a cable, a rail, a strap. */
function bar(b: ModelBuilder, a: V3, c: V3, t: number, color: number): void {
  const d = new THREE.Vector3(c[0] - a[0], c[1] - a[1], c[2] - a[2]);
  const len = d.length();
  const g = new THREE.BoxGeometry(t, len, t);
  g.applyQuaternion(
    new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()),
  );
  b.add(g, color, { at: [(a[0] + c[0]) / 2, (a[1] + c[1]) / 2, (a[2] + c[2]) / 2] });
}

// ---- Colors ----

/** Flat-pack desk boxes: a muted cardboard, darker than every station top. */
export const BOX = 0xa88a62;
const BOX_EDGE = tint(BOX, -0.14);
const BOX_TAPE = 0xbca27a;
const BOX_INK = 0x4e3e2c;
/** YOTTA violet, and the white of the welcome balloons. */
export const VIOLET = 0x8a64d8;
const BALLOON_WHITE = 0xe8e6ee;
/** The raised floors' slab edge, under the finish. */
const SLAB_EDGE = 0x8a8478;
/** Painted block (the post room and the landing), its coping. */
const BLOCK = 0xb4bab2;
const COPING = 0xc6ccd0;
/** The shaft's dark concrete, its steel. */
const SHAFT = 0x55595e;
const RAIL = 0x6e767e;
const HAZARD = 0xd2a832;
/** The lift car's brushed steel. */
const CAR_STEEL = 0xa4acb2;
const INK = 0x24262a;
const GLASS_DARK = 0x2e3a48;
const HEADLIGHT = COLOR.headlight;
const TAIL = COLOR.tailLight;
const AMBER = 0xffa630;

// ---- Lettering ----

/** A blocky alphabet, 3 wide and 5 high, with the letters these signs need. */
const FONT: Readonly<Record<string, string>> = {
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
  R: '110101110101101',
  S: '011100010001110',
  T: '111010010010010',
  U: '101101101101111',
  W: '101101111111101',
  Y: '101101010010010',
  '0': '111101101101111',
  '1': '010110010010111',
  '-': '000000111000000',
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

/** Letters for `text` centred on (x, y) on a face at depth z facing +z, each pixel `px` square. */
function letters(
  b: ModelBuilder,
  text: string,
  x: number,
  y: number,
  z: number,
  px: number,
  color: number,
): void {
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
        const left = x + (k * 4 + c - cols / 2) * px;
        flat(b, (e - c) * px, px, 0.006, color, [left + ((e - c) * px) / 2, y + (2 - r) * px, z]);
        c = e;
      }
    }
  });
}

// ---- Desk boxes and balloons ----

/** One flat-pack desk box lying flat, centred at (x, y, z), turned `yaw`: tape, the desk drawn on top, DESK on its front. */
function deskBox(b: ModelBuilder, x: number, y: number, z: number, yaw: number, shade: number) {
  const w = 1.1;
  const h = 0.11;
  const d = 0.6;
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  /** A point in the box's own frame (u along its length, v across), in the piece. */
  const P = (u: number, yy: number, v: number): V3 => [x + u * c + v * s, yy, z - u * s + v * c];
  b.box(w, h, d, tint(BOX, shade), { at: [x, y, z], rot: [0, yaw, 0] }, 0.012);
  flat(b, w + 0.004, h * 0.5, 0.004, BOX_EDGE, P(0, y - h * 0.15, d / 2 + 0.002), [0, yaw, 0]);
  // Tape along the seam, the desk outline and its legs printed on top.
  flat(b, w + 0.01, 0.006, 0.05, BOX_TAPE, P(0, y + h / 2 + 0.002, 0), [0, yaw, 0]);
  const top = y + h / 2 + 0.003;
  for (const v of [-0.17, 0.17])
    flat(b, 0.56, 0.003, 0.012, BOX_INK, P(-0.12, top, v), [0, yaw, 0]);
  for (const u of [-0.4, 0.16]) flat(b, 0.012, 0.003, 0.35, BOX_INK, P(u, top, 0), [0, yaw, 0]);
  // DESK on the long side facing the camera.
  const lx = 0.3;
  const lz = d / 2 + 0.004;
  const px = 0.018;
  const cols = textWidth('DESK');
  Array.from('DESK').forEach((ch, k) => {
    const glyph = FONT[ch] ?? '';
    for (let r = 0; r < 5; r++)
      for (let cc = 0; cc < 3; cc++)
        if (glyph[r * 3 + cc] === '1')
          flat(
            b,
            px,
            px,
            0.004,
            BOX_INK,
            P(lx + (k * 4 + cc - cols / 2 + 0.5) * px, y + (2 - r) * px * 0.9, lz),
            [0, yaw, 0],
          );
  });
}

/**
 * Unopened flat-pack desk boxes stacked flat, 1 to 3 high by look (`v` % 3 + 1),
 * each a little askew, about 1.2 × 0.7.
 */
export const deskBoxStack = looks([1.2, 0.7], 6, (b, v) => {
  const n = (v % 3) + 1;
  for (let k = 0; k < n; k++) {
    const yaw = (hash01(k, v, 3) - 0.5) * 0.16;
    const dx = (hash01(k, v, 5) - 0.5) * 0.08;
    const dz = (hash01(k, v, 7) - 0.5) * 0.06;
    deskBox(b, dx, 0.055 + k * 0.112, dz, yaw, (hash01(k, v, 9) - 0.5) * 0.08);
  }
});

/**
 * Flat-pack desk boxes standing on their long edge against a wall, 3 or 4 of
 * them leaning back on each other, their fronts (+z) printed FLAT-PACK with
 * the desk drawn; about 1.15 × 0.4, 0.62 high.
 */
export const deskBoxesUpright = looks([1.2, 0.4], 3, (b, v) => {
  const n = 3 + (v % 2);
  for (let k = 0; k < n; k++) {
    const z = -k * 0.115 + (n - 1) * 0.06;
    const lean = -0.1 - k * 0.01;
    const c = tint(BOX, (hash01(k, v, 11) - 0.5) * 0.1 - k * 0.03);
    const x = (hash01(k, v, 13) - 0.5) * 0.08;
    b.box(1.1, 0.6, 0.11, c, { at: [x, 0.3, z], rot: [lean, 0, 0] }, 0.012);
    flat(b, 0.04, 0.6, 0.114, BOX_TAPE, [x + 0.3, 0.3, z], [lean, 0, 0]);
    if (k === n - 1) {
      // The front box: its print.
      const fz = z + 0.06;
      for (const y of [0.42, 0.24]) flat(b, 0.42, 0.012, 0.004, BOX_INK, [x - 0.18, y, fz]);
      for (const dx of [-0.38, 0.02]) flat(b, 0.012, 0.18, 0.004, BOX_INK, [x + dx, 0.33, fz]);
      letters(b, 'FLAT-PACK', x + 0.02, 0.12, fz, 0.016, BOX_INK);
    }
  }
});

/** A welcome balloon (`bob` alive) tied at its foot: a ribbon up to a violet (look 0) or white (look 1) balloon. */
export const welcomeBalloon = looks([0.3, 0.3], 2, (b, v) => {
  const c = v % 2 ? BALLOON_WHITE : VIOLET;
  bar(b, [0, 0, 0], [0.04, 0.6, 0.02], 0.007, 0xe8e4dc);
  b.sphere(0.12, c, { at: [0.04, 0.74, 0.02] }, [1, 1.15, 0.95]);
  b.cone(0.022, 0.035, c, { at: [0.04, 0.6, 0.02], rot: [Math.PI, 0, 0] }, 6);
  // A highlight.
  b.sphere(0.03, tint(c, 0.45), { at: [0.0, 0.8, 0.1] });
});

// ---- The post room ----

/**
 * The post room's pigeonholes: an oak-edged grey carcass `cols` cubbies wide
 * (0.24 each) and 4 high against a wall, facing +z, post in some of them,
 * a name label under each; 1.0 high.
 */
export function pigeonholes(cols: number): SetPiece {
  return once(`pigeonholes:${cols}`, () =>
    looks([cols * 0.24 + 0.04, 0.34], 1, (b) => {
      const w = cols * 0.24 + 0.04;
      const H = 1.0;
      const carcass = 0xb0aca2;
      flat(b, w, H, 0.04, tint(carcass, -0.2), [0, H / 2, -0.15]);
      flat(b, w, 0.04, 0.32, carcass, [0, 0.02, 0]);
      flat(b, w, 0.04, 0.32, carcass, [0, H - 0.02, 0]);
      for (let i = 0; i <= cols; i++)
        flat(b, 0.02, H, 0.32, carcass, [-w / 2 + 0.02 + i * 0.24, H / 2, 0]);
      for (let r = 1; r < 4; r++) flat(b, w, 0.015, 0.32, carcass, [0, 0.04 + r * 0.235, 0]);
      for (let i = 0; i < cols; i++)
        for (let r = 0; r < 4; r++) {
          const cx = -w / 2 + 0.14 + i * 0.24;
          const y = 0.05 + r * 0.235;
          flat(b, 0.12, 0.012, 0.004, 0xe8e4d8, [cx, y + 0.012, 0.162]);
          const k = hash01(i, r, 17);
          if (k < 0.55) {
            // Envelopes and a padded bag poking out.
            const c = nth([0xece8dc, 0xd8c49a, 0xe4dcc8], i + r);
            flat(b, 0.18, 0.05 + k * 0.1, 0.22, c, [cx, y + 0.06 + k * 0.04, 0.03], [0.4, 0, 0]);
          }
        }
    }),
  );
}

/** The franking machine on a low grey cabinet: a stack of envelopes beside it, its little red display lit. */
export const frankingMachine = looks([0.7, 0.5], 1, (b) => {
  flat(b, 0.66, 0.5, 0.46, 0x8c9094, [0, 0.25, 0]);
  flat(b, 0.62, 0.02, 0.005, 0x6a6e72, [0, 0.36, 0.232]);
  b.box(0.36, 0.14, 0.3, 0x5c6066, { at: [-0.1, 0.57, 0] }, 0.03);
  flat(b, 0.32, 0.03, 0.12, 0x3a3e44, [-0.1, 0.62, 0.08]);
  b.led(0.012, 0xff4a3a, { at: [-0.02, 0.645, 0.1] });
  b.led(0.012, 0x5cd88a, { at: [0.02, 0.645, 0.1] });
  // The envelopes.
  for (let k = 0; k < 4; k++)
    flat(b, 0.22, 0.012, 0.12, nth([0xece8dc, 0xe0d8c4], k), [
      0.2 + (k % 2) * 0.01,
      0.506 + k * 0.013,
      0.02,
    ]);
});

/** A mail trolley: a grey cage on castors with a canvas bag of post and a parcel on top, handle at −x. */
export const mailTrolley = looks([0.8, 0.5], 1, (b) => {
  const frame = 0x7a8086;
  for (const [x, z] of [
    [-0.32, -0.2],
    [0.32, -0.2],
    [-0.32, 0.2],
    [0.32, 0.2],
  ] as const) {
    b.cylinder(0.04, 0.04, 0.03, INK, { at: [x, 0.04, z], rot: [Math.PI / 2, 0, 0] }, 8);
    flat(b, 0.02, 0.6, 0.02, frame, [x, 0.36, z]);
  }
  flat(b, 0.68, 0.02, 0.44, frame, [0, 0.1, 0]);
  for (const z of [-0.2, 0.2]) flat(b, 0.66, 0.02, 0.02, frame, [0, 0.64, z]);
  // The bag inside, sagging, full of post.
  b.box(0.6, 0.42, 0.38, 0x8a8e88, { at: [0, 0.38, 0] }, 0.06);
  for (let k = 0; k < 5; k++)
    flat(
      b,
      0.16,
      0.012,
      0.11,
      nth([0xece8dc, 0xd8c49a], k),
      [-0.2 + k * 0.1, 0.6 + (k % 2) * 0.01, (hash01(k, 1, 3) - 0.5) * 0.2],
      [0, k * 0.5, 0.1],
    );
  b.box(0.24, 0.12, 0.18, 0xb08c62, { at: [0.12, 0.66, 0.04], rot: [0, 0.3, 0] }, 0.01);
  // The handle.
  bar(b, [-0.34, 0.62, -0.2], [-0.44, 0.92, -0.2], 0.025, frame);
  bar(b, [-0.34, 0.62, 0.2], [-0.44, 0.92, 0.2], 0.025, frame);
  flat(b, 0.03, 0.03, 0.44, INK, [-0.44, 0.92, 0]);
});

/** Grey mail sacks, slumped, 2 to 4 by look, their necks tied, a brass tag on one. */
export const mailSacks = looks([0.8, 0.6], 3, (b, v) => {
  const n = 2 + (v % 3);
  for (let k = 0; k < n; k++) {
    const a = k * 2.2 + v;
    const r = k === 0 ? 0 : 0.2;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r * 0.7;
    const c = tint(0x8a8c8a, (hash01(k, v, 21) - 0.5) * 0.12);
    b.sphere(0.2, c, { at: [x, 0.16, z] }, [1.15, 0.8, 0.95]);
    b.cylinder(0.04, 0.07, 0.1, tint(c, -0.1), { at: [x + 0.12, 0.3, z], rot: [0, 0, -0.9] }, 8);
    if (k === 0) flat(b, 0.05, 0.004, 0.035, 0xc8a85a, [x + 0.2, 0.33, z + 0.02]);
  }
});

/** Parcels: a few cardboard boxes with white labels and tape, and a padded envelope, by look. */
export const parcels = looks([0.6, 0.5], 3, (b, v) => {
  const sizes: [number, number, number][] = [
    [0.34, 0.22, 0.28],
    [0.24, 0.16, 0.2],
    [0.2, 0.12, 0.16],
  ];
  let y = 0;
  sizes.forEach(([w, h, d], k) => {
    const x = k === 2 ? 0.2 : (k - 0.5) * 0.06;
    const yy = k === 1 ? y : 0;
    const yaw = (hash01(k, v, 23) - 0.5) * 0.8;
    const c = tint(0xb08c62, (hash01(k, v, 25) - 0.5) * 0.12);
    b.box(w, h, d, c, { at: [x, yy + h / 2, k === 2 ? 0.12 : 0], rot: [0, yaw, 0] }, 0.01);
    flat(b, w + 0.004, 0.004, 0.04, BOX_TAPE, [x, yy + h + 0.002, k === 2 ? 0.12 : 0], [0, yaw, 0]);
    flat(
      b,
      0.09,
      0.004,
      0.06,
      0xf0ece4,
      [x - w * 0.18, yy + h + 0.004, (k === 2 ? 0.12 : 0) + 0.06],
      [0, yaw, 0],
    );
    if (k === 0) y = h;
  });
  if (v !== 1)
    b.box(0.3, 0.04, 0.22, 0xd8c48a, { at: [-0.18, 0.02, 0.18], rot: [0, 0.4 + v, 0] }, 0.015);
});

/** The POST ROOM sign: a dark grey plaque, white letters, facing +z, its back on a wall at z = 0. */
export const postRoomSign = looks([1.0, 0.05], 1, (b) => {
  flat(b, 0.86, 0.2, 0.03, 0x3a3e44, [0, 0, 0.015]);
  letters(b, 'POST ROOM', 0, 0, 0.033, 0.022, 0xe8eaec);
});

/**
 * A welcome pack: a violet tote bag with white handles and a white Y, held
 * in front (carried) or at the side, its origin at the hand.
 */
export const toteBag = looks([0.3, 0.1], 1, (b) => {
  b.box(0.26, 0.28, 0.08, VIOLET, { at: [0, -0.18, 0] }, 0.02);
  b.torus(0.07, 0.008, 0xe8e4ee, { at: [0, -0.04, 0.02], rot: [0, 0, 0] }, Math.PI);
  b.torus(0.07, 0.008, 0xe8e4ee, { at: [0, -0.04, -0.02], rot: [0, 0, 0] }, Math.PI);
  flat(b, 0.02, 0.06, 0.004, 0xf0eef4, [0, -0.2, 0.042]);
  flat(b, 0.05, 0.016, 0.004, 0xf0eef4, [0, -0.16, 0.042]);
  // Lanyards and a notebook poking out of the top.
  flat(b, 0.12, 0.06, 0.03, 0xe8e6e0, [0.04, -0.03, 0]);
});

/** A balloon held on a string, its origin at the hand: a violet one floating 0.8 above. */
export const heldBalloon = looks([0.3, 0.3], 1, (b) => {
  bar(b, [0, 0, 0], [0.06, 0.78, -0.04], 0.006, 0xe8e4dc);
  b.sphere(0.13, VIOLET, { at: [0.06, 0.92, -0.04] }, [1, 1.15, 0.95]);
  b.cone(0.022, 0.035, VIOLET, { at: [0.06, 0.78, -0.04], rot: [Math.PI, 0, 0] }, 6);
  b.sphere(0.03, tint(VIOLET, 0.45), { at: [0.02, 0.98, 0.06] });
});

/** A desk part's box carried at chest height: cardboard, taped, a label, its origin at its middle. */
export const carriedBox = looks([0.5, 0.3], 1, (b) => {
  b.box(0.5, 0.2, 0.3, BOX, { at: [0, 0, 0] }, 0.012);
  flat(b, 0.504, 0.006, 0.05, BOX_TAPE, [0, 0.1, 0]);
  flat(b, 0.1, 0.004, 0.07, 0xf0ece4, [0.14, 0.102, 0.06]);
});

// ---- Floors and walls ----

/** How high the raised floors stand off the ground: the level's floor. */
export const FLOOR = 0.45;

/** The finishes a raised floor comes in. */
export type Finish = 'lino' | 'carpet' | 'landing';

const FINISH: Readonly<Record<Finish, { base: number; tile: number }>> = {
  lino: { base: 0xc2bfb2, tile: 0.5 },
  carpet: { base: 0x8a929c, tile: 0.5 },
  landing: { base: 0x9a9c98, tile: 0.6 },
};

/**
 * A floor raised to the level's (the post room's pale lino, the strip of
 * carpet by the glass, the landing's painted concrete): a slab `w` × `d`
 * centred on its origin, `FLOOR` high, its top in tiles, each its own tone.
 */
export function raisedFloor(w: number, d: number, finish: Finish): SetPiece {
  return once(`floor:${w.toFixed(2)}:${d.toFixed(2)}:${finish}`, () =>
    looks([w, d], 1, (b) => {
      const { base, tile } = FINISH[finish];
      flat(b, w, FLOOR - 0.01, d, SLAB_EDGE, [0, (FLOOR - 0.01) / 2, 0]);
      flat(b, w, 0.006, d, tint(base, -0.18), [0, FLOOR - 0.008, 0]);
      for (let j = 0, z = -d / 2; z < d / 2 - 0.01; j++, z += tile)
        for (let i = 0, x = -w / 2; x < w / 2 - 0.01; i++, x += tile) {
          const xb = Math.min(w / 2, x + tile);
          const zb = Math.min(d / 2, z + tile);
          const shade = (hash01(i, j, 31 + w * 7) - 0.5) * 0.08 + ((i + j) % 2 ? -0.02 : 0.015);
          flat(b, xb - x - 0.012, 0.006, zb - z - 0.012, tint(base, shade), [
            (x + xb) / 2,
            FLOOR - 0.003,
            (z + zb) / 2,
          ]);
        }
      if (finish === 'landing')
        // A yellow safety edge along the landing's front.
        flat(b, w - 0.04, 0.006, 0.05, HAZARD, [0, FLOOR, d / 2 - 0.05]);
    }),
  );
}

/**
 * A painted block wall `len` long along +x from x = 0, `h` high from the
 * ground, 0.18 thick: a dark plinth, coursing grooves every 0.2 with
 * staggered joints on the face toward +z, a cool concrete coping with a lip.
 */
export function blockWall(len: number, h: number): SetPiece {
  return once(`block:${len.toFixed(2)}:${h.toFixed(2)}`, () =>
    looks([len, 0.2], 1, (b) => {
      flat(b, len, h - 0.04, 0.18, BLOCK, [len / 2, (h - 0.04) / 2, 0]);
      flat(b, len + 0.02, 0.12, 0.2, tint(BLOCK, -0.25), [len / 2, 0.06, 0]);
      flat(b, len + 0.04, 0.05, 0.24, COPING, [len / 2, h - 0.02, 0]);
      const groove = tint(BLOCK, -0.16);
      for (let k = 1, y = 0.12; y < h - 0.08; k++, y += 0.2) {
        flat(b, len, 0.012, 0.004, groove, [len / 2, y, 0.091]);
        for (let x = (k % 2) * 0.2 + 0.2; x < len - 0.02; x += 0.4)
          flat(b, 0.012, 0.2, 0.004, groove, [x, y + 0.1, 0.091]);
      }
    }),
  );
}

/**
 * The lift shaft's dark concrete wall, `len` along +x from 0, `h` high, its
 * face toward +z: formwork panel lines, rows of tie holes, a damp stain.
 */
export function shaftWall(len: number, h: number): SetPiece {
  return once(`shaftWall:${len.toFixed(2)}:${h.toFixed(2)}`, () =>
    looks([len, 0.2], 1, (b) => {
      flat(b, len, h, 0.2, SHAFT, [len / 2, h / 2, 0]);
      flat(b, len + 0.02, 0.04, 0.22, tint(SHAFT, 0.15), [len / 2, h - 0.02, 0]);
      const line = tint(SHAFT, -0.2);
      for (let y = 0.6; y < h - 0.1; y += 0.6) flat(b, len, 0.01, 0.004, line, [len / 2, y, 0.101]);
      for (let x = 0.6; x < len; x += 1.2) flat(b, 0.01, h, 0.004, line, [x, h / 2, 0.101]);
      for (let y = 0.3; y < h - 0.1; y += 0.6)
        for (let x = 0.3; x < len; x += 0.6)
          b.cylinder(
            0.018,
            0.018,
            0.006,
            tint(SHAFT, -0.28),
            {
              at: [x, y, 0.102],
              rot: [Math.PI / 2, 0, 0],
            },
            6,
          );
      flat(b, 0.5, h * 0.5, 0.004, tint(SHAFT, -0.1), [len * 0.3, h * 0.3, 0.103]);
      // Rails up it, a conduit with a pit light, the shaft's number stencilled.
      for (const x of [len * 0.62, len * 0.82]) flat(b, 0.05, h, 0.05, RAIL, [x, h / 2, 0.12]);
      flat(b, 0.03, h, 0.03, 0x8a8478, [0.25, h / 2, 0.12]);
      flat(b, 0.12, 0.06, 0.06, 0x3a3e44, [0.25, 0.9, 0.14]);
      b.led(0.03, 0xfff0c8, { at: [0.25, 0.86, 0.17] });
      letters(b, 'LIFT 1', len * 0.38, h * 0.62, 0.104, 0.05, tint(SHAFT, 0.32));
    }),
  );
}

// ---- The lift ----

/** The lift car's size, and where its frame's header and its counterweight hang. */
export const LIFT = {
  carW: 1.5,
  carD: 1.15,
  carH: 1.0,
  header: 1.05,
  rails: 0.88,
  cwBack: 0.78,
} as const;

/**
 * The lift car, parked: brushed steel sides, the darker roof seen from above
 * with its crosshead and rope hitch, a yellow top-of-car railing along the
 * back and sides, the inspection box with its red stop button, a work lamp,
 * the toe guard under it; origin at its floor's middle, doors toward ±x.
 */
export const liftCar = looks([LIFT.carW, LIFT.carD], 1, (b) => {
  const { carW: w, carD: d, carH: h } = LIFT;
  flat(b, w, h, d, CAR_STEEL, [0, h / 2, 0]);
  flat(b, w + 0.02, 0.06, d + 0.02, tint(CAR_STEEL, -0.3), [0, 0.03, 0]);
  // The brushed sheen: vertical panel lines on the front.
  for (let x = -w / 2 + 0.3; x < w / 2; x += 0.3)
    flat(b, 0.01, h - 0.1, 0.004, tint(CAR_STEEL, -0.12), [x, h / 2, d / 2 + 0.002]);
  flat(b, w * 0.9, 0.14, 0.004, tint(CAR_STEEL, 0.25), [0, h * 0.7, d / 2 + 0.003]);
  // The roof.
  flat(b, w - 0.04, 0.02, d - 0.04, 0x6c7278, [0, h + 0.01, 0]);
  flat(b, w + 0.04, 0.12, 0.14, 0x3e4248, [0, h + 0.08, 0]);
  b.box(0.2, 0.08, 0.2, 0x4a4e54, { at: [0, h + 0.16, 0] }, 0.01);
  // The railing: posts and a top rail, along the back and both sides.
  const rail = 0xc8a032;
  const rh = 0.4;
  for (const [x, z] of [
    [-w / 2 + 0.04, -d / 2 + 0.04],
    [w / 2 - 0.04, -d / 2 + 0.04],
    [-w / 2 + 0.04, d / 2 - 0.2],
    [w / 2 - 0.04, d / 2 - 0.2],
    [0, -d / 2 + 0.04],
  ] as const)
    flat(b, 0.03, rh, 0.03, rail, [x, h + rh / 2, z]);
  flat(b, w - 0.04, 0.03, 0.03, rail, [0, h + rh, -d / 2 + 0.04]);
  for (const x of [-w / 2 + 0.04, w / 2 - 0.04])
    flat(b, 0.03, 0.03, d - 0.24, rail, [x, h + rh, -0.08]);
  // The inspection box with its stop button, a work lamp.
  flat(b, 0.2, 0.14, 0.12, 0xd8b034, [w / 2 - 0.22, h + 0.09, d / 2 - 0.16]);
  b.cylinder(0.03, 0.03, 0.02, 0xc83a2e, { at: [w / 2 - 0.22, h + 0.17, d / 2 - 0.16] }, 10);
  b.box(0.14, 0.08, 0.1, 0x3a3e44, { at: [-w / 2 + 0.2, h + 0.06, d / 2 - 0.18] }, 0.01);
  b.led(0.025, 0xfff0c8, { at: [-w / 2 + 0.2, h + 0.06, d / 2 - 0.12] });
  // The toe guard hanging under the door sides.
  for (const s of [-1, 1]) flat(b, 0.02, 0.3, d * 0.9, 0x6a7076, [s * (w / 2 - 0.01), -0.15, 0]);
});

/**
 * The lift's frame in the open shaft, its origin at the pit floor under the
 * car: two guide rails up from the pit to a steel header `top` high, the
 * motor housing and its sheave on the header, the ropes down to the car's
 * hitch (`carTop` high), the counterweight on its own pair of rails behind,
 * hanging low (`cwY`), its ropes up to the sheave; spring buffers in the pit.
 */
export function liftFrame(top: number, carTop: number, cwY: number): SetPiece {
  return once(`liftFrame:${top}:${carTop}:${cwY}`, () =>
    looks([LIFT.rails * 2 + 0.2, LIFT.carD + LIFT.cwBack], 1, (b) => {
      const r = LIFT.rails;
      const zc = -LIFT.cwBack;
      // The car's guide rails and their wall brackets.
      for (const s of [-1, 1]) {
        flat(b, 0.06, top, 0.08, RAIL, [s * r, top / 2, 0]);
        flat(b, 0.02, top, 0.12, tint(RAIL, 0.2), [s * (r - 0.03), top / 2, 0]);
        for (let y = 0.6; y < top; y += 0.9) flat(b, 0.14, 0.04, 0.14, INK, [s * (r + 0.05), y, 0]);
      }
      // The header beam, its motor housing (a grey box), the sheave and the brake.
      flat(b, r * 2 + 0.2, 0.16, 0.18, 0x4a4e54, [0, top + 0.08, 0]);
      flat(b, r * 2 + 0.2, 0.12, 0.14, 0x4a4e54, [0, top + 0.06, zc]);
      for (const s of [-1, 1])
        flat(b, 0.12, 0.12, -zc + 0.1, 0x4a4e54, [s * r, top + 0.06, zc / 2]);
      b.box(0.6, 0.34, 0.5, 0x5e6e6a, { at: [-0.18, top + 0.33, zc / 2] }, 0.04);
      flat(b, 0.5, 0.04, 0.4, tint(0x5e6e6a, 0.15), [-0.18, top + 0.51, zc / 2]);
      b.cylinder(
        0.17,
        0.17,
        0.08,
        0x3a3e44,
        {
          at: [0.2, top + 0.3, zc / 2],
          rot: [0, 0, Math.PI / 2],
        },
        18,
      );
      b.cylinder(
        0.06,
        0.06,
        0.1,
        0xb8bec4,
        {
          at: [0.2, top + 0.3, zc / 2],
          rot: [0, 0, Math.PI / 2],
        },
        10,
      );
      // A yellow-black hazard band along the header.
      for (let x = -r; x < r; x += 0.2)
        flat(b, 0.1, 0.16, 0.004, HAZARD, [x + 0.05, top + 0.08, 0.092], [0, 0, 0.6]);
      // The ropes: four down to the car's hitch, two to the counterweight.
      const steel = 0x9aa2a8;
      for (const dz of [-0.06, -0.02, 0.02, 0.06])
        bar(b, [0.2, top + 0.14, zc / 2 + 0.17 + dz], [0.02, carTop + 0.2, dz], 0.012, steel);
      for (const dz of [-0.03, 0.03])
        bar(b, [0.36, top + 0.14, zc / 2 - 0.15 + dz], [0.36, cwY + 0.85, zc + dz], 0.012, steel);
      // The counterweight: a frame of grey plates between two thin rails.
      for (const s of [-1, 1]) flat(b, 0.04, top, 0.05, RAIL, [0.36 + s * 0.32, top / 2, zc]);
      flat(b, 0.56, 0.8, 0.2, 0x3e4248, [0.36, cwY + 0.4, zc]);
      for (let y = 0.08; y < 0.75; y += 0.1)
        flat(b, 0.5, 0.08, 0.22, nth([0x6a6e72, 0x5e6266], Math.round(y * 10)), [
          0.36,
          cwY + y,
          zc,
        ]);
      // The spring buffers on the pit floor, in yellow.
      for (const x of [-0.4, 0.4]) {
        b.cylinder(0.08, 0.1, 0.06, 0x3a3e44, { at: [x, 0.03, 0] }, 10);
        b.cylinder(0.06, 0.06, 0.28, HAZARD, { at: [x, 0.2, 0] }, 10);
      }
    }),
  );
}

/** The pit ladder: two steel stiles and rungs, against a wall (its back at z = 0), `h` high. */
export function pitLadder(h: number): SetPiece {
  return once(`pitLadder:${h}`, () =>
    looks([0.4, 0.1], 1, (b) => {
      for (const x of [-0.16, 0.16]) flat(b, 0.03, h, 0.03, HAZARD, [x, h / 2, 0.06]);
      for (let y = 0.15; y < h; y += 0.22) flat(b, 0.32, 0.02, 0.02, 0x8a9096, [0, y, 0.06]);
    }),
  );
}

// ---- The loading bay ----

/**
 * The courier's van, backed up to the bay: along x, its cab at +x, its rear
 * doors at −x swung wide open, desk boxes in the back and one at the edge.
 * White with a teal courier stripe down both sides and across the roof, dark
 * windscreen and windows, roof ribs, headlights and tail lights, black
 * wheels; about 1.95 × 0.84, 1.15 high.
 */
export const deliveryVan = looks([2.0, 0.9], 1, (b) => {
  const white = 0xdcdedf;
  const stripe = 0x2f7f86;
  const roof = 0xe8eaeb;
  const half = 0.41;
  // The wheels.
  for (const [x, z] of [
    [-0.6, half - 0.04],
    [0.58, half - 0.04],
    [-0.6, -half + 0.04],
    [0.58, -half + 0.04],
  ] as const) {
    b.cylinder(0.17, 0.17, 0.12, INK, { at: [x, 0.17, z], rot: [Math.PI / 2, 0, 0] }, 14);
    b.cylinder(0.08, 0.08, 0.13, 0x9aa0a6, { at: [x, 0.17, z], rot: [Math.PI / 2, 0, 0] }, 10);
  }
  // The cargo box and the cab, the bonnet.
  b.box(1.3, 0.9, half * 2, white, { at: [-0.3, 0.68, 0] }, 0.05);
  b.box(0.52, 0.74, half * 2 - 0.02, white, { at: [0.6, 0.6, 0] }, 0.08);
  b.box(0.2, 0.36, half * 2 - 0.04, white, { at: [0.88, 0.42, 0] }, 0.06);
  flat(b, 0.04, 0.12, half * 2 - 0.08, 0x3a3e44, [0.985, 0.36, 0]);
  // The windscreen, sloped back over the cab, and the side windows.
  b.pane(0.36, 0.02, half * 2 - 0.1, GLASS_DARK, { at: [0.72, 0.86, 0], rot: [0, 0, -0.75] });
  flat(b, 0.3, 0.24, half * 2 - 0.12, GLASS_DARK, [0.72, 0.84, 0], [0, 0, -0.75]);
  for (const s of [-1, 1]) flat(b, 0.26, 0.2, 0.01, GLASS_DARK, [0.58, 0.82, s * (half - 0.005)]);
  // The roof: pale, ribbed, the stripe across it, a vent.
  flat(b, 1.26, 0.02, half * 2 - 0.04, roof, [-0.3, 1.14, 0]);
  for (let x = -0.85; x < 0.3; x += 0.2)
    flat(b, 0.03, 0.02, half * 2 - 0.08, 0xc8ccce, [x, 1.16, 0]);
  flat(b, 0.16, 0.025, half * 2 + 0.004, stripe, [0.22, 1.15, 0]);
  b.box(0.2, 0.05, 0.16, 0xc0c4c6, { at: [-0.55, 1.18, 0.1] }, 0.01);
  // The courier stripe down both sides, the step and the mirrors.
  for (const s of [-1, 1]) {
    flat(b, 1.86, 0.1, 0.006, stripe, [-0.06, 0.52, s * (half + 0.003)]);
    flat(b, 1.86, 0.025, 0.006, tint(stripe, 0.4), [-0.06, 0.6, s * (half + 0.003)]);
    flat(b, 0.06, 0.1, 0.05, INK, [0.74, 0.84, s * (half + 0.05)]);
  }
  // Headlights and tail lights.
  for (const s of [-1, 1]) {
    b.led(0.045, HEADLIGHT, { at: [0.99, 0.48, s * 0.3] });
    b.led(0.04, TAIL, { at: [-0.96, 0.62, s * (half - 0.04)] });
  }
  // Open: the dark load space, desk boxes stacked in it, one sliding off the edge.
  flat(b, 0.02, 0.78, half * 2 - 0.08, 0x2a2c30, [-0.955, 0.66, 0]);
  for (let k = 0; k < 3; k++)
    b.box(
      0.6,
      0.1,
      0.62,
      tint(BOX, -0.05 - k * 0.03),
      {
        at: [-0.62, 0.31 + k * 0.105, (k - 1) * 0.02],
        rot: [0, (k - 1) * 0.06, 0],
      },
      0.01,
    );
  b.box(0.36, 0.1, 0.6, tint(BOX, 0.03), { at: [-0.86, 0.31, 0.02], rot: [0, 0, -0.05] }, 0.01);
  flat(b, 0.4, 0.006, 0.04, BOX_TAPE, [-0.86, 0.365, 0.02]);
  // The rear doors, swung wide (about 120°), on their hinges at the rear corners.
  const phi = 2.1;
  for (const s of [-1, 1]) {
    const dx = -Math.sin(phi);
    const dz = -s * Math.cos(phi);
    const hx = -0.96;
    const hz = s * half;
    const yaw = Math.atan2(-dz, dx);
    b.box(
      0.4,
      0.86,
      0.035,
      white,
      {
        at: [hx + dx * 0.2, 0.68, hz + dz * 0.2],
        rot: [0, yaw, 0],
      },
      0.015,
    );
    flat(b, 0.3, 0.3, 0.04, GLASS_DARK, [hx + dx * 0.2, 0.92, hz + dz * 0.2], [0, yaw, 0]);
    flat(b, 0.42, 0.08, 0.04, stripe, [hx + dx * 0.2, 0.52, hz + dz * 0.2], [0, yaw, 0]);
  }
});

/** The van's hazard lights (`blink` alive, `hot`), at its four corners: amber in small housings. */
export const vanHazards = looks([2.0, 0.9], 1, (b) => {
  for (const [x, y, z] of [
    [0.99, 0.52, 0.36],
    [0.99, 0.52, -0.36],
    [-0.97, 1.0, 0.38],
    [-0.97, 1.0, -0.38],
  ] as const) {
    flat(b, 0.04, 0.05, 0.08, 0x3a3e44, [x, y, z]);
    b.led(0.05, AMBER, { at: [x + Math.sign(x) * 0.02, y, z] });
  }
});

/**
 * The dock canopy over the loading bay: `len` along +x from 0 (along the
 * wall), sticking out 0.5 toward +z, 1.25 up: slim dark steel brackets off
 * the wall, a clear polycarbonate roof (so the van's back shows through it)
 * in a dark frame with a gutter, and a lamp lit under it.
 */
export function dockCanopy(len: number): SetPiece {
  return once(`canopy:${len.toFixed(2)}`, () =>
    looks([len, 0.5], 1, (b) => {
      const y = 1.25;
      const out = 0.5;
      for (const x of [0.04, len / 2, len - 0.04]) {
        flat(b, 0.04, 0.04, out, INK, [x, y, out / 2]);
        bar(b, [x, y - 0.35, 0.02], [x, y - 0.03, out * 0.6], 0.03, INK);
      }
      flat(b, len, 0.04, 0.04, INK, [len / 2, y, 0.02]);
      flat(b, len, 0.05, 0.05, 0x5a6066, [len / 2, y - 0.01, out]);
      b.pane(len - 0.04, 0.012, out - 0.04, 0xd4e0e8, { at: [len / 2, y + 0.02, out / 2] });
      flat(b, 0.16, 0.04, 0.1, 0x3a3e44, [len / 2, y - 0.05, 0.12]);
      b.led(0.04, 0xfff0c8, { at: [len / 2, y - 0.08, 0.12] });
    }),
  );
}

/**
 * A pallet of flat-pack desks on a hand pump truck, left out in the rain:
 * the wooden pallet on the truck's forks, five desk boxes stacked and wrapped
 * in shiny stretch film, the truck's handle up at +x; along x.
 */
export const palletTruck = looks([1.3, 0.8], 1, (b) => {
  const truck = 0xa85a3c;
  // The pallet: top boards and three stringers.
  for (const z of [-0.3, 0, 0.3]) flat(b, 1.0, 0.08, 0.1, 0x8a6e4a, [0, 0.06, z]);
  for (let x = -0.45; x <= 0.46; x += 0.15)
    flat(b, 0.12, 0.025, 0.8, nth([0xa48660, 0x947656], Math.round(x * 10)), [x, 0.115, 0]);
  // The forks under it and the truck's head, the handle.
  for (const z of [-0.18, 0.18]) flat(b, 1.05, 0.05, 0.14, truck, [0.05, 0.035, z]);
  b.box(0.18, 0.22, 0.4, truck, { at: [0.6, 0.14, 0] }, 0.03);
  b.cylinder(0.06, 0.06, 0.3, INK, { at: [0.62, 0.06, 0], rot: [Math.PI / 2, 0, 0] }, 10);
  bar(b, [0.62, 0.24, 0], [0.86, 0.82, 0], 0.035, truck);
  flat(b, 0.04, 0.04, 0.26, INK, [0.87, 0.84, 0]);
  // The desks, the stretch film round them, the top one's tape.
  for (let k = 0; k < 5; k++)
    b.box(
      1.04,
      0.1,
      0.66,
      tint(BOX, (k % 2 ? -0.06 : 0) - k * 0.01),
      {
        at: [-0.02, 0.18 + k * 0.102, 0],
        rot: [0, (hash01(k, 3, 3) - 0.5) * 0.06, 0],
      },
      0.01,
    );
  flat(b, 1.06, 0.006, 0.05, BOX_TAPE, [-0.02, 0.645, 0]);
  b.pane(1.08, 0.46, 0.7, 0xd8e4ec, { at: [-0.02, 0.4, 0] });
  b.pane(0.2, 0.4, 0.71, 0xf4f8fa, { at: [-0.3, 0.42, 0.001] });
});

/** A dark green-grey wheelie bin, its lid propped open on a fold of cardboard. Faces +z. */
export const wheelieBin = looks([0.6, 0.6], 1, (b) => {
  const c = 0x46564c;
  b.box(0.52, 0.82, 0.56, c, { at: [0, 0.43, 0] }, 0.05);
  flat(b, 0.46, 0.02, 0.5, tint(c, -0.3), [0, 0.84, 0]);
  b.box(0.58, 0.04, 0.6, tint(c, 0.08), { at: [0, 0.9, -0.08], rot: [0.32, 0, 0] }, 0.02);
  flat(b, 0.4, 0.2, 0.02, BOX, [0.02, 0.92, 0.12], [0.6, 0.2, 0]);
  for (const x of [-0.2, 0.2])
    b.cylinder(0.08, 0.08, 0.05, INK, { at: [x, 0.08, -0.28], rot: [0, 0, Math.PI / 2] }, 10);
});

/**
 * A cardboard recycling cage overflowing: a steel mesh cage crammed with
 * flattened desk-box cardboard leaning every way, more of it piled over the
 * top, puffs of bubble wrap; about 1.0 × 0.65, 1.1 high at its tallest.
 */
export const recyclingCage = looks([1.0, 0.7], 1, (b) => {
  const steel = 0x8a9298;
  const w = 0.9;
  const d = 0.6;
  const h = 0.9;
  for (const [x, z] of [
    [-w / 2, -d / 2],
    [w / 2, -d / 2],
    [-w / 2, d / 2],
    [w / 2, d / 2],
  ] as const)
    flat(b, 0.035, h, 0.035, steel, [x, h / 2, z]);
  flat(b, w, 0.04, d, tint(steel, -0.2), [0, 0.02, 0]);
  for (const z of [-d / 2, d / 2])
    for (const y of [0.3, 0.6, h]) flat(b, w, 0.02, 0.02, steel, [0, y, z]);
  for (const x of [-w / 2, w / 2])
    for (const y of [0.3, 0.6, h]) flat(b, 0.02, 0.02, d, steel, [x, y, 0]);
  for (let x = -w / 2 + 0.1; x < w / 2; x += 0.1)
    flat(b, 0.008, h, 0.008, steel, [x, h / 2, d / 2]);
  // The cardboard: flat sheets leaning in it, and more heaped over the top.
  for (let k = 0; k < 9; k++) {
    const x = -0.32 + (k % 5) * 0.16;
    const lean = (hash01(k, 1, 41) - 0.5) * 0.8;
    const twist = (hash01(k, 2, 41) - 0.5) * 0.6;
    const hh = 0.7 + hash01(k, 3, 41) * 0.4;
    b.box(
      0.03,
      hh,
      0.5,
      tint(BOX, (hash01(k, 4, 41) - 0.5) * 0.14),
      {
        at: [x, hh / 2 + 0.04, k > 4 ? 0.06 : -0.06],
        rot: [twist * 0.3, twist, lean],
      },
      0.006,
    );
  }
  for (let k = 0; k < 3; k++)
    b.box(
      0.8,
      0.03,
      0.5,
      tint(BOX, -0.04 * k),
      {
        at: [(k - 1) * 0.08, h + 0.08 + k * 0.05, (k - 1) * 0.05],
        rot: [(k - 1) * 0.15, k * 0.3, (k - 1) * 0.12],
      },
      0.006,
    );
  // Bubble wrap spilling out of the top and a puff on the ground.
  for (const [x, y, z, r] of [
    [0.22, 1.08, 0.08, 0.13],
    [0.06, 1.12, -0.06, 0.1],
    [-0.36, 0.08, 0.42, 0.1],
    [-0.2, 0.06, 0.48, 0.07],
  ] as const)
    b.sphere(r, 0xdfe8ee, { at: [x, y, z] }, [1.3, 0.55, 1]);
  // A flattened box fallen out on the wet ground.
  b.box(0.7, 0.02, 0.45, tint(BOX, -0.12), { at: [0.25, 0.02, 0.55], rot: [0, 0.4, 0] }, 0);
});

// ---- The street ----

/** Umbrella canopies: navy, black, burgundy, mustard, a clear one (pale), a green tartan-ish one. */
const UMBRELLAS = [0x2e3a5a, 0x2a2a2e, 0x7a3038, 0xb8902e, 0xc8d4dc, 0x3c5a48] as const;
const COATS = [0x4a4e56, 0x6a5a48, 0x3a4250, 0x7a7068, 0x52584e] as const;

/**
 * Someone out in the rain under an umbrella (`bob` alive), seen from above:
 * the umbrella's eight-panel canopy with its ribs and tip hides all but a
 * coat and two dark legs under it. About 0.8 across, 1.35 high.
 */
export const umbrellaWalker = looks([0.8, 0.8], 6, (b, v) => {
  const coat = nth(COATS, v);
  for (const x of [-0.07, 0.07])
    b.capsule(0.05, 0.36, 0x2a2c32, { at: [x, 0.24, (v % 2) * 0.04 - 0.02] });
  b.box(0.32, 0.5, 0.22, coat, { at: [0, 0.68, 0] }, 0.08);
  b.sphere(0.1, 0xc8a080, { at: [0, 1.0, 0.03] });
  b.cylinder(0.008, 0.008, 0.5, INK, { at: [0.08, 1.02, 0.06] }, 4);
  const c = nth(UMBRELLAS, v);
  const y = 1.3;
  b.cone(0.42, 0.18, c, { at: [0.06, y, 0.04] }, 8);
  b.cone(0.43, 0.04, tint(c, -0.2), { at: [0.06, y - 0.08, 0.04] }, 8);
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    bar(
      b,
      [0.06, y + 0.09, 0.04],
      [0.06 + Math.cos(a) * 0.42, y - 0.09, 0.04 + Math.sin(a) * 0.42],
      0.01,
      tint(c, -0.3),
    );
  }
  b.cylinder(0.008, 0.012, 0.08, INK, { at: [0.06, y + 0.12, 0.04] }, 4);
  // The wet sheen on one panel.
  b.sphere(0.1, tint(c, 0.35), { at: [-0.06, y + 0.04, -0.06] }, [1, 0.25, 0.8]);
});

/** Car paint, muted, by look. */
const CAR_PAINT = [0x5a6068, 0x8a3e38, 0xc8c8c4, 0x2e3440, 0x4e6a84, 0x6e6a5a] as const;

/**
 * A car on the wet street with its lights on: along x, its nose at +x, a
 * muted paint, dark glass, a wet sheen on the roof, headlights and red tail
 * lights glowing; about 1.3 × 0.6.
 */
export const wetCar = looks([1.3, 0.6], CAR_PAINT.length, (b, v) => {
  const paint = nth(CAR_PAINT, v);
  for (const x of [-0.4, 0.4])
    for (const z of [-0.27, 0.27])
      b.cylinder(0.11, 0.11, 0.08, INK, { at: [x, 0.11, z], rot: [Math.PI / 2, 0, 0] }, 12);
  b.box(1.28, 0.26, 0.6, paint, { at: [0, 0.24, 0] }, 0.08);
  b.box(0.7, 0.22, 0.54, paint, { at: [-0.06, 0.46, 0] }, 0.08);
  flat(b, 0.72, 0.14, 0.555, GLASS_DARK, [-0.06, 0.46, 0]);
  flat(b, 0.5, 0.02, 0.48, tint(paint, 0.04), [-0.08, 0.575, 0]);
  flat(b, 0.34, 0.006, 0.12, tint(paint, 0.4), [-0.12, 0.588, -0.1]);
  for (const s of [-1, 1]) {
    b.led(0.045, HEADLIGHT, { at: [0.64, 0.28, s * 0.2] });
    b.led(0.04, TAIL, { at: [-0.64, 0.3, s * 0.21] });
  }
});

/**
 * The row of shops across the street: `len` along +x from 0, its front at
 * z = 0 facing +z, two storeys (about 1.5 high) of brick and render in a few
 * colors, each shop its lit window and an awning, the windows above, a
 * parapet and the odd roof unit; seen mostly from above.
 */
export function shopRow(len: number): SetPiece {
  return once(`shops:${len.toFixed(2)}`, () =>
    looks([len, 1.4], 1, (b) => {
      const fronts = [0x9a7a68, 0xb8b2a4, 0x8a8478, 0xa89a84, 0x7a6a5e] as const;
      const awnings = [0x3e5a62, 0x7a4a44, 0x5a6a4a, 0x4a4e66] as const;
      const depth = 1.4;
      let x = 0;
      for (let k = 0; x < len - 0.1; k++) {
        const w = Math.min(len - x, 1.6 + hash01(k, 1, 51) * 1.0);
        const h = 1.3 + hash01(k, 2, 51) * 0.35;
        const c = nth(fronts, k);
        const cx = x + w / 2;
        flat(b, w - 0.02, h, depth, c, [cx, h / 2, -depth / 2]);
        // The roof, its parapet and the odd unit on it.
        flat(b, w - 0.1, 0.02, depth - 0.1, tint(c, -0.35), [cx, h + 0.005, -depth / 2]);
        flat(b, w, 0.06, 0.06, tint(c, 0.1), [cx, h + 0.03, -0.03]);
        if (hash01(k, 3, 51) > 0.4) flat(b, 0.4, 0.18, 0.3, 0x8a9096, [cx - 0.2, h + 0.09, -0.7]);
        // The shop window, warm and lit inside on a grey day, an awning over it.
        flat(b, w - 0.3, 0.42, 0.01, 0xe0c890, [cx, 0.3, 0.005]);
        flat(b, w - 0.24, 0.05, 0.02, INK, [cx, 0.54, 0.01]);
        b.box(
          w - 0.2,
          0.04,
          0.34,
          nth(awnings, k + 1),
          { at: [cx, 0.6, 0.16], rot: [0.35, 0, 0] },
          0,
        );
        // The windows above.
        for (let wx = x + 0.3; wx < x + w - 0.2; wx += 0.42)
          flat(b, 0.24, 0.3, 0.01, 0x4a5868, [wx + 0.06, h - 0.38, 0.005]);
        x += w;
      }
    }),
  );
}

/**
 * The construction hoarding round the crane tower's site: `len` along +x
 * from 0, its face toward +z, 0.75 high: painted panels in a dark grey-green
 * with a pale band and the developer's posters, the site gate.
 */
export function hoarding(len: number): SetPiece {
  return once(`hoarding:${len.toFixed(2)}`, () =>
    looks([len, 0.1], 1, (b) => {
      const c = 0x4e5a54;
      flat(b, len, 0.75, 0.05, c, [len / 2, 0.375, 0]);
      flat(b, len, 0.08, 0.052, 0xc8c8c0, [len / 2, 0.6, 0]);
      for (let x = 1.2; x < len; x += 1.2) flat(b, 0.02, 0.75, 0.054, tint(c, -0.2), [x, 0.375, 0]);
      for (let x = 0.6, k = 0; x < len - 0.4; k++, x += 2.4)
        flat(b, 0.6, 0.36, 0.056, nth([0xd8d4c8, 0x8a9cb0, 0xc8b890], k), [x + 0.3, 0.32, 0]);
      flat(b, 0.9, 0.74, 0.06, 0x3a3e40, [len - 0.6, 0.37, 0]);
    }),
  );
}

/**
 * Rain on glass: `len` along +x from 0, up to `h`, streaks running down and
 * beads, pale, in the glass layer; hang it just outside a pane.
 */
export function rainOnGlass(len: number, h: number): SetPiece {
  return once(`rain:${len.toFixed(2)}:${h.toFixed(2)}`, () =>
    looks([len, 0.02], 1, (b) => {
      const streak = 0xe8f0f6;
      for (let k = 0, x = 0.05; x < len - 0.02; k++, x += 0.07 + hash01(k, 1, 61) * 0.09) {
        const l = 0.25 + hash01(k, 2, 61) * 0.9;
        const y = 0.15 + hash01(k, 3, 61) * (h - l - 0.2);
        b.pane(0.008, l, 0.004, streak, {
          at: [x, y + l / 2, 0],
          rot: [0, 0, (hash01(k, 4, 61) - 0.5) * 0.08],
        });
        b.add(new THREE.SphereGeometry(0.014, 6, 4), streak, { at: [x, y, 0.004] }, 'glass');
        if (hash01(k, 5, 61) > 0.5)
          b.add(
            new THREE.SphereGeometry(0.01, 6, 4),
            streak,
            {
              at: [x + 0.03, y + l * hash01(k, 6, 61), 0.004],
            },
            'glass',
          );
      }
    }),
  );
}

/**
 * The tower crane on the crane tower's roof, bolder than 3-1's (it stands
 * closer here): a yellow mast `mast` high with dark bracing bands, the cab
 * and slewing ring on top, a long yellow jib out along +x (`jib`), the
 * counter-jib along −x with its grey concrete blocks, the trolley and a
 * hook on its cable hanging from the jib.
 */
export function cityCrane(mast: number, jib: number): SetPiece {
  return once(`cityCrane:${mast}:${jib}`, () =>
    looks([1, 1], 1, (b) => {
      const yel = 0xd8a838;
      const dark = 0x3a3428;
      flat(b, 0.12, mast, 0.12, yel, [0, mast / 2, 0]);
      for (let y = 0.08; y < mast - 0.05; y += 0.12)
        flat(b, 0.125, 0.025, 0.125, dark, [0, y, 0], [0, 0, 0.5]);
      flat(b, 0.2, 0.05, 0.2, dark, [0, mast + 0.025, 0]);
      b.box(0.14, 0.12, 0.12, 0xe8e4d8, { at: [0.12, mast + 0.1, 0.1] }, 0.02);
      flat(b, 0.1, 0.06, 0.005, 0x2e3a48, [0.12, mast + 0.11, 0.161]);
      // The jib: a top chord and two bottom chords with diagonals, out along +x.
      const y0 = mast + 0.08;
      for (const z of [-0.04, 0.04]) flat(b, jib, 0.025, 0.025, yel, [jib / 2, y0, z]);
      flat(b, jib * 0.95, 0.025, 0.025, yel, [jib * 0.475, y0 + 0.08, 0]);
      for (let x = 0.05; x < jib - 0.05; x += 0.1)
        bar(b, [x, y0, 0], [x + 0.05, y0 + 0.08, 0], 0.014, yel);
      // The counter-jib with its blocks, the tower's peak and its ties.
      flat(b, jib * 0.35, 0.03, 0.08, yel, [-jib * 0.175, y0, 0]);
      for (let k = 0; k < 3; k++)
        flat(b, 0.06, 0.07, 0.1, 0x8a8a84, [-jib * 0.28 + k * 0.065, y0 - 0.04, 0]);
      flat(b, 0.05, 0.22, 0.05, yel, [0, y0 + 0.11, 0]);
      bar(b, [0, y0 + 0.22, 0], [jib * 0.7, y0 + 0.08, 0], 0.01, dark);
      bar(b, [0, y0 + 0.22, 0], [-jib * 0.33, y0 + 0.02, 0], 0.01, dark);
      // The trolley, its cable and a hook with a bundle of steel.
      const tx = jib * 0.6;
      flat(b, 0.06, 0.03, 0.1, dark, [tx, y0 - 0.02, 0]);
      flat(b, 0.006, 0.36, 0.006, dark, [tx, y0 - 0.2, 0]);
      flat(b, 0.04, 0.04, 0.04, 0xc84a2e, [tx, y0 - 0.39, 0]);
    }),
  );
}

// ---- The front and the landing ----

/** A doormat: dark ribbed coir-grey with a border, 0.9 × 0.55, lying flat. */
export const doormat = looks([0.9, 0.55], 1, (b) => {
  flat(b, 0.9, 0.02, 0.55, 0x3a3a38, [0, 0.01, 0]);
  for (let x = -0.36; x <= 0.36; x += 0.06) flat(b, 0.03, 0.006, 0.45, 0x52504a, [x, 0.022, 0]);
});

/** A yellow WET FLOOR A-frame sign standing open, about 0.5 high. */
export const wetFloorSign = looks([0.35, 0.35], 1, (b) => {
  const y = 0xe0b820;
  for (const s of [-1, 1]) {
    b.box(0.3, 0.5, 0.02, y, { at: [0, 0.24, s * 0.08], rot: [s * 0.3, 0, 0] }, 0.008);
    // The black warning triangle and the words on the front.
    if (s > 0) {
      flat(b, 0.12, 0.12, 0.004, 0x1c1c1c, [0, 0.32, 0.105], [0.3, 0, Math.PI / 4]);
      flat(b, 0.07, 0.07, 0.006, y, [0, 0.32, 0.108], [0.3, 0, Math.PI / 4]);
      flat(b, 0.2, 0.025, 0.004, 0x1c1c1c, [0, 0.16, 0.135], [0.3, 0, 0]);
    }
  }
  flat(b, 0.32, 0.03, 0.04, 0xd0a818, [0, 0.49, 0]);
});

/** An umbrella stand: a steel bin with three closed umbrellas leaning out of it, under 0.6. */
export const umbrellaStand = looks([0.3, 0.3], 1, (b) => {
  b.cylinder(0.12, 0.11, 0.32, 0x7a8288, { at: [0, 0.16, 0] }, 14);
  b.cylinder(0.1, 0.1, 0.01, INK, { at: [0, 0.32, 0] }, 14);
  (
    [
      [0.04, 0.02, 0.2, UMBRELLAS[0]],
      [-0.04, 0.03, -0.25, UMBRELLAS[3]],
      [0.0, -0.05, 0.1, UMBRELLAS[2]],
    ] as const
  ).forEach(([x, z, lean, c]) => {
    b.cone(0.04, 0.42, c, { at: [x, 0.3, z], rot: [lean * 0.5, 0, lean] }, 6);
    b.torus(0.03, 0.008, INK, { at: [x + lean * 0.24, 0.53, z], rot: [0, 0, 0] }, Math.PI);
  });
  // A drip puddle round its foot.
  b.cylinder(0.2, 0.2, 0.004, 0x9aa8b4, { at: [0, 0.002, 0.04] }, 14);
});

/**
 * Prod, on the stair landing, in a much bigger pot than 3-1's: a wide
 * glazed slate-blue planter on castors, the same little tree (it has a
 * new starter's welcome tag on a ribbon round its trunk).
 */
export const prodTub = looks([0.9, 0.9], 1, (b) => {
  for (const [x, z] of [
    [-0.26, -0.26],
    [0.26, -0.26],
    [-0.26, 0.26],
    [0.26, 0.26],
  ] as const)
    b.cylinder(0.04, 0.04, 0.05, INK, { at: [x, 0.025, z] }, 8);
  b.cylinder(0.42, 0.34, 0.56, 0x5a6e80, { at: [0, 0.33, 0] }, 28);
  b.cylinder(0.44, 0.44, 0.05, 0xd8d4c8, { at: [0, 0.62, 0] }, 28);
  b.cylinder(0.39, 0.39, 0.02, 0x3e3428, { at: [0, 0.645, 0] }, 24);
  flat(b, 0.05, 0.36, 0.01, 0x8a9cae, [-0.15, 0.34, 0.37], [0.12, 0, 0]);
  for (const [x, z, r] of [
    [0.04, 0, 0.1],
    [-0.06, 0.04, -0.15],
    [0.02, -0.06, 0.05],
  ] as const)
    b.cylinder(0.018, 0.025, 0.66, 0x8a8478, { at: [x, 0.96, z], rot: [r, 0, r * 1.5] }, 6);
  for (const [x, y, z, r, c] of [
    [0, 1.36, 0, 0.3, 0x5f8a4a],
    [0.19, 1.24, 0.1, 0.22, 0x6c9652],
    [-0.17, 1.26, -0.06, 0.22, 0x527e3e],
    [0.05, 1.54, -0.05, 0.19, 0x6c9652],
  ] as const)
    b.sphere(r, c, { at: [x, y, z] }, [1, 0.85, 1]);
  // The welcome tag on a violet ribbon.
  b.torus(0.04, 0.008, VIOLET, { at: [0, 0.82, 0], rot: [Math.PI / 2, 0, 0] });
  flat(b, 0.07, 0.05, 0.006, 0xf0eef4, [0.04, 0.76, 0.05]);
});
