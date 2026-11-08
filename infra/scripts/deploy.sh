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
  1. infra/main.bicep without the game server (registry, storage, environment, site)
  2. az acr build: the Dockerfile into isv-simulator-server:<git short sha>
  3. infra/main.bicep with the game server on that image
  4. VITE_SERVER_URL=<game server URL> npm run build
  5. upload dist/ to the Static Web App
  6. smoke test: <game server>/health answers ok, the site answers 200

Options:
  --env NAME              environment (default: prod)
  --resource-group NAME   resource group (default: rg-isv-simulator-<env>)
  --location REGION       region for the resources (default: the resource group's)
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

game_app_name="ca-isv-$env_name-game-0"
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

# az deployment group show ... for one output value, as plain text.
output() {
  az deployment group show -g "$resource_group" -n "$1" \
    --query "properties.outputs.$2.value" -o tsv
}

# ---- what-if: show the changes and stop
if [[ $what_if == true ]]; then
  current_image=$(az containerapp show -n "$game_app_name" -g "$resource_group" \
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
  exit 0
fi

# ---- 1. foundation: everything but the game server
foundation_deployment="isv-foundation-$image_tag"
log "1/6 Foundation deployment ($foundation_deployment, deployGameServer=false)"
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
  log "2/6 Building the server image in $registry_name: $image"
  az acr build --registry "$registry_name" --image "isv-simulator-server:$image_tag" \
    --file Dockerfile "$root"

  # ---- 3. the game server on that image
  server_deployment="isv-gameserver-$image_tag"
  log "3/6 Game server deployment ($server_deployment, deployGameServer=true)"
  az deployment group create -g "$resource_group" -n "$server_deployment" \
    -f "$template" -p "$params" "${common_params[@]}" \
    -p deployGameServer=true -p "gameServerImage=$image" -o none
  game_server_url=$(output "$server_deployment" gameServerUrl)
else
  log "2/6 and 3/6 skipped (--skip-server); reading the running game server's URL"
  fqdn=$(az containerapp show -n "$game_app_name" -g "$resource_group" \
    --query 'properties.configuration.ingress.fqdn' -o tsv 2>/dev/null || true)
  game_server_url=${fqdn:+https://$fqdn}
fi
[[ -n $game_server_url ]] ||
  die "no game server URL (is $game_app_name deployed? run without --skip-server once)"
info "game server: $game_server_url"

if [[ $skip_client == false ]]; then
  # ---- 4. browser game, pointed at the game server
  log "4/6 Building the browser game (VITE_SERVER_URL=$game_server_url)"
  if [[ ! -d node_modules ]]; then
    npm ci
  fi
  VITE_SERVER_URL="$game_server_url" npm run build

  # ---- 5. upload to the Static Web App; the token stays out of the logs
  log "5/6 Uploading dist/ to $static_site_name"
  deploy_token=$(az staticwebapp secrets list --name "$static_site_name" -g "$resource_group" \
    --query properties.apiKey -o tsv)
  [[ -n $deploy_token ]] || die "could not read the Static Web App deployment token"
  SWA_CLI_DEPLOYMENT_TOKEN="$deploy_token" \
    npx --yes @azure/static-web-apps-cli@2 deploy ./dist --env production
  unset deploy_token
else
  log "4/6 and 5/6 skipped (--skip-client)"
fi

# ---- 6. smoke test, with retries while a new revision starts
log "6/6 Smoke test"
attempts=30
delay=10

check_health() {
  [[ $(curl -fsS --max-time 10 "$game_server_url/health" 2>/dev/null) == ok ]]
}
check_site() {
  [[ $(curl -sS -o /dev/null --max-time 10 -w '%{http_code}' "$static_site_url" 2>/dev/null) == 200 ]]
}

retry() {
  local what=$1 check=$2 i
  for ((i = 1; i <= attempts; i++)); do
    if "$check"; then
      info "$what: ok"
      return 0
    fi
    info "$what: not yet ($i/$attempts), waiting ${delay}s"
    sleep "$delay"
  done
  die "$what did not answer after $attempts attempts"
}

retry "game server $game_server_url/health" check_health
retry "site $static_site_url" check_site

log "Deployed ($env_name)"
info "game:        $static_site_url"
info "game server: $game_server_url"
if [[ $skip_server == false ]]; then
  info "image:       $image"
fi
