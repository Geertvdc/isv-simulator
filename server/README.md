# ISV Simulator game server

The authoritative server for online play: Node 22 + [Colyseus](https://colyseus.io) 0.18. One `game` room per join code; each room runs the same `src/flow` and `src/sim` code as couch play, 60 ticks a second, and sends snapshots to its clients 20 times a second. See [phase 13](../docs/plan/phase-13-online-multiplayer.md) for the architecture.

Local couch play needs none of this.

## Run it

```sh
npm run server        # the server alone, restarts on changes (port 2567)
npm run dev:online    # the Vite client and the server together
curl localhost:2567/health
```

| Env var              | Default                                                       | What                                                                                                                                                                                   |
| -------------------- | ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PORT`               | `2567`                                                        | Port for HTTP and WebSockets                                                                                                                                                           |
| `PROFILE_STORE_PATH` | `data/profiles.json` (repo root, outside the watched folders) | The online profiles (gitignored; created on the first write)                                                                                                                           |
| `ROUND_SECONDS`      | (the level's length)                                          | Dev: every round lasts this long, to reach the results fast                                                                                                                            |
| `NET_LAG_MS`         | `0`                                                           | Dev: delays every message in and out by this much                                                                                                                                      |
| `NET_JITTER_MS`      | `0`                                                           | Dev: plus up to this much at random (order is kept)                                                                                                                                    |
| `ALLOWED_ORIGINS`    | (any origin)                                                  | Comma-separated origins (`https://game.example,http://localhost:5173`) whose pages may call the server; others get no usable CORS answer. Unset allows any (dev); set it in production |
| `TRUST_PROXY`        | (off)                                                         | `true` (one proxy) or a hop count: take the client IP for the rate limits from `X-Forwarded-For`. Only set it behind a reverse proxy that adds that header                             |

`npm run dev:online` leaves `PORT` alone: Vite reads it too, so setting it there would put both on one port.

## Files

- `roomLogic.ts`: one room as plain data and pure functions (members, host, capacity, the clock, flow, sim, snapshots). Returns the messages to send; tested without any networking.
- `GameRoom.ts`: the Colyseus room around it. The join code is the room id.
- `joinCodes.ts`: codes of the rooms alive in this process, so they stay unique.
- `profileStore.ts`: `ProfileStore` with `JsonFileProfileStore` (one JSON file, read on first use, rewritten through a temp file and a rename after every change, one change at a time; a corrupt file is moved to `<path>.corrupt-<time>` and the store starts empty) and `MemoryProfileStore` for tests.
- `profileRoutes.ts`: `GET`/`PUT /profiles/:userId`.
- `httpGuard.ts`: runs before every HTTP request: body size limit, per-IP rate limits (`rateLimit.ts`, a token bucket per key) and the CORS origins.
- `app.ts`: `startGameServer(port, { store, roundSeconds, lag, allowedOrigins, trustProxyHops, limits })`, with the HTTP routes. `main.ts` is the entry point (reads the env vars above).
- `roomLogic.test.ts`, `server.test.ts` (a real server on a free port with `@colyseus/sdk` clients), `client.test.ts` (the browser's wrapper against a real server), `round.test.ts` (two browsers' network code play a whole short round, from the lobby to the profiles), `resilience.test.ts` (clients behind a small TCP proxy whose sockets get cut: reconnecting within and after the grace period, a reloaded page rejoining with its token, the host moving while away, floods, room cleanup, shutdown).

`npm run verify:online` (`scripts/verifyOnline.ts`, not in CI) starts its own server and Vite and drives three headless Chromes through a session with a network drop, a page reload, a late joiner and the host leaving; see the top of the file.

## Talking to it

Messages are the objects in [`src/net/protocol.ts`](../src/net/protocol.ts). Over Colyseus, each message's type is its `type` field and its payload is the whole object, both ways.

```ts
import { Client } from '@colyseus/sdk';

const client = new Client('http://localhost:2567');
const hello = {
  type: 'hello',
  protocol: PROTOCOL_VERSION,
  userId,
  displayName: 'Ada',
  localPlayers: 1,
};

const room = await client.create('game', hello); // host a room
// or join one: await client.joinById(normalizeJoinCode(typed), hello)

room.onMessage('*', (_type, message: ServerMessage) => {
  /* welcome, lobby, roundStart, snapshot, pong, error, closing */
});
room.send('ping', { type: 'ping', id: 1, clientTimeMs: performance.now() });
```

- The `hello` goes in as the join options. A refused join rejects with the `ErrorCode` as its message: `badMessage`, `protocolMismatch` or `roomFull` (a room holds `MAX_PLAYERS` players, counting every member's `localPlayers`). A wrong code rejects too (the room doesn't exist).
- After joining: `welcome` to the newcomer, `lobby` to everyone (members, plus `levels`: the room's unlocks, i.e. the host's progress; again whenever someone joins, leaves or changes, the host's profile arrives or a round ends), `roundStart` when a round is loaded (also to someone joining mid-round), `snapshot` every 3 ticks (the flow, plus the round or `null`).
- `menu` presses carry local device ids (`kb-left`, `pad-0`); the server makes them `<sessionId>:<deviceId>`. In the lobby a member's `localPlayers` grows by one when another of its devices joins, while the room has space (4 players in total); back presses are ignored there (leaving is the client's business). The host continues to level select. Level select, pause, results and pausing a round remain host-only; intro role choice/readiness uses every owner's bound devices.
- Protocol 6 adds `role { playerId, roleId }`, `ready { playerId, ready }` and `takeover { playerId, deviceId }`. The server validates ids and owner bindings. Roles/readiness are configurable only in lobby/intro; unknown roles, foreign players and locked setup return explicit errors. Takeover rebinds an owned orphan gamepad slot to an unused gamepad id without changing player identity/role. Role changes invalidate that player's ready. Countdown starts when every connected participating slot is ready, locks the roles and recreates the prepared round with the same seed. Retry/next confirmation keeps choices but clears readiness.
- The browser's side is `src/net/client.ts` (`hostRoom`, `joinRoomByCode`, `helloFor`), a thin wrapper around `@colyseus/sdk` that maps refused joins to `wrongCode`, `roomFull`, `protocolMismatch` or `unreachable`, and can simulate lag (`{ lag: { lagMs, jitterMs } }`, the page's `?lag=&jitter=`).
- During a round each client sends one `inputs` message per frame with an `InputCommand` per local player, stamped with the server tick it should land on (`inputTargetTick` from the clock sync, see `src/net/inputStamp.ts`; at most one per tick), and pings every half second (faster at first) to keep that clock synced. It draws the round from the snapshots `NET_INTERP_DELAY_MS` plus half a round trip behind the server (`src/net/onlineRound.ts`), and plays each snapshot's events once, when the picture reaches them.
- `inputs` are stamped with the server tick they're meant for (`inputTargetTick` in `src/net/clock.ts`) and only count for players bound to the sender's devices.
- `hello` again in the room changes the display name and couch player count.
- The host is the earliest joined member whose connection is up: when the host's connection drops, the next one drives the menus until they're back; when the host leaves, the earliest joined member left takes over. A host whose machine has no joined player still drives host-only menus after the lobby, but is never aliased to another player's slot for role choice/readiness.
- On the level select and the results, a member without any player (they joined while a round ran, or only watched) joins one with a join press, so they play the next round. More couch players join through Change players (the lobby).
- A member who leaves for good loses their players right away outside a round; during a round their character stands still until the round ends and is dropped when the next one starts. A room with no players left goes back to the lobby.

### Connections and reconnecting

- A socket that drops without a goodbye (`onDrop`) keeps its member, players and couch devices for `NET_RECONNECT_GRACE_MS` (20 s). Everyone gets a `lobby` with that member's `connected: false`; their players stand still (no inputs). The SDK reconnects on its own (the browser wrapper tunes it to retry for the whole grace period and closes a socket that has been silent for `NET_SILENCE_TIMEOUT_MS`, 4 s, to start that). A reloaded page comes back with `client.reconnect(token)`: the browser keeps the room's `reconnectionToken` in `sessionStorage` (`src/net/rejoin.ts`). Back in, the session id is the same; the member gets `welcome` (with the protocol version, which the client checks again: a page running another version leaves), `lobby` and the loaded round's `roundStart` with the same `roundId`.
- After the grace period, or on a goodbye, the member is gone (`onLeave`).
- Dropping during lobby/intro clears the owner's readiness, not their roles. Disconnected slots do not block the connected team; rejoining before countdown requires fresh confirmation. Rejoining after countdown receives the frozen authoritative setup, and late spectators cannot change it.
- A round counts for everyone who was in the room when it started (`roundStart.counted`), also those who left during it; not for someone who joined while it ran.
- Each member has a message budget (`NET_MAX_MESSAGES_PER_SECOND`, 120 a second with bursts of `NET_MESSAGE_BURST`, 60); messages past it are dropped. Colyseus disconnects a client at 5 times that.
- A room where nobody pressed or moved anything for `NET_ROOM_IDLE_MS` (30 min) sends `closing { reason: 'idle' }` and closes. On `SIGTERM`/`SIGINT` every room sends `closing { reason: 'shutdown' }` and closes with code 4001, without waiting for anyone's grace period. A room with nobody connected closes when the last grace period runs out.

HTTP: `GET /health` → `ok`. `GET /rooms/:code` → `{ joinCode }` for an open room (any case, spaces and dashes allowed), 404 otherwise.

### Limits

Per client IP (token buckets; numbers in `src/sim/balance.ts`), past which the server answers 429 with `Retry-After` (the browser shows a failed join as "unreachable"):

- creating rooms: 10 at once, then one per 6 s (`NET_ROOM_CREATE_*`);
- failed joins (`joinById` with a code that doesn't work) and failed `GET /rooms/:code` lookups: 10, then one per 6 s (`NET_FAILED_JOIN_*`), so 4-letter codes can't be guessed; while out of attempts every join and lookup is refused;
- `PUT /profiles/:userId`: 30, then one per second (`NET_PROFILE_WRITE_*`).

Request bodies over 64 KB (`NET_MAX_BODY_BYTES`) get a 413 without being read (over 1 MB the connection is cut); bodies without a `Content-Length` get a 411. A path that isn't already in the form the router matches (`.`/`..` or `%2e` segments, `\`, unescaped spaces, a fragment) gets a 400, so the limits can't be dodged with `/./matchmake/create/game` and the like. The store holds at most 10,000 profiles (`NET_MAX_PROFILES`): a `PUT` that would create one more gets a 507 (`{ "error": "profile limit reached" }`), existing profiles still update, and a round isn't recorded for a new user.

The client IP is the socket's address. Behind a reverse proxy that is the proxy for everyone, so set `TRUST_PROXY` there (and only there: otherwise anyone could pick their own IP with the header).

### Profiles

A profile is `{ userId, displayName, levels, createdAt, updatedAt }`, with `levels` shaped like the browser save's (`{ [levelId]: { bestStars, bestScore, plays } }`). User ids are UUID v4s, any case (stored in lower case); anything else gets a 400.

```sh
curl localhost:2567/profiles/<id>                      # 404 until the first PUT
curl -X PUT -H 'content-type: application/json' \
  -d '{"displayName":"Ada","levels":{"garage":{"bestStars":3,"bestScore":120,"plays":2}}}' \
  localhost:2567/profiles/<id>                         # merged profile back
```

`PUT` merges: per level the best stars and best score win and `plays` is the larger count; `displayName` replaces the name when given. The game does this at start-up with its local save and keeps the merged levels.

In a room, each member's profile is loaded when they join (hello's `userId`). The host's levels are the room's unlocks (a new host's when the host leaves). When a round ends, it is recorded in the profile of every member who was in the room when it started, once per user id. Members whose `userId` isn't a UUID v4 play without a profile.

## Deploy

```sh
docker build -t isv-simulator-server .
docker run --rm -p 2567:2567 isv-simulator-server
```

The `Dockerfile` bundles `server/` with Vite (`npm run build:server`, which inlines the level maps) into `dist-server/main.js` and runs that with Node 22 and the production dependencies. It runs anywhere that runs a container and allows WebSockets: Azure Container Apps, Fly.io, Render, a VM. Things to know:

- **Profiles on disk.** Mount a volume for the profile file, e.g. `-v isv-profiles:/app/server/data` (or set `PROFILE_STORE_PATH` to a path on one); without it, profiles go with the container.
- **One instance.** Rooms live in the process's memory and the join codes are unique per process. Don't scale out (no Redis presence or driver is set up); restarting drops the rooms (players are told "The server is restarting").
- **WebSockets and sticky sessions.** The platform's ingress must allow WebSocket upgrades. With one instance, no sticky sessions are needed.
- **TLS.** Let the platform terminate HTTPS; browsers on an `https://` page need `wss://`. The client finds the server through `VITE_SERVER_URL` (13d/13e).
- **Health check:** `GET /health`. The platform sets `PORT`; the image defaults to 2567.
- **CORS.** The browser game is static files hosted somewhere else, so set `ALLOWED_ORIGINS` to its origin (e.g. `-e ALLOWED_ORIGINS=https://isv.example.com`). Unset, any web page may call the server (the server warns at start-up).
- **Proxy.** Behind the platform's ingress (Azure Container Apps, Fly.io, Render), set `TRUST_PROXY=true` so the rate limits see real client IPs instead of the proxy's.
- **No auth.** Every message is validated and each client has a message budget, and IPs are rate-limited (see Limits), but anyone who knows a code can join. Fine for an internal game; don't expose it widely.

`npm run build` still builds only the browser game.
