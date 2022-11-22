// REBALANCE SCENARIO
import { expect } from 'chai';
import { BigNumber, ethers } from 'ethers';
import { Logger } from './utils/logger';
import { Changer } from './utils/changer';
import { Checker } from './utils/checker';
import { increaseBlockTimestamp } from './utils/shared';
import { parseEther, parseUnits } from 'ethers/lib/utils';
import { dnGmxJuniorVaultFixture } from './fixtures/dn-gmx-junior-vault';

describe('Rebalance Scenarios', () => {
  it('Rebalance (Excel)', async () => {
    let tx;

    const opts = await dnGmxJuniorVaultFixture();
    const logger = new Logger(opts);
    const changer = new Changer(opts);
    const checker = new Checker(opts);

    const { dnGmxJuniorVault, dnGmxSeniorVault, glpBatchingManager, users, mocks, aUSDC, gmxVault, lendingPool } = opts;
    await dnGmxJuniorVault.setMocks(mocks.swapRouterMock.address);
    await dnGmxJuniorVault.grantAllowances();

    // becauses price are not changed on uniswap
    await dnGmxJuniorVault.setThresholds(
      100, //slippageThresholdSwapBtcBps
      100, //slippageThresholdSwapEthBps
      100, //slippageThresholdGmxBps
      parseUnits('1', 6), //usdcConversionThreshold
      10n ** 15n, //wethConversionThreshold
      0, //hedgeUsdcAmountThreshold
      parseUnits('1000000', 6), //partialBtcHedgeUsdcAmountThreshold
      parseUnits('1000000', 6), //partialEthHedgeUsdcAmountThreshold
    );

    await dnGmxSeniorVault.connect(users[1]).deposit(parseUnits('150', 6), users[1].address);

    // ETH: $2787.23 BTC: $38694.59
    await changer.changePriceToken('WBTC', 38694.59);
    await changer.changePriceToken('WETH', 2787.23);
    // await logger.logGlpPrice();
    // await logger.logTargetWeights();
    // await logger.logAavePosition();
    // await logger.logBorrowParams();

    // await changer.changeWeight('WBTC', 20_000, gmxVault);
    // await changer.changeWeight('WETH', 20_000, gmxVault);

    await checker.checkTotalAssets(150000000n, 10n ** 15n, false);

    // Deposit
    console.log('--------------------Initial Deposit--------------------');
    const amount = parseEther('100');
    tx = await dnGmxJuniorVault.connect(users[0]).deposit(amount, users[0].address);

    // await logger.logAavePosition(tx);
    // await logger.logBorrowParams(tx);
    // await logger.logProtocolParamsAndHoldings();

    await checker.checkTotalAssets(98069713307823700000n, 10n ** 6n, true);
    await checker.checkTotalSupply(100000000000000000000n, 0, true);
    await checker.checkCurrentBorrowed([83259n, 12945732922165800n], [0, 7n * 10n ** 9n]);
    await checker.checkVaultMktValue(128185179n, 70n);
    await checker.checkBorrowValue(68302112n, 20n);
    await checker.checkUsdcBorrwed(52231026n, 20n);

    console.log('--------------------Time Increased--------------------');
    await increaseBlockTimestamp(4 * 24 * 60 * 60);
    // ETH: $3012.65 BTC: $41382.59
    await changer.changePriceToken('WBTC', 41382.59);
    await changer.changePriceToken('WETH', 3012.65);

    // await logger.logGlpPrice();
    // await logger.logTargetWeights();

    // await logger.logAavePosition();
    // await logger.logBorrowParams();
    // await logger.logProtocolParamsAndHoldings();

    await checker.checkTotalAssets(91102309937418000000n, 10n ** 17n, true);
    await checker.checkTotalSupply(100000000000000000000n, 0, true);
    await checker.checkVaultMktValue(125191488n, 400n);
    await checker.checkBorrowValue(73477703n, 500n);

    console.log('--------------------Rebalance--------------------');
    tx = await dnGmxJuniorVault.rebalance();
    // await logger.logGlpRewards(tx);
    // await logger.logAavePosition();
    // await logger.logBorrowParams();
    // await logger.logProtocolParamsAndHoldings();

    await checker.checkTotalAssets(91358658354324200000n, 10n ** 15n, true);
    await checker.checkTotalSupply(100000000000000000000n, 0, true);

    await checker.checkCurrentBorrowed([71850n, 11053918856301600n], [0, 10n ** 11n]);
    await checker.checkVaultMktValue(125069649n, 1000n);
    await checker.checkBorrowValue(63037594n, 500n);
    await checker.checkUsdcBorrwed(48205218n, 500n);
  });

  it('New Deposit (Excel)', async () => {
    let tx;

    const opts = await dnGmxJuniorVaultFixture();
    const logger = new Logger(opts);
    const changer = new Changer(opts);
    const checker = new Checker(opts);

    const { dnGmxJuniorVault, dnGmxSeniorVault, glpBatchingManager, users, aUSDC, gmxVault, lendingPool, mocks } = opts;
    await dnGmxJuniorVault.setMocks(mocks.swapRouterMock.address);
    await dnGmxJuniorVault.grantAllowances();

    // becauses price are not changed on uniswap
    await dnGmxJuniorVault.setThresholds(
      100, //slippageThresholdSwapBtcBps
      100, //slippageThresholdSwapEthBps
      100, //slippageThresholdGmxBps
      parseUnits('1', 6), //usdcConversionThreshold
      10n ** 15n, //wethConversionThreshold
      0, //hedgeUsdcAmountThreshold
      parseUnits('1000000', 6), //partialBtcHedgeUsdcAmountThreshold
      parseUnits('1000000', 6), //partialEthHedgeUsdcAmountThreshold
    );

    await dnGmxSeniorVault.connect(users[1]).deposit(parseUnits('150', 6), users[1].address);

    // ETH: $2787.23 BTC: $38694.59
    await changer.changePriceToken('WBTC', 38694.59);
    await changer.changePriceToken('WETH', 2787.23);
    // await logger.logGlpPrice();
    // await logger.logTargetWeights();
    // await logger.logAavePosition();
    // await logger.logBorrowParams();

    // await changer.changeWeight('WBTC', 20_000, gmxVault);
    // await changer.changeWeight('WETH', 20_000, gmxVault);

    // Deposit
    console.log('--------------------Initial Deposit--------------------');
    const amount = parseEther('100');
    tx = await dnGmxJuniorVault.connect(users[0]).deposit(amount, users[0].address);

    // await logger.logAavePosition(tx);
    // await logger.logBorrowParams(tx);
    // await logger.logProtocolParamsAndHoldings();

    await checker.checkTotalAssets(98069713307823700000n, 10n ** 6n, true);
    await checker.checkTotalSupply(100000000000000000000n, 0, true);
    await checker.checkCurrentBorrowed([83259n, 12945732922165800n], [0, 7n * 10n ** 9n]);
    await checker.checkVaultMktValue(128185179n, 70n);
    await checker.checkBorrowValue(68302112n, 20n);
    await checker.checkUsdcBorrwed(52231026n, 20n);

    console.log('--------------------Time Increased--------------------');
    await increaseBlockTimestamp(4 * 24 * 60 * 60);
    // ETH: $3012.65 BTC: $41382.59
    await changer.changePriceToken('WBTC', 41382.59);
    await changer.changePriceToken('WETH', 3012.65);

    // await logger.logGlpPrice();
    // await logger.logTargetWeights();

    // await logger.logAavePosition();
    // await logger.logBorrowParams();
    // await logger.logProtocolParamsAndHoldings();

    await checker.checkTotalAssets(91102309937418000000n, 10n ** 17n, true);
    await checker.checkTotalSupply(100000000000000000000n, 0, true);
    await checker.checkVaultMktValue(125191488n, 400n);
    await checker.checkBorrowValue(73477703n, 500n);

    // New Deposit
    console.log('--------------------New Deposit--------------------');
    const amount1 = parseEther('50');
    await dnGmxJuniorVault.connect(users[0]).deposit(amount1, users[0].address);
    // await logger.logAavePosition();
    // await logger.logBorrowParams();
    // await logger.logProtocolParamsAndHoldings();

    await checker.checkTotalAssets(139010473256711000000n, 10n ** 15n, true);
    await checker.checkTotalSupply(150406128989260000000n, 10n ** 14n, true);
    await checker.checkCurrentBorrowed([111433n, 17143849824616700n], [0, 10n ** 10n]);
    await checker.checkVaultMktValue(190457434n, 200n);
    await checker.checkBorrowValue(97766044n, 100n);
    await checker.checkUsdcBorrwed(74762268n, 400n);
  });

  it('Partial Withdraw (Excel)', async () => {
    let tx;

    const opts = await dnGmxJuniorVaultFixture();
    const logger = new Logger(opts);
    const changer = new Changer(opts);
    const checker = new Checker(opts);

    const { dnGmxJuniorVault, dnGmxSeniorVault, glpBatchingManager, users, aUSDC, gmxVault, lendingPool, mocks } = opts;
    await dnGmxJuniorVault.setMocks(mocks.swapRouterMock.address);
    await dnGmxJuniorVault.grantAllowances();

    // becauses price are not changed on uniswap
    await dnGmxJuniorVault.setThresholds(
      100, //slippageThresholdSwapBtcBps
      100, //slippageThresholdSwapEthBps
      100, //slippageThresholdGmxBps
      parseUnits('1', 6), //usdcConversionThreshold
      10n ** 15n, //wethConversionThreshold
      0, //hedgeUsdcAmountThreshold
      parseUnits('1000000', 6), //partialBtcHedgeUsdcAmountThreshold
      parseUnits('1000000', 6), //partialEthHedgeUsdcAmountThreshold
    );

    await dnGmxSeniorVault.connect(users[1]).deposit(parseUnits('150', 6), users[1].address);

    // ETH: $2787.23 BTC: $38694.59
    await changer.changePriceToken('WBTC', 38694.59);
    await changer.changePriceToken('WETH', 2787.23);
    // await logger.logGlpPrice();
    // await logger.logTargetWeights();
    // await logger.logAavePosition();
    // await logger.logBorrowParams();

    // await changer.changeWeight('WBTC', 20_000, gmxVault);
    // await changer.changeWeight('WETH', 20_000, gmxVault);

    console.log('--------------------Initial Deposit--------------------');
    const amount = parseEther('100');
    tx = await dnGmxJuniorVault.connect(users[0]).deposit(amount, users[0].address);

    // await logger.logAavePosition(tx);
    // await logger.logBorrowParams(tx);
    // await logger.logProtocolParamsAndHoldings();

    await checker.checkTotalAssets(98069713307823700000n, 10n ** 6n, true);
    await checker.checkTotalSupply(100000000000000000000n, 0, true);
    await checker.checkCurrentBorrowed([83259n, 12945732922165800n], [0, 7n * 10n ** 9n]);
    await checker.checkVaultMktValue(128185179n, 70n);
    await checker.checkBorrowValue(68302112n, 20n);
    await checker.checkUsdcBorrwed(52231026n, 20n);

    console.log('--------------------Time Increased--------------------');
    await increaseBlockTimestamp(4 * 24 * 60 * 60);
    // ETH: $3012.65 BTC: $41382.59
    await changer.changePriceToken('WBTC', 41382.59);
    await changer.changePriceToken('WETH', 3012.65);

    // await logger.logGlpPrice();
    // await logger.logTargetWeights();

    // await logger.logAavePosition();
    // await logger.logBorrowParams();
    // await logger.logProtocolParamsAndHoldings();

    await checker.checkTotalAssets(91102309937418000000n, 10n ** 17n, true);
    await checker.checkTotalSupply(100000000000000000000n, 0, true);
    await checker.checkVaultMktValue(125191488n, 400n);
    await checker.checkBorrowValue(73477703n, 500n);

    // Partial Withdraw
    console.log('--------------------Partial Withdraw--------------------');
    const amount1 = parseEther('50');
    await dnGmxJuniorVault.connect(users[0]).withdraw(amount1, users[0].address, users[0].address);

    // await logger.logAavePosition();
    // await logger.logBorrowParams();
    // await logger.logProtocolParamsAndHoldings();

    await checker.checkTotalAssets(43364301581876500000n, 10n ** 16n, true);
    await checker.checkTotalSupply(44907041136425100000n, 10n ** 18n, true);
    await checker.checkCurrentBorrowed([32266n - 1n, 4963987887986390n], [0, 10n ** 11n]);
    await checker.checkVaultMktValue(59198097n, 200n);
    await checker.checkBorrowValue(28308318n, 500n);
    await checker.checkUsdcBorrwed(21647537n, 400n);
  });

  it('Full Withdraw (Excel)', async () => {
    let tx;

    const opts = await dnGmxJuniorVaultFixture();
    const logger = new Logger(opts);
    const changer = new Changer(opts);
    const checker = new Checker(opts);

    const {
      dnGmxJuniorVault,
      dnGmxSeniorVault,
      glpBatchingManager,
      users,
      admin,
      aUSDC,
      gmxVault,
      lendingPool,
      mocks,
    } = opts;
    await dnGmxJuniorVault.setMocks(mocks.swapRouterMock.address);
    await dnGmxJuniorVault.grantAllowances();

    await dnGmxJuniorVault.setAdminParams(
      admin.address,
      dnGmxSeniorVault.address,
      ethers.constants.MaxUint256,
      glpBatchingManager.address,
      1000,
      3000,
    );
    // becauses price are not changed on uniswap
    await dnGmxJuniorVault.setThresholds(
      100, //slippageThresholdSwapBtcBps
      100, //slippageThresholdSwapEthBps
      100, //slippageThresholdGmxBps
      parseUnits('1', 6), //usdcConversionThreshold
      10n ** 15n, //wethConversionThreshold
      0, //hedgeUsdcAmountThreshold
      parseUnits('1000000', 6), //partialBtcHedgeUsdcAmountThreshold
      parseUnits('1000000', 6), //partialEthHedgeUsdcAmountThreshold
    );

    await dnGmxSeniorVault.connect(users[1]).deposit(parseUnits('150', 6), users[1].address);

    // ETH: $2787.23 BTC: $38694.59
    await changer.changePriceToken('WBTC', 38694.59);
    await changer.changePriceToken('WETH', 2787.23);
    // await logger.logGlpPrice();
    // await logger.logTargetWeights();
    // await logger.logAavePosition();
    // await logger.logBorrowParams();

    console.log('--------------------Initial Deposit--------------------');
    const amount = parseEther('100');
    tx = await dnGmxJuniorVault.connect(users[0]).deposit(amount, users[0].address);

    // await logger.logAavePosition(tx);
    // await logger.logBorrowParams(tx);
    // await logger.logProtocolParamsAndHoldings();

    await checker.checkTotalAssets(98069713307823700000n, 10n ** 6n, true);
    await checker.checkTotalSupply(100000000000000000000n, 0, true);
    await checker.checkCurrentBorrowed([83259n, 12945732922165800n], [0, 7n * 10n ** 9n]);
    await checker.checkVaultMktValue(128185179n, 70n);
    await checker.checkBorrowValue(68302112n, 20n);
    await checker.checkUsdcBorrwed(52231026n, 20n);

    console.log('--------------------Time Increased--------------------');
    await increaseBlockTimestamp(4 * 24 * 60 * 60);
    // ETH: $3012.65 BTC: $41382.59
    await changer.changePriceToken('WBTC', 41382.59);
    await changer.changePriceToken('WETH', 3012.65);

    // await logger.logGlpPrice();
    // await logger.logTargetWeights();

    // await logger.logAavePosition();
    // await logger.logBorrowParams();
    // await logger.logProtocolParamsAndHoldings();

    await checker.checkTotalAssets(91102309937418000000n, 10n ** 17n, true);
    await checker.checkTotalSupply(100000000000000000000n, 0, true);
    await checker.checkVaultMktValue(125191488n, 400n);
    await checker.checkBorrowValue(73477703n, 500n);

    console.log('--------------------Full Withdraw--------------------');
    // Full Withdraw 89313565165612328971 assets
    const amount1 = dnGmxJuniorVault.balanceOf(users[0].address);
    await dnGmxJuniorVault.connect(users[0]).redeem(amount1, users[0].address, users[0].address);

    // await logger.logAavePosition();
    // await logger.logBorrowParams();
    // await logger.logProtocolParamsAndHoldings();

    await checker.checkTotalAssets(12954863033723200000n, 10n ** 16n, true);
    await checker.checkTotalSupply(0n, 0, true);
    await checker.checkCurrentBorrowed([7185n, 1105388028599370n], [0, 10n ** 10n]);
    await checker.checkVaultMktValue(17461201n, 100n);
    await checker.checkBorrowValue(6303736n, 100n);
    await checker.checkUsdcBorrwed(4820504n, 100n);
  });

  it('TokenThreshold 1 : BtcWeight Decrease > threshold, EthWeight Decrease < threshold', async () => {
    let tx;

    const opts = await dnGmxJuniorVaultFixture();
    const logger = new Logger(opts);
    const changer = new Changer(opts);
    const checker = new Checker(opts);

    const { dnGmxJuniorVault, dnGmxSeniorVault, glpBatchingManager, users, mocks, aUSDC, gmxVault, lendingPool } = opts;
    await dnGmxJuniorVault.setMocks(mocks.swapRouterMock.address);
    await dnGmxJuniorVault.grantAllowances();

    // becauses price are not changed on uniswap
    await dnGmxJuniorVault.setThresholds(
      100, //slippageThresholdSwapBtcBps
      100, //slippageThresholdSwapEthBps
      100, //slippageThresholdGmxBps
      parseUnits('1', 6), //usdcConversionThreshold
      10n ** 15n, //wethConversionThreshold
      parseUnits('10', 6), //hedgeUsdcAmountThreshold
      parseUnits('1000000', 6), //partialBtcHedgeUsdcAmountThreshold
      parseUnits('1000000', 6), //partialEthHedgeUsdcAmountThreshold
    );

    await dnGmxSeniorVault.connect(users[1]).deposit(parseUnits('150', 6), users[1].address);

    // ETH: $2787.23 BTC: $38694.59
    await changer.changePriceToken('WBTC', 38694.59);
    await changer.changePriceToken('WETH', 2787.23);
    // await logger.logGlpPrice();
    // await logger.logTargetWeights();
    // await logger.logAavePosition();
    // await logger.logBorrowParams();

    // await changer.changeWeight('WBTC', 20_000, gmxVault);
    // await changer.changeWeight('WETH', 20_000, gmxVault);

    await checker.checkTotalAssets(150000000n, 10n ** 15n, false);

    // Deposit
    console.log('--------------------Initial Deposit--------------------');
    const amount = parseEther('100');
    tx = await dnGmxJuniorVault.connect(users[0]).deposit(amount, users[0].address);

    // await logger.logAavePosition(tx);
    // await logger.logBorrowParams(tx);
    // await logger.logProtocolParamsAndHoldings();

    await checker.checkTotalAssets(98069713307823700000n, 10n ** 6n, true);
    await checker.checkTotalSupply(100000000000000000000n, 0, true);
    await checker.checkCurrentBorrowed([83259n, 12945732922165800n], [0, 7n * 10n ** 9n]);
    await checker.checkVaultMktValue(128185179n, 70n);
    await checker.checkBorrowValue(68302112n, 20n);
    await checker.checkUsdcBorrwed(52231026n, 20n);

    await increaseBlockTimestamp(4 * 24 * 60 * 60);
    console.log('--------------------Time Increased--------------------');
    // ETH: $3012.65 BTC: $41382.59
    await changer.changePriceToken('WBTC', 50000.0);
    await changer.changePriceToken('WETH', 3012.65);
    await changer.changeWeight('WBTC', 18_000);
    await changer.changeWeight('WETH', 27_000);

    // await logger.logGlpPrice();
    // await logger.logTargetWeights();

    // await logger.logAavePosition();
    // await logger.logBorrowParams();
    // await logger.logProtocolParamsAndHoldings();

    await checker.checkTotalAssets(86296989402108500000n, 10n ** 10n, true);
    await checker.checkTotalSupply(100000000000000000000n, 0, true);
    await checker.checkVaultMktValue(125795826n, 500n);
    await checker.checkBorrowValue(80655165n, 600n);

    console.log('--------------------Rebalance--------------------');
    tx = await dnGmxJuniorVault.rebalance();
    // await logger.logGlpRewards(tx);
    // await logger.logAavePosition();
    // await logger.logBorrowParams();
    // await logger.logProtocolParamsAndHoldings();

    await checker.checkTotalAssets(86575166113367900000n, 10n ** 15n, true);
    await checker.checkTotalSupply(100000000000000000000n, 0, true);

    await checker.checkCurrentBorrowed([46474n, 12948247199528500n], [0, 10n ** 10n]);
    await checker.checkBorrowValue(62248167n, 300n);
    await checker.checkVaultMktValue(125569026n, 600n);
    await checker.checkUsdcBorrwed(44424089n, 2000n);
  });

  it('TokenThreshold 2 : BtcWeight Decrease > threshold, EthWeight Increase > threshold', async () => {
    let tx;

    const opts = await dnGmxJuniorVaultFixture();
    const logger = new Logger(opts);
    const changer = new Changer(opts);
    const checker = new Checker(opts);

    const { dnGmxJuniorVault, dnGmxSeniorVault, glpBatchingManager, users, mocks, aUSDC, gmxVault, lendingPool } = opts;
    await dnGmxJuniorVault.setMocks(mocks.swapRouterMock.address);
    await dnGmxJuniorVault.grantAllowances();

    // becauses price are not changed on uniswap
    await dnGmxJuniorVault.setThresholds(
      100, //slippageThresholdSwapBtcBps
      100, //slippageThresholdSwapEthBps
      100, //slippageThresholdGmxBps
      parseUnits('1', 6), //usdcConversionThreshold
      10n ** 15n, //wethConversionThreshold
      parseUnits('12', 6), //hedgeUsdcAmountThreshold
      parseUnits('1000000', 6), //partialBtcHedgeUsdcAmountThreshold
      parseUnits('1000000', 6), //partialEthHedgeUsdcAmountThreshold
    );

    await dnGmxSeniorVault.connect(users[1]).deposit(parseUnits('150', 6), users[1].address);

    // ETH: $2787.23 BTC: $38694.59
    await changer.changePriceToken('WBTC', 38694.59);
    await changer.changePriceToken('WETH', 2787.23);
    // await logger.logGlpPrice();
    // await logger.logTargetWeights();
    // await logger.logAavePosition();
    // await logger.logBorrowParams();

    // await changer.changeWeight('WBTC', 20_000, gmxVault);
    // await changer.changeWeight('WETH', 20_000, gmxVault);

    await checker.checkTotalAssets(150000000n, 10n ** 15n, false);

    // Deposit
    console.log('--------------------Initial Deposit--------------------');
    const amount = parseEther('100');
    tx = await dnGmxJuniorVault.connect(users[0]).deposit(amount, users[0].address);

    // await logger.logAavePosition(tx);
    // await logger.logBorrowParams(tx);
    // await logger.logProtocolParamsAndHoldings();

    await checker.checkTotalAssets(98069713307823700000n, 10n ** 6n, true);
    await checker.checkTotalSupply(100000000000000000000n, 0, true);
    await checker.checkCurrentBorrowed([83259n, 12945732922165800n], [0, 7n * 10n ** 9n]);
    await checker.checkVaultMktValue(128185179n, 70n);
    await checker.checkBorrowValue(68302112n, 20n);
    await checker.checkUsdcBorrwed(52231026n, 20n);

    await increaseBlockTimestamp(4 * 24 * 60 * 60);
    console.log('--------------------Time Increased--------------------');
    // ETH: $3012.65 BTC: $41382.59
    await changer.changePriceToken('WBTC', 41382.59);
    await changer.changePriceToken('WETH', 2000.0);
    await changer.changeWeight('WBTC', 18_000);
    await changer.changeWeight('WETH', 35_000);

    // await logger.logGlpPrice();
    // await logger.logTargetWeights();

    // await logger.logAavePosition();
    // await logger.logBorrowParams();
    // await logger.logProtocolParamsAndHoldings();

    await checker.checkTotalAssets(101630789421417000000n, 10n ** 10n, true);
    await checker.checkTotalSupply(100000000000000000000n, 0, true);
    await checker.checkVaultMktValue(122109738n, 400n);
    await checker.checkBorrowValue(60365153n, 500n);

    console.log('--------------------Rebalance--------------------');
    tx = await dnGmxJuniorVault.rebalance();
    // await logger.logGlpRewards(tx);
    // await logger.logAavePosition();
    // await logger.logBorrowParams();
    // await logger.logProtocolParamsAndHoldings();

    await checker.checkTotalAssets(101340176426302000000n, 10n ** 15n, true);
    await checker.checkTotalSupply(100000000000000000000n, 0, true);

    await checker.checkCurrentBorrowed([50796n - 2n, 20436684755889100n], [0n, 10n ** 11n]);
    await checker.checkBorrowValue(61896360n, 800n);
    await checker.checkUsdcBorrwed(47332510n, 300n);
    await checker.checkVaultMktValue(121366195n, 100n);
  });

  it('TokenThreshold 3 : BtcWeight Decrease < threshold, EthWeight Decrease < threshold', async () => {
    let tx;

    const opts = await dnGmxJuniorVaultFixture();
    const logger = new Logger(opts);
    const changer = new Changer(opts);
    const checker = new Checker(opts);

    const { dnGmxJuniorVault, dnGmxSeniorVault, glpBatchingManager, users, mocks, aUSDC, gmxVault, lendingPool } = opts;
    await dnGmxJuniorVault.setMocks(mocks.swapRouterMock.address);
    await dnGmxJuniorVault.grantAllowances();

    // becauses price are not changed on uniswap
    await dnGmxJuniorVault.setThresholds(
      100, //slippageThresholdSwapBtcBps
      100, //slippageThresholdSwapEthBps
      100, //slippageThresholdGmxBps
      parseUnits('1', 6), //usdcConversionThreshold
      10n ** 15n, //wethConversionThreshold
      parseUnits('12', 6), //hedgeUsdcAmountThreshold
      parseUnits('1000000', 6), //partialBtcHedgeUsdcAmountThreshold
      parseUnits('1000000', 6), //partialEthHedgeUsdcAmountThreshold
    );

    await dnGmxSeniorVault.connect(users[1]).deposit(parseUnits('150', 6), users[1].address);

    // ETH: $2787.23 BTC: $38694.59
    await changer.changePriceToken('WBTC', 38694.59);
    await changer.changePriceToken('WETH', 2787.23);
    // await logger.logGlpPrice();
    // await logger.logTargetWeights();
    // await logger.logAavePosition();
    // await logger.logBorrowParams();

    // await changer.changeWeight('WBTC', 20_000, gmxVault);
    // await changer.changeWeight('WETH', 20_000, gmxVault);

    await checker.checkTotalAssets(150000000n, 10n ** 15n, false);

    // Deposit
    console.log('--------------------Initial Deposit--------------------');
    const amount = parseEther('100');
    tx = await dnGmxJuniorVault.connect(users[0]).deposit(amount, users[0].address);

    // await logger.logAavePosition(tx);
    // await logger.logBorrowParams(tx);
    // await logger.logProtocolParamsAndHoldings();

    await checker.checkTotalAssets(98069713307823700000n, 10n ** 6n, true);
    await checker.checkTotalSupply(100000000000000000000n, 0, true);
    await checker.checkCurrentBorrowed([83259n, 12945732922165800n], [0, 7n * 10n ** 9n]);
    await checker.checkVaultMktValue(128185179n, 70n);
    await checker.checkBorrowValue(68302112n, 20n);
    await checker.checkUsdcBorrwed(52231026n, 20n);

    await increaseBlockTimestamp(4 * 24 * 60 * 60);
    console.log('--------------------Time Increased--------------------');
    // ETH: $3012.65 BTC: $41382.59
    await changer.changePriceToken('WBTC', 41382.59);
    await changer.changePriceToken('WETH', 3012.65);
    await changer.changeWeight('WBTC', 22_000);
    await changer.changeWeight('WETH', 27_000);

    // await logger.logGlpPrice();
    // await logger.logTargetWeights();

    // await logger.logAavePosition();
    // await logger.logBorrowParams();
    // await logger.logProtocolParamsAndHoldings();

    await checker.checkTotalAssets(91102309937418000000n, 10n ** 10n, true);
    await checker.checkTotalSupply(100000000000000000000n, 0, true);
    await checker.checkVaultMktValue(125191487n, 400n);
    await checker.checkBorrowValue(73477704n, 500n);

    console.log('--------------------Rebalance--------------------');
    tx = await dnGmxJuniorVault.rebalance();
    // await logger.logGlpRewards(tx);
    // await logger.logAavePosition();
    // await logger.logBorrowParams();
    // await logger.logProtocolParamsAndHoldings();

    await checker.checkTotalAssets(90754554449886000000n, 10n ** 15n, true);
    await checker.checkTotalSupply(100000000000000000000n, 0, true);

    await checker.checkCurrentBorrowed([83287n + 1n, 12948247272272900n], [0, 10n ** 10n]);
    await checker.checkBorrowValue(73477704n, 500n);
    // // USDC borrowed from SrTranche is bases optimalBorrowValue & not currentBorrowValue when swapAmount < Threshold
    await checker.checkUsdcBorrwed(46423446n, 100n);
    await checker.checkVaultMktValue(125173267n, 400n);
  });

  it('TokenThreshold 4 : BtcWeight Decrease < threshold, EthWeight Decrease > threshold', async () => {
    let tx;

    const opts = await dnGmxJuniorVaultFixture();
    const logger = new Logger(opts);
    const changer = new Changer(opts);
    const checker = new Checker(opts);

    const { dnGmxJuniorVault, dnGmxSeniorVault, glpBatchingManager, users, mocks, aUSDC, gmxVault, lendingPool } = opts;
    await dnGmxJuniorVault.setMocks(mocks.swapRouterMock.address);
    await dnGmxJuniorVault.grantAllowances();

    // becauses price are not changed on uniswap
    await dnGmxJuniorVault.setThresholds(
      100, //slippageThresholdSwapBtcBps
      100, //slippageThresholdSwapEthBps
      100, //slippageThresholdGmxBps
      parseUnits('1', 6), //usdcConversionThreshold
      10n ** 15n, //wethConversionThreshold
      parseUnits('12', 6), //hedgeUsdcAmountThreshold
      parseUnits('1000000', 6), //partialBtcHedgeUsdcAmountThreshold
      parseUnits('1000000', 6), //partialEthHedgeUsdcAmountThreshold
    );

    await dnGmxSeniorVault.connect(users[1]).deposit(parseUnits('150', 6), users[1].address);

    // ETH: $2787.23 BTC: $38694.59
    await changer.changePriceToken('WBTC', 38694.59);
    await changer.changePriceToken('WETH', 2787.23);
    // await logger.logGlpPrice();
    // await logger.logTargetWeights();
    // await logger.logAavePosition();
    // await logger.logBorrowParams();

    await checker.checkTotalAssets(150000000n, 10n ** 15n, false);

    // Deposit
    console.log('--------------------Initial Deposit--------------------');
    const amount = parseEther('100');
    tx = await dnGmxJuniorVault.connect(users[0]).deposit(amount, users[0].address);

    // await logger.logAavePosition(tx);
    // await logger.logBorrowParams(tx);
    // await logger.logProtocolParamsAndHoldings();

    await checker.checkTotalAssets(98069713307823700000n, 10n ** 6n, true);
    await checker.checkTotalSupply(100000000000000000000n, 0, true);
    await checker.checkCurrentBorrowed([83259n, 12945732922165800n], [0, 7n * 10n ** 9n]);
    await checker.checkVaultMktValue(128185179n, 70n);
    await checker.checkBorrowValue(68302112n, 20n);
    await checker.checkUsdcBorrwed(52231026n, 20n);

    await increaseBlockTimestamp(4 * 24 * 60 * 60);
    console.log('--------------------Time Increased--------------------');
    // ETH: $3012.65 BTC: $41382.59
    await changer.changePriceToken('WBTC', 42000.0);
    await changer.changePriceToken('WETH', 4000.0);
    await changer.changeWeight('WBTC', 27_000);
    await changer.changeWeight('WETH', 30_000);

    // await logger.logGlpPrice();
    // await logger.logTargetWeights();

    // await logger.logAavePosition();
    // await logger.logBorrowParams();
    // await logger.logProtocolParamsAndHoldings();

    await checker.checkTotalAssets(82822900878136100000n, 10n ** 18n, true);
    await checker.checkTotalSupply(100000000000000000000n, 0, true);
    await checker.checkVaultMktValue(128239177n, 10n);
    await checker.checkBorrowValue(86777314n, 30n);

    console.log('--------------------Rebalance--------------------');
    tx = await dnGmxJuniorVault.rebalance();
    // await logger.logGlpRewards(tx);
    // await logger.logAavePosition();
    // await logger.logBorrowParams();
    // await logger.logProtocolParamsAndHoldings();

    await checker.checkTotalAssets(82685871897861000000n, 10n ** 16n, true);
    await checker.checkTotalSupply(100000000000000000000n, 0, true);

    await checker.checkCurrentBorrowed([83288n, 8691980640139930n], [0, 10n ** 11n]);
    await checker.checkBorrowValue(69751588n, 300n);
    // // // USDC borrowed from SrTranche is bases optimalBorrowValue & not currentBorrowValue when swapAmount < Threshold
    await checker.checkUsdcBorrwed(50516352n, 2000n);
    await checker.checkVaultMktValue(128016451n, 1000n);
  });

  it('TokenThreshold 5 : BtcWeight Increase < threshold, EthWeight Increase > threshold', async () => {
    let tx;

    const opts = await dnGmxJuniorVaultFixture();
    const logger = new Logger(opts);
    const changer = new Changer(opts);
    const checker = new Checker(opts);

    const { dnGmxJuniorVault, dnGmxSeniorVault, glpBatchingManager, users, mocks, aUSDC, gmxVault, lendingPool } = opts;
    await dnGmxJuniorVault.setMocks(mocks.swapRouterMock.address);
    await dnGmxJuniorVault.grantAllowances();

    // becauses price are not changed on uniswap
    await dnGmxJuniorVault.setThresholds(
      100, //slippageThresholdSwapBtcBps
      100, //slippageThresholdSwapEthBps
      100, //slippageThresholdGmxBps
      parseUnits('1', 6), //usdcConversionThreshold
      10n ** 15n, //wethConversionThreshold
      parseUnits('8', 6), //hedgeUsdcAmountThreshold
      parseUnits('1000000', 6), //partialBtcHedgeUsdcAmountThreshold
      parseUnits('1000000', 6), //partialEthHedgeUsdcAmountThreshold
    );

    await dnGmxSeniorVault.connect(users[1]).deposit(parseUnits('150', 6), users[1].address);

    // ETH: $2787.23 BTC: $38694.59
    await changer.changePriceToken('WBTC', 38694.59);
    await changer.changePriceToken('WETH', 2787.23);
    // await logger.logGlpPrice();
    // await logger.logTargetWeights();
    // await logger.logAavePosition();
    // await logger.logBorrowParams();

    // await changer.changeWeight('WBTC', 20_000, gmxVault);
    // await changer.changeWeight('WETH', 20_000, gmxVault);

    await checker.checkTotalAssets(150000000n, 10n ** 15n, false);

    // Deposit
    console.log('--------------------Initial Deposit--------------------');
    const amount = parseEther('100');
    tx = await dnGmxJuniorVault.connect(users[0]).deposit(amount, users[0].address);

    // await logger.logAavePosition(tx);
    // await logger.logBorrowParams(tx);
    // await logger.logProtocolParamsAndHoldings();

    await checker.checkTotalAssets(98069713307823700000n, 10n ** 6n, true);
    await checker.checkTotalSupply(100000000000000000000n, 0, true);
    await checker.checkCurrentBorrowed([83259n, 12945732922165800n], [0, 7n * 10n ** 9n]);
    await checker.checkVaultMktValue(128185179n, 70n);
    await checker.checkBorrowValue(68302112n, 20n);
    await checker.checkUsdcBorrwed(52231026n, 20n);

    await increaseBlockTimestamp(4 * 24 * 60 * 60);
    console.log('--------------------Time Increased--------------------');
    // ETH: $3012.65 BTC: $41382.59
    await changer.changePriceToken('WBTC', 41382.59);
    await changer.changePriceToken('WETH', 2000.0);
    await changer.changeWeight('WBTC', 30_000);
    await changer.changeWeight('WETH', 35_000);

    // await logger.logGlpPrice();
    // await logger.logTargetWeights();

    // await logger.logAavePosition();
    // await logger.logBorrowParams();
    // await logger.logProtocolParamsAndHoldings();

    await checker.checkTotalAssets(101630789421417000000n, 10n ** 10n, true);
    await checker.checkTotalSupply(100000000000000000000n, 0, true);
    await checker.checkVaultMktValue(122109324n, 400n);
    await checker.checkBorrowValue(60365567n, 500n);

    console.log('--------------------Rebalance--------------------');
    tx = await dnGmxJuniorVault.rebalance();
    // await logger.logGlpRewards(tx);
    // await logger.logAavePosition();
    // await logger.logBorrowParams();
    // await logger.logProtocolParamsAndHoldings();

    await checker.checkTotalAssets(100847495127276000000n, 10n ** 16n, true);
    await checker.checkTotalSupply(100000000000000000000n, 0, true);

    await checker.checkCurrentBorrowed([83288n, 18246634786354600n], [0n, 10n ** 11n]);
    await checker.checkBorrowValue(70962753n, 100n);
    await checker.checkUsdcBorrwed(51828585n, 100n);
    await checker.checkVaultMktValue(121544057n, 3000n);
  });

  it('Sr Tranche Insufficient Funds 1 : Deposit in SrTranche (Excel)', async () => {
    let tx;

    const opts = await dnGmxJuniorVaultFixture();
    const logger = new Logger(opts);
    const changer = new Changer(opts);
    const checker = new Checker(opts);

    const { dnGmxJuniorVault, dnGmxSeniorVault, glpBatchingManager, users, aUSDC, gmxVault, lendingPool, mocks } = opts;
    await dnGmxJuniorVault.setMocks(mocks.swapRouterMock.address);
    await dnGmxJuniorVault.grantAllowances();

    // becauses price are not changed on uniswap
    await dnGmxJuniorVault.setThresholds(
      100, //slippageThresholdSwapBtcBps
      100, //slippageThresholdSwapEthBps
      100, //slippageThresholdGmxBps
      parseUnits('1', 6), //usdcConversionThreshold
      10n ** 15n, //wethConversionThreshold
      0, //hedgeUsdcAmountThreshold
      parseUnits('1000000', 6), //partialBtcHedgeUsdcAmountThreshold
      parseUnits('1000000', 6), //partialEthHedgeUsdcAmountThreshold
    );

    console.log('--------------------Sr. Tranche Initial Deposit--------------------');
    await dnGmxSeniorVault.connect(users[1]).deposit(parseUnits('60', 6), users[1].address);

    // ETH: $2787.23 BTC: $38694.59
    await changer.changePriceToken('WBTC', 38694.59);
    await changer.changePriceToken('WETH', 2787.23);
    // await logger.logGlpPrice();
    // await logger.logTargetWeights();
    // await logger.logAavePosition();
    // await logger.logBorrowParams();

    // await changer.changeWeight('WBTC', 20_000, gmxVault);
    // await changer.changeWeight('WETH', 20_000, gmxVault);

    // Deposit
    console.log('--------------------Jr. Tranche Initial Deposit--------------------');
    const amount = parseEther('100');
    await dnGmxJuniorVault.connect(users[0]).deposit(amount, users[0].address);

    // await logger.logAavePosition();
    // await logger.logBorrowParams();
    // await logger.logProtocolParamsAndHoldings();

    await checker.checkTotalAssets(98069713307823700000n, 10n ** 6n, true);
    await checker.checkTotalSupply(100000000000000000000n, 0, true);
    await checker.checkCurrentBorrowed([83259n, 12945732922165800n], [0, 7n * 10n ** 9n]);
    await checker.checkVaultMktValue(128185179n, 70n);
    await checker.checkBorrowValue(68302112n, 20n);
    await checker.checkUsdcBorrwed(52231026n, 20n);

    await increaseBlockTimestamp(4 * 24 * 60 * 60);
    console.log('--------------------Time Increased--------------------');
    // ETH: $3012.65 BTC: $41382.59
    await changer.changePriceToken('WBTC', 41382.59);
    await changer.changePriceToken('WETH', 3012.65);
    // await logger.logGlpPrice();
    // await logger.logTargetWeights();

    // await logger.logAavePosition();
    // await logger.logBorrowParams();
    // await logger.logProtocolParamsAndHoldings();

    await checker.checkTotalAssets(91102309937418000000n, 10n ** 17n, true);
    await checker.checkTotalSupply(100000000000000000000n, 0, true);
    await checker.checkVaultMktValue(125191488n, 400n);
    await checker.checkBorrowValue(73477703n, 500n);

    // New Deposit
    console.log('--------------------Jr. Tranche New Deposit--------------------');
    const amount1 = parseEther('50');
    await dnGmxJuniorVault.connect(users[0]).deposit(amount1, users[0].address);
    // await logger.logAavePosition();
    // await logger.logBorrowParams();
    // await logger.logProtocolParamsAndHoldings();

    await checker.checkTotalAssets(138241904155464000000n, 10n ** 15n, true);
    await checker.checkTotalSupply(150406289521053000000n, 10n ** 15n, true);
    await checker.checkCurrentBorrowed([89441n, 13760285868700400n], [0, 10n ** 9n]);
    await checker.checkVaultMktValue(190650989n, 10n ** 6n);
    await checker.checkBorrowValue(78470971n, 100n);
    await checker.checkUsdcBorrwed(60007213n, 500n);

    console.log('--------------------Time Increased--------------------');
    await increaseBlockTimestamp(60);
    // ETH: $3012.65 BTC: $41382.59
    await changer.changePriceToken('WBTC', 41382.59);
    await changer.changePriceToken('WETH', 3012.65);
    // await logger.logGlpPrice();
    // await logger.logTargetWeights();

    // await logger.logAavePosition();
    // await logger.logBorrowParams();
    // await logger.logProtocolParamsAndHoldings();

    await checker.checkTotalAssets(138241891824787000000n, 10n ** 16n, true);
    await checker.checkTotalSupply(150406289521053000000n, 10n ** 15n, true);
    await checker.checkBorrowValue(78470987n, 100n);

    console.log('--------------------Sr. Tranche New Deposit--------------------');
    await dnGmxSeniorVault.connect(users[1]).deposit(parseUnits('40', 6), users[1].address);

    // ETH: $2787.23 BTC: $38694.59
    await changer.changePriceToken('WBTC', 41382.59);
    await changer.changePriceToken('WETH', 3012.65);
    // await logger.logGlpPrice();
    // await logger.logTargetWeights();
    // await logger.logAavePosition();
    // await logger.logBorrowParams();

    console.log('--------------------Rebalance--------------------');
    tx = await dnGmxJuniorVault.rebalance();
    // await logger.logGlpRewards(tx);
    // await logger.logAavePosition();
    // await logger.logBorrowParams();
    // await logger.logProtocolParamsAndHoldings();

    await checker.checkTotalAssets(137183522113597000000n, 10n ** 16n, true);
    await checker.checkTotalSupply(150406289521053000000n, 10n ** 15n, true);
    await checker.checkCurrentBorrowed([109445n - 1n, 16837670154851500n], [0, 10n ** 11n]);
    await checker.checkBorrowValue(96020808n, 500n);
    await checker.checkUsdcBorrwed(73427676n, 500n);
    await checker.checkVaultMktValue(187916253n, 500n);
  });

  it('Sr Tranche Insufficient Funds 2 : Withdraw from JrTranche (Excel)', async () => {
    let tx;

    const opts = await dnGmxJuniorVaultFixture();
    const logger = new Logger(opts);
    const changer = new Changer(opts);
    const checker = new Checker(opts);

    const { dnGmxJuniorVault, dnGmxSeniorVault, glpBatchingManager, users, aUSDC, gmxVault, lendingPool, mocks } = opts;
    await dnGmxJuniorVault.setMocks(mocks.swapRouterMock.address);
    await dnGmxJuniorVault.grantAllowances();

    // becauses price are not changed on uniswap
    await dnGmxJuniorVault.setThresholds(
      100, //slippageThresholdSwapBtcBps
      100, //slippageThresholdSwapEthBps
      100, //slippageThresholdGmxBps
      parseUnits('1', 6), //usdcConversionThreshold
      10n ** 15n, //wethConversionThreshold
      0, //hedgeUsdcAmountThreshold
      parseUnits('1000000', 6), //partialBtcHedgeUsdcAmountThreshold
      parseUnits('1000000', 6), //partialEthHedgeUsdcAmountThreshold
    );

    console.log('--------------------Sr. Tranche Initial Deposit--------------------');
    await dnGmxSeniorVault.connect(users[1]).deposit(parseUnits('60', 6), users[1].address);

    // ETH: $2787.23 BTC: $38694.59
    await changer.changePriceToken('WBTC', 38694.59);
    await changer.changePriceToken('WETH', 2787.23);
    // await logger.logGlpPrice();
    // await logger.logTargetWeights();
    // await logger.logAavePosition();
    // await logger.logBorrowParams();

    // await changer.changeWeight('WBTC', 20_000, gmxVault);
    // await changer.changeWeight('WETH', 20_000, gmxVault);

    // Deposit
    console.log('--------------------Jr. Tranche Initial Deposit--------------------');
    const amount = parseEther('100');
    await dnGmxJuniorVault.connect(users[0]).deposit(amount, users[0].address);

    // await logger.logAavePosition();
    // await logger.logBorrowParams();
    // await logger.logProtocolParamsAndHoldings();

    await checker.checkTotalAssets(98069713307823700000n, 10n ** 6n, true);
    await checker.checkTotalSupply(100000000000000000000n, 0, true);
    await checker.checkCurrentBorrowed([83259n, 12945732922165800n], [0, 7n * 10n ** 9n]);
    await checker.checkVaultMktValue(128185179n, 70n);
    await checker.checkBorrowValue(68302112n, 20n);
    await checker.checkUsdcBorrwed(52231026n, 20n);

    await increaseBlockTimestamp(4 * 24 * 60 * 60);
    console.log('--------------------Time Increased--------------------');
    // ETH: $3012.65 BTC: $41382.59
    await changer.changePriceToken('WBTC', 41382.59);
    await changer.changePriceToken('WETH', 3012.65);
    // await logger.logGlpPrice();
    // await logger.logTargetWeights();

    // await logger.logAavePosition();
    // await logger.logBorrowParams();
    // await logger.logProtocolParamsAndHoldings();

    await checker.checkTotalAssets(91102309937418000000n, 10n ** 17n, true);
    await checker.checkTotalSupply(100000000000000000000n, 0, true);
    await checker.checkVaultMktValue(125191488n, 400n);
    await checker.checkBorrowValue(73477703n, 500n);

    // New Deposit
    console.log('--------------------Jr. Tranche New Deposit--------------------');
    const amount1 = parseEther('50');
    await dnGmxJuniorVault.connect(users[0]).deposit(amount1, users[0].address);
    // await logger.logAavePosition();
    // await logger.logBorrowParams();
    // await logger.logProtocolParamsAndHoldings();

    await checker.checkTotalAssets(138241904155464000000n, 10n ** 15n, true);
    await checker.checkTotalSupply(150406289521053000000n, 10n ** 15n, true);
    await checker.checkCurrentBorrowed([89441n, 13760285868700400n], [0, 10n ** 9n]);
    await checker.checkVaultMktValue(190650989n, 10n ** 6n);
    await checker.checkBorrowValue(78470971n, 100n);
    await checker.checkUsdcBorrwed(60007213n, 500n);

    console.log('--------------------Time Increased--------------------');
    await increaseBlockTimestamp(60);
    // ETH: $3012.65 BTC: $41382.59
    await changer.changePriceToken('WBTC', 41382.59);
    await changer.changePriceToken('WETH', 3012.65);
    // await logger.logGlpPrice();
    // await logger.logTargetWeights();

    // await logger.logAavePosition();
    // await logger.logBorrowParams();
    // await logger.logProtocolParamsAndHoldings();

    await checker.checkTotalAssets(138241891824787000000n, 10n ** 16n, true);
    await checker.checkTotalSupply(150406289521053000000n, 10n ** 15n, true);
    await checker.checkBorrowValue(78470987n, 100n);

    console.log('--------------------Jr. Tranche Partial Withdraw--------------------');
    const amount2 = parseEther('15');
    await dnGmxJuniorVault.connect(users[0]).withdraw(amount2, users[0].address, users[0].address);

    // ETH: $2787.23 BTC: $38694.59
    await changer.changePriceToken('WBTC', 41382.59);
    await changer.changePriceToken('WETH', 3012.65);
    // await logger.logGlpPrice();
    // await logger.logTargetWeights();
    // await logger.logAavePosition();
    // await logger.logBorrowParams();
    // await logger.logProtocolParamsAndHoldings();

    await checker.checkTotalAssets(123360430554971000000n, 10n ** 16n, true);
    await checker.checkTotalSupply(134080406523058000000n, 10n ** 18n, true);
    await checker.checkCurrentBorrowed([89441n, 13760291118122500n], [0, 10n ** 12n]);
    await checker.checkVaultMktValue(169455189n, 500n);
    await checker.checkBorrowValue(78470987n, 200n);
    await checker.checkUsdcBorrwed(60007225n, 300n);
  });

  it('RebalanceProfit < usdcConversionThreshold (Excel)', async () => {
    let tx;

    const opts = await dnGmxJuniorVaultFixture();
    const logger = new Logger(opts);
    const changer = new Changer(opts);
    const checker = new Checker(opts);

    const { dnGmxJuniorVault, dnGmxSeniorVault, glpBatchingManager, users, mocks, aUSDC, gmxVault, lendingPool } = opts;
    await dnGmxJuniorVault.setMocks(mocks.swapRouterMock.address);
    await dnGmxJuniorVault.grantAllowances();

    // becauses price are not changed on uniswap
    await dnGmxJuniorVault.setThresholds(
      100, //slippageThresholdSwapBtcBps
      100, //slippageThresholdSwapEthBps
      100, //slippageThresholdGmxBps
      parseUnits('15', 6), //usdcConversionThreshold
      10n ** 15n, //wethConversionThreshold
      0, //hedgeUsdcAmountThreshold
      parseUnits('1000000', 6), //partialBtcHedgeUsdcAmountThreshold
      parseUnits('1000000', 6), //partialEthHedgeUsdcAmountThreshold
    );

    await dnGmxSeniorVault.connect(users[1]).deposit(parseUnits('150', 6), users[1].address);

    // ETH: $2787.23 BTC: $38694.59
    await changer.changePriceToken('WBTC', 38694.59);
    await changer.changePriceToken('WETH', 2787.23);
    // await logger.logGlpPrice();
    // await logger.logTargetWeights();
    // await logger.logAavePosition();
    // await logger.logBorrowParams();

    // await changer.changeWeight('WBTC', 20_000, gmxVault);
    // await changer.changeWeight('WETH', 20_000, gmxVault);

    await checker.checkTotalAssets(150000000n, 10n ** 15n, false);

    // Deposit
    console.log('--------------------Initial Deposit--------------------');
    const amount = parseEther('100');
    tx = await dnGmxJuniorVault.connect(users[0]).deposit(amount, users[0].address);

    // await logger.logAavePosition(tx);
    // await logger.logBorrowParams(tx);
    // await logger.logProtocolParamsAndHoldings();

    await checker.checkTotalAssets(98069713307823700000n, 10n ** 6n, true);
    await checker.checkTotalSupply(100000000000000000000n, 0, true);
    await checker.checkCurrentBorrowed([83259n, 12945732922165800n], [0, 7n * 10n ** 9n]);
    await checker.checkVaultMktValue(128185179n, 70n);
    await checker.checkBorrowValue(68302112n, 20n);
    await checker.checkUsdcBorrwed(52231026n, 20n);

    console.log('--------------------Time Increased--------------------');
    await increaseBlockTimestamp(4 * 24 * 60 * 60);
    // ETH: $3012.65 BTC: $41382.59
    await changer.changePriceToken('WBTC', 41382.59);
    await changer.changePriceToken('WETH', 3012.65);

    // await logger.logGlpPrice();
    // await logger.logTargetWeights();

    // await logger.logAavePosition();
    // await logger.logBorrowParams();
    // await logger.logProtocolParamsAndHoldings();

    await checker.checkTotalAssets(91102309937418000000n, 10n ** 16n, true);
    await checker.checkTotalSupply(100000000000000000000n, 0, true);
    await checker.checkVaultMktValue(125191074n, 500n);
    await checker.checkBorrowValue(73478117n, 500n);

    console.log('--------------------Rebalance--------------------');
    tx = await dnGmxJuniorVault.rebalance();
    // await logger.logGlpRewards(tx);
    // await logger.logAavePosition();
    // await logger.logBorrowParams();
    // await logger.logProtocolParamsAndHoldings();

    await checker.checkTotalAssets(91691689685985800000n, 10n ** 16n, true);
    await checker.checkTotalSupply(100000000000000000000n, 0, true);

    await checker.checkCurrentBorrowed([72125n - 2n, 11096135477592300n], [0, 10n ** 10n]);
    await checker.checkVaultMktValue(125089415n, 500n);
    await checker.checkBorrowValue(63278345n, 1000n);
    await checker.checkUsdcBorrwed(48389322n, 500n);
  });

  it('Large TVL : Swap Liquidity (Excel)', async () => {
    let tx;

    const opts = await dnGmxJuniorVaultFixture();
    const logger = new Logger(opts);
    const changer = new Changer(opts);
    const checker = new Checker(opts);

    const {
      dnGmxJuniorVault,
      dnGmxSeniorVault,
      glpBatchingManager,
      users,
      mocks,
      aUSDC,
      gmxVault,
      lendingPool,
      rewardRouter,
    } = opts;
    await dnGmxJuniorVault.setMocks(mocks.swapRouterMock.address);
    await dnGmxJuniorVault.grantAllowances();
    await rewardRouter.connect(users[0]).mintAndStakeGlpETH(0, 0, {
      value: parseEther('1000'),
    });
    await increaseBlockTimestamp(15 * 60);

    // becauses price are not changed on uniswap
    await dnGmxJuniorVault.setThresholds(
      100, //slippageThresholdSwapBtcBps
      100, //slippageThresholdSwapEthBps
      100, //slippageThresholdGmxBps
      parseUnits('1', 6), //usdcConversionThreshold
      10n ** 15n, //wethConversionThreshold
      0, //hedgeUsdcAmountThreshold
      parseUnits('1000000', 6), //partialBtcHedgeUsdcAmountThreshold
      parseUnits('1000000', 6), //partialEthHedgeUsdcAmountThreshold
    );

    await dnGmxSeniorVault.connect(users[1]).deposit(parseUnits('800000', 6), users[1].address);

    // ETH: $2787.23 BTC: $38694.59
    await changer.changePriceToken('WBTC', 38694.59);
    await changer.changePriceToken('WETH', 2787.23);
    // await logger.logGlpPrice();
    // await logger.logTargetWeights();
    // await logger.logAavePosition();
    // await logger.logBorrowParams();

    // await changer.changeWeight('WBTC', 20_000, gmxVault);
    // await changer.changeWeight('WETH', 20_000, gmxVault);

    // Deposit
    console.log('--------------------Initial Deposit--------------------');
    const amount = parseEther('1000000');
    tx = await dnGmxJuniorVault.connect(users[0]).deposit(amount, users[0].address);

    // await logger.logAavePosition(tx);
    // await logger.logBorrowParams(tx);
    // await logger.logProtocolParamsAndHoldings();

    await checker.checkTotalAssets(980684840574419000000000n, 10n ** 20n, true);
    await checker.checkTotalSupply(1000000000000000000000000n, 0, true);
    await checker.checkCurrentBorrowed([833855646n, 129654124791043000000n], [200n, 3n * 10n ** 13n]);
    await checker.checkVaultMktValue(1283800405689n, 3n * 10n ** 5n);
    await checker.checkBorrowValue(684059431175, 2n * 10n ** 5n);
    await checker.checkUsdcBorrwed(523104270898n, 3n * 10n ** 5n);

    await increaseBlockTimestamp(4 * 24 * 60 * 60);
    console.log('--------------------Time Increased--------------------');
    // ETH: $3012.65 BTC: $41382.59
    await changer.changePriceToken('WBTC', 41382.59);
    await changer.changePriceToken('WETH', 3012.65);

    // await logger.logGlpPrice();
    // await logger.logTargetWeights();

    // await logger.logAavePosition();
    // await logger.logBorrowParams();
    // await logger.logProtocolParamsAndHoldings();

    await checker.checkTotalAssets(910895125295437000000000n, 10n ** 21n, true);
    await checker.checkTotalSupply(1000000000000000000000000n, 0, true);
    await checker.checkVaultMktValue(1253921555799n, 4n * 10n ** 5n);
    await checker.checkBorrowValue(735929281065n, 2n * 10n ** 5n);

    console.log('--------------------Rebalance--------------------');
    tx = await dnGmxJuniorVault.rebalance();
    // await logger.logGlpRewards(tx);
    // await logger.logAavePosition();
    // await logger.logBorrowParams();
    // await logger.logProtocolParamsAndHoldings();

    await checker.checkTotalAssets(913670117425551000000000n, 10n ** 18n, true);
    await checker.checkTotalSupply(1000000000000000000000000n, 0, true);

    await checker.checkCurrentBorrowed([719786961n, 110736549409321000000n], [2000n, 10n ** 16n]);
    await checker.checkVaultMktValue(1252703518944n, 10n ** 9n);
    await checker.checkBorrowValue(631501454956n, 10n ** 7n);
    await checker.checkUsdcBorrwed(482912877319n, 10n ** 7n);
  });

  it('Rebalance Partial (Excel)', async () => {
    let tx;

    const opts = await dnGmxJuniorVaultFixture();
    const logger = new Logger(opts);
    const changer = new Changer(opts);
    const checker = new Checker(opts);

    const { dnGmxJuniorVault, dnGmxSeniorVault, glpBatchingManager, users, mocks, aUSDC, gmxVault, lendingPool } = opts;
    await dnGmxJuniorVault.setMocks(mocks.swapRouterMock.address);
    await dnGmxJuniorVault.grantAllowances();

    // becauses price are not changed on uniswap
    await dnGmxJuniorVault.setThresholds(
      100, //slippageThresholdSwapBtcBps
      100, //slippageThresholdSwapEthBps
      100, //slippageThresholdGmxBps
      parseUnits('1', 6), //usdcConversionThreshold
      10n ** 15n, //wethConversionThreshold
      0, //hedgeUsdcAmountThreshold
      parseUnits('5', 6), //partialBtcHedgeUsdcAmountThreshold
      parseUnits('5', 6), //partialEthHedgeUsdcAmountThreshold
    );

    await dnGmxJuniorVault.setRebalanceParams(
      86400, // rebalanceTimeThreshold
      500, // 5% in bps | rebalanceDeltaThresholdBps
      10_000,
    );

    await dnGmxSeniorVault.connect(users[1]).deposit(parseUnits('150', 6), users[1].address);

    // ETH: $2787.23 BTC: $38694.59
    await changer.changePriceToken('WBTC', 38694.59);
    await changer.changePriceToken('WETH', 2787.23);
    // await logger.logGlpPrice();
    // await logger.logTargetWeights();
    // await logger.logAavePosition();
    // await logger.logBorrowParams();

    // await changer.changeWeight('WBTC', 20_000, gmxVault);
    // await changer.changeWeight('WETH', 20_000, gmxVault);

    // Deposit
    console.log('--------------------Initial Deposit--------------------');
    const amount = parseEther('100');
    tx = await dnGmxJuniorVault.connect(users[0]).deposit(amount, users[0].address);

    // await logger.logAavePosition(tx);
    // await logger.logBorrowParams(tx);
    // await logger.logProtocolParamsAndHoldings();

    await checker.checkTotalAssets(98069713307823700000n, 10n ** 16n, true);
    await checker.checkTotalSupply(100000000000000000000n, 0, true);
    await checker.checkCurrentBorrowed([83259n, 12945732922165800n], [0, 7n * 10n ** 9n]);
    await checker.checkVaultMktValue(128185179n, 70n);
    await checker.checkBorrowValue(68302112n, 20n);
    await checker.checkUsdcBorrwed(52231026n, 20n);

    console.log('--------------------Time Increased--------------------');
    await increaseBlockTimestamp(4 * 24 * 60 * 60);

    await changer.changePriceToken('WBTC', 52000.0);
    await changer.changePriceToken('WETH', 3750.0);

    // await logger.logGlpPrice();
    // await logger.logTargetWeights();

    // await logger.logAavePosition();
    // await logger.logBorrowParams();
    // await logger.logProtocolParamsAndHoldings();

    await checker.checkTotalAssets(79977047008634600000n, 10n ** 6n, true);
    await checker.checkTotalSupply(100000000000000000000n, 0, true);
    await checker.checkVaultMktValue(128179441n, 100n);
    await checker.checkBorrowValue(91869250n, 100n);

    console.log('-------------------- Rebalance 1 --------------------');
    tx = await dnGmxJuniorVault.rebalance();
    // await logger.logGlpRewards(tx);
    // await logger.logAavePosition();
    // await logger.logBorrowParams();
    // await logger.logProtocolParamsAndHoldings();

    await checker.checkTotalAssets(79200296548117900000n, 10n ** 16n, true);
    await checker.checkTotalSupply(100000000000000000000n, 0, true);

    await checker.checkCurrentBorrowed([73673n - 1n, 11614913837155700n], [0, 10n ** 11n]);
    await checker.checkVaultMktValue(128011123n, 2000n);
    await checker.checkBorrowValue(81869062n, 400n);
    await checker.checkUsdcBorrwed(62605753n, 200n);

    console.log('-------------------- Rebalance 2 --------------------');
    tx = await dnGmxJuniorVault.rebalance();
    // await logger.logGlpRewards(tx);
    // await logger.logAavePosition();
    // await logger.logBorrowParams();
    // await logger.logProtocolParamsAndHoldings();

    await checker.checkTotalAssets(79724841888995800000n, 10n ** 16n, true);
    await checker.checkTotalSupply(100000000000000000000n, 0, true);

    await checker.checkCurrentBorrowed([64058n - 1n, 10281580503822300n], [0, 10n ** 12n]);
    await checker.checkVaultMktValue(127911124n, 2000n);
    await checker.checkBorrowValue(71868874n, 200n);
    await checker.checkUsdcBorrwed(54958550n, 100n);

    console.log('-------------------- Rebalance 3 --------------------');
    tx = await dnGmxJuniorVault.rebalance();
    // await logger.logGlpRewards(tx);
    // await logger.logAavePosition();
    // await logger.logBorrowParams();
    // await logger.logProtocolParamsAndHoldings();

    await checker.checkTotalAssets(80115731687167800000n, 10n ** 16n, true);
    await checker.checkTotalSupply(100000000000000000000n, 0, true);

    await checker.checkCurrentBorrowed([58425n + 1n, 9073720420923560n], [0, 10n ** 11n]);
    await checker.checkVaultMktValue(127836025n, 2000n);
    await checker.checkBorrowValue(64409710n, 2000n);
    await checker.checkUsdcBorrwed(49254484n, 500n);

    console.log('-------------------- Rebalance 4 --------------------');
    await expect(dnGmxJuniorVault.rebalance()).to.be.revertedWith('InvalidRebalance()');
  });

  it('Multiple Users Deposit/Withdraw (Excel)', async () => {
    let tx;

    const opts = await dnGmxJuniorVaultFixture();
    const logger = new Logger(opts);
    const changer = new Changer(opts);
    const checker = new Checker(opts);

    const {
      dnGmxJuniorVault,
      dnGmxSeniorVault,
      glpBatchingManager,
      admin,
      users,
      aUSDC,
      sGlp,
      gmxVault,
      lendingPool,
      mocks,
      rewardRouter,
    } = opts;
    await dnGmxJuniorVault.setMocks(mocks.swapRouterMock.address);
    await dnGmxJuniorVault.grantAllowances();

    await dnGmxJuniorVault.setAdminParams(
      admin.address,
      dnGmxSeniorVault.address,
      ethers.constants.MaxUint256,
      glpBatchingManager.address,
      1000,
      3000,
    );
    // becauses price are not changed on uniswap
    await dnGmxJuniorVault.setThresholds(
      100, //slippageThresholdSwapBtcBps
      100, //slippageThresholdSwapEthBps
      100, //slippageThresholdGmxBps
      parseUnits('1', 6), //usdcConversionThreshold
      10n ** 15n, //wethConversionThreshold
      0, //hedgeUsdcAmountThreshold
      parseUnits('1000000', 6), //partialBtcHedgeUsdcAmountThreshold
      parseUnits('1000000', 6), //partialEthHedgeUsdcAmountThreshold
    );

    await sGlp.connect(users[2]).approve(dnGmxJuniorVault.address, ethers.constants.MaxUint256);

    await rewardRouter.connect(users[0]).mintAndStakeGlpETH(0, 0, {
      value: parseEther('1000'),
    });
    await increaseBlockTimestamp(15 * 60);
    await rewardRouter.connect(users[2]).mintAndStakeGlpETH(0, 0, {
      value: parseEther('1000'),
    });
    await increaseBlockTimestamp(15 * 60);

    await dnGmxSeniorVault.connect(users[1]).deposit(parseUnits('800000', 6), users[1].address);

    // ETH: $2787.23 BTC: $38694.59
    await changer.changePriceToken('WBTC', 38694.59);
    await changer.changePriceToken('WETH', 2787.23);
    // await logger.logGlpPrice();
    // await logger.logTargetWeights();
    // await logger.logAavePosition();
    // await logger.logBorrowParams();

    // await changer.changeWeight('WBTC', 20_000, gmxVault);
    // await changer.changeWeight('WETH', 20_000, gmxVault);

    // Deposit
    console.log('--------------------User0 Initial Deposit--------------------');
    const amount = parseEther('1000000');
    await dnGmxJuniorVault.connect(users[0]).deposit(amount, users[0].address);

    // await logger.logAavePosition();
    // await logger.logBorrowParams();
    // await logger.logProtocolParamsAndHoldings();

    await checker.checkTotalAssets(980672731488727000000000n, 10n ** 20n, true);
    await checker.checkTotalSupply(1000000000000000000000000n, 0, true);
    await checker.checkCurrentBorrowed([835107100n, 129848710302986000000n], [200n, 2n * 10n ** 13n]);
    await checker.checkVaultMktValue(1285727139292n, 3n * 10n ** 5n);
    await checker.checkBorrowValue(685086070743n, 2n * 10n ** 5n);
    await checker.checkUsdcBorrwed(523889348215n, 2n * 10n ** 5n);

    await increaseBlockTimestamp(4 * 24 * 60 * 60);
    console.log('--------------------Time Increased--------------------');
    // ETH: $2695.46 BTC: $37311.61
    await changer.changePriceToken('WBTC', 37311.61);
    await changer.changePriceToken('WETH', 2695.46);
    // await logger.logGlpPrice();
    // await logger.logTargetWeights();

    // await logger.logAavePosition();
    // await logger.logBorrowParams();
    // await logger.logProtocolParamsAndHoldings();

    await checker.checkTotalAssets(967493107515414000000000n, 10n ** 19n, true);
    await checker.checkTotalSupply(1000000000000000000000000n, 0, true);
    await checker.checkVaultMktValue(1242650040823n, 10n ** 6n);
    await checker.checkBorrowValue(661824169212n, 10n ** 5n);

    // New Deposit
    console.log('--------------------User2 Initial Deposit--------------------');
    const amount1 = parseEther('500000');
    await dnGmxJuniorVault.connect(users[2]).deposit(amount1, users[2].address);
    // await logger.logAavePosition();
    // await logger.logBorrowParams();
    // await logger.logProtocolParamsAndHoldings();

    await checker.checkTotalAssets(1445835752330860000000000n, 10n ** 19n, true);
    await checker.checkTotalSupply(1477446592183910000000000n, 10n ** 19n, true);
    await checker.checkCurrentBorrowed([1206019939n, 186975028724550000000n], [5000n, 10n ** 19n]);
    await checker.checkVaultMktValue(1852106324999n, 10n ** 7n);
    await checker.checkBorrowValue(954006182547n, 10n ** 7n);
    await checker.checkUsdcBorrwed(729534139594n, 10n ** 7n);

    console.log('--------------------Time Increased--------------------');
    await increaseBlockTimestamp(4 * 24 * 60 * 60);
    // ETH: $3012.65 BTC: $41382.59
    await changer.changePriceToken('WBTC', 41382.59);
    await changer.changePriceToken('WETH', 3012.65);

    // await logger.logGlpPrice();
    // await logger.logTargetWeights();

    // await logger.logAavePosition();
    // await logger.logBorrowParams();
    // await logger.logProtocolParamsAndHoldings();

    await checker.checkTotalAssets(1365234280396420000000000n, 10n ** 19n, true);
    await checker.checkTotalSupply(1477446592183910000000000n, 10n ** 21n, true);
    await checker.checkVaultMktValue(1877230305748n, 10n ** 7n);
    await checker.checkBorrowValue(1062763053569n, 10n ** 7n);

    console.log('--------------------Time Based Rebalance--------------------');
    tx = await dnGmxJuniorVault.rebalance();
    // await logger.logGlpRewards(tx);
    // await logger.logAavePosition();
    // await logger.logBorrowParams();
    // await logger.logProtocolParamsAndHoldings();

    await checker.checkTotalAssets(1365217130345280000000000n, 10n ** 19n, true);
    await checker.checkTotalSupply(1477446592183910000000000n, 10n ** 19n, true);

    await checker.checkCurrentBorrowed([1079056632n, 166008853268483000000n], [3000n, 10n ** 16n]);
    await checker.checkVaultMktValue(1877225930681n, 10n ** 10n);
    await checker.checkBorrowValue(946704885911n, 10n ** 7n);
    await checker.checkUsdcBorrwed(723950795108n, 10n ** 7n);

    console.log('--------------------Time Increased--------------------');
    await increaseBlockTimestamp(4 * 24 * 60 * 60);
    // ETH: $3139.77 BTC: $43839.99
    await changer.changePriceToken('WBTC', 43839.99);
    await changer.changePriceToken('WETH', 3139.77);
    // await logger.logGlpPrice();
    // await logger.logTargetWeights();

    // await logger.logAavePosition();
    // await logger.logBorrowParams();
    // await logger.logProtocolParamsAndHoldings();

    await checker.checkTotalAssets(1330835431492550000000000n, 10n ** 19n, true);
    await checker.checkTotalSupply(1477446592183910000000000n, 10n ** 19n, true);
    await checker.checkVaultMktValue(1888932727032n, 10n ** 7n);
    await checker.checkBorrowValue(994647852689n, 10n ** 7n);

    console.log('--------------------User2 Full Withdraw--------------------');
    const amount2 = dnGmxJuniorVault.balanceOf(users[2].address);
    await dnGmxJuniorVault.connect(users[2]).redeem(amount2, users[2].address, users[2].address);

    // await logger.logAavePosition();
    // await logger.logBorrowParams();
    // await logger.logProtocolParamsAndHoldings();

    await checker.checkTotalAssets(959600972532933000000000n, 10n ** 19n, true);
    await checker.checkTotalSupply(1000000000000000000000000n, 0, true);
    await checker.checkCurrentBorrowed([729104593n, 114019850606901000000n], [1000n, 10n ** 19n]);
    await checker.checkVaultMktValue(1361249801445n, 10n ** 8n);
    await checker.checkBorrowValue(677661780277n, 10n ** 8n);
    await checker.checkUsdcBorrwed(518211949623n, 10n ** 7n);
  });
});
