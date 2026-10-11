/**
 * A dev-only lag simulator: delays messages by a fixed lag plus random
 * jitter, to see how online play holds up over a slow network on one
 * machine. The browser takes it from `?lag=<ms>&jitter=<ms>`, the server
 * from `NET_LAG_MS` and `NET_JITTER_MS`. Each side delays what it sends and
 * what it receives, so `lag=100` on one side adds 200 ms to the round trip.
 *
 * WebSockets keep messages in order, so a simulated one does too: a message
 * is never delivered before the one sent before it, even when its jitter
 * came out shorter.
 */

import { MAX_SIMULATED_LAG_MS } from '../sim/balance';
import { type RngState, createRng, next } from '../sim/rng';

export interface LagSettings {
  /** Added to every message, in ms. */
  lagMs: number;
  /** Up to this much more, at random, in ms. */
  jitterMs: number;
}

export interface LagLine {
  settings: LagSettings;
  rng: RngState;
  /** When the last message is delivered: the next one can't come before it. */
  lastDeliveryMs: number;
}

function ms(text: string | null | undefined): number | null {
  if (text === null || text === undefined || text.trim() === '') return null;
  const n = Number(text);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.min(MAX_SIMULATED_LAG_MS, n);
}

/**
 * Lag settings from text values (`?lag=` and `?jitter=`, or the env vars).
 * `null` when there's no lag to simulate: neither given, or both zero or junk.
 */
export function parseLag(
  lag: string | null | undefined,
  jitter: string | null | undefined,
): LagSettings | null {
  const lagMs = ms(lag) ?? 0;
  const jitterMs = ms(jitter) ?? 0;
  return lagMs > 0 || jitterMs > 0 ? { lagMs, jitterMs } : null;
}

export function createLagLine(settings: LagSettings, seed: number): LagLine {
  return { settings, rng: createRng(seed), lastDeliveryMs: -Infinity };
}

/** The local time a message handed over at `nowMs` should be delivered. */
export function deliveryTime(line: LagLine, nowMs: number): number {
  const [r, rng] = next(line.rng);
  line.rng = rng;
  const at = nowMs + line.settings.lagMs + r * line.settings.jitterMs;
  line.lastDeliveryMs = Math.max(line.lastDeliveryMs, at);
  return line.lastDeliveryMs;
}
