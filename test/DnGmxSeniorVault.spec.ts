import { expect } from 'chai';
import { BigNumber } from 'ethers';
import { dnGmxJuniorVaultFixture } from './fixtures/dn-gmx-junior-vault';
import { hexlify, parseUnits, randomBytes } from 'ethers/lib/utils';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import {
  DnGmxBatchingManager,
  DnGmxJuniorVaultMock,
  DnGmxSeniorVault,
  ERC20Upgradeable,
  GMXBatchingManager,
  IAToken,
} from '../typechain-types';

describe('DnGmx Senior Vault', () => {
  let dnGmxJuniorVault: DnGmxJuniorVaultMock;
  let glpBatchingManager: DnGmxBatchingManager;
  let users: SignerWithAddress[];
  let aUSDC: IAToken;
  let usdc: ERC20Upgradeable;

  let dnGmxSeniorVault: DnGmxSeniorVault;

  beforeEach(async () => {
    ({ dnGmxJuniorVault, dnGmxSeniorVault, glpBatchingManager, users, aUSDC, usdc } = await dnGmxJuniorVaultFixture());
  });

  describe('Setters', () => {
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

    it('Borrow cap', async () => {
      const borrowCap = parseUnits('50', 6n);
      await dnGmxSeniorVault.updateBorrowCap(dnGmxJuniorVault.address, borrowCap);
      expect(await dnGmxSeniorVault.borrowCaps(dnGmxJuniorVault.address)).to.eq(borrowCap);
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

      expect(await dnGmxSeniorVault.totalAssets()).to.eq(depositAmount);
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
