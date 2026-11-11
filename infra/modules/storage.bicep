// Storage account with the Table Storage tables: `profiles` holds the online
// profiles (one entity per user), `shards` the game server pool's heartbeats
// (one entity per awake shard: rooms, players), `poolhistory` the ops
// dashboard's history (shard 0 writes a pool snapshot a minute and events,
// keeps 14 days). Every game server shard reads and writes it with its
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

resource shardsTable 'Microsoft.Storage/storageAccounts/tableServices/tables@2025-01-01' = {
  parent: tableService
  name: 'shards'
}

resource historyTable 'Microsoft.Storage/storageAccounts/tableServices/tables@2025-01-01' = {
  parent: tableService
  name: 'poolhistory'
}

// https://<account>.table.core.windows.net/ without the trailing slash.
var tableEndpoint = account.properties.primaryEndpoints.table

output accountName string = account.name
output accountId string = account.id
output tableEndpoint string = endsWith(tableEndpoint, '/')
  ? take(tableEndpoint, length(tableEndpoint) - 1)
  : tableEndpoint
output tableName string = profilesTable.name
output poolTableName string = shardsTable.name
output historyTableName string = historyTable.name
