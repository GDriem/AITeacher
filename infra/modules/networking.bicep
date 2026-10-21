param location string
param tags object
@minLength(3)
@maxLength(20)
param resourcePrefix string = 'aiteacher-beta-8136'

// Dedicated subnet requirements: https://learn.microsoft.com/azure/container-apps/custom-virtual-networks
// PostgreSQL VNet integration: https://learn.microsoft.com/azure/postgresql/network/concepts-networking-private
var acaCidr = '10.42.0.0/23'
var postgresCidr = '10.42.2.0/27'
var endpointCidr = '10.42.3.0/27'

// Keep the platform's default outbound allowances for image pulls, telemetry and AI APIs.
resource acaNsg 'Microsoft.Network/networkSecurityGroups@2024-07-01' = {
  name: 'nsg-${resourcePrefix}-aca'
  location: location
  tags: tags
  properties: { securityRules: [] }
}

resource postgresNsg 'Microsoft.Network/networkSecurityGroups@2024-07-01' = {
  name: 'nsg-${resourcePrefix}-postgres'
  location: location
  tags: tags
  properties: {
    securityRules: [
      {
        name: 'AllowAppPostgres'
        properties: {
          priority: 100
          direction: 'Inbound'
          access: 'Allow'
          protocol: 'Tcp'
          sourceAddressPrefix: acaCidr
          sourcePortRange: '*'
          destinationAddressPrefix: postgresCidr
          destinationPortRange: '5432'
        }
      }
      {
        name: 'AllowPostgresServiceTraffic'
        properties: {
          priority: 110
          direction: 'Inbound'
          access: 'Allow'
          protocol: 'Tcp'
          sourceAddressPrefix: postgresCidr
          sourcePortRange: '*'
          destinationAddressPrefix: postgresCidr
          destinationPortRange: '5432'
        }
      }
      {
        name: 'DenyOtherPostgresClients'
        properties: {
          priority: 200
          direction: 'Inbound'
          access: 'Deny'
          protocol: 'Tcp'
          sourceAddressPrefix: '*'
          sourcePortRange: '*'
          destinationAddressPrefix: postgresCidr
          destinationPortRange: '5432'
        }
      }
    ]
  }
}

resource endpointNsg 'Microsoft.Network/networkSecurityGroups@2024-07-01' = {
  name: 'nsg-${resourcePrefix}-endpoints'
  location: location
  tags: tags
  properties: {
    securityRules: [
      {
        name: 'AllowAppHttps'
        properties: {
          priority: 100
          direction: 'Inbound'
          access: 'Allow'
          protocol: 'Tcp'
          sourceAddressPrefix: acaCidr
          sourcePortRange: '*'
          destinationAddressPrefix: endpointCidr
          destinationPortRange: '443'
        }
      }
      {
        name: 'DenyOtherVirtualNetworkHttps'
        properties: {
          priority: 200
          direction: 'Inbound'
          access: 'Deny'
          protocol: 'Tcp'
          sourceAddressPrefix: 'VirtualNetwork'
          sourcePortRange: '*'
          destinationAddressPrefix: endpointCidr
          destinationPortRange: '443'
        }
      }
    ]
  }
}

resource vnet 'Microsoft.Network/virtualNetworks@2024-07-01' = {
  name: 'vnet-${resourcePrefix}'
  location: location
  tags: tags
  properties: {
    addressSpace: { addressPrefixes: ['10.42.0.0/16'] }
    subnets: [
      {
        name: 'snet-aca'
        properties: {
          addressPrefix: acaCidr
          networkSecurityGroup: { id: acaNsg.id }
          delegations: [{ name: 'container-apps', properties: { serviceName: 'Microsoft.App/environments' } }]
        }
      }
      {
        name: 'snet-postgres'
        properties: {
          addressPrefix: postgresCidr
          networkSecurityGroup: { id: postgresNsg.id }
          delegations: [{ name: 'postgresql', properties: { serviceName: 'Microsoft.DBforPostgreSQL/flexibleServers' } }]
          serviceEndpoints: [{ service: 'Microsoft.Storage', locations: [location] }]
        }
      }
      {
        name: 'snet-private-endpoints'
        properties: {
          addressPrefix: endpointCidr
          networkSecurityGroup: { id: endpointNsg.id }
          privateEndpointNetworkPolicies: 'Enabled'
        }
      }
    ]
  }
}

resource postgresDns 'Microsoft.Network/privateDnsZones@2024-06-01' = {
  name: '${resourcePrefix}.postgres.database.azure.com'
  location: 'global'
  tags: tags
}
resource blobDns 'Microsoft.Network/privateDnsZones@2024-06-01' = {
  name: 'privatelink.blob.${environment().suffixes.storage}'
  location: 'global'
  tags: tags
}
resource vaultDns 'Microsoft.Network/privateDnsZones@2024-06-01' = {
  name: 'privatelink.vaultcore.azure.net'
  location: 'global'
  tags: tags
}
resource postgresLink 'Microsoft.Network/privateDnsZones/virtualNetworkLinks@2024-06-01' = {
  parent: postgresDns
  name: 'link-${resourcePrefix}'
  location: 'global'
  tags: tags
  properties: { virtualNetwork: { id: vnet.id }, registrationEnabled: false }
}
resource blobLink 'Microsoft.Network/privateDnsZones/virtualNetworkLinks@2024-06-01' = {
  parent: blobDns
  name: 'link-${resourcePrefix}'
  location: 'global'
  tags: tags
  properties: { virtualNetwork: { id: vnet.id }, registrationEnabled: false }
}
resource vaultLink 'Microsoft.Network/privateDnsZones/virtualNetworkLinks@2024-06-01' = {
  parent: vaultDns
  name: 'link-${resourcePrefix}'
  location: 'global'
  tags: tags
  properties: { virtualNetwork: { id: vnet.id }, registrationEnabled: false }
}

output vnetId string = vnet.id
output acaSubnetId string = resourceId('Microsoft.Network/virtualNetworks/subnets', vnet.name, 'snet-aca')
output postgresSubnetId string = resourceId('Microsoft.Network/virtualNetworks/subnets', vnet.name, 'snet-postgres')
output privateEndpointSubnetId string = resourceId('Microsoft.Network/virtualNetworks/subnets', vnet.name, 'snet-private-endpoints')
output postgresDnsZoneId string = postgresDns.id
output blobDnsZoneId string = blobDns.id
output vaultDnsZoneId string = vaultDns.id
