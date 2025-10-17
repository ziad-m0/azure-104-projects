targetScope = 'subscription'
@allowed([
  'dev'
  'test'
  'prod'
])
param environment string = 'dev'
param location string = 'uksouth'
param projectName string = 'vmproject'
param adminUsername string = 'azureuser'
@secure()
param sshPublicKey string
param allowedSourceIp string
param vmSize string = 'Standard_b1s'
@minValue(1)
@maxValue(3)
param vmCount int = 1

var resourceGroupName = '${projectName}-${environment}-rg'
var vnetName = '${projectName}-${environment}-vnet'
var nsgName = '${projectName}-${environment}-nsg' 
var vmNamePrefix = '${projectName}-${environment}-vm'

var tags = {
  Project: projectName
  Environment: environment
}
module rg 'modules/resource-group.bicep' = {
  name: 'deploy-rg-${environment}'
  params: {
    location: location
    resourceGroupName: resourceGroupName
    tags: tags
  }
}

module network 'modules/network.bicep' = {
  name: 'deploy-network-${environment}'
  scope: resourceGroup(resourceGroupName)
  params: {
    location: location
    vnetName: vnetName
    nsgName: nsgName
    allowedSourceIp: allowedSourceIp
  }
  dependsOn: [
    rg
  ]
}

module vm 'modules/vm.bicep' = {
  name: 'deploy-vms'
  scope: resourceGroup(resourceGroupName)
  params: {
    location: location
    vmNamePrefix: vmNamePrefix
    vmSize: vmSize
    adminUsername: adminUsername
    sshPublicKey: sshPublicKey
    subnetId: network.outputs.subnetId
    vmCount: vmCount
  }
}

output resourceGroupName string = rg.outputs.resourceGroupName
output vnetId string = network.outputs.vnetId
output vmIds array = vm.outputs.vmIds
output vmNames array = vm.outputs.vmNames
