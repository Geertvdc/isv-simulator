import { describe, expect, it } from 'vitest';
import { createFlow } from '../../../flow/flow';
import { createSave } from '../../../flow/save';
import { buildWorldMap } from '../../../flow/worldMap';
import { CHAPTER_STAR_GATES, STARS_TO_UNLOCK } from '../../../sim/balance';
import { menuViewOf } from '../../menuView';
import { BACKLOT } from './cityPlan';
import {
  CLOUDS,
  cloudPuffs,
  distanceAlong,
  lockStateOf,
  newlyOpened,
  sameLocks,
  vanStop,
} from './locks';

const CHAPTERS = [
  { levelIds: ['a1', 'a2', 'a3'], starGate: 0 },
  { levelIds: ['b1', 'b2'], starGate: 4 },
  { levelIds: ['c1', 'c2', 'c3', 'c4'], starGate: 9 },
];
const LEVEL_IDS = CHAPTERS.flatMap((c) => c.levelIds);
const MAP = buildWorldMap(CHAPTERS);

function stateFor(stars: Record<string, number>, unlockAll = false) {
  const save = createSave();
  for (const [id, s] of Object.entries(stars))
    save.levels[id] = { bestStars: s, bestScore: 1, plays: 1 };
  const view = menuViewOf({
    flow: createFlow(),
    save,
    levelIds: LEVEL_IDS,
    chapters: CHAPTERS,
    unlockAll,
  });
  return lockStateOf(MAP, view);
}

describe('lockStateOf', () => {
  it('locks everything after the first level and chapter on a fresh save', () => {
    const fresh = stateFor({});
    expect(fresh.chapters).toEqual([true, false, false]);
    expect(fresh.levels).toEqual([true, false, false, false, false, false, false, false, false]);
  });

  it('opens a chapter at its star gate and the next level at enough stars', () => {
    const partial = stateFor({ a1: 3, a2: STARS_TO_UNLOCK });
    expect(partial.chapters).toEqual([true, true, false]);
    expect(partial.levels.slice(0, 5)).toEqual([true, true, true, false, false]);
  });

  it('opens everything with unlockAll', () => {
    const all = stateFor({}, true);
    expect(all.chapters.every(Boolean)).toBe(true);
    expect(all.levels.every(Boolean)).toBe(true);
  });
});

describe('newlyOpened', () => {
  it('reports nothing on the first showing', () => {
    expect(newlyOpened(null, stateFor({ a1: 3, a2: 3 }))).toEqual({ chapters: [], levels: [] });
  });

  it('reports the chapters and levels opened since last time', () => {
    const before = stateFor({ a1: 3 });
    const after = stateFor({ a1: 3, a2: 3 });
    expect(newlyOpened(before, after)).toEqual({ chapters: [1], levels: [2] });
    expect(newlyOpened(after, after)).toEqual({ chapters: [], levels: [] });
  });

  it('never reports something that closed', () => {
    expect(newlyOpened(stateFor({ a1: 3, a2: 3 }), stateFor({}))).toEqual({
      chapters: [],
      levels: [],
    });
  });
});

describe('sameLocks', () => {
  it('compares lock states', () => {
    const a = stateFor({ a1: 3 });
    expect(sameLocks(null, a)).toBe(false);
    expect(sameLocks(a, stateFor({ a1: 3 }))).toBe(true);
    expect(sameLocks(a, stateFor({ a1: 3, a2: 3 }))).toBe(false);
  });
});

describe('gates', () => {
  it('has a gate for every chapter but the first, on the road', () => {
    expect(MAP.gates.map((g) => g.chapter)).toEqual([1, 2]);
    for (const gate of MAP.gates) {
      const at = distanceAlong(MAP.road, gate.at);
      expect(at).toBeGreaterThan(0);
    }
  });
});

describe('distanceAlong', () => {
  it('measures along the road to the nearest point', () => {
    const road = [
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 4, y: 3 },
    ];
    expect(distanceAlong(road, { x: 2, y: 1 })).toBeCloseTo(2);
    expect(distanceAlong(road, { x: 5, y: 2 })).toBeCloseTo(6);
  });
});

describe('vanStop', () => {
  const stops = [10, 20];
  const chapters = [1, 2];
  it('drives to the target past open gates', () => {
    expect(vanStop(25, stops, chapters, [true, true, true])).toBe(25);
  });

  it('waits at the first closed gate on the way', () => {
    expect(vanStop(25, stops, chapters, [true, false, false])).toBe(10);
    expect(vanStop(25, stops, chapters, [true, true, false])).toBe(20);
  });

  it('is not stopped by a closed gate further on', () => {
    expect(vanStop(5, stops, chapters, [true, false, false])).toBe(5);
  });
});

describe('cloudPuffs', () => {
  it('may spill into the next chapter: star gates grow, so it is locked whenever this one is', () => {
    CHAPTER_STAR_GATES.forEach((gate, i) => {
      expect(gate).toBeGreaterThanOrEqual(CHAPTER_STAR_GATES[i - 1] ?? 0);
    });
  });

  it('covers its region without reaching into the chapter before', () => {
    for (const region of MAP.regions) {
      const puffs = cloudPuffs(region, BACKLOT);
      expect(puffs.length).toBeGreaterThan(10);
      for (const p of puffs) {
        expect(p.x - p.r - CLOUDS.drift).toBeGreaterThanOrEqual(region.x - 1e-9);
        expect(p.x + p.r + CLOUDS.drift).toBeLessThanOrEqual(
          region.x + region.width + CLOUDS.seam + 1e-9,
        );
        expect(p.z).toBeGreaterThan(0);
      }
      // From the back lot to the front shore.
      expect(Math.min(...puffs.map((p) => p.y))).toBeLessThanOrEqual(-BACKLOT);
      expect(Math.max(...puffs.map((p) => p.y))).toBeGreaterThanOrEqual(region.height);
    }
  });

  it('is the same every time', () => {
    const region = MAP.regions[1];
    if (!region) throw new Error('no region');
    expect(cloudPuffs(region, BACKLOT)).toEqual(cloudPuffs(region, BACKLOT));
  });
});
