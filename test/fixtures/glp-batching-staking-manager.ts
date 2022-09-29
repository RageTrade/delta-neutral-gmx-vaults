import { deployments, ethers } from 'hardhat';
import addresses, { GMX_ECOSYSTEM_ADDRESSES } from './addresses';

export const glpBatchingStakingManagerFixture = deployments.createFixture(async hre => {
  const [admin, _] = await hre.ethers.getSigners();

  // const glpStakingManagerFactory = await hre.ethers.getContractFactory('GlpStakingManager');

  // const glpStakingManager = await glpStakingManagerFactory.deploy();

  // await glpStakingManager.initialize({
  //   rageErc4626InitParams: {
  //     asset: GMX_ECOSYSTEM_ADDRESSES.StakedGlp,
  //     name: 'Staking Manager Shares',
  //     symbol: 'SMS',
  //   },
  //   weth: addresses.WETH,
  //   usdc: addresses.USDC,
  //   rewardRouter: GMX_ECOSYSTEM_ADDRESSES.RewardRouter,
  //   feeRecipient: admin.address,
  // });

  const gmxBatchingManagerFactory = await hre.ethers.getContractFactory('DnGmxBatchingManager');

  const gmxBatchingManager = await gmxBatchingManagerFactory.deploy();

  // await gmxBatchingManager.initialize(
  //   GMX_ECOSYSTEM_ADDRESSES.StakedGlp,
  //   GMX_ECOSYSTEM_ADDRESSES.RewardRouter,
  //   GMX_ECOSYSTEM_ADDRESSES.GlpManager,
  //   glpStakingManager.address,
  //   admin.address,
  // );

  // await glpStakingManager.updateGMXParams(100, 0, 500, gmxBatchingManager.address);
  // await glpStakingManager.grantAllowances();

  // const setVault = async (vaultAddress: string) => {
  //   // await glpStakingManager.setVault(vaultAddress, true);

  //   await gmxBatchingManager.addVault(vaultAddress);
  //   await gmxBatchingManager.grantAllowances(vaultAddress);
  // };

  return {
    // setVault: setVault,
    // glpStakingManager: glpStakingManager,
    gmxBatchingManager: gmxBatchingManager,
  };
});
