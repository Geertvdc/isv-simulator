/**
 * Where On Call's basement story pieces go (the `basement` wall theme): the
 * fire door with the pager board round the inbox, the uplink's patch frame
 * at the ship hatches, the server room's walls built as a server cage, what
 * hangs on the walls (the incident runbook, the server room sign, the fire
 * exit, the breaker box, the thermostat, the do-not-unplug note), the
 * cable tray strung along the back wall for the fluorescent battens, the
 * placed wear on the raised floor (vent tiles along the server room, a
 * lifted tile with its cables, scuffs) and the clusters on the wall tops
 * (with Segfault on the warmest server and the YOTTA rack). Placed from the
 * map's own tiles, never at fixed coordinates, so it fits any map. No
 * three.js here, so it can be tested.
 */

import { type GridPoint, type LevelMap, getTile } from '../../../sim/level';
import type { Vec3 } from '../../projection';
import { levelSalt, tileHash, wallPiece } from '../../mapShape';
import { WALL_HEIGHT, tilesOf } from '../layout';
import { type Doorway, type Side, findDoorways } from './stageSetRoom';

export type { Doorway, Side };

/** Wear on a raised-floor tile (see `floorWear`), one per tile; `roomModels/basement` draws them. */
export const RAISED_WEAR = {
  none: 0,
  /** Perforated vent tiles along one edge: `vent + edge` (see `VENT_EDGES`). */
  vent: 1,
  /** A lifted tile in one corner, cables showing in the void: `lifted + corner` (see `CORNERS`). */
  lifted: 5,
  /** Rubber-sole scuffs, a short trail. */
  scuffs: 9,
  /** Snipped cable ties and a taped cable along one edge, toward a wall: `ties + edge`. */
  ties: 10,
} as const;
/** How many wear kinds there are. */
export const RAISED_WEAR_KINDS = RAISED_WEAR.ties + 4;

/** The edges a vent or a tape run hugs, in the order its kind counts them. */
export const VENT_EDGES: readonly Side[] = ['back', 'front', 'left', 'right'];
/** The half-tile corners a lifted tile can be in: back-left, back-right, front-left, front-right. */
export const CORNERS = 4;

export const ventWear = (edge: Side) => RAISED_WEAR.vent + VENT_EDGES.indexOf(edge);
export const tiesWear = (edge: Side) => RAISED_WEAR.ties + VENT_EDGES.indexOf(edge);

/** What hangs on the basement's walls (each on one tile's face). */
export type BasementArt =
  'runbook' | 'authorised' | 'fireExit' | 'breaker' | 'thermostat' | 'unplug';
/** How far each piece reaches either side of its tile's middle (`roomModels/basement` builds to it). */
export const BASEMENT_ART_HALF: Readonly<Record<BasementArt, number>> = {
  runbook: 0.44,
  authorised: 0.3,
  fireExit: 0.17,
  breaker: 0.22,
  thermostat: 0.24,
  unplug: 0.3,
};

export interface BasementArtSpot {
  x: number;
  y: number;
  art: BasementArt;
}

/** The uplink at a ship hatch, and the low wall tile beside it its patch frame stands on (if any). */
export interface Uplink {
  door: Doorway;
  frame: GridPoint | null;
}

/**
 * The cable tray along a back wall, carrying the fluorescent battens: in
 * the row `z` (just in front of the back wall's face), at height `y`, from
 * `x0` to `x1` (the room's inner faces), on uprights standing on the back
 * wall's cap (`posts`, wall tiles of that row).
 */
export interface Tray {
  z: number;
  y: number;
  x0: number;
  x1: number;
  /** The back wall's row. */
  back: number;
  posts: GridPoint[];
}

export interface BasementRoom {
  /** The inbox framed as the propped-open fire door with the pager board over it. */
  pagerDoor: Doorway | null;
  /**
   * Which way along the door model's x its leaf is propped open flat-ish
   * against the wall beside it (±1), or 0 where neither side has a wall
   * face to take it.
   */
  pagerLeaf: number;
  /** Each ship hatch framed as the uplink. */
  uplinks: Uplink[];
  /** Always empty: the basement's pieces are placed as story pieces (`wallArt`). */
  decos: Record<string, string>;
  wallArt: BasementArtSpot[];
  /** Wear on the raised floor (a `RAISED_WEAR`), keyed `x,y`; bare tiles left out. */
  floorWear: Record<string, number>;
  /** Clusters on the outline's wall tops (see `RoomPlan.capProps`). */
  capProps: { x: number; y: number; slot: number; toward: { dx: number; dy: number } }[];
  /** Low clusters lying on the front wall (see `RoomPlan.frontProps`). */
  frontProps: { x: number; y: number; slot: number }[];
  /** The server room's full walls built as the server cage (see `RoomPlan.swaps`). */
  swaps: Record<string, string>;
  /** One cluster per run of the server room's walls: on a full wall's top, or flat on a low one. */
  innerProps: { x: number; y: number; tall: boolean; slot: number }[];
  /** The wall top the warmest server stands on, Segfault asleep on it. */
  segfault: GridPoint | null;
  /** The wall top the rack with YOTTA's sticker stands on. */
  yotta: GridPoint | null;
  /** The one small energy-drink can pyramid, beside a cluster. */
  cans: GridPoint | null;
  /** The cable trays along the back walls. */
  trays: Tray[];
}

/** The cage swaps: one per wall piece and look. */
export const CAGE_LOOKS = 3;
export const cageSwap = (piece: string, look: number) => `cage:${piece}:${look}`;

/** The tray's height (well over the wall-top clusters) and how far in front of the back wall's middle it runs. */
export const TRAY_Y = WALL_HEIGHT + 0.66;
export const TRAY_FORWARD = 0.62;
/** How far under the tray a batten hangs (its top), and its half length (with a margin). */
export const BATTEN_DROP = 0.14;
export const BATTEN_HALF = 0.36;

/** Cluster anchors per wall at most: along the back, on each side wall, on the low front wall. */
export const BASEMENT_CAP_CLUSTERS = { back: 4, side: 3, front: 3 } as const;
/** Vent tiles at most. */
const VENTS_MAX = 10;
const SCUFFS_MAX = 2;

const OUT: Readonly<Record<Side, { dx: number; dy: number }>> = {
  back: { dx: 0, dy: -1 },
  front: { dx: 0, dy: 1 },
  left: { dx: -1, dy: 0 },
  right: { dx: 1, dy: 0 },
};

const key = (x: number, y: number) => `${x},${y}`;
const cheb = (a: GridPoint, b: GridPoint) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

export function basementRoom(map: LevelMap): BasementRoom {
  const pagerDoor = findDoorways(map, 'inbox')[0] ?? null;
  const uplinks = findDoorways(map, 'ship').map((door) => ({
    door,
    frame: uplinkFrame(map, door),
  }));
  const doors = [pagerDoor, ...uplinks.map((u) => u.door)];
  const frames = new Set(uplinks.flatMap((u) => (u.frame ? [key(u.frame.x, u.frame.y)] : [])));
  const innerRuns = innerWalls(map);
  const inner = new Set(innerRuns.flatMap((r) => r.map((p) => key(p.x, p.y))));
  const trays = placeTrays(map);
  const posts = new Set(trays.flatMap((t) => t.posts.map((p) => key(p.x, p.y))));
  const caps = capProps(map, doors, pagerDoor, posts, inner);
  const innerTops = innerPlan(map, innerRuns, doors);
  return {
    pagerDoor,
    pagerLeaf: pagerDoor ? leafSide(map, pagerDoor) : 0,
    uplinks,
    decos: {},
    wallArt: placeWallArt(map, doors, inner),
    floorWear: floorWear(map, pagerDoor, inner),
    capProps: caps.props,
    frontProps: frontProps(map, doors, frames),
    swaps: cageSwaps(map, inner),
    innerProps: innerTops.props,
    segfault: innerTops.segfault,
    yotta: innerTops.yotta,
    cans: caps.cans,
    trays,
  };
}

/** The map step the door model's +x runs along once turned to face out on `side`. */
const MODEL_X: Readonly<Record<Side, { dx: number; dy: number }>> = {
  back: { dx: 1, dy: 0 },
  front: { dx: -1, dy: 0 },
  left: { dx: 0, dy: -1 },
  right: { dx: 0, dy: 1 },
};

/**
 * The side (±1 along the door model's x) whose neighbouring wall takes the
 * propped-open leaf: a full wall right past the door's end, with floor in
 * front of it on the room side. The +x side first.
 */
function leafSide(map: LevelMap, door: Doorway): number {
  const { dx, dy } = MODEL_X[door.side];
  const into = OUT[door.side];
  for (const s of [1, -1]) {
    const end = [...door.tiles].sort((a, b) => s * ((b.x - a.x) * dx + (b.y - a.y) * dy))[0];
    if (!end) continue;
    const n = { x: end.x + dx * s, y: end.y + dy * s };
    if (getTile(map, n.x, n.y) !== 'wall' || wallPiece(map, n.x, n.y) === 'wall-front') continue;
    if (getTile(map, n.x - into.dx, n.y - into.dy) === 'floor') return s;
  }
  return 0;
}

/** Whether (x, y) is open ground (not wall, not outside). */
function isOpen(map: LevelMap, x: number, y: number): boolean {
  const t = getTile(map, x, y);
  return t !== null && t !== 'wall' && t !== 'void';
}

/** Whether (x, y) is off the map or void: outside the room. */
function outside(map: LevelMap, x: number, y: number): boolean {
  const t = getTile(map, x, y);
  return t === null || t === 'void';
}

/** Whether (x, y) is within `reach` tiles of a door's tiles. */
function nearDoor(
  doors: readonly (Doorway | null)[],
  x: number,
  y: number,
  reach: number,
): boolean {
  return doors.some((d) => d?.tiles.some((t) => cheb(t, { x, y }) <= reach));
}

/**
 * The low front wall tile beside a hatch on the front edge where the patch
 * frame stands: on the side toward the map's nearer side wall (so the
 * middle of the front stays clear), else the other side.
 */
function uplinkFrame(map: LevelMap, door: Doorway): GridPoint | null {
  if (door.side !== 'front') return null;
  const xs = door.tiles.map((t) => t.x);
  const y = door.mid.y;
  const lo = { x: Math.min(...xs) - 1, y };
  const hi = { x: Math.max(...xs) + 1, y };
  const ok = (p: GridPoint) =>
    getTile(map, p.x, p.y) === 'wall' &&
    wallPiece(map, p.x, p.y) === 'wall-front' &&
    outside(map, p.x, p.y + 1);
  const outer = door.mid.x < (map.width - 1) / 2 ? [lo, hi] : [hi, lo];
  return outer.find(ok) ?? null;
}

/**
 * Walls inside the outline (nothing outside the room among their eight
 * neighbours): the server room's walls, in runs of touching walls, each
 * run in map order.
 */
export function innerWalls(map: LevelMap): GridPoint[][] {
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

/** The server room's full walls (not the low ones the players look over), built as the cage. */
function cageSwaps(map: LevelMap, inner: ReadonlySet<string>): Record<string, string> {
  const out: Record<string, string> = {};
  const salt = levelSalt(map);
  for (const k of [...inner].sort()) {
    const [x = 0, y = 0] = k.split(',').map(Number);
    const piece = wallPiece(map, x, y);
    if (piece === 'wall-front') continue;
    out[k] = cageSwap(piece, ((tileHash(x + 11, y + 3) ^ salt) >>> 4) % CAGE_LOOKS);
  }
  return out;
}

/**
 * What hangs on the walls, on wall faces with floor in front (and nothing
 * open behind), clear of the doors: the runbook on the back wall nearest
 * the middle with the thermostat beside it, the server room sign on the
 * server room's own wall (else the back wall), the fire exit as far into a
 * corner as there is, the breaker box at the other end with the
 * do-not-unplug note beside it (on the server cage if there is a second
 * face, else beside the breaker).
 */
function placeWallArt(
  map: LevelMap,
  doors: readonly (Doorway | null)[],
  inner: ReadonlySet<string>,
): BasementArtSpot[] {
  const face = (x: number, y: number) =>
    getTile(map, x, y) === 'wall' &&
    wallPiece(map, x, y) === 'wall' &&
    !isOpen(map, x, y - 1) &&
    getTile(map, x, y + 1) === 'floor' &&
    !nearDoor(doors, x, y, 1);
  const midX = (map.width - 1) / 2;
  const out: BasementArtSpot[] = [];
  const used = new Set<string>();
  const all: GridPoint[] = [];
  for (let y = 0; y < map.height; y++)
    for (let x = 0; x < map.width; x++) if (face(x, y)) all.push({ x, y });
  const outer = all.filter((p) => !inner.has(key(p.x, p.y)));
  const cage = all.filter((p) => inner.has(key(p.x, p.y)));
  // Back walls first: the topmost row of each column counts, a row lower costs.
  const take = (art: BasementArt, from: readonly GridPoint[], score: (p: GridPoint) => number) => {
    const p = from
      .filter((q) => !used.has(key(q.x, q.y)))
      .filter((q) => out.every((a) => a.y !== q.y || Math.abs(a.x - q.x) >= 1))
      .sort((a, b) => score(a) - score(b) || a.y - b.y || a.x - b.x)[0];
    if (!p) return null;
    used.add(key(p.x, p.y));
    out.push({ x: p.x, y: p.y, art });
    return p;
  };
  const row = (p: GridPoint) => p.y * 3;
  const runbook = take('runbook', outer, (p) => Math.abs(p.x - midX) + row(p));
  if (runbook)
    take('thermostat', outer, (p) =>
      p.y !== runbook.y ? 99 + row(p) : Math.abs(Math.abs(p.x - runbook.x) - 1),
    );
  const sign = cage.length > 0 ? cage : outer;
  take('authorised', sign, (p) => Math.abs(p.x - midX) + row(p));
  const exit = take('fireExit', outer, (p) => -Math.abs(p.x - midX) + row(p));
  const away = (p: GridPoint) => (exit ? -Math.abs(p.x - exit.x) : 0);
  const breaker = take('breaker', outer, (p) => away(p) + row(p));
  const onCage = cage.filter((p) => !used.has(key(p.x, p.y)));
  if (onCage.length > 0) take('unplug', onCage, (p) => -Math.abs(p.x - midX) + row(p));
  else if (breaker)
    take('unplug', outer, (p) =>
      p.y !== breaker.y ? 99 : Math.abs(Math.abs(p.x - breaker.x) - 1),
    );
  return out.sort((a, b) => a.y - b.y || a.x - b.x);
}

/**
 * Wear on the raised floor, placed: perforated vent tiles along the server
 * room's walls (every second tile), one lifted tile with its cables out by
 * an outer wall well away from the spawns with cable ties beside it, a
 * short scuff trail in from the fire door and scuffs in front of the
 * keyboards. Never on a spawn.
 */
function floorWear(
  map: LevelMap,
  pagerDoor: Doorway | null,
  inner: ReadonlySet<string>,
): Record<string, number> {
  const salt = levelSalt(map);
  const out: Record<string, number> = {};
  const spawn = new Set(map.spawns.map((p) => key(p.x, p.y)));
  const free = (x: number, y: number) =>
    getTile(map, x, y) === 'floor' && out[key(x, y)] === undefined && !spawn.has(key(x, y));
  const nearSpawn = (x: number, y: number, reach: number) =>
    map.spawns.some((s) => cheb(s, { x, y }) <= reach);

  // Vents: floor beside the server room's walls, every second tile, the edge toward the wall.
  const vents: { x: number; y: number; edge: Side; h: number }[] = [];
  for (let y = 0; y < map.height; y++)
    for (let x = 0; x < map.width; x++) {
      if (!free(x, y) || (x + y + salt) % 2 !== 0) continue;
      for (const edge of VENT_EDGES) {
        const { dx, dy } = OUT[edge];
        if (!inner.has(key(x + dx, y + dy))) continue;
        vents.push({ x, y, edge, h: (tileHash(x + 3, y + 17) ^ salt) % 1009 });
        break;
      }
    }
  vents.sort((a, b) => a.h - b.h);
  for (const v of vents.slice(0, VENTS_MAX)) out[key(v.x, v.y)] = ventWear(v.edge);

  // The lifted tile: floor along an outer wall (back, left or right), two tiles from every spawn
  // and the doors, its corner toward the wall; cable ties beside it along the wall.
  const lifts: { x: number; y: number; edge: Side; h: number }[] = [];
  for (let y = 0; y < map.height; y++)
    for (let x = 0; x < map.width; x++) {
      if (!free(x, y) || nearSpawn(x, y, 2) || (pagerDoor && nearDoor([pagerDoor], x, y, 2)))
        continue;
      for (const edge of ['back', 'left', 'right'] as const) {
        const { dx, dy } = OUT[edge];
        const t = getTile(map, x + dx, y + dy);
        if (t !== 'wall' || inner.has(key(x + dx, y + dy))) continue;
        lifts.push({ x, y, edge, h: (tileHash(x + 29, y + 5) ^ salt) % 997 });
        break;
      }
    }
  lifts.sort((a, b) => a.h - b.h);
  const lift = lifts[0];
  if (lift) {
    const corner = liftCorner(lift.edge, lift.h);
    out[key(lift.x, lift.y)] = RAISED_WEAR.lifted + corner;
    // Ties along the wall beside it (the first free neighbour along the wall).
    const [ax, ay] = lift.edge === 'back' ? [1, 0] : [0, 1];
    for (const s of [1, -1]) {
      const q = { x: lift.x + ax * s, y: lift.y + ay * s };
      const { dx, dy } = OUT[lift.edge];
      if (free(q.x, q.y) && getTile(map, q.x + dx, q.y + dy) === 'wall') {
        out[key(q.x, q.y)] = tiesWear(lift.edge);
        break;
      }
    }
  }

  // A short scuff trail in from the fire door: where the pager sends everyone running.
  if (pagerDoor) {
    const { dx, dy } = OUT[pagerDoor.side];
    let trail = 0;
    for (const t of pagerDoor.tiles)
      for (let d = 1; d <= 2 && trail < 2; d++) {
        const p = { x: t.x - dx * d, y: t.y - dy * d };
        if (getTile(map, p.x, p.y) !== 'floor') break;
        if (!free(p.x, p.y)) continue;
        out[key(p.x, p.y)] = RAISED_WEAR.scuffs;
        trail++;
      }
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
      if (scuffs.some((s) => cheb(s, p) < 3)) continue;
      scuffs.push(p);
      out[key(p.x, p.y)] = RAISED_WEAR.scuffs;
      break;
    }
  }
  return out;
}

/** The corner of a lifted tile beside a wall on `edge` (one of the two along it, by `h`). */
function liftCorner(edge: Side, h: number): number {
  const pick = h % 2;
  // Corners: 0 back-left, 1 back-right, 2 front-left, 3 front-right.
  if (edge === 'back') return pick;
  if (edge === 'left') return pick ? 2 : 0;
  return pick ? 3 : 1;
}

/**
 * Wall-top tiles that can carry a cluster: full walls with nothing open
 * behind them (it'd hide someone standing there), not a door, not a tray
 * upright, and clear of the pager board over the fire door.
 */
function capFree(
  map: LevelMap,
  doors: readonly (Doorway | null)[],
  pager: Doorway | null,
  posts: ReadonlySet<string>,
): (x: number, y: number) => boolean {
  return (x, y) =>
    getTile(map, x, y) === 'wall' &&
    wallPiece(map, x, y) !== 'wall-front' &&
    !isOpen(map, x, y - 1) &&
    !nearDoor(doors, x, y, 0) &&
    !(pager && nearDoor([pager], x, y, 1)) &&
    !posts.has(key(x, y));
}

/** Up to `n` of `tiles`, each nearest an even mark along the wall, at least `gap` apart. */
function spreadApart(
  tiles: readonly GridPoint[],
  along: (p: GridPoint) => number,
  n: number,
  gap: number,
): GridPoint[] {
  if (tiles.length === 0) return [];
  const sorted = [...tiles].sort((a, b) => along(a) - along(b));
  const picked: GridPoint[] = [];
  for (let i = 0; i < n; i++) {
    const mark = ((i + 0.5) * sorted.length) / n - 0.5;
    let best: { p: GridPoint; d: number } | null = null;
    sorted.forEach((p, k) => {
      if (picked.some((q) => cheb(q, p) < gap)) return;
      const d = Math.abs(k - mark);
      if (!best || d < best.d - 1e-9) best = { p, d };
    });
    const found = best as { p: GridPoint; d: number } | null;
    if (found) picked.push(found.p);
  }
  return picked.sort((a, b) => along(a) - along(b));
}

/**
 * Clusters on the outline's wall tops, the rest bare as a breather: the
 * free wall tops sorted onto the back, left and right walls; on each up to
 * `BASEMENT_CAP_CLUSTERS` anchors spread along it, each with a partner on
 * the free tile beside it where there is one, the two leaning together into
 * one pile. The can pyramid (once) on a free back-wall tile beside a pile.
 */
function capProps(
  map: LevelMap,
  doors: readonly (Doorway | null)[],
  pager: Doorway | null,
  posts: ReadonlySet<string>,
  inner: ReadonlySet<string>,
): { props: BasementRoom['capProps']; cans: GridPoint | null } {
  const capOk = capFree(map, doors, pager, posts);
  const free = (x: number, y: number) => capOk(x, y) && !inner.has(key(x, y));
  const walls: Record<'back' | 'left' | 'right', GridPoint[]> = { back: [], left: [], right: [] };
  for (let y = 0; y < map.height; y++)
    for (let x = 0; x < map.width; x++) {
      if (!free(x, y)) continue;
      // A back wall: floor (or a station) just in front, the outside behind.
      const back =
        outside(map, x, y - 1) && !outside(map, x, y + 1) && getTile(map, x, y + 1) !== 'wall';
      const wall = back ? 'back' : x < map.width / 2 ? 'left' : 'right';
      walls[wall].push({ x, y });
    }
  const used = new Set<string>();
  const out: BasementRoom['capProps'] = [];
  let slot = 0;
  for (const wall of ['back', 'left', 'right'] as const) {
    const along = (p: GridPoint) => (wall === 'back' ? p.x * 4 + p.y : p.y * 4 + p.x);
    const tiles = walls[wall];
    const n = BASEMENT_CAP_CLUSTERS[wall === 'back' ? 'back' : 'side'];
    const picked = spreadApart(tiles, along, n, 3);
    for (const p of picked) {
      used.add(key(p.x, p.y));
      const steps =
        wall === 'back'
          ? [
              [1, 0],
              [-1, 0],
            ]
          : [
              [0, 1],
              [0, -1],
            ];
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
  // The can pyramid: a free back-wall tile right beside a pile, nearest the middle.
  const midX = (map.width - 1) / 2;
  const cans =
    [...walls.back, ...walls.left, ...walls.right]
      .filter((p) => !used.has(key(p.x, p.y)))
      .filter((p) => out.some((q) => cheb(q, p) === 1))
      .sort(
        (a, b) =>
          (walls.back.includes(a) ? 0 : 50) - (walls.back.includes(b) ? 0 : 50) ||
          Math.abs(a.x - midX) - Math.abs(b.x - midX) ||
          a.y - b.y,
      )[0] ?? null;
  return { props: out, cans: cans ? { x: cans.x, y: cans.y } : null };
}

/**
 * On the server room's walls: Segfault's warm server on the full wall top
 * furthest from every spawn (the most walls behind it on a tie), the YOTTA
 * rack on the full wall top furthest from the cat, and one more cluster on
 * each run's full walls (else lying flat on its middle low wall), well
 * apart from both.
 */
function innerPlan(
  map: LevelMap,
  runs: readonly GridPoint[][],
  doors: readonly (Doorway | null)[],
): { props: BasementRoom['innerProps']; segfault: GridPoint | null; yotta: GridPoint | null } {
  const capOk = (p: GridPoint) =>
    wallPiece(map, p.x, p.y) !== 'wall-front' &&
    !isOpen(map, p.x, p.y - 1) &&
    !nearDoor(doors, p.x, p.y, 0);
  const depth = (p: GridPoint) => {
    let d = 0;
    while (getTile(map, p.x, p.y - d - 1) === 'wall') d++;
    return d;
  };
  const spawnGap = (p: GridPoint) => Math.min(99, ...map.spawns.map((s) => cheb(s, p)));
  const tall = runs.flat().filter(capOk);
  const segfault =
    [...tall].sort(
      (a, b) => spawnGap(b) - spawnGap(a) || depth(b) - depth(a) || a.y - b.y || a.x - b.x,
    )[0] ?? null;
  const yotta = segfault
    ? ([...tall]
        .filter((p) => p !== segfault)
        .sort(
          (a, b) =>
            cheb(b, segfault) - cheb(a, segfault) || depth(b) - depth(a) || a.y - b.y || a.x - b.x,
        )[0] ?? null)
    : null;
  const taken = [segfault, yotta].filter((p): p is GridPoint => p !== null);
  const props: BasementRoom['innerProps'] = [];
  for (const run of runs) {
    const full = run
      .filter(capOk)
      .filter((p) => taken.every((t) => cheb(t, p) >= 2))
      .sort((a, b) => depth(b) - depth(a) || a.y - b.y || a.x - b.x)[0];
    if (full) {
      taken.push(full);
      props.push({ x: full.x, y: full.y, tall: true, slot: props.length });
    }
    const low = run.filter(
      (p) => wallPiece(map, p.x, p.y) === 'wall-front' && !nearDoor(doors, p.x, p.y, 0),
    );
    const flat = low[Math.floor((low.length - 1) / 2)];
    if (flat && low.length >= 3)
      props.push({ x: flat.x, y: flat.y, tall: false, slot: props.length });
  }
  return {
    props,
    segfault: segfault ? { x: segfault.x, y: segfault.y } : null,
    yotta: yotta ? { x: yotta.x, y: yotta.y } : null,
  };
}

/**
 * The low clusters on the outer front walls (low front wall pieces with the
 * outside in front), never on a door or a patch frame: up to
 * `BASEMENT_CAP_CLUSTERS.front`, spread along it.
 */
function frontProps(
  map: LevelMap,
  doors: readonly (Doorway | null)[],
  frames: ReadonlySet<string>,
): BasementRoom['frontProps'] {
  const free: GridPoint[] = [];
  for (let y = 0; y < map.height; y++)
    for (let x = 1; x < map.width - 1; x++)
      if (
        getTile(map, x, y) === 'wall' &&
        wallPiece(map, x, y) === 'wall-front' &&
        isOpen(map, x, y - 1) &&
        outside(map, x, y + 1) &&
        !nearDoor(doors, x, y, 1) &&
        !frames.has(key(x, y))
      )
        free.push({ x, y });
  return spreadApart(free, (p) => p.x * 100 + p.y, BASEMENT_CAP_CLUSTERS.front, 2)
    .sort((a, b) => a.x - b.x)
    .map((p, slot) => ({ ...p, slot }));
}

/**
 * The runs of the room along its back walls, as the lamps see them (see
 * `lampSpots`): per column the first open row from row 1 within the top
 * 30% of the map, runs of neighbouring columns sharing it, at least three
 * long.
 */
function backRuns(map: LevelMap): { inside: number; x0: number; x1: number }[] {
  const deepest = Math.max(1, Math.floor(map.height * 0.3));
  const runs: { inside: number; x0: number; x1: number }[] = [];
  for (let x = 0; x < map.width; x++) {
    let top: number | null = null;
    for (let y = 1; y <= deepest && top === null; y++) if (isOpen(map, x, y)) top = y;
    if (top === null) continue;
    const last = runs[runs.length - 1];
    if (last && last.inside === top && last.x1 === x - 1) last.x1 = x;
    else runs.push({ inside: top, x0: x, x1: x });
  }
  return runs.filter((r) => r.x1 - r.x0 + 1 >= 3);
}

/**
 * The cable trays: one per run of the room along a back wall, from its
 * inner face at one end to the other, just in front of the back wall,
 * high over the wall-top clusters; on uprights standing on the back wall's
 * cap: the wall tiles nearest each end, and one in the middle of a long run.
 */
function placeTrays(map: LevelMap): Tray[] {
  const out: Tray[] = [];
  for (const run of backRuns(map)) {
    const back = run.inside - 1;
    const walls: number[] = [];
    for (let x = run.x0 - 1; x <= run.x1 + 1; x++)
      if (getTile(map, x, back) === 'wall' && !isOpen(map, x, back - 1)) walls.push(x);
    if (walls.length === 0) continue;
    const first = walls[0] ?? 0;
    const last = walls[walls.length - 1] ?? 0;
    const xs = new Set([first, last]);
    const span = run.x1 - run.x0 + 1;
    if (span >= 8) {
      const mid = (run.x0 + run.x1) / 2;
      const m = [...walls].sort((a, b) => Math.abs(a - mid) - Math.abs(b - mid))[0];
      if (m !== undefined && Math.abs(m - first) >= 3 && Math.abs(last - m) >= 3) xs.add(m);
    }
    out.push({
      z: back + TRAY_FORWARD,
      y: TRAY_Y,
      x0: Math.min(run.x0, first) - 0.5,
      x1: Math.max(run.x1, last) + 0.5,
      back,
      posts: [...xs].sort((a, b) => a - b).map((x) => ({ x, y: back })),
    });
  }
  return out;
}

/** How far a batten slides along its tray at most to clear a station behind it. */
const BATTEN_SHIFT_MAX = 1.5;
const BATTEN_SHIFT_STEP = 0.25;

/**
 * The batten for the lamp spot `at` (see `RoomDressing.lamp.fit`): hung
 * under the cable tray over its run of the back wall, slid along it clear
 * of the stations in the back wall's row (it'd hide them on screen) and
 * inside the tray, or left out (the light stays at the spot).
 */
export function battenFit(at: Vec3, map: LevelMap): Vec3 | null {
  const inside = Math.floor(at.z + 0.5);
  const back = inside - 1;
  const tray = placeTrays(map).find((t) => t.back === back && at.x > t.x0 && at.x < t.x1);
  if (!tray) return null;
  const blocked: number[] = [];
  for (let x = 0; x < map.width; x++) {
    const t = getTile(map, x, back);
    if (t !== null && t !== 'wall' && t !== 'void' && t !== 'floor') blocked.push(x);
  }
  const ok = (x: number) =>
    x - BATTEN_HALF >= tray.x0 + 0.1 &&
    x + BATTEN_HALF <= tray.x1 - 0.1 &&
    blocked.every((bx) => Math.abs(bx - x) >= 0.5 + BATTEN_HALF - 0.15) &&
    tray.posts.every((p) => Math.abs(p.x - x) >= BATTEN_HALF + 0.08);
  for (let d = 0; d <= BATTEN_SHIFT_MAX + 1e-9; d += BATTEN_SHIFT_STEP)
    for (const x of d === 0 ? [at.x] : [at.x - d, at.x + d])
      if (ok(x)) return { x, y: tray.y - BATTEN_DROP, z: tray.z };
  return null;
}
