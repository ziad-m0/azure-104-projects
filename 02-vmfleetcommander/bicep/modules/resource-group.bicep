targetScope = 'subscription'
param location string = 'uksouth'
param resourceGroupName string
param tags object = {}

resource resourceGroup 'Microsoft.Resources/resourceGroups@2025-04-01' = {
  name: resourceGroupName
  location: location
  tags: tags
}

output resourceGroupId string = resourceGroup.id
output resourceGroupName string = resourceGroup.name
