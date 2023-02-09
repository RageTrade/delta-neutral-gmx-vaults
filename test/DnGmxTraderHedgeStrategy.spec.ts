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

  describe('#setTraderOIHedgeBps', () => {
    it('sets the value as specified', async () => {
      const { test } = await loadFixture(deployTest);

      await test.setTraderOIHedgeBps(1234);
      expect(await test.traderOIHedgeBps()).to.equal(1234);
    });

    it('allows to re-set the value', async () => {
      const { test } = await loadFixture(deployTest);

      await test.setTraderOIHedgeBps(1234);
      await test.setTraderOIHedgeBps(5678);
      expect(await test.traderOIHedgeBps()).to.equal(5678);
    });
  });

  describe('#setTraderOIHedges', () => {
    it('sets trader OI Hedges as expected', async () => {
      const { test } = await loadFixture(deployTest);

      await test.setTraderOIHedges();

      const btcTraderOIHedge = await test.btcTraderOIHedge();
      const ethTraderOIHedge = await test.ethTraderOIHedge();
      expect(btcTraderOIHedge).to.equal(0);
      expect(ethTraderOIHedge).to.equal(0);
    });
  });

  describe('#getTokenHedgeAmount', () => {
    it('gives amount as 0 if glpDeposited is 0', async () => {
      const { test } = await loadFixture(deployTest);
      const { glp } = gmxProtocol.getContractsSync('arbmain', hre.ethers.provider);
      const { weth } = tokens.getContractsSync('arbmain', hre.ethers.provider);

      const amount = await test.getTokenHedgeAmount(weth.address, 0, glp.totalSupply(), test.traderOIHedgeBps());
      expect(amount).to.equal(0);
    });
  });

  describe('#checkHedgeAmounts', () => {
    it('gives check as true if hedges are 0', async () => {
      const { test } = await loadFixture(deployTest);

      const check = await test.checkHedgeAmounts(0, 0);
      expect(check).to.be.true;
    });

    it('first expression in if check is false, second expression is true');
    it('both expressions in if are false');
  });

  describe('#checkTokenHedgeAmount', () => {
    it('gives amount as -1 if 0 is passed', async () => {
      const { test } = await loadFixture(deployTest);

      const check = await test.checkTokenHedgeAmount(0, 0);
      expect(check).to.be.true;
    });
  });

  describe('#getMaxTokenHedgeAmount', () => {
    it('gives amount as -1 if 0 is passed', async () => {
      const { test } = await loadFixture(deployTest);
      const { weth } = tokens.getContractsSync('arbmain', hre.ethers.provider);

      const amount = await test.getMaxTokenHedgeAmount(weth.address, 0);
      expect(amount).to.equal(-1);
    });
  });
});
