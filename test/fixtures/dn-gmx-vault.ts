import { deployments, ethers } from 'hardhat';
import { aaveVaultFixture } from './aave-vault';
import { generateErc20Balance } from '../utils/erc20';
import { parseEther, parseUnits } from 'ethers/lib/utils';
import { increaseBlockTimestamp } from '../utils/vault-helpers';
import addresses, { GMX_ECOSYSTEM_ADDRESSES } from './addresses';
import { glpBatchingStakingManagerFixture } from './glp-batching-staking-manager';
import { IVault__factory } from '../../typechain-types';

export const dnGmxVaultFixture = deployments.createFixture(async hre => {
  const [admin, ...users] = await hre.ethers.getSigners();

  const weth = await hre.ethers.getContractAt('ERC20Upgradeable', addresses.WETH);
  const wbtc = await hre.ethers.getContractAt('ERC20Upgradeable', addresses.WBTC);
  const usdc = await hre.ethers.getContractAt('ERC20Upgradeable', addresses.USDC);
  const usdt = await hre.ethers.getContractAt('ERC20Upgradeable', addresses.USDT);

  const aUSDC = await hre.ethers.getContractAt('ERC20Upgradeable', addresses.A_USDC);

  const fsGlp = await hre.ethers.getContractAt('ERC20Upgradeable', GMX_ECOSYSTEM_ADDRESSES.fsGLP);
  const sGlp = await hre.ethers.getContractAt('ERC20Upgradeable', GMX_ECOSYSTEM_ADDRESSES.StakedGlp);

  const rewardRouter = await hre.ethers.getContractAt('IRewardRouterV2', GMX_ECOSYSTEM_ADDRESSES.RewardRouter);

  const dnGmxVault = await (await hre.ethers.getContractFactory('DNGmxVaultMock')).deploy();

  const gmxVault = IVault__factory.connect(GMX_ECOSYSTEM_ADDRESSES.Vault, admin);

  await dnGmxVault.initialize(
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

  const aaveVault = await aaveVaultFixture();
  await aaveVault.updateVaultCap(dnGmxVault.address, parseUnits('1000000', 6));
  await aaveVault.setDnGmxVault(dnGmxVault.address);
  await aaveVault.updateFeeStrategyParams({
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
    dnGmxVault.address,
    admin.address,
  );
  await glpBatchingStakingManagerFixtures.setVault(dnGmxVault.address);

  await dnGmxVault.setKeeper(admin.address);

  await dnGmxVault.setLPVault(aaveVault.address);

  await dnGmxVault.setDepositCap(ethers.constants.MaxUint256);

  await dnGmxVault.setBatchingManager(glpBatchingStakingManagerFixtures.gmxBatchingManager.address);

  await dnGmxVault.setThresholds({
    usdcReedemSlippage: 100,
    usdcConversionThreshold: parseUnits('20', 6),
  });

  await dnGmxVault.setRebalanceParams({
    rebalanceTimeThreshold: ethers.constants.Zero, // or 86400
    rebalanceDeltaThreshold: 500, // 5% in bps
  });

  await dnGmxVault.setHedgeParams({
    targetHealthFactor: 15_000, // 150%
    vault: addresses.BALANCER_VAULT,
    swapRouter: addresses.UNI_V3_SWAP_ROUTER,
  });

  await dnGmxVault.grantAllowances();

  // await generateErc20Balance(weth, parseUnits('20', 18), users[0].address);
  // await generateErc20Balance(wbtc, parseUnits('5', 8), users[0].address);

  await generateErc20Balance(usdc, parseUnits('10000', 6), users[0].address);
  await generateErc20Balance(usdt, parseUnits('10000', 6), users[0].address);

  await rewardRouter.connect(users[0]).mintAndStakeGlpETH(0, 0, {
    value: parseEther('10'),
  });
  await increaseBlockTimestamp(15 * 60); // GLP cooldown
  await sGlp.connect(users[0]).approve(dnGmxVault.address, ethers.constants.MaxUint256);

  // deposit 1.5 mil in aave-vault with 1mil borrowcap
  await generateErc20Balance(usdc, parseUnits('1500000', 6), users[1].address);
  await usdc.connect(users[1]).approve(aaveVault.address, ethers.constants.MaxUint256);
  await aaveVault.connect(users[1]).deposit(parseUnits('150', 6), users[1].address);

  hre.network.provider.request({
    method: 'hardhat_impersonateAccount',
    params: [dnGmxVault.address],
  });

  const dnGmxVaultSigner = await hre.ethers.getSigner(dnGmxVault.address);

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
    aaveVault,
    dnGmxVault,
    dnGmxVaultSigner,
    glpStakingManager: glpBatchingStakingManagerFixtures.glpStakingManager,
    glpBatchingManager: glpBatchingStakingManagerFixtures.gmxBatchingManager,
  };
});
