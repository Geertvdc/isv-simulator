import { gridToWorld } from '../../projection';
import { FRONT_WALL_HEIGHT, WALL_HEIGHT } from '../layout';
import {
  BASEMENT_WALL_ART,
  BASEMENT_WALL_LOOKS,
  CAGE_MODELS,
  FOUNDATION_LOOKS,
  basementFoundationModel,
  basementWallModel,
  battenModel,
  pagerBoardModel,
  pagerDoorModel,
  rackShelfCounter,
  raisedFloorModel,
  raisedLook,
  raisedTone,
  trayModel,
  uplinkFrontModel,
  uplinkTallModel,
} from '../roomModels/basement';
import {
  BASEMENT_FRONT_WALL_PROPS,
  BASEMENT_INNER_LOW_PROPS,
  BASEMENT_WALL_TOP_PROPS,
  ENERGY_CAN,
  SEGFAULT_SERVER,
  YOTTA_RACK,
} from '../setDressing/basementWallTops';
import { type BasementRoom, type Side, basementRoom, battenFit } from './basementRoom';
import type { RoomDressing } from './types';

/** The turn that puts a door model's back (−z) toward the outside on `side`. */
const DOOR_YAW: Readonly<Record<Side, number>> = {
  back: 0,
  front: Math.PI,
  left: Math.PI / 2,
  right: -Math.PI / 2,
};

/**
 * The basement under the loft building (wall theme `basement`, floor theme
 * `raisedFloor`; see `basementRoom` for the plan and
 * `docs/plan/on-call-environment.md` for the brief): painted concrete block
 * with a grey-green dado under cast-concrete coping, the server room's own
 * walls as a server cage, grey raised-floor tiles with vents, a lifted tile
 * and scuffs, the raised floor's edge over poured concrete for the base,
 * dark rack shelves and crash carts for counters, the night's kit in
 * clusters on the wall tops, fluorescent battens on a cable tray along the
 * back, and the story pieces: the propped fire door with the pager board at
 * the inbox and the pager board on the wall past it, the uplink's patch frame at the ship hatches, and on the walls
 * the incident runbook, the server room sign, the fire exit, the breaker
 * box, the thermostat at 31°C and the do-not-unplug note. Segfault sleeps
 * on the warmest server; YOTTA's sticker is on a rack.
 */
export const BASEMENT_ROOM: RoomDressing<BasementRoom> = {
  plan: basementRoom,
  wallTops: BASEMENT_WALL_TOP_PROPS,
  frontWallProps: BASEMENT_FRONT_WALL_PROPS,
  wall: { model: basementWallModel, looks: BASEMENT_WALL_LOOKS },
  floor: { theme: 'raisedFloor', model: raisedFloorModel, look: raisedLook, tone: raisedTone },
  foundation: { model: basementFoundationModel, looks: FOUNDATION_LOOKS },
  counter: rackShelfCounter,
  swapModels: CAGE_MODELS,
  lamp: { model: battenModel, fit: battenFit },
  placeStory(
    {
      pagerDoor,
      pagerBoard,
      pagerLeaf,
      uplinks,
      wallArt,
      innerProps,
      segfault,
      yotta,
      cans,
      trays,
    },
    _map,
    place,
  ) {
    if (pagerDoor) {
      const span = pagerDoor.tiles.length;
      const low = pagerDoor.side === 'front';
      const yaw = DOOR_YAW[pagerDoor.side];
      place(`pagerDoor:${span}:${low}:${pagerLeaf}`, () => pagerDoorModel(span, low, pagerLeaf), {
        at: gridToWorld(pagerDoor.mid.x, pagerDoor.mid.y),
        yaw,
      });
      if (pagerBoard)
        place(`pagerBoard:${low}:${yaw}`, () => pagerBoardModel(low, yaw), {
          at: gridToWorld(pagerBoard.x, pagerBoard.y),
          yaw,
        });
    }
    for (const { door, frame } of uplinks) {
      const at = gridToWorld(door.mid.x, door.mid.y);
      if (door.side === 'front') {
        const frameX = frame ? frame.x - door.mid.x : null;
        place(`uplinkFront:${frameX}`, () => uplinkFrontModel(frameX), { at, yaw: 0 });
      } else {
        const span = door.tiles.length;
        place(`uplink:${span}`, () => uplinkTallModel(span), { at, yaw: DOOR_YAW[door.side] });
      }
    }
    for (const { x, y, art } of wallArt) {
      const model = BASEMENT_WALL_ART[art];
      if (model) place(`art:${art}`, model, { at: gridToWorld(x, y), yaw: 0 });
    }
    trays.forEach((tray, i) => {
      place(`tray:${i}`, () => trayModel(tray), { at: { x: 0, y: 0, z: tray.z }, yaw: 0 });
    });
    for (const { x, y, tall, slot } of innerProps) {
      if (tall) {
        const index = (slot * 2 + 3) % BASEMENT_WALL_TOP_PROPS.length;
        const model = BASEMENT_WALL_TOP_PROPS[index];
        if (model)
          place(`innerTop:${index}`, model, { at: gridToWorld(x, y, WALL_HEIGHT), yaw: 0.08 });
      } else {
        const index = slot % BASEMENT_INNER_LOW_PROPS.length;
        const model = BASEMENT_INNER_LOW_PROPS[index];
        if (model)
          place(`innerLow:${index}`, model, {
            at: gridToWorld(x, y, FRONT_WALL_HEIGHT),
            yaw: slot % 2 ? 0.3 : -0.2,
          });
      }
    }
    if (segfault)
      place('segfault', SEGFAULT_SERVER, {
        at: gridToWorld(segfault.x, segfault.y, WALL_HEIGHT),
        yaw: -0.15,
      });
    if (yotta)
      place('yotta', YOTTA_RACK, { at: gridToWorld(yotta.x, yotta.y, WALL_HEIGHT), yaw: 0.1 });
    if (cans) place('cans', ENERGY_CAN, { at: gridToWorld(cans.x, cans.y, WALL_HEIGHT), yaw: 0.2 });
  },
  flat: new Set(['tray:0', 'tray:1', 'tray:2', 'tray:3', 'innerLow:0', 'innerLow:1']),
};
