// Container Apps environment (Consumption) with logs to Log Analytics. The
// workspace key is read here with listKeys, never passed around.

param name string
param location string
param tags object
param workspaceName string

resource workspace 'Microsoft.OperationalInsights/workspaces@2025-02-01' existing = {
  name: workspaceName
}

resource environment 'Microsoft.App/managedEnvironments@2025-01-01' = {
  name: name
  location: location
  tags: tags
  properties: {
    workloadProfiles: [
      {
        name: 'Consumption'
        workloadProfileType: 'Consumption'
      }
    ]
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
