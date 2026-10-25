/**
 * The world map behind the level select, as plain data: where each level's
 * flag stands, the road that winds through them in level order, each
 * chapter's stretch of land and the gate where the road enters it. Map
 * units are like a level grid: x runs right, y toward the camera (down on
 * screen). The chapters sit side by side, left to right: the road trip from
 * the garage to Big Tech.
 *
 * The layout follows from the chapters alone (how many there are and how
 * many levels each has) and a fixed seed, so the flow's cursor, the server
 * and the renderer all see the same map, and tests can use made-up
 * chapters. The seed gives every stretch of road its own shape: flags at
 * all sorts of heights, curves, S-bends, sweeps and dips, never a zigzag
 * that repeats chapter after chapter.
 *
 * `mapCursor` is the level select's cursor: a direction press drives to the
 * neighbouring level along the road that lies that way.
 */

import { Rng } from '../sim/rng';
import type { FlowContext } from './flow';
import type { ChapterInfo } from './save';

export interface MapPoint {
  x: number;
  y: number;
}

/** A chapter's land: a rectangle of whole map tiles. */
export interface MapRegion {
  chapter: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Where the road crosses into a chapter (every chapter but the first). */
export interface MapGate {
  chapter: number;
  at: MapPoint;
  /** The road waypoint just past the border. */
  waypoint: number;
}

export interface WorldMap {
  /** The whole island, in map tiles. */
  width: number;
  height: number;
  /** Every level's id, in road order (chapter by chapter). */
  levelIds: readonly string[];
  /** Each level's flag, in the same order as `levelIds`. */
  nodes: readonly MapPoint[];
  /** The chapter each node is in. */
  nodeChapters: readonly number[];
  /** The road from the left shore to the right one, through every node. */
  road: readonly MapPoint[];
  /** For each node, its index in `road`. */
  nodeWaypoints: readonly number[];
  regions: readonly MapRegion[];
  /** One per chapter after the first, in chapter order. */
  gates: readonly MapGate[];
}

/** Map tiles per level along a chapter: its flags stand about this far apart. */
const LEVEL_SPACING = 3;
/**
 * How far a flag may stand left or right of its even spacing. The first and
 * last flag of a chapter only move inward, away from the chapter's border.
 */
const NODE_JITTER = 0.35;
/** The island's depth, in map tiles. */
const MAP_HEIGHT = 12;
/**
 * The band the flags stand in: the flags and numbers beside the road stay
 * clear of the city's rows behind them and of the near shore's strip.
 */
const NODE_Y = { min: 3.8, max: 8.2 };
/**
 * How much higher or lower each flag stands than the one before it: at
 * least enough for up or down to drive there (see `CURSOR_MIN_DOT`).
 */
const NODE_STEP = { min: 1.2, max: 2.4 };
/**
 * The first flag stands this far up from the band's near edge at most: by
 * the garage, in front of the road, where the van parked on its stop
 * doesn't hide its number.
 */
const FIRST_ROW_DEPTH = 1.2;
/** How often a flag steps the same way (up or down) as the one before. */
const NODE_KEEP_GOING = 0.6;
/** The band the road keeps to, its bends included. */
const ROAD_Y = { min: 3, max: 9.1 };
/** The road runs left to right: every waypoint at least this far right of the one before. */
const ROAD_MIN_STEP = 0.02;
/** The road's tightest turn: no sharp corners, at the flags or between them. */
const ROAD_MIN_RADIUS = 0.35;
/**
 * The road never turns back toward a flag: further than `along` from a
 * flag along the road, it keeps at least `gap` away from it.
 */
const ROAD_CLEAR = { along: 2.6, gap: 2 };
/**
 * The shapes a stretch between two flags can take, with how often each
 * comes up. Each bend lies `at` the way along the straight line, pushed
 * `off` it sideways (to either side) and `lift` up or down the map.
 */
const STRETCH_SHAPES: readonly {
  weight: number;
  bends: readonly {
    at: [number, number];
    off: [number, number];
    lift: [number, number];
    flip?: boolean;
  }[];
}[] = [
  // One bend: a plain curve, gentle or deep.
  { weight: 3, bends: [{ at: [0.38, 0.62], off: [0.5, 1.4], lift: [0, 0] }] },
  // Nearly straight.
  { weight: 1.5, bends: [{ at: [0.4, 0.6], off: [0, 0.3], lift: [0, 0] }] },
  // An S: a bend one way, then the other.
  {
    weight: 2,
    bends: [
      { at: [0.28, 0.38], off: [0.55, 1], lift: [0, 0] },
      { at: [0.62, 0.72], off: [0.55, 1], lift: [0, 0], flip: true },
    ],
  },
  // A long sweep: two bends to the same side.
  {
    weight: 1.5,
    bends: [
      { at: [0.28, 0.36], off: [0.6, 1.1], lift: [0, 0] },
      { at: [0.64, 0.72], off: [0.6, 1.1], lift: [0, 0] },
    ],
  },
  // A dip: the road swings down or up the map between the two flags.
  { weight: 1.5, bends: [{ at: [0.4, 0.6], off: [0, 0.2], lift: [0.9, 1.7] }] },
];
/** How often a stretch's (first) bend goes to the left of the way (else the right). */
const BEND_LEFT = 0.5;
/** How often a dip swings up the map (else down). */
const BEND_UP = 0.5;
/** Shapes tried per stretch before it settles for the least bad one. */
const LAYOUT_TRIES = 24;
/** A stand-in for stretches not laid yet: one shallow bend. */
const SAFE_STRETCH: Stretch = [{ at: 0.5, off: 0.3, lift: 0 }];
/**
 * The layout's fixed seed, mixed with the chapters' sizes: picked because
 * the campaign's map looks good with it. A new chapter or level reshapes
 * the map; if the world map tests then fail, try another seed.
 */
const LAYOUT_SEED = 84;
/** Road waypoints per stretch between two control points. */
const ROAD_SAMPLES = 6;
/** Where the road starts and ends: this far in from the island's left and right shores. */
const ROAD_SHORE = 1;
/** The steepest the road runs off to the shore at either end (map y per x). */
const SHORE_SLOPE = 0.5;
/** How well a press has to point at a level to drive there (cosine of the angle). */
const CURSOR_MIN_DOT = 0.3;

/** A flag's height, and which way (up -1 or down 1) it stepped from the one before. */
interface Row {
  y: number;
  dir: number;
}

/** A bend on a stretch: `at` the way along its straight line, `off` to its right (left when negative), `lift` down the map (up when negative), in map units. */
interface Bend {
  at: number;
  off: number;
  lift: number;
}
/** The road's shape between two neighbouring flags. */
type Stretch = readonly Bend[];

/**
 * The world map for `chapters`, laid out left to right. Flag heights,
 * spacing and the road's bends come from a fixed seed mixed with the
 * chapters' sizes, so every stretch has its own shape and the same
 * chapters always give the same map. (Tests try other seeds.)
 */
export function buildWorldMap(chapters: readonly ChapterInfo[], seed = LAYOUT_SEED): WorldMap {
  const rng = new Rng(layoutSeed(chapters, seed));
  const levelIds: string[] = [];
  const nodes: MapPoint[] = [];
  const nodeChapters: number[] = [];
  const regions: MapRegion[] = [];
  let x0 = 0;
  let row: Row | null = null;
  chapters.forEach((chapter, c) => {
    const count = Math.max(1, chapter.levelIds.length);
    const width = count * LEVEL_SPACING;
    regions.push({ chapter: c, x: x0, y: 0, width, height: MAP_HEIGHT });
    chapter.levelIds.forEach((id, k) => {
      let jitter = (rng.next() * 2 - 1) * NODE_JITTER;
      if (k === 0) jitter = Math.abs(jitter);
      // The very first flag keeps clear of the island's corner, where the title's view ends.
      if (c === 0 && k === 0) jitter = NODE_JITTER;
      if (k === chapter.levelIds.length - 1) jitter = k === 0 ? 0 : -Math.abs(jitter);
      row = nextRow(rng, row);
      levelIds.push(id);
      nodes.push({ x: x0 + LEVEL_SPACING / 2 + k * LEVEL_SPACING + jitter, y: row.y });
      nodeChapters.push(c);
    });
    x0 += width;
  });
  const width = x0;
  const { road, nodeWaypoints } = layRoad(nodes, width, rng);
  const gates: MapGate[] = [];
  for (const region of regions) {
    if (region.chapter === 0) continue;
    const gate = crossing(road, region.x);
    if (gate) gates.push({ chapter: region.chapter, ...gate });
  }
  return {
    width,
    height: MAP_HEIGHT,
    levelIds,
    nodes,
    nodeChapters,
    road,
    nodeWaypoints,
    regions,
    gates,
  };
}

/** The layout's seed: `LAYOUT_SEED` mixed with how many levels each chapter has. */
function layoutSeed(chapters: readonly ChapterInfo[], seed: number): number {
  let h = seed;
  for (const chapter of chapters) {
    h = Math.imul(h ^ chapter.levelIds.length, 0x9e3779b1);
    h ^= h >>> 15;
  }
  return h >>> 0;
}

/** A number between `min` and `max`. */
function between(rng: Rng, [min, max]: readonly [number, number]): number {
  return min + rng.next() * (max - min);
}

/**
 * The next flag after one at `last` (or the first flag, near the front by
 * the garage, with `null`): a step up or down the map, often the same way
 * as the step before, so the road climbs or drops over a few flags instead
 * of zigzagging. A step that
 * doesn't fit the band is cut short, or turns round when too little is left.
 */
function nextRow(rng: Rng, last: Row | null): Row {
  if (last === null) return { y: between(rng, [NODE_Y.max - FIRST_ROW_DEPTH, NODE_Y.max]), dir: 1 };
  const step = between(rng, [NODE_STEP.min, NODE_STEP.max]);
  const room = (dir: number): number => (dir < 0 ? last.y - NODE_Y.min : NODE_Y.max - last.y);
  let dir = rng.next() < NODE_KEEP_GOING ? last.dir : -last.dir;
  if (room(dir) < NODE_STEP.min) dir = -dir;
  return { y: last.y + dir * Math.min(step, room(dir)), dir };
}

/** A random stretch shape, picked by weight. */
function rollStretch(rng: Rng): Stretch {
  const total = STRETCH_SHAPES.reduce((n, s) => n + s.weight, 0);
  let r = rng.next() * total;
  const shape = STRETCH_SHAPES.find((s) => (r -= s.weight) < 0) ?? STRETCH_SHAPES[0];
  const side = rng.next() < BEND_LEFT ? -1 : 1;
  const lift = rng.next() < BEND_UP ? -1 : 1;
  return (shape?.bends ?? []).map((b) => ({
    at: between(rng, b.at),
    off: between(rng, b.off) * side * (b.flip ? -1 : 1),
    lift: between(rng, b.lift) * lift,
  }));
}

/**
 * The road through `nodes`, laid stretch by stretch from left to right:
 * each stretch between two flags gets a random shape, rolled again while
 * the road there breaks a rule (see `faults`). When no shape fits, the
 * stretch before it is rolled again along with it (a sharp turn at a flag
 * can come from either side). A stretch that still fails keeps its least
 * bad shape.
 */
function layRoad(
  nodes: readonly MapPoint[],
  width: number,
  rng: Rng,
): { road: MapPoint[]; nodeWaypoints: number[] } {
  const stretches: Stretch[] = nodes.slice(1).map(() => SAFE_STRETCH);
  /**
   * The faults on the road stretches `first` to `last` shape: from the last span
   * before their first flag (checked before with a stand-in for them) to the turn at
   * their last flag (with a stand-in for the next stretch, which checks it again),
   * or to the road's end for the last stretch.
   */
  const score = (first: number, last: number): number => {
    const { road, nodeWaypoints } = buildRoad(nodes, width, stretches);
    const from = (nodeWaypoints[first] ?? 0) - ROAD_SAMPLES;
    const to = last === stretches.length - 1 ? road.length : (nodeWaypoints[last + 1] ?? 0) + 1;
    return faults(road, nodeWaypoints, nodes, from, to);
  };
  /** Rolls stretches `first` to `last` together, keeping their least faulty shapes (or the ones they had). */
  const settle = (first: number, last: number, keep: boolean): number => {
    let best = {
      shapes: stretches.slice(first, last + 1),
      faults: keep ? score(first, last) : Infinity,
    };
    for (let tries = 0; tries < LAYOUT_TRIES && best.faults !== 0; tries++) {
      for (let s = first; s <= last; s++) stretches[s] = rollStretch(rng);
      const count = score(first, last);
      if (count < best.faults) best = { shapes: stretches.slice(first, last + 1), faults: count };
    }
    best.shapes.forEach((shape, k) => (stretches[first + k] = shape));
    return best.faults;
  };
  for (let i = 0; i < stretches.length; i++) {
    if (settle(i, i, false) > 0 && i > 0) settle(i - 1, i, true);
  }
  return buildRoad(nodes, width, stretches);
}

/**
 * The road: a smooth curve through the flags and the bends of each
 * stretch between them, from the left shore to the right one.
 */
function buildRoad(
  nodes: readonly MapPoint[],
  width: number,
  stretches: readonly Stretch[],
): { road: MapPoint[]; nodeWaypoints: number[] } {
  const first = nodes[0];
  const last = nodes[nodes.length - 1];
  if (!first || !last) return { road: [], nodeWaypoints: [] };
  // Control points: flag, its stretch's bends, flag, ..., flag; then a shore at each end.
  const inner: MapPoint[] = [];
  const nodeControls: number[] = [];
  nodes.forEach((node, i) => {
    nodeControls.push(inner.length + 1);
    inner.push(node);
    const next = nodes[i + 1];
    if (next) for (const b of stretches[i] ?? SAFE_STRETCH) inner.push(bendPoint(node, next, b));
  });
  const start = shore(first, inner[1], ROAD_SHORE);
  const end = shore(last, inner[inner.length - 2], width - ROAD_SHORE);
  const controls = [start, ...inner, end];

  const road: MapPoint[] = [];
  for (let i = 0; i < controls.length - 1; i++) {
    const p0 = controls[i - 1] ?? controls[i];
    const p1 = controls[i];
    const p2 = controls[i + 1];
    const p3 = controls[i + 2] ?? p2;
    if (!p0 || !p1 || !p2 || !p3) continue;
    for (let s = 0; s < ROAD_SAMPLES; s++) road.push(catmullRom(p0, p1, p2, p3, s / ROAD_SAMPLES));
  }
  road.push({ ...end });
  return { road, nodeWaypoints: nodeControls.map((c) => c * ROAD_SAMPLES) };
}

/**
 * Where the road meets the shore at `x`, coming from the flag `node` at
 * the road's end: on the line from the control point `inward` through the
 * flag (but no steeper than `SHORE_SLOPE`), so the road runs on straight
 * off the map instead of swinging round.
 */
function shore(node: MapPoint, inward: MapPoint | undefined, x: number): MapPoint {
  if (!inward || inward.x === node.x) return { x, y: node.y };
  const slope = (node.y - inward.y) / (node.x - inward.x);
  const held = Math.min(Math.max(slope, -SHORE_SLOPE), SHORE_SLOPE);
  return { x, y: node.y + held * (x - node.x) };
}

/** The bend `b` on the stretch from `a` to `c`. */
function bendPoint(a: MapPoint, c: MapPoint, b: Bend): MapPoint {
  const dx = c.x - a.x;
  const dy = c.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  return {
    x: a.x + dx * b.at - (dy / len) * b.off,
    y: a.y + dy * b.at + (dx / len) * b.off + b.lift,
  };
}

/**
 * How many times the road's waypoints `from` to `to` (exclusive) break a
 * rule: running backward, leaving the road's band, turning too sharply, or
 * coming back near a flag.
 */
export function faults(
  road: readonly MapPoint[],
  nodeWaypoints: readonly number[],
  nodes: readonly MapPoint[],
  from = 0,
  to = road.length,
): number {
  const along: number[] = [];
  road.forEach((p, w) => {
    const prev = road[w - 1];
    along.push(prev ? (along[w - 1] ?? 0) + Math.hypot(p.x - prev.x, p.y - prev.y) : 0);
  });
  let count = 0;
  for (let w = Math.max(0, from); w < Math.min(to, road.length); w++) {
    const p = road[w];
    if (!p) continue;
    const prev = road[w - 1];
    const next = road[w + 1];
    if (p.y < ROAD_Y.min || p.y > ROAD_Y.max) count++;
    if (prev && p.x - prev.x <= ROAD_MIN_STEP) count++;
    if (prev && next && turnRadius(prev, p, next) < ROAD_MIN_RADIUS) count++;
    nodes.forEach((node, i) => {
      const at = along[nodeWaypoints[i] ?? 0] ?? 0;
      if (Math.abs((along[w] ?? 0) - at) <= ROAD_CLEAR.along) return;
      if (Math.hypot(p.x - node.x, p.y - node.y) < ROAD_CLEAR.gap) count++;
    });
  }
  return count;
}

/** How tightly the road turns at `b`, coming from `a` and going on to `c`: the radius of that turn. */
function turnRadius(a: MapPoint, b: MapPoint, c: MapPoint): number {
  let turn = Math.abs(Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(b.y - a.y, b.x - a.x));
  if (turn > Math.PI) turn = 2 * Math.PI - turn;
  const length = (Math.hypot(b.x - a.x, b.y - a.y) + Math.hypot(c.x - b.x, c.y - b.y)) / 2;
  return turn > 1e-9 ? length / turn : Infinity;
}

/**
 * Centripetal Catmull-Rom between `p1` and `p2`; `t` = 0 is `p1`. Unlike
 * the uniform kind it never loops or kinks where control points bunch up.
 */
function catmullRom(p0: MapPoint, p1: MapPoint, p2: MapPoint, p3: MapPoint, t: number): MapPoint {
  if (t === 0) return { ...p1 };
  const knot = (a: MapPoint, b: MapPoint): number =>
    Math.max(Math.sqrt(Math.hypot(b.x - a.x, b.y - a.y)), 1e-4);
  const t1 = knot(p0, p1);
  const t2 = t1 + knot(p1, p2);
  const t3 = t2 + knot(p2, p3);
  const u = t1 + (t2 - t1) * t;
  const mix = (a: MapPoint, b: MapPoint, from: number, to: number): MapPoint => {
    const k = (u - from) / (to - from);
    return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
  };
  const a1 = mix(p0, p1, 0, t1);
  const a2 = mix(p1, p2, t1, t2);
  const a3 = mix(p2, p3, t2, t3);
  const b1 = mix(a1, a2, 0, t2);
  const b2 = mix(a2, a3, t1, t3);
  return mix(b1, b2, t1, t2);
}

/** Where the road first crosses x = `x` going right. */
function crossing(road: readonly MapPoint[], x: number): Omit<MapGate, 'chapter'> | null {
  for (let i = 1; i < road.length; i++) {
    const a = road[i - 1];
    const b = road[i];
    if (!a || !b || a.x >= x || b.x < x) continue;
    const t = (x - a.x) / (b.x - a.x);
    return { at: { x, y: a.y + (b.y - a.y) * t }, waypoint: i };
  }
  return null;
}

let cached: { chapters: readonly ChapterInfo[]; map: WorldMap } | null = null;

/** `buildWorldMap`, kept for the last chapter list asked for (the game always asks with the same one). */
export function worldMapFor(chapters: readonly ChapterInfo[]): WorldMap {
  if (cached?.chapters !== chapters) cached = { chapters, map: buildWorldMap(chapters) };
  return cached.map;
}

/** The road from node `from` to node `to` (either way round), both ends included. */
export function roadBetween(map: WorldMap, from: number, to: number): MapPoint[] {
  const a = map.nodeWaypoints[from];
  const b = map.nodeWaypoints[to];
  if (a === undefined || b === undefined) return [];
  const stretch = map.road.slice(Math.min(a, b), Math.max(a, b) + 1);
  return a <= b ? stretch : stretch.reverse();
}

/** The node of level `levelId`, or -1 when the map has none. */
export function nodeIndexOf(map: WorldMap, levelId: string): number {
  return map.levelIds.indexOf(levelId);
}

/**
 * The level select cursor moved from level `index` with a press toward
 * screen direction (x, y): to the previous or next level along the road,
 * whichever lies that way. Left and right fall back to the previous and next
 * level, so they always walk the whole road; up or down with no level that
 * way stays put. Returns the new level index.
 */
export function mapCursor(ctx: FlowContext, index: number, x: number, y: number): number {
  const { levelIds } = ctx;
  const last = levelIds.length - 1;
  const fallback = Math.min(Math.max(index + Math.sign(x), 0), Math.max(last, 0));
  const map = worldMapFor(ctx.chapters);
  const here = nodeAt(map, levelIds[index]);
  const press = Math.hypot(x, y);
  if (!here || press === 0) return fallback;
  let best = index;
  let bestDot = CURSOR_MIN_DOT;
  for (const candidate of [index - 1, index + 1]) {
    if (candidate < 0 || candidate > last) continue;
    const there = nodeAt(map, levelIds[candidate]);
    if (!there) continue;
    const dx = there.x - here.x;
    const dy = there.y - here.y;
    const dot = (dx * x + dy * y) / ((Math.hypot(dx, dy) || 1) * press);
    if (dot > bestDot) {
      best = candidate;
      bestDot = dot;
    }
  }
  return best !== index || x === 0 ? best : fallback;
}

function nodeAt(map: WorldMap, levelId: string | undefined): MapPoint | undefined {
  return levelId === undefined ? undefined : map.nodes[map.levelIds.indexOf(levelId)];
}
