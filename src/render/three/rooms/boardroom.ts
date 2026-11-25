import { FoldingWalls } from '../boardroom/foldingWalls';
import type { RoomDressing } from './types';

/**
 * YOTTA Tower's boardroom floor, 4-2 Synergy (wall theme `boardroom`, floor
 * theme `boardroomFloors`; see `docs/plan/synergy-environment.md`): the
 * boardroom between the dev side and the ops side, whose folding walls open
 * for MONOLITH's synergy workshop. Stub until the environment pass fills it.
 */
export const BOARDROOM_ROOM: RoomDressing = {
  plan: () => ({}),
  // The folding walls and the rolling boardroom table: their own track (`boardroom/foldingWalls.ts`).
  movingTiles: (root, map) => new FoldingWalls(root, map),
};
