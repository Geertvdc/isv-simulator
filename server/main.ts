/**
 * Entry point: `npm run server` in development, `node dist-server/main.js`
 * in production. Listens on `PORT` (default 2567).
 *
 * Dev settings: `ROUND_SECONDS` makes every round that long (to reach the
 * results quickly); `NET_LAG_MS` and `NET_JITTER_MS` delay every message in
 * and out, to try a slow network on one machine.
 */

import { parseLag } from '../src/net/lag';
import { DEFAULT_PORT, startGameServer } from './app';

const port = Number(process.env.PORT) || DEFAULT_PORT;
const roundSeconds = Number(process.env.ROUND_SECONDS) || undefined;
const lag = parseLag(process.env.NET_LAG_MS, process.env.NET_JITTER_MS);
const server = await startGameServer(port, { roundSeconds, lag });
console.log(`ISV Simulator server listening on port ${server.port}`);
if (roundSeconds) console.log(`Rounds last ${roundSeconds} s (ROUND_SECONDS)`);
if (lag) console.log(`Simulating ${lag.lagMs} ms lag + ${lag.jitterMs} ms jitter each way`);

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void server.close().then(() => process.exit(0));
  });
}
