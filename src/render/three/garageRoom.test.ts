import { describe, expect, it } from 'vitest';
import { getTile, isWorkSurface, parseLevelMap } from '../../sim/level';
import { parseDraftMap } from '../../sim/draftMap';
import { GARAGE } from '../../sim/levels';
import draftText from '../../../maps/drafts/garage.txt?raw';
import { SLAB_WEAR, garageRoom } from './garageRoom';
import { WALL_DECO_MODELS } from './roomModels';

describe('garageRoom', () => {
  const shipped = GARAGE.map;
  const draft = parseDraftMap(draftText);

  it('opens the roll-up door at the ship hatch on the front edge', () => {
    expect(garageRoom(shipped).opening).toEqual({ y: 9, x0: 6, x1: 6 });
    expect(garageRoom(draft).opening).toEqual({ y: 6, x0: 3, x1: 4 });
  });

  it('puts a closed door past a pier on the longer side, between walls', () => {
    for (const map of [shipped, draft]) {
      const { door, opening } = garageRoom(map);
      expect(door).toHaveLength(2);
      if (!opening) throw new Error('no opening');
      for (const t of door) {
        expect(t.y).toBe(opening.y);
        expect(getTile(map, t.x, t.y)).toBe('wall');
      }
      const [a, b] = door;
      if (!a || !b) throw new Error('no door');
      // A pier between the doors, and wall at the far end.
      expect(Math.min(Math.abs(a.x - opening.x1), Math.abs(b.x - opening.x0))).toBe(2);
      expect(getTile(map, a.x - 1, a.y)).toBe('wall');
      expect(getTile(map, b.x + 1, b.y)).toBe('wall');
    }
    expect(garageRoom(shipped).door.map((t) => t.x)).toEqual([8, 9]);
  });

  it('has no closed door without room for one', () => {
    const map = parseLevelMap(['######', '#1234#', '##S###'].join('\n'));
    expect(garageRoom(map).opening).not.toBeNull();
    expect(garageRoom(map).door).toEqual([]);
  });

  it('frames the inbox on the back edge as the house door, a doormat in front', () => {
    for (const map of [shipped, draft]) {
      const { houseDoor, doormat } = garageRoom(map);
      if (!houseDoor) throw new Error('no house door');
      expect(getTile(map, houseDoor.x, houseDoor.y)).toBe('inbox');
      expect(houseDoor.y).toBe(0);
      expect(doormat).toEqual({ x: houseDoor.x, y: 1 });
    }
  });

  it('hangs the banner on bare back wall, away from the house door', () => {
    const banner = garageRoom(shipped).banner;
    expect(banner).toEqual({ x: 10, y: 0, width: 3 });
    // The draft's back wall is all stations: no room for it.
    expect(garageRoom(draft).banner).toBeNull();
  });

  it('drips the oil stain on bare floor just inside the door, never on a spawn', () => {
    for (const map of [shipped, draft]) {
      const { oilStain, opening } = garageRoom(map);
      if (!oilStain || !opening) throw new Error('no stain');
      expect(opening.y - oilStain.y).toBe(1);
      for (const x of [Math.floor(oilStain.x), Math.ceil(oilStain.x)]) {
        expect(getTile(map, x, oilStain.y)).toBe('floor');
        expect(map.spawns).not.toContainEqual({ x, y: oilStain.y });
      }
    }
  });

  it('wears the slab: tracks in from the door, one drain, a few cracks apart, all on floor', () => {
    for (const map of [shipped, draft]) {
      const { floorWear, opening } = garageRoom(map);
      if (!opening) throw new Error('no opening');
      const at = (w: number) =>
        Object.entries(floorWear)
          .filter(([, v]) => v === w)
          .map(([k]) => k.split(',').map(Number) as [number, number]);
      for (const k of Object.keys(floorWear)) {
        const [x = 0, y = 0] = k.split(',').map(Number);
        expect(getTile(map, x, y), k).toBe('floor');
      }
      expect(floorWear[`${opening.x0},${opening.y - 1}`]).toBe(SLAB_WEAR.tracks);
      expect(at(SLAB_WEAR.drain)).toHaveLength(1);
      const cracks = at(SLAB_WEAR.crack);
      expect(cracks.length).toBeGreaterThanOrEqual(2);
      expect(cracks.length).toBeLessThanOrEqual(3);
      for (const [i, a] of cracks.entries())
        for (const b of cracks.slice(i + 1))
          expect(Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]))).toBeGreaterThanOrEqual(3);
      // Nothing worn under a spawn but the door's tracks.
      for (const p of map.spawns) {
        const w = floorWear[`${p.x},${p.y}`];
        if (w !== undefined) expect([SLAB_WEAR.tracks, SLAB_WEAR.tracksFaint]).toContain(w);
      }
    }
  });

  it('piles wall-top junk in clusters of one or two, with bare wall between', () => {
    for (const map of [shipped, draft]) {
      const { capProps } = garageRoom(map);
      expect(capProps.length).toBeGreaterThan(0);
      const keys = new Set(capProps.map((p) => `${p.x},${p.y}`));
      expect(keys.size).toBe(capProps.length);
      for (const p of capProps) {
        expect(getTile(map, p.x, p.y)).toBe('wall');
        expect(getTile(map, p.x, p.y - 1)).not.toBe('floor');
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ] as const)
          expect(isWorkSurface(getTile(map, p.x + dx, p.y + dy))).toBe(false);
        // A partner, if any, is a neighbour that points back.
        if (p.toward.dx || p.toward.dy) {
          const other = capProps.find(
            (q) => q.x === p.x + p.toward.dx && q.y === p.y + p.toward.dy,
          );
          expect(other && other.toward.dx + p.toward.dx).toBe(0);
          expect(other && other.toward.dy + p.toward.dy).toBe(0);
        }
      }
      expect(capProps.some((p) => p.toward.dx || p.toward.dy)).toBe(true);
    }
  });

  it('lays low junk on the front wall, clear of both doors', () => {
    for (const map of [shipped, draft]) {
      const { frontProps, opening, door } = garageRoom(map);
      if (!opening) throw new Error('no opening');
      expect(frontProps.length).toBeGreaterThan(0);
      for (const p of frontProps) {
        expect(p.y).toBe(opening.y);
        expect(getTile(map, p.x, p.y)).toBe('wall');
        expect(p.x < opening.x0 - 1 || p.x > opening.x1 + 1).toBe(true);
        expect(door.some((t) => t.x === p.x)).toBe(false);
      }
    }
  });

  it('hangs something on every wall facing open floor, the pegboard on the back wall', () => {
    for (const map of [shipped, draft]) {
      const { decos } = garageRoom(map);
      for (const [key, deco] of Object.entries(decos)) {
        const [x = 0, y = 0] = key.split(',').map(Number);
        expect(getTile(map, x, y), key).toBe('wall');
        expect(getTile(map, x, y + 1), key).toBe('floor');
        expect(WALL_DECO_MODELS[deco], deco).toBeDefined();
      }
      expect(Object.entries(decos).find(([k]) => k.endsWith(',0'))?.[1]).toBe('pegboard');
    }
    expect(Object.keys(garageRoom(shipped).decos)).toHaveLength(6);
  });

  it('is deterministic', () => {
    expect(garageRoom(shipped)).toEqual(garageRoom(shipped));
  });
});
