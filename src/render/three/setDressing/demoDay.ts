import * as THREE from 'three';
import { type ModelBuilder, tint } from '../kit';
import { looks, nth, type SetPiece } from './shared';

/**
 * The world round the Demo Day level (`scenes/demoDay.ts`): the LAUNCHPAD
 * accelerator's stage and hall for one afternoon. Behind the level, the giant
 * LED wall with YOTTA's pitch slide, flanked by silver box-truss towers with
 * moving heads, hanging line arrays and a beam of par cans; a camera-feed
 * screen and the Q&A ticker beside it. Left, the wings (flight cases, cable
 * spools, the stage manager's prompt desk, the "QUIET" sign, the next
 * startup's roll-up banner, the lanyard rail); right, the tech side (the
 * livestream camera, the vision mixer, the AV rack, the countdown clock, the
 * haze machine, cable snakes). In front, the stage lip with footlights and
 * monitor wedges, and the investors' reserved seats. Built like the rest of
 * the set dressing, standing on the ground at the origin and fronting +z.
 * Nothing here is food or drink.
 */

/** Flight case black, its aluminium edging and corner caps. */
const CASE = 0x26272d;
const ALU = 0xa9afb7;
const CAP = 0xcfd3d8;
/** Silver box truss. */
const TRUSS = 0xc8ced6;
/** Black steel and the black of the stage gear. */
export const BLACK = 0x1d1e23;
const STEEL = 0x34373e;
/** YOTTA's violet, its white, the LED wall's pixels. */
const VIOLET = 0x9a6cff;
const VIOLET_DEEP = 0x4a2aa8;
const SLIDE_WHITE = 0xf6f2ff;
const TALLY = 0xff2a2a;
const AMBER = 0xffb43a;
const GREEN = 0x5cf08a;
/** The warm lamp of a par can or a footlight. */
const LAMP = 0xffd9a0;
/** Gaffer tape: matte grey-black, and the odd strip of fluorescent spike tape. */
const GAFFER = 0x4a4c52;
const SPIKE = [0xf2f2ee, 0xf0e04a, 0x5ae0f0, 0xf06aa8] as const;

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

/** A plain (unbevelled) box in the glow layer: lit letters, LED strips. */
function glowBox(
  b: ModelBuilder,
  w: number,
  h: number,
  d: number,
  color: number,
  at: [number, number, number],
  rot?: [number, number, number],
): void {
  b.add(new THREE.BoxGeometry(w, h, d), color, rot ? { at, rot } : { at }, 'glow');
}

/** A flat glowing panel facing +z (or turned by `rot`). */
function glowPlane(
  b: ModelBuilder,
  w: number,
  h: number,
  color: number,
  at: [number, number, number],
  rot?: [number, number, number],
): void {
  b.add(new THREE.PlaneGeometry(w, h), color, rot ? { at, rot } : { at }, 'glow');
}

// ---- Lettering ----

/** A blocky alphabet, 3 wide and 5 high. */
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
  Q: '010101101110011',
  R: '110101110101101',
  S: '011100010001110',
  T: '111010010010010',
  U: '101101101101111',
  V: '101101101101010',
  W: '101101111111101',
  X: '101101010101101',
  Y: '101101010010010',
  '0': '111101101101111',
  '1': '010110010010111',
  '2': '110001010100111',
  '5': '111100110001110',
  '6': '011100111101111',
  '9': '111101111001110',
  ':': '000010000010000',
  '·': '000000010000000',
  '&': '010101010101011',
  '-': '000000111000000',
  ' ': '000000000000000',
};

/** YOTTA's own rounder alphabet, 5 wide and 5 high (as on the loft's roof sign). */
const WIDE: Readonly<Record<string, string>> = {
  A: '0111010001111111000110001',
  B: '1111010001111101000111110',
  C: '0111110000100001000001111',
  D: '1111010001100011000111110',
  E: '1111110000111101000011111',
  H: '1000110001111111000110001',
  I: '1111100100001000010011111',
  L: '1000010000100001000011111',
  M: '1000111011101011000110001',
  N: '1000111001101011001110001',
  O: '0111010001100011000101110',
  P: '1111010001111101000010000',
  S: '0111110000011100000111110',
  T: '1111100100001000010000100',
  U: '1000110001100011000101110',
  V: '1000110001100010101000100',
  Y: '1000101010001000010000100',
  '2': '1111000001011101000011111',
  '6': '0111010000111101000101110',
  '·': '0000001110011100111000000',
  ' ': '0000000000000000000000000',
};

/** Whether every glyph of `text` is in the alphabet (the wide one when `wide`). */
export function spellable(text: string, wide = false): boolean {
  const font = wide ? WIDE : FONT;
  return Array.from(text).every((ch) => ch in font);
}

/** How wide `text` runs, in pixels: 3 per glyph (5 when `wide`) and 1 between. Every glyph is one UTF-16 unit. */
export function textWidth(text: string, wide = false): number {
  return text.length * (wide ? 6 : 4) - 1;
}

/**
 * Letters for `text` centred on (x, y) on a face at depth z facing +z, each
 * pixel `px` square and `depth` thick; a row's run of pixels is one box. In
 * the glow layer when `lit`.
 */
function letters(
  b: ModelBuilder,
  text: string,
  x: number,
  y: number,
  z: number,
  px: number,
  color: number,
  lit: boolean,
  depth = 0.01,
  wide = false,
): void {
  const chars = Array.from({ length: text.length }, (_, k) => text.charAt(k));
  const cols = textWidth(text, wide);
  const font = wide ? WIDE : FONT;
  const g = wide ? 5 : 3;
  chars.forEach((ch, k) => {
    const glyph = font[ch] ?? font[' '] ?? '';
    for (let r = 0; r < 5; r++) {
      let c = 0;
      while (c < g) {
        if (glyph[r * g + c] !== '1') {
          c++;
          continue;
        }
        let e = c;
        while (e < g && glyph[r * g + e] === '1') e++;
        const left = x + (k * (g + 1) + c - cols / 2) * px;
        const at: [number, number, number] = [left + ((e - c) * px) / 2, y + (2 - r) * px, z];
        if (lit) glowBox(b, (e - c) * px * 0.98, px * 0.98, depth, color, at);
        else b.box((e - c) * px, px, depth, color, { at }, 0);
        c = e;
      }
    }
  });
}

/** A thin line from (x0, y0) to (x1, y1) on a face at depth z, `t` thick: a lit stroke. */
function stroke(
  b: ModelBuilder,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  z: number,
  t: number,
  color: number,
): void {
  const len = Math.hypot(x1 - x0, y1 - y0);
  glowBox(
    b,
    len + t * 0.6,
    t,
    0.012,
    color,
    [(x0 + x1) / 2, (y0 + y1) / 2, z],
    [0, 0, Math.atan2(y1 - y0, x1 - x0)],
  );
}

// ---- The LED wall and the side screens ----

/** The LED wall's picture starts this high above the ground: just over the stage-set walls' tops. */
export const SCREEN_LIFT = 1.24;
/** The LED wall's picture: its violet at the foot and at the top, the header band across it and its height. */
const SCREEN_FOOT = 0x7a5ef4;
const SCREEN_TOP = 0x8a72fc;
const HEADER_BAND = 0x3a2c8c;
const HEADER_H = 0.44;
const HEADER = 'LAUNCHPAD DEMO DAY · BATCH 26';

/**
 * Where the pitch slide's parts sit on an LED wall `w` × `h` (x from the
 * middle, y from the picture's foot): the logo on the left, LIVE DEMO and its
 * red dot on the right, the growth chart squeezed between them so nothing
 * overlaps, and the header's pixel size so it fits the width.
 */
export function slideLayout(w: number, h: number) {
  const headPx = Math.min(0.05, (w - 1.3) / textWidth(HEADER, true));
  const ring = 0.42;
  const rx = -w / 2 + 0.3 + ring + 0.1;
  const logoPx = 0.09;
  const logoW = textWidth('YOTTA', true) * logoPx;
  const logoX = rx + ring + 0.28 + logoW / 2;
  const logoY = h * 0.5;
  const livePx = 0.045;
  const liveW = textWidth('LIVE DEMO', true) * livePx;
  const liveX = w / 2 - 0.3 - liveW / 2;
  const liveY = h * 0.66;
  const dotX = liveX - liveW / 2 - 0.26;
  // The chart's natural extent is 2.8 wide (from its origin −0.2 to +2.6) and 1.85 up to the arrow's tip.
  const chartL = logoX + logoW / 2 + 0.4;
  const chartR = Math.min(dotX - 0.25, liveX - 1.2 - 0.2);
  const sx = Math.max(0.3, Math.min(1, (chartR - chartL) / 2.8));
  const sy = Math.min(1, (h - HEADER_H - 0.3 - 0.4 - 0.24) / 1.85);
  return { headPx, ring, rx, logoPx, logoX, logoY, livePx, liveX, liveY, dotX, chartL, sx, sy };
}

/**
 * The giant LED video wall, `w` wide and `h` tall, its picture from
 * `SCREEN_LIFT` up: a black frame and a black drape down to the ground, the
 * LED cabinets' seams over the picture. The origin at the middle of the
 * picture's foot, on its face; the frame runs back (−z). The slide's
 * background only: its letters, logo and arrow are `pitchSlide`, lit.
 */
export function ledWall(w: number, h: number): SetPiece {
  return once(`ledWall:${w.toFixed(2)}:${h.toFixed(2)}`, () =>
    looks([w + 0.3, 0.5], 1, (b) => {
      const y0 = SCREEN_LIFT;
      // The drape under it, pleated, and the frame round the picture.
      b.box(w + 0.2, y0, 0.04, 0x141418, { at: [0, y0 / 2, -0.2] }, 0);
      for (let x = -w / 2 + 0.15; x < w / 2; x += 0.3)
        b.box(0.05, y0, 0.03, 0x1c1c22, { at: [x, y0 / 2, -0.17] }, 0);
      b.box(w + 0.24, h + 0.22, 0.26, 0x16171c, { at: [0, y0 + h / 2, -0.15] }, 0.02);
      // The back's ground-support legs and braces.
      for (const x of [-w / 2 + 0.3, 0, w / 2 - 0.3]) {
        b.box(0.08, y0 + h, 0.08, STEEL, { at: [x, (y0 + h) / 2, -0.45] }, 0);
        b.box(0.06, 0.06, 0.7, STEEL, { at: [x, 0.03, -0.45] }, 0);
      }
      // The picture: a bright violet gradient, lighter up top, a glow behind the logo's side.
      const bands = 7;
      for (let i = 0; i < bands; i++) {
        const t = i / (bands - 1);
        const c = new THREE.Color(SCREEN_FOOT).lerp(new THREE.Color(SCREEN_TOP), t).getHex();
        glowPlane(b, w, h / bands + 0.002, c, [0, y0 + (i + 0.5) * (h / bands), 0.0]);
      }
      // A soft lighter wash behind the logo (left) and behind the arrow (middle).
      b.add(
        new THREE.CircleGeometry(1.25, 28),
        0x9680ff,
        { at: [-w / 2 + 1.8, y0 + h * 0.48, 0.004] },
        'glow',
      );
      b.add(
        new THREE.CircleGeometry(1.0, 28),
        0x8c76ff,
        { at: [w * 0.06, y0 + h * 0.5, 0.004] },
        'glow',
      );
      // The header band across the top.
      glowPlane(b, w, HEADER_H, HEADER_BAND, [0, y0 + h - HEADER_H / 2, 0.006]);
      glowPlane(b, w, 0.035, 0xb89cff, [0, y0 + h - HEADER_H - 0.015, 0.007]);
      // LED cabinet seams: a fine dark grid over the picture.
      const seam = 0x2a2060;
      for (let x = -w / 2 + 0.5; x < w / 2 - 0.01; x += 0.5)
        b.box(0.01, h, 0.006, seam, { at: [x, y0 + h / 2, 0.012] }, 0);
      for (let y = y0 + 0.5; y < y0 + h - 0.01; y += 0.5)
        b.box(w, 0.01, 0.006, seam, { at: [0, y, 0.012] }, 0);
    }),
  );
}

/**
 * YOTTA's pitch slide on the LED wall `w` × `h` (lit, `hot`): the header
 * "LAUNCHPAD DEMO DAY · BATCH 26", the YOTTA orbit and letters, a growth
 * arrow over rising bars, "LIVE DEMO" and the features shipped so far, each
 * ticked. Same origin as `ledWall`.
 */
export function pitchSlide(w: number, h: number): SetPiece {
  return once(`slide:${w.toFixed(2)}:${h.toFixed(2)}`, () =>
    looks([w, 0.1], 1, (b) => {
      const y0 = SCREEN_LIFT;
      const z = 0.02;
      const at = slideLayout(w, h);
      // Header, in YOTTA's wide letters so every one reads.
      const hy = y0 + h - HEADER_H / 2;
      letters(b, HEADER, 0, hy, z, at.headPx, SLIDE_WHITE, true, 0.01, true);
      // A little rocket mark either side of the header, where there's room.
      const half = (textWidth(HEADER, true) * at.headPx) / 2 + 0.22;
      if (half + 0.1 < w / 2)
        for (const s of [-1, 1])
          b.add(
            new THREE.CircleGeometry(0.08, 3),
            AMBER,
            { at: [s * half, hy, z], rot: [0, 0, Math.PI / 2] },
            'glow',
          );
      // The logo: an orbit round a planet, then YOTTA in its round letters.
      const { ring, rx } = at;
      const ly = y0 + at.logoY;
      b.add(
        new THREE.TorusGeometry(ring, 0.06, 8, 32),
        0xe0d0ff,
        { at: [rx, ly, z], rot: [0, 0, 0.5] },
        'glow',
      );
      b.add(new THREE.CircleGeometry(ring * 0.4, 20), SLIDE_WHITE, { at: [rx, ly, z] }, 'glow');
      b.add(
        new THREE.CircleGeometry(0.08, 10),
        SLIDE_WHITE,
        { at: [rx + Math.cos(0.5) * ring, ly + Math.sin(0.5) * ring, z + 0.004] },
        'glow',
      );
      letters(b, 'YOTTA', at.logoX, ly, z, at.logoPx, SLIDE_WHITE, true, 0.012, true);
      letters(b, 'SHIP IT LIVE', at.logoX, ly - 0.42, z, 0.04, 0xf0e8ff, true);
      // The growth chart: bars rising, an arrow up and to the right over them, all between the logo and LIVE DEMO.
      const { sx, sy } = at;
      const c0 = at.chartL + 0.2 * sx;
      const base = y0 + 0.4;
      for (let i = 0; i < 6; i++) {
        const bh = (0.18 + i * i * 0.05) * sy;
        glowPlane(b, 0.26 * sx, bh, i === 5 ? 0xf2ecff : 0xc4b4ff, [
          c0 + i * 0.4 * sx,
          base + bh / 2,
          z,
        ]);
      }
      const pts: [number, number][] = (
        [
          [-0.2, 0.55],
          [0.5, 0.85],
          [0.9, 0.72],
          [1.6, 1.3],
          [2.35, 1.85],
        ] as const
      ).map(([px, py]) => [c0 + px * sx, base + py * sy]);
      for (let i = 1; i < pts.length; i++) {
        const [ax, ay] = pts[i - 1] ?? [0, 0];
        const [bx, by] = pts[i] ?? [0, 0];
        stroke(b, ax, ay, bx, by, z + 0.006, 0.1, SLIDE_WHITE);
      }
      const [tx, ty] = pts[pts.length - 1] ?? [0, 0];
      b.add(
        new THREE.CircleGeometry(0.22, 3),
        SLIDE_WHITE,
        { at: [tx, ty, z + 0.008], rot: [0, 0, Math.atan2(0.55 * sy, 0.75 * sx)] },
        'glow',
      );
      letters(b, '10X', c0 + 0.5 * sx, base + 1.5 * sy, z, 0.06, AMBER, true);
      // LIVE DEMO, and what's shipped live so far.
      letters(b, 'LIVE DEMO', at.liveX, y0 + at.liveY, z, at.livePx, SLIDE_WHITE, true, 0.01, true);
      for (let i = 0; i < 3; i++) {
        const y = y0 + h * 0.4 - i * 0.3;
        const x = at.liveX - 1.0;
        // A tick in a green box, a line of text after it.
        glowPlane(b, 0.18, 0.18, 0x2a8a58, [x, y, z]);
        stroke(b, x - 0.05, y, x - 0.01, y - 0.05, z + 0.004, 0.035, SLIDE_WHITE);
        stroke(b, x - 0.01, y - 0.05, x + 0.07, y + 0.06, z + 0.004, 0.035, SLIDE_WHITE);
        glowPlane(b, 1.1 - i * 0.22, 0.07, 0xeee8ff, [x + 0.2 + (1.1 - i * 0.22) / 2, y, z]);
      }
    }),
  );
}

/** The red "on air" dot by LIVE DEMO (`blink` alive, `hot`). */
export const liveDot = looks([0.2, 0.05], 1, (b) => {
  b.cylinder(0.12, 0.12, 0.01, 0x1a0c2a, { at: [0, 0.1, 0.02], rot: [Math.PI / 2, 0, 0] }, 16);
  b.add(new THREE.CircleGeometry(0.1, 16), TALLY, { at: [0, 0.1, 0.03] }, 'glow');
});

/**
 * The camera-feed screen beside the LED wall: what the livestream camera sees
 * (a developer hunched over a laptop under the stage wash) with a lower third
 * "YOTTA · LIVE". On two black ground-support posts; `w` × `h`, its foot
 * `lift` up. The origin at the middle of the posts' feet, on the face.
 */
export function feedScreen(w: number, h: number, lift: number): SetPiece {
  return once(`feed:${w.toFixed(2)}:${h.toFixed(2)}:${lift.toFixed(2)}`, () =>
    looks([w + 0.2, 0.4], 1, (b) => {
      const cy = lift + h / 2;
      for (const s of [-1, 1]) {
        b.box(0.08, lift + h, 0.08, STEEL, { at: [s * (w / 2 - 0.3), (lift + h) / 2, -0.2] }, 0);
        b.box(0.5, 0.04, 0.5, STEEL, { at: [s * (w / 2 - 0.3), 0.02, -0.2] }, 0);
      }
      b.box(w + 0.16, h + 0.16, 0.14, 0x16171c, { at: [0, cy, -0.08] }, 0.02);
      // A stage-lit backdrop, a developer and their laptop.
      glowPlane(b, w, h, 0x1e2448, [0, cy, 0]);
      glowPlane(b, w, h * 0.35, 0x2c3466, [0, lift + h * 0.18, 0.002]);
      const px = w * 0.08;
      b.add(
        new THREE.CircleGeometry(h * 0.16, 18),
        0xe0b090,
        { at: [px, lift + h * 0.62, 0.006] },
        'glow',
      );
      b.add(
        new THREE.CircleGeometry(h * 0.17, 18, 0, Math.PI),
        0x3a2a1e,
        { at: [px, lift + h * 0.66, 0.008] },
        'glow',
      );
      b.add(
        new THREE.CircleGeometry(h * 0.34, 20, 0, Math.PI),
        0x7a52e0,
        { at: [px, lift + h * 0.12, 0.004] },
        'glow',
      );
      glowPlane(b, w * 0.3, h * 0.2, 0xb8c0cc, [px, lift + h * 0.18, 0.01], [0, 0, 0]);
      b.add(
        new THREE.CircleGeometry(0.05, 10),
        SLIDE_WHITE,
        { at: [px, lift + h * 0.18, 0.012] },
        'glow',
      );
      // The lower third, and the corner bug.
      glowPlane(b, w * 0.62, h * 0.15, VIOLET_DEEP, [-w * 0.15, lift + h * 0.12, 0.014]);
      letters(b, 'YOTTA · LIVE', -w * 0.15, lift + h * 0.12, 0.018, h * 0.022, SLIDE_WHITE, true);
      b.add(
        new THREE.CircleGeometry(0.06, 12),
        TALLY,
        { at: [w / 2 - 0.25, lift + h - 0.2, 0.012] },
        'glow',
      );
    }),
  );
}

/**
 * The Q&A ticker: a long low LED strip on two posts where the investors'
 * questions come in, "Q&A · 12 NEW" in amber and request cards scrolling
 * by. `w` wide, `h` tall, its foot `lift` up; the origin at its middle, on the
 * face, on the ground.
 */
export function qaTicker(w: number, h: number, lift: number): SetPiece {
  return once(`ticker:${w.toFixed(2)}:${h.toFixed(2)}:${lift.toFixed(2)}`, () =>
    looks([w, 0.3], 1, (b) => {
      const cy = lift + h / 2;
      for (const s of [-1, 1]) {
        b.box(0.07, lift, 0.07, STEEL, { at: [s * (w / 2 - 0.25), lift / 2, -0.12] }, 0);
        b.box(0.4, 0.04, 0.4, STEEL, { at: [s * (w / 2 - 0.25), 0.02, -0.12] }, 0);
      }
      b.box(w + 0.1, h + 0.1, 0.12, 0x16171c, { at: [0, cy, -0.07] }, 0.015);
      glowPlane(b, w, h, 0x15122a, [0, cy, 0]);
      const tag = 'Q&A · 12 NEW';
      const tpx = h * 0.1;
      const tw = textWidth(tag) * tpx;
      glowPlane(b, tw + 0.2, h * 0.8, 0x3a2a10, [-w / 2 + 0.1 + tw / 2 + 0.1, cy, 0.003]);
      letters(b, tag, -w / 2 + 0.2 + tw / 2, cy, 0.008, tpx, AMBER, true);
      // Request cards: a white card, a coloured tag, two grey lines.
      for (let x = -w / 2 + tw + 0.55, k = 0; x + 0.7 < w / 2; x += 0.95, k++) {
        glowPlane(b, 0.82, h * 0.72, 0xe8e4f0, [x + 0.41, cy, 0.003]);
        glowPlane(b, 0.12, h * 0.4, nth([0x9a6cff, 0x5ac8f0, 0xf0a04a, 0x5cd88a], k), [
          x + 0.12,
          cy,
          0.006,
        ]);
        glowPlane(b, 0.5, h * 0.09, 0x6a6878, [x + 0.48, cy + h * 0.12, 0.006]);
        glowPlane(b, 0.36 - (k % 2) * 0.1, h * 0.09, 0x8a8898, [x + 0.41, cy - h * 0.12, 0.006]);
      }
    }),
  );
}

// ---- Truss, lights and sound ----

/** A square box-truss column `h` tall, 0.3 across, from y0 up, at (x, z). */
function trussColumn(b: ModelBuilder, x: number, z: number, y0: number, h: number): void {
  const a = 0.13;
  for (const [dx, dz] of [
    [-a, -a],
    [a, -a],
    [-a, a],
    [a, a],
  ] as const)
    b.cylinder(0.022, 0.022, h, TRUSS, { at: [x + dx, y0 + h / 2, z + dz] }, 6);
  const step = 0.36;
  for (let y = y0 + 0.05, k = 0; y < y0 + h; y += step, k++) {
    for (const dz of [-a, a]) b.box(a * 2, 0.014, 0.014, TRUSS, { at: [x, y, z + dz] }, 0);
    for (const dx of [-a, a]) b.box(0.014, 0.014, a * 2, TRUSS, { at: [x + dx, y, z] }, 0);
    // Zig-zag lacing on the faces the camera sees.
    if (y + step < y0 + h) {
      const s = k % 2 ? 1 : -1;
      const len = Math.hypot(a * 2, step);
      const tilt = Math.atan2(step, a * 2) * s;
      b.box(len, 0.012, 0.012, TRUSS, { at: [x, y + step / 2, z + a], rot: [0, 0, tilt] }, 0);
      for (const dx of [-a, a])
        b.box(0.012, 0.012, len, TRUSS, { at: [x + dx, y + step / 2, z], rot: [tilt, 0, 0] }, 0);
    }
  }
}

/** A box-truss beam along x from x0 to x1 at height y (its middle), at depth z. */
function trussBeam(b: ModelBuilder, x0: number, x1: number, y: number, z: number): void {
  const a = 0.13;
  const len = x1 - x0;
  const cx = (x0 + x1) / 2;
  for (const [dy, dz] of [
    [-a, -a],
    [a, -a],
    [-a, a],
    [a, a],
  ] as const)
    b.cylinder(0.022, 0.022, len, TRUSS, { at: [cx, y + dy, z + dz], rot: [0, 0, Math.PI / 2] }, 6);
  const step = 0.36;
  for (let x = x0 + 0.05, k = 0; x < x1; x += step, k++) {
    b.box(0.014, a * 2, 0.014, TRUSS, { at: [x, y, z + a] }, 0);
    b.box(0.014, 0.014, a * 2, TRUSS, { at: [x, y - a, z] }, 0);
    if (x + step < x1) {
      const s = k % 2 ? 1 : -1;
      const len2 = Math.hypot(a * 2, step);
      b.box(
        len2,
        0.012,
        0.012,
        TRUSS,
        {
          at: [x + step / 2, y, z + a],
          rot: [0, 0, Math.atan2(a * 2, step) * s],
        },
        0,
      );
    }
  }
}

/** A par can hung under a beam whose bottom is at y: clamp, yoke, black can aimed down and forward. */
function parCan(b: ModelBuilder, x: number, y: number, z: number, aim: number): void {
  b.box(0.06, 0.06, 0.06, STEEL, { at: [x, y - 0.03, z] }, 0);
  b.box(0.2, 0.02, 0.02, STEEL, { at: [x, y - 0.1, z] }, 0);
  b.cylinder(0.075, 0.09, 0.26, BLACK, { at: [x, y - 0.2, z + 0.05], rot: [aim, 0, 0] }, 12);
  const dy = -Math.cos(aim) * 0.13;
  const dz = Math.sin(aim) * 0.13;
  b.add(
    new THREE.CircleGeometry(0.068, 12),
    LAMP,
    { at: [x, y - 0.2 + dy - 0.004, z + 0.05 + dz + 0.004], rot: [aim - Math.PI / 2, 0, 0] },
    'glow',
  );
}

/** A moving head standing on y (or hung under it when `hung`): base, yoke, head, its lens. */
function movingHead(
  b: ModelBuilder,
  x: number,
  y: number,
  z: number,
  hung: boolean,
  tilt: number,
): void {
  const s = hung ? -1 : 1;
  b.box(0.26, 0.1, 0.22, BLACK, { at: [x, y + s * 0.05, z] }, 0.02);
  for (const dx of [-0.11, 0.11])
    b.box(0.03, 0.18, 0.08, BLACK, { at: [x + dx, y + s * 0.18, z] }, 0);
  const hy = y + s * 0.24;
  b.cylinder(0.08, 0.1, 0.22, 0x2a2b31, { at: [x, hy, z], rot: [tilt, 0, 0] }, 14);
  const ly = hy + Math.cos(tilt) * 0.11 * s;
  const lz = z + Math.sin(tilt) * 0.11 * s;
  b.add(
    new THREE.CircleGeometry(0.07, 14),
    0xd8e8ff,
    { at: [x, ly, lz + 0.006], rot: [tilt - Math.PI / 2 + (hung ? Math.PI : 0), 0, 0] },
    'glow',
  );
}

/** A line array of `n` cabinets hung from a bumper at y (its top), curving in at the foot. */
function lineArray(b: ModelBuilder, x: number, y: number, z: number, n: number): void {
  b.box(0.66, 0.05, 0.42, STEEL, { at: [x, y - 0.025, z] }, 0);
  let cy = y - 0.06;
  let tilt = 0;
  for (let i = 0; i < n; i++) {
    const hh = 0.24;
    b.box(0.62, hh, 0.4, 0x1e1f24, { at: [x, cy - hh / 2, z], rot: [tilt, 0, 0] }, 0.015);
    b.box(
      0.54,
      hh - 0.06,
      0.01,
      0x3a3c44,
      {
        at: [x, cy - hh / 2 - Math.sin(tilt) * 0.2, z + Math.cos(tilt) * 0.2],
        rot: [tilt, 0, 0],
      },
      0,
    );
    cy -= hh + 0.014;
    tilt += 0.06;
  }
}

/**
 * The stage's truss rig: two box-truss towers `span` apart (centres) on
 * base plates, `h` tall, a box-truss beam across their tops reaching
 * `over` past each, par cans and moving heads hung under the beam, a moving
 * head on each tower's top, a line array hung off each tower on a steel
 * arm, outside the towers, and a stack of subs at each tower's foot. The origin
 * at the middle between the towers' feet. `hot`: its lamps glow.
 */
export function trussRig(span: number, h: number, over: number): SetPiece {
  return once(`rig:${span.toFixed(2)}:${h.toFixed(2)}:${over.toFixed(2)}`, () =>
    looks([span + over * 2, 0.6], 1, (b) => {
      const half = span / 2;
      for (const s of [-1, 1]) {
        const x = s * half;
        b.box(0.62, 0.04, 0.62, STEEL, { at: [x, 0.02, 0] }, 0);
        trussColumn(b, x, 0, 0.04, h - 0.2);
        movingHead(b, x, h + 0.14, 0, false, 0.5);
        // The line array on a steel arm off the tower, and the subs at the tower's foot.
        const ax = x + s * 0.62;
        const ay = h * 0.72;
        b.box(0.62, 0.06, 0.06, STEEL, { at: [x + s * 0.31, ay + 0.03, 0.02] }, 0);
        b.box(
          0.04,
          0.3,
          0.04,
          STEEL,
          { at: [x + s * 0.2, ay - 0.1, 0.02], rot: [0, 0, s * 0.8] },
          0,
        );
        lineArray(b, ax, ay, 0.02, 4);
        for (let k = 0; k < 2; k++)
          b.box(0.6, 0.42, 0.5, 0x1a1b20, { at: [x + s * 0.6, 0.21 + k * 0.43, 0.05] }, 0.02);
        b.box(0.5, 0.32, 0.01, 0x2c2e36, { at: [x + s * 0.6, 0.64, 0.305] }, 0);
      }
      trussBeam(b, -half - over, half + over, h, 0);
      // A lighting batten out in front of the screen on arms off the beam, the lamps hung from it.
      const bz = 0.55;
      const by = h - 0.04;
      b.cylinder(0.025, 0.025, span - 0.4, TRUSS, { at: [0, by, bz], rot: [0, 0, Math.PI / 2] }, 8);
      for (
        let x = -half + 0.3;
        x <= half - 0.3 + 0.01;
        x += (span - 0.6) / Math.max(1, Math.round((span - 0.6) / 2))
      ) {
        b.box(0.03, 0.03, bz + 0.1, TRUSS, { at: [x, by, bz / 2] }, 0);
      }
      for (let x = -half + 0.55, k = 0; x < half - 0.4; x += 0.6, k++) {
        if (k % 4 === 2) movingHead(b, x, by - 0.03, bz, true, -0.6);
        else parCan(b, x, by - 0.03, bz, 0.6);
      }
    }),
  );
}

// ---- Front: the stage lip and the audience ----

/** The footlights' warm strip. */
const FOOTLIGHT = 0xffb060;

/**
 * Footlights: a black rail `len` long along +x with a warm lit strip down its
 * front and a small lamp post at its start (`hot`). Under 0.08 high.
 */
export function footlights(len: number): SetPiece {
  return once(`foot:${len.toFixed(2)}`, () =>
    looks([len, 0.08], 1, (b) => {
      b.box(len, 0.03, 0.06, BLACK, { at: [len / 2, 0.015, 0] }, 0);
      glowBox(b, len - 0.04, 0.03, 0.01, FOOTLIGHT, [len / 2, 0.018, 0.034]);
      glowBox(b, len - 0.04, 0.008, 0.035, FOOTLIGHT, [len / 2, 0.034, 0.012]);
      b.box(0.07, 0.07, 0.07, BLACK, { at: [0.06, 0.035, 0] }, 0.01);
      b.led(0.022, LAMP, { at: [0.06, 0.05, 0.036] });
    }),
  );
}

/**
 * A stage monitor wedge on the lip, its sloped grille facing the stage
 * (−z); 0.12 high, so it stays low in front of the level.
 */
export const monitorWedge = looks([0.44, 0.3], 1, (b) => {
  const shape = new THREE.Shape();
  shape.moveTo(-0.15, 0);
  shape.lineTo(0.15, 0);
  shape.lineTo(0.15, 0.115);
  shape.lineTo(-0.05, 0.115);
  shape.lineTo(-0.15, 0.04);
  shape.lineTo(-0.15, 0);
  const g = new THREE.ExtrudeGeometry(shape, { depth: 0.42, bevelEnabled: false });
  // The profile is in z-y: turn it so the sloped face looks toward −z.
  g.translate(0, 0, -0.21);
  g.rotateY(Math.PI / 2);
  b.add(g, BLACK, { at: [0, 0, 0], rot: [0, Math.PI, 0] });
  b.box(0.36, 0.006, 0.18, 0x3a3c44, { at: [0, 0.117, 0.04] }, 0);
  b.box(0.38, 0.02, 0.04, ALU, { at: [0, 0.1, 0.15] }, 0);
});

/**
 * An investor's seat in the front row, facing the stage (−z): black, on a
 * steel frame, a white "RESERVED" card hung over its back (toward the
 * camera). Look 1 has a phone face-up on the seat, its screen lit; look 2
 * the card lying on the seat. Under 0.6 high.
 */
export const seat = looks([0.5, 0.5], 3, (b, v) => {
  const plush = 0x5a2832;
  // Black side standards with armrests, the seat and the back in muted burgundy plush.
  for (const x of [-0.25, 0.25]) {
    b.box(0.05, 0.3, 0.4, 0x18191d, { at: [x, 0.15, 0.02] }, 0.015);
    b.box(0.07, 0.035, 0.42, 0x2a2b30, { at: [x, 0.315, 0.0] }, 0.012);
  }
  b.box(0.42, 0.09, 0.38, plush, { at: [0, 0.28, -0.02] }, 0.035);
  b.box(0.44, 0.3, 0.1, plush, { at: [0, 0.4, 0.19], rot: [0.14, 0, 0] }, 0.04);
  b.box(0.44, 0.26, 0.012, 0x1e1f24, { at: [0, 0.39, 0.245], rot: [0.14, 0, 0] }, 0.005);
  if (v === 2) {
    b.box(0.16, 0.004, 0.1, 0xf2f0ea, { at: [0.04, 0.328, -0.05], rot: [0, 0.2, 0] }, 0);
  } else {
    // The card folded over the back's top: the front half on the camera side.
    b.box(0.17, 0.006, 0.07, 0xf2f0ea, { at: [0, 0.556, 0.18] }, 0);
    b.box(0.17, 0.085, 0.005, 0xf2f0ea, { at: [0, 0.51, 0.255], rot: [0.14, 0, 0] }, 0);
    letters(b, 'RESERVED', 0, 0.512, 0.26, 0.005, 0x2a2a30, false, 0.003);
  }
  if (v === 1) {
    b.box(0.08, 0.012, 0.15, 0x111114, { at: [-0.08, 0.33, -0.06], rot: [0, -0.3, 0] }, 0);
    b.add(
      new THREE.PlaneGeometry(0.066, 0.13),
      0xa8d4ff,
      { at: [-0.08, 0.338, -0.06], rot: [-Math.PI / 2, 0, -0.3] },
      'glow',
    );
  }
});

// ---- The wings ----

/** Flight cases: width, height, depth of each look (`flightCase` variant). */
export const CASE_SIZES: readonly (readonly [number, number, number])[] = [
  [0.7, 0.45, 0.5],
  [0.9, 0.52, 0.56],
  [0.56, 0.38, 0.46],
  [1.0, 0.62, 0.6],
  [0.8, 0.42, 0.5],
];
const STENCILS = ['YOTTA', 'AUDIO', 'LAUNCHPAD', 'VIDEO', 'FRAGILE'];

/**
 * A black flight case with aluminium edging, corner caps, latches and a
 * handle, a white stencil on its front: five sizes (`CASE_SIZES`).
 */
export const flightCase = looks([1, 0.6], CASE_SIZES.length, (b, v) => {
  const [w, h, d] = nth(CASE_SIZES, v);
  b.box(w, h, d, tint(CASE, (v % 3) * 0.03), { at: [0, h / 2, 0] }, 0.015);
  // Aluminium edging along the lid line and round the bottom, corner caps.
  for (const y of [0.02, h * 0.62, h - 0.02]) {
    b.box(w + 0.01, 0.025, 0.012, ALU, { at: [0, y, d / 2] }, 0);
    b.box(w + 0.01, 0.025, 0.012, ALU, { at: [0, y, -d / 2] }, 0);
    b.box(0.012, 0.025, d + 0.01, ALU, { at: [w / 2, y, 0] }, 0);
    b.box(0.012, 0.025, d + 0.01, ALU, { at: [-w / 2, y, 0] }, 0);
  }
  for (const sx of [-1, 1])
    for (const sz of [-1, 1])
      for (const y of [0.03, h - 0.03])
        b.box(
          0.06,
          0.06,
          0.06,
          CAP,
          { at: [(sx * (w - 0.04)) / 2, y, (sz * (d - 0.04)) / 2] },
          0.01,
        );
  // Latches and a handle on the front.
  for (const sx of [-0.3, 0.3])
    b.box(0.06, 0.05, 0.02, CAP, { at: [sx * w, h * 0.62, d / 2 + 0.01] }, 0);
  b.box(0.16, 0.025, 0.03, BLACK, { at: [0, h - 0.06, d / 2 + 0.012] }, 0);
  letters(
    b,
    nth(STENCILS, v),
    0,
    h * 0.32,
    d / 2 + 0.004,
    Math.min(0.022, (w * 0.7) / textWidth(nth(STENCILS, v))),
    0xd8d8d2,
    false,
    0.004,
  );
  // A strip of gaffer on the lid, the odd scuff.
  b.box(w * 0.4, 0.004, 0.06, GAFFER, { at: [w * 0.1, h + 0.002, 0.04] }, 0);
});

/** A small flight case held in both hands (by the stagehand). */
export const heldCase = looks([0.42, 0.28], 1, (b) => {
  b.box(0.42, 0.26, 0.28, CASE, { at: [0, 0, 0] }, 0.015);
  for (const y of [-0.12, 0.04, 0.12]) b.box(0.43, 0.02, 0.29, ALU, { at: [0, y, 0] }, 0);
  for (const sx of [-1, 1]) b.box(0.05, 0.05, 0.05, CAP, { at: [sx * 0.19, 0.11, 0.12] }, 0.01);
});

/** A rolling rack of three cable drums: orange, black and blue cable on steel reels. */
export const cableSpools = looks([0.9, 0.55], 1, (b) => {
  b.box(0.9, 0.04, 0.5, STEEL, { at: [0, 0.12, 0] }, 0);
  for (const sx of [-0.4, 0.4])
    for (const sz of [-0.2, 0.2]) {
      b.cylinder(0.05, 0.05, 0.04, 0x111114, { at: [sx, 0.05, sz], rot: [0, 0, Math.PI / 2] }, 10);
      b.box(0.03, 0.75, 0.03, STEEL, { at: [sx, 0.5, sz] }, 0);
    }
  b.box(0.86, 0.03, 0.03, STEEL, { at: [0, 0.86, -0.2] }, 0);
  b.box(0.86, 0.03, 0.03, STEEL, { at: [0, 0.86, 0.2] }, 0);
  const cables = [0xe0782a, 0x1c1c20, 0x3a72c8];
  cables.forEach((c, i) => {
    const x = -0.27 + i * 0.27;
    const y = i === 1 ? 0.62 : 0.4;
    b.cylinder(0.2, 0.2, 0.02, 0x6a6e76, { at: [x - 0.1, y, 0], rot: [0, 0, Math.PI / 2] }, 16);
    b.cylinder(0.2, 0.2, 0.02, 0x6a6e76, { at: [x + 0.1, y, 0], rot: [0, 0, Math.PI / 2] }, 16);
    b.cylinder(0.16, 0.16, 0.18, c, { at: [x, y, 0], rot: [0, 0, Math.PI / 2] }, 16);
  });
});

/**
 * The stage manager's prompt desk: a black lectern with a sloped top, the
 * running order and script on it under a blue gooseneck lamp, a cue monitor
 * and the cue light box (red standby, green go). `hot`: its lamps glow.
 */
export const promptDesk = looks([0.7, 0.5], 1, (b) => {
  b.box(0.62, 0.86, 0.42, BLACK, { at: [0, 0.43, 0] }, 0.02);
  b.box(0.7, 0.04, 0.5, STEEL, { at: [0, 0.9, 0.02], rot: [0.28, 0, 0] }, 0.01);
  b.box(0.28, 0.006, 0.36, 0xeeeae0, { at: [-0.12, 0.93, 0.03], rot: [0.28, 0, 0.04] }, 0);
  b.box(0.22, 0.006, 0.3, 0xe8e2d0, { at: [0.15, 0.935, 0.05], rot: [0.28, 0, -0.08] }, 0);
  // The cue monitor on an arm.
  b.box(0.3, 0.2, 0.03, 0x111114, { at: [0.12, 1.12, -0.18], rot: [-0.25, 0, 0] }, 0.01);
  glowPlane(b, 0.26, 0.16, 0x7aa8e8, [0.12, 1.12, -0.162], [-0.25, 0, 0]);
  // The gooseneck lamp, blue.
  b.cylinder(0.01, 0.01, 0.3, STEEL, { at: [-0.26, 1.08, -0.12], rot: [0.5, 0, 0] }, 6);
  b.cone(0.04, 0.07, STEEL, { at: [-0.26, 1.2, -0.02], rot: [2.4, 0, 0] }, 10);
  b.led(0.025, 0x6aa0ff, { at: [-0.26, 1.18, 0.0] });
  // The cue light box on the side.
  b.box(0.14, 0.1, 0.08, 0x111114, { at: [0.3, 0.98, 0.1] }, 0.01);
  b.led(0.025, TALLY, { at: [0.27, 0.99, 0.145] });
  b.led(0.025, GREEN, { at: [0.33, 0.99, 0.145] });
});

/**
 * "QUIET · LIVE ON STAGE": a lit sign box on a stand, red letters (`hot`).
 */
export const quietSign = looks([0.8, 0.4], 1, (b) => {
  b.cylinder(0.2, 0.22, 0.03, STEEL, { at: [0, 0.015, 0] }, 16);
  b.cylinder(0.02, 0.02, 1.35, STEEL, { at: [0, 0.68, 0] }, 8);
  b.box(0.82, 0.34, 0.1, 0x111114, { at: [0, 1.5, 0] }, 0.02);
  glowPlane(b, 0.76, 0.28, 0x3a0a0e, [0, 1.5, 0.051]);
  letters(b, 'QUIET', 0, 1.56, 0.06, 0.03, 0xff4a4a, true, 0.008);
  letters(b, 'LIVE ON STAGE', 0, 1.43, 0.06, 0.0125, 0xffd0c8, true, 0.006);
});

/** Roll-up banners of the next startups up: their colours and names. */
const BANNERS = [
  { name: 'NIMBUS', back: 0x2a7a7a, band: 0xe8f4f0, ink: 0x123a3a },
  { name: 'QUBIT', back: 0xd86a3a, band: 0x2a1e1a, ink: 0xf8e8d8 },
];

/**
 * The next startup's roll-up banner: a cassette base, a pole and a printed
 * banner (their name, a big shape, a slogan bar), 2.0 high.
 */
export const rollUpBanner = looks([0.85, 0.3], BANNERS.length, (b, v) => {
  const s = nth(BANNERS, v);
  b.box(0.86, 0.08, 0.22, ALU, { at: [0, 0.04, 0] }, 0.02);
  b.cylinder(0.012, 0.012, 2.0, STEEL, { at: [0, 1.0, -0.06] }, 6);
  b.box(0.8, 1.9, 0.01, s.back, { at: [0, 1.04, -0.04] }, 0);
  b.box(0.8, 0.4, 0.012, s.band, { at: [0, 1.75, -0.035] }, 0);
  letters(b, s.name, 0, 1.75, -0.026, 0.038, s.ink, false, 0.004);
  b.cylinder(0.24, 0.24, 0.014, s.band, { at: [0, 1.05, -0.03], rot: [Math.PI / 2, 0, 0] }, 6);
  b.box(0.6, 0.06, 0.012, s.band, { at: [0, 0.5, -0.035] }, 0);
  b.box(0.45, 0.06, 0.012, tint(s.band, -0.2), { at: [0, 0.38, -0.035] }, 0);
});

/** A lanyard rail: two posts, a bar, a row of hanging lanyards with white badges. */
export const lanyardRail = looks([1.0, 0.4], 1, (b) => {
  for (const x of [-0.45, 0.45]) {
    b.box(0.03, 1.3, 0.03, STEEL, { at: [x, 0.65, 0] }, 0);
    b.box(0.3, 0.02, 0.3, STEEL, { at: [x, 0.01, 0] }, 0);
  }
  b.box(0.94, 0.025, 0.025, STEEL, { at: [0, 1.28, 0] }, 0);
  const straps = [0x9a6cff, 0x9a6cff, 0xe0782a, 0x9a6cff, 0x3a72c8, 0x9a6cff, 0x2a2a30];
  straps.forEach((c, i) => {
    const x = -0.36 + i * 0.12;
    const drop = 0.32 + (i % 3) * 0.04;
    b.box(0.02, drop, 0.006, c, { at: [x - 0.02, 1.27 - drop / 2, 0.02], rot: [0, 0, 0.08] }, 0);
    b.box(0.02, drop, 0.006, c, { at: [x + 0.02, 1.27 - drop / 2, 0.02], rot: [0, 0, -0.08] }, 0);
    b.box(0.08, 0.11, 0.006, 0xf2f0ea, { at: [x, 1.27 - drop - 0.05, 0.024] }, 0);
    b.box(0.06, 0.02, 0.004, c, { at: [x, 1.27 - drop - 0.02, 0.028] }, 0);
  });
});

// ---- The tech side ----

/**
 * The livestream camera on a tripod, its lens along +z: splayed legs, a
 * spreader, a fluid head with a pan bar, a broadcast camera with its
 * viewfinder and a red tally light (`hot`). About 1.4 high.
 */
export const streamCamera = looks([0.6, 0.6], 1, (b) => {
  const head: [number, number, number] = [0, 1.08, 0];
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2 + Math.PI / 3;
    const foot: [number, number, number] = [Math.sin(a) * 0.36, 0, Math.cos(a) * 0.36];
    rod(b, foot, head, 0.018, 0x9aa0a8);
    rod(b, [foot[0] * 0.45, 0.32, foot[2] * 0.45], [0, 0.34, 0], 0.01, STEEL);
  }
  b.cylinder(0.08, 0.09, 0.1, 0x2a2b30, { at: [0, 1.12, 0] }, 12);
  rod(b, [0, 1.14, -0.1], [0.14, 1.05, -0.5], 0.012, STEEL);
  // A grey broadcast camera, its lens forward (+z), a carry handle and the red tally on top.
  b.box(0.22, 0.24, 0.46, 0x5a5e68, { at: [0, 1.3, 0.0] }, 0.03);
  b.box(0.04, 0.05, 0.3, 0x2a2b30, { at: [0, 1.45, 0.0] }, 0.01);
  b.cylinder(0.075, 0.085, 0.3, 0x16171a, { at: [0, 1.3, 0.38], rot: [Math.PI / 2, 0, 0] }, 14);
  b.box(0.24, 0.2, 0.03, 0x16171a, { at: [0, 1.3, 0.55] }, 0);
  b.box(0.17, 0.12, 0.1, 0x16171a, { at: [-0.06, 1.44, -0.22] }, 0.01);
  glowPlane(b, 0.14, 0.09, 0x8a7ad8, [-0.06, 1.44, -0.272], [0, Math.PI, 0]);
  glowPlane(b, 0.12, 0.06, TALLY, [0, 1.424, 0.12], [-Math.PI / 2, 0, 0]);
  b.led(0.03, TALLY, { at: [0, 1.46, 0.2] });
});

/** A rod of radius `r` from point `p0` to `p1`. */
function rod(
  b: ModelBuilder,
  p0: [number, number, number],
  p1: [number, number, number],
  r: number,
  color: number,
): void {
  const a = new THREE.Vector3(...p0);
  const c = new THREE.Vector3(...p1);
  const dir = c.clone().sub(a);
  const g = new THREE.CylinderGeometry(r, r, dir.length(), 6);
  g.applyQuaternion(
    new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize()),
  );
  const m = a.add(c).multiplyScalar(0.5);
  g.translate(m.x, m.y, m.z);
  b.add(g, color, {});
}

/**
 * The vision mixer on a flight case: the case open as a desk, the mixer's
 * rows of lit buttons and its T-bar, two small monitors on top (the camera
 * preview and the programme: YOTTA's slide). Faces +z; `hot`.
 */
export const visionMixer = looks([1.0, 0.65], 1, (b) => {
  b.box(0.98, 0.7, 0.6, CASE, { at: [0, 0.35, 0] }, 0.015);
  for (const y of [0.02, 0.68]) b.box(0.99, 0.025, 0.61, ALU, { at: [0, y, 0] }, 0);
  for (const sx of [-1, 1])
    for (const sz of [-1, 1])
      b.box(0.06, 0.06, 0.06, CAP, { at: [sx * 0.47, 0.67, sz * 0.27] }, 0.01);
  b.box(0.8, 0.05, 0.42, 0x2a2b31, { at: [0, 0.73, 0.04], rot: [0.12, 0, 0] }, 0.01);
  const colors = [TALLY, GREEN, AMBER, 0xe8e8f0, 0x6aa0ff];
  for (let r = 0; r < 3; r++)
    for (let c = 0; c < 9; c++) {
      const on = (r * 5 + c * 3) % 7;
      b.add(
        new THREE.BoxGeometry(0.045, 0.012, 0.045),
        on < 2 ? nth(colors, r + c) : 0x3a3c44,
        {
          at: [-0.3 + c * 0.065, 0.765 + r * 0.01, 0.14 - r * 0.08],
          rot: [0.12, 0, 0],
        },
        on < 2 ? 'glow' : 'body',
      );
    }
  b.box(0.04, 0.12, 0.04, 0xe8e8f0, { at: [0.32, 0.82, 0.08], rot: [0.4, 0, 0] }, 0);
  // Two monitors on a bar.
  b.box(0.04, 0.3, 0.04, STEEL, { at: [0, 0.9, -0.22] }, 0);
  for (const s of [-1, 1]) {
    b.box(0.4, 0.26, 0.04, 0x111114, { at: [s * 0.22, 1.12, -0.22], rot: [0, -s * 0.15, 0] }, 0.01);
    const at: [number, number, number] = [s * 0.22 - s * 0.003, 1.12, -0.198];
    glowPlane(b, 0.36, 0.22, s < 0 ? 0x3a3a68 : 0x5a38c8, at, [0, -s * 0.15, 0]);
    if (s > 0) glowPlane(b, 0.12, 0.05, SLIDE_WHITE, [0.2, 1.13, -0.19], [0, -0.15, 0]);
    else glowPlane(b, 0.08, 0.1, VIOLET, [-0.22, 1.09, -0.19], [0, 0.15, 0]);
  }
  b.led(0.02, TALLY, { at: [0.22, 1.27, -0.2] });
});

/** A rolling AV rack: a black case on castors, its rack units with knobs and faders. */
export const avRack = looks([0.62, 0.62], 1, (b) => {
  b.box(0.62, 1.3, 0.62, CASE, { at: [0, 0.71, 0] }, 0.015);
  for (const y of [0.08, 1.34]) b.box(0.63, 0.025, 0.63, ALU, { at: [0, y, 0] }, 0);
  for (const sx of [-0.25, 0.25])
    for (const sz of [-0.25, 0.25])
      b.cylinder(0.04, 0.04, 0.04, 0x111114, { at: [sx, 0.03, sz], rot: [0, 0, Math.PI / 2] }, 10);
  for (let r = 0; r < 7; r++) {
    const y = 0.22 + r * 0.16;
    b.box(0.52, 0.13, 0.02, r % 3 === 1 ? 0x3a3c44 : 0x24252b, { at: [0, y, 0.31] }, 0);
    for (let k = 0; k < 4; k++)
      b.cylinder(
        0.014,
        0.014,
        0.02,
        0x8a8e96,
        { at: [0.04 + k * 0.05, y, 0.325], rot: [Math.PI / 2, 0, 0] },
        8,
      );
  }
});

/** The AV rack's status LEDs (`blink` alive, `hot`): sits on `avRack`'s face. */
export const rackLeds = looks([0.4, 0.05], 1, (b) => {
  b.box(0.16, 1.1, 0.008, 0x18191d, { at: [-0.155, 0.7, 0.322] }, 0);
  for (let r = 0; r < 7; r++) {
    const y = 0.22 + r * 0.16;
    for (let k = 0; k < 3; k++) {
      const c = (r + k) % 4 === 0 ? AMBER : (r + k) % 4 === 2 ? 0x7ab8ff : GREEN;
      b.led(0.014, c, { at: [-0.2 + k * 0.045, y, 0.33] });
    }
  }
});

/**
 * The pitch's countdown clock on a stand, red digits "02:59" on black
 * (`hot`); faces +z, 1.55 high.
 */
export const countdownClock = looks([0.9, 0.4], 1, (b) => {
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2;
    b.box(
      0.03,
      0.03,
      0.42,
      STEEL,
      { at: [Math.sin(a) * 0.18, 0.03, Math.cos(a) * 0.18], rot: [0.12, a, 0] },
      0,
    );
  }
  b.cylinder(0.025, 0.025, 1.2, STEEL, { at: [0, 0.65, 0] }, 8);
  b.box(0.98, 0.4, 0.14, 0x111114, { at: [0, 1.35, 0] }, 0.02);
  glowPlane(b, 0.9, 0.32, 0x2a0606, [0, 1.35, 0.071]);
  letters(b, '02:59', 0, 1.35, 0.08, 0.052, 0xff2a1a, true, 0.01);
});

/** A haze machine: a black box with a nozzle (along +z), a carry handle, a lit control. */
export const hazeMachine = looks([0.5, 0.35], 1, (b) => {
  b.box(0.32, 0.24, 0.44, BLACK, { at: [0, 0.12, 0] }, 0.02);
  b.box(0.3, 0.03, 0.06, STEEL, { at: [0, 0.26, -0.1] }, 0);
  b.cylinder(0.035, 0.04, 0.1, STEEL, { at: [0, 0.14, 0.27], rot: [Math.PI / 2, 0, 0] }, 10);
  b.led(0.016, GREEN, { at: [0.1, 0.18, 0.222] });
  b.cylinder(0.05, 0.05, 0.16, 0x6a8aa0, { at: [-0.24, 0.08, -0.08] }, 10);
  b.cylinder(0.02, 0.02, 0.03, 0x1d1e23, { at: [-0.24, 0.175, -0.08] }, 8);
});

/** The haze curling from the machine's nozzle: pale puffs, widest at the top (`wisp` alive). */
export const hazeWisp = looks([0.3, 0.3], 1, (b) => {
  const puffs: [number, number, number, number][] = [
    [0, 0.05, 0.0, 0.07],
    [0.02, 0.1, 0.08, 0.1],
    [-0.03, 0.17, 0.15, 0.13],
    [0.03, 0.26, 0.22, 0.16],
  ];
  for (const [x, y, z, r] of puffs)
    b.sphere(r * 0.6, 0x8a90a0, { at: [x, y + 0.08, z] }, [1.3, 0.7, 1]);
});

/**
 * A cable snake `len` long along +x from x = 0: a fat bundle of black
 * cables, a coloured one twisted through, gaffer tape over it every so
 * often. Under 0.06 high.
 */
export function cableSnake(len: number): SetPiece {
  return once(`snake:${len.toFixed(2)}`, () =>
    looks([len, 0.16], 1, (b) => {
      const y = 0.025;
      const run = (dz: number, r: number, c: number) =>
        b.cylinder(r, r, len, c, { at: [len / 2, y, dz], rot: [0, 0, Math.PI / 2] }, 8);
      run(-0.025, 0.022, 0x18191c);
      run(0.012, 0.025, 0x1e1f23);
      run(0.045, 0.016, 0xe0782a);
      run(-0.055, 0.012, 0x3a72c8);
      for (let x = 0.3; x < len - 0.1; x += 0.7)
        b.box(0.08, 0.008, 0.2, 0x75777e, { at: [x, 0.05, 0.0] }, 0);
    }),
  );
}

/** A strip of spike tape on the floor: a small T or L mark in one of four tapes. */
export const spikeMark = looks([0.2, 0.2], 4, (b, v) => {
  const c = nth(SPIKE, v);
  b.box(0.18, 0.004, 0.035, c, { at: [0, 0.002, 0] }, 0);
  if (v % 2) b.box(0.035, 0.004, 0.14, c, { at: [0, 0.002, 0.07] }, 0);
  else b.box(0.035, 0.004, 0.14, c, { at: [-0.075, 0.002, 0.07] }, 0);
});

/** A roll of gaffer tape lying on its side, and one of glow tape. */
export const tapeRolls = looks([0.3, 0.2], 1, (b) => {
  b.cylinder(0.06, 0.06, 0.05, GAFFER, { at: [0, 0.025, 0] }, 14);
  b.cylinder(0.035, 0.035, 0.052, 0xd8d0c0, { at: [0, 0.025, 0] }, 12);
  b.cylinder(0.05, 0.05, 0.04, 0x9af0b8, { at: [0.14, 0.02, 0.04] }, 14);
});

/** A coil of black cable lying on the floor, a taped tail running off it. */
export const cableCoil = looks([0.5, 0.5], 2, (b, v) => {
  const c = v ? 0x1e1f23 : 0x2a2420;
  for (let k = 0; k < 3; k++)
    b.torus(0.17 - k * 0.012, 0.022, c, {
      at: [k * 0.012, 0.022 + k * 0.03, k * 0.01],
      rot: [Math.PI / 2, 0, 0],
    });
  b.cylinder(0.02, 0.02, 0.4, c, { at: [0.36, 0.02, 0.05], rot: [0, 0.3, Math.PI / 2] }, 6);
  b.box(0.06, 0.006, 0.12, 0x75777e, { at: [0.42, 0.04, 0.03] }, 0);
});

/** Swag boxes: brown cartons, violet YOTTA tape over the top, a T-shirt spilling out of the open one. */
export const swagBoxes = looks([0.8, 0.5], 1, (b) => {
  const card = 0x9a7a58;
  b.box(0.42, 0.32, 0.36, card, { at: [-0.18, 0.16, 0] }, 0.012);
  b.box(0.42, 0.012, 0.08, VIOLET_DEEP, { at: [-0.18, 0.325, 0] }, 0);
  b.box(0.36, 0.28, 0.32, tint(card, -0.08), { at: [-0.16, 0.48, 0.02], rot: [0, 0.2, 0] }, 0.012);
  b.box(0.36, 0.012, 0.07, VIOLET_DEEP, { at: [-0.16, 0.625, 0.02], rot: [0, 0.2, 0] }, 0);
  b.box(0.38, 0.26, 0.34, card, { at: [0.25, 0.13, 0.04], rot: [0, -0.15, 0] }, 0.012);
  b.box(0.3, 0.03, 0.26, 0x2a2b30, { at: [0.25, 0.255, 0.04], rot: [0, -0.15, 0] }, 0.01);
  b.box(0.2, 0.012, 0.1, 0xe8e4f0, { at: [0.27, 0.27, 0.06], rot: [0, -0.15, 0] }, 0);
  b.box(0.02, 0.2, 0.34, tint(card, 0.1), { at: [0.45, 0.33, 0.04], rot: [0, -0.15, -0.5] }, 0);
});
