/**
 * Clock sync: the client's estimate of the server's tick, from ping/pong.
 * The server is the only clock; the client needs its tick to stamp inputs
 * (so they arrive just before the tick they're for) and to pick the render
 * time for interpolation.
 *
 * Each pong gives one sample: the round trip time, and the offset between
 * the local clock and the server tick, assuming the pong took half the
 * round trip to come back. Network jitter makes single samples noisy, and
 * mostly in one direction (a delayed packet only makes the round trip
 * longer), so the estimate averages the offsets of the half of the recent
 * samples with the shortest round trips, much like NTP does.
 *
 * Time comes in as an argument: any local clock in ms that only goes forward.
 */

import {
  NET_CLOCK_RESYNC_TICKS,
  NET_CLOCK_RTT_SMOOTHING,
  NET_CLOCK_SAMPLES,
  NET_INPUT_LEAD_TICKS,
  TICKS_PER_SECOND,
} from '../sim/balance';

const TICK_MS = 1000 / TICKS_PER_SECOND;
/** Pings that must disagree with the estimate in a row before it restarts. */
const RESYNC_CONFIRMATIONS = 2;

export interface ClockSample {
  rttMs: number;
  /** Server tick minus local time in ticks. */
  offsetTicks: number;
}

export interface ClockSync {
  /** Recent samples, oldest first, at most `NET_CLOCK_SAMPLES`. */
  samples: ClockSample[];
  /** Server tick = local ms / tick ms + this. `null` before the first pong. */
  offsetTicks: number | null;
  /** Smoothed round trip time; `null` before the first pong. */
  rttMs: number | null;
  /** Pings in a row that disagreed with the estimate by more than `NET_CLOCK_RESYNC_TICKS`. */
  disagreements: number;
}

/** What a pong tells the clock. */
export interface PongSample {
  /** The client time the ping was sent at, echoed by the server. */
  clientTimeMs: number;
  /** The server's tick count when it answered. */
  serverTick: number;
}

export function createClockSync(): ClockSync {
  return { samples: [], offsetTicks: null, rttMs: null, disagreements: 0 };
}

/** Whether at least one pong came back. */
export function isSynced(clock: ClockSync): boolean {
  return clock.offsetTicks !== null;
}

function bestOffset(samples: readonly ClockSample[]): number {
  const best = [...samples]
    .sort((a, b) => a.rttMs - b.rttMs)
    .slice(0, Math.ceil(samples.length / 2));
  return best.reduce((sum, s) => sum + s.offsetTicks, 0) / best.length;
}

/** Takes in a pong that arrived at local time `nowMs`. */
export function addPong(clock: ClockSync, pong: PongSample, nowMs: number): void {
  const rttMs = Math.max(0, nowMs - pong.clientTimeMs);
  // The server answered somewhere during tick `serverTick`, half a tick in on average,
  // and (we assume) half the round trip ago.
  const offsetTicks = pong.serverTick + 0.5 + rttMs / 2 / TICK_MS - nowMs / TICK_MS;

  if (
    clock.offsetTicks !== null &&
    Math.abs(offsetTicks - clock.offsetTicks) > NET_CLOCK_RESYNC_TICKS
  ) {
    clock.disagreements++;
    if (clock.disagreements < RESYNC_CONFIRMATIONS) return;
    // The server clock jumped (or we were badly off): start over.
    clock.samples = [];
  }
  clock.disagreements = 0;

  clock.samples.push({ rttMs, offsetTicks });
  if (clock.samples.length > NET_CLOCK_SAMPLES) clock.samples.shift();
  clock.offsetTicks = bestOffset(clock.samples);
  clock.rttMs =
    clock.rttMs === null ? rttMs : clock.rttMs + NET_CLOCK_RTT_SMOOTHING * (rttMs - clock.rttMs);
}

/** The server's tick right now, with a fraction; `null` before the first pong. */
export function estimateServerTick(clock: ClockSync, nowMs: number): number | null {
  return clock.offsetTicks === null ? null : nowMs / TICK_MS + clock.offsetTicks;
}

/**
 * The tick to stamp an input with that is sent now: the tick running on the
 * server when it gets there (half a round trip from now), plus a small lead
 * so it arrives just before. `null` before the first pong.
 */
export function inputTargetTick(clock: ClockSync, nowMs: number): number | null {
  const now = estimateServerTick(clock, nowMs);
  if (now === null || clock.rttMs === null) return null;
  return Math.floor(now + clock.rttMs / 2 / TICK_MS + NET_INPUT_LEAD_TICKS);
}
