import type { LevelMap } from '../../../sim/level';
import { getTile } from '../../../sim/level';
import { gridToWorld, projectPoint } from '../../projection';
import { tileHash } from '../../mapShape';
import { tint } from '../kit';
import {
  beacon,
  bistroSet,
  carriedFan,
  cityRoof,
  closedBoard,
  CONDENSER,
  condenserCase,
  condenserFan,
  featureWall,
  floorGrille,
  FLOOR,
  glassRail,
  grassTrough,
  gravelBed,
  heatShimmer,
  lanyard,
  LIFT,
  liftDigits,
  liftDoor,
  lobbyBench,
  loftLetters,
  monolithHQ,
  monolithLogo,
  neighbourTower,
  oldLoft,
  paverDeck,
  pipeTray,
  prodTree,
  riverBoat,
  riverBridge,
  rollerCase,
  sprawledCat,
  steelLogo,
  stoneFloor,
  summerTree,
  textWidth,
  thermometer,
  timberDeck,
  tinyCar,
  tinyWagon,
  towerFacade,
  uplights,
} from '../setDressing/backToBack';
import { pigeon } from '../setDressing/businessPark';
import type { SetPiece } from '../setDressing/shared';
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
 * Back to Back's world (level 4-1, scene `back-to-back`; see
 * `docs/plan/back-to-back-environment.md`): a high floor of YOTTA Tower, the
 * HQ, on a summer heatwave morning.
 *
 * Behind the notch at the back, the tower's core: the lift lobby, a pale
 * stone floor and a dark stone wall with YOTTA's brushed-steel letters lit
 * from below, two lifts at floor 38 with a visitor waiting (lanyard, roller
 * case), facilities carrying in another fan, and in the niche on the left a
 * bench and an AC grille with Segfault flat out on the cool stone under it.
 *
 * Outside, the city far below in the haze (`DEEP` down): across the river
 * behind the tower, blocks and roof gardens, the old seed-round loft with its
 * lit letters still on; MONOLITH's black tower across the river on the right,
 * its top up near this floor, its logo lit, a beacon; the bridge, a boat, the
 * visitor bay at the tower's foot with Mom's beige station wagon; on the left
 * a neighbouring tower's top with its window cleaners' gondola parked. Under
 * the front, the tower's own curtain wall dropping away.
 *
 * In front, the sky terrace in the front-left void at this floor: pavers and
 * decking, a glass balustrade, empty bistro sets, a CLOSED A-board, a
 * thermometer at 38°, the condensers on their gravel bed (fans spinning, heat
 * shimmering) and Prod in a big planter by Mom's glass. A pigeon on the rail.
 *
 * Everything is placed from the map's outline, its voids (the notch, the
 * terrace, the corner), its ship tiles and from where the frame's edges fall
 * at 1440×810. Pure data.
 */

/** The street far below, in its haze. */
const HORIZON = 0x9a9890;
/** How far down the city lies (under the slab's foot). */
const DEEP = -7;
/** The lift lobby: its depth behind the back wall line, the niche's, its wall's height. */
/** The plaza round the tower's foot, out to the right (the visitor bays at its edge). */
const PLAZA_R = 4.0;
const LOBBY = { back: 2.2, wall: 1.75, left: 1.0, right: 3.4 } as const;
/** MONOLITH's tower: width, depth and its top (over the ground the slab stands on). */
const MONO = { w: 3.9, d: 2.4, top: -0.35, front: -7 } as const;
/** The river behind the tower, along x: its near and far banks. */
const RIVER = { near: -3.6, far: -6.3 } as const;
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
/** The player legend's right edge on screen. */
const HUD_LEGEND_RIGHT = 218;
/** The living props. */
const ALIVE: ReadonlyMap<SetPiece, AliveKind> = new Map<SetPiece, AliveKind>([
  [pigeon, 'peck'],
  [sprawledCat, 'purr'],
  [condenserFan, 'spin'],
  [beacon, 'blink'],
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
 * What Back to Back's world is built round, read from the map: the notch in
 * the back row (the lift lobby), the void in front (the terrace: its biggest
 * piece) and any other void in front (the corner). Shared with the tests. Pure.
 */
export interface BackToBackPlan {
  notch: Rect;
  terrace: Rect;
  corners: Rect[];
}

export function backToBackPlan(map: LevelMap): BackToBackPlan {
  const { width, height } = map;
  const isVoid = (x: number, z: number) => getTile(map, x, z) === 'void';
  // The notch: void tiles in the back row with the level's tiles both sides.
  const back: Tile[] = [];
  for (let x = 0; x < width; x++) {
    if (!isVoid(x, 0)) continue;
    let l = false;
    let r = false;
    for (let k = x - 1; k >= 0; k--) if (!isVoid(k, 0)) l = true;
    for (let k = x + 1; k < width; k++) if (!isVoid(k, 0)) r = true;
    if (l && r) back.push({ x, z: 0 });
  }
  const notch =
    back.length > 0
      ? bounds(back)
      : { x0: width / 2 - 2.5, x1: width / 2 + 2.5, z0: -0.5, z1: 0.5 };
  // The voids in front: groups of void tiles past the first row, joined side to side.
  const seen = new Set<number>();
  const groups: Tile[][] = [];
  for (let z = 1; z < height; z++)
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
          if (nx < 0 || nx >= width || nz < 1 || nz >= height) continue;
          if (!isVoid(nx, nz) || seen.has(nz * width + nx)) continue;
          seen.add(nz * width + nx);
          todo.push({ x: nx, z: nz });
        }
      }
      groups.push(group);
    }
  groups.sort((a, b) => b.length - a.length);
  const [big, ...rest] = groups;
  return {
    notch,
    terrace: big ? bounds(big) : { x0: -0.5, x1: 3.5, z0: height - 1.5, z1: height - 0.5 },
    corners: rest.map(bounds),
  };
}

/** The scene round `map`: pure and deterministic. */
export function backToBackScene(map: LevelMap): Scene {
  const { width, height } = map;
  const L = -0.5;
  const R = width - 0.5;
  const F = height - 0.5;
  const pose = scenePose(map);
  const plan = backToBackPlan(map);
  const { notch, terrace } = plan;
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
    const pad: Box = [s[0] - 2, s[1] - 2, s[2] + 2, s[3] + 2];
    return HUD.every((q) => !hits(pad, q));
  };
  const tilesOf = (kind: string): Tile[] =>
    map.tiles.flatMap((t, i) => (t === kind ? [{ x: i % width, z: Math.floor(i / width) }] : []));
  const ship = tilesOf('ship');
  const shipFront = ship.filter((t) => t.z === terrace.z0 - 0.5);
  const shipX0 = shipFront.length > 0 ? Math.min(...shipFront.map((t) => t.x)) - 0.5 : NaN;

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
    const bright = 0.95 + unit(i, 1, 3) * 0.07;
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
  const person = (x: number, z: number, yaw: number, pose: ScenePerson['pose'], lift = FLOOR) =>
    people.push({ at: gridToWorld(x, z, GROUND + lift), yaw, pose });

  // Where the frame's edges fall far below, a little past them.
  const topZ = -26;
  const edgeL = Math.min(xAt(0, topZ, DEEP), xAt(0, F + 3, DEEP)) - 2;
  const edgeR = Math.max(xAt(VIEW.width, topZ, DEEP), xAt(VIEW.width, F + 3, DEEP)) + 2;
  const backLine = -0.5;

  // ---- The city far below: the ground ----
  {
    // Round the tower's foot, its plaza, with the streets either side and in front.
    const plazaL = L - 2.4;
    const plazaR = R + PLAZA_R;
    patch('plaza', plazaL, plazaR, RIVER.near + 0.3, F + 2.2);
    patch('street:z', plazaL - 1.0, plazaL, RIVER.near + 0.3, F + 30);
    patch('street:z', plazaR, plazaR + 1.0, RIVER.near + 0.3, F + 30);
    patch('street:x', edgeL - 4, edgeR + 4, F + 2.2, F + 3.2);
    // The near bank's quay, the river, the far quay.
    patch('quay', edgeL - 4, edgeR + 4, RIVER.near, RIVER.near + 0.3);
    patch('river', edgeL - 4, edgeR + 4, RIVER.far, RIVER.near);
    patch('quay', edgeL - 4, edgeR + 4, RIVER.far - 0.3, RIVER.far);
    patch('street:x', edgeL - 4, edgeR + 4, RIVER.far - 1.2, RIVER.far - 0.3);
    // Out past the streets beside the tower: more city, blocks on a street grid.
    patch('city', edgeL - 4, plazaL - 1.0, RIVER.near + 0.3, F + 30);
    patch('city', plazaR + 1.0, edgeR + 4, RIVER.near + 0.3, F + 30);
    patch('city', edgeL - 4, edgeR + 4, topZ - 20, RIVER.far - 1.2);
    patch('city', edgeL - 4, edgeR + 4, F + 3.2, F + 30);
    // The visitor bays at the tower's foot, on the plaza's right.
    patch('bays', R + PLAZA_R - 1.1, R + PLAZA_R - 0.1, 0.3, 7.5);
  }

  // ---- The far bank: blocks behind the river, glass offices, parks, the old loft ----
  const monoX = Math.min(xAt(1345, MONO.front, MONO.top) - MONO.w / 2, R + 3.2);
  // The old seed-round loft, its letters still lit: right of the lobby, under the sky.
  const loftZ = RIVER.far - 4.0;
  const loftX = (xAt(1010, loftZ, DEEP + 2) + xAt(1100, loftZ, DEEP + 2)) / 2;
  {
    const lh = 1.5;
    put(oldLoft(1.5, 1.4, lh), loftX, loftZ + 0.05, 0, 0, 'far', DEEP);
    put(loftLetters(0.045), loftX, loftZ - 0.07, 0, 0, 'far', DEEP + lh + 0.07);
    hot();
  }
  {
    let k = 0;
    const z0 = RIVER.far - 1.4;
    for (let z = z0, j = 0; z > topZ; j++) {
      const bd = 2.0 + unit(j, 1, 11) * 1.4;
      for (let x = edgeL - 3, i = 0; x < edgeR + 3; i++) {
        const bw = 1.6 + unit(i, j, 13) * 1.6;
        const cx = x + bw / 2;
        // Leave MONOLITH's plot and the loft's.
        const inMono = j === 0 && cx > monoX - MONO.w / 2 - 1.2 && cx < monoX + MONO.w / 2 + 1.2;
        const inLoft = Math.abs(cx - loftX) < bw / 2 + 1.0 && z > loftZ - 0.5 && z - bd < loftZ;
        const roll = unit(i, j, 23);
        if (inLoft) {
          patch('park', x, x + bw, z - bd, z);
        } else if (!inMono && roll < 0.14) {
          // A little park: lawn, paths and trees.
          patch('park', x, x + bw, z - bd, z);
          for (let t = 0; t < 4; t++)
            put(
              summerTree,
              x + 0.3 + unit(i, t, 27) * (bw - 0.6),
              z - 0.3 - unit(j, t, 29) * (bd - 0.6),
              0,
              t,
              'far',
              DEEP,
            );
        } else if (!inMono) {
          const glass = roll > 0.82;
          const h = (glass ? 1.6 : 0.6) + unit(i, j, 17) * 1.8 + (j > 2 ? unit(i, j, 19) * 1.2 : 0);
          put(cityRoof(bw, bd, h, k++, glass), cx, z, 0, 0, 'far', DEEP);
        }
        x += bw + 0.5;
      }
      z -= bd + 0.5;
    }
  }

  // ---- MONOLITH across the river, on the right, its top up near this floor ----
  {
    const { w, d, front, top } = MONO;
    const h = top - DEEP;
    put(monolithHQ(w, d, h), monoX, front, 0, 0, 'far', DEEP);
    const px = 0.07;
    put(monolithLogo(px), monoX + 0.15, front + 0.03, 0, 0, 'far', top - 0.25);
    hot();
    put(beacon, monoX + w / 2 - 0.25, front - d + 0.3, 0, 0, 'far', top + 0.18);
    hot();
    // Its plaza on the far bank, a bridge over to it.
    const bx = Math.max(R + 4.2, xAt(1400, RIVER.near, DEEP));
    put(
      riverBridge(RIVER.near - RIVER.far + 1.4, 1.2, 0.35),
      bx,
      (RIVER.near + RIVER.far) / 2,
      0,
      0,
      'far',
      DEEP,
    );
    put(
      riverBoat,
      xAt(1250, RIVER.far + 0.9, DEEP) + 0.5,
      RIVER.far + 0.9,
      Math.PI,
      0,
      'far',
      DEEP,
    );
    put(riverBoat, xAt(40, RIVER.near - 0.8, DEEP), RIVER.near - 0.8, 0, 0, 'far', DEEP);
  }

  // ---- Round the tower's foot: the visitor bay with Mom's wagon, trees, cars ----
  {
    const bx = R + PLAZA_R - 0.6;
    for (let z = 0.85, k = 0; z < 7.4; z += 0.55, k++) {
      if (k === 7) put(tinyWagon, bx, z, Math.PI, 0, 'far', DEEP);
      else if (unit(k, 3, 23) > 0.35) put(tinyCar, bx, z, Math.PI, k, 'far', DEEP);
    }
    for (const side of [-1, 1] as const) {
      const sx = side < 0 ? L - 2.4 - 0.5 : R + PLAZA_R + 0.5;
      for (let z = RIVER.near + 1, k = 0; z < F + 12; z += 1.1, k++) {
        put(summerTree, sx - side * 0.75, z, 0, k, 'far', DEEP);
        if (unit(k, side, 29) > 0.55)
          put(
            tinyCar,
            sx + (unit(k, side, 31) > 0.5 ? 0.22 : -0.22),
            z + 0.5,
            Math.PI / 2,
            k,
            'far',
            DEEP,
          );
      }
    }
    // Along the near quay, a row of trees.
    for (let x = edgeL, k = 0; x < edgeR; x += 1.3, k++)
      put(summerTree, x, RIVER.near + 0.55, 0, k, 'far', DEEP);
    // Further out beside the tower, more blocks.
    for (const side of [-1, 1] as const) {
      let k = 40 + (side + 1) * 20;
      const x0 = side < 0 ? L - 3.4 - 0.4 : R + PLAZA_R + 1.4;
      for (let z = RIVER.near + 0.6, j = 0; z < F + 8; j++) {
        const bd = 2.0 + unit(j, side, 37) * 1.2;
        for (let x = x0, i = 0; side < 0 ? x > edgeL - 3 : x < edgeR + 3; i++) {
          const bw = 1.8 + unit(i, j * side, 41) * 1.2;
          const h = 0.8 + unit(i, j * side, 43) * 2.2;
          put(cityRoof(bw, bd, h, k++), x + (side * bw) / 2, z + bd, 0, 0, 'far', DEEP);
          x += side * (bw + 0.5);
        }
        z += bd + 0.5;
      }
    }
  }

  // ---- The neighbouring tower's top on the left, the window cleaners' gondola on its roof ----
  {
    const nz = 0.8;
    const top = -2.2;
    const nx = xAt(40, nz, top) - 1.2;
    put(neighbourTower(2.6, 2.6, top - DEEP), nx, nz, 0, 0, 'far', DEEP);
  }

  // ---- The tower's own curtain wall dropping away under the front ----
  put(towerFacade(R - L + 0.04, -DEEP), L - 0.02, F + 0.02, 0, 0, 'far');

  // ---- The lift lobby behind the notch ----
  {
    const lx0 = notch.x0 - LOBBY.left;
    const lx1 = notch.x1 + LOBBY.right;
    const zBack = backLine - LOBBY.back;
    // Where the niche ends and the feature wall starts: on screen, at the order cards' edge.
    const split = Math.max(notch.x0 + 1.4, xAt(700, zBack, FLOOR + 0.5));
    put(
      stoneFloor(notch.x1 - notch.x0 - 0.04, notch.z1 - notch.z0),
      (notch.x0 + notch.x1) / 2,
      0,
      0,
      0,
      'far',
    );
    put(
      stoneFloor(lx1 - lx0, LOBBY.back),
      (lx0 + lx1) / 2,
      backLine - LOBBY.back / 2 - 0.02,
      0,
      0,
      'far',
    );
    // The dark stone feature wall right across the back.
    put(featureWall(lx1 - lx0, LOBBY.wall), (lx0 + lx1) / 2, zBack, 0, 0, 'far', FLOOR);
    // YOTTA in steel, lit from below, between the niche and the lifts.
    const px = 0.12;
    const liftX = lx1 - 0.6 - LIFT.w / 2;
    const gap = LIFT.w + 0.3;
    const logoMid = (split + liftX - gap - LIFT.w / 2 - 0.2) / 2;
    put(steelLogo('YOTTA', px), logoMid - px * 1.75, zBack + 0.01, 0, 0, 'near', FLOOR + 0.5);
    put(
      uplights(textWidth('YOTTA') * px + 0.5),
      logoMid + px * 2.25,
      zBack + 0.08,
      0,
      0,
      'near',
      FLOOR,
    );
    hot();
    // Two lifts at floor 38, a visitor waiting at the first with her case.
    for (const k of [0, 1]) {
      const x = liftX - k * gap;
      put(liftDoor, x, zBack + 0.01, 0, 0, 'near', FLOOR);
      put(liftDigits('38'), x, zBack + 0.01, 0, 0, 'near', FLOOR);
      hot();
    }
    const vx = liftX - gap / 2;
    const vz = zBack + 0.7;
    const vyaw = -0.35;
    person(vx, vz, vyaw, 'phoning');
    put(
      lanyard,
      vx + Math.sin(vyaw) * 0.13,
      vz + Math.cos(vyaw) * 0.13,
      vyaw,
      0,
      'near',
      FLOOR + 0.42,
    );
    put(rollerCase, vx + 0.34, vz - 0.05, 0.3, 0, 'near', FLOOR);
    // Facilities carrying in another fan from the left, on their way to the lifts.
    const fx = Math.max(notch.x0 + 1.5, split + 0.25);
    const fz = backLine - 0.85;
    person(fx, fz, Math.PI / 2 - 0.2, 'carrying');
    put(carriedFan, fx + CARRY.reach, fz - 0.06, 0.4, 0, 'near', FLOOR + CARRY.lift, 1.3);
    // A bench on the left; on the right a floor grille breathing cold air, and Segfault flat out
    // on the coolest stone beside it.
    putClear(lobbyBench(1.0), notch.x0 + 0.9, zBack + 0.75, 0.5, 0.3, 0, 0, FLOOR, 1, 0.21);
    const gx = logoMid + px * 2;
    put(floorGrille(1.2), gx, zBack + 1.0, 0, 0, 'near', FLOOR);
    put(sprawledCat, gx - 0.05, zBack + 1.2, 0, 0, 'near', FLOOR);
  }

  // ---- The sky terrace in the front-left void ----
  {
    const t = terrace;
    const w = t.x1 - t.x0 - 0.04;
    const d = t.z1 - t.z0 - 0.04;
    const cx = (t.x0 + t.x1) / 2;
    const cz = (t.z0 + t.z1) / 2;
    put(paverDeck(w, d), cx, cz, 0, 0, 'far');
    // The balustrade along its front edge, from where it clears the player legend.
    const railZ = t.z1 - 0.08;
    const railX0 = Math.max(t.x0 + 0.02, xAt(HUD_LEGEND_RIGHT + 6, railZ, FLOOR + 0.55));
    put(glassRail(t.x1 - 0.04 - railX0), railX0, railZ, 0, 0, 'near', FLOOR);
    // Decking under the seating on the left, gravel for the plant on the right.
    const seatX0 = Math.max(t.x0 + 0.3, xAt(HUD_LEGEND_RIGHT + 24, t.z0 + 1.6, FLOOR));
    const seatX1 = Number.isFinite(shipX0) ? shipX0 - 0.55 : seatX0 + 3.6;
    put(
      timberDeck(seatX1 - seatX0, d - 0.95),
      (seatX0 + seatX1) / 2,
      cz - 0.12,
      0,
      0,
      'far',
      FLOOR - 0.01,
    );
    // A trough of sun-bleached grasses along the back of the deck, by the corridor's glass.
    putClear(
      grassTrough(seatX1 - seatX0 - 1.2),
      (seatX0 + seatX1) / 2 - 0.5,
      t.z0 + 0.3,
      (seatX1 - seatX0) / 2 - 0.6,
      0.42,
      0,
      0,
      FLOOR,
      1,
      0.2,
    );
    // Two empty bistro sets, chairs tipped against the tables.
    putClear(bistroSet, seatX0 + 0.75, cz + 0.05, 0.45, 0.45, 0.2, 0, FLOOR);
    putClear(bistroSet, seatX0 + 2.05, cz + 0.75, 0.45, 0.45, -0.3, 1, FLOOR);
    // The thermometer at the deck's end by the hatch, the CLOSED board out front.
    putClear(thermometer, seatX1 - 0.4, t.z0 + 0.75, 0.3, 0.6, 0, 0, FLOOR);
    putClear(closedBoard, seatX1 - 0.55, t.z1 - 0.75, 0.32, 0.55, -0.1, 0, FLOOR);
    // The condensers on their gravel bed, right across in front of the hatch: the reason the AC
    // can't keep up.
    const gx0 = seatX1 + 0.35;
    const gx1 = t.x1 - 1.25;
    const gz = t.z1 - 0.95;
    put(gravelBed(gx1 - gx0, 1.15), (gx0 + gx1) / 2, gz, 0, 0, 'near', FLOOR - 0.01);
    const units = Math.max(1, Math.floor((gx1 - gx0) / (CONDENSER.w + 0.14)));
    const step = (gx1 - gx0) / units;
    for (let k = 0; k < units; k++) {
      const x = gx0 + step * (k + 0.5);
      put(condenserCase, x, gz, 0, k, 'near', FLOOR + 0.01);
      put(condenserFan, x, gz, k * 0.7, 0, 'near', FLOOR + 0.01 + CONDENSER.h);
      put(heatShimmer, x, gz, k * 1.3, k, 'near', FLOOR + CONDENSER.h + 0.02);
    }
    // Their pipes along the deck behind them.
    put(pipeTray(gx1 - gx0), gx0, gz - CONDENSER.d / 2 - 0.16, 0, 0, 'near', FLOOR);
    // Prod in its big planter in the corner by Mom's glass, a small tree now.
    put(prodTree, t.x1 - 0.5, t.z0 + 1.35, 0.25, 0, 'near', FLOOR);
    // A pigeon on the rail, and one on the deck by the condensers.
    put(pigeon, xAt(560, railZ, FLOOR + 0.55), railZ, 0.6, 0, 'near', FLOOR + 0.535);
    put(pigeon, gx1 + 0.35, t.z1 - 0.35, -0.8, 1, 'near', FLOOR);
  }

  // ---- The corners: terrace pavers, a condenser of their own, the rail ----
  for (const c of plan.corners) {
    const w = c.x1 - c.x0 - 0.04;
    const d = c.z1 - c.z0 - 0.04;
    const cx = (c.x0 + c.x1) / 2;
    put(paverDeck(w, d), cx, (c.z0 + c.z1) / 2, 0, 0, 'far');
    if (w >= CONDENSER.d && d > 1.6) {
      putClear(condenserCase, cx, c.z1 - 0.9, 0.4, 0.5, -Math.PI / 2, 1, FLOOR + 0.01);
      putClear(condenserFan, cx, c.z1 - 0.9, 0.3, 0.1, 0.4, 0, FLOOR + 0.01 + CONDENSER.h);
    }
    if (c.z1 >= F - 0.01 && w > 0.3)
      put(glassRail(w), c.x0 + 0.02, c.z1 - 0.08, 0, 0, 'near', FLOOR);
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

// ---- The scene's own ground, far below ----

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
        {
          at: [(x + xb) / 2, top, (z + zb) / 2],
        },
        0,
      );
    }
}

/** The plaza round the tower's foot: big pale flags. */
const plaza: GroundPainter = (b, g, salt) => {
  flags(b, g, 0.02, 0xc8c2b6, 1.0, salt + 5);
};

/** A street along x or z: sun-bleached asphalt, a dashed centre line. */
function street(along: 'x' | 'z'): GroundPainter {
  return (b, g) => {
    fill(b, g, 0.006, 0x6a6c6e);
    const len = along === 'x' ? g.x1 - g.x0 : g.z1 - g.z0;
    for (let u = 0.2; u < len; u += 0.6) {
      const at: [number, number, number] =
        along === 'x' ? [g.x0 + u, 0.01, (g.z0 + g.z1) / 2] : [(g.x0 + g.x1) / 2, 0.01, g.z0 + u];
      b.box(along === 'x' ? 0.3 : 0.03, 0.002, along === 'x' ? 0.03 : 0.3, 0xd8d4c8, { at }, 0);
    }
  };
}

/** The city past the streets: a grid of pale pavements and asphalt, under the blocks. */
const city: GroundPainter = (b, g) => {
  fill(b, g, 0.004, 0x7a7a78);
  for (let x = Math.ceil(g.x0 / 2.4) * 2.4; x < g.x1; x += 2.4)
    b.box(0.36, 0.003, g.z1 - g.z0, 0xa8a49a, { at: [x, 0.008, (g.z0 + g.z1) / 2] }, 0);
};

/** The river: deep green-blue with paler ripples running along it. */
const river: GroundPainter = (b, g, salt) => {
  fill(b, g, 0.002, 0x4a6e78);
  const w = g.x1 - g.x0;
  const d = g.z1 - g.z0;
  const count = Math.min(220, Math.floor(w * d * 1.2));
  for (let k = 0; k < count; k++)
    b.box(
      0.3 + shade(k, 3, salt) * 0.5,
      0.002,
      0.03,
      0x7a9aa2,
      {
        at: [g.x0 + shade(k, 5, salt) * w, 0.006, g.z0 + 0.1 + shade(k, 7, salt) * (d - 0.2)],
      },
      0,
    );
};

/** A stone quay along the river: pale granite with a dark edge. */
const quay: GroundPainter = (b, g) => {
  fill(b, g, 0.03, 0xb8b2a6);
  b.box(g.x1 - g.x0, 0.03, 0.04, 0x6a665e, { at: [(g.x0 + g.x1) / 2, 0.015, g.z0 + 0.02] }, 0);
};

/** The visitor bays: asphalt with white bay lines along z, a VISITOR bay in violet. */
const bays: GroundPainter = (b, g) => {
  fill(b, g, 0.008, 0x5e6062);
  for (let z = g.z0 + 0.3; z < g.z1; z += 0.55)
    b.box(0.6, 0.002, 0.025, 0xe8e4d8, { at: [(g.x0 + g.x1) / 2 - 0.2, 0.012, z] }, 0);
};

/** A city park: dry summer lawn, a pale path across it. */
const park: GroundPainter = (b, g) => {
  fill(b, g, 0.012, 0x8a9a5a);
  b.box(
    g.x1 - g.x0,
    0.003,
    0.12,
    0xd8d0bc,
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
  bays,
};
