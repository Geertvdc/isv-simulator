import { describe, expect, it } from 'vitest';
import { type WorldMap, buildWorldMap } from '../../../flow/worldMap';
import { CHAPTERS } from '../../../sim/levels';
import {
  BACKLOT,
  type CityPiece,
  NEIGHBOUR,
  STREET,
  STYLES,
  denseRoad,
  footprint,
  isBuilding,
  labelRects,
  planCity,
  rectDistance,
  silhouette,
  streetLoop,
  styleOf,
} from './cityPlan';
import { markerSpots } from './markers';

const realMap = buildWorldMap(
  CHAPTERS.map((c) => ({ levelIds: c.levels.map((l) => l.id), starGate: c.starGate })),
);

/** A made-up campaign: `counts[c]` levels in chapter c. */
function madeUp(counts: number[]): WorldMap {
  return buildWorldMap(
    counts.map((n, c) => ({
      levelIds: Array.from({ length: n }, (_, k) => `c${c}-${k}`),
      starGate: 0,
    })),
  );
}

function overlaps(a: ReturnType<typeof footprint>, b: ReturnType<typeof footprint>): boolean {
  return a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
}

/** Every rule a plan must keep, for any map. */
function expectClear(map: WorldMap, pieces: readonly CityPiece[]): void {
  const road = denseRoad(map);
  const feet = markerSpots(map).map((m) => m.foot);
  const labels = labelRects(map);
  for (const p of pieces) {
    const f = footprint(p);
    const s = silhouette(p);
    const where = `${p.kind} at ${p.x.toFixed(2)}, ${p.y.toFixed(2)}`;
    // On land, off the back street.
    expect(f.x0, where).toBeGreaterThanOrEqual(0);
    expect(f.x1, where).toBeLessThanOrEqual(map.width);
    expect(f.y0, where).toBeGreaterThanOrEqual(-BACKLOT);
    expect(f.y1, where).toBeLessThanOrEqual(map.height);
    expect(f.y1 <= STREET.row || f.y0 >= STREET.row + 1, where).toBe(true);
    // Off the road (it is 0.74 wide), and not hiding it from the camera.
    const roadGap = Math.min(...road.map((r) => rectDistance(f, r)));
    expect(roadGap, where).toBeGreaterThan(0.6);
    const viewGap = Math.min(...road.map((r) => rectDistance(s, r)));
    expect(viewGap, where).toBeGreaterThan(0.37);
    // Not on or hiding a flag or a level number.
    for (const foot of feet) expect(rectDistance(s, foot), where).toBeGreaterThan(0.4);
    for (const label of labels) expect(overlaps(s, label), where).toBe(false);
  }
  // No two pieces overlap.
  pieces.forEach((a, i) => {
    for (const b of pieces.slice(i + 1)) {
      expect(overlaps(footprint(a), footprint(b)), `${a.kind} and ${b.kind}`).toBe(false);
    }
  });
}

describe('planCity', () => {
  const plan = planCity(realMap);

  it('keeps every piece off the road, the flags and their numbers, and in view of them', () => {
    expectClear(realMap, plan.pieces);
  });

  it('gives every chapter a lively region: buildings and plenty of props', () => {
    for (const region of realMap.regions) {
      const mine = plan.pieces.filter((p) => p.chapter === region.chapter);
      expect(mine.length).toBeGreaterThanOrEqual(25);
      expect(mine.filter((p) => isBuilding(p.kind)).length).toBeGreaterThanOrEqual(4);
    }
  });

  it('grows from a small town to a big city: buildings get taller chapter by chapter', () => {
    const average = realMap.regions.map((region) => {
      const heights = plan.pieces
        .filter((p) => p.chapter === region.chapter && isBuilding(p.kind))
        .map((p) => p.h);
      return heights.reduce((a, b) => a + b, 0) / heights.length;
    });
    for (let c = 1; c < average.length; c++) {
      expect(average[c]).toBeGreaterThan(average[c - 1] ?? 0);
    }
    const tallest = [...plan.pieces].sort((a, b) => b.h - a.h)[0];
    expect(tallest?.kind).toBe('skyscraper');
    expect(tallest?.x).toBeGreaterThan(realMap.width - 4);
  });

  it('puts each chapter its landmark, and the garage by the first level', () => {
    const landmark = (kind: string, chapter: number): CityPiece | undefined =>
      plan.pieces.find((p) => p.kind === kind && p.chapter === chapter);
    for (const [kind, chapter] of [
      ['garage', 0],
      ['warehouse', 1],
      ['kiosk', 1],
      ['crane', 2],
      ['hq', 3],
      ['fountain', 3],
      ['campus', 4],
      ['skyscraper', 4],
    ] as const) {
      expect(landmark(kind, chapter), kind).toBeDefined();
    }
    const garage = landmark('garage', 0);
    const first = realMap.nodes[0];
    expect(
      Math.hypot((garage?.x ?? 99) - (first?.x ?? 0), (garage?.y ?? 99) - (first?.y ?? 0)),
    ).toBeLessThan(4);
  });

  it('never stands a piece by the nearest of its kind in the same style', () => {
    for (const p of plan.pieces) {
      if ((STYLES[p.kind] ?? 1) < 2) continue;
      const nearest = plan.pieces
        .filter((q) => q !== p && q.kind === p.kind)
        .map((q) => ({ q, d: Math.hypot(q.x - p.x, q.y - p.y) }))
        .filter(({ d }) => d < NEIGHBOUR)
        .sort((a, b) => a.d - b.d)[0];
      if (!nearest) continue;
      // Only the later of the two had to move off the other's style.
      if (plan.pieces.indexOf(nearest.q) > plan.pieces.indexOf(p)) continue;
      expect(styleOf(nearest.q), `${p.kind} at ${p.x.toFixed(1)}, ${p.y.toFixed(1)}`).not.toBe(
        styleOf(p),
      );
    }
  });

  it('builds every chapter from many kinds, its houses and offices in many styles', () => {
    for (const region of realMap.regions) {
      const mine = plan.pieces.filter((p) => p.chapter === region.chapter);
      expect(
        new Set(mine.map((p) => p.kind)).size,
        `chapter ${region.chapter}`,
      ).toBeGreaterThanOrEqual(12);
    }
    const styles = (kind: string) =>
      new Set(plan.pieces.filter((p) => p.kind === kind).map((p) => styleOf(p))).size;
    expect(styles('house')).toBeGreaterThanOrEqual(5);
    expect(styles('office')).toBeGreaterThanOrEqual(4);
    expect(styles('tower')).toBeGreaterThanOrEqual(3);
    expect(styles('glassTower')).toBeGreaterThanOrEqual(3);
  });

  it('keeps fillers of a kind from clumping', () => {
    const fillers = plan.pieces.filter((p) => !isBuilding(p.kind));
    let clumped = 0;
    for (const p of fillers) {
      const twin = fillers.some(
        (q) => q !== p && q.kind === p.kind && Math.hypot(q.x - p.x, q.y - p.y) < 0.8,
      );
      if (twin) clumped++;
    }
    expect(clumped / fillers.length).toBeLessThan(0.25);
  });

  it('is the same every time', () => {
    expect(planCity(realMap)).toEqual(plan);
  });

  it('paves every land tile, the back lot included, with the street in asphalt', () => {
    expect(plan.ground).toHaveLength(realMap.width * (realMap.height + BACKLOT));
    for (const tile of plan.ground.filter((t) => t.y === STREET.row))
      expect(tile.kind).toBe('asphalt');
    // The town is green, the city is not.
    const share = (chapter: number, kind: string): number => {
      const tiles = plan.ground.filter((t) => t.chapter === chapter);
      return tiles.filter((t) => t.kind === kind).length / tiles.length;
    };
    expect(share(0, 'grass')).toBeGreaterThan(0.8);
    expect(share(3, 'grass')).toBe(0);
  });

  it('lays out any campaign, keeping the same rules', () => {
    for (const counts of [[1], [2, 2], [3, 3, 3, 3, 4, 2, 5]]) {
      const map = madeUp(counts);
      const made = planCity(map);
      expectClear(map, made.pieces);
      expect(made.pieces.length).toBeGreaterThan(counts.length * 5);
    }
  });
});

describe('streetLoop', () => {
  it('drives a closed loop along the back street, both lanes, without jumps', () => {
    const loop = streetLoop(realMap.width);
    let last = loop.at(0);
    for (let s = 0.05; s <= loop.length + 0.01; s += 0.05) {
      const here = loop.at(s);
      expect(Math.hypot(here.x - last.x, here.y - last.y)).toBeLessThan(0.06);
      expect(here.y).toBeGreaterThan(STREET.row);
      expect(here.y).toBeLessThan(STREET.row + 1);
      last = here;
    }
    // Right along the near lane, left along the far one.
    expect(loop.at(1).yaw).toBeCloseTo(Math.PI / 2);
    expect(loop.at(loop.length / 2 + 1).yaw).toBeCloseTo(-Math.PI / 2);
    expect(loop.at(1).y).toBeGreaterThan(loop.at(loop.length / 2 + 1).y);
  });
});
