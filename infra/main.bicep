// ISV Simulator on Azure: the browser game on Static Web Apps and the game
// server on Container Apps. See docs/plan/azure-hosting.md.
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

@description('Number of game server shards (one Container App each). Capped at 1 until the shard-aware join codes and the shared profile store from "Stage 2" in docs/plan/azure-hosting.md exist.')
@minValue(1)
@maxValue(1)
param gameServerShards int = 1

@description('vCPU per game server, as a string (Bicep has no decimals). More than 1.0 does not help one Node process.')
param gameServerCpu string = '0.5'

@description('Memory per game server, e.g. 1Gi. Must match the CPU (0.5 vCPU: 1Gi, 1.0 vCPU: 2Gi).')
param gameServerMemory string = '1Gi'

@description('1: always on. 0: scale to zero when nobody plays (cold start for the first visitor, and rooms in their reconnect grace can be lost).')
@allowed([0, 1])
param gameServerMinReplicas int = 1

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
    registryName: 'crisv${envName}${suffix}'
    identityName: 'id-isv-${envName}-game'
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

module containerEnv 'modules/containerEnv.bicep' = {
  name: 'containerEnv'
  params: {
    name: 'cae-isv-${envName}'
    location: location
    tags: tags
    workspaceName: monitoring.outputs.name
    storageAccountName: storage.outputs.accountName
    shareName: storage.outputs.shareName
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

// One Container App per shard. Skipped entirely on deploy.sh's first pass, so
// a running app is left as it is until the new image exists.
module gameServer 'modules/gameServer.bicep' = [
  for shard in range(0, gameServerShards): if (deployGameServer) {
    name: 'gameServer-${shard}'
    params: {
      name: 'ca-isv-${envName}-game-${shard}'
      location: location
      tags: tags
      environmentId: containerEnv.outputs.environmentId
      profilesStorageName: containerEnv.outputs.storageName
      identityId: registry.outputs.identityId
      registryLoginServer: registry.outputs.loginServer
      image: image
      cpu: gameServerCpu
      memory: gameServerMemory
      minReplicas: gameServerMinReplicas
      allowedOrigins: concat([staticSiteUrl], extraAllowedOrigins)
    }
  }
]

output registryName string = registry.outputs.registryName
output registryLoginServer string = registry.outputs.loginServer
output staticSiteName string = staticSite.outputs.name
output staticSiteUrl string = staticSiteUrl
// Empty when the game server is skipped, so nothing reads a module that wasn't deployed.
output gameServerUrls array = [
  for shard in range(0, deployGameServer ? gameServerShards : 0): 'https://${gameServer[shard]!.outputs.fqdn}'
]
output gameServerUrl string = deployGameServer ? 'https://${gameServer[0]!.outputs.fqdn}' : ''
