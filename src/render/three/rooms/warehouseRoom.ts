/**
 * Where the biscuit-works rooms' story pieces go (the `warehouse` wall
 * theme, Down the Hall): the hallway between the rooms with its runner and
 * the other tenants' doors, the inbox framed as the door from the entrance
 * hall, the ship hatch as the loading-bay door with its sliding door parked
 * beside it, what hangs on the brick, the wall-top clusters, and the wear on
 * the floorboards. Placed from the map's own tiles, never at fixed
 * coordinates. No three.js here, so it can be tested.
 */

import {
  type GridPoint,
  type LevelMap,
  type Tile,
  getTile,
  isWorkSurface,
} from '../../../sim/level';
import { type WallPiece, levelSalt, tileHash, wallPiece } from '../../mapShape';
import type { RoomPlan } from './types';

/** Wear on a floorboard tile (see `floorWear`); `roomModels/warehouse` draws them. */
export const BOARD_WEAR = {
  none: 0,
  /** The finish walked off: the path everyone takes, paler. */
  path: 1,
  /** Chair and boot scuffs by the counters. */
  scuffs: 2,
  /** An old goods hatch let into the boards, an iron ring in it. */
  hatch: 3,
  /** A board replaced, newer and paler than its neighbours. */
  newBoard: 4,
} as const;

/** The runner's wear values start here: `RUNNER + part * 3 + end` (see `runnerWear`). */
export const RUNNER = 8;
/** Which band of the runner a tile carries: all of it (a 1-wide hall), its top half or its bottom half. */
export type RunnerPart = 0 | 1 | 2;
/** Where along the runner a tile is: the middle, its west end, its east end. */
export type RunnerEnd = 0 | 1 | 2;

export function runnerWear(part: RunnerPart, end: RunnerEnd): number {
  return RUNNER + part * 3 + end;
}

/** What hangs on the brick, by name in `WAREHOUSE_WALL_ART`. */
export type WallArt =
  | 'pigeonholes'
  | 'neon'
  | 'clock'
  | 'bike'
  | 'gigPoster'
  | 'downpipe'
  | 'noticeBoard'
  | 'yogaDoor'
  | 'breweryDoor';

/** One piece of wall art: its wall tile (for a two-tile piece, `x` sits between the two). */
export interface WallArtSpot {
  x: number;
  y: number;
  art: WallArt;
}

/** The door from the entrance hall round the inbox. */
export interface HallDoor {
  x: number;
  y: number;
  width: number;
  out: { dx: number; dy: number };
}

/** The loading bay round the ship hatch. */
export interface LoadingBay {
  /** The ship tiles in the opening, in order along the edge. */
  opening: GridPoint[];
  /** The step from the opening out of the building. */
  out: { dx: number; dy: number };
  /** Wall tiles beside the opening where the sliding door is parked, in order away from it. */
  park: GridPoint[];
}

/**
 * What stands on a low wall with floor on both sides (the wall in front of
 * the hallway): the tenants' plaques at its ends, and between them low
 * clusters (rolled yoga mats, the tenants' post in a letter rack, a fire
 * bucket, plants in tins).
 */
export type InnerProp = 'yogaPlaque' | 'brewPlaque' | 'mats' | 'post' | 'bucket' | 'plants';

/** The clusters along an inner low wall, in turn. */
const INNER_CLUSTERS: readonly InnerProp[] = ['mats', 'post', 'bucket', 'plants'];
/** Clusters on one inner wall at most, and the bare tiles between two. */
const INNER_MAX = 3;
const INNER_GAP = 2;

export interface WarehouseRoom extends RoomPlan {
  /** Always empty: the brick's art is placed as story pieces (`wallArt`), not hashed decorations. */
  decos: Record<string, string>;
  floorWear: Record<string, number>;
  capProps: NonNullable<RoomPlan['capProps']>;
  frontProps: NonNullable<RoomPlan['frontProps']>;
  /** Floor tiles of the hallway between the rooms (the runner lies on these). */
  hall: GridPoint[];
  /**
   * The inbox group on the building's edge, framed as the door from the
   * entrance hall: its middle, its width in tiles, and the step out to the hall.
   */
  hallDoor: HallDoor | null;
  /**
   * Low walls with nothing behind them and the room in front (a back wall
   * against void), raised to a full storey of brick: they hide no one.
   */
  raised: GridPoint[];
  loading: LoadingBay | null;
  wallArt: WallArtSpot[];
  /** On the low walls with floor on both sides: plaques at a run's ends, clusters between. */
  innerProps: { x: number; y: number; kind: InnerProp }[];
  /** Back-wall tiles carrying the cast-iron pipe under the coping, and which end of its run each is. */
  pipes: { x: number; y: number; end: 'mid' | 'west' | 'east' | 'both' }[];
}

const key = (x: number, y: number) => `${x},${y}`;
const SIDES = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

/** The shortest run of hallway columns that gets a runner. */
const RUNNER_MIN = 3;
/** Scuffs by the counters, and replaced boards, at most. */
const SCUFFS_MAX = 3;
const NEW_BOARDS = 2;
/** The art that goes up after the pigeonholes and the neon, in turn, one each. */
const ART_ORDER: readonly WallArt[] = ['clock', 'bike', 'gigPoster', 'downpipe', 'gigPoster'];

export function warehouseRoom(map: LevelMap): WarehouseRoom {
  const raised = raisedWalls(map);
  const hall = findHall(map);
  const hallDoor = findHallDoor(map);
  const loading = findLoadingBay(map);
  const wallArt = placeWallArt(map, hall, hallDoor, loading);
  return {
    decos: {},
    hall: hall.flatMap((h) => h.tiles),
    hallDoor,
    raised: [...raised].map((k) => {
      const [x = 0, y = 0] = k.split(',').map(Number);
      return { x, y };
    }),
    loading,
    wallArt,
    pipes: findPipes(map, hallDoor, wallArt),
    floorWear: floorWear(map, hall),
    capProps: capProps(map, hallDoor),
    frontProps: frontProps(map, loading),
    innerProps: innerProps(map),
  };
}

const isOpen = (t: Tile | null) => t !== null && t !== 'wall' && t !== 'void';

/** Low walls (cut down as front walls) with nothing behind them and the room in front of them. */
function raisedWalls(map: LevelMap): Set<string> {
  const out = new Set<string>();
  for (let y = 0; y < map.height - 1; y++)
    for (let x = 0; x < map.width; x++)
      if (
        getTile(map, x, y) === 'wall' &&
        wallPiece(map, x, y) === 'wall-front' &&
        !isOpen(getTile(map, x, y - 1)) &&
        isOpen(getTile(map, x, y + 1))
      )
        out.add(key(x, y));
  return out;
}

const raisedCache = new WeakMap<LevelMap, Set<string>>();

/** The wall piece at (x, y) as this room builds it: raised walls are full walls. */
function piece(map: LevelMap, x: number, y: number): WallPiece {
  let raised = raisedCache.get(map);
  if (!raised) {
    raised = raisedWalls(map);
    raisedCache.set(map, raised);
  }
  return raised.has(key(x, y)) ? 'wall' : wallPiece(map, x, y);
}

/** Whether (x, y) is on the hall door's edge line, within a tile of it. */
function byHallDoor(door: HallDoor | null, x: number, y: number): boolean {
  if (!door) return false;
  const along = door.out.dx === 0;
  const [u, v, du, dv] = along ? [x, y, door.x, door.y] : [y, x, door.y, door.x];
  return v === dv && Math.abs(u - du) <= door.width / 2 + 0.5;
}

/** One stretch of hallway: its columns from `x0` to `x1`, its rows `y0` to `y1` (one or two). */
interface HallRun {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  tiles: GridPoint[];
}

/**
 * The hallway: columns whose open stretch (between wall or void above and
 * below) is one or two tiles of plain floor, side by side with the same rows,
 * at least `RUNNER_MIN` of them. A doorway column with a counter in it ends a run.
 */
export function findHall(map: LevelMap): HallRun[] {
  const span = (x: number): { y0: number; y1: number } | null => {
    // Only columns with walls close above and below: find each open stretch of one or two.
    for (let y = 1; y < map.height - 1; y++) {
      if (!isOpen(getTile(map, x, y)) || isOpen(getTile(map, x, y - 1))) continue;
      let y1 = y;
      while (isOpen(getTile(map, x, y1 + 1))) y1++;
      if (y1 - y > 1) continue;
      let floor = true;
      for (let yy = y; yy <= y1; yy++) if (getTile(map, x, yy) !== 'floor') floor = false;
      if (floor) return { y0: y, y1 };
    }
    return null;
  };
  const runs: HallRun[] = [];
  let run: HallRun | null = null;
  const close = () => {
    if (run && run.x1 - run.x0 + 1 >= RUNNER_MIN) runs.push(run);
    run = null;
  };
  for (let x = 0; x < map.width; x++) {
    const s = span(x);
    const current: HallRun | null = run;
    if (s && current && current.y0 === s.y0 && current.y1 === s.y1 && current.x1 === x - 1) {
      current.x1 = x;
    } else {
      close();
      if (s) run = { x0: x, x1: x, ...s, tiles: [] };
    }
  }
  close();
  for (const r of runs)
    for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) r.tiles.push({ x, y });
  return runs;
}

/** The first inbox on the building's edge (nothing or void beyond it), its group along the edge, and the way out. */
function findHallDoor(map: LevelMap): HallDoor | null {
  for (let y = 0; y < map.height; y++)
    for (let x = 0; x < map.width; x++) {
      if (getTile(map, x, y) !== 'inbox') continue;
      // The back first, then the sides, then the front.
      const side = (
        [
          [0, -1],
          [-1, 0],
          [1, 0],
          [0, 1],
        ] as const
      ).find(
        ([dx, dy]) =>
          !isOpen(getTile(map, x + dx, y + dy)) && getTile(map, x + dx, y + dy) !== 'wall',
      );
      if (!side) continue;
      const [dx, dy] = side;
      const [ax, ay] = [Math.abs(dy), Math.abs(dx)];
      let n = 1;
      while (getTile(map, x + ax * n, y + ay * n) === 'inbox') n++;
      return { x: x + (ax * (n - 1)) / 2, y: y + (ay * (n - 1)) / 2, width: n, out: { dx, dy } };
    }
  return null;
}

/**
 * The ship tiles on the building's edge (outside them nothing, or void) in a
 * line, the way out, and the wall beside them where the sliding door waits:
 * as many tiles as the opening (or what there is), on the side with more wall.
 */
function findLoadingBay(map: LevelMap): LoadingBay | null {
  for (let y = 0; y < map.height; y++)
    for (let x = 0; x < map.width; x++) {
      if (getTile(map, x, y) !== 'ship') continue;
      const side = SIDES.find(
        ([dx, dy]) =>
          !isOpen(getTile(map, x + dx, y + dy)) && getTile(map, x + dx, y + dy) !== 'wall',
      );
      if (!side) continue;
      const [dx, dy] = side;
      // Along the edge: across the way out.
      const [ax, ay] = [Math.abs(dy), Math.abs(dx)];
      const opening: GridPoint[] = [{ x, y }];
      for (let k = 1; getTile(map, x + ax * k, y + ay * k) === 'ship'; k++)
        opening.push({ x: x + ax * k, y: y + ay * k });
      const width = opening.length;
      const last = opening[width - 1] ?? { x, y };
      const isWall = (p: GridPoint) =>
        getTile(map, p.x, p.y) === 'wall' && !isOpen(getTile(map, p.x + dx, p.y + dy));
      const walk = (from: GridPoint, sx: number, sy: number) => {
        const out: GridPoint[] = [];
        for (let k = 1; k <= width; k++) {
          const p = { x: from.x + sx * k, y: from.y + sy * k };
          // Stop short of the corner: the door needs wall past its far end.
          const past = { x: p.x + sx, y: p.y + sy };
          if (!isWall(p) || getTile(map, past.x, past.y) === null) break;
          out.push(p);
        }
        return out;
      };
      const plus = walk(last, ax, ay);
      const minus = walk({ x, y }, -ax, -ay);
      return { opening, out: { dx, dy }, park: plus.length >= minus.length ? plus : minus };
    }
  return null;
}

/**
 * The art on the brick, on walls showing their face over open floor: the
 * other tenants' doors along the hallway, the pigeonholes beside the
 * entrance-hall door, the "SHIP IT" neon on the first two-tile stretch of
 * back wall, then the clock, the bike, a gig poster and a downpipe in turn,
 * with bare brick between where the wall is long.
 */
function placeWallArt(
  map: LevelMap,
  hall: HallRun[],
  hallDoor: HallDoor | null,
  loading: LoadingBay | null,
): WallArtSpot[] {
  const park = new Set(loading?.park.map((p) => key(p.x, p.y)) ?? []);
  const ok = (x: number, y: number) =>
    getTile(map, x, y) === 'wall' &&
    piece(map, x, y) === 'wall' &&
    getTile(map, x, y + 1) === 'floor' &&
    !park.has(key(x, y));
  const out: WallArtSpot[] = [];
  const used = new Set<string>();
  const put = (x: number, y: number, art: WallArt, span = 1) => {
    out.push({ x: x + (span - 1) / 2, y, art });
    for (let i = 0; i < span; i++) used.add(key(x + i, y));
  };
  // The hallway's own wall: the yoga studio's door near one end, the brewery's near the other.
  // A door stands a full storey even in a low wall (nothing open behind it, so it hides no one).
  const doorOk = (x: number, y: number) =>
    getTile(map, x, y) === 'wall' &&
    piece(map, x, y) !== 'wall-inner' &&
    getTile(map, x, y + 1) === 'floor' &&
    !isOpen(getTile(map, x, y - 1)) &&
    !park.has(key(x, y));
  for (const h of hall) {
    const y = h.y0 - 1;
    const wall: number[] = [];
    for (let x = h.x0; x <= h.x1; x++) if (doorOk(x, y)) wall.push(x);
    if (wall.length === 0) continue;
    const doors: [number, WallArt][] =
      wall.length >= 4
        ? [
            [1, 'yogaDoor'],
            [wall.length - 2, 'breweryDoor'],
          ]
        : wall.length >= 2
          ? [
              [0, 'yogaDoor'],
              [wall.length - 1, 'breweryDoor'],
            ]
          : [[0, 'yogaDoor']];
    for (const [i, art] of doors) {
      const x = wall[i];
      if (x !== undefined) put(x, y, art);
    }
    // A notice board between the doors, the cast-iron downpipe at the near end, where the wall is full height.
    const between = wall.filter((x) => !used.has(key(x, y)) && ok(x, y));
    const mid = between[Math.floor(between.length / 2)];
    if (between.length >= 2 && mid !== undefined) put(mid, y, 'noticeBoard');
    const first = between[0];
    if (first !== undefined && first !== mid) put(first, y, 'downpipe');
  }
  // Pigeonholes beside the entrance-hall door, on whichever side has wall.
  if (hallDoor && hallDoor.out.dy === -1) {
    const half = (hallDoor.width - 1) / 2;
    const side = [hallDoor.x - half - 1, hallDoor.x + half + 1].find((x) => ok(x, hallDoor.y));
    if (side !== undefined) put(side, hallDoor.y, 'pigeonholes');
  }
  // Every other free wall, row by row: runs of free wall facing the floor.
  const runs: GridPoint[][] = [];
  for (let y = 0; y < map.height; y++) {
    let run: GridPoint[] = [];
    for (let x = 0; x <= map.width; x++) {
      if (x < map.width && ok(x, y) && !used.has(key(x, y))) run.push({ x, y });
      else {
        if (run.length) runs.push(run);
        run = [];
      }
    }
  }
  // The neon on the first stretch of two, else it waits for a single tile at the end.
  const neonRun = runs.find((r) => r.length >= 2);
  let neonPlaced = false;
  if (neonRun) {
    const at = neonRun[neonRun.length >= 4 ? 1 : 0];
    if (at) {
      put(at.x, at.y, 'neon', 2);
      neonPlaced = true;
    }
  }
  let next = 0;
  for (const run of runs) {
    for (let i = 0; i < run.length; i++) {
      const p = run[i];
      if (!p || used.has(key(p.x, p.y))) continue;
      const art = !neonPlaced ? 'neon' : ART_ORDER[next++ % ART_ORDER.length];
      if (!art) continue;
      put(p.x, p.y, art);
      neonPlaced = true;
      // Bare brick after it on a long wall, so the coursing shows.
      if (run.length >= 3) i++;
    }
  }
  return out;
}

/**
 * The cast-iron pipe under the coping along the back walls (with nothing
 * behind them), in runs of two or more between stations, missing the tiles
 * that carry the neon or a door.
 */
function findPipes(
  map: LevelMap,
  hallDoor: HallDoor | null,
  art: WallArtSpot[],
): WarehouseRoom['pipes'] {
  const tall = new Set(
    art
      .filter((a) => a.art === 'neon' || a.art === 'yogaDoor' || a.art === 'breweryDoor')
      .flatMap((a) => [key(Math.floor(a.x), a.y), key(Math.ceil(a.x), a.y)]),
  );
  const ok = (x: number, y: number) =>
    getTile(map, x, y) === 'wall' &&
    piece(map, x, y) === 'wall' &&
    !isOpen(getTile(map, x, y - 1)) &&
    !tall.has(key(x, y)) &&
    !byHallDoor(hallDoor, x, y);
  const out: WarehouseRoom['pipes'] = [];
  for (let y = 0; y < map.height; y++) {
    let run: number[] = [];
    for (let x = 0; x <= map.width; x++) {
      if (x < map.width && ok(x, y)) {
        run.push(x);
        continue;
      }
      if (run.length >= 2)
        run.forEach((rx, i) =>
          out.push({
            x: rx,
            y,
            end: i === 0 ? 'west' : i === run.length - 1 ? 'east' : 'mid',
          }),
        );
      run = [];
    }
  }
  return out;
}

/** Floor tiles next to a tile that `is` picks. */
function besides(map: LevelMap, is: (t: Tile | null) => boolean): GridPoint[] {
  const out: GridPoint[] = [];
  for (let y = 0; y < map.height; y++)
    for (let x = 0; x < map.width; x++)
      if (
        getTile(map, x, y) === 'floor' &&
        SIDES.some(([dx, dy]) => is(getTile(map, x + dx, y + dy)))
      )
        out.push({ x, y });
  return out;
}

/** The shortest walk over floor from any of `from` to any of `to` (fixed tie-breaks), or none. */
function walk(map: LevelMap, from: GridPoint[], to: GridPoint[]): GridPoint[] {
  const goal = new Set(to.map((p) => key(p.x, p.y)));
  const prev = new Map<string, string | null>();
  const queue: GridPoint[] = [];
  for (const p of from) {
    prev.set(key(p.x, p.y), null);
    queue.push(p);
  }
  for (let i = 0; i < queue.length; i++) {
    const p = queue[i];
    if (!p) break;
    const k = key(p.x, p.y);
    if (goal.has(k)) {
      const path: GridPoint[] = [];
      for (let c: string | null | undefined = k; c; c = prev.get(c)) {
        const [x = 0, y = 0] = c.split(',').map(Number);
        path.push({ x, y });
      }
      return path.reverse();
    }
    for (const [dx, dy] of SIDES) {
      const n = { x: p.x + dx, y: p.y + dy };
      const nk = key(n.x, n.y);
      if (prev.has(nk) || getTile(map, n.x, n.y) !== 'floor') continue;
      prev.set(nk, k);
      queue.push(n);
    }
  }
  return [];
}

/**
 * Wear on the boards, placed: the runner down the hallway, a pale path
 * walked from the entrance-hall door to the review and on to the loading
 * door, an old goods hatch by a wall, scuffs by the counters, a couple of
 * replaced boards. Nothing dark on a spawn; the rest stays bare.
 */
function floorWear(map: LevelMap, hall: HallRun[]): Record<string, number> {
  const salt = levelSalt(map);
  const out: Record<string, number> = {};
  for (const h of hall) {
    for (const { x, y } of h.tiles) {
      const part: RunnerPart = h.y0 === h.y1 ? 0 : y === h.y0 ? 1 : 2;
      const end: RunnerEnd = x === h.x0 ? 1 : x === h.x1 ? 2 : 0;
      out[key(x, y)] = runnerWear(part, end);
    }
  }
  const inbox = besides(map, (t) => t === 'inbox');
  const review = besides(map, (t) => t === 'review');
  const ship = besides(map, (t) => t === 'ship');
  const legs = review.length
    ? [walk(map, inbox, review), walk(map, review, ship)]
    : [walk(map, inbox, ship)];
  for (const leg of legs)
    for (const p of leg) if (out[key(p.x, p.y)] === undefined) out[key(p.x, p.y)] = BOARD_WEAR.path;
  const spawn = new Set(map.spawns.map((p) => key(p.x, p.y)));
  const floor: GridPoint[] = [];
  for (let y = 0; y < map.height; y++)
    for (let x = 0; x < map.width; x++) if (getTile(map, x, y) === 'floor') floor.push({ x, y });
  const shuffled = floor.sort(
    (a, b) => ((tileHash(a.x, a.y) ^ salt) >>> 0) - ((tileHash(b.x, b.y) ^ salt) >>> 0),
  );
  const free = (p: GridPoint) => out[key(p.x, p.y)] === undefined && !spawn.has(key(p.x, p.y));
  const near = (p: GridPoint, is: (t: Tile | null) => boolean) =>
    SIDES.some(([dx, dy]) => is(getTile(map, p.x + dx, p.y + dy)));
  // The hatch: by a wall, clear of the work, as far from the spawns as the shuffle allows.
  const hatch = shuffled.find(
    (p) =>
      free(p) &&
      // By an outer wall, not one in the middle of the room.
      SIDES.some(([dx, dy]) => {
        const [wx, wy] = [p.x + dx, p.y + dy];
        const edge = wx === 0 || wy === 0 || wx === map.width - 1 || wy === map.height - 1;
        return edge && getTile(map, wx, wy) === 'wall';
      }) &&
      !near(p, isWorkSurface) &&
      map.spawns.every((s) => Math.max(Math.abs(s.x - p.x), Math.abs(s.y - p.y)) >= 2),
  );
  if (hatch) out[key(hatch.x, hatch.y)] = BOARD_WEAR.hatch;
  let scuffs = 0;
  for (const p of shuffled) {
    if (scuffs >= SCUFFS_MAX) break;
    if (!free(p) || !near(p, (t) => t === 'counter')) continue;
    out[key(p.x, p.y)] = BOARD_WEAR.scuffs;
    scuffs++;
  }
  shuffled
    .filter(free)
    .slice(-NEW_BOARDS)
    .forEach((p) => (out[key(p.x, p.y)] = BOARD_WEAR.newBoard));
  return out;
}

/**
 * Wall-top tiles that can carry a cluster: full walls with nothing open
 * behind them (it'd hide someone standing there) and no station or counter
 * beside them, clear of the entrance-hall door.
 */
function capFree(map: LevelMap, hallDoor: HallDoor | null) {
  return (x: number, y: number) => {
    if (getTile(map, x, y) !== 'wall' || piece(map, x, y) === 'wall-front') return false;
    if (isOpen(getTile(map, x, y - 1))) return false;
    // A station beside it along a back wall is fine (it reads as the wall's); in front or behind, not.
    const back = getTile(map, x, y - 1) === null;
    for (const [dx, dy] of SIDES)
      if (isWorkSurface(getTile(map, x + dx, y + dy)) && !(back && dy === 0)) return false;
    if (byHallDoor(hallDoor, x, y)) return false;
    return true;
  };
}

/**
 * Clusters on the wall tops: along each run of free wall (rows first, then
 * what's left in columns), two tiles together (one on a short run), then
 * two tiles of bare coping, so a long wall carries three or four clusters.
 */
function capProps(map: LevelMap, hallDoor: HallDoor | null): WarehouseRoom['capProps'] {
  const free = capFree(map, hallDoor);
  const salt = levelSalt(map);
  const taken = new Set<string>();
  const runs: GridPoint[][] = [];
  const collect = (across: boolean) => {
    const [outer, inner] = across ? [map.height, map.width] : [map.width, map.height];
    for (let a = 0; a < outer; a++) {
      let run: GridPoint[] = [];
      for (let b = 0; b <= inner; b++) {
        const [x, y] = across ? [b, a] : [a, b];
        if (b < inner && free(x, y) && !taken.has(key(x, y))) {
          run.push({ x, y });
          continue;
        }
        if (run.length >= (across ? 2 : 1)) {
          runs.push(run);
          for (const p of run) taken.add(key(p.x, p.y));
        }
        run = [];
      }
    }
  };
  collect(true);
  collect(false);
  const out: WarehouseRoom['capProps'] = [];
  let slot = 0;
  for (const run of runs) {
    const start = ((tileHash(run[0]?.x ?? 0, run[0]?.y ?? 0) ^ salt) >>> 0) % 2;
    for (let i = run.length > 3 ? start : 0; i < run.length;) {
      const size = run.length - i >= 2 ? 2 : 1;
      const cluster = run.slice(i, i + size);
      cluster.forEach((p, k) => {
        const other = cluster[1 - k];
        out.push({
          x: p.x,
          y: p.y,
          slot: slot++,
          toward: other ? { dx: other.x - p.x, dy: other.y - p.y } : { dx: 0, dy: 0 },
        });
      });
      i += size + (run.length >= 5 ? 2 : 1);
    }
  }
  return out;
}

/**
 * Low things lying on the front walls (the map's front edge and the low
 * walls in front of the hallway), every third tile, clear of the loading
 * bay and of corners.
 */
function frontProps(map: LevelMap, loading: LoadingBay | null): WarehouseRoom['frontProps'] {
  const salt = levelSalt(map);
  const busy = new Set<string>();
  for (const p of [...(loading?.opening ?? []), ...(loading?.park ?? [])])
    for (const [dx, dy] of [[0, 0], ...SIDES]) busy.add(key(p.x + dx, p.y + dy));
  const out: WarehouseRoom['frontProps'] = [];
  for (let y = 0; y < map.height; y++) {
    let gap = 0;
    for (let x = 1; x < map.width - 1; x++) {
      const ok =
        getTile(map, x, y) === 'wall' &&
        piece(map, x, y) === 'wall-front' &&
        getTile(map, x - 1, y) === 'wall' &&
        getTile(map, x + 1, y) === 'wall' &&
        !busy.has(key(x, y)) &&
        // Only walls with the outside in front: not a low wall in the middle of the room.
        !isOpen(getTile(map, x, y + 1));
      if (!ok) {
        gap = 0;
        continue;
      }
      if (gap > 0) {
        gap--;
        continue;
      }
      out.push({ x, y, slot: out.length });
      gap = 2 + (((tileHash(x, y + 5) ^ salt) >>> 0) % 2);
    }
  }
  return out;
}

/**
 * The low walls with floor on both sides (in front of the hallway), row by
 * row: on a run of four or more, the yoga studio's plaque on its first tile
 * and the brewery's on its last (flat things, so a station beside them
 * doesn't matter); between them up to `INNER_MAX` low clusters with
 * `INNER_GAP` bare tiles between, never beside a station or counter (it'd
 * stand behind it, or in front of it).
 */
function innerProps(map: LevelMap): WarehouseRoom['innerProps'] {
  const out: WarehouseRoom['innerProps'] = [];
  const inner = (x: number, y: number) =>
    getTile(map, x, y) === 'wall' &&
    wallPiece(map, x, y) === 'wall-front' &&
    isOpen(getTile(map, x, y - 1)) &&
    isOpen(getTile(map, x, y + 1));
  const clear = (x: number, y: number) =>
    !SIDES.some(([dx, dy]) => isWorkSurface(getTile(map, x + dx, y + dy)));
  let next = 0;
  for (let y = 1; y < map.height - 1; y++) {
    let x0 = -1;
    for (let x = 0; x <= map.width; x++) {
      if (x < map.width && inner(x, y)) {
        if (x0 < 0) x0 = x;
        continue;
      }
      if (x0 < 0) continue;
      const x1 = x - 1;
      const plaques = x1 - x0 + 1 >= 4;
      if (plaques) {
        out.push({ x: x0, y, kind: 'yogaPlaque' });
        out.push({ x: x1, y, kind: 'brewPlaque' });
      }
      let placed = 0;
      for (let cx = plaques ? x0 + 1 : x0; cx <= (plaques ? x1 - 1 : x1) && placed < INNER_MAX;) {
        if (!clear(cx, y)) {
          cx++;
          continue;
        }
        out.push({ x: cx, y, kind: INNER_CLUSTERS[next++ % INNER_CLUSTERS.length] ?? 'plants' });
        placed++;
        cx += INNER_GAP + 1;
      }
      x0 = -1;
    }
  }
  return out;
}
