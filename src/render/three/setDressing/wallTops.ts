import { type Model, ModelBuilder } from '../kit';
import { COLOR } from '../palette';
import { books, DARK, mug, nth, plantPot, SPINES, STEEL, WOOD_DARK } from './shared';

/** On the office's own walls: what stands on top of them. */

/**
 * A thing to stand on top of a wall, built at desk size and grown by `scale`,
 * so small ones still read from the couch.
 */
function wallTop(build: (b: ModelBuilder) => void, scale = 1): () => Model {
  return () => {
    const b = new ModelBuilder();
    build(b);
    const model = b.build();
    for (const g of [model.body, model.glow, model.glass]) g?.scale(scale, scale, scale);
    return model;
  };
}

/**
 * Things on top of full-height walls, picked per wall by a hash (and never
 * the same as a wall close by): plants in five kinds and pots, book piles,
 * mugs, a rubber duck, a little robot, an old monitor, a lava lamp, a
 * trophy, a globe, a coffee maker, a router. The small ones are grown up to
 * about twice desk size: still clutter, not something to pick up.
 */
export const WALL_TOP_PROPS: readonly (() => Model)[] = [
  wallTop((b) => plantPot(b, 0, 0, 0.55, 0)),
  wallTop((b) => {
    books(b, -0.16, 0, 0, 5, 0);
  }, 1.3),
  wallTop((b) => mug(plantPot(b, 0, 0, 0.4, 5), 0.2, 0, 0.05, 0)),
  wallTop((b) => plantPot(b, 0, 0, 0.5, 1)),
  wallTop((b) => plantPot(b, 0, 0, 0.5, 7)),
  wallTop((b) => plantPot(b, 0, 0, 0.45, 9)),
  wallTop((b) => {
    // A pile of books lying flat, a mug on top.
    for (let i = 0; i < 4; i++)
      b.box(
        0.24 - i * 0.02,
        0.045,
        0.17,
        nth(SPINES, i + 2),
        { at: [i * 0.01, 0.023 + i * 0.046, 0], rot: [0, i * 0.15, 0] },
        0,
      );
    mug(b, 0.0, 0.18, 0.0, 2);
  }, 1.4),
  wallTop((b) => {
    // A rubber duck, the debugging kind.
    b.sphere(0.08, COLOR.aqua, { at: [0, 0.06, 0] }, [1.2, 0.8, 1]);
    b.sphere(0.05, COLOR.aqua, { at: [0.04, 0.14, 0] });
    b.box(0.05, 0.015, 0.04, COLOR.tangerine, { at: [0.09, 0.135, 0] }, 0);
    mug(b, -0.16, 0, 0.04, 1);
  }, 1.8),
  wallTop((b) => {
    // A little robot figurine.
    b.box(0.1, 0.12, 0.08, COLOR.silver, { at: [0, 0.1, 0] }, 0.02);
    b.box(0.08, 0.07, 0.07, 0xb8c0c8, { at: [0, 0.2, 0] }, 0.02);
    b.led(0.012, COLOR.screenGlow, { at: [-0.02, 0.21, 0.036] });
    b.led(0.012, COLOR.screenGlow, { at: [0.02, 0.21, 0.036] });
    for (const x of [-0.03, 0.03])
      b.box(0.03, 0.05, 0.04, COLOR.metalGrey, { at: [x, 0.025, 0] }, 0);
    b.cylinder(0.004, 0.004, 0.05, STEEL, { at: [0, 0.26, 0] }, 4);
  }, 1.9),
  wallTop((b) => {
    // An old grey CRT, still on: darker than any ticket.
    b.box(0.3, 0.24, 0.26, 0x6a6e76, { at: [0, 0.12, 0] }, 0.03);
    b.screen(0.22, 0.16, 0x3a8a6a, { at: [0, 0.13, 0.131] });
  }, 1.3),
  wallTop((b) => {
    // A lava lamp.
    b.cone(0.07, 0.08, STEEL, { at: [0, 0.04, 0] }, 12);
    b.cylinder(0.035, 0.055, 0.2, 0x5a3a6a, { at: [0, 0.18, 0] }, 12);
    b.led(0.025, COLOR.hotPink, { at: [0, 0.15, 0] });
    b.led(0.018, COLOR.hotPink, { at: [0, 0.22, 0] });
    b.cone(0.035, 0.04, STEEL, { at: [0, 0.3, 0], rot: [Math.PI, 0, 0] }, 12);
  }, 1.6),
  wallTop((b) => {
    // A trophy, for the hackathon nobody remembers.
    b.box(0.12, 0.05, 0.12, WOOD_DARK, { at: [0, 0.025, 0] }, 0.01);
    b.cylinder(0.015, 0.02, 0.08, COLOR.brass, { at: [0, 0.09, 0] }, 8);
    b.cylinder(0.07, 0.03, 0.1, COLOR.brass, { at: [0, 0.18, 0] }, 12);
  }, 1.8),
  wallTop((b) => {
    // A globe.
    b.cylinder(0.05, 0.06, 0.02, WOOD_DARK, { at: [0, 0.01, 0] }, 10);
    b.cylinder(0.008, 0.008, 0.08, STEEL, { at: [0, 0.05, 0] }, 4);
    b.sphere(0.09, 0x5a8aa0, { at: [0, 0.17, 0] });
    b.sphere(0.05, COLOR.fern, { at: [0.04, 0.2, 0.05] }, [1, 0.6, 0.6]);
  }, 1.8),
  wallTop((b) => {
    // A coffee maker and its pot.
    b.box(0.16, 0.24, 0.16, DARK, { at: [0, 0.12, 0] }, 0.02);
    b.cylinder(0.05, 0.06, 0.1, 0x8fb0c0, { at: [0, 0.06, 0.06] }, 10);
    b.led(0.012, 0xff7a4a, { at: [0.05, 0.2, 0.082] });
  }, 1.6),
  wallTop((b) => {
    // A Wi-Fi router with its antennas.
    b.box(0.24, 0.04, 0.16, COLOR.porcelain, { at: [0, 0.02, 0] }, 0.01);
    for (const x of [-0.09, 0, 0.09])
      b.box(0.015, 0.14, 0.015, DARK, { at: [x, 0.1, -0.07], rot: [0, 0, x * 2] }, 0);
    for (let i = 0; i < 4; i++)
      b.led(0.008, COLOR.ledGreen, { at: [-0.06 + i * 0.04, 0.03, 0.081] });
  }, 1.8),
];
