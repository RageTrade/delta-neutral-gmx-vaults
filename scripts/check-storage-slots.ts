import hre, { deployments, ethers } from 'hardhat';

/* 
To run:

# Check specific storage slot at specific contract:
CONTRACT_ADDRESS=0xf9305009FbA7E381b3337b5fA157936d73c2CF36 CONTRACT_SLOT=0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103 yarn hardhat run scripts/check-storage-slots.ts --network arbmain

# Check EIP-1967 proxy slots at specific contract:
CONTRACT_ADDRESS=0xf9305009FbA7E381b3337b5fA157936d73c2CF36 yarn hardhat run scripts/check-storage-slots.ts --network arbmain

# Check EIP-1967 proxy slots at all deployed contracts:
yarn hardhat run scripts/check-storage-slots.ts --network arbmain
*/

// EIP-1967 Standard Storage Slots
const ADMIN_SLOT = '0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103';
const IMPLEMENTATION_SLOT = '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc';

interface StorageSlotResult {
  slot: string;
  name: string;
  rawValue: string;
  address: string;
}

async function checkStorageSlot(contractAddress: string, slot: string, slotName: string): Promise<StorageSlotResult> {
  const provider = ethers.provider;
  const rawValue = await provider.getStorageAt(contractAddress, slot);

  // Convert hex to address by taking the last 20 bytes (40 hex chars)
  let address = '';
  if (rawValue === '0x0000000000000000000000000000000000000000000000000000000000000000') {
    address = '0x0000000000000000000000000000000000000000';
  } else {
    try {
      const addressHex = '0x' + rawValue.slice(-40);
      address = ethers.utils.getAddress(addressHex);
    } catch (error) {
      // If it's not a valid address, just show the hex value
      address = 'Not an address';
    }
  }

  return {
    slot,
    name: slotName,
    rawValue,
    address,
  };
}

async function displayStorageResults(contractAddress: string, results: StorageSlotResult[]) {
  console.log(`\n🔍 Checking storage slots for contract: ${contractAddress}`);
  console.log(`📡 Network: ${hre.network.name} (Chain ID: ${(await ethers.provider.getNetwork()).chainId})`);
  console.log('='.repeat(80));

  for (const result of results) {
    console.log(`\n📋 ${result.name}:`);
    console.log(`  🔗 Slot: ${result.slot}`);
    console.log(`  📄 Raw Value: ${result.rawValue}`);

    if (result.address === 'Not an address') {
      console.log(`  📊 Data: ${result.rawValue} (${ethers.BigNumber.from(result.rawValue).toString()} as number)`);
    } else {
      console.log(`  🏠 Address: ${result.address}`);

      // Check if address is zero address
      if (result.address === '0x0000000000000000000000000000000000000000') {
        console.log(`  ⚠️  Warning: Zero address detected`);
      }
    }
  }
  console.log('\n' + '='.repeat(80));
}

async function getDefaultContracts(): Promise<string[]> {
  const { get } = deployments;
  const contracts: string[] = [];

  try {
    const contractNames = ['DnGmxJuniorVault', 'DnGmxSeniorVault', 'DnGmxBatchingManager'];

    for (const name of contractNames) {
      try {
        const deployment = await get(name);
        contracts.push(deployment.address);
        console.log(`📋 Found ${name}: ${deployment.address}`);
      } catch (error) {
        console.log(`⚠️  ${name} not deployed on this network`);
      }
    }
  } catch (error) {
    console.log('⚠️  No deployments found on this network');
  }

  return contracts;
}

async function main() {
  console.log('🚀 Storage Slot Checker');

  // Get contract address and slot from environment variables
  const contractAddress = process.env.CONTRACT_ADDRESS;
  const customSlot = process.env.CONTRACT_SLOT;

  let contractsToCheck: string[] = [];

  if (contractAddress) {
    // Validate the provided address
    try {
      const validAddress = ethers.utils.getAddress(contractAddress);
      contractsToCheck = [validAddress];
      console.log(`🎯 Checking specific contract: ${validAddress}`);
    } catch (error) {
      console.error('❌ Invalid contract address provided:', contractAddress);
      process.exit(1);
    }
  } else {
    console.log('🔍 No contract address provided, checking default deployed contracts...');
    contractsToCheck = await getDefaultContracts();

    if (contractsToCheck.length === 0) {
      console.log(
        '❌ No contracts to check. Please provide a contract address via CONTRACT_ADDRESS environment variable.',
      );
      console.log(
        'Usage: CONTRACT_ADDRESS=0x123... yarn hardhat run scripts/check-storage-slots.ts --network <network>',
      );
      process.exit(1);
    }
  }

  // Check storage slots for each contract
  for (const contract of contractsToCheck) {
    try {
      let results: StorageSlotResult[] = [];

      if (customSlot) {
        // Check only the custom slot
        console.log(`🔧 Using custom storage slot: ${customSlot}`);
        results = [await checkStorageSlot(contract, customSlot, 'Custom Storage Slot')];
      } else {
        // Check default EIP-1967 proxy slots
        console.log('🔧 Using default EIP-1967 proxy slots');
        results = await Promise.all([
          checkStorageSlot(contract, ADMIN_SLOT, 'EIP-1967 Admin Slot'),
          checkStorageSlot(contract, IMPLEMENTATION_SLOT, 'EIP-1967 Implementation Slot'),
        ]);
      }

      await displayStorageResults(contract, results);
    } catch (error) {
      console.error(`❌ Error checking storage for ${contract}:`, error);
    }
  }

  console.log('✅ Storage slot check completed!');
}

// Handle script execution
main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });
