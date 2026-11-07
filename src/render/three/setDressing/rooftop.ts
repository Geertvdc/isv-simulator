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
const LOGO = 0xfffaf0;
const LOGO_RING = 0xc890ff;
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
const GRASS = [0x7a9450, 0x96a058, 0x6a8448, 0xa89a58] as const;

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
  /** The middle of the logo sign on its frame, by x. */
  logo: number;
  /** The startup's name, in the font's letters. */
  name: string;
}

/**
 * The building's stair and lift core, whose front is the level's back wall:
 * white render in panels with black steel trim and flashing, the lift door
 * with its floor indicator and "LOFT 7" plaque, a tall lit stair window; on
 * its roof the lift motor room with louvres, a timber-clad water tank on
 * steel legs and the startup's name in big lit letters on a steel frame.
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

  // The logo sign: a steel frame on the front of the roof, the name in lit letters, the orbit beside it.
  const lx = plan.logo;
  const text = plan.name;
  const tw = textWidth(text, true) * LOGO_PX;
  const ring = 0.42;
  const signW = tw + ring * 2 + 0.5;
  const ly = H + LOGO_LIFT + LOGO_PX * 2.5;
  const lz = -0.35;
  const left = lx - signW / 2;
  // Posts, rails and braces behind the letters.
  for (let x = left + 0.1; x < left + signW; x += 0.75) {
    b.box(
      0.05,
      LOGO_LIFT + LOGO_PX * 5.2,
      0.05,
      BLACK_STEEL,
      {
        at: [x, H + (LOGO_LIFT + LOGO_PX * 5.2) / 2, lz - 0.08],
      },
      0,
    );
    b.box(0.04, 0.5, 0.04, BLACK_STEEL, { at: [x, H + 0.22, lz - 0.32], rot: [0.75, 0, 0] }, 0);
  }
  for (const y of [H + LOGO_LIFT - 0.05, H + LOGO_LIFT + LOGO_PX * 3])
    b.box(signW, 0.04, 0.04, BLACK_STEEL, { at: [lx, y, lz - 0.06] }, 0);
  b.box(signW + 0.1, 0.035, 0.3, GALV, { at: [lx, H + 0.18, lz - 0.15] }, 0);
  // The letters, with a dark backing so they read as channel letters.
  const tx0 = left + ring * 2 + 0.35 + tw / 2;
  // Tilted back a little toward the street below, so the letters read from the roofs round about.
  const tilt = 0.45;
  b.box(
    tw + 0.16,
    LOGO_PX * 5.6,
    0.03,
    0x1c1e24,
    {
      at: [tx0, ly, lz - 0.005],
      rot: [-tilt, 0, 0],
    },
    0,
  );
  letters(b, text, tx0, ly, lz + 0.012, LOGO_PX, LOGO, true, 0.02, 0.88, true, tilt);
  // The orbit: a lit ring round a planet, tilted.
  const rx = left + ring + 0.1;
  b.add(
    new THREE.TorusGeometry(ring, 0.035, 8, 32),
    LOGO_RING,
    {
      at: [rx, ly, lz + 0.06],
      rot: [0, 0, 0.5],
    },
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
    new THREE.SphereGeometry(0.07, 8, 6),
    LOGO,
    {
      at: [rx + Math.cos(0.5) * ring, ly + Math.sin(0.5) * ring, lz + 0.08],
    },
    'glow',
  );
  return b.build();
}

/**
 * A lift lobby on a side of the level (the draft's inbox on the left edge):
 * a rendered box with the indicator and "LOFT 7" on the face toward the
 * level (+z), black trim, a lit roof light. `width` along x.
 */
export function liftLobby(width: number): SetPiece {
  return once(`lobby:${width.toFixed(2)}`, () =>
    looks([width, 1.1], 1, (b) => {
      const H = 1.4;
      b.box(width, H, 1.1, RENDER, { at: [0, H / 2, -0.55] }, 0);
      for (let y = 0.32; y < H; y += 0.32)
        b.box(width, 0.014, 0.008, tint(RENDER, -0.16), { at: [0, y, 0.002] }, 0);
      for (const z of [0, -1.1])
        b.box(width + 0.06, 0.08, 0.06, BLACK_STEEL, { at: [0, H + 0.02, z] }, 0);
      for (const s of [-1, 1])
        b.box(0.06, 0.08, 1.1, BLACK_STEEL, { at: [s * (width / 2 + 0.01), H + 0.02, -0.55] }, 0);
      b.box(width - 0.06, 0.02, 1.04, MEMBRANE, { at: [0, H + 0.005, -0.55] }, 0);
      for (const s of [-1, 1])
        b.box(0.06, H, 0.06, BLACK_STEEL, { at: [s * (width / 2 - 0.02), H / 2, 0] }, 0);
      b.box(0.5, 0.18, 0.03, 0x15171b, { at: [0, 1.2, 0.02] }, 0);
      letters(b, '^ 7', 0, 1.2, 0.036, 0.026, 0xffb648, true);
      b.box(0.5, 0.16, 0.02, 0xf4f2ec, { at: [0.6, 1.2, 0.012] }, 0);
      letters(b, 'LOFT 7', 0.6, 1.2, 0.022, 0.018, BLACK_STEEL, false, 0.006);
      b.box(0.5, 0.08, 0.6, RENDER, { at: [0, H + 0.06, -0.55] }, 0);
      glowBox(b, 0.42, 0.02, 0.52, 0xf0e2c0, [0, H + 0.1, -0.55]);
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
      // The tower head and its tie bars down to both jibs.
      b.box(0.04, 0.5, 0.04, yel, { at: [0, jy + 0.25, 0] }, 0);
      b.box(
        Math.hypot(jib * 0.6, 0.45),
        0.01,
        0.01,
        0x6a6a64,
        {
          at: [jib * 0.3, jy + 0.27, 0],
          rot: [0, 0, -Math.atan2(0.45, jib * 0.6)],
        },
        0,
      );
      b.box(
        Math.hypot(cj, 0.45),
        0.01,
        0.01,
        0x6a6a64,
        {
          at: [-cj / 2, jy + 0.27, 0],
          rot: [0, 0, Math.atan2(0.45, cj)],
        },
        0,
      );
      // The trolley, the hook line and a load of steel beams.
      const hx = jib * 0.62;
      b.box(0.12, 0.05, 0.14, 0x3a3d42, { at: [hx, jy - 0.04, 0] }, 0);
      b.box(0.008, 0.9, 0.008, 0x3a3d42, { at: [hx, jy - 0.5, 0] }, 0);
      b.box(0.5, 0.05, 0.1, 0x7a4a3a, { at: [hx, jy - 0.97, 0] }, 0);
    }),
  );
}

/** A red light on the crane's jib or a mast (`blink` alive): bright, the glow layer isn't kept. */
export const redLight = looks([0.1, 0.1], 1, (b) => {
  b.sphere(0.07, AVIATION, { at: [0, 0.07, 0] });
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
      // The logo: a white panel with the name and a mark.
      b.box(w * 0.86, 0.5, 0.04, 0x1a2234, { at: [0, logoY, 0.04] }, 0);
      letters(b, 'GIGACORP', 0.12, logoY, 0.065, Math.min(0.05, (w * 0.7) / 31), 0x8ad8ff, true);
      b.add(
        new THREE.TorusGeometry(0.11, 0.03, 8, 20),
        0x8ad8ff,
        {
          at: [-w * 0.36, logoY, 0.07],
        },
        'glow',
      );
    }),
  );
}

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

/** Ornamental grasses in a planter (`sway` alive): a fountain of thin blades and pale seed heads. */
export const grasses = looks([1, 0.4], 3, (b, v) => {
  // A low mound of leaves first, so the planter reads full from above.
  for (const x of [-0.3, 0, 0.3])
    b.sphere(0.17, nth(GRASS, v + 1), { at: [x, 0.06, 0] }, [1.1, 0.6, 0.9]);
  for (let k = 0; k < 22; k++) {
    const x = -0.42 + (k / 21) * 0.84 + (hash01(k, v, 3) - 0.5) * 0.06;
    const z = (hash01(k, v, 4) - 0.5) * 0.22;
    const h = 0.32 + hash01(k, v, 5) * 0.24;
    const lean = (hash01(k, v, 6) - 0.5) * 0.8;
    b.box(
      0.05,
      h,
      0.016,
      nth(GRASS, k + v),
      {
        at: [x + Math.sin(lean) * h * 0.5, (h / 2) * Math.cos(lean), z],
        rot: [(hash01(k, v, 7) - 0.5) * 0.5, 0, -lean],
      },
      0,
    );
    if (k % 3 === v % 3)
      b.sphere(
        0.035,
        0xd8c890,
        {
          at: [x + Math.sin(lean) * h, h * Math.cos(lean) + 0.02, z],
        },
        [1, 2, 1],
      );
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
    [0, 1.12, 0, 0.3, 0x5e7a4a],
    [0.18, 1.0, 0.1, 0.22, 0x6a8452],
    [-0.16, 1.02, -0.06, 0.22, 0x50703f],
    [0.05, 1.3, -0.05, 0.18, 0x6a8452],
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

/** E-scooters in a black steel rack, a charging lead to the wall: two or three, along x. */
export const scooterRack = looks([1.2, 0.5], 2, (b, v) => {
  b.box(1.2, 0.04, 0.08, BLACK_STEEL, { at: [0, 0.02, -0.18] }, 0);
  b.box(1.2, 0.03, 0.03, BLACK_STEEL, { at: [0, 0.32, -0.2] }, 0);
  for (const x of [-0.55, 0.55]) b.box(0.03, 0.32, 0.03, BLACK_STEEL, { at: [x, 0.16, -0.2] }, 0);
  const n = 2 + v;
  for (let i = 0; i < n; i++) {
    const x = -0.4 + (i * 0.8) / Math.max(1, n - 1);
    const c = nth([0x3a3e46, 0x5a6a62, 0xd8d6d0], i + v);
    const lean = (hash01(i, v, 3) - 0.5) * 0.12;
    b.box(0.08, 0.035, 0.42, c, { at: [x, 0.07, 0.02], rot: [0, 0, lean] }, 0.01);
    for (const z of [-0.2, 0.22])
      b.cylinder(0.05, 0.05, 0.03, 0x1e2024, { at: [x, 0.05, z], rot: [0, 0, Math.PI / 2] }, 12);
    b.box(0.025, 0.55, 0.025, 0x2a2d32, { at: [x, 0.34, -0.16], rot: [-0.12, 0, lean] }, 0);
    b.box(0.26, 0.025, 0.025, 0x2a2d32, { at: [x, 0.61, -0.19] }, 0);
    glowBox(b, 0.03, 0.02, 0.01, 0x8af0a8, [x, 0.5, -0.14]);
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

/** A satellite dish on a post, aimed up and back: the uplink shipped work goes out on. */
export const satDish = looks([0.8, 0.8], 1, (b) => {
  b.box(0.5, 0.05, 0.5, BLACK_STEEL, { at: [0, 0.025, 0] }, 0);
  for (const [x, z] of [
    [-0.2, -0.2],
    [0.2, 0.2],
  ] as const)
    b.box(0.12, 0.08, 0.12, 0x8e8c86, { at: [x, 0.09, z] }, 0);
  b.cylinder(0.04, 0.05, 0.6, GALV, { at: [0, 0.32, 0] }, 10);
  const tilt = 0.75;
  const dy = 0.72;
  const dish = new THREE.SphereGeometry(0.4, 20, 8, 0, Math.PI * 2, 0, 0.75);
  dish.scale(1, 0.55, 1);
  b.add(dish, 0xe4e4e0, { at: [0, dy - 0.2, 0], rot: [-tilt, 0, 0] });
  b.cylinder(0.06, 0.06, 0.04, 0xbcbcb8, { at: [0, dy - 0.14, 0.02], rot: [-tilt, 0, 0] }, 12);
  // The feed arm and LNB.
  b.box(0.02, 0.5, 0.02, GALV, { at: [0, dy + 0.06, 0.16], rot: [-tilt, 0, 0] }, 0);
  b.box(0.06, 0.08, 0.06, 0x3a3d42, { at: [0, dy + 0.24, 0.3], rot: [-tilt, 0, 0] }, 0);
  b.led(0.015, 0x5cf08a, { at: [0.03, dy + 0.26, 0.33] });
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

/** A status LED on the rack (`blink` alive): bright green. */
export const statusLed = looks([0.1, 0.1], 1, (b) => {
  b.box(0.12, 0.05, 0.03, 0x7cff9a, { at: [0, 0.025, 0] }, 0);
});

/** A galvanised ladder cable tray `len` long along +x from x = 0, on low stands, cables in it. */
export function cableTray(len: number): SetPiece {
  return once(`tray:${len.toFixed(2)}`, () =>
    looks([len, 0.2], 1, (b) => {
      const y = 0.07;
      for (const z of [-0.07, 0.07]) b.box(len, 0.035, 0.012, GALV, { at: [len / 2, y, z] }, 0);
      for (let x = 0.1; x < len; x += 0.18)
        b.box(0.015, 0.008, 0.14, GALV, { at: [x, y - 0.012, 0] }, 0);
      for (let x = 0.3; x < len; x += 0.9)
        b.box(0.03, y, 0.03, BLACK_STEEL, { at: [x, y / 2 - 0.01, 0] }, 0);
      for (const [z, c] of [
        [-0.03, 0x1e2024],
        [0.0, 0x3a6aa8],
        [0.03, 0x2a2d32],
      ] as const)
        b.box(len, 0.016, 0.022, c, { at: [len / 2, y + 0.002, z] }, 0);
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

/**
 * One tile of the skylight over the light well: the floor below glowing up
 * through a glass roof light in black mullions, and a rendered kerb along
 * every side in `kerbs` (bits: 1 back, 2 right, 4 front, 8 left).
 */
export function skylightTile(kerbs: number): SetPiece {
  return once(`skylight:${kerbs}`, () =>
    looks([1, 1], 3, (b, v) => {
      // The floor below, lit warm, and the office on it seen from above: a desk, its glowing screen, a chair.
      // (Its top over the roof membrane the scene lays under everything.)
      glowBox(b, 1, 0.01, 1, 0xfff0d0, [0, 0.04, 0]);
      const flip = v % 2 ? 1 : -1;
      const dz = v === 2 ? 0.3 : 0;
      b.box(0.44, 0.03, 0.22, 0x3a3430, { at: [flip * 0.14, 0.06, -0.18 + dz] }, 0);
      glowBox(b, 0.2, 0.012, 0.03, nth([0x8ad8ff, 0x9af0b8, 0xffc890], v), [
        flip * 0.14,
        0.08,
        -0.24 + dz,
      ]);
      b.cylinder(0.07, 0.07, 0.03, 0x2a2d32, { at: [flip * 0.14, 0.06, 0.04 + dz] }, 10);
      if (v !== 2) b.box(0.22, 0.02, 0.3, 0x6a5a7a, { at: [-flip * 0.22, 0.052, 0.22] }, 0);
      // A pitched glass roof light: two slopes up to a ridge along z, black glazing bars.
      const ridge = 0.34;
      const eave = 0.22;
      const slope = Math.atan2(ridge - eave, 0.47);
      const run = Math.hypot(0.47, ridge - eave);
      for (const s of [-1, 1]) {
        const at: [number, number, number] = [s * 0.235, (ridge + eave) / 2, 0];
        for (const z of [0])
          b.box(
            run,
            0.022,
            0.022,
            BLACK_STEEL,
            { at: [at[0], at[1] + 0.008, z], rot: [0, 0, -s * slope] },
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
