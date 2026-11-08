#!/usr/bin/env bash
# Once per environment, by a subscription Owner: the resource group, the resource
# providers, and an Entra app registration that GitHub Actions logs in as (OIDC, no
# secret) with rights on that resource group only. Safe to run again: everything that
# exists already is reused. See infra/README.md.
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: infra/scripts/bootstrap.sh --github-repo OWNER/REPO [options]

Run once per environment, as an Owner of the subscription (az login first). It:
  - registers the resource providers the infrastructure needs
  - creates the resource group (tags app=isv-simulator, env=<env>)
  - creates (or reuses) the app registration github-isv-simulator-deploy-<env> and its
    service principal
  - adds federated credentials for GitHub Actions on <branch> and in environment <env>
  - gives it, on the resource group only: Contributor, and Role Based Access Control
    Administrator limited to assigning AcrPull and Storage Table Data Contributor (an
    existing assignment with an older condition is replaced)
  - prints the GitHub variables to set (it doesn't set them)

Options:
  --github-repo OWNER/REPO  the GitHub repository (default: from git remote origin)
  --env NAME                environment (default: prod)
  --location REGION         region of the resource group (default: westeurope)
  --resource-group NAME     resource group (default: rg-isv-simulator-<env>)
  --branch NAME             branch allowed to deploy (default: main)
  --yes                     don't ask for confirmation
  -h, --help                this help
EOF
}

log() { printf '\n==> %s\n' "$*" >&2; }
info() { printf '    %s\n' "$*" >&2; }
die() {
  printf 'error: %s\n' "$*" >&2
  exit 1
}

github_repo=
env_name=prod
location=westeurope
resource_group=
branch=main
assume_yes=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --github-repo)
      github_repo=${2:?--github-repo needs a value}
      shift 2
      ;;
    --env)
      env_name=${2:?--env needs a value}
      shift 2
      ;;
    --location)
      location=${2:?--location needs a value}
      shift 2
      ;;
    --resource-group)
      resource_group=${2:?--resource-group needs a value}
      shift 2
      ;;
    --branch)
      branch=${2:?--branch needs a value}
      shift 2
      ;;
    --yes)
      assume_yes=true
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

for tool in az git; do
  command -v "$tool" >/dev/null 2>&1 || die "$tool is not installed"
done

# Default the repository from origin: https://github.com/OWNER/REPO(.git) or git@github.com:OWNER/REPO(.git)
if [[ -z $github_repo ]]; then
  origin=$(git -C "$(dirname "${BASH_SOURCE[0]}")" remote get-url origin 2>/dev/null || true)
  if [[ $origin =~ github\.com[:/]([^/]+/[^/]+)$ ]]; then
    github_repo=${BASH_REMATCH[1]%.git}
  fi
fi
[[ $github_repo =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ ]] ||
  die "--github-repo OWNER/REPO is needed (could not read it from git remote origin)"

app_name="github-isv-simulator-deploy-$env_name"
issuer="https://token.actions.githubusercontent.com"
branch_subject="repo:$github_repo:ref:refs/heads/$branch"
env_subject="repo:$github_repo:environment:$env_name"
acr_pull_role_id="7f951dda-4ed3-4680-a7ca-43fe172d538d"
table_data_contributor_role_id="0a9a7e1f-b9d0-4cc4-a60d-0319b160aaa3"
rbac_admin_role="Role Based Access Control Administrator"
providers=(
  Microsoft.App
  Microsoft.ContainerRegistry
  Microsoft.OperationalInsights
  Microsoft.Storage
  Microsoft.Web
  Microsoft.ManagedIdentity
)

log "Azure account"
subscription_id=$(az account show --query id -o tsv 2>/dev/null) ||
  die "az is not logged in (run az login)"
tenant_id=$(az account show --query tenantId -o tsv)
info "subscription: $(az account show --query name -o tsv) ($subscription_id)"
info "tenant:       $tenant_id"
info "signed in as: $(az account show --query user.name -o tsv)"

log "Plan"
info "register providers: ${providers[*]}"
info "resource group:     $resource_group in $location (tags app=isv-simulator env=$env_name)"
info "app registration:   $app_name (+ service principal)"
info "federated creds:    $branch_subject"
info "                    $env_subject"
info "roles on the group: Contributor; $rbac_admin_role (AcrPull and Storage Table Data Contributor only)"

if [[ $assume_yes == false ]]; then
  read -r -p "Create these in subscription $subscription_id? [y/N] " answer
  [[ $answer =~ ^[Yy]([Ee][Ss])?$ ]] || die "stopped, nothing created"
fi

log "Resource providers"
for ns in "${providers[@]}"; do
  az provider register --namespace "$ns" -o none
  info "$ns: $(az provider show --namespace "$ns" --query registrationState -o tsv)"
done

log "Resource group $resource_group"
az group create --name "$resource_group" --location "$location" \
  --tags app=isv-simulator "env=$env_name" -o none
rg_id=$(az group show --name "$resource_group" --query id -o tsv)
info "$rg_id"

log "App registration $app_name"
app_id=$(az ad app list --display-name "$app_name" --query '[0].appId' -o tsv)
if [[ -z $app_id ]]; then
  app_id=$(az ad app create --display-name "$app_name" --query appId -o tsv)
  info "created: $app_id"
else
  info "exists: $app_id"
fi

sp_id=$(az ad sp list --filter "appId eq '$app_id'" --query '[0].id' -o tsv)
if [[ -z $sp_id ]]; then
  sp_id=$(az ad sp create --id "$app_id" --query id -o tsv)
  info "service principal created: $sp_id"
else
  info "service principal exists: $sp_id"
fi

log "Federated credentials"
add_federated_credential() {
  local name=$1 subject=$2 count
  count=$(az ad app federated-credential list --id "$app_id" \
    --query "length([?subject=='$subject'])" -o tsv)
  if [[ $count != 0 ]]; then
    info "exists: $subject"
    return
  fi
  az ad app federated-credential create --id "$app_id" -o none --parameters "$(
    printf '{"name":"%s","issuer":"%s","subject":"%s","audiences":["api://AzureADTokenExchange"],"description":"GitHub Actions deploys of ISV Simulator"}' \
      "$name" "$issuer" "$subject"
  )"
  info "created: $subject"
}
add_federated_credential "github-branch-${branch//[^A-Za-z0-9-]/-}" "$branch_subject"
add_federated_credential "github-environment-$env_name" "$env_subject"

log "Role assignments on $resource_group"
# Only AcrPull and Storage Table Data Contributor may be assigned or removed: the Bicep
# (infra/modules/identity.bicep) gives the game servers' managed identity AcrPull on the
# registry and Storage Table Data Contributor on the storage account, and nothing else.
allowed_role_ids="$acr_pull_role_id, $table_data_contributor_role_id"
rbac_condition="((!(ActionMatches{'Microsoft.Authorization/roleAssignments/write'})) OR (@Request[Microsoft.Authorization/roleAssignments:RoleDefinitionId] ForAnyOfAnyValues:GuidEquals {$allowed_role_ids})) AND ((!(ActionMatches{'Microsoft.Authorization/roleAssignments/delete'})) OR (@Resource[Microsoft.Authorization/roleAssignments:RoleDefinitionId] ForAnyOfAnyValues:GuidEquals {$allowed_role_ids}))"

assign_role() {
  local role=$1 count
  shift
  count=$(az role assignment list --scope "$rg_id" \
    --query "length([?principalId=='$sp_id' && roleDefinitionName=='$role'])" -o tsv)
  if [[ $count != 0 ]]; then
    info "exists: $role"
    return
  fi
  # A new service principal can take a moment to reach every region; retry a few times.
  local i
  for ((i = 1; i <= 6; i++)); do
    if az role assignment create --assignee-object-id "$sp_id" \
      --assignee-principal-type ServicePrincipal --role "$role" --scope "$rg_id" "$@" -o none; then
      info "assigned: $role"
      return
    fi
    info "not yet ($i/6), waiting 10s"
    sleep 10
  done
  die "could not assign $role"
}
assign_role Contributor

# An assignment from an earlier bootstrap may have the older AcrPull-only condition:
# replace it (delete, then assign_role creates it with the current condition).
stale_ids=$(az role assignment list --scope "$rg_id" \
  --query "[?principalId=='$sp_id' && roleDefinitionName=='$rbac_admin_role' && !(contains(condition || '', '$table_data_contributor_role_id'))].id" -o tsv)
while IFS= read -r stale_id; do
  [[ -n $stale_id ]] || continue
  az role assignment delete --ids "$stale_id" -o none
  info "removed: $rbac_admin_role with the older condition"
done <<<"$stale_ids"

assign_role "$rbac_admin_role" \
  --condition "$rbac_condition" --condition-version 2.0

log "Done. Set these GitHub variables (Settings > Secrets and variables > Actions > Variables):"
cat <<EOF

  AZURE_CLIENT_ID=$app_id
  AZURE_TENANT_ID=$tenant_id
  AZURE_SUBSCRIPTION_ID=$subscription_id

With the GitHub CLI:

  gh variable set AZURE_CLIENT_ID --repo $github_repo --body $app_id
  gh variable set AZURE_TENANT_ID --repo $github_repo --body $tenant_id
  gh variable set AZURE_SUBSCRIPTION_ID --repo $github_repo --body $subscription_id

Then run the Deploy workflow (Actions > Deploy > Run workflow, env $env_name). Its job runs
in the GitHub environment "$env_name", which GitHub creates on the first run.
EOF
