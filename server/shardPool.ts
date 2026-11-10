/**
 * This server's part in the shard pool (see `src/net/pool.ts`):
 *
 * - Heartbeat: it writes its entry (rooms, players, room limit, URL, time)
 *   to the pool store once right after starting, whenever its rooms or
 *   players change (checked every `NET_SHARD_HEARTBEAT_MIN_MS`, so at most
 *   one write per that), and every `NET_SHARD_HEARTBEAT_MS` without
 *   changes. A shard is awake while its entry is fresh (`NET_SHARD_AWAKE_MS`).
 *   On shutdown it writes one last entry with no rooms and time 0: asleep at
 *   once.
 * - Keepalive: while it holds rooms, it requests its own public `/health`
 *   every `NET_SHARD_KEEPALIVE_MS`. Its host's scaler only counts HTTP
 *   requests (maybe not open WebSockets), so a shard with games never looks
 *   idle and is never scaled to zero under them. Skipped when its URL is
 *   unknown (one local server).
 * - Pool manager (shard 0 only, with more than one shard): every
 *   `NET_POOL_MANAGE_MS` it reads the pool and requests `/health` of each
 *   spare `shardsToWake` names: that wakes a sleeping one, and keeps an
 *   empty one awake while its free slots are needed. Shards it doesn't need
 *   get nothing from it, so they fall asleep.
 * - `view()`: the `GET /pool` answer.
 *
 * Reads of the pool are cached for `NET_POOL_CACHE_MS` (shared by `/pool`
 * and the manager), with this shard's own entry always replaced by its live
 * numbers, so a room made here counts at once.
 *
 * Requests are fire and forget (with a timeout); at most one per URL is out
 * at a time. Store trouble is logged and retried on the next round. The
 * clock and `fetch` come in as options, and each step is a method, so the
 * tests drive it without timers.
 */

import type { Shard } from '../src/net/joinCode';
import {
  type PoolEntry,
  type PoolView,
  entriesByIndex,
  isAwake,
  poolHeadroom,
  poolView,
  shardsToWake,
} from '../src/net/pool';
import type { FetchLike } from '../src/net/profileApi';
import {
  NET_POOL_CACHE_MS,
  NET_POOL_HEADROOM_ROOMS,
  NET_POOL_MANAGE_MS,
  NET_SHARD_HEARTBEAT_MIN_MS,
  NET_SHARD_HEARTBEAT_MS,
  NET_SHARD_KEEPALIVE_MS,
  NET_SHARD_WAKE_TIMEOUT_MS,
} from '../src/sim/balance';
import type { PoolStore } from './poolStore';
import type { ShardLoad } from './shardLoad';

export interface ShardPoolOptions {
  store: PoolStore;
  shard: Shard;
  /** Every shard's public URL in index order (`SHARD_URLS`), `shard.count` long; `''` where unknown. */
  urls: readonly string[];
  /** This server's rooms and their limit. */
  load: ShardLoad;
  /** Free room slots shard 0 keeps ready; `NET_POOL_HEADROOM_ROOMS` by default. */
  headroom?: number;
  /** How long a read of the pool is reused; `NET_POOL_CACHE_MS` by default (tests use 0). */
  cacheMs?: number;
  /** Wall clock in ms; `Date.now` by default. */
  now?: () => number;
  /** For the keepalive and wake-up requests; the global `fetch` by default. */
  fetch?: FetchLike;
  /** Where trouble is reported; `console.error` by default. */
  log?: (message: string) => void;
  /** Where wake-ups are reported; `console.log` by default. */
  info?: (message: string) => void;
}

export class ShardPool {
  private readonly now: () => number;
  private readonly fetchFn: FetchLike;
  private readonly log: (message: string) => void;
  private readonly info: (message: string) => void;
  private readonly timers: ReturnType<typeof setInterval>[] = [];
  /** URLs with a request out, so a slow cold start doesn't pile them up. */
  private readonly pending = new Set<string>();
  /** The last heartbeat failed (logged once until one works again). */
  private heartbeatFailing = false;
  /** What the last successful heartbeat wrote (`rooms/players`) and when; `null` before the first. */
  private written: { load: string; at: number } | null = null;
  /** A heartbeat is being written. */
  private writing = false;
  /** The last read of the pool and when it was started. */
  private cached: { entries: Promise<PoolEntry[]>; at: number } | null = null;
  private stopped = false;

  constructor(private readonly options: ShardPoolOptions) {
    this.now = options.now ?? (() => Date.now());
    this.fetchFn = options.fetch ?? ((url, init) => fetch(url, init));
    this.log =
      options.log ??
      ((message) => {
        console.error(message);
      });
    this.info =
      options.info ??
      ((message) => {
        console.log(message);
      });
  }

  /** This shard's public URL, `''` when unknown. */
  get url(): string {
    return this.options.urls[this.options.shard.index] ?? '';
  }

  /** This shard's entry as of now. */
  entry(): PoolEntry {
    const { load, shard } = this.options;
    return {
      index: shard.index,
      url: this.url,
      rooms: load.rooms,
      players: load.players,
      maxRooms: load.maxRooms,
      updatedAt: this.now(),
    };
  }

  /** Writes this shard's entry now. Never rejects. */
  async heartbeat(): Promise<void> {
    if (this.stopped || this.writing) return;
    this.writing = true;
    const entry = this.entry();
    try {
      await this.options.store.put(entry);
      this.written = { load: `${entry.rooms}/${entry.players}`, at: entry.updatedAt };
      if (this.heartbeatFailing) this.log('Pool heartbeat works again');
      this.heartbeatFailing = false;
    } catch (error) {
      if (!this.heartbeatFailing) this.log(`Pool heartbeat failed: ${describe(error)}`);
      this.heartbeatFailing = true;
    } finally {
      this.writing = false;
    }
  }

  /**
   * Writes this shard's entry if its rooms or players changed since the last
   * write, or that write is `NET_SHARD_HEARTBEAT_MS` old (or failed). Runs
   * every `NET_SHARD_HEARTBEAT_MIN_MS`. Whether it wrote.
   */
  async beatIfDue(): Promise<boolean> {
    const { load } = this.options;
    const last = this.written;
    const due =
      last === null ||
      last.load !== `${load.rooms}/${load.players}` ||
      this.now() - last.at >= NET_SHARD_HEARTBEAT_MS;
    if (!due || this.stopped || this.writing) return false;
    await this.heartbeat();
    return true;
  }

  /** Requests this shard's own `/health` while it holds rooms. Whether it did. */
  keepalive(): boolean {
    if (this.stopped || this.options.load.rooms === 0 || !this.url) return false;
    this.ping(this.url);
    return true;
  }

  /**
   * Shard 0's round: requests the spares the pool needs. The indices it
   * requested (nothing on other shards or when the pool can't be read).
   */
  async manage(): Promise<number[]> {
    const { shard, urls, headroom = NET_POOL_HEADROOM_ROOMS } = this.options;
    if (this.stopped || shard.index !== 0 || shard.count <= 1) return [];
    let entries: PoolEntry[];
    try {
      entries = await this.readPool();
    } catch (error) {
      this.log(`Pool manager could not read the pool: ${describe(error)}`);
      return [];
    }
    const now = this.now();
    const wake = shardsToWake(entries, now, shard.count, headroom, this.options.load.maxRooms);
    const pinged = wake.filter((i) => Boolean(urls[i]));
    const byIndex = entriesByIndex(entries, shard.count);
    for (const i of pinged) {
      if (!isAwake(byIndex[i], now)) {
        this.info(`Pool: ${poolHeadroom(entries, now)} free room slots, waking shard ${i}`);
      }
      this.ping(urls[i] ?? '');
    }
    return pinged;
  }

  /** The `GET /pool` answer. Rejects when the store can't be read. */
  async view(): Promise<PoolView> {
    const entries = await this.readPool();
    return poolView(entries, this.now(), this.options.urls);
  }

  /** Heartbeat now and on every interval; keepalive and (on shard 0) the manager on theirs. */
  start(): void {
    void this.heartbeat();
    const every = (ms: number, fn: () => unknown): void => {
      const timer = setInterval(fn, ms);
      timer.unref();
      this.timers.push(timer);
    };
    every(NET_SHARD_HEARTBEAT_MIN_MS, () => this.beatIfDue());
    every(NET_SHARD_KEEPALIVE_MS, () => this.keepalive());
    if (this.options.shard.index === 0 && this.options.shard.count > 1) {
      every(NET_POOL_MANAGE_MS, () => this.manage());
    }
  }

  /** Stops the timers and marks this shard asleep with no rooms. Never rejects. */
  async stop(): Promise<void> {
    if (this.stopped) return;
    this.stopped = true;
    for (const timer of this.timers.splice(0)) clearInterval(timer);
    try {
      await this.options.store.put({ ...this.entry(), rooms: 0, players: 0, updatedAt: 0 });
    } catch (error) {
      this.log(`Pool: could not write the shutdown entry: ${describe(error)}`);
    }
  }

  /**
   * The pool's entries, read from the store at most once per
   * `NET_POOL_CACHE_MS` (a failed read isn't kept), with this shard's own
   * entry replaced by its live numbers.
   */
  private async readPool(): Promise<PoolEntry[]> {
    const now = this.now();
    if (!this.cached || now - this.cached.at >= (this.options.cacheMs ?? NET_POOL_CACHE_MS)) {
      const entries = this.options.store.list();
      const cached = { entries, at: now };
      this.cached = cached;
      entries.catch(() => {
        if (this.cached === cached) this.cached = null;
      });
    }
    const stored = await this.cached.entries;
    const own = this.entry();
    return [...stored.filter((e) => e.index !== own.index), own];
  }

  /** Requests `<url>/health` and forgets about it. */
  private ping(url: string): void {
    if (this.pending.has(url)) return;
    this.pending.add(url);
    this.fetchFn(`${url}/health`, { signal: AbortSignal.timeout(NET_SHARD_WAKE_TIMEOUT_MS) })
      .then(
        (res) => res.body?.cancel(),
        // A sleeping shard may take longer than the timeout to wake; the next round tries again.
        () => undefined,
      )
      .catch(() => undefined)
      .finally(() => this.pending.delete(url));
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
