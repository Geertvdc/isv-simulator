import { describe, expect, it } from 'vitest';
import { NET_POOL_HEADROOM_ROOMS } from '../sim/balance';
import {
  AWAKE_WINDOW_MS,
  type PoolEntry,
  type PoolView,
  fetchPool,
  hostShardOrder,
  isAwake,
  parsePoolView,
  pickHostShard,
  poolHeadroom,
  poolShardUrl,
  poolView,
  shardsToWake,
} from './pool';

const NOW = 1_000_000;

function entry(index: number, rooms: number, over: Partial<PoolEntry> = {}): PoolEntry {
  return {
    index,
    url: `https://s${index}`,
    rooms,
    players: rooms * 2,
    maxRooms: 4,
    updatedAt: NOW - 1000,
    ...over,
  };
}

/** An entry whose last heartbeat is too old: the shard sleeps. */
const asleep = (index: number, rooms = 0): PoolEntry =>
  entry(index, rooms, { updatedAt: NOW - AWAKE_WINDOW_MS - 1 });

describe('isAwake', () => {
  it('is awake within three heartbeats, asleep without an entry, after it, or after a shutdown', () => {
    expect(isAwake(entry(0, 0, { updatedAt: NOW - AWAKE_WINDOW_MS }), NOW)).toBe(true);
    expect(isAwake(asleep(0), NOW)).toBe(false);
    expect(isAwake(undefined, NOW)).toBe(false);
    expect(isAwake(entry(0, 0, { updatedAt: 0 }), NOW)).toBe(false);
  });
});

describe('pickHostShard', () => {
  it('packs rooms onto the lowest-index awake shard with space', () => {
    expect(pickHostShard([entry(0, 1), entry(1, 0)], NOW, 2)).toBe(0);
    expect(pickHostShard([entry(1, 0), entry(0, 4), entry(2, 3)], NOW, 3)).toBe(1);
    expect(pickHostShard([entry(0, 4), asleep(1), entry(2, 3)], NOW, 3)).toBe(2);
  });

  it('wakes the lowest-index sleeping shard when every awake one is full', () => {
    expect(pickHostShard([entry(0, 4), entry(1, 4)], NOW, 4)).toBe(2);
    expect(pickHostShard([entry(0, 4), entry(1, 5), asleep(2, 3)], NOW, 3)).toBe(2);
  });

  it('says -1 when every shard is awake and full', () => {
    expect(pickHostShard([entry(0, 4), entry(1, 4)], NOW, 2)).toBe(-1);
    expect(pickHostShard([entry(0, 1, { maxRooms: 1 })], NOW, 1)).toBe(-1);
  });

  it('ignores entries outside the pool', () => {
    expect(pickHostShard([entry(0, 4), entry(5, 0)], NOW, 1)).toBe(-1);
  });
});

describe('poolHeadroom', () => {
  it('adds up the free slots of awake shards only', () => {
    expect(poolHeadroom([entry(0, 1), entry(1, 4), entry(2, 6), asleep(3)], NOW)).toBe(3);
    expect(poolHeadroom([], NOW)).toBe(0);
  });
});

describe('shardsToWake', () => {
  it('wakes nobody while shard 0 and the busy shards have enough free slots', () => {
    expect(shardsToWake([entry(0, 0, { maxRooms: 15 })], NOW, 8, 5)).toEqual([]);
    expect(shardsToWake([entry(0, 3), entry(1, 1)], NOW, 8, 4)).toEqual([]);
  });

  it('wakes the lowest-index sleeping shard when free slots run low', () => {
    expect(shardsToWake([entry(0, 3), asleep(1), asleep(2)], NOW, 3, 2)).toEqual([1]);
    // Never woke at all yet: counted with the default limit.
    expect(shardsToWake([entry(0, 3)], NOW, 3, 2, 4)).toEqual([1]);
  });

  it('keeps requesting a spare that is awake but empty while it is needed', () => {
    // Shard 1 woke and has no rooms: without our requests it would fall asleep again.
    expect(shardsToWake([entry(0, 4), entry(1, 0)], NOW, 3, 2)).toEqual([1]);
  });

  it('leaves spares alone that are not needed, so they fall asleep', () => {
    expect(shardsToWake([entry(0, 0), entry(1, 0), entry(2, 0)], NOW, 3, 2)).toEqual([]);
    expect(shardsToWake([entry(0, 4), entry(1, 0), entry(2, 0)], NOW, 3, 2)).toEqual([1]);
  });

  it('skips busy shards and adds spares until there is enough room', () => {
    const entries = [entry(0, 4), entry(1, 4), asleep(2), entry(3, 3), asleep(4)];
    // Busy: 0 (full), 1 (full), 3 (1 free). Need 6: spares 2 (+4) and 4 (+4).
    expect(shardsToWake(entries, NOW, 5, 6)).toEqual([2, 4]);
    expect(shardsToWake(entries, NOW, 5, 1)).toEqual([]);
  });

  it('wakes nothing when there is nothing left to wake, and never shard 0', () => {
    expect(shardsToWake([entry(0, 4), entry(1, 4)], NOW, 2, 2)).toEqual([]);
    expect(shardsToWake([], NOW, 1, 2)).toEqual([]);
  });

  it('defaults to NET_POOL_HEADROOM_ROOMS', () => {
    const full = entry(0, 15, { maxRooms: 15 });
    expect(NET_POOL_HEADROOM_ROOMS).toBeGreaterThan(0);
    expect(shardsToWake([full], NOW, 2)).toEqual([1]);
  });
});

describe('poolView and parsePoolView', () => {
  it('answers the urls, who is awake and where to host', () => {
    const view = poolView([entry(0, 4), entry(1, 1)], NOW, ['https://a', 'https://b', 'https://c']);
    expect(view).toEqual({
      urls: ['https://a', 'https://b', 'https://c'],
      awake: [true, true, false],
      host: 1,
    });
    expect(parsePoolView(JSON.parse(JSON.stringify(view)))).toEqual(view);
  });

  it('refuses what is not a pool', () => {
    const ok = { urls: ['a', 'b'], awake: [true, false], host: 0 };
    expect(parsePoolView(ok)).toEqual(ok);
    expect(parsePoolView(null)).toBeNull();
    expect(parsePoolView({ ...ok, urls: [], awake: [] })).toBeNull();
    expect(parsePoolView({ ...ok, urls: ['a', 2] })).toBeNull();
    expect(parsePoolView({ ...ok, awake: [true] })).toBeNull();
    expect(parsePoolView({ ...ok, awake: [true, 'no'] })).toBeNull();
    expect(parsePoolView({ ...ok, host: 2 })).toBeNull();
    expect(parsePoolView({ ...ok, host: -2 })).toBeNull();
    expect(parsePoolView({ ...ok, host: 0.5 })).toBeNull();
    expect(parsePoolView({ ...ok, host: -1 })).toEqual({ ...ok, host: -1 });
    expect(parsePoolView({ ...ok, urls: [' https://a/ ', 'b'] })?.urls).toEqual(['https://a', 'b']);
  });
});

describe('fetchPool', () => {
  it("reads the front door's /pool", async () => {
    const asked: string[] = [];
    const pool = await fetchPool('https://front', (url) => {
      asked.push(url);
      return Promise.resolve(Response.json({ urls: [''], awake: [true], host: 0 }));
    });
    expect(asked).toEqual(['https://front/pool']);
    expect(pool).toEqual({ urls: [''], awake: [true], host: 0 });
  });

  it('rejects on an error status or something that is not a pool', async () => {
    await expect(
      fetchPool('https://front', () => Promise.resolve(new Response('no', { status: 500 }))),
    ).rejects.toThrow('500');
    await expect(
      fetchPool('https://front', () => Promise.resolve(Response.json({ urls: 'x' }))),
    ).rejects.toThrow('not a pool');
  });
});

describe('hostShardOrder and poolShardUrl', () => {
  const pool: PoolView = {
    urls: ['https://s0', 'https://s1', 'https://s2', 'https://s3'],
    awake: [true, false, true, false],
    host: 2,
  };

  it("tries the pool's pick, then the other awake shards, then the sleeping ones", () => {
    expect(hostShardOrder(pool)).toEqual([2, 0, 1, 3]);
    expect(hostShardOrder({ ...pool, host: 1 })).toEqual([1, 0, 2, 3]);
    expect(hostShardOrder({ ...pool, host: -1 })).toEqual([]);
  });

  it('reaches shard 0 at the front door and the others at their pool URL', () => {
    expect(poolShardUrl(pool, 'https://front', 0)).toBe('https://front');
    expect(poolShardUrl(pool, 'https://front', 3)).toBe('https://s3');
    expect(poolShardUrl(pool, 'https://front', 9)).toBe('');
  });
});
