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
param extraAllowedOrigins = []
param staticSiteLocation = 'westeurope'
