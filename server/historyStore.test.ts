import { describe, expect, it } from 'vitest';
import {
  HistoryStore,
  MemoryHistoryTable,
  eventFromRow,
  historyStoreFromEnv,
  snapshotFromRow,
} from './historyStore';
import type { PoolEvent, PoolSnapshot } from './poolHistory';

const DAY = 24 * 3600_000;
const T = Date.UTC(2026, 10, 11, 12, 30);

const snap = (at: number, players = 1): PoolSnapshot => ({
  at,
  poolSize: 2,
  shards: [
    {
      index: 0,
      awake: true,
      rooms: 1,
      players,
      connections: 1,
      cpuPct: 3,
      rssMb: 80,
      loopDelayP99Ms: 10,
    },
    {
      index: 1,
      awake: false,
      rooms: 0,
      players: 0,
      connections: 0,
      cpuPct: 0,
      rssMb: 0,
      loopDelayP99Ms: 0,
    },
  ],
  totals: { awake: 1, rooms: 1, players, connections: 1, capacity: 15 },
});

const event = (at: number, kind: PoolEvent['kind'] = 'woke'): PoolEvent => ({
  at,
  shard: 1,
  kind,
  detail: 'woke up',
});

function setup() {
  const table = new MemoryHistoryTable();
  let n = 0;
  const store = new HistoryStore(table, { suffix: () => String(n++).padStart(6, '0') });
  return { table, store };
}

describe('HistoryStore', () => {
  it('writes snapshots per UTC day with the totals as columns and reads them back', async () => {
    const { table, store } = setup();
    await store.writeSnapshot(snap(T));
    const row = table.rows.get('snap-2026-11-11\n2026-11-11T12:30:00.000Z');
    expect(row?.columns).toMatchObject({ poolSize: 2, awake: 1, players: 1, capacity: 15 });
    expect(typeof row?.columns.shards).toBe('string');
    expect(await store.snapshots(T - 1, T + 1)).toEqual([snap(T)]);
  });

  it('reads only the range asked for, across days', async () => {
    const { store } = setup();
    for (const at of [T - 2 * DAY, T - DAY, T - 60_000, T]) await store.writeSnapshot(snap(at));
    const got = await store.snapshots(T - DAY - 1, T);
    expect(got.map((s) => s.at)).toEqual([T - DAY, T - 60_000, T]);
  });

  it('keeps two events of the same millisecond apart', async () => {
    const { table, store } = setup();
    await store.writeEvents([event(T), event(T, 'slept')]);
    expect([...table.rows.keys()]).toEqual([
      'event-2026-11-11\n2026-11-11T12:30:00.000Z-000000',
      'event-2026-11-11\n2026-11-11T12:30:00.000Z-000001',
    ]);
    expect((await store.events(T, T)).map((e) => e.kind)).toEqual(['woke', 'slept']);
  });

  it('deletes days past the retention, at most a batch per run', async () => {
    const { table, store } = setup();
    const now = Date.UTC(2026, 10, 20, 3);
    for (let d = 0; d < 20; d++) {
      await store.writeSnapshot(snap(now - d * DAY));
      await store.writeEvents([event(now - d * DAY)]);
    }
    expect(table.rows.size).toBe(40);
    // Days before Nov 6 go: 20 - 15 = 5 days of each.
    expect(await store.purge(now, 14, 7)).toBe(7);
    expect(await store.purge(now, 14, 100)).toBe(3);
    expect(await store.purge(now, 14, 100)).toBe(0);
    expect(table.rows.size).toBe(30);
    const kept = [...table.rows.values()].map((r) => r.partitionKey).sort();
    expect(kept[0]).toBe('event-2026-11-06');
  });

  it('skips rows that are not what they should be', () => {
    expect(snapshotFromRow({ partitionKey: 'snap-x', rowKey: 'nope', columns: {} })).toBeNull();
    expect(
      snapshotFromRow({
        partitionKey: 'snap-x',
        rowKey: '2026-11-11T12:30:00.000Z',
        columns: { shards: '{bad' },
      }),
    ).toBeNull();
    expect(
      eventFromRow({
        partitionKey: 'event-x',
        rowKey: '2026-11-11T12:30:00.000Z-ab',
        columns: { kind: 'exploded' },
      }),
    ).toBeNull();
  });

  it('is in memory without PROFILE_STORE=table', () => {
    expect(historyStoreFromEnv({}).table).toBeInstanceOf(MemoryHistoryTable);
    expect(() => historyStoreFromEnv({ PROFILE_STORE: 'table' })).toThrow(/PROFILE_TABLE/);
  });
});
