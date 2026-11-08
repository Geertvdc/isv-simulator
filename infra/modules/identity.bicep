// The game servers' user-assigned managed identity and its two roles: AcrPull
// on the registry (to pull the image) and Storage Table Data Contributor on the
// storage account (to read and write the profiles table). Every shard uses this
// one identity. These are the only roles bootstrap.sh lets the deploy assign.
//
// The game servers read this module's outputs, and a module's outputs only exist
// once everything in it is deployed: so the game servers start only after both
// role assignments exist, and the first start can write profiles. Azure RBAC
// can still take a few minutes to apply everywhere after a new assignment.

param name string
param location string
param tags object
param registryName string
param storageAccountName string

// Built-in roles.
var acrPullRoleId = '7f951dda-4ed3-4680-a7ca-43fe172d538d'
var tableDataContributorRoleId = '0a9a7e1f-b9d0-4cc4-a60d-0319b160aaa3'

resource registry 'Microsoft.ContainerRegistry/registries@2025-04-01' existing = {
  name: registryName
}

resource storageAccount 'Microsoft.Storage/storageAccounts@2025-01-01' existing = {
  name: storageAccountName
}

resource identity 'Microsoft.ManagedIdentity/userAssignedIdentities@2024-11-30' = {
  name: name
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

resource tableDataContributor 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(storageAccount.id, identity.id, tableDataContributorRoleId)
  scope: storageAccount
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', tableDataContributorRoleId)
    principalId: identity.properties.principalId
    principalType: 'ServicePrincipal'
  }
}

output id string = identity.id
output clientId string = identity.properties.clientId
