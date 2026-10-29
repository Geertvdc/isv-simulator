import { afterEach, describe, expect, it, vi } from 'vitest';
import { JOIN_CODE_ALPHABET, normalizeJoinCode } from '../src/net/joinCode';
import { NET_JOIN_CODE_LENGTH } from '../src/sim/balance';
import { isLiveJoinCode, releaseJoinCode, reserveJoinCode } from './joinCodes';

/** `crypto.randomInt`, real unless a test scripts its answers. */
const scripted = vi.hoisted((): number[] => []);
vi.mock('node:crypto', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:crypto')>();
  return {
    ...actual,
    randomInt: (max: number) => scripted.shift() ?? actual.randomInt(max),
  };
});

const reserved: string[] = [];
function reserve(): string {
  const code = reserveJoinCode();
  reserved.push(code);
  return code;
}

afterEach(() => {
  scripted.length = 0;
  for (const code of reserved.splice(0)) releaseJoinCode(code);
});

/** Makes the next code `code` (one random pick per letter). */
function script(code: string): void {
  for (const c of code) scripted.push(JOIN_CODE_ALPHABET.indexOf(c));
}

describe('join codes', () => {
  it('reserves codes a player can type: the right length, from the alphabet', () => {
    for (let i = 0; i < 50; i++) {
      const code = reserve();
      expect(code).toHaveLength(NET_JOIN_CODE_LENGTH);
      expect(normalizeJoinCode(code)).toBe(code);
      expect(normalizeJoinCode(code.toLowerCase())).toBe(code);
    }
  });

  it('holds a code live until it is released', () => {
    const code = reserve();
    expect(isLiveJoinCode(code)).toBe(true);
    releaseJoinCode(code);
    expect(isLiveJoinCode(code)).toBe(false);
    // Releasing twice, or a code never handed out, is harmless.
    releaseJoinCode(code);
    releaseJoinCode('ZZZZ');
    expect(isLiveJoinCode(code)).toBe(false);
  });

  it('never hands out a live code twice, rolling again on a collision', () => {
    script('ABCD');
    expect(reserve()).toBe('ABCD');
    script('ABCD');
    script('WXYZ');
    expect(reserve()).toBe('WXYZ');
    expect(isLiveJoinCode('ABCD')).toBe(true);
    expect(isLiveJoinCode('WXYZ')).toBe(true);
  });

  it('hands a released code out again', () => {
    script('ABCD');
    releaseJoinCode(reserve());
    script('ABCD');
    expect(reserve()).toBe('ABCD');
  });

  it('keeps many live codes unique', () => {
    const codes = Array.from({ length: 300 }, reserve);
    expect(new Set(codes).size).toBe(codes.length);
    for (const code of codes) expect(isLiveJoinCode(code)).toBe(true);
  });

  it('gives up rather than loop forever when every roll is taken', () => {
    script('ABCD');
    reserve();
    for (let i = 0; i < 1000; i++) script('ABCD');
    expect(() => reserveJoinCode()).toThrow('No free join code found');
    expect(scripted).toEqual([]);
  });

  it('knows nothing about codes it never handed out', () => {
    expect(isLiveJoinCode('QQQQ')).toBe(false);
    expect(isLiveJoinCode('')).toBe(false);
  });
});
