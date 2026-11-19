import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { HOT_DESKING } from '../../../sim/levels';
import { LEVEL_LOOKS } from '../../mapLook';
import type { Model } from '../kit';
import { tint } from '../kit';
import { STATION_HEIGHT, WALL_HEIGHT } from '../layout';
import { PALETTE, WALL_COLORS } from '../look';
import {
  CONE_H,
  COPING,
  COUNTER_TOP,
  THREE_FLOOR_LOOKS,
  UPPER_WALL_ART,
  bugRackModel,
  frontDeskModel,
  revolvingDoorModel,
  threeFloorModel,
  upperCounter,
} from '../roomModels/upperFloors';
import {
  LOCKER_STEEL,
  LOCKER_VIOLET,
  UPPER_FRONTS,
  UPPER_FRONT_MAX_HEIGHT,
  UPPER_TOPS,
  segfaultInLocker,
} from '../setDressing/upperFloorsWallTops';
import { ROOMS, floorDressing } from '.';
import { UPPER_FLOORS_ROOM } from './upperFloors';
import { UPPER_ART_HALF, upperFloorsRoom } from './upperFloorsRoom';

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
const stationTops = Object.values(PALETTE.station).map((c) => tint(c, 0.4));

describe('Hot Desking room dressing', () => {
  it('is the upperFloors theme, used by Hot Desking only', () => {
    expect(ROOMS.upperFloors).toBe(UPPER_FLOORS_ROOM);
    expect(floorDressing('threeFloors', UPPER_FLOORS_ROOM)).toBe(UPPER_FLOORS_ROOM.floor);
    const users = Object.entries(LEVEL_LOOKS).filter(([, l]) => l.walls === 'upperFloors');
    expect(users.map(([id]) => id)).toEqual(['hot-desking']);
  });

  it('builds every floor look', () => {
    for (let look = 0; look < THREE_FLOOR_LOOKS; look++)
      expect(threeFloorModel(look).body.getAttribute('position').count).toBeGreaterThan(0);
  });

  it('has a model for every swap, wall art and wall-top kind the plan uses', () => {
    const plan = upperFloorsRoom(HOT_DESKING.map);
    for (const s of Object.values(plan.swaps))
      expect(UPPER_FLOORS_ROOM.swapModels?.[s]).toBeDefined();
    for (const a of plan.wallArt) expect(UPPER_WALL_ART[a.art]).toBeDefined();
    for (const t of plan.tops) expect(UPPER_TOPS[t.kind]).toBeDefined();
  });

  it('keeps the art within its half and on the face', () => {
    for (const [art, half] of Object.entries(UPPER_ART_HALF)) {
      const model = UPPER_WALL_ART[art];
      if (!model || art === 'plan') continue;
      const box = bounds(model());
      expect(box.min.x).toBeGreaterThanOrEqual(-half - 0.02);
      expect(box.max.x).toBeLessThanOrEqual(half + 0.02);
      if (art === 'stairsClosed') {
        // Its traffic cones stand on its own wall top, a cone high.
        expect(box.min.z).toBeGreaterThanOrEqual(-0.5);
        expect(box.max.y).toBeLessThanOrEqual(WALL_HEIGHT + CONE_H + 0.001);
        continue;
      }
      expect(box.min.z).toBeGreaterThanOrEqual(0.49);
      expect(box.max.y).toBeLessThanOrEqual(WALL_HEIGHT);
    }
  });

  it('keeps counters, lockers and wall caps darker than every station top', () => {
    for (const top of stationTops) {
      expect(luminance(COUNTER_TOP)).toBeLessThan(luminance(top));
      expect(luminance(LOCKER_STEEL)).toBeLessThan(luminance(top));
      expect(luminance(LOCKER_VIOLET)).toBeLessThan(luminance(top));
      expect(luminance(WALL_COLORS.upperFloors.top)).toBeLessThan(luminance(top));
    }
    const box = bounds(
      upperCounter({ minusEnd: true, plusEnd: true, legs: true, knob: false, yaw: 0 }).base,
    );
    expect(box.max.y).toBeLessThanOrEqual(STATION_HEIGHT + 0.1);
  });

  it('keeps the front wall low: its props a hand high, the revolving door under 0.6', () => {
    for (const build of Object.values(UPPER_FRONTS))
      expect(bounds(build()).max.y).toBeLessThanOrEqual(UPPER_FRONT_MAX_HEIGHT);
    for (const span of [1, 2, 3]) expect(bounds(revolvingDoorModel(span)).max.y).toBeLessThan(0.6);
  });

  it('keeps the front desk and the bug rack in their wall line and no taller than the wall', () => {
    for (const span of [1, 2, 3]) {
      for (const m of [frontDeskModel(span), bugRackModel(span)]) {
        const box = bounds(m);
        expect(box.max.y).toBeLessThanOrEqual(WALL_HEIGHT + 0.001);
        // On the outer half of the tile (−z), clear of the station.
        expect(box.max.z).toBeLessThanOrEqual(-0.25);
      }
    }
  });

  it('makes the kiosk a big red screen, at least 0.6 wide', () => {
    const kiosk = UPPER_WALL_ART.kiosk;
    if (!kiosk) throw new Error('no kiosk');
    const box = bounds(kiosk());
    expect(box.max.x - box.min.x).toBeGreaterThanOrEqual(0.6);
  });

  it('caps the partitions with cool concrete coping, lighter than 3-1 and darker than stations', () => {
    expect(COPING).toBe(WALL_COLORS.upperFloors.top);
    expect(luminance(COPING)).toBeGreaterThan(luminance(WALL_COLORS.midRise.top));
    const wall = UPPER_FLOORS_ROOM.wall?.model('wall', 0);
    if (!wall) throw new Error('no wall model');
    const c = new THREE.Color(COPING);
    const colors = wall.body.getAttribute('color');
    let found = false;
    for (let i = 0; i < colors.count; i++)
      if (Math.abs(colors.getX(i) - c.r) < 1e-3 && Math.abs(colors.getZ(i) - c.b) < 1e-3)
        found = true;
    expect(found).toBe(true);
  });

  it('fits Segfault inside the open locker', () => {
    const cat = bounds(segfaultInLocker());
    const bank = bounds(UPPER_TOPS.lockersOpen());
    expect(cat.max.y).toBeLessThan(bank.max.y);
    expect(cat.max.z).toBeLessThanOrEqual(bank.max.z + 0.05);
  });
});
