import { floorModel, wallModel } from '../roomModels';
import type { RoomDressing } from './types';

/**
 * The biscuit-works rooms of the Down the Hall level (wall theme
 * `warehouse`, floor theme `boards`). A stub for now: it builds like wood
 * walls on parquet, with the default decorations and clutter; see
 * `docs/plan/down-the-hall-environment.md` for the brief.
 */
export const WAREHOUSE_ROOM: RoomDressing = {
  plan: () => ({}),
  wall: { model: (piece) => wallModel('wood', piece), looks: 1 },
  floor: { theme: 'boards', model: () => floorModel('parquet') },
};
