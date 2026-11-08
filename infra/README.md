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
infra/scripts/deploy.sh --shards 3      # 3 game server shards (see Scaling)
infra/scripts/deploy.sh --help
```

It deploys the infrastructure without the game servers, builds the image `isv-simulator-server:<git short sha>` in the registry, deploys one game server per shard on it, builds the game with `VITE_SERVER_URLS` set to the shard URLs (comma-separated, in shard order), uploads `dist/`, deletes the game servers of shards past the shard count (after a scale-down), and checks every shard's `/health` and `/shard` and the site. It prints the URLs at the end. It refuses uncommitted changes, since the image is tagged with the commit (`--allow-dirty` tags it `<sha>-dirty-<time>`).

## What-if

```sh
infra/scripts/deploy.sh --what-if
```

Shows what the Bicep would change (with the server image that's running now) and which leftover shards a deploy would delete, and changes nothing. The workflow has a **what-if** checkbox for the same.

## Roll back

Every deploy is a new revision of each game server Container App (`ca-isv-prod-game-<n>`, one per shard); the image tags are commits.

```sh
az containerapp revision list -n ca-isv-prod-game-0 -g rg-isv-simulator-prod -o table
az acr repository show-tags -n <registry> --repository isv-simulator-server -o table
az containerapp update -n ca-isv-prod-game-0 -g rg-isv-simulator-prod \
  --image <registry>.azurecr.io/isv-simulator-server:<older sha>
```

`az containerapp update` is quick but only rolls back that one shard (do it for every shard), and the next deploy overwrites it. For the game and the server together, check out the older commit and run `deploy.sh` (or run the workflow on that commit).

## Logs

Per shard (`-game-0`, `-game-1`, …):

```sh
az containerapp logs show -n ca-isv-prod-game-0 -g rg-isv-simulator-prod --follow
az containerapp logs show -n ca-isv-prod-game-0 -g rg-isv-simulator-prod --type system  # starts, probes
```

Older logs are in the Log Analytics workspace `log-isv-prod` (30 days), table `ContainerAppConsoleLogs_CL` (column `ContainerAppName_s` tells the shards apart).

## Profiles

Online profiles are in Azure Table Storage: table `profiles` in the storage account `stisvprod<suffix>`, one entity per user, shared by every shard. The game servers reach it with their managed identity `id-isv-prod-game` (Storage Table Data Contributor). Shared-key access is off on the account, so there are no keys or connection strings; people sign in with Entra ID too.

To look at them: the Azure portal (the storage account → Storage browser → Tables → `profiles`), or

```sh
az storage entity query --account-name <storage account> --table-name profiles --auth-mode login -o table
```

Reading with `--auth-mode login` needs a data role on the account for you (Storage Table Data Reader, or Contributor to change entities); Owner or Contributor on the resource group alone is not enough.

## Custom domain

1. Add the domain to the Static Web App (portal: the site → Custom domains, or `az staticwebapp hostname set -n <site> --hostname isv.example.com`) and create the DNS record it asks for.
2. Add the origin to `extraAllowedOrigins` in `main.bicepparam` (`['https://isv.example.com']`), so the game server answers that page, and deploy.

## Scale knobs

In `main.bicepparam`:

- `gameServerCpu` / `gameServerMemory`: `'0.5'` / `'1Gi'` by default. Up to `'1.0'` / `'2Gi'`; more cores don't help one Node process.
- `gameServerMinReplicas`: `1` by default. `0` scales to zero when nobody plays (cheaper, but the first visitor waits for a cold start and a room whose players are briefly away can be lost).
- `gameServerShards`: number of game servers (shards), 1 to 8, see below.

## Scaling

One game server (shard) holds ~15 rooms at 0.5 vCPU and ~30 at 1 vCPU. Past that, add shards: each is its own Container App (`ca-isv-<env>-game-<n>`) with its own URL, and the first letter of a join code says which shard has the room. 1, 2, 3, 4, 6 or 8 shards spread rooms evenly.

- For one deploy: `infra/scripts/deploy.sh --shards 3`, or the **shards** input of the Deploy workflow.
- To keep it: set `gameServerShards` in `main.bicepparam` and commit it. A deploy without `--shards` (or with the workflow's `default`) uses that value, so a count set only with `--shards` goes back on the next plain deploy.

Changing the count rebuilds the game with the new URL list, and the codes map to shards differently; a deploy drops live rooms anyway. Going down, `deploy.sh` deletes the apps of the shards past the new count. A shard that is down only takes its own rooms with it: hosting uses the other shards, and codes of that shard can't be joined until it is back. More in [Scaling](../docs/plan/azure-hosting.md#scaling).

## Tear down

```sh
az group delete -n rg-isv-simulator-prod
```

That deletes everything, the online profiles too. The app registration stays (`az ad app delete --id <AZURE_CLIENT_ID>` removes it).
