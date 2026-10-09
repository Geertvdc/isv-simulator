/**
 * Seeded RNG (mulberry32). The whole RNG state is one uint32, so it can be
 * stored as a plain number in `GameState` and restored later.
 *
 * The pure functions take a state and return `[value, nextState]`.
 * `Rng` is a small mutable wrapper for convenience; keep only `rng.state`
 * in game state, never the wrapper itself.
 */

export type RngState = number;

/** Normalizes any number into a valid uint32 RNG state. */
export function createRng(seed: number): RngState {
  return seed >>> 0;
}

/** Returns a float in [0, 1) and the next state. */
export function next(state: RngState): [value: number, state: RngState] {
  const nextState = (state + 0x6d2b79f5) >>> 0;
  let t = nextState;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return [value, nextState];
}

/** Returns an integer in [min, max] (both inclusive) and the next state. */
export function int(state: RngState, min: number, max: number): [value: number, state: RngState] {
  if (!Number.isInteger(min) || !Number.isInteger(max) || max < min) {
    throw new RangeError(`int(min, max) needs integers with min <= max, got ${min}, ${max}`);
  }
  const [r, nextState] = next(state);
  return [min + Math.floor(r * (max - min + 1)), nextState];
}

/** Returns a random element of a non-empty array and the next state. */
export function pick<T>(state: RngState, items: readonly T[]): [value: T, state: RngState] {
  if (items.length === 0) {
    throw new RangeError('pick() needs a non-empty array');
  }
  const [i, nextState] = int(state, 0, items.length - 1);
  return [items[i] as T, nextState];
}

export class Rng {
  state: RngState;

  constructor(seed: number) {
    this.state = createRng(seed);
  }

  next(): number {
    const [value, state] = next(this.state);
    this.state = state;
    return value;
  }

  int(min: number, max: number): number {
    const [value, state] = int(this.state, min, max);
    this.state = state;
    return value;
  }

  pick<T>(items: readonly T[]): T {
    const [value, state] = pick(this.state, items);
    this.state = state;
    return value;
  }
}
