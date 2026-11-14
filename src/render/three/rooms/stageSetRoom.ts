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
  /** Rubber-sole scuffs on the paint. */
  scuffs: 5,
  /** A spike-tape X in the middle of the tile, where something gets set for the next act. */
  spikeX: 6,
  /**
   * The first cable kind: a gaffer-taped cable hugging one edge of the tile
   * (a wall or a door past it), `cable + edge * CABLE_PARTS + part` (see
   * `cableWear`).
   */
  cable: 7,
} as const;

/** The edges a floor cable hugs, in the order its kind counts them. */
export const CABLE_EDGES: readonly Side[] = ['back', 'front', 'left', 'right'];
/**
 * The parts of a floor cable on its tile, along its run (+ is toward +x, or
 * +y on the map for a run down a side): the cable right across, ending in a
 * stage box at its + or − end, or right across under a cable ramp at its +
 * or − end.
 */
export const CABLE_PART = { run: 0, boxPlus: 1, boxMinus: 2, rampPlus: 3, rampMinus: 4 } as const;
export const CABLE_PARTS = 5;
/** How many wear kinds there are. */
export const DECK_WEAR_KINDS = DECK_WEAR.cable + CABLE_EDGES.length * CABLE_PARTS;

/** The wear of a cable hugging `edge`, its `part` on the tile. */
export function cableWear(edge: Side, part: number): number {
  return DECK_WEAR.cable + CABLE_EDGES.indexOf(edge) * CABLE_PARTS + part;
}

/** Whether a wear is a floor cable, and if so the edge it hugs and its part. */
export function cableOf(wear: number): { edge: Side; part: number } | null {
  if (wear < DECK_WEAR.cable || wear >= DECK_WEAR_KINDS) return null;
  const k = wear - DECK_WEAR.cable;
  return { edge: CABLE_EDGES[Math.floor(k / CABLE_PARTS)] ?? 'back', part: k % CABLE_PARTS };
}

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
  /** The low front wall's two outermost free tiles: a stage monitor wedge on each, facing in. */
  frontWedges: GridPoint[];
  /**
   * One cluster per run of walls inside the outline (the draft's inner
   * walls): on a full wall's top (`tall`), else a flat one on a low wall.
   */
  innerProps: { x: number; y: number; tall: boolean; slot: number }[];
  /** A gaffer-taped set list on the face of an inner wall (once, if there is one). */
  innerSetList: GridPoint | null;
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
/**
 * Cluster anchors on the wall tops at most: along the back, on each side
 * wall (each anchor with a partner beside it where there is room), and on
 * the low front wall between its two monitor wedges.
 */
export const STAGE_CAP_CLUSTERS = { back: 4, side: 3, front: 3 } as const;

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
  const inner = innerWalls(map);
  const { caps, ball } = capProps(map, doors, towers, inner);
  const front = frontProps(map, doors, desks);
  return {
    stageDoor,
    consoles,
    decos: {},
    wallArt: placeWallArt(map, doors),
    floorWear: floorWear(map, stageDoor, consoles),
    capProps: caps,
    frontProps: front.props,
    frontWedges: front.wedges,
    innerProps: innerProps(map, doors, towers, inner),
    innerSetList: innerSetList(map, inner),
    trusses,
    mirrorBall: ball,
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
 * Wear on the stage decks, placed: gaffer-taped cables kept tight along the
 * walls (out of the stage door to a stage box, along the lip from a
 * console, along a middle room's walls), a spike-tape X in a middle room,
 * glow tape along
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

  /** Whether (x, y) stops a cable's side: a wall, a station, a door, the outside. */
  const solid = (x: number, y: number) => {
    const t = getTile(map, x, y);
    return t !== 'floor';
  };
  /**
   * The free tiles from `start` along the edge `edge` (something solid past
   * each), up to `depth`, toward `dir` (±1 along the edge).
   */
  const hug = (start: GridPoint, edge: Side, dir: number, depth: number): GridPoint[] => {
    const { dx, dy } = OUT[edge];
    const [ax, ay] = dy !== 0 ? [dir, 0] : [0, dir];
    const run: GridPoint[] = [];
    for (let p = start; run.length < depth; p = { x: p.x + ax, y: p.y + ay }) {
      if (!free(p.x, p.y) || !solid(p.x + dx, p.y + dy)) break;
      run.push(p);
    }
    return run;
  };
  /**
   * A cable taped along `edge` through `run` (laid toward `dir`): a stage
   * box at its far end, and a cable ramp at its start when `ramp`.
   */
  const lay = (run: readonly GridPoint[], edge: Side, dir: number, ramp: boolean) => {
    run.forEach((p, i) => {
      const last = i === run.length - 1;
      const part = last
        ? dir > 0
          ? CABLE_PART.boxPlus
          : CABLE_PART.boxMinus
        : i === 0 && ramp
          ? dir > 0
            ? CABLE_PART.rampMinus
            : CABLE_PART.rampPlus
          : CABLE_PART.run;
      out[key(p.x, p.y)] = cableWear(edge, part);
    });
  };
  /** The longer of the two hugging runs from `start` (`prefer`'s way on a tie), and its way. */
  const longest = (start: GridPoint, edge: Side, depth: number, prefer: number) => {
    const a = hug(start, edge, prefer, depth);
    const b = hug(start, edge, -prefer, depth);
    return b.length > a.length ? { run: b, dir: -prefer } : { run: a, dir: prefer };
  };

  // From the stage door: out of the door and along the wall beside it, to a stage box.
  if (stageDoor) {
    const { dx, dy } = OUT[stageDoor.side];
    const along = (p: GridPoint) => (dy !== 0 ? p.x : p.y);
    const middle = dy !== 0 ? (map.width - 1) / 2 : (map.height - 1) / 2;
    let best: { run: GridPoint[]; dir: number } = { run: [], dir: 1 };
    for (const t of [...stageDoor.tiles].sort(
      (a, b) => ((tileHash(a.x, a.y) ^ salt) % 7) - ((tileHash(b.x, b.y) ^ salt) % 7),
    )) {
      const start = { x: t.x - dx, y: t.y - dy };
      const prefer = along(start) < middle ? -1 : 1;
      const found = longest(start, stageDoor.side, DOOR_CABLE, prefer);
      if (found.run.length > best.run.length) best = found;
    }
    lay(best.run, stageDoor.side, best.dir, false);
  }
  // From one console (the one nearest a side wall): along the lip toward its desk, a ramp
  // where the players cross it at the hatch.
  const console = [...consoles].sort(
    (a, b) =>
      Math.min(a.door.mid.x, map.width - 1 - a.door.mid.x) -
      Math.min(b.door.mid.x, map.width - 1 - b.door.mid.x),
  )[0];
  if (console) {
    const { door, desk } = console;
    const { dx, dy } = OUT[door.side];
    const alongX = dy !== 0;
    const mid = alongX ? door.mid.x : door.mid.y;
    const toward = desk
      ? Math.sign((alongX ? desk.x : desk.y) - mid) || 1
      : mid < (alongX ? map.width - 1 : map.height - 1) / 2
        ? -1
        : 1;
    const t = [...door.tiles].sort((a, b) =>
      alongX ? toward * (b.x - a.x) : toward * (b.y - a.y),
    )[0];
    if (t) {
      const run = hug({ x: t.x - dx, y: t.y - dy }, door.side, toward, CONSOLE_CABLE);
      lay(run, door.side, toward, run.length > 1);
    }
  }
  // A middle room between inner walls (the draft's breather): a spike-tape X on its open
  // ground and a cable taped along its walls.
  const room = middleRoom(map);
  if (room.length > 0) {
    const clear = (p: GridPoint) => {
      let d = 9;
      for (let y = p.y - 2; y <= p.y + 2; y++)
        for (let x = p.x - 2; x <= p.x + 2; x++)
          if (getTile(map, x, y) !== 'floor' || spawn.has(key(x, y)))
            d = Math.min(d, Math.max(Math.abs(x - p.x), Math.abs(y - p.y)));
      return d;
    };
    let wire: { run: GridPoint[]; dir: number; edge: Side } = { run: [], dir: 1, edge: 'left' };
    for (const p of room)
      for (const edge of ['left', 'right', 'back'] as const) {
        const found = longest(p, edge, DOOR_CABLE, 1);
        if (found.run.length > wire.run.length) wire = { ...found, edge };
      }
    if (wire.run.length >= 2) lay(wire.run, wire.edge, wire.dir, false);
    const spot = room
      .filter((p) => free(p.x, p.y))
      .sort((a, b) => clear(b) - clear(a) || a.y - b.y || a.x - b.x)[0];
    if (spot && clear(spot) >= 1) out[key(spot.x, spot.y)] = DECK_WEAR.spikeX;
  }

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
 * not over a door and clear of the truss towers.
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
    !nearDoor(doors, x, y, 0) &&
    !towers.has(key(x, y));
}

/**
 * Walls inside the outline (nothing outside the stage among their eight
 * neighbours), in runs of touching walls, each run in map order.
 */
function innerWalls(map: LevelMap): GridPoint[][] {
  const isInner = (x: number, y: number) => {
    if (getTile(map, x, y) !== 'wall') return false;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) if (outside(map, x + dx, y + dy)) return false;
    return true;
  };
  const seen = new Set<string>();
  const runs: GridPoint[][] = [];
  for (let y = 0; y < map.height; y++)
    for (let x = 0; x < map.width; x++) {
      if (!isInner(x, y) || seen.has(key(x, y))) continue;
      const run: GridPoint[] = [];
      const todo = [{ x, y }];
      seen.add(key(x, y));
      while (todo.length > 0) {
        const p = todo.pop();
        if (!p) break;
        run.push(p);
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ] as const) {
          const q = { x: p.x + dx, y: p.y + dy };
          if (isInner(q.x, q.y) && !seen.has(key(q.x, q.y))) {
            seen.add(key(q.x, q.y));
            todo.push(q);
          }
        }
      }
      runs.push(run.sort((a, b) => a.y - b.y || a.x - b.x));
    }
  return runs;
}

/**
 * The floor of a middle room: floor tiles with an inner wall the first thing
 * past them both ways along their row (`innerWalls`), in the biggest group
 * of at least four touching ones; empty on a map without one.
 */
export function middleRoom(map: LevelMap): GridPoint[] {
  const inner = new Set(innerWalls(map).flatMap((r) => r.map((p) => key(p.x, p.y))));
  const firstPast = (x: number, y: number, dx: number) => {
    let i = x + dx;
    while (getTile(map, i, y) === 'floor') i += dx;
    return inner.has(key(i, y));
  };
  const tiles = new Set<string>();
  for (let y = 0; y < map.height; y++)
    for (let x = 0; x < map.width; x++)
      if (getTile(map, x, y) === 'floor' && firstPast(x, y, -1) && firstPast(x, y, 1))
        tiles.add(key(x, y));
  const seen = new Set<string>();
  let best: GridPoint[] = [];
  for (const k of [...tiles].sort()) {
    if (seen.has(k)) continue;
    const [sx = 0, sy = 0] = k.split(',').map(Number);
    const group: GridPoint[] = [];
    const todo = [{ x: sx, y: sy }];
    seen.add(k);
    while (todo.length > 0) {
      const p = todo.pop();
      if (!p) break;
      group.push(p);
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const) {
        const q = key(p.x + dx, p.y + dy);
        if (tiles.has(q) && !seen.has(q)) {
          seen.add(q);
          todo.push({ x: p.x + dx, y: p.y + dy });
        }
      }
    }
    if (group.length > best.length) best = group;
  }
  return best.length >= 4 ? best.sort((a, b) => a.y - b.y || a.x - b.x) : [];
}

/**
 * Clusters on the outline's wall tops, the rest bare as a breather: the
 * free wall tops sorted onto the back, left and right walls; on each wall
 * up to `STAGE_CAP_CLUSTERS` anchors spread evenly along it, each with a
 * partner on the free tile beside it where there is one, the two leaning
 * together into one pile. The mirror ball (once) stands on its own on the
 * back wall's free tile nearest its right-hand corner.
 */
function capProps(
  map: LevelMap,
  doors: readonly (Doorway | null)[],
  towers: ReadonlySet<string>,
  innerRuns: readonly GridPoint[][],
): { caps: StageSetRoom['capProps']; ball: GridPoint | null } {
  const inner = new Set(innerRuns.flatMap((r) => r.map((p) => key(p.x, p.y))));
  const capOk = capFree(map, doors, towers);
  const free = (x: number, y: number) => capOk(x, y) && !inner.has(key(x, y));
  const taken = new Set<string>();
  const runs: { tiles: GridPoint[]; across: boolean }[] = [];
  const collect = (across: boolean) => {
    const [outer, len] = across ? [map.height, map.width] : [map.width, map.height];
    for (let a = 0; a < outer; a++) {
      let run: GridPoint[] = [];
      for (let b = 0; b <= len; b++) {
        const [x, y] = across ? [b, a] : [a, b];
        if (b < len && free(x, y) && !taken.has(key(x, y))) {
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
  // The mirror ball: the back wall's free tile furthest right (in its topmost row).
  const ball =
    [...walls.back].sort((a, b) => a.y - b.y || b.x - a.x).find((p) => p.y === walls.back[0]?.y) ??
    null;
  if (ball) walls.back = walls.back.filter((p) => p !== ball);
  const used = new Set<string>(ball ? [key(ball.x, ball.y)] : []);
  const out: StageSetRoom['capProps'] = [];
  let slot = 0;
  for (const wall of ['back', 'left', 'right'] as const) {
    const along = (p: GridPoint) => (wall === 'back' ? p.x * 4 + p.y : p.y * 4 + p.x);
    const tiles = walls[wall];
    const picked = spreadApart(
      tiles,
      along,
      STAGE_CAP_CLUSTERS[wall === 'back' ? 'back' : 'side'],
      CLUSTER_GAP + 1,
    );
    const order = wall === 'right' ? [...picked].reverse() : picked;
    for (const p of order) {
      used.add(key(p.x, p.y));
      const steps = wall === 'back' ? [1, -1].map((d) => [d, 0]) : [1, -1].map((d) => [0, d]);
      const partner = steps
        .map(([dx = 0, dy = 0]) => ({ x: p.x + dx, y: p.y + dy, dx, dy }))
        .find(
          (q) =>
            tiles.some((t) => t.x === q.x && t.y === q.y) &&
            !used.has(key(q.x, q.y)) &&
            !picked.some((t) => t.x === q.x && t.y === q.y),
        );
      out.push({
        x: p.x,
        y: p.y,
        slot: slot++,
        toward: partner ? { dx: partner.dx, dy: partner.dy } : { dx: 0, dy: 0 },
      });
      if (partner) {
        used.add(key(partner.x, partner.y));
        out.push({
          x: partner.x,
          y: partner.y,
          slot: slot++,
          toward: { dx: -partner.dx, dy: -partner.dy },
        });
      }
    }
  }
  return { caps: out, ball: ball ? { x: ball.x, y: ball.y } : null };
}

/**
 * One cluster per run of inner walls: on the top of its middle full wall
 * with nothing open behind (a cluster as on the outline's walls), else
 * lying flat on its middle low wall.
 */
function innerProps(
  map: LevelMap,
  doors: readonly (Doorway | null)[],
  towers: ReadonlySet<string>,
  runs: readonly GridPoint[][],
): StageSetRoom['innerProps'] {
  const capOk = capFree(map, doors, towers);
  // How many walls stand behind (x, y) before open floor: a cluster there hides only walls.
  const depth = (p: GridPoint) => {
    let d = 0;
    while (getTile(map, p.x, p.y - d - 1) === 'wall') d++;
    return d;
  };
  const middle = (ps: readonly GridPoint[]) => ps[Math.floor((ps.length - 1) / 2)];
  const out: StageSetRoom['innerProps'] = [];
  runs.forEach((run) => {
    const tall = run
      .filter((p) => capOk(p.x, p.y))
      .sort((a, b) => depth(b) - depth(a) || a.y - b.y || a.x - b.x)[0];
    const low = run.filter(
      (p) => wallPiece(map, p.x, p.y) === 'wall-front' && !nearDoor(doors, p.x, p.y, 0),
    );
    if (tall) out.push({ x: tall.x, y: tall.y, tall: true, slot: out.length });
    // A flat one on a long low stretch too, or on the run when it has no full wall.
    const flat = middle(low);
    if (flat && (!tall || low.length >= 3))
      out.push({ x: flat.x, y: flat.y, tall: false, slot: out.length });
  });
  return out;
}

/** The inner wall whose face the set list is taped to: the first showing its face, floor in front. */
function innerSetList(map: LevelMap, runs: readonly GridPoint[][]): GridPoint | null {
  for (const run of runs)
    for (const p of run)
      if (wallPiece(map, p.x, p.y) === 'wall' && getTile(map, p.x, p.y + 1) === 'floor') return p;
  return null;
}

/** How many tiles apart (either way) clusters stand at least. */
const CLUSTER_GAP = 2;

/** Up to `n` of `tiles`, each nearest an even mark along the wall, at least `gap` apart. */
function spreadApart(
  tiles: readonly GridPoint[],
  along: (p: GridPoint) => number,
  n: number,
  gap = CLUSTER_GAP,
): GridPoint[] {
  if (tiles.length === 0) return [];
  const sorted = [...tiles].sort((a, b) => along(a) - along(b));
  const picked: GridPoint[] = [];
  for (let i = 0; i < n; i++) {
    const mark = ((i + 0.5) * sorted.length) / n - 0.5;
    let best: { p: GridPoint; d: number } | null = null;
    sorted.forEach((p, k) => {
      if (picked.some((q) => Math.max(Math.abs(q.x - p.x), Math.abs(q.y - p.y)) < gap)) return;
      const d = Math.abs(k - mark);
      if (!best || d < best.d - 1e-9) best = { p, d };
    });
    const found = best as { p: GridPoint; d: number } | null;
    if (found) picked.push(found.p);
  }
  return picked.sort((a, b) => along(a) - along(b));
}

/**
 * The low clusters on the outer front walls (low front wall pieces with the
 * outside in front of them), never on a door or a console's desk: a stage
 * monitor wedge on the outermost free tile at each end, and between them
 * up to `STAGE_CAP_CLUSTERS.front` low clusters spread along the lip.
 */
function frontProps(
  map: LevelMap,
  doors: readonly (Doorway | null)[],
  desks: ReadonlySet<string>,
): { props: StageSetRoom['frontProps']; wedges: GridPoint[] } {
  const free: GridPoint[] = [];
  for (let y = 0; y < map.height; y++)
    for (let x = 1; x < map.width - 1; x++)
      if (
        getTile(map, x, y) === 'wall' &&
        wallPiece(map, x, y) === 'wall-front' &&
        isOpen(map, x, y - 1) &&
        outside(map, x, y + 1) &&
        !nearDoor(doors, x, y, 0) &&
        !desks.has(key(x, y))
      )
        free.push({ x, y });
  const sorted = [...free].sort((a, b) => a.x - b.x || a.y - b.y);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const wedges = first && last ? (first === last ? [first] : [first, last]) : [];
  const rest = sorted.filter((p) => !wedges.includes(p));
  const props = spreadApart(rest, (p) => p.x * 100 + p.y, STAGE_CAP_CLUSTERS.front, 1)
    .sort((a, b) => a.x - b.x)
    .map((p, slot) => ({ ...p, slot }));
  return { props, wedges };
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
