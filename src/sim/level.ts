/**
 * Level maps: parsed from ASCII text in `maps/`.
 *
 * Tiles are stored row-major (`tiles[y * width + x]`) as plain strings so the
 * map stays JSON-serializable. Coordinates are plain grid coordinates; how
 * the level is projected on screen is a render concern.
 */

export type Tile =
  | 'wall'
  | 'floor'
  | 'counter'
  | 'inbox'
  | 'bugQueue'
  | 'keyboard'
  | 'testBench'
  | 'review'
  | 'pipeline'
  | 'ship'
  | 'bin';

export interface GridPoint {
  x: number;
  y: number;
}

export interface LevelMap {
  width: number;
  height: number;
  tiles: Tile[];
  /** Spawn point per player: `spawns[0]` is player 1. */
  spawns: GridPoint[];
  /** Where each wandering manager starts (`M`, a floor tile). */
  managerSpawns: GridPoint[];
  /** Meeting room tiles (`m`): floor that invited players must stand on. */
  meetingTiles: GridPoint[];
}

/** Every level has a spawn for each of up to 4 players. */
export const MAX_PLAYERS = 4;

const CHAR_TO_TILE: Readonly<Record<string, Tile>> = {
  '#': 'wall',
  '.': 'floor',
  C: 'counter',
  I: 'inbox',
  B: 'bugQueue',
  K: 'keyboard',
  T: 'testBench',
  R: 'review',
  P: 'pipeline',
  S: 'ship',
  X: 'bin',
};

/** Floor tiles with something extra on them. */
const MARKED_FLOOR: Readonly<Record<string, 'managerSpawns' | 'meetingTiles'>> = {
  M: 'managerSpawns',
  m: 'meetingTiles',
};

/**
 * Parses an ASCII level map. The digits 1 to 4 are floor tiles that mark the
 * player spawn points; each must appear exactly once. `M` is a floor tile
 * where a manager starts, `m` a meeting room floor tile. Throws with line and
 * column info for unknown chars, uneven rows and duplicate spawns.
 */
export function parseLevelMap(text: string): LevelMap {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  // A file ending in a newline yields one empty trailing line; drop it.
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();

  const firstLine = lines[0];
  if (firstLine === undefined || firstLine.length === 0) {
    throw new Error('Map is empty');
  }

  const width = firstLine.length;
  const tiles: Tile[] = [];
  const spawns: (GridPoint | undefined)[] = [];
  const marked: Pick<LevelMap, 'managerSpawns' | 'meetingTiles'> = {
    managerSpawns: [],
    meetingTiles: [],
  };
  lines.forEach((line, y) => {
    if (line.length !== width) {
      throw new Error(`Map line ${y + 1} has length ${line.length}, expected ${width}`);
    }
    for (let x = 0; x < width; x++) {
      const char = line.charAt(x);
      const where = `at line ${y + 1}, column ${x + 1}`;
      const player = Number(char);
      if (Number.isInteger(player) && player >= 1 && player <= MAX_PLAYERS) {
        if (spawns[player - 1]) throw new Error(`Duplicate spawn ${player} ${where}`);
        spawns[player - 1] = { x, y };
        tiles.push('floor');
        continue;
      }
      const mark = MARKED_FLOOR[char];
      if (mark) {
        marked[mark].push({ x, y });
        tiles.push('floor');
        continue;
      }
      const tile = CHAR_TO_TILE[char];
      if (tile === undefined) throw new Error(`Unknown map char '${char}' ${where}`);
      tiles.push(tile);
    }
  });

  const result: GridPoint[] = [];
  for (let i = 0; i < MAX_PLAYERS; i++) {
    const spawn = spawns[i];
    if (!spawn) throw new Error(`Map has no spawn ${i + 1}`);
    result.push(spawn);
  }

  return { width, height: lines.length, tiles, spawns: result, ...marked };
}

/** Returns the tile at (x, y), or `null` when out of bounds or not on the grid. */
export function getTile(map: LevelMap, x: number, y: number): Tile | null {
  if (!Number.isInteger(x) || !Number.isInteger(y)) return null;
  if (x < 0 || y < 0 || x >= map.width || y >= map.height) return null;
  return map.tiles[y * map.width + x] ?? null;
}

/** Everything except floor blocks movement; so does anything outside the map. */
export function isSolid(tile: Tile | null): boolean {
  return tile !== 'floor';
}

/** Counters and stations: the tiles players will put things on and work at. */
export function isWorkSurface(tile: Tile | null): boolean {
  return tile !== null && tile !== 'floor' && tile !== 'wall';
}
