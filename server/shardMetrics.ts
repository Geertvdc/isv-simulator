/**
 * This process's operational numbers for the ops dashboard (`ShardOps` in
 * `src/net/pool.ts`), carried by the pool heartbeat:
 *
 * - CPU: `process.cpuUsage` over the wall time since the last sample, in %
 *   of one core (can pass 100 with worker threads).
 * - Event loop: utilization (`performance.eventLoopUtilization`) and the
 *   99th percentile delay (`monitorEventLoopDelay`) since the last sample;
 *   the delay histogram restarts with every sample.
 * - Memory: RSS and V8 heap used, in MB.
 * - From `ShardLoad`: connections, rooms, rounds started, `serverFull`
 *   refusals and the room list.
 *
 * `sample()` runs every `NET_SHARD_METRICS_MS` (`start()`); `ops()` returns
 * the latest sample plus the live load numbers. The sources come in as
 * options, so the tests use fakes.
 */

import { monitorEventLoopDelay, performance } from 'node:perf_hooks';
import type { ShardOps } from '../src/net/pool';
import { NET_SHARD_METRICS_MS } from '../src/sim/balance';
import type { ShardLoad } from './shardLoad';

/** Where the numbers come from; `nodeMetricsSources()` in production. */
export interface MetricsSources {
  /** Wall clock, ms. */
  now(): number;
  /** CPU time used by the process so far, µs. */
  cpuUsage(): { user: number; system: number };
  /** Event loop time so far, ms: busy (`active`) and waiting (`idle`). */
  eventLoop(): { active: number; idle: number };
  /** Event loop delay since the last `reset`. */
  loopDelay: { percentileMs(p: number): number; reset(): void };
  /** Bytes. */
  memory(): { rss: number; heapUsed: number };
}

/** The real sources: `process`, `perf_hooks`. */
export function nodeMetricsSources(): MetricsSources {
  const histogram = monitorEventLoopDelay({ resolution: 10 });
  histogram.enable();
  return {
    now: () => Date.now(),
    cpuUsage: () => process.cpuUsage(),
    eventLoop: () => {
      const { active, idle } = performance.eventLoopUtilization();
      return { active, idle };
    },
    loopDelay: {
      percentileMs: (p) => histogram.percentile(p) / 1e6,
      reset: () => {
        histogram.reset();
      },
    },
    memory: () => {
      const { rss, heapUsed } = process.memoryUsage();
      return { rss, heapUsed };
    },
  };
}

interface Sample {
  cpuPct: number;
  eventLoopUtil: number;
  loopDelayP99Ms: number;
  rssMb: number;
  heapUsedMb: number;
}

const round = (value: number, digits: number): number => {
  const f = 10 ** digits;
  return Number.isFinite(value) ? Math.round(value * f) / f : 0;
};

const MB = 1024 * 1024;

export interface ShardMetricsOptions {
  /** `APP_VERSION`; `dev` by default. */
  version?: string;
  sources?: MetricsSources;
}

export class ShardMetrics {
  readonly version: string;
  private readonly sources: MetricsSources;
  private readonly startedAt: number;
  private last: { at: number; cpu: number; active: number; idle: number };
  private latest: Sample;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(options: ShardMetricsOptions = {}) {
    this.version = options.version?.trim() || 'dev';
    this.sources = options.sources ?? nodeMetricsSources();
    this.startedAt = this.sources.now();
    this.last = this.read();
    const { rss, heapUsed } = this.sources.memory();
    this.latest = {
      cpuPct: 0,
      eventLoopUtil: 0,
      loopDelayP99Ms: 0,
      rssMb: round(rss / MB, 1),
      heapUsedMb: round(heapUsed / MB, 1),
    };
  }

  /** Measures CPU, event loop and memory since the last sample. */
  sample(): void {
    const now = this.read();
    const wallMs = now.at - this.last.at;
    const cpuMs = (now.cpu - this.last.cpu) / 1000;
    const active = now.active - this.last.active;
    const busyAndIdle = active + (now.idle - this.last.idle);
    const { rss, heapUsed } = this.sources.memory();
    this.latest = {
      cpuPct: wallMs > 0 ? round((cpuMs / wallMs) * 100, 1) : 0,
      eventLoopUtil: busyAndIdle > 0 ? round(active / busyAndIdle, 3) : 0,
      loopDelayP99Ms: round(this.sources.loopDelay.percentileMs(99), 1),
      rssMb: round(rss / MB, 1),
      heapUsedMb: round(heapUsed / MB, 1),
    };
    this.sources.loopDelay.reset();
    this.last = now;
  }

  /** The latest sample plus `load`'s live numbers. */
  ops(load: ShardLoad): ShardOps {
    return {
      version: this.version,
      startedAt: new Date(this.startedAt).toISOString(),
      uptimeS: Math.max(0, Math.floor((this.sources.now() - this.startedAt) / 1000)),
      ...this.latest,
      connections: load.connections,
      roundsStarted: load.roundsStarted,
      serverFullRefusals: load.serverFullRefusals,
      roomList: load.roomList(),
    };
  }

  /** Samples every `NET_SHARD_METRICS_MS`. */
  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      this.sample();
    }, NET_SHARD_METRICS_MS);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private read() {
    const { user, system } = this.sources.cpuUsage();
    const { active, idle } = this.sources.eventLoop();
    return { at: this.sources.now(), cpu: user + system, active, idle };
  }
}
