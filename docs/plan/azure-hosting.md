# Hosting on Azure

How the browser game and the online game server run on Azure, as infrastructure as code. This step writes the code only; nothing is deployed until someone runs the deploy (see [Deploying](#deploying)).

## Goal

- The browser game (static files from `npm run build`) on a public HTTPS URL.
- The game server (`server/`, the `Dockerfile`) on public `wss://` URLs, one per shard of a pool that grows and shrinks by itself. The game is built with shard 0's URL (`VITE_SERVER_URL`, the front door) and asks it for the rest.
- Online profiles that survive restarts and new versions.
- One command (or one manual GitHub Actions run) that builds and deploys both, the same every time.
- More servers start by themselves when the running ones fill up, and stop when they empty, without a deploy.

## Architecture

```
                 browser
       ┌────────────┴─────────────┐
       │ https                    │ https + wss (Colyseus): GET /pool at shard 0, then the shard of the room
       ▼                          ▼
 Azure Static Web Apps     Azure Container Apps (Express environment)
 (Free): dist/             ├─ ca-isv-<env>-game-0      always on: the front door (/pool, profiles, hosting)
                           ├─ ca-isv-<env>-game-1 …    0 or 1 replica: asleep until needed
                           └─ ca-isv-<env>-game-<N-1>  (N = pool size, the ceiling)
                                │  profiles → Azure Table Storage, table "profiles"
                                │  pool entities (rooms, players per shard) → table "shards"
                                │  ops dashboard history (shard 0 only) → table "poolhistory"
                                │  logs → Log Analytics
                                └─ image ← Azure Container Registry (Basic)
                              one user-assigned managed identity for all shards:
                              AcrPull + Storage Table Data Contributor
```

All in one resource group per environment (`rg-isv-simulator-<env>`, default env `prod`, region `westeurope`).

| Resource                       | Name (env `prod`)      | Why                                                                                                                                                                                  |
| ------------------------------ | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Log Analytics workspace        | `log-isv-prod`         | Container logs, 30 days                                                                                                                                                              |
| Container registry (Basic)     | `crisvprod<suffix>`    | The server image; admin user off                                                                                                                                                     |
| User-assigned managed identity | `id-isv-prod-game`     | Pulls from the registry (AcrPull) and reads/writes profiles (Storage Table Data Contributor); no secrets                                                                             |
| Storage account (Standard LRS) | `stisvprod<suffix>`    | Table Storage tables `profiles` (one entity per user), `shards` (one pool entity per shard) and `poolhistory` (the [ops dashboard](#ops-dashboard)'s history); shared-key access off |
| Container Apps environment     | `cae-isv-prod`         | Express: sub-second start from zero                                                                                                                                                  |
| Container App, per shard       | `ca-isv-prod-game-<n>` | The game server: external ingress, port 2567, WebSockets, probes on `/health`; shard 0 1 replica, the others 0 or 1                                                                  |
| Static Web App (Free)          | `swa-isv-prod`         | The browser game                                                                                                                                                                     |

`<suffix>` is `uniqueString(resourceGroup().id)`, cut short, so the global names don't collide.

### Why these services

- **Container Apps** runs the existing `Dockerfile` as is, terminates TLS, allows WebSocket upgrades, restarts on failed health checks, and bills per second. App Service would work too, but it costs more for one small always-on container. AKS is too much to run for an internal game.
- **Express environment** (see [Express](#express)): the same resource types and Consumption billing, but a shard scaled to zero starts in under a second instead of ~10 to 20 s. That suits a pool of sleeping shards: waking one is nearly instant, so the wake-ahead matters less, and setting shard 0's `gameServerMinReplicas` to 0 becomes reasonable. Whether it carries WebSockets is the open question; the deploy checks it.
- **Static Web Apps (Free)** serves the static build from a global CDN with HTTPS and custom domains, for free. A storage static website plus Front Door costs more and takes more parts.
- **Azure Table Storage** holds the profiles, one entity per user, for every deployment (even one shard). Several processes can write it at once, which a single `profiles.json` on a file share can't take, and the servers reach it with their managed identity, so the storage account needs no keys at all. It costs next to nothing at this size.

### Game server settings

| Setting                  | Value                                                                                                                                                                                     |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ingress                  | external, `targetPort` 2567, transport `http` (HTTP/1.1, upgraded to WebSocket; Express has no HTTP/2), HTTPS only                                                                        |
| Replicas                 | shard 0: min `gameServerMinReplicas` (1), max 1; shards 1 to N-1: min 0, max 1 (see [Scaling](#scaling))                                                                                  |
| Scale rule               | HTTP (traffic wakes a sleeping shard); `pollingInterval` 15 s, `cooldownPeriod` 300 s (scale-in 5 minutes after the last request)                                                         |
| CPU / memory             | 0.5 vCPU / 1 GiB by default (parameters)                                                                                                                                                  |
| Probes                   | startup, readiness and liveness: `GET /health` on 2567                                                                                                                                    |
| Routes for the pool      | `GET /shard` answers `{"shard": <index>, "shards": <count>}`; `GET /pool` answers `{"urls": [...], "awake": [...], "host": <index or -1>}` (where to host; `-1` when every shard is full) |
| `ALLOWED_ORIGINS`        | `https://<swa default hostname>` plus any `extraAllowedOrigins` (custom domain)                                                                                                           |
| `TRUST_PROXY`            | `true` (the Container Apps ingress adds `X-Forwarded-For`)                                                                                                                                |
| `SHARD_INDEX`            | this shard's index, `0` to `N-1`                                                                                                                                                          |
| `SHARD_COUNT`            | `N`, the pool size (`gameServerShards`)                                                                                                                                                   |
| `SHARD_URLS`             | every shard's `https://` URL in index order, comma-separated: `https://ca-isv-<env>-game-<i>.<environment default domain>` (computed in Bicep, checked by the deploy's smoke test)        |
| `SHARD_MAX_ROOMS`        | rooms per shard before hosting moves on (`gameServerMaxRooms`, 15)                                                                                                                        |
| `HISTORY_TABLE_NAME`     | `poolhistory`, every shard (only shard 0 writes it: the [ops dashboard](#ops-dashboard)'s history)                                                                                        |
| Ops dashboard            | shard 0 only, open and read-only (no login): `GET /admin`, `/admin/api/state`, `/admin/api/history`; the other shards answer 404 there (see [Ops dashboard](#ops-dashboard))              |
| `APP_VERSION`            | the image tag (the part after the last `:` of `gameServerImage`, the git short sha), every shard                                                                                          |
| `POOL_TABLE_NAME`        | `shards`                                                                                                                                                                                  |
| `PROFILE_STORE`          | `table`                                                                                                                                                                                   |
| `PROFILE_TABLE_ENDPOINT` | `https://<storage account>.table.core.windows.net`                                                                                                                                        |
| `PROFILE_TABLE_NAME`     | `profiles`                                                                                                                                                                                |
| `AZURE_CLIENT_ID`        | the client id of `id-isv-<env>-game`; the server authenticates to Table Storage as that identity                                                                                          |
| Revisions                | single revision mode; a new image means a new revision, and the old one gets `SIGTERM` (rooms send `closing { reason: 'shutdown' }`)                                                      |

### Express

The environment is a [Container Apps Express](https://learn.microsoft.com/en-us/azure/container-apps/express-overview) environment ([FAQ](https://learn.microsoft.com/en-us/azure/container-apps/express-faq); GA since 2026-09-23). Same resource types (`Microsoft.App/managedEnvironments`, `Microsoft.App/containerApps`), same Consumption billing; the environment gets `properties.environmentMode: 'Express'` (API version `2026-07-01`, the first GA version with it; the CLI's `az containerapp env create --environment-mode express`).

Why: a shard that is scaled to zero starts in under a second instead of ~10 to 20 s. Waking a sleeping shard becomes nearly instant, so the wake-ahead (shard 0 waking the next shard early) matters less, and `gameServerMinReplicas = 0` for shard 0 becomes reasonable (the first visitor barely waits). It stays 1 by default: a room whose players are all briefly away can still be lost if the replica scales in.

What we use, all supported on Express: the user-assigned managed identity (at runtime for Table Storage, and for pulling from the registry), the HTTP scale rule with min/max replicas and scale to zero, HTTP health probes, external HTTPS ingress on the default `azurecontainerapps.io` domain, Log Analytics (enabled for the environment), environment variables, single revision mode. Images must be `linux/amd64` (`deploy.sh` builds with `--platform linux/amd64`).

Not supported on Express, and not needed here: workload profiles (so the environment has no `workloadProfiles` and the apps no `workloadProfileName`), Azure Files, custom domains on the apps (the custom domain is on the Static Web App), session affinity, HTTP/2 (the ingress transport is `http`, HTTP/1.1, instead of `auto`), insecure ingress, sidecars and init containers, system-assigned identities. The scale settings `cooldownPeriod` and `pollingInterval` are kept: the Bicep types accept them and the docs don't exclude them, but Express applies its own scaling defaults, so the ~5 minute scale-in may differ there.

**The risk: WebSockets.** The Express docs list HTTP ingress but say nothing about WebSockets or long-lived connections, and the game is one long WebSocket per player. So the deploy ends with a real session over the WebSocket against shard 0 (`scripts/smokeOnline.ts`: host a room, get the `welcome`, keep the socket open for 5 s with a `ping` a second and their `pong`s, leave), which proves frames flow both ways, not just the upgrade. If it fails, the deploy fails and says so; we stay on Express and fix it there.

The shard URLs are still computed as `<app name>.<environment default domain>`; the deploy's `/pool` check catches it if Express names them differently.

## Files

```
infra/
  main.bicep                 resource group scope: everything above; outputs below
  main.bicepparam            parameters for env prod
  modules/
    monitoring.bicep         Log Analytics
    registry.bicep           ACR
    identity.bicep           the game servers' managed identity: AcrPull on the registry, Storage Table Data Contributor on the storage account
    storage.bicep            storage account (no shared keys) + tables `profiles`, `shards` and `poolhistory`
    containerEnv.bicep       Container Apps Express environment (outputs its default domain, for the shard URLs)
    gameServer.bicep         one Container App (one shard of the pool); shard 0 also serves the ops dashboard
    staticSite.bicep         Static Web App
  scripts/
    bootstrap.sh             once per subscription: resource group + GitHub OIDC app registration and role assignments
    deploy.sh                build and deploy everything (used locally and by the workflow)
  README.md                  how to bootstrap, deploy, roll back, read logs, costs
.github/workflows/deploy.yml manual (workflow_dispatch) only: azure/login with OIDC, then infra/scripts/deploy.sh
public/staticwebapp.config.json  cache headers for the static site
scripts/roomBench.ts         `npm run bench:rooms`: CPU per room and snapshot bytes, for capacity planning
scripts/smokeOnline.ts       WebSocket smoke test of one server: host a room, welcome, ping/pong for 5 s, leave (deploy step 7)
```

### `main.bicep` contract

Parameters: `env` (default `prod`), `location` (default the resource group's), `deployGameServer` (bool, default `true`), `gameServerImage` (string, the full image reference in the registry), `gameServerShards` (int, 1 to 8, default 8: the pool size, the most shards that can run; 1, 2, 3, 4, 6 or 8 spread rooms evenly), `gameServerMaxRooms` (int, default 15: rooms per shard, ~30 at 1 vCPU), `gameServerCpu` (string, `'0.5'`), `gameServerMemory` (string, `'1Gi'`), `gameServerMinReplicas` (int, 0 or 1, default 1, shard 0 only; the others are always 0), `extraAllowedOrigins` (array, default `[]`), `staticSiteLocation` (default `westeurope`; Static Web Apps only exists in a few regions).

Outputs: `registryName`, `registryLoginServer`, `staticSiteName`, `staticSiteUrl` (`https://…`), `gameServerUrls` (array of `https://…` FQDNs in shard order, read from the apps, empty when `deployGameServer` is false), `gameServerShards` (int, the pool size), `gameServerUrl` (shard 0, the front door, or `''`).

### `deploy.sh` steps

1. `az deployment group create` with `deployGameServer=false` (registry, storage and table, identity and its role assignments, environment and site exist; the running apps, if any, are untouched because the module is skipped). This first pass is needed because the image can't be pushed before the registry exists.
2. `az acr build --platform linux/amd64` the `Dockerfile` into `isv-simulator-server:<git sha>` (built in Azure; no local Docker needed; Express only runs amd64 images).
3. `az deployment group create` with `deployGameServer=true` and that image: every app of the pool (`--shards N` passes `gameServerShards`; without it the value in `main.bicepparam` is used).
4. `VITE_SERVER_URL=<gameServerUrls[0]> npm run build`: the game only knows the front door and reads the pool from its `/pool` at runtime. With `--skip-server` the pool size is shard 0's `SHARD_COUNT` and the URLs come from the existing apps (management plane only, nothing is woken).
5. Fetch the Static Web App deployment token with `az staticwebapp secrets list` and upload `dist/` with `npx @azure/static-web-apps-cli deploy --env production`.
6. Delete leftover game servers after the pool shrank: apps `ca-isv-<env>-game-<n>` with `n` ≥ the pool size (Bicep never deletes them). After the upload, so the old game in open browsers kept its shards until the new game was live.
7. Smoke test, on shard 0 only (a request to any other shard would wake it): `/health` answers `ok`, `/shard` answers index 0 of the pool size, and `/pool`'s `urls` equal `gameServerUrls` (catches a wrong computed `SHARD_URLS`); the [ops dashboard](#ops-dashboard) is open: `/admin/api/state` answers 200 without credentials, with `Cache-Control: no-store` and `poolSize` equal to `gameServerShards`, and `/admin` answers 200 with the HTML page; the site answers 200. Then `npx vite-node scripts/smokeOnline.ts <shard 0>`: a real session over the WebSocket (host a room, `welcome`, a `ping` a second for 5 s with their `pong`s, leave; 20 s at most). Its user id isn't a UUID v4, so no profile is written. When it fails, the deploy fails and says WebSockets didn't work on Express.

`deploy.sh --what-if` runs `az deployment group what-if` instead, lists the leftover game servers it would delete, and changes nothing.

## Scaling

### What limits one server

The server is one Node process: the event loop uses one core, whatever the container has. Every room runs its own sim at 60 ticks a second and sends a snapshot to every client 20 times a second. A process holds as many rooms as that one core can tick. Memory is small (a room is about 12 KB of heap; games share their level map).

`npm run bench:rooms` measures the cost of one 4-player room on this machine (sim ticks plus snapshot encoding) and the bytes per snapshot. It prints how many rooms fit in a 50%-busy core and the bandwidth per room. The numbers from this branch are in [Capacity](#capacity).

### Stage 1: one server (the default)

- One shard (`gameServerShards = 1`): one Container App, one replica, `minReplicas = maxReplicas = 1`. Rooms live in the process's memory, so a second replica behind the same ingress would break joining: the ingress would send a join to a replica that doesn't have the room.
- Grow vertically up to 1 vCPU (more cores don't help one Node process): set `gameServerCpu = '1.0'`, `gameServerMemory = '2Gi'`.
- `gameServerMinReplicas = 0` makes it scale to zero when nobody is connected (cheaper; the first visitor waits for a cold start, under a second on Express). It stays at 1 by default, because a room whose players are all briefly away (the 20 s reconnect grace) would be lost if the replica scaled in.

### Stage 2: an autoscaling pool of shards (built)

A fixed pool of `gameServerShards` Container Apps (`ca-isv-<env>-game-0` to `-<N-1>`, default 8), each with its own URL, at most one replica, the same image and the same settings. The pool size is the ceiling, not what runs: shard 0 is always on, the others sleep (scaled to zero) and start and stop by themselves as rooms come and go. No deploy is needed to add or remove a server.

How it works:

1. **Shard in the join code.** Each server gets `SHARD_INDEX` and `SHARD_COUNT` (the pool size) from Bicep and only makes join codes whose first letter maps to its own shard: the letter's index in the 24-letter join-code alphabet, mod `SHARD_COUNT`. 24 divides evenly by 1, 2, 3, 4, 6 and 8, so those sizes spread codes evenly; 5 or 7 work but give some shards one more letter than others.
2. **Pool entities.** Every awake shard writes its entity (its rooms and players, and the time) to the Table Storage table `shards` when its rooms or players change (at most once a second), plus a refresh every 30 s. A shard counts as awake when its entity was written in the last 90 s. Reads of the pool are cached for ~2 s. A crashed shard can look awake for up to 90 s; that's harmless, since a client that finds a shard unreachable falls over to the next one.
3. **Shard 0 is the front door.** The game is built with only shard 0's URL (`VITE_SERVER_URL`). To host, it asks `GET /pool` there: `{ "urls": [...], "awake": [...], "host": <index> }`. `host` is the lowest awake shard with a free room slot (fewer than `SHARD_MAX_ROOMS` rooms), so rooms are packed on the lowest shards and the higher ones drain and go back to sleep. When every shard is full, `host` is `-1` and the game says `serverFull`.
4. **Adding a shard.** Shard 0 watches the free room slots over the awake shards. When fewer than 5 are left (the wake-ahead headroom), it sends a request to the next sleeping shard's URL (from `SHARD_URLS`); the Container Apps HTTP scaler starts it, and it is warm by the time hosting needs it. Only if the wake-ahead is outrun does a host wait for a cold start (under a second on Express, so the wake-ahead matters little).
5. **Joining.** The code's first letter names the shard. A code of a sleeping shard can't have a room, so it is answered as a wrong code without waking that shard. Reconnects go back to the same URL.
6. **Removing a shard.** A shard with live rooms pings its own public URL every 60 s, so the HTTP scaler keeps seeing requests and doesn't scale it in under a game (the game itself is WebSocket messages on long-open connections). Once its last room closes (when everyone leaves, or 30 minutes after the last input), the pings stop, and after the scale rule's cooldown (`cooldownPeriod` 300 s, polled every 15 s) the replica goes to zero: about 5 minutes after the last room closed. Shard 0 stays on.
7. **One profile store for all.** Profiles are in Table Storage, one entity per user, so any shard can read and write any profile; a player's stars follow them whichever shard their room is on.

Capacity: the ceiling is pool size × `gameServerMaxRooms`. With the defaults that's 8 × 15 = **120 rooms, ~480 players** at 0.5 vCPU (see [Capacity](#capacity)); at 1 vCPU (`gameServerCpu = '1.0'`, `gameServerMemory = '2Gi'`) with `gameServerMaxRooms = 30` it is double, 240 rooms. Those three, and the pool size, are what still needs a deploy.

When the pool size changes (`deploy.sh --shards N`, the **shards** input of the Deploy workflow, or `gameServerShards` in `main.bicepparam` to keep it):

- Which shard owns which first letter changes, so every code means something else. That's fine: a deploy restarts every server and drops live rooms anyway (players see the server restarting), and new codes are made for the new size.
- The game itself doesn't change (it only knows shard 0); it reads the new pool from `/pool`.
- Going down: `deploy.sh` deletes the apps of shards past the new size after the new game is uploaded.

Shard 0 is the single point for hosting and joining lookups (`/pool`) and, like every shard, reads and writes profiles. If it is down, nobody can host until it is back; rooms already on other shards carry on. A higher shard being down only affects its own rooms: its entity stops being refreshed, so hosting skips it after at most 90 s (until then a client that can't reach it falls over to the next shard).

Why a pre-made pool and not creating Container Apps on the fly: the server would need write rights on the resource group (a game process that can create and delete resources), and creating an app takes 30 to 60 s, far longer than waking a sleeping one. A sleeping app costs nothing on the Consumption profile, so the pool is free until it's used.

Why shards and not Colyseus's Redis presence with several replicas behind one URL: a room lives in one process, so every WebSocket must reach that process. Colyseus does that by giving each process its own public address. Container Apps replicas behind one ingress can't be addressed one by one, and sticky sessions there are cookie-based, which cross-origin WebSockets can't rely on. A shard per Container App gives each process its own address with no extra parts (no Redis to pay for or run).

### Stage 3 (only if it's ever a public game)

Dedicated game-server hosting (AKS with Agones, or PlayFab Multiplayer Servers) with a matchmaker. Far beyond an internal game; not planned.

### Capacity

`npm run bench:rooms` (defaults: every campaign level, 60 s each, 50 rooms for the memory). It runs the real room logic as `GameRoom.ts` does, without sockets: four members with one player each, every player a bot (`src/sim/bot.ts`) sending one `inputs` message per tick. Timed: the input messages plus `stepRoom` (flow, sim, snapshot building), and encoding each snapshot the way Colyseus does (msgpack, once per broadcast; the same bytes go to all four clients). The server sends msgpack without permessage-deflate (the Colyseus WebSocket transport's default); deflate is listed for reference.

Ran on an Azure VM: 4 vCPU Arm Neoverse-N2 (Cobalt 100), Node v24.22.2.

| Per 4-player room                     | Measured                                      |
| ------------------------------------- | --------------------------------------------- |
| Tick (inputs + `stepRoom`)            | 43 µs mean, 137 µs p99                        |
| Snapshot encode (msgpack)             | 56 µs mean, 123 µs p99                        |
| CPU                                   | 3.7 ms per second of game time (0.37% core)   |
| Rooms per core at 50% busy            | ~134                                          |
| Snapshot size                         | 2.8 KB msgpack (3.8 KB JSON); 1.3 KB deflated |
| Outbound (4 clients × 20 snapshots/s) | ~227 KB/s (1.9 Mbit/s); ~100 KB/s deflated    |
| Heap per room (mid-round)             | ~11 to 13 KB (levels' maps are shared)        |

What the bench leaves out: the socket writes (80 a second per room), decoding the clients' 240 messages a second, and Colyseus's own work. Count those as about as much again. Container Apps vCPUs are also often slower than a dev machine: halve the numbers as a rule of thumb. Memory is not the limit (sockets and Colyseus add some tens of KB per client; the 1 GiB default is plenty).

So, for planning:

- **1 vCPU shard:** 134 halved for a slower vCPU, halved again for the network work: **~30 rooms, ~120 players** at once, with the core half idle.
- **0.5 vCPU shard** (the default): half that, **~15 rooms, ~60 players**.
- Bandwidth at 30 rooms: ~7 MB/s (~55 Mbit/s) outbound; one room uses ~800 MB of egress per hour played (the first 100 GB a month are free).

An internal company game has a handful of rooms at a time, so shard 0 at 0.5 vCPU holds it with a lot of room to spare, and the other shards of the pool only wake for a busy day. Go to 1 vCPU (and `gameServerMaxRooms = 30`) only if more than the pool's 120 rooms (~480 players) ever play at once.

## Costs (rough, West Europe, pay-as-you-go)

| Part                                               | Per month                                       |
| -------------------------------------------------- | ----------------------------------------------- |
| Shard 0: Container App 0.5 vCPU / 1 GiB, always on | ~€30 (the monthly free grant covers part of it) |
| Shard 0 at 1 vCPU / 2 GiB                          | ~€60                                            |
| Every other shard of the pool, while awake         | ~€0.05 an hour at 0.5 vCPU; €0 while asleep     |
| Container registry Basic                           | ~€5                                             |
| Storage (small tables, pool and history writes)    | < €1 (see below)                                |
| Log Analytics (a few hundred MB)                   | ~€1 to €3                                       |
| Static Web Apps Free                               | €0                                              |

Table writes for the pool: worst case, all 8 shards awake 24/7, a refresh every 30 s is 8 × 2 × 60 × 24 × 30 ≈ 0.7 million writes a month, plus one per change (at most one a second per shard, only while rooms change). At Table Storage's price per 10,000 transactions that is cents. The [ops dashboard](#ops-dashboard)'s history adds one snapshot a minute from shard 0 (60 × 24 × 30 ≈ 44,000 writes a month) plus a few events: cents too.

The Express environment bills the same as Consumption (per second, same free grant; no environment fee).

So the pool costs about one shard when the game is quiet, and more only while extra shards are awake (each stays up ~5 minutes after its last room). Scale-to-zero for shard 0 too (`gameServerMinReplicas = 0`) brings the servers to near €0 when nobody plays, at the cost of a cold start for the first visitor.

## Security

- Deploys log in with GitHub OIDC (a federated credential on an app registration): no client secret in GitHub. The app registration has Contributor and Role Based Access Control Administrator (limited to granting AcrPull and Storage Table Data Contributor) on the one resource group only.
- One user-assigned managed identity for all shards, with two roles: AcrPull on the registry (the registry has no admin user) and Storage Table Data Contributor on the storage account. No passwords, keys or connection strings anywhere.
- The storage account: HTTPS only, TLS 1.2, no public blob access, shared-key access off (everything uses Entra ID: the servers their identity, people `--auth-mode login`).
- The ops dashboard on shard 0 (`/admin`) is open, with no login, on purpose: it is read-only and used for demos. It shows nothing that lets anyone into a room or identifies anyone: join codes are masked (`AB••`) and there are no user ids, names or IPs. It only answers GET, sends `Cache-Control: no-store` and a strict Content-Security-Policy, and has no CORS headers. Its reads are cached (the pool 2 s, the history 10 s per range), so many viewers don't add table reads. The other shards answer 404 for `/admin`.
- The server already validates every message, rate-limits by IP (`TRUST_PROXY=true` makes that the real client IP) and only answers the game's origin (`ALLOWED_ORIGINS`). Anyone with a join code can join, as before.

## Ops dashboard

An operations page for the pool, served by shard 0 itself (no extra resource): `https://<shard 0>/admin`.

- **Access:** open and read-only, no login, public on purpose (it's used for demos). Join codes are masked (`AB••`) and there are no user ids, names or IPs, so nothing on it lets anyone into a room. Only shard 0 serves it; the other shards answer 404 for `/admin` paths.
- **Routes (shard 0):** `/admin` (the page), `/admin/api/state` (the live state as JSON), `/admin/api/history?range=1h|24h|7d`.
- **What it shows:** a grid of the pool's shards with each one's live load, CPU, memory, event-loop delay and rooms; the pool totals; which shard hosts next and which shards are being woken; history charts over 1 h, 24 h and 7 days; an event log (shards waking and sleeping, the pool full, and so on). Every shard reports `APP_VERSION` (the image tag).
- **Freshness:** shard 0's own numbers are live; the other shards' come from their pool entities in the table `shards`, so they are up to 30 s old (the heartbeat refresh). Sleeping shards are shown as asleep; the dashboard never wakes them.
- **History:** in the table `poolhistory` (`HISTORY_TABLE_NAME`, set on every shard; the identity's Storage Table Data Contributor on the account covers it). Only shard 0 writes it: a snapshot of the pool a minute plus events, kept 14 days. So while shard 0 is asleep (`gameServerMinReplicas = 0`) there is no history for that time; that's fine, since a sleeping shard 0 means nobody plays.
- **Cost:** ~44,000 snapshot writes a month (one a minute) plus the events: cents. Reads are cached (the pool 2 s, the history 10 s per range), so many viewers don't add table reads.

## Deploying

Not done in this step. When it's time:

1. `infra/scripts/bootstrap.sh` once (needs Owner on the subscription), then set the printed GitHub variables `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID`.
2. Run the **Deploy** workflow by hand (Actions → Deploy → Run workflow), or `infra/scripts/deploy.sh` from a machine logged in with `az login`.

## Done when

- [x] `infra/` Bicep builds (`az bicep build`) and lints without warnings
- [x] `deploy.sh`, `bootstrap.sh` pass `bash -n` and shellcheck
- [x] The deploy workflow only runs on `workflow_dispatch`
- [x] `npm run bench:rooms` runs and its numbers are in [Capacity](#capacity)
- [x] `npm run check`, `npm run format:check` and `npm run build` pass
- [x] Nothing deployed

Stage 2 (shards; the fixed shard count, `VITE_SERVER_URLS` and the every-shard smoke test were later replaced by the autoscaling pool, Stage 2b):

- [x] `gameServerShards` goes from 1 to 8; every shard gets `SHARD_INDEX`, `SHARD_COUNT` and the Table Storage settings
- [x] Profiles in Table Storage with the managed identity (Storage Table Data Contributor); no file share, shared-key access off
- [x] `bootstrap.sh` lets the deploy assign AcrPull and Storage Table Data Contributor, and replaces an assignment with the older condition
- [x] `deploy.sh --shards N` builds the game with `VITE_SERVER_URLS`, smoke tests `/health` and `/shard` on every shard, and deletes leftover shards after a scale-down (`--what-if` lists them)
- [x] The Deploy workflow has a **shards** input
- [x] Bicep builds and lints without warnings with 1 and with 3 shards; shellcheck and actionlint pass
- [x] Each server hands out only codes of its own shard (`SHARD_INDEX`/`SHARD_COUNT`) and answers `GET /shard`; tested with a server as shard 2 of 3
- [x] The client joins a code at its shard, hosts on a random shard and moves on to the next when one is unreachable, and a reloaded page rejoins at the right shard
- [x] `TableProfileStore` (ETag retries, shared merge rules) is tested with a fake table and was checked by hand against Azurite with two stores racing
- [x] Nothing deployed

Stage 2b (autoscaling pool):

- [ ] `gameServerShards` is the pool size (default 8); shard 0 has `gameServerMinReplicas`, shards 1 to N-1 have min 0, max 1; the HTTP scale rule has `cooldownPeriod` 300 and `pollingInterval` 15
- [ ] Every shard gets `SHARD_URLS` (computed from the app names and the environment's default domain), `SHARD_MAX_ROOMS` (`gameServerMaxRooms`, 15) and `POOL_TABLE_NAME=shards`; the table `shards` exists next to `profiles`
- [ ] `deploy.sh` builds the game with only `VITE_SERVER_URL` (shard 0) and smoke tests shard 0 only: `/health`, `/shard`, and `/pool`'s urls equal `gameServerUrls`
- [ ] Awake shards write their pool entity (rooms, players) to `shards` when it changes (at most once a second) and every 30 s, and count as awake for 90 s after a write; `GET /pool` packs rooms on the lowest shard with a free slot and answers `host: -1` (`serverFull`) when all are full
- [ ] Shard 0 wakes the next shard when fewer than 5 room slots are free; a sleeping shard's codes are answered as wrong without waking it
- [ ] A shard with live rooms pings its own URL every 60 s and scales in ~5 minutes after its last room closes
- [ ] Bicep builds and lints without warnings with 1, 3 and 8 shards; shellcheck and actionlint pass
- [ ] Nothing deployed

Ops dashboard:

- [ ] The dashboard is open and read-only on shard 0 (no login, no token or secret in the infrastructure); the other shards answer 404 for `/admin`
- [ ] Every shard gets `APP_VERSION` (the image tag) and `HISTORY_TABLE_NAME=poolhistory`; the table `poolhistory` exists next to `profiles` and `shards`
- [ ] The end of `deploy.sh` prints the dashboard URL (`<shard 0>/admin`)
- [ ] The smoke test checks shard 0 without credentials: `/admin/api/state` answers 200 with `Cache-Control: no-store` and `poolSize` equal to `gameServerShards`, and `/admin` answers 200 with HTML
- [ ] `/admin` shows masked join codes and no user ids, names or IPs; it shows the shard grid (load, CPU, memory, event-loop delay, rooms), the pool totals, the next host and the shards being woken, history charts (1 h, 24 h, 7 d) and the event log
- [ ] Bicep builds and lints without warnings; shellcheck passes
- [ ] Nothing deployed

Express:

- [ ] The environment is Express (`environmentMode: 'Express'`, API `2026-07-01`) with no workload profiles; there is no standard-environment option
- [ ] Bicep builds and lints without warnings; shellcheck passes
- [ ] `deploy.sh` builds the image with `--platform linux/amd64` and ends with `scripts/smokeOnline.ts` against shard 0, and fails the deploy when it fails
- [ ] `scripts/smokeOnline.ts` passes against a local server (welcome, pings answered, leave) and fails with a clear message when the server is unreachable
- [ ] WebSockets work on an Express shard (the deploy's smoke test passes)
- [ ] Nothing deployed
