import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseLevelMap } from '../../../sim/level';
import { LEVEL_LOOKS } from '../../mapLook';
import { ROOMS, floorDressing } from '.';
import { WAREHOUSE_ROOM } from './warehouse';

const map = parseLevelMap(
  readFileSync(new URL('../../../../maps/level-03-scale-up.txt', import.meta.url), 'utf8'),
);

describe('WAREHOUSE_ROOM', () => {
  it("dresses the scale-up level's walls and floor", () => {
    const look = LEVEL_LOOKS['scale-up'];
    expect(look?.walls).toBe('warehouse');
    expect(look && ROOMS[look.walls]).toBe(WAREHOUSE_ROOM);
    expect(look && floorDressing(look.floor, WAREHOUSE_ROOM)).toBe(WAREHOUSE_ROOM.floor);
    expect(WAREHOUSE_ROOM.plan(map)).toEqual(WAREHOUSE_ROOM.plan(map));
  });
});
