// Container Apps environment with logs to Log Analytics. The workspace key is
// read here with listKeys, never passed around.
//
// Two kinds (see "Express" in docs/plan/azure-hosting.md):
// - express true: an Express environment (environmentMode 'Express'): faster
//   provisioning and sub-second start from zero; no workload profiles.
// - express false: the standard environment with the Consumption workload
//   profile.
// An environment can't switch mode in place: changing it means a new
// environment (delete the apps and the environment first, or use a new name).

param name string
param location string
param tags object
param workspaceName string

@description('true: Express environment. false: standard environment with the Consumption workload profile.')
param express bool

resource workspace 'Microsoft.OperationalInsights/workspaces@2025-02-01' existing = {
  name: workspaceName
}

// environmentMode is in Microsoft.App 2026-07-01 (the first GA version that has it).
resource environment 'Microsoft.App/managedEnvironments@2026-07-01' = {
  name: name
  location: location
  tags: tags
  properties: {
    ...(express
      ? {
          environmentMode: 'Express'
        }
      : {
          workloadProfiles: [
            {
              name: 'Consumption'
              workloadProfileType: 'Consumption'
            }
          ]
        })
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
