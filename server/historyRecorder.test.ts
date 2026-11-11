import { describe, expect, it } from 'vitest';
import type { PoolEntry, ShardOps } from '../src/net/pool';
import { NET_HISTORY_CACHE_MS, NET_SHARD_AWAKE_MS } from '../src/sim/balance';
import { HistoryRecorder } from './historyRecorder';
import { HistoryStore, MemoryHistoryTable } from './historyStore';

const DAY = 24 * 3600_000;

const ops = (over: Partial<ShardOps> = {}): ShardOps => ({
  version: 'v1',
  startedAt: '2026-11-11T10:00:00.000Z',
  uptimeS: 1,
  cpuPct: 10,
  eventLoopUtil: 0,
  loopDelayP99Ms: 1,
  rssMb: 50,
  heapUsedMb: 20,
  connections: 1,
  roundsStarted: 0,
  serverFullRefusals: 0,
  roomList: [],
  ...over,
});

function setup() {
  let now = Date.UTC(2026, 10, 11, 12, 0, 5);
  const table = new MemoryHistoryTable();
  const store = new HistoryStore(table);
  const pool = {
    entries: [] as PoolEntry[],
    waking: [] as number[],
    fail: false,
  };
  const logs: string[] = [];
  const recorder = new HistoryRecorder({
    store,
    pool: {
      entries: () =>
        pool.fail ? Promise.reject(new Error('table down')) : Promise.resolve(pool.entries),
      get waking() {
        return pool.waking;
      },
    },
    poolSize: 2,
    version: 'v1',
    now: () => now,
    log: (m) => logs.push(m),
  });
  const shard = (index: number, awake: boolean, over: Partial<ShardOps> = {}): PoolEntry => ({
    index,
    url: '',
    rooms: awake ? 1 : 0,
    players: awake ? 2 : 0,
    maxRooms: 3,
    updatedAt: awake ? now - 1000 : now - NET_SHARD_AWAKE_MS - 1,
    ops: ops(over),
  });
  return {
    recorder,
    store,
    table,
    pool,
    logs,
    shard,
    advance: (ms: number) => {
      now += ms;
    },
    now: () => now,
  };
}

describe('HistoryRecorder', () => {
  it('writes events as the pool changes, a wake episode once', async () => {
    const t = setup();
    await t.recorder.started();
    t.pool.entries = [t.shard(0, true), t.shard(1, false)];
    expect(await t.recorder.observe()).toEqual([]);
    t.pool.waking = [1];
    t.advance(10_000);
    expect((await t.recorder.observe()).map((e) => e.kind)).toEqual(['wakePing']);
    t.advance(10_000);
    expect(await t.recorder.observe()).toEqual([]);
    t.pool.waking = [];
    t.pool.entries = [t.shard(0, true), t.shard(1, true)];
    t.advance(10_000);
    expect((await t.recorder.observe()).map((e) => e.kind)).toEqual(['woke']);
    const events = await t.store.events(0, t.now());
    expect(events.map((e) => e.kind)).toEqual(['started', 'wakePing', 'woke']);
  });

  it('writes a snapshot a minute with that minute’s refusals added up', async () => {
    const t = setup();
    t.pool.entries = [t.shard(0, true, { serverFullRefusals: 1 }), t.shard(1, false)];
    await t.recorder.observe();
    t.pool.entries = [t.shard(0, true, { serverFullRefusals: 3 }), t.shard(1, false)];
    await t.recorder.observe();
    t.pool.entries = [t.shard(0, true, { serverFullRefusals: 4 }), t.shard(1, false)];
    await t.recorder.observe();
    await t.recorder.snapshot();
    const snaps = await t.store.snapshots(0, t.now());
    expect(snaps).toHaveLength(1);
    expect(snaps[0]?.totals).toMatchObject({ awake: 1, players: 2, rooms: 1, capacity: 3 });
    const refusals = (await t.store.events(0, t.now())).filter((e) => e.kind === 'refusals');
    expect(refusals.map((e) => [e.shard, e.detail])).toEqual([
      [0, 'refused 3 new rooms (server full)'],
    ]);
    // Counted once: the next snapshot has no refusals left over.
    t.advance(60_000);
    await t.recorder.snapshot();
    expect((await t.store.events(0, t.now())).filter((e) => e.kind === 'refusals')).toHaveLength(1);
  });

  it('answers the dashboard from a cache, newest events first', async () => {
    const t = setup();
    t.pool.entries = [t.shard(0, true), t.shard(1, false)];
    await t.recorder.started();
    await t.recorder.snapshot();
    const first = await t.recorder.history('1h');
    expect(first.points).toHaveLength(60);
    expect(first.points.at(-1)?.players).toBe(2);
    expect(first.events.map((e) => e.kind)).toEqual(['started']);
    t.advance(1000);
    await t.store.writeEvents([{ at: t.now(), shard: 1, kind: 'woke', detail: '' }]);
    expect(await t.recorder.history('1h')).toBe(first);
    t.advance(NET_HISTORY_CACHE_MS);
    const second = await t.recorder.history('1h');
    expect(second.events.map((e) => e.kind)).toEqual(['woke', 'started']);
  });

  it('purges old days and logs store trouble once', async () => {
    const t = setup();
    t.pool.entries = [t.shard(0, true)];
    await t.recorder.snapshot();
    t.advance(20 * DAY);
    await t.recorder.snapshot();
    expect(t.table.rows.size).toBe(2);
    expect(await t.recorder.purge()).toBe(1);
    t.pool.fail = true;
    await t.recorder.observe();
    await t.recorder.snapshot();
    expect(t.logs).toEqual(['History: table down']);
  });
});
