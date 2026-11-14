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
  | 'bin'
  /** Design is sketched here, by hand, before coding. */
  | 'whiteboard'
  /** Where a front end and a back end come together (git merge). */
  | 'merge'
  /** Outside the office: nothing there. Lets a map have any outline. */
  | 'void'
  /** A drop inside the office (an atrium): tickets fly over it, nobody walks it. */
  | 'gap'
  /** A belt that carries a ticket along its direction (`LevelMap.conveyors`). */
  | 'conveyor';

/** Tiles drawn as a block standing on the floor: everything but floor and the drops. */
export type BlockTile = Exclude<Tile, 'floor' | 'void' | 'gap'>;

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
  /** Every conveyor tile and the grid direction it carries tickets, row by row. */
  conveyors: Conveyor[];
  /**
   * Tiles with a level-redesign mechanic on them, row by row. The tile under a
   * mark is what it plays as until its mechanic runs: floor for the walkable
   * ones, a counter for the tap, chute and rolling desk, a wall for a partition.
   */
  marks: MapMark[];
}

/** Mechanics that sit on a tile, each with its own map char. */
export type MarkKind =
  /** `_` wet floor: slippery (spills). */
  | 'wet'
  /** `%` dry floor a leaky tap floods (spills). */
  | 'spillZone'
  /** `r` the mop robot's loop (spills). */
  | 'mopRoute'
  /** `o` leaky tap: solid, fixed with work (spills). */
  | 'tap'
  /** `L` lift cabin (lifts). */
  | 'lift'
  /** `l` express lift cabin (lifts). */
  | 'expressLift'
  /** `H` mail chute hatch: tickets drop from the top one to the bottom one (lifts). */
  | 'chute'
  /** `=` partition: a wall that a reorg can open (reorgs). */
  | 'partition'
  /** `D` rolling desk: a counter a reorg can roll away (reorgs). */
  | 'rollingDesk'
  /** `d` meeting door: shut to others while a meeting is in session. */
  | 'meetingDoor'
  /** `+` badge turnstile: one way for people. */
  | 'turnstile'
  /** `Q` travelator: moving floor (campus). */
  | 'travelator'
  /** `Y` shuttle stop (campus). */
  | 'shuttleStop'
  /** `*` revolving door: one person at a time (campus). */
  | 'revolvingDoor';

export interface MapMark extends GridPoint {
  kind: MarkKind;
}

/** Map chars for marks, and the tile each one stands on. */
export const MARK_CHARS: Readonly<Record<string, { kind: MarkKind; tile: Tile }>> = {
  _: { kind: 'wet', tile: 'floor' },
  '%': { kind: 'spillZone', tile: 'floor' },
  r: { kind: 'mopRoute', tile: 'floor' },
  o: { kind: 'tap', tile: 'counter' },
  L: { kind: 'lift', tile: 'floor' },
  l: { kind: 'expressLift', tile: 'floor' },
  H: { kind: 'chute', tile: 'counter' },
  '=': { kind: 'partition', tile: 'wall' },
  D: { kind: 'rollingDesk', tile: 'counter' },
  d: { kind: 'meetingDoor', tile: 'floor' },
  '+': { kind: 'turnstile', tile: 'floor' },
  Q: { kind: 'travelator', tile: 'floor' },
  Y: { kind: 'shuttleStop', tile: 'floor' },
  '*': { kind: 'revolvingDoor', tile: 'floor' },
};

export interface Conveyor {
  x: number;
  y: number;
  /** Unit grid direction: where a ticket on it goes next. */
  dir: GridPoint;
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
  W: 'whiteboard',
  G: 'merge',
  ' ': 'void',
  '~': 'gap',
};

/** What a conveyor can hand a ticket to: another belt, a counter or a station that takes tickets. */
const BELT_TAKERS: ReadonlySet<Tile> = new Set<Tile>([
  'conveyor',
  'counter',
  'keyboard',
  'testBench',
  'review',
  'pipeline',
  'whiteboard',
  'merge',
]);

/** Conveyor chars and the way they carry (screen-relative: `v` runs toward the camera). */
const CONVEYOR_DIRS: Readonly<Record<string, GridPoint>> = {
  '>': { x: 1, y: 0 },
  '<': { x: -1, y: 0 },
  v: { x: 0, y: 1 },
  '^': { x: 0, y: -1 },
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
  const conveyors: Conveyor[] = [];
  const marks: MapMark[] = [];
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
      const mapMark = MARK_CHARS[char];
      if (mapMark) {
        marks.push({ x, y, kind: mapMark.kind });
        tiles.push(mapMark.tile);
        continue;
      }
      const dir = CONVEYOR_DIRS[char];
      if (dir) {
        conveyors.push({ x, y, dir });
        tiles.push('conveyor');
        continue;
      }
      const tile = CHAR_TO_TILE[char];
      if (tile === undefined) throw new Error(`Unknown map char '${char}' ${where}`);
      tiles.push(tile);
    }
  });

  // Every belt must hand its tickets to something that takes them, or they'd wait there forever.
  for (const belt of conveyors) {
    const x = belt.x + belt.dir.x;
    const y = belt.y + belt.dir.y;
    const next = x >= 0 && x < width && y >= 0 ? tiles[y * width + x] : undefined;
    if (next === undefined || !BELT_TAKERS.has(next)) {
      throw new Error(
        `Conveyor at line ${belt.y + 1}, column ${belt.x + 1} points at ${next ?? 'nothing'}`,
      );
    }
  }

  const result: GridPoint[] = [];
  for (let i = 0; i < MAX_PLAYERS; i++) {
    const spawn = spawns[i];
    if (!spawn) throw new Error(`Map has no spawn ${i + 1}`);
    result.push(spawn);
  }

  return { width, height: lines.length, tiles, spawns: result, ...marked, conveyors, marks };
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

/** Counters, stations and conveyors: the tiles players will put things on and work at. */
export function isWorkSurface(tile: Tile | null): boolean {
  return tile !== null && tile !== 'floor' && tile !== 'wall' && !isDrop(tile);
}

/** Whether `tile` stands on the floor as a block (walls, counters, stations, belts). */
export function isBlock(tile: Tile | null): tile is BlockTile {
  return tile !== null && tile !== 'floor' && !isDrop(tile);
}

/** Tiles a ticket falls into when it comes down there: the void outside and gaps. */
export function isDrop(tile: Tile | null): boolean {
  return tile === 'void' || tile === 'gap';
}

/** The marks of `kind` on the map, row by row. */
export function marksOf(map: LevelMap, kind: MarkKind): GridPoint[] {
  return map.marks.filter((m) => m.kind === kind).map(({ x, y }) => ({ x, y }));
}

/** The mark on tile (x, y), if there is one. */
export function markAt(map: LevelMap, x: number, y: number): MarkKind | undefined {
  return map.marks.find((m) => m.x === x && m.y === y)?.kind;
}

/** The conveyor on tile (x, y), if there is one. */
export function conveyorAt(map: LevelMap, x: number, y: number): Conveyor | undefined {
  return map.conveyors.find((c) => c.x === x && c.y === y);
}
