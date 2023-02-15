import { expect } from 'chai';
import { BigNumber } from 'ethers';
import { parseEther } from 'ethers/lib/utils';
import { dnGmxJuniorVaultFixture } from './fixtures/dn-gmx-junior-vault';

describe('Reserves & Optimal Amounts', () => {
  it('getTokenReservesInGlp', async () => {
    const { dnGmxJuniorVault, wbtc, weth } = await dnGmxJuniorVaultFixture();

    expect(await dnGmxJuniorVault.getTokenReservesInGlp(wbtc.address, parseEther('0'), false)).to.eq(0);
    expect(await dnGmxJuniorVault.getTokenReservesInGlp(weth.address, parseEther('0'), false)).to.eq(0);

    const wbtcReserves1 = await dnGmxJuniorVault.getTokenReservesInGlp(wbtc.address, parseEther('101'), false);
    const wethReserves1 = await dnGmxJuniorVault.getTokenReservesInGlp(weth.address, parseEther('101'), false);

    const wbtcReserves2 = await dnGmxJuniorVault.getTokenReservesInGlp(wbtc.address, parseEther('202'), false);
    const wethReserves2 = await dnGmxJuniorVault.getTokenReservesInGlp(weth.address, parseEther('202'), false);

    expect(wbtcReserves1.mul(2)).to.eq(wbtcReserves2);
    expect(wethReserves1.mul(2)).to.closeTo(wethReserves2, 1);
  });

  it('Flashloan Amounts', async () => {
    const { dnGmxJuniorVault, wbtc, weth } = await dnGmxJuniorVaultFixture();

    expect(await dnGmxJuniorVault.getOptimalBorrows(parseEther('0'), false)).to.deep.eq([
      BigNumber.from(0),
      BigNumber.from(0),
    ]);

    // rebalance to make pool-amounts non-zero
    await dnGmxJuniorVault.rebalance();

    const [optimalBtc, optimalEth] = await dnGmxJuniorVault.getOptimalBorrows(parseEther('100'), false);

    const btcExcess = await dnGmxJuniorVault.flashloanAmounts(wbtc.address, optimalBtc, optimalBtc.mul(2));
    const ethExcess = await dnGmxJuniorVault.flashloanAmounts(wbtc.address, optimalEth, optimalEth.mul(2));

    const btcLess = await dnGmxJuniorVault.flashloanAmounts(weth.address, optimalBtc, optimalBtc.div(2));
    const ethLess = await dnGmxJuniorVault.flashloanAmounts(weth.address, optimalEth, optimalEth.div(2));

    expect(btcExcess.tokenAmount).to.eq(optimalBtc);
    expect(ethExcess.tokenAmount).to.eq(optimalEth);

    expect(btcExcess.repayDebt).to.eq(true);
    expect(ethExcess.repayDebt).to.eq(true);

    expect(btcLess.tokenAmount).to.closeTo(optimalBtc.div(2), 1);
    expect(ethLess.tokenAmount).to.closeTo(optimalEth.div(2), 1);

    expect(btcLess.repayDebt).to.eq(false);
    expect(ethLess.repayDebt).to.eq(false);
  });
});
