// Container registry for the game server image, and the identity that pulls it.
// The app pulls with a managed identity (AcrPull), so the admin user stays off
// and no registry password exists anywhere.

param registryName string
param identityName string
param location string
param tags object

// Built-in role: AcrPull.
var acrPullRoleId = '7f951dda-4ed3-4680-a7ca-43fe172d538d'

resource registry 'Microsoft.ContainerRegistry/registries@2025-04-01' = {
  name: registryName
  location: location
  tags: tags
  sku: {
    name: 'Basic'
  }
  properties: {
    adminUserEnabled: false
  }
}

resource identity 'Microsoft.ManagedIdentity/userAssignedIdentities@2024-11-30' = {
  name: identityName
  location: location
  tags: tags
}

resource acrPull 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(registry.id, identity.id, acrPullRoleId)
  scope: registry
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', acrPullRoleId)
    principalId: identity.properties.principalId
    // Set so the assignment doesn't fail while the new identity is still
    // replicating in Entra ID.
    principalType: 'ServicePrincipal'
  }
}

output registryName string = registry.name
output loginServer string = registry.properties.loginServer
output identityId string = identity.id
