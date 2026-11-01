import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseLevelMap } from '../../../sim/level';
import { LEVEL_LOOKS } from '../../mapLook';
import { ROOMS, floorDressing } from '.';
import { OFFICE_PARK_ROOM } from './officePark';

const map = parseLevelMap(
  readFileSync(new URL('../../../../maps/level-02-open-plan.txt', import.meta.url), 'utf8'),
);

describe('OFFICE_PARK_ROOM', () => {
  it("dresses the open-plan level's walls and floor", () => {
    const look = LEVEL_LOOKS['open-plan'];
    expect(look?.walls).toBe('officePark');
    expect(look && ROOMS[look.walls]).toBe(OFFICE_PARK_ROOM);
    expect(look && floorDressing(look.floor, OFFICE_PARK_ROOM)).toBe(OFFICE_PARK_ROOM.floor);
    expect(OFFICE_PARK_ROOM.plan(map)).toEqual(OFFICE_PARK_ROOM.plan(map));
  });
});
