import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { getNetworkInfo, waitConfirmations } from './network-info';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const {
    deployments: { deploy, execute },
    getNamedAccounts,
  } = hre;

  const { deployer } = await getNamedAccounts();

  await deploy('DNGmxVault', {
    contract: 'DNGmxVault',
    from: deployer,
    log: true,
    waitConfirmations,
  });

  const {
    WETH_ADDRESS,
    WBTC_ADDRESS,
    USDC_ADDRESS,

    GMX_REWARD_ROUTER,
    GMX_SGLP_ADDRESS,

    UNI_V3_SWAP_ROUTER,
    AAVE_POOL_ADDRESS_PROVIDER,
  } = await getNetworkInfo();

  await execute(
    'DNGmxVault',
    { from: deployer, log: true },
    'initialize',
    'Delta Netural GMX Vault', // _name
    'DN_GMX', // _symbol
    UNI_V3_SWAP_ROUTER,
    GMX_REWARD_ROUTER,
    {
      weth: WETH_ADDRESS,
      wbtc: WBTC_ADDRESS,
      usdc: USDC_ADDRESS,
      sGlp: GMX_SGLP_ADDRESS,
    },
    AAVE_POOL_ADDRESS_PROVIDER,
  );
};

export default func;

func.tags = ['DNGmxVault'];
