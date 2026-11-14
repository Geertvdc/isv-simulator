import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { parseDraftMap } from '../../../sim/draftMap';
import { ON_CALL } from '../../../sim/levels';
import draftText from '../../../../maps/drafts/on-call.txt?raw';
import { LEVEL_LOOKS } from '../../mapLook';
import { type Model, tint } from '../kit';
import { FRONT_WALL_HEIGHT } from '../layout';
import { FLOOR_COLORS, PALETTE, WALL_COLORS } from '../look';
import {
  BASEMENT_WALL_ART,
  CAGE_MODELS,
  SHELF_TOP,
  battenModel,
  trayModel,
  uplinkFrontModel,
} from '../roomModels/basement';
import {
  BASEMENT_FRONT_PROP_MAX_HEIGHT,
  BASEMENT_FRONT_WALL_PROPS,
  BASEMENT_INNER_LOW_PROP,
  BASEMENT_WALL_TOP_PROPS,
  CAN_PYRAMID,
  SEGFAULT_SERVER,
  YOTTA_RACK,
} from '../setDressing/basementWallTops';
import { ROOMS, floorDressing } from '.';
import { BASEMENT_ROOM } from './basement';
import { BASEMENT_ART_HALF, RAISED_WEAR_KINDS, basementRoom } from './basementRoom';

const vertices = (m: Model) => m.body.getAttribute('position').count;
const luminance = (c: number) => {
  const { r, g, b } = new THREE.Color(c);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const saturation = (c: number) => {
  const hsl = { h: 0, s: 0, l: 0 };
  new THREE.Color(c).getHSL(hsl);
  return hsl.s;
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
/** Every vertex color of a model's matte body. */
const bodyColors = (m: Model) => {
  const c = m.body.getAttribute('color');
  const out = new Set<number>();
  for (let i = 0; i < c.count; i++)
    out.add(new THREE.Color(c.getX(i), c.getY(i), c.getZ(i)).getHex());
  return out;
};

describe('BASEMENT_ROOM', () => {
  const maps = [ON_CALL.map, parseDraftMap(draftText)];

  it("dresses the on-call level's walls and floor", () => {
    const look = LEVEL_LOOKS['on-call'];
    expect(look?.walls).toBe('basement');
    expect(look && ROOMS[look.walls]).toBe(BASEMENT_ROOM);
    expect(look && floorDressing(look.floor, BASEMENT_ROOM)).toBe(BASEMENT_ROOM.floor);
  });

  it('builds every wall piece and look, the cage, the floor in every wear, the foundation and the batten', () => {
    const { wall, floor, foundation, lamp, swapModels } = BASEMENT_ROOM;
    if (!wall || !floor?.look || !foundation || !lamp || !swapModels) throw new Error('missing');
    for (const piece of ['wall', 'wall-front', 'wall-inner'] as const)
      for (let l = 0; l < wall.looks; l++)
        expect(vertices(wall.model(piece, l))).toBeGreaterThan(0);
    for (let wear = 0; wear < RAISED_WEAR_KINDS; wear++)
      for (const [x, y] of [
        [0, 0],
        [1, 0],
        [3, 5],
      ] as const)
        expect(vertices(floor.model(floor.look(x, y, wear)))).toBeGreaterThan(0);
    for (let l = 0; l < foundation.looks; l++)
      expect(vertices(foundation.model(l))).toBeGreaterThan(0);
    expect(vertices(lamp.model())).toBeGreaterThan(0);
    // Every swap the plans ask for has a model.
    for (const m of maps)
      for (const name of Object.values(basementRoom(m).swaps)) {
        const model = swapModels[name];
        expect(model).toBeDefined();
        if (model) expect(vertices(model())).toBeGreaterThan(0);
      }
    expect(Object.keys(CAGE_MODELS).length).toBeGreaterThan(0);
  });

  it('keeps every floor tile within 4% of the base tone', () => {
    const floor = BASEMENT_ROOM.floor;
    if (!floor?.tone) throw new Error('missing');
    for (let y = 0; y < 12; y++)
      for (let x = 0; x < 20; x++) {
        const t = floor.tone(x, y, 12345);
        expect(t).toBeGreaterThanOrEqual(0.96);
        expect(t).toBeLessThanOrEqual(1.04);
      }
  });

  it('keeps the floor mid-light grey and nothing blue or glossy on it', () => {
    const [base] = FLOOR_COLORS.raisedFloor;
    expect(luminance(base)).toBeGreaterThan(0.2);
    expect(luminance(base)).toBeLessThan(0.35);
    const floor = BASEMENT_ROOM.floor;
    if (!floor?.look) throw new Error('missing');
    for (let wear = 0; wear < RAISED_WEAR_KINDS; wear++) {
      const m = floor.model(floor.look(2, 3, wear));
      expect(m.glass).toBeNull();
      expect(m.glow).toBeNull();
      for (const c of bodyColors(m)) {
        const { r, b } = new THREE.Color(c);
        // No blue that could pass for a wet trail.
        expect(b - r).toBeLessThan(0.05);
      }
    }
  });

  it('caps the walls with cool concrete, darker than every station top, less saturated than all', () => {
    const cap = WALL_COLORS.basement.top;
    for (const c of Object.values(PALETTE.station)) {
      expect(luminance(cap)).toBeLessThan(luminance(tint(c, 0.4)));
      expect(saturation(cap)).toBeLessThanOrEqual(saturation(c) + 0.01);
    }
    // Cool: a touch more blue than red.
    const { r, b } = new THREE.Color(cap);
    expect(b).toBeGreaterThanOrEqual(r);
  });

  it('gives the rack shelves tops darker than every station top', () => {
    for (const c of Object.values(PALETTE.station))
      expect(luminance(SHELF_TOP)).toBeLessThan(luminance(tint(c, 0.4)));
    const counter = BASEMENT_ROOM.counter;
    if (!counter) throw new Error('missing');
    for (const minusEnd of [true, false])
      for (const plusEnd of [true, false])
        for (const legs of [true, false])
          expect(
            vertices(counter({ minusEnd, plusEnd, legs, knob: plusEnd, yaw: 0 }).base),
          ).toBeGreaterThan(0);
  });

  it('keeps everything on the low front wall low: the props and the uplink', () => {
    for (const p of BASEMENT_FRONT_WALL_PROPS)
      expect(bounds(p()).max.y).toBeLessThanOrEqual(BASEMENT_FRONT_PROP_MAX_HEIGHT);
    expect(bounds(BASEMENT_INNER_LOW_PROP()).max.y).toBeLessThan(0.12);
    for (const frameX of [-1.5, 1.5]) {
      const box = bounds(uplinkFrontModel(frameX));
      // Standing on the low front wall, under 0.6 in all.
      expect(box.max.y).toBeLessThan(0.6);
      expect(box.min.y).toBeGreaterThan(-0.3);
    }
    expect(FRONT_WALL_HEIGHT).toBeLessThan(0.6);
  });

  it('builds every wall-top cluster and one-off inside its tile, and every piece of wall art on the face', () => {
    for (const p of [...BASEMENT_WALL_TOP_PROPS, SEGFAULT_SERVER, YOTTA_RACK, CAN_PYRAMID]) {
      const box = bounds(p());
      expect(box.max.x - box.min.x).toBeLessThan(1);
      expect(box.max.z - box.min.z).toBeLessThan(1);
      // Under the cable tray.
      expect(box.max.y).toBeLessThan(0.62);
    }
    for (const [name, art] of Object.entries(BASEMENT_WALL_ART)) {
      const box = bounds(art());
      expect(vertices(art())).toBeGreaterThan(0);
      expect(box.min.z).toBeGreaterThanOrEqual(0.5);
      const half = BASEMENT_ART_HALF[name as keyof typeof BASEMENT_ART_HALF];
      expect(box.max.x).toBeLessThanOrEqual(half + 0.01);
      expect(box.min.x).toBeGreaterThanOrEqual(-half - 0.01);
    }
  });

  it('builds the tray over its whole run and its battens hanging under it', () => {
    for (const m of maps)
      for (const t of basementRoom(m).trays) {
        const box = bounds(trayModel(t));
        expect(box.min.x).toBeLessThanOrEqual(t.x0 + 0.01);
        expect(box.max.x).toBeGreaterThanOrEqual(t.x1 - 0.01);
      }
    const batten = bounds(battenModel());
    expect(batten.max.y).toBeGreaterThan(0);
    expect(batten.min.y).toBeLessThan(0);
  });
});
