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
    await logger.logGlpPrice();
    await logger.logTargetWeights();
    await logger.logAavePosition();
    await logger.logBorrowParams();

    // await changer.changeWeight('WBTC', 20_000, gmxVault);
    // await changer.changeWeight('WETH', 20_000, gmxVault);

    await checker.checkTotalAssets(150000000n, 10n ** 15n, false);

    // Deposit
    console.log('--------------------Initial Deposit--------------------');
    const amount = parseEther('100');
    tx = await dnGmxJuniorVault.connect(users[0]).deposit(amount, users[0].address);

    await logger.logAavePosition(tx);
    await logger.logBorrowParams(tx);
    await logger.logProtocolParamsAndHoldings();

    await checker.checkTotalAssets(100000000000000000000n, 0, true);
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

    await logger.logGlpPrice();
    await logger.logTargetWeights();

    await logger.logAavePosition();
    await logger.logBorrowParams();
    await logger.logProtocolParamsAndHoldings();

    await checker.checkTotalAssets(100000000000000000000n, 0, true);
    await checker.checkTotalSupply(100000000000000000000n, 0, true);
    await checker.checkVaultMktValue(125191488n, 400n);
    await checker.checkBorrowValue(73477703n, 500n);

    console.log('--------------------Rebalance--------------------');
    tx = await dnGmxJuniorVault.rebalance();
    await logger.logGlpRewards(tx);
    await logger.logAavePosition();
    await logger.logBorrowParams();
    await logger.logProtocolParamsAndHoldings();

    await checker.checkTotalAssets(95529488817145800000n, 4n * 10n ** 14n, true);
    await checker.checkTotalSupply(100000000000000000000n, 0, true);

    await checker.checkCurrentBorrowed([70568n - 2n, 11635359602787900n], [10n ** 4n, 4n * 10n ** 10n]);
    await checker.checkVaultMktValue(125103832n, 400n);
    await checker.checkBorrowValue(66350825n, 3n * 10n ** 3n);
    await checker.checkUsdcBorrwed(50738866n, 2n * 10n ** 3n);
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
    await logger.logGlpPrice();
    await logger.logTargetWeights();
    await logger.logAavePosition();
    await logger.logBorrowParams();

    // await changer.changeWeight('WBTC', 20_000, gmxVault);
    // await changer.changeWeight('WETH', 20_000, gmxVault);

    // Deposit
    console.log('--------------------Initial Deposit--------------------');
    const amount = parseEther('100');
    await dnGmxJuniorVault.connect(users[0]).deposit(amount, users[0].address);

    await logger.logAavePosition();
    await logger.logBorrowParams();
    await logger.logProtocolParamsAndHoldings();

    await checker.checkTotalAssets(100000000000000000000n, 0, true);
    await checker.checkTotalSupply(100000000000000000000n, 0, true);
    await checker.checkCurrentBorrowed([83259n, 12945732922165800n], [0, 7n * 10n ** 9n]);
    await checker.checkBorrowValue(68302112n, 20n);
    await checker.checkUsdcBorrwed(52231026n, 20n);

    await increaseBlockTimestamp(4 * 24 * 60 * 60);
    console.log('--------------------Time Increased--------------------');
    // ETH: $3012.65 BTC: $41382.59
    await changer.changePriceToken('WBTC', 41382.59);
    await changer.changePriceToken('WETH', 3012.65);
    await logger.logGlpPrice();
    await logger.logTargetWeights();

    await logger.logAavePosition();
    await logger.logBorrowParams();
    await logger.logProtocolParamsAndHoldings();

    await checker.checkTotalAssets(100000000000000000000n, 0, true);
    await checker.checkTotalSupply(100000000000000000000n, 0, true);
    await checker.checkVaultMktValue(125191488n, 400n);
    await checker.checkBorrowValue(73477703n, 500n);

    // New Deposit
    console.log('--------------------New Deposit--------------------');
    const amount1 = parseEther('50');
    await dnGmxJuniorVault.connect(users[0]).deposit(amount1, users[0].address);
    await logger.logAavePosition();
    await logger.logBorrowParams();
    await logger.logProtocolParamsAndHoldings();

    await checker.checkTotalAssets(145529486814585000000n, 4n * 10n ** 14n, true);
    await checker.checkTotalSupply(152339860358557000000n, 2n * 10n ** 14n, true);
    await checker.checkCurrentBorrowed([115214n - 1n, 17725290571103100n], [0, 4n * 10n ** 10n]);
    await checker.checkVaultMktValue(190424498n, 400n);
    await checker.checkBorrowValue(101082675n, 700n);
    await checker.checkUsdcBorrwed(77298516n, 200n);
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
    await logger.logGlpPrice();
    await logger.logTargetWeights();
    await logger.logAavePosition();
    await logger.logBorrowParams();

    // await changer.changeWeight('WBTC', 20_000, gmxVault);
    // await changer.changeWeight('WETH', 20_000, gmxVault);

    console.log('--------------------Initial Deposit--------------------');
    const amount = parseEther('100');
    await dnGmxJuniorVault.connect(users[0]).deposit(amount, users[0].address);

    await logger.logAavePosition();
    await logger.logBorrowParams();
    await logger.logProtocolParamsAndHoldings();

    await checker.checkTotalAssets(100000000000000000000n, 0, true);
    await checker.checkTotalSupply(100000000000000000000n, 0, true);
    await checker.checkCurrentBorrowed([83259n, 12945732922165800n], [0, 7n * 10n ** 9n]);
    await checker.checkBorrowValue(68302112n, 20n);
    await checker.checkUsdcBorrwed(52231026n, 20n);

    await increaseBlockTimestamp(4 * 24 * 60 * 60);
    console.log('--------------------Time Increased--------------------');
    // ETH: $3012.65 BTC: $41382.59
    await changer.changePriceToken('WBTC', 41382.59);
    await changer.changePriceToken('WETH', 3012.65);
    await logger.logGlpPrice();
    await logger.logTargetWeights();

    await logger.logAavePosition();
    await logger.logBorrowParams();
    await logger.logProtocolParamsAndHoldings();

    await checker.checkTotalAssets(100000000000000000000n, 0, true);
    await checker.checkTotalSupply(100000000000000000000n, 0, true);
    await checker.checkVaultMktValue(125191488n, 400n);
    await checker.checkBorrowValue(73477703n, 500n);

    // Partial Withdraw
    console.log('--------------------Partial Withdraw--------------------');
    const amount1 = parseEther('50');
    await dnGmxJuniorVault.connect(users[0]).withdraw(amount1, users[0].address, users[0].address);

    await logger.logAavePosition();
    await logger.logBorrowParams();
    await logger.logProtocolParamsAndHoldings();

    await checker.checkTotalAssets(45779486814584700000n, 4n * 10n ** 14n, true);
    await checker.checkTotalSupply(47660139641442700000n, 2n * 10n ** 14n, true);
    await checker.checkCurrentBorrowed([36243n - 2n, 5575878289314300n], [0, 4n * 10n ** 10n]);
    await checker.checkVaultMktValue(59561260n, 400n);
    await checker.checkBorrowValue(31796940n, 200n);
    await checker.checkUsdcBorrwed(24315307n, 200n);
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
    await logger.logGlpPrice();
    await logger.logTargetWeights();
    await logger.logAavePosition();
    await logger.logBorrowParams();

    console.log('--------------------Initial Deposit--------------------');
    const amount = parseEther('100');
    await dnGmxJuniorVault.connect(users[0]).deposit(amount, users[0].address);

    await logger.logAavePosition();
    await logger.logBorrowParams();
    await logger.logProtocolParamsAndHoldings();

    await checker.checkTotalAssets(100000000000000000000n, 0, true);
    await checker.checkTotalSupply(100000000000000000000n, 0, true);
    await checker.checkCurrentBorrowed([83259n, 12945732922165800n], [0, 7n * 10n ** 9n]);
    await checker.checkBorrowValue(68302112n, 20n);
    await checker.checkUsdcBorrwed(52231026n, 20n);

    await increaseBlockTimestamp(4 * 24 * 60 * 60);
    console.log('--------------------Time Increased--------------------');
    // ETH: $3012.65 BTC: $41382.59
    await changer.changePriceToken('WBTC', 41382.59);
    await changer.changePriceToken('WETH', 3012.65);
    await logger.logGlpPrice();
    await logger.logTargetWeights();

    await logger.logAavePosition();
    await logger.logBorrowParams();
    await logger.logProtocolParamsAndHoldings();

    await checker.checkTotalAssets(100000000000000000000n, 0, true);
    await checker.checkTotalSupply(100000000000000000000n, 0, true);
    await checker.checkVaultMktValue(125191488n, 400n);
    await checker.checkBorrowValue(73477703n, 500n);

    console.log('--------------------Full Withdraw--------------------');
    // Full Withdraw 89313565165612328971 assets
    const amount1 = dnGmxJuniorVault.balanceOf(users[0].address);
    await dnGmxJuniorVault.connect(users[0]).redeem(amount1, users[0].address, users[0].address);

    await logger.logAavePosition();
    await logger.logBorrowParams();
    await logger.logProtocolParamsAndHoldings();

    await checker.checkTotalAssets(9552917014180070000n, 3n * 10n ** 11n, true);
    await checker.checkTotalSupply(0n, 0, true);
    await checker.checkCurrentBorrowed([7563n - 1n, 1163532103248000n], [0, 6n * 10n ** 8n]);
    await checker.checkVaultMktValue(11834226n, 50n);
    await checker.checkBorrowValue(6635316n, 400n);
    await checker.checkUsdcBorrwed(5074065n, 400n);
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
      parseUnits('4', 6), //hedgeUsdcAmountThreshold
      parseUnits('1000000', 6), //partialBtcHedgeUsdcAmountThreshold
      parseUnits('1000000', 6), //partialEthHedgeUsdcAmountThreshold
    );

    await dnGmxSeniorVault.connect(users[1]).deposit(parseUnits('150', 6), users[1].address);

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
    console.log('--------------------Initial Deposit--------------------');
    const amount = parseEther('100');
    tx = await dnGmxJuniorVault.connect(users[0]).deposit(amount, users[0].address);

    await logger.logAavePosition(tx);
    await logger.logBorrowParams(tx);
    await logger.logProtocolParamsAndHoldings();

    await checker.checkTotalAssets(100000000000000000000n, 0, true);
    await checker.checkTotalSupply(100000000000000000000n, 0, true);
    await checker.checkCurrentBorrowed([83259n, 12945732922165800n], [0, 7n * 10n ** 9n]);
    await checker.checkVaultMktValue(128185179n, 70n);
    await checker.checkBorrowValue(68302112, 20n);
    await checker.checkUsdcBorrwed(52231026n, 20n);

    await increaseBlockTimestamp(4 * 24 * 60 * 60);
    console.log('--------------------Time Increased--------------------');
    // ETH: $3012.65 BTC: $41382.59
    await changer.changePriceToken('WBTC', 50000.0);
    await changer.changePriceToken('WETH', 3012.65);
    await changer.changeWeight('WBTC', 18_000);
    await changer.changeWeight('WETH', 27_000);

    await logger.logGlpPrice();
    await logger.logTargetWeights();

    await logger.logAavePosition();
    await logger.logBorrowParams();
    await logger.logProtocolParamsAndHoldings();

    await checker.checkTotalAssets(100000000000000000000n, 0, true);
    await checker.checkTotalSupply(100000000000000000000n, 0, true);
    await checker.checkVaultMktValue(125795826n, 500n);
    await checker.checkBorrowValue(80655165n, 600n);

    console.log('--------------------Rebalance--------------------');
    tx = await dnGmxJuniorVault.rebalance();
    await logger.logGlpRewards(tx);
    await logger.logAavePosition();
    await logger.logBorrowParams();
    await logger.logProtocolParamsAndHoldings();

    await checker.checkTotalAssets(90609813018477700000n, 5n * 10n ** 11n, true);
    await checker.checkTotalSupply(100000000000000000000n, 0, true);

    await checker.checkCurrentBorrowed([49224n - 1n, 12948247199528500n], [0, 7n * 10n ** 9n]);
    await checker.checkBorrowValue(63622865n, 400n);
    await checker.checkVaultMktValue(125583274n, 10n);
    await checker.checkUsdcBorrwed(47052086n, 2000n);
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
    await logger.logGlpPrice();
    await logger.logTargetWeights();
    await logger.logAavePosition();
    await logger.logBorrowParams();

    // await changer.changeWeight('WBTC', 20_000, gmxVault);
    // await changer.changeWeight('WETH', 20_000, gmxVault);

    await checker.checkTotalAssets(150000000n, 10n ** 15n, false);

    // Deposit
    console.log('--------------------Initial Deposit--------------------');
    const amount = parseEther('100');
    tx = await dnGmxJuniorVault.connect(users[0]).deposit(amount, users[0].address);

    await logger.logAavePosition(tx);
    await logger.logBorrowParams(tx);
    await logger.logProtocolParamsAndHoldings();

    await checker.checkTotalAssets(100000000000000000000n, 0, true);
    await checker.checkTotalSupply(100000000000000000000n, 0, true);
    await checker.checkCurrentBorrowed([83259n, 12945732922165800n], [0, 7n * 10n ** 9n]);
    await checker.checkVaultMktValue(128185179n, 70n);
    await checker.checkBorrowValue(68302112, 20n);
    await checker.checkUsdcBorrwed(52231026n, 20n);

    await increaseBlockTimestamp(4 * 24 * 60 * 60);
    console.log('--------------------Time Increased--------------------');
    // ETH: $3012.65 BTC: $41382.59
    await changer.changePriceToken('WBTC', 41382.59);
    await changer.changePriceToken('WETH', 2000.0);
    await changer.changeWeight('WBTC', 18_000);
    await changer.changeWeight('WETH', 35_000);

    await logger.logGlpPrice();
    await logger.logTargetWeights();

    await logger.logAavePosition();
    await logger.logBorrowParams();
    await logger.logProtocolParamsAndHoldings();

    await checker.checkTotalAssets(100000000000000000000n, 0, true);
    await checker.checkTotalSupply(100000000000000000000n, 0, true);
    await checker.checkVaultMktValue(122109738n, 400n);
    await checker.checkBorrowValue(60365153n, 500n);

    console.log('--------------------Rebalance--------------------');
    tx = await dnGmxJuniorVault.rebalance();
    await logger.logGlpRewards(tx);
    await logger.logAavePosition();
    await logger.logBorrowParams();
    await logger.logProtocolParamsAndHoldings();

    await checker.checkTotalAssets(105915802222901000000n, 4n * 10n ** 14n, true);
    await checker.checkTotalSupply(100000000000000000000n, 0, true);

    await checker.checkCurrentBorrowed([52913n, 21288614458523300n], [0n, 7n * 10n ** 10n]);
    await checker.checkBorrowValue(64476589n, 300n);
    await checker.checkUsdcBorrwed(49305626n, 200n);
    await checker.checkVaultMktValue(121357924n, 400n);
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
    await logger.logGlpPrice();
    await logger.logTargetWeights();
    await logger.logAavePosition();
    await logger.logBorrowParams();

    // await changer.changeWeight('WBTC', 20_000, gmxVault);
    // await changer.changeWeight('WETH', 20_000, gmxVault);

    await checker.checkTotalAssets(150000000n, 10n ** 15n, false);

    // Deposit
    console.log('--------------------Initial Deposit--------------------');
    const amount = parseEther('100');
    tx = await dnGmxJuniorVault.connect(users[0]).deposit(amount, users[0].address);

    await logger.logAavePosition(tx);
    await logger.logBorrowParams(tx);
    await logger.logProtocolParamsAndHoldings();

    await checker.checkTotalAssets(100000000000000000000n, 0, true);
    await checker.checkTotalSupply(100000000000000000000n, 0, true);
    await checker.checkCurrentBorrowed([83259n, 12945732922165800n], [0, 7n * 10n ** 9n]);
    await checker.checkVaultMktValue(128185179n, 70n);
    await checker.checkBorrowValue(68302112, 20n);
    await checker.checkUsdcBorrwed(52231026n, 20n);

    await increaseBlockTimestamp(4 * 24 * 60 * 60);
    console.log('--------------------Time Increased--------------------');
    // ETH: $3012.65 BTC: $41382.59
    await changer.changePriceToken('WBTC', 41382.59);
    await changer.changePriceToken('WETH', 3012.65);
    await changer.changeWeight('WBTC', 22_000);
    await changer.changeWeight('WETH', 27_000);

    await logger.logGlpPrice();
    await logger.logTargetWeights();

    await logger.logAavePosition();
    await logger.logBorrowParams();
    await logger.logProtocolParamsAndHoldings();

    await checker.checkTotalAssets(100000000000000000000n, 0, true);
    await checker.checkTotalSupply(100000000000000000000n, 0, true);
    await checker.checkVaultMktValue(125191487n, 400n);
    await checker.checkBorrowValue(73477704n, 500n);

    console.log('--------------------Rebalance--------------------');
    tx = await dnGmxJuniorVault.rebalance();
    await logger.logGlpRewards(tx);
    await logger.logAavePosition();
    await logger.logBorrowParams();
    await logger.logProtocolParamsAndHoldings();

    await checker.checkTotalAssets(95529169378733800000n, 3n * 10n ** 12n, true);
    await checker.checkTotalSupply(100000000000000000000n, 0, true);

    await checker.checkCurrentBorrowed([83287n + 1n, 12948247272272900n], [0, 7n * 10n ** 9n]);
    await checker.checkBorrowValue(73477704n, 500n);
    // USDC borrowed from SrTranche is bases optimalBorrowValue & not currentBorrowValue when swapAmount < Threshold
    await checker.checkUsdcBorrwed(48865793n, 10n);
    await checker.checkVaultMktValue(125173494n, 60n);
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
    await logger.logGlpPrice();
    await logger.logTargetWeights();
    await logger.logAavePosition();
    await logger.logBorrowParams();

    await checker.checkTotalAssets(150000000n, 10n ** 15n, false);

    // Deposit
    console.log('--------------------Initial Deposit--------------------');
    const amount = parseEther('100');
    tx = await dnGmxJuniorVault.connect(users[0]).deposit(amount, users[0].address);

    await logger.logAavePosition(tx);
    await logger.logBorrowParams(tx);
    await logger.logProtocolParamsAndHoldings();

    await checker.checkTotalAssets(100000000000000000000n, 0, true);
    await checker.checkTotalSupply(100000000000000000000n, 0, true);
    await checker.checkCurrentBorrowed([83259n, 12945732922165800n], [0, 7n * 10n ** 9n]);
    await checker.checkVaultMktValue(128185179n, 70n);
    await checker.checkBorrowValue(68302112, 20n);
    await checker.checkUsdcBorrwed(52231026n, 20n);

    await increaseBlockTimestamp(4 * 24 * 60 * 60);
    console.log('--------------------Time Increased--------------------');
    // ETH: $3012.65 BTC: $41382.59
    await changer.changePriceToken('WBTC', 42000.0);
    await changer.changePriceToken('WETH', 4000.0);
    await changer.changeWeight('WBTC', 27_000);
    await changer.changeWeight('WETH', 30_000);

    await logger.logGlpPrice();
    await logger.logTargetWeights();

    await logger.logAavePosition();
    await logger.logBorrowParams();
    await logger.logProtocolParamsAndHoldings();

    await checker.checkTotalAssets(100000000000000000000n, 0, true);
    await checker.checkTotalSupply(100000000000000000000n, 0, true);
    await checker.checkVaultMktValue(128239177n, 10n);
    await checker.checkBorrowValue(86777314n, 30n);

    console.log('--------------------Rebalance--------------------');
    tx = await dnGmxJuniorVault.rebalance();
    await logger.logGlpRewards(tx);
    await logger.logAavePosition();
    await logger.logBorrowParams();
    await logger.logProtocolParamsAndHoldings();

    await checker.checkTotalAssets(87002333148345900000n, 10n ** 13n, true);
    await checker.checkTotalSupply(100000000000000000000n, 0, true);

    await checker.checkCurrentBorrowed([83288n, 9247928649724520n], [0, 9n * 10n ** 7n]);
    await checker.checkBorrowValue(71975466n, 10n);
    // USDC borrowed from SrTranche is bases optimalBorrowValue & not currentBorrowValue when swapAmount < Threshold
    await checker.checkUsdcBorrwed(53746463n, 3000n);
    await checker.checkVaultMktValue(128039432n, 10n);
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
    await logger.logGlpPrice();
    await logger.logTargetWeights();
    await logger.logAavePosition();
    await logger.logBorrowParams();

    // await changer.changeWeight('WBTC', 20_000, gmxVault);
    // await changer.changeWeight('WETH', 20_000, gmxVault);

    // Deposit
    console.log('--------------------Jr. Tranche Initial Deposit--------------------');
    const amount = parseEther('100');
    await dnGmxJuniorVault.connect(users[0]).deposit(amount, users[0].address);

    await logger.logAavePosition();
    await logger.logBorrowParams();
    await logger.logProtocolParamsAndHoldings();

    await checker.checkTotalAssets(100000000000000000000n, 0, true);
    await checker.checkTotalSupply(100000000000000000000n, 0, true);
    await checker.checkCurrentBorrowed([83259n, 12945732922165800n], [0, 7n * 10n ** 9n]);
    await checker.checkVaultMktValue(128185179n, 70n);
    await checker.checkBorrowValue(68302112, 20n);
    await checker.checkUsdcBorrwed(52231026n, 20n);

    await increaseBlockTimestamp(4 * 24 * 60 * 60);
    console.log('--------------------Time Increased--------------------');
    // ETH: $3012.65 BTC: $41382.59
    await changer.changePriceToken('WBTC', 41382.59);
    await changer.changePriceToken('WETH', 3012.65);
    await logger.logGlpPrice();
    await logger.logTargetWeights();

    await logger.logAavePosition();
    await logger.logBorrowParams();
    await logger.logProtocolParamsAndHoldings();

    await checker.checkTotalAssets(100000000000000000000n, 0, true);
    await checker.checkTotalSupply(100000000000000000000n, 0, true);
    await checker.checkVaultMktValue(125191074n, 60n);
    await checker.checkBorrowValue(73478117n, 30n);

    // New Deposit
    console.log('--------------------Jr. Tranche New Deposit--------------------');
    const amount1 = parseEther('50');
    await dnGmxJuniorVault.connect(users[0]).deposit(amount1, users[0].address);
    await logger.logAavePosition();
    await logger.logBorrowParams();
    await logger.logProtocolParamsAndHoldings();

    // 143005774172690000000

    await checker.checkTotalAssets(143005773689692000000n, 10n ** 12n, true);
    // // 155139098395746290781
    await checker.checkTotalSupply(152340033443598000000n, 7n * 10n ** 11n, true);
    // // Borrow ETH : 13760737544110385
    // // Deviation : 350722378
    await checker.checkCurrentBorrowed([89444n + 1n, 13760737193388000n], [0, 9n * 10n ** 10n]);
    await checker.checkBorrowValue(78473985n, 300n);
    await checker.checkUsdcBorrwed(60009517n, 3000n);

    console.log('--------------------Time Increased--------------------');
    await increaseBlockTimestamp(60);
    // ETH: $3012.65 BTC: $41382.59
    await changer.changePriceToken('WBTC', 41382.59);
    await changer.changePriceToken('WETH', 3012.65);
    await logger.logGlpPrice();
    await logger.logTargetWeights();

    await logger.logAavePosition();
    await logger.logBorrowParams();
    await logger.logProtocolParamsAndHoldings();

    await checker.checkTotalAssets(143005773689692000000n, 10n ** 12n, true);
    await checker.checkTotalSupply(152340033443598000000n, 7n * 10n ** 11n, true);
    await checker.checkBorrowValue(78474001n, 300n);

    console.log('--------------------Sr. Tranche New Deposit--------------------');
    await dnGmxSeniorVault.connect(users[1]).deposit(parseUnits('40', 6), users[1].address);

    // ETH: $2787.23 BTC: $38694.59
    await changer.changePriceToken('WBTC', 41382.59);
    await changer.changePriceToken('WETH', 3012.65);
    await logger.logGlpPrice();
    await logger.logTargetWeights();
    await logger.logAavePosition();
    await logger.logBorrowParams();

    console.log('--------------------Rebalance--------------------');
    tx = await dnGmxJuniorVault.rebalance();
    await logger.logGlpRewards(tx);
    await logger.logAavePosition();
    await logger.logBorrowParams();
    await logger.logProtocolParamsAndHoldings();

    // 143242340342122735764
    // 143242339629106845995
    await checker.checkTotalAssets(143242341449013000000n, 2n * 10n ** 12n, true);
    // 152340032764488350713
    // 152340033182569347922
    await checker.checkTotalSupply(152340033443598000000n, 7n * 10n ** 11n, true);

    await checker.checkCurrentBorrowed([113216n, 17417905796814500n], [0, 8n * 10n ** 9n]);
    await checker.checkBorrowValue(99329739n, 100n);
    await checker.checkUsdcBorrwed(75958035n, 80n);
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
    await logger.logGlpPrice();
    await logger.logTargetWeights();
    await logger.logAavePosition();
    await logger.logBorrowParams();

    // await changer.changeWeight('WBTC', 20_000, gmxVault);
    // await changer.changeWeight('WETH', 20_000, gmxVault);

    // Deposit
    console.log('--------------------Jr. Tranche Initial Deposit--------------------');
    const amount = parseEther('100');
    await dnGmxJuniorVault.connect(users[0]).deposit(amount, users[0].address);

    await logger.logAavePosition();
    await logger.logBorrowParams();
    await logger.logProtocolParamsAndHoldings();

    await checker.checkTotalAssets(100000000000000000000n, 0, true);
    await checker.checkTotalSupply(100000000000000000000n, 0, true);
    await checker.checkCurrentBorrowed([83259n, 12945732922165800n], [0, 7n * 10n ** 9n]);
    await checker.checkVaultMktValue(128185179n, 70n);
    await checker.checkBorrowValue(68302112, 20n);
    await checker.checkUsdcBorrwed(52231026n, 20n);

    await increaseBlockTimestamp(4 * 24 * 60 * 60);
    console.log('--------------------Time Increased--------------------');
    // ETH: $3012.65 BTC: $41382.59
    await changer.changePriceToken('WBTC', 41382.59);
    await changer.changePriceToken('WETH', 3012.65);
    await logger.logGlpPrice();
    await logger.logTargetWeights();

    await logger.logAavePosition();
    await logger.logBorrowParams();
    await logger.logProtocolParamsAndHoldings();

    await checker.checkTotalAssets(100000000000000000000n, 0, true);
    await checker.checkTotalSupply(100000000000000000000n, 0, true);
    await checker.checkVaultMktValue(125191074n, 60n);
    await checker.checkBorrowValue(73478117n, 30n);

    // New Deposit
    console.log('--------------------Jr. Tranche New Deposit--------------------');
    const amount1 = parseEther('50');
    await dnGmxJuniorVault.connect(users[0]).deposit(amount1, users[0].address);
    await logger.logAavePosition();
    await logger.logBorrowParams();
    await logger.logProtocolParamsAndHoldings();

    // 143005774172690000000
    // 143005774287051869238
    await checker.checkTotalAssets(143005773689692000000n, 6n * 10n ** 11n, true);
    await checker.checkTotalSupply(152340033443598000000n, 7n * 10n ** 11n, true);
    // // Borrow ETH : 13760737544110385
    // // Deviation : 350722378
    await checker.checkCurrentBorrowed([89444n + 1n, 13760737193388000n], [0, 9n * 10n ** 10n]);
    await checker.checkBorrowValue(78473985n, 300n);
    await checker.checkUsdcBorrwed(60009517n, 3000n);

    console.log('--------------------Time Increased--------------------');
    await increaseBlockTimestamp(60);
    // ETH: $3012.65 BTC: $41382.59
    await changer.changePriceToken('WBTC', 41382.59);
    await changer.changePriceToken('WETH', 3012.65);
    await logger.logGlpPrice();
    await logger.logTargetWeights();

    await logger.logAavePosition();
    await logger.logBorrowParams();
    await logger.logProtocolParamsAndHoldings();

    await checker.checkTotalAssets(143005773689692000000n, 10n ** 12n, true);
    await checker.checkTotalSupply(152340033443598000000n, 7n * 10n ** 11n, true);
    await checker.checkBorrowValue(78474001n, 300n);

    console.log('--------------------Jr. Tranche Partial Withdraw--------------------');
    const amount2 = parseEther('15');
    await dnGmxJuniorVault.connect(users[0]).withdraw(amount2, users[0].address, users[0].address);

    // ETH: $2787.23 BTC: $38694.59
    await changer.changePriceToken('WBTC', 41382.59);
    await changer.changePriceToken('WETH', 3012.65);
    await logger.logGlpPrice();
    await logger.logTargetWeights();
    await logger.logAavePosition();
    await logger.logBorrowParams();
    await logger.logProtocolParamsAndHoldings();

    // 119908187001729000000n
    // 119908186295630789349n
    await checker.checkTotalAssets(128194457906593000000n, 4n * 10n ** 12n, true);
    await checker.checkTotalSupply(136355292540518000000n, 6n * 10n ** 15n, true);

    await checker.checkCurrentBorrowed([89445n, 13760742442810100n], [0, 9n * 10n ** 10n]);
    await checker.checkBorrowValue(78474001n, 300n);
    await checker.checkUsdcBorrwed(60009530n, 3000n);
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
    await logger.logGlpPrice();
    await logger.logTargetWeights();
    await logger.logAavePosition();
    await logger.logBorrowParams();

    // await changer.changeWeight('WBTC', 20_000, gmxVault);
    // await changer.changeWeight('WETH', 20_000, gmxVault);

    await checker.checkTotalAssets(150000000n, 10n ** 15n, false);

    // Deposit
    console.log('--------------------Initial Deposit--------------------');
    const amount = parseEther('100');
    tx = await dnGmxJuniorVault.connect(users[0]).deposit(amount, users[0].address);

    await logger.logAavePosition(tx);
    await logger.logBorrowParams(tx);
    await logger.logProtocolParamsAndHoldings();

    await checker.checkTotalAssets(100000000000000000000n, 0, true);
    await checker.checkTotalSupply(100000000000000000000n, 0, true);
    await checker.checkCurrentBorrowed([83259n, 12945732922165800n], [0, 7n * 10n ** 9n]);
    await checker.checkVaultMktValue(128185179n, 70n);
    await checker.checkBorrowValue(68302112, 20n);
    await checker.checkUsdcBorrwed(52231026n, 20n);

    console.log('--------------------Time Increased--------------------');
    await increaseBlockTimestamp(4 * 24 * 60 * 60);
    // ETH: $3012.65 BTC: $41382.59
    await changer.changePriceToken('WBTC', 41382.59);
    await changer.changePriceToken('WETH', 3012.65);

    await logger.logGlpPrice();
    await logger.logTargetWeights();

    await logger.logAavePosition();
    await logger.logBorrowParams();
    await logger.logProtocolParamsAndHoldings();

    await checker.checkTotalAssets(100000000000000000000n, 0, true);
    await checker.checkTotalSupply(100000000000000000000n, 0, true);
    await checker.checkVaultMktValue(125191074n, 60n);
    await checker.checkBorrowValue(73478117n, 30n);

    console.log('--------------------Rebalance--------------------');
    tx = await dnGmxJuniorVault.rebalance();
    await logger.logGlpRewards(tx);
    await logger.logAavePosition();
    await logger.logBorrowParams();
    await logger.logProtocolParamsAndHoldings();

    await checker.checkTotalAssets(100000000000000000000n, 0, true);
    await checker.checkTotalSupply(100000000000000000000n, 0, true);

    await checker.checkCurrentBorrowed([79169n, 12179861936630300n], [0, 6n * 10n ** 9n]);
    await checker.checkVaultMktValue(125150878n, 60n);
    await checker.checkBorrowValue(69458552n, 10n);
    await checker.checkUsdcBorrwed(53115363n, 10n);
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
    await logger.logGlpPrice();
    await logger.logTargetWeights();
    await logger.logAavePosition();
    await logger.logBorrowParams();

    // await changer.changeWeight('WBTC', 20_000, gmxVault);
    // await changer.changeWeight('WETH', 20_000, gmxVault);

    // Deposit
    console.log('--------------------Initial Deposit--------------------');
    const amount = parseEther('1000000');
    tx = await dnGmxJuniorVault.connect(users[0]).deposit(amount, users[0].address);

    await logger.logAavePosition(tx);
    await logger.logBorrowParams(tx);
    await logger.logProtocolParamsAndHoldings();

    await checker.checkTotalAssets(1000000000000000000000000n, 0, true);
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

    await logger.logGlpPrice();
    await logger.logTargetWeights();

    await logger.logAavePosition();
    await logger.logBorrowParams();
    await logger.logProtocolParamsAndHoldings();

    await checker.checkTotalAssets(1000000000000000000000000n, 0, true);
    await checker.checkTotalSupply(1000000000000000000000000n, 0, true);
    await checker.checkVaultMktValue(1253921555799n, 4n * 10n ** 5n);
    await checker.checkBorrowValue(735929281065n, 2n * 10n ** 5n);

    console.log('--------------------Rebalance--------------------');
    tx = await dnGmxJuniorVault.rebalance();
    await logger.logGlpRewards(tx);
    await logger.logAavePosition();
    await logger.logBorrowParams();
    await logger.logProtocolParamsAndHoldings();

    // 954897328373956793080359
    // 954897357878442000000000
    // 954897308874421927176920
    // 954897220817685399759639
    // 954897257243905606044712
    await checker.checkTotalAssets(954897367667895000000000n, 10n ** 18n, true);
    await checker.checkTotalSupply(1000000000000000000000000n, 0, true);

    await checker.checkCurrentBorrowed([757509992n, 116540097481776000000n], [3n * 10n ** 5n, 4n * 10n ** 16n]);
    await checker.checkVaultMktValue(1253426285911n, 10n ** 6n);
    await checker.checkBorrowValue(664597565240n, 3n * 10n ** 8n);
    await checker.checkUsdcBorrwed(508221667536n, 2n * 10n ** 8n);
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
      0,
    );

    await dnGmxSeniorVault.connect(users[1]).deposit(parseUnits('150', 6), users[1].address);

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
    console.log('--------------------Initial Deposit--------------------');
    const amount = parseEther('100');
    tx = await dnGmxJuniorVault.connect(users[0]).deposit(amount, users[0].address);

    await logger.logAavePosition(tx);
    await logger.logBorrowParams(tx);
    await logger.logProtocolParamsAndHoldings();

    await checker.checkTotalAssets(100000000000000000000n, 0, true);
    await checker.checkTotalSupply(100000000000000000000n, 0, true);
    await checker.checkCurrentBorrowed([83259n, 12945732922165800n], [0, 6n * 10n ** 10n]);
    await checker.checkVaultMktValue(128185179n, 70n);
    await checker.checkBorrowValue(68302112n, 20n);
    await checker.checkUsdcBorrwed(52231026n, 20n);

    console.log('--------------------Time Increased--------------------');
    await increaseBlockTimestamp(4 * 24 * 60 * 60);

    await changer.changePriceToken('WBTC', 52000.0);
    await changer.changePriceToken('WETH', 3750.0);

    await logger.logGlpPrice();
    await logger.logTargetWeights();

    await logger.logAavePosition();
    await logger.logBorrowParams();
    await logger.logProtocolParamsAndHoldings();

    await checker.checkTotalAssets(100000000000000000000n, 0, true);
    await checker.checkTotalSupply(100000000000000000000n, 0, true);
    await checker.checkVaultMktValue(128179441n, 70n);
    await checker.checkBorrowValue(91869250n, 30n);

    console.log('-------------------- Rebalance 1 --------------------');
    tx = await dnGmxJuniorVault.rebalance();
    await logger.logGlpRewards(tx);
    await logger.logAavePosition();
    await logger.logBorrowParams();
    await logger.logProtocolParamsAndHoldings();

    await checker.checkTotalAssets(84090912132551700000n, 4n * 10n ** 12n, true);
    await checker.checkTotalSupply(100000000000000000000n, 0, true);

    await checker.checkCurrentBorrowed([73673n - 1n, 11614913837155700n], [0, 6n * 10n ** 10n]);
    await checker.checkVaultMktValue(128012061n, 70n);
    await checker.checkBorrowValue(81869062n, 400n);
    await checker.checkUsdcBorrwed(62605753n, 200n);

    console.log('-------------------- Rebalance 2 --------------------');
    tx = await dnGmxJuniorVault.rebalance();
    await logger.logGlpRewards(tx);
    await logger.logAavePosition();
    await logger.logBorrowParams();
    await logger.logProtocolParamsAndHoldings();

    await checker.checkTotalAssets(84090912132551700000n, 4n * 10n ** 12n, true);
    await checker.checkTotalSupply(100000000000000000000n, 0, true);

    await checker.checkCurrentBorrowed([64058n - 1n, 10281580503822300n], [0, 2n * 10n ** 11n]);
    await checker.checkVaultMktValue(127912062n, 70n);
    await checker.checkBorrowValue(71868874n, 200n);
    await checker.checkUsdcBorrwed(54958550n, 100n);

    console.log('-------------------- Rebalance 3 --------------------');
    tx = await dnGmxJuniorVault.rebalance();
    await logger.logGlpRewards(tx);
    await logger.logAavePosition();
    await logger.logBorrowParams();
    await logger.logProtocolParamsAndHoldings();

    await checker.checkTotalAssets(84090912132551700000n, 4n * 10n ** 12n, true);
    await checker.checkTotalSupply(100000000000000000000n, 0, true);

    await checker.checkCurrentBorrowed([61624n + 1n, 9570635888307790n], [0, 5n * 10n ** 9n]);
    await checker.checkVaultMktValue(127872228n, 60n);
    await checker.checkBorrowValue(67937058n, 500n);
    await checker.checkUsdcBorrwed(51951867n, 40n);

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
    await logger.logGlpPrice();
    await logger.logTargetWeights();
    await logger.logAavePosition();
    await logger.logBorrowParams();

    // await changer.changeWeight('WBTC', 20_000, gmxVault);
    // await changer.changeWeight('WETH', 20_000, gmxVault);

    // Deposit
    console.log('--------------------User0 Initial Deposit--------------------');
    const amount = parseEther('1000000');
    await dnGmxJuniorVault.connect(users[0]).deposit(amount, users[0].address);

    await logger.logAavePosition();
    await logger.logBorrowParams();
    await logger.logProtocolParamsAndHoldings();

    await checker.checkTotalAssets(1000000000000000000000000n, 0, true);
    await checker.checkTotalSupply(1000000000000000000000000n, 0, true);
    await checker.checkCurrentBorrowed([835107100n, 129848710302986000000n], [100n, 10n ** 14n]);
    await checker.checkBorrowValue(685086070743n, 10n ** 5n);
    await checker.checkUsdcBorrwed(523889348215n, 10n ** 5n);
    await checker.checkVaultMktValue(1285727139292n, 2n * 10n ** 5n);

    await increaseBlockTimestamp(4 * 24 * 60 * 60);
    console.log('--------------------Time Increased--------------------');
    // ETH: $2695.46 BTC: $37311.61
    await changer.changePriceToken('WBTC', 37311.61);
    await changer.changePriceToken('WETH', 2695.46);
    await logger.logGlpPrice();
    await logger.logTargetWeights();

    await logger.logAavePosition();
    await logger.logBorrowParams();
    await logger.logProtocolParamsAndHoldings();

    await checker.checkTotalAssets(1000000000000000000000000n, 0, true);
    await checker.checkTotalSupply(1000000000000000000000000n, 0, true);
    await checker.checkVaultMktValue(1242650040823n, 10n ** 6n);
    await checker.checkBorrowValue(661824169212, 10n ** 5n);

    // New Deposit
    console.log('--------------------User2 Initial Deposit--------------------');
    const amount1 = parseEther('500000');
    await dnGmxJuniorVault.connect(users[2]).deposit(amount1, users[2].address);
    await logger.logAavePosition();
    await logger.logBorrowParams();
    await logger.logProtocolParamsAndHoldings();

    await checker.checkTotalAssets(1513671752071920000000000n, 10n ** 21n, true);
    await checker.checkTotalSupply(1493396756816530000000000n, 10n ** 21n, true);
    await checker.checkCurrentBorrowed([1243413902n, 192772393330892000000n], [10n ** 6n, 10n ** 17n]);
    await checker.checkBorrowValue(983586184298n, 10n ** 9n);
    await checker.checkUsdcBorrwed(752154140933n, 10n ** 9n);

    console.log('--------------------Time Increased--------------------');
    await increaseBlockTimestamp(4 * 24 * 60 * 60);
    // ETH: $3012.65 BTC: $41382.59
    await changer.changePriceToken('WBTC', 41382.59);
    await changer.changePriceToken('WETH', 3012.65);

    await logger.logGlpPrice();
    await logger.logTargetWeights();

    await logger.logAavePosition();
    await logger.logBorrowParams();
    await logger.logProtocolParamsAndHoldings();

    await checker.checkTotalAssets(1513671752071920000000000n, 10n ** 21n, true);
    await checker.checkTotalSupply(1493396756816530000000000n, 10n ** 21n, true);
    await checker.checkVaultMktValue(1874737291948n, 10n ** 10n);
    await checker.checkBorrowValue(1095717180447n, 10n ** 9n);

    console.log('--------------------Time Based Rebalance--------------------');
    tx = await dnGmxJuniorVault.rebalance();
    await logger.logGlpRewards(tx);
    await logger.logAavePosition();
    await logger.logBorrowParams();
    await logger.logProtocolParamsAndHoldings();

    await checker.checkTotalAssets(1425938772274370000000000n, 10n ** 21n, true);
    await checker.checkTotalSupply(1493396756816530000000000n, 10n ** 21n, true);

    await checker.checkCurrentBorrowed([1132552690n, 174239022964364000000n], [10n ** 6n, 10n ** 18n]);
    await checker.checkVaultMktValue(1873379734845n, 10n ** 10n);
    await checker.checkBorrowValue(993619014198n, 10n ** 9n);
    await checker.checkUsdcBorrwed(759841880300n, 10n ** 9n);

    console.log('--------------------Time Increased--------------------');
    await increaseBlockTimestamp(4 * 24 * 60 * 60);
    // ETH: $3139.77 BTC: $43839.99
    await changer.changePriceToken('WBTC', 43839.99);
    await changer.changePriceToken('WETH', 3139.77);
    await logger.logGlpPrice();
    await logger.logTargetWeights();

    await logger.logAavePosition();
    await logger.logBorrowParams();
    await logger.logProtocolParamsAndHoldings();

    await checker.checkTotalAssets(1425938772274370000000000n, 10n ** 21n, true);
    await checker.checkTotalSupply(1493396756816530000000000n, 10n ** 21n, true);
    await checker.checkVaultMktValue(1884142569639n, 10n ** 10n);
    await checker.checkBorrowValue(1043961933613n, 10n ** 9n);

    console.log('--------------------User2 Full Withdraw--------------------');
    const amount2 = dnGmxJuniorVault.balanceOf(users[2].address);
    await dnGmxJuniorVault.connect(users[2]).redeem(amount2, users[2].address, users[2].address);

    await logger.logAavePosition();
    await logger.logBorrowParams();
    await logger.logProtocolParamsAndHoldings();

    await checker.checkTotalAssets(972636144707262000000000n, 10n ** 21n, true);
    await checker.checkTotalSupply(1000000000000000000000000n, 0, true);
    await checker.checkCurrentBorrowed([754845871n, 118045359021492000000n], [10n ** 6n, 10n ** 17n]);
    await checker.checkVaultMktValue(1320159461033n, 10n ** 9n);
    await checker.checkBorrowValue(701586852833n, 10n ** 9n);
    await checker.checkUsdcBorrwed(536507593342n, 10n ** 9n);
  });
});
