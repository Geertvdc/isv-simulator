import { gridToWorld } from '../../projection';
import { FRONT_WALL_HEIGHT, WALL_HEIGHT } from '../layout';
import {
  MID_RISE_FOUNDATION_LOOKS,
  MID_RISE_WALL_LOOKS,
  headRidgeModel,
  midRiseFoundationModel,
  midRiseWallModel,
  pendantModel,
  pendantWireModel,
} from '../roomModels/midRise';
import {
  CORE_MODELS,
  THREE_FLOOR_LOOKS,
  UPPER_WALL_ART,
  bugRackModel,
  frontDeskModel,
  revolvingDoorModel,
  threeFloorModel,
  threeLook,
  threeTone,
  upperCounter,
} from '../roomModels/upperFloors';
import { UPPER_FRONTS, UPPER_TOPS, segfaultInLocker } from '../setDressing/upperFloorsWallTops';
import { PENDANT_WIRE } from './midRiseRoom';
import type { RoomDressing } from './types';
import {
  type Side,
  type UpperFloorsRoom,
  upperFloorsRoom,
  upperPendantFit,
} from './upperFloorsRoom';

/** The turn that puts a model's back (−z) toward the outside on `side`. */
const DOOR_YAW: Readonly<Record<Side, number>> = {
  back: 0,
  front: Math.PI,
  left: Math.PI / 2,
  right: -Math.PI / 2,
};

/** Wall-top piles stand just over the head track's ridge. */
const TOP_LIFT = 0.02;

/** Story pieces flat on the floor or the wall tops, or thin: they cast no shadow. */
const FLAT = new Set(
  [false, true].flatMap((low) =>
    Array.from({ length: 16 }, (_, arms) => `headRidge:${low}:${arms}`),
  ),
);

/**
 * Hot Desking's three floors of 3-1's mid-rise (wall theme `upperFloors`,
 * floor theme `threeFloors`; see `upperFloorsRoom` for the plan and
 * `docs/plan/hot-desking-environment.md` for the brief): 3-1's
 * plasterboard-and-glass partitions and the floor slab over the ceiling
 * void as the base; the hot-desk floor's worn carpet with its walkway,
 * coffee rings and entrance mat, the lab's pale vinyl, the meeting room's
 * carpet; the hot-desk floor's lift core in full-height plasterboard with
 * the taped-off stairwell door and the floor directory; the front desk's
 * pigeonholes and the SYSTEM DOWN booking kiosk at the inbox, the revolving
 * door at the ship, the BUGS rack behind the bug queue; banks of lockers
 * (Segfault asleep in an open one) and coat stands on the wall tops,
 * device shelves in the lab, the Friday cake in the meeting room; the plan
 * as a desk-booking spreadsheet; grey laminate returns shelves for
 * counters; and 3-1's pendants along each room's back. The lift doors are
 * `liftCars.ts`'s, flush in the wall line.
 */
export const UPPER_FLOORS_ROOM: RoomDressing<UpperFloorsRoom> = {
  plan: upperFloorsRoom,
  wall: { model: midRiseWallModel, looks: MID_RISE_WALL_LOOKS },
  floor: { theme: 'threeFloors', model: threeFloorModel, look: threeLook, tone: threeTone },
  foundation: { model: midRiseFoundationModel, looks: MID_RISE_FOUNDATION_LOOKS },
  counter: upperCounter,
  swapModels: CORE_MODELS,
  flat: FLAT,
  lamp: {
    model: pendantModel,
    wire: { hang: PENDANT_WIRE, model: pendantWireModel },
    fit: upperPendantFit,
  },
  placeStory(plan, _map, place) {
    for (const { x, y, low, arms } of plan.headTracks)
      place(
        `headRidge:${low}:${arms}`,
        () => headRidgeModel(low ? FRONT_WALL_HEIGHT : WALL_HEIGHT, arms),
        { at: gridToWorld(x, y), yaw: 0 },
      );
    for (const { x, y, yaw, art } of plan.wallArt) {
      const model = UPPER_WALL_ART[art];
      if (model) place(`art:${art}`, model, { at: gridToWorld(x, y), yaw });
    }
    for (const t of plan.tops)
      place(`top:${t.kind}`, UPPER_TOPS[t.kind], {
        at: gridToWorld(t.x, t.y, (t.low ? FRONT_WALL_HEIGHT : WALL_HEIGHT) + TOP_LIFT),
        yaw: t.yaw,
      });
    const cat = plan.segfault;
    if (cat)
      place('segfault', segfaultInLocker, {
        at: gridToWorld(cat.x, cat.y, (cat.low ? FRONT_WALL_HEIGHT : WALL_HEIGHT) + TOP_LIFT),
        yaw: cat.yaw,
      });
    for (const f of plan.fronts)
      place(`front:${f.kind}`, UPPER_FRONTS[f.kind], {
        at: gridToWorld(f.x, f.y, FRONT_WALL_HEIGHT),
        yaw: f.yaw,
      });
    if (plan.frontDesk) {
      const span = plan.frontDesk.tiles.length;
      place(`frontDesk:${span}`, () => frontDeskModel(span), {
        at: gridToWorld(plan.frontDesk.mid.x, plan.frontDesk.mid.y),
        yaw: DOOR_YAW[plan.frontDesk.side],
      });
    }
    if (plan.frontDoor) {
      const span = plan.frontDoor.tiles.length;
      place(`revolvingDoor:${span}`, () => revolvingDoorModel(span), {
        at: gridToWorld(plan.frontDoor.mid.x, plan.frontDoor.mid.y),
        yaw: DOOR_YAW[plan.frontDoor.side] + Math.PI,
      });
    }
    if (plan.bugRack) {
      const span = plan.bugRack.tiles.length;
      place(`bugRack:${span}`, () => bugRackModel(span), {
        at: gridToWorld(plan.bugRack.mid.x, plan.bugRack.mid.y),
        yaw: DOOR_YAW[plan.bugRack.side],
      });
    }
  },
};

/** How many floor looks the floor has, for the tests. */
export const UPPER_FLOOR_LOOKS = THREE_FLOOR_LOOKS;
