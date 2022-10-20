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
      1000, //slippageThresholdSwap
      1000, //slippageThresholdGmx
      parseUnits('1', 6), //usdcConversionThreshold
      0, //hfThreshold
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
    await checker.checkCurrentBorrowed([83259n, 12945732922165800n], [0, 6n * 10n ** 10n]);
    await checker.checkVaultMktValue(122037988n, 70n);
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

    await checker.checkCurrentBorrowed([70568n - 2n, 10856649158435000n], [10n ** 4n, 4n * 10n ** 10n]);
    await checker.checkVaultMktValue(114966949n, 3n * 10n ** 3n);
    await checker.checkBorrowValue(61910216n, 2n * 10n ** 3n);
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
    await dnGmxJuniorVault.setThresholds(
      1000, //slippageThresholdSwap
      1000, //slippageThresholdGmx
      parseUnits('1', 6), //usdcConversionThreshold
      0, //hfThreshold
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
    await dnGmxJuniorVault.setThresholds(
      1000, //slippageThresholdSwap
      1000, //slippageThresholdGmx
      parseUnits('1', 6), //usdcConversionThreshold
      0, //hfThreshold
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
    await checker.checkCurrentBorrowed([31852n - 1n, 4900343093228160n], [0, 4n * 10n ** 10n]);
    await checker.checkBorrowValue(27945368n, 700n);
    await checker.checkUsdcBorrwed(21369987n, 500n);
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
      1000, //slippageThresholdSwap
      1000, //slippageThresholdGmx
      parseUnits('1', 6), //usdcConversionThreshold
      0, //hfThreshold
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

    console.log('--------------------Full Withdraw--------------------');
    // Full Withdraw 89313565165612328971 assets
    const amount1 = dnGmxJuniorVault.balanceOf(users[0].address);
    await dnGmxJuniorVault.connect(users[0]).redeem(amount1, users[0].address, users[0].address);

    await logger.logAavePosition();
    await logger.logBorrowParams();
    await logger.logProtocolParamsAndHoldings();

    await checker.checkTotalAssets(3376241301895890000n, 3n * 10n ** 12n, true);
    await checker.checkTotalSupply(0n, 0, true);
    await checker.checkCurrentBorrowed([7057n - 1n, 1085664915843500n], [0, 4n * 10n ** 9n]);
    await checker.checkVaultMktValue(3980797n, 10n);
    await checker.checkBorrowValue(6190998n, 100n);
    await checker.checkUsdcBorrwed(4734292n, 100n);
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
      1000, //slippageThresholdSwap
      1000, //slippageThresholdGmx
      parseUnits('1', 6), //usdcConversionThreshold
      0, //hfThreshold
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

    await checker.checkTotalAssets(89306387638142900000n, 8n * 10n ** 11n, true);
    await checker.checkTotalSupply(100000000000000000000n, 0, true);

    await checker.checkCurrentBorrowed([55227n, 12948247199528500n], [0, 7n * 10n ** 9n]);
    await checker.checkBorrowValue(61865303n, 20n);
    await checker.checkVaultMktValue(114953754n, 31n);
    // await checker.checkUsdcBorrwed(47343106n, 2n * 10n ** 3n);
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
      1000, //slippageThresholdSwap
      1000, //slippageThresholdGmx
      parseUnits('1', 6), //usdcConversionThreshold
      0, //hfThreshold
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
    await checker.checkCurrentBorrowed([83259n, 12945732922165800n], [0, 6n * 10n ** 10n]);
    await checker.checkVaultMktValue(122037988n, 70n);
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
    await checker.checkVaultMktValue(113731147n, 4n * 10n ** 2n);
    await checker.checkBorrowValue(60365153n, 5n * 10n ** 2n);

    console.log('--------------------Rebalance--------------------');
    tx = await dnGmxJuniorVault.rebalance();
    await logger.logGlpRewards(tx);
    await logger.logAavePosition();
    await logger.logBorrowParams();
    await logger.logProtocolParamsAndHoldings();

    await checker.checkTotalAssets(98366759996068300000n + 20803n, 0n, true);
    await checker.checkTotalSupply(100000000000000000000n, 0, true);

    await checker.checkCurrentBorrowed([49400n - 2n, 19874976096510300n], [0n, 4n * 10n ** 9n]);
    await checker.checkBorrowValue(60195119n, 700n);
    await checker.checkUsdcBorrwed(46031561n, 200n);
    await checker.checkVaultMktValue(110645297n, 400n);
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
      1000, //slippageThresholdSwap
      1000, //slippageThresholdGmx
      parseUnits('1', 6), //usdcConversionThreshold
      0, //hfThreshold
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
    await checker.checkCurrentBorrowed([83259n, 12945732922165800n], [0, 6n * 10n ** 10n]);
    await checker.checkVaultMktValue(122037988n, 70n);
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
    await checker.checkVaultMktValue(116812896n, 4n * 10n ** 2n);
    await checker.checkBorrowValue(73477704n, 5n * 10n ** 2n);

    console.log('--------------------Rebalance--------------------');
    tx = await dnGmxJuniorVault.rebalance();
    await logger.logGlpRewards(tx);
    await logger.logAavePosition();
    await logger.logBorrowParams();
    await logger.logProtocolParamsAndHoldings();

    // await checker.checkTotalAssets(90679756983283500000n, 50000n, true);
    await checker.checkTotalSupply(100000000000000000000n, 0, true);

    await checker.checkCurrentBorrowed([83287n + 1n, 12948247272272900n], [0, 7n * 10n ** 9n]);
    await checker.checkBorrowValue(73475268n, 3n * 10n ** 3n);
    // USDC borrowed from SrTranche is bases optimalBorrowValue & not currentBorrowValue when swapAmount < Threshold
    await checker.checkUsdcBorrwed(45595379n, 100n);
    await checker.checkVaultMktValue(116206900n, 30n);
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
      1000, //slippageThresholdSwap
      1000, //slippageThresholdGmx
      parseUnits('1', 6), //usdcConversionThreshold
      0, //hfThreshold
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
    console.log('--------------------Jr. Tranche New Deposit--------------------');
    const amount1 = parseEther('50');
    await dnGmxJuniorVault.connect(users[0]).deposit(amount1, users[0].address);
    await logger.logAavePosition();
    await logger.logBorrowParams();
    await logger.logProtocolParamsAndHoldings();

    // 134831440275369833890
    await checker.checkTotalAssets(134831549403668000000n, 2n * 10n ** 14n, true);
    // 155139098395746290781
    await checker.checkTotalSupply(155139066349129000000n, 4n * 10n ** 13n, true);
    // Borrow ETH : 13760737544110385
    // Deviation : 350722378
    await checker.checkCurrentBorrowed([89444n, 13760737193388000n + 6n], [10n, 4n * 10n ** 8n]);
    await checker.checkBorrowValue(78470527n, 4000n);
    await checker.checkUsdcBorrwed(60006873n, 300n);

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

    await checker.checkTotalAssets(134831549403668000000n, 2n * 10n ** 14n, true);
    await checker.checkTotalSupply(155139066349129000000n, 4n * 10n ** 13n, true);
    await checker.checkBorrowValue(78473587n, 10n);
    // await checker.checkVaultMktValue(172585388n, 4n * 10n ** 2n);

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
    await increaseBlockTimestamp(60);
    tx = await dnGmxJuniorVault.rebalance();
    await logger.logGlpRewards(tx);
    await logger.logAavePosition();
    await logger.logBorrowParams();
    await logger.logProtocolParamsAndHoldings();

    await checker.checkTotalAssets(135033668650057000000n, 2n * 10n ** 14n, true);
    await checker.checkTotalSupply(155139066349129000000n, 4n * 10n ** 13n, true);

    await checker.checkCurrentBorrowed([104261n - 1n, 16040172420497200n], [0, 2n * 10n ** 10n]);
    // await checker.checkVaultMktValue(115230209n, 4n * 10n ** 3n);
    await checker.checkBorrowValue(91472889n, 500n);
    await checker.checkUsdcBorrwed(69949856n, 400n);
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
      1000, //slippageThresholdSwap
      1000, //slippageThresholdGmx
      parseUnits('1', 6), //usdcConversionThreshold
      0, //hfThreshold
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
    console.log('--------------------Jr. Tranche New Deposit--------------------');
    const amount1 = parseEther('50');
    await dnGmxJuniorVault.connect(users[0]).deposit(amount1, users[0].address);
    await logger.logAavePosition();
    await logger.logBorrowParams();
    await logger.logProtocolParamsAndHoldings();

    // 134831440275369833890
    await checker.checkTotalAssets(134831549403668000000n, 2n * 10n ** 14n, true);
    // 155139098395746290781
    await checker.checkTotalSupply(155139066349129000000n, 4n * 10n ** 13n, true);
    // Borrow ETH : 13760737544110385
    // Deviation : 350722378
    await checker.checkCurrentBorrowed([89444n, 13760737193388000n + 6n], [10n, 4n * 10n ** 8n]);
    await checker.checkBorrowValue(78470527n, 4000n);
    await checker.checkUsdcBorrwed(60006873n, 300n);

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

    await checker.checkTotalAssets(134831549403668000000n, 2n * 10n ** 14n, true);
    await checker.checkTotalSupply(155139066349129000000n, 4n * 10n ** 13n, true);
    await checker.checkBorrowValue(78473587n, 0n);
    // await checker.checkVaultMktValue(172585388n, 4n * 10n ** 2n);

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
    await checker.checkTotalAssets(119908186927301000000n, 10n ** 12n, true);
    await checker.checkTotalSupply(137769566188088000000n, 2n * 10n ** 14n, true);

    await checker.checkCurrentBorrowed([89444n, 13760742442810100n], [0, 5n * 10n ** 9n]);
    // await checker.checkVaultMktValue(115230209n, 4n * 10n ** 3n);
    await checker.checkBorrowValue(78473587n, 20n);
    await checker.checkUsdcBorrwed(60009213n, 3n * 10n ** 3n);
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
      1000, //slippageThresholdSwap
      1000, //slippageThresholdGmx
      parseUnits('1', 6), //usdcConversionThreshold
      0, //hfThreshold
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

    // await checker.checkTotalAssets(150000000n, 10n ** 15n, false);

    // Deposit
    console.log('--------------------Initial Deposit--------------------');
    const amount = parseEther('1000000');
    tx = await dnGmxJuniorVault.connect(users[0]).deposit(amount, users[0].address);

    await logger.logAavePosition(tx);
    await logger.logBorrowParams(tx);
    await logger.logProtocolParamsAndHoldings();

    // await checker.checkTotalAssets(100000000000000000000n, 0, true);
    // await checker.checkTotalSupply(100000000000000000000n, 0, true);
    // await checker.checkCurrentBorrowed([83259n, 12945732922165800n], [0, 6n * 10n ** 10n]);
    // await checker.checkVaultMktValue(122037988n, 70n);
    // await checker.checkBorrowValue(68302112, 20n);
    // await checker.checkUsdcBorrwed(52231026n, 20n);

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

    // await checker.checkTotalAssets(100000000000000000000n, 0, true);
    // await checker.checkTotalSupply(100000000000000000000n, 0, true);
    // await checker.checkVaultMktValue(116812897n, 4n * 10n ** 2n);
    // await checker.checkBorrowValue(73477703n, 5n * 10n ** 2n);

    console.log('--------------------Rebalance--------------------');
    tx = await dnGmxJuniorVault.rebalance();
    await logger.logGlpRewards(tx);
    await logger.logAavePosition();
    await logger.logBorrowParams();
    await logger.logProtocolParamsAndHoldings();

    // await checker.checkTotalAssets(89313883234732900000n, 4n * 10n ** 14n, true);
    // await checker.checkTotalSupply(100000000000000000000n, 0, true);

    // await checker.checkCurrentBorrowed([70568n -2n, 10856649158435000n], [10n ** 4n, 4n * 10n ** 10n]);
    // await checker.checkVaultMktValue(114966949n, 3n * 10n ** 3n);
    // await checker.checkBorrowValue(61910216n, 2n * 10n ** 3n);
    // await checker.checkUsdcBorrwed(47343106n, 2n * 10n ** 3n);
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
      1000, //slippageThresholdSwap
      1000, //slippageThresholdGmx
      parseUnits('1', 6), //usdcConversionThreshold
      0, //hfThreshold
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
    console.log('--------------------User0 Initial Deposit--------------------');
    const amount = parseEther('100');
    await dnGmxJuniorVault.connect(users[0]).deposit(amount, users[0].address);

    await logger.logAavePosition();
    await logger.logBorrowParams();
    await logger.logProtocolParamsAndHoldings();

    await checker.checkTotalAssets(100000000000000000000n, 0, true);
    await checker.checkTotalSupply(100000000000000000000n, 0, true);
    await checker.checkCurrentBorrowed([83511n - 1n, 12984871030298600n], [0, 2n * 10n ** 9n]);
    await checker.checkBorrowValue(68508606n, 300n);
    await checker.checkUsdcBorrwed(52388934n, 300n);
    await checker.checkVaultMktValue(122406938n, 50n);

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

    await checker.checkTotalAssets(100000000000000000000n, 0, true);
    await checker.checkTotalSupply(100000000000000000000n, 0, true);
    await checker.checkVaultMktValue(115895688n, 100n);
    await checker.checkBorrowValue(66179309n, 5n);

    // New Deposit
    console.log('--------------------User2 Initial Deposit--------------------');
    const amount1 = parseEther('50');
    await dnGmxJuniorVault.connect(users[2]).deposit(amount1, users[2].address);
    await logger.logAavePosition();
    await logger.logBorrowParams();
    await logger.logProtocolParamsAndHoldings();

    // await checker.checkTotalAssets(140680077504275000000n, 4n * 10n ** 14n, true);
    // await checker.checkTotalSupply(155138903027120000000n, 2n * 10n ** 14n, true);
    // await checker.checkCurrentBorrowed([109479n - 1n, 16842886409899100n], [0, 4n * 10n ** 10n]);
    // await checker.checkBorrowValue(96050555n, 400n);
    // await checker.checkUsdcBorrwed(73450424n, 300n);

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

    // await checker.checkTotalAssets(100000000000000000000n, 0, true);
    // await checker.checkTotalSupply(100000000000000000000n, 0, true);
    // await checker.checkVaultMktValue(116812897n, 4n * 10n ** 2n);
    // await checker.checkBorrowValue(73477703n, 5n * 10n ** 2n);

    console.log('--------------------24hr Rebalance--------------------');
    tx = await dnGmxJuniorVault.rebalance();
    await logger.logGlpRewards(tx);
    await logger.logAavePosition();
    await logger.logBorrowParams();
    await logger.logProtocolParamsAndHoldings();

    // await checker.checkTotalAssets(89313883234732900000n, 4n * 10n ** 14n, true);
    // await checker.checkTotalSupply(100000000000000000000n, 0, true);

    // await checker.checkCurrentBorrowed([70568n -2n, 10856649158435000n], [10n ** 4n, 4n * 10n ** 10n]);
    // await checker.checkVaultMktValue(114966949n, 3n * 10n ** 3n);
    // await checker.checkBorrowValue(61910216n, 2n * 10n ** 3n);
    // await checker.checkUsdcBorrwed(47343106n, 2n * 10n ** 3n);

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

    // await checker.checkTotalAssets(100000000000000000000n, 0, true);
    // await checker.checkTotalSupply(100000000000000000000n, 0, true);
    // await checker.checkVaultMktValue(116812897n, 4n * 10n ** 2n);
    // await checker.checkBorrowValue(73477703n, 5n * 10n ** 2n);

    console.log('--------------------User2 Full Withdraw--------------------');
    // Full Withdraw 89313565165612328971 assets
    const amount2 = dnGmxJuniorVault.balanceOf(users[2].address);
    await dnGmxJuniorVault.connect(users[2]).redeem(amount2, users[2].address, users[2].address);

    await logger.logAavePosition();
    await logger.logBorrowParams();
    await logger.logProtocolParamsAndHoldings();

    // await checker.checkTotalAssets(3376241301895890000n, 3n * 10n ** 12n, true);
    // await checker.checkTotalSupply(0n, 0, true);
    // await checker.checkCurrentBorrowed([7057n-1n, 1085664915843500n], [0, 4n * 10n ** 9n]);
    // await checker.checkVaultMktValue(3980797n, 10n);
    // await checker.checkBorrowValue(6190998n, 100n);
    // await checker.checkUsdcBorrwed(4734292n, 100n);

    console.log('--------------------Time Increased--------------------');
    await increaseBlockTimestamp(4 * 24 * 60 * 60);
    // ETH: $3243.94 BTC: $44372.72
    await changer.changePriceToken('WBTC', 44372.72);
    await changer.changePriceToken('WETH', 3243.94);
    await logger.logGlpPrice();
    await logger.logTargetWeights();

    await logger.logAavePosition();
    await logger.logBorrowParams();
    await logger.logProtocolParamsAndHoldings();

    // await checker.checkTotalAssets(100000000000000000000n, 0, true);
    // await checker.checkTotalSupply(100000000000000000000n, 0, true);
    // await checker.checkVaultMktValue(116812897n, 4n * 10n ** 2n);
    // await checker.checkBorrowValue(73477703n, 5n * 10n ** 2n);

    console.log('--------------------User0 Full Withdraw--------------------');
    // Full Withdraw 89313565165612328971 assets
    const amount3 = dnGmxJuniorVault.balanceOf(users[0].address);
    await dnGmxJuniorVault.connect(users[0]).redeem(amount3, users[0].address, users[0].address);

    await logger.logAavePosition();
    await logger.logBorrowParams();
    await logger.logProtocolParamsAndHoldings();

    // await checker.checkTotalAssets(3376241301895890000n, 3n * 10n ** 12n, true);
    // await checker.checkTotalSupply(0n, 0, true);
    // await checker.checkCurrentBorrowed([7057n-1n, 1085664915843500n], [0, 4n * 10n ** 9n]);
    // await checker.checkVaultMktValue(3980797n, 10n);
    // await checker.checkBorrowValue(6190998n, 100n);
    // await checker.checkUsdcBorrwed(4734292n, 100n);
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
      1000, //slippageThresholdSwap
      1000, //slippageThresholdGmx
      parseUnits('1', 6), //usdcConversionThreshold
      0, //hfThreshold
      10n ** 15n, //wethConversionThreshold
      0, //hedgeUsdcAmountThreshold
      parseUnits('2', 6), //partialBtcHedgeUsdcAmountThreshold
      parseUnits('2', 6), //partialEthHedgeUsdcAmountThreshold
    );

    await dnGmxJuniorVault.setRebalanceParams(
      86400, // rebalanceTimeThreshold
      500, // 5% in bps | rebalanceDeltaThreshold
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

    // await checker.checkTotalAssets(150000000n, 10n ** 15n, false);

    // Deposit
    console.log('--------------------Initial Deposit--------------------');
    const amount = parseEther('100');
    tx = await dnGmxJuniorVault.connect(users[0]).deposit(amount, users[0].address);

    await logger.logAavePosition(tx);
    await logger.logBorrowParams(tx);
    await logger.logProtocolParamsAndHoldings();

    // await checker.checkTotalAssets(100000000000000000000n, 0, true);
    // await checker.checkTotalSupply(100000000000000000000n, 0, true);
    // await checker.checkCurrentBorrowed([83259n, 12945732922165800n], [0, 6n * 10n ** 10n]);
    // await checker.checkVaultMktValue(122037988n, 70n);
    // await checker.checkBorrowValue(68302112, 20n);
    // await checker.checkUsdcBorrwed(52231026n, 20n);

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

    // await checker.checkTotalAssets(100000000000000000000n, 0, true);
    // await checker.checkTotalSupply(100000000000000000000n, 0, true);
    // await checker.checkVaultMktValue(116812897n, 4n * 10n ** 2n);
    // await checker.checkBorrowValue(73477703n, 5n * 10n ** 2n);

    console.log('-------------------- Rebalance 1 --------------------');
    tx = await dnGmxJuniorVault.rebalance();
    await logger.logGlpRewards(tx);
    await logger.logAavePosition();
    await logger.logBorrowParams();
    await logger.logProtocolParamsAndHoldings();

    console.log('-------------------- Rebalance 2 --------------------');
    tx = await dnGmxJuniorVault.rebalance();
    await logger.logGlpRewards(tx);
    await logger.logAavePosition();
    await logger.logBorrowParams();
    await logger.logProtocolParamsAndHoldings();

    console.log('-------------------- Rebalance 3 --------------------');
    tx = await dnGmxJuniorVault.rebalance();
    await logger.logGlpRewards(tx);
    await logger.logAavePosition();
    await logger.logBorrowParams();
    await logger.logProtocolParamsAndHoldings();

    console.log('-------------------- Rebalance 4 --------------------');
    tx = await dnGmxJuniorVault.rebalance();
    await logger.logGlpRewards(tx);
    await logger.logAavePosition();
    await logger.logBorrowParams();
    await logger.logProtocolParamsAndHoldings();

    console.log('-------------------- Rebalance 5 --------------------');
    await expect(dnGmxJuniorVault.rebalance()).to.be.revertedWith('InvalidRebalance()');

    // await checker.checkTotalAssets(89313883234732900000n, 4n * 10n ** 14n, true);
    // await checker.checkTotalSupply(100000000000000000000n, 0, true);

    // await checker.checkCurrentBorrowed([70568n - 2n, 10856649158435000n], [10n ** 4n, 4n * 10n ** 10n]);
    // await checker.checkVaultMktValue(114966949n, 3n * 10n ** 3n);
    // await checker.checkBorrowValue(61910216n, 2n * 10n ** 3n);
    // await checker.checkUsdcBorrwed(47343106n, 2n * 10n ** 3n);
  });
});
