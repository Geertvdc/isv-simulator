/**
 * The join codes of the rooms alive in this server process, so a new room
 * never gets the code of one still running. One process holds every room
 * (no Redis, no second process), so a module-level set is enough.
 */

import { randomInt } from 'node:crypto';
import { generateJoinCode } from '../src/net/joinCode';

const live = new Set<string>();

/** A fresh code for a new room, held until `releaseJoinCode`. */
export function reserveJoinCode(): string {
  const code = generateJoinCode(
    (n) => randomInt(n),
    (c) => live.has(c),
  );
  live.add(code);
  return code;
}

export function releaseJoinCode(code: string): void {
  live.delete(code);
}

export function isLiveJoinCode(code: string): boolean {
  return live.has(code);
}
