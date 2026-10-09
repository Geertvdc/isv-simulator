import { describe, expect, it } from 'vitest';
import { Rng, createRng, int, next } from './rng';

function draws(rng: Rng, n: number): number[] {
  return Array.from({ length: n }, () => rng.next());
}

describe('rng', () => {
  it('gives the same sequence for the same seed', () => {
    expect(draws(new Rng(42), 100)).toEqual(draws(new Rng(42), 100));
  });

  it('gives different sequences for different seeds', () => {
    expect(draws(new Rng(1), 10)).not.toEqual(draws(new Rng(2), 10));
  });

  it('next() returns floats in [0, 1)', () => {
    const rng = new Rng(7);
    for (let i = 0; i < 10_000; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('int() stays within bounds over many draws', () => {
    const rng = new Rng(123);
    const ranges: [number, number][] = [
      [0, 1],
      [1, 6],
      [-5, 5],
      [-10, -3],
      [0, 1000],
    ];
    for (const [min, max] of ranges) {
      const seen = new Set<number>();
      for (let i = 0; i < 10_000; i++) {
        const v = rng.int(min, max);
        expect(Number.isInteger(v)).toBe(true);
        expect(v).toBeGreaterThanOrEqual(min);
        expect(v).toBeLessThanOrEqual(max);
        seen.add(v);
      }
      // Both ends are reachable for small ranges.
      if (max - min <= 20) {
        expect(seen.has(min)).toBe(true);
        expect(seen.has(max)).toBe(true);
      }
    }
  });

  it('int() handles min === max', () => {
    const rng = new Rng(5);
    for (let i = 0; i < 100; i++) expect(rng.int(3, 3)).toBe(3);
  });

  it('int() rejects invalid ranges', () => {
    expect(() => int(createRng(1), 5, 1)).toThrow(RangeError);
    expect(() => int(createRng(1), 0.5, 2)).toThrow(RangeError);
  });

  it('pick() returns elements of the array', () => {
    const rng = new Rng(99);
    const items = ['a', 'b', 'c'] as const;
    for (let i = 0; i < 1000; i++) expect(items).toContain(rng.pick(items));
  });

  it('pick() throws on an empty array', () => {
    expect(() => new Rng(1).pick([])).toThrow(RangeError);
  });

  it('state is a plain number that can be saved and restored', () => {
    const rng = new Rng(2024);
    draws(rng, 17);
    const saved = JSON.parse(JSON.stringify({ rng: rng.state })) as { rng: number };
    expect(typeof saved.rng).toBe('number');

    const restored = new Rng(0);
    restored.state = saved.rng;
    expect(draws(restored, 50)).toEqual(draws(rng, 50));
  });

  it('pure next() does not mutate and is repeatable', () => {
    const s = createRng(10);
    expect(next(s)).toEqual(next(s));
  });
});
