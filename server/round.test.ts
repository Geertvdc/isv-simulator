/**
 * A whole online round over real WebSockets: a server on a free port with
 * short rounds, and two browsers' network code (`src/net/client.ts`, the
 * clock sync and input stamping) playing Garage together, from the lobby to
 * the results and the profiles.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { DevicePress } from '../src/input/controller';
import { type NetConnection, helloFor, hostRoom, joinRoomByCode } from '../src/net/client';
import { addPong, createClockSync, inputTargetTick } from '../src/net/clock';
import { createInputStamper, stampInputs } from '../src/net/inputStamp';
import type { ServerMessage, SnapshotMessage } from '../src/net/protocol';
import type { Vec } from '../src/sim/state';
import { type RunningServer, startGameServer } from './app';
import { MemoryProfileStore } from './profileStore';

const ROUND_SECONDS = 3;
const ADA = { userId: '0b6d3c7a-1f2e-4d5c-9b8a-7f6e5d4c3b2a', displayName: 'Ada' };
const GRACE = { userId: '1b6d3c7a-1f2e-4d5c-9b8a-7f6e5d4c3b2a', displayName: 'Grace' };

let server: RunningServer;
let store: MemoryProfileStore;
let url: string;

beforeAll(async () => {
  store = new MemoryProfileStore();
  server = await startGameServer(0, { store, roundSeconds: ROUND_SECONDS });
  url = `http://localhost:${server.port}`;
});

afterAll(async () => {
  await server.close();
});

/** One browser: its connection, everything it got, its clock and a way to walk. */
function browser(connection: NetConnection) {
  const received: ServerMessage[] = [];
  const waiters = new Set<() => void>();
  const clock = createClockSync();
  const stamper = createInputStamper();
  let pings = 0;
  connection.onMessage((m) => {
    received.push(m);
    if (m.type === 'pong') addPong(clock, m, performance.now());
    for (const w of [...waiters]) w();
  });
  const ping = (): void => {
    connection.send({ type: 'ping', id: pings++, clientTimeMs: performance.now() });
  };
  const pinger = setInterval(ping, 100);
  ping();
  let walker: ReturnType<typeof setInterval> | null = null;

  return {
    connection,
    received,
    waitFor<T extends ServerMessage['type']>(
      type: T,
      match: (m: Extract<ServerMessage, { type: T }>) => boolean = () => true,
      timeoutMs = 5000,
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
          reject(new Error(`no matching ${type} within ${timeoutMs} ms`));
        }, timeoutMs);
        waiters.add(check);
        check();
      });
    },
    menu(buttons: Partial<DevicePress>): void {
      connection.send({
        type: 'menu',
        presses: [
          {
            deviceId: 'kb-left',
            joinGroup: 'keyboard',
            join: false,
            interact: false,
            dash: false,
            menu: false,
            nav: { x: 0, y: 0 },
            ...buttons,
          },
        ],
      });
    },
    /** Sends this player's input every frame (60 Hz), stamped like the game does. */
    walk(playerId: number, move: Vec): void {
      walker = setInterval(() => {
        const target = inputTargetTick(clock, performance.now());
        if (target === null) return;
        const inputs = stampInputs(
          stamper,
          [{ playerId, tick: 0, move, interact: false, work: false, dash: false }],
          target,
        );
        if (inputs.length > 0) connection.send({ type: 'inputs', inputs });
      }, 1000 / 60);
    },
    async close(): Promise<void> {
      clearInterval(pinger);
      if (walker) clearInterval(walker);
      await connection.leave();
    },
  };
}

function playerPos(m: SnapshotMessage, id: number): Vec | undefined {
  return m.game?.state.players.find((p) => p.id === id)?.pos;
}

describe('an online round', () => {
  it('plays from the lobby to the results with two browsers, and records it for both', async () => {
    const ada = browser(await hostRoom(url, helloFor(ADA)));
    const { joinCode } = await ada.waitFor('welcome');
    const grace = browser(await joinRoomByCode(url, joinCode, helloFor(GRACE)));
    try {
      await ada.waitFor('lobby', (m) => m.members.length === 2);

      // Each machine joins its keyboard player; the host starts and picks Garage.
      ada.menu({ join: true });
      await ada.waitFor('snapshot', (m) => m.flow.lobby.players.length === 1);
      grace.menu({ join: true });
      await grace.waitFor('snapshot', (m) => m.flow.lobby.players.length === 2);
      ada.menu({ interact: true });
      await ada.waitFor('snapshot', (m) => m.flow.screen === 'levelSelect');
      ada.menu({ interact: true });
      const [startA, startG] = await Promise.all([
        ada.waitFor('roundStart'),
        grace.waitFor('roundStart'),
      ]);
      expect(startA.levelId).toBe('garage');
      expect(startG.level).toEqual(startA.level);
      const startPos = (id: number): Vec => {
        const pos = startA.snapshot.state.players.find((p) => p.id === id)?.pos;
        if (!pos) throw new Error(`no player ${id}`);
        return pos;
      };
      const from1 = startPos(1);
      const from2 = startPos(2);
      ada.menu({ interact: true });
      grace.menu({ interact: true }); // both owned slots confirm before countdown

      // Ada walks up the screen, Grace down; each machine only sends its own player.
      ada.walk(1, { x: 0, y: -1 });
      grace.walk(2, { x: 0, y: 1 });
      const moved = (m: SnapshotMessage): boolean => {
        const p1 = playerPos(m, 1);
        const p2 = playerPos(m, 2);
        return (
          m.flow.screen === 'playing' &&
          p1 !== undefined &&
          p2 !== undefined &&
          (p1.x !== from1.x || p1.y !== from1.y) &&
          (p2.x !== from2.x || p2.y !== from2.y)
        );
      };
      const [seenA, seenG] = await Promise.all([
        ada.waitFor('snapshot', moved, 8000),
        grace.waitFor('snapshot', moved, 8000),
      ]);
      expect(seenA.game?.state.tick).toBeGreaterThan(0);
      expect(seenG.game?.state.tick).toBeGreaterThan(0);

      // Both screens see the same round: same snapshot for the same server tick.
      const tick = Math.max(seenA.serverTick, seenG.serverTick);
      const [sameA, sameG] = await Promise.all([
        ada.waitFor('snapshot', (m) => m.serverTick === tick),
        grace.waitFor('snapshot', (m) => m.serverTick === tick),
      ]);
      expect(sameG.game).toEqual(sameA.game);

      // The round runs out: both get the results with stars.
      const [endA, endG] = await Promise.all([
        ada.waitFor('snapshot', (m) => m.flow.screen === 'results', ROUND_SECONDS * 1000 + 3000),
        grace.waitFor('snapshot', (m) => m.flow.screen === 'results', ROUND_SECONDS * 1000 + 3000),
      ]);
      expect(endA.flow.results).toEqual(endG.flow.results);
      expect(endA.flow.results?.stars).toBeGreaterThanOrEqual(0);
      expect(endA.game?.state.result).toEqual({
        score: endA.flow.results?.score,
        stars: endA.flow.results?.stars,
      });

      // Every member's profile has the round.
      await expect
        .poll(async () => (await store.get(GRACE.userId))?.levels.garage?.plays, { timeout: 2000 })
        .toBe(1);
      expect((await store.get(ADA.userId))?.levels.garage).toMatchObject({
        plays: 1,
        bestScore: endA.flow.results?.score,
      });
      // And the host's unlocks went out with them.
      await ada.waitFor('lobby', (m) => m.levels.garage?.plays === 1);
    } finally {
      await Promise.all([ada.close(), grace.close()]);
    }
  }, 20_000);
});
