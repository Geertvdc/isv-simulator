import { beforeEach, describe, expect, it } from 'vitest';
import { defaultDisplayName } from '../src/flow/identity';
import { NET_PROFILE_WRITE_TRIES } from '../src/sim/balance';
import { ProfileLimitError } from './profileStore';
import { profileStoreFromEnv } from './profileStoreFromEnv';
import {
  type ProfileEntity,
  type ProfileTable,
  TableProfileStore,
  type WriteResult,
} from './tableProfileStore';

const ID_A = '3f2b8c1e-9d4a-4e6b-8a1c-2b3c4d5e6f70';
const ID_B = 'a1b2c3d4-e5f6-4a7b-9c8d-0e1f2a3b4c5d';
const T1 = '2026-10-11T10:00:00.000Z';
const T2 = '2026-10-11T11:00:00.000Z';

/**
 * A table in memory with ETags, async like the real one. `beforeWrite` runs
 * before every create or replace is checked: a test makes another writer
 * change the entity there.
 */
class FakeTable implements ProfileTable {
  readonly rows = new Map<string, { entity: ProfileEntity; etag: string }>();
  private nextEtag = 1;
  counts = 0;
  writes = 0;
  beforeWrite: (entity: ProfileEntity) => void = () => undefined;

  async get(userId: string): Promise<{ entity: ProfileEntity; etag: string } | null> {
    await Promise.resolve();
    const row = this.rows.get(userId);
    return row ? { entity: { ...row.entity }, etag: row.etag } : null;
  }

  async create(entity: ProfileEntity): Promise<WriteResult> {
    await Promise.resolve();
    this.writes++;
    this.beforeWrite(entity);
    if (this.rows.has(entity.userId)) return 'conflict';
    this.put(entity);
    return 'ok';
  }

  async replace(entity: ProfileEntity, etag: string): Promise<WriteResult> {
    await Promise.resolve();
    this.writes++;
    this.beforeWrite(entity);
    if (this.rows.get(entity.userId)?.etag !== etag) return 'conflict';
    this.put(entity);
    return 'ok';
  }

  async count(): Promise<number> {
    await Promise.resolve();
    this.counts++;
    return this.rows.size;
  }

  /** Writes without any check: another server's write. */
  put(entity: ProfileEntity): void {
    this.rows.set(entity.userId, { entity: { ...entity }, etag: `W/"${this.nextEtag++}"` });
  }
}

/** Another server's version of the profile: plays one more garage round. */
function otherServerPlays(table: FakeTable, userId: string): void {
  const row = table.rows.get(userId);
  const levels = row ? (JSON.parse(row.entity.levels) as Record<string, { plays: number }>) : {};
  const garage = levels.garage ?? { bestStars: 1, bestScore: 5, plays: 0 };
  garage.plays++;
  levels.garage = garage;
  table.put({
    userId,
    displayName: row?.entity.displayName ?? 'Other',
    levels: JSON.stringify(levels),
    createdAt: row?.entity.createdAt ?? T1,
    updatedAt: T1,
  });
}

/** Waits before retries, as asked: none, but noted. */
const waits: number[] = [];
function storeOn(table: ProfileTable): TableProfileStore {
  return new TableProfileStore(table, undefined, undefined, (attempt) => {
    waits.push(attempt);
    return Promise.resolve();
  });
}

describe('TableProfileStore', () => {
  beforeEach(() => {
    waits.length = 0;
  });

  it('has no profile for an unknown user', async () => {
    expect(await new TableProfileStore(new FakeTable()).get(ID_A)).toBeNull();
  });

  it('stores one entity per user with the levels as JSON', async () => {
    const table = new FakeTable();
    const store = new TableProfileStore(table);
    const levels = { garage: { bestStars: 2, bestScore: 80, plays: 3 } };
    const profile = await store.merge(ID_A, { levels }, T1);
    expect(profile).toEqual({
      userId: ID_A,
      displayName: defaultDisplayName(ID_A),
      levels,
      createdAt: T1,
      updatedAt: T1,
    });
    expect(table.rows.get(ID_A)?.entity).toEqual({
      userId: ID_A,
      displayName: defaultDisplayName(ID_A),
      levels: JSON.stringify(levels),
      createdAt: T1,
      updatedAt: T1,
    });
    expect(await store.get(ID_A)).toEqual(profile);
  });

  it('merges like the other stores: best wins, plays is the larger count, names normalized', async () => {
    const store = new TableProfileStore(new FakeTable());
    await store.merge(
      ID_A,
      { displayName: 'Ada', levels: { garage: { bestStars: 2, bestScore: 80, plays: 3 } } },
      T1,
    );
    const merged = await store.merge(
      ID_A,
      {
        displayName: '  Grace   Hopper ',
        levels: { garage: { bestStars: 1, bestScore: 90, plays: 1 } },
      },
      T2,
    );
    expect(merged.displayName).toBe('Grace Hopper');
    expect(merged.levels.garage).toEqual({ bestStars: 2, bestScore: 90, plays: 3 });
    expect(merged.createdAt).toBe(T1);
    expect(merged.updatedAt).toBe(T2);
    // A blank name doesn't replace the one there.
    expect((await store.merge(ID_A, { displayName: '   ' }, T2)).displayName).toBe('Grace Hopper');
  });

  it('records round results', async () => {
    const store = new TableProfileStore(new FakeTable());
    await store.recordResult(ID_A, 'garage', { score: 40, stars: 2 }, T1, 'Ada');
    const profile = await store.recordResult(ID_A, 'garage', { score: 20, stars: 3 }, T2);
    expect(profile.displayName).toBe('Ada');
    expect(profile.levels).toEqual({ garage: { bestStars: 3, bestScore: 40, plays: 2 } });
  });

  it('reads broken entities with defaults', async () => {
    const table = new FakeTable();
    table.put({ userId: ID_A, displayName: '', levels: 'not json', createdAt: T1, updatedAt: T1 });
    expect(await new TableProfileStore(table).get(ID_A)).toEqual({
      userId: ID_A,
      displayName: defaultDisplayName(ID_A),
      levels: {},
      createdAt: T1,
      updatedAt: T1,
    });
  });

  it('lands every one of many concurrent writes from this process, without conflicts', async () => {
    const table = new FakeTable();
    const store = new TableProfileStore(table);
    await Promise.all(
      Array.from({ length: 50 }, (_, i) =>
        store.recordResult(i % 2 ? ID_A : ID_B, 'garage', { score: i, stars: 1 }, T1),
      ),
    );
    expect((await store.get(ID_A))?.levels.garage).toEqual({
      bestStars: 1,
      bestScore: 49,
      plays: 25,
    });
    expect((await store.get(ID_B))?.levels.garage).toEqual({
      bestStars: 1,
      bestScore: 48,
      plays: 25,
    });
    expect(table.writes).toBe(50);
  });

  it('retries when another server changed the profile in between, keeping both changes', async () => {
    const table = new FakeTable();
    const store = storeOn(table);
    await store.recordResult(ID_A, 'garage', { score: 10, stars: 1 }, T1);
    let interruptions = 2;
    table.beforeWrite = () => {
      if (interruptions-- > 0) otherServerPlays(table, ID_A);
    };
    const profile = await store.recordResult(ID_A, 'garage', { score: 20, stars: 2 }, T2);
    // Ours, plus the two the other server recorded while we tried.
    expect(profile.levels.garage).toEqual({ bestStars: 2, bestScore: 20, plays: 4 });
    expect((await store.get(ID_A))?.levels.garage?.plays).toBe(4);
    expect(table.writes).toBe(1 + 3);
    // It waited before each retry, longer each time.
    expect(waits).toEqual([1, 2]);
  });

  it('retries a create when another server created the profile first', async () => {
    const table = new FakeTable();
    const store = storeOn(table);
    let once = true;
    table.beforeWrite = () => {
      if (once) otherServerPlays(table, ID_A);
      once = false;
    };
    const profile = await store.merge(ID_A, { displayName: 'Ada' }, T2);
    expect(profile.displayName).toBe('Ada');
    expect(profile.levels.garage?.plays).toBe(1);
    expect(profile.createdAt).toBe(T1);
  });

  it('gives up after a bounded number of tries when the conflicts go on', async () => {
    const table = new FakeTable();
    const store = storeOn(table);
    await store.merge(ID_A, {}, T1);
    const before = table.writes;
    table.beforeWrite = () => {
      otherServerPlays(table, ID_A);
    };
    await expect(store.merge(ID_A, { displayName: 'Ada' }, T2)).rejects.toThrow('kept changing');
    expect(table.writes - before).toBe(NET_PROFILE_WRITE_TRIES);
    expect(waits).toHaveLength(NET_PROFILE_WRITE_TRIES - 1);
    // The next change goes through once the other writer stops.
    table.beforeWrite = () => undefined;
    expect((await store.merge(ID_A, { displayName: 'Ada' }, T2)).displayName).toBe('Ada');
  });

  it('counts the table once, then its own creations, for the profile cap', async () => {
    const table = new FakeTable();
    otherServerPlays(table, ID_A);
    const ID_C = 'b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e';
    const store = new TableProfileStore(table, 2);
    await store.merge(ID_B, {}, T1);
    await expect(store.merge(ID_C, {}, T1)).rejects.toBeInstanceOf(ProfileLimitError);
    await expect(
      store.recordResult(ID_C, 'garage', { score: 1, stars: 1 }, T1),
    ).rejects.toBeInstanceOf(ProfileLimitError);
    expect(await store.get(ID_C)).toBeNull();
    // Existing profiles still change.
    expect((await store.merge(ID_A, { displayName: 'Ada' }, T2)).displayName).toBe('Ada');
    expect(table.counts).toBe(1);
  });

  it('counts again after a failed count', async () => {
    const table = new FakeTable();
    const count = table.count.bind(table);
    let fail = true;
    table.count = () => (fail ? Promise.reject(new Error('down')) : count());
    const store = new TableProfileStore(table);
    await expect(store.merge(ID_A, {}, T1)).rejects.toThrow('down');
    fail = false;
    expect((await store.merge(ID_A, {}, T1)).userId).toBe(ID_A);
  });
});

describe('profileStoreFromEnv', () => {
  it('picks the JSON file by default and the table with PROFILE_STORE=table', () => {
    expect(profileStoreFromEnv({}).constructor.name).toBe('JsonFileProfileStore');
    expect(profileStoreFromEnv({ PROFILE_STORE: 'file' }).constructor.name).toBe(
      'JsonFileProfileStore',
    );
    expect(
      profileStoreFromEnv({
        PROFILE_STORE: 'table',
        PROFILE_TABLE_CONNECTION_STRING: 'UseDevelopmentStorage=true',
      }),
    ).toBeInstanceOf(TableProfileStore);
    expect(
      profileStoreFromEnv({
        PROFILE_STORE: 'table',
        PROFILE_TABLE_ENDPOINT: 'https://example.table.core.windows.net',
        AZURE_CLIENT_ID: '00000000-0000-0000-0000-000000000000',
      }),
    ).toBeInstanceOf(TableProfileStore);
  });

  it('refuses an unknown store or a table without settings', () => {
    expect(() => profileStoreFromEnv({ PROFILE_STORE: 'redis' })).toThrow(
      'PROFILE_STORE must be "file" or "table"',
    );
    expect(() => profileStoreFromEnv({ PROFILE_STORE: 'table' })).toThrow(
      'PROFILE_TABLE_ENDPOINT or PROFILE_TABLE_CONNECTION_STRING',
    );
  });
});
