/**
 * The world map behind the level select, as plain data: where each level's
 * flag stands, the road that winds through them in level order, each
 * chapter's stretch of land and the gate where the road enters it. Map
 * units are like a level grid: x runs right, y toward the camera (down on
 * screen). The chapters sit side by side, left to right: the road trip from
 * the garage to Big Tech.
 *
 * The layout follows from the chapters alone (how many there are and how
 * many levels each has), so the flow's cursor, the server and the renderer
 * all see the same map, and tests can use made-up chapters.
 *
 * `mapCursor` is the level select's cursor: a direction press drives to the
 * neighbouring level along the road that lies that way.
 */

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

/** Map tiles between two flags of a chapter, left to right. */
const LEVEL_SPACING = 3;
/** The island's depth, in map tiles. */
const MAP_HEIGHT = 12;
/**
 * Flag heights within a chapter, by place in it: the road zigzags up and
 * down. Odd chapters mirror it, so the road snakes on across the border.
 */
const NODE_ROWS = [8, 4, 7.5, 4.5];
/** How far the road swings off the straight line between two flags. */
const ROAD_BEND = 0.9;
/** Road waypoints per stretch between two control points. */
const ROAD_SAMPLES = 6;
/** Where the road starts and ends: this far in from the island's left and right shores. */
const ROAD_SHORE = 1;
/** How well a press has to point at a level to drive there (cosine of the angle). */
const CURSOR_MIN_DOT = 0.3;

/** The world map for `chapters`, laid out left to right. */
export function buildWorldMap(chapters: readonly ChapterInfo[]): WorldMap {
  const levelIds: string[] = [];
  const nodes: MapPoint[] = [];
  const nodeChapters: number[] = [];
  const regions: MapRegion[] = [];
  let x0 = 0;
  chapters.forEach((chapter, c) => {
    const count = Math.max(1, chapter.levelIds.length);
    const width = count * LEVEL_SPACING;
    regions.push({ chapter: c, x: x0, y: 0, width, height: MAP_HEIGHT });
    chapter.levelIds.forEach((id, k) => {
      const row = NODE_ROWS[k % NODE_ROWS.length] ?? MAP_HEIGHT / 2;
      levelIds.push(id);
      nodes.push({
        x: x0 + LEVEL_SPACING / 2 + k * LEVEL_SPACING,
        y: c % 2 === 0 ? row : MAP_HEIGHT - row,
      });
      nodeChapters.push(c);
    });
    x0 += width;
  });
  const width = x0;
  const { road, nodeWaypoints } = buildRoad(nodes, width);
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

/**
 * The road: a smooth curve through the flags, with a bend between each two
 * so it winds, from the left shore to the right one.
 */
function buildRoad(
  nodes: readonly MapPoint[],
  width: number,
): { road: MapPoint[]; nodeWaypoints: number[] } {
  const first = nodes[0];
  const last = nodes[nodes.length - 1];
  if (!first || !last) return { road: [], nodeWaypoints: [] };
  // Control points: shore, flag, bend, flag, bend, ..., flag, shore.
  const controls: MapPoint[] = [{ x: ROAD_SHORE, y: first.y }];
  const nodeControls: number[] = [];
  nodes.forEach((node, i) => {
    nodeControls.push(controls.length);
    controls.push(node);
    const next = nodes[i + 1];
    if (next) controls.push(bend(node, next, i % 2 === 0 ? 1 : -1));
  });
  const end = { x: width - ROAD_SHORE, y: last.y };
  controls.push(end);

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

/** The point halfway from `a` to `b`, pushed `side` × `ROAD_BEND` off the line. */
function bend(a: MapPoint, b: MapPoint, side: number): MapPoint {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  return {
    x: (a.x + b.x) / 2 - (dy / len) * ROAD_BEND * side,
    y: (a.y + b.y) / 2 + (dx / len) * ROAD_BEND * side,
  };
}

/** Uniform Catmull-Rom between `p1` and `p2`; `t` = 0 is `p1`. */
function catmullRom(p0: MapPoint, p1: MapPoint, p2: MapPoint, p3: MapPoint, t: number): MapPoint {
  const t2 = t * t;
  const t3 = t2 * t;
  const along = (a: number, b: number, c: number, d: number): number =>
    0.5 * (2 * b + (c - a) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (3 * b - a - 3 * c + d) * t3);
  return { x: along(p0.x, p1.x, p2.x, p3.x), y: along(p0.y, p1.y, p2.y, p3.y) };
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
