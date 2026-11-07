import * as THREE from 'three';
import { type Model, ModelBuilder, tint } from '../kit';
import { tileHash } from '../../mapShape';
import { looks, nth, type SetPiece } from './shared';

/**
 * The rooftop round the Seed Round level's loft (`scenes/seedRound.ts`): the
 * building's stair and lift core with the startup's lit logo on its roof,
 * the skyline beyond (lit office blocks, a glass tower going up under a
 * crane, the corporate tower the game ends at), the terrace on the left
 * (decking, planters, string lights, bean bags, a ping-pong table, a
 * hammock, e-scooters, the "WE RAISED" balloons), the plant deck on the
 * right (condensers, ducts, solar panels, the dish, the antenna mast, the
 * rack cabinet shipped work goes out through), the parapet with its glass
 * balustrade and, far below past it, the street. Built like the rest of the
 * set dressing, standing on the ground at the origin and fronting +z.
 * Nothing here is food or drink.
 */

/** White render on the core and the parapets, a hair warm. */
export const RENDER = 0xd2d6dc;
/** Black powder-coated steel: trim, frames, posts, the sign's frame. */
export const BLACK_STEEL = 0x2b2e34;
/** Galvanised steel: ducts, trays, the mast. */
const GALV = 0x9aa1a8;
/** Roof membrane, cool grey. */
export const MEMBRANE = 0x4c5360;
const TIMBER = 0x8a6648;
const TIMBER_DARK = 0x684a35;
/** The startup's logo: warm white letters and a violet orbit. */
const LOGO = 0xfff2dc;
const LOGO_RING = 0xb07cff;
/** The faint violet halo behind the letters and round the orbit: the sign's light on the air. */
const HALO = 0x2c2350;
/** The aviation and crane lights: bright, as the glow layer isn't kept on living props. */
const AVIATION = 0xff3a22;
/** Lit office windows: warm, warmer, and the odd cool screen-lit one. */
const LIT = [0xffd690, 0xffe4b4, 0xf2c278, 0xc4dcff] as const;
/** Unlit windows: the blue hour in glass. */
const UNLIT = [0x3c475a, 0x46536a, 0x343e50] as const;
/** The facades of the city round us: stone, brick, concrete, dark glass. */
const FACADES = [0x8a8478, 0x7a5e54, 0x6e747e, 0x48546a, 0x9a948a] as const;
/** Muted outdoor fabric: slate, sage, ochre, clay, never a player's colour. */
const FABRIC = [0x5a6a7a, 0x7a8a6a, 0xb08a4a, 0xa0675a, 0x6a5a7a] as const;
/** Fountain grass: two greens and the straw its tips go to. */
const GRASS = [0x7f9a6a, 0x9aa77a] as const;
const STRAW = 0xc8b88a;

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

/** A number from 0 to 1 for (a, b) with `salt`. */
export function hash01(a: number, b: number, salt: number): number {
  let h = tileHash(Math.round(a * 53) + salt * 7919, Math.round(b * 61) - salt * 131);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  return ((h >>> 0) % 1000) / 1000;
}

/** A plain (unbevelled) box in the glow layer: lit windows, letters, LEDs strips. */
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

// ---- Lettering ----

/** A blocky alphabet, 3 wide and 5 high: just what the signs use. */
const FONT: Readonly<Record<string, string>> = {
  A: '010101111101101',
  B: '110101110101110',
  C: '011100100100011',
  D: '110101101101110',
  E: '111100110100111',
  F: '111100110100100',
  G: '011100101101011',
  I: '111010010010111',
  L: '100100100100111',
  O: '111101101101111',
  P: '110101110100100',
  R: '110101110101101',
  S: '011100010001110',
  T: '111010010010010',
  W: '101101111111101',
  Y: '101101010010010',
  '7': '111001010010010',
  '!': '010010010000010',
  '^': '010111010010010',
  ' ': '000000000000000',
};

/** The logo's own rounder alphabet, 5 wide and 5 high. */
const WIDE: Readonly<Record<string, string>> = {
  A: '0111010001111111000110001',
  O: '0111010001100011000101110',
  R: '1111010001111101001010001',
  B: '1111010001111101000111110',
  Y: '1000101010001000010000100',
  T: '1111100100001000010000100',
  ' ': '0000000000000000000000000',
};

/** How wide `text` runs, in pixels: 3 per glyph (5 when `wide`) and 1 between. */
export function textWidth(text: string, wide = false): number {
  return text.length * (wide ? 6 : 4) - 1;
}

/**
 * Letters for `text` centred on (x, y), on a face at depth z facing +z, each
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
  fill = 1,
  wide = false,
  tilt = 0,
): void {
  const cols = textWidth(text, wide);
  const gap = px * (1 - fill);
  const font = wide ? WIDE : FONT;
  const g = wide ? 5 : 3;
  for (let k = 0; k < text.length; k++) {
    const glyph = font[text.charAt(k)] ?? font[' '] ?? '';
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
        // Turned about the text's middle line, its top leaning back by `tilt`.
        const dy = (2 - r) * px;
        const dz = depth / 2;
        const at: [number, number, number] = [
          left + ((e - c) * px) / 2,
          y + dy * Math.cos(tilt) + dz * Math.sin(tilt),
          z - dy * Math.sin(tilt) + dz * Math.cos(tilt),
        ];
        const rot: [number, number, number] = [-tilt, 0, 0];
        if (lit) glowBox(b, (e - c) * px - gap, px - gap, depth, color, at, rot);
        else b.box((e - c) * px - gap, px - gap, depth, color, { at, rot }, 0);
        c = e;
      }
    }
  }
}

/** A face of a building: where u = 0 is (x, z), which way u runs, which way the face looks. */
interface Face {
  x: number;
  z: number;
  /** The face's turn about y: 0 faces +z, π/2 faces +x, −π/2 faces −x. */
  yaw: number;
}

/** The front face of a block, at depth `z`. */
const front = (z: number): Face => ({ x: 0, z, yaw: 0 });

/**
 * A grid of windows on `face`, from u0 to u1 along it and y0 to y1 up it:
 * some lit (glow), the rest dark glass, a frame line between floors.
 */
function windowGrid(
  b: ModelBuilder,
  face: Face,
  u0: number,
  u1: number,
  y0: number,
  y1: number,
  step: [number, number],
  litShare: number,
  salt: number,
  frame?: number,
): void {
  const nx = Math.max(1, Math.round((u1 - u0) / step[0]));
  const ny = Math.max(1, Math.round((y1 - y0) / step[1]));
  const cw = (u1 - u0) / nx;
  const ch = (y1 - y0) / ny;
  const c = Math.cos(face.yaw);
  const s = Math.sin(face.yaw);
  /** A point u along the face, y up, `out` in front of it. */
  const at = (u: number, y: number, out: number): [number, number, number] => [
    face.x + u * c + out * s,
    y,
    face.z - u * s + out * c,
  ];
  const rot: [number, number, number] = [0, face.yaw, 0];
  for (let j = 0; j < ny; j++) {
    // Whole floors tend to be lit or dark together, the way offices are.
    const floor = hash01(j, salt, 11) < litShare;
    for (let i = 0; i < nx; i++) {
      const u = u0 + (i + 0.5) * cw;
      const y = y0 + (j + 0.5) * ch;
      const r = hash01(i, j + salt * 13, 7);
      const lit = floor ? r < 0.8 : r < litShare * 0.35;
      if (lit)
        glowBox(b, cw * 0.72, ch * 0.62, 0.01, nth(LIT, i + j * 3 + salt), at(u, y, 0.006), rot);
      else
        b.box(
          cw * 0.72,
          ch * 0.62,
          0.01,
          nth(UNLIT, i + j + salt),
          { at: at(u, y, 0.004), rot },
          0,
        );
    }
  }
  if (frame !== undefined)
    for (let j = 0; j <= ny; j++)
      b.box(u1 - u0, 0.02, 0.012, frame, { at: at((u0 + u1) / 2, y0 + j * ch, 0.006), rot }, 0);
}

// ---- The stair and lift core ----

/** The core: how high its roof is, and how deep it runs back from the level's back wall. */
export const CORE = { height: 1.9, depth: 1.8 } as const;
/** The logo's letters: how big a pixel is, and how high the frame lifts them over the core's roof. */
export const LOGO_PX = 0.13;
const LOGO_LIFT = 0.36;

export interface CorePlan {
  /** Total width; the core runs from −width/2 to width/2. Its front is at z = 0. */
  width: number;
  /** The lift door (behind a back-edge inbox), by x, and how wide it is. */
  door?: number;
  doorWidth?: number;
  /** The tall lit stair window, by x. */
  stair: number;
  /** The lift motor room on the roof, by x. */
  motor: number;
  /** The timber-clad water tank on the roof, by x. */
  tank: number;
  /** The middle of the logo sign on its frame (its own piece, `logoSign`), by x. */
  logo: number;
}

/**
 * The building's stair and lift core, whose front is the level's back wall:
 * white render in panels with black steel trim and flashing, the lift door
 * with its floor indicator and "LOFT 7" plaque, a tall lit stair window; on
 * its roof the lift motor room with louvres and a timber-clad water tank on
 * steel legs. The startup's name on its roof is its own piece (`logoSign`),
 * so the scene can light it up.
 */
export function liftCore(plan: CorePlan): SetPiece {
  return once(`core:${JSON.stringify(plan)}`, () => ({
    size: [plan.width, CORE.depth],
    model: () => coreModel(plan),
  }));
}

function coreModel(plan: CorePlan): Model {
  const b = new ModelBuilder();
  const { width } = plan;
  const H = CORE.height;
  const D = CORE.depth;
  const half = width / 2;
  b.box(width, H, D, RENDER, { at: [0, H / 2, -D / 2] }, 0);
  // Render panels: a joint every 0.32 up, staggered vertical joints, a panel here and there of its own shade.
  const seam = tint(RENDER, -0.16);
  for (let y = 0.32; y < H - 0.1; y += 0.32)
    b.box(width, 0.014, 0.008, seam, { at: [0, y, 0.002] }, 0);
  let row = 0;
  for (let y = 0; y < H - 0.15; y += 0.32, row++) {
    const off = (row % 2) * 0.6;
    for (let x = -half + off; x < half; x += 1.2) {
      b.box(0.014, 0.32, 0.008, seam, { at: [x, y + 0.16, 0.002] }, 0);
      if (hash01(x, row, 3) > 0.7)
        b.box(1.18, 0.3, 0.004, tint(RENDER, -0.05), { at: [x + 0.6, y + 0.16, 0.001] }, 0);
    }
  }
  // Black steel: corner angles, the flashing round the roof's edge, a plinth.
  for (const s of [-1, 1]) {
    b.box(0.07, H + 0.02, 0.07, BLACK_STEEL, { at: [s * (half - 0.02), H / 2, 0.0] }, 0);
    b.box(0.06, H, 0.06, BLACK_STEEL, { at: [s * (half - 0.02), H / 2, -D + 0.02] }, 0);
  }
  b.box(width + 0.06, 0.1, 0.08, BLACK_STEEL, { at: [0, H + 0.03, 0.01] }, 0);
  b.box(width + 0.06, 0.1, 0.08, BLACK_STEEL, { at: [0, H + 0.03, -D - 0.01] }, 0);
  for (const s of [-1, 1])
    b.box(0.08, 0.1, D, BLACK_STEEL, { at: [s * (half + 0.01), H + 0.03, -D / 2] }, 0);
  // The roof: membrane with welded seams, a gravel border, a walkway of pavers to the sign.
  b.box(width - 0.08, 0.02, D - 0.1, MEMBRANE, { at: [0, H + 0.005, -D / 2] }, 0);
  for (let x = -half + 0.9; x < half - 0.2; x += 0.9)
    b.box(0.02, 0.006, D - 0.14, tint(MEMBRANE, 0.12), { at: [x, H + 0.018, -D / 2] }, 0);
  for (let x = -half + 0.3; x < half - 0.2; x += 0.42)
    b.box(
      0.36,
      0.014,
      0.3,
      tint(0x8e8c86, (hash01(x, 2, 5) - 0.5) * 0.12),
      {
        at: [x, H + 0.022, -0.28],
      },
      0,
    );
  // A roof light over the stair, lit from below, and a mushroom vent or two.
  b.box(0.5, 0.1, 0.8, RENDER, { at: [plan.stair, H + 0.05, -D + 0.6] }, 0);
  glowBox(b, 0.4, 0.02, 0.7, 0xf0e2c0, [plan.stair, H + 0.105, -D + 0.6]);
  b.pane(0.44, 0.04, 0.74, 0xbcd6e6, { at: [plan.stair, H + 0.13, -D + 0.6] });
  for (const x of [plan.stair - 0.9, plan.logo + 1.9]) {
    if (Math.abs(x) > half - 0.3) continue;
    b.cylinder(0.05, 0.05, 0.2, GALV, { at: [x, H + 0.1, -D + 0.35] }, 8);
    b.cylinder(0.12, 0.1, 0.06, GALV, { at: [x, H + 0.22, -D + 0.35] }, 10);
  }

  // The tall stair window: lit, black mullions, the landings showing as dark bands.
  const sx = plan.stair;
  b.box(0.5, 1.4, 0.03, BLACK_STEEL, { at: [sx, 1.0, 0.015] }, 0);
  glowBox(b, 0.42, 1.32, 0.01, 0xf2dcb0, [sx, 1.0, 0.032]);
  for (const y of [0.55, 1.05, 1.5])
    b.box(0.44, 0.05, 0.012, BLACK_STEEL, { at: [sx, y, 0.04] }, 0);
  b.box(0.02, 1.32, 0.012, BLACK_STEEL, { at: [sx, 1.0, 0.04] }, 0);

  // The lift door: steel leaves a crack open, the lit car inside, the indicator and the plaque.
  if (plan.door !== undefined) {
    const dx = plan.door;
    const dw = Math.min(1.6, plan.doorWidth ?? 0.9);
    b.box(dw + 0.16, 1.62, 0.05, BLACK_STEEL, { at: [dx, 0.81, 0.025] }, 0);
    glowBox(b, dw - 0.04, 1.5, 0.01, 0xf4e6c8, [dx, 0.75, 0.052]);
    for (const s of [-1, 1])
      b.box(dw / 2 - 0.08, 1.48, 0.02, 0x8e959e, { at: [dx + s * (dw / 4 + 0.04), 0.74, 0.06] }, 0);
    // The floor indicator: a black panel, an up arrow and a lit 7.
    b.box(0.46, 0.18, 0.03, 0x15171b, { at: [dx, 1.74, 0.02] }, 0);
    letters(b, '^ 7', dx, 1.74, 0.036, 0.026, 0xffb648, true);
    // "LOFT 7" on a white plaque beside the door.
    const px0 = dx + dw / 2 + 0.38;
    if (px0 < half - 0.2) {
      b.box(0.5, 0.18, 0.02, 0xf4f2ec, { at: [px0, 1.3, 0.012] }, 0);
      letters(b, 'LOFT 7', px0, 1.3, 0.022, 0.018, BLACK_STEEL, false, 0.006);
    }
  }

  // The lift motor room on the roof: rendered, a louvred panel, a black door, a fan on top.
  const mx = plan.motor;
  const mh = 0.72;
  b.box(1.3, mh, 1.0, RENDER, { at: [mx, H + mh / 2, -D + 0.62] }, 0);
  b.box(1.36, 0.06, 1.06, BLACK_STEEL, { at: [mx, H + mh + 0.02, -D + 0.62] }, 0);
  b.box(0.5, 0.36, 0.02, 0x3a3e44, { at: [mx - 0.3, H + 0.38, -D + 1.13] }, 0);
  for (let y = 0.24; y < 0.55; y += 0.06)
    b.box(0.48, 0.018, 0.03, 0x50555c, { at: [mx - 0.3, H + y, -D + 1.14], rot: [0.4, 0, 0] }, 0);
  b.box(0.32, 0.58, 0.02, BLACK_STEEL, { at: [mx + 0.32, H + 0.29, -D + 1.13] }, 0);
  b.box(0.03, 0.03, 0.03, GALV, { at: [mx + 0.22, H + 0.3, -D + 1.15] }, 0);
  b.cylinder(0.2, 0.2, 0.08, GALV, { at: [mx + 0.25, H + mh + 0.08, -D + 0.5] }, 14);
  b.cylinder(0.17, 0.17, 0.02, 0x2a2c30, { at: [mx + 0.25, H + mh + 0.12, -D + 0.5] }, 14);
  for (let k = 0; k < 3; k++)
    b.box(
      0.3,
      0.012,
      0.05,
      GALV,
      {
        at: [mx + 0.25, H + mh + 0.135, -D + 0.5],
        rot: [0, (k * Math.PI) / 3, 0],
      },
      0,
    );
  // A warning sign on the door.
  b.box(0.1, 0.1, 0.006, 0xe8c040, { at: [mx + 0.32, H + 0.45, -D + 1.143] }, 0);

  // The water tank: timber boards round it, steel bands, on four steel legs, a ladder up.
  const tx = plan.tank;
  const ty = H + 0.4;
  for (const [ox, oz] of [
    [-0.42, -0.32],
    [0.42, -0.32],
    [-0.42, 0.32],
    [0.42, 0.32],
  ] as const)
    b.box(0.06, 0.4, 0.06, BLACK_STEEL, { at: [tx + ox, H + 0.2, -D + 0.7 + oz] }, 0);
  b.box(1.0, 0.04, 0.8, BLACK_STEEL, { at: [tx, ty, -D + 0.7] }, 0);
  b.box(0.96, 0.78, 0.76, TIMBER_DARK, { at: [tx, ty + 0.41, -D + 0.7] }, 0);
  for (let x = -0.45, k = 0; x < 0.46; x += 0.075, k++)
    b.box(
      0.065,
      0.78,
      0.012,
      tint(TIMBER, (hash01(k, 1, 9) - 0.5) * 0.18),
      {
        at: [tx + x + 0.03, ty + 0.41, -D + 1.085],
      },
      0,
    );
  for (const y of [0.15, 0.68])
    b.box(1.0, 0.035, 0.8, BLACK_STEEL, { at: [tx, ty + y, -D + 0.7] }, 0);
  b.box(1.0, 0.04, 0.8, tint(TIMBER_DARK, -0.15), { at: [tx, ty + 0.82, -D + 0.7] }, 0);
  for (const s of [-1, 1])
    b.box(0.02, 1.1, 0.02, BLACK_STEEL, { at: [tx + 0.52 + s * 0.08, H + 0.6, -D + 0.7] }, 0);
  for (let y = 0.1; y < 1.1; y += 0.14)
    b.box(0.16, 0.015, 0.015, BLACK_STEEL, { at: [tx + 0.52, H + y, -D + 0.7] }, 0);

  return b.build();
}

/** The logo's orbit's radius. */
const LOGO_RING_R = 0.42;

/** How wide the logo sign runs for `name`: the letters, the orbit and the margins. */
export function logoWidth(name: string): number {
  return textWidth(name, true) * LOGO_PX + LOGO_RING_R * 2 + 0.5;
}

/**
 * The startup's name in big lit channel letters on a steel frame, with its
 * violet orbit beside it, for the core's roof: the origin at the sign's middle
 * on the core's front face, at the core's foot (place it where the core is,
 * moved along x). Tilted back a little toward the street. A faint violet halo
 * board behind the letters so they read lit before the bloom does.
 */
export function logoSign(name: string): SetPiece {
  return once(`logo:${name}`, () =>
    looks([logoWidth(name), 0.6], 1, (b) => {
      const H = CORE.height;
      const tw = textWidth(name, true) * LOGO_PX;
      const ring = LOGO_RING_R;
      const signW = logoWidth(name);
      const ly = H + LOGO_LIFT + LOGO_PX * 2.5;
      const lz = -0.35;
      const left = -signW / 2;
      // Posts, rails and braces behind the letters.
      for (let x = left + 0.1; x < left + signW; x += 0.75) {
        const ph = LOGO_LIFT + LOGO_PX * 5.2;
        b.box(0.05, ph, 0.05, BLACK_STEEL, { at: [x, H + ph / 2, lz - 0.08] }, 0);
        b.box(0.04, 0.5, 0.04, BLACK_STEEL, { at: [x, H + 0.22, lz - 0.32], rot: [0.75, 0, 0] }, 0);
      }
      for (const y of [H + LOGO_LIFT - 0.05, H + LOGO_LIFT + LOGO_PX * 3])
        b.box(signW, 0.04, 0.04, BLACK_STEEL, { at: [0, y, lz - 0.06] }, 0);
      b.box(signW + 0.1, 0.035, 0.3, GALV, { at: [0, H + 0.18, lz - 0.15] }, 0);
      // The letters on a dark backing, so they read as channel letters, a faint halo round it.
      const tx0 = left + ring * 2 + 0.35 + tw / 2;
      const tilt = 0.45;
      // A point `dz` behind the letters' face, on their tilted plane.
      const behind = (dz: number): [number, number, number] => [
        tx0,
        ly - dz * Math.sin(tilt),
        lz + dz * Math.cos(tilt),
      ];
      const rot: [number, number, number] = [-tilt, 0, 0];
      b.add(
        new THREE.PlaneGeometry(tw + 0.46, LOGO_PX * 5.6 + 0.3),
        HALO,
        { at: behind(-0.03), rot },
        'glow',
      );
      b.box(tw + 0.16, LOGO_PX * 5.6, 0.03, 0x1c1e24, { at: behind(-0.005), rot }, 0);
      letters(b, name, tx0, ly, lz + 0.012, LOGO_PX, LOGO, true, 0.03, 0.97, true, tilt);
      // The orbit: a lit ring round a planet, tilted.
      const rx = left + ring + 0.1;
      b.add(new THREE.CircleGeometry(ring + 0.12, 28), HALO, { at: [rx, ly, lz - 0.04] }, 'glow');
      b.add(
        new THREE.TorusGeometry(ring, 0.045, 8, 32),
        LOGO_RING,
        { at: [rx, ly, lz + 0.06], rot: [0, 0, 0.5] },
        'glow',
      );
      b.sphere(ring * 0.42, 0x2e2a3a, { at: [rx, ly, lz] });
      b.add(
        new THREE.SphereGeometry(ring * 0.36, 14, 10),
        LOGO_RING,
        { at: [rx, ly, lz + 0.03] },
        'glow',
      );
      b.add(
        new THREE.SphereGeometry(0.08, 8, 6),
        LOGO,
        { at: [rx + Math.cos(0.5) * ring, ly + Math.sin(0.5) * ring, lz + 0.08] },
        'glow',
      );
    }),
  );
}

/**
 * A lift lobby on a side of the level (the draft's inbox on the left edge):
 * a rendered box with brushed-steel lift doors in a black steel frame on the
 * face toward the level (+z), the lit floor indicator over them and the
 * "LOFT 7" plaque beside; on its roof the lift's grey motor housing, set
 * back, with a louvred vent. `width` along x.
 */
export function liftLobby(width: number): SetPiece {
  return once(`lobby:${width.toFixed(2)}`, () =>
    looks([width, 1.1], 1, (b) => {
      const H = 1.4;
      const D = 1.1;
      b.box(width, H, D, RENDER, { at: [0, H / 2, -D / 2] }, 0);
      // Render coursing on the faces the camera sees: toward the level and the near end.
      const seam = tint(RENDER, -0.16);
      for (let y = 0.32; y < H; y += 0.32) {
        b.box(width, 0.014, 0.008, seam, { at: [0, y, 0.002] }, 0);
        b.box(0.008, 0.014, D, seam, { at: [-width / 2 - 0.002, y, -D / 2] }, 0);
      }
      // Black steel: flashing round the roof, corner angles, a plinth.
      for (const z of [0, -D])
        b.box(width + 0.06, 0.08, 0.06, BLACK_STEEL, { at: [0, H + 0.02, z] }, 0);
      for (const s of [-1, 1]) {
        b.box(0.06, 0.08, D, BLACK_STEEL, { at: [s * (width / 2 + 0.01), H + 0.02, -D / 2] }, 0);
        b.box(0.06, H, 0.06, BLACK_STEEL, { at: [s * (width / 2 - 0.02), H / 2, 0] }, 0);
      }
      b.box(width + 0.02, 0.06, D + 0.02, BLACK_STEEL, { at: [0, 0.03, -D / 2] }, 0);
      // The roof: pale pavers, the motor housing set back on it.
      b.box(width - 0.06, 0.02, D - 0.06, 0x8e9196, { at: [0, H + 0.005, -D / 2] }, 0);
      const hw = width - 0.36;
      const hd = 0.5;
      const hz = -D + 0.08 + hd / 2;
      b.box(hw, 0.25, hd, 0x8c9298, { at: [0, H + 0.125, hz] }, 0.01);
      b.box(hw + 0.04, 0.03, hd + 0.04, 0x6e747a, { at: [0, H + 0.26, hz] }, 0);
      const vw = Math.min(0.6, hw * 0.5);
      b.box(vw, 0.16, 0.01, 0x5a6068, { at: [-hw / 4, H + 0.12, hz + hd / 2 + 0.004] }, 0);
      for (let y = 0.06; y < 0.19; y += 0.035)
        b.box(
          vw - 0.02,
          0.012,
          0.02,
          0x40454c,
          {
            at: [-hw / 4, H + y, hz + hd / 2 + 0.01],
            rot: [0.5, 0, 0],
          },
          0,
        );
      b.box(0.24, 0.2, 0.01, BLACK_STEEL, { at: [hw / 4, H + 0.1, hz + hd / 2 + 0.004] }, 0);
      // The lift doors: two brushed-steel leaves, a dark seam, in a black steel frame.
      const dw = Math.min(1.0, width - 0.5);
      const dh = 1.06;
      b.box(dw + 0.14, dh + 0.08, 0.04, BLACK_STEEL, { at: [0, (dh + 0.08) / 2, 0.02] }, 0);
      for (const s of [-1, 1]) {
        b.box(dw / 2 - 0.01, dh, 0.02, 0xb8c0c8, { at: [(s * dw) / 4, dh / 2, 0.045] }, 0);
        // Brushed: a few faint vertical streaks.
        for (const f of [0.25, 0.6])
          b.box(
            0.008,
            dh - 0.06,
            0.004,
            0xcfd6dc,
            {
              at: [(s * dw) / 4 + (f - 0.5) * (dw / 2), dh / 2, 0.056],
            },
            0,
          );
      }
      b.box(0.014, dh, 0.006, 0x2a2d32, { at: [0, dh / 2, 0.057] }, 0);
      // The near end (−x, toward the camera) shows a second pair of lift doors under the indicator
      // sign the scene hangs there, so the lift reads from the front too.
      const ew = 0.62;
      const ex = -width / 2;
      b.box(
        0.04,
        dh * 0.86 + 0.06,
        ew + 0.12,
        BLACK_STEEL,
        { at: [ex - 0.02, (dh * 0.86 + 0.06) / 2, -D / 2] },
        0,
      );
      for (const s of [-1, 1])
        b.box(
          0.02,
          dh * 0.86,
          ew / 2 - 0.01,
          0xb8c0c8,
          {
            at: [ex - 0.045, (dh * 0.86) / 2, -D / 2 + (s * ew) / 4],
          },
          0,
        );
      b.box(0.006, dh * 0.86, 0.014, 0x2a2d32, { at: [ex - 0.057, (dh * 0.86) / 2, -D / 2] }, 0);
      // The floor indicator over the doors.
      b.box(0.42, 0.14, 0.03, 0x15171b, { at: [0, dh + 0.17, 0.02] }, 0);
      letters(b, '^ 7', 0, dh + 0.17, 0.036, 0.024, 0xffb648, true);
      // "LOFT 7" on a white plaque beside the doors, the call button below it.
      const px = dw / 2 + 0.2;
      if (px + 0.12 < width / 2) {
        b.box(0.22, 0.14, 0.012, 0xf4f2ec, { at: [px, 0.95, 0.006] }, 0);
        letters(b, 'LOFT 7', px, 0.95, 0.013, 0.008, BLACK_STEEL, false, 0.004);
        b.box(0.07, 0.14, 0.012, 0x9aa1a8, { at: [px, 0.55, 0.006] }, 0);
        b.led(0.016, 0xffb648, { at: [px, 0.58, 0.016] });
      }
    }),
  );
}

/** The lift's lit floor indicator over a "LOFT 7" plaque, on a black panel facing +z, its foot at the origin. */
export const liftSign = looks([0.6, 0.1], 1, (b) => {
  b.box(0.62, 0.42, 0.03, 0x15171b, { at: [0, 0.21, 0.015] }, 0);
  letters(b, '^ 7', 0, 0.3, 0.032, 0.034, 0xffb648, true);
  b.box(0.54, 0.14, 0.012, 0xf4f2ec, { at: [0, 0.1, 0.036] }, 0);
  letters(b, 'LOFT 7', 0, 0.1, 0.042, 0.02, BLACK_STEEL, false, 0.006);
});

// ---- The skyline ----

/**
 * A city block `w` × `d` and `h` high: a facade with rows of windows on the
 * front and both sides (some floors lit), a parapet, rooftop plant and on
 * some a water tank or a mast. `look` picks the facade and what's on top.
 */
export function cityBlock(
  w: number,
  d: number,
  h: number,
  look: number,
  litShare?: number,
): SetPiece {
  return once(`block:${w.toFixed(2)}:${d.toFixed(2)}:${h.toFixed(2)}:${look}:${litShare}`, () =>
    looks([w, d], 1, (b) => {
      const face = nth(FACADES, look);
      const glassy = face === FACADES[3];
      b.box(w, h, d, face, { at: [0, h / 2, -d / 2] }, 0);
      const step: [number, number] = glassy ? [0.26, 0.24] : [0.34, 0.3];
      const lit = litShare ?? 0.35 + hash01(look, w, 3) * 0.35;
      windowGrid(
        b,
        front(0),
        -w / 2 + 0.12,
        w / 2 - 0.12,
        0.1,
        h - 0.18,
        step,
        lit,
        look * 7 + 1,
        glassy ? tint(face, -0.3) : undefined,
      );
      // The sides, seen past the front in perspective.
      for (const s of [-1, 1])
        windowGrid(
          b,
          { x: (s * w) / 2, z: -d / 2, yaw: (s * Math.PI) / 2 },
          -d / 2 + 0.12,
          d / 2 - 0.12,
          0.1,
          h - 0.18,
          step,
          lit * 0.8,
          look * 5 + s + 4,
        );
      // Parapet, roof, plant on top.
      const cap = tint(face, -0.25);
      b.box(w + 0.04, 0.08, 0.06, cap, { at: [0, h + 0.03, 0] }, 0);
      b.box(w + 0.04, 0.08, 0.06, cap, { at: [0, h + 0.03, -d] }, 0);
      for (const s of [-1, 1])
        b.box(0.06, 0.08, d, cap, { at: [s * (w / 2), h + 0.03, -d / 2] }, 0);
      b.box(w - 0.1, 0.01, d - 0.1, 0x4a4e56, { at: [0, h + 0.005, -d / 2] }, 0);
      const units = 1 + (look % 3);
      for (let k = 0; k < units; k++) {
        const ux = -w / 2 + ((k + 0.5) * w) / units + (hash01(k, look, 9) - 0.5) * 0.3;
        b.box(0.4, 0.22, 0.32, 0x8a9096, { at: [ux, h + 0.11, -d / 2 - 0.2 + k * 0.15] }, 0);
        b.cylinder(0.1, 0.1, 0.02, 0x3a3d42, { at: [ux, h + 0.225, -d / 2 - 0.2 + k * 0.15] }, 10);
      }
      if (look % 4 === 1) {
        // A water tower on legs.
        b.cylinder(0.25, 0.25, 0.4, TIMBER_DARK, { at: [w / 4, h + 0.45, -d / 2] }, 12);
        b.cone(0.28, 0.16, 0x3a3d42, { at: [w / 4, h + 0.73, -d / 2] }, 12);
        for (const s of [-1, 1])
          b.box(0.03, 0.26, 0.03, BLACK_STEEL, { at: [w / 4 + s * 0.15, h + 0.13, -d / 2] }, 0);
      } else if (look % 4 === 3) {
        // A thin mast with a lit tip.
        b.cylinder(0.02, 0.03, 0.9, GALV, { at: [-w / 4, h + 0.45, -d / 2] }, 6);
        b.led(0.035, AVIATION, { at: [-w / 4, h + 0.92, -d / 2] });
      }
    }),
  );
}

/**
 * The glass tower going up: a concrete core, floor slabs, the lower floors
 * glazed (a few lit), the top floors bare columns and orange safety netting.
 * `w` × `d`, `h` high.
 */
export function towerUnderConstruction(w: number, d: number, h: number): SetPiece {
  return once(`tower:${w}:${d}:${h}`, () =>
    looks([w, d], 1, (b) => {
      const slab = 0x9a9890;
      const floor = 0.3;
      const glazed = Math.floor((h * 0.55) / floor);
      const n = Math.floor(h / floor);
      b.box(w * 0.36, h + 0.3, d * 0.36, 0x8e8c84, { at: [0, (h + 0.3) / 2, -d / 2] }, 0);
      for (let k = 0; k <= n; k++) {
        const y = k * floor;
        b.box(w, 0.05, d, slab, { at: [0, y + 0.025, -d / 2] }, 0);
        if (k >= n) continue;
        if (k < glazed) {
          b.pane(w - 0.04, floor - 0.06, 0.02, 0x7aa0c0, { at: [0, y + floor / 2 + 0.02, -0.02] });
          b.box(
            w - 0.04,
            floor - 0.06,
            0.01,
            0x3e5a78,
            { at: [0, y + floor / 2 + 0.02, -0.05] },
            0,
          );
          if (hash01(k, 3, 17) > 0.55)
            glowBox(b, w * 0.4, floor - 0.12, 0.01, 0xc4dcff, [
              (hash01(k, 4, 17) - 0.5) * w * 0.4,
              y + floor / 2 + 0.02,
              -0.04,
            ]);
          for (let x = -w / 2 + 0.25; x < w / 2; x += 0.25)
            b.box(0.02, floor - 0.06, 0.02, 0x2e3a48, { at: [x, y + floor / 2 + 0.02, -0.01] }, 0);
        } else {
          for (let x = -w / 2 + 0.08; x < w / 2; x += w / 4 - 0.02)
            for (const z of [-0.08, -d + 0.08])
              b.box(0.07, floor - 0.05, 0.07, slab, { at: [x, y + floor / 2 + 0.02, z] }, 0);
          // Orange safety netting on the edge of the open floors, now and then.
          if (k > n - 3)
            b.pane(w, floor * 0.6, 0.02, 0xe07a30, { at: [0, y + floor * 0.35, 0.01] });
        }
      }
      // Rebar sticking up from the top slab.
      for (let x = -w / 2 + 0.1; x < w / 2; x += 0.2)
        b.box(0.012, 0.18, 0.012, 0x6a4a3a, { at: [x, h + 0.14, -0.1] }, 0);
    }),
  );
}

/** A tower crane: lattice mast `mast` high, a jib `jib` long out along +x, the cab, the counter-jib. */
export function towerCrane(mast: number, jib: number): SetPiece {
  return once(`crane:${mast}:${jib}`, () =>
    looks([1, 1], 1, (b) => {
      const yel = 0xd0a040;
      const s = 0.22;
      // The mast: four legs and zig-zag bracing.
      for (const [x, z] of [
        [-s / 2, -s / 2],
        [s / 2, -s / 2],
        [-s / 2, s / 2],
        [s / 2, s / 2],
      ] as const)
        b.box(0.025, mast, 0.025, yel, { at: [x, mast / 2, z] }, 0);
      for (let y = 0.1, k = 0; y < mast - 0.1; y += s, k++) {
        const r = Math.atan2(s, s);
        b.box(
          0.012,
          s * 1.4,
          0.012,
          yel,
          { at: [0, y + s / 2, s / 2], rot: [0, 0, k % 2 ? r : -r] },
          0,
        );
        b.box(
          0.012,
          s * 1.4,
          0.012,
          yel,
          {
            at: [s / 2, y + s / 2, 0],
            rot: [k % 2 ? r : -r, 0, 0],
          },
          0,
        );
      }
      // The slewing unit and cab.
      b.box(0.34, 0.12, 0.34, 0x3a3d42, { at: [0, mast + 0.06, 0] }, 0);
      b.box(0.2, 0.18, 0.22, 0xe8e4da, { at: [0.12, mast + 0.21, 0.18] }, 0.02);
      glowBox(b, 0.16, 0.08, 0.01, 0xffe0a0, [0.12, mast + 0.24, 0.296]);
      // The jib: a triangular lattice out along +x, the counter-jib back along −x.
      const jy = mast + 0.2;
      for (const [y, z] of [
        [jy, -0.08],
        [jy, 0.08],
        [jy + 0.16, 0],
      ] as const)
        b.box(jib, 0.02, 0.02, yel, { at: [jib / 2, y, z] }, 0);
      for (let x = 0.1, k = 0; x < jib; x += 0.18, k++)
        b.box(
          0.012,
          0.2,
          0.012,
          yel,
          { at: [x, jy + 0.08, k % 2 ? 0.04 : -0.04], rot: [0, 0, k % 2 ? 0.6 : -0.6] },
          0,
        );
      const cj = jib * 0.32;
      b.box(cj, 0.04, 0.18, yel, { at: [-cj / 2, jy, 0] }, 0);
      b.box(0.3, 0.2, 0.22, 0x8a8a84, { at: [-cj + 0.15, jy - 0.06, 0] }, 0);
      // The tower head (a short A-frame) and its tie bars down to both jibs.
      const head = 0.32;
      b.box(0.04, head, 0.04, yel, { at: [0, jy + head / 2, 0] }, 0);
      for (const [len, sgn] of [
        [jib * 0.6, 1],
        [cj, -1],
      ] as const)
        b.box(
          Math.hypot(len, head - 0.14),
          0.012,
          0.012,
          0x6a6a64,
          {
            at: [(sgn * len) / 2, jy + (head + 0.14) / 2, 0],
            rot: [0, 0, -sgn * Math.atan2(head - 0.14, len)],
          },
          0,
        );
      // The trolley, the hook line, the hook block in yellow and black, a load of steel beams.
      const hx = jib * 0.62;
      const drop = 0.32;
      b.box(0.12, 0.05, 0.14, 0x3a3d42, { at: [hx, jy - 0.04, 0] }, 0);
      for (const dz of [-0.025, 0.025])
        b.box(0.008, drop, 0.008, 0x3a3d42, { at: [hx, jy - 0.06 - drop / 2, dz] }, 0);
      const hy = jy - 0.06 - drop;
      b.box(0.1, 0.1, 0.08, 0xd8b040, { at: [hx, hy - 0.04, 0] }, 0.01);
      for (const y of [-0.02, -0.06])
        b.box(0.102, 0.016, 0.082, 0x24262a, { at: [hx, hy + y, 0] }, 0);
      b.torus(0.03, 0.008, 0x3a3d42, { at: [hx, hy - 0.12, 0] }, Math.PI * 1.4);
      for (const [dx, dz] of [
        [-0.12, 0],
        [0.12, 0],
      ] as const)
        b.box(
          Math.hypot(dx, 0.14),
          0.006,
          0.006,
          0x3a3d42,
          {
            at: [hx + dx / 2, hy - 0.19, dz],
            rot: [0, 0, Math.atan2(0.14, dx)],
          },
          0,
        );
      for (const dz of [-0.03, 0.03])
        b.box(0.5, 0.04, 0.05, 0x7a4a3a, { at: [hx, hy - 0.28, dz] }, 0);
    }),
  );
}

/** A red light on the crane's jib or a mast (`blink` alive, `hot`): a dark housing, the lamp in the glow layer. */
export const redLight = looks([0.1, 0.1], 1, (b) => {
  b.cylinder(0.05, 0.05, 0.04, 0x24262a, { at: [0, 0.02, 0] }, 8);
  b.led(0.07, AVIATION, { at: [0, 0.09, 0] });
});

/** An air handling unit: a long grey box with access panels, a fan housing on top and a duct out of its back. */
export const airHandler = looks([1.5, 0.8], 1, (b) => {
  b.box(1.4, 0.06, 0.8, BLACK_STEEL, { at: [0, 0.03, 0] }, 0);
  b.box(1.36, 0.62, 0.74, 0xb4bac0, { at: [0, 0.37, 0] }, 0.02);
  for (let k = 0; k < 4; k++) {
    const x = -0.51 + k * 0.34;
    b.box(0.3, 0.5, 0.012, 0xa4aab0, { at: [x, 0.37, 0.372] }, 0);
    b.box(0.03, 0.08, 0.02, 0x3a3d42, { at: [x + 0.11, 0.37, 0.38] }, 0);
  }
  b.box(0.52, 0.2, 0.52, 0x9aa0a6, { at: [0.3, 0.78, 0] }, 0.02);
  b.cylinder(0.22, 0.22, 0.02, 0x24262a, { at: [0.3, 0.89, 0] }, 18);
  for (let a = 0; a < 3; a++)
    b.box(0.36, 0.008, 0.06, 0x5a5e64, { at: [0.3, 0.9, 0], rot: [0, (a * Math.PI) / 3, 0.2] }, 0);
  b.box(0.36, 0.3, 0.3, GALV, { at: [-0.4, 0.82, -0.2] }, 0.01);
  b.box(0.4, 0.06, 0.06, 0xe8c040, { at: [-0.4, 0.5, 0.39] }, 0);
});

/**
 * The corporate tower on the skyline, where the game ends up: dark blue
 * curtain wall with fins, a lit crown and lit floors, and its big glowing
 * logo `logoY` up its front. `w` × `d`, `h` high.
 */
export function corporateTower(w: number, d: number, h: number, logoY: number): SetPiece {
  return once(`corp:${w}:${d}:${h}:${logoY}`, () =>
    looks([w, d], 1, (b) => {
      const glass = 0x2e3c56;
      b.box(w, h, d, glass, { at: [0, h / 2, -d / 2] }, 0);
      windowGrid(
        b,
        front(0),
        -w / 2 + 0.06,
        w / 2 - 0.06,
        0.06,
        h - 0.3,
        [0.16, 0.22],
        0.4,
        51,
        0x1e2838,
      );
      for (let x = -w / 2; x <= w / 2 + 0.01; x += 0.32)
        b.box(0.03, h, 0.05, 0x5a6a82, { at: [x, h / 2, 0.02] }, 0);
      // Lit crown and a spire.
      glowBox(b, w + 0.02, 0.06, d + 0.02, 0x9ec8ff, [0, h - 0.1, -d / 2]);
      b.box(w * 0.7, 0.3, d * 0.7, glass, { at: [0, h + 0.15, -d / 2] }, 0);
      b.cylinder(0.02, 0.04, 1.2, GALV, { at: [0, h + 0.9, -d / 2] }, 6);
      // The logo: the name in lit letters on a dark panel, the mark just left of it.
      const { px, right } = corpLogo;
      const tw = textWidth('GIGACORP') * px;
      const tx = right - tw / 2;
      const ringX = right - tw - 0.17;
      b.box(
        tw + 0.5,
        px * 5 + 0.14,
        0.04,
        0x1a2234,
        { at: [right - (tw + 0.3) / 2, logoY, 0.04] },
        0,
      );
      letters(b, 'GIGACORP', tx, logoY, 0.065, px, 0x8ad8ff, true);
      b.add(
        new THREE.TorusGeometry(px * 2.2, px * 0.6, 8, 20),
        0x8ad8ff,
        {
          at: [ringX, logoY, 0.07],
        },
        'glow',
      );
    }),
  );
}

/**
 * The corporate tower's logo: its pixel size, and where its right end is
 * (from the tower's middle); the GIGACORP mark runs left from there.
 */
export const corpLogo = { px: 0.042, right: 0.75 } as const;

// ---- The street far below ----

/** A car on the street far below, seen from the roof: tiny, lit fore and aft. Along x. */
export const tinyCar = looks([0.6, 0.3], 5, (b, v) => {
  const paint = nth([0x6a7078, 0x8a3a34, 0xd8d6d0, 0x2e3440, 0x4a6a8a], v);
  b.box(0.56, 0.08, 0.26, paint, { at: [0, 0.07, 0] }, 0.02);
  b.box(0.3, 0.07, 0.22, tint(paint, -0.1), { at: [-0.03, 0.14, 0] }, 0.02);
  b.box(0.26, 0.05, 0.2, 0x2a3240, { at: [-0.03, 0.155, 0] }, 0);
  for (const s of [-1, 1]) {
    glowBox(b, 0.012, 0.03, 0.05, 0xfff0c8, [0.28, 0.07, s * 0.08]);
    glowBox(b, 0.012, 0.03, 0.05, 0xff3a2a, [-0.28, 0.07, s * 0.08]);
  }
  // Headlight beams on the tarmac ahead.
  b.box(0.3, 0.003, 0.22, 0x8a8470, { at: [0.45, 0.004, 0] }, 0);
});

/** A street lamp seen from the roof: a thin pole, its head lit, a pool of light on the pavement. */
export const tinyLamp = looks([0.2, 0.2], 1, (b) => {
  b.cylinder(0.12, 0.12, 0.004, 0x7a7466, { at: [0, 0.004, 0.04] }, 14);
  b.box(0.012, 0.22, 0.012, 0x24262a, { at: [0, 0.11, 0] }, 0);
  b.box(0.012, 0.012, 0.06, 0x24262a, { at: [0, 0.22, 0.03] }, 0);
  glowBox(b, 0.03, 0.012, 0.04, 0xffd8a0, [0, 0.21, 0.06]);
});

/** A little street tree in a pit, seen from above: a round head. */
export const tinyTree = looks([0.3, 0.3], 2, (b, v) => {
  b.box(0.1, 0.004, 0.1, 0x3a3630, { at: [0, 0.004, 0] }, 0);
  b.sphere(0.12, v ? 0x4a5a40 : 0x52623e, { at: [0, 0.2, 0] }, [1, 0.8, 1]);
});

// ---- The roof's edge ----

/** The parapet: how high its wall stands, and how high the glass balustrade reaches. */
export const PARAPET = { wall: 0.2, glass: 0.44, depth: 0.16 } as const;

/**
 * A parapet run `len` long along +x from x = 0: a rendered upstand with a
 * steel coping and a lip, and on it a low glass balustrade between black
 * posts with a top rail (left out when `glass` is false).
 */
export function parapet(len: number, glass = true): SetPiece {
  return once(`parapet:${len.toFixed(2)}:${glass}`, () =>
    looks([len, PARAPET.depth], 1, (b) => {
      const w = PARAPET.wall;
      const d = PARAPET.depth;
      b.box(len, w, d, tint(RENDER, -0.08), { at: [len / 2, w / 2, 0] }, 0);
      b.box(len, 0.014, 0.008, tint(RENDER, -0.25), { at: [len / 2, 0.06, d / 2 + 0.002] }, 0);
      b.box(len, 0.03, d + 0.06, 0x8c9298, { at: [len / 2, w + 0.015, 0] }, 0);
      b.box(len, 0.04, 0.012, 0x7a8086, { at: [len / 2, w - 0.005, d / 2 + 0.03] }, 0);
      for (let x = 1; x < len - 0.05; x += 1)
        b.box(0.012, 0.034, d + 0.065, 0x6e747a, { at: [x, w + 0.017, 0] }, 0);
      if (!glass) return;
      const top = PARAPET.glass;
      const gh = top - w - 0.04;
      b.pane(len, gh, 0.016, 0xbcd8e6, { at: [len / 2, w + 0.03 + gh / 2, 0] });
      for (let x = 0.02; x <= len; x += Math.max(0.5, len / Math.round(len / 0.9)))
        b.box(
          0.03,
          top - w,
          0.03,
          BLACK_STEEL,
          { at: [Math.min(x, len - 0.02), (top + w) / 2, 0] },
          0,
        );
      b.box(len, 0.03, 0.05, BLACK_STEEL, { at: [len / 2, top, 0] }, 0);
    }),
  );
}

// ---- The terrace ----

/** A long timber planter, a black steel lip. Fill it with `grasses`. */
export const planterBox = looks([1, 0.4], 2, (b, v) => {
  const wood = v ? TIMBER : TIMBER_DARK;
  b.box(0.96, 0.32, 0.36, wood, { at: [0, 0.16, 0] }, 0.01);
  for (let y = 0.06; y < 0.32; y += 0.08)
    b.box(0.97, 0.012, 0.37, tint(wood, -0.18), { at: [0, y, 0] }, 0);
  b.box(0.98, 0.025, 0.38, BLACK_STEEL, { at: [0, 0.32, 0] }, 0);
  b.box(0.9, 0.02, 0.3, 0x3e3428, { at: [0, 0.31, 0] }, 0);
});

/** The turn (as x, y, z Euler angles) that leans something upright by `tilt` toward the heading `around` (0 is +z). */
function leaning(around: number, tilt: number): [number, number, number] {
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(tilt, around, 0, 'YXZ'));
  const e = new THREE.Euler().setFromQuaternion(q, 'XYZ');
  return [e.x, e.y, e.z];
}

/**
 * Ornamental grasses in a planter (`sway` alive): tall, slim fountain-grass
 * tufts, each a fan of thin blades springing from one point and arching out,
 * the tips gone to straw. No mound at the foot: just blades.
 */
export const grasses = looks([1, 0.4], 3, (b, v) => {
  const tufts = 4 + (v % 2);
  for (let t = 0; t < tufts; t++) {
    const tx = -0.36 + ((t + 0.5) / tufts) * 0.72 + (hash01(t, v, 2) - 0.5) * 0.08;
    const tz = (hash01(t, v, 8) - 0.5) * 0.1;
    const blades = 8 + Math.floor(hash01(t, v, 9) * 4);
    const tall = 0.35 + hash01(t, v, 10) * 0.2;
    const green = nth(GRASS, t + v);
    for (let k = 0; k < blades; k++) {
      // Fanned evenly round the tuft, each its own lean and height.
      const around = (k / blades) * Math.PI * 2 + hash01(k, t + v * 5, 3) * 0.6;
      const lean = 0.18 + hash01(k, t + v * 5, 4) * 0.32;
      const h = tall * (0.75 + hash01(k, t + v * 5, 5) * 0.3);
      const dir: [number, number] = [Math.sin(around), Math.cos(around)];
      // Two segments: the lower part of the blade green, the arching tip straw.
      let foot: [number, number, number] = [tx, 0, tz];
      const seg = (len: number, tilt: number, color: number, w: number) => {
        const up: [number, number, number] = [
          dir[0] * Math.sin(tilt),
          Math.cos(tilt),
          dir[1] * Math.sin(tilt),
        ];
        b.box(
          w,
          len,
          0.01,
          color,
          {
            at: [
              foot[0] + (up[0] * len) / 2,
              foot[1] + (up[1] * len) / 2,
              foot[2] + (up[2] * len) / 2,
            ],
            rot: leaning(around, tilt),
          },
          0,
        );
        foot = [foot[0] + up[0] * len, foot[1] + up[1] * len, foot[2] + up[2] * len];
      };
      seg(h * 0.7, lean, green, 0.036);
      seg(h * 0.3, lean * 1.9, STRAW, 0.026);
    }
  }
});

/** A big round planter with a small multi-stem tree: for the light well's sunken terrace. */
export const planterTree = looks([0.8, 0.8], 1, (b) => {
  b.cylinder(0.36, 0.32, 0.36, 0x6e6a64, { at: [0, 0.18, 0] }, 20);
  b.cylinder(0.33, 0.33, 0.02, 0x3e3428, { at: [0, 0.36, 0] }, 20);
  for (const [x, z, r] of [
    [0.04, 0, 0.1],
    [-0.06, 0.04, -0.15],
    [0.02, -0.06, 0.05],
  ] as const)
    b.cylinder(0.018, 0.025, 0.7, 0x8a8478, { at: [x, 0.7, z], rot: [r, 0, r * 1.5] }, 6);
  for (const [x, y, z, r, c] of [
    [0, 1.12, 0, 0.3, 0x5f8a4a],
    [0.18, 1.0, 0.1, 0.22, 0x6c9652],
    [-0.16, 1.02, -0.06, 0.22, 0x527e3e],
    [0.05, 1.3, -0.05, 0.18, 0x6c9652],
  ] as const)
    b.sphere(r, c, { at: [x, y, z] }, [1, 0.85, 1]);
});

/** An outdoor bean bag, slumped: one of the muted fabric colours. */
export const beanBag = looks([0.6, 0.6], FABRIC.length, (b, v) => {
  const c = nth(FABRIC, v);
  b.sphere(0.3, c, { at: [0, 0.16, 0] }, [1, 0.55, 1]);
  b.sphere(0.2, tint(c, 0.06), { at: [0, 0.3, -0.12] }, [1.2, 0.8, 0.7]);
  b.box(0.12, 0.012, 0.012, tint(c, -0.3), { at: [0.12, 0.2, 0.22], rot: [0, 0.6, 0] }, 0);
});

/** A ping-pong table, an outdoor one in slate blue, two bats and a ball on it. */
export const pingPong = looks([1.3, 0.75], 1, (b) => {
  const top = 0x3a5a6e;
  b.box(1.3, 0.04, 0.72, top, { at: [0, 0.42, 0] }, 0.01);
  b.box(1.3, 0.006, 0.02, 0xe8e8e0, { at: [0, 0.443, 0.35] }, 0);
  b.box(1.3, 0.006, 0.02, 0xe8e8e0, { at: [0, 0.443, -0.35] }, 0);
  for (const s of [-1, 1]) b.box(0.02, 0.006, 0.72, 0xe8e8e0, { at: [s * 0.64, 0.443, 0] }, 0);
  b.box(1.26, 0.006, 0.01, 0xe8e8e0, { at: [0, 0.443, 0] }, 0);
  b.box(0.02, 0.1, 0.8, 0x2a2d32, { at: [0, 0.49, 0] }, 0);
  b.box(0.008, 0.08, 0.78, 0xd8d8d0, { at: [0, 0.5, 0] }, 0);
  for (const sx of [-1, 1]) {
    b.box(0.06, 0.4, 0.06, BLACK_STEEL, { at: [sx * 0.5, 0.2, 0] }, 0);
    b.box(0.05, 0.05, 0.6, BLACK_STEEL, { at: [sx * 0.5, 0.04, 0] }, 0);
  }
  b.cylinder(0.07, 0.07, 0.012, 0xb03a30, { at: [-0.4, 0.45, 0.12] }, 14);
  b.box(0.03, 0.012, 0.08, TIMBER, { at: [-0.4, 0.45, 0.22] }, 0);
  b.cylinder(0.07, 0.07, 0.012, 0x2a2a2a, { at: [0.36, 0.45, -0.16] }, 14);
  b.box(0.08, 0.012, 0.03, TIMBER, { at: [0.46, 0.45, -0.16] }, 0);
  b.sphere(0.018, 0xf4f0e8, { at: [0.2, 0.46, 0.1] });
});

/** A hammock on a black steel stand, a striped sling, a laptop left in it. Along x. */
export const hammock = looks([1.5, 0.6], 1, (b) => {
  for (const s of [-1, 1]) {
    b.box(0.05, 0.05, 0.5, BLACK_STEEL, { at: [s * 0.7, 0.025, 0] }, 0);
    b.box(0.04, 0.75, 0.04, BLACK_STEEL, { at: [s * 0.62, 0.37, 0], rot: [0, 0, s * 0.35] }, 0);
  }
  b.box(1.3, 0.04, 0.06, BLACK_STEEL, { at: [0, 0.025, 0] }, 0);
  // The sling: a sagging chain of striped slats.
  const n = 10;
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const x = -0.5 + t;
    const y = 0.68 - 0.36 * 4 * t * (1 - t);
    const slope = -0.36 * 4 * (1 - 2 * t);
    b.box(
      0.11,
      0.02,
      0.4,
      i % 2 ? 0xc8b48a : 0x6a7a8a,
      { at: [x, y, 0], rot: [0, 0, Math.atan(slope)] },
      0,
    );
  }
  b.box(0.2, 0.012, 0.14, 0x9aa0a8, { at: [0.05, 0.36, 0.02], rot: [0, 0.3, 0] }, 0);
  b.box(0.2, 0.12, 0.01, 0x9aa0a8, { at: [0.03, 0.42, -0.04], rot: [-0.3, 0.3, 0] }, 0);
});

/**
 * E-scooters parked in echelon at a black steel charging dock, two or three
 * along x: each side-on enough that its deck, its two wheels, the stem and
 * the handlebar read from above, the front wheel in the dock.
 */
export const scooterRack = looks([1.2, 0.5], 2, (b, v) => {
  // The dock: a low rail along the back with a charging post at each end.
  b.box(1.2, 0.05, 0.08, BLACK_STEEL, { at: [0, 0.025, -0.2] }, 0);
  b.box(1.2, 0.04, 0.03, BLACK_STEEL, { at: [0, 0.18, -0.22] }, 0);
  for (const x of [-0.58, 0.58]) {
    b.box(0.06, 0.26, 0.06, BLACK_STEEL, { at: [x, 0.13, -0.22] }, 0);
    glowBox(b, 0.03, 0.02, 0.01, 0x8af0a8, [x, 0.22, -0.186]);
  }
  const n = 2 + v;
  const yaw = 0.5;
  const c = Math.cos(yaw);
  const sn = Math.sin(yaw);
  for (let i = 0; i < n; i++) {
    const ox = -0.38 + (i * 0.76) / Math.max(1, n - 1);
    const oz = 0.02;
    const psi = yaw + (hash01(i, v, 3) - 0.5) * 0.12;
    /** A point u along the deck (+u to the front), y up, w across. */
    const at = (u: number, y: number, w: number): [number, number, number] => [
      ox + u * c + w * sn,
      y,
      oz - u * sn + w * c,
    ];
    const paint = nth([0x3fa08a, 0xe8e6e0, 0x7a5ab0], i + v);
    // Deck in the scooter's colour with a strip of grip tape, the two wheels, the rear fender.
    b.box(0.48, 0.04, 0.13, paint, { at: at(0, 0.075, 0), rot: [0, psi, 0] }, 0.01);
    b.box(0.34, 0.006, 0.07, 0x1a1c20, { at: at(-0.03, 0.097, 0), rot: [0, psi, 0] }, 0);
    for (const u of [-0.24, 0.24]) {
      b.cylinder(
        0.065,
        0.065,
        0.04,
        0x1a1c20,
        {
          at: at(u, 0.055, 0),
          rot: [0, psi + Math.PI / 2, Math.PI / 2],
        },
        12,
      );
      b.cylinder(
        0.025,
        0.025,
        0.04,
        0x8a9096,
        {
          at: at(u, 0.055, 0),
          rot: [0, psi + Math.PI / 2, Math.PI / 2],
        },
        8,
      );
    }
    b.box(0.12, 0.018, 0.08, paint, { at: at(-0.25, 0.115, 0), rot: [0, psi, 0.25] }, 0);
    // The stem, raked back a little, in the scooter's colour; the handlebar across, black grips.
    const lean = 0.18;
    const sh = 0.56;
    const top: [number, number] = [0.24 - Math.sin(lean) * sh, 0.06 + Math.cos(lean) * sh];
    b.box(
      0.035,
      sh,
      0.035,
      paint,
      {
        at: at(0.24 - (Math.sin(lean) * sh) / 2, 0.06 + (Math.cos(lean) * sh) / 2, 0),
        rot: [0, psi, lean],
      },
      0,
    );
    b.box(0.035, 0.035, 0.36, 0x2a2d32, { at: at(top[0], top[1], 0), rot: [0, psi, 0] }, 0);
    for (const w of [-0.15, 0.15])
      b.box(0.04, 0.04, 0.07, 0x16181c, { at: at(top[0], top[1], w), rot: [0, psi, 0] }, 0);
    glowBox(b, 0.02, 0.03, 0.04, 0xfff0c8, at(0.23, 0.3, 0), [0, psi, 0]);
  }
});

/** String lights between two black steel posts `span` apart along x (from x = 0), sagging, warm bulbs. */
export function stringLights(span: number, high = 1.5): SetPiece {
  return once(`lights:${span.toFixed(2)}:${high}`, () =>
    looks([span, 0.2], 1, (b) => {
      for (const x of [0, span]) {
        b.box(0.04, high, 0.04, BLACK_STEEL, { at: [x, high / 2, 0] }, 0);
        b.box(0.18, 0.08, 0.18, 0x4a4e54, { at: [x, 0.04, 0] }, 0);
      }
      const sag = Math.min(0.3, span * 0.08);
      const n = Math.max(4, Math.round(span / 0.2));
      const yAt = (t: number) => high - 0.04 - sag * 4 * t * (1 - t);
      for (let i = 0; i < n; i++) {
        const t0 = i / n;
        const t1 = (i + 1) / n;
        const y0 = yAt(t0);
        const y1 = yAt(t1);
        const dx = span / n;
        b.box(
          Math.hypot(dx, y1 - y0) + 0.004,
          0.008,
          0.008,
          0x1e2024,
          {
            at: [((t0 + t1) * span) / 2, (y0 + y1) / 2, 0],
            rot: [0, 0, Math.atan2(y1 - y0, dx)],
          },
          0,
        );
        if (i > 0) b.led(0.04, 0xffc070, { at: [t0 * span, y0 - 0.045, 0] });
      }
    }),
  );
}

/** The "WE RAISED!" balloons (`bob` alive): a foil bunch on ribbons, tied at their foot (on a rail). */
export const balloons = looks([0.6, 0.6], 1, (b) => {
  const cols = [0xd8b860, 0xc8ccd4, 0xa880d8, 0xd8b860, 0xe0a0b8, 0xc8ccd4] as const;
  const at: readonly [number, number, number][] = [
    [0, 1.25, 0],
    [0.2, 1.12, 0.06],
    [-0.18, 1.1, -0.04],
    [0.08, 1.42, -0.1],
    [-0.1, 1.38, 0.1],
    [0.24, 1.36, -0.02],
  ];
  at.forEach(([x, y, z], i) => {
    b.sphere(0.13, nth(cols, i), { at: [x, y, z] }, [1, 1.15, 0.9]);
    b.cone(0.025, 0.04, nth(cols, i), { at: [x, y - 0.16, z], rot: [Math.PI, 0, 0] }, 6);
    const len = Math.hypot(x, y - 0.18, z);
    b.box(
      0.006,
      len,
      0.006,
      0xe8e4dc,
      {
        at: [x / 2, (y - 0.18) / 2 + 0.02, z / 2],
        rot: [Math.atan2(z, y), 0, -Math.atan2(x, y)],
      },
      0,
    );
  });
  // One already sagging low on its ribbon: the round closed last week.
  b.sphere(0.11, 0xa880d8, { at: [-0.28, 0.6, 0.05] }, [1, 0.9, 0.9]);
  b.box(0.006, 0.55, 0.006, 0xe8e4dc, { at: [-0.14, 0.32, 0.02], rot: [0, 0, 0.5] }, 0);
});

/** A "WE RAISED!" banner tied along a rail, `len` long along x: white cloth, violet letters. */
export function raisedBanner(len: number): SetPiece {
  return once(`banner:${len.toFixed(2)}`, () =>
    looks([len, 0.1], 1, (b) => {
      b.box(len, 0.22, 0.012, 0xeeeae2, { at: [0, 0.11, 0] }, 0);
      letters(b, 'WE RAISED!', 0, 0.11, 0.006, Math.min(0.03, len / 42), 0x6a3aa8, false, 0.005);
      for (const s of [-1, 1])
        b.box(0.03, 0.03, 0.03, 0xd8d0c0, { at: [(s * len) / 2, 0.21, 0] }, 0);
    }),
  );
}

// ---- The plant deck ----

/** An HVAC condenser unit on rails: white-grey case, one or two fans in grilles on top, pipes. */
export const condenser = looks([1, 0.6], 2, (b, v) => {
  const w = v ? 1.0 : 0.62;
  b.box(w + 0.1, 0.05, 0.08, BLACK_STEEL, { at: [0, 0.025, -0.2] }, 0);
  b.box(w + 0.1, 0.05, 0.08, BLACK_STEEL, { at: [0, 0.025, 0.2] }, 0);
  b.box(w, 0.5, 0.56, 0xc8ccd0, { at: [0, 0.3, 0] }, 0.02);
  for (let y = 0.12; y < 0.5; y += 0.05)
    b.box(w - 0.06, 0.012, 0.01, 0x8e949a, { at: [0, y, 0.283] }, 0);
  const fans = v ? 2 : 1;
  for (let k = 0; k < fans; k++) {
    const x = fans === 1 ? 0 : (k - 0.5) * 0.48;
    b.cylinder(0.22, 0.22, 0.03, 0x24262a, { at: [x, 0.56, 0] }, 20);
    for (let a = 0; a < 3; a++)
      b.box(
        0.36,
        0.008,
        0.07,
        0x5a5e64,
        { at: [x, 0.578, 0], rot: [0, (a * Math.PI) / 3 + k, 0.2] },
        0,
      );
    b.torus(0.22, 0.012, 0x9aa0a6, { at: [x, 0.58, 0], rot: [Math.PI / 2, 0, 0] });
    b.box(0.44, 0.008, 0.008, 0x9aa0a6, { at: [x, 0.585, 0] }, 0);
    b.box(0.008, 0.008, 0.44, 0x9aa0a6, { at: [x, 0.585, 0] }, 0);
  }
  b.cylinder(0.025, 0.025, 0.3, 0x9a7a4a, { at: [w / 2 + 0.04, 0.2, 0.1], rot: [0, 0, 0] }, 8);
  b.cylinder(0.03, 0.03, 0.3, 0x2a2a2a, { at: [w / 2 + 0.04, 0.2, -0.05] }, 8);
});

/** A galvanised duct run `len` long along +x from x = 0, on stands, flanged, turning down at its end. */
export function ductRun(len: number): SetPiece {
  return once(`duct:${len.toFixed(2)}`, () =>
    looks([len, 0.4], 1, (b) => {
      const y = 0.32;
      b.box(len, 0.24, 0.3, GALV, { at: [len / 2, y, 0] }, 0.01);
      for (let x = 0.4; x < len; x += 0.55) {
        b.box(0.03, 0.27, 0.33, tint(GALV, -0.15), { at: [x, y, 0] }, 0);
        b.box(0.04, y - 0.12, 0.04, BLACK_STEEL, { at: [x, (y - 0.12) / 2, 0] }, 0);
        b.box(0.12, 0.02, 0.2, BLACK_STEEL, { at: [x, 0.01, 0] }, 0);
      }
      b.box(0.3, 0.3, 0.3, GALV, { at: [len - 0.15, 0.15, 0] }, 0.01);
      b.box(0.34, 0.06, 0.34, tint(GALV, -0.2), { at: [len - 0.15, 0.03, 0] }, 0);
    }),
  );
}

/** A pair of solar panels on a tilted black frame, facing +z: deep blue cells in a lighter grid. */
export const solarPanels = looks([1.2, 0.8], 2, (b, v) => {
  const tilt = 0.5;
  const cell = v ? 0x24345a : 0x2a3a62;
  for (const sx of [-0.55, 0.55]) {
    b.box(0.04, 0.2, 0.04, BLACK_STEEL, { at: [sx, 0.1, 0.25] }, 0);
    b.box(0.04, 0.5, 0.04, BLACK_STEEL, { at: [sx, 0.25, -0.25] }, 0);
    b.box(0.05, 0.05, 0.7, BLACK_STEEL, { at: [sx, 0.025, 0] }, 0);
  }
  for (const k of [-0.29, 0.29]) {
    b.box(0.56, 0.03, 0.72, 0xb8bcc2, { at: [k, 0.34, 0], rot: [tilt, 0, 0] }, 0);
    b.box(0.52, 0.012, 0.68, cell, { at: [k, 0.357, 0.008], rot: [tilt, 0, 0] }, 0);
    for (let j = -2; j <= 2; j++)
      b.box(
        0.52,
        0.004,
        0.006,
        0x5a6a8a,
        {
          at: [k, 0.364 + Math.sin(tilt) * j * 0.12 * -1, Math.cos(tilt) * j * 0.12 + 0.008],
          rot: [tilt, 0, 0],
        },
        0,
      );
    b.box(0.006, 0.004, 0.66, 0x5a6a8a, { at: [k, 0.365, 0.008], rot: [tilt, 0, 0] }, 0);
  }
});

/**
 * A satellite dish on a post: the uplink shipped work goes out on. The bowl
 * faces up and toward −z (turn the piece to aim it), tilted 35° off the
 * vertical, so from above you look into it: a pale bowl with a darker inside,
 * a rim, the feed arm out of its middle to the LNB.
 */
export const satDish = looks([0.8, 0.8], 1, (b) => {
  b.box(0.5, 0.05, 0.5, BLACK_STEEL, { at: [0, 0.025, 0] }, 0);
  for (const [x, z] of [
    [-0.2, -0.2],
    [0.2, 0.2],
  ] as const)
    b.box(0.12, 0.08, 0.12, 0x8e8c86, { at: [x, 0.09, z] }, 0);
  b.cylinder(0.04, 0.05, 0.42, GALV, { at: [0, 0.23, 0] }, 10);
  // The bowl's middle, and its aim: 35° off straight up, toward −z.
  const tilt = (35 * Math.PI) / 180;
  const c: [number, number, number] = [0, 0.5, 0];
  const axis: [number, number, number] = [0, Math.cos(tilt), -Math.sin(tilt)];
  const rot: [number, number, number] = [-tilt, 0, 0];
  const r = 0.36;
  const deep = 0.12;
  /** A point `along` the aim from the bowl's middle. */
  const out = (along: number): [number, number, number] => [
    c[0] + axis[0] * along,
    c[1] + axis[1] * along,
    c[2] + axis[2] * along,
  ];
  // The inside: a cap turned to a bowl, its faces wound to show from above.
  const inside = new THREE.SphereGeometry(1, 22, 8, 0, Math.PI * 2, 0, 0.9);
  inside.scale(r / Math.sin(0.9), -deep / (1 - Math.cos(0.9)), r / Math.sin(0.9));
  inside.translate(0, deep / (1 - Math.cos(0.9)), 0);
  inside.computeVertexNormals();
  b.add(inside, 0xc8ccd0, { at: c, rot });
  // The back of the bowl, seen from below and the side.
  const back = new THREE.SphereGeometry(1, 22, 8, 0, Math.PI * 2, Math.PI - 0.9, 0.9);
  back.scale(r / Math.sin(0.9), deep / (1 - Math.cos(0.9)), r / Math.sin(0.9));
  back.translate(0, deep / (1 - Math.cos(0.9)) - 0.004, 0);
  b.add(back, 0xa8acb0, { at: c, rot });
  b.torus(r, 0.014, 0xeceae4, { at: out(deep), rot: [-Math.PI / 2 - tilt, 0, 0] });
  // The bracket at the back, the feed arm out to the LNB.
  b.box(0.12, 0.08, 0.12, 0x6e747a, { at: out(-0.03), rot }, 0);
  b.box(0.018, 0.34, 0.018, GALV, { at: out(0.17), rot }, 0);
  b.box(0.06, 0.08, 0.06, 0x3a3d42, { at: out(0.36), rot }, 0);
  b.led(0.015, 0x5cf08a, { at: out(0.41) });
});

/**
 * The antenna mast: a galvanised lattice `h` high on a ballast frame, panel
 * antennas and a dish up it, guy wires. The flag and its red light are
 * their own living pieces (`mastFlag`, `redLight`).
 */
export function antennaMast(h: number): SetPiece {
  return once(`mast:${h}`, () =>
    looks([0.8, 0.8], 1, (b) => {
      const s = 0.16;
      b.box(0.7, 0.06, 0.7, BLACK_STEEL, { at: [0, 0.03, 0] }, 0);
      for (const [x, z] of [
        [-0.28, -0.28],
        [0.28, -0.28],
        [-0.28, 0.28],
        [0.28, 0.28],
      ] as const)
        b.box(0.14, 0.1, 0.14, 0x8e8c86, { at: [x, 0.11, z] }, 0);
      const legs: readonly [number, number][] = [
        [-s / 2, -s / 3],
        [s / 2, -s / 3],
        [0, s * 0.6],
      ];
      for (const [x, z] of legs) b.box(0.02, h, 0.02, GALV, { at: [x, h / 2, z] }, 0);
      for (let y = 0.15, k = 0; y < h - 0.1; y += 0.2, k++)
        b.box(
          0.01,
          0.26,
          0.01,
          GALV,
          { at: [0, y + 0.1, -s / 3], rot: [0, 0, k % 2 ? 0.7 : -0.7] },
          0,
        );
      // Panel antennas round the top, a small dish lower down.
      for (const a of [0, 2.1, 4.2])
        b.box(
          0.08,
          0.36,
          0.03,
          0xe0e0dc,
          {
            at: [Math.sin(a) * 0.12, h - 0.3, Math.cos(a) * 0.12],
            rot: [0, a, 0],
          },
          0.01,
        );
      b.cylinder(
        0.12,
        0.05,
        0.05,
        0xe0e0dc,
        { at: [0.12, h * 0.55, 0.06], rot: [1.2, 0, -0.3] },
        14,
      );
      // Guy wires to the frame's corners.
      for (const [x, z] of [
        [-0.32, -0.32],
        [0.32, -0.32],
        [0, 0.34],
      ] as const) {
        const top = h * 0.6;
        const len = Math.hypot(x, top, z);
        b.box(
          0.006,
          len,
          0.006,
          0x8a8e94,
          {
            at: [x / 2, top / 2 + 0.06, z / 2],
            rot: [Math.atan2(z, top) * -1 * -1, 0, -Math.atan2(x, top)],
          },
          0,
        );
      }
      b.box(0.012, 0.3, 0.012, GALV, { at: [0, h + 0.15, 0] }, 0);
    }),
  );
}

/** The startup's flag on the mast (`sway` alive), its foot at the pole: violet with the white orbit. */
export const mastFlag = looks([0.5, 0.1], 1, (b) => {
  b.box(0.42, 0.26, 0.008, 0x5a3a8a, { at: [0.22, 0.13, 0] }, 0);
  b.torus(0.07, 0.012, 0xe8e4f0, { at: [0.2, 0.13, 0.006] });
  b.sphere(0.03, 0xe8e4f0, { at: [0.2, 0.13, 0.006] });
});

/**
 * An outdoor rack cabinet on a plinth: louvred grey doors, one ajar with
 * rows of lit servers inside, a status strip; shipped work goes out here.
 */
export const rackCabinet = looks([0.7, 0.6], 1, (b) => {
  b.box(0.7, 0.08, 0.6, 0x6a6e74, { at: [0, 0.04, 0] }, 0);
  b.box(0.64, 1.0, 0.54, 0x7a8088, { at: [0, 0.58, 0] }, 0.02);
  b.box(0.7, 0.05, 0.6, 0x5a5e64, { at: [0, 1.1, 0] }, 0.01);
  // The left door shut, louvred; the right one ajar on the lit servers.
  b.box(0.3, 0.92, 0.02, 0x8a9098, { at: [-0.16, 0.58, 0.28] }, 0);
  for (let y = 0.2; y < 1.0; y += 0.06)
    b.box(0.24, 0.012, 0.012, 0x5a6068, { at: [-0.16, y + 0.08, 0.295] }, 0);
  b.box(0.29, 0.9, 0.24, 0x1c1e24, { at: [0.15, 0.58, 0.16] }, 0);
  for (let r = 0; r < 8; r++) {
    const y = 0.2 + r * 0.1;
    b.box(0.26, 0.07, 0.01, 0x2e3440, { at: [0.15, y, 0.285] }, 0);
    for (let k = 0; k < 3; k++)
      b.led(0.012, (r + k) % 4 === 0 ? 0xffc04a : (r + k) % 4 === 2 ? 0x7ab8ff : 0x5cf08a, {
        at: [0.06 + k * 0.04, y, 0.292],
      });
  }
  b.box(0.3, 0.9, 0.02, 0x8a9098, { at: [0.4, 0.58, 0.42], rot: [0, -1.2, 0] }, 0);
  glowBox(b, 0.5, 0.02, 0.01, 0x5cf08a, [0, 1.06, 0.276]);
});

/** A status LED on the rack (`blink` alive, `hot`): a dark bezel, the bright green strip in the glow layer. */
export const statusLed = looks([0.1, 0.1], 1, (b) => {
  b.box(0.14, 0.06, 0.02, 0x1c1e24, { at: [0, 0.025, -0.01] }, 0);
  glowBox(b, 0.12, 0.05, 0.03, 0x7cff9a, [0, 0.025, 0]);
});

/**
 * A galvanised ladder cable tray `len` long along +x from x = 0, on low
 * stands, a fat yellow and a black cable in it (the uplink's feed). Under
 * 0.15 high, so it can run along the front of the roof.
 */
export function cableTray(len: number): SetPiece {
  return once(`tray:${len.toFixed(2)}`, () =>
    looks([len, 0.24], 1, (b) => {
      const y = 0.09;
      const w = 0.2;
      const tray = 0xa3aaaf;
      for (const z of [-w / 2, w / 2]) b.box(len, 0.045, 0.014, tray, { at: [len / 2, y, z] }, 0);
      for (let x = 0.08; x < len; x += 0.16)
        b.box(0.02, 0.01, w, tint(tray, -0.12), { at: [x, y - 0.016, 0] }, 0);
      for (let x = 0.3; x < len; x += 0.8) {
        b.box(0.03, y - 0.02, 0.03, BLACK_STEEL, { at: [x, (y - 0.02) / 2, 0] }, 0);
        b.box(0.14, 0.012, w + 0.04, BLACK_STEEL, { at: [x, y - 0.026, 0] }, 0);
      }
      b.cylinder(
        0.026,
        0.026,
        len,
        0xd8b040,
        { at: [len / 2, y + 0.005, -0.04], rot: [0, 0, Math.PI / 2] },
        8,
      );
      b.cylinder(
        0.022,
        0.022,
        len,
        0x1e2024,
        { at: [len / 2, y + 0.002, 0.03], rot: [0, 0, Math.PI / 2] },
        8,
      );
      b.cylinder(
        0.014,
        0.014,
        len,
        0x3a6aa8,
        { at: [len / 2, y + 0.0, 0.075], rot: [0, 0, Math.PI / 2] },
        6,
      );
    }),
  );
}

/** A roof access hatch: a raised kerb, a lid propped shut, hazard stripes, a grab hoop. */
export const roofHatch = looks([0.8, 0.8], 1, (b) => {
  b.box(0.76, 0.18, 0.76, 0x9a9890, { at: [0, 0.09, 0] }, 0.01);
  b.box(0.8, 0.05, 0.8, 0x6e747a, { at: [0, 0.205, 0] }, 0.01);
  for (let k = -3; k <= 3; k++)
    b.box(
      0.06,
      0.004,
      0.18,
      k % 2 ? 0x2a2a2a : 0xd8b040,
      {
        at: [k * 0.1, 0.232, 0.28],
        rot: [0, 0.6, 0],
      },
      0,
    );
  b.torus(0.12, 0.014, 0xd8b040, { at: [0.3, 0.32, 0], rot: [0, Math.PI / 2, 0] }, Math.PI);
});

/** A mushroom vent: a galvanised stub and cap. */
export const mushroomVent = looks([0.3, 0.3], 1, (b) => {
  b.cylinder(0.06, 0.07, 0.24, GALV, { at: [0, 0.12, 0] }, 10);
  b.cylinder(0.14, 0.1, 0.06, GALV, { at: [0, 0.27, 0] }, 12);
});

/** A server blade, carried at chest height by the sysadmin. */
export const serverBlade = looks([0.5, 0.3], 1, (b) => {
  b.box(0.44, 0.07, 0.3, 0x2a2e36, { at: [0, 0, 0] }, 0.01);
  b.box(0.42, 0.05, 0.005, 0x4a5262, { at: [0, 0, 0.152] }, 0);
  b.led(0.01, 0x5cf08a, { at: [-0.15, 0, 0.156] });
  b.led(0.01, 0xffc04a, { at: [-0.12, 0, 0.156] });
});

// ---- The light well ----

/** Euler angles (x, y, z) in `order`, as the x, y, z order the kit takes. */
function inOrder(
  angles: [number, number, number],
  order: THREE.EulerOrder,
): [number, number, number] {
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(...angles, order));
  const e = new THREE.Euler().setFromQuaternion(q, 'XYZ');
  return [e.x, e.y, e.z];
}

/**
 * One tile of the skylight over the light well: a pitched glass roof light
 * (pale blue panes with a sheen on both slopes, thin straight black glazing
 * bars) over the floor below, lit warm and glowing up through it, the office
 * on it seen from above: a birch desk, its screen, a chair. A rendered kerb
 * along every side in `kerbs` (bits: 1 back, 2 right, 4 front, 8 left).
 */
export function skylightTile(kerbs: number): SetPiece {
  return once(`skylight:${kerbs}`, () =>
    looks([1, 1], 3, (b, v) => {
      // The floor below, lit warm. (Its top over the roof membrane the scene lays under everything.)
      glowBox(b, 1, 0.01, 1, 0xe8c890, [0, 0.04, 0]);
      const flip = v % 2 ? 1 : -1;
      const dz = v === 2 ? 0.3 : 0;
      b.box(0.44, 0.03, 0.22, 0xb8a888, { at: [flip * 0.14, 0.06, -0.18 + dz] }, 0);
      b.box(0.2, 0.012, 0.03, 0x2a2d32, { at: [flip * 0.14, 0.08, -0.25 + dz] }, 0);
      glowBox(b, 0.17, 0.006, 0.02, nth([0x8ad8ff, 0x9af0b8, 0xffc890], v), [
        flip * 0.14,
        0.087,
        -0.245 + dz,
      ]);
      b.cylinder(0.06, 0.06, 0.025, 0x6a6e76, { at: [flip * 0.14, 0.06, 0.03 + dz] }, 10);
      if (v !== 2) b.box(0.22, 0.015, 0.3, 0x8a7a9a, { at: [-flip * 0.22, 0.05, 0.22] }, 0);
      // The pitched glass: two slopes up to a ridge along z.
      const ridge = 0.34;
      const eave = 0.22;
      const slope = Math.atan2(ridge - eave, 0.47);
      const run = Math.hypot(0.47, ridge - eave);
      const mid = (ridge + eave) / 2;
      for (const s of [-1, 1]) {
        const tiltRot: [number, number, number] = [0, 0, -s * slope];
        b.pane(run, 0.01, 1, 0xbcd8ec, { at: [s * 0.235, mid + 0.004, 0], rot: tiltRot });
        // A sheen across each slope, on the diagonal.
        const across = (v + (s > 0 ? 1 : 0)) % 3;
        b.pane(0.05, 0.004, run, 0xe8f2f8, {
          at: [s * 0.235, mid + 0.012, (across - 1) * 0.24],
          rot: inOrder([0, s * 0.7, -s * slope], 'ZYX'),
        });
        // Glazing bars: straight, thin, every half tile down the slope; the eave rail.
        for (const z of [-0.5, 0, 0.5])
          b.box(
            run,
            0.022,
            Math.abs(z) === 0.5 ? 0.011 : 0.022,
            BLACK_STEEL,
            {
              at: [s * 0.235, mid + 0.014, z - Math.sign(z) * (Math.abs(z) === 0.5 ? 0.0055 : 0)],
              rot: tiltRot,
            },
            0,
          );
        b.box(0.03, 0.03, 1, BLACK_STEEL, { at: [s * 0.47, eave, 0] }, 0);
      }
      b.box(0.04, 0.04, 1, BLACK_STEEL, { at: [0, ridge, 0] }, 0);
      const kerb = (w: number, d: number, x: number, z: number) => {
        b.box(w, eave, d, RENDER, { at: [x, eave / 2, z] }, 0);
        b.box(w, 0.025, d + 0.02, 0x8c9298, { at: [x, eave + 0.012, z] }, 0);
      };
      if (kerbs & 1) kerb(1, 0.08, 0, -0.46);
      if (kerbs & 4) kerb(1, 0.08, 0, 0.46);
      if (kerbs & 8) kerb(0.08, 1, -0.46, 0);
      if (kerbs & 2) kerb(0.08, 1, 0.46, 0);
      // The gable ends where the light well ends front and back: glass triangles.
      for (const [bit, z] of [
        [1, -0.49],
        [4, 0.49],
      ] as const)
        if (kerbs & bit)
          b.pane(0.94, ridge - eave, 0.01, 0xd8ecf4, { at: [0, (ridge + eave) / 2, z] });
    }),
  );
}
