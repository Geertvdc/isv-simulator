# Hosting on Azure

How the browser game and the online game server run on Azure, as infrastructure as code. This step writes the code only; nothing is deployed until someone runs the deploy (see [Deploying](#deploying)).

## Goal

- The browser game (static files from `npm run build`) on a public HTTPS URL.
- The game server (`server/`, the `Dockerfile`) on public `wss://` URLs, one per shard, that the game finds through `VITE_SERVER_URLS`.
- Online profiles that survive restarts and new versions.
- One command (or one manual GitHub Actions run) that builds and deploys both, the same every time.
- A path to more servers when one isn't enough, without changing the infrastructure design.

## Architecture

```
                 browser
       ┌────────────┴─────────────┐
       │ https                    │ https + wss (Colyseus), to the shard of the join code
       ▼                          ▼
 Azure Static Web Apps     Azure Container Apps (environment, Consumption)
 (Free): dist/             ├─ ca-isv-<env>-game-0      (1 replica each, the Dockerfile image)
                           ├─ ca-isv-<env>-game-1 …
                           └─ ca-isv-<env>-game-<N-1>
                                │  profiles → Azure Table Storage, table "profiles"
                                │  logs → Log Analytics
                                └─ image ← Azure Container Registry (Basic)
                              one user-assigned managed identity for all shards:
                              AcrPull + Storage Table Data Contributor
```

All in one resource group per environment (`rg-isv-simulator-<env>`, default env `prod`, region `westeurope`).

| Resource                       | Name (env `prod`)      | Why                                                                                                      |
| ------------------------------ | ---------------------- | -------------------------------------------------------------------------------------------------------- |
| Log Analytics workspace        | `log-isv-prod`         | Container logs, 30 days                                                                                  |
| Container registry (Basic)     | `crisvprod<suffix>`    | The server image; admin user off                                                                         |
| User-assigned managed identity | `id-isv-prod-game`     | Pulls from the registry (AcrPull) and reads/writes profiles (Storage Table Data Contributor); no secrets |
| Storage account (Standard LRS) | `stisvprod<suffix>`    | Table Storage table `profiles` (one entity per user); shared-key access off                              |
| Container Apps environment     | `cae-isv-prod`         | Consumption profile                                                                                      |
| Container App, per shard       | `ca-isv-prod-game-<n>` | The game server: external ingress, port 2567, WebSockets, probes on `/health`, 1 replica                 |
| Static Web App (Free)          | `swa-isv-prod`         | The browser game                                                                                         |

`<suffix>` is `uniqueString(resourceGroup().id)`, cut short, so the global names don't collide.

### Why these services

- **Container Apps** runs the existing `Dockerfile` as is, terminates TLS, allows WebSocket upgrades, restarts on failed health checks, and bills per second. App Service would work too, but it costs more for one small always-on container. AKS is too much to run for an internal game.
- **Static Web Apps (Free)** serves the static build from a global CDN with HTTPS and custom domains, for free. A storage static website plus Front Door costs more and takes more parts.
- **Azure Table Storage** holds the profiles, one entity per user, for every deployment (even one shard). Several processes can write it at once, which a single `profiles.json` on a file share can't take, and the servers reach it with their managed identity, so the storage account needs no keys at all. It costs next to nothing at this size.

### Game server settings

| Setting                  | Value                                                                                                                                              |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ingress                  | external, `targetPort` 2567, transport `auto` (HTTP/1.1 upgrade to WebSocket), HTTPS only                                                          |
| Replicas                 | min 1, max 1 per shard (see [Scaling](#scaling))                                                                                                   |
| CPU / memory             | 0.5 vCPU / 1 GiB by default (parameters)                                                                                                           |
| Probes                   | startup, readiness and liveness: `GET /health` on 2567 (`GET /shard` answers `{"shard": <index>, "shards": <count>}`, for the deploy's smoke test) |
| `ALLOWED_ORIGINS`        | `https://<swa default hostname>` plus any `extraAllowedOrigins` (custom domain)                                                                    |
| `TRUST_PROXY`            | `true` (the Container Apps ingress adds `X-Forwarded-For`)                                                                                         |
| `SHARD_INDEX`            | this shard's index, `0` to `N-1`                                                                                                                   |
| `SHARD_COUNT`            | `N` (`gameServerShards`)                                                                                                                           |
| `PROFILE_STORE`          | `table`                                                                                                                                            |
| `PROFILE_TABLE_ENDPOINT` | `https://<storage account>.table.core.windows.net`                                                                                                 |
| `PROFILE_TABLE_NAME`     | `profiles`                                                                                                                                         |
| `AZURE_CLIENT_ID`        | the client id of `id-isv-<env>-game`; the server authenticates to Table Storage as that identity                                                   |
| Revisions                | single revision mode; a new image means a new revision, and the old one gets `SIGTERM` (rooms send `closing { reason: 'shutdown' }`)               |

## Files

```
infra/
  main.bicep                 resource group scope: everything above; outputs below
  main.bicepparam            parameters for env prod
  modules/
    monitoring.bicep         Log Analytics
    registry.bicep           ACR
    identity.bicep           the game servers' managed identity: AcrPull on the registry, Storage Table Data Contributor on the storage account
    storage.bicep            storage account (no shared keys) + table `profiles`
    containerEnv.bicep       Container Apps environment
    gameServer.bicep         one Container App (one shard)
    staticSite.bicep         Static Web App
  scripts/
    bootstrap.sh             once per subscription: resource group + GitHub OIDC app registration and role assignments
    deploy.sh                build and deploy everything (used locally and by the workflow)
  README.md                  how to bootstrap, deploy, roll back, read logs, costs
.github/workflows/deploy.yml manual (workflow_dispatch) only: azure/login with OIDC, then infra/scripts/deploy.sh
public/staticwebapp.config.json  cache headers for the static site
scripts/roomBench.ts         `npm run bench:rooms`: CPU per room and snapshot bytes, for capacity planning
```

### `main.bicep` contract

Parameters: `env` (default `prod`), `location` (default the resource group's), `deployGameServer` (bool, default `true`), `gameServerImage` (string, the full image reference in the registry), `gameServerShards` (int, 1 to 8, default 1; 1, 2, 3, 4, 6 or 8 spread rooms evenly), `gameServerCpu` (string, `'0.5'`), `gameServerMemory` (string, `'1Gi'`), `gameServerMinReplicas` (int, 0 or 1, default 1), `extraAllowedOrigins` (array, default `[]`), `staticSiteLocation` (default `westeurope`; Static Web Apps only exists in a few regions).

Outputs: `registryName`, `registryLoginServer`, `staticSiteName`, `staticSiteUrl` (`https://…`), `gameServerUrls` (array of `https://…` FQDNs in shard order, empty when `deployGameServer` is false), `gameServerShards` (int), `gameServerUrl` (the first, or `''`).

### `deploy.sh` steps

1. `az deployment group create` with `deployGameServer=false` (registry, storage and table, identity and its role assignments, environment and site exist; the running apps, if any, are untouched because the module is skipped). This first pass is needed because the image can't be pushed before the registry exists.
2. `az acr build` the `Dockerfile` into `isv-simulator-server:<git sha>` (built in Azure; no local Docker needed).
3. `az deployment group create` with `deployGameServer=true` and that image (`--shards N` passes `gameServerShards`; without it the value in `main.bicepparam` is used).
4. `VITE_SERVER_URLS=<gameServerUrls, comma-separated> npm run build`. With `--skip-server` the URLs come from the existing apps `ca-isv-<env>-game-0`, `-1`, … in order, up to the first one missing.
5. Fetch the Static Web App deployment token with `az staticwebapp secrets list` and upload `dist/` with `npx @azure/static-web-apps-cli deploy --env production`.
6. Delete leftover game servers from a scale-down: apps `ca-isv-<env>-game-<n>` with `n` ≥ the shard count (Bicep never deletes them). After the upload, so the old game in open browsers kept its shards until the new game was live.
7. Smoke test: for every shard, `curl <url>/health` answers `ok` and `<url>/shard` answers its own index and the shard count; the site answers 200.

`deploy.sh --what-if` runs `az deployment group what-if` instead, lists the leftover game servers it would delete, and changes nothing.

## Scaling

### What limits one server

The server is one Node process: the event loop uses one core, whatever the container has. Every room runs its own sim at 60 ticks a second and sends a snapshot to every client 20 times a second. A process holds as many rooms as that one core can tick. Memory is small (a room is about 12 KB of heap; games share their level map).

`npm run bench:rooms` measures the cost of one 4-player room on this machine (sim ticks plus snapshot encoding) and the bytes per snapshot. It prints how many rooms fit in a 50%-busy core and the bandwidth per room. The numbers from this branch are in [Capacity](#capacity).

### Stage 1: one server (the default)

- One shard: one Container App, one replica, `minReplicas = maxReplicas = 1`. Rooms live in the process's memory, so a second replica behind the same ingress would break joining: the ingress would send a join to a replica that doesn't have the room.
- Grow vertically up to 1 vCPU (more cores don't help one Node process): set `gameServerCpu = '1.0'`, `gameServerMemory = '2Gi'`.
- `gameServerMinReplicas = 0` makes it scale to zero when nobody is connected (cheaper; the first visitor waits for a cold start of ~10 to 20 s). It stays at 1 by default, because a room whose players are all briefly away (the 20 s reconnect grace) would be lost if the replica scaled in.

### Stage 2: shards (built)

Each shard is a separate Container App (`ca-isv-<env>-game-<n>`) with its own URL, one replica, the same image and the same settings. `gameServerShards` (1 to 8) sets how many.

How it works:

1. **Shard in the join code.** Each server gets `SHARD_INDEX` and `SHARD_COUNT` from Bicep and only makes join codes whose first letter maps to its own shard: the letter's index in the 24-letter join-code alphabet, mod `SHARD_COUNT`. 24 divides evenly by 1, 2, 3, 4, 6 and 8, so those counts spread rooms evenly; 5 or 7 work but give some shards one more letter than others.
2. **The client knows every shard.** The build gets `VITE_SERVER_URLS` (the `gameServerUrls` output, comma-separated, URL `i` is shard `i`). Joining goes to the shard named by the code's first letter; hosting picks a shard. Reconnects already go back to the same URL.
3. **One profile store for all.** Profiles are in Table Storage, one entity per user, so any shard can read and write any profile; a player's stars follow them whichever shard their room is on.

When to add shards: past what one 1 vCPU shard holds, **~30 rooms (~120 players) at once** (see [Capacity](#capacity)). Before that, go from 0.5 to 1 vCPU (~15 to ~30 rooms). Each shard adds the same again: 4 shards at 1 vCPU hold ~120 rooms, 8 hold ~240. With `deploy.sh --shards N` or the **shards** input of the Deploy workflow for one deploy; set `gameServerShards` in `main.bicepparam` to keep it, since a deploy without `--shards` uses that value.

When the shard count changes:

- Which shard owns which first letter changes, so every code means something else. That's fine: a deploy restarts every server and drops live rooms anyway (players see the server restarting), and new codes are made for the new count.
- The new game is built with the new URL list. Browsers that still have the old game open keep using the old list until they reload.
- Going down: `deploy.sh` deletes the apps of shards past the new count after the new game is uploaded.

A shard being down only affects its own rooms: hosting skips it and uses another, and joining a code of that shard fails until it is back. The other shards and their rooms carry on.

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

An internal company game has a handful of rooms at a time, so one shard at 0.5 vCPU holds it with a lot of room to spare. Go to 1 vCPU when more than ~15 rooms play at once regularly, and to more shards only past ~30 rooms (~120 players) at the same time.

## Costs (rough, West Europe, pay-as-you-go)

| Part                                                 | Per month                                              |
| ---------------------------------------------------- | ------------------------------------------------------ |
| Per shard: Container App 0.5 vCPU / 1 GiB, always on | ~€30 (the monthly free grant covers part of the first) |
| Per shard: Container App at 1 vCPU / 2 GiB           | ~€60                                                   |
| Container registry Basic                             | ~€5                                                    |
| Storage (a small table)                              | < €1                                                   |
| Log Analytics (a few hundred MB)                     | ~€1 to €3                                              |
| Static Web Apps Free                                 | €0                                                     |

So N shards cost about N times the server line. Scale-to-zero (`gameServerMinReplicas = 0`) brings each shard to near €0 when nobody plays on it.

## Security

- Deploys log in with GitHub OIDC (a federated credential on an app registration): no client secret in GitHub. The app registration has Contributor and Role Based Access Control Administrator (limited to granting AcrPull and Storage Table Data Contributor) on the one resource group only.
- One user-assigned managed identity for all shards, with two roles: AcrPull on the registry (the registry has no admin user) and Storage Table Data Contributor on the storage account. No passwords, keys or connection strings anywhere.
- The storage account: HTTPS only, TLS 1.2, no public blob access, shared-key access off (everything uses Entra ID: the servers their identity, people `--auth-mode login`).
- The server already validates every message, rate-limits by IP (`TRUST_PROXY=true` makes that the real client IP) and only answers the game's origin (`ALLOWED_ORIGINS`). Anyone with a join code can join, as before.

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

Stage 2 (shards):

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
