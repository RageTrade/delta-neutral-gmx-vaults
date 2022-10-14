import { expect } from 'chai';
import { BigNumber } from 'ethers';
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
    await dnGmxJuniorVault.setThresholds({
      slippageThresholdSwap: 1000,
      hfThreshold: 0,
      hedgeUsdcAmountThreshold: 0,
      slippageThresholdGmx: 1000,
      usdcConversionThreshold: parseUnits('1', 6),
      wethConversionThreshold: 10n ** 15n,
    });

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
    await checker.checkCurrentBorrowed([83259n, 12945732922165800n], [0, 6n * 10n ** 10n]);
    await checker.checkVaultMktValue(122037988n, 70n);
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
    await checker.checkVaultMktValue(116812897n, 4n * 10n ** 2n);
    await checker.checkBorrowValue(73477703n, 5n * 10n ** 2n);

    console.log('--------------------Rebalance--------------------');
    tx = await dnGmxJuniorVault.rebalance();
    await logger.logGlpRewards(tx);
    await logger.logAavePosition();
    await logger.logBorrowParams();
    await logger.logProtocolParamsAndHoldings();

    await checker.checkTotalAssets(89313883234732900000n, 4n * 10n ** 14n, true);
    await checker.checkTotalSupply(100000000000000000000n, 0, true);

    // BTC target & actual hedge is off due to Curve
    await checker.checkCurrentBorrowed([70568n - 636n, 10856649158435000n], [10n ** 4n, 4n * 10n ** 10n]);
    await checker.checkVaultMktValue(115230209n, 4n * 10n ** 3n);
    await checker.checkBorrowValue(61646956n, 3n * 10n ** 3n);
    await checker.checkUsdcBorrwed(47343106n, 2n * 10n ** 3n);
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
    await dnGmxJuniorVault.setThresholds({
      slippageThresholdSwap: 1000,
      hfThreshold: 0,
      hedgeUsdcAmountThreshold: 0,
      slippageThresholdGmx: 1000,
      usdcConversionThreshold: parseUnits('1', 6),
      wethConversionThreshold: 10n ** 15n,
    });

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
    await checker.checkCurrentBorrowed([83259n, 12945732922165800n], [0, 6n * 10n ** 10n]);
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
    await checker.checkVaultMktValue(116812897n, 4n * 10n ** 2n);
    await checker.checkBorrowValue(73477703n, 5n * 10n ** 2n);

    // New Deposit
    console.log('--------------------New Deposit--------------------');
    const amount1 = parseEther('50');
    await dnGmxJuniorVault.connect(users[0]).deposit(amount1, users[0].address);
    await logger.logAavePosition();
    await logger.logBorrowParams();
    await logger.logProtocolParamsAndHoldings();

    await checker.checkTotalAssets(140680077504275000000n, 4n * 10n ** 14n, true);
    await checker.checkTotalSupply(155138903027120000000n, 2n * 10n ** 14n, true);
    await checker.checkCurrentBorrowed([109479n - 1n, 16842886409899100n], [0, 4n * 10n ** 10n]);
    await checker.checkBorrowValue(96050555n, 400n);
    await checker.checkUsdcBorrwed(73450424n, 300n);
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
    await dnGmxJuniorVault.setThresholds({
      slippageThresholdSwap: 1000,
      hfThreshold: 0,
      hedgeUsdcAmountThreshold: 0,
      usdcConversionThreshold: parseUnits('1', 6),
      slippageThresholdGmx: 1000,
      wethConversionThreshold: 10n ** 15n,
    });

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
    await checker.checkCurrentBorrowed([83259n, 12945732922165800n], [0, 6n * 10n ** 10n]);
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
    await checker.checkVaultMktValue(116812897n, 4n * 10n ** 2n);
    await checker.checkBorrowValue(73477703n, 5n * 10n ** 2n);

    // Partial Withdraw
    console.log('--------------------Partial Withdraw--------------------');
    const amount1 = parseEther('50');
    await dnGmxJuniorVault.connect(users[0]).withdraw(amount1, users[0].address, users[0].address);

    await logger.logAavePosition();
    await logger.logBorrowParams();
    await logger.logProtocolParamsAndHoldings();

    await checker.checkTotalAssets(36927490755178300000n, 8n * 10n ** 14n, true);
    await checker.checkTotalSupply(44861096972879600000n, 2n * 10n ** 14n, true);
    // BTC target & actual hedge is off due to Curve
    // ETH/BTC borrow token amounts basis assets after 1st rebalanceProfit()
    await checker.checkCurrentBorrowed([31852n - 2570n, 4900343093228160n], [0, 4n * 10n ** 10n]);
    await checker.checkBorrowValue(26881795n, 200n);
    // USDC borrowed from Sr. Tranche basis optimal ETH & BTC borrow values
    await checker.checkUsdcBorrwed(21369987n, 500n);
  });

  it('Full Withdraw (Excel)', async () => {
    let tx;

    const opts = await dnGmxJuniorVaultFixture();
    const logger = new Logger(opts);
    const changer = new Changer(opts);
    const checker = new Checker(opts);

    const { dnGmxJuniorVault, dnGmxSeniorVault, glpBatchingManager, users, aUSDC, gmxVault, lendingPool, mocks } = opts;
    await dnGmxJuniorVault.setMocks(mocks.swapRouterMock.address);
    await dnGmxJuniorVault.grantAllowances();

    await dnGmxJuniorVault.setWithdrawFee(1000);

    // becauses price are not changed on uniswap
    await dnGmxJuniorVault.setThresholds({
      slippageThresholdSwap: 1000,
      hfThreshold: 0,
      hedgeUsdcAmountThreshold: 0,
      slippageThresholdGmx: 1000,
      usdcConversionThreshold: parseUnits('1', 6),
      wethConversionThreshold: 10n ** 15n,
    });

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
    await checker.checkCurrentBorrowed([83259n, 12945732922165800n], [0, 6n * 10n ** 10n]);
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
    await checker.checkVaultMktValue(116812897n, 4n * 10n ** 2n);
    await checker.checkBorrowValue(73477703n, 5n * 10n ** 2n);

    // console.log('--------------------Rebalance before Withdraw--------------------');
    // tx = await dnGmxJuniorVault.rebalance();
    // await logger.logGlpRewards(tx);

    // await logger.logAavePosition();
    // await logger.logBorrowParams();
    // await logger.logProtocolParamsAndHoldings();

    console.log('--------------------Full Withdraw--------------------');
    // Full Withdraw 89313565165612328971 assets
    const amount1 = dnGmxJuniorVault.balanceOf(users[0].address);
    await dnGmxJuniorVault.connect(users[0]).redeem(amount1, users[0].address, users[0].address);

    await logger.logAavePosition();
    await logger.logBorrowParams();
    await logger.logProtocolParamsAndHoldings();

    await checker.checkTotalAssets(3376239809408650000n, 7n * 10n ** 11n, true);
    await checker.checkTotalSupply(0n, 0, true);
    await checker.checkCurrentBorrowed([3249n, 1085664915843500n], [0, 4n * 10n ** 9n]);
    await checker.checkBorrowValue(4615248n, 200n);
    // await checker.checkUsdcBorrwed(0n, 0n);
  });

  it('Rebalance only BTC token', async () => {
    let tx;

    const opts = await dnGmxJuniorVaultFixture();
    const logger = new Logger(opts);
    const changer = new Changer(opts);
    const checker = new Checker(opts);

    const { dnGmxJuniorVault, dnGmxSeniorVault, glpBatchingManager, users, mocks, aUSDC, gmxVault, lendingPool } = opts;
    await dnGmxJuniorVault.setMocks(mocks.swapRouterMock.address);
    await dnGmxJuniorVault.grantAllowances();

    // becauses price are not changed on uniswap
    await dnGmxJuniorVault.setThresholds({
      slippageThresholdSwap: 1000,
      hfThreshold: 0,
      hedgeUsdcAmountThreshold: parseUnits('12', 6),
      slippageThresholdGmx: 1000,
      usdcConversionThreshold: parseUnits('1', 6),
      wethConversionThreshold: 10n ** 15n,
    });

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
    await checker.checkCurrentBorrowed([83259n, 12945732922165800n], [0, 6n * 10n ** 10n]);
    await checker.checkVaultMktValue(122037988n, 70n);
    await checker.checkBorrowValue(68302112, 20n);
    await checker.checkUsdcBorrwed(52231026n, 20n);

    await increaseBlockTimestamp(4 * 24 * 60 * 60);
    console.log('--------------------Time Increased--------------------');
    // ETH: $3012.65 BTC: $41382.59
    await changer.changePriceToken('WBTC', 41382.59);
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
    await checker.checkVaultMktValue(116812897n, 4n * 10n ** 2n);
    await checker.checkBorrowValue(73477703n, 5n * 10n ** 2n);

    console.log('--------------------Rebalance--------------------');
    tx = await dnGmxJuniorVault.rebalance();
    await logger.logGlpRewards(tx);
    await logger.logAavePosition();
    await logger.logBorrowParams();
    await logger.logProtocolParamsAndHoldings();

    // await checker.checkTotalAssets(89313883234732900000n, 4n * 10n ** 14n, true);
    await checker.checkTotalSupply(100000000000000000000n, 0, true);

    // BTC target & actual hedge is off due to Curve
    // await checker.checkCurrentBorrowed([70568n - 636n,10856649158435000n], [10n ** 4n, 4n * 10n ** 10n]);
    // await checker.checkVaultMktValue(115230209n, 4n * 10n ** 3n);
    // await checker.checkBorrowValue(61646956n, 3n * 10n ** 3n);
    // await checker.checkUsdcBorrwed(47343106n, 2n * 10n ** 3n);
  });

  // it('EndToEnd2 (Excel)', async () => {
  //   let tx;

  //   const opts = await dnGmxJuniorVaultFixture();
  //   const logger = new Logger(opts);
  //   const changer = new Changer(opts);
  //   const checker = new Checker(opts);

  //   const { dnGmxJuniorVault, dnGmxSeniorVault, glpBatchingManager, users, aUSDC, gmxVault, lendingPool, mocks } = opts;
  //   await dnGmxJuniorVault.setMocks(mocks.swapRouterMock.address);
  //   await dnGmxJuniorVault.grantAllowances();

  //   // becauses price are not changed on uniswap
  //   await dnGmxJuniorVault.setThresholds({
  //     slippageThreshold: 100,
  //     hfThreshold: 0,
  //     hedgeUsdcAmountThreshold: 0,
  //     usdcRedeemSlippage: 1000,
  //     usdcConversionThreshold: parseUnits('1', 6),
  //     wethConversionThreshold: 10n ** 15n,
  //   });

  //   await dnGmxSeniorVault.connect(users[1]).deposit(parseUnits('150', 6), users[1].address);

  //   // ETH: $1859.84 BTC: $31373.1
  //   await changer.changePriceToken('WBTC', 31373.1);
  //   await changer.changePriceToken('WETH', 1859.84);
  //   await logger.logGlpPrice();
  //   await changer.changeWeight('WBTC', 13_560);
  //   await changer.changeWeight('WETH', 30_895);
  //   await logger.logAavePosition();
  //   await logger.logBorrowParams();

  //   // Initial Deposit
  //   console.log('--------------------Initial Deposit--------------------');
  //   const amount = parseEther('100');
  //   await dnGmxJuniorVault.connect(users[0]).deposit(amount, users[0].address);

  //   await logger.logAavePosition();
  //   await logger.logBorrowParams();
  //   await logger.logProtocolParamsAndHoldings();

  //   // await increaseBlockTimestamp(15 * 60);
  //   // await glpBatchingManager.executeBatchDeposit();

  //   await increaseBlockTimestamp(2 * 24 * 60 * 60);
  //   console.log('T--------------------ime Increased--------------------');
  //   // ETH: $1791.88 BTC: $30204.77
  //   await changer.changePriceToken('WBTC', 30204.77);
  //   await changer.changePriceToken('WETH', 1791.88);
  //   await logger.logGlpPrice();
  //   await changer.changeWeight('WBTC', 13_492);
  //   await changer.changeWeight('WETH', 30_434);
  //   await logger.logAavePosition();
  //   await logger.logBorrowParams();
  //   await logger.logProtocolParamsAndHoldings();

  //   // New Deposit
  //   console.log('--------------------New Deposit--------------------');
  //   const amount1 = parseEther('50');
  //   await dnGmxJuniorVault.connect(users[0]).deposit(amount1, users[0].address);

  //   // await logger.logGlpRewards(tx);
  //   await logger.logAavePosition();
  //   await logger.logBorrowParams();
  //   await logger.logProtocolParamsAndHoldings();

  //   await increaseBlockTimestamp(2 * 24 * 60 * 60);
  //   console.log('--------------------Time Increased--------------------');
  //   // ETH: $1662.91 BTC: $29091.88
  //   await changer.changePriceToken('WBTC', 29091.88);
  //   await changer.changePriceToken('WETH', 1662.91);
  //   await logger.logGlpPrice();
  //   await changer.changeWeight('WBTC', 13_558);
  //   await changer.changeWeight('WETH', 28_467);
  //   await logger.logAavePosition();
  //   await logger.logBorrowParams();
  //   await logger.logProtocolParamsAndHoldings();

  //   // Rebalance
  //   console.log('--------------------Rebalance : Time Threshold--------------------');
  //   tx = await dnGmxJuniorVault.rebalance();
  //   await logger.logGlpRewards(tx);
  //   await logger.logAavePosition();
  //   await logger.logBorrowParams();
  //   await logger.logProtocolParamsAndHoldings();

  //   await increaseBlockTimestamp(2 * 24 * 60 * 60);
  //   console.log('--------------------Time Increased--------------------');
  //   // ETH: $1434.84 BTC: $26574.53
  //   await changer.changePriceToken('WBTC', 26574.53);
  //   await changer.changePriceToken('WETH', 1434.84);
  //   await logger.logGlpPrice();
  //   await changer.changeWeight('WBTC', 14_491);
  //   await changer.changeWeight('WETH', 26_123);
  //   await logger.logAavePosition();
  //   await logger.logBorrowParams();
  //   await logger.logProtocolParamsAndHoldings();

  //   // Partial Withdraw
  //   console.log('--------------------Partial Withdraw--------------------');
  //   // const amount1 = parseEther('50');
  //   await dnGmxJuniorVault.connect(users[0]).withdraw(amount1, users[0].address, users[0].address);

  //   await logger.logAavePosition();
  //   await logger.logBorrowParams();
  //   await logger.logProtocolParamsAndHoldings();
  // });
});
