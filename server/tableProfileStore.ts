/**
 * The profile store several servers (shards) share: Azure Table Storage, one
 * entity per user (PartitionKey the user id, RowKey `profile`; fields
 * `displayName`, `levels` as a JSON string, `createdAt`, `updatedAt`).
 *
 * Same rules as `MemoryProfileStore` (the helpers in `profileStore.ts`), but
 * any shard may change a profile at the same time, so every change is
 * optimistic: read the entity and its ETag, apply the change, then replace
 * it only if the ETag still matches (or create it only if it's still
 * missing). When another writer got there first, wait a little (random,
 * growing), read again and retry, up to `NET_PROFILE_WRITE_TRIES` times,
 * then throw. Within one process,
 * changes to the same user wait for each other, so they never conflict.
 *
 * The Azure SDK sits behind `ProfileTable`, so the tests use a fake.
 */

import { type TableEntity, TableClient } from '@azure/data-tables';
import { DefaultAzureCredential, ManagedIdentityCredential } from '@azure/identity';
import {
  NET_MAX_PROFILES,
  NET_PROFILE_RETRY_DELAY_MS,
  NET_PROFILE_WRITE_TRIES,
} from '../src/sim/balance';
import type { LevelResult } from '../src/sim/orders';
import {
  type Profile,
  ProfileLimitError,
  type ProfileStore,
  type ProfileUpdate,
  applyResult,
  applyUpdate,
  newProfile,
  parseProfile,
} from './profileStore';

/** The RowKey of every profile entity (one per partition, i.e. per user). */
export const PROFILE_ROW_KEY = 'profile';
export const DEFAULT_PROFILE_TABLE = 'profiles';

/** A profile as stored: the levels as a JSON string. */
export interface ProfileEntity {
  userId: string;
  displayName: string;
  levels: string;
  createdAt: string;
  updatedAt: string;
}

/** `conflict`: someone else changed (or created) the entity first. */
export type WriteResult = 'ok' | 'conflict';

/** The few table operations the store needs. */
export interface ProfileTable {
  /** The entity and its ETag, or `null` when the user has none. */
  get(userId: string): Promise<{ entity: ProfileEntity; etag: string } | null>;
  /** Adds the entity; `conflict` when it exists already. */
  create(entity: ProfileEntity): Promise<WriteResult>;
  /** Replaces the entity; `conflict` when its ETag isn't `etag` any more (or it's gone). */
  replace(entity: ProfileEntity, etag: string): Promise<WriteResult>;
  /** How many profiles there are. */
  count(): Promise<number>;
}

function toEntity(profile: Profile): ProfileEntity {
  return {
    userId: profile.userId,
    displayName: profile.displayName,
    levels: JSON.stringify(profile.levels),
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt,
  };
}

function fromEntity(entity: ProfileEntity): Profile {
  let levels: unknown;
  try {
    levels = JSON.parse(entity.levels);
  } catch {
    levels = {};
  }
  return parseProfile(entity.userId, { ...entity, levels });
}

export class TableProfileStore implements ProfileStore {
  /**
   * Profiles there are, roughly: counted once on first use, plus the ones
   * this process created since. Other shards' creations aren't seen until a
   * restart, so with N shards the limit can be passed by up to N - 1 times
   * what each created since starting; it's a guard against floods, not an
   * exact cap.
   */
  private known: Promise<number> | null = null;
  private created = 0;
  /** The last queued change per user, so this process's changes to one profile run one at a time. */
  private queues = new Map<string, Promise<unknown>>();

  constructor(
    private readonly table: ProfileTable,
    /** Past about this many profiles, creating one throws `ProfileLimitError`; existing ones still change. */
    readonly maxProfiles = NET_MAX_PROFILES,
    private readonly tries = NET_PROFILE_WRITE_TRIES,
    /**
     * Waits before try `attempt` (1, 2, ...) after a conflict, so two
     * servers changing one profile don't keep colliding: a random part of
     * `NET_PROFILE_RETRY_DELAY_MS`, doubling each time. Tests pass none.
     */
    private readonly backoff: (attempt: number) => Promise<void> = (attempt) =>
      new Promise((resolve) => {
        setTimeout(resolve, Math.random() * NET_PROFILE_RETRY_DELAY_MS * 2 ** (attempt - 1));
      }),
  ) {}

  async get(userId: string): Promise<Profile | null> {
    const found = await this.table.get(userId);
    return found ? fromEntity(found.entity) : null;
  }

  merge(userId: string, update: ProfileUpdate, now: string): Promise<Profile> {
    return this.change(userId, now, (profile) => {
      applyUpdate(profile, update);
    });
  }

  recordResult(
    userId: string,
    levelId: string,
    result: LevelResult,
    now: string,
    displayName?: string,
  ): Promise<Profile> {
    return this.change(userId, now, (profile) => {
      applyResult(profile, levelId, result, displayName);
    });
  }

  /** Queues the change after this process's earlier changes to the same user. */
  private change(userId: string, now: string, apply: (profile: Profile) => void): Promise<Profile> {
    const before = this.queues.get(userId) ?? Promise.resolve();
    const next = before.then(() => this.write(userId, now, apply));
    const tail = next.catch(() => undefined);
    this.queues.set(userId, tail);
    void tail.then(() => {
      if (this.queues.get(userId) === tail) this.queues.delete(userId);
    });
    return next;
  }

  /** Read, apply, write if nobody wrote in between; else again. */
  private async write(
    userId: string,
    now: string,
    apply: (profile: Profile) => void,
  ): Promise<Profile> {
    for (let attempt = 0; attempt < this.tries; attempt++) {
      if (attempt > 0) await this.backoff(attempt);
      const found = await this.table.get(userId);
      if (found) {
        const profile = fromEntity(found.entity);
        apply(profile);
        profile.updatedAt = now;
        if ((await this.table.replace(toEntity(profile), found.etag)) === 'ok') return profile;
        continue;
      }
      if ((await this.profileCount()) >= this.maxProfiles) {
        throw new ProfileLimitError(this.maxProfiles);
      }
      const profile = newProfile(userId, now);
      apply(profile);
      if ((await this.table.create(toEntity(profile))) === 'ok') {
        this.created++;
        return profile;
      }
    }
    throw new Error(`profile ${userId} kept changing: gave up after ${this.tries} tries`);
  }

  private async profileCount(): Promise<number> {
    // A failed count (say, the table is unreachable) is tried again next time.
    this.known ??= this.table.count().catch((error: unknown) => {
      this.known = null;
      throw error;
    });
    return (await this.known) + this.created;
  }
}

/** HTTP status of an Azure SDK error (`RestError`), if it has one. */
function statusOf(error: unknown): number | undefined {
  const status = (error as { statusCode?: unknown } | null)?.statusCode;
  return typeof status === 'number' ? status : undefined;
}

/** `ProfileTable` on a real table (`@azure/data-tables`). */
export function azureProfileTable(client: TableClient): ProfileTable {
  const toAzure = (entity: ProfileEntity): TableEntity => ({
    partitionKey: entity.userId,
    rowKey: PROFILE_ROW_KEY,
    displayName: entity.displayName,
    levels: entity.levels,
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt,
  });
  const str = (v: unknown): string => (typeof v === 'string' ? v : '');
  /** 409 (exists already) and 412 (ETag changed) mean another writer won; 404 on replace: it was deleted. */
  const write = async (fn: () => Promise<unknown>, conflicts: number[]): Promise<WriteResult> => {
    try {
      await fn();
      return 'ok';
    } catch (error) {
      const status = statusOf(error);
      if (status !== undefined && conflicts.includes(status)) return 'conflict';
      throw error;
    }
  };
  return {
    get: async (userId) => {
      try {
        const e = await client.getEntity(userId, PROFILE_ROW_KEY);
        return {
          entity: {
            userId,
            displayName: str(e.displayName),
            levels: str(e.levels),
            createdAt: str(e.createdAt),
            updatedAt: str(e.updatedAt),
          },
          etag: e.etag,
        };
      } catch (error) {
        if (statusOf(error) === 404) return null;
        throw error;
      }
    },
    create: (entity) => write(() => client.createEntity(toAzure(entity)), [409]),
    replace: (entity, etag) =>
      write(() => client.updateEntity(toAzure(entity), 'Replace', { etag }), [404, 412]),
    count: async () => {
      let n = 0;
      const rows = client.listEntities({
        queryOptions: { filter: `RowKey eq '${PROFILE_ROW_KEY}'`, select: ['PartitionKey'] },
      });
      for await (const page of rows.byPage()) n += page.length;
      return n;
    },
  };
}

/** A table client from the env vars, and a way to make sure its table exists. */
export interface EnvTable {
  client: TableClient;
  /** Creates the table if it's missing (local dev only: in Azure, Bicep creates it); a no-op otherwise. */
  ensureTable: () => Promise<unknown>;
}

/**
 * A client for table `tableName` in the storage account the env vars name:
 * `PROFILE_TABLE_CONNECTION_STRING` (Azurite, local dev: `ensureTable`
 * creates the table if missing), or else `PROFILE_TABLE_ENDPOINT` with an
 * Azure identity: the user-assigned managed identity `AZURE_CLIENT_ID` when
 * set (Container Apps), else `DefaultAzureCredential` (az login, other
 * hosts). The profile store and the shard pool (`poolStore.ts`) share it.
 */
export function tableClientFromEnv(env: NodeJS.ProcessEnv, tableName: string): EnvTable {
  const connectionString = env.PROFILE_TABLE_CONNECTION_STRING?.trim();
  const endpoint = env.PROFILE_TABLE_ENDPOINT?.trim();
  if (connectionString) {
    const local = /UseDevelopmentStorage=true|https?:\/\/(127\.0\.0\.1|localhost)/i;
    const client = TableClient.fromConnectionString(connectionString, tableName, {
      allowInsecureConnection: local.test(connectionString),
    });
    let created: Promise<unknown> | null = null;
    // `createTable` ignores "already exists"; a failure is tried again on the next call.
    const ensureTable = () =>
      (created ??= client.createTable().catch((error: unknown) => {
        created = null;
        throw error;
      }));
    return { client, ensureTable };
  }
  if (endpoint) {
    const clientId = env.AZURE_CLIENT_ID?.trim();
    const credential = clientId
      ? new ManagedIdentityCredential({ clientId })
      : new DefaultAzureCredential();
    return {
      client: new TableClient(endpoint, tableName, credential),
      ensureTable: () => Promise.resolve(),
    };
  }
  throw new Error(
    'PROFILE_STORE=table needs PROFILE_TABLE_ENDPOINT or PROFILE_TABLE_CONNECTION_STRING',
  );
}

/**
 * A `TableProfileStore` from the env vars (`tableClientFromEnv`);
 * `PROFILE_TABLE_NAME` defaults to `profiles`.
 */
export function tableProfileStoreFromEnv(env: NodeJS.ProcessEnv): TableProfileStore {
  const tableName = env.PROFILE_TABLE_NAME?.trim() || DEFAULT_PROFILE_TABLE;
  const { client, ensureTable } = tableClientFromEnv(env, tableName);
  const table = azureProfileTable(client);
  return new TableProfileStore({
    get: async (userId) => {
      await ensureTable();
      return table.get(userId);
    },
    create: async (entity) => {
      await ensureTable();
      return table.create(entity);
    },
    replace: async (entity, etag) => {
      await ensureTable();
      return table.replace(entity, etag);
    },
    count: async () => {
      await ensureTable();
      return table.count();
    },
  });
}
