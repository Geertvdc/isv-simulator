import { gridToWorld } from '../../projection';
import {
  LOFT_PLINTH_LOOKS,
  LOFT_WALL_ART,
  LOFT_WALL_LOOKS,
  PENDANT_HANG,
  liftDoorModel,
  loftDeskCounter,
  loftPendantModel,
  loftPlinthModel,
  loftWallModel,
  loftWireModel,
  polishedFloorModel,
  polishedLook,
  polishedTone,
  roofDoorFrontModel,
  roofDoorTallModel,
} from '../roomModels/loft';
import { LOFT_FRONT_WALL_PROPS, LOFT_WALL_TOP_PROPS } from '../setDressing/loftWallTops';
import { type LoftRoom, type Side, globeFit, loftRoom } from './loftRoom';
import type { RoomDressing } from './types';

/** The turn that puts a door model's back (−z) toward the outside on `side`. */
const DOOR_YAW: Readonly<Record<Side, number>> = {
  back: 0,
  front: Math.PI,
  left: Math.PI / 2,
  right: -Math.PI / 2,
};

/**
 * The rooftop loft of the Seed Round level (wall theme `loft`, floor theme
 * `polished`; see `loftRoom` for the plan and
 * `docs/plan/seed-round-environment.md` for the brief): white-painted brick
 * over a birch-ply band of shelving with black steel trim, the building's
 * board-marked concrete under a galvanised coping, polished concrete with
 * its saw cuts and wear, black steel trestle desks with dark-stained ply
 * tops, the startup's spillover in clusters on the wall tops, linear LED
 * pendants on a steel cable, and the story pieces: the lift door from the
 * core at the inbox, the door out to the roof (production) at the ship
 * hatch, and on the back wall the dashboard with prod on fire, the seed
 * cheque, the growth chart, the neon logo and the incident beacon.
 */
export const LOFT_ROOM: RoomDressing<LoftRoom> = {
  plan: loftRoom,
  wallTops: LOFT_WALL_TOP_PROPS,
  frontWallProps: LOFT_FRONT_WALL_PROPS,
  wall: { model: loftWallModel, looks: LOFT_WALL_LOOKS },
  floor: { theme: 'polished', model: polishedFloorModel, look: polishedLook, tone: polishedTone },
  foundation: { model: loftPlinthModel, looks: LOFT_PLINTH_LOOKS },
  counter: loftDeskCounter,
  lamp: {
    model: loftPendantModel,
    wire: { hang: PENDANT_HANG, model: loftWireModel },
    fit: globeFit,
  },
  placeStory({ liftDoor, roofDoor, wallArt }, _map, place) {
    if (liftDoor) {
      const span = liftDoor.tiles.length;
      const low = liftDoor.side === 'front';
      place(`liftDoor:${span}:${low}`, () => liftDoorModel(span, low), {
        at: gridToWorld(liftDoor.mid.x, liftDoor.mid.y),
        yaw: DOOR_YAW[liftDoor.side],
      });
    }
    if (roofDoor) {
      const span = roofDoor.tiles.length;
      const at = gridToWorld(roofDoor.mid.x, roofDoor.mid.y);
      if (roofDoor.side === 'front')
        place(`roofDoorFront:${span}`, () => roofDoorFrontModel(span), { at, yaw: 0 });
      else
        place(`roofDoor:${span}`, () => roofDoorTallModel(span), {
          at,
          yaw: DOOR_YAW[roofDoor.side],
        });
    }
    for (const { x, y, art } of wallArt) {
      const model = LOFT_WALL_ART[art];
      if (model) place(`art:${art}`, model, { at: gridToWorld(x, y), yaw: 0 });
    }
  },
};
