import type { BlockTile } from '../sim/level';

/**
 * Wall looks a level can pick. `garage` is painted cinder block, and dresses
 * the room as a converted garage: roll-up door at the ship hatch, house door
 * at the inbox, pegboard and paint tins, counters as doors on sawhorses.
 * `officePark` is a business-park unit (Open Plan Office), `warehouse` an old
 * brick factory (Down the Hall), `loft` a startup's rooftop loft (Seed Round),
 * `stageSet` the demo set on the Demo Day stage, `basement` the painted
 * block basement under the loft building (On Call), `midRise` a rented floor
 * of a mid-rise office building: plasterboard and glass partitions (Middle
 * Management), `lowerFloors` the same building's ground and first floor
 * mid-move-in, with a lift, a stairwell and a loading bay (Hypergrowth), `upperFloors` three
 * floors of it shown as a cutaway round one lift, full of lockers (Hot Desking), `tower` a high
 * floor of YOTTA Tower, the HQ: glass offices and meeting rooms off a corridor in a
 * heatwave (Back to Back). A theme's room dressing, if it has one, is
 * in `src/render/three/rooms/`.
 */
export const WALL_THEMES = [
  'plaster',
  'wood',
  'glass',
  'garage',
  'officePark',
  'warehouse',
  'loft',
  'stageSet',
  'basement',
  'midRise',
  'lowerFloors',
  'upperFloors',
  'tower',
  'boardroom',
] as const;
export type WallTheme = (typeof WALL_THEMES)[number];

/**
 * Floor looks a level can pick. `slab` is a garage's sealed concrete, joints,
 * oil stain and all; `carpetTiles` an office's carpet tiles, `boards` old
 * timber floorboards, `polished` a loft's polished concrete, `stageDeck`
 * painted black-grey stage decks, `raisedFloor` a server room's grey
 * anti-static raised-floor tiles, `corporateCarpet` a rented office floor's
 * new two-tone carpet tiles, `mixedFloors` a rubber ground floor, carpet
 * upstairs and concrete stair treads between them, `threeFloors` worn carpet on
 * the hot-desk floor, vinyl in the test lab and carpet in the meeting room,
 * `towerFloors` an HQ floor's new carpet in the offices and meeting rooms and a
 * hard corridor between them, `boardroomFloors` the same tower's boardroom
 * floor: the boardroom's carpet, the dev and ops sides' and the corridors'.
 */
export const FLOOR_THEMES = [
  'concrete',
  'carpet',
  'parquet',
  'slab',
  'carpetTiles',
  'boards',
  'polished',
  'stageDeck',
  'raisedFloor',
  'corporateCarpet',
  'mixedFloors',
  'threeFloors',
  'towerFloors',
  'boardroomFloors',
] as const;
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
  'open-plan': { walls: 'officePark', floor: 'carpetTiles', scene: 'open-plan' },
  'scale-up': { walls: 'warehouse', floor: 'boards', scene: 'scale-up' },
  // Startup: a rooftop loft in the city.
  'seed-round': { walls: 'loft', floor: 'polished', scene: 'seed-round' },
  // Demo Day: building it live on the accelerator's stage.
  'demo-day': { walls: 'stageSet', floor: 'stageDeck', scene: 'demo-day' },
  // On Call: the basement server room under the loft building, 3 AM.
  'on-call': { walls: 'basement', floor: 'raisedFloor', scene: 'on-call' },
  // Middle Management: a whole floor of a mid-rise, spring morning; meet Derek.
  'middle-management': { walls: 'midRise', floor: 'corporateCarpet', scene: 'middle-management' },
  // Scale-Up: glass walls go in.
  // Hypergrowth: two floors of the same building on a rainy day, more hires than desks.
  hypergrowth: { walls: 'lowerFloors', floor: 'mixedFloors', scene: 'hypergrowth' },
  // Hot Desking: three floors of the same building as a cutaway round one lift, Friday afternoon.
  'hot-desking': { walls: 'upperFloors', floor: 'threeFloors', scene: 'hot-desking' },
  // Enterprise: carpet and glass as far as the eye can see.
  // Back to Back: a high floor of YOTTA Tower in a summer heatwave, meeting rooms named after where they came from.
  'back-to-back': { walls: 'tower', floor: 'towerFloors', scene: 'back-to-back' },
  // Synergy: the same tower's boardroom floor, summer afternoon; MONOLITH comes to align.
  synergy: { walls: 'boardroom', floor: 'boardroomFloors', scene: 'synergy' },
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
  'lab-spills': { walls: 'plaster', floor: 'concrete', setting: 'startup' },
  'lab-lifts': { walls: 'glass', floor: 'carpet', setting: 'scale-up' },
  'lab-reorg': { walls: 'glass', floor: 'carpet', setting: 'enterprise' },
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
