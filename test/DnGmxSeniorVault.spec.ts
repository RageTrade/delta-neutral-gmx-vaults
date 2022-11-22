import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { BigNumber, ethers } from 'ethers';
import { hexlify, parseUnits, randomBytes } from 'ethers/lib/utils';
import {
  DnGmxBatchingManager,
  DnGmxJuniorVaultMock,
  DnGmxSeniorVault,
  ERC20Upgradeable,
  IAToken,
} from '../typechain-types';
import { dnGmxJuniorVaultFixture } from './fixtures/dn-gmx-junior-vault';
import addresses from './fixtures/addresses';

describe('DnGmx Senior Vault', () => {
  let aUSDC: IAToken;
  let usdc: ERC20Upgradeable;
  let users: SignerWithAddress[];
  let admin: SignerWithAddress;

  let dnGmxSeniorVault: DnGmxSeniorVault;
  let glpBatchingManager: DnGmxBatchingManager;
  let dnGmxJuniorVault: DnGmxJuniorVaultMock;

  beforeEach(async () => {
    ({ dnGmxJuniorVault, dnGmxSeniorVault, users, aUSDC, usdc, admin, glpBatchingManager } =
      await dnGmxJuniorVaultFixture());
  });

  describe('Setters senior vault', () => {
    it('dnGmxSeniorVault', async () => {
      const address = hexlify(randomBytes(20));
      await dnGmxSeniorVault.setDnGmxJuniorVault(address);
      expect((await dnGmxSeniorVault.dnGmxJuniorVault()).toLowerCase()).to.eq(address);
    });

    it('feeStrategy', async () => {
      const infoToSet = {
        optimalUtilizationRate: 8n * 10n ** 29n,
        baseVariableBorrowRate: 10n ** 29n,
        variableRateSlope1: 10n ** 29n,
        variableRateSlope2: 5n * 10n ** 29n,
      };
      await dnGmxSeniorVault.updateFeeStrategyParams(infoToSet);

      const info = await dnGmxSeniorVault.feeStrategy();

      expect(info.optimalUtilizationRate).to.eq(infoToSet.optimalUtilizationRate);
      expect(info.baseVariableBorrowRate).to.eq(infoToSet.baseVariableBorrowRate);
      expect(info.variableRateSlope1).to.eq(infoToSet.variableRateSlope1);
      expect(info.variableRateSlope2).to.eq(infoToSet.variableRateSlope2);
    });

    it('maxUtilizationBps', async () => {
      const maxUtilizationSet = 10;
      await dnGmxSeniorVault.setMaxUtilizationBps(maxUtilizationSet);
      expect(await dnGmxSeniorVault.maxUtilizationBps()).to.eq(maxUtilizationSet);
    });

    it('maxUtilizationBps bad value', async () => {
      expect(dnGmxSeniorVault.setMaxUtilizationBps(10_001)).to.be.revertedWith('InvalidMaxUtilizationBps()');
    });

    it('Borrow cap', async () => {
      const borrowCap = parseUnits('50', 6n);
      await dnGmxSeniorVault.updateBorrowCap(dnGmxJuniorVault.address, borrowCap);
      expect(await dnGmxSeniorVault.borrowCaps(dnGmxJuniorVault.address)).to.eq(borrowCap);
    });
  });

  describe('Setters junior vault', () => {
    it('setAdminParams', async () => {
      await dnGmxJuniorVault.setAdminParams(
        admin.address,
        dnGmxSeniorVault.address,
        ethers.constants.MaxUint256,
        glpBatchingManager.address,
        100,
        3000,
      );

      const adminParams = await dnGmxJuniorVault.getAdminParams();
      expect(adminParams.keeper).to.eq(admin.address);
      expect(adminParams.dnGmxSeniorVault).to.eq(dnGmxSeniorVault.address);
      expect(adminParams.depositCap).to.eq(ethers.constants.MaxUint256);
      expect(adminParams.batchingManager).to.eq(glpBatchingManager.address);
      expect(adminParams.withdrawFeeBps).to.eq(100);
      expect(adminParams.feeTierWethWbtcPool).to.eq(3000);
    });

    it('setAdminParams bad withdrawFeeBps', async () => {
      await expect(
        dnGmxJuniorVault.setAdminParams(
          admin.address,
          dnGmxSeniorVault.address,
          ethers.constants.MaxUint256,
          glpBatchingManager.address,
          10_001, // bad withdrawFeeBps
          3000,
        ),
      ).to.be.revertedWith('InvalidWithdrawFeeBps()');
    });

    it('setThresholds', async () => {
      await dnGmxJuniorVault.setThresholds(
        100, // slippageThresholdSwapBtc
        100, // slippageThresholdSwapEth
        100, // slippageThresholdGmx
        parseUnits('1', 6), // usdcConversionThreshold
        10n ** 15n, // wethConversionThreshold
        parseUnits('12', 6), // hedgeUsdcAmountThreshold
        parseUnits('1000000', 6), // partialBtcHedgeUsdcAmountThreshold
        parseUnits('1000000', 6), // partialEthHedgeUsdcAmountThreshold
      );

      const thresholds = await dnGmxJuniorVault.getThresholds();
      expect(thresholds.slippageThresholdSwapBtcBps).to.eq(100);
      expect(thresholds.slippageThresholdSwapEthBps).to.eq(100);
      expect(thresholds.slippageThresholdGmxBps).to.eq(100);
      expect(thresholds.usdcConversionThreshold).to.eq(parseUnits('1', 6));
      expect(thresholds.wethConversionThreshold).to.eq(10n ** 15n);
      expect(thresholds.hedgeUsdcAmountThreshold).to.eq(parseUnits('12', 6));
      expect(thresholds.partialBtcHedgeUsdcAmountThreshold).to.eq(parseUnits('1000000', 6));
      expect(thresholds.partialEthHedgeUsdcAmountThreshold).to.eq(parseUnits('1000000', 6));
    });

    it('setThresholds bad slippageThresholdSwapBtcBps', async () => {
      await expect(
        dnGmxJuniorVault.setThresholds(
          10_001, // bad slippageThresholdSwapBtc
          100, // slippageThresholdSwapEth
          100, // slippageThresholdGmx
          parseUnits('1', 6), // usdcConversionThreshold
          10n ** 15n, // wethConversionThreshold
          parseUnits('12', 6), // hedgeUsdcAmountThreshold
          parseUnits('1000000', 6), // partialBtcHedgeUsdcAmountThreshold
          parseUnits('1000000', 6), // partialEthHedgeUsdcAmountThreshold
        ),
      ).to.be.revertedWith('InvalidSlippageThresholdSwapBtc()');
    });
    it('setThresholds bad slippageThresholdSwapEthBps', async () => {
      await expect(
        dnGmxJuniorVault.setThresholds(
          100, // slippageThresholdSwapBtc
          10_001, // bad slippageThresholdSwapEth
          100, // slippageThresholdGmx
          parseUnits('1', 6), // usdcConversionThreshold
          10n ** 15n, // wethConversionThreshold
          parseUnits('12', 6), // hedgeUsdcAmountThreshold
          parseUnits('1000000', 6), // partialBtcHedgeUsdcAmountThreshold
          parseUnits('1000000', 6), // partialEthHedgeUsdcAmountThreshold
        ),
      ).to.be.revertedWith('InvalidSlippageThresholdSwapEth()');
    });
    it('setThresholds bad slippageThresholdGmxBps', async () => {
      await expect(
        dnGmxJuniorVault.setThresholds(
          100, // slippageThresholdSwapBtc
          100, // slippageThresholdSwapEth
          10_001, // bad slippageThresholdGmx
          parseUnits('1', 6), // usdcConversionThreshold
          10n ** 15n, // wethConversionThreshold
          parseUnits('12', 6), // hedgeUsdcAmountThreshold
          parseUnits('1000000', 6), // partialBtcHedgeUsdcAmountThreshold
          parseUnits('1000000', 6), // partialEthHedgeUsdcAmountThreshold
        ),
      ).to.be.revertedWith('InvalidSlippageThresholdGmx()');
    });

    it('setRebalanceParams', async () => {
      await dnGmxJuniorVault.setRebalanceParams(
        86400, // rebalanceTimeThreshold
        500, // 5% in bps | rebalanceDeltaThreshold
        10_000, // rebalanceHfThresholdBps
      );

      const rebalanceParams = await dnGmxJuniorVault.getRebalanceParams();
      expect(rebalanceParams.rebalanceTimeThreshold).to.eq(86400);
      expect(rebalanceParams.rebalanceDeltaThresholdBps).to.eq(500);
      expect(rebalanceParams.rebalanceHfThresholdBps).to.eq(10_000);
    });

    it('setRebalanceParams bad rebalanceTimeThreshold', async () => {
      await expect(
        dnGmxJuniorVault.setRebalanceParams(
          3 * 86400 + 1, // bad rebalanceTimeThreshold
          500, // 5% in bps | rebalanceDeltaThreshold
          10_000, // rebalanceHfThresholdBps
        ),
      ).to.be.revertedWith('InvalidRebalanceTimeThreshold()');
    });
    it('setRebalanceParams bad rebalanceTimeThreshold', async () => {
      await expect(
        dnGmxJuniorVault.setRebalanceParams(
          86400, // rebalanceTimeThreshold
          10_001, // bad rebalanceDeltaThreshold
          10_000, // rebalanceHfThresholdBps
        ),
      ).to.be.revertedWith('InvalidRebalanceDeltaThresholdBps()');
    });
    it('setRebalanceParams bad rebalanceTimeThreshold 1', async () => {
      await expect(
        dnGmxJuniorVault.setRebalanceParams(
          86400, // rebalanceTimeThreshold
          500, // rebalanceDeltaThreshold
          9999, // bad rebalanceHfThresholdBps
        ),
      ).to.be.revertedWith('InvalidRebalanceHfThresholdBps()');
    });
    it('setRebalanceParams bad rebalanceTimeThreshold 2', async () => {
      await expect(
        dnGmxJuniorVault.setRebalanceParams(
          86400, // rebalanceTimeThreshold
          500, // rebalanceDeltaThreshold
          20_001, // bad rebalanceHfThresholdBps
        ),
      ).to.be.revertedWith('InvalidRebalanceHfThresholdBps()');
    });

    it('setHedgeParams', async () => {
      const targetHealthFactor = 15_000;
      await dnGmxJuniorVault.setHedgeParams(
        addresses.BALANCER_VAULT, //vault:
        addresses.UNI_V3_SWAP_ROUTER, //swapRouter:
        targetHealthFactor, // 150%
        ethers.constants.AddressZero,
      );

      const hedgeParams = await dnGmxJuniorVault.getHedgeParams();
      expect(hedgeParams.balancerVault).to.eq(addresses.BALANCER_VAULT);
      expect(hedgeParams.swapRouter).to.eq(addresses.UNI_V3_SWAP_ROUTER);
      expect(hedgeParams.targetHealthFactor).to.eq(targetHealthFactor);
      expect(hedgeParams.aaveRewardsController).to.eq(ethers.constants.AddressZero);
    });
  });

  describe('Basic Functions', () => {
    it('Deposit takes assets and deposits to AAVE', async () => {
      const amount = parseUnits('100', 6n);
      await expect(() => dnGmxSeniorVault.connect(users[1]).deposit(amount, users[1].address)).to.changeTokenBalance(
        usdc,
        users[1],
        amount.mul(-1n),
      );
      expect(await dnGmxSeniorVault.totalAssets()).to.eq(amount);
      expect(await aUSDC.balanceOf(dnGmxSeniorVault.address)).to.eq(amount);
    });

    it('Withdraw gives back assets after withdrawing from AAVE', async () => {
      const amount = parseUnits('100', 6n);
      await dnGmxSeniorVault.connect(users[1]).deposit(amount, users[1].address);
      await expect(() =>
        dnGmxSeniorVault.connect(users[1]).withdraw(amount, users[1].address, users[1].address),
      ).to.changeTokenBalance(usdc, users[1], amount);

      expect(await dnGmxSeniorVault.totalAssets()).to.eq(0);
      expect(await aUSDC.balanceOf(dnGmxSeniorVault.address)).to.eq(0);
    });

    it('Borrow fails for non whitelisted borrower', async () => {
      await expect(dnGmxSeniorVault.borrow(parseUnits('100', 6n))).to.be.revertedWith('CallerNotBorrower()');
    });

    it('Repay fails for non whitelisted borrower', async () => {
      await expect(dnGmxSeniorVault.repay(parseUnits('100', 6n))).to.be.revertedWith('CallerNotBorrower()');
    });

    it('Borrow fails if deposited amount < borrowed amount', async () => {
      expect(dnGmxSeniorVault.borrow(parseUnits('100', 6n))).to.be.reverted;
    });

    it('Borrow fails if borrow cap breached', async () => {
      const depositAmount = parseUnits('100', 6n);
      const borrowCap = parseUnits('50', 6n);
      const borrowAmount = parseUnits('60', 6n);

      await dnGmxSeniorVault.updateBorrowCap(dnGmxJuniorVault.address, borrowCap);
      await dnGmxSeniorVault.connect(users[1]).deposit(depositAmount, users[1].address);
      await expect(dnGmxJuniorVault.executeBorrowFromDnGmxSeniorVault(borrowAmount)).to.be.revertedWith(
        'InvalidBorrowAmount()',
      );
    });

    it('Borrow transfers aUSDC to borrower', async () => {
      const depositAmount = parseUnits('100', 6n);
      const borrowAmount = parseUnits('50', 6n);

      await dnGmxSeniorVault.connect(users[1]).deposit(depositAmount, users[1].address);
      await dnGmxJuniorVault.executeBorrowFromDnGmxSeniorVault(borrowAmount);

      // Can slightly vary because of the interest accrued on AAVE
      expect(await dnGmxSeniorVault.totalAssets()).to.closeTo(depositAmount, 1n);
      expect(await aUSDC.balanceOf(dnGmxSeniorVault.address)).to.eq(depositAmount.sub(borrowAmount));
      expect(await aUSDC.balanceOf(dnGmxJuniorVault.address)).to.eq(borrowAmount);
    });

    it('Repay transfers aUSDC from borrower', async () => {
      const depositAmount = parseUnits('100', 6n);
      const borrowAmount = parseUnits('50', 6n);

      await dnGmxSeniorVault.connect(users[1]).deposit(depositAmount, users[1].address);
      await dnGmxJuniorVault.executeBorrowFromDnGmxSeniorVault(borrowAmount);
      await dnGmxJuniorVault.executeRepayFromDnGmxSeniorVault(borrowAmount);

      expect(await dnGmxSeniorVault.totalAssets()).to.eq(depositAmount);
      expect(await aUSDC.balanceOf(dnGmxSeniorVault.address)).to.eq(depositAmount);
      expect(await aUSDC.balanceOf(dnGmxJuniorVault.address)).to.eq(0);
    });

    it('Withdraw fails if max utilization is breached', async () => {
      const amount = parseUnits('100', 6n);
      await dnGmxSeniorVault.connect(users[1]).deposit(amount, users[1].address);
      await dnGmxJuniorVault.executeBorrowFromDnGmxSeniorVault(amount);
      await expect(
        dnGmxSeniorVault.connect(users[1]).withdraw(amount, users[1].address, users[1].address),
      ).to.be.revertedWith('MaxUtilizationBreached()');
    });
  });

  describe('ETH Rewards splits', () => {
    it('0% Utilization', async () => {
      const depositAmount = parseUnits('100', 6n);
      // const borrowAmount = parseUnits('50', 6n);

      await dnGmxSeniorVault.connect(users[1]).deposit(depositAmount, users[1].address);
      // await dnGmxJuniorVault.executeBorrowFromDnGmxSeniorVault(borrowAmount);

      expect(await dnGmxSeniorVault.getEthRewardsSplitRate()).to.closeTo(
        BigNumber.from(10n * 10n ** 28n),
        BigNumber.from(10n ** 25n),
      ); // 10%
    });

    it('40% Utilization', async () => {
      const depositAmount = parseUnits('100', 6n);
      const borrowAmount = parseUnits('40', 6n);

      await dnGmxSeniorVault.connect(users[1]).deposit(depositAmount, users[1].address);
      await dnGmxJuniorVault.executeBorrowFromDnGmxSeniorVault(borrowAmount);

      expect(await dnGmxSeniorVault.getEthRewardsSplitRate()).to.closeTo(
        BigNumber.from(15n * 10n ** 28n),
        BigNumber.from(10n ** 25n),
      ); // 15%
    });

    it('80% Utilization', async () => {
      const depositAmount = parseUnits('100', 6n);
      const borrowAmount = parseUnits('80', 6n);

      await dnGmxSeniorVault.connect(users[1]).deposit(depositAmount, users[1].address);
      await dnGmxJuniorVault.executeBorrowFromDnGmxSeniorVault(borrowAmount);

      expect(await dnGmxSeniorVault.getEthRewardsSplitRate()).to.closeTo(
        BigNumber.from(20n * 10n ** 28n),
        BigNumber.from(10n ** 25n),
      ); // 20%
    });

    it('90% Utilization', async () => {
      const depositAmount = parseUnits('100', 6n);
      const borrowAmount = parseUnits('90', 6n);

      await dnGmxSeniorVault.connect(users[1]).deposit(depositAmount, users[1].address);
      await dnGmxJuniorVault.executeBorrowFromDnGmxSeniorVault(borrowAmount);

      expect(await dnGmxSeniorVault.getEthRewardsSplitRate()).to.closeTo(
        BigNumber.from(45n * 10n ** 28n),
        BigNumber.from(10n ** 25n),
      ); // 45%
    });
  });
});
