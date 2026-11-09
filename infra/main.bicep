// Function App (Flex Consumption), Storage, Service Bus e Application Insights.
// Nenhum segredo neste arquivo: a connection string do Service Bus é lida por listKeys()
// dentro do deployment e vai direto para a app setting.
targetScope = 'resourceGroup'

param location string = 'centralus'
param namePrefix string = 'argos'
param approvalThreshold string = '0.6'

var suffix = uniqueString(resourceGroup().id)
var storageName = take('${namePrefix}fraud${suffix}', 24)
var sbName = '${namePrefix}-sb-${suffix}'
var appName = '${namePrefix}-fraud-${suffix}'
var topicName = 'transaction-scored'
var deployContainer = 'app-package'
var blobDataOwnerRole = 'b7e6dc6d-f1e8-4753-8033-0f276bb0955b'

resource logs 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: '${namePrefix}-logs-${suffix}'
  location: location
  properties: {
    sku: { name: 'PerGB2018' }
    retentionInDays: 30
  }
}

resource insights 'Microsoft.Insights/components@2020-02-02' = {
  name: '${namePrefix}-ai-${suffix}'
  location: location
  kind: 'web'
  properties: {
    Application_Type: 'web'
    WorkspaceResourceId: logs.id
  }
}

resource storage 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: storageName
  location: location
  sku: { name: 'Standard_LRS' }
  kind: 'StorageV2'
  properties: {
    minimumTlsVersion: 'TLS1_2'
    allowBlobPublicAccess: false
  }
}

resource blobs 'Microsoft.Storage/storageAccounts/blobServices@2023-05-01' = {
  parent: storage
  name: 'default'
}

resource pkgContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  parent: blobs
  name: deployContainer
}

resource sb 'Microsoft.ServiceBus/namespaces@2024-01-01' = {
  name: sbName
  location: location
  sku: { name: 'Standard', tier: 'Standard' }
}

resource topic 'Microsoft.ServiceBus/namespaces/topics@2024-01-01' = {
  parent: sb
  name: topicName
}

resource auditSub 'Microsoft.ServiceBus/namespaces/topics/subscriptions@2024-01-01' = {
  parent: topic
  name: 'decision-audit'
  properties: {
    maxDeliveryCount: 3
  }
}

// Regra só de envio, escopo do tópico (menor privilégio).
resource sendRule 'Microsoft.ServiceBus/namespaces/topics/authorizationRules@2024-01-01' = {
  parent: topic
  name: 'function-send'
  properties: { rights: ['Send'] }
}

resource plan 'Microsoft.Web/serverfarms@2024-04-01' = {
  name: '${namePrefix}-plan-${suffix}'
  location: location
  kind: 'functionapp'
  sku: { name: 'FC1', tier: 'FlexConsumption' }
  properties: { reserved: true }
}

resource app 'Microsoft.Web/sites@2024-04-01' = {
  name: appName
  location: location
  kind: 'functionapp,linux'
  identity: { type: 'SystemAssigned' }
  properties: {
    serverFarmId: plan.id
    httpsOnly: true
    functionAppConfig: {
      deployment: {
        storage: {
          type: 'blobContainer'
          value: '${storage.properties.primaryEndpoints.blob}${deployContainer}'
          authentication: { type: 'SystemAssignedIdentity' }
        }
      }
      scaleAndConcurrency: {
        maximumInstanceCount: 2
        instanceMemoryMB: 2048
      }
      runtime: { name: 'node', version: '22' }
    }
    siteConfig: {
      appSettings: [
        { name: 'AzureWebJobsStorage__accountName', value: storage.name }
        { name: 'APPLICATIONINSIGHTS_CONNECTION_STRING', value: insights.properties.ConnectionString }
        { name: 'DATASET_PATH', value: '/home/site/wwwroot/data/references.json.gz' }
        { name: 'FRAUD_APPROVAL_THRESHOLD', value: approvalThreshold }
        { name: 'IDEMPOTENCY_TTL_SECONDS', value: '900' }
        { name: 'IDEMPOTENCY_MAX_ENTRIES', value: '100000' }
        { name: 'SERVICEBUS_TOPIC_NAME', value: topicName }
        { name: 'SERVICEBUS_CONNECTION_STRING', value: sendRule.listKeys().primaryConnectionString }
      ]
    }
  }
}

resource blobOwner 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: storage
  name: guid(storage.id, app.id, blobDataOwnerRole)
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', blobDataOwnerRole)
    principalId: app.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

output functionAppName string = app.name
output functionHostName string = app.properties.defaultHostName
