/**
 * Where YOTTA Tower's story pieces go (the `tower` wall theme, 4-1 Back to
 * Back; see `docs/plan/back-to-back-environment.md`): one high floor of the
 * startup's own glass HQ in a heatwave. The map's floor splits at its
 * doorways (a floor tile in a wall line) into rooms: the meeting rooms (with
 * meeting tiles, named as the HUD names them), the corridor (the room the
 * ship opens off) and the offices (the rest, named "Unit 4" and "The
 * Biscuit" left to right). From that: deep slate carpet in the offices with
 * castor marks behind the keyboards, a walk line in from the door and
 * scuffs at the doors; a calmer carpet in each meeting room; pale terrazzo
 * in the corridor with a darker walk line down it; thresholds in every
 * doorway. Walls with the outside beyond them are the curtain wall (a sill
 * on the low front), the rest glass partitions (glass screens on the low
 * ones); the void notch in the back wall line is the lift lobby, so walls on
 * it are partitions. On the walls: the request portal over the inbox, the
 * release hatch and THE BIG RED BUTTON at the ship, the rooms' names in
 * vinyl, booking screens and glass door portals at the meeting doors, THE
 * PLAN framed like art, a room directory, the thermostat at 29°C and a
 * clock; The Garage dressed as a garage, Mom's portrait and her first
 * cheque; heatwave kit in clusters on the wall tops. Placed from the map's
 * own tiles, never at fixed coordinates. No three.js here, so it can be
 * tested.
 */

import { type GridPoint, type LevelMap, getTile, marksOf } from '../../../sim/level';
import { meetingRoomName } from '../../../sim/content';
import type { Vec3 } from '../../projection';
import { levelSalt, tileHash, wallPiece } from '../../mapShape';
import { WALL_HEIGHT } from '../layout';
import { type Doorway, type Side, findDoorways } from './stageSetRoom';

export type { Doorway, Side };

/** What kind of room an open tile is in. */
export type TowerZone = 'office' | 'meeting' | 'corridor';

/** The offices' names on their vinyl plates, left to right (rooms named after where YOTTA has been). */
export const OFFICE_NAMES: readonly string[] = ['UNIT 4', 'THE BISCUIT'];

/**
 * Wear on a floor tile (see `floorWear`), one number: the offices' carpet
 * first, then the meeting rooms', the corridor's terrazzo and the
 * thresholds in the doorways.
 */
export const TOWER_WEAR = {
  /** The offices' new deep slate carpet. */
  carpet: 0,
  /** Chair castors' arcs behind a keyboard. */
  castor: 1,
  /** The pile walked flat from the near door in. */
  walk: 2,
  /** Scuffs on the carpet just inside a door. */
  doorScuff: 3,
  /** Each meeting room's calmer carpet, by room (`meeting + room`, two rooms' worth). */
  meeting: 4,
  /** The corridor's terrazzo, plain. */
  terrazzo: 6,
  /** Its darker walk line along the tile's front edge, back edge, or down the middle. */
  walkFront: 7,
  walkBack: 8,
  walkBoth: 9,
  /** Heel scuffs by a door: `scuff + line` (line 0 none, 1 front, 2 back). */
  scuff: 10,
  /**
   * A doorway's threshold: `threshold + axis * 16 + neg * 4 + pos`, axis 0
   * when it's passed along z (−z side `neg`, +z side `pos`), 1 along x;
   * each side a `THRESHOLD_FLOORS` index.
   */
  threshold: 13,
} as const;
/** How many wear kinds there are. */
export const TOWER_WEAR_KINDS = TOWER_WEAR.threshold + 32;

/** The floors either side of a threshold. */
export const THRESHOLD_FLOORS = ['carpet', 'meeting0', 'meeting1', 'terrazzo'] as const;
export type ThresholdFloor = (typeof THRESHOLD_FLOORS)[number];

/** The threshold's wear for a doorway passed along `axis` between floors `neg` and `pos`. */
export function thresholdWear(axis: 'z' | 'x', neg: ThresholdFloor, pos: ThresholdFloor): number {
  return (
    TOWER_WEAR.threshold +
    (axis === 'z' ? 0 : 16) +
    THRESHOLD_FLOORS.indexOf(neg) * 4 +
    THRESHOLD_FLOORS.indexOf(pos)
  );
}

/** One room of the floor: its tiles (plain floor) and name. */
export interface TowerRoomArea {
  zone: TowerZone;
  /** The room's name (`OFFICE_NAMES`, the meeting room's HUD name in capitals), or '' (the corridor). */
  name: string;
  /** Its index among rooms of its zone, left to right (offices) or as the sim counts them (meeting rooms). */
  index: number;
  tiles: GridPoint[];
}

/** A floor tile in a wall line, between two rooms. */
export interface TowerDoorway {
  x: number;
  y: number;
  /** The way through it: along z (a door in an x wall line) or along x. */
  axis: 'z' | 'x';
  /** The room on its −z (or −x) side and on its +z (or +x) side, as indexes into `rooms`. */
  neg: number;
  pos: number;
  /** A meeting door (`d`): its light shows over it. */
  meeting: boolean;
}

/** What hangs on a wall face (each on the +z face of a wall tile, facing the room). */
export type TowerArt =
  | 'plan'
  | 'directory'
  | 'thermostat'
  | 'clock'
  | 'bookingHigh'
  | 'bookingLowLeft'
  | 'bookingLowRight';

/** How far each piece reaches either side of its spot (`roomModels/tower` builds to it). */
export const TOWER_ART_HALF: Readonly<Record<TowerArt, number>> = {
  plan: 0.48,
  directory: 0.36,
  thermostat: 0.2,
  clock: 0.16,
  bookingHigh: 0.14,
  bookingLowLeft: 0.48,
  bookingLowRight: 0.48,
};

export interface TowerArtSpot {
  x: number;
  y: number;
  art: TowerArt;
}

/** What stands on a wall top: the heatwave kit. */
export type TowerTopKind = 'deskFan' | 'portableAc' | 'binders' | 'monitorTurned' | 'acNote';

/**
 * A wall-top prop: its tile, how far it's slid along its wall from the
 * tile's middle (`dx`, `dy`, in tiles: a cluster packs two or three onto
 * two tiles), kind and turn (its back toward the outside beyond the wall).
 */
export interface TowerTop {
  x: number;
  y: number;
  dx: number;
  dy: number;
  kind: TowerTopKind;
  yaw: number;
}

/** Vinyl lettering on the glass screens of a run of low partitions: centred at (x, y), `width` wide. */
export interface TowerVinyl {
  x: number;
  y: number;
  text: string;
  width: number;
}

/** A meeting room's own pieces on its back wall's top (the side nearer the room). */
export type MeetingPiece = 'garagePhoto' | 'heritageCase' | 'rollUp' | 'momPortrait' | 'waterTray';

export interface TowerMeetingSpot {
  x: number;
  y: number;
  piece: MeetingPiece;
}

/**
 * A glass door portal round a meeting door: posts and a head under the door
 * light, and in a full wall line a glass leaf parked open beside it (in a
 * low one there's no wall to park it over).
 */
export interface TowerPortal {
  x: number;
  y: number;
  axis: 'z' | 'x';
  leaf: boolean;
}

export interface TowerRoom {
  /** The zone of every open tile (stations and counters too: the floor runs under them), keyed `x,y`. */
  zones: Record<string, TowerZone>;
  rooms: TowerRoomArea[];
  doorways: TowerDoorway[];
  /** Always empty: the floor's pieces are story pieces. */
  decos: Record<string, string>;
  /** Wear on every open tile (a `TOWER_WEAR`), keyed `x,y`. */
  floorWear: Record<string, number>;
  /** Always empty: the wall tops are dressed as story pieces (`tops`). */
  capProps: [];
  frontProps: [];
  /** Every wall built as another model: the curtain wall, its piers, solid panels, glass screens. */
  swaps: Record<string, string>;
  /** Walls with the outside beyond them (keyed `x,y`), and the side the outside is on. */
  outer: Record<string, Side>;
  art: TowerArtSpot[];
  tops: TowerTop[];
  vinyl: TowerVinyl[];
  meetingPieces: TowerMeetingSpot[];
  portals: TowerPortal[];
  /** The meeting tables (counters in a meeting room) and the hatch counters (in a wall line). */
  tables: GridPoint[];
  hatches: GridPoint[];
  /** The request portal over the inbox, the release hatch at the ship. */
  portal: Doorway | null;
  release: Doorway | null;
}

const STEPS = [
  [0, -1],
  [0, 1],
  [-1, 0],
  [1, 0],
] as const;
const SIDE_OF: Readonly<Record<string, Side>> = {
  '0,-1': 'back',
  '0,1': 'front',
  '-1,0': 'left',
  '1,0': 'right',
};
/** The turn that puts a model's back (−z) toward the outside on `side`. */
export const OUT_YAW: Readonly<Record<Side, number>> = {
  back: 0,
  front: Math.PI,
  left: Math.PI / 2,
  right: -Math.PI / 2,
};

const key = (x: number, y: number) => `${x},${y}`;
const cheb = (a: GridPoint, b: GridPoint) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

const isWall = (map: LevelMap, x: number, y: number) => getTile(map, x, y) === 'wall';
/** A station or counter: a block that isn't a wall. */
function isBlock(map: LevelMap, x: number, y: number): boolean {
  const t = getTile(map, x, y);
  return t !== null && t !== 'wall' && t !== 'void' && t !== 'floor';
}
/** Off the map or void. */
function isOutside(map: LevelMap, x: number, y: number): boolean {
  const t = getTile(map, x, y);
  return t === null || t === 'void';
}

export function towerRoom(map: LevelMap): TowerRoom {
  const salt = levelSalt(map);
  const lobby = lobbyVoid(map);
  const doorTiles = findDoorTiles(map);
  const { rooms, zones, roomOf } = findRooms(map, doorTiles);
  const doorways = doorTiles.map((d) => ({ ...d, ...doorSides(d, roomOf) }));
  const outer = outerWalls(map, lobby);
  const floorWear = floorWearOf(map, rooms, roomOf, doorways);
  const art = placeArt(map, rooms, roomOf, doorways, outer);
  const swaps = wallSwaps(map, outer, art, doorways, salt);
  const tables: GridPoint[] = [];
  const hatches: GridPoint[] = [];
  for (let y = 0; y < map.height; y++)
    for (let x = 0; x < map.width; x++) {
      if (getTile(map, x, y) !== 'counter') continue;
      const inLine =
        (isWall(map, x - 1, y) || isWall(map, x + 1, y)) &&
        !isWall(map, x, y - 1) &&
        !isWall(map, x, y + 1);
      const meeting = rooms[roomOfBlock(x, y, roomOf)]?.zone === 'meeting';
      if (meeting) tables.push({ x, y });
      else if (inLine) hatches.push({ x, y });
    }
  const { vinyl, meetingPieces } = roomLabels(map, rooms, doorways, outer);
  const taken = new Set([
    ...art.map((a) => key(a.x, a.y)),
    ...meetingPieces.map((p) => key(p.x, p.y)),
  ]);
  return {
    zones,
    rooms,
    doorways,
    decos: {},
    floorWear,
    capProps: [],
    frontProps: [],
    swaps,
    outer,
    art,
    tops: topProps(map, zones, doorways, outer, taken, salt),
    vinyl,
    meetingPieces,
    portals: doorways
      .filter((d) => d.meeting)
      .map((d) => ({
        x: d.x,
        y: d.y,
        axis: d.axis,
        leaf: d.axis === 'x' || wallPiece(map, d.x - 1, d.y) !== 'wall-front',
      })),
    tables,
    hatches,
    portal: findDoorways(map, 'inbox')[0] ?? null,
    release: findDoorways(map, 'ship')[0] ?? null,
  };
}

// ---- Rooms and doorways ----

/**
 * The lift lobby: void tiles in a notch of the back wall line (a void group
 * touching the map's top edge and no other edge). Walls on it are glass
 * partitions onto the lobby, not the curtain wall.
 */
export function lobbyVoid(map: LevelMap): Set<string> {
  const seen = new Set<string>();
  const out = new Set<string>();
  for (let y = 0; y < map.height; y++)
    for (let x = 0; x < map.width; x++) {
      if (getTile(map, x, y) !== 'void' || seen.has(key(x, y))) continue;
      const group: string[] = [];
      const todo = [[x, y] as const];
      seen.add(key(x, y));
      let top = false;
      let other = false;
      while (todo.length > 0) {
        const next = todo.pop();
        if (!next) break;
        const [cx, cy] = next;
        group.push(key(cx, cy));
        if (cy === 0) top = true;
        if (cx === 0 || cx === map.width - 1 || cy === map.height - 1) other = true;
        for (const [dx, dy] of STEPS) {
          const nx = cx + dx;
          const ny = cy + dy;
          if (getTile(map, nx, ny) !== 'void' || seen.has(key(nx, ny))) continue;
          seen.add(key(nx, ny));
          todo.push([nx, ny]);
        }
      }
      if (top && !other) for (const k of group) out.add(k);
    }
  return out;
}

/** Floor tiles in a wall line (walls either side across), with the way through them. */
function findDoorTiles(
  map: LevelMap,
): { x: number; y: number; axis: 'z' | 'x'; meeting: boolean }[] {
  const meetingDoors = new Set(marksOf(map, 'meetingDoor').map((m) => key(m.x, m.y)));
  const out: { x: number; y: number; axis: 'z' | 'x'; meeting: boolean }[] = [];
  for (let y = 0; y < map.height; y++)
    for (let x = 0; x < map.width; x++) {
      if (getTile(map, x, y) !== 'floor') continue;
      const meeting = meetingDoors.has(key(x, y));
      if (isWall(map, x - 1, y) && isWall(map, x + 1, y)) out.push({ x, y, axis: 'z', meeting });
      else if (isWall(map, x, y - 1) && isWall(map, x, y + 1))
        out.push({ x, y, axis: 'x', meeting });
    }
  return out;
}

/**
 * The rooms: the plain floor split at the doorways into 4-connected groups.
 * One with meeting tiles is a meeting room, one beside the ship the
 * corridor, the rest offices.
 */
function findRooms(
  map: LevelMap,
  doors: readonly GridPoint[],
): { rooms: TowerRoomArea[]; zones: Record<string, TowerZone>; roomOf: Map<string, number> } {
  const door = new Set(doors.map((d) => key(d.x, d.y)));
  const seen = new Set<string>();
  const groups: GridPoint[][] = [];
  for (let y = 0; y < map.height; y++)
    for (let x = 0; x < map.width; x++) {
      const k = key(x, y);
      if (getTile(map, x, y) !== 'floor' || door.has(k) || seen.has(k)) continue;
      seen.add(k);
      const group: GridPoint[] = [];
      const todo: GridPoint[] = [{ x, y }];
      for (let p = todo.pop(); p; p = todo.pop()) {
        group.push(p);
        for (const [dx, dy] of STEPS) {
          const q = { x: p.x + dx, y: p.y + dy };
          const qk = key(q.x, q.y);
          if (getTile(map, q.x, q.y) !== 'floor' || door.has(qk) || seen.has(qk)) continue;
          seen.add(qk);
          todo.push(q);
        }
      }
      groups.push(group.sort((a, b) => a.y - b.y || a.x - b.x));
    }
  const meetingTiles = map.meetingTiles.map((t) => key(t.x, t.y));
  const ships: GridPoint[] = [];
  for (let y = 0; y < map.height; y++)
    for (let x = 0; x < map.width; x++) if (getTile(map, x, y) === 'ship') ships.push({ x, y });
  const zoneOf = (g: GridPoint[]): TowerZone => {
    if (g.some((p) => meetingTiles.includes(key(p.x, p.y)))) return 'meeting';
    if (g.some((p) => ships.some((s) => Math.abs(s.x - p.x) + Math.abs(s.y - p.y) === 1)))
      return 'corridor';
    return 'office';
  };
  const meanX = (g: GridPoint[]) => g.reduce((s, p) => s + p.x, 0) / g.length;
  const firstMeeting = (g: GridPoint[]) =>
    g.find((p) => meetingTiles.includes(key(p.x, p.y))) ?? { x: 0, y: 0 };
  const sorted = groups.map((g) => ({ g, zone: zoneOf(g) }));
  const offices = sorted.filter((r) => r.zone === 'office').sort((a, b) => meanX(a.g) - meanX(b.g));
  const meetings = sorted
    .filter((r) => r.zone === 'meeting')
    .sort((a, b) => {
      const p = firstMeeting(a.g);
      const q = firstMeeting(b.g);
      return p.y - q.y || p.x - q.x;
    });
  const rooms: TowerRoomArea[] = [
    ...offices.map((r, i) => ({ zone: r.zone, name: OFFICE_NAMES[i] ?? '', index: i, tiles: r.g })),
    ...meetings.map((r, i) => ({
      zone: r.zone,
      name: meetingRoomName('back-to-back', i).toUpperCase(),
      index: i,
      tiles: r.g,
    })),
    ...sorted
      .filter((r) => r.zone === 'corridor')
      .map((r, i) => ({ zone: r.zone, name: '', index: i, tiles: r.g })),
  ];
  const roomOf = new Map<string, number>();
  const zones: Record<string, TowerZone> = {};
  rooms.forEach((r, i) => {
    for (const p of r.tiles) {
      roomOf.set(key(p.x, p.y), i);
      zones[key(p.x, p.y)] = r.zone;
    }
  });
  // Stations, counters and doorways take a neighbour's room (the floor runs under them).
  for (let y = 0; y < map.height; y++)
    for (let x = 0; x < map.width; x++) {
      const t = getTile(map, x, y);
      if (t === null || t === 'wall' || t === 'void' || roomOf.has(key(x, y))) continue;
      const r = roomOfBlock(x, y, roomOf);
      const room = rooms[r];
      if (room) zones[key(x, y)] = room.zone;
    }
  return { rooms, zones, roomOf };
}

/** The room of a block or doorway: its neighbour's (below first, then above, then the sides), or −1. */
function roomOfBlock(x: number, y: number, roomOf: Map<string, number>): number {
  for (const [dx, dy] of [
    [0, 1],
    [0, -1],
    [-1, 0],
    [1, 0],
  ] as const) {
    const r = roomOf.get(key(x + dx, y + dy));
    if (r !== undefined) return r;
  }
  return -1;
}

function doorSides(
  d: { x: number; y: number; axis: 'z' | 'x' },
  roomOf: Map<string, number>,
): { neg: number; pos: number } {
  const [dx, dy] = d.axis === 'z' ? [0, 1] : [1, 0];
  return {
    neg: roomOf.get(key(d.x - dx, d.y - dy)) ?? -1,
    pos: roomOf.get(key(d.x + dx, d.y + dy)) ?? -1,
  };
}

// ---- The walls ----

/** Walls with the outside beyond them (not the lobby notch), and which side it's on. */
function outerWalls(map: LevelMap, lobby: ReadonlySet<string>): Record<string, Side> {
  const out: Record<string, Side> = {};
  for (let y = 0; y < map.height; y++)
    for (let x = 0; x < map.width; x++) {
      if (!isWall(map, x, y)) continue;
      // Front first: on a corner the curtain wall faces the camera.
      for (const [dx, dy] of [
        [0, 1],
        [0, -1],
        [-1, 0],
        [1, 0],
      ] as const) {
        const nx = x + dx;
        const ny = y + dy;
        if (isOutside(map, nx, ny) && !lobby.has(key(nx, ny))) {
          out[key(x, y)] = SIDE_OF[`${dx},${dy}`] ?? 'back';
          break;
        }
      }
    }
  return out;
}

/** Wall looks, for the swap names. */
export const CURTAIN_LOOKS = 3;
export const PARTITION_LOOKS = 3;
export const curtainSwap = (look: number, along: 'x' | 'z' = 'x') => `curtain:${along}:${look}`;
export const sillSwap = (look: number, along: 'x' | 'z' = 'x') => `sill:${along}:${look}`;
export const pierSwap = (look: number) => `pier:${look}`;
export const partitionSwap = (look: number, along: 'x' | 'z' = 'x') => `partition:${along}:${look}`;
export const solidSwap = (along: 'x' | 'z' = 'x') => `solid:${along}`;
export const screenSwap = (along: 'x' | 'z', look: number) => `screen:${along}:${look}`;
/** Every swap name the plan can use. */
export const TOWER_SWAPS: readonly string[] = (['x', 'z'] as const).flatMap((a) => [
  ...Array.from({ length: CURTAIN_LOOKS }, (_, l) => curtainSwap(l, a)),
  ...Array.from({ length: CURTAIN_LOOKS }, (_, l) => sillSwap(l, a)),
  ...Array.from({ length: PARTITION_LOOKS }, (_, l) => partitionSwap(l, a)),
  ...Array.from({ length: PARTITION_LOOKS }, (_, l) => screenSwap(a, l)),
  solidSwap(a),
  ...(a === 'x' ? Array.from({ length: CURTAIN_LOOKS }, (_, l) => pierSwap(l)) : []),
]);

/**
 * How each wall is built, along its wall line: the curtain wall where the
 * outside is beyond it (a sill on the low front, a pale pier where art
 * hangs), a glass partition inside (a solid panel where art hangs, a glass
 * screen on every low one).
 */
function wallSwaps(
  map: LevelMap,
  outer: Readonly<Record<string, Side>>,
  art: readonly TowerArtSpot[],
  doorways: readonly TowerDoorway[],
  salt: number,
): Record<string, string> {
  const hung = new Set(art.map((a) => key(a.x, a.y)));
  // Along the wall line: on toward a wall, a station or a doorway in it.
  const inLine = (tx: number, ty: number, axis: 'z' | 'x') =>
    isWall(map, tx, ty) ||
    isBlock(map, tx, ty) ||
    doorways.some((d) => d.x === tx && d.y === ty && d.axis === axis);
  const out: Record<string, string> = {};
  for (let y = 0; y < map.height; y++)
    for (let x = 0; x < map.width; x++) {
      if (!isWall(map, x, y)) continue;
      const k = key(x, y);
      const low = wallPiece(map, x, y) === 'wall-front';
      const look = ((tileHash(x + 17, y + 5) ^ salt) >>> 6) % CURTAIN_LOOKS;
      const lowArt = art.some((a) => a.x === x && a.y === y && a.art.startsWith('bookingLow'));
      const side = outer[k];
      if (side) {
        // The curtain wall's line runs across the side its outside is on.
        const along = side === 'left' || side === 'right' ? 'z' : 'x';
        out[k] = low
          ? sillSwap(look, along)
          : hung.has(k)
            ? pierSwap(look)
            : curtainSwap(look, along);
        continue;
      }
      const along =
        !(inLine(x - 1, y, 'z') || inLine(x + 1, y, 'z')) &&
        (inLine(x, y - 1, 'x') || inLine(x, y + 1, 'x'))
          ? 'z'
          : 'x';
      const pl = look % PARTITION_LOOKS;
      out[k] =
        low || lowArt
          ? screenSwap(along, pl)
          : hung.has(k)
            ? solidSwap(along)
            : partitionSwap(pl, along);
    }
  return out;
}

/**
 * What hangs on the walls (on a wall tile's +z face, toward the open floor
 * in front of it): THE PLAN and the room directory on the full partitions
 * facing the corridor (the plan on the leftmost), a booking screen by each
 * meeting door (on the wall behind it when that's full height, else on the
 * glass of the low wall beside it), on the offices' back faces the
 * thermostat (the first office's first face) and a clock (the last
 * office's middle face).
 */
function placeArt(
  map: LevelMap,
  rooms: readonly TowerRoomArea[],
  roomOf: Map<string, number>,
  doorways: readonly TowerDoorway[],
  outer: Readonly<Record<string, Side>>,
): TowerArtSpot[] {
  const out: TowerArtSpot[] = [];
  const used = new Set<string>();
  const take = (art: TowerArt, p: GridPoint | undefined) => {
    if (!p || used.has(key(p.x, p.y))) return;
    used.add(key(p.x, p.y));
    out.push({ x: p.x, y: p.y, art });
  };
  const zoneIn = (x: number, y: number) => rooms[roomOf.get(key(x, y)) ?? -1]?.zone;
  const faces = (zone: TowerZone, outerOnly: boolean | null) => {
    const got: GridPoint[] = [];
    for (let y = 0; y < map.height; y++)
      for (let x = 0; x < map.width; x++)
        if (
          isWall(map, x, y) &&
          wallPiece(map, x, y) === 'wall' &&
          zoneIn(x, y + 1) === zone &&
          (outerOnly === null || Boolean(outer[key(x, y)]) === outerOnly)
        )
          got.push({ x, y });
    return got;
  };
  // Meeting doors first: their booking screens must sit right by them.
  for (const d of doorways.filter((w) => w.meeting)) {
    if (d.axis === 'x' && isWall(map, d.x, d.y - 1) && wallPiece(map, d.x, d.y - 1) === 'wall')
      take('bookingHigh', { x: d.x, y: d.y - 1 });
    else if (d.axis === 'z') {
      // The low wall beside the door that has no other door beside it.
      const lone = [-1, 1].find(
        (s) =>
          isWall(map, d.x + s, d.y) &&
          !doorways.some((o) => o !== d && o.y === d.y && o.x === d.x + 2 * s),
      );
      const s = lone ?? (isWall(map, d.x - 1, d.y) ? -1 : 1);
      // On the glass at the end nearest the door.
      take(s < 0 ? 'bookingLowRight' : 'bookingLowLeft', { x: d.x + s, y: d.y });
    }
  }
  const corridor = faces('corridor', false).sort((a, b) => a.x - b.x || a.y - b.y);
  take('plan', corridor[0]);
  take('directory', corridor[corridor.length - 1]);
  const offices = rooms.filter((r) => r.zone === 'office');
  const backFaces = (r: TowerRoomArea) =>
    faces('office', true)
      .filter((p) => r.tiles.some((t) => t.x === p.x && t.y === p.y + 1))
      .sort((a, b) => a.x - b.x);
  const first = offices[0];
  if (first) take('thermostat', backFaces(first)[0]);
  const last = offices[offices.length - 1];
  if (last && last !== first) {
    const f = backFaces(last);
    take('clock', f[Math.floor(f.length / 2)]);
  }
  return out.sort((a, b) => a.y - b.y || a.x - b.x);
}

// ---- The rooms' names and the meeting rooms' own pieces ----

/** Pixel letters are 4 columns a character (3 and a gap), less the last gap. */
const textCols = (s: string) => s.length * 4 - 1;

/**
 * The rooms' names in vinyl on their glass: each office's on the longest
 * run of low partitions on its front, the run nearest the map's middle; a
 * meeting room's on the glass in front of it if its front is partitions,
 * else on the middle of its back wall. Each meeting room's back wall top
 * carries its own story: The Garage (the first) a framed photo of Mom's
 * garage at one end, a heritage traffic cone in its glass case at the other
 * and a roll-up door printed on the glass between; Mom (the second) her portrait
 * and first cheque at one end, a jug of water and glasses at the other.
 */
function roomLabels(
  map: LevelMap,
  rooms: readonly TowerRoomArea[],
  doorways: readonly TowerDoorway[],
  outer: Readonly<Record<string, Side>>,
): { vinyl: TowerVinyl[]; meetingPieces: TowerMeetingSpot[] } {
  const vinyl: TowerVinyl[] = [];
  const pieces: TowerMeetingSpot[] = [];
  const lowPartition = (x: number, y: number) =>
    isWall(map, x, y) && wallPiece(map, x, y) === 'wall-front' && !outer[key(x, y)];
  const doorAt = (x: number, y: number) => doorways.some((d) => d.x === x && d.y === y);
  /** Maximal runs of low partitions along row `y` within columns x0..x1. */
  const runs = (y: number, x0: number, x1: number) => {
    const got: GridPoint[][] = [];
    let cur: GridPoint[] = [];
    for (let x = x0; x <= x1 + 1; x++) {
      if (x <= x1 && lowPartition(x, y)) cur.push({ x, y });
      else if (cur.length > 0) {
        got.push(cur);
        cur = [];
      }
    }
    return got;
  };
  const label = (run: GridPoint[], text: string) => {
    const a = run[0];
    const b = run[run.length - 1];
    if (!a || !b || !text) return;
    vinyl.push({ x: (a.x + b.x) / 2, y: a.y, text, width: run.length - 0.2 });
  };
  const mid = (map.width - 1) / 2;
  for (const room of rooms) {
    const xs = room.tiles.map((t) => t.x);
    const ys = room.tiles.map((t) => t.y);
    const x0 = Math.min(...xs);
    const x1 = Math.max(...xs);
    const front = Math.max(...ys) + 1;
    const back = Math.min(...ys) - 1;
    const frontRuns = runs(front, x0, x1).sort(
      (a, b) =>
        b.length - a.length || Math.abs((a[0]?.x ?? 0) - mid) - Math.abs((b[0]?.x ?? 0) - mid),
    );
    if (room.zone === 'office') {
      label(frontRuns[0] ?? [], room.name);
      continue;
    }
    if (room.zone !== 'meeting') continue;
    const backTiles = runs(back, x0, x1).flat();
    if (frontRuns[0] && frontRuns[0].length >= 3) label(frontRuns[0], room.name);
    else {
      // The back wall's tile between two doors, else its middle.
      const between = backTiles.find((p) => doorAt(p.x - 1, p.y) && doorAt(p.x + 1, p.y));
      const at = between ?? backTiles[Math.floor(backTiles.length / 2)];
      if (at) label([at], room.name);
    }
    const left = backTiles[0];
    const right = backTiles[backTiles.length - 1];
    if (room.index === 0) {
      if (left) pieces.push({ ...left, piece: 'garagePhoto' });
      if (right && right !== left) pieces.push({ ...right, piece: 'heritageCase' });
      for (const p of backTiles.slice(1, -1)) pieces.push({ ...p, piece: 'rollUp' });
    } else {
      if (right) pieces.push({ ...right, piece: 'momPortrait' });
      if (left && left !== right) pieces.push({ ...left, piece: 'waterTray' });
    }
  }
  return {
    vinyl: vinyl.sort((a, b) => a.y - b.y || a.x - b.x),
    meetingPieces: pieces.sort((a, b) => a.y - b.y || a.x - b.x),
  };
}

/** The pixel size of a name's letters to fill `width` (capped so short names don't shout). */
export function vinylPx(text: string, width: number): number {
  return Math.min(0.062, (width * 0.86) / textCols(text));
}

// ---- The floor ----

/** The `THRESHOLD_FLOORS` floor of a room. */
function floorOf(room: TowerRoomArea | undefined): ThresholdFloor {
  if (!room) return 'terrazzo';
  if (room.zone === 'office') return 'carpet';
  if (room.zone === 'meeting') return room.index === 0 ? 'meeting0' : 'meeting1';
  return 'terrazzo';
}

/**
 * Wear on every open tile: each room's own floor; in the offices castor
 * marks in front of the keyboards, the pile walked flat from the door
 * nearest the map's middle up to the back, scuffs just inside each door
 * (never on a spawn); in the corridor the walk line along its middle and
 * heel scuffs by the doors; a threshold in every doorway.
 */
function floorWearOf(
  map: LevelMap,
  rooms: readonly TowerRoomArea[],
  roomOf: Map<string, number>,
  doorways: readonly TowerDoorway[],
): Record<string, number> {
  const out: Record<string, number> = {};
  const spawns = new Set([...map.spawns, ...map.managerSpawns].map((p) => key(p.x, p.y)));
  const room = (x: number, y: number) => rooms[roomOf.get(key(x, y)) ?? -1];
  rooms.forEach((r) => {
    const base =
      r.zone === 'office'
        ? TOWER_WEAR.carpet
        : r.zone === 'meeting'
          ? TOWER_WEAR.meeting + Math.min(1, r.index)
          : TOWER_WEAR.terrazzo;
    for (const p of r.tiles) out[key(p.x, p.y)] = base;
  });
  // The corridor's walk line: along the seam of its rows.
  for (const r of rooms.filter((q) => q.zone === 'corridor'))
    for (const p of r.tiles) {
      const fwd = room(p.x, p.y + 1) === r;
      const bwd = room(p.x, p.y - 1) === r;
      // Where three rows run, only the middle one's middle.
      out[key(p.x, p.y)] =
        fwd && bwd
          ? TOWER_WEAR.walkBoth
          : fwd && !room(p.x, p.y + 2)
            ? TOWER_WEAR.walkFront
            : bwd && !room(p.x, p.y - 2)
              ? TOWER_WEAR.walkBack
              : TOWER_WEAR.terrazzo;
    }
  // Castor arcs in front of each office keyboard.
  for (let y = 0; y < map.height; y++)
    for (let x = 0; x < map.width; x++) {
      if (getTile(map, x, y) !== 'keyboard') continue;
      for (const [dx, dy] of STEPS) {
        const k = key(x + dx, y + dy);
        if (
          room(x + dx, y + dy)?.zone === 'office' &&
          !spawns.has(k) &&
          out[k] === TOWER_WEAR.carpet
        )
          out[k] = TOWER_WEAR.castor;
      }
    }
  // The walk line in from each office's door nearest the map's middle, up to the back.
  const mid = (map.width - 1) / 2;
  for (const r of rooms.filter((q) => q.zone === 'office')) {
    const door = doorways
      .filter((d) => d.axis === 'z' && (rooms[d.neg] === r || rooms[d.pos] === r))
      .sort((a, b) => Math.abs(a.x - mid) - Math.abs(b.x - mid) || a.x - b.x)[0];
    if (!door) continue;
    const step = rooms[door.neg] === r ? -1 : 1;
    for (let y = door.y + step; room(door.x, y) === r; y += step) {
      const k = key(door.x, y);
      if (!spawns.has(k) && out[k] === TOWER_WEAR.carpet) out[k] = TOWER_WEAR.walk;
    }
  }
  // Scuffs either side of each doorway.
  for (const d of doorways) {
    const [dx, dy] = d.axis === 'z' ? [0, 1] : [1, 0];
    for (const s of [-1, 1]) {
      const x = d.x + dx * s;
      const y = d.y + dy * s;
      const k = key(x, y);
      const r = room(x, y);
      if (!r || spawns.has(k)) continue;
      if (r.zone === 'office' && out[k] !== TOWER_WEAR.castor) out[k] = TOWER_WEAR.doorScuff;
      else if (r.zone === 'corridor') {
        const w = out[k];
        out[k] =
          TOWER_WEAR.scuff + (w === TOWER_WEAR.walkFront ? 1 : w === TOWER_WEAR.walkBack ? 2 : 0);
      }
    }
  }
  // Thresholds in the doorways; stations and counters on their room's floor.
  for (const d of doorways)
    out[key(d.x, d.y)] = thresholdWear(d.axis, floorOf(rooms[d.neg]), floorOf(rooms[d.pos]));
  for (let y = 0; y < map.height; y++)
    for (let x = 0; x < map.width; x++) {
      const k = key(x, y);
      if (out[k] !== undefined || !isBlock(map, x, y)) continue;
      const r = rooms[roomOfBlock(x, y, roomOf)];
      if (!r) continue;
      out[k] =
        r.zone === 'office'
          ? TOWER_WEAR.carpet
          : r.zone === 'meeting'
            ? TOWER_WEAR.meeting + Math.min(1, r.index)
            : TOWER_WEAR.terrazzo;
    }
  return out;
}

// ---- The wall tops ----

/** What each cluster of heatwave kit piles up, in turn along the walls. */
const CLUSTERS: readonly (readonly TowerTopKind[])[] = [
  ['portableAc', 'binders', 'deskFan'],
  ['binders', 'acNote', 'deskFan'],
  ['monitorTurned', 'deskFan'],
  ['portableAc', 'deskFan', 'binders'],
];

/** Wall-top props at most. */
export const TOWER_TOPS_MAX = 14;
/** How far apart the props of a cluster stand along their wall, in tiles. */
const CLUSTER_STEP = 0.56;
/** The breather left between clusters along a wall, in tiles. */
export const TOWER_TOPS_BREATHER = 2;

/**
 * Heatwave kit on the wall tops in clusters of two or three packed onto two
 * tiles along each wall line, a breather of two tiles between: on full
 * walls with nothing open behind (it'd hide someone standing there), not
 * within a tile of a station or counter (it'd look like something to pick
 * up), not beside a meeting room (it has its own story) or a meeting door
 * (its light), not in a doorway's own wall line beside it, not on the front
 * corners (the front strip stays low), not on walls with art.
 */
function topProps(
  map: LevelMap,
  zones: Readonly<Record<string, TowerZone>>,
  doorways: readonly TowerDoorway[],
  outer: Readonly<Record<string, Side>>,
  taken: ReadonlySet<string>,
  salt: number,
): TowerTop[] {
  const near = (x: number, y: number, test: (tx: number, ty: number) => boolean) => {
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) if (test(x + dx, y + dy)) return true;
    return false;
  };
  const free = (x: number, y: number) =>
    isWall(map, x, y) &&
    wallPiece(map, x, y) !== 'wall-front' &&
    !(getTile(map, x, y - 1) !== null && !isWall(map, x, y - 1) && !isOutside(map, x, y - 1)) &&
    !isOutside(map, x, y + 1) &&
    !near(x, y, (tx, ty) => isBlock(map, tx, ty)) &&
    !near(x, y, (tx, ty) => zones[key(tx, ty)] === 'meeting') &&
    !doorways.some(
      (d) =>
        (d.meeting && Math.abs(d.x - x) + Math.abs(d.y - y) === 1) ||
        (d.axis === 'z'
          ? d.y === y && Math.abs(d.x - x) === 1
          : d.x === x && Math.abs(d.y - y) === 1),
    ) &&
    !taken.has(key(x, y));
  const cands: GridPoint[] = [];
  for (let y = 0; y < map.height; y++)
    for (let x = 0; x < map.width; x++) if (free(x, y)) cands.push({ x, y });
  const has = (x: number, y: number) => cands.some((c) => c.x === x && c.y === y);
  // Runs down the columns first (the side walls), then along the rows.
  const runs: { tiles: GridPoint[]; axis: 'x' | 'y' }[] = [];
  const inRun = new Set<string>();
  for (const c of [...cands].sort((a, b) => a.x - b.x || a.y - b.y)) {
    if (inRun.has(key(c.x, c.y)) || has(c.x, c.y - 1)) continue;
    const run: GridPoint[] = [];
    for (let y = c.y; has(c.x, y); y++) run.push({ x: c.x, y });
    if (run.length < 2 && (has(c.x - 1, c.y) || has(c.x + 1, c.y))) continue;
    for (const p of run) inRun.add(key(p.x, p.y));
    runs.push({ tiles: run, axis: 'y' });
  }
  for (const c of [...cands].sort((a, b) => a.y - b.y || a.x - b.x)) {
    if (inRun.has(key(c.x, c.y)) || has(c.x - 1, c.y)) continue;
    const run: GridPoint[] = [];
    for (let x = c.x; has(x, c.y) && !inRun.has(key(x, c.y)); x++) run.push({ x, y: c.y });
    for (const p of run) inRun.add(key(p.x, p.y));
    runs.push({ tiles: run, axis: 'x' });
  }
  const out: TowerTop[] = [];
  let cluster = 0;
  const turn = (q: GridPoint, k: number) =>
    ((((tileHash(q.y + 3 + k, q.x + 1) ^ salt) >>> 2) % 5) - 2) * 0.06;
  for (const { tiles: run, axis } of runs) {
    // A cluster on two tiles (or the one left), then the breather.
    for (let i = 0; i < run.length && out.length < TOWER_TOPS_MAX;) {
      const span = Math.min(2, run.length - i);
      const kinds = (CLUSTERS[cluster % CLUSTERS.length] ?? []).slice(0, span === 1 ? 2 : 3);
      cluster++;
      // Centred on the span, CLUSTER_STEP apart.
      const mid = i + (span - 1) / 2;
      kinds.forEach((kind, k) => {
        if (out.length >= TOWER_TOPS_MAX) return;
        const u = mid + (k - (kinds.length - 1) / 2) * CLUSTER_STEP;
        const at = Math.min(i + span - 1, Math.max(i, Math.round(u)));
        const p = run[at];
        if (!p) return;
        const shift = Math.round((u - at) * 100) / 100;
        const side = outer[key(p.x, p.y)] ?? 'back';
        out.push({
          x: p.x,
          y: p.y,
          dx: axis === 'x' ? shift : 0,
          dy: axis === 'y' ? shift : 0,
          kind,
          yaw: OUT_YAW[side] + turn(p, k),
        });
      });
      i += span + TOWER_TOPS_BREATHER;
    }
  }
  return out.sort((a, b) => a.y + a.dy - (b.y + b.dy) || a.x + a.dx - (b.x + b.dx));
}

// ---- The pendants ----

/** Where the slim linear pendants hang: their height, how far in front of the back wall, their half length. */
export const TOWER_PENDANT_Y = WALL_HEIGHT + 0.5;
export const TOWER_PENDANT_FORWARD = 0.7;
export const TOWER_PENDANT_HALF = 0.42;

const roomsCache = new WeakMap<LevelMap, TowerRoom>();

/**
 * The linear pendant for the lamp spot `at` (see `RoomDressing.lamp.fit`):
 * only in a meeting room away from the front wall, one over its table.
 * Never in an office: hung anywhere near its back it lands on the back
 * row's stations on screen, so the light stays at the spot without a
 * fitting; nor in the corridor (its back is mid-room). Else none.
 */
export function towerPendantFit(at: Vec3, map: LevelMap): Vec3 | null {
  let plan = roomsCache.get(map);
  if (!plan) {
    plan = towerRoom(map);
    roomsCache.set(map, plan);
  }
  const p = plan;
  const tx = Math.round(at.x);
  const tz = Math.round(at.z);
  // The room under the spot, or the nearest room in its column.
  const roomAt = (x: number, y: number) =>
    p.rooms.findIndex((r) => r.tiles.some((t) => t.x === x && t.y === y));
  let ri = roomAt(tx, tz);
  for (let d = 1; ri < 0 && d <= 2; d++) ri = Math.max(roomAt(tx, tz + d), roomAt(tx, tz - d));
  const room = p.rooms[ri];
  if (!room || room.zone === 'corridor') return null;
  const ys = room.tiles.map((t) => t.y);
  // Never in a room that reaches the map's front (its back is too near the front wall).
  if (Math.max(...ys) >= map.height - 3) return null;
  if (room.zone !== 'meeting') return null;
  const table = p.tables.find((t) => room.tiles.some((q) => cheb(q, t) <= 1));
  const top = Math.min(...ys);
  if (!table) return null;
  // One per room, hung over the table a little in front of the back wall.
  return { x: table.x, y: TOWER_PENDANT_Y, z: top - 1 + TOWER_PENDANT_FORWARD + 0.4 };
}
