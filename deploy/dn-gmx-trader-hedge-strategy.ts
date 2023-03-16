import { gmxProtocol } from '@ragetrade/sdk';
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DnGmxBatchingManagerGlp__factory, DnGmxTraderHedgeStrategy__factory } from '../typechain-types';
import { getNetworkInfo, waitConfirmations } from './network-info';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const {
    deployments: { deploy, get, save },
    getNamedAccounts,
  } = hre;

  const { deployer } = await getNamedAccounts();
  const { GLP_MANAGER, GLP_ADDRESS, GMX_VAULT, KEEPER_TRADER_HEDGE_STRATEGY, WETH_ADDRESS, WBTC_ADDRESS } =
    await getNetworkInfo();

  const DnGmxJuniorVaultDeployment = await get('DnGmxJuniorVault');
  const DnGmxTraderHedgeStrategyLogicDeployment = await get('DnGmxTraderHedgeStrategyLogic');
  const ProxyAdminDeployment = await get('ProxyAdmin');

  const proxyDeployment = await deploy('DnGmxTraderHedgeStrategy', {
    contract: 'TransparentUpgradeableProxy',
    from: deployer,
    log: true,
    args: [
      DnGmxTraderHedgeStrategyLogicDeployment.address,
      ProxyAdminDeployment.address,
      DnGmxTraderHedgeStrategy__factory.createInterface().encodeFunctionData('initialize', [
        KEEPER_TRADER_HEDGE_STRATEGY,
        GMX_VAULT,
        GLP_MANAGER,
        DnGmxJuniorVaultDeployment.address,
        GLP_ADDRESS,
        WETH_ADDRESS,
        WBTC_ADDRESS,
      ]),
    ],
    waitConfirmations,
    skipIfAlreadyDeployed: true,
  });
  await save('DnGmxTraderHedgeStrategy', { ...proxyDeployment, abi: DnGmxTraderHedgeStrategyLogicDeployment.abi });
};

export default func;

func.tags = ['DnGmxTraderHedgeStrategy'];
func.dependencies = ['ProxyAdmin', 'DnGmxTraderHedgeStrategyLogic'];
