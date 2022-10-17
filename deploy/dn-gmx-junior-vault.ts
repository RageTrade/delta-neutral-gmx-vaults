import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { getNetworkInfo, waitConfirmations } from './network-info';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const {
    deployments: { get, deploy, execute },
    getNamedAccounts,
  } = hre;

  const { deployer } = await getNamedAccounts();

  const SwapManagerLibraryDeployment = await get('SwapManagerLibrary');
  const DnGmxJuniorVaultHelpersLibraryDeployment = await get('DnGmxJuniorVaultHelpersLibrary');

  await deploy('DnGmxJuniorVault', {
    contract: 'DnGmxJuniorVault',
    from: deployer,
    log: true,
    waitConfirmations,
    libraries: {
      SwapManager: SwapManagerLibraryDeployment.address,
      DnGmxJuniorVaultHelpers: DnGmxJuniorVaultHelpersLibraryDeployment.address,
    },
  });

  const {
    WETH_ADDRESS,
    WBTC_ADDRESS,
    USDC_ADDRESS,

    CURVE_TRICRYPTO_POOL_ADDRESS,

    GMX_REWARD_ROUTER,
    GMX_SGLP_ADDRESS,

    UNI_V3_SWAP_ROUTER,
    AAVE_POOL_ADDRESS_PROVIDER,
  } = await getNetworkInfo();

  await execute(
    'DnGmxJuniorVault',
    { from: deployer, log: true },
    'initialize',
    'Delta Netural GMX Vault', // _name
    'DN_GMX_JUNIOR', // _symbol
    UNI_V3_SWAP_ROUTER,
    GMX_REWARD_ROUTER,
    {
      weth: WETH_ADDRESS,
      wbtc: WBTC_ADDRESS,
      sGlp: GMX_SGLP_ADDRESS,
      usdc: USDC_ADDRESS,
      usdt: USDC_ADDRESS,
    },
    AAVE_POOL_ADDRESS_PROVIDER,
  );
};

export default func;

func.tags = ['DnGmxJuniorVault'];
func.dependencies = ['SwapManagerLibrary', 'DnGmxJuniorVaultHelpersLibrary'];
