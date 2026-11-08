import { describe, expect, it } from 'vitest';
import { Rng } from '../sim/rng';
import {
  JOIN_CODE_ALPHABET,
  MAX_SHARDS,
  generateJoinCode,
  normalizeJoinCode,
  shardOfJoinCode,
} from './joinCode';

describe('join codes', () => {
  it('are four letters from the alphabet, without I and O', () => {
    expect(JOIN_CODE_ALPHABET).not.toMatch(/[IO01]/);
    const rng = new Rng(7);
    for (let i = 0; i < 200; i++) {
      const code = generateJoinCode(
        (n) => rng.int(0, n - 1),
        () => false,
      );
      expect(code).toMatch(/^[A-HJ-NP-Z]{4}$/);
    }
  });

  it('never hands out a taken code', () => {
    const rng = new Rng(3);
    const taken = new Set<string>();
    for (let i = 0; i < 500; i++) {
      const code = generateJoinCode(
        (n) => rng.int(0, n - 1),
        (c) => taken.has(c),
      );
      expect(taken.has(code)).toBe(false);
      taken.add(code);
    }
  });

  it('skips taken codes and gives up when every try is taken', () => {
    let calls = 0;
    // AAAA first, then BBBB.
    const randomInt = (): number => (calls++ < 4 ? 0 : 1);
    expect(generateJoinCode(randomInt, (c) => c === 'AAAA')).toBe('BBBB');
    expect(() =>
      generateJoinCode(
        () => 0,
        () => true,
      ),
    ).toThrow();
  });

  it('normalizes what people type', () => {
    expect(normalizeJoinCode('abcd')).toBe('ABCD');
    expect(normalizeJoinCode(' ab-cd ')).toBe('ABCD');
    expect(normalizeJoinCode('Zx Yw')).toBe('ZXYW');
  });

  it('refuses what cannot be a code', () => {
    expect(normalizeJoinCode('')).toBeNull();
    expect(normalizeJoinCode('ABC')).toBeNull();
    expect(normalizeJoinCode('ABCDE')).toBeNull();
    expect(normalizeJoinCode('ABCO')).toBeNull();
    expect(normalizeJoinCode('ABC1')).toBeNull();
    expect(normalizeJoinCode('AB!D')).toBeNull();
  });
});

describe('join code shards', () => {
  it('maps the first letter to a shard: its place in the alphabet mod the count', () => {
    expect(MAX_SHARDS).toBe(24);
    expect(shardOfJoinCode('ABCD', 1)).toBe(0);
    expect(shardOfJoinCode('ZZZZ', 1)).toBe(0);
    expect(shardOfJoinCode('ABCD', 2)).toBe(0);
    expect(shardOfJoinCode('BBCD', 2)).toBe(1);
    // J is 8th (0-based) without I.
    expect(shardOfJoinCode('JAAA', 3)).toBe(2);
    expect(shardOfJoinCode('ZAAA', 4)).toBe(3);
    // Not a code: the first shard.
    expect(shardOfJoinCode('', 3)).toBe(0);
    expect(shardOfJoinCode('1AAA', 3)).toBe(0);
  });

  it('splits the letters evenly over 1, 2, 3, 4, 6 and 8 shards', () => {
    for (const count of [1, 2, 3, 4, 6, 8]) {
      const perShard = new Array<number>(count).fill(0);
      for (const letter of JOIN_CODE_ALPHABET) {
        const shard = shardOfJoinCode(`${letter}AAA`, count);
        perShard[shard] = (perShard[shard] ?? 0) + 1;
      }
      expect(perShard).toEqual(new Array<number>(count).fill(24 / count));
    }
  });

  it('only generates codes of the asked shard, with every one of its letters', () => {
    const rng = new Rng(11);
    for (const count of [1, 2, 3, 5, 8, 24]) {
      for (let index = 0; index < count; index++) {
        const firsts = new Set<string>();
        for (let i = 0; i < 300; i++) {
          const code = generateJoinCode(
            (n) => rng.int(0, n - 1),
            () => false,
            { index, count },
          );
          expect(normalizeJoinCode(code)).toBe(code);
          expect(shardOfJoinCode(code, count)).toBe(index);
          firsts.add(code.charAt(0));
        }
        const letters = JOIN_CODE_ALPHABET.split('').filter((_, i) => i % count === index);
        expect([...firsts].sort()).toEqual(letters);
      }
    }
  });

  it('draws the first letter once, without rejecting rolls', () => {
    const asked: number[] = [];
    const code = generateJoinCode(
      (n) => {
        asked.push(n);
        return n - 1;
      },
      () => false,
      { index: 1, count: 3 },
    );
    // Shard 1 of 3 has the letters B, E, H, L, P, S, V, Y.
    expect(asked).toEqual([8, 24, 24, 24]);
    expect(code).toBe('YZZZ');
  });
});
