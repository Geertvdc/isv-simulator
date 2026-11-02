import * as THREE from 'three';
import { type Model, ModelBuilder, tint } from '../kit';
import { tileHash } from '../../mapShape';
import { COLOR } from '../palette';
import { CARDBOARD, DARK, INK, looks, nth, type SetPiece, STEEL, WOOD, WOOD_DARK } from './shared';

/**
 * The canal side round the Down the Hall level's hand-built world
 * (`scenes/downTheHall.ts`): the old biscuit factory's own brick wall, the
 * next warehouse with the brewery's loading dock, the yard's coffee van,
 * pallets and skip, the quay with its bollards and a moored narrowboat, and
 * the courtyard light well's tree, picnic table and string lights. Built
 * like the rest of the set dressing, standing on the ground at the origin
 * and fronting +z. The buildings are built to measure, the rest are props
 * with a few looks each. Colours stay muted: the stations are the brightest
 * things on screen.
 */

/** Old red brick, weathered; the next warehouse's is browner. */
export const BRICK = 0x8e5444;
const BRICK_NEXT = 0x7a5246;
/** Mortar joints and the grooves of the coursing. */
const JOINT_DARK = -0.16;
/** Dressed stone: plinths, sills, copings, the quay edge. */
export const STONE = 0x948e82;
/** Cast iron, painted black long ago. */
export const IRON = 0x2f3032;
/** The faded paint of the old lettering. */
const PAINT = 0xcdbf9e;
/** Lit windows: the other tenants still at work, warm. */
const LIT = [COLOR.windowGlow, COLOR.windowLit, 0xe0b070] as const;
/** Unlit windows: the evening sky in old glass. */
const DUSK = 0x46525e;
/** Lamp and string-light bulbs: warm, in the glow layer. */
const LAMP = 0xffb060;
/** Narrowboat paint: deep green, with red and cream lining. */
const BOAT_GREEN = 0x34503f;
const BOAT_RED = 0x8a3a32;
const BOAT_CREAM = 0xd8ccae;
/** Leaves: dusty, not a park's fresh green. */
const LEAVES = [0x5e7a4a, 0x6a8452, 0x50703f] as const;

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
function hash01(a: number, b: number, salt: number): number {
  let h = tileHash(Math.round(a * 53) + salt * 7919, Math.round(b * 61) - salt * 131);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  return ((h >>> 0) % 1000) / 1000;
}

// ---- Lettering ----

/** A blocky painted alphabet, five rows high: just the letters the signs use. */
const GLYPHS: Readonly<Record<string, readonly string[]>> = {
  '&': ['.#...', '#.#..', '.##..', '#..##', '.##.#'],
  S: ['.###', '#...', '.##.', '...#', '###.'],
  O: ['.##.', '#..#', '#..#', '#..#', '.##.'],
  N: ['#...#', '##..#', '#.#.#', '#..##', '#...#'],
  B: ['###.', '#..#', '###.', '#..#', '###.'],
  I: ['###', '.#.', '.#.', '.#.', '###'],
  C: ['.###', '#...', '#...', '#...', '.###'],
  U: ['#..#', '#..#', '#..#', '#..#', '.##.'],
  T: ['#####', '..#..', '..#..', '..#..', '..#..'],
  W: ['#...#', '#...#', '#.#.#', '##.##', '#...#'],
  R: ['###.', '#..#', '###.', '#.#.', '#..#'],
  K: ['#..#', '#.#.', '##..', '#.#.', '#..#'],
  E: ['####', '#...', '###.', '#...', '####'],
  P: ['###.', '#..#', '###.', '#...', '#...'],
  ' ': ['..', '..', '..', '..', '..'],
};

/** How wide `text` is in pixels of the alphabet, with a one-pixel gap between letters. */
function textPixels(text: string): number {
  let w = 0;
  for (const ch of text) w += (GLYPHS[ch]?.[0]?.length ?? 2) + 1;
  return Math.max(0, w - 1);
}

/**
 * Paints `text` on a wall facing +z, its middle at (cx, y) and its face at
 * `z`, pixels `px` big. `fade` leaves that share of the pixels out, the way
 * old paint flakes.
 */
function letters(
  b: ModelBuilder,
  text: string,
  cx: number,
  y: number,
  z: number,
  px: number,
  color: number,
  fade = 0,
): void {
  let x = cx - (textPixels(text) * px) / 2;
  let k = 0;
  for (const ch of text) {
    const rows = GLYPHS[ch] ?? GLYPHS[' '] ?? [];
    rows.forEach((row, r) => {
      for (let c = 0; c < row.length; c++) {
        if (row[c] !== '#') continue;
        k++;
        if (hash01(k, r + c * 7, 3) < fade) continue;
        const shade = (hash01(k, r, 5) - 0.5) * 0.1;
        b.box(
          px * 0.98,
          px * 0.98,
          0.008,
          tint(color, shade),
          { at: [x + (c + 0.5) * px, y + (2 - r) * px, z] },
          0,
        );
      }
    });
    x += ((rows[0]?.length ?? 2) + 1) * px;
  }
}

// ---- Brick ----

/**
 * A brick face `w` wide and `h` high facing +z, its bottom middle at
 * (cx, y0) and its face at `z`: grooves every course, staggered joints and a
 * brick here and there of its own shade.
 */
function brickFace(
  b: ModelBuilder,
  cx: number,
  y0: number,
  z: number,
  w: number,
  h: number,
  color: number,
  salt: number,
): void {
  const course = 0.2;
  const rows = Math.floor(h / course);
  const x0 = cx - w / 2;
  const groove = tint(color, JOINT_DARK);
  for (let r = 1; r <= rows; r++)
    b.box(w, 0.016, 0.006, groove, { at: [cx, y0 + r * course, z + 0.003] }, 0);
  for (let r = 0; r < rows; r++) {
    const y = y0 + (r + 0.5) * course;
    const off = r % 2 ? 0.22 : 0;
    for (let x = x0 + off + 0.44, i = 0; x < x0 + w - 0.05; x += 0.44, i++) {
      b.box(0.014, course - 0.02, 0.006, groove, { at: [x, y, z + 0.003] }, 0);
      const t = hash01(i + salt * 31, r, 7);
      if (t < 0.22)
        b.box(
          0.4,
          course - 0.03,
          0.008,
          tint(color, t < 0.11 ? 0.1 : -0.1),
          { at: [x - 0.22, y, z + 0.004] },
          0,
        );
    }
  }
}

/** A brick face turned to face −x: the same, along z, its face at `x`. */
function brickSide(
  b: ModelBuilder,
  x: number,
  y0: number,
  cz: number,
  d: number,
  h: number,
  color: number,
): void {
  const groove = tint(color, JOINT_DARK);
  for (let r = 1; r <= Math.floor(h / 0.2); r++)
    b.box(0.006, 0.016, d, groove, { at: [x - 0.003, y0 + r * 0.2, cz] }, 0);
}

/** An iron tie plate: a round pattress plate with a cross, the end of a tie rod through the building. */
function tiePlate(b: ModelBuilder, x: number, y: number, z: number): void {
  b.cylinder(0.09, 0.09, 0.025, IRON, { at: [x, y, z + 0.012], rot: [Math.PI / 2, 0, 0] }, 12);
  b.box(0.2, 0.035, 0.03, IRON, { at: [x, y, z + 0.02], rot: [0, 0, 0.78] }, 0);
  b.box(0.2, 0.035, 0.03, IRON, { at: [x, y, z + 0.02], rot: [0, 0, -0.78] }, 0);
  b.sphere(0.03, tint(IRON, 0.2), { at: [x, y, z + 0.04] });
}

/**
 * A tall arched factory window, `w` wide, from its sill at `y0` up `h` to the
 * spring of the arch: a brick arch, a stone sill, small iron panes, lit warm
 * or dark.
 */
function archedWindow(
  b: ModelBuilder,
  cx: number,
  y0: number,
  w: number,
  h: number,
  z: number,
  lit: number | null,
  brick: number,
): void {
  const r = w / 2;
  // The reveal, dark, then the glass.
  b.box(w + 0.04, h, 0.012, 0x2a2624, { at: [cx, y0 + h / 2, z + 0.006] }, 0);
  b.add(new THREE.CircleGeometry(r + 0.02, 16, 0, Math.PI), 0x2a2624, {
    at: [cx, y0 + h, z + 0.007],
  });
  if (lit !== null) {
    b.screen(w - 0.04, h - 0.02, lit, { at: [cx, y0 + h / 2, z + 0.016] });
    b.add(
      new THREE.CircleGeometry(r - 0.02, 16, 0, Math.PI),
      tint(lit, -0.08),
      {
        at: [cx, y0 + h - 0.01, z + 0.016],
      },
      'glow',
    );
  } else {
    b.box(w - 0.04, h - 0.02, 0.006, DUSK, { at: [cx, y0 + h / 2, z + 0.014] }, 0);
    b.add(new THREE.CircleGeometry(r - 0.02, 16, 0, Math.PI), tint(DUSK, 0.08), {
      at: [cx, y0 + h - 0.01, z + 0.014],
    });
    // The sky caught in a few panes.
    b.box(
      w * 0.3,
      h * 0.35,
      0.004,
      tint(DUSK, 0.3),
      { at: [cx - w * 0.2, y0 + h * 0.7, z + 0.018] },
      0,
    );
  }
  // Iron glazing bars: two uprights into the arch, crossbars every pane.
  for (const s of [-1, 1])
    b.box(
      0.02,
      h + r * 0.85,
      0.02,
      IRON,
      {
        at: [cx + (s * w) / 6, y0 + (h + r * 0.85) / 2, z + 0.024],
      },
      0,
    );
  for (let y = y0 + 0.22; y < y0 + h + r * 0.5; y += 0.22)
    b.box(w - 0.04, 0.018, 0.02, IRON, { at: [cx, y, z + 0.024] }, 0);
  // The brick arch over it and the stone sill under it.
  b.torus(r + 0.06, 0.06, tint(brick, -0.1), { at: [cx, y0 + h, z + 0.02] }, Math.PI);
  b.box(0.1, 0.12, 0.06, STONE, { at: [cx, y0 + h + r + 0.08, z + 0.03] }, 0);
  b.box(w + 0.18, 0.07, 0.1, STONE, { at: [cx, y0 - 0.035, z + 0.05] }, 0);
}

// ---- The factory ----

/** How high the factory's wall stands, to its cornice. */
export const FACTORY_HEIGHT = 3.7;
/** Where the tall windows sit: their sills and how high they run to the arch. */
const WINDOW_SILL = 1.32;
const WINDOW_TALL = 0.95;
const WINDOW_WIDE = 0.62;
/** The painted band with the old lettering, up under the cornice. */
const SIGN_Y = 2.88;
/** The doorway to the entrance hall: how wide, high and deep its opening is. */
export const HALL_DOOR = { width: 0.94, height: 2.05, depth: 0.45 } as const;

export interface FactoryPlan {
  /** Total width; the wall runs from −width/2 to width/2. */
  width: number;
  /** The tall windows, by x from the wall's middle, lit or not. */
  windows: readonly { x: number; lit: boolean }[];
  /** The entrance hall's doorway (behind the inbox), by x, when it's in this wall. */
  door?: number;
  /** How wide the hall doorway is (the inbox's width); `HALL_DOOR.width` when left out. */
  doorWidth?: number;
  /** Where the old lettering is centred, by x. */
  sign: number;
  /** The hoist beam and its loading door, by x. */
  hoist: number;
  /** Ground-floor windows, by x: where the foot of the wall shows (the yard, a light well). */
  low: readonly number[];
}

/**
 * The biscuit factory's own wall, behind the level's back wall: red brick in
 * courses on a stone plinth, tall arched windows (the other tenants' lit
 * warm), iron tie plates, a hoist beam over a loading door, the faded
 * "& SONS BISCUIT WORKS" up under a stone cornice, the entrance hall's
 * doorway. Its front is at z = 0; it's a slab 0.6 thick.
 */
export function factoryWall(plan: FactoryPlan): SetPiece {
  const key = `factory:${JSON.stringify(plan)}`;
  return once(key, () => ({
    size: [plan.width, 0.6],
    model: () => factoryModel(plan),
  }));
}

function factoryModel(plan: FactoryPlan): Model {
  const b = new ModelBuilder();
  const { width } = plan;
  const H = FACTORY_HEIGHT;
  const half = width / 2;
  const door = plan.door;
  const dw = plan.doorWidth ?? HALL_DOOR.width;
  // The body, cut round the hall doorway.
  if (door === undefined) {
    b.box(width, H, 0.6, BRICK, { at: [0, H / 2, -0.3] }, 0);
  } else {
    const a = door - dw / 2;
    const c = door + dw / 2;
    b.box(a + half, H, 0.6, BRICK, { at: [(-half + a) / 2, H / 2, -0.3] }, 0);
    b.box(half - c, H, 0.6, BRICK, { at: [(c + half) / 2, H / 2, -0.3] }, 0);
    const top = H - HALL_DOOR.height;
    b.box(dw, top, 0.6, BRICK, { at: [door, HALL_DOOR.height + top / 2, -0.3] }, 0);
    b.box(
      dw,
      HALL_DOOR.height,
      0.6 - HALL_DOOR.depth,
      BRICK,
      {
        at: [door, HALL_DOOR.height / 2, -HALL_DOOR.depth - (0.6 - HALL_DOOR.depth) / 2],
      },
      0,
    );
  }
  brickFace(b, 0, 0.3, 0, width, H - 0.5, BRICK, 1);
  // The stone plinth, the string course over the ground floor, the cornice.
  b.box(width, 0.32, 0.06, STONE, { at: [0, 0.16, 0.03] }, 0);
  b.box(width, 0.08, 0.06, tint(STONE, -0.05), { at: [0, 1.2, 0.03] }, 0);
  b.box(width + 0.1, 0.14, 0.14, STONE, { at: [0, H - 0.07, 0.07] }, 0.02);
  b.box(width + 0.04, 0.08, 0.08, tint(STONE, -0.12), { at: [0, H - 0.18, 0.04] }, 0);
  // Brick dentils under the cornice.
  for (let x = -half + 0.12; x < half; x += 0.24)
    b.box(0.1, 0.06, 0.05, tint(BRICK, -0.08), { at: [x, H - 0.26, 0.025] }, 0);
  // The faded lettering on its band.
  const text = '& SONS BISCUIT WORKS';
  const px = 0.072;
  const textW = textPixels(text) * px;
  b.box(textW + 0.5, px * 7, 0.01, tint(BRICK, -0.12), { at: [plan.sign, SIGN_Y, 0.006] }, 0);
  letters(b, text, plan.sign + 0.12, SIGN_Y, 0.014, px, PAINT, 0.015);
  // The flaked-off first name, nearly gone: a ghost of paint before the "&".
  for (let k = 0; k < 9; k++) {
    const x = plan.sign - textW / 2 - 0.1 - k * 0.16 * (1 + hash01(k, 1, 9) * 0.3);
    if (hash01(k, 2, 9) < 0.4) continue;
    b.box(
      0.06 + hash01(k, 3, 9) * 0.08,
      px * (1 + hash01(k, 4, 9) * 3),
      0.008,
      tint(PAINT, -0.25),
      { at: [x, SIGN_Y + (hash01(k, 5, 9) - 0.5) * 0.2, 0.012] },
      0,
    );
  }
  // The tall windows, with tie plates between them at both floors.
  const xs = plan.windows.map((w) => w.x);
  plan.windows.forEach((w, i) => {
    if (Math.abs(w.x - plan.hoist) < 0.5) return;
    const lit = w.lit ? nth(LIT, i) : null;
    archedWindow(b, w.x, WINDOW_SILL, WINDOW_WIDE, WINDOW_TALL, 0, lit, BRICK);
  });
  for (let i = 0; i + 1 < xs.length; i++) {
    const a = xs[i] ?? 0;
    const c = xs[i + 1] ?? 0;
    if (c - a < 1.3) continue;
    const m = (a + c) / 2;
    tiePlate(b, m, 1.1, 0);
    tiePlate(b, m, 2.62, 0);
  }
  // Cast-iron downpipes, with hoppers at the top.
  for (const x of [-half + 0.3, half - 0.3, plan.sign + textW / 2 + 0.55]) {
    if (Math.abs(x - plan.hoist) < 0.7 || (door !== undefined && Math.abs(x - door) < 0.8))
      continue;
    b.cylinder(0.045, 0.045, H - 0.3, IRON, { at: [x, (H - 0.3) / 2, 0.07] }, 8);
    b.box(0.16, 0.14, 0.14, IRON, { at: [x, H - 0.34, 0.08] }, 0.01);
    for (let y = 0.6; y < H - 0.5; y += 0.9) b.box(0.12, 0.03, 0.1, IRON, { at: [x, y, 0.06] }, 0);
  }
  // The hoist: a timber loading door up the wall, a beam out over it, the chain and hook.
  const hx = plan.hoist;
  b.box(0.82, 1.2, 0.04, 0x2a2624, { at: [hx, 2.0, 0.02] }, 0);
  for (const s of [-1, 1]) {
    b.box(0.37, 1.12, 0.04, 0x4a5a4c, { at: [hx + s * 0.195, 2.0, 0.04] }, 0.01);
    for (let y = 1.55; y < 2.5; y += 0.14)
      b.box(0.35, 0.012, 0.01, tint(0x4a5a4c, -0.15), { at: [hx + s * 0.195, y, 0.062] }, 0);
    b.box(0.3, 0.035, 0.012, IRON, { at: [hx + s * 0.18, 1.62, 0.066] }, 0);
    b.box(0.3, 0.035, 0.012, IRON, { at: [hx + s * 0.18, 2.38, 0.066] }, 0);
  }
  b.box(1.0, 0.12, 0.18, STONE, { at: [hx, 1.36, 0.08] }, 0);
  b.box(0.16, 0.16, 0.95, WOOD_DARK, { at: [hx, 2.86, 0.4] }, 0.02);
  b.box(0.06, 0.4, 0.06, IRON, { at: [hx, 2.62, 0.08], rot: [-0.6, 0, 0] }, 0);
  b.torus(0.08, 0.025, IRON, { at: [hx, 2.72, 0.76], rot: [0, Math.PI / 2, 0] });
  b.cylinder(0.012, 0.012, 0.7, 0x555048, { at: [hx, 2.36, 0.82] }, 5);
  b.torus(0.05, 0.016, IRON, { at: [hx, 1.96, 0.82] }, Math.PI * 1.4);
  // Ground-floor windows where the foot of the wall shows: low, segmental, barred.
  for (const x of plan.low) {
    if (door !== undefined && Math.abs(x - door) < 1) continue;
    b.box(0.6, 0.55, 0.012, 0x2a2624, { at: [x, 0.72, 0.006] }, 0);
    b.box(0.54, 0.5, 0.006, nth([DUSK, LIT[0]], Math.round(x * 3)), { at: [x, 0.71, 0.014] }, 0);
    for (let k = -2; k <= 2; k++)
      b.box(0.018, 0.5, 0.018, IRON, { at: [x + k * 0.11, 0.71, 0.03] }, 0);
    b.box(0.7, 0.1, 0.05, tint(BRICK, -0.12), { at: [x, 1.02, 0.025] }, 0);
    b.box(0.72, 0.06, 0.1, STONE, { at: [x, 0.42, 0.05] }, 0);
  }
  if (door !== undefined) hallDoor(b, door, dw);
  return b.build();
}

/**
 * The entrance hall's doorway: a stone-framed arch into a warm lit hall with
 * the post's pigeonholes on its back wall, a fanlight and a lamp. The door
 * leaf itself is the level's (its inbox); the opening is left clear for it.
 */
function hallDoor(b: ModelBuilder, x: number, w: number): void {
  const { height: h, depth: d } = HALL_DOOR;
  const warm = 0xc89a62;
  b.box(w, h, 0.02, warm, { at: [x, h / 2, -d + 0.01] }, 0);
  for (const s of [-1, 1])
    b.box(0.02, h, d, tint(warm, -0.12), { at: [x + (s * (w - 0.02)) / 2, h / 2, -d / 2] }, 0);
  b.box(w, 0.02, d, 0x6a5038, { at: [x, 0.01, -d / 2] }, 0);
  b.box(w, 0.02, d, tint(warm, -0.2), { at: [x, h - 0.01, -d / 2] }, 0);
  // The pigeonholes, letters sticking out, and a lit lamp over them.
  const holes = 0x7a5a3a;
  b.box(0.72, 0.5, 0.12, holes, { at: [x, 1.45, -d + 0.07] }, 0.01);
  for (let r = 0; r < 3; r++)
    for (let c = 0; c < 4; c++) {
      const cx = x - 0.27 + c * 0.18;
      const cy = 1.28 + r * 0.16;
      b.box(0.15, 0.12, 0.02, 0x3a2a1a, { at: [cx, cy, -d + 0.13] }, 0);
      if (hash01(r, c, 11) < 0.6)
        b.box(
          0.11,
          0.07,
          0.02,
          nth([0xf0ead8, 0xe8d8b0, 0xd8e0e8], r + c),
          {
            at: [cx, cy - 0.01, -d + 0.15],
          },
          0,
        );
    }
  b.led(0.05, COLOR.warmLight, { at: [x, h - 0.12, -d / 2] });
  // A stone surround and an arched fanlight over the opening.
  for (const s of [-1, 1])
    b.box(0.12, h + 0.05, 0.08, STONE, { at: [x + s * (w / 2 + 0.06), (h + 0.05) / 2, 0.04] }, 0);
  b.box(w + 0.36, 0.14, 0.1, STONE, { at: [x, h + 0.07, 0.05] }, 0.01);
  b.add(
    new THREE.CircleGeometry(w / 2 - 0.04, 16, 0, Math.PI),
    COLOR.windowLit,
    {
      at: [x, h + 0.14, 0.02],
    },
    'glow',
  );
  b.torus(w / 2, 0.05, STONE, { at: [x, h + 0.14, 0.04] }, Math.PI);
  for (const a of [0.6, 1.57, 2.5])
    b.box(
      0.015,
      w / 2 - 0.06,
      0.02,
      IRON,
      {
        at: [x + Math.cos(a) * (w / 4 - 0.02), h + 0.14 + Math.sin(a) * (w / 4 - 0.02), 0.03],
        rot: [0, 0, a - Math.PI / 2],
      },
      0,
    );
  // A little enamel sign: POST.
  b.box(0.58, 0.17, 0.02, 0x2e4a5a, { at: [x, h + 0.55, 0.02] }, 0.01);
  letters(b, 'POST', x, h + 0.55, 0.035, 0.026, 0xe8e0c8);
}

// ---- The next warehouse ----

/** How high the next warehouse stands, and its loading dock. */
export const WAREHOUSE_HEIGHT = 3.2;
export const DOCK = { height: 0.42, depth: 0.85 } as const;

/**
 * The next warehouse along, the brewery's: browner brick, its front (+z) with
 * a half-open roller shutter onto the lit brewery, a raised loading dock
 * along it with rubber bumpers and steps, a painted BREW CO board, small
 * windows upstairs; its left side (facing −x, toward the level) in brick
 * with a drainpipe. Its front-left corner is at the origin; it runs `width`
 * along +x and `depth` back along −z.
 */
export function nextWarehouse(width: number, depth: number): SetPiece {
  return once(`warehouse:${width.toFixed(2)}:${depth.toFixed(2)}`, () => ({
    size: [width, depth],
    model: () => warehouseModel(width, depth),
  }));
}

function warehouseModel(width: number, depth: number): Model {
  const b = new ModelBuilder();
  const H = WAREHOUSE_HEIGHT;
  const c = BRICK_NEXT;
  b.box(width, H, depth, c, { at: [width / 2, H / 2, -depth / 2] }, 0);
  brickFace(b, width / 2, 0.3, 0, width, H - 0.4, c, 5);
  brickSide(b, 0, 0.3, -depth / 2, depth, H - 0.4, c);
  // Plinth, parapet coping, quoins up the corner.
  b.box(width, 0.3, 0.05, STONE, { at: [width / 2, 0.15, 0.025] }, 0);
  b.box(0.05, 0.3, depth, STONE, { at: [-0.025, 0.15, -depth / 2] }, 0);
  b.box(width + 0.1, 0.12, depth + 0.1, STONE, { at: [width / 2, H + 0.06, -depth / 2] }, 0.02);
  for (let y = 0.4, i = 0; y < H - 0.2; y += 0.3, i++)
    b.box(
      i % 2 ? 0.2 : 0.3,
      0.14,
      i % 2 ? 0.3 : 0.2,
      tint(STONE, -0.05),
      {
        at: [i % 2 ? 0.08 : 0.13, y, i % 2 ? -0.13 : -0.08],
      },
      0,
    );
  // The roller shutter, half up, the brewery lit behind it.
  const sx = Math.min(1.4, width * 0.35);
  const sw = 1.3;
  const top = 2.0;
  const open = DOCK.height + 0.62;
  b.box(sw + 0.16, top + 0.08, 0.04, 0x3a3634, { at: [sx, (top + 0.08) / 2, 0.02] }, 0);
  b.screen(sw, open - DOCK.height, 0xd8a868, { at: [sx, (open + DOCK.height) / 2, 0.03] });
  for (let k = 0; k < 3; k++)
    b.cylinder(
      0.11,
      0.11,
      0.3,
      0x5a5a58,
      {
        at: [sx - 0.35 + k * 0.32, DOCK.height + 0.15, 0.025],
      },
      10,
    );
  for (let y = open + 0.04; y < top; y += 0.07)
    b.box(sw, 0.05, 0.03, nth([0x8a9098, 0x7e848c], Math.round(y * 14)), { at: [sx, y, 0.05] }, 0);
  b.box(sw + 0.1, 0.18, 0.12, 0x5a5e62, { at: [sx, top + 0.08, 0.07] }, 0.01);
  // The dock: concrete, a steel edge, black bumpers, steps at its left end.
  const dockW = Math.min(width - 0.1, sx + sw / 2 + 0.9);
  b.box(
    dockW,
    DOCK.height,
    DOCK.depth,
    0x8e8a82,
    {
      at: [dockW / 2 + 0.05, DOCK.height / 2, DOCK.depth / 2],
    },
    0.01,
  );
  b.box(dockW, 0.03, 0.04, 0x5a5650, { at: [dockW / 2 + 0.05, DOCK.height - 0.01, DOCK.depth] }, 0);
  for (const x of [sx - 0.45, sx + 0.45])
    b.box(0.16, 0.24, 0.07, INK, { at: [x, DOCK.height - 0.16, DOCK.depth + 0.03] }, 0.02);
  for (let k = 0; k < 3; k++)
    b.box(
      0.32,
      DOCK.height * ((k + 1) / 4),
      0.22,
      0x8e8a82,
      {
        at: [0.21, (DOCK.height * ((k + 1) / 4)) / 2, DOCK.depth + 0.11 + (2 - k) * 0.0],
      },
      0,
    );
  // A steel handrail up the steps.
  b.cylinder(0.015, 0.015, 0.5, IRON, { at: [0.06, DOCK.height + 0.25, DOCK.depth - 0.05] }, 6);
  b.box(0.02, 0.02, 0.5, IRON, { at: [0.06, DOCK.height + 0.5, DOCK.depth - 0.3] }, 0);
  // Over the shutter, the brewery's painted board and a lamp on a bracket.
  b.box(1.5, 0.3, 0.04, 0x2e4a40, { at: [sx, top + 0.42, 0.03] }, 0.01);
  letters(b, 'BREW CO', sx, top + 0.42, 0.055, 0.042, 0xd8c890);
  b.box(0.04, 0.04, 0.3, IRON, { at: [sx + sw / 2 + 0.25, top + 0.15, 0.15] }, 0);
  b.cone(0.1, 0.1, IRON, { at: [sx + sw / 2 + 0.25, top + 0.08, 0.3], rot: [Math.PI, 0, 0] }, 10);
  b.led(0.05, COLOR.lampLight, { at: [sx + sw / 2 + 0.25, top + 0.03, 0.3] });
  // Small windows upstairs, a couple lit.
  for (let x = 0.55, i = 0; x < width - 0.3; x += 0.95, i++) {
    if (Math.abs(x - sx) < 0.8) continue;
    b.box(0.5, 0.6, 0.012, 0x2a2624, { at: [x, 2.45, 0.006] }, 0);
    const lit = i % 3 === 1;
    if (lit) b.screen(0.44, 0.54, nth(LIT, i), { at: [x, 2.45, 0.014] });
    else b.box(0.44, 0.54, 0.006, DUSK, { at: [x, 2.45, 0.012] }, 0);
    b.box(0.02, 0.54, 0.02, IRON, { at: [x, 2.45, 0.02] }, 0);
    b.box(0.6, 0.06, 0.08, STONE, { at: [x, 2.13, 0.04] }, 0);
    b.box(0.58, 0.08, 0.04, tint(c, -0.12), { at: [x, 2.8, 0.02] }, 0);
  }
  // Down the side facing the level: a drainpipe, two small windows, a tie plate.
  b.cylinder(0.045, 0.045, H, IRON, { at: [-0.06, H / 2, -0.35] }, 8);
  for (const z of [-1.3, -2.5]) {
    if (-z > depth - 0.3) continue;
    b.box(0.012, 0.6, 0.5, 0x2a2624, { at: [-0.006, 2.45, z] }, 0);
    b.box(0.006, 0.54, 0.44, z < -2 ? LIT[1] : DUSK, { at: [-0.012, 2.45, z] }, 0);
  }
  return b.build();
}

// ---- The yard ----

/** The coffee van: a little rounded van, sage and cream, its hatch open on the +z side. */
export const coffeeVan = looks([1.6, 0.9], 1, (b) => {
  const paint = 0x8a9c88;
  const cream = 0xd8cdb2;
  // Body, a cream lower half, the cab's rounded nose at +x.
  b.box(1.5, 0.95, 0.86, paint, { at: [-0.1, 0.78, 0] }, 0.14);
  b.box(1.52, 0.36, 0.88, cream, { at: [-0.1, 0.48, 0] }, 0.1);
  b.box(0.5, 0.62, 0.82, paint, { at: [0.82, 0.62, 0] }, 0.18);
  b.pane(0.08, 0.3, 0.7, COLOR.glassPale, { at: [1.06, 0.82, 0] });
  b.ledPair(0.05, COLOR.headlight, [0.0, 0.5, 0]);
  b.box(0.8, 0.05, 0.84, tint(paint, -0.2), { at: [-0.1, 1.27, 0] }, 0);
  // The hatch: a lit opening, the flap propped up as an awning, a shelf.
  b.screen(0.82, 0.38, 0xe8b878, { at: [-0.15, 0.92, 0.435] });
  b.box(0.86, 0.04, 0.4, cream, { at: [-0.15, 1.18, 0.6], rot: [-0.5, 0, 0] }, 0.01);
  for (let k = 0; k < 5; k++)
    b.box(
      0.17,
      0.045,
      0.4,
      k % 2 ? cream : 0x8a5a4a,
      {
        at: [-0.49 + k * 0.17, 1.2, 0.6],
        rot: [-0.5, 0, 0],
      },
      0,
    );
  b.box(0.9, 0.04, 0.14, WOOD, { at: [-0.15, 0.73, 0.5] }, 0.01);
  // An espresso machine inside, cups on the shelf.
  b.box(0.3, 0.2, 0.1, 0xb8bec8, { at: [-0.3, 0.86, 0.34] }, 0.02);
  for (let k = 0; k < 3; k++)
    b.cylinder(0.03, 0.025, 0.07, 0xf0ead8, { at: [0.02 + k * 0.08, 0.785, 0.52] }, 8);
  // Wheels.
  for (const [x, z] of [
    [-0.55, 0.42],
    [0.6, 0.42],
    [-0.55, -0.42],
    [0.6, -0.42],
  ] as const) {
    b.cylinder(0.17, 0.17, 0.1, INK, { at: [x, 0.17, z], rot: [Math.PI / 2, 0, 0] }, 14);
    b.cylinder(0.08, 0.08, 0.11, 0xb8b4aa, { at: [x, 0.17, z], rot: [Math.PI / 2, 0, 0] }, 10);
  }
  // A string of bulbs along the roof edge, and the chalkboard A-frame by the hatch.
  for (let k = 0; k < 6; k++) b.led(0.03, LAMP, { at: [-0.75 + k * 0.25, 1.24, 0.46] });
  b.box(0.3, 0.42, 0.03, 0x2a2e2c, { at: [0.6, 0.21, 0.78], rot: [0.2, -0.3, 0] }, 0.01);
  b.box(0.22, 0.03, 0.01, 0xe8e0d0, { at: [0.6, 0.3, 0.8], rot: [0.2, -0.3, 0] }, 0);
  b.box(0.18, 0.025, 0.01, 0xd8a868, { at: [0.6, 0.22, 0.8], rot: [0.2, -0.3, 0] }, 0);
});

/** Pallets, stacked one to four high; some loaded: flour sacks, wrapped boxes. */
export const pallets = looks([1, 0.8], 4, (b, v) => {
  const n = [2, 4, 1, 3][v] ?? 1;
  const wood = 0xa88a64;
  for (let i = 0; i < n; i++) {
    const y = i * 0.15;
    const turn = (i % 2) * 0.06;
    const c = tint(wood, ((i * 37 + v * 11) % 10) / 60 - 0.08);
    for (const z of [-0.32, 0, 0.32])
      b.box(0.9, 0.06, 0.12, tint(c, -0.15), { at: [turn, y + 0.03, z] }, 0);
    for (let x = -0.4; x <= 0.41; x += 0.16)
      b.box(0.12, 0.025, 0.8, c, { at: [x + turn, y + 0.075, 0] }, 0);
    b.box(0.9, 0.025, 0.8, tint(c, -0.3), { at: [turn, y + 0.1, 0] }, 0);
    for (let x = -0.4; x <= 0.41; x += 0.16)
      b.box(0.12, 0.025, 0.8, c, { at: [x + turn, y + 0.125, 0] }, 0);
  }
  const top = n * 0.15;
  if (v === 2) {
    // Flour sacks from the old works, slumped.
    for (const [x, z, r] of [
      [-0.2, -0.15, 0.2],
      [0.2, -0.12, -0.1],
      [0, 0.2, 0.4],
    ] as const)
      b.sphere(0.2, 0xd8ceb6, { at: [x, top + 0.1, z], rot: [0, r, 0] }, [1.2, 0.5, 0.8]);
  } else if (v === 0) {
    // Boxes, shrink-wrapped.
    b.box(0.8, 0.45, 0.7, CARDBOARD, { at: [0, top + 0.23, 0] }, 0.02);
    b.box(0.82, 0.46, 0.72, 0xd8dce0, { at: [0, top + 0.23, 0] }, 0.02);
    b.box(0.84, 0.03, 0.74, tint(CARDBOARD, -0.2), { at: [0, top + 0.12, 0] }, 0);
  }
});

/** A builder's skip, a dull mustard, full of the last tenant's leftovers. */
export const skip = looks([1.6, 1], 1, (b) => {
  const paint = 0x968a5c;
  b.box(1.2, 0.55, 0.9, paint, { at: [0, 0.3, 0] }, 0.03);
  for (const s of [-1, 1])
    b.box(0.32, 0.55, 0.9, paint, { at: [s * 0.68, 0.32, 0], rot: [0, 0, s * -0.45] }, 0.03);
  b.box(1.6, 0.06, 0.94, tint(paint, -0.2), { at: [0, 0.6, 0] }, 0);
  for (const s of [-1, 1])
    b.box(0.08, 0.3, 0.08, tint(paint, -0.25), { at: [s * 0.45, 0.42, 0.47] }, 0);
  b.box(0.7, 0.025, 0.012, 0xd8d0b8, { at: [0, 0.38, 0.452] }, 0);
  // Inside: planks, cardboard, an old office chair, rubble.
  b.box(1.3, 0.1, 0.8, 0x6a6058, { at: [0, 0.55, 0] }, 0);
  b.box(1.1, 0.05, 0.12, WOOD, { at: [-0.1, 0.66, -0.15], rot: [0, 0.3, 0.15] }, 0);
  b.box(0.9, 0.05, 0.12, tint(WOOD, -0.1), { at: [0.2, 0.68, 0.2], rot: [0, -0.4, -0.1] }, 0);
  b.box(0.4, 0.06, 0.35, CARDBOARD, { at: [-0.4, 0.66, 0.15], rot: [0.2, 0.5, 0] }, 0.01);
  b.box(0.3, 0.06, 0.3, 0x3a3f4a, { at: [0.4, 0.72, -0.1], rot: [0.5, 0, 0.3] }, 0.02);
  b.box(0.3, 0.3, 0.06, 0x3a3f4a, { at: [0.45, 0.85, -0.25], rot: [0.3, 0, 0.3] }, 0.02);
});

// ---- The brewery ----

/** Keg steel, dulled; the dark rolling rings; the plastic cap collars, one colour per brew. */
const KEG = 0x7f878d;
const KEG_RING = 0x4a4f53;
const KEG_CAPS = [0x8a3a32, 0x3a5a4a, 0xb08a3a] as const;
/** An oak cask's staves and its iron hoops. */
const CASK = 0x6a4a30;

/** Turns a point along a keg's axis: up (`lying` false) or along x (lying on its side). */
function along(
  x: number,
  y: number,
  z: number,
  t: number,
  lying: boolean,
): [number, number, number] {
  return lying ? [x + t, y, z] : [x, y + t, z];
}

/**
 * A steel keg, 0.36 long, centred at (x, y, z): standing, or lying on its
 * side along x. Two dark rolling rings, a coloured cap collar at its top
 * end with the spear fitting in it.
 */
function keg(b: ModelBuilder, x: number, y: number, z: number, cap: number, lying = false): void {
  const rot: [number, number, number] = lying ? [0, 0, Math.PI / 2] : [0, 0, 0];
  const ringRot: [number, number, number] = lying ? [0, Math.PI / 2, 0] : [Math.PI / 2, 0, 0];
  b.cylinder(0.13, 0.13, 0.36, KEG, { at: [x, y, z], rot }, 16);
  for (const t of [-0.1, 0.1])
    b.torus(0.133, 0.016, KEG_RING, { at: along(x, y, z, t, lying), rot: ringRot });
  // The chimes, a bit lighter, and the cap collar on the top one.
  b.torus(0.12, 0.014, tint(KEG, 0.15), { at: along(x, y, z, -0.18, lying), rot: ringRot });
  b.cylinder(0.122, 0.122, 0.04, cap, { at: along(x, y, z, 0.17, lying), rot }, 16);
  b.cylinder(0.04, 0.04, 0.03, KEG_RING, { at: along(x, y, z, 0.195, lying), rot }, 8);
}

/** An oak cask, 0.4 long, bellied, three iron hoops a side: standing, or lying along x. */
function cask(b: ModelBuilder, x: number, y: number, z: number, lying = false): void {
  const rot: [number, number, number] = lying ? [0, 0, Math.PI / 2] : [0, 0, 0];
  const ringRot: [number, number, number] = lying ? [0, Math.PI / 2, 0] : [Math.PI / 2, 0, 0];
  // Two frustums meeting at the belly: the top half's wide end down.
  const s = lying ? -1 : 1;
  b.cylinder(0.125, 0.155, 0.2, CASK, { at: along(x, y, z, 0.1 * s, lying), rot }, 14);
  b.cylinder(
    0.155,
    0.125,
    0.2,
    tint(CASK, -0.06),
    { at: along(x, y, z, -0.1 * s, lying), rot },
    14,
  );
  for (const [t, r] of [
    [-0.18, 0.13],
    [-0.1, 0.145],
    [0.1, 0.145],
    [0.18, 0.13],
  ] as const)
    b.torus(r, 0.012, IRON, { at: along(x, y, z, t, lying), rot: ringRot });
  b.cylinder(0.12, 0.12, 0.012, tint(CASK, 0.12), { at: along(x, y, z, 0.2, lying), rot }, 14);
  b.cylinder(0.12, 0.12, 0.012, tint(CASK, 0.12), { at: along(x, y, z, -0.2, lying), rot }, 14);
}

/**
 * The brewery's kegs: a pyramid of three on their sides, a pallet with two
 * standing and an oak cask laid in front, or a standing keg with a cask
 * chocked on its side beside it.
 */
export const kegs = looks([1, 1], 3, (b, v) => {
  const cap = (i: number) => nth(KEG_CAPS, v + i);
  if (v === 0) {
    keg(b, 0, 0.13, -0.14, cap(0), true);
    keg(b, 0.02, 0.13, 0.14, cap(1), true);
    keg(b, 0.01, 0.355, 0, cap(2), true);
  } else if (v === 1) {
    for (const z of [-0.32, 0, 0.32]) b.box(0.9, 0.1, 0.12, 0x8a7458, { at: [0, 0.05, z] }, 0);
    b.box(0.9, 0.03, 0.8, 0x9a8264, { at: [0, 0.115, 0] }, 0);
    keg(b, -0.2, 0.31, -0.16, cap(0));
    keg(b, 0.14, 0.31, -0.18, cap(1));
    cask(b, 0, 0.29, 0.2, true);
  } else {
    keg(b, -0.18, 0.18, -0.05, cap(0));
    cask(b, 0.16, 0.155, 0.12, true);
    b.box(0.06, 0.05, 0.08, WOOD_DARK, { at: [0.16, 0.025, 0.28] }, 0);
  }
});

/**
 * The brewer's handcart, waiting for the dray: a flat bed on two big
 * wheels, its handles down on a prop, three kegs laid on it and a cask.
 */
export const handcart = looks([1.3, 0.8], 1, (b) => {
  const wood = 0x7a6248;
  // The bed, its side rails, the axle and two spoked wheels at the back.
  b.box(1.0, 0.05, 0.62, wood, { at: [0, 0.3, 0] }, 0.01);
  for (const s of [-1, 1]) {
    b.box(1.5, 0.05, 0.05, tint(wood, -0.18), { at: [0.2, 0.27, s * 0.33] }, 0);
    b.torus(0.26, 0.03, INK, { at: [-0.25, 0.26, s * 0.38] });
    b.cylinder(
      0.05,
      0.05,
      0.06,
      IRON,
      { at: [-0.25, 0.26, s * 0.38], rot: [Math.PI / 2, 0, 0] },
      8,
    );
    for (let k = 0; k < 4; k++)
      b.box(
        0.5,
        0.02,
        0.02,
        tint(wood, -0.1),
        {
          at: [-0.25, 0.26, s * 0.38],
          rot: [0, 0, (k * Math.PI) / 4],
        },
        0,
      );
  }
  b.cylinder(0.025, 0.025, 0.8, IRON, { at: [-0.25, 0.26, 0], rot: [Math.PI / 2, 0, 0] }, 6);
  // The prop leg under the front, and the grips.
  b.box(0.05, 0.27, 0.05, tint(wood, -0.18), { at: [0.55, 0.135, 0] }, 0);
  for (const s of [-1, 1]) b.box(0.12, 0.06, 0.06, INK, { at: [0.95, 0.27, s * 0.33] }, 0.02);
  // The load: two kegs side by side, one atop between, a cask at the front.
  keg(b, -0.22, 0.46, -0.15, nth(KEG_CAPS, 0), true);
  keg(b, -0.2, 0.46, 0.15, nth(KEG_CAPS, 1), true);
  keg(b, -0.21, 0.68, 0, nth(KEG_CAPS, 2), true);
  cask(b, 0.28, 0.48, 0, false);
});

/** A slumped heap of the old works' flour sacks, printed with a faded band. */
export const flourSacks = looks([1, 0.7], 2, (b, v) => {
  const sack = 0xcfc4aa;
  const spots: [number, number, number, number][] =
    v === 0
      ? [
          [-0.25, 0.1, -0.1, 0.3],
          [0.15, 0.1, -0.12, -0.2],
          [-0.05, 0.1, 0.18, 0.5],
          [-0.08, 0.26, -0.02, 0.1],
        ]
      : [
          [-0.15, 0.1, 0, 0.2],
          [0.22, 0.1, 0.05, -0.4],
        ];
  spots.forEach(([x, y, z, r], i) => {
    b.sphere(0.2, tint(sack, (i % 2) * -0.06), { at: [x, y, z], rot: [0, r, 0] }, [1.2, 0.5, 0.8]);
    b.box(0.2, 0.012, 0.3, 0x8a6a4a, { at: [x, y + 0.1, z], rot: [0, r, 0] }, 0);
  });
});

/** A canal bench: oak slats on cast-iron ends, a coffee cup someone left on it. */
export const quayBench = looks([1.3, 0.5], 1, (b) => {
  const oak = 0x8a6e50;
  for (const s of [-1, 1]) {
    b.box(0.05, 0.42, 0.44, IRON, { at: [s * 0.55, 0.21, 0] }, 0.01);
    b.box(0.06, 0.05, 0.5, IRON, { at: [s * 0.55, 0.02, 0] }, 0);
  }
  for (let k = 0; k < 3; k++)
    b.box(1.25, 0.035, 0.11, tint(oak, k * 0.03), { at: [0, 0.27, -0.13 + k * 0.13] }, 0);
  for (let k = 0; k < 2; k++)
    b.box(
      1.25,
      0.1,
      0.03,
      tint(oak, -0.05),
      {
        at: [0, 0.4 + k * 0.12, -0.2],
        rot: [-0.15, 0, 0],
      },
      0,
    );
  b.cylinder(0.03, 0.025, 0.08, 0xf0ead8, { at: [0.35, 0.33, 0.05] }, 8);
});

/** A half barrel planted with a round box shrub: under 0.6, for the light well's front. */
export const shrubTub = looks([0.6, 0.6], 2, (b, v) => {
  b.cylinder(0.22, 0.19, 0.24, CASK, { at: [0, 0.12, 0] }, 12);
  for (const y of [0.04, 0.2])
    b.torus(0.21, 0.012, IRON, { at: [0, y, 0], rot: [Math.PI / 2, 0, 0] });
  b.sphere(0.21, nth(LEAVES, v), { at: [0, 0.38, 0] }, [1, 0.85, 1]);
  b.sphere(0.12, nth(LEAVES, v + 1), { at: [0.1, 0.46, 0.06] });
});

/**
 * A bicycle, side on along x, its stand down: wheels, a diamond frame in
 * `frame`, saddle, bars and a basket. `lean` tips it toward -z.
 */
function bicycle(b: ModelBuilder, x: number, z: number, frame: number, lean = 0): void {
  const r = 0.19;
  const y = r + 0.02;
  const tilt: [number, number, number] = [lean, 0, 0];
  for (const dx of [-0.3, 0.3]) {
    b.torus(r, 0.022, INK, { at: [x + dx, y, z], rot: tilt });
    b.cylinder(0.025, 0.025, 0.05, STEEL, { at: [x + dx, y, z], rot: [Math.PI / 2, 0, 0] }, 6);
  }
  const bar = (x0: number, y0: number, x1: number, y1: number) =>
    b.box(
      Math.hypot(x1 - x0, y1 - y0),
      0.03,
      0.03,
      frame,
      {
        at: [x + (x0 + x1) / 2, (y0 + y1) / 2, z],
        rot: [lean, 0, Math.atan2(y1 - y0, x1 - x0)],
      },
      0,
    );
  bar(-0.3, y, -0.04, y); // chain stay
  bar(-0.3, y, -0.1, y + 0.26); // seat stay
  bar(-0.04, y, -0.1, y + 0.26); // seat tube
  bar(-0.1, y + 0.26, 0.2, y + 0.25); // top tube
  bar(-0.04, y, 0.2, y + 0.25); // down tube
  bar(0.2, y + 0.25, 0.3, y); // fork
  b.box(0.12, 0.035, 0.06, INK, { at: [x - 0.11, y + 0.32, z], rot: tilt }, 0.01);
  b.box(0.03, 0.03, 0.3, STEEL, { at: [x + 0.2, y + 0.32, z], rot: tilt }, 0);
  b.box(0.14, 0.1, 0.16, 0x9a8264, { at: [x + 0.32, y + 0.3, z], rot: tilt }, 0.01);
}

/** A galvanised Sheffield stand: an inverted U of tube, facing +z. */
function sheffield(b: ModelBuilder, x: number, z: number): void {
  const galv = 0x8a9096;
  b.torus(0.2, 0.025, galv, { at: [x, 0.5, z] }, Math.PI);
  for (const s of [-1, 1]) b.cylinder(0.025, 0.025, 0.5, galv, { at: [x + s * 0.2, 0.25, z] }, 8);
}

/** A bike rack by the quay: two galvanised Sheffield stands, one bike locked between them. */
export const bikeRack = looks([1, 0.6], 1, (b) => {
  sheffield(b, 0, -0.18);
  sheffield(b, 0, 0.26);
  bicycle(b, 0.02, 0.04, 0x5a7a7a);
  // The D-lock round the frame and the near stand.
  b.torus(0.06, 0.012, 0x3a3a3a, { at: [-0.12, 0.32, 0.15], rot: [Math.PI / 2, 0, 0] });
});

/** A bike left against a planter, on its stand: two looks. */
export const parkedBike = looks([0.9, 0.4], 2, (b, v) => {
  bicycle(b, 0, 0, nth([0x8a5a4a, 0x5a6a7a], v), -0.12);
});

/**
 * A courier's cargo bike: a long box bike, its box up front full of
 * parcels, kept under 0.6 high so it can wait in front of the level. The
 * courier's own (look 0) is pale with the firm's teal stripe; look 1 is a
 * tenant's, timber.
 */
export const cargoBike = looks([0.6, 1.3], 2, (b, v) => {
  const frame = nth([0x3a5a62, 0x6a5a4a], v);
  const box = nth([0xd8ccae, 0x8a7a5a], v);
  b.torus(0.17, 0.025, INK, { at: [0, 0.19, -0.42], rot: [0, Math.PI / 2, 0] });
  b.torus(0.12, 0.022, INK, { at: [0, 0.14, 0.42], rot: [0, Math.PI / 2, 0] });
  b.box(0.04, 0.04, 0.95, frame, { at: [0, 0.16, 0.0] }, 0);
  b.box(0.04, 0.36, 0.04, frame, { at: [0, 0.34, -0.2], rot: [-0.2, 0, 0] }, 0);
  b.box(0.08, 0.03, 0.18, INK, { at: [0, 0.52, -0.22] }, 0);
  b.box(0.04, 0.3, 0.04, frame, { at: [0, 0.38, 0.06], rot: [0.25, 0, 0] }, 0);
  b.box(0.42, 0.025, 0.025, STEEL, { at: [0, 0.54, 0.02] }, 0);
  // The box: plank sides, parcels and a padded bag inside.
  b.box(0.5, 0.26, 0.5, box, { at: [0, 0.32, 0.36] }, 0.02);
  if (v === 0) b.box(0.52, 0.06, 0.52, 0x3f7a78, { at: [0, 0.36, 0.36] }, 0);
  b.box(0.44, 0.02, 0.44, tint(box, -0.3), { at: [0, 0.44, 0.36] }, 0);
  b.box(0.22, 0.12, 0.2, CARDBOARD, { at: [-0.1, 0.49, 0.3], rot: [0, 0.3, 0] }, 0.01);
  b.box(0.2, 0.09, 0.26, tint(CARDBOARD, 0.1), { at: [0.12, 0.48, 0.42], rot: [0, -0.2, 0] }, 0.01);
  b.box(0.16, 0.08, 0.14, 0x3a4a5a, { at: [-0.08, 0.5, 0.48] }, 0.02);
  // Its stand down.
  b.box(0.5, 0.02, 0.03, IRON, { at: [0, 0.03, 0.42] }, 0);
});

// ---- The quay ----

/** An iron mooring bollard, black, with a rope coiled at its foot. */
export const bollard = looks([0.4, 0.4], 2, (b, v) => {
  const iron = 0x45474a;
  b.cylinder(0.13, 0.15, 0.04, iron, { at: [0, 0.02, 0] }, 14);
  b.cylinder(0.08, 0.1, 0.13, iron, { at: [0, 0.1, 0] }, 14);
  b.cylinder(0.13, 0.09, 0.05, iron, { at: [0, 0.18, 0] }, 14);
  b.cylinder(0.13, 0.13, 0.015, tint(iron, 0.25), { at: [0, 0.21, 0] }, 14);
  // A rope made fast round it, and its tail coiled on the stone.
  const rope = 0xc8b890;
  b.torus(0.095, 0.022, rope, { at: [0, 0.12, 0], rot: [Math.PI / 2, 0, 0] });
  if (v === 0) {
    b.torus(0.12, 0.025, rope, { at: [0.2, 0.03, 0.12], rot: [Math.PI / 2, 0, 0] });
    b.torus(0.08, 0.025, rope, { at: [0.2, 0.06, 0.12], rot: [Math.PI / 2, 0, 0] });
  }
});

/** A quayside lamp: a cast-iron post with a lantern lit warm. */
export const quayLamp = looks([0.4, 0.4], 1, (b) => {
  b.cylinder(0.08, 0.1, 0.2, IRON, { at: [0, 0.1, 0] }, 10);
  b.cylinder(0.035, 0.045, 1.7, IRON, { at: [0, 1.0, 0] }, 8);
  b.box(0.24, 0.03, 0.24, IRON, { at: [0, 1.86, 0] }, 0);
  // The lantern: a lit glass box in its iron frame, all of it in the glow layer.
  b.add(new THREE.BoxGeometry(0.15, 0.22, 0.15), LAMP, { at: [0, 2.0, 0] }, 'glow');
  for (const [x, z] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ] as const)
    b.box(0.02, 0.24, 0.02, IRON, { at: [x * 0.08, 2.0, z * 0.08] }, 0);
  b.cone(0.16, 0.12, IRON, { at: [0, 2.18, 0] }, 4);
  b.sphere(0.03, IRON, { at: [0, 2.26, 0] });
});

/**
 * A moored narrowboat, its bow toward +x: a deep green hull with a red and
 * cream line, its cabin roof with a cratch board, plants in pots, a coal bag
 * and a painted water can, a chimney: all kept under 0.6 high. Its length
 * runs 3.6 along x; the waterline is at y = 0.
 */
export const narrowboat = looks([3.6, 0.7], 1, (b) => {
  const len = 3.2;
  const beam = 0.62;
  const r = beam / Math.sqrt(3);
  // The hull, its pointed bow a three-sided prism.
  b.box(len, 0.22, beam, BOAT_GREEN, { at: [-len / 2, 0.11, 0] }, 0.02);
  b.cylinder(
    r * 1.06,
    r * 1.06,
    0.22,
    BOAT_GREEN,
    { at: [r / 2, 0.11, 0], rot: [0, Math.PI / 2, 0] },
    3,
  );
  b.box(len, 0.035, beam + 0.02, BOAT_RED, { at: [-len / 2, 0.2, 0] }, 0);
  b.cylinder(
    r * 1.08,
    r * 1.08,
    0.035,
    BOAT_RED,
    { at: [r / 2, 0.2, 0], rot: [0, Math.PI / 2, 0] },
    3,
  );
  b.box(len, 0.03, beam + 0.01, INK, { at: [-len / 2, 0.02, 0] }, 0);
  // The cabin, set back from the bow, with portholes and a cream coachline.
  const cab0 = -len + 0.4;
  const cab1 = -0.7;
  const cl = cab1 - cab0;
  b.box(cl, 0.2, beam - 0.12, BOAT_GREEN, { at: [(cab0 + cab1) / 2, 0.32, 0] }, 0.03);
  b.box(cl, 0.025, beam - 0.1, BOAT_CREAM, { at: [(cab0 + cab1) / 2, 0.3, 0] }, 0);
  b.box(cl + 0.04, 0.04, beam - 0.06, 0x5a5650, { at: [(cab0 + cab1) / 2, 0.44, 0] }, 0.01);
  for (let x = cab0 + 0.3; x < cab1 - 0.1; x += 0.42) {
    b.cylinder(
      0.05,
      0.05,
      0.01,
      0xb8a050,
      { at: [x, 0.33, (beam - 0.12) / 2 + 0.004], rot: [Math.PI / 2, 0, 0] },
      10,
    );
    b.screen(0.06, 0.06, 0xe8b878, { at: [x, 0.33, (beam - 0.12) / 2 + 0.012] });
  }
  // On the roof: plants, a coal bag, a painted water can, the chimney, a bike.
  b.box(0.3, 0.1, 0.12, 0x6a4a3a, { at: [cab0 + 0.5, 0.51, 0.1] }, 0.01);
  for (let k = 0; k < 3; k++)
    b.sphere(0.06, nth(LEAVES, k), { at: [cab0 + 0.4 + k * 0.1, 0.57, 0.1] });
  b.box(0.26, 0.08, 0.18, 0x2a2a2a, { at: [cab0 + 1.0, 0.5, -0.08] }, 0.03);
  b.cylinder(0.07, 0.08, 0.12, BOAT_RED, { at: [cab0 + 1.4, 0.52, 0.12] }, 10);
  b.cylinder(0.03, 0.03, 0.02, BOAT_CREAM, { at: [cab0 + 1.4, 0.59, 0.12] }, 8);
  b.cylinder(0.035, 0.035, 0.14, IRON, { at: [cab0 + 0.2, 0.53, -0.12] }, 8);
  b.cylinder(0.05, 0.035, 0.02, 0xb8a050, { at: [cab0 + 0.2, 0.59, -0.12] }, 8);
  // The cratch: a triangular board at the front of the well deck, with a cream diamond.
  b.box(0.04, 0.24, beam - 0.14, BOAT_GREEN, { at: [cab1 + 0.35, 0.34, 0] }, 0.01);
  b.box(0.012, 0.1, 0.1, BOAT_CREAM, { at: [cab1 + 0.375, 0.36, 0], rot: [0.78, 0, 0] }, 0);
  b.box(0.7, 0.025, 0.025, IRON, { at: [cab1 + 0.7, 0.44, 0], rot: [0, 0, -0.25] }, 0);
  // A rope fender on the stem, and the tiller off the stern.
  b.sphere(0.07, 0xb8a888, { at: [r + 0.02, 0.1, 0] }, [1, 1.3, 1]);
  b.box(0.04, 0.04, 0.04, 0xb8a050, { at: [-len - 0.05, 0.32, 0] }, 0);
  b.box(0.5, 0.025, 0.025, 0xb8a050, { at: [-len - 0.3, 0.35, 0], rot: [0, 0, 0.2] }, 0);
});

/** A mallard on the water: two looks, the drab duck and the green-headed drake. */
export const duck = looks([0.3, 0.3], 2, (b, v) => {
  const body = v ? 0x7a6a5a : 0x8a7a62;
  b.sphere(0.07, body, { at: [0, 0.03, 0] }, [1.4, 0.8, 1]);
  b.sphere(0.04, v ? 0x2e5a40 : body, { at: [0.08, 0.1, 0] });
  b.box(0.04, 0.012, 0.025, 0xc8a040, { at: [0.12, 0.095, 0] }, 0);
  b.box(0.04, 0.02, 0.06, tint(body, -0.2), { at: [-0.1, 0.06, 0], rot: [0, 0, 0.5] }, 0);
});

/** Canvas post sacks by the door, for when the hall is on the front of the level. */
export const postSacks = looks([0.8, 0.5], 1, (b) => {
  b.sphere(0.18, 0x9a8a68, { at: [-0.15, 0.15, 0] }, [1, 0.9, 0.8]);
  b.sphere(0.15, 0x8a7a5a, { at: [0.2, 0.12, 0.05] }, [1, 0.8, 0.9]);
  b.box(0.24, 0.02, 0.18, 0xf0ead8, { at: [0.05, 0.25, 0.1], rot: [0.2, 0.4, 0] }, 0);
});

// ---- The courtyard ----

/** A tree in a big timber planter: a plane tree, its bark mottled, its crown dusty green. */
export const planterTree = looks([1, 1], 2, (b, v) => {
  const timber = 0x7a6248;
  b.box(0.9, 0.42, 0.9, timber, { at: [0, 0.21, 0] }, 0.02);
  for (let y = 0.07; y < 0.42; y += 0.12)
    b.box(0.92, 0.012, 0.92, tint(timber, -0.2), { at: [0, y, 0] }, 0);
  b.box(0.8, 0.03, 0.8, 0x4a3a2c, { at: [0, 0.42, 0] }, 0);
  b.box(0.98, 0.05, 0.98, tint(timber, 0.1), { at: [0, 0.445, 0] }, 0.01);
  const trunk = 0x8a8270;
  b.cylinder(0.06, 0.09, 1.3, trunk, { at: [0, 1.05, 0] }, 8);
  b.cylinder(0.035, 0.05, 0.5, trunk, { at: [0.14, 1.6, 0.05], rot: [0, 0, -0.5] }, 6);
  b.cylinder(0.035, 0.05, 0.5, trunk, { at: [-0.12, 1.65, -0.05], rot: [0.2, 0, 0.6] }, 6);
  const crown: [number, number, number, number][] = [
    [0, 2.1, 0, 0.55],
    [0.38, 1.9, 0.1, 0.38],
    [-0.36, 1.95, -0.05, 0.4],
    [0.1, 2.45, -0.1, 0.36],
    [-0.1, 1.85, 0.32, 0.34],
  ];
  crown.forEach(([x, y, z, s], i) =>
    b.sphere(s, nth(LEAVES, i + v), { at: [x, y, z] }, [1, 0.85, 1]),
  );
  // Ferns and grasses round its foot.
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2 + v;
    b.sphere(
      0.1,
      nth(LEAVES, k + 1),
      { at: [Math.cos(a) * 0.3, 0.5, Math.sin(a) * 0.3] },
      [1, 0.7, 1],
    );
  }
});

/** A low planter of grasses and lavender, under 0.6, for in front of the play. */
export const lowPlanter = looks([1, 0.5], 2, (b, v) => {
  const timber = 0x7a6248;
  b.box(0.9, 0.3, 0.42, timber, { at: [0, 0.15, 0] }, 0.02);
  b.box(0.94, 0.04, 0.46, tint(timber, 0.1), { at: [0, 0.31, 0] }, 0.01);
  for (let k = 0; k < 5; k++) {
    const x = -0.34 + k * 0.17;
    const c = v === 1 && k % 2 ? 0x8a80a0 : nth(LEAVES, k);
    b.sphere(0.1, c, { at: [x, 0.38, (k % 2) * 0.06 - 0.03] }, [0.9, 1.1, 0.9]);
  }
});

/** A picnic table, weathered timber, someone's laptop open on it and two mugs. */
export const picnicTable = looks([1.2, 1.2], 2, (b, v) => {
  const t = 0x9a7e5e;
  for (let k = -2; k <= 2; k++)
    b.box(1.1, 0.04, 0.12, tint(t, k * 0.02), { at: [0, 0.4, k * 0.13] }, 0);
  for (const s of [-1, 1]) {
    b.box(1.1, 0.04, 0.2, t, { at: [0, 0.24, s * 0.48] }, 0);
    for (const x of [-0.42, 0.42])
      b.box(0.05, 0.5, 0.05, tint(t, -0.15), { at: [x, 0.2, s * 0.2], rot: [s * 0.55, 0, 0] }, 0);
  }
  for (const x of [-0.42, 0.42]) b.box(0.05, 0.04, 1.1, tint(t, -0.15), { at: [x, 0.16, 0] }, 0);
  if (v === 0) {
    b.box(0.3, 0.015, 0.2, 0x8a929c, { at: [-0.15, 0.43, 0.05] }, 0);
    b.box(0.3, 0.2, 0.015, 0x8a929c, { at: [-0.15, 0.53, -0.05], rot: [-0.25, 0, 0] }, 0);
    b.screen(0.26, 0.16, 0x9fc8e8, { at: [-0.15, 0.53, -0.04], rot: [-0.25, 0, 0] });
  }
  b.cylinder(0.035, 0.03, 0.08, 0xf0ead8, { at: [0.25, 0.46, 0.1] }, 8);
  b.cylinder(0.035, 0.03, 0.08, 0x5a6a62, { at: [0.35, 0.46, -0.08] }, 8);
});

/**
 * String lights between two posts `span` apart along x (from the post at
 * x = 0), the wire sagging between them, `high` up at the posts: warm bulbs.
 */
export function stringLights(span: number, high = 1.6): SetPiece {
  return once(`lights:${span.toFixed(2)}:${high}`, () =>
    looks([span, 0.2], 1, (b) => {
      for (const x of [0, span]) {
        b.cylinder(0.03, 0.04, high, WOOD_DARK, { at: [x, high / 2, 0] }, 6);
        b.box(0.12, 0.08, 0.12, STONE, { at: [x, 0.04, 0] }, 0);
      }
      const sag = Math.min(0.35, span * 0.08);
      const n = Math.max(4, Math.round(span / 0.2));
      const yAt = (t: number) => high - 0.05 - sag * 4 * t * (1 - t);
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
          DARK,
          {
            at: [((t0 + t1) * span) / 2, (y0 + y1) / 2, 0],
            rot: [0, 0, Math.atan2(y1 - y0, dx)],
          },
          0,
        );
        if (i > 0) b.led(0.045, LAMP, { at: [t0 * span, y0 - 0.05, 0] });
      }
    }),
  );
}
