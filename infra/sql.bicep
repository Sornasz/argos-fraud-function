// Azure SQL (oferta gratuita, serverless com pausa automática). A senha entra como parâmetro seguro.
targetScope = 'resourceGroup'

param location string = 'centralus'
param namePrefix string = 'argos'
param adminLogin string = 'argosadmin'
@secure()
param adminPassword string

var suffix = uniqueString(resourceGroup().id)

resource server 'Microsoft.Sql/servers@2023-08-01-preview' = {
  name: '${namePrefix}-sql-${suffix}'
  location: location
  properties: {
    administratorLogin: adminLogin
    administratorLoginPassword: adminPassword
    minimalTlsVersion: '1.2'
  }
}

// 0.0.0.0 -> 0.0.0.0 = acesso de serviços do Azure.
resource allowAzure 'Microsoft.Sql/servers/firewallRules@2023-08-01-preview' = {
  parent: server
  name: 'AllowAllWindowsAzureIps'
  properties: { startIpAddress: '0.0.0.0', endIpAddress: '0.0.0.0' }
}

resource db 'Microsoft.Sql/servers/databases@2023-08-01-preview' = {
  parent: server
  name: 'argos_audit'
  location: location
  sku: { name: 'GP_S_Gen5_1', tier: 'GeneralPurpose', family: 'Gen5', capacity: 1 }
  properties: {
    useFreeLimit: true
    freeLimitExhaustionBehavior: 'AutoPause'
    autoPauseDelay: 60
    minCapacity: json('0.5')
    maxSizeBytes: 34359738368
  }
}

output sqlServerName string = server.name
output sqlFqdn string = server.properties.fullyQualifiedDomainName
