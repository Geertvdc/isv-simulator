/**
 * Live tiles: the map during a round. Mechanics of the level redesign change
 * tiles while a round plays (a partition opens, a desk rolls away, a meeting
 * door shuts). They change `state.level` itself, so everything that reads the
 * map (movement, interact, throws, belts, bots, render) sees the live layout
 * through the one accessor it already uses, `getTile(state.level, x, y)`.
 *
 * Every change is also kept in `state.liveTiles`, by tile index, with the
 * tile's current value. A snapshot leaves out the static level map, so this is
 * how clients get the live layout back: `applyLiveTiles` on the round's map.
 * An entry is kept once a tile has changed, even when it changes back, so
 * applying it to the start map or to an already live map gives the same map.
 */

import { type LevelMap, type Tile, getTile } from './level';
import type { GameState } from './state';

/** Changed tiles by index (`y * width + x`): what each is now. */
export type LiveTiles = Record<string, Tile>;

/** Sets tile (x, y) of the live map. Out-of-bounds points throw: a mechanic must stay on its map. */
export function setLiveTile(state: GameState, x: number, y: number, tile: Tile): void {
  if (getTile(state.level, x, y) === null) throw new Error(`No tile at ${x},${y}`);
  const index = y * state.level.width + x;
  state.level.tiles[index] = tile;
  state.liveTiles[String(index)] = tile;
}

/** Puts the live tiles on `map`. Mutates and returns it. */
export function applyLiveTiles(map: LevelMap, live: LiveTiles): LevelMap {
  for (const [key, tile] of Object.entries(live)) {
    const index = Number(key);
    if (Number.isInteger(index) && index >= 0 && index < map.tiles.length) map.tiles[index] = tile;
  }
  return map;
}
