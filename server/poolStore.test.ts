import { describe, expect, it } from 'vitest';
import type { PoolEntry } from '../src/net/pool';
import {
  MemoryPoolStore,
  type PoolRow,
  type PoolTable,
  TablePoolStore,
  fromRow,
  poolStoreFromEnv,
} from './poolStore';

const entry = (index: number, over: Partial<PoolEntry> = {}): PoolEntry => ({
  index,
  url: `https://s${index}.example`,
  rooms: 2,
  players: 5,
  maxRooms: 15,
  updatedAt: Date.UTC(2026, 10, 10, 12, 0, 0),
  ...over,
});

/** A table in memory: rows by RowKey, like the pool partition. */
function fakeTable(): PoolTable & { rows: Map<string, PoolRow> } {
  const rows = new Map<string, PoolRow>();
  return {
    rows,
    upsert: (row) => {
      rows.set(row.rowKey, { ...row });
      return Promise.resolve();
    },
    list: () => Promise.resolve([...rows.values()]),
  };
}

describe('MemoryPoolStore', () => {
  it('keeps one entry per shard, the last written', async () => {
    const store = new MemoryPoolStore();
    await store.put(entry(0));
    await store.put(entry(1));
    await store.put(entry(0, { rooms: 7 }));
    const list = await store.list();
    expect(list.sort((a, b) => a.index - b.index)).toEqual([entry(0, { rooms: 7 }), entry(1)]);
  });
});

describe('TablePoolStore', () => {
  it('writes one row per shard (RowKey the index, time as ISO) and reads them back', async () => {
    const table = fakeTable();
    const store = new TablePoolStore(table);
    await store.put(entry(0));
    await store.put(entry(3, { updatedAt: 0, rooms: 0 }));
    await store.put(entry(0, { rooms: 4 }));
    expect(table.rows.get('0')).toEqual({
      rowKey: '0',
      rooms: 4,
      players: 5,
      maxRooms: 15,
      url: 'https://s0.example',
      updatedAt: '2026-11-10T12:00:00.000Z',
    });
    expect(table.rows.get('3')?.updatedAt).toBe('1970-01-01T00:00:00.000Z');
    expect(await store.list()).toEqual([
      entry(0, { rooms: 4 }),
      entry(3, { updatedAt: 0, rooms: 0 }),
    ]);
  });

  it('skips rows that are not entries', async () => {
    const table = fakeTable();
    const good: PoolRow = {
      rowKey: '1',
      rooms: 1,
      players: 2,
      maxRooms: 3,
      url: '',
      updatedAt: '2026-11-10T12:00:00.000Z',
    };
    expect(fromRow(good)).toEqual({
      index: 1,
      url: '',
      rooms: 1,
      players: 2,
      maxRooms: 3,
      updatedAt: Date.UTC(2026, 10, 10, 12),
    });
    for (const bad of [
      { rowKey: 'x' },
      { rowKey: '-1' },
      { rooms: '1' },
      { players: -1 },
      { maxRooms: 1.5 },
      { url: 3 },
      { updatedAt: 'yesterday' },
      { updatedAt: 5 },
    ]) {
      expect(fromRow({ ...good, ...bad })).toBeNull();
      table.rows.set(`bad-${table.rows.size}`, { ...good, ...bad });
    }
    table.rows.set('1', good);
    expect(await new TablePoolStore(table).list()).toEqual([fromRow(good)]);
  });
});

describe('poolStoreFromEnv', () => {
  it('keeps the pool in memory unless the profiles are in a table', () => {
    expect(poolStoreFromEnv({})).toBeInstanceOf(MemoryPoolStore);
    expect(poolStoreFromEnv({ PROFILE_STORE: 'file' })).toBeInstanceOf(MemoryPoolStore);
  });

  it("uses the profile table's account with PROFILE_STORE=table", () => {
    expect(
      poolStoreFromEnv({
        PROFILE_STORE: 'table',
        PROFILE_TABLE_CONNECTION_STRING: 'UseDevelopmentStorage=true',
        POOL_TABLE_NAME: 'shards',
      }),
    ).toBeInstanceOf(TablePoolStore);
    expect(
      poolStoreFromEnv({
        PROFILE_STORE: 'Table',
        PROFILE_TABLE_ENDPOINT: 'https://acct.table.core.windows.net',
      }),
    ).toBeInstanceOf(TablePoolStore);
    expect(() => poolStoreFromEnv({ PROFILE_STORE: 'table' })).toThrow(
      'PROFILE_TABLE_ENDPOINT or PROFILE_TABLE_CONNECTION_STRING',
    );
  });
});
