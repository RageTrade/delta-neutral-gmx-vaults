import { expect } from 'chai';
import { BigNumber } from 'ethers';
import { parseEther, parseUnits } from 'ethers/lib/utils';
import { ethers } from 'hardhat';
import { dnGmxJuniorVaultFixture } from './fixtures/dn-gmx-junior-vault';
import { Changer } from './utils/changer';
import { Checker } from './utils/checker';
import { generateErc20Balance } from './utils/generator';
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
    const [optimalBtc, optimalEth] = await dnGmxJuniorVault.getOptimalBorrows(amount, false);

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
    const { dnGmxJuniorVault, dnGmxSeniorVault, users, sGlp, wbtc, weth, vdWETH, vdWBTC, lendingPool } = opts;
    const checker = new Checker(opts);
    const changer = new Changer(opts);

    await changer.addLiquidity();
    await dnGmxSeniorVault.connect(users[1]).deposit(parseUnits('150', 6), users[1].address);

    const amount = parseEther('100');
    const borrowAmount = parseUnits('50', 6);

    const [currentBtc, currentEth] = [BigNumber.from(0), BigNumber.from(0)];
    const [optimalBtc, optimalEth] = await dnGmxJuniorVault.getOptimalBorrows(amount, false);

    expect(currentBtc).to.eq(0);
    expect(currentEth).to.eq(0);

    expect(await dnGmxJuniorVault.getUsdcBorrowed()).to.eq(0);

    await sGlp.connect(users[1]).approve(dnGmxJuniorVault.address, ethers.constants.MaxUint256);
    await dnGmxJuniorVault.connect(users[1]).deposit(amount, users[1].address);

    const totalBorrowedBefore = await dnGmxJuniorVault.getUsdcBorrowed();

    await dnGmxJuniorVault.executeBorrowFromDnGmxSeniorVault(borrowAmount);
    expect(await dnGmxJuniorVault.getUsdcBorrowed()).to.closeTo(borrowAmount.add(totalBorrowedBefore), 1);

    // increase price => loss on aave => both repayDebt are true
    console.log(await dnGmxJuniorVault['getPrice(address)'](weth.address));
    console.log(await dnGmxJuniorVault['getPrice(address)'](wbtc.address));

    await changer.changePriceToken('WETH', 1700);
    await changer.changePriceToken('WBTC', 24500);

    let [currentBtc_, currentEth_] = await dnGmxJuniorVault.getCurrentBorrows();

    const ta = await dnGmxJuniorVault.totalAssets();
    let [optimalBtc_, optimalEth_] = await dnGmxJuniorVault.getOptimalBorrows(ta, false);

    // current > optimal because loss on aave and to maintain HF, we repayDebt
    expect(currentBtc_).gt(optimalBtc_);
    expect(currentEth_).gt(optimalEth_);

    tx = await (await dnGmxJuniorVault.rebalanceBorrow(optimalBtc_, currentBtc_, optimalEth_, currentEth_)).wait();

    const iface = new ethers.utils.Interface([
      'event BalanceTransfer(address indexed from, address indexed to, uint256 value, uint256 index)',
      'event Transfer(address indexed from, address indexed to, uint256 value)',
      'event Repay(address indexed reserve, address indexed user, address indexed repayer, uint256 amount, bool useATokens)',
    ]);

    let btcAmountReduced = BigNumber.from(0),
      ethAmountReduced = BigNumber.from(0);

    for (const log of tx.logs) {
      if (log.address == lendingPool.address && log.topics[0] == iface.getEventTopic('Repay')) {
        const args = iface.parseLog(log).args;

        if (args.reserve.toLowerCase() == weth.address.toLowerCase()) {
          ethAmountReduced = ethAmountReduced.add(args.amount);
        }

        if (args.reserve.toLowerCase() == wbtc.address.toLowerCase()) {
          btcAmountReduced = btcAmountReduced.add(args.amount);
        }
      }
    }

    expect(currentBtc_.sub(btcAmountReduced)).to.eq(optimalBtc_);
    expect(currentEth_.sub(ethAmountReduced)).to.eq(optimalEth_);
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
    const optimalBorrows = await dnGmxJuniorVault.getOptimalBorrows(totalAssetsAfter, false);
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

  it('Rebalance Hedge Unit Tests', async () => {
    [];
    // Both increase above threshold
    await testRebalanceHedge({
      btcAmountInit: 90000000,
      ethAmountInit: 110000000,
      btcAmountFinal: 100000000,
      ethAmountFinal: 120000000,
      btcAboveThreshold: true,
      ethAboveThreshold: true,
    });

    // both decrease above threshold
    await testRebalanceHedge({
      btcAmountInit: 90000000,
      ethAmountInit: 110000000,
      btcAmountFinal: 80000000,
      ethAmountFinal: 100000000,
      btcAboveThreshold: true,
      ethAboveThreshold: true,
    });

    // btc increase above threshold, eth decrease above threshold
    await testRebalanceHedge({
      btcAmountInit: 90000000,
      ethAmountInit: 110000000,
      btcAmountFinal: 100000000,
      ethAmountFinal: 100000000,
      btcAboveThreshold: true,
      ethAboveThreshold: true,
    });

    // btc decrease above threshold, eth increase above threshold
    await testRebalanceHedge({
      btcAmountInit: 90000000,
      ethAmountInit: 110000000,
      btcAmountFinal: 80000000,
      ethAmountFinal: 120000000,
      btcAboveThreshold: true,
      ethAboveThreshold: true,
    });

    // btc increase above threshold, eth same
    await testRebalanceHedge({
      btcAmountInit: 90000000,
      ethAmountInit: 110000000,
      btcAmountFinal: 100000000,
      ethAmountFinal: 110000000,
      btcAboveThreshold: true,
      ethAboveThreshold: false,
    });

    // btc decrease above threshold, eth same
    await testRebalanceHedge({
      btcAmountInit: 90000000,
      ethAmountInit: 110000000,
      btcAmountFinal: 80000000,
      ethAmountFinal: 110000000,
      btcAboveThreshold: true,
      ethAboveThreshold: false,
    });

    // btc same, eth increase above threshold
    await testRebalanceHedge({
      btcAmountInit: 90000000,
      ethAmountInit: 110000000,
      btcAmountFinal: 90000000,
      ethAmountFinal: 120000000,
      btcAboveThreshold: false,
      ethAboveThreshold: true,
    });

    // btc same, eth decrease above threshold
    await testRebalanceHedge({
      btcAmountInit: 90000000,
      ethAmountInit: 110000000,
      btcAmountFinal: 90000000,
      ethAmountFinal: 90000000,
      btcAboveThreshold: false,
      ethAboveThreshold: true,
    });

    // both below threshold
    await testRebalanceHedge({
      btcAmountInit: 90000000,
      ethAmountInit: 110000000,
      btcAmountFinal: 90000100,
      ethAmountFinal: 110000100,
      btcAboveThreshold: false,
      ethAboveThreshold: false,
    });

    // btc increase below threshold, eth increase above threshold
    await testRebalanceHedge({
      btcAmountInit: 90000000,
      ethAmountInit: 110000000,
      btcAmountFinal: 90000100,
      ethAmountFinal: 120000000,
      btcAboveThreshold: false,
      ethAboveThreshold: true,
    });

    // btc increase below threshold, eth decrease above threshold
    await testRebalanceHedge({
      btcAmountInit: 90000000,
      ethAmountInit: 110000000,
      btcAmountFinal: 90000100,
      ethAmountFinal: 90000000,
      btcAboveThreshold: false,
      ethAboveThreshold: true,
    });

    // btc increase below threshold, eth increase above threshold
    await testRebalanceHedge({
      btcAmountInit: 90000000,
      ethAmountInit: 110000000,
      btcAmountFinal: 89999900,
      ethAmountFinal: 120000000,
      btcAboveThreshold: false,
      ethAboveThreshold: true,
    });

    // btc increase below threshold, eth decrease above threshold
    await testRebalanceHedge({
      btcAmountInit: 90000000,
      ethAmountInit: 110000000,
      btcAmountFinal: 89999900,
      ethAmountFinal: 90000000,
      btcAboveThreshold: false,
      ethAboveThreshold: true,
    });
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

    await dnGmxSeniorVault.connect(users[1]).deposit(parseUnits('100', 6), users[1].address);

    const amount = parseEther('400');
    const PRICE_PRECISION = BigNumber.from(10).pow(30);

    // rebalance to make pool-amounts non-zero
    await dnGmxJuniorVault.rebalance();

    await sGlp.connect(users[0]).transfer(dnGmxJuniorVault.address, amount);

    const [currentBtc, currentEth] = [BigNumber.from(0), BigNumber.from(0)];

    expect(await dnGmxJuniorVault.getUsdcBorrowed()).to.eq(0);
    expect(await dnGmxJuniorVault.dnUsdcDepositedExternal()).to.eq(0);
    expect(await dnGmxJuniorVault.getCurrentBorrows()).to.deep.eq([BigNumber.from(0), BigNumber.from(0)]);

    const totalAssetsAfter = await dnGmxJuniorVault.totalAssets();
    const dnUsdcDepositedBefore = await dnGmxJuniorVault.dnUsdcDepositedExternal();
    const optimalBorrows = await dnGmxJuniorVault.getOptimalBorrows(totalAssetsAfter, false);
    const borrowValue = await dnGmxJuniorVault.getBorrowValue(optimalBorrows[0], optimalBorrows[1]);

    console.log({ totalAssetsAfter });
    console.log({ optimalBorrows });
    console.log({ borrowValue });

    const glpPrice = await dnGmxJuniorVault['getPrice(bool)'](false);
    console.log({ glpPrice });

    const targetDnGmxSeniorVaultAmount = BigNumber.from(targetHealthFactor - usdcLiquidationThreshold)
      .mul(borrowValue)
      .div(BigNumber.from(usdcLiquidationThreshold));
    console.log({ targetDnGmxSeniorVaultAmount });

    const currentDnGmxSeniorVaultAmount = (await aUSDC.balanceOf(dnGmxJuniorVault.address)).sub(dnUsdcDepositedBefore);
    console.log({ currentDnGmxSeniorVaultAmount });

    expect(totalAssetsAfter).to.eq(amount);
    expect(currentDnGmxSeniorVaultAmount).to.eq(0);

    const amountToBorrow = targetDnGmxSeniorVaultAmount.sub(currentDnGmxSeniorVaultAmount);
    console.log({ amountToBorrow });

    const availableBorrow = await dnGmxSeniorVault.availableBorrow(dnGmxJuniorVault.address);
    console.log({ availableBorrow });

    // availableBorrow = max(borrowCap, balanceOf)
    expect(availableBorrow).to.eq(parseUnits('100', 6));
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
    console.log({ optimalBorrowsCapped });

    /**
     *  uint256 unhedgedGlp = totalAssets().mulDiv(uncappedTokenHedge - cappedTokenHedge, uncappedTokenHedge);
        uint256 unhedgedGlpUsdcAmount = unhedgedGlp.mulDiv(getPrice(false), PRICE_PRECISION);
     */

    const unhedgedGlp = totalAssetsAfter.mul(optimalBorrows[1].sub(optimalBorrowsCapped[1])).div(optimalBorrows[1]);
    console.log({ unhedgedGlp });
    const unhedgedGlpUsdcAmount = unhedgedGlp.mul(glpPrice).div(PRICE_PRECISION);
    console.log({ unhedgedGlpUsdcAmount });

    const unhedgedGlpInUsdc = await dnGmxJuniorVault.unhedgedGlpInUsdc();
    console.log({ unhedgedGlpInUsdc });

    expect(unhedgedGlpInUsdc).eq(0);

    const slippageThresholdGmxBps = BigNumber.from(100); // 1%
    const MAX_BPS = BigNumber.from(10_000);

    const priceOfUsdc = await gmxVault.getMinPrice(usdc.address);
    console.log({ priceOfUsdc });

    const priceOfGlp = await dnGmxJuniorVault.getPriceExternal();
    console.log({ priceOfGlp });

    const USDC_DECIMALS = 6;
    const USDG_DECIMALS = 18;

    const minUsdgOut = unhedgedGlpUsdcAmount
      .mul(priceOfUsdc)
      .mul(MAX_BPS.sub(slippageThresholdGmxBps))
      .mul(BigNumber.from(10).pow(USDG_DECIMALS - USDC_DECIMALS))
      .div(MAX_BPS)
      .div(PRICE_PRECISION);
    console.log({ minUsdgOut });

    const usdgOutWithoutSlippage = unhedgedGlpUsdcAmount
      .mul(priceOfUsdc)
      .mul(BigNumber.from(10).pow(USDG_DECIMALS - USDC_DECIMALS))
      .div(PRICE_PRECISION);
    console.log({ usdgOutWithoutSlippage });

    const minGlpOut = minUsdgOut
      .mul(PRICE_PRECISION)
      .div(priceOfGlp)
      .div(BigNumber.from(10).pow(USDG_DECIMALS - USDC_DECIMALS));
    console.log({ minGlpOut });

    await dnGmxJuniorVault.rebalanceHedge(currentBtc, currentEth);

    const dnUsdcDeposited = await dnGmxJuniorVault.dnUsdcDepositedExternal();
    console.log({ dnUsdcDeposited });

    const totalAssets = await dnGmxJuniorVault.totalAssets();
    console.log({ totalAssets });

    expect(await dnGmxJuniorVault.getUsdcBorrowed()).to.closeTo(availableBorrow, 10n);

    // unhedgedGlp should incur some slippage when converting glp to usdc, so it should be within bounds
    expect(await dnGmxJuniorVault.unhedgedGlpInUsdc()).to.gt(
      minUsdgOut.div(BigNumber.from(10).pow(USDG_DECIMALS - USDC_DECIMALS)),
    );
    expect(await dnGmxJuniorVault.unhedgedGlpInUsdc()).to.lt(
      usdgOutWithoutSlippage.div(BigNumber.from(10).pow(USDG_DECIMALS - USDC_DECIMALS)),
    );
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
    // console.log('amountWithdraw', amountWithdraw);

    // values based on state after withdraw

    let totalAssetsAfter = parseEther('50');
    let optimalBorrows = await dnGmxJuniorVault.getOptimalBorrows(totalAssetsAfter, false);
    let borrowValue = await dnGmxJuniorVault.getBorrowValue(optimalBorrows[0], optimalBorrows[1]);

    let targetDnGmxSeniorVaultAmount = BigNumber.from(targetHealthFactor - usdcLiquidationThreshold)
      .mul(borrowValue)
      .div(BigNumber.from(usdcLiquidationThreshold));
    // console.log('targetDnGmxSeniorVaultAmount (expected: after withdraw)', targetDnGmxSeniorVaultAmount);

    await dnGmxJuniorVault.connect(users[0]).withdraw(amountWithdraw, users[0].address, users[0].address);
    // console.log('real total assets after: ', await dnGmxJuniorVault.totalAssets());

    const dnUsdcDepositedAfter = await dnGmxJuniorVault.dnUsdcDepositedExternal();
    // console.log('dnUsdcDepositedAfter (after withdraw)', dnUsdcDepositedAfter);

    const currentDnGmxSeniorVaultAmountAfter = (await aUSDC.balanceOf(dnGmxJuniorVault.address)).sub(
      dnUsdcDepositedAfter,
    );
    // console.log('currentDnGmxSeniorVaultAmountAfter (after withdraw)', currentDnGmxSeniorVaultAmountAfter);

    // console.log('available borrow', await dnGmxSeniorVault.availableBorrow(dnGmxJuniorVault.address));
    // console.log('borrow caps', await dnGmxSeniorVault.borrowCaps(dnGmxJuniorVault.address));

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

    await changer.changePriceToken('WBTC', 40000);
    await changer.changePriceToken('WETH', 3500);

    expect(await dnGmxJuniorVault.isValidRebalanceHF()).to.be.true;
  });

  it('Deposit Beyond Balance', async () => {
    /**
     * - senior tranche has less usdc to lend
     * - lot of incoming deposits in junior tranche, so unHedged glp increases
     * - senior tranche tvl increases, so unHedged glp winds down & borrows on aave increases
     */

    const { dnGmxJuniorVault, dnGmxSeniorVault, users, lendingPool, aUSDC, vdWBTC, vdWETH } =
      await dnGmxJuniorVaultFixture();
    await dnGmxSeniorVault.connect(users[1]).deposit(parseUnits('50', 6), users[1].address);

    const targetHF = BigNumber.from(15).mul(10n ** 17n);
    const hfVariance = targetHF.div(100); // 1%

    const PRICE_PRECISION = BigNumber.from(10).pow(30);

    let userData;
    let btcAmount, ethAmount;
    let currentBorrows, optimalBorrows, borrowValue;

    const amount1 = parseEther('100');

    // console.log('1st Deposit');
    await dnGmxJuniorVault.connect(users[0]).deposit(amount1, users[0].address);

    currentBorrows = await dnGmxJuniorVault.getCurrentBorrows();
    optimalBorrows = await dnGmxJuniorVault.getCurrentBorrows();
    borrowValue = await dnGmxJuniorVault.getBorrowValue(currentBorrows[0], currentBorrows[1]);

    btcAmount = await vdWBTC.balanceOf(dnGmxJuniorVault.address);
    ethAmount = await vdWETH.balanceOf(dnGmxJuniorVault.address);

    userData = await lendingPool.getUserAccountData(dnGmxJuniorVault.address);

    // console.log('dnUsdcDeposited', await dnGmxJuniorVault.dnUsdcDepositedExternal());
    // console.log('usdc borrowed', await dnGmxJuniorVault.getUsdcBorrowed());
    // console.log('ausdc balance senior', await aUSDC.balanceOf(dnGmxSeniorVault.address));
    // console.log('btc borrowed', btcAmount);
    // console.log('eth borrowed', ethAmount);
    // console.log('unhedgedGlpInUsdc', await dnGmxJuniorVault.unhedgedGlpInUsdc());
    // console.log('final borrow value', await dnGmxJuniorVault.getBorrowValue(btcAmount, ethAmount));
    // console.log(await lendingPool.getUserAccountData(dnGmxJuniorVault.address));

    expect(currentBorrows).to.deep.eq(optimalBorrows);

    expect(btcAmount).to.eq(optimalBorrows[0]);
    expect(ethAmount).to.eq(optimalBorrows[1]);

    expect(userData.healthFactor).to.closeTo(targetHF, hfVariance);

    expect(await dnGmxJuniorVault.unhedgedGlpInUsdc()).to.eq(0);

    const cappedBorrows = await dnGmxJuniorVault.getOptimalCappedBorrows(
      (await dnGmxSeniorVault.availableBorrow(dnGmxJuniorVault.address)).add(await dnGmxJuniorVault.getUsdcBorrowed()),
      8500,
    );
    const cappedBorrowValue = await dnGmxJuniorVault.getBorrowValue(cappedBorrows[0], cappedBorrows[1]);

    // console.log('2nd Deposit');
    await dnGmxJuniorVault.connect(users[0]).deposit(amount1, users[0].address);

    currentBorrows = await dnGmxJuniorVault.getCurrentBorrows();
    optimalBorrows = await dnGmxJuniorVault.getOptimalBorrows(amount1.mul(2), false);

    borrowValue = await dnGmxJuniorVault.getBorrowValue(currentBorrows[0], currentBorrows[1]);
    const uncappedBorrowValue = await dnGmxJuniorVault.getBorrowValue(optimalBorrows[0], optimalBorrows[1]);

    btcAmount = await vdWBTC.balanceOf(dnGmxJuniorVault.address);
    ethAmount = await vdWETH.balanceOf(dnGmxJuniorVault.address);

    userData = await lendingPool.getUserAccountData(dnGmxJuniorVault.address);

    // console.log('optimalBorrows', optimalBorrows);
    // console.log('currentBorrows', currentBorrows);
    // console.log('cappedBorrows', cappedBorrows);
    // console.log('cappedBorrowValue', cappedBorrowValue);
    // console.log('uncappedBorrowValue', uncappedBorrowValue);
    // console.log('dnUsdcDeposited', await dnGmxJuniorVault.dnUsdcDepositedExternal());
    // console.log('usdc borrowed', await dnGmxJuniorVault.getUsdcBorrowed());
    // console.log('ausdc balance senior', await aUSDC.balanceOf(dnGmxSeniorVault.address));
    // console.log('btc borrowed', btcAmount);
    // console.log('eth borrowed', ethAmount);
    // console.log('unhedgedGlpInUsdc', await dnGmxJuniorVault.unhedgedGlpInUsdc());
    // console.log('final borrow value', await dnGmxJuniorVault.getBorrowValue(btcAmount, ethAmount));
    // console.log(await lendingPool.getUserAccountData(dnGmxJuniorVault.address));

    // adjust interest accrued with closeTo
    expect(currentBorrows[0]).to.closeTo(cappedBorrows[0], 1);
    expect(currentBorrows[1]).to.closeTo(cappedBorrows[1], 10n ** 9n);

    expect(btcAmount).to.eq(currentBorrows[0]);
    expect(ethAmount).to.eq(currentBorrows[1]);

    expect(await dnGmxSeniorVault.availableBorrow(dnGmxJuniorVault.address)).to.eq(0);

    await dnGmxSeniorVault.connect(users[1]).deposit(parseUnits('150', 6), users[1].address);

    // console.log('3rd Deposit');
    await dnGmxJuniorVault.connect(users[0]).deposit(amount1, users[0].address);

    currentBorrows = await dnGmxJuniorVault.getCurrentBorrows();
    optimalBorrows = await dnGmxJuniorVault.getOptimalBorrows(dnGmxJuniorVault.totalAssets(), false);

    borrowValue = await dnGmxJuniorVault.getBorrowValue(currentBorrows[0], currentBorrows[1]);

    btcAmount = await vdWBTC.balanceOf(dnGmxJuniorVault.address);
    ethAmount = await vdWETH.balanceOf(dnGmxJuniorVault.address);

    userData = await lendingPool.getUserAccountData(dnGmxJuniorVault.address);

    // console.log('dnUsdcDeposited', await dnGmxJuniorVault.dnUsdcDepositedExternal());
    // console.log('usdc borrowed', await dnGmxJuniorVault.getUsdcBorrowed());
    // console.log('ausdc balance senior', await aUSDC.balanceOf(dnGmxSeniorVault.address));
    // console.log('btc borrowed', btcAmount);
    // console.log('eth borrowed', ethAmount);
    // console.log('unhedgedGlpInUsdc', await dnGmxJuniorVault.unhedgedGlpInUsdc());
    // console.log('final borrow value', await dnGmxJuniorVault.getBorrowValue(btcAmount, ethAmount));
    // console.log(await lendingPool.getUserAccountData(dnGmxJuniorVault.address));

    expect(await dnGmxJuniorVault.unhedgedGlpInUsdc()).to.eq(0);

    // adjust slippage with closeTo
    expect(currentBorrows[0]).to.closeTo(optimalBorrows[0], 2500n);
    expect(currentBorrows[1]).to.closeTo(optimalBorrows[1], 6n * 10n ** 14n);

    expect(btcAmount).to.eq(currentBorrows[0]);
    expect(ethAmount).to.eq(currentBorrows[1]);

    expect(userData.healthFactor).to.closeTo(targetHF, hfVariance);
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
    const { dnGmxJuniorVault, dnGmxSeniorVault, lendingPool, users, aUSDC, fsGlp } = opts;

    // await dnGmxJuniorVault.setMocks(mocks.swapRouterMock.address);
    await dnGmxJuniorVault.grantAllowances();

    const PRICE_PRECISION = BigNumber.from(10).pow(30);

    await dnGmxSeniorVault.connect(users[1]).deposit(parseUnits('150', 6), users[1].address);

    const amount = parseEther('100');

    // ETH: 1,547$ BTC: 19,929$
    await dnGmxJuniorVault.connect(users[0]).deposit(amount, users[0].address);

    // console.log('aave position', await lendingPool.getUserAccountData(dnGmxJuniorVault.address))
    // console.log('glp balance', await fsGlp.balanceOf(dnGmxJuniorVault.address));

    const [currentBtc, currentEth] = await dnGmxJuniorVault.getCurrentBorrows();

    const dnUsdcDepositedBefore = await dnGmxJuniorVault.dnUsdcDeposited();
    const borrowValueBefore = await dnGmxJuniorVault.getBorrowValue(currentBtc, currentEth);
    const totalAssetsBefore = await dnGmxJuniorVault.totalAssets();

    // console.log('totalAssetsBefore', totalAssetsBefore);
    // console.log('dnUsdcDepositedBefore', dnUsdcDepositedBefore);

    const glpPriceBefore = await dnGmxJuniorVault['getPrice(bool)'](false);

    // increase price => loss on aave => borrowVal > dnUsdcDeposited
    await changer.changePriceToken('WETH', 1700);
    await changer.changePriceToken('WBTC', 22500);

    const [currentBtc_, currentEth_] = await dnGmxJuniorVault.getCurrentBorrows();
    const borrowValue = await dnGmxJuniorVault.getBorrowValue(currentBtc_, currentEth_);

    const lossOnAave = borrowValue.sub(borrowValueBefore);

    const glpBal = await fsGlp.balanceOf(dnGmxJuniorVault.address);
    const glpPriceAfter = await dnGmxJuniorVault['getPrice(bool)'](false);
    const profitOnGmx = glpPriceAfter.sub(glpPriceBefore).mul(glpBal).div(PRICE_PRECISION);

    const netPnl = profitOnGmx.sub(lossOnAave);
    expect(netPnl).to.lt(0);

    const assetsToSell = netPnl.mul(PRICE_PRECISION).div(glpPriceAfter);
    const totalAssets = await dnGmxJuniorVault.totalAssets();
    const dnUsdcDeposited = await dnGmxJuniorVault.dnUsdcDeposited();
    // console.log('dnUsdcDeposited', dnUsdcDeposited);

    // console.log('lossOnAave', lossOnAave);
    // console.log('profitOnGmx', profitOnGmx);

    // console.log('netPnl', netPnl);
    // console.log('assetsToSell', assetsToSell);

    // console.log('aave position', await lendingPool.getUserAccountData(dnGmxJuniorVault.address))
    // console.log('glp balance', await fsGlp.balanceOf(dnGmxJuniorVault.address));

    await dnGmxJuniorVault.rebalanceProfit(borrowValue);

    // console.log('aave position', await lendingPool.getUserAccountData(dnGmxJuniorVault.address))
    // console.log('glp balance', await fsGlp.balanceOf(dnGmxJuniorVault.address));

    const dnUsdcDepositedAfter = await dnGmxJuniorVault.dnUsdcDeposited();
    const totalAssetsAfter = await dnGmxJuniorVault.totalAssets();

    // console.log('dnUsdcDepositedAfter', dnUsdcDepositedAfter);
    // console.log('totalAssetsAfter', totalAssetsAfter);

    // 100 bps slippage on each swap when using mocks
    expect(dnUsdcDepositedAfter).to.closeTo(borrowValue, 10n ** 5n);
  });

  it('Rebalance Profit - borrowVal < dnUsdcDeposited', async () => {
    const opts = await dnGmxJuniorVaultFixture();
    const changer = new Changer(opts);
    const { glpBatchingManager, dnGmxJuniorVault, dnGmxSeniorVault, lendingPool, users, aUSDC, fsGlp } = opts;

    // await dnGmxJuniorVault.setMocks(mocks.swapRouterMock.address);
    await dnGmxJuniorVault.grantAllowances();

    const PRICE_PRECISION = BigNumber.from(10).pow(30);

    await dnGmxSeniorVault.connect(users[1]).deposit(parseUnits('150', 6), users[1].address);

    const amount = parseEther('100');

    // ETH: 1,547$ BTC: 19,929$
    await dnGmxJuniorVault.connect(users[0]).deposit(amount, users[0].address);

    // console.log('aave position', await lendingPool.getUserAccountData(dnGmxJuniorVault.address))
    // console.log('glp balance', await fsGlp.balanceOf(dnGmxJuniorVault.address));

    const [currentBtc, currentEth] = await dnGmxJuniorVault.getCurrentBorrows();

    const dnUsdcDepositedBefore = await dnGmxJuniorVault.dnUsdcDeposited();
    // console.log('dnUsdcDepositedBefore', dnUsdcDepositedBefore);

    const borrowValueBefore = await dnGmxJuniorVault.getBorrowValue(currentBtc, currentEth);
    const totalAssetsBefore = await dnGmxJuniorVault.totalAssets();
    // console.log('totalAssetsBefore', totalAssetsBefore);

    const glpPriceBefore = await dnGmxJuniorVault['getPrice(bool)'](false);

    // ETH: 1,350$ BTC: 18,000$
    // decrease price => profit on aave => borrowVal < dnUsdcDeposited
    await changer.changePriceToken('WETH', 1350);
    await changer.changePriceToken('WBTC', 18000);

    const [currentBtc_, currentEth_] = await dnGmxJuniorVault.getCurrentBorrows();
    const borrowValue = await dnGmxJuniorVault.getBorrowValue(currentBtc_, currentEth_);

    const profitOnAave = borrowValueBefore.sub(borrowValue);

    const glpBal = await fsGlp.balanceOf(dnGmxJuniorVault.address);
    const glpPriceAfter = await dnGmxJuniorVault['getPrice(bool)'](false);
    const lossOnGmx = glpPriceBefore.sub(glpPriceAfter).mul(glpBal).div(PRICE_PRECISION);

    const netPnl = profitOnAave.sub(lossOnGmx);
    expect(netPnl).to.gt(0);

    const assetsToBuy = netPnl.mul(PRICE_PRECISION).div(glpPriceAfter);
    const dnUsdcDeposited = await dnGmxJuniorVault.dnUsdcDeposited();
    const totalAssets = await dnGmxJuniorVault.totalAssets();

    // console.log('profitOnAave', profitOnAave);
    // console.log('lossOnGmx', lossOnGmx);

    // console.log('netPnl', netPnl);
    // console.log('assetsToBuy', assetsToBuy);

    // console.log('dnUsdcDeposited', dnUsdcDeposited);

    // console.log('aave position', await lendingPool.getUserAccountData(dnGmxJuniorVault.address))
    // console.log('glp balance', await fsGlp.balanceOf(dnGmxJuniorVault.address));

    await dnGmxJuniorVault.rebalanceProfit(borrowValue);

    const [currentBtc__, currentEth__] = await dnGmxJuniorVault.getCurrentBorrows();
    const borrowValueAfter = await dnGmxJuniorVault.getBorrowValue(currentBtc__, currentEth__);

    // console.log('aave position', await lendingPool.getUserAccountData(dnGmxJuniorVault.address));
    // console.log('glp balance', await fsGlp.balanceOf(dnGmxJuniorVault.address));

    const dnUsdcDepositedAfter = await dnGmxJuniorVault.dnUsdcDeposited();
    // console.log('dnUsdcDepositedAfter', dnUsdcDepositedAfter);

    const totalAssetsAfter = await dnGmxJuniorVault.totalAssets();
    // console.log('totalAssetsAfter', totalAssetsAfter);

    expect(dnUsdcDepositedAfter).to.eq(borrowValue);
  });

  async function testRebalanceHedge({
    btcAmountInit,
    ethAmountInit,
    btcAmountFinal,
    ethAmountFinal,
    btcAboveThreshold,
    ethAboveThreshold,
  }: {
    btcAmountInit: number;
    ethAmountInit: number;
    btcAmountFinal: number;
    ethAmountFinal: number;
    btcAboveThreshold: boolean;
    ethAboveThreshold: boolean;
  }) {
    let tx;
    const opts = await dnGmxJuniorVaultFixture();
    const { dnGmxJuniorVault, dnGmxSeniorVault, users, sGlp, glp, targetHealthFactor, usdcLiquidationThreshold } = opts;

    const changer = new Changer(opts);
    // const logger = new Logger(opts);

    await dnGmxSeniorVault.connect(users[1]).deposit(parseUnits('100', 6), users[1].address);

    const amount = parseEther('100');

    await sGlp.connect(users[0]).transfer(dnGmxJuniorVault.address, amount);

    const [currentBtc, currentEth] = [BigNumber.from(0), BigNumber.from(0)];

    let wethPoolAmount = await changer.changeCurrentWeights('WETH', ethAmountInit);
    let wbtcPoolAmount = await changer.changeCurrentWeights('WBTC', btcAmountInit);

    // await logger.logPoolAmounts();
    // await logger.logUsdgAmounts();

    let glpDeposited = await dnGmxJuniorVault.totalAssets();
    let glpTotalSupply = await glp.totalSupply();

    await dnGmxJuniorVault.setPoolAmounts();
    tx = await dnGmxJuniorVault.rebalanceHedge(currentBtc, currentEth);

    const [btcInitial, ethInitial] = await dnGmxJuniorVault.getCurrentBorrows();

    expect(btcInitial).to.eq(wbtcPoolAmount.mul(glpDeposited).div(glpTotalSupply));
    expect(ethInitial).to.closeTo(wethPoolAmount.mul(glpDeposited).div(glpTotalSupply), 1);

    wethPoolAmount = await changer.changeCurrentWeights('WETH', ethAmountFinal);
    wbtcPoolAmount = await changer.changeCurrentWeights('WBTC', btcAmountFinal);

    // await logger.logPoolAmounts();
    // await logger.logUsdgAmounts();

    glpDeposited = await dnGmxJuniorVault.totalAssets();
    glpTotalSupply = await glp.totalSupply();

    await dnGmxJuniorVault.setPoolAmounts();
    tx = await dnGmxJuniorVault.rebalanceHedge(btcInitial, ethInitial);

    const [btcFinal, ethFinal] = await dnGmxJuniorVault.getCurrentBorrows();

    if (btcAboveThreshold) expect(btcFinal).to.closeTo(wbtcPoolAmount.mul(glpDeposited).div(glpTotalSupply), 1n);
    else expect(btcFinal).to.closeTo(btcInitial, 1);

    if (ethAboveThreshold)
      expect(ethFinal).to.closeTo(wethPoolAmount.mul(glpDeposited).div(glpTotalSupply), 10n ** 10n);
    else expect(ethFinal).to.closeTo(ethInitial, 10n ** 10n);

    // console.log({ btcInitial, ethInitial, btcFinal, ethFinal });
  }
});
