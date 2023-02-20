import { deployments } from 'hardhat';

export const dnGmxTraderHedgeStrategyFixture = deployments.createFixture(async hre => {
  const dnGmxTraderHedgeStrategy = await (await hre.ethers.getContractFactory('DnGmxTraderHedgeStrategy')).deploy();

  return dnGmxTraderHedgeStrategy;
});
