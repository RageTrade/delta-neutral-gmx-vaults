import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { getNetworkInfo, waitConfirmations } from './network-info';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const {
    deployments: { deploy, execute },
    getNamedAccounts,
  } = hre;

  const { deployer } = await getNamedAccounts();

  await deploy('AaveVault', {
    contract: 'AaveVault',
    from: deployer,
    log: true,
    waitConfirmations,
  });

  const { USDC_ADDRESS, AAVE_POOL_ADDRESS_PROVIDER } = await getNetworkInfo();

  await execute(
    'AaveVault',
    { from: deployer, log: true },
    'initialize',
    USDC_ADDRESS,
    'Aave LP Vault',
    'Aave_LP',
    AAVE_POOL_ADDRESS_PROVIDER,
  );
};

export default func;

func.tags = ['AaveVault'];
