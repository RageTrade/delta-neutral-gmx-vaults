import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { waitConfirmations } from './network-info';
import { ethers } from 'hardhat';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const {
    deployments: { deploy, get },
  } = hre;

  // Get PRIVATE_KEY from environment
  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) {
    throw new Error('PRIVATE_KEY environment variable is required');
  }

  // Create wallet from private key
  const wallet = new ethers.Wallet(privateKey, ethers.provider);
  const deployer = wallet.address;
  console.log('deployer', deployer);

  console.log('🚀 Starting Junior Vault Sunset Migration...');

  // Step 1: Deploy new implementation with withdrawAll function
  console.log('📦 Deploying new DnGmxJuniorVault implementation...');

  const DnGmxJuniorVaultManagerLibraryDeployment = await get('DnGmxJuniorVaultManagerLibrary');

  const newImplementation = await deploy('DnGmxJuniorVaultLogic', {
    contract: 'DnGmxJuniorVault',
    from: deployer,
    log: true,
    waitConfirmations,
    libraries: {
      DnGmxJuniorVaultManager: DnGmxJuniorVaultManagerLibraryDeployment.address,
    },
  });

  console.log(`✅ New implementation deployed at: ${newImplementation.address}`);
};

export default func;

func.tags = ['MigrateJuniorVaultSunset'];
func.runAtTheEnd = true; // Ensure this runs after all other deployments
