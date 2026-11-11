/**
 * Where the shard pool's history lives (`poolHistory.ts` says what's in it):
 *
 * - Snapshots: PartitionKey `snap-YYYY-MM-DD` (UTC), RowKey the minute's ISO
 *   time; columns `poolSize`, the totals (`awake`, `rooms`, `players`,
 *   `connections`, `capacity`) and `shards` (every shard's point as a JSON
 *   string).
 * - Events: PartitionKey `event-YYYY-MM-DD`, RowKey the ISO time plus a
 *   short random suffix (two events in one millisecond stay apart); columns
 *   `shard`, `kind`, `detail`.
 *
 * `HistoryStore` works on a small `HistoryTable` interface: Azure Table
 * Storage (`azureHistoryTable`) or a table in memory (`MemoryHistoryTable`,
 * local dev and tests). `historyStoreFromEnv`: the Azure table
 * `HISTORY_TABLE_NAME` (default `poolhistory`) with `PROFILE_STORE=table`,
 * in the same account as the profiles and the pool, else memory.
 */

import { randomBytes } from 'node:crypto';
import { type TableClient, type TransactionAction, odata } from '@azure/data-tables';
import {
  EVENT_PREFIX,
  type PoolEvent,
  type PoolEventKind,
  type PoolSnapshot,
  SNAPSHOT_PREFIX,
  type ShardPoint,
  dayKey,
  partitionsBetween,
  retentionCutoff,
} from './poolHistory';
import { tableClientFromEnv } from './tableProfileStore';

export const DEFAULT_HISTORY_TABLE = 'poolhistory';

/** A row: its keys and its columns (strings and numbers only). */
export interface HistoryRow {
  partitionKey: string;
  rowKey: string;
  columns: Record<string, string | number>;
}

export interface HistoryKey {
  partitionKey: string;
  rowKey: string;
}

/** The table operations the history needs. */
export interface HistoryTable {
  /** Creates or replaces a row. */
  upsert(row: HistoryRow): Promise<void>;
  /** The rows of one partition whose RowKey is at least `fromRowKey` (`''`: all). */
  query(partitionKey: string, fromRowKey: string): Promise<HistoryRow[]>;
  /** Keys of up to `limit` rows whose PartitionKey starts with `prefix` and sorts before `before`. */
  listOlder(prefix: string, before: string, limit: number): Promise<HistoryKey[]>;
  /** Deletes these rows (gone already is fine). */
  deleteMany(keys: readonly HistoryKey[]): Promise<void>;
}

/** A `HistoryTable` in this process. */
export class MemoryHistoryTable implements HistoryTable {
  readonly rows = new Map<string, HistoryRow>();

  private static key(pk: string, rk: string): string {
    return `${pk}\n${rk}`;
  }

  upsert(row: HistoryRow): Promise<void> {
    this.rows.set(MemoryHistoryTable.key(row.partitionKey, row.rowKey), {
      ...row,
      columns: { ...row.columns },
    });
    return Promise.resolve();
  }

  query(partitionKey: string, fromRowKey: string): Promise<HistoryRow[]> {
    const rows = [...this.rows.values()]
      .filter((r) => r.partitionKey === partitionKey && r.rowKey >= fromRowKey)
      .sort((a, b) => (a.rowKey < b.rowKey ? -1 : 1))
      .map((r) => ({ ...r, columns: { ...r.columns } }));
    return Promise.resolve(rows);
  }

  listOlder(prefix: string, before: string, limit: number): Promise<HistoryKey[]> {
    const keys = [...this.rows.values()]
      .filter((r) => r.partitionKey.startsWith(prefix) && r.partitionKey < before)
      .slice(0, limit)
      .map(({ partitionKey, rowKey }) => ({ partitionKey, rowKey }));
    return Promise.resolve(keys);
  }

  deleteMany(keys: readonly HistoryKey[]): Promise<void> {
    for (const k of keys) this.rows.delete(MemoryHistoryTable.key(k.partitionKey, k.rowKey));
    return Promise.resolve();
  }
}

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

function pointFrom(raw: unknown, index: number): ShardPoint {
  const r = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  return {
    index: typeof r.index === 'number' ? r.index : index,
    awake: r.awake === true,
    rooms: num(r.rooms),
    players: num(r.players),
    connections: num(r.connections),
    cpuPct: num(r.cpuPct),
    rssMb: num(r.rssMb),
    loopDelayP99Ms: num(r.loopDelayP99Ms),
  };
}

/** A snapshot from its row, or `null` for a row that isn't one. */
export function snapshotFromRow(row: HistoryRow): PoolSnapshot | null {
  const at = Date.parse(row.rowKey);
  if (Number.isNaN(at)) return null;
  const c = row.columns;
  let shards: unknown;
  try {
    shards = typeof c.shards === 'string' ? JSON.parse(c.shards) : [];
  } catch {
    return null;
  }
  return {
    at,
    poolSize: num(c.poolSize),
    shards: Array.isArray(shards) ? shards.map(pointFrom) : [],
    totals: {
      awake: num(c.awake),
      rooms: num(c.rooms),
      players: num(c.players),
      connections: num(c.connections),
      capacity: num(c.capacity),
    },
  };
}

const EVENT_KINDS: readonly PoolEventKind[] = [
  'woke',
  'slept',
  'restarted',
  'version',
  'wakePing',
  'refusals',
  'allFull',
  'capacityBack',
  'started',
];

/** An event from its row, or `null` for a row that isn't one. */
export function eventFromRow(row: HistoryRow): PoolEvent | null {
  const at = Date.parse(row.rowKey.slice(0, 24));
  const kind = row.columns.kind as PoolEventKind;
  if (Number.isNaN(at) || !EVENT_KINDS.includes(kind)) return null;
  return {
    at,
    shard: num(row.columns.shard),
    kind,
    detail: typeof row.columns.detail === 'string' ? row.columns.detail : '',
  };
}

export interface HistoryStoreOptions {
  /** The RowKey suffix that keeps events in one millisecond apart; random by default. */
  suffix?: () => string;
}

export class HistoryStore {
  private readonly suffix: () => string;

  constructor(
    readonly table: HistoryTable,
    options: HistoryStoreOptions = {},
  ) {
    this.suffix = options.suffix ?? (() => randomBytes(3).toString('hex'));
  }

  async writeSnapshot(snap: PoolSnapshot): Promise<void> {
    await this.table.upsert({
      partitionKey: SNAPSHOT_PREFIX + dayKey(snap.at),
      rowKey: new Date(snap.at).toISOString(),
      columns: {
        poolSize: snap.poolSize,
        ...snap.totals,
        shards: JSON.stringify(snap.shards),
      },
    });
  }

  async writeEvents(events: readonly PoolEvent[]): Promise<void> {
    for (const e of events) {
      await this.table.upsert({
        partitionKey: EVENT_PREFIX + dayKey(e.at),
        rowKey: `${new Date(e.at).toISOString()}-${this.suffix()}`,
        columns: { shard: e.shard, kind: e.kind, detail: e.detail },
      });
    }
  }

  /** Snapshots from `from` to `to` (ms), oldest first; reads only those days. */
  async snapshots(from: number, to: number): Promise<PoolSnapshot[]> {
    const rows = await this.rowsBetween(SNAPSHOT_PREFIX, from, to);
    return rows
      .map(snapshotFromRow)
      .filter((s): s is PoolSnapshot => s !== null && s.at >= from && s.at <= to);
  }

  /** Events from `from` to `to` (ms), oldest first. */
  async events(from: number, to: number): Promise<PoolEvent[]> {
    const rows = await this.rowsBetween(EVENT_PREFIX, from, to);
    return rows
      .map(eventFromRow)
      .filter((e): e is PoolEvent => e !== null && e.at >= from && e.at <= to);
  }

  /**
   * Deletes snapshots and events from days older than `days` before `now`,
   * at most `limit` rows per run. How many it deleted.
   */
  async purge(now: number, days: number, limit: number): Promise<number> {
    let deleted = 0;
    for (const prefix of [SNAPSHOT_PREFIX, EVENT_PREFIX]) {
      if (deleted >= limit) break;
      const keys = await this.table.listOlder(
        prefix,
        retentionCutoff(prefix, now, days),
        limit - deleted,
      );
      await this.table.deleteMany(keys);
      deleted += keys.length;
    }
    return deleted;
  }

  private async rowsBetween(prefix: string, from: number, to: number): Promise<HistoryRow[]> {
    const fromKey = new Date(from).toISOString();
    const parts = partitionsBetween(prefix, from, to);
    const days = await Promise.all(
      parts.map((pk, i) => this.table.query(pk, i === 0 ? fromKey : '')),
    );
    return days.flat();
  }
}

/** Table Storage takes at most 100 operations per transaction, all in one partition. */
const TRANSACTION_MAX = 100;

/** `HistoryTable` on a real table (`@azure/data-tables`). */
export function azureHistoryTable(client: TableClient): HistoryTable {
  return {
    upsert: async (row) => {
      await client.upsertEntity(
        { partitionKey: row.partitionKey, rowKey: row.rowKey, ...row.columns },
        'Replace',
      );
    },
    query: async (partitionKey, fromRowKey) => {
      const rows: HistoryRow[] = [];
      const filter = fromRowKey
        ? odata`PartitionKey eq ${partitionKey} and RowKey ge ${fromRowKey}`
        : odata`PartitionKey eq ${partitionKey}`;
      for await (const e of client.listEntities({ queryOptions: { filter } })) {
        const columns: Record<string, string | number> = {};
        for (const [k, v] of Object.entries(e)) {
          if (k === 'partitionKey' || k === 'rowKey' || k === 'etag' || k === 'timestamp') continue;
          if (typeof v === 'string' || typeof v === 'number') columns[k] = v;
        }
        rows.push({ partitionKey, rowKey: e.rowKey ?? '', columns });
      }
      return rows;
    },
    listOlder: async (prefix, before, limit) => {
      const keys: HistoryKey[] = [];
      const entities = client.listEntities({
        queryOptions: {
          filter: odata`PartitionKey ge ${prefix} and PartitionKey lt ${before}`,
          select: ['PartitionKey', 'RowKey'],
        },
      });
      for await (const e of entities) {
        if (keys.length >= limit) break;
        if (e.partitionKey && e.rowKey)
          keys.push({ partitionKey: e.partitionKey, rowKey: e.rowKey });
      }
      return keys;
    },
    deleteMany: async (keys) => {
      const byPartition = new Map<string, string[]>();
      for (const k of keys) {
        const list = byPartition.get(k.partitionKey) ?? [];
        list.push(k.rowKey);
        byPartition.set(k.partitionKey, list);
      }
      for (const [pk, rks] of byPartition) {
        for (let i = 0; i < rks.length; i += TRANSACTION_MAX) {
          const actions: TransactionAction[] = rks
            .slice(i, i + TRANSACTION_MAX)
            .map((rk) => ['delete', { partitionKey: pk, rowKey: rk }]);
          await client.submitTransaction(actions);
        }
      }
    },
  };
}

/**
 * The history store the env vars ask for: Azure Table Storage with
 * `PROFILE_STORE=table` (the account settings of `tableClientFromEnv`, table
 * `HISTORY_TABLE_NAME` or `poolhistory`; created if missing with a
 * connection string), else in memory. Throws on missing table settings.
 */
export function historyStoreFromEnv(env: NodeJS.ProcessEnv = process.env): HistoryStore {
  if (env.PROFILE_STORE?.trim().toLowerCase() !== 'table') {
    return new HistoryStore(new MemoryHistoryTable());
  }
  const tableName = env.HISTORY_TABLE_NAME?.trim() || DEFAULT_HISTORY_TABLE;
  const { client, ensureTable } = tableClientFromEnv(env, tableName);
  const table = azureHistoryTable(client);
  const ensured =
    <A extends unknown[], R>(fn: (...args: A) => Promise<R>) =>
    async (...args: A): Promise<R> => {
      await ensureTable();
      return fn(...args);
    };
  return new HistoryStore({
    upsert: ensured((row: HistoryRow) => table.upsert(row)),
    query: ensured((pk: string, from: string) => table.query(pk, from)),
    listOlder: ensured((prefix: string, before: string, limit: number) =>
      table.listOlder(prefix, before, limit),
    ),
    deleteMany: ensured((keys: readonly HistoryKey[]) => table.deleteMany(keys)),
  });
}
