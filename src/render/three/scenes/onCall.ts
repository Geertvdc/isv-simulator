import type { LevelMap } from '../../../sim/level';
import { getTile } from '../../../sim/level';
import { gridToWorld, projectPoint, type Vec3 } from '../../projection';
import { firstGroup, tileHash } from '../../mapShape';
import { tint } from '../kit';
import { CASE_SIZES, flightCase } from '../setDressing/demoDay';
import {
  airDuct,
  bike,
  bikeStand,
  boiler,
  boilerSign,
  breakerPanel,
  cableReel,
  cleaningCart,
  column,
  deflatedBalloon,
  dockLight,
  expansionTank,
  extinguisher,
  fibreDuct,
  floorDrain,
  foundationWall,
  growLamp,
  junkShelf,
  launchpadBanner,
  mopBucket,
  mopDock,
  pipeRun,
  rackBlink,
  segfaultCat,
  sleepingGuard,
  spareRack,
  stairFlight,
  STAIR_WIDTH,
  steamWisp,
  storageCage,
  LOBBY_DEPTH,
  WELL_DEPTH,
  LOBBY_DESK,
  wetFloorSign,
  type WallOpening,
} from '../setDressing/onCall';
import { cableTray, planterTree, raisedBanner } from '../setDressing/rooftop';
import { cargoBike } from '../setDressing/canal';
import { boxStack } from '../setDressing/suburb';
import type { SetPiece } from '../setDressing/shared';
import { scenePose } from './downTheHall';
import { basementRoom } from '../rooms/basementRoom';
import { WALL_HEIGHT } from '../layout';
import { shade } from './ground';
import {
  type AliveKind,
  GROUND,
  type GroundPainter,
  type GroundPatch,
  type Scene,
  type ScenePerson,
  type ScenePiece,
  type ScenePose,
} from './types';

/**
 * On Call's world (level 2-3, scene `on-call`; see
 * `docs/plan/on-call-environment.md`): the basement under the loft building
 * at 3 AM on a snowy night, round the server room. Behind the level, the
 * building's poured-concrete foundation wall rises out of the frame, pipes
 * and a big duct along it on brackets, its light wells going up to the
 * snowy street in sodium light; up one of them the lobby's lit window, the
 * security guard asleep at his desk. A concrete stair flight comes down from
 * the lobby door beside the inbox (the pager board): alerts come down the
 * stairs. Left, the boiler room: the old boiler with its flame window and
 * gauges, the expansion tank, the BOILER ROOM · NO STORAGE sign with boxes
 * stacked under it anyway, steam from a valve, and the night cleaner on her
 * break with a coffee by her cart. Right, the bike storage and the
 * chicken-wire storage cage full of the startup's leftovers (Demo Day's
 * flight cases, the LAUNCHPAD roll-up, the WE RAISED! banner and its
 * deflated balloon), and Prod, brought down from the loft for the oxygen.
 * In front, thin: the worn safety line, the yellow fibre duct from the ship
 * hatch (the uplink), a drain, Moppy's empty charging dock with its green
 * light, the WET FLOOR sign folded beside it. Void tiles are more basement:
 * spare racks and a cable run at the back, low things only at the front.
 *
 * Everything is placed from the level's outline, its void tiles and its ship
 * and inbox tiles, and from where the frame's edges fall for this map (the
 * camera fit at 1440×810), so it fits any map of this level. Pure data.
 */

/** The basement floor out to the horizon: dark painted concrete. */
const HORIZON = 0x4a4d50;
/** The basement's painted floor, the boiler room's bare concrete, the apron by the walls. */
const FLOOR = 0x737877;
const BARE = 0x76736c;
const APRON_PAINT = 0x8c9190;
/** How far behind the back wall the foundation wall's face stands (the stairs fit between). */
const FOUNDATION_GAP = 1.0;
/** How tall the foundation wall is: out of the top of the frame. */
const FOUNDATION_H = 6.2;
/** The light wells: their sill and lintel heights, their width. */
const WELL = { y0: 2.0, y1: 3.4, w: 1.3, gap: 1.35 } as const;
/** The stairs: how steep, how deep the landing at the top, how tall the lobby door. */
const STAIR = { slope: 0.62, landing: 0.85, door: 1.75 } as const;
/** How high the towel on the warmest server's lid sits over its wall top (`SEGFAULT_SERVER`, ×1.3). */
const SERVER_TOP = 0.2 * 1.3;
/** How high the stairs rise along the back. */
const STAIR_RISE = 2.2;
/** The thin painted apron along the front, and how far the front shows past it. */
const APRON = 0.3;
/** The screen the scene is composed for. */
const VIEW = { width: 1440, height: 810 };
/** Screen rectangles the HUD covers at 1440×810: story props stay out of them. */
const HUD: readonly (readonly [number, number, number, number])[] = [
  [0, 0, 690, 140],
  [14, 619, 218, 734],
  [0, 755, 135, 810],
  [1320, 755, 1440, 810],
  [1370, 0, 1440, 60],
  [600, 765, 840, 810],
];
/** The light wells start right of the order cards on screen. */
const CARDS_RIGHT = 715;
/** The living props. */
const ALIVE: ReadonlyMap<SetPiece, AliveKind> = new Map<SetPiece, AliveKind>([
  [sleepingGuard, 'breathe'],
  [segfaultCat, 'purr'],
  [steamWisp, 'wisp'],
  [dockLight, 'blink'],
  [rackBlink, 'blink'],
]);
/** The small light sources that keep their glow and bloom (see `ScenePiece.hot`). */
const HOT_PIECES: readonly SetPiece[] = [boiler, dockLight, rackBlink, growLamp];

type Edge = 'back' | 'front' | 'left' | 'right';
interface Tile {
  x: number;
  z: number;
}

/** A number from 0 to 1 for point (a, b) with `salt`, stirred so nearby points differ. */
function unit(a: number, b: number, salt: number): number {
  let h = tileHash(Math.round(a * 97) + salt * 7919, Math.round(b * 89) - salt * 31);
  h ^= h >>> 16;
  h = Math.imul(h, 0x45d9f3b);
  h ^= h >>> 16;
  return ((h >>> 0) % 1000) / 1000;
}

/** Which edge of the map a group of tiles sits on (the inbox, the ship). */
function edgeOf(map: LevelMap, group: readonly Tile[]): Edge | null {
  const p = group[0];
  if (!p) return null;
  if (group.every((t) => t.z === 0)) return 'back';
  if (group.every((t) => t.z === map.height - 1)) return 'front';
  if (group.every((t) => t.x === 0)) return 'left';
  if (group.every((t) => t.x === map.width - 1)) return 'right';
  const d = { back: p.z, front: map.height - 1 - p.z, left: p.x, right: map.width - 1 - p.x };
  return (Object.keys(d) as Edge[]).reduce((a, b) => (d[b] < d[a] ? b : a));
}

/** Where the light wells' left edges fall along x, and which one shows the lobby (the guard). */
function wellPlan(map: LevelMap, doorX: number | undefined) {
  const pose = scenePose(map);
  const fz = -0.5 - FOUNDATION_GAP;
  const wellMid = (WELL.y0 + WELL.y1) / 2;
  const xAt = (sx: number): number => {
    const a = projectPoint(pose, { x: 0, y: GROUND + wellMid, z: fz });
    const b = projectPoint(pose, { x: 1, y: GROUND + wellMid, z: fz });
    return (sx - a.x) / (b.x - a.x);
  };
  const doorEdge = doorX !== undefined ? doorX + STAIR.landing / 2 + 0.9 : -Infinity;
  const wells: number[] = [];
  for (
    let x = Math.max(xAt(CARDS_RIGHT), doorEdge);
    xAt(VIEW.width - 40) - (x + WELL.w) > 0;
    x += WELL.w + WELL.gap
  )
    wells.push(x);
  const guardWell = wells.reduce<number | undefined>(
    (best, x) =>
      best === undefined || Math.abs(x - (doorX ?? 0)) < Math.abs(best - (doorX ?? 0)) ? x : best,
    undefined,
  );
  return { wells, guardWell, fz };
}

/** Where the lobby door at the top of the stairs stands along x (its middle), if the level has stairs. */
function lobbyDoorX(map: LevelMap): number | undefined {
  const inbox = firstGroup(map, 'inbox').map((p) => ({ x: p.x, z: p.y }));
  const edge = edgeOf(map, inbox);
  if (inbox.length === 0) return undefined;
  if (edge === 'back') {
    const right = mid(inbox, 'x') < map.width / 2;
    const ix = right
      ? Math.max(...inbox.map((t) => t.x)) + 0.55
      : Math.min(...inbox.map((t) => t.x)) - 0.55;
    return ix + (right ? 1 : -1) * (STAIR_RISE / STAIR.slope + STAIR.landing / 2);
  }
  if (edge === 'left') return -0.5 - 0.62;
  if (edge === 'right') return map.width - 0.5 + 0.62;
  return undefined;
}

function mid(g: readonly Tile[], k: 'x' | 'z'): number {
  return g.length > 0 ? g.reduce((s, t) => s + t[k], 0) / g.length : 0;
}

/**
 * The light wells in the foundation wall, for the stage's snow, sodium
 * shafts and well lights (the lobby one included): each opening's middle in
 * the world at the shaft's mid-depth, its width and height. Pure.
 */
export function onCallLightWells(map: LevelMap): { at: Vec3; w: number; h: number }[] {
  const { wells, fz } = wellPlan(map, lobbyDoorX(map));
  return wells.map((x) => ({
    at: gridToWorld(x + WELL.w / 2, fz - WELL_DEPTH / 2, GROUND + (WELL.y0 + WELL.y1) / 2),
    w: WELL.w,
    h: WELL.y1 - WELL.y0,
  }));
}

/** The scene round `map`: pure and deterministic. */
export function onCallScene(map: LevelMap): Scene {
  const { width, height } = map;
  const L = -0.5;
  const R = width - 0.5;
  const B = -0.5;
  const F = height - 0.5;
  const pose = scenePose(map);
  /** The world x at screen x `sx`, on the ground (or `lift` above it) at depth z. */
  const xAt = (sx: number, z: number, lift = 0): number => {
    const a = projectPoint(pose, { x: 0, y: GROUND + lift, z });
    const b = projectPoint(pose, { x: 1, y: GROUND + lift, z });
    return (sx - a.x) / (b.x - a.x);
  };
  const midZ = (B + F) / 2;
  const tileAt = (x: number, z: number) => getTile(map, x, z);
  const isVoid = (x: number, z: number) => tileAt(x, z) === 'void';
  /**
   * Whether a box `r` round (x, z) (`rz` along z), from `low` up to `high`,
   * stays clear of the HUD on screen.
   */
  const clear = (x: number, z: number, r: number, high: number, rz = r, low = 0) => {
    const pts = [];
    for (const dx of [-r, r])
      for (const dz of [-rz, rz])
        for (const y of [low, high])
          pts.push(projectPoint(pose, { x: x + dx, y: GROUND + y, z: z + dz }));
    const x0 = Math.min(...pts.map((p) => p.x)) - 2;
    const x1 = Math.max(...pts.map((p) => p.x)) + 2;
    const y0 = Math.min(...pts.map((p) => p.y)) - 2;
    const y1 = Math.max(...pts.map((p) => p.y)) + 2;
    return HUD.every(([a, b, c, d]) => x1 <= a || x0 >= c || y1 <= b || y0 >= d);
  };
  const ship = firstGroup(map, 'ship').map((p) => ({ x: p.x, z: p.y }));
  const inbox = firstGroup(map, 'inbox').map((p) => ({ x: p.x, z: p.y }));
  const shipEdge = edgeOf(map, ship);
  const inboxEdge = edgeOf(map, inbox);
  /** The front of the level in column x: past its last tile that isn't void. */
  const frontOf = (x: number): number => {
    for (let z = height - 1; z >= 0; z--) if (!isVoid(x, z)) return z + 0.5;
    return B;
  };

  const pieces: ScenePiece[] = [];
  const ground: GroundPatch[] = [];
  const people: ScenePerson[] = [];
  const hot = new Set<SetPiece>(HOT_PIECES);
  let n = 0;
  /** Puts `piece` with its origin at (x, z), on the ground or `lift` above it. */
  const put = (
    piece: SetPiece,
    x: number,
    z: number,
    yaw = 0,
    variant = 0,
    row: ScenePiece['row'] = 'near',
    lift = 0,
  ) => {
    const i = n++;
    const bright = 0.94 + unit(i, 1, 3) * 0.08;
    const cool = (unit(i, 2, 5) * 2 - 1) * 0.025;
    const alive = ALIVE.get(piece);
    pieces.push({
      piece,
      variant: variant % (piece.variants ?? 1),
      at: gridToWorld(x, z, GROUND + lift),
      yaw,
      scale: [1, 1, 1],
      tint: [bright * (1 - cool), bright, bright * (1 + cool)],
      row,
      ...(alive ? { alive } : {}),
      ...(hot.has(piece) ? { hot: true } : {}),
    });
  };
  /** Puts a near prop `r` round and `high` tall only where it keeps clear of the HUD. */
  const putClear = (
    piece: SetPiece,
    x: number,
    z: number,
    r: number,
    high: number,
    yaw = 0,
    variant = 0,
    lift = 0,
  ): boolean => {
    if (!clear(x, z, r, high + lift, r, lift)) return false;
    put(piece, x, z, yaw, variant, 'near', lift);
    return true;
  };
  /** A stack of boxes (2 to 3 high in its looks) at (x, z), where the HUD allows. */
  const boxes = (x: number, z: number, look: number, yaw = 0) =>
    putClear(boxStack, x, z, 0.4, 1.0, yaw, look);
  /** A stack of flight cases at (x, z), `count` high, the biggest at the bottom. */
  const cases = (x: number, z: number, count: number, salt: number, yaw = 0) => {
    let lift = 0;
    const order = [3, 1, 4, 0, 2];
    for (let k = 0; k < count; k++) {
      const v = order[(k + salt) % order.length] ?? 0;
      const [, h] = CASE_SIZES[v] ?? [0, 0.4, 0];
      const jig = (unit(x, z + k, salt) - 0.5) * 0.12;
      if (!putClear(flightCase, x + jig * 0.3, z + jig * 0.2, 0.5, h, yaw + jig, v, lift)) break;
      lift += h;
    }
  };
  const patch = (kind: string, x0: number, x1: number, z0: number, z1: number) =>
    ground.push({ kind, x0, x1, z0, z1 });
  const person = (x: number, z: number, yaw: number, pose: ScenePose) =>
    people.push({ at: gridToWorld(x, z, GROUND), yaw, pose });

  const fz = B - FOUNDATION_GAP;
  /** The frame's left and right edges on the ground at depth z (a little past them). */
  const edgeL = (z: number) => xAt(0, z) - 0.3;
  const edgeR = (z: number) => xAt(VIEW.width, z) + 0.3;
  const wallL = Math.min(edgeL(fz), xAt(0, fz, 4)) - 1.0;
  const wallR = Math.max(edgeR(fz), xAt(VIEW.width, fz, 4)) + 1.0;

  // ---- Ground: painted basement concrete, the boiler room's bare floor, the apron in front ----
  const outL = Math.min(edgeL(F + 1.5), edgeL(fz)) - 3;
  const outR = Math.max(edgeR(F + 1.5), edgeR(fz)) + 3;
  patch('floor', outL, outR, fz - 2, F + 6);
  patch('bare', outL, L - 0.25, fz, F + 0.2);
  // The apron along the level's front, round any notch of void in it, the line on it.
  for (let x = 0; x < width;) {
    const f = frontOf(x);
    let e = x + 1;
    while (e < width && frontOf(e) === f) e++;
    patch('apron', x - 0.5, e - 0.5, f, f + APRON);
    x = e;
  }
  patch('apron', L - 0.35, L, F - 0.4, F + APRON);
  patch('apron', R, R + 0.35, F - 0.4, F + APRON);
  // Painted walkway lines down the sides, a bike bay's lines on the right.
  patch('line', L - 0.32, L - 0.27, fz + 0.6, F);
  patch('line', R + 0.27, R + 0.32, fz + 0.6, F);

  // ---- Back: the stairs down from the lobby, beside the inbox ----
  const openings: WallOpening[] = [];
  /** Where the pipes and the duct must stop for the stairs and the lobby door (x ranges). */
  const pipeGaps: [number, number][] = [];
  const ductGaps: [number, number][] = [];
  let doorX: number | undefined;
  if (inboxEdge === 'back' && inbox.length > 0) {
    // Along the back, between the back wall and the foundation wall: foot by the inbox, up away from the near corner.
    const right = mid(inbox, 'x') < width / 2;
    const ix = right
      ? Math.max(...inbox.map((t) => t.x)) + 0.55
      : Math.min(...inbox.map((t) => t.x)) - 0.55;
    const rise = STAIR_RISE;
    const run = rise / STAIR.slope;
    const sz = fz + 0.1 + STAIR_WIDTH / 2;
    put(stairFlight(run, rise, STAIR.landing), ix, sz, right ? 0 : Math.PI, 0, 'far');
    const top = ix + (right ? 1 : -1) * (run + STAIR.landing / 2);
    doorX = top;
    openings.push({
      kind: 'door',
      x0: top - STAIR.landing / 2 + 0.04,
      x1: top + STAIR.landing / 2 - 0.04,
      y0: rise,
      y1: rise + STAIR.door,
    });
    const a = Math.min(ix + (right ? 1.9 : -1.9), top);
    const b = Math.max(ix + (right ? 1.9 : -1.9), top);
    pipeGaps.push([a - STAIR.landing / 2, b + STAIR.landing / 2]);
    ductGaps.push([top - 0.75, top + 0.75]);
  } else if ((inboxEdge === 'left' || inboxEdge === 'right') && inbox.length > 0) {
    // Down the side beside the inbox: foot just in front of it, up toward the back to the lobby door.
    const left = inboxEdge === 'left';
    const sx = left ? L - 0.62 : R + 0.62;
    const footZ = Math.max(...inbox.map((t) => t.z)) + 0.5;
    const run = footZ - fz - STAIR.landing;
    const rise = Math.min(2.6, run * STAIR.slope);
    put(
      stairFlight(run, rise, STAIR.landing),
      sx,
      footZ,
      left ? Math.PI / 2 : Math.PI / 2,
      0,
      'far',
    );
    doorX = sx;
    openings.push({
      kind: 'door',
      x0: sx - STAIR_WIDTH / 2 + 0.02,
      x1: sx + STAIR_WIDTH / 2 - 0.02,
      y0: rise,
      y1: rise + STAIR.door,
    });
    pipeGaps.push([sx - STAIR_WIDTH / 2 - 0.12, sx + STAIR_WIDTH / 2 + 0.12]);
    ductGaps.push([sx - 0.75, sx + 0.75]);
  }

  // ---- Back: the light wells, right of the order cards; the one nearest the stairs shows the lobby ----
  const { wells, guardWell } = wellPlan(map, doorX);
  for (const x of wells)
    openings.push({
      kind: x === guardWell ? 'lobby' : 'well',
      x0: x - wallL,
      x1: x + WELL.w - wallL,
      y0: WELL.y0,
      y1: WELL.y1,
    });
  for (const o of openings)
    if (o.kind === 'door') {
      o.x0 -= wallL;
      o.x1 -= wallL;
    }
  put(
    foundationWall({ len: wallR - wallL, height: FOUNDATION_H, openings }),
    wallL,
    fz,
    0,
    0,
    'far',
  );
  // The guard, asleep at his desk up the lobby well.
  if (guardWell !== undefined)
    put(
      sleepingGuard,
      guardWell + WELL.w / 2 - 0.1,
      fz - LOBBY_DEPTH + 0.04,
      0,
      0,
      'far',
      WELL.y0 + LOBBY_DESK - 0.175,
    );

  // ---- Back: pipes and the duct along the foundation wall, round the stairs ----
  const runs = (gaps: [number, number][]): [number, number][] => {
    const out: [number, number][] = [];
    let x = wallL;
    for (const [a, b] of [...gaps].sort((p, q) => p[0] - q[0])) {
      if (a > x) out.push([x, a]);
      x = Math.max(x, b);
    }
    if (x < wallR) out.push([x, wallR]);
    return out.filter(([a, b]) => b - a > 0.3);
  };
  for (const [a, b] of runs(pipeGaps)) put(pipeRun(b - a), a, fz, 0, 0, 'near');
  for (const [a, b] of runs(ductGaps)) put(airDuct(b - a), a, fz, 0, 0, 'near');

  // ---- Left: the boiler room ----
  const stairsLeft = inboxEdge === 'left';
  const roomL = stairsLeft ? L - 0.62 - STAIR_WIDTH / 2 - 0.25 : L - 0.2;
  // The boiler: as far back as the order cards allow, out from the room.
  const bx = roomL - 1.7;
  let bz = fz + 1.7;
  // Its pipes and flue run back to the wall at about 2 high: keep those clear of the cards too.
  while (!clear(bx, bz - 0.55, 0.7, 2.1, 1.2) && bz < midZ) bz += 0.1;
  put(boiler, bx, bz, 0.2);
  put(steamWisp, bx + 0.33, bz + 0.05, 0.4, 0, 'near', 1.6);
  // The expansion tank on its bracket against the wall, left of the boiler.
  putClear(expansionTank, bx - 1.05, fz + 0.3, 0.45, 1.45, 0);
  // The NO STORAGE sign on the wall right of the boiler, and the storage stacked under it anyway.
  // The sign stands at the boiler room's way in, right of the boiler; the boxes piled round its feet.
  const signX = Math.min(roomL - 0.7, bx + 1.25);
  let signZ = bz - 0.2;
  while (!clear(signX, signZ, 0.66, 1.25, 0.06) && signZ < midZ) signZ += 0.1;
  put(boilerSign, signX, signZ, -0.12, 0, 'near');
  boxes(signX - 0.25, signZ + 0.4, 1, 0.05);
  boxes(signX + 0.3, signZ - 0.55, 2, -0.1);
  // A junk shelf against the wall past the tank, more boxes piled against it.
  putClear(junkShelf, bx - 2.0, fz + 0.28, 0.5, 1.6, 0, 0);
  boxes(bx - 1.6, fz + 0.95, 0, 0.15);
  const colZ = bz + 1.6;
  // The night cleaner on her break, a coffee in hand, her cart and a mop bucket beside her.
  const cz = Math.min(F - 2.2, colZ + 1.3);
  const cx = Math.min(L - 1.6, roomL - 1.1);
  person(cx, cz, 0.5, 'sipping');
  putClear(cleaningCart, cx - 0.95, cz + 0.15, 0.5, 0.85, Math.PI / 2 - 0.15);
  putClear(mopBucket, cx - 0.3, cz + 0.85, 0.3, 0.7, 0.4);
  // Out toward the frame's front-left corner, low: more boxes, a reel of cable.
  boxes(roomL - 0.5, cz + 1.6, 2, -0.1);
  putClear(cableReel, cx - 0.9, cz + 1.7, 0.35, 0.55, 0.3, 0);
  // Out by the frame's left edge, more junk so the floor never runs empty to the edge.
  for (let z = fz + 1.6, k = 0; z < F; z += 1.5, k++) {
    const x = edgeL(z) + 0.75;
    if (x > bx - 0.9) continue;
    if (k % 2) boxes(x, z, k + 1, 0.2 * k);
    else putClear(junkShelf, x, z, 0.5, 1.6, Math.PI / 2, k);
  }

  // ---- Right: the storage cage, Prod, the bike storage ----
  const cageL = R + 0.55;
  const cageR = Math.min(R + 3.9, edgeR(fz + 1) - 0.5);
  const cageD = 2.2;
  const cageF = fz + cageD;
  put(storageCage(cageR - cageL, cageD, (cageR - cageL) * 0.62), cageL, fz, 0, 0, 'near');
  // Inside: Demo Day's flight cases, the LAUNCHPAD roll-up, boxes, the balloon on the floor.
  cases(cageL + 0.6, fz + 0.45, 3, 1, 0.05);
  cases(cageL + 1.45, fz + 0.4, 2, 3, -0.08);
  putClear(launchpadBanner, cageR - 0.6, fz + 0.4, 0.45, 2.0, -0.15);
  boxes(cageR - 0.55, fz + 1.35, 1, 0.2);
  putClear(deflatedBalloon, cageL + 1.1, fz + 1.4, 0.3, 0.25, 0.6);
  cases(cageL + 0.5, fz + 1.5, 1, 2, 0.3);
  // The WE RAISED! banner zip-tied to the cage's front.
  const banner = 1.2;
  if (clear(cageL + 0.2 + banner / 2, cageF + 0.02, banner / 2, 1.5, 0.05, 1.25))
    put(raisedBanner(banner), cageL + 0.2, cageF + 0.03, 0, 0, 'near', 1.25);
  // Prod, in the seed round's far-too-big planter, squeezed into the corner by the cage, its grow lamp on.
  putClear(planterTree, R + 0.45, cageF + 0.42, 0.4, 1.5, 0.4);
  putClear(growLamp, R + 0.68, cageF + 0.55, 0.15, 0.6, -0.6, 0, 0.34);
  // A column with the breaker panel and the fire extinguisher on it.
  const pz = cageF + 1.15;
  const px = R + 2.35;
  if (putClear(column(2.2), px, pz, 0.25, 2.2)) {
    put(breakerPanel, px, pz + 0.2, 0, 0, 'near', 1.15);
    put(extinguisher, px - 0.21, pz, -Math.PI / 2, 0, 'near', 0.55);
  }
  // The bike storage: a stand along z, bikes side-on in it, the cargo bike past them.
  const bikeX = R + 1.45;
  const bz0 = pz + 0.75;
  const bikes = Math.max(2, Math.min(5, Math.floor((F - 2.6 - bz0) / 0.42) + 1));
  put(bikeStand(bikes), bikeX + 0.31, bz0, 0, 0, 'near');
  for (let k = 0; k < bikes; k++)
    putClear(
      bike,
      bikeX + (unit(k, 1, 23) - 0.5) * 0.12,
      bz0 + k * 0.42,
      0.55,
      0.6,
      0.04 * (k % 3) - 0.04,
      k,
    );
  const cbz = bz0 + bikes * 0.42 + 0.45;
  putClear(cargoBike, bikeX - 0.05, cbz, 0.7, 0.6, Math.PI / 2 + 0.05, 1);
  // Toward the front-right corner, low: a reel, boxes.
  putClear(cableReel, R + 0.95, cbz + 1.0, 0.35, 0.55, -0.3, 1);
  boxes(R + 2.0, cbz + 1.1, 0, -0.15);
  // Out by the frame's right edge: more of the building's storage.
  for (let z = cageF + 0.8, k = 0; z < F + 0.5; z += 1.4, k++) {
    const x = edgeR(z) - 0.75;
    if (x < px + 0.9) continue;
    if (k % 2) boxes(x, z, k, -0.2 * k);
    else putClear(junkShelf, x, z, 0.5, 1.6, -Math.PI / 2, k);
  }

  // ---- Front: the fibre duct from the ship hatch, Moppy's dock, the drain ----
  const frontZ = F + 0.1;
  if (shipEdge === 'front' && ship.length > 0) {
    const from = Math.max(...ship.map((t) => t.x)) + 0.2;
    put(fibreDuct(edgeR(frontZ) - from), from, frontZ, 0, 0, 'near');
  }
  // Moppy's dock: in a notch of void in the front if there is one (with the bucket), else on the apron.
  const notch = [...Array(width).keys()].filter(
    (x) => frontOf(x) < F - 0.01 && isVoid(x - 1, height - 1) && isVoid(x + 1, height - 1),
  );
  const dockX =
    notch.length > 0 ? (notch[Math.floor(notch.length / 2)] ?? 0) : R - Math.max(3, width * 0.25);
  const dockZ = notch.length > 0 ? frontOf(dockX) + 0.42 : F + APRON + 0.25;
  put(mopDock, dockX, dockZ, 0, 0, 'near');
  put(dockLight, dockX + 0.18, dockZ - 0.09, 0, 0, 'near', 0.12);
  put(wetFloorSign, dockX + 0.7, dockZ + 0.05, 0.35, 0, 'near');
  if (notch.length > 2) {
    put(floorDrain, (notch[notch.length - 1] ?? 0) + 0.45, dockZ - 0.05, 0.1, 0, 'near');
  }
  // The drain on the apron, left of the middle, clear of the pause hint.
  for (let x = Math.round(width * 0.28); x > 0; x--) {
    const z = frontOf(x) + APRON + 0.12;
    if (clear(x, z, 0.16, 0.02)) {
      put(floorDrain, x, z, 0.05, 0, 'near');
      break;
    }
  }

  // ---- Void tiles inside the outline: spare racks and a cable run at the back, low things in front ----
  const voids: Tile[] = map.tiles.flatMap((t, i) =>
    t === 'void' ? [{ x: i % width, z: Math.floor(i / width) }] : [],
  );
  const backVoids = voids.filter((t) => t.z < frontOf(t.x) - 0.5);
  const runsOf = (ts: Tile[]) => {
    const rows: Tile[][] = [];
    for (const t of [...ts].sort((a, b) => a.z - b.z || a.x - b.x)) {
      const last = rows[rows.length - 1];
      const prev = last?.[last.length - 1];
      if (last && prev && prev.z === t.z && prev.x === t.x - 1) last.push(t);
      else rows.push([t]);
    }
    return rows;
  };
  for (const row of runsOf(backVoids)) {
    const z = row[0]?.z ?? 0;
    const a = row[0]?.x ?? 0;
    const b = row[row.length - 1]?.x ?? 0;
    // Racks only where they stand against the back (nothing of the level behind them to hide).
    const backRow = row.every((t) => t.z === 0 || isVoid(t.x, t.z - 1));
    if (!backRow || b - a < 1) {
      row.forEach((t, k) => putClear(cableReel, t.x, t.z, 0.35, 0.55, 0.3 * k, k));
      continue;
    }
    // A rack row at each end, a cable tray across between on low stands, reels under it.
    const rz = z - 0.05;
    const ends = [a - 0.2, a + 0.42, b + 0.2, b - 0.42];
    ends.forEach((x, k) => {
      if (k === 1 && b - a < 3) return;
      if (k === 3 && b - a < 3) return;
      put(spareRack, x, rz, 0, k);
      if (k % 2 === 0) put(rackBlink, x, rz, 0, 0, 'near');
    });
    const t0 = a + (b - a >= 3 ? 0.75 : 0.15);
    const t1 = b - (b - a >= 3 ? 0.75 : 0.15);
    if (t1 - t0 > 0.6) {
      put(cableTray(t1 - t0), t0, rz - 0.15, 0, 0, 'near');
      put(cableReel, (t0 + t1) / 2 - 0.45, rz + 0.18, 0.2, 0);
      put(cableReel, (t0 + t1) / 2 + 0.5, rz + 0.12, -0.25, 1);
    }
  }

  // ---- Segfault, asleep on the warmest server on the server room's wall top (the Room's server) ----
  const cat = basementRoom(map).segfault;
  if (cat) put(segfaultCat, cat.x, cat.y, -0.15, 0, 'near', WALL_HEIGHT + SERVER_TOP - GROUND);

  return { horizon: HORIZON, ground, painters: PAINTERS, pieces, people, tufts: [] };
}

// ---- The scene's own ground ----

/**
 * Painted basement concrete in 2×2 saw-cut bays, each its own shade, getting
 * darker out toward the patch's edges, scuffs where carts and bikes go.
 */
const floor: GroundPainter = (b, g, salt) => {
  const top = 0.012;
  const cx = (g.x0 + g.x1) / 2;
  const cz = (g.z0 + g.z1) / 2;
  b.box(
    g.x1 - g.x0,
    top - 0.004,
    g.z1 - g.z0,
    tint(FLOOR, -0.35),
    { at: [cx, (top - 0.004) / 2, cz] },
    0,
  );
  const size = 2;
  for (let j = 0, z = g.z0; z < g.z1; j++, z += size)
    for (let i = 0, x = g.x0; x < g.x1; i++, x += size) {
      const xb = Math.min(g.x1, x + size);
      const zb = Math.min(g.z1, z + size);
      const mx = (x + xb) / 2 - cx;
      const mz = (z + zb) / 2 - cz;
      const out = Math.min(1, Math.hypot(mx / ((g.x1 - g.x0) / 2), mz / ((g.z1 - g.z0) / 2)));
      const s = shade(i, j, salt);
      const c = tint(FLOOR, (s - 0.5) * 0.08 - out * out * 0.28);
      b.box(xb - x - 0.02, 0.006, zb - z - 0.02, c, { at: [(x + xb) / 2, top, (z + zb) / 2] }, 0);
      if (s > 0.8)
        b.box(0.7, 0.003, 0.08, tint(c, -0.1), { at: [x + 0.8, top + 0.004, z + 0.6 + s] }, 0);
    }
};

/** The boiler room's bare concrete: darker, unpainted, with water and oil stains. */
const bare: GroundPainter = (b, g, salt) => {
  const top = 0.018;
  const w = g.x1 - g.x0;
  const d = g.z1 - g.z0;
  b.box(w, 0.006, d, BARE, { at: [(g.x0 + g.x1) / 2, top, (g.z0 + g.z1) / 2] }, 0);
  for (let k = 0; k < Math.floor(w * d * 0.3); k++) {
    const x = g.x0 + 0.4 + shade(k, 1, salt) * (w - 0.8);
    const z = g.z0 + 0.4 + shade(k, 2, salt) * (d - 0.8);
    const r = 0.2 + shade(k, 3, salt) * 0.35;
    if (k % 2) continue;
    b.cylinder(r, r, 0.003, tint(BARE, -0.06), { at: [x, top + 0.004, z] }, 14);
  }
};

/**
 * The painted apron along the walls: lighter grey, a worn yellow-and-black
 * safety line along its outer edge (the paint gone here and there).
 */
const apron: GroundPainter = (b, g, salt) => {
  const top = 0.024;
  const w = g.x1 - g.x0;
  const d = g.z1 - g.z0;
  b.box(w, 0.006, d, APRON_PAINT, { at: [(g.x0 + g.x1) / 2, top, (g.z0 + g.z1) / 2] }, 0);
  if (w < d) return;
  // Yellow with black diagonal bars, the paint worn through here and there.
  const z = g.z1 - 0.08;
  for (let x = g.x0 + 0.02, k = 0; x < g.x1 - 0.05; x += 0.3, k++) {
    const worn = shade(k, 5, salt) > 0.8;
    const l = Math.min(0.3, g.x1 - x);
    if (!worn) b.box(l, 0.004, 0.1, 0xd8b030, { at: [x + l / 2, top + 0.004, z] }, 0);
    for (const u of [0.08, 0.23])
      if (u < l && !(worn && u > 0.1))
        b.box(0.05, 0.004, 0.11, 0x2a2a2a, { at: [x + u, top + 0.006, z], rot: [0, 0.6, 0] }, 0);
  }
};

/** A painted yellow walkway line, worn in places. */
const line: GroundPainter = (b, g, salt) => {
  const w = g.x1 - g.x0;
  const d = g.z1 - g.z0;
  const along = d > w;
  const len = along ? d : w;
  for (let u = 0, k = 0; u < len; u += 0.7, k++) {
    if (shade(k, 9, salt) > 0.82) continue;
    const l = Math.min(0.62, len - u);
    const at: [number, number, number] = along
      ? [(g.x0 + g.x1) / 2, 0.03, g.z0 + u + l / 2]
      : [g.x0 + u + l / 2, 0.03, (g.z0 + g.z1) / 2];
    b.box(along ? w : l, 0.004, along ? l : d, 0xc8a432, { at }, 0);
  }
};

const PAINTERS: Readonly<Record<string, GroundPainter>> = { floor, bare, apron, line };
