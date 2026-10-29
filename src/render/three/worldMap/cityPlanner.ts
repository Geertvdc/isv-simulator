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
import { markerSpots } from './markers';
import {
  BACKLOT,
  type CityPiece,
  type CityPlan,
  type GroundKind,
  type GroundTile,
  NEIGHBOUR,
  type PieceKind,
  STOREY,
  STREET,
  STYLES,
  TREE_KINDS,
  footprint,
  isBuilding,
  labelRects,
  silhouette,
  styleOf,
  seeded,
} from './cityPlan';
import {
  type Landmark,
  LAMP,
  type Row,
  type Spec,
  STREET_BACK,
  STREET_FRONT,
  THEMES,
  prop,
} from './cityThemes';

/** Street lamps along the back street's near curb, this far apart, from this chapter on. */
const CURB_LAMPS = { every: 2.4, fromChapter: 2 };

/** Fillers of a kind closer than this to each other count as a clump. */
const CLUMP = 1.1;
/** Most scattered small props (not trees) of one kind in a chapter: a few dishes, not a dish farm. */
const SMALL_CAP = 4;
const trees: readonly PieceKind[] = TREE_KINDS;

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

function grow(r: Rect, by: number): Rect {
  return { x0: r.x0 - by, y0: r.y0 - by, x1: r.x1 + by, y1: r.y1 + by };
}

function overlaps(a: Rect, b: Rect): boolean {
  return a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
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

  /** Places `p`, restyled so it doesn't look like the pieces of its kind next to it. */
  add(p: CityPiece): CityPiece {
    const placed = restyle(p, this.pieces);
    this.pieces.push(placed);
    return placed;
  }

  /** How many pieces of `kind` chapter `chapter` has so far. */
  count(kind: PieceKind, chapter: number): number {
    return this.pieces.filter((q) => q.kind === kind && q.chapter === chapter).length;
  }

  /** A piece of `kind` within `radius` of (x, y): to keep the same kind from clumping. */
  near(kind: PieceKind, x: number, y: number, radius: number): boolean {
    return this.pieces.some((q) => q.kind === kind && Math.hypot(q.x - x, q.y - y) < radius);
  }
}

/**
 * `p` in the style its neighbours of the same kind use least (never the
 * nearest one's), and the chapter so far uses least, keeping the rest of its
 * variant: two houses side by side get different roofs, two offices
 * different windows, and a chapter shows off all its styles.
 */
function restyle(p: CityPiece, pieces: readonly CityPiece[]): CityPiece {
  const n = STYLES[p.kind] ?? 1;
  if (n < 2) return p;
  const kin = pieces.filter((q) => q.kind === p.kind);
  const weight = Array.from({ length: n }, () => 0);
  let nearest: { q: CityPiece; d: number } | null = null;
  for (const q of kin) {
    const d = Math.hypot(q.x - p.x, q.y - p.y);
    const s = styleOf(q);
    const balance = q.chapter === p.chapter ? 0.15 : 0;
    weight[s] = (weight[s] ?? 0) + balance + (d < NEIGHBOUR ? 1 / (0.5 + d) : 0);
    if (d < NEIGHBOUR && (!nearest || d < nearest.d)) nearest = { q, d };
  }
  if (nearest) weight[styleOf(nearest.q)] = Infinity;
  const own = styleOf(p);
  let best = own;
  for (let t = 0; t < n; t++) {
    const s = (own + t) % n;
    if ((weight[s] ?? 0) < (weight[best] ?? 0)) best = s;
  }
  if (best === own) return p;
  // The same place inside the style's slice of [0, 1), so its colors and details still vary.
  const within = p.variant * n - own;
  return { ...p, variant: (best + within) / n };
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
      const x = region.x + rng() * region.width;
      const y = -BACKLOT + rng() * (map.height + BACKLOT);
      // Not the same kind as a piece right by it, nor a small prop the chapter has enough of.
      const full = (kind: PieceKind) =>
        !trees.includes(kind) && planner.count(kind, region.chapter) >= SMALL_CAP;
      let spec = pick(rng, theme.fillers, (s) => s.weight ?? 1);
      for (let t = 0; t < 4 && (full(spec.kind) || planner.near(spec.kind, x, y, CLUMP)); t++) {
        spec = pick(rng, theme.fillers, (s) => s.weight ?? 1);
      }
      if (full(spec.kind)) continue;
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
  let last: PieceKind | null = null;
  while (x < end) {
    let spec = pick(rng, row.specs, (s) => s.weight ?? 1);
    // Not the same kind twice running, where the row has others.
    for (let t = 0; t < 3 && spec.kind === last; t++) {
      spec = pick(rng, row.specs, (s) => s.weight ?? 1);
    }
    let p: CityPiece | null = make(spec, region.chapter, 0, 0, rng);
    const d = Math.min(p.d, row.to - row.from);
    const y = row.align === 'back' ? row.from + d / 2 : row.to - d / 2;
    p = { ...p, d, x: x + p.w / 2, y };
    while (p && !planner.fits(p, region)) p = lower(p, spec);
    if (!p) {
      x += 0.25;
      continue;
    }
    p = planner.add(p);
    last = p.kind;
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
