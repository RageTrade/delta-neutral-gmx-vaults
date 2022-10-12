import { parseUnits } from 'ethers/lib/utils';
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DnGmxSeniorVault } from '../typechain-types';
import { FeeSplitStrategy } from '../typechain-types/contracts/vaults/DnGmxSeniorVault';
import { DnGmxJuniorVaultStorage } from '../typechain-types/contracts/vaults/DnGmxJuniorVault';
import { getNetworkInfo, waitConfirmations } from './network-info';
import { ethers } from 'ethers';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const {
    deployments: { get, execute },
    getNamedAccounts,
  } = hre;

  const { deployer } = await getNamedAccounts();

  const { KEEPER_ADDRESS, DEPOSIT_CAP_JUNIOR_VAULT, UNI_V3_SWAP_ROUTER, FEE_RECIPIENT } = await getNetworkInfo();

  const DnGmxJuniorVaultDeployment = await get('DnGmxJuniorVault');
  const DnGmxSeniorVaultDeployment = await get('DnGmxSeniorVault');
  const DnGmxBatchingManagerDeployment = await get('DnGmxBatchingManager');

  // TODO set right values

  // Senior Vault

  await execute(
    'DnGmxSeniorVault',
    { from: deployer, log: true },
    'setDnGmxJuniorVault',
    DnGmxJuniorVaultDeployment.address,
  );

  await execute('DnGmxSeniorVault', { from: deployer, log: true }, 'setMaxUtilizationBps', 10); // TODO confirm

  await execute(
    'DnGmxSeniorVault',
    { from: deployer, log: true },
    'updateBorrowCap',
    DnGmxJuniorVaultDeployment.address,
    parseUnits('1000000', 6),
  );

  const feeStrategyParams: FeeSplitStrategy.InfoStruct = {
    optimalUtilizationRate: 8n * 10n ** 29n,
    baseVariableBorrowRate: 10n ** 29n,
    variableRateSlope1: 10n ** 29n,
    variableRateSlope2: 5n * 10n ** 29n,
  };
  await execute('DnGmxSeniorVault', { from: deployer, log: true }, 'updateFeeStrategyParams', feeStrategyParams);

  await execute('DnGmxSeniorVault', { from: deployer, log: true }, 'grantAllowances');

  // Junior Vault

  await execute('DnGmxJuniorVault', { from: deployer, log: true }, 'setKeeper', KEEPER_ADDRESS);

  await execute(
    'DnGmxJuniorVault',
    { from: deployer, log: true },
    'setDnGmxSeniorVault',
    DnGmxSeniorVaultDeployment.address,
  );

  await execute('DnGmxJuniorVault', { from: deployer, log: true }, 'setDepositCap', DEPOSIT_CAP_JUNIOR_VAULT);

  await execute(
    'DnGmxJuniorVault',
    { from: deployer, log: true },
    'setBatchingManager',
    DnGmxBatchingManagerDeployment.address,
  );

  await execute('DnGmxJuniorVault', { from: deployer, log: true }, 'setWithdrawFee', 50); // 50BPS = .5%

  const thresholds: DnGmxJuniorVaultStorage.YieldStrategyParamsStruct = {
    usdcRedeemSlippage: 100,
    usdcConversionThreshold: parseUnits('20', 6),
    seniorVaultWethConversionThreshold: 10n ** 15n,
  };
  await execute('DnGmxJuniorVault', { from: deployer, log: true }, 'setThresholds', thresholds);

  const balanceParams: DnGmxJuniorVaultStorage.RebalanceStrategyParamsStruct = {
    rebalanceTimeThreshold: ethers.constants.Zero, // or 86400
    rebalanceDeltaThreshold: 500, // 5% in bps
  };
  await execute('DnGmxJuniorVault', { from: deployer, log: true }, 'setRebalanceParams', balanceParams);

  const hedgeParams: DnGmxJuniorVaultStorage.HedgeStrategyParamsStruct = {
    targetHealthFactor: 15_000, // 150%
    vault: (await get('BalancerVault')).address,
    swapRouter: UNI_V3_SWAP_ROUTER,
    aaveRewardsController: ethers.constants.AddressZero,
  };
  await execute('DnGmxJuniorVault', { from: deployer, log: true }, 'setHedgeParams', hedgeParams);

  await execute('DnGmxJuniorVault', { from: deployer, log: true }, 'setFeeRecipient', FEE_RECIPIENT || deployer);

  await execute('DnGmxJuniorVault', { from: deployer, log: true }, 'grantAllowances');
};

export default func;

func.tags = ['DnGmxVaultSettings', 'DnGmxVault'];
func.dependencies = ['DnGmxJuniorVault', 'DnGmxSeniorVault', 'DnGmxBatchingManager', 'BalancerVault'];
