import { describe, expect, it } from 'vitest';
import { type MetricsSources, ShardMetrics, nodeMetricsSources } from './shardMetrics';
import { ShardLoad } from './shardLoad';

/** Sources whose numbers the test sets by hand. */
function fakeSources() {
  const s = {
    now: Date.UTC(2026, 10, 11, 12, 0, 0),
    cpu: 0,
    active: 0,
    idle: 0,
    p99: 3.25,
    resets: 0,
    rss: 120 * 1024 * 1024,
    heap: 40.55 * 1024 * 1024,
  };
  const sources: MetricsSources = {
    now: () => s.now,
    cpuUsage: () => ({ user: s.cpu * 0.75, system: s.cpu * 0.25 }),
    eventLoop: () => ({ active: s.active, idle: s.idle }),
    loopDelay: {
      percentileMs: () => s.p99,
      reset: () => {
        s.resets++;
      },
    },
    memory: () => ({ rss: s.rss, heapUsed: s.heap }),
  };
  return { s, sources };
}

describe('ShardMetrics', () => {
  it('measures CPU, event loop and loop delay since the last sample', () => {
    const { s, sources } = fakeSources();
    const metrics = new ShardMetrics({ version: ' abc123 ', sources });
    const load = new ShardLoad(4);
    expect(metrics.ops(load)).toMatchObject({ version: 'abc123', cpuPct: 0, uptimeS: 0 });

    s.now += 5000;
    s.cpu += 1_250_000; // 1.25 s of CPU in 5 s: a quarter of a core
    s.active += 1000;
    s.idle += 4000;
    metrics.sample();
    expect(s.resets).toBe(1);
    const ops = metrics.ops(load);
    expect(ops).toMatchObject({
      version: 'abc123',
      startedAt: '2026-11-11T12:00:00.000Z',
      uptimeS: 5,
      cpuPct: 25,
      eventLoopUtil: 0.2,
      loopDelayP99Ms: 3.3,
      rssMb: 120,
      heapUsedMb: 40.6,
      connections: 0,
      roundsStarted: 0,
      serverFullRefusals: 0,
      roomList: [],
    });

    // The next sample only covers what happened after the first.
    s.now += 1000;
    s.cpu += 500_000;
    s.active += 0;
    s.idle += 1000;
    metrics.sample();
    expect(metrics.ops(load)).toMatchObject({ cpuPct: 50, eventLoopUtil: 0, uptimeS: 6 });
  });

  it('carries the load: connections, counters and rooms', () => {
    const { sources } = fakeSources();
    const metrics = new ShardMetrics({ sources });
    const load = new ShardLoad(4);
    load.add(
      {},
      () => 2,
      () => ({
        connections: 2,
        summary: {
          code: 'ABCD',
          members: 2,
          players: 2,
          screen: 'playing',
          levelId: 'l1',
          ageS: 30,
          idleS: 1,
        },
      }),
    );
    load.roundsStarted = 3;
    load.serverFullRefusals = 1;
    const ops = metrics.ops(load);
    expect(ops.version).toBe('dev');
    expect(ops.connections).toBe(2);
    expect(ops.roundsStarted).toBe(3);
    expect(ops.serverFullRefusals).toBe(1);
    expect(ops.roomList).toEqual([expect.objectContaining({ code: 'ABCD', screen: 'playing' })]);
  });

  it('never reports NaN or a division by zero', () => {
    const { s, sources } = fakeSources();
    s.p99 = NaN;
    const metrics = new ShardMetrics({ sources });
    metrics.sample();
    expect(metrics.ops(new ShardLoad())).toMatchObject({
      cpuPct: 0,
      eventLoopUtil: 0,
      loopDelayP99Ms: 0,
    });
  });

  it('reads real numbers from Node', () => {
    const metrics = new ShardMetrics({ sources: nodeMetricsSources() });
    metrics.sample();
    const ops = metrics.ops(new ShardLoad());
    expect(ops.rssMb).toBeGreaterThan(0);
    expect(ops.heapUsedMb).toBeGreaterThan(0);
    expect(Number.isFinite(ops.cpuPct)).toBe(true);
  });
});
