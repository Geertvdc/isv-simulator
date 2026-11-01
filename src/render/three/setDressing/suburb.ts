import { type Model, ModelBuilder, tint } from '../kit';
import { COLOR } from '../palette';
import {
  CARDBOARD,
  DARK,
  INK,
  LEAF,
  LEAF_DARK,
  LEAF_LIGHT,
  looks,
  nth,
  type SetPiece,
  STEEL,
  WHITE,
  WOOD,
  WOOD_DARK,
} from './shared';

/**
 * The suburb round the garage level's hand-built world (`scenes/garage.ts`):
 * the house behind the garage, the street bits in front, the side yard and
 * the neighbour's garden. Built like the rest of the set dressing, standing
 * on the ground at the origin and fronting +z. The house and the ground are
 * built to measure, the rest are props with a few looks each.
 */

/** House siding: a soft sage, and the neighbour's buttery yellow. */
export const SIDING = [0x8a9a86, 0xc8b47e] as const;
const ROOF = [0x5a4a4a, 0x7a5a42] as const;
const TRIM = COLOR.offWhite;
const PIZZA = 0xd8b07a;
/** Water drops: pale, drawn solid, as glass would vanish against the grass. */
const WATER = 0xc8e8f8;

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

/**
 * A house `width` wide seen from its garden side: lap siding, a gutter and
 * downpipes, a roof sloping back from the eave, and windows lit warm from
 * inside at the x positions in `windows` (from its left end). `door` puts a
 * back door at that x. Its front is at z = 0; it reaches back `depth`.
 */
export function house(
  width: number,
  depth: number,
  look: 0 | 1,
  windows: readonly number[],
  door?: number,
  hall?: number,
): SetPiece {
  const key = `house:${width.toFixed(2)}:${depth}:${look}:${windows.join(',')}:${door ?? ''}:${hall ?? ''}`;
  return once(key, () => ({
    size: [width, depth],
    model: () => houseModel(width, depth, look, windows, door, hall),
  }));
}

/** How high the house's walls run before the roof. */
export const HOUSE_EAVE = 2.35;
/**
 * The hallway behind the garage's house door: an opening this wide, deep and
 * high in the house's front, so the open door leaf swung into the house has
 * room, lit warm inside.
 */
export const HALL = { width: 1, depth: 0.55, height: 1.32 } as const;
const HALL_COLOR = 0xc89a62;

function houseModel(
  width: number,
  depth: number,
  look: 0 | 1,
  windows: readonly number[],
  door: number | undefined,
  hall: number | undefined,
): Model {
  const b = new ModelBuilder();
  const wall = SIDING[look];
  const roof = ROOF[look];
  const left = -width / 2;
  const inner = tint(wall, -0.08);
  // The walls: a block, with lap boards in two shades down its front; cut
  // round the hallway when there is one.
  const spans: [number, number][] = [[left, -left]];
  if (hall === undefined) {
    b.box(width, HOUSE_EAVE, depth, inner, { at: [0, HOUSE_EAVE / 2, -depth / 2] }, 0);
  } else {
    const h0 = left + hall - HALL.width / 2;
    const h1 = left + hall + HALL.width / 2;
    const back = depth - HALL.depth;
    b.box(width, HOUSE_EAVE, back, inner, { at: [0, HOUSE_EAVE / 2, -HALL.depth - back / 2] }, 0);
    for (const [x0, x1] of [
      [left, h0],
      [h1, -left],
    ] as const)
      b.box(
        x1 - x0,
        HOUSE_EAVE,
        HALL.depth,
        inner,
        {
          at: [(x0 + x1) / 2, HOUSE_EAVE / 2, -HALL.depth / 2],
        },
        0,
      );
    const above = HOUSE_EAVE - HALL.height;
    b.box(
      HALL.width,
      above,
      HALL.depth,
      inner,
      {
        at: [left + hall, HALL.height + above / 2, -HALL.depth / 2],
      },
      0,
    );
    // The hallway inside: warm walls, a darker floor.
    b.box(
      HALL.width,
      HALL.height,
      0.02,
      HALL_COLOR,
      { at: [left + hall, HALL.height / 2, -HALL.depth + 0.01] },
      0,
    );
    for (const x of [h0 + 0.01, h1 - 0.01])
      b.box(
        0.02,
        HALL.height,
        HALL.depth,
        tint(HALL_COLOR, -0.1),
        { at: [x, HALL.height / 2, -HALL.depth / 2] },
        0,
      );
    b.box(HALL.width, 0.02, HALL.depth, 0x6a5038, { at: [left + hall, 0.01, -HALL.depth / 2] }, 0);
    spans[0] = [left, h0];
    spans.push([h1, -left]);
  }
  for (let i = 0; i < 13; i++) {
    const y = 0.1 + i * 0.18;
    const c = i % 2 ? wall : tint(wall, 0.05);
    const cut = hall !== undefined && y < HALL.height;
    for (const [x0, x1] of cut ? spans : [[left, -left] as [number, number]])
      b.box(x1 - x0 - 0.02, 0.15, 0.03, c, { at: [(x0 + x1) / 2, y + 0.07, 0.01] }, 0);
  }
  // A footing along the bottom and corner boards up the ends.
  for (const [x0, x1] of spans)
    b.box(x1 - x0 + 0.04, 0.12, 0.06, 0x6a6660, { at: [(x0 + x1) / 2, 0.06, 0.01] }, 0);
  for (const x of [left + 0.05, -left - 0.05])
    b.box(0.1, HOUSE_EAVE, 0.06, TRIM, { at: [x, HOUSE_EAVE / 2, 0.02] }, 0);
  for (const x of windows) {
    const cx = left + x;
    // A window: trim, two lit panes, a sill and shutters.
    b.box(0.86, 0.72, 0.05, TRIM, { at: [cx, 1.72, 0.03] }, 0.01);
    b.screen(0.32, 0.56, COLOR.windowLit, { at: [cx - 0.18, 1.72, 0.06] });
    b.screen(0.32, 0.56, COLOR.windowGlow, { at: [cx + 0.18, 1.72, 0.06] });
    b.box(0.96, 0.05, 0.12, TRIM, { at: [cx, 1.34, 0.07] }, 0);
    for (const s of [-1, 1])
      b.box(0.22, 0.74, 0.04, tint(wall, -0.35), { at: [cx + s * 0.56, 1.72, 0.03] }, 0.01);
    // A flower box under it.
    b.box(0.7, 0.14, 0.16, WOOD_DARK, { at: [cx, 1.24, 0.1] }, 0.01);
    for (let k = 0; k < 4; k++)
      b.sphere(0.07, nth([0xd86a6a, COLOR.blossom, 0xe8a0c0, LEAF_LIGHT], k + Math.round(x)), {
        at: [cx - 0.24 + k * 0.16, 1.34, 0.12],
      });
  }
  if (door !== undefined) {
    // A back door with a little step and a lamp beside it.
    const cx = left + door;
    b.box(0.72, 1.3, 0.05, TRIM, { at: [cx, 0.66, 0.03] }, 0.01);
    b.box(0.6, 1.22, 0.06, 0x5a6a7a, { at: [cx, 0.64, 0.04] }, 0.01);
    b.pane(0.36, 0.3, 0.02, COLOR.glassPale, { at: [cx, 0.98, 0.08] });
    b.sphere(0.03, STEEL, { at: [cx + 0.22, 0.6, 0.09] });
    b.box(0.9, 0.08, 0.3, COLOR.cement, { at: [cx, 0.04, 0.15] }, 0.01);
    b.led(0.05, COLOR.lampLight, { at: [cx + 0.48, 1.16, 0.1] });
    b.box(0.08, 0.14, 0.06, DARK, { at: [cx + 0.48, 1.24, 0.06] }, 0);
  }
  // The roof: an eave board and a gutter along the front, shingle rows up the slope.
  const slope = 0.62;
  const run = depth * 0.62;
  const rise = Math.tan(slope) * run;
  const len = Math.hypot(run, rise);
  b.box(width + 0.36, 0.1, 0.12, TRIM, { at: [0, HOUSE_EAVE, 0.12] }, 0);
  b.cylinder(
    0.06,
    0.06,
    width + 0.36,
    0xa8aca8,
    {
      at: [0, HOUSE_EAVE - 0.02, 0.2],
      rot: [0, 0, Math.PI / 2],
    },
    8,
  );
  const rows = Math.ceil(len / 0.2);
  for (let i = 0; i < rows; i++) {
    const t = (i + 0.5) / rows;
    const z = 0.2 - t * (run + 0.2);
    const y = HOUSE_EAVE + 0.06 + t * rise;
    b.box(
      width + 0.36,
      0.06,
      (len / rows) * 1.25,
      tint(roof, i % 2 ? 0 : 0.06),
      {
        at: [0, y, z],
        rot: [slope, 0, 0],
      },
      0,
    );
  }
  // Downpipes at both ends.
  for (const x of [left + 0.2, -left - 0.2]) {
    b.cylinder(0.04, 0.04, HOUSE_EAVE, 0xa8aca8, { at: [x, HOUSE_EAVE / 2, 0.14] }, 8);
    b.box(0.12, 0.05, 0.2, 0xa8aca8, { at: [x, 0.03, 0.22] }, 0);
  }
  return b.build();
}

/** A wooden privacy fence, one tile: boards with a rail, or a white picket. */
export const fence = looks([1, 0.2], 3, (b, v) => {
  const c = nth([0x9a7a5a, 0x8a6a4a, COLOR.porcelain], v);
  const picket = v === 2;
  const h = picket ? 0.55 : 0.82;
  for (const y of picket ? [0.15, 0.4] : [0.2, 0.62])
    b.box(1, 0.06, 0.04, tint(c, -0.15), { at: [0, y, -0.04] }, 0);
  const n = picket ? 6 : 7;
  for (let i = 0; i < n; i++) {
    const x = -0.5 + (i + 0.5) / n;
    const hh = h + ((i * 5) % 3) * 0.02;
    b.box(1 / n - 0.02, hh, 0.03, i % 3 === 1 ? tint(c, 0.06) : c, { at: [x, hh / 2, 0] }, 0);
    if (picket) b.cone(0.05, 0.08, c, { at: [x, hh + 0.04, 0] }, 4);
  }
  b.box(0.08, h + 0.06, 0.08, tint(c, -0.25), { at: [-0.5, (h + 0.06) / 2, -0.03] }, 0);
});

/** The side gate: a fence board door with a latch, standing a little open. */
export const sideGate = looks([1, 0.2], 1, (b) => {
  const c = 0x8a6a4a;
  b.box(0.1, 0.95, 0.1, tint(c, -0.25), { at: [-0.5, 0.47, 0] }, 0);
  b.box(0.1, 0.95, 0.1, tint(c, -0.25), { at: [0.5, 0.47, 0] }, 0);
  for (let i = 0; i < 6; i++)
    b.box(
      0.13,
      0.8,
      0.03,
      i % 2 ? c : tint(c, 0.06),
      {
        at: [-0.38 + i * 0.14, 0.44, 0.08 + i * 0.05],
        rot: [0, -0.4, 0],
      },
      0,
    );
  b.box(0.85, 0.06, 0.03, tint(c, -0.15), { at: [0, 0.3, 0.2], rot: [0, -0.4, 0] }, 0);
  b.box(0.85, 0.06, 0.03, tint(c, -0.15), { at: [0, 0.65, 0.2], rot: [0, -0.4, 0] }, 0);
  b.box(0.04, 0.06, 0.06, INK, { at: [0.38, 0.6, 0.38] }, 0);
});

/** A clipped hedge, one tile: lumpy on top, a shade darker at the foot. */
export const hedge = looks([1, 0.8], 3, (b, v) => {
  const h = 0.62 + v * 0.06;
  b.box(1.02, h, 0.7, LEAF_DARK, { at: [0, h / 2, 0] }, 0.1);
  for (let i = 0; i < 3; i++)
    b.sphere(
      0.24,
      i === v ? LEAF : tint(LEAF_DARK, 0.08),
      {
        at: [-0.33 + i * 0.33, h - 0.04, ((i + v) % 2) * 0.12 - 0.06],
      },
      [1.1, 0.6, 1.3],
    );
});

/** A wheelie bin, its lid propped open on pizza boxes; or the recycling, cans on top. */
export const overflowingBin = looks([1, 1], 2, (b, v) => {
  const c = v ? 0x4a6a8a : 0x4a5a4a;
  b.box(0.5, 0.78, 0.55, c, { at: [0, 0.41, 0] }, 0.03);
  for (const x of [-0.2, 0.2])
    b.cylinder(0.07, 0.07, 0.05, INK, { at: [x, 0.07, -0.26], rot: [0, 0, Math.PI / 2] }, 8);
  if (v === 0) {
    // Pizza boxes stacked out of the top, the lid tipped back on them.
    for (let i = 0; i < 4; i++)
      b.box(
        0.44,
        0.06,
        0.44,
        i % 2 ? PIZZA : tint(PIZZA, -0.1),
        {
          at: [0.02 * (i % 3), 0.84 + i * 0.065, 0.02],
          rot: [0, 0.15 * (i - 1.5), 0.04 * i],
        },
        0.01,
      );
    b.box(0.54, 0.04, 0.58, tint(c, -0.2), { at: [0, 1.07, -0.3], rot: [-1.15, 0, 0] }, 0.01);
    b.box(0.44, 0.05, 0.44, PIZZA, { at: [-0.36, 0.12, 0.34], rot: [0.2, -0.5, -0.3] }, 0.01);
  } else {
    b.box(0.54, 0.04, 0.58, tint(c, -0.2), { at: [0, 0.83, 0.03], rot: [0.12, 0, 0] }, 0.01);
    canPile(b, 0, 0.88, 0, 5);
  }
});

/** Energy-drink cans: bright but small, lying about. */
const CANS = [0x3aa0c8, 0xc8d84a, 0xd84a6a, COLOR.silver] as const;

function canPile(b: ModelBuilder, x: number, y: number, z: number, n: number): void {
  for (let i = 0; i < n; i++) {
    const a = i * 2.4;
    const lying = i % 2 === 0;
    b.cylinder(
      0.04,
      0.04,
      0.13,
      nth(CANS, i),
      {
        at: [x + Math.cos(a) * 0.12, y + (lying ? 0.04 : 0.065), z + Math.sin(a) * 0.12],
        rot: lying ? [Math.PI / 2, a, 0] : [0, 0, 0],
      },
      8,
    );
  }
}

/** Flattened and stacked pizza boxes and a bag of cans, waiting for bin day. */
export const pizzaPile = looks([1, 1], 2, (b, v) => {
  const n = 5 + v * 3;
  for (let i = 0; i < n; i++)
    b.box(
      0.46,
      0.055,
      0.46,
      i % 3 ? PIZZA : tint(PIZZA, -0.12),
      {
        at: [((i * 7) % 5) * 0.015 - 0.1, 0.03 + i * 0.058, -0.05],
        rot: [0, ((i * 13) % 7) * 0.08 - 0.25, 0],
      },
      0.01,
    );
  b.sphere(0.2, 0x3a3a40, { at: [0.25, 0.18, 0.25] }, [1, 0.95, 1]);
  b.cone(0.05, 0.1, 0x3a3a40, { at: [0.25, 0.39, 0.25] }, 6);
  canPile(b, -0.15, 0, 0.32, 3);
});

/** Delivery parcels stacked by the gate: the founders' new kit. */
export const parcels = looks([1, 1], 2, (b, v) => {
  const sizes: [number, number, number][] = [
    [0.5, 0.32, 0.4],
    [0.36, 0.26, 0.34],
    [0.26, 0.2, 0.3],
    [0.6, 0.12, 0.3],
  ];
  let y = 0;
  sizes.slice(0, 3 + v).forEach(([w, h, d], i) => {
    const c = i % 2 ? CARDBOARD : tint(CARDBOARD, -0.12);
    b.box(w, h, d, c, { at: [0.04 * (i % 2) - 0.02, y + h / 2, 0], rot: [0, i * 0.3, 0] }, 0.02);
    b.box(w + 0.005, 0.02, 0.06, 0xc8c0a8, { at: [0, y + h, 0], rot: [0, i * 0.3, 0] }, 0);
    y += h;
  });
});

export const hoseReel = looks([1, 1], 1, (b) => {
  b.box(0.06, 0.5, 0.36, 0x4a6a4a, { at: [-0.18, 0.25, 0] }, 0.01);
  b.box(0.06, 0.5, 0.36, 0x4a6a4a, { at: [0.18, 0.25, 0] }, 0.01);
  b.cylinder(0.05, 0.05, 0.34, STEEL, { at: [0, 0.32, 0], rot: [0, 0, Math.PI / 2] }, 8);
  for (let i = 0; i < 4; i++)
    b.torus(0.17 - i * 0.02, 0.025, 0x4a9a4a, {
      at: [-0.12 + i * 0.08, 0.32, 0],
      rot: [0, Math.PI / 2, 0],
    });
  // The hose snaking off over the grass.
  for (let i = 0; i < 6; i++)
    b.cylinder(
      0.025,
      0.025,
      0.2,
      0x4a9a4a,
      {
        at: [0.1 + i * 0.12, 0.03, 0.2 + Math.sin(i) * 0.12],
        rot: [Math.PI / 2, 0, 1.2 + Math.cos(i) * 0.6],
      },
      6,
    );
});

/** A push mower, its bag full: parked mid-job. */
export const mower = looks([1, 1], 1, (b) => {
  b.box(0.5, 0.18, 0.55, 0xb84a3a, { at: [0, 0.18, 0] }, 0.05);
  b.cylinder(0.16, 0.18, 0.08, DARK, { at: [0, 0.3, 0.02] }, 12);
  for (const [x, z] of [
    [-0.27, 0.2],
    [0.27, 0.2],
    [-0.27, -0.2],
    [0.27, -0.2],
  ] as const)
    b.cylinder(0.08, 0.08, 0.05, INK, { at: [x, 0.08, z], rot: [0, 0, Math.PI / 2] }, 10);
  b.box(0.36, 0.28, 0.3, 0x4a5a3a, { at: [0, 0.25, -0.38] }, 0.06);
  for (const x of [-0.2, 0.2])
    b.cylinder(0.02, 0.02, 0.8, DARK, { at: [x, 0.5, -0.45], rot: [-0.6, 0, 0] }, 6);
  b.cylinder(0.025, 0.025, 0.46, DARK, { at: [0, 0.82, -0.68], rot: [0, 0, Math.PI / 2] }, 6);
});

/** The mailbox at the curb, its flag up. */
export const mailbox = looks([1, 1], 1, (b) => {
  b.box(0.08, 0.7, 0.08, WOOD, { at: [0, 0.35, 0] }, 0);
  b.box(0.24, 0.2, 0.4, 0x3a4a6a, { at: [0, 0.8, 0] }, 0.08);
  b.box(0.2, 0.02, 0.01, WHITE, { at: [0, 0.8, 0.2] }, 0);
  b.box(0.02, 0.16, 0.04, 0xc84a3a, { at: [0.13, 0.94, -0.05] }, 0);
  b.box(0.02, 0.06, 0.1, 0xc84a3a, { at: [0.13, 1.0, -0.0] }, 0);
});

/** A fire hydrant. */
export const hydrant = looks([1, 1], 1, (b) => {
  const red = 0xb84a3a;
  b.cylinder(0.1, 0.12, 0.36, red, { at: [0, 0.18, 0] }, 12);
  b.sphere(0.1, red, { at: [0, 0.37, 0] }, [1, 0.7, 1]);
  b.cylinder(0.04, 0.04, 0.3, red, { at: [0, 0.24, 0], rot: [0, 0, Math.PI / 2] }, 8);
  b.cylinder(0.14, 0.14, 0.04, tint(red, -0.2), { at: [0, 0.02, 0] }, 12);
});

/** A flower bed, one tile: soil edged with stone, and a mix of blooms. */
export const flowerBed = looks([1, 0.7], 3, (b, v) => {
  b.box(1, 0.08, 0.66, 0x5a4434, { at: [0, 0.04, 0] }, 0.02);
  b.box(1, 0.1, 0.06, COLOR.cement, { at: [0, 0.05, 0.33] }, 0);
  const colors = nth(
    [
      [0xd86a7a, COLOR.blossom, 0xe8a04a],
      [0x9a7ad8, 0xe8e0c8, 0xd86a9a],
      [0xe8c04a, 0xd8704a, COLOR.blossom],
    ],
    v,
  );
  for (let i = 0; i < 5; i++) {
    const x = -0.38 + i * 0.19;
    const z = ((i + v) % 2) * 0.22 - 0.11;
    const h = 0.18 + ((i * 3 + v) % 4) * 0.05;
    b.sphere(0.12, i % 2 ? LEAF : LEAF_DARK, { at: [x, 0.12, z] }, [1, 0.7, 1]);
    b.cylinder(0.01, 0.01, h, LEAF_DARK, { at: [x, 0.08 + h / 2, z] }, 4);
    b.sphere(0.06, nth(colors, i), { at: [x, 0.1 + h, z] });
  }
});

/** A lawn sprinkler mid-spray: a little stand and arcs of water drawn in glass. */
export const sprinkler = looks([1, 1], 1, (b) => {
  b.cylinder(0.06, 0.08, 0.1, 0x4a5a6a, { at: [0, 0.05, 0] }, 10);
  b.cylinder(0.015, 0.015, 0.12, STEEL, { at: [0, 0.16, 0] }, 6);
  for (let k = 0; k < 4; k++) {
    const a = (k * Math.PI) / 2 + 0.4;
    for (let i = 1; i <= 6; i++) {
      const t = i / 6;
      const r = t * 0.9;
      b.sphere(0.03, WATER, {
        at: [Math.cos(a) * r, 0.22 + Math.sin(t * Math.PI) * 0.45 - t * 0.1, Math.sin(a) * r],
      });
    }
  }
  b.box(1.6, 0.003, 1.6, 0x4a6a3a, { at: [0, 0.002, 0] }, 0);
});

/** An arc of water from the neighbour's hose, held at the origin, aimed along +z. */
export const hoseSpray = looks([1, 1], 1, (b) => {
  for (let i = 0; i < 9; i++) {
    const t = i / 8;
    b.sphere(0.035, WATER, {
      at: [0, 0.6 + Math.sin(t * Math.PI * 0.7) * 0.25 - t * t * 0.7, t * 1.0],
    });
  }
});

/** The dog, flat out in the sun. */
export const dog = looks([1, 1], 1, (b) => {
  const fur = 0xa8845a;
  b.sphere(0.2, fur, { at: [0, 0.12, 0] }, [1, 0.6, 1.6]);
  b.sphere(0.12, fur, { at: [0, 0.14, 0.32] });
  b.sphere(0.05, INK, { at: [0, 0.14, 0.44] });
  for (const x of [-0.09, 0.09])
    b.sphere(0.06, tint(fur, -0.25), { at: [x, 0.16, 0.28] }, [0.6, 1.2, 0.8]);
  b.capsule(0.03, 0.2, fur, { at: [0.08, 0.08, -0.34], rot: [1.2, 0.4, 0] });
  b.cylinder(0.12, 0.1, 0.05, COLOR.zinc, { at: [0.4, 0.03, 0.2] }, 12);
});

/** The cat, loafing. Stands on whatever it's put on. */
export const catLoaf = looks([1, 1], 1, (b) => {
  const fur = COLOR.tangerine;
  b.sphere(0.16, fur, { at: [0, 0.1, 0] }, [1.3, 0.7, 1]);
  b.sphere(0.1, fur, { at: [0.18, 0.18, 0.05] });
  b.cone(0.04, 0.07, fur, { at: [0.15, 0.28, 0.03] }, 4);
  b.cone(0.04, 0.07, fur, { at: [0.22, 0.28, 0.08] }, 4);
  b.capsule(0.03, 0.22, fur, { at: [-0.22, 0.06, 0.1], rot: [0, 0.6, Math.PI / 2] });
});

/** The AC unit humming next to the garage: the servers inside run hot. */
export const acUnit = looks([1, 1], 1, (b) => {
  b.box(0.7, 0.6, 0.5, COLOR.putty, { at: [0, 0.32, 0] }, 0.03);
  b.cylinder(0.24, 0.24, 0.02, DARK, { at: [0, 0.32, 0.25], rot: [Math.PI / 2, 0, 0] }, 16);
  for (let i = 0; i < 3; i++)
    b.box(0.04, 0.4, 0.01, STEEL, { at: [0, 0.32, 0.262], rot: [0, 0, (i * Math.PI) / 3] }, 0);
  b.box(0.8, 0.04, 0.6, COLOR.cement, { at: [0, 0.02, 0] }, 0);
});

/** A kettle barbecue on legs, lid hooked on the side. */
export const bbq = looks([1, 1], 1, (b) => {
  b.sphere(0.26, DARK, { at: [0, 0.62, 0] }, [1, 0.65, 1]);
  b.cylinder(0.27, 0.27, 0.02, STEEL, { at: [0, 0.64, 0] }, 16);
  for (let i = 0; i < 3; i++) {
    const a = (i * Math.PI * 2) / 3;
    b.cylinder(
      0.015,
      0.015,
      0.6,
      STEEL,
      {
        at: [Math.cos(a) * 0.16, 0.3, Math.sin(a) * 0.16],
        rot: [Math.sin(a) * 0.2, 0, -Math.cos(a) * 0.2],
      },
      6,
    );
  }
  b.sphere(0.26, DARK, { at: [0.3, 0.6, 0], rot: [0, 0, 1.2] }, [1, 0.5, 1]);
  b.box(0.3, 0.02, 0.2, WOOD, { at: [-0.3, 0.55, 0] }, 0);
});

/**
 * The family car, evicted to the driveway: a dusty-blue estate seen mostly
 * from above, so its hood, dark windscreen and roof rails carry the shape.
 */
export const familyCar = looks([1.5, 2.7], 1, (b) => {
  const paint = 0x8aa2bc;
  const glass = 0x34404e;
  // The body: a low tub, a hood sloping to the nose, a cabin over the back.
  b.box(1.46, 0.42, 2.66, paint, { at: [0, 0.4, 0] }, 0.16);
  b.box(1.38, 0.1, 0.8, tint(paint, 0.08), { at: [0, 0.62, 0.86], rot: [0.08, 0, 0] }, 0.05);
  b.box(1.28, 0.4, 1.6, paint, { at: [0, 0.8, -0.42] }, 0.12);
  b.box(1.2, 0.04, 1.3, tint(paint, 0.15), { at: [0, 1.01, -0.48] }, 0);
  // Dark windows: the raked windscreen, down both sides and the back.
  b.box(1.14, 0.03, 0.46, glass, { at: [0, 0.83, 0.46], rot: [-0.85, 0, 0] }, 0);
  for (const x of [-0.645, 0.645]) b.box(0.02, 0.24, 1.3, glass, { at: [x, 0.84, -0.4] }, 0);
  b.box(1.08, 0.24, 0.02, glass, { at: [0, 0.84, -1.225] }, 0);
  // Roof rails, mirrors, bumpers, plate, lights.
  for (const x of [-0.55, 0.55]) {
    b.box(0.05, 0.05, 1.3, DARK, { at: [x, 1.06, -0.5] }, 0);
    b.box(0.14, 0.08, 0.08, paint, { at: [x * 1.38, 0.74, 0.38] }, 0.02);
  }
  b.box(1.5, 0.12, 0.12, DARK, { at: [0, 0.28, 1.33] }, 0.04);
  b.box(1.5, 0.12, 0.12, DARK, { at: [0, 0.28, -1.33] }, 0.04);
  b.box(0.36, 0.1, 0.02, WHITE, { at: [0, 0.4, 1.34] }, 0);
  for (const [x, z] of [
    [-0.72, 0.85],
    [0.72, 0.85],
    [-0.72, -0.85],
    [0.72, -0.85],
  ] as const) {
    b.cylinder(0.24, 0.24, 0.18, INK, { at: [x, 0.24, z], rot: [0, 0, Math.PI / 2] }, 16);
    b.cylinder(0.12, 0.12, 0.19, STEEL, { at: [x, 0.24, z], rot: [0, 0, Math.PI / 2] }, 12);
  }
  b.ledPair(0.07, COLOR.headlight, [0.52, 0.46, 1.3]);
  b.ledPair(0.06, COLOR.tailLight, [0.56, 0.5, -1.32]);
});

/** A wheelbarrow of soil and a spade, left by the lawn. */
export const wheelbarrow = looks([1, 1], 1, (b) => {
  const c = 0x4a7a6a;
  b.box(0.5, 0.22, 0.62, c, { at: [0, 0.34, 0], rot: [0.1, 0, 0] }, 0.06);
  b.box(0.42, 0.06, 0.52, 0x5a4434, { at: [0, 0.44, 0] }, 0.03);
  b.cylinder(0.12, 0.12, 0.05, INK, { at: [0, 0.12, 0.38], rot: [0, 0, Math.PI / 2] }, 12);
  for (const x of [-0.2, 0.2]) {
    b.cylinder(0.02, 0.02, 0.6, DARK, { at: [x, 0.3, -0.42], rot: [1.1, 0, 0] }, 6);
    b.box(0.03, 0.22, 0.03, DARK, { at: [x, 0.11, -0.12] }, 0);
  }
  b.cylinder(0.015, 0.015, 0.7, WOOD, { at: [0.12, 0.62, -0.05], rot: [0.4, 0, -0.3] }, 6);
});

/** A rotary washing line hung with the founders' hoodies and Mom's sheets. */
export const washingLine = looks([1, 1], 1, (b) => {
  b.cylinder(0.025, 0.03, 1.6, STEEL, { at: [0, 0.8, 0] }, 8);
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2 + 0.4;
    b.cylinder(
      0.012,
      0.012,
      0.75,
      STEEL,
      {
        at: [Math.cos(a) * 0.36, 1.58, Math.sin(a) * 0.36],
        rot: [0, -a, Math.PI / 2 - 0.12],
      },
      4,
    );
  }
  const hung: [number, number, number, number][] = [
    [0.45, 0.4, 0x5a6a8a, 0.4],
    [0.3, 0.38, 0x8a5a5a, 0.4 + Math.PI / 2],
    [0.55, 0.5, COLOR.porcelain, 0.4 + Math.PI],
    [0.32, 0.34, 0x6a7a5a, 0.4 + (Math.PI * 3) / 2],
  ];
  for (const [w, h, c, a] of hung)
    b.box(
      w,
      h,
      0.02,
      c,
      {
        at: [Math.cos(a) * 0.5, 1.52 - h / 2, Math.sin(a) * 0.5],
        rot: [0, Math.PI / 2 - a, 0],
      },
      0,
    );
});

/** A garden gnome, keeping watch. */
export const gnome = looks([1, 1], 1, (b) => {
  b.cylinder(0.08, 0.1, 0.16, 0x4a6aa8, { at: [0, 0.08, 0] }, 10);
  b.sphere(0.06, COLOR.skinWarm, { at: [0, 0.21, 0] });
  b.cone(0.05, 0.08, WHITE, { at: [0, 0.17, 0.04] }, 8);
  b.cone(0.065, 0.16, 0xc84a3a, { at: [0, 0.32, 0] }, 10);
});

/** A rain barrel under the downpipe. */
export const rainBarrel = looks([1, 1], 1, (b) => {
  b.cylinder(0.24, 0.22, 0.62, 0x5a6a4a, { at: [0, 0.31, 0] }, 14);
  for (const y of [0.15, 0.48])
    b.torus(0.235, 0.015, tint(0x5a6a4a, -0.3), { at: [0, y, 0], rot: [Math.PI / 2, 0, 0] });
  b.cylinder(0.03, 0.03, 0.06, STEEL, { at: [0, 0.12, 0.24], rot: [Math.PI / 2, 0, 0] }, 6);
});

/** A sun lounger and a little table with a drink: the neighbour's afternoon. */
export const lounger = looks([1, 2], 1, (b) => {
  const c = COLOR.porcelain;
  b.box(0.55, 0.06, 1.3, c, { at: [0, 0.24, 0.15] }, 0.02);
  b.box(0.55, 0.06, 0.6, c, { at: [0, 0.48, -0.6], rot: [0.75, 0, 0] }, 0.02);
  for (let i = 0; i < 5; i++)
    b.box(0.5, 0.02, 0.2, i % 2 ? 0x5a8aa8 : WHITE, { at: [0, 0.28, -0.25 + i * 0.25] }, 0);
  for (const [x, z] of [
    [-0.24, 0.7],
    [0.24, 0.7],
    [-0.24, -0.3],
    [0.24, -0.3],
  ] as const)
    b.box(0.04, 0.22, 0.04, STEEL, { at: [x, 0.11, z] }, 0);
  b.cylinder(0.16, 0.16, 0.03, WHITE, { at: [0.5, 0.4, 0.3] }, 12);
  b.cylinder(0.02, 0.02, 0.38, STEEL, { at: [0.5, 0.19, 0.3] }, 6);
  b.cylinder(0.035, 0.03, 0.1, 0xe8a04a, { at: [0.5, 0.46, 0.3] }, 8);
});

/** A kicked-off football, a skateboard: things kids leave on lawns. */
export const toys = looks([1, 1], 2, (b, v) => {
  if (v === 0) {
    b.sphere(0.1, WHITE, { at: [0, 0.1, 0] });
    b.sphere(0.035, INK, { at: [0.06, 0.16, 0.05] });
    return;
  }
  b.box(0.2, 0.025, 0.62, 0x4a8aa8, { at: [0, 0.08, 0] }, 0.01);
  for (const z of [-0.2, 0.2])
    for (const x of [-0.07, 0.07])
      b.cylinder(0.03, 0.03, 0.03, COLOR.honey, { at: [x, 0.035, z], rot: [0, 0, Math.PI / 2] }, 8);
});

/** A loose tuft of long grass; scattered over the lawns. */
export function tuft(b: ModelBuilder, x: number, z: number, s: number, c: number): void {
  for (let i = 0; i < 3; i++) {
    const a = i * 2.1 + x * 3;
    b.cone(
      0.035 * s,
      0.16 * s,
      i ? c : tint(c, 0.12),
      {
        at: [x + Math.cos(a) * 0.035 * s, 0.07 * s, z + Math.sin(a) * 0.035 * s],
        rot: [Math.sin(a) * 0.35, 0, Math.cos(a) * 0.35],
      },
      4,
    );
  }
}
