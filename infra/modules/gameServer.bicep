// One game server shard: a Container App running the Dockerfile image, with
// its own URL. Rooms live in the process's memory, so each shard is exactly one
// replica: a second replica behind the same ingress would get joins for rooms
// it doesn't have. The client routes a join to the shard that owns the code
// (the code's first letter picks the shard, from SHARD_INDEX/SHARD_COUNT);
// profiles are shared by all shards in Table Storage.

param name string
param location string
param tags object
param environmentId string
param identityId string
param registryLoginServer string
param image string
param cpu string
param memory string

@allowed([0, 1])
param minReplicas int

@description('Origins the server answers (CORS), e.g. https://<static site hostname>.')
param allowedOrigins array

@description('This shard\'s index, 0-based.')
@minValue(0)
param shardIndex int

@description('Number of shards. Join codes are spread over them by their first letter.')
@minValue(1)
param shardCount int

@description('Table Storage endpoint for the profiles, https://<account>.table.core.windows.net.')
param tableEndpoint string

@description('Name of the profiles table.')
param tableName string

@description('Client id of the managed identity the server reaches Table Storage with.')
param identityClientId string

var port = 2567

resource app 'Microsoft.App/containerApps@2025-01-01' = {
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
    workloadProfileName: 'Consumption'
    configuration: {
      // A new image means a new revision; the old one gets SIGTERM and its
      // rooms tell the players the server is restarting.
      activeRevisionsMode: 'Single'
      ingress: {
        external: true
        targetPort: port
        // auto: HTTP/1.1, so the WebSocket upgrade for Colyseus works.
        transport: 'auto'
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
            { name: 'NODE_ENV', value: 'production' }
            { name: 'ALLOWED_ORIGINS', value: join(allowedOrigins, ',') }
            // The ingress adds X-Forwarded-For; the rate limits need the real client IP.
            { name: 'TRUST_PROXY', value: 'true' }
            { name: 'SHARD_INDEX', value: string(shardIndex) }
            { name: 'SHARD_COUNT', value: string(shardCount) }
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
