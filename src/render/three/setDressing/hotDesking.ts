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
export const CUT = 0x7a7e84;
const HATCH = 0xa8adb2;
/** Uncut concrete (slab soffits, the shaft, the motor room). */
const CONCRETE = 0x8c8a84;
const SHAFT = 0x9a9ea2;
const RAIL = 0xc4cad0;
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
const LEAF = 0x5f8a4a;

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

/**
 * The lift shaft between the upper floors, seen from above as the cutaway
 * cuts it: `w` wide (centred on x = 0) and `len` long back from its front at
 * z = 0. Its dark concrete back wall as the floor, with formwork lines; the
 * two steel guide rails on their brackets and the hoist ropes running its
 * length; the counterweight on its own rails at `cw` back; at each landing
 * in `sills` (back from the front) a steel sill across it with a yellow
 * toe-guard edge. The cars come and go at the landings.
 */
export function liftShaft(w: number, len: number, cw: number, sills: readonly number[]): SetPiece {
  return once(
    `liftShaft:${w}:${len.toFixed(2)}:${cw.toFixed(2)}:${sills.map((s) => s.toFixed(2)).join(',')}`,
    () =>
      looks([w, len], 1, (b) => {
        flat(b, w, 0.06, len, SHAFT, [0, 0.03, -len / 2]);
        const line = tint(SHAFT, -0.2);
        for (let z = -0.6; z > -len; z -= 0.6) flat(b, w, 0.004, 0.012, line, [0, 0.062, z]);
        for (const x of [-w / 4, w / 4]) flat(b, 0.012, 0.004, len, line, [x, 0.062, -len / 2]);
        for (let z = -0.3; z > -len; z -= 0.6)
          for (const x of [-w * 0.38, -w * 0.12, w * 0.12, w * 0.38])
            b.cylinder(0.02, 0.02, 0.006, tint(SHAFT, -0.3), { at: [x, 0.063, z] }, 6);
        // The walls of the shaft where no room stands beside it: low concrete, hatched on top.
        // The car rails: T-section steel on brackets, the length of the shaft.
        const r = w * 0.36;
        for (const s of [-1, 1]) {
          flat(b, 0.07, 0.07, len, RAIL, [s * r, 0.2, -len / 2]);
          flat(b, 0.025, 0.06, len, tint(RAIL, 0.25), [s * (r - 0.04), 0.26, -len / 2]);
          for (let z = -0.25; z > -len; z -= 0.7)
            flat(b, 0.16, 0.16, 0.05, 0x2e3034, [s * (r + 0.03), 0.12, z]);
        }
        // The counterweight's rails, its weights in a frame.
        const cx = w * 0.18;
        for (const s of [-1, 1]) flat(b, 0.04, 0.04, len, RAIL, [cx + s * 0.2, 0.15, -len / 2]);
        flat(b, 0.46, 0.22, 0.9, 0x34373c, [cx, 0.2, -cw]);
        for (let k = 0; k < 7; k++)
          flat(b, 0.4, 0.04, 0.1, nth([0x6a6e72, 0x5a5e62], k), [cx, 0.32, -cw - 0.36 + k * 0.12]);
        // The hoist ropes, down the middle.
        for (const dx of [-0.12, -0.06, 0, 0.06])
          bar(b, [dx - 0.1, 0.42, -len + 0.02], [dx - 0.1, 0.38, -0.02], 0.016, ROPE);
        for (const dx of [-0.03, 0.03])
          bar(b, [cx + dx, 0.42, -len + 0.02], [cx + dx, 0.34, -cw - 0.4], 0.014, ROPE);
        // A sill at each landing: steel across, a yellow-black toe guard.
        for (const z of sills) {
          flat(b, w - 0.04, 0.08, 0.1, 0x8a9096, [0, 0.1, -z]);
          for (let x = -w / 2 + 0.1; x < w / 2 - 0.05; x += 0.2)
            flat(b, 0.1, 0.004, 0.06, HAZARD, [x, 0.142, -z + 0.06], [0, 0.6, 0]);
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

/**
 * The only desk nobody can book: a small desk with a "RESERVED" tent card on
 * it and Prod, in his little pot, sitting at it. About 0.9 × 0.5, 0.95 high
 * with Prod's leaves. Faces +z.
 */
export const reservedDesk = looks([0.9, 0.5], 1, (b) => {
  const top = 0.42;
  flat(b, 0.86, 0.035, 0.48, 0xc8b48e, [0, top, 0]);
  for (const x of [-0.4, 0.4])
    for (const z of [-0.2, 0.2]) flat(b, 0.03, top, 0.03, 0x4a4e54, [x, top / 2, z]);
  flat(b, 0.8, 0.12, 0.02, 0x4a4e54, [0, top - 0.1, -0.22]);
  // The tent card: white, RESERVED in red on the side toward us.
  b.box(0.28, 0.1, 0.004, 0xf4f2ec, { at: [0.18, top + 0.06, 0.07], rot: [-0.35, 0, 0] }, 0);
  b.box(0.28, 0.1, 0.004, 0xf4f2ec, { at: [0.18, top + 0.06, 0.03], rot: [0.35, 0, 0] }, 0);
  glyphs('RESERVED', (u, r, w) => {
    flat(
      b,
      w * 0.008,
      0.008,
      0.004,
      BANNER_RED,
      [0.18 + u * 0.008, top + 0.1 - r * 0.009, 0.09 + r * 0.003],
      [-0.35, 0, 0],
    );
  });
  flat(b, 0.24, 0.012, 0.004, 0x3a3e44, [0.18, top + 0.035, 0.1], [-0.35, 0, 0]);
  // Prod in his pot.
  b.cylinder(0.1, 0.075, 0.14, 0x86a296, { at: [-0.18, top + 0.09, -0.02] }, 14);
  b.cylinder(0.09, 0.09, 0.01, 0x3e3428, { at: [-0.18, top + 0.16, -0.02] }, 12);
  for (const [x, y, z, r, c] of [
    [0, 0.3, 0, 0.11, LEAF],
    [0.08, 0.25, 0.05, 0.08, 0x6c9652],
    [-0.07, 0.26, -0.03, 0.08, 0x527e3e],
    [0.02, 0.38, -0.02, 0.07, 0x6c9652],
  ] as const)
    b.sphere(r, c, { at: [-0.18 + x, top + y, -0.02 + z] }, [1, 0.85, 1]);
  // A mug nobody's allowed to move.
  b.cylinder(0.03, 0.03, 0.07, 0xe8e4dc, { at: [0.36, top + 0.05, -0.12] }, 8);
});

/** A steel bollard with a reflective band, 0.5 high. */
export const streetBollard = looks([0.2, 0.2], 1, (b) => {
  b.cylinder(0.06, 0.07, 0.5, 0x3a3e44, { at: [0, 0.25, 0] }, 10);
  b.cylinder(0.065, 0.065, 0.04, 0xd8d6d0, { at: [0, 0.42, 0] }, 10);
});

/** A low concrete planter along x, `len` long, with spring bulbs and a clipped box hedge. */
export function lowPlanter(len: number): SetPiece {
  return once(`lowPlanter:${len.toFixed(2)}`, () =>
    looks([len, 0.4], 1, (b) => {
      flat(b, len, 0.3, 0.38, 0xa8a49a, [0, 0.15, 0]);
      flat(b, len - 0.08, 0.02, 0.3, 0x4a3a2e, [0, 0.3, 0]);
      for (let x = -len / 2 + 0.15; x < len / 2 - 0.1; x += 0.22) {
        b.sphere(
          0.1,
          tint(0x4e7a44, (hash01(x * 10, 1, 3) - 0.5) * 0.15),
          { at: [x, 0.36, -0.05] },
          [1, 0.8, 1],
        );
        b.sphere(0.035, nth([0xe8d070, 0xe8e4dc, 0xd88a9a], Math.round(x * 10)), {
          at: [x + 0.08, 0.38, 0.09],
        });
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
