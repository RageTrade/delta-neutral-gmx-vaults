import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { getNetworkInfo, waitConfirmations } from './network-info';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const {
    deployments: { get, execute },
    getNamedAccounts,
  } = hre;

  const { deployer } = await getNamedAccounts();

  const DnGmxJuniorVaultDeployment = await get('DnGmxJuniorVault');
  const DnGmxSeniorVaultDeployment = await get('DnGmxSeniorVault');

  // TODO set right values

  // Junior Vault

  //   await execute('DnGmxSeniorVault', { from: deployer, log: true }, 'setDnGmxJuniorVault');

  //   await execute('DnGmxSeniorVault', { from: deployer, log: true }, 'setMaxUtilizationBps');

  //   await execute('DnGmxSeniorVault', { from: deployer, log: true }, 'grantAllowances');

  //   await execute('DnGmxSeniorVault', { from: deployer, log: true }, 'grantAllowances');

  //   await execute('DnGmxSeniorVault', { from: deployer, log: true }, 'updateBorrowCap');

  //   await execute('DnGmxSeniorVault', { from: deployer, log: true }, 'updateFeeStrategyParams');

  //   await execute('DnGmxSeniorVault', { from: deployer, log: true }, 'updateFeeStrategyParams');

  // Junior Vault

  //   await execute('DnGmxJuniorVault', { from: deployer, log: true }, 'grantAllowances');

  //   await execute('DnGmxJuniorVault', { from: deployer, log: true }, 'setKeeper');

  //   await execute('DnGmxJuniorVault', { from: deployer, log: true }, 'setDnGmxSeniorVault');

  //   await execute('DnGmxJuniorVault', { from: deployer, log: true }, 'setDepositCap');

  //   await execute('DnGmxJuniorVault', { from: deployer, log: true }, 'setBatchingManager');

  //   await execute('DnGmxJuniorVault', { from: deployer, log: true }, 'setWithdrawFee');

  //   await execute('DnGmxJuniorVault', { from: deployer, log: true }, 'setThresholds');

  //   await execute('DnGmxJuniorVault', { from: deployer, log: true }, 'setRebalanceParams');

  //   await execute('DnGmxJuniorVault', { from: deployer, log: true }, 'setHedgeParams');

  //   await execute('DnGmxJuniorVault', { from: deployer, log: true }, 'setFeeRecipient');
};

export default func;

func.tags = ['DnGmxVaultSettings'];
func.dependencies = ['DnGmxJuniorVault', 'DnGmxSeniorVault', 'DnGmxBatchingManager'];
