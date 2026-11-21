import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { type LevelMap, getTile, parseLevelMap } from '../../../sim/level';
import { projectPoint } from '../../projection';
import { WALL_HEIGHT } from '../layout';
import { SCENES } from '.';
import { backToBackPlan, backToBackScene } from './backToBack';
import { scenePose } from './downTheHall';
import { groundModel } from './ground';
import type { ScenePiece } from './types';
import * as bb from '../setDressing/backToBack';
import { pigeon } from '../setDressing/businessPark';
import * as canal from '../setDressing/canal';
import * as suburb from '../setDressing/suburb';

const MAP: LevelMap = parseLevelMap(
  readFileSync(new URL('../../../../maps/level-10-back-to-back.txt', import.meta.url), 'utf8'),
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

/** Food and drink pieces from the other scenes: none of them belong here. */
const FOOD = new Set<unknown>([canal.coffeeVan, canal.kegs, canal.flourSacks, suburb.pizzaPile]);

describe('backToBackScene', () => {
  const map = MAP;
  const scene = backToBackScene(map);
  const front = map.height - 0.5;
  const pose = scenePose(map);
  const plan = backToBackPlan(map);
  const find = (piece: unknown) => scene.pieces.filter((p) => p.piece === piece);
  const screen = (p: ScenePiece) => worldPoints(p).map((v) => projectPoint(pose, v));

  it("is the back-to-back level's scene", () => {
    expect(SCENES['back-to-back']).toBe(backToBackScene);
  });

  it('builds the same scene every time', () => {
    expect(backToBackScene(map)).toEqual(scene);
  });

  it('reads the notch, the terrace and the corner from the map', () => {
    for (const r of [plan.notch, plan.terrace, ...plan.corners])
      for (let z = r.z0 + 0.5; z < r.z1; z++)
        for (let x = r.x0 + 0.5; x < r.x1; x++)
          expect(getTile(map, x, z), `${x},${z}`).toBe('void');
    expect(plan.notch.z0).toBe(-0.5);
    expect(plan.notch.x1 - plan.notch.x0).toBeGreaterThanOrEqual(3);
    expect(plan.terrace.z1).toBe(front);
    expect(plan.terrace.x0).toBe(-0.5);
    expect(plan.corners.length).toBeGreaterThan(0);
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

  it('keeps everything in front of the level and on the terrace low, and nobody there', () => {
    for (const p of scene.pieces) {
      const onTerrace =
        p.at.x > plan.terrace.x0 && p.at.x < plan.terrace.x1 && p.at.z > plan.terrace.z0;
      // Prod is the one tall thing out there, in the corner by Mom's glass, clear of the stations;
      // the pigeon perches on the rail.
      if (p.piece === bb.prodTree || p.piece === pigeon) continue;
      for (const v of worldPoints(p)) {
        const inFront = v.z > front && v.x > -0.5 && v.x < map.width - 0.5;
        if (!inFront && !onTerrace) continue;
        expect(v.y - GROUND, `piece at ${p.at.x.toFixed(2)}, ${p.at.z.toFixed(2)}`).toBeLessThan(
          bb.FLOOR + 0.6,
        );
      }
    }
    for (const person of scene.people) expect(person.at.z).toBeLessThan(0);
  });

  it('keeps the story props out from under the HUD', () => {
    for (const p of scene.pieces) {
      if (p.row === 'far') continue;
      const shown = screen(p);
      for (const [hud, [x0, y0, x1, y1]] of Object.entries(HUD_RECTS)) {
        const under = shown.filter((s) => s.x > x0 && s.x < x1 && s.y > y0 && s.y < y1);
        expect(under.length, `${hud}: piece at ${p.at.x.toFixed(2)}, ${p.at.z.toFixed(2)}`).toBe(0);
      }
    }
  });

  it('keeps its people a tile from the room, small and busy, in the lobby', () => {
    expect(scene.people.length).toBeGreaterThan(0);
    expect(scene.people.length).toBeLessThanOrEqual(3);
    for (const person of scene.people) {
      expect(person.pose).not.toBe('idle');
      const x = Math.round(person.at.x);
      const z = Math.round(person.at.z);
      for (let dx = -1; dx <= 1; dx++)
        for (let dz = -1; dz <= 1; dz++) {
          const t = getTile(map, x + dx, z + dz);
          expect(t === null || t === 'void', `person at ${x}, ${z}`).toBe(true);
        }
      // On the lobby's floor, and out from under the order cards.
      expect(person.at.y).toBeCloseTo(GROUND + bb.FLOOR);
      const head = projectPoint(pose, { x: person.at.x, y: person.at.y + 0.8, z: person.at.z });
      expect(head.x).toBeGreaterThan(690);
    }
  });

  it('gives every living piece a body, a tile from the room', () => {
    const alive = scene.pieces.filter((q) => q.alive);
    for (const kind of ['spin', 'purr', 'peck', 'blink'])
      expect(
        alive.some((p) => p.alive === kind),
        kind,
      ).toBe(true);
    for (const p of alive) {
      const { body } = p.piece.model(p.variant);
      expect(body.getAttribute('position').count).toBeGreaterThan(0);
      for (let dx = -1; dx <= 1; dx++)
        for (let dz = -1; dz <= 1; dz++) {
          const t = getTile(map, Math.round(p.at.x) + dx, Math.round(p.at.z) + dz);
          expect(t === null || t === 'void', `alive at ${p.at.x}, ${p.at.z}`).toBe(true);
        }
    }
  });

  it('puts the steel letters and the lifts behind the notch, right of the order cards', () => {
    const logo = scene.pieces.find((p) => p.piece === bb.steelLogo('YOTTA', 0.12));
    if (!logo) throw new Error('no logo');
    for (const s of screen(logo)) {
      expect(s.x).toBeGreaterThan(690);
      expect(s.y).toBeGreaterThan(0);
    }
    expect(logo.at.z).toBeLessThan(-0.5);
    expect(logo.at.x).toBeGreaterThan(plan.notch.x0);
    expect(find(bb.liftDoor).length).toBe(2);
    for (const p of [...find(bb.liftDoor), ...find(bb.liftDigits('38'))]) {
      expect(p.at.z).toBeLessThan(-0.5);
      expect(p.hot || p.piece === bb.liftDoor).toBe(true);
    }
    const cat = find(bb.sprawledCat)[0];
    if (!cat) throw new Error('no Segfault');
    expect(cat.alive).toBe('purr');
    expect(cat.at.z).toBeLessThan(-1.4);
  });

  it('builds MONOLITH across the river on the right, big, lit and clear of the mute button', () => {
    const top = (p: ScenePiece) => Math.max(...worldPoints(p).map((v) => v.y));
    const tower = scene.pieces
      .filter((p) => p.at.x > map.width - 2 && p.at.z < -5 && p.at.y < -6)
      .reduce<ScenePiece | undefined>((a, p) => (a && top(a) >= top(p) ? a : p), undefined);
    const logo = scene.pieces.find((p) => p.piece === bb.monolithLogo(0.07));
    if (!logo || !tower) throw new Error('no MONOLITH');
    expect(logo.hot).toBe(true);
    for (const s of screen(logo)) {
      expect(s.x).toBeGreaterThan(1050);
      expect(s.x).toBeLessThan(1370);
      expect(s.y).toBeGreaterThan(0);
    }
    const shown = screen(tower);
    expect(Math.max(...shown.map((s) => s.x)) - Math.min(...shown.map((s) => s.x))).toBeGreaterThan(
      140,
    );
  });

  it('puts the running gags in: Prod, the loft letters, the wagon, a pigeon on the rail', () => {
    const prod = find(bb.prodTree)[0];
    if (!prod) throw new Error('no Prod');
    expect(prod.at.z).toBeGreaterThan(plan.terrace.z0);
    expect(find(bb.tinyWagon).length).toBe(1);
    const wagon = screen(find(bb.tinyWagon)[0] as ScenePiece);
    for (const s of wagon) {
      expect(s.x).toBeGreaterThan(0);
      expect(s.x).toBeLessThan(1440);
      expect(s.y).toBeLessThan(755);
    }
    const loft = scene.pieces.find((p) => p.piece === bb.loftLetters(0.045));
    if (!loft) throw new Error('no loft letters');
    expect(loft.hot).toBe(true);
    for (const s of screen(loft)) expect(s.x).toBeGreaterThan(700);
    expect(find(pigeon).some((p) => p.alive === 'peck')).toBe(true);
    expect(find(bb.condenserFan).filter((p) => p.alive === 'spin').length).toBeGreaterThanOrEqual(
      3,
    );
    expect(find(bb.thermometer).length).toBe(1);
    expect(find(bb.closedBoard).length).toBe(1);
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

  it('spells its signs in letters it has', () => {
    for (const t of ['YOTTA', 'MONOLITH', '38', '38°', 'TERRACE', 'CLOSED', 'HEAT!', 'PROD'])
      expect(bb.spellable(t)).toBe(true);
  });
});
