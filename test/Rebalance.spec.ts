import { expect } from 'chai';
import { BigNumber } from 'ethers';
import hre, { ethers } from 'hardhat';
import { generateErc20Balance } from './utils/erc20';
import { parseEther, parseUnits } from 'ethers/lib/utils';
import { dnGmxVaultFixture } from './fixtures/dn-gmx-vault';
import { increaseBlockTimestamp } from './utils/vault-helpers';

describe('Rebalance & its utils', () => {
  it('getPrice of assets', async () => {
    const { dnGmxVault, usdc, wbtc, weth } = await dnGmxVaultFixture();
    console.log(await dnGmxVault['getPrice(address)'](usdc.address));
    console.log(await dnGmxVault['getPrice(address)'](wbtc.address));
    console.log(await dnGmxVault['getPrice(address)'](weth.address));
  });

  it('getPrice of glp', async () => {
    const { dnGmxVault } = await dnGmxVaultFixture();
    console.log(await dnGmxVault['getPrice()']());
  });

  it('Rebalance Borrow', async () => {
    const { dnGmxVault, admin, users, sGlp, fsGlp } = await dnGmxVaultFixture();

    const amount = parseEther('100');

    const [currentBtc, currentEth] = [BigNumber.from(0), BigNumber.from(0)];
    const [optimalBtc, optimalEth] = await dnGmxVault.getOptimalBorrows(amount);

    await dnGmxVault.executeBorrowFromLpVault(parseUnits('50', 6));

    await dnGmxVault.rebalanceBorrow(optimalBtc, currentBtc, optimalEth, currentEth);
  });

  it('Rebalance Hedge', async () => {
    const { dnGmxVault, dnGmxVaultSigner, admin, users, sGlp, fsGlp, glpStakingManager } = await dnGmxVaultFixture();

    const amount = parseEther('100');

    await sGlp.connect(users[0]).transfer(dnGmxVault.address, amount);
    await glpStakingManager.connect(dnGmxVaultSigner).deposit(amount, dnGmxVault.address);

    const [currentBtc, currentEth] = [BigNumber.from(0), BigNumber.from(0)];
    // const [optimalBtc, optimalEth] = await dnGmxVault.getOptimalBorrows(amount)

    await dnGmxVault.rebalanceHedge(currentBtc, currentEth);

    console.log('dnUsdcDeposited', await dnGmxVault.dnUsdcDeposited());
    console.log('usdc borrowed', await dnGmxVault.getUsdcBorrowed());
  });

  it('Deposit', async () => {
    const { dnGmxVault, dnGmxVaultSigner, admin, users, sGlp, fsGlp, glpStakingManager } = await dnGmxVaultFixture();

    const amount = parseEther('100');

    await dnGmxVault.connect(users[0]).deposit(amount, users[0].address);
  });

  it.only('Withdraw', async () => {
    const { dnGmxVault, dnGmxVaultSigner, admin, users, sGlp, fsGlp, glpStakingManager } = await dnGmxVaultFixture();

    const amount = parseEther('100');

    await dnGmxVault.connect(users[0]).deposit(amount, users[0].address);
    await dnGmxVault.connect(users[0]).withdraw(amount, users[0].address, users[0].address);
  });
});
