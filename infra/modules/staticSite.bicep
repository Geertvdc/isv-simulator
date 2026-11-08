// Static Web App (Free) for the browser game. No repository link: deploy.sh
// uploads dist/ with the deployment token and the SWA CLI. The token is never
// an output; deploy.sh fetches it with `az staticwebapp secrets list`.

param name string

@description('Static Web Apps only exists in a few regions.')
@allowed([
  'westeurope'
  'westus2'
  'centralus'
  'eastus2'
  'eastasia'
])
param location string

param tags object

resource site 'Microsoft.Web/staticSites@2025-03-01' = {
  name: name
  location: location
  tags: tags
  sku: {
    name: 'Free'
    tier: 'Free'
  }
  properties: {}
}

output name string = site.name
output defaultHostname string = site.properties.defaultHostname
