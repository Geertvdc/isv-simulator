import * as THREE from 'three';
import { ModelBuilder } from '../../kit';
import { COLOR } from '../../palette';
import { STOREY } from '../cityPlan';

/** Shared bits of the map's models: the builders, the palette, roofs and windows. */

export interface PieceBuilders {
  body: ModelBuilder;
  shiny: ModelBuilder;
  blink: ModelBuilder;
}

/** The builders a model draws into, with `glow` the body builder's glowing layer. */
export type Parts = PieceBuilders & { glow: ModelBuilder };

export const C = {
  white: COLOR.offWhite,
  ink: COLOR.charcoal,
  frame: 0xf7f4ee,
  pane: 0x6e8fae,
  paneDark: 0x4d6684,
  lit: COLOR.windowLit,
  trunk: COLOR.walnut,
  leaf: COLOR.leaf,
  leafLight: COLOR.leafLight,
  leafDark: 0x3f8a45,
  steel: COLOR.steel,
  concrete: COLOR.concrete,
  roofTop: 0x8d949c,
  crane: 0xffc12e,
  warn: 0xff3b2f,
  water: 0x5fc3e4,
  glass: 0x8fd0e4,
  glassDeep: 0x5fa9c8,
  teal: COLOR.teal,
  purple: COLOR.purple,
};

/** Garage-town house walls, roofs and doors. */
export const HOUSE_WALLS = [
  0xf2c57c,
  COLOR.powderBlue,
  0xf4a7a0,
  0xb9dc8f,
  COLOR.chalk,
  0xe9b6d8,
  0xd8c8b0,
  0xc8d8e0,
  0xe8d8a0,
];
export const HOUSE_ROOFS = [
  COLOR.brickRed,
  0x5a6f8a,
  0x8a5a3a,
  COLOR.forestGreen,
  COLOR.burntOrange,
  0x6a6a70,
  0x9a4a4a,
];
export const DOORS = [
  COLOR.forestGreen,
  COLOR.steelBlue,
  COLOR.brickRed,
  0x8a5a3a,
  COLOR.charcoal,
  COLOR.mustard,
];
export const OFFICE_WALLS = [
  COLOR.sandstone,
  0xb8c6d2,
  0xe0a87a,
  0xa9c2b2,
  0xd9dde0,
  0xc9a98a,
  0xb5684f,
  0x9fb0c0,
  0xd8c098,
];
export const TOWER_WALLS = [
  0x6f86a6,
  0x8b9bb0,
  0x5d6f8a,
  0xa5b0bd,
  0xc9b79c,
  0x7f8f9f,
  0x8a7f9a,
  COLOR.greyTeal,
  0x9a8a7a,
];
export const CAR_PAINT = [
  COLOR.accentRed,
  COLOR.brightBlue,
  COLOR.sunYellow,
  COLOR.offWhite,
  COLOR.teal,
  COLOR.violet,
  COLOR.asphalt,
  0xc8ccd2,
  0x6aa84f,
];
export const COWORK_ACCENT = [COLOR.salmon, COLOR.freshGreen, COLOR.sunYellow, COLOR.skyBlue];

/** The fractional part of `v`, for picking colors from a variant independent of its style. */
export function frac(v: number): number {
  return v - Math.floor(v);
}

export function choose<T>(list: readonly T[], v: number): T {
  const item = list[Math.floor(v * list.length) % list.length];
  if (item === undefined) throw new Error('empty list');
  return item;
}

/** A triangular prism roof: `w` along x, `d` across, `h` high, its base at y = 0. */
export function prism(w: number, d: number, h: number): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(-d / 2, 0);
  shape.lineTo(d / 2, 0);
  shape.lineTo(0, h);
  shape.closePath();
  const g = new THREE.ExtrudeGeometry(shape, { depth: w, bevelEnabled: false });
  g.translate(0, 0, -w / 2);
  g.rotateY(Math.PI / 2);
  return g;
}

/**
 * Windows in rows (one per storey) on the front and both sides of a box
 * `w` × `d` whose storeys start at `base`. Some panes are lit.
 */
export function windowGrid(
  b: ModelBuilder,
  w: number,
  d: number,
  storeys: number,
  base: number,
  rng: () => number,
  opts: { pane?: number; lit?: number; litShare?: number; width?: number; frame?: number } = {},
): void {
  const pane = opts.pane ?? C.pane;
  const lit = opts.lit ?? C.lit;
  const share = opts.litShare ?? 0.25;
  const size = opts.width ?? 0.2;
  const sides: {
    len: number;
    at: (u: number, y: number) => [number, number, number];
    yaw: number;
  }[] = [
    { len: w, at: (u, y) => [u, y, d / 2 + 0.006], yaw: 0 },
    { len: d, at: (u, y) => [w / 2 + 0.006, y, -u], yaw: Math.PI / 2 },
    { len: d, at: (u, y) => [-w / 2 - 0.006, y, u], yaw: -Math.PI / 2 },
  ];
  for (const side of sides) {
    const cols = Math.max(1, Math.floor((side.len - 0.15) / (size + 0.13)));
    const step = (side.len - 0.1) / cols;
    for (let s = 0; s < storeys; s++) {
      const y = base + s * STOREY + STOREY * 0.55;
      for (let c = 0; c < cols; c++) {
        const u = -side.len / 2 + 0.05 + step * (c + 0.5);
        const geometry = new THREE.PlaneGeometry(size, STOREY * 0.5);
        const place = { at: side.at(u, y), rot: [0, side.yaw, 0] as [number, number, number] };
        if (rng() < share) b.add(geometry, lit, place, 'glow');
        else b.add(geometry, pane, place);
      }
    }
  }
}
