param location string
param vmNamePrefix string
param vmSize string = 'Standard_b1s'
param adminUsername string
param sshPublicKey string
param subnetId string
@minValue(1)
@maxValue(3)
param vmCount int = 1

resource publicIp 'Microsoft.Network/publicIPAddresses@2024-10-01' = [for i in range(0, vmCount): {
  name: '${vmNamePrefix}-pip-${i}'
  location: location
  sku: {
    name: 'Standard'
  }
  properties: {
    publicIPAllocationMethod: 'Static'
  }
}]

resource nic 'Microsoft.Network/networkInterfaces@2024-10-01' = [for i in range(0, vmCount): {
  name: '${vmNamePrefix}-nic-${i}'
  location: location
  properties: {
    ipConfigurations: [
      {
        name: 'ipconfig1'
        properties: {
          subnet: {
            id: subnetId
          }
          privateIPAllocationMethod: 'Dynamic'
          publicIPAddress: {
            id: publicIp[i].id
          }
        }
      }
    ]
  }
}]

resource vm 'Microsoft.Compute/virtualMachines@2025-04-01' = [for i in range(0, vmCount): {
  name: '${vmNamePrefix}-${i}'
  location: location
  properties: {
    hardwareProfile: {
      vmSize: vmSize
    }
    storageProfile: {
      imageReference: {
        publisher: 'Canonical'
        offer: '0001-com-ubuntu-server-jammy'
        sku: '22_04-lts-gen2'
        version: 'latest'
      }
      osDisk: {
        name: '${vmNamePrefix}-osdisk-${i}'
        createOption: 'FromImage'
        managedDisk: {
          storageAccountType: 'Standard_LRS'  
        }
        diskSizeGB: 30  
      }
    }
    osProfile: {
      computerName: '${vmNamePrefix}${i}'
      adminUsername: adminUsername
      linuxConfiguration: {
        disablePasswordAuthentication: true
        ssh: {
          publicKeys: [
            {
              path: '/home/${adminUsername}/.ssh/authorized_keys'
              keyData: sshPublicKey
            }
          ]
        }
      }
    }
    networkProfile: {
      networkInterfaces: [
        {
          id: nic[i].id
        }
      ]
    }
  }
}]

output vmIds array = [for i in range(0, vmCount): vm[i].id]
output vmNames array = [for i in range(0, vmCount): vm[i].name]
output publicIPIds array = [for i in range(0, vmCount): publicIp[i].id]
