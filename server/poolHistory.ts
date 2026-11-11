/**
 * The shard pool's history for the ops dashboard, as pure functions (the
 * time comes in as `now`, ms): what shard 0 writes and how it is read back.
 *
 * - Snapshots: once a minute (`NET_HISTORY_SNAPSHOT_MS`) shard 0 notes every
 *   shard's awake state, rooms, players, connections, CPU, memory and loop
 *   delay, plus the totals (`snapshotOf`). Stored per UTC day.
 * - Events: shard 0 compares each read of the pool with the one before
 *   (`observe`, `deriveEvents`): a shard woke up, fell asleep, restarted or
 *   came back on another version; shard 0 started waking one (the first
 *   request of an episode only); every shard is full, or no longer. Rooms
 *   refused for being full (`refusalDeltas`) are added up per snapshot minute.
 * - Reading: `aggregate` puts a range's snapshots into time buckets (1 min
 *   for `1h`, 5 min for `24h`, 1 h for `7d`), each the maximum of its
 *   snapshots, so a short peak still shows.
 * - Keys: `snap-YYYY-MM-DD` / `event-YYYY-MM-DD` partitions (UTC), so a read
 *   touches only the days it needs and old days are deleted whole.
 */

import { type PoolEntry, entriesByIndex, isAwake, pickHostShard } from '../src/net/pool';
import { NET_HISTORY_RETENTION_DAYS, NET_SHARD_MAX_ROOMS } from '../src/sim/balance';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** One shard in a snapshot. A sleeping shard has zeros. */
export interface ShardPoint {
  index: number;
  awake: boolean;
  rooms: number;
  players: number;
  connections: number;
  cpuPct: number;
  rssMb: number;
  loopDelayP99Ms: number;
}

export interface PoolTotals {
  /** Awake shards. */
  awake: number;
  rooms: number;
  players: number;
  connections: number;
  /** Room slots on the awake shards. */
  capacity: number;
}

/** The pool at one minute. */
export interface PoolSnapshot {
  /** The minute (ms, rounded down). */
  at: number;
  poolSize: number;
  shards: ShardPoint[];
  totals: PoolTotals;
}

export type PoolEventKind =
  | 'woke'
  | 'slept'
  | 'restarted'
  | 'version'
  | 'wakePing'
  | 'refusals'
  | 'allFull'
  | 'capacityBack'
  | 'started';

/** Something that happened in the pool. `shard` -1: the pool as a whole. */
export interface PoolEvent {
  at: number;
  shard: number;
  kind: PoolEventKind;
  detail: string;
}

/** What shard 0 needs to remember of one read of the pool to spot changes in the next. */
export interface Observation {
  at: number;
  shards: {
    index: number;
    awake: boolean;
    /** From the shard's last entry, also while it sleeps; `null` without one (or an older shard). */
    version: string | null;
    startedAt: string | null;
    refusals: number | null;
  }[];
  /** Spares shard 0 is waking (`ShardPool.waking`). */
  waking: number[];
  /** `pickHostShard`: -1 when every shard is awake and full. */
  host: number;
}

export function observe(
  entries: readonly PoolEntry[],
  now: number,
  count: number,
  waking: readonly number[],
): Observation {
  const byIndex = entriesByIndex(entries, count);
  return {
    at: now,
    shards: byIndex.map((e, index) => ({
      index,
      awake: isAwake(e, now),
      version: e?.ops?.version ?? null,
      startedAt: e?.ops?.startedAt || null,
      refusals: e?.ops?.serverFullRefusals ?? null,
    })),
    waking: [...waking].sort((a, b) => a - b),
    host: pickHostShard(entries, now, count),
  };
}

/** The events between two reads of the pool (none for the first read: nothing to compare with). */
export function deriveEvents(prev: Observation | null, next: Observation): PoolEvent[] {
  if (!prev) return [];
  const events: PoolEvent[] = [];
  const at = next.at;
  const add = (shard: number, kind: PoolEventKind, detail: string): void => {
    events.push({ at, shard, kind, detail });
  };
  for (const n of next.shards) {
    const p = prev.shards[n.index];
    if (!p) continue;
    const versionChanged = p.version !== null && n.version !== null && p.version !== n.version;
    if (!p.awake && n.awake) {
      add(n.index, 'woke', n.version ? `woke up (version ${n.version})` : 'woke up');
      if (versionChanged) add(n.index, 'version', `now on ${n.version} (was ${p.version})`);
    } else if (p.awake && !n.awake) {
      add(n.index, 'slept', 'fell asleep (no heartbeat for 90 s, or shut down)');
    } else if (n.awake && p.startedAt !== null && n.startedAt !== null) {
      if (p.startedAt !== n.startedAt) {
        if (versionChanged) add(n.index, 'version', `restarted on ${n.version} (was ${p.version})`);
        else add(n.index, 'restarted', `restarted (version ${n.version ?? '?'})`);
      }
    }
    if (next.waking.includes(n.index) && !prev.waking.includes(n.index)) {
      add(n.index, 'wakePing', 'shard 0 is waking it (free room slots ran low)');
    }
  }
  if (next.host === -1 && prev.host !== -1) {
    add(-1, 'allFull', 'every shard is awake and full: new rooms are refused');
  } else if (prev.host === -1 && next.host !== -1) {
    add(-1, 'capacityBack', 'room for new rooms again');
  }
  return events;
}

/**
 * Rooms each shard refused for being full between two reads, by index. A
 * counter that went down means the shard restarted: its new count is all new.
 */
export function refusalDeltas(prev: Observation | null, next: Observation): number[] {
  return next.shards.map((n) => {
    const before = prev?.shards[n.index]?.refusals ?? null;
    if (n.refusals === null || before === null) return 0;
    return n.refusals >= before ? n.refusals - before : n.refusals;
  });
}

/** The refusal events for one snapshot minute from the summed deltas (none where nothing was refused). */
export function refusalEvents(at: number, deltas: readonly number[]): PoolEvent[] {
  const events: PoolEvent[] = [];
  deltas.forEach((n, shard) => {
    if (n > 0) {
      events.push({
        at,
        shard,
        kind: 'refusals',
        detail: `refused ${n} new room${n === 1 ? '' : 's'} (server full)`,
      });
    }
  });
  return events;
}

/** The pool at `now` (rounded down to the minute) as a snapshot. */
export function snapshotOf(
  entries: readonly PoolEntry[],
  now: number,
  count: number,
): PoolSnapshot {
  const byIndex = entriesByIndex(entries, count);
  const shards = byIndex.map((e, index): ShardPoint => {
    const awake = isAwake(e, now);
    return {
      index,
      awake,
      rooms: awake ? (e?.rooms ?? 0) : 0,
      players: awake ? (e?.players ?? 0) : 0,
      connections: awake ? (e?.ops?.connections ?? 0) : 0,
      cpuPct: awake ? (e?.ops?.cpuPct ?? 0) : 0,
      rssMb: awake ? (e?.ops?.rssMb ?? 0) : 0,
      loopDelayP99Ms: awake ? (e?.ops?.loopDelayP99Ms ?? 0) : 0,
    };
  });
  const totals: PoolTotals = { awake: 0, rooms: 0, players: 0, connections: 0, capacity: 0 };
  shards.forEach((s, i) => {
    if (!s.awake) return;
    totals.awake++;
    totals.rooms += s.rooms;
    totals.players += s.players;
    totals.connections += s.connections;
    totals.capacity += byIndex[i]?.maxRooms ?? NET_SHARD_MAX_ROOMS;
  });
  return { at: Math.floor(now / MINUTE) * MINUTE, poolSize: count, shards, totals };
}

/** `YYYY-MM-DD` of `ms`, UTC. */
export function dayKey(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export const SNAPSHOT_PREFIX = 'snap-';
export const EVENT_PREFIX = 'event-';

/** The day partitions (`<prefix>YYYY-MM-DD`) from `from` to `to`, both included, oldest first. */
export function partitionsBetween(prefix: string, from: number, to: number): string[] {
  const out: string[] = [];
  const start = Math.floor(from / DAY) * DAY;
  for (let day = start; day <= to; day += DAY) out.push(prefix + dayKey(day));
  return out;
}

/**
 * The first partition kept: days before it are deleted. With 14 days kept,
 * on Nov 15 that's `<prefix>2026-11-01`.
 */
export function retentionCutoff(
  prefix: string,
  now: number,
  days = NET_HISTORY_RETENTION_DAYS,
): string {
  return prefix + dayKey(now - days * DAY);
}

export const HISTORY_RANGES = {
  '1h': { ms: HOUR, bucketMs: MINUTE },
  '24h': { ms: DAY, bucketMs: 5 * MINUTE },
  '7d': { ms: 7 * DAY, bucketMs: HOUR },
} as const;

export type HistoryRange = keyof typeof HISTORY_RANGES;

export function parseRange(raw: string | null | undefined): HistoryRange | null {
  return raw === '1h' || raw === '24h' || raw === '7d' ? raw : null;
}

/** One time bucket; the numbers are `null` where no snapshot fell into it (a gap). */
export interface HistoryPoint {
  /** The bucket's start, ms. */
  t: number;
  awake: number | null;
  rooms: number | null;
  players: number | null;
  connections: number | null;
  capacity: number | null;
  /** Highest CPU % per shard index; `null` where that shard slept the whole bucket. */
  cpu: (number | null)[];
}

export interface HistorySeries {
  range: HistoryRange;
  from: number;
  to: number;
  bucketS: number;
  poolSize: number;
  points: HistoryPoint[];
}

/** The time range a history answer covers, ending at `now`. */
export function rangeBounds(range: HistoryRange, now: number): { from: number; to: number } {
  const { ms, bucketMs } = HISTORY_RANGES[range];
  const last = Math.floor(now / bucketMs) * bucketMs;
  return { from: last - ms + bucketMs, to: now };
}

/** `snapshots` (any order) in `range`'s buckets up to `now`: the maximum of each bucket. */
export function aggregate(
  snapshots: readonly PoolSnapshot[],
  range: HistoryRange,
  now: number,
  poolSize: number,
): HistorySeries {
  const { bucketMs } = HISTORY_RANGES[range];
  const { from, to } = rangeBounds(range, now);
  const count = Math.round((Math.floor(now / bucketMs) * bucketMs - from) / bucketMs) + 1;
  const points: HistoryPoint[] = Array.from({ length: count }, (_, i) => ({
    t: from + i * bucketMs,
    awake: null,
    rooms: null,
    players: null,
    connections: null,
    capacity: null,
    cpu: [],
  }));
  let size = poolSize;
  const max = (a: number | null, b: number): number => (a === null ? b : Math.max(a, b));
  for (const snap of snapshots) {
    if (snap.at < from || snap.at > to) continue;
    const point = points[Math.floor((snap.at - from) / bucketMs)];
    if (!point) continue;
    size = Math.max(size, snap.poolSize);
    point.awake = max(point.awake, snap.totals.awake);
    point.rooms = max(point.rooms, snap.totals.rooms);
    point.players = max(point.players, snap.totals.players);
    point.connections = max(point.connections, snap.totals.connections);
    point.capacity = max(point.capacity, snap.totals.capacity);
    for (const s of snap.shards) {
      if (!s.awake) continue;
      while (point.cpu.length <= s.index) point.cpu.push(null);
      point.cpu[s.index] = max(point.cpu[s.index] ?? null, s.cpuPct);
    }
  }
  for (const point of points) {
    while (point.cpu.length < size) point.cpu.push(null);
  }
  return { range, from, to, bucketS: bucketMs / 1000, poolSize: size, points };
}
