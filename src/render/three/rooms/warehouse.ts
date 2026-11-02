import { levelSalt, tileHash } from '../../mapShape';
import { gridToWorld } from '../../projection';
import { FRONT_WALL_HEIGHT } from '../layout';
import { lampWireModel } from '../roomModels';
import {
  EDISON_HANG,
  PLINTH_LOOKS,
  WAREHOUSE_WALL_ART,
  WAREHOUSE_WALL_LOOKS,
  bayDoorFrontModel,
  bayFrameModel,
  bayDoorInsideModel,
  bayRailFrontModel,
  boardLook,
  boardTone,
  boardsFloorModel,
  edisonBulbModel,
  hallDoorModel,
  plinthModel,
  scaffoldCounter,
  tenantDoorModel,
  tenantPlaqueModel,
  wallPipeModel,
  warehouseWallModel,
} from '../roomModels/warehouse';
import {
  WAREHOUSE_FRONT_WALL_PROPS,
  WAREHOUSE_INNER_WALL_PROPS,
  WAREHOUSE_WALL_TOP_PROPS,
} from '../setDressing/warehouseWallTops';
import type { RoomDressing } from './types';
import { type WarehouseRoom, warehouseRoom } from './warehouseRoom';

/** The biscuit works' plan: its room, with the tenants' doors as swapped walls. */
type WarehousePlan = WarehouseRoom & { swaps: Record<string, string> };

/**
 * The biscuit-works rooms of the Down the Hall level (wall theme
 * `warehouse`, floor theme `boards`; see `warehouseRoom` for the plan): red
 * brick walls in looks over a painted band with stone coping, the dressed
 * stone plinth, wide old floorboards with their wear and the hallway
 * runner, scaffold-board counters on black pipe, clusters on the wall tops
 * and low things on the front walls, Edison bulbs on wires, and the story
 * pieces: the entrance-hall door, the loading-bay door, the other tenants'
 * doors and what hangs on the brick.
 */
export const WAREHOUSE_ROOM: RoomDressing<WarehousePlan> = {
  plan(map) {
    const room = warehouseRoom(map);
    const swaps: Record<string, string> = {};
    // Raised walls are a full storey of brick, in the wall's looks; the tenants' doors stand in some.
    for (const { x, y } of room.raised)
      swaps[`${x},${y}`] =
        `raised${((tileHash(x, y) ^ levelSalt(map)) >>> 3) % WAREHOUSE_WALL_LOOKS}`;
    for (const a of room.wallArt)
      if (a.art === 'yogaDoor' || a.art === 'breweryDoor') swaps[`${a.x},${a.y}`] = a.art;
    return { ...room, swaps };
  },
  wallTops: WAREHOUSE_WALL_TOP_PROPS,
  frontWallProps: WAREHOUSE_FRONT_WALL_PROPS,
  wall: { model: warehouseWallModel, looks: WAREHOUSE_WALL_LOOKS },
  floor: { theme: 'boards', model: boardsFloorModel, look: boardLook, tone: boardTone },
  foundation: { model: plinthModel, looks: PLINTH_LOOKS },
  counter: scaffoldCounter,
  swapModels: {
    ...Object.fromEntries(
      Array.from({ length: WAREHOUSE_WALL_LOOKS }, (_, look) => [
        `raised${look}`,
        () => warehouseWallModel('wall', look),
      ]),
    ),
    yogaDoor: () => tenantDoorModel('yoga', 0),
    breweryDoor: () => tenantDoorModel('brewery', 1),
  },
  lamp: { model: edisonBulbModel, wire: { hang: EDISON_HANG, model: lampWireModel } },
  placeStory({ hallDoor, loading, wallArt, pipes, innerProps }, map, place) {
    if (hallDoor) {
      // Turned so the hall lies outside; on the front edge only its low threshold, so it hides no one.
      const { width, out } = hallDoor;
      const low = out.dy === 1;
      place(`hallDoor:${width}:${low}`, () => hallDoorModel(width, low), {
        at: gridToWorld(hallDoor.x, hallDoor.y),
        yaw: Math.atan2(-out.dx, -out.dy),
      });
    }
    if (loading) {
      const { opening, out, park } = loading;
      const first = opening[0];
      if (first && out.dy === 1) {
        // On the front edge: the door parked on the outside of the low wall, its rail over the whole span.
        park.forEach((p, i) => {
          const lead = i === 0 ? Math.sign(first.x - p.x) : 0;
          place(`bayDoorFront:${lead}`, () => bayDoorFrontModel(lead), {
            at: gridToWorld(p.x, p.y),
            yaw: 0,
          });
        });
        const xs = [...opening, ...park].map((p) => p.x);
        const [x0, x1] = [Math.min(...xs), Math.max(...xs)];
        place(`bayRail:${x1 - x0 + 1}`, () => bayRailFrontModel(x1 - x0 + 1), {
          at: gridToWorld((x0 + x1) / 2, first.y),
          yaw: 0,
        });
      } else if (first) {
        // On a side or the back: parked against the inside of the wall beside it, facing the room.
        const yaw = Math.atan2(-out.dx, -out.dy);
        // The opening framed in iron posts and a lintel, a worn sill and setts outside it.
        const last = opening[opening.length - 1] ?? first;
        place(`bayFrame:${opening.length}`, () => bayFrameModel(opening.length), {
          at: gridToWorld((first.x + last.x) / 2, (first.y + last.y) / 2),
          yaw,
        });
        const [ux, uy] = [Math.cos(yaw), -Math.sin(yaw)];
        park.forEach((p, i) => {
          const lead =
            i === 0 ? Math.sign(Math.round((first.x - p.x) * ux + (first.y - p.y) * uy)) : 0;
          place(`bayDoorInside:${lead}`, () => bayDoorInsideModel(lead), {
            at: gridToWorld(p.x, p.y),
            yaw,
          });
        });
      }
    }
    for (const { x, y, art } of wallArt) {
      if (art === 'yogaDoor' || art === 'breweryDoor') continue;
      const name = art === 'neon' && !Number.isInteger(x) ? 'neonWide' : art;
      const model = WAREHOUSE_WALL_ART[name];
      if (model) place(`art:${name}`, model, { at: gridToWorld(x, y), yaw: 0 });
    }
    // On the low wall in front of the hallway: the tenants' plaques and low clusters.
    const level = levelSalt(map);
    for (const { x, y, kind } of innerProps) {
      const plaque = kind === 'yogaPlaque' || kind === 'brewPlaque';
      const model = plaque
        ? () => tenantPlaqueModel(kind === 'yogaPlaque' ? 'yoga' : 'brewery')
        : WAREHOUSE_INNER_WALL_PROPS[kind];
      if (!model) continue;
      const turn = plaque ? 0 : ((((tileHash(y, x) ^ level) >>> 2) % 5) - 2) * 0.12;
      place(`inner:${kind}`, model, { at: gridToWorld(x, y, FRONT_WALL_HEIGHT), yaw: turn });
    }
    for (const { x, y, end } of pipes)
      place(`pipe:${end}`, () => wallPipeModel(end), { at: gridToWorld(x, y), yaw: 0 });
  },
};
