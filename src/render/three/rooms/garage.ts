import { gridToWorld } from '../../projection';
import {
  BULB_HANG,
  FOUNDATION_LOOKS,
  GARAGE_WALL_LOOKS,
  bannerModel,
  bulbModel,
  doorHeaderModel,
  doorJambModel,
  doormatModel,
  floorModel,
  foundationModel,
  garageDoorModel,
  houseDoorModel,
  lampWireModel,
  oilStainModel,
  slabLook,
  slabTone,
  wallModel,
} from '../roomModels';
import { GARAGE_FRONT_WALL_PROPS, GARAGE_WALL_TOP_PROPS } from '../setDressing/wallTops';
import { garageCounter } from '../stationModels';
import { type GarageRoom, garageRoom } from './garageRoom';
import type { RoomDressing } from './types';

/** How far past the opening's end tiles the open door's jambs stand. */
const DOOR_JAMB_OUT = 0.58;

/** The garage's plan: its room, with the closed door's tiles as swapped walls. */
type GaragePlan = GarageRoom & { swaps: Record<string, string> };

/**
 * The converted garage (wall theme `garage`, see `garageRoom` for the
 * plan): cinder-block walls in looks, the concrete foundation, a sealed slab
 * floor with its wear, counters as doors on sawhorses, a closed roll-up door
 * beside the open one, junk clustered on the wall tops and lying on the
 * front wall, shaded bulbs on wires, and the story pieces.
 */
export const GARAGE_ROOM: RoomDressing<GaragePlan> = {
  plan(map) {
    const room = garageRoom(map);
    const doors = new Set(room.door.map((t) => `${t.x},${t.y}`));
    // The first door tile (from the left) carries the door's left edge.
    const swaps = Object.fromEntries(
      room.door.map((t) => [
        `${t.x},${t.y}`,
        doors.has(`${t.x - 1},${t.y}`) ? 'garageDoor' : 'garageDoorFirst',
      ]),
    );
    return { ...room, swaps };
  },
  wallTops: GARAGE_WALL_TOP_PROPS,
  frontWallProps: GARAGE_FRONT_WALL_PROPS,
  wall: { model: (piece, look) => wallModel('garage', piece, look), looks: GARAGE_WALL_LOOKS },
  floor: {
    theme: 'slab',
    // A slab is poured in pieces: no checker, a shade per piece, its joints and wear come in looks.
    model: (look) => floorModel('slab', look),
    look: slabLook,
    tone: slabTone,
  },
  foundation: { model: foundationModel, looks: FOUNDATION_LOOKS },
  // A door on sawhorses: doors in a run join up, and only some tiles stand on a sawhorse.
  counter: garageCounter,
  swapModels: {
    // A closed roll-up door in place of the front wall, its handle in the middle.
    garageDoorFirst: () => garageDoorModel(true),
    garageDoor: () => garageDoorModel(false),
  },
  // A shaded bulb where each of the garage's warm lamps shines from, on a wire strung wall to wall.
  lamp: { model: bulbModel, wire: { hang: BULB_HANG, model: lampWireModel } },
  /**
   * The open roll-up door's jambs at the ship hatch, the house door round
   * the inbox and its doormat, the banner on the back wall, the oil stain.
   */
  placeStory({ opening, houseDoor, doormat, banner, oilStain }, _map, place) {
    if (opening) {
      const [left, right] = [opening.x0 - DOOR_JAMB_OUT, opening.x1 + DOOR_JAMB_OUT];
      for (const x of [left, right])
        place('doorJamb', doorJambModel, { at: gridToWorld(x, opening.y), yaw: 0 });
      place('doorHeader', () => doorHeaderModel(right - left), {
        at: gridToWorld((left + right) / 2, opening.y),
        yaw: 0,
      });
    }
    if (houseDoor)
      place('houseDoor', houseDoorModel, { at: gridToWorld(houseDoor.x, houseDoor.y), yaw: 0 });
    if (doormat) place('doormat', doormatModel, { at: gridToWorld(doormat.x, doormat.y), yaw: 0 });
    if (banner)
      place('banner', () => bannerModel(banner.width), {
        at: gridToWorld(banner.x, banner.y),
        yaw: 0,
      });
    if (oilStain)
      place('oilStain', oilStainModel, { at: gridToWorld(oilStain.x, oilStain.y), yaw: 0 });
  },
  flat: new Set(['oilStain', 'doormat']),
};
