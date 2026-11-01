/**
 * Where the garage room's story pieces go (the `garage` wall theme): the
 * open roll-up door at the ship hatch with a closed one beside it, the door
 * into the house at the inbox, the "SHIP IT" banner on the back wall, the oil
 * stain where the car used to stand. Placed from the map's own tiles, never at
 * fixed coordinates, so it fits any garage map. No three.js here, so it can be
 * tested.
 */

import { type GridPoint, type LevelMap, getTile } from '../../sim/level';
import { WALL_DECOS, wallPiece } from '../mapShape';
import { tilesOf } from './layout';

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
}

/** Tiles in a closed garage door: a single-car door. */
const DOOR_WIDTH = 2;
/** The banner's width in tiles, and the shortest bare back-wall run that takes it. */
const BANNER_WIDTH = 3;
/** How far in from the door, in tiles, the car stood (and dripped). */
const STAIN_DEPTHS = [3, 2, 4, 5];

export function garageRoom(map: LevelMap): GarageRoom {
  const opening = findOpening(map);
  const houseDoor = findHouseDoor(map);
  const below = houseDoor && { x: houseDoor.x, y: houseDoor.y + 1 };
  return {
    opening,
    door: opening ? findDoor(map, opening) : [],
    houseDoor,
    doormat: below && getTile(map, below.x, below.y) === 'floor' ? below : null,
    banner: findBanner(map, houseDoor),
    oilStain: opening ? findStain(map, opening) : null,
    decos: garageDecos(map),
  };
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
