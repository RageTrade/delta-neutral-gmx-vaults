import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { getNetworkInfo, waitConfirmations } from './network-info';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const {
    deployments: { get, deploy },
    getNamedAccounts,
    ethers,
  } = hre;

  const { deployer } = await getNamedAccounts();

  console.log('🚀 Starting Senior Vault Sunset Migration...');

  // Step 1: Deploy new implementation with withdrawAll function
  console.log('📦 Deploying new DnGmxSeniorVault implementation...');

  const newImplementation = await deploy('DnGmxSeniorVaultLogicSunset', {
    contract: 'DnGmxSeniorVault',
    from: deployer,
    log: true,
    waitConfirmations,
  });

  console.log(`✅ New implementation deployed at: ${newImplementation.address}`);

  // Step 2: Get existing proxy and proxy admin
  const proxyDeployment = await get('DnGmxSeniorVault');
  const proxyAdminDeployment = await get('ProxyAdmin');

  console.log(`📋 Existing proxy: ${proxyDeployment.address}`);
  console.log(`🔧 ProxyAdmin: ${proxyAdminDeployment.address}`);

  // Step 3: Upgrade the proxy to use new implementation
  console.log('🔄 Upgrading proxy to new implementation...');

  const signer = await ethers.getSigner(deployer);

  // Use TransparentUpgradeableProxy interface like in the working test
  const proxyContract = await ethers.getContractAt('TransparentUpgradeableProxy', proxyDeployment.address);

  const upgradeTx = await proxyContract.connect(signer).upgradeTo(newImplementation.address);
  await upgradeTx.wait(waitConfirmations);

  console.log(`✅ Proxy upgraded! Transaction: ${upgradeTx.hash}`);
  console.log(`🎉 Migration completed successfully!`);
  console.log(`📝 Proxy: ${proxyDeployment.address} now uses implementation: ${newImplementation.address}`);
};

export default func;

func.tags = ['MigrateSeniorVaultSunset'];
func.dependencies = ['ProxyAdmin', 'DnGmxSeniorVault'];
func.runAtTheEnd = true; // Ensure this runs after all other deployments
