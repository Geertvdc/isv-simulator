import type { LevelMap } from '../../../sim/level';
import { gridToWorld } from '../../projection';
import { atmosphereFor, lampSpots } from '../atmosphere';
import { WALL_HEIGHT } from '../layout';
import { ReorgGates } from '../reorg/gates';
import { Partitions } from '../reorg/partitions';
import {
  REORG_ART_MODELS,
  REORG_SWAP_MODELS,
  goodsLiftModel,
  handoverDeskModel,
  lobbyBracketModel,
  reorgCounter,
  reorgFloorModel,
  reorgLook,
  reorgTone,
  reorgUplighterModel,
  reorgWallModel,
  shredderModel,
} from '../roomModels/reorg';
import { TOWER_FOUNDATION_LOOKS, towerFoundationModel } from '../roomModels/tower';
import { REORG_TOPS, matrixBoxModel } from '../setDressing/reorgWallTops';
import { type ReorgRoom, type Side, reorgLightFit, reorgRoom } from './reorgRoom';
import { OUT_YAW } from './towerRoom';
import type { RoomDressing } from './types';

/** Wall-top kit stands just over the head track. */
const TOP_LIFT = 0.004;

/** Where the shredding console stands from the bin's middle, by the side the outside is on. */
const SHREDDER_OFFSET: Readonly<Record<Side, [number, number]>> = {
  left: [-0.3, -0.2],
  right: [0.3, -0.2],
  back: [0.3, -0.32],
  front: [0.3, 0.32],
};

/** Story pieces that are flat or thin (art and vinyl on a face): they cast no shadow. */
const FLAT = new Set<string>(Object.keys(REORG_ART_MODELS).map((a) => `art:${a}`));

const plans = new WeakMap<LevelMap, ReorgRoom>();
function planOf(map: LevelMap): ReorgRoom {
  let p = plans.get(map);
  if (!p) {
    p = reorgRoom(map);
    plans.set(map, p);
  }
  return p;
}

/** The uplighters for `map`: the atmosphere's lamp spots, fitted (see `reorgLightFit`). */
export function reorgFittings(map: LevelMap, plan: ReorgRoom = planOf(map)) {
  return lampSpots(atmosphereFor('the-reorg'), map).flatMap((at) => {
    const f = reorgLightFit(at, plan);
    return f ? [f] : [];
  });
}

/**
 * YOTTA Tower's boardroom floor mid-reorg, 4-3 The Reorg (wall theme
 * `reorg`, floor theme `reorgFloors`; see `reorgRoom` for the plan and
 * `docs/plan/the-reorg-environment.md` for the brief): the morning after
 * the synergy workshop, the consultants moving the floor round twice before
 * lunch. Pale panels along the back with the consultants' art (YOU ARE
 * HERE (PROBABLY), REORG 3.0, the org chart in red pen, THE PLAN V3 on a
 * projector screen, p. 1 of 80, WHO OWNS WHAT?, the move day's timetable,
 * hot-desk rules, a clock at twenty to eleven, Mom's portrait in bubble
 * wrap, CHANGE IS THE ONLY CONSTANT, KNOWN BUGS, SIGN-OFF), glass between
 * with YOUR NEW DESK in vinyl; the curtain wall with its blinds left at odd
 * heights; the deep sills onto the setback roofs; the badge line's low
 * stone wall; the lobby's piers with MIND THE TURNSTILE and the floor
 * directory (YOTTA papered over with `yotta.`), and their cool brackets.
 * The stripped carpet with its tape, stencils, X marks, access tiles,
 * ghost lines and castor tracks; 4-2's good carpet in the boardroom; the
 * lobby's stone. The handover desk behind the inbox, the shredding console
 * at the bin, the goods lift at the ship, the move's kit on the wall tops
 * and sills, Segfault's MATRIX box; bronze uplighters on the back faces'
 * tops (a pendant over the floor would hang on the players' heads).
 */
export const REORG_ROOM: RoomDressing<ReorgRoom> = {
  plan: planOf,
  wall: { model: reorgWallModel, looks: 3 },
  floor: { theme: 'reorgFloors', model: reorgFloorModel, look: reorgLook, tone: reorgTone },
  foundation: { model: towerFoundationModel, looks: TOWER_FOUNDATION_LOOKS },
  counter: reorgCounter,
  swapModels: REORG_SWAP_MODELS,
  flat: FLAT,
  lamp: {
    model: reorgUplighterModel,
    fit: (at, map) => reorgLightFit(at, planOf(map)),
  },
  placeStory(plan, _map, place) {
    for (const a of plan.art)
      place(`art:${a.art}`, REORG_ART_MODELS[a.art], { at: gridToWorld(a.x, a.y), yaw: 0 });
    for (const t of plan.tops)
      place(`top:${t.kind}`, REORG_TOPS[t.kind], {
        at: gridToWorld(t.x + t.dx, t.y + t.dy, t.h + TOP_LIFT),
        yaw: t.yaw,
      });
    if (plan.segfault)
      place('matrixBox', matrixBoxModel, {
        at: gridToWorld(plan.segfault.x, plan.segfault.y, WALL_HEIGHT + TOP_LIFT),
        yaw: plan.segfault.yaw,
      });
    if (plan.handover) {
      const span = plan.handover.tiles.length;
      place(`handover:${span}`, () => handoverDeskModel(span), {
        at: gridToWorld(plan.handover.mid.x, plan.handover.mid.y),
        yaw: OUT_YAW[plan.handover.side],
      });
    }
    if (plan.shredder) {
      const { x, y, side } = plan.shredder;
      const [dx, dy] = SHREDDER_OFFSET[side];
      place('shredder', shredderModel, { at: gridToWorld(x + dx, y + dy), yaw: 0 });
    }
    if (plan.goodsLift) {
      const span = plan.goodsLift.tiles.length;
      place(`goodsLift:${span}`, () => goodsLiftModel(span), {
        at: gridToWorld(plan.goodsLift.mid.x, plan.goodsLift.mid.y),
        yaw: OUT_YAW[plan.goodsLift.side] + Math.PI,
      });
    }
    // The lobby's cool brackets on its piers' tops, reaching in.
    for (const a of plan.art) {
      if (a.art !== 'mindTurnstile' && a.art !== 'lobbyDirectory') continue;
      const left = plan.outer[`${a.x},${a.y}`] === 'left';
      place('lobbyBracket', lobbyBracketModel, {
        at: gridToWorld(a.x + (left ? 0.3 : -0.3), a.y + 0.3, WALL_HEIGHT),
        yaw: left ? 0 : Math.PI,
      });
    }
  },
  // The consultants' partitions and the rolling desks: their own track (`reorg/partitions.ts`).
  movingTiles: (root, map) => new Partitions(root, map),
  // The badge turnstiles, the staff door and the meeting doors (`reorg/gates.ts`).
  gates: (root, map) => new ReorgGates(root, map),
};

/** The height wall-top props stand at, for the tests. */
export const REORG_TOP_Y = WALL_HEIGHT + TOP_LIFT;
