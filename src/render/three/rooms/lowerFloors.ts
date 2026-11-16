import { gridToWorld } from '../../projection';
import { FRONT_WALL_HEIGHT, WALL_HEIGHT } from '../layout';
import {
  BALUSTRADE_MODELS,
  BLOCK_MODELS,
  LIFT_MODELS,
  LOWER_WALL_ART,
  MIXED_LOOKS,
  bannerModel,
  chuteFaceModel,
  chuteHatchCounter,
  floorNumberModel,
  loadingBayModel,
  mixedFloorModel,
  mixedLook,
  mixedTone,
  postHatchModel,
  railModel,
  slabEdgeModel,
} from '../roomModels/lowerFloors';
import {
  MID_RISE_FOUNDATION_LOOKS,
  MID_RISE_WALL_LOOKS,
  SOLID_MODELS,
  headRidgeModel,
  midRiseFoundationModel,
  midRiseWallModel,
  pendantModel,
  pendantWireModel,
} from '../roomModels/midRise';
import { LOWER_FRONTS, LOWER_TOPS } from '../setDressing/lowerFloorsWallTops';
import {
  type LowerFloorsRoom,
  type Side,
  lowerFloorsRoom,
  lowerPendantFit,
} from './lowerFloorsRoom';
import { PENDANT_WIRE } from './midRiseRoom';
import type { RoomDressing } from './types';

/** The turn that puts a door model's back (−z) toward the outside on `side`. */
const DOOR_YAW: Readonly<Record<Side, number>> = {
  back: 0,
  front: Math.PI,
  left: Math.PI / 2,
  right: -Math.PI / 2,
};

/** How far (in tiles) a wall-top pile leans in toward its partner. */
const TOP_LEAN = 0.26;
/** Wall-top piles stand just over the head track's ridge. */
const TOP_LIFT = 0.02;

/** Story pieces flat on the floor or the wall tops, or thin: they cast no shadow. */
const FLAT = new Set([
  'banner',

  ...[false, true].flatMap((low) =>
    Array.from({ length: 16 }, (_, arms) => `headRidge:${low}:${arms}`),
  ),
  ...[true, false].flatMap((low) => [`rail:${low}:true`, `rail:${low}:false`]),
  'floorNumber:0',
  'floorNumber:1',
  'slabEdge',
]);

/** The chute hatch: one model whatever its run (the map has no other counters). */
const HATCH = chuteHatchCounter();

/**
 * Hypergrowth's two floors of 3-1's mid-rise, mid-move-in (wall theme
 * `lowerFloors`, floor theme `mixedFloors`; see `lowerFloorsRoom` for the
 * plan and `docs/plan/hypergrowth-environment.md` for the brief): 3-1's
 * plasterboard-and-glass partitions and carpet tiles upstairs, the ground
 * floor's studded rubber with the walk-off mat, the trolley tracks to the
 * lift and the post room's lino, the stairwell's treads and painted block
 * with its handrails, the lift's steel door frames with their floor
 * indicators and directories, the mail chute's hatches, the post room's
 * pigeonhole hatch at the inbox, the loading bay's open roller shutter at
 * the ship, the onboarding checklist and the rest on the walls, the
 * flat-pack desk boxes and balloons on the ground floor's wall tops (the
 * first floor's boxed monitors and laptops), the WELCOME TO YOTTA banner
 * strung over the lift shaft, and 3-1's pendants along each floor's back.
 */
export const LOWER_FLOORS_ROOM: RoomDressing<LowerFloorsRoom> = {
  plan: lowerFloorsRoom,
  wall: { model: midRiseWallModel, looks: MID_RISE_WALL_LOOKS },
  floor: { theme: 'mixedFloors', model: mixedFloorModel, look: mixedLook, tone: mixedTone },
  foundation: { model: midRiseFoundationModel, looks: MID_RISE_FOUNDATION_LOOKS },
  counter: () => HATCH,
  swapModels: { ...SOLID_MODELS, ...BLOCK_MODELS, ...LIFT_MODELS, ...BALUSTRADE_MODELS },
  flat: FLAT,
  lamp: {
    model: pendantModel,
    wire: { hang: PENDANT_WIRE, model: pendantWireModel },
    fit: lowerPendantFit,
  },
  placeStory(plan, _map, place) {
    for (const { x, y, low, arms } of plan.headTracks)
      place(
        `headRidge:${low}:${arms}`,
        () => headRidgeModel(low ? FRONT_WALL_HEIGHT : WALL_HEIGHT, arms),
        { at: gridToWorld(x, y), yaw: 0 },
      );
    for (const { x, y, low, yaw, post } of plan.rails)
      place(`rail:${low}:${post}`, () => railModel(low, post), { at: gridToWorld(x, y), yaw });
    for (const { x, y, n } of plan.floorNumbers)
      place(`floorNumber:${n}`, () => floorNumberModel(n), { at: gridToWorld(x, y), yaw: 0 });
    for (const { x, y, yaw } of plan.slabEdges)
      place('slabEdge', slabEdgeModel, { at: gridToWorld(x, y), yaw });
    if (plan.postHatch) {
      const span = plan.postHatch.tiles.length;
      place(`postHatch:${span}`, () => postHatchModel(span), {
        at: gridToWorld(plan.postHatch.mid.x, plan.postHatch.mid.y),
        yaw: DOOR_YAW[plan.postHatch.side],
      });
    }
    if (plan.loadingBay) {
      const span = plan.loadingBay.tiles.length;
      place(`loadingBay:${span}`, () => loadingBayModel(span), {
        at: gridToWorld(plan.loadingBay.mid.x, plan.loadingBay.mid.y),
        yaw: DOOR_YAW[plan.loadingBay.side],
      });
    }
    for (const h of plan.hatches)
      place(`chuteFace:${h.top}`, () => chuteFaceModel(h.top), {
        at: gridToWorld(h.x, h.y),
        yaw: h.yaw,
      });
    for (const { x, y, yaw, art } of plan.wallArt) {
      const model = LOWER_WALL_ART[art];
      if (model) place(`art:${art}`, model, { at: gridToWorld(x, y), yaw });
    }
    for (const t of plan.tops)
      place(`top:${t.kind}`, LOWER_TOPS[t.kind], {
        at: gridToWorld(
          t.x + t.toward.dx * TOP_LEAN,
          t.y + t.toward.dy * TOP_LEAN,
          (t.low ? FRONT_WALL_HEIGHT : WALL_HEIGHT) + TOP_LIFT,
        ),
        yaw: t.yaw,
      });
    for (const f of plan.fronts)
      place(`front:${f.kind}`, LOWER_FRONTS[f.kind], {
        at: gridToWorld(f.x, f.y, FRONT_WALL_HEIGHT),
        yaw: f.yaw,
      });
    const banner = plan.banner;
    if (banner)
      place('banner', () => bannerModel(banner), {
        at: gridToWorld((banner.x0 + banner.x1) / 2, banner.z),
        yaw: 0,
      });
  },
};

/** How many floor looks the floor has, for the tests. */
export const LOWER_FLOOR_LOOKS = MIXED_LOOKS;
