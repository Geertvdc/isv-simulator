import { ReorgGates } from '../reorg/gates';
import { Partitions } from '../reorg/partitions';
import type { RoomDressing } from './types';

/**
 * YOTTA Tower's boardroom floor mid-reorg, 4-3 The Reorg (wall theme
 * `reorg`, floor theme `reorgFloors`; see
 * `docs/plan/the-reorg-environment.md`): Silos, Open Plan and Matrix round a
 * fixed boardroom, and the shipping lobby behind the badge turnstiles. Stub
 * until the environment pass fills it.
 */
export const REORG_ROOM: RoomDressing = {
  plan: () => ({}),
  // The consultants' partitions and the rolling desks: their own track (`reorg/partitions.ts`).
  movingTiles: (root, map) => new Partitions(root, map),
  // The badge turnstiles, the staff door and the meeting doors (`reorg/gates.ts`).
  gates: (root) => new ReorgGates(root),
};
