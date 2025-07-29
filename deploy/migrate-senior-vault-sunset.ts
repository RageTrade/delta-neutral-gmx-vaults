import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { ethers } from 'hardhat';
import { waitConfirmations } from './network-info';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const {
    deployments: { deploy },
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

  console.log('🚀 Starting Senior Vault Sunset Migration...');
  console.log(`📝 Deploying from account: ${deployer}`);

  // Step 1: Deploy new implementation with withdrawToMultisig function
  console.log('📁 Deploying DnGmxSeniorVault implementation...');

  const newVaultLogic = await deploy('DnGmxSeniorVaultLogic', {
    contract: 'DnGmxSeniorVault',
    from: deployer,
    log: true,
    waitConfirmations,
  });

  console.log(`✅ New implementation deployed at: ${newVaultLogic.address}`);
};

export default func;

func.tags = ['MigrateSeniorVaultSunset'];
func.runAtTheEnd = true; // Ensure this runs after all other deployments
