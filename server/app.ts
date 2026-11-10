/**
 * The game server: Colyseus with the `game` room, plus HTTP routes.
 *
 * - `GET /health`: `ok`, for load balancers and container checks.
 * - `GET /shard`: `{ shard, shards }`, this server's shard index and the
 *   shard count (deploys check the client's URL order with it).
 * - `GET /pool`: `{ urls, awake, host }`, the shard pool as the browser
 *   needs it: every shard's URL, which are awake, and where to host a new
 *   room (`shardPool.ts`, `src/net/pool.ts`).
 * - `GET /rooms/:code`: whether a room with this join code is open here, any
 *   case (`{ joinCode }` with the code as the server knows it, or 404). Only
 *   this shard's rooms: other shards' codes are 404s.
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
import { type Shard, normalizeJoinCode } from '../src/net/joinCode';
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
import { MemoryPoolStore, type PoolStore } from './poolStore';
import { ShardLoad } from './shardLoad';
import { ShardPool, type ShardPoolOptions } from './shardPool';
import type { ProfileStore } from './profileStore';
import { profileStoreFromEnv } from './profileStoreFromEnv';
import { profileEndpoints } from './profileRoutes';

export const DEFAULT_PORT = NET_SERVER_DEFAULT_PORT;

const health = createEndpoint('/health', { method: 'GET' }, () =>
  Promise.resolve(new Response('ok', { status: 200 })),
);

function shardEndpoint(shard: Shard) {
  return createEndpoint('/shard', { method: 'GET' }, () =>
    Promise.resolve(Response.json({ shard: shard.index, shards: shard.count })),
  );
}

function poolEndpoint(pool: ShardPool) {
  return createEndpoint('/pool', { method: 'GET' }, async () => {
    try {
      return Response.json(await pool.view());
    } catch (error) {
      console.error('Could not read the shard pool:', error);
      return Response.json({ error: 'pool unavailable' }, { status: 503 });
    }
  });
}

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
  /** Which shard this server is (`SHARD_INDEX`, `SHARD_COUNT`); the only one by default. */
  shard?: Shard;
  /** Rooms this server holds at most (`SHARD_MAX_ROOMS`); `NET_SHARD_MAX_ROOMS` by default. */
  maxRooms?: number;
  /** The shard pool; a pool of this server alone (in memory, URL unknown) by default. */
  pool?: PoolSettings;
}

export interface PoolSettings {
  /** Where the shards' heartbeats live (`poolStoreFromEnv`). */
  store: PoolStore;
  /** Every shard's public URL in index order (`SHARD_URLS`); `''` where unknown. */
  urls: readonly string[];
  /** Free room slots shard 0 keeps ready (`NET_POOL_HEADROOM_ROOMS` by default). */
  headroom?: number;
  /** How long a read of the pool is reused (`NET_POOL_CACHE_MS` by default; tests use 0). */
  cacheMs?: number;
  /** For keepalive and wake-up requests (tests); the global `fetch` by default. */
  fetch?: ShardPoolOptions['fetch'];
  /** Wall clock (tests); `Date.now` by default. */
  now?: () => number;
}

/** Starts the game server on `port` (0 picks a free one). */
export async function startGameServer(
  port: number,
  options: GameServerOptions = {},
): Promise<RunningServer> {
  const store = options.store ?? profileStoreFromEnv();
  const shard = options.shard ?? { index: 0, count: 1 };
  const load = new ShardLoad(options.maxRooms);
  const pool = new ShardPool({
    store: options.pool?.store ?? new MemoryPoolStore(),
    urls: options.pool?.urls ?? Array.from({ length: shard.count }, () => ''),
    shard,
    load,
    headroom: options.pool?.headroom,
    cacheMs: options.pool?.cacheMs,
    fetch: options.pool?.fetch,
    now: options.pool?.now,
  });
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
          shard,
          load,
        }),
      ),
    },
    routes: createRouter({
      health,
      shard: shardEndpoint(shard),
      pool: poolEndpoint(pool),
      room,
      ...profileEndpoints(store),
    }),
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
  // Right after listening, so a shard that was just woken shows up at once.
  pool.start();
  return {
    port: (httpServer.address() as AddressInfo).port,
    close: async () => {
      await pool.stop();
      await server.gracefullyShutdown(false);
    },
  };
}
