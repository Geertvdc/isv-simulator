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
 */

import { parseLag } from '../src/net/lag';
import { DEFAULT_PORT, startGameServer } from './app';
import { parseAllowedOrigins, parseTrustProxy } from './httpGuard';

const port = Number(process.env.PORT) || DEFAULT_PORT;
const roundSeconds = Number(process.env.ROUND_SECONDS) || undefined;
const lag = parseLag(process.env.NET_LAG_MS, process.env.NET_JITTER_MS);
const allowedOrigins = parseAllowedOrigins(process.env.ALLOWED_ORIGINS);
const trustProxyHops = parseTrustProxy(process.env.TRUST_PROXY);
const server = await startGameServer(port, { roundSeconds, lag, allowedOrigins, trustProxyHops });
console.log(`ISV Simulator server listening on port ${server.port}`);
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
