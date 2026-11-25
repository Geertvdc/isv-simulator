/**
 * Where the boardroom floor's story pieces go (the `boardroom` wall theme,
 * 4-2 Synergy; see `docs/plan/synergy-environment.md`): YOTTA Tower's
 * expensive floor on the afternoon MONOLITH comes round for a synergy
 * workshop. The map is read from its own tiles: the boardroom is the box
 * round its moving tiles (`reorgTiles`: the folding walls and the rolling
 * table) and its meeting tiles; the line of wall stubs just behind it splits
 * the executive corridor (behind) from the hall; the hall left of the
 * boardroom is the dev side, right of it the ops side, in front of it the
 * front passage. From that: the good carpet with a violet border in the
 * boardroom (the folding walls' tiles are its edge), the tower's slate
 * carpet on the sides and the passage (castor arcs behind the keyboards, a
 * walk line along the passage to the ship, scuffs in the doorways, a stray
 * sticky note by a wall), terrazzo with a walk line in the corridor, a
 * threshold in each doorway of the stub line. Walls: glass partitions onto
 * the executive reception along the back (walnut panels where art hangs),
 * the curtain wall where the city is (a sill on the front), the stubs low
 * walnut with a stone cap, carrying the workshop's boards. Story: the
 * workshop's sticky-note wall over the inbox, the PARKED box at the bin,
 * the ops deploy desk at the ship, the KNOWN BUGS board by the bug queue,
 * the synergy matrix and the board's portraits on the back wall, Prod as
 * the parking lot beside a pocket, the name cards on a credenza, the
 * workshop kit in clusters on the wall tops, and slim pendants on a wire
 * along the back of each side. No three.js here, so it can be tested.
 */

import { type GridPoint, type LevelMap, getTile } from '../../../sim/level';
import { reorgTiles } from '../../../sim/reorgs';
import { levelSalt, tileHash, wallPiece } from '../../mapShape';
import { FRONT_WALL_HEIGHT, WALL_HEIGHT } from '../layout';
import { type Doorway, type Side, findDoorways } from './stageSetRoom';
import {
  CURTAIN_LOOKS,
  OUT_YAW,
  PARTITION_LOOKS,
  curtainSwap,
  partitionSwap,
  sillSwap,
} from './towerRoom';

export type { Doorway, Side };

/** What part of the floor an open tile is in. */
export type BoardroomZone = 'boardroom' | 'dev' | 'ops' | 'corridor' | 'passage';

/** The floors a threshold joins. */
export const BOARDROOM_FLOORS = ['slate', 'boardroom', 'terrazzo'] as const;
export type BoardroomFloor = (typeof BOARDROOM_FLOORS)[number];

/** Wear on a floor tile (see `floorWear`): one number per look. */
export const BOARDROOM_WEAR = {
  /** The sides' and the passage's warm slate carpet. */
  slate: 0,
  /** Chair castors' arcs behind a keyboard. */
  castor: 1,
  /** The pile walked flat along the passage (across x) and in from a doorway (along z). */
  walkX: 2,
  walkZ: 3,
  /** Scuffs on the carpet just inside a doorway. */
  doorScuff: 4,
  /** A stray sticky note or two by a wall (the workshop gets everywhere). */
  sticky: 5,
  /** The good carpet: `boardroom + edges`, edges a mask of its border band (1 −x, 2 +x, 4 −z, 8 +z). */
  boardroom: 6,
  /** The executive corridor's terrazzo. */
  terrazzo: 22,
  /** Its walk line along the tile's front edge, back edge, or down the middle. */
  walkFront: 23,
  walkBack: 24,
  walkBoth: 25,
  /** Heel scuffs by a doorway: `scuff + line` (line 0 none, 1 front, 2 back). */
  scuff: 26,
  /** A doorway's threshold: `threshold + neg * 3 + pos` (each a `BOARDROOM_FLOORS` index), passed along z. */
  threshold: 29,
} as const;
/** How many wear kinds there are. */
export const BOARDROOM_WEAR_KINDS = BOARDROOM_WEAR.threshold + 9;

/** The threshold's wear for a doorway between floors `neg` (behind) and `pos` (in front). */
export function boardroomThreshold(neg: BoardroomFloor, pos: BoardroomFloor): number {
  return (
    BOARDROOM_WEAR.threshold + BOARDROOM_FLOORS.indexOf(neg) * 3 + BOARDROOM_FLOORS.indexOf(pos)
  );
}

/** What hangs on a full wall's face the camera sees. */
export type BoardroomArt =
  | 'synergyMatrix'
  | 'portraitChair'
  | 'portraitMom'
  | 'boardPlaque'
  | 'agenda'
  | 'clock'
  | 'quietPlease'
  | 'visitors'
  | 'glassNotes'
  | 'execVinyl'
  | 'bugBoard'
  | 'opsScreen';

/** Art on a face: on the +z face of wall (x, y); a walnut panel behind it unless it's on the glass. */
export interface BoardroomArtSpot {
  x: number;
  y: number;
  art: BoardroomArt;
}

/** Art that hangs on the glass itself (the partition stays glass behind it). */
export const ON_GLASS: ReadonlySet<BoardroomArt> = new Set(['glassNotes', 'execVinyl', 'visitors']);

/** The order the back wall's faces are dressed in, left to right (cycled past the end). */
export const BACK_ART: readonly BoardroomArt[] = [
  'agenda',
  'glassNotes',
  'portraitChair',
  'portraitMom',
  'boardPlaque',
  'glassNotes',
  'execVinyl',
  'execVinyl',
  'synergyMatrix',
  'glassNotes',
  'clock',
  'quietPlease',
  'glassNotes',
  'visitors',
];

/** What stands on a run of the low wall stubs (a board leaned back on it, or a little scene). */
export type StubScene = 'ideasBoard' | 'howMightWe' | 'prod' | 'credenza' | 'stubNotes';

/** A stub scene over `span` stub tiles from (x, y) along +x. */
export interface StubSpot {
  x: number;
  y: number;
  span: number;
  scene: StubScene;
}

/** The workshop kit on the wall tops. */
export type BoardroomTopKind =
  | 'stickyPads'
  | 'markers'
  | 'laptop'
  | 'notebooks'
  | 'lanyards'
  | 'timer'
  | 'speaker'
  | 'deskFan'
  | 'binders'
  | 'dndTent'
  | 'carafe'
  | 'coffeeCups'
  | 'clicker'
  | 'confPhone'
  | 'paperRolls'
  | 'succulent'
  | 'dotStickers'
  | 'cardHolder'
  | 'deckPrintout'
  | 'stickyBox'
  | 'badgeBox'
  | 'tablet'
  | 'headset'
  | 'monitorTurned';

/** A wall-top prop: its tile, slide along the wall (tiles), kind, turn, and the wall top's height. */
export interface BoardroomTop {
  x: number;
  y: number;
  dx: number;
  dy: number;
  kind: BoardroomTopKind;
  yaw: number;
  h: number;
}

/** A row of slim pendants on a wire strung between two wall tops. */
export interface PendantRow {
  /** Where the wire runs (world z) and how high. */
  z: number;
  y: number;
  /** Its ends (world x) and the height of what each end's post stands on. */
  x0: number;
  x1: number;
  base0: number;
  base1: number;
  /** The pendants' middles along it (world x). */
  at: number[];
}

/** The boardroom's box: its tiles x0..x1, y0..y1. */
export interface Box {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

export interface BoardroomRoom {
  zones: Record<string, BoardroomZone>;
  boardroom: Box;
  /** The row of wall stubs between the corridor and the hall. */
  stubRow: number;
  /** The folding walls' storage pockets: the stub tiles next to each partition run's back end (the Walls track builds on them). */
  pockets: GridPoint[];
  /** The doorways in the stub line (floor tiles between two walls). */
  doorways: GridPoint[];
  decos: Record<string, string>;
  floorWear: Record<string, number>;
  capProps: [];
  frontProps: [];
  swaps: Record<string, string>;
  outer: Record<string, Side>;
  art: BoardroomArtSpot[];
  stubs: StubSpot[];
  tops: BoardroomTop[];
  pendants: PendantRow[];
  /** The workshop's sticky-note wall over the inbox, the PARKED box at the bin, the deploy desk at the ship. */
  ideasWall: Doorway | null;
  parked: { x: number; y: number; side: Side } | null;
  deployDesk: Doorway | null;
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

/**
 * The plan of the boardroom floor on `map` as `MapView` draws it (through
 * `withoutReorgTiles`, so the moving tiles read as floor), whichever
 * layout it starts from.
 */
export function boardroomRoom(map: LevelMap): BoardroomRoom {
  const salt = levelSalt(map);
  const boardroom = boardroomBox(map);
  const stubRow = boardroom.y0 - 1;
  const zones = zonesOf(map, boardroom, stubRow);
  const doorways: GridPoint[] = [];
  for (let x = 0; x < map.width; x++)
    if (isFloor(map, x, stubRow) && isWall(map, x - 1, stubRow) && isWall(map, x + 1, stubRow))
      doorways.push({ x, y: stubRow });
  // Doorways where the stub line has a two-wide gap too (the boardroom's back).
  for (let x = 0; x + 1 < map.width; x++)
    if (
      isFloor(map, x, stubRow) &&
      isFloor(map, x + 1, stubRow) &&
      isWall(map, x - 1, stubRow) &&
      isWall(map, x + 2, stubRow)
    )
      doorways.push({ x, y: stubRow }, { x: x + 1, y: stubRow });
  doorways.sort((a, b) => a.x - b.x);
  const pockets = pocketsOf(map, stubRow);
  const outer = outerWalls(map);
  const art = placeArt(map, outer, stubRow);
  const stubs = stubScenes(map, stubRow, pockets, boardroom);
  return {
    zones,
    boardroom,
    stubRow,
    pockets,
    doorways,
    decos: {},
    floorWear: floorWearOf(map, zones, boardroom, doorways),
    capProps: [],
    frontProps: [],
    swaps: wallSwaps(map, outer, art, stubRow, salt),
    outer,
    art,
    stubs,
    tops: topProps(map, boardroom, outer, stubRow, salt),
    pendants: pendantRows(map, boardroom, stubRow, stubs),
    ideasWall: findDoorways(map, 'inbox')[0] ?? null,
    parked: binSpot(map),
    deployDesk: findDoorways(map, 'ship')[0] ?? null,
  };
}

// ---- The zones ----

/** The box round the moving tiles and the meeting tiles. */
export function boardroomBox(map: LevelMap): Box {
  const pts: GridPoint[] = [
    ...reorgTiles(map).map((i) => ({ x: i % map.width, y: Math.floor(i / map.width) })),
    ...map.meetingTiles,
  ];
  if (pts.length === 0) return { x0: 0, x1: -1, y0: 0, y1: -1 };
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  return {
    x0: Math.min(...xs),
    x1: Math.max(...xs),
    y0: Math.min(...ys),
    y1: Math.max(...ys),
  };
}

const inBox = (b: Box, x: number, y: number) => x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1;

function zonesOf(map: LevelMap, b: Box, stubRow: number): Record<string, BoardroomZone> {
  const out: Record<string, BoardroomZone> = {};
  for (let y = 0; y < map.height; y++)
    for (let x = 0; x < map.width; x++) {
      if (!isFloor(map, x, y)) continue;
      out[key(x, y)] = inBox(b, x, y)
        ? 'boardroom'
        : y <= stubRow
          ? 'corridor'
          : y > b.y1
            ? 'passage'
            : x < b.x0
              ? 'dev'
              : 'ops';
    }
  // Stations take the zone of the floor in front of them (the floor runs under them).
  for (let y = 0; y < map.height; y++)
    for (let x = 0; x < map.width; x++) {
      if (!isBlock(map, x, y)) continue;
      const z = [
        [0, 1],
        [0, -1],
        [1, 0],
        [-1, 0],
      ]
        .map(([dx, dy]) => out[key(x + (dx ?? 0), y + (dy ?? 0))])
        .find((v) => v !== undefined);
      if (z) out[key(x, y)] = z;
    }
  return out;
}

/**
 * The storage pockets: for each run of moving tiles down a column (a side
 * of the folding walls), the stub-line wall tile right behind its back end.
 */
function pocketsOf(map: LevelMap, stubRow: number): GridPoint[] {
  const moving = new Set(reorgTiles(map).map((i) => key(i % map.width, Math.floor(i / map.width))));
  const out: GridPoint[] = [];
  for (let x = 0; x < map.width; x++)
    if (
      moving.has(key(x, stubRow + 1)) &&
      moving.has(key(x, stubRow + 2)) &&
      isWall(map, x, stubRow)
    )
      out.push({ x, y: stubRow });
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

/** The executive reception's glass: the back wall's tiles with open floor in front. */
function isReception(map: LevelMap, outer: Readonly<Record<string, Side>>, x: number, y: number) {
  return outer[key(x, y)] === 'back' && wallPiece(map, x, y) === 'wall' && isOpen(map, x, y + 1);
}

/** Swap names for this floor's own walls. */
export const walnutSwap = (along: 'x' | 'z' = 'x') => `walnut:${along}`;
export const STUB_LOOKS = 3;
export const stubSwap = (look: number) => `stub:${look}`;
/** Every swap name the plan can use beyond the tower's own. */
export const BOARDROOM_SWAPS: readonly string[] = [
  walnutSwap('x'),
  walnutSwap('z'),
  ...Array.from({ length: STUB_LOOKS }, (_, l) => stubSwap(l)),
];

/**
 * How each wall is built: on the back the reception's glass partitions
 * (a walnut panel where art hangs), elsewhere the curtain wall where the
 * outside is (a sill on the low front), the stubs low walnut, the full
 * inner walls a walnut panel.
 */
function wallSwaps(
  map: LevelMap,
  outer: Readonly<Record<string, Side>>,
  art: readonly BoardroomArtSpot[],
  stubRow: number,
  salt: number,
): Record<string, string> {
  const panel = new Set(art.filter((a) => !ON_GLASS.has(a.art)).map((a) => key(a.x, a.y)));
  const out: Record<string, string> = {};
  for (let y = 0; y < map.height; y++)
    for (let x = 0; x < map.width; x++) {
      if (!isWall(map, x, y)) continue;
      const k = key(x, y);
      const low = wallPiece(map, x, y) === 'wall-front';
      const look = ((tileHash(x + 23, y + 7) ^ salt) >>> 6) % CURTAIN_LOOKS;
      if (isReception(map, outer, x, y)) {
        out[k] = panel.has(k) ? walnutSwap('x') : partitionSwap(look % PARTITION_LOOKS, 'x');
        continue;
      }
      const side = outer[k];
      if (side) {
        const along = side === 'left' || side === 'right' ? 'z' : 'x';
        out[k] = low ? sillSwap(look, along) : curtainSwap(look, along);
        continue;
      }
      if (low && y === stubRow) {
        out[k] = stubSwap(look % STUB_LOOKS);
        continue;
      }
      out[k] = panel.has(k) ? walnutSwap('x') : partitionSwap(look % PARTITION_LOOKS, 'x');
    }
  return out;
}

/**
 * The faces the camera sees: the back wall's (in `BACK_ART`'s order), and
 * the full walls in the stub line (the KNOWN BUGS board by the bug queue,
 * the ops status screen on the other).
 */
function placeArt(
  map: LevelMap,
  outer: Readonly<Record<string, Side>>,
  stubRow: number,
): BoardroomArtSpot[] {
  const out: BoardroomArtSpot[] = [];
  const back: GridPoint[] = [];
  for (let y = 0; y < map.height; y++)
    for (let x = 0; x < map.width; x++) if (isReception(map, outer, x, y)) back.push({ x, y });
  back.sort((a, b) => a.y - b.y || a.x - b.x);
  back.forEach((p, i) => out.push({ ...p, art: BACK_ART[i % BACK_ART.length] ?? 'glassNotes' }));
  const stubFaces: GridPoint[] = [];
  for (let x = 0; x < map.width; x++)
    if (
      isWall(map, x, stubRow) &&
      wallPiece(map, x, stubRow) === 'wall' &&
      isOpen(map, x, stubRow + 1) &&
      !outer[key(x, stubRow)]
    )
      stubFaces.push({ x, y: stubRow });
  const nearBug = (p: GridPoint) => [-1, 1].some((d) => getTile(map, p.x + d, p.y) === 'bugQueue');
  for (const p of stubFaces) out.push({ ...p, art: nearBug(p) ? 'bugBoard' : 'opsScreen' });
  return out.sort((a, b) => a.y - b.y || a.x - b.x);
}

/**
 * The stubs' scenes, run by run along the stub line (pockets left free):
 * Prod as the parking lot on the stub beside the left pocket, the name-card
 * credenza on the one beside the right pocket, the ideas board on the
 * first two-tile run and the HOW MIGHT WE board on the last; any other
 * stub a scatter of sticky notes.
 */
function stubScenes(
  map: LevelMap,
  stubRow: number,
  pockets: readonly GridPoint[],
  b: Box,
): StubSpot[] {
  const pocket = new Set(pockets.map((p) => key(p.x, p.y)));
  const runs: GridPoint[][] = [];
  let cur: GridPoint[] = [];
  for (let x = 0; x <= map.width; x++) {
    const ok =
      x < map.width &&
      isWall(map, x, stubRow) &&
      wallPiece(map, x, stubRow) === 'wall-front' &&
      isOpen(map, x, stubRow - 1) &&
      isOpen(map, x, stubRow + 1) &&
      !pocket.has(key(x, stubRow));
    if (ok) cur.push({ x, y: stubRow });
    else if (cur.length > 0) {
      runs.push(cur);
      cur = [];
    }
  }
  const out: StubSpot[] = [];
  const mid = (b.x0 + b.x1) / 2;
  const inner = runs.filter((r) => r.some((p) => p.x >= b.x0 - 1 && p.x <= b.x1 + 1));
  const sides = runs.filter((r) => !inner.includes(r));
  for (const r of inner) {
    const left = (r[0]?.x ?? 0) < mid;
    for (const p of r) out.push({ ...p, span: 1, scene: left ? 'prod' : 'credenza' });
  }
  sides.forEach((r, i) => {
    const first = r[0];
    if (!first) return;
    const scene: StubScene =
      r.length < 2
        ? 'stubNotes'
        : i === 0
          ? 'ideasBoard'
          : i === sides.length - 1
            ? 'howMightWe'
            : 'stubNotes';
    if (scene === 'stubNotes') for (const p of r) out.push({ ...p, span: 1, scene });
    else out.push({ ...first, span: r.length, scene });
  });
  return out.sort((a, b2) => a.x - b2.x);
}

// ---- The floor ----

function floorOfZone(z: BoardroomZone | undefined): BoardroomFloor {
  if (z === 'boardroom') return 'boardroom';
  if (z === 'corridor') return 'terrazzo';
  return 'slate';
}

/**
 * Wear on every open tile: the good carpet in the boardroom with its border
 * on the edge tiles; on the sides and the passage the slate carpet with
 * castor arcs behind the keyboards, a walk line along the passage, scuffs
 * inside the doorways and a stray sticky note by the walls; the corridor's
 * terrazzo with its walk line and heel scuffs by the doorways; thresholds in
 * the stub line's doorways. Never anything but the plain floor on a spawn.
 */
function floorWearOf(
  map: LevelMap,
  zones: Readonly<Record<string, BoardroomZone>>,
  b: Box,
  doorways: readonly GridPoint[],
): Record<string, number> {
  const out: Record<string, number> = {};
  const spawns = new Set([...map.spawns, ...map.managerSpawns].map((p) => key(p.x, p.y)));
  const zoneAt = (x: number, y: number) => zones[key(x, y)];
  const door = new Set(doorways.map((d) => key(d.x, d.y)));
  for (const [k, z] of Object.entries(zones)) {
    if (z !== 'boardroom') {
      out[k] = z === 'corridor' ? BOARDROOM_WEAR.terrazzo : BOARDROOM_WEAR.slate;
      continue;
    }
    const [x, y] = k.split(',').map(Number) as [number, number];
    const edges =
      (x === b.x0 ? 1 : 0) | (x === b.x1 ? 2 : 0) | (y === b.y0 ? 4 : 0) | (y === b.y1 ? 8 : 0);
    out[k] = BOARDROOM_WEAR.boardroom + edges;
  }
  // The corridor's walk line along the seam of its rows.
  for (const [k, z] of Object.entries(zones)) {
    if (z !== 'corridor' || door.has(k) || spawns.has(k)) continue;
    const [x, y] = k.split(',').map(Number) as [number, number];
    const fwd = zoneAt(x, y + 1) === 'corridor' && !door.has(key(x, y + 1));
    const bwd = zoneAt(x, y - 1) === 'corridor';
    out[k] =
      fwd && bwd
        ? BOARDROOM_WEAR.walkBoth
        : fwd
          ? BOARDROOM_WEAR.walkFront
          : bwd
            ? BOARDROOM_WEAR.walkBack
            : BOARDROOM_WEAR.terrazzo;
  }
  const slate = (k: string) => {
    const [x, y] = k.split(',').map(Number) as [number, number];
    return out[k] === BOARDROOM_WEAR.slate && !spawns.has(k) && isFloor(map, x, y);
  };
  // The passage's walk line, from the first keyboard to the ship.
  const ships: GridPoint[] = [];
  for (let y = 0; y < map.height; y++)
    for (let x = 0; x < map.width; x++) if (getTile(map, x, y) === 'ship') ships.push({ x, y });
  for (const [k, z] of Object.entries(zones)) {
    if (z !== 'passage' || !slate(k)) continue;
    const [x, y] = k.split(',').map(Number) as [number, number];
    // The passage's back row (the one along the hall), away from the stations along its front.
    if (zoneAt(x, y - 1) !== 'passage' && ships.length > 0) out[k] = BOARDROOM_WEAR.walkX;
  }
  // Castor arcs in front of each keyboard.
  for (let y = 0; y < map.height; y++)
    for (let x = 0; x < map.width; x++) {
      if (getTile(map, x, y) !== 'keyboard') continue;
      for (const [dx, dy] of STEPS) {
        const k = key(x + dx, y + dy);
        const z = zones[k];
        if ((z === 'passage' || z === 'dev' || z === 'ops') && !spawns.has(k))
          out[k] = BOARDROOM_WEAR.castor;
      }
    }
  // Scuffs inside each doorway, a walk line in from it; heel scuffs on the corridor side.
  for (const d of doorways) {
    const inside = key(d.x, d.y + 1);
    const z = zones[inside];
    if ((z === 'dev' || z === 'ops') && slate(inside)) out[inside] = BOARDROOM_WEAR.doorScuff;
    const behind = key(d.x, d.y - 1);
    if (zones[behind] === 'corridor' && !spawns.has(behind)) {
      const w = out[behind];
      out[behind] =
        BOARDROOM_WEAR.scuff +
        (w === BOARDROOM_WEAR.walkFront ? 1 : w === BOARDROOM_WEAR.walkBack ? 2 : 0);
    }
    out[key(d.x, d.y)] = boardroomThreshold(floorOfZone(zones[behind]), floorOfZone(zones[inside]));
  }
  // A stray sticky note on the carpet against a side's outer wall, here and there.
  for (const [k, z] of Object.entries(zones)) {
    if ((z !== 'dev' && z !== 'ops') || !slate(k)) continue;
    const [x, y] = k.split(',').map(Number) as [number, number];
    const byWall = STEPS.some(
      ([dx, dy]) => isWall(map, x + dx, y + dy) || isBlock(map, x + dx, y + dy),
    );
    if (byWall && (tileHash(x + 5, y + 41) >>> 3) % 3 === 0) out[k] = BOARDROOM_WEAR.sticky;
  }
  // Stations stand on their zone's plain floor.
  for (let y = 0; y < map.height; y++)
    for (let x = 0; x < map.width; x++)
      if (isBlock(map, x, y))
        out[key(x, y)] =
          zones[key(x, y)] === 'corridor' ? BOARDROOM_WEAR.terrazzo : BOARDROOM_WEAR.slate;
  return out;
}

// ---- The wall tops ----

/** What each cluster of workshop kit piles up, in turn along the walls: no two clusters alike. */
export const BOARDROOM_CLUSTERS: readonly (readonly BoardroomTopKind[])[] = [
  ['stickyPads', 'markers', 'laptop', 'succulent'],
  ['notebooks', 'lanyards', 'badgeBox', 'cardHolder'],
  ['dndTent', 'speaker', 'timer', 'clicker'],
  ['carafe', 'coffeeCups', 'confPhone', 'headset'],
  ['paperRolls', 'stickyBox', 'dotStickers', 'deskFan'],
  ['deckPrintout', 'binders', 'tablet', 'monitorTurned'],
];

/** How far apart the props of a cluster stand along their wall, in tiles. */
const CLUSTER_STEP = 0.42;

/**
 * The workshop kit in clusters of four on two tiles (two on one): along the back wall,
 * keeping the stretch right behind the boardroom clear (the welcome screen
 * shows over it), a tile's breather between clusters; down the full side walls
 * of the corridor; on the full stub-line walls. Never next to a station
 * (it would look like something to pick up), never on a low wall.
 */
function topProps(
  map: LevelMap,
  b: Box,
  outer: Readonly<Record<string, Side>>,
  stubRow: number,
  salt: number,
): BoardroomTop[] {
  const near = (x: number, y: number) => {
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) if (isBlock(map, x + dx, y + dy)) return true;
    return false;
  };
  const free = (x: number, y: number) =>
    isWall(map, x, y) &&
    wallPiece(map, x, y) !== 'wall-front' &&
    !isOpen(map, x, y - 1) &&
    !near(x, y) &&
    !(y < stubRow && x > b.x0 && x < b.x1);
  const has = (x: number, y: number) => free(x, y);
  const runs: { tiles: GridPoint[]; axis: 'x' | 'y' }[] = [];
  const used = new Set<string>();
  // Along the rows first (the back wall), then down the columns.
  for (let y = 0; y < map.height; y++)
    for (let x = 0; x < map.width; x++) {
      if (!has(x, y) || has(x - 1, y) || used.has(key(x, y))) continue;
      const run: GridPoint[] = [];
      for (let u = x; has(u, y); u++) run.push({ x: u, y });
      if (run.length < 3) continue;
      for (const p of run) used.add(key(p.x, p.y));
      runs.push({ tiles: run, axis: 'x' });
    }
  for (let x = 0; x < map.width; x++)
    for (let y = 0; y < map.height; y++) {
      if (!has(x, y) || used.has(key(x, y)) || (has(x, y - 1) && !used.has(key(x, y - 1))))
        continue;
      const run: GridPoint[] = [];
      for (let v = y; has(x, v) && !used.has(key(x, v)); v++) run.push({ x, y: v });
      for (const p of run) used.add(key(p.x, p.y));
      runs.push({ tiles: run, axis: 'y' });
    }
  const out: BoardroomTop[] = [];
  let cluster = 0;
  const turn = (q: GridPoint, k: number) =>
    ((((tileHash(q.y + 3 + k, q.x + 1) ^ salt) >>> 2) % 5) - 2) * 0.08;
  for (const { tiles: run, axis } of runs) {
    for (let i = 0; i < run.length;) {
      const span = Math.min(2, run.length - i);
      const kinds = (BOARDROOM_CLUSTERS[cluster % BOARDROOM_CLUSTERS.length] ?? []).slice(
        0,
        span === 1 ? 2 : 4,
      );
      cluster++;
      const mid = i + (span - 1) / 2;
      kinds.forEach((kind, k) => {
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
          h: WALL_HEIGHT,
        });
      });
      i += span + 1;
    }
  }
  return out.sort((a, c) => a.y + a.dy - (c.y + c.dy) || a.x + a.dx - (c.x + c.dx));
}

// ---- The pendants ----

/** The pendants' height, and how far behind the stub line's front face the wire runs. */
export const BOARDROOM_PENDANT_Y = WALL_HEIGHT + 0.22;
export const BOARDROOM_WIRE_BACK = 0.18;

/**
 * A row of pendants along the back of each side, on a wire strung over the
 * stub line from the full wall at its outer end (the stub line's full
 * walls, else the side wall) to a pole on the side's inner stub scene (the
 * board): never over the boardroom, never near the front.
 */
function pendantRows(
  map: LevelMap,
  b: Box,
  stubRow: number,
  stubs: readonly StubSpot[],
): PendantRow[] {
  const z = stubRow + 0.5 - BOARDROOM_WIRE_BACK;
  const y = BOARDROOM_PENDANT_Y;
  const out: PendantRow[] = [];
  const boards = stubs.filter((s) => s.scene === 'ideasBoard' || s.scene === 'howMightWe');
  for (const s of boards) {
    const left = s.x < b.x0;
    // The board's end toward the boardroom carries the pole.
    const pole = left ? s.x + s.span - 1 + 0.38 : s.x - 0.38;
    // Out to the full wall at the side's outer end of the stub line.
    let w = left ? s.x - 1 : s.x + s.span;
    while (
      w >= 0 &&
      w < map.width &&
      !(isWall(map, w, stubRow) && wallPiece(map, w, stubRow) === 'wall')
    )
      w += left ? -1 : 1;
    if (w < 0 || w >= map.width) continue;
    const x0 = left ? w : pole;
    const x1 = left ? pole : w;
    const length = x1 - x0;
    const count = Math.max(1, Math.round(length / 1.6));
    out.push({
      z,
      y,
      x0,
      x1,
      base0: left ? WALL_HEIGHT : FRONT_WALL_HEIGHT,
      base1: left ? FRONT_WALL_HEIGHT : WALL_HEIGHT,
      at: Array.from({ length: count }, (_, i) => x0 + (length * (i + 0.5)) / count),
    });
  }
  return out;
}

// ---- The bin ----

/** The bin's tile and the side the outside is on (the PARKED box leans there). */
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
