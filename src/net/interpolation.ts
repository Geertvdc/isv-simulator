/**
 * Client-side interpolation. Snapshots come in 20 times a second, a bit
 * irregularly; drawing each as it arrives would stutter. Instead the client
 * renders `NET_INTERP_DELAY_MS` behind the server, so there is (almost)
 * always a snapshot on each side of the render time, and glides player and
 * manager positions between those two, like `GameLoop` does between ticks
 * in couch play. Everything else (tickets, orders, score) comes from the
 * older of the two snapshots.
 */

import {
  NET_INTERP_DELAY_MS,
  NET_INTERP_SNAP_DISTANCE,
  NET_SNAPSHOT_BUFFER_SIZE,
  TICKS_PER_SECOND,
} from '../sim/balance';
import type { Vec } from '../sim/state';

const DELAY_TICKS = (NET_INTERP_DELAY_MS * TICKS_PER_SECOND) / 1000;

interface Positioned {
  id: number;
  pos: Vec;
}

/** What interpolation needs from a state; `GameState` and `SnapshotState` both fit. */
export interface InterpolatableState {
  levelId: string;
  tick: number;
  players: readonly Positioned[];
  managers: readonly Positioned[];
}

export interface BufferedSnapshot<S> {
  serverTick: number;
  state: S;
}

export interface SnapshotBuffer<S extends InterpolatableState> {
  /** Oldest first, at most `NET_SNAPSHOT_BUFFER_SIZE`. */
  entries: BufferedSnapshot<S>[];
}

export type InterpolationStatus =
  /** Render time sits between two snapshots (or exactly on one). */
  | 'interpolating'
  /** Render time is past the newest snapshot: holding it until the next arrives. */
  | 'waiting'
  /** Render time is before the oldest snapshot kept: holding the oldest. */
  | 'behind';

export interface InterpolatedFrame<S> {
  /** The snapshot at or before the render time: everything that isn't a position. */
  state: S;
  serverTick: number;
  /** How far the render time is from `state` to the next snapshot, 0 to 1. */
  alpha: number;
  status: InterpolationStatus;
  /** Where to draw each player in `state`, by id. */
  players: Record<number, Vec>;
  /** Where to draw each manager in `state`, by id. */
  managers: Record<number, Vec>;
}

export function createSnapshotBuffer<S extends InterpolatableState>(): SnapshotBuffer<S> {
  return { entries: [] };
}

/**
 * Adds a snapshot. Ignores one that is not newer than the newest kept
 * (a duplicate or out of order) and returns false for it.
 */
export function pushSnapshot<S extends InterpolatableState>(
  buffer: SnapshotBuffer<S>,
  serverTick: number,
  state: S,
): boolean {
  const newest = buffer.entries[buffer.entries.length - 1];
  if (newest && serverTick <= newest.serverTick) return false;
  buffer.entries.push({ serverTick, state });
  if (buffer.entries.length > NET_SNAPSHOT_BUFFER_SIZE) buffer.entries.shift();
  return true;
}

/** The server tick to render at, given the clock sync's estimate of the server's tick now. */
export function renderTickFor(estimatedServerTick: number): number {
  return estimatedServerTick - DELAY_TICKS;
}

function lerp(from: Vec, to: Vec, t: number): Vec {
  return { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t };
}

/** Positions of `from`'s entities, glided toward where `to` has them. */
function positions(
  from: readonly Positioned[],
  to: readonly Positioned[] | null,
  alpha: number,
): Record<number, Vec> {
  const result: Record<number, Vec> = {};
  for (const e of from) {
    const next = to?.find((n) => n.id === e.id);
    const jumped =
      next !== undefined &&
      Math.hypot(next.pos.x - e.pos.x, next.pos.y - e.pos.y) > NET_INTERP_SNAP_DISTANCE;
    result[e.id] = next && !jumped ? lerp(e.pos, next.pos, alpha) : { x: e.pos.x, y: e.pos.y };
  }
  return result;
}

function hold<S extends InterpolatableState>(
  entry: BufferedSnapshot<S>,
  status: InterpolationStatus,
): InterpolatedFrame<S> {
  return {
    state: entry.state,
    serverTick: entry.serverTick,
    alpha: 0,
    status,
    players: positions(entry.state.players, null, 0),
    managers: positions(entry.state.managers, null, 0),
  };
}

/** Whether two snapshots belong to the same round, so gliding between them makes sense. */
function sameRound(a: InterpolatableState, b: InterpolatableState): boolean {
  return a.levelId === b.levelId && b.tick >= a.tick;
}

/** What to draw at `renderTick` (a server tick, with a fraction); `null` with no snapshots. */
export function sampleAt<S extends InterpolatableState>(
  buffer: SnapshotBuffer<S>,
  renderTick: number,
): InterpolatedFrame<S> | null {
  const { entries } = buffer;
  const oldest = entries[0];
  const newest = entries[entries.length - 1];
  if (!oldest || !newest) return null;
  if (renderTick > newest.serverTick) return hold(newest, 'waiting');
  if (renderTick < oldest.serverTick) return hold(oldest, 'behind');

  let i = entries.length - 1;
  while (i > 0 && (entries[i]?.serverTick ?? -Infinity) > renderTick) i--;
  const from = entries[i] ?? oldest;
  const to = entries[i + 1];
  if (!to || !sameRound(from.state, to.state)) return hold(from, 'interpolating');

  const alpha = (renderTick - from.serverTick) / (to.serverTick - from.serverTick);
  return {
    state: from.state,
    serverTick: from.serverTick,
    alpha,
    status: 'interpolating',
    players: positions(from.state.players, to.state.players, alpha),
    managers: positions(from.state.managers, to.state.managers, alpha),
  };
}
