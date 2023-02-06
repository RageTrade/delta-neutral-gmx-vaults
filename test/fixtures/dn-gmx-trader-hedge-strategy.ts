import { deployments } from 'hardhat';

export const dnGmxTraderHedgeStrategyFixture = deployments.createFixture(async hre => {
  const [admin] = await hre.ethers.getSigners();

  const dnGmxTraderHedgeStrategy = await (await hre.ethers.getContractFactory('DnGmxTraderHedgeStrategy')).deploy();

  return dnGmxTraderHedgeStrategy;
});
