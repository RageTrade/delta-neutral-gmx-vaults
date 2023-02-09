import { loadFixture } from '@nomicfoundation/hardhat-network-helpers';
import { deltaNeutralGmxVaults, gmxProtocol, tokens } from '@ragetrade/sdk';
import { expect } from 'chai';
import hre from 'hardhat';
import { DnGmxTraderHedgeStrategyTest } from '../typechain-types';

describe('DnGmxTraderHedgeStrategy', () => {
  async function deployTest() {
    const signers = await hre.ethers.getSigners();
    const { gmxUnderlyingVault, glpManager, glp } = gmxProtocol.getContractsSync('arbmain', hre.ethers.provider);
    const { dnGmxJuniorVault } = deltaNeutralGmxVaults.getContractsSync('arbmain', hre.ethers.provider);
    const { weth, wbtc } = tokens.getContractsSync('arbmain', hre.ethers.provider);

    const test = (await hre.ethers.deployContract('DnGmxTraderHedgeStrategyTest')) as DnGmxTraderHedgeStrategyTest;
    await test.initialize(
      signers[0].address,
      gmxUnderlyingVault.address,
      glpManager.address,
      dnGmxJuniorVault.address,
      glp.address,
      weth.address,
      wbtc.address,
    );
    return { test };
  }

  describe('#getMaxTokenHedgeAmount', () => {
    it('gives amount as -1 if 0 is passed', async () => {
      const { test } = await loadFixture(deployTest);
      const { weth } = tokens.getContractsSync('arbmain', hre.ethers.provider);

      const amount = await test.getMaxTokenHedgeAmount(weth.address, 0);
      expect(amount).to.equal(-1);
    });
  });
});
