import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { type LevelMap, getTile, parseLevelMap } from '../../../sim/level';
import { parseDraftMap } from '../../../sim/draftMap';
import { projectPoint } from '../../projection';
import { WALL_HEIGHT } from '../layout';
import { basementRoom } from '../rooms/basementRoom';
import { SCENES } from '.';
import { onCallLightWells, onCallScene } from './onCall';
import { scenePose } from './downTheHall';
import { groundModel } from './ground';
import type { ScenePiece } from './types';
import * as basement from '../setDressing/onCall';
import * as canal from '../setDressing/canal';
import * as suburb from '../setDressing/suburb';

const text = (path: string) =>
  readFileSync(new URL(`../../../../${path}`, import.meta.url), 'utf8');

/** The shipped level and the redesign draft: the scene must fit both. */
const MAPS: Record<string, LevelMap> = {
  shipped: parseLevelMap(text('maps/level-06-on-call.txt')),
  draft: parseDraftMap(text('maps/drafts/on-call.txt')),
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

/** The pipes and the duct run the whole foundation wall: backdrop, they may pass under the cards. */
const isBackdrop = (p: ScenePiece) =>
  p.row === 'far' ||
  p.piece === basement.pipeRun(p.piece.size[0]) ||
  p.piece === basement.airDuct(p.piece.size[0]);

/** Food and drink pieces from the other scenes: none of them belong in the basement. */
const FOOD = new Set<unknown>([canal.coffeeVan, canal.kegs, canal.flourSacks, suburb.pizzaPile]);

describe('onCallScene', () => {
  it("is the on-call level's scene", () => {
    expect(SCENES['on-call']).toBe(onCallScene);
  });

  for (const [name, map] of Object.entries(MAPS)) {
    const scene = onCallScene(map);
    const front = map.height - 0.5;
    const pose = scenePose(map);

    it(`builds the same scene every time (${name})`, () => {
      expect(onCallScene(map)).toEqual(scene);
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

    it(`keeps the night cleaner a tile away from the room (${name})`, () => {
      expect(scene.people.map((p) => p.pose)).toEqual(['sipping']);
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
      expect(scene.pieces.some((p) => p.piece === basement.mopDock)).toBe(true);
      expect(scene.pieces.some((p) => p.piece === basement.boiler)).toBe(true);
      expect(scene.pieces.filter((p) => p.piece === basement.bike).length).toBeGreaterThanOrEqual(
        2,
      );
      expect(scene.ground.some((g) => g.kind === 'apron' && g.z0 >= front - 0.01)).toBe(true);
      expect(scene.pieces.length).toBeGreaterThan(40);
    });

    it(`keeps the story props out from under the HUD (${name})`, () => {
      for (const p of scene.pieces) {
        if (isBackdrop(p)) continue;
        const shown = worldPoints(p).map((v) => projectPoint(pose, v));
        for (const [hud, [x0, y0, x1, y1]] of Object.entries(HUD_RECTS)) {
          const under = shown.filter((s) => s.x > x0 && s.x < x1 && s.y > y0 && s.y < y1);
          expect(under.length, `${hud}: piece at ${p.at.x.toFixed(2)}, ${p.at.z.toFixed(2)}`).toBe(
            0,
          );
        }
      }
    });

    it(`puts the running gags in (${name})`, () => {
      const has = (piece: unknown) => scene.pieces.some((p) => p.piece === piece);
      expect(has(basement.launchpadBanner)).toBe(true);
      expect(has(basement.deflatedBalloon)).toBe(true);
      expect(has(basement.sleepingGuard)).toBe(true);
      expect(has(basement.boilerSign)).toBe(true);
      // Segfault, purring on the Room's warmest server.
      const cat = scene.pieces.find((p) => p.piece === basement.segfaultCat);
      const spot = basementRoom(map).segfault;
      expect(cat?.alive).toBe('purr');
      expect(cat?.at.x).toBe(spot?.x);
      expect(cat?.at.y).toBeGreaterThan(WALL_HEIGHT);
    });

    it(`gives every living piece a body and lights its small emitters hot (${name})`, () => {
      const alive = scene.pieces.filter((p) => p.alive);
      expect(alive.map((p) => p.alive)).toEqual(
        expect.arrayContaining(['breathe', 'purr', 'wisp', 'blink']),
      );
      for (const p of alive) {
        const { body } = p.piece.model(p.variant);
        // An empty body throws in `Surroundings` (tintColors).
        expect(body.hasAttribute('position')).toBe(true);
        expect(body.getAttribute('position').count).toBeGreaterThan(0);
      }
      expect(scene.pieces.find((p) => p.piece === basement.boiler)?.hot).toBe(true);
      expect(scene.pieces.find((p) => p.piece === basement.dockLight)?.hot).toBe(true);
    });

    it(`sets the light wells right of the order cards, one with the guard in it (${name})`, () => {
      const wells = onCallLightWells(map);
      expect(wells).toEqual(onCallLightWells(map));
      expect(wells.length).toBeGreaterThanOrEqual(2);
      for (const w of wells) {
        expect(w.at.z).toBeLessThan(-1.5);
        expect(w.at.y - GROUND).toBeGreaterThan(WALL_HEIGHT);
        const left = projectPoint(pose, { x: w.at.x - w.w / 2, y: w.at.y, z: -1.5 });
        const right = projectPoint(pose, { x: w.at.x + w.w / 2, y: w.at.y, z: -1.5 });
        expect(left.x).toBeGreaterThan(690);
        expect(right.x).toBeLessThan(1440);
      }
      const guard = scene.pieces.find((p) => p.piece === basement.sleepingGuard);
      expect(wells.some((w) => guard && Math.abs(guard.at.x - w.at.x) < w.w / 2)).toBe(true);
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

  it('brings the stairs down beside the inbox on both maps', () => {
    for (const map of Object.values(MAPS)) {
      const scene = onCallScene(map);
      const stairs = scene.pieces.find((p) => p.piece.size[1] === basement.STAIR_WIDTH);
      if (!stairs) throw new Error('no stairs');
      const inbox = map.tiles.findIndex((t) => t === 'inbox');
      const ix = inbox % map.width;
      const iz = Math.floor(inbox / map.width);
      expect(Math.hypot(stairs.at.x - ix, stairs.at.z - iz)).toBeLessThan(2.2);
    }
  });

  it("dresses the draft's voids: racks at the back, only low things at the front", () => {
    const map = MAPS.draft as LevelMap;
    const scene = onCallScene(map);
    const inVoid = (p: ScenePiece) =>
      getTile(map, Math.round(p.at.x), Math.round(p.at.z)) === 'void';
    const back = scene.pieces.filter((p) => inVoid(p) && p.at.z < 1);
    const front = scene.pieces.filter((p) => inVoid(p) && p.at.z > map.height - 2);
    expect(back.some((p) => p.piece === basement.spareRack)).toBe(true);
    expect(front.some((p) => p.piece === basement.mopDock)).toBe(true);
    for (const p of front) for (const v of worldPoints(p)) expect(v.y - GROUND).toBeLessThan(0.6);
  });

  it('spells its signs in letters it has', () => {
    for (const t of ['BOILER ROOM', 'NO STORAGE', 'LAUNCHPAD', 'DEMO DAY', 'MOPPY', 'B1'])
      expect(basement.spellable(t)).toBe(true);
  });
});
