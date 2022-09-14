import { expect } from 'chai';
import hre, { ethers } from 'hardhat';
import { parseEther } from 'ethers/lib/utils';
import { dnGmxVaultFixture } from './fixtures/dn-gmx-vault';

describe('Reserves & Optimal Amounts', () => {
  it('getTokenReservesInGlp', async () => {
    const { dnGmxVault, wbtc, weth } = await dnGmxVaultFixture();

    console.log(await dnGmxVault.getTokenReservesInGlp(wbtc.address));
    console.log(await dnGmxVault.getTokenReservesInGlp(weth.address));
  });

  it('Optimal Amounts', async () => {
    const { dnGmxVault } = await dnGmxVaultFixture();

    console.log(await dnGmxVault.getOptimalBorrows(0));
    console.log(await dnGmxVault.getOptimalBorrows(parseEther('100')));
  });

  it('Flashloan Amounts', async () => {
    const { dnGmxVault, wbtc, weth } = await dnGmxVaultFixture();

    const [optimalBtc, optimalEth] = await dnGmxVault.getOptimalBorrows(parseEther('100'));

    console.log(await dnGmxVault.flashloanAmounts(wbtc.address, optimalBtc, 0));
    console.log(await dnGmxVault.flashloanAmounts(weth.address, optimalEth, 0));
  });
});
