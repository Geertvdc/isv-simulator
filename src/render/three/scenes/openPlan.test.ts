import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { type LevelMap, getTile, parseLevelMap } from '../../../sim/level';
import { fitCamera3d, projectPoint, roundInsets } from '../../projection';
import { FRONT_WALL_HEIGHT, WALL_HEIGHT, levelBox } from '../layout';
import { courierVan, parkHedge } from '../setDressing/businessPark';
import { SCENES } from '.';
import { groundModel } from './ground';
import { openPlanScene } from './openPlan';
import type { ScenePiece } from './types';

const read = (path: string) =>
  parseLevelMap(readFileSync(new URL(`../../../../${path}`, import.meta.url), 'utf8'));

/** The shipped level and the redesign draft: the scene must fit both. */
const MAPS: Record<string, LevelMap> = {
  shipped: read('maps/level-02-open-plan.txt'),
  draft: read('maps/drafts/open-plan.txt'),
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

/** The screenshot size, and the camera framing `ThreeRoundRenderer.fit` uses for it. */
const VIEW = { width: 1440, height: 810 };

/** Screen rectangles the HUD covers at 1440×810: (x0, y0, x1, y1). */
const HUD_RECTS: Record<string, [number, number, number, number]> = {
  orders: [0, 0, 460, 140],
  legend: [14, 619, 218, 734],
  score: [0, 755, 135, 810],
  timer: [1320, 755, 1440, 810],
  mute: [1370, 0, 1440, 60],
  pause: [600, 765, 840, 810],
};

/** The park's boundary hedge may run under the HUD; story props may not. */
const BOUNDARY = new Set([parkHedge]);

const poseFor = (map: LevelMap) => fitCamera3d(levelBox(map), VIEW, roundInsets(VIEW));

describe('openPlanScene', () => {
  it("is the open-plan level's scene", () => {
    expect(SCENES['open-plan']).toBe(openPlanScene);
  });

  for (const [name, map] of Object.entries(MAPS)) {
    const scene = openPlanScene(map);
    const front = map.height - 0.5;

    it(`places the same world every time (${name})`, () => {
      expect(openPlanScene(map)).toEqual(scene);
    });

    it(`stands nothing on the level's slab (${name})`, () => {
      for (const p of scene.pieces) {
        // Only what stands at wall height or below: the block's coping may overhang the back wall.
        const low = worldPoints(p).filter((v) => v.y - GROUND < WALL_HEIGHT);
        const hit = low.find((v) => onSlab(map, v.x, v.z));
        expect(hit, `piece at ${p.at.x.toFixed(2)}, ${p.at.z.toFixed(2)}`).toBeUndefined();
      }
      for (const person of scene.people)
        expect(onSlab(map, person.at.x, person.at.z, -0.3)).toBe(false);
    });

    it(`keeps everything in front of the level low (${name})`, () => {
      const pose = poseFor(map);
      for (const p of scene.pieces) {
        for (const v of worldPoints(p)) {
          if (v.z <= front || v.x < -0.5 || v.x > map.width - 0.5) continue;
          const at = `piece at ${p.at.x.toFixed(2)}, ${p.at.z.toFixed(2)}`;
          // The strip right in front (the walk, the kerb, the bay heads): low things only.
          if (v.z < front + 1.0) expect(v.y - GROUND, at).toBeLessThan(0.6);
          // Further out (the van): nothing reaches up over the level's front edge on screen.
          const edge = projectPoint(pose, {
            x: v.x,
            y: GROUND + FRONT_WALL_HEIGHT + 0.46,
            z: front,
          });
          expect(projectPoint(pose, v).y, at).toBeGreaterThan(edge.y + 8);
        }
      }
      // People are tall: none stand in front of the level.
      for (const person of scene.people) {
        const inFront = person.at.z > front - 0.3 && person.at.x > -1 && person.at.x < map.width;
        expect(inFront).toBe(false);
      }
    });

    it(`keeps its people a tile from the room (${name})`, () => {
      for (const person of scene.people) {
        const dx = Math.max(-0.5 - person.at.x, person.at.x - (map.width - 0.5), 0);
        const dz = Math.max(-0.5 - person.at.z, person.at.z - front, 0);
        expect(Math.hypot(dx, dz)).toBeGreaterThanOrEqual(0.95);
      }
    });

    it(`keeps its living props a tile from the room, a few of them (${name})`, () => {
      const alive = scene.pieces.filter((p) => p.alive !== undefined);
      expect(alive.length).toBeGreaterThanOrEqual(4);
      for (const p of alive) {
        const dx = Math.max(-0.5 - p.at.x, p.at.x - (map.width - 0.5), 0);
        const dz = Math.max(-0.5 - p.at.z, p.at.z - front, 0);
        expect(Math.hypot(dx, dz), `${p.alive} at ${p.at.x}, ${p.at.z}`).toBeGreaterThanOrEqual(
          0.95,
        );
      }
    });

    it(`fills both sides, the back and the front (${name})`, () => {
      const at = scene.pieces.map((p) => p.at);
      expect(at.some((p) => p.x < -1.5)).toBe(true);
      expect(at.some((p) => p.x > map.width + 0.5)).toBe(true);
      expect(at.some((p) => p.z < -0.5)).toBe(true);
      expect(scene.ground.some((g) => g.kind === 'kerb' && g.z0 >= front)).toBe(true);
      expect(scene.pieces.length).toBeGreaterThan(30);
    });

    it(`backs the courier van up to the ship door (${name})`, () => {
      const ship = map.tiles.findIndex((t) => t === 'ship');
      const van = scene.pieces.find((p) => p.piece === courierVan);
      if (!van) throw new Error('no van');
      const sx = ship % map.width;
      const sz = Math.floor(ship / map.width);
      // Off the door's middle by under a tile, so its back still meets the hatching.
      if (sz === map.height - 1) expect(Math.abs(van.at.x - (sx + 0.5))).toBeLessThan(1);
      else expect(Math.abs(van.at.z - sz)).toBeLessThan(1);
    });

    it(`keeps the story props out from under the HUD (${name})`, () => {
      const pose = poseFor(map);
      for (const p of scene.pieces) {
        if (p.row !== 'near' || BOUNDARY.has(p.piece)) continue;
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

  it('leaves the lobby open behind a back-wall inbox', () => {
    const map = MAPS.shipped;
    if (!map) throw new Error('no map');
    const inbox = map.tiles
      .map((t, i) => (t === 'inbox' ? i % map.width : -1))
      .filter((x) => x >= 0);
    const block = openPlanScene(map).pieces.find((p) => p.row === 'far' && p.at.z < -0.5);
    if (!block) throw new Error('no block');
    const x0 = Math.min(...inbox) - 0.45;
    const x1 = Math.max(...inbox) + 0.45;
    // Nothing solid in the opening's front 0.4, below its head, but the lobby's own walls.
    const inside = worldPoints(block).filter(
      (v) =>
        v.x > x0 &&
        v.x < x1 &&
        v.z > -0.95 &&
        v.z < -0.58 &&
        v.y - GROUND > 0.05 &&
        v.y - GROUND < 1.2,
    );
    expect(inside).toEqual([]);
  });
});
