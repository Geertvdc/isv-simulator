import type { LevelMap } from '../../../sim/level';
import { getTile } from '../../../sim/level';
import { gridToWorld, projectPoint } from '../../projection';
import { firstGroup, tileHash } from '../../mapShape';
import { tint } from '../kit';
import { managerOffice } from '../rooms/managerOffice';
import { segfaultCat } from '../setDressing/onCall';
import { redLight, towerCrane, towerUnderConstruction } from '../setDressing/rooftop';
import {
  bigPlant,
  bus,
  busStop,
  cherryTree,
  coatStand,
  coffeeTable,
  COLORS,
  cradle,
  CRADLE,
  cradleRopes,
  credenza,
  curtainWall,
  dayCar,
  execChair,
  EXEC_SEAT,
  execDesk,
  floorLetters,
  glassOffice,
  liftBank,
  LIFTS,
  lowSofa,
  monolithTower,
  planterTrough,
  podChair,
  printer,
  prodPot,
  puttingMat,
  receptionDesk,
  RECEPTION_BACK,
  recyclingBins,
  releaseBoard,
  SOFA_SEAT,
  waitingVisitor,
} from '../setDressing/midRise';
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
 * Middle Management's world (level 3-1, scene `middle-management`; see
 * `docs/plan/middle-management-environment.md`): the rest of the floor YOTTA
 * has rented in a mid-rise office building, on a bright spring morning.
 * Behind the level, the floor's reception (its desk in light oak with a
 * monitor, a bell and the sign-in tablet, the receptionist on the phone, a
 * visitor waiting on a low sofa, Prod in a glazed pot), spread right of the
 * inbox (reception's pass-through) and out from under the order cards; past
 * it the building's curtain wall closes the top of the frame, and through
 * and over it, across the street, the crane tower half-clad in glass with
 * the crane's red light blinking, MONOLITH's tower further off. Down the
 * sides, the floor's carpet with a breakout corner, a printer with a jam and
 * coat stands, then the curtain wall and the drop to the street far below:
 * cherry trees in blossom, pavements, a bus stop, tiny cars and a bus, a
 * window cleaner's cradle hanging outside the glass. In front, thin and low:
 * the lift lobby's pale stone, the release board at the ship hatch, the
 * "LIFTS" arrows to the lift bank on the side, a planter trough and the
 * recycling bins. When the map doesn't wall Derek's office in
 * (`managerOffice`), his glass corner office stands at the back-right corner,
 * poking out past the building: his desk, his executive chair with Segfault
 * asleep on it, the MONOLITH certificate and lanyard, a putting mat, a
 * "STATUS UPDATE?" sticky note on the glass. When the map has it, the
 * office is the Room's, and the voids round it are the air over the street.
 *
 * Everything is placed from the level's outline, its void tiles, its ship
 * and inbox tiles and the office, and from where the frame's edges fall for
 * this map (the camera fit at 1440×810), so it fits any map of this level.
 * Pure data.
 */

/** The city far below, out to the horizon: pale pavement and spring grass, greyed. */
const HORIZON = 0x70736c;
/** The floor's carpet (the room's two-tone tiles), the lift lobby's stone, Derek's plush carpet. */
const CARPET = 0x8a929c;
const STONE = COLORS.STONE;
const PLUSH = 0x5c6474;
/** How deep reception runs behind the back wall before the curtain wall (the room's wall hides the first two tiles). */
const RECEPTION = 3.0;
/** The floor beside the room before the curtain wall: as wide as the frame allows, within these. */
const SIDE = { min: 1.45, max: 2.1 } as const;
/** How far the lobby's stone runs in front (out of the frame). */
const LOBBY = 2.6;
/** The street far below, out from the curtain wall: the building's face, pavement, road, the far pavement. */
const STREET = { face: 0.3, walk: 0.26, road: 0.62, far: 0.22 } as const;
/** Derek's office (when the World builds it): how far it pokes past the curtain wall at the back and the side. */
const POKE = { back: 1.4, side: 1.2 } as const;
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
/** The order cards' right edge on screen: reception's people and story pieces start right of it. */
const CARDS_RIGHT = 700;
/** The living props. */
const ALIVE: ReadonlyMap<SetPiece, AliveKind> = new Map<SetPiece, AliveKind>([
  [segfaultCat, 'purr'],
  [waitingVisitor, 'breathe'],
  [redLight, 'blink'],
  [cherryTree, 'sway'],
]);
/** The small light sources that keep their glow and bloom (see `ScenePiece.hot`). */
const HOT_PIECES: readonly SetPiece[] = [redLight, releaseBoard];

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

function mid(g: readonly Tile[], k: 'x' | 'z'): number {
  return g.length > 0 ? g.reduce((s, t) => s + t[k], 0) / g.length : 0;
}

/**
 * The building's outline round the level: the back curtain wall's line, the
 * left and right ones, and Derek's office when the World builds it (its
 * left, right, front and back, in world x and z). Shared with the Light
 * track (the mullions' shadow stripes fall in from these lines). Pure.
 */
export interface MidRiseOutline {
  back: number;
  left: number;
  right: number;
  /** Where the map's own office sticks out on the left or right (z from and to), if it does. */
  poke: { side: 'left' | 'right'; z0: number; z1: number } | null;
  office: { x0: number; x1: number; z0: number; z1: number } | null;
}

export function midRiseOutline(map: LevelMap): MidRiseOutline {
  const { width, height } = map;
  const L = -0.5;
  const R = width - 0.5;
  const B = -0.5;
  const F = height - 0.5;
  const pose = scenePose(map);
  const xAt = (sx: number, z: number): number => {
    const a = projectPoint(pose, { x: 0, y: GROUND, z });
    const b = projectPoint(pose, { x: 1, y: GROUND, z });
    return (sx - a.x) / (b.x - a.x);
  };
  const midZ = (B + F) / 2;
  const seen = Math.min(L - xAt(0, midZ), xAt(VIEW.width, midZ) - R);
  const side = Math.max(SIDE.min, Math.min(SIDE.max, seen - 2.4));
  const off = managerOffice(map);
  const isVoid = (x: number, z: number) => {
    const t = getTile(map, x, z);
    return t === null || t === 'void';
  };
  /** The building's line on one side when the office sticks out there: just outside the room on the other rows. */
  const lineBeside = (o: NonNullable<typeof off>, left: boolean): number => {
    let best = left ? Infinity : -Infinity;
    for (let z = 0; z < height; z++) {
      if (z >= o.y0 - 1 && z <= o.y1 + 1) continue;
      for (let i = 0; i < width; i++) {
        const x = left ? i : width - 1 - i;
        if (!isVoid(x, z)) {
          best = left ? Math.min(best, x) : Math.max(best, x);
          break;
        }
      }
    }
    return left ? best - 0.5 : best + 0.5;
  };
  const pokeL = off !== null && off.x0 <= 1;
  const pokeR = off !== null && off.x1 >= width - 2;
  const left = off && off.x0 <= 1 ? lineBeside(off, true) : L - side;
  const right = off && off.x1 >= width - 2 ? lineBeside(off, false) : R + side;
  const back = B - RECEPTION;
  const poke =
    off && (pokeL || pokeR)
      ? { side: pokeL ? ('left' as const) : ('right' as const), z0: off.y0 - 1.5, z1: off.y1 + 1.5 }
      : null;
  // No office in the map: the World builds Derek's at the back-right corner, poking out past both lines.
  const office =
    off === null
      ? { x0: R - 2.4, x1: right + POKE.side, z0: back - POKE.back, z1: B - 0.15 }
      : null;
  return { back, left, right, poke, office };
}

/** The scene round `map`: pure and deterministic. */
export function middleManagementScene(map: LevelMap): Scene {
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
  const tileAt = (x: number, z: number) => getTile(map, x, z);
  const isVoid = (x: number, z: number) => tileAt(x, z) === 'void';
  const isSlab = (x: number, z: number) => {
    const t = tileAt(Math.round(x), Math.round(z));
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
  /** Whether (x, z), `lift` up, is on screen with `margin` to spare. */
  const onScreen = (x: number, z: number, lift = 0, margin = 0) => {
    const p = projectPoint(pose, { x, y: GROUND + lift, z });
    return p.x > margin && p.x < VIEW.width - margin && p.y > margin && p.y < VIEW.height - margin;
  };
  // Every ship tile (the shipped map's hatch is two groups side by side).
  const ship: Tile[] = map.tiles.flatMap((t, i) =>
    t === 'ship' ? [{ x: i % width, z: Math.floor(i / width) }] : [],
  );
  const inbox = firstGroup(map, 'inbox').map((p) => ({ x: p.x, z: p.y }));
  const shipEdge = edgeOf(map, ship);
  const inboxEdge = edgeOf(map, inbox);
  const outline = midRiseOutline(map);
  const { back: backZ, left: leftLine, right: rightLine, poke, office } = outline;
  const officeInMap = managerOffice(map);

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
    // The trees sway only a tile or more from the room (nothing living by the play).
    const alive = piece === cherryTree && !clearOfRoom(x, z) ? undefined : ALIVE.get(piece);
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
  ): boolean => {
    if (!clear(x, z, r, high + lift, r, lift) || !offSlab(x, z, r)) return false;
    put(piece, x, z, yaw, variant, 'near', lift);
    return true;
  };
  const patch = (kind: string, x0: number, x1: number, z0: number, z1: number) => {
    if (x1 - x0 > 0.01 && z1 - z0 > 0.01) ground.push({ kind, x0, x1, z0, z1 });
  };
  const person = (x: number, z: number, yaw: number, pose: ScenePose) =>
    people.push({ at: gridToWorld(x, z, GROUND), yaw, pose });

  // Where the frame's edges fall, a little past them.
  const topZ = backZ - 6;
  const frontZ = F + LOBBY;
  const edgeL = Math.min(xAt(0, topZ), xAt(0, frontZ)) - 1;
  const edgeR = Math.max(xAt(VIEW.width, topZ), xAt(VIEW.width, frontZ)) + 1;
  const far = 8;

  // ---- Ground: the city far below, then the building's face, then its floor ----
  const W = STREET;
  const near = W.face + W.walk;
  // The streets: one along each side and one behind, each pavement, road, far pavement; parks past them.
  const lRoad = leftLine - near;
  const rRoad = rightLine + near;
  const bRoad = backZ - near;
  patch('park', edgeL - far, lRoad - W.road - W.far, topZ - far, frontZ + far);
  patch('park', rRoad + W.road + W.far, edgeR + far, topZ - far, frontZ + far);
  patch('park', edgeL - far, edgeR + far, topZ - far, bRoad - W.road - W.far);
  patch('roadZ', lRoad - W.road, lRoad, topZ - far, frontZ + far);
  patch('roadZ', rRoad, rRoad + W.road, topZ - far, frontZ + far);
  patch('roadX', edgeL - far, edgeR + far, bRoad - W.road, bRoad);
  patch('walk', lRoad - W.road - W.far, lRoad - W.road, bRoad - W.road, frontZ + far);
  patch('walk', rRoad + W.road, rRoad + W.road + W.far, bRoad - W.road, frontZ + far);
  patch(
    'walk',
    lRoad - W.road - W.far,
    rRoad + W.road + W.far,
    bRoad - W.road - W.far,
    bRoad - W.road,
  );
  patch('walk', lRoad, leftLine - W.face, bRoad, frontZ + far);
  patch('walk', rightLine + W.face, rRoad, bRoad, frontZ + far);
  patch('walk', lRoad, rRoad, bRoad, backZ - W.face);
  // The building's face going down, round its outline (and round the office poking out).
  patch('faceZ', leftLine - W.face, leftLine, backZ - W.face, frontZ + far);
  patch('faceZ', rightLine, rightLine + W.face, backZ - W.face, frontZ + far);
  patch('faceX', leftLine - W.face, rightLine + W.face, backZ - W.face, backZ);
  if (poke) {
    const x = poke.side === 'left' ? L : R;
    const s = poke.side === 'left' ? -1 : 1;
    const xs = [x, x + s * W.face].sort((a, b) => a - b) as [number, number];
    const line = poke.side === 'left' ? leftLine : rightLine;
    const span = [Math.min(x + s * W.face, line), Math.max(x + s * W.face, line)] as const;
    patch('faceZ', xs[0], xs[1], poke.z0 - W.face, poke.z1 + W.face);
    patch('faceX', span[0], span[1], poke.z0 - W.face, poke.z0);
    patch('faceX', span[0], span[1], poke.z1, poke.z1 + W.face);
  }
  if (office) {
    patch('faceX', office.x0 - W.face, office.x1 + W.face, office.z0 - W.face, office.z0);
    patch('faceZ', office.x1, office.x1 + W.face, office.z0 - W.face, office.z1 + W.face);
    patch('faceZ', office.x0 - W.face, office.x0, office.z0 - W.face, backZ);
    patch('faceX', rightLine, office.x1 + W.face, office.z1, office.z1 + W.face);
  }
  // The floor: reception's stone behind, the carpet down the sides, the lobby's stone in front.
  patch('stone', leftLine, rightLine, backZ, B);
  patch('carpet', leftLine, L, B, F);
  patch('carpet', R, rightLine, B, F);
  patch('stone', leftLine, rightLine, F, frontZ + far);
  if (office) patch('plush', office.x0, office.x1, office.z0, office.z1);
  // Void tiles inside the building's lines are floor (the lobby's stone); outside them, the street shows.
  for (let z = 0; z < height; z++)
    for (let x = 0; x < width; x++)
      if (isVoid(x, z) && x - 0.5 >= leftLine - 0.01 && x + 0.5 <= rightLine + 0.01)
        patch('stone', x - 0.5, x + 0.5, z - 0.5, z + 0.5);

  // ---- The curtain wall round the floor ----
  const backEnd = office ? office.x0 : rightLine;
  put(curtainWall(backEnd - leftLine), leftLine, backZ - 0.1, 0, 0, 'far');
  /** The left or right curtain wall from z0 to z1 (z0 behind z1). */
  const sideWall = (side: 'left' | 'right', z0: number, z1: number) => {
    if (z1 - z0 < 0.3) return;
    if (side === 'left') put(curtainWall(z1 - z0), leftLine - 0.1, z1, Math.PI / 2, 0, 'far');
    else put(curtainWall(z1 - z0), rightLine + 0.1, z0, -Math.PI / 2, 0, 'far');
  };
  // A line within the level's own width stops at its front: nothing tall in front of the level.
  const endL = leftLine > L ? F - 0.06 : frontZ + 0.5;
  const endR = rightLine < R ? F - 0.06 : frontZ + 0.5;
  if (poke?.side === 'left') {
    sideWall('left', backZ, poke.z0 - 0.06);
    sideWall('left', poke.z1 + 0.06, endL);
  } else sideWall('left', backZ, endL);
  if (poke?.side === 'right') {
    sideWall('right', backZ, poke.z0 - 0.06);
    sideWall('right', poke.z1 + 0.06, endR);
  } else sideWall('right', office ? office.z1 : backZ, endR);

  // ---- Back: reception, right of the inbox ----
  const recZ = B - 1.45;
  const backRight = office ? office.x0 - 0.3 : rightLine - 0.5;
  let shelf =
    (inbox.length > 0 && inboxEdge === 'back' ? Math.max(...inbox.map((t) => t.x)) : L + 2) + 0.5;
  {
    // The receptionist stands right of the order cards, at the desk's right end; the desk runs left
    // from there toward the inbox, as long as it keeps clear of the cards.
    const standZ = recZ - RECEPTION_BACK - 0.25;
    let sx = Math.max(xAt(CARDS_RIGHT, standZ, 1.4) + 0.3, shelf + 1.6);
    let len = 2.6;
    const fits = () => clear(sx + 0.6 - len / 2, recZ - 0.55, len / 2, 1.35, 0.55);
    while (!fits()) {
      if (len > 1.6) len -= 0.2;
      else sx += 0.2;
    }
    const d1 = sx + 0.6;
    put(receptionDesk(len), d1 - len / 2, recZ, 0);
    person(sx, standZ, 0.25, 'phoning');
    shelf = d1;
  }
  // Prod in its glazed pot, then the low sofa with the visitor waiting, a coffee table before it.
  const sofaZ = backZ + 0.45;
  if (putClear(prodPot, shelf + 0.55, sofaZ + 0.05, 0.4, 1.7)) shelf += 1.0;
  {
    const sx = shelf + 0.85;
    if (sx + 0.7 < backRight && putClear(lowSofa, sx, sofaZ, 0.7, 0.75, 0, 0)) {
      put(waitingVisitor, sx - 0.33, sofaZ + 0.04, -0.15, 0, 'near', SOFA_SEAT);
      putClear(coffeeTable, sx + 0.1, sofaZ + 0.95, 0.35, 0.42, 0, 0);
      shelf = sx + 0.7;
    }
  }
  // More of reception where the floor runs on (the wide draft): a second sofa, a pod chair, a tall plant.
  if (backRight - shelf > 3) {
    const x = shelf + 1.4;
    putClear(lowSofa, x, sofaZ, 0.7, 0.75, 0, 1);
    putClear(podChair, x + 1.5, sofaZ + 0.3, 0.4, 1.0, -0.5, 2);
    putClear(bigPlant, Math.min(backRight - 0.3, x + 2.6), backZ + 0.35, 0.3, 1.5, 0, 3);
  }
  if (!office) putClear(bigPlant, rightLine - 0.35, backZ + 0.35, 0.3, 1.5, 0, 0);

  // ---- Derek's corner office (when the map doesn't have it) ----
  if (office) {
    const ow = office.x1 - office.x0;
    const od = office.z1 - office.z0;
    const door = (R + rightLine) / 2 - office.x0;
    put(glassOffice(ow, od, door), office.x0, office.z1, 0, 0, 'far');
    const ox = office.x0;
    const oz = office.z0;
    // His desk against the back glass, the chair pulled out in front of it and turned toward the
    // floor, Segfault asleep on the seat.
    put(execDesk, ox + 2.0, oz + 0.85, 0);
    const cx = ox + 1.25;
    const cz = oz + 2.05;
    const cyaw = 0.25;
    put(execChair, cx, cz, cyaw);
    put(segfaultCat, cx - 0.06, cz + 0.06, cyaw - 0.15, 0, 'near', EXEC_SEAT, 1.3);
    // The credenza with his certificate along the back, the plant in the corner, his coat stand with
    // the lanyard by the door, the putting mat down the middle.
    put(credenza, ox + ow - 1.55, oz + 0.4, 0);
    put(bigPlant, ox + ow - 0.4, oz + 0.4, 0, 3);
    put(coatStand, ox + ow - 0.45, office.z1 - 0.7, -0.6, 1);
    put(puttingMat, ox + ow * 0.62, oz + od * 0.62, -0.25);
  }

  // ---- The crane tower across the street behind, MONOLITH's tower further off ----
  {
    const tz = bRoad - W.road - 0.08;
    const tw = 1.7;
    // Right of the order cards, left of the office (or the frame's right).
    const xMin = xAt(CARDS_RIGHT + 30, tz, 1.2) + tw / 2;
    const xMax = (office ? Math.min(office.x0, xAt(1180, tz)) : xAt(1180, tz, 1.2)) - tw / 2;
    const tx = Math.min(xMax, Math.max(xMin, (xMin + xMax) / 2));
    // As tall as lets the crane's jib and its red light stay in the frame.
    const mast = 0.32;
    let th = 1.6;
    while (th > 0.3 && !onScreen(tx, tz - 0.35, th + mast + 0.62, 6)) th -= 0.05;
    th = Math.round(th * 20) / 20;
    put(towerUnderConstruction(tw, 1.2, th), tx, tz, 0, 0, 'far');
    // The crane on its roof, the jib out over the street away from the office.
    const jib = 1.5;
    const yaw = office ? Math.PI : 0;
    put(towerCrane(mast, jib), tx, tz - 0.35, yaw, 0, 'far', th);
    const dir = office ? -1 : 1;
    put(redLight, tx + dir * (jib - 0.05), tz - 0.35, 0, 0, 'far', th + mast + 0.32);
    put(redLight, tx, tz - 0.35, 0, 0, 'far', th + mast + 0.55);
    // MONOLITH, further off, toward the right.
    const mz = tz - 1.6;
    const mx = Math.min(office ? office.x0 + 1.2 : xAt(1250, mz), xAt(1300, mz));
    put(monolithTower(1.4, 3.2), mx, mz, 0, 0, 'far');
  }

  // ---- Down the sides: the floor's breakout corner, the printer, coat stands ----
  const sideL = leftLine < L - 0.8;
  const sideR = rightLine > R + 0.8;
  // The lift bank: on the side nearest the ship (right on a tie), if that side has floor.
  const shipX = mid(ship, 'x');
  const nearRight = shipEdge !== 'front' || shipX >= (width - 1) / 2;
  const liftSide: 'left' | 'right' | null = nearRight
    ? sideR
      ? 'right'
      : sideL
        ? 'left'
        : null
    : sideL
      ? 'left'
      : sideR
        ? 'right'
        : null;
  let liftZ = Infinity;
  let liftX = 0;
  if (liftSide) {
    // Against the curtain wall, its doors facing the room (the camera sees that face), its front end
    // just behind the lobby's stone, a walkway between it and the room.
    const right = liftSide === 'right';
    const count = 1 + (F - B > 8 ? 1 : 0);
    const lw = count * 0.95 + 0.3;
    const line = right ? rightLine : leftLine;
    liftX = line + (right ? -1 : 1) * (LIFTS.depth + 0.06);
    const z = F - 0.1 - lw / 2;
    liftZ = z - lw / 2;
    put(liftBank(count), liftX, z, right ? -Math.PI / 2 : Math.PI / 2);
  }
  /** Props against one side's curtain wall, back to front, facing the room; skipped where the HUD is. */
  const dress = (side: 'left' | 'right', z0: number, z1: number) => {
    const s = side === 'left' ? 1 : -1;
    const wall = side === 'left' ? leftLine : rightLine;
    const face = side === 'left' ? Math.PI / 2 : -Math.PI / 2;
    const inner = side === 'left' ? L : R;
    const span = Math.abs(inner - wall);
    let z = z0;
    const plan: [SetPiece, number, number, number, number][] =
      side === 'left'
        ? [
            [coatStand, 0.3, 1.8, 0.45, 0],
            [lowSofa, 0.7, 0.75, 0.9, 2],
            [podChair, 0.42, 1.0, 0.45, 3],
            [bigPlant, 0.3, 1.5, 0.6, 4],
            [printer, 0.36, 0.95, 0.75, 0],
          ]
        : [
            [printer, 0.36, 0.95, 0.75, 0],
            [coatStand, 0.3, 1.8, 0.45, 0],
            [bigPlant, 0.3, 1.5, 0.6, 1],
            [podChair, 0.42, 1.0, 0.45, 0],
            [lowSofa, 0.7, 0.75, 0.9, 3],
          ];
    for (const [piece, r, high, gap, v] of plan) {
      const zc = z + r + 0.1;
      if (zc + r > z1) break;
      const x = wall + s * (piece === podChair ? Math.min(span - 0.55, 1.2) : r * 0.8 + 0.12);
      const yaw = piece === podChair ? face - s * 0.6 : face;
      if (putClear(piece, x, zc, r, high, yaw, v)) {
        // A low coffee table in front of the breakout sofa.
        if (piece === lowSofa && span > 1.5) putClear(coffeeTable, x + s * 0.95, zc, 0.35, 0.42);
        z = zc + r + gap;
      } else z += 0.4;
    }
  };
  if (sideL) dress('left', B + 0.15, (liftSide === 'left' ? liftZ : F) - 0.2);
  if (sideR)
    dress('right', (office ? office.z1 : B) + 0.2, (liftSide === 'right' ? liftZ : F) - 0.2);

  // ---- The window cleaner's cradle, outside the glass on the right ----
  {
    const z0 = (office ? office.z1 : backZ) + 1.0;
    const z1 = Math.min(liftZ, F) - 0.8;
    const x = rightLine + 0.06 + CRADLE.wide / 2;
    let z = (z0 + z1) / 2;
    while (z > z0 && !onScreen(x + 0.8, z, 1.2, 10)) z -= 0.25;
    if (z1 > z0 && onScreen(x + 0.4, z, 0, 10)) {
      put(cradle, x, z, -Math.PI / 2);
      put(cradleRopes(6), x, z, -Math.PI / 2, 0, 'far');
      person(x + 0.02, z + 0.25, -Math.PI / 2 - 0.2, 'idle');
    }
  }

  // ---- The street far below: cherry trees, a bus stop, cars and a bus ----
  /** A clump of blossoming cherry trees round (x, z), along `along`. */
  const trees = (x: number, z: number, count: number, salt: number, along: 'x' | 'z') => {
    for (let k = 0; k < count; k++) {
      const u = (k - (count - 1) / 2) * 0.36 + (unit(k, salt, 13) - 0.5) * 0.1;
      const w = (unit(k, salt, 17) - 0.5) * 0.12;
      const tx = along === 'x' ? x + u : x + w;
      const tz = along === 'x' ? z + w : z + u;
      if (!offSlab(tx, tz, 0.25) || !onScreen(tx, tz, 0, -40)) continue;
      if (
        office &&
        tx > office.x0 - 0.3 &&
        tx < office.x1 + 0.3 &&
        tz > office.z0 - 0.3 &&
        tz < office.z1
      )
        continue;
      put(cherryTree, tx, tz, unit(k, salt, 19) * 6, k + salt, 'far');
    }
  };
  // Along the near pavements, in clumps with gaps; in the parks past the roads, bigger clumps.
  const walkMid = W.face + W.walk / 2;
  for (const [side, s] of [
    ['left', -1],
    ['right', 1],
  ] as const) {
    const line = side === 'left' ? leftLine : rightLine;
    for (let z = backZ + 0.4, k = 0; z < frontZ; z += 2.2, k++) {
      trees(line + s * walkMid, z, 2 + (k % 2), k * 3 + (s > 0 ? 50 : 0), 'z');
      const parkX = line + s * (near + W.road + W.far + 0.55 + unit(k, s, 23) * 0.5);
      trees(parkX, z + 1.0, 3, k * 5 + (s > 0 ? 70 : 20), 'z');
      trees(parkX + s * 1.4, z + 0.2, 2, k * 7 + (s > 0 ? 110 : 130), 'z');
    }
  }
  for (let x = leftLine + 0.6, k = 0; x < rightLine; x += 2.4, k++)
    trees(x, backZ - walkMid, 2 + (k % 2), k * 7 + 90, 'x');
  // Cars on the roads, a bus at a stop on the side with the most street in the frame.
  const laneL = lRoad - W.road * 0.3;
  const laneR = rRoad + W.road * 0.3;
  const lanes: [number, number][] = [
    [laneL, 0],
    [lRoad - W.road * 0.7, Math.PI],
    [laneR, Math.PI],
    [rRoad + W.road * 0.7, 0],
  ];
  lanes.forEach(([x, dir], k) => {
    for (let j = 0; j < 3; j++) {
      const z = backZ + 1.5 + j * 3.3 + unit(k, j, 29) * 1.6;
      if (unit(k, j, 31) < 0.35 || !onScreen(x, z, 0, 20) || !offSlab(x, z, 0.3)) continue;
      put(dayCar, x, z, dir + Math.PI / 2, k * 3 + j, 'far');
    }
  });
  for (let k = 0; k < 4; k++) {
    const x = leftLine + 1.5 + k * 3.1 + unit(k, 1, 37) * 1.2;
    if (x > rightLine) break;
    put(dayCar, x, bRoad - W.road * (k % 2 ? 0.7 : 0.3), k % 2 ? Math.PI : 0, k + 2, 'far');
  }
  {
    const seenL = L - xAt(0, (B + F) / 2);
    const seenR = xAt(VIEW.width, (B + F) / 2) - R;
    const left = seenL - (L - leftLine) >= seenR - (rightLine - R);
    const s = left ? -1 : 1;
    const road = left ? lRoad : rRoad;
    const bx = road + s * W.road * 0.7;
    const sx = road + s * (W.road + W.far * 0.5);
    // Mid-side, or the nearest stretch the building doesn't overhang (the office poking out).
    let bz = (B + F) / 2 - 0.5;
    for (let k = 0; k < 40; k++) {
      const z = (B + F) / 2 - 0.5 + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.25;
      if (offSlab(bx, z, 0.65) && offSlab(sx, z, 0.3)) {
        bz = z;
        break;
      }
    }
    put(bus, bx, bz, Math.PI / 2 + (left ? Math.PI : 0), 0, 'far');
    put(busStop, sx, bz + 0.1, left ? Math.PI / 2 : -Math.PI / 2, 0, 'far');
  }

  // ---- Front: the lift lobby, thin and low ----
  const boardZ = F + 0.3;
  let boardX = shipX;
  if (shipEdge === 'front' && ship.length > 0) {
    put(releaseBoard, shipX, boardZ, 0);
    boardX = shipX;
  }
  if (liftSide) {
    // The arrows from the board to the lifts, LIFTS painted at the lift end.
    const az = F + 0.62;
    const a0 = liftSide === 'right' ? boardX + 1.0 : Math.max(liftX + 0.6, xAt(240, az));
    const a1 = liftSide === 'right' ? Math.min(liftX - 0.6, xAt(1290, az)) : boardX - 1.0;
    patch(liftSide === 'right' ? 'arrowsR' : 'arrowsL', a0, a1, az - 0.14, az + 0.14);
  }
  // A planter trough and the recycling bins on the other side of the board, clear of the legend.
  {
    const s = liftSide === 'left' ? 1 : -1;
    const base = boardX + s * 1.3;
    let placed = 0;
    for (let k = 0; k < 8 && placed < 2; k++) {
      const x = base + s * (0.9 + k * 0.5);
      if (s < 0 ? x < leftLine + 0.9 : x > rightLine - 0.9) break;
      const piece = placed === 0 ? recyclingBins : planterTrough;
      const r = piece === recyclingBins ? 0.52 : 0.82;
      if (putClear(piece, x + s * r, F + 0.32, r, 0.56, 0, 0)) {
        placed++;
        k += Math.ceil((r * 2 + 0.4) / 0.5);
      }
    }
  }
  // Out on the lobby past the room's front corners: another trough, where the frame shows it.
  for (const s of [-1, 1]) {
    const x = s < 0 ? L - 1.0 : R + 1.0;
    if ((s < 0 && !sideL) || (s > 0 && !sideR) || (liftSide && s > 0 === (liftSide === 'right')))
      continue;
    putClear(planterTrough, x, F + 0.5, 0.82, 0.56, Math.PI / 2);
  }

  // ---- Void tiles: inside the building, low things only; outside it, the air over the street ----
  if (officeInMap) {
    // Nothing tall in the front corner voids: the bins sit there if one's on screen.
    for (let x = 0; x < width; x++) {
      const z = height - 1;
      if (isVoid(x, z) && x - 0.5 >= leftLine && x + 0.5 <= rightLine)
        putClear(recyclingBins, x, z, 0.52, 0.56, 0, 0);
    }
  }

  return { horizon: HORIZON, ground, painters: PAINTERS, pieces, people, tufts: [] };
}

// ---- The scene's own ground ----

/** A flat colored box on the ground: `top` high, inset `inset` from the patch. */
function fill(b: Parameters<GroundPainter>[0], g: GroundPatch, top: number, color: number) {
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
 * The floor's carpet: the room's cool blue-grey tiles in 0.5 squares,
 * quarter-turned (alternate tiles a shade apart), each its own tone (±4%).
 */
const carpet: GroundPainter = (b, g, salt) => {
  const top = 0.04;
  fill(b, g, top - 0.004, tint(CARPET, -0.2));
  const s = 0.5;
  for (let j = 0, z = g.z0; z < g.z1 - 0.01; j++, z += s)
    for (let i = 0, x = g.x0; x < g.x1 - 0.01; i++, x += s) {
      const xb = Math.min(g.x1, x + s);
      const zb = Math.min(g.z1, z + s);
      const c = tint(CARPET, (shade(i, j, salt) - 0.5) * 0.08 + ((i + j) % 2 ? -0.03 : 0.02));
      b.box(xb - x - 0.012, 0.004, zb - z - 0.012, c, { at: [(x + xb) / 2, top, (z + zb) / 2] }, 0);
    }
};

/** The lobby's pale stone: big 0.8 × 0.6 slabs in running bond, each a shade, light joints. */
const stone: GroundPainter = (b, g, salt) => {
  const top = 0.03;
  fill(b, g, top - 0.004, tint(STONE, 0.12));
  const w = 0.8;
  const d = 0.6;
  for (let j = 0, z = g.z0; z < g.z1 - 0.01; j++, z += d) {
    const zb = Math.min(g.z1, z + d);
    for (let i = 0, x = g.x0 - (j % 2) * (w / 2); x < g.x1 - 0.01; i++, x += w) {
      const xa = Math.max(g.x0, x);
      const xb = Math.min(g.x1, x + w);
      if (xb - xa < 0.02) continue;
      const c = tint(STONE, (shade(i, j, salt) - 0.5) * 0.08);
      b.box(
        xb - xa - 0.014,
        0.004,
        zb - z - 0.014,
        c,
        { at: [(xa + xb) / 2, top, (z + zb) / 2] },
        0,
      );
    }
  }
};

/** Derek's plush carpet: one deep blue-grey, a faint border. */
const plush: GroundPainter = (b, g) => {
  fill(b, g, 0.042, tint(PLUSH, -0.1));
  b.box(
    g.x1 - g.x0 - 0.3,
    0.004,
    g.z1 - g.z0 - 0.3,
    PLUSH,
    { at: [(g.x0 + g.x1) / 2, 0.046, (g.z0 + g.z1) / 2] },
    0,
  );
};

/**
 * The building's face going down past the curtain wall, seen from above:
 * rows of glass and pale spandrel bands narrowing and darkening toward the
 * street (`dir` the way the face runs along).
 */
function face(dir: 'x' | 'z'): GroundPainter {
  return (b, g) => {
    const top = 0.02;
    fill(b, g, top - 0.004, 0x3c4450);
    const depth = dir === 'x' ? g.z1 - g.z0 : g.x1 - g.x0;
    const bands = 5;
    for (let k = 0; k < bands; k++) {
      const t = (k + 0.5) / bands;
      const c = tint(COLORS.SPANDREL, 0.25 - t * 0.6);
      const o = t * depth;
      if (dir === 'x')
        b.box(
          g.x1 - g.x0,
          0.003,
          depth / (bands * 2.2),
          c,
          { at: [(g.x0 + g.x1) / 2, top, g.z0 + o] },
          0,
        );
      else
        b.box(
          depth / (bands * 2.2),
          0.003,
          g.z1 - g.z0,
          c,
          { at: [g.x0 + o, top, (g.z0 + g.z1) / 2] },
          0,
        );
    }
  };
}

/** The road far below: asphalt, a kerb line each side, a dashed centre line (`along` the way it runs). */
function road(along: 'x' | 'z'): GroundPainter {
  return (b, g, salt) => {
    const top = 0.012;
    fill(b, g, top - 0.004, COLORS.ASPHALT);
    const len = along === 'x' ? g.x1 - g.x0 : g.z1 - g.z0;
    const cx = (g.x0 + g.x1) / 2;
    const cz = (g.z0 + g.z1) / 2;
    for (let u = 0, k = 0; u < len; u += 0.4, k++) {
      const p = (along === 'x' ? g.x0 : g.z0) + u;
      if (along === 'x') b.box(0.2, 0.003, 0.025, COLORS.LANE, { at: [p, top + 0.002, cz] }, 0);
      else b.box(0.025, 0.003, 0.2, COLORS.LANE, { at: [cx, top + 0.002, p] }, 0);
      // Patched asphalt now and then.
      if (shade(k, 3, salt) > 0.85) {
        const q = (shade(k, 5, salt) - 0.5) * 0.4;
        if (along === 'x')
          b.box(0.3, 0.003, 0.18, tint(COLORS.ASPHALT, -0.08), { at: [p, top + 0.001, cz + q] }, 0);
        else
          b.box(0.18, 0.003, 0.3, tint(COLORS.ASPHALT, -0.08), { at: [cx + q, top + 0.001, p] }, 0);
      }
    }
  };
}

/** Pavement far below: pale flags with joints, a kerb round its edge. */
const walk: GroundPainter = (b, g, salt) => {
  const top = 0.016;
  fill(b, g, top - 0.004, COLORS.KERB);
  const s = 0.16;
  for (let j = 0, z = g.z0 + 0.02; z < g.z1 - 0.03; j++, z += s)
    for (let i = 0, x = g.x0 + 0.02; x < g.x1 - 0.03; i++, x += s) {
      const xb = Math.min(g.x1 - 0.02, x + s);
      const zb = Math.min(g.z1 - 0.02, z + s);
      const c = tint(COLORS.PAVEMENT, (shade(i, j, salt) - 0.5) * 0.06);
      b.box(
        xb - x - 0.008,
        0.003,
        zb - z - 0.008,
        c,
        { at: [(x + xb) / 2, top + 0.001, (z + zb) / 2] },
        0,
      );
    }
};

/** A city park far below: spring grass, gravel paths crossing it. */
const park: GroundPainter = (b, g, salt) => {
  const top = 0.008;
  fill(b, g, top - 0.004, COLORS.GRASS);
  const w = g.x1 - g.x0;
  const d = g.z1 - g.z0;
  // Paths every few tiles, along and across, and mown patches a shade apart.
  for (let k = 0, x = g.x0 + 1.4; x < g.x1; k++, x += 3.2 + shade(k, 1, salt))
    b.box(0.14, 0.003, d, COLORS.PATH, { at: [x, top + 0.001, (g.z0 + g.z1) / 2] }, 0);
  for (let k = 0, z = g.z0 + 1.1; z < g.z1; k++, z += 2.8 + shade(k, 2, salt))
    b.box(w, 0.003, 0.14, COLORS.PATH, { at: [(g.x0 + g.x1) / 2, top + 0.001, z] }, 0);
  for (let k = 0; k < Math.floor(w * d * 0.15); k++) {
    const x = g.x0 + shade(k, 3, salt) * w;
    const z = g.z0 + shade(k, 4, salt) * d;
    b.box(
      0.6,
      0.002,
      0.5,
      tint(COLORS.GRASS, (shade(k, 5, salt) - 0.5) * 0.12),
      { at: [x, top + 0.0005, z] },
      0,
    );
  }
};

/** Floor arrows on the lobby's stone, chevrons pointing along x (`dir`), LIFTS painted at the far end. */
function arrows(dir: 1 | -1): GroundPainter {
  return (b, g) => {
    const y = 0.036;
    const cz = (g.z0 + g.z1) / 2;
    const half = (g.z1 - g.z0) / 2;
    const ink = 0x5a6068;
    const len = g.x1 - g.x0;
    const textW = 19 * 0.05 + 0.3;
    for (let u = 0.2; u < len - textW; u += 0.45)
      for (const s of [-1, 1]) {
        const x = dir > 0 ? g.x0 + u : g.x1 - u;
        b.box(
          0.04,
          0.003,
          half * 1.25,
          ink,
          { at: [x, y, cz + s * half * 0.42], rot: [0, -dir * s * 0.75, 0] },
          0,
        );
      }
    const tx = dir > 0 ? g.x1 - textW / 2 : g.x0 + textW / 2;
    floorLetters(b, 'LIFTS', tx, cz, y, 0.05, ink);
  };
}

const PAINTERS: Readonly<Record<string, GroundPainter>> = {
  carpet,
  stone,
  plush,
  faceX: face('x'),
  faceZ: face('z'),
  roadX: road('x'),
  roadZ: road('z'),
  walk,
  park,
  arrowsR: arrows(1),
  arrowsL: arrows(-1),
};
