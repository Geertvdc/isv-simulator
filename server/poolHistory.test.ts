import { describe, expect, it } from 'vitest';
import type { PoolEntry, ShardOps } from '../src/net/pool';
import { NET_SHARD_AWAKE_MS } from '../src/sim/balance';
import {
  type Observation,
  type PoolSnapshot,
  aggregate,
  dayKey,
  deriveEvents,
  observe,
  parseRange,
  partitionsBetween,
  rangeBounds,
  refusalDeltas,
  refusalEvents,
  retentionCutoff,
  snapshotOf,
} from './poolHistory';

const NOW = Date.UTC(2026, 10, 11, 12, 30, 15);

const ops = (over: Partial<ShardOps> = {}): ShardOps => ({
  version: 'v1',
  startedAt: '2026-11-11T10:00:00.000Z',
  uptimeS: 100,
  cpuPct: 12.5,
  eventLoopUtil: 0.1,
  loopDelayP99Ms: 11,
  rssMb: 90,
  heapUsedMb: 30,
  connections: 3,
  roundsStarted: 4,
  serverFullRefusals: 0,
  roomList: [],
  ...over,
});

const entry = (index: number, over: Partial<PoolEntry> = {}): PoolEntry => ({
  index,
  url: `https://s${index}`,
  rooms: 1,
  players: 2,
  maxRooms: 2,
  updatedAt: NOW - 1000,
  ops: ops(),
  ...over,
});

const asleep = (index: number, over: Partial<PoolEntry> = {}): PoolEntry =>
  entry(index, { updatedAt: NOW - NET_SHARD_AWAKE_MS - 1, ...over });

/** An observation of `entries` at NOW in a pool of 3. */
const obs = (entries: PoolEntry[], waking: number[] = []): Observation =>
  observe(entries, NOW, 3, waking);

describe('deriveEvents', () => {
  it('has nothing to say about the first read', () => {
    expect(deriveEvents(null, obs([entry(0)]))).toEqual([]);
  });

  it('sees shards wake up and fall asleep', () => {
    const before = obs([entry(0), asleep(1), entry(2)]);
    const after = obs([entry(0), entry(1), asleep(2)]);
    const events = deriveEvents(before, after);
    expect(events.map((e) => [e.shard, e.kind])).toEqual([
      [1, 'woke'],
      [2, 'slept'],
    ]);
    expect(events[0]?.detail).toContain('v1');
    expect(events[0]?.at).toBe(NOW);
  });

  it('sees restarts, and new versions on a restart or a wake-up', () => {
    const before = obs([entry(0), entry(1), asleep(2)]);
    const after = obs([
      entry(0, { ops: ops({ startedAt: '2026-11-11T12:29:00.000Z' }) }),
      entry(1, { ops: ops({ startedAt: '2026-11-11T12:29:00.000Z', version: 'v2' }) }),
      entry(2, { ops: ops({ version: 'v2' }) }),
    ]);
    expect(deriveEvents(before, after).map((e) => [e.shard, e.kind])).toEqual([
      [0, 'restarted'],
      [1, 'version'],
      [2, 'woke'],
      [2, 'version'],
    ]);
  });

  it('says nothing about shards without ops (older builds)', () => {
    const before = obs([entry(0, { ops: undefined }), entry(1, { ops: undefined })]);
    const after = obs([entry(0, { ops: undefined }), entry(1, { ops: undefined })]);
    expect(deriveEvents(before, after)).toEqual([]);
  });

  it('logs only the first wake request of an episode', () => {
    const a = obs([entry(0), asleep(1)], []);
    const b = obs([entry(0), asleep(1)], [1]);
    const c = obs([entry(0), asleep(1)], [1]);
    const d = obs([entry(0), asleep(1)], []);
    const e = obs([entry(0), asleep(1)], [1]);
    expect(deriveEvents(a, b).map((x) => x.kind)).toEqual(['wakePing']);
    expect(deriveEvents(b, c)).toEqual([]);
    expect(deriveEvents(c, d)).toEqual([]);
    expect(deriveEvents(d, e).map((x) => x.kind)).toEqual(['wakePing']);
  });

  it('sees the whole pool fill up and free up again', () => {
    const roomy = obs([entry(0), entry(1), entry(2)]);
    const full = obs([entry(0, { rooms: 2 }), entry(1, { rooms: 2 }), entry(2, { rooms: 2 })]);
    expect(full.host).toBe(-1);
    expect(deriveEvents(roomy, full).map((e) => [e.at, e.shard, e.kind])).toEqual([
      [NOW, -1, 'allFull'],
    ]);
    expect(deriveEvents(full, full)).toEqual([]);
    expect(deriveEvents(full, roomy).map((e) => e.kind)).toEqual(['capacityBack']);
  });
});

describe('refusals', () => {
  it('counts what each shard refused between reads, starting over after a restart', () => {
    const r = (n: number) => ops({ serverFullRefusals: n });
    const a = obs([entry(0, { ops: r(2) }), entry(1, { ops: r(5) })]);
    const b = obs([entry(0, { ops: r(4) }), entry(1, { ops: r(1) }), entry(2)]);
    expect(refusalDeltas(null, a)).toEqual([0, 0, 0]);
    expect(refusalDeltas(a, b)).toEqual([2, 1, 0]);
    expect(refusalEvents(NOW, [2, 0, 1])).toEqual([
      { at: NOW, shard: 0, kind: 'refusals', detail: 'refused 2 new rooms (server full)' },
      { at: NOW, shard: 2, kind: 'refusals', detail: 'refused 1 new room (server full)' },
    ]);
  });
});

describe('snapshotOf', () => {
  it('notes every shard (zeros while asleep) and the totals, at the minute', () => {
    const snap = snapshotOf([entry(0, { rooms: 2, players: 5 }), asleep(1)], NOW, 3);
    expect(snap.at).toBe(Date.UTC(2026, 10, 11, 12, 30));
    expect(snap.poolSize).toBe(3);
    expect(snap.shards[0]).toEqual({
      index: 0,
      awake: true,
      rooms: 2,
      players: 5,
      connections: 3,
      cpuPct: 12.5,
      rssMb: 90,
      loopDelayP99Ms: 11,
    });
    expect(snap.shards[1]).toMatchObject({ awake: false, rooms: 0, cpuPct: 0 });
    expect(snap.shards[2]).toMatchObject({ index: 2, awake: false });
    expect(snap.totals).toEqual({ awake: 1, rooms: 2, players: 5, connections: 3, capacity: 2 });
  });
});

describe('keys', () => {
  it('names UTC day partitions and the retention cutoff', () => {
    expect(dayKey(Date.UTC(2026, 10, 11, 23, 59))).toBe('2026-11-11');
    expect(
      partitionsBetween('snap-', Date.UTC(2026, 10, 9, 22), Date.UTC(2026, 10, 11, 1)),
    ).toEqual(['snap-2026-11-09', 'snap-2026-11-10', 'snap-2026-11-11']);
    expect(retentionCutoff('event-', Date.UTC(2026, 10, 15, 3), 14)).toBe('event-2026-11-01');
    expect(parseRange('24h')).toBe('24h');
    expect(parseRange('2h')).toBeNull();
    expect(parseRange(null)).toBeNull();
  });
});

describe('aggregate', () => {
  const snap = (at: number, players: number, cpu: number[], awake = cpu.length): PoolSnapshot => ({
    at,
    poolSize: 3,
    shards: [0, 1, 2].map((index) => ({
      index,
      awake: index < awake,
      rooms: 0,
      players: 0,
      connections: 0,
      cpuPct: cpu[index] ?? 0,
      rssMb: 0,
      loopDelayP99Ms: 0,
    })),
    totals: { awake, rooms: players, players, connections: players, capacity: awake * 2 },
  });
  const MIN = 60_000;

  it('gives the last hour one point a minute, with gaps where nothing was written', () => {
    const now = Date.UTC(2026, 10, 11, 12, 0, 30);
    const series = aggregate(
      [snap(now - 30_000, 4, [10, 20]), snap(now - 30_000 - 2 * MIN, 2, [5])],
      '1h',
      now,
      3,
    );
    expect(series.points).toHaveLength(60);
    expect(series.bucketS).toBe(60);
    const last = series.points.at(-1);
    expect(last).toMatchObject({ t: Date.UTC(2026, 10, 11, 12), players: 4, awake: 2 });
    expect(last?.cpu).toEqual([10, 20, null]);
    expect(series.points.at(-2)?.players).toBeNull();
    expect(series.points.at(-3)).toMatchObject({ players: 2, cpu: [5, null, null] });
    expect(series.from).toBe(rangeBounds('1h', now).from);
  });

  it('downsamples 24 h to the highest per 5 minutes and 7 d to the highest per hour', () => {
    const now = Date.UTC(2026, 10, 11, 12, 7);
    const base = Date.UTC(2026, 10, 11, 12, 0);
    const snaps = [
      snap(base, 3, [10]),
      snap(base + MIN, 9, [40, 5]),
      snap(base + 2 * MIN, 1, [20]),
      snap(base - 2 * 3600_000, 7, [1]),
      snap(now - 8 * 24 * 3600_000, 99, [1]), // out of every range
    ];
    const day = aggregate(snaps, '24h', now, 3);
    expect(day.points).toHaveLength(288);
    expect(day.bucketS).toBe(300);
    expect(day.points.at(-2)).toMatchObject({ players: 9, awake: 2, cpu: [40, 5, null] });
    const week = aggregate(snaps, '7d', now, 3);
    expect(week.points).toHaveLength(168);
    expect(week.points.at(-1)).toMatchObject({ players: 9 });
    expect(week.points.at(-3)).toMatchObject({ players: 7 });
    expect(week.points.every((p) => p.players !== 99)).toBe(true);
  });
});
