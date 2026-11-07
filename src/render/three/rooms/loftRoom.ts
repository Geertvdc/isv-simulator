/**
 * Where the rooftop loft's story pieces go (the `loft` wall theme, Seed
 * Round): the lift door from the building's core round the inbox, the
 * steel-and-glass door out onto the roof plant deck at the ship hatch, what
 * hangs on the back wall (the status dashboard with prod on fire, the seed
 * cheque, the growth chart, the neon logo, the incident beacon), placed wear
 * on the polished concrete, and the clusters on the wall tops and the low
 * front wall. Placed from the map's own tiles, never at fixed coordinates,
 * so it fits any map. No three.js here, so it can be tested.
 */

import { type GridPoint, type LevelMap, getTile } from '../../../sim/level';
import type { Vec3 } from '../../projection';
import { levelSalt, tileHash, wallPiece } from '../../mapShape';
import { tilesOf } from '../layout';
import { type Doorway, type Side, findDoorway } from './officeParkRoom';

export type { Doorway, Side };

/** Wear on a polished concrete tile (see `floorWear`), one per tile; `roomModels/loft` draws them. */
export const POLISHED_WEAR = {
  none: 0,
  /**
   * Scooter tyre marks in from the lift, running down the map (z) or across
   * (x): the first tile in, then (`tyresMid`) the second, where the two
   * tracks fan apart, then fainter on the third.
   */
  tyres: 1,
  tyresX: 2,
  tyresFaint: 3,
  tyresFaintX: 4,
  /** Chair castor scuffs in front of a desk. */
  scuffs: 5,
  /** The floor-box cable channel: a brushed steel lid across (x) or down (z) the tile. */
  channelX: 6,
  channelZ: 7,
  /** A floor box at a desk end of the channel, the channel through it across (x); `floorBoxZ` down. */
  floorBox: 8,
  /** Roof grit tracked in through the roof door, a few specks of gravel. */
  grit: 9,
  /** The quarters of a 2×2 rug: back left, back right, front left, front right. */
  rugNW: 10,
  rugNE: 11,
  rugSW: 12,
  rugSE: 13,
  tyresMid: 14,
  tyresMidX: 15,
  floorBoxZ: 16,
} as const;
/** How many wear kinds there are. */
export const POLISHED_WEAR_KINDS = 17;

/**
 * What hangs on the loft's back wall: the big status dashboard (three tiles
 * wide, so a ticket label never hides all of it), the seed cheque (two),
 * and on one tile each the incident beacon, the growth chart, the neon logo
 * and, where the wall has room, a second smaller screen of the error rate.
 */
export type LoftArt = 'dashboard' | 'cheque' | 'growthChart' | 'neon' | 'beacon' | 'errors';
/** How many tiles each piece spans. */
export const LOFT_ART_SPAN: Readonly<Record<LoftArt, number>> = {
  dashboard: 3,
  cheque: 2,
  growthChart: 1,
  neon: 1,
  beacon: 1,
  errors: 1,
};
const spanOf = (art: LoftArt) => LOFT_ART_SPAN[art];
/** How far each piece reaches either side of its middle, frame and all (`roomModels/loft` builds to it). */
export const LOFT_ART_HALF: Readonly<Record<LoftArt, number>> = {
  dashboard: 1.18,
  cheque: 0.75,
  growthChart: 0.38,
  neon: 0.3,
  beacon: 0.08,
  errors: 0.4,
};

export interface LoftArtSpot {
  /** The wall tile it hangs on (a wide one's middle: between two tiles for a span of two). */
  x: number;
  y: number;
  art: LoftArt;
}

export interface LoftRoom {
  /** The inbox framed as the lift door from the building's core. */
  liftDoor: Doorway | null;
  /** The ship hatch framed as the door out onto the roof plant deck. */
  roofDoor: Doorway | null;
  /** Always empty: the loft's art is placed as story pieces (`wallArt`), not hashed decorations. */
  decos: Record<string, string>;
  /** What hangs on the back wall, in the order it was placed. */
  wallArt: LoftArtSpot[];
  /** Wear on the concrete (a `POLISHED_WEAR`), keyed `x,y`; bare tiles left out. */
  floorWear: Record<string, number>;
  /**
   * Clusters on the wall tops (see `RoomPlan.capProps`): one tile each, a
   * whole composed cluster model (`LOFT_WALL_TOP_PROPS`), consecutive slots
   * along a wall picking different ones.
   */
  capProps: { x: number; y: number; slot: number; toward: { dx: number; dy: number } }[];
  /** Low clusters lying on the front wall (see `RoomPlan.frontProps`). */
  frontProps: { x: number; y: number; slot: number }[];
  /**
   * The black steel posts on the walls' inner faces: at the room's corners
   * and every `POST_EVERY` tiles along each wall facing it, never through a
   * door or a piece of art. `x`/`y` is the post's place in grid units (on a
   * tile edge along the wall), `side` the wall it stands on.
   */
  posts: { x: number; y: number; side: Side }[];
}

const OUT: Readonly<Record<Side, { dx: number; dy: number }>> = {
  back: { dx: 0, dy: -1 },
  front: { dx: 0, dy: 1 },
  left: { dx: -1, dy: 0 },
  right: { dx: 1, dy: 0 },
};

/** How far in from the lift the tyre marks run, the last tile faint. */
const TYRE_DEPTH = 3;
/** Chair scuffs at most. */
const SCUFFS_MAX = 3;
/** The longest cable channel from a desk to a wall, and between two desk islands, in tiles. */
const CHANNEL_MAX = 3;
const CHANNEL_BETWEEN_MAX = 5;
/** Clusters on the wall tops at most: along the back, on each side wall, on the front wall. */
export const LOFT_CAP_CLUSTERS = { back: 3, side: 3, front: 2 } as const;

const key = (x: number, y: number) => `${x},${y}`;
const STEPS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

export function loftRoom(map: LevelMap): LoftRoom {
  const liftDoor = findDoorway(map, 'inbox');
  const roofDoor = findDoorway(map, 'ship');
  const doors = [liftDoor, roofDoor];
  const wallArt = placeWallArt(map, doors);
  return {
    liftDoor,
    roofDoor,
    decos: {},
    wallArt,
    floorWear: floorWear(map, liftDoor, roofDoor),
    capProps: capProps(map, doors),
    frontProps: frontProps(map, doors, roofDoor),
    posts: posts(map, doors, wallArt),
  };
}

/** Whether (x, y) is open ground (not wall, not outside). */
function isOpen(map: LevelMap, x: number, y: number): boolean {
  const t = getTile(map, x, y);
  return t !== null && t !== 'wall' && t !== 'void';
}

/** Whether (x, y) is within `reach` tiles of a door's tiles. */
function nearDoor(
  doors: readonly (Doorway | null)[],
  x: number,
  y: number,
  reach: number,
): boolean {
  return doors.some((d) =>
    d?.tiles.some((t) => Math.max(Math.abs(t.x - x), Math.abs(t.y - y)) <= reach),
  );
}

/**
 * What hangs on the back wall: walls showing their face to the room with
 * nothing open behind them. The big status dashboard (prod on fire, three
 * tiles) and the seed cheque (two), a bare tile between them at least, the
 * dashboard on the right half of the wall, as near the middle as leaves the
 * cheque a place; the
 * incident beacon right beside the dashboard; then the growth chart as far
 * from the rest as it gets (high over a counter when the wall is full); the
 * neon logo high up over a counter where the wall has one, else on what is
 * left; and last, where a bare tile still stands either side of it, the
 * second screen with the error rate, the right half of the wall first.
 */
function placeWallArt(map: LevelMap, doors: readonly (Doorway | null)[]): LoftArtSpot[] {
  const back = (x: number, y: number) =>
    getTile(map, x, y) === 'wall' &&
    wallPiece(map, x, y) === 'wall' &&
    !isOpen(map, x, y - 1) &&
    !nearDoor(doors, x, y, 0);
  // Floor in front: anything may hang there. A counter in front: only what hangs high.
  const low = (x: number, y: number) => back(x, y) && getTile(map, x, y + 1) === 'floor';
  const high = (x: number, y: number) => back(x, y) && getTile(map, x, y + 1) === 'counter';
  const midX = (map.width - 1) / 2;
  const out: LoftArtSpot[] = [];
  const used = new Set<string>();
  const wide = new Set<string>();

  /** Free places for `art` where `ok`, as their middles, lowest `score` first (ties to the left). */
  const places = (art: LoftArt, ok: typeof low, score: (x: number, y: number) => number) => {
    const span = spanOf(art);
    const found: { x: number; y: number; s: number }[] = [];
    for (let y = 0; y < map.height; y++)
      for (let x = 0; x + span - 1 < map.width; x++) {
        let fits = true;
        for (let i = 0; i < span; i++) if (!ok(x + i, y) || used.has(key(x + i, y))) fits = false;
        // Wide pieces keep a tile apart.
        if (span > 1 && (wide.has(key(x - 1, y)) || wide.has(key(x + span, y)))) fits = false;
        if (fits) found.push({ x: x + (span - 1) / 2, y, s: score(x + (span - 1) / 2, y) });
      }
    return found.sort((a, b) => a.s - b.s || a.y - b.y || a.x - b.x);
  };
  const take = (art: LoftArt, p: { x: number; y: number }) => {
    const span = spanOf(art);
    const x0 = p.x - (span - 1) / 2;
    for (let i = 0; i < span; i++) {
      used.add(key(x0 + i, p.y));
      if (span > 1) wide.add(key(x0 + i, p.y));
    }
    out.push({ x: p.x, y: p.y, art });
  };
  const untake = () => {
    const last = out.pop();
    if (!last) return;
    const span = spanOf(last.art);
    for (let i = 0; i < span; i++) {
      const k = key(last.x - (span - 1) / 2 + i, last.y);
      used.delete(k);
      wide.delete(k);
    }
  };
  /** How far (x, y) is from the nearest edge of anything hung so far. */
  const gap = (x: number, y: number) =>
    Math.min(99, ...out.map((a) => Math.abs(a.x - x) - spanOf(a.art) / 2 + Math.abs(a.y - y) * 2));
  /** Lower for spots far from everything hung so far. */
  const apart = (x: number, y: number) => -gap(x, y);

  // The dashboard on the right half (off the middle, where the players' ticket labels pop
  // up most), nearest the middle that still leaves the cheque a place.
  const dashes = places(
    'dashboard',
    low,
    (x, y) => (x < midX - 1e-9 ? 10 : 0) + Math.abs(x - midX) + y * 0.5,
  );
  for (const d of dashes) {
    take('dashboard', d);
    const cheque = places('cheque', low, apart)[0];
    if (cheque) {
      take('cheque', cheque);
      break;
    }
    untake();
  }
  if (out.length === 0 && dashes[0]) take('dashboard', dashes[0]);
  const dash = out.find((a) => a.art === 'dashboard');
  if (dash) {
    // Right beside it, the right side first.
    const beside = (spanOf('dashboard') + 1) / 2;
    const beacon = places('beacon', low, (x, y) =>
      y !== dash.y ? 99 : Math.abs(Math.abs(x - dash.x) - beside) + (x < dash.x ? 0.1 : 0),
    )[0];
    if (beacon && beacon.s < 1) take('beacon', beacon);
  }
  const chart =
    places('growthChart', low, apart)[0] ??
    places('growthChart', high, (x, y) => Math.abs(x - midX) + y)[0];
  if (chart) take('growthChart', chart);
  const neon =
    places('neon', high, (x, y) => Math.abs(x - midX) + y)[0] ?? places('neon', low, apart)[0];
  if (neon) take('neon', neon);
  // The second screen only with a bare tile either side; the right half of the wall first.
  const errors = places('errors', low, (x, y) => (x < midX ? 1 : 0) - gap(x, y) * 0.01).find(
    (p) => gap(p.x, p.y) >= 1.5 - 1e-9,
  );
  if (errors) take('errors', errors);
  return out.sort((a, b) => a.y - b.y || a.x - b.x);
}

/**
 * Wear on the polished concrete, placed: scooter tyre marks in from the lift
 * door (the founders ride them in), roof grit just inside the roof door,
 * chair scuffs in front of the keyboards, and the floor-box cable channel
 * from a desk in the room out to the nearest wall. Never on a spawn.
 */
function floorWear(
  map: LevelMap,
  liftDoor: Doorway | null,
  roofDoor: Doorway | null,
): Record<string, number> {
  const salt = levelSalt(map);
  const out: Record<string, number> = {};
  const spawn = new Set(map.spawns.map((p) => key(p.x, p.y)));
  const free = (x: number, y: number) =>
    getTile(map, x, y) === 'floor' && out[key(x, y)] === undefined && !spawn.has(key(x, y));

  if (liftDoor) {
    // Tyre marks run in from one of the lift's tiles (picked by the level), the last tile faint.
    const { dx, dy } = OUT[liftDoor.side];
    const across = dx !== 0;
    const t = liftDoor.tiles[salt % liftDoor.tiles.length] ?? liftDoor.tiles[0];
    if (t)
      for (let d = 1; d <= TYRE_DEPTH; d++) {
        const [x, y] = [t.x - dx * d, t.y - dy * d];
        if (!isOpen(map, x, y)) break;
        if (!free(x, y)) continue;
        const [along, alongX] =
          d === 1
            ? [POLISHED_WEAR.tyres, POLISHED_WEAR.tyresX]
            : d === 2
              ? [POLISHED_WEAR.tyresMid, POLISHED_WEAR.tyresMidX]
              : [POLISHED_WEAR.tyresFaint, POLISHED_WEAR.tyresFaintX];
        out[key(x, y)] = across ? alongX : along;
      }
  }
  if (roofDoor) {
    const { dx, dy } = OUT[roofDoor.side];
    for (const t of roofDoor.tiles) {
      const [x, y] = [t.x - dx, t.y - dy];
      if (free(x, y) && (tileHash(x, y) ^ salt) % 3 !== 0) out[key(x, y)] = POLISHED_WEAR.grit;
    }
  }

  // The cable channel: between two desk islands where the room has two (a floor box at each
  // end), else the shortest walk over bare floor from a desk in the room to a wall.
  const desk = (x: number, y: number) => {
    const t = getTile(map, x, y);
    return t === 'counter' || t === 'keyboard';
  };
  const midY = (map.height - 1) / 2;
  let channel: { tiles: GridPoint[]; across: boolean; ends: number; score: number } | null = null;
  for (let y = 0; y < map.height; y++)
    for (let x = 0; x < map.width; x++) {
      if (!desk(x, y)) continue;
      // From the room's middle, not along its edge: a desk by the wall has its socket there.
      if (STEPS.some(([ex, ey]) => getTile(map, x + ex, y + ey) === 'wall')) continue;
      for (const [dx, dy] of STEPS) {
        const tiles: GridPoint[] = [];
        let [cx, cy] = [x + dx, y + dy];
        while (free(cx, cy) && tiles.length <= CHANNEL_BETWEEN_MAX) {
          tiles.push({ x: cx, y: cy });
          cx += dx;
          cy += dy;
        }
        if (tiles.length === 0) continue;
        // Desk to desk (each run found from both ends: keep the one going right or down).
        const between =
          desk(cx, cy) && dx + dy > 0 && tiles.length >= 2 && tiles.length <= CHANNEL_BETWEEN_MAX;
        const toWall = getTile(map, cx, cy) === 'wall' && tiles.length <= CHANNEL_MAX;
        if (!between && !toWall) continue;
        // Desk to desk first, then the shortest, then nearest the room's middle row.
        const score =
          (between ? 0 : 100) + tiles.length + Math.abs((tiles[0]?.y ?? 0) - midY) * 0.01;
        if (!channel || score < channel.score)
          channel = { tiles, across: dx !== 0, ends: between ? 2 : 1, score };
      }
    }
  if (channel) {
    const last = channel.tiles.length - 1;
    channel.tiles.forEach((p, i) => {
      out[key(p.x, p.y)] =
        i === 0 || (channel.ends === 2 && i === last)
          ? channel.across
            ? POLISHED_WEAR.floorBox
            : POLISHED_WEAR.floorBoxZ
          : channel.across
            ? POLISHED_WEAR.channelX
            : POLISHED_WEAR.channelZ;
    });
  }

  // The rug: a 2×2 of bare floor against a wall, as far from the spawns as there is.
  const rug = findRug(map, free);
  if (rug) {
    out[key(rug.x, rug.y)] = POLISHED_WEAR.rugNW;
    out[key(rug.x + 1, rug.y)] = POLISHED_WEAR.rugNE;
    out[key(rug.x, rug.y + 1)] = POLISHED_WEAR.rugSW;
    out[key(rug.x + 1, rug.y + 1)] = POLISHED_WEAR.rugSE;
  }

  // Chair scuffs on the floor each keyboard faces, a few, well apart.
  const scuffs: GridPoint[] = [];
  for (const k of tilesOf(map, 'keyboard')) {
    if (scuffs.length >= SCUFFS_MAX) break;
    const step = STEPS.find(([dx, dy]) => free(k.x + dx, k.y + dy));
    if (!step) continue;
    const p = { x: k.x + step[0], y: k.y + step[1] };
    if (scuffs.some((s) => Math.max(Math.abs(s.x - p.x), Math.abs(s.y - p.y)) < 2)) continue;
    scuffs.push(p);
    out[key(p.x, p.y)] = POLISHED_WEAR.scuffs;
  }
  return out;
}

/** How far (in tiles, either way) the rug keeps from every spawn. */
const RUG_SPAWN_CLEAR = 2;

/**
 * The rug's back-left tile: a 2×2 of free floor with a wall along its front
 * or one side, at least `RUG_SPAWN_CLEAR` from every spawn, as far from them
 * as there is (ties: nearer the front, then the left).
 */
export function findRug(map: LevelMap, free: (x: number, y: number) => boolean): GridPoint | null {
  const wall = (x: number, y: number) => getTile(map, x, y) === 'wall';
  let best: { x: number; y: number; d: number } | null = null;
  for (let y = 0; y + 1 < map.height; y++)
    for (let x = 0; x + 1 < map.width; x++) {
      if (!free(x, y) || !free(x + 1, y) || !free(x, y + 1) || !free(x + 1, y + 1)) continue;
      const edge =
        (wall(x, y + 2) && wall(x + 1, y + 2)) ||
        (wall(x - 1, y) && wall(x - 1, y + 1)) ||
        (wall(x + 2, y) && wall(x + 2, y + 1));
      if (!edge) continue;
      const d = Math.min(
        99,
        ...map.spawns.map((s) =>
          Math.max(Math.max(x - s.x, s.x - x - 1, 0), Math.max(y - s.y, s.y - y - 1, 0)),
        ),
      );
      if (d < RUG_SPAWN_CLEAR) continue;
      if (!best || d > best.d || (d === best.d && y > best.y)) best = { x, y, d };
    }
  return best ? { x: best.x, y: best.y } : null;
}

/**
 * Wall-top tiles that can carry a cluster: full walls (not the low front
 * wall) with no floor behind them (it'd hide someone standing there), clear
 * of the door frames.
 */
function capFree(
  map: LevelMap,
  doors: readonly (Doorway | null)[],
): (x: number, y: number) => boolean {
  return (x, y) =>
    getTile(map, x, y) === 'wall' &&
    wallPiece(map, x, y) !== 'wall-front' &&
    !isOpen(map, x, y - 1) &&
    !nearDoor(doors, x, y, 1);
}

/**
 * Clusters on the wall tops, the rest bare as a breather: the free wall
 * tops sorted onto the back, left and right walls (rows first, then what's
 * left in columns), and on each wall `LOFT_CAP_CLUSTERS` single-tile
 * clusters spread evenly along it, at least `CLUSTER_GAP` tiles apart. Each
 * is one whole composed model; consecutive slots on a wall pick different
 * ones.
 */
function capProps(map: LevelMap, doors: readonly (Doorway | null)[]): LoftRoom['capProps'] {
  const free = capFree(map, doors);
  const taken = new Set<string>();
  const runs: { tiles: GridPoint[]; across: boolean }[] = [];
  const collect = (across: boolean) => {
    const [outer, inner] = across ? [map.height, map.width] : [map.width, map.height];
    for (let a = 0; a < outer; a++) {
      let run: GridPoint[] = [];
      for (let b = 0; b <= inner; b++) {
        const [x, y] = across ? [b, a] : [a, b];
        if (b < inner && free(x, y) && !taken.has(key(x, y))) {
          run.push({ x, y });
          continue;
        }
        if (run.length >= (across ? 2 : 1)) {
          runs.push({ tiles: run, across });
          for (const p of run) taken.add(key(p.x, p.y));
        }
        run = [];
      }
    }
  };
  collect(true);
  collect(false);
  // Which wall a run is on: a row near the top is the back; the rest by their side of the map.
  const wallOf = ({ tiles, across }: (typeof runs)[number]): 'back' | 'left' | 'right' => {
    const p = tiles[0];
    if (!p || (across && p.y < map.height / 2)) return 'back';
    return p.x < map.width / 2 ? 'left' : 'right';
  };
  const walls: Record<'back' | 'left' | 'right', GridPoint[]> = { back: [], left: [], right: [] };
  for (const run of runs) walls[wallOf(run)].push(...run.tiles);
  const out: LoftRoom['capProps'] = [];
  let slot = 0;
  for (const wall of ['back', 'left', 'right'] as const) {
    const along = (p: GridPoint) => (wall === 'back' ? p.x : p.y);
    const tiles = walls[wall];
    const picked = spreadApart(tiles, along, LOFT_CAP_CLUSTERS[wall === 'back' ? 'back' : 'side']);
    // The right wall counts its slots from the front, so the two side walls don't mirror.
    const order = wall === 'right' ? [...picked].reverse() : picked;
    for (const p of order) out.push({ x: p.x, y: p.y, slot: slot++, toward: { dx: 0, dy: 0 } });
  }
  return out;
}

/** How many tiles apart (either way) clusters on one wall stand at least. */
const CLUSTER_GAP = 2;

/**
 * Up to `n` of `tiles`, each the one nearest an even mark along the wall
 * (`along`), at least `CLUSTER_GAP` from those already picked; sorted along.
 */
function spreadApart(
  tiles: readonly GridPoint[],
  along: (p: GridPoint) => number,
  n: number,
): GridPoint[] {
  if (tiles.length === 0) return [];
  const cs = tiles.map(along);
  const lo = Math.min(...cs);
  const hi = Math.max(...cs);
  const picked: GridPoint[] = [];
  for (let i = 0; i < n; i++) {
    const mark = lo + ((i + 0.5) * (hi - lo + 1)) / n - 0.5;
    let best: GridPoint | null = null;
    for (const p of tiles) {
      if (picked.some((q) => Math.max(Math.abs(q.x - p.x), Math.abs(q.y - p.y)) < CLUSTER_GAP))
        continue;
      const d = Math.abs(along(p) - mark);
      if (!best || d < Math.abs(along(best) - mark) - 1e-9) best = p;
    }
    if (best) picked.push(best);
  }
  return picked.sort((a, b) => along(a) - along(b) || a.x - b.x);
}

/**
 * Low clusters on the front wall along the map's front edge (each one a
 * whole cluster model, see `LOFT_FRONT_WALL_PROPS`), never beside a door and
 * nothing between: with the roof door on the front, one each side of it, in
 * the middle of the nearest stretch of free wall; else at most
 * `LOFT_CAP_CLUSTERS.front`, spread evenly along it.
 */
function frontProps(
  map: LevelMap,
  doors: readonly (Doorway | null)[],
  roofDoor: Doorway | null,
): LoftRoom['frontProps'] {
  const y = map.height - 1;
  const free: GridPoint[] = [];
  for (let x = 1; x < map.width - 1; x++)
    if (
      getTile(map, x, y) === 'wall' &&
      wallPiece(map, x, y) === 'wall-front' &&
      isOpen(map, x, y - 1) &&
      !nearDoor(doors, x, y, 1)
    )
      free.push({ x, y });
  if (free.length === 0) return [];
  let picked: GridPoint[];
  if (roofDoor?.side === 'front') {
    const xs = roofDoor.tiles.map((t) => t.x);
    const [d0, d1] = [Math.min(...xs), Math.max(...xs)];
    picked = [];
    for (const side of [-1, 1]) {
      // The stretch of free wall nearest the door on this side, its middle tile.
      const mine = free
        .filter((p) => (side < 0 ? p.x < d0 : p.x > d1))
        .sort((a, b) => (side < 0 ? b.x - a.x : a.x - b.x));
      const run: GridPoint[] = [];
      for (const p of mine) {
        const prev = run[run.length - 1];
        if (prev && Math.abs(prev.x - p.x) !== 1) break;
        run.push(p);
      }
      const mid = run[Math.floor((run.length - 1) / 2)];
      if (mid) picked.push(mid);
    }
  } else picked = spreadApart(free, (p) => p.x, LOFT_CAP_CLUSTERS.front);
  return picked.sort((a, b) => a.x - b.x).map((p, slot) => ({ ...p, slot }));
}

/** The black steel posts stand at a wall's ends and every this many tiles along it. */
export const POST_EVERY = 3;

/**
 * The black steel posts on the walls' inner faces (see `LoftRoom.posts`):
 * along each straight run of full wall facing open ground (not the low
 * front wall, not a door), one at each end (the room's corners) and every
 * `POST_EVERY` tiles, leaving out any beside a door or through a piece of
 * art.
 */
function posts(
  map: LevelMap,
  doors: readonly (Doorway | null)[],
  art: readonly LoftArtSpot[],
): LoftRoom['posts'] {
  const out: LoftRoom['posts'] = [];
  const door = (x: number, y: number) => nearDoor(doors, x, y, 0);
  const faces = (x: number, y: number, side: Side) => {
    const { dx, dy } = OUT[side];
    // The room is on the other side of the wall from its outside: open ground off the map's
    // edge (a hatch or a queue set into the outer wall is not the room).
    const [rx, ry] = [x - dx, y - dy];
    return (
      getTile(map, x, y) === 'wall' &&
      wallPiece(map, x, y) !== 'wall-front' &&
      !door(x, y) &&
      isOpen(map, rx, ry) &&
      rx > 0 &&
      ry > 0 &&
      rx < map.width - 1 &&
      ry < map.height - 1
    );
  };
  for (const side of ['back', 'left', 'right'] as const) {
    const across = side === 'back';
    const [outer, inner] = across ? [map.height, map.width] : [map.width, map.height];
    for (let a = 0; a < outer; a++) {
      let start = -1;
      for (let b = 0; b <= inner; b++) {
        const [x, y] = across ? [b, a] : [a, b];
        const on = b < inner && faces(x, y, side);
        if (on && start < 0) start = b;
        if (on || start < 0) continue;
        // The run is start..b-1: its ends and every POST_EVERY tiles between.
        const edges = new Set<number>();
        for (let e = start - 0.5; e < b - 0.5; e += POST_EVERY) edges.add(e);
        edges.add(b - 0.5);
        for (const e of edges) {
          const [px, py] = across ? [e, a] : [a, e];
          // Not beside a door (its frame is steel already).
          const [n0, n1] = across
            ? [door(e - 0.5, a), door(e + 0.5, a)]
            : [door(a, e - 0.5), door(a, e + 0.5)];
          if (n0 || n1) continue;
          if (
            across &&
            art.some((w) => w.y === a && Math.abs(w.x - e) < LOFT_ART_HALF[w.art] + POST_CLEAR)
          )
            continue;
          out.push({ x: px, y: py, side });
        }
        start = -1;
      }
    }
  }
  return out;
}

/** How far a post's middle keeps from the edge of a piece of art (its half width and a margin). */
const POST_CLEAR = 0.07;

/** A globe's half width (with a margin), and how far it moves along its row at most to clear a station. */
const GLOBE_HALF = 0.14;
const GLOBE_SHIFT_MAX = 1.5;
const GLOBE_SHIFT_STEP = 0.25;

/**
 * Where the globe for the lamp spot `at` hangs (see `RoomDressing.lamp.fit`):
 * high over the back rows, so on screen it lands on what stands just behind
 * and in front of it. It slides along its row, nearest first, until it
 * clears every station there and stays inside the room, or is left out.
 */
export function globeFit(at: Vec3, map: LevelMap): Vec3 | null {
  const near = Math.floor(at.z + 0.5);
  const blocked: number[] = [];
  for (const y of [Math.floor(at.z) - 1, Math.floor(at.z), near])
    for (let x = 0; x < map.width; x++) {
      const t = getTile(map, x, y);
      if (t !== null && t !== 'floor' && t !== 'wall' && t !== 'void' && t !== 'counter')
        blocked.push(x);
    }
  const inside = (x: number) => isOpen(map, Math.round(x), near);
  const ok = (x: number) =>
    inside(x - GLOBE_HALF) &&
    inside(x + GLOBE_HALF) &&
    blocked.every((bx) => Math.abs(bx - x) >= 0.5 + GLOBE_HALF);
  for (let d = 0; d <= GLOBE_SHIFT_MAX + 1e-9; d += GLOBE_SHIFT_STEP)
    for (const x of d === 0 ? [at.x] : [at.x - d, at.x + d]) if (ok(x)) return { ...at, x };
  return null;
}
