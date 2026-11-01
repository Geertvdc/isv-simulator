import * as THREE from 'three';
import { type Model, ModelBuilder, tint } from '../kit';
import { COLOR } from '../palette';
import { DARK, LEAF_DARK } from './shared';

/**
 * On the biscuit works' walls: the clusters standing on the coping (plants
 * in old tins, a record player, crates, the brewery's growlers, biscuit
 * tins) and the low things lying on the front walls. Muted, so the
 * stations stay the brightest things in the room.
 */

/** A thing for a wall top, built at desk size and grown by `scale`, so it still reads from the couch. */
function wallTop(build: (b: ModelBuilder) => void, scale = 1): () => Model {
  return () => {
    const b = new ModelBuilder();
    build(b);
    const model = b.build();
    for (const g of [model.body, model.glow, model.glass]) g?.scale(scale, scale, scale);
    return model;
  };
}

const CRATE = 0x9a7a52;
const TIN_COLORS = [0x8a9a8a, 0xb8a070, 0x9a5a48, 0x6a7a8a, 0xc8bca0];

/** A wooden crate, slatted, standing on (x, y, z): `w` × `h` × `d`. */
function crate(
  b: ModelBuilder,
  x: number,
  y: number,
  z: number,
  w: number,
  h: number,
  d: number,
  turn = 0,
  stencil = true,
): void {
  const rot: [number, number, number] = [0, turn, 0];
  b.box(w, h, d, tint(CRATE, -0.35), { at: [x, y + h / 2, z], rot }, 0);
  const c = Math.cos(turn);
  const s = Math.sin(turn);
  const off = (u: number, v: number): [number, number] => [x + u * c + v * s, z - u * s + v * c];
  for (let i = 0; i < 3; i++) {
    const yy = y + (h / 3) * (i + 0.5);
    const tone = tint(CRATE, (i - 1) * 0.05);
    for (const v of [-1, 1]) {
      const [px, pz] = off(0, (v * d) / 2);
      b.box(w + 0.004, h / 3 - 0.014, 0.012, tone, { at: [px, yy, pz], rot }, 0);
    }
    for (const u of [-1, 1]) {
      const [px, pz] = off((u * w) / 2, 0);
      b.box(0.012, h / 3 - 0.014, d + 0.004, tone, { at: [px, yy, pz], rot }, 0);
    }
  }
  if (stencil) {
    const [px, pz] = off(0, d / 2 + 0.008);
    b.box(w * 0.5, h * 0.18, 0.003, 0x3a2e22, { at: [px, y + h * 0.5, pz], rot }, 0);
  }
}

/** A tin can planter with trailing leaves (a pothos), on (x, y, z). */
function tinPlant(b: ModelBuilder, x: number, y: number, z: number, look: number, r = 0.07): void {
  const tin = TIN_COLORS[look % TIN_COLORS.length] ?? COLOR.silver;
  const h = r * 1.5;
  b.cylinder(r, r, h, tin, { at: [x, y + h / 2, z] }, 14);
  b.cylinder(r + 0.003, r + 0.003, h * 0.4, tint(tin, 0.25), { at: [x, y + h * 0.5, z] }, 14);
  b.cylinder(r * 0.92, r * 0.92, 0.01, 0x4a3628, { at: [x, y + h - 0.004, z] }, 12);
  const leaf = look % 2 ? 0x5a8a4e : LEAF_DARK;
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + look;
    const reach = r * (0.6 + (i % 3) * 0.35);
    b.sphere(
      r * 0.55,
      i % 2 ? leaf : tint(leaf, 0.12),
      {
        at: [
          x + Math.cos(a) * reach,
          y + h + r * 0.35 - (i % 3) * r * 0.25,
          z + Math.sin(a) * reach,
        ],
      },
      [1, 0.6, 1],
    );
  }
  // A trailing stem down the front.
  for (let k = 0; k < 4; k++)
    b.sphere(
      r * 0.32,
      leaf,
      { at: [x + r * 0.9, y + h - k * r * 0.55, z + r * 0.7 + k * 0.01] },
      [1, 0.7, 0.6],
    );
}

/** A brown glass growler with a swing top, on (x, y, z). */
function growler(b: ModelBuilder, x: number, y: number, z: number, glass = 0x6a3a1e): void {
  b.cylinder(0.065, 0.06, 0.14, glass, { at: [x, y + 0.07, z] }, 14);
  b.sphere(0.065, glass, { at: [x, y + 0.14, z] }, [1, 0.6, 1]);
  b.cylinder(0.025, 0.03, 0.06, glass, { at: [x, y + 0.2, z] }, 10);
  b.cylinder(0.028, 0.028, 0.02, 0xd8d0c0, { at: [x, y + 0.235, z] }, 10);
  b.cylinder(0.006, 0.006, 0.06, 0x8a8f92, { at: [x + 0.03, y + 0.2, z] }, 4);
  b.box(0.1, 0.06, 0.004, 0xe0d4b4, { at: [x, y + 0.08, z + 0.064] }, 0);
}

/** A round biscuit tin, its lid a shade lighter with a band, on (x, y, z). */
function biscuitTin(
  b: ModelBuilder,
  x: number,
  y: number,
  z: number,
  r: number,
  h: number,
  color: number,
): void {
  b.cylinder(r, r, h, color, { at: [x, y + h / 2, z] }, 18);
  b.cylinder(r + 0.006, r + 0.006, 0.03, tint(color, 0.15), { at: [x, y + h - 0.012, z] }, 18);
  b.cylinder(r + 0.002, r + 0.002, h * 0.25, 0xd8c8a0, { at: [x, y + h * 0.45, z] }, 18);
}

/**
 * Clusters for the wall tops, two to a cluster (consecutive slots differ):
 * tin planters, a record player on a crate with sleeves, crates stacked two
 * high, growlers on a crate, a stack of the factory's old biscuit tins,
 * books and a trailing plant.
 */
export const WAREHOUSE_WALL_TOP_PROPS: readonly (() => Model)[] = [
  wallTop((b) => {
    // Three tin planters, one up on a crate.
    crate(b, -0.08, 0, 0, 0.26, 0.16, 0.22, 0.1, false);
    tinPlant(b, -0.08, 0.16, 0, 0);
    tinPlant(b, 0.16, 0, 0.04, 1, 0.06);
    tinPlant(b, -0.26, 0, -0.04, 3, 0.055);
  }, 1.5),
  wallTop((b) => {
    // A record player on a crate of records, sleeves leaning on it.
    crate(b, 0, 0, 0, 0.36, 0.2, 0.3, 0, false);
    for (let i = 0; i < 6; i++)
      b.box(
        0.012,
        0.18,
        0.26,
        [0x2a2a2a, 0xc87a4a, 0x3a5a7a, 0xd8c8a0][i % 4] ?? DARK,
        {
          at: [-0.14 + i * 0.05, 0.12, 0],
          rot: [0, 0, 0.08],
        },
        0,
      );
    const y = 0.2;
    b.box(0.34, 0.07, 0.28, 0x7a4a2e, { at: [0, y + 0.035, 0] }, 0.01);
    b.cylinder(0.11, 0.11, 0.012, 0x1e1e1e, { at: [-0.04, y + 0.076, 0] }, 24);
    b.cylinder(0.035, 0.035, 0.014, 0xd04a3a, { at: [-0.04, y + 0.078, 0] }, 12);
    b.box(0.012, 0.012, 0.16, 0xb8bec8, { at: [0.11, y + 0.09, 0.0], rot: [0, 0.35, 0] }, 0);
    // A sleeve leaning against it.
    b.box(0.24, 0.24, 0.01, 0xd8a84a, { at: [0.0, 0.12, 0.17], rot: [-0.25, 0, 0] }, 0);
    b.cylinder(
      0.06,
      0.06,
      0.004,
      0x3a5a7a,
      { at: [0.0, 0.13, 0.18], rot: [Math.PI / 2 - 0.25, 0, 0] },
      16,
    );
  }, 1.45),
  wallTop((b) => {
    // Biscuit crates stacked two high, the top one turned.
    crate(b, 0, 0, 0, 0.4, 0.2, 0.3, 0);
    crate(b, 0.03, 0.2, 0, 0.34, 0.18, 0.28, 0.3);
  }, 1.4),
  wallTop((b) => {
    // The brewery's empty growlers on a crate, one on the coping.
    crate(b, 0, 0, 0, 0.36, 0.14, 0.26, 0, false);
    growler(b, -0.1, 0.14, 0.0);
    growler(b, 0.06, 0.14, 0.02, 0x4a5a2e);
    growler(b, 0.26, 0, 0.06);
  }, 1.45),
  wallTop((b) => {
    // The factory's old biscuit tins, stacked.
    biscuitTin(b, 0, 0, 0, 0.14, 0.09, 0x6a8a9a);
    biscuitTin(b, 0.01, 0.09, 0.0, 0.12, 0.08, 0xb05a4a);
    biscuitTin(b, -0.01, 0.17, 0.0, 0.09, 0.08, 0xc8a050);
    biscuitTin(b, 0.24, 0, 0.05, 0.08, 0.12, 0x5a7a5a);
  }, 1.45),
  wallTop((b) => {
    // A pile of design books, a plant trailing over them.
    const spines = [0x8a6a5a, 0x5a6a7a, 0xb8a67a, 0x6a7a6a];
    for (let i = 0; i < 4; i++)
      b.box(
        0.28 - i * 0.02,
        0.05,
        0.2,
        spines[i] ?? DARK,
        {
          at: [i * 0.01, 0.025 + i * 0.05, 0],
          rot: [0, i * 0.12, 0],
        },
        0,
      );
    tinPlant(b, 0.02, 0.2, 0, 4, 0.06);
  }, 1.4),
];

/** Low things lying on the front walls: a rolled yoga mat, a coil of rope, a crate on its side, a skateboard. */
export const WAREHOUSE_FRONT_WALL_PROPS: readonly (() => Model)[] = [
  wallTop((b) => {
    b.cylinder(0.05, 0.05, 0.42, 0x8a7a9a, { at: [0, 0.05, 0], rot: [0, 0, Math.PI / 2] }, 14);
    for (const x of [-0.12, 0.12])
      b.cylinder(0.052, 0.052, 0.02, 0x5a4a6a, { at: [x, 0.05, 0], rot: [0, 0, Math.PI / 2] }, 14);
  }, 1.3),
  wallTop((b) => {
    for (let i = 0; i < 3; i++)
      b.add(new THREE.TorusGeometry(0.12 - i * 0.015, 0.016, 6, 20), 0xb8a070, {
        at: [i * 0.01, 0.016 + i * 0.03, 0],
        rot: [Math.PI / 2, 0, 0],
      });
  }, 1.4),
  wallTop((b) => {
    crate(b, 0, 0, 0, 0.34, 0.1, 0.24, 0.15, false);
    b.box(0.2, 0.004, 0.14, 0xe0d4b4, { at: [0.02, 0.102, 0], rot: [0, 0.2, 0] }, 0);
  }, 1.3),
  wallTop((b) => {
    b.box(0.44, 0.018, 0.12, 0x5a6a5a, { at: [0, 0.05, 0] }, 0.008);
    for (const x of [-0.15, 0.15])
      for (const z of [-0.04, 0.04])
        b.cylinder(
          0.022,
          0.022,
          0.02,
          0xd8c8a0,
          { at: [x, 0.022, z], rot: [Math.PI / 2, 0, 0] },
          10,
        );
  }, 1.4),
];
