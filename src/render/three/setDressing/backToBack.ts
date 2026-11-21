import * as THREE from 'three';
import { type ModelBuilder, tint } from '../kit';
import { hash01 } from './midRise';
import { looks, nth, type SetPiece } from './shared';

/**
 * Back to Back's world pieces (level 4-1, scene `back-to-back`; see
 * `docs/plan/back-to-back-environment.md`): a high floor of YOTTA Tower in a
 * summer heatwave. Behind the notch, the tower's core: the lift lobby's dark
 * stone wall with YOTTA's brushed-steel letters lit from below, two lifts at
 * floor 38, a bench, an AC grille and Segfault flat out on the cool stone
 * under it. Outside: the city far below in the haze (rooftops, a river with a
 * bridge, the old loft with its lit letters, Mom's station wagon in a visitor
 * bay), MONOLITH's black tower across the river, the tower's own curtain
 * wall dropping away under the front. In front, the sky terrace: pale pavers
 * and decking, a glass balustrade, empty bistro sets, a CLOSED A-board, a
 * thermometer at 38°, the condensers whose fans spin and whose heat shimmers,
 * and Prod in a big planter, a small tree now.
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

/** A flat glowing box (an LED strip, a lit digit). */
function glowBox(b: ModelBuilder, w: number, h: number, d: number, color: number, at: V3) {
  b.add(new THREE.BoxGeometry(w, h, d), color, { at }, 'glow');
}

/** A bar from `a` to `c`, `t` thick: a rope, a rail, a pipe. */
function bar(b: ModelBuilder, a: V3, c: V3, t: number, color: number): void {
  const d = new THREE.Vector3(c[0] - a[0], c[1] - a[1], c[2] - a[2]);
  const len = d.length();
  const g = new THREE.BoxGeometry(t, len, t);
  g.applyQuaternion(
    new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()),
  );
  b.add(g, color, { at: [(a[0] + c[0]) / 2, (a[1] + c[1]) / 2, (a[2] + c[2]) / 2] });
}

/**
 * A flat box whose color shades vertex by vertex: `color(x, y)` gives each
 * corner's color from where it ends up (in the piece's space). For washes of
 * light and sky caught in glass.
 */
function shaded(
  b: ModelBuilder,
  w: number,
  h: number,
  d: number,
  at: V3,
  color: (x: number, y: number) => number,
): void {
  const g = new THREE.BoxGeometry(w, h, d).toNonIndexed();
  b.add(g, 0xffffff, { at });
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

/** A blocky alphabet, 3 wide and 5 high (rows top to bottom). */
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
  V: '101101101101010',
  W: '101101111111101',
  Y: '101101010010010',
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
  '°': '010101010000000',
  ':': '000010000010000',
  '-': '000000111000000',
  '!': '010010010000010',
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

/** Letters `depth` deep standing on a face at depth z facing +z, centred on (x, y), `px` a pixel. */
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
/** The lobby: dark stone wall, honed grey stone floor and its joints, brushed steel, black steel. */
const STONE_DARK = 0x34353b;
const STONE_FLOOR = 0x9c978d;
const STONE_JOINT = 0x7a766f;
const STEEL = 0xd4d8de;
/** YOTTA's letters: brushed faces, darker returns, a bright top edge catching the sky. */
const LETTER_FACE = 0xb8bfc6;
const LETTER_RETURN = 0x6c737b;
const LETTER_TOP = 0xe8ecef;
/** The warm wash the uplights throw up the stone, and the soffit's dark band. */
const WASH = 0xffd7a0;
const SOFFIT = 0x2a2b2e;
/** The runner from the lifts to the bench: dark blue-grey wool, a darker border. */
const RUNNER = 0x4a4658;
const STEEL_DARK = 0x8a9096;
const BLACK_STEEL = 0x2a2c30;
const LEATHER = 0x4a4048;
/** Warm white uplight, amber lift digits. */
const UPLIGHT = 0xffe6c0;
const AMBER = 0xffb040;
/** The terrace: pale limestone pavers and their joints, silver-grey decking, gravel. */
const PAVER = 0xb0a89c;
const PAVER_JOINT = 0x8a7f6e;
const DECK = 0xc8b8a0;
const GRAVEL = 0x9a968e;
const ALU = 0xc4cad0;
const ALU_DARK = 0x6e757c;
const GLASS = 0x9cc4dc;
/** The curtain wall: blue-grey glass with the sky in it, slate mullions, dark spandrels. */
const CW_GLASS = 0x6d8293;
const CW_SKY = 0xa9bccb;
const CW_MULLION = 0x4b525a;
const CW_SPANDREL = 0x3b434c;
const HAZE = 0xd8d4c8;
/** MONOLITH: black glass, cold blue windows, its white logo. */
const MONO_BLACK = 0x15171c;
const MONO_FIN = 0x2a2e36;
const MONO_WINDOW = 0x5a7fa8;
const MONO_LOGO = 0xf4f8ff;

// ---- The lift lobby ----

/**
 * A slab of honed grey stone floor `w` × `d`, centred on the origin, its top at
 * the level's floor: large tiles, each its own tone, in darker joints. Stands
 * on the ground.
 */
export function stoneFloor(w: number, d: number): SetPiece {
  return once(`stoneFloor:${w.toFixed(2)}:${d.toFixed(2)}`, () =>
    looks([w, d], 1, (b) => {
      flat(b, w, FLOOR - 0.006, d, STONE_JOINT, [0, (FLOOR - 0.006) / 2, 0]);
      const s = 0.6;
      for (let i = 0, x = -w / 2; x < w / 2 - 0.01; i++, x += s)
        for (let j = 0, z = -d / 2; z < d / 2 - 0.01; j++, z += s) {
          const xb = Math.min(w / 2, x + s);
          const zb = Math.min(d / 2, z + s);
          const tone = (hash01(i, j, 31) - 0.5) * 0.08;
          flat(b, xb - x - 0.014, 0.006, zb - z - 0.014, tint(STONE_FLOOR, tone), [
            (x + xb) / 2,
            FLOOR - 0.003,
            (z + zb) / 2,
          ]);
        }
    }),
  );
}

/**
 * The lobby's rug, `w` across x and `len` along z, centred: a flat dusky
 * violet-grey wool rug with a darker border and a paler worn track down its
 * middle, from the lifts. Flat planes only (no side faces), so it lies on the
 * stone instead of standing up off it.
 */
export function runner(len: number, w: number): SetPiece {
  return once(`runner:${len.toFixed(2)}:${w.toFixed(2)}`, () =>
    looks([w, len], 1, (b) => {
      const lay = (pw: number, pd: number, c: number, y: number) =>
        b.add(new THREE.PlaneGeometry(pw, pd), c, { at: [0, y, 0], rot: [-Math.PI / 2, 0, 0] });
      lay(w, len, tint(RUNNER, -0.22), 0.006);
      lay(w - 0.1, len - 0.1, RUNNER, 0.008);
      lay(w * 0.34, len - 0.3, tint(RUNNER, 0.07), 0.01);
    }),
  );
}

/**
 * The tower's core round the lift lobby: a dark stone feature wall `w` along
 * x centred on 0 and `h` high, its face at z = 0 toward +z, big honed slabs
 * with fine joints and a few pale veins; stone returns `ret` deep at both
 * ends, a dark soffit band along its top, a black steel shadow gap at its
 * foot. Over `wash` (a centre and a width along x) the uplights' warm light
 * washes up the stone, fading as it rises. Placed on the lobby floor.
 */
export function featureWall(
  w: number,
  h: number,
  ret: number,
  wash: { x: number; w: number },
): SetPiece {
  const key = `featureWall:${w.toFixed(2)}:${h.toFixed(2)}:${ret}:${wash.x.toFixed(2)}:${wash.w.toFixed(2)}`;
  return once(key, () =>
    looks([w, 0.25], 1, (b) => {
      flat(b, w, h, 0.24, tint(STONE_DARK, -0.15), [0, h / 2, -0.12]);
      const sw = 0.62;
      const sh = (h - 0.16) / 3;
      /** How much warm light reaches the stone at (x, y): most at the foot under the letters. */
      const lit = (x: number, y: number) => {
        const across = Math.max(0, 1 - Math.abs(x - wash.x) / (wash.w / 2 + 0.4));
        const up = Math.max(0, 1 - y / (h * 0.85));
        return 0.34 * Math.min(1, across * 1.6) * up * up;
      };
      for (let i = 0, x = -w / 2; x < w / 2 - 0.01; i++, x += sw)
        for (let j = 0; j < 3; j++) {
          const xb = Math.min(w / 2, x + sw);
          const y0 = 0.04 + j * sh;
          const tone = tint(STONE_DARK, (hash01(i, j, 41) - 0.5) * 0.12);
          shaded(
            b,
            xb - x - 0.012,
            sh - 0.012,
            0.01,
            [(x + xb) / 2, y0 + sh / 2, 0.005],
            (vx, vy) => mix(tone, WASH, lit(vx, vy)),
          );
          // A pale vein across some slabs.
          if (hash01(i, j, 43) > 0.55) {
            const a = (hash01(i, j, 47) - 0.5) * 1.6;
            flat(
              b,
              (xb - x) * 0.8,
              0.008,
              0.004,
              tint(STONE_DARK, 0.22),
              [(x + xb) / 2, y0 + sh * (0.3 + hash01(i, j, 53) * 0.4), 0.012],
              [0, 0, a * 0.4],
            );
          }
        }
      flat(b, w, 0.04, 0.02, BLACK_STEEL, [0, 0.02, 0.01]);
      // The soffit: a dark band along the top, standing out over the lobby, and the wall's top.
      flat(b, w + 0.02, 0.14, ret, SOFFIT, [0, h - 0.07, ret / 2 - 0.02]);
      flat(b, w + 0.02, 0.02, ret + 0.24, tint(SOFFIT, 0.08), [0, h + 0.01, ret / 2 - 0.13]);
      // The returns: the core's stone coming forward at both ends, its slabs and a dark edge.
      for (const s of [-1, 1]) {
        const x = s * (w / 2 - 0.09);
        flat(b, 0.18, h, ret, tint(STONE_DARK, -0.05), [x, h / 2, ret / 2]);
        for (let j = 0; j < 3; j++)
          flat(
            b,
            0.006,
            sh - 0.012,
            ret - 0.03,
            tint(STONE_DARK, (hash01(s, j, 45) - 0.5) * 0.14),
            [x - s * 0.093, 0.04 + j * sh + sh / 2, ret / 2],
          );
        flat(b, 0.19, h, 0.012, tint(STONE_DARK, -0.3), [x, h / 2, ret + 0.004]);
      }
    }),
  );
}

/**
 * YOTTA's logo in brushed steel channel letters standing off the stone, the
 * chapter's logo: `px` a pixel, centred on x = 0 with their foot at y = 0,
 * face toward +z; the violet orbit mark to their left. Each stroke a brushed
 * face over a darker return, its top edge catching the sky; the uplights'
 * warm wash on the stone behind is the wall's (`featureWall`).
 */
export function steelLogo(text: string, px: number): SetPiece {
  return once(`steelLogo:${text}:${px}`, () =>
    looks([textWidth(text) * px + px * 8, 0.1], 1, (b) => {
      const tw = textWidth(text) * px;
      const cx = px * 4;
      const cy = px * 2.5;
      glyphs(text, (u, r, w) => {
        const at: V3 = [cx + u * px, cy + (2 - r) * px, 0.04];
        flat(b, w * px, px, 0.06, LETTER_RETURN, at);
        flat(b, w * px - 0.008, px - 0.008, 0.006, LETTER_FACE, [at[0], at[1], 0.073]);
        // Brushed grain across the face, and the top edge bright with the sky.
        flat(b, w * px - 0.03, 0.006, 0.004, tint(LETTER_FACE, -0.12), [
          at[0],
          at[1] - px * 0.18,
          0.077,
        ]);
        flat(b, w * px, 0.02, 0.062, LETTER_TOP, [at[0], at[1] + px / 2 - 0.009, 0.041]);
      });
      // The orbit mark: a violet ring round a steel planet, left of the letters.
      const rx = cx - tw / 2 - px * 2.6;
      b.add(
        new THREE.TorusGeometry(px * 1.9, px * 0.32, 8, 28),
        VIOLET,
        { at: [rx, cy, 0.05], rot: [0, 0, 0.5] },
        'glow',
      );
      b.sphere(px * 1.1, LETTER_FACE, { at: [rx, cy, 0.04] }, [1, 1, 0.5]);
    }),
  );
}

/** A slot of warm light in the floor along x, `len` long, at the wall's foot: the letters' uplights. */
export function uplights(len: number): SetPiece {
  return once(`uplights:${len.toFixed(2)}`, () =>
    looks([len, 0.1], 1, (b) => {
      flat(b, len + 0.06, 0.012, 0.09, BLACK_STEEL, [0, 0.006, 0]);
      glowBox(b, len, 0.012, 0.03, UPLIGHT, [0, 0.012, 0]);
    }),
  );
}

/** How wide a lift's frame is and how tall its doors. */
export const LIFT = { w: 0.78, h: 1.02 } as const;
/** The lift indicator panel over the doors: its width, height and centre's height. */
const PANEL = { w: 0.62, h: 0.28, y: LIFT.h + 0.26 } as const;

/**
 * A lift in the lobby's stone wall, facing +z: a black steel frame round two
 * brushed steel leaves with a seam, a sill, and over it a black indicator
 * panel (its digits and arrow are the `liftDigits` piece, so they can glow).
 * A call-button plate on its right.
 */
export const liftDoor = looks([LIFT.w, 0.12], 1, (b) => {
  const { w, h } = LIFT;
  flat(b, w + 0.12, h + 0.08, 0.05, BLACK_STEEL, [0, (h + 0.08) / 2, 0.025]);
  for (const s of [-1, 1]) {
    flat(b, w / 2 - 0.012, h - 0.02, 0.02, STEEL, [(s * w) / 4, h / 2, 0.06]);
    // Brushed grain: faint vertical lines.
    for (let k = 1; k < 4; k++)
      flat(b, 0.006, h - 0.06, 0.004, tint(STEEL, -0.1), [
        (s * w) / 4 + (k - 2) * 0.08,
        h / 2,
        0.072,
      ]);
  }
  flat(b, 0.008, h - 0.02, 0.022, 0x1a1c20, [0, h / 2, 0.062]);
  flat(b, w + 0.04, 0.02, 0.1, STEEL_DARK, [0, 0.01, 0.07]);
  // The indicator panel over the doors, in a steel bezel.
  flat(b, PANEL.w + 0.04, PANEL.h + 0.04, 0.026, STEEL_DARK, [0, PANEL.y, 0.02]);
  flat(b, PANEL.w, PANEL.h, 0.03, 0x0e0f12, [0, PANEL.y, 0.03]);
  // The call buttons.
  flat(b, 0.08, 0.16, 0.02, STEEL_DARK, [w / 2 + 0.16, 0.5, 0.01]);
});

/** The lift indicator's digits, 4 wide and 5 high. */
const LIFT_FONT: Readonly<Record<string, string>> = {
  '3': '11100001011000011110',
  '8': '01101001011010010110',
};

/** A lift's indicator: the floor number in big amber digits and, clear of it, an up arrow. */
export function liftDigits(text: string): SetPiece {
  return once(`liftDigits:${text}`, () =>
    looks([0.6, 0.05], 1, (b) => {
      const px = 0.034;
      const z = 0.047;
      // The digits in a wider, rounder 4 × 5 face than the signs' (so 38 never reads 3B), clear
      // of the arrow.
      const x0 = -0.27;
      Array.from(text).forEach((ch, k) => {
        const glyph = LIFT_FONT[ch] ?? '';
        for (let r = 0; r < 5; r++)
          for (let col = 0; col < 4; col++)
            if (glyph[r * 4 + col] === '1')
              glowBox(b, px, px, 0.004, AMBER, [
                x0 + (k * 5 + col + 0.5) * px,
                PANEL.y + (2 - r) * px,
                z,
              ]);
      });
      // An up arrow at the panel's right: a triangle on a stem.
      const ax = 0.21;
      const ap = 0.026;
      b.add(
        new THREE.CircleGeometry(ap * 3, 3),
        AMBER,
        { at: [ax, PANEL.y + ap * 1.2, z], rot: [0, 0, Math.PI / 2] },
        'glow',
      );
      glowBox(b, ap * 1.2, ap * 3, 0.004, AMBER, [ax, PANEL.y - ap * 2.2, z]);
      // The call button, lit.
      b.led(0.018, 0xfff0d0, { at: [LIFT.w / 2 + 0.16, 0.53, 0.025] });
    }),
  );
}

/** A low lobby bench along x: a long stone plinth with a dark leather pad. 0.26 high. */
export function lobbyBench(len: number): SetPiece {
  return once(`lobbyBench:${len.toFixed(2)}`, () =>
    looks([len, 0.42], 1, (b) => {
      flat(b, len - 0.1, 0.16, 0.34, 0xbab4a8, [0, 0.08, 0]);
      b.box(len, 0.08, 0.42, LEATHER, { at: [0, 0.2, 0] }, 0.03);
      for (let x = -len / 2 + len / 3; x < len / 2 - 0.1; x += len / 3)
        flat(b, 0.008, 0.01, 0.4, tint(LEATHER, -0.2), [x, 0.241, 0]);
    }),
  );
}

/**
 * A linear floor grille along x, `len` long, set in the stone: dark steel slats
 * over a black trench, in a slate surround where the AC's cold air spills out
 * (dark, so the tabby on it stands out). Flush with the floor.
 */
export function floorGrille(len: number): SetPiece {
  return once(`floorGrille:${len.toFixed(2)}`, () =>
    looks([len, 0.2], 1, (b) => {
      flat(b, len + 0.5, 0.004, 0.7, 0x5a5d62, [0, 0.002, 0.05]);
      flat(b, len, 0.006, 0.14, 0x1e2024, [0, 0.004, 0]);
      for (let x = -len / 2 + 0.03; x < len / 2; x += 0.045)
        flat(b, 0.016, 0.008, 0.13, 0x7a8086, [x, 0.006, 0]);
      flat(b, len + 0.02, 0.008, 0.012, STEEL_DARK, [0, 0.006, 0.07]);
      flat(b, len + 0.02, 0.008, 0.012, STEEL_DARK, [0, 0.006, -0.07]);
    }),
  );
}

/** Tabby colors, Segfault's own (the On Call cat's). */
const FUR = 0x8a8580;
const STRIPE = 0x4a4644;
const CHEST = 0xd8d2c8;
const PINK = 0xc88a8a;

/**
 * Segfault in a heatwave: flat out on its side on the stone, legs stretched,
 * belly to the camera, tail straight out. About 0.6 long along x, its back
 * toward −z. Breathes (`purr`).
 */
export const sprawledCat = looks([0.62, 0.3], 1, (b) => {
  // The long body on its side.
  b.sphere(0.12, FUR, { at: [0, 0.075, -0.02] }, [1.9, 0.62, 0.95]);
  b.sphere(0.09, CHEST, { at: [0.02, 0.06, 0.05] }, [1.9, 0.55, 0.6]);
  for (const x of [-0.13, -0.05, 0.03, 0.11])
    flat(b, 0.035, 0.012, 0.16, STRIPE, [x, 0.115, -0.04], [0.2, 0, 0]);
  // Legs stretched out toward the camera, front pair forward, back pair back.
  for (const [x, a] of [
    [-0.15, -0.5],
    [-0.1, -0.3],
    [0.13, 0.35],
    [0.18, 0.55],
  ] as const) {
    b.capsule(0.022, 0.12, FUR, {
      at: [x + Math.sin(a) * 0.04, 0.03, 0.1],
      rot: [Math.PI / 2, 0, a],
    });
    b.sphere(0.026, CHEST, { at: [x + Math.sin(a) * 0.1, 0.028, 0.17] });
  }
  // The head, flat on the stone, eyes shut, ears back.
  const hx = -0.27;
  b.sphere(0.075, FUR, { at: [hx, 0.06, 0.0] }, [1.0, 0.8, 1.1]);
  b.sphere(0.038, CHEST, { at: [hx - 0.04, 0.045, 0.05] }, [1.2, 0.7, 0.9]);
  flat(b, 0.016, 0.01, 0.01, PINK, [hx - 0.07, 0.05, 0.075]);
  for (const dz of [0.0, 0.045])
    flat(b, 0.006, 0.006, 0.026, 0x1c1a1a, [hx - 0.035, 0.1, dz + 0.0], [0, 0.3, 0]);
  for (const dz of [-0.04, 0.03]) {
    b.cone(0.03, 0.07, FUR, { at: [hx + 0.04, 0.1, dz], rot: [0, 0, -1.1] }, 4);
    b.cone(0.017, 0.045, PINK, { at: [hx + 0.038, 0.098, dz], rot: [0, 0, -1.1] }, 4);
  }
  // The tail straight out behind, a ringed tip.
  b.capsule(0.022, 0.24, FUR, { at: [0.33, 0.03, -0.03], rot: [0, 0.2, Math.PI / 2] });
  for (const x of [0.3, 0.38]) flat(b, 0.02, 0.05, 0.05, STRIPE, [x, 0.03, -0.03]);
  b.sphere(0.024, STRIPE, { at: [0.46, 0.03, -0.05] });
});

/** A visitor's lanyard and badge, worn at the chest: a violet strap and a white card. Faces +z. */
export const lanyard = looks([0.15, 0.05], 1, (b) => {
  for (const s of [-1, 1]) bar(b, [s * 0.06, 0.16, 0], [s * 0.012, 0.03, 0.012], 0.014, VIOLET);
  flat(b, 0.07, 0.09, 0.008, 0xf4f2ee, [0, -0.02, 0.02]);
  flat(b, 0.05, 0.018, 0.004, VIOLET, [0, 0.01, 0.026]);
});

/** A visitor's roller case standing beside them: dark grey, its handle up. */
export const rollerCase = looks([0.25, 0.16], 1, (b) => {
  b.box(0.24, 0.32, 0.14, 0x3a3e46, { at: [0, 0.18, 0] }, 0.03);
  for (const s of [-1, 1]) flat(b, 0.012, 0.18, 0.012, STEEL_DARK, [s * 0.06, 0.43, -0.04]);
  flat(b, 0.14, 0.02, 0.02, 0x22242a, [0, 0.52, -0.04]);
  for (const s of [-1, 1])
    b.cylinder(0.02, 0.02, 0.02, 0x1a1a1a, { at: [s * 0.08, 0.02, -0.05], rot: [0, 0, 1.57] }, 8);
});

/**
 * A desk fan carried upright by its base (hold the origin at chest height):
 * the round base in both hands, the neck up out of it and the head on top,
 * guard toward +z, its flex hanging down. About 0.45 high over the hands.
 */
export const carriedFan = looks([0.34, 0.2], 1, (b) => {
  const pale = 0xdedcd6;
  b.cylinder(0.11, 0.12, 0.05, pale, { at: [0, 0.0, 0] }, 16);
  b.cylinder(0.018, 0.022, 0.16, pale, { at: [0, 0.1, -0.01] }, 8);
  const hy = 0.3;
  b.cylinder(0.05, 0.05, 0.08, pale, { at: [0, hy, -0.05], rot: [Math.PI / 2, 0, 0] }, 12);
  b.cylinder(0.15, 0.15, 0.03, 0x50555c, { at: [0, hy, 0.0], rot: [Math.PI / 2, 0, 0] }, 20);
  b.torus(0.15, 0.012, pale, { at: [0, hy, 0.02] });
  for (let a = 0; a < 3; a++)
    b.box(
      0.07,
      0.12,
      0.008,
      0x8a98a4,
      { at: [0, hy, 0.02], rot: [0, 0, (a * Math.PI * 2) / 3] },
      0,
    );
  b.sphere(0.03, pale, { at: [0, hy, 0.03] });
  // The flex, looped down from the base.
  bar(b, [0.08, -0.02, -0.02], [0.12, -0.22, 0.0], 0.012, 0x2a2c30);
  b.box(0.03, 0.04, 0.02, 0x2a2c30, { at: [0.12, -0.24, 0.0] }, 0);
});

// ---- The sky terrace ----

/**
 * The terrace slab `w` × `d`, centred on the origin: its top at the level's
 * floor in big pale limestone pavers (each its own tone, a few sun-bleached),
 * its front face a pale stone edge with a steel flashing. Stands on the ground.
 */
export function paverDeck(w: number, d: number): SetPiece {
  return once(`paverDeck:${w.toFixed(2)}:${d.toFixed(2)}`, () =>
    looks([w, d], 1, (b) => {
      const top = FLOOR - 0.008;
      flat(b, w, top, d, PAVER_JOINT, [0, top / 2, 0]);
      flat(b, w, 0.04, 0.012, ALU_DARK, [0, top - 0.02, d / 2 + 0.006]);
      const s = 0.5;
      for (let i = 0, x = -w / 2; x < w / 2 - 0.01; i++, x += s)
        for (let j = 0, z = -d / 2; z < d / 2 - 0.01; j++, z += s) {
          const xb = Math.min(w / 2, x + s);
          const zb = Math.min(d / 2, z + s);
          const tone = (hash01(i, j, 61) - 0.5) * 0.08;
          flat(b, xb - x - 0.016, 0.008, zb - z - 0.016, tint(PAVER, tone), [
            (x + xb) / 2,
            top + 0.004,
            (z + zb) / 2,
          ]);
        }
      // Where pots stood all spring: pale sun-bleached squares with a faint ring round them.
      for (let k = 0; k < Math.floor((w * d) / 2.2); k++) {
        const x = -w / 2 + 0.3 + hash01(k, 1, 63) * (w - 0.6);
        const z = -d / 2 + 0.3 + hash01(k, 2, 63) * (d - 0.6);
        const r = 0.16 + hash01(k, 3, 63) * 0.1;
        flat(b, r * 2 + 0.04, 0.002, r * 2 + 0.04, tint(PAVER, -0.07), [x, top + 0.009, z]);
        flat(b, r * 2, 0.0025, r * 2, tint(PAVER, 0.18), [x, top + 0.0095, z]);
      }
    }),
  );
}

/** Timber decking `w` × `d` on the pavers, boards along x, centred: silver-grey, sun-dried. */
export function timberDeck(w: number, d: number): SetPiece {
  return once(`timberDeck:${w.toFixed(2)}:${d.toFixed(2)}`, () =>
    looks([w, d], 1, (b) => {
      flat(b, w, 0.03, d, tint(DECK, -0.35), [0, 0.015, 0]);
      const bw = 0.14;
      for (let j = 0, z = -d / 2 + bw / 2; z < d / 2; j++, z += bw) {
        // Boards in lengths, butt joints staggered.
        let x = -w / 2;
        for (let k = 0; x < w / 2 - 0.01; k++) {
          const len = Math.min(w / 2 - x, 0.9 + hash01(j, k, 71) * 0.8);
          flat(b, len - 0.01, 0.012, bw - 0.016, tint(DECK, (hash01(j, k, 73) - 0.5) * 0.1), [
            x + len / 2,
            0.034,
            z,
          ]);
          x += len;
        }
      }
    }),
  );
}

/** A steel-edged gravel bed `w` × `d`, centred, for the plant: grey stones, a drain. */
export function gravelBed(w: number, d: number): SetPiece {
  return once(`gravelBed:${w.toFixed(2)}:${d.toFixed(2)}`, () =>
    looks([w, d], 1, (b) => {
      flat(b, w, 0.025, d, GRAVEL, [0, 0.0125, 0]);
      for (const s of [-1, 1]) {
        flat(b, w, 0.035, 0.02, ALU_DARK, [0, 0.017, (s * d) / 2]);
        flat(b, 0.02, 0.035, d, ALU_DARK, [(s * w) / 2, 0.017, 0]);
      }
      for (let k = 0; k < Math.floor(w * d * 30); k++)
        flat(b, 0.05, 0.006, 0.04, tint(GRAVEL, (hash01(k, 3, 79) - 0.5) * 0.25), [
          -w / 2 + 0.04 + hash01(k, 5, 79) * (w - 0.08),
          0.028,
          -d / 2 + 0.04 + hash01(k, 7, 79) * (d - 0.08),
        ]);
    }),
  );
}

/** How tall a condenser's case stands, to its fan's hub. */
export const CONDENSER = { w: 0.72, d: 0.6, h: 0.42 } as const;

/**
 * An air-conditioning condenser on the terrace, facing +z: a pale grey case
 * with louvred sides on black steel rails, the round opening in its top where
 * the fan (`condenserFan`, spinning) sits, a guard of steel bars over it, and
 * the refrigerant pipes in their lagging out of its side. Heat-stained.
 */
export const condenserCase = looks([CONDENSER.w, CONDENSER.d], 2, (b, v) => {
  const { w, d, h } = CONDENSER;
  for (const s of [-1, 1]) flat(b, w + 0.08, 0.04, 0.06, BLACK_STEEL, [0, 0.02, (s * d) / 3]);
  b.box(w, h - 0.04, d, v ? 0xd6d8d6 : 0xcfd2d2, { at: [0, 0.04 + (h - 0.04) / 2, 0] }, 0.02);
  // Louvres on the front and sides.
  for (let y = 0.1; y < h - 0.05; y += 0.04) {
    flat(b, w - 0.08, 0.012, 0.01, 0x8e949a, [0, y, d / 2 + 0.004]);
    for (const s of [-1, 1]) flat(b, 0.01, 0.012, d - 0.1, 0x8e949a, [(s * w) / 2 + 0.004, y, 0]);
  }
  // The top: the dark well the fan turns in, and its guard.
  b.cylinder(0.27, 0.27, 0.012, 0x24262a, { at: [0, h + 0.002, 0] }, 24);
  b.torus(0.27, 0.014, 0x9aa0a6, { at: [0, h + 0.04, 0], rot: [Math.PI / 2, 0, 0] });
  for (const a of [0, Math.PI / 4, Math.PI / 2, (3 * Math.PI) / 4])
    flat(b, 0.54, 0.008, 0.008, 0xb4bac0, [0, h + 0.045, 0], [0, a, 0]);
  // A heat stain fading down the front and a maker's badge.
  flat(b, w * 0.4, 0.08, 0.004, 0xa8a49a, [-0.12, h - 0.06, d / 2 + 0.01]);
  flat(b, 0.1, 0.03, 0.004, 0x3a72a8, [w / 2 - 0.12, h - 0.06, d / 2 + 0.012]);
  // The pipes out of its side and down to the deck, in black lagging.
  b.cylinder(0.025, 0.025, 0.2, 0x1e1f22, { at: [w / 2 + 0.03, 0.18, -0.12] }, 8);
  b.cylinder(0.018, 0.018, 0.2, 0xb87a4a, { at: [w / 2 + 0.03, 0.18, -0.04] }, 8);
});

/** A condenser's fan, round its hub (place it at the case's top): four dark blades. Spins. */
export const condenserFan = looks([0.5, 0.5], 1, (b) => {
  b.cylinder(0.05, 0.05, 0.03, 0x3a3d42, { at: [0, 0.02, 0] }, 12);
  for (let a = 0; a < 4; a++) {
    const t = (a * Math.PI) / 2;
    b.box(
      0.22,
      0.008,
      0.09,
      0x6a6e74,
      {
        at: [Math.cos(t) * 0.13, 0.025, -Math.sin(t) * 0.13],
        rot: [0, t, 0.3],
      },
      0,
    );
  }
});

/**
 * Heat shimmer over a condenser: a few wavy panes of pale glass, stacked and
 * twisted, fading upward. Translucent; about 0.15 tall above its origin.
 */
export const heatShimmer = looks([0.5, 0.5], 2, (b, v) => {
  for (let k = 0; k < 3; k++) {
    const y = 0.02 + k * 0.045;
    const a = k * 0.9 + v * 0.7;
    b.pane(0.42 - k * 0.05, 0.03, 0.3 - k * 0.04, mix(0xfff4e0, 0xffffff, k / 4), {
      at: [Math.sin(a) * 0.03, y, Math.cos(a) * 0.02],
      rot: [Math.sin(a) * 0.08, a, 0],
    });
  }
});

/** The refrigerant pipe tray along x, `len` long: lagged pipes on low steel stands. 0.12 high. */
export function pipeTray(len: number): SetPiece {
  return once(`pipeTray:${len.toFixed(2)}`, () =>
    looks([len, 0.2], 1, (b) => {
      for (let x = 0.15; x < len; x += 0.6) flat(b, 0.03, 0.06, 0.18, BLACK_STEEL, [x, 0.03, 0]);
      flat(b, len, 0.012, 0.18, ALU_DARK, [len / 2, 0.065, 0]);
      for (const [z, r, c] of [
        [-0.05, 0.022, 0x1e1f22],
        [0.0, 0.016, 0xb87a4a],
        [0.05, 0.022, 0x1e1f22],
      ] as const)
        b.cylinder(r, r, len, c, { at: [len / 2, 0.08 + r, z], rot: [0, 0, Math.PI / 2] }, 8);
    }),
  );
}

/**
 * An empty bistro set out in the heat: a round steel table and two chairs
 * tipped forward against it (the terrace is closed). Under 0.5 high.
 */
export const bistroSet = looks([0.8, 0.6], 2, (b, v) => {
  const top = v ? 0x5a6a62 : 0x3e4a52;
  b.cylinder(0.2, 0.2, 0.02, top, { at: [0, 0.4, 0] }, 20);
  b.cylinder(0.015, 0.015, 0.38, BLACK_STEEL, { at: [0, 0.2, 0] }, 8);
  b.cylinder(0.12, 0.12, 0.015, BLACK_STEEL, { at: [0, 0.008, 0] }, 14);
  for (const s of [-1, 1]) {
    const x = s * 0.32;
    const lean = s * 0.5;
    // Seat, back and legs, the whole chair tilted onto the table's edge.
    const c = tint(top, 0.15);
    b.box(0.2, 0.02, 0.2, c, { at: [x, 0.3, 0.02], rot: [0, 0, lean] }, 0);
    b.box(0.2, 0.18, 0.02, c, { at: [x + s * 0.06, 0.4, -0.08], rot: [0, 0, lean] }, 0);
    for (const dz of [-0.08, 0.08])
      bar(b, [x - s * 0.1, 0.0, dz], [x + s * 0.0, 0.3, dz], 0.016, BLACK_STEEL);
  }
});

/**
 * A plane tilted back by `a` about x, through `o`: `at(u, v, off)` is the
 * point `u` along x, `v` up the plane and `off` out of it; `rot` turns a box
 * to lie on it.
 */
function tilted(o: V3, a: number): { at: (u: number, v: number, off: number) => V3; rot: V3 } {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return {
    at: (u, v, off) => [o[0] + u, o[1] + v * c + off * s, o[2] - v * s + off * c],
    rot: [-a, 0, 0],
  };
}

/**
 * The A-board on the terrace, facing +z and leaning back: "TERRACE" over a
 * red "CLOSED", then "HEAT!" and a red sun. Under 0.55 high.
 */
export const closedBoard = looks([0.74, 0.3], 1, (b) => {
  const h = 0.52;
  const p = tilted([0, 0, 0.08], 0.32);
  for (const s of [-1, 1]) bar(b, [s * 0.3, 0, -0.16], [s * 0.3, h * 0.95, -0.02], 0.025, 0x5a5048);
  const box = (w: number, hh: number, d: number, c: number, u: number, v: number, off: number) =>
    b.box(w, hh, d, c, { at: p.at(u, v, off), rot: p.rot }, 0);
  box(0.72, h, 0.025, 0x2c2e32, 0, h / 2, 0);
  box(0.66, h - 0.05, 0.006, 0xf2efe8, 0, h / 2, 0.015);
  const line = (text: string, v: number, px: number, c: number) => {
    glyphs(text, (u, r, w) => box(w * px, px, 0.004, c, u * px, v + (2 - r) * px, 0.02));
  };
  line('TERRACE', 0.41, 0.02, 0x3a3c40);
  line('CLOSED', 0.26, 0.026, 0xc8302a);
  line('HEAT!', 0.11, 0.02, 0x3a3c40);
  b.cylinder(
    0.035,
    0.035,
    0.006,
    0xe8902a,
    { at: p.at(0.25, 0.13, 0.02), rot: [Math.PI / 2 - 0.32, 0, 0] },
    14,
  );
});

/**
 * A big outdoor thermometer, upright and leaning back a little toward the
 * camera: a cream enamel board on a short post, the glass tube up its middle
 * with the red column right up at the top, the bulb at the foot, a scale of
 * ticks, the hot end painted red and the reading, "38°", big at the top.
 * Under 0.55 high.
 */
export const thermometer = looks([0.34, 0.16], 1, (b) => {
  flat(b, 0.16, 0.02, 0.12, ALU_DARK, [0, 0.01, -0.02]);
  flat(b, 0.03, 0.06, 0.03, ALU_DARK, [0, 0.04, -0.02]);
  const p = tilted([0, 0.06, 0], 0.36);
  const box = (w: number, h: number, d: number, c: number, u: number, v: number, off: number) =>
    b.box(w, h, d, c, { at: p.at(u, v, off), rot: p.rot }, 0);
  const w = 0.32;
  const h = 0.5;
  box(w, h, 0.025, 0x3a3c40, 0, h / 2, 0);
  box(w - 0.02, h - 0.02, 0.006, 0xf2ecdc, 0, h / 2, 0.015);
  // The reading across the top, big.
  const px = 0.026;
  glyphs('38°', (u, r, gw) =>
    box(gw * px, px, 0.004, 0x2a2c30, u * px, h - 0.1 + (2 - r) * px, 0.022),
  );
  // The tube down the middle, the bulb at its foot and the red column right up to the top.
  const tv0 = 0.05;
  const tv1 = h - 0.2;
  box(0.036, tv1 - tv0 + 0.02, 0.008, 0xe8eef2, 0, (tv0 + tv1) / 2, 0.02);
  box(0.022, tv1 - tv0 - 0.01, 0.012, 0xd8402e, 0, (tv0 + tv1) / 2 + 0.005, 0.024);
  b.sphere(0.04, 0xd8402e, { at: p.at(0, tv0, 0.03) });
  // The ticks either side, the hot end of the scale painted red.
  for (let k = 0; k < 6; k++)
    for (const s of [-1, 1])
      box(0.04, 0.007, 0.004, 0x3a3c40, s * 0.06, tv0 + 0.04 + k * 0.045, 0.02);
  box(0.035, 0.07, 0.004, 0xd8402e, 0.11, tv1 - 0.04, 0.02);
  box(0.035, 0.07, 0.004, 0xd8402e, -0.11, tv1 - 0.04, 0.02);
});

/**
 * A folded parasol taken down and laid on the pavers along x (the terrace is
 * closed): its canopy furled round the pole in sun-faded canvas, tied, the
 * crank at its foot, and its granite base beside it. 0.16 high.
 */
export const foldedParasol = looks([1.7, 0.4], 1, (b) => {
  const canvas = 0xe9e1cf;
  b.cylinder(0.022, 0.022, 1.6, 0xb8bcc0, { at: [0, 0.06, 0], rot: [0, 0, Math.PI / 2] }, 8);
  // The furled canopy: a long cone round the pole's top half, fattest near the tip.
  b.cylinder(0.08, 0.03, 0.75, canvas, { at: [0.35, 0.09, 0], rot: [0, 0, -Math.PI / 2] }, 10);
  b.cone(0.08, 0.12, canvas, { at: [0.78, 0.09, 0], rot: [0, 0, -Math.PI / 2] }, 10);
  for (const x of [0.15, 0.45])
    b.torus(0.07, 0.01, 0x9a8a6a, { at: [x, 0.09, 0], rot: [0, Math.PI / 2, 0] });
  b.box(0.08, 0.05, 0.05, 0x5a5e64, { at: [-0.45, 0.06, 0] }, 0.01);
  // The base: a square granite slab with its socket.
  b.box(0.36, 0.08, 0.36, 0x8a8680, { at: [-0.62, 0.04, 0.3] }, 0.02);
  b.cylinder(0.04, 0.04, 0.08, 0xb8bcc0, { at: [-0.62, 0.12, 0.3] }, 10);
});

/**
 * Sun loungers folded flat and stacked on the pavers, `0.95` along x: three
 * teak-slatted frames in white aluminium, a rolled cushion on top, strapped.
 * 0.3 high.
 */
export const loungerStack = looks([1.0, 0.5], 1, (b) => {
  for (let k = 0; k < 3; k++) {
    const y = 0.02 + k * 0.085;
    const dx = (k - 1) * 0.03;
    flat(b, 0.95, 0.03, 0.46, 0xd8dad6, [dx, y + 0.015, 0]);
    for (let x = -0.4; x <= 0.41; x += 0.1)
      flat(b, 0.07, 0.012, 0.4, 0xa88a68, [dx + x, y + 0.036, 0]);
    flat(b, 0.95, 0.04, 0.02, 0xb8bab6, [dx, y + 0.05, 0.22]);
  }
  b.cylinder(0.06, 0.06, 0.42, 0xd8cfb8, { at: [0.2, 0.33, 0], rot: [Math.PI / 2, 0, 0] }, 10);
  for (const x of [-0.25, 0.25]) flat(b, 0.03, 0.3, 0.48, 0x3a3c40, [x, 0.15, 0]);
});

/** A square floor drain set in the pavers, `0.34` across: a steel frame and slotted grate. Flush. */
export const drainGrate = looks([0.34, 0.34], 1, (b) => {
  flat(b, 0.34, 0.006, 0.34, ALU_DARK, [0, 0.003, 0]);
  flat(b, 0.3, 0.007, 0.3, 0x24262a, [0, 0.0035, 0]);
  for (let x = -0.12; x <= 0.121; x += 0.04) flat(b, 0.016, 0.009, 0.28, 0x8a9096, [x, 0.0045, 0]);
});

/**
 * Mom's visitor bay far below, `len` along z and `w` across: a violet painted
 * outline, a pale fill and a "V" in the middle. Flat on the asphalt.
 */
export function visitorBay(len: number, w: number): SetPiece {
  return once(`visitorBay:${len.toFixed(2)}:${w.toFixed(2)}`, () =>
    looks([w, len], 1, (b) => {
      flat(b, w, 0.003, len, 0xa48ce0, [0, 0.0015, 0]);
      flat(b, w - 0.04, 0.004, len - 0.04, 0xc4c0cc, [0, 0.002, 0]);
      for (const s of [-1, 1])
        flat(
          b,
          0.02,
          0.005,
          len * 0.3,
          0xe8e4f0,
          [s * 0.04, 0.0025, -len * 0.35],
          [0, s * 0.35, 0],
        );
    }),
  );
}

/**
 * A garden hose reel cart, facing +z: a steel frame on two wheels, the drum
 * wound with faded green hose, the crank. About 0.4 high. The hose run is
 * `hoseRun`.
 */
export const hoseReel = looks([0.4, 0.3], 1, (b) => {
  const hose = 0x5a7a52;
  for (const s of [-1, 1]) {
    bar(b, [s * 0.15, 0.04, 0], [s * 0.15, 0.36, -0.06], 0.02, ALU_DARK);
    b.cylinder(
      0.05,
      0.05,
      0.03,
      0x24262a,
      { at: [s * 0.17, 0.05, 0.04], rot: [0, 0, Math.PI / 2] },
      12,
    );
  }
  b.cylinder(
    0.11,
    0.11,
    0.24,
    tint(hose, -0.15),
    { at: [0, 0.2, 0], rot: [0, 0, Math.PI / 2] },
    16,
  );
  for (let k = 0; k < 5; k++)
    b.torus(0.115, 0.016, tint(hose, (k % 2) * 0.08), {
      at: [-0.1 + k * 0.05, 0.2, 0],
      rot: [0, Math.PI / 2, 0],
    });
  bar(b, [-0.15, 0.36, -0.06], [0.15, 0.36, -0.06], 0.02, ALU_DARK);
  bar(b, [0.16, 0.2, 0], [0.22, 0.26, 0.04], 0.014, 0x24262a);
});

/** A garden hose lying along +x from 0, `len` long, in lazy curves: faded green. */
export function hoseRun(len: number): SetPiece {
  return once(`hoseRun:${len.toFixed(2)}`, () =>
    looks([len, 0.2], 1, (b) => {
      const step = 0.14;
      let prev: V3 = [0, 0.016, 0];
      for (let x = step; x <= len + 0.001; x += step) {
        const at: V3 = [x, 0.016, Math.sin(x * 2.1) * 0.06 + Math.sin(x * 5.3) * 0.02];
        bar(b, prev, at, 0.026, 0x5a7a52);
        prev = at;
      }
    }),
  );
}

/**
 * Prod, a small tree now: a big square planter in black steel with a timber
 * cap, a slim trunk and a round, layered crown, taller than any founder. Its
 * label on the planter: "PROD". About 1.7 high.
 */
export const prodTree = looks([0.75, 0.75], 1, (b) => {
  flat(b, 0.66, 0.46, 0.66, 0xd8d4cc, [0, 0.23, 0]);
  flat(b, 0.7, 0.03, 0.7, 0xe8e4dc, [0, 0.475, 0]);
  flat(b, 0.58, 0.02, 0.58, 0x3e3428, [0, 0.48, 0]);
  flat(b, 0.66, 0.04, 0.004, 0x9a968e, [0, 0.03, 0.331]);
  letters(b, 'PROD', 0, 0.3, 0.33, 0.022, 0x4a4c50);
  b.cylinder(0.035, 0.05, 0.75, 0x6a5444, { at: [0, 0.9, 0] }, 8);
  bar(b, [0, 0.95, 0], [0.18, 1.2, 0.05], 0.03, 0x6a5444);
  bar(b, [0, 1.05, 0], [-0.16, 1.3, -0.04], 0.028, 0x6a5444);
  for (const [x, y, z, r, c] of [
    [0, 1.42, 0, 0.36, 0x737a6a],
    [0.22, 1.28, 0.08, 0.26, 0x7c8472],
    [-0.22, 1.32, -0.04, 0.27, 0x6a7064],
    [0.06, 1.66, -0.02, 0.24, 0x838a78],
    [-0.08, 1.38, 0.2, 0.22, 0x868c78],
  ] as const)
    b.sphere(r, c, { at: [x, y, z] }, [1, 0.85, 1]);
  // A few sun-scorched leaves.
  b.sphere(0.06, 0xa49a6a, { at: [0.3, 1.2, 0.2] });
});

/** A low planter trough along x, `len` long, with grasses bleached by the sun. 0.4 high. */
export function grassTrough(len: number): SetPiece {
  return once(`grassTrough:${len.toFixed(2)}`, () =>
    looks([len, 0.36], 1, (b) => {
      flat(b, len, 0.24, 0.34, 0xa8a49c, [0, 0.12, 0]);
      flat(b, len + 0.02, 0.02, 0.36, 0xc4c0b8, [0, 0.245, 0]);
      flat(b, len - 0.06, 0.02, 0.28, 0x5a4a3a, [0, 0.25, 0]);
      for (let x = -len / 2 + 0.12, k = 0; x < len / 2 - 0.08; x += 0.16, k++) {
        const c = mix(0x7a9a50, 0xc8b878, hash01(k, 1, 83) * 0.8);
        for (let j = 0; j < 4; j++) {
          const a = (j / 4) * Math.PI * 2 + k;
          bar(b, [x, 0.24, 0], [x + Math.cos(a) * 0.07, 0.4, Math.sin(a) * 0.05], 0.014, c);
        }
      }
    }),
  );
}

// ---- The tower's own curtain wall, dropping away under the front ----

/**
 * The tower's curtain wall from the floor's foot down, `len` along +x from 0,
 * `drop` deep, facing +z: a dark spandrel band at every floor and between them
 * tall blue-grey glass with the sky caught in it (paler at the top of each
 * pane), slate mullions, all greying into the heat haze the further down it
 * goes. Its top at the origin.
 */
export function towerFacade(len: number, drop: number): SetPiece {
  return once(`towerFacade:${len.toFixed(2)}:${drop.toFixed(2)}`, () =>
    looks([len, 0.1], 1, (b) => {
      const storey = 0.9;
      const band = 0.28;
      const floors = Math.ceil(drop / storey);
      const hazed = (c: number, y: number) => mix(c, HAZE, Math.min(0.75, (-y / drop) * 0.9));
      for (let k = 0; k < floors; k++) {
        const y1 = -k * storey;
        const y0 = Math.max(-drop, y1 - storey);
        flat(b, len, band, 0.05, hazed(CW_SPANDREL, y1), [len / 2, y1 - band / 2, 0.01]);
        const gTop = y1 - band;
        const gh = gTop - y0;
        if (gh <= 0.02) continue;
        shaded(b, len, gh, 0.02, [len / 2, gTop - gh / 2, -0.01], (_x, y) =>
          hazed(mix(CW_GLASS, CW_SKY, Math.max(0, (y - y0) / gh) ** 1.5), y),
        );
      }
      for (let x = 0.02; x < len; x += 0.6)
        flat(b, 0.04, drop, 0.05, CW_MULLION, [x, -drop / 2, 0.012]);
    }),
  );
}

// ---- MONOLITH ----

/**
 * MONOLITH's tower across the river: a black glass slab `w` × `d`, `h` high,
 * its front at z = 0. Fine vertical fins, cold blue windows in a tight grid,
 * a recessed crown with a plant screen and a helipad on the roof. The logo and
 * the beacon are separate pieces (`monolithLogo`, `beacon`) so they glow.
 */
export function monolithHQ(w: number, d: number, h: number): SetPiece {
  return once(`monolithHQ:${w.toFixed(2)}:${d.toFixed(2)}:${h.toFixed(2)}`, () =>
    looks([w, d], 1, (b) => {
      flat(b, w, h, d, MONO_BLACK, [0, h / 2, -d / 2]);
      // Windows on the front and the side toward the room: cold blue, a few dark.
      const row = 0.2;
      for (let y = h - 0.5, j = 0; y > 0.1; y -= row, j++) {
        for (let x = -w / 2 + 0.09, i = 0; x < w / 2 - 0.05; x += 0.14, i++) {
          const c =
            hash01(i, j, 91) > 0.82 ? 0x2a3a4e : mix(MONO_WINDOW, 0x8ab0d8, hash01(i, j, 93) * 0.4);
          flat(b, 0.09, row * 0.6, 0.008, c, [x, y, 0.004]);
        }
        for (let z = -0.09, i = 0; z > -d + 0.05; z -= 0.14, i++)
          flat(b, 0.008, row * 0.6, 0.09, mix(MONO_WINDOW, 0x2a3a4e, hash01(i, j, 97) * 0.5), [
            -w / 2 - 0.004,
            y,
            z,
          ]);
      }
      for (let x = -w / 2; x <= w / 2 + 0.01; x += 0.28)
        flat(b, 0.03, h, 0.05, MONO_FIN, [x, h / 2, 0.02]);
      // The crown: a black band with the logo panel, a steel-grey parapet round the roof, the
      // plant screen set back at the right, the roof deck.
      flat(b, w + 0.04, 0.42, d + 0.04, MONO_BLACK, [0, h - 0.21, -d / 2]);
      flat(b, w - 0.1, 0.01, d - 0.1, 0x30343c, [0, h + 0.005, -d / 2]);
      const rim = 0x5a606a;
      for (const z of [0.0, -d]) flat(b, w + 0.06, 0.1, 0.06, rim, [0, h + 0.05, z]);
      for (const sx of [-1, 1])
        flat(b, 0.06, 0.1, d + 0.06, rim, [(sx * (w + 0.03)) / 2, h + 0.05, -d / 2]);
      const px0 = w * 0.08;
      const pw = w * 0.38;
      const pz = -d * 0.62;
      const pd = d * 0.5;
      flat(b, pw, 0.22, pd, MONO_FIN, [px0 + pw / 2, h + 0.11, pz]);
      for (let x = px0 + 0.04; x < px0 + pw; x += 0.07)
        flat(b, 0.022, 0.22, 0.015, 0x4a505a, [x, h + 0.11, pz + pd / 2 + 0.01]);
      // The helipad on the roof, toward the front left: a pale circle and its H.
      const hx = -w * 0.24;
      const hz = -d * 0.42;
      b.cylinder(0.42, 0.42, 0.02, 0x3a3e46, { at: [hx, h + 0.01, hz] }, 28);
      b.torus(0.36, 0.02, 0xe8e4d8, { at: [hx, h + 0.022, hz], rot: [Math.PI / 2, 0, 0] });
      flat(b, 0.04, 0.006, 0.26, 0xe8e4d8, [hx - 0.09, h + 0.024, hz]);
      flat(b, 0.04, 0.006, 0.26, 0xe8e4d8, [hx + 0.09, h + 0.024, hz]);
      flat(b, 0.18, 0.006, 0.04, 0xe8e4d8, [hx, h + 0.024, hz]);
    }),
  );
}

/**
 * MONOLITH's logo, the hot piece: "MONOLITH" in white light on the black
 * crown, `px` a pixel, and its mark (a tall white slab) to the left. Centred
 * on x = 0 at y = 0, face toward +z.
 */
export function monolithLogo(px: number): SetPiece {
  return once(`monolithLogo:${px}`, () =>
    looks([textWidth('MONOLITH') * px + px * 6, 0.05], 1, (b) => {
      const tw = textWidth('MONOLITH') * px;
      glowLetters(b, 'MONOLITH', px * 3, 0, 0.004, px, MONO_LOGO);
      glowBox(b, px * 2, px * 7, 0.004, MONO_LOGO, [px * 3 - tw / 2 - px * 3, 0, 0.002]);
    }),
  );
}

/** An aviation beacon: a red light on a short black mast. Blinks; hot. */
export const beacon = looks([0.1, 0.1], 1, (b) => {
  b.cylinder(0.012, 0.016, 0.3, MONO_FIN, { at: [0, 0.15, 0] }, 6);
  b.led(0.05, 0xff3020, { at: [0, 0.32, 0] });
});

// ---- The city far below ----

/** Walls of the city's blocks, sun-bleached: stone, render, brick, grey. */
const CITY_WALLS = [0xbab2a4, 0xaea89c, 0xa88e80, 0xa6a6a2, 0xc0b8aa, 0x948e86] as const;
const ROOF = [0xa39d8e, 0x9a958a, 0xa8a396, 0x928d84] as const;

/**
 * A city block far below seen from high up: `w` × `d`, `h` high (centred on x,
 * its front at z = 0), rows of windows on the front and sides, a parapet, a
 * flat roof with plant (AC units, a tank, a skylight) or a roof garden. `look`
 * picks the walls and roof.
 */
export function cityRoof(w: number, d: number, h: number, look: number, glass = false): SetPiece {
  return once(`cityRoof:${w.toFixed(2)}:${d.toFixed(2)}:${h.toFixed(2)}:${look}:${glass}`, () =>
    looks([w, d], 1, (b) => {
      const wall = glass ? nth([0x6a8494, 0x7a9298, 0x5e7488], look) : nth(CITY_WALLS, look);
      flat(b, w, h, d, wall, [0, h / 2, -d / 2]);
      // Windows on the south face only (toward the camera), at half contrast: from this high up
      // the city is texture, not detail.
      const win = mix(glass ? 0xdfe4e2 : 0x4a5866, wall, 0.5);
      if (glass)
        for (let y = h - 0.2; y > 0.05; y -= 0.36)
          flat(b, w + 0.01, 0.06, 0.01, win, [0, y, 0.005]);
      for (let y = h - 0.22; !glass && y > 0.1; y -= 0.34)
        for (let x = -w / 2 + 0.16; x < w / 2 - 0.1; x += 0.3)
          flat(b, 0.15, 0.12, 0.01, win, [x, y, 0.005]);
      const roof = nth(ROOF, look * 3 + 1);
      const p = 0.04;
      for (const z of [-p / 2, -d + p / 2]) flat(b, w, 0.06, p, tint(wall, 0.15), [0, h + 0.03, z]);
      for (const s of [-1, 1])
        flat(b, p, 0.06, d, tint(wall, 0.15), [s * (w / 2 - p / 2), h + 0.03, -d / 2]);
      flat(b, w - 2 * p, 0.01, d - 2 * p, roof, [0, h + 0.005, -d / 2]);
      const kind = look % 4;
      if (kind === 3) {
        // A roof garden: lawn, a path, little trees.
        flat(b, w * 0.7, 0.012, d * 0.6, 0x7a9a5a, [0, h + 0.012, -d / 2]);
        flat(b, w * 0.7, 0.014, 0.06, 0xd8d0c0, [0, h + 0.013, -d / 2]);
        for (const [dx, dz] of [
          [-0.25, -0.2],
          [0.22, 0.15],
          [0.3, -0.25],
        ] as const)
          b.sphere(0.07, 0x5a7a44, { at: [dx * w, h + 0.07, -d / 2 + dz * d] });
        return;
      }
      const units = 1 + (look % 2);
      for (let k = 0; k < units; k++) {
        const ux = -w / 2 + ((k + 0.5) * w) / units;
        const uz = -d * (0.3 + hash01(k, look, 103) * 0.4);
        b.box(0.2, 0.1, 0.16, 0xd4d6d4, { at: [ux, h + 0.05, uz] }, 0.01);
        b.cylinder(0.05, 0.05, 0.01, 0x3a3d42, { at: [ux, h + 0.105, uz] }, 10);
      }
      if (kind === 1) {
        b.cylinder(0.1, 0.1, 0.2, 0x8a7a68, { at: [w / 2 - 0.2, h + 0.14, -d + 0.22] }, 12);
        b.cone(0.11, 0.06, 0x6a5e52, { at: [w / 2 - 0.2, h + 0.27, -d + 0.22] }, 12);
      } else flat(b, 0.24, 0.04, 0.18, 0x8fb4c8, [-w / 4, h + 0.02, -d * 0.7]);
    }),
  );
}

/**
 * The old seed-round loft far below: a brick warehouse `w` × `d`, `h` high, its
 * roof deck, and on it YOTTA's old rooftop letters still lit (the glow is the
 * `loftLetters` piece).
 */
export function oldLoft(w: number, d: number, h: number): SetPiece {
  return once(`oldLoft:${w.toFixed(2)}:${d.toFixed(2)}:${h.toFixed(2)}`, () =>
    looks([w, d], 1, (b) => {
      const brick = 0xa05a44;
      flat(b, w, h, d, brick, [0, h / 2, -d / 2]);
      for (let y = h - 0.2; y > 0.1; y -= 0.26)
        for (let x = -w / 2 + 0.14; x < w / 2 - 0.1; x += 0.2) {
          flat(b, 0.12, 0.14, 0.01, 0x3a4048, [x, y, 0.005]);
          flat(b, 0.14, 0.02, 0.012, 0xd8d0c0, [x, y - 0.08, 0.006]);
        }
      flat(b, w, 0.05, d, tint(brick, 0.2), [0, h + 0.025, -d / 2]);
      flat(b, w - 0.08, 0.01, d - 0.08, 0xa8906e, [0, h + 0.05, -d / 2]);
      // The letters' black steel frame along the roof's front.
      flat(b, w * 0.8, 0.012, 0.012, 0x24262a, [0, h + 0.1, -0.12]);
      for (let x = -w * 0.38; x <= w * 0.38; x += w * 0.19)
        flat(b, 0.012, 0.16, 0.012, 0x24262a, [x, h + 0.1, -0.12]);
    }),
  );
}

/** The loft's old rooftop letters, lit: YOTTA in warm white on its frame, a violet dot. Hot. */
export function loftLetters(px: number): SetPiece {
  return once(`loftLetters:${px}`, () =>
    looks([textWidth('YOTTA') * px, 0.05], 1, (b) => {
      glowLetters(b, 'YOTTA', 0, px * 2.5, 0, px, 0xfff2d8);
      b.led(px * 1.2, VIOLET, { at: [-(textWidth('YOTTA') * px) / 2 - px * 2.5, px * 2.5, 0] });
    }),
  );
}

/** Mom's beige station wagon far below, tiny: a long roof with rails, wood trim, along x. */
export const tinyWagon = looks([0.62, 0.26], 1, (b) => {
  const paint = 0xcbb994;
  b.box(0.6, 0.08, 0.24, paint, { at: [0, 0.07, 0] }, 0.02);
  b.box(0.42, 0.07, 0.21, tint(paint, -0.05), { at: [-0.06, 0.145, 0] }, 0.02);
  flat(b, 0.4, 0.03, 0.2, 0x34404e, [-0.06, 0.15, 0]);
  for (const s of [-1, 1]) {
    flat(b, 0.36, 0.008, 0.01, 0x7a5a3a, [-0.02, 0.07, s * 0.122]);
    flat(b, 0.36, 0.01, 0.01, 0x6a6e72, [-0.06, 0.188, s * 0.08]);
  }
});

/** A small car far below along x, muted paint by look. */
export const tinyCar = looks([0.5, 0.24], 5, (b, v) => {
  const paint = nth([0x6a7078, 0x9a4a42, 0xd4d2cc, 0x2e3440, 0x5a7a96], v);
  b.box(0.46, 0.07, 0.22, paint, { at: [0, 0.06, 0] }, 0.02);
  b.box(0.26, 0.06, 0.19, tint(paint, -0.08), { at: [-0.03, 0.12, 0] }, 0.02);
  flat(b, 0.22, 0.04, 0.2, 0x34404e, [-0.03, 0.13, 0]);
});

/** A street tree far below in high summer: a round dark-green head with a sunlit top. */
export const summerTree = looks([0.4, 0.4], 3, (b, v) => {
  b.cylinder(0.02, 0.03, 0.18, 0x5a4a3a, { at: [0, 0.09, 0] }, 6);
  b.sphere(
    0.17 + v * 0.02,
    nth([0x4a6a3a, 0x52703e, 0x5a7444], v),
    { at: [0, 0.26, 0] },
    [1, 0.8, 1],
  );
  b.sphere(0.09, nth([0x6a8a4a, 0x7a9450, 0x6e8a4c], v), { at: [0.04, 0.34, 0.03] }, [1, 0.7, 1]);
});

/**
 * A bridge over the river along z, `len` long: a pale concrete deck with
 * parapets, a footpath each side, lamp posts, and two piers down to the water
 * `h` below it. The deck's top at `h`, centred on x.
 */
export function riverBridge(len: number, w: number, h: number): SetPiece {
  return once(`riverBridge:${len.toFixed(2)}:${w.toFixed(2)}:${h.toFixed(2)}`, () =>
    looks([w, len], 1, (b) => {
      flat(b, w, 0.12, len, 0xc8c2b6, [0, h - 0.06, 0]);
      flat(b, w - 0.4, 0.01, len, 0x5a5c60, [0, h + 0.005, 0]);
      flat(b, 0.03, 0.006, len, 0xe8e4d8, [0, h + 0.012, 0]);
      for (const s of [-1, 1]) {
        flat(b, 0.06, 0.08, len, 0xd8d2c6, [(s * (w - 0.06)) / 2, h + 0.04, 0]);
        for (let z = -len / 2 + 0.4; z < len / 2; z += 1.2) {
          flat(b, 0.015, 0.22, 0.015, 0x3a3c40, [(s * (w - 0.1)) / 2, h + 0.11, z]);
          flat(b, 0.06, 0.015, 0.03, 0x3a3c40, [(s * (w - 0.18)) / 2, h + 0.22, z]);
        }
      }
      for (const z of [-len / 4, len / 4])
        flat(b, w * 0.55, h - 0.12, 0.3, 0xb8b2a6, [0, (h - 0.12) / 2, z]);
    }),
  );
}

/** A river boat far below along x: a long low hull, a cabin, a wake. */
export const riverBoat = looks([0.8, 0.22], 1, (b) => {
  b.box(0.7, 0.06, 0.2, 0x2e3a48, { at: [0, 0.03, 0] }, 0.02);
  b.box(0.36, 0.08, 0.15, 0xe8e6e0, { at: [-0.05, 0.1, 0] }, 0.02);
  flat(b, 0.34, 0.03, 0.155, 0x4a5a6a, [-0.05, 0.11, 0]);
  flat(b, 0.6, 0.004, 0.24, 0xc8dce0, [0.55, 0.002, 0]);
});

/**
 * The neighbouring tower's top far off on the left, in the haze: `w` × `d`,
 * `h` high, grey-green glass in white bands, and on its roof the window
 * cleaners' gondola parked on its track under a jib.
 */
export function neighbourTower(w: number, d: number, h: number): SetPiece {
  return once(`neighbourTower:${w.toFixed(2)}:${d.toFixed(2)}:${h.toFixed(2)}`, () =>
    looks([w, d], 1, (b) => {
      flat(b, w, h, d, 0x7a8e96, [0, h / 2, -d / 2]);
      for (let y = h - 0.2; y > 0; y -= 0.5)
        flat(b, w + 0.01, 0.08, d + 0.01, 0xb0b8b8, [0, y, -d / 2]);
      for (let x = -w / 2 + 0.3; x < w / 2; x += 0.64)
        flat(b, 0.02, h, 0.03, 0x6a7a82, [x, h / 2, 0.01]);
      flat(b, w + 0.04, 0.08, d + 0.04, 0xc8ccc8, [0, h + 0.04, -d / 2]);
      flat(b, w - 0.1, 0.01, d - 0.1, 0x8a8782, [0, h + 0.085, -d / 2]);
      // The gondola's track round the roof's edge, the machine and its yellow jib reaching out
      // over the front, the cradle hung from it just under the parapet.
      flat(b, w - 0.3, 0.04, 0.08, 0x5a5e64, [0, h + 0.1, -0.35]);
      const mx = 0;
      b.box(0.6, 0.34, 0.5, 0xe8e8e4, { at: [mx, h + 0.25, -0.55] }, 0.03);
      bar(b, [mx, h + 0.42, -0.5], [mx, h + 0.5, 0.35], 0.08, 0xe6b834);
      for (const s of [-1, 1])
        bar(b, [mx, h + 0.5, 0.35], [mx + s * 0.55, h - 0.05, 0.35], 0.015, 0x2a2c30);
      flat(b, 1.4, 0.08, 0.3, 0x6a6e72, [mx, h - 0.25, 0.35]);
      flat(b, 1.4, 0.22, 0.02, 0xe6b834, [mx, h - 0.12, 0.5]);
      flat(b, 1.4, 0.03, 0.03, ALU, [mx, h + 0.02, 0.5]);
      for (const x of [-0.69, 0, 0.69]) flat(b, 0.03, 0.28, 0.03, ALU, [mx + x, h - 0.12, 0.5]);
    }),
  );
}

/**
 * Translucent haze over the city far below, `w` × `d` along x and z, centred:
 * a pale sheet of glass that greys out what's under it, warmer at the front.
 */
export function hazeSheet(w: number, d: number): SetPiece {
  return once(`hazeSheet:${w.toFixed(2)}:${d.toFixed(2)}`, () =>
    looks([w, d], 1, (b) => {
      b.pane(w, 0.004, d, 0xf4ece0, { at: [0, 0, 0] });
    }),
  );
}

/** A glass balustrade along x, `len` long: posts, a steel top rail, a pane between. 0.55 high. */
export function glassRail(len: number): SetPiece {
  return once(`glassRail:${len.toFixed(2)}`, () =>
    looks([len, 0.06], 1, (b) => {
      b.pane(len, 0.45, 0.015, GLASS, { at: [len / 2, 0.27, 0] });
      flat(b, len, 0.03, 0.045, ALU, [len / 2, 0.52, 0]);
      flat(b, len, 0.04, 0.04, ALU_DARK, [len / 2, 0.03, 0]);
      for (let x = 0; x <= len + 0.01; x += Math.max(0.4, len / Math.round(len / 1.0)))
        flat(b, 0.03, 0.52, 0.03, ALU_DARK, [x, 0.26, 0]);
    }),
  );
}
