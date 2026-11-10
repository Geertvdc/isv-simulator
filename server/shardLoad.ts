/**
 * What this server (shard) holds right now: its open rooms and the players
 * in them, against its room limit (`SHARD_MAX_ROOMS`). `GameRoom` adds
 * itself when created and removes itself when disposed, and refuses to be
 * created (`serverFull`) while the shard is full; the pool heartbeat
 * (`shardPool.ts`) reports the numbers.
 */

import { NET_SHARD_MAX_ROOMS } from '../src/sim/balance';

export class ShardLoad {
  /** Each open room, with how to count its players. */
  private readonly open = new Map<object, () => number>();

  constructor(readonly maxRooms = NET_SHARD_MAX_ROOMS) {}

  get rooms(): number {
    return this.open.size;
  }

  get players(): number {
    let n = 0;
    for (const count of this.open.values()) n += count();
    return n;
  }

  /** No room for another room. */
  isFull(): boolean {
    return this.open.size >= this.maxRooms;
  }

  add(room: object, players: () => number): void {
    this.open.set(room, players);
  }

  remove(room: object): void {
    this.open.delete(room);
  }
}
