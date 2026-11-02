import { describe, expect, it } from 'vitest';
import { getTile, parseLevelMap } from '../../../sim/level';
import { parseDraftMap } from '../../../sim/draftMap';
import { OPEN_PLAN } from '../../../sim/levels';
import draftText from '../../../../maps/drafts/open-plan.txt?raw';
import { wallPiece } from '../../mapShape';
import { WALL_DECO_MODELS } from '../roomModels';
import { gridToWorld } from '../../projection';
import { atmosphereFor, lampSpots } from '../atmosphere';
import {
  CAP_CLUSTERS,
  CARPET_WEAR,
  STRIP_HALF,
  officeParkRoom,
  stripLightFit,
} from './officeParkRoom';

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

  it('keeps the wall-top clutter to a few clusters a wall, the rest bare', () => {
    for (const map of maps) {
      const { capProps } = officeParkRoom(map);
      const at = new Set(capProps.map((p) => `${p.x},${p.y}`));
      // A cluster: one prop alone, or two on touching tiles leaning toward each other.
      const clusters: (typeof capProps)[] = [];
      for (const p of capProps) {
        const { dx, dy } = p.toward;
        const partner = clusters.find((c) =>
          c.some((q) => q.x === p.x + dx && q.y === p.y + dy && (dx !== 0 || dy !== 0)),
        );
        if (partner) partner.push(p);
        else clusters.push([p]);
      }
      for (const c of clusters) expect(c.length).toBeLessThanOrEqual(2);
      const back = clusters.filter((c) => c.every((p) => getTile(map, p.x, p.y + 1) === 'floor'));
      const sides = clusters.filter((c) => !back.includes(c));
      expect(back.length).toBeLessThanOrEqual(CAP_CLUSTERS.back);
      expect(sides.filter((c) => (c[0]?.x ?? 0) < map.width / 2).length).toBeLessThanOrEqual(
        CAP_CLUSTERS.side,
      );
      expect(sides.filter((c) => (c[0]?.x ?? 0) >= map.width / 2).length).toBeLessThanOrEqual(
        CAP_CLUSTERS.side,
      );
      expect(at.size).toBe(capProps.length);
    }
  });

  it('hangs no strip light over a station or desk in the rows round it, and keeps it inside', () => {
    const atmosphere = atmosphereFor('open-plan');
    for (const map of maps) {
      const spots = lampSpots(atmosphere, map);
      const fits = spots.map((s) => stripLightFit(s, map)).filter((f) => f !== null);
      // Some fittings stay on each map.
      expect(fits.length).toBeGreaterThanOrEqual(2);
      for (const f of fits) {
        for (let y = Math.floor(f.z) - 1; y <= Math.floor(f.z + 0.5); y++)
          for (let x = 0; x < map.width; x++) {
            const t = getTile(map, x, y);
            if (t === null || t === 'floor' || t === 'wall' || t === 'void') continue;
            expect(Math.abs(x - f.x), `${t} at ${x},${y}`).toBeGreaterThanOrEqual(0.5 + STRIP_HALF);
          }
        for (const end of [f.x - STRIP_HALF, f.x + STRIP_HALF])
          expect(getTile(map, Math.round(end), Math.floor(f.z + 0.5))).not.toBe('wall');
      }
    }
    // A spot already clear stays where it is; one with no room anywhere is left out.
    const open = parseLevelMap(['#########', '#.......#', '#.12.34.#', '#########'].join('\n'));
    expect(stripLightFit(gridToWorld(4, 0.75, 2), open)).toEqual(gridToWorld(4, 0.75, 2));
    const full = parseLevelMap(['#KKKKKKK#', '#.......#', '#.12.34.#', '#########'].join('\n'));
    expect(stripLightFit(gridToWorld(4, 0.75, 2), full)).toBeNull();
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
      // A few clusters, spread out, never side by side.
      expect(frontProps.length).toBeLessThanOrEqual(CAP_CLUSTERS.front);
      const xs = frontProps.map((p) => p.x).sort((a, b) => a - b);
      for (let i = 1; i < xs.length; i++)
        expect((xs[i] ?? 0) - (xs[i - 1] ?? 0)).toBeGreaterThan(2);
    }
  });

  it('is deterministic', () => {
    for (const map of maps) expect(officeParkRoom(map)).toEqual(officeParkRoom(map));
  });
});
