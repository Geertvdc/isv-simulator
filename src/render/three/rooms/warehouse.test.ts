import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { parseDraftMap } from '../../../sim/draftMap';
import { DOWN_THE_HALL } from '../../../sim/levels';
import draftText from '../../../../maps/drafts/scale-up.txt?raw';
import { LEVEL_LOOKS } from '../../mapLook';
import type { WallPiece } from '../../mapShape';
import { tint } from '../kit';
import { PALETTE } from '../look';
import { SCAFFOLD, WAREHOUSE_WALL_ART } from '../roomModels/warehouse';
import { ROOMS, floorDressing } from '.';
import { WAREHOUSE_ROOM } from './warehouse';

const luminance = (c: number) => {
  const { r, g, b } = new THREE.Color(c);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

describe('WAREHOUSE_ROOM', () => {
  const maps = [DOWN_THE_HALL.map, parseDraftMap(draftText)];

  it("dresses the scale-up level's walls and floor", () => {
    const look = LEVEL_LOOKS['scale-up'];
    expect(look?.walls).toBe('warehouse');
    expect(look && ROOMS[look.walls]).toBe(WAREHOUSE_ROOM);
    expect(look && floorDressing(look.floor, WAREHOUSE_ROOM)).toBe(WAREHOUSE_ROOM.floor);
  });

  it('builds every model it places, on both maps', () => {
    for (const map of maps) {
      const plan = WAREHOUSE_ROOM.plan(map);
      const keys: string[] = [];
      WAREHOUSE_ROOM.placeStory?.(plan, map, (key, model) => {
        keys.push(key);
        expect(model().body.attributes.position?.count).toBeGreaterThan(0);
      });
      expect(keys.some((k) => k.startsWith('hallDoor'))).toBe(true);
      expect(keys.some((k) => k.startsWith('bayDoor'))).toBe(true);
      for (const name of Object.values(plan.swaps))
        expect(WAREHOUSE_ROOM.swapModels?.[name]).toBeDefined();
    }
    for (const piece of ['wall', 'wall-front', 'wall-inner'] as WallPiece[])
      for (let look = 0; look < (WAREHOUSE_ROOM.wall?.looks ?? 0); look++)
        expect(WAREHOUSE_ROOM.wall?.model(piece, look).body).toBeDefined();
    for (const model of Object.values(WAREHOUSE_WALL_ART)) expect(model().body).toBeDefined();
  });

  it('keeps the scaffold-board counter tops darker than every station top', () => {
    for (const color of Object.values(PALETTE.station))
      expect(luminance(SCAFFOLD)).toBeLessThan(luminance(tint(color, 0.4)));
  });
});
