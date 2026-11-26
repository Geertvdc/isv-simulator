import * as THREE from 'three';
import { type ModelBuilder, tint } from '../kit';
import { hash01 } from './midRise';
import { looks, nth, type SetPiece } from './shared';

/**
 * Synergy's world pieces (level 4-2, scene `synergy`; see
 * `docs/plan/synergy-environment.md`): YOTTA Tower's boardroom floor on a
 * summer afternoon, the day MONOLITH came across the river.
 *
 * Behind the back wall, the executive reception: dark stone and walnut
 * slats, the big welcome screen with both logos side by side, a long walnut
 * desk, MONOLITH's entourage in identical black suits and sunglasses, their
 * identical briefcases lined up and their identical coats on the rack,
 * covered catering trolleys (nothing edible on show), a water station, the
 * lanyard table, a "MONOLITH VISITORS" stand, a rope line and speed gates,
 * tall plants, and the facilitator's flip chart with Segfault asleep on top.
 *
 * Outside: setback roofs in the corners, MONOLITH's helicopter on its
 * helipad with a warm glint on its black glass, a convoy of identical black
 * cars in the drop-off far below with their driver waiting, and a window
 * cleaners' gondola parked low on the façade at the front.
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

/** A flat glowing box (an LED strip, a lit letter). */
function glowBox(b: ModelBuilder, w: number, h: number, d: number, color: number, at: V3) {
  b.add(new THREE.BoxGeometry(w, h, d), color, { at }, 'glow');
}

/** A bar from `a` to `c`, `t` thick: a rope, a rail, an arm. */
function bar(b: ModelBuilder, a: V3, c: V3, t: number, color: number): void {
  const d = new THREE.Vector3(c[0] - a[0], c[1] - a[1], c[2] - a[2]);
  const len = d.length();
  if (len < 1e-4) return;
  const g = new THREE.BoxGeometry(t, len, t);
  g.applyQuaternion(
    new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()),
  );
  b.add(g, color, { at: [(a[0] + c[0]) / 2, (a[1] + c[1]) / 2, (a[2] + c[2]) / 2] });
}

/** A round limb from `a` to `c`, `r` thick: an arm in a sleeve. */
function limb(b: ModelBuilder, a: V3, c: V3, r: number, color: number): void {
  const d = new THREE.Vector3(c[0] - a[0], c[1] - a[1], c[2] - a[2]);
  const len = d.length();
  if (len < 1e-4) return;
  const g = new THREE.CapsuleGeometry(r, len, 3, 8);
  g.applyQuaternion(
    new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()),
  );
  b.add(g, color, { at: [(a[0] + c[0]) / 2, (a[1] + c[1]) / 2, (a[2] + c[2]) / 2] });
}

/**
 * A flat box whose color shades vertex by vertex: `color(x, y)` gives each
 * corner's color from where it ends up (in the piece's space).
 */
function shaded(
  b: ModelBuilder,
  w: number,
  h: number,
  d: number,
  at: V3,
  color: (x: number, y: number) => number,
  layer: 'body' | 'glass' = 'body',
): void {
  const g = new THREE.BoxGeometry(w, h, d).toNonIndexed();
  b.add(g, 0xffffff, { at }, layer);
  const pos = g.getAttribute('position');
  const col = g.getAttribute('color');
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    c.set(color(pos.getX(i), pos.getY(i)));
    col.setXYZ(i, c.r, c.g, c.b);
  }
}

/** `a` mixed toward `c` by `t`. */
function mix(a: number, c: number, t: number): number {
  return new THREE.Color(a).lerp(new THREE.Color(c), t).getHex();
}

// ---- Lettering ----

/** A blocky alphabet, 3 wide and 5 high (rows top to bottom): every letter, the digits and a few marks. */
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
  J: '001001001101010',
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
  Z: '111001010100111',
  '0': '111101101101111',
  '1': '010110010010111',
  '2': '110001010100111',
  '3': '111001011001111',
  '4': '101101111001001',
  '5': '111100110001110',
  '6': '011100111101111',
  '7': '111001010010010',
  '8': '111101111101111',
  '9': '111101111001110',
  ':': '000010000010000',
  '-': '000000111000000',
  '!': '010010010000010',
  '.': '000000000000010',
  '×': '000101010101000',
  '>': '100010001010100',
  ' ': '000000000000000',
};

/** Whether every glyph of `text` is in the alphabet. */
export function spellable(text: string): boolean {
  return Array.from(text).every((ch) => ch in FONT);
}

/** How wide `text` runs in pixels: 3 a glyph and 1 between. */
export function textWidth(text: string): number {
  return Array.from(text).length * 4 - 1;
}

/** Calls `cell(u, row, w)` for each run of lit pixels of `text`, centred on 0; row 0 is the top. */
function glyphs(text: string, cell: (u: number, row: number, w: number) => void): void {
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
        cell(k * 4 + c + (e - c) / 2 - cols / 2, r, e - c);
        c = e;
      }
    }
  });
}

/** Letters standing on a face at depth z facing +z, centred on (x, y), `px` a pixel. */
function letters(
  b: ModelBuilder,
  text: string,
  x: number,
  y: number,
  z: number,
  px: number,
  color: number,
  depth = 0.006,
): void {
  glyphs(text, (u, r, w) => {
    flat(b, w * px, px, depth, color, [x + u * px, y + (2 - r) * px, z + depth / 2]);
  });
}

/** Glowing letters on a face at depth z facing +z, centred on (x, y). */
function glowLetters(
  b: ModelBuilder,
  text: string,
  x: number,
  y: number,
  z: number,
  px: number,
  color: number,
): void {
  glyphs(text, (u, r, w) => {
    glowBox(b, w * px, px, 0.004, color, [x + u * px, y + (2 - r) * px, z + 0.002]);
  });
}

// ---- Colors ----

/** The tower's floors stand this high off the ground (the level's floor). */
export const FLOOR = 0.463;
/** YOTTA violet. */
export const VIOLET = 0x8a64d8;
/** The reception: warm grey stone walls, its honed grey floor, walnut, brass, chrome, black steel. */
const STONE = 0x5d5a60;
const STONE_FLOOR = 0x8a8c94;
const STONE_JOINT = 0x62646c;
const WALNUT = 0x5a3c28;
const WALNUT_DARK = 0x3a271c;
const BRASS = 0xb8955a;
const CHROME = 0xc4c9cf;
const BLACK_STEEL = 0x24262a;
/** The catering trolleys' cloth. */
const DRAPE = 0xe9e4da;
const COVE = 0xffe2b8;
/** The wall-washers' warm light on the walnut. */
const WASH = 0xffe2b4;
/** MONOLITH's black: suits, cases, coats, cars; a touch blue so it reads as cloth, not a hole. */
const SUIT = 0x1d1f26;
const SUIT_EDGE = 0x2c2f38;
const SHIRT = 0xe4e4e6;
const SHADES = 0x08090b;
/** Skin, greyed about 30% so the entourage reads as the background, never as a player. */
const SKINS = [0xc8a890, 0xb08a70, 0x9a7a66, 0x7a5e50] as const;
const HAIR = [0x1a1714, 0x2a221c, 0x3a3430] as const;
/** MONOLITH's white, its logo's. */
const MONO_WHITE = 0xf4f8ff;
/** The curtain wall: glass, mullions, blinds. */
const CW_GLASS = 0x8fb0c4;
const CW_MULLION = 0x4b525a;
const BLIND = 0xd8d2c4;
/** Sticky notes, the workshop's colors. */
const NOTES = [0xf6d860, 0xf29ab8, 0x8fd0f0, 0xa8e08a, 0xf6a860] as const;

// ---- The reception: floor, wall, screen ----

/**
 * The reception's floor `w` × `d`, centred, its top at the level's floor:
 * big slabs of honed cool grey stone, each its own tone, fine dark joints
 * and a walnut inlay band round the edge.
 * Stands on the ground.
 */
export function receptionFloor(w: number, d: number): SetPiece {
  return once(`receptionFloor:${w.toFixed(2)}:${d.toFixed(2)}`, () =>
    looks([w, d], 1, (b) => {
      flat(b, w, FLOOR - 0.006, d, STONE_JOINT, [0, (FLOOR - 0.006) / 2, 0]);
      const s = 0.8;
      for (let i = 0, x = -w / 2; x < w / 2 - 0.01; i++, x += s)
        for (let j = 0, z = -d / 2; z < d / 2 - 0.01; j++, z += s) {
          const xb = Math.min(w / 2, x + s);
          const zb = Math.min(d / 2, z + s);
          const tone = (hash01(i, j, 211) - 0.5) * 0.1;
          flat(b, xb - x - 0.012, 0.006, zb - z - 0.012, tint(STONE_FLOOR, tone), [
            (x + xb) / 2,
            FLOOR - 0.003,
            (z + zb) / 2,
          ]);
        }
      // The walnut band, a slab in from the edge.
      const inset = 0.22;
      for (const s2 of [-1, 1]) {
        flat(b, w - inset * 2, 0.002, 0.05, WALNUT, [0, FLOOR + 0.001, s2 * (d / 2 - inset)]);
        flat(b, 0.05, 0.002, d - inset * 2, WALNUT, [s2 * (w / 2 - inset), FLOOR + 0.001, 0]);
      }
    }),
  );
}

/** A zone of walnut slats on the reception wall: its centre and width along x. */
export interface SlatZone {
  x: number;
  w: number;
}

/**
 * The reception's back wall, `w` along x centred on 0 and `h` high, facing +z
 * at z = 0: honed near-black stone slabs; over each of `slats` (zones along
 * x, left to right, apart) vertical walnut slats on a black backing between
 * brass edges (behind the welcome screen, behind the coats); a warm LED cove
 * along its top; a black shadow gap at its foot. Placed on the reception floor.
 */
export function receptionWall(w: number, h: number, slats: readonly SlatZone[]): SetPiece {
  const key = `receptionWall:${w.toFixed(2)}:${h.toFixed(2)}:${slats.map((z) => `${z.x.toFixed(2)}/${z.w.toFixed(2)}`).join(',')}`;
  return once(key, () =>
    looks([w, 0.3], 1, (b) => {
      flat(b, w, h, 0.24, tint(STONE, -0.15), [0, h / 2, -0.12]);
      // Stone slabs between the slat zones, three courses, a pale vein here and there.
      const sh = (h - 0.16) / 3;
      const sw = 0.7;
      const edges = [-w / 2, ...slats.flatMap((z) => [z.x - z.w / 2, z.x + z.w / 2]), w / 2];
      for (let e = 0; e + 1 < edges.length; e += 2) {
        const a = edges[e] ?? 0;
        const c = edges[e + 1] ?? 0;
        for (let i = 0, x = a; x < c - 0.01; i++, x += sw) {
          const xb = Math.min(c, x + sw);
          for (let j = 0; j < 3; j++) {
            const y0 = 0.04 + j * sh;
            flat(
              b,
              xb - x - 0.012,
              sh - 0.012,
              0.01,
              tint(STONE, (hash01(i + e * 7, j, 221) - 0.5) * 0.14),
              [(x + xb) / 2, y0 + sh / 2, 0.005],
            );
            if (hash01(i + e * 7, j, 223) > 0.6)
              flat(
                b,
                (xb - x) * 0.7,
                0.008,
                0.004,
                tint(STONE, 0.25),
                [(x + xb) / 2, y0 + sh * (0.3 + hash01(i, j, 227) * 0.4), 0.012],
                [0, 0, (hash01(i, j, 229) - 0.5) * 0.6],
              );
          }
        }
      }
      // The walnut slats, each zone between brass edges, washed by warm pools of light from
      // downlights in the soffit: near each end of a wide zone, in the middle of a narrow one.
      const pools = slats.flatMap((z) =>
        z.w > 2 ? [z.x - z.w / 2 + 0.38, z.x + z.w / 2 - 0.38] : [z.x],
      );
      const washed = (base: number, x: number, y: number) => {
        let a = 0;
        for (const px of pools) {
          const dx = (x - px) / 0.34;
          a = Math.max(a, Math.exp(-dx * dx) * Math.max(0, (y - h * 0.1) / (h * 0.9)) ** 0.8);
        }
        return mix(base, WASH, a);
      };
      for (const [zi, zone] of slats.entries()) {
        const sx0 = zone.x - zone.w / 2;
        const sx1 = zone.x + zone.w / 2;
        shaded(b, sx1 - sx0, h - 0.12, 0.02, [zone.x, h / 2, 0.01], (x, y) =>
          washed(0x121214, x, y),
        );
        for (let x = sx0 + 0.04, k = 0; x < sx1 - 0.02; x += 0.075, k++) {
          const c = tint(WALNUT, (hash01(k, zi, 231) - 0.5) * 0.14);
          shaded(b, 0.045, h - 0.14, 0.05, [x, h / 2, 0.04], (vx, vy) => washed(c, vx, vy));
        }
        for (const x of [sx0, sx1]) flat(b, 0.018, h - 0.1, 0.06, BRASS, [x, h / 2, 0.04]);
      }
      flat(b, w, 0.04, 0.03, BLACK_STEEL, [0, 0.02, 0.015]);
      // The soffit and its warm cove.
      flat(b, w + 0.02, 0.12, 0.32, 0x1c1c20, [0, h - 0.06, 0.14]);
      glowBox(b, w - 0.1, 0.014, 0.02, COVE, [0, h - 0.125, 0.29]);
      // The wall-washers' trims in the soffit over each pool.
      for (const px of pools) {
        b.cylinder(0.045, 0.045, 0.01, BRASS, { at: [px, h - 0.125, 0.1] }, 12);
        b.add(
          new THREE.CircleGeometry(0.032, 12),
          WASH,
          {
            at: [px, h - 0.131, 0.1],
            rot: [Math.PI / 2, 0, 0],
          },
          'glow',
        );
      }
    }),
  );
}

/**
 * A rug on the reception's stone, `w` × `d`, centred: deep violet-grey wool,
 * a darker border, a fine pale line inside it. Flat planes only.
 */
export function rug(w: number, d: number): SetPiece {
  return once(`rug:${w.toFixed(2)}:${d.toFixed(2)}`, () =>
    looks([w, d], 1, (b) => {
      const lay = (pw: number, pd: number, c: number, y: number) =>
        b.add(new THREE.PlaneGeometry(pw, pd), c, { at: [0, y, 0], rot: [-Math.PI / 2, 0, 0] });
      lay(w, d, 0x2e2a38, 0.006);
      lay(w - 0.12, d - 0.12, 0x8a7aa8, 0.007);
      lay(w - 0.16, d - 0.16, 0x4a4458, 0.008);
    }),
  );
}

/**
 * A big framed artwork for the reception wall, `w` × `h`, facing +z, its
 * centre at the origin: a thin brass frame round a pale canvas, big soft
 * blocks of violet, amber and slate laid across it (an expensive abstract).
 */
export function wallArt(w: number, h: number): SetPiece {
  return once(`wallArt:${w.toFixed(2)}:${h.toFixed(2)}`, () =>
    looks([w, 0.06], 1, (b) => {
      flat(b, w + 0.06, h + 0.06, 0.03, BRASS, [0, 0, 0.015]);
      flat(b, w, h, 0.034, 0xe8e2d6, [0, 0, 0.02]);
      const blocks = [
        [-0.28, 0.12, 0.38, 0.55, 0x6e5a9e],
        [0.05, -0.1, 0.42, 0.5, 0xc49a5e],
        [0.3, 0.18, 0.28, 0.38, 0x4a5462],
        [-0.12, -0.28, 0.5, 0.22, 0x968ab0],
      ] as const;
      for (const [x, y, bw, bh, c] of blocks)
        flat(b, bw * w, bh * h, 0.004, c, [x * w, y * h, 0.039]);
    }),
  );
}

/**
 * A low walnut credenza against the wall, `len` along x, facing +z: four
 * doors with brass pulls, a stone top, and on it a tall black vase of dried
 * grasses and a stack of art books. 0.45 high (the vase to 0.85).
 */
export function credenza(len: number): SetPiece {
  return once(`credenza:${len.toFixed(2)}`, () =>
    looks([len, 0.45], 1, (b) => {
      flat(b, len, 0.4, 0.42, WALNUT_DARK, [0, 0.2, 0]);
      for (let k = 0; k < 4; k++) {
        const x = -len / 2 + (k + 0.5) * (len / 4);
        flat(b, len / 4 - 0.03, 0.34, 0.01, tint(WALNUT, (k % 2) * 0.06), [x, 0.2, 0.215]);
        flat(b, 0.012, 0.08, 0.012, BRASS, [x + (k % 2 ? -1 : 1) * (len / 8 - 0.05), 0.24, 0.225]);
      }
      flat(b, len + 0.02, 0.03, 0.44, STONE, [0, 0.415, 0]);
      b.cylinder(0.05, 0.07, 0.28, 0x16171b, { at: [-len * 0.3, 0.57, 0] }, 12);
      for (let k = 0; k < 7; k++) {
        const a = (k / 7) * Math.PI * 2;
        bar(
          b,
          [-len * 0.3, 0.7, 0],
          [-len * 0.3 + Math.cos(a) * 0.12, 0.9, Math.sin(a) * 0.06],
          0.01,
          0xc8b88a,
        );
      }
      for (let k = 0; k < 3; k++)
        flat(
          b,
          0.26 - k * 0.02,
          0.03,
          0.2,
          nth([0xe8e2d6, 0x4a4458, 0xb85a3a], k),
          [len * 0.25, 0.445 + k * 0.03, 0],
          [0, k * 0.1, 0],
        );
    }),
  );
}

/** The welcome screen's size: width and height of its picture. */
export const SCREEN = { w: 4.4, h: 1.36 } as const;

/**
 * The welcome screen's panel, facing +z, its picture's centre at the origin:
 * a thin black bezel, the picture split down the middle (YOTTA's half a deep
 * violet, MONOLITH's half black), a soft band under the logos for the
 * strapline. The logos and the words are `welcomeLogos` (hot).
 */
export const welcomeScreen = looks([SCREEN.w + 0.1, 0.1], 1, (b) => {
  const { w, h } = SCREEN;
  flat(b, w + 0.1, h + 0.1, 0.06, 0x0c0d10, [0, 0, -0.03]);
  // The two halves: violet light on the left, black glass on the right.
  b.add(new THREE.PlaneGeometry(w / 2, h), 0x2e2052, { at: [-w / 4, 0, 0.002] }, 'glow');
  b.add(new THREE.PlaneGeometry(w / 2, h), 0x07080a, { at: [w / 4, 0, 0.002] }, 'glow');
  // The strapline's band across both.
  b.add(new THREE.PlaneGeometry(w, h * 0.22), 0x15121e, { at: [0, -h * 0.33, 0.003] }, 'glow');
  // A slim screen bar under it, a camera on top.
  flat(b, w * 0.4, 0.05, 0.08, 0x18191d, [0, -h / 2 - 0.08, 0.02]);
  b.box(0.1, 0.05, 0.06, 0x18191d, { at: [0, h / 2 + 0.06, 0.0] }, 0.01);
});

/**
 * The welcome screen's picture, the chapter's logo gag: YOTTA's violet orbit
 * mark and letters on the left, MONOLITH's white slab mark and letters on
 * the right, a "×" between them, and "× EXPLORING SYNERGIES ×" under both.
 * Centred on its screen's picture; hot.
 */
export const welcomeLogos = looks([SCREEN.w, 0.05], 1, (b) => {
  const { w, h } = SCREEN;
  const z = 0.006;
  const px = 0.06;
  const ly = h * 0.12;
  // YOTTA: the orbit ring round a pale planet, then the letters.
  const yx = -w / 4;
  b.add(
    new THREE.TorusGeometry(px * 1.9, px * 0.32, 8, 28),
    0xb89af0,
    { at: [yx - px * 9, ly, z], rot: [0, 0, 0.5] },
    'glow',
  );
  b.add(new THREE.CircleGeometry(px * 1.0, 16), 0xe8e0ff, { at: [yx - px * 9, ly, z] }, 'glow');
  glowLetters(b, 'YOTTA', yx + px * 2.2, ly - px * 0.5, z, px, 0xd8c8ff);
  // ×
  glowLetters(b, '×', 0, ly - px * 0.5, z, px * 0.9, 0xf0ecf8);
  // MONOLITH: the tall slab mark, then the letters.
  const mx = w / 4;
  const mp = px * 0.72;
  glowBox(b, mp * 2, mp * 7, 0.004, MONO_WHITE, [mx - mp * 20, ly, z]);
  glowLetters(b, 'MONOLITH', mx + mp * 2.5, ly - mp * 0.5, z, mp, MONO_WHITE);
  // The strapline.
  glowLetters(b, '× EXPLORING SYNERGIES ×', 0, -h * 0.33, z, 0.034, 0xf2e8d8);
});

/** A digital wall clock: a black slab, amber digits. `text` like "15:40"; hot. */
export function wallClock(text: string): SetPiece {
  return once(`wallClock:${text}`, () =>
    looks([0.6, 0.05], 1, (b) => {
      flat(b, textWidth(text) * 0.03 + 0.12, 0.26, 0.03, 0x0c0d10, [0, 0, 0.015]);
      glowLetters(b, text, 0, -0.03, 0.032, 0.03, 0xffb44a);
    }),
  );
}

/** A wall sconce: a brass bar holding a warm glass tube, along y. Its centre at the origin; hot. */
export const sconce = looks([0.1, 0.1], 1, (b) => {
  flat(b, 0.06, 0.06, 0.04, BRASS, [0, 0, 0.02]);
  flat(b, 0.02, 0.02, 0.06, BRASS, [0, 0, 0.06]);
  b.add(new THREE.CylinderGeometry(0.025, 0.025, 0.36, 10), 0xffe4b8, { at: [0, 0, 0.09] }, 'glow');
});

/**
 * The reception desk along x, `len` long, facing +z: a walnut front in
 * fluted slats, a black stone top and a raised stone ledge along its front,
 * YOTTA's violet mark on its face. On it the backs of two thin monitors, the
 * visitors' book open with a pen, a call bell and an orchid. About 0.62 high.
 */
export function receptionDesk(len: number): SetPiece {
  return once(`receptionDesk:${len.toFixed(2)}`, () =>
    looks([len, 0.7], 1, (b) => {
      const d = 0.6;
      flat(b, len, 0.5, d, WALNUT_DARK, [0, 0.25, 0]);
      for (let x = -len / 2 + 0.04, k = 0; x < len / 2 - 0.02; x += 0.06, k++)
        flat(b, 0.036, 0.46, 0.02, tint(WALNUT, (hash01(k, 2, 241) - 0.5) * 0.12), [
          x,
          0.25,
          d / 2 + 0.01,
        ]);
      flat(b, len, 0.04, 0.04, BLACK_STEEL, [0, 0.02, d / 2 + 0.02]);
      // The stone top, the ledge over the front, a brass edge.
      flat(b, len + 0.04, 0.04, d + 0.04, STONE, [0, 0.52, 0]);
      flat(b, len + 0.08, 0.05, 0.22, tint(STONE, 0.12), [0, 0.6, d / 2 - 0.08]);
      flat(b, len + 0.08, 0.012, 0.012, BRASS, [0, 0.625, d / 2 + 0.035]);
      // YOTTA's orbit mark on its face, in violet.
      b.torus(0.07, 0.014, VIOLET, { at: [0, 0.3, d / 2 + 0.03], rot: [0, 0, 0.5] });
      b.sphere(0.035, 0xd8d8dc, { at: [0, 0.3, d / 2 + 0.025] }, [1, 1, 0.4]);
      // The monitors, seen from the front: black backs on slim arms.
      for (const x of [-len * 0.22, len * 0.18]) {
        flat(b, 0.04, 0.14, 0.04, CHROME, [x, 0.61, -0.12]);
        flat(b, 0.42, 0.26, 0.03, 0x15161a, [x, 0.8, -0.1]);
      }
      // The visitors' book, open, its pen; a call bell; an orchid in a white pot.
      flat(b, 0.24, 0.015, 0.16, 0xf2eee6, [len * 0.36, 0.632, d / 2 - 0.08]);
      flat(b, 0.006, 0.016, 0.16, 0xa8a49c, [len * 0.36, 0.634, d / 2 - 0.08]);
      bar(
        b,
        [len * 0.36 + 0.03, 0.645, d / 2 - 0.12],
        [len * 0.36 + 0.1, 0.645, d / 2 - 0.05],
        0.01,
        BLACK_STEEL,
      );
      b.sphere(0.035, CHROME, { at: [-len * 0.4, 0.635, d / 2 - 0.08] }, [1, 0.6, 1]);
      b.cylinder(0.05, 0.04, 0.1, 0xf4f2ee, { at: [-len * 0.06, 0.6, -0.12] }, 12);
      bar(b, [-len * 0.06, 0.64, -0.12], [-len * 0.06 + 0.04, 0.86, -0.12], 0.008, 0x5a6a3a);
      for (const [dx, dy] of [
        [0.05, 0.84],
        [0.08, 0.79],
        [0.03, 0.88],
      ] as const)
        b.sphere(0.026, 0xf0e0f4, { at: [-len * 0.06 + dx, dy, -0.1] }, [1, 0.6, 0.6]);
      b.sphere(0.06, 0x4a6a3a, { at: [-len * 0.06, 0.67, -0.12] }, [1.4, 0.4, 0.8]);
    }),
  );
}

// ---- MONOLITH's people ----

/** What a suit is doing (`suitFigure`'s variants). */
export const SUIT_POSE = {
  phoning: 0,
  armsCrossed: 1,
  briefcase: 2,
  watch: 3,
  guard: 4,
  pointing: 5,
  sipping: 6,
  tablet: 7,
  driver: 8,
} as const;
/** How many poses a suit has. */
const SUIT_POSES = 9;

/**
 * One of MONOLITH's people: an identical black suit, white shirt, black tie,
 * slicked hair and sunglasses, standing at its feet facing +z, about 0.95
 * high. Each look is an unmistakable action pose (`SUIT_POSE`): on the
 * phone, arms crossed, case in hand, checking a watch, guarding with an
 * earpiece, pointing, sipping water, reading a tablet, or the driver in his
 * cap. Smaller and greyer than any player, and nothing like the manager
 * (grey hair, blue-grey suit, red tie): from above they read as a block of
 * black.
 */
export const suitFigure = looks([0.5, 0.4], SUIT_POSES * 2, (b, look) => {
  const v = look % SUIT_POSES;
  const skin = nth(SKINS, v * 3 + 1);
  // Legs and shoes.
  for (const s of [-1, 1]) {
    b.capsule(0.06, 0.18, tint(SUIT, -0.1), { at: [s * 0.075, 0.15, 0] });
    b.box(0.09, 0.05, 0.16, SHADES, { at: [s * 0.075, 0.025, 0.03] }, 0.02);
  }
  // The jacket: square-shouldered, a darker hem, lapels; white shirt and a black tie.
  b.box(0.44, 0.36, 0.3, SUIT, { at: [0, 0.43, 0] }, 0.07);
  b.box(0.48, 0.08, 0.28, SUIT, { at: [0, 0.6, 0] }, 0.04);
  flat(b, 0.44, 0.02, 0.3, SUIT_EDGE, [0, 0.27, 0]);
  b.cone(0.085, 0.2, SHIRT, { at: [0, 0.54, 0.15], rot: [Math.PI, 0, 0] }, 3);
  flat(b, 0.04, 0.2, 0.02, SHADES, [0, 0.5, 0.162]);
  for (const s of [-1, 1])
    flat(b, 0.03, 0.18, 0.02, SUIT_EDGE, [s * 0.075, 0.52, 0.155], [0, 0, s * 0.35]);
  // The head, unless it's a piece of its own (`suitHead`) that turns.
  const hy = 0.83;
  if (look < SUIT_POSES) suitHeadParts(b, v, hy);
  const shoulder = (s: number): V3 => [s * 0.22, 0.58, 0];
  const hand = (at: V3) => b.sphere(0.055, skin, { at });
  const arm = (s: number, at: V3) => {
    const sh = shoulder(s);
    // An elbow halfway down, so the sleeve bends.
    const el: V3 = [
      (sh[0] + at[0]) / 2 + s * 0.06,
      Math.min(sh[1], at[1]) - 0.08,
      (sh[2] + at[2]) / 2,
    ];
    limb(b, sh, el, 0.055, SUIT);
    limb(b, el, at, 0.05, SUIT);
    hand(at);
  };
  const down = (s: number) => {
    arm(s, [s * 0.26, 0.3, 0.02]);
  };
  switch (v) {
    case SUIT_POSE.phoning:
      arm(1, [0.17, hy, 0.06]);
      flat(b, 0.03, 0.14, 0.07, SHADES, [0.2, hy + 0.02, 0.06]);
      down(-1);
      break;
    case SUIT_POSE.armsCrossed:
      arm(1, [-0.1, 0.46, 0.2]);
      arm(-1, [0.1, 0.48, 0.21]);
      limb(b, [-0.14, 0.46, 0.19], [0.14, 0.48, 0.19], 0.05, SUIT);
      break;
    case SUIT_POSE.briefcase:
      arm(1, [0.27, 0.28, 0.02]);
      b.box(0.08, 0.26, 0.32, SHADES, { at: [0.29, 0.13, 0.02] }, 0.02);
      flat(b, 0.02, 0.012, 0.06, BRASS, [0.29, 0.22, 0.12]);
      down(-1);
      break;
    case SUIT_POSE.watch:
      arm(-1, [-0.04, 0.5, 0.26]);
      flat(b, 0.06, 0.03, 0.06, CHROME, [-0.06, 0.53, 0.24]);
      arm(1, [0.05, 0.47, 0.25]);
      break;
    case SUIT_POSE.guard:
      // Hands clasped behind (the earpiece is on the head).
      arm(1, [0.06, 0.35, -0.2]);
      arm(-1, [-0.06, 0.35, -0.2]);
      break;
    case SUIT_POSE.pointing:
      arm(1, [0.3, 0.66, 0.36]);
      bar(b, [0.3, 0.66, 0.36], [0.33, 0.68, 0.45], 0.025, skin);
      down(-1);
      break;
    case SUIT_POSE.sipping:
      arm(1, [0.06, hy - 0.08, 0.2]);
      b.cylinder(0.035, 0.03, 0.09, 0xd8e8f0, { at: [0.05, hy - 0.05, 0.25] }, 10);
      arm(-1, [-0.12, 0.44, 0.2]);
      break;
    case SUIT_POSE.tablet:
      arm(1, [0.12, 0.47, 0.26]);
      arm(-1, [-0.12, 0.47, 0.26]);
      flat(b, 0.28, 0.02, 0.2, SHADES, [0, 0.49, 0.28], [0.6, 0, 0]);
      b.add(
        new THREE.PlaneGeometry(0.24, 0.16),
        0x5a8ac8,
        { at: [0, 0.5, 0.29], rot: [-0.97, 0, 0] },
        'glow',
      );
      break;
    default:
      // The driver: hands clasped in front (his cap is on the head).
      arm(1, [0.04, 0.32, 0.2]);
      arm(-1, [-0.04, 0.32, 0.2]);
  }
});

/**
 * A suit's head, `hy` up, for pose `v`: skin, slicked hair, the sunglasses'
 * wide black bar; the guard's earpiece and its curly wire, the driver's
 * peaked cap.
 */
function suitHeadParts(b: ModelBuilder, v: number, hy: number): void {
  const skin = nth(SKINS, v * 3 + 1);
  const hair = nth(HAIR, v);
  const look = v === SUIT_POSE.watch ? -0.05 : 0;
  b.sphere(0.2, skin, { at: [0, hy, 0] }, [1, 0.95, 1]);
  b.sphere(0.205, hair, { at: [0, hy + 0.05, -0.04] }, [1, 0.72, 0.95]);
  flat(b, 0.3, 0.06, 0.03, SHADES, [0, hy + 0.02 + look, 0.185]);
  for (const s of [-1, 1]) flat(b, 0.02, 0.02, 0.2, SHADES, [s * 0.15, hy + 0.03, 0.08]);
  flat(b, 0.06, 0.02, 0.02, 0x6a5a50, [0, hy - 0.08, 0.195]);
  if (v === SUIT_POSE.guard) {
    b.sphere(0.022, 0xe8e8e8, { at: [0.2, hy, 0.02] });
    for (let k = 0; k < 4; k++)
      b.torus(0.012, 0.004, 0xe8e8e8, {
        at: [0.19, hy - 0.06 - k * 0.025, -0.02],
        rot: [Math.PI / 2, 0, 0],
      });
  }
  if (v === SUIT_POSE.driver) {
    b.cylinder(0.18, 0.17, 0.08, SHADES, { at: [0, hy + 0.16, -0.01] }, 16);
    flat(b, 0.24, 0.015, 0.12, SHADES, [0, hy + 0.12, 0.16], [0.25, 0, 0]);
  }
}

/** Where a suit's head turns about: its neck, this far up from its feet. */
export const SUIT_NECK = 0.64;
/** A suit's look `SUIT_POSES + pose`: the same figure without its head, for a `suitHead` on top. */
export const SUIT_HEADLESS = SUIT_POSES;

/**
 * A suit's head on its own, for pose `v` (`SUIT_POSE`), its origin at the
 * neck (`SUIT_NECK` up from the feet), so a living kind (`peck`) turns it
 * and dips it: glancing round, down at the watch, down at the tablet.
 * Put it on a `SUIT_HEADLESS + v` figure, at the same spot and size.
 */
export const suitHead = looks([0.42, 0.42], SUIT_POSES, (b, v) => {
  suitHeadParts(b, v, 0.83 - SUIT_NECK);
});

/** Identical black briefcases standing in a row along x, `n` of them, gold clasps. 0.26 high. */
export function briefcaseRow(n: number): SetPiece {
  return once(`briefcaseRow:${n}`, () =>
    looks([n * 0.38, 0.12], 1, (b) => {
      for (let k = 0; k < n; k++) {
        const x = (k - (n - 1) / 2) * 0.38;
        b.box(0.32, 0.24, 0.09, SHADES, { at: [x, 0.12, 0] }, 0.02);
        flat(b, 0.3, 0.008, 0.092, SUIT_EDGE, [x, 0.2, 0]);
        for (const s of [-1, 1]) flat(b, 0.03, 0.02, 0.01, BRASS, [x + s * 0.09, 0.2, 0.048]);
        bar(b, [x - 0.06, 0.24, 0], [x - 0.05, 0.28, 0], 0.016, SHADES);
        bar(b, [x - 0.05, 0.28, 0], [x + 0.05, 0.28, 0], 0.016, SHADES);
        bar(b, [x + 0.05, 0.28, 0], [x + 0.06, 0.24, 0], 0.016, SHADES);
      }
    }),
  );
}

/**
 * A chrome coat stand with MONOLITH's coats on it: six identical long black
 * coats hung round the top, and at its foot a stand of identical black
 * umbrellas. About 1.45 high.
 */
export const coatRack = looks([0.7, 0.7], 1, (b) => {
  b.cylinder(0.22, 0.24, 0.03, CHROME, { at: [0, 0.015, 0] }, 20);
  b.cylinder(0.02, 0.02, 1.4, CHROME, { at: [0, 0.72, 0] }, 8);
  b.sphere(0.035, CHROME, { at: [0, 1.43, 0] });
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2 + 0.3;
    const cx = Math.sin(a) * 0.15;
    const cz = Math.cos(a) * 0.15;
    // The hook, then the coat hanging from its collar: shoulders, a long body, a belt.
    bar(b, [0, 1.32, 0], [Math.sin(a) * 0.1, 1.36, Math.cos(a) * 0.1], 0.015, CHROME);
    b.box(0.2, 0.1, 0.12, SUIT, { at: [cx, 1.27, cz], rot: [0, a, 0] }, 0.04);
    b.box(
      0.17,
      0.62,
      0.1,
      tint(SUIT, (k % 2) * 0.05),
      { at: [cx * 1.1, 0.92, cz * 1.1], rot: [0, a, 0] },
      0.04,
    );
    flat(b, 0.175, 0.03, 0.105, SUIT_EDGE, [cx * 1.1, 0.98, cz * 1.1], [0, a, 0]);
  }
});

/** An umbrella stand of identical black umbrellas: a brushed steel tube, four crooks. 0.62 high. */
export const umbrellaStand = looks([0.3, 0.3], 1, (b) => {
  b.cylinder(0.12, 0.11, 0.42, CHROME, { at: [0, 0.21, 0] }, 16);
  b.cylinder(0.1, 0.1, 0.01, 0x15161a, { at: [0, 0.42, 0] }, 16);
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2;
    const x = Math.sin(a) * 0.05;
    const z = Math.cos(a) * 0.05;
    bar(b, [x, 0.3, z], [x * 1.4, 0.56, z * 1.4], 0.04, SUIT);
    b.torus(0.03, 0.008, SHADES, { at: [x * 1.4 + 0.02, 0.58, z * 1.4], rot: [0, a, 0] }, Math.PI);
  }
});

/**
 * A covered catering trolley, facing +z: a steel trolley on castors under
 * one long cream cloth draped over the whole of it to just off the floor,
 * a soft fold across its top and its folds hanging straight, the handle
 * left out at one end. Nothing on show, no domes. About 0.55 high.
 */
export const coveredTrolley = looks([0.9, 0.55], 2, (b, v) => {
  const cloth = DRAPE;
  const w = 0.82;
  const d = 0.5;
  const h = 0.52;
  for (const sx of [-1, 1])
    for (const sz of [-1, 1])
      b.cylinder(
        0.025,
        0.025,
        0.03,
        0x2a2a2a,
        { at: [sx * (w / 2 - 0.06), 0.02, sz * (d / 2 - 0.06)], rot: [0, 0, Math.PI / 2] },
        8,
      );
  // A steel handle at the end.
  const hs = v ? -1 : 1;
  bar(
    b,
    [hs * (w / 2 + 0.06), h - 0.04, -0.15],
    [hs * (w / 2 + 0.06), h - 0.04, 0.15],
    0.02,
    CHROME,
  );
  for (const s of [-1, 1])
    bar(
      b,
      [hs * (w / 2 + 0.01), h - 0.06, s * 0.15],
      [hs * (w / 2 + 0.06), h - 0.04, s * 0.15],
      0.018,
      CHROME,
    );
  // The cloth: the top, the drop flaring a little to just off the floor.
  b.box(w + 0.04, h - 0.06, d + 0.04, cloth, { at: [0, 0.05 + (h - 0.06) / 2, 0] }, 0.04);
  flat(b, w + 0.1, 0.02, d + 0.1, tint(cloth, -0.06), [0, 0.06, 0]);
  // A soft fold across the top where the cloth was shaken out, a crease each side of it.
  const fx = v ? 0.12 : -0.1;
  b.box(
    0.08,
    0.025,
    d + 0.05,
    tint(cloth, 0.06),
    { at: [fx, h + 0.005, 0], rot: [0, 0.12, 0] },
    0.01,
  );
  flat(b, 0.012, 0.004, d + 0.04, tint(cloth, -0.16), [fx + 0.05, h + 0.003, 0], [0, 0.12, 0]);
  flat(b, 0.012, 0.004, d * 0.6, tint(cloth, -0.12), [fx - 0.18, h + 0.003, 0.05], [0, -0.3, 0]);
  // Folds hanging down the front and the ends, shaded light and dark.
  for (let x = -w / 2 + 0.05, k = 0; x < w / 2; x += 0.1, k++)
    flat(b, 0.035, h - 0.1, 0.014, tint(cloth, k % 2 ? -0.1 : 0.04), [
      x,
      0.06 + (h - 0.08) / 2,
      d / 2 + 0.024,
    ]);
  for (let z = -d / 2 + 0.06, k = 0; z < d / 2; z += 0.12, k++)
    for (const s of [-1, 1])
      flat(b, 0.014, h - 0.1, 0.035, tint(cloth, k % 2 ? -0.1 : 0.03), [
        s * (w / 2 + 0.024),
        0.06 + (h - 0.08) / 2,
        z,
      ]);
  // The corners where the cloth bunches, a little lower.
  for (const sx of [-1, 1])
    b.box(
      0.07,
      h - 0.08,
      0.07,
      tint(cloth, -0.05),
      { at: [sx * (w / 2 + 0.005), (h - 0.08) / 2 + 0.05, d / 2 + 0.005] },
      0.03,
    );
});

/**
 * The water station against the wall, facing +z: a low walnut credenza and on
 * it a tall glass water dispenser with a chrome tap, upturned glasses on a
 * tray, a steel coffee urn, a stack of white cups and saucers, a jug. 0.9 high.
 */
export const waterStation = looks([1.5, 0.5], 1, (b) => {
  const w = 1.45;
  const d = 0.45;
  const top = 0.5;
  flat(b, w, top, d, WALNUT_DARK, [0, top / 2, 0]);
  for (const x of [-w / 4, w / 4])
    flat(b, w / 2 - 0.03, top - 0.08, 0.01, WALNUT, [x, top / 2, d / 2 + 0.005]);
  flat(b, w + 0.02, 0.03, d + 0.02, STONE, [0, top + 0.015, 0]);
  // The water dispenser: a glass jar on a steel base, a chrome tap.
  const wx = -w * 0.32;
  b.cylinder(0.08, 0.09, 0.06, CHROME, { at: [wx, top + 0.06, 0] }, 14);
  b.add(
    new THREE.CylinderGeometry(0.09, 0.09, 0.3, 16),
    0xbcdcea,
    { at: [wx, top + 0.24, 0] },
    'glass',
  );
  b.cylinder(0.085, 0.085, 0.22, 0x9ec8dc, { at: [wx, top + 0.2, 0] }, 14);
  b.cylinder(0.095, 0.095, 0.02, CHROME, { at: [wx, top + 0.4, 0] }, 14);
  flat(b, 0.03, 0.04, 0.06, CHROME, [wx, top + 0.1, 0.1]);
  // Upturned glasses on a tray.
  flat(b, 0.34, 0.012, 0.24, BLACK_STEEL, [-w * 0.05, top + 0.036, 0.02]);
  for (let i = 0; i < 4; i++)
    for (let j = 0; j < 3; j++)
      b.cylinder(
        0.026,
        0.03,
        0.07,
        0xdcecf2,
        { at: [-w * 0.05 - 0.12 + i * 0.08, top + 0.077, -0.06 + j * 0.08] },
        8,
      );
  // The coffee urn: a steel drum on legs, its black tap, cups beside it.
  const ux = w * 0.22;
  b.cylinder(0.1, 0.1, 0.28, CHROME, { at: [ux, top + 0.2, -0.04] }, 16);
  b.cylinder(0.105, 0.105, 0.02, BLACK_STEEL, { at: [ux, top + 0.35, -0.04] }, 16);
  b.sphere(0.03, BLACK_STEEL, { at: [ux, top + 0.37, -0.04] });
  flat(b, 0.04, 0.03, 0.05, BLACK_STEEL, [ux, top + 0.1, 0.07]);
  for (let k = 0; k < 5; k++)
    b.cylinder(0.035, 0.03, 0.03, 0xf4f2ee, { at: [w * 0.4, top + 0.045 + k * 0.032, 0.05] }, 10);
  b.cylinder(0.06, 0.06, 0.01, 0xf4f2ee, { at: [w * 0.4, top + 0.035, 0.05] }, 12);
  // A glass jug of water.
  b.add(
    new THREE.CylinderGeometry(0.045, 0.05, 0.16, 12),
    0xc8e2ee,
    { at: [-w * 0.15, top + 0.11, 0.1] },
    'glass',
  );
  b.cylinder(0.04, 0.045, 0.1, 0xa8d0e2, { at: [-w * 0.15, top + 0.08, 0.1] }, 12);
});

/** Steam off the urn: a little column of pale puffs (`wisp` alive). */
export const urnSteam = looks([0.2, 0.2], 1, (b) => {
  for (let k = 0; k < 3; k++)
    b.sphere(0.03 + k * 0.012, 0xf4f4f4, { at: [Math.sin(k * 1.7) * 0.02, 0.03 + k * 0.06, 0] });
});

/**
 * The lanyard table, facing +z: a small table under a black cloth, rows of
 * name badges on lanyards (black for MONOLITH, a few violet for YOTTA), a
 * MONOLITH tent card, a stack of MONOLITH-branded notebooks. 0.55 high.
 */
export const lanyardTable = looks([1.0, 0.55], 1, (b) => {
  const w = 0.95;
  const d = 0.5;
  const h = 0.46;
  b.box(w, h, d, 0x18191e, { at: [0, h / 2, 0] }, 0.02);
  flat(b, w + 0.01, 0.06, d + 0.01, 0x22232a, [0, h - 0.03, 0]);
  // Badges in rows: white cards, their lanyards coiled beside them.
  for (let i = 0; i < 5; i++)
    for (let j = 0; j < 2; j++) {
      const x = -w / 2 + 0.12 + i * 0.12;
      const z = -0.08 + j * 0.15;
      const yotta = (i + j) % 4 === 3;
      flat(b, 0.07, 0.006, 0.09, 0xf4f2ee, [x, h + 0.004, z]);
      flat(b, 0.05, 0.002, 0.016, yotta ? VIOLET : SHADES, [x, h + 0.008, z - 0.025]);
      b.torus(0.03, 0.006, yotta ? VIOLET : SHADES, {
        at: [x + 0.01, h + 0.008, z - 0.07],
        rot: [Math.PI / 2, 0, 0],
      });
    }
  // The tent card.
  const tx = w * 0.3;
  for (const s of [-1, 1])
    flat(b, 0.22, 0.1, 0.006, SHADES, [tx, h + 0.05, s * 0.02], [s * 0.35, 0, 0]);
  letters(b, 'MONOLITH', tx, h + 0.04, 0.045, 0.008, MONO_WHITE, 0.003);
  // The notebooks: black, a white M on each.
  for (let k = 0; k < 4; k++) {
    flat(
      b,
      0.16,
      0.02,
      0.22,
      k % 2 ? 0x16171b : 0x1e1f24,
      [tx, h + 0.012 + k * 0.021, 0.12],
      [0, k * 0.05, 0],
    );
  }
  flat(b, 0.04, 0.002, 0.05, MONO_WHITE, [tx, h + 0.096, 0.12]);
});

/**
 * The "MONOLITH VISITORS" stand, facing +z: a chrome pole on a heavy base,
 * a black sign tilted back on top: MONOLITH's slab mark, "MONOLITH" over
 * "VISITORS", a violet arrow to the boardroom. About 0.8 high.
 */
export const visitorsSign = looks([0.6, 0.3], 1, (b) => {
  b.cylinder(0.16, 0.18, 0.03, CHROME, { at: [0, 0.015, 0] }, 18);
  b.cylinder(0.018, 0.018, 0.44, CHROME, { at: [0, 0.24, 0] }, 8);
  const tilt = 0.35;
  const y = 0.6;
  const face = (w: number, h: number, dz: number, c: number, x = 0, dy = 0) => {
    flat(b, w, h, 0.012, c, [x, y + dy * Math.cos(tilt), dz - dy * Math.sin(tilt)], [-tilt, 0, 0]);
  };
  face(0.56, 0.36, 0, 0x0d0e11);
  face(0.54, 0.34, 0.008, 0x15161a);
  // The words, laid on the tilted face.
  const px = 0.016;
  const line = (text: string, dy: number, c: number) => {
    glyphs(text, (u, r, w) => {
      face(w * px, px, 0.016, c, u * px + 0.03, dy + (2 - r) * px);
    });
  };
  line('MONOLITH', 0.07, MONO_WHITE);
  line('VISITORS', -0.04, 0xb8bcc4);
  face(0.022, 0.12, 0.016, MONO_WHITE, -0.2, 0.02);
  // The arrow: a bar and its head, violet.
  face(0.12, 0.022, 0.016, VIOLET, 0.0, -0.12);
  face(0.04, 0.05, 0.016, VIOLET, 0.08, -0.12);
});

/**
 * A rope line along x, `len` long from 0: chrome stanchions on round bases,
 * a violet velvet rope sagging between them. 0.48 high.
 */
export function ropeLine(len: number): SetPiece {
  return once(`ropeLine:${len.toFixed(2)}`, () =>
    looks([len, 0.3], 1, (b) => {
      const n = Math.max(1, Math.round(len / 0.9));
      const step = len / n;
      for (let k = 0; k <= n; k++) {
        const x = k * step;
        b.cylinder(0.1, 0.11, 0.025, CHROME, { at: [x, 0.013, 0] }, 16);
        b.cylinder(0.018, 0.018, 0.42, CHROME, { at: [x, 0.23, 0] }, 8);
        b.sphere(0.032, BRASS, { at: [x, 0.46, 0] });
        if (k === n) break;
        // The rope's swag in four straight runs.
        let prev: V3 = [x + 0.03, 0.43, 0];
        for (let s = 1; s <= 4; s++) {
          const t = s / 4;
          const at: V3 = [x + 0.03 + t * (step - 0.06), 0.43 - Math.sin(t * Math.PI) * 0.09, 0];
          bar(b, prev, at, 0.026, 0x4a2a78);
          prev = at;
        }
      }
    }),
  );
}

/**
 * Two lanes of glass speed gates along x, facing +z: brushed steel cabinets
 * with black tops and card readers, glass wings standing shut between them.
 * Their arrow lights are `gateLights` (hot, blinking). 0.56 high.
 */
export const speedGates = looks([1.3, 0.8], 1, (b) => {
  for (const x of [-0.58, 0, 0.58]) {
    b.box(0.16, 0.52, 0.5, tint(CHROME, -0.12), { at: [x, 0.26, 0] }, 0.02);
    flat(b, 0.17, 0.03, 0.51, 0x16171b, [x, 0.535, 0]);
    flat(b, 0.1, 0.004, 0.1, 0x2a2c34, [x, 0.552, 0.14]);
  }
  for (const x of [-0.29, 0.29])
    for (const s of [-1, 1]) b.pane(0.2, 0.4, 0.012, 0xbcd8e4, { at: [x + s * 0.11, 0.35, 0.03] });
});

/** The speed gates' arrow lights: small green arrows on the cabinets' tops. Hot; blinks. */
export const gateLights = looks([1.3, 0.2], 1, (b) => {
  for (const x of [-0.58, 0, 0.58]) {
    // Each light's black lens (the body that blinks with it).
    flat(b, 0.08, 0.004, 0.08, 0x101114, [x, 0.555, 0.2]);
    glowBox(b, 0.05, 0.006, 0.02, 0x4af08a, [x, 0.56, 0.19]);
    b.add(
      new THREE.CircleGeometry(0.03, 3),
      0x4af08a,
      { at: [x, 0.565, 0.21], rot: [-Math.PI / 2, 0, Math.PI / 2] },
      'glow',
    );
  }
});

/**
 * A tall plant in a black stone pot, three looks: a fiddle-leaf fig, a
 * snake plant, an olive standard with a clipped ball. About 1.3 high;
 * `sway` alive.
 */
export const tallPlant = looks([0.6, 0.6], 3, (b, v) => {
  b.cylinder(0.2, 0.17, 0.42, 0x1c1d21, { at: [0, 0.21, 0] }, 18);
  b.cylinder(0.21, 0.21, 0.03, 0x2a2b30, { at: [0, 0.42, 0] }, 18);
  b.cylinder(0.18, 0.18, 0.02, 0x3a2e24, { at: [0, 0.425, 0] }, 16);
  const leaf = 0x3e6a3a;
  if (v === 0) {
    b.cylinder(0.022, 0.03, 0.7, 0x5a4636, { at: [0, 0.78, 0] }, 8);
    for (let k = 0; k < 14; k++) {
      const a = k * 2.4;
      const y = 0.75 + (k / 14) * 0.6;
      const r = 0.12 + Math.sin(k) * 0.03;
      b.sphere(
        0.09,
        tint(leaf, (k % 3) * 0.06 - 0.04),
        { at: [Math.sin(a) * r, y, Math.cos(a) * r] },
        [1, 1.3, 0.35],
      );
    }
  } else if (v === 1) {
    for (let k = 0; k < 11; k++) {
      const a = k * 2.1;
      const r = 0.05 + (k % 3) * 0.03;
      const h = 0.5 + (k % 4) * 0.12;
      b.box(
        0.06,
        h,
        0.016,
        tint(0x4a6a3a, (k % 2) * 0.1),
        {
          at: [Math.sin(a) * r, 0.43 + h / 2, Math.cos(a) * r],
          rot: [Math.sin(a) * 0.15, a, Math.cos(a) * 0.12],
        },
        0.006,
      );
    }
  } else {
    b.cylinder(0.025, 0.03, 0.55, 0x6a5a48, { at: [0, 0.7, 0] }, 8);
    b.sphere(0.26, 0x5e7050, { at: [0, 1.12, 0] });
    b.sphere(0.12, 0x6e8060, { at: [0.08, 1.24, 0.12] });
  }
});

/**
 * The facilitator's flip chart, facing +z: a black tripod easel, a pad of
 * paper tilted back, its top sheet drawn on in marker ("SYNERGY", a 2×2 grid,
 * arrows round a circle) with sticky notes stuck on, old sheets flipped over
 * the top, markers in the tray. Its top bar at `FLIP_TOP`, flat enough for a
 * cat.
 */
export const FLIP_TOP = 1.05;
export const flipChart = looks([0.8, 0.5], 1, (b) => {
  const tilt = 0.12;
  const y0 = 0.4;
  const h = 0.64;
  const at = (u: number, v: number, off: number): V3 => [
    u,
    y0 + v * Math.cos(tilt),
    0.05 - v * Math.sin(tilt) + off,
  ];
  // The tripod.
  for (const s of [-1, 1]) bar(b, [s * 0.3, 0, 0.12], [s * 0.26, FLIP_TOP, 0.0], 0.025, 0x1a1b1e);
  bar(b, [0, 0, -0.36], [0, FLIP_TOP - 0.05, -0.04], 0.025, 0x1a1b1e);
  // The board, its pad, the tray.
  b.box(0.66, h + 0.04, 0.02, 0x2a2b30, { at: at(0, h / 2, -0.01), rot: [-tilt, 0, 0] }, 0);
  b.box(0.6, h, 0.012, 0xf8f6f0, { at: at(0, h / 2, 0.006), rot: [-tilt, 0, 0] }, 0);
  flat(b, 0.66, 0.03, 0.08, 0x2a2b30, at(0, -0.02, 0.04));
  for (const [x, c] of [
    [-0.12, 0x2a5ac8],
    [-0.04, 0xd83a2a],
    [0.05, 0x2a9a4a],
  ] as const)
    b.cylinder(0.012, 0.012, 0.11, c, { at: at(x, 0.0, 0.06), rot: [0, 0, Math.PI / 2] }, 6);
  // Old sheets flipped back over the top, the clamp bar the cat sleeps on.
  b.box(0.64, 0.06, 0.12, 0xece8de, { at: [0, FLIP_TOP - 0.03, -0.02] }, 0.02);
  flat(b, 0.68, 0.03, 0.1, 0x1a1b1e, [0, FLIP_TOP - 0.06, 0.03]);
  // The marker drawings, on the face.
  const face = (w: number, hh: number, c: number, u: number, v: number) =>
    b.box(w, hh, 0.004, c, { at: at(u, v, 0.015), rot: [-tilt, 0, 0] }, 0);
  const px = 0.018;
  glyphs('SYNERGY', (u, r, w) => face(w * px, px, 0x2a5ac8, u * px, h - 0.1 + (2 - r) * px));
  // The 2×2 grid, its axes and a red circle round the top-right quarter.
  face(0.32, 0.008, 0x2a2b30, -0.1, 0.26);
  face(0.008, 0.3, 0x2a2b30, -0.1, 0.26);
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * Math.PI * 2;
    face(0.03, 0.008, 0xd83a2a, -0.02 + Math.cos(a) * 0.06, 0.34 + Math.sin(a) * 0.05);
  }
  face(0.1, 0.008, 0x2a9a4a, 0.18, 0.18);
  face(0.008, 0.06, 0x2a9a4a, 0.22, 0.2);
  // Sticky notes down the right.
  for (let k = 0; k < 4; k++) face(0.07, 0.07, nth(NOTES, k + 1), 0.21, 0.42 - k * 0.09);
});

/** Tabby colors, Segfault's own. */
const FUR = 0x8a8580;
const STRIPE = 0x4a4644;
const CHEST = 0xd8d2c8;
const PINK = 0xc88a8a;

/**
 * Segfault asleep on top of the flip chart: curled in a loaf along x, chin
 * on its paws, tail wrapped round, one ear twitching. About 0.4 long; its
 * belly at the origin. Breathes (`purr`).
 */
export const loafCat = looks([0.42, 0.24], 1, (b) => {
  b.sphere(0.12, FUR, { at: [0.02, 0.08, 0] }, [1.45, 0.72, 0.9]);
  for (const x of [-0.06, 0.02, 0.1])
    flat(b, 0.03, 0.012, 0.18, STRIPE, [x, 0.155, 0], [0, 0, 0.1]);
  // The tail wrapped round its front.
  b.torus(0.12, 0.022, FUR, { at: [0.04, 0.03, 0.02], rot: [Math.PI / 2, 0, 0] }, Math.PI);
  b.sphere(0.024, STRIPE, { at: [-0.08, 0.03, 0.06] });
  // The head down on the paws, eyes shut.
  const hx = -0.15;
  b.sphere(0.075, FUR, { at: [hx, 0.09, 0.03] }, [1, 0.85, 1]);
  b.sphere(0.038, CHEST, { at: [hx - 0.02, 0.06, 0.08] }, [1.2, 0.7, 0.9]);
  for (const s of [-1, 1])
    b.sphere(0.028, CHEST, { at: [hx + 0.02, 0.025, 0.06 + s * 0.04] }, [1.4, 0.6, 1]);
  flat(b, 0.014, 0.01, 0.01, PINK, [hx - 0.03, 0.08, 0.104]);
  for (const s of [-1, 1]) {
    flat(b, 0.03, 0.006, 0.006, 0x1c1a1a, [hx - 0.01 + s * 0.03, 0.105, 0.098]);
    b.cone(0.03, 0.06, FUR, { at: [hx + s * 0.035, 0.16, 0.01], rot: [0.1, 0, -s * 0.25] }, 4);
    b.cone(0.016, 0.035, PINK, { at: [hx + s * 0.035, 0.158, 0.02], rot: [0.1, 0, -s * 0.25] }, 4);
  }
});

/** A carried box of MONOLITH notebooks, held at chest height (origin at the hands): black, white Ms. */
export const notebookBox = looks([0.4, 0.3], 1, (b) => {
  b.box(0.36, 0.14, 0.26, 0xc8b48a, { at: [0, 0.02, 0] }, 0.01);
  for (let k = 0; k < 3; k++) flat(b, 0.1, 0.06, 0.2, SHADES, [-0.11 + k * 0.11, 0.1, 0]);
  for (let k = 0; k < 3; k++) flat(b, 0.03, 0.002, 0.04, MONO_WHITE, [-0.11 + k * 0.11, 0.131, 0]);
});

/** A low "SYNERGY WORKSHOP" floor sign: a black A-frame with white words, a violet arrow. 0.55 high. */
export const workshopBoard = looks([0.5, 0.3], 1, (b) => {
  const tilt = 0.28;
  for (const s of [-1, 1]) {
    const z = s * 0.1;
    b.box(0.46, 0.55, 0.02, 0x16171b, { at: [0, 0.27, z], rot: [-s * tilt, 0, 0] }, 0);
  }
  const face = (w: number, h: number, c: number, x: number, y: number) =>
    b.box(
      w,
      h,
      0.004,
      c,
      { at: [x, y, 0.11 - (y - 0.27) * Math.tan(tilt) + 0.012], rot: [-tilt, 0, 0] },
      0,
    );
  const px = 0.014;
  for (const [text, y] of [
    ['SYNERGY', 0.42],
    ['WORKSHOP', 0.32],
  ] as const)
    glyphs(text, (u, r, w) => face(w * px, px, 0xf0ece4, u * px, y + (2 - r) * px));
  face(0.16, 0.024, VIOLET, -0.02, 0.17);
  face(0.05, 0.06, VIOLET, 0.07, 0.17);
});

// ---- The curtain wall and the corners ----

/**
 * A run of curtain wall along z, `len` long from 0 and `h` high, as seen from
 * inside (its face toward +x): slate mullions every 0.8, the glass, and the
 * blinds let down two thirds of the way, their slats catching the sun.
 */
export function curtainReturn(len: number, h: number): SetPiece {
  return once(`curtainReturn:${len.toFixed(2)}:${h.toFixed(2)}`, () =>
    looks([0.1, len], 1, (b) => {
      b.pane(0.02, h, len, CW_GLASS, { at: [0, h / 2, len / 2] });
      for (let z = 0; z <= len + 0.01; z += len / Math.max(1, Math.round(len / 0.8)))
        flat(b, 0.06, h, 0.05, CW_MULLION, [0, h / 2, z]);
      flat(b, 0.08, 0.06, len, CW_MULLION, [0, h - 0.03, len / 2]);
      flat(b, 0.08, 0.05, len, CW_MULLION, [0, 0.025, len / 2]);
      const drop = h * 0.62;
      for (let y = h - 0.1; y > h - drop; y -= 0.05)
        flat(b, 0.012, 0.032, len - 0.04, BLIND, [0.04, y, len / 2], [0, 0, 0.5]);
      flat(b, 0.03, 0.02, len - 0.04, 0x9a958a, [0.04, h - drop, len / 2]);
    }),
  );
}

/**
 * A setback roof a storey down in a corner of the tower, `w` × `d` centred:
 * pale grey gravel inside a stone parapet, a roof drain, a few square
 * patches of sedum, a vent stack and a roof hatch, and down from its edges
 * the curtain wall's dark spandrel. Its top at the origin.
 */
export function setbackRoof(w: number, d: number): SetPiece {
  return once(`setbackRoof:${w.toFixed(2)}:${d.toFixed(2)}`, () =>
    looks([w, d], 1, (b) => {
      flat(b, w, 0.06, d, 0x9a968e, [0, -0.03, 0]);
      for (let k = 0; k < Math.floor(w * d * 40); k++)
        flat(b, 0.04, 0.006, 0.035, tint(0x9a968e, (hash01(k, 3, 251) - 0.5) * 0.25), [
          -w / 2 + 0.04 + hash01(k, 5, 251) * (w - 0.08),
          0.002,
          -d / 2 + 0.04 + hash01(k, 7, 251) * (d - 0.08),
        ]);
      // Sedum in squares, sun-dried at the edges.
      for (let k = 0; k < 3; k++) {
        const x = -w / 2 + 0.4 + hash01(k, 1, 253) * (w - 0.8);
        const z = -d / 2 + 0.4 + (k / 3) * (d - 0.8);
        flat(b, 0.42, 0.02, 0.42, mix(0x6a8a4a, 0xa89a5a, hash01(k, 2, 253) * 0.6), [x, 0.01, z]);
      }
      // The parapet round three sides, a stone coping.
      for (const s of [-1, 1]) {
        flat(b, w, 0.16, 0.08, 0x8a8680, [0, 0.08, s * (d / 2 - 0.04)]);
        flat(b, w + 0.02, 0.02, 0.1, 0xb8b4aa, [0, 0.17, s * (d / 2 - 0.04)]);
      }
      flat(b, 0.08, 0.16, d, 0x8a8680, [-w / 2 + 0.04, 0.08, 0]);
      flat(b, 0.1, 0.02, d + 0.02, 0xb8b4aa, [-w / 2 + 0.04, 0.17, 0]);
      flat(b, 0.08, 0.16, d, 0x8a8680, [w / 2 - 0.04, 0.08, 0]);
      flat(b, 0.1, 0.02, d + 0.02, 0xb8b4aa, [w / 2 - 0.04, 0.17, 0]);
      // A drain, a vent stack, a roof hatch.
      b.cylinder(0.06, 0.06, 0.01, 0x3a3c40, { at: [w * 0.2, 0.005, d * 0.3] }, 10);
      b.cylinder(0.04, 0.04, 0.3, 0x8a9096, { at: [-w * 0.2, 0.15, -d * 0.25] }, 10);
      b.cylinder(0.06, 0.06, 0.03, 0x6a7076, { at: [-w * 0.2, 0.31, -d * 0.25] }, 10);
      b.box(0.36, 0.14, 0.36, 0xb0b4b8, { at: [w * 0.15, 0.07, -d * 0.3] }, 0.02);
      flat(b, 0.38, 0.02, 0.38, 0x7a8086, [w * 0.15, 0.15, -d * 0.3]);
      // The spandrel and glass of the floor below, dropping from its edges.
      flat(b, w, 0.25, 0.04, 0x3b434c, [0, -0.19, d / 2 + 0.02]);
      flat(b, 0.04, 0.25, d, 0x3b434c, [-w / 2 - 0.02, -0.19, 0]);
      flat(b, 0.04, 0.25, d, 0x3b434c, [w / 2 + 0.02, -0.19, 0]);
    }),
  );
}

/** A rooftop skylight: a low glass lantern on an aluminium kerb, its ridge along x. 0.3 high. */
export const skylight = looks([0.8, 0.5], 1, (b) => {
  flat(b, 0.76, 0.12, 0.46, 0xb8bcc0, [0, 0.06, 0]);
  for (const s of [-1, 1])
    b.add(
      new THREE.BoxGeometry(0.72, 0.012, 0.26),
      0x9ec4d8,
      { at: [0, 0.2, s * 0.1], rot: [s * 0.75, 0, 0] },
      'glass',
    );
  flat(b, 0.74, 0.02, 0.02, 0x8a9096, [0, 0.29, 0]);
  for (const x of [-0.36, 0, 0.36])
    for (const s of [-1, 1]) bar(b, [x, 0.12, s * 0.21], [x, 0.29, 0], 0.016, 0x8a9096);
});

/** A satellite dish on a short mast, tilted up toward the sky, its feed arm. 0.45 high. */
export const satelliteDish = looks([0.4, 0.4], 1, (b) => {
  flat(b, 0.24, 0.04, 0.24, 0x6a6e74, [0, 0.02, 0]);
  b.cylinder(0.02, 0.02, 0.24, 0x8a9096, { at: [0, 0.14, 0] }, 8);
  b.add(new THREE.SphereGeometry(0.18, 16, 8, 0, Math.PI * 2, 0, 0.9), 0xe4e6e8, {
    at: [0, 0.3, 0.02],
    rot: [-0.9, 0, 0],
  });
  bar(b, [0, 0.27, 0.08], [0, 0.4, 0.2], 0.012, 0x6a6e74);
  b.box(0.04, 0.04, 0.05, 0x3a3c40, { at: [0, 0.41, 0.21] }, 0.01);
});

/** A flagpole with YOTTA's violet flag, its foot at the origin, about 1.1 high; `sway` alive. */
export const yottaFlag = looks([0.4, 0.1], 1, (b) => {
  b.cylinder(0.05, 0.06, 0.04, 0x6a6e74, { at: [0, 0.02, 0] }, 10);
  b.cylinder(0.012, 0.014, 1.1, 0xd4d8dc, { at: [0, 0.57, 0] }, 8);
  b.sphere(0.02, BRASS, { at: [0, 1.13, 0] });
  // The flag in two panels, a fold between, the orbit mark in white.
  flat(b, 0.17, 0.22, 0.008, VIOLET, [0.09, 0.98, 0.0], [0, 0.2, 0]);
  flat(b, 0.17, 0.2, 0.008, tint(VIOLET, -0.12), [0.255, 0.98, -0.04], [0, -0.25, 0]);
  b.torus(0.04, 0.008, 0xf4f2fa, { at: [0.1, 0.98, 0.012], rot: [0, 0.2, 0.5] });
});

// ---- MONOLITH across the river ----

/**
 * The afternoon sun on MONOLITH's black glass, `w` wide and `h` high, laid
 * over its front (face toward +z, from the origin up): a soft vertical
 * streak `cols` window bays wide (each bay `bay` wide) at `x` from the
 * front's centre, warm amber at its top and fading out over the lower 60%
 * of it, its sides fading too. The glass layer has one opacity, so it's
 * drawn as a halftone: fine squares sized by how strong the glint is there
 * (and a second sheet where it's stronger than one sheet), so it reads as
 * a soft gradient from across the river and the windows show through.
 */
export function monolithGlint(
  w: number,
  h: number,
  x = w * 0.22,
  cols = 3.5,
  bay = 0.28,
): SetPiece {
  return once(`monolithGlint:${w.toFixed(2)}:${h.toFixed(2)}:${x.toFixed(2)}:${cols}`, () =>
    looks([w, 0.05], 1, (b) => {
      const sw = cols * bay;
      const cell = 0.06;
      const sheet = 0.3;
      for (let j = 0, y = h - cell / 2; y > 0; j++, y -= cell) {
        // Full strength near the top, then out to nothing over 60% of its height.
        const t = (h - y) / h;
        const fall = t < 0.12 ? 1 : Math.max(0, 1 - (t - 0.12) / 0.6) ** 2.2;
        for (let i = 0, u = -sw / 2 + cell / 2; u < sw / 2; i++, u += cell) {
          // The sides ramp in over 15% of the width each, softly.
          const edge = Math.min(1, (sw / 2 - Math.abs(u)) / (sw * 0.22));
          const a = GLINT_PEAK * fall * edge * edge * (3 - 2 * edge);
          if (a < 0.02) continue;
          // A breath of shimmer, so the squares don't line up like a print.
          const jitter = 1 + (hash01(i, j, 271) - 0.5) * 0.25;
          const color = mix(0xffc880, GLINT, Math.min(1, t * 2.2));
          for (let k = 0, f = (a / sheet) * jitter; f > 0.02 && k < 2; k++, f -= 1) {
            const side = Math.sqrt(Math.min(1, f)) * cell;
            b.add(
              new THREE.PlaneGeometry(side, side),
              color,
              { at: [x + u, y, 0.002 + k * 0.002] },
              'glass',
            );
          }
        }
      }
    }),
  );
}

/** How strong the glint is at its brightest (as an opacity), and its color there. */
const GLINT_PEAK = 0.45;
const GLINT = 0xffb15c;

/**
 * The sun caught on the helipad's parapet: a bright spot on its rail and a
 * short flare along it, facing +z, centred. Hot.
 */
export const parapetSun = looks([0.5, 0.05], 1, (b) => {
  b.led(0.035, 0xfff0c8, { at: [0, 0, 0.012] });
  glowBox(b, 0.5, 0.012, 0.004, 0xffd890, [0, 0, 0.014]);
  glowBox(b, 0.22, 0.02, 0.004, 0xffe8b0, [0, 0, 0.016]);
  glowBox(b, 0.012, 0.12, 0.004, 0xffe0a0, [0, 0, 0.014]);
});

/** The sun's own fleck in MONOLITH's glass: a small warm star. Hot. */
export const sunFleck = looks([0.3, 0.05], 1, (b) => {
  b.led(0.06, 0xffd890, { at: [0, 0, 0.01] });
  glowBox(b, 0.34, 0.016, 0.004, 0xffe0a0, [0, 0, 0.012]);
  glowBox(b, 0.016, 0.24, 0.004, 0xffe0a0, [0, 0, 0.012]);
});

/**
 * MONOLITH's helicopter, parked on its helipad, nose toward +z: a glossy
 * black body, dark tinted canopy catching a warm highlight, a tail boom and
 * fin with MONOLITH's white slab mark, skids. About 0.6 long. Its rotor is
 * `rotor` (spins), placed on the mast's top at `HELI_MAST`.
 */
export const HELI_MAST = 0.22;
export const helicopter = looks([0.4, 0.7], 1, (b) => {
  b.sphere(0.12, 0x121318, { at: [0, 0.13, 0.06] }, [0.95, 0.85, 1.4]);
  b.sphere(0.09, 0x2a3442, { at: [0, 0.15, 0.17] }, [0.9, 0.8, 0.8]);
  flat(b, 0.06, 0.02, 0.08, 0xe8b070, [0.03, 0.2, 0.18]);
  bar(b, [0, 0.15, -0.08], [0, 0.18, -0.4], 0.04, 0x121318);
  flat(b, 0.012, 0.12, 0.08, 0x121318, [0, 0.22, -0.4]);
  flat(b, 0.014, 0.06, 0.016, MONO_WHITE, [0.008, 0.22, -0.4]);
  flat(b, 0.12, 0.01, 0.04, 0x121318, [0, 0.18, -0.36]);
  for (const s of [-1, 1]) {
    flat(b, 0.016, 0.016, 0.34, 0x3a3c42, [s * 0.1, 0.01, 0.04]);
    for (const z of [-0.04, 0.14]) bar(b, [s * 0.1, 0.01, z], [s * 0.06, 0.07, z], 0.012, 0x3a3c42);
  }
  b.cylinder(0.02, 0.025, 0.06, 0x2a2b30, { at: [0, HELI_MAST - 0.03, 0.04] }, 8);
});

/** The helicopter's main rotor, round its hub: four long thin blades. `spin` alive. */
export const rotor = looks([0.8, 0.8], 1, (b) => {
  b.cylinder(0.03, 0.03, 0.02, 0x2a2b30, { at: [0, 0.01, 0] }, 10);
  for (let k = 0; k < 4; k++) {
    const a = (k * Math.PI) / 2;
    flat(b, 0.38, 0.006, 0.03, 0x1a1b20, [Math.cos(a) * 0.2, 0.012, -Math.sin(a) * 0.2], [0, a, 0]);
  }
});

// ---- Far below ----

/** One of MONOLITH's identical black cars far below, along x: a long glossy saloon, a sunlit roof. */
export const blackCar = looks([0.56, 0.24], 1, (b) => {
  b.box(0.54, 0.07, 0.22, 0x111216, { at: [0, 0.06, 0] }, 0.02);
  b.box(0.3, 0.06, 0.19, 0x15161b, { at: [-0.02, 0.12, 0] }, 0.02);
  flat(b, 0.24, 0.006, 0.16, 0x6a5a4a, [-0.02, 0.152, 0]);
  flat(b, 0.02, 0.03, 0.18, 0xe8e4d8, [0.27, 0.06, 0]);
});

/** A black car's hazard lights, blinking while the driver waits: two amber dots each end. Hot. */
export const hazards = looks([0.56, 0.24], 1, (b) => {
  for (const x of [-0.275, 0.275])
    for (const z of [-0.08, 0.08]) {
      flat(b, 0.012, 0.03, 0.04, 0x5a2a10, [x, 0.07, z]);
      b.led(0.025, 0xffa020, { at: [x, 0.07, z] });
    }
});

/**
 * The drop-off at the tower's foot far below, `len` along z and `w` across:
 * pale granite setts, a painted lane with "DROP OFF" chevrons, a row of
 * steel bollards. Flat.
 */
export function dropOff(len: number, w: number): SetPiece {
  return once(`dropOff:${len.toFixed(2)}:${w.toFixed(2)}`, () =>
    looks([w, len], 1, (b) => {
      flat(b, w, 0.004, len, 0x5c5e62, [0, 0.002, 0]);
      flat(b, w - 0.04, 0.005, 0.02, 0xe8d880, [0, 0.003, -len / 2 + 0.02]);
      flat(b, w - 0.04, 0.005, 0.02, 0xe8d880, [0, 0.003, len / 2 - 0.02]);
      for (const s of [-1, 1]) flat(b, 0.015, 0.005, len, 0xe8e4d8, [s * (w / 2 - 0.02), 0.003, 0]);
      for (let z = -len / 2 + 0.25; z < len / 2 - 0.2; z += 0.5)
        for (const s of [-1, 1])
          flat(b, 0.1, 0.005, 0.016, 0xe8d880, [s * 0.04, 0.0035, z], [0, s * 0.6, 0]);
      for (let z = -len / 2 + 0.1; z < len / 2; z += 0.25)
        b.cylinder(0.012, 0.012, 0.06, 0x9aa0a6, { at: [-w / 2 - 0.03, 0.03, z] }, 6);
    }),
  );
}

/**
 * A rooftop billboard far below on the left: a black panel on a steel frame,
 * MONOLITH's white slab mark and "MONOLITH" over "BE ONE.", facing +z,
 * `w` wide. Its glowing words are `billboardWords` (hot).
 */
export function billboard(w: number): SetPiece {
  return once(`billboard:${w.toFixed(2)}`, () =>
    looks([w, 0.2], 1, (b) => {
      const h = w * 0.42;
      for (const s of [-1, 1]) {
        flat(b, 0.04, h * 0.6 + 0.1, 0.04, 0x5a5e64, [s * w * 0.35, (h * 0.6 + 0.1) / 2, -0.05]);
        bar(b, [s * w * 0.35, 0, -0.25], [s * w * 0.35, h * 0.6, -0.05], 0.03, 0x5a5e64);
      }
      flat(b, w, h, 0.04, 0x0d0e12, [0, h * 0.6 + h / 2, 0]);
      flat(b, w + 0.03, 0.03, 0.05, 0x3a3c42, [0, h * 1.6 + 0.015, 0]);
    }),
  );
}

/** The billboard's words, lit: the slab mark, "MONOLITH" and "BE ONE.". Hot. */
export function billboardWords(w: number): SetPiece {
  return once(`billboardWords:${w.toFixed(2)}`, () =>
    looks([w, 0.05], 1, (b) => {
      const h = w * 0.42;
      const px = w / 44;
      const y = h * 0.6 + h * 0.62;
      glowBox(b, px * 2, px * 7, 0.004, MONO_WHITE, [-w * 0.4, y - px, 0.025]);
      glowLetters(b, 'MONOLITH', px * 2, y, 0.025, px, MONO_WHITE);
      glowLetters(b, 'BE ONE.', px * 2, y - px * 8, 0.025, px * 0.8, 0xb8bcc8);
    }),
  );
}

// ---- The front: the floors below, the gondola ----

/**
 * The life behind the curtain wall of the floors under this one, `len`
 * along +x from 0, facing +z, laid over `towerFacade`'s glass (its bays 0.6
 * wide from x = 0.02, a storey 0.9 with a 0.28 spandrel): each bay's blind
 * let down to one of three heights against the afternoon sun, one window in
 * six lit warm, people at their desks as dark shapes against the light on
 * the floor just below (a head and shoulders, a monitor's glow), sticky
 * notes on the inside of the glass, a pot plant on a sill, and YOTTA's
 * violet stripe along every second spandrel. Its top at the origin (the
 * slab's foot).
 */
export function floorsBelow(len: number): SetPiece {
  return once(`floorsBelow:${len.toFixed(2)}`, () =>
    looks([len, 0.05], 1, (b) => {
      for (let storey = 0; storey < 3; storey++) {
        const y1 = -storey * 0.9;
        // YOTTA's stripe along every second spandrel.
        if (storey % 2 === 0)
          flat(b, len, 0.06, 0.01, tint(VIOLET, -0.08), [len / 2, y1 - 0.14, 0.006]);
        if (storey === 2) continue;
        const top = y1 - 0.3;
        const fade = storey * 0.25;
        for (let k = 0, x = 0.32; x < len - 0.2; k++, x += 0.6) {
          const roll = hash01(k, storey, 261);
          // One in six lit warm (`litWindows` hangs its lights), the blind up there.
          const lit = isLit(k, storey);
          // The blind: down a little, halfway or nearly to the sill, its bottom rail.
          const drop = blindDrop(k, storey);
          const glass = 0.6 - 0.02;
          if (lit)
            b.add(
              new THREE.PlaneGeometry(0.54, glass - drop - 0.02),
              mix(WARM_WINDOW, 0x9ab0c0, fade * 0.6),
              { at: [x, top - drop - (glass - drop) / 2, 0.003] },
              'glow',
            );
          const blind = lit ? mix(BLIND, WARM_WINDOW, 0.5) : BLIND;
          flat(b, 0.54, drop, 0.006, mix(blind, 0x9ab0c0, fade), [x, top - drop / 2, 0.002]);
          for (let y = top - 0.04; y > top - drop; y -= 0.045)
            flat(b, 0.54, 0.006, 0.004, mix(tint(BLIND, -0.12), 0x9ab0c0, fade), [x, y, 0.006]);
          flat(b, 0.55, 0.014, 0.01, 0x8a857a, [x, top - drop, 0.008]);
          // Someone at a desk, seen through the glass: on the floor just below, where the blind
          // leaves room, more often in a lit window.
          const sit = hash01(k, storey, 269);
          if (storey === 0 && drop < 0.4 && (lit ? sit < 0.85 : sit < 0.3))
            deskSilhouette(b, x + (sit - 0.4) * 0.3, top - glass + 0.02, lit, k);
          if (storey === 0 && roll > 0.82)
            for (let n = 0; n < 3; n++)
              flat(b, 0.05, 0.05, 0.004, nth(NOTES, k + n), [
                x - 0.15 + n * 0.07,
                top - drop - 0.08 - (n % 2) * 0.03,
                0.006,
              ]);
          if (roll > 0.6 && roll < 0.7) {
            b.cylinder(0.035, 0.03, 0.06, 0xd8d4cc, { at: [x + 0.15, top - 0.55, 0.004] }, 8);
            b.sphere(0.05, 0x5a7a44, { at: [x + 0.15, top - 0.49, 0.004] });
          }
          if (roll < 0.12) b.led(0.025, 0xffe0a8, { at: [x - 0.1, top - drop - 0.12, 0.004] });
        }
      }
    }),
  );
}

/** A lit window on the floors below. */
const WARM_WINDOW = 0xffd9a0;
/** Whether bay `k` of storey `storey` below is lit: one in six. */
const isLit = (k: number, storey: number) => hash01(k, storey, 267) < 1 / 6;
/** How far bay `k`'s blind is let down: one of three heights, the shortest where it's lit. */
const blindDrop = (k: number, storey: number) =>
  isLit(k, storey) ? 0.1 : 0.1 + Math.floor(hash01(k, storey, 263) * 3) * 0.17;

/**
 * The lights in `floorsBelow`'s lit windows: a pair of warm ceiling strips
 * just under each one's blind, as `floorsBelow` lays them out. Hot (small
 * light sources; the window's own warmth is `floorsBelow`'s).
 */
export function litWindows(len: number): SetPiece {
  return once(`litWindows:${len.toFixed(2)}`, () =>
    looks([len, 0.05], 1, (b) => {
      for (let storey = 0; storey < 2; storey++) {
        const top = -storey * 0.9 - 0.3;
        for (let k = 0, x = 0.32; x < len - 0.2; k++, x += 0.6) {
          if (!isLit(k, storey)) continue;
          const y = top - blindDrop(k, storey) - 0.035;
          for (const s of [-1, 1])
            glowBox(b, 0.2, 0.016, 0.004, 0xfff0d0, [x + s * 0.13, y, 0.012]);
        }
      }
    }),
  );
}

/**
 * Someone at a desk behind the glass, flat on it at `x`, the sill at `sill`:
 * the desk's edge, a monitor's back with its glow round it, the person's head
 * and shoulders over it, dark against the room (darker still against a lit
 * window).
 */
function deskSilhouette(b: ModelBuilder, x: number, sill: number, lit: boolean, k: number): void {
  const dark = lit ? 0x2a2a34 : 0x3a4450;
  const s = k % 2 ? 1 : -1;
  flat(b, 0.4, 0.025, 0.004, tint(dark, 0.1), [x, sill + 0.12, 0.007]);
  // The monitor and its glow.
  b.add(
    new THREE.PlaneGeometry(0.15, 0.1),
    0x9ac0e0,
    { at: [x + s * 0.1, sill + 0.19, 0.006] },
    'glow',
  );
  flat(b, 0.12, 0.08, 0.004, 0x1c2026, [x + s * 0.1, sill + 0.19, 0.008]);
  // Shoulders and a head.
  b.add(new THREE.CircleGeometry(0.09, 12, 0, Math.PI), dark, {
    at: [x - s * 0.06, sill + 0.13, 0.009],
  });
  b.add(new THREE.CircleGeometry(0.045, 12), dark, { at: [x - s * 0.06, sill + 0.27, 0.009] });
}

// ---- The gondola ----

/**
 * The window cleaners' gondola parked low on the façade, along x, `len` long
 * from its centre, its rail's top at the origin: an aluminium cradle with
 * a yellow kick plate, a bucket, a squeegee on a pole, a coiled hose, and
 * its two steel cables running up to the slab's edge (`up` above the rail).
 */
export function gondola(len: number, up: number): SetPiece {
  return once(`gondola:${len.toFixed(2)}:${up.toFixed(2)}`, () =>
    looks([len, 0.4], 1, (b) => {
      const h = 0.34;
      const d = 0.32;
      const alu = 0xc4cad0;
      flat(b, len, 0.03, d, 0x8a9096, [0, -h, 0]);
      flat(b, len, 0.1, 0.012, 0xe6b834, [0, -h + 0.06, d / 2]);
      flat(b, len, 0.1, 0.012, 0xe6b834, [0, -h + 0.06, -d / 2]);
      for (const z of [-d / 2, d / 2]) {
        flat(b, len, 0.025, 0.025, alu, [0, 0, z]);
        flat(b, len, 0.018, 0.018, alu, [0, -h / 2, z]);
        for (let x = -len / 2; x <= len / 2 + 0.01; x += len / 4)
          flat(b, 0.022, h, 0.022, alu, [x, -h / 2, z]);
      }
      for (const s of [-1, 1]) flat(b, 0.022, 0.022, d, alu, [(s * len) / 2, 0, 0]);
      // The hangers and the cables up to the slab.
      for (const s of [-1, 1]) {
        const x = s * (len / 2 - 0.15);
        bar(b, [x, 0, -d / 2], [x, 0.12, 0], 0.02, alu);
        bar(b, [x, 0, d / 2], [x, 0.12, 0], 0.02, alu);
        flat(b, 0.008, up - 0.12, 0.008, 0x2a2c30, [x, 0.12 + (up - 0.12) / 2, -d / 2 + 0.02]);
      }
      // A bucket, the squeegee on its pole, the hose coiled.
      b.cylinder(0.06, 0.05, 0.1, 0x3a72c8, { at: [-len * 0.2, -h + 0.07, 0] }, 10);
      bar(b, [len * 0.05, -h + 0.02, -0.08], [len * 0.25, -0.02, 0.05], 0.016, 0xd8dade);
      flat(b, 0.16, 0.02, 0.03, 0x2a2c30, [len * 0.25 + 0.02, -0.02, 0.05]);
      b.torus(0.06, 0.016, 0x3a6a4a, { at: [len * 0.3, -h + 0.03, 0], rot: [Math.PI / 2, 0, 0] });
    }),
  );
}

/**
 * A parked building-maintenance arm on the façade, along +x from its pivot
 * at the origin (the slab's foot): a steel pivot block bolted to the
 * spandrel, a white box-section jib with yellow and black chevrons folded
 * flat along the façade, its sheave head at the far end and a short cable
 * with the hook tied off. About 0.2 high, all below the origin.
 */
export function bmuArm(len: number): SetPiece {
  return once(`bmuArm:${len.toFixed(2)}`, () =>
    looks([len, 0.25], 1, (b) => {
      const steel = 0x8a9096;
      flat(b, 0.16, 0.2, 0.08, steel, [0, -0.1, 0.04]);
      for (const y of [-0.04, -0.16])
        b.cylinder(0.012, 0.012, 0.02, 0x3a3c40, { at: [0, y, 0.09], rot: [Math.PI / 2, 0, 0] }, 6);
      flat(b, len, 0.07, 0.07, 0xe8eaec, [len / 2, -0.09, 0.12]);
      for (let x = 0.15, k = 0; x < len - 0.1; x += 0.12, k++)
        flat(b, 0.05, 0.071, 0.071, k % 2 ? 0x2a2c30 : 0xe6b834, [x, -0.09, 0.12], [0, 0, 0.6]);
      b.cylinder(0.05, 0.05, 0.04, steel, { at: [len, -0.09, 0.12], rot: [Math.PI / 2, 0, 0] }, 12);
      flat(b, 0.006, 0.1, 0.006, 0x2a2c30, [len, -0.17, 0.12]);
      b.torus(0.02, 0.006, 0x3a3c40, { at: [len, -0.23, 0.12] }, Math.PI * 1.5);
    }),
  );
}

/** Non-square letters on a face at depth z facing +z, centred on (x, y): `px` wide and `py` high a pixel. */
function tallLetters(
  b: ModelBuilder,
  text: string,
  x: number,
  y: number,
  z: number,
  px: number,
  py: number,
  color: number,
): void {
  glyphs(text, (u, r, w) => {
    flat(b, w * px, py, 0.004, color, [x + u * px, y + (2 - r) * py, z + 0.002]);
  });
}

/**
 * YOTTA's welcome banner hung down the façade under the boardroom, `w` wide
 * and `h` long from its pole at the origin (the slab's foot), facing +z:
 * violet cloth with "YOTTA" and a "×" in white, then a black band with
 * "MONOLITH" (the visitors' half), a steel pole at the top on two brackets
 * and a weighted hem; the letters drawn tall, as the camera sees the façade
 * steeply.
 */
export function facadeBanner(w: number, h: number): SetPiece {
  return once(`facadeBanner:${w.toFixed(2)}:${h.toFixed(2)}`, () =>
    looks([w, 0.1], 1, (b) => {
      const z = 0.06;
      for (const s of [-1, 1])
        flat(b, 0.03, 0.03, z + 0.02, 0x8a9096, [(s * w) / 2.4, -0.03, z / 2]);
      b.cylinder(
        0.018,
        0.018,
        w + 0.08,
        0xc4cad0,
        { at: [0, -0.04, z], rot: [0, 0, Math.PI / 2] },
        8,
      );
      const band = h * 0.4;
      const top = h - band - 0.08;
      // The cloth in vertical panels, a touch lighter and darker, as it hangs.
      for (let k = 0; k < 6; k++) {
        const x = -w / 2 + (k + 0.5) * (w / 6);
        flat(b, w / 6 + 0.002, top, 0.006, tint(VIOLET, k % 2 ? -0.12 : -0.04), [
          x,
          -0.06 - top / 2,
          z,
        ]);
        flat(b, w / 6 + 0.002, band, 0.006, tint(SUIT, k % 2 ? 0 : 0.04), [
          x,
          -0.06 - top - band / 2,
          z,
        ]);
      }
      const py = 0.06;
      tallLetters(b, 'YOTTA', 0, -0.06 - top * 0.32, z + 0.003, w / 22, py, 0xf4f2fa);
      tallLetters(b, '×', 0, -0.06 - top * 0.78, z + 0.003, w / 22, py * 0.8, 0xf4f2fa);
      tallLetters(b, 'MONOLITH', 0, -0.06 - top - band / 2, z + 0.003, w / 34, py, MONO_WHITE);
      // The slab mark over the word, the hem and its weight bar.
      flat(b, 0.03, 0.08, 0.004, MONO_WHITE, [0, -0.06 - top - 0.07, z + 0.005]);
      flat(b, w + 0.02, 0.03, 0.02, 0x2a2c30, [0, -h + 0.015, z]);
    }),
  );
}

/**
 * A rooftop condenser unit, facing +z: an off-white louvred casing on steel
 * rails, its fan guard on top (the fan is `condenserFan`, which spins, at
 * `CONDENSER_TOP`), the refrigerant pipes in grey lagging out of its side.
 */
export const CONDENSER_TOP = 0.39;
export const condenser = looks([0.55, 0.45], 1, (b) => {
  const w = 0.5;
  const d = 0.42;
  const h = CONDENSER_TOP;
  for (const s of [-1, 1]) flat(b, 0.04, 0.04, d + 0.06, 0x6a6e74, [s * (w / 2 - 0.05), 0.02, 0]);
  b.box(w, h - 0.05, d, 0xd8dadc, { at: [0, 0.04 + (h - 0.05) / 2, 0] }, 0.02);
  for (let y = 0.08; y < h - 0.04; y += 0.035) {
    flat(b, w - 0.06, 0.012, 0.005, 0x8a8e94, [0, y, d / 2 + 0.002]);
    for (const s of [-1, 1]) flat(b, 0.005, 0.012, d - 0.06, 0x8a8e94, [s * (w / 2 + 0.002), y, 0]);
  }
  flat(b, w - 0.02, 0.02, d - 0.02, 0xc4c6c8, [0, h - 0.005, 0]);
  b.cylinder(0.17, 0.17, 0.012, 0x1c1e22, { at: [0, h + 0.002, 0] }, 20);
  b.torus(0.175, 0.012, 0x9a9ea4, { at: [0, h + 0.02, 0], rot: [Math.PI / 2, 0, 0] });
  for (let k = 0; k < 4; k++) {
    const a = (k * Math.PI) / 4;
    flat(b, 0.35, 0.006, 0.006, 0x9a9ea4, [0, h + 0.03, 0], [0, a, 0]);
  }
  // The pipes out of its side and along the roof.
  bar(b, [w / 2, 0.12, 0.1], [w / 2 + 0.12, 0.05, 0.1], 0.03, 0x9a9aa0);
  bar(b, [w / 2 + 0.12, 0.05, 0.1], [w / 2 + 0.12, 0.05, 0.6], 0.03, 0x9a9aa0);
  flat(b, 0.1, 0.008, 0.07, 0xe6e8ea, [0, 0.2, d / 2 + 0.006]);
});

/** A condenser's fan, round its hub, three dark blades; it spins. */
export const condenserFan = looks([0.34, 0.34], 1, (b) => {
  b.cylinder(0.035, 0.035, 0.02, 0x4a4e54, { at: [0, 0.01, 0] }, 10);
  for (let k = 0; k < 3; k++) {
    const a = (k * Math.PI * 2) / 3;
    flat(
      b,
      0.14,
      0.006,
      0.06,
      0x5a5e64,
      [Math.cos(a) * 0.09, 0.012, -Math.sin(a) * 0.09],
      [0.3, a, 0],
    );
  }
});

/**
 * The building-maintenance unit's track on a setback roof, `len` along z
 * centred: two steel rails on concrete sleepers, and the machine parked at
 * its back end: a white carriage on wheels with a yellow band, a stubby mast
 * and its jib folded down flat along the track, the cradle's cables coiled
 * on its drum. About 0.45 high.
 */
export function bmuTrack(len: number): SetPiece {
  return once(`bmuTrack:${len.toFixed(2)}`, () =>
    looks([0.6, len], 1, (b) => {
      for (let z = -len / 2 + 0.1; z < len / 2; z += 0.3)
        flat(b, 0.5, 0.025, 0.09, 0xb8b4aa, [0, 0.012, z]);
      for (const s of [-1, 1]) flat(b, 0.03, 0.03, len, 0x6a6e74, [s * 0.18, 0.04, 0]);
      const cz = -len / 2 + 0.32;
      b.box(0.46, 0.2, 0.44, 0xe8eaec, { at: [0, 0.16, cz] }, 0.02);
      flat(b, 0.465, 0.04, 0.445, 0xe6b834, [0, 0.2, cz]);
      for (const s of [-1, 1])
        for (const t of [-1, 1])
          b.cylinder(
            0.04,
            0.04,
            0.03,
            0x2a2c30,
            { at: [s * 0.18, 0.07, cz + t * 0.15], rot: [0, 0, Math.PI / 2] },
            10,
          );
      b.cylinder(0.07, 0.07, 0.12, 0xd8dadc, { at: [0, 0.32, cz] }, 12);
      b.cylinder(
        0.06,
        0.06,
        0.3,
        0x3a3c40,
        { at: [0, 0.3, cz - 0.12], rot: [0, 0, Math.PI / 2] },
        12,
      );
      // The jib folded down along the track, resting on a stand.
      flat(b, 0.08, 0.08, len * 0.62, 0xe8eaec, [0, 0.4, cz + len * 0.31]);
      for (let z = cz + 0.15, k = 0; z < cz + len * 0.6; z += 0.12, k++)
        flat(b, 0.081, 0.081, 0.05, k % 2 ? 0x2a2c30 : 0xe6b834, [0, 0.4, z]);
      flat(b, 0.04, 0.36, 0.04, 0x8a9096, [0, 0.18, cz + len * 0.55]);
      b.cylinder(
        0.05,
        0.05,
        0.05,
        0x8a9096,
        { at: [0, 0.4, cz + len * 0.62], rot: [0, 0, Math.PI / 2] },
        10,
      );
    }),
  );
}

/** MONOLITH's pennant planted on YOTTA's roof: a short pole, a black pennant with the white slab. 0.6 high; sways. */
export const monolithPennant = looks([0.3, 0.1], 1, (b) => {
  b.cylinder(0.04, 0.05, 0.03, 0x3a3c40, { at: [0, 0.015, 0] }, 10);
  b.cylinder(0.01, 0.012, 0.58, 0xc4c9cf, { at: [0, 0.3, 0] }, 8);
  const g = new THREE.BufferGeometry();
  g.setAttribute(
    'position',
    new THREE.Float32BufferAttribute([0, 0.58, 0, 0, 0.36, 0, 0.38, 0.47, 0.02], 3),
  );
  g.computeVertexNormals();
  b.add(g, SUIT, {});
  const back = new THREE.BufferGeometry();
  back.setAttribute(
    'position',
    new THREE.Float32BufferAttribute([0, 0.58, 0, 0.38, 0.47, 0.02, 0, 0.36, 0], 3),
  );
  back.computeVertexNormals();
  b.add(back, SUIT, {});
  flat(b, 0.03, 0.12, 0.004, MONO_WHITE, [0.08, 0.47, 0.012]);
  flat(b, 0.03, 0.12, 0.004, MONO_WHITE, [0.08, 0.47, -0.008]);
});

/** A walk of `n` pale paving slabs across the gravel, along x, centred. */
export function pavingWalk(n: number): SetPiece {
  return once(`pavingWalk:${n}`, () =>
    looks([n * 0.42, 0.4], 1, (b) => {
      for (let k = 0; k < n; k++)
        flat(b, 0.36, 0.03, 0.36, tint(0xdcd6ca, (hash01(k, 1, 281) - 0.5) * 0.12), [
          (k - (n - 1) / 2) * 0.42,
          0.015,
          (hash01(k, 2, 281) - 0.5) * 0.04,
        ]);
    }),
  );
}

/** A black car's open rear door, along with the car (`blackCar`'s space): swung out on its near side. */
export const carDoor = looks([0.56, 0.4], 1, (b) => {
  const hinge: V3 = [0.02, 0.09, 0.11];
  const a = 1.1;
  const l = 0.15;
  flat(
    b,
    l,
    0.09,
    0.012,
    0x111216,
    [hinge[0] - (Math.cos(a) * l) / 2, hinge[1], hinge[2] + (Math.sin(a) * l) / 2],
    [0, a, 0],
  );
  flat(
    b,
    l * 0.8,
    0.035,
    0.013,
    0x3a4250,
    [hinge[0] - (Math.cos(a) * l) / 2, hinge[1] + 0.05, hinge[2] + (Math.sin(a) * l) / 2],
    [0, a, 0],
  );
  // The cabin's pale inside showing through the gap.
  flat(b, 0.13, 0.05, 0.004, 0x8a7a68, [hinge[0] - 0.07, 0.1, 0.112]);
});
