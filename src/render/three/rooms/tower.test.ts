import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { BACK_TO_BACK } from '../../../sim/levels';
import { LEVEL_LOOKS } from '../../mapLook';
import type { Model } from '../kit';
import { tint } from '../kit';
import { FRONT_WALL_HEIGHT, STATION_HEIGHT, WALL_HEIGHT } from '../layout';
import { FLOOR_COLORS, PALETTE, WALL_COLORS } from '../look';
import {
  BUTTON_OUT,
  COUNTER_TOP,
  CURTAIN_CAP,
  CURTAIN_SKY,
  MEETING_PIECE_MODELS,
  PARTITION_SKY,
  PORTAL_HEAD,
  RELEASE_MAX_H,
  SILL_CAP,
  TERRAZZO,
  TOWER_FLOOR_LOOKS,
  TOWER_SWAP_MODELS,
  doorPortalModel,
  releaseHatchModel,
  requestPortalModel,
  towerArtModels,
  towerCounter,
  towerFloorModel,
  vinylModel,
} from '../roomModels/tower';
import { TOWER_TOPS, TOWER_TOP_MAX_HEIGHT } from '../setDressing/towerWallTops';
import { ROOMS, floorDressing } from '.';
import { TOWER_ROOM } from './tower';
import { TOWER_ART_HALF, TOWER_SWAPS, towerRoom } from './towerRoom';

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
const plan = towerRoom(BACK_TO_BACK.map);

describe('Back to Back room dressing', () => {
  it('is the tower theme, used by Back to Back only', () => {
    expect(ROOMS.tower).toBe(TOWER_ROOM);
    expect(floorDressing('towerFloors', TOWER_ROOM)).toBe(TOWER_ROOM.floor);
    const users = Object.entries(LEVEL_LOOKS).filter(([, l]) => l.walls === 'tower');
    expect(users.map(([id]) => id)).toEqual(['back-to-back']);
  });

  it('builds every floor look and every swap', () => {
    for (let look = 0; look < TOWER_FLOOR_LOOKS; look++)
      expect(towerFloorModel(look).body.getAttribute('position').count).toBeGreaterThan(0);
    for (const s of TOWER_SWAPS) expect(TOWER_SWAP_MODELS[s]).toBeDefined();
    for (const s of Object.values(plan.swaps)) expect(TOWER_ROOM.swapModels?.[s]).toBeDefined();
  });

  it('has a model for every art, wall-top kind and meeting piece the plan uses', () => {
    const art = towerArtModels(['A', 'B']);
    for (const a of plan.art) expect(art[a.art]).toBeDefined();
    for (const t of plan.tops) expect(TOWER_TOPS[t.kind]).toBeDefined();
    for (const p of plan.meetingPieces) expect(MEETING_PIECE_MODELS[p.piece]).toBeDefined();
  });

  it('keeps wall art within its half, on its face and under the wall top', () => {
    const art = towerArtModels(['THE GARAGE', 'MOM', 'UNIT 4', 'THE BISCUIT']);
    for (const [name, half] of Object.entries(TOWER_ART_HALF)) {
      const box = bounds(art[name as keyof typeof art]());
      expect(box.min.x).toBeGreaterThanOrEqual(-half - 0.02);
      expect(box.max.x).toBeLessThanOrEqual(half + 0.02);
      expect(box.max.y).toBeLessThanOrEqual(WALL_HEIGHT);
      // On the face; the low booking screens on the glass in the wall's middle.
      expect(box.min.z).toBeGreaterThanOrEqual(name.startsWith('bookingLow') ? -0.01 : 0.49);
    }
  });

  it('keeps counters, caps, the corridor floor and the kit darker than every station top', () => {
    for (const top of stationTops) {
      for (const c of [
        COUNTER_TOP,
        WALL_COLORS.tower.top,
        CURTAIN_CAP,
        SILL_CAP,
        CURTAIN_SKY,
        PARTITION_SKY,
        TERRAZZO,
        ...FLOOR_COLORS.towerFloors,
      ])
        expect(luminance(c)).toBeLessThan(luminance(top));
    }
    const box = bounds(
      towerCounter({ minusEnd: true, plusEnd: true, legs: true, knob: false, yaw: 0 }).base,
    );
    expect(box.max.y).toBeLessThanOrEqual(STATION_HEIGHT + 0.01);
  });

  it('keeps the wall-top kit small', () => {
    for (const build of Object.values(TOWER_TOPS))
      expect(bounds(build()).max.y).toBeLessThanOrEqual(TOWER_TOP_MAX_HEIGHT);
  });

  it('keeps the front low: the release hatch and its button under 0.6, the low portals at the screens', () => {
    for (const span of [1, 2, 3]) {
      const box = bounds(releaseHatchModel(span));
      expect(box.max.y).toBeLessThanOrEqual(RELEASE_MAX_H);
      expect(box.max.z).toBeLessThanOrEqual(0.5 + BUTTON_OUT + 0.25);
    }
    expect(bounds(doorPortalModel(false)).max.y).toBeLessThan(0.7);
    for (const m of Object.values(MEETING_PIECE_MODELS))
      expect(bounds(m()).max.y).toBeLessThan(0.65);
    expect(bounds(vinylModel('THE GARAGE', 4.8)).max.y).toBeLessThan(0.65);
  });

  it('keeps the request portal behind its station and no taller than the wall', () => {
    for (const span of [1, 2]) {
      const box = bounds(requestPortalModel(span));
      expect(box.max.y).toBeLessThanOrEqual(WALL_HEIGHT);
      expect(box.max.z).toBeLessThanOrEqual(-0.42);
    }
  });

  it('keeps a meeting door walkable and its light clear: the tall portal is posts, a head under the light and a leaf parked beside it', () => {
    const m = doorPortalModel(true);
    expect(bounds(m).max.y).toBeLessThanOrEqual(PORTAL_HEAD + 0.001);
    expect(PORTAL_HEAD).toBeLessThan(1.25 - 0.12);
    for (const g of [m.body, m.glass]) {
      if (!g) continue;
      const pos = g.getAttribute('position');
      for (let i = 0; i < pos.count; i++) {
        // In the doorway's middle, only the head overhead.
        if (Math.abs(pos.getZ(i)) < 0.44 && Math.abs(pos.getX(i)) < 0.5)
          expect(pos.getY(i)).toBeGreaterThanOrEqual(PORTAL_HEAD - 0.05);
      }
    }
    expect(FRONT_WALL_HEIGHT).toBeLessThan(0.3);
  });
});
