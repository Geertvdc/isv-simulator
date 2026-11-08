/**
 * Join codes: a room's id, typed in by the people joining it. Letters only,
 * without I and O, which are easy to mix up with 1 and 0. Case-insensitive:
 * players type them any way they like, `normalizeJoinCode` cleans that up.
 *
 * Shards: with several game servers, each one (a shard) holds its own rooms,
 * and a code's first letter says which (`shardOfJoinCode`). 24 letters split
 * evenly over 1, 2, 3, 4, 6, 8, 12 or 24 shards.
 */

import { NET_JOIN_CODE_LENGTH } from '../sim/balance';

export const JOIN_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

const CODE_PATTERN = new RegExp(`^[${JOIN_CODE_ALPHABET}]+$`);

/** Which game server of several holds a room: `index` of `count` (0-based). */
export interface Shard {
  index: number;
  count: number;
}

/** At most one shard per letter: past that, a shard would get no codes. */
export const MAX_SHARDS = JOIN_CODE_ALPHABET.length;

/**
 * The shard holding the room with this (normalized) code, out of `count`:
 * its first letter's place in the alphabet mod `count`. 0 with one shard,
 * or for something that isn't a code.
 */
export function shardOfJoinCode(code: string, count: number): number {
  if (count <= 1) return 0;
  const letter = JOIN_CODE_ALPHABET.indexOf(code.charAt(0));
  return letter < 0 ? 0 : letter % count;
}

/** Tries before `generateJoinCode` gives up; only reached with most codes in use. */
const MAX_TRIES = 1000;

/**
 * A fresh code that `isTaken` says is free. `randomInt(n)` returns a whole
 * number from 0 to n - 1 (the server passes `crypto.randomInt`). With a
 * `shard`, the first letter is drawn only from that shard's letters, so
 * `shardOfJoinCode` finds it again.
 */
export function generateJoinCode(
  randomInt: (maxExclusive: number) => number,
  isTaken: (code: string) => boolean,
  shard: Shard = { index: 0, count: 1 },
): string {
  // The shard's letters are at index, index + count, index + 2 * count, ...
  const firstLetters = Math.ceil((JOIN_CODE_ALPHABET.length - shard.index) / shard.count);
  for (let i = 0; i < MAX_TRIES; i++) {
    let code = JOIN_CODE_ALPHABET[shard.index + shard.count * randomInt(firstLetters)] ?? '';
    for (let c = 1; c < NET_JOIN_CODE_LENGTH; c++) {
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
