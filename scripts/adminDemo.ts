/// <reference types="node" />

/**
 * The ops dashboard with something to show, on one machine (dev only, not
 * in CI): a real server as shard 0 of a pool of 4, with
 *
 * - a few rooms on it, hosted with `@colyseus/sdk` like the browser does;
 * - shard 1 faked in the pool store (a heartbeat every 10 s, with rooms);
 * - shard 2 asleep (an old heartbeat), shard 3 never seen;
 * - seven days of made-up history (snapshots and events) in the memory history.
 *
 *   npx vite-node scripts/adminDemo.ts [port]     then open http://localhost:<port>/admin
 *
 * Stop it with Ctrl+C.
 */

import { randomBytes } from 'node:crypto';
import { Client, type Room } from '@colyseus/sdk';
import type { PoolEntry, ShardOps } from '../src/net/pool';
import { GAME_ROOM, type HelloMessage, PROTOCOL_VERSION } from '../src/net/protocol';
import { startGameServer } from '../server/app';
import { HistoryStore, MemoryHistoryTable } from '../server/historyStore';
import { MemoryPoolStore } from '../server/poolStore';
import type { PoolEvent, PoolSnapshot } from '../server/poolHistory';
import { MemoryProfileStore } from '../server/profileStore';

const port = Number(process.argv[2]) || 2599;
const POOL = 4;
const MAX_ROOMS = 6;
const urls = Array.from({ length: POOL }, (_, i) => `http://localhost:${port + 100 + i}`);
const pool = new MemoryPoolStore();
const shard1Started = Date.now() - 5 * 3600_000;
const history = new HistoryStore(new MemoryHistoryTable());

/** A made-up but plausible week: busy evenings, quiet nights, one restart. */
async function seedHistory(now: number): Promise<void> {
  const MIN = 60_000;
  const events: PoolEvent[] = [];
  let lastAwake = 1;
  for (let at = now - 7 * 24 * 60 * MIN; at < now - MIN; at += MIN) {
    const hour = new Date(at).getUTCHours() + new Date(at).getUTCMinutes() / 60;
    const day = Math.floor(at / (24 * 60 * MIN));
    const busy = Math.max(0, Math.sin(((hour - 9) / 24) * 2 * Math.PI)) * (0.7 + (day % 3) * 0.2);
    const wiggle = Math.sin(at / (7 * MIN)) * 0.08;
    const rooms = Math.round(Math.max(0, busy + wiggle) * 14);
    const awake = rooms > 8 ? 3 : rooms > 3 ? 2 : 1;
    const shards = Array.from({ length: POOL }, (_, index) => {
      const on = index < awake;
      const share = on ? Math.max(0, Math.min(MAX_ROOMS, rooms - index * MAX_ROOMS)) : 0;
      return {
        index,
        awake: on,
        rooms: share,
        players: share * 3,
        connections: share * 2,
        cpuPct: on ? Math.round((4 + share * 6.5 + (index === 0 ? 3 : 0)) * 10) / 10 : 0,
        rssMb: on ? 95 + share * 4 : 0,
        loopDelayP99Ms: on ? 10 + share : 0,
      };
    });
    const snap: PoolSnapshot = {
      at,
      poolSize: POOL,
      shards,
      totals: {
        awake,
        rooms,
        players: rooms * 3,
        connections: rooms * 2,
        capacity: awake * MAX_ROOMS,
      },
    };
    await history.writeSnapshot(snap);
    if (awake > lastAwake) {
      events.push({
        at: at - 40_000,
        shard: awake - 1,
        kind: 'wakePing',
        detail: 'shard 0 is waking it (free room slots ran low)',
      });
      events.push({ at, shard: awake - 1, kind: 'woke', detail: 'woke up (version 4167ebf)' });
    } else if (awake < lastAwake) {
      events.push({
        at,
        shard: lastAwake - 1,
        kind: 'slept',
        detail: 'fell asleep (no heartbeat for 90 s, or shut down)',
      });
    }
    lastAwake = awake;
  }
  events.push({
    at: now - 30 * 3600_000,
    shard: 1,
    kind: 'version',
    detail: 'restarted on 78e593d (was 4167ebf)',
  });
  events.push({
    at: now - 26 * 3600_000,
    shard: -1,
    kind: 'allFull',
    detail: 'every shard is awake and full: new rooms are refused',
  });
  events.push({
    at: now - 26 * 3600_000 + 120_000,
    shard: 2,
    kind: 'refusals',
    detail: 'refused 3 new rooms (server full)',
  });
  events.push({
    at: now - 26 * 3600_000 + 240_000,
    shard: -1,
    kind: 'capacityBack',
    detail: 'room for new rooms again',
  });
  await history.writeEvents(events);
}

function fakeShard1(now: number): PoolEntry {
  const ops: ShardOps = {
    version: '78e593d',
    startedAt: new Date(shard1Started).toISOString(),
    uptimeS: Math.floor((now - shard1Started) / 1000),
    cpuPct: 31.4,
    eventLoopUtil: 0.27,
    loopDelayP99Ms: 14.2,
    rssMb: 131,
    heapUsedMb: 58,
    connections: 9,
    roundsStarted: 41,
    serverFullRefusals: 0,
    roomList: [
      {
        code: 'KM••',
        members: 3,
        players: 4,
        screen: 'playing',
        levelId: 'level-07-pipeline',
        ageS: 1260,
        idleS: 0,
      },
      {
        code: 'KT••',
        members: 2,
        players: 3,
        screen: 'results',
        levelId: 'level-03-hotfix',
        ageS: 640,
        idleS: 12,
      },
      {
        code: 'KB••',
        members: 1,
        players: 2,
        screen: 'levelSelect',
        levelId: null,
        ageS: 95,
        idleS: 31,
      },
    ],
  };
  return {
    index: 1,
    url: urls[1] ?? '',
    rooms: 3,
    players: 9,
    maxRooms: MAX_ROOMS,
    updatedAt: now - 7000,
    ops,
  };
}

const now = Date.now();
await seedHistory(now);
const shard1 = fakeShard1(now);
await pool.put(shard1);
await pool.put({
  index: 2,
  url: urls[2] ?? '',
  rooms: 0,
  players: 0,
  maxRooms: MAX_ROOMS,
  updatedAt: now - 40 * 60_000,
  ops: shard1.ops && { ...shard1.ops, version: '4167ebf', roomList: [], connections: 0 },
});
setInterval(() => void pool.put(fakeShard1(Date.now())), 10_000).unref();

const server = await startGameServer(port, {
  store: new MemoryProfileStore(),
  shard: { index: 0, count: POOL },
  maxRooms: MAX_ROOMS,
  version: '78e593d',
  pool: { store: pool, urls, fetch: () => Promise.reject(new Error('demo: no other shards')) },
  history,
});
const base = `http://localhost:${server.port}`;

const rooms: Room[] = [];
for (const players of [2, 4, 1, 3]) {
  const hello: HelloMessage = {
    type: 'hello',
    protocol: PROTOCOL_VERSION,
    userId: `demo-${randomBytes(4).toString('hex')}`,
    displayName: 'Demo',
    localPlayers: players,
  };
  const room = await new Client(base).create(GAME_ROOM, hello);
  room.onMessage('*', () => undefined);
  rooms.push(room);
}
console.log(
  `Ops dashboard demo: ${base}/admin (${rooms.length} rooms on shard 0). Ctrl+C stops it.`,
);

process.once('SIGINT', () => {
  void Promise.all(rooms.map((r) => r.leave().catch(() => 0)))
    .then(() => server.close())
    .then(() => process.exit(0));
});
process.once('SIGTERM', () => process.exit(0));
