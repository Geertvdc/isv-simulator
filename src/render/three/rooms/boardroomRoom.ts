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
 * boardroom (the folding walls' tiles are its edge) and a walnut-bordered
 * rug wherever the table's halves stand in either layout, the tower's slate
 * carpet on the sides and the passage (castor arcs in front of the
 * keyboards, walk lines from the inbox to the keyboards and from the
 * pipeline to the ship, scuffs in the doorways and at the passage's ends,
 * dropped sticky notes by the walls, the sun-faded patch by the glass),
 * terrazzo with a walk line in the corridor, a threshold in each doorway of
 * the stub line. Walls: glass partitions onto the executive reception along
 * the back (walnut panels where art hangs), the curtain wall where the city
 * is (glass and blinds on the sides, a sill on the front), the stubs low
 * walnut with a stone cap, carrying the workshop's boards. Story: the
 * workshop's sticky-note wall over the inbox, the PARKED box at the bin,
 * the ops deploy desk at the ship, the KNOWN BUGS board by the bug queue,
 * the synergy matrix and the board's portraits on the back wall, Prod as
 * the parking lot beside a pocket, the visitor badges and the coffee urn
 * beside the other, the workshop kit in clusters on the wall tops and the
 * front sill, and slim pendants on a wire
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

/**
 * Placed wear on the sides' and the passage's slate carpet, flags added to
 * `BOARDROOM_WEAR.slate`: chair castors' arcs in front of a keyboard, the
 * pile walked flat (a line from the tile's middle to each edge flagged:
 * north −z, south +z, west −x, east +x), scuffs in a doorway or at the
 * passage's ends, sticky notes dropped by a wall or a desk, the patch the
 * afternoon sun has faded beside the glass.
 */
export const SLATE_WEAR = {
  castor: 1,
  walkN: 2,
  walkS: 4,
  walkW: 8,
  walkE: 16,
  scuff: 32,
  sticky: 64,
  sun: 128,
} as const;

/** Wear on a floor tile (see `floorWear`): one number per look. */
export const BOARDROOM_WEAR = {
  /** The sides' and the passage's warm slate carpet: `slate + ` any `SLATE_WEAR` flags. */
  slate: 0,
  /** The good carpet: `boardroom + edges`, edges a mask of its border band (1 −x, 2 +x, 4 −z, 8 +z). */
  boardroom: 256,
  /** The walnut-bordered rug where a rolling desk stands in either layout: `rug + edges`, as the good carpet's. */
  rug: 272,
  /** The executive corridor's terrazzo. */
  terrazzo: 288,
  /** Its walk line along the tile's front edge, back edge, or down the middle. */
  walkFront: 289,
  walkBack: 290,
  walkBoth: 291,
  /** Heel scuffs by a doorway: `scuff + line` (line 0 none, 1 front, 2 back). */
  scuff: 292,
  /** A doorway's threshold: `threshold + neg * 3 + pos` (each a `BOARDROOM_FLOORS` index), passed along z. */
  threshold: 295,
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
export type StubScene = 'ideasBoard' | 'howMightWe' | 'prod' | 'badgeTray' | 'stubNotes';

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
  | 'monitorTurned'
  | 'laptopHalf'
  | 'markerCaddy'
  | 'dndCard'
  | 'lanyardTray'
  | 'jugGlasses'
  | 'notebookStack'
  | 'deskPlant';

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
  const sideGlass = sideGlassTiles(map, outer, stubRow);
  return {
    zones,
    boardroom,
    stubRow,
    pockets,
    doorways,
    decos: {},
    floorWear: floorWearOf(map, zones, boardroom, doorways, sideGlass),
    capProps: [],
    frontProps: [],
    swaps: wallSwaps(map, outer, art, stubRow, salt, pockets, sideGlass),
    outer,
    art,
    stubs,
    tops: [...topProps(map, boardroom, outer, stubRow, salt), ...frontProps(map, outer, salt)].sort(
      (a, c) => a.y + a.dy - (c.y + c.dy) || a.x + a.dx - (c.x + c.dx),
    ),
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
/** The side curtain wall in the hall: glass and blinds you can see, each look its own drop; the room on its +x (`left` wall) or −x side. */
export const SIDE_GLASS_LOOKS = 3;
export const sideGlassSwap = (side: 'left' | 'right', look: number, low = false) =>
  `sideGlass:${side}:${low ? 'low' : 'full'}:${look}`;
/** The front's low wall: a deep window board the workshop leaves things on, the glass at its outer edge. */
export const FRONT_SILL_LOOKS = 3;
export const frontSillSwap = (look: number) => `frontSill:${look}`;
/** Every swap name the plan can use beyond the tower's own. */
export const BOARDROOM_SWAPS: readonly string[] = [
  walnutSwap('x'),
  walnutSwap('z'),
  ...Array.from({ length: STUB_LOOKS }, (_, l) => stubSwap(l)),
  ...(['left', 'right'] as const).flatMap((side) =>
    [false, true].flatMap((low) =>
      Array.from({ length: SIDE_GLASS_LOOKS }, (_, l) => sideGlassSwap(side, l, low)),
    ),
  ),
  ...Array.from({ length: FRONT_SILL_LOOKS }, (_, l) => frontSillSwap(l)),
];

/** The side walls in the hall (in front of the stub line) with the outside beyond, full or cut down: the glass the sun comes through. */
function sideGlassTiles(
  map: LevelMap,
  outer: Readonly<Record<string, Side>>,
  stubRow: number,
): GridPoint[] {
  const out: GridPoint[] = [];
  for (let y = stubRow + 1; y < map.height; y++)
    for (let x = 0; x < map.width; x++) {
      const side = outer[key(x, y)];
      if ((side === 'left' || side === 'right') && wallPiece(map, x, y) !== 'wall-inner')
        out.push({ x, y });
    }
  return out;
}

/**
 * How each wall is built: on the back the reception's glass partitions
 * (a walnut panel where art hangs), elsewhere the curtain wall where the
 * outside is (a sill on the low front), the stubs low walnut, the full
 * inner walls a walnut panel.
 */
/** The swap on a pocket tile: it has no model, so only the floor is drawn there. */
export const POCKET_SWAP = 'pocket';

function wallSwaps(
  map: LevelMap,
  outer: Readonly<Record<string, Side>>,
  art: readonly BoardroomArtSpot[],
  stubRow: number,
  salt: number,
  pockets: readonly GridPoint[],
  sideGlass: readonly GridPoint[],
): Record<string, string> {
  const pocketKeys = new Set(pockets.map((p) => key(p.x, p.y)));
  const glassKeys = new Set(sideGlass.map((p) => key(p.x, p.y)));
  const panel = new Set(art.filter((a) => !ON_GLASS.has(a.art)).map((a) => key(a.x, a.y)));
  const out: Record<string, string> = {};
  for (let y = 0; y < map.height; y++)
    for (let x = 0; x < map.width; x++) {
      if (!isWall(map, x, y)) continue;
      const k = key(x, y);
      // The folding walls' closets stand here (`boardroom/`): no wall, just the floor under them.
      if (pocketKeys.has(k)) {
        out[k] = POCKET_SWAP;
        continue;
      }
      const low = wallPiece(map, x, y) === 'wall-front';
      const look = ((tileHash(x + 23, y + 7) ^ salt) >>> 6) % CURTAIN_LOOKS;
      if (glassKeys.has(k)) {
        out[k] = sideGlassSwap(
          outer[k] === 'right' ? 'right' : 'left',
          look % SIDE_GLASS_LOOKS,
          low,
        );
        continue;
      }
      if (isReception(map, outer, x, y)) {
        out[k] = panel.has(k) ? walnutSwap('x') : partitionSwap(look % PARTITION_LOOKS, 'x');
        continue;
      }
      const side = outer[k];
      if (side) {
        const along = side === 'left' || side === 'right' ? 'z' : 'x';
        out[k] =
          low && side === 'front'
            ? frontSillSwap(look % FRONT_SILL_LOOKS)
            : low
              ? sillSwap(look, along)
              : curtainSwap(look, along);
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
 * Prod as the parking lot on the stub beside the left pocket, the visitor
 * badge tray and the coffee urn on the one beside the right pocket, the ideas board on the
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
    for (const p of r) out.push({ ...p, span: 1, scene: left ? 'prod' : 'badgeTray' });
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

/** The tiles a rolling desk stands on in any layout (the table's halves): a rug lies under them. */
export function rugTiles(map: LevelMap): GridPoint[] {
  const seen = new Set<string>();
  const out: GridPoint[] = [];
  const layouts = map.phases ?? [{ tiles: map.tiles, marks: map.marks }];
  for (const l of layouts)
    for (const m of l.marks)
      if (m.kind === 'rollingDesk' && !seen.has(key(m.x, m.y))) {
        seen.add(key(m.x, m.y));
        out.push({ x: m.x, y: m.y });
      }
  return out.sort((p, q) => p.y - q.y || p.x - q.x);
}

/** The open tiles in front of each tile of `tile` (its floor neighbours). */
function frontsOf(map: LevelMap, tile: string): GridPoint[] {
  const out: GridPoint[] = [];
  for (let y = 0; y < map.height; y++)
    for (let x = 0; x < map.width; x++) {
      if (getTile(map, x, y) !== tile) continue;
      for (const [dx, dy] of STEPS)
        if (isFloor(map, x + dx, y + dy)) out.push({ x: x + dx, y: y + dy });
    }
  return out;
}

/**
 * The walk lines worn into the slate: from every tile in front of a `from`
 * station to the nearest tiles in front of a `to` station, down the column
 * first and then along the row; each tile's flags say which edges its line
 * reaches.
 */
function walkPaths(map: LevelMap, from: string, to: string): Record<string, number> {
  const out: Record<string, number> = {};
  const targets = frontsOf(map, to);
  const flag = (x: number, y: number, f: number) => {
    out[key(x, y)] = (out[key(x, y)] ?? 0) | f;
  };
  for (const s of frontsOf(map, from)) {
    const d = (t: GridPoint) => Math.abs(t.x - s.x) + Math.abs(t.y - s.y);
    const near = Math.min(...targets.map(d));
    for (const t of targets.filter((q) => d(q) <= near + 1 && d(q) <= 6)) {
      let { x, y } = s;
      while (y !== t.y) {
        const dy = Math.sign(t.y - y);
        flag(x, y, dy > 0 ? SLATE_WEAR.walkS : SLATE_WEAR.walkN);
        y += dy;
        flag(x, y, dy > 0 ? SLATE_WEAR.walkN : SLATE_WEAR.walkS);
      }
      while (x !== t.x) {
        const dx = Math.sign(t.x - x);
        flag(x, y, dx > 0 ? SLATE_WEAR.walkE : SLATE_WEAR.walkW);
        x += dx;
        flag(x, y, dx > 0 ? SLATE_WEAR.walkW : SLATE_WEAR.walkE);
      }
    }
  }
  return out;
}

/** How many tiles on each side get dropped sticky notes. */
const STICKY_TILES = 3;

/**
 * Wear on every open tile: the good carpet in the boardroom with its border
 * on the edge tiles, a walnut-bordered rug where the table's halves stand
 * in either layout; on the sides and the passage the slate carpet with
 * castor arcs in front of the keyboards, walk lines from the inbox to the
 * dev keyboards and from the pipeline to the ship, scuffs inside the
 * doorways and at the passage's ends, sticky notes dropped by the walls and
 * desks, a sun-faded patch beside the side glass; the corridor's terrazzo
 * with its walk line and heel scuffs by the doorways; thresholds in the stub
 * line's doorways. Never anything but the plain floor on a spawn.
 */
function floorWearOf(
  map: LevelMap,
  zones: Readonly<Record<string, BoardroomZone>>,
  b: Box,
  doorways: readonly GridPoint[],
  sunny: readonly GridPoint[],
): Record<string, number> {
  const out: Record<string, number> = {};
  const spawns = new Set([...map.spawns, ...map.managerSpawns].map((p) => key(p.x, p.y)));
  const zoneAt = (x: number, y: number) => zones[key(x, y)];
  const door = new Set(doorways.map((d) => key(d.x, d.y)));
  const rugs = new Set(rugTiles(map).map((p) => key(p.x, p.y)));
  for (const [k, z] of Object.entries(zones)) {
    if (z !== 'boardroom') {
      out[k] = z === 'corridor' ? BOARDROOM_WEAR.terrazzo : BOARDROOM_WEAR.slate;
      continue;
    }
    const [x, y] = k.split(',').map(Number) as [number, number];
    if (rugs.has(k)) {
      const rugEdges =
        (rugs.has(key(x - 1, y)) ? 0 : 1) |
        (rugs.has(key(x + 1, y)) ? 0 : 2) |
        (rugs.has(key(x, y - 1)) ? 0 : 4) |
        (rugs.has(key(x, y + 1)) ? 0 : 8);
      out[k] = BOARDROOM_WEAR.rug + rugEdges;
      continue;
    }
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
  /** A slate tile wear may be added to (never a spawn, never under a station). */
  const slate = (k: string) => {
    const [x, y] = k.split(',').map(Number) as [number, number];
    const w = out[k];
    return w !== undefined && w < BOARDROOM_WEAR.boardroom && !spawns.has(k) && isFloor(map, x, y);
  };
  const add = (k: string, f: number) => {
    if (slate(k)) out[k] = (out[k] ?? 0) | f;
  };
  // The walk lines: inbox to the dev keyboards, pipeline to the ship.
  for (const [from, to] of [
    ['inbox', 'keyboard'],
    ['pipeline', 'ship'],
  ] as const)
    for (const [k, f] of Object.entries(walkPaths(map, from, to))) add(k, f);
  // Castor arcs in front of each keyboard.
  for (const p of frontsOf(map, 'keyboard')) add(key(p.x, p.y), SLATE_WEAR.castor);
  // Scuffs inside each doorway; heel scuffs on the corridor side; thresholds.
  for (const d of doorways) {
    const inside = key(d.x, d.y + 1);
    add(inside, SLATE_WEAR.scuff);
    const behind = key(d.x, d.y - 1);
    if (zones[behind] === 'corridor' && !spawns.has(behind)) {
      const w = out[behind];
      out[behind] =
        BOARDROOM_WEAR.scuff +
        (w === BOARDROOM_WEAR.walkFront ? 1 : w === BOARDROOM_WEAR.walkBack ? 2 : 0);
    }
    out[key(d.x, d.y)] = boardroomThreshold(floorOfZone(zones[behind]), floorOfZone(zones[inside]));
  }
  // Scuffs at the passage's two ends, where everyone turns.
  const passage = Object.entries(zones)
    .filter(([, z]) => z === 'passage')
    .map(([k]) => k.split(',').map(Number) as [number, number]);
  if (passage.length > 0) {
    const xs = passage.map(([x]) => x);
    for (const [x, y] of passage)
      if (x === Math.min(...xs) || x === Math.max(...xs)) add(key(x, y), SLATE_WEAR.scuff);
  }
  // Where the afternoon sun has faded the carpet beside the side glass.
  for (const p of sunny)
    for (const [dx, dy] of STEPS) {
      const z = zoneAt(p.x + dx, p.y + dy);
      if (z === 'dev' || z === 'ops' || z === 'passage')
        add(key(p.x + dx, p.y + dy), SLATE_WEAR.sun);
    }
  // Sticky notes dropped against the walls and desks, a few tiles on each side.
  const mid = (b.x0 + b.x1) / 2;
  for (const left of [true, false]) {
    const spots = Object.keys(zones)
      .filter((k) => {
        const [x, y] = k.split(',').map(Number) as [number, number];
        const z = zones[k];
        if (z !== 'dev' && z !== 'ops' && z !== 'passage') return false;
        if (x < mid !== left || !slate(k)) return false;
        if (
          ((out[k] ?? 0) &
            (SLATE_WEAR.walkN | SLATE_WEAR.walkS | SLATE_WEAR.walkW | SLATE_WEAR.walkE)) !==
          0
        )
          return false;
        return STEPS.some(
          ([dx, dy]) => isWall(map, x + dx, y + dy) || isBlock(map, x + dx, y + dy),
        );
      })
      .map((k) => {
        const [x, y] = k.split(',').map(Number) as [number, number];
        return { k, h: tileHash(x + 5, y + 41) };
      })
      .sort((p, q) => p.h - q.h || (p.k < q.k ? -1 : 1));
    for (const s of spots.slice(0, STICKY_TILES)) add(s.k, SLATE_WEAR.sticky);
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

// ---- The front sill ----

/** The low kit on the front sill, cluster by cluster (no kind twice): every piece at most `FRONT_TOP_MAX` high. */
export const FRONT_CLUSTERS: readonly (readonly BoardroomTopKind[])[] = [
  ['stickyPads', 'laptopHalf', 'markerCaddy'],
  ['lanyardTray', 'dndCard', 'coffeeCups'],
  ['clicker', 'jugGlasses', 'notebookStack'],
  ['timer', 'deskPlant', 'dotStickers'],
  ['cardHolder', 'confPhone', 'headset'],
];
/** How tall the front sill's kit stands at most (the front strip stays low). */
export const FRONT_TOP_MAX = 0.25;
/** The top of the front's window board (its spandrel 0.16 and the 0.022 board). */
export const FRONT_SILL_Y = 0.182;
/** How far into the room from the tile's middle the kit stands (tiles): clear of the glass at the board's outer edge. */
const FRONT_INSET = 0.1;
/** How far apart a front cluster's pieces stand along the sill (tiles). */
const FRONT_STEP = 0.4;

/**
 * The workshop kit left on the front sill, between the stations: a cluster
 * on each end tile of a run of plain front wall and on every second tile
 * between (never right beside a station, never on a corner), standing on
 * the room side of the sill's glass, turned to the camera.
 */
function frontProps(
  map: LevelMap,
  outer: Readonly<Record<string, Side>>,
  salt: number,
): BoardroomTop[] {
  const near = (x: number, y: number) => {
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) if (isBlock(map, x + dx, y + dy)) return true;
    return false;
  };
  const ok = (x: number, y: number) =>
    x > 0 &&
    x < map.width - 1 &&
    outer[key(x, y)] === 'front' &&
    isWall(map, x, y) &&
    wallPiece(map, x, y) === 'wall-front' &&
    !near(x, y);
  const out: BoardroomTop[] = [];
  let cluster = 0;
  for (let y = 0; y < map.height; y++)
    for (let x = 0; x < map.width; x++) {
      if (!ok(x, y) || ok(x - 1, y)) continue;
      const run: number[] = [];
      for (let u = x; ok(u, y); u++) run.push(u);
      const last = run.length - 1;
      const picks = run.filter((_, i) => i === last || (i % 2 === 0 && i !== last - 1));
      for (const u of picks) {
        const kinds = FRONT_CLUSTERS[cluster % FRONT_CLUSTERS.length] ?? [];
        const flip = cluster % 2 === 1;
        cluster++;
        kinds.forEach((kind, k) => {
          const turn = ((((tileHash(u + 11 + k, y + 3) ^ salt) >>> 3) % 5) - 2) * 0.07;
          out.push({
            x: u,
            y,
            dx: (flip ? (kinds.length - 1) / 2 - k : k - (kinds.length - 1) / 2) * FRONT_STEP,
            dy: -FRONT_INSET,
            kind,
            yaw: turn,
            h: FRONT_SILL_Y,
          });
        });
      }
    }
  return out;
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
