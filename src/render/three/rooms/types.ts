import type { LevelMap } from '../../../sim/level';
import type { FloorTheme } from '../../mapLook';
import type { WallPiece } from '../../mapShape';
import type { Vec3 } from '../../projection';
import type { Model } from '../kit';
import type { StationModel } from '../stationModels';
import type { CounterRun } from './counterRun';

/**
 * How a wall theme dresses its room (`rooms/<theme>.ts`, registered in
 * `rooms/index.ts`): `MapView` asks it for a plan of the room, then for the
 * models it builds from. Everything is optional; what a dressing leaves out
 * is built the default way (hashed wall decorations and clutter, the
 * theme's plain walls and floor, the wooden slab, plain counters, no lamps).
 */

/** One placed copy of a model: where its origin goes, its turn, and an instance tint (white keeps its colors). */
export interface RoomPlacement {
  at: Vec3;
  yaw: number;
  tint?: number;
}

/**
 * Places a copy of `model` (built once per `key`; every copy with the key
 * is one instanced mesh).
 */
export type Place = (key: string, model: () => Model, p: RoomPlacement) => void;

/**
 * A room's plan, worked out from the map's own tiles (pure, no three.js, so
 * it can be tested). Tiles are keyed `x,y`. A field left out means the
 * default for it.
 */
export interface RoomPlan {
  /** What hangs on each wall, by name in `WALL_DECO_MODELS`; replaces the hashed decorations. */
  decos?: Record<string, string>;
  /** Wear on each floor tile, a number the floor's `look` turns into a floor look; bare tiles left out. */
  floorWear?: Record<string, number>;
  /**
   * Props on the wall tops (from `RoomDressing.wallTops`): each tile's
   * `slot` (consecutive slots pick different props) and the step toward a
   * neighbour to lean on. Replaces the hashed wall-top clutter.
   */
  capProps?: { x: number; y: number; slot: number; toward: { dx: number; dy: number } }[];
  /** Low props lying on the front wall (from `RoomDressing.frontWallProps`), by `slot` as for `capProps`. */
  frontProps?: { x: number; y: number; slot: number }[];
  /**
   * Wall tiles built as another model (a closed garage door), by name in
   * `RoomDressing.swapModels`; the floor runs under them.
   */
  swaps?: Record<string, string>;
}

/** A floor theme's own floor: its model per look, and how each tile picks its look and tone. */
export interface FloorDressing {
  /** The floor theme it builds; used whenever a level has this floor, whatever its walls. */
  theme: FloorTheme;
  /** The floor tile in look `look` (from `look`, else 0). */
  model(look: number): Model;
  /** The look of tile (x, y) with `wear` (from `RoomPlan.floorWear`, else 0). */
  look?(x: number, y: number, wear: number): number;
  /** The brightness of tile (x, y) in level `level` (its `levelSalt`), around 1; else a gentle checker. */
  tone?(x: number, y: number, level: number): number;
}

/** A room's dressing, for one wall theme. `P` is its own plan, with whatever its story needs. */
export interface RoomDressing<P extends RoomPlan = RoomPlan> {
  /** The plan of the room on `map`: pure and deterministic. */
  plan(map: LevelMap): P;
  /** What stands on wall tops, for `capProps` or the hashed clutter. */
  wallTops?: readonly (() => Model)[];
  /** What lies on the front wall, for `frontProps`. */
  frontWallProps?: readonly (() => Model)[];
  /** The wall model per piece, in `looks` looks (picked per tile by its hash). */
  wall?: { model(piece: WallPiece, look: number): Model; looks: number };
  /** The floor, for the floor theme it names. */
  floor?: FloorDressing;
  /** The foundation under every tile (in place of the wooden slab), in `looks` looks. */
  foundation?: { model(look: number): Model; looks: number };
  /** The counter model for a tile from its run (in place of the plain counter). */
  counter?: (run: CounterRun) => StationModel;
  /** Models for `RoomPlan.swaps`, by name. */
  swapModels?: Readonly<Record<string, () => Model>>;
  /**
   * The light fitting hung at each of the atmosphere's lamp spots (see
   * `lampSpots`), its top `hang` over the spot, and the wire strung wall to
   * wall through the tops of each row's fittings (from `[x, y]` points).
   */
  lamp?: {
    model: () => Model;
    wire?: { hang: number; model(points: readonly [number, number][]): Model };
  };
  /** Places the room's one-off story pieces (doors, a banner, a stain). */
  placeStory?(plan: P, map: LevelMap, place: Place): void;
  /** Keys of story pieces that cast no shadow (flat things: a mat, a stain). */
  flat?: ReadonlySet<string>;
}
