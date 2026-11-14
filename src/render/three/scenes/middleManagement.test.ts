import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { type LevelMap, getTile, parseLevelMap } from '../../../sim/level';
import { parseDraftMap } from '../../../sim/draftMap';
import { projectPoint } from '../../projection';
import { WALL_HEIGHT } from '../layout';
import { managerOffice } from '../rooms/managerOffice';
import { SCENES } from '.';
import { middleManagementScene, midRiseOutline } from './middleManagement';
import { scenePose } from './downTheHall';
import { groundModel } from './ground';
import type { ScenePiece } from './types';
import * as mid from '../setDressing/midRise';
import { segfaultCat } from '../setDressing/onCall';
import { redLight } from '../setDressing/rooftop';
import * as canal from '../setDressing/canal';
import * as suburb from '../setDressing/suburb';
import * as rooftop from '../setDressing/rooftop';

const text = (path: string) =>
  readFileSync(new URL(`../../../../${path}`, import.meta.url), 'utf8');

/** The shipped level and the redesign draft: the scene must fit both. */
const MAPS: Record<string, LevelMap> = {
  shipped: parseLevelMap(text('maps/level-07-middle-management.txt')),
  draft: parseDraftMap(text('maps/drafts/middle-management.txt')),
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

/** The curtain wall, the office's glass, the skyline and the street far below: backdrop, they may pass under the cards. */
const isBackdrop = (p: ScenePiece) => p.row === 'far';

/** Food and drink pieces from the other scenes: none of them belong on the floor. */
const FOOD = new Set<unknown>([canal.coffeeVan, canal.kegs, canal.flourSacks, suburb.pizzaPile]);
/** 3-2's joke (the welcome balloons) stays out of 3-1. */
const LATER = new Set<unknown>([rooftop.balloons]);

describe('middleManagementScene', () => {
  it("is the middle-management level's scene", () => {
    expect(SCENES['middle-management']).toBe(middleManagementScene);
  });

  for (const [name, map] of Object.entries(MAPS)) {
    const scene = middleManagementScene(map);
    const front = map.height - 0.5;
    const pose = scenePose(map);
    const has = (piece: unknown) => scene.pieces.some((p) => p.piece === piece);

    it(`builds the same scene every time (${name})`, () => {
      expect(middleManagementScene(map)).toEqual(scene);
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

    it(`keeps its few people a tile away from the room, in clear poses (${name})`, () => {
      const poses = scene.people.map((p) => p.pose);
      expect(poses).toContain('phoning');
      expect(scene.people.length).toBeLessThanOrEqual(3);
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

    it(`keeps reception's people and story right of the order cards (${name})`, () => {
      for (const person of scene.people) {
        const head = projectPoint(pose, { ...person.at, y: person.at.y + 1.4 });
        if (head.y < 160) expect(head.x).toBeGreaterThan(700);
      }
      for (const piece of [mid.prodPot, mid.waitingVisitor]) {
        const p = scene.pieces.find((q) => q.piece === piece);
        if (!p) throw new Error('missing a reception piece');
        expect(projectPoint(pose, p.at).x).toBeGreaterThan(690);
      }
    });

    it(`fills the back, both sides and the front (${name})`, () => {
      const at = scene.pieces.map((p) => p.at);
      expect(at.some((p) => p.x < -1)).toBe(true);
      expect(at.some((p) => p.x > map.width + 0.5)).toBe(true);
      expect(at.some((p) => p.z < -2)).toBe(true);
      expect(has(mid.releaseBoard)).toBe(true);
      expect(scene.pieces.filter((p) => p.piece === mid.cherryTree).length).toBeGreaterThan(10);
      expect(has(mid.bus)).toBe(true);
      expect(has(mid.busStop)).toBe(true);
      expect(has(mid.printer)).toBe(true);
      expect(has(mid.cradle)).toBe(true);
      expect(scene.pieces.some((p) => [mid.liftBank(1), mid.liftBank(2)].includes(p.piece))).toBe(
        true,
      );
      expect(scene.ground.some((g) => g.kind === 'stone' && g.z0 >= front - 0.01)).toBe(true);
      expect(scene.ground.some((g) => g.kind.startsWith('arrows'))).toBe(true);
      expect(scene.pieces.length).toBeGreaterThan(50);
    });

    it(`puts the release board at the ship hatch, low (${name})`, () => {
      const board = scene.pieces.find((p) => p.piece === mid.releaseBoard);
      if (!board) throw new Error('no release board');
      const ship = map.tiles.flatMap((t, i) => (t === 'ship' ? [i % map.width] : []));
      const sx = ship.reduce((a, b) => a + b, 0) / ship.length;
      expect(Math.abs(board.at.x - sx)).toBeLessThan(0.6);
      expect(board.at.z).toBeGreaterThan(front);
      expect(board.hot).toBe(true);
    });

    it(`puts the running gags in (${name})`, () => {
      expect(has(mid.prodPot)).toBe(true);
      expect(has(mid.waitingVisitor)).toBe(true);
      // The crane tower, right of the order cards; its crane's lights in the frame, below the
      // curtain wall's spandrel band (so they aren't hidden behind it).
      const tower = scene.pieces.find((p) => p.piece.size[0] === 1 && p.piece.size[1] === 0.5);
      if (!tower) throw new Error('no crane tower');
      expect(projectPoint(pose, tower.at).x).toBeGreaterThan(700);
      const band = projectPoint(pose, {
        x: tower.at.x,
        y: GROUND + mid.CURTAIN.floor,
        z: midRiseOutline(map).back,
      }).y;
      const crane = scene.pieces.filter((p) => p.piece === redLight);
      expect(crane.length).toBe(2);
      for (const c of crane) {
        expect(c.alive).toBe('blink');
        expect(c.hot).toBe(true);
        const s = projectPoint(pose, c.at);
        expect(s.y).toBeGreaterThan(Math.max(0, band));
        expect(s.x).toBeGreaterThan(700);
      }
      expect(scene.pieces.some((p) => p.piece.size[0] === 1.4 && p.piece.size[1] === 1.4)).toBe(
        true,
      );
    });

    it(`gives every living piece a body and lights its small emitters hot (${name})`, () => {
      const alive = scene.pieces.filter((p) => p.alive);
      for (const p of alive) {
        const { body } = p.piece.model(p.variant);
        // An empty body throws in `Surroundings` (tintColors).
        expect(body.hasAttribute('position')).toBe(true);
        expect(body.getAttribute('position').count).toBeGreaterThan(0);
      }
      // Living things stay a tile from the room.
      for (const p of alive)
        for (let dx = -1; dx <= 1; dx++)
          for (let dz = -1; dz <= 1; dz++) {
            const t = getTile(map, Math.round(p.at.x) + dx, Math.round(p.at.z) + dz);
            expect(t === null || t === 'void', `alive at ${p.at.x}, ${p.at.z}`).toBe(true);
          }
    });

    it(`brings no food, drink or 3-2 props (${name})`, () => {
      for (const p of scene.pieces) {
        expect(FOOD.has(p.piece)).toBe(false);
        expect(LATER.has(p.piece)).toBe(false);
      }
    });

    it(`builds its ground (${name})`, () => {
      const { body } = groundModel(scene);
      expect(body.getAttribute('position').count).toBeGreaterThan(1000);
      body.dispose();
    });
  }

  it("builds Derek's corner office outside the shipped map, Segfault asleep on his chair", () => {
    const map = MAPS.shipped as LevelMap;
    expect(managerOffice(map)).toBeNull();
    const scene = middleManagementScene(map);
    const { office } = midRiseOutline(map);
    if (!office) throw new Error('no office');
    // Behind the back wall at the right corner, poking out past the building's lines.
    expect(office.z1).toBeLessThan(-0.5);
    expect(office.x1).toBeGreaterThan(midRiseOutline(map).right);
    expect(office.z0).toBeLessThan(midRiseOutline(map).back);
    const inOffice = (p: ScenePiece) =>
      p.at.x > office.x0 && p.at.x < office.x1 && p.at.z > office.z0 && p.at.z < office.z1;
    for (const piece of [mid.execDesk, mid.execChair, mid.credenza, mid.puttingMat]) {
      const p = scene.pieces.find((q) => q.piece === piece);
      expect(p && inOffice(p)).toBe(true);
    }
    const lanyard = scene.pieces.find((p) => p.piece === mid.coatStand && p.variant === 1);
    expect(lanyard && inOffice(lanyard)).toBe(true);
    const chair = scene.pieces.find((p) => p.piece === mid.execChair);
    const cat = scene.pieces.find((p) => p.piece === segfaultCat);
    expect(cat?.alive).toBe('purr');
    expect(
      Math.hypot((cat?.at.x ?? 0) - (chair?.at.x ?? 9), (cat?.at.z ?? 0) - (chair?.at.z ?? 9)),
    ).toBeLessThan(0.2);
    expect((cat?.at.y ?? 0) - GROUND).toBeCloseTo(mid.EXEC_SEAT);
    // The cat must show over the room's back wall.
    expect(projectPoint(scenePose(map), cat?.at ?? { x: 0, y: 0, z: 0 }).y).toBeLessThan(
      projectPoint(scenePose(map), { x: cat?.at.x ?? 0, y: WALL_HEIGHT, z: -0.5 }).y,
    );
  });

  it("leaves the draft's office to the Room: no second office, no second cat", () => {
    const map = MAPS.draft as LevelMap;
    expect(managerOffice(map)).not.toBeNull();
    const scene = middleManagementScene(map);
    expect(midRiseOutline(map).office).toBeNull();
    for (const piece of [mid.execDesk, mid.execChair, mid.credenza, segfaultCat])
      expect(scene.pieces.some((p) => p.piece === piece)).toBe(false);
  });

  it("keeps the draft's left voids as the air over the street, its front corner voids low", () => {
    const map = MAPS.draft as LevelMap;
    const scene = middleManagementScene(map);
    const outline = midRiseOutline(map);
    expect(outline.left).toBeCloseTo(1.5);
    expect(outline.poke?.side).toBe('left');
    const inVoid = (x: number, z: number) => getTile(map, Math.round(x), Math.round(z)) === 'void';
    // The street (pavement, road, park) under the left voids, the building's face along their edge.
    const kinds = new Set(
      scene.ground.filter((g) => g.x0 < 1.5 && g.x1 > 0 && g.z0 < 3 && g.z1 > 0).map((g) => g.kind),
    );
    expect([...kinds].some((k) => k.startsWith('face'))).toBe(true);
    expect([...kinds].some((k) => k === 'walk' || k.startsWith('road') || k === 'park')).toBe(true);
    // The curtain wall runs down the void edge, both above and below the office.
    const walls = scene.pieces.filter(
      (p) => Math.abs(p.at.x - 1.4) < 0.01 && Math.abs(p.yaw - Math.PI / 2) < 1e-6,
    );
    expect(walls.length).toBe(2);
    for (const p of scene.pieces)
      // The outer curtain wall along the void edge is the building's own wall; the rest stays low.
      if (p.row === 'near' && inVoid(p.at.x, p.at.z) && p.at.z > map.height - 2.5)
        for (const v of worldPoints(p)) expect(v.y - GROUND).toBeLessThan(0.6);
  });

  it('puts the lifts on a side with floor, facing the camera, wholly in the frame', () => {
    for (const map of Object.values(MAPS)) {
      const scene = middleManagementScene(map);
      const pose = scenePose(map);
      const lifts = scene.pieces.find((p) => [mid.liftBank(1), mid.liftBank(2)].includes(p.piece));
      if (!lifts) throw new Error('no lifts');
      // Beside the room (never on it), its doors toward the camera, near the front.
      expect(lifts.yaw).toBe(0);
      expect(lifts.at.x < -0.5 || lifts.at.x > map.width - 0.5).toBe(true);
      expect(lifts.at.z).toBeGreaterThan(map.height - 5);
      expect(lifts.at.z).toBeLessThan(map.height);
      for (const v of worldPoints(lifts)) {
        const s = projectPoint(pose, v);
        expect(s.x).toBeGreaterThan(0);
        expect(s.x).toBeLessThan(1420);
        expect(s.y).toBeLessThan(810);
      }
    }
  });

  it('keeps the window cleaner in the frame and his ropes clear of the mute button', () => {
    for (const map of Object.values(MAPS)) {
      const scene = middleManagementScene(map);
      const pose = scenePose(map);
      const cradle = scene.pieces.find((p) => p.piece === mid.cradle);
      const ropes = scene.pieces.filter((p) => p.piece.size[1] === mid.CRADLE.len);
      if (!cradle) {
        // No room for him: then neither the cradle nor the ropes.
        expect(ropes.length).toBe(0);
        continue;
      }
      expect(ropes.length).toBe(1);
      for (const v of worldPoints(cradle)) {
        const s = projectPoint(pose, v);
        expect(s.x).toBeGreaterThan(1200);
        expect(s.x).toBeLessThan(1440);
        expect(s.y).toBeGreaterThan(60);
        expect(s.y).toBeLessThan(740);
      }
      // The ropes run off the top of the frame, never across the mute button.
      const [mx0, my0, mx1, my1] = HUD_RECTS.mute as [number, number, number, number];
      const shown = worldPoints(ropes[0] as ScenePiece).map((v) => projectPoint(pose, v));
      expect(Math.min(...shown.map((p) => p.y))).toBeLessThan(0);
      const rope = ropes[0] as ScenePiece;
      const ends = worldPoints(rope);
      // Sample along each rope (its box's ends, top and bottom).
      const lo = ends.filter((v) => v.y - GROUND < 2);
      const hi = ends.filter((v) => v.y - GROUND > 2);
      for (const a of lo)
        for (const b of hi)
          if (Math.abs(a.z - b.z) < 1.2)
            for (let t = 0; t <= 1; t += 0.02) {
              const p = projectPoint(pose, a.clone().lerp(b, t));
              expect(p.x > mx0 && p.x < mx1 && p.y > my0 && p.y < my1).toBe(false);
            }
    }
  });

  it("keeps the street out from under Derek's office floor", () => {
    const map = MAPS.shipped as LevelMap;
    const scene = middleManagementScene(map);
    const { office } = midRiseOutline(map);
    if (!office) throw new Error('no office');
    for (const g of scene.ground) {
      if (g.kind === 'plush') continue;
      const over =
        Math.min(g.x1, office.x1) - Math.max(g.x0, office.x0) > 0.01 &&
        Math.min(g.z1, office.z1) - Math.max(g.z0, office.z0) > 0.01;
      expect(over, `${g.kind} under the office`).toBe(false);
    }
  });

  it('draws the street far below at a smaller scale, the blossom in clumped rows', () => {
    for (const map of Object.values(MAPS)) {
      const scene = middleManagementScene(map);
      for (const piece of [mid.cherryTree, mid.dayCar, mid.bus, mid.busStop])
        for (const p of scene.pieces.filter((q) => q.piece === piece)) {
          expect(p.row).toBe('far');
          expect(p.scale[0]).toBeLessThan(0.7);
        }
      // Most trees have a neighbour whose canopy overlaps theirs.
      const trees = scene.pieces.filter((p) => p.piece === mid.cherryTree);
      const near = trees.filter((t) =>
        trees.some((u) => u !== t && Math.hypot(u.at.x - t.at.x, u.at.z - t.at.z) < 0.3),
      );
      expect(near.length / trees.length).toBeGreaterThan(0.8);
      expect(scene.pieces.filter((p) => p.piece === mid.dayCar).length).toBeGreaterThan(8);
      // The building's slab edge runs round it.
      expect(scene.ground.some((g) => g.kind.startsWith('face'))).toBe(true);
    }
  });

  it('spells its signs in letters it has', () => {
    for (const t of [
      'RELEASES',
      'V1.4.0',
      'LIFTS',
      'PAPER',
      'JAM',
      'MONOLITH',
      '10 YEARS',
      'OF SERVICE',
      'STATUS',
      'UPDATE?',
      'DEREK',
    ])
      expect(mid.spellable(t)).toBe(true);
  });
});
