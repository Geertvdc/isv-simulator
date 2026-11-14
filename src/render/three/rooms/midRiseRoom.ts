/**
 * Where Middle Management's office-floor story pieces go (the `midRise`
 * wall theme): reception's pass-through at the inbox, what hangs on the
 * partitions (YOTTA's vinyl logo beside the inbox, Derek's org chart, the
 * clock, the fire exit, the QUIET ZONE sign, the room-booking panel), the
 * placed wear on the new carpet (the walkway from reception to the lifts,
 * chair mats and castor marks by the desks, one coffee stain, one tile from
 * another batch), the clusters on the partition tops with the one box of
 * new lanyards, the chairs tucked behind the lone desks, the linear LED
 * pendants along the back, and on the redesign draft Derek's corner office
 * (his executive desk and chair with Segfault asleep on it, the MONOLITH
 * certificate and lanyard, the sticky on the glass) and the meeting room's
 * TV. Placed from the map's own tiles, never at fixed coordinates. No
 * three.js here, so it can be tested.
 */

import { type GridPoint, type LevelMap, getTile } from '../../../sim/level';
import type { Vec3 } from '../../projection';
import { levelSalt, tileHash, wallPiece } from '../../mapShape';
import { WALL_HEIGHT } from '../layout';
import { type ManagerOffice, managerOffice } from './managerOffice';
import { type Doorway, type Side, findDoorways } from './stageSetRoom';

export type { Doorway, Side };

/** Wear on a carpet tile (see `floorWear`), one per tile; `roomModels/midRise` draws them. */
export const CARPET_WEAR = {
  none: 0,
  /** The lighter walkway band from reception to the lifts. */
  walkway: 1,
  /** A clear chair mat against one edge (toward the desk), castor tracks on it: `mat + edge`. */
  mat: 2,
  /** Castor marks: a few faint arcs where chairs roll. */
  castor: 6,
  /** A small coffee stain in one corner: `coffee + corner`. */
  coffee: 7,
  /** One tile from a different batch: a slightly different blue. */
  odd: 11,
} as const;
/** How many wear kinds there are. */
export const CARPET_WEAR_KINDS = CARPET_WEAR.odd + 1;

/** The edges a chair mat hugs, in the order its kind counts them. */
export const MAT_EDGES: readonly Side[] = ['back', 'front', 'left', 'right'];
/** The corners a stain can be in: back-left, back-right, front-left, front-right. */
export const STAIN_CORNERS = 4;

export const matWear = (edge: Side) => CARPET_WEAR.mat + MAT_EDGES.indexOf(edge);

/** What hangs on the partitions (each on one face of a wall tile). */
export type MidRiseArt =
  | 'yotta'
  | 'orgChart'
  | 'clock'
  | 'quietZone'
  | 'booking'
  | 'fireExit'
  | 'certificate'
  | 'lanyardHook'
  | 'statusSticky'
  | 'meetingTv';

/** How far each piece reaches either side of its spot (`roomModels/midRise` builds to it). */
export const MID_RISE_ART_HALF: Readonly<Record<MidRiseArt, number>> = {
  yotta: 0.92,
  orgChart: 0.4,
  clock: 0.15,
  quietZone: 0.3,
  booking: 0.16,
  fireExit: 0.2,
  certificate: 0.3,
  lanyardHook: 0.26,
  statusSticky: 0.12,
  meetingTv: 0.62,
};

/** The art that hangs on a solid plasterboard panel (its tiles built as `SOLID_SWAP`). */
const ON_SOLID: ReadonlySet<MidRiseArt> = new Set(['yotta', 'orgChart', 'booking', 'lanyardHook']);

/**
 * A piece of art on a wall: its spot (a tile's middle, or between two
 * tiles), the face it hangs on (`yaw` turns a model built facing +z onto
 * it: 0 the front face, π/2 a face toward +x, −π/2 one toward −x).
 */
export interface MidRiseArtSpot {
  x: number;
  y: number;
  yaw: number;
  art: MidRiseArt;
}

/** A chair tucked into the back part of a lone desk's tile; Derek's is the leather one. */
export interface DeskChair {
  x: number;
  y: number;
  exec: boolean;
}

export interface MidRiseRoom {
  /** The inbox framed as reception's pass-through. */
  reception: Doorway | null;
  /** Always empty: the floor's pieces are placed as story pieces (`wallArt`). */
  decos: Record<string, string>;
  wallArt: MidRiseArtSpot[];
  /** Wear on the carpet (a `CARPET_WEAR`), keyed `x,y`; bare tiles left out. */
  floorWear: Record<string, number>;
  /** The walkway's tiles from reception to the lifts, in order. */
  walkway: GridPoint[];
  /** Clusters on the outline's partition tops (see `RoomPlan.capProps`). */
  capProps: { x: number; y: number; slot: number; toward: { dx: number; dy: number } }[];
  /** Low clusters lying on the front wall (see `RoomPlan.frontProps`). */
  frontProps: { x: number; y: number; slot: number }[];
  /** The partitions behind the solid-backed art built as solid plasterboard (see `RoomPlan.swaps`). */
  swaps: Record<string, string>;
  /** The one box of new lanyards, on a partition top beside a cluster. */
  lanyards: GridPoint | null;
  /** The chairs at the lone desks. */
  chairs: DeskChair[];
  /** Derek's executive desk in his office (the draft), Segfault asleep on his chair; else null. */
  derekDesk: GridPoint | null;
  /** Derek's office on this map, if it's inside the map (see `managerOffice`). */
  office: ManagerOffice | null;
}

/** The swap for a solid plasterboard partition panel, in a look. */
export const SOLID_LOOKS = 2;
export const solidSwap = (look: number) => `solid:${look}`;

/** Cluster anchors per wall at most: along the back, on each side wall, on the low front wall. */
export const MID_RISE_CAP_CLUSTERS = { back: 4, side: 3, front: 3 } as const;
/** Chair mats at most, and castor-mark tiles. */
const MATS_MAX = 4;
const CASTORS_MAX = 3;

/** Where the pendant fittings hang (their origin, the fitting's middle): high, just in front of the back wall. */
export const PENDANT_Y = WALL_HEIGHT + 0.6;
export const PENDANT_FORWARD = 0.62;
/** Half a fitting's length (with a margin), and how far its wire is over it. */
export const PENDANT_HALF = 0.46;
export const PENDANT_WIRE = 0.3;

const OUT: Readonly<Record<Side, { dx: number; dy: number }>> = {
  back: { dx: 0, dy: -1 },
  front: { dx: 0, dy: 1 },
  left: { dx: -1, dy: 0 },
  right: { dx: 1, dy: 0 },
};

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

/** Whether (x, y) is within `reach` tiles of a door's tiles. */
function nearDoor(
  doors: readonly (Doorway | null)[],
  x: number,
  y: number,
  reach: number,
): boolean {
  return doors.some((d) => d?.tiles.some((t) => cheb(t, { x, y }) <= reach));
}

export function midRiseRoom(map: LevelMap): MidRiseRoom {
  const reception = findDoorways(map, 'inbox')[0] ?? null;
  const ships = findDoorways(map, 'ship');
  const doors = [reception, ...ships];
  const office = managerOffice(map);
  const officeTiles = new Set(office?.tiles ?? []);
  const meeting = new Set(map.meetingTiles.map((p) => key(p.x, p.y)));
  const wallArt = placeWallArt(map, reception, office);
  const swaps: Record<string, string> = {};
  const salt = levelSalt(map);
  for (const a of wallArt) {
    if (!ON_SOLID.has(a.art)) continue;
    const xs = a.art === 'yotta' ? [Math.floor(a.x), Math.ceil(a.x)] : [a.x];
    for (const x of new Set(xs))
      swaps[key(x, a.y)] = solidSwap(((tileHash(x + 7, a.y + 19) ^ salt) >>> 5) % SOLID_LOOKS);
  }
  Object.assign(swaps, glassScreens(map, office));
  const logoTiles = new Set(
    wallArt
      .filter((a) => a.art === 'yotta')
      .flatMap((a) => [Math.floor(a.x), Math.ceil(a.x)].map((x) => key(x, a.y))),
  );
  const walkway = findWalkway(map, reception, ships);
  const derekDesk = office ? officeDesk(map, office) : null;
  const caps = capProps(map, doors, reception, logoTiles);
  return {
    reception,
    decos: {},
    wallArt,
    floorWear: floorWear(map, walkway, officeTiles, meeting, derekDesk),
    walkway,
    capProps: caps.props,
    frontProps: frontProps(map, doors),
    swaps,
    lanyards: caps.lanyards,
    chairs: deskChairs(map, derekDesk),
    derekDesk,
    office,
  };
}

/** Derek's desk: the counter in his office nearest its back wall and middle. */
function officeDesk(map: LevelMap, office: ManagerOffice): GridPoint | null {
  const mid = (office.x0 + office.x1) / 2;
  return (
    office.tiles
      .map((k) => {
        const [x = 0, y = 0] = k.split(',').map(Number);
        return { x, y };
      })
      .filter((p) => getTile(map, p.x, p.y) === 'counter')
      .sort((a, b) => a.y - b.y || Math.abs(a.x - mid) - Math.abs(b.x - mid) || a.x - b.x)[0] ??
    null
  );
}

/**
 * Lone desks (a counter with no counter beside it, which `roomModels/midRise`
 * builds as a desk with its back part free): each gets its chair tucked in
 * there, Derek's the leather one.
 */
function deskChairs(map: LevelMap, derek: GridPoint | null): DeskChair[] {
  const out: DeskChair[] = [];
  const isCounter = (x: number, y: number) => getTile(map, x, y) === 'counter';
  for (let y = 0; y < map.height; y++)
    for (let x = 0; x < map.width; x++) {
      if (!isCounter(x, y)) continue;
      if (isCounter(x - 1, y) || isCounter(x + 1, y) || isCounter(x, y - 1) || isCounter(x, y + 1))
        continue;
      out.push({ x, y, exec: derek !== null && derek.x === x && derek.y === y });
    }
  return out;
}

/**
 * What hangs on the walls. The main floor's faces are front faces of full
 * partitions with floor in front and nothing open behind, outside Derek's
 * office: YOTTA's logo on the two faces right beside reception (on the side
 * with two free, toward the middle first), Derek's org chart nearest the
 * middle, the clock away from both, the fire exit toward a corner, the QUIET
 * ZONE sign as far from the rest as it can, the booking panel on a face by a
 * meeting-room door (else a free back face). In Derek's office: the
 * certificate and the lanyard hook on its side walls facing the camera, the
 * sticky by its door. In the meeting room: the TV on its side wall facing
 * the camera.
 */
function placeWallArt(
  map: LevelMap,
  reception: Doorway | null,
  office: ManagerOffice | null,
): MidRiseArtSpot[] {
  const officeTiles = new Set(office?.tiles ?? []);
  const meeting = new Set(map.meetingTiles.map((p) => key(p.x, p.y)));
  const face = (x: number, y: number) =>
    getTile(map, x, y) === 'wall' &&
    wallPiece(map, x, y) === 'wall' &&
    !isOpen(map, x, y - 1) &&
    getTile(map, x, y + 1) === 'floor' &&
    !officeTiles.has(key(x, y + 1)) &&
    !(office?.doors ?? []).some((d) => d.x === x && d.y === y + 1);
  const midX = (map.width - 1) / 2;
  const out: MidRiseArtSpot[] = [];
  const used = new Set<string>();
  const all: GridPoint[] = [];
  for (let y = 0; y < map.height; y++)
    for (let x = 0; x < map.width; x++) if (face(x, y)) all.push({ x, y });
  const free = () => all.filter((p) => !used.has(key(p.x, p.y)));
  const take = (art: MidRiseArt, p: GridPoint | undefined) => {
    if (!p) return null;
    used.add(key(p.x, p.y));
    out.push({ x: p.x, y: p.y, yaw: 0, art });
    return p;
  };
  const best = (from: GridPoint[], score: (p: GridPoint) => number) =>
    [...from].sort((a, b) => score(a) - score(b) || a.y - b.y || a.x - b.x)[0];
  // The back row counts most: a row lower costs.
  const row = (p: GridPoint) => p.y * 3;

  // YOTTA's logo on two faces right beside reception (only on the back or front edge).
  if (reception && (reception.side === 'back' || reception.side === 'front')) {
    const xs = reception.tiles.map((t) => t.x);
    const y = reception.mid.y;
    const sides = [
      [Math.max(...xs) + 1, Math.max(...xs) + 2],
      [Math.min(...xs) - 2, Math.min(...xs) - 1],
    ].sort((a, b) => Math.abs((a[0] ?? 0) - midX) - Math.abs((b[0] ?? 0) - midX));
    for (const [a = 0, b = 0] of sides) {
      if (!face(a, y) || !face(b, y)) continue;
      used.add(key(a, y));
      used.add(key(b, y));
      out.push({ x: (a + b) / 2, y, yaw: 0, art: 'yotta' });
      break;
    }
  }
  const art = () => out.map((a) => ({ x: a.x, y: a.y }));
  const gap = (p: GridPoint) =>
    Math.min(99, ...art().map((a) => Math.abs(a.x - p.x) + Math.abs(a.y - p.y) * 2));
  // Not right beside another piece where there is room.
  const roomy = (p: GridPoint) => (gap(p) <= 1 ? 50 : 0);
  take(
    'orgChart',
    best(free(), (p) => Math.abs(p.x - midX) + row(p) + roomy(p)),
  );
  take(
    'clock',
    best(free(), (p) => -Math.min(gap(p), 4) * 2 + Math.abs(p.x - midX) * 0.5 + row(p)),
  );
  take(
    'fireExit',
    best(free(), (p) => -Math.abs(p.x - midX) + row(p) + roomy(p)),
  );
  // The booking panel by a meeting-room door: a face whose floor in front is beside a door into the room.
  const byMeeting = free().filter((p) =>
    [-1, 1].some((dx) => {
      const q = { x: p.x + dx, y: p.y };
      if (getTile(map, q.x, q.y) !== 'floor' || !nearMeeting(map, meeting, q)) return false;
      return true;
    }),
  );
  if (meeting.size > 0)
    take(
      'booking',
      best(byMeeting, (p) => p.y + Math.abs(p.x - midX) * 0.1),
    );
  take(
    'quietZone',
    best(free(), (p) => -Math.min(gap(p), 6) * 3 + row(p)),
  );
  if (meeting.size === 0)
    take(
      'booking',
      best(free(), (p) => -Math.min(gap(p), 4) + row(p)),
    );

  // Derek's office: his lanyard on the side wall facing the camera, the certificate standing on
  // his office's low back wall (facing the room, clear of his desk), the sticky by his door.
  if (office) {
    const [first] = officeSideFaces(map, office.tiles, midX);
    if (first) out.push({ ...first, art: 'lanyardHook' });
    const desk = officeDesk(map, office);
    const midO = (office.x0 + office.x1) / 2;
    const back = office.y0 - 1;
    const spots: GridPoint[] = [];
    for (let x = office.x0; x <= office.x1; x++)
      if (
        getTile(map, x, back) === 'wall' &&
        wallPiece(map, x, back) === 'wall-front' &&
        isOpen(map, x, office.y0) &&
        (!desk || Math.abs(desk.x - x) >= 2)
      )
        spots.push({ x, y: back });
    const cert = best(spots, (p) => Math.abs(p.x - (desk ? (desk.x + midO) / 2 + 1 : midO)));
    if (cert) out.push({ x: cert.x, y: cert.y, yaw: 0, art: 'certificate' });
    for (const d of office.doors) {
      const w = { x: d.x, y: d.y - 1 };
      if (getTile(map, w.x, w.y) === 'wall' && wallPiece(map, w.x, w.y) === 'wall') {
        out.push({ x: w.x, y: w.y, yaw: 0, art: 'statusSticky' });
        break;
      }
    }
  }
  // The meeting room's TV: standing on its low back wall over the middle of the room, facing in.
  if (map.meetingTiles.length > 0) {
    const ys = map.meetingTiles.map((p) => p.y);
    const top = Math.min(...ys);
    const xs = map.meetingTiles.filter((p) => p.y === top).map((p) => p.x);
    const mx = (Math.min(...xs) + Math.max(...xs)) / 2;
    const low = (x: number) =>
      getTile(map, x, top - 1) === 'wall' && wallPiece(map, x, top - 1) === 'wall-front';
    if (low(Math.floor(mx)) && low(Math.ceil(mx)))
      out.push({ x: mx, y: top - 1, yaw: 0, art: 'meetingTv' });
  }
  return out.sort((a, b) => a.y - b.y || a.x - b.x);
}

/** Whether `p` is next to a door tile into the meeting room (a floor tile beside a meeting tile). */
function nearMeeting(map: LevelMap, meeting: ReadonlySet<string>, p: GridPoint): boolean {
  for (const [dx, dy] of [
    [0, -1],
    [0, 1],
    [1, 0],
    [-1, 0],
  ] as const)
    if (meeting.has(key(p.x + dx, p.y + dy))) return true;
  // A door tile one step away (the floor tile a door opens onto).
  for (const [dx, dy] of [
    [0, -1],
    [1, 0],
    [-1, 0],
  ] as const) {
    const q = { x: p.x + dx, y: p.y + dy };
    if (getTile(map, q.x, q.y) !== 'floor') continue;
    for (const [ex, ey] of [
      [0, -1],
      [1, 0],
      [-1, 0],
    ] as const)
      if (meeting.has(key(q.x + ex, q.y + ey))) return true;
  }
  return false;
}

/**
 * The side faces of full walls beside a room's tiles (keyed `x,y`) that the
 * camera sees: a wall to a tile's left facing +x, or to its right facing
 * −x, the one facing the map's middle most first, then down the room.
 */
function officeSideFaces(
  map: LevelMap,
  tiles: readonly string[],
  midX: number,
): { x: number; y: number; yaw: number }[] {
  const out: { x: number; y: number; yaw: number; view: number }[] = [];
  for (const k of tiles) {
    const [x = 0, y = 0] = k.split(',').map(Number);
    for (const d of [-1, 1]) {
      const wx = x + d;
      if (getTile(map, wx, y) !== 'wall' || wallPiece(map, wx, y) === 'wall-front') continue;
      // The face is at wx − d/2, facing −d (into the room).
      const fx = wx - d / 2;
      const view = (midX - fx) * -d;
      if (view <= 0.5) continue;
      out.push({ x: wx, y, yaw: d < 0 ? Math.PI / 2 : -Math.PI / 2, view });
    }
  }
  return out
    .sort((a, b) => b.view - a.view || a.y - b.y || a.x - b.x)
    .filter(
      (p, i, all) => all.findIndex((q) => q.x === p.x && q.y === p.y && q.yaw === p.yaw) === i,
    )
    .sort((a, b) => (Math.abs(b.view - a.view) > 0.01 ? b.view - a.view : a.y - b.y))
    .map(({ x, y, yaw }) => ({ x, y, yaw }));
}

/** The swap for a low glass screen on a low wall, along x, along z (map y) or both (a corner). */
export const glassSwap = (along: 'x' | 'z' | 'xz') => `glassLow:${along}`;

/**
 * The low walls round Derek's office and the meeting room (beside or
 * diagonal to their tiles or doors) carry a low frameless glass screen on
 * their top, so the rooms read as glass boxes without hiding anyone: along
 * the wall's run.
 */
function glassScreens(map: LevelMap, office: ManagerOffice | null): Record<string, string> {
  const room = new Set<string>([
    ...(office?.tiles ?? []),
    ...(office?.doors ?? []).map((d) => key(d.x, d.y)),
    ...map.meetingTiles.map((p) => key(p.x, p.y)),
  ]);
  const out: Record<string, string> = {};
  const isWall = (x: number, y: number) => getTile(map, x, y) === 'wall';
  for (let y = 0; y < map.height; y++)
    for (let x = 0; x < map.width; x++) {
      if (!isWall(x, y) || wallPiece(map, x, y) !== 'wall-front') continue;
      let near = false;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) if (room.has(key(x + dx, y + dy))) near = true;
      if (!near) continue;
      const ax = isWall(x - 1, y) || isWall(x + 1, y);
      const az = isWall(x, y - 1) || isWall(x, y + 1);
      out[key(x, y)] = glassSwap(ax && az ? 'xz' : az ? 'z' : 'x');
    }
  return out;
}

/**
 * The walkway from reception to the lifts: the fewest-turn shortest path
 * over open floor from the floor just inside the inbox to the floor just
 * inside a ship hatch (through doors, never into a room off the way).
 */
export function findWalkway(
  map: LevelMap,
  reception: Doorway | null,
  ships: readonly Doorway[],
): GridPoint[] {
  if (!reception || ships.length === 0) return [];
  const inside = (d: Doorway) =>
    d.tiles
      .map((t) => ({ x: t.x - OUT[d.side].dx, y: t.y - OUT[d.side].dy }))
      .filter((p) => getTile(map, p.x, p.y) === 'floor');
  const starts = inside(reception);
  const goals = new Set(ships.flatMap((s) => inside(s).map((p) => key(p.x, p.y))));
  if (starts.length === 0 || goals.size === 0) return [];
  // Dijkstra on (tile, heading): a step costs 10, a turn 1 more.
  const dirs = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ] as const;
  type Node = { x: number; y: number; d: number; cost: number; prev: string | null };
  const best = new Map<string, Node>();
  const queue: Node[] = [];
  for (const s of starts)
    for (let d = 0; d < 4; d++) {
      const n = { x: s.x, y: s.y, d, cost: d === 2 ? 0 : 1, prev: null };
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
    dirs.forEach(([dx, dy], d) => {
      const x = n.x + dx;
      const y = n.y + dy;
      if (getTile(map, x, y) !== 'floor' || map.meetingTiles.some((m) => m.x === x && m.y === y))
        return;
      const cost = n.cost + 10 + (d === n.d ? 0 : 1);
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

/**
 * Wear on the carpet, placed: the walkway band, chair mats on the floor
 * beside the desks (never on a spawn, nor on the walkway), castor marks
 * beside a few of them, one small coffee stain by a desk near the edge of
 * the room well away from the spawns, one tile from a different batch out
 * of the way. Nothing in the meeting room (its tint is the sim's marker).
 */
function floorWear(
  map: LevelMap,
  walkway: readonly GridPoint[],
  officeTiles: ReadonlySet<string>,
  meeting: ReadonlySet<string>,
  derekDesk: GridPoint | null,
): Record<string, number> {
  const salt = levelSalt(map);
  const out: Record<string, number> = {};
  for (const p of walkway) out[key(p.x, p.y)] = CARPET_WEAR.walkway;
  const spawn = new Set([...map.spawns, ...map.managerSpawns].map((p) => key(p.x, p.y)));
  const free = (x: number, y: number) =>
    getTile(map, x, y) === 'floor' &&
    out[key(x, y)] === undefined &&
    !spawn.has(key(x, y)) &&
    !meeting.has(key(x, y));
  const nearSpawn = (p: GridPoint, reach: number) => map.spawns.some((s) => cheb(s, p) <= reach);
  const isCounter = (x: number, y: number) => getTile(map, x, y) === 'counter';
  const hash = (p: GridPoint, s: number) => (tileHash(p.x + s, p.y + 31) ^ salt) % 1009;

  // Chair mats: on floor beside a desk run's side (not its ends), the edge toward the desk.
  const mats: { x: number; y: number; edge: Side; h: number }[] = [];
  for (let y = 0; y < map.height; y++)
    for (let x = 0; x < map.width; x++) {
      if (!free(x, y) || officeTiles.has(key(x, y))) continue;
      for (const edge of MAT_EDGES) {
        const { dx, dy } = OUT[edge];
        if (!isCounter(x + dx, y + dy)) continue;
        // Beside a run of desks, along it: a desk on the neighbouring tile of the run too.
        const along =
          dx === 0
            ? [1, -1].some((s) => isCounter(x + dx + s, y + dy))
            : [1, -1].some((s) => isCounter(x + dx, y + dy + s));
        if (!along) continue;
        mats.push({ x, y, edge, h: hash({ x, y }, 3) });
        break;
      }
    }
  mats.sort((a, b) => a.h - b.h);
  const placedMats: GridPoint[] = [];
  for (const m of mats) {
    if (placedMats.length >= MATS_MAX) break;
    if (placedMats.some((p) => cheb(p, m) < 2)) continue;
    out[key(m.x, m.y)] = matWear(m.edge);
    placedMats.push(m);
  }
  // Castor marks on a free tile beside a mat, a few.
  let castors = 0;
  for (const m of placedMats) {
    if (castors >= CASTORS_MAX) break;
    for (const [dx, dy] of [
      [0, 1],
      [0, -1],
      [1, 0],
      [-1, 0],
    ] as const) {
      const q = { x: m.x + dx, y: m.y + dy };
      if (!free(q.x, q.y)) continue;
      out[key(q.x, q.y)] = CARPET_WEAR.castor;
      castors++;
      break;
    }
  }
  // Derek's office: castor marks in front of his desk (he swivels a lot).
  if (derekDesk) {
    const q = { x: derekDesk.x, y: derekDesk.y + 1 };
    if (free(q.x, q.y)) out[key(q.x, q.y)] = CARPET_WEAR.castor;
  }

  // The coffee stain: a free tile by a desk with a wall beside it too (an edge), two from every
  // spawn, in the corner toward the desk.
  const stains: { x: number; y: number; corner: number; h: number }[] = [];
  for (let y = 0; y < map.height; y++)
    for (let x = 0; x < map.width; x++) {
      if (!free(x, y) || nearSpawn({ x, y }, 2)) continue;
      const desk = MAT_EDGES.find((e) => isCounter(x + OUT[e].dx, y + OUT[e].dy));
      if (!desk) continue;
      const wall = MAT_EDGES.some((e) => getTile(map, x + OUT[e].dx, y + OUT[e].dy) === 'wall');
      if (!wall) continue;
      const v = desk === 'front' ? 2 : 0;
      const s = desk === 'right' ? 1 : 0;
      stains.push({ x, y, corner: v + s, h: hash({ x, y }, 11) });
    }
  stains.sort((a, b) => a.h - b.h);
  const stain = stains[0];
  if (stain) out[key(stain.x, stain.y)] = CARPET_WEAR.coffee + stain.corner;

  // The odd-batch tile: a free tile two from every spawn, out of the walkway, by its hash.
  const odd: { x: number; y: number; h: number }[] = [];
  for (let y = 0; y < map.height; y++)
    for (let x = 0; x < map.width; x++)
      if (free(x, y) && !nearSpawn({ x, y }, 2) && !officeTiles.has(key(x, y)))
        odd.push({ x, y, h: hash({ x, y }, 23) });
  odd.sort((a, b) => a.h - b.h);
  const o = odd[0];
  if (o) out[key(o.x, o.y)] = CARPET_WEAR.odd;
  return out;
}

/**
 * Partition tops that can carry a cluster: full walls with nothing open
 * behind them (it'd hide someone standing there), not a door, clear of
 * reception's pass-through and of the logo.
 */
function capFree(
  map: LevelMap,
  doors: readonly (Doorway | null)[],
  reception: Doorway | null,
  logo: ReadonlySet<string>,
): (x: number, y: number) => boolean {
  return (x, y) =>
    getTile(map, x, y) === 'wall' &&
    wallPiece(map, x, y) !== 'wall-front' &&
    !isOpen(map, x, y - 1) &&
    !nearDoor(doors, x, y, 0) &&
    !(reception && nearDoor([reception], x, y, 1)) &&
    !logo.has(key(x, y));
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
 * Clusters on the partition tops, the rest bare as a breather: the free
 * tops sorted onto the back, left and right walls; on each up to
 * `MID_RISE_CAP_CLUSTERS` anchors spread along it, each with a partner on
 * the free tile beside it where there is one, leaning together into one
 * pile. The box of lanyards (once) on a free back tile beside a pile,
 * nearest reception.
 */
function capProps(
  map: LevelMap,
  doors: readonly (Doorway | null)[],
  reception: Doorway | null,
  logo: ReadonlySet<string>,
): { props: MidRiseRoom['capProps']; lanyards: GridPoint | null } {
  const free = capFree(map, doors, reception, logo);
  const walls: Record<'back' | 'left' | 'right', GridPoint[]> = { back: [], left: [], right: [] };
  for (let y = 0; y < map.height; y++)
    for (let x = 0; x < map.width; x++) {
      if (!free(x, y)) continue;
      const back =
        outside(map, x, y - 1) && !outside(map, x, y + 1) && getTile(map, x, y + 1) !== 'wall';
      const wall = back ? 'back' : x < map.width / 2 ? 'left' : 'right';
      walls[wall].push({ x, y });
    }
  const used = new Set<string>();
  const out: MidRiseRoom['capProps'] = [];
  let slot = 0;
  for (const wall of ['back', 'left', 'right'] as const) {
    const along = (p: GridPoint) => (wall === 'back' ? p.x * 4 + p.y : p.y * 4 + p.x);
    const tiles = walls[wall];
    const n = MID_RISE_CAP_CLUSTERS[wall === 'back' ? 'back' : 'side'];
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
  const rx = reception ? reception.mid.x : (map.width - 1) / 2;
  const lanyards =
    [...walls.back, ...walls.left, ...walls.right]
      .filter((p) => !used.has(key(p.x, p.y)))
      .filter((p) => out.some((q) => cheb(q, p) === 1))
      .sort(
        (a, b) =>
          (walls.back.includes(a) ? 0 : 50) - (walls.back.includes(b) ? 0 : 50) ||
          Math.abs(a.x - rx) - Math.abs(b.x - rx) ||
          a.y - b.y ||
          a.x - b.x,
      )[0] ?? null;
  return { props: out, lanyards: lanyards ? { x: lanyards.x, y: lanyards.y } : null };
}

/**
 * The low clusters on the outer front walls (low front wall pieces with the
 * outside in front), never by a door: up to `MID_RISE_CAP_CLUSTERS.front`,
 * spread along it.
 */
function frontProps(map: LevelMap, doors: readonly (Doorway | null)[]): MidRiseRoom['frontProps'] {
  const free: GridPoint[] = [];
  for (let y = 0; y < map.height; y++)
    for (let x = 1; x < map.width - 1; x++)
      if (
        getTile(map, x, y) === 'wall' &&
        wallPiece(map, x, y) === 'wall-front' &&
        isOpen(map, x, y - 1) &&
        outside(map, x, y + 1) &&
        !nearDoor(doors, x, y, 1)
      )
        free.push({ x, y });
  return spreadApart(free, (p) => p.x * 100 + p.y, MID_RISE_CAP_CLUSTERS.front, 2)
    .sort((a, b) => a.x - b.x)
    .map((p, slot) => ({ ...p, slot }));
}

/**
 * The runs of the room along its back walls, as the lamps see them (see
 * `lampSpots`): per column the first open row from row 1 within the top
 * 30% of the map, runs of neighbouring columns sharing it, at least three long.
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

/** How far a pendant slides along its row at most to clear a station behind it. */
const PENDANT_SHIFT_MAX = 1.5;
const PENDANT_SHIFT_STEP = 0.25;

/**
 * The linear pendant for the lamp spot `at` (see `RoomDressing.lamp.fit`):
 * hung at `PENDANT_Y` just in front of the back wall of its run, slid along
 * the run clear of the stations in the back wall's row (it'd hide them on
 * screen) and inside the run, or left out (the light stays at the spot).
 */
export function pendantFit(at: Vec3, map: LevelMap): Vec3 | null {
  const inside = Math.floor(at.z + 0.5);
  const back = inside - 1;
  const run = backRuns(map).find(
    (r) => r.inside === inside && at.x > r.x0 - 0.5 && at.x < r.x1 + 0.5,
  );
  if (!run) return null;
  const blocked: number[] = [];
  for (let x = 0; x < map.width; x++) {
    const t = getTile(map, x, back);
    if (t !== null && t !== 'wall' && t !== 'void' && t !== 'floor') blocked.push(x);
  }
  const ok = (x: number) =>
    x - PENDANT_HALF >= run.x0 - 0.5 + 0.1 &&
    x + PENDANT_HALF <= run.x1 + 0.5 - 0.1 &&
    blocked.every((bx) => Math.abs(bx - x) >= 0.5 + PENDANT_HALF - 0.15);
  for (let d = 0; d <= PENDANT_SHIFT_MAX + 1e-9; d += PENDANT_SHIFT_STEP)
    for (const x of d === 0 ? [at.x] : [at.x - d, at.x + d])
      if (ok(x)) return { x, y: PENDANT_Y, z: back + PENDANT_FORWARD };
  return null;
}
