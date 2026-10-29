/**
 * The world map's towns and cities as plain data (testable in Node): the
 * kinds of set piece, their sizes and styles, the ground kinds, and the back
 * street. `cityPlanner.ts` decides where every piece stands, from the
 * chapter themes in `cityThemes.ts`.
 */

import type { WorldMap } from '../../../flow/worldMap';
import type { Rect } from './mapGeometry';
import { LABEL, markerSpots } from './markers';

export { denseRoad, rectDistance } from './mapGeometry';

/** Land added behind the island (render only), for the cities' tall back rows. */
export const BACKLOT = 4;
/** The back street: one row of tiles across the whole island, with a turning circle at each end. */
export const STREET = { row: -1, laneOffset: 0.2, end: 0.65 };

/**
 * How far the camera's view tilts a height back onto the ground: a point
 * `h` up hides the ground `h × SILHOUETTE` behind it (the camera looks down
 * at 56°, so 1 / tan 56°).
 */
export const SILHOUETTE = 1 / Math.tan((56 * Math.PI) / 180);

/** Every kind of piece on the map, by chapter theme. */
export const PIECE_KINDS = [
  // Garage town
  'house',
  'garage',
  'fence',
  'mailbox',
  'bike',
  // Startup park
  'warehouse',
  'cowork',
  'kiosk',
  'scooter',
  'bench',
  'pingPong',
  'picnic',
  // Scale-up downtown
  'office',
  'crane',
  'lamp',
  'car',
  // Enterprise city
  'tower',
  'hq',
  'fountain',
  'planter',
  // Big Tech campus
  'glassTower',
  'campus',
  'skyscraper',
  'helipad',
  'hedge',
  // Engineering, here and there from the garage on
  'serverRack',
  'dish',
  'antenna',
  'solar',
  'cooling',
  'spool',
  'dronePad',
  'robot',
  'evCharger',
  // Street furniture and the like
  'shed',
  'bin',
  'hydrant',
  'busStop',
  'bikeRack',
  'foodTruck',
  // Everywhere: trees (instanced, they sway)
  'tree',
  'roundTree',
  'pine',
  'birch',
  'palm',
  'bush',
] as const;

export type PieceKind = (typeof PIECE_KINDS)[number];

/** The trees and bushes: instanced and swaying, not merged. */
export const TREE_KINDS = ['tree', 'roundTree', 'pine', 'birch', 'palm', 'bush'] as const;
export type TreeKind = (typeof TREE_KINDS)[number];

/**
 * How many styles a kind comes in (its shape: a gabled house or a flat-roofed
 * one, an office with ribbon windows or one with fins). The planner keeps
 * pieces of a kind next to each other in different styles.
 */
export const STYLES: Partial<Record<PieceKind, number>> = {
  house: 6,
  cowork: 3,
  office: 5,
  tower: 4,
  glassTower: 4,
  car: 4,
  serverRack: 3,
  dish: 2,
  antenna: 2,
  bench: 2,
  lamp: 2,
  busStop: 2,
  foodTruck: 3,
  shed: 2,
  cooling: 2,
  bin: 3,
  solar: 2,
};

/** Piece `p`'s style, from 0 to its kind's `STYLES` − 1. */
export function styleOf(p: Pick<CityPiece, 'kind' | 'variant'>): number {
  const n = STYLES[p.kind] ?? 1;
  return Math.min(n - 1, Math.floor(p.variant * n));
}

/** Pieces of a kind this close (middle to middle, map units) count as neighbours. */
export const NEIGHBOUR = 2.2;

export interface CityPiece {
  kind: PieceKind;
  chapter: number;
  /** The footprint's middle, in map units. */
  x: number;
  y: number;
  /** Footprint: width along x, depth along y. */
  w: number;
  d: number;
  /** Height in map units (for buildings, from their storeys). */
  h: number;
  storeys: number;
  /** Turn round the vertical axis; 0 faces the camera. Only small, square-ish pieces turn. */
  yaw: number;
  /** A number in [0, 1) the models pick colors and details from. */
  variant: number;
}

export type GroundKind = 'grass' | 'lawn' | 'paving' | 'concrete' | 'asphalt' | 'plaza';

export interface GroundTile {
  x: number;
  y: number;
  kind: GroundKind;
  chapter: number;
}

export interface CityPlan {
  pieces: CityPiece[];
  ground: GroundTile[];
}

/** A building's storey, in map units, and what it adds for a roof. */
export const STOREY = 0.4;

/** Big pieces: the ones that pave the ground round them and count in the skyline. */
const BUILDINGS: ReadonlySet<PieceKind> = new Set<PieceKind>([
  'house',
  'garage',
  'warehouse',
  'cowork',
  'office',
  'crane',
  'tower',
  'hq',
  'glassTower',
  'campus',
  'skyscraper',
]);

export function isBuilding(kind: PieceKind): boolean {
  return BUILDINGS.has(kind);
}

/** A piece's footprint. */
export function footprint(p: Pick<CityPiece, 'x' | 'y' | 'w' | 'd'>): Rect {
  return { x0: p.x - p.w / 2, y0: p.y - p.d / 2, x1: p.x + p.w / 2, y1: p.y + p.d / 2 };
}

/** The ground a piece hides from the camera: its footprint and the strip its height tips back onto. */
export function silhouette(p: Pick<CityPiece, 'x' | 'y' | 'w' | 'd' | 'h'>): Rect {
  const f = footprint(p);
  return { ...f, y0: f.y0 - p.h * SILHOUETTE };
}

/** The rectangles of every level number on the map. */
export function labelRects(map: WorldMap): Rect[] {
  return markerSpots(map).map(({ label }) => ({
    x0: label.x - LABEL.width / 2,
    y0: label.y - LABEL.height / 2,
    x1: label.x + LABEL.width / 2,
    y1: label.y + LABEL.height / 2,
  }));
}

/** Small seeded random numbers (mulberry32). */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A point on the back street's loop, and which way a car there faces (map units). */
export interface StreetSpot {
  x: number;
  y: number;
  /** Heading as a yaw: 0 drives toward the camera (+y), π/2 to the right (+x). */
  yaw: number;
}

/** The back street's loop for an island `width` wide: right along the near lane, round, back along the far one. */
export function streetLoop(width: number): {
  length: number;
  at: (distance: number) => StreetSpot;
} {
  const c = STREET.row + 0.5;
  const r = STREET.laneOffset;
  const x0 = STREET.end;
  const x1 = Math.max(x0, width - STREET.end);
  const straight = x1 - x0;
  const arc = Math.PI * r;
  const length = 2 * straight + 2 * arc;
  const at = (distance: number): StreetSpot => {
    let s = ((distance % length) + length) % length;
    if (s < straight) return { x: x0 + s, y: c + r, yaw: Math.PI / 2 };
    s -= straight;
    if (s < arc) {
      const theta = Math.PI / 2 - (s / arc) * Math.PI;
      return {
        x: x1 + r * Math.cos(theta),
        y: c + r * Math.sin(theta),
        yaw: Math.atan2(Math.sin(theta), -Math.cos(theta)),
      };
    }
    s -= arc;
    if (s < straight) return { x: x1 - s, y: c - r, yaw: -Math.PI / 2 };
    s -= straight;
    const theta = -Math.PI / 2 - (s / arc) * Math.PI;
    return {
      x: x0 + r * Math.cos(theta),
      y: c + r * Math.sin(theta),
      yaw: Math.atan2(Math.sin(theta), -Math.cos(theta)),
    };
  };
  return { length, at };
}
