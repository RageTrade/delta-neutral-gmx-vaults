import { loadFixture } from '@nomicfoundation/hardhat-network-helpers';
import { deltaNeutralGmxVaults, gmxProtocol, tokens } from '@ragetrade/sdk';
import { expect } from 'chai';
import hre from 'hardhat';
import { DnGmxTraderHedgeStrategyTest, IGlpManager, IGlpManager__factory } from '../typechain-types';
import { GMX_ECOSYSTEM_ADDRESSES } from './fixtures/addresses';

describe('DnGmxTraderHedgeStrategy', () => {
  async function deployTest() {
    const signers = await hre.ethers.getSigners();
    const { gmxUnderlyingVault, glp } = gmxProtocol.getContractsSync('arbmain', hre.ethers.provider);
    const { dnGmxJuniorVault } = deltaNeutralGmxVaults.getContractsSync('arbmain', hre.ethers.provider);
    const { weth, wbtc } = tokens.getContractsSync('arbmain', hre.ethers.provider);
    const glpManager = IGlpManager__factory.connect(GMX_ECOSYSTEM_ADDRESSES.NewGlpManager, signers[0]);

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
    return { test, glpManager };
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

      const amount = await test.getTokenHedgeAmount(weth.address, test.traderOIHedgeBps());
      expect(amount).to.equal(0);
    });
  });

  describe('#checkHedgeAmounts', () => {
    it('gives check as true if hedges are 0', async () => {
      const { test } = await loadFixture(deployTest);

      const check = await test.checkHedgeAmounts(0, 0);
      expect(check).to.be.true;
    });

    it('gives check as false if btc hedge has different sign', async () => {
      const { test } = await loadFixture(deployTest);

      const check = await test.checkHedgeAmounts(-1, 10);
      expect(check).to.be.false;
    });

    it('gives check as false if etb hedge has different sign', async () => {
      const { test } = await loadFixture(deployTest);

      const check = await test.checkHedgeAmounts(1, -1);
      expect(check).to.be.false;
    });
  });

  describe('#checkTokenHedgeAmount', () => {
    it('gives amount as -1 if 0 is passed', async () => {
      const { test } = await loadFixture(deployTest);

      const check = await test.checkTokenHedgeAmount(0, 0);
      expect(check).to.be.true;
    });

    it('gives false if hedge is opposite sign to max hedge', async () => {
      const { test } = await loadFixture(deployTest);

      const check = await test.checkTokenHedgeAmount(-1, 11);
      expect(check).to.be.false;
    });

    it('gives false if hedge > max hedge', async () => {
      const { test } = await loadFixture(deployTest);

      const check = await test.checkTokenHedgeAmount(10, 1);
      expect(check).to.be.false;
    });
  });

  describe('#getTokenHedgeAmount', () => {
    it('gives correct token hedge amount for 50% traderOIHedge', async () => {
      const { test, glpManager } = await loadFixture(deployTest);
      const { gmxUnderlyingVault, glp } = gmxProtocol.getContractsSync('arbmain', hre.ethers.provider);
      const { weth } = tokens.getContractsSync('arbmain', hre.ethers.provider);

      const longSize = await gmxUnderlyingVault.reservedAmounts(weth.address);
      const shortSize = await gmxUnderlyingVault.globalShortSizes(weth.address);
      const shortAveragePrice = await glpManager.getGlobalShortAveragePrice(weth.address);

      const amountExpected = longSize
        .mul(10n ** 30n)
        .div(10n ** 18n)
        .sub(shortSize.mul(10n ** 30n).div(shortAveragePrice))
        .mul(10n ** 18n)
        .div(10n ** 30n);

      await test.setTraderOIHedgeBps(5000);
      // await test.setTraderOIHedges();
      const amount = await test.getTokenHedgeAmount(weth.address, 5000);

      expect(amount).to.equal(amountExpected.mul(5000).div(10000));
    });
  });
  describe('#getMaxTokenHedgeAmount', () => {
    it('gives correct token hedge amount for 50% traderOIHedge', async () => {
      const { test, glpManager } = await loadFixture(deployTest);
      const { gmxUnderlyingVault, glp } = gmxProtocol.getContractsSync('arbmain', hre.ethers.provider);
      const { weth } = tokens.getContractsSync('arbmain', hre.ethers.provider);

      const longSize = await gmxUnderlyingVault.reservedAmounts(weth.address);
      const shortSize = await gmxUnderlyingVault.globalShortSizes(weth.address);
      const shortAveragePrice = await glpManager.getGlobalShortAveragePrice(weth.address);

      const amountExpected = longSize
        .mul(10n ** 30n)
        .div(10n ** 18n)
        .sub(shortSize.mul(10n ** 30n).div(shortAveragePrice))
        .mul(10n ** 18n)
        .div(10n ** 30n);
      const amount = await test.getMaxTokenHedgeAmount(weth.address);

      expect(amount).to.equal(amountExpected);
    });
  });
});
