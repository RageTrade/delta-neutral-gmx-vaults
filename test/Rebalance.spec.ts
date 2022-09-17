import { expect } from 'chai';
import { BigNumber } from 'ethers';
import hre, { ethers } from 'hardhat';
import { changePrice } from './utils/price-helpers';
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
    const { dnGmxVault } = await dnGmxVaultFixture();

    const amount = parseEther('100');

    const [currentBtc, currentEth] = [BigNumber.from(0), BigNumber.from(0)];
    const [optimalBtc, optimalEth] = await dnGmxVault.getOptimalBorrows(amount);

    await dnGmxVault.executeBorrowFromLpVault(parseUnits('50', 6));

    await dnGmxVault.rebalanceBorrow(optimalBtc, currentBtc, optimalEth, currentEth);
  });

  it('Rebalance Hedge', async () => {
    const { dnGmxVault, dnGmxVaultSigner, users, sGlp, glpStakingManager } = await dnGmxVaultFixture();

    const amount = parseEther('100');

    await sGlp.connect(users[0]).transfer(dnGmxVault.address, amount);
    await glpStakingManager.connect(dnGmxVaultSigner).deposit(amount, dnGmxVault.address);

    const [currentBtc, currentEth] = [BigNumber.from(0), BigNumber.from(0)];

    await dnGmxVault.rebalanceHedge(currentBtc, currentEth);

    console.log('dnUsdcDeposited', await dnGmxVault.dnUsdcDepositedExternal());
    console.log('usdc borrowed', await dnGmxVault.getUsdcBorrowed());
  });

  it('Deposit', async () => {
    const { dnGmxVault, users } = await dnGmxVaultFixture();

    const amount = parseEther('100');

    await dnGmxVault.connect(users[0]).deposit(amount, users[0].address);
  });

  it('Full Withdraw', async () => {
    const { dnGmxVault, users } = await dnGmxVaultFixture();

    const amount = parseEther('100');

    await dnGmxVault.connect(users[0]).deposit(amount, users[0].address);

    await dnGmxVault.connect(users[0]).withdraw(amount, users[0].address, users[0].address);
  });

  it('Partial Withdraw', async () => {
    const { dnGmxVault, dnGmxVaultSigner, admin, users, sGlp, fsGlp, glpStakingManager } = await dnGmxVaultFixture();

    const amount = parseEther('100');

    await dnGmxVault.connect(users[0]).deposit(amount, users[0].address);

    await dnGmxVault.connect(users[0]).withdraw(amount.div(2), users[0].address, users[0].address);
  });

  it('Change Price', async () => {
    const { gmxVault, dnGmxVault, wbtc, weth } = await dnGmxVaultFixture();

    console.log('BEFORE');

    console.log('BTC price', await dnGmxVault['getPrice(address)'](wbtc.address));
    console.log('ETH price', await dnGmxVault['getPrice(address)'](weth.address));
    console.log('BTC price (gmx)', await gmxVault.getMinPrice(wbtc.address));
    console.log('ETH price (gmx)', await gmxVault.getMinPrice(weth.address));

    await changePrice('WBTC', 1000);
    await changePrice('WETH', 1000);

    console.log('AFTER');

    console.log('BTC price', await dnGmxVault['getPrice(address)'](wbtc.address));
    console.log('ETH price', await dnGmxVault['getPrice(address)'](weth.address));
    console.log('BTC price (gmx)', await gmxVault.getMinPrice(wbtc.address));
    console.log('ETH price (gmx)', await gmxVault.getMinPrice(weth.address));
  });

  it('Rebalance Profit', async () => {
    const { dnGmxVault, glpBatchingManager, dnGmxVaultSigner, admin, users, sGlp, fsGlp, glpStakingManager } =
      await dnGmxVaultFixture();

    // becauses price are not changed on uniswap
    await dnGmxVault.setThresholds({
      usdcReedemSlippage: 10_000,
      usdcConversionThreshold: parseUnits('20', 6),
    });

    const amount = parseEther('100');

    // ETH: 1,547$ BTC: 19,929$
    await dnGmxVault.connect(users[0]).deposit(amount, users[0].address);

    let [currentBtc_, currentEth_] = await dnGmxVault.getCurrentBorrows();
    console.log('borrow value after deposit', await dnGmxVault.getBorrowValue(currentBtc_, currentEth_));

    await increaseBlockTimestamp(15 * 60);
    await glpBatchingManager.executeBatchDeposit();
    await increaseBlockTimestamp(15 * 60);

    // ETH: 2,000$ BTC: 25,000$
    await changePrice('WBTC', 25000);
    await changePrice('WETH', 2000);

    let [currentBtc, currentEth] = await dnGmxVault.getCurrentBorrows();
    let borrowValue = dnGmxVault.getBorrowValue(currentBtc, currentEth);

    await dnGmxVault.rebalanceProfit(borrowValue);

    console.log('PASSED');

    // ETH: 1,350$ BTC: 18,000$
    await changePrice('WBTC', 18000);
    await changePrice('WETH', 1350);

    [currentBtc, currentEth] = await dnGmxVault.getCurrentBorrows();
    borrowValue = dnGmxVault.getBorrowValue(currentBtc, currentEth);

    await increaseBlockTimestamp(15 * 60);
    await glpBatchingManager.executeBatchDeposit();
    await increaseBlockTimestamp(15 * 60);

    await dnGmxVault.rebalanceProfit(borrowValue);

    console.log('PASSED x2');

    await dnGmxVault.connect(users[0]).withdraw(amount.div(2), users[0].address, users[0].address);
  });
});
