import { parseUnits } from 'ethers/lib/utils';
import { deployments } from 'hardhat';

export const glpBatchingStakingManagerFixture = deployments.createFixture(async hre => {
  const gmxBatchingManagerFactory = await hre.ethers.getContractFactory('DnGmxBatchingManager');

  const gmxBatchingManager = await gmxBatchingManagerFactory.deploy();
  return {
    gmxBatchingManager: gmxBatchingManager,
  };
});
