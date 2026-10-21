targetScope = 'subscription'

@description('Isolated beta resource group; existing resources elsewhere are retained.')
param resourceGroupName string = 'rg-aiteacher-beta-8136'
@description('User-selected region.')
@allowed(['mexicocentral'])
param location string = 'mexicocentral'
@description('Shared naming prefix.')
@minLength(3)
@maxLength(20)
param resourcePrefix string = 'aiteacher-beta-8136'
@description('Stage controls job/app creation; deployments never execute migrations implicitly.')
@allowed(['infrastructure', 'migrate', 'app'])
param deployStage string = 'infrastructure'
@description('Immutable ACR image digest required for migrate/app stages.')
param containerImage string = ''
@description('Google Web OAuth client ID; public configuration, not a secret.')
param googleClientId string = ''
@description('Google subjects authorized as editorial authors.')
param authorGoogleSubjects array = []
@description('Nonsecret AI configuration only; never API keys/tokens.')
param appEnvironment object = {}
@description('Environment variable names mapped to existing Key Vault secret names, never values.')
#disable-next-line secure-secrets-in-params // References only; no secret material.
param secretEnvironment object = {}
@description('Cost and ownership tags.')
param tags object = {
  project: 'aiteacher'
  environment: 'beta'
  owner: 'Gadi Orellana'
  'managed-by': 'bicep'
}

resource group 'Microsoft.Resources/resourceGroups@2024-03-01' = {
  name: resourceGroupName
  location: location
  tags: tags
}
module foundation './modules/foundation.bicep' = {
  scope: group
  name: 'foundation'
  params: { location: location, tags: tags, resourcePrefix: resourcePrefix }
}
module network './modules/networking.bicep' = {
  scope: group
  name: 'networking'
  params: { location: location, tags: tags, resourcePrefix: resourcePrefix }
}
module data './modules/data.bicep' = {
  scope: group
  name: 'data'
  params: {
    location: location
    tags: tags
    resourcePrefix: resourcePrefix
    postgresSubnetId: network.outputs.postgresSubnetId
    postgresDnsZoneId: network.outputs.postgresDnsZoneId
    privateEndpointSubnetId: network.outputs.privateEndpointSubnetId
    blobDnsZoneId: network.outputs.blobDnsZoneId
    vaultDnsZoneId: network.outputs.vaultDnsZoneId
    runtimePrincipalId: foundation.outputs.runtimeIdentityPrincipalId
    migrationPrincipalId: foundation.outputs.migrationIdentityPrincipalId
    migrationPrincipalName: foundation.outputs.migrationIdentityName
    grantRuntimeKeyAccess: deployStage == 'app'
    tenantId: subscription().tenantId
  }
}
module compute './modules/compute.bicep' = {
  scope: group
  name: 'compute'
  params: {
    location: location
    tags: tags
    resourcePrefix: resourcePrefix
    acaSubnetId: network.outputs.acaSubnetId
    logAnalyticsWorkspaceId: foundation.outputs.workspaceId
    logAnalyticsCustomerId: foundation.outputs.workspaceCustomerId
    runtimeIdentityId: foundation.outputs.runtimeIdentityId
    runtimeIdentityClientId: foundation.outputs.runtimeIdentityClientId
    runtimeIdentityPrincipalId: foundation.outputs.runtimeIdentityPrincipalId
    migrationIdentityId: foundation.outputs.migrationIdentityId
    migrationIdentityClientId: foundation.outputs.migrationIdentityClientId
    registryLoginServer: foundation.outputs.registryLoginServer
    containerImage: containerImage
    deployStage: deployStage
    postgresHost: data.outputs.postgresHost
    runtimePrincipalName: foundation.outputs.runtimeIdentityName
    migrationPrincipalName: foundation.outputs.migrationIdentityName
    runtimePrincipalObjectId: foundation.outputs.runtimeIdentityPrincipalId
    dataProtectionBlobUri: data.outputs.dataProtectionBlobUri
    dataProtectionKeyIdentifier: data.outputs.dataProtectionKeyIdentifier
    keyVaultUri: data.outputs.keyVaultUri
    googleClientId: googleClientId
    authorGoogleSubjects: authorGoogleSubjects
    appEnvironment: appEnvironment
    secretEnvironment: secretEnvironment
  }
}
output resourceGroupName string = group.name
output registryName string = foundation.outputs.registryName
output applicationName string = compute.outputs.applicationName
output applicationFqdn string = compute.outputs.applicationFqdn
output migrationJobName string = compute.outputs.migrationJobName
output grantJobName string = compute.outputs.grantJobName
