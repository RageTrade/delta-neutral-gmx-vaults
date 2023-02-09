import { deployments } from 'hardhat';

export const batchingManagerFixture = deployments.createFixture(async hre => {
  const gmxBatchingManagerFactory = await hre.ethers.getContractFactory('DnGmxBatchingManager');

  const gmxBatchingManager = await gmxBatchingManagerFactory.deploy();

  const gmxBatchingManagerGlpFactory = await hre.ethers.getContractFactory('DnGmxBatchingManagerGlp');

  const gmxBatchingManagerGlp = await gmxBatchingManagerGlpFactory.deploy();

  return {
    usdcBatchingManager: gmxBatchingManager,
    glpBatchingManager: gmxBatchingManagerGlp,
  };
});
