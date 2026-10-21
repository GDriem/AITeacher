param location string
param tags object
@minLength(3)
@maxLength(20)
param resourcePrefix string = 'aiteacher-beta-8136'
param postgresSubnetId string
param postgresDnsZoneId string
param privateEndpointSubnetId string
param blobDnsZoneId string
param vaultDnsZoneId string
param runtimePrincipalId string
param migrationPrincipalId string
param migrationPrincipalName string
param tenantId string
param grantRuntimeKeyAccess bool = false

// Entra-only delegated VNet integration has no PostgreSQL public endpoint/firewall rule.
// https://learn.microsoft.com/azure/templates/microsoft.dbforpostgresql/2024-08-01/flexibleservers
resource postgres 'Microsoft.DBforPostgreSQL/flexibleServers@2024-08-01' = {
  name: 'pg-${resourcePrefix}'
  location: location
  tags: tags
  sku: { name: 'Standard_B1ms', tier: 'Burstable' }
  properties: {
    version: '17'
    createMode: 'Default'
    authConfig: {
      activeDirectoryAuth: 'Enabled'
      passwordAuth: 'Disabled'
      tenantId: tenantId
    }
    network: {
      delegatedSubnetResourceId: postgresSubnetId
      privateDnsZoneArmResourceId: postgresDnsZoneId
      publicNetworkAccess: 'Disabled'
    }
    storage: { storageSizeGB: 32, autoGrow: 'Enabled' }
    backup: { backupRetentionDays: 7, geoRedundantBackup: 'Disabled' }
    highAvailability: { mode: 'Disabled' }
  }
}
resource migrationAdmin 'Microsoft.DBforPostgreSQL/flexibleServers/administrators@2024-08-01' = {
  parent: postgres
  name: migrationPrincipalId
  properties: {
    principalName: migrationPrincipalName
    principalType: 'ServicePrincipal'
    tenantId: tenantId
  }
}
resource database 'Microsoft.DBforPostgreSQL/flexibleServers/databases@2024-08-01' = {
  parent: postgres
  name: 'aiteacher'
  properties: { charset: 'UTF8', collation: 'en_US.utf8' }
}

//checkov:skip=CKV_AZURE_36:Private endpoints only; trusted-service bypass is intentionally disabled for stronger network isolation.
//checkov:skip=CKV_AZURE_43:Dynamic mechanical name staiteacherbeta8136 is validated by the root plan and deploy script (3-24 lowercase alphanumeric).
//checkov:skip=CKV_AZURE_206:LRS is the explicitly cost-optimized beta durability tier; multi-region recovery and production acceptance remain pending.
resource storage 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: 'st${replace(resourcePrefix, '-', '')}'
  location: location
  tags: tags
  kind: 'StorageV2'
  sku: { name: 'Standard_LRS' }
  properties: {
    accessTier: 'Hot'
    allowBlobPublicAccess: false
    allowSharedKeyAccess: false
    defaultToOAuthAuthentication: true
    supportsHttpsTrafficOnly: true
    minimumTlsVersion: 'TLS1_2'
    publicNetworkAccess: 'Disabled'
    networkAcls: { bypass: 'None', defaultAction: 'Deny' }
  }
}
resource blobService 'Microsoft.Storage/storageAccounts/blobServices@2023-05-01' = {
  parent: storage
  name: 'default'
  properties: {
    isVersioningEnabled: true
    deleteRetentionPolicy: { enabled: true, days: 7 }
    containerDeleteRetentionPolicy: { enabled: true, days: 7 }
  }
}
resource originals 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  parent: blobService
  name: 'originals'
  properties: { publicAccess: 'None' }
}
resource dataProtection 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  parent: blobService
  name: 'dataprotection'
  properties: { publicAccess: 'None' }
}
// Scope blob permissions to the two required containers, never the subscription/account.
var blobContributorRoleId = subscriptionResourceId('Microsoft.Authorization/roleDefinitions', 'ba92f5b4-2d11-453d-a403-e96b0029c9fe')
resource originalsWriter 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: originals
  name: guid(originals.id, runtimePrincipalId, blobContributorRoleId)
  properties: { principalId: runtimePrincipalId, principalType: 'ServicePrincipal', roleDefinitionId: blobContributorRoleId }
}
resource keyringWriter 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: dataProtection
  name: guid(dataProtection.id, runtimePrincipalId, blobContributorRoleId)
  properties: { principalId: runtimePrincipalId, principalType: 'ServicePrincipal', roleDefinitionId: blobContributorRoleId }
}

resource vault 'Microsoft.KeyVault/vaults@2024-11-01' = {
  name: 'kv-${resourcePrefix}'
  location: location
  tags: tags
  properties: {
    tenantId: tenantId
    sku: { family: 'A', name: 'standard' }
    enableRbacAuthorization: true
    accessPolicies: []
    enableSoftDelete: true
    softDeleteRetentionInDays: 90
    enablePurgeProtection: true
    publicNetworkAccess: 'Disabled'
    networkAcls: { bypass: 'None', defaultAction: 'Deny' }
  }
}
// Key is bootstrapped by the migration job over the private endpoint, never ARM's public path.
resource protectionKey 'Microsoft.KeyVault/vaults/keys@2024-11-01' existing = {
  parent: vault
  name: 'dataprotection'
}
// https://learn.microsoft.com/azure/role-based-access-control/built-in-roles/security
var secretsUserRoleId = subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '4633458b-17de-408a-b874-0445c86b69e6')
var cryptoEncryptionRoleId = subscriptionResourceId('Microsoft.Authorization/roleDefinitions', 'e147488a-f6f5-4113-8e2d-b22465e65bf6')
resource secretsReader 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: vault
  name: guid(vault.id, runtimePrincipalId, secretsUserRoleId)
  properties: { principalId: runtimePrincipalId, principalType: 'ServicePrincipal', roleDefinitionId: secretsUserRoleId }
}
resource keyEncrypter 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (grantRuntimeKeyAccess) {
  scope: protectionKey
  name: guid(protectionKey.id, runtimePrincipalId, cryptoEncryptionRoleId)
  properties: { principalId: runtimePrincipalId, principalType: 'ServicePrincipal', roleDefinitionId: cryptoEncryptionRoleId }
}

resource blobEndpoint 'Microsoft.Network/privateEndpoints@2024-07-01' = {
  name: 'pep-${resourcePrefix}-blob'
  location: location
  tags: tags
  properties: {
    subnet: { id: privateEndpointSubnetId }
    privateLinkServiceConnections: [
      { name: 'blob', properties: { privateLinkServiceId: storage.id, groupIds: ['blob'] } }
    ]
  }
}
resource blobZoneGroup 'Microsoft.Network/privateEndpoints/privateDnsZoneGroups@2024-07-01' = {
  parent: blobEndpoint
  name: 'default'
  properties: {
    privateDnsZoneConfigs: [{ name: 'blob', properties: { privateDnsZoneId: blobDnsZoneId } }]
  }
}
resource vaultEndpoint 'Microsoft.Network/privateEndpoints@2024-07-01' = {
  name: 'pep-${resourcePrefix}-vault'
  location: location
  tags: tags
  properties: {
    subnet: { id: privateEndpointSubnetId }
    privateLinkServiceConnections: [
      { name: 'vault', properties: { privateLinkServiceId: vault.id, groupIds: ['vault'] } }
    ]
  }
}
resource vaultZoneGroup 'Microsoft.Network/privateEndpoints/privateDnsZoneGroups@2024-07-01' = {
  parent: vaultEndpoint
  name: 'default'
  properties: {
    privateDnsZoneConfigs: [{ name: 'vault', properties: { privateDnsZoneId: vaultDnsZoneId } }]
  }
}

output postgresHost string = postgres.properties.fullyQualifiedDomainName
output storageAccountName string = storage.name
output blobServiceUri string = storage.properties.primaryEndpoints.blob
output dataProtectionBlobUri string = '${storage.properties.primaryEndpoints.blob}dataprotection/keyring.xml'
output keyVaultUri string = vault.properties.vaultUri
output dataProtectionKeyIdentifier string = '${vault.properties.vaultUri}keys/${protectionKey.name}'
