/**
 * Best stars per level, kept in the browser's `localStorage`. Storage can be
 * missing or throw (private windows, blocked site data), so every access is
 * guarded and the game plays fine without it.
 */

const KEY = 'isv-simulator.best-stars';

/** The part of `Storage` we use, so tests can pass a fake. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export type BestStars = Record<string, number>;

/** The browser's `localStorage`, or `null` where touching it throws. */
export function browserStorage(): StorageLike | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** Best stars by level id; levels never finished are missing. */
export function loadBestStars(storage: StorageLike | null): BestStars {
  try {
    const parsed: unknown = JSON.parse(storage?.getItem(KEY) ?? '{}');
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
    const result: BestStars = {};
    for (const [id, stars] of Object.entries(parsed)) {
      if (typeof stars === 'number' && Number.isFinite(stars)) result[id] = stars;
    }
    return result;
  } catch {
    return {};
  }
}

/** Saves `stars` for a level if it beats the best so far. Returns whether it did. */
export function recordStars(storage: StorageLike | null, levelId: string, stars: number): boolean {
  const best = loadBestStars(storage);
  if ((best[levelId] ?? -1) >= stars) return false;
  best[levelId] = stars;
  try {
    storage?.setItem(KEY, JSON.stringify(best));
  } catch {
    // Full or blocked: the best stay in memory for nobody. The game goes on.
  }
  return true;
}
