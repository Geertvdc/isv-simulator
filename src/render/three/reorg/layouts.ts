/**
 * Where the consultants' mobile kit stands in each of a reorg level's
 * layouts (pure, no three.js, so it can be tested): the partition panels,
 * the lines they run in, and how a change of layout moves them. Everything
 * comes from the map's layouts (`map.phases`), never fixed coordinates.
 *
 * A partition tile carries half-tile panels ("leaves") from its middle
 * toward each neighbour the wall runs on to (another partition, a meeting
 * door, a rolling desk in the line): two leaves in a line make a straight
 * panel, two at a right angle a corner. Between two parallel straight runs
 * (a wall two tiles deep) there are no cross leaves, so a deep block reads
 * as two walls with end caps, not a lattice. A tile that only meets the run
 * on one side gets the leaf on its other side too, so every partition tile
 * is spanned edge to edge.
 *
 * Leaves in a row (or a column) side by side make a line. When the layout
 * changes, the leaves that come or go move as trains along their line from
 * its free ends (the ends with no staying leaf in the way); a group with no
 * free end rises from the floor or sinks into it instead.
 */

import type { GridPoint, LevelMap, Tile } from '../../../sim/level';
import { reorgTiles } from '../../../sim/reorgs';
import { isFrontWall } from '../../mapShape';
import { layoutsOf } from '../boardroom/track';

/** Which way a leaf runs from its tile's middle. */
export type Dir = 'L' | 'R' | 'U' | 'D';

const STEP: Readonly<Record<Dir, GridPoint>> = {
  L: { x: -1, y: 0 },
  R: { x: 1, y: 0 },
  U: { x: 0, y: -1 },
  D: { x: 0, y: 1 },
};
const OPPOSITE: Readonly<Record<Dir, Dir>> = { L: 'R', R: 'L', U: 'D', D: 'U' };
const DIRS: readonly Dir[] = ['L', 'R', 'U', 'D'];

/** A half-tile panel: from tile (x, y)'s middle half a tile toward `dir`. */
export interface Leaf {
  key: string;
  x: number;
  y: number;
  dir: Dir;
  /** `x`: along a row (world x); `y`: along a column (world z). */
  axis: 'x' | 'y';
  /** The row (axis x) or column (axis y) it stands in. */
  line: number;
  /** Its span along the line, `a < b`, half a tile long. */
  a: number;
  b: number;
  /** Which end is the tile's edge (where it meets the next tile's leaf): +1 `b`, −1 `a`. */
  outer: 1 | -1;
}

export function leafKey(x: number, y: number, dir: Dir): string {
  return `${x},${y},${dir}`;
}

export function makeLeaf(x: number, y: number, dir: Dir): Leaf {
  const axis = dir === 'L' || dir === 'R' ? 'x' : 'y';
  const c = axis === 'x' ? x : y;
  const plus = dir === 'R' || dir === 'D';
  return {
    key: leafKey(x, y, dir),
    x,
    y,
    dir,
    axis,
    line: axis === 'x' ? y : x,
    a: plus ? c : c - 0.5,
    b: plus ? c + 0.5 : c,
    outer: plus ? 1 : -1,
  };
}

/** A line of leaves side by side, in order along it. */
export interface Line {
  axis: 'x' | 'y';
  line: number;
  leaves: Leaf[];
  a: number;
  b: number;
}

/** One layout's partitions. */
export interface PartitionLayout {
  leaves: Map<string, Leaf>;
  lines: Line[];
  /** Per leaf key: true where its tile is cut down for the camera (a wall with open floor behind it). */
  low: Map<string, boolean>;
}

function tileIn(map: LevelMap, tiles: readonly Tile[], x: number, y: number): Tile | null {
  if (x < 0 || y < 0 || x >= map.width || y >= map.height) return null;
  return tiles[y * map.width + x] ?? null;
}

/** The leaves of one layout, from its tiles and marks. */
export function partitionLayout(map: LevelMap, phase: number): PartitionLayout {
  const layouts = layoutsOf(map);
  const layout = layouts[phase - 1] ?? layouts[0] ?? { tiles: map.tiles, marks: map.marks };
  const moving = new Set(reorgTiles(map));
  const at = (x: number, y: number): number => y * map.width + x;
  const partition = (x: number, y: number): boolean =>
    moving.has(at(x, y)) && tileIn(map, layout.tiles, x, y) === 'wall';
  const doors = new Set(
    layout.marks
      .filter((m) => m.kind === 'meetingDoor' || m.kind === 'rollingDesk')
      .map((m) => at(m.x, m.y)),
  );
  // What a wall runs on to: another partition, a door or a desk in the line.
  const joins = (x: number, y: number): boolean =>
    x >= 0 && y >= 0 && x < map.width && y < map.height && (partition(x, y) || doors.has(at(x, y)));
  const straight = (x: number, y: number, axis: 'x' | 'y'): boolean =>
    axis === 'x' ? joins(x - 1, y) && joins(x + 1, y) : joins(x, y - 1) && joins(x, y + 1);

  const leaves = new Map<string, Leaf>();
  const low = new Map<string, boolean>();
  const live: LevelMap = { ...map, tiles: [...layout.tiles] };
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      if (!partition(x, y)) continue;
      const arms = DIRS.filter((d) => {
        const n = { x: x + STEP[d].x, y: y + STEP[d].y };
        if (!joins(n.x, n.y)) return false;
        // No rungs between two parallel straight runs.
        const across = d === 'L' || d === 'R' ? 'y' : 'x';
        return !(partition(n.x, n.y) && straight(x, y, across) && straight(n.x, n.y, across));
      });
      const only = arms[0];
      if (arms.length === 1 && only) arms.push(OPPOSITE[only]);
      if (arms.length === 0) arms.push('L', 'R');
      const cut = isFrontWall(live, x, y);
      for (const d of arms) {
        const leaf = makeLeaf(x, y, d);
        leaves.set(leaf.key, leaf);
        low.set(leaf.key, cut);
      }
    }
  }
  return { leaves, lines: linesOf([...leaves.values()]), low };
}

/** Splits leaves into lines: same axis and row/column, touching end to end. */
export function linesOf(leaves: readonly Leaf[]): Line[] {
  const groups = new Map<string, Leaf[]>();
  for (const leaf of leaves) {
    const k = `${leaf.axis}${leaf.line}`;
    const list = groups.get(k) ?? [];
    list.push(leaf);
    groups.set(k, list);
  }
  const out: Line[] = [];
  for (const list of groups.values()) {
    list.sort((p, q) => p.a - q.a);
    let current: Leaf[] = [];
    const flush = (): void => {
      const first = current[0];
      const last = current[current.length - 1];
      if (first && last)
        out.push({ axis: first.axis, line: first.line, leaves: current, a: first.a, b: last.b });
      current = [];
    };
    for (const leaf of list) {
      const prev = current[current.length - 1];
      if (prev && Math.abs(prev.b - leaf.a) > 1e-6) flush();
      current.push(leaf);
    }
    flush();
  }
  return out.sort((p, q) =>
    p.axis === q.axis ? p.line - q.line || p.a - q.a : p.axis < q.axis ? -1 : 1,
  );
}

/** How one leaf moves in a change of layout. */
export interface LeafMove {
  /** `stay`: stands in both; `close`: comes in; `open`: goes; `none`: in neither. */
  change: 'stay' | 'close' | 'open' | 'none';
  /** `train`: rolls along its line from (or to) `end`; `rise`: rises from (or sinks into) the floor in place. */
  mode: 'train' | 'rise';
  /** The line coordinate where the train enters (or leaves) the line. */
  end: number;
  /** Which way is into the line from `end`: +1 toward larger coordinates. */
  sign: 1 | -1;
  /** Its place in its train counted from `end` (0 the nearest), and the train's length in leaves. */
  i: number;
  n: number;
}

/** Every leaf any layout of the map has, by key. */
export function allLeaves(map: LevelMap): Map<string, Leaf> {
  const out = new Map<string, Leaf>();
  layoutsOf(map).forEach((_, k) => {
    for (const [key, leaf] of partitionLayout(map, k + 1).leaves) out.set(key, leaf);
  });
  return out;
}

/**
 * How every leaf moves from layout `from` to layout `to`: staying, or in a
 * train from the nearest free end of its line (a group free at both ends
 * splits in two at its middle), or rising in place when boxed in.
 */
export function transition(
  map: LevelMap,
  from: PartitionLayout,
  to: PartitionLayout,
): Map<string, LeafMove> {
  const moves = new Map<string, LeafMove>();
  const rest = (change: LeafMove['change']): LeafMove => ({
    change,
    mode: 'train',
    end: 0,
    sign: 1,
    i: 0,
    n: 1,
  });
  for (const key of allLeaves(map).keys()) {
    const was = from.leaves.has(key);
    const will = to.leaves.has(key);
    moves.set(key, rest(was && will ? 'stay' : will ? 'close' : was ? 'open' : 'none'));
  }
  const plan = (lines: readonly Line[], change: 'close' | 'open'): void => {
    for (const line of lines) {
      // Contiguous groups of moving leaves along the line.
      let group: Leaf[] = [];
      const flush = (): void => {
        const first = group[0];
        const last = group[group.length - 1];
        if (!first || !last) return;
        const freeA = Math.abs(first.a - line.a) < 1e-6;
        const freeB = Math.abs(last.b - line.b) < 1e-6;
        const n = group.length;
        if (!freeA && !freeB) {
          group.forEach((leaf, i) =>
            moves.set(leaf.key, { change, mode: 'rise', end: first.a, sign: 1, i, n }),
          );
        } else {
          // Both ends free: the first half from end a, the rest from end b.
          const split = freeA && freeB ? Math.ceil(n / 2) : freeA ? n : 0;
          group.forEach((leaf, k) => {
            if (k < split)
              moves.set(leaf.key, { change, mode: 'train', end: first.a, sign: 1, i: k, n: split });
            else
              moves.set(leaf.key, {
                change,
                mode: 'train',
                end: last.b,
                sign: -1,
                i: n - 1 - k,
                n: n - split,
              });
          });
        }
        group = [];
      };
      for (const leaf of line.leaves) {
        if (moves.get(leaf.key)?.change === change) group.push(leaf);
        else flush();
      }
      flush();
    }
  };
  plan(to.lines, 'close');
  plan(from.lines, 'open');
  return moves;
}

/** A rolling desk: where it stands in each layout (the k-th desk of each, in reading order, as the sim rolls them). */
export interface RollingDesk {
  spots: GridPoint[];
  /** Per layout: the neighbours it makes a bench with (steps to adjacent desks). */
  bench: GridPoint[][];
}

export function rollingDesks(map: LevelMap): RollingDesk[] {
  const layouts = layoutsOf(map);
  const spots = layouts.map((l) =>
    l.marks.filter((m) => m.kind === 'rollingDesk').map(({ x, y }) => ({ x, y })),
  );
  const count = Math.min(...spots.map((s) => s.length));
  return Array.from({ length: count }, (_, k) => {
    const mine = spots.map((s) => s[k] as GridPoint);
    const bench = spots.map((s, li) => {
      const me = mine[li] as GridPoint;
      return s
        .filter((q) => Math.abs(q.x - me.x) + Math.abs(q.y - me.y) === 1)
        .map((q) => ({ x: q.x - me.x, y: q.y - me.y }));
    });
    return { spots: mine, bench };
  });
}

/** A meeting door in some layout: its tile, which way the wall runs through it, and the layouts it's in. */
export interface DoorSpot {
  x: number;
  y: number;
  axis: 'x' | 'y';
  /** Per layout (index `phase - 1`). */
  in: boolean[];
}

export function doorSpots(map: LevelMap): DoorSpot[] {
  const layouts = layoutsOf(map);
  const out = new Map<string, DoorSpot>();
  layouts.forEach((l, li) => {
    for (const m of l.marks) {
      if (m.kind !== 'meetingDoor') continue;
      const key = `${m.x},${m.y}`;
      let spot = out.get(key);
      if (!spot) {
        const wall = (x: number, y: number): boolean => tileIn(map, l.tiles, x, y) === 'wall';
        const axis = wall(m.x, m.y - 1) || wall(m.x, m.y + 1) ? 'y' : 'x';
        spot = { x: m.x, y: m.y, axis, in: layouts.map(() => false) };
        out.set(key, spot);
      }
      spot.in[li] = true;
    }
  });
  return [...out.values()];
}

/** An org header board on a run: on leaf `key`, `offset` along the line from its middle, `room` the run's length. */
export interface SignSpot {
  text: string;
  offset: number;
  room: number;
}

/**
 * One header board per run: on every row line four leaves long or more
 * (two tiles), at its middle, the names in turn. A run with another run
 * right in front of it (a block two deep) leaves the board to the front one.
 */
export function headerSigns(
  layout: PartitionLayout,
  names: readonly string[],
): Map<string, SignSpot> {
  const out = new Map<string, SignSpot>();
  if (names.length === 0) return out;
  const rows = layout.lines.filter((l) => l.axis === 'x' && l.leaves.length >= 4);
  let k = 0;
  for (const line of rows) {
    const front = rows.some(
      (o) =>
        o.line === line.line + 1 &&
        Math.min(o.b, line.b) - Math.max(o.a, line.a) >= (line.b - line.a) / 2,
    );
    if (front) continue;
    const mid = (line.a + line.b) / 2;
    const leaf = line.leaves.find((l) => l.a <= mid + 1e-6 && l.b >= mid - 1e-6);
    if (!leaf) continue;
    out.set(leaf.key, {
      text: names[k % names.length] ?? '',
      offset: mid - (leaf.a + leaf.b) / 2,
      room: line.b - line.a,
    });
    k++;
  }
  return out;
}

/** A parked stack over half a partition tile, in world units (its middle `cx`, `cz`; `w` along x, `d` along z). */
export interface StackSpot {
  x: number;
  y: number;
  cx: number;
  cz: number;
  w: number;
  d: number;
  /** On a cut-down tile (its top at the lower section's). */
  low: boolean;
  /** The leaves that must stand whole for it to show (its tile's, and the parallel run's across). */
  leaves: string[];
}

/**
 * Where a deep block would show floor between its fences: the half of a
 * partition tile toward a parallel run beside it (a block two deep) or
 * toward a fixed wall. A stack of panels parks there, level with the top
 * rails, so the block reads solid.
 */
export function parkedStacks(map: LevelMap, layout: PartitionLayout, phase: number): StackSpot[] {
  const layouts = layoutsOf(map);
  const tiles = (layouts[phase - 1] ?? layouts[0])?.tiles ?? map.tiles;
  const moving = new Set(reorgTiles(map));
  const byTile = new Map<string, Leaf[]>();
  for (const leaf of layout.leaves.values()) {
    const k = `${leaf.x},${leaf.y}`;
    byTile.set(k, [...(byTile.get(k) ?? []), leaf]);
  }
  const has = (x: number, y: number, d: Dir): boolean => layout.leaves.has(leafKey(x, y, d));
  interface Want {
    spot: StackSpot;
    axis: 'x' | 'y';
    d: Dir;
    /** The tile has a leaf toward `d` itself (an end cap): only where the block runs on beside it. */
    capped: boolean;
  }
  const wants: Want[] = [];
  for (const mine of byTile.values()) {
    const first = mine[0];
    if (!first) continue;
    const { x, y } = first;
    for (const axis of ['x', 'y'] as const) {
      const run = mine.filter((l) => l.axis === axis);
      if (run.length === 0) continue;
      const lo = run.some((l) => l.outer === -1) ? -0.5 : 0;
      const hi = run.some((l) => l.outer === 1) ? 0.5 : 0;
      if (hi - lo < 0.25) continue;
      const across: Dir[] = axis === 'x' ? ['U', 'D'] : ['L', 'R'];
      for (const d of across) {
        const n = { x: x + STEP[d].x, y: y + STEP[d].y };
        if (tileIn(map, tiles, n.x, n.y) !== 'wall') continue;
        const them = byTile.get(`${n.x},${n.y}`) ?? [];
        const fixed = !moving.has(n.y * map.width + n.x);
        if (!fixed && !them.some((l) => l.axis === axis)) continue;
        const sign = STEP[d].x + STEP[d].y;
        const along = (lo + hi) / 2;
        const [cx, cz, w, dd] =
          axis === 'x'
            ? [x + along, y + sign * 0.25, hi - lo, 0.5]
            : [x + sign * 0.25, y + along, 0.5, hi - lo];
        wants.push({
          axis,
          d,
          capped: has(x, y, d),
          spot: {
            x,
            y,
            cx,
            cz,
            w,
            d: dd,
            low: mine.some((l) => layout.low.get(l.key) === true),
            leaves: [...mine, ...them].map((l) => l.key),
          },
        });
      }
    }
  }
  // An end cap's tile parks a stack only where its run's next tile does the same way.
  const open = new Set(wants.filter((w) => !w.capped).map((w) => `${w.spot.x},${w.spot.y},${w.d}`));
  const out: StackSpot[] = [];
  for (const w of wants) {
    if (w.capped) {
      const { x, y } = w.spot;
      const steps: Dir[] = w.axis === 'x' ? ['L', 'R'] : ['U', 'D'];
      const runsOn = steps.some(
        (s) => has(x, y, s) && open.has(`${x + STEP[s].x},${y + STEP[s].y},${w.d}`),
      );
      if (!runsOn) continue;
    }
    out.push(w.spot);
  }
  return out;
}
