import { type Model, ModelBuilder } from '../kit';
import { lettering } from './businessPark';

/**
 * On the demo set's walls (Demo Day): what stands on top of them in stacked
 * clusters, and what lies on the low front wall. The stage crew's and the
 * startup's kit in muted colours, nothing in a station's or a player's
 * colour and nothing to eat or drink: flight cases, cable reels, gaffer
 * tape, spare laptops, stage monitor wedges, YOTTA swag and lanyard boxes,
 * a small haze machine.
 */

/** A thing built at desk size and grown by `scale`, so it reads from the couch. */
function prop(build: (b: ModelBuilder) => void, scale = 1): () => Model {
  return () => {
    const b = new ModelBuilder();
    build(b);
    const model = b.build();
    for (const g of [model.body, model.glow, model.glass]) g?.scale(scale, scale, scale);
    return model;
  };
}

const CASE = 0x2a2b30;
const ALU = 0xa3a9b1;
const ALU_DARK = 0x60656d;
const BLACK = 0x1b1c20;
const STENCIL = 0xa6a8ae;
/** YOTTA's violet, printed (muted), and the kraft of the swag deliveries. */
const VIOLET = 0x6a5a9a;
const KRAFT = 0xa88c68;
/** Gaffer tape rolls: black, grey, white, and a dull fluorescent pink and yellow. */
const TAPES = [0x26272c, 0x6a6c72, 0xc8c8c2, 0xb06a8a, 0xb0b45a] as const;

/** A flight case `w`×`h`×`d` resting on `y` at (x, z): black, aluminium edges, ball corners, a latch. */
function flightCase(
  b: ModelBuilder,
  x: number,
  y: number,
  z: number,
  [w, h, d]: readonly [number, number, number],
  turn = 0,
  stencil?: string,
): void {
  const at = (dx: number, dy: number, dz: number): [number, number, number] => [
    x + dx * Math.cos(turn) + dz * Math.sin(turn),
    y + dy,
    z - dx * Math.sin(turn) + dz * Math.cos(turn),
  ];
  const rot: [number, number, number] = [0, turn, 0];
  b.box(w, h, d, CASE, { at: at(0, h / 2, 0), rot }, 0.008);
  for (const s of [-1, 1]) {
    b.box(w + 0.004, 0.012, 0.012, ALU, { at: at(0, h - 0.006, s * (d / 2)), rot }, 0);
    b.box(w + 0.004, 0.012, 0.012, ALU, { at: at(0, 0.006, s * (d / 2)), rot }, 0);
    b.box(0.012, h, 0.012, ALU, { at: at(s * (w / 2), h / 2, d / 2), rot }, 0);
    b.sphere(0.014, 0xc6cbd1, { at: at(s * (w / 2), h, d / 2) });
  }
  b.box(0.05, 0.03, 0.01, ALU, { at: at(0, h - 0.04, d / 2 + 0.004), rot }, 0.004);
  if (stencil) {
    const [px, py, pz] = at(0, h * 0.4, d / 2 + 0.002);
    // Lettering faces +z; only square to the camera when the case is.
    if (Math.abs(turn) < 0.3) lettering(b, stencil, px, py, pz, 0.007, STENCIL, 0.002);
  }
}

/** A cable reel on its side at (x, y, z): ply-grey cheeks, black cable wound on, a plug. */
function cableReel(b: ModelBuilder, x: number, y: number, z: number, r: number): void {
  for (const s of [-1, 1])
    b.cylinder(
      r,
      r,
      0.016,
      0x4a4c52,
      { at: [x, y + r, z + s * 0.06], rot: [Math.PI / 2, 0, 0] },
      18,
    );
  b.cylinder(r * 0.8, r * 0.8, 0.11, 0x1d1e22, { at: [x, y + r, z], rot: [Math.PI / 2, 0, 0] }, 18);
  for (let i = 0; i < 3; i++)
    b.torus(r * 0.8, 0.006, 0x2c2d32, { at: [x, y + r, z - 0.035 + i * 0.035] });
  b.cylinder(
    r * 0.22,
    r * 0.22,
    0.15,
    ALU_DARK,
    { at: [x, y + r, z], rot: [Math.PI / 2, 0, 0] },
    10,
  );
  b.box(0.04, 0.025, 0.03, 0x3a3c42, { at: [x + r * 0.7, y + r * 1.7, z + 0.07] }, 0.006);
}

/** A roll of gaffer tape lying flat at (x, y, z). */
function tapeRoll(
  b: ModelBuilder,
  x: number,
  y: number,
  z: number,
  color: number,
  r = 0.055,
): void {
  b.cylinder(r, r, 0.045, color, { at: [x, y + 0.0225, z] }, 18);
  b.cylinder(r * 0.6, r * 0.6, 0.047, 0x8a7a5a, { at: [x, y + 0.0225, z] }, 14);
  b.cylinder(r * 0.52, r * 0.52, 0.05, 0x18191c, { at: [x, y + 0.0225, z] }, 12);
}

/** A closed laptop at height y, `turn`ed, a sticker or two on its lid. */
function laptop(
  b: ModelBuilder,
  x: number,
  y: number,
  z: number,
  turn: number,
  color: number,
): void {
  b.box(0.32, 0.022, 0.22, color, { at: [x, y + 0.011, z], rot: [0, turn, 0] }, 0.008);
  b.box(0.322, 0.004, 0.222, 0x2c2e33, { at: [x, y + 0.004, z], rot: [0, turn, 0] }, 0);
  b.box(
    0.06,
    0.003,
    0.05,
    VIOLET,
    { at: [x - 0.06, y + 0.023, z + 0.03], rot: [0, turn + 0.3, 0] },
    0,
  );
}

/** A stage monitor wedge at (x, y, z), its grille sloping up toward +z. */
function monitorWedge(b: ModelBuilder, x: number, y: number, z: number, turn = 0): void {
  const rot: [number, number, number] = [0, turn, 0];
  b.box(0.36, 0.1, 0.26, BLACK, { at: [x, y + 0.05, z], rot }, 0.014);
  b.box(0.36, 0.08, 0.16, BLACK, { at: [x, y + 0.12, z - 0.05], rot }, 0.014);
  // The grille on the slope.
  const c = Math.cos(turn);
  const sn = Math.sin(turn);
  b.box(
    0.32,
    0.004,
    0.2,
    0x5a5d66,
    { at: [x + 0.06 * sn, y + 0.125, z + 0.06 * c], rot: [-0.55, turn, 0] },
    0,
  );
  // The aluminium trim along its top edge, catching the wash.
  b.box(0.364, 0.012, 0.012, ALU, { at: [x - 0.13 * sn, y + 0.165, z - 0.13 * c], rot }, 0);
  for (let i = 0; i < 4; i++)
    b.box(
      0.3,
      0.003,
      0.006,
      0x26272c,
      {
        at: [x + (0.0 + i * 0.04) * sn, y + 0.15 - i * 0.022, z + (0.0 + i * 0.04) * c],
        rot: [-0.55, turn, 0],
      },
      0,
    );
}

/** A YOTTA swag box at (x, y, z): kraft with a printed violet band and logo. */
function swagBox(
  b: ModelBuilder,
  x: number,
  y: number,
  z: number,
  [w, h, d]: readonly [number, number, number],
  turn = 0,
): void {
  b.box(w, h, d, KRAFT, { at: [x, y + h / 2, z], rot: [0, turn, 0] }, 0.006);
  b.box(w + 0.003, h * 0.22, d + 0.003, VIOLET, { at: [x, y + h * 0.6, z], rot: [0, turn, 0] }, 0);
  b.torus(Math.min(w, d) * 0.16, 0.008, VIOLET, {
    at: [x, y + h + 0.002, z],
    rot: [Math.PI / 2, 0, 0],
  });
}

/**
 * The wall-top clusters, each one composed pile on one tile (`stageSetRoom`
 * puts up to three on each long wall, the rest bare): each 2–3 things high
 * with a clear silhouette, inside about 0.85 of a tile.
 */
export const STAGE_WALL_TOP_PROPS: readonly (() => Model)[] = [
  prop((b) => {
    // Two flight cases stacked crosswise, a third small one on top, gaffer rolls on the lid.
    flightCase(b, -0.04, 0, 0, [0.5, 0.18, 0.34], 0.05, 'YOTTA');
    flightCase(b, -0.02, 0.18, -0.02, [0.42, 0.14, 0.3], -0.12);
    flightCase(b, -0.06, 0.32, 0, [0.24, 0.1, 0.18], 0.25);
    tapeRoll(b, 0.15, 0.32, 0.04, TAPES[3]);
    tapeRoll(b, 0.15, 0.365, 0.04, TAPES[0]);
  }, 1.3),
  prop((b) => {
    // A big cable reel standing on its case, a coil of XLR hung over the corner, tape rolls.
    flightCase(b, 0, 0, 0, [0.46, 0.12, 0.34], -0.08);
    cableReel(b, -0.06, 0.12, 0, 0.15);
    b.torus(0.09, 0.012, 0x26272c, { at: [0.2, 0.08, 0.17], rot: [0.2, 0, 0.3] });
    tapeRoll(b, 0.18, 0.12, -0.08, TAPES[2]);
    tapeRoll(b, 0.18, 0.165, -0.08, TAPES[4], 0.05);
  }, 1.35),
  prop((b) => {
    // YOTTA swag: two boxes stacked, a lanyard box open with violet lanyards spilling out.
    swagBox(b, -0.1, 0, -0.02, [0.3, 0.17, 0.26], 0.1);
    swagBox(b, -0.08, 0.17, -0.03, [0.22, 0.13, 0.2], -0.15);
    b.box(0.2, 0.08, 0.16, 0x3a3c42, { at: [0.2, 0.04, 0.06], rot: [0, 0.2, 0] }, 0.006);
    for (let i = 0; i < 4; i++)
      b.box(
        0.012,
        0.004,
        0.2,
        i % 2 ? VIOLET : 0x8a7ab8,
        {
          at: [0.15 + i * 0.03, 0.082 - (i === 3 ? 0.05 : 0), 0.12 + (i === 3 ? 0.08 : 0)],
          rot: [i === 3 ? 0.9 : 0, 0.2 + i * 0.1, 0],
        },
        0,
      );
    b.box(0.07, 0.05, 0.004, 0xd6d4cc, { at: [0.24, 0.11, 0.03], rot: [-0.5, 0.2, 0] }, 0);
  }, 1.3),
  prop((b) => {
    // A stage monitor wedge with the spare laptops stacked on its back, a gaffer roll on top.
    monitorWedge(b, -0.04, 0, 0.04);
    laptop(b, -0.02, 0.16, -0.08, 0.08, 0x8a9098);
    laptop(b, -0.03, 0.182, -0.07, -0.1, 0x3a3e45);
    tapeRoll(b, 0.24, 0, 0.12, TAPES[1]);
    tapeRoll(b, 0.22, 0.045, 0.1, TAPES[0], 0.05);
  }, 1.4),
  prop((b) => {
    // The haze machine on its case: a black box with its nozzle, a remote on a lead.
    flightCase(b, 0, 0, 0, [0.44, 0.12, 0.32], 0.06);
    b.box(0.3, 0.13, 0.2, BLACK, { at: [-0.02, 0.185, -0.02] }, 0.014);
    b.box(0.31, 0.02, 0.21, ALU_DARK, { at: [-0.02, 0.26, -0.02] }, 0);
    b.cylinder(
      0.025,
      0.03,
      0.08,
      0x3a3c42,
      { at: [0.15, 0.19, 0.03], rot: [0, 0, Math.PI / 2] },
      12,
    );
    b.box(0.006, 0.03, 0.03, 0x15161a, { at: [0.19, 0.19, 0.03] }, 0);
    b.box(0.08, 0.024, 0.05, 0x2c2e33, { at: [-0.1, 0.132, 0.14], rot: [0, 0.4, 0] }, 0.005);
    b.led(0.006, 0x2ea05a, { at: [-0.1, 0.146, 0.14] });
    tapeRoll(b, 0.16, 0.12, -0.1, TAPES[3], 0.045);
  }, 1.35),
  prop((b) => {
    // Two AUDIO cases stacked square, a YOTTA swag box on the lid, a coil of XLR and tape.
    flightCase(b, -0.02, 0, 0, [0.48, 0.15, 0.34], 0, 'AUDIO');
    flightCase(b, -0.04, 0.15, -0.01, [0.44, 0.13, 0.3], 0.06, 'VIDEO');
    swagBox(b, -0.08, 0.28, -0.02, [0.2, 0.11, 0.17], -0.2);
    b.torus(0.08, 0.012, 0x26272c, { at: [0.2, 0.2, 0.17], rot: [0.3, 0, 0.2] });
    tapeRoll(b, 0.15, 0.28, 0.02, TAPES[4], 0.045);
  }, 1.3),
];

/** How tall a cluster on the low front wall may stand, so it never hides a player behind it. */
export const STAGE_FRONT_PROP_MAX_HEIGHT = 0.3;

/**
 * The stage monitor wedge at each end of the low front wall, facing in at
 * the stage (its grille toward −z), a gaffer roll and its cable beside it.
 */
export const STAGE_FRONT_WEDGE: () => Model = prop((b) => {
  monitorWedge(b, 0, 0, 0, Math.PI);
  b.box(0.04, 0.03, 0.06, 0x3a3c42, { at: [0.13, 0.03, 0.12] }, 0.006);
  b.torus(0.06, 0.009, 0x26272c, { at: [0.2, 0.01, 0.1], rot: [Math.PI / 2, 0, 0] });
  tapeRoll(b, -0.24, 0, 0.06, TAPES[0], 0.045);
}, 1.3);

/**
 * A flat cluster lying on a low inner wall, which the players look over
 * (well under `STAGE_FRONT_PROP_MAX_HEIGHT`): gaffer rolls, a coil of
 * cable, the running order taped down flat.
 */
export const STAGE_INNER_LOW_PROP: () => Model = prop((b) => {
  tapeRoll(b, -0.22, 0, -0.05, TAPES[0], 0.05);
  tapeRoll(b, -0.22, 0.045, -0.05, TAPES[3], 0.045);
  tapeRoll(b, -0.1, 0, 0.1, TAPES[2], 0.045);
  b.torus(0.07, 0.01, 0x26272c, { at: [0.2, 0.01, -0.08], rot: [Math.PI / 2, 0, 0] });
  // The running order, printed, taped flat, a strip of gaffer over each end.
  b.box(0.2, 0.004, 0.26, 0xd2cfc4, { at: [0.08, 0.002, 0.08], rot: [0, 0.25, 0] }, 0);
  for (let i = 0; i < 4; i++)
    b.box(
      0.12,
      0.002,
      0.012,
      0x4a4b52,
      {
        at: [0.08 - 0.03 * Math.sin(0.25) * i, 0.005, 0.02 + 0.04 * i],
        rot: [0, 0.25, 0],
      },
      0,
    );
  for (const dz of [-0.13, 0.13])
    b.box(
      0.08,
      0.004,
      0.03,
      TAPES[1],
      {
        at: [0.08 + dz * Math.sin(0.25), 0.006, 0.08 + dz * Math.cos(0.25)],
        rot: [0, 0.25, 0],
      },
      0,
    );
}, 1.2);

/**
 * Low clusters lying on the low front wall, which the camera looks over
 * (each under `STAGE_FRONT_PROP_MAX_HEIGHT`): a stage monitor wedge facing
 * the stage with a set of gaffer rolls; the spare laptops stacked with a
 * coil of cable.
 */
export const STAGE_FRONT_WALL_PROPS: readonly (() => Model)[] = [
  prop((b) => {
    monitorWedge(b, -0.04, 0, 0.02, Math.PI);
    tapeRoll(b, 0.24, 0, 0.06, TAPES[0], 0.05);
    tapeRoll(b, 0.24, 0.045, 0.06, TAPES[3], 0.045);
  }, 1.3),
  prop((b) => {
    // A low case, a YOTTA swag box and the lanyard box on it, a gaffer roll.
    flightCase(b, -0.04, 0, 0, [0.46, 0.1, 0.3], 0.06, 'YOTTA');
    swagBox(b, -0.12, 0.1, -0.02, [0.18, 0.08, 0.15], 0.15);
    b.box(0.14, 0.05, 0.11, 0x3a3c42, { at: [0.1, 0.125, 0.0], rot: [0, -0.2, 0] }, 0.006);
    b.box(0.1, 0.004, 0.016, VIOLET, { at: [0.1, 0.152, 0.0], rot: [0, -0.2, 0] }, 0);
    tapeRoll(b, 0.24, 0, 0.12, TAPES[4], 0.045);
  }, 1.3),
  prop((b) => {
    laptop(b, 0, 0, 0, 0.1, 0x8a9098);
    laptop(b, 0.01, 0.024, 0.005, -0.08, 0x3a3e45);
    b.torus(0.07, 0.01, 0x26272c, { at: [0.2, 0.01, 0.06], rot: [Math.PI / 2, 0, 0] });
    tapeRoll(b, -0.22, 0, 0.06, TAPES[2], 0.045);
  }, 1.5),
];
