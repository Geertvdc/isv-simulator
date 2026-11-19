/**
 * Where Hot Desking's story pieces go (the `upperFloors` wall theme): three
 * floors of the mid-rise from 3-1 and 3-2 as a cutaway round one lift, a
 * few months after the move-in, full, and nobody owns a desk. The map's
 * open ground splits into islands, each the floor of the lift stop on it
 * (stops run top first: the last is the hot-desk floor at street level, the
 * one before it the test lab, the first the meeting room). From that: worn
 * carpet with a grey walkway from the lift to the revolving door and faint
 * coffee rings by the hot desks, pale vinyl in the test lab, a quieter
 * carpet in the meeting room; the taped-off stairwell door beside the
 * hot-desk floor's lift, the floor directories by each lift, the plan as a
 * desk-booking spreadsheet, the booking kiosk saying SYSTEM DOWN, the clock,
 * the lab's whiteboard of bug repros, the meeting room's screen and its
 * always-red BOOKED panel; banks of lockers on the hot-desk floor's wall
 * tops (Segfault asleep in an open one), device shelves on the lab's, the
 * one Friday cake on the meeting room's; the front desk at the inbox, the
 * revolving door at the ship, the BUGS in-tray rack at the bug queue; and
 * the linear pendants along the back of each room. Placed from the map's
 * own tiles, never at fixed coordinates. No three.js here, so it can be
 * tested.
 */

import { type GridPoint, type LevelMap, getTile } from '../../../sim/level';
import { createLifts } from '../../../sim/lifts';
import type { Vec3 } from '../../projection';
import { levelSalt, tileHash, wallPiece } from '../../mapShape';
import { FRONT_WALL_HEIGHT } from '../layout';
import {
  type HeadTrack,
  PENDANT_FORWARD,
  PENDANT_HALF,
  PENDANT_Y,
  PLUSH_EDGES,
  SOLID_LOOKS,
  solidSwap,
} from './midRiseRoom';
import { type Doorway, type Side, findDoorways } from './stageSetRoom';

export type { Doorway, Side };

/** Which floor of the building an open tile is on. */
export type Zone = 'hotDesk' | 'lab' | 'meeting';

/** Each zone's floor number in the building (the street is 0). */
export const ZONE_FLOOR: Readonly<Record<Zone, number>> = { hotDesk: 0, lab: 1, meeting: 2 };

/**
 * Wear on a floor tile (see `floorWear`), one number: the hot-desk floor's
 * kinds first, then the lab's vinyl, then the meeting room's carpet.
 */
export const FLOOR_WEAR = {
  /** The hot-desk floor's worn carpet tiles. */
  carpet: 0,
  /** The grey walkway from the lift to the revolving door. */
  walkway: 1,
  /** A faint coffee ring: `coffee + corner`, corner 0 back-left, 1 back-right, 2 front-left, 3 front-right. */
  coffee: 2,
  /** Pile worn flat where everyone waits for the lift. */
  worn: 6,
  /** The entrance mat inside the revolving door: `mat + edges` (sides where it ends, as `PLUSH_EDGES` counts them). */
  mat: 7,
  /** The test lab's pale vinyl, plain or scuffed by the lift. */
  vinyl: 23,
  vinylScuff: 24,
  /** The meeting room's quieter carpet, plain or worn by the lift. */
  meeting: 25,
  meetingWorn: 26,
  /** The meeting carpet's violet border: `meetingEdge + edges` (sides where the room ends, as `PLUSH_EDGES` counts them). */
  meetingEdge: 27,
  /** The meeting carpet where the game's meeting-rug tint doesn't reach (under a station): its tinted look, bare. */
  meetingBare: 43,
} as const;
/** How many wear kinds there are. */
export const FLOOR_WEAR_KINDS = 44;

/** What hangs on a wall face (each on one face of a wall tile, facing the room). */
export type UpperArt =
  | 'directory0'
  | 'directory1'
  | 'directory2'
  | 'stairsClosed'
  | 'plan'
  | 'kiosk'
  | 'clock'
  | 'reproBoard'
  | 'meetingScreen'
  | 'booked';

/** How far each piece reaches either side of its spot (`roomModels/upperFloors` builds to it). */
export const UPPER_ART_HALF: Readonly<Record<UpperArt, number>> = {
  directory0: 0.3,
  directory1: 0.3,
  directory2: 0.3,
  stairsClosed: 0.42,
  plan: 0.44,
  kiosk: 0.34,
  clock: 0.15,
  reproBoard: 0.46,
  meetingScreen: 0.44,
  booked: 0.2,
};

/** The art that hangs on a solid plasterboard panel (its tile built as `solidSwap`), not on glass. */
const ON_SOLID: ReadonlySet<UpperArt> = new Set(['kiosk', 'reproBoard', 'meetingScreen']);

/**
 * The swap for a full-height plasterboard panel in a low back wall: the
 * hot-desk floor's lift core (the walls either side of its car, where the
 * stairs door and the directory hang) and the front desk's end (the kiosk).
 */
export const CORE_LOOKS = 2;
export const coreSwap = (look: number) => `core:${look}`;

/** The art that stands on a low back wall's top, facing the room. */
export const STANDING_ART: ReadonlySet<UpperArt> = new Set(['plan']);

export interface UpperArtSpot {
  x: number;
  y: number;
  yaw: number;
  art: UpperArt;
}

/** What stands on a wall top. */
export type TopKind =
  | 'lockers'
  | 'lockersLogo'
  | 'lockersOpen'
  | 'coatStand'
  | 'bags'
  | 'phoneShelf'
  | 'tabletRack'
  | 'deviceBin'
  | 'cakeTable'
  | 'meetingPlant';

/** A wall-top prop: its tile, its kind, a lean toward its cluster's partner, and a turn. */
export interface TopProp {
  x: number;
  y: number;
  /** On a low wall, not a full one. */
  low: boolean;
  kind: TopKind;
  toward: { dx: number; dy: number };
  yaw: number;
}

/** What lies on the hot-desk floor's low walls (front, and back where nothing tall stands): a hand high at most. */
export type FrontKind =
  'gymBag' | 'coatPile' | 'mugTray' | 'laptopBag' | 'laptopStack' | 'headsetBox';

/** One floor's lift: its cabin's tiles and the side of the room the cabin is on. */
export interface LiftStop {
  /** The building floor (0 the street). */
  floor: number;
  zone: Zone;
  tiles: GridPoint[];
}

export interface UpperFloorsRoom {
  /** The zone of every open tile (stations and counters too: the floor runs under them), keyed `x,y`. */
  zones: Record<string, Zone>;
  /** Always empty: the floors' pieces are story pieces. */
  decos: Record<string, string>;
  /** Wear on every open tile (a `FLOOR_WEAR`), keyed `x,y`. */
  floorWear: Record<string, number>;
  /** The walkway's tiles from the lift to the revolving door, in order. */
  walkway: GridPoint[];
  /** Always empty: the wall tops are dressed as story pieces (`tops`). */
  capProps: [];
  frontProps: [];
  /** Solid panels behind the art that needs one; the hot-desk floor's full-height core panels. */
  swaps: Record<string, string>;
  /** The hot-desk floor's full-height panels in its low back wall (also in `swaps`). */
  core: GridPoint[];
  wallArt: UpperArtSpot[];
  tops: TopProp[];
  fronts: { x: number; y: number; kind: FrontKind; yaw: number }[];
  /** The aluminium head track along every partition top. */
  headTracks: HeadTrack[];
  lifts: LiftStop[];
  /** The front desk at the inbox, the revolving door at the ship. */
  frontDesk: Doorway | null;
  frontDoor: Doorway | null;
  /** The BUGS in-tray rack behind the bug queue, on its outer side. */
  bugRack: Doorway | null;
  /** Segfault's open locker: the `lockersOpen` top it sleeps in (its world spot is the top's). */
  segfault: TopProp | null;
}

const OUT: Readonly<Record<Side, { dx: number; dy: number }>> = {
  back: { dx: 0, dy: -1 },
  front: { dx: 0, dy: 1 },
  left: { dx: -1, dy: 0 },
  right: { dx: 1, dy: 0 },
};
const STEPS = [
  [0, -1],
  [0, 1],
  [-1, 0],
  [1, 0],
] as const;

const key = (x: number, y: number) => `${x},${y}`;
const cheb = (a: GridPoint, b: GridPoint) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

/** Whether (x, y) is open ground (not wall, not outside). */
function isOpen(map: LevelMap, x: number, y: number): boolean {
  const t = getTile(map, x, y);
  return t !== null && t !== 'wall' && t !== 'void';
}

/** Whether (x, y) is off the map or void: outside the floor. */
function outside(map: LevelMap, x: number, y: number): boolean {
  const t = getTile(map, x, y);
  return t === null || t === 'void';
}

export function upperFloorsRoom(map: LevelMap): UpperFloorsRoom {
  const salt = levelSalt(map);
  const zones = findZones(map);
  const lifts = liftStops(map, zones);
  const cabins = new Set(lifts.flatMap((l) => l.tiles.map((t) => key(t.x, t.y))));
  const frontDesk = findDoorways(map, 'inbox')[0] ?? null;
  const frontDoor = findDoorways(map, 'ship')[0] ?? null;
  const bugRack = findBugRack(map);
  const walkway = findWalkway(map, zones, lifts, frontDoor, cabins);
  const floorWear = floorWearOf(map, zones, lifts, walkway, frontDoor, cabins, salt);
  const core = coreTiles(map, lifts, frontDesk);
  const coreSet = new Set(core.map((p) => key(p.x, p.y)));
  const wallArt = placeWallArt(map, zones, lifts, cabins, frontDesk, coreSet);
  const swaps: Record<string, string> = {};
  for (const a of wallArt)
    if (ON_SOLID.has(a.art) && !coreSet.has(key(a.x, a.y)))
      swaps[key(a.x, a.y)] = solidSwap(((tileHash(a.x + 7, a.y + 19) ^ salt) >>> 5) % SOLID_LOOKS);
  for (const p of core)
    swaps[key(p.x, p.y)] = coreSwap(((tileHash(p.x + 3, p.y + 11) ^ salt) >>> 4) % CORE_LOOKS);
  const doors = [frontDesk, frontDoor, bugRack];
  const standing = new Set(
    wallArt.filter((a) => STANDING_ART.has(a.art)).map((a) => key(a.x, a.y)),
  );
  const tops = topProps(map, zones, cabins, doors, new Set([...coreSet, ...standing]), salt);
  return {
    zones,
    decos: {},
    floorWear,
    walkway,
    capProps: [],
    frontProps: [],
    swaps,
    core,
    wallArt,
    tops,
    fronts: frontProps(
      map,
      zones,
      doors,
      cabins,
      new Set([
        ...coreSet,
        ...standing,
        ...tops.map((t) => key(t.x, t.y)),
        ...wallArt.map((a) => key(a.x, a.y)),
      ]),
    ),
    headTracks: headTracks(map),
    lifts,
    frontDesk,
    frontDoor,
    bugRack,
    segfault: tops.find((t) => t.kind === 'lockersOpen') ?? null,
  };
}

// ---- The floors ----

/** The 4-connected groups of `tiles` (keyed `x,y`), each in reading order. */
function components(tiles: readonly string[]): string[][] {
  const left = new Set(tiles);
  const out: string[][] = [];
  for (const start of tiles) {
    if (!left.has(start)) continue;
    left.delete(start);
    const group: string[] = [];
    const todo = [start];
    for (let k = todo.pop(); k !== undefined; k = todo.pop()) {
      group.push(k);
      const [x = 0, y = 0] = k.split(',').map(Number);
      for (const [dx, dy] of STEPS) {
        const n = key(x + dx, y + dy);
        if (left.has(n)) {
          left.delete(n);
          todo.push(n);
        }
      }
    }
    out.push(group);
  }
  return out;
}

/** The zone of a building floor number. */
function zoneOf(floor: number): Zone {
  return floor <= 0 ? 'hotDesk' : floor === 1 ? 'lab' : 'meeting';
}

/**
 * Every open tile's zone: each island of open ground is the floor of the
 * lift stop on it (stops run top first, so the last is the street, 0);
 * an island with no stop is the hot-desk floor.
 */
export function findZones(map: LevelMap): Record<string, Zone> {
  const open: string[] = [];
  for (let y = 0; y < map.height; y++)
    for (let x = 0; x < map.width; x++) if (isOpen(map, x, y)) open.push(key(x, y));
  const stops = createLifts(map)[0]?.stops ?? [];
  const zones: Record<string, Zone> = {};
  for (const group of components(open)) {
    const set = new Set(group);
    const stop = stops.findIndex((cabin) => cabin.some((t) => set.has(key(t.x, t.y))));
    const zone = stop < 0 ? 'hotDesk' : zoneOf(stops.length - 1 - stop);
    for (const k of group) zones[k] = zone;
  }
  return zones;
}

/** Each lift stop: its building floor, its zone, its cabin. */
function liftStops(map: LevelMap, zones: Readonly<Record<string, Zone>>): LiftStop[] {
  const stops = createLifts(map)[0]?.stops ?? [];
  return stops.map((tiles, i) => {
    const floor = stops.length - 1 - i;
    const first = tiles[0];
    const zone = (first && zones[key(first.x, first.y)]) ?? zoneOf(floor);
    return { floor, zone, tiles: [...tiles] };
  });
}

/** The tiles just in front of a cabin's doors (open floor beside it, not the cabin). */
function liftFront(map: LevelMap, stop: LiftStop): GridPoint[] {
  const inCabin = (x: number, y: number) => stop.tiles.some((t) => t.x === x && t.y === y);
  const out: GridPoint[] = [];
  for (const t of stop.tiles)
    for (const [dx, dy] of STEPS) {
      const q = { x: t.x + dx, y: t.y + dy };
      if (!inCabin(q.x, q.y) && getTile(map, q.x, q.y) === 'floor') out.push(q);
    }
  return out;
}

/**
 * The walkway: the fewest-turn shortest path over the hot-desk floor's
 * plain floor from in front of its lift to just inside the revolving door,
 * round every spawn (players' and managers').
 */
function findWalkway(
  map: LevelMap,
  zones: Readonly<Record<string, Zone>>,
  lifts: readonly LiftStop[],
  door: Doorway | null,
  cabins: ReadonlySet<string>,
): GridPoint[] {
  const stop = lifts.find((l) => l.zone === 'hotDesk');
  if (!door || !stop) return [];
  const spawns = new Set([...map.spawns, ...map.managerSpawns].map((p) => key(p.x, p.y)));
  const ok = (x: number, y: number) =>
    getTile(map, x, y) === 'floor' &&
    zones[key(x, y)] === 'hotDesk' &&
    !cabins.has(key(x, y)) &&
    !spawns.has(key(x, y));
  const starts = liftFront(map, stop).filter((p) => ok(p.x, p.y));
  const goals = new Set(
    door.tiles
      .map((t) => ({ x: t.x - OUT[door.side].dx, y: t.y - OUT[door.side].dy }))
      .filter((p) => ok(p.x, p.y))
      .map((p) => key(p.x, p.y)),
  );
  if (starts.length === 0 || goals.size === 0) return [];
  type Node = { x: number; y: number; d: number; cost: number; prev: string | null };
  const best = new Map<string, Node>();
  const queue: Node[] = [];
  // From the middle of the lift's front, so the path leaves the doors square.
  const mid = starts[Math.floor(starts.length / 2)] ?? starts[0];
  for (const s of starts)
    for (let d = 0; d < 4; d++) {
      const n = {
        x: s.x,
        y: s.y,
        d,
        cost: mid && (s.x !== mid.x || s.y !== mid.y) ? 6 : 0,
        prev: null,
      };
      best.set(`${s.x},${s.y},${d}`, n);
      queue.push(n);
    }
  let end: Node | null = null;
  while (queue.length > 0) {
    queue.sort((a, b) => a.cost - b.cost || a.y - b.y || a.x - b.x || a.d - b.d);
    const n = queue.shift();
    if (!n) break;
    if (best.get(`${n.x},${n.y},${n.d}`) !== n) continue;
    if (goals.has(key(n.x, n.y))) {
      end = n;
      break;
    }
    STEPS.forEach(([dx, dy], d) => {
      const x = n.x + dx;
      const y = n.y + dy;
      if (!ok(x, y)) return;
      const cost = n.cost + 10 + (d === n.d ? 0 : 3);
      const k = `${x},${y},${d}`;
      const old = best.get(k);
      if (old && old.cost <= cost) return;
      const next = { x, y, d, cost, prev: `${n.x},${n.y},${n.d}` };
      best.set(k, next);
      queue.push(next);
    });
  }
  const path: GridPoint[] = [];
  for (let n: Node | null | undefined = end; n; n = n.prev ? best.get(n.prev) : null)
    path.unshift({ x: n.x, y: n.y });
  return path;
}

/** The sides (as `PLUSH_EDGES` counts them) of (x, y) where `set` ends. */
function edgesOf(set: ReadonlySet<string>, x: number, y: number): number {
  let edges = 0;
  PLUSH_EDGES.forEach((side, bit) => {
    const { dx, dy } = OUT[side];
    if (!set.has(key(x + dx, y + dy))) edges |= 1 << bit;
  });
  return edges;
}

/** How many coffee rings the hot-desk floor gets at most. */
export const COFFEE_RINGS = 3;

/**
 * Wear on every open tile: the zone's own floor; on the hot-desk floor the
 * walkway, pile worn flat in front of the lift, the entrance mat inside the
 * revolving door and faint coffee rings beside the hot desks (in the corner
 * toward the desk; never on a spawn, the walkway or the mat); upstairs the
 * floor scuffed or worn in front of the lift.
 */
function floorWearOf(
  map: LevelMap,
  zones: Readonly<Record<string, Zone>>,
  lifts: readonly LiftStop[],
  walkway: readonly GridPoint[],
  door: Doorway | null,
  cabins: ReadonlySet<string>,
  salt: number,
): Record<string, number> {
  const out: Record<string, number> = {};
  const base: Record<Zone, number> = {
    hotDesk: FLOOR_WEAR.carpet,
    lab: FLOOR_WEAR.vinyl,
    meeting: FLOOR_WEAR.meeting,
  };
  for (const [k, zone] of Object.entries(zones)) out[k] = base[zone];
  const spawns = new Set([...map.spawns, ...map.managerSpawns].map((p) => key(p.x, p.y)));
  for (const p of walkway) out[key(p.x, p.y)] = FLOOR_WEAR.walkway;
  // In front of each lift: worn by everyone waiting.
  const worn: Record<Zone, number> = {
    hotDesk: FLOOR_WEAR.worn,
    lab: FLOOR_WEAR.vinylScuff,
    meeting: FLOOR_WEAR.meetingWorn,
  };
  for (const stop of lifts)
    for (const p of liftFront(map, stop)) {
      const k = key(p.x, p.y);
      if (out[k] === base[stop.zone] && !spawns.has(k)) out[k] = worn[stop.zone];
    }
  // The meeting carpet's violet border round the room's edge.
  const meeting = new Set(Object.keys(zones).filter((k) => zones[k] === 'meeting'));
  for (const k of meeting) {
    if (out[k] !== FLOOR_WEAR.meeting) continue;
    const [x = 0, y = 0] = k.split(',').map(Number);
    const edges = edgesOf(meeting, x, y);
    if (edges) out[k] = FLOOR_WEAR.meetingEdge + edges;
  }
  // Under the meeting room's stations the rug's tint doesn't fall: the carpet's tinted look, bare.
  const rug = new Set(map.meetingTiles.map((t) => key(t.x, t.y)));
  for (const k of meeting) if (!rug.has(k) && !cabins.has(k)) out[k] = FLOOR_WEAR.meetingBare;
  // Heel and trolley scuffs on the lab's vinyl in front of its stations.
  for (const [k, zone] of Object.entries(zones)) {
    if (zone !== 'lab' || out[k] !== FLOOR_WEAR.vinyl) continue;
    const [x = 0, y = 0] = k.split(',').map(Number);
    if (getTile(map, x, y) !== 'floor' || spawns.has(k)) continue;
    const byStation = STEPS.some(([dx, dy]) => {
      const t = getTile(map, x + dx, y + dy);
      return (
        t !== null &&
        t !== 'wall' &&
        t !== 'void' &&
        t !== 'floor' &&
        !cabins.has(key(x + dx, y + dy))
      );
    });
    if (byStation) out[k] = FLOOR_WEAR.vinylScuff;
  }
  // The entrance mat just inside the revolving door.
  const mat = new Set(
    (door?.tiles ?? [])
      .map((t) => ({
        x: t.x - OUT[door?.side ?? 'front'].dx,
        y: t.y - OUT[door?.side ?? 'front'].dy,
      }))
      .filter((p) => getTile(map, p.x, p.y) === 'floor' && zones[key(p.x, p.y)] === 'hotDesk')
      .map((p) => key(p.x, p.y)),
  );
  for (const k of mat) {
    const [x = 0, y = 0] = k.split(',').map(Number);
    out[k] = FLOOR_WEAR.mat + edgesOf(mat, x, y);
  }
  // Coffee rings: plain carpet beside a hot desk (a keyboard), the ring in the corner toward it.
  const rings: { x: number; y: number; corner: number; rank: number }[] = [];
  for (let y = 0; y < map.height; y++)
    for (let x = 0; x < map.width; x++) {
      if (getTile(map, x, y) !== 'keyboard' || zones[key(x, y)] !== 'hotDesk') continue;
      for (const [dx, dy] of STEPS) {
        if (dy === 0) continue;
        const p = { x: x + dx, y: y + dy };
        const k = key(p.x, p.y);
        if (
          getTile(map, p.x, p.y) !== 'floor' ||
          out[k] !== FLOOR_WEAR.carpet ||
          spawns.has(k) ||
          cabins.has(k) ||
          [...map.spawns, ...map.managerSpawns].some((s) => cheb(s, p) < 1)
        )
          continue;
        // The corner toward the desk: back corners when the desk is behind (dy −1 from it).
        const back = dy > 0;
        const left = ((tileHash(p.x + 9, p.y + 4) ^ salt) >>> 3) % 2 === 0;
        rings.push({
          ...p,
          corner: (back ? 0 : 2) + (left ? 0 : 1),
          rank: ((tileHash(p.x + 31, p.y + 17) ^ salt) >>> 2) % 1009,
        });
      }
    }
  const placed: GridPoint[] = [];
  for (const r of rings.sort((a, b) => a.rank - b.rank || a.y - b.y || a.x - b.x)) {
    if (placed.length >= COFFEE_RINGS) break;
    if (placed.some((q) => cheb(q, r) < 2)) continue;
    placed.push(r);
    out[key(r.x, r.y)] = FLOOR_WEAR.coffee + r.corner;
  }
  return out;
}

// ---- The walls ----

/**
 * The bug queue's in-tray rack: the run of bug-queue tiles in a wall line
 * with the outside past them, the rack on that side.
 */
function findBugRack(map: LevelMap): Doorway | null {
  const tiles: GridPoint[] = [];
  for (let y = 0; y < map.height; y++)
    for (let x = 0; x < map.width; x++) if (getTile(map, x, y) === 'bugQueue') tiles.push({ x, y });
  for (const side of ['right', 'left', 'back', 'front'] as const) {
    const { dx, dy } = OUT[side];
    const run = tiles.filter((t) => outside(map, t.x + dx, t.y + dy));
    if (run.length === 0) continue;
    const a = run[0] ?? { x: 0, y: 0 };
    // Only the straight run with the first tile.
    const along = dx !== 0 ? (t: GridPoint) => t.x === a.x : (t: GridPoint) => t.y === a.y;
    const line = run.filter(along).sort((p, q) => p.x - q.x || p.y - q.y);
    const f = line[0] ?? a;
    const l = line[line.length - 1] ?? a;
    return { side, tiles: line, mid: { x: (f.x + l.x) / 2, y: (f.y + l.y) / 2 } };
  }
  return null;
}

/** A low back wall with the outside behind it and the open floor of the room in front. */
function lowBack(map: LevelMap, x: number, y: number): boolean {
  return (
    getTile(map, x, y) === 'wall' &&
    wallPiece(map, x, y) === 'wall-front' &&
    outside(map, x, y - 1) &&
    isOpen(map, x, y + 1)
  );
}

/**
 * The hot-desk floor's full-height panels in its low back wall: the lift
 * core (the low back wall tile either side of a cabin set in a low wall),
 * and the front desk's end (the low back wall tile past the inbox run, on
 * the side away from the map's edge), where the kiosk hangs.
 */
function coreTiles(map: LevelMap, lifts: readonly LiftStop[], desk: Doorway | null): GridPoint[] {
  const out: GridPoint[] = [];
  const add = (p: GridPoint) => {
    if (lowBack(map, p.x, p.y) && !out.some((q) => q.x === p.x && q.y === p.y)) out.push(p);
  };
  for (const stop of lifts) {
    const y = Math.min(...stop.tiles.map((t) => t.y));
    const xs = stop.tiles.map((t) => t.x);
    if (!stop.tiles.every((t) => t.y === y)) continue;
    const a = { x: Math.min(...xs) - 1, y };
    const b = { x: Math.max(...xs) + 1, y };
    // Only where the cabin sits in a low wall: both sides low back walls.
    if (lowBack(map, a.x, a.y) && lowBack(map, b.x, b.y)) {
      add(a);
      add(b);
    }
  }
  if (desk && (desk.side === 'back' || desk.side === 'front')) {
    const xs = desk.tiles.map((t) => t.x);
    const y = desk.tiles[0]?.y ?? 0;
    const ends = [
      { x: Math.min(...xs) - 1, y },
      { x: Math.max(...xs) + 1, y },
    ].sort((p, q) => Math.abs(q.x - map.width / 2) - Math.abs(p.x - map.width / 2));
    const end = ends.reverse().find((p) => lowBack(map, p.x, p.y));
    if (end) add(end);
  }
  return out.sort((a, b) => a.y - b.y || a.x - b.x);
}

/**
 * What hangs on the walls, on the back faces of each floor (a full wall
 * with the room's plain floor in front, not beside a cabin's doors on the
 * hot-desk floor's stairs side): by each lift its floor directory (the side
 * nearer the room's middle first); on the hot-desk floor the taped-off
 * stairwell door on the lift's other side, the booking kiosk nearest the
 * front desk, the plan as a desk-booking spreadsheet and the clock on the
 * faces furthest apart; in the lab the whiteboard of bug repros furthest
 * from the lift; in the meeting room the always-red BOOKED panel next to
 * the directory and the screen furthest from the lift.
 */
function placeWallArt(
  map: LevelMap,
  zones: Readonly<Record<string, Zone>>,
  lifts: readonly LiftStop[],
  cabins: ReadonlySet<string>,
  frontDesk: Doorway | null,
  core: ReadonlySet<string>,
): UpperArtSpot[] {
  const out: UpperArtSpot[] = [];
  const used = new Set<string>();
  const take = (art: UpperArt, p: GridPoint | undefined) => {
    if (!p) return;
    used.add(key(p.x, p.y));
    out.push({ x: p.x, y: p.y, yaw: 0, art });
  };
  const face = (x: number, y: number, zone: Zone) =>
    getTile(map, x, y) === 'wall' &&
    (wallPiece(map, x, y) === 'wall' || core.has(key(x, y))) &&
    !isOpen(map, x, y - 1) &&
    getTile(map, x, y + 1) === 'floor' &&
    zones[key(x, y + 1)] === zone &&
    !cabins.has(key(x, y + 1)) &&
    !used.has(key(x, y));
  const faces = (zone: Zone) => {
    const got: GridPoint[] = [];
    for (let y = 0; y < map.height; y++)
      for (let x = 0; x < map.width; x++) if (face(x, y, zone)) got.push({ x, y });
    return got;
  };
  const best = (from: GridPoint[], score: (p: GridPoint) => number) =>
    [...from]
      .filter((p) => !used.has(key(p.x, p.y)))
      .sort((a, b) => score(a) - score(b) || a.y - b.y || a.x - b.x)[0];
  const midX = (zone: Zone) => {
    const xs = Object.keys(zones)
      .filter((k) => zones[k] === zone)
      .map((k) => Number(k.split(',')[0]));
    return (Math.min(...xs) + Math.max(...xs)) / 2;
  };

  for (const stop of [...lifts].sort((a, b) => a.floor - b.floor)) {
    const { zone } = stop;
    const xs = stop.tiles.map((t) => t.x);
    const y = Math.min(...stop.tiles.map((t) => t.y));
    const x0 = Math.min(...xs);
    const x1 = Math.max(...xs);
    const centre = midX(zone);
    // The two tiles either side of the cabin in its wall line, nearer the room's middle first.
    const sides = [
      { x: x0 - 1, y },
      { x: x1 + 1, y },
    ].sort((a, b) => Math.abs(a.x - centre) - Math.abs(b.x - centre));
    const beside = sides.filter((p) => face(p.x, p.y, zone));
    const directory = `directory${Math.min(2, stop.floor)}` as UpperArt;
    if (zone === 'hotDesk') {
      // The stairs door nearer the room's middle (it's what people walk to), the directory the other side.
      take('stairsClosed', beside[0]);
      take(directory, beside[1] ?? best(faces(zone), (p) => Math.abs(p.x - (x0 + x1) / 2)));
    } else {
      take(directory, beside[0] ?? best(faces(zone), (p) => Math.abs(p.x - (x0 + x1) / 2)));
      if (zone === 'meeting') {
        // BOOKED right beside the directory, away from the lift.
        const d = out[out.length - 1];
        const away = d ? (d.x < x0 ? -1 : 1) : -1;
        const next = d ? { x: d.x + away, y: d.y } : undefined;
        take('booked', next && face(next.x, next.y, zone) ? next : undefined);
        take(
          'meetingScreen',
          best(faces(zone), (p) => -Math.abs(p.x - (x0 + x1) / 2)),
        );
      } else
        take(
          'reproBoard',
          best(faces(zone), (p) => -Math.abs(p.x - (x0 + x1) / 2)),
        );
    }
  }
  // The hot-desk floor: the kiosk by the front desk, then the plan and the clock far apart.
  const hot = faces('hotDesk');
  const desk = frontDesk?.mid;
  if (desk)
    take(
      'kiosk',
      best(hot, (p) => Math.abs(p.x - desk.x) + Math.abs(p.y - desk.y)),
    );
  const lift = lifts.find((l) => l.zone === 'hotDesk');
  const liftX = lift
    ? lift.tiles.reduce((s, t) => s + t.x, 0) / lift.tiles.length
    : midX('hotDesk');
  // The plan, standing on a low back wall facing the room, about halfway from the lift to
  // the far end (away from the kiosk), clear of the stations behind it on screen.
  const kiosk = out.find((a) => a.art === 'kiosk');
  const lows: GridPoint[] = [];
  for (let y = 0; y < map.height; y++)
    for (let x = 0; x < map.width; x++)
      if (
        lowBack(map, x, y) &&
        !core.has(key(x, y)) &&
        zones[key(x, y + 1)] === 'hotDesk' &&
        getTile(map, x, y + 1) === 'floor' &&
        !hidesBehind(map, x, y)
      )
        lows.push({ x, y });
  const xs = Object.keys(zones)
    .filter((k) => zones[k] === 'hotDesk')
    .map((k) => Number(k.split(',')[0]));
  const farEnd = kiosk && kiosk.x < liftX ? Math.max(...xs) : Math.min(...xs);
  take(
    'plan',
    best(lows, (p) => Math.abs(p.x - (liftX + farEnd) / 2)),
  );
  // The clock high over the kiosk.
  if (kiosk) out.push({ x: kiosk.x, y: kiosk.y, yaw: 0, art: 'clock' });
  return out.sort((a, b) => a.y - b.y || a.x - b.x);
}

/** The head track along every partition top, an arm toward each neighbouring partition. */
function headTracks(map: LevelMap): HeadTrack[] {
  const wall = (x: number, y: number) => getTile(map, x, y) === 'wall';
  const out: HeadTrack[] = [];
  for (let y = 0; y < map.height; y++)
    for (let x = 0; x < map.width; x++) {
      if (!wall(x, y)) continue;
      let arms = 0;
      PLUSH_EDGES.forEach((side, bit) => {
        const { dx, dy } = OUT[side];
        if (wall(x + dx, y + dy)) arms |= 1 << bit;
      });
      out.push({ x, y, low: wallPiece(map, x, y) === 'wall-front', arms });
    }
  return out;
}

// ---- The wall tops ----

/**
 * Whether something standing on the low wall at (x, y) would hide a
 * station or counter a floor up on screen: one within three rows behind
 * it, a column either side.
 */
function hidesBehind(map: LevelMap, x: number, y: number): boolean {
  for (let dy = 1; dy <= 3; dy++)
    for (let dx = -1; dx <= 1; dx++) {
      const t = getTile(map, x + dx, y - dy);
      if (t !== null && t !== 'wall' && t !== 'void' && t !== 'floor') return true;
    }
  return false;
}

/** What each floor stacks on its wall tops, cluster by cluster. */
const CLUSTERS: Readonly<Record<Zone, readonly (readonly TopKind[])[]>> = {
  hotDesk: [
    ['lockersLogo', 'lockers', 'coatStand'],
    ['lockers', 'lockersOpen', 'bags'],
    ['lockers', 'lockersLogo', 'bags'],
    ['coatStand', 'lockers', 'lockersLogo'],
  ],
  lab: [
    ['phoneShelf', 'tabletRack'],
    ['deviceBin', 'phoneShelf'],
    ['tabletRack', 'deviceBin'],
  ],
  meeting: [['cakeTable'], ['meetingPlant']],
};

/** Cluster anchors per floor at most. */
export const UPPER_CAP_CLUSTERS: Readonly<Record<Zone, number>> = {
  hotDesk: 5,
  lab: 3,
  meeting: 2,
};

/**
 * Wall tops that can carry a pile: a floor's full walls with nothing open
 * behind them (it'd hide someone standing there), not within a tile of a
 * lift cabin (it'd crowd its frame and indicator), not on the front desk's,
 * the revolving door's or the bug rack's own tiles. Clusters spread along
 * the floor's outline (back wall first, then down the sides), each anchor
 * with up to two partners along the wall: the stacked banks of lockers on
 * the hot-desk floor, device shelves in the lab, the cake and a plant in
 * the meeting room. One bank at the frame's edge stands open: Segfault's.
 */
function topProps(
  map: LevelMap,
  zones: Readonly<Record<string, Zone>>,
  cabins: ReadonlySet<string>,
  doors: readonly (Doorway | null)[],
  taken: ReadonlySet<string>,
  salt: number,
): TopProp[] {
  const nearCabin = (x: number, y: number) =>
    [...cabins].some((k) => {
      const [cx = 0, cy = 0] = k.split(',').map(Number);
      return cheb({ x: cx, y: cy }, { x, y }) <= 1;
    });
  const doorTile = (x: number, y: number) =>
    doors.some((d) => d?.tiles.some((t) => t.x === x && t.y === y));
  // A full wall with nothing open behind, or a low back wall with the outside behind
  // that hides no station a floor up.
  const free = (x: number, y: number) =>
    getTile(map, x, y) === 'wall' &&
    (wallPiece(map, x, y) !== 'wall-front'
      ? !isOpen(map, x, y - 1)
      : lowBack(map, x, y) && !hidesBehind(map, x, y)) &&
    !nearCabin(x, y) &&
    !doorTile(x, y) &&
    !doors.some((d) => d?.tiles.some((t) => cheb(t, { x, y }) <= 1)) &&
    !taken.has(key(x, y));
  const out: TopProp[] = [];
  for (const zone of ['hotDesk', 'lab', 'meeting'] as const) {
    const tiles: GridPoint[] = [];
    for (let y = 0; y < map.height; y++)
      for (let x = 0; x < map.width; x++) {
        if (!free(x, y)) continue;
        let mine = false;
        let other = false;
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const z = zones[key(x + dx, y + dy)];
            if (z === zone) mine = true;
            else if (z) other = true;
          }
        if (mine && !other) tiles.push({ x, y });
      }
    if (tiles.length === 0) continue;
    const cx = tiles.reduce((s, t) => s + t.x, 0) / tiles.length;
    const top = Math.min(...tiles.map((t) => t.y));
    const along = (p: GridPoint) => (p.y === top ? p.x : p.x < cx ? -100 - p.y : 100 + p.y);
    const sorted = [...tiles].sort((a, b) => along(a) - along(b));
    const isTile = (x: number, y: number) => tiles.some((t) => t.x === x && t.y === y);
    const n = UPPER_CAP_CLUSTERS[zone];
    const used = new Set<string>();
    const picked: GridPoint[] = [];
    for (let i = 0; i < n; i++) {
      const mark = ((i + 0.5) * sorted.length) / n - 0.5;
      let found: GridPoint | undefined;
      let d = Infinity;
      for (const [k, p] of sorted.entries()) {
        if (picked.some((q) => cheb(q, p) < 3)) continue;
        const dd = Math.abs(k - mark);
        if (dd < d - 1e-9) {
          d = dd;
          found = p;
        }
      }
      if (found) picked.push(found);
    }
    const clusters = CLUSTERS[zone];
    const turn = (q: GridPoint) => ((((tileHash(q.y + 3, q.x) ^ salt) >>> 2) % 5) - 2) * 0.04;
    picked
      .sort((a, b) => along(a) - along(b))
      .forEach((p, i) => {
        const kinds = clusters[i % clusters.length] ?? [];
        // The cluster's run along the wall: the anchor, then on along it (or back) for its partners.
        const dir = STEPS.find(
          ([dx, dy]) => isTile(p.x + dx, p.y + dy) && !used.has(key(p.x + dx, p.y + dy)),
        );
        const run: GridPoint[] = [p];
        if (dir) {
          for (let s = 1; run.length < kinds.length; s++) {
            const q = { x: p.x + dir[0] * s, y: p.y + dir[1] * s };
            if (!isTile(q.x, q.y) || used.has(key(q.x, q.y))) break;
            run.push(q);
          }
        }
        // A wall-top piece's facing: toward the room (its +z to the room's side).
        run.forEach((q, j) => {
          used.add(key(q.x, q.y));
          const kind = kinds[j];
          if (!kind) return;
          out.push({
            x: q.x,
            y: q.y,
            low: wallPiece(map, q.x, q.y) === 'wall-front',
            kind,
            toward: { dx: 0, dy: 0 },
            // Locker banks always show their doors to the camera, side walls too.
            yaw: (kind.startsWith('lockers') ? 0 : facing(map, zones, q)) + turn(q),
          });
        });
      });
  }
  // Segfault's locker: one bank on the hot-desk floor's low back wall, facing the camera, the
  // one nearest halfway from the front desk to the lift, stands open; every other bank is shut.
  const banks = out.filter((t) => t.kind.startsWith('lockers'));
  for (const t of banks) if (t.kind === 'lockersOpen') t.kind = 'lockers';
  const deskX = doors[0]?.mid.x;
  const back = banks.filter(
    (t) =>
      t.kind === 'lockers' &&
      t.low &&
      lowBack(map, t.x, t.y) &&
      zones[key(t.x, t.y + 1)] === 'hotDesk',
  );
  const aim = segfaultAim(map, zones, cabins, deskX);
  const cat =
    [...back].sort((a, b) => Math.abs(a.x - aim) - Math.abs(b.x - aim) || a.x - b.x)[0] ??
    [...banks].filter((t) => t.kind === 'lockers').sort((a, b) => a.y - b.y || a.x - b.x)[0];
  if (cat) cat.kind = 'lockersOpen';
  return out;
}

/** Halfway from the front desk to the hot-desk floor's lift, along x: where Segfault's locker goes. */
function segfaultAim(
  map: LevelMap,
  zones: Readonly<Record<string, Zone>>,
  cabins: ReadonlySet<string>,
  deskX: number | undefined,
): number {
  const xs = [...cabins]
    .map((k) => k.split(',').map(Number))
    .filter(([x = 0, y = 0]) => zones[key(x, y)] === 'hotDesk')
    .map(([x = 0]) => x);
  const liftX = xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : map.width / 2;
  return deskX === undefined ? liftX : (deskX + liftX) / 2;
}

/** How far a piece on a side wall turns toward the room (from facing the camera). */
const SIDE_TURN = 1.05;

/**
 * The turn that faces a wall-top piece (built facing +z) toward its room:
 * toward the open floor beside it (the front first, then the sides, a
 * part turn), else toward the camera.
 */
function facing(map: LevelMap, zones: Readonly<Record<string, Zone>>, p: GridPoint): number {
  // On a side wall a piece turns only partly toward the room, so its front still reads from the camera.
  if (zones[key(p.x, p.y + 1)]) return 0;
  if (zones[key(p.x + 1, p.y)]) return SIDE_TURN;
  if (zones[key(p.x - 1, p.y)]) return -SIDE_TURN;
  if (zones[key(p.x + 1, p.y + 1)]) return SIDE_TURN * 0.6;
  if (zones[key(p.x - 1, p.y + 1)]) return -SIDE_TURN * 0.6;
  if (getTile(map, p.x, p.y - 1) && zones[key(p.x, p.y - 1)]) return Math.PI;
  return 0;
}

/** What each of a low wall's clusters piles up, front wall and back wall. */
const FRONT_CLUSTERS: readonly (readonly FrontKind[])[] = [
  ['coatPile', 'gymBag'],
  ['laptopStack', 'mugTray'],
  ['headsetBox', 'laptopBag'],
];
const BACK_CLUSTERS: readonly (readonly FrontKind[])[] = [
  ['laptopStack', 'mugTray'],
  ['headsetBox', 'coatPile'],
  ['gymBag', 'laptopBag'],
];
/** Low-wall clusters per long wall at most. */
export const LOW_WALL_CLUSTERS = 3;

/**
 * Piles of a hand high on the hot-desk floor's low walls, in up to three
 * clusters per wall: on the front wall (outside in front, the floor behind)
 * and on the back wall's tiles that nothing taller stands on. Clear of the
 * doors and lift cabins by a tile and of any station beside them.
 */
function frontProps(
  map: LevelMap,
  zones: Readonly<Record<string, Zone>>,
  doors: readonly (Doorway | null)[],
  cabins: ReadonlySet<string>,
  taken: ReadonlySet<string>,
): UpperFloorsRoom['fronts'] {
  const clear = (x: number, y: number) =>
    getTile(map, x, y) === 'wall' &&
    wallPiece(map, x, y) === 'wall-front' &&
    !taken.has(key(x, y)) &&
    !doors.some((d) => d?.tiles.some((t) => cheb(t, { x, y }) <= 1)) &&
    ![...cabins].some((k) => {
      const [cx = 0, cy = 0] = k.split(',').map(Number);
      return cheb({ x: cx, y: cy }, { x, y }) <= 1;
    }) &&
    [-1, 0, 1].every((dx) => getTile(map, x + dx, y) === 'wall');
  const front: GridPoint[] = [];
  const back: GridPoint[] = [];
  for (let y = 0; y < map.height; y++)
    for (let x = 1; x < map.width - 1; x++) {
      if (!clear(x, y)) continue;
      if (
        getTile(map, x, y - 1) === 'floor' &&
        zones[key(x, y - 1)] === 'hotDesk' &&
        outside(map, x, y + 1)
      )
        front.push({ x, y });
      else if (lowBack(map, x, y) && zones[key(x, y + 1)] === 'hotDesk') back.push({ x, y });
    }
  const out: UpperFloorsRoom['fronts'] = [];
  for (const [line, clusters] of [
    [front, FRONT_CLUSTERS],
    [back, BACK_CLUSTERS],
  ] as const) {
    const has = (x: number, y: number) => line.some((p) => p.x === x && p.y === y);
    const used = new Set<string>();
    const n = Math.min(LOW_WALL_CLUSTERS, line.length);
    for (let i = 0; i < n; i++) {
      const mark = ((i + 0.5) * line.length) / n - 0.5;
      // The free tile nearest the mark, a tile clear of the clusters before it.
      const start = [...line.entries()]
        .filter(([, p]) => ![-1, 0, 1].some((dx) => used.has(key(p.x + dx, p.y))))
        .sort(([a], [b]) => Math.abs(a - mark) - Math.abs(b - mark) || a - b)[0]?.[1];
      if (!start) break;
      const kinds = clusters[i % clusters.length] ?? [];
      // On along the wall for its partner, or back if the wall ends.
      const dir = has(start.x + 1, start.y) && !used.has(key(start.x + 1, start.y)) ? 1 : -1;
      kinds.forEach((kind, j) => {
        const p = { x: start.x + dir * j, y: start.y };
        if (!has(p.x, p.y) || used.has(key(p.x, p.y))) return;
        used.add(key(p.x, p.y));
        out.push({ ...p, kind, yaw: ((tileHash(p.x, p.y) % 5) - 2) * 0.08 });
      });
    }
  }
  return out.sort((a, b) => a.y - b.y || a.x - b.x);
}

// ---- The pendants ----

/** How far a pendant slides along its row at most to clear a station or a lift behind it, in what steps. */
const PENDANT_SHIFT_MAX = 2;
const PENDANT_SHIFT_STEP = 0.05;

const zonesCache = new WeakMap<LevelMap, Record<string, Zone>>();

/**
 * The run of a floor along its back wall that row `inside` is the first
 * row of: the columns of the zone whose first open row it is, round `x`.
 */
function backRun(
  map: LevelMap,
  zones: Readonly<Record<string, Zone>>,
  inside: number,
  x: number,
): { x0: number; x1: number } | null {
  const tx = Math.round(x);
  const zone = zones[key(tx, inside)];
  if (!zone) return null;
  const first = (cx: number) => {
    for (let y = 0; y < map.height; y++)
      if (zones[key(cx, y)] === zone && getTile(map, cx, y) === 'floor') return y;
    return null;
  };
  if (first(tx) !== inside) return null;
  let x0 = tx;
  while (first(x0 - 1) === inside) x0--;
  let x1 = tx;
  while (first(x1 + 1) === inside) x1++;
  return { x0, x1 };
}

/**
 * 3-1's linear pendant for the lamp spot `at` (see `RoomDressing.lamp.fit`):
 * hung just in front of the back wall of its floor's run, slid along it
 * clear of the stations and the lift cabin in the back wall's row (it'd
 * hide them on screen) and inside the run, or left out (the light stays at
 * the spot).
 */
export function upperPendantFit(at: Vec3, map: LevelMap): Vec3 | null {
  let zones = zonesCache.get(map);
  if (!zones) {
    zones = findZones(map);
    zonesCache.set(map, zones);
  }
  const inside = Math.floor(at.z + 0.5);
  const run = backRun(map, zones, inside, at.x);
  if (!run) return null;
  const back = inside - 1;
  const cabins = new Set((createLifts(map)[0]?.stops ?? []).flat().map((t) => key(t.x, t.y)));
  const blocked: number[] = [];
  for (let x = 0; x < map.width; x++) {
    const t = getTile(map, x, back);
    if ((t !== null && t !== 'wall' && t !== 'void' && t !== 'floor') || cabins.has(key(x, back)))
      blocked.push(x);
  }
  const ok = (x: number) =>
    x - PENDANT_HALF >= run.x0 - 0.5 + 0.1 &&
    x + PENDANT_HALF <= run.x1 + 0.5 - 0.1 &&
    blocked.every((bx) => Math.abs(bx - x) >= 0.5 + PENDANT_HALF - 0.15);
  for (let i = 0; i * PENDANT_SHIFT_STEP <= PENDANT_SHIFT_MAX + 1e-9; i++) {
    const d = i * PENDANT_SHIFT_STEP;
    for (const x of d === 0 ? [at.x] : [at.x - d, at.x + d])
      if (ok(x)) return { x: Math.round(x * 100) / 100, y: PENDANT_Y, z: back + PENDANT_FORWARD };
  }
  return null;
}

/** The front wall's height, for the tests. */
export const LOW_WALL = FRONT_WALL_HEIGHT;
