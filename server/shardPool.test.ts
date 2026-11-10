import { afterEach, describe, expect, it, vi } from 'vitest';
import { AWAKE_WINDOW_MS, type PoolEntry } from '../src/net/pool';
import type { FetchLike } from '../src/net/profileApi';
import {
  NET_POOL_CACHE_MS,
  NET_POOL_MANAGE_MS,
  NET_SHARD_HEARTBEAT_MIN_MS,
  NET_SHARD_HEARTBEAT_MS,
  NET_SHARD_KEEPALIVE_MS,
} from '../src/sim/balance';
import { MemoryPoolStore, type PoolStore } from './poolStore';
import { ShardLoad } from './shardLoad';
import { ShardPool, type ShardPoolOptions } from './shardPool';

const URLS = ['https://s0', 'https://s1', 'https://s2', 'https://s3'];

/** A fetch that answers `ok` and remembers every URL; `hold` keeps the answers back. */
function fakeFetch(hold = false) {
  const asked: string[] = [];
  const release: (() => void)[] = [];
  const fn: FetchLike = (url) => {
    asked.push(url);
    const answer = () => new Response('ok');
    if (!hold) return Promise.resolve(answer());
    return new Promise((resolve) => {
      release.push(() => {
        resolve(answer());
      });
    });
  };
  const releaseAll = (): void => {
    for (const r of release.splice(0)) r();
  };
  return { fn, asked, release: releaseAll };
}

function setup(over: Partial<ShardPoolOptions> & { index?: number; maxRooms?: number } = {}) {
  let now = 1_000_000;
  const store = over.store ?? new MemoryPoolStore();
  const load = over.load ?? new ShardLoad(over.maxRooms ?? 2);
  const fetch = fakeFetch();
  const logs: string[] = [];
  const pool = new ShardPool({
    store,
    shard: { index: over.index ?? 0, count: over.urls?.length ?? URLS.length },
    urls: URLS,
    load,
    headroom: 2,
    now: () => now,
    fetch: fetch.fn,
    log: (m) => logs.push(m),
    info: () => undefined,
    ...over,
  });
  return {
    pool,
    store,
    load,
    fetch,
    logs,
    advance: (ms: number) => {
      now += ms;
    },
    now: () => now,
  };
}

/** Another shard's heartbeat, `ageMs` old. */
const other = (index: number, rooms: number, now: number, ageMs = 1000): PoolEntry => ({
  index,
  url: URLS[index] ?? '',
  rooms,
  players: rooms,
  maxRooms: 2,
  updatedAt: now - ageMs,
});

/** A room for the load, with one player. */
const room = () => ({});

afterEach(() => {
  vi.useRealTimers();
});

describe('ShardPool heartbeat', () => {
  it("writes this shard's rooms, players, limit, URL and time", async () => {
    const { pool, store, load, now } = setup({ index: 2 });
    load.add(room(), () => 3);
    await pool.heartbeat();
    expect(await store.list()).toEqual([
      { index: 2, url: 'https://s2', rooms: 1, players: 3, maxRooms: 2, updatedAt: now() },
    ]);
  });

  it('logs a failing store once, and when it works again', async () => {
    let failing = true;
    const store: PoolStore = {
      put: () => (failing ? Promise.reject(new Error('table down')) : Promise.resolve()),
      list: () => Promise.resolve([]),
    };
    const { pool, logs } = setup({ store });
    await pool.heartbeat();
    await pool.heartbeat();
    failing = false;
    await pool.heartbeat();
    expect(logs).toEqual(['Pool heartbeat failed: table down', 'Pool heartbeat works again']);
  });

  it('marks the shard asleep with no rooms when it stops', async () => {
    const { pool, store, load } = setup({ index: 1 });
    load.add(room(), () => 1);
    await pool.stop();
    expect(await store.list()).toEqual([
      { index: 1, url: 'https://s1', rooms: 0, players: 0, maxRooms: 2, updatedAt: 0 },
    ]);
    // Nothing more after stopping.
    await pool.heartbeat();
    expect((await store.list())[0]?.updatedAt).toBe(0);
  });
});

describe('ShardPool beatIfDue', () => {
  it('writes when rooms or players change, and on the refresh interval otherwise', async () => {
    const { pool, store, load, advance } = setup();
    const puts = vi.spyOn(store, 'put');
    expect(await pool.beatIfDue()).toBe(true); // the first one
    expect(await pool.beatIfDue()).toBe(false);
    let players = 1;
    load.add(room(), () => players);
    expect(await pool.beatIfDue()).toBe(true); // a room
    players = 2;
    expect(await pool.beatIfDue()).toBe(true); // a player
    advance(NET_SHARD_HEARTBEAT_MS - 1);
    expect(await pool.beatIfDue()).toBe(false);
    advance(1);
    expect(await pool.beatIfDue()).toBe(true); // the refresh
    expect(puts).toHaveBeenCalledTimes(4);
    expect((await store.list())[0]).toMatchObject({ rooms: 1, players: 2 });
  });

  it('tries again after a failed write', async () => {
    let failing = true;
    const store: PoolStore = {
      put: () => (failing ? Promise.reject(new Error('down')) : Promise.resolve()),
      list: () => Promise.resolve([]),
    };
    const { pool } = setup({ store });
    expect(await pool.beatIfDue()).toBe(true);
    failing = false;
    expect(await pool.beatIfDue()).toBe(true);
    expect(await pool.beatIfDue()).toBe(false);
  });
});

describe('ShardPool keepalive', () => {
  it('requests its own /health only while it holds rooms', () => {
    const { pool, load, fetch } = setup({ index: 3 });
    expect(pool.keepalive()).toBe(false);
    const r = room();
    load.add(r, () => 1);
    expect(pool.keepalive()).toBe(true);
    expect(fetch.asked).toEqual(['https://s3/health']);
    load.remove(r);
    expect(pool.keepalive()).toBe(false);
    expect(fetch.asked).toHaveLength(1);
  });

  it('skips it when its URL is unknown', () => {
    const { pool, load, fetch } = setup({ urls: [''] });
    load.add(room(), () => 1);
    expect(pool.keepalive()).toBe(false);
    expect(fetch.asked).toEqual([]);
  });
});

describe('ShardPool manager', () => {
  it('wakes the lowest-index sleeping shard when free slots run low', async () => {
    const { pool, store, load, fetch, now } = setup();
    load.add(room(), () => 1);
    // Shard 0: 1 free; shard 1 busy and full; 2 and 3 asleep. Wanted: 2 free.
    await store.put(other(1, 2, now()));
    await store.put(other(2, 0, now(), AWAKE_WINDOW_MS + 1));
    expect(await pool.manage()).toEqual([2]);
    expect(fetch.asked).toEqual(['https://s2/health']);
  });

  it('keeps requesting the spare while it is needed, then leaves it alone', async () => {
    const { pool, store, load, fetch, now } = setup();
    const a = room();
    const b = room();
    load.add(a, () => 1);
    load.add(b, () => 1);
    // Shard 0 full: the spare (shard 1) is awake now but empty; it still gets requests.
    await store.put(other(1, 0, now()));
    expect(await pool.manage()).toEqual([1]);
    // Shard 0 has room again: shard 1 isn't needed, nobody gets a request.
    load.remove(a);
    load.remove(b);
    expect(await pool.manage()).toEqual([]);
    expect(fetch.asked).toEqual(['https://s1/health']);
  });

  it('never requests shards that are not needed', async () => {
    const { pool, store, fetch, now } = setup();
    await store.put(other(1, 0, now()));
    await store.put(other(2, 1, now()));
    expect(await pool.manage()).toEqual([]);
    expect(fetch.asked).toEqual([]);
  });

  it('runs on shard 0 only', async () => {
    const { pool, load, fetch } = setup({ index: 1 });
    load.add(room(), () => 1);
    load.add(room(), () => 1);
    expect(await pool.manage()).toEqual([]);
    expect(fetch.asked).toEqual([]);
  });

  it('has one request out per shard at a time', async () => {
    const held = fakeFetch(true);
    const { pool, load } = setup({ fetch: held.fn });
    load.add(room(), () => 1);
    load.add(room(), () => 1);
    await pool.manage();
    await pool.manage();
    expect(held.asked).toEqual(['https://s1/health']);
    held.release();
    await vi.waitFor(async () => {
      await pool.manage();
      expect(held.asked).toHaveLength(2);
    });
  });

  it('logs and wakes nobody when the pool cannot be read', async () => {
    const store: PoolStore = {
      put: () => Promise.resolve(),
      list: () => Promise.reject(new Error('table down')),
    };
    const { pool, logs, fetch } = setup({ store });
    expect(await pool.manage()).toEqual([]);
    expect(fetch.asked).toEqual([]);
    expect(logs).toEqual(['Pool manager could not read the pool: table down']);
  });
});

describe('ShardPool view', () => {
  it("answers /pool with this shard's live numbers", async () => {
    const { pool, store, load, now } = setup({ maxRooms: 1 });
    await store.put(other(1, 2, now()));
    expect(await pool.view()).toEqual({
      urls: URLS,
      awake: [true, true, false, false],
      host: 0,
    });
    load.add(room(), () => 1);
    // Shard 0 full (live, before its next heartbeat), shard 1 full: the lowest sleeping one.
    expect((await pool.view()).host).toBe(2);
  });
});

describe('ShardPool pool cache', () => {
  it('reads the store at most once per NET_POOL_CACHE_MS, with its own entry always live', async () => {
    const { pool, store, load, advance, now } = setup({ maxRooms: 1 });
    const lists = vi.spyOn(store, 'list');
    await store.put(other(1, 0, now()));
    await Promise.all([pool.view(), pool.view(), pool.manage()]);
    expect(lists).toHaveBeenCalledTimes(1);
    // This shard's own new room is seen at once; another shard's change only after the cache.
    await store.put(other(1, 2, now()));
    load.add(room(), () => 1);
    expect((await pool.view()).host).toBe(1);
    expect(lists).toHaveBeenCalledTimes(1);
    advance(NET_POOL_CACHE_MS);
    expect((await pool.view()).host).toBe(2);
    expect(lists).toHaveBeenCalledTimes(2);
  });

  it('does not keep a failed read', async () => {
    let failing = true;
    const store: PoolStore = {
      put: () => Promise.resolve(),
      list: () => (failing ? Promise.reject(new Error('down')) : Promise.resolve([])),
    };
    const { pool } = setup({ store });
    await expect(pool.view()).rejects.toThrow('down');
    failing = false;
    expect((await pool.view()).host).toBe(0);
  });
});

describe('ShardPool timers', () => {
  it('beats at once, on changes and on the refresh; keepalive and manager on theirs', async () => {
    vi.useFakeTimers();
    let clock = 1_000_000;
    const { pool, store, load, fetch } = setup({ now: () => clock });
    const tick = async (ms: number) => {
      clock += ms;
      await vi.advanceTimersByTimeAsync(ms);
    };
    const puts = vi.spyOn(store, 'put');
    pool.start();
    expect(puts).toHaveBeenCalledTimes(1);
    await tick(NET_SHARD_HEARTBEAT_MIN_MS);
    expect(puts).toHaveBeenCalledTimes(1);
    const r = room();
    load.add(r, () => 1);
    await tick(NET_SHARD_HEARTBEAT_MIN_MS);
    expect(puts).toHaveBeenCalledTimes(2);
    expect(fetch.asked).toEqual([]);
    // The manager: shard 0 has 1 free slot of the 2 wanted, so it wakes shard 1.
    await tick(NET_POOL_MANAGE_MS - 2 * NET_SHARD_HEARTBEAT_MIN_MS);
    expect(fetch.asked).toEqual(['https://s1/health']);
    expect(puts).toHaveBeenCalledTimes(2);
    await tick(NET_SHARD_HEARTBEAT_MS);
    expect(puts).toHaveBeenCalledTimes(3);
    await tick(NET_SHARD_KEEPALIVE_MS - NET_SHARD_HEARTBEAT_MS - NET_POOL_MANAGE_MS);
    expect(fetch.asked).toContain('https://s0/health');
    await pool.stop();
    const after = puts.mock.calls.length;
    await tick(NET_SHARD_KEEPALIVE_MS * 2);
    expect(puts).toHaveBeenCalledTimes(after);
  });
});
