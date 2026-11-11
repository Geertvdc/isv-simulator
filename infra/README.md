# Hosting on Azure

The browser game on Azure Static Web Apps and the game server on Azure Container Apps, as Bicep. The design, the costs and how it scales are in [`docs/plan/azure-hosting.md`](../docs/plan/azure-hosting.md).

## What's here

- `main.bicep`, `main.bicepparam`, `modules/`: everything in one resource group per environment (`rg-isv-simulator-<env>`, default env `prod`).
- `scripts/bootstrap.sh`: once per environment, by a subscription Owner. Resource group, resource providers, and the app registration GitHub Actions logs in as.
- `scripts/deploy.sh`: builds and deploys everything. Used by hand and by the **Deploy** workflow (`.github/workflows/deploy.yml`).
- `../public/staticwebapp.config.json`: cache headers for the site (Vite's hashed files in `/assets/` are cached forever; `index.html`, `/assets/sfx/` and `/assets/music/` are revalidated, since their names don't change).

## Prerequisites

- [Azure CLI](https://learn.microsoft.com/cli/azure/install-azure-cli) (`az`), logged in with `az login`, the right subscription picked with `az account set -s <id>`.
- Node 22 and npm, git, curl. No local Docker: the image is built in the registry (`az acr build`).

## Bootstrap (once)

As an Owner of the subscription:

```sh
infra/scripts/bootstrap.sh --github-repo Geertvdc/isv-simulator
```

It asks before creating anything (`--yes` skips that). It creates the resource group, registers the resource providers, and makes the app registration `github-isv-simulator-deploy-<env>` with federated credentials for GitHub Actions (branch `main` and environment `prod`; no secret) and, on the resource group only, Contributor plus Role Based Access Control Administrator limited to assigning AcrPull and Storage Table Data Contributor (the two roles the Bicep gives the game servers' managed identity). Running it again reuses what exists, and replaces a Role Based Access Control Administrator assignment from an older bootstrap that only allowed AcrPull.

Then set the three GitHub variables it prints (`AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID`), with the printed `gh variable set` commands or under Settings → Secrets and variables → Actions → Variables.

## Deploy

From GitHub: Actions → **Deploy** → Run workflow. It runs `npm run check` first and deploys only when that passes.

From a machine logged in with `az login`:

```sh
infra/scripts/deploy.sh                 # env prod
infra/scripts/deploy.sh --skip-client   # only the server (and the infrastructure)
infra/scripts/deploy.sh --skip-server   # only the browser game (and the infrastructure)
infra/scripts/deploy.sh --shards 4      # a pool of at most 4 game server shards (see Scaling)
infra/scripts/deploy.sh --help
```

It deploys the infrastructure without the game servers, builds the image `isv-simulator-server:<git short sha>` in the registry, deploys every game server of the pool on it, builds the game with `VITE_SERVER_URL` set to shard 0's URL (the front door; the game reads the rest of the pool from its `/pool`), uploads `dist/`, deletes the game servers of shards past the pool size (after it shrank), and checks shard 0's `/health`, `/shard` and `/pool` (its URLs must equal the deployed ones), the [ops dashboard](#ops-dashboard) (open: `/admin` and `/admin/api/state` answer without credentials, with the pool), the site, and a real game session over shard 0's WebSocket (see [Express](#express)). It doesn't touch the other shards, since any request would wake them. It prints the URLs at the end, the dashboard's too. It refuses uncommitted changes, since the image is tagged with the commit (`--allow-dirty` tags it `<sha>-dirty-<time>`).

## Ops dashboard

Shard 0 serves an operations page for the pool:

```
https://ca-isv-prod-game-0.<environment domain>/admin
```

`deploy.sh` prints the URL at the end. The dashboard is open and read-only: no login, public on purpose (it's used for demos). Join codes are masked (`AB••`) and it shows no user ids, names or IPs, so nothing on it lets anyone into a room. Only shard 0 serves it; the other shards answer 404 there. Reads are cached (the pool 2 s, the history 10 s), so many viewers don't add table reads.

What's there: a grid of the shards with each one's load, CPU, memory, event-loop delay and rooms (shard 0 live, the others up to 30 s old, sleeping ones shown asleep and never woken); the pool totals; which shard hosts next and which are being woken; history charts over 1 h, 24 h and 7 days; and an event log. The history is in the table `poolhistory`: shard 0 writes a snapshot a minute plus events and keeps 14 days (none while shard 0 sleeps, if `gameServerMinReplicas` is 0; that's fine, a sleeping shard 0 means nobody plays). The JSON behind it: `/admin/api/state` and `/admin/api/history?range=1h|24h|7d`. More in [Ops dashboard](../docs/plan/azure-hosting.md#ops-dashboard).

## What-if

```sh
infra/scripts/deploy.sh --what-if
```

Shows what the Bicep would change (with the server image that's running now) and which shards past the pool size a deploy would delete, and changes nothing. The workflow has a **what-if** checkbox for the same.

## Roll back

Every deploy is a new revision of each game server Container App (`ca-isv-prod-game-<n>`, one per shard); the image tags are commits.

```sh
az containerapp revision list -n ca-isv-prod-game-0 -g rg-isv-simulator-prod -o table
az acr repository show-tags -n <registry> --repository isv-simulator-server -o table
az containerapp update -n ca-isv-prod-game-0 -g rg-isv-simulator-prod \
  --image <registry>.azurecr.io/isv-simulator-server:<older sha>
```

`az containerapp update` is quick but only rolls back that one shard (do it for every shard of the pool, asleep or not), and the next deploy overwrites it. For the game and the server together, check out the older commit and run `deploy.sh` (or run the workflow on that commit).

## Logs

Per shard (`-game-0`, `-game-1`, …):

```sh
az containerapp logs show -n ca-isv-prod-game-0 -g rg-isv-simulator-prod --follow
az containerapp logs show -n ca-isv-prod-game-0 -g rg-isv-simulator-prod --type system  # starts, probes
```

Older logs are in the Log Analytics workspace `log-isv-prod` (30 days), table `ContainerAppConsoleLogs_CL` (column `ContainerAppName_s` tells the shards apart).

## Profiles

Online profiles are in Azure Table Storage: table `profiles` in the storage account `stisvprod<suffix>`, one entity per user, shared by every shard. The same account has the table `shards`, one pool entity per shard (see Scaling), and `poolhistory`, the ops dashboard's history. The game servers reach it with their managed identity `id-isv-prod-game` (Storage Table Data Contributor). Shared-key access is off on the account, so there are no keys or connection strings; people sign in with Entra ID too.

To look at them: the Azure portal (the storage account → Storage browser → Tables → `profiles`), or

```sh
az storage entity query --account-name <storage account> --table-name profiles --auth-mode login -o table
```

Reading with `--auth-mode login` needs a data role on the account for you (Storage Table Data Reader, or Contributor to change entities); Owner or Contributor on the resource group alone is not enough.

## Custom domain

1. Add the domain to the Static Web App (portal: the site → Custom domains, or `az staticwebapp hostname set -n <site> --hostname isv.example.com`) and create the DNS record it asks for.
2. Add the origin to `extraAllowedOrigins` in `main.bicepparam` (`['https://isv.example.com']`), so the game server answers that page, and deploy.

## Scale knobs

In `main.bicepparam` (each change needs a deploy):

- `gameServerShards`: the pool size, 1 to 8 (default 8). The most game servers that can ever run; see below.
- `gameServerMaxRooms`: rooms one shard takes before hosting moves on to the next (default 15, for 0.5 vCPU; ~30 for 1 vCPU).
- `gameServerCpu` / `gameServerMemory`: `'0.5'` / `'1Gi'` by default. Up to `'1.0'` / `'2Gi'`; more cores don't help one Node process.
- `gameServerMinReplicas`: shard 0 only, `1` by default. `0` scales it to zero too when nobody plays (cheaper, but the first visitor waits for a cold start and a room whose players are briefly away can be lost). The other shards always have 0.

## Express

The game servers run in a Container Apps [Express](https://learn.microsoft.com/en-us/azure/container-apps/express-overview) environment: same billing as Consumption, but a sleeping shard starts in under a second, so waking shards is nearly instant (and `gameServerMinReplicas = 0` for shard 0 is reasonable). No workload profiles; images are built `linux/amd64`.

Express doesn't document WebSocket support, and the game runs on WebSockets. So the deploy ends with a smoke test against shard 0: `scripts/smokeOnline.ts` hosts a room over Colyseus, waits for the `welcome`, sends a `ping` a second for 5 s and expects the `pong`s, then leaves (20 s at most; its user id isn't a UUID, so no profile is created). Run it by hand against any server:

```sh
npx vite-node scripts/smokeOnline.ts https://ca-isv-prod-game-0.<environment domain>
npx vite-node scripts/smokeOnline.ts http://localhost:2567   # npm run server
```

## Scaling

The game servers are a fixed pool of `gameServerShards` Container Apps (`ca-isv-<env>-game-0` to `-<N-1>`), each with its own URL and at most one replica. What runs changes by itself; no deploy needed:

- **Shard 0** is always on. It is the front door: the game is built with its URL only and asks its `GET /pool` where to host.
- **The other shards** sleep (scaled to zero, nothing to pay) until they are needed. Every awake shard writes its entity (rooms, players) to the table `shards` when they change (at most once a second) and every 30 s; it counts as awake for 90 s after a write (a crashed shard can look awake that long; clients that can't reach it move on to the next one). Hosting packs rooms on the lowest shard with a free slot (fewer than `gameServerMaxRooms` rooms). When fewer than 5 slots are left over the awake shards, shard 0 wakes the next one with an HTTP request, so it's warm before it's needed.
- **Going back to sleep:** a shard with live rooms pings its own URL every 60 s so it isn't scaled in under a game. About 5 minutes (the scale rule's `cooldownPeriod`) after its last room closed, it scales to zero. Higher shards empty first, since new rooms go to the lowest ones.
- **Full:** with every shard of the pool full, hosting says the server is full. The ceiling is pool size × max rooms: 8 × 15 = 120 rooms (~480 players) at 0.5 vCPU, 240 at 1 vCPU with `gameServerMaxRooms = 30`.

What still needs a deploy: the pool size (`--shards N` for one deploy, or the **shards** input of the Deploy workflow; set `gameServerShards` in `main.bicepparam` and commit it to keep it), the CPU and memory, and the max rooms. Changing the pool size remaps which shard owns which join code (the first letter of a code picks its shard; 1, 2, 3, 4, 6 or 8 spread them evenly); a deploy drops live rooms anyway. When it shrinks, `deploy.sh` deletes the apps past the new size.

To watch it:

```sh
# pool entities: one per shard that has been awake (rooms, players, last write)
az storage entity query --account-name <storage account> --table-name shards --auth-mode login -o table
# replicas of one shard: empty while it sleeps
az containerapp replica list -n ca-isv-prod-game-1 -g rg-isv-simulator-prod -o table
```

(Reading the table needs a data role on the storage account, as for the profiles.) `az containerapp logs show --type system` on a shard shows its scale-out and scale-in events. More in [Scaling](../docs/plan/azure-hosting.md#scaling).

## Tear down

```sh
az group delete -n rg-isv-simulator-prod
```

That deletes everything, the online profiles too. The app registration stays (`az ad app delete --id <AZURE_CLIENT_ID>` removes it).
