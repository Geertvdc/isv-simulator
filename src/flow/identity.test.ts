import { describe, expect, it } from 'vitest';
import {
  DISPLAY_NAME_KEY,
  USER_ID_KEY,
  defaultDisplayName,
  loadIdentity,
  normalizeDisplayName,
  normalizeUserId,
  replaceUserId,
  setDisplayName,
} from './identity';
import type { StorageLike } from './save';

const ID_A = '3f2b8c1e-9d4a-4e6b-8a1c-2b3c4d5e6f70';
const ID_B = 'a1b2c3d4-e5f6-4a7b-9c8d-0e1f2a3b4c5d';

function memoryStorage(): StorageLike & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
  };
}

const throwing: StorageLike = {
  getItem: () => {
    throw new Error('blocked');
  },
  setItem: () => {
    throw new Error('blocked');
  },
};

function ids(...list: string[]): () => string {
  return () => list.shift() ?? 'no more ids';
}

describe('normalizeUserId', () => {
  it('accepts a UUID v4 in any case with spaces around', () => {
    expect(normalizeUserId(`  ${ID_A.toUpperCase()}\n`)).toBe(ID_A);
  });

  it('refuses anything else', () => {
    for (const text of ['', 'hello', ID_A.slice(1), `${ID_A}0`, ID_A.replace('-4e6b', '-1e6b')]) {
      expect(normalizeUserId(text)).toBeNull();
    }
  });
});

describe('display names', () => {
  it('defaults to Dev and four digits from the id', () => {
    expect(defaultDisplayName(ID_A)).toMatch(/^Dev \d{4}$/);
    expect(defaultDisplayName(ID_A)).toBe(defaultDisplayName(ID_A));
    expect(defaultDisplayName(ID_A)).not.toBe(defaultDisplayName(ID_B));
  });

  it('trims, collapses spaces and checks the length', () => {
    expect(normalizeDisplayName('  Ada   Lovelace ')).toBe('Ada Lovelace');
    expect(normalizeDisplayName('   ')).toBeNull();
    expect(normalizeDisplayName('x'.repeat(25))).toBeNull();
    expect(normalizeDisplayName('x'.repeat(24))).toBe('x'.repeat(24));
  });
});

describe('loadIdentity', () => {
  it('creates an id the first time and keeps it after', () => {
    const storage = memoryStorage();
    const first = loadIdentity(storage, ids(ID_A));
    expect(first).toEqual({ userId: ID_A, displayName: defaultDisplayName(ID_A) });
    expect(storage.data.get(USER_ID_KEY)).toBe(ID_A);
    expect(loadIdentity(storage, ids(ID_B))).toEqual(first);
  });

  it('replaces a broken stored id', () => {
    const storage = memoryStorage();
    storage.data.set(USER_ID_KEY, 'not-an-id');
    expect(loadIdentity(storage, ids(ID_B)).userId).toBe(ID_B);
    expect(storage.data.get(USER_ID_KEY)).toBe(ID_B);
  });

  it('reads a stored name and ignores a broken one', () => {
    const storage = memoryStorage();
    storage.data.set(USER_ID_KEY, ID_A);
    storage.data.set(DISPLAY_NAME_KEY, 'Grace');
    expect(loadIdentity(storage, ids()).displayName).toBe('Grace');
    storage.data.set(DISPLAY_NAME_KEY, '');
    expect(loadIdentity(storage, ids()).displayName).toBe(defaultDisplayName(ID_A));
  });

  it('works without storage or with storage that throws', () => {
    expect(loadIdentity(null, ids(ID_A)).userId).toBe(ID_A);
    expect(loadIdentity(throwing, ids(ID_B)).userId).toBe(ID_B);
  });

  it('refuses a generator that gives junk', () => {
    expect(() => loadIdentity(memoryStorage(), () => 'junk')).toThrow();
  });
});

describe('replaceUserId', () => {
  it('switches to a pasted id and stores it', () => {
    const storage = memoryStorage();
    const identity = loadIdentity(storage, ids(ID_A));
    const change = replaceUserId(storage, identity, ` ${ID_B.toUpperCase()} `);
    expect(change).toEqual({
      ok: true,
      identity: { userId: ID_B, displayName: defaultDisplayName(ID_B) },
    });
    expect(loadIdentity(storage, ids()).userId).toBe(ID_B);
  });

  it('keeps a name someone picked', () => {
    const storage = memoryStorage();
    const named = setDisplayName(storage, loadIdentity(storage, ids(ID_A)), 'Grace');
    if (!named.ok) throw new Error(named.reason);
    const change = replaceUserId(storage, named.identity, ID_B);
    expect(change.ok && change.identity.displayName).toBe('Grace');
  });

  it('refuses a bad id and keeps the old one', () => {
    const storage = memoryStorage();
    const identity = loadIdentity(storage, ids(ID_A));
    expect(replaceUserId(storage, identity, 'nope').ok).toBe(false);
    expect(storage.data.get(USER_ID_KEY)).toBe(ID_A);
  });
});

describe('setDisplayName', () => {
  it('stores a valid name and refuses an empty one', () => {
    const storage = memoryStorage();
    const identity = loadIdentity(storage, ids(ID_A));
    expect(setDisplayName(storage, identity, '  Linus ')).toEqual({
      ok: true,
      identity: { userId: ID_A, displayName: 'Linus' },
    });
    expect(storage.data.get(DISPLAY_NAME_KEY)).toBe('Linus');
    expect(setDisplayName(storage, identity, ' ').ok).toBe(false);
    expect(storage.data.get(DISPLAY_NAME_KEY)).toBe('Linus');
  });
});
