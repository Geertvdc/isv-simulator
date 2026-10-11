/**
 * Snapshots: what the server sends clients about a round, every
 * `NET_SNAPSHOT_EVERY_TICKS`. The whole `GameState` minus the static level
 * map (sent once at round start), plus every sim event since the last
 * snapshot, so clients can play sounds and effects for ticks they never saw.
 */

import { NET_SNAPSHOT_EVERY_TICKS } from '../sim/balance';
import type { LevelMap } from '../sim/level';
import type { GameEvent } from '../sim/orders';
import type { GameState } from '../sim/state';

/** A `GameState` without its level map. */
export type SnapshotState = Omit<GameState, 'level'>;

export interface Snapshot {
  /**
   * The server's tick count when this was taken. Unlike `state.tick` it never
   * stops (pause, countdown, menus), so clients sync their clock to it.
   */
  serverTick: number;
  state: SnapshotState;
  /** Every sim event since the previous snapshot, oldest first. */
  events: GameEvent[];
}

/** Whether the server sends a snapshot after this server tick. */
export function isSnapshotTick(serverTick: number): boolean {
  return serverTick % NET_SNAPSHOT_EVERY_TICKS === 0;
}

/** A snapshot of `state`. Deep-copies, so the server can keep mutating `state`. */
export function encodeSnapshot(
  state: GameState,
  serverTick: number,
  events: readonly GameEvent[],
): Snapshot {
  const rest: Partial<GameState> = { ...state };
  delete rest.level;
  return structuredClone({ serverTick, state: rest as SnapshotState, events: [...events] });
}

/** The full game state back from a snapshot and the round's map. Deep-copies. */
export function decodeSnapshot(snapshot: Snapshot, level: LevelMap): GameState {
  return { ...structuredClone(snapshot.state), level: structuredClone(level) };
}

/** The server's side: the events since the last snapshot. */
export interface SnapshotLog {
  events: GameEvent[];
}

export function createSnapshotLog(): SnapshotLog {
  return { events: [] };
}

/** Call after every sim tick: keeps that tick's events for the next snapshot. */
export function recordTick(log: SnapshotLog, state: GameState): void {
  log.events.push(...state.events);
}

/** A snapshot with every event recorded since the last one; starts collecting afresh. */
export function takeSnapshot(log: SnapshotLog, state: GameState, serverTick: number): Snapshot {
  const snapshot = encodeSnapshot(state, serverTick, log.events);
  log.events = [];
  return snapshot;
}
