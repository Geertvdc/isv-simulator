/** Bot navigation: where tiles are and the walk to them. */

import { type GridPoint, type LevelMap, type Tile, getTile, isSolid, markAt } from './level';
import { NEIGHBOURS, searchPath } from './path';
import type { Gate } from './reorgs';
import { type GameState, type PlayerId, getPlayer } from './state';

export function tilesOf(map: LevelMap, tile: Tile): GridPoint[] {
  const result: GridPoint[] = [];
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      // A tap stands on a counter tile but is no counter.
      if (getTile(map, x, y) === tile && markAt(map, x, y) !== 'tap') result.push({ x, y });
    }
  }
  return result;
}

/** Floor tiles next to `tile`, where a player can stand to use it. */
function standingSpots(map: LevelMap, tile: GridPoint): GridPoint[] {
  return NEIGHBOURS.map((d) => ({ x: tile.x + d.x, y: tile.y + d.y })).filter(
    (p) => !isSolid(getTile(map, p.x, p.y)),
  );
}

/**
 * Shortest floor path from `from` to any tile next to `target`, as a list of
 * tiles starting after `from`. Empty when already there; `null` when
 * unreachable. Spots in `taken` don't count as next to it; tiles in
 * `blocked` (where a manager walks) are walked around.
 */
export function findPath(
  map: LevelMap,
  from: GridPoint,
  target: GridPoint,
  taken: readonly GridPoint[] = [],
  blocked: readonly GridPoint[] = [],
  gates: readonly Gate[] = [],
): GridPoint[] | null {
  const key = (p: GridPoint): number => p.y * map.width + p.x;
  const takenKeys = new Set([...taken, ...blocked].map(key));
  const goals = new Set(
    standingSpots(map, target)
      .map(key)
      .filter((k) => !takenKeys.has(k)),
  );
  return searchPath(map, from, (p) => goals.has(key(p)), blocked, gates);
}

export function currentTile(state: GameState, playerId: PlayerId): GridPoint {
  const p = getPlayer(state, playerId);
  if (!p) throw new Error(`No player ${playerId}`);
  return { x: Math.round(p.pos.x), y: Math.round(p.pos.y) };
}

/** The candidate closest by walking distance, or `undefined` if none is reachable. */
export function nearest(
  state: GameState,
  playerId: PlayerId,
  tiles: GridPoint[],
): GridPoint | undefined {
  const from = currentTile(state, playerId);
  let best: GridPoint | undefined;
  let bestLength = Infinity;
  for (const tile of tiles) {
    const path = findPath(state.level, from, tile, [], [], state.gates);
    if (path && path.length < bestLength) {
      best = tile;
      bestLength = path.length;
    }
  }
  return best;
}

export function samePoint(a: GridPoint | null, b: GridPoint | null): boolean {
  return a !== null && b !== null && a.x === b.x && a.y === b.y;
}

/** Steps for `playerId` to stand next to `tile`, or `Infinity` when they can't get there. */
export function walkLength(state: GameState, playerId: PlayerId, tile: GridPoint): number {
  const path = findPath(state.level, currentTile(state, playerId), tile, [], [], state.gates);
  return path ? path.length : Infinity;
}
