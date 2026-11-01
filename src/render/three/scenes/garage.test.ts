import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { type LevelMap, getTile, parseLevelMap } from '../../../sim/level';
import { garageRoom } from '../garageRoom';
import { WALL_HEIGHT } from '../layout';
import { type ScenePiece, garageScene } from './garage';
import { groundModel } from './ground';

const read = (path: string) =>
  parseLevelMap(readFileSync(new URL(`../../../../${path}`, import.meta.url), 'utf8'));

/** The shipped garage and the redesign draft: the scene must fit both. */
const MAPS: Record<string, LevelMap> = {
  shipped: read('maps/level-01-garage.txt'),
  draft: read('maps/drafts/garage.txt'),
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

describe('garageScene', () => {
  for (const [name, map] of Object.entries(MAPS)) {
    const scene = garageScene(map);
    const front = map.height - 0.5;

    it(`places the same world every time (${name})`, () => {
      expect(garageScene(map)).toEqual(scene);
    });

    it(`stands nothing on the level's slab (${name})`, () => {
      for (const p of scene.pieces) {
        // Only what stands at wall height or below: the house's eave may hang over the back wall.
        const low = worldPoints(p).filter((v) => v.y - GROUND < WALL_HEIGHT);
        const hit = low.find((v) => onSlab(map, v.x, v.z));
        expect(hit, `piece at ${p.at.x.toFixed(2)}, ${p.at.z.toFixed(2)}`).toBeUndefined();
      }
      for (const person of scene.people)
        expect(onSlab(map, person.at.x, person.at.z, -0.3)).toBe(false);
      for (const [x, z] of scene.tufts) expect(onSlab(map, x, z)).toBe(false);
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
      // People are tall: none stand in front of the level.
      for (const person of scene.people) {
        const inFront = person.at.z > front - 0.3 && person.at.x > -1 && person.at.x < map.width;
        expect(inFront).toBe(false);
      }
    });

    it(`fills both sides, the back and the front (${name})`, () => {
      const at = scene.pieces.map((p) => p.at);
      expect(at.some((p) => p.x < -1.5)).toBe(true);
      expect(at.some((p) => p.x > map.width + 0.5)).toBe(true);
      expect(at.some((p) => p.z < -1)).toBe(true);
      expect(scene.ground.some((g) => g.kind === 'sidewalk' && g.z0 >= front)).toBe(true);
      expect(scene.pieces.length).toBeGreaterThan(30);
    });

    it(`builds its ground (${name})`, () => {
      const { body } = groundModel(scene);
      expect(body.getAttribute('position').count).toBeGreaterThan(1000);
      body.dispose();
    });
  }

  it('moves with the level: the driveway apron reaches past the ship door', () => {
    for (const map of Object.values(MAPS)) {
      const ship = map.tiles.findIndex((t) => t === 'ship') % map.width;
      const apron = garageScene(map).ground.find(
        (g) => g.kind === 'concrete' && g.z0 === map.height - 0.5,
      );
      expect(apron?.x1).toBeGreaterThan(ship + 0.5);
    }
  });

  it('leaves room in the house for the open house door, behind the inbox', () => {
    for (const map of Object.values(MAPS)) {
      const inbox = map.tiles.findIndex((t) => t === 'inbox') % map.width;
      const house = garageScene(map).pieces.find((p) => p.row === 'far' && p.at.z < -1);
      if (!house) throw new Error('no house');
      // The leaf swings to about 0.4 past the back edge, up to the wall top.
      const inLeaf = worldPoints(house).filter(
        (v) =>
          Math.abs(v.x - inbox) < 0.44 &&
          v.z > -0.95 &&
          v.z < -0.5 &&
          v.y - GROUND > 0.03 &&
          v.y - GROUND < WALL_HEIGHT,
      );
      expect(inLeaf).toEqual([]);
    }
  });

  it('runs the apron in front of the closed garage door too', () => {
    for (const map of Object.values(MAPS)) {
      const apron = garageScene(map).ground.find(
        (g) => g.kind === 'concrete' && g.z0 === map.height - 0.5,
      );
      for (const d of garageRoom(map).door) expect(apron?.x1).toBeGreaterThanOrEqual(d.x + 0.5);
    }
  });
});
