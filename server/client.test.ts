/**
 * The browser's network wrapper (`src/net/client.ts`) against a real game
 * server on a free port, the way the game uses it.
 */

import { createServer } from 'node:net';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  JoinError,
  type NetConnection,
  helloFor,
  hostRoom,
  joinRoomByCode,
  socketUrl,
} from '../src/net/client';
import type { ServerMessage } from '../src/net/protocol';
import { type RunningServer, startGameServer } from './app';
import { MemoryProfileStore } from './profileStore';

let server: RunningServer;
let url: string;
const open: NetConnection[] = [];

beforeAll(async () => {
  server = await startGameServer(0, { store: new MemoryProfileStore() });
  url = `http://localhost:${server.port}`;
});

afterEach(async () => {
  await Promise.all(open.splice(0).map((c) => c.leave()));
});

afterAll(async () => {
  await server.close();
});

const ADA = { userId: '0b6d3c7a-1f2e-4d5c-9b8a-7f6e5d4c3b2a', displayName: 'Ada' };
const GRACE = { userId: '1b6d3c7a-1f2e-4d5c-9b8a-7f6e5d4c3b2a', displayName: 'Grace' };

/** Everything a connection received, and a way to wait for a message. */
function listen(c: NetConnection) {
  open.push(c);
  const received: ServerMessage[] = [];
  const waiters = new Set<() => void>();
  c.onMessage((m) => {
    received.push(m);
    for (const w of [...waiters]) w();
  });
  return {
    received,
    waitFor<T extends ServerMessage['type']>(
      type: T,
      match: (m: Extract<ServerMessage, { type: T }>) => boolean = () => true,
    ): Promise<Extract<ServerMessage, { type: T }>> {
      return new Promise((resolve, reject) => {
        const check = (): void => {
          const found = received.find(
            (m): m is Extract<ServerMessage, { type: T }> =>
              m.type === type && match(m as Extract<ServerMessage, { type: T }>),
          );
          if (!found) return;
          waiters.delete(check);
          clearTimeout(timer);
          resolve(found);
        };
        const timer = setTimeout(() => {
          waiters.delete(check);
          reject(new Error(`no ${type} within 5 s`));
        }, 5000);
        waiters.add(check);
        check();
      });
    },
  };
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

/** A port nothing listens on. */
async function freePort(): Promise<number> {
  const probe = createServer();
  await new Promise<void>((resolve) => probe.listen(0, resolve));
  const address = probe.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  await new Promise((resolve) => probe.close(resolve));
  return port;
}

describe('socketUrl', () => {
  it('turns http into ws and https into wss', () => {
    expect(socketUrl('http://localhost:2567')).toBe('ws://localhost:2567');
    expect(socketUrl('https://isv.example.com')).toBe('wss://isv.example.com');
    expect(socketUrl('ws://localhost:2567')).toBe('ws://localhost:2567');
  });
});

describe('network client', () => {
  it('hosts a room: a code, a welcome and the lobby, even when listening late', async () => {
    const host = await hostRoom(url, helloFor(ADA));
    expect(host.joinCode).toMatch(/^[A-HJ-NP-Z]{4}$/);
    // Messages that came before anyone listened aren't lost.
    await new Promise((r) => setTimeout(r, 100));
    const a = listen(host);
    const welcome = await a.waitFor('welcome');
    expect(welcome).toMatchObject({ sessionId: host.sessionId, joinCode: host.joinCode });
    const lobby = await a.waitFor('lobby');
    expect(lobby.members).toEqual([
      expect.objectContaining({ displayName: 'Ada', isHost: true, localPlayers: 1 }),
    ]);
    expect(lobby.levels).toEqual({});
  });

  it('joins by code; both see both, and menu presses reach the room', async () => {
    const host = await hostRoom(url, helloFor(ADA));
    const a = listen(host);
    const guest = await joinRoomByCode(url, host.joinCode, helloFor(GRACE));
    const b = listen(guest);
    const both = (m: { members: unknown[] }) => m.members.length === 2;
    expect((await a.waitFor('lobby', both)).members.map((m) => m.displayName)).toEqual([
      'Ada',
      'Grace',
    ]);
    await b.waitFor('lobby', both);
    guest.send({
      type: 'menu',
      presses: [
        {
          deviceId: 'kb-left',
          joinGroup: 'keyboard',
          join: true,
          interact: false,
          dash: false,
          menu: false,
          nav: { x: 0, y: 0 },
        },
      ],
    });
    const snapshot = await a.waitFor('snapshot', (m) => m.flow.lobby.players.length === 1);
    expect(snapshot.flow.lobby.players[0]?.deviceId).toBe(`${guest.sessionId}:kb-left`);
  });

  it('says there is no such room', async () => {
    expect((await joinError(joinRoomByCode(url, 'ZZZZ', helloFor(GRACE)))).code).toBe('wrongCode');
  });

  it('says the room is full', async () => {
    const host = await hostRoom(url, helloFor(ADA, 4));
    listen(host);
    expect((await joinError(joinRoomByCode(url, host.joinCode, helloFor(GRACE)))).code).toBe(
      'roomFull',
    );
  });

  it('says the game versions differ', async () => {
    const host = await hostRoom(url, helloFor(ADA));
    listen(host);
    const old = { ...helloFor(GRACE), protocol: 0 };
    expect((await joinError(joinRoomByCode(url, host.joinCode, old))).code).toBe(
      'protocolMismatch',
    );
  });

  it('says the server is unreachable', async () => {
    const nowhere = `http://localhost:${await freePort()}`;
    expect((await joinError(hostRoom(nowhere, helloFor(ADA)))).code).toBe('unreachable');
    expect((await joinError(joinRoomByCode(nowhere, 'ABCD', helloFor(ADA)))).code).toBe(
      'unreachable',
    );
  });

  it('leaves: the others see it, and our status closes without an error', async () => {
    const host = await hostRoom(url, helloFor(ADA));
    const a = listen(host);
    const guest = await joinRoomByCode(url, host.joinCode, helloFor(GRACE));
    const statuses: unknown[] = [];
    guest.onStatus((status, error) => statuses.push([status, error]));
    const two = await a.waitFor('lobby', (m) => m.members.length === 2);
    await guest.leave();
    const after = a.received.indexOf(two);
    await a.waitFor('lobby', (m) => m.members.length === 1 && a.received.indexOf(m) > after);
    expect(statuses).toEqual([['closed', null]]);
    // Leaving twice is harmless.
    await guest.leave();
  });
});
