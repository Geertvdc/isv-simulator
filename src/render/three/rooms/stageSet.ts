import { gridToWorld } from '../../projection';
import { WALL_HEIGHT } from '../layout';
import {
  STAGE_FASCIA_LOOKS,
  STAGE_WALL_ART,
  STAGE_WALL_LOOKS,
  deckFloorModel,
  deckLook,
  deckTone,
  flightCaseCounter,
  liveConsoleFrontModel,
  liveConsoleTallModel,
  mirrorBallModel,
  parCanModel,
  stageDoorModel,
  stageFasciaModel,
  stageTrussModel,
  stageWallModel,
} from '../roomModels/stageSet';
import { STAGE_FRONT_WALL_PROPS, STAGE_WALL_TOP_PROPS } from '../setDressing/stageSetWallTops';
import { type Side, type StageSetRoom, stageLampFit, stageSetRoom } from './stageSetRoom';
import type { RoomDressing } from './types';

/** The turn that puts a door model's back (−z) toward the outside on `side`. */
const DOOR_YAW: Readonly<Record<Side, number>> = {
  back: 0,
  front: Math.PI,
  left: Math.PI / 2,
  right: -Math.PI / 2,
};

/**
 * The demo set on the Demo Day stage (wall theme `stageSet`, floor theme
 * `stageDeck`; see `stageSetRoom` for the plan and
 * `docs/plan/demo-day-environment.md` for the brief): low stage-set walls
 * of charcoal flats with YOTTA's violet LED strip under brushed aluminium
 * caps, the stage's black fascia with its warm LED line, painted stage
 * decks with spike tape, glow tape and taped cables, black flight cases
 * for counters, the crew's kit in clusters on the wall tops, par cans on a
 * box truss strung between two towers along the back with the mirror ball,
 * and the story pieces: the stage door from the wings with its Q&A sign
 * at the inbox, the live demo consoles with their red LIVE tally at the
 * ship hatches, and on the back wall the LED panel, the confidence
 * monitor, the set list and the fire exit.
 */
export const STAGE_SET_ROOM: RoomDressing<StageSetRoom> = {
  plan: stageSetRoom,
  wallTops: STAGE_WALL_TOP_PROPS,
  frontWallProps: STAGE_FRONT_WALL_PROPS,
  wall: { model: stageWallModel, looks: STAGE_WALL_LOOKS },
  floor: { theme: 'stageDeck', model: deckFloorModel, look: deckLook, tone: deckTone },
  foundation: { model: stageFasciaModel, looks: STAGE_FASCIA_LOOKS },
  counter: flightCaseCounter,
  lamp: { model: parCanModel, fit: stageLampFit },
  placeStory({ stageDoor, consoles, wallArt, trusses, mirrorBall }, _map, place) {
    if (stageDoor) {
      const span = stageDoor.tiles.length;
      const low = stageDoor.side === 'front';
      const yaw = DOOR_YAW[stageDoor.side];
      place(`stageDoor:${span}:${low}:${yaw}`, () => stageDoorModel(span, low, yaw), {
        at: gridToWorld(stageDoor.mid.x, stageDoor.mid.y),
        yaw,
      });
    }
    for (const { door, desk } of consoles) {
      const at = gridToWorld(door.mid.x, door.mid.y);
      if (door.side === 'front') {
        const deskX = desk ? desk.x - door.mid.x : null;
        place(`liveConsoleFront:${deskX}`, () => liveConsoleFrontModel(deskX), { at, yaw: 0 });
      } else {
        const span = door.tiles.length;
        place(`liveConsole:${span}`, () => liveConsoleTallModel(span), {
          at,
          yaw: DOOR_YAW[door.side],
        });
      }
    }
    for (const { x, y, art } of wallArt) {
      const model = STAGE_WALL_ART[art];
      if (model) place(`art:${art}`, model, { at: gridToWorld(x, y), yaw: 0 });
    }
    trusses.forEach((truss, i) => {
      place(`truss:${i}`, () => stageTrussModel(truss), { at: { x: 0, y: 0, z: truss.z }, yaw: 0 });
    });
    if (mirrorBall)
      place('mirrorBall', mirrorBallModel, {
        at: gridToWorld(mirrorBall.x, mirrorBall.y, WALL_HEIGHT),
        yaw: 0.3,
      });
  },
  flat: new Set(['truss:0', 'truss:1', 'truss:2']),
};
