/**
 * The join codes of the rooms alive in this server process, so a new room
 * never gets the code of one still running. Each process is one shard and
 * holds only its own rooms; its codes start with one of its shard's letters
 * (`shardOfJoinCode`), so codes never clash across shards and a module-level
 * set is enough.
 */

import { randomInt } from 'node:crypto';
import { type Shard, generateJoinCode } from '../src/net/joinCode';

const live = new Set<string>();

/** A fresh code of this `shard` for a new room, held until `releaseJoinCode`. */
export function reserveJoinCode(shard: Shard = { index: 0, count: 1 }): string {
  const code = generateJoinCode(
    (n) => randomInt(n),
    (c) => live.has(c),
    shard,
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
