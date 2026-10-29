import * as THREE from 'three';
import { ModelBuilder } from '../../kit';
import { COLOR } from '../../palette';
import { type TreeKind } from '../cityPlan';
import { C } from './shared';

/** Trees: built once per kind, instanced and swaying (see `cityscape.ts`). */

/** How tall each tree kind's model stands, so the cityscape scales it to the piece. */
export const TREE_HEIGHT: Readonly<Record<TreeKind, number>> = {
  tree: 1.75,
  roundTree: 1.35,
  pine: 1.9,
  birch: 1.75,
  palm: 1.9,
  bush: 0.45,
};

/** A tree's geometry, built once and instanced per kind. */
export function treeModel(kind: TreeKind): ModelBuilder {
  const b = new ModelBuilder();
  // Low-poly leaves: there are a lot of trees, and the facets suit the toy look.
  const leaves = (r: number, color: number, at: [number, number, number], sy = 1): void => {
    b.add(new THREE.SphereGeometry(r, 9, 7).scale(1, sy, 1), color, { at });
  };
  if (kind === 'tree') {
    b.cylinder(0.08, 0.11, 0.8, C.trunk, { at: [0, 0.4, 0] }, 7);
    leaves(0.42, C.leaf, [0, 1.05, 0], 0.9);
    leaves(0.3, C.leafLight, [0.2, 1.33, 0.12]);
    leaves(0.28, C.leaf, [-0.22, 1.28, -0.1]);
  } else if (kind === 'roundTree') {
    b.cylinder(0.05, 0.07, 0.7, C.trunk, { at: [0, 0.35, 0] }, 7);
    leaves(0.32, C.leafLight, [0, 1.0, 0]);
  } else if (kind === 'pine') {
    b.cylinder(0.05, 0.08, 0.5, C.trunk, { at: [0, 0.25, 0] }, 6);
    for (const [y, r] of [
      [0.65, 0.4],
      [1.05, 0.32],
      [1.45, 0.22],
    ] as const)
      b.cone(r, 0.6, C.leafDark, { at: [0, y, 0] }, 8);
  } else if (kind === 'birch') {
    b.cylinder(0.035, 0.05, 1.2, 0xece6da, { at: [0, 0.6, 0] }, 7);
    for (const y of [0.3, 0.55, 0.8]) b.box(0.06, 0.02, 0.1, C.ink, { at: [0, y, 0.02] }, 0);
    leaves(0.26, 0x8cc65a, [0, 1.4, 0], 1.35);
    leaves(0.18, 0x9ad06a, [0.14, 1.2, 0.06]);
  } else if (kind === 'palm') {
    // A gently curving trunk and a crown of drooping fronds.
    for (let i = 0; i < 5; i++)
      b.cylinder(
        0.045 - i * 0.004,
        0.055 - i * 0.004,
        0.34,
        0x9a7a52,
        { at: [i * i * 0.012, 0.17 + i * 0.32, 0], rot: [0, 0, -i * 0.05] },
        7,
      );
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * Math.PI * 2;
      b.box(
        0.5,
        0.02,
        0.12,
        k % 2 ? C.leaf : C.leafDark,
        {
          at: [0.2 + Math.cos(a) * 0.22, 1.66, Math.sin(a) * 0.22],
          rot: [0, -a, -0.45],
        },
        0,
      );
    }
  } else {
    leaves(0.22, C.leaf, [-0.08, 0.17, 0], 0.8);
    leaves(0.18, C.leafLight, [0.14, 0.15, 0.07], 0.8);
    leaves(0.045, COLOR.pink, [0.07, 0.31, 0.14]);
    leaves(0.045, COLOR.blossom, [-0.14, 0.33, 0.07]);
  }
  return b;
}
