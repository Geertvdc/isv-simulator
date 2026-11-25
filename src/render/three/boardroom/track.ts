/**
 * Where the boardroom's operable wall runs (pure, no three.js, so it can be
 * tested): the partition tiles in track order, the floor track's path
 * through their middles, the storage pocket at each end, which tiles stand
 * full height and which are cut down like a front wall, and where the
 * rolling table halves stand in each layout. Everything comes from the
 * map's layouts (`map.phases`), never fixed coordinates.
 *
 * Path coordinates: `s` runs along the track in world units, 0 at the first
 * pocket's mouth, the run's tile count at the second pocket's mouth. Every
 * tile is one unit of track (half a tile from a mouth to the first middle,
 * a tile from middle to middle), so panel `k` covers `[k, k + 1]` when the
 * wall is closed. Below 0 and past the end the path runs straight on into
 * the pockets, one unit deep.
 */

import type { GridPoint, LevelMap, Tile } from '../../../sim/level';
import { layoutOf, reorgTiles } from '../../../sim/reorgs';
import { isFrontWall } from '../../mapShape';

/** A point or direction on the floor: world x and z (grid x and y). */
export interface P2 {
  x: number;
  z: number;
}

/** A storage pocket: the wall tile its closet stands on, where the track enters it and which way is in. */
export interface Pocket {
  tile: GridPoint;
  /** The middle of the tile edge the track enters through. */
  mouth: P2;
  /** Unit step from the mouth into the pocket. */
  inward: P2;
}

/** One operable wall: a chain of partition tiles between two pockets. */
export interface WallRun {
  /** The partition tiles in track order (first next to `pockets[0]`). */
  tiles: GridPoint[];
  /** The track's corners: pocket 0's back, its mouth, the tile middles where it turns, pocket 1's mouth and back. */
  path: P2[];
  /** The track coordinate `s` of each `path` point. */
  at: number[];
  /** Panels (one per tile) and track length between the mouths. */
  length: number;
  pockets: [Pocket, Pocket];
  /** Per tile: true for full height, false where the closed wall is a front wall (cut down for the camera). */
  tall: boolean[];
  /** Panels `k < split` stack in pocket 0, the rest in pocket 1. */
  split: number;
  /** Per layout (index `phase - 1`): whether the wall stands closed in it. */
  closed: boolean[];
}

/** A rolling table half: where it stands in each layout and which way its partner is when they're together. */
export interface Desk {
  /** Per layout (index `phase - 1`). */
  spots: GridPoint[];
  /** Unit step toward the other half of the table, or null for a table without one. */
  seam: GridPoint | null;
  /** Per layout: whether the halves are pushed together (a boardroom table) or apart (workshop tables). */
  together: boolean[];
}

const SIDES: readonly GridPoint[] = [
  { x: 0, y: -1 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
];

/** The map's layouts, the map's own as phase 1 even without reorgs. */
export function layoutsOf(map: LevelMap): { tiles: Tile[]; marks: LevelMap['marks'] }[] {
  return map.phases && map.phases.length > 0
    ? map.phases
    : [{ tiles: map.tiles, marks: map.marks }];
}

/** The tile at (x, y) in layout `tiles`, null off the map. */
function tileIn(map: LevelMap, tiles: readonly Tile[], x: number, y: number): Tile | null {
  if (x < 0 || y < 0 || x >= map.width || y >= map.height) return null;
  return tiles[y * map.width + x] ?? null;
}

/** Whether (x, y) is a wall in every layout: a wall that never moves. */
function staticWall(map: LevelMap, x: number, y: number): boolean {
  return layoutsOf(map).every((l) => tileIn(map, l.tiles, x, y) === 'wall');
}

/** The moving tiles that are a partition (a wall) in some layout. */
function partitionTiles(map: LevelMap): GridPoint[] {
  const layouts = layoutsOf(map);
  return reorgTiles(map)
    .map((i) => ({ x: i % map.width, y: Math.floor(i / map.width) }))
    .filter((p) => layouts.some((l) => tileIn(map, l.tiles, p.x, p.y) === 'wall'));
}

/** Splits `tiles` into chains of side-by-side tiles, each in order from one end. */
function chains(tiles: readonly GridPoint[]): GridPoint[][] {
  const key = (p: GridPoint): string => `${p.x},${p.y}`;
  const all = new Map(tiles.map((p) => [key(p), p]));
  const near = (p: GridPoint): GridPoint[] =>
    SIDES.flatMap((d) => {
      const q = all.get(key({ x: p.x + d.x, y: p.y + d.y }));
      return q ? [q] : [];
    });
  const seen = new Set<string>();
  const out: GridPoint[][] = [];
  // Ends first (one neighbour), in reading order, so every open chain starts at an end.
  const starts = [...tiles].sort(
    (a, b) => near(a).length - near(b).length || a.y - b.y || a.x - b.x,
  );
  for (const start of starts) {
    if (seen.has(key(start))) continue;
    const chain: GridPoint[] = [];
    let at: GridPoint | undefined = start;
    while (at) {
      chain.push(at);
      seen.add(key(at));
      at = near(at).find((q) => !seen.has(key(q)));
    }
    out.push(chain);
  }
  return out;
}

/** The pocket past chain end `end` (coming from `prev`): a wall that never moves, straight on if it can. */
function pocketAt(map: LevelMap, end: GridPoint, prev: GridPoint | undefined): Pocket {
  const straight = prev ? { x: end.x - prev.x, y: end.y - prev.y } : { x: 0, y: -1 };
  const tries = [straight, ...SIDES.filter((d) => d.x !== straight.x || d.y !== straight.y)];
  const step =
    tries.find(
      (d) =>
        (!prev || end.x + d.x !== prev.x || end.y + d.y !== prev.y) &&
        staticWall(map, end.x + d.x, end.y + d.y),
    ) ?? straight;
  return {
    tile: { x: end.x + step.x, y: end.y + step.y },
    mouth: { x: end.x + step.x / 2, z: end.y + step.y / 2 },
    inward: { x: step.x, z: step.y },
  };
}

/** Builds one run from a chain, walked from its first tile. */
function runOf(map: LevelMap, chain: readonly GridPoint[], closedTiles: readonly Tile[]): WallRun {
  const first = chain[0] as GridPoint;
  const last = chain[chain.length - 1] as GridPoint;
  const pockets: [Pocket, Pocket] = [
    pocketAt(map, first, chain[1]),
    pocketAt(map, last, chain[chain.length - 2]),
  ];
  const [p0, p1] = pockets;
  const path: P2[] = [
    { x: p0.mouth.x + p0.inward.x, z: p0.mouth.z + p0.inward.z },
    p0.mouth,
    ...chain.map((t) => ({ x: t.x, z: t.y })),
    p1.mouth,
    { x: p1.mouth.x + p1.inward.x, z: p1.mouth.z + p1.inward.z },
  ];
  // Drop the middles where the track runs straight on.
  const corners = path.filter((p, i) => {
    const a = path[i - 1];
    const b = path[i + 1];
    if (!a || !b) return true;
    return (p.x - a.x) * (b.z - p.z) - (p.z - a.z) * (b.x - p.x) !== 0;
  });
  const at: number[] = [];
  let s = -1;
  corners.forEach((p, i) => {
    const prev = corners[i - 1];
    if (prev) s += Math.hypot(p.x - prev.x, p.z - prev.z);
    at.push(s);
  });
  const closedMap: LevelMap = { ...map, tiles: [...closedTiles] };
  return {
    tiles: [...chain],
    path: corners,
    at,
    length: chain.length,
    pockets,
    tall: chain.map((t) => !isFrontWall(closedMap, t.x, t.y)),
    split: Math.ceil(chain.length / 2),
    closed: layoutsOf(map).map((l) => tileIn(map, l.tiles, first.x, first.y) === 'wall'),
  };
}

/** The track's point and unit direction at `s` (straight on past either end). */
export function pointAt(run: WallRun, s: number): { p: P2; t: P2 } {
  const { path, at } = run;
  let i = 0;
  while (i < path.length - 2 && s > (at[i + 1] as number)) i++;
  const a = path[i] as P2;
  const b = path[i + 1] as P2;
  const len = (at[i + 1] as number) - (at[i] as number);
  const t = { x: (b.x - a.x) / len, z: (b.z - a.z) / len };
  const u = s - (at[i] as number);
  return { p: { x: a.x + t.x * u, z: a.z + t.z * u }, t };
}

/** The wall's outer side at `s` (away from the room it closes): the track's direction turned a quarter. */
export function outerAt(run: WallRun, s: number): P2 {
  const { t } = pointAt(run, s);
  return { x: -t.z, z: t.x };
}

/** How far a panel stands extended at `s`: 1 full height, 0 cut down; eased across a tile's edge. */
export function tallAt(run: WallRun, s: number, blend = 0.15): number {
  const at = (i: number): number => (i < 0 || i >= run.length ? 1 : run.tall[i] ? 1 : 0);
  const edge = Math.round(s);
  const off = s - edge;
  if (Math.abs(off) >= blend) return at(Math.floor(s));
  const u = (off + blend) / (2 * blend);
  return at(edge - 1) + (at(edge) - at(edge - 1)) * u * u * (3 - 2 * u);
}

/**
 * The map's operable walls: each chain of partition tiles, walked so the
 * outer side (`outerAt`) faces away from the room it closes.
 */
export function wallRuns(map: LevelMap): WallRun[] {
  const parts = partitionTiles(map);
  if (parts.length === 0) return [];
  const layouts = layoutsOf(map);
  return chains(parts).map((chain) => {
    const head = chain[0] as GridPoint;
    const closed =
      layouts.find((l) => tileIn(map, l.tiles, head.x, head.y) === 'wall')?.tiles ?? map.tiles;
    let run = runOf(map, chain, closed);
    // The room is on the side the run bends round: walk it so its outer side faces away.
    const mid = chain.reduce(
      (m, t) => ({ x: m.x + t.x / chain.length, z: m.z + t.y / chain.length }),
      {
        x: 0,
        z: 0,
      },
    );
    let facing = 0;
    for (let k = 0; k < run.length; k++) {
      const { p } = pointAt(run, k + 0.5);
      const o = outerAt(run, k + 0.5);
      facing += (p.x - mid.x) * o.x + (p.z - mid.z) * o.z;
    }
    if (facing < 0) run = runOf(map, [...chain].reverse(), closed);
    return run;
  });
}

/** The wall tiles the pockets stand on: the room draws no wall there, only floor (the closet is the wall). */
export function pocketTiles(map: LevelMap): GridPoint[] {
  return wallRuns(map).flatMap((r) => r.pockets.map((p) => p.tile));
}

/** The rolling table halves (`rollingDesk` marks), the k-th of each layout being the same half, as the sim rolls them. */
export function desks(map: LevelMap): Desk[] {
  const layouts = layoutsOf(map);
  const spots = layouts.map((l) =>
    l.marks.filter((m) => m.kind === 'rollingDesk').map(({ x, y }) => ({ x, y })),
  );
  const count = Math.min(...spots.map((s) => s.length));
  const adjacent = (a: GridPoint, b: GridPoint): boolean =>
    Math.abs(a.x - b.x) + Math.abs(a.y - b.y) === 1;
  return Array.from({ length: count }, (_, k) => {
    const mine = spots.map((s) => s[k] as GridPoint);
    let seam: GridPoint | null = null;
    const together = spots.map((s, li) => {
      const me = mine[li] as GridPoint;
      const partner = s.find((q, j) => j !== k && adjacent(q, me));
      if (partner && !seam) seam = { x: partner.x - me.x, y: partner.y - me.y };
      return partner !== undefined;
    });
    return { spots: mine, seam, together };
  });
}

/** Whether a tile is solid in `phase`'s layout: for tests and the poses. */
export function solidIn(map: LevelMap, phase: number, x: number, y: number): boolean {
  const tiles = layoutOf(map, phase)?.tiles ?? map.tiles;
  const tile = tileIn(map, tiles, x, y);
  return tile !== null && tile !== 'floor';
}
