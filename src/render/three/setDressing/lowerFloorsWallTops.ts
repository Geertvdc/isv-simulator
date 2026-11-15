import { type Model, ModelBuilder, tint } from '../kit';
import type { FrontKind, TopKind } from '../rooms/lowerFloorsRoom';
import { framed, text } from '../roomModels/basement';
import { MID_RISE_WALL_TOP_PROPS } from './midRiseWallTops';

/**
 * On Hypergrowth's wall tops: the ground floor's joke (they hire faster
 * than the desks arrive), unopened flat-pack desk boxes stacked two and
 * three high with a small YOTTA-violet balloon tied to some, a box of
 * violet welcome-pack totes, office chairs still in their plastic; the
 * first floor's kit (the desks arrived up here first): monitors in their
 * boxes, a stack of new laptops, a desk fan. On the low front wall, flat
 * things only: a desk box lying flat, a tote, a wet umbrella. Muted
 * cardboard, darker than every station top; nothing to eat.
 */

/** Flat-pack cardboard: muted, darker than every station top; its tape and print. */
export const CARDBOARD = 0xa88a62;
const CARDBOARD_DARK = 0x8a6e4c;
const PRINT = 0x4e3c2a;
const TAPE = 0xb89c70;
export const BALLOON_VIOLET = 0x7a5cd0;
const TOTE = 0x5e48a8;
const WHITE_PRINT = 0xe8e4f4;

/** A flat-pack desk box (long and flat) lying at (x, y, z), turned `yaw`: tape, the printed desk, DESK on its side. */
function deskBox(b: ModelBuilder, x: number, y: number, z: number, yaw: number, shade = 0): void {
  const w = 0.74;
  const h = 0.12;
  const d = 0.44;
  const c = tint(CARDBOARD, shade);
  const g = framed(b, [x, y, z], [0, yaw, 0]);
  g.box(w, h, d, c, { at: [0, h / 2, 0] }, 0.008);
  // The tape along the lid and down the ends.
  g.box(w + 0.004, 0.003, 0.06, TAPE, { at: [0, h + 0.001, 0] }, 0);
  for (const s of [-1, 1])
    g.box(0.003, h * 0.6, 0.06, TAPE, { at: [s * (w / 2 + 0.001), h * 0.7, 0] }, 0);
  // The printed desk on the lid: a top outline and two legs, in brown ink.
  const t = h + 0.0025;
  const ink = (bw: number, bd: number, px: number, pz: number) =>
    g.box(bw, 0.002, bd, PRINT, { at: [px, t, pz] }, 0);
  ink(0.3, 0.014, 0.12, -0.12);
  ink(0.3, 0.014, 0.12, -0.04);
  ink(0.014, 0.08, -0.03 + 0.007, -0.08);
  ink(0.014, 0.08, 0.27 - 0.007, -0.08);
  for (const lx of [0.0, 0.24]) ink(0.014, 0.1, lx, 0.02);
  // DESK and FLAT-PACK on the side facing the room.
  text(g, 'DESK', -0.12, h / 2 + 0.01, d / 2 + 0.001, 0.011, PRINT, 0.002);
  g.box(0.16, 0.004, 0.002, PRINT, { at: [-0.12, h / 2 - 0.035, d / 2 + 0.001] }, 0);
  text(g, 'FLAT', 0.2, h / 2, d / 2 + 0.001, 0.007, PRINT, 0.002);
  // A darker edge line where the lid meets the box.
  g.box(w + 0.004, 0.006, d + 0.004, CARDBOARD_DARK, { at: [0, h - 0.02, 0] }, 0);
}

/** A small balloon on a string tied at (x, y, z): YOTTA violet, its knot, the string up to it. */
function balloon(
  b: ModelBuilder,
  x: number,
  y: number,
  z: number,
  height: number,
  color = BALLOON_VIOLET,
): void {
  const top = y + height;
  b.sphere(0.085, color, { at: [x + 0.03, top, z] }, [1, 1.18, 1]);
  b.cone(
    0.018,
    0.025,
    tint(color, -0.2),
    { at: [x + 0.03, top - 0.105, z], rot: [Math.PI, 0, 0] },
    8,
  );
  const len = Math.hypot(0.03, height - 0.11);
  b.box(
    0.004,
    len,
    0.004,
    0xd8d8d8,
    {
      at: [x + 0.015, y + (height - 0.11) / 2, z],
      rot: [0, 0, -Math.atan2(0.03, height - 0.11)],
    },
    0,
  );
}

/** An office chair still in its plastic: dark seat and back, the star base, the cling-film round it. */
function wrappedChair(
  b: ModelBuilder,
  x: number,
  y: number,
  z: number,
  yaw: number,
  lying: boolean,
): void {
  const g = framed(b, [x, y, z], lying ? [0, yaw, Math.PI / 2] : [0, yaw, 0]);
  const seat = 0x3a3d44;
  g.box(0.32, 0.06, 0.3, seat, { at: [0, 0.2, 0] }, 0.02);
  g.box(0.3, 0.3, 0.05, seat, { at: [0, 0.38, -0.14] }, 0.02);
  g.cylinder(0.018, 0.018, 0.14, 0x8a9096, { at: [0, 0.11, 0] }, 8);
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2;
    g.box(
      0.16,
      0.025,
      0.03,
      0x2a2c30,
      { at: [Math.sin(a) * 0.08, 0.03, Math.cos(a) * 0.08], rot: [0, a + Math.PI / 2, 0] },
      0,
    );
  }
  g.pane(0.38, 0.5, 0.38, 0xd8e4ec, { at: [0, 0.26, -0.03] });
  // The wrap's twisted ends and the CAUTION sticker.
  g.box(0.08, 0.06, 0.004, 0xd8b42a, { at: [0.1, 0.38, -0.112] }, 0);
}

/** A monitor in its box: tall, thin, white-and-kraft print with the screen drawn on it. */
function monitorBox(b: ModelBuilder, x: number, y: number, z: number, yaw: number): void {
  const g = framed(b, [x, y, z], [0, yaw, 0]);
  const w = 0.56;
  const h = 0.4;
  const d = 0.14;
  g.box(w, h, d, 0xb9b2a2, { at: [0, h / 2, 0] }, 0.008);
  // The printed monitor on the side facing the room.
  const f = d / 2 + 0.001;
  g.box(0.36, 0.22, 0.002, 0x2a2d33, { at: [-0.04, h * 0.58, f] }, 0);
  g.box(0.32, 0.18, 0.002, 0x3a5a80, { at: [-0.04, h * 0.58, f + 0.001] }, 0);
  g.box(0.04, 0.05, 0.002, 0x2a2d33, { at: [-0.04, h * 0.58 - 0.135, f] }, 0);
  g.box(0.14, 0.012, 0.002, 0x2a2d33, { at: [-0.04, h * 0.58 - 0.165, f] }, 0);
  text(g, '27', 0.21, h * 0.7, f, 0.012, 0x2a2d33, 0.002);
  // The handle cut-out on top.
  g.box(0.12, 0.004, 0.03, 0x5a5448, { at: [0, h + 0.001, 0] }, 0);
}

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

const empty = () => new ModelBuilder().build();

/** What stands on the wall tops, by kind (built from the top, their origin on it). */
export const LOWER_TOPS: Readonly<Record<TopKind, () => Model>> = {
  // Three flat-packs, not quite square on each other.
  boxTower: prop((b) => {
    deskBox(b, 0, 0, 0, 0.05, 0);
    deskBox(b, 0.02, 0.12, -0.01, -0.08, -0.05);
    deskBox(b, -0.03, 0.24, 0.02, 0.14, 0.03);
  }),
  // Two flat, one standing on its long edge against them.
  boxPair: prop((b) => {
    deskBox(b, 0, 0, -0.06, -0.04, 0);
    deskBox(b, 0.02, 0.12, -0.04, 0.1, -0.06);
    const g = framed(b, [0, 0, 0.2], [Math.PI / 2 - 0.25, 0, 0]);
    deskBox(g, 0, -0.05, 0, 0, 0.04);
  }),
  // Two flat-packs, a violet balloon tied to the top one.
  boxBalloon: prop((b) => {
    deskBox(b, 0, 0, 0, -0.1, -0.03);
    deskBox(b, -0.02, 0.12, 0.01, 0.06, 0.02);
    balloon(b, 0.18, 0.24, 0.1, 0.38);
  }),
  // An open box of welcome packs: violet totes with WELCOME on, handles up, one balloon.
  welcomePacks: prop((b) => {
    const w = 0.46;
    const h = 0.2;
    const d = 0.34;
    b.box(w, h, d, CARDBOARD, { at: [0, h / 2, 0] }, 0.008);
    b.box(w - 0.03, 0.01, d - 0.03, CARDBOARD_DARK, { at: [0, h - 0.004, 0] }, 0);
    for (const s of [-1, 1])
      b.box(
        w,
        0.008,
        0.14,
        CARDBOARD,
        { at: [0, h + 0.04, s * (d / 2 + 0.04)], rot: [s * 0.9, 0, 0] },
        0.002,
      );
    for (let k = 0; k < 4; k++) {
      const x = -0.15 + k * 0.1;
      b.box(
        0.09,
        0.14,
        0.2,
        tint(TOTE, (k % 2) * 0.08),
        { at: [x, h + 0.02, 0], rot: [0, 0, (k - 1.5) * 0.08] },
        0.006,
      );
      b.torus(
        0.03,
        0.006,
        tint(TOTE, -0.15),
        { at: [x, h + 0.1, 0], rot: [0, Math.PI / 2, 0] },
        Math.PI,
      );
    }
    text(b, 'WELCOME', 0, h * 0.55, d / 2 + 0.001, 0.01, TOTE, 0.002);
    text(b, 'PACKS', 0, h * 0.25, d / 2 + 0.001, 0.008, PRINT, 0.002);
    balloon(b, -0.2, h, -0.1, 0.4, 0xeeeaf6);
  }),
  // Two chairs in their plastic, one on the other on its side.
  wrappedChairs: prop((b) => {
    wrappedChair(b, -0.04, 0, 0, 0.3, false);
    deskBox(b, 0.18, 0, 0.12, -0.3, -0.04);
  }),
  // Two monitors in their boxes, side by side, standing up.
  boxedMonitors: prop((b) => {
    monitorBox(b, -0.06, 0, -0.08, 0.06);
    monitorBox(b, 0.04, 0, 0.1, -0.08);
  }),
  // A stack of new laptops, silver and dark, still in their sleeves, a charger box on top.
  laptops: prop((b) => {
    for (let k = 0; k < 5; k++)
      b.box(
        0.34,
        0.022,
        0.24,
        k % 2 ? 0x8d949b : 0x4a4f56,
        {
          at: [(k % 2) * 0.01 - 0.005, 0.011 + k * 0.024, (k % 3) * 0.006],
          rot: [0, (k - 2) * 0.04, 0],
        },
        0.005,
      );
    b.box(0.12, 0.05, 0.09, 0xe2e4e4, { at: [0.06, 0.145, 0], rot: [0, 0.3, 0] }, 0.006);
    deskBox(b, 0.02, 0, 0.33, Math.PI / 2 + 0.1, -0.02);
  }),
  deskFan: MID_RISE_WALL_TOP_PROPS[1] ?? empty,
  // One monitor box, a flat-pack lying beside.
  monitorBox: prop((b) => {
    monitorBox(b, 0, 0, -0.12, 0.1);
    deskBox(b, 0.02, 0, 0.16, -0.12, 0.02);
  }),
};

/** How high anything lying on the low front wall reaches at most (over the wall's top). */
export const LOWER_FRONT_MAX_HEIGHT = 0.25;

/** Low things on the ground floor's front wall: a hand high at most. */
export const LOWER_FRONTS: Readonly<Record<FrontKind, () => Model>> = {
  flatBox: prop((b) => {
    deskBox(b, 0, 0, 0, 0.1, 0.02);
  }),
  tote: prop((b) => {
    b.box(0.3, 0.05, 0.26, TOTE, { at: [0, 0.025, 0], rot: [0, 0.3, 0] }, 0.01);
    b.torus(0.06, 0.008, tint(TOTE, -0.15), {
      at: [0.05, 0.05, -0.08],
      rot: [Math.PI / 2, 0, 0.3],
    });
    const g = framed(b, [0, 0.052, 0], [-Math.PI / 2, 0.3, 0]);
    text(g, 'YOTTA', 0, 0, 0, 0.01, WHITE_PRINT, 0.002);
  }),
  umbrella: prop((b) => {
    // A closed umbrella lying along the wall, dripping into a little puddle on the coping.
    b.cylinder(0.035, 0.012, 0.62, 0x2e3a5a, { at: [0, 0.035, 0], rot: [0, 0, Math.PI / 2] }, 10);
    b.cylinder(0.01, 0.01, 0.12, 0x2a2c30, { at: [-0.36, 0.035, 0], rot: [0, 0, Math.PI / 2] }, 6);
    b.torus(0.03, 0.01, 0x2a2c30, { at: [-0.42, 0.035, 0.03], rot: [Math.PI / 2, 0, 0] }, Math.PI);
    b.cylinder(0.12, 0.12, 0.002, 0x6a7a86, { at: [0.2, 0.001, 0.08] }, 16);
  }),
};
