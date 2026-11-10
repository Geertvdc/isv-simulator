/**
 * The shard pool on a real server: shard 0 of 3 with room for one room.
 * Shard 1 is a plain HTTP server that only counts requests (so we see who
 * gets one), shard 2 is a port nothing listens on. Its own file, so its
 * Colyseus server is the only one in this test process.
 */

import { type Server, createServer } from 'node:http';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  JoinError,
  type NetConnection,
  helloFor,
  hostInPool,
  hostRoom,
  hostRoomOnShards,
  joinInPool,
  rejoinInPool,
} from '../src/net/client';
import { shardOfJoinCode } from '../src/net/joinCode';
import type { PoolView } from '../src/net/pool';
import { type RunningServer, startGameServer } from './app';
import { MemoryPoolStore } from './poolStore';
import { MemoryProfileStore } from './profileStore';

let server: RunningServer;
let frontDoor: string;
let recorder: Server;
let recorderUrl: string;
let downUrl: string;
const recorded: string[] = [];
const pool = new MemoryPoolStore();
const open: NetConnection[] = [];

const ADA = { userId: '0b6d3c7a-1f2e-4d5c-9b8a-7f6e5d4c3b2a', displayName: 'Ada' };
const GRACE = { userId: '1b6d3c7a-1f2e-4d5c-9b8a-7f6e5d4c3b2a', displayName: 'Grace' };

async function listen(s: Server): Promise<number> {
  await new Promise<void>((resolve) => s.listen(0, resolve));
  const address = s.address();
  return typeof address === 'object' && address ? address.port : 0;
}

beforeAll(async () => {
  recorder = createServer((req, res) => {
    recorded.push(`${req.method} ${req.url}`);
    res.statusCode = 404;
    res.end('not a game server');
  });
  recorderUrl = `http://localhost:${await listen(recorder)}`;
  const probe = createServer();
  downUrl = `http://localhost:${await listen(probe)}`;
  await new Promise((resolve) => probe.close(resolve));
  server = await startGameServer(0, {
    store: new MemoryProfileStore(),
    shard: { index: 0, count: 3 },
    maxRooms: 1,
    pool: {
      store: pool,
      // Shard 0 is the front door; the browser never uses its pool URL.
      urls: ['https://shard0.example', recorderUrl, downUrl],
      // The tests change other shards' entries and look at /pool right away.
      cacheMs: 0,
      // The manager's wake-ups go nowhere here.
      fetch: () => Promise.reject(new Error('not in this test')),
    },
    limits: { roomCreate: { burst: 100, refillMs: 1000 } },
  });
  frontDoor = `http://localhost:${server.port}`;
});

afterEach(async () => {
  await Promise.all(open.splice(0).map((c) => c.leave()));
  recorded.length = 0;
  await waitForPool((p) => p.host === 0);
});

afterAll(async () => {
  await server.close();
  await new Promise((resolve) => recorder.close(resolve));
});

async function getPool(): Promise<PoolView> {
  const res = await fetch(`${frontDoor}/pool`);
  expect(res.status).toBe(200);
  return (await res.json()) as PoolView;
}

/** Polls `/pool` until it matches (a room's end reaches the count a moment after leaving). */
async function waitForPool(match: (p: PoolView) => boolean): Promise<PoolView> {
  for (let i = 0; i < 100; i++) {
    const p = await getPool();
    if (match(p)) return p;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error('the pool never got there');
}

async function joinError(promise: Promise<unknown>): Promise<JoinError> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(JoinError);
    return error as JoinError;
  }
  throw new Error('the join worked');
}

/** Marks shard `index` awake with no rooms, as its heartbeat would. */
async function wake(index: number): Promise<void> {
  await pool.put({
    index,
    url: index === 1 ? recorderUrl : downUrl,
    rooms: 0,
    players: 0,
    maxRooms: 1,
    updatedAt: Date.now(),
  });
}

/** A code of shard `index` (of 3) that no room has. */
const codeOf = (index: number): string => ['AAAA', 'BBBB', 'CCCC'][index] ?? '';

describe('GET /pool', () => {
  it('lists every shard, which are awake, and packs rooms onto the lowest awake one', async () => {
    expect(await getPool()).toEqual({
      urls: ['https://shard0.example', recorderUrl, downUrl],
      awake: [true, false, false],
      host: 0,
    });
    expect(await (await fetch(`${frontDoor}/health`)).text()).toBe('ok');
    expect(await (await fetch(`${frontDoor}/shard`)).json()).toEqual({ shard: 0, shards: 3 });
  });

  it('has written its own heartbeat to the pool store at start-up', async () => {
    const own = (await pool.list()).find((e) => e.index === 0);
    expect(own).toMatchObject({ index: 0, url: 'https://shard0.example', maxRooms: 1 });
    expect(Date.now() - (own?.updatedAt ?? 0)).toBeLessThan(60_000);
  });
});

describe('the room limit', () => {
  it('refuses a room past SHARD_MAX_ROOMS with serverFull, and the pool moves on', async () => {
    open.push(await hostRoom(frontDoor, helloFor(ADA)));
    expect((await joinError(hostRoom(frontDoor, helloFor(GRACE)))).code).toBe('serverFull');
    // Shard 0 is full: the lowest sleeping shard gets the next room (a cold start).
    expect(await getPool()).toMatchObject({ awake: [true, false, false], host: 1 });
    await wake(1);
    await wake(2);
    for (const e of await pool.list()) if (e.index > 0) await pool.put({ ...e, rooms: 1 });
    // Everyone awake and full.
    expect((await getPool()).host).toBe(-1);
    await pool.put({ index: 1, url: recorderUrl, rooms: 0, players: 0, maxRooms: 1, updatedAt: 0 });
    await pool.put({ index: 2, url: downUrl, rooms: 0, players: 0, maxRooms: 1, updatedAt: 0 });
  });
});

describe('hosting in the pool', () => {
  it("hosts on the pool's pick", async () => {
    const host = await hostInPool(frontDoor, helloFor(ADA));
    open.push(host);
    expect(shardOfJoinCode(host.joinCode, 3)).toBe(0);
    expect(recorded).toEqual([]);
  });

  it('tries the other shards when the pick is unreachable or full, then says serverFull', async () => {
    open.push(await hostRoom(frontDoor, helloFor(ADA)));
    // The pick is shard 1 (asleep), which isn't a game server; then 0 (full), then 2 (down).
    const error = await joinError(hostInPool(frontDoor, helloFor(GRACE)));
    expect(error.code).toBe('serverFull');
    expect(recorded.length).toBeGreaterThan(0);
  });

  it('says serverFull without trying when the pool is all full, unreachable without a pool', async () => {
    const full = () =>
      Promise.resolve(Response.json({ urls: ['', 'x'], awake: [true, true], host: -1 }));
    let hosted = 0;
    const hostOn = () => {
      hosted++;
      return Promise.reject(new Error('not asked'));
    };
    expect(
      (await joinError(hostInPool(frontDoor, helloFor(ADA), { fetch: full }, hostOn))).code,
    ).toBe('serverFull');
    expect(hosted).toBe(0);
    expect((await joinError(hostInPool(downUrl, helloFor(ADA)))).code).toBe('unreachable');
  });

  it('falls over to the next shard on serverFull and unreachable, and stops at other refusals', async () => {
    const tried: string[] = [];
    const down = () => Promise.reject(new JoinError('unreachable', 'down'));
    const answers: Record<string, () => Promise<NetConnection>> = {
      full: () => Promise.reject(new JoinError('serverFull', 'serverFull')),
      down,
      old: () => Promise.reject(new JoinError('protocolMismatch', 'protocolMismatch')),
      ok: () => hostRoom(frontDoor, helloFor(ADA)),
    };
    const hostOn = (url: string) => {
      tried.push(url);
      return (answers[url] ?? down)();
    };
    const host = await hostRoomOnShards(['full', 'down', 'ok', 'full'], helloFor(ADA), {}, hostOn);
    open.push(host);
    expect(tried).toEqual(['full', 'down', 'ok']);
    tried.length = 0;
    expect(
      (await joinError(hostRoomOnShards(['down', 'old', 'ok'], helloFor(ADA), {}, hostOn))).code,
    ).toBe('protocolMismatch');
    expect(tried).toEqual(['down', 'old']);
    expect(
      (await joinError(hostRoomOnShards(['down', 'down'], helloFor(ADA), {}, hostOn))).code,
    ).toBe('unreachable');
  });
});

describe('joining in the pool', () => {
  it("joins a code at the shard it names, through the front door's pool", async () => {
    const host = await hostInPool(frontDoor, helloFor(ADA));
    open.push(host);
    const guest = await joinInPool(frontDoor, host.joinCode, helloFor(GRACE));
    open.push(guest);
    expect(guest.joinCode).toBe(host.joinCode);
  });

  it("answers wrongCode for a sleeping shard's code without asking that shard", async () => {
    expect((await joinError(joinInPool(frontDoor, codeOf(1), helloFor(GRACE)))).code).toBe(
      'wrongCode',
    );
    expect((await joinError(rejoinInPool(frontDoor, codeOf(1), 'BBBB:token'))).code).toBe(
      'reconnectFailed',
    );
    expect(recorded).toEqual([]);
    // Awake, it is asked.
    await wake(1);
    await joinError(joinInPool(frontDoor, codeOf(1), helloFor(GRACE)));
    expect(recorded.length).toBeGreaterThan(0);
    await pool.put({ index: 1, url: recorderUrl, rooms: 0, players: 0, maxRooms: 1, updatedAt: 0 });
  });

  it('is unreachable without a pool', async () => {
    expect((await joinError(joinInPool(downUrl, codeOf(0), helloFor(GRACE)))).code).toBe(
      'unreachable',
    );
    expect((await joinError(rejoinInPool(downUrl, codeOf(0), 'AAAA:token'))).code).toBe(
      'unreachable',
    );
  });
});
