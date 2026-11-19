import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import hypergrowthMap from '../../../maps/level-08-hypergrowth.txt?raw';
import { parseLevelMap } from '../../sim/level';
import { HACKATHON, HOT_DESKING, HYPERGROWTH, type Level } from '../../sim/levels';
import { createLifts } from '../../sim/lifts';
import { createGame } from '../../sim/state';
import { tick } from '../../sim/tick';
import { WALL_HEIGHT } from './layout';
import { LiftCars, doorways, flushDoorway } from './liftCars';

describe('lift car doorways', () => {
  it('gives each Hypergrowth car one doorway across its front', () => {
    const map = parseLevelMap(hypergrowthMap);
    const stops = createLifts(map)[0]?.stops ?? [];
    expect(stops.map((cabin) => doorways(map, cabin))).toEqual([
      [{ from: { x: 5.5, y: 5.5 }, to: { x: 7.5, y: 5.5 }, out: { x: 0, y: 1 } }],
      [{ from: { x: 12.5, y: 5.5 }, to: { x: 14.5, y: 5.5 }, out: { x: 0, y: 1 } }],
    ]);
  });

  it('opens an odd-shaped cabin wherever it borders floor, a run per straight edge', () => {
    const map = parseLevelMap(
      ['#####', '#1.L#', '#.LL#', '#####', '#234#', '#.LL#', '#####'].join('\n'),
    );
    const [top] = createLifts(map)[0]?.stops ?? [];
    const ways = doorways(map, top ?? []);
    expect(ways.map((w) => w.out)).toEqual([
      { x: 0, y: -1 },
      { x: -1, y: 0 },
      { x: -1, y: 0 },
    ]);
  });
});

/** Every mesh under `root`: where, how big, its colour, shown or not, rounded. */
function fingerprint(root: THREE.Object3D): string {
  const rows: string[] = [];
  const r = (n: number) => Math.round(n * 1000) / 1000;
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    const m = o.material as THREE.MeshStandardMaterial;
    rows.push(
      [
        o.position.toArray().map(r).join(','),
        o.scale.toArray().map(r).join(','),
        m.color.getHexString(),
        o.visible,
        o.castShadow,
      ].join('|'),
    );
  });
  return rows.join('\n');
}

/** A short stable hash of a string (FNV-1a). */
function hash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return (h >>> 0).toString(16);
}

/** The cars of `level` built and synced over a few frames of a running round. */
function carsOf(level: Level): string {
  const root = new THREE.Group();
  const cars = new LiftCars(root, level.map);
  const state = createGame(level, 7, [1, 2]);
  const out: string[] = [];
  for (let i = 0; i < 8; i++) {
    cars.sync(state, i * 1500);
    out.push(fingerprint(root));
    for (let t = 0; t < 90; t++) tick(state, []);
  }
  return out.join('\n--\n');
}

describe('lift cars on the levels that had them first', () => {
  // These fingerprints were taken before the flush cars of Hot Desking: 3-2's and
  // Hackathon's cars must keep looking exactly the same.
  it("builds Hypergrowth's cars as before", () => {
    expect(hash(carsOf(HYPERGROWTH))).toBe('200d3c58');
  });
  it("builds Hackathon's cars as before", () => {
    expect(hash(carsOf(HACKATHON))).toBe('5103081c');
  });
});

describe('flush lift cars (Hot Desking)', () => {
  it('finds every Hot Desking cabin flush in its wall line, and no 3-2 or Hackathon cabin', () => {
    for (const [level, flush] of [
      [HOT_DESKING, true],
      [HYPERGROWTH, false],
      [HACKATHON, false],
    ] as const)
      for (const cabin of createLifts(level.map)[0]?.stops ?? [])
        expect(flushDoorway(level.map, cabin) !== null).toBe(flush);
  });

  it('builds nothing over the wall top and nothing in front of the wall line', () => {
    const root = new THREE.Group();
    const cars = new LiftCars(root, HOT_DESKING.map);
    const state = createGame(HOT_DESKING, 7, [1, 2]);
    for (let i = 0; i < 6; i++) {
      cars.sync(state, i * 1500);
      root.updateMatrixWorld(true);
      const box = new THREE.Box3();
      root.traverse((o) => {
        if (o instanceof THREE.Mesh && o.visible) box.union(new THREE.Box3().setFromObject(o));
      });
      // The indicator light strip on the header top may lie flush on it.
      expect(box.max.y).toBeLessThanOrEqual(WALL_HEIGHT + 0.013);
      // Each cabin's doors are at its front edge: nothing past it toward the room.
      const fronts = (createLifts(HOT_DESKING.map)[0]?.stops ?? []).map(
        (c) => Math.max(...c.map((t) => t.y)) + 0.5,
      );
      root.traverse((o) => {
        if (!(o instanceof THREE.Mesh) || !o.visible) return;
        const b = new THREE.Box3().setFromObject(o);
        const centre = b.getCenter(new THREE.Vector3());
        const front = fronts.find((f) => centre.z < f + 0.5 && centre.z > f - 1.5);
        if (front !== undefined) expect(b.max.z).toBeLessThanOrEqual(front + 0.025);
      });
      for (let t = 0; t < 90; t++) tick(state, []);
    }
  });

  it('lights the floor the lift is at and the way it goes next', () => {
    const root = new THREE.Group();
    const cars = new LiftCars(root, HOT_DESKING.map);
    const state = createGame(HOT_DESKING, 7, [1, 2]);
    cars.sync(state, 0);
    const lit = new Set<number>();
    root.traverse((o) => {
      if (o instanceof THREE.Mesh && o.material instanceof THREE.MeshBasicMaterial)
        lit.add(o.material.color.getHex());
    });
    // Amber digit for the floor, green arrow for the way.
    expect(lit.has(0xffb347)).toBe(true);
    expect(lit.has(0x5be37a)).toBe(true);
  });
});
