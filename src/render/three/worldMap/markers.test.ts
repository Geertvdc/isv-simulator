import { describe, expect, it } from 'vitest';
import { type WorldMap, buildWorldMap } from '../../../flow/worldMap';
import { CHAPTERS } from '../../../sim/levels';
import { denseRoad, labelRects, rectDistance } from './cityPlan';
import { FLAG_ASIDE, LABEL, markerSpots } from './markers';

const CHAPTER_INFO = CHAPTERS.map((c) => ({
  levelIds: c.levels.map((l) => l.id),
  starGate: c.starGate,
}));
const realMap = buildWorldMap(CHAPTER_INFO);

/** A made-up campaign: `counts[c]` levels in chapter c. */
function madeUp(counts: number[]): WorldMap {
  return buildWorldMap(
    counts.map((n, c) => ({
      levelIds: Array.from({ length: n }, (_, k) => `c${c}-${k}`),
      starGate: 0,
    })),
  );
}

const OTHER_MAPS = [
  ...[[1], [2, 2], [3, 3, 3, 3, 3], [4, 4, 4], [5, 5, 5, 5, 5, 5]].map(madeUp),
  ...Array.from({ length: 10 }, (_, seed) => buildWorldMap(CHAPTER_INFO, seed + 1)),
];

/** The road is 0.74 wide: a number further than this from its middle line lies off it. */
const ROAD_HALF = 0.37;

describe('markerSpots', () => {
  it('stands every flag beside the road, clear of it', () => {
    for (const map of [realMap, ...OTHER_MAPS]) {
      const road = denseRoad(map);
      for (const { foot } of markerSpots(map)) {
        const gap = Math.min(...road.map((r) => Math.hypot(r.x - foot.x, r.y - foot.y)));
        expect(gap).toBeGreaterThan(FLAG_ASIDE.clear - 0.01);
      }
    }
  });

  it('lays every level number on the land, off the road', () => {
    for (const map of [realMap, ...OTHER_MAPS]) {
      const road = denseRoad(map);
      for (const rect of labelRects(map)) {
        expect(rect.x0).toBeGreaterThanOrEqual(0);
        expect(rect.x1).toBeLessThanOrEqual(map.width);
        const gap = Math.min(...road.map((r) => rectDistance(rect, r)));
        expect(gap).toBeGreaterThan(ROAD_HALF);
      }
    }
  });

  it('lays every number nearest its own flag, clear of the others', () => {
    for (const map of [realMap, ...OTHER_MAPS]) {
      const spots = markerSpots(map);
      spots.forEach(({ foot, label }, i) => {
        const own = Math.hypot(label.x - foot.x, label.y - foot.y);
        spots.forEach((other, j) => {
          if (j === i) return;
          const theirs = Math.hypot(label.x - other.foot.x, label.y - other.foot.y);
          expect(theirs, `number ${i} by flag ${j}`).toBeGreaterThan(own);
          expect(theirs, `number ${i} by flag ${j}`).toBeGreaterThanOrEqual(LABEL.otherFlag);
        });
      });
    }
  });

  it('keeps every number inside its chapter, clear of the clouds on the next', () => {
    for (const map of [realMap, ...OTHER_MAPS]) {
      markerSpots(map).forEach(({ label }, i) => {
        const region = map.regions[map.nodeChapters[i] ?? 0];
        if (!region || region.x + region.width >= map.width) return;
        expect(label.x + LABEL.width / 2, `number ${i}`).toBeLessThanOrEqual(
          region.x + region.width - LABEL.chapterGap,
        );
      });
    }
  });

  it('never lays a number behind its own flag on the far side, where the flag hides it', () => {
    for (const map of [realMap, ...OTHER_MAPS]) {
      markerSpots(map).forEach(({ foot, label }, i) => {
        const node = map.nodes[i];
        if (!node || foot.y > node.y) return;
        const overPole = Math.abs(label.x - foot.x) < LABEL.width / 2;
        expect(overPole && label.y < foot.y, `number ${i}`).toBe(false);
      });
    }
  });

  it('keeps the numbers on the campaign map apart and well clear of the road', () => {
    const road = denseRoad(realMap);
    const rects = labelRects(realMap);
    rects.forEach((a, i) => {
      expect(Math.min(...road.map((r) => rectDistance(a, r)))).toBeGreaterThan(0.5);
      for (const b of rects.slice(i + 1)) {
        expect(a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1).toBe(false);
      }
    });
  });
});
