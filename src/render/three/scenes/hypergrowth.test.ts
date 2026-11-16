import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { type LevelMap, getTile, parseLevelMap } from '../../../sim/level';
import { projectPoint } from '../../projection';
import { WALL_HEIGHT } from '../layout';
import { PALETTE } from '../look';
import { SCENES } from '.';
import { hypergrowthPlan, hypergrowthScene } from './hypergrowth';
import { scenePose } from './downTheHall';
import { groundModel } from './ground';
import type { ScenePiece } from './types';
import * as hyper from '../setDressing/hypergrowth';
import { segfaultCat } from '../setDressing/onCall';
import { redLight } from '../setDressing/rooftop';
import * as canal from '../setDressing/canal';
import * as suburb from '../setDressing/suburb';

const MAP: LevelMap = parseLevelMap(
  readFileSync(new URL('../../../../maps/level-08-hypergrowth.txt', import.meta.url), 'utf8'),
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

/** The glass, the shops across the road, the crane tower and the street's cars: backdrop. */
const isBackdrop = (p: ScenePiece) => p.row === 'far';

/** Food and drink pieces from the other scenes: none of them belong here. */
const FOOD = new Set<unknown>([canal.coffeeVan, canal.kegs, canal.flourSacks, suburb.pizzaPile]);

describe('hypergrowthScene', () => {
  const map = MAP;
  const scene = hypergrowthScene(map);
  const front = map.height - 0.5;
  const pose = scenePose(map);
  const plan = hypergrowthPlan(map);
  const has = (piece: unknown) => scene.pieces.some((p) => p.piece === piece);
  const find = (piece: unknown) => scene.pieces.filter((p) => p.piece === piece);
  const cabins = map.marks.filter((m) => m.kind === 'lift');

  it("is the hypergrowth level's scene", () => {
    expect(SCENES.hypergrowth).toBe(hypergrowthScene);
  });

  it('builds the same scene every time', () => {
    expect(hypergrowthScene(map)).toEqual(scene);
  });

  it('reads the post room, the shaft and the landing from the map', () => {
    expect(plan.postRoom).toEqual({ x0: -0.5, x1: 8.5, z0: -0.5, z1: 2.5 });
    expect(plan.shaft).toEqual({ x0: 8.5, x1: 11.5, z0: -0.5, z1: 8.5 });
    expect(plan.landing).toEqual({ x0: 19.5, x1: 21.5, z0: 8.5, z1: 11.5 });
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
    expect(cabins.length).toBe(8);
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

  it('keeps its people a tile away from the room, in clear poses', () => {
    const poses = scene.people.map((p) => p.pose);
    expect(poses.filter((p) => p === 'carrying').length).toBeGreaterThanOrEqual(3);
    expect(scene.people.length).toBeLessThanOrEqual(5);
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

  it('fills the post room: pigeonholes, the franking machine, the trolley, sacks, the sign, desk boxes', () => {
    const inPost = (p: ScenePiece) =>
      p.at.x > plan.postRoom.x0 &&
      p.at.x < plan.postRoom.x1 &&
      p.at.z > plan.back &&
      p.at.z < plan.postRoom.z1;
    for (const piece of [
      hyper.pigeonholes(8),
      hyper.frankingMachine,
      hyper.mailTrolley,
      hyper.mailSacks,
      hyper.postRoomSign,
      hyper.deskBoxesUpright,
      hyper.deskBoxStack,
    ])
      expect(scene.pieces.some((p) => p.piece === piece && inPost(p))).toBe(true);
    // The new starters queue in it with their welcome packs.
    const starters = scene.people.filter(
      (p) => p.at.x > plan.postRoom.x0 && p.at.x < plan.postRoom.x1 && p.at.z < plan.postRoom.z1,
    );
    expect(starters.length).toBeGreaterThanOrEqual(2);
    expect(find(hyper.toteBag).length).toBe(starters.length);
  });

  it('puts Segfault asleep on the lift car, high in the shaft, off every cabin', () => {
    const car = find(hyper.liftCar)[0];
    const cat = find(segfaultCat)[0];
    if (!car || !cat) throw new Error('no lift car or no cat');
    const { shaft } = plan;
    for (const p of [car, cat]) {
      expect(p.at.x).toBeGreaterThan(shaft.x0);
      expect(p.at.x).toBeLessThan(shaft.x1);
    }
    expect(cat.alive).toBe('purr');
    expect(cat.at.y - car.at.y).toBeCloseTo(hyper.LIFT.carH + 0.02);
    expect(car.at.y - GROUND).toBeGreaterThan(1);
    expect(has(hyper.liftFrame(3.05, 2.4, 0.3))).toBe(true);
  });

  it('backs the van up to the loading bay, wholly in the frame, its hazards blinking', () => {
    const van = find(hyper.deliveryVan)[0];
    const hazards = find(hyper.vanHazards)[0];
    if (!van || !hazards) throw new Error('no van');
    expect(van.at.x).toBeLessThan(-0.5);
    const ship = map.tiles.flatMap((t, i) => (t === 'ship' ? [Math.floor(i / map.width)] : []));
    // Its rear (local −x) toward the bay: at the bay's back edge, turned in at the wall.
    const half = 0.98 * van.scale[0];
    const rearX = van.at.x - Math.cos(van.yaw) * half;
    const rearZ = van.at.z + Math.sin(van.yaw) * half;
    expect(Math.abs(rearZ - (Math.min(...ship) - 0.5))).toBeLessThan(0.6);
    expect(rearX).toBeGreaterThan(van.at.x);
    // Van and driver wholly on screen, a few pixels in from the edge, above the legend.
    for (const v of worldPoints(van)) {
      const s = projectPoint(pose, v);
      expect(s.x).toBeGreaterThan(6);
      expect(s.y).toBeGreaterThan(0);
      expect(s.y).toBeLessThan(619);
    }
    const driver = scene.people.find((p) => p.at.x < -0.5 && p.at.z > plan.postRoom.z1 + 1);
    if (!driver) throw new Error('no driver');
    for (const [dx, dy, dz] of [
      [-0.25, 0, -0.25],
      [-0.25, 1.3, 0.25],
      [0.25, 0, 0.25],
    ] as const) {
      const s = projectPoint(pose, {
        x: driver.at.x + dx,
        y: driver.at.y + dy,
        z: driver.at.z + dz,
      });
      expect(s.x).toBeGreaterThan(6);
      expect(s.y).toBeLessThan(619);
    }
    expect(hazards.alive).toBe('blink');
    expect(hazards.hot).toBe(true);
    expect(has(hyper.palletTruck)).toBe(true);
    expect(has(hyper.recyclingCage)).toBe(true);
    expect(has(hyper.wheelieBin)).toBe(true);
  });

  it('puts the running gags in: Prod on the landing, the crane tower almost done', () => {
    const prod = find(hyper.prodTub)[0];
    if (!prod || !plan.landing) throw new Error('no Prod on the landing');
    expect(prod.at.x).toBeGreaterThan(plan.landing.x0);
    expect(prod.at.z).toBeGreaterThan(plan.landing.z0);
    expect(prod.at.z).toBeLessThan(plan.landing.z1);
    const lights = find(redLight);
    expect(lights.length).toBe(2);
    for (const l of lights) {
      expect(l.alive).toBe('blink');
      expect(l.hot).toBe(true);
      const s = projectPoint(pose, l.at);
      expect(s.x).toBeGreaterThan(700);
      expect(s.x).toBeLessThan(1370);
      expect(s.y).toBeGreaterThan(0);
    }
  });

  it('drops the street behind and right of the first floor a storey, its pieces smaller', () => {
    expect(scene.horizonY).toBeCloseTo(-1.2);
    const low = scene.ground.filter((g) => (g.y ?? 0) < -1);
    expect(low.some((g) => g.x0 >= plan.shaft.x1 - 0.01 && g.z1 <= plan.back + 0.31)).toBe(true);
    expect(low.some((g) => g.x1 > plan.right + 1 && g.z1 > front)).toBe(true);
    // The ground floor's streets stay at the slab's foot.
    for (const g of scene.ground.filter((q) => (q.y ?? 0) === 0 && q.kind !== 'pit'))
      expect(
        g.x1 <= plan.right + 0.01 && (g.z0 >= plan.back - 0.01 || g.x1 <= plan.shaft.x1 + 0.01),
        g.kind,
      ).toBe(true);
    const cars = find(hyper.wetCar);
    const down = cars.filter((c) => c.at.y < GROUND - 1);
    expect(down.length).toBeGreaterThanOrEqual(3);
    for (const c of down) expect(c.scale[0]).toBeLessThan(0.7);
    expect(find(hyper.facadeBand(plan.right - plan.shaft.x1, 1.2)).length).toBe(1);
  });

  it('builds the tower across the road almost done, its crane long, clear of the HUD', () => {
    const crane = scene.pieces.find((p) => p.piece === hyper.cityCrane(0.6, 2.6));
    if (!crane) throw new Error('no crane');
    expect(2.6 * crane.scale[0]).toBeGreaterThanOrEqual(2.2);
    for (const v of worldPoints(crane)) {
      const s = projectPoint(pose, v);
      expect(s.x).toBeGreaterThan(690);
      expect(s.x).toBeLessThan(1370);
      expect(s.y).toBeGreaterThan(0);
    }
  });

  it('keeps the balloons few and the boxes muted', () => {
    const balloons = find(hyper.welcomeBalloon).length + find(hyper.heldBalloon).length;
    expect(balloons).toBeGreaterThan(1);
    expect(balloons).toBeLessThanOrEqual(5);
    const lum = (c: number) => new THREE.Color(c).getHSL({ h: 0, s: 0, l: 0 }).l;
    // Darker than every station's colour but the bin's grey.
    for (const [k, c] of Object.entries(PALETTE.station))
      if (k !== 'bin') expect(lum(hyper.BOX), k).toBeLessThan(lum(c));
  });

  it('fills the back, both sides and the front, and the street', () => {
    const at = scene.pieces.map((p) => p.at);
    expect(at.some((p) => p.x < -1)).toBe(true);
    expect(at.some((p) => p.x > map.width + 0.5)).toBe(true);
    expect(at.some((p) => p.z < -2)).toBe(true);
    expect(find(hyper.umbrellaWalker).length).toBeGreaterThanOrEqual(4);
    expect(find(hyper.wetCar).length).toBeGreaterThanOrEqual(4);
    expect(has(hyper.wetFloorSign)).toBe(true);
    expect(has(hyper.umbrellaStand)).toBe(true);
    expect(scene.ground.some((g) => g.kind === 'pit')).toBe(true);
    expect(scene.ground.some((g) => g.kind === 'apron')).toBe(true);
    for (const g of scene.ground) expect(scene.painters?.[g.kind], g.kind).toBeDefined();
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
    for (const t of ['POST ROOM', 'DESK', 'FLAT-PACK', 'LIFT 1'])
      expect(hyper.spellable(t)).toBe(true);
  });
});
