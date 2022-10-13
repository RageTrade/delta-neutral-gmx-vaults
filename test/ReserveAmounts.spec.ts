import { expect } from 'chai';
import hre, { ethers } from 'hardhat';
import { parseEther } from 'ethers/lib/utils';
import { dnGmxJuniorVaultFixture } from './fixtures/dn-gmx-junior-vault';
import { BigNumber } from 'ethers';

describe('Reserves & Optimal Amounts', () => {
  it('getTokenReservesInGlp', async () => {
    const { dnGmxJuniorVault, wbtc, weth } = await dnGmxJuniorVaultFixture();

    expect(await dnGmxJuniorVault.getTokenReservesInGlp(wbtc.address, parseEther('0'))).to.eq(0);
    expect(await dnGmxJuniorVault.getTokenReservesInGlp(weth.address, parseEther('0'))).to.eq(0);

    const wbtcReserves1 = await dnGmxJuniorVault.getTokenReservesInGlp(wbtc.address, parseEther('101'));
    const wethReserves1 = await dnGmxJuniorVault.getTokenReservesInGlp(weth.address, parseEther('101'));

    const wbtcReserves2 = await dnGmxJuniorVault.getTokenReservesInGlp(wbtc.address, parseEther('202'));
    const wethReserves2 = await dnGmxJuniorVault.getTokenReservesInGlp(weth.address, parseEther('202'));

    expect(wbtcReserves1.mul(2)).to.eq(wbtcReserves2);
    expect(wethReserves1.mul(2)).to.eq(wethReserves2.sub(1));
  });

  it('Flashloan Amounts', async () => {
    const { dnGmxJuniorVault, wbtc, weth } = await dnGmxJuniorVaultFixture();

    expect(await dnGmxJuniorVault.getOptimalBorrows(parseEther('0'))).to.deep.eq([
      BigNumber.from(0),
      BigNumber.from(0),
    ]);

    const [optimalBtc, optimalEth] = await dnGmxJuniorVault.getOptimalBorrows(parseEther('100'));

    const btcExcess = await dnGmxJuniorVault.flashloanAmounts(wbtc.address, optimalBtc, optimalBtc.mul(2));
    const ethExcess = await dnGmxJuniorVault.flashloanAmounts(wbtc.address, optimalEth, optimalEth.mul(2));

    const btcLess = await dnGmxJuniorVault.flashloanAmounts(weth.address, optimalBtc, optimalBtc.div(2));
    const ethLess = await dnGmxJuniorVault.flashloanAmounts(weth.address, optimalEth, optimalEth.div(2));

    expect(btcExcess.tokenAmount).to.eq(optimalBtc);
    expect(ethExcess.tokenAmount).to.eq(optimalEth);

    expect(btcExcess.repayDebt).to.eq(true);
    expect(ethExcess.repayDebt).to.eq(true);

    expect(btcLess.tokenAmount).to.eq(optimalBtc.div(2));
    expect(ethLess.tokenAmount).to.eq(optimalEth.div(2).add(1));

    expect(btcLess.repayDebt).to.eq(false);
    expect(ethLess.repayDebt).to.eq(false);
  });
});
