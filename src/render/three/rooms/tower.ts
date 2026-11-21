import { gridToWorld } from '../../projection';
import { WALL_HEIGHT } from '../layout';
import { pendantWireModel } from '../roomModels/midRise';
import {
  MEETING_PIECE_MODELS,
  TOWER_FOUNDATION_LOOKS,
  TOWER_SWAP_MODELS,
  doorPortalModel,
  releaseHatchModel,
  requestPortalModel,
  speakerPuckModel,
  towerArtModels,
  towerCounter,
  towerFloorModel,
  towerFoundationModel,
  towerLook,
  towerPendantModel,
  towerTone,
  towerWallModel,
  vinylModel,
} from '../roomModels/tower';
import { TOWER_TOPS } from '../setDressing/towerWallTops';
import type { RoomDressing } from './types';
import { OUT_YAW, PARTITION_LOOKS, type TowerRoom, towerPendantFit, towerRoom } from './towerRoom';

/** Wall-top kit stands just over the head track. */
const TOP_LIFT = 0.004;
/** The pendants' fine wires reach this far up from the fitting, to the wire strung wall to wall. */
const PENDANT_HANG = 0.31;

/** Story pieces that are flat or thin (vinyl, prints, art on a face): they cast no shadow. Vinyl keys join as they're placed. */
const FLAT = new Set<string>([
  'meeting:rollUp',
  'art:plan',
  'art:directory',
  'art:thermostat',
  'art:clock',
  'art:bookingHigh',
  'art:bookingLowLeft',
  'art:bookingLowRight',
  'puck',
]);

/**
 * YOTTA Tower's high floor, 4-1 Back to Back (wall theme `tower`, floor
 * theme `towerFloors`; see `towerRoom` for the plan and
 * `docs/plan/back-to-back-environment.md` for the brief): the startup's
 * own glass HQ in a heatwave. Glass partitions with a frosted violet dot
 * band on a pale plinth, glass screens on the low ones, the unitised
 * curtain wall with its blinds half down where the outside is (a sill on
 * the front); the offices' deep slate carpet, each meeting room's calmer
 * one, the corridor's terrazzo with its walk line, thresholds in the
 * doorways; smoked-oak credenzas for counters; the request portal over the
 * inbox, the release hatch and THE BIG RED BUTTON at the ship; the rooms'
 * names in vinyl (Unit 4, The Biscuit, The Garage, Mom), booking screens
 * and glass portals at the meeting doors, THE PLAN under its picture light,
 * the room directory, the thermostat at 29°C; The Garage's photo of Mom's
 * garage, its heritage lawnmower and printed roll-up door, Mom's portrait
 * and her first cheque and a jug of water; heatwave kit on the wall tops;
 * slim linear pendants along the backs of the rooms. The foundation is
 * the floor's pale stone edge over the curtain wall of the floor below.
 */
export const TOWER_ROOM: RoomDressing<TowerRoom> = {
  plan: towerRoom,
  wall: { model: towerWallModel, looks: PARTITION_LOOKS },
  floor: { theme: 'towerFloors', model: towerFloorModel, look: towerLook, tone: towerTone },
  foundation: { model: towerFoundationModel, looks: TOWER_FOUNDATION_LOOKS },
  counter: towerCounter,
  swapModels: TOWER_SWAP_MODELS,
  flat: FLAT,
  lamp: {
    model: towerPendantModel,
    wire: { hang: PENDANT_HANG, model: pendantWireModel },
    fit: towerPendantFit,
  },
  placeStory(plan, _map, place) {
    const names = [
      ...plan.rooms.filter((r) => r.zone === 'meeting'),
      ...plan.rooms.filter((r) => r.zone === 'office'),
    ].map((r) => r.name);
    const art = towerArtModels(names);
    for (const a of plan.art)
      place(`art:${a.art}`, art[a.art], { at: gridToWorld(a.x, a.y), yaw: 0 });
    for (const t of plan.tops)
      place(`top:${t.kind}`, TOWER_TOPS[t.kind], {
        at: gridToWorld(t.x, t.y, WALL_HEIGHT + TOP_LIFT),
        yaw: t.yaw,
      });
    for (const v of plan.vinyl) {
      const k = `vinyl:${v.text}:${v.width}`;
      FLAT.add(k);
      place(k, () => vinylModel(v.text, v.width), { at: gridToWorld(v.x, v.y), yaw: 0 });
    }
    for (const p of plan.meetingPieces)
      place(`meeting:${p.piece}`, MEETING_PIECE_MODELS[p.piece], {
        at: gridToWorld(p.x, p.y),
        yaw: 0,
      });
    for (const d of plan.portals)
      place(`doorPortal:${d.tall}`, () => doorPortalModel(d.tall), {
        at: gridToWorld(d.x, d.y),
        yaw: d.axis === 'x' ? 0 : Math.PI / 2,
      });
    for (const t of plan.tables)
      place('puck', speakerPuckModel, { at: gridToWorld(t.x, t.y), yaw: 0 });
    if (plan.portal) {
      const span = plan.portal.tiles.length;
      place(`requestPortal:${span}`, () => requestPortalModel(span), {
        at: gridToWorld(plan.portal.mid.x, plan.portal.mid.y),
        yaw: OUT_YAW[plan.portal.side],
      });
    }
    if (plan.release) {
      const span = plan.release.tiles.length;
      place(`release:${span}`, () => releaseHatchModel(span), {
        at: gridToWorld(plan.release.mid.x, plan.release.mid.y),
        yaw: OUT_YAW[plan.release.side] + Math.PI,
      });
    }
  },
};
