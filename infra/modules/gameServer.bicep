// One game server shard of the pool: a Container App running the Dockerfile
// image, with its own URL. Rooms live in the process's memory, so each shard is
// at most one replica: a second replica behind the same ingress would get joins
// for rooms it doesn't have. The client routes a join to the shard that owns the
// code (the code's first letter picks the shard, from SHARD_INDEX/SHARD_COUNT);
// profiles are shared by all shards in Table Storage.
//
// The pool scales itself (see "Scaling" in docs/plan/azure-hosting.md): shard 0
// is always on (the front door: GET /pool tells clients where to host); the
// others have minReplicas 0 and sleep until HTTP traffic wakes them (shard 0
// wakes the next one ahead of time, a client joining a code wakes its shard).
// Every awake shard writes its pool entity (rooms, players) to the table
// `shards` when they change (at most once a second) and every 30 s,
// and a shard with live rooms pings its own URL so the HTTP scaler doesn't
// scale it in under a game.
//
// Shard 0 also serves the ops dashboard (/admin: open and read-only, no login;
// the other shards answer 404 there) and writes its history to the table
// `poolhistory`.

param name string
param location string
param tags object
param environmentId string
param identityId string
param registryLoginServer string
param image string
param cpu string
param memory string

@description('1: always on. 0: asleep (scaled to zero) until HTTP traffic wakes it.')
@allowed([0, 1])
param minReplicas int

@description('Origins the server answers (CORS), e.g. https://<static site hostname>.')
param allowedOrigins array

@description('This shard\'s index, 0-based.')
@minValue(0)
param shardIndex int

@description('Number of shards in the pool. Join codes are spread over them by their first letter.')
@minValue(1)
param shardCount int

@description('Container App names of every shard of the pool, in shard order.')
param shardAppNames array

@description('The Container Apps environment\'s default domain. An external app\'s FQDN is <app name>.<default domain>.')
param environmentDefaultDomain string

@description('Rooms one shard takes before hosting moves on to the next shard (SHARD_MAX_ROOMS).')
@minValue(1)
param maxRooms int

@description('Name of the table the shards write their heartbeats to (POOL_TABLE_NAME).')
param poolTableName string

@description('Name of the table shard 0 writes the ops dashboard\'s history to (HISTORY_TABLE_NAME): a pool snapshot a minute and events, 14 days.')
param historyTableName string

@description('Table Storage endpoint for the profiles, https://<account>.table.core.windows.net.')
param tableEndpoint string

@description('Name of the profiles table.')
param tableName string

@description('Client id of the managed identity the server reaches Table Storage with.')
param identityClientId string

var port = 2567

// The image tag (the git short sha) is the version the server reports (APP_VERSION).
var appVersion = last(split(image, ':'))

// Every shard's public URL, in shard order (SHARD_URLS).
var shardUrls = [for appName in shardAppNames: 'https://${appName}.${environmentDefaultDomain}']

resource app 'Microsoft.App/containerApps@2026-07-01' = {
  name: name
  location: location
  tags: tags
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${identityId}': {}
    }
  }
  properties: {
    environmentId: environmentId
    configuration: {
      // A new image means a new revision; the old one gets SIGTERM and its
      // rooms tell the players the server is restarting.
      activeRevisionsMode: 'Single'
      ingress: {
        external: true
        targetPort: port
        // HTTP/1.1 (Express has no HTTP/2), so the WebSocket upgrade for Colyseus works.
        transport: 'http'
        allowInsecure: false
      }
      registries: [
        {
          server: registryLoginServer
          identity: identityId
        }
      ]
    }
    template: {
      containers: [
        {
          name: 'game-server'
          image: image
          resources: {
            cpu: json(cpu)
            memory: memory
          }
          env: [
            { name: 'PORT', value: string(port) }
            { name: 'APP_VERSION', value: appVersion }
            { name: 'NODE_ENV', value: 'production' }
            { name: 'ALLOWED_ORIGINS', value: join(allowedOrigins, ',') }
            // The ingress adds X-Forwarded-For; the rate limits need the real client IP.
            { name: 'TRUST_PROXY', value: 'true' }
            { name: 'SHARD_INDEX', value: string(shardIndex) }
            { name: 'SHARD_COUNT', value: string(shardCount) }
            // The pool: every shard's URL (to wake the next one and to answer
            // GET /pool), the rooms per shard, the heartbeat table.
            { name: 'SHARD_URLS', value: join(shardUrls, ',') }
            { name: 'SHARD_MAX_ROOMS', value: string(maxRooms) }
            { name: 'POOL_TABLE_NAME', value: poolTableName }
            // The ops dashboard's history (written by shard 0 only; the
            // dashboard at /admin is shard 0's, open and read-only).
            { name: 'HISTORY_TABLE_NAME', value: historyTableName }
            // Profiles in Table Storage, reached as the user-assigned managed
            // identity with this client id (no keys or connection strings).
            { name: 'PROFILE_STORE', value: 'table' }
            { name: 'PROFILE_TABLE_ENDPOINT', value: tableEndpoint }
            { name: 'PROFILE_TABLE_NAME', value: tableName }
            { name: 'AZURE_CLIENT_ID', value: identityClientId }
          ]
          probes: [
            {
              type: 'Startup'
              httpGet: { path: '/health', port: port }
              initialDelaySeconds: 1
              periodSeconds: 2
              timeoutSeconds: 3
              failureThreshold: 30
            }
            {
              type: 'Readiness'
              httpGet: { path: '/health', port: port }
              periodSeconds: 10
              timeoutSeconds: 3
              failureThreshold: 3
            }
            {
              type: 'Liveness'
              httpGet: { path: '/health', port: port }
              periodSeconds: 30
              timeoutSeconds: 5
              failureThreshold: 3
            }
          ]
        }
      ]
      scale: {
        minReplicas: minReplicas
        // Never more than one: see the top of this file.
        maxReplicas: 1
        // Scale-in only after 5 minutes without traffic (a shard with live
        // rooms keeps pinging itself), checked every 15 s.
        cooldownPeriod: 300
        pollingInterval: 15
        rules: [
          {
            // With minReplicas 0, incoming HTTP/WebSocket traffic wakes it up.
            name: 'http'
            http: {
              metadata: {
                concurrentRequests: '100'
              }
            }
          }
        ]
      }
    }
  }
}

output name string = app.name
output fqdn string = app.properties.configuration.ingress.fqdn
