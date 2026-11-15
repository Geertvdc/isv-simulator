import * as THREE from 'three';
import type { LevelMap } from '../../../sim/level';
import { getTile } from '../../../sim/level';
import { gridToWorld, projectPoint } from '../../projection';
import { tileHash } from '../../mapShape';
import { tint } from '../kit';
import {
  blockWall,
  carriedBox,
  cityCrane,
  deliveryVan,
  deskBoxesUpright,
  deskBoxStack,
  dockCanopy,
  doormat,
  FLOOR,
  frankingMachine,
  heldBalloon,
  hoarding,
  LIFT,
  liftCar,
  liftFrame,
  mailSacks,
  mailTrolley,
  palletTruck,
  parcels,
  pigeonholes,
  pitLadder,
  postRoomSign,
  prodTub,
  rainOnGlass,
  raisedFloor,
  recyclingCage,
  shaftWall,
  shopRow,
  toteBag,
  umbrellaStand,
  umbrellaWalker,
  vanHazards,
  wetCar,
  wetFloorSign,
  welcomeBalloon,
  wheelieBin,
} from '../setDressing/hypergrowth';
import { bus, CRANE_TOWER, cherryTree, craneTower, curtainWall } from '../setDressing/midRise';
import { segfaultCat } from '../setDressing/onCall';
import { redLight } from '../setDressing/rooftop';
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
  type ScenePose,
} from './types';

/**
 * Hypergrowth's world (level 3-2, scene `hypergrowth`; see
 * `docs/plan/hypergrowth-environment.md`): the ground and first floor of
 * 3-1's mid-rise on a rainy spring day, hiring faster than the desks arrive.
 *
 * Behind the ground floor, the post room (the inbox is its pass-through): its
 * pigeonholes, the franking machine, a mail trolley at the hatch, grey sacks
 * and parcels, a POST ROOM sign, unopened flat-pack desk boxes stacked
 * against its walls with a few violet balloons, and a queue of new starters
 * with their welcome-pack totes waiting for the lift. Between the floors,
 * the open lift shaft: its dark concrete back wall, the pit with its
 * buffers, a ladder and a desk box that fell in, the lift's frame with the
 * motor on its header and the ropes down to the car, parked high with
 * Segfault asleep on its roof, the counterweight behind. Left of the ground
 * floor, the loading bay out into the rain: the dock canopy over the ship
 * hatch, the courier's van backed up to it with its doors open and its
 * hazard lights going, a pallet of desks on a pump truck, the driver
 * carrying a box in, the wheelie bin and a recycling cage overflowing with
 * desk-box cardboard by the bin hatch. Round the first floor, the building's
 * glass with rain running down it, and past it the wet street: pavements
 * with puddles and fallen blossom, cherry trees, people under umbrellas,
 * cars and a bus with their lights on, the shops across the road, and the
 * crane tower behind its hoarding, almost done, the crane still on its roof
 * with the red light blinking. In front, thin and low: the wet pavement, a
 * doormat, a WET FLOOR sign and an umbrella stand; on the stair landing at
 * the front right, Prod in a bigger pot.
 *
 * Everything is placed from the map's outline, its void tiles (the post
 * room and the shaft behind and between the floors, the landing), its ship,
 * bin and inbox tiles and its lift cabins, and from where the frame's edges
 * fall at 1440×810. Pure data.
 */

/** The wet street out to the horizon: rain-dark asphalt. */
const HORIZON = 0x4f565d;
/** Street pieces are a little smaller than the bay's: the first floor looks down on them. */
const STREET = 0.85;
/** The cherry trees along the pavements, scaled up from 3-1's (seen far below there). */
const TREE = 2.3;
/** How far the building's outer wall stands off the room's back and right walls. */
const SKIN = { back: 0.12, right: 0.35 } as const;
/** The street's widths: pavement, road, the far pavement. */
const WALK = 0.95;
const ROAD = 1.65;
const FAR_WALK = 0.9;
/** The apron in front of the loading bay, out from the building. */
const APRON = 1.85;
/** The one-storey building face seen from the first floor down (the right side). */
const FACE = 0.5;
/** The lift: its car's floor, the frame's header, the counterweight's bottom (above the pit). */
const CAR_BOTTOM = 1.4;
const HEADER = 3.05;
const CW_BOTTOM = 0.3;
/** Where a person holds a carried thing: out in front and up (scaled with them). */
const CARRY = { reach: 0.34, lift: 0.53 } as const;
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
/** The order cards' right edge on screen. */
const CARDS_RIGHT = 700;
/** The living props. */
const ALIVE: ReadonlyMap<SetPiece, AliveKind> = new Map<SetPiece, AliveKind>([
  [segfaultCat, 'purr'],
  [redLight, 'blink'],
  [vanHazards, 'blink'],
  [cherryTree, 'sway'],
  [umbrellaWalker, 'bob'],
  [welcomeBalloon, 'bob'],
  [heldBalloon, 'bob'],
]);
/** The small light sources that keep their glow and bloom (see `ScenePiece.hot`). */
const HOT_PIECES: readonly SetPiece[] = [redLight, vanHazards];

interface Tile {
  x: number;
  z: number;
}
interface Rect {
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

/** The bounding rectangle (in world x and z, tile edges) of some tiles. */
function bounds(tiles: readonly Tile[]): Rect {
  return {
    x0: Math.min(...tiles.map((t) => t.x)) - 0.5,
    x1: Math.max(...tiles.map((t) => t.x)) + 0.5,
    z0: Math.min(...tiles.map((t) => t.z)) - 0.5,
    z1: Math.max(...tiles.map((t) => t.z)) + 0.5,
  };
}

/**
 * The voids Hypergrowth's world fills, from the map: the post room behind
 * the ground floor, the lift shaft between the floors (and above it), the
 * stair landing at the front. Shared with the tests. Pure.
 */
export interface HypergrowthPlan {
  /** The post room: the back void's tiles left of the shaft. */
  postRoom: Rect;
  /** The shaft: the void's columns between the two floors, back to front. */
  shaft: Rect;
  /** The landing: the other void, at the front. */
  landing: Rect | null;
  /** The building's back line (outer face of its back wall) and right line (its glass). */
  back: number;
  right: number;
}

export function hypergrowthPlan(map: LevelMap): HypergrowthPlan {
  const { width, height } = map;
  const isVoid = (x: number, z: number) => getTile(map, x, z) === 'void';
  // The void's pieces, by flood fill.
  const seen = new Set<number>();
  const parts: Tile[][] = [];
  for (let z = 0; z < height; z++)
    for (let x = 0; x < width; x++) {
      if (!isVoid(x, z) || seen.has(z * width + x)) continue;
      const part: Tile[] = [];
      const todo: Tile[] = [{ x, z }];
      seen.add(z * width + x);
      while (todo.length > 0) {
        const t = todo.pop() as Tile;
        part.push(t);
        for (const [dx, dz] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ] as const) {
          const nx = t.x + dx;
          const nz = t.z + dz;
          if (isVoid(nx, nz) && !seen.has(nz * width + nx)) {
            seen.add(nz * width + nx);
            todo.push({ x: nx, z: nz });
          }
        }
      }
      parts.push(part);
    }
  parts.sort((a, b) => b.length - a.length);
  const main = parts[0] ?? [];
  // The shaft's columns: void tiles with the level's own tiles on both sides in their row.
  const between = main.filter((t) => {
    let l = false;
    let r = false;
    for (let x = t.x - 1; x >= 0; x--)
      if (!isVoid(x, t.z)) {
        l = true;
        break;
      }
    for (let x = t.x + 1; x < width; x++)
      if (!isVoid(x, t.z)) {
        r = true;
        break;
      }
    return l && r;
  });
  const sx0 = Math.min(...between.map((t) => t.x));
  const sx1 = Math.max(...between.map((t) => t.x));
  const shaftTiles = main.filter((t) => t.x >= sx0 && t.x <= sx1);
  const postTiles = main.filter((t) => t.x < sx0);
  const shaft = bounds(shaftTiles);
  const postRoom = bounds(postTiles);
  const landingPart = parts.find((p) => p !== main && p.some((t) => t.z === height - 1));
  return {
    postRoom,
    shaft,
    landing: landingPart ? bounds(landingPart) : null,
    back: -0.5 - SKIN.back - 0.09,
    right: width - 0.5 + SKIN.right,
  };
}

/** The scene round `map`: pure and deterministic. */
export function hypergrowthScene(map: LevelMap): Scene {
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
  /** Whether a footprint `r` round (x, z) keeps off the level's own tiles. */
  const offSlab = (x: number, z: number, r: number) => {
    for (const dx of [-r, 0, r])
      for (const dz of [-r, 0, r]) if (isSlab(x + dx, z + dz)) return false;
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
  /** Whether (x, z), `lift` up, is on screen with `margin` to spare. */
  const onScreen = (x: number, z: number, lift = 0, margin = 0) => {
    const p = projectPoint(pose, { x, y: GROUND + lift, z });
    return p.x > margin && p.x < VIEW.width - margin && p.y > margin && p.y < VIEW.height - margin;
  };

  const plan = hypergrowthPlan(map);
  const { postRoom: post, shaft, landing, back: backLine, right: rightLine } = plan;
  const tilesOf = (kind: string): Tile[] =>
    map.tiles.flatMap((t, i) => (t === kind ? [{ x: i % width, z: Math.floor(i / width) }] : []));
  const ship = tilesOf('ship');
  const bin = tilesOf('bin');
  const inbox = tilesOf('inbox').filter((t) => t.z === post.z1 + 0.5);
  const shipZ = ship.length > 0 ? ship.reduce((s, t) => s + t.z, 0) / ship.length : F - 3;
  const shipZ0 = ship.length > 0 ? Math.min(...ship.map((t) => t.z)) - 0.5 : shipZ - 1;
  const shipZ1 = ship.length > 0 ? Math.max(...ship.map((t) => t.z)) + 0.5 : shipZ + 1;
  const binZ = bin[0]?.z ?? shipZ - 2.5;
  const inboxX = inbox.length > 0 ? inbox.reduce((s, t) => s + t.x, 0) / inbox.length : post.x0 + 2;

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
      ...(hot.has(piece) ? { hot: true } : {}),
    });
  };
  /** Puts a near prop `r` round and `high` tall only where it keeps clear of the HUD and off the slab. */
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
  ): boolean => {
    if (!clear(x, z, r, high + lift, r, lift) || !offSlab(x, z, r)) return false;
    put(piece, x, z, yaw, variant, 'near', lift, size);
    return true;
  };
  const patch = (kind: string, x0: number, x1: number, z0: number, z1: number) => {
    if (x1 - x0 > 0.01 && z1 - z0 > 0.01) ground.push({ kind, x0, x1, z0, z1 });
  };
  const person = (x: number, z: number, yaw: number, pose: ScenePose) =>
    people.push({ at: gridToWorld(x, z, GROUND), yaw, pose });
  /** Something held out in front of a person standing at (x, z) facing `yaw`. */
  const held = (
    piece: SetPiece,
    x: number,
    z: number,
    yaw: number,
    lift = 0,
    reach = CARRY.reach,
  ) => {
    put(
      piece,
      x + Math.sin(yaw) * reach,
      z + Math.cos(yaw) * reach,
      yaw,
      0,
      'near',
      lift + CARRY.lift,
    );
  };

  // Where the frame's edges fall, a little past them.
  const topZ = -9;
  const frontZ = F + 2.5;
  const edgeL = Math.min(xAt(0, topZ), xAt(0, frontZ)) - 1;
  const edgeR = Math.max(xAt(VIEW.width, topZ), xAt(VIEW.width, frontZ)) + 1;
  const far = 8;

  // ---- Ground: the wet streets round the building ----
  const leftLine = L - 0.18;
  const walkL = leftLine - WALK;
  const roadL = walkL - ROAD;
  const backWalk = backLine - WALK;
  const backRoad = backWalk - ROAD;
  const backFar = backRoad - FAR_WALK;
  const faceR = rightLine + FACE;
  const walkR = faceR + WALK;
  const roadR = walkR + ROAD;
  const frontWalk = F + 1.3;
  const apronZ0 = Math.min(binZ - 2.7, shipZ0 - 4.2);
  // Far out: more pavement under the shops and the site.
  patch('walk', edgeL - far, edgeR + far, topZ - far, backFar);
  // The back street: pavement, road, the far pavement; the side streets the same.
  patch('road:x', edgeL - far, edgeR + far, backRoad, backWalk);
  patch('walk', edgeL - far, edgeR + far, backFar, backRoad);
  patch('walk:petals', roadL, walkR, backWalk, backLine);
  patch('road:z', roadL - ROAD, roadL, backWalk, frontZ + far);
  patch('road:z', walkR, roadR, backWalk, frontZ + far);
  patch('walk', edgeL - far, roadL - ROAD, backFar, frontZ + far);
  patch('walk', roadR, edgeR + far, backWalk, frontZ + far);
  patch('walk:petals', roadL, leftLine, backLine, apronZ0);
  patch('apron', roadL, leftLine, apronZ0, frontWalk);
  patch('walk:petals', faceR, walkR, backLine, frontZ + far);
  patch('face', rightLine, faceR, backLine, frontWalk);
  // The front: wet pavement to a kerb, the road beyond.
  patch('walk', leftLine, rightLine, F, frontWalk);
  patch('walk', roadL, faceR, frontWalk, frontWalk + 0.15);
  patch('road:x', roadL, walkR, frontWalk + 0.15, frontZ + far);
  // The shaft's pit, down between the floors.
  patch('pit', shaft.x0, shaft.x1, backLine + 0.09, shaft.z1);
  // "LOADING" painted on the apron by the bay, the yellow bay box.
  patch('bay', leftLine - APRON + 0.15, leftLine - 0.08, shipZ0 - 0.2, shipZ1 + 0.2);

  // ---- The building: the post room's walls, the shaft's, the glass round the first floor ----
  const wallH = FLOOR + 1.15;
  const backZ = backLine + 0.09;
  put(
    raisedFloor(post.x1 - post.x0, post.z1 - (backZ + 0.09), 'lino'),
    (post.x0 + post.x1) / 2,
    (post.z1 + backZ + 0.09) / 2,
  );
  put(blockWall(post.x1 - leftLine, wallH), leftLine, backZ);
  put(blockWall(post.z1 - 0.05 - backZ, wallH), leftLine + 0.09, post.z1 - 0.05, Math.PI / 2);
  put(
    blockWall(post.z1 - 0.05 - (backZ + 0.09), wallH),
    post.x1 + 0.09,
    backZ + 0.09,
    -Math.PI / 2,
  );
  put(shaftWall(shaft.x1 - shaft.x0 + 0.1, 2.3), shaft.x0 + 0.05, backZ, 0, 0, 'far');
  // The curtain wall: behind the first floor, then down its right side to the front.
  const glassX0 = shaft.x1;
  put(curtainWall(rightLine - glassX0), glassX0, backZ, 0, 0, 'far');
  put(rainOnGlass(rightLine - glassX0, 2.2), glassX0, backZ - 0.03, 0, 0, 'far');
  put(curtainWall(F - backZ), rightLine, backZ, -Math.PI / 2, 0, 'far');
  put(rainOnGlass(F - backZ, 2.2), rightLine + 0.03, backZ, -Math.PI / 2, 0, 'far');
  // The strip of carpet inside the side glass, the landing's floor.
  put(
    raisedFloor(rightLine - R - 0.07, (landing ? landing.z0 : F) - B, 'carpet'),
    (R + rightLine - 0.07) / 2,
    ((landing ? landing.z0 : F) + B) / 2,
  );
  if (landing) {
    const lx0 = landing.x0;
    const lx1 = rightLine - 0.07;
    put(
      raisedFloor(lx1 - lx0, landing.z1 - landing.z0, 'landing'),
      (lx0 + lx1) / 2,
      (landing.z0 + landing.z1) / 2,
    );
  }

  // ---- The post room ----
  {
    const y = FLOOR;
    const wallZ = backZ + 0.09;
    // Pigeonholes along the back, centred behind the inbox (the mail comes through to it).
    const cols = 8;
    const pw = cols * 0.24 + 0.04;
    const px = Math.max(post.x0 + pw / 2 + 0.15, inboxX - 0.6);
    put(pigeonholes(cols), px, wallZ + 0.17, 0, 0, 'near', y);
    put(frankingMachine, px + pw / 2 + 0.45, wallZ + 0.26, 0, 0, 'near', y);
    put(postRoomSign, px + pw / 2 + 0.55, wallZ + 0.005, 0, 0, 'near', y + 0.92);
    // The trolley at the inbox hatch, sacks in the corners, parcels about.
    put(mailTrolley, inboxX + 0.1, post.z1 - 0.55, 0.15, 0, 'near', y);
    put(mailSacks, post.x0 + 0.45, wallZ + 0.4, 0.3, 2, 'near', y);
    put(mailSacks, post.x0 + 0.42, post.z1 - 0.45, 1.2, 0, 'near', y);
    put(parcels, inboxX - 0.95, post.z1 - 0.5, 0.4, 0, 'near', y);
    put(parcels, px + pw / 2 + 1.25, wallZ + 0.35, -0.3, 1, 'near', y);
    // Desk boxes: standing in rows against the back wall, stacked 2-3 high against the shaft wall.
    let bx = px + pw / 2 + 2.05;
    for (let k = 0; bx < post.x1 - 0.7; k++, bx += 1.22)
      put(deskBoxesUpright, bx, wallZ + 0.24, (unit(k, 1, 7) - 0.5) * 0.08, k, 'near', y);
    const sx = post.x1 - 0.45;
    put(deskBoxStack, sx, wallZ + 0.7, Math.PI / 2 + 0.05, 2, 'near', y);
    put(deskBoxStack, sx - 0.05, post.z1 - 0.65, Math.PI / 2 - 0.06, 5, 'near', y);
    put(deskBoxStack, sx - 0.78, post.z1 - 0.45, 0.12, 1, 'near', y);
    put(deskBoxStack, post.x0 + 0.95, post.z1 - 0.42, -0.08, 3, 'near', y);
    // The balloons tied to the stacks: a few, violet and white.
    put(welcomeBalloon, sx + 0.1, wallZ + 0.45, 0, 0, 'near', y + 0.34);
    put(welcomeBalloon, sx - 0.05, post.z1 - 0.95, 0, 1, 'near', y + 0.34);
    put(welcomeBalloon, bx - 1.0, wallZ + 0.2, 0, 0, 'near', y + 0.64);
    // The new starters, queueing for the lift with their welcome packs.
    const qz = Math.min(post.z1 - 1.3, (wallZ + post.z1) / 2 + 0.05);
    const qx = post.x1 - 1.8;
    const face = Math.PI / 2 - 0.15;
    person(qx, qz, face, 'carrying');
    held(toteBag, qx, qz, face, y);
    person(qx - 0.85, qz + 0.08, face + 0.25, 'carrying');
    held(toteBag, qx - 0.85, qz + 0.08, face + 0.25, y);
    // The last one, at the back of the queue, a tote at her side and a balloon in the other hand.
    const lx = qx - 1.75;
    const lz = qz - 0.05;
    person(lx, lz, face - 0.1, 'idle');
    for (const [s, piece, lift] of [
      [-1, toteBag, 0.42],
      [1, heldBalloon, 0.4],
    ] as const) {
      const a = face - 0.1 + (s * Math.PI) / 2;
      put(piece, lx + Math.sin(a) * 0.28, lz + Math.cos(a) * 0.28, face - 0.1, 0, 'near', y + lift);
    }
  }

  // ---- The lift shaft ----
  {
    const cx = (shaft.x0 + shaft.x1) / 2;
    // The car parked high, forward in the shaft (the welcome banner hangs over its back).
    const cz = shaft.z1 - 0.35 - LIFT.carD / 2 - 0.35;
    put(liftFrame(HEADER, CAR_BOTTOM + LIFT.carH, CW_BOTTOM), cx, cz);
    put(liftCar, cx, cz, 0, 0, 'near', CAR_BOTTOM);
    put(segfaultCat, cx - 0.32, cz + 0.22, 0.35, 0, 'near', CAR_BOTTOM + LIFT.carH + 0.02, 1.15);
    put(welcomeBalloon, cx + 0.62, cz - 0.42, 0, 0, 'near', CAR_BOTTOM + LIFT.carH + 0.38);
    put(pitLadder(0.75), shaft.x1 - 0.45, shaft.z1 - 0.02, Math.PI);
    // A desk box that went down the shaft, tipped in the pit at the back.
    put(deskBoxStack, cx - 0.5, backZ + 1.4, 0.7, 0);
  }

  // ---- The loading bay, out into the rain ----
  {
    const canopyLen = shipZ1 - shipZ0 + 0.3;
    put(dockCanopy(canopyLen), L - 0.02, shipZ0 - 0.15, -Math.PI / 2);
    // The van backed up to the bay along the wall, its rear doors open, its cab toward the back.
    const vx = leftLine - 0.87;
    const vz = shipZ0 - 0.3 - 0.98;
    put(deliveryVan, vx, vz, Math.PI / 2);
    put(vanHazards, vx, vz, Math.PI / 2);
    // The bin and the cardboard cage behind the van, as near the bin hatch as it leaves room.
    const bz = Math.min(binZ + 0.05, vz - 1.4);
    put(wheelieBin, leftLine - 0.4, bz, Math.PI / 2 + 0.15);
    put(recyclingCage, leftLine - 0.62, bz - 0.95, -Math.PI / 2 - 0.04);
    // The pallet of desks on its pump truck behind them, the driver carrying a box in.
    put(palletTruck, leftLine - 1.05, bz - 2.35, Math.PI / 2 + 0.1);
    const dx = leftLine - 0.95;
    const dz = shipZ0 + 0.55;
    const dyaw = Math.PI / 2 - 0.2;
    person(dx, dz, dyaw, 'carrying');
    held(carriedBox, dx, dz, dyaw);
  }

  // ---- The street: trees, umbrellas, cars, a bus ----
  /** Whether a street prop at (x, z), `r` round, keeps off the building. */
  const inStreet = (x: number, z: number, r: number) => {
    if (!offSlab(x, z, r)) return false;
    if (x > leftLine - r && x < rightLine + r && z > backLine - r) return false;
    return true;
  };
  for (const [x, z, v] of [
    [roadL + WALK * 0.55, backLine - WALK * 0.55, 0],
    [post.x0 + 3.6, backLine - WALK * 0.6, 1],
    [shaft.x1 + 3.2, backLine - WALK * 0.55, 2],
    [rightLine - 2.2, backLine - WALK * 0.6, 3],
    [faceR + WALK * 0.55, backLine + 2.4, 1],
    [faceR + WALK * 0.55, backLine + 6.2, 2],
    [walkL + WALK * 0.4, (backLine + apronZ0) / 2 + 0.6, 0],
  ] as const) {
    if (!inStreet(x, z, 0.3)) continue;
    const size = (x > rightLine ? TREE * STREET : TREE) * (0.94 + unit(x, z, 9) * 0.12);
    if (clear(x, z, 0.3 * size, 0.42 * size))
      put(cherryTree, x, z, unit(x, z, 11) * 6, v, 'near', 0, size);
  }
  {
    // People under umbrellas along the pavements, out of the HUD.
    let k = 0;
    for (const [x, z, yaw] of [
      [walkL + WALK * 0.5, backLine + 1.2, 0.2],
      [post.x0 + 1.6, backLine - WALK * 0.45, Math.PI / 2],
      [post.x0 + 5.4, backLine - WALK * 0.5, -Math.PI / 2],
      [shaft.x1 + 1.4, backLine - WALK * 0.45, Math.PI / 2],
      [rightLine - 0.8, backLine - WALK * 0.5, -Math.PI / 2],
      [faceR + WALK * 0.5, backLine + 4.2, Math.PI],
      [faceR + WALK * 0.45, backLine + 0.6, 0],
    ] as const) {
      if (!inStreet(x, z, 0.35)) continue;
      if (putClear(umbrellaWalker, x, z, 0.4 * STREET, 1.45 * STREET, yaw, k, 0, STREET)) k++;
    }
  }
  /** A car at (x, z) heading `yaw`, if it's on the street and in the frame. */
  const car = (x: number, z: number, yaw: number, v: number) => {
    if (inStreet(x, z, 0.3) && onScreen(x, z, 0, 10)) put(wetCar, x, z, yaw, v, 'far', 0, STREET);
  };
  for (let k = 0; k < 9; k++) {
    const lane = k % 2;
    const x = edgeL + 1.5 + k * 2.6 + unit(k, 3, 13) * 0.9;
    if (x > edgeR) break;
    car(x, backRoad + ROAD * (lane ? 0.28 : 0.72), lane ? Math.PI : 0, k);
  }
  for (let k = 0; k < 4; k++) {
    car(walkR + ROAD * 0.3, backWalk + 0.9 + k * 2.1, -Math.PI / 2, k + 2);
    car(roadL + ROAD * 0.3 - ROAD, backWalk + 1.2 + k * 2.4, Math.PI / 2, k + 4);
  }
  {
    // The bus on the back road, behind the first floor's glass, its lights on.
    const bx = Math.min(rightLine - 3, shaft.x1 + 4.6);
    put(bus, bx, backRoad + ROAD * 0.3, Math.PI, 0, 'far', 0, 2.2);
  }

  // ---- Across the road: the shops, and the crane tower behind its hoarding ----
  const siteZ = backFar;
  let towerX = edgeR;
  {
    // Built at 3-1's scale (it stood far below there) and brought up close: `S` times bigger.
    const S = 1.4;
    const tw = 1.4;
    const td = 0.8;
    const tz = siteZ - 0.2;
    const cs = 0.75;
    const mast = 0.55;
    const jib = 1.5;
    const fits = (x: number, floors: number) => {
      const h = floors * CRANE_TOWER.storey * S;
      const a = screenBox(x - (tw * S) / 2, x + (tw * S) / 2, 0, h + 0.1, tz - td * S, tz);
      const c = screenBox(
        x - 0.4 * cs * S,
        x + jib * cs * S,
        h,
        h + (mast + 0.35) * cs * S,
        tz - (td * S) / 2 - 0.1,
        tz - (td * S) / 2 + 0.1,
      );
      return (
        Math.min(a[0], c[0]) > CARDS_RIGHT + 60 &&
        Math.max(a[2], c[2]) < 1360 &&
        Math.min(a[1], c[1]) > 3
      );
    };
    for (let floors = 16; floors >= 5; floors--) {
      const xs: number[] = [];
      for (let x = xAt(CARDS_RIGHT, tz); x < xAt(1440, tz); x += 0.1)
        if (fits(x, floors)) xs.push(x);
      const last = xs[xs.length - 1];
      const first = xs[0];
      if (first === undefined || last === undefined) continue;
      const tx = Math.round(((first + last) / 2 + (last - first) * 0.2) * 20) / 20;
      const h = floors * CRANE_TOWER.storey * S;
      put(craneTower(tw, td, floors, 1), tx, tz, 0, 0, 'far', 0, S);
      const cz = tz - (td * S) / 2;
      put(cityCrane(mast, jib), tx, cz, 0, 0, 'far', h, cs * S);
      put(redLight, tx + (jib - 0.05) * cs * S, cz, 0, 0, 'far', h + (mast + 0.12) * cs * S, S);
      put(redLight, tx, cz, 0, 0, 'far', h + (mast + 0.33) * cs * S, S);
      towerX = tx;
      break;
    }
    patch('site', towerX - 3.2, edgeR + far, topZ - far, siteZ - 0.05);
    put(hoarding(edgeR + 2 - (towerX - 3.2)), towerX - 3.2, siteZ - 0.05, 0, 0, 'far');
    put(shopRow(towerX - 3.3 - (edgeL - 2)), edgeL - 2, siteZ - 0.05, 0, 0, 'far');
    // Down the far side of the left road, more shops, side on.
    put(
      shopRow(siteZ - 0.05 - (topZ - 2)),
      roadL - ROAD - FAR_WALK,
      siteZ - 0.05,
      Math.PI / 2,
      0,
      'far',
    );
  }

  // ---- In front: thin, wet, low ----
  {
    const z = F + 0.42;
    putClear(wetFloorSign, L + 2.9, z, 0.2, 0.52, 0.25);
    putClear(umbrellaStand, L + 6.6, z - 0.05, 0.16, 0.56);
    putClear(doormat, L + 7.6, z + 0.05, 0.45, 0.04, 0);
    putClear(wetFloorSign, (shaft.x0 + shaft.x1) / 2 + 4.5, z, 0.2, 0.52, -0.2);
  }
  // Prod on the landing, in a bigger pot; a stack of desks waiting there too.
  if (landing) {
    const lx = Math.max(landing.x0 + 0.5, (landing.x0 + landing.x1) / 2 - 0.1);
    putClear(prodTub, lx, landing.z0 + 0.95, 0.46, 1.8, 0.4, 0, FLOOR);
    putClear(
      deskBoxStack,
      landing.x1 - 0.45,
      landing.z1 - 0.75,
      0.42,
      0.35,
      Math.PI / 2 + 0.1,
      4,
      FLOOR,
    );
  }

  return { horizon: HORIZON, ground, painters: PAINTERS, pieces, people, tufts: [] };
}

// ---- The scene's own ground ----

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

/**
 * A puddle catching the grey sky: two or three flat overlapping pools in a
 * pale sky grey, a lighter glint across the middle; irregular, by `k`.
 */
function puddle(b: Builder, x: number, z: number, top: number, r: number, k = 0) {
  const pool = (dx: number, dz: number, rx: number, rz: number, c: number, y: number, a: number) =>
    b.add(new THREE.CylinderGeometry(1, 1, 0.002, 12).scale(rx, 1, rz), c, {
      at: [x + dx, top + y, z + dz],
      rot: [0, a, 0],
    });
  const a = shade(k, 61, 7) * 3;
  pool(0, 0, r * 1.3, r * 0.75, 0x7c8996, 0.001, a);
  pool(r * 0.6, r * 0.25, r * 0.8, r * 0.5, 0x7c8996, 0.0012, a + 0.6);
  pool(-r * 0.2, -r * 0.1, r * 0.75, r * 0.38, 0x95a3b1, 0.0016, a);
  pool(-r * 0.25, -r * 0.18, r * 0.35, r * 0.08, 0xb8c4d0, 0.002, a);
}

/** Puddles over a patch, `per` square tile, `r` their size. */
function puddles(b: Builder, g: GroundPatch, top: number, salt: number, per: number, r: number) {
  const w = g.x1 - g.x0;
  const d = g.z1 - g.z0;
  const count = Math.min(24, Math.floor(w * d * per));
  for (let k = 0; k < count; k++) {
    const x = g.x0 + 0.2 + shade(k, 41, salt) * Math.max(0, w - 0.4);
    const z = g.z0 + 0.2 + shade(k, 43, salt) * Math.max(0, d - 0.4);
    puddle(b, x, z, top, r * (0.6 + shade(k, 47, salt) * 0.8), k + salt);
  }
}

/** The wet road: dark asphalt in patches, a dashed centre line, tyre tracks shining, puddles. */
function road(along: 'x' | 'z'): GroundPainter {
  return (b, g, salt) => {
    const top = 0.008;
    const asphalt = 0x464b52;
    fill(b, g, top - 0.004, asphalt);
    const len = along === 'x' ? g.x1 - g.x0 : g.z1 - g.z0;
    const wide = along === 'x' ? g.z1 - g.z0 : g.x1 - g.x0;
    const c0 = along === 'x' ? g.x0 : g.z0;
    const mid = along === 'x' ? (g.z0 + g.z1) / 2 : (g.x0 + g.x1) / 2;
    const at = (u: number, v: number, y: number): [number, number, number] =>
      along === 'x' ? [c0 + u, y, mid + v] : [mid + v, y, c0 + u];
    const strip = (u: number, v: number, l: number, t: number, c: number, y: number) =>
      b.box(along === 'x' ? l : t, 0.002, along === 'x' ? t : l, c, { at: at(u, v, top + y) }, 0);
    // The wet shine of the tyre tracks down each lane, the centre line dashed.
    for (const v of [-0.36, -0.22, 0.22, 0.36])
      strip(len / 2, v * wide, len, 0.07, 0x58606a, 0.001);
    for (let u = 0.2; u < len; u += 0.7) strip(u, 0, 0.36, 0.04, 0xb4b4ac, 0.002);
    // Patched asphalt now and then.
    for (let k = 0, u = 0.5; u < len; k++, u += 1.3)
      if (shade(k, 3, salt) > 0.7)
        strip(u, (shade(k, 5, salt) - 0.5) * wide * 0.6, 0.5, 0.3, 0x3e4349, 0.0015);
    puddles(b, g, top, salt, 0.08, 0.18);
  };
}

/** Wet pavement: flags darkened by the rain with paler joints, puddles, and fallen blossom if `petals`. */
function walk(petals: boolean): GroundPainter {
  return (b, g, salt) => {
    const top = 0.02;
    const base = 0x6e7376;
    fill(b, g, top - 0.004, tint(base, 0.12));
    const s = 0.5;
    for (let j = 0, z = g.z0; z < g.z1 - 0.01; j++, z += s)
      for (let i = 0, x = g.x0; x < g.x1 - 0.01; i++, x += s) {
        const xb = Math.min(g.x1, x + s);
        const zb = Math.min(g.z1, z + s);
        const c = tint(base, (shade(i, j, salt) - 0.5) * 0.1);
        b.box(
          xb - x - 0.016,
          0.003,
          zb - z - 0.016,
          c,
          { at: [(x + xb) / 2, top, (z + zb) / 2] },
          0,
        );
      }
    puddles(b, g, top, salt + 3, 0.07, 0.22);
    if (petals) {
      const w = g.x1 - g.x0;
      const d = g.z1 - g.z0;
      const count = Math.min(400, Math.floor(w * d * 9));
      for (let k = 0; k < count; k++) {
        const x = g.x0 + shade(k, 51, salt) * w;
        const z = g.z0 + shade(k, 53, salt) * d;
        const c = shade(k, 55, salt) > 0.5 ? 0xe2a6bc : 0xd894ae;
        b.box(
          0.035,
          0.002,
          0.025,
          c,
          { at: [x, top + 0.004, z], rot: [0, shade(k, 57, salt) * 3, 0] },
          0,
        );
      }
    }
  };
}

/** The apron in front of the loading bay: wet concrete in cast slabs, joints, a drain, puddles. */
const apron: GroundPainter = (b, g, salt) => {
  const top = 0.018;
  const base = 0x7a7e7e;
  fill(b, g, top - 0.004, tint(base, -0.2));
  const s = 1.0;
  for (let j = 0, z = g.z0; z < g.z1 - 0.01; j++, z += s)
    for (let i = 0, x = g.x0; x < g.x1 - 0.01; i++, x += s) {
      const xb = Math.min(g.x1, x + s);
      const zb = Math.min(g.z1, z + s);
      const c = tint(base, (shade(i, j, salt) - 0.5) * 0.08);
      b.box(xb - x - 0.02, 0.003, zb - z - 0.02, c, { at: [(x + xb) / 2, top, (z + zb) / 2] }, 0);
    }
  // The drain along the building, the rain running to it.
  b.box(
    0.12,
    0.003,
    g.z1 - g.z0 - 0.3,
    0x30343a,
    { at: [g.x1 - 0.12, top + 0.002, (g.z0 + g.z1) / 2] },
    0,
  );
  for (let z = g.z0 + 0.2; z < g.z1 - 0.2; z += 0.08)
    b.box(0.1, 0.003, 0.02, 0x6a7076, { at: [g.x1 - 0.12, top + 0.003, z] }, 0);
  puddles(b, g, top, salt + 5, 0.22, 0.2);
};

/** The loading bay's markings on the apron: a yellow box, hatched. */
const bay: GroundPainter = (b, g) => {
  const y = 0.024;
  const yel = 0xc8a42e;
  const w = g.x1 - g.x0;
  const d = g.z1 - g.z0;
  const cx = (g.x0 + g.x1) / 2;
  const cz = (g.z0 + g.z1) / 2;
  for (const z of [g.z0, g.z1]) b.box(w, 0.002, 0.06, yel, { at: [cx, y, z] }, 0);
  b.box(0.06, 0.002, d, yel, { at: [g.x0, y, cz] }, 0);
  // Hatched across the box.
  for (let z = g.z0 + 0.25; z < g.z1 - 0.1; z += 0.35)
    b.box(0.45, 0.002, 0.05, yel, { at: [g.x0 + 0.3, y, z], rot: [0, 0.7, 0] }, 0);
};

/** The shaft's pit: dark concrete, a yellow-black edge round it, a puddle that caught the rain, an oil stain. */
const pit: GroundPainter = (b, g, salt) => {
  const top = 0.006;
  fill(b, g, top - 0.003, 0x34373b);
  const w = g.x1 - g.x0;
  const d = g.z1 - g.z0;
  for (let j = 0, z = g.z0; z < g.z1 - 0.01; j++, z += 1.0) {
    const zb = Math.min(g.z1, z + 1.0);
    b.box(
      w - 0.04,
      0.002,
      zb - z - 0.03,
      tint(0x3a3e42, (shade(0, j, salt) - 0.5) * 0.1),
      {
        at: [(g.x0 + g.x1) / 2, top + 0.001, (z + zb) / 2],
      },
      0,
    );
  }
  for (let z = g.z0 + 0.1; z < g.z1; z += 0.2)
    for (const x of [g.x0 + 0.05, g.x1 - 0.05])
      b.box(
        0.08,
        0.002,
        0.1,
        Math.round((z - g.z0) / 0.2) % 2 ? 0xc8a032 : 0x1e2024,
        {
          at: [x, top + 0.002, z],
        },
        0,
      );
  puddle(b, g.x0 + w * 0.3, g.z0 + d * 0.62, top, 0.32);
  b.cylinder(
    0.25,
    0.25,
    0.002,
    0x24262a,
    { at: [g.x0 + w * 0.7, top + 0.002, g.z0 + d * 0.3] },
    14,
  );
};

/**
 * The building's face below the first floor's glass, seen from above as the
 * drop to the street: a pale slab edge, the dark band, the shop glass of the
 * ground floor below, lit warm, a canopy edge; the building is toward −x.
 */
const face: GroundPainter = (b, g) => {
  const top = 0.012;
  const len = g.z1 - g.z0;
  const cz = (g.z0 + g.z1) / 2;
  const band = (u0: number, u1: number, c: number) =>
    b.box(u1 - u0, 0.003, len, c, { at: [g.x0 + (u0 + u1) / 2, top, cz] }, 0);
  const w = g.x1 - g.x0;
  band(0, w * 0.12, 0xa8acb0);
  band(w * 0.12, w * 0.32, 0x4a525c);
  band(w * 0.32, w * 0.78, 0x6a6458);
  band(w * 0.78, w, 0x3e4248);
  for (let z = g.z0 + 0.4; z < g.z1; z += 0.8)
    b.box(w * 0.46, 0.003, 0.03, 0x3a3e44, { at: [g.x0 + w * 0.55, top + 0.001, z] }, 0);
  for (let z = g.z0 + 0.8, k = 0; z < g.z1 - 0.4; k++, z += 1.6)
    b.box(
      w * 0.4,
      0.003,
      0.5,
      k % 2 ? 0xc8b48a : 0xb8a888,
      { at: [g.x0 + w * 0.55, top + 0.002, z] },
      0,
    );
};

/** The building site behind the hoarding: muddy gravel, puddles, a stack of materials. */
const site: GroundPainter = (b, g, salt) => {
  const top = 0.01;
  fill(b, g, top - 0.004, 0x6a6458);
  puddles(b, g, top, salt + 9, 0.1, 0.22);
};

const PAINTERS: Readonly<Record<string, GroundPainter>> = {
  'road:x': road('x'),
  'road:z': road('z'),
  walk: walk(false),
  'walk:petals': walk(true),
  apron,
  bay,
  pit,
  face,
  site,
};
