import { expect } from 'chai';
import hre, { ethers } from 'hardhat';
import { parseEther } from 'ethers/lib/utils';
import { dnGmxJuniorVaultFixture } from './fixtures/dn-gmx-junior-vault';

describe('Reserves & Optimal Amounts', () => {
  it('getTokenReservesInGlp', async () => {
    const { dnGmxJuniorVault, wbtc, weth } = await dnGmxJuniorVaultFixture();

    console.log(await dnGmxJuniorVault.getTokenReservesInGlp(wbtc.address, parseEther('100')));
    console.log(await dnGmxJuniorVault.getTokenReservesInGlp(weth.address, parseEther('100')));
  });

  it('Optimal Amounts', async () => {
    const { dnGmxJuniorVault } = await dnGmxJuniorVaultFixture();

    console.log(await dnGmxJuniorVault.getOptimalBorrows(0));
    console.log(await dnGmxJuniorVault.getOptimalBorrows(parseEther('100')));
  });

  it('Flashloan Amounts', async () => {
    const { dnGmxJuniorVault, wbtc, weth } = await dnGmxJuniorVaultFixture();

    const [optimalBtc, optimalEth] = await dnGmxJuniorVault.getOptimalBorrows(parseEther('100'));

    console.log(await dnGmxJuniorVault.flashloanAmounts(wbtc.address, optimalBtc, 0));
    console.log(await dnGmxJuniorVault.flashloanAmounts(weth.address, optimalEth, 0));
  });
});
