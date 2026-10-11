/**
 * The game server: Colyseus with the `game` room, plus HTTP routes.
 *
 * - `GET /health`: `ok`, for load balancers and container checks.
 * - `GET /rooms/:code`: whether a room with this join code is open, any case
 *   (`{ joinCode }` with the code as the server knows it, or 404).
 * - `GET` and `PUT /profiles/:userId`: online profiles (`profileRoutes.ts`).
 */

import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  WebSocketTransport,
  createEndpoint,
  createRouter,
  defineRoom,
  defineServer,
} from 'colyseus';
import { normalizeJoinCode } from '../src/net/joinCode';
import { NET_SERVER_DEFAULT_PORT } from '../src/sim/balance';
import { GAME_ROOM, gameRoomWith } from './GameRoom';
import { isLiveJoinCode } from './joinCodes';
import { type ProfileStore, profileStoreFromEnv } from './profileStore';
import { profileEndpoints } from './profileRoutes';

export const DEFAULT_PORT = NET_SERVER_DEFAULT_PORT;

const health = createEndpoint('/health', { method: 'GET' }, () =>
  Promise.resolve(new Response('ok', { status: 200 })),
);

const room = createEndpoint('/rooms/:code', { method: 'GET' }, (ctx) => {
  let typed: string;
  try {
    typed = decodeURIComponent(ctx.params.code);
  } catch {
    typed = '';
  }
  const code = normalizeJoinCode(typed);
  if (!code || !isLiveJoinCode(code)) {
    return Promise.resolve(Response.json({ error: 'no such room' }, { status: 404 }));
  }
  return Promise.resolve(Response.json({ joinCode: code }));
});

export interface RunningServer {
  /** The port it listens on (useful when started on port 0). */
  port: number;
  close(): Promise<void>;
}

export interface GameServerOptions {
  /** Where profiles live; `PROFILE_STORE_PATH` (or `server/data/profiles.json`) by default. */
  store?: ProfileStore;
}

/** Starts the game server on `port` (0 picks a free one). */
export async function startGameServer(
  port: number,
  options: GameServerOptions = {},
): Promise<RunningServer> {
  const store = options.store ?? profileStoreFromEnv();
  const httpServer = createServer();
  const server = defineServer({
    rooms: { [GAME_ROOM]: defineRoom(gameRoomWith(store)) },
    routes: createRouter({ health, room, ...profileEndpoints(store) }),
    transport: new WebSocketTransport({ server: httpServer }),
    greet: false,
    gracefullyShutdown: false,
  });
  await server.listen(port);
  return {
    port: (httpServer.address() as AddressInfo).port,
    close: () => server.gracefullyShutdown(false),
  };
}
