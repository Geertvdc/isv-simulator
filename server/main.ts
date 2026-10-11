/**
 * Entry point: `npm run server` in development, `node dist-server/main.js`
 * in production. Listens on `PORT` (default 2567).
 */

import { DEFAULT_PORT, startGameServer } from './app';

const port = Number(process.env.PORT) || DEFAULT_PORT;
const server = await startGameServer(port);
console.log(`ISV Simulator server listening on port ${server.port}`);

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void server.close().then(() => process.exit(0));
  });
}
