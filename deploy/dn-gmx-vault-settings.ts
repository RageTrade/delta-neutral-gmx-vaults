import { parseUnits } from 'ethers/lib/utils';
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DnGmxSeniorVault } from '../typechain-types';
import { FeeSplitStrategy } from '../typechain-types/contracts/vaults/DnGmxSeniorVault';
import { getNetworkInfo, waitConfirmations } from './network-info';
import { ethers } from 'ethers';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const {
    deployments: { get, execute },
    getNamedAccounts,
  } = hre;

  const { deployer } = await getNamedAccounts();

  const {
    KEEPER_ADDRESS,
    DEPOSIT_CAP_JUNIOR_VAULT,
    DEPOSIT_CAP_SENIOR_VAULT,
    UNI_V3_SWAP_ROUTER,
    FEE_RECIPIENT,
    FEE_BPS,
  } = await getNetworkInfo();

  const DnGmxJuniorVaultDeployment = await get('DnGmxJuniorVault');
  const DnGmxSeniorVaultDeployment = await get('DnGmxSeniorVault');
  const DnGmxBatchingManagerDeployment = await get('DnGmxBatchingManager');

  // TODO set right values

  // Senior Vault

  await execute('DnGmxSeniorVault', { from: deployer, log: true }, 'setDepositCap', DEPOSIT_CAP_SENIOR_VAULT);

  await execute(
    'DnGmxSeniorVault',
    { from: deployer, log: true },
    'setDnGmxJuniorVault',
    DnGmxJuniorVaultDeployment.address,
  );

  await execute('DnGmxSeniorVault', { from: deployer, log: true }, 'setMaxUtilizationBps', 9_000);

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

  await execute(
    'DnGmxJuniorVault',
    { from: deployer, log: true },
    'setAdminParams',
    KEEPER_ADDRESS,
    DnGmxSeniorVaultDeployment.address,
    DEPOSIT_CAP_JUNIOR_VAULT,
    DnGmxBatchingManagerDeployment.address,
    50, // 50BPS = .5%
  );

  await execute(
    'DnGmxJuniorVault',
    { from: deployer, log: true },
    'setThresholds',
    100, // slippageThresholdSwapBtcBps
    100, // slippageThresholdSwapEthBps
    10, // slippageThresholdGmxBps
    parseUnits('1', 6), // usdcConversionThreshold
    10n ** 15n, // wethConversionThreshold
    parseUnits('1', 6), // hedgeUsdcAmountThreshold
    parseUnits('1000000', 6), // partialBtcHedgeUsdcAmountThreshold
    parseUnits('1000000', 6), // partialEthHedgeUsdcAmountThreshold
  );

  await execute(
    'DnGmxJuniorVault',
    { from: deployer, log: true },
    'setHedgeParams',
    (
      await get('BalancerVault')
    ).address, // vault
    UNI_V3_SWAP_ROUTER, // swapRouter
    15_000, // 150% // targetHealthFactor
    ethers.constants.AddressZero, // aaveRewardsController
  );

  await execute(
    'DnGmxJuniorVault',
    { from: deployer, log: true },
    'setRebalanceParams',
    86400, //rebalanceTimeThreshold:
    500, // 5% in bps rebalanceDeltaThresholdBps:
    12_000,
  );

  await execute('DnGmxJuniorVault', { from: deployer, log: true }, 'setFeeParams', FEE_BPS, FEE_RECIPIENT || deployer);

  await execute('DnGmxJuniorVault', { from: deployer, log: true }, 'grantAllowances');
};

export default func;

func.tags = ['DnGmxVaultSettings', 'DnGmxVault'];
func.dependencies = ['DnGmxJuniorVault', 'DnGmxSeniorVault', 'DnGmxBatchingManager', 'BalancerVault'];
