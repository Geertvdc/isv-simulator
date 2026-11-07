import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { type LevelMap, getTile, parseLevelMap } from '../../../sim/level';
import { projectPoint } from '../../projection';
import { WALL_HEIGHT } from '../layout';
import { SCENES } from '.';
import { scenePose } from './downTheHall';
import { groundModel } from './ground';
import { seedRoundScene } from './seedRound';
import type { ScenePiece } from './types';
import * as rooftop from '../setDressing/rooftop';
import * as canal from '../setDressing/canal';

const read = (path: string) =>
  parseLevelMap(readFileSync(new URL(`../../../../${path}`, import.meta.url), 'utf8'));

/** The shipped level and the redesign draft: the scene must fit both. */
const MAPS: Record<string, LevelMap> = {
  shipped: read('maps/level-04-seed-round.txt'),
  draft: read('maps/drafts/seed-round.txt'),
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
  legend: [0, 610, 220, 745],
  score: [0, 755, 135, 810],
  timer: [1320, 755, 1440, 810],
  mute: [1370, 0, 1440, 60],
  pause: [600, 765, 840, 810],
};

/** Food and drink pieces from the other scenes: none of them belong on this roof. */
const FOOD = new Set<unknown>([canal.coffeeVan, canal.kegs, canal.flourSacks, canal.picnicTable]);

describe('seedRoundScene', () => {
  it("is the seed-round level's scene", () => {
    expect(SCENES['seed-round']).toBe(seedRoundScene);
  });

  for (const [name, map] of Object.entries(MAPS)) {
    const scene = seedRoundScene(map);
    const front = map.height - 0.5;

    it(`builds the same scene every time (${name})`, () => {
      const build = SCENES['seed-round'] ?? seedRoundScene;
      expect(build(map)).toEqual(build(map));
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
      expect(at.some((p) => p.z < -1)).toBe(true);
      expect(at.some((p) => p.z > front)).toBe(true);
      expect(scene.ground.some((g) => g.kind === 'streetFront' && g.z0 > front)).toBe(true);
      expect(scene.pieces.length).toBeGreaterThan(40);
    });

    it(`keeps the story props out from under the HUD (${name})`, () => {
      const pose = scenePose(map);
      for (const p of scene.pieces) {
        // The parapets are the roof's edge and may run under the HUD; story props may not.
        if (p.row !== 'near' || p.piece.size[1] === rooftop.PARAPET.depth) continue;
        const shown = worldPoints(p).map((v) => projectPoint(pose, v));
        for (const [hud, [x0, y0, x1, y1]] of Object.entries(HUD_RECTS)) {
          const under = shown.filter((s) => s.x > x0 && s.x < x1 && s.y > y0 && s.y < y1);
          expect(under.length, `${hud}: piece at ${p.at.x.toFixed(2)}, ${p.at.z.toFixed(2)}`).toBe(
            0,
          );
        }
      }
    });

    it(`shows the street at the bottom of the frame (${name})`, () => {
      const pose = scenePose(map);
      const street = scene.ground.find((g) => g.kind === 'streetFront');
      if (!street) throw new Error('no street');
      const edge = projectPoint(pose, { x: map.width / 2, y: GROUND, z: street.z0 });
      expect(edge.y).toBeLessThan(VIEW.height - 20);
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

  it('opens the lift door in the core behind a back-edge inbox', () => {
    const map = MAPS.shipped as LevelMap;
    const inbox = map.tiles.findIndex((t) => t === 'inbox') % map.width;
    const core = seedRoundScene(map).pieces.find(
      (p) => p.row === 'far' && p.at.z < -0.5 && p.piece.size[1] === rooftop.CORE.depth,
    );
    if (!core) throw new Error('no core');
    // The core's face stands right behind the back wall: no gap of roof shows.
    expect(core.at.z).toBeGreaterThan(-0.6);
    const glow = core.piece.model(0).glow;
    const pos = glow?.getAttribute('position');
    let lit = 0;
    for (let i = 0; pos && i < pos.count; i++) {
      const x = pos.getX(i) + core.at.x;
      if (Math.abs(x - (inbox + 0.5)) < 0.6 && pos.getZ(i) > 0) lit++;
    }
    expect(lit).toBeGreaterThan(0);
  });

  for (const [name, map] of Object.entries(MAPS)) {
    const scene = seedRoundScene(map);
    const pose = scenePose(map);
    /** The screen box of every vertex of `p`'s layers that passes `keep`. */
    const box = (p: ScenePiece, keep: (v: THREE.Vector3) => boolean = () => true) => {
      const shown = worldPoints(p)
        .filter(keep)
        .map((v) => projectPoint(pose, v));
      return {
        x0: Math.min(...shown.map((s) => s.x)),
        x1: Math.max(...shown.map((s) => s.x)),
        y0: Math.min(...shown.map((s) => s.y)),
        y1: Math.max(...shown.map((s) => s.y)),
      };
    };

    it(`shows the whole crane and its lights in the top of the frame (${name})`, () => {
      const crane = scene.pieces.find(
        (p) => p.row === 'far' && p.piece.size[0] === 1 && p.at.z < -3,
      );
      if (!crane) throw new Error('no crane');
      const lights = scene.pieces.filter((p) => p.piece === rooftop.redLight && p.at.z < -3);
      expect(lights.length).toBe(2);
      // Its foot stands in the street canyon behind the back parapet: what shows is above the roof.
      for (const p of [crane, ...lights]) {
        const b = box(p, (v) => v.y > GROUND + 0.45);
        expect(b.x0).toBeGreaterThan(700);
        expect(b.x1).toBeLessThan(1300);
        expect(b.y0).toBeGreaterThan(5);
        expect(b.y1).toBeLessThan(70);
      }
    });

    it(`keeps GIGACORP clear of the mute button (${name})`, () => {
      const corp = scene.pieces.find(
        (p) => p.row === 'far' && p.piece.size[0] === 2.4 && p.piece.size[1] === 2.4,
      );
      if (!corp) throw new Error('no corporate tower');
      const model = corp.piece.model(0);
      const pos = model.glow?.getAttribute('position');
      const shown = [];
      for (let i = 0; pos && i < pos.count; i++) {
        // The logo's letters and mark: the glow on the front face at the logo's height.
        if (Math.abs(pos.getY(i) - 0.45) > 0.2 || pos.getZ(i) < 0.05) continue;
        shown.push(
          projectPoint(pose, {
            x: pos.getX(i) + corp.at.x,
            y: pos.getY(i) + corp.at.y,
            z: pos.getZ(i) + corp.at.z,
          }),
        );
      }
      expect(shown.length).toBeGreaterThan(0);
      const [x0, , , y1] = HUD_RECTS.mute ?? [0, 0, 0, 0];
      for (const s of shown) expect(s.x < x0 || s.y > y1).toBe(true);
      for (const s of shown) expect(s.x).toBeGreaterThan(1150);
    });

    it(`lights its small emitters hot, and only those (${name})`, () => {
      const hot = scene.pieces.filter((p) => p.hot);
      expect(hot.some((p) => p.piece === rooftop.redLight)).toBe(true);
      expect(hot.some((p) => p.piece === rooftop.logoSign('YOTTA'))).toBe(true);
      // Never the windows: no city block, tower or core is hot.
      for (const p of hot) expect(p.piece.size[1]).toBeLessThan(1.1);
    });
  }

  it('fills the light well of the draft: roof lights and a tree', () => {
    const map = MAPS.draft as LevelMap;
    const scene = seedRoundScene(map);
    const inVoid = (p: ScenePiece) =>
      getTile(map, Math.round(p.at.x), Math.round(p.at.z)) === 'void';
    const voids = map.tiles.filter((t) => t === 'void').length;
    expect(scene.pieces.filter(inVoid).length).toBe(voids);
    expect(scene.pieces.some((p) => inVoid(p) && p.piece === rooftop.planterTree)).toBe(true);
  });
});
