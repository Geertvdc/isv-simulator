import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { type LevelMap, getTile, parseLevelMap } from '../../../sim/level';
import { projectPoint } from '../../projection';
import { WALL_HEIGHT } from '../layout';
import { SCENES } from '.';
import { BANNER, GONDOLA, synergyPlan, synergyScene } from './synergy';
import { scenePose } from './downTheHall';
import { groundModel } from './ground';
import type { ScenePiece } from './types';
import * as bb from '../setDressing/backToBack';
import { pigeon } from '../setDressing/businessPark';
import * as canal from '../setDressing/canal';
import * as suburb from '../setDressing/suburb';
import * as sy from '../setDressing/synergy';

const read = (name: string): LevelMap =>
  parseLevelMap(readFileSync(new URL(`../../../../maps/${name}`, import.meta.url), 'utf8'));
const MAPS: Record<string, LevelMap> = {
  closed: read('level-11-synergy.txt'),
  open: read('level-11-synergy.phase2.txt'),
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

for (const [phase, map] of Object.entries(MAPS))
  describe(`synergyScene (${phase})`, () => {
    const scene = synergyScene(map);
    const front = map.height - 0.5;
    const pose = scenePose(map);
    const plan = synergyPlan(map);
    const find = (piece: unknown) => scene.pieces.filter((p) => p.piece === piece);
    const screen = (p: ScenePiece) => worldPoints(p).map((v) => projectPoint(pose, v));

    it("is the synergy level's scene", () => {
      expect(SCENES.synergy).toBe(synergyScene);
    });

    it('builds the same scene every time', () => {
      expect(synergyScene(map)).toEqual(scene);
    });

    it('reads the back wall, the reception and the corners from the map', () => {
      for (let x = plan.reception.x0 + 0.5; x < plan.reception.x1; x++)
        expect(getTile(map, x, 0), `${x},0`).not.toBe('void');
      expect(getTile(map, plan.reception.x0 - 0.5, 0)).toBe('void');
      expect(plan.reception.z1).toBeLessThan(-0.5);
      expect(plan.corners.length).toBe(2);
      for (const r of plan.corners)
        for (let z = r.z0 + 0.5; z < r.z1; z++)
          for (let x = r.x0 + 0.5; x < r.x1; x++)
            expect(getTile(map, x, z), `${x},${z}`).toBe('void');
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

    it('keeps everything in front of the level low, and nobody there', () => {
      for (const p of scene.pieces)
        for (const v of worldPoints(p)) {
          const inFront = v.z > front && v.x > -0.5 && v.x < map.width - 0.5;
          if (!inFront) continue;
          expect(v.y - GROUND, `piece at ${p.at.x.toFixed(2)}, ${p.at.z.toFixed(2)}`).toBeLessThan(
            sy.FLOOR + 0.6,
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

    it('keeps its people a tile from the room, small, busy and right of the order cards', () => {
      expect(scene.people.length).toBeGreaterThanOrEqual(3);
      expect(scene.people.length).toBeLessThanOrEqual(4);
      expect(new Set(scene.people.map((p) => p.pose)).size).toBe(scene.people.length);
      for (const person of scene.people) {
        expect(person.pose).not.toBe('idle');
        expect(aTileFromRoom(map, person.at.x, person.at.z), `person at ${person.at.x}`).toBe(true);
        expect(person.at.y).toBeCloseTo(GROUND + sy.FLOOR);
        expect(person.grey ?? 0).toBeGreaterThanOrEqual(0.3);
        const head = projectPoint(pose, { x: person.at.x, y: person.at.y + 0.8, z: person.at.z });
        expect(head.x).toBeGreaterThan(690);
      }
    });

    it("puts MONOLITH's entourage in reception: identical suits in action poses, a tile from the room", () => {
      const suits = find(sy.suitFigure).filter((p) => p.variant !== sy.SUIT_POSE.driver);
      expect(suits.length).toBeGreaterThanOrEqual(6);
      expect(new Set(suits.map((p) => p.variant)).size).toBeGreaterThanOrEqual(6);
      for (const s of suits) {
        expect(aTileFromRoom(map, s.at.x, s.at.z)).toBe(true);
        expect(s.at.z).toBeLessThan(plan.reception.z1);
        // Smaller than any player (the players stand about 1.3 high).
        const top = Math.max(...worldPoints(s).map((v) => v.y)) - s.at.y;
        expect(top).toBeLessThan(0.95);
      }
      expect(find(sy.coatRack).length).toBe(1);
      expect(find(sy.briefcaseRow(5)).length).toBe(1);
      // The catering trolleys stand one each side of the speed gates.
      const gates = find(sy.speedGates)[0];
      if (!gates) throw new Error('no gates');
      const trolleys = find(sy.coveredTrolley);
      expect(trolleys.some((t) => t.at.x < gates.at.x)).toBe(true);
      expect(trolleys.some((t) => t.at.x > gates.at.x)).toBe(true);
    });

    it('gives four or more suits an idle: a head that turns, or the whole of them shifting', () => {
      const heads = find(sy.suitHead);
      const bodies = find(sy.suitFigure).filter((p) => p.alive === 'bob');
      expect(heads.length + bodies.length).toBeGreaterThanOrEqual(4);
      for (const h of heads) {
        expect(h.alive).toBe('peck');
        // On a headless figure of the same pose, at its neck.
        const body = find(sy.suitFigure).find(
          (p) =>
            p.at.x === h.at.x && p.at.z === h.at.z && p.variant === sy.SUIT_HEADLESS + h.variant,
        );
        expect(body, `head at ${h.at.x}`).toBeDefined();
        if (body) expect(h.at.y).toBeCloseTo(body.at.y + sy.SUIT_NECK * body.scale[1]);
      }
    });

    it('builds the reception: the welcome screen right of the order cards, both logos, the desk', () => {
      const logos = find(sy.welcomeLogos)[0];
      const panel = find(sy.welcomeScreen)[0];
      if (!logos || !panel) throw new Error('no welcome screen');
      expect(logos.hot).toBe(true);
      for (const s of [...screen(logos), ...screen(panel)]) {
        expect(s.x).toBeGreaterThan(700);
        expect(s.x).toBeLessThan(1370);
        expect(s.y).toBeGreaterThan(0);
      }
      expect(logos.at.z).toBeLessThan(plan.reception.z0 + 0.2);
      for (const t of ['YOTTA', 'MONOLITH', '× EXPLORING SYNERGIES ×', 'VISITORS', 'SYNERGY'])
        expect(sy.spellable(t), t).toBe(true);
      const kinds = [
        sy.welcomeScreen,
        sy.receptionDesk(sy.SCREEN.w - 0.8),
        sy.suitFigure,
        sy.briefcaseRow(5),
        sy.coatRack,
        sy.umbrellaStand,
        sy.coveredTrolley,
        sy.flipChart,
        sy.loafCat,
        sy.waterStation,
        sy.lanyardTable,
        sy.visitorsSign,
        sy.speedGates,
        sy.tallPlant,
        sy.workshopBoard,
        sy.wallClock('15:40'),
      ];
      for (const k of kinds) expect(find(k).length, kinds.indexOf(k).toString()).toBeGreaterThan(0);
    });

    it('puts Segfault asleep on top of the flip chart, findable and right of the order cards', () => {
      const cat = find(sy.loafCat)[0];
      const chart = find(sy.flipChart)[0];
      if (!cat || !chart) throw new Error('no Segfault');
      expect(cat.alive).toBe('purr');
      expect(cat.at.y).toBeCloseTo(chart.at.y + sy.FLIP_TOP);
      expect(Math.hypot(cat.at.x - chart.at.x, cat.at.z - chart.at.z)).toBeLessThan(0.1);
      for (const s of screen(cat)) expect(s.x).toBeGreaterThan(690);
    });

    it('gives every living piece a body, a tile from the room, and enough of them', () => {
      const alive = scene.pieces.filter((q) => q.alive);
      for (const kind of ['spin', 'purr', 'peck', 'blink', 'sway', 'wisp', 'bob'])
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

    it('builds MONOLITH across the river on the right, its helicopter on the roof, clear of the mute button', () => {
      const logo = scene.pieces.find((p) => p.piece === bb.monolithLogo(0.07));
      if (!logo) throw new Error('no MONOLITH');
      expect(logo.hot).toBe(true);
      for (const s of screen(logo)) {
        expect(s.x).toBeGreaterThan(1050);
        expect(s.x).toBeLessThan(1370);
        expect(s.y).toBeGreaterThan(0);
      }
      const rotor = find(sy.rotor)[0];
      const heli = find(sy.helicopter)[0];
      if (!rotor || !heli) throw new Error('no helicopter');
      expect(rotor.alive).toBe('spin');
      for (const s of [...screen(rotor), ...screen(heli)]) {
        expect(s.y).toBeGreaterThan(0);
        expect(s.x).toBeLessThan(1370);
      }
      const beacon = find(bb.beacon).find((p) => p.at.z < -6);
      if (!beacon) throw new Error('no beacon');
      for (const s of screen(beacon)) expect(s.x).toBeLessThan(1370);
    });

    it("parks MONOLITH's convoy far below in view, identical black cars, hazards on, the driver", () => {
      const cars = find(sy.blackCar);
      expect(cars.length).toBeGreaterThanOrEqual(4);
      expect(new Set(cars.map((p) => p.variant)).size).toBe(1);
      for (const car of cars) {
        expect(car.at.y).toBeLessThan(-8);
        for (const s of screen(car)) {
          expect(s.x).toBeGreaterThan(1330);
          expect(s.x).toBeLessThan(1440);
          expect(s.y).toBeLessThan(755);
        }
      }
      expect(find(sy.hazards)[0]?.alive).toBe('blink');
      expect(find(sy.carDoor).length).toBe(1);
      expect(find(sy.suitFigure).some((p) => p.variant === sy.SUIT_POSE.driver)).toBe(true);
    });

    it('fills the corners with setback roofs, pigeons and a flag', () => {
      expect(
        scene.pieces.filter((p) => p.at.y < GROUND && p.at.y > GROUND - 1).length,
      ).toBeGreaterThan(0);
      expect(find(pigeon).filter((p) => p.alive === 'peck').length).toBeGreaterThanOrEqual(2);
      expect(find(sy.yottaFlag)[0]?.alive).toBe('sway');
    });

    it('makes each setback roof a working roof: 4+ props, something moving, low by the room', () => {
      const lift = GROUND + sy.FLOOR - 0.95;
      for (const r of plan.corners) {
        const on = scene.pieces.filter(
          (p) =>
            Math.abs(p.at.y - lift) < 0.5 &&
            p.at.x > r.x0 - 1 &&
            p.at.x < r.x1 + 1 &&
            p.at.z > r.z0 - 0.1 &&
            p.at.z < r.z1 + 0.1,
        );
        const kinds = new Set(on.map((p) => p.piece));
        for (const k of [sy.condenser, sy.condenserFan, sy.satelliteDish])
          expect(kinds.has(k)).toBe(true);
        expect(kinds.size).toBeGreaterThanOrEqual(7);
        expect(on.filter((p) => p.alive === 'spin').length).toBeGreaterThanOrEqual(2);
        // Nothing over 0.6 above the roof within a tile of the room (the flag stands further out).
        for (const p of on)
          for (const v of worldPoints(p)) {
            if (!aTileFromRoom(map, v.x, v.z) && p.piece !== sy.yottaFlag)
              expect(v.y - lift, `piece at ${p.at.x.toFixed(2)}`).toBeLessThan(0.62);
          }
      }
      // MONOLITH's pennant on the right-hand roof only.
      const pennants = find(sy.monolithPennant);
      expect(pennants.length).toBe(1);
      expect(pennants[0]?.alive).toBe('sway');
      expect(pennants[0]?.at.x).toBeGreaterThan(map.width / 2);
    });

    it('parks the gondola low in front, right of centre, well clear of the timer, an arm beside it', () => {
      const g = find(sy.gondola(GONDOLA.len, sy.FLOOR - GONDOLA.lift - 0.02))[0];
      if (!g) throw new Error('no gondola');
      for (const v of worldPoints(g)) expect(v.y - GROUND).toBeLessThan(sy.FLOOR + 0.01);
      expect(g.at.x).toBeGreaterThan(map.width / 2);
      for (const s of screen(g)) expect(s.x).toBeLessThan(1320 - 40);
      expect(scene.pieces.some((p) => p.piece === sy.bmuArm(1.0) && p.at.z > front)).toBe(true);
    });

    it("hangs YOTTA's banner down the façade under the boardroom, ending above the pause hint", () => {
      const b = find(sy.facadeBanner(BANNER.w, BANNER.h))[0];
      if (!b) throw new Error('no banner');
      for (const s of screen(b)) {
        expect(s.x).toBeGreaterThan(690);
        expect(s.x).toBeLessThan(770);
        expect(s.y).toBeLessThan(762);
      }
      for (const t of ['YOTTA', '×', 'MONOLITH']) expect(sy.spellable(t)).toBe(true);
    });

    it('dresses the façade: the floors below, their lit windows hot, the glint, the sun on the parapet', () => {
      expect(find(sy.litWindows(map.width)).every((p) => p.hot)).toBe(true);
      expect(find(sy.litWindows(map.width)).length).toBe(1);
      expect(find(sy.floorsBelow(map.width)).length).toBe(1);
      expect(find(sy.parapetSun)[0]?.hot).toBe(true);
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
