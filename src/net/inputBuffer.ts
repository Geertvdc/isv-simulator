/**
 * The server's input buffer for one player. Clients stamp each input with the
 * server tick it is meant for and send it a little early; over a real
 * network inputs still arrive late, out of order or twice. Before each sim
 * tick the server takes exactly one input per player from here.
 *
 * - On time (for a tick that hasn't run): kept until its tick.
 * - Late (its tick already ran) by at most `NET_MAX_INPUT_LATE_TICKS`:
 *   applied at the next tick that hasn't run. Several due at once merge
 *   into one: the newest move and work, and a press of interact or dash in
 *   any of them counts, so a quick tap is never lost.
 * - Later than that, older than an input already applied, or a duplicate: dropped.
 * - Further ahead than `NET_MAX_INPUT_AHEAD_TICKS`: dropped.
 * - No input for a tick: the last one repeats as it was, buttons held stay
 *   held. Repeating never makes up a new interact or dash press, since the
 *   sim only acts when a button goes from up to down. After
 *   `NET_INPUT_REPEAT_TICKS` without input the player lets go and stands still.
 */

import {
  NET_INPUT_REPEAT_TICKS,
  NET_MAX_INPUT_AHEAD_TICKS,
  NET_MAX_INPUT_LATE_TICKS,
} from '../sim/balance';
import type { InputCommand, PlayerId } from '../sim/state';

export interface InputBuffer {
  playerId: PlayerId;
  /** Received inputs not applied yet, sorted by tick, at most one per tick. */
  pending: InputCommand[];
  /** The newest input applied, as it was sent: what repeats when inputs stop. */
  last: InputCommand | null;
  /** The newest input tick applied so far; inputs for this tick or older are stale. */
  appliedTick: number;
  /** Ticks in a row that ran without a new input. */
  missedTicks: number;
}

export type PushOutcome =
  /** For a tick that hasn't run: applied at its own tick. */
  | 'queued'
  /** Its tick already ran: applied at the next tick that hasn't. */
  | 'late'
  /** An input for this tick is already waiting. */
  | 'duplicate'
  /** An input for this tick or a later one was already applied. */
  | 'stale'
  | 'tooLate'
  | 'tooEarly'
  /** Meant for another player. */
  | 'wrongPlayer';

/** Whether an input with this outcome was kept. */
export function isAccepted(outcome: PushOutcome): boolean {
  return outcome === 'queued' || outcome === 'late';
}

export function createInputBuffer(playerId: PlayerId): InputBuffer {
  return { playerId, pending: [], last: null, appliedTick: -1, missedTicks: 0 };
}

function idleInput(playerId: PlayerId, tick: number): InputCommand {
  return { playerId, tick, move: { x: 0, y: 0 }, interact: false, work: false, dash: false };
}

/**
 * Receives one input. `nextTick` is the server tick that runs next (the
 * sim's `state.tick` during a round). Copies the input.
 */
export function pushInput(buffer: InputBuffer, input: InputCommand, nextTick: number): PushOutcome {
  if (input.playerId !== buffer.playerId) return 'wrongPlayer';
  if (input.tick <= buffer.appliedTick) return 'stale';
  if (nextTick - input.tick > NET_MAX_INPUT_LATE_TICKS) return 'tooLate';
  if (input.tick - nextTick > NET_MAX_INPUT_AHEAD_TICKS) return 'tooEarly';
  const at = buffer.pending.findIndex((p) => p.tick >= input.tick);
  if (at >= 0 && buffer.pending[at]?.tick === input.tick) return 'duplicate';
  const copy: InputCommand = { ...input, move: { ...input.move } };
  if (at < 0) buffer.pending.push(copy);
  else buffer.pending.splice(at, 0, copy);
  return input.tick < nextTick ? 'late' : 'queued';
}

/**
 * The input for server tick `tick`, about to run. Call once per tick, with
 * ticks going up. The result is stamped with `tick`.
 */
export function takeInput(buffer: InputBuffer, tick: number): InputCommand {
  let due = 0;
  while (due < buffer.pending.length && (buffer.pending[due]?.tick ?? Infinity) <= tick) due++;
  const taken = buffer.pending.splice(0, due);
  const newest = taken[taken.length - 1];

  if (!newest) {
    buffer.missedTicks++;
    if (!buffer.last || buffer.missedTicks > NET_INPUT_REPEAT_TICKS) {
      return idleInput(buffer.playerId, tick);
    }
    return { ...buffer.last, tick, move: { ...buffer.last.move } };
  }

  buffer.missedTicks = 0;
  buffer.appliedTick = newest.tick;
  buffer.last = newest;
  return {
    ...newest,
    tick,
    move: { ...newest.move },
    interact: taken.some((i) => i.interact),
    dash: taken.some((i) => i.dash),
  };
}
