import type { LevelMap } from '../../../sim/level';
import { getTile } from '../../../sim/level';
import { gridToWorld, projectPoint } from '../../projection';
import { tileHash } from '../../mapShape';
import { tint } from '../kit';
import { WALL_HEIGHT } from '../layout';
import { cargoBike } from '../setDressing/canal';
import {
  balustrade,
  cherryPicker,
  coffeeCart,
  commuter,
  cutFace,
  cutGlass,
  cutSlab,
  finishedTower,
  FLOOR,
  floorNumber,
  laptopBag,
  liftShaft,
  lowPlanter,
  motorRoom,
  reservedDesk,
  terraceTop,
  streetBollard,
  toLetBanner,
} from '../setDressing/hotDesking';
import { wheelieBin } from '../setDressing/hypergrowth';
import { bus, cherryTree, dayCar } from '../setDressing/midRise';
import { bike, bikeStand, steamWisp } from '../setDressing/onCall';
import { bottleCage, pigeon } from '../setDressing/businessPark';
import { cityBlock } from '../setDressing/rooftop';
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
 * Hot Desking's world (level 3-3, scene `hot-desking`; see
 * `docs/plan/hot-desking-environment.md`): three floors of 3-1's mid-rise as
 * a cutaway round one lift, on a spring Friday afternoon.
 *
 * The cut: between the upper floors and the hot-desk floor, the floor slab
 * where the cutaway cuts it (dark concrete hatched at 45°, a big painted
 * floor number under each upper floor) with the hot-desk floor's ceiling void
 * under it (duct, cable tray, sprinkler main); the hot-desk floor's own cut
 * slab along the front with its "0"; the building's glass round the upper
 * floors cut off at the walls' line. Between the upper floors, the lift shaft
 * the three cars share: its dark back wall, the rails and the ropes running
 * from the motor room on the roof, at the back, down to the hot-desk floor's
 * car, the counterweight, a sill at each landing.
 *
 * Outside: round the upper floors the street lies storeys down (`DROP`):
 * pavements with cherry trees in blossom, little cars and a bus, people
 * leaving for the weekend with their laptop bags, and across the road the
 * finished glass tower, no crane, where an estate agent's cherry picker is
 * hanging a TO LET banner. Round the hot-desk floor the street at ground
 * level: a coffee cart under its awning, the wheelie bin and a bottle cage by
 * the bin hatch, a cycle rack full of bikes, and along the front, thin and
 * low, the pavement with bollards and planters, by the revolving door at the
 * ship and a courier's bike. Where the slab between the floors runs out past
 * the building, a terrace: on one end Prod, at the only desk nobody can book,
 * on the other a pigeon.
 *
 * Everything is placed from the map's outline, its voids (the slab row, the
 * shaft), its lift cabins, ship, bin and inbox tiles, and from where the
 * frame's edges fall at 1440×810. Pure data.
 */

/** The street out to the horizon, storeys down: pale spring pavement. */
const HORIZON = 0x8a8a84;
/** How far down the street lies round the upper floors (under the slab's foot). */
const DROP = -1.3;
/** Street pieces storeys down are this much smaller: they're further off. */
const LOW = 0.65;
/** The street's widths: pavement, road, the far pavement. */
const WALK = 1.0;
const ROAD = 1.6;
const FAR_WALK = 0.8;
/** How far the building's glass stands off the rooms' outer walls. */
const SKIN = 0.1;
/** Where the cutaway cuts the building's glass: a little over the rooms' walls, so it shows. */
const GLASS_CUT = WALL_HEIGHT + 0.45;
/** The ground-level pavement round the hot-desk floor: its width to the kerb. */
const PAVE = 1.15;
/** The terrace where the slab runs out past the building, each side. */
const TERRACE = 2.6;
/** The finished tower: width, depth, storeys, storey height. */
const TOWER = { w: 3.4, d: 1.6, floors: 18, storey: 0.24 } as const;
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
/** The player legend's right edge on screen. */
const HUD_LEGEND_RIGHT = 218;
/** The living props. */
const ALIVE: ReadonlyMap<SetPiece, AliveKind> = new Map<SetPiece, AliveKind>([
  [pigeon, 'peck'],
  [cherryTree, 'sway'],
  [commuter, 'bob'],
  [steamWisp, 'wisp'],
]);

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
 * What Hot Desking's world is built round, read from the map: the slab gap
 * (the void rows right across), the shaft (the void between the upper
 * floors), the upper floors (left and right of the shaft, behind the gap)
 * and the hot-desk floor in front. Shared with the tests. Pure.
 */
export interface HotDeskingPlan {
  slab: Rect;
  shaft: Rect;
  /** The upper floors: the top floor on the left, the middle floor on the right. */
  upper: Rect[];
  /** The hot-desk floor, street level. */
  lower: Rect;
}

export function hotDeskingPlan(map: LevelMap): HotDeskingPlan {
  const { width, height } = map;
  const isVoid = (x: number, z: number) => getTile(map, x, z) === 'void';
  const tiles: Tile[] = [];
  for (let z = 0; z < height; z++) for (let x = 0; x < width; x++) tiles.push({ x, z });
  const rows = new Set<number>();
  for (let z = 0; z < height; z++) {
    let all = true;
    for (let x = 0; x < width; x++) if (!isVoid(x, z)) all = false;
    if (all) rows.add(z);
  }
  const slabRows = [...rows];
  const sz0 = slabRows.length > 0 ? Math.min(...slabRows) : Math.floor(height / 2);
  const sz1 = slabRows.length > 0 ? Math.max(...slabRows) : sz0;
  const slab = { x0: -0.5, x1: width - 0.5, z0: sz0 - 0.5, z1: sz1 + 0.5 };
  // The shaft: void tiles behind the gap with the level's tiles both sides in their row.
  const between = tiles.filter((t) => {
    if (t.z >= sz0 || !isVoid(t.x, t.z)) return false;
    let l = false;
    let r = false;
    for (let x = t.x - 1; x >= 0; x--) if (!isVoid(x, t.z)) l = true;
    for (let x = t.x + 1; x < width; x++) if (!isVoid(x, t.z)) r = true;
    return l && r;
  });
  const shaft =
    between.length > 0
      ? { ...bounds(between), z0: -0.5, z1: slab.z0 }
      : { x0: width / 2 - 1.5, x1: width / 2 + 1.5, z0: -0.5, z1: slab.z0 };
  const solid = tiles.filter((t) => !isVoid(t.x, t.z));
  const back = solid.filter((t) => t.z < sz0);
  const upper = [back.filter((t) => t.x < shaft.x0), back.filter((t) => t.x > shaft.x1)].flatMap(
    (g) => (g.length > 0 ? [bounds(g)] : []),
  );
  const front = solid.filter((t) => t.z > sz1);
  return {
    slab,
    shaft,
    upper,
    lower:
      front.length > 0
        ? bounds(front)
        : { x0: -0.5, x1: width - 0.5, z0: slab.z1, z1: height - 0.5 },
  };
}

/** The scene round `map`: pure and deterministic. */
export function hotDeskingScene(map: LevelMap): Scene {
  const { width, height } = map;
  const L = -0.5;
  const R = width - 0.5;
  const F = height - 0.5;
  const pose = scenePose(map);
  const plan = hotDeskingPlan(map);
  const { slab, shaft, lower } = plan;
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
  const offSlab = (x: number, z: number, r: number, rz = r) => {
    for (const dx of [-r, 0, r])
      for (const dz of [-rz, 0, rz]) if (isSlab(x + dx, z + dz)) return false;
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

  const tilesOf = (kind: string): Tile[] =>
    map.tiles.flatMap((t, i) => (t === kind ? [{ x: i % width, z: Math.floor(i / width) }] : []));
  const ship = tilesOf('ship');
  const bin = tilesOf('bin');
  const shipX = ship.length > 0 ? ship.reduce((s, t) => s + t.x, 0) / ship.length : width * 0.75;
  const shipFront = ship.length > 0 && ship.every((t) => t.z === height - 1);
  const binTile = bin[0];

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
  /** Makes the last piece put a living one (`kind`), if it's a tile or more from the room. */
  const alive = (kind: AliveKind) => {
    const p = pieces[pieces.length - 1];
    if (p && clearOfRoom(p.at.x, p.at.z)) p.alive = kind;
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
    rz = r,
  ): boolean => {
    if (!clear(x, z, r, high + lift, rz, lift) || !offSlab(x, z, r, rz)) return false;
    put(piece, x, z, yaw, variant, 'near', lift, size);
    return true;
  };
  const patch = (kind: string, x0: number, x1: number, z0: number, z1: number, y = 0) => {
    if (x1 - x0 > 0.01 && z1 - z0 > 0.01)
      ground.push({ kind, x0, x1, z0, z1, ...(y !== 0 ? { y } : {}) });
  };
  const person = (x: number, z: number, yaw: number, p: ScenePose) =>
    people.push({ at: gridToWorld(x, z, GROUND), yaw, pose: p });
  /** A laptop bag hanging at the side of someone standing at (x, z) facing `yaw`. */
  const bagAt = (x: number, z: number, yaw: number, side: number, v: number) => {
    const a = yaw + (side * Math.PI) / 2;
    put(
      laptopBag,
      x + Math.sin(a) * 0.3,
      z + Math.cos(a) * 0.3,
      yaw + (side * Math.PI) / 2,
      v,
      'near',
      0.42,
    );
  };

  // Where the frame's edges fall, a little past them.
  const topZ = -12;
  const frontZ = F + 2.5;
  const edgeL = Math.min(xAt(0, topZ), xAt(0, frontZ)) - 1;
  const edgeR = Math.max(xAt(VIEW.width, topZ), xAt(VIEW.width, frontZ)) + 1;
  const far = 8;

  // ---- The building's lines ----
  const backLine = -0.5 - SKIN;
  const leftLine = L - SKIN;
  const rightLine = R + SKIN;
  const midZ = (slab.z0 + slab.z1) / 2;

  // ---- Ground ----
  // Storeys down round the upper floors (the horizon's level), at the slab's foot round the hot-desk floor.
  const backWalk = backLine - WALK;
  const backRoad = backWalk - ROAD;
  const backFar = backRoad - FAR_WALK;
  patch('walk', edgeL - far, edgeR + far, backWalk, backLine + 0.3, DROP);
  patch('road:x', edgeL - far, edgeR + far, backRoad, backWalk, DROP);
  patch('walk', edgeL - far, edgeR + far, backFar, backRoad, DROP);
  patch('plaza', edgeL - far, edgeR + far, topZ - far, backFar, DROP);
  // Down the sides of the upper floors, storeys down.
  patch('walk', leftLine - WALK, leftLine + 0.3, backLine, midZ, DROP);
  patch('road:z', leftLine - WALK - ROAD, leftLine - WALK, backWalk, midZ, DROP);
  patch('walk', edgeL - far, leftLine - WALK - ROAD, backWalk, midZ, DROP);
  patch('walk', rightLine - 0.3, rightLine + WALK, backLine, midZ, DROP);
  patch('road:z', rightLine + WALK, rightLine + WALK + ROAD, backWalk, midZ, DROP);
  patch('walk', rightLine + WALK + ROAD, edgeR + far, backWalk, midZ, DROP);
  // Street level round the hot-desk floor: the pavement to the kerb, the road past it.
  const kerbL = lower.x0 - PAVE;
  const kerbR = lower.x1 + PAVE;
  const kerbF = lower.z1 + PAVE;
  patch('pave', kerbL, kerbR, midZ, kerbF);
  patch('kerb:x', kerbL - 0.12, kerbR + 0.12, kerbF, kerbF + 0.12);
  patch('kerb:z', kerbL - 0.12, kerbL, midZ, kerbF);
  patch('kerb:z', kerbR, kerbR + 0.12, midZ, kerbF);
  patch('road:x', edgeL - far, edgeR + far, kerbF + 0.12, frontZ + far);
  patch('road:z', edgeL - far, kerbL - 0.12, midZ, kerbF + 0.12);
  patch('road:z', kerbR + 0.12, edgeR + far, midZ, kerbF + 0.12);
  // The shaft's floor (its back wall, as the cutaway shows it) is the shaft piece's own.
  patch('pit', shaft.x0, shaft.x1, backLine, slab.z1);

  // ---- The cut: the slab between the floors, the hot-desk floor's slab, the glass ----
  {
    const d = slab.z1 - slab.z0 - 0.09;
    const z = slab.z1 - 0.06;
    // Inside the building, either side of the shaft.
    for (const [x0, x1] of [
      [L, shaft.x0 - 0.25],
      [shaft.x1 + 0.25, R],
    ] as const)
      if (x1 - x0 > 0.2) put(cutSlab(x1 - x0 - 0.04, d), x0 + 0.02, z);
    // A big floor number on the slab under each upper floor, toward its outer end.
    const [top, mid] = plan.upper;
    const px = 0.09;
    if (top) put(floorNumber('2', px), top.x1 - 2.2, slab.z0 + 0.36, 0, 0, 'near', FLOOR);
    if (mid) put(floorNumber('1', px), mid.x1 - 1.4, slab.z0 + 0.36, 0, 0, 'near', FLOOR);
    // The terrace where the slab runs out past the building, each side: a cut face toward the street.
    const tl = leftLine - TERRACE;
    const tr = rightLine + TERRACE;
    put(cutFace(L - 0.02 - tl, FLOOR, '', 0), tl, z);
    put(cutFace(tr - (R + 0.02), FLOOR, '', 0), R + 0.02, z);
    put(terraceTop(L - 0.02 - tl, d), (tl + L - 0.02) / 2, z - d / 2);
    put(terraceTop(tr - R - 0.02, d), (R + 0.02 + tr) / 2, z - d / 2);
    put(balustrade(L - 0.02 - tl), tl, slab.z0 + 0.06, 0, 0, 'near', FLOOR);
    put(balustrade(tr - R - 0.02), R + 0.02, slab.z0 + 0.06, 0, 0, 'near', FLOOR);
    // The only desk nobody can book, out on the left terrace; a pigeon on the right one's edge.
    put(reservedDesk, L - 1.15, slab.z0 + 0.5, 0.12, 0, 'near', FLOOR);
    put(pigeon, R + 1.4, slab.z1 - 0.12, -0.6, 0, 'near', FLOOR);
    put(pigeon, R + 1.9, slab.z0 + 0.25, 2.2, 1, 'near', FLOOR + 0.52);
  }
  // The hot-desk floor's own slab, cut along the front, with its "0".
  {
    // From where it clears the player legend, at the bottom left.
    const x0 = Math.max(lower.x0, xAt(HUD_LEGEND_RIGHT + 4, lower.z1 + 0.05, FLOOR));
    put(cutFace(lower.x1 - x0, FLOOR, '0', 0.9), x0, lower.z1 + 0.025);
  }
  // The building's glass round the upper floors, cut at the walls' line.
  for (const u of plan.upper) {
    const x0 = u.x0 === L ? leftLine : u.x0;
    const x1 = u.x1 === R ? rightLine : u.x1;
    put(cutGlass(x1 - x0, GLASS_CUT), x0, backLine, 0, 0, 'far');
    if (u.x0 === L)
      put(cutGlass(slab.z0 - backLine, GLASS_CUT), leftLine, slab.z0, Math.PI / 2, 0, 'far');
    if (u.x1 === R)
      put(cutGlass(slab.z0 - backLine, GLASS_CUT), rightLine, backLine, -Math.PI / 2, 0, 'far');
  }

  // ---- The lift shaft and its motor room on the roof ----
  {
    const cx = (shaft.x0 + shaft.x1) / 2;
    const w = shaft.x1 - shaft.x0 - 0.06;
    const front = slab.z1 - 0.6;
    const len = front - backLine;
    const cabins = map.marks.filter((m) => m.kind === 'lift');
    // A landing at each upper car's front edge and at the hot-desk floor's car.
    const upperZ = Math.max(...cabins.filter((c) => c.y < slab.z0).map((c) => c.y + 0.5), 0.5);
    put(liftShaft(w, len, len * 0.55, [front - upperZ, 0.08]), cx, front);
    put(floorNumber('2', 0.07), shaft.x0 + 0.42, upperZ + 0.5, 0, 0, 'near', 0.07);
    put(floorNumber('1', 0.07), shaft.x1 - 0.42, upperZ + 0.5, 0, 0, 'near', 0.07);
    put(floorNumber('0', 0.07), shaft.x0 + 0.42, front - 0.55, 0, 0, 'near', 0.07);
    // The core behind the building, up from the street, with the motor room on top.
    put(motorRoom(w + 0.06, 1.3, FLOOR - DROP), cx, backLine - 0.02, 0, 0, 'far', FLOOR);
  }

  // ---- Across the street: the finished tower with the TO LET banner going up ----
  const siteZ = backFar - 0.25;
  {
    const { w, d, floors, storey } = TOWER;
    const tz = siteZ;
    // As far right as keeps it off the mute button; never under the order cards.
    let tx = xAt(1330, tz, DROP + floors * storey) - w / 2;
    tx = Math.max(tx, xAt(CARDS_RIGHT + 40, tz, DROP) + w / 2);
    put(finishedTower(w, d, floors, storey), tx, tz, 0, 0, 'far', DROP);
    // The banner on the lower floors, the cherry picker in the road below reaching up to its corner.
    const bh = 1.0;
    const btop = 6 * storey;
    const bw = w * 0.62;
    const bx = tx - w * 0.14;
    put(toLetBanner(bw, bh), bx, tz + 0.03, 0, 0, 'far', DROP + btop);
    alive('sway');
    // The picker on the far pavement right of the tower, its basket up at the banner's corner.
    const ps = 1.25;
    const px = tx + w / 2 + 0.55;
    const pz = backFar + FAR_WALK * 0.55;
    put(
      cherryPicker((bx + bw / 2 + 0.2 - px) / ps, (btop - 0.25) / ps, (tz + 0.3 - pz) / ps),
      px,
      pz,
      0,
      0,
      'far',
      DROP,
      ps,
    );
    // The rest of the far side: lower blocks, offices with their lights on, out past both edges.
    let k = 0;
    for (let x = tx - w / 2 - 0.3; x > edgeL - 3; k++) {
      const bw = 2.2 + unit(k, 1, 21) * 1.4;
      const bh2 = 1.4 + unit(k, 2, 21) * 1.6;
      put(cityBlock(bw, 1.6, bh2, k + 1, 0), x - bw / 2, tz - 0.1, 0, 0, 'far', DROP);
      x -= bw + 0.25;
    }
    for (let x = tx + w / 2 + 0.3; x < edgeR + 3; k++) {
      const bw = 2.0 + unit(k, 3, 21) * 1.2;
      put(
        cityBlock(bw, 1.6, 1.2 + unit(k, 4, 21) * 0.8, k + 2, 0),
        x + bw / 2,
        tz - 0.1,
        0,
        0,
        'far',
        DROP,
      );
      x += bw + 0.25;
    }
  }

  // ---- The street storeys down: trees, cars, a bus, people heading home ----
  {
    /** Whether a street prop storeys down at (x, z), `r` round, keeps off the building. */
    const downStreet = (x: number, z: number, r: number) =>
      z < midZ - r && !(x > leftLine - r && x < rightLine + r && z > backLine - r);
    /** Whether something `h` tall storeys down at (x, z) shows over the building's glass. */
    const seen = (x: number, z: number, h: number) => {
      if (x < leftLine - 0.3 || x > rightLine + 0.3 || z > backLine) return true;
      const top = projectPoint(pose, { x, y: GROUND + DROP + h, z });
      const head = projectPoint(pose, { x, y: GROUND + FLOOR + GLASS_CUT, z: backLine });
      return top.y < head.y;
    };
    const size = 2.2 * LOW;
    // Along the far pavement, and down the far side of each side road.
    for (let k = 0, x = edgeL + 0.6; x < edgeR; k++, x += 2.0 + unit(k, 5, 23) * 0.8) {
      const fz = backFar + FAR_WALK * 0.5;
      if (downStreet(x, fz, 0.4) && (x < leftLine - 0.5 || x > rightLine + 0.5))
        put(cherryTree, x, fz, k, k + 1, 'far', DROP, size);
    }
    for (const x of [leftLine - WALK - ROAD - 0.45, rightLine + WALK + ROAD + 0.45])
      for (let k = 0, z = backLine + 1.4; z < midZ - 0.8; k++, z += 2.2)
        if (downStreet(x, z, 0.4)) put(cherryTree, x, z, k * 2, k + 2, 'far', DROP, size);
    // Cars along the back road and down the sides; the bus.
    for (let k = 0, x = edgeL + 1; x < edgeR; k++, x += 2.4 + unit(k, 7, 23) * 1.4) {
      const lane = k % 2;
      const z = backRoad + ROAD * (lane ? 0.3 : 0.7);
      if (onScreen(x, z, DROP, 5) && seen(x, z, 0.3))
        put(dayCar, x, z, lane ? Math.PI : 0, k, 'far', DROP, 1.9 * LOW);
    }
    if (seen((L + R) / 2 + 1.5, backRoad + ROAD * 0.3, 0.5))
      put(bus, (L + R) / 2 + 1.5, backRoad + ROAD * 0.3, Math.PI, 0, 'far', DROP, 2.0 * LOW);
    for (const [x, s] of [
      [leftLine - WALK - ROAD * 0.3, 1],
      [rightLine + WALK + ROAD * 0.7, -1],
    ] as const)
      for (let k = 0, z = backLine + 1.2; z < midZ - 0.8; k++, z += 2.6)
        if (onScreen(x, z, DROP, 5))
          put(dayCar, x, z, (s * Math.PI) / 2, k + 3, 'far', DROP, 1.9 * LOW);
    // People heading home, laptop bags on their shoulders.
    let v = 0;
    for (const [x, z, yaw] of [
      [leftLine - WALK * 0.35, backLine + 1.1, 0.2],
      [leftLine - WALK * 0.65, backLine + 3.3, Math.PI],
      [rightLine + WALK * 0.35, backLine + 1.6, 0.1],
      [rightLine + WALK * 0.65, backLine + 3.7, Math.PI - 0.2],
      [leftLine - 2.6, backFar + FAR_WALK * 0.5, Math.PI / 2],
      [rightLine + 2.4, backFar + FAR_WALK * 0.5, -Math.PI / 2],
    ] as const)
      if (downStreet(x, z, 0.2) && seen(x, z, 0.5))
        put(commuter, x, z, yaw, v++, 'far', DROP, LOW * 1.1);
  }

  // ---- Street level, left of the hot-desk floor: the coffee cart, the bins ----
  {
    const x = leftLine - 0.85;
    const cz = midZ + 1.35;
    putClear(coffeeCart, x, cz, 0.6, 1.5, 0, 0, 0, 1, 0.35);
    put(steamWisp, x - 0.2, cz - 0.05, 0, 0, 'near', 0.9, 0.6);
    // Someone leaving with a coffee for the train, their laptop bag at their side.
    const px = x - 0.5;
    const pz = cz + 1.15;
    if (clearOfRoom(px, pz) && clear(px, pz, 0.35, 1.5)) {
      person(px, pz, Math.PI / 2 - 0.4, 'sipping');
      bagAt(px, pz, Math.PI / 2 - 0.4, -1, 0);
    }
    if (binTile) {
      const bz = binTile.z;
      putClear(wheelieBin, leftLine - 0.4, bz - 0.1, 0.32, 0.95, Math.PI / 2 + 0.1);
      if (!putClear(bottleCage, leftLine - 0.45, bz - 1.0, 0.5, 0.9, Math.PI / 2 - 0.05))
        putClear(bottleCage, leftLine - 0.45, bz + 1.0, 0.5, 0.9, Math.PI / 2);
    }
  }

  // ---- Street level, right: the cycle rack, full on a Friday ----
  {
    const x = rightLine + 0.55;
    const z0 = midZ + 0.9;
    let k = 0;
    for (let z = z0; z < lower.z1 - 0.6; z += 0.42, k++)
      if (clear(x, z, 0.5, 0.65, 0.1) && k % 5 !== 3) put(bike, x, z, 0, k * 3 + 1, 'near');
    put(bikeStand(Math.max(1, k)), x + 0.36, z0, 0);
  }

  // ---- In front: the pavement, thin and low ----
  {
    const z = lower.z1 + 0.5;
    if (ship.length > 0 && shipFront) {
      putClear(cargoBike, shipX + 1.75, z + 0.05, 0.65, 0.6, Math.PI / 2 + 0.08, 0, 0, 1, 0.3);
    }
    for (let x = lower.x0 + 1.5; x < lower.x1 - 1; x += 2.5) {
      if (Math.abs(x - shipX) < 2.6) continue;
      putClear(streetBollard, x, kerbF - 0.18, 0.08, 0.5);
    }
    for (const x of [lower.x0 + 4.2, (lower.x0 + lower.x1) / 2 + 2.2])
      if (Math.abs(x - shipX) > 2.6)
        putClear(lowPlanter(1.6), x, z + 0.05, 0.8, 0.45, 0, 0, 0, 1, 0.2);
  }

  return {
    horizon: HORIZON,
    horizonY: DROP,
    ground,
    painters: PAINTERS,
    pieces,
    people,
    tufts: [],
  };
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

/** Paving flags `s` square in `base`, each its own tone, with paler joints. */
function flags(b: Builder, g: GroundPatch, top: number, base: number, s: number, salt: number) {
  fill(b, g, top - 0.004, tint(base, 0.14));
  for (let j = 0, z = g.z0; z < g.z1 - 0.01; j++, z += s)
    for (let i = 0, x = g.x0; x < g.x1 - 0.01; i++, x += s) {
      const xb = Math.min(g.x1, x + s);
      const zb = Math.min(g.z1, z + s);
      b.box(
        xb - x - 0.016,
        0.003,
        zb - z - 0.016,
        tint(base, (shade(i, j, salt) - 0.5) * 0.09),
        { at: [(x + xb) / 2, top, (z + zb) / 2] },
        0,
      );
    }
}

/** The road in afternoon sun: asphalt, a dashed centre line, patched now and then. */
function road(along: 'x' | 'z'): GroundPainter {
  return (b, g, salt) => {
    const top = 0.008;
    fill(b, g, top - 0.004, 0x55585c);
    const len = along === 'x' ? g.x1 - g.x0 : g.z1 - g.z0;
    const c0 = along === 'x' ? g.x0 : g.z0;
    const mid = along === 'x' ? (g.z0 + g.z1) / 2 : (g.x0 + g.x1) / 2;
    const wide = along === 'x' ? g.z1 - g.z0 : g.x1 - g.x0;
    const at = (u: number, v: number, y: number): [number, number, number] =>
      along === 'x' ? [c0 + u, y, mid + v] : [mid + v, y, c0 + u];
    const strip = (u: number, v: number, l: number, t: number, c: number, y: number) =>
      b.box(along === 'x' ? l : t, 0.002, along === 'x' ? t : l, c, { at: at(u, v, top + y) }, 0);
    if (wide > 1) for (let u = 0.2; u < len; u += 0.7) strip(u, 0, 0.36, 0.04, 0xd8d4c8, 0.002);
    for (let k = 0, u = 0.5; u < len; k++, u += 1.3)
      if (shade(k, 3, salt) > 0.72)
        strip(u, (shade(k, 5, salt) - 0.5) * wide * 0.5, 0.5, 0.3, 0x4c4f53, 0.0015);
  };
}

/** Pale spring pavement storeys down, fallen blossom by the trees. */
const walk: GroundPainter = (b, g, salt) => {
  flags(b, g, 0.02, 0xb2aea4, 0.5, salt);
  const w = g.x1 - g.x0;
  const d = g.z1 - g.z0;
  const count = Math.min(240, Math.floor(w * d * 5));
  for (let k = 0; k < count; k++)
    b.box(
      0.04,
      0.002,
      0.03,
      shade(k, 55, salt) > 0.5 ? 0xe4b8c6 : 0xd8a8b8,
      {
        at: [g.x0 + shade(k, 51, salt) * w, 0.024, g.z0 + shade(k, 53, salt) * d],
        rot: [0, shade(k, 57, salt) * 3, 0],
      },
      0,
    );
};

/** The plaza across the road, round the towers: big pale flags. */
const plaza: GroundPainter = (b, g, salt) => {
  flags(b, g, 0.02, 0xa8a49a, 1.0, salt + 11);
};

/** The pavement at street level round the hot-desk floor: warm grey flags in the sun, a few gum spots. */
const pave: GroundPainter = (b, g, salt) => {
  flags(b, g, 0.03, 0xb8b2a6, 0.5, salt + 3);
  const w = g.x1 - g.x0;
  const d = g.z1 - g.z0;
  const count = Math.min(80, Math.floor(w * d * 1.2));
  for (let k = 0; k < count; k++)
    b.cylinder(
      0.025,
      0.025,
      0.002,
      0x8e8a82,
      { at: [g.x0 + shade(k, 61, salt) * w, 0.034, g.z0 + shade(k, 63, salt) * d] },
      6,
    );
};

/** The kerb: a raised pale granite edge. */
function kerb(along: 'x' | 'z'): GroundPainter {
  return (b, g) => {
    const len = along === 'x' ? g.x1 - g.x0 : g.z1 - g.z0;
    for (let u = 0, k = 0; u < len - 0.01; u += 0.6, k++) {
      const l = Math.min(0.6, len - u) - 0.01;
      const c = tint(0xc8c4ba, (shade(k, 9, 3) - 0.5) * 0.06);
      if (along === 'x')
        b.box(l, 0.06, g.z1 - g.z0, c, { at: [g.x0 + u + l / 2, 0.03, (g.z0 + g.z1) / 2] }, 0);
      else b.box(g.x1 - g.x0, 0.06, l, c, { at: [(g.x0 + g.x1) / 2, 0.03, g.z0 + u + l / 2] }, 0);
    }
  };
}

/** Under the shaft: dark. */
const pit: GroundPainter = (b, g) => {
  fill(b, g, 0.004, 0x8a8e92);
};

const PAINTERS: Readonly<Record<string, GroundPainter>> = {
  'road:x': road('x'),
  'road:z': road('z'),
  walk,
  plaza,
  pave,
  'kerb:x': kerb('x'),
  'kerb:z': kerb('z'),
  pit,
};
