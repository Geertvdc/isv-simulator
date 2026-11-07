import { floorModel, wallModel } from '../roomModels';
import type { RoomDressing } from './types';

/**
 * The rooftop loft of the Seed Round level (wall theme `loft`, floor theme
 * `polished`). A stub for now: it builds like plaster walls on concrete,
 * with the default decorations and clutter; see
 * `docs/plan/seed-round-environment.md` for the brief.
 */
export const LOFT_ROOM: RoomDressing = {
  plan: () => ({}),
  wall: { model: (piece) => wallModel('plaster', piece), looks: 1 },
  floor: { theme: 'polished', model: () => floorModel('concrete') },
};
