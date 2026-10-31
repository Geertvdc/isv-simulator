/**
 * Numbers for a level map, for the level redesign doc (phase 23): size,
 * stations, reachability, how far a solo player walks and where players will
 * bump into each other. Works on a parsed `LevelMap` (drafts parsed with
 * their stand-ins, see `mapChars.ts`).
 */

import { type GridPoint, type LevelMap, type Tile, getTile, isSolid } from '../../src/sim/level';
import { NEIGHBOURS } from '../../src/sim/path';

/** Tiles players work at (not counters or belts), in report order, with their map char. */
export const STATIONS: readonly { tile: Tile; char: string }[] = [
  { tile: 'inbox', char: 'I' },
  { tile: 'bugQueue', char: 'B' },
  { tile: 'keyboard', char: 'K' },
  { tile: 'testBench', char: 'T' },
  { tile: 'review', char: 'R' },
  { tile: 'pipeline', char: 'P' },
  { tile: 'ship', char: 'S' },
  { tile: 'bin', char: 'X' },
  { tile: 'whiteboard', char: 'W' },
  { tile: 'merge', char: 'G' },
];

const STATION_TILES: ReadonlySet<Tile> = new Set(STATIONS.map((s) => s.tile));

/** The feature loop a solo player walks: fetch, code, test, build, ship. */
export const LOOP_STAGES: readonly Tile[] = ['inbox', 'keyboard', 'testBench', 'pipeline', 'ship'];

/** A blocked 1-wide tile is a detour chokepoint when the loop gets at least this many steps longer... */
export const DETOUR_MIN_STEPS = 4;
/** ...and at least this much longer, relative to the open loop. */
export const DETOUR_MIN_SHARE = 0.25;

export interface Unreachable {
  /** Player number, 1 to 4. */
  player: number;
  tile: Tile;
  at: GridPoint;
}

export interface Chokepoint {
  /**
   * `cut`: blocking these tiles splits players and stations apart.
   * `detour`: a 1-wide spot; blocking it makes the solo loop much longer.
   */
  kind: 'cut' | 'detour';
  /** Connected chokepoint tiles: one for a door, several for a corridor. */
  tiles: GridPoint[];
  /** For detours: the most extra loop steps when one of these tiles is blocked. */
  extraSteps?: number;
}

export interface LevelReport {
  width: number;
  height: number;
  /** Walkable floor tiles (spawns, manager starts and meeting tiles count as floor). */
  floorTiles: number;
  /** Tiles per type, stations plus counters and conveyors (`II` counts 2: two players can use it). */
  tiles: Partial<Record<Tile, number>>;
  spawns: GridPoint[];
  /** Stations a player can't walk up to from their spawn (throwing and belts don't count); `at` is the station's top-left tile. */
  unreachable: Unreachable[];
  /** Steps from spawn 1 through inbox, keyboard, test bench and pipeline to the ship. */
  soloRun: number | null;
  /** Steps of the shortest round trip from the inbox through the loop and back to the inbox. */
  loop: number | null;
  chokepoints: Chokepoint[];
}

/** Grid distances between every pair of tiles over floor; `-1` where unreachable. */
interface Distances {
  size: number;
  get(from: number, to: number): number;
}

function indexOf(map: LevelMap, p: GridPoint): number {
  return p.y * map.width + p.x;
}

function pointOf(map: LevelMap, i: number): GridPoint {
  return { x: i % map.width, y: Math.floor(i / map.width) };
}

function isFloor(map: LevelMap, i: number, blocked: number): boolean {
  if (i === blocked) return false;
  const p = pointOf(map, i);
  return !isSolid(getTile(map, p.x, p.y));
}

function floorNeighbours(map: LevelMap, i: number, blocked: number): number[] {
  const p = pointOf(map, i);
  const result: number[] = [];
  for (const d of NEIGHBOURS) {
    const x = p.x + d.x;
    const y = p.y + d.y;
    if (x < 0 || y < 0 || x >= map.width || y >= map.height) continue;
    const j = y * map.width + x;
    if (isFloor(map, j, blocked)) result.push(j);
  }
  return result;
}

/** Breadth-first walks from every floor tile, with tile `blocked` (or none, `-1`) taken out. */
function allDistances(map: LevelMap, blocked = -1): Distances {
  const size = map.width * map.height;
  const table = new Int32Array(size * size).fill(-1);
  const neighbours = Array.from({ length: size }, (_, i) =>
    isFloor(map, i, blocked) ? floorNeighbours(map, i, blocked) : [],
  );
  for (let from = 0; from < size; from++) {
    if (!isFloor(map, from, blocked)) continue;
    const row = from * size;
    table[row + from] = 0;
    const queue = [from];
    for (let q = 0; q < queue.length; q++) {
      const at = queue[q] ?? 0;
      const next = (table[row + at] ?? 0) + 1;
      for (const n of neighbours[at] ?? []) {
        if (table[row + n] !== -1) continue;
        table[row + n] = next;
        queue.push(n);
      }
    }
  }
  return { size, get: (from, to) => table[from * size + to] ?? -1 };
}

/** Floor tiles next to `at` where a player stands to use it. */
function accessOf(map: LevelMap, at: number, blocked = -1): number[] {
  return floorNeighbours(map, at, blocked);
}

/** Floor tiles next to any tile of type `tile`. */
function accessTiles(map: LevelMap, tile: Tile, blocked = -1): number[] {
  const result = new Set<number>();
  map.tiles.forEach((t, i) => {
    if (t === tile) accessOf(map, i, blocked).forEach((a) => result.add(a));
  });
  return [...result].sort((a, b) => a - b);
}

/**
 * Fewest steps from any start (each with a cost so far) visiting one tile of
 * each stage in order; `null` when a stage is empty or out of reach.
 */
function chain(
  dist: Distances,
  starts: readonly { at: number; cost: number }[],
  stages: readonly (readonly number[])[],
): number | null {
  let costs = starts;
  for (const stage of stages) {
    const next: { at: number; cost: number }[] = [];
    for (const to of stage) {
      let best = Infinity;
      for (const { at, cost } of costs) {
        const d = dist.get(at, to);
        if (d >= 0) best = Math.min(best, cost + d);
      }
      if (best < Infinity) next.push({ at: to, cost: best });
    }
    if (next.length === 0) return null;
    costs = next;
  }
  return Math.min(...costs.map((c) => c.cost));
}

function soloRun(map: LevelMap, dist: Distances, blocked = -1): number | null {
  const spawn = map.spawns[0];
  if (!spawn || indexOf(map, spawn) === blocked) return null;
  const stages = LOOP_STAGES.map((t) => accessTiles(map, t, blocked));
  return chain(dist, [{ at: indexOf(map, spawn), cost: 0 }], stages);
}

function loop(map: LevelMap, dist: Distances, blocked = -1): number | null {
  const [first, ...rest] = LOOP_STAGES.map((t) => accessTiles(map, t, blocked));
  let best: number | null = null;
  for (const start of first ?? []) {
    const length = chain(dist, [{ at: start, cost: 0 }], [...rest, [start]]);
    if (length !== null && (best === null || length < best)) best = length;
  }
  return best;
}

/** A station: touching tiles of the same type (`II` is one inbox), used from any of them. */
interface Station {
  tile: Tile;
  /** Its tiles, top-left first. */
  tiles: number[];
}

/** Every station on the map, grouping touching tiles of the same type. */
function stations(map: LevelMap): Station[] {
  const seen = new Set<number>();
  const result: Station[] = [];
  map.tiles.forEach((tile, i) => {
    if (!STATION_TILES.has(tile) || seen.has(i)) return;
    seen.add(i);
    const tiles = [i];
    for (let q = 0; q < tiles.length; q++) {
      const p = pointOf(map, tiles[q] ?? 0);
      for (const d of NEIGHBOURS) {
        const x = p.x + d.x;
        const y = p.y + d.y;
        const j = y * map.width + x;
        if (getTile(map, x, y) !== tile || seen.has(j)) continue;
        seen.add(j);
        tiles.push(j);
      }
    }
    result.push({ tile, tiles: tiles.sort((a, b) => a - b) });
  });
  return result;
}

/** Floor tiles where a player stands to use a station. */
function stationAccess(map: LevelMap, station: Station, blocked = -1): number[] {
  return [...new Set(station.tiles.flatMap((t) => accessOf(map, t, blocked)))];
}

/** Spawns and stations: the things that must stay connected. Each is a list of tiles to stand on. */
function entities(map: LevelMap, blocked: number): number[][] {
  const result: number[][] = map.spawns.map((s) => {
    const i = indexOf(map, s);
    return i === blocked ? [] : [i];
  });
  for (const station of stations(map)) result.push(stationAccess(map, station, blocked));
  return result;
}

/** Pairs of entities (with somewhere left to stand) that can't walk to each other. */
function splitPairs(map: LevelMap, dist: Distances, blocked: number): number {
  const all = entities(map, blocked).filter((e) => e.length > 0);
  let split = 0;
  for (let a = 0; a < all.length; a++) {
    for (let b = a + 1; b < all.length; b++) {
      const ea = all[a] ?? [];
      const eb = all[b] ?? [];
      if (!ea.some((i) => eb.some((j) => dist.get(i, j) >= 0))) split++;
    }
  }
  return split;
}

/** Floor with something solid on both sides, left and right or above and below. */
function isNarrow(map: LevelMap, i: number): boolean {
  const { x, y } = pointOf(map, i);
  const solid = (dx: number, dy: number): boolean => isSolid(getTile(map, x + dx, y + dy));
  return (solid(-1, 0) && solid(1, 0)) || (solid(0, -1) && solid(0, 1));
}

/** Groups same-kind chokepoint tiles that touch into one chokepoint. */
function group(
  map: LevelMap,
  found: readonly { at: number; kind: Chokepoint['kind']; extra?: number }[],
): Chokepoint[] {
  const left = new Map(found.map((f) => [f.at, f]));
  const result: Chokepoint[] = [];
  for (const f of found) {
    if (!left.has(f.at)) continue;
    left.delete(f.at);
    const members = [f];
    for (let q = 0; q < members.length; q++) {
      const m = members[q];
      if (!m) break;
      for (const n of floorNeighbours(map, m.at, -1)) {
        const other = left.get(n);
        if (other?.kind !== f.kind) continue;
        left.delete(n);
        members.push(other);
      }
    }
    members.sort((a, b) => a.at - b.at);
    const chokepoint: Chokepoint = { kind: f.kind, tiles: members.map((m) => pointOf(map, m.at)) };
    if (f.kind === 'detour') chokepoint.extraSteps = Math.max(...members.map((m) => m.extra ?? 0));
    result.push(chokepoint);
  }
  return result;
}

function chokepoints(map: LevelMap, dist: Distances, baseLoop: number | null): Chokepoint[] {
  const baseSplit = splitPairs(map, dist, -1);
  const found: { at: number; kind: Chokepoint['kind']; extra?: number }[] = [];
  for (let i = 0; i < map.tiles.length; i++) {
    if (!isFloor(map, i, -1) || !isNarrow(map, i)) continue;
    const without = allDistances(map, i);
    if (splitPairs(map, without, i) > baseSplit) {
      found.push({ at: i, kind: 'cut' });
      continue;
    }
    if (baseLoop === null) continue;
    const blockedLoop = loop(map, without, i);
    if (blockedLoop === null) continue;
    const extra = blockedLoop - baseLoop;
    if (extra >= DETOUR_MIN_STEPS && extra >= baseLoop * DETOUR_MIN_SHARE) {
      found.push({ at: i, kind: 'detour', extra });
    }
  }
  return group(map, found);
}

function unreachable(map: LevelMap, dist: Distances): Unreachable[] {
  const result: Unreachable[] = [];
  const all = stations(map);
  map.spawns.forEach((spawn, p) => {
    const from = indexOf(map, spawn);
    for (const station of all) {
      if (stationAccess(map, station).some((a) => dist.get(from, a) >= 0)) continue;
      result.push({ player: p + 1, tile: station.tile, at: pointOf(map, station.tiles[0] ?? 0) });
    }
  });
  return result;
}

/** Everything the level redesign doc wants to know about a map. */
export function analyzeMap(map: LevelMap): LevelReport {
  const dist = allDistances(map);
  const tiles: Partial<Record<Tile, number>> = {};
  let floorTiles = 0;
  for (const t of map.tiles) {
    if (t === 'floor') floorTiles++;
    else if (STATION_TILES.has(t) || t === 'counter' || t === 'conveyor') {
      tiles[t] = (tiles[t] ?? 0) + 1;
    }
  }
  const baseLoop = loop(map, dist);
  return {
    width: map.width,
    height: map.height,
    floorTiles,
    tiles,
    spawns: map.spawns,
    unreachable: unreachable(map, dist),
    soloRun: soloRun(map, dist),
    loop: baseLoop,
    chokepoints: chokepoints(map, dist, baseLoop),
  };
}

// ---- Formatting ----

/** Station counts as map chars, e.g. `I2 K2 T2 P2 S2 X1`. */
export function stationSummary(report: LevelReport): string {
  return STATIONS.filter((s) => report.tiles[s.tile])
    .map((s) => `${s.char}${report.tiles[s.tile] ?? 0}`)
    .join(' ');
}

function point(p: GridPoint): string {
  return `${p.x},${p.y}`;
}

/** A chokepoint in a few chars: `cut 6,4`, `cut 5,3–9,3 (5)` or `detour 7,2 +8`. */
export function formatChokepoint(c: Chokepoint): string {
  const first = c.tiles[0];
  const last = c.tiles[c.tiles.length - 1];
  const where =
    !first || !last || c.tiles.length === 1
      ? point(first ?? { x: 0, y: 0 })
      : `${point(first)}–${point(last)} (${c.tiles.length})`;
  return c.kind === 'detour' ? `detour ${where} +${c.extraSteps ?? 0}` : `cut ${where}`;
}

function steps(n: number | null): string {
  return n === null ? 'n/a' : String(n);
}

function stationChar(tile: Tile): string {
  return STATIONS.find((s) => s.tile === tile)?.char ?? tile;
}

/** `all`, or the stations someone can't walk to: `not B 7,0` (for every player) or `not B 7,0 (P3 P4)`. */
function unreachableSummary(report: LevelReport): string {
  if (report.unreachable.length === 0) return 'all';
  const byStation = new Map<string, number[]>();
  for (const u of report.unreachable) {
    const key = `${stationChar(u.tile)} ${point(u.at)}`;
    byStation.set(key, [...(byStation.get(key) ?? []), u.player]);
  }
  const everyone = report.spawns.length;
  const parts = [...byStation].map(([station, players]) =>
    players.length === everyone ? station : `${station} (${players.map((p) => `P${p}`).join(' ')})`,
  );
  return `not ${parts.join(', ')}`;
}

export const REPORT_TABLE_HEADER =
  '| Level | Size | Floor | Stations | Solo run | Loop | Chokepoints | Reachable |\n' +
  '| ----- | ---- | ----- | -------- | -------- | ---- | ----------- | --------- |';

/** One markdown table row (see `REPORT_TABLE_HEADER`). */
export function reportTableRow(name: string, report: LevelReport): string {
  const chokes =
    report.chokepoints.length === 0 ? 'none' : report.chokepoints.map(formatChokepoint).join('; ');
  return (
    `| ${name} | ${report.width}×${report.height} | ${report.floorTiles} | ${stationSummary(report)} | ` +
    `${steps(report.soloRun)} | ${steps(report.loop)} | ${chokes} | ${unreachableSummary(report)} |`
  );
}

/** A readable multi-line report for one map. */
export function formatReport(name: string, report: LevelReport): string {
  const lines = [
    name,
    `  size         ${report.width}×${report.height}, ${report.floorTiles} floor tiles`,
    `  stations     ${stationSummary(report)}`,
    `  counters     ${report.tiles.counter ?? 0}, conveyors ${report.tiles.conveyor ?? 0}`,
    `  spawns       ${report.spawns.map((s, i) => `P${i + 1} ${point(s)}`).join('  ')}`,
    `  solo run     ${steps(report.soloRun)} steps (spawn 1 → ${LOOP_STAGES.join(' → ')})`,
    `  loop         ${steps(report.loop)} steps (inbox → … → ship → inbox)`,
    `  chokepoints${report.chokepoints.length === 0 ? '  none' : ''}`,
  ];
  for (const c of report.chokepoints) lines.push(`    ${formatChokepoint(c)}`);
  if (report.unreachable.length === 0) {
    lines.push('  reachable    every station from every spawn');
  } else {
    lines.push('  unreachable  (on foot)');
    for (const u of report.unreachable) {
      lines.push(`    P${u.player}: ${u.tile} at ${point(u.at)}`);
    }
  }
  return lines.join('\n');
}
