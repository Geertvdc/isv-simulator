import { describe, expect, it } from 'vitest';
import { getTile } from '../../../sim/level';
import { parseDraftMap } from '../../../sim/draftMap';
import { SEED_ROUND } from '../../../sim/levels';
import draftText from '../../../../maps/drafts/seed-round.txt?raw';
import { wallPiece } from '../../mapShape';
import { gridToWorld } from '../../projection';
import { POLISHED_WEAR, globeFit, loftRoom } from './loftRoom';

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

  it('hangs each piece of art once, on back walls facing the room, the wide ones on two tiles', () => {
    for (const m of maps) {
      const art = loftRoom(m).wallArt;
      const names = art.map((a) => a.art);
      expect(new Set(names).size).toBe(names.length);
      for (const must of ['dashboard', 'cheque', 'growthChart', 'neon'] as const)
        expect(names).toContain(must);
      for (const a of art) {
        const wide = a.art === 'dashboard' || a.art === 'cheque';
        expect(Number.isInteger(a.x)).toBe(!wide);
        for (const x of [Math.floor(a.x), Math.ceil(a.x)]) {
          expect(wallPiece(m, x, a.y)).toBe('wall');
          expect(isOpen(getTile(m, x, a.y - 1))).toBe(false);
          // Only the neon hangs high enough to show over a counter; the rest want floor in front.
          const front = getTile(m, x, a.y + 1);
          if (a.art === 'neon') expect(['floor', 'counter']).toContain(front);
          else expect(front).toBe('floor');
        }
      }
      // The dashboard and the cheque keep a bare tile between them.
      const [dash, cheque] = (['dashboard', 'cheque'] as const).map((n) =>
        art.find((a) => a.art === n),
      );
      if (dash && cheque && dash.y === cheque.y)
        expect(Math.abs(dash.x - cheque.x)).toBeGreaterThanOrEqual(3);
    }
    // On the shipped map the neon goes over the counter in the back corner.
    expect(loftRoom(shipped).wallArt.find((a) => a.art === 'neon')).toEqual({
      x: 12,
      y: 0,
      art: 'neon',
    });
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
      expect(kinds.has(POLISHED_WEAR.floorBox)).toBe(true);
    }
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
      for (const p of capProps) {
        expect(getTile(m, p.x, p.y)).toBe('wall');
        expect(isOpen(getTile(m, p.x, p.y - 1))).toBe(false);
      }
      expect(frontProps.length).toBeGreaterThan(0);
      for (const p of frontProps) {
        expect(p.y).toBe(m.height - 1);
        expect(wallPiece(m, p.x, p.y)).toBe('wall-front');
        expect(isOpen(getTile(m, p.x, p.y - 1))).toBe(true);
      }
    }
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
