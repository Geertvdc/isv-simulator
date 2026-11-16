/**
 * Where Hypergrowth's story pieces go (the `lowerFloors` wall theme): the
 * same building as Middle Management, lower down and mid-move-in. The map's
 * open ground splits into its floors: the long one-tile-wide stairwell, and
 * the islands either side of it, each numbered by the lift stop on it
 * (stop 0 the ground floor, stop 1 the first floor). From that: which
 * floor gets rubber, carpet or stair treads, the walk-off mat inside the
 * loading bay, the trolley tracks and wet footprints from the bay to the
 * lift, the pale lino in front of the post room's hatch, the stairwell's
 * painted block walls and their handrails, the lift's steel door frames in
 * the walls beside the cabins, the mail chute's hatches, what hangs on the
 * walls (the onboarding checklist, NEW STARTERS THIS WAY, the crossed-out
 * DESKS ARRIVING TUESDAY, the clock, the fire exit, the floor directories,
 * the stencilled floor numbers), the flat-pack desk boxes and the rest on
 * the wall tops, the welcome banner strung over the lift shaft, and the
 * linear pendants along the back of each floor. Placed from the map's own
 * tiles, never at fixed coordinates. No three.js here, so it can be tested.
 */

import { type GridPoint, type LevelMap, getTile } from '../../../sim/level';
import { createChutes, createLifts } from '../../../sim/lifts';
import type { Vec3 } from '../../projection';
import { levelSalt, tileHash, wallPiece } from '../../mapShape';
import { FRONT_WALL_HEIGHT, WALL_HEIGHT } from '../layout';
import {
  CARPET_WEAR,
  CARPET_WEAR_KINDS,
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

/** Which part of the building an open tile is on. */
export type Zone = 'ground' | 'first' | 'stairs';

/**
 * Wear on a floor tile (see `floorWear`): the zone and what's on it, one
 * number. The rubber's kinds first, then the carpet's (3-1's `CARPET_WEAR`
 * from `carpet`), then the stair treads'.
 */
export const FLOOR_WEAR = {
  /** Plain grey-green rubber. */
  rubber: 0,
  /** Trolley tracks and wet footprints running along x, along z. */
  trackX: 1,
  trackZ: 2,
  /** Turning: `trackTurn + corner`, `corner` 1 if it goes on toward +x (else −x), plus 2 toward +z. */
  trackTurn: 3,
  /** A faint wet patch, dripped in from the rain. */
  wet: 7,
  /** The pale post-room lino: `lino + edges`, `edges` the sides (as `PLUSH_EDGES` counts them) where it ends. */
  lino: 8,
  /** The walk-off mat inside the loading bay: `mat + edges`, as for `lino`. */
  mat: 24,
  /** 3-1's carpet tiles upstairs: `carpet + CARPET_WEAR`. */
  carpet: 40,
  /**
   * Concrete stair treads, the flight running along x, along z, or turning
   * on a landing: `stairX + step`, `stairZ + step`, `stairTurn + step`, `step`
   * how far up the flight the tile is (0 at the foot, `STAIR_RAMP - 1` at the top).
   */
  stairX: 40 + CARPET_WEAR_KINDS,
  stairZ: 40 + CARPET_WEAR_KINDS + 8,
  stairTurn: 40 + CARPET_WEAR_KINDS + 16,
} as const;
/** How many steps of tone the stairwell's flight ramps through, foot to top. */
export const STAIR_RAMP = 8;
/** How many wear kinds there are. */
export const FLOOR_WEAR_KINDS = FLOOR_WEAR.stairTurn + STAIR_RAMP;

/** The swap for a stairwell's painted block wall: its piece and look. */
export const BLOCK_LOOKS = 3;
export const blockSwap = (piece: 'wall' | 'wall-front' | 'wall-inner', look: number) =>
  `block:${piece}:${look}`;
/**
 * The swap for a floor's low front wall over the stairwell (the stairs'
 * block wall in front of it): 3-1's glass partition as a balustrade, the
 * first floor looking down on the stairs.
 */
export const BALUSTRADE_LOOKS = 2;
export const balustradeSwap = (look: number) => `balustrade:${look}`;
/**
 * The swap for one tile of a lift's steel door frame: the floor it's on,
 * the run's axis, and which of its ends (a bit for −, a bit for +) end the
 * run, where the jambs stand.
 */
export const liftSwap = (floor: number, axis: 'x' | 'z', ends: number) =>
  `lift:${floor}:${axis}:${ends}`;

/** What hangs on the walls, each on one face of a wall tile. */
export type LowerArt =
  | 'checklist'
  | 'newStarters'
  | 'desksTuesday'
  | 'clock'
  | 'fireExit'
  | 'directory0'
  | 'directory1'
  | 'stencil1'
  | 'yotta';

/** How far each piece reaches either side of its spot (`roomModels/lowerFloors` builds to it). */
export const LOWER_ART_HALF: Readonly<Record<LowerArt, number>> = {
  checklist: 0.34,
  newStarters: 0.42,
  desksTuesday: 0.3,
  clock: 0.15,
  fireExit: 0.24,
  directory0: 0.3,
  directory1: 0.3,
  stencil1: 0.2,
  yotta: 0.46,
};

/** The art that hangs on a solid plasterboard panel (its tile built as `solidSwap`). */
const ON_SOLID: ReadonlySet<LowerArt> = new Set(['yotta']);
/** The art that stands on a low wall's top, facing the room. */
export const STANDING_ART: ReadonlySet<LowerArt> = new Set(['checklist', 'newStarters']);

/** A piece of art on a wall: the tile, the face (`yaw` turns a model facing +z onto it). */
export interface LowerArtSpot {
  x: number;
  y: number;
  yaw: number;
  art: LowerArt;
}

/** What stands on a wall top: the ground floor's flat-pack joke, the first floor's kit. */
export type TopKind =
  | 'boxTower'
  | 'boxPair'
  | 'boxBalloon'
  | 'welcomePacks'
  | 'wrappedChairs'
  | 'boxedMonitors'
  | 'laptops'
  | 'deskFan'
  | 'monitorBox'
  | 'kitLow'
  | 'laptopsLow';

/** A wall-top prop: its tile, its kind, a lean toward its cluster's partner, and a turn. */
export interface TopProp {
  x: number;
  y: number;
  /** On a low wall (the ground floor's back), not a full one. */
  low: boolean;
  kind: TopKind;
  toward: { dx: number; dy: number };
  yaw: number;
}

/**
 * What lies on a floor's low walls: never more than a hand high (but for a
 * balloon on its string): flat-packs two high, an open box of welcome packs
 * with a tote, a chair lying in its plastic, flat-packs with a balloon.
 */
export type FrontKind = 'lowBoxes' | 'lowPacks' | 'lowChairs' | 'lowBalloon';

/** One floor's lift door frame: its wall tiles in a run, the side of the cabin it's on. */
export interface LiftDoor {
  floor: number;
  tiles: GridPoint[];
  /** Where the run's middle is, and the run's axis. */
  mid: { x: number; y: number };
  axis: 'x' | 'z';
  /** The side of the cabin the doors are on (toward the shaft). */
  side: Side;
}

/** A chute hatch: where, which end, and the turn that faces the model's +z out over the shaft. */
export interface Hatch {
  x: number;
  y: number;
  top: boolean;
  yaw: number;
}

/** The welcome banner's wire, strung over the shaft between the floors' lift walls. */
export interface Banner {
  /** The wire's ends (world x), its height and its depth (world z). */
  x0: number;
  x1: number;
  y: number;
  z: number;
}

export interface LowerFloorsRoom {
  /** The zone of every open tile (stations and counters too: the floor runs under them), keyed `x,y`. */
  zones: Record<string, Zone>;
  /** Always empty: the floors' pieces are story pieces. */
  decos: Record<string, string>;
  /** Wear on every open tile (a `FLOOR_WEAR`), keyed `x,y`. */
  floorWear: Record<string, number>;
  /** The trolley tracks' tiles from the loading bay to the lift, in order. */
  tracks: GridPoint[];
  /** Always empty: the wall tops are dressed as story pieces (`tops`). */
  capProps: [];
  frontProps: [];
  /** Stairwell walls as painted block, lift door frames, solid panels behind art. */
  swaps: Record<string, string>;
  wallArt: LowerArtSpot[];
  tops: TopProp[];
  fronts: { x: number; y: number; kind: FrontKind; yaw: number }[];
  /** The aluminium head track along every partition top (not the block walls, not the lifts). */
  headTracks: HeadTrack[];
  /**
   * The handrail on the stairwell's walls: on a low wall's top, or on a full
   * wall's face (`yaw` as for art); a post (or bracket) on every second tile.
   */
  rails: { x: number; y: number; low: boolean; yaw: number; post: boolean }[];
  /** The floor numbers stencilled on the stairwell's floor: 0 at the foot, 1 at the top. */
  floorNumbers: { x: number; y: number; n: number }[];
  /**
   * The first floor's slab edge: each outer wall face of the first floor
   * (`yaw` turns a model facing +z onto it), so it reads as upstairs.
   */
  slabEdges: { x: number; y: number; yaw: number }[];
  /** The post room's pass-through at the inbox, the loading bay's shutter at the ship. */
  postHatch: Doorway | null;
  loadingBay: Doorway | null;
  lifts: LiftDoor[];
  hatches: Hatch[];
  banner: Banner | null;
}

const OUT: Readonly<Record<Side, { dx: number; dy: number }>> = {
  back: { dx: 0, dy: -1 },
  front: { dx: 0, dy: 1 },
  left: { dx: -1, dy: 0 },
  right: { dx: 1, dy: 0 },
};
const SIDE_YAW: Readonly<Record<Side, number>> = {
  back: Math.PI,
  front: 0,
  left: -Math.PI / 2,
  right: Math.PI / 2,
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

export function lowerFloorsRoom(map: LevelMap): LowerFloorsRoom {
  const salt = levelSalt(map);
  const zones = findZones(map);
  const stairs = new Set(Object.keys(zones).filter((k) => zones[k] === 'stairs'));
  const postHatch = findDoorways(map, 'inbox')[0] ?? null;
  const loadingBay = findDoorways(map, 'ship')[0] ?? null;
  const lifts = liftDoors(map);
  const liftTiles = new Set(lifts.flatMap((l) => l.tiles.map((t) => key(t.x, t.y))));
  const cabins = new Set(createLifts(map).flatMap((l) => l.stops.flat().map((t) => key(t.x, t.y))));
  const hatches = chuteHatches(map);

  const swaps: Record<string, string> = {};
  const block = blockWalls(map, zones);
  for (const k of block) {
    const [x = 0, y = 0] = k.split(',').map(Number);
    const look = ((tileHash(x + 3, y + 29) ^ salt) >>> 6) % BLOCK_LOOKS;
    swaps[k] = blockSwap(wallPiece(map, x, y), look);
  }
  for (const l of lifts)
    l.tiles.forEach((t, i) => {
      const ends = (i === 0 ? 1 : 0) | (i === l.tiles.length - 1 ? 2 : 0);
      swaps[key(t.x, t.y)] = liftSwap(l.floor, l.axis, ends);
    });
  const wallArt = placeWallArt(map, zones, block, liftTiles, lifts);
  for (const a of wallArt)
    if (ON_SOLID.has(a.art))
      swaps[key(a.x, a.y)] = solidSwap(((tileHash(a.x + 7, a.y + 19) ^ salt) >>> 5) % SOLID_LOOKS);

  for (const k of balustrades(map, zones, block)) {
    const [x = 0, y = 0] = k.split(',').map(Number);
    swaps[k] = balustradeSwap(((tileHash(x + 5, y + 2) ^ salt) >>> 3) % BALUSTRADE_LOOKS);
  }

  const tracks = findTracks(map, zones, loadingBay, lifts, cabins);
  const climb = stairClimb(zones, stairs);
  const floorWear = floorWearOf(map, zones, stairs, climb, tracks, postHatch, loadingBay, cabins);
  const doors = [postHatch, loadingBay];
  return {
    zones,
    decos: {},
    floorWear,
    tracks,
    capProps: [],
    frontProps: [],
    swaps,
    wallArt,
    tops: topProps(
      map,
      zones,
      block,
      liftTiles,
      doors,
      new Set(wallArt.filter((a) => STANDING_ART.has(a.art)).map((a) => key(a.x, a.y))),
      salt,
      swaps,
    ),
    fronts: frontProps(map, zones, block, doors),
    headTracks: headTracks(map, swaps),
    rails: stairRails(map, block, stairs),
    floorNumbers: floorNumbers(climb),
    slabEdges: slabEdges(map, zones),
    postHatch,
    loadingBay,
    lifts,
    hatches,
    banner: banner(lifts),
  };
}

// ---- The floors ----

/**
 * Every open tile's zone. The stairwell: one-tile-wide runs of plain floor
 * (walls or the outside both sides across it), with the landings where two
 * runs meet, at least three tiles in all. The rest splits into islands
 * where the stairs are taken out; each island is the floor of the lift stop
 * on it (stop 0 the ground floor, any other the first floor), ground where
 * there's no lift.
 */
export function findZones(map: LevelMap): Record<string, Zone> {
  const blocked = (x: number, y: number) => !isOpen(map, x, y);
  const cabins = new Set(createLifts(map).flatMap((l) => l.stops.flat().map((t) => key(t.x, t.y))));
  const plain = (x: number, y: number) => getTile(map, x, y) === 'floor' && !cabins.has(key(x, y));
  const stair = new Set<string>();
  for (let y = 0; y < map.height; y++)
    for (let x = 0; x < map.width; x++)
      if (
        plain(x, y) &&
        ((blocked(x - 1, y) && blocked(x + 1, y)) || (blocked(x, y - 1) && blocked(x, y + 1)))
      )
        stair.add(key(x, y));
  // The landings: plain floor whose open neighbours are all stairs, two of them at least.
  for (let y = 0; y < map.height; y++)
    for (let x = 0; x < map.width; x++) {
      if (!plain(x, y) || stair.has(key(x, y))) continue;
      const open = STEPS.filter(([dx, dy]) => isOpen(map, x + dx, y + dy));
      if (open.length >= 2 && open.every(([dx, dy]) => stair.has(key(x + dx, y + dy))))
        stair.add(key(x, y));
    }
  // Short bits (a doorway in a wall) aren't a stairwell.
  for (const group of components([...stair]))
    if (group.length < 3) for (const k of group) stair.delete(k);

  const zones: Record<string, Zone> = {};
  const rest: string[] = [];
  for (let y = 0; y < map.height; y++)
    for (let x = 0; x < map.width; x++) {
      if (!isOpen(map, x, y)) continue;
      const k = key(x, y);
      if (stair.has(k)) zones[k] = 'stairs';
      else rest.push(k);
    }
  const stops = createLifts(map)[0]?.stops ?? [];
  for (const group of components(rest)) {
    const set = new Set(group);
    const floor = stops.findIndex((cabin) => cabin.some((t) => set.has(key(t.x, t.y))));
    for (const k of group) zones[k] = floor >= 1 ? 'first' : 'ground';
  }
  return zones;
}

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

/** The zone a wall belongs to: of its open neighbours (4 sides first, then corners), ground first. */
function wallZone(zones: Readonly<Record<string, Zone>>, x: number, y: number): Zone[] {
  const out: Zone[] = [];
  for (const [dx, dy] of STEPS) {
    const z = zones[key(x + dx, y + dy)];
    if (z && !out.includes(z)) out.push(z);
  }
  return out;
}

/**
 * The stairwell's walls: walls whose open neighbours are all stairs (so a
 * wall between a floor and the stairs stays the floor's partition).
 */
function blockWalls(map: LevelMap, zones: Readonly<Record<string, Zone>>): Set<string> {
  const out = new Set<string>();
  for (let y = 0; y < map.height; y++)
    for (let x = 0; x < map.width; x++) {
      if (getTile(map, x, y) !== 'wall') continue;
      const z = wallZone(zones, x, y);
      if (z.length === 1 && z[0] === 'stairs') out.add(key(x, y));
    }
  return out;
}

/**
 * The first floor's low walls with the stairwell's block wall right in
 * front of them: they become a glass balustrade over the stairs.
 */
function balustrades(
  map: LevelMap,
  zones: Readonly<Record<string, Zone>>,
  block: ReadonlySet<string>,
): Set<string> {
  const out = new Set<string>();
  for (let y = 0; y < map.height; y++)
    for (let x = 0; x < map.width; x++)
      if (
        getTile(map, x, y) === 'wall' &&
        wallPiece(map, x, y) === 'wall-front' &&
        zones[key(x, y - 1)] === 'first' &&
        block.has(key(x, y + 1)) &&
        !block.has(key(x, y))
      )
        out.add(key(x, y));
  return out;
}

/**
 * The first floor's slab edge: every face of a wall beside the first floor
 * with the outside past it (off the map or void), but the front (the
 * camera's side has the stairs).
 */
function slabEdges(
  map: LevelMap,
  zones: Readonly<Record<string, Zone>>,
): LowerFloorsRoom['slabEdges'] {
  const out: LowerFloorsRoom['slabEdges'] = [];
  for (let y = 0; y < map.height; y++)
    for (let x = 0; x < map.width; x++) {
      if (getTile(map, x, y) !== 'wall') continue;
      let first = false;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) if (zones[key(x + dx, y + dy)] === 'first') first = true;
      if (!first) continue;
      for (const side of ['back', 'left', 'right'] as const) {
        const { dx, dy } = OUT[side];
        if (outside(map, x + dx, y + dy))
          out.push({ x, y, yaw: side === 'back' ? Math.PI : SIDE_YAW[side] });
      }
    }
  return out;
}

/**
 * The trolley tracks and wet footprints: the fewest-turn shortest path over
 * the ground floor's plain floor from just inside the loading bay to the
 * tile in front of the ground floor's lift cabin, round every spawn.
 */
function findTracks(
  map: LevelMap,
  zones: Readonly<Record<string, Zone>>,
  bay: Doorway | null,
  lifts: readonly LiftDoor[],
  cabins: ReadonlySet<string>,
): GridPoint[] {
  const ground = lifts.find((l) => l.floor === 0);
  const stop = createLifts(map)[0]?.stops[0];
  if (!bay || !ground || !stop) return [];
  const spawns = new Set([...map.spawns, ...map.managerSpawns].map((p) => key(p.x, p.y)));
  const ok = (x: number, y: number) =>
    getTile(map, x, y) === 'floor' &&
    zones[key(x, y)] === 'ground' &&
    !cabins.has(key(x, y)) &&
    !spawns.has(key(x, y));
  const starts = bay.tiles
    .map((t) => ({ x: t.x - OUT[bay.side].dx, y: t.y - OUT[bay.side].dy }))
    .filter((p) => ok(p.x, p.y));
  // The goals: in front of the cabin, on the side away from its doors.
  const goals = new Set<string>();
  for (const t of stop)
    for (const [dx, dy] of STEPS) {
      const q = { x: t.x + dx, y: t.y + dy };
      if (ok(q.x, q.y)) goals.add(key(q.x, q.y));
    }
  if (starts.length === 0 || goals.size === 0) return [];
  type Node = { x: number; y: number; d: number; cost: number; prev: string | null };
  const best = new Map<string, Node>();
  const queue: Node[] = [];
  for (const s of starts)
    for (let d = 0; d < 4; d++) {
      const n = { x: s.x, y: s.y, d, cost: 0, prev: null };
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

/**
 * Wear on every open tile: the stair treads along their flight, carpet
 * upstairs (one tile from another batch, out of the way), rubber on the
 * ground floor with the walk-off mat inside the loading bay, the pale lino
 * in front of the post room's hatch, the tracks from the bay to the lift
 * (never on a spawn: `findTracks` goes round them) and a wet patch beside
 * the mat.
 */
function floorWearOf(
  map: LevelMap,
  zones: Readonly<Record<string, Zone>>,
  stairs: ReadonlySet<string>,
  climb: Readonly<Record<string, number>>,
  tracks: readonly GridPoint[],
  post: Doorway | null,
  bay: Doorway | null,
  cabins: ReadonlySet<string>,
): Record<string, number> {
  const salt = levelSalt(map);
  const out: Record<string, number> = {};
  const spawns = [...map.spawns, ...map.managerSpawns];
  const spawnSet = new Set(spawns.map((p) => key(p.x, p.y)));
  for (const [k, zone] of Object.entries(zones)) {
    const [x = 0, y = 0] = k.split(',').map(Number);
    if (zone === 'stairs') {
      const alongX = stairs.has(key(x - 1, y)) || stairs.has(key(x + 1, y));
      const alongZ = stairs.has(key(x, y - 1)) || stairs.has(key(x, y + 1));
      const step = Math.round((climb[k] ?? 0) * (STAIR_RAMP - 1));
      out[k] =
        (alongX && alongZ ? FLOOR_WEAR.stairTurn : alongZ ? FLOOR_WEAR.stairZ : FLOOR_WEAR.stairX) +
        step;
    } else if (zone === 'first') out[k] = FLOOR_WEAR.carpet + CARPET_WEAR.none;
    else out[k] = FLOOR_WEAR.rubber;
  }
  const inside = (d: Doorway | null) =>
    (d?.tiles ?? [])
      .map((t) => ({ x: t.x - OUT[d?.side ?? 'back'].dx, y: t.y - OUT[d?.side ?? 'back'].dy }))
      .filter((p) => getTile(map, p.x, p.y) === 'floor' && zones[key(p.x, p.y)] === 'ground');
  // The tracks, turning where the path turns.
  tracks.forEach((p, i) => {
    const a = tracks[i - 1];
    const b = tracks[i + 1];
    const nx = [a, b].find((q) => q && q.y === p.y && q.x !== p.x);
    const nz = [a, b].find((q) => q && q.x === p.x && q.y !== p.y);
    out[key(p.x, p.y)] =
      nx && nz
        ? FLOOR_WEAR.trackTurn + (nx.x > p.x ? 1 : 0) + (nz.y > p.y ? 2 : 0)
        : nz
          ? FLOOR_WEAR.trackZ
          : FLOOR_WEAR.trackX;
  });
  // The walk-off mat just inside the bay, and the lino in front of the post room.
  const mat = new Set(inside(bay).map((p) => key(p.x, p.y)));
  for (const k of mat) {
    const [x = 0, y = 0] = k.split(',').map(Number);
    out[k] = FLOOR_WEAR.mat + edgesOf(mat, x, y);
  }
  const lino = new Set(inside(post).map((p) => key(p.x, p.y)));
  for (const k of lino) {
    const [x = 0, y = 0] = k.split(',').map(Number);
    out[k] = FLOOR_WEAR.lino + edgesOf(lino, x, y);
  }
  // A wet patch: a plain rubber tile beside the mat, off the tracks, never on a spawn.
  const wet = [...mat]
    .flatMap((k) => {
      const [x = 0, y = 0] = k.split(',').map(Number);
      return STEPS.map(([dx, dy]) => ({ x: x + dx, y: y + dy }));
    })
    .filter(
      (p) =>
        out[key(p.x, p.y)] === FLOOR_WEAR.rubber &&
        getTile(map, p.x, p.y) === 'floor' &&
        !spawnSet.has(key(p.x, p.y)) &&
        !cabins.has(key(p.x, p.y)),
    )
    .sort(
      (a, b) =>
        ((tileHash(a.x, a.y + 5) ^ salt) % 101) - ((tileHash(b.x, b.y + 5) ^ salt) % 101) ||
        a.y - b.y ||
        a.x - b.x,
    )[0];
  if (wet) out[key(wet.x, wet.y)] = FLOOR_WEAR.wet;
  // Upstairs, one tile of carpet from another batch, two from every spawn.
  const odd = Object.keys(zones)
    .filter((k) => zones[k] === 'first' && out[k] === FLOOR_WEAR.carpet)
    .map((k) => {
      const [x = 0, y = 0] = k.split(',').map(Number);
      return { x, y };
    })
    .filter(
      (p) =>
        getTile(map, p.x, p.y) === 'floor' &&
        !cabins.has(key(p.x, p.y)) &&
        spawns.every((s) => cheb(s, p) > 2),
    )
    .sort(
      (a, b) =>
        ((tileHash(a.x + 23, a.y + 31) ^ salt) % 1009) -
        ((tileHash(b.x + 23, b.y + 31) ^ salt) % 1009),
    )[0];
  if (odd) out[key(odd.x, odd.y)] = FLOOR_WEAR.carpet + CARPET_WEAR.odd;
  return out;
}

/**
 * How far up the stairwell each of its tiles is, 0 at the foot (the end
 * beside the ground floor) to 1 at the top (beside the first floor): its
 * steps from the foot over the whole flight's.
 */
function stairClimb(
  zones: Readonly<Record<string, Zone>>,
  stairs: ReadonlySet<string>,
): Record<string, number> {
  const touches = (k: string, zone: Zone) => {
    const [x = 0, y = 0] = k.split(',').map(Number);
    return STEPS.some(([dx, dy]) => zones[key(x + dx, y + dy)] === zone);
  };
  const feet = [...stairs].filter((k) => touches(k, 'ground'));
  const dist: Record<string, number> = {};
  const todo = [...feet];
  for (const k of feet) dist[k] = 0;
  for (let i = 0; i < todo.length; i++) {
    const k = todo[i] ?? '';
    const [x = 0, y = 0] = k.split(',').map(Number);
    for (const [dx, dy] of STEPS) {
      const n = key(x + dx, y + dy);
      if (stairs.has(n) && dist[n] === undefined) {
        dist[n] = (dist[k] ?? 0) + 1;
        todo.push(n);
      }
    }
  }
  const most = Math.max(1, ...Object.values(dist));
  const out: Record<string, number> = {};
  for (const k of stairs) out[k] = (dist[k] ?? 0) / most;
  return out;
}

/** The floor numbers on the stairwell's floor: 0 on the foot's tile, 1 on the top's. */
function floorNumbers(climb: Readonly<Record<string, number>>): LowerFloorsRoom['floorNumbers'] {
  const tiles = Object.entries(climb)
    .map(([k, c]) => {
      const [x = 0, y = 0] = k.split(',').map(Number);
      return { x, y, c };
    })
    .sort((a, b) => a.c - b.c || a.y - b.y || a.x - b.x);
  const foot = tiles[0];
  const top = tiles[tiles.length - 1];
  if (!foot || !top || foot === top) return [];
  return [
    { x: foot.x, y: foot.y, n: 0 },
    { x: top.x, y: top.y, n: 1 },
  ];
}

// ---- The lift and the chute ----

/**
 * Each lift stop's door frame: the walls beside its cabin on the side
 * toward the other stop (the shaft between them).
 */
export function liftDoors(map: LevelMap): LiftDoor[] {
  const lift = createLifts(map)[0];
  if (!lift) return [];
  const mid = (cabin: readonly GridPoint[]) => ({
    x: cabin.reduce((s, t) => s + t.x, 0) / cabin.length,
    y: cabin.reduce((s, t) => s + t.y, 0) / cabin.length,
  });
  const out: LiftDoor[] = [];
  lift.stops.forEach((cabin, floor) => {
    const here = mid(cabin);
    const others = lift.stops.filter((_, i) => i !== floor).map(mid);
    const there = others[0];
    if (!there) return;
    const dx = there.x - here.x;
    const dy = there.y - here.y;
    const side: Side =
      Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'front' : 'back';
    const { dx: ox, dy: oy } = OUT[side];
    const tiles = cabin
      .map((t) => ({ x: t.x + ox, y: t.y + oy }))
      .filter((p) => getTile(map, p.x, p.y) === 'wall')
      .filter((p, i, all) => all.findIndex((q) => q.x === p.x && q.y === p.y) === i)
      .sort((a, b) => a.y - b.y || a.x - b.x);
    if (tiles.length === 0) return;
    const axis = ox !== 0 ? 'z' : 'x';
    out.push({
      floor,
      tiles,
      mid: {
        x: tiles.reduce((s, t) => s + t.x, 0) / tiles.length,
        y: tiles.reduce((s, t) => s + t.y, 0) / tiles.length,
      },
      axis,
      side,
    });
  });
  return out;
}

/** The chute's hatches, each turned to face out of its room (over the shaft) with its MAIL plate. */
function chuteHatches(map: LevelMap): Hatch[] {
  const out: Hatch[] = [];
  for (const chute of createChutes(map))
    for (const [p, top] of [
      [chute.from, true],
      [chute.to, false],
    ] as const) {
      // The side facing out: where it's not the room's open floor (prefer the outside).
      const sides = (['left', 'right', 'back', 'front'] as const).filter((s) =>
        outside(map, p.x + OUT[s].dx, p.y + OUT[s].dy),
      );
      const away = (['left', 'right', 'back', 'front'] as const).find(
        (s) =>
          isOpen(map, p.x - OUT[s].dx, p.y - OUT[s].dy) &&
          !isOpen(map, p.x + OUT[s].dx, p.y + OUT[s].dy),
      );
      const side = sides[0] ?? away ?? 'front';
      out.push({ x: p.x, y: p.y, top, yaw: SIDE_YAW[side] });
    }
  return out;
}

/**
 * The welcome banner's wire: across the top of the shaft from the ground
 * floor's lift wall to the first floor's, half a tile behind the doors'
 * back end, so nothing hangs over a cabin.
 */
function banner(lifts: readonly LiftDoor[]): Banner | null {
  const a = lifts.find((l) => l.floor === 0);
  const b = lifts.find((l) => l.floor === 1);
  if (!a || !b || a.axis !== 'z' || b.axis !== 'z') return null;
  const ax = a.tiles[0]?.x ?? 0;
  const bx = b.tiles[0]?.x ?? 0;
  if (Math.abs(ax - bx) < 2) return null;
  const z = Math.min(...a.tiles.map((t) => t.y), ...b.tiles.map((t) => t.y)) - 0.38;
  return { x0: Math.min(ax, bx) + 0.3, x1: Math.max(ax, bx) - 0.3, y: WALL_HEIGHT + 0.62, z };
}

// ---- The walls ----

/**
 * What hangs on the walls. The ground floor's back wall is low (the post
 * room shows over it), so its pieces stand on it, facing the room: the
 * onboarding checklist nearest the back wall's middle, NEW STARTERS THIS
 * WAY nearest the lift. The crossed-out DESKS ARRIVING TUESDAY note on the
 * ground floor's one full face toward the camera (else a standing piece),
 * the clock on its left wall facing the room. Upstairs, YOTTA's vinyl from
 * 3-1 on the back face nearest the middle. In the stairwell (its block
 * walls' front faces): the fire exit at the foot, the stencilled 1 at the
 * top. The floor directories beside each lift door frame, facing the shaft.
 */
function placeWallArt(
  map: LevelMap,
  zones: Readonly<Record<string, Zone>>,
  block: ReadonlySet<string>,
  liftTiles: ReadonlySet<string>,
  lifts: readonly LiftDoor[],
): LowerArtSpot[] {
  const out: LowerArtSpot[] = [];
  const used = new Set<string>();
  const free = (p: GridPoint) => !used.has(key(p.x, p.y));
  const take = (art: LowerArt, p: GridPoint | undefined, yaw = 0) => {
    if (!p) return;
    used.add(key(p.x, p.y));
    out.push({ x: p.x, y: p.y, yaw, art });
  };
  const all = (ok: (x: number, y: number) => boolean) => {
    const got: GridPoint[] = [];
    for (let y = 0; y < map.height; y++)
      for (let x = 0; x < map.width; x++) if (ok(x, y)) got.push({ x, y });
    return got;
  };
  const best = (from: GridPoint[], score: (p: GridPoint) => number) =>
    [...from].filter(free).sort((a, b) => score(a) - score(b) || a.y - b.y || a.x - b.x)[0];
  // A full wall's front face: the outside or a wall behind, `zone` floor in front.
  const face = (x: number, y: number, zone: Zone) =>
    getTile(map, x, y) === 'wall' &&
    wallPiece(map, x, y) === 'wall' &&
    !isOpen(map, x, y - 1) &&
    getTile(map, x, y + 1) === 'floor' &&
    zones[key(x, y + 1)] === zone &&
    !liftTiles.has(key(x, y)) &&
    !block.has(key(x, y));
  // A low back wall: the outside behind, `zone` floor in front.
  const lowBack = (x: number, y: number, zone: Zone) =>
    getTile(map, x, y) === 'wall' &&
    wallPiece(map, x, y) === 'wall-front' &&
    outside(map, x, y - 1) &&
    getTile(map, x, y + 1) === 'floor' &&
    zones[key(x, y + 1)] === zone;
  const xs = (zone: Zone) =>
    Object.keys(zones)
      .filter((k) => zones[k] === zone)
      .map((k) => Number(k.split(',')[0]));
  const mid = (zone: Zone) => (Math.min(...xs(zone)) + Math.max(...xs(zone))) / 2;
  const gMid = mid('ground');
  const groundLift = lifts.find((l) => l.floor === 0);
  const firstLift = lifts.find((l) => l.floor === 1);

  // The plan: the onboarding checklist, standing mid back wall (else on a face).
  const backs = all((x, y) => lowBack(x, y, 'ground'));
  const faces = all((x, y) => face(x, y, 'ground'));
  take(
    'checklist',
    best(backs, (p) => Math.abs(p.x - gMid) + p.y * 3),
  );
  // NEW STARTERS THIS WAY nearest the lift.
  if (groundLift)
    take(
      'newStarters',
      best(backs, (p) => Math.abs(p.x - groundLift.mid.x) + Math.abs(p.y - groundLift.mid.y) * 0.5),
    );
  // DESKS ARRIVING TUESDAY on a full face facing the camera: the ground floor's, else the
  // stairwell's partitions (a floor's wall with the stairs in front).
  const notes = [
    ...faces,
    ...all((x, y) => face(x, y, 'stairs') && wallZone(zones, x, y).includes('ground')),
  ];
  take(
    'desksTuesday',
    best(notes, (p) => -p.y),
  );
  // The clock on a left wall of the ground floor, facing the room (+x): its face is seen.
  const leftFaces = all(
    (x, y) =>
      getTile(map, x, y) === 'wall' &&
      getTile(map, x + 1, y) === 'floor' &&
      zones[key(x + 1, y)] === 'ground' &&
      outside(map, x - 1, y) &&
      getTile(map, x, y - 1) === 'wall',
  );
  take(
    'clock',
    best(leftFaces, (p) => p.y),
    Math.PI / 2,
  );
  // Upstairs: YOTTA's vinyl, as on 3-1's floor, on the back face nearest the middle.
  const fMid = mid('first');
  take(
    'yotta',
    best(
      all((x, y) => face(x, y, 'first')),
      (p) => Math.abs(p.x - fMid) + p.y * 3,
    ),
  );
  // The stairwell's faces: block walls with stairs in front.
  const stairFaces = [...block]
    .map((k) => k.split(',').map(Number) as [number, number])
    .map(([x, y]) => ({ x, y }))
    .filter((p) => wallPiece(map, p.x, p.y) === 'wall' && zones[key(p.x, p.y + 1)] === 'stairs')
    .sort((a, b) => a.x - b.x || a.y - b.y);
  const lo = stairFaces[0];
  const hi = stairFaces[stairFaces.length - 1];
  if (lo && hi && hi.x - lo.x >= 2) {
    take('fireExit', lo);
    take('stencil1', hi);
  }
  // The floor directories: on the wall beside each lift run, facing the shaft.
  for (const [l, art] of [
    [groundLift, 'directory0'],
    [firstLift, 'directory1'],
  ] as const) {
    if (!l || l.axis !== 'z') continue;
    const x = l.tiles[0]?.x ?? 0;
    const last = Math.max(...l.tiles.map((t) => t.y));
    const p = { x, y: last + 1 };
    if (getTile(map, p.x, p.y) !== 'wall' || liftTiles.has(key(p.x, p.y))) continue;
    take(art, p, l.side === 'right' ? Math.PI / 2 : -Math.PI / 2);
  }
  return out.sort((a, b) => a.y - b.y || a.x - b.x);
}

/**
 * The head track along every partition top: not the stairwell's block,
 * not the lift frames; an arm toward each neighbouring partition.
 */
function headTracks(map: LevelMap, swaps: Readonly<Record<string, string>>): HeadTrack[] {
  const partition = (x: number, y: number) =>
    getTile(map, x, y) === 'wall' &&
    !(swaps[key(x, y)]?.startsWith('block') ?? false) &&
    !(swaps[key(x, y)]?.startsWith('lift') ?? false) &&
    !(swaps[key(x, y)]?.startsWith('balustrade') ?? false);
  const out: HeadTrack[] = [];
  for (let y = 0; y < map.height; y++)
    for (let x = 0; x < map.width; x++) {
      if (!partition(x, y)) continue;
      let arms = 0;
      PLUSH_EDGES.forEach((side, bit) => {
        const { dx, dy } = OUT[side];
        if (partition(x + dx, y + dy)) arms |= 1 << bit;
      });
      out.push({ x, y, low: wallPiece(map, x, y) === 'wall-front', arms });
    }
  return out;
}

/**
 * The stairwell's handrails: on every low block wall with stairs behind it
 * (along its top), and on the face of every full block wall with stairs in
 * front of it.
 */
function stairRails(
  map: LevelMap,
  block: ReadonlySet<string>,
  stairs: ReadonlySet<string>,
): LowerFloorsRoom['rails'] {
  const out: LowerFloorsRoom['rails'] = [];
  for (const k of block) {
    const [x = 0, y = 0] = k.split(',').map(Number);
    const piece = wallPiece(map, x, y);
    const post = (x + y) % 2 === 0;
    if (piece === 'wall-front' && stairs.has(key(x, y - 1)))
      out.push({ x, y, low: true, yaw: 0, post });
    else if (piece === 'wall-front' && stairs.has(key(x, y + 1)))
      out.push({ x, y, low: true, yaw: Math.PI, post });
    else if (piece === 'wall' && stairs.has(key(x, y + 1)))
      out.push({ x, y, low: false, yaw: 0, post });
  }
  return out.sort((a, b) => a.y - b.y || a.x - b.x);
}

// ---- The wall tops ----

/** What each floor stacks on its wall tops, cluster by cluster: the ground floor's flat-packs, the first floor's kit. */
const GROUND_CLUSTERS: readonly (readonly TopKind[])[] = [
  ['boxTower', 'boxBalloon'],
  ['boxPair', 'welcomePacks'],
  ['wrappedChairs', 'boxTower'],
  ['boxBalloon', 'boxPair'],
];
const FIRST_CLUSTERS: readonly (readonly TopKind[])[] = [
  ['boxedMonitors', 'laptops'],
  ['deskFan', 'monitorBox'],
  ['boxPair', 'boxedMonitors'],
];

/** Cluster anchors per floor at most. */
export const LOWER_CAP_CLUSTERS = { ground: 4, first: 3 } as const;

/**
 * Wall tops that can carry a pile: a floor's full walls, and its low back
 * walls with the outside behind (not the stairwell's block, not a lift
 * frame, not where a piece of art stands), with nothing open behind them
 * (it'd hide someone standing there), not in front of a lift frame (it'd
 * hide its indicator), not on the post room's or the loading bay's own
 * tiles. A wall between a floor and the stairs counts as the floor's.
 */
function topProps(
  map: LevelMap,
  zones: Readonly<Record<string, Zone>>,
  block: ReadonlySet<string>,
  liftTiles: ReadonlySet<string>,
  doors: readonly (Doorway | null)[],
  art: ReadonlySet<string>,
  salt: number,
  swaps: Readonly<Record<string, string>> = {},
): TopProp[] {
  const nearDoor = (x: number, y: number, reach: number) =>
    doors.some((d) => d?.tiles.some((t) => cheb(t, { x, y }) <= reach));
  const free = (x: number, y: number) =>
    getTile(map, x, y) === 'wall' &&
    (wallPiece(map, x, y) !== 'wall-front' || outside(map, x, y - 1)) &&
    !block.has(key(x, y)) &&
    !liftTiles.has(key(x, y)) &&
    !liftTiles.has(key(x, y - 1)) &&
    !art.has(key(x, y)) &&
    !isOpen(map, x, y - 1) &&
    !nearDoor(x, y, 0);
  const out: TopProp[] = [];
  for (const floor of ['ground', 'first'] as const) {
    const tiles: GridPoint[] = [];
    for (let y = 0; y < map.height; y++)
      for (let x = 0; x < map.width; x++) {
        if (!free(x, y)) continue;
        // Its floor: the one beside it (diagonals count, for a corner).
        let mine = false;
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) if (zones[key(x + dx, y + dy)] === floor) mine = true;
        let other = false;
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const z = zones[key(x + dx, y + dy)];
            if (z && z !== floor && z !== 'stairs') other = true;
          }
        if (mine && !other) tiles.push({ x, y });
      }
    // Along the floor's outline: back wall first (by x), then down the sides.
    const cx = tiles.reduce((s, t) => s + t.x, 0) / Math.max(1, tiles.length);
    const top = Math.min(...tiles.map((t) => t.y));
    const along = (p: GridPoint) => (p.y === top ? p.x : p.x < cx ? -100 - p.y : 100 + p.y);
    const sorted = [...tiles].sort((a, b) => along(a) - along(b));
    const n = LOWER_CAP_CLUSTERS[floor];
    const picked: GridPoint[] = [];
    for (let i = 0; i < n; i++) {
      const mark = ((i + 0.5) * sorted.length) / n - 0.5;
      let found: GridPoint | undefined;
      let d = Infinity;
      for (const [k, p] of sorted.entries()) {
        if (picked.some((q) => cheb(q, p) < 2)) continue;
        const dd = Math.abs(k - mark);
        if (dd < d - 1e-9) {
          d = dd;
          found = p;
        }
      }
      if (found) picked.push(found);
    }
    const clusters = floor === 'ground' ? GROUND_CLUSTERS : FIRST_CLUSTERS;
    const used = new Set(picked.map((p) => key(p.x, p.y)));
    picked
      .sort((a, b) => along(a) - along(b))
      .forEach((p, i) => {
        const kinds = clusters[i % clusters.length] ?? [];
        const turn = (q: GridPoint) => ((((tileHash(q.y + 3, q.x) ^ salt) >>> 2) % 5) - 2) * 0.1;
        const partner = STEPS.map(([dx, dy]) => ({ x: p.x + dx, y: p.y + dy, dx, dy })).find(
          (q) => tiles.some((t) => t.x === q.x && t.y === q.y) && !used.has(key(q.x, q.y)),
        );
        out.push({
          x: p.x,
          y: p.y,
          low: wallPiece(map, p.x, p.y) === 'wall-front',
          kind: kinds[0] ?? 'boxPair',
          toward: partner ? { dx: partner.dx, dy: partner.dy } : { dx: 0, dy: 0 },
          yaw: turn(p),
        });
        if (partner && kinds[1]) {
          used.add(key(partner.x, partner.y));
          out.push({
            x: partner.x,
            y: partner.y,
            low: wallPiece(map, partner.x, partner.y) === 'wall-front',
            kind: kinds[1],
            toward: { dx: -partner.dx, dy: -partner.dy },
            yaw: turn(partner),
          });
        }
      });
  }
  out.push(...landingKit(map, swaps, salt));
  return out;
}

/**
 * The first floor's kit waiting at the top of the stairs: on the stairwell's
 * block wall right in front of the glass balustrade (a wall behind it, so it
 * hides no one), low, leaning back against the glass, at both ends of the run.
 */
function landingKit(
  map: LevelMap,
  swaps: Readonly<Record<string, string>>,
  salt: number,
): TopProp[] {
  const run: GridPoint[] = [];
  for (let y = 0; y < map.height; y++)
    for (let x = 0; x < map.width; x++)
      if (
        getTile(map, x, y) === 'wall' &&
        (swaps[key(x, y - 1)]?.startsWith('balustrade') ?? false) &&
        (swaps[key(x, y)]?.startsWith('block') ?? false)
      )
        run.push({ x, y });
  if (run.length < 4) return [];
  run.sort((a, b) => a.y - b.y || a.x - b.x);
  // Both ends of each straight bit of the run (one tile on its own, once).
  const ends: GridPoint[] = [];
  run.forEach((p, i) => {
    const prev = run[i - 1];
    const next = run[i + 1];
    const startsBit = !prev || prev.y !== p.y || prev.x !== p.x - 1;
    const endsBit = !next || next.y !== p.y || next.x !== p.x + 1;
    if ((startsBit || endsBit) && !ends.includes(p)) ends.push(p);
  });
  const kinds: TopKind[] = ['kitLow', 'laptopsLow', 'kitLow'];
  return ends.map((p, i) => ({
    x: p.x,
    y: p.y,
    low: false,
    kind: kinds[i % kinds.length] ?? 'kitLow',
    toward: { dx: i === 0 ? 1 : -1, dy: -1 },
    yaw: ((((tileHash(p.x, p.y + 9) ^ salt) >>> 2) % 5) - 2) * 0.08,
  }));
}

/**
 * The ground floor's low walls dressed as story: on the front wall (low
 * walls with the outside in front, the floor behind, clear of the doors and
 * the stations) flat-packs two high, an open box of welcome packs and a
 * chair lying in its plastic, spread along it; on the left wall's low bit
 * between two stations (not the doors), flat-packs with a balloon.
 */
function frontProps(
  map: LevelMap,
  zones: Readonly<Record<string, Zone>>,
  block: ReadonlySet<string>,
  doors: readonly (Doorway | null)[],
): LowerFloorsRoom['fronts'] {
  const kinds: FrontKind[] = ['lowBoxes', 'lowPacks', 'lowChairs'];
  const doorTile = (x: number, y: number) =>
    doors.some((d) => d?.tiles.some((t) => t.x === x && t.y === y));
  const free: GridPoint[] = [];
  for (let y = 0; y < map.height; y++)
    for (let x = 1; x < map.width - 1; x++)
      if (
        getTile(map, x, y) === 'wall' &&
        wallPiece(map, x, y) === 'wall-front' &&
        !block.has(key(x, y)) &&
        getTile(map, x, y - 1) === 'floor' &&
        zones[key(x, y - 1)] === 'ground' &&
        outside(map, x, y + 1) &&
        !doors.some((d) => d?.tiles.some((t) => cheb(t, { x, y }) <= 1)) &&
        [-1, 0, 1].every((dx) => getTile(map, x + dx, y) === 'wall')
      )
        free.push({ x, y });
  const n = Math.min(kinds.length, free.length);
  const out: LowerFloorsRoom['fronts'] = [];
  for (let i = 0; i < n; i++) {
    const p = free[Math.round(((i + 0.5) * free.length) / n - 0.5)];
    if (!p || out.some((q) => q.x === p.x && q.y === p.y)) continue;
    out.push({
      x: p.x,
      y: p.y,
      kind: kinds[i] ?? 'lowBoxes',
      yaw: ((tileHash(p.x, p.y) % 5) - 2) * 0.08,
    });
  }
  // The left wall: a low wall with the outside left, the ground floor right, a station behind.
  const left: GridPoint[] = [];
  for (let y = 1; y < map.height - 1; y++)
    if (
      getTile(map, 0, y) === 'wall' &&
      wallPiece(map, 0, y) === 'wall-front' &&
      zones[key(1, y)] === 'ground' &&
      !doorTile(0, y - 1) &&
      getTile(map, 0, y - 1) !== 'floor'
    )
      left.push({ x: 0, y });
  const l = left[0];
  if (l) out.push({ x: l.x, y: l.y, kind: 'lowBalloon', yaw: Math.PI / 2 });
  return out;
}

// ---- The pendants ----

/** How far a pendant slides along its row at most to clear a station behind it, in what steps. */
const PENDANT_SHIFT_MAX = 2;
const PENDANT_SHIFT_STEP = 0.05;

const zonesCache = new WeakMap<LevelMap, Record<string, Zone>>();

/**
 * The run of a floor along its back wall that row `inside` is the first
 * row of: the columns of `zone` whose first plain floor tile is that row,
 * the run round `x`. Null when there's none there.
 */
function backRun(
  map: LevelMap,
  zones: Readonly<Record<string, Zone>>,
  inside: number,
  x: number,
): { x0: number; x1: number } | null {
  const tx = Math.round(x);
  const zone = zones[key(tx, inside)];
  if (!zone || zone === 'stairs') return null;
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
 * hung at `PENDANT_Y` just in front of the back wall of its floor's run
 * (the ground floor's too, which 3-1's `pendantFit` doesn't reach), slid
 * along the run clear of the stations in the back wall's row (it'd hide
 * them on screen) and inside the run, or left out (the light stays at the
 * spot).
 */
export function lowerPendantFit(at: Vec3, map: LevelMap): Vec3 | null {
  let zones = zonesCache.get(map);
  if (!zones) {
    zones = findZones(map);
    zonesCache.set(map, zones);
  }
  const inside = Math.floor(at.z + 0.5);
  const run = backRun(map, zones, inside, at.x);
  if (!run) return null;
  const back = inside - 1;
  const blocked: number[] = [];
  for (let x = 0; x < map.width; x++) {
    const t = getTile(map, x, back);
    if (t !== null && t !== 'wall' && t !== 'void' && t !== 'floor') blocked.push(x);
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
