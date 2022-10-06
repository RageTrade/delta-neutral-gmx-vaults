import { expect } from 'chai';
import { BigNumber } from 'ethers';
import { Changer } from './utils/changer';
import { increaseBlockTimestamp } from './utils/shared';
import { parseEther, parseUnits } from 'ethers/lib/utils';
import { dnGmxJuniorVaultFixture } from './fixtures/dn-gmx-junior-vault';

describe('Rebalance & its utils', () => {
  it('getPrice of assets', async () => {
    const { dnGmxJuniorVault, usdc, wbtc, weth } = await dnGmxJuniorVaultFixture();
    console.log(await dnGmxJuniorVault['getPrice(address)'](usdc.address));
    console.log(await dnGmxJuniorVault['getPrice(address)'](wbtc.address));
    console.log(await dnGmxJuniorVault['getPrice(address)'](weth.address));

    console.log(await dnGmxJuniorVault['getPrice(address,bool)'](usdc.address, true));
    console.log(await dnGmxJuniorVault['getPrice(address,bool)'](wbtc.address, true));
    console.log(await dnGmxJuniorVault['getPrice(address,bool)'](weth.address, true));
  });

  it('getPrice of glp', async () => {
    const { dnGmxJuniorVault } = await dnGmxJuniorVaultFixture();
    console.log(await dnGmxJuniorVault['getPrice()']());
  });

  it('Rebalance Borrow', async () => {
    const { dnGmxJuniorVault, dnGmxSeniorVault, users } = await dnGmxJuniorVaultFixture();
    await dnGmxSeniorVault.connect(users[1]).deposit(parseUnits('150', 6), users[1].address);

    const amount = parseEther('100');

    const [currentBtc, currentEth] = [BigNumber.from(0), BigNumber.from(0)];
    const [optimalBtc, optimalEth] = await dnGmxJuniorVault.getOptimalBorrows(amount);

    await dnGmxJuniorVault.executeBorrowFromDnGmxSeniorVault(parseUnits('50', 6));

    await dnGmxJuniorVault.rebalanceBorrow(optimalBtc, currentBtc, optimalEth, currentEth);
  });

  it('Rebalance Hedge', async () => {
    const { dnGmxJuniorVault, dnGmxJuniorVaultSigner, dnGmxSeniorVault, users, sGlp } = await dnGmxJuniorVaultFixture();
    await dnGmxSeniorVault.connect(users[1]).deposit(parseUnits('150', 6), users[1].address);

    const amount = parseEther('100');

    await sGlp.connect(users[0]).transfer(dnGmxJuniorVault.address, amount);
    // await glpStakingManager.connect(dnGmxJuniorVaultSigner).deposit(amount, dnGmxJuniorVault.address);

    const [currentBtc, currentEth] = [BigNumber.from(0), BigNumber.from(0)];

    await dnGmxJuniorVault.rebalanceHedge(currentBtc, currentEth);

    console.log('dnUsdcDeposited', await dnGmxJuniorVault.dnUsdcDepositedExternal());
    console.log('usdc borrowed', await dnGmxJuniorVault.getUsdcBorrowed());
  });

  it('Deposit', async () => {
    const { dnGmxJuniorVault, dnGmxSeniorVault, users } = await dnGmxJuniorVaultFixture();
    await dnGmxSeniorVault.connect(users[1]).deposit(parseUnits('150', 6), users[1].address);

    const amount = parseEther('100');

    await dnGmxJuniorVault.connect(users[0]).deposit(amount, users[0].address);
  });

  it('Full Withdraw', async () => {
    const { dnGmxJuniorVault, dnGmxSeniorVault, users } = await dnGmxJuniorVaultFixture();
    await dnGmxSeniorVault.connect(users[1]).deposit(parseUnits('150', 6), users[1].address);

    const amount = parseEther('100');

    await dnGmxJuniorVault.connect(users[0]).deposit(amount, users[0].address);

    // Otherwise assets are not converted to aUsdc
    // temp: setting hfThreshold to 0
    await dnGmxJuniorVault.setThresholds({
      usdcRedeemSlippage: 100,
      hfThreshold: 0,
      usdcConversionThreshold: 0,
      seniorVaultWethConversionThreshold: 10n ** 15n,
      hedgeUsdcAmountThreshold: parseUnits('10', 6),
    });

    await dnGmxJuniorVault
      .connect(users[0])
      .redeem(dnGmxJuniorVault.balanceOf(users[0].address), users[0].address, users[0].address, { gasLimit: 30000000 });
  });

  it('Partial Withdraw', async () => {
    const { dnGmxJuniorVault, dnGmxSeniorVault, dnGmxJuniorVaultSigner, admin, users, sGlp, fsGlp } =
      await dnGmxJuniorVaultFixture();
    await dnGmxSeniorVault.connect(users[1]).deposit(parseUnits('150', 6), users[1].address);

    const amount = parseEther('100');

    await dnGmxJuniorVault.connect(users[0]).deposit(amount, users[0].address);

    await dnGmxJuniorVault.connect(users[0]).withdraw(amount.div(2), users[0].address, users[0].address);
  });

  it('Change Price', async () => {
    const opts = await dnGmxJuniorVaultFixture();
    const changer = new Changer(opts);
    const { gmxVault, dnGmxJuniorVault, wbtc, weth } = opts;

    console.log('BEFORE');

    console.log('BTC price', await dnGmxJuniorVault['getPrice(address)'](wbtc.address));
    console.log('ETH price', await dnGmxJuniorVault['getPrice(address)'](weth.address));
    console.log('BTC price (gmx)', await gmxVault.getMinPrice(wbtc.address));
    console.log('ETH price (gmx)', await gmxVault.getMinPrice(weth.address));

    await changer.changePriceToken('WBTC', 1000);
    await changer.changePriceToken('WETH', 1000);

    console.log('AFTER');

    console.log('BTC price', await dnGmxJuniorVault['getPrice(address)'](wbtc.address));
    console.log('ETH price', await dnGmxJuniorVault['getPrice(address)'](weth.address));
    console.log('BTC price (gmx)', await gmxVault.getMinPrice(wbtc.address));
    console.log('ETH price (gmx)', await gmxVault.getMinPrice(weth.address));
  });

  it('Rebalance Profit', async () => {
    const opts = await dnGmxJuniorVaultFixture();
    const changer = new Changer(opts);
    const {
      dnGmxJuniorVault,
      glpBatchingManager,
      dnGmxSeniorVault,
      dnGmxJuniorVaultSigner,
      admin,
      users,
      sGlp,
      fsGlp,
    } = opts;
    await dnGmxSeniorVault.connect(users[1]).deposit(parseUnits('150', 6), users[1].address);

    // becauses price are not changed on uniswap
    // temp: setting hfThreshold to 0

    await dnGmxJuniorVault.setThresholds({
      usdcRedeemSlippage: 10_000,
      hfThreshold: 0,
      usdcConversionThreshold: parseUnits('20', 6),
      seniorVaultWethConversionThreshold: 10n ** 15n,
      hedgeUsdcAmountThreshold: parseUnits('10', 6),
    });

    const amount = parseEther('100');

    // ETH: 1,547$ BTC: 19,929$
    await dnGmxJuniorVault.connect(users[0]).deposit(amount, users[0].address);

    let [currentBtc_, currentEth_] = await dnGmxJuniorVault.getCurrentBorrows();
    console.log('borrow value after deposit', await dnGmxJuniorVault.getBorrowValue(currentBtc_, currentEth_));

    await increaseBlockTimestamp(15 * 60);
    await glpBatchingManager.executeBatchDeposit();
    await increaseBlockTimestamp(15 * 60);

    // ETH: 2,000$ BTC: 25,000$
    await changer.changePriceToken('WBTC', 25000);
    await changer.changePriceToken('WETH', 2000);

    let [currentBtc, currentEth] = await dnGmxJuniorVault.getCurrentBorrows();
    let borrowValue = dnGmxJuniorVault.getBorrowValue(currentBtc, currentEth);

    await dnGmxJuniorVault.rebalanceProfit(borrowValue);

    console.log('PASSED');

    // ETH: 1,350$ BTC: 18,000$
    await changer.changePriceToken('WBTC', 18000);
    await changer.changePriceToken('WETH', 1350);

    [currentBtc, currentEth] = await dnGmxJuniorVault.getCurrentBorrows();
    borrowValue = dnGmxJuniorVault.getBorrowValue(currentBtc, currentEth);

    await increaseBlockTimestamp(15 * 60);
    await glpBatchingManager.executeBatchDeposit();
    await increaseBlockTimestamp(15 * 60);

    await dnGmxJuniorVault.rebalanceProfit(borrowValue);

    console.log('PASSED x2');

    await dnGmxJuniorVault.connect(users[0]).withdraw(amount.div(2), users[0].address, users[0].address);
  });

  it('Rebalance (External)', async () => {
    const opts = await dnGmxJuniorVaultFixture();
    const changer = new Changer(opts);

    const { dnGmxJuniorVault, dnGmxSeniorVault, glpBatchingManager, users } = opts;
    await dnGmxSeniorVault.connect(users[1]).deposit(parseUnits('150', 6), users[1].address);

    // becauses price are not changed on uniswap
    // temp: setting hfThreshold to 0

    await dnGmxJuniorVault.setThresholds({
      usdcRedeemSlippage: 10_000,
      hfThreshold: 0,
      usdcConversionThreshold: parseUnits('20', 6),
      seniorVaultWethConversionThreshold: 10n ** 15n,
      hedgeUsdcAmountThreshold: parseUnits('10', 6),
    });

    const amount = parseEther('100');

    // ETH: 1,547$ BTC: 19,929$
    await dnGmxJuniorVault.connect(users[0]).deposit(amount, users[0].address);

    let [currentBtc_, currentEth_] = await dnGmxJuniorVault.getCurrentBorrows();
    console.log('borrow value after deposit', await dnGmxJuniorVault.getBorrowValue(currentBtc_, currentEth_));

    await increaseBlockTimestamp(15 * 60);
    await glpBatchingManager.executeBatchDeposit();
    await increaseBlockTimestamp(15 * 60);

    await increaseBlockTimestamp(24 * 60 * 60);

    // ETH: 2,000$ BTC: 25,000$
    await changer.changePriceToken('WBTC', 25000);
    await changer.changePriceToken('WETH', 2000);

    // let [currentBtc, currentEth] = await dnGmxJuniorVault.getCurrentBorrows();
    // let borrowValue = dnGmxJuniorVault.getBorrowValue(currentBtc, currentEth);

    // await dnGmxJuniorVault.rebalanceProfit(borrowValue);
    await dnGmxJuniorVault.rebalance();

    console.log('PASSED');

    // ETH: 1,350$ BTC: 18,000$
    await changer.changePriceToken('WBTC', 18000);
    await changer.changePriceToken('WETH', 1350);

    // [currentBtc, currentEth] = await dnGmxJuniorVault.getCurrentBorrows();
    // borrowValue = dnGmxJuniorVault.getBorrowValue(currentBtc, currentEth);

    await increaseBlockTimestamp(15 * 60);
    await glpBatchingManager.executeBatchDeposit();
    await increaseBlockTimestamp(15 * 60);

    await increaseBlockTimestamp(24 * 60 * 60);

    await dnGmxJuniorVault.rebalance();

    console.log('PASSED x2');

    await dnGmxJuniorVault.connect(users[0]).withdraw(amount.div(2), users[0].address, users[0].address);
  });
});
