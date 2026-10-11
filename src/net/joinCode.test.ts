import { describe, expect, it } from 'vitest';
import { Rng } from '../sim/rng';
import { JOIN_CODE_ALPHABET, generateJoinCode, normalizeJoinCode } from './joinCode';

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
