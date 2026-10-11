/**
 * An online round as this browser sees it: the static map from `roundStart`,
 * the snapshots that came since (decoded and buffered for interpolation) and
 * their events, waiting to be played.
 *
 * Events are played when render time reaches the snapshot that brought them,
 * not when it arrives: the client draws the round `NET_INTERP_DELAY_MS`
 * behind, so a sound played on arrival would come before the picture shows
 * what made it. Each snapshot's events are played exactly once.
 */

import { NET_SNAPSHOT_BUFFER_SIZE, TICKS_PER_SECOND } from '../sim/balance';
import type { LevelMap } from '../sim/level';
import type { GameEvent } from '../sim/orders';
import type { GameState } from '../sim/state';
import { type ClockSync, estimateServerTick } from './clock';
import {
  type InterpolatedFrame,
  type SnapshotBuffer,
  createSnapshotBuffer,
  pushSnapshot,
  renderTickFor,
  sampleAt,
} from './interpolation';
import type { RoundStartMessage } from './protocol';
import type { Snapshot } from './snapshot';

const TICK_MS = 1000 / TICKS_PER_SECOND;

interface QueuedEvents {
  serverTick: number;
  events: GameEvent[];
}

export interface OnlineRound {
  /** The room's id for this round: a `roundStart` with the same id is this round again (a reconnect). */
  roundId: number;
  /** It counts for this browser: it was in the room when the round started. */
  counted: boolean;
  /** A snapshot of it still playing came in (a page that comes back on the results never saw it). */
  sawPlaying: boolean;
  levelId: string;
  level: LevelMap;
  buffer: SnapshotBuffer<GameState>;
  /** Events of buffered snapshots not played yet, oldest first. */
  pending: QueuedEvents[];
}

/** The game state from a snapshot, with the round's map (shared, not copied: it never changes). */
function stateOf(snapshot: Snapshot, level: LevelMap): GameState {
  return { ...snapshot.state, level };
}

/** A round from its `roundStart`: the map, and the first snapshot (it has no events). */
export function startOnlineRound(message: RoundStartMessage): OnlineRound {
  const round: OnlineRound = {
    roundId: message.roundId,
    counted: message.counted,
    sawPlaying: false,
    levelId: message.levelId,
    level: message.level,
    buffer: createSnapshotBuffer(),
    pending: [],
  };
  pushRoundSnapshot(round, message.snapshot);
  return round;
}

/**
 * A `roundStart` came while a round is on screen. The same round again (a
 * reconnect: same id) carries on, with its buffer and events, and takes in
 * the new snapshot; returns the round to show: `round`, or a new one.
 */
export function continueOnlineRound(
  round: OnlineRound | null,
  message: RoundStartMessage,
): OnlineRound {
  if (round?.roundId !== message.roundId || round.levelId !== message.levelId) {
    return startOnlineRound(message);
  }
  round.counted = message.counted;
  pushRoundSnapshot(round, message.snapshot);
  return round;
}

/**
 * Takes in a snapshot of this round. Duplicates and out-of-order ones are
 * dropped with their events (they were queued the first time). Returns
 * whether it was kept.
 */
export function pushRoundSnapshot(round: OnlineRound, snapshot: Snapshot): boolean {
  if (!pushSnapshot(round.buffer, snapshot.serverTick, stateOf(snapshot, round.level))) {
    return false;
  }
  if (!snapshot.state.result) round.sawPlaying = true;
  if (snapshot.events.length > 0) {
    round.pending.push({ serverTick: snapshot.serverTick, events: snapshot.events });
    // Never more than the buffer holds: if nobody plays them, old ones go.
    if (round.pending.length > NET_SNAPSHOT_BUFFER_SIZE) round.pending.shift();
  }
  return true;
}

/**
 * The server tick to draw now: the clock's estimate of the server's tick,
 * minus the time a snapshot takes to get here (half the round trip), minus
 * the interpolation delay. Without the half round trip, a slow connection
 * would put render time right at the newest snapshot, and it would stutter
 * waiting for each one. `null` until the clock is synced.
 */
export function roundRenderTick(clock: ClockSync, nowMs: number): number | null {
  const now = estimateServerTick(clock, nowMs);
  if (now === null || clock.rttMs === null) return null;
  return renderTickFor(now - clock.rttMs / 2 / TICK_MS);
}

/**
 * What to draw at `renderTick`. With no tick yet (clock not synced), the
 * newest snapshot.
 */
export function sampleRound(
  round: OnlineRound,
  renderTick: number | null,
): InterpolatedFrame<GameState> | null {
  const newest = round.buffer.entries[round.buffer.entries.length - 1];
  if (!newest) return null;
  return sampleAt(round.buffer, renderTick ?? newest.serverTick);
}

/**
 * The events of every snapshot at or before `renderTick` that weren't played
 * yet, oldest first. Each event comes out once. `null` (clock not synced)
 * plays everything.
 */
export function takeDueEvents(round: OnlineRound, renderTick: number | null): GameEvent[] {
  let due = 0;
  while (
    due < round.pending.length &&
    (renderTick === null || (round.pending[due]?.serverTick ?? Infinity) <= renderTick)
  ) {
    due++;
  }
  return round.pending.splice(0, due).flatMap((q) => q.events);
}
