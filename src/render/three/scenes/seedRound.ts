import type { LevelMap } from '../../../sim/level';
import { getTile } from '../../../sim/level';
import { gridToWorld, projectPoint, screenToGround } from '../../projection';
import { firstGroup, tileHash } from '../../mapShape';
import { type ModelBuilder, tint } from '../kit';
import { pigeon } from '../setDressing/businessPark';
import {
  airHandler,
  antennaMast,
  balloons,
  beanBag,
  cableTray,
  CORE,
  cityBlock,
  condenser,
  corporateTower,
  ductRun,
  grasses,
  hammock,
  liftCore,
  liftLobby,
  liftSign,
  LOGO_PX,
  MEMBRANE,
  mastFlag,
  mushroomVent,
  PARAPET,
  parapet,
  pingPong,
  planterBox,
  planterTree,
  rackCabinet,
  raisedBanner,
  redLight,
  roofHatch,
  satDish,
  scooterRack,
  serverBlade,
  skylightTile,
  solarPanels,
  statusLed,
  stringLights,
  textWidth,
  tinyCar,
  tinyLamp,
  tinyTree,
  towerCrane,
  towerUnderConstruction,
} from '../setDressing/rooftop';
import type { SetPiece } from '../setDressing/shared';
import { scenePose } from './downTheHall';
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
 * The Seed Round level's own world (level 2-1, scene `seed-round`; see
 * `docs/plan/seed-round-environment.md`): the rooftop round the startup's new
 * loft on a city-centre block, at blue hour on launch night. Behind the
 * level, the building's white stair and lift core is its back wall, with the
 * lift motor room, a timber-clad water tank and the startup's name in big lit
 * letters on its roof; past it the skyline: lit office blocks, a glass tower
 * going up under a crane, and the corporate tower with its glowing logo
 * where the game ends up. Left, the terrace (decking, planters, string
 * lights, bean bags, ping-pong, a hammock, the scooters, the "WE RAISED"
 * balloons); right, the plant deck where shipped work goes out (condensers,
 * ducts, solar panels, the rack cabinet, the dish, the antenna mast). In
 * front, a thin strip of roof, the parapet with its glass balustrade and,
 * far below, the street. Void tiles inside the outline become a light well:
 * glass roof lights with the floor below glowing up through them.
 *
 * Everything is placed from the level's outline, its void tiles and its ship
 * and inbox tiles, and from where the frame's edges fall for this map (the
 * camera fit at 1440×810), so it fits any map of this level. Pure data.
 */

/** The city far below, out to the horizon: dark blue-grey. */
const HORIZON = 0x2e323c;
const DECK = 0x6c5c52;
const PAVER = 0x737a84;
const GRAVEL = 0x5e6570;
const PAVEMENT = 0x5a5c62;
const ROAD = 0x2a2c32;
const ZEBRA = 0xc8c6c0;
/** The startup's name on the core's roof (fictional). */
const NAME = 'YOTTA';
/**
 * How far in front of the level the roof runs before the parapet (wider when the ship hatch is on the
 * front edge: its folded glass doors stand out there), then the face of the building.
 */
const STRIP = 0.18;
const STRIP_SHIP = 0.42;
/** How far either side of the ship opening's middle its doors reach. */
const SHIP_DOORS = 2.6;
const DROP = 0.14;
/** The street's pavement, then the road. */
const WALK = 0.16;
/** The street canyon between our block and the next ones. */
const CANYON = 0.7;
/** How far behind the core the roof runs before its back parapet. */
const BACK_ROOF = 0.5;
/** How far the core's face stands behind the back wall: just clear of it, so no roof shows between. */
const CORE_GAP = 0.07;
/** The core's width past the level's left edge (over the terrace's back). */
const CORE_LEFT = 0.9;
/** The logo: the screen x it starts right of (the order cards), and how wide it runs. */
const LOGO_LEFT = 720;
const LOGO_WIDE = textWidth(NAME, true) * LOGO_PX + 0.42 * 2 + 0.5;
/** The screen the scene is composed for. */
const VIEW = { width: 1440, height: 810 };
/** The legend's right edge on screen: low props only left of it in the lower part of the frame. */
const LEGEND = { right: 225, top: 600 };
/** The courier's hold: how far in front of the sysadmin, how high, the blade sits. */
const CARRY = { reach: 0.34, lift: 0.52 } as const;
/** The living props. */
const ALIVE: ReadonlyMap<SetPiece, AliveKind> = new Map<SetPiece, AliveKind>([
  [grasses, 'sway'],
  [balloons, 'bob'],
  [mastFlag, 'sway'],
  [redLight, 'blink'],
  [statusLed, 'blink'],
  [pigeon, 'peck'],
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

/** The scene round `map`: pure and deterministic. */
export function seedRoundScene(map: LevelMap): Scene {
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
  const sideL = L - xAt(0, midZ);
  const sideR = xAt(VIEW.width, midZ) - R;
  const topZ = screenToGround(pose, VIEW.width / 2, 0, GROUND)?.y ?? B - 5;

  const tileAt = (x: number, z: number) => getTile(map, x, z);
  const isVoid = (x: number, z: number) => tileAt(x, z) === 'void';
  const isPlay = (x: number, z: number) => {
    const t = tileAt(x, z);
    return t !== null && t !== 'void' && t !== 'wall';
  };
  /** Whether something `high` tall and `half` wide at (x, z) would hide play on screen. */
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
  /** Puts `piece` with its origin at (x, z), on the ground or `lift` above it, `size` times its size. */
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
    const bright = 0.93 + unit(i, 1, 3) * 0.1;
    const cool = (unit(i, 2, 5) * 2 - 1) * 0.04;
    const alive = ALIVE.get(piece);
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
  const patch = (kind: string, x0: number, x1: number, z0: number, z1: number) =>
    ground.push({ kind, x0, x1, z0, z1 });
  const person = (x: number, z: number, yaw: number, pose: ScenePose) =>
    people.push({ at: gridToWorld(x, z, GROUND), yaw, pose });

  // ---- The roof's outline: the terrace's and the plant deck's outer parapets, the back one ----
  const roofL = L - Math.max(3, sideL - 0.5);
  const roofR = R + Math.max(3, sideR - 0.5);
  const coreBack = B - CORE_GAP - CORE.depth;
  const roofB = coreBack - BACK_ROOF;
  const strip = shipEdge === 'front' ? STRIP_SHIP : STRIP;
  const p0 = F + strip;
  const p1 = p0 + PARAPET.depth;
  const pz = (p0 + p1) / 2;

  // ---- Ground: membrane over the roof, decking, gravel and pavers; past the parapets the drop and the street ----
  patch('membrane', roofL, roofR, roofB, p0);
  patch('deck', roofL + 0.45, L - 0.22, B - 0.15, F - 0.15);
  patch('gravel', R + 0.75, roofR - 0.1, roofB + 0.1, F - 0.1);
  patch('pavers', R + 0.06, R + 0.7, roofB + 0.1, F - 0.1);
  patch('pavers', L - 0.68, R + 0.06, B - 0.02, B + 0.0);
  const far = 40;
  // In front: the building's face going down, then the street.
  patch('drop', roofL - PARAPET.depth, roofR + PARAPET.depth, p1, p1 + DROP);
  patch('streetFront', -far, width + far, p1 + DROP, p1 + DROP + 8);
  // Down the sides and behind.
  const sl = roofL - PARAPET.depth;
  const sr = roofR + PARAPET.depth;
  const sb = roofB - PARAPET.depth;
  patch('dropL', sl - DROP, sl, sb, p1 + DROP);
  patch('dropR', sr, sr + DROP, sb, p1 + DROP);
  patch('streetLeft', -far, sl - DROP, sb - DROP - 12, p1 + DROP);
  patch('streetRight', sr + DROP, width + far, sb - DROP - 12, p1 + DROP);
  patch('dropB', sl - DROP, sr + DROP, sb - DROP, sb);
  patch('streetBack', sl - DROP, sr + DROP, sb - DROP - 12, sb - DROP);
  // The roofs of the blocks round ours, across a street canyon: low, with their own plant on top.
  const nl = sl - DROP - CANYON;
  const nr = sr + DROP + CANYON;
  const zc = sb - DROP - CANYON;
  for (let z = zc + 0.4, k = 0; z < midZ; k++) {
    const d = 1.8 + unit(k, 1, 61) * 0.8;
    const h = 0.25 + unit(k, 2, 61) * 0.5;
    put(cityBlock(2.4, d, h, k + 2, 0.8), nl - 1.2, z + d, 0, 0, 'far');
    put(cityBlock(2.4, d, h * 0.8, k + 5, 0.8), nr + 1.2, z + d, 0, 0, 'far');
    z += d + 0.45;
  }

  // ---- The parapets ----
  put(parapet(roofR - roofL + PARAPET.depth * 2), roofL - PARAPET.depth, pz);
  put(parapet(p1 - sb), sl + PARAPET.depth / 2, sb, -Math.PI / 2);
  put(parapet(p1 - sb), sr - PARAPET.depth / 2, sb, -Math.PI / 2);
  put(parapet(sr - sl, false), sl, roofB - PARAPET.depth / 2, 0, 0, 'far');

  // ---- Back: the stair and lift core, its front the level's back wall ----
  const coreL = L - CORE_LEFT;
  const logoX0 = xAt(LOGO_LEFT, B - 0.4, CORE.height + 0.6) + 0.15;
  const logo = Math.min(R - 1.2 - LOGO_WIDE / 2, logoX0 + LOGO_WIDE / 2);
  const coreR = Math.min(R - 0.4, Math.max(logo + LOGO_WIDE / 2 + 0.5, R - 2.5));
  const coreW = coreR - coreL;
  const cx = (coreL + coreR) / 2;
  const doorX = inboxEdge === 'back' && inbox.length > 0 ? mid(inbox, 'x') : undefined;
  const motorX = doorX ?? coreL + 1.2;
  const tankX = Math.min(
    logo - LOGO_WIDE / 2 - 0.7,
    Math.max(motorX + 1.6, xAt(560, B - 1.2, 2.5)),
  );
  const stairX = doorX !== undefined && doorX - coreL < 2 ? doorX + 1.9 : coreL + 0.6;
  put(
    liftCore({
      width: coreW,
      ...(doorX !== undefined ? { door: doorX - cx, doorWidth: inbox.length - 0.16 } : {}),
      stair: stairX - cx,
      motor: motorX - cx,
      tank: tankX - cx,
      logo: logo - cx,
      name: NAME,
    }),
    cx,
    B - CORE_GAP,
    0,
    0,
    'far',
  );
  // A lift lobby on a side of the level when the inbox is there.
  if (inboxEdge === 'left' && inbox.length > 0) {
    put(liftLobby(inbox.length), L - CORE_GAP, mid(inbox, 'z') - 0.25, Math.PI / 2);
    // The lit floor indicator and plaque on the lobby's end, facing the camera.
    put(
      liftSign,
      L - CORE_GAP - 0.55,
      mid(inbox, 'z') - 0.25 + inbox.length / 2,
      0,
      0,
      'near',
      0.95,
    );
  } else if (inboxEdge === 'right' && inbox.length > 0)
    put(liftLobby(inbox.length), R + CORE_GAP, mid(inbox, 'z') - 0.25, -Math.PI / 2);

  // ---- The skyline beyond: office blocks, the tower going up under its crane, the corporate tower ----
  // The camera looks steeply down, so only the feet of the towers show: everything stands close,
  // the crane in front of its tower so its jib is in frame.
  const towerX = Math.max(coreR + 1.4, xAt(1070, zc, 1));
  const corpX = Math.max(towerX + 2.8, xAt(1300, zc, 1));
  put(towerUnderConstruction(2.2, 2.0, 1.5), towerX, zc - 0.1, 0, 0, 'far');
  const craneX = towerX - 1.35;
  const craneZ = zc + 0.35;
  put(towerCrane(1.05, 2.6), craneX, craneZ, 0, 0, 'far');
  put(redLight, craneX + 2.55, craneZ, 0, 0, 'far', 1.2);
  put(redLight, craneX, craneZ, 0, 0, 'far', 1.73);
  put(corporateTower(2.4, 2.4, 3.5, 0.8), corpX, zc - 0.1, 0, 0, 'far');
  const leftEdge = xAt(0, topZ) - 1.5;
  const rightEdge = xAt(VIEW.width, topZ) + 2;
  const reserved: [number, number][] = [
    [craneX - 0.3, towerX + 1.2],
    [corpX - 1.3, corpX + 1.3],
  ];
  for (let x = leftEdge, k = 0; x < rightEdge; k++) {
    const w = 1.5 + unit(k, 1, 41) * 1.2;
    const c = x + w / 2;
    if (reserved.some(([a, b]) => c + w / 2 > a && c - w / 2 < b)) {
      x += 0.5;
      continue;
    }
    const back = unit(k, 2, 41);
    // Taller behind the core, so they show over it; lower out by the corners.
    const behind = c > coreL && c < coreR;
    const h = (behind ? 1.3 : 0.7) + unit(k, 3, 41) * 1.1;
    const edge = c < coreL || c > coreR;
    put(cityBlock(w, 1.8, h, k, edge ? 0.75 : undefined), c, zc - 0.1 - back * 0.9, 0, 0, 'far');
    x += w + 0.12 + unit(k, 4, 41) * 0.3;
  }

  // ---- Left: the terrace ----
  const tx0 = roofL + 0.45;
  const tx1 = L - 0.22;
  const tmid = (tx0 + tx1) / 2;
  // Below where the player legend starts on screen only the decking shows.
  const zLeg = (screenToGround(pose, LEGEND.right, LEGEND.top, GROUND)?.y ?? F - 2) - 0.25;
  // Planters with grasses along the outer parapet, end to end in pairs.
  for (let z = B + 0.2, k = 0; z + 1 < zLeg; z += 1.0, k++) {
    if (k % 3 === 2) continue;
    put(planterBox, roofL + 0.24, z + 0.5, Math.PI / 2, k);
    put(grasses, roofL + 0.24, z + 0.5, Math.PI / 2, k, 'near', 0.32);
  }
  // The founders' scooters by the lift, against the core.
  put(scooterRack, coreL - 0.65, B + 0.35, 0, 1);
  // String lights across the terrace, on black posts.
  const span = tx1 - 0.25 - (tx0 + 0.25);
  const lightsZ = [B + 1.9, Math.min(B + 4.6, zLeg - 1.6)];
  for (const z of lightsZ) put(stringLights(span, 1.45), tx0 + 0.25, z, 0, 0, 'far');
  // The ping-pong table between the light lines; the founder pacing on the phone beside it.
  const pingZ = ((lightsZ[0] ?? 0) + (lightsZ[1] ?? 0)) / 2;
  put(pingPong, tmid + 0.15, pingZ, Math.PI / 2 + 0.05);
  person(Math.min(L - 1.6, tmid + 1.0), pingZ + 1.0, -0.6, 'phoning');
  // The hammock inside, the bean bags in a huddle by the outer planters, toward the front.
  const hz = Math.min(F - 1.2, zLeg - 0.85);
  put(hammock, tx1 - 0.45, hz - 0.2, Math.PI / 2 - 0.08);
  const bz = zLeg - 0.45;
  const bx = tx0 + 0.55;
  put(beanBag, bx, bz - 0.1, 0.4, 0);
  put(beanBag, bx + 0.7, bz, -0.3, 2);
  put(beanBag, bx + 0.25, bz - 0.75, 1.2, 4);
  // The balloons tied to the outer rail, the banner along it.
  put(raisedBanner(1.3), roofL + 0.02, B + 2.5, Math.PI / 2, 0, 'near', 0.2);
  put(balloons, roofL + 0.12, B + 1.55, 0.3);

  // ---- Right: the plant deck ----
  const dx0 = R + 0.75;
  // Condensers and the air handler clustered at the back, a duct run down the outer side.
  put(condenser, dx0 + 0.55, B + 0.15, 0, 1);
  put(condenser, dx0 + 1.55, B + 0.1, 0.05, 0);
  put(airHandler, dx0 + 0.85, B + 1.15, 0);
  put(ductRun(3.0), roofR - 0.3, B - 0.4, -Math.PI / 2);
  put(mushroomVent, dx0 + 0.2, B - 0.5, 0);
  put(mushroomVent, roofR - 0.75, B - 0.7, 0);
  // The antenna mast at the back corner: its red light and the startup's flag.
  const mastH = 2.6;
  const mx = roofR - 0.65;
  const mz = roofB + 0.75;
  put(antennaMast(mastH), mx, mz, 0, 0, 'far');
  put(redLight, mx, mz, 0, 0, 'far', mastH + 0.3);
  put(mastFlag, mx + 0.03, mz, -0.2, 0, 'far', mastH - 0.55);
  // Solar panels in rows down the middle, a roof hatch, vents.
  const solarZ0 = B + 2.4;
  let solarEnd = solarZ0;
  for (let z = solarZ0, k = 0; z < F - 2.6 && k < 3; z += 0.95, k++) {
    put(solarPanels, dx0 + 1.05, z, 0, k);
    solarEnd = z + 0.5;
  }
  put(roofHatch, dx0 + 0.35, solarEnd + 0.75, 0.05);
  put(mushroomVent, roofR - 0.35, solarEnd + 0.6, 0);
  // The big uplink dish past the panels, aimed up over the city.
  put(satDish, dx0 + 1.45, solarEnd + 1.35, -0.5, 0, 'near', 0, 1.3);
  // A cable tray from the mast down the outer side to the front of the deck.
  const trayZ1 = F - 0.5;
  put(cableTray(trayZ1 - (B + 2.7)), roofR - 0.18, B + 2.7, -Math.PI / 2);

  // ---- The ship hatch: the rack cabinet and the dish; a cable tray from the hatch to them ----
  if (ship.length > 0) {
    const sx = mid(ship, 'x');
    const sz = mid(ship, 'z');
    if (shipEdge === 'front' || shipEdge === 'back') {
      const rz = F - 0.9;
      put(rackCabinet, R + 1.0, rz, -0.25);
      put(statusLed, R + 1.0 + 0.08, rz + 0.3, -0.25, 0, 'near', 1.02);
      put(satDish, R + 2.0, rz - 0.5, -0.3, 0, 'near', 0, 1.1);
      if (shipEdge === 'front') {
        // Out from under the hatch along the front of the roof, then up the deck to the rack.
        // Clear of the opening's folded doors.
        const tz = F + strip / 2;
        const t0 = sx + SHIP_DOORS;
        if (t0 < R + 0.2) put(cableTray(R + 0.4 - t0), t0, tz);
        put(cableTray(tz - (rz + 0.35)), R + 0.4, tz, -Math.PI / 2 + Math.PI);
      }
      person(R + 1.7, rz - 1.7, 0.2, 'carrying');
      put(
        serverBlade,
        R + 1.7 + Math.sin(0.2) * CARRY.reach,
        rz - 1.7 + Math.cos(0.2) * CARRY.reach,
        0.2,
        0,
        'near',
        CARRY.lift,
      );
    } else {
      const side = shipEdge === 'left' ? -1 : 1;
      const edge = side > 0 ? R : L;
      const rx = edge + side * 1.0;
      put(rackCabinet, rx, sz + 0.35, side > 0 ? -Math.PI / 2 + 0.2 : Math.PI / 2 - 0.2);
      put(
        statusLed,
        rx - side * 0.3,
        sz + 0.27,
        side > 0 ? -Math.PI / 2 + 0.2 : Math.PI / 2 - 0.2,
        0,
        'near',
        1.02,
      );
      put(satDish, edge + side * 2.0, sz - 0.5, side * 0.3);
      put(cableTray(0.65), side > 0 ? edge : edge - 0.65, sz - 0.25);
      person(edge + side * 1.75, sz + 1.6, side > 0 ? Math.PI + 0.3 : Math.PI - 0.3, 'carrying');
      const yaw = side > 0 ? Math.PI + 0.3 : Math.PI - 0.3;
      put(
        serverBlade,
        edge + side * 1.75 + Math.sin(yaw) * CARRY.reach,
        sz + 1.6 + Math.cos(yaw) * CARRY.reach,
        yaw,
        0,
        'near',
        CARRY.lift,
      );
    }
  }

  // ---- Front: pigeons on the parapet, the street far below ----
  const copeZ = pz + 0.09;
  for (const [sx, yaw, v] of [
    [360, 0.4, 0],
    [430, -0.5, 1],
    [1010, 0.2, 1],
  ] as const) {
    const x = xAt(sx, copeZ, PARAPET.wall);
    if (x > L && x < R) put(pigeon, x, copeZ, yaw, v, 'near', PARAPET.wall + 0.03, 0.75);
  }
  const s0 = p1 + DROP;
  const roadZ = s0 + WALK + 0.06;
  // Lamps and trees along the pavement, cars on the road, out of the HUD's corners.
  for (let k = 0; k < 8; k++) {
    const sx = 150 + k * 145;
    if (sx > 570 && sx < 870) continue;
    const x = xAt(sx, s0 + 0.08);
    if (k % 2) put(tinyLamp, x, s0 + 0.04, 0, 0);
    else put(tinyTree, x + 0.2, s0 + 0.08, 0, k);
  }
  for (const [sx, dz, yaw, v] of [
    [250, 0.06, 0, 0],
    [470, 0.06, 0, 3],
    [940, 0.26, Math.PI, 1],
    [1180, 0.26, Math.PI, 4],
  ] as const)
    put(tinyCar, xAt(sx, roadZ + dz), roadZ + dz, yaw, v);
  patch('zebra', xAt(1080, roadZ) - 0.3, xAt(1080, roadZ) + 0.3, roadZ - 0.02, roadZ + 0.7);

  // ---- Void tiles inside the outline: a light well of glass roof lights, a tree in a planter ----
  if (voids.length > 0) {
    const tree = [...voids]
      .filter((t) => !hides(t.x, t.z, 1.5, 0.5) && isVoid(t.x - 1, t.z) && isVoid(t.x + 1, t.z))
      .sort((a, b) => b.z - a.z || a.x - b.x)[0];
    for (const t of voids) {
      if (tree && t.x === tree.x && t.z === tree.z) {
        patch('pavers', t.x - 0.5, t.x + 0.5, t.z - 0.5, t.z + 0.5);
        put(planterTree, t.x, t.z, 0.4);
        continue;
      }
      const kerbs =
        (isVoid(t.x, t.z - 1) ? 0 : 1) |
        (isVoid(t.x + 1, t.z) ? 0 : 2) |
        (isVoid(t.x, t.z + 1) || (tree && tree.x === t.x && tree.z === t.z + 1) ? 0 : 4) |
        (isVoid(t.x - 1, t.z) ? 0 : 8);
      put(skylightTile(kerbs), t.x, t.z, 0, t.x * 2 + t.z, 'far');
    }
  }

  return { horizon: HORIZON, ground, painters: PAINTERS, pieces, people, tufts: [] };
}

// ---- The scene's own ground ----

/** Roof membrane: rolled sheets along z with welded seams, a patch here and there. */
const membrane: GroundPainter = (b, g, salt) => {
  const top = 0.02;
  const w = g.x1 - g.x0;
  const d = g.z1 - g.z0;
  b.box(w, top, d, MEMBRANE, { at: [(g.x0 + g.x1) / 2, top / 2, (g.z0 + g.z1) / 2] }, 0);
  const sheet = 1.0;
  for (let i = 0, x = g.x0; x < g.x1; i++, x += sheet) {
    const sw = Math.min(sheet, g.x1 - x);
    b.box(
      sw - 0.03,
      0.004,
      d,
      tint(MEMBRANE, (shade(i, 0, salt) - 0.5) * 0.08),
      {
        at: [x + sw / 2, top + 0.001, (g.z0 + g.z1) / 2],
      },
      0,
    );
    b.box(0.03, 0.006, d, tint(MEMBRANE, 0.1), { at: [x, top + 0.002, (g.z0 + g.z1) / 2] }, 0);
    // A patched repair now and then.
    if (shade(i, 1, salt) > 0.6) {
      const z = g.z0 + shade(i, 2, salt) * d;
      b.box(0.4, 0.004, 0.3, tint(MEMBRANE, -0.08), { at: [x + sw / 2, top + 0.003, z] }, 0);
    }
  }
};

/** Timber decking: boards along x in staggered lengths, each its own shade, a dark edge. */
const deck: GroundPainter = (b, g, salt) => {
  const top = 0.05;
  const w = g.x1 - g.x0;
  const d = g.z1 - g.z0;
  b.box(
    w + 0.04,
    top - 0.01,
    d + 0.04,
    tint(DECK, -0.45),
    {
      at: [(g.x0 + g.x1) / 2, (top - 0.01) / 2, (g.z0 + g.z1) / 2],
    },
    0,
  );
  const bw = 0.14;
  for (let j = 0; j * bw < d - 0.02; j++) {
    const z = g.z0 + (j + 0.5) * bw;
    let x = g.x0 - shade(0, j, salt) * 1.2;
    for (let i = 0; x < g.x1; i++) {
      const len = 1.4 + shade(i, j, salt + 3) * 1.0;
      const xa = Math.max(g.x0, x + 0.01);
      const xb = Math.min(g.x1, x + len - 0.01);
      if (xb - xa > 0.05)
        b.box(
          xb - xa,
          0.012,
          bw - 0.018,
          tint(DECK, (shade(i, j, salt) - 0.5) * 0.16),
          {
            at: [(xa + xb) / 2, top - 0.006, z],
          },
          0,
        );
      x += len;
    }
  }
};

/** Concrete pavers on pads: a walkway. */
const pavers: GroundPainter = (b, g, salt) => {
  slabs(b, g, 0.04, PAVER, [0.5, 0.5], 0.03, 0.1, salt + 20);
};

/** Gravel ballast: a grey bed speckled light and dark. */
const gravel: GroundPainter = (b, g, salt) => {
  const top = 0.03;
  const w = g.x1 - g.x0;
  const d = g.z1 - g.z0;
  b.box(w, top, d, GRAVEL, { at: [(g.x0 + g.x1) / 2, top / 2, (g.z0 + g.z1) / 2] }, 0);
  const count = Math.round(w * d * 22);
  for (let k = 0; k < count; k++) {
    const x = g.x0 + shade(k, 0, salt) * w;
    const z = g.z0 + shade(k, 1, salt) * d;
    const s = 0.04 + shade(k, 2, salt) * 0.04;
    b.box(
      s,
      0.006,
      s,
      tint(GRAVEL, (shade(k, 3, salt) - 0.5) * 0.4),
      { at: [x, top + 0.002, z] },
      0,
    );
  }
};

/**
 * The building's face going down past the parapet, seen from above: dark,
 * with rows of lit windows, getting darker toward the street. `along` the
 * long way, `out` the way down (from 0 at the parapet).
 */
function drop(b: ModelBuilder, g: GroundPatch, salt: number, dir: 'x' | 'z', flip: boolean): void {
  const top = 0.02;
  const w = g.x1 - g.x0;
  const d = g.z1 - g.z0;
  const cx = (g.x0 + g.x1) / 2;
  const cz = (g.z0 + g.z1) / 2;
  b.box(w, top, d, 0x22252c, { at: [cx, top / 2, cz] }, 0);
  const len = dir === 'x' ? w : d;
  const depth = dir === 'x' ? d : w;
  for (let r = 0; r < 3; r++) {
    const o = ((r + 0.5) / 3) * depth;
    for (let k = 0; k * 0.22 < len; k++) {
      const lit = shade(k, r, salt) > 0.55;
      const c = lit ? tint(0x8a7450, -r * 0.15) : tint(0x343a46, -r * 0.1);
      const u = (dir === 'x' ? g.x0 : g.z0) + (k + 0.5) * 0.22;
      const v = dir === 'x' ? (flip ? g.z1 - o : g.z0 + o) : flip ? g.x1 - o : g.x0 + o;
      if (dir === 'x') b.box(0.12, 0.004, depth / 5, c, { at: [u, top + 0.001, v] }, 0);
      else b.box(depth / 5, 0.004, 0.12, c, { at: [v, top + 0.001, u] }, 0);
    }
  }
}

/**
 * The street far below: a pavement along the building's side (the `near`
 * edge), a kerb, the road with dashed lane lines.
 */
function street(near: 'z0' | 'z1' | 'x0' | 'x1', canyon = false): GroundPainter {
  return (b, g) => {
    const top = 0.012;
    const w = g.x1 - g.x0;
    const d = g.z1 - g.z0;
    const along = near === 'z0' || near === 'z1' ? 'x' : 'z';
    const cx = (g.x0 + g.x1) / 2;
    const cz = (g.z0 + g.z1) / 2;
    b.box(w, top, d, canyon ? tint(ROAD, -0.3) : ROAD, { at: [cx, top / 2, cz] }, 0);
    /** A strip from `a` to `c` out from the near edge, the length of the patch. */
    const strip = (a: number, c: number, y: number, color: number) => {
      const s = near === 'z0' || near === 'x0' ? 1 : -1;
      const e = near === 'z0' ? g.z0 : near === 'z1' ? g.z1 : near === 'x0' ? g.x0 : g.x1;
      const m = e + (s * (a + c)) / 2;
      if (along === 'x') b.box(w, y, c - a, color, { at: [cx, top + y / 2, m] }, 0);
      else b.box(c - a, y, d, color, { at: [m, top + y / 2, cz] }, 0);
    };
    strip(0, WALK, 0.004, PAVEMENT);
    strip(WALK, WALK + 0.025, 0.006, 0x8a8c90);
    // Paving joints across the pavement, and the dashed lane line out on the road.
    const len = along === 'x' ? w : d;
    const s = near === 'z0' || near === 'x0' ? 1 : -1;
    const e = near === 'z0' ? g.z0 : near === 'z1' ? g.z1 : near === 'x0' ? g.x0 : g.x1;
    for (let k = 0; k * 0.3 < len; k++) {
      const u = (along === 'x' ? g.x0 : g.z0) + k * 0.3;
      const m = e + (s * WALK) / 2;
      if (along === 'x')
        b.box(0.01, 0.002, WALK - 0.02, tint(PAVEMENT, -0.2), { at: [u, top + 0.005, m] }, 0);
      else b.box(WALK - 0.02, 0.002, 0.01, tint(PAVEMENT, -0.2), { at: [m, top + 0.005, u] }, 0);
      if (k % 2 === 0) {
        const lane = e + s * (WALK + 0.62);
        if (along === 'x') b.box(0.16, 0.002, 0.02, 0xb8b090, { at: [u, top + 0.002, lane] }, 0);
        else b.box(0.02, 0.002, 0.16, 0xb8b090, { at: [lane, top + 0.002, u] }, 0);
      }
    }
  };
}

/** A zebra crossing across the road: white bars along x. */
const zebra: GroundPainter = (b, g) => {
  const w = g.x1 - g.x0;
  for (let z = g.z0 + 0.04; z < g.z1; z += 0.09)
    b.box(w, 0.003, 0.05, ZEBRA, { at: [(g.x0 + g.x1) / 2, 0.016, z] }, 0);
};

const PAINTERS: Readonly<Record<string, GroundPainter>> = {
  membrane,
  deck,
  pavers,
  gravel,
  drop: (b, g, s) => {
    drop(b, g, s, 'x', false);
  },
  dropB: (b, g, s) => {
    drop(b, g, s, 'x', true);
  },
  dropL: (b, g, s) => {
    drop(b, g, s, 'z', true);
  },
  dropR: (b, g, s) => {
    drop(b, g, s, 'z', false);
  },
  streetFront: street('z0'),
  streetBack: street('z1', true),
  streetLeft: street('x1', true),
  streetRight: street('x0', true),
  zebra,
};
