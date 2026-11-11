/**
 * The ops dashboard: its view of the pool (pure), and its routes on a real
 * server as shard 0 of 3 with a room open. Its own file, so its Colyseus
 * server is the only one in this test process. (Shard 2's 404s are in
 * `shard.test.ts`.)
 */

import { Client, type Room } from '@colyseus/sdk';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PoolEntry, ShardOps } from '../src/net/pool';
import { type HelloMessage, PROTOCOL_VERSION } from '../src/net/protocol';
import { NET_SHARD_AWAKE_MS } from '../src/sim/balance';
import { ADMIN_CSP, type AdminState, adminState, maskJoinCode } from './admin';
import { type RunningServer, startGameServer } from './app';
import { GAME_ROOM } from './GameRoom';
import { MemoryPoolStore } from './poolStore';
import { MemoryProfileStore } from './profileStore';

const NOW = Date.UTC(2026, 10, 11, 12, 0);

const ops = (over: Partial<ShardOps> = {}): ShardOps => ({
  version: 'v1',
  startedAt: '2026-11-11T10:00:00.000Z',
  uptimeS: 7200,
  cpuPct: 20,
  eventLoopUtil: 0.2,
  loopDelayP99Ms: 12,
  rssMb: 100,
  heapUsedMb: 40,
  connections: 2,
  roundsStarted: 1,
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
  updatedAt: NOW - 5000,
  ops: ops(),
  ...over,
});

describe('adminState', () => {
  it('adds up the awake shards and says where the next room goes', () => {
    const state = adminState({
      entries: [
        entry(0, { rooms: 2, players: 6, updatedAt: NOW }),
        entry(1, { ops: ops({ version: 'v2' }) }),
        entry(2, { updatedAt: NOW - NET_SHARD_AWAKE_MS - 1 }),
      ],
      now: NOW,
      shard: { index: 0, count: 4 },
      urls: ['https://s0', 'https://s1', 'https://s2', 'https://s3'],
      waking: [3],
      headroom: 5,
    });
    expect(state.poolSize).toBe(4);
    expect(state.frontDoor).toBe('https://s0');
    expect(state.totals).toEqual({
      awake: 2,
      poolSize: 4,
      rooms: 3,
      capacity: 4,
      poolCapacity: 2 + 2 + 2 + 15,
      players: 8,
      connections: 4,
    });
    expect(state.headroom).toEqual({ free: 1, target: 5 });
    expect(state.nextHost).toBe(1);
    expect(state.waking).toEqual([3]);
    expect(state.versions).toEqual([
      { version: 'v1', shards: [0] },
      { version: 'v2', shards: [1] },
    ]);
    expect(state.shards.map((s) => [s.index, s.awake, s.known, s.self, s.lastSeenS])).toEqual([
      [0, true, true, true, 0],
      [1, true, true, false, 5],
      [2, false, true, false, 90],
      [3, false, false, false, null],
    ]);
    // Asleep: its old numbers don't count.
    expect(state.shards[2]).toMatchObject({ rooms: 0, players: 0 });
    expect(state.freshness).toMatch(/30 s/);
  });

  it('never shows a full join code, even from a shard that sent one', () => {
    const room = {
      code: 'QWER',
      members: 1,
      players: 1,
      screen: 'lobby',
      levelId: null,
      ageS: 1,
      idleS: 1,
    };
    const state = adminState({
      entries: [entry(0, { ops: ops({ roomList: [room] }) })],
      now: NOW,
      shard: { index: 0, count: 1 },
      urls: [''],
      waking: [],
    });
    expect(state.shards[0]?.ops?.roomList[0]?.code).toBe('QW••');
    expect(JSON.stringify(state)).not.toContain('QWER');
    expect(maskJoinCode('AB••')).toBe('AB••');
  });
});

describe('the dashboard on shard 0', () => {
  let server: RunningServer;
  let base: string;
  let room: Room;

  beforeAll(async () => {
    server = await startGameServer(0, {
      store: new MemoryProfileStore(),
      shard: { index: 0, count: 3 },
      maxRooms: 4,
      version: 'test-sha',
      pool: {
        store: new MemoryPoolStore(),
        urls: ['https://s0.example', 'https://s1.example', 'https://s2.example'],
        cacheMs: 0,
        fetch: () => Promise.reject(new Error('not in this test')),
      },
      allowedOrigins: ['https://game.example'],
    });
    base = `http://localhost:${server.port}`;
    const hello: HelloMessage = {
      type: 'hello',
      protocol: PROTOCOL_VERSION,
      userId: 'not-a-uuid-ada',
      displayName: 'Ada Lovelace',
      localPlayers: 2,
    };
    room = await new Client(base).create(GAME_ROOM, hello);
  });

  afterAll(async () => {
    await room.leave().catch(() => 0);
    await server.close();
  });

  it('serves the page, its script and style without a login, uncached, with a strict CSP', async () => {
    for (const [path, type] of [
      ['/admin', 'text/html'],
      ['/admin/', 'text/html'],
      ['/admin/app.js', 'text/javascript'],
      ['/admin/app.css', 'text/css'],
    ] as const) {
      const res = await fetch(`${base}${path}`, { headers: { origin: 'https://game.example' } });
      expect(res.status, path).toBe(200);
      expect(res.headers.get('content-type')).toContain(type);
      expect(res.headers.get('cache-control')).toBe('no-store');
      expect(res.headers.get('content-security-policy')).toBe(ADMIN_CSP);
      expect(res.headers.get('x-content-type-options')).toBe('nosniff');
      // Same origin only: no CORS.
      expect(res.headers.get('access-control-allow-origin')).toBeNull();
      const body = await res.text();
      if (type === 'text/html') expect(body).toContain('/admin/app.js');
    }
    expect(ADMIN_CSP).toContain("default-src 'none'");
    expect(ADMIN_CSP).not.toContain('unsafe-inline');
  });

  it('answers the pool state with this shard live and the join codes masked', async () => {
    const res = await fetch(`${base}/admin/api/state`);
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const text = await res.text();
    const state = JSON.parse(text) as AdminState;
    expect(state.poolSize).toBe(3);
    expect(state.self).toBe(0);
    expect(state.totals).toMatchObject({ awake: 1, poolSize: 3, rooms: 1, players: 2 });
    const self = state.shards[0];
    expect(self?.ops).toMatchObject({ version: 'test-sha', connections: 1 });
    expect(self?.ops?.roomList).toEqual([
      expect.objectContaining({ code: `${room.roomId.slice(0, 2)}••`, members: 1, players: 2 }),
    ]);
    // Nothing anyone could join with, and nothing about who's playing.
    expect(text).not.toContain(room.roomId);
    expect(text).not.toContain('Ada');
    expect(text).not.toContain('not-a-uuid');
    expect(state.shards.slice(1).map((s) => s.awake)).toEqual([false, false]);
  });

  it('answers the history for each range and refuses other ranges', async () => {
    for (const range of ['1h', '24h', '7d']) {
      const res = await fetch(`${base}/admin/api/history?range=${range}`);
      expect(res.status).toBe(200);
      expect(res.headers.get('cache-control')).toBe('no-store');
      const body = (await res.json()) as { range: string; points: unknown[]; events: unknown[] };
      expect(body.range).toBe(range);
      expect(body.points.length).toBeGreaterThan(0);
    }
    const bad = await fetch(`${base}/admin/api/history?range=1y`);
    expect(bad.status).toBe(400);
    await bad.body?.cancel();
  });

  it('only reads: anything but GET is refused, unknown paths are 404', async () => {
    const post = await fetch(`${base}/admin/api/state`, { method: 'POST' });
    expect(post.status).toBe(405);
    await post.body?.cancel();
    const missing = await fetch(`${base}/admin/nope`);
    expect(missing.status).toBe(404);
    await missing.body?.cancel();
  });
});
