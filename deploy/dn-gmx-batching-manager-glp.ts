import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DnGmxBatchingManagerGlp__factory } from '../typechain-types';
import { getNetworkInfo, waitConfirmations } from './network-info';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const {
    deployments: { deploy, get, save },
    getNamedAccounts,
  } = hre;

  const { deployer } = await getNamedAccounts();
  const { GMX_SGLP_ADDRESS, GMX_MINT_BURN_REWARD_ROUTER, GLP_MANAGER, KEEPER_BATCHING_MANAGER } =
    await getNetworkInfo();

  const DnGmxBatchingManagerGlpLogicDeployment = await get('DnGmxBatchingManagerGlpLogic');
  const DnGmxJuniorVaultDeployment = await get('DnGmxJuniorVault');
  const ProxyAdminDeployment = await get('ProxyAdmin');

  const proxyDeployment = await deploy('DnGmxBatchingManagerGlp', {
    contract: 'TransparentUpgradeableProxy',
    from: deployer,
    log: true,
    args: [
      DnGmxBatchingManagerGlpLogicDeployment.address,
      ProxyAdminDeployment.address,
      DnGmxBatchingManagerGlp__factory.createInterface().encodeFunctionData('initialize', [
        GMX_SGLP_ADDRESS,
        GMX_MINT_BURN_REWARD_ROUTER,
        GLP_MANAGER,
        DnGmxJuniorVaultDeployment.address,
        KEEPER_BATCHING_MANAGER,
      ]),
    ],
    waitConfirmations,
  });
  await save('DnGmxBatchingManagerGlp', { ...proxyDeployment, abi: DnGmxBatchingManagerGlpLogicDeployment.abi });
};

export default func;

func.tags = ['DnGmxBatchingManagerGlp'];
func.dependencies = ['ProxyAdmin', 'DnGmxBatchingManagerGlpLogic', 'DnGmxJuniorVault'];
