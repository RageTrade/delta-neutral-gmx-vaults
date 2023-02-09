// RebalanceScenario.spec.ts
// REBALANCE SCENARIO
import { expect } from 'chai';
import { BigNumber, ethers } from 'ethers';
import { Logger } from './utils/logger';
import { Changer } from './utils/changer';
import { Checker } from './utils/checker';
import { increaseBlockTimestamp } from './utils/shared';
import { formatEther, parseEther, parseUnits } from 'ethers/lib/utils';
import { dnGmxJuniorVaultFixture } from './fixtures/dn-gmx-junior-vault';
import hre from 'hardhat';
import { formatError } from '@ragetrade/sdk';

describe('Rebalance Scenarios', () => {
  it('Rebalance Current Weights; 0% TraderOI Hedge (Excel)', async () => {
    let tx;

    const opts = await dnGmxJuniorVaultFixture();
    const logger = new Logger(opts);
    const changer = new Changer(opts);
    const checker = new Checker(opts);

    const { dnGmxJuniorVault, dnGmxSeniorVault, glpBatchingManager, users, mocks, aUSDC, gmxVault, lendingPool } = opts;
    // await dnGmxJuniorVault.setMocks(mocks.swapRouterMock.address);
    await changer.addLiquidity();
    // await dnGmxJuniorVault.grantAllowances();

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
    //  await changer.changePriceToken('WBTC', 38694.59);
    //  await changer.changePriceToken('WETH', 2787.23);
    await logger.logGlpPrice();
    await logger.logTargetWeights();
    await logger.logAavePosition();
    await logger.logBorrowParams();

    // await changer.changeTargetWeight('WBTC', 20_000, gmxVault);
    // await changer.changeTargetWeight('WETH', 20_000, gmxVault);

    // // await checker.checkTotalAssets(150000000n, 10n ** 15n, false);

    // Deposit
    console.log('--------------------Initial Deposit--------------------');
    const amount = parseEther('100');
    tx = await dnGmxJuniorVault.connect(users[0]).deposit(amount, users[0].address);

    await logger.logAavePosition(tx);
    await logger.logBorrowParams(tx);
    await logger.logProtocolParamsAndHoldings();

    await checker.checkTotalAssets(99875913146589300000n, 10n ** 10n, true);
    await checker.checkTotalSupply(99877139590209400000n, 10n ** 6n, true);
    await checker.checkCurrentBorrowed([99971n, 19471978242701800n], [0n, 100n]);
    await checker.checkVaultMktValue(93309132n, 0n);
    await checker.checkBorrowValue(53541100n, 10n);
    await checker.checkUsdcBorrwed(40943193n, 10n);

    console.log('--------------------Time Increased--------------------');
    await increaseBlockTimestamp(4 * 24 * 60 * 60);
    // ETH: $3012.65 BTC: $41382.59
    await changer.changePriceToken('WBTC', 23300);
    await changer.changePriceToken('WETH', 1595);

    await logger.logGlpPrice();
    await logger.logTargetWeights();

    await logger.logAavePosition();
    await logger.logBorrowParams();
    await logger.logProtocolParamsAndHoldings();

    await checker.checkTotalAssets(98977370511811300000n, 10n ** 10n, true);
    await checker.checkTotalSupply(99877139590209400000n, 10n ** 6n, true);
    await checker.checkVaultMktValue(91598862n, 10n);
    await checker.checkBorrowValue(54363249n, 10n);

    console.log('--------------------Rebalance--------------------');
    tx = await dnGmxJuniorVault.rebalance();
    await logger.logGlpRewards(tx);
    await logger.logAavePosition();
    await logger.logBorrowParams();
    await logger.logProtocolParamsAndHoldings();

    await checker.checkTotalAssets(98986816089380800000n, 10n ** 13n, true);
    await checker.checkTotalSupply(99877139590209400000n, 10n ** 10n, true);

    await checker.checkCurrentBorrowed([98948n + 1n, 19272852051258200n], [0, 10n ** 10n]);
    await checker.checkVaultMktValue(91607516n, 10n);
    await checker.checkBorrowValue(53791114n, 300n);
    await checker.checkUsdcBorrwed(41134381n, 10n);
  });

  it('New Deposit; RebalanceProfit > Threshold (Excel)', async () => {
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
      aUSDC,
      gmxVault,
      lendingPool,
      mocks,
      dnGmxTraderHedgeStrategy,
    } = opts;
    await dnGmxJuniorVault.setMocks(mocks.swapRouterMock.address);
    await changer.addLiquidity();
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

    // RebalanceProfit threshold (absolute $ amount)
    await dnGmxJuniorVault.setParamsV1(parseUnits('1', 6), dnGmxTraderHedgeStrategy.address);

    await dnGmxSeniorVault.connect(users[1]).deposit(parseUnits('150', 6), users[1].address);

    // ETH: $2787.23 BTC: $38694.59
    //  await changer.changePriceToken('WBTC', 38694.59);
    //  await changer.changePriceToken('WETH', 2787.23);
    await logger.logGlpPrice();
    await logger.logTargetWeights();
    await logger.logAavePosition();
    await logger.logBorrowParams();

    // await changer.changeTargetWeight('WBTC', 20_000, gmxVault);
    // await changer.changeTargetWeight('WETH', 20_000, gmxVault);

    // Deposit
    console.log('--------------------Initial Deposit--------------------');
    const amount = parseEther('100');
    tx = await dnGmxJuniorVault.connect(users[0]).deposit(amount, users[0].address);

    await logger.logAavePosition(tx);
    await logger.logBorrowParams(tx);
    await logger.logProtocolParamsAndHoldings();

    await checker.checkTotalAssets(99421170542769300000n, 10n ** 10n, true);
    await checker.checkTotalSupply(99432633472683200000n, 10n ** 6n, true);
    await checker.checkCurrentBorrowed([99971n, 19471978242701800n], [0n, 100n]);
    await checker.checkVaultMktValue(92888500n, 0n);
    await checker.checkBorrowValue(53541100n, 10n);
    await checker.checkUsdcBorrwed(40943193n, 10n);

    console.log('--------------------Time Increased--------------------');
    await increaseBlockTimestamp(4 * 24 * 60 * 60);
    // ETH: $3012.65 BTC: $41382.59
    await changer.changePriceToken('WBTC', 23300);
    await changer.changePriceToken('WETH', 1595);

    await logger.logGlpPrice();
    await logger.logTargetWeights();

    await logger.logAavePosition();
    await logger.logBorrowParams();
    await logger.logProtocolParamsAndHoldings();

    await checker.checkTotalAssets(98518263485691100000n, 10n ** 10n, true);
    await checker.checkTotalSupply(99432633472683200000n, 10n ** 6n, true);
    await checker.checkVaultMktValue(91178230n, 10n);
    await checker.checkBorrowValue(54363249n, 10n);

    // New Deposit
    console.log('--------------------New Deposit--------------------');
    const amount1 = parseEther('50');
    await dnGmxJuniorVault.connect(users[0]).deposit(amount1, users[0].address);
    await logger.logAavePosition();
    await logger.logBorrowParams();
    await logger.logProtocolParamsAndHoldings();

    await checker.checkTotalAssets(148241246556632000000n, 10n ** 15n, true);
    await checker.checkTotalSupply(149606450741327000000n, 10n ** 12n, true);
    await checker.checkCurrentBorrowed([148486n + 1n, 28921571527231400n], [0, 10n ** 10n]);
    await checker.checkVaultMktValue(137178883n, 10n);
    await checker.checkBorrowValue(80721188n, 300n);
    await checker.checkUsdcBorrwed(61727967n, 10n);
  });

  it('Partial Withdraw; RebalanceProfit < Threshold; Aave HF > Threshold (Excel)', async () => {
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
      aUSDC,
      gmxVault,
      lendingPool,
      mocks,
      dnGmxTraderHedgeStrategy,
    } = opts;
    // await dnGmxJuniorVault.setMocks(mocks.swapRouterMock.address);
    await changer.addLiquidity();
    // await dnGmxJuniorVault.grantAllowances();

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

    // RebalanceProfit threshold (absolute $ amount)
    await dnGmxJuniorVault.setParamsV1(parseUnits('1', 6), dnGmxTraderHedgeStrategy.address);

    await dnGmxSeniorVault.connect(users[1]).deposit(parseUnits('150', 6), users[1].address);

    // ETH: $2787.23 BTC: $38694.59
    //  await changer.changePriceToken('WBTC', 38694.59);
    //  await changer.changePriceToken('WETH', 2787.23);
    await logger.logGlpPrice();
    await logger.logTargetWeights();
    await logger.logAavePosition();
    await logger.logBorrowParams();

    // await changer.changeTargetWeight('WBTC', 20_000, gmxVault);
    // await changer.changeTargetWeight('WETH', 20_000, gmxVault);

    console.log('--------------------Initial Deposit--------------------');
    const amount = parseEther('100');
    tx = await dnGmxJuniorVault.connect(users[0]).deposit(amount, users[0].address);

    await logger.logAavePosition(tx);
    await logger.logBorrowParams(tx);
    await logger.logProtocolParamsAndHoldings();

    await checker.checkTotalAssets(99875913146589300000n, 10n ** 10n, true);
    await checker.checkTotalSupply(99877139590209400000n, 10n ** 6n, true);
    await checker.checkCurrentBorrowed([99971n, 19471978242701800n], [0n, 100n]);
    await checker.checkVaultMktValue(93309132n, 0n);
    await checker.checkBorrowValue(53541100n, 10n);
    await checker.checkUsdcBorrwed(40943193n, 10n);

    console.log('--------------------Time Increased--------------------');
    await increaseBlockTimestamp(4 * 24 * 60 * 60);
    // ETH: $3012.65 BTC: $41382.59
    await changer.changePriceToken('WBTC', 23300);
    await changer.changePriceToken('WETH', 1595);

    await logger.logGlpPrice();
    await logger.logTargetWeights();

    await logger.logAavePosition();
    await logger.logBorrowParams();
    await logger.logProtocolParamsAndHoldings();

    await checker.checkTotalAssets(98977370511811300000n, 10n ** 10n, true);
    await checker.checkTotalSupply(99877139590209400000n, 10n ** 6n, true);
    await checker.checkVaultMktValue(91598862n, 10n);
    await checker.checkBorrowValue(54363249n, 10n);

    // Partial Withdraw
    console.log('--------------------Partial Withdraw--------------------');
    const amount1 = parseEther('50');
    await dnGmxJuniorVault.connect(users[0]).withdraw(amount1, users[0].address, users[0].address);

    await logger.logAavePosition();
    await logger.logBorrowParams();
    await logger.logProtocolParamsAndHoldings();

    await checker.checkTotalAssets(49447887761572600000n, 10n ** 13n, true);
    await checker.checkTotalSupply(49422606309708900000n, 10n ** 10n, true);
    await checker.checkCurrentBorrowed([48963n, 9536862749889030n], [0, 10n ** 10n]);
    await checker.checkVaultMktValue(45762052n, 10n);
    await checker.checkBorrowValue(26617711n, 10n);
    await checker.checkUsdcBorrwed(20354720n, 10n);
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
      dnGmxTraderHedgeStrategy,
    } = opts;
    await dnGmxJuniorVault.setMocks(mocks.swapRouterMock.address);
    await changer.addLiquidity();
    await dnGmxJuniorVault.grantAllowances();

    await dnGmxJuniorVault.setAdminParams(
      admin.address,
      dnGmxSeniorVault.address,
      ethers.constants.MaxUint256,
      50,
      500,
    );
    // becauses price are not changed on uniswap
    await dnGmxJuniorVault.setThresholds(
      100, //slippageThresholdSwapBtcBps
      100, //slippageThresholdSwapEthBps
      100, //slippageThresholdGmxBps
      parseUnits('0', 6), //usdcConversionThreshold
      10n ** 15n, //wethConversionThreshold
      parseUnits('0', 6), //hedgeUsdcAmountThreshold
      parseUnits('1000000', 6), //partialBtcHedgeUsdcAmountThreshold
      parseUnits('1000000', 6), //partialEthHedgeUsdcAmountThreshold
    );

    // RebalanceProfit threshold (absolute $ amount)
    await dnGmxJuniorVault.setParamsV1(0n, dnGmxTraderHedgeStrategy.address);

    await dnGmxSeniorVault.connect(users[1]).deposit(parseUnits('150', 6), users[1].address);

    // ETH: $2787.23 BTC: $38694.59
    //  await changer.changePriceToken('WBTC', 38694.59);
    //  await changer.changePriceToken('WETH', 2787.23);
    await logger.logGlpPrice();
    await logger.logTargetWeights();
    await logger.logAavePosition();
    await logger.logBorrowParams();

    console.log('--------------------Initial Deposit--------------------');
    const amount = parseEther('100');
    tx = await dnGmxJuniorVault.connect(users[0]).deposit(amount, users[0].address);

    await logger.logAavePosition(tx);
    await logger.logBorrowParams(tx);
    await logger.logProtocolParamsAndHoldings();

    await checker.checkTotalAssets(99421170542769300000n, 10n ** 10n, true);
    await checker.checkTotalSupply(99432633472683200000n, 10n ** 6n, true);
    await checker.checkCurrentBorrowed([99971n, 19471978242701800n], [0n, 100n]);
    await checker.checkVaultMktValue(92888500n, 0n);
    await checker.checkBorrowValue(53541100n, 10n);
    await checker.checkUsdcBorrwed(40943193n, 10n);

    console.log('--------------------Time Increased--------------------');
    await increaseBlockTimestamp(4 * 24 * 60 * 60);
    // ETH: $3012.65 BTC: $41382.59
    await changer.changePriceToken('WBTC', 23300);
    await changer.changePriceToken('WETH', 1595);

    await logger.logGlpPrice();
    await logger.logTargetWeights();

    await logger.logAavePosition();
    await logger.logBorrowParams();
    await logger.logProtocolParamsAndHoldings();

    await checker.checkTotalAssets(98518263485691100000n, 10n ** 10n, true);
    await checker.checkTotalSupply(99432633472683200000n, 10n ** 6n, true);
    await checker.checkVaultMktValue(91178230n, 10n);
    await checker.checkBorrowValue(54363249n, 10n);

    console.log('--------------------Full Withdraw--------------------');
    const amount1 = dnGmxJuniorVault.balanceOf(users[0].address);
    await dnGmxJuniorVault.connect(users[0]).redeem(amount1, users[0].address, users[0].address);

    await logger.logAavePosition();
    await logger.logBorrowParams();
    await logger.logProtocolParamsAndHoldings();

    await checker.checkTotalAssets(488697890485059000n, 10n ** 13n, true);
    await checker.checkTotalSupply(0n, 0, true);
    await checker.checkCurrentBorrowed([1071n, 208612123948831n], [0, 1000n]);
    await checker.checkVaultMktValue(452234n, 10n);
    await checker.checkBorrowValue(582236n, 10n);
    await checker.checkUsdcBorrwed(445239n, 10n);
  });

  // it('TokenThreshold 1 : BtcWeight Decrease > threshold, EthWeight Decrease < threshold', async () => {
  //   let tx;

  //   const opts = await dnGmxJuniorVaultFixture();
  //   const logger = new Logger(opts);
  //   const changer = new Changer(opts);
  //   const checker = new Checker(opts);

  //   const { dnGmxJuniorVault, dnGmxSeniorVault, glpBatchingManager, users, mocks, aUSDC, gmxVault, lendingPool } = opts;
  //   // await dnGmxJuniorVault.setMocks(mocks.swapRouterMock.address);
  //   // await dnGmxJuniorVault.grantAllowances();

  //   // becauses price are not changed on uniswap
  //   await dnGmxJuniorVault.setThresholds(
  //     100, //slippageThresholdSwapBtcBps
  //     100, //slippageThresholdSwapEthBps
  //     100, //slippageThresholdGmxBps
  //     parseUnits('1', 6), //usdcConversionThreshold
  //     10n ** 15n, //wethConversionThreshold
  //     parseUnits('10', 6), //hedgeUsdcAmountThreshold
  //     parseUnits('1000000', 6), //partialBtcHedgeUsdcAmountThreshold
  //     parseUnits('1000000', 6), //partialEthHedgeUsdcAmountThreshold
  //   );

  //   await dnGmxSeniorVault.connect(users[1]).deposit(parseUnits('150', 6), users[1].address);

  //   // ETH: $2787.23 BTC: $38694.59
  //  //  await changer.changePriceToken('WBTC', 38694.59);
  //  //  await changer.changePriceToken('WETH', 2787.23);
  //   await logger.logGlpPrice();
  //   await logger.logTargetWeights();
  //   await logger.logAavePosition();
  //   await logger.logBorrowParams();

  //   // await changer.changeTargetWeight('WBTC', 20_000, gmxVault);
  //   // await changer.changeTargetWeight('WETH', 20_000, gmxVault);

  //   // await checker.checkTotalAssets(150000000n, 10n ** 15n, false);

  //   // Deposit
  //   console.log('--------------------Initial Deposit--------------------');
  //   const amount = parseEther('100');
  //   tx = await dnGmxJuniorVault.connect(users[0]).deposit(amount, users[0].address);

  //   await logger.logAavePosition(tx);
  //   await logger.logBorrowParams(tx);
  //   await logger.logProtocolParamsAndHoldings();

  //   await checker.checkTotalAssets(99875913146589300000n, 10n ** 10n, true);
  //   await checker.checkTotalSupply(99877139590209400000n, 10n ** 6n, true);
  //   await checker.checkCurrentBorrowed([99971n, 19471978242701800n], [0n, 100n]);
  //   await checker.checkVaultMktValue(93309132n, 0n);
  //   await checker.checkBorrowValue(53541100n, 10n);
  //   await checker.checkUsdcBorrwed(40943193n, 10n);

  //   await increaseBlockTimestamp(4 * 24 * 60 * 60);
  //   console.log('--------------------Time Increased--------------------');
  //   // ETH: $3012.65 BTC: $41382.59
  //  //  await changer.changePriceToken('WBTC', 50000.0);
  //  //  await changer.changePriceToken('WETH', 3012.65);
  //   await changer.changeTargetWeight('WBTC', 18_000);
  //   await changer.changeTargetWeight('WETH', 27_000);

  //   await logger.logGlpPrice();
  //   await logger.logTargetWeights();

  //   await logger.logAavePosition();
  //   await logger.logBorrowParams();
  //   await logger.logProtocolParamsAndHoldings();

  //   // await checker.checkTotalAssets(86296989402108500000n, 10n ** 10n, true);
  //   // await checker.checkTotalSupply(100000000000000000000n, 0, true);
  //   // await checker.checkVaultMktValue(125795826n, 500n);
  //   // await checker.checkBorrowValue(80655165n, 600n);

  //   console.log('--------------------Rebalance--------------------');
  //   tx = await dnGmxJuniorVault.rebalance();
  //   await logger.logGlpRewards(tx);
  //   await logger.logAavePosition();
  //   await logger.logBorrowParams();
  //   await logger.logProtocolParamsAndHoldings();

  //   // await checker.checkTotalAssets(86575166113367900000n, 10n ** 15n, true);
  //   // await checker.checkTotalSupply(100000000000000000000n, 0, true);

  //   // await checker.checkCurrentBorrowed([46474n, 12948247199528500n], [0, 10n ** 10n]);
  //   // await checker.checkBorrowValue(62248167n, 300n);
  //   // await checker.checkVaultMktValue(125569026n, 600n);
  //   // await checker.checkUsdcBorrwed(44424089n, 2000n);
  // });

  // it('TokenThreshold 2 : BtcWeight Decrease > threshold, EthWeight Increase > threshold', async () => {
  //   let tx;

  //   const opts = await dnGmxJuniorVaultFixture();
  //   const logger = new Logger(opts);
  //   const changer = new Changer(opts);
  //   const checker = new Checker(opts);

  //   const { dnGmxJuniorVault, dnGmxSeniorVault, glpBatchingManager, users, mocks, aUSDC, gmxVault, lendingPool } = opts;
  //   // await dnGmxJuniorVault.setMocks(mocks.swapRouterMock.address);
  //   // await dnGmxJuniorVault.grantAllowances();

  //   // becauses price are not changed on uniswap
  //   await dnGmxJuniorVault.setThresholds(
  //     100, //slippageThresholdSwapBtcBps
  //     100, //slippageThresholdSwapEthBps
  //     100, //slippageThresholdGmxBps
  //     parseUnits('1', 6), //usdcConversionThreshold
  //     10n ** 15n, //wethConversionThreshold
  //     parseUnits('12', 6), //hedgeUsdcAmountThreshold
  //     parseUnits('1000000', 6), //partialBtcHedgeUsdcAmountThreshold
  //     parseUnits('1000000', 6), //partialEthHedgeUsdcAmountThreshold
  //   );

  //   await dnGmxSeniorVault.connect(users[1]).deposit(parseUnits('150', 6), users[1].address);

  //   // ETH: $2787.23 BTC: $38694.59
  //  //  await changer.changePriceToken('WBTC', 38694.59);
  //  //  await changer.changePriceToken('WETH', 2787.23);
  //   await logger.logGlpPrice();
  //   await logger.logTargetWeights();
  //   await logger.logAavePosition();
  //   await logger.logBorrowParams();

  //   // await changer.changeTargetWeight('WBTC', 20_000, gmxVault);
  //   // await changer.changeTargetWeight('WETH', 20_000, gmxVault);

  //   // await checker.checkTotalAssets(150000000n, 10n ** 15n, false);

  //   // Deposit
  //   console.log('--------------------Initial Deposit--------------------');
  //   const amount = parseEther('100');
  //   tx = await dnGmxJuniorVault.connect(users[0]).deposit(amount, users[0].address);

  //   await logger.logAavePosition(tx);
  //   await logger.logBorrowParams(tx);
  //   await logger.logProtocolParamsAndHoldings();

  //   await checker.checkTotalAssets(99875913146589300000n, 10n ** 10n, true);
  //   await checker.checkTotalSupply(99877139590209400000n, 10n ** 6n, true);
  //   await checker.checkCurrentBorrowed([99971n, 19471978242701800n], [0n, 100n]);
  //   await checker.checkVaultMktValue(93309132n, 0n);
  //   await checker.checkBorrowValue(53541100n, 10n);
  //   await checker.checkUsdcBorrwed(40943193n, 10n);

  //   await increaseBlockTimestamp(4 * 24 * 60 * 60);
  //   console.log('--------------------Time Increased--------------------');
  //   // ETH: $3012.65 BTC: $41382.59
  //  //  await changer.changePriceToken('WBTC', 41382.59);
  //  //  await changer.changePriceToken('WETH', 2000.0);
  //   await changer.changeTargetWeight('WBTC', 18_000);
  //   await changer.changeTargetWeight('WETH', 35_000);

  //   await logger.logGlpPrice();
  //   await logger.logTargetWeights();

  //   await logger.logAavePosition();
  //   await logger.logBorrowParams();
  //   await logger.logProtocolParamsAndHoldings();

  //   // await checker.checkTotalAssets(101630789421417000000n, 10n ** 10n, true);
  //   // await checker.checkTotalSupply(100000000000000000000n, 0, true);
  //   // await checker.checkVaultMktValue(122109738n, 400n);
  //   // await checker.checkBorrowValue(60365153n, 500n);

  //   console.log('--------------------Rebalance--------------------');
  //   tx = await dnGmxJuniorVault.rebalance();
  //   await logger.logGlpRewards(tx);
  //   await logger.logAavePosition();
  //   await logger.logBorrowParams();
  //   await logger.logProtocolParamsAndHoldings();

  //   // await checker.checkTotalAssets(101340176426302000000n, 10n ** 15n, true);
  //   // await checker.checkTotalSupply(100000000000000000000n, 0, true);

  //   // await checker.checkCurrentBorrowed([50796n - 2n, 20436684755889100n], [0n, 10n ** 11n]);
  //   // await checker.checkBorrowValue(61896360n, 800n);
  //   // await checker.checkUsdcBorrwed(47332510n, 300n);
  //   // await checker.checkVaultMktValue(121366195n, 100n);
  // });

  // it('TokenThreshold 3 : BtcWeight Decrease < threshold, EthWeight Decrease < threshold', async () => {
  //   let tx;

  //   const opts = await dnGmxJuniorVaultFixture();
  //   const logger = new Logger(opts);
  //   const changer = new Changer(opts);
  //   const checker = new Checker(opts);

  //   const { dnGmxJuniorVault, dnGmxSeniorVault, glpBatchingManager, users, mocks, aUSDC, gmxVault, lendingPool } = opts;
  //   // await dnGmxJuniorVault.setMocks(mocks.swapRouterMock.address);
  //   // await dnGmxJuniorVault.grantAllowances();

  //   // becauses price are not changed on uniswap
  //   await dnGmxJuniorVault.setThresholds(
  //     100, //slippageThresholdSwapBtcBps
  //     100, //slippageThresholdSwapEthBps
  //     100, //slippageThresholdGmxBps
  //     parseUnits('1', 6), //usdcConversionThreshold
  //     10n ** 15n, //wethConversionThreshold
  //     parseUnits('12', 6), //hedgeUsdcAmountThreshold
  //     parseUnits('1000000', 6), //partialBtcHedgeUsdcAmountThreshold
  //     parseUnits('1000000', 6), //partialEthHedgeUsdcAmountThreshold
  //   );

  //   await dnGmxSeniorVault.connect(users[1]).deposit(parseUnits('150', 6), users[1].address);

  //   // ETH: $2787.23 BTC: $38694.59
  //  //  await changer.changePriceToken('WBTC', 38694.59);
  //  //  await changer.changePriceToken('WETH', 2787.23);
  //   await logger.logGlpPrice();
  //   await logger.logTargetWeights();
  //   await logger.logAavePosition();
  //   await logger.logBorrowParams();

  //   // await changer.changeTargetWeight('WBTC', 20_000, gmxVault);
  //   // await changer.changeTargetWeight('WETH', 20_000, gmxVault);

  //   // await checker.checkTotalAssets(150000000n, 10n ** 15n, false);

  //   // Deposit
  //   console.log('--------------------Initial Deposit--------------------');
  //   const amount = parseEther('100');
  //   tx = await dnGmxJuniorVault.connect(users[0]).deposit(amount, users[0].address);

  //   await logger.logAavePosition(tx);
  //   await logger.logBorrowParams(tx);
  //   await logger.logProtocolParamsAndHoldings();

  //   await checker.checkTotalAssets(99875913146589300000n, 10n ** 10n, true);
  //   await checker.checkTotalSupply(99877139590209400000n, 10n ** 6n, true);
  //   await checker.checkCurrentBorrowed([99971n, 19471978242701800n], [0n, 100n]);
  //   await checker.checkVaultMktValue(93309132n, 0n);
  //   await checker.checkBorrowValue(53541100n, 10n);
  //   await checker.checkUsdcBorrwed(40943193n, 10n);

  //   await increaseBlockTimestamp(4 * 24 * 60 * 60);
  //   console.log('--------------------Time Increased--------------------');
  //   // ETH: $3012.65 BTC: $41382.59
  //  //  await changer.changePriceToken('WBTC', 41382.59);
  //  //  await changer.changePriceToken('WETH', 3012.65);
  //   await changer.changeTargetWeight('WBTC', 22_000);
  //   await changer.changeTargetWeight('WETH', 27_000);

  //   await logger.logGlpPrice();
  //   await logger.logTargetWeights();

  //   await logger.logAavePosition();
  //   await logger.logBorrowParams();
  //   await logger.logProtocolParamsAndHoldings();

  //   // await checker.checkTotalAssets(91102309937418000000n, 10n ** 10n, true);
  //   // await checker.checkTotalSupply(100000000000000000000n, 0, true);
  //   // await checker.checkVaultMktValue(125191487n, 400n);
  //   // await checker.checkBorrowValue(73477704n, 500n);

  //   console.log('--------------------Rebalance--------------------');
  //   tx = await dnGmxJuniorVault.rebalance();
  //   await logger.logGlpRewards(tx);
  //   await logger.logAavePosition();
  //   await logger.logBorrowParams();
  //   await logger.logProtocolParamsAndHoldings();

  //   // await checker.checkTotalAssets(90754554449886000000n, 10n ** 15n, true);
  //   // await checker.checkTotalSupply(100000000000000000000n, 0, true);

  //   // await checker.checkCurrentBorrowed([83287n + 1n, 12948247272272900n], [0, 10n ** 10n]);
  //   // await checker.checkBorrowValue(73477704n, 500n);
  //   // // USDC borrowed from SrTranche is bases optimalBorrowValue & not currentBorrowValue when swapAmount < Threshold
  //   // await checker.checkUsdcBorrwed(46423446n, 100n);
  //   // await checker.checkVaultMktValue(125173267n, 400n);
  // });

  // it('TokenThreshold 4 : BtcWeight Decrease < threshold, EthWeight Decrease > threshold', async () => {
  //   let tx;

  //   const opts = await dnGmxJuniorVaultFixture();
  //   const logger = new Logger(opts);
  //   const changer = new Changer(opts);
  //   const checker = new Checker(opts);

  //   const { dnGmxJuniorVault, dnGmxSeniorVault, glpBatchingManager, users, mocks, aUSDC, gmxVault, lendingPool } = opts;
  //   // await dnGmxJuniorVault.setMocks(mocks.swapRouterMock.address);
  //   // await dnGmxJuniorVault.grantAllowances();

  //   // becauses price are not changed on uniswap
  //   await dnGmxJuniorVault.setThresholds(
  //     100, //slippageThresholdSwapBtcBps
  //     100, //slippageThresholdSwapEthBps
  //     100, //slippageThresholdGmxBps
  //     parseUnits('1', 6), //usdcConversionThreshold
  //     10n ** 15n, //wethConversionThreshold
  //     parseUnits('12', 6), //hedgeUsdcAmountThreshold
  //     parseUnits('1000000', 6), //partialBtcHedgeUsdcAmountThreshold
  //     parseUnits('1000000', 6), //partialEthHedgeUsdcAmountThreshold
  //   );

  //   await dnGmxSeniorVault.connect(users[1]).deposit(parseUnits('150', 6), users[1].address);

  //   // ETH: $2787.23 BTC: $38694.59
  //  //  await changer.changePriceToken('WBTC', 38694.59);
  //  //  await changer.changePriceToken('WETH', 2787.23);
  //   await logger.logGlpPrice();
  //   await logger.logTargetWeights();
  //   await logger.logAavePosition();
  //   await logger.logBorrowParams();

  //   // await checker.checkTotalAssets(150000000n, 10n ** 15n, false);

  //   // Deposit
  //   console.log('--------------------Initial Deposit--------------------');
  //   const amount = parseEther('100');
  //   tx = await dnGmxJuniorVault.connect(users[0]).deposit(amount, users[0].address);

  //   await logger.logAavePosition(tx);
  //   await logger.logBorrowParams(tx);
  //   await logger.logProtocolParamsAndHoldings();

  //   await checker.checkTotalAssets(99875913146589300000n, 10n ** 10n, true);
  //   await checker.checkTotalSupply(99877139590209400000n, 10n ** 6n, true);
  //   await checker.checkCurrentBorrowed([99971n, 19471978242701800n], [0n, 100n]);
  //   await checker.checkVaultMktValue(93309132n, 0n);
  //   await checker.checkBorrowValue(53541100n, 10n);
  //   await checker.checkUsdcBorrwed(40943193n, 10n);

  //   await increaseBlockTimestamp(4 * 24 * 60 * 60);
  //   console.log('--------------------Time Increased--------------------');
  //   // ETH: $3012.65 BTC: $41382.59
  //  //  await changer.changePriceToken('WBTC', 42000.0);
  //  //  await changer.changePriceToken('WETH', 4000.0);
  //   await changer.changeTargetWeight('WBTC', 27_000);
  //   await changer.changeTargetWeight('WETH', 30_000);

  //   await logger.logGlpPrice();
  //   await logger.logTargetWeights();

  //   await logger.logAavePosition();
  //   await logger.logBorrowParams();
  //   await logger.logProtocolParamsAndHoldings();

  //   // await checker.checkTotalAssets(82822900878136100000n, 10n ** 18n, true);
  //   // await checker.checkTotalSupply(100000000000000000000n, 0, true);
  //   // await checker.checkVaultMktValue(128239177n, 10n);
  //   // await checker.checkBorrowValue(86777314n, 30n);

  //   console.log('--------------------Rebalance--------------------');
  //   tx = await dnGmxJuniorVault.rebalance();
  //   await logger.logGlpRewards(tx);
  //   await logger.logAavePosition();
  //   await logger.logBorrowParams();
  //   await logger.logProtocolParamsAndHoldings();

  //   // await checker.checkTotalAssets(82685871897861000000n, 10n ** 16n, true);
  //   // await checker.checkTotalSupply(100000000000000000000n, 0, true);

  //   // await checker.checkCurrentBorrowed([83288n, 8691980640139930n], [0, 10n ** 11n]);
  //   // await checker.checkBorrowValue(69751588n, 300n);
  //   // // // USDC borrowed from SrTranche is bases optimalBorrowValue & not currentBorrowValue when swapAmount < Threshold
  //   // await checker.checkUsdcBorrwed(50516352n, 2000n);
  //   // await checker.checkVaultMktValue(128016451n, 1000n);
  // });

  // it('TokenThreshold 5 : BtcWeight Increase < threshold, EthWeight Increase > threshold', async () => {
  //   let tx;

  //   const opts = await dnGmxJuniorVaultFixture();
  //   const logger = new Logger(opts);
  //   const changer = new Changer(opts);
  //   const checker = new Checker(opts);

  //   const { dnGmxJuniorVault, dnGmxSeniorVault, glpBatchingManager, users, mocks, aUSDC, gmxVault, lendingPool } = opts;
  //   // await dnGmxJuniorVault.setMocks(mocks.swapRouterMock.address);
  //   // await dnGmxJuniorVault.grantAllowances();

  //   // becauses price are not changed on uniswap
  //   await dnGmxJuniorVault.setThresholds(
  //     100, //slippageThresholdSwapBtcBps
  //     100, //slippageThresholdSwapEthBps
  //     100, //slippageThresholdGmxBps
  //     parseUnits('1', 6), //usdcConversionThreshold
  //     10n ** 15n, //wethConversionThreshold
  //     parseUnits('8', 6), //hedgeUsdcAmountThreshold
  //     parseUnits('1000000', 6), //partialBtcHedgeUsdcAmountThreshold
  //     parseUnits('1000000', 6), //partialEthHedgeUsdcAmountThreshold
  //   );

  //   await dnGmxSeniorVault.connect(users[1]).deposit(parseUnits('150', 6), users[1].address);

  //   // ETH: $2787.23 BTC: $38694.59
  //  //  await changer.changePriceToken('WBTC', 38694.59);
  //  //  await changer.changePriceToken('WETH', 2787.23);
  //   await logger.logGlpPrice();
  //   await logger.logTargetWeights();
  //   await logger.logAavePosition();
  //   await logger.logBorrowParams();

  //   // await changer.changeTargetWeight('WBTC', 20_000, gmxVault);
  //   // await changer.changeTargetWeight('WETH', 20_000, gmxVault);

  //   // await checker.checkTotalAssets(150000000n, 10n ** 15n, false);

  //   // Deposit
  //   console.log('--------------------Initial Deposit--------------------');
  //   const amount = parseEther('100');
  //   tx = await dnGmxJuniorVault.connect(users[0]).deposit(amount, users[0].address);

  //   await logger.logAavePosition(tx);
  //   await logger.logBorrowParams(tx);
  //   await logger.logProtocolParamsAndHoldings();

  //   await checker.checkTotalAssets(99875913146589300000n, 10n ** 10n, true);
  //   await checker.checkTotalSupply(99877139590209400000n, 10n ** 6n, true);
  //   await checker.checkCurrentBorrowed([99971n, 19471978242701800n], [0n, 100n]);
  //   await checker.checkVaultMktValue(93309132n, 0n);
  //   await checker.checkBorrowValue(53541100n, 10n);
  //   await checker.checkUsdcBorrwed(40943193n, 10n);

  //   await increaseBlockTimestamp(4 * 24 * 60 * 60);
  //   console.log('--------------------Time Increased--------------------');
  //   // ETH: $3012.65 BTC: $41382.59
  //  //  await changer.changePriceToken('WBTC', 41382.59);
  //  //  await changer.changePriceToken('WETH', 2000.0);
  //   await changer.changeTargetWeight('WBTC', 30_000);
  //   await changer.changeTargetWeight('WETH', 35_000);

  //   await logger.logGlpPrice();
  //   await logger.logTargetWeights();

  //   await logger.logAavePosition();
  //   await logger.logBorrowParams();
  //   await logger.logProtocolParamsAndHoldings();

  //   // await checker.checkTotalAssets(101630789421417000000n, 10n ** 10n, true);
  //   // await checker.checkTotalSupply(100000000000000000000n, 0, true);
  //   // await checker.checkVaultMktValue(122109324n, 400n);
  //   // await checker.checkBorrowValue(60365567n, 500n);

  //   console.log('--------------------Rebalance--------------------');
  //   tx = await dnGmxJuniorVault.rebalance();
  //   await logger.logGlpRewards(tx);
  //   await logger.logAavePosition();
  //   await logger.logBorrowParams();
  //   await logger.logProtocolParamsAndHoldings();

  //   // await checker.checkTotalAssets(100847495127276000000n, 10n ** 16n, true);
  //   // await checker.checkTotalSupply(100000000000000000000n, 0, true);

  //   // await checker.checkCurrentBorrowed([83288n, 18246634786354600n], [0n, 10n ** 11n]);
  //   // await checker.checkBorrowValue(70962753n, 100n);
  //   // await checker.checkUsdcBorrwed(51828585n, 100n);
  //   // await checker.checkVaultMktValue(121544057n, 3000n);
  // });

  it('UnhedgedGlp 1 : Deposit in SrTranche; UnhedgedGlp becomes 0 (Excel)', async () => {
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
      aUSDC,
      gmxVault,
      lendingPool,
      mocks,
      dnGmxTraderHedgeStrategy,
    } = opts;
    await dnGmxJuniorVault.setMocks(mocks.swapRouterMock.address);
    await changer.addLiquidity();
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

    // RebalanceProfit threshold (absolute $ amount)
    await dnGmxJuniorVault.setParamsV1(0n, dnGmxTraderHedgeStrategy.address);

    console.log('--------------------Sr. Tranche Initial Deposit--------------------');
    await dnGmxSeniorVault.connect(users[1]).deposit(parseUnits('60', 6), users[1].address);

    // ETH: $2787.23 BTC: $38694.59
    //  await changer.changePriceToken('WBTC', 38694.59);
    //  await changer.changePriceToken('WETH', 2787.23);
    await logger.logGlpPrice();
    await logger.logTargetWeights();
    await logger.logAavePosition();
    await logger.logBorrowParams();

    // await changer.changeTargetWeight('WBTC', 20_000, gmxVault);
    // await changer.changeTargetWeight('WETH', 20_000, gmxVault);

    // Deposit
    console.log('--------------------Jr. Tranche Initial Deposit--------------------');
    const amount = parseEther('100');
    await dnGmxJuniorVault.connect(users[0]).deposit(amount, users[0].address);

    await logger.logAavePosition();
    await logger.logBorrowParams();
    await logger.logProtocolParamsAndHoldings();

    await checker.checkTotalAssets(99421170542769300000n, 10n ** 12n, true);
    await checker.checkTotalSupply(99432633472683200000n, 10n ** 6n, true);
    await checker.checkCurrentBorrowed([99971n, 19471978242701800n], [0n, 100n]);
    await checker.checkVaultMktValue(92888500n, 0n);
    await checker.checkBorrowValue(53541100n, 10n);
    await checker.checkUsdcBorrwed(40943193n, 10n);

    await increaseBlockTimestamp(4 * 24 * 60 * 60);
    console.log('--------------------Time Increased--------------------');
    // ETH: $3012.65 BTC: $41382.59
    await changer.changePriceToken('WBTC', 23300);
    await changer.changePriceToken('WETH', 1595);
    await logger.logGlpPrice();
    await logger.logTargetWeights();

    await logger.logAavePosition();
    await logger.logBorrowParams();
    await logger.logProtocolParamsAndHoldings();

    await checker.checkTotalAssets(98518263485691100000n, 10n ** 10n, true);
    await checker.checkTotalSupply(99432633472683200000n, 10n ** 6n, true);
    await checker.checkVaultMktValue(91178230n, 10n);
    await checker.checkBorrowValue(54363249n, 10n);

    // New Deposit
    console.log('--------------------Jr. Tranche New Deposit--------------------');
    const amount1 = parseEther('50');
    await dnGmxJuniorVault.connect(users[0]).deposit(amount1, users[0].address);
    await logger.logAavePosition();
    await logger.logBorrowParams();
    await logger.logProtocolParamsAndHoldings();

    await checker.checkTotalAssets(148101856672389000000n, 10n ** 15n, true);
    await checker.checkTotalSupply(149630714840408000000n, 10n ** 12n, true);
    await checker.checkCurrentBorrowed([144353n - 1n, 28116385489937200n], [0, 10n ** 10n]);
    await checker.checkVaultMktValue(137201587n, 10000n);
    await checker.checkBorrowValue(78474011n, 300n);
    await checker.checkUsdcBorrwed(60009537n, 15n);

    console.log('--------------------Time Increased--------------------');
    await increaseBlockTimestamp(60);
    // ETH: $3012.65 BTC: $41382.59
    //  await changer.changePriceToken('WBTC', 41382.59);
    //  await changer.changePriceToken('WETH', 3012.65);
    await logger.logGlpPrice();
    await logger.logTargetWeights();

    await logger.logAavePosition();
    await logger.logBorrowParams();
    await logger.logProtocolParamsAndHoldings();

    await checker.checkTotalAssets(148101853975229000000n, 10n ** 16n, true);
    await checker.checkTotalSupply(149630714840408000000n, 10n ** 15n, true);
    await checker.checkBorrowValue(78474014n, 200n);

    console.log('--------------------Sr. Tranche New Deposit--------------------');
    await dnGmxSeniorVault.connect(users[1]).deposit(parseUnits('40', 6), users[1].address);

    // ETH: $2787.23 BTC: $38694.59
    //  await changer.changePriceToken('WBTC', 41382.59);
    //  await changer.changePriceToken('WETH', 3012.65);
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

    await checker.checkTotalAssets(148110047133365000000n, 10n ** 14n, true);
    await checker.checkTotalSupply(149630714840408000000n, 10n ** 10n, true);
    await checker.checkCurrentBorrowed([148059n, 28838360783094500n], [0, 10n ** 10n]);
    await checker.checkBorrowValue(80488994n, 100n);
    await checker.checkUsdcBorrwed(61550406n, 100n);
    await checker.checkVaultMktValue(136790113n, 10n ** 16n);
  });

  it('UnhedgedGlp 2 : Withdraw from JrTranche; UnhedgedGlp becomes 0 (Excel)', async () => {
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
      aUSDC,
      gmxVault,
      lendingPool,
      mocks,
      dnGmxTraderHedgeStrategy,
    } = opts;
    await dnGmxJuniorVault.setMocks(mocks.swapRouterMock.address);
    await changer.addLiquidity();
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

    // RebalanceProfit threshold (absolute $ amount)
    await dnGmxJuniorVault.setParamsV1(0n, dnGmxTraderHedgeStrategy.address);

    console.log('--------------------Sr. Tranche Initial Deposit--------------------');
    await dnGmxSeniorVault.connect(users[1]).deposit(parseUnits('60', 6), users[1].address);

    // ETH: $2787.23 BTC: $38694.59
    //  await changer.changePriceToken('WBTC', 38694.59);
    //  await changer.changePriceToken('WETH', 2787.23);
    await logger.logGlpPrice();
    await logger.logTargetWeights();
    await logger.logAavePosition();
    await logger.logBorrowParams();

    // await changer.changeTargetWeight('WBTC', 20_000, gmxVault);
    // await changer.changeTargetWeight('WETH', 20_000, gmxVault);

    // Deposit
    console.log('--------------------Jr. Tranche Initial Deposit--------------------');
    const amount = parseEther('100');
    await dnGmxJuniorVault.connect(users[0]).deposit(amount, users[0].address);

    await logger.logAavePosition();
    await logger.logBorrowParams();
    await logger.logProtocolParamsAndHoldings();

    await checker.checkTotalAssets(99421170542769300000n, 10n ** 12n, true);
    await checker.checkTotalSupply(99432633472683200000n, 10n ** 6n, true);
    await checker.checkCurrentBorrowed([99971n, 19471978242701800n], [0n, 100n]);
    await checker.checkVaultMktValue(92888500n, 0n);
    await checker.checkBorrowValue(53541100n, 10n);
    await checker.checkUsdcBorrwed(40943193n, 10n);

    await increaseBlockTimestamp(4 * 24 * 60 * 60);
    console.log('--------------------Time Increased--------------------');
    // ETH: $3012.65 BTC: $41382.59
    await changer.changePriceToken('WBTC', 23300);
    await changer.changePriceToken('WETH', 1595);
    await logger.logGlpPrice();
    await logger.logTargetWeights();

    await logger.logAavePosition();
    await logger.logBorrowParams();
    await logger.logProtocolParamsAndHoldings();

    await checker.checkTotalAssets(98518263485691100000n, 10n ** 10n, true);
    await checker.checkTotalSupply(99432633472683200000n, 10n ** 6n, true);
    await checker.checkVaultMktValue(91178230n, 10n);
    await checker.checkBorrowValue(54363249n, 10n);

    // New Deposit
    console.log('--------------------Jr. Tranche New Deposit--------------------');
    const amount1 = parseEther('50');
    await dnGmxJuniorVault.connect(users[0]).deposit(amount1, users[0].address);
    await logger.logAavePosition();
    await logger.logBorrowParams();
    await logger.logProtocolParamsAndHoldings();

    await checker.checkTotalAssets(148101856672389000000n, 10n ** 15n, true);
    await checker.checkTotalSupply(149630714840408000000n, 10n ** 12n, true);
    await checker.checkCurrentBorrowed([144353n - 1n, 28116385489937200n], [0, 10n ** 10n]);
    await checker.checkVaultMktValue(137201587n, 10000n);
    await checker.checkBorrowValue(78474011n, 300n);
    await checker.checkUsdcBorrwed(60009537n, 15n);

    console.log('--------------------Time Increased--------------------');
    await increaseBlockTimestamp(60);
    // ETH: $3012.65 BTC: $41382.59
    //  await changer.changePriceToken('WBTC', 41382.59);
    //  await changer.changePriceToken('WETH', 3012.65);
    await logger.logGlpPrice();
    await logger.logTargetWeights();

    await logger.logAavePosition();
    await logger.logBorrowParams();
    await logger.logProtocolParamsAndHoldings();

    await checker.checkTotalAssets(148101853975229000000n, 10n ** 16n, true);
    await checker.checkTotalSupply(149630714840408000000n, 10n ** 15n, true);
    await checker.checkBorrowValue(78474014n, 200n);

    console.log('--------------------Jr. Tranche Partial Withdraw--------------------');
    const amount2 = parseEther('15');
    await dnGmxJuniorVault.connect(users[0]).withdraw(amount2, users[0].address, users[0].address);

    // ETH: $2787.23 BTC: $38694.59
    //  await changer.changePriceToken('WBTC', 41382.59);
    //  await changer.changePriceToken('WETH', 3012.65);
    await logger.logGlpPrice();
    await logger.logTargetWeights();
    await logger.logAavePosition();
    await logger.logBorrowParams();
    await logger.logProtocolParamsAndHoldings();

    await checker.checkTotalAssets(133065061122119000000n, 10n ** 14n, true);
    await checker.checkTotalSupply(134541240977353000000n, 10n ** 10n, true);
    await checker.checkCurrentBorrowed([133063n, 25917564134254300n], [0, 10n ** 12n]);
    await checker.checkVaultMktValue(123135866n, 100n);
    await checker.checkBorrowValue(72336855n, 100n);
    await checker.checkUsdcBorrwed(55316418n, 100n);
  });

  it('UnhedgedGlp 3 : Withdraw from JrTranche; UnhedgedGlp reduces (Excel)', async () => {
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
      aUSDC,
      gmxVault,
      lendingPool,
      mocks,
      dnGmxTraderHedgeStrategy,
    } = opts;
    await dnGmxJuniorVault.setMocks(mocks.swapRouterMock.address);
    await changer.addLiquidity();
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

    // RebalanceProfit threshold (absolute $ amount)
    await dnGmxJuniorVault.setParamsV1(0n, dnGmxTraderHedgeStrategy.address);

    console.log('--------------------Sr. Tranche Initial Deposit--------------------');
    await dnGmxSeniorVault.connect(users[1]).deposit(parseUnits('60', 6), users[1].address);

    // ETH: $2787.23 BTC: $38694.59
    //  await changer.changePriceToken('WBTC', 38694.59);
    //  await changer.changePriceToken('WETH', 2787.23);
    await logger.logGlpPrice();
    await logger.logTargetWeights();
    await logger.logAavePosition();
    await logger.logBorrowParams();

    // await changer.changeTargetWeight('WBTC', 20_000, gmxVault);
    // await changer.changeTargetWeight('WETH', 20_000, gmxVault);

    // Deposit
    console.log('--------------------Jr. Tranche Initial Deposit--------------------');
    const amount = parseEther('100');
    await dnGmxJuniorVault.connect(users[0]).deposit(amount, users[0].address);

    await logger.logAavePosition();
    await logger.logBorrowParams();
    await logger.logProtocolParamsAndHoldings();

    await checker.checkTotalAssets(99421170542769300000n, 10n ** 12n, true);
    await checker.checkTotalSupply(99432633472683200000n, 10n ** 6n, true);
    await checker.checkCurrentBorrowed([99971n, 19471978242701800n], [0n, 100n]);
    await checker.checkVaultMktValue(92888500n, 0n);
    await checker.checkBorrowValue(53541100n, 10n);
    await checker.checkUsdcBorrwed(40943193n, 10n);

    await increaseBlockTimestamp(4 * 24 * 60 * 60);
    console.log('--------------------Time Increased--------------------');
    // ETH: $3012.65 BTC: $41382.59
    await changer.changePriceToken('WBTC', 23300);
    await changer.changePriceToken('WETH', 1595);
    await logger.logGlpPrice();
    await logger.logTargetWeights();

    await logger.logAavePosition();
    await logger.logBorrowParams();
    await logger.logProtocolParamsAndHoldings();

    await checker.checkTotalAssets(98518263485691100000n, 10n ** 10n, true);
    await checker.checkTotalSupply(99432633472683200000n, 10n ** 6n, true);
    await checker.checkVaultMktValue(91178230n, 10n);
    await checker.checkBorrowValue(54363249n, 10n);

    // New Deposit
    console.log('--------------------Jr. Tranche New Deposit--------------------');
    const amount1 = parseEther('50');
    await dnGmxJuniorVault.connect(users[0]).deposit(amount1, users[0].address);
    await logger.logAavePosition();
    await logger.logBorrowParams();
    await logger.logProtocolParamsAndHoldings();

    await checker.checkTotalAssets(148101856672389000000n, 10n ** 15n, true);
    await checker.checkTotalSupply(149630714840408000000n, 10n ** 12n, true);
    await checker.checkCurrentBorrowed([144353n - 1n, 28116385489937200n], [0, 10n ** 10n]);
    await checker.checkVaultMktValue(137201587n, 10000n);
    await checker.checkBorrowValue(78474011n, 300n);
    await checker.checkUsdcBorrwed(60009537n, 15n);

    console.log('--------------------Time Increased--------------------');
    await increaseBlockTimestamp(60);
    // ETH: $3012.65 BTC: $41382.59
    //  await changer.changePriceToken('WBTC', 41382.59);
    //  await changer.changePriceToken('WETH', 3012.65);
    await logger.logGlpPrice();
    await logger.logTargetWeights();

    await logger.logAavePosition();
    await logger.logBorrowParams();
    await logger.logProtocolParamsAndHoldings();

    await checker.checkTotalAssets(148101853975229000000n, 10n ** 16n, true);
    await checker.checkTotalSupply(149630714840408000000n, 10n ** 15n, true);
    await checker.checkBorrowValue(78474014n, 200n);

    console.log('--------------------Jr. Tranche Partial Withdraw--------------------');
    const amount2 = parseEther('2');
    await dnGmxJuniorVault.connect(users[0]).withdraw(amount2, users[0].address, users[0].address);

    // ETH: $2787.23 BTC: $38694.59
    //  await changer.changePriceToken('WBTC', 41382.59);
    //  await changer.changePriceToken('WETH', 3012.65);
    await logger.logGlpPrice();
    await logger.logTargetWeights();
    await logger.logAavePosition();
    await logger.logBorrowParams();
    await logger.logProtocolParamsAndHoldings();

    await checker.checkTotalAssets(146119371368963000000n, 10n ** 14n, true);
    await checker.checkTotalSupply(147610068785375000000n, 10n ** 10n, true);
    await checker.checkCurrentBorrowed([144353n - 1n, 28116387242562800n], [0, 10n ** 12n]);
    await checker.checkVaultMktValue(135284532n, 10000n);
    await checker.checkBorrowValue(78474014n, 200n);
    await checker.checkUsdcBorrwed(60009540n, 100n);
  });

  // it('Large TVL : Swap Liquidity (Excel)', async () => {
  //   let tx;

  //   const opts = await dnGmxJuniorVaultFixture();
  //   const logger = new Logger(opts);
  //   const changer = new Changer(opts);
  //   const checker = new Checker(opts);

  //   const {
  //     dnGmxJuniorVault,
  //     dnGmxSeniorVault,
  //     glpBatchingManager,
  //     users,
  //     mocks,
  //     aUSDC,
  //     gmxVault,
  //     lendingPool,
  //     mintBurnRouter,
  //   } = opts;
  //   // await dnGmxJuniorVault.setMocks(mocks.swapRouterMock.address);
  //   // await dnGmxJuniorVault.grantAllowances();
  //   await mintBurnRouter.connect(users[0]).mintAndStakeGlpETH(0, 0, {
  //     value: parseEther('1000'),
  //   });
  //   await increaseBlockTimestamp(15 * 60);

  //   // becauses price are not changed on uniswap
  //   await dnGmxJuniorVault.setThresholds(
  //     100, //slippageThresholdSwapBtcBps
  //     100, //slippageThresholdSwapEthBps
  //     100, //slippageThresholdGmxBps
  //     parseUnits('1', 6), //usdcConversionThreshold
  //     10n ** 15n, //wethConversionThreshold
  //     0, //hedgeUsdcAmountThreshold
  //     parseUnits('1000000', 6), //partialBtcHedgeUsdcAmountThreshold
  //     parseUnits('1000000', 6), //partialEthHedgeUsdcAmountThreshold
  //   );

  //   await dnGmxSeniorVault.connect(users[1]).deposit(parseUnits('800000', 6), users[1].address);

  //   // ETH: $2787.23 BTC: $38694.59
  //  //  await changer.changePriceToken('WBTC', 38694.59);
  //  //  await changer.changePriceToken('WETH', 2787.23);
  //   await logger.logGlpPrice();
  //   await logger.logTargetWeights();
  //   await logger.logAavePosition();
  //   await logger.logBorrowParams();

  //   // await changer.changeTargetWeight('WBTC', 20_000, gmxVault);
  //   // await changer.changeTargetWeight('WETH', 20_000, gmxVault);

  //   // Deposit
  //   console.log('--------------------Initial Deposit--------------------');
  //   const amount = parseEther('1000000');
  //   tx = await dnGmxJuniorVault.connect(users[0]).deposit(amount, users[0].address);

  //   await logger.logAavePosition(tx);
  //   await logger.logBorrowParams(tx);
  //   await logger.logProtocolParamsAndHoldings();

  //   // await checker.checkTotalAssets(980684840574419000000000n, 10n ** 20n, true);
  //   // await checker.checkTotalSupply(1000000000000000000000000n, 0, true);
  //   // await checker.checkCurrentBorrowed([833855646n, 129654124791043000000n], [200n, 3n * 10n ** 13n]);
  //   // await checker.checkVaultMktValue(1283800405689n, 3n * 10n ** 5n);
  //   // await checker.checkBorrowValue(684059431175, 2n * 10n ** 5n);
  //   // await checker.checkUsdcBorrwed(523104270898n, 3n * 10n ** 5n);

  //   await increaseBlockTimestamp(4 * 24 * 60 * 60);
  //   console.log('--------------------Time Increased--------------------');
  //   // ETH: $3012.65 BTC: $41382.59
  //   // await changer.changePriceToken('WBTC', 22900);
  //   // await changer.changePriceToken('WETH', 1580);

  //   await logger.logGlpPrice();
  //   await logger.logTargetWeights();

  //   await logger.logAavePosition();
  //   await logger.logBorrowParams();
  //   await logger.logProtocolParamsAndHoldings();

  //   // await checker.checkTotalAssets(910895125295437000000000n, 10n ** 21n, true);
  //   // await checker.checkTotalSupply(1000000000000000000000000n, 0, true);
  //   // await checker.checkVaultMktValue(1253921555799n, 4n * 10n ** 5n);
  //   // await checker.checkBorrowValue(735929281065n, 2n * 10n ** 5n);

  //   console.log('--------------------Rebalance--------------------');
  //   tx = await dnGmxJuniorVault.rebalance();
  //   await logger.logGlpRewards(tx);
  //   await logger.logAavePosition();
  //   await logger.logBorrowParams();
  //   await logger.logProtocolParamsAndHoldings();

  //   // await checker.checkTotalAssets(913670117425551000000000n, 10n ** 18n, true);
  //   // await checker.checkTotalSupply(1000000000000000000000000n, 0, true);

  //   // await checker.checkCurrentBorrowed([719786961n, 110736549409321000000n], [2000n, 10n ** 16n]);
  //   // await checker.checkVaultMktValue(1252703518944n, 10n ** 9n);
  //   // await checker.checkBorrowValue(631501454956n, 10n ** 7n);
  //   // await checker.checkUsdcBorrwed(482912877319n, 10n ** 7n);
  // });

  // it('Rebalance Partial (Excel)', async () => {
  //   let tx;

  //   const opts = await dnGmxJuniorVaultFixture();
  //   const logger = new Logger(opts);
  //   const changer = new Changer(opts);
  //   const checker = new Checker(opts);

  //   const { dnGmxJuniorVault, dnGmxSeniorVault, glpBatchingManager, users, mocks, aUSDC, gmxVault, lendingPool } = opts;
  //   // await dnGmxJuniorVault.setMocks(mocks.swapRouterMock.address);
  //   // await dnGmxJuniorVault.grantAllowances();

  //   // becauses price are not changed on uniswap
  //   await dnGmxJuniorVault.setThresholds(
  //     100, //slippageThresholdSwapBtcBps
  //     100, //slippageThresholdSwapEthBps
  //     100, //slippageThresholdGmxBps
  //     parseUnits('1', 6), //usdcConversionThreshold
  //     10n ** 15n, //wethConversionThreshold
  //     0, //hedgeUsdcAmountThreshold
  //     parseUnits('5', 6), //partialBtcHedgeUsdcAmountThreshold
  //     parseUnits('5', 6), //partialEthHedgeUsdcAmountThreshold
  //   );

  //   await dnGmxJuniorVault.setRebalanceParams(
  //     86400, // rebalanceTimeThreshold
  //     500, // 5% in bps | rebalanceDeltaThresholdBps
  //     10_000,
  //   );

  //   await dnGmxSeniorVault.connect(users[1]).deposit(parseUnits('150', 6), users[1].address);

  //   // ETH: $2787.23 BTC: $38694.59
  //  //  await changer.changePriceToken('WBTC', 38694.59);
  //  //  await changer.changePriceToken('WETH', 2787.23);
  //   await logger.logGlpPrice();
  //   await logger.logTargetWeights();
  //   await logger.logAavePosition();
  //   await logger.logBorrowParams();

  //   // await changer.changeTargetWeight('WBTC', 20_000, gmxVault);
  //   // await changer.changeTargetWeight('WETH', 20_000, gmxVault);

  //   // Deposit
  //   console.log('--------------------Initial Deposit--------------------');
  //   const amount = parseEther('100');
  //   tx = await dnGmxJuniorVault.connect(users[0]).deposit(amount, users[0].address);

  //   await logger.logAavePosition(tx);
  //   await logger.logBorrowParams(tx);
  //   await logger.logProtocolParamsAndHoldings();

  //   await checker.checkTotalAssets(99875913146589300000n, 10n ** 10n, true);
  //   await checker.checkTotalSupply(99877139590209400000n, 10n ** 6n, true);
  //   await checker.checkCurrentBorrowed([99971n, 19471978242701800n], [0n, 100n]);
  //   await checker.checkVaultMktValue(93309132n, 0n);
  //   await checker.checkBorrowValue(53541100n, 10n);
  //   await checker.checkUsdcBorrwed(40943193n, 10n);

  //   console.log('--------------------Time Increased--------------------');
  //   await increaseBlockTimestamp(4 * 24 * 60 * 60);

  //  //  await changer.changePriceToken('WBTC', 52000.0);
  //  //  await changer.changePriceToken('WETH', 3750.0);

  //   await logger.logGlpPrice();
  //   await logger.logTargetWeights();

  //   await logger.logAavePosition();
  //   await logger.logBorrowParams();
  //   await logger.logProtocolParamsAndHoldings();

  //   // await checker.checkTotalAssets(79977047008634600000n, 10n ** 6n, true);
  //   // await checker.checkTotalSupply(100000000000000000000n, 0, true);
  //   // await checker.checkVaultMktValue(128179441n, 100n);
  //   // await checker.checkBorrowValue(91869250n, 100n);

  //   console.log('-------------------- Rebalance 1 --------------------');
  //   tx = await dnGmxJuniorVault.rebalance();
  //   await logger.logGlpRewards(tx);
  //   await logger.logAavePosition();
  //   await logger.logBorrowParams();
  //   await logger.logProtocolParamsAndHoldings();

  //   // await checker.checkTotalAssets(79200296548117900000n, 10n ** 16n, true);
  //   // await checker.checkTotalSupply(100000000000000000000n, 0, true);

  //   // await checker.checkCurrentBorrowed([73673n - 1n, 11614913837155700n], [0, 10n ** 11n]);
  //   // await checker.checkVaultMktValue(128011123n, 2000n);
  //   // await checker.checkBorrowValue(81869062n, 400n);
  //   // await checker.checkUsdcBorrwed(62605753n, 200n);

  //   console.log('-------------------- Rebalance 2 --------------------');
  //   tx = await dnGmxJuniorVault.rebalance();
  //   await logger.logGlpRewards(tx);
  //   await logger.logAavePosition();
  //   await logger.logBorrowParams();
  //   await logger.logProtocolParamsAndHoldings();

  //   // await checker.checkTotalAssets(79724841888995800000n, 10n ** 16n, true);
  //   // await checker.checkTotalSupply(100000000000000000000n, 0, true);

  //   // await checker.checkCurrentBorrowed([64058n - 1n, 10281580503822300n], [0, 10n ** 12n]);
  //   // await checker.checkVaultMktValue(127911124n, 2000n);
  //   // await checker.checkBorrowValue(71868874n, 200n);
  //   // await checker.checkUsdcBorrwed(54958550n, 100n);

  //   console.log('-------------------- Rebalance 3 --------------------');
  //   tx = await dnGmxJuniorVault.rebalance();
  //   await logger.logGlpRewards(tx);
  //   await logger.logAavePosition();
  //   await logger.logBorrowParams();
  //   await logger.logProtocolParamsAndHoldings();

  //   // await checker.checkTotalAssets(80115731687167800000n, 10n ** 16n, true);
  //   // await checker.checkTotalSupply(100000000000000000000n, 0, true);

  //   // await checker.checkCurrentBorrowed([58425n + 1n, 9073720420923560n], [0, 10n ** 11n]);
  //   // await checker.checkVaultMktValue(127836025n, 2000n);
  //   // await checker.checkBorrowValue(64409710n, 2000n);
  //   // await checker.checkUsdcBorrwed(49254484n, 500n);

  //   console.log('-------------------- Rebalance 4 --------------------');
  //   await expect(dnGmxJuniorVault.rebalance()).to.be.revertedWithCustomError(dnGmxJuniorVault, 'InvalidRebalance');
  // });

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
      mintBurnRouter,
      dnGmxTraderHedgeStrategy,
    } = opts;
    await dnGmxJuniorVault.setMocks(mocks.swapRouterMock.address);
    await changer.addLiquidity();
    await dnGmxJuniorVault.grantAllowances();

    await dnGmxJuniorVault.setAdminParams(admin.address, dnGmxSeniorVault.address, ethers.constants.MaxUint256, 0, 500);
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

    // RebalanceProfit threshold (absolute $ amount)
    await dnGmxJuniorVault.setParamsV1(0n, dnGmxTraderHedgeStrategy.address);

    await sGlp.connect(users[2]).approve(dnGmxJuniorVault.address, ethers.constants.MaxUint256);

    await mintBurnRouter.connect(users[0]).mintAndStakeGlpETH(0, 0, {
      value: parseEther('1000'),
    });
    await increaseBlockTimestamp(15 * 60);
    await mintBurnRouter.connect(users[2]).mintAndStakeGlpETH(0, 0, {
      value: parseEther('1000'),
    });
    await increaseBlockTimestamp(15 * 60);

    await dnGmxSeniorVault.connect(users[1]).deposit(parseUnits('800000', 6), users[1].address);

    // ETH: $2787.23 BTC: $38694.59
    //  await changer.changePriceToken('WBTC', 38694.59);
    //  await changer.changePriceToken('WETH', 2787.23);
    await logger.logGlpPrice();
    await logger.logTargetWeights();
    await logger.logAavePosition();
    await logger.logBorrowParams();

    // await changer.changeTargetWeight('WBTC', 20_000, gmxVault);
    // await changer.changeTargetWeight('WETH', 20_000, gmxVault);

    // Deposit
    console.log('--------------------User0 Initial Deposit--------------------');
    const amount = parseEther('1000000');
    await dnGmxJuniorVault.connect(users[0]).deposit(amount, users[0].address);

    let shares0 = await dnGmxJuniorVault.balanceOf(users[0].address); // gives shares of 0
    let assets0 = await dnGmxJuniorVault.convertToAssets(shares0); // gives asset of user 0
    console.log('User 0 : Assets & Shares ', formatEther(assets0), formatEther(shares0));

    await logger.logAavePosition();
    await logger.logBorrowParams();
    await logger.logProtocolParamsAndHoldings();

    await checker.checkTotalAssets(994178453231781000000000n, 10n ** 19n, true);
    await checker.checkTotalSupply(994293731385785000000000n, 10n ** 19n, true);
    await checker.checkCurrentBorrowed([992049845n, 197790886239297000000n], [1000n, 10n ** 10n]);
    await checker.checkVaultMktValue(928862175387n, 10n ** 6n);
    await checker.checkBorrowValue(538491398501n, 10n ** 6n);
    await checker.checkUsdcBorrwed(411787540029n, 10n ** 6n);

    await increaseBlockTimestamp(4 * 24 * 60 * 60);
    console.log('--------------------Time Increased--------------------');
    shares0 = await dnGmxJuniorVault.balanceOf(users[0].address); // gives shares of 0
    assets0 = await dnGmxJuniorVault.convertToAssets(shares0); // gives asset of user 0
    console.log('User 0 : Assets & Shares ', formatEther(assets0), formatEther(shares0));

    await changer.changePriceToken('WBTC', 23300);
    await changer.changePriceToken('WETH', 1595);
    await logger.logGlpPrice();
    await logger.logTargetWeights();

    await logger.logAavePosition();
    await logger.logBorrowParams();
    await logger.logProtocolParamsAndHoldings();

    await checker.checkTotalAssets(985095159547403000000000n, 10n ** 19n, true);
    await checker.checkTotalSupply(994293731385785000000000n, 10n ** 19n, true);
    await checker.checkVaultMktValue(911526031925n, 10n ** 6n);
    await checker.checkBorrowValue(546759600949n, 10n ** 6n);

    // New Deposit
    console.log('--------------------User2 Initial Deposit--------------------');
    const amount1 = parseEther('500000');
    await dnGmxJuniorVault.connect(users[2]).deposit(amount1, users[2].address);

    shares0 = await dnGmxJuniorVault.balanceOf(users[0].address); // gives shares of 0
    assets0 = await dnGmxJuniorVault.convertToAssets(shares0); // gives asset of user 0
    console.log('User 0 : Assets & Shares ', formatEther(assets0), formatEther(shares0));

    let shares2 = await dnGmxJuniorVault.balanceOf(users[2].address); // gives shares of 0
    let assets2 = await dnGmxJuniorVault.convertToAssets(shares2); // gives asset of user 0
    console.log('User 2 : Assets & Shares ', formatEther(assets2), formatEther(shares2));

    await logger.logAavePosition();
    await logger.logBorrowParams();
    await logger.logProtocolParamsAndHoldings();

    await checker.checkTotalAssets(1482624471251770000000000n, 10n ** 19n, true);
    await checker.checkTotalSupply(1495880989287590000000000n, 10n ** 19n, true);
    await checker.checkCurrentBorrowed([1473758445n, 293831998731937000000n], [1000n, 10n ** 15n]);
    await checker.checkVaultMktValue(1371720141925n, 10n ** 6n);
    await checker.checkBorrowValue(811987847198n, 10n ** 6n);
    await checker.checkUsdcBorrwed(620931883151n, 10n ** 6n);

    console.log('--------------------Time Increased--------------------');
    await increaseBlockTimestamp(4 * 24 * 60 * 60);
    shares0 = await dnGmxJuniorVault.balanceOf(users[0].address); // gives shares of 0
    assets0 = await dnGmxJuniorVault.convertToAssets(shares0); // gives asset of user 0
    console.log('User 0 : Assets & Shares ', formatEther(assets0), formatEther(shares0));

    shares2 = await dnGmxJuniorVault.balanceOf(users[2].address); // gives shares of 0
    assets2 = await dnGmxJuniorVault.convertToAssets(shares2); // gives asset of user 0
    console.log('User 2 : Assets & Shares ', formatEther(assets2), formatEther(shares2));

    await changer.changePriceToken('WBTC', 22500);
    await changer.changePriceToken('WETH', 1550);

    await logger.logGlpPrice();
    await logger.logTargetWeights();

    await logger.logAavePosition();
    await logger.logBorrowParams();
    await logger.logProtocolParamsAndHoldings();

    await checker.checkTotalAssets(1509355733682100000000000n, 10n ** 19n, true);
    await checker.checkTotalSupply(1495880987382540000000000n, 10n ** 19n, true);
    await checker.checkVaultMktValue(1385482876235n, 10n ** 6n);
    await checker.checkBorrowValue(787238883957n, 10n ** 6n);

    console.log('--------------------Time Based Rebalance--------------------');
    tx = await dnGmxJuniorVault.rebalance();
    shares0 = await dnGmxJuniorVault.balanceOf(users[0].address); // gives shares of 0
    assets0 = await dnGmxJuniorVault.convertToAssets(shares0); // gives asset of user 0
    console.log('User 0 : Assets & Shares ', formatEther(assets0), formatEther(shares0));

    shares2 = await dnGmxJuniorVault.balanceOf(users[2].address); // gives shares of 0
    assets2 = await dnGmxJuniorVault.convertToAssets(shares2); // gives asset of user 0
    console.log('User 2 : Assets & Shares ', formatEther(assets2), formatEther(shares2));

    await logger.logGlpRewards(tx);
    await logger.logAavePosition();
    await logger.logBorrowParams();
    await logger.logProtocolParamsAndHoldings();

    await checker.checkTotalAssets(1508745192861260000000000n, 10n ** 19n, true);
    await checker.checkTotalSupply(1495880987382540000000000n, 10n ** 19n, true);

    await checker.checkCurrentBorrowed([1496850874n, 298436756009484000000n], [1000n, 10n ** 16n]);
    await checker.checkVaultMktValue(1384704000178n, 10n ** 6n);
    await checker.checkBorrowValue(799309445413n, 10n ** 6n);
    await checker.checkUsdcBorrwed(611236634727n, 10n ** 6n);

    console.log('--------------------Time Increased--------------------');
    await increaseBlockTimestamp(4 * 24 * 60 * 60);

    shares0 = await dnGmxJuniorVault.balanceOf(users[0].address); // gives shares of 0
    assets0 = await dnGmxJuniorVault.convertToAssets(shares0); // gives asset of user 0
    console.log('User 0 : Assets & Shares ', formatEther(assets0), formatEther(shares0));

    shares2 = await dnGmxJuniorVault.balanceOf(users[2].address); // gives shares of 0
    assets2 = await dnGmxJuniorVault.convertToAssets(shares2); // gives asset of user 0
    console.log('User 2 : Assets & Shares ', formatEther(assets2), formatEther(shares2));

    await changer.changePriceToken('WBTC', 22900);
    await changer.changePriceToken('WETH', 1575);
    await logger.logGlpPrice();
    await logger.logTargetWeights();

    await logger.logAavePosition();
    await logger.logBorrowParams();
    await logger.logProtocolParamsAndHoldings();

    await checker.checkTotalAssets(1493712252204410000000000n, 10n ** 19n, true);
    await checker.checkTotalSupply(1495880987382540000000000n, 10n ** 19n, true);
    await checker.checkVaultMktValue(1376829898086n, 10n ** 6n);
    await checker.checkBorrowValue(813027504870n, 10n ** 6n);

    console.log('--------------------User2 Full Withdraw--------------------');
    const amount2 = dnGmxJuniorVault.balanceOf(users[2].address);
    await dnGmxJuniorVault.connect(users[2]).redeem(amount2, users[2].address, users[2].address);

    shares0 = await dnGmxJuniorVault.balanceOf(users[0].address); // gives shares of 0
    assets0 = await dnGmxJuniorVault.convertToAssets(shares0); // gives asset of user 0
    console.log('User 0 : Assets & Shares ', formatEther(assets0), formatEther(shares0));

    shares2 = await dnGmxJuniorVault.balanceOf(users[2].address); // gives shares of 0
    assets2 = await dnGmxJuniorVault.convertToAssets(shares2); // gives asset of user 0
    console.log('User 2 : Assets & Shares ', formatEther(assets2), formatEther(shares2));

    await logger.logAavePosition();
    await logger.logBorrowParams();
    await logger.logProtocolParamsAndHoldings();

    await checker.checkTotalAssets(992919558807615000000000n, 5n * 10n ** 23n, true);
    await checker.checkTotalSupply(994293731385785000000000n, 10n ** 19n, true);
    await checker.checkCurrentBorrowed([988010033n, 196985894983052000000n], [1000n, 10n ** 19n]);
    await checker.checkVaultMktValue(915132902133n, 10n ** 10n);
    await checker.checkBorrowValue(536467501582n, 10n ** 6n);
    await checker.checkUsdcBorrwed(410239854150n, 10n ** 6n);
  });

  it('RebalanceProfit < Threshold; Aave HF < Threshold (Excel)', async () => {
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
      dnGmxTraderHedgeStrategy,
    } = opts;
    await dnGmxJuniorVault.setMocks(mocks.swapRouterMock.address);
    await changer.addLiquidity();
    await dnGmxJuniorVault.grantAllowances();

    // becauses price are not changed on uniswap
    await dnGmxJuniorVault.setThresholds(
      100, //slippageThresholdSwapBtcBps
      100, //slippageThresholdSwapEthBps
      100, //slippageThresholdGmxBps
      parseUnits('10', 6), //usdcConversionThreshold
      10n ** 15n, //wethConversionThreshold
      0, //hedgeUsdcAmountThreshold
      parseUnits('1000000', 6), //partialBtcHedgeUsdcAmountThreshold
      parseUnits('1000000', 6), //partialEthHedgeUsdcAmountThreshold
    );

    // RebalanceProfit threshold (absolute $ amount)
    await (await dnGmxJuniorVault.setParamsV1(20000000n, dnGmxTraderHedgeStrategy.address)).wait();

    await dnGmxSeniorVault.connect(users[1]).deposit(parseUnits('150', 6), users[1].address);

    // ETH: $2787.23 BTC: $38694.59
    //  await changer.changePriceToken('WBTC', 38694.59);
    //  await changer.changePriceToken('WETH', 2787.23);
    await logger.logGlpPrice();
    await logger.logTargetWeights();
    await logger.logAavePosition();
    await logger.logBorrowParams();

    // await changer.changeTargetWeight('WBTC', 20_000, gmxVault);
    // await changer.changeTargetWeight('WETH', 20_000, gmxVault);

    // // await checker.checkTotalAssets(150000000n, 10n ** 15n, false);

    // Deposit
    console.log('--------------------Initial Deposit--------------------');
    const amount = parseEther('100');
    tx = await dnGmxJuniorVault.connect(users[0]).deposit(amount, users[0].address);

    await logger.logAavePosition(tx);
    await logger.logBorrowParams(tx);
    await logger.logProtocolParamsAndHoldings();

    await checker.checkTotalAssets(99421170542769300000n, 10n ** 10n, true);
    await checker.checkTotalSupply(99432633472683200000n, 10n ** 6n, true);
    await checker.checkCurrentBorrowed([99971n, 19471978242701800n], [0n, 100n]);
    await checker.checkVaultMktValue(92888500n, 0n);
    await checker.checkBorrowValue(53541100n, 10n);
    await checker.checkUsdcBorrwed(40943193n, 10n);

    console.log('--------------------Time Increased--------------------');
    await increaseBlockTimestamp(4 * 24 * 60 * 60);
    // ETH: $3012.65 BTC: $41382.59
    await changer.changePriceToken('WBTC', 28000);
    await changer.changePriceToken('WETH', 2000);

    await logger.logGlpPrice();
    await logger.logTargetWeights();

    await logger.logAavePosition();
    await logger.logBorrowParams();
    await logger.logProtocolParamsAndHoldings();

    await checker.checkTotalAssets(85588791857034000000n, 10n ** 12n, true);
    await checker.checkTotalSupply(99432633472683200000n, 10n ** 6n, true);
    await checker.checkVaultMktValue(83788939n, 10n);
    await checker.checkBorrowValue(66950909n, 10n);

    console.log('--------------------Rebalance--------------------');
    tx = await dnGmxJuniorVault.rebalance();
    await logger.logGlpRewards(tx);
    await logger.logAavePosition();
    await logger.logBorrowParams();
    await logger.logProtocolParamsAndHoldings();

    await checker.checkTotalAssets(85595626433712500000n, 10n ** 13n, true);
    await checker.checkTotalSupply(99432633472683200000n, 10n ** 10n, true);

    await checker.checkCurrentBorrowed([85670n + 1n, 16686525117999200n], [0, 10n ** 10n]);
    await checker.checkVaultMktValue(83657481n, 10n);
    await checker.checkBorrowValue(57356418n, 300n);
    await checker.checkUsdcBorrwed(43860790n, 10n);
  });

  it('60% setTraderOIHedgeBps; Traders Net Long; Hedge Position less short (Excel)', async () => {
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
      dnGmxTraderHedgeStrategy,
      admin,
    } = opts;
    await dnGmxJuniorVault.setMocks(mocks.swapRouterMock.address);
    await changer.addLiquidity();
    await dnGmxJuniorVault.grantAllowances();

    // becauses price are not changed on uniswap
    await dnGmxJuniorVault.setThresholds(
      100, //slippageThresholdSwapBtcBps
      100, //slippageThresholdSwapEthBps
      100, //slippageThresholdGmxBps
      parseUnits('20', 6), //usdcConversionThreshold
      10n ** 15n, //wethConversionThreshold
      0, //hedgeUsdcAmountThreshold
      parseUnits('1000000', 6), //partialBtcHedgeUsdcAmountThreshold
      parseUnits('1000000', 6), //partialEthHedgeUsdcAmountThreshold
    );

    // RebalanceProfit threshold (absolute $ amount)
    await dnGmxJuniorVault.setParamsV1(20n, dnGmxTraderHedgeStrategy.address);

    // Set setTraderOIHedgeBps
    await dnGmxTraderHedgeStrategy.setTraderOIHedgeBps(6000);
    await dnGmxTraderHedgeStrategy.setTraderOIHedges();
    // overrideTraderOIHedge amounts in token terms
    // await dnGmxTraderHedgeStrategy.overrideTraderOIHedges(parseUnits('0.001', 8), parseUnits('0.02', 18));

    await dnGmxSeniorVault.connect(users[1]).deposit(parseUnits('150', 6), users[1].address);

    // ETH: $2787.23 BTC: $38694.59
    //  await changer.changePriceToken('WBTC', 38694.59);
    //  await changer.changePriceToken('WETH', 2787.23);
    await logger.logGlpPrice();
    // await logger.logTargetWeights();
    await logger.logAavePosition();
    // await logger.logBorrowParams();

    // await changer.changeTargetWeight('WBTC', 20_000, gmxVault);
    // await changer.changeTargetWeight('WETH', 20_000, gmxVault);

    // // await checker.checkTotalAssets(150000000n, 10n ** 15n, false);

    // Deposit
    const amount = parseEther('100');
    // console.log("1. Optimal Values : ", await dnGmxJuniorVault.getOptimalBorrows(await dnGmxJuniorVault.totalAssets()));
    console.log('--------------------Initial Deposit--------------------');
    tx = await dnGmxJuniorVault.connect(users[0]).deposit(amount, users[0].address);

    await logger.logAavePosition(tx);
    await logger.logBorrowParams(tx);
    await logger.logProtocolParamsAndHoldings();

    await checker.checkTotalAssets(99613666843675200000n, 10n ** 12n, true);
    await checker.checkTotalSupply(99621317502237300000n, 10n ** 6n, true);
    await checker.checkCurrentBorrowed([73633n, 11991486914753800n], [0n, 10n ** 10n]);
    await checker.checkVaultMktValue(93066557n, 10n);
    await checker.checkBorrowValue(35735418n, 10n);
    await checker.checkUsdcBorrwed(27327084n, 10n);
  });

  it('0.001BTC & 0.02ETH overrideTraderOIHedges; Traders Net Long; Hedge Position less short (Excel)', async () => {
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
      dnGmxTraderHedgeStrategy,
      admin,
    } = opts;
    await dnGmxJuniorVault.setMocks(mocks.swapRouterMock.address);
    await changer.addLiquidity();
    await dnGmxJuniorVault.grantAllowances();

    // becauses price are not changed on uniswap
    await dnGmxJuniorVault.setThresholds(
      100, //slippageThresholdSwapBtcBps
      100, //slippageThresholdSwapEthBps
      100, //slippageThresholdGmxBps
      parseUnits('20', 6), //usdcConversionThreshold
      10n ** 15n, //wethConversionThreshold
      0, //hedgeUsdcAmountThreshold
      parseUnits('1000000', 6), //partialBtcHedgeUsdcAmountThreshold
      parseUnits('1000000', 6), //partialEthHedgeUsdcAmountThreshold
    );

    // RebalanceProfit threshold (absolute $ amount)
    await dnGmxJuniorVault.setParamsV1(20n, dnGmxTraderHedgeStrategy.address);

    // Set setTraderOIHedgeBps
    //  await dnGmxTraderHedgeStrategy.setTraderOIHedgeBps(6000);
    // overrideTraderOIHedge amounts in token terms
    await dnGmxTraderHedgeStrategy.overrideTraderOIHedges(43422308823n, 8684461764552920000000n);

    await dnGmxSeniorVault.connect(users[1]).deposit(parseUnits('150', 6), users[1].address);

    // ETH: $2787.23 BTC: $38694.59
    //  await changer.changePriceToken('WBTC', 38694.59);
    //  await changer.changePriceToken('WETH', 2787.23);
    await logger.logGlpPrice();
    // await logger.logTargetWeights();
    await logger.logAavePosition();
    // await logger.logBorrowParams();

    // await changer.changeTargetWeight('WBTC', 20_000, gmxVault);
    // await changer.changeTargetWeight('WETH', 20_000, gmxVault);

    // // await checker.checkTotalAssets(150000000n, 10n ** 15n, false);

    // Deposit
    const amount = parseEther('100');
    // console.log("1. Optimal Values : ", await dnGmxJuniorVault.getOptimalBorrows(await dnGmxJuniorVault.totalAssets()));
    console.log('--------------------Initial Deposit--------------------');
    tx = await dnGmxJuniorVault.connect(users[0]).deposit(amount, users[0].address);

    await logger.logAavePosition(tx);
    await logger.logBorrowParams(tx);
    await logger.logProtocolParamsAndHoldings();

    await checker.checkTotalAssets(99479960414939600000n, 10n ** 12n, true);
    await checker.checkTotalSupply(99490257906701700000n, 10n ** 6n, true);
    await checker.checkCurrentBorrowed([89971n, 17471978242701800n], [0n, 10n ** 10n]);
    await checker.checkVaultMktValue(92942880n, 10n);
    await checker.checkBorrowValue(48103208n, 10n);
    await checker.checkUsdcBorrwed(36784806n, 10n);
  });

  it('60% setTraderOIHedgeBps Traders Net Short; Hedge Position more short (Excel)', async () => {
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
      dnGmxTraderHedgeStrategy,
      admin,
    } = opts;
    await dnGmxJuniorVault.setMocks(mocks.swapRouterMock.address);
    await changer.addLiquidity();
    await dnGmxJuniorVault.grantAllowances();
    console.log('grant allowance');

    // becauses price are not changed on uniswap
    await dnGmxJuniorVault.setThresholds(
      100, //slippageThresholdSwapBtcBps
      100, //slippageThresholdSwapEthBps
      100, //slippageThresholdGmxBps
      parseUnits('20', 6), //usdcConversionThreshold
      10n ** 15n, //wethConversionThreshold
      0, //hedgeUsdcAmountThreshold
      parseUnits('1000000', 6), //partialBtcHedgeUsdcAmountThreshold
      parseUnits('1000000', 6), //partialEthHedgeUsdcAmountThreshold
    );

    // RebalanceProfit threshold (absolute $ amount)
    await dnGmxJuniorVault.setParamsV1(20n, dnGmxTraderHedgeStrategy.address);

    // Set TraderOI Short
    await logger.logReservedAndGlobalShortAmounts();

    await changer.changeReservedAmounts('WBTC', parseUnits('400', 8));
    await changer.changeReservedAmounts('WETH', parseUnits('10000'));

    await logger.logReservedAndGlobalShortAmounts();

    // Set setTraderOIHedgeBps
    await dnGmxTraderHedgeStrategy.setTraderOIHedgeBps(6_000);
    await dnGmxTraderHedgeStrategy.setTraderOIHedges();

    await dnGmxSeniorVault.connect(users[1]).deposit(parseUnits('150', 6), users[1].address);

    // ETH: $2787.23 BTC: $38694.59
    //  await changer.changePriceToken('WBTC', 38694.59);
    //  await changer.changePriceToken('WETH', 2787.23);
    await logger.logGlpPrice();
    await logger.logTargetWeights();
    await logger.logAavePosition();
    await logger.logBorrowParams();

    // await changer.changeTargetWeight('WBTC', 20_000, gmxVault);
    // await changer.changeTargetWeight('WETH', 20_000, gmxVault);

    // // await checker.checkTotalAssets(150000000n, 10n ** 15n, false);

    // Deposit
    const amount = parseEther('100');
    // console.log("1. Optimal Values : ", await dnGmxJuniorVault.getOptimalBorrows(await dnGmxJuniorVault.totalAssets()));
    console.log('--------------------Initial Deposit--------------------');
    tx = await dnGmxJuniorVault.connect(users[0]).deposit(amount, users[0].address);

    await logger.logAavePosition(tx);
    await logger.logBorrowParams(tx);
    await logger.logProtocolParamsAndHoldings();

    await checker.checkTotalAssets(99559080962328700000n, 10n ** 13n, true);
    await checker.checkTotalSupply(99567811872646400000n, 10n ** 6n, true);
    await checker.checkCurrentBorrowed([100969n, 19727691893787900n], [0n, 10n ** 3n]);
    await checker.checkVaultMktValue(123548454n, 10n);
    await checker.checkBorrowValue(54172130n, 10n);
    await checker.checkUsdcBorrwed(41425746n, 10n);
  });
});
