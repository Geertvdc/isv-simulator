#!/usr/bin/env bash
# Build and deploy ISV Simulator to Azure: the infrastructure (infra/main.bicep), the game
# server image (built in the registry with `az acr build`) and the browser game (Static Web
# Apps). Used by hand and by .github/workflows/deploy.yml. See infra/README.md and
# docs/plan/azure-hosting.md.
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: infra/scripts/deploy.sh [options]

Builds and deploys everything for one environment:
  1. infra/main.bicep without the game servers (registry, storage, identity, environment, site)
  2. az acr build: the Dockerfile into isv-simulator-server:<git short sha>
  3. infra/main.bicep with the game server pool (one app per shard) on that image
  4. VITE_SERVER_URL=<shard 0's URL> npm run build (the client asks shard 0's /pool
     where to host at runtime)
  5. upload dist/ to the Static Web App
  6. delete the game servers of shards past the pool size (after it shrank)
  7. smoke test, shard 0 only (the others sleep until needed; this doesn't wake them):
     /health is ok, /shard is 0 of the pool size, /pool lists the deployed URLs; the
     site answers 200; then a game session over the WebSocket (scripts/smokeOnline.ts:
     host a room, welcome, ping/pong for a few seconds, leave)

Options:
  --env NAME              environment (default: prod)
  --resource-group NAME   resource group (default: rg-isv-simulator-<env>)
  --location REGION       region for the resources (default: the resource group's)
  --shards N              game server pool size, 1 to 8: the most shards that can run; they
                          start and stop by themselves (1, 2, 3, 4, 6 or 8 spread rooms
                          evenly; default: gameServerShards in infra/main.bicepparam)
  --what-if               show what the Bicep deployment would change, change nothing
  --skip-server           don't build a new server image or update the game server
  --skip-client           don't build or upload the browser game
  --allow-dirty           deploy uncommitted changes (the image tag gets -dirty-<time>)
  -h, --help              this help

Needs az (logged in: az login, or azure/login in GitHub Actions), node/npm, git and curl.
The resource group must exist (infra/scripts/bootstrap.sh creates it).
EOF
}

log() { printf '\n==> %s\n' "$*" >&2; }
info() { printf '    %s\n' "$*" >&2; }
die() {
  printf 'error: %s\n' "$*" >&2
  exit 1
}

env_name=prod
resource_group=
location=
what_if=false
shards=
skip_server=false
skip_client=false
allow_dirty=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --env)
      env_name=${2:?--env needs a value}
      shift 2
      ;;
    --resource-group)
      resource_group=${2:?--resource-group needs a value}
      shift 2
      ;;
    --location)
      location=${2:?--location needs a value}
      shift 2
      ;;
    --shards)
      shards=${2:?--shards needs a value}
      shift 2
      ;;
    --what-if)
      what_if=true
      shift
      ;;
    --skip-server)
      skip_server=true
      shift
      ;;
    --skip-client)
      skip_client=true
      shift
      ;;
    --allow-dirty)
      allow_dirty=true
      shift
      ;;
    -h | --help)
      usage
      exit 0
      ;;
    *)
      usage >&2
      die "unknown option: $1"
      ;;
  esac
done

[[ $env_name =~ ^[a-z0-9]{2,8}$ ]] || die "--env must be 2 to 8 lowercase letters or digits (got '$env_name')"
resource_group=${resource_group:-rg-isv-simulator-$env_name}
if [[ -n $shards ]]; then
  [[ $shards =~ ^[1-8]$ ]] || die "--shards must be 1 to 8 (got '$shards')"
  [[ $skip_server == false ]] || die "--shards changes the game server pool; it can't go with --skip-server"
fi

# ---- prerequisites (before any Azure call)
for tool in az node npm git curl; do
  command -v "$tool" >/dev/null 2>&1 || die "$tool is not installed (needed: az, node, npm, git, curl)"
done

root=$(git -C "$(dirname "${BASH_SOURCE[0]}")" rev-parse --show-toplevel)
cd "$root"

sha=$(git rev-parse --short HEAD)
image_tag=$sha
if [[ $what_if == false && $skip_server == false ]] && [[ -n $(git status --porcelain) ]]; then
  if [[ $allow_dirty == true ]]; then
    image_tag="$sha-dirty-$(date -u +%Y%m%d%H%M%S)"
  else
    git status --short >&2
    die "the working tree has uncommitted changes; the image is tagged with the commit ($sha). Commit them, or pass --allow-dirty"
  fi
fi

# Game server app of shard n: $game_app_prefix<n>.
game_app_prefix="ca-isv-$env_name-game-"
template="$root/infra/main.bicep"
params="$root/infra/main.bicepparam"
[[ -f $template && -f $params ]] || die "infra/main.bicep or infra/main.bicepparam is missing"

log "Azure account"
sub_id=$(az account show --query id -o tsv 2>/dev/null) ||
  die "az is not logged in (run az login, or azure/login in the workflow)"
info "subscription: $(az account show --query name -o tsv) ($sub_id)"
info "signed in as: $(az account show --query user.name -o tsv)"
info "resource group: $resource_group, env: $env_name"

az group show --name "$resource_group" -o none 2>/dev/null ||
  die "resource group $resource_group not found in this subscription (run infra/scripts/bootstrap.sh first, or pick it with az account set)"

common_params=(-p "env=$env_name")
if [[ -n $location ]]; then
  common_params+=(-p "location=$location")
fi
if [[ -n $shards ]]; then
  common_params+=(-p "gameServerShards=$shards")
fi

# az deployment group show ... for one output value, as plain text.
output() {
  az deployment group show -g "$resource_group" -n "$1" \
    --query "properties.outputs.$2.value" -o tsv
}

# Game server apps in the resource group whose shard index is >= $1, one per line:
# what's left over after the pool size went down.
leftover_game_apps() {
  local keep=$1 name
  az containerapp list -g "$resource_group" --query '[].name' -o tsv | while IFS= read -r name; do
    name=${name%$'\r'}
    if [[ $name == "$game_app_prefix"* ]]; then
      local index=${name#"$game_app_prefix"}
      if [[ $index =~ ^[0-9]+$ ]] && ((10#$index >= keep)); then
        printf '%s\n' "$name"
      fi
    fi
  done
}

# ---- what-if: show the changes and stop
if [[ $what_if == true ]]; then
  current_image=$(az containerapp show -n "${game_app_prefix}0" -g "$resource_group" \
    --query 'properties.template.containers[0].image' -o tsv 2>/dev/null || true)
  if [[ -z $current_image ]]; then
    current_image="placeholder.azurecr.io/isv-simulator-server:what-if-placeholder"
    info "no game server running yet; using the fake image $current_image"
  else
    info "game server image (unchanged): $current_image"
  fi
  log "What-if: $template in $resource_group"
  az deployment group what-if -g "$resource_group" -f "$template" -p "$params" \
    "${common_params[@]}" -p deployGameServer=true -p "gameServerImage=$current_image"

  # Bicep never deletes the apps of shards the pool no longer has; deploy.sh does (step 6).
  if [[ -n $shards ]]; then
    shard_count=$shards
  else
    shard_count=$(sed -n 's/^param gameServerShards *= *\([0-9][0-9]*\).*/\1/p' "$params")
    shard_count=${shard_count:-1}
  fi
  log "What-if: game servers past the pool of $shard_count shard(s)"
  leftovers=$(leftover_game_apps "$shard_count")
  if [[ -n $leftovers ]]; then
    while IFS= read -r name; do
      info "would delete: $name"
    done <<<"$leftovers"
  else
    info "none"
  fi
  exit 0
fi

# ---- 1. foundation: everything but the game server
foundation_deployment="isv-foundation-$image_tag"
log "1/7 Foundation deployment ($foundation_deployment, deployGameServer=false)"
az deployment group create -g "$resource_group" -n "$foundation_deployment" \
  -f "$template" -p "$params" "${common_params[@]}" -p deployGameServer=false -o none

registry_name=$(output "$foundation_deployment" registryName)
registry_login_server=$(output "$foundation_deployment" registryLoginServer)
static_site_name=$(output "$foundation_deployment" staticSiteName)
static_site_url=$(output "$foundation_deployment" staticSiteUrl)
[[ -n $registry_name && -n $registry_login_server && -n $static_site_name && -n $static_site_url ]] ||
  die "the foundation deployment is missing outputs (registryName, registryLoginServer, staticSiteName, staticSiteUrl)"
info "registry: $registry_login_server"
info "static site: $static_site_name ($static_site_url)"

if [[ $skip_server == false ]]; then
  # ---- 2. server image, built in the registry (no local Docker needed)
  image="$registry_login_server/isv-simulator-server:$image_tag"
  log "2/7 Building the server image in $registry_name: $image"
  # linux/amd64 is the default, but Container Apps (Express especially) only runs
  # amd64 images, so it is spelled out.
  az acr build --registry "$registry_name" --image "isv-simulator-server:$image_tag" \
    --platform linux/amd64 --file Dockerfile "$root"

  # ---- 3. the game server pool (one Container App per shard) on that image
  server_deployment="isv-gameserver-$image_tag"
  log "3/7 Game server deployment ($server_deployment, deployGameServer=true)"
  az deployment group create -g "$resource_group" -n "$server_deployment" \
    -f "$template" -p "$params" "${common_params[@]}" \
    -p deployGameServer=true -p "gameServerImage=$image" -o none
  # -o tsv prints an array one value per line.
  server_urls=()
  while IFS= read -r url; do
    url=${url%$'\r'}
    [[ -z $url ]] || server_urls+=("$url")
  done < <(output "$server_deployment" gameServerUrls)
  shard_count=$(output "$server_deployment" gameServerShards)
  [[ ${#server_urls[@]} == "$shard_count" ]] ||
    die "the game server deployment has ${#server_urls[@]} URLs for $shard_count shard(s)"
else
  log "2/7 and 3/7 skipped (--skip-server); reading the running pool's URLs"
  # The pool size is shard 0's SHARD_COUNT; the URLs come from the apps' settings
  # (management plane only, so sleeping shards stay asleep).
  shard_count=$(az containerapp show -n "${game_app_prefix}0" -g "$resource_group" \
    --query "properties.template.containers[0].env[?name=='SHARD_COUNT'].value | [0]" \
    -o tsv 2>/dev/null || true)
  shard_count=${shard_count%$'\r'}
  [[ $shard_count =~ ^[1-9][0-9]*$ ]] ||
    die "could not read the pool size (SHARD_COUNT of ${game_app_prefix}0; is it deployed? run without --skip-server once)"
  server_urls=()
  for ((i = 0; i < shard_count; i++)); do
    fqdn=$(az containerapp show -n "$game_app_prefix$i" -g "$resource_group" \
      --query 'properties.configuration.ingress.fqdn' -o tsv 2>/dev/null || true)
    fqdn=${fqdn%$'\r'}
    [[ -n $fqdn ]] || die "game server $game_app_prefix$i of the pool of $shard_count is missing"
    server_urls+=("https://$fqdn")
  done
fi
((${#server_urls[@]} > 0)) ||
  die "no game server URL (is ${game_app_prefix}0 deployed? run without --skip-server once)"
# The front door: the game only knows shard 0 and asks its /pool for the rest.
front_door_url=${server_urls[0]}
info "pool: $shard_count shard(s); front door (shard 0): $front_door_url"
for ((i = 1; i < ${#server_urls[@]}; i++)); do
  info "game server shard $i (sleeps until needed): ${server_urls[i]}"
done

if [[ $skip_client == false ]]; then
  # ---- 4. browser game, pointed at the front door
  log "4/7 Building the browser game (VITE_SERVER_URL=$front_door_url)"
  if [[ ! -d node_modules ]]; then
    npm ci
  fi
  VITE_SERVER_URL="$front_door_url" npm run build

  # ---- 5. upload to the Static Web App; the token stays out of the logs
  log "5/7 Uploading dist/ to $static_site_name"
  deploy_token=$(az staticwebapp secrets list --name "$static_site_name" -g "$resource_group" \
    --query properties.apiKey -o tsv)
  [[ -n $deploy_token ]] || die "could not read the Static Web App deployment token"
  SWA_CLI_DEPLOYMENT_TOKEN="$deploy_token" \
    npx --yes @azure/static-web-apps-cli@2 deploy ./dist --env production
  unset deploy_token
else
  log "4/7 and 5/7 skipped (--skip-client)"
fi

# ---- 6. game servers of shards past the pool size (Bicep leaves them). After the
# upload, so browsers still on the old game had them until the new game was live.
if [[ $skip_server == false ]]; then
  log "6/7 Game servers past the pool of $shard_count shard(s)"
  leftovers=$(leftover_game_apps "$shard_count")
  if [[ -n $leftovers ]]; then
    while IFS= read -r name; do
      info "deleting: $name"
      az containerapp delete -n "$name" -g "$resource_group" --yes -o none
    done <<<"$leftovers"
  else
    info "none"
  fi
else
  log "6/7 skipped (--skip-server)"
fi

# ---- 7. smoke test, with retries while a new revision starts
log "7/7 Smoke test"
attempts=30
delay=10

check_health() {
  [[ $(curl -fsS --max-time 10 "$1/health" 2>/dev/null) == ok ]]
}
# /shard answers {"shard": <index>, "shards": <count>}.
check_shard() {
  local body
  body=$(curl -fsS --max-time 10 "$1/shard" 2>/dev/null) || return 1
  node -e '
    const [body, shard, shards] = process.argv.slice(1);
    let j;
    try { j = JSON.parse(body); } catch { process.exit(1); }
    process.exit(j.shard === Number(shard) && j.shards === Number(shards) ? 0 : 1);
  ' "$body" "$2" "$3"
}
# /pool answers {"urls": [...], "awake": [...], "host": <index or -1>}. Its urls are
# what Bicep computed for SHARD_URLS (<app name>.<environment domain>); they must be
# the apps' real URLs ($2..., in shard order), or clients would host where nobody is.
check_pool() {
  local url=$1 body
  shift
  body=$(curl -fsS --max-time 10 "$url/pool" 2>/dev/null) || return 1
  node -e '
    const [body, ...want] = process.argv.slice(1);
    let j;
    try { j = JSON.parse(body); } catch { process.exit(1); }
    const urls = Array.isArray(j.urls) ? j.urls : [];
    const same = urls.length === want.length && urls.every((u, i) => u === want[i]);
    if (!same) {
      console.error("    /pool urls: " + JSON.stringify(urls));
      console.error("    expected:   " + JSON.stringify(want));
    }
    process.exit(same ? 0 : 1);
  ' "$body" "$@"
}
check_site() {
  [[ $(curl -sS -o /dev/null --max-time 10 -w '%{http_code}' "$static_site_url" 2>/dev/null) == 200 ]]
}

# retry <what> <check function> [args for it]
retry() {
  local what=$1 check=$2 i
  shift 2
  for ((i = 1; i <= attempts; i++)); do
    if "$check" "$@"; then
      info "$what: ok"
      return 0
    fi
    info "$what: not yet ($i/$attempts), waiting ${delay}s"
    sleep "$delay"
  done
  die "$what did not answer after $attempts attempts"
}

# Only shard 0: a request to any other shard would wake it (and keep it awake for the
# scale-in cooldown), which is the pool's job, not the deploy's.
retry "shard 0 $front_door_url/health" check_health "$front_door_url"
retry "shard 0 $front_door_url/shard is 0 of $shard_count" check_shard "$front_door_url" 0 "$shard_count"
retry "shard 0 $front_door_url/pool lists the ${#server_urls[@]} deployed shard URLs" \
  check_pool "$front_door_url" "${server_urls[@]}"
retry "site $static_site_url" check_site

# A real game session over the WebSocket at shard 0: host a room, get the welcome,
# ping/pong a few seconds, leave (scripts/smokeOnline.ts). The checks above are
# plain HTTP; this proves the ingress carries WebSocket frames both ways.
log "7/7 WebSocket smoke test: $front_door_url"
if [[ ! -d node_modules ]]; then
  npm ci
fi
if ! npx vite-node scripts/smokeOnline.ts "$front_door_url"; then
  if [[ $(sed -n 's/^param containerAppsExpress *= *\([a-z]*\).*/\1/p' "$params") != false ]]; then
    info "WebSockets failed: if containerAppsExpress is true, Express may not support them;"
    info "set containerAppsExpress = false in infra/main.bicepparam and redeploy"
    info "(switching recreates the environment: see infra/README.md, \"Express or standard\")"
  fi
  die "the WebSocket smoke test against shard 0 ($front_door_url) failed"
fi

log "Deployed ($env_name)"
info "game:        $static_site_url"
info "game server: $front_door_url (shard 0 of a pool of $shard_count)"
if [[ $skip_server == false ]]; then
  info "image:       $image"
fi
