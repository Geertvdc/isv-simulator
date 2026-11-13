import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { type LevelMap, getTile, parseLevelMap } from '../../../sim/level';
import { parseDraftMap } from '../../../sim/draftMap';
import { projectPoint } from '../../projection';
import { WALL_HEIGHT } from '../layout';
import { SCENES } from '.';
import { demoDayScene } from './demoDay';
import { scenePose } from './downTheHall';
import { groundModel } from './ground';
import type { ScenePiece } from './types';
import * as stage from '../setDressing/demoDay';
import * as canal from '../setDressing/canal';

const text = (path: string) =>
  readFileSync(new URL(`../../../../${path}`, import.meta.url), 'utf8');

/** The shipped level and the redesign draft: the scene must fit both. */
const MAPS: Record<string, LevelMap> = {
  shipped: parseLevelMap(text('maps/level-05-demo-day.txt')),
  draft: parseDraftMap(text('maps/drafts/demo-day.txt')),
};

const GROUND = -0.463;

/** Every vertex of a placed piece, in the world. */
function worldPoints(
  p: ScenePiece,
  layers: ('body' | 'glow' | 'glass')[] = ['body', 'glow', 'glass'],
): THREE.Vector3[] {
  const model = p.piece.model(p.variant);
  const m = new THREE.Matrix4().compose(
    new THREE.Vector3(p.at.x, p.at.y, p.at.z),
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), p.yaw),
    new THREE.Vector3(...p.scale),
  );
  const out: THREE.Vector3[] = [];
  for (const layer of ['body', 'glow', 'glass'] as const) {
    const g = model[layer];
    const pos = g?.getAttribute('position');
    if (pos && layers.includes(layer))
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

/** Food and drink pieces from the other scenes: none of them belong on this stage. */
const FOOD = new Set<unknown>([canal.coffeeVan, canal.kegs, canal.flourSacks, canal.picnicTable]);

describe('demoDayScene', () => {
  it("is the demo-day level's scene", () => {
    expect(SCENES['demo-day']).toBe(demoDayScene);
  });

  for (const [name, map] of Object.entries(MAPS)) {
    const scene = demoDayScene(map);
    const front = map.height - 0.5;
    const pose = scenePose(map);

    it(`builds the same scene every time (${name})`, () => {
      expect(demoDayScene(map)).toEqual(scene);
    });

    it(`stands nothing on the level's slab (${name})`, () => {
      for (const p of scene.pieces) {
        const low = worldPoints(p).filter((v) => v.y - GROUND < WALL_HEIGHT);
        const hit = low.find((v) => onSlab(map, v.x, v.z));
        expect(hit, `piece at ${p.at.x.toFixed(2)}, ${p.at.z.toFixed(2)}`).toBeUndefined();
      }
      for (const person of scene.people)
        expect(onSlab(map, person.at.x, person.at.z, -0.3)).toBe(false);
    });

    it(`keeps people a tile away from the room (${name})`, () => {
      expect(scene.people.length).toBeGreaterThanOrEqual(3);
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
      expect(at.some((p) => p.z < -0.9)).toBe(true);
      expect(scene.pieces.filter((p) => p.piece === stage.seat).length).toBeGreaterThan(10);
      expect(scene.ground.some((g) => g.kind === 'carpet' && g.z0 > front)).toBe(true);
      expect(scene.pieces.length).toBeGreaterThan(60);
    });

    it(`keeps the story props out from under the HUD (${name})`, () => {
      for (const p of scene.pieces) {
        // The LED wall, its rig and the side screens are the backdrop and may run under the cards.
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

    it(`raises the LED wall behind the back wall, its picture over the walls' tops (${name})`, () => {
      const wall = scene.pieces.find((p) => p.row === 'far' && p.piece.size[1] === 0.5);
      if (!wall) throw new Error('no LED wall');
      // Its face stands just behind the back wall: no gap of floor shows between.
      expect(wall.at.z).toBeLessThan(-0.5);
      expect(wall.at.z).toBeGreaterThan(-0.8);
      const picture = worldPoints(wall, ['glow']);
      expect(Math.min(...picture.map((v) => v.y - GROUND))).toBeGreaterThan(WALL_HEIGHT);
      // On screen it's the hero shape at the top, right of the order cards and left of the mute button.
      const shown = picture.map((v) => projectPoint(pose, v));
      expect(Math.min(...shown.map((s) => s.x))).toBeGreaterThan(690);
      expect(Math.max(...shown.map((s) => s.x))).toBeLessThan(1370);
      expect(Math.min(...shown.map((s) => s.y))).toBeGreaterThan(0);
      expect(
        Math.max(...shown.map((s) => s.y)) - Math.min(...shown.map((s) => s.y)),
      ).toBeGreaterThan(110);
    });

    it(`runs a cable snake to the vision mixer (${name})`, () => {
      const mixer = scene.pieces.find((p) => p.piece === stage.visionMixer);
      if (!mixer) throw new Error('no vision mixer');
      expect(mixer.at.x).toBeGreaterThan(map.width - 0.5);
      const snakes = scene.pieces.filter(
        (p) => p.piece.size[1] === 0.16 && p.piece !== stage.monitorWedge,
      );
      expect(snakes.length).toBeGreaterThanOrEqual(2);
    });

    it(`lights its small emitters hot, and only those (${name})`, () => {
      const hot = scene.pieces.filter((p) => p.hot);
      expect(hot.some((p) => p.piece === stage.liveDot)).toBe(true);
      expect(hot.some((p) => p.piece === stage.countdownClock)).toBe(true);
      // Never the LED wall's picture or the side screens (big lit areas): only the slide's letters.
      const screens = scene.pieces.filter(
        (p) => p.row === 'far' && [0.5, 0.4, 0.3].includes(p.piece.size[1]),
      );
      expect(screens.length).toBeGreaterThanOrEqual(2);
      for (const p of screens) expect(p.hot).toBeUndefined();
      expect(scene.pieces.some((p) => p.alive === 'blink')).toBe(true);
      expect(scene.pieces.some((p) => p.alive === 'wisp')).toBe(true);
    });

    it(`brings no food or drink (${name})`, () => {
      for (const p of scene.pieces) expect(FOOD.has(p.piece)).toBe(false);
    });

    it(`builds its ground (${name})`, () => {
      const { body } = groundModel(scene);
      expect(body.getAttribute('position').count).toBeGreaterThan(1000);
      body.dispose();
    });
  }

  it("runs the ship hatches' feeds along the stage lip on the shipped map", () => {
    const map = MAPS.shipped as LevelMap;
    const scene = demoDayScene(map);
    const front = map.height - 0.5;
    const lip = scene.pieces.filter(
      (p) => p.piece.size[1] === 0.16 && p.at.z > front && p.at.y > GROUND + 0.3,
    );
    expect(lip.length).toBe(1);
  });

  it('dresses the void of the draft', () => {
    const map = MAPS.draft as LevelMap;
    const scene = demoDayScene(map);
    const inVoid = (p: ScenePiece) =>
      getTile(map, Math.round(p.at.x), Math.round(p.at.z)) === 'void';
    expect(scene.pieces.filter(inVoid).length).toBeGreaterThan(8);
  });
});
