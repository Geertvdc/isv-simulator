import { type Model, ModelBuilder, tint } from '../kit';
import { framed, text } from '../roomModels/basement';
import type { ReorgTopKind } from '../rooms/reorgRoom';

/**
 * The move's kit on the reorg floor's wall tops and sills (see
 * `rooms/reorgRoom.ts` for where it goes), chunky and a little over life
 * size, few bold colours (crate blue, tape yellow, consultancy teal, YOTTA
 * violet, cardboard): stacked removal crates with numbered lids, an open
 * crate of binders, rolls of floor tape and a tape gun, a label maker, a
 * desk lamp in bubble wrap, a pile of org charts in red pen, a laptop on a
 * crate showing a slide, cable spools, a WHERE IS MY DESK? sign, a FRAGILE
 * box, a monitor in stretch wrap, a pot plant in a box, Derek's crate with
 * his lanyard on it, an archive box of plans, a roll of stretch wrap, a
 * desk phone in a bag, a mini flip chart, coffee in a carrier, keyboards
 * in a rubber band, a roll of bubble wrap, a hook of move tags; low for the
 * sills a roll of tape lying flat, sheets of numbered tags, a pile of
 * lanyards, a stack of cups, the move plan in a folder, the deck printed
 * out. And Segfault's bed: a cardboard box marked MATRIX with a blanket in
 * it (the cat itself is a living scene piece, so it can breathe).
 * Each built facing the room (+z), standing on the top at the origin.
 * Office kit only: nothing to eat.
 */

/** Removal-crate blue, a touch dusty (desaturated so it never outshouts a station). */
export const CRATE_BLUE = 0x3f6a9a;
const CRATE_LID = 0x4f7aa8;
/** Floor-tape yellow, desaturated. */
export const TAPE_YELLOW = 0xc9b45c;
/** The consultancy's teal. */
export const TEAL = 0x3f8f8a;
export const CARDBOARD = 0xa9865a;
const CARDBOARD_DARK = 0x8a6a44;
const BROWN_TAPE = 0xb89a68;
const VIOLET = 0x6a4cc0;
const PAPER = 0xeeede6;
const INK = 0x24272c;
const RED = 0xb8342c;
const STEEL = 0xa3abb2;
const DARK = 0x2c3036;
const BUBBLE = 0xc8d6de;
const WRAP = 0xd4dde2;
const WHITE = 0xe8e9e6;

/** A crate: its body, the ribs round it, the hinged lid with a number. */
function crate(
  b: ModelBuilder,
  x: number,
  y: number,
  z: number,
  n: string,
  lid = true,
  turn = 0,
): void {
  const w = 0.34;
  const h = 0.17;
  const d = 0.24;
  const c = framed(b, [x, y, z], [0, turn, 0]);
  c.box(w, h, d, CRATE_BLUE, { at: [0, h / 2, 0] }, 0.02);
  for (const s of [-1, 1])
    c.box(0.012, h - 0.04, d + 0.01, tint(CRATE_BLUE, -0.25), { at: [s * 0.11, h / 2, 0] }, 0);
  // Its hand hole.
  c.box(0.08, 0.025, 0.004, DARK, { at: [0, h - 0.04, d / 2 + 0.002] }, 0);
  if (lid) {
    c.box(w + 0.01, 0.025, d + 0.01, CRATE_LID, { at: [0, h + 0.012, 0] }, 0.008);
    c.box(0.01, 0.005, d + 0.012, tint(CRATE_LID, -0.3), { at: [0, h + 0.026, 0] }, 0);
    c.box(0.09, 0.004, 0.07, PAPER, { at: [0.09, h + 0.027, 0.03] }, 0);
    const t = framed(c, [0.09, h + 0.03, 0.03], [-Math.PI / 2, 0, 0]);
    text(t, n, 0, 0, 0, 0.009, INK);
  }
  // A label on its front.
  c.box(0.1, 0.05, 0.003, PAPER, { at: [-0.07, h / 2, d / 2 + 0.002] }, 0);
  text(c, n, -0.07, h / 2, d / 2 + 0.004, 0.0075, INK);
}

/** A cardboard box `w` × `h` × `d`, its taped seam, flaps shut. */
function box(
  b: ModelBuilder,
  w: number,
  h: number,
  d: number,
  at: [number, number, number],
  turn = 0,
  color = CARDBOARD,
): ModelBuilder {
  const c = framed(b, at, [0, turn, 0]);
  c.box(w, h, d, color, { at: [0, h / 2, 0] }, 0.012);
  c.box(w + 0.004, 0.004, 0.05, BROWN_TAPE, { at: [0, h + 0.001, 0] }, 0);
  c.box(0.05, h * 0.4, 0.004, BROWN_TAPE, { at: [0, h * 0.8, d / 2 + 0.002] }, 0);
  return c;
}

const crateStack = (): Model => {
  const b = new ModelBuilder();
  crate(b, 0, 0, 0, '17', false, 0.05);
  crate(b, 0.01, 0.17, 0, '18', true, -0.08);
  return b.build();
};

const crateOpen = (): Model => {
  const b = new ModelBuilder();
  crate(b, 0, 0, 0, '24', false);
  // Binders standing in it, a cable tail over the edge; the lid leaning behind.
  [0x3c4a6a, TEAL, 0x6a7380, VIOLET].forEach((c, k) =>
    b.box(
      0.05,
      0.2,
      0.2,
      c,
      { at: [-0.1 + k * 0.065, 0.13, 0], rot: [0, 0, (k - 1.5) * 0.08] },
      0.008,
    ),
  );
  b.box(0.2, 0.012, 0.012, DARK, { at: [0.15, 0.17, 0.08], rot: [0, 0.4, -0.8] }, 0);
  b.box(0.36, 0.025, 0.25, CRATE_LID, { at: [0, 0.16, -0.16], rot: [-1.2, 0, 0] }, 0.008);
  return b.build();
};

const tapeRolls = (): Model => {
  const b = new ModelBuilder();
  const roll = (x: number, y: number, z: number, c: number) => {
    b.cylinder(0.075, 0.075, 0.05, c, { at: [x, y + 0.025, z] }, 20);
    b.cylinder(0.04, 0.04, 0.052, tint(CARDBOARD, -0.1), { at: [x, y + 0.025, z] }, 16);
  };
  roll(-0.06, 0, 0, TAPE_YELLOW);
  roll(-0.06, 0.05, 0, TAPE_YELLOW);
  roll(-0.05, 0.1, 0.01, TEAL);
  roll(0.11, 0, 0.04, 0xd8d6cf);
  // A tape gun lying beside them.
  b.box(0.16, 0.035, 0.05, RED, { at: [0.12, 0.02, -0.08], rot: [0, 0.3, 0] }, 0.01);
  b.cylinder(
    0.05,
    0.05,
    0.05,
    BROWN_TAPE,
    { at: [0.15, 0.075, -0.09], rot: [Math.PI / 2, 0.3, 0] },
    16,
  );
  return b.build();
};

const labelMaker = (): Model => {
  const b = new ModelBuilder();
  b.box(0.12, 0.05, 0.22, 0x2a2e34, { at: [0, 0.025, 0], rot: [0, 0.2, 0] }, 0.015);
  b.box(0.09, 0.004, 0.06, 0x8ab0a0, { at: [0, 0.052, -0.05], rot: [0, 0.2, 0] }, 0);
  for (let k = 0; k < 9; k++)
    b.box(
      0.018,
      0.006,
      0.018,
      0x5a6068,
      {
        at: [-0.03 + (k % 3) * 0.03 + 0.012, 0.052, 0.02 + Math.floor(k / 3) * 0.03],
      },
      0,
    );
  b.box(0.1, 0.03, 0.06, TAPE_YELLOW, { at: [0, 0.03, 0.12], rot: [0, 0.2, 0] }, 0.008);
  // The label curling out: TRIBE?
  b.box(0.16, 0.003, 0.028, WHITE, { at: [0.13, 0.008, 0.18], rot: [0, -0.5, 0] }, 0);
  const t = framed(b, [0.13, 0.0105, 0.18], [-Math.PI / 2, 0, 0.5]);
  text(t, 'TRIBE?', 0, 0, 0, 0.0045, INK);
  // A sheet of printed labels.
  b.box(0.16, 0.004, 0.2, PAPER, { at: [-0.16, 0.002, 0.04], rot: [0, -0.3, 0] }, 0);
  return b.build();
};

const lampWrapped = (): Model => {
  const b = new ModelBuilder();
  b.cylinder(0.07, 0.08, 0.03, DARK, { at: [0, 0.015, 0] }, 16);
  b.cylinder(0.012, 0.012, 0.22, DARK, { at: [0.02, 0.14, 0], rot: [0, 0, -0.2] }, 8);
  b.cone(0.08, 0.1, DARK, { at: [0.07, 0.27, 0.02], rot: [0, 0, 2.4] }, 14);
  // The bubble wrap round it: pale lumps, a strip of tape.
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * Math.PI * 2;
    b.sphere(
      0.07,
      BUBBLE,
      { at: [Math.cos(a) * 0.05 + 0.03, 0.08 + (k % 3) * 0.07, Math.sin(a) * 0.05] },
      [1, 0.9, 0.8],
    );
  }
  b.sphere(0.09, BUBBLE, { at: [0.06, 0.25, 0.02] }, [1, 0.75, 0.9]);
  b.box(0.18, 0.03, 0.17, BROWN_TAPE, { at: [0.03, 0.15, 0] }, 0.01);
  return b.build();
};

const orgCharts = (): Model => {
  const b = new ModelBuilder();
  for (let k = 0; k < 6; k++)
    b.box(
      0.3,
      0.01,
      0.22,
      k % 2 ? PAPER : tint(PAPER, -0.05),
      {
        at: [(k % 3) * 0.01 - 0.01, 0.005 + k * 0.011, (k % 2) * 0.01],
        rot: [0, (k - 2.5) * 0.06, 0],
      },
      0,
    );
  // The top chart: boxes and lines, crossed out in red pen.
  const t = framed(b, [0, 0.068, 0], [-Math.PI / 2, 0, 0.1]);
  t.box(0.06, 0.035, 0.002, TEAL, { at: [0, 0.06, 0] }, 0);
  for (const x of [-0.09, 0, 0.09]) {
    t.box(0.05, 0.03, 0.002, 0x8a96a4, { at: [x, -0.02, 0] }, 0);
    t.box(0.004, 0.05, 0.002, INK, { at: [x, 0.02, 0] }, 0);
  }
  t.box(0.19, 0.004, 0.002, INK, { at: [0, 0.04, 0] }, 0);
  t.box(0.26, 0.008, 0.003, RED, { at: [0, 0.02, 0.001], rot: [0, 0, 0.5] }, 0);
  t.box(0.26, 0.008, 0.003, RED, { at: [0, 0.02, 0.001], rot: [0, 0, -0.5] }, 0);
  // The bulldog clip.
  b.box(0.06, 0.02, 0.03, DARK, { at: [0, 0.075, -0.1] }, 0.004);
  return b.build();
};

const laptopCrate = (): Model => {
  const b = new ModelBuilder();
  crate(b, 0, 0, 0, '03', true);
  const y = 0.2;
  b.box(0.26, 0.014, 0.18, 0xa6acb3, { at: [0, y + 0.007, 0.01] }, 0.006);
  b.box(0.26, 0.17, 0.012, 0xa6acb3, { at: [0, y + 0.09, -0.08], rot: [-0.25, 0, 0] }, 0.006);
  b.screen(0.23, 0.14, 0x1d3a3a, { at: [0, y + 0.09, -0.072], rot: [-0.25, 0, 0] });
  const s = framed(b, [0, y + 0.09, -0.07], [-0.25, 0, 0]);
  s.screen(0.23, 0.035, TEAL, { at: [0, 0.05, 0.001] });
  text(s, 'REORG 3.0', 0, 0.05, 0.002, 0.0055, 0xffffff);
  s.screen(0.08, 0.06, 0x7fb8b0, { at: [-0.05, -0.02, 0.001] });
  s.screen(0.08, 0.04, 0x7fb8b0, { at: [0.05, -0.03, 0.001] });
  return b.build();
};

const cableSpools = (): Model => {
  const b = new ModelBuilder();
  const spool = (x: number, z: number, c: number, turn: number) => {
    const s = framed(b, [x, 0.1, z], [0, turn, Math.PI / 2]);
    for (const e of [-0.06, 0.06]) s.cylinder(0.1, 0.1, 0.014, 0x6a7078, { at: [0, e, 0] }, 20);
    s.cylinder(0.075, 0.075, 0.11, c, {}, 20);
    for (let k = 0; k < 4; k++)
      s.cylinder(0.076, 0.076, 0.006, tint(c, -0.2), { at: [0, -0.04 + k * 0.027, 0] }, 20);
  };
  spool(-0.09, 0, 0xc86a32, 0);
  spool(0.11, 0.03, 0x3a5a90, 0.4);
  // A loose end of cable.
  b.box(0.18, 0.014, 0.014, 0xc86a32, { at: [-0.02, 0.008, 0.13], rot: [0, 0.3, 0] }, 0);
  return b.build();
};

const whereDesk = (): Model => {
  const b = new ModelBuilder();
  // A cardboard sign leaned on a crate edge: WHERE IS MY DESK?
  const s = framed(b, [0, 0, 0], [-0.25, 0, 0]);
  s.box(0.36, 0.26, 0.012, CARDBOARD, { at: [0, 0.13, 0] }, 0.006);
  text(s, 'WHERE IS', 0, 0.18, 0.007, 0.011, INK);
  text(s, 'MY DESK?', 0, 0.12, 0.007, 0.011, INK);
  s.box(0.24, 0.008, 0.003, RED, { at: [0, 0.07, 0.007] }, 0);
  b.box(0.06, 0.1, 0.06, CARDBOARD_DARK, { at: [0, 0.05, -0.08] }, 0.006);
  return b.build();
};

const boxFragile = (): Model => {
  const b = new ModelBuilder();
  const c = box(b, 0.3, 0.22, 0.24, [0, 0, 0], 0.1);
  c.box(0.18, 0.05, 0.003, RED, { at: [0.04, 0.1, 0.122] }, 0);
  text(c, 'FRAGILE', 0.04, 0.1, 0.124, 0.0065, WHITE);
  text(c, 'MOVE 3', -0.07, 0.17, 0.122, 0.0065, INK);
  // MOVE 1 and 2, crossed out.
  c.box(0.08, 0.006, 0.003, INK, { at: [0.08, 0.17, 0.123] }, 0);
  text(c, '1 2', 0.08, 0.17, 0.122, 0.006, INK);
  return b.build();
};

const monitorWrapped = (): Model => {
  const b = new ModelBuilder();
  b.box(0.16, 0.02, 0.12, DARK, { at: [0, 0.01, 0] }, 0.006);
  b.box(0.03, 0.12, 0.03, DARK, { at: [0, 0.07, -0.02] }, 0.006);
  b.box(0.42, 0.26, 0.04, 0x30343a, { at: [0, 0.24, 0], rot: [-0.08, 0, 0] }, 0.01);
  // Stretch wrap: a pale skin over it, a few wraps' edges.
  b.box(0.44, 0.28, 0.06, WRAP, { at: [0, 0.24, 0.005], rot: [-0.08, 0, 0] }, 0.02);
  for (let k = 0; k < 4; k++)
    b.box(
      0.45,
      0.006,
      0.062,
      tint(WRAP, -0.12),
      {
        at: [0, 0.14 + k * 0.065, 0.005],
        rot: [-0.08, 0, (k - 1.5) * 0.06],
      },
      0,
    );
  b.box(0.12, 0.05, 0.004, TAPE_YELLOW, { at: [0.1, 0.3, 0.04], rot: [-0.08, 0, 0] }, 0);
  return b.build();
};

const plantBox = (): Model => {
  const b = new ModelBuilder();
  box(b, 0.24, 0.14, 0.22, [0, 0, 0], -0.1, CARDBOARD_DARK);
  b.cylinder(0.08, 0.065, 0.12, 0xd8d6cf, { at: [0, 0.18, 0] }, 16);
  // A droopy plant: a few long leaves falling over the edge.
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * Math.PI * 2;
    b.sphere(
      0.06,
      k % 2 ? 0x5f8458 : 0x6e9466,
      {
        at: [Math.sin(a) * 0.07, 0.27, Math.cos(a) * 0.07],
        rot: [Math.cos(a) * 1.2, 0, -Math.sin(a) * 1.2],
      },
      [0.4, 1.4, 0.15],
    );
  }
  return b.build();
};

const derekCrate = (): Model => {
  const b = new ModelBuilder();
  crate(b, 0, 0, 0, 'DEREK', true, -0.06);
  // His lanyard draped over the lid, the badge hanging down the front.
  b.box(0.012, 0.004, 0.24, VIOLET, { at: [0.04, 0.2, 0], rot: [0, 0.2, 0] }, 0);
  b.box(0.012, 0.09, 0.004, VIOLET, { at: [0.06, 0.16, 0.13] }, 0);
  b.box(0.06, 0.08, 0.006, WHITE, { at: [0.06, 0.1, 0.135] }, 0.004);
  b.box(0.04, 0.012, 0.002, VIOLET, { at: [0.06, 0.125, 0.139] }, 0);
  return b.build();
};

const archiveBox = (): Model => {
  const b = new ModelBuilder();
  const c = box(b, 0.34, 0.2, 0.22, [0, 0, 0], 0.08, 0xd8d2c0);
  c.box(0.35, 0.03, 0.23, 0xc8c0aa, { at: [0, 0.19, 0] }, 0.006);
  c.box(0.16, 0.06, 0.003, WHITE, { at: [0, 0.1, 0.112] }, 0);
  text(c, 'OLD PLANS', 0, 0.11, 0.114, 0.0055, INK);
  text(c, 'V1 V2', 0, 0.085, 0.114, 0.0055, RED);
  return b.build();
};

const stretchWrap = (): Model => {
  const b = new ModelBuilder();
  b.cylinder(0.07, 0.07, 0.3, WRAP, { at: [0, 0.07, 0], rot: [0, 0.3, Math.PI / 2] }, 18);
  b.cylinder(0.025, 0.025, 0.4, 0x5a4a3a, { at: [0, 0.07, 0], rot: [0, 0.3, Math.PI / 2] }, 8);
  b.box(0.3, 0.003, 0.2, tint(WRAP, 0.04), { at: [0.05, 0.002, 0.12], rot: [0, 0.3, 0] }, 0);
  return b.build();
};

const phoneBag = (): Model => {
  const b = new ModelBuilder();
  b.box(0.2, 0.06, 0.16, DARK, { at: [0, 0.03, 0] }, 0.012);
  b.box(0.06, 0.04, 0.16, 0x3a3e45, { at: [-0.06, 0.075, 0] }, 0.012);
  b.box(0.24, 0.1, 0.2, WRAP, { at: [0, 0.05, 0] }, 0.02);
  b.torus(0.05, 0.008, DARK, { at: [0.14, 0.01, 0.1], rot: [Math.PI / 2, 0, 0] });
  b.box(0.08, 0.04, 0.003, TAPE_YELLOW, { at: [0.03, 0.06, 0.102] }, 0);
  return b.build();
};

const miniFlip = (): Model => {
  const b = new ModelBuilder();
  for (const s of [-1, 1])
    b.box(0.014, 0.36, 0.014, STEEL, { at: [s * 0.1, 0.17, -0.03], rot: [-0.18, 0, 0] }, 0);
  const p = framed(b, [0, 0.22, -0.01], [-0.18, 0, 0]);
  p.box(0.26, 0.22, 0.01, PAPER, {}, 0.004);
  text(p, 'SQUAD?', 0, 0.06, 0.006, 0.008, INK);
  p.box(0.1, 0.05, 0.002, TEAL, { at: [-0.05, -0.01, 0.006] }, 0);
  p.box(0.1, 0.05, 0.002, TAPE_YELLOW, { at: [0.06, -0.04, 0.006] }, 0);
  p.box(0.12, 0.006, 0.002, RED, { at: [0, -0.02, 0.007], rot: [0, 0, 0.6] }, 0);
  return b.build();
};

const coffeeTray = (): Model => {
  const b = new ModelBuilder();
  b.box(0.22, 0.03, 0.22, CARDBOARD_DARK, { at: [0, 0.015, 0] }, 0.008);
  for (const [x, z, lid] of [
    [-0.05, -0.05, WHITE],
    [0.05, -0.05, WHITE],
    [-0.05, 0.05, DARK],
  ] as const) {
    b.cylinder(0.04, 0.032, 0.12, WHITE, { at: [x, 0.08, z] }, 14);
    b.cylinder(0.035, 0.035, 0.035, CARDBOARD, { at: [x, 0.08, z] }, 14);
    b.cylinder(0.042, 0.042, 0.012, lid, { at: [x, 0.145, z] }, 14);
  }
  return b.build();
};

const keyboards = (): Model => {
  const b = new ModelBuilder();
  for (let k = 0; k < 3; k++) {
    b.box(
      0.4,
      0.025,
      0.13,
      k === 1 ? 0xd8d8d4 : DARK,
      {
        at: [0, 0.013 + k * 0.026, 0],
        rot: [0, (k - 1) * 0.05, 0],
      },
      0.006,
    );
  }
  b.box(0.012, 0.085, 0.14, RED, { at: [0.08, 0.04, 0] }, 0);
  b.box(0.012, 0.085, 0.14, RED, { at: [-0.1, 0.04, 0] }, 0);
  return b.build();
};

const bubbleRoll = (): Model => {
  const b = new ModelBuilder();
  b.cylinder(0.1, 0.1, 0.38, BUBBLE, { at: [0, 0.19, 0] }, 18);
  for (let k = 0; k < 5; k++)
    b.cylinder(0.102, 0.102, 0.006, tint(BUBBLE, -0.12), { at: [0, 0.05 + k * 0.07, 0] }, 18);
  b.box(0.04, 0.3, 0.004, BROWN_TAPE, { at: [0, 0.2, 0.1] }, 0);
  return b.build();
};

const moveTags = (): Model => {
  const b = new ModelBuilder();
  box(b, 0.26, 0.12, 0.2, [0, 0, 0], 0.15);
  // Numbered move tags spilling out and over the top.
  const colors = [TAPE_YELLOW, TEAL, 0xe2e3df, TAPE_YELLOW, CRATE_LID];
  colors.forEach((c, k) => {
    b.box(
      0.08,
      0.004,
      0.05,
      c,
      {
        at: [-0.08 + k * 0.04, 0.125 + (k % 2) * 0.005, (k % 3) * 0.04 - 0.04],
        rot: [0, k * 0.7, 0.15],
      },
      0,
    );
  });
  return b.build();
};

// ---- Low, for the sills ----

const tapeFlat = (): Model => {
  const b = new ModelBuilder();
  b.cylinder(0.09, 0.09, 0.06, TAPE_YELLOW, { at: [0, 0.03, 0] }, 20);
  b.cylinder(0.05, 0.05, 0.062, tint(CARDBOARD, -0.1), { at: [0, 0.03, 0] }, 16);
  b.box(0.12, 0.002, 0.05, TAPE_YELLOW, { at: [0.12, 0.001, 0.03], rot: [0, 0.3, 0] }, 0);
  return b.build();
};

const tagSheets = (): Model => {
  const b = new ModelBuilder();
  for (let k = 0; k < 3; k++) {
    b.box(
      0.2,
      0.006,
      0.26,
      PAPER,
      { at: [k * 0.01, 0.003 + k * 0.006, 0], rot: [0, k * 0.15, 0] },
      0,
    );
  }
  for (let r = 0; r < 4; r++)
    for (let c = 0; c < 3; c++)
      b.box(
        0.05,
        0.002,
        0.04,
        (r + c) % 2 ? TAPE_YELLOW : TEAL,
        {
          at: [-0.055 + c * 0.06 + 0.02, 0.022, -0.09 + r * 0.06],
          rot: [0, 0.3, 0],
        },
        0,
      );
  return b.build();
};

const lanyardPile = (): Model => {
  const b = new ModelBuilder();
  for (let k = 0; k < 4; k++)
    b.torus(0.07, 0.008, k % 2 ? VIOLET : TEAL, {
      at: [(k % 2) * 0.04 - 0.02, 0.008 + k * 0.006, (k - 1.5) * 0.02],
      rot: [Math.PI / 2, 0, k],
    });
  for (let k = 0; k < 3; k++)
    b.box(
      0.06,
      0.006,
      0.08,
      WHITE,
      { at: [-0.05 + k * 0.06, 0.03, 0.06], rot: [0, k * 0.5, 0] },
      0,
    );
  return b.build();
};

const cupStack = (): Model => {
  const b = new ModelBuilder();
  for (let k = 0; k < 4; k++)
    b.cylinder(0.042, 0.032, 0.08, WHITE, { at: [0, 0.04 + k * 0.025, 0] }, 14);
  b.cylinder(0.042, 0.032, 0.08, WHITE, { at: [0.11, 0.04, 0.03], rot: [0, 0, 0] }, 14);
  b.cylinder(0.035, 0.035, 0.03, CARDBOARD, { at: [0.11, 0.045, 0.03] }, 14);
  return b.build();
};

const planFolder = (): Model => {
  const b = new ModelBuilder();
  b.box(0.24, 0.03, 0.32, TEAL, { at: [0, 0.015, 0] }, 0.006);
  b.box(0.22, 0.004, 0.3, PAPER, { at: [0.006, 0.032, 0] }, 0);
  const t = framed(b, [0, 0.035, 0], [-Math.PI / 2, 0, 0]);
  text(t, 'MOVE PLAN', 0, 0.06, 0, 0.0075, INK);
  text(t, 'V7', 0, 0.02, 0, 0.009, RED);
  return b.build();
};

const deckPrint = (): Model => {
  const b = new ModelBuilder();
  for (let k = 0; k < 8; k++)
    b.box(
      0.3,
      0.008,
      0.22,
      k % 2 ? PAPER : tint(PAPER, -0.04),
      { at: [0, 0.004 + k * 0.008, 0], rot: [0, k * 0.03, 0] },
      0,
    );
  b.box(0.02, 0.07, 0.03, DARK, { at: [-0.14, 0.035, -0.08] }, 0.004);
  const t = framed(b, [0, 0.067, 0], [-Math.PI / 2, 0, 0.2]);
  t.box(0.26, 0.04, 0.002, TEAL, { at: [0, 0.06, 0] }, 0);
  text(t, 'THE PLAN V3', 0, 0.06, 0.002, 0.0055, 0xffffff);
  text(t, '1/80', 0.09, -0.07, 0.002, 0.005, INK);
  return b.build();
};

/** How much over life size the kit stands, so it reads chunky from the camera (the sills' a touch more). */
const TOP_GROW = 1.45;
const SILL_GROW = 1.55;

/** `build` grown `s` times about its foot. */
function grown(build: () => Model, s: number): () => Model {
  return () => {
    const m = build();
    for (const g of [m.body, m.glow, m.glass]) g?.scale(s, s, s);
    return m;
  };
}

/** Every wall-top prop, by kind. */
export const REORG_TOPS: Readonly<Record<ReorgTopKind, () => Model>> = {
  crateStack: grown(crateStack, TOP_GROW),
  crateOpen: grown(crateOpen, TOP_GROW),
  tapeRolls: grown(tapeRolls, TOP_GROW),
  labelMaker: grown(labelMaker, TOP_GROW),
  lampWrapped: grown(lampWrapped, TOP_GROW),
  orgCharts: grown(orgCharts, TOP_GROW),
  laptopCrate: grown(laptopCrate, TOP_GROW),
  cableSpools: grown(cableSpools, TOP_GROW),
  whereDesk: grown(whereDesk, TOP_GROW),
  boxFragile: grown(boxFragile, TOP_GROW),
  monitorWrapped: grown(monitorWrapped, TOP_GROW),
  plantBox: grown(plantBox, TOP_GROW),
  derekCrate: grown(derekCrate, TOP_GROW),
  archiveBox: grown(archiveBox, TOP_GROW),
  stretchWrap: grown(stretchWrap, TOP_GROW),
  phoneBag: grown(phoneBag, TOP_GROW),
  miniFlip: grown(miniFlip, TOP_GROW),
  coffeeTray: grown(coffeeTray, TOP_GROW),
  keyboards: grown(keyboards, TOP_GROW),
  bubbleRoll: grown(bubbleRoll, TOP_GROW),
  moveTags: grown(moveTags, TOP_GROW),
  tapeFlat: grown(tapeFlat, SILL_GROW),
  tagSheets: grown(tagSheets, SILL_GROW),
  lanyardPile: grown(lanyardPile, SILL_GROW),
  cupStack: grown(cupStack, SILL_GROW),
  planFolder: grown(planFolder, SILL_GROW),
  deckPrint: grown(deckPrint, SILL_GROW),
};

/** The MATRIX box's blanket top over the wall top: where Segfault lies (the scene's cat, `segfaultCat`, purring). */
export const MATRIX_BED_Y = 0.13;

/**
 * Segfault's bed: an open cardboard box marked MATRIX in marker (TRIBE
 * crossed out above it), its flaps folded out, a grey blanket in it at
 * `MATRIX_BED_Y`. The cat is the World track's living piece.
 */
export function matrixBoxModel(): Model {
  const b = new ModelBuilder();
  const w = 0.44;
  const d = 0.34;
  const h = 0.17;
  b.box(w, 0.02, d, CARDBOARD_DARK, { at: [0, 0.01, 0] }, 0);
  for (const s of [-1, 1]) {
    b.box(0.018, h, d, CARDBOARD, { at: [s * (w / 2 - 0.009), h / 2, 0] }, 0);
    b.box(w, h, 0.018, CARDBOARD, { at: [0, h / 2, s * (d / 2 - 0.009)] }, 0);
    // The flaps folded out.
    b.box(
      w,
      0.012,
      0.12,
      tint(CARDBOARD, 0.05),
      {
        at: [0, h + 0.03, s * (d / 2 + 0.05)],
        rot: [s * 0.6, 0, 0],
      },
      0,
    );
  }
  b.box(
    0.12,
    0.012,
    d,
    tint(CARDBOARD, -0.04),
    { at: [w / 2 + 0.05, h + 0.03, 0], rot: [0, 0, -0.6] },
    0,
  );
  // The blanket, rumpled.
  b.box(w - 0.04, 0.03, d - 0.04, 0x7a8088, { at: [0, MATRIX_BED_Y - 0.015, 0] }, 0.012);
  b.box(0.16, 0.04, 0.1, 0x6e747c, { at: [0.12, MATRIX_BED_Y, 0.08], rot: [0, 0.5, 0] }, 0.015);
  // MATRIX in marker on its front, TRIBE crossed out above it.
  const f = d / 2 + 0.001;
  text(b, 'MATRIX', 0, 0.075, f, 0.011, INK);
  text(b, 'TRIBE', 0, 0.135, f, 0.0065, INK);
  b.box(0.11, 0.006, 0.003, RED, { at: [0, 0.135, f + 0.002] }, 0);
  return b.build();
}
