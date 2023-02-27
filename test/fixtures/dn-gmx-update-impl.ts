import { setBalance } from '@nomicfoundation/hardhat-network-helpers';
import { BigNumber } from 'ethers';
import { parseEther, parseUnits } from 'ethers/lib/utils';
import { deployments, ethers } from 'hardhat';
import {
  IBalancerVault__factory,
  IGlpManager__factory,
  IPoolAddressesProvider__factory,
  IPool__factory,
  IVault__factory,
  DnGmxJuniorVaultManager,
  QuoterLib,
} from '../../typechain-types';
import { generateErc20Balance } from '../utils/generator';
import { increaseBlockTimestamp } from '../utils/shared';
import addresses, { GMX_ECOSYSTEM_ADDRESSES } from './addresses';
import { dnGmxSeniorVaultFixture } from './dn-gmx-senior-vault';
import { dnGmxTraderHedgeStrategyFixture } from './dn-gmx-trader-hedge-strategy';
import { batchingManagerFixture } from './glp-batching-staking-manager';

export const dnGmxJuniorVaultFixture = deployments.createFixture(async hre => {
  const [admin, feeRecipient, ...users] = await hre.ethers.getSigners();

  const newGlpManagerAddr = '0x3963FfC9dff443c2A94f21b129D429891E32ec18';

  const weth = await hre.ethers.getContractAt('ERC20Upgradeable', addresses.WETH);
  const wbtc = await hre.ethers.getContractAt('ERC20Upgradeable', addresses.WBTC);
  const usdc = await hre.ethers.getContractAt('ERC20Upgradeable', addresses.USDC);
  const usdt = await hre.ethers.getContractAt('ERC20Upgradeable', addresses.USDT);

  const aUSDC = await hre.ethers.getContractAt('IAToken', addresses.A_USDC);

  const glp = await hre.ethers.getContractAt('ERC20Upgradeable', GMX_ECOSYSTEM_ADDRESSES.GLP);
  const fsGlp = await hre.ethers.getContractAt('ERC20Upgradeable', GMX_ECOSYSTEM_ADDRESSES.fsGLP);
  const sGlp = await hre.ethers.getContractAt('ERC20Upgradeable', GMX_ECOSYSTEM_ADDRESSES.StakedGlp);

  const rewardRouter = await hre.ethers.getContractAt('IRewardRouterV2', GMX_ECOSYSTEM_ADDRESSES.RewardRouter);
  const mintBurnRewardRouter = await hre.ethers.getContractAt(
    'IRewardRouterV2',
    '0xB95DB5B167D75e6d04227CfFFA61069348d271F5',
  );

  const stakedGmxTracker = await hre.ethers.getContractAt('IRewardTracker', await rewardRouter.stakedGmxTracker());
  const glpVester = await hre.ethers.getContractAt('IVester', await rewardRouter.glpVester());
  const gmx = await hre.ethers.getContractAt('ERC20Upgradeable', await rewardRouter.gmx());
  const esGmx = await hre.ethers.getContractAt('ERC20Upgradeable', await rewardRouter.esGmx());

  const quoterLib = (await (
    await hre.ethers.getContractFactory('contracts/libraries/QuoterLib.sol:QuoterLib')
  ).deploy()) as QuoterLib;

  const dnGmxJuniorVaultManager = (await (
    await hre.ethers.getContractFactory('contracts/libraries/DnGmxJuniorVaultManager.sol:DnGmxJuniorVaultManager', {
      libraries: { ['contracts/libraries/QuoterLib.sol:QuoterLib']: quoterLib.address },
    })
  ).deploy()) as DnGmxJuniorVaultManager;

  const dnGmxJuniorVault = await (
    await hre.ethers.getContractFactory('DnGmxJuniorVault', {
      libraries: {
        ['contracts/libraries/DnGmxJuniorVaultManager.sol:DnGmxJuniorVaultManager']: dnGmxJuniorVaultManager.address,
      },
    })
  ).deploy();

  const gmxVault = IVault__factory.connect(GMX_ECOSYSTEM_ADDRESSES.Vault, admin);

  await dnGmxJuniorVault.initialize(
    'Delta Netural GMX Vault', // _name
    'DN_GMX', // _symbol
    addresses.UNI_V3_SWAP_ROUTER, // _swapRouter
    GMX_ECOSYSTEM_ADDRESSES.RewardRouter, // _rewardRouter
    mintBurnRewardRouter.address, // _mintBurnRewardRouter
    {
      weth: addresses.WETH,
      wbtc: addresses.WBTC,
      usdc: addresses.USDC,
      sGlp: GMX_ECOSYSTEM_ADDRESSES.StakedGlp,
    },
    addresses.AAVE_POOL_ADDRESS_PROVIDER, // _poolAddressesProvider
  );

  const dnGmxTraderHedgeStrategy = await dnGmxTraderHedgeStrategyFixture();

  await dnGmxTraderHedgeStrategy.initialize(
    admin.address,
    GMX_ECOSYSTEM_ADDRESSES.Vault,
    GMX_ECOSYSTEM_ADDRESSES.GlpManager,
    dnGmxJuniorVault.address,
    GMX_ECOSYSTEM_ADDRESSES.GLP,
    addresses.WETH,
    addresses.WBTC,
  );

  await dnGmxJuniorVault.setParamsV1(0, dnGmxTraderHedgeStrategy.address);

  const bypass = await (await hre.ethers.getContractFactory('BatchingManagerBypass')).deploy();

  await bypass.setJuniorVault(dnGmxJuniorVault.address);
  await bypass.setSglp(GMX_ECOSYSTEM_ADDRESSES.StakedGlp);

  // withdraw periphery
  const withdrawPeriphery = await (await hre.ethers.getContractFactory('WithdrawPeriphery')).deploy();

  await withdrawPeriphery.setSlippageThreshold(100);
  await withdrawPeriphery.setAddresses(dnGmxJuniorVault.address, mintBurnRewardRouter.address);

  // deposit periphery
  const depositPeriphery = await (await hre.ethers.getContractFactory('DepositPeriphery')).deploy();

  await depositPeriphery.setSlippageThreshold(100);
  ///@dev setting JIT router as junior vault since JIT router is not available in current fork state
  await depositPeriphery.setAddresses(dnGmxJuniorVault.address, mintBurnRewardRouter.address, newGlpManagerAddr);

  await dnGmxJuniorVault.setFeeParams(1000, feeRecipient.address);

  const dnGmxSeniorVault = await dnGmxSeniorVaultFixture();
  await dnGmxSeniorVault.setDnGmxJuniorVault(dnGmxJuniorVault.address);
  await dnGmxSeniorVault.updateBorrowCap(dnGmxJuniorVault.address, parseUnits('1000000', 6));
  await dnGmxSeniorVault.updateFeeStrategyParams({
    optimalUtilizationRate: 8n * 10n ** 29n,
    baseVariableBorrowRate: 10n ** 29n,
    variableRateSlope1: 10n ** 29n,
    variableRateSlope2: 5n * 10n ** 29n,
  });

  const { usdcBatchingManager, glpBatchingManager } = await batchingManagerFixture();
  await usdcBatchingManager.initialize(
    GMX_ECOSYSTEM_ADDRESSES.StakedGlp,
    usdc.address,
    mintBurnRewardRouter.address,
    newGlpManagerAddr,
    dnGmxJuniorVault.address,
    admin.address,
  );

  await usdcBatchingManager.setDepositCap(parseUnits('1000000000', 18));

  await usdcBatchingManager.grantAllowances();
  await usdcBatchingManager.setThresholds(100, parseUnits('10', 6));

  await glpBatchingManager.initialize(
    GMX_ECOSYSTEM_ADDRESSES.StakedGlp,
    mintBurnRewardRouter.address,
    newGlpManagerAddr,
    dnGmxJuniorVault.address,
    admin.address,
  );

  await glpBatchingManager.setDepositCap(parseUnits('1000000000', 18));

  await glpBatchingManager.grantAllowances();
  await glpBatchingManager.setThresholds(parseUnits('10', 18));

  await dnGmxJuniorVault.setAdminParams(admin.address, dnGmxSeniorVault.address, ethers.constants.MaxUint256, 50, 3000);

  await dnGmxJuniorVault.setThresholds(
    100, //_slippageThresholdSwapBtcBps
    100, //_slippageThresholdSwapEthBps
    100, //_slippageThresholdGmxBps
    parseUnits('1', 6), //_usdcConversionThreshold
    10n ** 15n, //_wethConversionThreshold
    parseUnits('1', 6), //_hedgeUsdcAmountThreshold
    parseUnits('1000000', 6), //partialBtcHedgeUsdcAmountThreshold
    parseUnits('1000000', 6), //partialEthHedgeUsdcAmountThreshold
  );

  const targetHealthFactor = 15_000;
  const usdcLiquidationThreshold = 8_500;

  await dnGmxJuniorVault.setHedgeParams(
    addresses.BALANCER_VAULT, //vault:
    addresses.UNI_V3_SWAP_ROUTER, //swapRouter:
    targetHealthFactor, // 150%
    ethers.constants.AddressZero, //aaveRewardsController:
  );

  await dnGmxJuniorVault.setRebalanceParams(
    ethers.constants.Zero, // or 86400 | rebalanceTimeThreshold
    500, // 5% in bps | rebalanceDeltaThresholdBps
    12_000,
  );

  await dnGmxJuniorVault.grantAllowances();

  // await generateErc20Balance(weth, parseUnits('20', 18), users[0].address);
  // await generateErc20Balance(wbtc, parseUnits('5', 8), users[0].address);

  await generateErc20Balance(usdc, parseUnits('10000', 6), users[0].address);

  await setBalance(admin.address, parseEther('100000'));
  await setBalance(feeRecipient.address, parseEther('100000'));
  await setBalance(users[0].address, parseEther('100000'));
  await setBalance(users[1].address, parseEther('100000'));
  await mintBurnRewardRouter.connect(users[0]).mintAndStakeGlpETH(0, 0, {
    value: parseEther('100'),
  });
  await mintBurnRewardRouter.connect(users[1]).mintAndStakeGlpETH(0, 0, {
    value: parseEther('5'),
  });
  await increaseBlockTimestamp(15 * 60); // GLP cooldown
  await sGlp.connect(users[0]).approve(dnGmxJuniorVault.address, ethers.constants.MaxUint256);

  // deposit 1.5 mil in aave-vault with 1mil borrowcap
  await generateErc20Balance(usdc, parseUnits('1500000', 6), users[1].address);
  await usdc.connect(users[1]).approve(dnGmxSeniorVault.address, ethers.constants.MaxUint256);
  // await dnGmxSeniorVault.connect(users[1]).deposit(parseUnits('150', 6), users[1].address);

  const poolAddressProvider = IPoolAddressesProvider__factory.connect(addresses.AAVE_POOL_ADDRESS_PROVIDER, admin);
  const lendingPool = IPool__factory.connect(await poolAddressProvider.getPool(), admin);

  const gov = GMX_ECOSYSTEM_ADDRESSES.GOV;

  const glpManager = IGlpManager__factory.connect(newGlpManagerAddr, admin);

  const vdWBTC = await hre.ethers.getContractAt(
    'contracts/interfaces/IDebtToken.sol:IDebtToken',
    (
      await lendingPool.getReserveData(wbtc.address)
    ).variableDebtTokenAddress,
  );
  const vdWETH = await hre.ethers.getContractAt(
    'contracts/interfaces/IDebtToken.sol:IDebtToken',
    (
      await lendingPool.getReserveData(weth.address)
    ).variableDebtTokenAddress,
  );

  const balancer = IBalancerVault__factory.connect(addresses.BALANCER_VAULT, admin);

  await hre.network.provider.request({
    method: 'hardhat_impersonateAccount',
    params: [dnGmxJuniorVault.address],
  });
  await hre.network.provider.send('hardhat_setBalance', [dnGmxJuniorVault.address, '0x1000000000000']);

  await hre.network.provider.request({
    method: 'hardhat_impersonateAccount',
    params: [GMX_ECOSYSTEM_ADDRESSES.GOV],
  });
  await hre.network.provider.send('hardhat_setBalance', [GMX_ECOSYSTEM_ADDRESSES.GOV, '0x1000000000000']);

  await hre.network.provider.request({
    method: 'hardhat_impersonateAccount',
    params: ['0x7b1FFdDEEc3C4797079C7ed91057e399e9D43a8B'],
  });

  const dnGmxJuniorVaultSigner = await hre.ethers.getSigner(dnGmxJuniorVault.address);

  return {
    glp,
    gov,
    weth,
    wbtc,
    usdc,
    usdt,
    sGlp,
    fsGlp,
    gmx,
    esGmx,
    stakedGmxTracker,
    glpVester,
    aUSDC,
    vdWBTC,
    vdWETH,
    admin,
    feeRecipient,
    users,
    balancer,
    gmxVault,
    glpManager,
    lendingPool,
    depositPeriphery,
    withdrawPeriphery,
    dnGmxSeniorVault,
    dnGmxJuniorVault,
    dnGmxJuniorVaultManager,
    rewardRouter,
    mintBurnRewardRouter,
    targetHealthFactor,
    dnGmxJuniorVaultSigner,
    usdcLiquidationThreshold,
    glpBatchingManager,
    usdcBatchingManager,
    dnGmxTraderHedgeStrategy,
  };
});
