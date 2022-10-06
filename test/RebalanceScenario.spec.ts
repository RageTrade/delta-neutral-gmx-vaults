import { expect } from 'chai';
import { BigNumber } from 'ethers';
import { Logger } from './utils/logger';
import { Changer } from './utils/changer';
import { Checker } from './utils/checker';
import { increaseBlockTimestamp } from './utils/shared';
import { parseEther, parseUnits } from 'ethers/lib/utils';
import { dnGmxJuniorVaultFixture } from './fixtures/dn-gmx-junior-vault';

describe('Rebalance Scenarios', () => {
  it('Rebalance (External)', async () => {
    const opts = await dnGmxJuniorVaultFixture();
    const logger = new Logger(opts);
    const changer = new Changer(opts);

    const { dnGmxJuniorVault, dnGmxSeniorVault, glpBatchingManager, users, aUSDC } = opts;
    await dnGmxSeniorVault.connect(users[1]).deposit(parseUnits('150', 6), users[1].address);

    // becauses price are not changed on uniswap
    await dnGmxJuniorVault.setThresholds({
      slippageThreshold: 100,
      hfThreshold: 0,
      hedgeUsdcAmountThreshold: 0,
      usdcRedeemSlippage: 10_000,
      usdcConversionThreshold: parseUnits('20', 6),
      seniorVaultWethConversionThreshold: 10n ** 15n,
    });

    const amount = parseEther('77.59866282');

    let usdcBorrowed = await dnGmxJuniorVault.getUsdcBorrowed();
    let aUSDCBal = await aUSDC.balanceOf(dnGmxJuniorVault.address);
    let [currentBtc_, currentEth_] = await dnGmxJuniorVault.getCurrentBorrows();

    console.log('aUSDC balance before deposit: ', aUSDCBal);
    console.log('usdc borrowed from aave vault: ', usdcBorrowed);
    console.log(`current borrows before deposit: btc: ${currentBtc_}, eth: ${currentEth_}`);
    console.log('borrow value before deposit', await dnGmxJuniorVault.getBorrowValue(currentBtc_, currentEth_));

    // ETH: 1,547$ BTC: 19,929$
    await dnGmxJuniorVault.connect(users[0]).deposit(amount, users[0].address);

    usdcBorrowed = await dnGmxJuniorVault.getUsdcBorrowed();
    aUSDCBal = await aUSDC.balanceOf(dnGmxJuniorVault.address);
    [currentBtc_, currentEth_] = await dnGmxJuniorVault.getCurrentBorrows();

    console.log('aUSDC balance after deposit: ', aUSDCBal);
    console.log('usdc borrowed from aave vault: ', usdcBorrowed);
    console.log(`current borrows after deposit: btc: ${currentBtc_}, eth: ${currentEth_}`);
    console.log('borrow value after deposit', await dnGmxJuniorVault.getBorrowValue(currentBtc_, currentEth_));

    await increaseBlockTimestamp(15 * 60);
    await glpBatchingManager.executeBatchDeposit();

    await increaseBlockTimestamp(24 * 60 * 60);

    // ETH: 2,000$ BTC: 25,000$
    await changer.changePriceToken('WBTC', 25000);
    await changer.changePriceToken('WETH', 2000);

    await dnGmxJuniorVault.rebalance();

    usdcBorrowed = await dnGmxJuniorVault.getUsdcBorrowed();
    aUSDCBal = await aUSDC.balanceOf(dnGmxJuniorVault.address);
    [currentBtc_, currentEth_] = await dnGmxJuniorVault.getCurrentBorrows();

    console.log('aUSDC balance after rebalance: ', aUSDCBal);
    console.log('usdc borrowed from aave vault: ', usdcBorrowed);
    console.log(`current borrows after rebalance: btc: ${currentBtc_}, eth: ${currentEth_}`);
    console.log('borrow value after rebalance', await dnGmxJuniorVault.getBorrowValue(currentBtc_, currentEth_));

    await increaseBlockTimestamp(15 * 60);
    await glpBatchingManager.executeBatchDeposit();

    await increaseBlockTimestamp(24 * 60 * 60);

    // ETH: 1,350$ BTC: 18,000$
    await changer.changePriceToken('WBTC', 18000);
    await changer.changePriceToken('WETH', 1350);

    await dnGmxJuniorVault.rebalance();

    usdcBorrowed = await dnGmxJuniorVault.getUsdcBorrowed();
    aUSDCBal = await aUSDC.balanceOf(dnGmxJuniorVault.address);
    [currentBtc_, currentEth_] = await dnGmxJuniorVault.getCurrentBorrows();

    console.log('aUSDC balance after rebalance: ', aUSDCBal);
    console.log('usdc borrowed from aave vault: ', usdcBorrowed);
    console.log(`current borrows after rebalance: btc: ${currentBtc_}, eth: ${currentEth_}`);
    console.log('borrow value after rebalance', await dnGmxJuniorVault.getBorrowValue(currentBtc_, currentEth_));
  });

  it('Rebalance (Excel)', async () => {
    let tx;

    const opts = await dnGmxJuniorVaultFixture();
    const logger = new Logger(opts);
    const changer = new Changer(opts);
    const checker = new Checker(opts);

    const { dnGmxJuniorVault, dnGmxSeniorVault, glpBatchingManager, users, aUSDC, gmxVault, lendingPool } = opts;
    await dnGmxSeniorVault.connect(users[1]).deposit(parseUnits('150', 6), users[1].address);

    // becauses price are not changed on uniswap
    await dnGmxJuniorVault.setThresholds({
      slippageThreshold: 100,
      hfThreshold: 0,
      hedgeUsdcAmountThreshold: 0,
      usdcRedeemSlippage: 10_000,
      usdcConversionThreshold: parseUnits('20', 6),
      seniorVaultWethConversionThreshold: 10n ** 15n
    });

    // ETH: $2787.23 BTC: $38694.59
    await changer.changePriceToken('WBTC', 38694.59);
    await changer.changePriceToken('WETH', 2787.23);
    await logger.logGlpPrice();
    await logger.logTargetWeights();
    await logger.logAavePosition();
    await logger.logBorrowParams();

    // await changer.changeWeight('WBTC', 20_000, gmxVault);
    // await changer.changeWeight('WETH', 20_000, gmxVault);

    await checker.checkTotalAssets(150000000n, 10n ** 15n, false);

    // Deposit
    console.log('Initial Deposit');
    const amount = parseEther('100');
    await dnGmxJuniorVault.connect(users[0]).deposit(amount, users[0].address);

    await logger.logAavePosition();
    await logger.logBorrowParams();

    // await increaseBlockTimestamp(15 * 60);
    // await glpBatchingManager.executeBatchDeposit();

    await increaseBlockTimestamp(4 * 24 * 60 * 60);
    console.log('Time Increased');
    // ETH: $3012.65 BTC: $41382.59
    await changer.changePriceToken('WBTC', 41382.59);
    await changer.changePriceToken('WETH', 3012.65);

    await logger.logGlpPrice();
    await logger.logTargetWeights();

    await logger.logAavePosition();
    await logger.logBorrowParams();

    tx = await dnGmxJuniorVault.rebalance();
    await logger.logGlpRewards(tx);
    console.log('Rebalance');
    await logger.logAavePosition();
    await logger.logBorrowParams();
  });

  it('New Deposit (Excel)', async () => {
    let tx;

    const opts = await dnGmxJuniorVaultFixture();
    const logger = new Logger(opts);
    const changer = new Changer(opts);
    const checker = new Checker(opts);

    const { dnGmxJuniorVault, dnGmxSeniorVault, glpBatchingManager, users, aUSDC, gmxVault, lendingPool } = opts;
    await dnGmxSeniorVault.connect(users[1]).deposit(parseUnits('150', 6), users[1].address);

    // becauses price are not changed on uniswap
    await dnGmxJuniorVault.setThresholds({
      slippageThreshold: 100,
      hfThreshold: 0,
      hedgeUsdcAmountThreshold: 0,
      usdcRedeemSlippage: 10_000,
      usdcConversionThreshold: parseUnits('20', 6),
      seniorVaultWethConversionThreshold: 10n ** 15n
    });

    // ETH: $2787.23 BTC: $38694.59
    await changer.changePriceToken('WBTC', 38694.59);
    await changer.changePriceToken('WETH', 2787.23);
    await logger.logGlpPrice();
    await logger.logTargetWeights();
    await logger.logAavePosition();
    await logger.logBorrowParams();

    // await changer.changeWeight('WBTC', 20_000, gmxVault);
    // await changer.changeWeight('WETH', 20_000, gmxVault);

    // Deposit
    console.log('Initial Deposit');
    const amount = parseEther('100');
    await dnGmxJuniorVault.connect(users[0]).deposit(amount, users[0].address);

    await logger.logAavePosition();
    await logger.logBorrowParams();

    // await increaseBlockTimestamp(15 * 60);
    // await glpBatchingManager.executeBatchDeposit();

    await increaseBlockTimestamp(4 * 24 * 60 * 60);
    console.log('Time Increased');
    // ETH: $3012.65 BTC: $41382.59
    await changer.changePriceToken('WBTC', 41382.59);
    await changer.changePriceToken('WETH', 3012.65);
    await logger.logGlpPrice();
    await logger.logTargetWeights();

    await logger.logAavePosition();
    await logger.logBorrowParams();

    // New Deposit
    console.log('New Deposit');
    const amount1 = parseEther('50');
    await dnGmxJuniorVault.connect(users[0]).deposit(amount1, users[0].address);

    tx = await dnGmxJuniorVault.rebalance();
    await logger.logGlpRewards(tx);

    await logger.logAavePosition();
    await logger.logBorrowParams();
  });

  it('Partial Withdraw (Excel)', async () => {
    let tx;

    const opts = await dnGmxJuniorVaultFixture();
    const logger = new Logger(opts);
    const changer = new Changer(opts);
    const checker = new Checker(opts);

    const { dnGmxJuniorVault, dnGmxSeniorVault, glpBatchingManager, users, aUSDC, gmxVault, lendingPool } = opts;
    await dnGmxSeniorVault.connect(users[1]).deposit(parseUnits('150', 6), users[1].address);

    // becauses price are not changed on uniswap
    await dnGmxJuniorVault.setThresholds({
      slippageThreshold: 100,
      hfThreshold: 0,
      hedgeUsdcAmountThreshold: 0,
      usdcRedeemSlippage: 10_000,
      usdcConversionThreshold: parseUnits('20', 6),
      seniorVaultWethConversionThreshold: 10n ** 15n
    });

    // ETH: $2787.23 BTC: $38694.59
    await changer.changePriceToken('WBTC', 38694.59);
    await changer.changePriceToken('WETH', 2787.23);
    await logger.logGlpPrice();
    await logger.logTargetWeights();
    await logger.logAavePosition();
    await logger.logBorrowParams();

    // await changer.changeWeight('WBTC', 20_000, gmxVault);
    // await changer.changeWeight('WETH', 20_000, gmxVault);

    console.log('Initial Deposit');
    const amount = parseEther('100');
    await dnGmxJuniorVault.connect(users[0]).deposit(amount, users[0].address);

    await logger.logAavePosition();
    await logger.logBorrowParams();

    // await increaseBlockTimestamp(15 * 60);
    // await glpBatchingManager.executeBatchDeposit();

    await increaseBlockTimestamp(4 * 24 * 60 * 60);
    console.log('Time Increased');
    // ETH: $3012.65 BTC: $41382.59
    await changer.changePriceToken('WBTC', 41382.59);
    await changer.changePriceToken('WETH', 3012.65);
    await logger.logGlpPrice();
    await logger.logTargetWeights();

    await logger.logAavePosition();
    await logger.logBorrowParams();

    // Partial Withdraw
    console.log('Partial Withdraw');
    const amount1 = parseEther('50');
    await dnGmxJuniorVault.connect(users[0]).withdraw(amount1, users[0].address, users[0].address);

    tx = await dnGmxJuniorVault.rebalance();
    await logger.logGlpRewards(tx);

    await logger.logAavePosition();
    await logger.logBorrowParams();
  });

  it('Full Withdraw (Excel)', async () => {
    let tx;

    const opts = await dnGmxJuniorVaultFixture();
    const logger = new Logger(opts);
    const changer = new Changer(opts);
    const checker = new Checker(opts);

    const { dnGmxJuniorVault, dnGmxSeniorVault, glpBatchingManager, users, aUSDC, gmxVault, lendingPool } = opts;
    await dnGmxSeniorVault.connect(users[1]).deposit(parseUnits('150', 6), users[1].address);

    // becauses price are not changed on uniswap
    await dnGmxJuniorVault.setThresholds({
      slippageThreshold: 100,
      usdcRedeemSlippage: 10_000,
      hfThreshold: 0,
      hedgeUsdcAmountThreshold: 0,
      usdcConversionThreshold: parseUnits('20', 6),
      seniorVaultWethConversionThreshold: 10n ** 15n,
      hedgeUsdcAmountThreshold: parseUnits('10', 6),
      hfThreshold: 12_000,
    });

    // ETH: $2787.23 BTC: $38694.59
    await changer.changePriceToken('WBTC', 38694.59);
    await changer.changePriceToken('WETH', 2787.23);
    await logger.logGlpPrice();
    await logger.logTargetWeights();
    await logger.logAavePosition();
    await logger.logBorrowParams();

    // await changer.changeWeight('WBTC', 20_000, gmxVault);
    // await changer.changeWeight('WETH', 20_000, gmxVault);

    console.log('Initial Deposit');
    const amount = parseEther('100');
    await dnGmxJuniorVault.connect(users[0]).deposit(amount, users[0].address);

    await logger.logAavePosition();
    await logger.logBorrowParams();

    // await increaseBlockTimestamp(15 * 60);
    // await glpBatchingManager.executeBatchDeposit();

    await increaseBlockTimestamp(4 * 24 * 60 * 60);
    console.log('Time Increased');
    // ETH: $3012.65 BTC: $41382.59
    await changer.changePriceToken('WBTC', 41382.59);
    await changer.changePriceToken('WETH', 3012.65);
    await logger.logGlpPrice();
    await logger.logTargetWeights();

    await logger.logAavePosition();
    await logger.logBorrowParams();

    // Full Withdraw
    const amount1 = parseEther('100.121740317');
    await dnGmxJuniorVault.connect(users[0]).withdraw(amount1, users[0].address, users[0].address);

    tx = await dnGmxJuniorVault.rebalance();
    await logger.logGlpRewards(tx);

    await logger.logAavePosition();
    await logger.logBorrowParams();
  });

  it('EndToEnd1 (Excel)', async () => {
    let tx;

    const opts = await dnGmxJuniorVaultFixture();
    const logger = new Logger(opts);
    const changer = new Changer(opts);
    const checker = new Checker(opts);

    const { dnGmxJuniorVault, dnGmxSeniorVault, glpBatchingManager, users, aUSDC, gmxVault, lendingPool } = opts;
    await dnGmxSeniorVault.connect(users[1]).deposit(parseUnits('150', 6), users[1].address);

    // becauses price are not changed on uniswap
    await dnGmxJuniorVault.setThresholds({
      slippageThreshold: 100,
      hfThreshold: 0,
      hedgeUsdcAmountThreshold: 0,
      usdcRedeemSlippage: 10_000,
      usdcConversionThreshold: parseUnits('20', 6),
      seniorVaultWethConversionThreshold: 10n ** 15n,
      hedgeUsdcAmountThreshold: parseUnits('10', 6),
      hfThreshold: 12_000,
    });

    // ETH: $2787.23 BTC: $38694.59
    await changer.changePriceToken('WBTC', 38694.59);
    await changer.changePriceToken('WETH', 2787.23);
    await logger.logGlpPrice();
    await changer.changeWeight('WBTC', 14_627);
    await changer.changeWeight('WETH', 42_449);
    await logger.logAavePosition();
    await logger.logBorrowParams();

    // await logger.logTargetWeights();
    console.log('Initial Deposit');
    const amount = parseEther('100');
    await dnGmxJuniorVault.connect(users[0]).deposit(amount, users[0].address);

    await logger.logAavePosition();
    await logger.logBorrowParams();

    // await increaseBlockTimestamp(15 * 60);
    // await glpBatchingManager.executeBatchDeposit();

    await increaseBlockTimestamp(2 * 24 * 60 * 60);
    console.log('Time Increased');
    // ETH: $2695.46 BTC: $37311.61
    await changer.changePriceToken('WBTC', 37311.61);
    await changer.changePriceToken('WETH', 2695.46);
    await logger.logGlpPrice();
    await changer.changeWeight('WBTC', 14_036);
    await changer.changeWeight('WETH', 42_965);
    await logger.logAavePosition();
    await logger.logBorrowParams();

    // New Deposit
    console.log('New Deposit');
    const amount1 = parseEther('50');
    await dnGmxJuniorVault.connect(users[0]).deposit(amount1, users[0].address);

    tx = await dnGmxJuniorVault.rebalance();
    await logger.logGlpRewards(tx);

    await logger.logAavePosition();
    await logger.logBorrowParams();

    await increaseBlockTimestamp(2 * 24 * 60 * 60);
    console.log('Time Increased');
    // ETH: $3012.65 BTC: $41382.59
    await changer.changePriceToken('WBTC', 41382.59);
    await changer.changePriceToken('WETH', 3012.65);
    await logger.logGlpPrice();
    await changer.changeWeight('WBTC', 15_600);
    await changer.changeWeight('WETH', 40_836);
    await logger.logAavePosition();
    await logger.logBorrowParams();

    // Rebalance
    console.log('Time Based Rebalance');
    tx = await dnGmxJuniorVault.rebalance();
    await logger.logGlpRewards(tx);

    await logger.logAavePosition();
    await logger.logBorrowParams();

    await increaseBlockTimestamp(2 * 24 * 60 * 60);
    console.log('Time Increased');
    // ETH: $3139.77 BTC: $43839.99
    await changer.changePriceToken('WBTC', 43839.99);
    await changer.changePriceToken('WETH', 3139.77);
    await logger.logGlpPrice();
    await changer.changeWeight('WBTC', 16_003);
    await changer.changeWeight('WETH', 37_976);

    await logger.logAavePosition();
    await logger.logBorrowParams();

    // Partial Withdraw
    console.log('Partial Withdraw');
    // const amount1 = parseEther('50');
    await dnGmxJuniorVault.connect(users[0]).withdraw(amount1, users[0].address, users[0].address);

    tx = await dnGmxJuniorVault.rebalance();
    await logger.logGlpRewards(tx);

    await logger.logAavePosition();
    await logger.logBorrowParams();
  });

  it('EndToEnd2 (Excel)', async () => {
    let tx;

    const opts = await dnGmxJuniorVaultFixture();
    const logger = new Logger(opts);
    const changer = new Changer(opts);
    const checker = new Checker(opts);

    const { dnGmxJuniorVault, dnGmxSeniorVault, glpBatchingManager, users, aUSDC, gmxVault, lendingPool } = opts;
    await dnGmxSeniorVault.connect(users[1]).deposit(parseUnits('150', 6), users[1].address);

    // becauses price are not changed on uniswap
    await dnGmxJuniorVault.setThresholds({
      slippageThreshold: 100,
      hfThreshold: 0,
      hedgeUsdcAmountThreshold: 0,
      usdcRedeemSlippage: 10_000,
      usdcConversionThreshold: parseUnits('20', 6),
      seniorVaultWethConversionThreshold: 10n ** 15n
    });

    // ETH: $1859.84 BTC: $31373.1
    await changer.changePriceToken('WBTC', 31373.1);
    await changer.changePriceToken('WETH', 1859.84);
    await logger.logGlpPrice();
    await changer.changeWeight('WBTC', 13_560);
    await changer.changeWeight('WETH', 30_895);
    await logger.logAavePosition();
    await logger.logBorrowParams();

    // Initial Deposit
    console.log('Initial Deposit');
    const amount = parseEther('100');
    await dnGmxJuniorVault.connect(users[0]).deposit(amount, users[0].address);

    await logger.logAavePosition();
    await logger.logBorrowParams();

    // await increaseBlockTimestamp(15 * 60);
    // await glpBatchingManager.executeBatchDeposit();

    await increaseBlockTimestamp(2 * 24 * 60 * 60);
    console.log('Time Increased');
    // ETH: $1791.88 BTC: $30204.77
    await changer.changePriceToken('WBTC', 30204.77);
    await changer.changePriceToken('WETH', 1791.88);
    await logger.logGlpPrice();
    await changer.changeWeight('WBTC', 13_492);
    await changer.changeWeight('WETH', 30_434);
    await logger.logAavePosition();
    await logger.logBorrowParams();

    // New Deposit
    console.log('New Deposit');
    const amount1 = parseEther('50');
    await dnGmxJuniorVault.connect(users[0]).deposit(amount1, users[0].address);

    await increaseBlockTimestamp(2 * 24 * 60 * 60);
    console.log('Time Increased');
    tx = await dnGmxJuniorVault.rebalance();
    await logger.logGlpRewards(tx);
    await logger.logAavePosition();
    await logger.logBorrowParams();

    await increaseBlockTimestamp(2 * 24 * 60 * 60);
    console.log('Time Increased');
    // ETH: $1662.91 BTC: $29091.88
    await changer.changePriceToken('WBTC', 29091.88);
    await changer.changePriceToken('WETH', 1662.91);
    await logger.logGlpPrice();
    await changer.changeWeight('WBTC', 13_558);
    await changer.changeWeight('WETH', 28_467);
    await logger.logAavePosition();
    await logger.logBorrowParams();

    // Rebalance
    console.log('Time Based Rebalance');
    tx = await dnGmxJuniorVault.rebalance();
    await logger.logGlpRewards(tx);
    await logger.logAavePosition();
    await logger.logBorrowParams();

    await increaseBlockTimestamp(2 * 24 * 60 * 60);
    console.log('Time Increased');
    // ETH: $1434.84 BTC: $26574.53
    await changer.changePriceToken('WBTC', 26574.53);
    await changer.changePriceToken('WETH', 1434.84);
    await logger.logGlpPrice();
    await changer.changeWeight('WBTC', 14_491);
    await changer.changeWeight('WETH', 26_123);
    await logger.logAavePosition();
    await logger.logBorrowParams();

    // Partial Withdraw
    console.log('Partial Withdraw');
    // const amount1 = parseEther('50');
    await dnGmxJuniorVault.connect(users[0]).withdraw(amount1, users[0].address, users[0].address);

    tx = await dnGmxJuniorVault.rebalance();
    await logger.logGlpRewards(tx);

    await logger.logAavePosition();
    await logger.logBorrowParams();
  });
});
