/**
 * Entry point: `npm run server` in development, `node dist-server/main.js`
 * in production. Listens on `PORT` (default 2567).
 *
 * Dev settings: `ROUND_SECONDS` makes every round that long (to reach the
 * results quickly); `NET_LAG_MS` and `NET_JITTER_MS` delay every message in
 * and out, to try a slow network on one machine.
 *
 * Security: `ALLOWED_ORIGINS` (comma-separated) limits which web pages may
 * call the HTTP API (any when unset); `TRUST_PROXY` (`true` or a hop count)
 * takes client IPs for the rate limits from `X-Forwarded-For`.
 *
 * Sharding: `SHARD_INDEX` and `SHARD_COUNT` say which shard of the pool
 * this is (its join codes name it), `SHARD_URLS` every shard's public URL
 * (in index order; optional with one shard), `SHARD_MAX_ROOMS` how many
 * rooms it takes. `PROFILE_STORE` picks the profile store (`file`, or
 * `table` for one shared by every shard; see `profileStoreFromEnv.ts`); with
 * `table` the pool's heartbeats go to the table `POOL_TABLE_NAME` (default
 * `shards`) in the same account, else they stay in memory (`poolStore.ts`).
 * Bad values stop the server at start-up.
 */

import type { Shard } from '../src/net/joinCode';
import { parseLag } from '../src/net/lag';
import { parseMaxRooms, parseShard, parseShardUrls } from '../src/net/shards';
import { DEFAULT_PORT, startGameServer } from './app';
import { parseAllowedOrigins, parseTrustProxy } from './httpGuard';
import { type PoolStore, poolStoreFromEnv } from './poolStore';
import type { ProfileStore } from './profileStore';
import { profileStoreFromEnv } from './profileStoreFromEnv';

let shard: Shard;
let shardUrls: string[];
let maxRooms: number;
let store: ProfileStore;
let poolStore: PoolStore;
try {
  shard = parseShard(process.env.SHARD_INDEX, process.env.SHARD_COUNT);
  shardUrls = parseShardUrls(process.env.SHARD_URLS, shard.count);
  maxRooms = parseMaxRooms(process.env.SHARD_MAX_ROOMS);
  store = profileStoreFromEnv(process.env);
  poolStore = poolStoreFromEnv(process.env);
} catch (error) {
  console.error(`Not starting: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}

const port = Number(process.env.PORT) || DEFAULT_PORT;
const roundSeconds = Number(process.env.ROUND_SECONDS) || undefined;
const lag = parseLag(process.env.NET_LAG_MS, process.env.NET_JITTER_MS);
const allowedOrigins = parseAllowedOrigins(process.env.ALLOWED_ORIGINS);
const trustProxyHops = parseTrustProxy(process.env.TRUST_PROXY);
const server = await startGameServer(port, {
  store,
  shard,
  maxRooms,
  pool: { store: poolStore, urls: shardUrls },
  roundSeconds,
  lag,
  allowedOrigins,
  trustProxyHops,
});
console.log(`ISV Simulator server listening on port ${server.port}`);
const tables = process.env.PROFILE_STORE?.trim().toLowerCase() === 'table';
if (shard.count > 1) {
  console.log(
    `Shard ${shard.index} of a pool of ${shard.count} (0-based), at ${shardUrls[shard.index]}`,
  );
  if (!tables) {
    console.warn(
      'PROFILE_STORE is not "table": the pool lives in this process only, so other shards look asleep',
    );
  }
}
console.log(`At most ${maxRooms} rooms (SHARD_MAX_ROOMS)`);
console.log(`Profiles and pool: ${tables ? 'Azure Table Storage' : 'JSON file, pool in memory'}`);
if (roundSeconds) console.log(`Rounds last ${roundSeconds} s (ROUND_SECONDS)`);
if (allowedOrigins) console.log(`Allowed origins: ${allowedOrigins.join(', ')}`);
else console.warn('ALLOWED_ORIGINS is not set: any web page may call this server (fine for dev)');
if (trustProxyHops) console.log(`Trusting X-Forwarded-For from ${trustProxyHops} proxy hop(s)`);
if (lag) console.log(`Simulating ${lag.lagMs} ms lag + ${lag.jitterMs} ms jitter each way`);

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void server.close().then(() => process.exit(0));
  });
}
