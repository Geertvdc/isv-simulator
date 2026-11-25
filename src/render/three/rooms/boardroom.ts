import { gridToWorld } from '../../projection';
import { FoldingWalls } from '../boardroom/foldingWalls';
import { WALL_HEIGHT } from '../layout';
import {
  BOARDROOM_ART_MODELS,
  BOARDROOM_SWAP_MODELS,
  GLASS_NOTES_LOOKS,
  boardroomCounter,
  boardroomPendantModel,
  boardroomFloorModel,
  boardroomLook,
  boardroomTone,
  boardroomWallModel,
  deployDeskModel,
  glassNotesLook,
  ideasWallModel,
  parkedBoxModel,
  pendantWireModel,
  stubSceneModel,
} from '../roomModels/boardroom';
import { TOWER_FOUNDATION_LOOKS, towerFoundationModel } from '../roomModels/tower';
import { BOARDROOM_TOPS } from '../setDressing/boardroomWallTops';
import { type BoardroomRoom, type Side, boardroomRoom } from './boardroomRoom';
import { OUT_YAW as OUT_YAW_OF } from './towerRoom';
import type { RoomDressing } from './types';

/** Where the PARKED box stands from the bin's middle, by the side the outside is on. */
const PARKED_OFFSET: Readonly<Record<Side, [number, number]>> = {
  left: [-0.34, -0.18],
  right: [0.34, -0.18],
  back: [0.3, -0.34],
  front: [0.3, 0.34],
};

/** Wall-top kit stands just over the head track. */
const TOP_LIFT = 0.004;

/** Story pieces that are flat or thin (art and vinyl on a face, notes on the glass): they cast no shadow. */
const FLAT = new Set<string>([
  'art:synergyMatrix',
  'art:portraitChair',
  'art:portraitMom',
  'art:boardPlaque',
  'art:agenda',
  'art:clock',
  'art:quietPlease',
  'art:visitors',
  'art:execVinyl',
  'art:bugBoard',
  'art:opsScreen',
  ...Array.from({ length: GLASS_NOTES_LOOKS }, (_, l) => `art:glassNotes:${l}`),
]);

/**
 * YOTTA Tower's boardroom floor, 4-2 Synergy (wall theme `boardroom`, floor
 * theme `boardroomFloors`; see `boardroomRoom` for the plan and
 * `docs/plan/synergy-environment.md` for the brief): the expensive floor on
 * the afternoon MONOLITH comes round for a synergy workshop. The tower's
 * glass partitions onto the executive reception along the back (walnut
 * panels where art hangs: the agenda, the board's portraits, Mom among
 * them, the board's plaque, the synergy matrix under its picture light, a
 * clock at twenty to four, QUIET PLEASE; EXECUTIVE FLOOR and MONOLITH
 * VISITORS in vinyl and sticky notes on the glass between), the curtain
 * wall with its blinds where the city is, the low walnut stubs with their
 * dark stone caps (the IDEAS board, HOW MIGHT WE…, Prod as the parking lot
 * beside the left pocket, the name cards beside the right one); the good
 * carpet with its violet border in the boardroom, the sides' warm slate
 * carpet and its wear, the corridor's terrazzo; the workshop's sticky-note
 * wall over the inbox, the PARKED box at the bin, the deploy desk at the
 * ship, KNOWN BUGS by the bug queue and the ops status screen; the
 * workshop kit in clusters on the wall tops; slim pendants on a wire along
 * the back of each side (never over the boardroom or near the front).
 */
export const BOARDROOM_ROOM: RoomDressing<BoardroomRoom> = {
  plan: boardroomRoom,
  wall: { model: boardroomWallModel, looks: 3 },
  floor: {
    theme: 'boardroomFloors',
    model: boardroomFloorModel,
    look: boardroomLook,
    tone: boardroomTone,
  },
  foundation: { model: towerFoundationModel, looks: TOWER_FOUNDATION_LOOKS },
  counter: boardroomCounter,
  swapModels: BOARDROOM_SWAP_MODELS,
  flat: FLAT,
  placeStory(plan, _map, place) {
    let glass = 0;
    plan.art.forEach((a, i) => {
      // A run of EXECUTIVE FLOOR vinyl is one piece, over its first pane.
      if (a.art === 'execVinyl' && plan.art[i - 1]?.art === 'execVinyl') return;
      if (a.art === 'glassNotes') {
        const l = glass++ % GLASS_NOTES_LOOKS;
        place(`art:glassNotes:${l}`, () => glassNotesLook(l), {
          at: gridToWorld(a.x, a.y),
          yaw: 0,
        });
        return;
      }
      place(`art:${a.art}`, BOARDROOM_ART_MODELS[a.art], { at: gridToWorld(a.x, a.y), yaw: 0 });
    });
    for (const s of plan.stubs)
      place(`stub:${s.scene}:${s.span}`, () => stubSceneModel(s.scene, s.span), {
        at: gridToWorld(s.x, s.y),
        yaw: 0,
      });
    for (const t of plan.tops)
      place(`top:${t.kind}`, BOARDROOM_TOPS[t.kind], {
        at: gridToWorld(t.x + t.dx, t.y + t.dy, t.h + TOP_LIFT),
        yaw: t.yaw,
      });
    for (const row of plan.pendants) {
      place(`pendantWire:${row.z}:${row.x0}`, () => pendantWireModel(row), {
        at: { x: 0, y: 0, z: row.z },
        yaw: 0,
      });
      for (const x of row.at)
        place('pendant', boardroomPendantModel, { at: { x, y: row.y, z: row.z }, yaw: 0 });
    }
    if (plan.ideasWall) {
      const span = plan.ideasWall.tiles.length;
      place(`ideasWall:${span}`, () => ideasWallModel(span), {
        at: gridToWorld(plan.ideasWall.mid.x, plan.ideasWall.mid.y),
        yaw: OUT_YAW_OF[plan.ideasWall.side],
      });
    }
    if (plan.parked) {
      // Against the outside edge of the bin's tile, a little behind it, square to the camera.
      const { x, y, side } = plan.parked;
      const [dx, dy] = PARKED_OFFSET[side];
      place('parked', parkedBoxModel, { at: gridToWorld(x + dx, y + dy), yaw: 0 });
    }
    if (plan.deployDesk) {
      const span = plan.deployDesk.tiles.length;
      place(`deployDesk:${span}`, () => deployDeskModel(span), {
        at: gridToWorld(plan.deployDesk.mid.x, plan.deployDesk.mid.y),
        yaw: OUT_YAW_OF[plan.deployDesk.side] + Math.PI,
      });
    }
  },
  // The folding walls and the rolling boardroom table: their own track (`boardroom/foldingWalls.ts`).
  movingTiles: (root, map) => new FoldingWalls(root, map),
};

/** The height wall-top props stand at, for the tests. */
export const BOARDROOM_TOP_Y = WALL_HEIGHT + TOP_LIFT;
