import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { parseDraftMap } from '../../../sim/draftMap';
import { SEED_ROUND } from '../../../sim/levels';
import draftText from '../../../../maps/drafts/seed-round.txt?raw';
import { LEVEL_LOOKS } from '../../mapLook';
import { type Model, tint } from '../kit';
import { PALETTE, WALL_COLORS } from '../look';
import {
  LOFT_WALL_ART,
  PENDANT_HANG,
  STAINED_PLY,
  loftWireModel,
  roofDoorFrontModel,
} from '../roomModels/loft';
import {
  LOFT_FRONT_PROP_MAX_HEIGHT,
  LOFT_FRONT_WALL_PROPS,
  LOFT_WALL_TOP_PROPS,
} from '../setDressing/loftWallTops';
import { ROOMS, floorDressing } from '.';
import { LOFT_ROOM } from './loft';
import { POLISHED_WEAR } from './loftRoom';

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

describe('LOFT_ROOM', () => {
  const maps = [SEED_ROUND.map, parseDraftMap(draftText)];

  it("dresses the seed-round level's walls and floor", () => {
    const look = LEVEL_LOOKS['seed-round'];
    expect(look?.walls).toBe('loft');
    expect(look && ROOMS[look.walls]).toBe(LOFT_ROOM);
    expect(look && floorDressing(look.floor, LOFT_ROOM)).toBe(LOFT_ROOM.floor);
    for (const m of maps) expect(LOFT_ROOM.plan(m)).toEqual(LOFT_ROOM.plan(m));
  });

  it('builds every wall piece and look, the floor in every wear, the concrete and the pendant', () => {
    const { wall, floor, foundation, lamp } = LOFT_ROOM;
    if (!wall || !floor?.look || !foundation || !lamp) throw new Error('missing');
    for (const piece of ['wall', 'wall-front', 'wall-inner'] as const)
      for (let l = 0; l < wall.looks; l++)
        expect(vertices(wall.model(piece, l))).toBeGreaterThan(0);
    for (const wear of Object.values(POLISHED_WEAR))
      for (const [x, y] of [
        [0, 0],
        [1, 1],
        [2, 3],
      ] as const)
        expect(vertices(floor.model(floor.look(x, y, wear)))).toBeGreaterThan(0);
    for (let l = 0; l < foundation.looks; l++)
      expect(vertices(foundation.model(l))).toBeGreaterThan(0);
    expect(lamp.model().glow).not.toBeNull();
    for (const model of Object.values(LOFT_WALL_ART)) expect(vertices(model())).toBeGreaterThan(0);
    for (const model of LOFT_WALL_TOP_PROPS) expect(vertices(model())).toBeGreaterThan(0);
  });

  it('places its doors and art on both maps, every model built', () => {
    for (const m of maps) {
      const keys: string[] = [];
      LOFT_ROOM.placeStory?.(LOFT_ROOM.plan(m), m, (key, model) => {
        keys.push(key);
        expect(vertices(model())).toBeGreaterThan(0);
      });
      expect(keys.some((k) => k.startsWith('liftDoor'))).toBe(true);
      expect(keys.some((k) => k.startsWith('roofDoor'))).toBe(true);
      expect(keys).toContain('art:dashboard');
      expect(keys).toContain('art:cheque');
    }
  });

  it('keeps the floor within 4% from tile to tile', () => {
    const floor = LOFT_ROOM.floor;
    if (!floor?.tone) throw new Error('no tone');
    for (let y = 0; y < 11; y++)
      for (let x = 0; x < 15; x++)
        expect(Math.abs(floor.tone(x, y, 98765) - 1)).toBeLessThanOrEqual(0.04);
  });

  it('builds its desks for every place in a run', () => {
    const counter = LOFT_ROOM.counter;
    if (!counter) throw new Error('no counter');
    for (const minusEnd of [false, true])
      for (const plusEnd of [false, true])
        for (const legs of [false, true])
          expect(
            vertices(counter({ minusEnd, plusEnd, legs, knob: plusEnd, yaw: 0 }).base),
          ).toBeGreaterThan(0);
  });

  it('keeps the desk tops and wall caps darker than every station top', () => {
    for (const color of Object.values(PALETTE.station)) {
      expect(luminance(STAINED_PLY)).toBeLessThan(luminance(tint(color, 0.4)));
      expect(luminance(WALL_COLORS.loft.top)).toBeLessThan(luminance(tint(color, 0.4)));
    }
  });

  it('keeps everything on the front edge low: the front-wall clusters and the roof door', () => {
    for (const build of LOFT_FRONT_WALL_PROPS)
      expect(bounds(build()).max.y).toBeLessThanOrEqual(LOFT_FRONT_PROP_MAX_HEIGHT);
    for (const span of [1, 2, 4]) expect(bounds(roofDoorFrontModel(span)).max.y).toBeLessThan(0.6);
  });

  it('hangs each globe on one thin flex to a wire strung wall to wall', () => {
    const lamp = LOFT_ROOM.lamp;
    if (!lamp?.wire) throw new Error('no wire');
    expect(lamp.wire.hang).toBe(PENDANT_HANG);
    // Above the globe's cap only the flex and its clip.
    const pos = lamp.model().body.getAttribute('position');
    for (let i = 0; i < pos.count; i++)
      if (pos.getY(i) > 0.17) expect(Math.abs(pos.getX(i))).toBeLessThanOrEqual(0.011);
    const wire = bounds(
      loftWireModel([
        [0, 2],
        [3, 2],
        [6, 2],
      ]),
    );
    expect(wire.max.x - wire.min.x).toBeGreaterThan(6);
  });
});
