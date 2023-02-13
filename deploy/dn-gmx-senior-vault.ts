import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DnGmxSeniorVault__factory } from '../typechain-types';
import { getNetworkInfo, waitConfirmations } from './network-info';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const {
    deployments: { get, deploy, save },
    getNamedAccounts,
  } = hre;

  const { deployer } = await getNamedAccounts();
  const { USDC_ADDRESS, AAVE_POOL_ADDRESS_PROVIDER } = await getNetworkInfo();

  const ProxyAdminDeployment = await get('ProxyAdmin');
  const DnGmxSeniorVaultLogicDeployment = await get('DnGmxSeniorVaultLogic');

  const proxyDeployment = await deploy('DnGmxSeniorVault', {
    contract: 'TransparentUpgradeableProxy',
    from: deployer,
    log: true,
    args: [
      DnGmxSeniorVaultLogicDeployment.address,
      ProxyAdminDeployment.address,
      DnGmxSeniorVault__factory.createInterface().encodeFunctionData('initialize', [
        USDC_ADDRESS,
        'Delta Netural GMX Vault (Senior)',
        'DN_GMX_SENIOR',
        AAVE_POOL_ADDRESS_PROVIDER,
      ]),
    ],
    waitConfirmations,
    skipIfAlreadyDeployed: true,
  });
  await save('DnGmxSeniorVault', { ...proxyDeployment, abi: DnGmxSeniorVaultLogicDeployment.abi });
};

export default func;

func.tags = ['DnGmxSeniorVault'];
func.dependencies = ['ProxyAdmin', 'DnGmxSeniorVaultLogic'];
