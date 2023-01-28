import { parseUnits } from 'ethers/lib/utils';
import { deployments } from 'hardhat';

export const glpBatchingStakingManagerFixture = deployments.createFixture(async hre => {
  const gmxBatchingManagerFactory = await hre.ethers.getContractFactory('DnGmxBatchingManager');

  const gmxBatchingManager = await gmxBatchingManagerFactory.deploy();

  const gmxBatchingManagerGlpFactory = await hre.ethers.getContractFactory('DnGmxBatchingManagerGlp');

  const gmxBatchingManagerGlp = await gmxBatchingManagerGlpFactory.deploy();

  return {
    gmxBatchingManager: gmxBatchingManager,
    gmxBatchingManagerGlp: gmxBatchingManagerGlp,
  };
});
