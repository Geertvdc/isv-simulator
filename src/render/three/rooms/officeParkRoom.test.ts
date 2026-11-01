import { describe, expect, it } from 'vitest';
import { getTile, parseLevelMap } from '../../../sim/level';
import { parseDraftMap } from '../../../sim/draftMap';
import { OPEN_PLAN } from '../../../sim/levels';
import draftText from '../../../../maps/drafts/open-plan.txt?raw';
import { wallPiece } from '../../mapShape';
import { WALL_DECO_MODELS } from '../roomModels';
import { CARPET_WEAR, officeParkRoom } from './officeParkRoom';

const coords = (k: string) => k.split(',').map(Number) as [number, number];

describe('officeParkRoom', () => {
  const shipped = OPEN_PLAN.map;
  const draft = parseDraftMap(draftText);
  const maps = [shipped, draft];

  it('frames the inbox as the lobby door and the ship hatch as the front door, wherever they are', () => {
    const a = officeParkRoom(shipped);
    expect(a.lobbyDoor).toEqual({
      side: 'back',
      tiles: [
        { x: 2, y: 0 },
        { x: 3, y: 0 },
      ],
      mid: { x: 2.5, y: 0 },
    });
    expect(a.frontDoor?.side).toBe('front');
    expect(a.frontDoor?.mid).toEqual({ x: 9.5, y: 9 });
    // The draft's lobby door is on the front edge too.
    const b = officeParkRoom(draft);
    expect(b.lobbyDoor?.side).toBe('front');
    expect(b.lobbyDoor?.mid).toEqual({ x: 4.5, y: 8 });
    expect(b.frontDoor?.mid).toEqual({ x: 9.5, y: 8 });
    // A ship hatch on the right edge gets its door there.
    const side = parseLevelMap(['#####', '#12.#', '#34.S', '##I##'].join('\n'));
    expect(officeParkRoom(side).frontDoor).toEqual({
      side: 'right',
      tiles: [{ x: 4, y: 2 }],
      mid: { x: 4, y: 2 },
    });
    expect(officeParkRoom(side).lobbyDoor?.side).toBe('front');
  });

  it('lays the lobby mat on the floor just inside the lobby door', () => {
    for (const map of maps) {
      const { lobbyMat, lobbyDoor } = officeParkRoom(map);
      expect(lobbyMat.length).toBe(lobbyDoor?.tiles.length);
      for (const p of lobbyMat) expect(getTile(map, p.x, p.y)).toBe('floor');
    }
  });

  it('runs the old glass partitions along full-height side walls, at most three a side', () => {
    for (const map of maps) {
      const { swaps } = officeParkRoom(map);
      const keys = Object.keys(swaps);
      expect(keys.length).toBeGreaterThan(0);
      for (const k of keys) {
        const [x, y] = coords(k);
        expect(swaps[k]).toBe('partitionZ');
        expect(getTile(map, x, y)).toBe('wall');
        expect(wallPiece(map, x, y)).not.toBe('wall-front');
        expect([getTile(map, x - 1, y), getTile(map, x + 1, y)]).toContain('floor');
      }
      for (const side of [0, map.width - 1])
        expect(keys.filter((k) => coords(k)[0] === side).length).toBeLessThanOrEqual(3);
    }
    expect(Object.keys(officeParkRoom(draft).swaps)).toEqual(['0,5', '0,6', '0,7', '15,7']);
  });

  it('hangs the office things on walls facing open floor, the fire-exit sign once', () => {
    for (const map of maps) {
      const { decos } = officeParkRoom(map);
      const entries = Object.entries(decos);
      expect(entries.length).toBeGreaterThanOrEqual(5);
      for (const [k, deco] of entries) {
        const [x, y] = coords(k);
        expect(wallPiece(map, x, y), k).toBe('wall');
        expect(getTile(map, x, y + 1), k).toBe('floor');
        expect(WALL_DECO_MODELS[deco], deco).toBeDefined();
        // No neighbour along the wall hangs the same.
        expect(decos[`${x + 1},${y}`]).not.toBe(deco);
      }
      expect(entries.filter(([, d]) => d === 'fireExit')).toHaveLength(1);
      expect(new Set(entries.map(([, d]) => d)).size).toBeGreaterThanOrEqual(5);
    }
  });

  it('wears the carpet: a path in from the front door, mats, one cable cover, a few stains, never on a spawn', () => {
    for (const map of maps) {
      const { floorWear, frontDoor, lobbyMat } = officeParkRoom(map);
      const at = (...w: number[]) =>
        Object.entries(floorWear)
          .filter(([, v]) => w.includes(v))
          .map(([k]) => coords(k));
      for (const k of Object.keys(floorWear)) {
        const [x, y] = coords(k);
        expect(getTile(map, x, y), k).toBe('floor');
      }
      for (const p of [...map.spawns, ...lobbyMat])
        expect(floorWear[`${p.x},${p.y}`]).toBeUndefined();
      for (const t of frontDoor?.tiles ?? []) {
        expect(floorWear[`${t.x},${t.y - 1}`]).toBe(CARPET_WEAR.entrance);
        expect(floorWear[`${t.x},${t.y - 2}`]).toBe(CARPET_WEAR.path);
      }
      const stains = at(CARPET_WEAR.coffee);
      expect(stains.length).toBeGreaterThan(0);
      expect(stains.length).toBeLessThanOrEqual(3);
      const cable = at(CARPET_WEAR.cableX, CARPET_WEAR.cableZ);
      expect(cable.length).toBeGreaterThan(0);
      expect(cable.length).toBeLessThanOrEqual(3);
      for (const [x, y] of at(CARPET_WEAR.chairMat))
        expect(
          [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
          ].some(([dx = 0, dy = 0]) => getTile(map, x + dx, y + dy) === 'keyboard'),
        ).toBe(true);
    }
  });

  it('clusters clutter on full wall tops, clear of the doors, partitions and anyone behind', () => {
    for (const map of maps) {
      const { capProps, swaps, lobbyDoor, frontDoor } = officeParkRoom(map);
      expect(capProps.length).toBeGreaterThanOrEqual(5);
      expect(new Set(capProps.map((p) => `${p.x},${p.y}`)).size).toBe(capProps.length);
      const doors = [...(lobbyDoor?.tiles ?? []), ...(frontDoor?.tiles ?? [])];
      for (const p of capProps) {
        expect(getTile(map, p.x, p.y)).toBe('wall');
        expect(wallPiece(map, p.x, p.y)).not.toBe('wall-front');
        expect(getTile(map, p.x, p.y - 1)).not.toBe('floor');
        expect(swaps[`${p.x},${p.y}`]).toBeUndefined();
        for (const d of doors)
          expect(Math.max(Math.abs(d.x - p.x), Math.abs(d.y - p.y))).toBeGreaterThan(1);
      }
      // Three or more on the back wall.
      expect(capProps.filter((p) => p.y === 0).length).toBeGreaterThanOrEqual(3);
    }
  });

  it('lays low things on the front wall, clear of the doors', () => {
    for (const map of maps) {
      const { frontProps, lobbyDoor, frontDoor } = officeParkRoom(map);
      expect(frontProps.length).toBeGreaterThan(0);
      const doors = [...(lobbyDoor?.tiles ?? []), ...(frontDoor?.tiles ?? [])];
      for (const p of frontProps) {
        expect(p.y).toBe(map.height - 1);
        expect(wallPiece(map, p.x, p.y)).toBe('wall-front');
        for (const d of doors) expect(Math.abs(d.x - p.x) > 1 || d.y !== p.y).toBe(true);
      }
    }
  });

  it('is deterministic', () => {
    for (const map of maps) expect(officeParkRoom(map)).toEqual(officeParkRoom(map));
  });
});
