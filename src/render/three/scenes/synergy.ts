import type { LevelMap } from '../../../sim/level';
import { getTile } from '../../../sim/level';
import { gridToWorld, projectPoint } from '../../projection';
import { tileHash } from '../../mapShape';
import { tint } from '../kit';
import {
  beacon,
  cityRoof,
  monolithHQ,
  monolithLogo,
  neighbourTower,
  riverBoat,
  riverBridge,
  summerTree,
  tinyCar,
  towerFacade,
} from '../setDressing/backToBack';
import { pigeon } from '../setDressing/businessPark';
import type { SetPiece } from '../setDressing/shared';
import {
  billboard,
  billboardWords,
  blackCar,
  briefcaseRow,
  coatRack,
  credenza,
  coveredTrolley,
  curtainReturn,
  dropOff,
  FLIP_TOP,
  flipChart,
  FLOOR,
  floorsBelow,
  gateLights,
  gondola,
  HELI_MAST,
  hazards,
  helicopter,
  lanyardTable,
  loafCat,
  monolithGlint,
  notebookBox,
  receptionDesk,
  receptionFloor,
  receptionWall,
  rug,
  rotor,
  SCREEN,
  sconce,
  satelliteDish,
  setbackRoof,
  skylight,
  speedGates,
  SUIT_POSE,
  suitFigure,
  sunFleck,
  tallPlant,
  umbrellaStand,
  urnSteam,
  visitorsSign,
  wallClock,
  wallArt,
  waterStation,
  welcomeLogos,
  welcomeScreen,
  workshopBoard,
  yottaFlag,
} from '../setDressing/synergy';
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
 * 4-2 Synergy's world (see `docs/plan/synergy-environment.md`): YOTTA
 * Tower's boardroom floor, a few floors above 4-1's, on a hot summer
 * afternoon: the day MONOLITH's executives came across the river for a
 * "synergy workshop".
 *
 * Behind the back wall, the executive reception, its floor level with
 * the room's: polished near-black stone, a stone and walnut-slat wall with
 * a warm cove, and on it, above the boardroom, the welcome screen with
 * YOTTA's violet logo and MONOLITH's white one side by side and
 * "× EXPLORING SYNERGIES ×" under them. Under it the long walnut desk and
 * its receptionist on the phone. MONOLITH's entourage waits on the right in
 * identical black suits and sunglasses, their coats identical on the rack;
 * on the left, low under the order cards, their identical briefcases lined
 * up, the covered catering trolleys, the lanyard table, the speed gates
 * and the "MONOLITH VISITORS" stand; their guard by the coats. The
 * facilitator talks at her flip chart; Segfault sleeps on top of it.
 *
 * In the corners, setback roofs a storey down (pigeons, a YOTTA flag).
 * Outside, the city far below in the afternoon sun; across the river on
 * the right MONOLITH's black tower, the sun in its glass, its helicopter
 * on the helipad with the rotor turning; far below on the right the
 * drop-off with MONOLITH's convoy of identical black cars, hazards on,
 * the driver waiting. In front, the tower's façade dropping away and the
 * window cleaners' gondola parked low at the right-hand corner.
 *
 * Everything is placed from the map's outline (the back wall's run, the
 * voids in the corners, the front) and from where the frame's edges and the
 * HUD fall at 1440×810. Pure data.
 */

/** The street far below, in the afternoon. */
const HORIZON = 0x9c968a;
/** How far down the city lies (under the slab's foot): a few floors further than 4-1's. */
const DEEP = -9.6;
/** The city's scale (as 4-1's): built smaller than life, so it reads far below. */
const CITY = 0.6;
/** How much lighter the city's blocks and trees are than 4-1's (its roofs in the sun). */
const CITY_LIGHT = 1.12;
/** Cars far below are smaller again. */
const CAR = 0.5;
/** The streets between the blocks, in city units. */
const BLOCK_GAP = 0.8;
/** The plaza round the tower's foot, out to the left. */
const PLAZA_L = 3.6;
/** The reception: how deep it runs behind the back wall, and its wall's height. */
const RECEPTION = { depth: 3.2, wall: 2.35 } as const;
/** How high the welcome screen's picture starts off the reception floor. */
const SCREEN_Y = 0.82;
/** A setback roof sits this far under the level's floor (a storey down). */
const SETBACK = 0.95;
/** MONOLITH's tower: width, depth, its top (over the slab's foot) and its front. */
const MONO = { w: 3.9, d: 2.4, top: -1.3, front: -6.3 } as const;
/** The river behind the tower, along x: its near and far banks. */
const RIVER = { near: -2.5, far: -5.8 } as const;
/** How far the scene's people fade toward grey: well past the default, so none reads as a player. */
const PERSON_GREY = 0.55;
/** Segfault a touch bigger than life, so it's findable on the flip chart. */
const CAT = 1.3;
/** MONOLITH's helicopter, bigger than life so it reads on the helipad across the river. */
const HELI = 1.7;
/** MONOLITH's suits are pieces of their own, at the scene people's size. */
const SUIT_SCALE = 0.9;
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
/** The living props. */
const ALIVE: ReadonlyMap<SetPiece, AliveKind> = new Map<SetPiece, AliveKind>([
  [loafCat, 'purr'],
  [rotor, 'spin'],
  [beacon, 'blink'],
  [gateLights, 'blink'],
  [hazards, 'blink'],
  [pigeon, 'peck'],
  [tallPlant, 'sway'],
  [yottaFlag, 'sway'],
  [urnSteam, 'wisp'],
  [riverBoat, 'bob'],
]);
/** Someone carrying something holds it this far out and this high. */
const CARRY = { reach: 0.3, lift: 0.5 } as const;

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

/** The bounding rectangle (tile edges) of some tiles. */
function bounds(tiles: readonly Tile[]): Rect {
  return {
    x0: Math.min(...tiles.map((t) => t.x)) - 0.5,
    x1: Math.max(...tiles.map((t) => t.x)) + 0.5,
    z0: Math.min(...tiles.map((t) => t.z)) - 0.5,
    z1: Math.max(...tiles.map((t) => t.z)) + 0.5,
  };
}

/**
 * What Synergy's world is built round, read from the map: the back wall's
 * run along the first row (the reception sits behind it, as wide) and the
 * voids (the corners, each a setback roof). Shared with the tests. Pure.
 */
export interface SynergyPlan {
  reception: Rect;
  corners: Rect[];
}

export function synergyPlan(map: LevelMap): SynergyPlan {
  const { width, height } = map;
  const isVoid = (x: number, z: number) => getTile(map, x, z) === 'void';
  const back: Tile[] = [];
  for (let x = 0; x < width; x++) if (!isVoid(x, 0)) back.push({ x, z: 0 });
  const run = back.length > 0 ? bounds(back) : { x0: -0.5, x1: width - 0.5, z0: -0.5, z1: 0.5 };
  const reception = {
    x0: run.x0,
    x1: run.x1,
    z0: -0.5 - RECEPTION.depth,
    z1: -0.52,
  };
  // The voids: groups of void tiles, joined side to side.
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
  return { reception, corners };
}

/** The scene round `map`: pure and deterministic. */
export function synergyScene(map: LevelMap): Scene {
  const { width, height } = map;
  const L = -0.5;
  const R = width - 0.5;
  const F = height - 0.5;
  const pose = scenePose(map);
  const plan = synergyPlan(map);
  const rec = plan.reception;
  /** The world x at screen x `sx`, on the ground (or `lift` above it) at depth z. */
  const xAt = (sx: number, z: number, lift = 0): number => {
    const a = projectPoint(pose, { x: 0, y: GROUND + lift, z });
    const b = projectPoint(pose, { x: 1, y: GROUND + lift, z });
    return (sx - a.x) / (b.x - a.x);
  };
  const isSlab = (x: number, z: number) => {
    const t = getTile(map, Math.round(x), Math.round(z));
    return t !== null && t !== 'void';
  };
  /** Whether (x, z) is a tile or more from the level's own tiles. */
  const clearOfRoom = (x: number, z: number) => {
    for (let dx = -1; dx <= 1; dx++)
      for (let dz = -1; dz <= 1; dz++)
        if (isSlab(Math.round(x) + dx, Math.round(z) + dz)) return false;
    return true;
  };
  /** The screen box of the world box x0..x1, y0..y1 up from the ground, z0..z1. */
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
  /** Puts `piece` with its origin at (x, z), on the ground or `lift` above it. */
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
    // The city's blocks a touch lighter than 4-1's: the afternoon sun is full on their roofs.
    const lit = row === 'far' && lift === DEEP && size === CITY ? CITY_LIGHT : 1;
    const bright = (0.95 + unit(i, 1, 3) * 0.07) * lit;
    const cool = (unit(i, 2, 5) * 2 - 1) * 0.02;
    // Living things move only a tile or more from the room.
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
  /** Makes the last piece put a hot one: its glow keeps its color and blooms. */
  const hot = () => {
    const p = pieces[pieces.length - 1];
    if (p) p.hot = true;
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
  const person = (x: number, z: number, yaw: number, p: ScenePerson['pose'], lift = FLOOR) =>
    people.push({ at: gridToWorld(x, z, GROUND + lift), yaw, pose: p, grey: PERSON_GREY });
  /** One of MONOLITH's suits, in pose `v`, on the reception floor where it keeps clear of the HUD. */
  const suit = (x: number, z: number, yaw: number, v: number) =>
    putClear(suitFigure, x, z, 0.3 * SUIT_SCALE, 1.0 * SUIT_SCALE, yaw, v, FLOOR, SUIT_SCALE);
  const c = CITY;

  // Where the frame's edges fall far below, a little past them.
  const topZ = -28;
  const edgeL = Math.min(xAt(0, topZ, DEEP), xAt(0, F + 3, DEEP)) - 2;
  const edgeR = Math.max(xAt(VIEW.width, topZ, DEEP), xAt(VIEW.width, F + 3, DEEP)) + 2;

  // ---- The city far below: the ground ----
  // The drop-off lane on the right, where it shows past the slab's edge.
  const dropZ = 0.4;
  const dropX = Math.max(R + 3.6, xAt(1402, dropZ, DEEP));
  const dropW = 0.5;
  {
    const plazaL = L - PLAZA_L;
    const plazaR = dropX - dropW / 2;
    const q = 0.3 * c;
    const st = 1.0 * c;
    patch('plaza', plazaL, plazaR, RIVER.near + q, F + 1.4);
    patch('street:z', plazaL - st, plazaL, RIVER.near + q, F + 30);
    patch('street:z', plazaR + dropW, plazaR + dropW + st, RIVER.near + q, F + 30);
    patch('dropoff', plazaR, plazaR + dropW, RIVER.near + q, F + 30);
    patch('street:x', edgeL - 4, edgeR + 4, F + 1.4, F + 1.4 + st);
    patch('quay', edgeL - 4, edgeR + 4, RIVER.near, RIVER.near + q);
    patch('river', edgeL - 4, edgeR + 4, RIVER.far, RIVER.near);
    patch('quay', edgeL - 4, edgeR + 4, RIVER.far - q, RIVER.far);
    patch('street:x', edgeL - 4, edgeR + 4, RIVER.far - q - st, RIVER.far - q);
    patch('city', edgeL - 4, plazaL - st, RIVER.near + q, F + 30);
    patch('city', plazaR + dropW + st, edgeR + 4, RIVER.near + q, F + 30);
    patch('city', edgeL - 4, edgeR + 4, topZ - 20, RIVER.far - q - st);
    patch('city', edgeL - 4, edgeR + 4, F + 1.4 + st, F + 30);
  }

  // ---- MONOLITH across the river, on the right, level with this floor ----
  const monoX = Math.min(xAt(1350, MONO.front, MONO.top) - MONO.w / 2, R + 3.4);
  {
    const { w, d, front, top } = MONO;
    const h = top - DEEP;
    put(monolithHQ(w, d, h), monoX, front, 0, 0, 'far', DEEP);
    // The afternoon sun in its black glass, and the sun's own fleck.
    const gh = 6;
    put(monolithGlint(w, gh), monoX, front + 0.035, 0, 0, 'far', top - 0.42 - gh);
    put(sunFleck, monoX + w * 0.28, front + 0.05, 0, 0, 'far', top - 1.1);
    hot();
    put(monolithLogo(0.07), monoX + 0.15, front + 0.03, 0, 0, 'far', top - 0.25);
    hot();
    put(beacon, monoX + w / 2 - 0.25, front - d + 0.3, 0, 0, 'far', top + 0.18);
    hot();
    // The helicopter on the helipad (see `monolithHQ`), its rotor turning over.
    const hx = monoX - w * 0.24;
    const hz = front - d * 0.42;
    put(helicopter, hx, hz, 0.7, 0, 'far', top + 0.02, HELI);
    put(
      rotor,
      hx + Math.sin(0.7) * 0.04 * HELI,
      hz + Math.cos(0.7) * 0.04 * HELI,
      0,
      0,
      'far',
      top + 0.02 + HELI_MAST * HELI,
      HELI,
    );
    // The bridge over to its plaza, boats on the river.
    const bx = Math.max(R + 4.2, xAt(1400, RIVER.near, DEEP));
    put(
      riverBridge(RIVER.near - RIVER.far + 1.4 * c, 1.2 * c, 0.35 * c),
      bx,
      (RIVER.near + RIVER.far) / 2,
      0,
      0,
      'far',
      DEEP,
    );
    put(
      riverBoat,
      xAt(1300, RIVER.far + 0.55, DEEP) + 0.5,
      RIVER.far + 0.55,
      Math.PI,
      0,
      'far',
      DEEP,
      c,
    );
    put(riverBoat, xAt(50, RIVER.near - 0.7, DEEP), RIVER.near - 0.7, 0, 0, 'far', DEEP, c);
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

  // ---- The near bank beside the tower: a neighbouring tower with MONOLITH's billboard, blocks ----
  const nb = { w: 2.6 * c, d: 2.6 * c, top: -3.4, z: 1.2, x: 0 };
  nb.x = xAt(60, nb.z, nb.top) - nb.w / 2;
  put(neighbourTower(2.6, 2.6, (nb.top - DEEP) / c), nb.x, nb.z, 0, 0, 'far', DEEP, c);
  {
    // MONOLITH's billboard on its roof, facing the tower: they're everywhere now.
    const bw = 1.3;
    const bz = nb.z - nb.d * 0.55;
    put(billboard(bw), nb.x + 0.05, bz, 0.25, 0, 'far', nb.top + 0.09);
    put(billboardWords(bw), nb.x + 0.05, bz, 0.25, 0, 'far', nb.top + 0.09);
    hot();
    put(beacon, nb.x + nb.w / 2 - 0.12, nb.z - nb.d + 0.12, 0, 0, 'far', nb.top + 0.09);
    hot();
  }
  {
    // Trees and parked cars along the streets beside the tower, the quay's trees.
    for (const side of [-1, 1] as const) {
      const sx = side < 0 ? L - PLAZA_L - 0.5 * c : dropX + dropW / 2 + 0.5 * c;
      for (let z = RIVER.near + 0.6, k = 0; z < F + 12; z += 1.1 * c, k++) {
        put(summerTree, sx + side * 0.75 * c, z, 0, k, 'far', DEEP, c);
        if (unit(k, side, 29) > 0.55 && side < 0)
          put(
            tinyCar,
            sx + (unit(k, side, 31) > 0.5 ? 0.22 : -0.22) * c,
            z + 0.5 * c,
            Math.PI / 2,
            k,
            'far',
            DEEP,
            c * CAR,
          );
      }
    }
    for (let x = edgeL, k = 0; x < edgeR; x += 1.3 * c, k++)
      put(summerTree, x, RIVER.near + 0.55 * c, 0, k, 'far', DEEP, c);
    for (const side of [-1, 1] as const) {
      let k = 40 + (side + 1) * 20;
      const x0 = side < 0 ? L - PLAZA_L - 1.4 * c : dropX + dropW / 2 + 1.4 * c;
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

  // ---- The drop-off far below on the right: MONOLITH's convoy, the driver waiting ----
  {
    const len = 3.4;
    put(dropOff(len, dropW), dropX, dropZ, 0, 0, 'far', DEEP + 0.01);
    const cars = 5;
    const size = c * CAR * 2;
    const step = 0.62 * size;
    const z0 = dropZ - ((cars - 1) * step) / 2;
    for (let k = 0; k < cars; k++)
      put(blackCar, dropX, z0 + k * step, -Math.PI / 2, 0, 'far', DEEP + 0.01, size);
    // The lead car's hazards blinking, its driver beside it in his cap.
    const lead = z0 + (cars - 1) * step;
    put(hazards, dropX, lead, -Math.PI / 2, 0, 'far', DEEP + 0.01, size);
    hot();
    put(
      suitFigure,
      dropX - dropW / 2 - 0.05,
      lead + 0.05,
      -Math.PI / 2 + 0.4,
      SUIT_POSE.driver,
      'far',
      DEEP + 0.01,
      0.34,
    );
  }

  // ---- The tower's own curtain wall dropping away under the front ----
  put(towerFacade(R - L + 0.04, -DEEP), L - 0.02, F + 0.02, 0, 0, 'far');
  // The floors below behind it: blinds down against the sun, a lamp on, notes on the glass.
  put(floorsBelow(R - L), L, F + 0.065, 0, 0, 'far');

  // ---- The corners: setback roofs a storey down ----
  for (const [k, r] of plan.corners.entries()) {
    // Only the corners at the back: a void in front would be another story.
    if (r.z0 > 0.5) continue;
    const left = r.x0 <= L + 0.01;
    const x0 = left ? r.x0 - 0.9 : r.x0 + 0.02;
    const x1 = left ? r.x1 - 0.02 : r.x1 + 0.9;
    const z0 = r.z0 + 0.02;
    const z1 = r.z1 - 0.02;
    const lift = FLOOR - SETBACK;
    put(setbackRoof(x1 - x0, z1 - z0), (x0 + x1) / 2, (z0 + z1) / 2, 0, 0, 'far', lift);
    // Pigeons on the gravel, at the back where they're a tile from the room.
    const px = left ? r.x0 + 0.45 : r.x1 - 0.45;
    put(pigeon, px, r.z0 + 0.45, left ? 0.8 : -0.8, k, 'near', lift);
    put(pigeon, px + (left ? -0.35 : 0.35), r.z0 + 0.85, left ? -0.4 : 0.5, k + 1, 'near', lift);
    // A skylight over the floor below; on the right-hand roof YOTTA's flag and a dish.
    put(skylight, (x0 + x1) / 2 + (left ? -0.2 : 0.2), z1 - 0.75, 0, 0, 'near', lift);
    if (!left) {
      put(yottaFlag, r.x1 + 0.35, r.z0 + 0.4, -0.3, 0, 'near', lift + 0.02);
      put(satelliteDish, r.x1 + 0.4, (z0 + z1) / 2, -0.6, 0, 'near', lift);
    }
  }

  // ---- The executive reception behind the back wall ----
  {
    const rx0 = rec.x0;
    const rx1 = rec.x1;
    const zWall = rec.z0;
    const cx = (rx0 + rx1) / 2;
    // The welcome screen sits above the boardroom, but right of the order cards on screen.
    const wx = Math.max(cx + 1.5, xAt(712, zWall, FLOOR + SCREEN_Y) + SCREEN.w / 2);
    const wy = FLOOR + SCREEN_Y + SCREEN.h / 2;
    put(receptionFloor(rx1 - rx0, rec.z1 - rec.z0), cx, (rec.z0 + rec.z1) / 2, 0, 0, 'far');
    put(
      receptionWall(rx1 - rx0, RECEPTION.wall, [
        { x: wx - cx, w: SCREEN.w + 1.4 },
        { x: Math.min(rx1 - 0.72, wx + SCREEN.w / 2 + 2.75) - cx, w: 1.3 },
      ]),
      cx,
      zWall,
      0,
      0,
      'far',
      FLOOR,
    );
    // The curtain wall at both ends, the blinds down against the sun.
    put(curtainReturn(rec.z1 - rec.z0, RECEPTION.wall), rx0 + 0.04, rec.z0, 0, 0, 'far', FLOOR);
    put(
      curtainReturn(rec.z1 - rec.z0, RECEPTION.wall),
      rx1 - 0.04,
      rec.z1,
      Math.PI,
      0,
      'far',
      FLOOR,
    );
    put(welcomeScreen, wx, zWall + 0.08, 0, 0, 'near', wy);
    put(welcomeLogos, wx, zWall + 0.08, 0, 0, 'near', wy);
    hot();
    for (const s of [-1, 1]) {
      put(sconce, wx + s * (SCREEN.w / 2 + 0.38), zWall + 0.02, 0, 0, 'near', wy + 0.05);
      hot();
    }
    // Left of the screen (under a third order card when there is one, so only dressing): a
    // big abstract in a brass frame over a low walnut credenza, a sconce each side.
    const artX = wx - SCREEN.w / 2 - 2.6;
    if (artX - 1.5 > rx0) {
      put(wallArt(2.2, 0.95), artX, zWall + 0.02, 0, 0, 'far', FLOOR + 1.35);
      put(credenza(2.4), artX, zWall + 0.25, 0, 0, 'far', FLOOR);
      for (const s of [-1, 1]) {
        put(sconce, artX + s * 1.45, zWall + 0.02, 0, 0, 'far', FLOOR + 1.4);
        hot();
      }
    }
    // The desk under it, the receptionist on the phone behind it.
    const deskLen = SCREEN.w - 0.8;
    const deskZ = zWall + 0.85;
    put(receptionDesk(deskLen), wx, deskZ, 0, 0, 'near', FLOOR);
    person(wx + deskLen * 0.08, zWall + 0.42, 0.2, 'phoning');
    // Right of the screen, against the wall: the water station (steam off the urn), the clock,
    // a tall plant, the coat rack and the umbrella stand at the end.
    const ws = wx + SCREEN.w / 2 + 1.35;
    put(waterStation, ws, zWall + 0.3, 0, 0, 'near', FLOOR);
    put(urnSteam, ws + 0.32, zWall + 0.26, 0, 0, 'near', FLOOR + 0.9);
    put(wallClock('15:40'), ws, zWall + 0.02, 0, 0, 'near', FLOOR + 1.55);
    hot();
    putClear(tallPlant, wx + SCREEN.w / 2 + 0.42, zWall + 0.35, 0.25, 1.35, 0.4, 0, FLOOR);
    const rackX = Math.min(rx1 - 0.5, ws + 1.4);
    putClear(coatRack, rackX, zWall + 0.45, 0.3, 1.45, 0.2, 0, FLOOR);
    putClear(umbrellaStand, rackX - 0.55, zWall + 0.3, 0.15, 0.62, 0, 0, FLOOR);
    // Their guard in front of the coats, hands behind his back, the earpiece in.
    suit(rackX + 0.2, zWall + 1.0, -0.35, SUIT_POSE.guard);
    // MONOLITH's entourage, in a tight block right of the desk: on the phone, arms crossed,
    // pointing at the boardroom, sipping, checking the time, reading the deck on a tablet.
    const ex = wx + SCREEN.w / 2 - 0.5;
    const ez = zWall + 1.45;
    // A rug where the visitors wait, and one under the desk's front.
    put(rug(3.4, 1.5), ex + 1.45, ez - 0.05, 0, 0, 'far', FLOOR);
    put(rug(deskLen + 0.6, 1.0), wx, deskZ + 0.75, 0, 0, 'far', FLOOR);
    suit(ex + 0.25, ez + 0.25, -0.3, SUIT_POSE.phoning);
    suit(ex + 0.8, ez - 0.35, -0.1, SUIT_POSE.armsCrossed);
    suit(ex + 1.35, ez + 0.4, 0.35, SUIT_POSE.pointing);
    suit(ex + 1.85, ez - 0.25, -0.5, SUIT_POSE.sipping);
    suit(ex + 2.35, ez + 0.3, -0.2, SUIT_POSE.watch);
    suit(ex + 2.75, ez - 0.4, -0.6, SUIT_POSE.briefcase);
    suit(wx + deskLen / 2 + 0.05, zWall + 0.75, -0.9, SUIT_POSE.tablet);
    // The workshop's A-board, pointing everyone at the boardroom.
    putClear(workshopBoard, ex - 0.35, ez + 0.2, 0.25, 0.56, 0.3, 0, FLOOR, 1, 0.16);
    // A YOTTA staffer bringing more MONOLITH notebooks through from the left.
    const sx = ex + 3.25;
    const sz = ez + 0.25;
    const syaw = -Math.PI / 2 - 0.3;
    person(sx, sz, syaw, 'carrying');
    put(
      notebookBox,
      sx + Math.sin(syaw) * CARRY.reach,
      sz + Math.cos(syaw) * CARRY.reach,
      syaw,
      0,
      'near',
      FLOOR + CARRY.lift,
    );
    // Left of the desk: the facilitator at her flip chart, Segfault asleep on top of it.
    const fz = zWall + 1.3;
    const flipX = Math.max(wx - deskLen / 2 - 0.65, xAt(706, fz, FLOOR + FLIP_TOP) + 0.42);
    put(flipChart, flipX, fz, 0.25, 0, 'near', FLOOR);
    put(loafCat, flipX - 0.02, fz + 0.02, 0.25, 0, 'near', FLOOR + FLIP_TOP, CAT);
    person(flipX + 0.65, fz + 0.15, -Math.PI / 2 + 0.55, 'chatting');

    // The left half, under the order cards on screen, stays low, and as far back as it can
    // while it still clears them, so it shows over the back wall: a covered trolley, the speed
    // gates, the lanyard table, the visitors' stand, the briefcases lined up,
    // the other trolley by the flip chart.
    const backmost = (
      piece: SetPiece,
      x: number,
      r: number,
      high: number,
      rz: number,
      v = 0,
      yaw = 0,
    ) => {
      for (let z = rec.z1 - 2.2; z <= rec.z1 - 1.15; z += 0.1)
        if (putClear(piece, x, z, r, high, yaw, v, FLOOR, 1, rz)) return z;
      return null;
    };
    backmost(coveredTrolley, rx0 + 0.65, 0.47, 0.62, 0.3, 0);
    const gx = rx0 + 1.85;
    const gz = backmost(speedGates, gx, 0.65, 0.56, 0.26);
    if (gz !== null) {
      put(gateLights, gx, gz, 0, 0, 'near', FLOOR);
      hot();
    }
    backmost(lanyardTable, rx0 + 3.75, 0.48, 0.56, 0.26);
    backmost(visitorsSign, rx0 + 4.7, 0.3, 0.8, 0.2, 0, -0.15);
    backmost(briefcaseRow(5), rx0 + 5.85, 0.95, 0.3, 0.06);
    backmost(coveredTrolley, rx0 + 7.15, 0.47, 0.62, 0.3, 1);
  }

  // ---- In front: the window cleaners' gondola parked low at the right-hand corner ----
  {
    // As far into the corner as it goes while it clears the timer, its rail just under the slab.
    const len = 1.4;
    const gz = F + 0.22;
    const lift = -0.06;
    for (let gx = R - 0.15 - len / 2; gx > R - 3; gx -= 0.1) {
      if (!clear(gx, gz, len / 2, FLOOR - 0.02, 0.2, lift - 0.38)) continue;
      put(gondola(len, FLOOR - lift - 0.02), gx, gz, 0, 0, 'near', lift);
      put(pigeon, gx - 0.35, gz + 0.16, 0.5, 1, 'near', lift + 0.0125);
      break;
    }
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

// ---- The scene's own ground, far below, in the afternoon ----

type Builder = Parameters<GroundPainter>[0];

/** A flat colored box on the ground: `top` high, over the whole patch. */
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

/** Paving flags `s` square in `base`, each its own tone, with paler joints. */
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

/** The plaza round the tower's foot: big pale flags, warm in the late sun. */
const plaza: GroundPainter = (b, g, salt) => {
  flags(b, g, 0.02, 0xccc2b0, 1.0 * CITY, salt + 7);
};

/** A street along x or z: sun-warmed asphalt, a dashed centre line. */
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

/** The drop-off lane: darker asphalt, yellow edge lines (the lane piece paints the rest). */
const dropoff: GroundPainter = (b, g) => {
  fill(b, g, 0.006, 0x5e5e5c);
  for (const x of [g.x0 + 0.02, g.x1 - 0.02])
    b.box(0.02, 0.002, g.z1 - g.z0, 0xe0cc70, { at: [x, 0.01, (g.z0 + g.z1) / 2] }, 0);
};

/** The city past the streets: a grid of pale pavements and asphalt, under the blocks. */
const city: GroundPainter = (b, g) => {
  fill(b, g, 0.004, 0x7c7a74);
  const grid = 2.4 * CITY;
  for (let x = Math.ceil(g.x0 / grid) * grid; x < g.x1; x += grid)
    b.box(0.36 * CITY, 0.003, g.z1 - g.z0, 0xaca494, { at: [x, 0.008, (g.z0 + g.z1) / 2] }, 0);
};

/** The river: deep green-blue, ripples catching the low sun in gold. */
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
      shade(k, 9, salt) > 0.7 ? 0xd8b880 : 0x7a989e,
      { at: [g.x0 + shade(k, 5, salt) * w, 0.006, g.z0 + 0.1 + shade(k, 7, salt) * (d - 0.2)] },
      0,
    );
};

/** A stone quay along the river: pale granite with a dark edge. */
const quay: GroundPainter = (b, g) => {
  fill(b, g, 0.03, 0xbcb2a2);
  b.box(g.x1 - g.x0, 0.03, 0.04, 0x6a665e, { at: [(g.x0 + g.x1) / 2, 0.015, g.z0 + 0.02] }, 0);
};

/** A city park: dry summer lawn, a pale path across it. */
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
  dropoff,
  city,
  river,
  quay,
};
