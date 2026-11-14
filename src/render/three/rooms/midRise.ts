import { gridToWorld } from '../../projection';
import { FRONT_WALL_HEIGHT, WALL_HEIGHT } from '../layout';
import {
  MID_RISE_FOUNDATION_LOOKS,
  MID_RISE_WALL_ART,
  EXEC_SEAT_TOP,
  MID_RISE_WALL_LOOKS,
  GLASS_SCREEN_MODELS,
  SOLID_MODELS,
  carpetFloorModel,
  carpetLook,
  carpetTone,
  execChairModel,
  execDeskModel,
  headRidgeModel,
  loneDeskThingsModel,
  midRiseDeskCounter,
  midRiseFoundationModel,
  midRiseWallModel,
  pendantModel,
  pendantWireModel,
  puttingMatModel,
  receptionModel,
  taskChairModel,
} from '../roomModels/midRise';
import {
  LANYARD_BOX,
  MID_RISE_FRONT_WALL_PROPS,
  MID_RISE_WALL_TOP_PROPS,
  SEGFAULT_ON_CHAIR,
} from '../setDressing/midRiseWallTops';
import { type MidRiseRoom, PENDANT_WIRE, type Side, midRiseRoom, pendantFit } from './midRiseRoom';
import type { RoomDressing } from './types';

/** The turn that puts a door model's back (−z) toward the outside on `side`. */
const DOOR_YAW: Readonly<Record<Side, number>> = {
  back: 0,
  front: Math.PI,
  left: Math.PI / 2,
  right: -Math.PI / 2,
};

/**
 * Where Derek's chair stands from his desk tile's middle: pulled out from
 * behind the desk toward the room and turned toward the camera, so Segfault
 * asleep on its seat shows.
 */
const EXEC_CHAIR = { dx: 0.34, dz: -0.24, yaw: 0.5 };

/** Story pieces flat on the floor or the partition tops: they cast no shadow. */
const FLAT = new Set([
  'puttingMat',
  ...[false, true].flatMap((low) =>
    Array.from({ length: 16 }, (_, arms) => `headRidge:${low}:${arms}`),
  ),
]);

/**
 * A rented floor of a mid-rise office building (wall theme `midRise`, floor
 * theme `corporateCarpet`; see `midRiseRoom` for the plan and
 * `docs/plan/middle-management-environment.md` for the brief):
 * plasterboard-and-glass partitions with a frosted YOTTA-violet stripe under
 * slim aluminium head tracks, new two-tone carpet tiles with the walkway
 * from reception to the lifts and their wear, the floor slab over the
 * ceiling void below as the base, light-oak bench desks, the new office's
 * things in clusters on the partition tops, linear LED pendants on a wire
 * along the back, and the story pieces: reception's pass-through at the
 * inbox, YOTTA's vinyl logo beside it, Derek's org chart, the clock, the
 * fire exit, QUIET ZONE, the booking panel, the chairs at the lone desks
 * and, when his office is on the map, Derek's executive desk and leather
 * chair with Segfault asleep on it, his MONOLITH certificate and lanyard,
 * the sticky on his glass and the meeting room's STATUS UPDATE TV.
 */
export const MID_RISE_ROOM: RoomDressing<MidRiseRoom> = {
  plan: midRiseRoom,
  wallTops: MID_RISE_WALL_TOP_PROPS,
  frontWallProps: MID_RISE_FRONT_WALL_PROPS,
  wall: { model: midRiseWallModel, looks: MID_RISE_WALL_LOOKS },
  floor: { theme: 'corporateCarpet', model: carpetFloorModel, look: carpetLook, tone: carpetTone },
  foundation: { model: midRiseFoundationModel, looks: MID_RISE_FOUNDATION_LOOKS },
  counter: midRiseDeskCounter,
  swapModels: { ...SOLID_MODELS, ...GLASS_SCREEN_MODELS },
  lamp: {
    model: pendantModel,
    wire: { hang: PENDANT_WIRE, model: pendantWireModel },
    fit: pendantFit,
  },
  flat: FLAT,
  placeStory(
    { reception, wallArt, chairs, derekDesk, lanyards, headTracks, puttingMat },
    _map,
    place,
  ) {
    for (const { x, y, low, arms } of headTracks)
      place(
        `headRidge:${low}:${arms}`,
        () => headRidgeModel(low ? FRONT_WALL_HEIGHT : WALL_HEIGHT, arms),
        { at: gridToWorld(x, y), yaw: 0 },
      );
    if (reception) {
      const span = reception.tiles.length;
      const low = reception.side === 'front';
      place(`reception:${span}:${low}`, () => receptionModel(span, low), {
        at: gridToWorld(reception.mid.x, reception.mid.y),
        yaw: DOOR_YAW[reception.side],
      });
    }
    for (const { x, y, yaw, art } of wallArt) {
      const model = MID_RISE_WALL_ART[art];
      if (model) place(`art:${art}`, model, { at: gridToWorld(x, y), yaw });
    }
    for (const { x, y, exec } of chairs) {
      if (exec) continue;
      const at = gridToWorld(x, y);
      place('taskChair', taskChairModel, { at, yaw: 0 });
      place('loneDeskThings', loneDeskThingsModel, { at, yaw: 0 });
    }
    if (derekDesk) {
      const { dx, dz, yaw } = EXEC_CHAIR;
      const cx = derekDesk.x + dx;
      const cy = derekDesk.y + dz;
      place('execDesk', execDeskModel, { at: gridToWorld(derekDesk.x, derekDesk.y), yaw: 0 });
      place('execChair', execChairModel, { at: gridToWorld(cx, cy), yaw });
      // Segfault on the seat's middle (0.02 forward of the lift, turned with the chair).
      place('segfault', SEGFAULT_ON_CHAIR, {
        at: gridToWorld(cx + Math.sin(yaw) * 0.02, cy + Math.cos(yaw) * 0.02, EXEC_SEAT_TOP),
        yaw: yaw + 0.25,
      });
    }
    if (puttingMat)
      place('puttingMat', puttingMatModel, {
        at: gridToWorld(puttingMat.x, puttingMat.y),
        yaw: 0,
      });
    if (lanyards)
      place('lanyards', LANYARD_BOX, {
        at: gridToWorld(lanyards.x, lanyards.y, WALL_HEIGHT),
        yaw: -0.15,
      });
  },
};
