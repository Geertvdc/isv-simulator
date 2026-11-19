import * as THREE from 'three';
import { type ModelBuilder, tint } from '../kit';
import { hash01 } from './midRise';
import { INK, looks, nth, type SetPiece } from './shared';

/**
 * Hot Desking's world pieces (level 3-3, scene `hot-desking`; see
 * `docs/plan/hot-desking-environment.md`): three floors of 3-1's mid-rise
 * drawn as a cutaway on a spring Friday afternoon. The cut: concrete floor
 * slabs hatched where they're cut, with the ceiling void's ducts, cable tray
 * and sprinkler pipe under them and a big painted floor number; the building's
 * glass cut off at the same line; the lift shaft between the upper floors
 * (rails, ropes, the counterweight, a landing sill and number per floor) and
 * the motor room on the roof behind it. Outside: the finished glass tower
 * across the street with a cherry picker hanging a TO LET banner on it, the
 * street at ground level with a coffee cart, a cycle rack, bollards, the
 * courier's bike, people leaving for the weekend
 * with their laptop bags, and Prod on the only desk nobody can book.
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

/** A bar from `a` to `c`, `t` thick: a rope, a rail, a boom. */
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

/** Cut concrete: the dark fill of a cut slab and the pale hatching across it. */
export const CUT = 0x6c7076;
const HATCH = 0xc4c8cc;
/** Uncut concrete (slab soffits, the shaft, the motor room). */
const CONCRETE = 0x8c8a84;
const ROPE = 0xb4bac0;
const HAZARD = 0xd2a832;
/** The services in the ceiling void: galvanised duct, the yellow cable tray, the red sprinkler main. */
const DUCT = 0xa8b0b6;
const TRAY = 0xb89a3a;
const SPRINKLER = 0xb0453a;
/** Painted stencils (floor numbers): a warm white. */
const PAINT = 0xe8e4d8;
const ALU = 0xb8bec4;
const ALU_DARK = 0x6e757c;
const GLASS = 0x9cc4dc;
const SHEEN = 0xe4f0f6;
/** The finished tower across the street: blue-green glass, pale slab edges. */
const TOWER_GLASS = 0x5a8aac;
const TOWER_EDGE = 0xd8dcd8;
const BANNER_RED = 0xc23a30;
const PICKER = 0xe0a030;

// ---- Lettering ----

/** A blocky alphabet, 3 wide and 5 high, with the letters these signs need. */
const FONT: Readonly<Record<string, string>> = {
  A: '010101111101101',
  C: '011100100100011',
  D: '110101101101110',
  E: '111100110100111',
  F: '111100110100100',
  I: '111010010010111',
  L: '100100100100111',
  M: '101111111101101',
  N: '110101101101101',
  O: '111101101101111',
  P: '110101110100100',
  R: '110101110101101',
  S: '011100010001110',
  T: '111010010010010',
  V: '101101101101010',
  Y: '101101010010010',
  '0': '111101101101111',
  '1': '010110010010111',
  '2': '110001010100111',
  '3': '110001010001110',
  ':': '000010000010000',
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

/** Calls `cell(u, v, w)` for each run of lit pixels of `text`, centred on 0; v is the row (0 top). */
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

/** Letters standing on a face at depth z facing +z, centred on (x, y), each pixel `px` square. */
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
    flat(b, w * px, px, 0.006, color, [x + u * px, y + (2 - r) * px, z]);
  });
}

/** Letters painted flat on a floor at height y, centred on (x, z), reading toward +z. */
function paint(
  b: ModelBuilder,
  text: string,
  x: number,
  y: number,
  z: number,
  px: number,
  color: number,
): void {
  glyphs(text, (u, r, w) => {
    flat(b, w * px, 0.003, px, color, [x + u * px, y, z + (r - 2) * px]);
  });
}

// ---- The cut: slabs, the ceiling void, the cut glass ----

/** How high the building's floors stand off the ground (the level's floor). */
export const FLOOR = 0.463;

/**
 * Hatching across a flat cut surface `w` × `d` centred on (x, y, z) (on a
 * floor when `up`, else on a face toward +z): pale lines at 45°, `gap` apart.
 */
function hatch(
  b: ModelBuilder,
  w: number,
  d: number,
  x: number,
  y: number,
  z: number,
  up: boolean,
  gap = 0.16,
): void {
  // Each line runs from the near edge up and to the right, clipped to the rectangle.
  for (let s = -d; s < w; s += gap) {
    const u0 = Math.max(0, s);
    const u1 = Math.min(w, s + d);
    if (u1 - u0 < 0.02) continue;
    const len = (u1 - u0) * Math.SQRT2;
    const cu = (u0 + u1) / 2 - w / 2;
    const cv = (u0 + u1) / 2 - s - d / 2;
    if (up) flat(b, len, 0.003, 0.022, HATCH, [x + cu, y, z - cv], [0, Math.PI / 4, 0]);
    else flat(b, len, 0.022, 0.004, HATCH, [x + cu, y + cv, z], [0, 0, Math.PI / 4]);
  }
}

/**
 * The floor slab between the hot-desk floor and the floors over it, where the
 * cutaway cuts it: `len` along +x from 0, `d` deep from its front at z = 0
 * back to −d. At the back the cut slab itself, flush with the floors: dark
 * concrete hatched at 45°, a pale arris along both edges. In front, lower,
 * the ceiling void under it: a galvanised duct with its joints, the yellow
 * cable tray with cables in it, the red sprinkler main with heads, hanger
 * rods, the suspended ceiling's white edge at the front.
 */
export function cutSlab(len: number, d: number): SetPiece {
  return once(`cutSlab:${len.toFixed(2)}:${d.toFixed(2)}`, () =>
    looks([len, d], 1, (b) => {
      const sd = d * 0.55;
      const top = FLOOR - 0.01;
      const zs = -d + sd / 2;
      flat(b, len, top, sd, CUT, [len / 2, top / 2, zs]);
      hatch(b, len, sd - 0.06, len / 2, top + 0.002, zs, true);
      for (const z of [-d + 0.02, -d + sd - 0.02])
        flat(b, len, 0.012, 0.03, tint(CUT, 0.5), [len / 2, top + 0.001, z]);
      // The ceiling void: a dark soffit low down, the services over it.
      const vd = d - sd;
      const vz = -vd / 2;
      flat(b, len, 0.16, vd, 0x5e6268, [len / 2, 0.08, vz]);
      // Dim fittings in the void, so it reads as built, not as a hole.
      for (let x = 0.45; x < len - 0.2; x += 1.5)
        b.led(0.025, 0xfff0d0, { at: [x, 0.17, vz + 0.2] });
      flat(b, len, 0.03, 0.05, 0xd8d6d0, [len / 2, 0.18, -0.03]);
      const duct = 0.11;
      b.cylinder(
        duct,
        duct,
        len - 0.1,
        DUCT,
        { at: [len / 2, 0.3, vz - 0.08], rot: [0, 0, Math.PI / 2] },
        12,
      );
      for (let x = 0.6; x < len - 0.2; x += 1.2)
        b.cylinder(
          duct + 0.012,
          duct + 0.012,
          0.04,
          tint(DUCT, -0.18),
          { at: [x, 0.3, vz - 0.08], rot: [0, 0, Math.PI / 2] },
          12,
        );
      // The cable tray: a shallow yellow channel, bundles of cable in it.
      flat(b, len - 0.1, 0.03, 0.14, TRAY, [len / 2, 0.24, vz + 0.12]);
      for (const [dz, c] of [
        [-0.04, 0x3a5a8a],
        [0, 0x2e3034],
        [0.04, 0x6a8a4a],
      ] as const)
        b.cylinder(
          0.014,
          0.014,
          len - 0.14,
          c,
          { at: [len / 2, 0.265, vz + 0.12 + dz], rot: [0, 0, Math.PI / 2] },
          5,
        );
      // The sprinkler main, red, its heads poking down every metre and a half.
      b.cylinder(
        0.025,
        0.025,
        len - 0.1,
        SPRINKLER,
        { at: [len / 2, 0.36, vz + 0.02], rot: [0, 0, Math.PI / 2] },
        8,
      );
      for (let x = 0.75; x < len - 0.2; x += 1.5)
        b.cylinder(0.012, 0.02, 0.06, 0xd4c08a, { at: [x, 0.32, vz + 0.02] }, 6);
      // Hangers up to the slab.
      for (let x = 0.3; x < len; x += 0.9)
        flat(b, 0.012, 0.3, 0.012, 0x5a5e64, [x, 0.33, vz + 0.2]);
    }),
  );
}

/**
 * A big floor number painted on the cut slab, the way contractors mark the
 * levels: `text` in warm white stencil lying flat, `px` a pixel, on a dark
 * patch so it reads over the hatching. Origin at its middle, on the slab's top.
 */
export function floorNumber(text: string, px: number): SetPiece {
  return once(`floorNumber:${text}:${px}`, () =>
    looks([textWidth(text) * px, 5 * px], 1, (b) => {
      flat(b, (textWidth(text) + 2) * px, 0.004, 6 * px, CUT, [0, 0.002, 0]);
      paint(b, text, 0, 0.005, 0, px, PAINT);
    }),
  );
}

/**
 * The cut face of a slab, facing +z, `len` along +x from 0 and `h` high from
 * the ground: dark cut concrete hatched at 45°, a pale arris along its top,
 * and `label` (a floor number) stencilled big at `at` along it.
 */
export function cutFace(len: number, h: number, label: string, at: number): SetPiece {
  return once(`cutFace:${len.toFixed(2)}:${h.toFixed(2)}:${label}:${at.toFixed(2)}`, () =>
    looks([len, 0.06], 1, (b) => {
      flat(b, len, h, 0.04, CUT, [len / 2, h / 2, 0]);
      hatch(b, len, h - 0.04, len / 2, h / 2, 0.022, false, 0.14);
      flat(b, len, 0.02, 0.05, tint(CUT, 0.5), [len / 2, h - 0.01, 0.005]);
      if (label) {
        const px = (h - 0.12) / 5;
        flat(b, (textWidth(label) + 2) * px, h - 0.06, 0.006, CUT, [at, h / 2, 0.025]);
        letters(b, label, at, h / 2, 0.03, px, PAINT);
      }
    }),
  );
}

/**
 * The building's glass, cut off by the cutaway: `len` along +x from 0, its
 * glass at z = 0, `h` high from the floor (`FLOOR` up off the ground, the
 * facade under it down to there): an aluminium sill, panes between slim
 * mullions with a reflection across every other, and the cut along its top,
 * a dark hatched transom.
 */
export function cutGlass(len: number, h: number): SetPiece {
  return once(`cutGlass:${len.toFixed(2)}:${h.toFixed(2)}`, () =>
    looks([len, 0.12], 1, (b) => {
      const n = Math.max(1, Math.round(len / 0.8));
      const bay = len / n;
      flat(b, len, FLOOR, 0.16, 0x7a7e84, [len / 2, FLOOR / 2, -0.02]);
      flat(b, len, 0.06, 0.14, ALU_DARK, [len / 2, FLOOR + 0.03, 0.02]);
      const y0 = FLOOR + 0.06;
      const y1 = FLOOR + h - 0.08;
      for (let i = 0; i < n; i++) {
        const cx = (i + 0.5) * bay;
        b.pane(bay - 0.04, y1 - y0, 0.02, GLASS, { at: [cx, (y0 + y1) / 2, 0] });
        if (i % 2 === 0)
          b.pane(0.08, (y1 - y0) * 0.6, 0.022, SHEEN, {
            at: [cx - bay * 0.12, (y0 + y1) / 2 + 0.05, 0.004],
            rot: [0, 0, -0.45],
          });
      }
      for (let i = 0; i <= n; i++)
        flat(b, 0.045, y1 - y0, 0.08, i === 0 || i === n ? ALU_DARK : ALU, [
          i * bay,
          (y0 + y1) / 2,
          0.015,
        ]);
      // The cut: the head of the glass wall, hatched dark.
      flat(b, len + 0.02, 0.08, 0.2, CUT, [len / 2, y1 + 0.04, 0]);
      hatch(b, len, 0.16, len / 2, y1 + 0.082, 0, true, 0.12);
    }),
  );
}

// ---- The lift shaft ----

/** The shaft's walls in shadow: lighter at the back (the top), darker toward the front (deeper down). */
const SHAFT_BACK = 0x3c4046;
const SHAFT_FRONT = 0x2a2d31;
/** The car roof: galvanised steel with a yellow-black hazard edge. */
const CAR_STEEL = 0x8a9096;
const HAZARD_Y = 0xd8b02a;
const HAZARD_K = 0x2a2a2a;

/** Mixes two colors, `t` of the way from `a` to `b`. */
function mix(a: number, b: number, t: number): number {
  const ch = (c: number, s: number) => (c >> s) & 0xff;
  const m = (s: number) => Math.round(ch(a, s) + (ch(b, s) - ch(a, s)) * t) << s;
  return m(16) | m(8) | m(0);
}

/**
 * The lift shaft between the upper floors, seen from above as the cutaway
 * cuts it: `w` wide (centred on x = 0) and `len` long back from its front at
 * z = 0. Its concrete back wall as the floor, dark and darker toward the
 * front, so it reads as a drop; the two guide rails held by brackets every
 * 0.6; the roof of the car (which is somewhere between floors) right across
 * it at `roofAt` back from the front: galvanised steel with a hazard edge, the
 * escape hatch, the crosshead and the sheave the hoist ropes come down to from
 * the motor room at the back. At each landing in `sills` (back from the
 * front) a steel sill across it with a yellow toe guard.
 */
export function liftShaft(
  w: number,
  len: number,
  roofAt: number,
  sills: readonly number[],
): SetPiece {
  return once(
    `liftShaft:${w}:${len.toFixed(2)}:${roofAt.toFixed(2)}:${sills.map((s) => s.toFixed(2)).join(',')}`,
    () =>
      looks([w, len], 1, (b) => {
        // The wall in bands, darkening toward the front, a formwork joint between each.
        const bands = Math.max(4, Math.round(len / 0.6));
        const bl = len / bands;
        for (let k = 0; k < bands; k++) {
          const c = mix(SHAFT_BACK, SHAFT_FRONT, (k + 0.5) / bands);
          flat(b, w, 0.06, bl - 0.012, c, [0, 0.03, -len + (k + 0.5) * bl]);
        }
        // The guide rails: thin steel, and a bracket every 0.6 that reads as bolted on.
        const r = w * 0.4;
        for (const s of [-1, 1]) {
          flat(b, 0.035, 0.05, len, 0x6a7076, [s * r, 0.1, -len / 2]);
          for (let z = -0.3; z > -len; z -= 0.6) {
            flat(b, 0.14, 0.05, 0.07, 0x9aa0a6, [s * (r + 0.02), 0.1, z]);
            b.cylinder(0.014, 0.014, 0.01, 0xc8ccd0, { at: [s * (r + 0.06), 0.13, z] }, 6);
          }
        }
        // The car roof, right across the shaft.
        const rd = Math.min(1.3, len * 0.3);
        const rz = -roofAt;
        const rw = w - 0.12;
        const top = 0.34;
        flat(b, rw, top, rd, CAR_STEEL, [0, top / 2, rz]);
        for (let x = -rw / 2 + 0.25; x < rw / 2 - 0.1; x += 0.35)
          flat(b, 0.012, 0.004, rd - 0.1, tint(CAR_STEEL, -0.15), [x, top + 0.002, rz]);
        // The hazard edge round it: yellow and black blocks.
        const blocks = (along: 'x' | 'z', n: number, l: number, at: (u: number) => V3) => {
          for (let k = 0; k < n; k++) {
            const c = k % 2 ? HAZARD_K : HAZARD_Y;
            const u = -l / 2 + (k + 0.5) * (l / n);
            if (along === 'x') flat(b, l / n, 0.03, 0.07, c, at(u));
            else flat(b, 0.07, 0.03, l / n, c, at(u));
          }
        };
        const nx = Math.max(4, Math.round(rw / 0.14));
        const nz = Math.max(4, Math.round(rd / 0.14));
        blocks('x', nx, rw, (u) => [u, top + 0.015, rz + rd / 2 - 0.035]);
        blocks('x', nx, rw, (u) => [u, top + 0.015, rz - rd / 2 + 0.035]);
        blocks('z', nz, rd, (u) => [-rw / 2 + 0.035, top + 0.015, rz + u]);
        blocks('z', nz, rd, (u) => [rw / 2 - 0.035, top + 0.015, rz + u]);
        // The escape hatch, with its hinge and handle.
        const hx = -rw * 0.25;
        flat(b, 0.34, 0.03, 0.34, tint(CAR_STEEL, -0.1), [hx, top + 0.015, rz + rd * 0.15]);
        flat(b, 0.3, 0.008, 0.3, tint(CAR_STEEL, 0.12), [hx, top + 0.034, rz + rd * 0.15]);
        flat(b, 0.32, 0.02, 0.03, 0x4a4e54, [hx, top + 0.04, rz + rd * 0.15 - 0.16]);
        flat(b, 0.08, 0.02, 0.02, HAZARD_K, [hx, top + 0.045, rz + rd * 0.15 + 0.12]);
        // The crosshead beam and the sheave on it.
        flat(b, rw, 0.08, 0.1, 0x5a5e64, [0, top + 0.04, rz - rd * 0.2]);
        const sx = rw * 0.18;
        b.cylinder(
          0.15,
          0.15,
          0.06,
          0x3a3e44,
          {
            at: [sx, top + 0.2, rz - rd * 0.2],
            rot: [0, 0, Math.PI / 2],
          },
          18,
        );
        b.cylinder(
          0.05,
          0.05,
          0.08,
          0xc8ccd0,
          {
            at: [sx, top + 0.2, rz - rd * 0.2],
            rot: [0, 0, Math.PI / 2],
          },
          10,
        );
        for (const s of [-1, 1])
          flat(b, 0.03, 0.2, 0.06, 0x5a5e64, [sx + s * 0.06, top + 0.1, rz - rd * 0.2]);
        // The hoist ropes, from the motor room at the back down to the sheave.
        for (const dz of [-0.04, 0, 0.04])
          bar(
            b,
            [sx + dz, 0.42, -len + 0.02],
            [sx + dz, top + 0.34, rz - rd * 0.2 - 0.1],
            0.016,
            ROPE,
          );
        // A sill at each landing: steel across, a yellow-black toe guard.
        for (const z of sills) {
          flat(b, w - 0.04, 0.08, 0.1, 0x8a9096, [0, 0.1, -z]);
          for (let x = -w / 2 + 0.1; x < w / 2 - 0.05; x += 0.2)
            flat(b, 0.1, 0.004, 0.06, HAZARD_Y, [x, 0.142, -z + 0.06], [0, 0.6, 0]);
        }
      }),
  );
}

/**
 * The lift motor room on the roof over the shaft: a concrete box `w` wide and
 * `d` deep (back from z = 0, centred on x), its roof cut away to show the
 * machine: the motor, the sheave with the ropes going down into the shaft,
 * the controller cabinet with a lit status lamp, a yellow hazard edge and
 * LIFT stencilled on its front. Under it, the concrete core `base` down to
 * the street. Origin at the roof's level, the front middle.
 */
export function motorRoom(w: number, d: number, base: number): SetPiece {
  return once(`motorRoom:${w}:${d}:${base}`, () =>
    looks([w, d], 1, (b) => {
      const h = 0.6;
      const t = 0.12;
      // The core under it, down to the street.
      flat(b, w, base, d, tint(CONCRETE, -0.08), [0, -base / 2, -d / 2]);
      for (let y = -0.3; y > -base; y -= 0.3)
        flat(b, w + 0.004, 0.01, d + 0.004, tint(CONCRETE, -0.2), [0, y, -d / 2]);
      flat(b, w, 0.05, d, tint(CONCRETE, -0.2), [0, 0.025, -d / 2]);
      for (const s of [-1, 1]) {
        flat(b, t, h, d, CONCRETE, [s * (w / 2 - t / 2), h / 2, -d / 2]);
        hatch(b, t, d, s * (w / 2 - t / 2), h + 0.002, -d / 2, true, 0.12);
        flat(b, t, 0.004, d, CUT, [s * (w / 2 - t / 2), h + 0.001, -d / 2]);
      }
      flat(b, w, h, t, CONCRETE, [0, h / 2, -d + t / 2]);
      flat(b, w, h * 0.45, t, CONCRETE, [0, (h * 0.45) / 2, -t / 2]);
      flat(b, w, 0.004, t, CUT, [0, h * 0.45 + 0.001, -t / 2]);
      letters(b, 'LIFT', -w * 0.22, h * 0.24, 0.002, 0.035, 0xe8d8a0);
      for (let x = -w / 2 + 0.06; x < w / 2 - 0.04; x += 0.16)
        flat(b, 0.08, 0.05, 0.004, HAZARD, [x, h * 0.45 - 0.03, 0.002]);
      // The machine on its plinth: the motor (green-grey), the brake, the sheave.
      const mz = -d / 2;
      flat(b, w * 0.6, 0.1, d * 0.45, 0x5a5e64, [0, 0.1, mz]);
      b.box(0.42, 0.26, 0.3, 0x5e6e6a, { at: [-0.22, 0.28, mz] }, 0.04);
      b.cylinder(0.16, 0.16, 0.1, 0x3a3e44, { at: [0.12, 0.3, mz], rot: [0, 0, Math.PI / 2] }, 18);
      b.cylinder(0.06, 0.06, 0.12, 0xb8bec4, { at: [0.12, 0.3, mz], rot: [0, 0, Math.PI / 2] }, 10);
      for (const dz of [-0.06, -0.02, 0.02, 0.06])
        bar(b, [0.12, 0.3, mz + dz], [0.02, 0.15, 0.05], 0.014, ROPE);
      // The controller cabinet against the back wall, its lamp lit.
      b.box(0.3, 0.42, 0.16, 0x7a8288, { at: [w / 2 - 0.35, 0.26, -d + 0.2] }, 0.02);
      b.led(0.025, 0x7ae08a, { at: [w / 2 - 0.4, 0.4, -d + 0.29] });
    }),
  );
}

// ---- Across the street: the finished tower ----

/**
 * The glass tower across the street, finished: `floors` storeys `storey`
 * high, `w` × `d`, its front at z = 0 facing +z, centred on x. Blue-green
 * glass in dark mullions on every floor, a pale slab edge at each, a deeper
 * band at the lobby, a crown of fins at the top, a reflection slanting across
 * the front, the glass down the side. No crane: it's done, and empty.
 */
export function finishedTower(w: number, d: number, floors: number, storey: number): SetPiece {
  return once(`finishedTower:${w}:${d}:${floors}:${storey}`, () =>
    looks([w, d], 1, (b) => {
      const h = floors * storey;
      const edge = 0.05;
      flat(b, w, h, d, TOWER_GLASS, [0, h / 2, -d / 2]);
      for (let k = 0; k <= floors; k++)
        flat(b, w + 0.03, edge, d + 0.03, k === 0 ? 0x5a5e62 : TOWER_EDGE, [
          0,
          k * storey + edge / 2,
          -d / 2,
        ]);
      // The lobby: taller, darker glass at the foot.
      flat(b, w + 0.01, storey - edge, 0.01, 0x2e3a46, [0, edge + (storey - edge) / 2, 0.006]);
      for (let x = -w / 2 + 0.25; x < w / 2 - 0.05; x += 0.25)
        flat(b, 0.022, h - storey, 0.014, 0x2e3a48, [x, storey + (h - storey) / 2, 0.004]);
      for (let z = -0.25; z > -d + 0.05; z -= 0.25)
        flat(b, 0.014, h - storey, 0.022, 0x2e3a48, [w / 2 + 0.004, storey + (h - storey) / 2, z]);
      // The empty floors inside: a pale ceiling glow at each, nobody in.
      for (let k = 1; k < floors; k++)
        if (hash01(k, floors, 5) > 0.55)
          flat(b, w * (0.3 + hash01(k, 2, 7) * 0.4), 0.025, 0.008, 0xb8d0e0, [
            (hash01(k, 3, 9) - 0.5) * w * 0.4,
            k * storey + storey - 0.04,
            0.009,
          ]);
      // The reflection, slanting across the glass.
      flat(
        b,
        0.7,
        h * 0.9,
        0.006,
        tint(TOWER_GLASS, 0.14),
        [-w * 0.2, h * 0.5, 0.012],
        [0, 0, -0.3],
      );
      flat(
        b,
        0.25,
        h * 0.85,
        0.006,
        tint(TOWER_GLASS, 0.1),
        [-w * 0.2 + 0.6, h * 0.5, 0.012],
        [0, 0, -0.3],
      );
      // The crown: fins over the roof, plant behind them.
      for (let x = -w / 2; x <= w / 2 + 0.01; x += w / 10)
        flat(b, 0.04, 0.3, 0.06, TOWER_EDGE, [x, h + 0.15, 0]);
      flat(b, w, 0.04, 0.06, TOWER_EDGE, [0, h + 0.3, 0]);
      b.box(w * 0.4, 0.22, d * 0.5, 0x8a9096, { at: [-w * 0.15, h + 0.11, -d / 2] }, 0.02);
    }),
  );
}

/**
 * The estate agent's banner: TO LET in red on white, `w` × `h`, facing +z,
 * hung from its top edge (its origin at the top middle); a phone number in
 * dashes under it, grommets along the top. Alive (`sway`), it flaps a little.
 */
export function toLetBanner(w: number, h: number): SetPiece {
  return once(`toLet:${w}:${h}`, () =>
    looks([w, 0.05], 1, (b) => {
      flat(b, w, h, 0.012, 0xf2f0ea, [0, -h / 2, 0]);
      flat(b, w, h * 0.12, 0.014, BANNER_RED, [0, -h + h * 0.06, 0.001]);
      const px = Math.min((h * 0.55) / 5, (w * 0.9) / textWidth('TO LET'));
      letters(b, 'TO LET', 0, -h * 0.4, 0.01, px, BANNER_RED);
      for (let k = 0; k < 9; k++)
        flat(b, w * 0.05, h * 0.035, 0.012, 0x3a3e44, [-w * 0.3 + k * w * 0.075, -h * 0.76, 0.008]);
      for (let x = -w / 2 + 0.05; x < w / 2; x += w / 6)
        b.cylinder(
          0.018,
          0.018,
          0.02,
          0x9aa0a6,
          { at: [x, -0.03, 0.01], rot: [Math.PI / 2, 0, 0] },
          6,
        );
    }),
  );
}

/**
 * The estate agent's cherry picker: a little orange truck along x on the
 * street, outriggers down, its boom up from the turntable at the back to a
 * basket at (`bx`, `by`, `bz`) from the piece's origin, a worker in a hi-vis
 * vest in it, reaching up to the banner.
 */
export function cherryPicker(bx: number, by: number, bz: number): SetPiece {
  return once(`picker:${bx.toFixed(2)}:${by.toFixed(2)}:${bz.toFixed(2)}`, () =>
    looks([1.4, 0.6], 1, (b) => {
      // The truck: cab at +x, a flat bed, wheels.
      b.box(0.36, 0.3, 0.5, 0xe8e6e0, { at: [0.5, 0.25, 0] }, 0.04);
      flat(b, 0.2, 0.12, 0.46, 0x2e3a48, [0.6, 0.32, 0]);
      flat(b, 1.0, 0.1, 0.5, 0x5a5e64, [-0.15, 0.15, 0]);
      for (const x of [-0.45, 0.45])
        for (const z of [-0.24, 0.24])
          b.cylinder(0.09, 0.09, 0.06, INK, { at: [x, 0.09, z], rot: [Math.PI / 2, 0, 0] }, 10);
      for (const s of [-1, 1])
        for (const x of [-0.55, 0.25])
          bar(b, [x, 0.18, s * 0.25], [x, 0.02, s * 0.45], 0.04, PICKER);
      // The turntable and the boom, in two sections with a knuckle.
      const t: V3 = [-0.35, 0.28, 0];
      b.cylinder(0.16, 0.18, 0.1, PICKER, { at: t }, 14);
      const knee: V3 = [
        t[0] + (bx - t[0]) * 0.35,
        t[1] + (by - t[1]) * 0.62,
        t[2] + (bz - t[2]) * 0.4,
      ];
      bar(b, [t[0], t[1] + 0.06, t[2]], knee, 0.08, PICKER);
      bar(b, knee, [bx, by - 0.08, bz], 0.06, tint(PICKER, 0.15));
      b.box(0.1, 0.1, 0.1, 0x3a3e44, { at: knee }, 0.01);
      // The basket: rails round a little deck, the worker in it.
      flat(b, 0.4, 0.04, 0.3, 0x5a5e64, [bx, by - 0.08, bz]);
      for (const [x, z] of [
        [-0.2, -0.15],
        [0.2, -0.15],
        [-0.2, 0.15],
        [0.2, 0.15],
      ] as const)
        flat(b, 0.02, 0.22, 0.02, PICKER, [bx + x, by + 0.04, bz + z]);
      flat(b, 0.42, 0.025, 0.32, PICKER, [bx, by + 0.15, bz]);
      b.capsule(0.06, 0.12, 0xd8e040, { at: [bx - 0.05, by + 0.1, bz] });
      b.sphere(0.055, 0xc89a78, { at: [bx - 0.05, by + 0.27, bz] });
      b.sphere(0.06, 0xf0f0e8, { at: [bx - 0.05, by + 0.31, bz] }, [1, 0.6, 1]);
      bar(b, [bx - 0.02, by + 0.18, bz], [bx + 0.08, by + 0.36, bz - 0.06], 0.03, 0xd8e040);
    }),
  );
}

// ---- The street ----

/**
 * The coffee cart on the pavement: a little cart along x with spoked wheels,
 * a striped awning over it on two poles, an espresso machine and a stack of
 * paper cups on the counter, a chalkboard at its end. No food on show.
 */
export const coffeeCart = looks([1.2, 0.7], 1, (b) => {
  const body = 0x3e5a52;
  b.box(1.0, 0.5, 0.5, body, { at: [0, 0.35, 0] }, 0.03);
  flat(b, 1.06, 0.04, 0.56, 0xb89a6a, [0, 0.62, 0]);
  flat(b, 0.9, 0.04, 0.004, 0xd8c8a0, [0, 0.45, 0.252]);
  for (const x of [-0.36, 0.36]) b.torus(0.12, 0.018, INK, { at: [x, 0.12, 0.27] });
  b.box(0.28, 0.24, 0.22, 0xb8bec4, { at: [-0.2, 0.76, -0.08] }, 0.03);
  b.led(0.02, 0x7ae08a, { at: [-0.1, 0.84, 0.04] });
  b.cylinder(0.035, 0.03, 0.18, 0xece8de, { at: [0.25, 0.73, 0.05] }, 8);
  b.cylinder(0.035, 0.03, 0.14, 0xece8de, { at: [0.33, 0.71, -0.05] }, 8);
  // The awning: green and cream stripes, sloping down to the front.
  for (const x of [-0.5, 0.5]) flat(b, 0.03, 1.0, 0.03, 0x3a3e44, [x, 1.0, -0.22]);
  for (let k = 0; k < 7; k++)
    flat(
      b,
      1.2 / 7,
      0.025,
      0.7,
      k % 2 ? 0xe8e0c8 : 0x4a7a62,
      [-0.6 + (k + 0.5) * (1.2 / 7), 1.42, 0.02],
      [0.22, 0, 0],
    );
  for (let k = 0; k < 7; k++)
    flat(b, 1.2 / 7, 0.08, 0.01, k % 2 ? 0xe8e0c8 : 0x4a7a62, [
      -0.6 + (k + 0.5) * (1.2 / 7),
      1.3,
      0.37,
    ]);
});

/** A laptop bag hanging at someone's side by its strap: black, a lighter flap and buckle. */
export const laptopBag = looks([0.3, 0.1], 2, (b, v) => {
  const c = nth([0x2e3238, 0x4a4038], v);
  b.box(0.3, 0.22, 0.07, c, { at: [0, 0, 0] }, 0.02);
  flat(b, 0.3, 0.1, 0.075, tint(c, 0.15), [0, 0.06, 0.002]);
  flat(b, 0.04, 0.02, 0.004, 0xb8bec4, [0, 0.02, 0.04]);
  bar(b, [-0.13, 0.1, 0], [-0.02, 0.42, 0], 0.016, INK);
});

/**
 * Someone far below in the street, leaving for the weekend: a little figure
 * seen from above, a muted coat, a laptop bag on the shoulder, mid-stride.
 * Tiny: the street is storeys down. Faces +z.
 */
export const commuter = looks([0.3, 0.3], 4, (b, v) => {
  const coat = nth([0x6a6e78, 0x7a6a5a, 0x4e5a6a, 0x8a7e70], v);
  const hair = nth([0x3a2e26, 0x6a5038, 0x2a2a2e, 0x9a8a70], v);
  for (const s of [-1, 1]) bar(b, [s * 0.04, 0, s * 0.06], [s * 0.035, 0.22, 0], 0.05, 0x3a3e46);
  b.capsule(0.08, 0.16, coat, { at: [0, 0.34, 0] });
  b.sphere(0.07, 0xc8a080, { at: [0, 0.55, 0] });
  b.sphere(0.072, hair, { at: [0, 0.58, -0.02] }, [1, 0.7, 1]);
  b.box(0.06, 0.16, 0.2, 0x2e3238, { at: [0.11, 0.3, 0] }, 0.02);
  bar(b, [0.1, 0.38, 0], [-0.05, 0.46, 0], 0.014, INK);
});

/** Prod's pot (as in 3-2) and his leaves. */
const PROD_POT = 0x5a6e80;
const PROD_LEAF = 0x4f8a4a;
/** The reserved card: white, a red band. */
const CARD = 0xf3f1ea;
const CARD_RED = 0xc23a3a;

/**
 * The only desk nobody can book: a small desk, Prod in his own pot sitting at
 * it, and standing up in front of him, tilted back toward the camera, a card:
 * RESERVED in white on a red band, PROD big under it. About 0.9 × 0.5,
 * Prod's leaves 1.1 high. Faces +z.
 */
export const reservedDesk = looks([0.9, 0.5], 1, (b) => {
  const top = 0.42;
  flat(b, 0.86, 0.035, 0.48, 0xc8b48e, [0, top, 0]);
  for (const x of [-0.4, 0.4])
    for (const z of [-0.2, 0.2]) flat(b, 0.03, top, 0.03, 0x4a4e54, [x, top / 2, z]);
  flat(b, 0.8, 0.12, 0.02, 0x4a4e54, [0, top - 0.1, -0.22]);
  // Prod in his pot, at the back left of the desk.
  const px = -0.2;
  const pz = -0.08;
  const pot = 0.35;
  b.cylinder(0.14, 0.1, pot, PROD_POT, { at: [px, top + pot / 2, pz] }, 16);
  b.cylinder(0.15, 0.15, 0.03, 0xd8d4c8, { at: [px, top + pot, pz] }, 16);
  b.cylinder(0.13, 0.13, 0.01, 0x3e3428, { at: [px, top + pot + 0.016, pz] }, 14);
  for (const [x, z, r] of [
    [0.02, 0, 0.1],
    [-0.04, 0.03, -0.18],
    [0.03, -0.03, 0.06],
  ] as const)
    b.cylinder(
      0.012,
      0.016,
      0.3,
      0x8a8478,
      {
        at: [px + x, top + pot + 0.15, pz + z],
        rot: [r, 0, r * 1.5],
      },
      6,
    );
  for (const [x, y, z, r, c] of [
    [0, 0.36, 0, 0.17, PROD_LEAF],
    [0.12, 0.28, 0.06, 0.12, tint(PROD_LEAF, 0.12)],
    [-0.11, 0.3, -0.03, 0.12, tint(PROD_LEAF, -0.1)],
    [0.03, 0.47, -0.03, 0.11, tint(PROD_LEAF, 0.12)],
  ] as const)
    b.sphere(r, c, { at: [px + x, top + pot + y, pz + z] }, [1, 0.85, 1]);
  // The card, on a little foot, tilted back to face the camera.
  const cw = 0.44;
  const ch = 0.27;
  const tilt = 0.75;
  const cx = 0.17;
  const cz = 0.12;
  const at = (u: number, v: number, off: number): V3 => [
    cx + u,
    top + 0.02 + v * Math.cos(tilt) + off * Math.sin(tilt),
    cz - v * Math.sin(tilt) + off * Math.cos(tilt),
  ];
  const rot: V3 = [-tilt, 0, 0];
  flat(b, 0.2, 0.02, 0.12, 0x4a4e54, [cx, top + 0.02, cz - 0.04]);
  flat(b, cw, ch, 0.008, CARD, at(0, ch / 2, 0), rot);
  const band = 0.095;
  flat(b, cw, band, 0.004, CARD_RED, at(0, ch - band / 2, 0.006), rot);
  const sp = (cw - 0.04) / textWidth('RESERVED');
  glyphs('RESERVED', (u, r, w) => {
    flat(b, w * sp, sp, 0.003, CARD, at(u * sp, ch - band / 2 + (2 - r) * sp, 0.009), rot);
  });
  const pp = Math.min((cw - 0.08) / textWidth('PROD'), (ch - band - 0.04) / 5);
  glyphs('PROD', (u, r, w) => {
    flat(b, w * pp, pp, 0.003, 0x2a2d31, at(u * pp, (ch - band) / 2 + (2 - r) * pp, 0.006), rot);
  });
  // A mug nobody's allowed to move.
  b.cylinder(0.03, 0.03, 0.07, 0xe8e4dc, { at: [0.36, top + 0.05, -0.14] }, 8);
});

/** A steel bollard with a reflective band, 0.5 high. */
export const streetBollard = looks([0.2, 0.2], 1, (b) => {
  b.cylinder(0.06, 0.07, 0.5, 0x3a3e44, { at: [0, 0.25, 0] }, 10);
  b.cylinder(0.065, 0.065, 0.04, 0xd8d6d0, { at: [0, 0.42, 0] }, 10);
});

/** A low concrete planter along x, `len` long, with a clipped box hedge in it: green only. */
export function lowPlanter(len: number): SetPiece {
  return once(`lowPlanter:${len.toFixed(2)}`, () =>
    looks([len, 0.4], 1, (b) => {
      flat(b, len, 0.3, 0.38, 0xa8a49a, [0, 0.15, 0]);
      flat(b, len - 0.08, 0.02, 0.3, 0x4a3a2e, [0, 0.3, 0]);
      for (let x = -len / 2 + 0.15; x < len / 2 - 0.1; x += 0.22) {
        b.sphere(
          0.1,
          tint(0x5b7d4f, (hash01(x * 10, 1, 3) - 0.5) * 0.12),
          { at: [x, 0.36, 0] },
          [1, 0.8, 1],
        );
      }
    }),
  );
}

/** A glass balustrade along x, `len` long: posts, a steel top rail, a pane between. 0.55 high. */
export function balustrade(len: number): SetPiece {
  return once(`balustrade:${len.toFixed(2)}`, () =>
    looks([len, 0.06], 1, (b) => {
      b.pane(len, 0.45, 0.015, GLASS, { at: [len / 2, 0.27, 0] });
      flat(b, len, 0.03, 0.04, ALU, [len / 2, 0.52, 0]);
      for (let x = 0; x <= len + 0.01; x += Math.max(0.4, len / Math.round(len / 0.8)))
        flat(b, 0.03, 0.52, 0.03, ALU_DARK, [x, 0.26, 0]);
    }),
  );
}

/** The terrace's paving where the slab runs out past the building: `w` × `d`, centred, on its slab. */
export function terraceTop(w: number, d: number): SetPiece {
  return once(`terrace:${w.toFixed(2)}:${d.toFixed(2)}`, () =>
    looks([w, d], 1, (b) => {
      flat(b, w, FLOOR - 0.01, d, CUT, [0, (FLOOR - 0.01) / 2, 0]);
      for (let x = -w / 2, i = 0; x < w / 2 - 0.01; x += 0.5, i++)
        for (let z = -d / 2, j = 0; z < d / 2 - 0.01; z += 0.5, j++) {
          const xb = Math.min(w / 2, x + 0.5);
          const zb = Math.min(d / 2, z + 0.5);
          flat(
            b,
            xb - x - 0.02,
            0.01,
            zb - z - 0.02,
            tint(0xb4b0a6, (hash01(i, j, 7) - 0.5) * 0.08),
            [(x + xb) / 2, FLOOR - 0.005, (z + zb) / 2],
          );
        }
    }),
  );
}

// ---- Floor numbers on the cut faces ----

/** The patch the floor numbers are painted on, and their paint. */
const NUMBER_PATCH = 0xb8b2a6;
const NUMBER_PAINT = 0xece8df;

/**
 * A floor number stencilled on a cut slab's face, the way contractors mark
 * the levels: `text` near-white on a pale concrete patch, a dark shadow under
 * each stroke so it reads in the sun, `h` high (letters about 0.35). Faces
 * +z; origin at the bottom middle, on the face.
 */
export function slabNumber(text: string, h: number): SetPiece {
  return once(`slabNumber:${text}:${h.toFixed(3)}`, () =>
    looks([textWidth(text) * 0.07, 0.04], 1, (b) => {
      const px = Math.min(0.07, (h - 0.1) / 5);
      flat(b, (textWidth(text) + 2.4) * px, h - 0.05, 0.008, NUMBER_PATCH, [0, h / 2, 0.004]);
      const off = px * 0.3;
      glyphs(text, (u, r, w) => {
        flat(b, w * px, px, 0.004, 0x3e4248, [u * px + off, h / 2 + (2 - r) * px - off, 0.01]);
        flat(b, w * px, px, 0.004, NUMBER_PAINT, [u * px, h / 2 + (2 - r) * px, 0.014]);
      });
    }),
  );
}

// ---- Down below: the building's own facade and the neighbours' roofs ----

/** The building's curtain wall, a storey after storey down. */
const MULLION = 0x6f7780;
const FACADE_GLASS = 0x8fa3b4;
const SPANDREL = 0xe4e6e2;
const FOG = 0x9ea8b2;
/** The neighbours' roofs: gravel, parapets, plant. */
const GRAVEL = 0x8b8781;
const PARAPET = 0xa8a49c;
const NEIGHBOUR_WALLS = [0xa49c90, 0x9a9690, 0xb0a696, 0x8e9298] as const;

/**
 * The building's own facade under the upper floors, dropping `drop` down to
 * the street: `len` along +x from 0, its top at the origin and its foot
 * `out` toward +z (the facade, leaned a little toward the camera so it shows
 * past the floors' glass): glass in slate mullions, a spandrel at each
 * storey, fading into the haze further down. Build it facing out.
 */
export function facadeDrop(len: number, out: number, drop: number): SetPiece {
  return once(`facadeDrop:${len.toFixed(2)}:${out.toFixed(2)}:${drop.toFixed(2)}`, () =>
    looks([len, out], 1, (b) => {
      const slope = Math.atan2(out, drop);
      const run = Math.hypot(out, drop);
      const storey = 0.5;
      const floors = Math.ceil(drop / storey);
      const at = (x: number, d: number, off = 0): V3 => [
        x,
        -d + off * Math.sin(slope),
        (d / drop) * out + off * Math.cos(slope),
      ];
      const rot: V3 = [-slope, 0, 0];
      // Glass and spandrel, storey by storey, greying into the haze.
      for (let k = 0; k < floors; k++) {
        const d0 = k * storey;
        const d1 = Math.min(drop, d0 + storey);
        const fade = (k + 0.5) / floors;
        const hl = ((d1 - d0) * run) / drop;
        flat(
          b,
          len,
          hl - 0.07,
          0.02,
          mix(FACADE_GLASS, FOG, fade * 0.25),
          at(len / 2, (d0 + d1) / 2 + 0.03),
          rot,
        );
        // The spandrel at each floor: a pale concrete band, so the storeys count down.
        flat(b, len, 0.14, 0.03, SPANDREL, at(len / 2, d0 + 0.07, 0.01), rot);
      }
      // The mullions, all the way down.
      for (let x = 0.02; x < len; x += 0.36)
        flat(b, 0.035, run, 0.03, MULLION, at(x, drop / 2, 0.012), rot);
      // A reflection across the upper panes.
      flat(b, 0.12, run * 0.4, 0.004, 0xc8d6e0, at(len * 0.3, drop * 0.25, 0.02), [-slope, 0, 0.5]);
    }),
  );
}

/**
 * A neighbouring building, seen from storeys above: `w` wide (centred on
 * x), `d` deep back from its front at z = 0 and `h` high. Plain walls with
 * rows of windows on the front and sides, a pale parapet, a gravel roof and
 * on it, at about 0.7 the size of the play area's things, air-conditioning
 * units with their fans, skylights, a roof hatch and vent pipes. `look`
 * picks the walls and what's on the roof.
 */
export function neighbourRoof(w: number, d: number, h: number, look: number): SetPiece {
  return once(`neighbour:${w.toFixed(2)}:${d.toFixed(2)}:${h.toFixed(2)}:${look}`, () =>
    looks([w, d], 1, (b) => {
      const wall = nth(NEIGHBOUR_WALLS, look);
      flat(b, w, h, d, wall, [0, h / 2, -d / 2]);
      // Window rows on the front and the sides.
      const win = tint(0x4a5866, (hash01(look, 1, 3) - 0.5) * 0.2);
      for (let y = h - 0.32; y > 0.15; y -= 0.5) {
        for (let x = -w / 2 + 0.22; x < w / 2 - 0.15; x += 0.34)
          flat(b, 0.2, 0.2, 0.01, win, [x, y, 0.005]);
        for (const s of [-1, 1])
          for (let z = -0.22; z > -d + 0.15; z -= 0.34)
            flat(b, 0.01, 0.2, 0.2, win, [s * (w / 2 + 0.005), y, z]);
      }
      // The parapet, its coping, the gravel roof.
      const p = 0.05;
      const ph = 0.09;
      for (const z of [-p / 2, -d + p / 2]) flat(b, w, ph, p, PARAPET, [0, h + ph / 2, z]);
      for (const s of [-1, 1])
        flat(b, p, ph, d, PARAPET, [s * (w / 2 - p / 2), h + ph / 2, -d / 2]);
      flat(b, w - 2 * p, 0.01, d - 2 * p, GRAVEL, [0, h + 0.005, -d / 2]);
      for (let k = 0; k < Math.floor(w * d * 3); k++)
        flat(b, 0.12, 0.004, 0.08, tint(GRAVEL, (hash01(k, look, 5) - 0.5) * 0.18), [
          -w / 2 + p + hash01(k, look, 7) * (w - 2 * p - 0.12) + 0.06,
          h + 0.012,
          -p - hash01(k, look, 9) * (d - 2 * p - 0.08) - 0.04,
        ]);
      // Plant on the roof: AC units with their fans.
      const units = 1 + (look % 3);
      for (let k = 0; k < units; k++) {
        const ux = -w / 2 + ((k + 0.5) * w) / units + (hash01(k, look, 11) - 0.5) * 0.2;
        const uz = -d * (0.3 + hash01(k, look, 13) * 0.35);
        b.box(0.32, 0.16, 0.24, 0xc4c6c4, { at: [ux, h + 0.08, uz] }, 0.015);
        b.cylinder(0.08, 0.08, 0.012, 0x3a3d42, { at: [ux - 0.06, h + 0.165, uz] }, 12);
        flat(b, 0.02, 0.004, 0.14, 0x8a9096, [ux - 0.06, h + 0.172, uz]);
      }
      // Skylights: framed glass, a pale sheen.
      const lights = look % 2 ? 2 : 1;
      for (let k = 0; k < lights; k++) {
        const sx = (k - (lights - 1) / 2) * 0.6 + (hash01(look, k, 17) - 0.5) * 0.3;
        const sz = -d * 0.72;
        flat(b, 0.34, 0.06, 0.26, 0x6e757c, [sx, h + 0.03, sz]);
        flat(b, 0.3, 0.01, 0.22, 0x8fb4c8, [sx, h + 0.065, sz], [0.18, 0, 0]);
      }
      // A roof hatch and two vent pipes.
      flat(b, 0.2, 0.06, 0.2, 0x7a7e84, [w / 2 - 0.3, h + 0.03, -d + 0.3]);
      for (const k of [0, 1])
        b.cylinder(
          0.025,
          0.025,
          0.14,
          0x9aa0a6,
          {
            at: [-w / 2 + 0.25 + k * 0.12, h + 0.07, -0.25 - k * 0.08],
          },
          6,
        );
    }),
  );
}
