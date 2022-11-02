import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DnGmxBatchingManager__factory, DnGmxJuniorVault__factory } from '../typechain-types';
import { getNetworkInfo, waitConfirmations } from './network-info';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const {
    deployments: { deploy, get, save },
    getNamedAccounts,
  } = hre;

  const { deployer } = await getNamedAccounts();
  const {
    USDC_ADDRESS,
    WETH_ADDRESS,
    WBTC_ADDRESS,

    UNI_V3_SWAP_ROUTER,
    AAVE_POOL_ADDRESS_PROVIDER,

    GMX_SGLP_ADDRESS,
    GMX_REWARD_ROUTER,
  } = await getNetworkInfo();

  const ProxyAdminDeployment = await get('ProxyAdmin');
  const DnGmxJuniorVaultLogicDeployment = await get('DnGmxJuniorVaultLogic');

  const proxyDeployment = await deploy('DnGmxJuniorVault', {
    contract: 'TransparentUpgradeableProxy',
    from: deployer,
    log: true,
    args: [
      DnGmxJuniorVaultLogicDeployment.address,
      ProxyAdminDeployment.address,
      DnGmxJuniorVault__factory.createInterface().encodeFunctionData('initialize', [
        'Delta Netural GMX Vault (Junior)', // _name
        'DN_GMX_JUNIOR', // _symbol
        UNI_V3_SWAP_ROUTER,
        GMX_REWARD_ROUTER,
        {
          weth: WETH_ADDRESS,
          wbtc: WBTC_ADDRESS,
          sGlp: GMX_SGLP_ADDRESS,
          usdc: USDC_ADDRESS,
        },
        AAVE_POOL_ADDRESS_PROVIDER,
      ]),
    ],
    waitConfirmations,
  });
  await save('DnGmxJuniorVault', { ...proxyDeployment, abi: DnGmxJuniorVaultLogicDeployment.abi });
};

export default func;

func.tags = ['DnGmxJuniorVault'];
func.dependencies = ['ProxyAdmin', 'DnGmxJuniorVaultLogic'];
