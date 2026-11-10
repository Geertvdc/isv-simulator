// Container Apps Express environment with logs to Log Analytics: fast
// provisioning and sub-second start from zero, so a sleeping shard wakes almost
// at once (see "Express" in docs/plan/azure-hosting.md). The workspace key is
// read here with listKeys, never passed around.

param name string
param location string
param tags object
param workspaceName string

resource workspace 'Microsoft.OperationalInsights/workspaces@2025-02-01' existing = {
  name: workspaceName
}

// environmentMode is in Microsoft.App 2026-07-01 (the first GA version that has it).
resource environment 'Microsoft.App/managedEnvironments@2026-07-01' = {
  name: name
  location: location
  tags: tags
  properties: {
    environmentMode: 'Express'
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: workspace.properties.customerId
        sharedKey: workspace.listKeys().primarySharedKey
      }
    }
  }
}

output environmentId string = environment.id
// An external app's FQDN is <app name>.<defaultDomain>, so the shard URLs can be
// known before the apps exist.
output defaultDomain string = environment.properties.defaultDomain
