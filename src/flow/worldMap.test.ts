import { describe, expect, it } from 'vitest';
import { CHAPTERS, LEVELS } from '../sim/levels';
import type { FlowContext } from './flow';
import { type ChapterInfo, createSave } from './save';
import { buildWorldMap, mapCursor, nodeIndexOf, roadBetween, worldMapFor } from './worldMap';

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

  it('winds: the road is not a straight line between nodes', () => {
    const stretch = roadBetween(MAP, 0, 1);
    const a = MAP.nodes[0];
    const b = MAP.nodes[1];
    if (!a || !b) throw new Error('no nodes');
    const offLine = stretch.some((p) => {
      const cross = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
      return Math.abs(cross) / Math.hypot(b.x - a.x, b.y - a.y) > 0.3;
    });
    expect(offLine).toBe(true);
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
    const [a, b] = MAP.nodes;
    if (!a || !b) throw new Error('no nodes');
    // The road from the first flag to the second climbs up the screen.
    expect(b.y).toBeLessThan(a.y);
    expect(mapCursor(c, 0, 0, -1)).toBe(1);
    expect(mapCursor(c, 1, 0, 1)).toBe(0);
  });

  it('stays put when no road goes that way', () => {
    const c = ctx();
    // Nothing before the first level, and the second lies up the screen.
    expect(mapCursor(c, 0, 0, 1)).toBe(0);
    // Both neighbours of the second level lie below it.
    expect(mapCursor(c, 1, 0, -1)).toBe(1);
  });

  it('falls back to road order for levels the map does not know', () => {
    const c = ctx({ levelIds: ['x', 'y', 'z'], chapters: [] });
    expect(mapCursor(c, 0, 1, 0)).toBe(1);
    expect(mapCursor(c, 2, 1, 0)).toBe(2);
    expect(mapCursor(c, 1, 0, 1)).toBe(1);
  });
});
