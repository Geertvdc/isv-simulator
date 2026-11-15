import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { createLifts } from '../../../sim/lifts';
import { HYPERGROWTH } from '../../../sim/levels';
import { LEVEL_LOOKS } from '../../mapLook';
import { projectPoint } from '../../projection';
import { type Model, tint } from '../kit';
import { FRONT_WALL_HEIGHT, STATION_HEIGHT, WALL_HEIGHT } from '../layout';
import { FLOOR_COLORS, PALETTE, WALL_COLORS } from '../look';
import {
  HATCH_TOP,
  LOWER_WALL_ART,
  MIXED_LOOKS,
  bannerModel,
  blockWallModel,
  chuteHatchCounter,
  liftHeadModel,
  loadingBayModel,
  postHatchModel,
  railModel,
} from '../roomModels/lowerFloors';
import { scenePose } from '../scenes/downTheHall';
import {
  CARDBOARD,
  LOWER_FRONTS,
  LOWER_FRONT_MAX_HEIGHT,
  LOWER_TOPS,
} from '../setDressing/lowerFloorsWallTops';
import { ROOMS, floorDressing } from '.';
import { LOWER_FLOORS_ROOM } from './lowerFloors';
import { LOWER_ART_HALF, lowerFloorsRoom } from './lowerFloorsRoom';

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
/** Every vertex of `m` placed at `at` turned by `yaw`, in the world. */
const worldPoints = (m: Model, at: { x: number; y: number; z: number }, yaw: number) => {
  const mat = new THREE.Matrix4().compose(
    new THREE.Vector3(at.x, at.y, at.z),
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw),
    new THREE.Vector3(1, 1, 1),
  );
  const out: THREE.Vector3[] = [];
  for (const g of [m.body, m.glow, m.glass]) {
    const pos = g?.getAttribute('position');
    if (pos)
      for (let i = 0; i < pos.count; i++)
        out.push(new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(mat));
  }
  return out;
};

describe('LOWER_FLOORS_ROOM', () => {
  const map = HYPERGROWTH.map;
  const plan = lowerFloorsRoom(map);

  it("dresses the hypergrowth level's walls and floor, and only it", () => {
    const look = LEVEL_LOOKS.hypergrowth;
    expect(look?.walls).toBe('lowerFloors');
    expect(look?.floor).toBe('mixedFloors');
    expect(look && ROOMS[look.walls]).toBe(LOWER_FLOORS_ROOM);
    expect(look && floorDressing(look.floor, LOWER_FLOORS_ROOM)).toBe(LOWER_FLOORS_ROOM.floor);
    for (const [id, l] of Object.entries(LEVEL_LOOKS))
      if (id !== 'hypergrowth') {
        expect(l.walls).not.toBe('lowerFloors');
        expect(l.floor).not.toBe('mixedFloors');
      }
  });

  it('builds every floor look, every swap, the hatch, the story pieces and the wall art', () => {
    const { floor, swapModels, counter } = LOWER_FLOORS_ROOM;
    if (!floor || !swapModels || !counter) throw new Error('missing');
    for (let look = 0; look < MIXED_LOOKS; look++)
      expect(vertices(floor.model(look))).toBeGreaterThan(0);
    for (const name of Object.values(plan.swaps)) {
      const model = swapModels[name];
      expect(model, name).toBeDefined();
      if (model) expect(vertices(model())).toBeGreaterThan(0);
    }
    for (const piece of ['wall', 'wall-front', 'wall-inner'] as const)
      expect(vertices(blockWallModel(piece, 1))).toBeGreaterThan(0);
    for (const m of [
      postHatchModel(2),
      loadingBayModel(2),
      liftHeadModel(0),
      liftHeadModel(1),
      railModel(true),
      railModel(false),
    ])
      expect(vertices(m)).toBeGreaterThan(0);
    for (const [name, art] of Object.entries(LOWER_WALL_ART)) {
      const box = bounds(art());
      const half = LOWER_ART_HALF[name as keyof typeof LOWER_ART_HALF];
      expect(box.max.x, name).toBeLessThanOrEqual(half + 0.01);
      expect(box.min.x, name).toBeGreaterThanOrEqual(-half - 0.01);
      expect(box.max.y, name).toBeLessThanOrEqual(WALL_HEIGHT + 0.01);
    }
  });

  it('keeps the stations the brightest: the hatch top, the boxes, the caps and the floor darker', () => {
    for (const c of Object.values(PALETTE.station)) {
      const station = luminance(tint(c, 0.4));
      for (const mine of [
        HATCH_TOP,
        CARDBOARD,
        WALL_COLORS.lowerFloors.top,
        FLOOR_COLORS.mixedFloors[0],
      ])
        expect(luminance(mine)).toBeLessThan(station);
    }
    // The rubber is mid grey-green, not white.
    expect(luminance(FLOOR_COLORS.mixedFloors[0])).toBeLessThan(0.3);
    // The hatch stays a counter: nothing on it taller than a hand over the top.
    const hatch = bounds(chuteHatchCounter().base);
    expect(hatch.max.y).toBeLessThan(STATION_HEIGHT + 0.08);
    expect(hatch.max.x).toBeLessThanOrEqual(0.51);
  });

  it('keeps the wall-top piles inside their tile and the front wall low', () => {
    for (const [kind, p] of Object.entries(LOWER_TOPS)) {
      const box = bounds(p());
      expect(box.max.x - box.min.x, kind).toBeLessThan(1.1);
      expect(box.max.z - box.min.z, kind).toBeLessThan(1.1);
      expect(box.max.y, kind).toBeLessThan(0.75);
    }
    for (const p of Object.values(LOWER_FRONTS))
      expect(bounds(p()).max.y).toBeLessThanOrEqual(LOWER_FRONT_MAX_HEIGHT);
    expect(bounds(railModel(true)).max.y).toBeLessThan(FRONT_WALL_HEIGHT + 0.3);
  });

  it('hangs the welcome banner where it hides no lift cabin on screen', () => {
    const b = plan.banner;
    if (!b) throw new Error('missing');
    const pose = scenePose(map);
    const shown = worldPoints(bannerModel(b), { x: (b.x0 + b.x1) / 2, y: 0, z: b.z }, 0).map((v) =>
      projectPoint(pose, v),
    );
    const sx0 = Math.min(...shown.map((p) => p.x));
    const sx1 = Math.max(...shown.map((p) => p.x));
    const sy1 = Math.max(...shown.map((p) => p.y));
    for (const lift of createLifts(map))
      for (const t of lift.stops.flat())
        for (const [dx, dz] of [
          [-0.5, -0.5],
          [0.5, -0.5],
          [-0.5, 0.5],
          [0.5, 0.5],
        ] as const) {
          const p = projectPoint(pose, { x: t.x + dx, y: 0, z: t.y + dz });
          // Each cabin corner is outside the banner's screen box.
          expect(p.x < sx0 || p.x > sx1 || p.y > sy1).toBe(true);
        }
  });
});
