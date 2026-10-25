/**
 * The world map's towns and cities, as plain data (testable in Node): which
 * set piece stands where, and what each ground tile is paved with. Left to
 * right the story grows from a suburban street with the founders' garage to
 * a big-tech campus with a skyscraper: every chapter has its own theme, and
 * buildings get denser and taller chapter by chapter.
 *
 * The plan is deterministic (a fixed seed per chapter) and follows from the
 * map layout alone. Every piece stays off the road, its stops, the flags and
 * their numbers, and nothing tall stands where it would hide them from the
 * camera: the camera looks from the front, so a piece hides the ground just
 * behind it (its "silhouette"), and the planner keeps that clear too. Tall
 * buildings so end up at the back, low ones at the front.
 */

import type { MapPoint, MapRegion, WorldMap } from '../../../flow/worldMap';
import { type Rect, denseRoad, rectDistance } from './mapGeometry';
import { LABEL, markerSpots } from './markers';

export { denseRoad, rectDistance } from './mapGeometry';

/** Land added behind the island (render only), for the cities' tall back rows. */
export const BACKLOT = 4;
/** The back street: one row of tiles across the whole island, with a turning circle at each end. */
export const STREET = { row: -1, laneOffset: 0.2, end: 0.65 };

/**
 * How far the camera's view tilts a height back onto the ground: a point
 * `h` up hides the ground `h × SILHOUETTE` behind it (the camera looks down
 * at 56°, so 1 / tan 56°).
 */
export const SILHOUETTE = 1 / Math.tan((56 * Math.PI) / 180);

export type PieceKind =
  // Garage town
  | 'house'
  | 'garage'
  | 'fence'
  | 'mailbox'
  | 'bike'
  // Startup park
  | 'warehouse'
  | 'cowork'
  | 'kiosk'
  | 'scooter'
  | 'bench'
  | 'pingPong'
  | 'picnic'
  // Scale-up downtown
  | 'office'
  | 'crane'
  | 'lamp'
  | 'car'
  // Enterprise city
  | 'tower'
  | 'hq'
  | 'fountain'
  | 'planter'
  // Big Tech campus
  | 'glassTower'
  | 'campus'
  | 'skyscraper'
  | 'helipad'
  | 'hedge'
  // Engineering, here and there from the garage on
  | 'serverRack'
  | 'dish'
  | 'antenna'
  // Everywhere
  | 'tree'
  | 'roundTree'
  | 'bush';

export interface CityPiece {
  kind: PieceKind;
  chapter: number;
  /** The footprint's middle, in map units. */
  x: number;
  y: number;
  /** Footprint: width along x, depth along y. */
  w: number;
  d: number;
  /** Height in map units (for buildings, from their storeys). */
  h: number;
  storeys: number;
  /** Turn round the vertical axis; 0 faces the camera. Only small, square-ish pieces turn. */
  yaw: number;
  /** A number in [0, 1) the models pick colors and details from. */
  variant: number;
}

export type GroundKind = 'grass' | 'lawn' | 'paving' | 'concrete' | 'asphalt' | 'plaza';

export interface GroundTile {
  x: number;
  y: number;
  kind: GroundKind;
  chapter: number;
}

export interface CityPlan {
  pieces: CityPiece[];
  ground: GroundTile[];
}

/** A building's storey, in map units, and what it adds for a roof. */
export const STOREY = 0.4;

/** Big pieces: the ones that pave the ground round them and count in the skyline. */
const BUILDINGS: ReadonlySet<PieceKind> = new Set<PieceKind>([
  'house',
  'garage',
  'warehouse',
  'cowork',
  'office',
  'crane',
  'tower',
  'hq',
  'glassTower',
  'campus',
  'skyscraper',
]);

export function isBuilding(kind: PieceKind): boolean {
  return BUILDINGS.has(kind);
}

/** One kind of piece and the sizes it comes in. */
interface Spec {
  kind: PieceKind;
  w: [number, number];
  d: [number, number];
  /** Storeys (buildings) or a plain height range (props: `storeys` [0, 0]). */
  storeys: [number, number];
  h?: [number, number];
  /** Extra height over the storeys: roofs, signs. */
  roof?: number;
  /** Small pieces may turn freely. */
  turns?: boolean;
  weight?: number;
}

/** A row of pieces between two depths, walked left to right. */
interface Row {
  from: number;
  to: number;
  /** Line the pieces' backs (or fronts) up on the row's edge. */
  align: 'back' | 'front';
  specs: Spec[];
  gap: [number, number];
  /** Picket fences in front of houses. */
  fences?: boolean;
}

interface Landmark {
  spec: Spec;
  /** Where it wants to stand; the planner takes the nearest free spot. */
  prefer: (region: MapRegion, map: WorldMap) => MapPoint;
  /** Little pieces round it, placed relative to its front middle. */
  companions?: { spec: Spec; dx: number; dy: number }[];
}

interface Theme {
  landmarks: Landmark[];
  rows: Row[];
  fillers: Spec[];
  /** Random tries to scatter fillers over the region. */
  fillTries: number;
  /** What the ground is, before buildings pave it. */
  ground: (x: number, y: number) => GroundKind;
  /** The ground round buildings: paved, or left as garden. */
  yard: GroundKind;
}

const prop = (
  kind: PieceKind,
  w: number,
  d: number,
  h: number,
  extra: Partial<Spec> = {},
): Spec => ({
  kind,
  w: [w, w],
  d: [d, d],
  storeys: [0, 0],
  h: [h, h],
  ...extra,
});

const TREE = prop('tree', 0.9, 0.9, 1.75, { weight: 3 });
const ROUND_TREE = prop('roundTree', 0.7, 0.7, 1.35, { weight: 2 });
const BUSH = prop('bush', 0.6, 0.6, 0.45, { turns: true, weight: 2 });
const LAMP = prop('lamp', 0.25, 0.25, 1.1, { weight: 1 });
const CAR = prop('car', 0.45, 0.85, 0.42, { weight: 1 });
const BENCH = prop('bench', 0.6, 0.3, 0.3, { weight: 1 });
const PLANTER = prop('planter', 0.5, 0.5, 0.55, { weight: 1 });
const HEDGE = prop('hedge', 1.1, 0.35, 0.4, { weight: 1 });
/** Engineering props: an outdoor server cabinet, a satellite dish, a radio mast. */
const RACK = prop('serverRack', 0.45, 0.38, 0.8, { weight: 1 });
const DISH = prop('dish', 0.55, 0.55, 0.75, { weight: 1 });
const ANTENNA = prop('antenna', 0.5, 0.5, 1.7, { weight: 1 });

/** Back of the island's back street, and its front. */
const STREET_BACK = STREET.row;
const STREET_FRONT = STREET.row + 1;
/**
 * The rows the themes fill: the back lot behind the street (tall
 * buildings, the skyline), the row between the street and the far flags
 * (where the landmarks stand, in view under the level card), and the
 * strip along the near shore (low things only; the hint covers part of it).
 */
const BACK_ROW = { from: -BACKLOT + 0.15, to: STREET_BACK - 0.35 };
const FRONT_ROW = { from: STREET_FRONT + 0.4, to: 2.15 };
const SHORE_ROW = { from: 10.6, to: 11.85 };

const HOUSE: Spec = { kind: 'house', w: [1.2, 1.6], d: [1.15, 1.3], storeys: [1, 1], roof: 0.85 };

/** The first level of `region`'s chapter on the near side of the road. */
function nearNode(region: MapRegion, map: WorldMap): MapPoint {
  const near = map.nodes.find(
    (n, i) => map.nodeChapters[i] === region.chapter && n.y > map.height / 2,
  );
  return near ?? { x: region.x + region.width / 2, y: map.height * 0.7 };
}

const THEMES: Theme[] = [
  // Garage: a sleepy suburban street; the founders' garage by the first level.
  {
    landmarks: [
      {
        spec: { kind: 'garage', w: [1.8, 1.8], d: [1.35, 1.35], storeys: [1, 1], roof: 1.15 },
        prefer: (_r, map) => {
          const first = map.nodes[0] ?? { x: 1.5, y: 8 };
          return { x: first.x - 0.3, y: first.y - 3 };
        },
        companions: [
          { spec: prop('mailbox', 0.25, 0.25, 0.6), dx: 1.15, dy: 0.15 },
          { spec: prop('bike', 0.3, 0.6, 0.5), dx: -1.15, dy: -0.25 },
        ],
      },
    ],
    rows: [
      { ...BACK_ROW, align: 'front', specs: [HOUSE], gap: [0.6, 1.3], fences: true },
      { ...FRONT_ROW, align: 'back', specs: [HOUSE], gap: [0.9, 1.8], fences: true },
      { ...SHORE_ROW, align: 'front', specs: [BUSH, TREE, ROUND_TREE], gap: [0.6, 1.6] },
    ],
    fillers: [TREE, ROUND_TREE, BUSH, DISH],
    fillTries: 260,
    ground: () => 'grass',
    yard: 'grass',
  },
  // Startup: an office park round a converted warehouse, coffee and scooters.
  {
    landmarks: [
      {
        spec: { kind: 'warehouse', w: [3, 3], d: [1.75, 1.75], storeys: [1, 1], roof: 1.2 },
        prefer: (r) => ({ x: r.x + 4.2, y: 1.2 }),
      },
      {
        spec: prop('kiosk', 0.95, 0.85, 1.05),
        prefer: (r, map) => {
          const near = nearNode(r, map);
          return { x: near.x + 2, y: near.y + 1.6 };
        },
        companions: [
          { spec: prop('bench', 0.6, 0.3, 0.3), dx: 0.95, dy: -0.15 },
          { spec: prop('scooter', 0.22, 0.55, 0.45), dx: -0.75, dy: -0.25 },
          { spec: prop('scooter', 0.22, 0.55, 0.45), dx: -1.0, dy: -0.25 },
        ],
      },
    ],
    rows: [
      {
        ...BACK_ROW,
        align: 'front',
        specs: [
          { kind: 'cowork', w: [1.6, 2.0], d: [1.3, 1.6], storeys: [2, 3], roof: 0.25 },
          { kind: 'office', w: [1.4, 1.7], d: [1.3, 1.5], storeys: [2, 3], roof: 0.15 },
        ],
        gap: [0.4, 0.9],
      },
      {
        ...FRONT_ROW,
        align: 'back',
        specs: [{ kind: 'cowork', w: [1.4, 1.8], d: [1.1, 1.4], storeys: [2, 3], roof: 0.25 }],
        gap: [0.6, 1.2],
      },
      {
        ...SHORE_ROW,
        align: 'front',
        specs: [prop('scooter', 0.22, 0.55, 0.45), BENCH, BUSH],
        gap: [0.4, 1.4],
      },
    ],
    fillers: [
      TREE,
      ROUND_TREE,
      BUSH,
      prop('pingPong', 0.85, 0.5, 0.4),
      prop('picnic', 0.8, 0.65, 0.38),
      prop('scooter', 0.22, 0.55, 0.45, { turns: true }),
      RACK,
      DISH,
    ],
    fillTries: 240,
    ground: () => 'grass',
    yard: 'paving',
  },
  // Scale-Up: downtown blocks of offices, and a crane: the company is growing.
  {
    landmarks: [
      {
        spec: { kind: 'crane', w: [2.2, 2.2], d: [1.85, 1.85], storeys: [3, 3], roof: 3.2 },
        prefer: (r) => ({ x: r.x + 6.3, y: 1.2 }),
      },
    ],
    rows: [
      {
        ...BACK_ROW,
        align: 'front',
        specs: [{ kind: 'office', w: [1.4, 2.0], d: [1.5, 2.4], storeys: [4, 6], roof: 0.2 }],
        gap: [0.25, 0.55],
      },
      {
        ...FRONT_ROW,
        align: 'back',
        specs: [{ kind: 'office', w: [1.3, 1.8], d: [1.1, 1.5], storeys: [3, 5], roof: 0.2 }],
        gap: [0.3, 0.7],
      },
      { ...SHORE_ROW, align: 'front', specs: [CAR, CAR, LAMP], gap: [0.3, 0.8] },
    ],
    fillers: [TREE, ROUND_TREE, BUSH, BUSH, RACK, ANTENNA],
    fillTries: 200,
    ground: (_x, y) => (y < STREET_FRONT + 1.5 ? 'paving' : 'grass'),
    yard: 'paving',
  },
  // Enterprise: a city of towers round the corporate HQ, and a plaza with a fountain.
  {
    landmarks: [
      {
        spec: { kind: 'hq', w: [2.5, 2.5], d: [1.9, 1.9], storeys: [12, 12], roof: 0.9 },
        prefer: (r) => ({ x: r.x + 4.2, y: 1.2 }),
      },
      {
        spec: prop('fountain', 1.3, 1.3, 0.7),
        prefer: (r, map) => {
          const near = nearNode(r, map);
          return { x: near.x + 2.2, y: near.y + 1.6 };
        },
        companions: [
          { spec: BENCH, dx: -1.0, dy: -0.4 },
          { spec: BENCH, dx: 1.0, dy: -0.4 },
        ],
      },
    ],
    rows: [
      {
        ...BACK_ROW,
        align: 'front',
        specs: [{ kind: 'tower', w: [1.4, 1.9], d: [1.6, 2.6], storeys: [8, 13], roof: 0.3 }],
        gap: [0.15, 0.35],
      },
      {
        ...FRONT_ROW,
        align: 'back',
        specs: [{ kind: 'tower', w: [1.3, 1.7], d: [1.2, 1.6], storeys: [5, 8], roof: 0.3 }],
        gap: [0.2, 0.45],
      },
      { ...SHORE_ROW, align: 'front', specs: [CAR, CAR, LAMP, PLANTER], gap: [0.3, 0.7] },
    ],
    fillers: [PLANTER, ROUND_TREE, ROUND_TREE, BUSH, RACK, RACK, ANTENNA],
    fillTries: 200,
    ground: (_x, y) => (y < 3 || y > 9 ? 'concrete' : 'paving'),
    yard: 'paving',
  },
  // Big Tech: a glass campus on a manicured lawn, and the tallest tower at the end of the road.
  {
    landmarks: [
      {
        spec: { kind: 'skyscraper', w: [2.1, 2.1], d: [1.85, 1.85], storeys: [16, 16], roof: 1.2 },
        prefer: (r) => ({ x: r.x + r.width - 1.3, y: 1.15 }),
      },
      {
        spec: { kind: 'campus', w: [3.4, 3.4], d: [2.6, 2.6], storeys: [3, 3], roof: 0.1 },
        prefer: (r) => ({ x: r.x + r.width * 0.35, y: STREET_BACK - 1.5 }),
      },
      {
        spec: prop('helipad', 1.3, 1.3, 0.08),
        prefer: (r, map) => {
          const near = nearNode(r, map);
          return { x: near.x + 2.2, y: near.y + 1.6 };
        },
      },
    ],
    rows: [
      {
        ...BACK_ROW,
        align: 'front',
        specs: [{ kind: 'glassTower', w: [1.4, 1.9], d: [1.6, 2.4], storeys: [11, 16], roof: 0.3 }],
        gap: [0.3, 0.6],
      },
      {
        ...FRONT_ROW,
        align: 'back',
        specs: [{ kind: 'glassTower', w: [1.3, 1.8], d: [1.2, 1.6], storeys: [7, 10], roof: 0.2 }],
        gap: [0.4, 0.9],
      },
      { ...SHORE_ROW, align: 'front', specs: [HEDGE, ROUND_TREE, BENCH], gap: [0.35, 0.8] },
    ],
    fillers: [ROUND_TREE, ROUND_TREE, HEDGE, BUSH, RACK, DISH],
    fillTries: 200,
    ground: () => 'lawn',
    yard: 'plaza',
  },
];

/** Street lamps along the back street's near curb, this far apart, from this chapter on. */
const CURB_LAMPS = { every: 2.4, fromChapter: 2 };

/** Extra tries for a filler kind the scatter left out. */
const MISSING_TRIES = 120;

/** Clearances, in map units. */
const CLEAR = {
  /** Between a footprint and the road's middle line (the road is 0.74 wide). */
  road: 0.72,
  /** Between a silhouette and the road's middle line: the road stays in view. */
  roadView: 0.42,
  /** Between a footprint or silhouette and a flag's foot. */
  flag: 0.5,
  /** Round a level number. */
  label: 0.12,
  /** Between two pieces. */
  piece: 0.08,
  /** Inside the land's edge. */
  shore: 0.15,
};

/** A piece's footprint. */
export function footprint(p: Pick<CityPiece, 'x' | 'y' | 'w' | 'd'>): Rect {
  return { x0: p.x - p.w / 2, y0: p.y - p.d / 2, x1: p.x + p.w / 2, y1: p.y + p.d / 2 };
}

/** The ground a piece hides from the camera: its footprint and the strip its height tips back onto. */
export function silhouette(p: Pick<CityPiece, 'x' | 'y' | 'w' | 'd' | 'h'>): Rect {
  const f = footprint(p);
  return { ...f, y0: f.y0 - p.h * SILHOUETTE };
}

function grow(r: Rect, by: number): Rect {
  return { x0: r.x0 - by, y0: r.y0 - by, x1: r.x1 + by, y1: r.y1 + by };
}

function overlaps(a: Rect, b: Rect): boolean {
  return a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
}

/** The rectangles of every level number on the map. */
export function labelRects(map: WorldMap): Rect[] {
  return markerSpots(map).map(({ label }) => ({
    x0: label.x - LABEL.width / 2,
    y0: label.y - LABEL.height / 2,
    x1: label.x + LABEL.width / 2,
    y1: label.y + LABEL.height / 2,
  }));
}

/** Small seeded random numbers (mulberry32). */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Checks where pieces may go, and remembers the ones placed. */
class Planner {
  readonly pieces: CityPiece[] = [];
  private readonly road: MapPoint[];
  private readonly feet: MapPoint[];
  private readonly labels: Rect[];

  constructor(private readonly map: WorldMap) {
    this.road = denseRoad(map);
    this.feet = markerSpots(map).map((m) => m.foot);
    this.labels = labelRects(map).map((r) => grow(r, CLEAR.label));
  }

  /** Whether `p` may stand where it is, inside `region`. */
  fits(p: CityPiece, region: MapRegion): boolean {
    const f = footprint(p);
    const s = silhouette(p);
    const land = {
      x0: Math.max(region.x, 0) + CLEAR.shore,
      x1: Math.min(region.x + region.width, this.map.width) - CLEAR.shore,
      y0: -BACKLOT + CLEAR.shore,
      y1: this.map.height - CLEAR.shore,
    };
    if (f.x0 < land.x0 || f.x1 > land.x1 || f.y0 < land.y0 || f.y1 > land.y1) return false;
    // The back street, and its turning circles.
    if (f.y1 > STREET_BACK && f.y0 < STREET_FRONT) return false;
    const grown = grow(f, CLEAR.piece);
    if (this.pieces.some((q) => overlaps(grown, footprint(q)))) return false;
    for (const point of this.road) {
      if (rectDistance(f, point) < CLEAR.road || rectDistance(s, point) < CLEAR.roadView)
        return false;
    }
    for (const foot of this.feet) if (rectDistance(s, foot) < CLEAR.flag) return false;
    for (const label of this.labels) if (overlaps(s, label)) return false;
    return true;
  }

  add(p: CityPiece): void {
    this.pieces.push(p);
  }
}

function pick<T>(rng: () => number, items: readonly T[], weight: (t: T) => number = () => 1): T {
  const total = items.reduce((n, t) => n + weight(t), 0);
  let r = rng() * total;
  for (const item of items) {
    r -= weight(item);
    if (r < 0) return item;
  }
  const last = items[items.length - 1];
  if (last === undefined) throw new Error('pick from an empty list');
  return last;
}

function between(rng: () => number, [a, b]: [number, number]): number {
  return a + (b - a) * rng();
}

/** A piece of `spec` at (x, y), sized from `rng`, `storeys` storeys high (buildings). */
function make(
  spec: Spec,
  chapter: number,
  x: number,
  y: number,
  rng: () => number,
  storeys?: number,
): CityPiece {
  const w = between(rng, spec.w);
  const d = between(rng, spec.d);
  const s = storeys ?? Math.round(between(rng, spec.storeys));
  const h = spec.h ? between(rng, spec.h) : s * STOREY + (spec.roof ?? 0);
  const yaw = spec.turns ? (rng() - 0.5) * Math.PI : 0;
  return { kind: spec.kind, chapter, x, y, w, d, h, storeys: s, yaw, variant: rng() };
}

/** `p` with fewer storeys, or null when it can't lose any. */
function lower(p: CityPiece, spec: Spec): CityPiece | null {
  if (spec.h || p.storeys <= spec.storeys[0]) return null;
  return { ...p, storeys: p.storeys - 1, h: p.h - STOREY };
}

/** The city plan for `map`: set pieces and ground for each chapter's region. */
export function planCity(map: WorldMap): CityPlan {
  const planner = new Planner(map);
  for (const region of map.regions) {
    const theme = THEMES[Math.min(region.chapter, THEMES.length - 1)];
    if (!theme) continue;
    const rng = seeded(0x51ab + region.chapter * 7919);
    for (const landmark of theme.landmarks) placeLandmark(planner, region, landmark, rng, map);
    if (region.chapter >= CURB_LAMPS.fromChapter) {
      for (let x = region.x + 0.6; x < region.x + region.width; x += CURB_LAMPS.every) {
        // Facing the street.
        const lamp = { ...make(LAMP, region.chapter, x, STREET_FRONT + 0.15, rng), yaw: Math.PI };
        if (planner.fits(lamp, region)) planner.add(lamp);
      }
    }
    for (const row of theme.rows) placeRow(planner, region, row, rng);
    for (let i = 0; i < theme.fillTries; i++) {
      const spec = pick(rng, theme.fillers, (s) => s.weight ?? 1);
      const x = region.x + rng() * region.width;
      const y = -BACKLOT + rng() * (map.height + BACKLOT);
      const p = make(spec, region.chapter, x, y, rng);
      if (planner.fits(p, region)) planner.add(p);
    }
    // Every kind of filler shows up at least once: one the scatter missed (the road
    // took its spots) gets more tries of its own.
    for (const spec of theme.fillers) {
      const has = (q: CityPiece) => q.kind === spec.kind && q.chapter === region.chapter;
      for (let i = 0; i < MISSING_TRIES && !planner.pieces.some(has); i++) {
        const x = region.x + rng() * region.width;
        const y = -BACKLOT + rng() * (map.height + BACKLOT);
        const p = make(spec, region.chapter, x, y, rng);
        if (planner.fits(p, region)) planner.add(p);
      }
    }
  }
  return { pieces: planner.pieces, ground: planGround(map, planner.pieces) };
}

function placeLandmark(
  planner: Planner,
  region: MapRegion,
  landmark: Landmark,
  rng: () => number,
  map: WorldMap,
): void {
  const want = landmark.prefer(region, map);
  const base = make(landmark.spec, region.chapter, want.x, want.y, rng);
  // Spots round the wanted one, nearest first.
  const spots: MapPoint[] = [];
  for (let dy = -4; dy <= 4; dy += 0.25) {
    for (let dx = -4; dx <= 4; dx += 0.25) spots.push({ x: want.x + dx, y: want.y + dy });
  }
  spots.sort(
    (a, b) => Math.hypot(a.x - want.x, a.y - want.y) - Math.hypot(b.x - want.x, b.y - want.y),
  );
  for (const spot of spots) {
    let p: CityPiece | null = { ...base, x: spot.x, y: spot.y };
    while (p && !planner.fits(p, region)) p = lower(p, landmark.spec);
    if (!p) continue;
    planner.add(p);
    for (const c of landmark.companions ?? []) {
      // Where it wants to be, else mirrored to the other side, else a little further out.
      const q = make(c.spec, region.chapter, 0, 0, rng);
      const spots = [
        { dx: c.dx, dy: c.dy },
        { dx: -c.dx, dy: c.dy },
        { dx: c.dx, dy: c.dy + 0.4 },
        { dx: -c.dx, dy: c.dy + 0.4 },
      ];
      for (const { dx, dy } of spots) {
        const at = { ...q, x: p.x + dx, y: p.y + p.d / 2 + dy };
        if (!planner.fits(at, region)) continue;
        planner.add(at);
        break;
      }
    }
    return;
  }
}

function placeRow(planner: Planner, region: MapRegion, row: Row, rng: () => number): void {
  let x = region.x + CLEAR.shore + rng() * 0.4;
  const end = region.x + region.width;
  while (x < end) {
    const spec = pick(rng, row.specs, (s) => s.weight ?? 1);
    let p: CityPiece | null = make(spec, region.chapter, 0, 0, rng);
    const d = Math.min(p.d, row.to - row.from);
    const y = row.align === 'back' ? row.from + d / 2 : row.to - d / 2;
    p = { ...p, d, x: x + p.w / 2, y };
    while (p && !planner.fits(p, region)) p = lower(p, spec);
    if (!p) {
      x += 0.25;
      continue;
    }
    planner.add(p);
    if (row.fences && p.kind === 'house') {
      const fence = make(
        prop('fence', p.w + 0.3, 0.08, 0.3),
        region.chapter,
        p.x,
        p.y + p.d / 2 + 0.22,
        rng,
      );
      if (planner.fits(fence, region)) planner.add(fence);
    }
    x += p.w + between(rng, row.gap);
  }
}

/** Each land tile's ground, the back lot included: the theme's, paved round buildings and on the street. */
function planGround(map: WorldMap, pieces: readonly CityPiece[]): GroundTile[] {
  const tiles: GroundTile[] = [];
  for (const region of map.regions) {
    const theme = THEMES[Math.min(region.chapter, THEMES.length - 1)];
    for (let y = -BACKLOT; y < map.height; y++) {
      for (let x = region.x; x < region.x + region.width; x++) {
        let kind: GroundKind = theme?.ground(x, y) ?? 'grass';
        const center = { x: x + 0.5, y: y + 0.5 };
        if (y === STREET.row) kind = 'asphalt';
        else {
          const yard = pieces.find(
            (p) => isBuilding(p.kind) && rectDistance(footprint(p), center) < 0.45,
          );
          if (yard && theme) kind = theme.yard;
          const plaza = pieces.find(
            (p) => p.kind === 'fountain' && rectDistance(footprint(p), center) < 1.1,
          );
          if (plaza) kind = 'plaza';
        }
        tiles.push({ x, y, kind, chapter: region.chapter });
      }
    }
  }
  return tiles;
}

/** A point on the back street's loop, and which way a car there faces (map units). */
export interface StreetSpot {
  x: number;
  y: number;
  /** Heading as a yaw: 0 drives toward the camera (+y), π/2 to the right (+x). */
  yaw: number;
}

/** The back street's loop for an island `width` wide: right along the near lane, round, back along the far one. */
export function streetLoop(width: number): {
  length: number;
  at: (distance: number) => StreetSpot;
} {
  const c = STREET.row + 0.5;
  const r = STREET.laneOffset;
  const x0 = STREET.end;
  const x1 = Math.max(x0, width - STREET.end);
  const straight = x1 - x0;
  const arc = Math.PI * r;
  const length = 2 * straight + 2 * arc;
  const at = (distance: number): StreetSpot => {
    let s = ((distance % length) + length) % length;
    if (s < straight) return { x: x0 + s, y: c + r, yaw: Math.PI / 2 };
    s -= straight;
    if (s < arc) {
      const theta = Math.PI / 2 - (s / arc) * Math.PI;
      return {
        x: x1 + r * Math.cos(theta),
        y: c + r * Math.sin(theta),
        yaw: Math.atan2(Math.sin(theta), -Math.cos(theta)),
      };
    }
    s -= arc;
    if (s < straight) return { x: x1 - s, y: c - r, yaw: -Math.PI / 2 };
    s -= straight;
    const theta = -Math.PI / 2 - (s / arc) * Math.PI;
    return {
      x: x0 + r * Math.cos(theta),
      y: c + r * Math.sin(theta),
      yaw: Math.atan2(Math.sin(theta), -Math.cos(theta)),
    };
  };
  return { length, at };
}
