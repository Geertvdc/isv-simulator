/**
 * Where the Demo Day stage's story pieces go (the `stageSet` wall theme):
 * the stage door from the wings round the inbox, the live demo consoles at
 * the ship hatches, what hangs on the demo set's back wall (the LED wall
 * panel, the confidence monitor, the set list, the fire exit), the lighting
 * truss strung wall to wall along the back on two towers, placed wear on
 * the stage decks (spike tape, glow tape, gaffer-taped cables, scuffs) and
 * the clusters on the wall tops and the low front wall. Placed from the
 * map's own tiles, never at fixed coordinates, so it fits any map. No
 * three.js here, so it can be tested.
 */

import { type GridPoint, type LevelMap, getTile } from '../../../sim/level';
import type { Vec3 } from '../../projection';
import { levelSalt, tileHash, wallPiece } from '../../mapShape';
import { atmosphereFor, lampSpots } from '../atmosphere';
import { WALL_HEIGHT, tilesOf } from '../layout';
import { globeFit } from './loftRoom';
import type { Doorway, Side } from './officeParkRoom';

export type { Doorway, Side };

/** Wear on a stage deck tile (see `floorWear`), one per tile; `roomModels/stageSet` draws them. */
export const DECK_WEAR = {
  none: 0,
  /** A small spike-tape mark (a T or an L, picked by the tile) in white, fluorescent yellow, pink. */
  spikeWhite: 1,
  spikeYellow: 2,
  spikePink: 3,
  /** Glow tape dashes along the tile's front edge (the stage lip). */
  glowFront: 4,
  /** A gaffer-taped cable across the tile (x) or down it (z). */
  cableX: 5,
  cableZ: 6,
  /**
   * Where a cable ends in a stage box: the cable comes in from the tile's
   * back (−z), front (+z), left (−x) or right (+x) edge.
   */
  cableEndBack: 7,
  cableEndFront: 8,
  cableEndLeft: 9,
  cableEndRight: 10,
  /** Rubber-sole scuffs on the paint. */
  scuffs: 11,
} as const;
/** How many wear kinds there are. */
export const DECK_WEAR_KINDS = 12;

/**
 * What hangs on the demo set's back wall: the small LED wall panel (two
 * tiles, YOTTA's logo), the confidence monitor showing the next slide, the
 * gaffer-taped set list and the fire exit pictogram.
 */
export type StageArt = 'ledPanel' | 'confidence' | 'setList' | 'fireExit';
/** How many tiles each piece spans. */
export const STAGE_ART_SPAN: Readonly<Record<StageArt, number>> = {
  ledPanel: 2,
  confidence: 1,
  setList: 1,
  fireExit: 1,
};
/** How far each piece reaches either side of its middle (`roomModels/stageSet` builds to it). */
export const STAGE_ART_HALF: Readonly<Record<StageArt, number>> = {
  ledPanel: 0.92,
  confidence: 0.36,
  setList: 0.2,
  fireExit: 0.16,
};

export interface StageArtSpot {
  /** The wall tile it hangs on (a two-tile piece's middle, between them). */
  x: number;
  y: number;
  art: StageArt;
}

/** A live demo console at a ship hatch, and the wall tile beside it its desk stands on (if any). */
export interface LiveConsole {
  door: Doorway;
  /** On a hatch along the front edge: the low wall tile beside it with the demo desk on top. */
  desk: GridPoint | null;
}

/**
 * The lighting truss along the back: a box-truss beam at height `y` in the
 * row `z` (over the back wall's cap), spanning the room from `x0` to `x1`
 * (the side walls' inner faces), on two supports on the corner walls.
 */
export interface Truss {
  z: number;
  y: number;
  x0: number;
  x1: number;
  towers: GridPoint[];
  /** Where along it the lamps hang (x). */
  lamps: number[];
}

export interface StageSetRoom {
  /** The inbox framed as the stage door from the wings. */
  stageDoor: Doorway | null;
  /** Each ship hatch framed as a live demo console. */
  consoles: LiveConsole[];
  /** Always empty: the set's pieces are placed as story pieces (`wallArt`), not hashed decorations. */
  decos: Record<string, string>;
  wallArt: StageArtSpot[];
  /** Wear on the decks (a `DECK_WEAR`), keyed `x,y`; bare tiles left out. */
  floorWear: Record<string, number>;
  /** Clusters on the wall tops (see `RoomPlan.capProps`). */
  capProps: { x: number; y: number; slot: number; toward: { dx: number; dy: number } }[];
  /** Low clusters lying on the front wall (see `RoomPlan.frontProps`). */
  frontProps: { x: number; y: number; slot: number }[];
  /** The lighting trusses, one per row of lamps. */
  trusses: Truss[];
  /** The wall-top tile the mirror ball stands on (once): a side wall's cluster swapped for it. */
  mirrorBall: GridPoint | null;
}

/** The scene whose lamps the truss carries: the demo set is only built on the Demo Day stage. */
const SCENE = 'demo-day';
/**
 * The truss beam's middle: low, just over the back wall's cap (so it never
 * covers the big screen standing behind), and how far behind the middle of
 * the back wall's row it runs (over the cap's back half).
 */
export const BEAM_Y = WALL_HEIGHT + 0.14;
export const BEAM_BACK = 0.36;

const OUT: Readonly<Record<Side, { dx: number; dy: number }>> = {
  back: { dx: 0, dy: -1 },
  front: { dx: 0, dy: 1 },
  left: { dx: -1, dy: 0 },
  right: { dx: 1, dy: 0 },
};

const key = (x: number, y: number) => `${x},${y}`;

/** How deep the cable from the stage door runs in, and from a console. */
const DOOR_CABLE = 3;
const CONSOLE_CABLE = 2;
/** Spike marks at most, glow tape dashes along the lip at most, scuffs at most. */
const SPIKES_MAX = 6;
const SCUFFS_MAX = 2;
/** Clusters on the wall tops at most: along the back, on each side wall, on the front wall. */
export const STAGE_CAP_CLUSTERS = { back: 3, side: 3, front: 2 } as const;

export function stageSetRoom(map: LevelMap): StageSetRoom {
  const stageDoor = findDoorways(map, 'inbox')[0] ?? null;
  const consoles = findDoorways(map, 'ship').map((door) => ({
    door,
    desk: consoleDesk(map, door),
  }));
  const doors = [stageDoor, ...consoles.map((c) => c.door)];
  const trusses = placeTrusses(map);
  const towers = new Set(trusses.flatMap((t) => t.towers.map((p) => key(p.x, p.y))));
  const desks = new Set(consoles.flatMap((c) => (c.desk ? [key(c.desk.x, c.desk.y)] : [])));
  const caps = capProps(map, doors, towers);
  // The mirror ball (once) on the first side wall's cluster, else the last on the back.
  const ball =
    caps.find((p) => p.x === 0 || p.x === map.width - 1 || getTile(map, p.x, p.y - 1) === 'wall') ??
    caps[caps.length - 1] ??
    null;
  return {
    stageDoor,
    consoles,
    decos: {},
    wallArt: placeWallArt(map, doors),
    floorWear: floorWear(map, stageDoor, consoles),
    capProps: caps.filter((p) => p !== ball),
    frontProps: frontProps(map, doors, desks),
    trusses,
    mirrorBall: ball ? { x: ball.x, y: ball.y } : null,
  };
}

/** Whether (x, y) is open ground (not wall, not outside). */
function isOpen(map: LevelMap, x: number, y: number): boolean {
  const t = getTile(map, x, y);
  return t !== null && t !== 'wall' && t !== 'void';
}

/** Whether (x, y) is off the map or void: outside the stage. */
function outside(map: LevelMap, x: number, y: number): boolean {
  const t = getTile(map, x, y);
  return t === null || t === 'void';
}

/**
 * Every run of `tile` along an edge with the outside beyond it (each tile
 * in one run at most): the back edge's first, then the front, left, right;
 * along each, in map order.
 */
export function findDoorways(map: LevelMap, tile: 'inbox' | 'ship'): Doorway[] {
  const tiles = tilesOf(map, tile);
  const used = new Set<string>();
  const out: Doorway[] = [];
  for (const side of ['back', 'front', 'left', 'right'] as const) {
    const { dx, dy } = OUT[side];
    const [ax, ay] = dy !== 0 ? [1, 0] : [0, 1];
    const isDoor = (x: number, y: number) =>
      getTile(map, x, y) === tile && outside(map, x + dx, y + dy) && !used.has(key(x, y));
    for (const t of tiles) {
      if (!isDoor(t.x, t.y) || isDoor(t.x - ax, t.y - ay)) continue;
      const run: GridPoint[] = [];
      let p = t;
      while (isDoor(p.x, p.y)) {
        run.push(p);
        p = { x: p.x + ax, y: p.y + ay };
      }
      for (const r of run) used.add(key(r.x, r.y));
      const a = run[0] ?? t;
      const b = run[run.length - 1] ?? t;
      out.push({ side, tiles: run, mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } });
    }
  }
  return out;
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
 * The low front wall tile the demo desk of a console on the front edge
 * stands on: right beside the hatch on the side away from the map's middle
 * (so the middle of the lip stays clear), else the other side.
 */
function consoleDesk(map: LevelMap, door: Doorway): GridPoint | null {
  if (door.side !== 'front') return null;
  const xs = door.tiles.map((t) => t.x);
  const y = door.mid.y;
  const lo = { x: Math.min(...xs) - 1, y };
  const hi = { x: Math.max(...xs) + 1, y };
  const ok = (p: GridPoint) =>
    getTile(map, p.x, p.y) === 'wall' && wallPiece(map, p.x, p.y) === 'wall-front';
  const outer = door.mid.x < (map.width - 1) / 2 ? [lo, hi] : [hi, lo];
  return outer.find(ok) ?? null;
}

/**
 * What hangs on the back wall: walls showing their face to the room with
 * floor in front and nothing open behind. The LED wall panel (two tiles)
 * nearest the middle on the right half, the confidence monitor on the
 * other half nearest the middle, the set list beside the monitor, and the
 * fire exit sign as far into a corner as there is.
 */
function placeWallArt(map: LevelMap, doors: readonly (Doorway | null)[]): StageArtSpot[] {
  const ok = (x: number, y: number) =>
    getTile(map, x, y) === 'wall' &&
    wallPiece(map, x, y) === 'wall' &&
    !isOpen(map, x, y - 1) &&
    getTile(map, x, y + 1) === 'floor' &&
    !nearDoor(doors, x, y, 1);
  const midX = (map.width - 1) / 2;
  const used = new Set<string>();
  const out: StageArtSpot[] = [];
  const places = (art: StageArt, score: (x: number, y: number) => number) => {
    const span = STAGE_ART_SPAN[art];
    const found: { x: number; y: number; s: number }[] = [];
    for (let y = 0; y < map.height; y++)
      for (let x = 0; x + span - 1 < map.width; x++) {
        let fits = true;
        for (let i = 0; i < span; i++) if (!ok(x + i, y) || used.has(key(x + i, y))) fits = false;
        if (fits) found.push({ x: x + (span - 1) / 2, y, s: score(x + (span - 1) / 2, y) });
      }
    return found.sort((a, b) => a.s - b.s || a.y - b.y || a.x - b.x);
  };
  const take = (art: StageArt, p: { x: number; y: number } | undefined) => {
    if (!p) return;
    const span = STAGE_ART_SPAN[art];
    for (let i = 0; i < span; i++) used.add(key(p.x - (span - 1) / 2 + i, p.y));
    out.push({ x: p.x, y: p.y, art });
  };
  // Back walls only: the topmost row of each column.
  const row = (y: number) => y * 2;
  take(
    'ledPanel',
    places('ledPanel', (x, y) => (x < midX ? 3 : 0) + Math.abs(x - midX) + row(y))[0],
  );
  const panel = out[0];
  const otherHalf = (x: number) => (panel ? panel.x < midX === x < midX : false);
  take(
    'confidence',
    places('confidence', (x, y) => (otherHalf(x) ? 3 : 0) + Math.abs(x - midX) + row(y))[0],
  );
  const monitor = out.find((a) => a.art === 'confidence');
  if (monitor)
    take(
      'setList',
      places('setList', (x, y) =>
        y !== monitor.y ? 99 : Math.abs(Math.abs(x - monitor.x) - 1) + (x > monitor.x ? 0.1 : 0),
      ).find((p) => p.s < 1),
    );
  // The fire exit near a corner: as far from the middle as it gets, clear of the rest.
  take(
    'fireExit',
    places('fireExit', (x, y) => -Math.abs(x - midX) + row(y)).find((p) =>
      out.every((a) => a.y !== p.y || Math.abs(a.x - p.x) >= STAGE_ART_SPAN[a.art] / 2 + 1),
    ),
  );
  return out.sort((a, b) => a.y - b.y || a.x - b.x);
}

/**
 * Wear on the stage decks, placed: a gaffer-taped cable in from the stage
 * door to a stage box and a shorter one in from a console, glow tape along
 * the stage lip (every second tile), small spike marks on tiles along the
 * room's edges and scuffs in front of the keyboards. Never on a spawn.
 */
function floorWear(
  map: LevelMap,
  stageDoor: Doorway | null,
  consoles: readonly LiveConsole[],
): Record<string, number> {
  const salt = levelSalt(map);
  const out: Record<string, number> = {};
  const spawns = map.spawns.map((p) => key(p.x, p.y));
  const spawn = new Set(spawns);
  const free = (x: number, y: number) =>
    getTile(map, x, y) === 'floor' && out[key(x, y)] === undefined && !spawn.has(key(x, y));

  /** A cable in from `door` (its best tile) up to `depth` tiles, ending in a stage box. */
  const cable = (door: Doorway, depth: number, pick: (t: GridPoint) => number) => {
    const { dx, dy } = OUT[door.side];
    let best: GridPoint[] = [];
    for (const t of [...door.tiles].sort((a, b) => pick(a) - pick(b))) {
      const run: GridPoint[] = [];
      for (let d = 1; d <= depth; d++) {
        const p = { x: t.x - dx * d, y: t.y - dy * d };
        if (!free(p.x, p.y)) break;
        run.push(p);
      }
      if (run.length > best.length) best = run;
    }
    if (best.length === 0) return;
    const along = dx !== 0 ? DECK_WEAR.cableX : DECK_WEAR.cableZ;
    const end = {
      back: DECK_WEAR.cableEndBack,
      front: DECK_WEAR.cableEndFront,
      left: DECK_WEAR.cableEndLeft,
      right: DECK_WEAR.cableEndRight,
    }[door.side];
    best.forEach((p, i) => (out[key(p.x, p.y)] = i === best.length - 1 ? end : along));
  };
  if (stageDoor) cable(stageDoor, DOOR_CABLE, (t) => (tileHash(t.x, t.y) ^ salt) % 7);
  // One console's cable: the outer tile of the console nearest a side wall.
  const console = [...consoles].sort(
    (a, b) =>
      Math.min(a.door.mid.x, map.width - 1 - a.door.mid.x) -
      Math.min(b.door.mid.x, map.width - 1 - b.door.mid.x),
  )[0];
  if (console)
    cable(console.door, CONSOLE_CABLE, (t) =>
      console.door.mid.x < (map.width - 1) / 2 ? t.x : -t.x,
    );

  // Glow tape along the lip: floor in front of a low front wall on the map's front edge.
  for (let y = 0; y < map.height; y++)
    for (let x = 0; x < map.width; x++) {
      const wall = getTile(map, x, y + 1) === 'wall' && wallPiece(map, x, y + 1) === 'wall-front';
      if (wall && outside(map, x, y + 2) && x % 2 === salt % 2 && free(x, y))
        out[key(x, y)] = DECK_WEAR.glowFront;
    }

  // Scuffs on the floor a keyboard faces, a couple, well apart.
  const scuffs: GridPoint[] = [];
  for (const k of tilesOf(map, 'keyboard')) {
    if (scuffs.length >= SCUFFS_MAX) break;
    for (const [dx, dy] of [
      [0, 1],
      [1, 0],
      [-1, 0],
      [0, -1],
    ] as const) {
      const p = { x: k.x + dx, y: k.y + dy };
      if (!free(p.x, p.y)) continue;
      if (scuffs.some((s) => Math.max(Math.abs(s.x - p.x), Math.abs(s.y - p.y)) < 3)) continue;
      scuffs.push(p);
      out[key(p.x, p.y)] = DECK_WEAR.scuffs;
      break;
    }
  }

  // Spike marks: floor along the room's edges (a wall or a station beside it), a tile away from
  // every spawn, picked by the level, well apart, colours taking turns.
  const edge = (x: number, y: number) =>
    [
      [0, 1],
      [1, 0],
      [-1, 0],
      [0, -1],
    ].some(([dx = 0, dy = 0]) => {
      const t = getTile(map, x + dx, y + dy);
      return t !== null && t !== 'floor' && t !== 'counter' && t !== 'void';
    });
  const nearSpawn = (x: number, y: number) =>
    map.spawns.some((s) => Math.max(Math.abs(s.x - x), Math.abs(s.y - y)) <= 1);
  const spikes: GridPoint[] = [];
  const candidates: { x: number; y: number; h: number }[] = [];
  for (let y = 0; y < map.height; y++)
    for (let x = 0; x < map.width; x++)
      if (free(x, y) && edge(x, y) && !nearSpawn(x, y))
        candidates.push({ x, y, h: (tileHash(x + 7, y + 3) ^ salt) >>> 0 });
  candidates.sort((a, b) => (a.h % 1009) - (b.h % 1009));
  const colours = [DECK_WEAR.spikeWhite, DECK_WEAR.spikeYellow, DECK_WEAR.spikePink];
  for (const c of candidates) {
    if (spikes.length >= SPIKES_MAX) break;
    if (spikes.some((s) => Math.max(Math.abs(s.x - c.x), Math.abs(s.y - c.y)) < 3)) continue;
    spikes.push(c);
    out[key(c.x, c.y)] = colours[spikes.length % colours.length] ?? DECK_WEAR.spikeWhite;
  }
  return out;
}

/**
 * Wall-top tiles that can carry a cluster: full walls (not the low front
 * wall) with nothing open behind them (it'd hide someone standing there),
 * clear of the door frames and the truss towers.
 */
function capFree(
  map: LevelMap,
  doors: readonly (Doorway | null)[],
  towers: ReadonlySet<string>,
): (x: number, y: number) => boolean {
  return (x, y) =>
    getTile(map, x, y) === 'wall' &&
    wallPiece(map, x, y) !== 'wall-front' &&
    !isOpen(map, x, y - 1) &&
    !nearDoor(doors, x, y, 1) &&
    !towers.has(key(x, y));
}

/**
 * Clusters on the wall tops, the rest bare as a breather: the free wall
 * tops sorted onto the back, left and right walls, and on each wall up to
 * `STAGE_CAP_CLUSTERS` single-tile clusters spread evenly along it, at
 * least `CLUSTER_GAP` apart.
 */
function capProps(
  map: LevelMap,
  doors: readonly (Doorway | null)[],
  towers: ReadonlySet<string>,
): StageSetRoom['capProps'] {
  const free = capFree(map, doors, towers);
  const taken = new Set<string>();
  const runs: { tiles: GridPoint[]; across: boolean }[] = [];
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
          runs.push({ tiles: run, across });
          for (const p of run) taken.add(key(p.x, p.y));
        }
        run = [];
      }
    }
  };
  collect(true);
  collect(false);
  const wallOf = ({ tiles, across }: (typeof runs)[number]): 'back' | 'left' | 'right' => {
    const p = tiles[0];
    if (!p || (across && p.y < map.height / 2)) return 'back';
    return p.x < map.width / 2 ? 'left' : 'right';
  };
  const walls: Record<'back' | 'left' | 'right', GridPoint[]> = { back: [], left: [], right: [] };
  for (const run of runs) walls[wallOf(run)].push(...run.tiles);
  const out: StageSetRoom['capProps'] = [];
  let slot = 0;
  for (const wall of ['back', 'left', 'right'] as const) {
    const along = (p: GridPoint) => (wall === 'back' ? p.x * 4 + p.y : p.y * 4 + p.x);
    const picked = spreadApart(
      walls[wall],
      along,
      STAGE_CAP_CLUSTERS[wall === 'back' ? 'back' : 'side'],
    );
    const order = wall === 'right' ? [...picked].reverse() : picked;
    for (const p of order) out.push({ x: p.x, y: p.y, slot: slot++, toward: { dx: 0, dy: 0 } });
  }
  return out;
}

/** How many tiles apart (either way) clusters stand at least. */
const CLUSTER_GAP = 2;

/** Up to `n` of `tiles`, each nearest an even mark along the wall, at least `CLUSTER_GAP` apart. */
function spreadApart(
  tiles: readonly GridPoint[],
  along: (p: GridPoint) => number,
  n: number,
): GridPoint[] {
  if (tiles.length === 0) return [];
  const sorted = [...tiles].sort((a, b) => along(a) - along(b));
  const picked: GridPoint[] = [];
  for (let i = 0; i < n; i++) {
    const mark = ((i + 0.5) * sorted.length) / n - 0.5;
    let best: { p: GridPoint; d: number } | null = null;
    sorted.forEach((p, k) => {
      if (picked.some((q) => Math.max(Math.abs(q.x - p.x), Math.abs(q.y - p.y)) < CLUSTER_GAP))
        return;
      const d = Math.abs(k - mark);
      if (!best || d < best.d - 1e-9) best = { p, d };
    });
    const found = best as { p: GridPoint; d: number } | null;
    if (found) picked.push(found.p);
  }
  return picked.sort((a, b) => along(a) - along(b));
}

/**
 * Low clusters on the outer front walls (low front wall pieces with the
 * outside in front of them), never beside a door or on a console's desk,
 * at most `STAGE_CAP_CLUSTERS.front`, spread along the lip.
 */
function frontProps(
  map: LevelMap,
  doors: readonly (Doorway | null)[],
  desks: ReadonlySet<string>,
): StageSetRoom['frontProps'] {
  const free: GridPoint[] = [];
  for (let y = 0; y < map.height; y++)
    for (let x = 1; x < map.width - 1; x++)
      if (
        getTile(map, x, y) === 'wall' &&
        wallPiece(map, x, y) === 'wall-front' &&
        isOpen(map, x, y - 1) &&
        outside(map, x, y + 1) &&
        !nearDoor(doors, x, y, 1) &&
        !desks.has(key(x, y))
      )
        free.push({ x, y });
  return spreadApart(free, (p) => p.x * 100 + p.y, STAGE_CAP_CLUSTERS.front)
    .sort((a, b) => a.x - b.x)
    .map((p, slot) => ({ ...p, slot }));
}

/**
 * The par can for the lamp spot `at` (see `RoomDressing.lamp.fit`): slid
 * along its row clear of the stations like the loft's globes, standing on
 * the truss beam over the back wall behind it (the light stays at the spot).
 */
export function stageLampFit(at: Vec3, map: LevelMap): Vec3 | null {
  const fit = globeFit(at, map);
  if (!fit) return null;
  const back = Math.floor(at.z + 0.5) - 1;
  return { x: fit.x, y: BEAM_Y, z: back - BEAM_BACK };
}

/**
 * The lighting trusses: one beam per row of the stage's lamps (see
 * `lampSpots`), along the back wall over its cap, wall to wall, on two
 * supports on the corner walls at its ends.
 */
function placeTrusses(map: LevelMap): Truss[] {
  const spots = lampSpots(atmosphereFor(SCENE), map).flatMap((at) => {
    const fit = stageLampFit(at, map);
    return fit ? [fit] : [];
  });
  const rows = new Map<number, Vec3[]>();
  for (const p of spots) {
    const k = Math.round(p.z * 100);
    rows.set(k, [...(rows.get(k) ?? []), p]);
  }
  const out: Truss[] = [];
  for (const row of rows.values()) {
    row.sort((a, b) => a.x - b.x);
    const first = row[0];
    const last = row[row.length - 1];
    if (!first || !last) continue;
    // Out along the room's first row to its edge: the first wall or station set in it.
    const back = Math.round(first.z + BEAM_BACK);
    const gy = back + 1;
    let x0 = Math.round(first.x);
    while (getTile(map, x0 - 1, gy) === 'floor' || getTile(map, x0 - 1, gy) === 'counter') x0--;
    let x1 = Math.round(last.x);
    while (getTile(map, x1 + 1, gy) === 'floor' || getTile(map, x1 + 1, gy) === 'counter') x1++;
    // The supports on the corner walls at the back wall's ends.
    out.push({
      z: first.z,
      y: first.y,
      x0: x0 - 0.5,
      x1: x1 + 0.5,
      towers: [
        { x: x0 - 1, y: back },
        { x: x1 + 1, y: back },
      ],
      lamps: row.map((p) => p.x),
    });
  }
  return out;
}
