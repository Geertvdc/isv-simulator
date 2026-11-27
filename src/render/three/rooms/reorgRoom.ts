/**
 * Where the reorg floor's story pieces go (the `reorg` wall theme, 4-3 The
 * Reorg; see `docs/plan/the-reorg-environment.md`): YOTTA Tower's boardroom
 * floor the morning after the synergy workshop, the consultants moving it
 * round twice before lunch. The map is read from its own tiles, through
 * `withoutReorgTiles` (partitions and rolling desks are floor here), with
 * every layout's marks (`map.phases`): the badge line is the row of the
 * turnstiles, the shipping lobby everything in front of it, the boardroom
 * the box round the meeting tiles; the rest is the work floor.
 *
 * From that: the work floor's stripped carpet (raised-floor access tiles
 * where it's pulled up in strips, ghost lines where yesterday's walls
 * stood, the consultants' floor tape round every layout's partitions with
 * the zones' names stencilled on it, grey corner marks where the desks stop,
 * castor tracks from desk to desk, a dropped lanyard, notes and a cable
 * coil by the walls, a BADGE IN mat at each turnstile), the good carpet
 * with its violet border in the boardroom, the lobby's clean stone with
 * its mats and the goods lift's threshold; walls in the tower's language
 * (art panels and glass along the back, the curtain wall with its blinds
 * at odd heights on the sides, the low sill onto the setback roofs, the
 * badge line's low stone wall, the lobby's piers); the consultants' art on
 * every back face and the lobby's; the move's kit in chunky clusters on the
 * wall tops and the sills, Segfault's MATRIX box among it; the handover
 * desk behind the inbox, the shredding console at the bin, the goods lift
 * at the ship; bronze uplighters on the back faces' tops (nothing hangs
 * over the floor). No three.js here, so it can be tested.
 */

import { type GridPoint, type LevelMap, getTile } from '../../../sim/level';
import { reorgTiles } from '../../../sim/reorgs';
import type { Vec3 } from '../../projection';
import { levelSalt, tileHash, wallPiece } from '../../mapShape';
import { FRONT_WALL_HEIGHT, WALL_HEIGHT } from '../layout';
import { FRONT_SILL_LOOKS, FRONT_SILL_Y, frontSillSwap } from './boardroomRoom';
import { type Doorway, type Side, findDoorways } from './stageSetRoom';
import {
  CURTAIN_LOOKS,
  OUT_YAW,
  PARTITION_LOOKS,
  curtainSwap,
  partitionSwap,
  pierSwap,
} from './towerRoom';

export type { Doorway, Side };

/** What part of the floor an open tile is in. */
export type ReorgZone = 'work' | 'boardroom' | 'badge' | 'lobby';

/** A floor tile's wear: `kind * REORG_KIND + flags`. */
export const REORG_KIND = 1 << 16;
export const REORG_WEAR = {
  /** The work floor's stripped carpet: `+` any `CARPET_WEAR` flags and a `stencil`. */
  carpet: 0,
  /** The good carpet: `+` its border's edges (1 −x, 2 +x, 4 −z, 8 +z). */
  good: REORG_KIND,
  /** The lobby's stone: `+` any `LOBBY_WEAR` flags. */
  lobby: 2 * REORG_KIND,
  /** A gap in the badge line: `+ 0` the staff door, `+ 1` a turnstile. */
  threshold: 3 * REORG_KIND,
} as const;

/**
 * Placed wear on the work floor's carpet: the carpet pulled up to show the
 * raised-floor access tiles, the floor tape along an edge (north −z, south
 * +z, west −x, east +x), a ghost line where yesterday's wall stood (along x
 * or along z), castor tracks (along x or z), corner marks where a desk stops,
 * litter dropped by a wall, a BADGE IN mat.
 */
export const CARPET_WEAR = {
  access: 1,
  tapeN: 2,
  tapeS: 4,
  tapeW: 8,
  tapeE: 16,
  ghostX: 32,
  ghostZ: 64,
  castorX: 128,
  castorZ: 256,
  xMark: 512,
  litter: 1024,
  mat: 16384,
  /** On an `access` tile: one panel lifted out and propped against its neighbour. */
  accessLift: 32768,
} as const;
/** The zone names stencilled on the tape: `stencil(n)` is added to the carpet's wear (n from 1). */
export const STENCIL_NAMES = ['SILO A', 'SQUAD 3', 'TRIBE', 'CHAPTER'] as const;
export const STENCIL_SHIFT = 11;
export const stencilWear = (n: number) => n << STENCIL_SHIFT;
export const stencilOf = (flags: number) => (flags >> STENCIL_SHIFT) & 7;

/** The lobby's stone: a BADGE IN mat, the goods lift's scuffed threshold along its +z edge. */
export const LOBBY_WEAR = { mat: 1, lift: 2 } as const;

/** What hangs on a face the camera sees. */
export type ReorgArt =
  | 'youAreHere'
  | 'knownBugs'
  | 'reorgPoster'
  | 'orgChart'
  | 'thePlan'
  | 'raci'
  | 'moveSchedule'
  | 'signOff'
  | 'hotDeskRules'
  | 'clock'
  | 'wrappedPortrait'
  | 'changePoster'
  | 'deskVinyl'
  | 'mindTurnstile'
  | 'lobbyDirectory';

/** Art on the +z face of wall (x, y), `span` tiles wide from there along +x. */
export interface ReorgArtSpot {
  x: number;
  y: number;
  art: ReorgArt;
  span: number;
}

/**
 * Art that hangs on the glass (the partition stays glass behind it); the
 * rest on a solid panel. None any more: the tower's glass reads as bright
 * as a station from the camera, so the back is all grey panel.
 */
export const ON_GLASS: ReadonlySet<ReorgArt> = new Set<ReorgArt>();

/**
 * The order the back wall's other faces are dressed in, left to right
 * (cycled past the end): `null` leaves a face a bare grey panel, so the
 * art that is there reads big.
 */
export const BACK_ART: readonly (ReorgArt | null)[] = [
  'youAreHere',
  'reorgPoster',
  'orgChart',
  null,
  'clock',
  null,
  'changePoster',
  'deskVinyl',
  null,
  'wrappedPortrait',
];

/** The move's kit on the wall tops and sills. */
export type ReorgTopKind =
  | 'crateStack'
  | 'crateOpen'
  | 'tapeRolls'
  | 'labelMaker'
  | 'lampWrapped'
  | 'orgCharts'
  | 'laptopCrate'
  | 'cableSpools'
  | 'whereDesk'
  | 'boxFragile'
  | 'monitorWrapped'
  | 'plantBox'
  | 'derekCrate'
  | 'archiveBox'
  | 'stretchWrap'
  | 'phoneBag'
  | 'miniFlip'
  | 'coffeeTray'
  | 'keyboards'
  | 'bubbleRoll'
  | 'moveTags'
  | 'tapeFlat'
  | 'tagSheets'
  | 'lanyardPile'
  | 'cupStack'
  | 'planFolder'
  | 'deckPrint';

/** A wall-top prop: its tile, slide along the wall (tiles), kind, turn, and what it stands on. */
export interface ReorgTop {
  x: number;
  y: number;
  dx: number;
  dy: number;
  kind: ReorgTopKind;
  yaw: number;
  h: number;
}

/** The boardroom's box: its tiles x0..x1, y0..y1. */
export interface Box {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

export interface ReorgRoom {
  zones: Record<string, ReorgZone>;
  /** The meeting tiles' box, and the box of everything that moves round it (partitions, desks, doors). */
  boardroom: Box;
  block: Box;
  /** The row of the badge turnstiles (the shipping lobby's back wall). */
  badgeRow: number;
  decos: Record<string, string>;
  floorWear: Record<string, number>;
  capProps: [];
  frontProps: [];
  swaps: Record<string, string>;
  outer: Record<string, Side>;
  art: ReorgArtSpot[];
  tops: ReorgTop[];
  /** Segfault's MATRIX box on a wall top: its tile and turn (the cat itself is a living scene piece). */
  segfault: { x: number; y: number; yaw: number } | null;
  handover: Doorway | null;
  shredder: { x: number; y: number; side: Side } | null;
  goodsLift: Doorway | null;
}

const STEPS = [
  [0, -1],
  [0, 1],
  [-1, 0],
  [1, 0],
] as const;
const SIDE_OF: Readonly<Record<string, Side>> = {
  '0,1': 'front',
  '0,-1': 'back',
  '-1,0': 'left',
  '1,0': 'right',
};

const key = (x: number, y: number) => `${x},${y}`;
const isWall = (map: LevelMap, x: number, y: number) => getTile(map, x, y) === 'wall';
function isOutside(map: LevelMap, x: number, y: number): boolean {
  const t = getTile(map, x, y);
  return t === null || t === 'void';
}
function isOpen(map: LevelMap, x: number, y: number): boolean {
  const t = getTile(map, x, y);
  return t !== null && t !== 'wall' && t !== 'void';
}
const isFloor = (map: LevelMap, x: number, y: number) => getTile(map, x, y) === 'floor';
/** A station or counter: a block that isn't a wall. */
function isBlock(map: LevelMap, x: number, y: number): boolean {
  const t = getTile(map, x, y);
  return t !== null && t !== 'wall' && t !== 'void' && t !== 'floor' && t !== 'gap';
}

/** Every layout's marks of `kind` (phase 1 first), each tile once. */
function marksOf(map: LevelMap, kind: string): GridPoint[] {
  const seen = new Set<string>();
  const out: GridPoint[] = [];
  const layouts = map.phases ?? [{ tiles: map.tiles, marks: map.marks }];
  for (const l of [{ tiles: map.tiles, marks: map.marks }, ...layouts])
    for (const m of l.marks)
      if (m.kind === kind && !seen.has(key(m.x, m.y))) {
        seen.add(key(m.x, m.y));
        out.push({ x: m.x, y: m.y });
      }
  return out;
}

/**
 * The plan of the reorg floor on `map` as `MapView` draws it (through
 * `withoutReorgTiles`, so the moving tiles read as floor), whichever
 * layout it starts from.
 */
export function reorgRoom(map: LevelMap): ReorgRoom {
  const salt = levelSalt(map);
  const boardroom = boxOf(map.meetingTiles);
  // The moving block round the boardroom: the moving tiles in its columns (a tile either side), not the arms out to the walls.
  const block = boxOf([
    ...reorgTiles(map)
      .map((i) => ({ x: i % map.width, y: Math.floor(i / map.width) }))
      .filter((p) => p.x >= boardroom.x0 - 1 && p.x <= boardroom.x1 + 1),
    ...map.meetingTiles,
  ]);
  const badgeRow = badgeRowOf(map);
  const zones = zonesOf(map, boardroom, badgeRow);
  const outer = outerWalls(map);
  const art = placeArt(map, outer, block);
  const tops = [...topProps(map, outer, badgeRow, salt), ...sillProps(map, outer, salt)];
  const segfault = segfaultSpot(map, outer, tops);
  return {
    zones,
    boardroom,
    block,
    badgeRow,
    decos: {},
    floorWear: floorWearOf(map, zones, block, salt),
    capProps: [],
    frontProps: [],
    swaps: wallSwaps(map, outer, art, badgeRow, salt),
    outer,
    art,
    tops: tops
      .filter((t) => !segfault || t.x !== segfault.x || t.y !== segfault.y)
      .sort((a, c) => a.y + a.dy - (c.y + c.dy) || a.x + a.dx - (c.x + c.dx)),
    segfault,
    handover: findDoorways(map, 'inbox')[0] ?? null,
    shredder: binSpot(map),
    goodsLift: findDoorways(map, 'ship')[0] ?? null,
  };
}

// ---- The zones ----

/** The row of the badge turnstiles, or past the map's front when there are none. */
function badgeRowOf(map: LevelMap): number {
  const gates = marksOf(map, 'turnstile');
  return gates.length > 0 ? Math.min(...gates.map((g) => g.y)) : map.height;
}

function boxOf(pts: readonly GridPoint[]): Box {
  if (pts.length === 0) return { x0: 0, x1: -1, y0: 0, y1: -1 };
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
}

const inBox = (b: Box, x: number, y: number) => x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1;

function zonesOf(map: LevelMap, b: Box, badgeRow: number): Record<string, ReorgZone> {
  const out: Record<string, ReorgZone> = {};
  for (let y = 0; y < map.height; y++)
    for (let x = 0; x < map.width; x++) {
      if (!isFloor(map, x, y)) continue;
      out[key(x, y)] =
        y > badgeRow ? 'lobby' : y === badgeRow ? 'badge' : inBox(b, x, y) ? 'boardroom' : 'work';
    }
  // Stations and the table take the zone of the floor next to them (the floor runs under them).
  for (let y = 0; y < map.height; y++)
    for (let x = 0; x < map.width; x++) {
      if (!isBlock(map, x, y)) continue;
      if (inBox(b, x, y)) {
        out[key(x, y)] = 'boardroom';
        continue;
      }
      const z = [
        [0, 1],
        [0, -1],
        [1, 0],
        [-1, 0],
      ]
        .map(([dx, dy]) => out[key(x + (dx ?? 0), y + (dy ?? 0))])
        .find((v) => v !== undefined && v !== 'badge');
      if (z) out[key(x, y)] = z;
    }
  return out;
}

// ---- The walls ----

/** Walls with the outside beyond them (front first: a corner shows its front), and the side it's on. */
function outerWalls(map: LevelMap): Record<string, Side> {
  const out: Record<string, Side> = {};
  for (let y = 0; y < map.height; y++)
    for (let x = 0; x < map.width; x++) {
      if (!isWall(map, x, y)) continue;
      for (const [dx, dy] of [
        [0, 1],
        [0, -1],
        [-1, 0],
        [1, 0],
      ] as const)
        if (isOutside(map, x + dx, y + dy)) {
          out[key(x, y)] = SIDE_OF[`${dx},${dy}`] ?? 'back';
          break;
        }
    }
  return out;
}

/** A face the camera sees with open floor in front of it: a full wall, the floor or a station below. */
function isFace(map: LevelMap, x: number, y: number): boolean {
  return isWall(map, x, y) && wallPiece(map, x, y) === 'wall' && isOpen(map, x, y + 1);
}

/** Swap names for this floor's own walls. */
export const SIDE_LOOKS = 5;
export const reorgSideSwap = (side: 'left' | 'right', look: number, low = false) =>
  `reorgSide:${side}:${low ? 'low' : 'full'}:${look}`;
export const BADGE_LOOKS = 3;
export const badgeLineSwap = (look: number) => `badgeLine:${look}`;
/** The back wall's art panel: the tower's solid panel in this floor's own, darker grey. */
export const REORG_PANEL_SWAP = 'reorgPanel';
/** Every swap name the plan can use beyond the tower's and 4-2's front sill. */
export const REORG_SWAPS: readonly string[] = [
  ...(['left', 'right'] as const).flatMap((side) =>
    [false, true].flatMap((low) =>
      Array.from({ length: SIDE_LOOKS }, (_, l) => reorgSideSwap(side, l, low)),
    ),
  ),
  ...Array.from({ length: BADGE_LOOKS }, (_, l) => badgeLineSwap(l)),
  REORG_PANEL_SWAP,
];

/**
 * How each wall is built: along the back a pale panel where art hangs and
 * the partitions' glass elsewhere (the staging area behind shows through);
 * the curtain wall with its blinds on the sides, cut down where a station
 * stands behind; the deep front sill where the setback roofs are, its
 * corners cut down too; the badge line's low stone wall between the floor
 * and the lobby; the lobby's side walls as piers; anything else glass.
 */
function wallSwaps(
  map: LevelMap,
  outer: Readonly<Record<string, Side>>,
  art: readonly ReorgArtSpot[],
  badgeRow: number,
  salt: number,
): Record<string, string> {
  const panel = new Set<string>();
  for (const a of art) {
    if (ON_GLASS.has(a.art)) continue;
    for (let i = 0; i < a.span; i++) panel.add(key(a.x + i, a.y));
  }
  const out: Record<string, string> = {};
  for (let y = 0; y < map.height; y++)
    for (let x = 0; x < map.width; x++) {
      if (!isWall(map, x, y)) continue;
      const k = key(x, y);
      const piece = wallPiece(map, x, y);
      const low = piece === 'wall-front';
      const look = ((tileHash(x + 29, y + 11) ^ salt) >>> 6) % CURTAIN_LOOKS;
      const side = outer[k];
      if (panel.has(k)) {
        // A lobby wall is a pier in the curtain wall's line; a back wall a pale panel in the glass.
        out[k] = y > badgeRow ? pierSwap(look) : REORG_PANEL_SWAP;
        continue;
      }
      if (side === 'front' || (low && y >= badgeRow && side)) {
        // The deep sill onto the setback roofs and in front of the lobby; the corners cut down too.
        out[k] = frontSillSwap(look % FRONT_SILL_LOOKS);
        continue;
      }
      if (low && y === badgeRow) {
        out[k] = badgeLineSwap(((tileHash(x + 3, y) ^ salt) >>> 4) % BADGE_LOOKS);
        continue;
      }
      if (side === 'left' || side === 'right') {
        const odd = ((tileHash(x + 7, y + 13) ^ salt) >>> 5) % SIDE_LOOKS;
        out[k] = reorgSideSwap(side, odd, low);
        continue;
      }
      if (side === 'back') {
        // A bare face is a plain grey panel too (the glass reads as bright as a station).
        const glass = art.some((q) => q.x === x && q.y === y && ON_GLASS.has(q.art));
        out[k] = !isFace(map, x, y)
          ? curtainSwap(look, 'x')
          : glass
            ? partitionSwap(look % PARTITION_LOOKS, 'x')
            : REORG_PANEL_SWAP;
        continue;
      }
      out[k] = low ? badgeLineSwap(look % BADGE_LOOKS) : partitionSwap(look % PARTITION_LOOKS, 'x');
    }
  return out;
}

/**
 * The faces the camera sees, all dressed: along the back, the KNOWN BUGS
 * board by the bug queue, the SIGN-OFF board by the review desk, THE PLAN
 * over the two faces nearest the boardroom's middle (one if that's all
 * there is), the rest in `BACK_ART`'s order; on the lobby's full walls,
 * MIND THE TURNSTILE on the left and the floor directory on the right.
 */
function placeArt(
  map: LevelMap,
  outer: Readonly<Record<string, Side>>,
  block: Box,
): ReorgArtSpot[] {
  const out: ReorgArtSpot[] = [];
  const back: GridPoint[] = [];
  const lobby: GridPoint[] = [];
  for (let y = 0; y < map.height; y++)
    for (let x = 0; x < map.width; x++) {
      if (!isFace(map, x, y)) continue;
      if (outer[key(x, y)] === 'back') back.push({ x, y });
      else if (y > badgeRowOf(map) && (outer[key(x, y)] === 'left' || outer[key(x, y)] === 'right'))
        lobby.push({ x, y });
    }
  back.sort((a, b) => a.y - b.y || a.x - b.x);
  const near = (p: GridPoint, tile: string) =>
    [-1, 1].some((d) => getTile(map, p.x + d, p.y) === tile);
  const used = new Set<string>();
  // THE PLAN behind the boardroom: the face pair straddling its middle.
  const mid = (block.x0 + block.x1) / 2;
  const pair = back.find(
    (p) =>
      back.some((q) => q.y === p.y && q.x === p.x + 1) &&
      Math.abs(p.x + 0.5 - mid) <= 0.5 &&
      !near(p, 'bugQueue') &&
      !near(p, 'review'),
  );
  if (pair) {
    out.push({ ...pair, art: 'thePlan', span: 2 });
    used.add(key(pair.x, pair.y)).add(key(pair.x + 1, pair.y));
  }
  let i = 0;
  for (const p of back) {
    if (used.has(key(p.x, p.y))) continue;
    const special: ReorgArt | null = near(p, 'bugQueue')
      ? 'knownBugs'
      : near(p, 'review')
        ? 'signOff'
        : null;
    const art: ReorgArt | null =
      special && !out.some((a) => a.art === special)
        ? special
        : (BACK_ART[i++ % BACK_ART.length] ?? null);
    if (art) out.push({ ...p, art, span: 1 });
  }
  for (const p of lobby)
    out.push({
      ...p,
      art: outer[key(p.x, p.y)] === 'left' ? 'mindTurnstile' : 'lobbyDirectory',
      span: 1,
    });
  return out.sort((a, b) => a.y - b.y || a.x - b.x);
}

// ---- The floor ----

/** The tiles a rolling desk stands on in each layout, in reading order. */
function desksByLayout(map: LevelMap): GridPoint[][] {
  const layouts = map.phases ?? [{ tiles: map.tiles, marks: map.marks }];
  return layouts.map((l) =>
    l.marks
      .filter((m) => m.kind === 'rollingDesk')
      .map((m) => ({ x: m.x, y: m.y }))
      .sort((p, q) => p.y - q.y || p.x - q.x),
  );
}

/** How many litter tiles each side of the boardroom gets. */
const LITTER_TILES = 3;

/**
 * Wear on every open tile: the work floor's carpet with the consultants'
 * tape round every layout's partitions (and the doors in their line), the
 * zones' names stencilled on it, grey corner marks where each desk stops, castor
 * tracks between where each desk stands in one layout and the next, the
 * carpet pulled up in a strip each side two tiles out from the moving
 * block (the access tiles showing), a ghost line down the column three
 * tiles out where yesterday's wall stood, litter by the walls, a BADGE IN
 * mat behind each turnstile; the good carpet in the boardroom with its
 * border; the lobby's stone with a mat in front of each turnstile and the
 * goods lift's threshold; thresholds in the badge line. Never anything but
 * plain carpet on a spawn.
 */
function floorWearOf(
  map: LevelMap,
  zones: Readonly<Record<string, ReorgZone>>,
  block: Box,
  salt: number,
): Record<string, number> {
  const out: Record<string, number> = {};
  const spawns = new Set([...map.spawns, ...map.managerSpawns].map((p) => key(p.x, p.y)));
  const gates = new Set(marksOf(map, 'turnstile').map((p) => key(p.x, p.y)));
  const b = boxOf(map.meetingTiles);
  for (const [k, z] of Object.entries(zones)) {
    const [x, y] = k.split(',').map(Number) as [number, number];
    if (z === 'boardroom') {
      const edges =
        (x === b.x0 ? 1 : 0) | (x === b.x1 ? 2 : 0) | (y === b.y0 ? 4 : 0) | (y === b.y1 ? 8 : 0);
      out[k] = REORG_WEAR.good + edges;
    } else if (z === 'lobby') out[k] = REORG_WEAR.lobby;
    else if (z === 'badge') out[k] = REORG_WEAR.threshold + (gates.has(k) ? 1 : 0);
    else out[k] = REORG_WEAR.carpet;
  }
  /** A carpet tile wear may be added to (never a spawn, never under a station). */
  const carpet = (x: number, y: number) => {
    const k = key(x, y);
    return out[k] === REORG_WEAR.carpet || (out[k] !== undefined && (out[k] ?? 0) < REORG_KIND)
      ? !spawns.has(k) && isFloor(map, x, y) && zones[k] === 'work'
      : false;
  };
  const add = (x: number, y: number, f: number) => {
    if (carpet(x, y)) out[key(x, y)] = (out[key(x, y)] ?? 0) | f;
  };
  // The tape round every layout's partitions and doors.
  const taped = new Set(
    [...marksOf(map, 'partition'), ...marksOf(map, 'meetingDoor')].map((p) => key(p.x, p.y)),
  );
  const tapedTiles: GridPoint[] = [];
  for (const k of taped) {
    const [x, y] = k.split(',').map(Number) as [number, number];
    tapedTiles.push({ x, y });
    const edge = (dx: number, dy: number) =>
      !taped.has(key(x + dx, y + dy)) && zones[key(x + dx, y + dy)] !== 'boardroom';
    let f = 0;
    if (edge(0, -1)) f |= CARPET_WEAR.tapeN;
    if (edge(0, 1)) f |= CARPET_WEAR.tapeS;
    if (edge(-1, 0)) f |= CARPET_WEAR.tapeW;
    if (edge(1, 0)) f |= CARPET_WEAR.tapeE;
    add(x, y, f);
  }
  // The zones' names on the tape: on the taped tiles farthest out, left to right, a few tiles apart.
  const named = tapedTiles
    .filter((p) => carpet(p.x, p.y))
    .map((p) => ({
      p,
      far:
        Math.abs(p.x - (block.x0 + block.x1) / 2) + ((tileHash(p.x + 3, p.y + 9) ^ salt) % 7) / 10,
    }))
    .sort((a, c) => c.far - a.far || a.p.y - c.p.y || a.p.x - c.p.x);
  const stencils: GridPoint[] = [];
  for (const { p } of named) {
    if (stencils.length >= STENCIL_NAMES.length) break;
    if (stencils.some((q) => Math.abs(q.x - p.x) + Math.abs(q.y - p.y) < 3)) continue;
    stencils.push(p);
  }
  stencils
    .sort((p, q) => p.x - q.x || p.y - q.y)
    .forEach((p, i) => {
      out[key(p.x, p.y)] = (out[key(p.x, p.y)] ?? 0) | stencilWear(i + 1);
    });
  // Grey corner marks where each desk stops, in any layout (a yellow X is the Moving track's: a desk arriving).
  for (const p of marksOf(map, 'rollingDesk')) add(p.x, p.y, CARPET_WEAR.xMark);
  // Castor tracks between each desk's stops, layout to layout (paired in reading order).
  const desks = desksByLayout(map);
  for (let l = 0; l < desks.length; l++) {
    const from = desks[l] ?? [];
    const to = desks[(l + 1) % desks.length] ?? [];
    from.forEach((s, i) => {
      const t = to[i];
      if (!t) return;
      // Only the first and last two tiles of each roll: the tracks fade where the castors ran smooth.
      const path: [number, number, number][] = [];
      let { x, y } = s;
      while (x !== t.x) {
        path.push([x, y, CARPET_WEAR.castorX]);
        x += Math.sign(t.x - x);
      }
      while (y !== t.y) {
        path.push([x, y, CARPET_WEAR.castorZ]);
        y += Math.sign(t.y - y);
      }
      path.forEach(([px, py, f], k) => {
        if (k < 2 || k >= path.length - 2) add(px, py, f);
      });
    });
  }
  // The carpet pulled up in a ragged strip each side, two tiles out from the block: down its
  // column, a tile stepping out (away from the block) on the way, one panel lifted and propped.
  for (const [x, out] of [
    [block.x0 - 2, -1],
    [block.x1 + 2, 1],
  ] as const) {
    const y0 = block.y0 + 2;
    const rows = Math.max(1, Math.min(3, block.y1 - block.y0 - 1));
    const strip: [number, number][] = [];
    for (let y = y0; y < y0 + rows; y++) strip.push([x, y]);
    if (rows >= 2) strip.splice(2, 0, [x + out, y0 + 1]);
    strip.forEach(([sx, sy], k) => {
      add(sx, sy, CARPET_WEAR.access | (k === 1 ? CARPET_WEAR.accessLift : 0));
    });
  }
  // A ghost line down the column three tiles out: yesterday's wall.
  for (const x of [block.x0 - 3, block.x1 + 3])
    for (let y = block.y0; y <= block.y1; y++)
      if (((out[key(x, y)] ?? 0) & (CARPET_WEAR.access | 0x1e)) === 0)
        add(x, y, CARPET_WEAR.ghostZ);
  // Litter dropped by the walls: a few tiles each side, never on tape or a walk.
  const mid = (block.x0 + block.x1) / 2;
  for (const left of [true, false]) {
    const spots = Object.keys(zones)
      .filter((k) => {
        const [x, y] = k.split(',').map(Number) as [number, number];
        if (zones[k] !== 'work' || x < mid !== left || !carpet(x, y) || out[k] !== 0) return false;
        return STEPS.some(([dx, dy]) => isWall(map, x + dx, y + dy));
      })
      .map((k) => {
        const [x, y] = k.split(',').map(Number) as [number, number];
        return { x, y, h: (tileHash(x + 5, y + 41) ^ salt) >>> 0 };
      })
      .sort((p, q) => p.h - q.h || p.y - q.y || p.x - q.x);
    for (const s of spots.slice(0, LITTER_TILES)) add(s.x, s.y, CARPET_WEAR.litter);
  }
  // A BADGE IN mat each side of each turnstile; the goods lift's threshold.
  for (const g of marksOf(map, 'turnstile')) {
    add(g.x, g.y - 1, CARPET_WEAR.mat);
    const k = key(g.x, g.y + 1);
    if (zones[k] === 'lobby' && !spawns.has(k)) out[k] = (out[k] ?? 0) | LOBBY_WEAR.mat;
  }
  for (let y = 0; y < map.height; y++)
    for (let x = 0; x < map.width; x++) {
      const k = key(x, y);
      if (zones[k] === 'lobby' && isFloor(map, x, y) && getTile(map, x, y + 1) === 'ship')
        out[k] = (out[k] ?? 0) | LOBBY_WEAR.lift;
    }
  // Stations stand on their zone's plain floor.
  for (let y = 0; y < map.height; y++)
    for (let x = 0; x < map.width; x++) {
      if (!isBlock(map, x, y)) continue;
      const z = zones[key(x, y)];
      out[key(x, y)] =
        z === 'boardroom' ? REORG_WEAR.good : z === 'lobby' ? REORG_WEAR.lobby : REORG_WEAR.carpet;
    }
  return out;
}

// ---- The wall tops ----

/** What each cluster of the move's kit piles up, in turn along the walls: no two clusters alike. */
export const REORG_CLUSTERS: readonly (readonly ReorgTopKind[])[] = [
  ['crateStack', 'tapeRolls', 'whereDesk'],
  ['orgCharts', 'lampWrapped', 'labelMaker'],
  ['laptopCrate', 'cableSpools', 'coffeeTray'],
  ['boxFragile', 'monitorWrapped', 'moveTags'],
  ['derekCrate', 'plantBox', 'keyboards'],
  ['archiveBox', 'stretchWrap', 'miniFlip'],
  ['crateOpen', 'phoneBag', 'bubbleRoll'],
];

/** The low kit on the sills, cluster by cluster: every piece at most `SILL_TOP_MAX` high. */
export const SILL_CLUSTERS: readonly (readonly ReorgTopKind[])[] = [
  ['tapeFlat', 'planFolder', 'cupStack'],
  ['tagSheets', 'lanyardPile', 'deckPrint'],
  ['planFolder', 'tapeFlat', 'tagSheets'],
  ['cupStack', 'deckPrint', 'lanyardPile'],
];
/** How tall the sills' kit stands at most (the front strip stays low). */
export const SILL_TOP_MAX = 0.25;
/** The sill board's top (4-2's front sill). */
export const SILL_Y = FRONT_SILL_Y;

/** How far apart the props of a cluster stand along their wall, in tiles. */
const CLUSTER_STEP = 0.36;

/** Whether a station or counter is next to (x, y) along the four steps. */
function besideBlock(map: LevelMap, x: number, y: number): boolean {
  return STEPS.some(([dx, dy]) => isBlock(map, x + dx, y + dy));
}

/**
 * The move's kit in chunky clusters of three on two tiles (two on one),
 * on the full walls' tops: never right beside a station (it would look
 * like something to pick up), never on glass (the side curtain wall is
 * open at the top), a tile's breather between clusters.
 */
function topProps(
  map: LevelMap,
  outer: Readonly<Record<string, Side>>,
  badgeRow: number,
  salt: number,
): ReorgTop[] {
  const ok = (x: number, y: number) =>
    isWall(map, x, y) &&
    wallPiece(map, x, y) !== 'wall-front' &&
    y < badgeRow &&
    outer[key(x, y)] === 'back' &&
    !besideBlock(map, x, y);
  const out: ReorgTop[] = [];
  let cluster = 0;
  for (let y = 0; y < map.height; y++)
    for (let x = 0; x < map.width; x++) {
      if (!ok(x, y) || ok(x - 1, y)) continue;
      const run: GridPoint[] = [];
      for (let u = x; ok(u, y); u++) run.push({ x: u, y });
      for (let i = 0; i < run.length;) {
        const span = Math.min(2, run.length - i);
        // Through every kind in turn, so the clusters share nothing until all have shown.
        const all = REORG_CLUSTERS.flat();
        const kinds = Array.from(
          { length: span === 1 ? 2 : 4 },
          (_, k) => all[(cluster + k) % all.length] ?? 'crateStack',
        );
        cluster += kinds.length;
        const mid = i + (span - 1) / 2;
        kinds.forEach((kind, k) => {
          const u = mid + (k - (kinds.length - 1) / 2) * CLUSTER_STEP * (span === 1 ? 1.1 : 1.25);
          const at = Math.min(i + span - 1, Math.max(i, Math.round(u)));
          const p = run[at];
          if (!p) return;
          const turn = ((((tileHash(p.y + 3 + k, p.x + 1) ^ salt) >>> 2) % 5) - 2) * 0.09;
          out.push({
            x: p.x,
            y: p.y,
            dx: Math.round((u - at) * 100) / 100,
            dy: 0,
            kind,
            yaw: OUT_YAW.back + turn,
            h: WALL_HEIGHT,
          });
        });
        i += span + 1;
      }
    }
  return out;
}

/** How far into the room from the sill tile's middle its kit stands (tiles): clear of the glass at its outer edge. */
const SILL_INSET = 0.1;

/**
 * Low kit on the deep sills (onto the setback roofs, and in front of the
 * lobby): a cluster on the end tiles of each run of plain sill and on every
 * second tile between, never beside a station, turned to the camera.
 */
function sillProps(map: LevelMap, outer: Readonly<Record<string, Side>>, salt: number): ReorgTop[] {
  const ok = (x: number, y: number) =>
    isWall(map, x, y) &&
    outer[key(x, y)] === 'front' &&
    wallPiece(map, x, y) === 'wall-front' &&
    !besideBlock(map, x, y) &&
    !STEPS.some(([dx, dy]) => isBlock(map, x + dx, y + dy - 1));
  const out: ReorgTop[] = [];
  let cluster = 0;
  for (let y = 0; y < map.height; y++)
    for (let x = 0; x < map.width; x++) {
      if (!ok(x, y) || ok(x - 1, y)) continue;
      const run: number[] = [];
      for (let u = x; ok(u, y); u++) run.push(u);
      const last = run.length - 1;
      const picks = run.filter((_, i) => i === last || (i % 2 === 0 && i !== last - 1));
      for (const u of picks) {
        const kinds = SILL_CLUSTERS[cluster % SILL_CLUSTERS.length] ?? [];
        cluster++;
        kinds.forEach((kind, k) => {
          const turn = ((((tileHash(u + 11 + k, y + 3) ^ salt) >>> 3) % 5) - 2) * 0.08;
          out.push({
            x: u,
            y,
            dx: (k - (kinds.length - 1) / 2) * 0.32,
            dy: -SILL_INSET,
            kind,
            yaw: turn,
            h: SILL_Y,
          });
        });
      }
    }
  return out;
}

/**
 * Segfault's MATRIX box: on the back wall's tops, the tile between the
 * last two clusters on the right (a breather tile, findable away from the
 * order cards), else the last free back-wall top.
 */
function segfaultSpot(
  map: LevelMap,
  outer: Readonly<Record<string, Side>>,
  tops: readonly ReorgTop[],
): { x: number; y: number; yaw: number } | null {
  const taken = new Set(tops.filter((t) => t.h === WALL_HEIGHT).map((t) => key(t.x, t.y)));
  const spots: GridPoint[] = [];
  for (let x = map.width - 1; x >= 0; x--)
    for (let y = 0; y < map.height; y++)
      if (
        isWall(map, x, y) &&
        outer[key(x, y)] === 'back' &&
        wallPiece(map, x, y) === 'wall' &&
        isOpen(map, x, y + 1) &&
        !besideBlock(map, x, y) &&
        x > map.width / 2
      )
        spots.push({ x, y });
  const free = spots.find((p) => !taken.has(key(p.x, p.y))) ?? spots[0];
  return free ? { ...free, yaw: -0.1 } : null;
}

// ---- The uplighters ----

/** How far an uplighter keeps from a wall-top prop's middle along its face (tiles), at best. */
const LIGHT_STEPS = [-0.3, -0.2, -0.1, 0, 0.1, 0.2, 0.3];

/**
 * The uplighter for the lamp spot `at` (see `RoomDressing.lamp.fit`): no
 * pendants and no wire (anything hung in the room lands on the players'
 * heads on screen), but a bronze wall-washer on the top of the dressed
 * back face nearest the spot, at the head track's front edge, slid along
 * the face clear of that tile's kit. Never on Segfault's tile (it would
 * hide MATRIX), never over the boardroom's block, only for spots in the
 * back half. Else none (the light itself stays at its spot).
 */
export function reorgLightFit(at: Vec3, plan: ReorgRoom): Vec3 | null {
  const { block, segfault } = plan;
  if (at.z > (block.y0 + block.y1) / 2 + 0.01) return null;
  if (at.x > block.x0 - 1 && at.x < block.x1 + 1) return null;
  const faces = plan.art.filter(
    (a) =>
      a.y < at.z &&
      plan.outer[key(a.x, a.y)] === 'back' &&
      !(segfault && segfault.x === a.x && segfault.y === a.y) &&
      (a.x < block.x0 - 0.5 || a.x > block.x1 + 0.5),
  );
  const tiles = faces.flatMap((a) =>
    Array.from({ length: a.span }, (_, i) => ({ ...a, x: a.x + i })),
  );
  const kit = (x: number, y: number) =>
    plan.tops.filter((t) => t.x === x && t.y === y && t.h === WALL_HEIGHT).map((t) => t.dx);
  // The nearest face, a tile with kit on it counting a little farther.
  const best = tiles
    .map((t) => ({ t, d: Math.abs(t.x - at.x) + (kit(t.x, t.y).length > 0 ? 0.6 : 0) }))
    .sort((p, q) => p.d - q.d || p.t.x - q.t.x)[0];
  if (!best) return null;
  const { x, y } = best.t;
  const dxs = kit(x, y);
  const slide =
    dxs.length === 0
      ? 0
      : ([...LIGHT_STEPS].sort(
          (p, q) =>
            Math.min(...dxs.map((d) => Math.abs(q - d))) -
              Math.min(...dxs.map((d) => Math.abs(p - d))) || Math.abs(p) - Math.abs(q),
        )[0] ?? 0);
  return { x: x + slide, y: WALL_HEIGHT, z: y + 0.5 };
}

// ---- The bin ----

/** The bin's tile and the side the outside is on (the shredding console stands there). */
function binSpot(map: LevelMap): { x: number; y: number; side: Side } | null {
  for (let y = 0; y < map.height; y++)
    for (let x = 0; x < map.width; x++) {
      if (getTile(map, x, y) !== 'bin') continue;
      for (const [dx, dy] of STEPS)
        if (isOutside(map, x + dx, y + dy)) return { x, y, side: SIDE_OF[`${dx},${dy}`] ?? 'left' };
      return { x, y, side: 'back' };
    }
  return null;
}

/** The front wall's height, for the tests. */
export const REORG_FRONT_H = FRONT_WALL_HEIGHT;
