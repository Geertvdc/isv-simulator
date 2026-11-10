/// <reference types="node" />

/**
 * WebSocket smoke test for one game server: a real game session over
 * Colyseus, the way the browser plays, but with no browser.
 *
 *   npx vite-node scripts/smokeOnline.ts <server url>
 *   e.g. npx vite-node scripts/smokeOnline.ts http://localhost:2567
 *
 * It hosts a room with a `hello` built from the real protocol, waits for the
 * `welcome`, keeps the socket open for a few seconds sending `ping`s and
 * expects their `pong`s (frames flow both ways over the open WebSocket, not
 * just the upgrade), then leaves. The user id is not a UUID v4, so the server
 * plays it without a profile (nothing is written to the profile store).
 *
 * Exit 0 when all of that worked, 1 with the reason otherwise (20 s at most).
 * `infra/scripts/deploy.sh` runs it against shard 0 after a deploy: Container
 * Apps Express may not carry WebSockets (see docs/plan/azure-hosting.md).
 */

import { randomBytes } from 'node:crypto';
import { Client, type Room } from '@colyseus/sdk';
import {
  GAME_ROOM,
  type HelloMessage,
  type PingMessage,
  PROTOCOL_VERSION,
  type ServerMessage,
} from '../src/net/protocol';

const OVERALL_TIMEOUT_MS = 20_000;
/** How long the socket stays open after the welcome. */
const HOLD_MS = 5_000;
const PING_EVERY_MS = 1_000;

const url = process.argv[2];
if (!url || !/^https?:\/\//.test(url)) {
  console.error('usage: npx vite-node scripts/smokeOnline.ts <server url (http:// or https://)>');
  process.exit(1);
}

function log(line: string): void {
  console.log(`smoke: ${line}`);
}

function fail(reason: string): never {
  console.error(`smoke: FAILED: ${reason}`);
  process.exit(1);
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

async function run(): Promise<void> {
  const hello: HelloMessage = {
    type: 'hello',
    protocol: PROTOCOL_VERSION,
    // Not a UUID v4: no profile is loaded or written for it.
    userId: `smoke-${randomBytes(6).toString('hex')}`,
    displayName: 'Smoke test',
    localPlayers: 1,
  };

  let welcomed: (() => void) | undefined;
  const welcome = new Promise<void>((resolve) => (welcomed = resolve));
  const pongs = new Set<number>();
  let left = false;

  log(`connecting to ${url} (protocol ${PROTOCOL_VERSION})`);
  let room: Room;
  try {
    room = await new Client(url).create(GAME_ROOM, hello);
  } catch (e) {
    fail(`could not host a room: ${e instanceof Error ? e.message : String(e)}`);
  }
  log(`in room ${room.roomId} (WebSocket open)`);

  room.onMessage('*', (_type: string | number, message: ServerMessage) => {
    if (message.type === 'welcome') {
      if (message.protocol !== PROTOCOL_VERSION) {
        fail(`the server speaks protocol ${message.protocol}, this script ${PROTOCOL_VERSION}`);
      }
      log(`welcome: join code ${message.joinCode}, server tick ${message.serverTick}`);
      welcomed?.();
    } else if (message.type === 'pong') {
      pongs.add(message.id);
    } else if (message.type === 'error') {
      fail(`the server sent an error: ${JSON.stringify(message)}`);
    }
  });
  room.onLeave((code: number) => {
    if (!left) fail(`the connection closed early (code ${code})`);
  });

  await welcome;

  let sent = 0;
  for (let waited = 0; waited < HOLD_MS; waited += PING_EVERY_MS) {
    sent += 1;
    const ping: PingMessage = { type: 'ping', id: sent, clientTimeMs: performance.now() };
    room.send(ping.type, ping);
    await sleep(PING_EVERY_MS);
  }
  if (pongs.size === 0) fail(`no pong for any of the ${sent} pings`);
  log(`${pongs.size} of ${sent} pings answered over ${HOLD_MS / 1000} s`);

  left = true;
  await room.leave();
  log('left the room');
}

const timer = setTimeout(
  () => fail(`no full session within ${OVERALL_TIMEOUT_MS / 1000} s`),
  OVERALL_TIMEOUT_MS,
);
run().then(
  () => {
    clearTimeout(timer);
    log('OK');
    process.exit(0);
  },
  (e: unknown) => fail(e instanceof Error ? e.message : String(e)),
);
