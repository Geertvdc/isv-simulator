# ISV Simulator game server

The authoritative server for online play: Node 22 + [Colyseus](https://colyseus.io) 0.18. One `game` room per join code; each room runs the same `src/flow` and `src/sim` code as couch play, 60 ticks a second, and sends snapshots to its clients 20 times a second. See [phase 13](../docs/plan/phase-13-online-multiplayer.md) for the architecture.

Local couch play needs none of this.

## Run it

```sh
npm run server        # the server alone, restarts on changes (port 2567)
npm run dev:online    # the Vite client and the server together
curl localhost:2567/health
```

| Env var                           | Default                                                       | What                                                                                                                                                                                                                                                                                      |
| --------------------------------- | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PORT`                            | `2567`                                                        | Port for HTTP and WebSockets                                                                                                                                                                                                                                                              |
| `PROFILE_STORE_PATH`              | `data/profiles.json` (repo root, outside the watched folders) | The online profiles (gitignored; created on the first write)                                                                                                                                                                                                                              |
| `PROFILE_STORE`                   | `file`                                                        | `file`: profiles in the JSON file at `PROFILE_STORE_PATH` (one server). `table`: Azure Table Storage, shared by every shard                                                                                                                                                               |
| `PROFILE_TABLE_ENDPOINT`          |                                                               | With `table`: the storage account's table endpoint (`https://<account>.table.core.windows.net`), reached with the managed identity (`AZURE_CLIENT_ID`, a user-assigned identity's client id) or else `DefaultAzureCredential` (`az login`). Needs the Storage Table Data Contributor role |
| `PROFILE_TABLE_CONNECTION_STRING` |                                                               | With `table`, instead of the endpoint: a connection string (`UseDevelopmentStorage=true` for Azurite). The table is created if it's missing                                                                                                                                               |
| `PROFILE_TABLE_NAME`              | `profiles`                                                    | With `table`: the table                                                                                                                                                                                                                                                                   |
| `POOL_TABLE_NAME`                 | `shards`                                                      | With `PROFILE_STORE=table`: the table for the shard pool's heartbeats, in the same account (same endpoint, identity or connection string). Without `table` the pool lives in memory (one server)                                                                                          |
| `SHARD_INDEX`                     | `0`                                                           | Which shard of the pool this server is, 0-based (see Shards)                                                                                                                                                                                                                              |
| `SHARD_COUNT`                     | `1`                                                           | The pool's size (all shards, awake or asleep), 1 to 24. A bad index or count stops the server at start-up                                                                                                                                                                                 |
| `SHARD_URLS`                      | (unknown)                                                     | Every shard's public URL, comma-separated in index order (`https://shard0.example,https://shard1.example`). Must list exactly `SHARD_COUNT` http(s) URLs; may be left out with one shard. Used for `/pool`, keepalive and wake-ups. Bad values stop the server                            |
| `SHARD_MAX_ROOMS`                 | `15` (`NET_SHARD_MAX_ROOMS`)                                  | Rooms this shard holds at most; creating another is refused with `serverFull`                                                                                                                                                                                                             |
| `APP_VERSION`                     | `dev`                                                         | The build this shard runs (the image tag, e.g. the git short sha). Goes into its heartbeat; the ops dashboard shows it and flags mixed versions                                                                                                                                           |
| `HISTORY_TABLE_NAME`              | `poolhistory`                                                 | Shard 0 with `PROFILE_STORE=table`: the table for the ops dashboard's history (same account, identity or connection string; created if missing with a connection string). Without `table` the history lives in memory                                                                     |
| `ROUND_SECONDS`                   | (the level's length)                                          | Dev: every round lasts this long, to reach the results fast                                                                                                                                                                                                                               |
| `NET_LAG_MS`                      | `0`                                                           | Dev: delays every message in and out by this much                                                                                                                                                                                                                                         |
| `NET_JITTER_MS`                   | `0`                                                           | Dev: plus up to this much at random (order is kept)                                                                                                                                                                                                                                       |
| `ALLOWED_ORIGINS`                 | (any origin)                                                  | Comma-separated origins (`https://game.example,http://localhost:5173`) whose pages may call the server; others get no usable CORS answer. Unset allows any (dev); set it in production                                                                                                    |
| `TRUST_PROXY`                     | (off)                                                         | `true` (one proxy) or a hop count: take the client IP for the rate limits from `X-Forwarded-For`. Only set it behind a reverse proxy that adds that header                                                                                                                                |

`npm run dev:online` leaves `PORT` alone: Vite reads it too, so setting it there would put both on one port.

## Files

- `roomLogic.ts`: one room as plain data and pure functions (members, host, capacity, the clock, flow, sim, snapshots). Returns the messages to send; tested without any networking.
- `GameRoom.ts`: the Colyseus room around it. The join code is the room id.
- `joinCodes.ts`: codes of the rooms alive in this process, so they stay unique; they start with one of this shard's letters.
- `shardLoad.ts`: this shard's open rooms and their players against `SHARD_MAX_ROOMS`; `GameRoom` refuses to be created (`serverFull`) when it's full.
- `shardPool.ts`: this shard's part in the pool: heartbeats, keepalive, the pool manager (shard 0) and the `/pool` answer (see Shards). The pool math is pure, in `src/net/pool.ts`.
- `shardMetrics.ts`: this process's CPU (`process.cpuUsage`), event loop utilization and p99 delay (`perf_hooks`), memory, plus connections, rounds started, `serverFull` refusals and the room list from `shardLoad.ts`; sampled every 5 s (`NET_SHARD_METRICS_MS`), carried by the heartbeat (`ShardOps` in `src/net/pool.ts`). Sources are injectable for tests.
- `admin.ts`, `admin/` (`page.html`, `app.js`, `app.css`, inlined with `?raw`): the ops dashboard (see Ops dashboard). `poolHistory.ts` (pure: snapshots, event derivation, downsampling, day partitions), `historyStore.ts` (the history table behind a small `HistoryTable` interface, Azure or in memory) and `historyRecorder.ts` (shard 0's loop: observe, snapshot, purge, cached reads).
- `poolStore.ts`: where the heartbeats live: `TablePoolStore` (Azure Table Storage, one entity per shard, behind a small `PoolTable` interface so tests use a fake) or `MemoryPoolStore` (one server, tests).
- `profileStore.ts`: `ProfileStore` with `JsonFileProfileStore` (one JSON file, read on first use, rewritten through a temp file and a rename after every change, one change at a time; a corrupt file is moved to `<path>.corrupt-<time>` and the store starts empty) and `MemoryProfileStore` for tests, plus the merge rules every store shares.
- `tableProfileStore.ts`: `TableProfileStore`, Azure Table Storage for several shards: one entity per user (PartitionKey the user id, RowKey `profile`, the levels as a JSON string). Each change reads the entity with its ETag and writes it back only if nobody changed it meanwhile, else waits a little and tries again (`NET_PROFILE_WRITE_TRIES`). The profile cap is counted once at first use plus this process's creations, so with several shards it's approximate. `profileStoreFromEnv.ts` picks the store from `PROFILE_STORE`.
- `profileRoutes.ts`: `GET`/`PUT /profiles/:userId`.
- `httpGuard.ts`: runs before every HTTP request: body size limit, per-IP rate limits (`rateLimit.ts`, a token bucket per key) and the CORS origins.
- `app.ts`: `startGameServer(port, { store, shard, maxRooms, pool, roundSeconds, lag, allowedOrigins, trustProxyHops, limits })`, with the HTTP routes. `main.ts` is the entry point (reads the env vars above).
- `roomLogic.test.ts`, `server.test.ts` (a real server on a free port with `@colyseus/sdk` clients), `shard.test.ts` (a server as shard 2 of 3), `pool.test.ts` (`/pool`, the room limit, and the browser's hosting and joining through the pool), `client.test.ts` (the browser's wrapper against a real server), `round.test.ts` (two browsers' network code play a whole short round, from the lobby to the profiles), `resilience.test.ts` (clients behind a small TCP proxy whose sockets get cut: reconnecting within and after the grace period, a reloaded page rejoining with its token, the host moving while away, floods, room cleanup, shutdown).

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

- The `hello` goes in as the join options. A refused join rejects with the `ErrorCode` as its message: `badMessage`, `protocolMismatch` or `roomFull` (a room holds `MAX_PLAYERS` players, counting every member's `localPlayers`). A refused create on a full shard rejects with `serverFull` (HTTP 503). A wrong code rejects too (the room doesn't exist).
- After joining: `welcome` to the newcomer, `lobby` to everyone (members, plus `levels`: the room's unlocks, i.e. the host's progress; again whenever someone joins, leaves or changes, the host's profile arrives or a round ends), `roundStart` when a round is loaded (also to someone joining mid-round), `snapshot` every 3 ticks (the flow, plus the round or `null`).
- `menu` presses carry local device ids (`kb-left`, `pad-0`); the server makes them `<sessionId>:<deviceId>`. In the lobby a member's `localPlayers` grows by one when another of its devices joins, while the room has space (4 players in total); back presses are ignored there (leaving is the client's business). The host continues to level select. Level select, pause, results and pausing a round remain host-only; intro role choice/readiness uses every owner's bound devices.
- Protocol 6 adds `role { playerId, roleId }`, `ready { playerId, ready }` and `takeover { playerId, deviceId }`. The server validates ids and owner bindings. Roles/readiness are configurable only in lobby/intro; unknown roles, foreign players and locked setup return explicit errors. Takeover rebinds an owned orphan gamepad slot to an unused gamepad id without changing player identity/role. Role changes invalidate that player's ready. Countdown starts when every connected participating slot is ready, locks the roles and recreates the prepared round with the same seed. Retry/next confirmation keeps choices but clears readiness.
- The browser's side is `src/net/client.ts` (`hostInPool`, `joinInPool`, `rejoinInPool` on top of `hostRoom`, `joinRoomByCode`, `rejoinRoom`, and `helloFor`), a thin wrapper around `@colyseus/sdk` that maps refused joins to `wrongCode`, `roomFull`, `serverFull`, `protocolMismatch` or `unreachable`, and can simulate lag (`{ lag: { lagMs, jitterMs } }`, the page's `?lag=&jitter=`).
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

HTTP: `GET /health` → `ok`. `GET /shard` → `{ "shard": 0, "shards": 1 }` (this server's `SHARD_INDEX` and `SHARD_COUNT`). `GET /pool` → `{ "urls": [...], "awake": [true, false, ...], "host": 0 }`: every shard's URL (`SHARD_URLS`, `""` when unknown), which are awake, and the shard to host a new room on (-1: all awake and full); 503 when the pool can't be read (see Shards). `GET /rooms/:code` → `{ joinCode }` for an open room on this server (any case, spaces and dashes allowed), 404 otherwise (also for another shard's room).

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

The Azure setup (Container Apps for this server, Static Web Apps for the game, one deploy script) lives in [`infra/`](../infra/README.md). The notes below hold for any host.

The `Dockerfile` bundles `server/` with Vite (`npm run build:server`, which inlines the level maps) into `dist-server/main.js` and runs that with Node 22 and the production dependencies. It runs anywhere that runs a container and allows WebSockets: Azure Container Apps, Fly.io, Render, a VM. Things to know:

- **Profiles on disk.** Mount a volume for the profile file, e.g. `-v isv-profiles:/app/server/data` (or set `PROFILE_STORE_PATH` to a path on one); without it, profiles go with the container.
- **One instance per URL; scale with shards.** Rooms live in the process's memory, so every socket of a room must reach the same process: never put two replicas behind one URL (no Redis presence or driver is set up). For more rooms, run more shards: separate servers, each with one replica and its own URL, all from the same image. See Shards below. Restarting a shard drops its rooms (players are told "The server is restarting").
- **WebSockets and sticky sessions.** The platform's ingress must allow WebSocket upgrades. With one instance per URL, no sticky sessions are needed.
- **TLS.** Let the platform terminate HTTPS; browsers on an `https://` page need `wss://`. The client finds the server through `VITE_SERVER_URL` (shard 0, the front door), and the other shards through its `GET /pool`.
- **Health check:** `GET /health`. The platform sets `PORT`; the image defaults to 2567.
- **CORS.** The browser game is static files hosted somewhere else, so set `ALLOWED_ORIGINS` to its origin (e.g. `-e ALLOWED_ORIGINS=https://isv.example.com`). Unset, any web page may call the server (the server warns at start-up).
- **Proxy.** Behind the platform's ingress (Azure Container Apps, Fly.io, Render), set `TRUST_PROXY=true` so the rate limits see real client IPs instead of the proxy's.
- **No auth.** Every message is validated and each client has a message budget, and IPs are rate-limited (see Limits), but anyone who knows a code can join. Fine for an internal game; don't expose it widely.

### Shards: the autoscaling pool

Rooms live in one process, so the server scales out as a **pool of shards**: `SHARD_COUNT` servers from the same image, each with its own URL, `SHARD_INDEX` (0, 1, ...) and the same `SHARD_COUNT` and `SHARD_URLS`. The pool size is the ceiling and is fixed per deploy; how many shards actually run changes on its own:

- **Shard 0 is always on** and is the game's front door (`VITE_SERVER_URL`): profiles, `GET /pool`, and the pool manager. The others **sleep** (the host scales them to zero after a few minutes without HTTP requests, as Azure Container Apps' HTTP scaler does) and **wake up** on any HTTP request.
- **Join codes name their shard:** a code's first letter's place in the join-code alphabet (24 letters, no I or O) mod `SHARD_COUNT`. 1, 2, 3, 4, 6, 8, 12 or 24 shards split the letters evenly.
- **Heartbeats.** Each shard writes its entry (`rooms`, `players`, `maxRooms`, `url`, `updatedAt`) to the pool table (PartitionKey `pool`, RowKey its index): once right after it starts listening (so a woken shard shows up at once), when its rooms or players change (checked every second, `NET_SHARD_HEARTBEAT_MIN_MS`, so at most one write a second), and every 30 s without changes (`NET_SHARD_HEARTBEAT_MS`). A shard is **awake** while its entry is at most 90 s old (`NET_SHARD_AWAKE_MS`). On `SIGTERM` it writes one last entry with no rooms and time 0 (asleep at once). A crashed shard can look awake for up to 90 s; that's fine, the browser moves on to the next shard when one can't be reached. Reads of the pool are cached for 2 s per process (`NET_POOL_CACHE_MS`), with the shard's own entry always replaced by its live numbers.
- **Packing.** `/pool`'s `host` is the lowest-index awake shard with fewer rooms than its `SHARD_MAX_ROOMS`; if there is none, the lowest-index sleeping shard (the browser's request wakes it: a cold start); -1 when every shard is awake and full. New rooms fill the low shards, so the high ones empty out and fall asleep.
- **Keepalive.** A shard holding rooms requests its own public `/health` every minute (`NET_SHARD_KEEPALIVE_MS`), so a scaler that only counts HTTP requests (not open WebSockets) never puts it to sleep under a game. Skipped when its URL is unknown.
- **Wake-ahead headroom.** Every 10 s (`NET_POOL_MANAGE_MS`) shard 0 reads the pool. Its own free slots and those of shards holding rooms count as they are; when they add up to fewer than 5 (`NET_POOL_HEADROOM_ROOMS`), it requests `/health` of the lowest-index empty shards (sleeping or awake) until there's enough, and keeps requesting them every round while they're needed so they don't fall asleep again. Empty shards it doesn't need get no requests and sleep. Requests are fire and forget, with a 30 s timeout (`NET_SHARD_WAKE_TIMEOUT_MS`).
- **Room limit.** Creating a room on a shard that holds `SHARD_MAX_ROOMS` already is refused with `serverFull`.
- **The browser** reads `/pool` at the front door before hosting, joining or rejoining. Hosting goes to `host`; when that shard is unreachable or full it tries the other awake shards, then the sleeping ones (by index), and shows "All servers are full" (`serverFull`) when none takes it or `host` is -1. Joining goes to the shard the code names; when that shard sleeps, it answers `wrongCode` without contacting it (a sleeping shard has no rooms, and a typo shouldn't wake a server). A reloaded page rejoins the same way (a sleeping shard: the room is gone). Shard 0 is always reached at the front door URL. If `/pool` can't be read: unreachable. Growing the pool needs no client rebuild.
- **Shared tables.** Set `PROFILE_STORE=table` on every shard: profiles and the pool (`POOL_TABLE_NAME`, default `shards`) live in the same storage account. Without it each process has its own profiles and an in-memory pool that only knows itself (the server warns when `SHARD_COUNT` > 1).
- `GET /rooms/:code` only knows its own shard's rooms.
- **Ops numbers.** Every heartbeat also carries the shard's `version` (`APP_VERSION`), `startedAt`, `uptimeS`, `cpuPct`, `eventLoopUtil`, `loopDelayP99Ms`, `rssMb`, `heapUsedMb`, `connections`, `roundsStarted`, `serverFullRefusals` and `roomList` (a JSON string, masked codes). They ride along on the writes above; they never cause one.

Try three shards locally with [Azurite](https://learn.microsoft.com/azure/storage/common/storage-use-azurite):

```sh
docker run -d -p 10002:10002 mcr.microsoft.com/azure-storage/azurite azurite-table --tableHost 0.0.0.0
export PROFILE_STORE=table PROFILE_TABLE_CONNECTION_STRING=UseDevelopmentStorage=true \
  SHARD_COUNT=3 SHARD_MAX_ROOMS=2 \
  SHARD_URLS=http://localhost:2567,http://localhost:2568,http://localhost:2569
SHARD_INDEX=0 PORT=2567 npm run server
SHARD_INDEX=1 PORT=2568 npm run server
SHARD_INDEX=2 PORT=2569 npm run server   # later: shard 0 tries to wake it when headroom runs low
curl localhost:2567/pool
npm run dev                              # VITE_SERVER_URL defaults to this page's host on port 2567
```

`npm run build` still builds only the browser game.

### Ops dashboard

Shard 0 serves a dashboard of the whole pool at **`/admin`** (e.g. `http://localhost:2567/admin` with `npm run server`). It is **open and read-only** (no login: it's used for demos), so it never shows anything to join with: rooms are listed with **masked codes** (`AB••`), and no user ids, names or IPs. Other shards answer 404 for `/admin` paths.

- **Now:** shards awake / pool size, rooms against capacity, players, connections, free room slots against the headroom, which shard hosts the next room, which spares shard 0 is waking, the versions running (mixed versions are flagged). One card per shard (asleep ones greyed): awake/asleep and last seen, version, uptime, rooms (a bar), players, connections, CPU, event loop delay p99 and busy share, memory, rounds started, rooms refused for being full; click one for its rooms (masked code, members, players, screen, level, age, idle).
- **Freshness:** shard 0's own numbers are live; the others' come from their last heartbeat, so up to 30 s old. The page refreshes every 5 s (`NET_ADMIN_REFRESH_MS`) and can be paused.
- **History** (charts with a table view, and an event log): shard 0 writes a snapshot of the pool every minute (`NET_HISTORY_SNAPSHOT_MS`) and events as it sees them in its 10 s reads of the pool: a shard woke up, fell asleep, restarted, came back on a new version; shard 0 started waking one (once per episode); rooms refused for being full (per minute); every shard full, and room again. Ranges: last hour (a point a minute), 24 hours (highest per 5 minutes), 7 days (highest per hour). Kept 14 days (`NET_HISTORY_RETENTION_DAYS`): once a day shard 0 deletes older days. In the table `HISTORY_TABLE_NAME` (PartitionKey `snap-YYYY-MM-DD` / `event-YYYY-MM-DD`, UTC), or in memory without `PROFILE_STORE=table`.
- **Routes** (GET only): `/admin` (the page; `/admin/app.js` and `/admin/app.css` beside it), `/admin/api/state` (the pool now: `poolSize`, `totals`, `headroom`, `nextHost`, `waking`, `versions`, `shards[]` with each heartbeat's numbers and room list), `/admin/api/history?range=1h|24h|7d` (`points` and `events`).
- **Cost:** reads use the pool cache (2 s) and the history cache (10 s per range), so many viewers don't add table reads.
- **Headers:** `Cache-Control: no-store`, a strict `Content-Security-Policy` (own script and style only, nothing from elsewhere), no CORS headers (same origin only).

`npx vite-node scripts/adminDemo.ts [port]` starts shard 0 of a made-up pool of 4 with rooms, a faked second shard and a week of fake history, to see the dashboard with data.
