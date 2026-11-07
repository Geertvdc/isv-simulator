import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseLevelMap } from '../../../sim/level';
import { LEVEL_LOOKS } from '../../mapLook';
import { ROOMS, floorDressing } from '.';
import { LOFT_ROOM } from './loft';

const map = parseLevelMap(
  readFileSync(new URL('../../../../maps/level-04-seed-round.txt', import.meta.url), 'utf8'),
);

describe('LOFT_ROOM', () => {
  it("dresses the seed-round level's walls and floor", () => {
    const look = LEVEL_LOOKS['seed-round'];
    expect(look?.walls).toBe('loft');
    expect(look && ROOMS[look.walls]).toBe(LOFT_ROOM);
    expect(look && floorDressing(look.floor, LOFT_ROOM)).toBe(LOFT_ROOM.floor);
    expect(LOFT_ROOM.plan(map)).toEqual(LOFT_ROOM.plan(map));
  });
});
