import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { type LevelMap, getTile, parseLevelMap } from '../../../sim/level';
import { projectPoint } from '../../projection';
import { WALL_HEIGHT } from '../layout';
import { SCENES } from '.';
import { groundModel } from './ground';
import { downTheHallScene, scenePose } from './downTheHall';
import type { ScenePiece } from './types';

const read = (path: string) =>
  parseLevelMap(readFileSync(new URL(`../../../../${path}`, import.meta.url), 'utf8'));

/** The shipped level and the redesign draft: the scene must fit both. */
const MAPS: Record<string, LevelMap> = {
  shipped: read('maps/level-03-scale-up.txt'),
  draft: read('maps/drafts/scale-up.txt'),
};

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
    if (!pos) continue;
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

/** The screenshot size the HUD rects are for. */
const VIEW = { width: 1440, height: 810 };

/** Screen rectangles the HUD covers at 1440×810: (x0, y0, x1, y1). */
const HUD_RECTS: Record<string, [number, number, number, number]> = {
  orders: [0, 0, 690, 140],
  legend: [14, 619, 218, 734],
  score: [0, 755, 135, 810],
  timer: [1320, 755, 1440, 810],
  mute: [1370, 0, 1440, 60],
  pause: [600, 765, 840, 810],
};

describe('downTheHallScene', () => {
  it("is the scale-up level's scene", () => {
    expect(SCENES['scale-up']).toBe(downTheHallScene);
  });

  for (const [name, map] of Object.entries(MAPS)) {
    const scene = downTheHallScene(map);
    const front = map.height - 0.5;

    it(`builds the same scene every time (${name})`, () => {
      // Through the registry, the way `Surroundings` builds it.
      const build = SCENES['scale-up'] ?? downTheHallScene;
      expect(build(map)).toEqual(build(map));
    });

    it(`stands nothing on the level's slab (${name})`, () => {
      for (const p of scene.pieces) {
        // Only what stands at wall height or below: a tree's crown may reach over a wall.
        const low = worldPoints(p).filter((v) => v.y - GROUND < WALL_HEIGHT);
        const hit = low.find((v) => onSlab(map, v.x, v.z));
        expect(hit, `piece at ${p.at.x.toFixed(2)}, ${p.at.z.toFixed(2)}`).toBeUndefined();
      }
      for (const person of scene.people)
        expect(onSlab(map, person.at.x, person.at.z, -0.3)).toBe(false);
    });

    it(`keeps people a tile away from the rooms (${name})`, () => {
      for (const person of scene.people) {
        const x = Math.round(person.at.x);
        const z = Math.round(person.at.z);
        for (let dx = -1; dx <= 1; dx++)
          for (let dz = -1; dz <= 1; dz++) {
            const t = getTile(map, x + dx, z + dz);
            expect(t === null || t === 'void', `person at ${x}, ${z}`).toBe(true);
          }
      }
    });

    it(`keeps everything in front of the level low (${name})`, () => {
      for (const p of scene.pieces) {
        for (const v of worldPoints(p)) {
          if (v.z <= front || v.x < -0.5 || v.x > map.width - 0.5) continue;
          expect(v.y - GROUND, `piece at ${p.at.x.toFixed(2)}, ${p.at.z.toFixed(2)}`).toBeLessThan(
            0.6,
          );
        }
      }
      for (const person of scene.people) {
        const inFront = person.at.z > front - 0.3 && person.at.x > -1 && person.at.x < map.width;
        expect(inFront).toBe(false);
      }
    });

    it(`fills both sides, the back and the front (${name})`, () => {
      const at = scene.pieces.map((p) => p.at);
      expect(at.some((p) => p.x < -1.5)).toBe(true);
      expect(at.some((p) => p.x > map.width + 0.5)).toBe(true);
      expect(at.some((p) => p.z < -0.5)).toBe(true);
      expect(at.some((p) => p.z > front)).toBe(true);
      expect(scene.ground.some((g) => g.kind === 'water' && g.z0 > front)).toBe(true);
      expect(scene.pieces.length).toBeGreaterThan(20);
    });

    it(`keeps the story props out from under the HUD (${name})`, () => {
      const pose = scenePose(map);
      // The canal shows: the coping's edge is inside the frame.
      const coping = scene.ground.find((g) => g.kind === 'coping');
      if (!coping) throw new Error('no coping');
      const edge = projectPoint(pose, { x: map.width / 2, y: GROUND, z: coping.z1 });
      expect(edge.y).toBeLessThan(VIEW.height - 20);
      for (const p of scene.pieces) {
        if (p.row !== 'near') continue;
        const shown = worldPoints(p).map((v) => projectPoint(pose, v));
        for (const [hud, [x0, y0, x1, y1]] of Object.entries(HUD_RECTS)) {
          const under = shown.filter((s) => s.x > x0 && s.x < x1 && s.y > y0 && s.y < y1);
          expect(under.length, `${hud}: piece at ${p.at.x.toFixed(2)}, ${p.at.z.toFixed(2)}`).toBe(
            0,
          );
        }
      }
    });

    it(`builds its ground (${name})`, () => {
      const { body } = groundModel(scene);
      expect(body.getAttribute('position').count).toBeGreaterThan(1000);
      body.dispose();
    });
  }

  it('fills the light well of the draft: a tree, a table and string lights', () => {
    const scene = downTheHallScene(MAPS.draft as LevelMap);
    const inVoid = (p: ScenePiece) =>
      getTile(MAPS.draft as LevelMap, Math.round(p.at.x), Math.round(p.at.z)) === 'void';
    expect(scene.pieces.filter(inVoid).length).toBeGreaterThanOrEqual(4);
    expect(scene.ground.filter((g) => g.kind === 'flags').length).toBeGreaterThan(20);
  });

  it('opens the hall door behind a back-edge inbox', () => {
    for (const map of Object.values(MAPS)) {
      const inbox = map.tiles.findIndex((t) => t === 'inbox') % map.width;
      const wall = downTheHallScene(map).pieces.find((p) => p.row === 'far' && p.at.z < -0.5);
      if (!wall) throw new Error('no factory wall');
      // Nothing in the doorway behind the inbox, up to the wall top: the door can swing in.
      const inDoor = worldPoints(wall).filter(
        (v) =>
          Math.abs(v.x - (inbox + 0.5)) < 0.4 &&
          v.z > -0.95 &&
          v.z < -0.57 &&
          v.y - GROUND > 0.03 &&
          v.y - GROUND < WALL_HEIGHT,
      );
      expect(inDoor).toEqual([]);
    }
  });
});
