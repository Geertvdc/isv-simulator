/**
 * The game server: Colyseus with the `game` room, plus HTTP routes.
 *
 * - `GET /health`: `ok`, for load balancers and container checks.
 * - `GET /rooms/:code`: whether a room with this join code is open, any case
 *   (`{ joinCode }` with the code as the server knows it, or 404).
 * - `GET` and `PUT /profiles/:userId`: online profiles (`profileRoutes.ts`).
 *
 * Every request passes `httpGuard.ts` first: body size, per-IP rate limits,
 * and CORS restricted to `allowedOrigins`.
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
import type { LagSettings } from '../src/net/lag';
import { TICKS_PER_SECOND } from '../src/sim/balance';
import { GAME_ROOM, gameRoomWith } from './GameRoom';
import {
  DEFAULT_HTTP_LIMITS,
  type HttpLimits,
  createHttpGuard,
  installCors,
  installHttpGuard,
} from './httpGuard';
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
  /** Where profiles live; `PROFILE_STORE_PATH` (or `data/profiles.json`) by default. */
  store?: ProfileStore;
  /** Every round lasts this long instead of its level's length (`ROUND_SECONDS`; dev and tests). */
  roundSeconds?: number;
  /** The dev lag simulator: delays every message in and out (`NET_LAG_MS`, `NET_JITTER_MS`). */
  lag?: LagSettings | null;
  /** How long a dropped member may take to reconnect (`NET_RECONNECT_GRACE_MS` by default; tests use less). */
  reconnectGraceMs?: number;
  /** Origins allowed to call the HTTP API from a browser (`ALLOWED_ORIGINS`); `null` or unset allows any. */
  allowedOrigins?: readonly string[] | null;
  /** Reverse proxies in front whose `X-Forwarded-For` to trust (`TRUST_PROXY`); 0 by default. */
  trustProxyHops?: number;
  /** Rate limits and the body size limit; `DEFAULT_HTTP_LIMITS` (from `balance.ts`) by default. */
  limits?: Partial<HttpLimits>;
}

/** Starts the game server on `port` (0 picks a free one). */
export async function startGameServer(
  port: number,
  options: GameServerOptions = {},
): Promise<RunningServer> {
  const store = options.store ?? profileStoreFromEnv();
  const httpServer = createServer();
  const server = defineServer({
    rooms: {
      [GAME_ROOM]: defineRoom(
        gameRoomWith(store, {
          roundTicks:
            options.roundSeconds && options.roundSeconds > 0
              ? Math.round(options.roundSeconds * TICKS_PER_SECOND)
              : undefined,
          lag: options.lag ?? null,
          reconnectGraceMs: options.reconnectGraceMs,
        }),
      ),
    },
    routes: createRouter({ health, room, ...profileEndpoints(store) }),
    transport: new WebSocketTransport({ server: httpServer }),
    greet: false,
    gracefullyShutdown: false,
  });
  await server.listen(port);
  installCors(options.allowedOrigins ?? null);
  installHttpGuard(
    httpServer,
    createHttpGuard({
      limits: { ...DEFAULT_HTTP_LIMITS, ...options.limits },
      trustProxyHops: options.trustProxyHops ?? 0,
      now: () => Date.now(),
    }),
  );
  return {
    port: (httpServer.address() as AddressInfo).port,
    close: () => server.gracefullyShutdown(false),
  };
}
