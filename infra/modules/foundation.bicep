param location string
param tags object
@minLength(3)
@maxLength(20)
param resourcePrefix string

resource runtime 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: 'id-${resourcePrefix}-runtime'
  location: location
  tags: tags
}
resource migrator 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: 'id-${resourcePrefix}-migrator'
  location: location
  tags: tags
}
// Public authenticated image distribution is an intentional Basic-tier exception.
//checkov:skip=CKV_AZURE_139:Basic registry supports authenticated public build/pull; private DB and storage remain isolated. Private ACR requires a separately priced Premium build topology.
//checkov:skip=CKV_AZURE_166:Quarantine requires Premium; beta uses immutable digests and controlled ACR builds. No claim of vulnerability verification.
//checkov:skip=CKV_AZURE_163:Defender image scanning is subscription-scoped paid configuration, intentionally deferred; this template does not alter subscription security plans.
resource registry 'Microsoft.ContainerRegistry/registries@2025-04-01' = {
  name: 'cr${replace(resourcePrefix, '-', '')}'
  location: location
  tags: tags
  sku: { name: 'Basic' }
  properties: {
    adminUserEnabled: false
    anonymousPullEnabled: false
    publicNetworkAccess: 'Enabled'
  }
}
resource pull 'Microsoft.Authorization/roleAssignments@2022-04-01' = [for index in range(0, 2): {
  scope: registry
  name: guid(registry.id, index == 0 ? runtime.id : migrator.id, 'acrpull')
  properties: {
    principalId: index == 0 ? runtime.properties.principalId : migrator.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '7f951dda-4ed3-4680-a7ca-43fe172d538d')
  }
}]
resource logs 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: 'log-${resourcePrefix}'
  location: location
  tags: tags
  properties: {
    sku: { name: 'PerGB2018' }
    retentionInDays: 30
    workspaceCapping: { dailyQuotaGb: json('0.1') }
    publicNetworkAccessForIngestion: 'Enabled'
    publicNetworkAccessForQuery: 'Enabled'
  }
}
resource insights 'Microsoft.Insights/components@2020-02-02' = {
  name: 'appi-${resourcePrefix}'
  location: location
  tags: tags
  kind: 'web'
  properties: {
    Application_Type: 'web'
    WorkspaceResourceId: logs.id
    DisableIpMasking: false
    publicNetworkAccessForIngestion: 'Enabled'
    publicNetworkAccessForQuery: 'Enabled'
  }
}
output runtimeIdentityId string = runtime.id
output runtimeIdentityClientId string = runtime.properties.clientId
output runtimeIdentityPrincipalId string = runtime.properties.principalId
output runtimeIdentityName string = runtime.name
output migrationIdentityId string = migrator.id
output migrationIdentityClientId string = migrator.properties.clientId
output migrationIdentityPrincipalId string = migrator.properties.principalId
output migrationIdentityName string = migrator.name
output registryLoginServer string = registry.properties.loginServer
output registryName string = registry.name
output workspaceId string = logs.id
output workspaceCustomerId string = logs.properties.customerId
