// Parameters for env prod. deploy.sh passes deployGameServer and
// gameServerImage on the command line (the image tag is the git sha).
using './main.bicep'

param env = 'prod'
param deployGameServer = false
param gameServerImage = ''
param gameServerShards = 8
param gameServerMaxRooms = 15
param gameServerCpu = '0.5'
param gameServerMemory = '1Gi'
param gameServerMinReplicas = 1
// Express environment (false: the standard Consumption environment; switching recreates it, see main.bicep).
param containerAppsExpress = true
param extraAllowedOrigins = []
param staticSiteLocation = 'westeurope'
