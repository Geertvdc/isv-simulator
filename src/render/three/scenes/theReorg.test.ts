import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { type LevelMap, getTile, parseLevelMap } from '../../../sim/level';
import { projectPoint } from '../../projection';
import { WALL_HEIGHT } from '../layout';
import { SCENES } from '.';
import { MONO_PX, SETBACK, reorgPlan, theReorgScene } from './theReorg';
import { scenePose } from './downTheHall';
import { groundModel } from './ground';
import type { ScenePiece } from './types';
import * as bb from '../setDressing/backToBack';
import { pigeon } from '../setDressing/businessPark';
import * as canal from '../setDressing/canal';
import * as suburb from '../setDressing/suburb';
import * as sy from '../setDressing/synergy';
import * as re from '../setDressing/theReorg';

const read = (name: string): LevelMap =>
  parseLevelMap(readFileSync(new URL(`../../../../maps/${name}`, import.meta.url), 'utf8'));
const MAPS: Record<string, LevelMap> = {
  silos: read('level-12-the-reorg.txt'),
  'open plan': read('level-12-the-reorg.phase2.txt'),
  matrix: read('level-12-the-reorg.phase3.txt'),
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

/** Whether every tile within one of (x, z) is off the level (void or outside the map). */
function aTileFromRoom(map: LevelMap, x: number, z: number): boolean {
  for (let dx = -1; dx <= 1; dx++)
    for (let dz = -1; dz <= 1; dz++) {
      const t = getTile(map, Math.round(x) + dx, Math.round(z) + dz);
      if (t !== null && t !== 'void') return false;
    }
  return true;
}

/**
 * Screen rectangles the HUD covers at 1440×810: (x0, y0, x1, y1). Kept in
 * step with the scene's, and with `HUD_TOP_3D` in `ThreeRoundRenderer.ts`.
 */
const HUD_RECTS: Record<string, [number, number, number, number]> = {
  orders: [0, 0, 690, 140],
  legend: [14, 619, 218, 734],
  score: [0, 755, 135, 810],
  timer: [1320, 755, 1440, 810],
  mute: [1370, 0, 1440, 60],
  pause: [600, 765, 840, 810],
};

/** Food and drink pieces from the other scenes: none of them belong here. */
const FOOD = new Set<unknown>([canal.coffeeVan, canal.kegs, canal.flourSacks, suburb.pizzaPile]);

describe('theReorgScene', () => {
  it("is the reorg level's scene", () => {
    expect(SCENES['the-reorg']).toBe(theReorgScene);
  });

  it('builds the same world for every floor plan (only the walls inside move)', () => {
    const [a, ...rest] = Object.values(MAPS).map(theReorgScene);
    for (const s of rest) expect(s).toEqual(a);
  });
});

for (const [phase, map] of Object.entries(MAPS))
  describe(`theReorgScene (${phase})`, () => {
    const scene = theReorgScene(map);
    const front = map.height - 0.5;
    const pose = scenePose(map);
    const plan = reorgPlan(map);
    const find = (piece: unknown) => scene.pieces.filter((p) => p.piece === piece);
    const one = (piece: unknown) => {
      const p = find(piece)[0];
      if (!p) throw new Error('missing piece');
      return p;
    };
    const screen = (p: ScenePiece) => worldPoints(p).map((v) => projectPoint(pose, v));

    it('builds the same scene every time', () => {
      expect(theReorgScene(map)).toEqual(scene);
    });

    it('reads the back wall, the staging area, the front corners and the stem from the map', () => {
      for (let x = plan.staging.x0 + 0.5; x < plan.staging.x1; x++)
        expect(getTile(map, x, 0), `${x},0`).not.toBe('void');
      expect(plan.staging.z1).toBeLessThan(-0.5);
      expect(plan.corners.length).toBe(2);
      for (const r of plan.corners) {
        expect(r.z0).toBeGreaterThan(0.5);
        for (let z = r.z0 + 0.5; z < r.z1; z++)
          for (let x = r.x0 + 0.5; x < r.x1; x++)
            expect(getTile(map, x, z), `${x},${z}`).toBe('void');
      }
      for (let x = plan.stem.x0 + 0.5; x < plan.stem.x1; x++)
        expect(getTile(map, x, map.height - 1)).not.toBe('void');
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

    it('keeps everything in front of the level and on the corner roofs low, and nobody there', () => {
      const corners = plan.corners;
      const inCorner = (x: number, z: number) =>
        corners.some((r) => x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1);
      for (const p of scene.pieces)
        for (const v of worldPoints(p)) {
          const inFront = v.z > front && v.x > -0.5 && v.x < map.width - 0.5;
          if (!inFront && !inCorner(v.x, v.z)) continue;
          expect(v.y - GROUND, `piece at ${p.at.x.toFixed(2)}, ${p.at.z.toFixed(2)}`).toBeLessThan(
            re.FLOOR + 0.6,
          );
        }
      for (const person of scene.people) expect(person.at.z).toBeLessThan(0);
    });

    it('keeps the story props out from under the HUD', () => {
      for (const p of scene.pieces) {
        if (p.row === 'far') continue;
        const shown = screen(p);
        for (const [hud, [x0, y0, x1, y1]] of Object.entries(HUD_RECTS)) {
          const under = shown.filter((s) => s.x > x0 && s.x < x1 && s.y > y0 && s.y < y1);
          expect(under.length, `${hud}: piece at ${p.at.x.toFixed(2)}, ${p.at.z.toFixed(2)}`).toBe(
            0,
          );
        }
      }
    });

    it('keeps its people in the staging area: a tile from the room, small, busy, right of the order cards', () => {
      expect(scene.people.length).toBeGreaterThanOrEqual(5);
      for (const person of scene.people) {
        expect(person.pose).not.toBe('idle');
        expect(aTileFromRoom(map, person.at.x, person.at.z), `person at ${person.at.x}`).toBe(true);
        expect(person.at.z).toBeLessThan(plan.staging.z1);
        expect(person.at.y).toBeCloseTo(GROUND + re.FLOOR);
        expect(person.grey ?? 0).toBeGreaterThanOrEqual(0.3);
        const head = projectPoint(pose, { x: person.at.x, y: person.at.y + 0.8, z: person.at.z });
        expect(head.x).toBeGreaterThan(690);
        expect(head.x).toBeLessThan(1370);
      }
      const poses = new Set(scene.people.map((p) => p.pose));
      for (const p of ['carrying', 'mowing', 'phoning', 'chatting', 'sipping'] as const)
        expect(poses.has(p), p).toBe(true);
    });

    it('swaps the logo: the new yotta lit and swinging on the gantry, right of the order cards, the old one coming off', () => {
      const sign = one(re.newSign);
      const g = one(re.gantry);
      expect(sign.hot).toBe(true);
      expect(sign.alive).toBe('sway');
      expect(sign.at.x).toBeCloseTo(g.at.x);
      expect(sign.at.y).toBeCloseTo(g.at.y + re.GANTRY.beam - re.GANTRY.hook);
      for (const s of [...screen(sign), ...screen(g)]) {
        expect(s.x).toBeGreaterThan(700);
        expect(s.x).toBeLessThan(1370);
        expect(s.y).toBeGreaterThan(0);
        expect(s.y).toBeLessThan(175);
      }
      const old = one(re.oldLogo);
      for (const s of screen(old)) expect(s.x).toBeGreaterThan(700);
      expect(one(re.hangingO).alive).toBe('sway');
      expect(find(re.wrappedY).length).toBe(1);
      expect(find(re.stepladder).length).toBe(1);
    });

    it('carries the full stop in separately, between two removal men at chest height', () => {
      const dot = one(re.fullStop);
      expect(dot.hot).toBe(true);
      const carriers = scene.people.filter((p) => p.pose === 'carrying');
      expect(carriers.length).toBe(2);
      const [a, b] = carriers as [(typeof carriers)[0], (typeof carriers)[0]];
      expect((a.at.x + b.at.x) / 2).toBeCloseTo(dot.at.x);
      expect(a.at.z).toBeCloseTo(dot.at.z);
      // Facing each other.
      expect(Math.sin(a.yaw) * Math.sign(b.at.x - a.at.x)).toBeGreaterThan(0.9);
      expect(Math.sin(b.yaw) * Math.sign(a.at.x - b.at.x)).toBeGreaterThan(0.9);
    });

    it('pushes a partition trolley with a man at its handle', () => {
      const t = one(re.partitionTrolley);
      const pusher = scene.people.find((p) => p.pose === 'mowing');
      if (!pusher) throw new Error('no pusher');
      expect(pusher.at.z).toBeCloseTo(t.at.z);
      // The handle (its −x end, turned round) a reach in front of him.
      const handle = t.at.x + re.TROLLEY_HANDLE_X * Math.cos(t.yaw);
      expect(Math.abs(pusher.at.x - handle)).toBeCloseTo(0.27);
    });

    it('stages the move: 12+ distinct props behind the back wall, Prod on its dolly', () => {
      const behind = scene.pieces.filter(
        (p) => p.at.z < plan.staging.z1 && p.at.z > plan.staging.z0 - 0.1 && p.row === 'near',
      );
      expect(new Set(behind.map((p) => p.piece)).size).toBeGreaterThanOrEqual(12);
      const prod = one(bb.prodTree);
      const dolly = one(re.prodDolly);
      const stickers = one(re.moveStickers);
      expect(prod.at.y).toBeCloseTo(dolly.at.y + re.DOLLY_TOP);
      expect(stickers.at).toEqual(prod.at);
      for (const k of [
        re.crateStack,
        re.rollCage,
        re.partitionTrolley,
        re.palletTruck,
        re.bubbleRolls,
        re.coffeeTrolley,
        re.laptopCrate,
        re.moveSign,
      ])
        expect(behind.some((p) => p.piece === k)).toBe(true);
      for (const t of ['MOVE', '3 OF 3', 'SILO', 'YOTTA', 'MONOLITH'])
        expect(re.spellable(t), t).toBe(true);
    });

    it('melts MONOLITH down across the river: its sign broken and clear of the mute button, windows dark, staff out, a van, the helicopter leaving', () => {
      const logo = one(re.brokenLogo(MONO_PX));
      expect(logo.hot).toBe(true);
      for (const s of screen(logo)) {
        expect(s.x).toBeGreaterThan(1250);
        expect(s.x).toBeLessThan(1440);
        expect(s.y).toBeGreaterThan(60);
      }
      expect(one(re.danglingO(MONO_PX)).alive).toBe('sway');
      expect(find(re.darkWindows(3.9, 2.4, -1.3 + 9.6)).length).toBe(1);
      const crowds = find(re.tinyCrowd(14, 1.4, 0));
      expect(crowds.length).toBe(1);
      expect(find(re.monoVan).length).toBe(1);
      const heli = one(sy.helicopter);
      const tower = one(bb.monolithHQ(3.9, 2.4, -1.3 + 9.6));
      expect(heli.at.y).toBeGreaterThan(GROUND - 1.3 + 0.5);
      expect(Math.abs(heli.at.x - tower.at.x)).toBeLessThan(2);
      expect(one(sy.rotor).alive).toBe('spin');
      for (const s of screen(heli)) if (s.y < 60) expect(s.x).toBeLessThan(1370);
    });

    it('unloads removal lorries far below on the left, in view, their beacons blinking', () => {
      const lorries = find(re.removalLorry);
      expect(lorries.length).toBe(2);
      for (const l of lorries) {
        expect(l.at.y).toBeLessThan(-8);
        expect(l.at.x).toBeLessThan(-2);
        for (const s of screen(l)) {
          expect(s.x).toBeGreaterThan(0);
          expect(s.y).toBeGreaterThan(140);
        }
      }
      expect(find(re.lorryLight).every((p) => p.alive === 'blink' && p.hot)).toBe(true);
    });

    it('makes each front corner a setback roof a storey down: the partition graveyard, crates, condensers, pigeons', () => {
      const lift = GROUND + re.FLOOR - SETBACK;
      for (const r of plan.corners) {
        const on = scene.pieces.filter(
          (p) =>
            Math.abs(p.at.y - lift) < 0.5 &&
            p.at.x > r.x0 - 0.1 &&
            p.at.x < r.x1 + 0.1 &&
            p.at.z > r.z0 - 0.1 &&
            p.at.z < r.z1 + 0.1,
        );
        const kinds = new Set(on.map((p) => p.piece));
        expect(kinds.has(re.panelGraveyard(2))).toBe(true);
        expect(kinds.has(sy.setbackRoof(r.x1 - r.x0 - 0.04, r.z1 - r.z0 - 0.04))).toBe(true);
        expect(kinds.size).toBeGreaterThanOrEqual(5);
      }
      expect(find(pigeon).filter((p) => p.alive === 'peck').length).toBeGreaterThanOrEqual(2);
      expect(find(sy.condenserFan).filter((p) => p.alive === 'spin').length).toBeGreaterThanOrEqual(
        1,
      );
    });

    it('gives every living piece a body, a tile from the room, and enough of them', () => {
      const alive = scene.pieces.filter((q) => q.alive);
      for (const kind of ['spin', 'peck', 'blink', 'sway', 'wisp', 'bob'])
        expect(
          alive.some((p) => p.alive === kind),
          kind,
        ).toBe(true);
      expect(alive.length + scene.people.length).toBeGreaterThanOrEqual(8);
      for (const p of alive) {
        const { body } = p.piece.model(p.variant);
        expect(body.getAttribute('position').count).toBeGreaterThan(0);
        expect(aTileFromRoom(map, p.at.x, p.at.z), `alive at ${p.at.x}, ${p.at.z}`).toBe(true);
      }
    });

    it('drops the city far below and fills both sides, the back and the front', () => {
      expect(scene.horizonY).toBeLessThanOrEqual(-6);
      const at = scene.pieces.map((p) => p.at);
      expect(at.some((p) => p.x < -3)).toBe(true);
      expect(at.some((p) => p.x > map.width + 2)).toBe(true);
      expect(at.some((p) => p.z < -8)).toBe(true);
      for (const g of scene.ground) {
        expect(scene.painters?.[g.kind], g.kind).toBeDefined();
        expect(g.y).toBe(scene.horizonY);
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
  });
