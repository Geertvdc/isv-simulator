import { type Model, ModelBuilder, tint } from '../kit';
import { tileHash } from '../../mapShape';
import { tuft } from '../setDressing/suburb';
import type { GroundPatch, Scene } from './garage';

/**
 * The ground of a hand-built scene, as one model: thin slabs per surface
 * (concrete in cast slabs with joints, sidewalk flags, a raised curb,
 * asphalt with a painted line, lawns in mowing stripes) and tufts of long
 * grass. Each surface sits a hair above the one under it, so none flicker.
 */

/** The lawn everything else lies on, out to the horizon. */
export const LAWN = 0x5a7a44;
const MOWN = [0x6a8a4c, 0x5e7e44] as const;
const CONCRETE = 0xa8a49a;
const SIDEWALK = 0xb8b4aa;
const CURB = 0xc4c0b6;
const ROAD = 0x4a4c52;
const LINE = 0xd8c87a;
const PATIO = 0xb09a84;
const SOIL = 0x5a4434;
const STONE = 0x9a968a;
const CHALK = [0xe8a0b8, 0x8ac8e8, 0xe8d88a, 0xa8e0a0] as const;
const TUFT = 0x4e7a3a;

/** How high each surface's top sits above the ground. */
const TOP: Readonly<Record<GroundPatch['kind'], number>> = {
  lawn: 0.004,
  mown: 0.006,
  road: 0.008,
  soil: 0.02,
  stone: 0.03,
  concrete: 0.03,
  patio: 0.035,
  sidewalk: 0.05,
  chalk: 0.053,
  curb: 0.11,
};

/** A shade from 0 to 1 for slab (i, j) of a patch, so each slab has its own. */
function shade(i: number, j: number, salt: number): number {
  return (tileHash(i + salt * 131, j - salt * 17) % 1000) / 1000;
}

export function groundModel(scene: Pick<Scene, 'ground' | 'tufts'>): Model {
  const b = new ModelBuilder();
  scene.ground.forEach((g, k) => {
    surface(b, g, k);
  });
  for (const [x, z, s] of scene.tufts) tuft(b, x, z, s, TUFT);
  return b.build();
}

/** Lays slabs of `size` over the patch, `gap` apart over a darker joint, each its own shade. */
function slabs(
  b: ModelBuilder,
  g: GroundPatch,
  base: number,
  size: [number, number],
  gap: number,
  vary: number,
  salt: number,
): void {
  const top = TOP[g.kind];
  const w = g.x1 - g.x0;
  const d = g.z1 - g.z0;
  b.box(
    w,
    top - 0.006,
    d,
    tint(base, -0.3),
    { at: [(g.x0 + g.x1) / 2, (top - 0.006) / 2, (g.z0 + g.z1) / 2] },
    0,
  );
  const nx = Math.max(1, Math.round(w / size[0]));
  const nz = Math.max(1, Math.round(d / size[1]));
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < nz; j++) {
      const sw = w / nx;
      const sd = d / nz;
      const c = tint(base, (shade(i, j, salt) - 0.5) * vary);
      b.box(
        sw - gap,
        0.012,
        sd - gap,
        c,
        {
          at: [g.x0 + (i + 0.5) * sw, top - 0.006, g.z0 + (j + 0.5) * sd],
        },
        0,
      );
    }
  }
}

function surface(b: ModelBuilder, g: GroundPatch, salt: number): void {
  const w = g.x1 - g.x0;
  const d = g.z1 - g.z0;
  const cx = (g.x0 + g.x1) / 2;
  const cz = (g.z0 + g.z1) / 2;
  const top = TOP[g.kind];
  switch (g.kind) {
    case 'lawn':
      b.box(w, 0.004, d, LAWN, { at: [cx, top - 0.002, cz] }, 0);
      return;
    case 'mown': {
      // Stripes of two greens, the way a mower leaves them.
      const along = g.stripes ?? 'z';
      const span = along === 'z' ? w : d;
      const n = Math.max(1, Math.round(span / 0.62));
      for (let i = 0; i < n; i++) {
        const c = MOWN[i % 2] ?? LAWN;
        const t = span / n;
        if (along === 'z')
          b.box(t, 0.004, d, c, { at: [g.x0 + (i + 0.5) * t, top - 0.002, cz] }, 0);
        else b.box(w, 0.004, t, c, { at: [cx, top - 0.002, g.z0 + (i + 0.5) * t] }, 0);
      }
      return;
    }
    case 'concrete':
      slabs(b, g, CONCRETE, [1.45, 1.45], 0.035, 0.12, salt);
      // An old oil stain, where the car drips.
      if (d > 1.5)
        b.cylinder(0.32, 0.32, 0.004, 0x6a685e, { at: [cx + 0.1, top + 0.003, g.z1 - 1.1] }, 14);
      return;
    case 'sidewalk':
      slabs(b, g, SIDEWALK, [1, d], 0.03, 0.1, salt);
      return;
    case 'patio':
      slabs(b, g, PATIO, [0.5, 0.5], 0.03, 0.18, salt);
      return;
    case 'curb':
      b.box(w, top, d, CURB, { at: [cx, top / 2, cz] }, 0);
      return;
    case 'road': {
      b.box(w, top, d, ROAD, { at: [cx, top / 2, cz] }, 0);
      // A gutter along the curb, patched tar here and there, and the painted line.
      b.box(w, 0.003, 0.25, tint(ROAD, 0.12), { at: [cx, top + 0.001, g.z0 + 0.125] }, 0);
      for (let i = 0; i < w / 4; i++) {
        const x = g.x0 + i * 4 + shade(i, 0, salt) * 3;
        b.box(
          0.6 + shade(i, 1, salt),
          0.002,
          0.4,
          tint(ROAD, -0.15),
          {
            at: [x, top + 0.002, g.z0 + 0.6 + shade(i, 2, salt) * 1.2],
            rot: [0, shade(i, 3, salt), 0],
          },
          0,
        );
      }
      for (let x = g.x0; x < g.x1; x += 1.6)
        b.box(0.9, 0.003, 0.08, LINE, { at: [x + 0.45, top + 0.002, g.z0 + 2.4] }, 0);
      return;
    }
    case 'soil':
      b.box(w, top, d, SOIL, { at: [cx, top / 2, cz] }, 0);
      return;
    case 'stone':
      b.cylinder(
        Math.min(w, d) / 2 + 0.04,
        Math.min(w, d) / 2 + 0.06,
        top,
        STONE,
        {
          at: [cx, top / 2, cz],
        },
        9,
      );
      return;
    case 'chalk': {
      // A hopscotch: a row of squares, some doubled up, and a scribbled sun.
      const n = 5;
      for (let i = 0; i < n; i++) {
        const c = CHALK[i % CHALK.length] ?? CHALK[0];
        const x = g.x0 + ((i + 0.5) * (w - 0.4)) / n;
        for (const [ox, oz] of [
          [0, -0.12],
          [0, 0.12],
          [-0.12, 0],
          [0.12, 0],
        ] as const)
          b.box(ox ? 0.02 : 0.26, 0.002, oz ? 0.02 : 0.26, c, { at: [x + ox, top, cz + oz] }, 0);
      }
      b.cylinder(0.14, 0.14, 0.002, CHALK[2], { at: [g.x1 - 0.18, top, cz] }, 12);
      return;
    }
  }
}
