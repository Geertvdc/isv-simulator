// ISV Simulator on Azure: the browser game on Static Web Apps and the game
// server on Container Apps (an Express environment by default, see
// containerAppsExpress). See docs/plan/azure-hosting.md.
//
// deploy.sh runs this twice: first with deployGameServer=false (the registry
// must exist before the image can be pushed to it), then with the new image.

targetScope = 'resourceGroup'

@description('Environment name, used in every resource name. Lowercase letters and digits only (it goes into the registry and storage names).')
@minLength(2)
@maxLength(8)
param env string = 'prod'

@description('Region for everything except the Static Web App.')
param location string = resourceGroup().location

@description('Deploy the game server Container App(s). False on the first pass, before the image exists in the registry.')
param deployGameServer bool = true

@description('Full image reference in the registry, e.g. crisvprodabc123.azurecr.io/isv-simulator-server:<git sha>. Required when deployGameServer is true.')
param gameServerImage string = ''

@description('Size of the game server pool: the most shards that can ever run (one Container App with at most one replica each, see "Scaling" in docs/plan/azure-hosting.md). Shard 0 is always on; the others sleep (scaled to zero, nothing to pay on Consumption) and wake by themselves when the awake ones fill up. So this is the ceiling, not what runs. The first letter of a join code picks its shard (24 letters, so 1, 2, 3, 4, 6 or 8 spread rooms evenly); changing it remaps join codes and needs a deploy.')
@minValue(1)
@maxValue(8)
param gameServerShards int = 8

@description('Rooms one shard takes before hosting moves on to the next shard. 15 fits 0.5 vCPU (see "Capacity" in docs/plan/azure-hosting.md); ~30 for 1 vCPU.')
@minValue(1)
param gameServerMaxRooms int = 15

@description('vCPU per game server, as a string (Bicep has no decimals). More than 1.0 does not help one Node process.')
param gameServerCpu string = '0.5'

@description('Memory per game server, e.g. 1Gi. Must match the CPU (0.5 vCPU: 1Gi, 1.0 vCPU: 2Gi).')
param gameServerMemory string = '1Gi'

@description('Shard 0 (the front door): 1 always on, 0 scale to zero when nobody plays (cold start for the first visitor, and rooms in their reconnect grace can be lost). The other shards always have 0 and wake when needed.')
@allowed([0, 1])
param gameServerMinReplicas int = 1

@description('Run the game servers in a Container Apps Express environment: faster provisioning and sub-second start from zero, so a sleeping shard wakes almost at once (same Consumption billing). false: the standard Consumption workload-profile environment, the fallback if Express falls short (e.g. WebSockets; deploy.sh smoke tests them). An environment can\'t switch mode in place: switching later recreates it, so delete the game server apps and the environment first (az containerapp delete, az containerapp env delete), or use a new env name.')
param containerAppsExpress bool = true

@description('More origins the game server answers besides the Static Web App, e.g. a custom domain (https://isv.example.com).')
param extraAllowedOrigins array = []

@description('Static Web Apps only exists in a few regions.')
@allowed([
  'westeurope'
  'westus2'
  'centralus'
  'eastus2'
  'eastasia'
])
param staticSiteLocation string = 'westeurope'

// Bicep has no pattern decorator, so env and the image are checked here and
// a bad value fails the deployment before anything is created.
var envBadChars = filter(
  range(0, length(env)),
  i => !contains('abcdefghijklmnopqrstuvwxyz0123456789', substring(env, i, 1))
)
var envName = empty(envBadChars) ? env : fail('env must be lowercase letters and digits only.')
var image = deployGameServer && empty(gameServerImage)
  ? fail('gameServerImage is required when deployGameServer is true.')
  : gameServerImage

var tags = {
  app: 'isv-simulator'
  env: envName
}

// Registry and storage names are global: add a short suffix from the resource group.
var suffix = take(uniqueString(resourceGroup().id), 6)

module monitoring 'modules/monitoring.bicep' = {
  name: 'monitoring'
  params: {
    name: 'log-isv-${envName}'
    location: location
    tags: tags
  }
}

module registry 'modules/registry.bicep' = {
  name: 'registry'
  params: {
    name: 'crisv${envName}${suffix}'
    location: location
    tags: tags
  }
}

module storage 'modules/storage.bicep' = {
  name: 'storage'
  params: {
    name: 'stisv${envName}${suffix}'
    location: location
    tags: tags
  }
}

// The game servers' identity: AcrPull on the registry, Storage Table Data
// Contributor on the storage account.
module identity 'modules/identity.bicep' = {
  name: 'identity'
  params: {
    name: 'id-isv-${envName}-game'
    location: location
    tags: tags
    registryName: registry.outputs.name
    storageAccountName: storage.outputs.accountName
  }
}

module containerEnv 'modules/containerEnv.bicep' = {
  name: 'containerEnv'
  params: {
    name: 'cae-isv-${envName}'
    location: location
    tags: tags
    workspaceName: monitoring.outputs.name
    express: containerAppsExpress
  }
}

module staticSite 'modules/staticSite.bicep' = {
  name: 'staticSite'
  params: {
    name: 'swa-isv-${envName}'
    location: staticSiteLocation
    tags: tags
  }
}

var staticSiteUrl = 'https://${staticSite.outputs.defaultHostname}'

// Every shard gets every shard's URL. They can't be read from the apps (that
// would be a cycle), so gameServer.bicep computes them from these names and
// the environment's default domain; deploy.sh's smoke test checks them against
// the real FQDNs (gameServerUrls).
var gameAppNames = [for shard in range(0, gameServerShards): 'ca-isv-${envName}-game-${shard}']

// The pool: one Container App per shard. Skipped entirely on deploy.sh's first
// pass, so a running app is left as it is until the new image exists. They
// read the identity module's outputs, so they wait for its role assignments
// (the first start can pull the image and write profiles). Shard 0 is always on
// (gameServerMinReplicas); the others sleep until traffic wakes them. Apps of
// shards past gameServerShards (after the pool shrank) are not touched here;
// deploy.sh deletes them.
module gameServer 'modules/gameServer.bicep' = [
  for shard in range(0, gameServerShards): if (deployGameServer) {
    name: 'gameServer-${shard}'
    params: {
      name: gameAppNames[shard]
      location: location
      tags: tags
      environmentId: containerEnv.outputs.environmentId
      identityId: identity.outputs.id
      identityClientId: identity.outputs.clientId
      express: containerAppsExpress
      shardIndex: shard
      shardCount: gameServerShards
      shardAppNames: gameAppNames
      environmentDefaultDomain: containerEnv.outputs.defaultDomain
      maxRooms: gameServerMaxRooms
      tableEndpoint: storage.outputs.tableEndpoint
      tableName: storage.outputs.tableName
      poolTableName: storage.outputs.poolTableName
      registryLoginServer: registry.outputs.loginServer
      image: image
      cpu: gameServerCpu
      memory: gameServerMemory
      minReplicas: shard == 0 ? gameServerMinReplicas : 0
      allowedOrigins: concat([staticSiteUrl], extraAllowedOrigins)
    }
  }
]

output registryName string = registry.outputs.name
output registryLoginServer string = registry.outputs.loginServer
output staticSiteName string = staticSite.outputs.name
output staticSiteUrl string = staticSiteUrl
// Empty when the game server is skipped, so nothing reads a module that wasn't deployed.
output gameServerUrls array = [
  for shard in range(0, deployGameServer ? gameServerShards : 0): 'https://${gameServer[shard]!.outputs.fqdn}'
]
output gameServerShards int = gameServerShards
// Shard 0, the front door the browser game is built with (VITE_SERVER_URL).
output gameServerUrl string = deployGameServer ? 'https://${gameServer[0]!.outputs.fqdn}' : ''
