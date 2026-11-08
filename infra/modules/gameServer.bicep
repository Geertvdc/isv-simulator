// One game server shard: a Container App running the Dockerfile image.
// Rooms live in the process's memory and join codes are unique per process,
// so each shard is exactly one replica: a second replica behind the same
// ingress would get joins for rooms it doesn't have.

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

@description('Name of the environment storage that holds the profiles share.')
param profilesStorageName string

var port = 2567
var dataPath = '/app/server/data'

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
            { name: 'PROFILE_STORE_PATH', value: '${dataPath}/profiles.json' }
          ]
          volumeMounts: [
            {
              volumeName: 'profiles'
              mountPath: dataPath
            }
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
      volumes: [
        {
          name: 'profiles'
          storageType: 'AzureFile'
          storageName: profilesStorageName
          // SMB has no Unix owners: mount as the image's node user (1000) so
          // it can write profiles.json, private to that user. nobrl turns off
          // SMB byte-range locks, which break some Node file writes on Azure Files.
          mountOptions: 'uid=1000,gid=1000,dir_mode=0700,file_mode=0600,nobrl'
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
