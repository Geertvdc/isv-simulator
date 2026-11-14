import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { parseDraftMap } from '../../../sim/draftMap';
import { MIDDLE_MANAGEMENT } from '../../../sim/levels';
import draftText from '../../../../maps/drafts/middle-management.txt?raw';
import { LEVEL_LOOKS } from '../../mapLook';
import { type Model, tint } from '../kit';
import { FRONT_WALL_HEIGHT, STATION_HEIGHT, WALL_HEIGHT } from '../layout';
import { FLOOR_COLORS, PALETTE, WALL_COLORS } from '../look';
import {
  DESK_TOP,
  GLASS_CORE,
  MID_RISE_WALL_ART,
  WALKWAY,
  execChairModel,
  glassScreenModel,
  pendantModel,
  receptionModel,
} from '../roomModels/midRise';
import {
  LANYARD_BOX,
  MID_RISE_FRONT_PROP_MAX_HEIGHT,
  MID_RISE_FRONT_WALL_PROPS,
  MID_RISE_WALL_TOP_PROPS,
  SEGFAULT_ON_CHAIR,
} from '../setDressing/midRiseWallTops';
import { ROOMS, floorDressing } from '.';
import { MID_RISE_ROOM } from './midRise';
import { CARPET_WEAR_KINDS, MID_RISE_ART_HALF, midRiseRoom } from './midRiseRoom';

const vertices = (m: Model) => m.body.getAttribute('position').count;
const luminance = (c: number) => {
  const { r, g, b } = new THREE.Color(c);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const saturation = (c: number) => {
  const hsl = { h: 0, s: 0, l: 0 };
  new THREE.Color(c).getHSL(hsl);
  return hsl.s;
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

describe('MID_RISE_ROOM', () => {
  const maps = [MIDDLE_MANAGEMENT.map, parseDraftMap(draftText)];

  it("dresses the middle-management level's walls and floor, and only it", () => {
    const look = LEVEL_LOOKS['middle-management'];
    expect(look?.walls).toBe('midRise');
    expect(look && ROOMS[look.walls]).toBe(MID_RISE_ROOM);
    expect(look && floorDressing(look.floor, MID_RISE_ROOM)).toBe(MID_RISE_ROOM.floor);
    for (const [id, l] of Object.entries(LEVEL_LOOKS))
      if (id !== 'middle-management') {
        expect(l.walls).not.toBe('midRise');
        expect(l.floor).not.toBe('corporateCarpet');
      }
  });

  it('builds every wall piece and look, every swap, the floor in every wear, the foundation and the pendant', () => {
    const { wall, floor, foundation, lamp, swapModels } = MID_RISE_ROOM;
    if (!wall || !floor?.look || !foundation || !lamp || !swapModels) throw new Error('missing');
    for (const piece of ['wall', 'wall-front', 'wall-inner'] as const)
      for (let l = 0; l < wall.looks; l++)
        expect(vertices(wall.model(piece, l))).toBeGreaterThan(0);
    for (let wear = 0; wear < CARPET_WEAR_KINDS; wear++)
      for (const [x, y] of [
        [0, 0],
        [1, 0],
        [3, 5],
      ] as const)
        expect(vertices(floor.model(floor.look(x, y, wear)))).toBeGreaterThan(0);
    for (let l = 0; l < foundation.looks; l++)
      expect(vertices(foundation.model(l))).toBeGreaterThan(0);
    expect(vertices(lamp.model())).toBeGreaterThan(0);
    for (const m of maps)
      for (const name of Object.values(midRiseRoom(m).swaps)) {
        const model = swapModels[name];
        expect(model, name).toBeDefined();
        if (model) expect(vertices(model())).toBeGreaterThan(0);
      }
  });

  it('keeps every carpet tile within 4% of the base tone, the carpet mid-light, the walkway lighter', () => {
    const floor = MID_RISE_ROOM.floor;
    if (!floor?.tone) throw new Error('missing');
    for (let y = 0; y < 12; y++)
      for (let x = 0; x < 22; x++) {
        const t = floor.tone(x, y, 4242);
        expect(t).toBeGreaterThanOrEqual(0.96);
        expect(t).toBeLessThanOrEqual(1.04);
      }
    const [base] = FLOOR_COLORS.corporateCarpet;
    expect(luminance(base)).toBeGreaterThan(0.2);
    expect(luminance(base)).toBeLessThan(0.35);
    expect(luminance(WALKWAY)).toBeGreaterThan(luminance(base));
  });

  it('caps the partitions with cool aluminium grey, darker than every station top, less saturated', () => {
    const cap = WALL_COLORS.midRise.top;
    for (const c of Object.values(PALETTE.station)) {
      expect(luminance(cap)).toBeLessThan(luminance(tint(c, 0.4)));
      expect(saturation(cap)).toBeLessThanOrEqual(saturation(c) + 0.01);
    }
    const { r, b } = new THREE.Color(cap);
    expect(b).toBeGreaterThanOrEqual(r);
    // The glass reads as glass: no brighter than the plasterboard.
    expect(luminance(GLASS_CORE)).toBeLessThan(luminance(WALL_COLORS.midRise.face));
  });

  it('gives the desks oak tops darker than every station top, in every run position', () => {
    for (const c of Object.values(PALETTE.station))
      expect(luminance(DESK_TOP)).toBeLessThan(luminance(tint(c, 0.4)));
    const counter = MID_RISE_ROOM.counter;
    if (!counter) throw new Error('missing');
    for (const minusEnd of [true, false])
      for (const plusEnd of [true, false])
        for (const legs of [true, false]) {
          const m = counter({ minusEnd, plusEnd, legs, knob: plusEnd, yaw: 0 }).base;
          expect(vertices(m)).toBeGreaterThan(0);
          const box = bounds(m);
          expect(box.max.x).toBeLessThanOrEqual(0.51);
          expect(box.min.x).toBeGreaterThanOrEqual(-0.51);
          // Nothing on a desk taller than a monitor.
          expect(box.max.y).toBeLessThan(STATION_HEIGHT + 0.36);
        }
    // A lone desk leaves its back part to the chair: the chairs stay inside the tile.
    for (const chair of [execChairModel(), pendantModel()])
      expect(vertices(chair)).toBeGreaterThan(0);
    const exec = bounds(execChairModel());
    expect(exec.min.z).toBeGreaterThan(-0.56);
    expect(exec.max.z).toBeLessThan(0);
    expect(vertices(SEGFAULT_ON_CHAIR())).toBeGreaterThan(0);
  });

  it('keeps everything on the low walls low: the front props and the glass screens', () => {
    for (const p of MID_RISE_FRONT_WALL_PROPS)
      expect(bounds(p()).max.y).toBeLessThanOrEqual(MID_RISE_FRONT_PROP_MAX_HEIGHT);
    for (const along of ['x', 'z', 'xz'] as const)
      expect(bounds(glassScreenModel(along, 0)).max.y).toBeLessThan(0.75);
    expect(bounds(receptionModel(2, true)).max.y).toBeLessThan(1);
    expect(FRONT_WALL_HEIGHT).toBeLessThan(0.6);
  });

  it('builds every wall-top cluster inside its tile and every piece of wall art within its half', () => {
    for (const p of [...MID_RISE_WALL_TOP_PROPS, LANYARD_BOX]) {
      const box = bounds(p());
      expect(box.max.x - box.min.x).toBeLessThan(1);
      expect(box.max.z - box.min.z).toBeLessThan(1);
      expect(box.max.y).toBeLessThan(0.55);
    }
    for (const [name, art] of Object.entries(MID_RISE_WALL_ART)) {
      const box = bounds(art());
      expect(vertices(art())).toBeGreaterThan(0);
      const half = MID_RISE_ART_HALF[name as keyof typeof MID_RISE_ART_HALF];
      expect(box.max.x, name).toBeLessThanOrEqual(half + 0.01);
      expect(box.min.x, name).toBeGreaterThanOrEqual(-half - 0.01);
      // On the face (or standing on a low wall), under the head track.
      expect(box.max.y, name).toBeLessThanOrEqual(WALL_HEIGHT + 0.01);
    }
  });
});
