import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { type LevelMap, getTile, parseLevelMap } from '../../../sim/level';
import { projectPoint } from '../../projection';
import { WALL_HEIGHT } from '../layout';
import { SCENES } from '.';
import { hotDeskingPlan, hotDeskingScene } from './hotDesking';
import { scenePose } from './downTheHall';
import { groundModel } from './ground';
import type { ScenePiece } from './types';
import * as hd from '../setDressing/hotDesking';
import { pigeon } from '../setDressing/businessPark';
import { bike } from '../setDressing/onCall';
import { cherryTree, dayCar } from '../setDressing/midRise';
import * as canal from '../setDressing/canal';
import * as suburb from '../setDressing/suburb';

const MAP: LevelMap = parseLevelMap(
  readFileSync(new URL('../../../../maps/level-09-hot-desking.txt', import.meta.url), 'utf8'),
);

const GROUND = -0.463;

/** Every vertex of a placed piece, in the world. */
function worldPoints(p: ScenePiece): THREE.Vector3[] {
  const model = p.piece.model(p.variant);
  const m = new THREE.Matrix4().compose(
    new THREE.Vector3(p.at.x, p.at.y, p.at.z),
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), p.yaw),
    new THREE.Vector3(...p.scale),
  );
  const out: THREE.Vector3[] = [];
  for (const g of [model.body, model.glow, model.glass]) {
    const pos = g?.getAttribute('position');
    if (pos)
      for (let i = 0; i < pos.count; i++)
        out.push(new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(m));
    g?.dispose();
  }
  return out;
}

/** Whether world point (x, z) lies over one of the level's own (non-void) tiles. */
function onSlab(map: LevelMap, x: number, z: number, inset = 0.02): boolean {
  const tx = Math.round(x);
  const tz = Math.round(z);
  if (Math.abs(x - tx) > 0.5 - inset || Math.abs(z - tz) > 0.5 - inset) return false;
  const tile = getTile(map, tx, tz);
  return tile !== null && tile !== 'void';
}

/** Screen rectangles the HUD covers at 1440×810: (x0, y0, x1, y1). Kept in step with the scene's. */
const HUD_RECTS: Record<string, [number, number, number, number]> = {
  orders: [0, 0, 690, 140],
  legend: [14, 619, 218, 734],
  score: [0, 755, 135, 810],
  timer: [1320, 755, 1440, 810],
  mute: [1370, 0, 1440, 60],
  pause: [600, 765, 840, 810],
};

/** The building's glass, the city across the road and the street storeys down: backdrop. */
const isBackdrop = (p: ScenePiece) => p.row === 'far';

/** Food and drink pieces from the other scenes: none of them belong here. */
const FOOD = new Set<unknown>([canal.coffeeVan, canal.kegs, canal.flourSacks, suburb.pizzaPile]);

describe('hotDeskingScene', () => {
  const map = MAP;
  const scene = hotDeskingScene(map);
  const front = map.height - 0.5;
  const pose = scenePose(map);
  const plan = hotDeskingPlan(map);
  const has = (piece: unknown) => scene.pieces.some((p) => p.piece === piece);
  const find = (piece: unknown) => scene.pieces.filter((p) => p.piece === piece);
  const cabins = map.marks.filter((m) => m.kind === 'lift');
  /** The pieces built to measure, by what they are (their cache keys aren't exposed). */
  const isShaft = (p: ScenePiece) =>
    p.at.x > plan.shaft.x0 && p.at.x < plan.shaft.x1 && p.at.z > -0.5 && p.at.z < plan.slab.z1;

  it("is the hot-desking level's scene", () => {
    expect(SCENES['hot-desking']).toBe(hotDeskingScene);
  });

  it('builds the same scene every time', () => {
    expect(hotDeskingScene(map)).toEqual(scene);
  });

  it('reads the slab gap, the shaft and the floors from the map', () => {
    // The slab gap runs right across, between the upper floors and the hot-desk floor.
    expect(plan.slab.x0).toBe(-0.5);
    expect(plan.slab.x1).toBe(map.width - 0.5);
    for (let z = plan.slab.z0 + 0.5; z < plan.slab.z1; z++)
      for (let x = 0; x < map.width; x++) expect(getTile(map, x, z)).toBe('void');
    expect(plan.upper.length).toBe(2);
    const [top, mid] = plan.upper;
    if (!top || !mid) throw new Error('no upper floors');
    expect(top.x1).toBeLessThanOrEqual(plan.shaft.x0);
    expect(mid.x0).toBeGreaterThanOrEqual(plan.shaft.x1);
    expect(plan.lower.z0).toBeGreaterThanOrEqual(plan.slab.z1);
    // The shaft stands right over the hot-desk floor's lift car.
    const car = cabins.filter((c) => c.y > plan.slab.z1);
    expect(car.length).toBeGreaterThan(0);
    for (const c of car) {
      expect(c.x).toBeGreaterThan(plan.shaft.x0);
      expect(c.x).toBeLessThan(plan.shaft.x1);
    }
  });

  it("stands nothing on the level's slab", () => {
    for (const p of scene.pieces) {
      const low = worldPoints(p).filter((v) => v.y - GROUND < WALL_HEIGHT + 0.45);
      const hit = low.find((v) => onSlab(map, v.x, v.z));
      expect(hit, `piece at ${p.at.x.toFixed(2)}, ${p.at.z.toFixed(2)}`).toBeUndefined();
    }
    for (const person of scene.people)
      expect(onSlab(map, person.at.x, person.at.z, -0.3)).toBe(false);
  });

  it('hides no lift cabin on screen', () => {
    expect(cabins.length).toBeGreaterThanOrEqual(3);
    for (const c of cabins) {
      const corners = [
        [-0.5, -0.5],
        [0.5, -0.5],
        [-0.5, 0.5],
        [0.5, 0.5],
      ].map(([dx, dz]) => projectPoint(pose, { x: c.x + (dx ?? 0), y: 0, z: c.y + (dz ?? 0) }));
      const x0 = Math.min(...corners.map((p) => p.x)) + 3;
      const x1 = Math.max(...corners.map((p) => p.x)) - 3;
      const y0 = Math.min(...corners.map((p) => p.y)) + 3;
      const y1 = Math.max(...corners.map((p) => p.y)) - 3;
      for (const p of scene.pieces) {
        const shown = worldPoints(p).map((v) => projectPoint(pose, v));
        const over = shown.filter((s) => s.x > x0 && s.x < x1 && s.y > y0 && s.y < y1);
        expect(
          over.length,
          `cabin ${c.x},${c.y}: piece at ${p.at.x.toFixed(2)}, ${p.at.z.toFixed(2)}`,
        ).toBe(0);
      }
    }
  });

  it('keeps the shaft and the slab gap low, inside their voids', () => {
    const inGap = scene.pieces.filter(
      (p) =>
        p.at.x >= -0.5 &&
        p.at.x <= map.width - 0.5 &&
        p.at.z > plan.slab.z0 &&
        p.at.z <= plan.slab.z1,
    );
    expect(inGap.length).toBeGreaterThan(2);
    for (const p of [...inGap, ...scene.pieces.filter(isShaft)])
      for (const v of worldPoints(p)) {
        // Under the walls in front of them, so the hot-desk floor's car reads.
        expect(v.y - GROUND, `piece at ${p.at.x.toFixed(2)}, ${p.at.z.toFixed(2)}`).toBeLessThan(
          WALL_HEIGHT + 0.46,
        );
        if (v.x > -0.5 && v.x < map.width - 0.5) expect(v.z).toBeLessThan(plan.slab.z1);
      }
  });

  it('keeps its people a tile away from the room, in clear poses', () => {
    expect(scene.people.length).toBeLessThanOrEqual(4);
    for (const person of scene.people) {
      expect(person.pose).not.toBe('idle');
      const x = Math.round(person.at.x);
      const z = Math.round(person.at.z);
      for (let dx = -1; dx <= 1; dx++)
        for (let dz = -1; dz <= 1; dz++) {
          const t = getTile(map, x + dx, z + dz);
          expect(t === null || t === 'void', `person at ${x}, ${z}`).toBe(true);
        }
    }
    // Each has a laptop bag: they're off for the weekend.
    expect(find(hd.laptopBag).length).toBe(scene.people.length);
  });

  it('keeps everything in front of the level low, and nobody there', () => {
    for (const p of scene.pieces)
      for (const v of worldPoints(p)) {
        if (v.z <= front || v.x < -0.5 || v.x > map.width - 0.5) continue;
        expect(v.y - GROUND, `piece at ${p.at.x.toFixed(2)}, ${p.at.z.toFixed(2)}`).toBeLessThan(
          0.6,
        );
      }
    for (const person of scene.people) {
      const inFront = person.at.z > front - 0.3 && person.at.x > -1 && person.at.x < map.width;
      expect(inFront).toBe(false);
    }
  });

  it('keeps the story props out from under the HUD', () => {
    for (const p of scene.pieces) {
      if (isBackdrop(p)) continue;
      const shown = worldPoints(p).map((v) => projectPoint(pose, v));
      for (const [hud, [x0, y0, x1, y1]] of Object.entries(HUD_RECTS)) {
        const under = shown.filter((s) => s.x > x0 && s.x < x1 && s.y > y0 && s.y < y1);
        expect(under.length, `${hud}: piece at ${p.at.x.toFixed(2)}, ${p.at.z.toFixed(2)}`).toBe(0);
      }
    }
  });

  it('builds the cutaway: the cut slab with its floor numbers, the shaft, the cut glass', () => {
    // The floor numbers stand on the cut faces, facing the camera, on screen and clear of the HUD.
    for (const t of ['0', '1', '2']) {
      const num = find(hd.slabNumber(t, hd.FLOOR));
      expect(num.length, t).toBe(1);
      for (const v of worldPoints(num[0] as ScenePiece)) {
        const s = projectPoint(pose, v);
        expect(s.x, t).toBeGreaterThan(0);
        expect(s.x, t).toBeLessThan(1440);
      }
    }
    for (const t of ['1', '2']) {
      const p = find(hd.slabNumber(t, hd.FLOOR))[0] as ScenePiece;
      expect(p.at.z).toBeGreaterThan(plan.slab.z1 - 0.1);
      expect(p.at.x < -0.5 || p.at.x > map.width - 0.5).toBe(true);
    }
    expect(scene.pieces.filter(isShaft).length).toBeGreaterThanOrEqual(1);
    // The motor room behind the shaft, on the core up from the street.
    const motor = scene.pieces.find(
      (p) => p.at.z < -0.5 && p.at.x > plan.shaft.x0 && p.at.x < plan.shaft.x1,
    );
    expect(motor).toBeDefined();
    expect(scene.horizonY).toBeLessThan(-1);
  });

  it('puts the running gags in: Prod at the desk nobody can book, the TO LET tower, a pigeon', () => {
    const desk = find(hd.reservedDesk)[0];
    if (!desk) throw new Error('no reserved desk');
    expect(onSlab(map, desk.at.x, desk.at.z, -0.5)).toBe(false);
    const banner = scene.pieces.find((p) => p.alive === 'sway' && p.at.z < -2);
    if (!banner) throw new Error('no banner');
    for (const v of worldPoints(banner)) {
      const s = projectPoint(pose, v);
      expect(s.x).toBeGreaterThan(700);
      expect(s.x).toBeLessThan(1370);
      expect(s.y).toBeGreaterThan(0);
    }
    const birds = find(pigeon);
    expect(birds.length).toBeGreaterThan(0);
    expect(birds.some((b) => b.alive === 'peck')).toBe(true);
  });

  it('fills the back, both sides and the front', () => {
    const at = scene.pieces.map((p) => p.at);
    expect(at.some((p) => p.x < -1)).toBe(true);
    expect(at.some((p) => p.x > map.width + 0.5)).toBe(true);
    expect(at.some((p) => p.z < -3)).toBe(true);
    expect(at.some((p) => p.z > front)).toBe(true);
    expect(has(hd.coffeeCart)).toBe(true);
    expect(has(canal.cargoBike)).toBe(true);
    for (const g of scene.ground) expect(scene.painters?.[g.kind], g.kind).toBeDefined();
  });

  it('drops the city under the upper floors: rooftops each side, no street up there', () => {
    const drop = scene.horizonY ?? 0;
    expect(drop).toBeLessThanOrEqual(-2.5);
    const roofs = scene.pieces.filter(
      (p) => p.at.z < plan.slab.z0 && Math.abs(p.at.y - (GROUND + drop)) < 1e-6 && p.row === 'far',
    );
    expect(roofs.some((p) => p.at.x < -2)).toBe(true);
    expect(roofs.some((p) => p.at.x > map.width + 1)).toBe(true);
    // No cars, trees or bikes beside the upper floors, and no cycle rack anywhere.
    for (const p of scene.pieces)
      if ([dayCar, cherryTree].includes(p.piece)) expect(p.at.z).toBeGreaterThan(plan.slab.z1);
    expect(find(bike).length).toBe(0);
    // Every street-level patch is in front of the slab and runs off both edges of the frame.
    for (const g of scene.ground.filter((q) => (q.y ?? 0) === 0 && q.kind !== 'pit')) {
      expect(g.z0, g.kind).toBeGreaterThanOrEqual(plan.slab.z0);
      expect(g.x0, g.kind).toBeLessThan(-8);
      expect(g.x1, g.kind).toBeGreaterThan(map.width + 8);
    }
  });

  it('gives every living piece a body, a tile from the room', () => {
    for (const p of scene.pieces.filter((q) => q.alive)) {
      const { body } = p.piece.model(p.variant);
      expect(body.getAttribute('position').count).toBeGreaterThan(0);
      for (let dx = -1; dx <= 1; dx++)
        for (let dz = -1; dz <= 1; dz++) {
          const t = getTile(map, Math.round(p.at.x) + dx, Math.round(p.at.z) + dz);
          expect(t === null || t === 'void', `alive at ${p.at.x}, ${p.at.z}`).toBe(true);
        }
    }
  });

  it('brings no food or drink', () => {
    for (const p of scene.pieces) expect(FOOD.has(p.piece)).toBe(false);
  });

  it('builds its ground', () => {
    const { body } = groundModel(scene);
    expect(body.getAttribute('position').count).toBeGreaterThan(1000);
    body.dispose();
  });

  it('spells its signs in letters it has', () => {
    for (const t of ['TO LET', 'RESERVED', 'LIFT', '0', '1', '2'])
      expect(hd.spellable(t)).toBe(true);
  });
});
