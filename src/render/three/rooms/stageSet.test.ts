import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { parseDraftMap } from '../../../sim/draftMap';
import { DEMO_DAY } from '../../../sim/levels';
import draftText from '../../../../maps/drafts/demo-day.txt?raw';
import { LEVEL_LOOKS } from '../../mapLook';
import type { Model } from '../kit';
import { FRONT_WALL_HEIGHT } from '../layout';
import { PALETTE } from '../look';
import {
  CASE_LID,
  STAGE_WALL_ART,
  liveConsoleFrontModel,
  stageTrussModel,
} from '../roomModels/stageSet';
import {
  STAGE_FRONT_PROP_MAX_HEIGHT,
  STAGE_FRONT_WALL_PROPS,
  STAGE_WALL_TOP_PROPS,
} from '../setDressing/stageSetWallTops';
import { ROOMS, floorDressing } from '.';
import { STAGE_SET_ROOM } from './stageSet';
import { DECK_WEAR, stageSetRoom } from './stageSetRoom';

const vertices = (m: Model) => m.body.getAttribute('position').count;
const luminance = (c: number) => {
  const { r, g, b } = new THREE.Color(c);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const bounds = (m: Model) => {
  const box = new THREE.Box3();
  for (const g of [m.body, m.glow, m.glass]) {
    if (!g) continue;
    g.computeBoundingBox();
    if (g.boundingBox) box.union(g.boundingBox);
  }
  return box;
};

describe('STAGE_SET_ROOM', () => {
  const maps = [DEMO_DAY.map, parseDraftMap(draftText)];

  it("dresses the demo-day level's walls and floor", () => {
    const look = LEVEL_LOOKS['demo-day'];
    expect(look?.walls).toBe('stageSet');
    expect(look && ROOMS[look.walls]).toBe(STAGE_SET_ROOM);
    expect(look && floorDressing(look.floor, STAGE_SET_ROOM)).toBe(STAGE_SET_ROOM.floor);
  });

  it('builds every wall piece and look, the decks in every wear, the fascia and the par can', () => {
    const { wall, floor, foundation, lamp } = STAGE_SET_ROOM;
    if (!wall || !floor?.look || !foundation || !lamp) throw new Error('missing');
    for (const piece of ['wall', 'wall-front', 'wall-inner'] as const)
      for (let l = 0; l < wall.looks; l++)
        expect(vertices(wall.model(piece, l))).toBeGreaterThan(0);
    for (const wear of Object.values(DECK_WEAR))
      for (const [x, y] of [
        [0, 0],
        [1, 0],
        [3, 5],
      ] as const)
        expect(vertices(floor.model(floor.look(x, y, wear)))).toBeGreaterThan(0);
    for (let l = 0; l < foundation.looks; l++)
      expect(vertices(foundation.model(l))).toBeGreaterThan(0);
    expect(vertices(lamp.model())).toBeGreaterThan(0);
  });

  it('keeps every deck within 4% of the base tone', () => {
    const floor = STAGE_SET_ROOM.floor;
    if (!floor?.tone) throw new Error('missing');
    const tone = (x: number, y: number, salt: number) => floor.tone?.(x, y, salt) ?? 1;
    for (let y = 0; y < 12; y++)
      for (let x = 0; x < 20; x++) {
        expect(tone(x, y, 12345)).toBeGreaterThan(0.955);
        expect(tone(x, y, 12345)).toBeLessThan(1.045);
      }
  });

  it('gives the flight cases lids darker than every station top', () => {
    for (const c of Object.values(PALETTE.station))
      expect(luminance(CASE_LID)).toBeLessThan(luminance(c));
    const counter = STAGE_SET_ROOM.counter;
    if (!counter) throw new Error('missing');
    for (const minusEnd of [true, false])
      for (const plusEnd of [true, false])
        for (const legs of [true, false])
          expect(
            vertices(counter({ minusEnd, plusEnd, legs, knob: plusEnd, yaw: 0 }).base),
          ).toBeGreaterThan(0);
  });

  it('keeps everything on the low front wall low: the props and the live console desks', () => {
    for (const p of STAGE_FRONT_WALL_PROPS)
      expect(bounds(p()).max.y).toBeLessThanOrEqual(STAGE_FRONT_PROP_MAX_HEIGHT);
    for (const deskX of [-1.5, 1.5]) {
      const box = bounds(liveConsoleFrontModel(deskX));
      // Sitting on the front wall, under 0.6 in all.
      expect(box.max.y).toBeLessThan(0.6);
      expect(box.min.y).toBeGreaterThan(-0.5);
    }
    expect(FRONT_WALL_HEIGHT).toBeLessThan(0.6);
  });

  it('builds every wall-top cluster inside its tile and every piece of wall art', () => {
    for (const p of STAGE_WALL_TOP_PROPS) {
      const box = bounds(p());
      expect(box.max.x - box.min.x).toBeLessThan(1);
      expect(box.max.z - box.min.z).toBeLessThan(1);
    }
    for (const art of Object.values(STAGE_WALL_ART)) {
      const box = bounds(art());
      expect(vertices(art())).toBeGreaterThan(0);
      // Hung in front of the wall's face.
      expect(box.min.z).toBeGreaterThanOrEqual(0.5);
    }
  });

  it('builds the truss over the whole back, standing on its towers', () => {
    for (const m of maps)
      for (const t of stageSetRoom(m).trusses) {
        const box = bounds(stageTrussModel(t));
        expect(box.min.x).toBeLessThanOrEqual(t.x0);
        expect(box.max.x).toBeGreaterThanOrEqual(t.x1);
        expect(box.max.y).toBeGreaterThan(t.y);
      }
  });
});
