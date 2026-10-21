param location string
param tags object
param resourcePrefix string
param acaSubnetId string
param logAnalyticsWorkspaceId string
param logAnalyticsCustomerId string
param runtimeIdentityId string
param runtimeIdentityClientId string
param runtimeIdentityPrincipalId string
param migrationIdentityId string
param migrationIdentityClientId string
param registryLoginServer string
param containerImage string = ''
@allowed([
  'infrastructure'
  'migrate'
  'app'
])
param deployStage string
param postgresHost string
param runtimePrincipalName string
param migrationPrincipalName string
param runtimePrincipalObjectId string
param dataProtectionBlobUri string
param dataProtectionKeyIdentifier string
param keyVaultUri string
param googleClientId string = ''
param authorGoogleSubjects array = []
@description('Nonsecret application settings; platform security settings below always take precedence.')
param appEnvironment object = {}
@description('Environment variable name to existing Key Vault secret name. Contains names only, never values.')
#disable-next-line secure-secrets-in-params // Contains Key Vault secret names only.
param secretEnvironment object = {}

var vaultBaseUri = endsWith(keyVaultUri, '/') ? substring(keyVaultUri, 0, max(0, length(keyVaultUri) - 1)) : keyVaultUri
var appName = 'ca-${resourcePrefix}'
var migrateName = 'job-migrate-${resourcePrefix}'
var grantName = 'job-grant-${resourcePrefix}'
var protectedEnvironment = {
  'Logging__LogLevel__Microsoft.EntityFrameworkCore.Database.Command': 'Warning'
  ASPNETCORE_ENVIRONMENT: 'Production'
  ASPNETCORE_HTTP_PORTS: '8080'
  ASPNETCORE_URLS: 'http://+:8080'
  Database__UseManagedIdentity: 'true'
  Azure__ManagedIdentityClientId: runtimeIdentityClientId
  ConnectionStrings__Postgres: 'Host=${postgresHost};Database=aiteacher;Username=${runtimePrincipalName};SSL Mode=VerifyFull;Maximum Pool Size=16;GSS Encryption Mode=Disable'
  DataProtection__BlobUri: dataProtectionBlobUri
  DataProtection__KeyIdentifier: dataProtectionKeyIdentifier
  Proxy__KnownNetworks__0: '10.42.0.0/23'
  // User-approved reserved Container Apps proxy range; one forwarded hop, never forwarded host.
  Proxy__KnownNetworks__1: '100.100.0.0/17'
  Proxy__KnownNetworks__2: '::ffff:100.100.0.0/113'
}
var publicSettings = union(appEnvironment, {
  Authentication__GoogleClientId: googleClientId
}, protectedEnvironment)
var secretMappings = [for setting in filter(items(secretEnvironment), setting => !contains(protectedEnvironment, setting.key)): {
  environmentName: setting.key
  secretName: 's-${uniqueString(setting.key)}'
  vaultSecretName: string(setting.value)
}]
var nonsecretRuntimeEnvironment = [for setting in filter(items(publicSettings), setting => !contains(secretEnvironment, setting.key) || contains(protectedEnvironment, setting.key)): {
  name: setting.key
  value: string(setting.value)
}]
var authorEnvironment = [for (subject, index) in authorGoogleSubjects: {
  name: 'Authentication__AuthorGoogleSubjects__${index}'
  value: string(subject)
}]
var secretRuntimeEnvironment = [for setting in secretMappings: {
  name: setting.environmentName
  secretRef: setting.secretName
}]
var runtimeEnvironment = concat(nonsecretRuntimeEnvironment, authorEnvironment, secretRuntimeEnvironment)
var migrationEnvironment = [for setting in items({
  ASPNETCORE_ENVIRONMENT: 'Production'
  Bootstrap__KeyVaultUri: keyVaultUri
  Database__UseManagedIdentity: 'true'
  Azure__ManagedIdentityClientId: migrationIdentityClientId
  ConnectionStrings__Postgres: 'Host=${postgresHost};Database=aiteacher;Username=${migrationPrincipalName};SSL Mode=VerifyFull;Maximum Pool Size=16;GSS Encryption Mode=Disable'
}): {
  name: setting.key
  value: setting.value
}]

resource workspace 'Microsoft.OperationalInsights/workspaces@2023-09-01' existing = {
  name: last(split(logAnalyticsWorkspaceId, '/'))
}

resource environment 'Microsoft.App/managedEnvironments@2025-07-01' = {
  name: 'cae-${resourcePrefix}'
  location: location
  tags: union(tags, {
    'log-analytics-workspace': logAnalyticsWorkspaceId
  })
  properties: {
    publicNetworkAccess: 'Enabled'
    zoneRedundant: false
    vnetConfiguration: {
      infrastructureSubnetId: acaSubnetId
      internal: false
    }
    workloadProfiles: [
      {
        name: 'Consumption'
        workloadProfileType: 'Consumption'
      }
    ]
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logAnalyticsCustomerId
        sharedKey: workspace.listKeys().primarySharedKey
      }
    }
  }
}

resource application 'Microsoft.App/containerApps@2025-07-01' = if (deployStage == 'app') {
  name: appName
  location: location
  tags: union(tags, {
    'runtime-principal-id': runtimeIdentityPrincipalId
  })
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${runtimeIdentityId}': {}
    }
  }
  properties: {
    environmentId: environment.id
    workloadProfileName: 'Consumption'
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: {
        external: true
        allowInsecure: false
        targetPort: 8080
        transport: 'auto'
      }
      registries: [
        {
          server: registryLoginServer
          identity: runtimeIdentityId
        }
      ]
      secrets: [for setting in secretMappings: {
        name: setting.secretName
        identity: runtimeIdentityId
        keyVaultUrl: '${vaultBaseUri}/secrets/${setting.vaultSecretName}'
      }]
    }
    template: {
      terminationGracePeriodSeconds: 60
      containers: [
        {
          name: 'api'
          image: containerImage
          env: runtimeEnvironment
          resources: {
            cpu: json('0.5')
            memory: '1Gi'
          }
          probes: [
            {
              type: 'Startup'
              tcpSocket: { port: 8080 }
              initialDelaySeconds: 10
              periodSeconds: 10
              failureThreshold: 30
              timeoutSeconds: 3
            }
            {
              type: 'Liveness'
              tcpSocket: { port: 8080 }
              initialDelaySeconds: 10
              periodSeconds: 30
              failureThreshold: 3
              timeoutSeconds: 3
            }
            {
              type: 'Readiness'
              httpGet: {
                path: '/health/ready'
                port: 8080
                scheme: 'HTTP'
              }
              initialDelaySeconds: 10
              periodSeconds: 10
              failureThreshold: 3
              timeoutSeconds: 5
            }
          ]
        }
      ]
      scale: {
        minReplicas: 1
        maxReplicas: 2
        rules: [
          {
            name: 'http'
            http: {
              metadata: { concurrentRequests: '20' }
            }
          }
        ]
      }
    }
  }
}

// Jobs are provisioned without being run. Deployment scripts execute and verify each stage explicitly.
resource migrationJob 'Microsoft.App/jobs@2025-07-01' = if (deployStage != 'infrastructure') {
  name: migrateName
  location: location
  tags: tags
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: { '${migrationIdentityId}': {} }
  }
  properties: {
    environmentId: environment.id
    workloadProfileName: 'Consumption'
    configuration: {
      triggerType: 'Manual'
      replicaTimeout: 1800
      replicaRetryLimit: 0
      manualTriggerConfig: {
        parallelism: 1
        replicaCompletionCount: 1
      }
      registries: [
        {
          server: registryLoginServer
          identity: migrationIdentityId
        }
      ]
    }
    template: {
      containers: [
        {
          name: 'migrate'
          image: containerImage
          command: ['dotnet', 'AITeacher.Api.dll']
          args: ['--bootstrap-data-protection-key', '--migrate']
          env: migrationEnvironment
          resources: {
            cpu: json('0.5')
            memory: '1Gi'
          }
        }
      ]
    }
  }
}

resource grantJob 'Microsoft.App/jobs@2025-07-01' = if (deployStage != 'infrastructure') {
  name: grantName
  location: location
  tags: tags
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: { '${migrationIdentityId}': {} }
  }
  properties: {
    environmentId: environment.id
    workloadProfileName: 'Consumption'
    configuration: {
      triggerType: 'Manual'
      replicaTimeout: 1800
      replicaRetryLimit: 0
      manualTriggerConfig: {
        parallelism: 1
        replicaCompletionCount: 1
      }
      registries: [
        {
          server: registryLoginServer
          identity: migrationIdentityId
        }
      ]
    }
    template: {
      containers: [
        {
          name: 'grant'
          image: containerImage
          command: ['dotnet', 'AITeacher.Api.dll']
          args: ['--grant-runtime-access']
          env: concat(migrationEnvironment, [
            {
              name: 'Database__RuntimePrincipalName'
              value: runtimePrincipalName
            }
            {
              name: 'Database__RuntimePrincipalObjectId'
              value: runtimePrincipalObjectId
            }
          ])
          resources: {
            cpu: json('0.5')
            memory: '1Gi'
          }
        }
      ]
    }
  }
}

output applicationName string = appName
output applicationFqdn string = deployStage == 'app' ? application!.properties.configuration.ingress.fqdn : ''
output environmentId string = environment.id
output migrationJobName string = migrateName
output grantJobName string = grantName
