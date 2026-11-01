/**
 * Where the business-park unit's story pieces go (the `officePark` wall
 * theme, Open Plan Office): the lobby door round the inbox with its mat and
 * junk mail, the glass front door onto the car park at the ship hatch, runs
 * of the old tenant's glass partitions on the side walls, the wall-face
 * decorations, wear on the carpet tiles, and clutter on the wall tops.
 * Placed from the map's own tiles, never at fixed coordinates, so it fits
 * any map. No three.js here, so it can be tested.
 */

import { type GridPoint, type LevelMap, getTile, isWorkSurface } from '../../../sim/level';
import { WALL_DECOS, levelSalt, tileHash, wallPiece } from '../../mapShape';
import { tilesOf } from '../layout';

/** Wear on a carpet tile (see `floorWear`), one per tile; `roomModels/officePark` draws them. */
export const CARPET_WEAR = {
  none: 0,
  /** Pile flattened by feet, in from a door: running down the map (z), or across (x). */
  path: 1,
  pathX: 2,
  /** The same, fainter, where the path spreads out. */
  pathFaint: 3,
  pathFaintX: 4,
  /** A coffee stain, near a desk or station. */
  coffee: 5,
  /** A taped-down cable cover running across (x) or down (z) the tile. */
  cableX: 6,
  cableZ: 7,
  /** A clear chair mat in front of a desk. */
  chairMat: 8,
  /** Entrance matting just inside the glass front door. */
  entrance: 9,
} as const;

/** The four edges of a map a door can be on, and its step out of the room. */
export type Side = 'back' | 'front' | 'left' | 'right';
const OUT: Readonly<Record<Side, { dx: number; dy: number }>> = {
  back: { dx: 0, dy: -1 },
  front: { dx: 0, dy: 1 },
  left: { dx: -1, dy: 0 },
  right: { dx: 1, dy: 0 },
};

/** A door in the room's outline: the station tiles in it (in order along the edge) and its side. */
export interface Doorway {
  side: Side;
  tiles: GridPoint[];
  /** Its middle, in grid coordinates (between two tiles for a double door). */
  mid: { x: number; y: number };
}

export interface OfficeParkRoom {
  /** The inbox framed as the door to the shared lobby and post room. */
  lobbyDoor: Doorway | null;
  /** Floor tiles just inside the lobby door, for its mat (and the junk mail on it). */
  lobbyMat: GridPoint[];
  /** The ship hatch framed as the glass front door onto the car park. */
  frontDoor: Doorway | null;
  /** What hangs on each wall facing open floor, keyed `x,y`. */
  decos: Record<string, string>;
  /** Wear on the carpet tiles (a `CARPET_WEAR`), keyed `x,y`; bare tiles left out. */
  floorWear: Record<string, number>;
  /**
   * Side-wall tiles built as a run of the old glass partition, keyed `x,y`:
   * `partitionZ` (the pane runs down the map).
   */
  swaps: Record<string, string>;
  /** Clutter on the wall tops in clusters (see `RoomPlan.capProps`). */
  capProps: { x: number; y: number; slot: number; toward: { dx: number; dy: number } }[];
  /** Low things lying on the front wall (see `RoomPlan.frontProps`). */
  frontProps: { x: number; y: number; slot: number }[];
}

/** How far in from the front door the carpet is worn, the last of it faint. */
const PATH_DEPTH = 3;
/** How far in from the lobby door, past its mat. */
const LOBBY_PATH_DEPTH = 2;
/** Coffee stains and chair mats, at most. */
const COFFEE_MAX = 3;
const CHAIR_MATS_MAX = 3;
/** The longest cable cover, in tiles. */
const CABLE_MAX = 3;
/** Partition runs: the shortest and longest, in tiles. */
const PARTITION = { min: 1, max: 3 };

const key = (x: number, y: number) => `${x},${y}`;

export function officeParkRoom(map: LevelMap): OfficeParkRoom {
  const lobbyDoor = findDoorway(map, 'inbox');
  const frontDoor = findDoorway(map, 'ship');
  const lobbyMat = lobbyDoor ? inside(map, lobbyDoor, 1) : [];
  const swaps = partitions(map, [lobbyDoor, frontDoor]);
  return {
    lobbyDoor,
    lobbyMat,
    frontDoor,
    decos: decos(map, lobbyDoor),
    floorWear: floorWear(map, lobbyDoor, lobbyMat, frontDoor),
    swaps,
    capProps: capProps(map, [lobbyDoor, frontDoor], swaps),
    frontProps: frontProps(map, [lobbyDoor, frontDoor]),
  };
}

/** Whether (x, y) is off the map or void: outside the building. */
function outside(map: LevelMap, x: number, y: number): boolean {
  const t = getTile(map, x, y);
  return t === null || t === 'void';
}

/**
 * The first group of `tile` with the outside beyond it, on the back edge
 * first, then the front, left and right: the tiles along that edge.
 */
export function findDoorway(map: LevelMap, tile: 'inbox' | 'ship'): Doorway | null {
  const tiles = tilesOf(map, tile);
  for (const side of ['back', 'front', 'left', 'right'] as const) {
    const { dx, dy } = OUT[side];
    const first = tiles.find((t) => outside(map, t.x + dx, t.y + dy));
    if (!first) continue;
    // Along the edge: x for back and front, y for the sides.
    const [ax, ay] = dy !== 0 ? [1, 0] : [0, 1];
    const at = (k: number) => ({ x: first.x + ax * k, y: first.y + ay * k });
    const isDoor = (k: number) => {
      const p = at(k);
      return getTile(map, p.x, p.y) === tile && outside(map, p.x + dx, p.y + dy);
    };
    let lo = 0;
    let hi = 0;
    while (isDoor(lo - 1)) lo--;
    while (isDoor(hi + 1)) hi++;
    const run = Array.from({ length: hi - lo + 1 }, (_, i) => at(lo + i));
    const a = run[0] ?? first;
    const b = run[run.length - 1] ?? first;
    return { side, tiles: run, mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
  }
  return null;
}

/** The floor tiles `depth` steps in from each of a door's tiles. */
function inside(map: LevelMap, door: Doorway, depth: number): GridPoint[] {
  const { dx, dy } = OUT[door.side];
  return door.tiles
    .map((t) => ({ x: t.x - dx * depth, y: t.y - dy * depth }))
    .filter((p) => getTile(map, p.x, p.y) === 'floor');
}

/** Whether (x, y) is within `reach` tiles of a door's tiles. */
function nearDoor(
  doors: readonly (Doorway | null)[],
  x: number,
  y: number,
  reach: number,
): boolean {
  return doors.some((d) =>
    d?.tiles.some((t) => Math.max(Math.abs(t.x - x), Math.abs(t.y - y)) <= reach),
  );
}

/**
 * The old tenant's glass partitions: on each side of the room, the longest
 * run of full-height side wall with floor beside it (up to three tiles, the walls at
 * its ends left solid), away from the doors. Never the front wall.
 */
function partitions(map: LevelMap, doors: readonly (Doorway | null)[]): Record<string, string> {
  const out: Record<string, string> = {};
  const salt = levelSalt(map);
  const ok = (x: number, y: number, dx: number) =>
    getTile(map, x, y) === 'wall' &&
    wallPiece(map, x, y) !== 'wall-front' &&
    y > 0 &&
    getTile(map, x + dx, y) === 'floor' &&
    outside(map, x - dx, y) &&
    !nearDoor(doors, x, y, 1);
  for (const dx of [1, -1]) {
    let best: GridPoint[] = [];
    for (let x = 0; x < map.width; x++) {
      let run: GridPoint[] = [];
      for (let y = 0; y <= map.height; y++) {
        if (y < map.height && ok(x, y, dx)) {
          run.push({ x, y });
          continue;
        }
        const better =
          run.length > best.length ||
          (run.length === best.length &&
            run.length > 0 &&
            ((tileHash(x, y) ^ salt) >>> 0) % 2 === 0);
        if (run.length >= PARTITION.min && better) best = run;
        run = [];
      }
    }
    // Long runs keep a solid tile at each end.
    const trimmed = best.length > PARTITION.max ? best.slice(1, 1 + PARTITION.max) : best;
    for (const p of trimmed) out[key(p.x, p.y)] = 'partitionZ';
  }
  return out;
}

/**
 * What hangs on the walls facing open floor: the fire-exit sign on the wall
 * nearest the lobby door, the rest of the office's things in turn, row by
 * row, so close ones never match.
 */
function decos(map: LevelMap, lobbyDoor: Doorway | null): Record<string, string> {
  const list = WALL_DECOS.officePark;
  const out: Record<string, string> = {};
  const spots: GridPoint[] = [];
  for (let y = 0; y < map.height; y++)
    for (let x = 0; x < map.width; x++)
      if (
        getTile(map, x, y) === 'wall' &&
        wallPiece(map, x, y) === 'wall' &&
        getTile(map, x, y + 1) === 'floor'
      )
        spots.push({ x, y });
  const exit = lobbyDoor
    ? [...spots].sort(
        (a, b) =>
          Math.hypot(a.x - lobbyDoor.mid.x, a.y - lobbyDoor.mid.y) -
          Math.hypot(b.x - lobbyDoor.mid.x, b.y - lobbyDoor.mid.y),
      )[0]
    : undefined;
  const rest = list.filter((d) => d !== 'fireExit');
  if (exit) out[key(exit.x, exit.y)] = 'fireExit';
  let k = 0;
  for (const p of spots) {
    if (exit && p.x === exit.x && p.y === exit.y) continue;
    const deco = rest[k++ % rest.length];
    if (deco) out[key(p.x, p.y)] = deco;
  }
  return out;
}

const STEPS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

/**
 * Wear on the carpet, placed: a path worn in from the glass front door
 * (entrance matting just inside it) and from the lobby door past its mat,
 * clear chair mats in front of the keyboards (the desks), a taped cable
 * cover from a desk out to the nearest wall, and two or three coffee stains
 * by the desks and stations. Never on a spawn.
 */
function floorWear(
  map: LevelMap,
  lobbyDoor: Doorway | null,
  lobbyMat: GridPoint[],
  frontDoor: Doorway | null,
): Record<string, number> {
  const salt = levelSalt(map);
  const out: Record<string, number> = {};
  const spawn = new Set(map.spawns.map((p) => key(p.x, p.y)));
  const mat = new Set(lobbyMat.map((p) => key(p.x, p.y)));
  const free = (x: number, y: number) =>
    getTile(map, x, y) === 'floor' &&
    out[key(x, y)] === undefined &&
    !spawn.has(key(x, y)) &&
    !mat.has(key(x, y));
  const path = (door: Doorway, from: number, depth: number, entrance: boolean) => {
    const { dx, dy } = OUT[door.side];
    const across = dx !== 0;
    for (const t of door.tiles) {
      for (let d = from; d <= depth; d++) {
        const [x, y] = [t.x - dx * d, t.y - dy * d];
        if (getTile(map, x, y) !== 'floor') break;
        if (!free(x, y)) continue;
        out[key(x, y)] =
          entrance && d === 1
            ? CARPET_WEAR.entrance
            : d < depth
              ? across
                ? CARPET_WEAR.pathX
                : CARPET_WEAR.path
              : across
                ? CARPET_WEAR.pathFaintX
                : CARPET_WEAR.pathFaint;
      }
    }
  };
  if (frontDoor) path(frontDoor, 1, PATH_DEPTH, true);
  if (lobbyDoor) path(lobbyDoor, 2, 1 + LOBBY_PATH_DEPTH, false);

  // Chair mats in front of the keyboards: the floor tile each one faces.
  let mats = 0;
  for (const k of tilesOf(map, 'keyboard')) {
    if (mats >= CHAIR_MATS_MAX) break;
    const step = STEPS.find(([dx, dy]) => free(k.x + dx, k.y + dy));
    if (!step) continue;
    out[key(k.x + step[0], k.y + step[1])] = CARPET_WEAR.chairMat;
    mats++;
  }

  // The cable cover: the shortest walk across bare floor from a desk in the room to a wall.
  let cable: { tiles: GridPoint[]; across: boolean } | null = null;
  for (let y = 0; y < map.height; y++)
    for (let x = 0; x < map.width; x++) {
      if (getTile(map, x, y) !== 'counter') continue;
      for (const [dx, dy] of STEPS) {
        const tiles: GridPoint[] = [];
        let [cx, cy] = [x + dx, y + dy];
        while (free(cx, cy) && tiles.length <= CABLE_MAX) {
          tiles.push({ x: cx, y: cy });
          cx += dx;
          cy += dy;
        }
        if (tiles.length === 0 || tiles.length > CABLE_MAX) continue;
        if (getTile(map, cx, cy) !== 'wall') continue;
        // From the room's middle, not along its edge: a desk by the wall has its socket there.
        if (STEPS.some(([ex, ey]) => getTile(map, x + ex, y + ey) === 'wall')) continue;
        if (!cable || tiles.length < cable.tiles.length) cable = { tiles, across: dx !== 0 };
      }
    }
  if (cable)
    for (const p of cable.tiles)
      out[key(p.x, p.y)] = cable.across ? CARPET_WEAR.cableX : CARPET_WEAR.cableZ;

  // Coffee stains by desks and stations, in a fixed shuffle for this level, well apart.
  const byDesk: GridPoint[] = [];
  for (let y = 0; y < map.height; y++)
    for (let x = 0; x < map.width; x++)
      if (free(x, y) && STEPS.some(([dx, dy]) => isWorkSurface(getTile(map, x + dx, y + dy))))
        byDesk.push({ x, y });
  byDesk.sort((a, b) => ((tileHash(a.x, a.y) ^ salt) >>> 0) - ((tileHash(b.x, b.y) ^ salt) >>> 0));
  const stains: GridPoint[] = [];
  for (const p of byDesk) {
    if (stains.length >= COFFEE_MAX) break;
    if (stains.some((s) => Math.max(Math.abs(s.x - p.x), Math.abs(s.y - p.y)) < 3)) continue;
    stains.push(p);
    out[key(p.x, p.y)] = CARPET_WEAR.coffee;
  }
  return out;
}

/**
 * Wall-top tiles that can carry clutter: full walls (not the low front
 * wall, not a partition) with no floor behind them (it'd hide someone
 * standing there), clear of the door frames.
 */
function capFree(
  map: LevelMap,
  doors: readonly (Doorway | null)[],
  swaps: Record<string, string>,
): (x: number, y: number) => boolean {
  return (x, y) =>
    getTile(map, x, y) === 'wall' &&
    wallPiece(map, x, y) !== 'wall-front' &&
    getTile(map, x, y - 1) !== 'floor' &&
    swaps[key(x, y)] === undefined &&
    !nearDoor(doors, x, y, 1);
}

/**
 * Clutter on the wall tops, in clusters: along each run of free wall (rows
 * first, then what's left in columns) a cluster of one or two tiles, then
 * a tile or two of bare wall, and so on.
 */
function capProps(
  map: LevelMap,
  doors: readonly (Doorway | null)[],
  swaps: Record<string, string>,
): OfficeParkRoom['capProps'] {
  const free = capFree(map, doors, swaps);
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
  const out: OfficeParkRoom['capProps'] = [];
  let slot = 0;
  for (const run of runs) {
    for (let i = 0; i < run.length;) {
      const first = run[i];
      if (!first) break;
      const h = (tileHash(first.x + 7, first.y + 3) ^ salt) >>> 0;
      const size = run.length - i >= 2 && h % 3 !== 0 ? 2 : 1;
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
      i += size + (run.length >= 5 ? 2 : 1 + ((h >> 3) % 2));
    }
  }
  return out;
}

/** Low things on the front wall: every second or third tile, never beside a door. */
function frontProps(
  map: LevelMap,
  doors: readonly (Doorway | null)[],
): OfficeParkRoom['frontProps'] {
  const salt = levelSalt(map);
  const out: OfficeParkRoom['frontProps'] = [];
  const y = map.height - 1;
  let gap = 0;
  for (let x = 1; x < map.width - 1; x++) {
    const ok =
      getTile(map, x, y) === 'wall' &&
      wallPiece(map, x, y) === 'wall-front' &&
      !nearDoor(doors, x, y, 1);
    if (!ok) {
      gap = 0;
      continue;
    }
    if (gap > 0) {
      gap--;
      continue;
    }
    out.push({ x, y, slot: out.length });
    gap = 1 + (((tileHash(x, y + 5) ^ salt) >>> 0) % 2);
  }
  return out;
}
