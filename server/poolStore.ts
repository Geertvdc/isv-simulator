/**
 * Where the shard pool's heartbeats live (`PoolEntry` in `src/net/pool.ts`):
 * one entry per shard, written by that shard, read by all.
 *
 * - `MemoryPoolStore`: in this process only. Enough for one server (local
 *   dev) and tests.
 * - `TablePoolStore`: Azure Table Storage, shared by every shard. One entity
 *   per shard: PartitionKey `pool`, RowKey the shard index (`0`, `1`, ...),
 *   fields `rooms`, `players`, `maxRooms` (numbers), `url` and `updatedAt`
 *   (ISO time; the epoch after a shutdown). Each shard only ever writes its
 *   own row (an upsert), so there are no conflicts to handle. The Azure SDK
 *   sits behind `PoolTable`, so the tests use a fake.
 *
 * `poolStoreFromEnv`: the table with `PROFILE_STORE=table` (same account
 * settings as the profiles, table `POOL_TABLE_NAME`, default `shards`), else
 * the memory store.
 */

import { type TableClient, odata } from '@azure/data-tables';
import type { PoolEntry } from '../src/net/pool';
import { tableClientFromEnv } from './tableProfileStore';

export interface PoolStore {
  /** Writes (creates or replaces) this shard's entry. */
  put(entry: PoolEntry): Promise<void>;
  /** Every shard's entry. */
  list(): Promise<PoolEntry[]>;
}

export class MemoryPoolStore implements PoolStore {
  private readonly entries = new Map<number, PoolEntry>();

  put(entry: PoolEntry): Promise<void> {
    this.entries.set(entry.index, { ...entry });
    return Promise.resolve();
  }

  list(): Promise<PoolEntry[]> {
    return Promise.resolve([...this.entries.values()].map((e) => ({ ...e })));
  }
}

/** The PartitionKey of every pool entity. */
export const POOL_PARTITION = 'pool';
export const DEFAULT_POOL_TABLE = 'shards';

/** A pool entity as stored (property names as in the table). */
export interface PoolRow {
  rowKey: string;
  rooms: unknown;
  players: unknown;
  maxRooms: unknown;
  url: unknown;
  updatedAt: unknown;
}

/** The two table operations the pool needs. */
export interface PoolTable {
  /** Creates or replaces the row with this RowKey in the pool partition. */
  upsert(row: PoolRow): Promise<void>;
  /** Every row of the pool partition. */
  list(): Promise<PoolRow[]>;
}

function toRow(entry: PoolEntry): PoolRow {
  return {
    rowKey: String(entry.index),
    rooms: entry.rooms,
    players: entry.players,
    maxRooms: entry.maxRooms,
    url: entry.url,
    updatedAt: new Date(entry.updatedAt).toISOString(),
  };
}

/** An entry from a row, or `null` for a row that isn't one (a stray or broken row is skipped). */
export function fromRow(row: PoolRow): PoolEntry | null {
  const count = (v: unknown): number | null =>
    typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : null;
  const index = /^\d+$/.test(row.rowKey) ? Number(row.rowKey) : null;
  const rooms = count(row.rooms);
  const players = count(row.players);
  const maxRooms = count(row.maxRooms);
  const updatedAt = typeof row.updatedAt === 'string' ? Date.parse(row.updatedAt) : NaN;
  if (index === null || rooms === null || players === null || maxRooms === null) return null;
  if (typeof row.url !== 'string' || Number.isNaN(updatedAt)) return null;
  return { index, url: row.url, rooms, players, maxRooms, updatedAt };
}

export class TablePoolStore implements PoolStore {
  constructor(private readonly table: PoolTable) {}

  put(entry: PoolEntry): Promise<void> {
    return this.table.upsert(toRow(entry));
  }

  async list(): Promise<PoolEntry[]> {
    const rows = await this.table.list();
    return rows.map(fromRow).filter((e): e is PoolEntry => e !== null);
  }
}

/** `PoolTable` on a real table (`@azure/data-tables`). */
export function azurePoolTable(client: TableClient): PoolTable {
  return {
    upsert: async (row) => {
      await client.upsertEntity(
        {
          partitionKey: POOL_PARTITION,
          rowKey: row.rowKey,
          rooms: row.rooms,
          players: row.players,
          maxRooms: row.maxRooms,
          url: row.url,
          updatedAt: row.updatedAt,
        },
        'Replace',
      );
    },
    list: async () => {
      const rows: PoolRow[] = [];
      const entities = client.listEntities({
        queryOptions: { filter: odata`PartitionKey eq ${POOL_PARTITION}` },
      });
      for await (const e of entities) {
        rows.push({
          rowKey: e.rowKey ?? '',
          rooms: e.rooms,
          players: e.players,
          maxRooms: e.maxRooms,
          url: e.url,
          updatedAt: e.updatedAt,
        });
      }
      return rows;
    },
  };
}

/**
 * The pool store the env vars ask for: `TablePoolStore` when
 * `PROFILE_STORE=table` (the storage account settings of
 * `tableClientFromEnv`, table `POOL_TABLE_NAME` or `shards`), else
 * `MemoryPoolStore`. Throws, saying what's wrong, on missing table settings.
 */
export function poolStoreFromEnv(env: NodeJS.ProcessEnv = process.env): PoolStore {
  if (env.PROFILE_STORE?.trim().toLowerCase() !== 'table') return new MemoryPoolStore();
  const tableName = env.POOL_TABLE_NAME?.trim() || DEFAULT_POOL_TABLE;
  const { client, ensureTable } = tableClientFromEnv(env, tableName);
  const table = azurePoolTable(client);
  return new TablePoolStore({
    upsert: async (row) => {
      await ensureTable();
      await table.upsert(row);
    },
    list: async () => {
      await ensureTable();
      return table.list();
    },
  });
}
