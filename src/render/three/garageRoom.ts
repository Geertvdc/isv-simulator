/**
 * Where the garage room's story pieces go (the `garage` wall theme): the
 * open roll-up door at the ship hatch with a closed one beside it, the door
 * into the house at the inbox, the "SHIP IT" banner on the back wall, the oil
 * stain where the car used to stand. Placed from the map's own tiles, never at
 * fixed coordinates, so it fits any garage map. No three.js here, so it can be
 * tested.
 */

import { type GridPoint, type LevelMap, getTile, isWorkSurface } from '../../sim/level';
import { WALL_DECOS, levelSalt, tileHash, wallPiece } from '../mapShape';
import { tilesOf } from './layout';

/** Wear on a slab tile (see `floorWear`), one per tile; `roomModels` draws them. */
export const SLAB_WEAR = {
  none: 0,
  /** Boot and chair-wheel scuffs, by the counters. */
  scuffs: 1,
  /** An old patch, a shade paler. */
  patch: 2,
  /** A hairline crack wandering across. */
  crack: 3,
  /** Paint dripped by the counters. */
  drips: 4,
  /** The car's tyre tracks in from the door, then fainter further in. */
  tracks: 5,
  tracksFaint: 6,
  /** A floor drain. */
  drain: 7,
} as const;

export interface GarageRoom {
  /** The open roll-up door: the ship tiles on the front edge, from `x0` to `x1` on row `y`. */
  opening: { y: number; x0: number; x1: number } | null;
  /** Front-wall tiles that are the closed garage door next to it. */
  door: GridPoint[];
  /** The inbox tile on the back edge, framed as the door into the house. */
  houseDoor: GridPoint | null;
  /** The floor tile in front of the house door, for the doormat. */
  doormat: GridPoint | null;
  /** The banner on top of the back wall: its middle tile and width in tiles. */
  banner: { x: number; y: number; width: number } | null;
  /** Middle of the oil stain, in grid coordinates (may sit between two tiles). */
  oilStain: { x: number; y: number } | null;
  /** What hangs on each wall facing open floor, keyed `x,y`. */
  decos: Record<string, string>;
  /** Wear on the slab's floor tiles (a `SLAB_WEAR`), keyed `x,y`; bare tiles are left out. */
  floorWear: Record<string, number>;
  /**
   * Junk piled on the wall tops in clusters of one or two tiles with bare
   * wall between: each tile's `slot` (consecutive in a cluster, so it picks
   * different props) and the step toward its cluster partner, to lean on it.
   */
  capProps: { x: number; y: number; slot: number; toward: { dx: number; dy: number } }[];
  /**
   * Low things lying on the front wall, which the camera looks over, so the
   * wall top isn't one long bare strip: each tile's `slot`, as for `capProps`.
   */
  frontProps: { x: number; y: number; slot: number }[];
}

/** Tiles in a closed garage door: a single-car door. */
const DOOR_WIDTH = 2;
/** The banner's width in tiles, and the shortest bare back-wall run that takes it. */
const BANNER_WIDTH = 3;
/** How far in from the door, in tiles, the car stood (and dripped): just inside it. */
const STAIN_DEPTHS = [1, 2, 3];
/** How far in from the door the tyre tracks run, the last of them faint. */
const TRACK_DEPTH = 3;
/** Hairline cracks: on a small room, and on a bigger one (over this many floor tiles). */
const CRACKS = { small: 2, big: 3, bigFrom: 70 };
/** The fewest tiles between two cracks. */
const CRACK_SPREAD = 3;
/** Paint drips by the counters, at most. */
const DRIPS_MAX = 3;

export function garageRoom(map: LevelMap): GarageRoom {
  const opening = findOpening(map);
  const houseDoor = findHouseDoor(map);
  const below = houseDoor && { x: houseDoor.x, y: houseDoor.y + 1 };
  const banner = findBanner(map, houseDoor);
  const door = opening ? findDoor(map, opening) : [];
  return {
    opening,
    door,
    houseDoor,
    doormat: below && getTile(map, below.x, below.y) === 'floor' ? below : null,
    banner,
    oilStain: opening ? findStain(map, opening) : null,
    decos: garageDecos(map),
    floorWear: floorWear(map, opening, below),
    capProps: capProps(map, houseDoor, banner),
    frontProps: opening ? frontProps(map, opening, door) : [],
  };
}

const key = (x: number, y: number) => `${x},${y}`;

/**
 * Wear on the slab, placed rather than sprinkled: the car's tyre tracks in
 * from the open door, a drain near the middle of the back, two or three
 * hairline cracks well apart, scuffs and paint drips on the floor by the
 * counters, an old patch. The rest stays bare.
 */
function floorWear(
  map: LevelMap,
  opening: GarageRoom['opening'],
  doormat: GridPoint | null,
): Record<string, number> {
  const salt = levelSalt(map);
  const out: Record<string, number> = {};
  const floor: GridPoint[] = [];
  for (let y = 0; y < map.height; y++)
    for (let x = 0; x < map.width; x++) if (getTile(map, x, y) === 'floor') floor.push({ x, y });
  const spawn = new Set(map.spawns.map((p) => key(p.x, p.y)));
  const free = (p: GridPoint) =>
    out[key(p.x, p.y)] === undefined &&
    !spawn.has(key(p.x, p.y)) &&
    !(doormat && doormat.x === p.x && doormat.y === p.y);
  if (opening) {
    for (let x = opening.x0; x <= opening.x1; x++) {
      for (let d = 1; d <= TRACK_DEPTH; d++) {
        if (getTile(map, x, opening.y - d) !== 'floor') break;
        out[key(x, opening.y - d)] = d < TRACK_DEPTH ? SLAB_WEAR.tracks : SLAB_WEAR.tracksFaint;
      }
    }
  }
  // The drain: the free tile nearest the middle, a third of the way down from the back.
  const cx = (map.width - 1) / 2;
  const cy = (map.height - 1) / 3;
  const drain = floor
    .filter(free)
    .sort((a, b) => Math.hypot(a.x - cx, a.y - cy) - Math.hypot(b.x - cx, b.y - cy))[0];
  if (drain) out[key(drain.x, drain.y)] = SLAB_WEAR.drain;
  // Every free tile in a fixed shuffle for this level.
  const shuffled = floor
    .filter(free)
    .sort((a, b) => ((tileHash(a.x, a.y) ^ salt) >>> 0) - ((tileHash(b.x, b.y) ^ salt) >>> 0));
  const nextToCounter = (p: GridPoint) =>
    [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ].some(([dx = 0, dy = 0]) => getTile(map, p.x + dx, p.y + dy) === 'counter');
  let drips = 0;
  for (const p of shuffled.filter(nextToCounter)) {
    const roll = (tileHash(p.y, p.x) ^ salt) % 3;
    if (roll === 0) out[key(p.x, p.y)] = SLAB_WEAR.scuffs;
    else if (roll === 1 && drips < DRIPS_MAX) {
      out[key(p.x, p.y)] = SLAB_WEAR.drips;
      drips++;
    }
  }
  const crackCount = floor.length > CRACKS.bigFrom ? CRACKS.big : CRACKS.small;
  const cracks: GridPoint[] = [];
  for (const p of shuffled) {
    if (cracks.length >= crackCount) break;
    if (!free(p) || nextToCounter(p)) continue;
    if (cracks.some((c) => Math.max(Math.abs(c.x - p.x), Math.abs(c.y - p.y)) < CRACK_SPREAD))
      continue;
    cracks.push(p);
    out[key(p.x, p.y)] = SLAB_WEAR.crack;
  }
  const patch = shuffled.filter(free).at(-1);
  if (patch) out[key(patch.x, patch.y)] = SLAB_WEAR.patch;
  return out;
}

/**
 * Wall-top tiles that can carry junk: full walls with no floor behind them
 * (it'd hide someone standing there) and no station or counter beside them
 * (it'd look like something to pick up), clear of the house door and the banner.
 */
function capFree(
  map: LevelMap,
  houseDoor: GridPoint | null,
  banner: GarageRoom['banner'],
): (x: number, y: number) => boolean {
  return (x, y) => {
    if (getTile(map, x, y) !== 'wall' || wallPiece(map, x, y) === 'wall-front') return false;
    if (getTile(map, x, y - 1) === 'floor') return false;
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const)
      if (isWorkSurface(getTile(map, x + dx, y + dy))) return false;
    if (houseDoor && y === houseDoor.y && Math.abs(x - houseDoor.x) <= 1) return false;
    if (banner && y === banner.y && Math.abs(x - banner.x) <= banner.width / 2) return false;
    return true;
  };
}

/**
 * Junk on the wall tops, in clusters: along each run of free wall (rows
 * first, then what's left in columns) a cluster of one or two tiles, then
 * a tile or two of bare wall, and so on.
 */
function capProps(
  map: LevelMap,
  houseDoor: GridPoint | null,
  banner: GarageRoom['banner'],
): GarageRoom['capProps'] {
  const free = capFree(map, houseDoor, banner);
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
        // Rows keep only runs of two or more; columns take what's left.
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
  const out: GarageRoom['capProps'] = [];
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
      // Bare wall after it: two tiles on a long run, so the clusters read as clusters.
      i += size + (run.length >= 5 ? 2 : 1 + ((h >> 3) % 2));
    }
  }
  return out;
}

/**
 * A garage hangs something on every wall facing open floor, not one in three
 * like an office: the garage's things in turn along each row, the pegboard
 * first, so close ones never match and the pegboard is always up.
 */
function garageDecos(map: LevelMap): Record<string, string> {
  const decos = WALL_DECOS.garage;
  const out: Record<string, string> = {};
  for (let y = 0; y < map.height; y++) {
    // Rows further in start further along the list: the back wall gets the pegboard.
    let k = y === 0 ? 0 : 2;
    for (let x = 0; x < map.width; x++) {
      if (getTile(map, x, y) !== 'wall' || wallPiece(map, x, y) !== 'wall') continue;
      if (getTile(map, x, y + 1) !== 'floor') continue;
      const deco = decos[k++ % decos.length];
      if (deco) out[`${x},${y}`] = deco;
    }
  }
  return out;
}

/** The lowest ship tile on the map's front edge, and its neighbours along the row. */
function findOpening(map: LevelMap): GarageRoom['opening'] {
  const y = map.height - 1;
  const first = tilesOf(map, 'ship').find((t) => t.y === y);
  if (!first) return null;
  let x0 = first.x;
  let x1 = first.x;
  while (getTile(map, x0 - 1, y) === 'ship') x0--;
  while (getTile(map, x1 + 1, y) === 'ship') x1++;
  return { y, x0, x1 };
}

function isFrontWallAt(map: LevelMap, x: number, y: number): boolean {
  // Corners stay block: a door needs a pier at its far end.
  if (x <= 0 || x >= map.width - 1) return false;
  return getTile(map, x, y) === 'wall' && wallPiece(map, x, y) === 'wall-front';
}

/**
 * A closed single-car door beside the open one, past a one-tile pier, on the
 * side with more front wall; it needs a pier at its far end too. None when
 * neither side has the room.
 */
function findDoor(map: LevelMap, opening: NonNullable<GarageRoom['opening']>): GridPoint[] {
  const { y } = opening;
  const run = (from: number, step: number) => {
    let n = 0;
    while (isFrontWallAt(map, from + n * step, y)) n++;
    return n;
  };
  const sides = [
    { from: opening.x1 + 1, step: 1, length: run(opening.x1 + 1, 1) },
    { from: opening.x0 - 1, step: -1, length: run(opening.x0 - 1, -1) },
  ].sort((a, b) => b.length - a.length);
  for (const side of sides) {
    // Pier, door, and the far end must still be wall (a front wall or the corner).
    if (side.length < DOOR_WIDTH + 1) continue;
    const far = side.from + (DOOR_WIDTH + 1) * side.step;
    if (getTile(map, far, y) !== 'wall') continue;
    return Array.from({ length: DOOR_WIDTH }, (_, i) => ({
      x: side.from + (i + 1) * side.step,
      y,
    })).sort((a, b) => a.x - b.x);
  }
  return [];
}

/** The first inbox with nothing behind it: on the map's back edge. */
function findHouseDoor(map: LevelMap): GridPoint | null {
  return (
    tilesOf(map, 'inbox').find((t) => {
      const behind = getTile(map, t.x, t.y - 1);
      return behind === null || behind === 'void';
    }) ?? null
  );
}

/**
 * The banner goes on the longest run of bare back wall (front face showing,
 * not a corner, not beside the house door), if one is long enough.
 */
function findBanner(map: LevelMap, houseDoor: GridPoint | null): GarageRoom['banner'] {
  const y = 0;
  const bare = (x: number) =>
    x > 0 &&
    x < map.width - 1 &&
    getTile(map, x, y) === 'wall' &&
    wallPiece(map, x, y) === 'wall' &&
    !(houseDoor && houseDoor.y === y && Math.abs(houseDoor.x - x) <= 1);
  let best: { start: number; length: number } | null = null;
  for (let x = 0; x < map.width;) {
    if (!bare(x)) {
      x++;
      continue;
    }
    const start = x;
    while (bare(x)) x++;
    const length = x - start;
    if (!best || length > best.length) best = { start, length };
  }
  if (!best || best.length < BANNER_WIDTH) return null;
  return { x: best.start + Math.floor(best.length / 2), y, width: BANNER_WIDTH };
}

/** A few tiles in from the open door, on bare floor (both tiles under it, when it sits between two). */
function findStain(
  map: LevelMap,
  opening: NonNullable<GarageRoom['opening']>,
): { x: number; y: number } | null {
  const x = (opening.x0 + opening.x1) / 2;
  for (const depth of STAIN_DEPTHS) {
    const y = opening.y - depth;
    if (y < 1) continue;
    if ([Math.floor(x), Math.ceil(x)].every((tx) => getTile(map, tx, y) === 'floor'))
      return { x, y };
  }
  return null;
}

/**
 * Low junk on the front wall: every second or third tile, never beside the open
 * door (its jambs stand there), on the closed door or on a corner.
 */
function frontProps(
  map: LevelMap,
  opening: NonNullable<GarageRoom['opening']>,
  door: GridPoint[],
): GarageRoom['frontProps'] {
  const salt = levelSalt(map);
  const { y } = opening;
  const out: GarageRoom['frontProps'] = [];
  let gap = 0;
  for (let x = 1; x < map.width - 1; x++) {
    const ok =
      isFrontWallAt(map, x, y) &&
      (x < opening.x0 - 1 || x > opening.x1 + 1) &&
      !door.some((t) => t.x === x);
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
