/**
 * A server started as one shard of several: its join codes name its shard
 * and `GET /shard` says which it is. Its own file, so its Colyseus server
 * is the only one in this test process.
 */

import { Client, type Room } from '@colyseus/sdk';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { shardOfJoinCode } from '../src/net/joinCode';
import { type HelloMessage, PROTOCOL_VERSION } from '../src/net/protocol';
import { type RunningServer, startGameServer } from './app';
import { GAME_ROOM } from './GameRoom';
import { MemoryProfileStore } from './profileStore';

let server: RunningServer;
let baseUrl: string;

beforeAll(async () => {
  server = await startGameServer(0, {
    store: new MemoryProfileStore(),
    shard: { index: 2, count: 3 },
    limits: { roomCreate: { burst: 100, refillMs: 1000 } },
  });
  baseUrl = `http://localhost:${server.port}`;
});

afterAll(async () => {
  await server.close();
});

const hello: HelloMessage = {
  type: 'hello',
  protocol: PROTOCOL_VERSION,
  userId: 'user-ada',
  displayName: 'Ada',
  localPlayers: 1,
};

describe('a sharded game server', () => {
  it('says which shard it is', async () => {
    const res = await fetch(`${baseUrl}/shard`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ shard: 2, shards: 3 });
    expect(await (await fetch(`${baseUrl}/health`)).text()).toBe('ok');
  });

  it('only hands out join codes of its own shard', async () => {
    const rooms: Room[] = [];
    try {
      for (let i = 0; i < 20; i++) {
        rooms.push(await new Client(baseUrl).create(GAME_ROOM, hello));
      }
      for (const room of rooms) {
        expect(room.roomId).toMatch(/^[A-HJ-NP-Z]{4}$/);
        expect(shardOfJoinCode(room.roomId, 3)).toBe(2);
      }
    } finally {
      await Promise.all(rooms.map((r) => r.leave().catch(() => 0)));
    }
  });
});
