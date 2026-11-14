import { describe, expect, it } from 'vitest';
import { getTile } from '../../../sim/level';
import { parseDraftMap } from '../../../sim/draftMap';
import { ON_CALL } from '../../../sim/levels';
import draftText from '../../../../maps/drafts/on-call.txt?raw';
import { wallPiece } from '../../mapShape';
import { atmosphereFor, lampSpots } from '../atmosphere';
import { WALL_HEIGHT } from '../layout';
import {
  BASEMENT_ART_HALF,
  BASEMENT_CAP_CLUSTERS,
  BATTEN_HALF,
  RAISED_WEAR,
  TRAY_Y,
  basementRoom,
  battenFit,
  innerWalls,
  pagerBoardTile,
} from './basementRoom';

describe('basementRoom', () => {
  const shipped = ON_CALL.map;
  const draft = parseDraftMap(draftText);
  const maps = [shipped, draft];
  const isOpen = (t: ReturnType<typeof getTile>) => t !== null && t !== 'wall' && t !== 'void';
  const cheb = (a: { x: number; y: number }, b: { x: number; y: number }) =>
    Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

  it('frames the inbox as the pager door: on the back edge shipped, on the left in the draft', () => {
    const door = basementRoom(shipped).pagerDoor;
    expect(door?.side).toBe('back');
    expect(door?.tiles.map((t) => t.x)).toEqual([2, 3]);
    for (const t of door?.tiles ?? []) expect(getTile(shipped, t.x, t.y)).toBe('inbox');
    const left = basementRoom(draft).pagerDoor;
    expect(left?.side).toBe('left');
    expect(left?.tiles).toHaveLength(2);
    for (const t of left?.tiles ?? []) expect(getTile(draft, t.x, t.y)).toBe('inbox');
  });

  it('props the fire door open against a full wall beside it, floor in front', () => {
    for (const m of maps) {
      const { pagerDoor, pagerLeaf } = basementRoom(m);
      expect(Math.abs(pagerLeaf)).toBe(1);
      expect(pagerDoor).not.toBeNull();
    }
  });

  it('frames every ship hatch on the front edge as the uplink, its patch frame on the low wall beside', () => {
    for (const m of maps) {
      const { uplinks } = basementRoom(m);
      expect(uplinks.length).toBeGreaterThan(0);
      for (const { door, frame } of uplinks) {
        expect(door.side).toBe('front');
        for (const t of door.tiles) expect(getTile(m, t.x, t.y)).toBe('ship');
        expect(frame).not.toBeNull();
        if (!frame) continue;
        expect(wallPiece(m, frame.x, frame.y)).toBe('wall-front');
        expect(frame.y).toBe(door.mid.y);
        expect(Math.min(...door.tiles.map((t) => Math.abs(t.x - frame.x)))).toBe(1);
      }
    }
    expect(basementRoom(shipped).uplinks.map((u) => u.door.tiles.map((t) => t.x))).toEqual([
      [6, 7],
    ]);
    expect(basementRoom(draft).uplinks.map((u) => u.door.tiles.map((t) => t.x))).toEqual([[2, 3]]);
  });

  it('builds every one of the server room’s walls as the cage (the low ones too), and only those', () => {
    for (const m of maps) {
      const { swaps } = basementRoom(m);
      const inner = innerWalls(m).flatMap((r) => r.map((p) => `${p.x},${p.y}`));
      expect(Object.keys(swaps).sort()).toEqual([...inner].sort());
      for (const [k, name] of Object.entries(swaps)) {
        const [x = 0, y = 0] = k.split(',').map(Number);
        expect(name.startsWith(`cage:${wallPiece(m, x, y)}:`)).toBe(true);
      }
      expect(
        Object.keys(swaps).some((k) => {
          const [x = 0, y = 0] = k.split(',').map(Number);
          return wallPiece(m, x, y) === 'wall-front';
        }),
      ).toBe(true);
    }
  });

  it('stands the pager board on the first wall tile past the inbox run, off the inbox', () => {
    expect(pagerBoardTile(shipped)).toEqual({ x: 4, y: 0 });
    expect(pagerBoardTile(draft)).toEqual({ x: 0, y: 4 });
    for (const m of maps) {
      const { pagerBoard, pagerDoor } = basementRoom(m);
      expect(pagerBoard).toEqual(pagerBoardTile(m));
      if (!pagerBoard) continue;
      expect(getTile(m, pagerBoard.x, pagerBoard.y)).toBe('wall');
      for (const t of pagerDoor?.tiles ?? []) expect(cheb(t, pagerBoard)).toBeGreaterThanOrEqual(1);
      // Nothing else on that wall top.
      const { capProps, wallArt } = basementRoom(m);
      for (const p of capProps) expect(p.x === pagerBoard.x && p.y === pagerBoard.y).toBe(false);
      for (const a of wallArt) expect(a.x === pagerBoard.x && a.y === pagerBoard.y).toBe(false);
    }
  });

  it('lifts the one floor tile in a corner out of the way: walls on two sides at right angles', () => {
    for (const m of maps) {
      const lifted = Object.entries(basementRoom(m).floorWear).filter(
        ([, w]) => w >= RAISED_WEAR.lifted && w < RAISED_WEAR.scuffs,
      );
      expect(lifted).toHaveLength(1);
      const [k = '', w = 0] = lifted[0] ?? [];
      const [x = 0, y = 0] = k.split(',').map(Number);
      const corner = w - RAISED_WEAR.lifted;
      const wall = (dx: number, dy: number) => getTile(m, x + dx, y + dy) === 'wall';
      expect(wall(0, corner < 2 ? -1 : 1)).toBe(true);
      expect(wall(corner % 2 ? 1 : -1, 0)).toBe(true);
    }
  });

  it('hangs each piece once, on wall faces with floor in front, clear of the doors and each other', () => {
    for (const m of maps) {
      const { wallArt, pagerDoor, uplinks } = basementRoom(m);
      const names = wallArt.map((a) => a.art);
      expect(new Set(names).size).toBe(names.length);
      for (const n of ['runbook', 'authorised', 'fireExit', 'breaker', 'thermostat', 'unplug'])
        expect(names).toContain(n);
      const doors = [pagerDoor, ...uplinks.map((u) => u.door)];
      for (const a of wallArt) {
        expect(wallPiece(m, a.x, a.y)).toBe('wall');
        expect(isOpen(getTile(m, a.x, a.y - 1))).toBe(false);
        expect(getTile(m, a.x, a.y + 1)).toBe('floor');
        for (const d of doors)
          for (const t of d?.tiles ?? []) expect(cheb(t, a)).toBeGreaterThan(1);
      }
      for (const a of wallArt)
        for (const b of wallArt)
          if (a !== b && a.y === b.y)
            expect(Math.abs(a.x - b.x)).toBeGreaterThan(
              BASEMENT_ART_HALF[a.art] + BASEMENT_ART_HALF[b.art],
            );
    }
    // The server room sign hangs on the server room's own wall where it shows a face.
    for (const m of maps) {
      const sign = basementRoom(m).wallArt.find((a) => a.art === 'authorised');
      const inner = new Set(innerWalls(m).flatMap((r) => r.map((p) => `${p.x},${p.y}`)));
      expect(sign && inner.has(`${sign.x},${sign.y}`)).toBe(true);
    }
  });

  it('puts wear only on floor, never on a spawn, the lifted tile well away from every spawn', () => {
    for (const m of maps) {
      const { floorWear } = basementRoom(m);
      const spawns = new Set(m.spawns.map((s) => `${s.x},${s.y}`));
      const kinds = Object.values(floorWear);
      for (const [k, w] of Object.entries(floorWear)) {
        const [x = 0, y = 0] = k.split(',').map(Number);
        expect(getTile(m, x, y)).toBe('floor');
        expect(spawns.has(k)).toBe(false);
        if (w >= RAISED_WEAR.lifted && w < RAISED_WEAR.scuffs)
          for (const s of m.spawns) expect(cheb(s, { x, y })).toBeGreaterThan(2);
      }
      expect(kinds.filter((w) => w >= RAISED_WEAR.lifted && w < RAISED_WEAR.scuffs)).toHaveLength(
        1,
      );
      expect(
        kinds.filter((w) => w >= RAISED_WEAR.vent && w < RAISED_WEAR.lifted).length,
      ).toBeGreaterThan(3);
      expect(kinds).toContain(RAISED_WEAR.scuffs);
    }
  });

  it('lays the vent tiles along the server room’s walls, their vents on the wall side', () => {
    for (const m of maps) {
      const inner = new Set(innerWalls(m).flatMap((r) => r.map((p) => `${p.x},${p.y}`)));
      const step = [
        [0, -1],
        [0, 1],
        [-1, 0],
        [1, 0],
      ] as const;
      for (const [k, w] of Object.entries(basementRoom(m).floorWear)) {
        if (w < RAISED_WEAR.vent || w >= RAISED_WEAR.lifted) continue;
        const [x = 0, y = 0] = k.split(',').map(Number);
        const [dx, dy] = step[w - RAISED_WEAR.vent] ?? [0, 0];
        expect(inner.has(`${x + dx},${y + dy}`)).toBe(true);
      }
    }
  });

  it('puts wall-top clusters only where nothing open is behind, 3–4 per long wall, low ones on the front wall', () => {
    for (const m of maps) {
      const { capProps, frontProps, trays, uplinks, cans } = basementRoom(m);
      expect(capProps.length).toBeGreaterThan(4);
      expect(capProps.length).toBeLessThanOrEqual(
        2 * (BASEMENT_CAP_CLUSTERS.back + 2 * BASEMENT_CAP_CLUSTERS.side),
      );
      for (const p of capProps)
        if (p.toward.dx || p.toward.dy)
          expect(
            capProps.some(
              (q) =>
                q.x === p.x + p.toward.dx &&
                q.y === p.y + p.toward.dy &&
                q.toward.dx === -p.toward.dx &&
                q.toward.dy === -p.toward.dy,
            ),
          ).toBe(true);
      const posts = trays.flatMap((t) => t.posts.map((p) => `${p.x},${p.y}`));
      for (const p of [...capProps, ...(cans ? [cans] : [])]) {
        expect(getTile(m, p.x, p.y)).toBe('wall');
        expect(wallPiece(m, p.x, p.y)).not.toBe('wall-front');
        expect(isOpen(getTile(m, p.x, p.y - 1))).toBe(false);
        expect(posts).not.toContain(`${p.x},${p.y}`);
      }
      expect(cans).not.toBeNull();
      if (cans) expect(capProps.some((p) => p.x === cans.x && p.y === cans.y)).toBe(false);
      const frames = uplinks.flatMap((u) => (u.frame ? [`${u.frame.x},${u.frame.y}`] : []));
      expect(frontProps.length).toBeGreaterThan(0);
      expect(frontProps.length).toBeLessThanOrEqual(BASEMENT_CAP_CLUSTERS.front);
      for (const p of frontProps) {
        expect(wallPiece(m, p.x, p.y)).toBe('wall-front');
        expect(isOpen(getTile(m, p.x, p.y + 1))).toBe(false);
        expect(frames).not.toContain(`${p.x},${p.y}`);
      }
    }
  });

  it('puts Segfault and the YOTTA rack on the server room’s full walls, apart, nothing open behind', () => {
    for (const m of maps) {
      const { segfault, yotta, capProps, innerProps } = basementRoom(m);
      const inner = new Set(innerWalls(m).flatMap((r) => r.map((p) => `${p.x},${p.y}`)));
      expect(segfault).not.toBeNull();
      expect(yotta).not.toBeNull();
      if (!segfault || !yotta) continue;
      for (const p of [segfault, yotta]) {
        expect(inner.has(`${p.x},${p.y}`)).toBe(true);
        expect(wallPiece(m, p.x, p.y)).not.toBe('wall-front');
        expect(isOpen(getTile(m, p.x, p.y - 1))).toBe(false);
        expect(capProps.some((q) => q.x === p.x && q.y === p.y)).toBe(false);
        expect(innerProps.some((q) => q.x === p.x && q.y === p.y)).toBe(false);
      }
      expect(cheb(segfault, yotta)).toBeGreaterThan(2);
      // The cat sleeps away from where anyone starts.
      for (const s of m.spawns) expect(cheb(s, segfault)).toBeGreaterThanOrEqual(3);
    }
  });

  it('strings the cable tray along the back walls from end to end, on uprights on the back wall', () => {
    for (const m of maps) {
      const { trays } = basementRoom(m);
      expect(trays.length).toBeGreaterThan(0);
      for (const t of trays) {
        // Never in front of a back wall with void behind it (the scene's racks stand there).
        for (let x = Math.ceil(t.x0); x <= Math.floor(t.x1); x++)
          expect(getTile(m, x, t.back - 1)).not.toBe('void');
        expect(t.x1 - t.x0).toBeGreaterThanOrEqual(3);
        expect(t.y).toBe(TRAY_Y);
        expect(t.y).toBeGreaterThan(WALL_HEIGHT + 0.5);
        expect(t.posts.length).toBeGreaterThanOrEqual(2);
        for (const p of t.posts) {
          expect(getTile(m, p.x, p.y)).toBe('wall');
          expect(p.y).toBe(t.back);
          expect(p.x).toBeGreaterThanOrEqual(t.x0);
          expect(p.x).toBeLessThanOrEqual(t.x1);
        }
        // Near the back only: never hung near the front wall.
        expect(t.z).toBeLessThan(m.height / 2);
      }
    }
  });

  it('hangs each batten under a tray, clear of the uprights, never near the front wall', () => {
    for (const m of maps) {
      const { trays } = basementRoom(m);
      const spots = lampSpots(atmosphereFor('on-call'), m);
      for (const at of spots) {
        const fit = battenFit(at, m);
        if (!fit) continue;
        const tray = trays.find(
          (t) => Math.abs(t.z - fit.z) < 1e-9 && fit.x > t.x0 && fit.x < t.x1,
        );
        expect(tray).toBeDefined();
        if (!tray) continue;
        expect(fit.x - BATTEN_HALF).toBeGreaterThan(tray.x0);
        expect(fit.x + BATTEN_HALF).toBeLessThan(tray.x1);
        for (const p of tray.posts) expect(Math.abs(p.x - fit.x)).toBeGreaterThan(BATTEN_HALF);
        expect(fit.z).toBeLessThan(m.height / 2);
      }
    }
  });

  it('is deterministic', () => {
    for (const m of maps) expect(basementRoom(m)).toEqual(basementRoom(m));
  });
});
