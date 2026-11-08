// Container registry for the game server image. The admin user stays off: the
// game servers pull with their managed identity (AcrPull, see identity.bicep),
// so no registry password exists anywhere.

param name string
param location string
param tags object

resource registry 'Microsoft.ContainerRegistry/registries@2025-04-01' = {
  name: name
  location: location
  tags: tags
  sku: {
    name: 'Basic'
  }
  properties: {
    adminUserEnabled: false
  }
}

output name string = registry.name
output loginServer string = registry.properties.loginServer
