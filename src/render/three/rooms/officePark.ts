import { floorModel, wallModel } from '../roomModels';
import type { RoomDressing } from './types';

/**
 * The business-park unit of the Open Plan Office level (wall theme
 * `officePark`, floor theme `carpetTiles`). A stub for now: it builds like
 * plaster walls on carpet, with the default decorations and clutter; see
 * `docs/plan/open-plan-environment.md` for the brief.
 */
export const OFFICE_PARK_ROOM: RoomDressing = {
  plan: () => ({}),
  wall: { model: (piece) => wallModel('plaster', piece), looks: 1 },
  floor: { theme: 'carpetTiles', model: () => floorModel('carpet') },
};
