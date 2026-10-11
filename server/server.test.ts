/**
 * The real thing: a Colyseus server on a free port and `@colyseus/sdk`
 * clients talking to it over WebSockets, the way the browser will.
 */

import { Client, type Room } from '@colyseus/sdk';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { DevicePress } from '../src/input/controller';
import { normalizeJoinCode } from '../src/net/joinCode';
import {
  type ClientMessage,
  type HelloMessage,
  PROTOCOL_VERSION,
  type ServerMessage,
} from '../src/net/protocol';
import { type RunningServer, startGameServer } from './app';
import { GAME_ROOM } from './GameRoom';

let server: RunningServer;
let baseUrl: string;
const open: Room[] = [];

beforeAll(async () => {
  server = await startGameServer(0);
  baseUrl = `http://localhost:${server.port}`;
});

afterEach(async () => {
  await Promise.all(open.splice(0).map((r) => r.leave().catch(() => 0)));
});

afterAll(async () => {
  await server.close();
});

/** A connected client and everything the server sent it. */
interface Connection {
  room: Room;
  received: ServerMessage[];
  send(message: ClientMessage): void;
  /** Resolves with the first message (already received or still to come) that matches. */
  waitFor<T extends ServerMessage['type']>(
    type: T,
    match?: (m: Extract<ServerMessage, { type: T }>) => boolean,
  ): Promise<Extract<ServerMessage, { type: T }>>;
}

function hello(name: string, localPlayers = 1): HelloMessage {
  return {
    type: 'hello',
    protocol: PROTOCOL_VERSION,
    userId: `user-${name}`,
    displayName: name,
    localPlayers,
  };
}

function wrap(room: Room): Connection {
  open.push(room);
  const received: ServerMessage[] = [];
  const waiters = new Set<() => void>();
  room.onMessage('*', (_type, payload: ServerMessage) => {
    received.push(payload);
    for (const w of [...waiters]) w();
  });
  return {
    room,
    received,
    send: (message) => {
      room.send(message.type, message);
    },
    waitFor: (type, match = () => true) =>
      new Promise((resolve, reject) => {
        type Wanted = Extract<ServerMessage, { type: typeof type }>;
        const check = (): void => {
          const found = received.find((m): m is Wanted => m.type === type && match(m as Wanted));
          if (!found) return;
          waiters.delete(check);
          clearTimeout(timer);
          resolve(found);
        };
        const timer = setTimeout(() => {
          waiters.delete(check);
          reject(new Error(`no ${type} message within 5 s`));
        }, 5000);
        waiters.add(check);
        check();
      }),
  };
}

async function host(name = 'Ada', localPlayers = 1): Promise<Connection> {
  return wrap(await new Client(baseUrl).create(GAME_ROOM, hello(name, localPlayers)));
}

async function joinByCode(code: string, name = 'Grace', localPlayers = 1): Promise<Connection> {
  return wrap(await new Client(baseUrl).joinById(code, hello(name, localPlayers)));
}

/** Leaves on purpose (and not again after the test). */
async function leave(c: Connection): Promise<void> {
  open.splice(open.indexOf(c.room), 1);
  await c.room.leave();
}

function press(buttons: Partial<DevicePress>): DevicePress {
  return {
    deviceId: 'kb-left',
    joinGroup: 'kb',
    join: false,
    interact: false,
    dash: false,
    menu: false,
    nav: { x: 0, y: 0 },
    ...buttons,
  };
}

describe('game server', () => {
  it('answers the health check', async () => {
    const res = await fetch(`${baseUrl}/health`);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('ok');
  });

  it('creates a room with a join code and welcomes its host', async () => {
    const a = await host();
    const welcome = await a.waitFor('welcome');
    expect(welcome.joinCode).toMatch(/^[A-HJ-NP-Z]{4}$/);
    expect(a.room.roomId).toBe(welcome.joinCode);
    expect(welcome.sessionId).toBe(a.room.sessionId);
    expect(welcome.ticksPerSecond).toBe(60);
    const lobby = await a.waitFor('lobby');
    expect(lobby.members).toEqual([
      {
        sessionId: a.room.sessionId,
        displayName: 'Ada',
        localPlayers: 1,
        isHost: true,
        connected: true,
      },
    ]);
  });

  it('lets others join by code, typed in any case', async () => {
    const a = await host();
    const { joinCode } = await a.waitFor('welcome');
    const typed = ` ${joinCode.toLowerCase()} `;

    const lookup = await fetch(`${baseUrl}/rooms/${encodeURIComponent(typed)}`);
    expect(await lookup.json()).toEqual({ joinCode });

    const b = await joinByCode(normalizeJoinCode(typed) ?? '');
    const lobby = await b.waitFor('lobby');
    expect(lobby.members.map((m) => [m.displayName, m.isHost])).toEqual([
      ['Ada', true],
      ['Grace', false],
    ]);
    await a.waitFor('lobby', (m) => m.members.length === 2);
  });

  it('refuses a wrong code', async () => {
    expect((await fetch(`${baseUrl}/rooms/ZZZZ`)).status).toBe(404);
    expect((await fetch(`${baseUrl}/rooms/nope!`)).status).toBe(404);
    await expect(new Client(baseUrl).joinById('ZZZZ', hello('Lost'))).rejects.toThrow();
  });

  it('refuses players that would not fit, and other protocol versions', async () => {
    const a = await host('Ada', 3);
    const { joinCode } = await a.waitFor('welcome');
    await expect(joinByCode(joinCode, 'Two', 2)).rejects.toThrow('roomFull');
    await expect(
      new Client(baseUrl).joinById(joinCode, { ...hello('Old'), protocol: 0 }),
    ).rejects.toThrow('protocolMismatch');
    const b = await joinByCode(joinCode, 'One', 1);
    await b.waitFor('welcome');
    await expect(joinByCode(joinCode, 'Five', 1)).rejects.toThrow();
  });

  it('answers pings with the server tick, and keeps ticking', async () => {
    const a = await host();
    a.send({ type: 'ping', id: 1, clientTimeMs: 12.5 });
    const first = await a.waitFor('pong', (m) => m.id === 1);
    expect(first.clientTimeMs).toBe(12.5);
    await a.waitFor('snapshot', (m) => m.serverTick >= first.serverTick + 6);
    a.send({ type: 'ping', id: 2, clientTimeMs: 50 });
    const second = await a.waitFor('pong', (m) => m.id === 2);
    expect(second.serverTick).toBeGreaterThan(first.serverTick);
  });

  it('runs a round: inputs move the player', async () => {
    const a = await host();
    await a.waitFor('welcome');
    // Join, start the lobby, pick the first level, skip its intro card.
    a.send({ type: 'menu', presses: [press({ join: true })] });
    await a.waitFor('snapshot', (m) => m.flow.lobby.players.length === 1);
    a.send({ type: 'menu', presses: [press({ interact: true })] });
    await a.waitFor('snapshot', (m) => m.flow.screen === 'levelSelect');
    a.send({ type: 'menu', presses: [press({ interact: true })] });
    const start = await a.waitFor('roundStart');
    expect(start.levelId).toBe('garage');
    a.send({ type: 'menu', presses: [press({ interact: true })] });
    const playing = await a.waitFor('snapshot', (m) => m.flow.screen === 'playing');
    const startX = playing.game?.state.players[0]?.pos.x ?? 0;

    // Walk right: a batch of inputs stamped for the ticks just ahead, like a client would.
    let serverTick = playing.serverTick;
    const sendWalk = (): void => {
      a.send({
        type: 'inputs',
        inputs: Array.from({ length: 10 }, (_, i) => ({
          playerId: 1,
          tick: serverTick + i,
          move: { x: 1, y: 0 },
          interact: false,
          work: false,
          dash: false,
        })),
      });
    };
    sendWalk();
    const moved = await a.waitFor('snapshot', (m) => {
      serverTick = m.serverTick;
      const x = m.game?.state.players[0]?.pos.x ?? 0;
      if (x <= startX) sendWalk();
      return x > startX;
    });
    expect(moved.game?.state.players[0]?.pos.x).toBeGreaterThan(startX);
  });

  it('moves the host when the host leaves', async () => {
    const a = await host();
    const { joinCode } = await a.waitFor('welcome');
    const b = await joinByCode(joinCode);
    await b.waitFor('lobby', (m) => m.members.length === 2);
    await leave(a);
    const lobby = await b.waitFor('lobby', (m) => m.members.length === 1);
    expect(lobby.members[0]).toMatchObject({ sessionId: b.room.sessionId, isHost: true });
  });

  it('closes the room and frees its code when everyone left', async () => {
    const a = await host();
    const { joinCode } = await a.waitFor('welcome');
    expect((await fetch(`${baseUrl}/rooms/${joinCode}`)).status).toBe(200);
    await leave(a);
    await expect
      .poll(async () => (await fetch(`${baseUrl}/rooms/${joinCode}`)).status, { timeout: 3000 })
      .toBe(404);
  });
});
