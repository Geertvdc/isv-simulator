/**
 * The shard pool: a fixed set of game servers (shards), `SHARD_COUNT` of
 * them, each with its own URL. Shard 0 is always on and is the game's front
 * door; the others sleep (their host scales them to zero) while nobody
 * needs them and wake up on an HTTP request.
 *
 * Every shard writes its load to a shared table (a `PoolEntry`) when it
 * changes and every `NET_SHARD_HEARTBEAT_MS`; a shard is awake while its
 * entry is fresh (`NET_SHARD_AWAKE_MS`). From the entries:
 *
 * - `pickHostShard`: where a new room goes. Rooms are packed onto the
 *   lowest-index shards, so the higher ones empty out and fall asleep.
 * - `shardsToWake`: the spare shards shard 0 keeps awake (or wakes) so a
 *   few free room slots are always ready (`NET_POOL_HEADROOM_ROOMS`).
 * - `poolView`: the answer to `GET /pool`, what the browser reads before
 *   hosting or joining (`parsePoolView`, `fetchPool`, `hostShardOrder`).
 *
 * Pure: the time comes in as `now` (ms), `fetch` as an argument.
 */

import {
  NET_POOL_HEADROOM_ROOMS,
  NET_POOL_TIMEOUT_MS,
  NET_SHARD_AWAKE_MS,
  NET_SHARD_MAX_ROOMS,
} from '../sim/balance';
import type { FetchLike } from './profileApi';

/** One shard's last heartbeat. */
export interface PoolEntry {
  /** The shard's index (`SHARD_INDEX`). */
  index: number;
  /** Its public URL; `''` when it doesn't know it (one local server). */
  url: string;
  /** Rooms open on it. */
  rooms: number;
  /** Players in those rooms. */
  players: number;
  /** Rooms it takes at most (`SHARD_MAX_ROOMS`). */
  maxRooms: number;
  /** When it wrote this (ms since the epoch, its clock); 0 when it shut down. */
  updatedAt: number;
  /** How the shard is doing, for the ops dashboard; missing from shards that don't report it. */
  ops?: ShardOps;
}

/** One open room on a shard, as the ops dashboard lists it. */
export interface RoomSummary {
  /** The join code, masked (`AB••`): the dashboard is public. */
  code: string;
  /** Machines in the room (connected or reconnecting). */
  members: number;
  /** Couch players over all members. */
  players: number;
  /** The room's flow screen (`lobby`, `levelSelect`, `playing`, `results`, ...). */
  screen: string;
  /** The loaded round's level, `null` in the menus. */
  levelId: string | null;
  /** Seconds since the room opened. */
  ageS: number;
  /** Seconds since anyone in it pressed or moved anything. */
  idleS: number;
}

/** A shard's operational numbers, carried by its heartbeat. Plain JSON. */
export interface ShardOps {
  /** The build it runs (`APP_VERSION`, the image tag). */
  version: string;
  /** When this process started (ISO time). */
  startedAt: string;
  uptimeS: number;
  /** Process CPU over the last sample, in % of one core. */
  cpuPct: number;
  /** Share of the last sample the event loop was busy, 0 to 1. */
  eventLoopUtil: number;
  /** 99th percentile event loop delay over the last sample. */
  loopDelayP99Ms: number;
  rssMb: number;
  heapUsedMb: number;
  /** Open client sockets in its rooms. */
  connections: number;
  /** Rounds started since the process started. */
  roundsStarted: number;
  /** Rooms refused for being full (`serverFull`) since the process started. */
  serverFullRefusals: number;
  /** Its open rooms (at most `NET_SHARD_ROOM_LIST_MAX`). */
  roomList: RoomSummary[];
}

/**
 * A heartbeat older than this means the shard sleeps (or is gone). A shard
 * that crashed looks awake until then; the browser just moves on to the
 * next shard when it can't be reached.
 */
export const AWAKE_WINDOW_MS = NET_SHARD_AWAKE_MS;

/** Whether the shard with this entry is awake at `now`: it wrote a heartbeat recently. */
export function isAwake(entry: PoolEntry | undefined, now: number): boolean {
  return entry !== undefined && entry.updatedAt > 0 && now - entry.updatedAt <= AWAKE_WINDOW_MS;
}

/** The entries by shard index, `count` long; a shard without an entry (or a stray index) is `undefined`. */
export function entriesByIndex(
  entries: readonly PoolEntry[],
  count: number,
): (PoolEntry | undefined)[] {
  const out: (PoolEntry | undefined)[] = Array.from({ length: count }, () => undefined);
  for (const entry of entries) {
    if (Number.isInteger(entry.index) && entry.index >= 0 && entry.index < count) {
      out[entry.index] = entry;
    }
  }
  return out;
}

function freeRooms(entry: PoolEntry | undefined): number {
  return entry ? Math.max(0, entry.maxRooms - entry.rooms) : 0;
}

/**
 * Where a new room goes, out of `count` shards: the lowest-index awake shard
 * with space; else the lowest-index sleeping one (the request to host there
 * wakes it: a cold start); -1 when every shard is awake and full.
 */
export function pickHostShard(entries: readonly PoolEntry[], now: number, count: number): number {
  const byIndex = entriesByIndex(entries, count);
  const open = byIndex.findIndex((e) => isAwake(e, now) && freeRooms(e) > 0);
  if (open >= 0) return open;
  return byIndex.findIndex((e) => !isAwake(e, now));
}

/** Free room slots on the awake shards. */
export function poolHeadroom(entries: readonly PoolEntry[], now: number): number {
  let free = 0;
  for (const entry of entries) if (isAwake(entry, now)) free += freeRooms(entry);
  return free;
}

/**
 * The spare shards shard 0 should request (to wake them, or keep them
 * awake) so at least `headroom` room slots are free, lowest index first.
 *
 * Shard 0 stays on by itself, and so does a shard holding rooms (it keeps
 * itself awake while it has games, see `server/shardPool.ts`): their free
 * slots count as they are. When that's not enough, empty shards are added
 * from the lowest index (a sleeping one counts as empty, with its last known
 * `maxRooms`, or `defaultMaxRooms`) until it is. Only those are requested:
 * every other empty shard gets no traffic from us and falls asleep. So a
 * spare that woke up keeps getting requests while it's needed, instead of
 * being dropped the moment its own free slots make the headroom look fine.
 */
export function shardsToWake(
  entries: readonly PoolEntry[],
  now: number,
  count: number,
  headroom = NET_POOL_HEADROOM_ROOMS,
  defaultMaxRooms = NET_SHARD_MAX_ROOMS,
): number[] {
  const byIndex = entriesByIndex(entries, count);
  const staysUp = (e: PoolEntry | undefined, i: number): boolean =>
    i === 0 || (isAwake(e, now) && (e?.rooms ?? 0) > 0);
  let free = 0;
  byIndex.forEach((e, i) => {
    if (staysUp(e, i)) free += freeRooms(e);
  });
  const spares: number[] = [];
  for (let i = 1; i < count && free < headroom; i++) {
    const e = byIndex[i];
    if (staysUp(e, i)) continue;
    spares.push(i);
    free += isAwake(e, now) ? freeRooms(e) : (e?.maxRooms ?? defaultMaxRooms);
  }
  return spares;
}

/** `GET /pool`: every shard's URL and whether it's awake, and where to host a new room. */
export interface PoolView {
  urls: string[];
  awake: boolean[];
  /** The shard to host on (`pickHostShard`), or -1: every shard is full. */
  host: number;
}

/** The `/pool` answer for `count` shards with these URLs (`urls[i]` is shard i's, `''` if unknown). */
export function poolView(
  entries: readonly PoolEntry[],
  now: number,
  urls: readonly string[],
): PoolView {
  const byIndex = entriesByIndex(entries, urls.length);
  return {
    urls: [...urls],
    awake: byIndex.map((e) => isAwake(e, now)),
    host: pickHostShard(entries, now, urls.length),
  };
}

/** A `/pool` answer from the server's JSON, or `null` when it doesn't look like one. */
export function parsePoolView(raw: unknown): PoolView | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const { urls, awake, host } = r;
  if (!Array.isArray(urls) || urls.length === 0) return null;
  if (!urls.every((u): u is string => typeof u === 'string')) return null;
  if (!Array.isArray(awake) || awake.length !== urls.length) return null;
  if (!awake.every((a): a is boolean => typeof a === 'boolean')) return null;
  if (typeof host !== 'number' || !Number.isInteger(host) || host < -1 || host >= urls.length) {
    return null;
  }
  return { urls: urls.map((u) => u.trim().replace(/\/+$/, '')), awake: [...awake], host };
}

/** The pool from the front door (shard 0). Rejects when it can't be had. */
export async function fetchPool(
  frontDoor: string,
  fetchFn: FetchLike,
  timeoutMs = NET_POOL_TIMEOUT_MS,
): Promise<PoolView> {
  const res = await fetchFn(`${frontDoor}/pool`, { signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`pool answered ${res.status}`);
  const pool = parsePoolView(await res.json());
  if (!pool) throw new Error('pool sent something that is not a pool');
  return pool;
}

/**
 * Shard `index`'s URL as the browser uses it: shard 0 is the front door the
 * browser already talks to (the pool may not know its public URL), the
 * others are the pool's. `''` when unknown.
 */
export function poolShardUrl(pool: PoolView, frontDoor: string, index: number): string {
  return index === 0 ? frontDoor : (pool.urls[index] ?? '');
}

/**
 * The shards to try for hosting, in order: the pool's pick, then the other
 * awake shards, then the sleeping ones (each by index). None when the pool
 * says every shard is full.
 */
export function hostShardOrder(pool: PoolView): number[] {
  if (pool.host < 0) return [];
  const rest = pool.urls.map((_, i) => i).filter((i) => i !== pool.host);
  return [pool.host, ...rest.filter((i) => pool.awake[i]), ...rest.filter((i) => !pool.awake[i])];
}
