import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { getNetworkInfo, waitConfirmations } from './network-info';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const {
    deployments: { get, execute },
    getNamedAccounts,
  } = hre;

  const { deployer } = await getNamedAccounts();

  const {
    BORROW_CAP,
    THRESHOLDS,
    KEEPER_JR_VAULT,
    REBALANCE_PARAMS,
    WITHDRAW_FEE_BPS,
    FEE_TIER_WETH_WBTC_POOL,
    TARGET_HEALTH_FACTOR,
    AAVE_REWARDS_CONTROLLER,
    GMX_SGLP_ADDRESS,
    GMX_MINT_BURN_REWARD_ROUTER,
    GLP_MANAGER,
    DEPOSIT_CAP_JR_VAULT,
    DEPOSIT_CAP_SR_VAULT,
    MAX_UTILIZATION_BPS,
    UNI_V3_SWAP_ROUTER,
    FEE_STRATEGY_PARAMS,
    FEE_RECIPIENT,
    FEE_BPS,
    KEEPER_BATCHING_MANAGER,
    ROUND_DEPOSIT_CAP,
    SLIPPAGE_THRESHOLD_BATCHING_MANAGER,
    GLP_DEPOSIT_PENDING_THRESHOLD,
    SLIPPAGE_THRESHOLD_WITHDRAW_PERIPHERY,
    SLIPPAGE_THRESHOLD_DEPOSIT_PERIPHERY,
  } = await getNetworkInfo();

  const DnGmxJuniorVaultDeployment = await get('DnGmxJuniorVault');
  const DnGmxSeniorVaultDeployment = await get('DnGmxSeniorVault');
  const DnGmxBatchingManagerDeployment = await get('DnGmxBatchingManager');
  const BatchingManagerBypassDeployment = await get('BatchingManagerBypass');

  // Senior Vault

  await execute(
    'DnGmxSeniorVault',
    { from: deployer, log: true, waitConfirmations },
    'setDepositCap',
    DEPOSIT_CAP_SR_VAULT,
  );

  await execute(
    'DnGmxSeniorVault',
    { from: deployer, log: true },
    'setDnGmxJuniorVault',
    DnGmxJuniorVaultDeployment.address,
  );

  await execute(
    'DnGmxSeniorVault',
    { from: deployer, log: true, waitConfirmations },
    'setMaxUtilizationBps',
    MAX_UTILIZATION_BPS,
  );

  await execute(
    'DnGmxSeniorVault',
    { from: deployer, log: true },
    'updateBorrowCap',
    DnGmxJuniorVaultDeployment.address,
    BORROW_CAP,
  );

  await execute(
    'DnGmxSeniorVault',
    { from: deployer, log: true, waitConfirmations },
    'updateFeeStrategyParams',
    FEE_STRATEGY_PARAMS,
  );

  await execute('DnGmxSeniorVault', { from: deployer, log: true, waitConfirmations }, 'grantAllowances');

  // Junior Vault

  await execute(
    'DnGmxJuniorVault',
    { from: deployer, log: true, waitConfirmations },
    'setAdminParams',
    KEEPER_JR_VAULT,
    DnGmxSeniorVaultDeployment.address,
    DEPOSIT_CAP_JR_VAULT,
    DnGmxBatchingManagerDeployment.address,
    WITHDRAW_FEE_BPS,
    FEE_TIER_WETH_WBTC_POOL,
  );

  await execute(
    'DnGmxJuniorVault',
    { from: deployer, log: true, waitConfirmations },
    'setThresholds',
    THRESHOLDS.slippageThresholdSwapBtcBps,
    THRESHOLDS.slippageThresholdSwapEthBps,
    THRESHOLDS.slippageThresholdGmxBps,
    THRESHOLDS.usdcConversionThreshold,
    THRESHOLDS.wethConversionThreshold,
    THRESHOLDS.hedgeUsdcAmountThreshold,
    THRESHOLDS.partialBtcHedgeUsdcAmountThreshold,
    THRESHOLDS.partialEthHedgeUsdcAmountThreshold,
  );

  await execute(
    'DnGmxJuniorVault',
    { from: deployer, log: true, waitConfirmations },
    'setHedgeParams',
    (
      await get('BalancerVault')
    ).address, // balancer vault
    UNI_V3_SWAP_ROUTER, // swapRouter
    TARGET_HEALTH_FACTOR, // targetHealthFactor
    AAVE_REWARDS_CONTROLLER, // aaveRewardsController
  );

  await execute(
    'DnGmxJuniorVault',
    { from: deployer, log: true, waitConfirmations },
    'setRebalanceParams',
    REBALANCE_PARAMS.rebalanceTimeThreshold,
    REBALANCE_PARAMS.rebalanceDeltaThresholdBps,
    REBALANCE_PARAMS.rebalanceHfThresholdBps,
  );

  await execute(
    'DnGmxJuniorVault',
    { from: deployer, log: true, waitConfirmations },
    'setFeeParams',
    FEE_BPS,
    FEE_RECIPIENT || deployer,
  );

  await execute('DnGmxJuniorVault', { from: deployer, log: true, waitConfirmations }, 'grantAllowances');

  // batching manager

  await execute(
    'DnGmxBatchingManager',
    { from: deployer, log: true, waitConfirmations },
    'setThresholds',
    SLIPPAGE_THRESHOLD_BATCHING_MANAGER,
    GLP_DEPOSIT_PENDING_THRESHOLD,
  );

  await execute('DnGmxBatchingManager', { from: deployer, log: true, waitConfirmations }, 'grantAllowances');

  await execute(
    'DnGmxBatchingManager',
    { from: deployer, log: true, waitConfirmations },
    'setBypass',
    BatchingManagerBypassDeployment.address,
  );

  await execute(
    'DnGmxBatchingManager',
    { from: deployer, log: true, waitConfirmations },
    'setKeeper',
    KEEPER_BATCHING_MANAGER,
  );

  await execute(
    'DnGmxBatchingManager',
    { from: deployer, log: true, waitConfirmations },
    'setDepositCap',
    ROUND_DEPOSIT_CAP,
  );

  // batching manager bypass

  await execute(
    'BatchingManagerBypass',
    { from: deployer, log: true, waitConfirmations },
    'setJuniorVault',
    DnGmxJuniorVaultDeployment.address,
  );

  await execute('BatchingManagerBypass', { from: deployer, log: true, waitConfirmations }, 'setSglp', GMX_SGLP_ADDRESS);

  // deposit periphery

  await execute(
    'DepositPeriphery',
    { from: deployer, log: true, waitConfirmations },
    'setAddresses',
    DnGmxJuniorVaultDeployment.address,
    GMX_MINT_BURN_REWARD_ROUTER,
    GLP_MANAGER,
  );

  await execute(
    'DepositPeriphery',
    { from: deployer, log: true, waitConfirmations },
    'setSlippageThreshold',
    SLIPPAGE_THRESHOLD_DEPOSIT_PERIPHERY,
  );

  // withdraw periphery

  await execute(
    'WithdrawPeriphery',
    { from: deployer, log: true, waitConfirmations },
    'setAddresses',
    DnGmxJuniorVaultDeployment.address,
    GMX_MINT_BURN_REWARD_ROUTER,
  );

  await execute(
    'WithdrawPeriphery',
    { from: deployer, log: true, waitConfirmations },
    'setSlippageThreshold',
    SLIPPAGE_THRESHOLD_WITHDRAW_PERIPHERY,
  );
};

export default func;

func.tags = ['DnGmxVaultSettings', 'DnGmxVault'];
func.dependencies = [
  'DnGmxJuniorVault',
  'DnGmxSeniorVault',
  'DnGmxBatchingManager',
  'WithdrawPeriphery',
  'DepositPeriphery',
  'BatchingManagerBypass',
  'BalancerVault',
];
