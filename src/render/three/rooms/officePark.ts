import { gridToWorld } from '../../projection';
import {
  BRICK_LOOKS,
  OFFICE_PARK_WALL_LOOKS,
  STRIP_HANG,
  brickPlinthModel,
  carpetFloorModel,
  frontDoorModel,
  lobbyDoorModel,
  lobbyMatModel,
  lobbyThresholdModel,
  officeDeskCounter,
  officeParkWallModel,
  partitionModel,
  stripLightModel,
  stripWireModel,
  tallGlassDoorModel,
} from '../roomModels/officePark';
import {
  OFFICE_PARK_FRONT_WALL_PROPS,
  OFFICE_PARK_WALL_TOP_PROPS,
} from '../setDressing/officeParkWallTops';
import { type OfficeParkRoom, type Side, officeParkRoom, stripLightFit } from './officeParkRoom';
import type { RoomDressing } from './types';

/** The turn that puts a door model's back (−z) toward the outside on `side`. */
const DOOR_YAW: Readonly<Record<Side, number>> = {
  back: 0,
  front: Math.PI,
  left: Math.PI / 2,
  right: -Math.PI / 2,
};

/** A carpet tile's brightness: ±4% per tile, from the level's salt. */
function carpetTone(x: number, y: number, salt: number): number {
  const h = ((Math.imul(x + 31, 73856093) ^ Math.imul(y + 17, 19349663) ^ salt) >>> 0) % 1001;
  return 1 + (h / 1000 - 0.5) * 0.08;
}

/**
 * The business-park unit of the Open Plan Office (wall theme `officePark`,
 * floor theme `carpetTiles`; see `officeParkRoom` for the plan and
 * `docs/plan/open-plan-environment.md` for the brief): magnolia plasterboard
 * in looks, runs of old glass partition, the block's brick plinth, grey-blue
 * carpet tiles with their wear, beech-effect desks, office leftovers in
 * clusters on the wall tops, fluorescent battens on wires, the lobby door
 * round the inbox and the glass front door at the ship hatch.
 */
export const OFFICE_PARK_ROOM: RoomDressing<OfficeParkRoom> = {
  plan: officeParkRoom,
  wallTops: OFFICE_PARK_WALL_TOP_PROPS,
  frontWallProps: OFFICE_PARK_FRONT_WALL_PROPS,
  wall: { model: officeParkWallModel, looks: OFFICE_PARK_WALL_LOOKS },
  floor: {
    theme: 'carpetTiles',
    model: carpetFloorModel,
    look: (_x, _y, wear) => wear,
    tone: carpetTone,
  },
  foundation: { model: brickPlinthModel, looks: BRICK_LOOKS },
  counter: officeDeskCounter,
  swapModels: { partitionZ: partitionModel },
  lamp: {
    model: stripLightModel,
    wire: { hang: STRIP_HANG, model: stripWireModel },
    fit: stripLightFit,
  },
  placeStory({ lobbyDoor, lobbyMat, frontDoor }, _map, place) {
    if (lobbyDoor) {
      const span = lobbyDoor.tiles.length;
      const at = gridToWorld(lobbyDoor.mid.x, lobbyDoor.mid.y);
      if (lobbyDoor.side === 'front')
        place(`lobbyThreshold:${span}`, () => lobbyThresholdModel(span), { at, yaw: 0 });
      else
        place(`lobbyDoor:${span}`, () => lobbyDoorModel(span), {
          at,
          yaw: DOOR_YAW[lobbyDoor.side],
        });
    }
    if (lobbyDoor && lobbyMat.length > 0) {
      const x = lobbyMat.reduce((s, p) => s + p.x, 0) / lobbyMat.length;
      const y = lobbyMat.reduce((s, p) => s + p.y, 0) / lobbyMat.length;
      // The mat's back edge toward the door.
      place(`lobbyMat:${lobbyMat.length}`, () => lobbyMatModel(lobbyMat.length), {
        at: gridToWorld(x, y),
        yaw: DOOR_YAW[lobbyDoor.side],
      });
    }
    if (frontDoor) {
      const span = frontDoor.tiles.length;
      const at = gridToWorld(frontDoor.mid.x, frontDoor.mid.y);
      if (frontDoor.side === 'front')
        place(`frontDoor:${span}`, () => frontDoorModel(span), { at, yaw: 0 });
      else
        place(`glassDoor:${span}`, () => tallGlassDoorModel(span), {
          at,
          yaw: DOOR_YAW[frontDoor.side],
        });
    }
  },
  flat: new Set(['lobbyMat:1', 'lobbyMat:2', 'lobbyMat:3']),
};
