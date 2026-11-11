/**
 * Shard 0's history of the pool, for the ops dashboard (`admin.ts`):
 *
 * - `observe()` every `NET_HISTORY_OBSERVE_MS`: reads the pool (the same
 *   cached read as `/pool` and the manager) and writes the events since the
 *   last read (`deriveEvents`), adding up rooms refused for being full.
 * - `snapshot()` every `NET_HISTORY_SNAPSHOT_MS`: writes the pool as it is,
 *   plus that minute's refusals as events.
 * - `purge()` once a day (first `NET_HISTORY_PURGE_FIRST_MS` after start):
 *   deletes days older than `NET_HISTORY_RETENTION_DAYS`, at most
 *   `NET_HISTORY_PURGE_BATCH` rows per run.
 * - `history(range)`: what the dashboard charts, cached for
 *   `NET_HISTORY_CACHE_MS` per range.
 *
 * Store trouble is logged (once until it works again) and never stops the
 * server. The clock comes in as an option; each step is a method, so the
 * tests drive it without timers.
 */

import type { PoolEntry } from '../src/net/pool';
import {
  NET_HISTORY_CACHE_MS,
  NET_HISTORY_MAX_EVENTS,
  NET_HISTORY_OBSERVE_MS,
  NET_HISTORY_PURGE_BATCH,
  NET_HISTORY_PURGE_EVERY_MS,
  NET_HISTORY_PURGE_FIRST_MS,
  NET_HISTORY_RETENTION_DAYS,
  NET_HISTORY_SNAPSHOT_MS,
} from '../src/sim/balance';
import type { HistoryStore } from './historyStore';
import {
  type HistoryRange,
  type HistorySeries,
  type Observation,
  type PoolEvent,
  aggregate,
  deriveEvents,
  observe,
  rangeBounds,
  refusalDeltas,
  refusalEvents,
  snapshotOf,
} from './poolHistory';

/** What the recorder reads of the shard pool (`ShardPool`). */
export interface PoolSource {
  entries(): Promise<PoolEntry[]>;
  readonly waking: readonly number[];
}

export interface HistoryRecorderOptions {
  store: HistoryStore;
  pool: PoolSource;
  /** Shards in the pool (`SHARD_COUNT`). */
  poolSize: number;
  /** This server's version, for its `started` event. */
  version: string;
  /** Wall clock, ms; `Date.now` by default. */
  now?: () => number;
  /** Where trouble is reported; `console.error` by default. */
  log?: (message: string) => void;
}

/** `GET /admin/api/history`: the charts' points and the events, newest first. */
export interface HistoryAnswer extends HistorySeries {
  events: PoolEvent[];
}

export class HistoryRecorder {
  private readonly now: () => number;
  private readonly log: (message: string) => void;
  private readonly timers: ReturnType<typeof setTimeout>[] = [];
  private last: Observation | null = null;
  /** Rooms refused per shard since the last snapshot. */
  private refused: number[] = [];
  private failing = false;
  private readonly cache = new Map<HistoryRange, { at: number; answer: Promise<HistoryAnswer> }>();

  constructor(private readonly options: HistoryRecorderOptions) {
    this.now = options.now ?? (() => Date.now());
    this.log =
      options.log ??
      ((message) => {
        console.error(message);
      });
  }

  /** Notes that this shard (0) started. */
  async started(): Promise<void> {
    await this.write(() =>
      this.options.store.writeEvents([
        {
          at: this.now(),
          shard: 0,
          kind: 'started',
          detail: `shard 0 started (version ${this.options.version})`,
        },
      ]),
    );
  }

  /** Reads the pool and writes what changed since the last read. The events written. */
  async observe(): Promise<PoolEvent[]> {
    const entries = await this.read();
    if (!entries) return [];
    const next = observe(entries, this.now(), this.options.poolSize, this.options.pool.waking);
    const events = deriveEvents(this.last, next);
    refusalDeltas(this.last, next).forEach((n, i) => {
      this.refused[i] = (this.refused[i] ?? 0) + n;
    });
    this.last = next;
    if (events.length > 0) await this.write(() => this.options.store.writeEvents(events));
    return events;
  }

  /** Writes the pool as it is now, and this minute's refusals. */
  async snapshot(): Promise<void> {
    const entries = await this.read();
    if (!entries) return;
    const snap = snapshotOf(entries, this.now(), this.options.poolSize);
    const refusals = refusalEvents(this.now(), this.refused);
    this.refused = [];
    await this.write(async () => {
      await this.options.store.writeSnapshot(snap);
      await this.options.store.writeEvents(refusals);
    });
  }

  /** Deletes history past its retention. How many rows went. */
  async purge(): Promise<number> {
    let deleted = 0;
    await this.write(async () => {
      deleted = await this.options.store.purge(
        this.now(),
        NET_HISTORY_RETENTION_DAYS,
        NET_HISTORY_PURGE_BATCH,
      );
    });
    if (deleted > 0) console.log(`History: deleted ${deleted} rows older than the retention`);
    return deleted;
  }

  /** The history over `range`, ending now; rejects when the store can't be read. */
  history(range: HistoryRange): Promise<HistoryAnswer> {
    const now = this.now();
    const hit = this.cache.get(range);
    if (hit && now - hit.at < NET_HISTORY_CACHE_MS) return hit.answer;
    const answer = this.load(range, now);
    const entry = { at: now, answer };
    this.cache.set(range, entry);
    answer.catch(() => {
      if (this.cache.get(range) === entry) this.cache.delete(range);
    });
    return answer;
  }

  start(): void {
    void this.started().then(() => this.observe());
    const every = (ms: number, fn: () => unknown): void => {
      const timer = setInterval(fn, ms);
      timer.unref();
      this.timers.push(timer);
    };
    every(NET_HISTORY_OBSERVE_MS, () => this.observe());
    every(NET_HISTORY_SNAPSHOT_MS, () => this.snapshot());
    const first = setTimeout(() => {
      void this.purge();
      every(NET_HISTORY_PURGE_EVERY_MS, () => this.purge());
    }, NET_HISTORY_PURGE_FIRST_MS);
    first.unref();
    this.timers.push(first);
  }

  stop(): void {
    for (const timer of this.timers.splice(0)) clearInterval(timer);
  }

  private async load(range: HistoryRange, now: number): Promise<HistoryAnswer> {
    const { from, to } = rangeBounds(range, now);
    const [snapshots, events] = await Promise.all([
      this.options.store.snapshots(from, to),
      this.options.store.events(from, to),
    ]);
    const series = aggregate(snapshots, range, now, this.options.poolSize);
    const newest = [...events].sort((a, b) => b.at - a.at).slice(0, NET_HISTORY_MAX_EVENTS);
    return { ...series, events: newest };
  }

  private async read(): Promise<PoolEntry[] | null> {
    try {
      return await this.options.pool.entries();
    } catch (error) {
      this.trouble(error);
      return null;
    }
  }

  private async write(fn: () => Promise<void>): Promise<void> {
    try {
      await fn();
      if (this.failing) this.log('History works again');
      this.failing = false;
    } catch (error) {
      this.trouble(error);
    }
  }

  private trouble(error: unknown): void {
    if (!this.failing) {
      this.log(`History: ${error instanceof Error ? error.message : String(error)}`);
    }
    this.failing = true;
  }
}
