import type { LevelMap } from '../../../sim/level';
import { getTile } from '../../../sim/level';
import {
  type CameraPose,
  fitCamera3d,
  gridToWorld,
  projectPoint,
  roundInsets,
  screenToGround,
} from '../../projection';
import { firstGroup, tileHash } from '../../mapShape';
import { type ModelBuilder, tint } from '../kit';
import { levelBox } from '../layout';
import {
  bikeRack,
  bollard,
  cargoBike,
  coffeeVan,
  DOCK,
  duck,
  factoryWall,
  flourSacks,
  handcart,
  kegs,
  lowPlanter,
  narrowboat,
  nextWarehouse,
  pallets,
  parkedBike,
  picnicTable,
  planterTree,
  postSacks,
  quayBench,
  quayLamp,
  shrubTub,
  skip,
  stringLights,
} from '../setDressing/canal';
import type { SetPiece } from '../setDressing/shared';
import { catLoaf } from '../setDressing/suburb';
import { shade, slabs } from './ground';
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
 * The Down the Hall level's own world (level 1-3, scene `scale-up`; see
 * `docs/plan/down-the-hall-environment.md`): the old biscuit factory by the
 * canal at the end of the day. Behind the level, the factory's own brick wall
 * rises with its tall lit windows, a hoist and the faded "& SONS BISCUIT
 * WORKS"; the inbox is the entrance hall's door. In front, a thin quay of
 * cobbles, the canal's stone edge, dark water and a moored narrowboat; a
 * courier's cargo bike waits at the ship hatch. Void tiles inside the
 * outline become a courtyard light well. Left, the yard with the coffee van;
 * right, the next warehouse with the brewery's loading dock.
 *
 * Everything is placed from the level's outline, its void tiles and its ship
 * and inbox tiles, and from where the frame's edges fall for this map (the
 * camera fit at 1440×810), so it fits any map of this level. Pure data.
 */

/** Dark setts out to the horizon, cool in the evening light: they carry the dusk to the frame's edges. */
const HORIZON = 0x555b6b;
/** The cobbles round the building, warmer by the walls. */
const SETTS = 0x77726e;
const FLAGS = 0x8a8478;
const YARD = 0x8a8680;
const COPING = 0x8e8a80;
const WATER = 0x3c5a5c;
/** The light well's weathering: moss along the walls, rainwater pooled in a sunk flag. */
const MOSS = 0x66704e;
const PUDDLE = 0x7e8c9a;
/**
 * The quay in front: a strip of cobbles (at most this deep, at least the
 * thin one), the stone coping, then the water. With less water than
 * `SHALLOW` showing under the coping, the quay goes thin and the boat moors
 * close, so its roof and bow show above the HUD's bottom band.
 */
const QUAY = 0.42;
const QUAY_THIN = 0.16;
const COPE = 0.18;
const SHALLOW = 0.9;
/** The screen band the boat must fit in when the canal barely shows (above SCORE's bottom, right of it, left of the pause hint). */
const BOAT_BAND = { top: 745, bottom: 805, left: 270, right: 565 };
/** The old lettering: about how wide it is, how high it's painted, and the screen x it starts right of (the order cards). */
const SIGN_WIDTH = 7.1;
const SIGN_HIGH = 2.9;
const SIGN_LEFT = 720;
/** How far the factory's wall stands behind the level's back wall: hidden behind it, so no gap shows. */
const FACTORY_GAP = 0.06;
/** How far the factory and the cobbles run out past the level on each side. */
const OUT = 6;
/** The screen the scene is composed for. */
const VIEW = { width: 1440, height: 810 };
/** The living props: the cat asleep on the boat's roof, the ducks bobbing on the water. */
const ALIVE: ReadonlyMap<SetPiece, AliveKind> = new Map<SetPiece, AliveKind>([
  [catLoaf, 'purr'],
  [duck, 'bob'],
]);

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

/** The camera pose the game uses for this map on a 1440×810 screen. */
export function scenePose(map: LevelMap): CameraPose {
  return fitCamera3d(levelBox(map), VIEW, roundInsets(VIEW));
}

/** Which edge of the map a group of tiles sits on (the inbox, the ship). */
function edgeOf(map: LevelMap, group: readonly Tile[]): Edge | null {
  const p = group[0];
  if (!p) return null;
  if (group.every((t) => t.z === 0)) return 'back';
  if (group.every((t) => t.z === map.height - 1)) return 'front';
  if (group.every((t) => t.x === 0)) return 'left';
  if (group.every((t) => t.x === map.width - 1)) return 'right';
  // Not on the outline: whichever edge is nearest.
  const d = { back: p.z, front: map.height - 1 - p.z, left: p.x, right: map.width - 1 - p.x };
  return (Object.keys(d) as Edge[]).reduce((a, b) => (d[b] < d[a] ? b : a));
}

/** The scene round `map`: pure and deterministic. */
export function downTheHallScene(map: LevelMap): Scene {
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
  /** How much ground shows beside the level at mid depth, left and right. */
  const midZ = (B + F) / 2;
  const sideL = L - xAt(0, midZ);
  const sideR = xAt(VIEW.width, midZ) - R;

  const tileAt = (x: number, z: number) => getTile(map, x, z);
  const isVoid = (x: number, z: number) => tileAt(x, z) === 'void';
  /** Whether (x, z) is play: a floor, a station, a counter (not a wall, a void or outside). */
  const isPlay = (x: number, z: number) => {
    const t = tileAt(x, z);
    return t !== null && t !== 'void' && t !== 'wall';
  };
  /**
   * Whether something `high` tall and `half` wide standing at (x, z) would
   * hide play on screen: what it covers runs back about 0.85 a tile for
   * every unit of height.
   */
  const hides = (x: number, z: number, high: number, half: number) => {
    const back = high * 0.85;
    for (let tz = Math.floor(z - back); tz <= Math.round(z); tz++)
      for (let tx = Math.round(x - half); tx <= Math.round(x + half); tx++)
        if (isPlay(tx, tz)) return true;
    return false;
  };

  const ship = firstGroup(map, 'ship').map((p) => ({ x: p.x, z: p.y }));
  const inbox = firstGroup(map, 'inbox').map((p) => ({ x: p.x, z: p.y }));
  const shipEdge = edgeOf(map, ship);
  const inboxEdge = edgeOf(map, inbox);
  const mid = (g: readonly Tile[], k: 'x' | 'z') =>
    g.length > 0 ? g.reduce((s, t) => s + t[k], 0) / g.length : 0;
  const voids: Tile[] = map.tiles.flatMap((t, i) =>
    t === 'void' ? [{ x: i % width, z: Math.floor(i / width) }] : [],
  );

  const pieces: ScenePiece[] = [];
  const ground: GroundPatch[] = [];
  const people: ScenePerson[] = [];
  let n = 0;
  /** Puts `piece` with its center at (x, z), on the ground or `lift` above it, `size` times its size. */
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
    // A slight brightness and warmth change per prop, so repeats don't match.
    const bright = 0.92 + unit(i, 1, 3) * 0.12;
    const warm = (unit(i, 2, 5) * 2 - 1) * 0.05;
    const alive = ALIVE.get(piece);
    pieces.push({
      piece,
      variant: variant % (piece.variants ?? 1),
      at: gridToWorld(x, z, GROUND + lift),
      yaw,
      scale: [size, size, size],
      tint: [bright * (1 + warm), bright, bright * (1 - warm)],
      row,
      ...(alive ? { alive } : {}),
    });
  };
  const patch = (kind: string, x0: number, x1: number, z0: number, z1: number) =>
    ground.push({ kind, x0, x1, z0, z1 });
  const person = (x: number, z: number, yaw: number, pose: ScenePose) =>
    people.push({ at: gridToWorld(x, z, GROUND), yaw, pose });

  // ---- Back: the factory's own wall, right behind the level's back wall ----
  const fx0 = L - OUT;
  const fx1 = R + 0.7;
  const fw = fx1 - fx0;
  const fc = (fx0 + fx1) / 2;
  const doorX = inboxEdge === 'back' && inbox.length > 0 ? mid(inbox, 'x') : undefined;
  // The tall windows every 1.5 or so, clear of the hall door; about half lit.
  const windows: { x: number; lit: boolean }[] = [];
  for (let x = fx0 + 0.6, k = 0; x < fx1 - 0.4; x += 1.45, k++) {
    if (doorX !== undefined && Math.abs(x - doorX) < inbox.length / 2 + 0.45) continue;
    windows.push({ x: x - fc, lit: unit(k, 3, 21) < 0.65 });
  }
  // The lettering right of the order cards, the hoist past its end.
  const signHalf = SIGN_WIDTH / 2;
  const sign = Math.min(R - signHalf, xAt(SIGN_LEFT, B - FACTORY_GAP, SIGN_HIGH) + signHalf);
  const hoist = Math.min(R - 0.4, sign + signHalf + 0.9);
  // Ground-floor windows where the foot of the wall shows: the yard and any light well on the back edge.
  const low: number[] = [];
  for (let x = L - 1.2; x > fx0 + 0.5; x -= 1.45) low.push(x - fc);
  const backVoids = voids.filter((v) => v.z === 0).map((v) => v.x);
  for (let k = 0; k < backVoids.length; k += 2) low.push((backVoids[k] ?? 0) + 0.5 - fc);
  put(
    factoryWall({
      width: fw,
      windows,
      ...(doorX !== undefined ? { door: doorX - fc, doorWidth: inbox.length - 0.16 } : {}),
      sign: sign - fc,
      hoist: hoist - fc,
      low,
    }),
    fc,
    B - FACTORY_GAP,
    0,
    0,
    'far',
  );

  // ---- Ground: cobbles round the building, the quay, the canal ----
  // As much of the quay as leaves the water showing at the bottom of the frame.
  const bottomZ = screenToGround(pose, VIEW.width / 2, VIEW.height, GROUND)?.y ?? F + 1.2;
  const shallow =
    bottomZ - (F + Math.max(QUAY_THIN, Math.min(QUAY, (bottomZ - F) * 0.3)) + COPE) < SHALLOW;
  const quay = shallow ? QUAY_THIN : Math.max(QUAY_THIN, Math.min(QUAY, (bottomZ - F) * 0.3));
  const q0 = F + quay;
  const q1 = q0 + COPE;
  patch('setts', fx0, L, B - FACTORY_GAP, q0);
  patch('setts', R, R + OUT, B - FACTORY_GAP, q0);
  patch('setts', L, R, F, q0);
  patch('coping', fx0, R + OUT, q0, q1);
  patch('water', fx0 - 4, R + OUT + 4, q1, q1 + 8);
  for (const v of voids) patch('flags', v.x - 0.5, v.x + 0.5, v.z - 0.5, v.z + 0.5);

  // ---- Left: the yard ----
  // Against the level's wall, tight: pallets stacked high, flour sacks; the skip by the factory.
  put(pallets, L - 0.48, B + 0.55, Math.PI / 2, 1, 'near', 0, 0.85);
  put(pallets, L - 0.48, B + 1.4, Math.PI / 2 + 0.06, 3, 'near', 0, 0.85);
  put(pallets, L - 1.3, B + 0.62, 0.1, 2, 'near', 0, 0.85);
  put(skip, L - 2.6, B + 0.62, 0.04);
  // The coffee van mid-yard, its hatch toward the level, a pad of concrete under it.
  const vanX = L - Math.max(2.05, Math.min(2.5, sideL - 0.55));
  const vanZ = Math.min(B + 3.2, midZ - 0.4);
  patch('yard', vanX - 0.8, vanX + 0.75, vanZ - 1.1, vanZ + 1.0);
  put(coffeeVan, vanX, vanZ, Math.PI / 2 + 0.05);
  // The queue: three tenants on their break, the first sipping already.
  const qx = Math.min(L - 1.05, vanX + 1.0);
  person(qx, vanZ - 0.35, -Math.PI / 2 - 0.3, 'sipping');
  person(qx - 0.05, vanZ + 0.32, -Math.PI / 2 + 0.2, 'idle');
  person(qx - 0.18, vanZ + 0.95, -Math.PI / 2 + 0.5, 'phoning');
  // More pallets at the front of the yard, by the level's wall, and a planter by the van.
  if (F - 2.4 > vanZ + 1.2) put(pallets, L - 0.48, F - 2.4, Math.PI / 2, 2, 'near', 0, 0.85);
  if (F - 2.9 > vanZ + 1.4) put(pallets, L - 1.45, F - 2.9, 0.3, 0, 'near', 0, 0.85);
  put(lowPlanter, vanX + 0.1, vanZ - 1.45, 0, 1, 'near', 0, 0.9);
  // Flour sacks spilled by the skip; past the queue, a bench for the coffee, a planter at its end.
  put(flourSacks, L - 1.75, B + 1.2, 0.3, 0, 'near', 0, 0.9);
  const benchZ = vanZ + 1.95;
  if (benchZ + 1.2 < F - 1) {
    put(quayBench, vanX - 0.15, benchZ, Math.PI / 2, 0);
    put(lowPlanter, vanX - 0.2, benchZ + 1.05, Math.PI / 2, 0, 'near', 0, 0.9);
    put(flourSacks, vanX + 0.75, benchZ + 0.6, -0.4, 1, 'near', 0, 0.85);
  }

  // ---- Right: the next warehouse, the brewery's dock ----
  const wx = R + Math.max(0.95, Math.min(1.6, sideR - 0.9));
  const wz = B + 1.1;
  put(nextWarehouse(6, 4), wx, wz, 0, 0, 'far');
  // Kegs on the dock and below it, pallets beside.
  put(kegs, wx + 0.55, wz + 0.4, 0.2, 1, 'near', DOCK.height, 0.9);
  put(kegs, wx + 1.4, wz + 0.45, -0.3, 0, 'near', DOCK.height);
  put(kegs, R + 0.5, wz + 0.2, 0.4, 2, 'near', 0, 0.9);
  put(pallets, R + 0.5, B + 0.4, 0, 0, 'near', 0, 0.8);
  // The brewery's worker, carrying a crate from the dock.
  person(wx + 0.8, wz + DOCK.depth + 0.55, -2.4, 'carrying');
  // Down the right of the level: empties waiting for the dray, a pallet of sacks, the brewer's
  // handcart loaded and left mid-alley, more empties against the far side; where there's room.
  const emptiesZ = wz + DOCK.depth + 1.4;
  if (emptiesZ + 1.2 < F - 1.8) {
    put(kegs, R + 1.0, emptiesZ, 0.5, 0, 'near', 0, 0.95);
    put(pallets, R + 0.95, emptiesZ + 0.8, Math.PI / 2 + 0.1, 2, 'near', 0, 0.8);
    const cartZ = Math.max(emptiesZ + 2.3, midZ + 1.2);
    if (cartZ < F - 2) put(handcart, R + 1.6, cartZ, -0.35, 0);
    put(kegs, R + 2.8, emptiesZ + 1.5, -0.2, 2, 'near', 0, 0.95);
    put(pallets, R + 2.9, wz + DOCK.depth + 0.5, 0.05, 2, 'near', 0, 0.8);
  }
  // The alley lamp and the bike rack toward the quay, in from the frame's edge; a cyclist on the phone.
  const rackZ = Math.max(wz + DOCK.depth + 1.6, F - 1.9);
  const rackX = Math.max(R + 0.85, Math.min(R + 1.6, xAt(VIEW.width - 120, rackZ) - 0.5));
  put(bikeRack, rackX, rackZ, 0, 0);
  person(Math.max(rackX + 0.95, R + 2.1), rackZ + 0.35, -Math.PI / 2 - 0.4, 'phoning');
  put(quayLamp, R + 0.75, F - 0.2, 0);
  put(quayLamp, L - 0.85, B + 2.3, 0);

  // ---- The ship hatch: the loading door, a courier's cargo bike waiting at it ----
  if (ship.length > 0) {
    const sx = mid(ship, 'x');
    const sz = mid(ship, 'z');
    if (shipEdge === 'front')
      put(cargoBike, sx, F + Math.max(0.34, quay), Math.PI / 2 + 0.08, 0, 'near', 0, 0.9);
    else if (shipEdge === 'right') put(cargoBike, R + 0.75, sz, 0.5, 0);
    else if (shipEdge === 'left') put(cargoBike, L - 0.45, sz, -0.06, 0);
    else put(cargoBike, sx + 1, B - 0.9, Math.PI / 2, 0, 'far');
  }
  // The entrance hall on the front edge: the post sacks out by its door.
  if (inboxEdge === 'front' && inbox.length > 0)
    put(postSacks, mid(inbox, 'x'), F + quay * 0.6, 0.1);

  // ---- Front: the quay and the moored narrowboat ----
  // Bow toward the middle, clear of the score and the pause hint; the cat asleep on its roof.
  // Where little canal shows, moored close and sized so roof and bow sit in the band over the HUD.
  const boatZ = shallow ? q1 + 0.34 : q1 + 0.42;
  const bowX = shallow ? xAt(BOAT_BAND.right, boatZ, 0.3) - 0.05 : xAt(560, boatZ, 0.4) - 0.4;
  const sternX = shallow ? xAt(BOAT_BAND.left, boatZ, 0.3) + 0.1 : xAt(150, boatZ, 0.4) + 0.4;
  const boatSize = Math.min(1, (bowX - sternX) / 3.95);
  if (boatSize > 0.6) {
    put(narrowboat, bowX - 0.36 * boatSize, boatZ, 0, 0, 'near', -0.08, boatSize);
    put(catLoaf, bowX - 1.7 * boatSize, boatZ - 0.05, 0.6, 0, 'near', 0.45 * boatSize - 0.1, 0.7);
  }
  // Bollards along the coping, clear of the HUD: one by the boat, one right of the pause hint.
  const copeZ = q0 + COPE / 2;
  put(bollard, bowX - 0.6, copeZ, 0, 0, 'near', 0.07);
  const bx = xAt(900, copeZ, 0.3);
  if (bx < R + 2) put(bollard, bx, copeZ, 0.6, 1, 'near', 0.07);
  // Ducks on the water, right of the middle.
  put(duck, xAt(1000, boatZ), boatZ - 0.05, 2.6, 1, 'near', 0, 1.2);
  put(duck, xAt(1050, boatZ), boatZ + 0.2, 2.9, 0, 'near', 0, 1.2);

  // ---- Void tiles inside the outline: a courtyard light well ----
  courtyard(voids, isVoid, hides, put, patch);

  return {
    horizon: HORIZON,
    ground,
    painters: PAINTERS,
    pieces,
    people,
    tufts: [],
  };
}

/**
 * Furnishes the void tiles: a tree in a big planter where it hides no play,
 * a picnic table where there's room round it, a parked cargo bike, string
 * lights along the longest run of void, low planters against the walls.
 */
function courtyard(
  voids: readonly Tile[],
  isVoid: (x: number, z: number) => boolean,
  hides: (x: number, z: number, high: number, half: number) => boolean,
  put: (
    piece: SetPiece,
    x: number,
    z: number,
    yaw?: number,
    variant?: number,
    row?: ScenePiece['row'],
    lift?: number,
    size?: number,
  ) => void,
  patch: (kind: string, x0: number, x1: number, z0: number, z1: number) => void,
): void {
  if (voids.length === 0) return;
  const used = new Set<string>();
  const key = (t: Tile) => `${t.x},${t.z}`;
  const free = (t: Tile) => !used.has(key(t));
  const around = (t: Tile) =>
    [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ].filter(([dx, dz]) => isVoid(t.x + (dx ?? 0), t.z + (dz ?? 0))).length;
  // Trees: where they hide nothing, one per six tiles of light well, spread out.
  const trees = voids
    .filter((t) => isVoid(t.x, t.z + 1) && !hides(t.x, t.z, 2.7, 0.6))
    .sort((a, b) => around(b) - around(a) || a.z - b.z || a.x - b.x);
  const placedTrees: Tile[] = [];
  for (const t of trees) {
    if (placedTrees.length >= Math.max(1, Math.floor(voids.length / 8))) break;
    if (placedTrees.some((p) => Math.abs(p.x - t.x) + Math.abs(p.z - t.z) < 4)) continue;
    placedTrees.push(t);
    used.add(key(t));
    put(
      planterTree,
      t.x,
      t.z,
      Math.floor(unit(t.x, t.z, 3) * 4) * (Math.PI / 2),
      placedTrees.length,
      'near',
      0,
      1.05,
    );
  }
  // Picnic tables where all four sides are light well too: one per dozen tiles, apart.
  const tables = voids
    .filter((t) => free(t) && around(t) === 4)
    .sort((a, b) => b.z - a.z || a.x - b.x);
  const placedTables: Tile[] = [];
  for (const t of tables) {
    if (placedTables.length >= Math.max(1, Math.floor(voids.length / 12))) break;
    if (placedTables.some((p) => Math.abs(p.x - t.x) + Math.abs(p.z - t.z) < 3)) continue;
    placedTables.push(t);
    used.add(key(t));
    put(
      picnicTable,
      t.x,
      t.z,
      0.15 - placedTables.length * 0.3,
      placedTables.length - 1,
      'near',
      0,
      0.9,
    );
  }
  // A cargo bike parked along a pair of light-well tiles.
  const bike = voids.find(
    (t) =>
      free(t) && isVoid(t.x + 1, t.z) && free({ x: t.x + 1, z: t.z }) && !hides(t.x, t.z, 0.6, 0.5),
  );
  if (bike) {
    used.add(key(bike));
    used.add(key({ x: bike.x + 1, z: bike.z }));
    put(cargoBike, bike.x + 0.5, bike.z, Math.PI / 2, 1, 'near', 0, 0.85);
  }
  // String lights along the longest run of void in a row, where the posts hide nothing.
  let best: { z: number; x0: number; x1: number } | null = null;
  const rows = [...new Set(voids.map((v) => v.z))];
  for (const z of rows) {
    const xs = voids
      .filter((v) => v.z === z)
      .map((v) => v.x)
      .sort((a, b) => a - b);
    let start = xs[0] ?? 0;
    for (let i = 0; i < xs.length; i++) {
      const x = xs[i] ?? 0;
      const next = xs[i + 1];
      if (next === x + 1) continue;
      if (x - start >= 2 && (!best || x - start > best.x1 - best.x0)) {
        const ok = !hides(start, z, 1.7, 0.1) && !hides(x, z, 1.7, 0.1);
        if (ok) best = { z, x0: start, x1: x };
      }
      start = next ?? 0;
    }
  }
  if (best) {
    const x0 = best.x0 - 0.3;
    const span = best.x1 - best.x0 + 0.6;
    put(stringLights(span, 1.6), x0, best.z - 0.32, 0, 0, 'far');
  }
  // Low planters against the walls in what's left, every other tile or so.
  let planters = 0;
  for (const t of voids) {
    if (planters >= Math.max(3, Math.floor(voids.length / 4)) || !free(t) || around(t) > 2)
      continue;
    if (unit(t.x, t.z, 9) < 0.35) continue;
    used.add(key(t));
    put(lowPlanter, t.x, t.z, isVoid(t.x, t.z - 1) ? Math.PI / 2 : 0, planters, 'near', 0, 0.9);
    planters++;
  }
  // What the tenants leave out here, so no stretch of flags lies bare: wherever a free tile has
  // nothing next to it, something low (a tub shrub, sacks, a bike, a bench, a keg).
  const near = (t: Tile) =>
    [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ].some(([dx, dz]) => used.has(key({ x: t.x + (dx ?? 0), z: t.z + (dz ?? 0) })));
  const odds: readonly [SetPiece, number][] = [
    [shrubTub, 0.95],
    [flourSacks, 0.9],
    [parkedBike, 1],
    [quayBench, 0.9],
    [kegs, 0.9],
  ];
  let k = 0;
  for (const t of [...voids].sort((a, b) => a.z - b.z || a.x - b.x)) {
    if (!free(t) || near(t) || hides(t.x, t.z, 0.6, 0.3)) continue;
    used.add(key(t));
    const [piece, size] = odds[k % odds.length] ?? [shrubTub, 1];
    // Benches and bikes along the wall they stand against.
    const yaw = (isVoid(t.x, t.z - 1) ? Math.PI / 2 : 0) + (unit(t.x, t.z, 13) - 0.5) * 0.4;
    put(piece, t.x, t.z, yaw, piece === kegs ? 2 : piece === flourSacks ? 0 : k, 'near', 0, size);
    k++;
  }
  // Weathering: moss along the foot of the walls now and then, a puddle in a sunk flag.
  for (const t of voids) {
    const r = unit(t.x, t.z, 17);
    if (!isVoid(t.x, t.z - 1) && r < 0.45)
      patch('moss', t.x - 0.45, t.x + 0.45, t.z - 0.5, t.z - 0.36);
    if (!isVoid(t.x - 1, t.z) && r > 0.6)
      patch('moss', t.x - 0.5, t.x - 0.38, t.z - 0.4, t.z + 0.4);
    const open = around(t) >= 3 && (t.x * 3 + t.z * 5) % 7 === 0;
    if (open) patch('puddle', t.x - 0.35, t.x + 0.3, t.z + 0.05, t.z + 0.42);
  }
}

// ---- The scene's own ground ----

/** Cobbles: small setts in staggered courses, each its own shade, a few sunk darker. */
const setts: GroundPainter = (b, g, salt) => {
  const top = 0.03;
  const w = g.x1 - g.x0;
  const d = g.z1 - g.z0;
  b.box(
    w,
    top - 0.01,
    d,
    tint(SETTS, -0.35),
    { at: [(g.x0 + g.x1) / 2, (top - 0.01) / 2, (g.z0 + g.z1) / 2] },
    0,
  );
  const sw = 0.26;
  const sd = 0.19;
  for (let j = 0; j * sd < d - 0.02; j++) {
    const z = g.z0 + (j + 0.5) * sd;
    const off = (j % 2) * sw * 0.5;
    for (let i = -1; (i + 0.5) * sw + off < w + sw; i++) {
      const xa = Math.max(g.x0, g.x0 + i * sw + off + 0.015);
      const xb = Math.min(g.x1, g.x0 + (i + 1) * sw + off - 0.015);
      if (xb - xa < 0.04) continue;
      const s = shade(i, j, salt);
      // Cooler further out, where the evening sky takes over.
      const out = Math.min(1, Math.max(0, Math.min(Math.abs(xa + 0.5), Math.abs(xa - 30)) / 40));
      const c = tint(SETTS, (s - 0.5) * 0.2 - (s > 0.95 ? 0.15 : 0) - out * 0.05);
      b.box(xb - xa, 0.014, sd - 0.03, c, { at: [(xa + xb) / 2, top - 0.007, z] }, 0);
    }
  }
};

/** The light well's paving: big worn stone flags. */
const flags: GroundPainter = (b, g, salt) => {
  slabs(b, g, 0.036, FLAGS, [0.5, 0.5], 0.03, 0.14, salt + 40);
};

/** The yard's concrete pad under the coffee van, cast in slabs, a drain in it. */
const yard: GroundPainter = (b, g, salt) => {
  slabs(b, g, 0.034, YARD, [0.75, 1], 0.03, 0.1, salt);
  b.box(0.22, 0.004, 0.22, 0x3a3a3a, { at: [g.x1 - 0.25, 0.036, g.z1 - 0.3] }, 0);
};

/** The canal's stone edge: long granite blocks, their face down to the water, a wet line. */
const coping: GroundPainter = (b: ModelBuilder, g, salt) => {
  const top = 0.1;
  const d = g.z1 - g.z0;
  for (let x = g.x0, i = 0; x < g.x1; i++) {
    const len = 0.7 + shade(i, 1, salt) * 0.5;
    const c = tint(COPING, (shade(i, 2, salt) - 0.5) * 0.14);
    const l = Math.min(len, g.x1 - x);
    b.box(l - 0.02, top, d, c, { at: [x + l / 2, top / 2, (g.z0 + g.z1) / 2] }, 0);
    // An iron mooring ring now and then.
    if (shade(i, 3, salt) > 0.82)
      b.box(0.08, 0.012, 0.03, 0x2f3032, { at: [x + l / 2, top + 0.006, g.z1 - 0.04] }, 0);
    x += l;
  }
  const w = g.x1 - g.x0;
  b.box(w, 0.02, 0.02, tint(COPING, -0.4), { at: [(g.x0 + g.x1) / 2, 0.012, g.z1 + 0.01] }, 0);
};

/** The canal: dark blue-green water, lighter ripples, the moss line along the stone. */
const water: GroundPainter = (b, g, salt) => {
  const w = g.x1 - g.x0;
  const d = g.z1 - g.z0;
  b.box(w, 0.006, d, WATER, { at: [(g.x0 + g.x1) / 2, 0.003, (g.z0 + g.z1) / 2] }, 0);
  b.box(w, 0.003, 0.05, 0x2e3e34, { at: [(g.x0 + g.x1) / 2, 0.0075, g.z0 + 0.03] }, 0);
  for (let k = 0; k < w * 2.2; k++) {
    const x = g.x0 + shade(k, 0, salt) * w;
    const z = g.z0 + 0.12 + shade(k, 1, salt) * Math.min(d, 1.6);
    const len = 0.18 + shade(k, 2, salt) * 0.4;
    const c = shade(k, 3, salt) > 0.85 ? 0x8a7e62 : tint(WATER, 0.35 + shade(k, 4, salt) * 0.25);
    b.box(len, 0.002, 0.022, c, { at: [x, 0.008, z] }, 0);
  }
};

/** Moss creeping out from the foot of a wall: a soft strip of small tufts. */
const moss: GroundPainter = (b, g, salt) => {
  const w = g.x1 - g.x0;
  const d = g.z1 - g.z0;
  const n = Math.max(3, Math.round(Math.max(w, d) / 0.09));
  for (let k = 0; k < n; k++) {
    const t = (k + 0.5) / n;
    const x = w > d ? g.x0 + t * w : g.x0 + shade(k, 1, salt) * w;
    const z = w > d ? g.z0 + shade(k, 1, salt) * d : g.z0 + t * d;
    const s = 0.05 + shade(k, 2, salt) * 0.05;
    b.box(s, 0.006, s, tint(MOSS, (shade(k, 3, salt) - 0.5) * 0.25), { at: [x, 0.04, z] }, 0);
  }
};

/** Rainwater pooled in a sunk flag: a flat sheet with the sky's light on it. */
const puddle: GroundPainter = (b, g) => {
  const w = g.x1 - g.x0;
  const d = g.z1 - g.z0;
  const cx = (g.x0 + g.x1) / 2;
  const cz = (g.z0 + g.z1) / 2;
  b.box(w, 0.004, d * 0.7, PUDDLE, { at: [cx, 0.039, cz] }, 0);
  b.box(w * 0.75, 0.004, d, PUDDLE, { at: [cx + w * 0.05, 0.039, cz] }, 0);
  b.box(w * 0.4, 0.002, 0.03, tint(PUDDLE, 0.3), { at: [cx - w * 0.1, 0.042, cz - d * 0.15] }, 0);
};

const PAINTERS: Readonly<Record<string, GroundPainter>> = {
  setts,
  flags,
  yard,
  coping,
  water,
  moss,
  puddle,
};
