import { describe, expect, it } from 'vitest';
import { type StorageLike, loadBestStars, recordStars } from './progress';

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

describe('best stars', () => {
  it('starts empty', () => {
    expect(loadBestStars(memoryStorage())).toEqual({});
  });

  it('keeps the best per level', () => {
    const storage = memoryStorage();
    expect(recordStars(storage, 'garage', 2)).toBe(true);
    expect(recordStars(storage, 'garage', 1)).toBe(false);
    expect(recordStars(storage, 'garage', 2)).toBe(false);
    expect(recordStars(storage, 'open-plan', 0)).toBe(true);
    expect(recordStars(storage, 'garage', 3)).toBe(true);
    expect(loadBestStars(storage)).toEqual({ garage: 3, 'open-plan': 0 });
  });

  it('shrugs off broken data', () => {
    const storage = memoryStorage();
    for (const junk of ['not json', 'null', '[1]', '{"garage":"lots","x":2}']) {
      storage.data.clear();
      storage.setItem('isv-simulator.best-stars', junk);
      expect(() => loadBestStars(storage)).not.toThrow();
    }
    expect(loadBestStars(storage)).toEqual({ x: 2 });
  });

  it('works without storage, or with storage that throws', () => {
    for (const storage of [null, throwing]) {
      expect(loadBestStars(storage)).toEqual({});
      expect(() => recordStars(storage, 'garage', 3)).not.toThrow();
    }
  });
});
