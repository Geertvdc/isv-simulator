import { describe, expect, it } from 'vitest';
import { CHAPTERS, LEVELS } from '../sim/levels';
import type { FlowContext } from './flow';
import { type ChapterInfo, createSave } from './save';
import {
  type WorldMap,
  buildWorldMap,
  faults,
  mapCursor,
  nodeIndexOf,
  roadBetween,
  worldMapFor,
} from './worldMap';

const CHAPTER_INFO: readonly ChapterInfo[] = CHAPTERS.map((c) => ({
  levelIds: c.levels.map((l) => l.id),
  starGate: c.starGate,
}));
const LEVEL_IDS = LEVELS.map((l) => l.id);
const MAP = buildWorldMap(CHAPTER_INFO);

function ctx(extra: Partial<FlowContext> = {}): FlowContext {
  return {
    save: createSave(),
    levelIds: LEVEL_IDS,
    chapters: CHAPTER_INFO,
    unlockAll: false,
    nowMs: 0,
    ...extra,
  };
}

const DIRECTIONS = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
];

const inside = (p: { x: number; y: number }) =>
  p.x >= 0 && p.x <= MAP.width && p.y >= 0 && p.y <= MAP.height;

/** A made-up campaign: `counts[c]` levels in chapter c. */
function madeUp(counts: readonly number[]): ChapterInfo[] {
  return counts.map((n, c) => ({
    levelIds: Array.from({ length: n }, (_, k) => `c${c}-${k}`),
    starGate: 0,
  }));
}

/** Made-up campaigns, and the real one with other seeds: the layout rules hold for any. */
const OTHER_MAPS: readonly WorldMap[] = [
  ...[
    [1],
    [2, 2],
    [1, 1, 1, 1],
    [3, 3, 3, 3, 3],
    [4, 4, 4],
    [3, 4, 3, 4, 3, 4],
    [6, 6],
    [5, 5, 5, 5, 5, 5],
  ].map((counts) => buildWorldMap(madeUp(counts))),
  ...Array.from({ length: 30 }, (_, seed) => buildWorldMap(CHAPTER_INFO, seed + 1)),
];

/** Do segments ab and cd cross? */
function crosses(
  a: { x: number; y: number },
  b: { x: number; y: number },
  c: { x: number; y: number },
  d: { x: number; y: number },
): boolean {
  const side = (p: typeof a, q: typeof a, r: typeof a) =>
    (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  return side(a, b, c) * side(a, b, d) < 0 && side(c, d, a) * side(c, d, b) < 0;
}

/** The road's height across chapter `c`'s land, at `n` evenly spaced places. */
function profile(map: WorldMap, c: number, n = 24): number[] {
  const region = map.regions[c];
  if (!region) return [];
  return Array.from({ length: n }, (_, k) => {
    const x = region.x + ((k + 0.5) / n) * region.width;
    const i = map.road.findIndex((p) => p.x >= x);
    const a = map.road[i - 1] ?? map.road[i];
    const b = map.road[i];
    if (!a || !b) return 0;
    return b.x === a.x ? b.y : a.y + ((b.y - a.y) * (x - a.x)) / (b.x - a.x);
  });
}

describe('world map layout', () => {
  it('has a node for every level, in level order', () => {
    expect(MAP.levelIds).toEqual(LEVEL_IDS);
    expect(MAP.nodes).toHaveLength(LEVELS.length);
    for (const level of LEVELS) expect(nodeIndexOf(MAP, level.id)).toBeGreaterThanOrEqual(0);
  });

  it('keeps nodes apart and on the island', () => {
    MAP.nodes.forEach((a, i) => {
      expect(inside(a)).toBe(true);
      MAP.nodes.forEach((b, j) => {
        if (i !== j) expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(2);
      });
    });
  });

  it('runs the road through every node, without gaps, on the island', () => {
    MAP.nodes.forEach((node, i) => {
      const at = MAP.road[MAP.nodeWaypoints[i] ?? -1];
      expect(at).toEqual(node);
    });
    for (let i = 1; i < MAP.road.length; i++) {
      const a = MAP.road[i - 1];
      const b = MAP.road[i];
      if (!a || !b) throw new Error('hole in the road');
      expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeLessThan(1.5);
      expect(inside(b)).toBe(true);
    }
  });

  it('joins consecutive nodes by road, either way round', () => {
    for (let i = 0; i + 1 < MAP.nodes.length; i++) {
      const stretch = roadBetween(MAP, i, i + 1);
      expect(stretch.length).toBeGreaterThan(2);
      expect(stretch[0]).toEqual(MAP.nodes[i]);
      expect(stretch[stretch.length - 1]).toEqual(MAP.nodes[i + 1]);
      expect(roadBetween(MAP, i + 1, i)).toEqual([...stretch].reverse());
    }
  });

  it('winds: most stretches between two flags bend off the straight line', () => {
    let bent = 0;
    for (let i = 0; i + 1 < MAP.nodes.length; i++) {
      const a = MAP.nodes[i];
      const b = MAP.nodes[i + 1];
      if (!a || !b) throw new Error('no nodes');
      const offLine = roadBetween(MAP, i, i + 1).some((p) => {
        const cross = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
        return Math.abs(cross) / Math.hypot(b.x - a.x, b.y - a.y) > 0.3;
      });
      if (offLine) bent++;
    }
    expect(bent).toBeGreaterThan((MAP.nodes.length - 1) / 2);
  });

  it('does not repeat: every chapter has its own stretch of road', () => {
    const profiles = MAP.regions.map((_, c) => profile(MAP, c));
    profiles.forEach((a, i) => {
      profiles.slice(i + 1).forEach((b, k) => {
        const apart = Math.max(...a.map((y, n) => Math.abs(y - (b[n] ?? y))));
        const mirrored = Math.max(...a.map((y, n) => Math.abs(MAP.height - y - (b[n] ?? y))));
        expect(Math.min(apart, mirrored), `chapters ${i + 1} and ${i + k + 2}`).toBeGreaterThan(1);
      });
    });
  });

  it('does not just zigzag: somewhere the road climbs or drops past two flags in a row', () => {
    const steps = MAP.nodes.slice(1).map((n, i) => Math.sign(n.y - (MAP.nodes[i]?.y ?? n.y)));
    expect(steps.some((s, i) => i > 0 && s === steps[i - 1])).toBe(true);
    // And the flags stand at all sorts of heights, not on a few rows.
    const rows = new Set(MAP.nodes.map((n) => n.y.toFixed(1)));
    expect(rows.size).toBeGreaterThan(MAP.nodes.length * 0.75);
  });

  it('runs left to right without crossing itself', () => {
    for (const map of [MAP, ...OTHER_MAPS]) {
      for (let i = 1; i < map.road.length; i++) {
        expect(map.road[i]?.x ?? 0).toBeGreaterThan(map.road[i - 1]?.x ?? 0);
      }
      for (let i = 1; i < map.road.length; i++) {
        for (let j = i + 2; j < map.road.length; j++) {
          const [a, b, c, d] = [map.road[i - 1], map.road[i], map.road[j - 1], map.road[j]];
          if (a && b && c && d) expect(crosses(a, b, c, d), `segments ${i} and ${j}`).toBe(false);
        }
      }
    }
  });

  it('keeps its rules on any map: in its band, no sharp turns, never back near a flag', () => {
    for (const map of [MAP, ...OTHER_MAPS]) {
      expect(faults(map.road, map.nodeWaypoints, map.nodes)).toBe(0);
      for (const p of map.road) {
        // Clear of the shores, and of the city rows behind the road.
        expect(p.y).toBeGreaterThanOrEqual(3);
        expect(p.y).toBeLessThanOrEqual(map.height - 2.9);
        expect(p.x).toBeGreaterThanOrEqual(1);
        expect(p.x).toBeLessThanOrEqual(map.width - 1);
      }
    }
  });

  it('keeps the road away from flags it only passes', () => {
    for (const map of [MAP, ...OTHER_MAPS]) {
      map.nodes.forEach((node, i) => {
        const from = map.nodeWaypoints[i - 1] ?? 0;
        const to = map.nodeWaypoints[i + 1] ?? map.road.length - 1;
        map.road.forEach((p, w) => {
          if (w >= from && w <= to) return;
          expect(Math.hypot(p.x - node.x, p.y - node.y)).toBeGreaterThan(2);
        });
      });
    }
  });

  it('spaces the flags out, each one a step up or down from the one before', () => {
    for (const map of [MAP, ...OTHER_MAPS]) {
      map.nodes.forEach((node, i) => {
        const before = map.nodes[i - 1];
        if (!before) return;
        expect(node.x - before.x).toBeGreaterThanOrEqual(2.3);
        expect(Math.abs(node.y - before.y)).toBeGreaterThanOrEqual(1.2 - 1e-9);
      });
    }
  });

  it('gives every chapter a region, left to right, holding its nodes', () => {
    expect(MAP.regions).toHaveLength(CHAPTERS.length);
    MAP.regions.forEach((region, c) => {
      expect(region.chapter).toBe(c);
      const previous = MAP.regions[c - 1];
      if (previous) expect(region.x).toBe(previous.x + previous.width);
      MAP.nodes.forEach((node, i) => {
        if (MAP.nodeChapters[i] !== c) return;
        expect(node.x).toBeGreaterThan(region.x);
        expect(node.x).toBeLessThan(region.x + region.width);
      });
    });
  });

  it('puts a gate on the road at the border of every chapter after the first', () => {
    expect(MAP.gates.map((g) => g.chapter)).toEqual(CHAPTERS.slice(1).map((_, i) => i + 1));
    for (const gate of MAP.gates) {
      expect(gate.at.x).toBe(MAP.regions[gate.chapter]?.x);
      const first = CHAPTER_INFO[gate.chapter]?.levelIds[0] ?? '';
      expect(gate.waypoint).toBeLessThanOrEqual(MAP.nodeWaypoints[nodeIndexOf(MAP, first)] ?? -1);
    }
  });

  it('is the same map every time for the same chapters', () => {
    expect(buildWorldMap(CHAPTER_INFO)).toEqual(MAP);
    expect(worldMapFor(CHAPTER_INFO)).toBe(worldMapFor(CHAPTER_INFO));
  });
});

describe('mapCursor', () => {
  it('lands every direction from every level on a real level next to it on the road', () => {
    const c = ctx();
    LEVELS.forEach((_, i) => {
      for (const d of DIRECTIONS) {
        const next = mapCursor(c, i, d.x, d.y);
        expect(next).toBeGreaterThanOrEqual(0);
        expect(next).toBeLessThan(LEVELS.length);
        expect(Math.abs(next - i)).toBeLessThanOrEqual(1);
      }
    });
  });

  it('walks the whole road with right, and back with left', () => {
    const c = ctx();
    let index = 0;
    const seen = [index];
    for (let i = 0; i < LEVELS.length + 2; i++) {
      index = mapCursor(c, index, 1, 0);
      seen.push(index);
    }
    expect(seen.slice(0, LEVELS.length)).toEqual(LEVELS.map((_, i) => i));
    expect(index).toBe(LEVELS.length - 1);
    for (let i = 0; i < LEVELS.length + 2; i++) index = mapCursor(c, index, -1, 0);
    expect(index).toBe(0);
  });

  it('drives up or down to the neighbour that lies that way', () => {
    const c = ctx();
    for (let i = 0; i + 1 < MAP.nodes.length; i++) {
      const a = MAP.nodes[i];
      const b = MAP.nodes[i + 1];
      if (!a || !b) throw new Error('no nodes');
      // Every next flag stands higher or lower, so up or down drives there (unless
      // the flag before lies that way too, and more squarely).
      const toward = Math.sign(b.y - a.y);
      const there = mapCursor(c, i, 0, toward);
      expect(there).not.toBe(i);
      expect(Math.sign((MAP.nodes[there]?.y ?? 0) - a.y)).toBe(toward);
      const back = mapCursor(c, i + 1, 0, -toward);
      expect(back).not.toBe(i + 1);
      expect(Math.sign((MAP.nodes[back]?.y ?? 0) - b.y)).toBe(-toward);
    }
  });

  it('stays put when no road goes that way', () => {
    const c = ctx();
    const [a, b] = MAP.nodes;
    if (!a || !b) throw new Error('no nodes');
    // Nothing before the first level: away from the second one, up or down, stays put.
    expect(mapCursor(c, 0, 0, Math.sign(a.y - b.y))).toBe(0);
    // A flag with both neighbours on the same side doesn't move the other way.
    const i = MAP.nodes.findIndex((n, k) => {
      const before = MAP.nodes[k - 1];
      const after = MAP.nodes[k + 1];
      return before && after && Math.sign(before.y - n.y) === Math.sign(after.y - n.y);
    });
    const n = MAP.nodes[i];
    const before = MAP.nodes[i - 1];
    if (!n || !before) throw new Error('no flag between two lower or higher ones');
    expect(mapCursor(c, i, 0, Math.sign(n.y - before.y))).toBe(i);
  });

  it('falls back to road order for levels the map does not know', () => {
    const c = ctx({ levelIds: ['x', 'y', 'z'], chapters: [] });
    expect(mapCursor(c, 0, 1, 0)).toBe(1);
    expect(mapCursor(c, 2, 1, 0)).toBe(2);
    expect(mapCursor(c, 1, 0, 1)).toBe(1);
  });
});
