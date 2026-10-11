import { describe, expect, it } from 'vitest';
import { NET_INPUT_LEAD_TICKS, TICKS_PER_SECOND } from '../sim/balance';
import { Rng } from '../sim/rng';
import {
  addPong,
  createClockSync,
  estimateServerTick,
  inputTargetTick,
  inputTargetTickExact,
  isSynced,
} from './clock';

const TICK_MS = 1000 / TICKS_PER_SECOND;

/**
 * A pretend network: the server's tick at local time `t` is
 * `(t + serverAheadMs) / TICK_MS`, and each way takes a base delay plus
 * random jitter.
 */
function network({
  serverAheadMs,
  upMs,
  downMs,
  jitterMs,
  seed = 1,
}: {
  serverAheadMs: number;
  upMs: number;
  downMs: number;
  jitterMs: number;
  seed?: number;
}) {
  const rng = new Rng(seed);
  const trueTick = (t: number): number => (t + serverAheadMs) / TICK_MS;
  return {
    trueTick,
    /** Pings at `sentMs`; returns the pong and when it arrives. */
    ping(sentMs: number) {
      const up = upMs + rng.next() * jitterMs;
      const down = downMs + rng.next() * jitterMs;
      const serverTick = Math.floor(trueTick(sentMs + up));
      return { pong: { clientTimeMs: sentMs, serverTick }, arrivesMs: sentMs + up + down };
    },
  };
}

describe('clock sync', () => {
  it('knows nothing before the first pong', () => {
    const clock = createClockSync();
    expect(isSynced(clock)).toBe(false);
    expect(estimateServerTick(clock, 1000)).toBeNull();
    expect(inputTargetTick(clock, 1000)).toBeNull();
  });

  it('is within half a tick with a steady, symmetric network', () => {
    const net = network({ serverAheadMs: 123_456, upMs: 40, downMs: 40, jitterMs: 0 });
    const clock = createClockSync();
    const { pong, arrivesMs } = net.ping(1000);
    addPong(clock, pong, arrivesMs);
    expect(isSynced(clock)).toBe(true);
    expect(clock.rttMs).toBeCloseTo(80);
    for (const t of [arrivesMs, arrivesMs + 500, arrivesMs + 60_000]) {
      const estimate = estimateServerTick(clock, t);
      expect(Math.abs((estimate ?? NaN) - net.trueTick(t))).toBeLessThanOrEqual(0.5);
    }
  });

  it('converges to within a tick under jitter and an uneven path', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      // 40 to 100 ms there and 50 to 110 ms back. No clock sync can see an uneven
      // path, so its 5 ms bias stays; the server tick's whole-tick steps add up to half a tick.
      const net = network({ serverAheadMs: -5_000, upMs: 40, downMs: 50, jitterMs: 60, seed });
      const clock = createClockSync();
      const errors: number[] = [];
      for (let sent = 0; sent < 20_000; sent += 250) {
        const { pong, arrivesMs } = net.ping(sent);
        addPong(clock, pong, arrivesMs);
        errors.push(
          Math.abs((estimateServerTick(clock, arrivesMs) ?? NaN) - net.trueTick(arrivesMs)),
        );
      }
      // Settled after a few seconds, and stays settled.
      const settled = errors.slice(20);
      expect(Math.max(...settled)).toBeLessThan(1);
      expect(settled.reduce((a, b) => a + b, 0) / settled.length).toBeLessThan(0.5);
    }
  });

  it('tracks the round trip time', () => {
    const net = network({ serverAheadMs: 0, upMs: 50, downMs: 50, jitterMs: 40 });
    const clock = createClockSync();
    for (let sent = 0; sent < 30_000; sent += 250) {
      const { pong, arrivesMs } = net.ping(sent);
      addPong(clock, pong, arrivesMs);
    }
    // Mean round trip is 100 + 2 * 20.
    expect(clock.rttMs).toBeGreaterThan(125);
    expect(clock.rttMs).toBeLessThan(155);
  });

  it('ignores a single wild ping but restarts when the server clock really jumped', () => {
    let serverAheadMs = 10_000;
    const clock = createClockSync();
    const trueTick = (t: number): number => (t + serverAheadMs) / TICK_MS;
    const pingAt = (sent: number): void => {
      addPong(
        clock,
        { clientTimeMs: sent, serverTick: Math.floor(trueTick(sent + 20)) },
        sent + 40,
      );
    };
    for (let sent = 0; sent < 5000; sent += 250) pingAt(sent);

    // One pong held up for 2 seconds on its way back.
    addPong(clock, { clientTimeMs: 5000, serverTick: Math.floor(trueTick(5020)) }, 7000);
    expect(Math.abs((estimateServerTick(clock, 7000) ?? NaN) - trueTick(7000))).toBeLessThan(1);

    // The server restarted: its clock is now 50 s behind.
    serverAheadMs -= 50_000;
    for (let sent = 7250; sent < 10_000; sent += 250) pingAt(sent);
    expect(Math.abs((estimateServerTick(clock, 10_000) ?? NaN) - trueTick(10_000))).toBeLessThan(1);
  });

  it('stamps inputs for when they reach the server, plus the lead', () => {
    const clock = createClockSync();
    // 100 ms round trip; the server is at tick 600 when the pong arrives.
    addPong(clock, { clientTimeMs: 900, serverTick: 597 }, 1000);
    const now = estimateServerTick(clock, 1000) ?? NaN;
    expect(now).toBeCloseTo(597 + 0.5 + 50 / TICK_MS);
    expect(inputTargetTick(clock, 1000)).toBe(
      Math.floor(now + 50 / TICK_MS + NET_INPUT_LEAD_TICKS),
    );
  });

  it('gives the target tick with its fraction for prediction', () => {
    const clock = createClockSync();
    expect(inputTargetTickExact(clock, 1000)).toBeNull();
    addPong(clock, { clientTimeMs: 900, serverTick: 597 }, 1000);
    const exact = inputTargetTickExact(clock, 1000) ?? NaN;
    expect(Math.floor(exact)).toBe(inputTargetTick(clock, 1000));
    expect(exact).toBeCloseTo(
      (estimateServerTick(clock, 1000) ?? NaN) + 50 / TICK_MS + NET_INPUT_LEAD_TICKS,
    );
  });
});
