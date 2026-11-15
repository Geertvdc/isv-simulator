/**
 * Campus mechanics (Big Tech chapter). The campus shuttle (`Y`) is a lift
 * with two one-tile stops (`lifts.ts`); the rest is here:
 *
 * - Travelator (`Q`): a run of moving floor. Whoever stands on it is carried
 *   along its direction (level setting, one per run); walking with it is
 *   fast, against it slow. A ticket left on it rides to the end.
 * - Revolving door (`*`): one person at a time; a thrown ticket bounces off
 *   the glass (`throw.ts`).
 * - Belt outage: some incidents stop every belt until the hotfix ships.
 */

import { TICKS_PER_SECOND, TRAVELATOR_SPEED, TRAVELATOR_TICKET_TICKS } from './balance';
import { type GridPoint, type LevelMap, markAt } from './level';
import { type BlockCheck, resolveCollisions } from './movement';
import type { GameState, Player, PlayerId } from './state';

const DT = 1 / TICKS_PER_SECOND;

const SIDES: readonly GridPoint[] = [
  { x: 0, y: -1 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
];

const runCache = new WeakMap<LevelMap, Map<number, number>>();

/** Each travelator tile's run: touching `Q` tiles form a run, runs in reading order. */
function travelatorRuns(map: LevelMap): Map<number, number> {
  const cached = runCache.get(map);
  if (cached) return cached;
  const key = (p: GridPoint): number => p.y * map.width + p.x;
  const tiles = map.marks.filter((m) => m.kind === 'travelator');
  const runOf = new Map<number, number>();
  let run = 0;
  for (const start of tiles) {
    if (runOf.has(key(start))) continue;
    const todo: GridPoint[] = [start];
    runOf.set(key(start), run);
    for (let p = todo.pop(); p; p = todo.pop()) {
      for (const d of SIDES) {
        const next = { x: p.x + d.x, y: p.y + d.y };
        if (markAt(map, next.x, next.y) !== 'travelator' || runOf.has(key(next))) continue;
        runOf.set(key(next), run);
        todo.push(next);
      }
    }
    run++;
  }
  runCache.set(map, runOf);
  return runOf;
}

/** The way the travelator on tile (x, y) runs, or `null` when there is none (or no direction set). */
export function travelatorDir(
  map: LevelMap,
  dirs: readonly GridPoint[] | undefined,
  x: number,
  y: number,
): GridPoint | null {
  const run = travelatorRuns(map).get(y * map.width + x);
  if (run === undefined) return null;
  return dirs?.[run] ?? null;
}

/** Carries a player standing on a travelator one tick along it. Mutates the player. */
export function driftPlayer(
  map: LevelMap,
  dirs: readonly GridPoint[] | undefined,
  player: Player,
): void {
  const dir = travelatorDir(map, dirs, Math.round(player.pos.x), Math.round(player.pos.y));
  if (!dir) return;
  player.pos.x += dir.x * TRAVELATOR_SPEED * DT;
  player.pos.y += dir.y * TRAVELATOR_SPEED * DT;
  resolveCollisions(map, player.pos);
}

/** Per tick: tickets lying on a travelator ride on, a tile at a time, and stop at its end. */
export function updateTravelators(state: GameState): void {
  const dirs = state.settings.travelators;
  if (!dirs || state.tick % TRAVELATOR_TICKET_TICKS !== 0) return;
  for (const ticket of state.tickets) {
    const loc = ticket.location;
    if (loc.kind !== 'tile') continue;
    const dir = travelatorDir(state.level, dirs, loc.x, loc.y);
    if (!dir) continue;
    const x = loc.x + dir.x;
    const y = loc.y + dir.y;
    if (markAt(state.level, x, y) !== 'travelator') continue;
    if (
      state.tickets.some(
        (t) => t.location.kind === 'tile' && t.location.x === x && t.location.y === y,
      )
    ) {
      continue;
    }
    ticket.location = { kind: 'tile', x, y };
  }
}

/**
 * Revolving doors taken by someone else, for moving `playerId`: a door with
 * another player in it is a wall until they're through.
 */
export function revolvingBlocks(
  map: LevelMap,
  players: readonly { id: PlayerId; pos: { x: number; y: number } }[],
  playerId: PlayerId,
): BlockCheck {
  const taken = players
    .filter((p) => p.id !== playerId)
    .map((p) => ({ x: Math.round(p.pos.x), y: Math.round(p.pos.y) }))
    .filter((t) => markAt(map, t.x, t.y) === 'revolvingDoor');
  if (taken.length === 0) return () => false;
  return (x, y) => taken.some((t) => t.x === x && t.y === y);
}

/** Whether a belt outage has every belt stopped: an open incident that is one. */
export function beltsStopped(state: GameState): boolean {
  return state.orders.some((o) => o.beltOutage === true);
}
