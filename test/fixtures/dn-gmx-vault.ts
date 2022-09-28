import { deployments, ethers } from 'hardhat';
import { dnGmxSeniorVaultFixture } from './aave-vault';
import { generateErc20Balance } from '../utils/erc20';
import { parseEther, parseUnits } from 'ethers/lib/utils';
import { increaseBlockTimestamp } from '../utils/vault-helpers';
import addresses, { GMX_ECOSYSTEM_ADDRESSES } from './addresses';
import { glpBatchingStakingManagerFixture } from './glp-batching-staking-manager';
import { IVault__factory } from '../../typechain-types';

export const dnGmxJuniorVaultFixture = deployments.createFixture(async hre => {
  const [admin, ...users] = await hre.ethers.getSigners();

  const weth = await hre.ethers.getContractAt('ERC20Upgradeable', addresses.WETH);
  const wbtc = await hre.ethers.getContractAt('ERC20Upgradeable', addresses.WBTC);
  const usdc = await hre.ethers.getContractAt('ERC20Upgradeable', addresses.USDC);
  const usdt = await hre.ethers.getContractAt('ERC20Upgradeable', addresses.USDT);

  const aUSDC = await hre.ethers.getContractAt('ERC20Upgradeable', addresses.A_USDC);

  const fsGlp = await hre.ethers.getContractAt('ERC20Upgradeable', GMX_ECOSYSTEM_ADDRESSES.fsGLP);
  const sGlp = await hre.ethers.getContractAt('ERC20Upgradeable', GMX_ECOSYSTEM_ADDRESSES.StakedGlp);

  const rewardRouter = await hre.ethers.getContractAt('IRewardRouterV2', GMX_ECOSYSTEM_ADDRESSES.RewardRouter);

  const dnGmxJuniorVault = await (await hre.ethers.getContractFactory('DnGmxJuniorVaultMock')).deploy();

  const gmxVault = IVault__factory.connect(GMX_ECOSYSTEM_ADDRESSES.Vault, admin);

  await dnGmxJuniorVault.initialize(
    'Delta Netural GMX Vault', // _name
    'DN_GMX', // _symbol
    addresses.UNI_V3_SWAP_ROUTER, // _swapRouter
    GMX_ECOSYSTEM_ADDRESSES.RewardRouter, // _rewardRouter
    {
      weth: addresses.WETH,
      wbtc: addresses.WBTC,
      usdc: addresses.USDC,
      sGlp: GMX_ECOSYSTEM_ADDRESSES.StakedGlp,
    },
    addresses.AAVE_POOL_ADDRESS_PROVIDER, // _poolAddressesProvider
  );

  const dnGmxSeniorVault = await dnGmxSeniorVaultFixture();
  await dnGmxSeniorVault.setDnGmxJuniorVault(dnGmxJuniorVault.address);
  await dnGmxSeniorVault.updateBorrowCap(dnGmxJuniorVault.address, parseUnits('1000000', 6));
  await dnGmxSeniorVault.updateFeeStrategyParams({
    optimalUtilizationRate: 8n * 10n ** 29n,
    baseVariableBorrowRate: 10n ** 29n,
    variableRateSlope1: 10n ** 29n,
    variableRateSlope2: 5n * 10n ** 29n,
  });

  const glpBatchingStakingManagerFixtures = await glpBatchingStakingManagerFixture();
  await glpBatchingStakingManagerFixtures.gmxBatchingManager.initialize(
    GMX_ECOSYSTEM_ADDRESSES.StakedGlp,
    GMX_ECOSYSTEM_ADDRESSES.RewardRouter,
    GMX_ECOSYSTEM_ADDRESSES.GlpManager,
    dnGmxJuniorVault.address,
    admin.address,
  );
  await glpBatchingStakingManagerFixtures.setVault(dnGmxJuniorVault.address);

  await dnGmxJuniorVault.setKeeper(admin.address);

  await dnGmxJuniorVault.setDnGmxSeniorVault(dnGmxSeniorVault.address);

  await dnGmxJuniorVault.setDepositCap(ethers.constants.MaxUint256);

  await dnGmxJuniorVault.setBatchingManager(glpBatchingStakingManagerFixtures.gmxBatchingManager.address);

  await dnGmxJuniorVault.setThresholds({
    usdcRedeemSlippage: 100,
    usdcConversionThreshold: parseUnits('20', 6),
    seniorVaultWethConversionThreshold: 10n ** 15n,
  });

  await dnGmxJuniorVault.setWithdrawFee(50); //50BPS = .5%

  await dnGmxJuniorVault.setRebalanceParams({
    rebalanceTimeThreshold: ethers.constants.Zero, // or 86400
    rebalanceDeltaThreshold: 500, // 5% in bps
  });

  await dnGmxJuniorVault.setHedgeParams({
    targetHealthFactor: 15_000, // 150%
    vault: addresses.BALANCER_VAULT,
    swapRouter: addresses.UNI_V3_SWAP_ROUTER,
    aaveRewardsController: ethers.constants.AddressZero,
  });

  await dnGmxJuniorVault.grantAllowances();

  // await generateErc20Balance(weth, parseUnits('20', 18), users[0].address);
  // await generateErc20Balance(wbtc, parseUnits('5', 8), users[0].address);

  await generateErc20Balance(usdc, parseUnits('10000', 6), users[0].address);
  await generateErc20Balance(usdt, parseUnits('10000', 6), users[0].address);

  await rewardRouter.connect(users[0]).mintAndStakeGlpETH(0, 0, {
    value: parseEther('10'),
  });
  await increaseBlockTimestamp(15 * 60); // GLP cooldown
  await sGlp.connect(users[0]).approve(dnGmxJuniorVault.address, ethers.constants.MaxUint256);

  // deposit 1.5 mil in aave-vault with 1mil borrowcap
  await generateErc20Balance(usdc, parseUnits('1500000', 6), users[1].address);
  await usdc.connect(users[1]).approve(dnGmxSeniorVault.address, ethers.constants.MaxUint256);
  // await dnGmxSeniorVault.connect(users[1]).deposit(parseUnits('150', 6), users[1].address);

  hre.network.provider.request({
    method: 'hardhat_impersonateAccount',
    params: [dnGmxJuniorVault.address],
  });

  const dnGmxJuniorVaultSigner = await hre.ethers.getSigner(dnGmxJuniorVault.address);

  return {
    weth,
    wbtc,
    usdc,
    usdt,
    sGlp,
    fsGlp,
    aUSDC,
    admin,
    users,
    gmxVault,
    dnGmxSeniorVault,
    dnGmxJuniorVault,
    dnGmxJuniorVaultSigner,
    glpBatchingManager: glpBatchingStakingManagerFixtures.gmxBatchingManager,
  };
});
