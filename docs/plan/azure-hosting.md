# Hosting on Azure

How the browser game and the online game server run on Azure, as infrastructure as code. This step writes the code only; nothing is deployed until someone runs the deploy (see [Deploying](#deploying)).

## Goal

- The browser game (static files from `npm run build`) on a public HTTPS URL.
- The game server (`server/`, the `Dockerfile`) on a public `wss://` URL that the game finds through `VITE_SERVER_URL`.
- Online profiles that survive restarts and new versions.
- One command (or one manual GitHub Actions run) that builds and deploys both, the same every time.
- A path to more servers when one isn't enough, without changing the infrastructure design.

## Architecture

```
                 browser
       ┌────────────┴─────────────┐
       │ https                    │ https + wss (Colyseus)
       ▼                          ▼
 Azure Static Web Apps     Azure Container Apps (environment, Consumption)
 (Free): dist/             └─ ca-isv-<env>-game-0  (1 replica, the Dockerfile image)
                                │  /app/server/data  ← Azure Files share "profiles"
                                │  logs → Log Analytics
                                └─ image ← Azure Container Registry (Basic), pulled
                                           with a user-assigned managed identity (AcrPull)
```

All in one resource group per environment (`rg-isv-simulator-<env>`, default env `prod`, region `westeurope`).

| Resource                       | Name (env `prod`)      | Why                                                                                      |
| ------------------------------ | ---------------------- | ---------------------------------------------------------------------------------------- |
| Log Analytics workspace        | `log-isv-prod`         | Container logs, 30 days                                                                  |
| Container registry (Basic)     | `crisvprod<suffix>`    | The server image; admin user off                                                         |
| User-assigned managed identity | `id-isv-prod-game`     | Pulls from the registry (AcrPull); no secrets for images                                 |
| Storage account (Standard LRS) | `stisvprod<suffix>`    | Azure Files share `profiles` (1 GiB quota) for `profiles.json`                           |
| Container Apps environment     | `cae-isv-prod`         | Consumption profile; the share is linked as environment storage `profiles`               |
| Container App, per shard       | `ca-isv-prod-game-<n>` | The game server: external ingress, port 2567, WebSockets, probes on `/health`, 1 replica |
| Static Web App (Free)          | `swa-isv-prod`         | The browser game                                                                         |

`<suffix>` is `uniqueString(resourceGroup().id)`, cut short, so the global names don't collide.

### Why these services

- **Container Apps** runs the existing `Dockerfile` as is, terminates TLS, allows WebSocket upgrades, restarts on failed health checks, and bills per second. App Service would work too, but it costs more for one small always-on container. AKS is too much to run for an internal game.
- **Static Web Apps (Free)** serves the static build from a global CDN with HTTPS and custom domains, for free. A storage static website plus Front Door costs more and takes more parts.
- **Azure Files** holds the single `profiles.json` that `JsonFileProfileStore` already writes (temp file + rename). No code change. The mount runs as uid/gid 1000 (the image's `node` user).

### Game server settings

| Setting              | Value                                                                                                                                |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Ingress              | external, `targetPort` 2567, transport `auto` (HTTP/1.1 upgrade to WebSocket), HTTPS only                                            |
| Replicas             | min 1, max 1 per shard (see [Scaling](#scaling))                                                                                     |
| CPU / memory         | 0.5 vCPU / 1 GiB by default (parameters)                                                                                             |
| Probes               | startup, readiness and liveness: `GET /health` on 2567                                                                               |
| `ALLOWED_ORIGINS`    | `https://<swa default hostname>` plus any `extraAllowedOrigins` (custom domain)                                                      |
| `TRUST_PROXY`        | `true` (the Container Apps ingress adds `X-Forwarded-For`)                                                                           |
| `PROFILE_STORE_PATH` | `/app/server/data/profiles.json` (the Azure Files mount)                                                                             |
| Revisions            | single revision mode; a new image means a new revision, and the old one gets `SIGTERM` (rooms send `closing { reason: 'shutdown' }`) |

## Files

```
infra/
  main.bicep                 resource group scope: everything above; outputs below
  main.bicepparam            parameters for env prod
  modules/
    monitoring.bicep         Log Analytics
    registry.bicep           ACR + managed identity + AcrPull role assignment
    storage.bicep            storage account + file share
    containerEnv.bicep       Container Apps environment + linked storage
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

Parameters: `env` (default `prod`), `location` (default the resource group's), `deployGameServer` (bool, default `true`), `gameServerImage` (string, the full image reference in the registry), `gameServerShards` (int, 1 to 1 for now), `gameServerCpu` (string, `'0.5'`), `gameServerMemory` (string, `'1Gi'`), `gameServerMinReplicas` (int, 0 or 1, default 1), `extraAllowedOrigins` (array, default `[]`), `staticSiteLocation` (default `westeurope`; Static Web Apps only exists in a few regions).

Outputs: `registryName`, `registryLoginServer`, `staticSiteName`, `staticSiteUrl` (`https://…`), `gameServerUrls` (array of `https://…` FQDNs, empty when `deployGameServer` is false), `gameServerUrl` (the first, or `''`).

### `deploy.sh` steps

1. `az deployment group create` with `deployGameServer=false` (registry, storage, environment and site exist; the running app, if any, is untouched because the module is skipped). This first pass is needed because the image can't be pushed before the registry exists.
2. `az acr build` the `Dockerfile` into `isv-simulator-server:<git sha>` (built in Azure; no local Docker needed).
3. `az deployment group create` with `deployGameServer=true` and that image.
4. `VITE_SERVER_URL=<gameServerUrl> npm run build`.
5. Fetch the Static Web App deployment token with `az staticwebapp secrets list` and upload `dist/` with `npx @azure/static-web-apps-cli deploy --env production`.
6. Smoke test: `curl <gameServerUrl>/health` answers `ok`, and the site answers 200.

`deploy.sh --what-if` runs `az deployment group what-if` instead and changes nothing.

## Scaling

### What limits one server

The server is one Node process: the event loop uses one core, whatever the container has. Every room runs its own sim at 60 ticks a second and sends a snapshot to every client 20 times a second. A process holds as many rooms as that one core can tick. Memory is small (a room is a few hundred KB of state).

`npm run bench:rooms` measures the cost of one 4-player room on this machine (sim ticks plus snapshot encoding) and the bytes per snapshot. It prints how many rooms fit in a 50%-busy core and the bandwidth per room. The numbers from this branch are in [Capacity](#capacity).

### Stage 1: one server (now)

- One Container App, one replica, `minReplicas = maxReplicas = 1`. Rooms live in the process's memory and join codes are unique per process, so a second replica behind the same ingress would break joining: the ingress would send a join to a replica that doesn't have the room.
- Grow vertically up to 1 vCPU (more cores don't help one Node process): set `gameServerCpu = '1.0'`, `gameServerMemory = '2Gi'`.
- `gameServerMinReplicas = 0` makes it scale to zero when nobody is connected (cheaper; the first visitor waits for a cold start of ~10 to 20 s). It stays at 1 by default, because a room whose players are all briefly away (the 20 s reconnect grace) would be lost if the replica scaled in.

### Stage 2: shards (when one core isn't enough)

Each shard is a separate Container App with its own URL, one replica, the same image. The infrastructure already loops over `gameServerShards`; the parameter is capped at 1 until these app changes are done (a later phase, not built here):

1. **Shard in the join code.** The server learns its shard index (`SHARD_INDEX`, `SHARD_COUNT` env vars, set by Bicep) and makes codes whose first letter maps to its shard (`code[0]` index in the join-code alphabet mod `SHARD_COUNT`). The client gets the shard URLs (`VITE_SERVER_URLS`, comma-separated, from the `gameServerUrls` output) and joins at the shard named by the code, and hosts on a random (or least-busy, from a `GET /load` route) shard. Reconnects already go to the same URL.
2. **Shared profile store.** One JSON file on a share can't take writers from several processes. Add a `TableProfileStore` (Azure Table Storage in the same storage account, one entity per user, ETag optimistic concurrency for the merge), chosen by `PROFILE_STORE=table` and reached with the managed identity (Storage Table Data Contributor).
3. **Bicep:** raise the `gameServerShards` cap; add `SHARD_INDEX`/`SHARD_COUNT` and the table settings; add the role assignment. Each shard stays `minReplicas = maxReplicas = 1`.

Why shards and not Colyseus's Redis presence with several replicas behind one URL: a room lives in one process, so every WebSocket must reach that process. Colyseus does that by giving each process its own public address. Container Apps replicas behind one ingress can't be addressed one by one, and sticky sessions there are cookie-based, which cross-origin WebSockets can't rely on. A shard per Container App gives each process its own address with no extra parts (no Redis to pay for or run).

### Stage 3 (only if it's ever a public game)

Dedicated game-server hosting (AKS with Agones, or PlayFab Multiplayer Servers) with a matchmaker. Far beyond an internal game; not planned.

### Capacity

See the numbers from `npm run bench:rooms` below (filled in on this branch).

<!-- capacity -->

## Costs (rough, West Europe, pay-as-you-go)

| Part                                      | Per month                          |
| ----------------------------------------- | ---------------------------------- |
| Container App 0.5 vCPU / 1 GiB, always on | ~€30 (less the monthly free grant) |
| Container App at 1 vCPU / 2 GiB           | ~€60                               |
| Container registry Basic                  | ~€5                                |
| Storage (a small file share)              | < €1                               |
| Log Analytics (a few hundred MB)          | ~€1 to €3                          |
| Static Web Apps Free                      | €0                                 |

Scale-to-zero (`gameServerMinReplicas = 0`) brings the server to near €0 when nobody plays.

## Security

- Deploys log in with GitHub OIDC (a federated credential on an app registration): no client secret in GitHub. The app registration has Contributor and Role Based Access Control Administrator (limited to granting AcrPull) on the one resource group only.
- The registry has no admin user; the app pulls with its managed identity.
- The storage account: HTTPS only, TLS 1.2, no public blob access. Shared-key access stays on because Container Apps mounts SMB shares with the account key (kept in the environment, never in outputs).
- The server already validates every message, rate-limits by IP (`TRUST_PROXY=true` makes that the real client IP) and only answers the game's origin (`ALLOWED_ORIGINS`). Anyone with a join code can join, as before.

## Deploying

Not done in this step. When it's time:

1. `infra/scripts/bootstrap.sh` once (needs Owner on the subscription), then set the printed GitHub variables `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID`.
2. Run the **Deploy** workflow by hand (Actions → Deploy → Run workflow), or `infra/scripts/deploy.sh` from a machine logged in with `az login`.

## Done when

- [ ] `infra/` Bicep builds (`az bicep build`) and lints without warnings
- [ ] `deploy.sh`, `bootstrap.sh` pass `bash -n` and shellcheck
- [ ] The deploy workflow only runs on `workflow_dispatch`
- [ ] `npm run bench:rooms` runs and its numbers are in [Capacity](#capacity)
- [ ] `npm run check`, `npm run format:check` and `npm run build` pass
- [ ] Nothing deployed
