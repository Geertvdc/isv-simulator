/**
 * Join codes: a room's id, typed in by the people joining it. Letters only,
 * without I and O, which are easy to mix up with 1 and 0. Case-insensitive:
 * players type them any way they like, `normalizeJoinCode` cleans that up.
 */

import { NET_JOIN_CODE_LENGTH } from '../sim/balance';

export const JOIN_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

const CODE_PATTERN = new RegExp(`^[${JOIN_CODE_ALPHABET}]+$`);

/** Tries before `generateJoinCode` gives up; only reached with most codes in use. */
const MAX_TRIES = 1000;

/**
 * A fresh code that `isTaken` says is free. `randomInt(n)` returns a whole
 * number from 0 to n - 1 (the server passes `crypto.randomInt`).
 */
export function generateJoinCode(
  randomInt: (maxExclusive: number) => number,
  isTaken: (code: string) => boolean,
): string {
  for (let i = 0; i < MAX_TRIES; i++) {
    let code = '';
    for (let c = 0; c < NET_JOIN_CODE_LENGTH; c++) {
      code += JOIN_CODE_ALPHABET[randomInt(JOIN_CODE_ALPHABET.length)] ?? '';
    }
    if (!isTaken(code)) return code;
  }
  throw new Error('No free join code found');
}

/**
 * A typed-in code as the server knows it: upper case, without spaces or
 * dashes. `null` when it can't be a code.
 */
export function normalizeJoinCode(text: string): string | null {
  const code = text.toUpperCase().replace(/[\s-]/g, '');
  if (code.length !== NET_JOIN_CODE_LENGTH) return null;
  return CODE_PATTERN.test(code) ? code : null;
}
