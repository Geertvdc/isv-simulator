import type { LevelMap } from '../../../sim/level';
import { getTile } from '../../../sim/level';
import { gridToWorld, projectPoint } from '../../projection';
import { firstGroup, tileHash } from '../../mapShape';
import { tint } from '../kit';
import { managerOffice } from '../rooms/managerOffice';
import { segfaultCat } from '../setDressing/onCall';
import { redLight, towerCrane } from '../setDressing/rooftop';
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
  CRANE_TOWER,
  CURTAIN,
  craneTower,
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
  liftWidth,
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
/**
 * The street far below, out from the curtain wall: the building's face, the pavement along the
 * sides (wide, so the road clears the side curtain walls on screen) and behind, the road, the far
 * pavement.
 */
const STREET = { face: 0.55, walk: 0.62, back: 0.17, road: 0.42, far: 0.15 } as const;
/** The street's props (trees, cars, the bus) are this much smaller than the floor's: they're far below. */
const CITY = 0.6;
/** How far the building's shadow falls across the street on its right (the sun is back left). */
const SHADOW = 1.35;
/** How wide the park block is between the side street and the next street out. */
const BLOCK = 2.1;
/** How far the window cleaner's cradle hangs off the curtain wall's glass. */
const CRADLE_OFF = 0.62;
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

interface Rect {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

/** The part of patch `g` inside `r`, or null. */
function overlap<T extends Rect>(g: T, r: Rect): T | null {
  const x0 = Math.max(g.x0, r.x0);
  const x1 = Math.min(g.x1, r.x1);
  const z0 = Math.max(g.z0, r.z0);
  const z1 = Math.min(g.z1, r.z1);
  return x1 - x0 > 0.01 && z1 - z0 > 0.01 ? { ...g, x0, x1, z0, z1 } : null;
}

/** Patch `g` with the rectangles `holes` cut out of it, as up to four strips each. */
function cut<T extends Rect>(g: T, holes: readonly Rect[]): T[] {
  let parts: T[] = [g];
  for (const h of holes) {
    const next: T[] = [];
    for (const p of parts) {
      if (!overlap(p, h)) {
        next.push(p);
        continue;
      }
      const strips: T[] = [
        { ...p, z1: Math.min(p.z1, h.z0) },
        { ...p, z0: Math.max(p.z0, h.z1) },
        { ...p, x1: Math.min(p.x1, h.x0), z0: Math.max(p.z0, h.z0), z1: Math.min(p.z1, h.z1) },
        { ...p, x0: Math.max(p.x0, h.x1), z0: Math.max(p.z0, h.z0), z1: Math.min(p.z1, h.z1) },
      ];
      next.push(...strips.filter((q) => q.x1 - q.x0 > 0.01 && q.z1 - q.z0 > 0.01));
    }
    parts = next;
  }
  return parts;
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
  // The street is drawn at a smaller scale than the floor (narrow roads, fine flags, small trees
  // and cars) so it reads as far below, and the building's slab edge runs round it as a band.
  const W = STREET;
  const near = W.face + W.walk;
  // The streets: one along each side and one behind, each pavement, road, far pavement; parks past them.
  const lRoad = leftLine - near;
  const rRoad = rightLine + near;
  const bRoad = backZ - W.face - W.back;
  const city: GroundPatch[] = [];
  const street = (kind: string, x0: number, x1: number, z0: number, z1: number) => {
    if (x1 - x0 > 0.01 && z1 - z0 > 0.01) city.push({ kind, x0, x1, z0, z1 });
  };
  // Past each side street a city block of park, then the next street out (pavement, road,
  // pavement), so the view down reads as streets in a grid, not one lawn.
  const outL = lRoad - W.road - W.far - BLOCK;
  const outR = rRoad + W.road + W.far + BLOCK;
  const outer = [
    { x0: outL - W.far - W.road - W.far, x1: outL, z0: bRoad - W.road - W.far, z1: frontZ + far },
    { x0: outR, x1: outR + W.far + W.road + W.far, z0: bRoad - W.road - W.far, z1: frontZ + far },
  ];
  for (const g of [
    { x0: edgeL - far, x1: lRoad - W.road - W.far, z0: topZ - far, z1: frontZ + far },
    { x0: rRoad + W.road + W.far, x1: edgeR + far, z0: topZ - far, z1: frontZ + far },
    { x0: edgeL - far, x1: edgeR + far, z0: topZ - far, z1: bRoad - W.road - W.far },
  ])
    for (const p of cut(g, outer)) street('park', p.x0, p.x1, p.z0, p.z1);
  for (const [x, s] of [
    [outL, -1],
    [outR, 1],
  ] as const) {
    const a = x + s * W.far;
    const b = a + s * W.road;
    const c = b + s * W.far;
    const z0 = bRoad - W.road - W.far;
    street('walk', Math.min(x, a), Math.max(x, a), z0, frontZ + far);
    street('roadZ', Math.min(a, b), Math.max(a, b), z0, frontZ + far);
    street('walk', Math.min(b, c), Math.max(b, c), z0, frontZ + far);
  }
  street('roadZ', lRoad - W.road, lRoad, topZ - far, frontZ + far);
  street('roadZ', rRoad, rRoad + W.road, topZ - far, frontZ + far);
  street('roadX', edgeL - far, edgeR + far, bRoad - W.road, bRoad);
  street('walk', lRoad - W.road - W.far, lRoad - W.road, bRoad - W.road, frontZ + far);
  street('walk', rRoad + W.road, rRoad + W.road + W.far, bRoad - W.road, frontZ + far);
  street(
    'walk',
    lRoad - W.road - W.far,
    rRoad + W.road + W.far,
    bRoad - W.road - W.far,
    bRoad - W.road,
  );
  street('walk', lRoad, leftLine - W.face, bRoad, frontZ + far);
  street('walk', rightLine + W.face, rRoad, bRoad, frontZ + far);
  street('walk', lRoad, rRoad, bRoad, backZ - W.face);
  // The building's slab edge and face going down, round its outline (and round the office poking
  // out), each named for the side the building is on (its nosing runs along that edge).
  street('face+x', leftLine - W.face, leftLine, backZ - W.face, frontZ + far);
  street('face-x', rightLine, rightLine + W.face, backZ - W.face, frontZ + far);
  street('face+z', leftLine - W.face, rightLine + W.face, backZ - W.face, backZ);
  if (poke) {
    const x = poke.side === 'left' ? L : R;
    const s = poke.side === 'left' ? -1 : 1;
    const xs = [x, x + s * W.face].sort((a, b) => a - b) as [number, number];
    const line = poke.side === 'left' ? leftLine : rightLine;
    const span = [Math.min(x + s * W.face, line), Math.max(x + s * W.face, line)] as const;
    street(s < 0 ? 'face+x' : 'face-x', xs[0], xs[1], poke.z0 - W.face, poke.z1 + W.face);
    street('face+z', span[0], span[1], poke.z0 - W.face, poke.z0);
    street('face-z', span[0], span[1], poke.z1, poke.z1 + W.face);
  }
  if (office) {
    street('face+z', office.x0 - W.face, office.x1 + W.face, office.z0 - W.face, office.z0);
    street('face-x', office.x1, office.x1 + W.face, office.z0 - W.face, office.z1 + W.face);
    street('face+x', office.x0 - W.face, office.x0, office.z0 - W.face, backZ);
    street('face-z', rightLine, office.x1 + W.face, office.z1, office.z1 + W.face);
  }
  // Nothing of the street under Derek's office floor; the building's shadow (the sun is back left)
  // across the street on its right, a soft edge at its end.
  const holes = office ? [office] : [];
  const shadows: [string, { x0: number; x1: number; z0: number; z1: number }][] = [
    [':s', { x0: rightLine, x1: rightLine + SHADOW, z0: backZ - W.face, z1: frontZ + far }],
    [':h', { x0: rightLine + SHADOW, x1: rightLine + SHADOW + 0.3, z0: backZ, z1: frontZ + far }],
  ];
  if (office)
    shadows.push(
      [':s', { x0: office.x1, x1: office.x1 + SHADOW, z0: office.z0, z1: office.z1 + 1 }],
      [
        ':h',
        { x0: office.x1 + SHADOW, x1: office.x1 + SHADOW + 0.3, z0: office.z0, z1: office.z1 },
      ],
    );
  for (const g of city)
    for (const part of cut(g, holes)) {
      // The parts in shadow, then the rest lit.
      let rest = [part];
      for (const [suffix, sh] of shadows) {
        const next: GroundPatch[] = [];
        for (const r of rest) {
          const inside = overlap(r, sh);
          if (inside) ground.push({ ...inside, kind: r.kind + suffix });
          next.push(...cut(r, [sh]));
        }
        rest = next;
      }
      ground.push(...rest);
    }
  // The floor: reception's stone behind, the carpet down the sides, the lobby's stone in front.
  for (const g of cut({ x0: leftLine, x1: rightLine, z0: backZ, z1: B }, holes))
    patch('stone', g.x0, g.x1, g.z0, g.z1);
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
    putClear(podChair, x + 1.5, sofaZ + 0.3, 0.4, 0.85, 0.3, 2);
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

  /** The screen box (x0, y0, x1, y1) of the world box x0..x1, up y0..y1 from the ground, z0..z1. */
  const screenBox = (
    x0: number,
    x1: number,
    y0: number,
    y1: number,
    z0: number,
    z1: number,
  ): [number, number, number, number] => {
    const pts = [];
    for (const x of [x0, x1])
      for (const y of [y0, y1])
        for (const z of [z0, z1]) pts.push(projectPoint(pose, { x, y: GROUND + y, z }));
    return [
      Math.min(...pts.map((p) => p.x)),
      Math.min(...pts.map((p) => p.y)),
      Math.max(...pts.map((p) => p.x)),
      Math.max(...pts.map((p) => p.y)),
    ];
  };
  type Box = readonly [number, number, number, number];
  const hits = (r: Box, q: Box) => !(r[2] <= q[0] || r[0] >= q[2] || r[3] <= q[1] || r[1] >= q[3]);
  const offHud = (r: Box) => HUD.every((q) => !hits(r, q));

  // ---- The crane tower across the street behind, MONOLITH's tower further off ----
  /** Where the crane tower stands along x (the trees keep out of its way). */
  let towerAt: { x0: number; x1: number; z: number } | null = null;
  {
    const tw = 1.0;
    const td = 0.5;
    const tz = bRoad - W.road - 0.05;
    // The crane on its roof (small, as it's far), its jib out sideways away from the office.
    const cs = 0.45;
    const mast = 0.4;
    const jib = 1.4;
    const dir = office ? -1 : 1;
    const craneTop = (mast + 0.55) * cs;
    // Right of the order cards and left of the office (or the mute button), the whole thing, crane
    // and lights in the frame; as many storeys as fit, and the middle of where it fits.
    const right = office
      ? screenBox(office.x0, office.x0, 0, 2.3, office.z0, office.z0)[0] - 8
      : 1360;
    const fits = (x: number, floors: number) => {
      const h = floors * CRANE_TOWER.storey;
      const cz = tz - td / 2;
      const a = screenBox(x - tw / 2, x + tw / 2, 0, h + 0.1, tz - td, tz);
      const c = screenBox(
        Math.min(x - 0.2, x + dir * jib * cs),
        Math.max(x + 0.2, x + dir * jib * cs),
        h,
        h + craneTop,
        cz - 0.1,
        cz + 0.1,
      );
      // Under the curtain wall's spandrel band on screen, so the crane isn't hidden behind it.
      const band = projectPoint(pose, { x, y: GROUND + CURTAIN.floor, z: backZ - 0.1 }).y + 3;
      return (
        Math.min(a[0], c[0]) > CARDS_RIGHT + 5 &&
        Math.max(a[2], c[2]) < right &&
        Math.min(a[1], c[1]) > Math.max(4, band)
      );
    };
    for (let floors = 10; floors >= 4; floors--) {
      const xs: number[] = [];
      for (let x = xAt(CARDS_RIGHT, tz); x < xAt(1440, tz); x += 0.1)
        if (fits(x, floors)) xs.push(x);
      const first = xs[0];
      const last = xs[xs.length - 1];
      if (first === undefined || last === undefined) continue;
      // Beside Derek's office when he has one (clear of Prod and the sofa), else the middle.
      const tx = Math.round((office ? last - 0.2 : (first + last) / 2) * 20) / 20;
      const h = floors * CRANE_TOWER.storey;
      put(craneTower(tw, td, floors), tx, tz, 0, 0, 'far');
      towerAt = { x0: tx - tw / 2 - 0.25, x1: tx + tw / 2 + 0.25, z: tz };
      const cz = tz - td / 2;
      put(towerCrane(mast, jib), tx, cz, office ? Math.PI : 0, 0, 'far', h, cs);
      put(redLight, tx + dir * (jib - 0.05) * cs, cz, 0, 0, 'far', h + (mast + 0.32) * cs);
      put(redLight, tx, cz, 0, 0, 'far', h + (mast + 0.55) * cs);
      break;
    }
    // MONOLITH, further off, toward the right.
    const mz = tz - 2.2;
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
  let liftW = 0;
  if (liftSide) {
    // At the room's front corner, its doors facing the camera across the lobby: tucked against
    // the curtain wall, as far forward as keeps it off the HUD and wholly in the frame.
    const right = liftSide === 'right';
    const line = right ? rightLine : leftLine;
    const inner = right ? R + 0.12 : L - 0.12;
    const span = Math.abs(line - inner) - 0.1;
    const count = span >= liftWidth(2) && F - B > 8 ? 2 : 1;
    liftW = liftWidth(count);
    const D = LIFTS.depth;
    const s = right ? -1 : 1;
    let best: [number, number] | null = null;
    for (let fz = F + 0.2; fz > F - 5 && !best; fz -= 0.05)
      for (let k = 0; k <= 12 && !best; k++) {
        const x = line + s * (0.1 + liftW / 2 + k * 0.05);
        if (right ? x - liftW / 2 < inner : x + liftW / 2 > inner) break;
        const r = screenBox(
          x - liftW / 2 - 0.03,
          x + liftW / 2 + 0.03,
          0,
          LIFTS.height + 0.06,
          fz - D - 0.03,
          fz + 0.04,
        );
        if (r[0] > 20 && r[2] < 1420 && r[3] < 800 && offHud(r)) best = [x, fz];
      }
    if (best) {
      [liftX, liftZ] = [best[0], best[1] - D];
      // Its open car's light keeps its warmth (a small emitter, like the release board's).
      hot.add(liftBank(count));
      put(liftBank(count), liftX, best[1], 0);
    }
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
            [podChair, 0.42, 0.85, 0.45, 3],
            [bigPlant, 0.3, 1.5, 0.6, 4],
            [printer, 0.36, 0.95, 0.75, 0],
          ]
        : [
            [printer, 0.36, 0.95, 0.75, 0],
            [coatStand, 0.3, 1.8, 0.45, 0],
            [bigPlant, 0.3, 1.5, 0.6, 1],
            [podChair, 0.42, 0.85, 0.45, 0],
            [lowSofa, 0.7, 0.75, 0.9, 3],
          ];
    for (const [piece, r, high, gap, v] of plan) {
      const zc = z + r + 0.1;
      if (zc + r > z1) break;
      const x = wall + s * (piece === podChair ? Math.min(span - 0.55, 1.2) : r * 0.8 + 0.12);
      // The pod chair opens toward the camera, turned a little to the room, so its seat shows.
      const yaw = piece === podChair ? s * 0.45 : face;
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
  // In the frame on the right curtain wall (about x 1300–1420, y 300–450 on screen), its two thin
  // ropes steered back along the facade and off the top of the frame left of the mute button.
  {
    // Hung a little off the glass, so the cradle shows past the curtain wall's top edge.
    const x = rightLine + CRADLE_OFF + CRADLE.wide / 2;
    const z0 = (office ? office.z1 : backZ) + 0.9;
    const z1 = Math.min(liftZ, F) - 0.9;
    let best: { z: number; d: number } | null = null;
    for (let z = z0; z <= z1; z += 0.1) {
      const r = screenBox(
        x - CRADLE.wide / 2,
        x + CRADLE.wide / 2 + 0.2,
        0,
        1.55,
        z - CRADLE.len / 2,
        z + CRADLE.len / 2,
      );
      if (r[0] < 1260 || r[2] > 1432 || r[1] < 120 || r[3] > 560 || !offHud(r)) continue;
      const d = Math.abs((r[1] + r[3]) / 2 - 375);
      if (!best || d < best.d) best = { z, d };
    }
    // The ropes' top: up and back along the facade until it's off the top of the frame.
    let rope: [number, number, number] | null = null;
    if (best) {
      const z = best.z;
      const ok = (dx: number, dy: number, dz: number) => {
        // Both ropes, sampled along their length: clear of the mute button, ending above the frame.
        for (const s of [-1, 1]) {
          const a = { x, y: GROUND + 1.5, z: z + (s * CRADLE.len) / 2 };
          const c = { x: x + dx, y: GROUND + dy, z: z + dz + s * 0.3 };
          const top = projectPoint(pose, c);
          if (top.y > -10 || top.x > 1355) return false;
          for (let t = 0; t <= 1; t += 0.05) {
            const p = projectPoint(pose, {
              x: a.x + (c.x - a.x) * t,
              y: a.y + (c.y - a.y) * t,
              z: a.z + (c.z - a.z) * t,
            });
            if (p.x > 1360 && p.y < 70) return false;
          }
        }
        return true;
      };
      search: for (let dz = 0; dz >= -12; dz -= 0.25)
        for (const dy of [3, 4, 5, 6])
          for (const dx of [0.15, 0]) {
            if (ok(dx, dy, dz)) {
              rope = [dx, dy, dz];
              break search;
            }
          }
    }
    if (best && rope) {
      put(cradle, x, best.z, -Math.PI / 2);
      put(cradleRopes(...rope), x, best.z, 0, 0, 'far');
      person(x + 0.02, best.z + 0.25, -Math.PI / 2 - 0.2, 'idle');
    }
  }

  // ---- The street far below: cherry trees in rows, a bus stop, cars and a bus ----
  /** Whether a city prop at (x, z), `r` round, keeps out from under the building and the office. */
  const inStreet = (x: number, z: number, r: number) => {
    if (!offSlab(x, z, r)) return false;
    if (towerAt && x > towerAt.x0 && x < towerAt.x1 && z > towerAt.z - 1 && z < towerAt.z + 0.6)
      return false;
    if (
      office &&
      x > office.x0 - r &&
      x < office.x1 + W.face + r &&
      z > office.z0 - W.face - r &&
      z < office.z1 + r
    )
      return false;
    if (x > leftLine - W.face - r && x < rightLine + W.face + r && z > backZ - W.face - r)
      return false;
    if (
      poke &&
      (poke.side === 'left' ? x > L - W.face - r : x < R + W.face + r) &&
      z > poke.z0 - W.face - r &&
      z < poke.z1 + W.face + r
    )
      return false;
    return true;
  };
  /** A row of blossoming cherry trees in clumps of 3–4 overlapping canopies, from a to b along `along` at `at`. */
  const treeRow = (along: 'x' | 'z', at: number, a: number, b: number, salt: number, phase = 0) => {
    const step = 0.24;
    for (let u = a + phase, k = 0; u < b; k++) {
      const count = 3 + (unit(k, salt, 11) > 0.5 ? 1 : 0);
      for (let j = 0; j < count; j++) {
        const p = u + j * step + (unit(k * 7 + j, salt, 13) - 0.5) * 0.05;
        const q = at + (unit(k * 7 + j, salt, 17) - 0.5) * 0.06;
        const tx = along === 'x' ? p : q;
        const tz = along === 'x' ? q : p;
        if (p > b || !inStreet(tx, tz, 0.12) || !onScreen(tx, tz, 0, -40)) continue;
        put(
          cherryTree,
          tx,
          tz,
          unit(k, j + salt, 19) * 6,
          k + j + salt,
          'far',
          0,
          CITY * (0.92 + unit(k, j, salt) * 0.16),
        );
      }
      u += (count - 1) * step + 0.55 + unit(k, salt, 23) * 0.35;
    }
  };
  // Along both pavements of each side street and the street behind, and a row into each park.
  for (const s of [-1, 1] as const) {
    const line = s < 0 ? leftLine : rightLine;
    const salt = s > 0 ? 50 : 0;
    treeRow('z', line + s * (W.face + W.walk * 0.72), topZ, frontZ + 1, salt);
    treeRow('z', line + s * (near + W.road + W.far * 0.5), topZ, frontZ + 1, salt + 7, 0.4);
    const block = near + W.road + W.far;
    treeRow('z', line + s * (block + 0.5), topZ, frontZ + 1, salt + 13, 0.2);
    treeRow('z', line + s * (block + BLOCK + W.far * 0.5), topZ, frontZ + 1, salt + 19, 0.1);
  }
  treeRow('x', backZ - W.face - W.back * 0.5, edgeL, edgeR, 90);
  treeRow('x', bRoad - W.road - W.far * 0.5, edgeL, edgeR, 97, 0.5);
  // Cars along both lanes of each road.
  const carAt = (x: number, z: number, yaw: number, v: number) => {
    if (inStreet(x, z, 0.12) && onScreen(x, z, 0, 20)) put(dayCar, x, z, yaw, v, 'far', 0, CITY);
  };
  (
    [
      [lRoad - W.road * 0.28, 0],
      [lRoad - W.road * 0.72, Math.PI],
      [rRoad + W.road * 0.28, Math.PI],
      [rRoad + W.road * 0.72, 0],
      [outL - W.far - W.road * 0.3, 0],
      [outR + W.far + W.road * 0.3, Math.PI],
    ] as const
  ).forEach(([x, dir], k) => {
    for (let j = 0; j < 7; j++) {
      const z = backZ + 0.6 + j * 1.7 + unit(k, j, 29) * 0.9 + (k > 3 ? 0.8 : 0);
      if (unit(k, j, 31) < 0.3) continue;
      carAt(x, z, dir + Math.PI / 2, k * 3 + j);
    }
  });
  for (let k = 0; k < 8; k++) {
    const x = leftLine + 0.5 + k * 1.9 + unit(k, 1, 37) * 0.8;
    if (x > rightLine + 3) break;
    carAt(x, bRoad - W.road * (k % 2 ? 0.72 : 0.28), k % 2 ? Math.PI : 0, k + 2);
  }
  {
    // The bus at a stop on the side with the most street in the frame.
    const seenL = L - xAt(0, (B + F) / 2);
    const seenR = xAt(VIEW.width, (B + F) / 2) - R;
    const left = seenL - (L - leftLine) >= seenR - (rightLine - R);
    const s = left ? -1 : 1;
    const road = left ? lRoad : rRoad;
    const bx = road + s * W.road * 0.72;
    const sx = road + s * (W.road + W.far * 0.5);
    // Mid-side, or the nearest stretch the building doesn't overhang (the office poking out).
    let bz = (B + F) / 2 - 0.5;
    for (let k = 0; k < 40; k++) {
      const z = (B + F) / 2 - 0.5 + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.25;
      if (inStreet(bx, z, 0.4) && inStreet(sx, z, 0.2)) {
        bz = z;
        break;
      }
    }
    put(bus, bx, bz, Math.PI / 2 + (left ? Math.PI : 0), 0, 'far', 0, CITY);
    put(busStop, sx, bz + 0.1, left ? Math.PI / 2 : -Math.PI / 2, 0, 'far', 0, CITY);
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
    const a0 =
      liftSide === 'right' ? boardX + 1.0 : Math.max(liftX + liftW / 2 - 0.1, xAt(240, az));
    const a1 =
      liftSide === 'right' ? Math.min(liftX - liftW / 2 + 0.1, xAt(1290, az)) : boardX - 1.0;
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
  fill(b, g, 0.056, tint(PLUSH, -0.1));
  b.box(
    g.x1 - g.x0 - 0.3,
    0.004,
    g.z1 - g.z0 - 0.3,
    PLUSH,
    { at: [(g.x0 + g.x1) / 2, 0.06, (g.z0 + g.z1) / 2] },
    0,
  );
};

/** The slab edge's nosing, the dark spandrel band under it, the glass of the floors below. */
const FACE = { nosing: 0x9aa2aa, band: 0x4a525c, glass: 0x5e6c7a } as const;

/**
 * The building's slab edge and face going down past the curtain wall, seen
 * from above: the pale nosing along the building's edge, the dark slab band,
 * then the floors below foreshortened, glass and spandrel bands narrowing
 * and darkening toward the street, mullions across the glass. `side` is the
 * way the building lies from the patch ('+x': toward x1), `dim` the shade.
 */
function face(side: '+x' | '-x' | '+z' | '-z', dim: number): GroundPainter {
  return (b, g) => {
    const top = 0.02;
    const alongX = side === '+z' || side === '-z';
    const depth = alongX ? g.z1 - g.z0 : g.x1 - g.x0;
    const len = alongX ? g.x1 - g.x0 : g.z1 - g.z0;
    const k = depth / 0.55;
    /** A band from u0 to u1 out from the building's edge. */
    const band = (u0: number, u1: number, color: number, y = top) => {
      const c = tint(color, dim);
      const w = (u1 - u0) * k;
      const o = ((u0 + u1) / 2) * k;
      const at = (pos: number): [number, number, number] =>
        side === '+x'
          ? [g.x1 - pos, y, (g.z0 + g.z1) / 2]
          : side === '-x'
            ? [g.x0 + pos, y, (g.z0 + g.z1) / 2]
            : side === '+z'
              ? [(g.x0 + g.x1) / 2, y, g.z1 - pos]
              : [(g.x0 + g.x1) / 2, y, g.z0 + pos];
      if (alongX) b.box(len, 0.003, w, c, { at: at(o) }, 0);
      else b.box(w, 0.003, len, c, { at: at(o) }, 0);
    };
    fill(b, g, top - 0.004, tint(0x3a424c, dim));
    band(0, 0.05, FACE.nosing);
    band(0.05, 0.16, FACE.band);
    band(0.16, 0.3, FACE.glass);
    band(0.3, 0.355, tint(FACE.band, -0.06));
    band(0.355, 0.45, tint(FACE.glass, -0.14));
    band(0.45, 0.49, tint(FACE.band, -0.12));
    band(0.49, 0.55, tint(FACE.glass, -0.26));
    // Mullions across the glass, every 0.4 along the face.
    const m = tint(0x3a424c, dim - 0.04);
    const o0 = alongX ? g.x0 : g.z0;
    for (let u = 0.2; u < len; u += 0.4) {
      const p = o0 + u;
      const mid = side === '+x' ? g.x1 - 0.35 * k : side === '-x' ? g.x0 + 0.35 * k : 0;
      const midZ = side === '+z' ? g.z1 - 0.35 * k : side === '-z' ? g.z0 + 0.35 * k : 0;
      if (alongX) b.box(0.014, 0.003, 0.38 * k, m, { at: [p, top + 0.001, midZ] }, 0);
      else b.box(0.38 * k, 0.003, 0.014, m, { at: [mid, top + 0.001, p] }, 0);
    }
  };
}

/** The road far below: asphalt, a dashed centre line (`along` the way it runs), patches. */
function road(along: 'x' | 'z', dim: number): GroundPainter {
  return (b, g, salt) => {
    const top = 0.012;
    fill(b, g, top - 0.004, tint(COLORS.ASPHALT, dim));
    const len = along === 'x' ? g.x1 - g.x0 : g.z1 - g.z0;
    const cx = (g.x0 + g.x1) / 2;
    const cz = (g.z0 + g.z1) / 2;
    const lane = tint(COLORS.LANE, dim);
    for (let u = 0, k = 0; u < len; u += 0.26, k++) {
      const p = (along === 'x' ? g.x0 : g.z0) + u;
      if (along === 'x') b.box(0.12, 0.003, 0.016, lane, { at: [p, top + 0.002, cz] }, 0);
      else b.box(0.016, 0.003, 0.12, lane, { at: [cx, top + 0.002, p] }, 0);
      // Patched asphalt now and then.
      if (shade(k, 3, salt) > 0.88) {
        const q = (shade(k, 5, salt) - 0.5) * 0.25;
        const c = tint(COLORS.ASPHALT, dim - 0.08);
        if (along === 'x') b.box(0.2, 0.003, 0.11, c, { at: [p, top + 0.001, cz + q] }, 0);
        else b.box(0.11, 0.003, 0.2, c, { at: [cx + q, top + 0.001, p] }, 0);
      }
    }
  };
}

/** Pavement far below: pale small flags with joints, a kerb round its edge. */
function walk(dim: number): GroundPainter {
  return (b, g, salt) => {
    const top = 0.016;
    fill(b, g, top - 0.004, tint(COLORS.KERB, dim));
    const s = 0.1;
    for (let j = 0, z = g.z0 + 0.015; z < g.z1 - 0.02; j++, z += s)
      for (let i = 0, x = g.x0 + 0.015; x < g.x1 - 0.02; i++, x += s) {
        const xb = Math.min(g.x1 - 0.015, x + s);
        const zb = Math.min(g.z1 - 0.015, z + s);
        const c = tint(COLORS.PAVEMENT, dim + (shade(i, j, salt) - 0.5) * 0.05);
        b.box(
          xb - x - 0.006,
          0.003,
          zb - z - 0.006,
          c,
          { at: [(x + xb) / 2, top + 0.001, (z + zb) / 2] },
          0,
        );
      }
  };
}

/** A city park far below: spring grass in mown patches, faint paths crossing it. */
function park(dim: number): GroundPainter {
  return (b, g, salt) => {
    const top = 0.008;
    fill(b, g, top - 0.004, tint(COLORS.GRASS, dim));
    const w = g.x1 - g.x0;
    const d = g.z1 - g.z0;
    const path = tint(COLORS.PATH, dim);
    for (let k = 0, x = g.x0 + 0.9; x < g.x1; k++, x += 2.2 + shade(k, 1, salt) * 0.6)
      b.box(0.08, 0.003, d, path, { at: [x, top + 0.001, (g.z0 + g.z1) / 2] }, 0);
    for (let k = 0, z = g.z0 + 0.7; z < g.z1; k++, z += 2.0 + shade(k, 2, salt) * 0.6)
      b.box(w, 0.003, 0.08, path, { at: [(g.x0 + g.x1) / 2, top + 0.001, z] }, 0);
    for (let k = 0; k < Math.floor(w * d * 0.2); k++) {
      const x = g.x0 + shade(k, 3, salt) * w;
      const z = g.z0 + shade(k, 4, salt) * d;
      b.box(
        Math.min(0.4, w),
        0.002,
        Math.min(0.32, d),
        tint(COLORS.GRASS, dim + (shade(k, 5, salt) - 0.5) * 0.08),
        { at: [x, top + 0.0005, z] },
        0,
      );
    }
  };
}

/** The most chevrons the lobby's arrows get, and how far apart they are. */
const CHEVRONS = { most: 5, every: 0.9 } as const;

/** Floor arrows on the lobby's stone, a few chevrons pointing along x (`dir`) into LIFTS painted at the far end. */
function arrows(dir: 1 | -1): GroundPainter {
  return (b, g) => {
    const y = 0.036;
    const cz = (g.z0 + g.z1) / 2;
    const half = (g.z1 - g.z0) / 2;
    const ink = 0x8a9098;
    const len = g.x1 - g.x0;
    const textW = 19 * 0.05 + 0.3;
    // Back from the letters, so the last chevron leads into them.
    for (let c = 0, u = len - textW - 0.25; c < CHEVRONS.most && u > 0.1; c++, u -= CHEVRONS.every)
      for (const s of [-1, 1]) {
        const x = dir > 0 ? g.x0 + u : g.x1 - u;
        b.box(
          0.05,
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

/** The street's kinds, lit, in the building's shadow (':s') and at its soft edge (':h'). */
const SHADES: readonly [string, number][] = [
  ['', 0],
  [':s', -0.2],
  [':h', -0.1],
];

const PAINTERS: Readonly<Record<string, GroundPainter>> = {
  carpet,
  stone,
  plush,
  arrowsR: arrows(1),
  arrowsL: arrows(-1),
  ...Object.fromEntries(
    SHADES.flatMap(([suffix, dim]) => [
      ['face+x' + suffix, face('+x', dim)],
      ['face-x' + suffix, face('-x', dim)],
      ['face+z' + suffix, face('+z', dim)],
      ['face-z' + suffix, face('-z', dim)],
      ['roadX' + suffix, road('x', dim)],
      ['roadZ' + suffix, road('z', dim)],
      ['walk' + suffix, walk(dim)],
      ['park' + suffix, park(dim)],
    ]),
  ),
};
