import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { parseLevelMap } from '../../../sim/level';
import { LEVEL_LOOKS } from '../../mapLook';
import { WALL_DECOS } from '../../mapShape';
import { type Model, tint } from '../kit';
import { PALETTE, WALL_COLORS } from '../look';
import { WALL_DECO_MODELS } from '../roomModels';
import { BEECH, STRIP_HANG, stripWireModel } from '../roomModels/officePark';
import {
  FRONT_PROP_MAX_HEIGHT,
  OFFICE_PARK_FRONT_WALL_PROPS,
} from '../setDressing/officeParkWallTops';
import { ROOMS, floorDressing } from '.';
import { CARPET_WEAR } from './officeParkRoom';
import { OFFICE_PARK_ROOM } from './officePark';

const map = parseLevelMap(
  readFileSync(new URL('../../../../maps/level-02-open-plan.txt', import.meta.url), 'utf8'),
);

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

describe('OFFICE_PARK_ROOM', () => {
  it("dresses the open-plan level's walls and floor", () => {
    const look = LEVEL_LOOKS['open-plan'];
    expect(look?.walls).toBe('officePark');
    expect(look && ROOMS[look.walls]).toBe(OFFICE_PARK_ROOM);
    expect(look && floorDressing(look.floor, OFFICE_PARK_ROOM)).toBe(OFFICE_PARK_ROOM.floor);
    expect(OFFICE_PARK_ROOM.plan(map)).toEqual(OFFICE_PARK_ROOM.plan(map));
  });

  it('builds every wall piece and look, the floor in every wear, the plinth and the swaps', () => {
    const { wall, floor, foundation, swapModels, lamp } = OFFICE_PARK_ROOM;
    if (!wall || !floor || !foundation || !swapModels || !lamp) throw new Error('missing');
    for (const piece of ['wall', 'wall-front', 'wall-inner'] as const)
      for (let l = 0; l < wall.looks; l++)
        expect(vertices(wall.model(piece, l))).toBeGreaterThan(0);
    for (const wear of Object.values(CARPET_WEAR))
      expect(vertices(floor.model(floor.look?.(0, 0, wear) ?? 0))).toBeGreaterThan(0);
    for (let l = 0; l < foundation.looks; l++)
      expect(vertices(foundation.model(l))).toBeGreaterThan(0);
    for (const build of Object.values(swapModels)) expect(vertices(build())).toBeGreaterThan(0);
    expect(lamp.model().glow).not.toBeNull();
  });

  it('keeps carpet tiles within 4% of each other', () => {
    const floor = OFFICE_PARK_ROOM.floor;
    if (!floor?.tone) throw new Error('no tone');
    for (let y = 0; y < 10; y++)
      for (let x = 0; x < 14; x++) {
        const t = floor.tone(x, y, 1234);
        expect(Math.abs(t - 1)).toBeLessThanOrEqual(0.04);
      }
  });

  it('has a model for every wall decoration it hangs', () => {
    for (const deco of WALL_DECOS.officePark) expect(WALL_DECO_MODELS[deco], deco).toBeDefined();
  });

  it('builds its desks for every place in a run', () => {
    const counter = OFFICE_PARK_ROOM.counter;
    if (!counter) throw new Error('no counter');
    for (const minusEnd of [false, true])
      for (const plusEnd of [false, true])
        for (const legs of [false, true])
          expect(
            vertices(counter({ minusEnd, plusEnd, legs, knob: plusEnd, yaw: 0 }).base),
          ).toBeGreaterThan(0);
  });

  it('keeps the desk tops and wall caps darker than every station top', () => {
    // Station tops are their color lifted (as the warehouse test has it).
    for (const color of Object.values(PALETTE.station)) {
      expect(luminance(BEECH)).toBeLessThan(luminance(tint(color, 0.4)));
      expect(luminance(WALL_COLORS.officePark.top)).toBeLessThan(luminance(tint(color, 0.4)));
    }
  });

  it('keeps the front-wall clusters low', () => {
    for (const build of OFFICE_PARK_FRONT_WALL_PROPS)
      expect(bounds(build()).max.y).toBeLessThanOrEqual(FRONT_PROP_MAX_HEIGHT);
  });

  it('hangs each strip light on one thin drop to a thin wire', () => {
    const lamp = OFFICE_PARK_ROOM.lamp;
    if (!lamp?.wire) throw new Error('no wire');
    expect(lamp.wire.hang).toBe(STRIP_HANG);
    // Above the fitting only the drop and its clip: nothing wider than the clip.
    const fitting = lamp.model().body;
    const pos = fitting.getAttribute('position');
    for (let i = 0; i < pos.count; i++)
      if (pos.getY(i) > 0.06) expect(Math.abs(pos.getX(i))).toBeLessThanOrEqual(0.011);
    const wire = bounds(
      stripWireModel([
        [0, 2],
        [3, 2],
        [6, 2],
      ]),
    );
    expect(wire.max.x - wire.min.x).toBeGreaterThan(6);
  });
});
