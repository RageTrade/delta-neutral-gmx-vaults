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
    // console.log('--------------------Initial Deposit--------------------');
    const amount = parseEther('100');
    tx = await dnGmxJuniorVault.connect(users[0]).deposit(amount, users[0].address);

    // await logger.logAavePosition(tx);
    // await logger.logBorrowParams(tx);
    // await logger.logProtocolParamsAndHoldings();

    await checker.checkTotalAssets(99473511447474500000n, 10n ** 16n, true);
    await checker.checkTotalSupply(100000000000000000000n, 0, true);
    await checker.checkCurrentBorrowed([83259n, 12945732922165800n], [0, 7n * 10n ** 9n]);
    await checker.checkVaultMktValue(128185179n, 70n);
    await checker.checkBorrowValue(68302112n, 20n);
    await checker.checkUsdcBorrwed(52231026n, 20n);

    // console.log('--------------------Time Increased--------------------');
    await increaseBlockTimestamp(4 * 24 * 60 * 60);
    // ETH: $3012.65 BTC: $41382.59
    await changer.changePriceToken('WBTC', 41382.59);
    await changer.changePriceToken('WETH', 3012.65);

    // await logger.logGlpPrice();
    // await logger.logTargetWeights();

    // await logger.logAavePosition();
    // await logger.logBorrowParams();
    // await logger.logProtocolParamsAndHoldings();

    await checker.checkTotalAssets(95822420680398200000n, 10n ** 17n, true);
    await checker.checkTotalSupply(100000000000000000000n, 0, true);
    await checker.checkVaultMktValue(125191488n, 400n);
    await checker.checkBorrowValue(73477703n, 500n);

    // console.log('--------------------Rebalance--------------------');
    tx = await dnGmxJuniorVault.rebalance();
    // await logger.logGlpRewards(tx);
    // await logger.logAavePosition();
    // await logger.logBorrowParams();
    // await logger.logProtocolParamsAndHoldings();

    await checker.checkTotalAssets(95466931655551500000n, 10n ** 15n, true);
    await checker.checkTotalSupply(100000000000000000000n, 0, true);

    await checker.checkCurrentBorrowed([75621n - 1n, 11633934834377700n], [0, 10n ** 11n]);
    await checker.checkVaultMktValue(125103757n, 500n);
    await checker.checkBorrowValue(66342699n, 3n * 10n ** 3n);
    await checker.checkUsdcBorrwed(50732652n, 2n * 10n ** 3n);
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
    // console.log('--------------------Initial Deposit--------------------');
    const amount = parseEther('100');
    tx = await dnGmxJuniorVault.connect(users[0]).deposit(amount, users[0].address);

    // await logger.logAavePosition(tx);
    // await logger.logBorrowParams(tx);
    // await logger.logProtocolParamsAndHoldings();

    await checker.checkTotalAssets(99473511447474500000n, 10n ** 16n, true);
    await checker.checkTotalSupply(100000000000000000000n, 0, true);
    await checker.checkCurrentBorrowed([83259n, 12945732922165800n], [0, 7n * 10n ** 9n]);
    await checker.checkVaultMktValue(128185179n, 70n);
    await checker.checkBorrowValue(68302112n, 20n);
    await checker.checkUsdcBorrwed(52231026n, 20n);

    // console.log('--------------------Time Increased--------------------');
    await increaseBlockTimestamp(4 * 24 * 60 * 60);
    // ETH: $3012.65 BTC: $41382.59
    await changer.changePriceToken('WBTC', 41382.59);
    await changer.changePriceToken('WETH', 3012.65);

    // await logger.logGlpPrice();
    // await logger.logTargetWeights();

    // await logger.logAavePosition();
    // await logger.logBorrowParams();
    // await logger.logProtocolParamsAndHoldings();

    await checker.checkTotalAssets(95822420680398200000n, 10n ** 17n, true);
    await checker.checkTotalSupply(100000000000000000000n, 0, true);
    await checker.checkVaultMktValue(125191488n, 400n);
    await checker.checkBorrowValue(73477703n, 500n);

    // New Deposit
    // console.log('--------------------New Deposit--------------------');
    const amount1 = parseEther('50');
    await dnGmxJuniorVault.connect(users[0]).deposit(amount1, users[0].address);
    // await logger.logAavePosition();
    // await logger.logBorrowParams();
    // await logger.logProtocolParamsAndHoldings();

    await checker.checkTotalAssets(145321320401234000000n, 10n ** 16n, true);
    await checker.checkTotalSupply(152339860358557000000n, 10n ** 16n, true);
    await checker.checkCurrentBorrowed([115203n, 17723865715848500n], [0, 10n ** 11n]);
    await checker.checkVaultMktValue(190424583n, 400n);
    await checker.checkBorrowValue(101073722n, 100n);
    await checker.checkUsdcBorrwed(77291669n, 300n);
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

    // console.log('--------------------Initial Deposit--------------------');
    const amount = parseEther('100');
    tx = await dnGmxJuniorVault.connect(users[0]).deposit(amount, users[0].address);

    // await logger.logAavePosition(tx);
    // await logger.logBorrowParams(tx);
    // await logger.logProtocolParamsAndHoldings();

    await checker.checkTotalAssets(99473511447474500000n, 10n ** 16n, true);
    await checker.checkTotalSupply(100000000000000000000n, 0, true);
    await checker.checkCurrentBorrowed([83259n, 12945732922165800n], [0, 7n * 10n ** 9n]);
    await checker.checkVaultMktValue(128185179n, 70n);
    await checker.checkBorrowValue(68302112n, 20n);
    await checker.checkUsdcBorrwed(52231026n, 20n);

    // console.log('--------------------Time Increased--------------------');
    await increaseBlockTimestamp(4 * 24 * 60 * 60);
    // ETH: $3012.65 BTC: $41382.59
    await changer.changePriceToken('WBTC', 41382.59);
    await changer.changePriceToken('WETH', 3012.65);

    // await logger.logGlpPrice();
    // await logger.logTargetWeights();

    // await logger.logAavePosition();
    // await logger.logBorrowParams();
    // await logger.logProtocolParamsAndHoldings();

    await checker.checkTotalAssets(95822420680398200000n, 10n ** 17n, true);
    await checker.checkTotalSupply(100000000000000000000n, 0, true);
    await checker.checkVaultMktValue(125191488n, 400n);
    await checker.checkBorrowValue(73477703n, 500n);

    // Partial Withdraw
    // console.log('--------------------Partial Withdraw--------------------');
    const amount1 = parseEther('50');
    await dnGmxJuniorVault.connect(users[0]).withdraw(amount1, users[0].address, users[0].address);

    // await logger.logAavePosition();
    // await logger.logBorrowParams();
    // await logger.logProtocolParamsAndHoldings();

    await checker.checkTotalAssets(45219597990149900000n, 10n ** 16n, true);
    await checker.checkTotalSupply(47491336342151600000n, 10n ** 18n, true);
    await checker.checkCurrentBorrowed([36034n, 5544003779218150n], [0, 10n ** 11n]);
    await checker.checkVaultMktValue(59231820n, 400n);
    await checker.checkBorrowValue(31615168n, 100n);
    await checker.checkUsdcBorrwed(24176304n, 300n);
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
    // await logger.logGlpPrice();
    // await logger.logTargetWeights();
    // await logger.logAavePosition();
    // await logger.logBorrowParams();

    // console.log('--------------------Initial Deposit--------------------');
    const amount = parseEther('100');
    tx = await dnGmxJuniorVault.connect(users[0]).deposit(amount, users[0].address);

    // await logger.logAavePosition(tx);
    // await logger.logBorrowParams(tx);
    // await logger.logProtocolParamsAndHoldings();

    await checker.checkTotalAssets(99473511447474500000n, 10n ** 16n, true);
    await checker.checkTotalSupply(100000000000000000000n, 0, true);
    await checker.checkCurrentBorrowed([83259n, 12945732922165800n], [0, 7n * 10n ** 9n]);
    await checker.checkVaultMktValue(128185179n, 70n);
    await checker.checkBorrowValue(68302112n, 20n);
    await checker.checkUsdcBorrwed(52231026n, 20n);

    // console.log('--------------------Time Increased--------------------');
    await increaseBlockTimestamp(4 * 24 * 60 * 60);
    // ETH: $3012.65 BTC: $41382.59
    await changer.changePriceToken('WBTC', 41382.59);
    await changer.changePriceToken('WETH', 3012.65);

    // await logger.logGlpPrice();
    // await logger.logTargetWeights();

    // await logger.logAavePosition();
    // await logger.logBorrowParams();
    // await logger.logProtocolParamsAndHoldings();

    await checker.checkTotalAssets(95822420680398200000n, 10n ** 17n, true);
    await checker.checkTotalSupply(100000000000000000000n, 0, true);
    await checker.checkVaultMktValue(125191488n, 400n);
    await checker.checkBorrowValue(73477703n, 500n);

    // console.log('--------------------Full Withdraw--------------------');
    // Full Withdraw 89313565165612328971 assets
    const amount1 = dnGmxJuniorVault.balanceOf(users[0].address);
    await dnGmxJuniorVault.connect(users[0]).redeem(amount1, users[0].address, users[0].address);

    // await logger.logAavePosition();
    // await logger.logBorrowParams();
    // await logger.logProtocolParamsAndHoldings();

    await checker.checkTotalAssets(9075036475134090000n, 10n ** 16n, true);
    await checker.checkTotalSupply(0n, 0, true);
    await checker.checkCurrentBorrowed([7562n, 1163376803474810n], [0, 10n ** 11n]);
    await checker.checkVaultMktValue(11847931n, 10n);
    await checker.checkBorrowValue(6634431n, 100n);
    await checker.checkUsdcBorrwed(5073388n, 100n);
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
    // await logger.logGlpPrice();
    // await logger.logTargetWeights();
    // await logger.logAavePosition();
    // await logger.logBorrowParams();

    // await changer.changeWeight('WBTC', 20_000, gmxVault);
    // await changer.changeWeight('WETH', 20_000, gmxVault);

    await checker.checkTotalAssets(150000000n, 10n ** 15n, false);

    // Deposit
    // console.log('--------------------Initial Deposit--------------------');
    const amount = parseEther('100');
    tx = await dnGmxJuniorVault.connect(users[0]).deposit(amount, users[0].address);

    // await logger.logAavePosition(tx);
    // await logger.logBorrowParams(tx);
    // await logger.logProtocolParamsAndHoldings();

    await checker.checkTotalAssets(99473511447474500000n, 10n ** 16n, true);
    await checker.checkTotalSupply(100000000000000000000n, 0, true);
    await checker.checkCurrentBorrowed([83259n, 12945732922165800n], [0, 7n * 10n ** 9n]);
    await checker.checkVaultMktValue(128185179n, 70n);
    await checker.checkBorrowValue(68302112n, 20n);
    await checker.checkUsdcBorrwed(52231026n, 20n);

    await increaseBlockTimestamp(4 * 24 * 60 * 60);
    // console.log('--------------------Time Increased--------------------');
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

    await checker.checkTotalAssets(91241815984886300000n, 10n ** 17n, true);
    await checker.checkTotalSupply(100000000000000000000n, 0, true);
    await checker.checkVaultMktValue(125795826n, 500n);
    await checker.checkBorrowValue(80655165n, 600n);

    // console.log('--------------------Rebalance--------------------');
    tx = await dnGmxJuniorVault.rebalance();
    // await logger.logGlpRewards(tx);
    // await logger.logAavePosition();
    // await logger.logBorrowParams();
    // await logger.logProtocolParamsAndHoldings();

    await checker.checkTotalAssets(90467304222414400000n, 10n ** 16n, true);
    await checker.checkTotalSupply(100000000000000000000n, 0, true);

    await checker.checkCurrentBorrowed([49208n, 12948247199528500n], [0, 10n ** 10n]);
    await checker.checkBorrowValue(63615252n, 300n);
    await checker.checkVaultMktValue(125583200n, 100n);
    await checker.checkUsdcBorrwed(47037532n, 2000n);
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
    // console.log('--------------------Initial Deposit--------------------');
    const amount = parseEther('100');
    tx = await dnGmxJuniorVault.connect(users[0]).deposit(amount, users[0].address);

    // await logger.logAavePosition(tx);
    // await logger.logBorrowParams(tx);
    // await logger.logProtocolParamsAndHoldings();

    await checker.checkTotalAssets(99473511447474500000n, 10n ** 16n, true);
    await checker.checkTotalSupply(100000000000000000000n, 0, true);
    await checker.checkCurrentBorrowed([83259n, 12945732922165800n], [0, 7n * 10n ** 9n]);
    await checker.checkVaultMktValue(128185179n, 70n);
    await checker.checkBorrowValue(68302112n, 20n);
    await checker.checkUsdcBorrwed(52231026n, 20n);

    await increaseBlockTimestamp(4 * 24 * 60 * 60);
    // console.log('--------------------Time Increased--------------------');
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

    await checker.checkTotalAssets(105928491202900000000n, 10n ** 17n, true);
    await checker.checkTotalSupply(100000000000000000000n, 0, true);
    await checker.checkVaultMktValue(122109738n, 400n);
    await checker.checkBorrowValue(60365153n, 500n);

    // console.log('--------------------Rebalance--------------------');
    tx = await dnGmxJuniorVault.rebalance();
    // await logger.logGlpRewards(tx);
    // await logger.logAavePosition();
    // await logger.logBorrowParams();
    // await logger.logProtocolParamsAndHoldings();

    await checker.checkTotalAssets(105676362495248000000n, 10n ** 16n, true);
    await checker.checkTotalSupply(100000000000000000000n, 0, true);

    await checker.checkCurrentBorrowed([52913n, 21288542281753900n], [0n, 10n ** 11n]);
    await checker.checkBorrowValue(64476371n, 10n);
    await checker.checkUsdcBorrwed(49305460n, 10n);
    await checker.checkVaultMktValue(121357513n, 100n);
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
    // console.log('--------------------Initial Deposit--------------------');
    const amount = parseEther('100');
    tx = await dnGmxJuniorVault.connect(users[0]).deposit(amount, users[0].address);

    // await logger.logAavePosition(tx);
    // await logger.logBorrowParams(tx);
    // await logger.logProtocolParamsAndHoldings();

    await checker.checkTotalAssets(99473511447474500000n, 10n ** 16n, true);
    await checker.checkTotalSupply(100000000000000000000n, 0, true);
    await checker.checkCurrentBorrowed([83259n, 12945732922165800n], [0, 7n * 10n ** 9n]);
    await checker.checkVaultMktValue(128185179n, 70n);
    await checker.checkBorrowValue(68302112n, 20n);
    await checker.checkUsdcBorrwed(52231026n, 20n);

    await increaseBlockTimestamp(4 * 24 * 60 * 60);
    // console.log('--------------------Time Increased--------------------');
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

    await checker.checkTotalAssets(95822420680398200000n, 10n ** 17n, true);
    await checker.checkTotalSupply(100000000000000000000n, 0, true);
    await checker.checkVaultMktValue(125191487n, 400n);
    await checker.checkBorrowValue(73477704n, 500n);

    // console.log('--------------------Rebalance--------------------');
    tx = await dnGmxJuniorVault.rebalance();
    // await logger.logGlpRewards(tx);
    // await logger.logAavePosition();
    // await logger.logBorrowParams();
    // await logger.logProtocolParamsAndHoldings();

    await checker.checkTotalAssets(95516637988080500000n, 10n ** 15n, true);
    await checker.checkTotalSupply(100000000000000000000n, 0, true);

    await checker.checkCurrentBorrowed([83287n + 1n, 12948247272272900n], [0, 10n ** 10n]);
    await checker.checkBorrowValue(73477704n, 500n);
    // USDC borrowed from SrTranche is bases optimalBorrowValue & not currentBorrowValue when swapAmount < Threshold
    await checker.checkUsdcBorrwed(48859382n, 100n);
    await checker.checkVaultMktValue(125173494n, 100n);
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
    // console.log('--------------------Initial Deposit--------------------');
    const amount = parseEther('100');
    tx = await dnGmxJuniorVault.connect(users[0]).deposit(amount, users[0].address);

    // await logger.logAavePosition(tx);
    // await logger.logBorrowParams(tx);
    // await logger.logProtocolParamsAndHoldings();

    await checker.checkTotalAssets(99473511447474500000n, 10n ** 16n, true);
    await checker.checkTotalSupply(100000000000000000000n, 0, true);
    await checker.checkCurrentBorrowed([83259n, 12945732922165800n], [0, 7n * 10n ** 9n]);
    await checker.checkVaultMktValue(128185179n, 70n);
    await checker.checkBorrowValue(68302112n, 20n);
    await checker.checkUsdcBorrwed(52231026n, 20n);

    await increaseBlockTimestamp(4 * 24 * 60 * 60);
    // console.log('--------------------Time Increased--------------------');
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

    await checker.checkTotalAssets(87898842558856500000n, 10n ** 18n, true);
    await checker.checkTotalSupply(100000000000000000000n, 0, true);
    await checker.checkVaultMktValue(128239177n, 10n);
    await checker.checkBorrowValue(86777314n, 30n);

    // console.log('--------------------Rebalance--------------------');
    tx = await dnGmxJuniorVault.rebalance();
    // await logger.logGlpRewards(tx);
    // await logger.logAavePosition();
    // await logger.logBorrowParams();
    // await logger.logProtocolParamsAndHoldings();

    await checker.checkTotalAssets(86876078050527600000n, 10n ** 16n, true);
    await checker.checkTotalSupply(100000000000000000000n, 0, true);

    await checker.checkCurrentBorrowed([83288n, 9244455601905780n], [0, 10n ** 11n]);
    await checker.checkBorrowValue(71961574n, 200n);
    // // USDC borrowed from SrTranche is bases optimalBorrowValue & not currentBorrowValue when swapAmount < Threshold
    await checker.checkUsdcBorrwed(53726279n, 3000n);
    await checker.checkVaultMktValue(128039292n, 10n);
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

    // console.log('--------------------Sr. Tranche Initial Deposit--------------------');
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
    // console.log('--------------------Jr. Tranche Initial Deposit--------------------');
    const amount = parseEther('100');
    await dnGmxJuniorVault.connect(users[0]).deposit(amount, users[0].address);

    // await logger.logAavePosition();
    // await logger.logBorrowParams();
    // await logger.logProtocolParamsAndHoldings();

    await checker.checkTotalAssets(99473511447474500000n, 10n ** 16n, true);
    await checker.checkTotalSupply(100000000000000000000n, 0, true);
    await checker.checkCurrentBorrowed([83259n, 12945732922165800n], [0, 7n * 10n ** 9n]);
    await checker.checkVaultMktValue(128185179n, 70n);
    await checker.checkBorrowValue(68302112n, 20n);
    await checker.checkUsdcBorrwed(52231026n, 20n);

    await increaseBlockTimestamp(4 * 24 * 60 * 60);
    // console.log('--------------------Time Increased--------------------');
    // ETH: $3012.65 BTC: $41382.59
    await changer.changePriceToken('WBTC', 41382.59);
    await changer.changePriceToken('WETH', 3012.65);
    // await logger.logGlpPrice();
    // await logger.logTargetWeights();

    // await logger.logAavePosition();
    // await logger.logBorrowParams();
    // await logger.logProtocolParamsAndHoldings();

    await checker.checkTotalAssets(95822420680398200000n, 10n ** 17n, true);
    await checker.checkTotalSupply(100000000000000000000n, 0, true);
    await checker.checkVaultMktValue(125191488n, 400n);
    await checker.checkBorrowValue(73477703n, 500n);

    // New Deposit
    // console.log('--------------------Jr. Tranche New Deposit--------------------');
    const amount1 = parseEther('50');
    await dnGmxJuniorVault.connect(users[0]).deposit(amount1, users[0].address);
    // await logger.logAavePosition();
    // await logger.logBorrowParams();
    // await logger.logProtocolParamsAndHoldings();

    await checker.checkTotalAssets(142959505458869000000n, 10n ** 12n, true);
    await checker.checkTotalSupply(152340033443598000000n, 10n ** 16n, true);
    await checker.checkCurrentBorrowed([89441n, 13760285868700400n], [0, 10n ** 9n]);
    await checker.checkVaultMktValue(190649787n, 10n ** 6n);
    await checker.checkBorrowValue(78470971n, 100n);
    await checker.checkUsdcBorrwed(60007213n, 500n);

    // console.log('--------------------Time Increased--------------------');
    await increaseBlockTimestamp(60);
    // ETH: $3012.65 BTC: $41382.59
    await changer.changePriceToken('WBTC', 41382.59);
    await changer.changePriceToken('WETH', 3012.65);
    // await logger.logGlpPrice();
    // await logger.logTargetWeights();

    // await logger.logAavePosition();
    // await logger.logBorrowParams();
    // await logger.logProtocolParamsAndHoldings();

    await checker.checkTotalAssets(143262243436802000000n, 10n ** 18n, true);
    await checker.checkTotalSupply(152340033443598000000n, 10n ** 16n, true);
    await checker.checkBorrowValue(78470987n, 100n);

    // console.log('--------------------Sr. Tranche New Deposit--------------------');
    await dnGmxSeniorVault.connect(users[1]).deposit(parseUnits('40', 6), users[1].address);

    // ETH: $2787.23 BTC: $38694.59
    await changer.changePriceToken('WBTC', 41382.59);
    await changer.changePriceToken('WETH', 3012.65);
    // await logger.logGlpPrice();
    // await logger.logTargetWeights();
    // await logger.logAavePosition();
    // await logger.logBorrowParams();

    // console.log('--------------------Rebalance--------------------');
    tx = await dnGmxJuniorVault.rebalance();
    // await logger.logGlpRewards(tx);
    // await logger.logAavePosition();
    // await logger.logBorrowParams();
    // await logger.logProtocolParamsAndHoldings();

    await checker.checkTotalAssets(143047322625520000000n, 10n ** 16n, true);
    await checker.checkTotalSupply(152340033443598000000n, 10n ** 16n, true);

    await checker.checkCurrentBorrowed([113178n, 17412270390179700n], [0, 10n ** 10n]);
    await checker.checkBorrowValue(99296775n, 500n);
    await checker.checkUsdcBorrwed(75932827n, 500n);
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

    // console.log('--------------------Sr. Tranche Initial Deposit--------------------');
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
    // console.log('--------------------Jr. Tranche Initial Deposit--------------------');
    const amount = parseEther('100');
    await dnGmxJuniorVault.connect(users[0]).deposit(amount, users[0].address);

    // await logger.logAavePosition();
    // await logger.logBorrowParams();
    // await logger.logProtocolParamsAndHoldings();

    await checker.checkTotalAssets(99473511447474500000n, 10n ** 16n, true);
    await checker.checkTotalSupply(100000000000000000000n, 0, true);
    await checker.checkCurrentBorrowed([83259n, 12945732922165800n], [0, 7n * 10n ** 9n]);
    await checker.checkVaultMktValue(128185179n, 70n);
    await checker.checkBorrowValue(68302112n, 20n);
    await checker.checkUsdcBorrwed(52231026n, 20n);

    await increaseBlockTimestamp(4 * 24 * 60 * 60);
    // console.log('--------------------Time Increased--------------------');
    // ETH: $3012.65 BTC: $41382.59
    await changer.changePriceToken('WBTC', 41382.59);
    await changer.changePriceToken('WETH', 3012.65);
    // await logger.logGlpPrice();
    // await logger.logTargetWeights();

    // await logger.logAavePosition();
    // await logger.logBorrowParams();
    // await logger.logProtocolParamsAndHoldings();

    await checker.checkTotalAssets(95822420680398200000n, 10n ** 17n, true);
    await checker.checkTotalSupply(100000000000000000000n, 0, true);
    await checker.checkVaultMktValue(125191488n, 400n);
    await checker.checkBorrowValue(73477703n, 500n);

    // New Deposit
    // console.log('--------------------Jr. Tranche New Deposit--------------------');
    const amount1 = parseEther('50');
    await dnGmxJuniorVault.connect(users[0]).deposit(amount1, users[0].address);
    // await logger.logAavePosition();
    // await logger.logBorrowParams();
    // await logger.logProtocolParamsAndHoldings();

    await checker.checkTotalAssets(142959505458869000000n, 10n ** 12n, true);
    await checker.checkTotalSupply(152340033443598000000n, 10n ** 16n, true);
    await checker.checkCurrentBorrowed([89441n, 13760285868700400n], [0, 10n ** 9n]);
    await checker.checkVaultMktValue(190649787n, 10n ** 6n);
    await checker.checkBorrowValue(78470971n, 100n);
    await checker.checkUsdcBorrwed(60007213n, 500n);

    // console.log('--------------------Time Increased--------------------');
    await increaseBlockTimestamp(60);
    // ETH: $3012.65 BTC: $41382.59
    await changer.changePriceToken('WBTC', 41382.59);
    await changer.changePriceToken('WETH', 3012.65);
    // await logger.logGlpPrice();
    // await logger.logTargetWeights();

    // await logger.logAavePosition();
    // await logger.logBorrowParams();
    // await logger.logProtocolParamsAndHoldings();

    await checker.checkTotalAssets(143262243436802000000n, 10n ** 18n, true);
    await checker.checkTotalSupply(152340033443598000000n, 10n ** 16n, true);
    await checker.checkBorrowValue(78470987n, 100n);

    // console.log('--------------------Jr. Tranche Partial Withdraw--------------------');
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

    await checker.checkTotalAssets(128007772670651000000n, 10n ** 18n, true);
    await checker.checkTotalSupply(136383921699123000000n, 10n ** 18n, true);

    await checker.checkCurrentBorrowed([89441n, 13760291118122500n], [0, 10n ** 12n]);
    await checker.checkBorrowValue(78470987n, 100n);
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
    // console.log('--------------------Initial Deposit--------------------');
    const amount = parseEther('100');
    tx = await dnGmxJuniorVault.connect(users[0]).deposit(amount, users[0].address);

    // await logger.logAavePosition(tx);
    // await logger.logBorrowParams(tx);
    // await logger.logProtocolParamsAndHoldings();

    await checker.checkTotalAssets(99473511447474500000n, 10n ** 16n, true);
    await checker.checkTotalSupply(100000000000000000000n, 0, true);
    await checker.checkCurrentBorrowed([83259n, 12945732922165800n], [0, 7n * 10n ** 9n]);
    await checker.checkVaultMktValue(128185179n, 70n);
    await checker.checkBorrowValue(68302112n, 20n);
    await checker.checkUsdcBorrwed(52231026n, 20n);

    // console.log('--------------------Time Increased--------------------');
    await increaseBlockTimestamp(4 * 24 * 60 * 60);
    // ETH: $3012.65 BTC: $41382.59
    await changer.changePriceToken('WBTC', 41382.59);
    await changer.changePriceToken('WETH', 3012.65);

    // await logger.logGlpPrice();
    // await logger.logTargetWeights();

    // await logger.logAavePosition();
    // await logger.logBorrowParams();
    // await logger.logProtocolParamsAndHoldings();

    await checker.checkTotalAssets(95822420680398200000n, 10n ** 17n, true);
    await checker.checkTotalSupply(100000000000000000000n, 0, true);
    await checker.checkVaultMktValue(125191074n, 100n);
    await checker.checkBorrowValue(73478117n, 100n);

    // console.log('--------------------Rebalance--------------------');
    tx = await dnGmxJuniorVault.rebalance();
    // await logger.logGlpRewards(tx);
    // await logger.logAavePosition();
    // await logger.logBorrowParams();
    // await logger.logProtocolParamsAndHoldings();

    await checker.checkTotalAssets(95773570536109000000n, 10n ** 17n, true);
    await checker.checkTotalSupply(100000000000000000000n, 0, true);

    await checker.checkCurrentBorrowed([75893n, 11676126691167900n], [0, 10n ** 10n]);
    await checker.checkVaultMktValue(125122571n, 100n);
    await checker.checkBorrowValue(66585055n, 200n);
    await checker.checkUsdcBorrwed(50917983n, 500n);
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
    // console.log('--------------------Initial Deposit--------------------');
    const amount = parseEther('1000000');
    tx = await dnGmxJuniorVault.connect(users[0]).deposit(amount, users[0].address);

    // await logger.logAavePosition(tx);
    // await logger.logBorrowParams(tx);
    // await logger.logProtocolParamsAndHoldings();

    await checker.checkTotalAssets(994735236115744000000000n, 10n ** 20n, true);
    await checker.checkTotalSupply(1000000000000000000000000n, 0, true);
    await checker.checkCurrentBorrowed([833855646n, 129654124791043000000n], [200n, 3n * 10n ** 13n]);
    await checker.checkVaultMktValue(1283800405689n, 3n * 10n ** 5n);
    await checker.checkBorrowValue(684059431175, 2n * 10n ** 5n);
    await checker.checkUsdcBorrwed(523104270898n, 3n * 10n ** 5n);

    await increaseBlockTimestamp(4 * 24 * 60 * 60);
    // console.log('--------------------Time Increased--------------------');
    // ETH: $3012.65 BTC: $41382.59
    await changer.changePriceToken('WBTC', 41382.59);
    await changer.changePriceToken('WETH', 3012.65);

    // await logger.logGlpPrice();
    // await logger.logTargetWeights();

    // await logger.logAavePosition();
    // await logger.logBorrowParams();
    // await logger.logProtocolParamsAndHoldings();

    await checker.checkTotalAssets(958216397263542000000000n, 10n ** 21n, true);
    await checker.checkTotalSupply(1000000000000000000000000n, 0, true);
    await checker.checkVaultMktValue(1253921555799n, 4n * 10n ** 5n);
    await checker.checkBorrowValue(735929281065n, 2n * 10n ** 5n);

    // console.log('--------------------Rebalance--------------------');
    tx = await dnGmxJuniorVault.rebalance();
    // await logger.logGlpRewards(tx);
    // await logger.logAavePosition();
    // await logger.logBorrowParams();
    // await logger.logProtocolParamsAndHoldings();

    await checker.checkTotalAssets(954894872015607000000000n, 10n ** 18n, true);
    await checker.checkTotalSupply(1000000000000000000000000n, 0, true);

    await checker.checkCurrentBorrowed([757509992n, 116540097481776000000n], [3n * 10n ** 5n, 4n * 10n ** 16n]);
    await checker.checkVaultMktValue(1253483462644n, 10n ** 8n);
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
    // console.log('--------------------Initial Deposit--------------------');
    const amount = parseEther('100');
    tx = await dnGmxJuniorVault.connect(users[0]).deposit(amount, users[0].address);

    // await logger.logAavePosition(tx);
    // await logger.logBorrowParams(tx);
    // await logger.logProtocolParamsAndHoldings();

    await checker.checkTotalAssets(99473511447474500000n, 10n ** 16n, true);
    await checker.checkTotalSupply(100000000000000000000n, 0, true);
    await checker.checkCurrentBorrowed([83259n, 12945732922165800n], [0, 7n * 10n ** 9n]);
    await checker.checkVaultMktValue(128185179n, 70n);
    await checker.checkBorrowValue(68302112n, 20n);
    await checker.checkUsdcBorrwed(52231026n, 20n);

    // console.log('--------------------Time Increased--------------------');
    await increaseBlockTimestamp(4 * 24 * 60 * 60);

    await changer.changePriceToken('WBTC', 52000.0);
    await changer.changePriceToken('WETH', 3750.0);

    // await logger.logGlpPrice();
    // await logger.logTargetWeights();

    // await logger.logAavePosition();
    // await logger.logBorrowParams();
    // await logger.logProtocolParamsAndHoldings();

    await checker.checkTotalAssets(85350400226304300000n, 10n ** 6n, true);
    await checker.checkTotalSupply(100000000000000000000n, 0, true);
    await checker.checkVaultMktValue(128179441n, 100n);
    await checker.checkBorrowValue(91869250n, 100n);

    // console.log('-------------------- Rebalance 1 --------------------');
    tx = await dnGmxJuniorVault.rebalance();
    // await logger.logGlpRewards(tx);
    // await logger.logAavePosition();
    // await logger.logBorrowParams();
    // await logger.logProtocolParamsAndHoldings();

    await checker.checkTotalAssets(83989797960694200000n, 10n ** 13n, true);
    await checker.checkTotalSupply(100000000000000000000n, 0, true);

    await checker.checkCurrentBorrowed([73673n - 1n, 11614913837155700n], [0, 6n * 10n ** 10n]);
    await checker.checkVaultMktValue(128012061n, 70n);
    await checker.checkBorrowValue(81869062n, 400n);
    await checker.checkUsdcBorrwed(62605753n, 200n);

    // console.log('-------------------- Rebalance 2 --------------------');
    tx = await dnGmxJuniorVault.rebalance();
    // await logger.logGlpRewards(tx);
    // await logger.logAavePosition();
    // await logger.logBorrowParams();
    // await logger.logProtocolParamsAndHoldings();

    await checker.checkTotalAssets(83929388859448500000n, 10n ** 13n, true);
    await checker.checkTotalSupply(100000000000000000000n, 0, true);

    await checker.checkCurrentBorrowed([64058n - 1n, 10281580503822300n], [0, 2n * 10n ** 11n]);
    await checker.checkVaultMktValue(127912062n, 70n);
    await checker.checkBorrowValue(71868874n, 200n);
    await checker.checkUsdcBorrwed(54958550n, 100n);

    // console.log('-------------------- Rebalance 3 --------------------');
    tx = await dnGmxJuniorVault.rebalance();
    // await logger.logGlpRewards(tx);
    // await logger.logAavePosition();
    // await logger.logBorrowParams();
    // await logger.logProtocolParamsAndHoldings();

    await checker.checkTotalAssets(83904532433521400000n, 10n ** 13n, true);
    await checker.checkTotalSupply(100000000000000000000n, 0, true);

    await checker.checkCurrentBorrowed([61506n, 9552256814670940n], [0, 10n ** 10n]);
    await checker.checkVaultMktValue(127870918n, 100n);
    await checker.checkBorrowValue(67806713n, 100n);
    await checker.checkUsdcBorrwed(51852192n, 500n);

    // console.log('-------------------- Rebalance 4 --------------------');
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
    // await logger.logGlpPrice();
    // await logger.logTargetWeights();
    // await logger.logAavePosition();
    // await logger.logBorrowParams();

    // await changer.changeWeight('WBTC', 20_000, gmxVault);
    // await changer.changeWeight('WETH', 20_000, gmxVault);

    // Deposit
    // console.log('--------------------User0 Initial Deposit--------------------');
    const amount = parseEther('1000000');
    await dnGmxJuniorVault.connect(users[0]).deposit(amount, users[0].address);

    // await logger.logAavePosition();
    // await logger.logBorrowParams();
    // await logger.logProtocolParamsAndHoldings();

    await checker.checkTotalAssets(994788006072456000000000n, 10n ** 10n, true);
    await checker.checkTotalSupply(1000000000000000000000000n, 0, true);
    await checker.checkCurrentBorrowed([835107100n, 129848710302986000000n], [200n, 2n * 10n ** 13n]);
    await checker.checkVaultMktValue(1285727139292n, 3n * 10n ** 5n);
    await checker.checkBorrowValue(685086070743n, 2n * 10n ** 5n);
    await checker.checkUsdcBorrwed(523889348215n, 2n * 10n ** 5n);

    await increaseBlockTimestamp(4 * 24 * 60 * 60);
    // console.log('--------------------Time Increased--------------------');
    // ETH: $2695.46 BTC: $37311.61
    await changer.changePriceToken('WBTC', 37311.61);
    await changer.changePriceToken('WETH', 2695.46);
    // await logger.logGlpPrice();
    // await logger.logTargetWeights();

    // await logger.logAavePosition();
    // await logger.logBorrowParams();
    // await logger.logProtocolParamsAndHoldings();

    await checker.checkTotalAssets(1012403399758560000000000n, 10n ** 19n, true);
    await checker.checkTotalSupply(1000000000000000000000000n, 0, true);
    await checker.checkVaultMktValue(1242650040823n, 10n ** 6n);
    await checker.checkBorrowValue(661824169212n, 10n ** 5n);

    // New Deposit
    // console.log('--------------------User2 Initial Deposit--------------------');
    const amount1 = parseEther('500000');
    await dnGmxJuniorVault.connect(users[2]).deposit(amount1, users[2].address);
    // await logger.logAavePosition();
    // await logger.logBorrowParams();
    // await logger.logProtocolParamsAndHoldings();

    await checker.checkTotalAssets(1510349720889180000000000n, 10n ** 19n, true);
    await checker.checkTotalSupply(1493396756045850000000000n, 10n ** 21n, true);
    await checker.checkCurrentBorrowed([1242917163n, 192772393330892000000n], [5000n, 10n ** 19n]);
    await checker.checkBorrowValue(983193245204n, 10n ** 7n);
    await checker.checkUsdcBorrwed(751853658097n, 10n ** 7n);

    // console.log('--------------------Time Increased--------------------');
    await increaseBlockTimestamp(4 * 24 * 60 * 60);
    // ETH: $3012.65 BTC: $41382.59
    await changer.changePriceToken('WBTC', 41382.59);
    await changer.changePriceToken('WETH', 3012.65);

    // await logger.logGlpPrice();
    // await logger.logTargetWeights();

    // await logger.logAavePosition();
    // await logger.logBorrowParams();
    // await logger.logProtocolParamsAndHoldings();

    await checker.checkTotalAssets(1431690083197940000000000n, 10n ** 19n, true);
    await checker.checkTotalSupply(1493396756045850000000000n, 10n ** 21n, true);
    await checker.checkVaultMktValue(1870415620497n, 10n ** 10n);
    await checker.checkBorrowValue(1095279615300n, 10n ** 7n);

    // console.log('--------------------Time Based Rebalance--------------------');
    tx = await dnGmxJuniorVault.rebalance();
    // await logger.logGlpRewards(tx);
    // await logger.logAavePosition();
    // await logger.logBorrowParams();
    // await logger.logProtocolParamsAndHoldings();

    await checker.checkTotalAssets(1424124952486100000000000n, 10n ** 19n, true);
    await checker.checkTotalSupply(1493396756045850000000000n, 10n ** 21n, true);

    await checker.checkCurrentBorrowed([1131684085n, 174105391351458000000n], [1000n, 10n ** 19n]);
    await checker.checkVaultMktValue(1872106521221n, 10n ** 9n);
    await checker.checkBorrowValue(992877315942n, 10n ** 6n);
    await checker.checkUsdcBorrwed(759259123955n, 10n ** 6n);

    // console.log('--------------------Time Increased--------------------');
    await increaseBlockTimestamp(4 * 24 * 60 * 60);
    // ETH: $3139.77 BTC: $43839.99
    await changer.changePriceToken('WBTC', 43839.99);
    await changer.changePriceToken('WETH', 3139.77);
    // await logger.logGlpPrice();
    // await logger.logTargetWeights();

    // await logger.logAavePosition();
    // await logger.logBorrowParams();
    // await logger.logProtocolParamsAndHoldings();

    await checker.checkTotalAssets(1389943952783790000000000n, 10n ** 19n, true);
    await checker.checkTotalSupply(1493396756045850000000000n, 10n ** 21n, true);
    await checker.checkVaultMktValue(1884142569639n, 10n ** 10n);
    await checker.checkBorrowValue(1043333614738, 10n ** 9n);

    // console.log('--------------------User2 Full Withdraw--------------------');
    const amount2 = dnGmxJuniorVault.balanceOf(users[2].address);
    await dnGmxJuniorVault.connect(users[2]).redeem(amount2, users[2].address, users[2].address);

    // await logger.logAavePosition();
    // await logger.logBorrowParams();
    // await logger.logProtocolParamsAndHoldings();

    await checker.checkTotalAssets(971836622041170000000000n, 10n ** 19n, true);
    await checker.checkTotalSupply(1000000000000000000000000n, 0, true);
    await checker.checkCurrentBorrowed([754326229n, 117964095638946000000n], [1000n, 10n ** 19n]);
    await checker.checkVaultMktValue(1322740071689n, 10n ** 10n);
    await checker.checkBorrowValue(701103874754n, 10n ** 8n);
    await checker.checkUsdcBorrwed(536138257164n, 10n ** 7n);
  });
});
