// Storage account with the Azure Files share that holds profiles.json.
// Shared-key access stays on: Container Apps mounts SMB shares with the
// account key. The key never leaves Azure as an output; containerEnv.bicep
// reads it itself.

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
  }
}

resource fileService 'Microsoft.Storage/storageAccounts/fileServices@2025-01-01' = {
  parent: account
  name: 'default'
}

resource share 'Microsoft.Storage/storageAccounts/fileServices/shares@2025-01-01' = {
  parent: fileService
  name: 'profiles'
  properties: {
    shareQuota: 1
  }
}

output accountName string = account.name
output shareName string = share.name
