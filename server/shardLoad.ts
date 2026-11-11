/**
 * What this server (shard) holds right now: its open rooms and the players
 * in them, against its room limit (`SHARD_MAX_ROOMS`). `GameRoom` adds
 * itself when created and removes itself when disposed, and refuses to be
 * created (`serverFull`) while the shard is full; the pool heartbeat
 * (`shardPool.ts`) reports the numbers.
 *
 * For the ops dashboard it also counts open client sockets, rounds started
 * and `serverFull` refusals, and lists its rooms (`RoomSummary`).
 */

import type { RoomSummary } from '../src/net/pool';
import { NET_SHARD_MAX_ROOMS, NET_SHARD_ROOM_LIST_MAX } from '../src/sim/balance';

/** What the dashboard sees of one room, asked for when a heartbeat is written. */
export interface RoomDetails {
  /** Open client sockets. */
  connections: number;
  summary: RoomSummary;
}

interface OpenRoom {
  players: () => number;
  details?: () => RoomDetails;
}

export class ShardLoad {
  /** Each open room, with how to count its players. */
  private readonly open = new Map<object, OpenRoom>();
  /** Rounds started since the process started. */
  roundsStarted = 0;
  /** Rooms refused because the shard was full, since the process started. */
  serverFullRefusals = 0;

  constructor(readonly maxRooms = NET_SHARD_MAX_ROOMS) {}

  get rooms(): number {
    return this.open.size;
  }

  get players(): number {
    let n = 0;
    for (const room of this.open.values()) n += room.players();
    return n;
  }

  /** Open client sockets over all rooms that report them. */
  get connections(): number {
    let n = 0;
    for (const room of this.open.values()) n += room.details?.().connections ?? 0;
    return n;
  }

  /** The rooms that describe themselves, oldest first, at most `NET_SHARD_ROOM_LIST_MAX`. */
  roomList(max = NET_SHARD_ROOM_LIST_MAX): RoomSummary[] {
    const list: RoomSummary[] = [];
    for (const room of this.open.values()) {
      if (list.length >= max) break;
      const details = room.details?.();
      if (details) list.push(details.summary);
    }
    return list;
  }

  /** No room for another room. */
  isFull(): boolean {
    return this.open.size >= this.maxRooms;
  }

  add(room: object, players: () => number, details?: () => RoomDetails): void {
    this.open.set(room, { players, details });
  }

  remove(room: object): void {
    this.open.delete(room);
  }
}
