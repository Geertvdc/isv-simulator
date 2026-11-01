import { type Model, ModelBuilder, tint } from '../kit';
import { COLOR } from '../palette';
import { CARDBOARD, DARK, INK, LEAF_DARK, looks, nth, type SetPiece, STEEL, WHITE } from './shared';

/**
 * The business park round the Open Plan Office level's hand-built world
 * (`scenes/openPlan.ts`): the unit block whose wall is the level's back wall,
 * the car park, the bin store, the verge and the cars. Built like the rest of
 * the set dressing, standing on the ground at the origin and fronting +z.
 * The block is built to measure; the rest are props with a few looks each.
 * Colours are muted on purpose: the stations stay the brightest things.
 */

// ---- Signwriting: a tiny pixel font, so the signs say something ----

/** 3×5 glyphs, rows top to bottom, `1` is paint. */
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
  O: '010101101101010',
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
  '3': '110001010001110',
  '4': '101101111001001',
  '5': '111100110001110',
  '6': '011100111101111',
  '7': '111001010010010',
  '8': '111101111101111',
  '9': '111101111001110',
  '.': '000000000000010',
  '-': '000000111000000',
  '&': '010101010101011',
  ' ': '000000000000000',
};

/** How wide `text` runs in pixels: 3 per glyph and 1 between. */
function textColumns(text: string): number {
  return text.length * 4 - 1;
}

/**
 * Paints `text` centred on (x, y) on a face at depth z (facing +z), each
 * pixel `px` square and `depth` thick; a row's run of pixels is one box.
 */
export function lettering(
  b: ModelBuilder,
  text: string,
  x: number,
  y: number,
  z: number,
  px: number,
  color: number,
  depth = 0.008,
): void {
  const cols = textColumns(text);
  const upper = text.toUpperCase();
  for (let k = 0; k < upper.length; k++) {
    const glyph = FONT[upper.charAt(k)] ?? FONT[' '] ?? '';
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
        b.box(
          (e - c) * px,
          px,
          depth,
          color,
          { at: [left + ((e - c) * px) / 2, y + (2 - r) * px, z + depth / 2] },
          0,
        );
        c = e;
      }
    }
  }
}

// ---- The unit block ----

/** Who's in a unit of the block: us, the print shop, the dental lab, an empty one. */
export type UnitKind = 'ours' | 'print' | 'dental' | 'toLet' | 'tyres';

/** A unit's stretch of the block's front, in the piece's own x. */
export interface BlockUnit {
  x0: number;
  x1: number;
  kind: UnitKind;
}

/** The block's front, read from the ground up. */
export const BLOCK = {
  /** The dark engineering-brick plinth. */
  plinth: 0.14,
  /** Where the brown brick band ends and the concrete sill begins. */
  brick: 1.25,
  sill: 1.32,
  /** The strip windows in the cladding band. */
  window0: 1.44,
  window1: 1.86,
  /** Where the cladding ends and the fascia (the sign band) starts. */
  fascia: 2.02,
  /** The parapet's coping, the top of the block. */
  top: 2.36,
  depth: 5,
} as const;

/**
 * The lobby behind the level's inbox, when it's in the back wall: an
 * opening this deep and high in the block's front, lit inside, with the post
 * room's pigeonholes, where the landlord's "tickets" come from.
 */
export const LOBBY = { depth: 0.55, height: 1.32 } as const;

const BRICK = 0x7a5444;
const BRICK_DARK = 0x4e4040;
const MORTAR = 0x9a8e84;
const CLAD = 0x8a9096;
const CLAD_DARK = 0x6a7078;
const SILL = 0xa8a49c;
const COPING = 0xb4b8bc;
const GLASS = 0x2e3a46;
const GLASS_GLINT = 0x7a8ea0;
const ROOF = 0x4a4c50;
/** Inside lights on a Monday morning: cool fluorescent, seen through the strip windows. */
const LIT = 0xb8cad0;
const LOBBY_WALL = 0xc8c4b0;

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
 * The business-park block: a long, low 1990s unit building in brown brick
 * with a band of grey cladding and strip windows over it, a fascia carrying
 * each tenant's sign and a parapet with a coping on top; flat roof behind
 * with a few plant boxes. Each unit in `units` gets its own shopfront (a
 * roller shutter, blinds, a TO LET board), ours the startup's vinyl banner
 * (`banner`) over the old tenant's ghost lettering. `lobby` cuts the lobby
 * opening at that x, `lobbyWidth` wide. Its front is at z = 0; x is the
 * piece's own (place it at x = 0).
 */
export function parkBlock(
  units: readonly BlockUnit[],
  banner: string,
  lobby?: { x: number; width: number },
): SetPiece {
  const key = `block:${JSON.stringify(units)}:${banner}:${lobby ? `${lobby.x},${lobby.width}` : ''}`;
  const x0 = Math.min(...units.map((u) => u.x0));
  const x1 = Math.max(...units.map((u) => u.x1));
  return once(key, () => ({
    size: [x1 - x0, BLOCK.depth],
    model: () => blockModel(units, banner, lobby),
  }));
}

function blockModel(
  units: readonly BlockUnit[],
  banner: string,
  lobby: { x: number; width: number } | undefined,
): Model {
  const b = new ModelBuilder();
  const x0 = Math.min(...units.map((u) => u.x0));
  const x1 = Math.max(...units.map((u) => u.x1));
  const w = x1 - x0;
  const cx = (x0 + x1) / 2;
  const D = BLOCK.depth;
  // Spans of the front along x, cut round the lobby below its head.
  const cut: [number, number][] = lobby
    ? [
        [x0, lobby.x - lobby.width / 2],
        [lobby.x + lobby.width / 2, x1],
      ]
    : [[x0, x1]];
  const low = (y: number) => (lobby && y < LOBBY.height ? cut : [[x0, x1] as [number, number]]);

  // The block's mass, set back a hair so the faces in front of it read.
  const back = lobby ? LOBBY.depth : 0.02;
  b.box(
    w,
    BLOCK.top,
    D - back,
    tint(BRICK, -0.25),
    {
      at: [cx, BLOCK.top / 2, -back - (D - back) / 2],
    },
    0,
  );
  if (lobby) {
    for (const [a, c] of cut)
      b.box(
        c - a,
        LOBBY.height,
        LOBBY.depth,
        tint(BRICK, -0.25),
        {
          at: [(a + c) / 2, LOBBY.height / 2, -LOBBY.depth / 2],
        },
        0,
      );
    b.box(
      lobby.width,
      BLOCK.top - LOBBY.height,
      LOBBY.depth,
      tint(BRICK, -0.25),
      {
        at: [lobby.x, LOBBY.height + (BLOCK.top - LOBBY.height) / 2, -LOBBY.depth / 2],
      },
      0,
    );
    lobbyModel(b, lobby.x, lobby.width);
  }

  // The plinth and the brick band: courses in two shades, a pale joint every course.
  for (const [a, c] of low(0.05))
    b.box(c - a, BLOCK.plinth, 0.05, BRICK_DARK, { at: [(a + c) / 2, BLOCK.plinth / 2, 0.025] }, 0);
  const course = 0.1;
  for (let y = BLOCK.plinth, i = 0; y < BLOCK.brick - 0.01; y += course, i++) {
    for (const [a, c] of low(y)) {
      b.box(
        c - a,
        course - 0.014,
        0.03,
        i % 2 ? BRICK : tint(BRICK, 0.05),
        {
          at: [(a + c) / 2, y + course / 2, 0.015],
        },
        0,
      );
      b.box(c - a, 0.014, 0.025, MORTAR, { at: [(a + c) / 2, y + course - 0.007, 0.012] }, 0);
    }
  }
  b.box(
    w,
    BLOCK.sill - BLOCK.brick,
    0.08,
    SILL,
    {
      at: [cx, (BLOCK.brick + BLOCK.sill) / 2, 0.04],
    },
    0,
  );

  // The cladding band: panels with a dark joint every 0.6, the strip windows through it.
  const cladH = BLOCK.fascia - BLOCK.sill;
  b.box(w, cladH, 0.03, CLAD, { at: [cx, BLOCK.sill + cladH / 2, 0.015] }, 0);
  for (let x = x0 + 0.6; x < x1; x += 0.6)
    b.box(0.018, cladH, 0.035, CLAD_DARK, { at: [x, BLOCK.sill + cladH / 2, 0.017] }, 0);

  // The fascia, and the parapet's coping with a lip over the front.
  const fasciaH = BLOCK.top - BLOCK.fascia;
  b.box(w, fasciaH, 0.06, CLAD_DARK, { at: [cx, BLOCK.fascia + fasciaH / 2, 0.03] }, 0);
  b.box(w + 0.02, 0.06, 0.24, COPING, { at: [cx, BLOCK.top + 0.03, -0.04] }, 0);
  b.box(w + 0.02, 0.03, 0.02, tint(COPING, -0.2), { at: [cx, BLOCK.top - 0.005, 0.075] }, 0);
  // The flat roof, felt in strips, and plant on it: AC boxes, an extract fan, a vent stack.
  for (let z = -0.3, i = 0; z > -D; z -= 0.9, i++)
    b.box(
      w - 0.1,
      0.02,
      0.86,
      i % 2 ? ROOF : tint(ROOF, 0.06),
      {
        at: [cx, BLOCK.top + 0.012, z - 0.43],
      },
      0,
    );
  for (let x = x0 + 2.3, k = 0; x < x1 - 1; x += 3.7 + (k % 3) * 0.9, k++) {
    const z = -0.9 - (k % 2) * 0.6;
    if (k % 3 === 2) {
      b.cylinder(0.08, 0.08, 0.5, STEEL, { at: [x, BLOCK.top + 0.25, z] }, 10);
      b.cylinder(0.13, 0.13, 0.05, STEEL, { at: [x, BLOCK.top + 0.52, z] }, 10);
    } else {
      b.box(0.7, 0.36, 0.5, 0xa0a4a6, { at: [x, BLOCK.top + 0.18, z] }, 0.02);
      b.cylinder(0.18, 0.18, 0.02, DARK, { at: [x - 0.12, BLOCK.top + 0.37, z] }, 14);
    }
  }

  for (const u of units) unitFront(b, u, banner, lobby);
  // Brick piers between the units, proud of the face, and a downpipe beside each.
  const piers = [...new Set(units.flatMap((u) => [u.x0, u.x1]))].filter(
    (x) => x > x0 + 0.01 && x < x1 - 0.01,
  );
  for (const x of piers) {
    // Beside our unit the level's own wall stands in front: the pier keeps flush, no downpipe.
    const ours = units.some((u) => u.kind === 'ours' && (u.x0 === x || u.x1 === x));
    const d = ours ? 0.03 : 0.1;
    b.box(0.22, BLOCK.fascia, d, tint(BRICK, -0.08), { at: [x, BLOCK.fascia / 2, d / 2] }, 0);
    for (let y = 0.2; y < BLOCK.fascia; y += 0.2)
      b.box(0.225, 0.014, d, MORTAR, { at: [x, y, d / 2 + 0.002] }, 0);
    if (ours) continue;
    b.cylinder(
      0.035,
      0.035,
      BLOCK.top - 0.1,
      0x5a6066,
      {
        at: [x + 0.2, (BLOCK.top - 0.1) / 2, 0.08],
      },
      8,
    );
    b.box(0.12, 0.05, 0.16, 0x5a6066, { at: [x + 0.2, 0.03, 0.12] }, 0);
  }
  return b.build();
}

/** The strip window across a stretch: glass in a frame, mullions every 0.5. */
function stripWindow(b: ModelBuilder, a: number, c: number, look: 'lit' | 'dark' | 'blinds'): void {
  const h = BLOCK.window1 - BLOCK.window0;
  const y = (BLOCK.window0 + BLOCK.window1) / 2;
  const w = c - a;
  b.box(w, h + 0.04, 0.035, 0x3a3e44, { at: [(a + c) / 2, y, 0.03] }, 0);
  const n = Math.max(1, Math.round(w / 0.5));
  const pw = w / n;
  for (let i = 0; i < n; i++) {
    const x = a + (i + 0.5) * pw;
    if (look === 'lit' && i % 3 !== 1) b.screen(pw - 0.04, h - 0.04, LIT, { at: [x, y, 0.05] });
    else b.box(pw - 0.04, h - 0.04, 0.01, GLASS, { at: [x, y, 0.05] }, 0);
    if (look === 'blinds') {
      // Vertical blinds drawn, the slats catching the light, one gap where someone peeks.
      for (let s = -pw / 2 + 0.05; s < pw / 2 - 0.03; s += 0.045)
        if (!(i === 2 && s > 0))
          b.box(0.036, h - 0.06, 0.008, 0xd8d6cc, { at: [x + s, y, 0.058], rot: [0, 0.4, 0] }, 0);
    } else {
      b.box(
        0.06,
        h - 0.06,
        0.006,
        GLASS_GLINT,
        {
          at: [x - pw * 0.25, y + 0.02, 0.058],
          rot: [0, 0, -0.35],
        },
        0,
      );
    }
  }
}

/** One tenant's front: windows, the sign, and whatever stands at the ground floor. */
function unitFront(
  b: ModelBuilder,
  u: BlockUnit,
  banner: string,
  lobby: { x: number; width: number } | undefined,
): void {
  const a = u.x0 + 0.2;
  const c = u.x1 - 0.2;
  const cx = (u.x0 + u.x1) / 2;
  const w = c - a;
  const fy = (BLOCK.fascia + BLOCK.top) / 2;
  const fz = 0.06;
  switch (u.kind) {
    case 'ours': {
      stripWindow(b, a, c, 'lit');
      // The old tenant's name, faded paler on the fascia where the sign letters kept the sun off.
      // Right of middle, clear of the order cards over the top left of the screen.
      const sx = u.x0 + (u.x1 - u.x0) * 0.66;
      const ghost = 'FAXWORLD SUPPLIES';
      const gpx = Math.min(0.075, (w * 0.6) / textColumns(ghost));
      lettering(b, ghost, sx, fy, fz, gpx, tint(CLAD_DARK, 0.3), 0.003);
      // The vinyl banner over it, cable-tied at the corners; it doesn't quite cover the ghost.
      const bw = textColumns(ghost) * gpx * 0.8;
      const bh = 0.42;
      const by = fy - 0.04;
      b.box(bw, bh, 0.012, 0xe2ded2, { at: [sx, by, fz + 0.02], rot: [0.06, 0, 0] }, 0);
      b.box(bw, 0.05, 0.014, 0x3a7a8a, { at: [sx, by - bh / 2 + 0.05, fz + 0.03] }, 0);
      const bpx = Math.min(0.055, (bw - 0.5) / textColumns(banner));
      lettering(b, banner, sx + 0.12, by + 0.03, fz + 0.03, bpx, 0x2e4a5a);
      // A little rocket of a logo before the name.
      const lx = sx + 0.12 - (textColumns(banner) * bpx) / 2 - 0.16;
      b.box(0.1, 0.18, 0.02, 0xc0503e, { at: [lx, by + 0.03, fz + 0.035], rot: [0, 0, -0.5] }, 0);
      for (const s of [-1, 1])
        for (const t of [-1, 1])
          b.box(
            0.03,
            0.03,
            0.03,
            DARK,
            {
              at: [sx + s * (bw / 2 - 0.02), by + t * (bh / 2 - 0.02), fz + 0.03],
            },
            0,
          );
      // UNIT 4 on a little plate by the lobby door, when it shows.
      if (lobby) {
        const px = lobby.x + lobby.width / 2 + 0.25;
        b.box(0.34, 0.16, 0.02, 0x2e3440, { at: [px, 1.0, 0.04] }, 0);
        lettering(b, 'UNIT 4', px, 1.0, 0.05, 0.022, 0xd8d4c8, 0.004);
      }
      return;
    }
    case 'print': {
      stripWindow(b, a, c, 'dark');
      // The sign: a faded orange panel, KWIK PRINT in white.
      b.box(w - 0.3, 0.26, 0.03, 0xb0644a, { at: [cx, fy, fz + 0.015] }, 0.01);
      lettering(b, 'KWIK PRINT', cx, fy, fz + 0.03, Math.min(0.045, (w - 0.6) / 39), 0xece6d8);
      // The roller shutter, half up over a dark loading bay, ribbed; a pedestrian door by it.
      const sw = Math.min(2.4, w - 1.4);
      const sx = cx - 0.4;
      b.box(sw + 0.16, 1.18, 0.06, 0x50565c, { at: [sx, 0.59, 0.03] }, 0);
      b.box(sw, 0.46, 0.02, 0x1e2226, { at: [sx, 0.23, 0.065] }, 0);
      for (let y = 0.48; y < 1.12; y += 0.06)
        b.box(
          sw,
          0.05,
          0.025,
          tint(0x8a9298, (y * 13) % 2 > 1 ? 0.04 : -0.04),
          {
            at: [sx, y + 0.025, 0.07],
          },
          0,
        );
      b.box(sw + 0.2, 0.12, 0.14, 0x6a7078, { at: [sx, 1.2, 0.07] }, 0);
      // Stacked paper reams just inside, catching the light.
      for (let k = 0; k < 3; k++)
        b.box(
          0.32,
          0.14,
          0.24,
          0xdcd8cc,
          { at: [sx - 0.5 + k * 0.4, 0.07 + (k % 2) * 0.14, 0.02] },
          0,
        );
      const dx = sx + sw / 2 + 0.55;
      b.box(0.56, 1.04, 0.04, 0x3a3e44, { at: [dx, 0.52, 0.03] }, 0);
      b.box(0.46, 0.96, 0.02, 0x5a6a6e, { at: [dx, 0.5, 0.055] }, 0);
      b.box(0.3, 0.4, 0.01, 0xece6d8, { at: [dx, 0.66, 0.068] }, 0);
      return;
    }
    case 'dental': {
      stripWindow(b, a, c, 'blinds');
      b.box(w - 0.4, 0.24, 0.03, 0xdcdcd4, { at: [cx, fy, fz + 0.015] }, 0.01);
      lettering(
        b,
        'BRIGHT DENTAL LAB',
        cx,
        fy,
        fz + 0.03,
        Math.min(0.04, (w - 0.6) / 67),
        0x3a7a7a,
      );
      // Ground floor: frosted windows, a glazed door with a ramp and a handrail.
      const dx = cx + 0.6;
      for (const [p, q] of [
        [a + 0.1, dx - 0.5],
        [dx + 0.5, c - 0.1],
      ] as const) {
        if (q - p < 0.4) continue;
        b.box(q - p, 0.62, 0.03, 0x3a3e44, { at: [(p + q) / 2, 0.78, 0.03] }, 0);
        b.box(q - p - 0.06, 0.56, 0.01, 0xc8ccc8, { at: [(p + q) / 2, 0.78, 0.05] }, 0);
      }
      b.box(0.74, 1.12, 0.04, 0x3a3e44, { at: [dx, 0.56, 0.03] }, 0);
      b.box(0.62, 1.02, 0.01, GLASS, { at: [dx, 0.54, 0.055] }, 0);
      b.box(0.9, 0.05, 1.0, 0xa8a49a, { at: [dx, 0.025, 0.5], rot: [0.04, 0, 0] }, 0);
      b.cylinder(
        0.012,
        0.012,
        0.9,
        STEEL,
        {
          at: [dx + 0.42, 0.42, 0.52],
          rot: [Math.PI / 2, 0, 0],
        },
        6,
      );
      for (const z of [0.1, 0.95])
        b.cylinder(0.012, 0.012, 0.4, STEEL, { at: [dx + 0.42, 0.22, z] }, 6);
      return;
    }
    case 'tyres': {
      stripWindow(b, a, c, 'dark');
      b.box(w - 0.3, 0.26, 0.03, 0x3a3a3e, { at: [cx, fy, fz + 0.015] }, 0.01);
      lettering(
        b,
        'TYRES & EXHAUSTS',
        cx,
        fy,
        fz + 0.03,
        Math.min(0.045, (w - 0.6) / 63),
        0xd8b84a,
      );
      const sw = Math.min(2.6, w - 0.8);
      b.box(sw, 1.18, 0.05, 0x7a8288, { at: [cx, 0.59, 0.03] }, 0);
      for (let y = 0.06; y < 1.16; y += 0.06)
        b.box(sw, 0.012, 0.055, 0x5a6066, { at: [cx, y, 0.035] }, 0);
      return;
    }
    case 'toLet': {
      stripWindow(b, a, c, 'dark');
      // Nobody home: an agent's TO LET board on the fascia, the windows bare.
      b.box(1.4, 0.3, 0.03, 0xd8d4c8, { at: [cx, fy, fz + 0.015] }, 0.01);
      b.box(1.4, 0.07, 0.035, 0x8a3a4a, { at: [cx, fy + 0.115, fz + 0.016] }, 0);
      lettering(b, 'TO LET', cx, fy - 0.03, fz + 0.03, 0.035, 0x8a3a4a);
      for (let x = a + 0.4; x < c - 0.4; x += 1.4) {
        b.box(0.9, 1.0, 0.03, 0x3a3e44, { at: [x + 0.45, 0.62, 0.03] }, 0);
        b.box(0.84, 0.94, 0.01, GLASS, { at: [x + 0.45, 0.62, 0.05] }, 0);
      }
      return;
    }
  }
}

/** The lobby and post room behind the inbox: lit walls, pigeonholes, a doormat. */
function lobbyModel(b: ModelBuilder, x: number, width: number): void {
  const d = LOBBY.depth;
  const h = LOBBY.height;
  b.box(width, h, 0.02, LOBBY_WALL, { at: [x, h / 2, -d + 0.01] }, 0);
  for (const s of [-1, 1])
    b.box(
      0.02,
      h,
      d,
      tint(LOBBY_WALL, -0.12),
      { at: [x + (s * width) / 2 - s * 0.01, h / 2, -d / 2] },
      0,
    );
  b.box(width, 0.02, d, 0x5a5e66, { at: [x, 0.01, -d / 2] }, 0);
  b.box(width * 0.6, 0.01, 0.3, 0x3a3a3e, { at: [x, 0.025, -d / 2 + 0.05] }, 0);
  // The pigeonholes, stuffed with post.
  const pw = Math.min(width - 0.2, 0.9);
  b.box(pw, 0.5, 0.08, 0x9a7a5a, { at: [x, 0.9, -d + 0.05] }, 0);
  for (let i = 0; i < 4; i++)
    for (let j = 0; j < 3; j++) {
      const px = x - pw / 2 + ((i + 0.5) * pw) / 4;
      const py = 0.72 + j * 0.15;
      b.box(pw / 4 - 0.03, 0.12, 0.02, 0x4a3a2a, { at: [px, py, -d + 0.095] }, 0);
      if ((i + j) % 2 === 0)
        b.box(
          pw / 4 - 0.06,
          0.06,
          0.03,
          i % 3 ? WHITE : CARDBOARD,
          { at: [px, py - 0.02, -d + 0.105] },
          0,
        );
    }
  // A strip light on the ceiling, so the hole reads as lit, not as a void.
  b.screen(width * 0.7, 0.04, 0xeef2e8, { at: [x, h - 0.04, -d / 2], rot: [-Math.PI / 2, 0, 0] });
}

// ---- Cars and vans ----

/**
 * A car built to read from above, nose to +z: `paint`, a hatchback or a
 * saloon/estate (`long`), roof `roof` coloured, dark glass with a glint.
 */
function carModel(b: ModelBuilder, paint: number, long: boolean, roofBars = false): void {
  const glass = 0x2b3644;
  const glint = 0x9fb3c8;
  const L = long ? 2.9 : 2.55;
  const half = L / 2;
  b.box(1.34, 0.36, L, paint, { at: [0, 0.41, 0] }, 0.14);
  b.box(1.22, 0.05, 0.8, tint(paint, 0.07), { at: [0, 0.6, half - 0.45], rot: [0.07, 0, 0] }, 0.03);
  const cabin = long ? 1.6 : 1.25;
  const cz = long ? -0.2 : -0.25;
  b.box(1.18, 0.34, cabin, paint, { at: [0, 0.75, cz] }, 0.1);
  b.box(1.0, 0.04, cabin - 0.4, tint(paint, 0.18), { at: [0, 0.93, cz] }, 0.02);
  for (const [z, y, len, rot] of [
    [cz + cabin / 2 + 0.12, 0.76, 0.48, 0.8],
    [cz - cabin / 2 - (long ? 0.1 : 0.05), 0.77, 0.4, -0.95],
  ] as const) {
    b.box(1.06, 0.03, len, glass, { at: [0, y, z], rot: [rot, 0, 0] }, 0);
    b.box(
      0.1,
      0.03,
      len * 0.8,
      glint,
      {
        at: [0.28, y + Math.cos(rot) * 0.012, z + Math.sin(rot) * 0.012],
        rot: [rot, 0, 0],
      },
      0,
    );
  }
  for (const x of [-0.595, 0.595]) b.box(0.02, 0.18, cabin - 0.3, glass, { at: [x, 0.78, cz] }, 0);
  for (const s of [-1, 1])
    b.box(0.16, 0.08, 0.09, paint, { at: [s * 0.71, 0.72, cz + cabin / 2 - 0.05] }, 0.02);
  b.box(1.38, 0.12, 0.12, DARK, { at: [0, 0.29, half] }, 0.04);
  b.box(1.38, 0.12, 0.12, DARK, { at: [0, 0.29, -half] }, 0.04);
  b.box(0.34, 0.09, 0.02, 0xd8d4a0, { at: [0, 0.4, -half - 0.01] }, 0);
  const wz = half - 0.75;
  for (const [x, z] of [
    [-0.65, wz],
    [0.65, wz],
    [-0.65, -wz],
    [0.65, -wz],
  ] as const) {
    b.cylinder(0.22, 0.22, 0.2, INK, { at: [x, 0.22, z], rot: [0, 0, Math.PI / 2] }, 14);
    b.cylinder(0.1, 0.1, 0.21, STEEL, { at: [x, 0.22, z], rot: [0, 0, Math.PI / 2] }, 10);
  }
  for (const s of [-1, 1]) {
    b.box(0.28, 0.07, 0.06, 0xd8d4c0, { at: [s * 0.44, 0.54, half - 0.03] }, 0.01);
    b.box(0.24, 0.11, 0.05, 0xa8443a, { at: [s * 0.46, 0.52, -half + 0.04] }, 0.01);
    if (roofBars) b.box(0.04, 0.04, cabin - 0.3, DARK, { at: [s * 0.42, 0.97, cz] }, 0);
  }
}

/** Parked cars in muted colours: silver, slate blue, a dull green estate, a white saloon, a black one. */
const CAR_PAINTS = [0x9aa0a6, 0x4a5a72, 0x5a6a58, 0xc8c8c0, 0x2e3238, 0x7a4a4a] as const;
export const parkedCar = looks([1.5, 2.9], CAR_PAINTS.length, (b, v) => {
  carModel(b, nth(CAR_PAINTS, v), v % 2 === 0, v === 2);
});

/**
 * The founders' leased hatchback: a sensible muted teal, too clean, the
 * lease company's sticker in the back window and a parking permit on the
 * dash, a "BABY ON BOARD"-yellow L of a sunshade folded on the parcel shelf.
 */
export const leasedHatchback = looks([1.5, 2.6], 1, (b) => {
  carModel(b, 0x4a7a7a, false);
  b.box(0.3, 0.12, 0.01, 0xe8e2c8, { at: [-0.25, 0.8, -1.08], rot: [-0.95, 0, 0] }, 0);
  b.box(0.16, 0.01, 0.12, 0xd8c060, { at: [0.3, 0.64, 0.52] }, 0);
  // A dealer's number plate surround and a sat-nav suction mark: new.
  b.box(0.4, 0.12, 0.012, 0x2e4a5a, { at: [0, 0.4, -1.3] }, 0);
});

/**
 * The courier's van, nose to +z, its back doors swung wide open toward −z:
 * white with a muted blue stripe, parcels stacked inside on a ply floor,
 * an orange beacon bar on the roof.
 */
export const courierVan = looks([1.6, 3.4], 1, (b) => {
  const paint = 0xd8d8d2;
  const stripe = 0x3a5a7a;
  const L = 3.4;
  const half = L / 2;
  const H = 1.22;
  // The load box: walls round a dark, empty-ish inside, so it reads open from above.
  const box0 = -half;
  const box1 = 0.55;
  const bl = box1 - box0;
  const bc = (box0 + box1) / 2;
  b.box(1.48, 0.16, bl, DARK, { at: [0, 0.3, bc] }, 0);
  b.box(1.36, 0.02, bl - 0.1, 0x8a7458, { at: [0, 0.39, bc] }, 0);
  for (const s of [-1, 1]) {
    b.box(0.06, H - 0.3, bl, paint, { at: [s * 0.71, 0.3 + (H - 0.3) / 2, bc] }, 0.02);
    b.box(0.065, 0.1, bl - 0.2, stripe, { at: [s * 0.715, 0.62, bc] }, 0);
  }
  b.box(1.48, 0.06, bl, paint, { at: [0, H - 0.03, bc] }, 0.02);
  b.box(1.36, 0.04, 0.06, tint(paint, -0.1), { at: [0, H - 0.08, box0 + 0.03] }, 0);
  // Parcels inside, stacked against the bulkhead.
  for (let k = 0; k < 5; k++) {
    const w = 0.3 + (k % 3) * 0.08;
    b.box(
      w,
      0.22,
      0.28,
      k % 2 ? CARDBOARD : tint(CARDBOARD, -0.12),
      {
        at: [-0.4 + (k % 3) * 0.4, 0.51 + Math.floor(k / 3) * 0.22, box1 - 0.25 - (k % 2) * 0.15],
        rot: [0, k * 0.2, 0],
      },
      0.01,
    );
  }
  // The cab: a sloped nose, windscreen, mirrors.
  b.box(1.48, 0.62, 0.9, paint, { at: [0, 0.6, box1 + 0.45] }, 0.1);
  b.box(1.4, 0.32, 0.6, paint, { at: [0, 1.04, box1 + 0.3] }, 0.08);
  b.box(1.3, 0.03, 0.5, 0x2b3644, { at: [0, 1.0, box1 + 0.66], rot: [0.9, 0, 0] }, 0);
  b.box(0.1, 0.03, 0.4, 0x9fb3c8, { at: [0.3, 1.01, box1 + 0.67], rot: [0.9, 0, 0] }, 0);
  for (const s of [-1, 1]) b.box(0.18, 0.14, 0.06, DARK, { at: [s * 0.82, 0.9, box1 + 0.4] }, 0.02);
  b.box(0.7, 0.07, 0.14, 0xd8843a, { at: [0, H + 0.04, box1 + 0.2] }, 0.02);
  // What shows from the car park: the roof's back edge, a brake light, the firm's blue roof
  // panel with its parcel-box logo, and a roof-mounted orange beacon.
  b.box(1.1, 0.012, 1.0, stripe, { at: [0, H + 0.006, box0 + 0.75] }, 0);
  b.box(0.36, 0.014, 0.3, CARDBOARD, { at: [0, H + 0.014, box0 + 0.75] }, 0);
  b.box(0.36, 0.016, 0.05, 0xc8c0a8, { at: [0, H + 0.016, box0 + 0.75] }, 0);
  b.box(0.4, 0.05, 0.05, 0xa8443a, { at: [0, H - 0.03, box0 + 0.02] }, 0.01);
  b.box(0.22, 0.08, 0.12, 0xd8843a, { at: [0.5, H + 0.04, box0 + 0.25] }, 0.02);
  b.box(1.5, 0.14, 0.12, DARK, { at: [0, 0.27, half] }, 0.04);
  b.box(1.5, 0.12, 0.14, DARK, { at: [0, 0.22, box0 - 0.02] }, 0.03);
  for (const [x, z] of [
    [-0.7, half - 0.6],
    [0.7, half - 0.6],
    [-0.7, box0 + 0.6],
    [0.7, box0 + 0.6],
  ] as const) {
    b.cylinder(0.24, 0.24, 0.2, INK, { at: [x, 0.24, z], rot: [0, 0, Math.PI / 2] }, 14);
    b.cylinder(0.1, 0.1, 0.21, STEEL, { at: [x, 0.24, z], rot: [0, 0, Math.PI / 2] }, 10);
  }
  // The back doors, swung out past the sides, their inside faces to the camera.
  for (const s of [-1, 1]) {
    const dw = 0.72;
    // Hinged at the rear corner, swung right open: winged out along the sides.
    const theta = (245 * Math.PI) / 180;
    const dx = -s * Math.cos(theta);
    const dz = -Math.sin(theta);
    const hx = s * 0.74;
    const mx = hx + (dx * dw) / 2;
    const mz = box0 + (dz * dw) / 2;
    const yaw = Math.atan2(-dz, dx);
    b.box(
      dw,
      H - 0.3,
      0.05,
      tint(paint, -0.06),
      { at: [mx, 0.3 + (H - 0.3) / 2, mz], rot: [0, yaw, 0] },
      0.02,
    );
    b.box(dw * 0.6, 0.28, 0.06, 0x2b3644, { at: [mx, 1.0, mz], rot: [0, yaw, 0] }, 0);
    b.box(0.08, 0.2, 0.06, 0xa8443a, { at: [s * 0.7, 0.62, box0 - 0.02] }, 0.01);
  }
});

/** A concrete wheel stop at the head of a bay. */
export const wheelStop = looks([1, 0.3], 1, (b) => {
  b.box(0.9, 0.08, 0.14, 0xa8a49c, { at: [0, 0.04, 0] }, 0.02);
  for (const x of [-0.3, 0.3]) b.box(0.12, 0.081, 0.15, 0xc8b440, { at: [x, 0.041, 0] }, 0);
});

// ---- The bin store ----

/**
 * A four-wheeled 1100-litre commercial bin: grey body, a coloured lid
 * (black general waste, blue recycling with a box poking out, green glass),
 * one lid propped open on bin bags.
 */
export const commercialBin = looks([1.2, 0.9], 3, (b, v) => {
  const body = nth([0x6a6e72, 0x5a6066, 0x6a7068], v);
  const lid = nth([0x2e3236, 0x3a5a7a, 0x3a6a4a], v);
  b.box(1.1, 0.86, 0.8, body, { at: [0, 0.55, 0] }, 0.04);
  for (let x = -0.45; x <= 0.46; x += 0.3)
    b.box(0.02, 0.6, 0.01, tint(body, -0.15), { at: [x, 0.55, 0.405] }, 0);
  for (const [x, z] of [
    [-0.45, 0.3],
    [0.45, 0.3],
    [-0.45, -0.3],
    [0.45, -0.3],
  ] as const)
    b.cylinder(0.07, 0.07, 0.05, INK, { at: [x, 0.07, z], rot: [0, 0, Math.PI / 2] }, 8);
  b.box(1.0, 0.04, 0.05, STEEL, { at: [0, 0.82, 0.43] }, 0);
  if (v === 0) {
    // Lid propped up on overflowing black bags.
    for (let k = 0; k < 3; k++)
      b.sphere(0.24, 0x26282c, { at: [-0.3 + k * 0.3, 1.02, 0.02 + (k % 2) * 0.08] }, [1, 0.8, 1]);
    b.box(1.12, 0.05, 0.84, lid, { at: [0, 1.28, -0.28], rot: [-1.0, 0, 0] }, 0.02);
    b.sphere(0.22, 0x26282c, { at: [0.55, 0.2, 0.55] }, [1, 0.8, 1]);
  } else {
    b.box(1.12, 0.06, 0.84, lid, { at: [0, 1.0, 0], rot: [0.06, 0, 0] }, 0.02);
    if (v === 1)
      b.box(0.5, 0.06, 0.4, CARDBOARD, { at: [0.1, 1.06, 0.2], rot: [0.3, 0.3, 0] }, 0.01);
  }
});

/** A bale of flattened delivery boxes, strapped, and a loose few leaning on it. */
export const cardboardBale = looks([1, 0.8], 2, (b, v) => {
  for (let i = 0; i < 9; i++)
    b.box(
      0.8,
      0.07,
      0.6,
      i % 3 ? CARDBOARD : tint(CARDBOARD, -0.14),
      {
        at: [((i * 7) % 3) * 0.01, 0.04 + i * 0.07, 0],
      },
      0,
    );
  for (const x of [-0.22, 0.22]) b.box(0.03, 0.66, 0.62, 0x2e3236, { at: [x, 0.33, 0] }, 0);
  if (v === 1) {
    b.box(
      0.6,
      0.5,
      0.03,
      tint(CARDBOARD, -0.08),
      { at: [0.1, 0.3, 0.38], rot: [-0.25, 0.1, 0] },
      0,
    );
    b.box(0.5, 0.42, 0.03, CARDBOARD, { at: [-0.15, 0.25, 0.44], rot: [-0.32, -0.2, 0] }, 0);
  }
});

/**
 * The smoking shelter: a green steel frame with a clear corrugated roof
 * sloping back, a slatted bench inside and a wall-mounted ash bin; opens to +z.
 */
export const smokingShelter = looks([1.8, 1.0], 1, (b) => {
  const frame = 0x3a5a4a;
  const W = 1.8;
  const D = 0.9;
  for (const [x, z, h] of [
    [-W / 2, -D / 2, 1.5],
    [W / 2, -D / 2, 1.5],
    [-W / 2, D / 2, 1.62],
    [W / 2, D / 2, 1.62],
  ] as const)
    b.box(0.05, h, 0.05, frame, { at: [x, h / 2, z] }, 0);
  b.box(W + 0.1, 0.03, D + 0.2, 0xb8c8c8, { at: [0, 1.58, 0], rot: [0.13, 0, 0] }, 0);
  for (let x = -W / 2; x <= W / 2 + 0.01; x += 0.15)
    b.box(0.012, 0.035, D + 0.2, 0x9aaab0, { at: [x, 1.6, 0], rot: [0.13, 0, 0] }, 0);
  // Clear back and sides, seen as frames with a pale sheen.
  b.box(W, 1.2, 0.02, 0x9aa8ac, { at: [0, 0.8, -D / 2] }, 0);
  for (const s of [-1, 1])
    b.box(0.02, 1.0, D * 0.7, 0x9aa8ac, { at: [s * (W / 2), 0.7, -D * 0.15] }, 0);
  for (let k = 0; k < 3; k++)
    b.box(W - 0.3, 0.03, 0.08, 0x8a6a4a, { at: [0, 0.42, -D / 2 + 0.12 + k * 0.1] }, 0);
  for (const x of [-0.6, 0.6]) b.box(0.04, 0.42, 0.3, DARK, { at: [x, 0.21, -D / 2 + 0.22] }, 0);
  b.box(0.16, 0.26, 0.1, 0x8a9298, { at: [W / 2 - 0.2, 0.95, -D / 2 + 0.07] }, 0.02);
  // A NO SMOKING sign stuck inside, of course.
  b.box(0.24, 0.16, 0.01, WHITE, { at: [-0.5, 1.12, -D / 2 + 0.02] }, 0);
  b.torus(0.05, 0.01, 0xc0503e, { at: [-0.5, 1.12, -D / 2 + 0.03] });
});

/** A cigarette bin on a post. */
export const ashPost = looks([0.3, 0.3], 1, (b) => {
  b.cylinder(0.03, 0.03, 0.7, 0x5a6066, { at: [0, 0.35, 0] }, 8);
  b.cylinder(0.09, 0.08, 0.26, 0x7a8288, { at: [0, 0.82, 0] }, 12);
  b.cylinder(0.095, 0.095, 0.03, DARK, { at: [0, 0.96, 0] }, 12);
  for (let k = 0; k < 6; k++)
    b.box(
      0.04,
      0.01,
      0.012,
      0xe8e0c8,
      {
        at: [Math.cos(k * 1.7) * (0.12 + k * 0.03), 0.006, Math.sin(k * 2.3) * (0.1 + k * 0.03)],
        rot: [0, k, 0],
      },
      0,
    );
});

/** A run of three Sheffield stands, one bike locked to it (a muted red commuter). */
export const bikeRack = looks([0.6, 1.6], 1, (b) => {
  for (const z of [-0.55, 0, 0.55]) {
    for (const x of [-0.22, 0.22]) b.cylinder(0.022, 0.022, 0.6, STEEL, { at: [x, 0.3, z] }, 6);
    b.torus(0.22, 0.022, STEEL, { at: [0, 0.6, z] }, Math.PI);
  }
  const frame = 0x8a4a42;
  const z = 0.27;
  for (const x of [-0.4, 0.42]) b.torus(0.24, 0.025, INK, { at: [x, 0.26, z] });
  b.cylinder(0.02, 0.02, 0.62, frame, { at: [0.02, 0.42, z], rot: [0, 0, Math.PI / 2] }, 6);
  b.cylinder(0.02, 0.02, 0.5, frame, { at: [-0.18, 0.36, z], rot: [0, 0, 0.9] }, 6);
  b.cylinder(0.02, 0.02, 0.48, frame, { at: [0.25, 0.4, z], rot: [0, 0, -0.5] }, 6);
  b.box(0.18, 0.04, 0.08, INK, { at: [-0.2, 0.64, z] }, 0.01);
  b.cylinder(0.015, 0.015, 0.4, DARK, { at: [0.38, 0.68, z], rot: [Math.PI / 2, 0, 0] }, 6);
});

// ---- The verge and the car park furniture ----

/**
 * A sad corporate shrub: a clipped evergreen dome, a bit brown on one side,
 * in bark mulch. Three looks: a dome, a pair, a struggling one with a
 * crisp packet caught in it.
 */
export const corporateShrub = looks([0.8, 0.8], 3, (b, v) => {
  const leaf = nth([0x4a6a48, 0x52704a, 0x5a6a44], v);
  if (v === 1) {
    b.sphere(0.24, leaf, { at: [-0.18, 0.2, 0] }, [1, 0.8, 1]);
    b.sphere(0.2, tint(leaf, 0.08), { at: [0.2, 0.17, 0.05] }, [1, 0.8, 1]);
  } else {
    b.sphere(0.32, leaf, { at: [0, 0.24, 0] }, [1, 0.78, 1]);
    b.sphere(0.18, 0x7a6a44, { at: [0.18, 0.22, 0.12] }, [1, 0.7, 1]);
    b.sphere(0.2, tint(leaf, 0.1), { at: [-0.08, 0.38, -0.04] }, [1, 0.7, 1]);
  }
  if (v === 2) b.box(0.1, 0.06, 0.01, 0xc8a040, { at: [0.12, 0.3, 0.3], rot: [0.3, 0.5, 0] }, 0);
});

/** A young ornamental tree in the verge, staked, with a thin round head. */
export const verjeTree = looks([0.8, 0.8], 2, (b, v) => {
  b.cylinder(0.04, 0.05, 1.4, 0x6a5a4a, { at: [0, 0.7, 0] }, 7);
  b.cylinder(0.02, 0.02, 0.9, 0x9a8a6a, { at: [0.1, 0.45, 0.02], rot: [0, 0, -0.06] }, 5);
  const leaf = v ? 0x5a7a4a : 0x6a7a48;
  b.sphere(0.5, leaf, { at: [0, 1.65, 0] }, [1, 1.1, 1]);
  b.sphere(0.3, tint(leaf, 0.1), { at: [0.25, 1.85, 0.15] });
  b.sphere(0.28, tint(leaf, -0.08), { at: [-0.22, 1.5, -0.1] });
});

/** The business park's sign totem: a grey slab listing the tenants, unit by unit. */
export const signTotem = looks([0.9, 0.3], 1, (b) => {
  b.box(0.82, 1.5, 0.22, 0x5a6068, { at: [0, 0.78, 0] }, 0.03);
  b.box(0.9, 0.08, 0.28, 0x8a9096, { at: [0, 1.56, 0] }, 0.02);
  b.box(0.9, 0.06, 0.3, 0x8a9096, { at: [0, 0.03, 0] }, 0.02);
  b.box(0.72, 0.18, 0.01, 0x3a5a6a, { at: [0, 1.36, 0.115] }, 0);
  lettering(b, 'RINGWAY', 0, 1.36, 0.12, 0.022, 0xe8e4d8, 0.004);
  const rows = ['1 KWIK PRINT', '2 TO LET', '3 TYRES', '4 ????', '5 DENTAL LAB'];
  rows.forEach((t, k) => {
    const y = 1.12 - k * 0.17;
    b.box(0.72, 0.13, 0.01, k === 3 ? 0xe8e4d8 : 0xc8c8c0, { at: [0, y, 0.115] }, 0);
    lettering(b, t, 0, y, 0.12, 0.016, k === 3 ? 0xc0503e : 0x3a3e44, 0.003);
  });
});

/** A car park lamp post: a tall grey pole, the lantern on an arm out over the bays. */
export const lampPost = looks([0.4, 0.4], 1, (b) => {
  b.cylinder(0.05, 0.07, 2.6, 0x5a6066, { at: [0, 1.3, 0] }, 8);
  b.cylinder(0.1, 0.1, 0.2, 0x4a5056, { at: [0, 0.1, 0] }, 8);
  b.box(0.6, 0.04, 0.04, 0x5a6066, { at: [0.28, 2.58, 0] }, 0);
  b.box(0.36, 0.08, 0.18, 0x4a5056, { at: [0.56, 2.56, 0] }, 0.02);
  b.box(0.3, 0.02, 0.14, 0xd8d8c8, { at: [0.56, 2.51, 0] }, 0);
  // The lantern still on in the grey morning: its lens in the glow layer.
  b.led(0.07, COLOR.lampLight, { at: [0.56, 2.5, 0] });
});

/**
 * A steel mesh cage of water-cooler bottles, five-gallon blues stacked on
 * their sides, a couple of empties on top, padlocked.
 */
export const bottleCage = looks([1, 0.7], 1, (b) => {
  const mesh = 0x7a8288;
  const W = 0.9;
  const D = 0.6;
  const H = 1.05;
  for (const [x, z] of [
    [-W / 2, -D / 2],
    [W / 2, -D / 2],
    [-W / 2, D / 2],
    [W / 2, D / 2],
  ] as const)
    b.box(0.03, H, 0.03, mesh, { at: [x, H / 2, z] }, 0);
  for (const y of [0.04, H / 2, H]) {
    b.box(W, 0.02, 0.02, mesh, { at: [0, y, D / 2] }, 0);
    b.box(W, 0.02, 0.02, mesh, { at: [0, y, -D / 2] }, 0);
    b.box(0.02, 0.02, D, mesh, { at: [-W / 2, y, 0] }, 0);
    b.box(0.02, 0.02, D, mesh, { at: [W / 2, y, 0] }, 0);
  }
  for (let x = -W / 2 + 0.1; x < W / 2; x += 0.1)
    b.box(0.006, H, 0.006, mesh, { at: [x, H / 2, D / 2 + 0.01] }, 0);
  for (let r = 0; r < 3; r++)
    for (let k = 0; k < 3; k++) {
      const full = r < 2 || k === 1;
      b.cylinder(
        0.12,
        0.12,
        0.42,
        full ? 0x6a9ab8 : 0xa8c4d4,
        {
          at: [-0.27 + k * 0.27, 0.16 + r * 0.26, 0],
          rot: [Math.PI / 2, 0, 0],
        },
        12,
      );
      b.cylinder(
        0.05,
        0.05,
        0.06,
        0x2e5a8a,
        { at: [-0.27 + k * 0.27, 0.16 + r * 0.26, 0.24], rot: [Math.PI / 2, 0, 0] },
        8,
      );
    }
  b.box(0.06, 0.08, 0.03, 0xb8a050, { at: [W / 2 - 0.05, 0.6, D / 2 + 0.03] }, 0.01);
});

/** A wooden pallet, sometimes with a shrink-wrapped stack of printer paper. */
export const pallet = looks([1, 0.8], 2, (b, v) => {
  for (const z of [-0.32, 0, 0.32]) b.box(0.9, 0.08, 0.1, 0x9a7a52, { at: [0, 0.04, z] }, 0);
  for (let x = -0.4; x <= 0.41; x += 0.16)
    b.box(0.12, 0.025, 0.76, 0xae8c5e, { at: [x, 0.095, 0] }, 0);
  if (v === 1) {
    b.box(0.8, 0.4, 0.66, 0xdedad0, { at: [0, 0.31, 0] }, 0.02);
    b.box(0.82, 0.02, 0.68, 0xb8c8d0, { at: [0, 0.52, 0] }, 0);
  }
});

/** A traffic cone. */
export const cone = looks([0.4, 0.4], 1, (b) => {
  b.box(0.3, 0.03, 0.3, 0x3a3a3e, { at: [0, 0.015, 0] }, 0.01);
  b.cone(0.1, 0.4, 0xc8683a, { at: [0, 0.22, 0] }, 12);
  b.cylinder(0.065, 0.075, 0.06, WHITE, { at: [0, 0.24, 0] }, 12);
});

/** A courier's parcel, carried at chest height. */
export const carriedParcel = looks([0.4, 0.4], 1, (b) => {
  b.box(0.36, 0.24, 0.28, CARDBOARD, { at: [0, 0, 0] }, 0.02);
  b.box(0.365, 0.03, 0.08, 0xc8c0a8, { at: [0, 0.11, 0] }, 0);
  b.box(0.12, 0.08, 0.005, WHITE, { at: [0.08, 0.02, 0.142] }, 0);
});

/** A low concrete bollard by the kerb. */
export const bollard = looks([0.3, 0.3], 1, (b) => {
  b.cylinder(0.09, 0.1, 0.5, 0xa8a49c, { at: [0, 0.25, 0] }, 12);
  b.cylinder(0.092, 0.092, 0.05, 0x3a3e44, { at: [0, 0.4, 0] }, 12);
});

/** A grit bin: a squat yellow box by the verge, half the lid broken. */
export const gritBin = looks([0.7, 0.5], 1, (b) => {
  b.box(0.62, 0.42, 0.44, 0xa8903a, { at: [0, 0.21, 0] }, 0.04);
  b.box(0.66, 0.06, 0.48, tint(0xa8903a, -0.1), { at: [0, 0.45, -0.02], rot: [-0.08, 0, 0] }, 0.02);
  lettering(b, 'GRIT', 0, 0.24, 0.22, 0.02, 0x2e3236, 0.004);
});

/** A dark-green leylandii hedge block, the park's boundary, a tile long. */
export const parkHedge = looks([1, 0.7], 2, (b, v) => {
  const c = v ? LEAF_DARK : 0x3e5e44;
  b.box(1.02, 0.9, 0.6, tint(c, -0.15), { at: [0, 0.45, 0] }, 0.08);
  b.sphere(0.36, c, { at: [-0.25, 0.75, 0.04] }, [1, 0.6, 0.9]);
  b.sphere(0.34, tint(c, 0.06), { at: [0.25, 0.78, -0.02] }, [1, 0.6, 0.9]);
});
