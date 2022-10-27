import { expect } from 'chai';
import { BigNumber } from 'ethers';
import { parseEther, parseUnits } from 'ethers/lib/utils';
import { ethers } from 'hardhat';
import { dnGmxJuniorVaultFixture } from './fixtures/dn-gmx-junior-vault';
import { Changer } from './utils/changer';
import { Checker } from './utils/checker';
import { generateErc20Balance } from './utils/generator';
import { Logger } from './utils/logger';
import { increaseBlockTimestamp } from './utils/shared';

describe('Rebalance & its utils', () => {
  it('getPrice of assets', async () => {
    const { dnGmxJuniorVault, usdc, wbtc, weth } = await dnGmxJuniorVaultFixture();

    const usdcUsd = await dnGmxJuniorVault['getPrice(address)'](usdc.address);
    const wbtcUsd = await dnGmxJuniorVault['getPrice(address)'](wbtc.address);
    const wethUsd = await dnGmxJuniorVault['getPrice(address)'](weth.address);

    const usdcUsdc = await dnGmxJuniorVault['getPrice(address,bool)'](usdc.address, true);
    const wbtcUsdc = await dnGmxJuniorVault['getPrice(address,bool)'](wbtc.address, true);
    const wethUsdc = await dnGmxJuniorVault['getPrice(address,bool)'](weth.address, true);

    const usdcUsdt = await dnGmxJuniorVault['getPrice(address,bool)'](usdc.address, false);
    const wbtcUsdt = await dnGmxJuniorVault['getPrice(address,bool)'](wbtc.address, false);
    const wethUsdt = await dnGmxJuniorVault['getPrice(address,bool)'](weth.address, false);

    expect(usdcUsdc).to.eq(BigNumber.from(10).pow(24 + 6));

    expect(usdcUsd.sub(usdcUsdc).abs()).to.lte(usdcUsdc.div(BigNumber.from(1000))); // within 0.1%
    expect(usdcUsdt.sub(usdcUsdc).abs()).to.lte(usdcUsdc.div(BigNumber.from(1000)));

    expect(wbtcUsd.sub(wbtcUsdc).abs()).to.lte(wbtcUsdc.div(BigNumber.from(1000)));
    expect(wbtcUsdt.sub(wbtcUsdc).abs()).to.lte(wbtcUsdc.div(BigNumber.from(1000)));

    expect(wethUsd.sub(wethUsdc).abs()).to.lte(wethUsdc.div(BigNumber.from(1000)));
    expect(wethUsdt.sub(wethUsdc).abs()).to.lte(wethUsdc.div(BigNumber.from(1000)));
  });

  it('getPrice of glp', async () => {
    const { dnGmxJuniorVault, glp, glpManager } = await dnGmxJuniorVaultFixture();

    // aum is in 10^30
    const [aumMin, aumMax] = await Promise.all([glpManager.getAum(false), glpManager.getAum(true)]);

    // aumInUsdg in 10^18
    // const [aumInUsdgMin, aumInUsdgMax] = await Promise.all([
    //   glpManager.getAumInUsdg(false),
    //   glpManager.getAumInUsdg(true)
    // ])

    const totalSupply = await glp.totalSupply();

    const PRICE_PRECISION = BigNumber.from(10).pow(30);

    const [priceMin, priceMax] = [
      aumMin.mul(PRICE_PRECISION).div(totalSupply).div(BigNumber.from(10).pow(24)),
      aumMax.mul(PRICE_PRECISION).div(totalSupply).div(BigNumber.from(10).pow(24)),
    ];

    const price = await dnGmxJuniorVault.getPriceExternal();

    expect(priceMin).to.eq(price);
    expect(priceMin).lt(priceMax);
  });

  it('Rebalance Borrow - both repayDebt are false', async () => {
    let tx;
    const opts = await dnGmxJuniorVaultFixture();
    const { dnGmxJuniorVault, dnGmxSeniorVault, users } = opts;
    const checker = new Checker(opts);

    await dnGmxSeniorVault.connect(users[1]).deposit(parseUnits('150', 6), users[1].address);

    const amount = parseEther('100');
    const borrowAmount = parseUnits('50', 6);

    const [currentBtc, currentEth] = [BigNumber.from(0), BigNumber.from(0)];
    const [optimalBtc, optimalEth] = await dnGmxJuniorVault.getOptimalBorrows(amount);

    expect(await dnGmxJuniorVault.getUsdcBorrowed()).to.eq(0);
    await dnGmxJuniorVault.executeBorrowFromDnGmxSeniorVault(borrowAmount);
    expect((await dnGmxJuniorVault.getUsdcBorrowed()).toBigInt()).to.oneOf([
      borrowAmount.toBigInt(),
      borrowAmount.add(1).toBigInt(),
    ]);

    tx = await dnGmxJuniorVault.rebalanceBorrow(optimalBtc, currentBtc, optimalEth, currentEth);
    await checker.checkCurrentBorrowed([optimalBtc, optimalEth], [1, 1]);
    await checker.checkFlashloanedAmounts(
      tx,
      [optimalBtc.sub(currentBtc).abs(), optimalEth.sub(currentEth).abs()],
      [0, 0],
    );
  });

  it('Rebalance Borrow - both repayDebt are true', async () => {
    let tx;
    const opts = await dnGmxJuniorVaultFixture();
    const { dnGmxJuniorVault, dnGmxSeniorVault, users } = opts;
    const checker = new Checker(opts);
    const changer = new Changer(opts);

    await dnGmxSeniorVault.connect(users[1]).deposit(parseUnits('150', 6), users[1].address);

    const amount = parseEther('100');
    const borrowAmount = parseUnits('50', 6);

    const [currentBtc, currentEth] = [BigNumber.from(0), BigNumber.from(0)];
    const [optimalBtc, optimalEth] = await dnGmxJuniorVault.getOptimalBorrows(amount);

    expect(await dnGmxJuniorVault.getUsdcBorrowed()).to.eq(0);
    await dnGmxJuniorVault.executeBorrowFromDnGmxSeniorVault(borrowAmount);
    expect((await dnGmxJuniorVault.getUsdcBorrowed()).toBigInt()).to.oneOf([
      borrowAmount.toBigInt(),
      borrowAmount.add(1).toBigInt(),
    ]);

    tx = await dnGmxJuniorVault.rebalanceBorrow(optimalBtc, currentBtc, optimalEth, currentEth);

    await checker.checkCurrentBorrowed([optimalBtc, optimalEth], [BigNumber.from(1), BigNumber.from(1)]);
    await checker.checkFlashloanedAmounts(
      tx,
      [optimalBtc.sub(currentBtc).abs(), optimalEth.sub(currentEth).abs()],
      [0, 0],
    );

    // increase price => loss on aave => both repayDebt are true
    await changer.changePriceToken('WETH', 1700);
    await changer.changePriceToken('WBTC', 22500);

    const [currentBtc_, currentEth_] = await dnGmxJuniorVault.getCurrentBorrows();
    const [optimalBtc_, optimalEth_] = await dnGmxJuniorVault.getOptimalBorrows(amount);

    console.log('current borrows', currentBtc_, currentEth_);
    console.log('optimal borrows', optimalBtc_, optimalEth_);

    const currentBorrowValue = await dnGmxJuniorVault.getBorrowValue(currentBtc_, currentEth_);
    const optimalBorrowValue = await dnGmxJuniorVault.getBorrowValue(optimalBtc_, optimalEth_);

    console.log('currentBorrowValue', currentBorrowValue);
    console.log('optimalBorrowValue', optimalBorrowValue);

    expect(currentBtc_).gt(optimalBtc_);
    expect(currentEth_).gt(optimalEth_);

    tx = await dnGmxJuniorVault.rebalanceBorrow(optimalBtc_, currentBtc_, optimalEth_, currentEth_);

    console.log('current borrows (after rebalance hedge):', await dnGmxJuniorVault.getCurrentBorrows());

    await checker.checkCurrentBorrowed([optimalBtc_, optimalEth_], [optimalBtc_.div(100), optimalEth_.div(100)]);
    await checker.checkFlashloanedAmounts(
      tx,
      [optimalBorrowValue.sub(currentBorrowValue).abs()],
      [optimalBorrowValue.div(1000)],
    );
  });

  it('Rebalance Hedge - target > current && available to borrow > amount required', async () => {
    /**
     * - target > current && available to borrow > amount requred
     * - target > current && available to borrow < amount requred
     * - target < current
     */

    let tx;
    const opts = await dnGmxJuniorVaultFixture();
    const { dnGmxJuniorVault, dnGmxSeniorVault, users, sGlp, aUSDC, targetHealthFactor, usdcLiquidationThreshold } =
      opts;
    const checker = new Checker(opts);

    await dnGmxSeniorVault.connect(users[1]).deposit(parseUnits('100', 6), users[1].address);

    const amount = parseEther('100');

    await sGlp.connect(users[0]).transfer(dnGmxJuniorVault.address, amount);

    const [currentBtc, currentEth] = [BigNumber.from(0), BigNumber.from(0)];

    expect(await dnGmxJuniorVault.getUsdcBorrowed()).to.eq(0);
    expect(await dnGmxJuniorVault.dnUsdcDepositedExternal()).to.eq(0);
    expect(await dnGmxJuniorVault.getCurrentBorrows()).to.deep.eq([BigNumber.from(0), BigNumber.from(0)]);

    const totalAssetsAfter = await dnGmxJuniorVault.totalAssets();
    const optimalBorrows = await dnGmxJuniorVault.getOptimalBorrows(totalAssetsAfter);
    const borrowValue = await dnGmxJuniorVault.getBorrowValue(optimalBorrows[0], optimalBorrows[1]);

    const targetDnGmxSeniorVaultAmount = BigNumber.from(targetHealthFactor - usdcLiquidationThreshold)
      .mul(borrowValue)
      .div(BigNumber.from(usdcLiquidationThreshold));

    const dnUsdcDepositedBefore = await dnGmxJuniorVault.dnUsdcDepositedExternal();
    const currentDnGmxSeniorVaultAmount = (await aUSDC.balanceOf(dnGmxJuniorVault.address)).sub(dnUsdcDepositedBefore);

    expect(dnUsdcDepositedBefore).to.eq(0);
    expect(currentDnGmxSeniorVaultAmount).to.eq(0);

    tx = await dnGmxJuniorVault.rebalanceHedge(currentBtc, currentEth);

    const dnUsdcDepositedAfter = await dnGmxJuniorVault.dnUsdcDepositedExternal();
    const currentDnGmxSeniorVaultAmountAfter = (await aUSDC.balanceOf(dnGmxJuniorVault.address)).sub(
      dnUsdcDepositedAfter,
    );

    expect(currentDnGmxSeniorVaultAmountAfter).to.closeTo(targetDnGmxSeniorVaultAmount, BigNumber.from(1));
    expect(await dnGmxJuniorVault.getUsdcBorrowed()).to.eq(currentDnGmxSeniorVaultAmountAfter);
  });

  it('Rebalance Hedge - target > current && available to borrow < amount required', async () => {
    /**
     * - target > current && available to borrow > amount requred
     * - target > current && available to borrow < amount requred
     * - target < current
     */

    let tx;
    const opts = await dnGmxJuniorVaultFixture();
    const {
      dnGmxJuniorVault,
      dnGmxSeniorVault,
      users,
      sGlp,
      gmxVault,
      usdc,
      aUSDC,
      targetHealthFactor,
      usdcLiquidationThreshold,
    } = opts;
    const checker = new Checker(opts);

    await dnGmxSeniorVault.connect(users[1]).deposit(parseUnits('100', 6), users[1].address);

    const amount = parseEther('400');
    const PRICE_PRECISION = BigNumber.from(10).pow(30);

    await sGlp.connect(users[0]).transfer(dnGmxJuniorVault.address, amount);

    const [currentBtc, currentEth] = [BigNumber.from(0), BigNumber.from(0)];

    expect(await dnGmxJuniorVault.getUsdcBorrowed()).to.eq(0);
    expect(await dnGmxJuniorVault.dnUsdcDepositedExternal()).to.eq(0);
    expect(await dnGmxJuniorVault.getCurrentBorrows()).to.deep.eq([BigNumber.from(0), BigNumber.from(0)]);

    const totalAssetsAfter = await dnGmxJuniorVault.totalAssets();
    const optimalBorrows = await dnGmxJuniorVault.getOptimalBorrows(totalAssetsAfter);
    const borrowValue = await dnGmxJuniorVault.getBorrowValue(optimalBorrows[0], optimalBorrows[1]);

    const glpPrice = await dnGmxJuniorVault['getPrice(bool)'](false);

    const targetDnGmxSeniorVaultAmount = BigNumber.from(targetHealthFactor - usdcLiquidationThreshold)
      .mul(borrowValue)
      .div(BigNumber.from(usdcLiquidationThreshold));

    const dnUsdcDepositedBefore = await dnGmxJuniorVault.dnUsdcDepositedExternal();
    const currentDnGmxSeniorVaultAmount = (await aUSDC.balanceOf(dnGmxJuniorVault.address)).sub(dnUsdcDepositedBefore);

    expect(totalAssetsAfter).to.eq(amount);
    expect(dnUsdcDepositedBefore).to.eq(0);
    expect(currentDnGmxSeniorVaultAmount).to.eq(0);

    const amountToBorrow = targetDnGmxSeniorVaultAmount.sub(currentDnGmxSeniorVaultAmount);
    const availableBorrow = await dnGmxSeniorVault.availableBorrow(dnGmxJuniorVault.address);

    expect(amountToBorrow).gt(availableBorrow);

    /**
     *          uint256 optimalUncappedEthBorrow = optimalEthBorrow;
                (optimalBtcBorrow, optimalEthBorrow) = _getOptimalCappedBorrows(
                    currentDnGmxSeniorVaultAmount + availableBorrow,
                    usdcLiquidationThreshold
                );
     */

    const optimalBorrowsCapped = await dnGmxJuniorVault.getOptimalCappedBorrows(
      availableBorrow,
      usdcLiquidationThreshold,
    );

    /**
     *  uint256 unhedgedGlp = totalAssets().mulDiv(uncappedTokenHedge - cappedTokenHedge, uncappedTokenHedge);
        uint256 unhedgedGlpUsdcAmount = unhedgedGlp.mulDiv(getPrice(false), PRICE_PRECISION);
     */

    const unhedgedGlp = totalAssetsAfter.mul(optimalBorrows[0].sub(optimalBorrowsCapped[0])).div(optimalBorrows[0]);
    const unhedgedGlpUsdcAmount = unhedgedGlp.mul(glpPrice).div(PRICE_PRECISION);

    const unhedgedGlpInUsdc = await dnGmxJuniorVault.unhedgedGlpInUsdc();

    expect(unhedgedGlpInUsdc).eq(0);
    expect(unhedgedGlpUsdcAmount).gt(unhedgedGlpInUsdc);

    // usdcAmountDesired.mulDiv(MAX_BPS - slippageThresholdGmxBps, MAX_BPS)

    const slippageThresholdGmxBps = BigNumber.from(100); // 1%
    const MAX_BPS = BigNumber.from(10_000);

    const priceOfUsdc = await gmxVault.getMinPrice(usdc.address);
    const priceOfGlp = await dnGmxJuniorVault.getPriceExternal();

    const USDC_DECIMALS = 6;
    const USDG_DECIMALS = 18;

    let minUsdgOut = unhedgedGlpUsdcAmount
      .mul(priceOfUsdc)
      .mul(MAX_BPS.sub(slippageThresholdGmxBps))
      .div(MAX_BPS)
      .div(PRICE_PRECISION);

    minUsdgOut = minUsdgOut.mul(BigNumber.from(10).pow(USDG_DECIMALS)).div(BigNumber.from(10).pow(USDC_DECIMALS));

    const minGlpOut = minUsdgOut
      .mul(PRICE_PRECISION)
      .div(priceOfGlp)
      .div(BigNumber.from(10).pow(USDG_DECIMALS - USDC_DECIMALS));

    tx = await dnGmxJuniorVault.rebalanceHedge(currentBtc, currentEth);

    const dnUsdcDepositedAfter = await dnGmxJuniorVault.dnUsdcDepositedExternal();

    console.log('minGlpOut', minGlpOut);
    console.log('totalAssets', await dnGmxJuniorVault.totalAssets());

    // availableBorrow = max(borrowCap, balanceOf)
    expect(availableBorrow).to.closeTo(parseUnits('100', 6), BigNumber.from(1));

    expect(await dnGmxJuniorVault.getUsdcBorrowed()).to.closeTo(availableBorrow, BigNumber.from(1));
    // expect(await dnGmxJuniorVault.unhedgedGlpInUsdc()).to.eq(minUsdgOut.div(USDG_DECIMALS - USDC_DECIMALS));
  });

  it('Rebalance Hedge - target < current', async () => {
    /**
     * - target > current && available to borrow > amount requred
     * - target > current && available to borrow < amount requred
     * - target < current
     */

    const opts = await dnGmxJuniorVaultFixture();
    const {
      dnGmxJuniorVault,
      dnGmxSeniorVault,
      users,
      usdc,
      sGlp,
      aUSDC,
      targetHealthFactor,
      usdcLiquidationThreshold,
    } = opts;

    await dnGmxSeniorVault.updateBorrowCap(dnGmxJuniorVault.address, parseUnits('100', 6));

    await generateErc20Balance(usdc, parseUnits('100', 6), users[2].address);
    await usdc.connect(users[2]).approve(dnGmxSeniorVault.address, ethers.constants.MaxUint256);

    await dnGmxSeniorVault.connect(users[2]).deposit(parseUnits('100', 6), users[2].address);

    const amount = parseEther('100');

    await dnGmxJuniorVault.connect(users[0]).deposit(amount, users[0].address);

    const totalAssets = await dnGmxJuniorVault.totalAssets();
    // withdraw amount such that assets remaining after withdraw is 50 sglp
    const amountWithdraw = totalAssets.sub(parseEther('50'));
    console.log('amountWithdraw', amountWithdraw);

    // values based on state after withdraw

    let totalAssetsAfter = parseEther('50');
    let optimalBorrows = await dnGmxJuniorVault.getOptimalBorrows(totalAssetsAfter);
    let borrowValue = await dnGmxJuniorVault.getBorrowValue(optimalBorrows[0], optimalBorrows[1]);

    let targetDnGmxSeniorVaultAmount = BigNumber.from(targetHealthFactor - usdcLiquidationThreshold)
      .mul(borrowValue)
      .div(BigNumber.from(usdcLiquidationThreshold));
    console.log('targetDnGmxSeniorVaultAmount (expected: after withdraw)', targetDnGmxSeniorVaultAmount);

    await dnGmxJuniorVault.connect(users[0]).withdraw(amountWithdraw, users[0].address, users[0].address);
    console.log('real total assets after: ', await dnGmxJuniorVault.totalAssets());

    const dnUsdcDepositedAfter = await dnGmxJuniorVault.dnUsdcDepositedExternal();
    console.log('dnUsdcDepositedAfter (after withdraw)', dnUsdcDepositedAfter);

    const currentDnGmxSeniorVaultAmountAfter = (await aUSDC.balanceOf(dnGmxJuniorVault.address)).sub(
      dnUsdcDepositedAfter,
    );
    console.log('currentDnGmxSeniorVaultAmountAfter (after withdraw)', currentDnGmxSeniorVaultAmountAfter);

    console.log('available borrow', await dnGmxSeniorVault.availableBorrow(dnGmxJuniorVault.address));
    console.log('borrow caps', await dnGmxSeniorVault.borrowCaps(dnGmxJuniorVault.address));

    // closeTo with delta of "1" because interest accrued can change depending upon order in which test file is run
    expect(await dnGmxJuniorVault.getUsdcBorrowed()).to.closeTo(targetDnGmxSeniorVaultAmount, 1n);

    const diff = (await dnGmxSeniorVault.borrowCaps(dnGmxJuniorVault.address)).sub(
      await dnGmxSeniorVault.availableBorrow(dnGmxJuniorVault.address),
    );

    expect(currentDnGmxSeniorVaultAmountAfter).to.closeTo(diff, BigNumber.from(1));
  });

  it('valid rebalance - time', async () => {
    const { dnGmxJuniorVault } = await dnGmxJuniorVaultFixture();

    await dnGmxJuniorVault.setRebalanceParams(
      86400, //rebalanceTimeThreshold:
      500, // 5% in bps rebalanceDeltaThresholdBps:
      10_000,
    );

    expect(await dnGmxJuniorVault.isValidRebalanceTime()).to.be.true;
    await dnGmxJuniorVault.rebalance();
    expect(await dnGmxJuniorVault.isValidRebalanceTime()).to.be.false;

    await increaseBlockTimestamp(86400 + 1);

    expect(await dnGmxJuniorVault.isValidRebalanceTime()).to.true;
  });

  it('valid rebalance - delta', async () => {
    const { dnGmxJuniorVault, dnGmxSeniorVault, sGlp, users } = await dnGmxJuniorVaultFixture();
    await dnGmxSeniorVault.connect(users[1]).deposit(parseUnits('150', 6), users[1].address);

    expect(await dnGmxJuniorVault.isValidRebalanceDeviation()).to.be.false;
    await sGlp.connect(users[0]).transfer(dnGmxJuniorVault.address, parseEther('100'));
    expect(await dnGmxJuniorVault.isValidRebalanceDeviation()).to.be.true;

    await dnGmxJuniorVault.rebalance();
    expect(await dnGmxJuniorVault.isValidRebalanceDeviation()).to.be.false;
  });

  it('valid rebalance - hf', async () => {
    const opts = await dnGmxJuniorVaultFixture();
    const { dnGmxSeniorVault, dnGmxJuniorVault, users } = opts;
    const changer = new Changer(opts);

    await dnGmxSeniorVault.connect(users[1]).deposit(parseUnits('100', 6), users[1].address);

    const amount = parseEther('100');

    await dnGmxJuniorVault.connect(users[0]).deposit(amount, users[0].address);
    await dnGmxJuniorVault.rebalance();

    expect(await dnGmxJuniorVault.isValidRebalanceHF()).to.be.false;

    await changer.changePriceToken('WBTC', 25000);
    await changer.changePriceToken('WETH', 2000);

    expect(await dnGmxJuniorVault.isValidRebalanceHF()).to.be.true;
  });

  it('Deposit', async () => {
    const opts = await dnGmxJuniorVaultFixture();
    const { dnGmxJuniorVault, dnGmxSeniorVault, vdWBTC, vdWETH, aUSDC, fsGlp, users } = opts;
    const checker = new Checker(opts);

    const withdrawFeeBps = await dnGmxJuniorVault.withdrawFeeBps();

    const MAX_BPS = BigNumber.from(10_000);
    const PRICE_PRECISION = BigNumber.from(10).pow(30);

    await dnGmxSeniorVault.connect(users[1]).deposit(parseUnits('100', 6), users[1].address);

    const amount = parseEther('100');
    const preview = await dnGmxJuniorVault.previewDeposit(amount);

    await dnGmxJuniorVault.connect(users[0]).deposit(amount, users[0].address);

    const glpPrice = await dnGmxJuniorVault.getPriceExternal();
    const glpBalance = await fsGlp.balanceOf(dnGmxJuniorVault.address);

    const dnUsdcDeposited = await dnGmxJuniorVault.dnUsdcDeposited();

    let vmv;
    const borrowValues = await dnGmxJuniorVault.getCurrentBorrows();

    // glp notional value
    vmv = glpBalance.mul(glpPrice).div(PRICE_PRECISION);
    // dn usdc deposited
    vmv = vmv.add(dnUsdcDeposited);
    // borrowed notional from aave
    vmv = vmv.sub(await dnGmxJuniorVault.getBorrowValue(borrowValues[0], borrowValues[1]));
    // batching manager glp & unHedgedGlp components are 0

    await checker.checkTotalSupply(amount);

    expect(preview).to.eq(amount);
    expect(await dnGmxJuniorVault.unhedgedGlpInUsdc()).to.eq(0);
    expect(await dnGmxJuniorVault.getVaultMarketValue()).to.eq(vmv);
    expect(await dnGmxJuniorVault.totalAssets()).to.gt(amount.mul(MAX_BPS.sub(withdrawFeeBps).div(MAX_BPS)));

    // const borrows = await dnGmxJuniorVault.getCurrentBorrows()
    // console.log('vmv', vmv)
    // console.log('vault market value', await dnGmxJuniorVault.getVaultMarketValue())
    // console.log('vault glp balance', await fsGlp.balanceOf(dnGmxJuniorVault.address));
    // console.log('dnUsdcDeposited', await dnGmxJuniorVault.dnUsdcDepositedExternal())
    // console.log('unhedgedGlpInUsdc', await dnGmxJuniorVault.unhedgedGlpInUsdc())
    // console.log('total current borrow value', await dnGmxJuniorVault.getBorrowValue(borrows[0], borrows[1]))

    // await logger.logAavePosition();
  });

  it('Deposit Beyond Balance', async () => {
    const { dnGmxJuniorVault, dnGmxSeniorVault, users, lendingPool, aUSDC, vdWBTC, vdWETH } =
      await dnGmxJuniorVaultFixture();
    await dnGmxSeniorVault.connect(users[1]).deposit(parseUnits('50', 6), users[1].address);

    const amount = parseEther('100');

    console.log('1st Deposit');
    await dnGmxJuniorVault.connect(users[0]).deposit(amount, users[0].address);

    console.log('dnUsdcDeposited', await dnGmxJuniorVault.dnUsdcDepositedExternal());
    console.log('usdc borrowed', await dnGmxJuniorVault.getUsdcBorrowed());
    console.log('ausdc balance senior', await aUSDC.balanceOf(dnGmxSeniorVault.address));

    let btcAmount = await vdWBTC.balanceOf(dnGmxJuniorVault.address);
    let ethAmount = await vdWETH.balanceOf(dnGmxJuniorVault.address);

    console.log('btc borrowed', btcAmount);
    console.log('eth borrowed', ethAmount);
    console.log('unhedgedGlpInUsdc', await dnGmxJuniorVault.unhedgedGlpInUsdc());
    console.log('final borrow value', await dnGmxJuniorVault.getBorrowValue(btcAmount, ethAmount));
    console.log(await lendingPool.getUserAccountData(dnGmxJuniorVault.address));

    console.log('2nd Deposit');
    await dnGmxJuniorVault.connect(users[0]).deposit(amount, users[0].address);
    console.log('dnUsdcDeposited', await dnGmxJuniorVault.dnUsdcDepositedExternal());
    console.log('usdc borrowed', await dnGmxJuniorVault.getUsdcBorrowed());
    console.log('ausdc balance senior', await aUSDC.balanceOf(dnGmxSeniorVault.address));

    btcAmount = await vdWBTC.balanceOf(dnGmxJuniorVault.address);
    ethAmount = await vdWETH.balanceOf(dnGmxJuniorVault.address);

    console.log('btc borrowed', btcAmount);
    console.log('eth borrowed', ethAmount);
    console.log('unhedgedGlpInUsdc', await dnGmxJuniorVault.unhedgedGlpInUsdc());
    console.log('final borrow value', await dnGmxJuniorVault.getBorrowValue(btcAmount, ethAmount));
    console.log(await lendingPool.getUserAccountData(dnGmxJuniorVault.address));

    console.log('3rd Deposit');
    await dnGmxSeniorVault.connect(users[1]).deposit(parseUnits('150', 6), users[1].address);
    await dnGmxJuniorVault.connect(users[0]).deposit(amount, users[0].address);
    console.log('dnUsdcDeposited', await dnGmxJuniorVault.dnUsdcDepositedExternal());
    console.log('usdc borrowed', await dnGmxJuniorVault.getUsdcBorrowed());
    console.log('ausdc balance senior', await aUSDC.balanceOf(dnGmxSeniorVault.address));

    btcAmount = await vdWBTC.balanceOf(dnGmxJuniorVault.address);
    ethAmount = await vdWETH.balanceOf(dnGmxJuniorVault.address);

    console.log('btc borrowed', btcAmount);
    console.log('eth borrowed', ethAmount);
    console.log('unhedgedGlpInUsdc', await dnGmxJuniorVault.unhedgedGlpInUsdc());
    console.log('final borrow value', await dnGmxJuniorVault.getBorrowValue(btcAmount, ethAmount));
    console.log(await lendingPool.getUserAccountData(dnGmxJuniorVault.address));
  });

  it('Full Withdraw', async () => {
    const opts = await dnGmxJuniorVaultFixture();
    const {
      dnGmxJuniorVault,
      dnGmxSeniorVault,
      glpBatchingManager,
      dnGmxJuniorVaultManager,
      admin,
      users,
      weth,
      wbtc,
      fsGlp,
    } = opts;
    await dnGmxSeniorVault.connect(users[1]).deposit(parseUnits('150', 6), users[1].address);

    await dnGmxJuniorVault.setAdminParams(
      admin.address,
      dnGmxSeniorVault.address,
      ethers.constants.MaxUint256,
      glpBatchingManager.address,
      100,
    );

    const PRICE_PRECISION = BigNumber.from(10).pow(30);

    const amount = parseEther('100');
    const glpPrice = await dnGmxJuniorVault['getPrice(bool)'](false);

    await dnGmxJuniorVault.connect(users[0]).deposit(amount, users[0].address);

    expect(await dnGmxJuniorVault.balanceOf(users[0].address)).to.eq(amount);

    const totalAssetsBeforeRedeem = await dnGmxJuniorVault.totalAssets();
    const preview = await dnGmxJuniorVault.previewRedeem(dnGmxJuniorVault.balanceOf(users[0].address));

    const withdrawFeeBps = await dnGmxJuniorVault.withdrawFeeBps();
    const MAX_BPS = BigNumber.from(10_000);

    const givenToUser = totalAssetsBeforeRedeem.mul(MAX_BPS.sub(withdrawFeeBps)).div(MAX_BPS);

    console.log('givenToUser', givenToUser);
    console.log('totalAssetsBeforeRedeem', totalAssetsBeforeRedeem);
    console.log('preview', preview);

    const tx = await dnGmxJuniorVault
      .connect(users[0])
      .redeem(dnGmxJuniorVault.balanceOf(users[0].address), users[5].address, users[0].address);

    const receipt = await tx.wait();

    let wbtcUsdcSlippage: BigNumber = BigNumber.from(0);
    let wethUsdcSlippage: BigNumber = BigNumber.from(0);

    let shares, assets;

    for (const log of receipt.logs) {
      if (log.topics[0] === dnGmxJuniorVault.interface.getEventTopic('Withdraw')) {
        const args = dnGmxJuniorVault.interface.parseLog(log).args;
        shares = args.shares;
        assets = args.assets;
      }
    }

    console.log('shares', shares);
    console.log('assets', assets);

    for (const log of receipt.logs) {
      if (log.topics[0] === dnGmxJuniorVaultManager.interface.getEventTopic('TokenSwapped')) {
        const args = dnGmxJuniorVaultManager.interface.parseLog(log).args;

        if (args.toToken.toLowerCase() == wbtc.address.toLowerCase()) {
          const btcPrice = await dnGmxJuniorVault['getPrice(address,bool)'](wbtc.address, true);
          wbtcUsdcSlippage = BigNumber.from(args.toQuantity)
            .mul(btcPrice)
            .div(PRICE_PRECISION)
            .sub(BigNumber.from(args.fromQuantity))
            .abs();
        }

        if (args.toToken.toLowerCase() == weth.address.toLowerCase()) {
          const ethPrice = await dnGmxJuniorVault['getPrice(address,bool)'](weth.address, true);
          wethUsdcSlippage = BigNumber.from(args.toQuantity)
            .mul(ethPrice)
            .div(PRICE_PRECISION)
            .sub(BigNumber.from(args.fromQuantity))
            .abs();
        }
      }
    }

    // total slippage in terms of asset
    const totalSlippage = wbtcUsdcSlippage.add(wethUsdcSlippage).mul(PRICE_PRECISION).div(glpPrice);
    console.log('totalSlippage', totalSlippage);

    expect(await dnGmxJuniorVault.balanceOf(users[0].address)).to.eq(0);

    expect(shares).to.eq(amount);
    expect(await fsGlp.balanceOf(users[5].address)).to.eq(assets);

    expect(givenToUser).to.eq(preview);
    expect(await dnGmxJuniorVault.totalSupply()).to.eq(0);
    expect(await dnGmxJuniorVault.totalAssets()).to.gt(totalAssetsBeforeRedeem.sub(givenToUser).sub(totalSlippage));
  });

  it('Partial Withdraw & withdrawFeeBps', async () => {
    const opts = await dnGmxJuniorVaultFixture();
    const {
      dnGmxJuniorVault,
      dnGmxSeniorVault,
      glpBatchingManager,
      users,
      fsGlp,
      dnGmxJuniorVaultManager,
      admin,
      usdc,
      wbtc,
      weth,
    } = opts;

    const PRICE_PRECISION = BigNumber.from(10).pow(30);

    const amount = parseEther('100');
    const glpPrice = await dnGmxJuniorVault['getPrice(bool)'](false);

    await dnGmxSeniorVault.connect(users[1]).deposit(parseUnits('150', 6), users[1].address);

    await dnGmxJuniorVault.connect(users[0]).deposit(amount, users[0].address);

    expect(await dnGmxJuniorVault.balanceOf(users[0].address)).to.eq(amount);

    const totalAssetsBefore = await dnGmxJuniorVault.totalAssets();
    const dnUsdcDepositedBefore = await dnGmxJuniorVault.dnUsdcDeposited();

    // all components except dn usdc deposit & glp should be zero
    expect(dnUsdcDepositedBefore).to.not.eq(0);
    expect(await dnGmxJuniorVault.unhedgedGlpInUsdc()).to.eq(0);
    expect(await glpBatchingManager.dnGmxJuniorVaultGlpBalance()).to.eq(0);

    const borrowsBefore = await dnGmxJuniorVault.getCurrentBorrows();

    console.log('borrowsBefore', borrowsBefore);
    console.log('borrowValueBefore', await dnGmxJuniorVault.getBorrowValue(borrowsBefore[0], borrowsBefore[1]));

    // withdrawing to user[5]
    const tx = await dnGmxJuniorVault.connect(users[0]).withdraw(amount.div(2), users[5].address, users[0].address);
    const receipt = await tx.wait();

    let shares, assets;

    for (const log of receipt.logs) {
      if (log.topics[0] === dnGmxJuniorVault.interface.getEventTopic('Withdraw')) {
        const args = dnGmxJuniorVault.interface.parseLog(log).args;
        shares = args.shares;
        assets = args.assets;
      }
    }

    let wbtcUsdcSlippage: BigNumber = BigNumber.from(0);
    let wethUsdcSlippage: BigNumber = BigNumber.from(0);

    for (const log of receipt.logs) {
      if (log.topics[0] === dnGmxJuniorVaultManager.interface.getEventTopic('TokenSwapped')) {
        const args = dnGmxJuniorVaultManager.interface.parseLog(log).args;

        if (args.toToken.toLowerCase() == wbtc.address.toLowerCase()) {
          const btcPrice = await dnGmxJuniorVault['getPrice(address,bool)'](wbtc.address, true);
          wbtcUsdcSlippage = BigNumber.from(args.toQuantity)
            .mul(btcPrice)
            .div(PRICE_PRECISION)
            .sub(BigNumber.from(args.fromQuantity))
            .abs();
        }

        if (args.toToken.toLowerCase() == weth.address.toLowerCase()) {
          const ethPrice = await dnGmxJuniorVault['getPrice(address,bool)'](weth.address, true);
          wethUsdcSlippage = BigNumber.from(args.toQuantity)
            .mul(ethPrice)
            .div(PRICE_PRECISION)
            .sub(BigNumber.from(args.fromQuantity))
            .abs();
        }
      }
    }

    // total slippage in terms of asset
    const totalSlippage = wbtcUsdcSlippage.add(wethUsdcSlippage).mul(PRICE_PRECISION).div(glpPrice);
    // console.log('totalSlippage', totalSlippage)

    // console.log('totalAssetsBefore', totalAssetsBefore);
    // console.log('totalAssetsAfter', await dnGmxJuniorVault.totalAssets());

    // console.log('shares', shares);
    // console.log('assets', assets);
    // console.log('sharesUsed', sharesUsed);

    // console.log('unhedgedGlpInUsdc', await dnGmxJuniorVault.unhedgedGlpInUsdc());
    // console.log('dnGmxJuniorVaultGlpBalance', await glpBatchingManager.dnGmxJuniorVaultGlpBalance());
    // console.log('dnUsdcDeposited', await dnGmxJuniorVault.dnUsdcDeposited());

    // const borrowsAfter = await dnGmxJuniorVault.getCurrentBorrows();

    // console.log('borrowsAfter', borrowsAfter);
    // console.log('borrowValueAfter', await dnGmxJuniorVault.getBorrowValue(borrowsAfter[0], borrowsAfter[1]));

    expect(assets).to.eq(amount.div(2));

    // should have recevied exact glp
    expect(await fsGlp.balanceOf(users[5].address)).to.eq(amount.div(2));

    // user should have shares left
    expect(await dnGmxJuniorVault.totalSupply()).to.eq(await dnGmxJuniorVault.balanceOf(users[0].address));

    expect(await dnGmxJuniorVault.totalSupply()).to.eq(amount.sub(shares));
    expect(await dnGmxJuniorVault.totalAssets()).to.gt(totalAssetsBefore.sub(assets).sub(totalSlippage));
  });

  it('Change Price', async () => {
    const opts = await dnGmxJuniorVaultFixture();
    const changer = new Changer(opts);
    const { gmxVault, dnGmxJuniorVault, wbtc, weth } = opts;

    const PRICE_PRECISION = BigNumber.from(10).pow(30);
    const USDC_DECIMALS = BigNumber.from(10).pow(6);

    let btcPriceCL = (await dnGmxJuniorVault['getPrice(address)'](wbtc.address))
      .mul(parseUnits('1', 8))
      .div(PRICE_PRECISION)
      .div(USDC_DECIMALS);
    let ethPriceCL = (await dnGmxJuniorVault['getPrice(address)'](weth.address))
      .mul(parseUnits('1', 18))
      .div(PRICE_PRECISION)
      .div(USDC_DECIMALS);

    let btcPriceGmxMin = (await gmxVault.getMinPrice(wbtc.address)).div(PRICE_PRECISION);
    let ethPriceGmxMin = (await gmxVault.getMinPrice(weth.address)).div(PRICE_PRECISION);

    let btcPriceGmxMax = (await gmxVault.getMaxPrice(wbtc.address)).div(PRICE_PRECISION);
    let ethPriceGmxMax = (await gmxVault.getMaxPrice(weth.address)).div(PRICE_PRECISION);

    expect(btcPriceCL).gt(btcPriceGmxMin);
    expect(btcPriceCL).lt(btcPriceGmxMax);

    expect(ethPriceCL).gt(ethPriceGmxMin);
    expect(ethPriceCL).lt(ethPriceGmxMax);

    await changer.changePriceToken('WBTC', 1000);
    await changer.changePriceToken('WETH', 1000);

    btcPriceCL = (await dnGmxJuniorVault['getPrice(address)'](wbtc.address))
      .mul(parseUnits('1', 8))
      .div(PRICE_PRECISION)
      .div(USDC_DECIMALS);
    ethPriceCL = (await dnGmxJuniorVault['getPrice(address)'](weth.address))
      .mul(parseUnits('1', 18))
      .div(PRICE_PRECISION)
      .div(USDC_DECIMALS);

    btcPriceGmxMin = (await gmxVault.getMinPrice(wbtc.address)).div(PRICE_PRECISION);
    ethPriceGmxMin = (await gmxVault.getMinPrice(weth.address)).div(PRICE_PRECISION);

    btcPriceGmxMax = (await gmxVault.getMaxPrice(wbtc.address)).div(PRICE_PRECISION);
    ethPriceGmxMax = (await gmxVault.getMaxPrice(weth.address)).div(PRICE_PRECISION);

    expect(btcPriceCL).gt(btcPriceGmxMin);
    expect(btcPriceCL).lt(btcPriceGmxMax);

    expect(ethPriceCL).gt(ethPriceGmxMin);
    expect(ethPriceCL).lt(ethPriceGmxMax);
  });

  it('Rebalance Profit - borrowVal > dnUsdcDeposited', async () => {
    const opts = await dnGmxJuniorVaultFixture();
    const changer = new Changer(opts);
    const logger = new Logger(opts);
    const {
      dnGmxJuniorVault,
      glpBatchingManager,
      dnGmxSeniorVault,
      dnGmxJuniorVaultSigner,
      admin,
      users,
      sGlp,
      aUSDC,
      fsGlp,
    } = opts;
    await dnGmxSeniorVault.connect(users[1]).deposit(parseUnits('150', 6), users[1].address);

    const amount = parseEther('100');

    const PRICE_PRECISION = BigNumber.from(10).pow(30);

    // ETH: 1,547$ BTC: 19,929$
    await dnGmxJuniorVault.connect(users[0]).deposit(amount, users[0].address);
    await dnGmxJuniorVault.rebalance();

    // console.log('aave position', await aUSDC.balanceOf(dnGmxJuniorVault.address))
    // console.log('glp balance', await fsGlp.balanceOf(dnGmxJuniorVault.address))
    // console.log('batching manager bal', await glpBatchingManager.dnGmxJuniorVaultGlpBalance())

    // increase price => loss on aave => borrowVal > dnUsdcDeposited
    await changer.changePriceToken('WETH', 1700);
    await changer.changePriceToken('WBTC', 22500);

    const [currentBtc, currentEth] = await dnGmxJuniorVault.getCurrentBorrows();
    const borrowValue = dnGmxJuniorVault.getBorrowValue(currentBtc, currentEth);

    // console.log('aave position', await aUSDC.balanceOf(dnGmxJuniorVault.address))
    // console.log('glp balance', await fsGlp.balanceOf(dnGmxJuniorVault.address))
    // console.log('batching manager bal', await glpBatchingManager.dnGmxJuniorVaultGlpBalance())

    await dnGmxJuniorVault.rebalanceProfit(borrowValue);

    // ETH: 1400$ BTC: 18,000$
    await changer.changePriceToken('WBTC', 1400);
    await changer.changePriceToken('WETH', 18000);

    // console.log('aave position', await aUSDC.balanceOf(dnGmxJuniorVault.address));
    // console.log('glp balance', await fsGlp.balanceOf(dnGmxJuniorVault.address));
    // console.log('batching manager bal', await glpBatchingManager.dnGmxJuniorVaultGlpBalance());

    const [currentBtc_, currentEth_] = await dnGmxJuniorVault.getCurrentBorrows();
    const borrowValue_ = dnGmxJuniorVault.getBorrowValue(currentBtc_, currentEth_);

    await dnGmxJuniorVault.rebalanceProfit(borrowValue_);

    // console.log('aave position', await aUSDC.balanceOf(dnGmxJuniorVault.address))
    // console.log('glp balance', await fsGlp.balanceOf(dnGmxJuniorVault.address))
    // console.log('batching manager bal', await glpBatchingManager.dnGmxJuniorVaultGlpBalance())
  });

  it('Rebalance Profit - borrowVal < dnUsdcDeposited', async () => {
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
    await dnGmxJuniorVault.setMocks(opts.mocks.swapRouterMock.address);
    await dnGmxJuniorVault.grantAllowances();

    await dnGmxSeniorVault.connect(users[1]).deposit(parseUnits('150', 6), users[1].address);

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

    const { dnGmxJuniorVault, dnGmxSeniorVault, glpBatchingManager, users, aUSDC, admin } = opts;
    await dnGmxSeniorVault.connect(users[1]).deposit(parseUnits('150', 6), users[1].address);

    await dnGmxJuniorVault.setMocks(opts.mocks.swapRouterMock.address);
    await dnGmxJuniorVault.grantAllowances();

    await dnGmxJuniorVault.setRebalanceParams(86400, 500, 12_000);

    await dnGmxJuniorVault.setThresholds(
      1000, //_slippageThresholdSwapBtcBps
      1000, //_slippageThresholdSwapEthBps
      1000, //slippageThresholdGmxBps
      parseUnits('1', 6), //usdcConversionThreshold
      10n ** 15n, //wethConversionThreshold
      parseUnits('1', 6), //hedgeUsdcAmountThreshold
      parseUnits('1000000', 6), //partialBtcHedgeUsdcAmountThreshold
      parseUnits('1000000', 6), //partialEthHedgeUsdcAmountThreshold
    );

    await dnGmxJuniorVault.setAdminParams(
      admin.address,
      dnGmxSeniorVault.address,
      ethers.constants.MaxUint256,
      glpBatchingManager.address,
      1000,
    );
    //50BPS = .5%

    const amount = parseEther('100');

    // ETH: 1,547$ BTC: 19,929$
    await dnGmxJuniorVault.connect(users[0]).deposit(amount, users[0].address);

    let [currentBtc_, currentEth_] = await dnGmxJuniorVault.getCurrentBorrows();
    console.log('borrow value after deposit', await dnGmxJuniorVault.getBorrowValue(currentBtc_, currentEth_));

    // ETH: 2,000$ BTC: 25,000$
    await changer.changePriceToken('WBTC', 25000);
    await changer.changePriceToken('WETH', 2000);

    await increaseBlockTimestamp(24 * 60 * 60);

    await dnGmxJuniorVault.rebalance();

    console.log('PASSED');

    // ETH: 1,350$ BTC: 18,000$
    await changer.changePriceToken('WBTC', 18000);
    await changer.changePriceToken('WETH', 1350);

    await increaseBlockTimestamp(24 * 60 * 60);

    await increaseBlockTimestamp(15 * 60);
    await glpBatchingManager.executeBatchDeposit();
    await increaseBlockTimestamp(15 * 60);

    await dnGmxJuniorVault.rebalance();

    await increaseBlockTimestamp(15 * 60);
    await glpBatchingManager.executeBatchDeposit();
    await increaseBlockTimestamp(15 * 60);

    console.log('PASSED x2');

    console.log('shares', await dnGmxJuniorVault.balanceOf(users[0].address));
    console.log('totalAssets', await dnGmxJuniorVault.totalAssets());
    console.log('totalSupply', await dnGmxJuniorVault.totalSupply());

    console.log('aUSDC bal', await aUSDC.balanceOf(dnGmxJuniorVault.address));

    await dnGmxJuniorVault
      .connect(users[0])
      .redeem(dnGmxJuniorVault.balanceOf(users[0].address), users[0].address, users[0].address);

    console.log('shares', await dnGmxJuniorVault.balanceOf(users[0].address));
    console.log('totalAssets', await dnGmxJuniorVault.totalAssets());
    console.log('totalSupply', await dnGmxJuniorVault.totalSupply());
  });
});
