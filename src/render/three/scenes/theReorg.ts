import type { LevelMap } from '../../../sim/level';
import { getTile } from '../../../sim/level';
import { gridToWorld, projectPoint } from '../../projection';
import { tileHash } from '../../mapShape';
import { tint } from '../kit';
import {
  beacon,
  cityRoof,
  monolithHQ,
  neighbourTower,
  prodTree,
  riverBoat,
  riverBridge,
  summerTree,
  tinyCar,
  towerFacade,
} from '../setDressing/backToBack';
import { pigeon } from '../setDressing/businessPark';
import { segfaultCat } from '../setDressing/onCall';
import { MATRIX_BED_Y } from '../setDressing/reorgWallTops';
import { reorgRoom } from '../rooms/reorgRoom';
import { WALL_HEIGHT } from '../layout';
import type { SetPiece } from '../setDressing/shared';
import {
  CONDENSER_TOP,
  condenser,
  condenserFan,
  curtainReturn,
  floorsBelow,
  helicopter,
  HELI_MAST,
  litWindows,
  receptionFloor,
  receptionWall,
  rotor,
  satelliteDish,
  setbackRoof,
  skylight,
  urnSteam,
} from '../setDressing/synergy';
import {
  BROKEN,
  brokenLetterX,
  brokenLogo,
  bubbleRolls,
  carpetRolls,
  COFFEE_STEAM,
  coffeeTrolley,
  crateStack,
  danglingO,
  deadPlant,
  forLease,
  DOLLY_TOP,
  FLOOR,
  fullStop,
  gantry,
  GANTRY,
  hangingO,
  laptopCrate,
  lorryLight,
  monoVan,
  monoWindows,
  moveSign,
  moveStickers,
  newSign,
  OLD_PX,
  oldLogo,
  palletTruck,
  panelCarry,
  panelGraveyard,
  partitionTrolley,
  prodDolly,
  removalLorry,
  roofCrates,
  roofHatch,
  rollCage,
  SIGN,
  stepladder,
  STOP,
  tinyCrowd,
  TROLLEY_HANDLE_X,
  wardrobeBoxes,
  wrappedY,
} from '../setDressing/theReorg';
import { scenePose } from './downTheHall';
import { shade } from './ground';
import {
  type AliveKind,
  GROUND,
  type GroundPainter,
  type GroundPatch,
  type Scene,
  type ScenePerson,
  type ScenePiece,
} from './types';

/**
 * 4-3 The Reorg's world (see `docs/plan/the-reorg-environment.md`): YOTTA
 * Tower's boardroom floor the morning after the synergy workshop, the day
 * the consultants reorganise it twice before lunch. Moving day, forever.
 *
 * Behind the back wall, 4-2's executive reception is the move's staging
 * area. On its wall the old steel `YOTTA` is coming off: the Y already on
 * the floor in bubble wrap, the O hanging by its last screw, a stepladder
 * under it. Beside it a yellow gantry hoists the new lit lowercase `yotta`,
 * swinging a little on its hook, and two removal men carry its full stop in
 * on their own, like a precious object. A removal man pushes a trolley of
 * partitions; consultants pace, sip and present to nobody with a clicker
 * by the "MOVE 3 OF 3" stand; Prod waits on a removal dolly with three MOVE
 * stickers on its pot. Under the order cards only low kit: crates, parked
 * partitions, a pallet truck, bubble wrap.
 *
 * Outside, the city far below (4-1's and 4-2's, from the same height, a day
 * later). On the left the street with removal lorries unloading more
 * partitions; across the river on the right MONOLITH's tower melting down:
 * its crown sign missing letters (the O dangling), half its windows dark,
 * its staff on the quay with their desk boxes, its own removal van, its
 * helicopter leaving. In the front corners, setback roofs a storey down
 * where the spare partitions are dumped (the partition graveyard), with
 * crates, a dead plant, condensers and pigeons; in front, the tower's
 * façade dropping away.
 *
 * Everything is placed from the map's outline (the back wall's run, the
 * voids, the front) and from where the frame's edges and the HUD fall at
 * 1440×810, so it holds for all three of the level's floor plans. Pure data.
 */

/** The street far below, on a summer morning. */
const HORIZON = 0x9c968a;
/** How far down the city lies (under the slab's foot): as 4-2's. */
const DEEP = -9.6;
/** The city's scale (as 4-1's and 4-2's). */
const CITY = 0.6;
/** The city's blocks a touch lighter than 4-1's: the summer sun on their roofs. */
const CITY_LIGHT = 1.12;
const CAR = 0.5;
const BLOCK_GAP = 0.8;
/** The plaza round the tower's foot, out to the left. */
const PLAZA_L = 5.8;
/** The staging area: how deep it runs behind the back wall, and its wall's height (4-2's reception). */
const STAGING = { depth: 3.2, wall: 2.35 } as const;
/** A setback roof sits this far under the level's floor (a storey down). */
export const SETBACK = 0.95;
/** MONOLITH's tower across the river: width, depth, its top (over the slab's foot) and its front. */
export const MONO = { w: 3.1, d: 2.0, top: -2.3, front: -8.2 } as const;
/** MONOLITH's crown sign's pixel, and its FOR LEASE banner's. */
export const MONO_PX = 0.07;
export const LEASE_PX = 0.07;
/**
 * Where MONOLITH's crown starts on screen at 1440×810: right of the staging
 * area, its whole crown in the frame (its foot, further down, leans in
 * behind the room's corner).
 */
export const MONO_LEFT = 1294;
const RIVER = { near: -2.5, far: -5.8 } as const;
/** How far the scene's people fade toward grey: well past the default, so none reads as a player. */
const PERSON_GREY = 0.5;
/** MONOLITH's helicopter, bigger than life so it reads across the river. */
const HELI = 1.7;
/** MONOLITH's staff on its forecourt, bigger than the city's people so their boxes read. */
const CROWD = 1.4;
/** The removal lorries far below, bigger than the city's cars so they (and SWIFT MOVES) read. */
export const LORRY = 1.3;
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
/** The living props. */
const ALIVE: ReadonlyMap<SetPiece, AliveKind> = new Map<SetPiece, AliveKind>([
  [newSign, 'sway'],
  [hangingO, 'sway'],
  [urnSteam, 'wisp'],
  [rotor, 'spin'],
  [beacon, 'blink'],
  [lorryLight, 'blink'],
  [pigeon, 'peck'],
  [riverBoat, 'bob'],
  [condenserFan, 'spin'],
  [fullStop, 'pace'],
  [partitionTrolley, 'pace'],
]);
/** Someone carrying something holds it this far out and this high. */
const CARRY = { reach: 0.3 } as const;
/**
 * Where the manager stands (the map's `M`): nobody in the staging area
 * stands within this far of it along x, or their head reads as a second
 * Derek over his.
 */
export const MANAGER_CLEAR = 1.5;
/** How far a pushing man stands behind the handle he holds (the `mowing` pose's grip). */
const PUSH_REACH = 0.27;

interface Tile {
  x: number;
  z: number;
}
/** A rectangle in world x and z (tile edges). */
export interface Rect {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

/** A number from 0 to 1 for point (a, b) with `salt`, stirred so nearby points differ. */
function unit(a: number, b: number, salt: number): number {
  let h = tileHash(Math.round(a * 97) + salt * 7919, Math.round(b * 89) - salt * 31);
  h ^= h >>> 16;
  h = Math.imul(h, 0x45d9f3b);
  h ^= h >>> 16;
  return ((h >>> 0) % 1000) / 1000;
}

function bounds(tiles: readonly Tile[]): Rect {
  return {
    x0: Math.min(...tiles.map((t) => t.x)) - 0.5,
    x1: Math.max(...tiles.map((t) => t.x)) + 0.5,
    z0: Math.min(...tiles.map((t) => t.z)) - 0.5,
    z1: Math.max(...tiles.map((t) => t.z)) + 0.5,
  };
}

/**
 * What The Reorg's world is built round, read from the map: the back wall's
 * run (the staging area behind it, as wide), the voids in front (each a
 * setback roof) and the stem between them (the shipping lobby). Shared with
 * the tests. Pure.
 */
export interface ReorgPlan {
  staging: Rect;
  corners: Rect[];
  /** The lobby's stem in front, between the corners: its x extent. */
  stem: { x0: number; x1: number; z0: number };
}

export function reorgPlan(map: LevelMap): ReorgPlan {
  const { width, height } = map;
  const isVoid = (x: number, z: number) => getTile(map, x, z) === 'void';
  const back: Tile[] = [];
  for (let x = 0; x < width; x++) if (!isVoid(x, 0)) back.push({ x, z: 0 });
  const run = back.length > 0 ? bounds(back) : { x0: -0.5, x1: width - 0.5, z0: -0.5, z1: 0.5 };
  const staging = { x0: run.x0, x1: run.x1, z0: -0.5 - STAGING.depth, z1: -0.52 };
  const seen = new Set<number>();
  const corners: Rect[] = [];
  for (let z = 0; z < height; z++)
    for (let x = 0; x < width; x++) {
      if (!isVoid(x, z) || seen.has(z * width + x)) continue;
      const group: Tile[] = [];
      const todo: Tile[] = [{ x, z }];
      seen.add(z * width + x);
      while (todo.length > 0) {
        const t = todo.pop() as Tile;
        group.push(t);
        for (const [dx, dz] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ] as const) {
          const nx = t.x + dx;
          const nz = t.z + dz;
          if (nx < 0 || nx >= width || nz < 0 || nz >= height) continue;
          if (!isVoid(nx, nz) || seen.has(nz * width + nx)) continue;
          seen.add(nz * width + nx);
          todo.push({ x: nx, z: nz });
        }
      }
      corners.push(bounds(group));
    }
  corners.sort((a, b) => a.x0 - b.x0);
  // The stem: the front row's own tiles.
  const front: Tile[] = [];
  for (let x = 0; x < width; x++) if (!isVoid(x, height - 1)) front.push({ x, z: height - 1 });
  const fr = front.length > 0 ? bounds(front) : { x0: -0.5, x1: width - 0.5 };
  const z0 = Math.min(...corners.map((c) => c.z0), height - 0.5);
  return { staging, corners, stem: { x0: fr.x0, x1: fr.x1, z0 } };
}

/** The scene round `map`: pure and deterministic. */
export function theReorgScene(map: LevelMap): Scene {
  const { width, height } = map;
  const L = -0.5;
  const R = width - 0.5;
  const F = height - 0.5;
  const pose = scenePose(map);
  const plan = reorgPlan(map);
  const rec = plan.staging;
  const xAt = (sx: number, z: number, lift = 0): number => {
    const a = projectPoint(pose, { x: 0, y: GROUND + lift, z });
    const b = projectPoint(pose, { x: 1, y: GROUND + lift, z });
    return (sx - a.x) / (b.x - a.x);
  };
  const isSlab = (x: number, z: number) => {
    const t = getTile(map, Math.round(x), Math.round(z));
    return t !== null && t !== 'void';
  };
  const clearOfRoom = (x: number, z: number) => {
    for (let dx = -1; dx <= 1; dx++)
      for (let dz = -1; dz <= 1; dz++)
        if (isSlab(Math.round(x) + dx, Math.round(z) + dz)) return false;
    return true;
  };
  const screenBox = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number) => {
    const pts = [];
    for (const x of [x0, x1])
      for (const y of [y0, y1])
        for (const z of [z0, z1]) pts.push(projectPoint(pose, { x, y: GROUND + y, z }));
    return [
      Math.min(...pts.map((p) => p.x)),
      Math.min(...pts.map((p) => p.y)),
      Math.max(...pts.map((p) => p.x)),
      Math.max(...pts.map((p) => p.y)),
    ] as const;
  };
  type Box = readonly [number, number, number, number];
  const hits = (r: Box, q: Box) => !(r[2] <= q[0] || r[0] >= q[2] || r[3] <= q[1] || r[1] >= q[3]);
  /** Whether a box `r` round (x, z) (`rz` along z), from `low` up to `high`, keeps clear of the HUD. */
  const clear = (x: number, z: number, r: number, high: number, rz = r, low = 0) => {
    const s = screenBox(x - r, x + r, low, high, z - rz, z + rz);
    const pad: Box = [s[0] - 3, s[1] - 3, s[2] + 3, s[3] + 3];
    return HUD.every((q) => !hits(pad, q));
  };

  const pieces: ScenePiece[] = [];
  const ground: GroundPatch[] = [];
  const people: ScenePerson[] = [];
  let n = 0;
  const put = (
    piece: SetPiece,
    x: number,
    z: number,
    yaw = 0,
    variant = 0,
    row: ScenePiece['row'] = 'near',
    lift = 0,
    size = 1,
  ) => {
    const i = n++;
    const lit = row === 'far' && lift === DEEP && size === CITY ? CITY_LIGHT : 1;
    const bright = (0.95 + unit(i, 1, 3) * 0.07) * lit;
    const cool = (unit(i, 2, 5) * 2 - 1) * 0.02;
    const alive = clearOfRoom(x, z) ? ALIVE.get(piece) : undefined;
    pieces.push({
      piece,
      variant: variant % (piece.variants ?? 1),
      at: gridToWorld(x, z, GROUND + lift),
      yaw,
      scale: [size, size, size],
      tint: [bright * (1 - cool), bright, bright * (1 + cool)],
      row,
      ...(alive ? { alive } : {}),
    });
  };
  const hot = () => {
    const p = pieces[pieces.length - 1];
    if (p) p.hot = true;
  };
  const live = (kind: AliveKind) => {
    const p = pieces[pieces.length - 1];
    if (p && clearOfRoom(p.at.x, p.at.z)) p.alive = kind;
  };
  const putClear = (
    piece: SetPiece,
    x: number,
    z: number,
    r: number,
    high: number,
    yaw = 0,
    variant = 0,
    lift = 0,
    size = 1,
    rz = r,
  ): boolean => {
    if (!clear(x, z, r, high + lift, rz, lift)) return false;
    put(piece, x, z, yaw, variant, 'near', lift, size);
    return true;
  };
  const patch = (kind: string, x0: number, x1: number, z0: number, z1: number, y = DEEP) => {
    if (x1 - x0 > 0.01 && z1 - z0 > 0.01)
      ground.push({ kind, x0, x1, z0, z1, ...(y !== 0 ? { y } : {}) });
  };
  const person = (
    x: number,
    z: number,
    yaw: number,
    p: ScenePerson['pose'],
    pace = false,
    lift = FLOOR,
  ) =>
    people.push({
      at: gridToWorld(x, z, GROUND + lift),
      yaw,
      pose: p,
      grey: PERSON_GREY,
      ...(pace ? { pace } : {}),
    });
  const c = CITY;

  const topZ = -28;
  const edgeL = Math.min(xAt(0, topZ, DEEP), xAt(0, F + 3, DEEP)) - 2;
  const edgeR = Math.max(xAt(VIEW.width, topZ, DEEP), xAt(VIEW.width, F + 3, DEEP)) + 2;

  // ---- The city far below: the ground ----
  const bridgeX = Math.max(R + 4.2, xAt(1370, RIVER.near, DEEP));
  const plazaL = L - PLAZA_L;
  const st = 1.0 * c;
  {
    const q = 0.3 * c;
    const plazaR = bridgeX - 0.4;
    patch('plaza', plazaL, plazaR, RIVER.near + q, F + 1.4);
    patch('street:z', plazaL - st, plazaL, RIVER.near + q, F + 30);
    patch('street:z', plazaR, plazaR + st, RIVER.near + q, F + 30);
    patch('street:x', edgeL - 4, edgeR + 4, F + 1.4, F + 1.4 + st);
    patch('quay', edgeL - 4, edgeR + 4, RIVER.near, RIVER.near + q);
    patch('river', edgeL - 4, edgeR + 4, RIVER.far, RIVER.near);
    patch('quay', edgeL - 4, edgeR + 4, RIVER.far - q, RIVER.far);
    patch('street:x', edgeL - 4, edgeR + 4, RIVER.far - q - st, RIVER.far - q);
    patch('city', edgeL - 4, plazaL - st, RIVER.near + q, F + 30);
    patch('city', plazaR + st, edgeR + 4, RIVER.near + q, F + 30);
    patch('city', edgeL - 4, edgeR + 4, topZ - 20, RIVER.far - q - st);
    patch('city', edgeL - 4, edgeR + 4, F + 1.4 + st, F + 30);
  }

  // ---- MONOLITH across the river on the right, melting down ----
  // Well back across the river, its crown's left edge right of the staging area on screen and
  // under the mute button's row, so it reads as the rival across the water, not next door.
  const monoX = xAt(MONO_LEFT, MONO.front, MONO.top + 0.1) + MONO.w / 2;
  {
    const { w, d, front, top } = MONO;
    const h = top - DEEP;
    const q = 0.3 * c;
    // Its forecourt down to the far street, where its staff stand with their desk boxes.
    patch('plaza', monoX - w / 2 - 0.4, monoX + w / 2 + 0.4, front, RIVER.far - q - st);
    put(monolithHQ(w, d, h), monoX, front, 0, 0, 'far', DEEP);
    // A new skin: 60% of its windows lit cool grey, 40% dark, whole floors and bays at a time.
    put(monoWindows(w, d, h), monoX, front, 0, 0, 'far', DEEP);
    // FOR LEASE hung off the front under the crown, on the right.
    put(forLease(LEASE_PX), monoX + 0.25, front + 0.03, 0, 0, 'far', top - 0.62);
    // The crown sign, the O and the L gone, the O hanging off by one corner, still lit.
    const px = MONO_PX;
    const lx = monoX - px;
    put(brokenLogo(px), lx, front + 0.03, 0, 0, 'far', top - 0.25);
    hot();
    const k = BROKEN[0];
    put(
      danglingO(px),
      lx + brokenLetterX(px, k) + 1.5 * px,
      front + 0.05,
      0,
      0,
      'far',
      top - 0.25 + 2.5 * px,
    );
    hot();
    live('sway');
    // One beacon left on the roof, at its back left (clear of the mute button).
    put(beacon, monoX - w / 2 + 0.3, front - d + 0.3, 0, 0, 'far', top + 0.18);
    hot();
    // Its helicopter leaving: lifted off the helipad, rotor turning, heading away.
    const hx = monoX - w * 0.42;
    const hz = front - d * 0.7;
    const hy = top + 0.4;
    put(helicopter, hx, hz, 2.6, 0, 'far', hy, HELI);
    put(
      rotor,
      hx + Math.sin(2.6) * 0.04 * HELI,
      hz + Math.cos(2.6) * 0.04 * HELI,
      0,
      0,
      'far',
      hy + HELI_MAST * HELI,
      HELI,
    );
    // Its staff out on the forecourt with their desk boxes, its removal van on the street.
    put(tinyCrowd(20, 1.9, 0), monoX + 0.45, front + 0.75, 0, 0, 'far', DEEP + 0.03, CROWD);
    live('bob');
    put(monoVan, monoX + w * 0.3, RIVER.far - q - st / 2, 0, 0, 'far', DEEP, 0.9);
    for (const [k, t] of [0.2, 0.5, 0.8].entries()) {
      put(
        tinyCrowd(5, 0.5, 2 + k),
        bridgeX,
        RIVER.far + (RIVER.near - RIVER.far) * t,
        Math.PI / 2,
        0,
        'far',
        DEEP + 0.35 * c,
        1,
      );
      live('bob');
    }
    // The bridge, boats on the river.
    put(
      riverBridge(RIVER.near - RIVER.far + 1.4 * c, 1.2 * c, 0.35 * c),
      bridgeX,
      (RIVER.near + RIVER.far) / 2,
      0,
      0,
      'far',
      DEEP,
    );
    put(riverBoat, monoX + 0.4, RIVER.far + 0.8, Math.PI, 0, 'far', DEEP, c);
    put(riverBoat, xAt(60, RIVER.near - 0.7, DEEP), RIVER.near - 0.7, 0, 0, 'far', DEEP, c);
  }

  // ---- The far bank: blocks behind the river, parks, plazas ----
  {
    let k = 0;
    const z0 = RIVER.far - 1.4 * c;
    for (let z = z0, j = 0; z > topZ; j++) {
      const bd = 2.6 + unit(j, 1, 11) * 1.4;
      for (let x = edgeL - 3, i = 0; x < edgeR + 3; i++) {
        const bw = 2.4 + unit(i, j, 13) * 1.8;
        const cx = x + (bw * c) / 2;
        const inMono = z > MONO.front - MONO.d - 1 && Math.abs(cx - monoX) < MONO.w / 2 + 0.8;
        const roll = unit(i, j, 23);
        if (!inMono && roll < 0.36) {
          patch(roll < 0.22 ? 'park' : 'plaza', x, x + bw * c, z - bd * c, z);
          for (let t = 0; t < (roll < 0.22 ? 4 : 2); t++)
            put(
              summerTree,
              x + (0.3 + unit(i, t, 27) * (bw - 0.6)) * c,
              z - (0.3 + unit(j, t, 29) * (bd - 0.6)) * c,
              0,
              t,
              'far',
              DEEP,
              c,
            );
        } else if (!inMono) {
          const glass = roll > 0.82;
          const bh =
            (glass ? 1.6 : 0.6) + unit(i, j, 17) * 1.8 + (j > 2 ? unit(i, j, 19) * 1.2 : 0);
          put(cityRoof(bw, bd, bh, k++, glass), cx, z, 0, 0, 'far', DEEP, c);
        }
        x += (bw + BLOCK_GAP) * c;
      }
      z -= (bd + BLOCK_GAP) * c;
    }
  }

  // ---- The near bank beside the tower: a neighbouring tower on the left, blocks, the street ----
  const nb = { w: 2.6 * c, d: 2.6 * c, top: -4.2, z: 9.4, x: 0 };
  nb.x = xAt(30, nb.z, nb.top) - nb.w / 2;
  put(neighbourTower(2.6, 2.6, (nb.top - DEEP) / c), nb.x, nb.z, 0, 0, 'far', DEEP, c);
  put(beacon, nb.x + nb.w / 2 - 0.12, nb.z - nb.d + 0.12, 0, 0, 'far', nb.top + 0.09);
  hot();
  {
    for (const side of [-1, 1] as const) {
      const sx = side < 0 ? plazaL - 0.5 * c : bridgeX + 0.2;
      for (let z = RIVER.near + 0.6, k = 0; z < F + 12; z += 1.1 * c, k++) {
        put(summerTree, sx + side * 0.75 * c, z, 0, k, 'far', DEEP, c);
        if (unit(k, side, 29) > 0.6 && side > 0)
          put(tinyCar, sx - 0.2 * c, z + 0.5 * c, Math.PI / 2, k, 'far', DEEP, c * CAR);
      }
    }
    for (let x = edgeL, k = 0; x < edgeR; x += 1.3 * c, k++)
      put(summerTree, x, RIVER.near + 0.55 * c, 0, k, 'far', DEEP, c);
    for (const side of [-1, 1] as const) {
      let k = 40 + (side + 1) * 20;
      const x0 = side < 0 ? plazaL - st - 0.9 * c : bridgeX + 0.4 + st + 0.9 * c;
      for (let z = RIVER.near + 0.6 * c, j = 0; z < F + 8; j++) {
        const bd = 2.6 + unit(j, side, 37) * 1.4;
        for (let x = x0, i = 0; side < 0 ? x > edgeL - 3 : x < edgeR + 3; i++) {
          const bw = 2.4 + unit(i, j * side, 41) * 1.6;
          const bh = 0.8 + unit(i, j * side, 43) * 2.2;
          const roll = unit(i, j * side, 47);
          const cx = x + (side * bw * c) / 2;
          const inNb =
            Math.abs(cx - nb.x) < (bw * c + nb.w) / 2 + 0.2 &&
            z < nb.z + 0.2 &&
            z + bd * c > nb.z - nb.d - 0.2;
          const xa = Math.min(x, x + side * bw * c);
          if (roll < 0.34 && !inNb) {
            patch(roll < 0.2 ? 'park' : 'plaza', xa, xa + bw * c, z, z + bd * c);
            for (let t = 0; t < 3; t++)
              put(
                summerTree,
                xa + (0.3 + unit(i, t, 49) * (bw - 0.6)) * c,
                z + (0.3 + unit(j, t, 51) * (bd - 0.6)) * c,
                0,
                t,
                'far',
                DEEP,
                c,
              );
          } else if (!inNb) put(cityRoof(bw, bd, bh, k), cx, z + bd * c, 0, 0, 'far', DEEP, c);
          k++;
          x += side * (bw + BLOCK_GAP) * c;
        }
        z += (bd + BLOCK_GAP) * c;
      }
    }
  }

  // ---- Far below on the left: the removal lorries at the tower's foot, unloading partitions ----
  {
    // On the plaza in the strip left of the tower's foot, side on to us so SWIFT MOVES reads,
    // its back to the tower and the tail lift down; two men walk a panel off it, toward the
    // doors; YOTTA's own lorry waits up the street behind it, toward the river.
    const lz = RIVER.near + 1.9;
    const lx = xAt(50, lz, DEEP);
    put(removalLorry, lx, lz, 0, 0, 'far', DEEP + 0.02, LORRY);
    put(lorryLight, lx, lz, 0, 0, 'far', DEEP + 0.02, LORRY);
    hot();
    put(panelCarry, lx + 0.7 * LORRY, lz + 0.5, 0.3, 0, 'far', DEEP + 0.02, LORRY);
    const bz = RIVER.near + 0.55;
    const bx = xAt(-30, bz, DEEP);
    put(removalLorry, bx, bz, 0, 1, 'far', DEEP + 0.02, LORRY);
    put(lorryLight, bx, bz, 0, 0, 'far', DEEP + 0.02, LORRY);
    hot();
    // More panels stacked on the plaza, waiting for the lift.
    put(
      panelGraveyard(2),
      xAt(215, RIVER.near + 1.2, DEEP),
      RIVER.near + 1.2,
      0.1,
      0,
      'far',
      DEEP + 0.02,
      0.5,
    );
  }

  // ---- The tower's own curtain wall dropping away: under the lobby's stem, the corners, the sides ----
  const roof = FLOOR - SETBACK;
  const corners = plan.corners.filter((r) => r.z0 > 0.5);
  {
    const top = corners.length > 0 ? roof - 0.06 : 0;
    put(towerFacade(R - L + 0.04, top - DEEP), L - 0.02, F + 0.02, 0, 0, 'far', top);
    put(floorsBelow(R - L), L, F + 0.065, 0, 0, 'far', top);
    put(litWindows(R - L), L, F + 0.065, 0, 0, 'far', top);
    hot();
    if (corners.length > 0) {
      const { x0, x1, z0 } = plan.stem;
      const storey = -top;
      // The lobby's storey in front, and its sides down to the roofs.
      put(towerFacade(x1 - x0 + 0.04, storey), x0 - 0.02, F + 0.02, 0, 0, 'far');
      put(towerFacade(F - z0, storey), x0 - 0.02, z0, -Math.PI / 2, 0, 'far');
      put(towerFacade(F - z0, storey), x1 + 0.02, F, Math.PI / 2, 0, 'far');
      // The floor's own front over each corner, down to its roof.
      for (const r of corners)
        put(towerFacade(r.x1 - r.x0, storey), r.x0, r.z0 + 0.01, 0, 0, 'far');
    }
    // The tower's sides, down from the floor (and the staging area) and from the corners' roofs.
    const back = rec.z0;
    const z8 = corners.length > 0 ? Math.min(...corners.map((r) => r.z0)) : F;
    put(towerFacade(z8 - back, -DEEP), L - 0.02, back, -Math.PI / 2, 0, 'far');
    put(towerFacade(z8 - back, -DEEP), R + 0.02, z8, Math.PI / 2, 0, 'far');
    if (z8 < F) {
      put(towerFacade(F - z8, top - DEEP), L - 0.02, z8, -Math.PI / 2, 0, 'far', top);
      put(towerFacade(F - z8, top - DEEP), R + 0.02, F, Math.PI / 2, 0, 'far', top);
    }
  }

  // ---- The front corners: setback roofs a storey down, where the spare partitions end up ----
  for (const [k, r] of corners.entries()) {
    const left = r.x0 <= L + 0.01;
    const x0 = r.x0 + 0.02;
    const x1 = r.x1 - 0.02;
    const z0 = r.z0 + 0.02;
    const z1 = r.z1 - 0.02;
    put(setbackRoof(x1 - x0, z1 - z0), (x0 + x1) / 2, (z0 + z1) / 2, 0, 0, 'far', roof);
    /** `o` in from the roof's inner edge (the lobby's side), mirrored between the corners. */
    const ix = (o: number) => (left ? x1 - o : x0 + o);
    const side = left ? -1 : 1;
    const ox = (o: number) => (left ? x0 + o : x1 - o);
    /** Everything on a roof: low, and out from under the HUD. */
    const on = (piece: SetPiece, x: number, z: number, rr: number, high: number, yaw = 0, v = 0) =>
      putClear(piece, x, z, rr, high, yaw, v, roof, 1, rr);
    // The inner half (beside the lobby, the one the HUD leaves free on the left): the partition
    // graveyard lying flat in film, crates dumped at the back (kept off the pipeline's corner), a
    // roof hatch propped open, a dead pot plant and a crate in front, pigeons between them.
    on(panelGraveyard(2), ix(1.05), z0 + 1.15, 0.85, 0.32, side * 0.08);
    on(roofCrates, ix(1.25), z0 + 0.32, 0.65, 0.62, side * -0.1);
    on(roofHatch, ix(0.75), z1 - 0.42, 0.3, 0.45, side * 0.15);
    on(deadPlant, ix(1.55), z1 - 0.32, 0.22, 0.55, 0.4);
    on(crateStack, ix(2.05), z1 - 0.55, 0.34, 0.31, side * 0.3, 0);
    // The good carpet, pulled up off the floor in strips and rolled.
    on(carpetRolls, ox(1.55), z0 + 1.55, 0.6, 0.3, side * 0.25);
    // The working roof out toward the outer edge: two condensers with their fans, a skylight,
    // a dish.
    for (const [k2, cz] of [z0 + 0.45, z0 + 1.1].entries()) {
      if (on(condenser, ox(0.5), cz, 0.3, CONDENSER_TOP + 0.05, side * (Math.PI / 2)))
        put(condenserFan, ox(0.5), cz, k2 * 0.7, 0, 'near', roof + CONDENSER_TOP);
    }
    on(skylight, ox(1.35), z1 - 0.55, 0.42, 0.3);
    on(satelliteDish, ox(0.55), z1 - 0.5, 0.22, 0.45, side * 0.6);
    // Pigeons where they're a tile from the room.
    const birds: [number, number][] = [
      [ix(1.3), z1 - 0.95],
      [ix(2.2), z0 + 1.5],
      [ix(1.2), z1 - 0.2],
      [ox(1.0), z1 - 0.95],
    ];
    for (const [j, [x, pz]] of birds.entries())
      if (clearOfRoom(x, pz)) on(pigeon, x, pz, 0.12, 0.2, side * (0.8 - j), k + j);
  }

  // ---- The staging area behind the back wall ----
  {
    const rx0 = rec.x0;
    const rx1 = rec.x1;
    const zWall = rec.z0;
    const cx = (rx0 + rx1) / 2;
    // The old logo on the wall, just right of the order cards.
    const logoW = 19 * OLD_PX;
    const logoY = 0.95;
    const oldX = xAt(752, zWall, FLOOR + logoY) + logoW / 2;
    const left = oldX - logoW / 2;
    // The gantry right of it, the full stop's carriers right of that, Prod at the end.
    const gx = oldX + logoW / 2 + 0.75 + GANTRY.span / 2;
    const gz = zWall + 0.75;
    put(receptionFloor(rx1 - rx0, rec.z1 - rec.z0), cx, (rec.z0 + rec.z1) / 2, 0, 0, 'far');
    put(
      receptionWall(rx1 - rx0, STAGING.wall, [
        { x: oldX - cx, w: logoW + 1.0 },
        { x: Math.min(rx1 - 0.8, gx + GANTRY.span / 2 + 1.6) - cx, w: 1.2 },
      ]),
      cx,
      zWall,
      0,
      0,
      'far',
      FLOOR,
    );
    put(curtainReturn(rec.z1 - rec.z0, STAGING.wall), rx0 + 0.04, rec.z0, 0, 0, 'far', FLOOR);
    put(curtainReturn(rec.z1 - rec.z0, STAGING.wall), rx1 - 0.04, rec.z1, Math.PI, 0, 'far', FLOOR);

    // The old YOTTA coming off: the O hanging by its last screw over its ghost, the Y down in
    // bubble wrap under its own ghost, the stepladder under the O.
    put(oldLogo, oldX, zWall + 0.02, 0, 0, 'near', FLOOR + logoY);
    const screwX = oldX + (7 - 19 / 2) * OLD_PX;
    put(hangingO, screwX, zWall + 0.04, 0, 0, 'near', FLOOR + logoY + 5 * OLD_PX);
    put(stepladder, left + 5.6 * OLD_PX, zWall + 0.55, 0.2, 0, 'near', FLOOR);
    put(wrappedY, left + 1.4 * OLD_PX, zWall + 0.62, 0.2, 0, 'near', FLOOR);

    // The gantry and the new lit sign on its hook, swinging a little.
    put(gantry, gx, gz, 0, 0, 'near', FLOOR);
    put(newSign, gx, gz, 0, 0, 'near', FLOOR + GANTRY.beam - GANTRY.hook);
    hot();

    // The full stop, carried in on its own between two removal men like a precious object,
    // shuffling it into place: just right of the `a` and a little under where the dot belongs.
    const step = SIGN.w / 5.4;
    const dotX = gx - SIGN.w / 2 + step * 5.25;
    const fx = dotX + 0.4;
    const fz = gz + 0.4;
    const hold = STOP.r + STOP.rim / 2 - 0.04 + CARRY.reach;
    person(fx - hold, fz, Math.PI / 2, 'carrying', true);
    person(fx + hold, fz, -Math.PI / 2, 'carrying', true);
    put(fullStop, fx, fz, 0, 0, 'near', FLOOR);
    hot();

    // Prod on its removal dolly at the far end, third move, three stickers on its pot.
    const prodX = Math.min(rx1 - 0.65, fx + 1.35);
    const prodZ = zWall + 0.6;
    put(prodDolly, prodX, prodZ, 0, 0, 'near', FLOOR);
    put(prodTree, prodX, prodZ, 0, 0, 'near', FLOOR + DOLLY_TOP);
    put(moveStickers, prodX, prodZ, 0, 0, 'near', FLOOR + DOLLY_TOP);
    // The pallet truck in front of Prod, a wrapped pallet of boxes on it.
    putClear(palletTruck, prodX - 0.25, zWall + 1.75, 0.7, 0.95, -0.15, 0, FLOOR, 1, 0.4);

    // Under the gantry's left leg, in front: a removal man pushing a trolley of partitions in
    // to the right, shuffling it back and forth to line it up.
    const tz = zWall + 1.6;
    const pushX = gx - GANTRY.span / 2 + 0.05;
    put(partitionTrolley, pushX + PUSH_REACH - TROLLEY_HANDLE_X, tz, 0, 0, 'near', FLOOR);
    person(pushX, tz, Math.PI / 2, 'mowing', true);

    // Between the old logo and the gantry, at the back: the coffee trolley, a consultant
    // sipping in front of it.
    const ct = oldX + logoW / 2 + 0.25;
    if (putClear(coffeeTrolley, ct, zWall + 0.45, 0.4, 1.2, 0, 0, FLOOR)) {
      put(
        urnSteam,
        ct + COFFEE_STEAM[0],
        zWall + 0.45 + COFFEE_STEAM[2],
        0,
        0,
        'near',
        FLOOR + COFFEE_STEAM[1],
      );
      person(ct - 0.35, zWall + 1.05, Math.PI - 0.5, 'sipping');
    }

    // In front of the old logo: the MOVE 3 OF 3 stand, a consultant presenting to it with a
    // clicker, the laptop on a crate; a consultant on the phone at the left end, by the cage.
    const mx = left - 0.2;
    putClear(moveSign, mx + 1.0, zWall + 1.4, 0.42, 1.55, -0.25, 0, FLOOR, 1, 0.2);
    person(mx + 1.65, zWall + 1.6, -Math.PI / 2 - 0.4, 'chatting');
    putClear(laptopCrate, mx + 2.05, zWall + 1.2, 0.32, 0.55, -0.3, 0, FLOOR);
    person(left + 0.1, zWall + 2.0, 0.5, 'phoning');

    // Segfault, asleep in the MATRIX box on the back wall's top (the Room's box).
    const cat = reorgRoom(map).segfault;
    if (cat) {
      const i = n++;
      pieces.push({
        piece: segfaultCat,
        variant: 0,
        at: gridToWorld(cat.x, cat.y, WALL_HEIGHT + 0.004 + MATRIX_BED_Y),
        yaw: cat.yaw + 0.3,
        scale: [0.92, 0.92, 0.92],
        tint: [0.98 + unit(i, 1, 3) * 0.02, 0.98, 0.98],
        row: 'near',
        alive: 'purr',
      });
    }

    // The left half, under the order cards on screen, stays low and as far back as it can
    // while it still clears them: crates, parked partitions, the pallet truck, bubble wrap.
    const backmost = (
      piece: SetPiece,
      x: number,
      r: number,
      high: number,
      rz: number,
      v = 0,
      yaw = 0,
    ) => {
      for (let z = rec.z1 - 2.2; z <= rec.z1 - 0.95; z += 0.1)
        if (putClear(piece, x, z, r, high, yaw, v, FLOOR, 1, rz)) return z;
      return null;
    };
    backmost(crateStack, rx0 + 0.7, 0.32, 0.31, 0.22, 0, 0.1);
    backmost(crateStack, rx0 + 3.4, 0.32, 0.31, 0.22, 0, -0.15);
    backmost(crateStack, rx0 + 6.0, 0.32, 0.62, 0.22, 1, -0.1);
    backmost(wardrobeBoxes, rx0 + 7.2, 0.56, 1.0, 0.28);
    backmost(crateStack, rx0 + 8.5, 0.32, 0.31, 0.22, 0, 0.2);
    // Just right of the order cards, bubble wrap waiting for the next thing to come off the wall.
    putClear(bubbleRolls, oldX - logoW / 2 - 0.45, zWall + 1.75, 0.56, 0.7, 0.2, 0, FLOOR, 1, 0.36);
    putClear(rollCage, oldX - logoW / 2 - 0.7, zWall + 0.42, 0.38, 1.4, 0.1, 0, FLOOR);
  }

  return {
    horizon: HORIZON,
    horizonY: DEEP,
    ground,
    painters: PAINTERS,
    pieces,
    people,
    tufts: [],
  };
}

// ---- The scene's own ground, far below, on a summer morning (4-2's) ----

type Builder = Parameters<GroundPainter>[0];

function fill(b: Builder, g: GroundPatch, top: number, color: number) {
  b.box(
    g.x1 - g.x0,
    0.004,
    g.z1 - g.z0,
    color,
    { at: [(g.x0 + g.x1) / 2, top, (g.z0 + g.z1) / 2] },
    0,
  );
}

function flags(b: Builder, g: GroundPatch, top: number, base: number, s: number, salt: number) {
  fill(b, g, top - 0.004, tint(base, 0.12));
  for (let j = 0, z = g.z0; z < g.z1 - 0.01; j++, z += s)
    for (let i = 0, x = g.x0; x < g.x1 - 0.01; i++, x += s) {
      const xb = Math.min(g.x1, x + s);
      const zb = Math.min(g.z1, z + s);
      b.box(
        xb - x - 0.03,
        0.003,
        zb - z - 0.03,
        tint(base, (shade(i, j, salt) - 0.5) * 0.08),
        { at: [(x + xb) / 2, top, (z + zb) / 2] },
        0,
      );
    }
}

const plaza: GroundPainter = (b, g, salt) => {
  flags(b, g, 0.02, 0xccc2b0, 1.0 * CITY, salt + 7);
};

function street(along: 'x' | 'z'): GroundPainter {
  return (b, g) => {
    fill(b, g, 0.006, 0x6c6a66);
    const len = along === 'x' ? g.x1 - g.x0 : g.z1 - g.z0;
    for (let u = 0.12; u < len; u += 0.6 * CITY) {
      const at: [number, number, number] =
        along === 'x' ? [g.x0 + u, 0.01, (g.z0 + g.z1) / 2] : [(g.x0 + g.x1) / 2, 0.01, g.z0 + u];
      const dash = 0.3 * CITY;
      b.box(along === 'x' ? dash : 0.02, 0.002, along === 'x' ? 0.02 : dash, 0xdcd4c0, { at }, 0);
    }
  };
}

const city: GroundPainter = (b, g) => {
  fill(b, g, 0.004, 0x7c7a74);
  const grid = 2.4 * CITY;
  for (let x = Math.ceil(g.x0 / grid) * grid; x < g.x1; x += grid)
    b.box(0.36 * CITY, 0.003, g.z1 - g.z0, 0xaca494, { at: [x, 0.008, (g.z0 + g.z1) / 2] }, 0);
};

const river: GroundPainter = (b, g, salt) => {
  fill(b, g, 0.002, 0x4a6a72);
  const w = g.x1 - g.x0;
  const d = g.z1 - g.z0;
  const count = Math.min(240, Math.floor(w * d * 1.3));
  for (let k = 0; k < count; k++)
    b.box(
      (0.3 + shade(k, 3, salt) * 0.5) * CITY,
      0.002,
      0.02,
      shade(k, 9, salt) > 0.75 ? 0xe8e0c8 : 0x7a989e,
      { at: [g.x0 + shade(k, 5, salt) * w, 0.006, g.z0 + 0.1 + shade(k, 7, salt) * (d - 0.2)] },
      0,
    );
};

const quay: GroundPainter = (b, g) => {
  fill(b, g, 0.03, 0xbcb2a2);
  b.box(g.x1 - g.x0, 0.03, 0.04, 0x6a665e, { at: [(g.x0 + g.x1) / 2, 0.015, g.z0 + 0.02] }, 0);
};

const park: GroundPainter = (b, g) => {
  fill(b, g, 0.012, 0x929a68);
  b.box(
    g.x1 - g.x0,
    0.003,
    0.07,
    0xdcd0b8,
    { at: [(g.x0 + g.x1) / 2, 0.016, (g.z0 + g.z1) / 2] },
    0,
  );
};

const PAINTERS: Readonly<Record<string, GroundPainter>> = {
  park,
  plaza,
  'street:x': street('x'),
  'street:z': street('z'),
  city,
  river,
  quay,
};
