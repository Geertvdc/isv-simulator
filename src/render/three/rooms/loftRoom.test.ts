import { describe, expect, it } from 'vitest';
import { getTile } from '../../../sim/level';
import { parseDraftMap } from '../../../sim/draftMap';
import { SEED_ROUND } from '../../../sim/levels';
import draftText from '../../../../maps/drafts/seed-round.txt?raw';
import { wallPiece } from '../../mapShape';
import { gridToWorld } from '../../projection';
import {
  LOFT_ART_HALF,
  LOFT_ART_SPAN,
  LOFT_CAP_CLUSTERS,
  POLISHED_WEAR,
  globeFit,
  loftRoom,
} from './loftRoom';

describe('loftRoom', () => {
  const shipped = SEED_ROUND.map;
  const draft = parseDraftMap(draftText);
  const maps = [shipped, draft];
  const isOpen = (t: ReturnType<typeof getTile>) => t !== null && t !== 'wall' && t !== 'void';

  it('frames the inbox as the lift door from the core, on whatever edge it is', () => {
    expect(loftRoom(shipped).liftDoor).toEqual({
      side: 'back',
      tiles: [
        { x: 2, y: 0 },
        { x: 3, y: 0 },
      ],
      mid: { x: 2.5, y: 0 },
    });
    const lift = loftRoom(draft).liftDoor;
    expect(lift?.side).toBe('left');
    expect(lift?.tiles.map((t) => t.y)).toEqual([7, 8]);
  });

  it('frames the ship hatch as the door out to the roof: four tiles on the front, two on the right', () => {
    const front = loftRoom(shipped).roofDoor;
    expect(front?.side).toBe('front');
    expect(front?.tiles.map((t) => t.x)).toEqual([5, 6, 7, 8]);
    const right = loftRoom(draft).roofDoor;
    expect(right?.side).toBe('right');
    expect(right?.tiles).toHaveLength(2);
  });

  it('hangs each piece of art once, on back walls facing the room, over the tiles it spans', () => {
    for (const m of maps) {
      const art = loftRoom(m).wallArt;
      const names = art.map((a) => a.art);
      expect(new Set(names).size).toBe(names.length);
      for (const must of ['dashboard', 'cheque', 'growthChart'] as const)
        expect(names).toContain(must);
      for (const a of art) {
        const span = LOFT_ART_SPAN[a.art];
        expect(Number.isInteger(a.x)).toBe(span % 2 === 1);
        for (let i = 0; i < span; i++) {
          const x = a.x - (span - 1) / 2 + i;
          expect(wallPiece(m, x, a.y)).toBe('wall');
          expect(isOpen(getTile(m, x, a.y - 1))).toBe(false);
          // Only the neon and the chart hang high enough to show over a counter.
          const front = getTile(m, x, a.y + 1);
          if (a.art === 'neon' || a.art === 'growthChart')
            expect(['floor', 'counter']).toContain(front);
          else expect(front).toBe('floor');
        }
      }
      // Nothing overlaps on the wall.
      for (const a of art)
        for (const b of art)
          if (a !== b && a.y === b.y)
            expect(Math.abs(a.x - b.x)).toBeGreaterThan(
              LOFT_ART_HALF[a.art] + LOFT_ART_HALF[b.art],
            );
      // The dashboard and the cheque keep a bare tile between them.
      const [dash, cheque] = (['dashboard', 'cheque'] as const).map((n) =>
        art.find((a) => a.art === n),
      );
      if (dash && cheque && dash.y === cheque.y)
        expect(Math.abs(dash.x - cheque.x)).toBeGreaterThanOrEqual(3.5);
    }
    // The dashboard on the right half of the wall, off the middle where ticket labels pop up.
    for (const m of maps) {
      const dash = loftRoom(m).wallArt.find((a) => a.art === 'dashboard');
      expect(dash?.x).toBeGreaterThanOrEqual((m.width - 1) / 2);
    }
    // On the shipped map the wall is full: the growth chart goes over the counter in the corner.
    expect(loftRoom(shipped).wallArt.find((a) => a.art === 'growthChart')).toEqual({
      x: 12,
      y: 0,
      art: 'growthChart',
    });
    // The draft's longer wall has room for the neon and the second screen, on the right half.
    const errors = loftRoom(draft).wallArt.find((a) => a.art === 'errors');
    expect(errors?.x).toBeGreaterThan((draft.width - 1) / 2);
    expect(loftRoom(draft).wallArt.map((a) => a.art)).toContain('neon');
  });

  it('puts wear only on floor, never on a spawn, the tyre marks in from the lift', () => {
    for (const m of maps) {
      const { floorWear, liftDoor } = loftRoom(m);
      const spawns = new Set(m.spawns.map((s) => `${s.x},${s.y}`));
      for (const [k, w] of Object.entries(floorWear)) {
        const [x = 0, y = 0] = k.split(',').map(Number);
        expect(getTile(m, x, y)).toBe('floor');
        expect(spawns.has(k)).toBe(false);
        if (w >= POLISHED_WEAR.tyres && w <= POLISHED_WEAR.tyresFaintX)
          expect(liftDoor?.tiles.some((t) => Math.abs(t.x - x) + Math.abs(t.y - y) <= 3)).toBe(
            true,
          );
      }
      const kinds = new Set(Object.values(floorWear));
      expect(kinds.has(POLISHED_WEAR.tyres) || kinds.has(POLISHED_WEAR.tyresX)).toBe(true);
      expect(kinds.has(POLISHED_WEAR.tyresMid) || kinds.has(POLISHED_WEAR.tyresMidX)).toBe(true);
      expect(kinds.has(POLISHED_WEAR.floorBox) || kinds.has(POLISHED_WEAR.floorBoxZ)).toBe(true);
    }
  });

  it('runs the cable channel between the two desk islands on the shipped map, a floor box each end', () => {
    const wear = loftRoom(shipped).floorWear;
    expect([5, 6, 7, 8].map((x) => wear[`${x},4`])).toEqual([
      POLISHED_WEAR.floorBox,
      POLISHED_WEAR.channelX,
      POLISHED_WEAR.channelX,
      POLISHED_WEAR.floorBox,
    ]);
  });

  it('lays one 2×2 rug against a wall, at least two tiles from every spawn', () => {
    for (const m of maps) {
      const wear = loftRoom(m).floorWear;
      const nw = Object.entries(wear).filter(([, w]) => w === POLISHED_WEAR.rugNW);
      expect(nw).toHaveLength(1);
      const [x = 0, y = 0] = (nw[0]?.[0] ?? '').split(',').map(Number);
      expect(wear[`${x + 1},${y}`]).toBe(POLISHED_WEAR.rugNE);
      expect(wear[`${x},${y + 1}`]).toBe(POLISHED_WEAR.rugSW);
      expect(wear[`${x + 1},${y + 1}`]).toBe(POLISHED_WEAR.rugSE);
      for (const s of m.spawns)
        expect(Math.max(Math.abs(s.x - x - 0.5), Math.abs(s.y - y - 0.5))).toBeGreaterThan(2);
    }
  });

  it('puts wall-top clusters only where nothing open is behind, low clusters on the front edge', () => {
    for (const m of maps) {
      const { capProps, frontProps } = loftRoom(m);
      expect(capProps.length).toBeGreaterThanOrEqual(6);
      expect(capProps.length).toBeLessThanOrEqual(
        LOFT_CAP_CLUSTERS.back + 2 * LOFT_CAP_CLUSTERS.side,
      );
      for (const p of capProps) {
        expect(getTile(m, p.x, p.y)).toBe('wall');
        expect(isOpen(getTile(m, p.x, p.y - 1))).toBe(false);
        // One whole cluster per tile, well apart: the rest of the wall bare.
        expect(p.toward).toEqual({ dx: 0, dy: 0 });
        for (const q of capProps)
          if (q !== p)
            expect(Math.max(Math.abs(q.x - p.x), Math.abs(q.y - p.y))).toBeGreaterThanOrEqual(2);
      }
      expect(frontProps.length).toBeLessThanOrEqual(LOFT_CAP_CLUSTERS.front);
      expect(frontProps.length).toBeGreaterThan(0);
      for (const p of frontProps) {
        expect(p.y).toBe(m.height - 1);
        expect(wallPiece(m, p.x, p.y)).toBe('wall-front');
        expect(isOpen(getTile(m, p.x, p.y - 1))).toBe(true);
      }
    }
  });

  it('puts one low cluster each side of a ship hatch on the front edge, nothing between', () => {
    const { frontProps, roofDoor } = loftRoom(shipped);
    const xs = roofDoor?.tiles.map((t) => t.x) ?? [];
    expect(frontProps.map((p) => p.x)).toEqual([2, 11]);
    expect(frontProps.filter((p) => p.x < Math.min(...xs))).toHaveLength(1);
    expect(frontProps.filter((p) => p.x > Math.max(...xs))).toHaveLength(1);
  });

  it('stands black steel posts at the corners and every few tiles, clear of doors and art', () => {
    for (const m of maps) {
      const { posts, wallArt, liftDoor, roofDoor } = loftRoom(m);
      expect(posts.length).toBeGreaterThanOrEqual(8);
      for (const p of posts) {
        // On a tile edge along its wall.
        const along = p.side === 'back' ? p.x : p.y;
        expect(Math.abs(along - Math.floor(along) - 0.5)).toBeLessThan(1e-9);
        const { x, y } = p;
        for (const d of [liftDoor, roofDoor])
          for (const t of d?.tiles ?? [])
            expect(Math.abs(t.x - x) + Math.abs(t.y - y)).toBeGreaterThan(0.5);
        if (p.side === 'back')
          for (const a of wallArt)
            if (a.y === p.y) expect(Math.abs(a.x - p.x)).toBeGreaterThan(LOFT_ART_HALF[a.art]);
      }
    }
    // The shipped room's four corners each get one.
    const keys = new Set(loftRoom(shipped).posts.map((p) => `${p.side}:${p.x},${p.y}`));
    for (const k of ['back:0.5,0', 'left:0,0.5', 'left:0,8.5', 'right:13,0.5', 'right:13,8.5'])
      expect(keys.has(k)).toBe(true);
  });

  it('slides a globe along its row clear of the stations, never off the room', () => {
    for (const m of maps)
      for (let x = 1; x < m.width - 1; x += 0.5) {
        const fit = globeFit(gridToWorld(x, 0.95, 2), m);
        if (!fit) continue;
        expect(Math.abs(fit.x - x)).toBeLessThanOrEqual(1.5);
        expect(isOpen(getTile(m, Math.round(fit.x), 1))).toBe(true);
      }
    // Over the open back wall of the shipped map a globe stays put.
    expect(globeFit(gridToWorld(6.5, 0.95, 2), shipped)?.x).toBeCloseTo(gridToWorld(6.5, 0, 0).x);
  });

  it('is deterministic', () => {
    for (const m of maps) expect(loftRoom(m)).toEqual(loftRoom(m));
  });
});
