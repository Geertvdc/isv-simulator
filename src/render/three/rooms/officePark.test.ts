import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseLevelMap } from '../../../sim/level';
import { LEVEL_LOOKS } from '../../mapLook';
import { WALL_DECOS } from '../../mapShape';
import type { Model } from '../kit';
import { WALL_DECO_MODELS } from '../roomModels';
import { ROOMS, floorDressing } from '.';
import { CARPET_WEAR } from './officeParkRoom';
import { OFFICE_PARK_ROOM } from './officePark';

const map = parseLevelMap(
  readFileSync(new URL('../../../../maps/level-02-open-plan.txt', import.meta.url), 'utf8'),
);

const vertices = (m: Model) => m.body.getAttribute('position').count;

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
});
