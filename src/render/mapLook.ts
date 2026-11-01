import type { BlockTile } from '../sim/level';

/**
 * Wall looks a level can pick. `garage` is painted cinder block, and dresses
 * the room as a converted garage: roll-up door at the ship hatch, house door
 * at the inbox, pegboard and paint tins, counters as doors on sawhorses.
 */
export const WALL_THEMES = ['plaster', 'wood', 'glass', 'garage'] as const;
export type WallTheme = (typeof WALL_THEMES)[number];

/** Floor looks a level can pick. `slab` is a garage's sealed concrete, joints, oil stain and all. */
export const FLOOR_THEMES = ['concrete', 'carpet', 'parquet', 'slab'] as const;
export type FloorTheme = (typeof FLOOR_THEMES)[number];

/** How a level's map looks. */
export interface MapLook {
  walls: WallTheme;
  floor: FloorTheme;
  /** The chapter whose world surrounds the level; none for a bare slab. */
  setting?: string;
  /**
   * A hand-built world around this one level (`src/render/three/scenes/`),
   * in place of the chapter's rows of props; none for the chapter's rows.
   */
  scene?: string;
}

export const DEFAULT_LOOK: MapLook = { walls: 'plaster', floor: 'concrete' };

/** Map look per level id; levels not listed get `DEFAULT_LOOK`. */
export const LEVEL_LOOKS: Readonly<Record<string, MapLook>> = {
  garage: { walls: 'garage', floor: 'slab', scene: 'garage' },
  'open-plan': { walls: 'glass', floor: 'carpet' },
  'scale-up': { walls: 'wood', floor: 'parquet' },
  // Startup: a loft, warm wood.
  'seed-round': { walls: 'wood', floor: 'concrete' },
  'demo-day': { walls: 'plaster', floor: 'parquet' },
  'on-call': { walls: 'wood', floor: 'carpet' },
  // Scale-Up: glass walls go in.
  'middle-management': { walls: 'glass', floor: 'concrete' },
  hypergrowth: { walls: 'glass', floor: 'parquet' },
  'hot-desking': { walls: 'plaster', floor: 'carpet' },
  // Enterprise: carpet and glass as far as the eye can see.
  'back-to-back': { walls: 'glass', floor: 'carpet' },
  synergy: { walls: 'plaster', floor: 'concrete' },
  'the-reorg': { walls: 'glass', floor: 'carpet' },
  // Big Tech: a bright campus, wood and glass.
  'the-atrium': { walls: 'glass', floor: 'parquet' },
  'design-sprint': { walls: 'wood', floor: 'concrete' },
  monorepo: { walls: 'glass', floor: 'concrete' },
  hackathon: { walls: 'plaster', floor: 'parquet' },
  // Lab levels have no chapter: they borrow a world.
  'lab-shapes': { walls: 'glass', floor: 'carpet', setting: 'scale-up' },
  'lab-dev': { walls: 'wood', floor: 'parquet', setting: 'startup' },
  'lab-roles': { walls: 'glass', floor: 'carpet', setting: 'scale-up' },
};

/** Signature color per block, shared by the HUD recipes, ticket step icons and intro pictures. */
const BLOCK_COLORS: Readonly<Record<BlockTile, number>> = {
  wall: 0x9aa3b5,
  counter: 0x8a8f99,
  inbox: 0x4fa3e0,
  bugQueue: 0xe05a5a,
  keyboard: 0x6cc070,
  testBench: 0xe0b44f,
  review: 0xb07ce0,
  pipeline: 0xe07c4f,
  ship: 0x4fe0b0,
  bin: 0x5a5a5a,
  conveyor: 0x4a505c,
  whiteboard: 0xdfe6ee,
  merge: 0xe8459a,
};

/** A block's signature color, so the HUD and billboards can match it. */
export function tileColor(tile: BlockTile): number {
  return BLOCK_COLORS[tile];
}
