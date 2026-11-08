// Storage account with the Table Storage table that holds the online profiles
// (one entity per user). Every game server shard reads and writes it with its
// managed identity (Storage Table Data Contributor, see identity.bicep), so
// shared-key access is off: no account key is used anywhere.

param name string
param location string
param tags object

resource account 'Microsoft.Storage/storageAccounts@2025-01-01' = {
  name: name
  location: location
  tags: tags
  kind: 'StorageV2'
  sku: {
    name: 'Standard_LRS'
  }
  properties: {
    minimumTlsVersion: 'TLS1_2'
    supportsHttpsTrafficOnly: true
    allowBlobPublicAccess: false
    allowSharedKeyAccess: false
  }
}

resource tableService 'Microsoft.Storage/storageAccounts/tableServices@2025-01-01' = {
  parent: account
  name: 'default'
}

resource profilesTable 'Microsoft.Storage/storageAccounts/tableServices/tables@2025-01-01' = {
  parent: tableService
  name: 'profiles'
}

// https://<account>.table.core.windows.net/ without the trailing slash.
var tableEndpoint = account.properties.primaryEndpoints.table

output accountName string = account.name
output accountId string = account.id
output tableEndpoint string = endsWith(tableEndpoint, '/')
  ? take(tableEndpoint, length(tableEndpoint) - 1)
  : tableEndpoint
output tableName string = profilesTable.name
