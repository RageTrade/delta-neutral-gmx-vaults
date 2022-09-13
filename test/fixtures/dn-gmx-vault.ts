import { parseEther, parseUnits } from 'ethers/lib/utils';
import { deployments, ethers } from 'hardhat';
import { aaveVaultFixture } from './aave-vault';
import { generateErc20Balance } from '../utils/erc20';
import addresses, { GMX_ECOSYSTEM_ADDRESSES } from './addresses';
import { glpBatchingStakingManagerFixture } from './glp-batching-staking-manager';

export const dnGmxVaultFixture = deployments.createFixture(async hre => {
  const [admin, ...users] = await hre.ethers.getSigners();

  const weth = await hre.ethers.getContractAt('ERC20Upgradeable', addresses.WETH);
  const wbtc = await hre.ethers.getContractAt('ERC20Upgradeable', addresses.WBTC);
  const usdc = await hre.ethers.getContractAt('ERC20Upgradeable', addresses.USDC);
  const usdt = await hre.ethers.getContractAt('ERC20Upgradeable', addresses.USDT);

  const fsGlp = await hre.ethers.getContractAt('ERC20Upgradeable', GMX_ECOSYSTEM_ADDRESSES.fsGLP);
  const sGlp = await hre.ethers.getContractAt('ERC20Upgradeable', GMX_ECOSYSTEM_ADDRESSES.StakedGlp);

  const rewardRouter = await hre.ethers.getContractAt('IRewardRouterV2', GMX_ECOSYSTEM_ADDRESSES.RewardRouter);

  const dnGmxVault = await (await hre.ethers.getContractFactory('DNGmxVaultMock')).deploy();

  await dnGmxVault.initialize(
    'Delta Netural GMX Vault', // _name
    'DN_GMX', // _symbol
    addresses.UNI_V3_SWAP_ROUTER, // _swapRouter
    GMX_ECOSYSTEM_ADDRESSES.RewardRouter, // _rewardRouter
    addresses.AAVE_POOL_ADDRESS_PROVIDER, // _poolAddressesProvider
    {
      weth: addresses.WETH,
      wbtc: addresses.WBTC,
      usdc: addresses.USDC,
      sGlp: GMX_ECOSYSTEM_ADDRESSES.StakedGlp,
    },
  );

  const aaveVault = await aaveVaultFixture();
  await aaveVault.updateVaultCap(dnGmxVault.address, parseUnits('1000000', 6));

  const glpBatchingStakingManagerFixtures = await glpBatchingStakingManagerFixture();
  await glpBatchingStakingManagerFixtures.setVault(dnGmxVault.address);

  await dnGmxVault.setKeeper(admin.address);

  await dnGmxVault.setLPVault(ethers.constants.AddressZero);

  await dnGmxVault.setDepositCap(ethers.constants.MaxUint256);

  await dnGmxVault.setStakingManager(glpBatchingStakingManagerFixtures.glpStakingManager.address);

  await dnGmxVault.setThresholds({
    usdcReedemSlippage: 100,
    usdcConversionThreshold: parseUnits('20', 6),
  });

  await dnGmxVault.setRebalanceParams({
    rebalanceTimeThreshold: ethers.constants.Zero,
    rebalanceDeltaThreshold: ethers.constants.Zero,
  });

  await dnGmxVault.setHedgeParams({
    targetHealthFactor: ethers.constants.Zero,
    liquidationThreshold: ethers.constants.Zero,
    vault: addresses.BALANCER_VAULT,
    swapRouter: addresses.UNI_V3_SWAP_ROUTER,
  });

  // await generateErc20Balance(weth, parseUnits('20', 18), users[0].address);
  // await generateErc20Balance(wbtc, parseUnits('5', 8), users[0].address);

  await generateErc20Balance(usdc, parseUnits('10000', 6), users[0].address);
  await generateErc20Balance(usdt, parseUnits('10000', 6), users[0].address);

  await rewardRouter.connect(users[0]).mintAndStakeGlpETH(0, 0, {
    value: parseEther('10'),
  });

  await sGlp.connect(users[0]).approve(dnGmxVault.address, ethers.constants.MaxUint256);

  return {
    weth,
    wbtc,
    usdc,
    usdt,
    sGlp,
    fsGlp,
    admin,
    users,
    aaveVault,
    dnGmxVault,
    glpStakingManager: glpBatchingStakingManagerFixtures.glpStakingManager,
    glpBatchingManager: glpBatchingStakingManagerFixtures.gmxBatchingManager,
  };
});
