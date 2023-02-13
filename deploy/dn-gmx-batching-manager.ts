import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DnGmxBatchingManager__factory } from '../typechain-types';
import { getNetworkInfo, waitConfirmations } from './network-info';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const {
    deployments: { deploy, get, save },
    getNamedAccounts,
  } = hre;

  const { deployer } = await getNamedAccounts();
  const { GMX_SGLP_ADDRESS, USDC_ADDRESS, GMX_MINT_BURN_REWARD_ROUTER, GLP_MANAGER, KEEPER_BATCHING_MANAGER } =
    await getNetworkInfo();

  const DnGmxBatchingManagerLogicDeployment = await get('DnGmxBatchingManagerLogic');
  const DnGmxJuniorVaultDeployment = await get('DnGmxJuniorVault');
  const ProxyAdminDeployment = await get('ProxyAdmin');

  const proxyDeployment = await deploy('DnGmxBatchingManager', {
    contract: 'TransparentUpgradeableProxy',
    from: deployer,
    log: true,
    args: [
      DnGmxBatchingManagerLogicDeployment.address,
      ProxyAdminDeployment.address,
      DnGmxBatchingManager__factory.createInterface().encodeFunctionData('initialize', [
        GMX_SGLP_ADDRESS,
        USDC_ADDRESS,
        GMX_MINT_BURN_REWARD_ROUTER,
        GLP_MANAGER,
        DnGmxJuniorVaultDeployment.address,
        KEEPER_BATCHING_MANAGER,
      ]),
    ],
    waitConfirmations,
    skipIfAlreadyDeployed: true,
  });
  await save('DnGmxBatchingManager', { ...proxyDeployment, abi: DnGmxBatchingManagerLogicDeployment.abi });
};

export default func;

func.tags = ['DnGmxBatchingManager'];
func.dependencies = ['ProxyAdmin', 'DnGmxBatchingManagerLogic', 'DnGmxJuniorVault'];
