/**
 * Resilience against a real server, with `@colyseus/sdk` clients whose
 * connections are cut without a goodbye: each client talks to the server
 * through its own little TCP proxy, and `cut()` destroys the proxy's
 * sockets, like a wifi drop. Covers reconnecting within and after the grace
 * period, the reload path (a fresh client with the stored token), host
 * moves, floods, room cleanup and shutdown.
 */

import { type Server, type Socket, connect, createServer } from 'node:net';
import type { AddressInfo } from 'node:net';
import { Client, type Room } from '@colyseus/sdk';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { DevicePress } from '../src/input/controller';
import {
  type ClientMessage,
  type HelloMessage,
  PROTOCOL_VERSION,
  type ServerMessage,
} from '../src/net/protocol';
import { NET_MESSAGE_BURST } from '../src/sim/balance';
import { type RunningServer, startGameServer } from './app';
import { GAME_ROOM } from './GameRoom';
import { MemoryProfileStore } from './profileStore';

/** Short, so the "too late" tests don't wait 20 s; long enough for a reconnect on a busy CI box. */
const GRACE_MS = 1500;

let server: RunningServer;
let baseUrl: string;
const open: Room[] = [];
const proxies: Proxy[] = [];

/** A TCP proxy to a server port whose live connections can be cut at once. */
interface Proxy {
  url: string;
  cut(): void;
  close(): void;
}

async function proxyTo(port: number): Promise<Proxy> {
  const sockets = new Set<Socket>();
  const track = (socket: Socket): void => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    socket.on('error', () => undefined);
  };
  const proxy: Server = createServer((inbound) => {
    const outbound = connect(port, '127.0.0.1');
    track(inbound);
    track(outbound);
    inbound.pipe(outbound);
    outbound.pipe(inbound);
  });
  await new Promise<void>((resolve) => proxy.listen(0, '127.0.0.1', resolve));
  const cut = (): void => {
    for (const socket of sockets) socket.destroy();
  };
  const result: Proxy = {
    url: `http://127.0.0.1:${(proxy.address() as AddressInfo).port}`,
    cut,
    close: () => {
      cut();
      proxy.close();
    },
  };
  proxies.push(result);
  return result;
}

beforeAll(async () => {
  server = await startGameServer(0, {
    store: new MemoryProfileStore(),
    reconnectGraceMs: GRACE_MS,
  });
  baseUrl = `http://localhost:${server.port}`;
});

/** Leaves, unless the room already closed (the SDK's `leave` would wait for a close that came). */
async function leaveQuietly(room: Room): Promise<void> {
  if (!room.connection.isOpen) return;
  await Promise.race([room.leave().catch(() => 0), new Promise((r) => setTimeout(r, 1000))]);
}

afterEach(async () => {
  await Promise.all(open.splice(0).map(leaveQuietly));
  for (const proxy of proxies.splice(0)) proxy.close();
});

afterAll(async () => {
  await server.close();
});

interface Connection {
  room: Room;
  received: ServerMessage[];
  send(message: ClientMessage): void;
  waitFor<T extends ServerMessage['type']>(
    type: T,
    match?: (m: Extract<ServerMessage, { type: T }>) => boolean,
    after?: number,
  ): Promise<Extract<ServerMessage, { type: T }>>;
  /** Cuts the socket without a goodbye. */
  cut(): void;
}

function hello(name: string): HelloMessage {
  return {
    type: 'hello',
    protocol: PROTOCOL_VERSION,
    userId: `user-${name}`,
    displayName: name,
    localPlayers: 1,
  };
}

function connection(room: Room, proxy: Proxy, autoReconnect: boolean): Connection {
  open.push(room);
  // The SDK waits 5 s after joining before it reconnects on its own; the browser sets 0 too.
  room.reconnection.minUptime = 0;
  room.reconnection.enabled = autoReconnect;
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
    waitFor: (type, match = () => true, after = 0) =>
      new Promise((resolve, reject) => {
        type Wanted = Extract<ServerMessage, { type: typeof type }>;
        const check = (): void => {
          const found = received
            .slice(after)
            .find((m): m is Wanted => m.type === type && match(m as Wanted));
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
    cut: () => {
      proxy.cut();
    },
  };
}

/** A client of the server on `port` through its own proxy. */
async function client(port = server.port): Promise<{ client: Client; proxy: Proxy }> {
  const proxy = await proxyTo(port);
  return { client: new Client(proxy.url), proxy };
}

async function host(name = 'Ada', autoReconnect = true, port?: number): Promise<Connection> {
  const c = await client(port);
  return connection(await c.client.create(GAME_ROOM, hello(name)), c.proxy, autoReconnect);
}

async function joinByCode(
  code: string,
  name = 'Grace',
  autoReconnect = true,
  port?: number,
): Promise<Connection> {
  const c = await client(port);
  return connection(await c.client.joinById(code, hello(name)), c.proxy, autoReconnect);
}

/** A reloaded page: a fresh client that comes back with the stored token. */
async function rejoin(token: string): Promise<Connection> {
  const c = await client();
  return connection(await c.client.reconnect(token), c.proxy, false);
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

/** Host and guest, each with a player, in a running round of the first level. */
async function roundWithTwo(
  guestReconnects = true,
): Promise<{ a: Connection; b: Connection; code: string }> {
  const a = await host();
  const { joinCode } = await a.waitFor('welcome');
  const b = await joinByCode(joinCode, 'Grace', guestReconnects);
  await b.waitFor('welcome');
  a.send({ type: 'menu', presses: [press({ join: true })] });
  await a.waitFor('snapshot', (m) => m.flow.lobby.players.length === 1);
  b.send({ type: 'menu', presses: [press({ join: true })] });
  await a.waitFor('snapshot', (m) => m.flow.lobby.players.length === 2);
  a.send({ type: 'menu', presses: [press({ interact: true })] });
  await a.waitFor('snapshot', (m) => m.flow.screen === 'levelSelect');
  a.send({ type: 'menu', presses: [press({ interact: true })] });
  await b.waitFor('roundStart');
  a.send({ type: 'menu', presses: [press({ interact: true })] });
  b.send({ type: 'menu', presses: [press({ interact: true })] });
  await b.waitFor('snapshot', (m) => m.flow.screen === 'playing');
  return { a, b, code: joinCode };
}

describe('reconnecting', () => {
  it('puts a dropped member back in the round within the grace period', async () => {
    const { a, b } = await roundWithTwo();
    const sessionId = b.room.sessionId;
    const roundId = (await b.waitFor('roundStart')).roundId;
    const seen = b.received.length;
    const dropped = new Promise<void>((resolve) => {
      b.room.onDrop.once(() => {
        resolve();
      });
    });
    const back = new Promise<void>((resolve) => {
      b.room.onReconnect.once(() => {
        resolve();
      });
    });
    b.cut();
    await dropped;
    // The others see them reconnecting, their player stays.
    const away = await a.waitFor('lobby', (m) => m.members[1]?.connected === false);
    expect(away.members.map((m) => m.displayName)).toEqual(['Ada', 'Grace']);
    await back;
    expect(b.room.sessionId).toBe(sessionId);
    await a.waitFor('lobby', (m) => m.members[1]?.connected === true);
    // The welcome again (with the protocol), the room, and the same round.
    const welcome = await b.waitFor('welcome', () => true, seen);
    expect(welcome.protocol).toBe(PROTOCOL_VERSION);
    const again = await b.waitFor('roundStart', () => true, seen);
    expect(again).toMatchObject({ roundId, counted: true });
    const snapshot = await b.waitFor('snapshot', (m) => m.flow.screen === 'playing', seen);
    expect(snapshot.flow.lobby.players.map((p) => p.deviceId)).toContain(`${sessionId}:kb-left`);
  });

  it('removes them after the grace period; the token no longer works', async () => {
    const { a, b } = await roundWithTwo(false);
    const token = b.room.reconnectionToken;
    const seen = a.received.length;
    b.cut();
    await a.waitFor('lobby', (m) => m.members[1]?.connected === false, seen);
    // Not before the grace period is over.
    await new Promise((resolve) => setTimeout(resolve, GRACE_MS / 2));
    expect(a.received.slice(seen).some((m) => m.type === 'lobby' && m.members.length === 1)).toBe(
      false,
    );
    const gone = await a.waitFor('lobby', (m) => m.members.length === 1, seen);
    expect(gone.members[0]).toMatchObject({ displayName: 'Ada', isHost: true });
    await expect(new Client(baseUrl).reconnect(token)).rejects.toThrow();
  });

  it('lets a fresh client back in with the stored token (a reloaded page)', async () => {
    const { a, b } = await roundWithTwo(false);
    const token = b.room.reconnectionToken;
    const sessionId = b.room.sessionId;
    b.cut();
    await a.waitFor('lobby', (m) => m.members[1]?.connected === false);
    const again = await rejoin(token);
    expect(again.room.sessionId).toBe(sessionId);
    await again.waitFor('welcome');
    await again.waitFor('lobby', (m) => m.members.every((member) => member.connected));
    await again.waitFor('roundStart', (m) => m.counted);
    await a.waitFor('lobby', (m) => m.members[1]?.connected === true);
  });

  it('moves the host while the host is away, and back', async () => {
    const a = await host('Ada', false);
    const { joinCode } = await a.waitFor('welcome');
    const b = await joinByCode(joinCode);
    await b.waitFor('lobby', (m) => m.members.length === 2);
    const token = a.room.reconnectionToken;
    a.cut();
    const away = await b.waitFor('lobby', (m) => m.members[0]?.connected === false);
    expect(away.members.map((m) => m.isHost)).toEqual([false, true]);
    const again = await rejoin(token);
    const lobby = await again.waitFor('lobby', (m) => m.members[0]?.connected === true);
    expect(lobby.members.map((m) => m.isHost)).toEqual([true, false]);
  });
});

describe('server hygiene', () => {
  it('drops a flood without kicking the sender', async () => {
    const a = await host();
    await a.waitFor('welcome');
    const before = a.received.length;
    for (let i = 0; i < 300; i++) a.send({ type: 'ping', id: 1000 + i, clientTimeMs: i });
    // The last ping of a later, ordinary one is answered: still in the room.
    await new Promise((resolve) => setTimeout(resolve, 300));
    a.send({ type: 'ping', id: 1, clientTimeMs: 0 });
    await a.waitFor('pong', (m) => m.id === 1, before);
    const pongs = a.received.slice(before).filter((m) => m.type === 'pong' && m.id >= 1000);
    expect(pongs.length).toBeGreaterThanOrEqual(NET_MESSAGE_BURST);
    expect(pongs.length).toBeLessThan(120);
  });

  it('closes the room once its last member did not come back', async () => {
    const a = await host('Ada', false);
    const { joinCode } = await a.waitFor('welcome');
    a.cut();
    // Kept during the grace period...
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect((await fetch(`${baseUrl}/rooms/${joinCode}`)).status).toBe(200);
    // ...then closed and its code freed.
    await expect
      .poll(async () => (await fetch(`${baseUrl}/rooms/${joinCode}`)).status, {
        timeout: GRACE_MS + 3000,
        interval: 200,
      })
      .toBe(404);
  });

  it('tells everyone when the server shuts down, without waiting for reconnects', async () => {
    const other = await startGameServer(0, {
      store: new MemoryProfileStore(),
      reconnectGraceMs: 60_000,
    });
    const a = await host('Ada', false, other.port);
    const { joinCode } = await a.waitFor('welcome');
    const b = await joinByCode(joinCode, 'Grace', false, other.port);
    await b.waitFor('welcome');
    // One member is away (a 60 s grace): shutdown must not wait for them.
    b.cut();
    await a.waitFor('lobby', (m) => m.members[1]?.connected === false);
    const left = new Promise<number>((resolve) => {
      a.room.onLeave.once((code) => {
        resolve(code);
      });
    });
    const started = Date.now();
    await other.close();
    expect(Date.now() - started).toBeLessThan(5000);
    expect(await a.waitFor('closing')).toEqual({ type: 'closing', reason: 'shutdown' });
    expect(await left).toBe(4001);
  });
});
