import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { parseEther, parseUnits } from 'ethers/lib/utils';
import { ethers } from 'hardhat';
import {
  DnGmxBatchingManager,
  DnGmxJuniorVaultMock,
  DnGmxSeniorVault,
  ERC20Upgradeable,
  IRewardRouterV2,
} from '../typechain-types';
import { dnGmxJuniorVaultFixture } from './fixtures/dn-gmx-junior-vault';
import { generateErc20Balance } from './utils/generator';
import { BigNumber } from 'ethers';

describe('Dn Gmx Batching Manager', () => {
  let dnGmxJuniorVault: DnGmxJuniorVaultMock;
  let usdcBatchingManager: DnGmxBatchingManager;
  let mintBurnRouter: IRewardRouterV2;
  let users: SignerWithAddress[];
  let sGlp: ERC20Upgradeable;
  let usdc: ERC20Upgradeable;
  let fsGlp: ERC20Upgradeable;

  let dnGmxSeniorVault: DnGmxSeniorVault;

  let MAX_CONVERSION_BPS = 10_000;

  beforeEach(async () => {
    ({ dnGmxJuniorVault, dnGmxSeniorVault, usdcBatchingManager, users, fsGlp, usdc, sGlp, mintBurnRouter } =
      await dnGmxJuniorVaultFixture());
  });

  describe('Deposit', () => {
    it('default state - unpaused', async () => {
      expect(await usdcBatchingManager.paused()).to.be.false;
    });

    it('Fails - Amount 0', async () => {
      await expect(usdcBatchingManager.connect(users[1]).depositUsdc(0, users[1].address))
        .to.be.revertedWithCustomError(usdcBatchingManager, 'InvalidInput')
        .withArgs(33);
    });
    it('Fails - Receiver Address 0', async () => {
      const depositAmount = parseUnits('100', 6);

      await expect(usdcBatchingManager.connect(users[1]).depositUsdc(depositAmount, ethers.constants.AddressZero))
        .to.be.revertedWithCustomError(usdcBatchingManager, 'InvalidInput')
        .withArgs(34);
    });

    it('Single User Deposit', async () => {
      const depositAmount = parseUnits('100', 6);
      await usdc.connect(users[1]).approve(usdcBatchingManager.address, depositAmount);
      await expect(() =>
        usdcBatchingManager.connect(users[1]).depositUsdc(depositAmount, users[1].address),
      ).to.changeTokenBalances(usdc, [users[1], usdcBatchingManager], [depositAmount.mul(-1n), depositAmount]);

      const user1Deposit = await usdcBatchingManager.userDeposits(users[1].address);
      // console.log(user1Deposit);
      expect(user1Deposit.round).to.eq(1);
      expect(user1Deposit.usdcBalance).to.eq(depositAmount);
      expect(user1Deposit.unclaimedShares).to.eq(0);

      expect(await usdcBatchingManager.roundUsdcBalance()).to.eq(user1Deposit.usdcBalance);
      expect(await fsGlp.balanceOf(usdcBatchingManager.address)).to.eq(0);
    });

    it('Single User Deposit To Receiver', async () => {
      const depositAmount = parseUnits('100', 6);
      await usdc.connect(users[1]).approve(usdcBatchingManager.address, depositAmount);
      await expect(() =>
        usdcBatchingManager.connect(users[1]).depositUsdc(depositAmount, users[2].address),
      ).to.changeTokenBalances(usdc, [users[1], usdcBatchingManager], [depositAmount.mul(-1n), depositAmount]);

      const user2Deposit = await usdcBatchingManager.userDeposits(users[2].address);
      // console.log(user2Deposit);
      expect(user2Deposit.round).to.eq(1);
      expect(user2Deposit.usdcBalance).to.eq(depositAmount);
      expect(user2Deposit.unclaimedShares).to.eq(0);

      expect(await usdcBatchingManager.roundUsdcBalance()).to.eq(user2Deposit.usdcBalance);
      expect(await fsGlp.balanceOf(usdcBatchingManager.address)).to.eq(0);
    });

    it('Multiple User Deposit', async () => {
      const depositAmount = parseUnits('100', 6);
      await usdc.connect(users[1]).approve(usdcBatchingManager.address, depositAmount);

      await expect(() =>
        usdcBatchingManager.connect(users[1]).depositUsdc(depositAmount, users[1].address),
      ).to.changeTokenBalance(usdc, users[1], depositAmount.mul(-1n));

      const usdcBalanceAfterUser1Deposit = await usdc.balanceOf(usdcBatchingManager.address);

      await generateErc20Balance(usdc, depositAmount, dnGmxJuniorVault.address);

      const glpBalanceAfterVaultDeposit = await fsGlp.balanceOf(usdcBatchingManager.address);
      await usdc.connect(users[2]).approve(usdcBatchingManager.address, depositAmount);
      await generateErc20Balance(usdc, depositAmount, users[2].address);

      await expect(() =>
        usdcBatchingManager.connect(users[2]).depositUsdc(depositAmount, users[2].address),
      ).to.changeTokenBalance(usdc, users[2], depositAmount.mul(-1n));

      const usdcBalanceAfterUser2Deposit = await usdc.balanceOf(usdcBatchingManager.address);

      const vaultDeposit = await usdcBatchingManager.dnGmxJuniorVaultGlpBalance();

      const user1Deposit = await usdcBatchingManager.userDeposits(users[1].address);

      const user2Deposit = await usdcBatchingManager.userDeposits(users[2].address);
      // console.log(user2Deposit);

      // console.log(user1Deposit);
      expect(user1Deposit.round).to.eq(1);
      expect(user1Deposit.usdcBalance).to.eq(usdcBalanceAfterUser1Deposit);
      expect(user1Deposit.unclaimedShares).to.eq(0);

      // console.log(vaultDeposit);
      expect(vaultDeposit).to.eq(glpBalanceAfterVaultDeposit);

      expect(user2Deposit.round).to.eq(1);
      expect(user2Deposit.usdcBalance).to.eq(usdcBalanceAfterUser2Deposit.sub(usdcBalanceAfterUser1Deposit));
      expect(user2Deposit.unclaimedShares).to.eq(0);

      expect(await usdcBatchingManager.roundUsdcBalance()).to.eq(usdcBalanceAfterUser2Deposit);
      expect(await usdcBatchingManager.roundGlpStaked()).to.eq(0);
      expect(await fsGlp.balanceOf(usdcBatchingManager.address)).to.eq(glpBalanceAfterVaultDeposit);
    });
  });

  describe('Execute Batch', () => {
    /**
     * add checks for roundGlpStaked
     * balanceOf glpBatchingManager
     * pause statuses
     */
    it('fails - No usdc deposits when executing batch', async () => {
      await expect(usdcBatchingManager.executeBatch(MAX_CONVERSION_BPS)).to.revertedWithCustomError(
        usdcBatchingManager,
        'NoUsdcBalance',
      );
    });
    it('fails - Zero amount when depositing usdc', async () => {
      const depositAmount = 0;
      await usdc.connect(users[1]).approve(usdcBatchingManager.address, ethers.constants.MaxUint256);
      await expect(usdcBatchingManager.connect(users[1]).depositUsdc(depositAmount, users[1].address))
        .to.be.revertedWithCustomError(usdcBatchingManager, 'InvalidInput')
        .withArgs(33);
    });
    it('fails - zero conversion bps', async () => {
      await expect(usdcBatchingManager.executeBatch(0))
        .to.be.revertedWithCustomError(usdcBatchingManager, 'InvalidInput')
        .withArgs(64);
    });
    it('fails - Less than threshold amount when depositing usdc', async () => {
      const depositAmount = parseUnits('9', 6);
      await usdc.connect(users[1]).approve(usdcBatchingManager.address, ethers.constants.MaxUint256);
      await expect(usdcBatchingManager.connect(users[1]).depositUsdc(depositAmount, users[1].address))
        .to.be.revertedWithCustomError(usdcBatchingManager, 'InvalidInput')
        .withArgs(35);
    });
    it('Single User Deposit (multiple times) + full executeBatch', async () => {
      expect(await usdcBatchingManager.currentRound()).to.eq(1);
      expect(await usdcBatchingManager.roundGlpStaked()).to.eq(BigNumber.from(0));

      const depositAmount = parseUnits('100', 6);
      await usdc.connect(users[1]).approve(usdcBatchingManager.address, ethers.constants.MaxUint256);
      await usdcBatchingManager.connect(users[1]).depositUsdc(depositAmount, users[1].address);

      expect(await usdcBatchingManager.currentRound()).to.eq(1);
      expect(await usdcBatchingManager.roundGlpStaked()).to.eq(BigNumber.from(0));

      const roundUsdcBalance = await usdcBatchingManager.roundUsdcBalance();

      expect(roundUsdcBalance).to.eq(depositAmount);

      expect(await usdcBatchingManager.paused()).to.be.false;

      await expect(usdcBatchingManager.executeBatch(depositAmount))
        .to.changeTokenBalance(usdc, usdcBatchingManager, roundUsdcBalance.mul(-1))
        .to.changeTokenBalance(fsGlp, usdcBatchingManager, 0)
        .to.emit(usdcBatchingManager, 'BatchStake')
        .to.emit(usdcBatchingManager, 'BatchDeposit')
        .to.emit(usdcBatchingManager, 'PartialBatchDeposit');

      expect(await usdcBatchingManager.paused()).to.be.false;
      expect(await usdcBatchingManager.currentRound()).to.eq(2);

      const roundGlpStaked = await usdcBatchingManager.roundGlpStaked();

      // because current round has changed and hence reset to 0
      expect(roundGlpStaked).to.eq(0);
      expect(await fsGlp.balanceOf(usdcBatchingManager.address)).to.eq(0);

      const round1Deposit = await usdcBatchingManager.roundDeposits(1);
      const user1Deposit = await usdcBatchingManager.userDeposits(users[1].address);
      const unclaimedShares = await usdcBatchingManager.unclaimedShares(users[1].address);

      const batchingManagerTotalSharesBal = await dnGmxJuniorVault.balanceOf(usdcBatchingManager.address);

      expect(user1Deposit.round).to.eq(1);
      expect(round1Deposit.totalUsdc).to.eq(roundUsdcBalance);
      // since user has not made any deposit after initial deposit
      // and because userDeposits mapping is lazily updated,
      // unclaimed shares should not be reflected until next interaction of user
      expect(user1Deposit.unclaimedShares).to.eq(0);
      // but it should be account if unclaimed shares function is called
      expect(unclaimedShares).to.gt(0);
      expect(unclaimedShares).to.eq(round1Deposit.totalShares);
      expect(unclaimedShares).to.eq(batchingManagerTotalSharesBal);

      await usdcBatchingManager.connect(users[1]).depositUsdc(depositAmount, users[1].address);

      const round2Deposit = await usdcBatchingManager.roundDeposits(2);
      const round2UsdcBalance = await usdcBatchingManager.roundUsdcBalance();
      const user1NextDeposit = await usdcBatchingManager.userDeposits(users[1].address);

      expect(user1NextDeposit.round).to.eq(2);
      expect(user1NextDeposit.usdcBalance).to.eq(depositAmount);
      expect(user1NextDeposit.unclaimedShares).to.eq(unclaimedShares);
      expect(await usdcBatchingManager.unclaimedShares(users[1].address)).eq(unclaimedShares);

      // because batch execution has not yet taken place
      expect(round2Deposit.totalUsdc).to.eq(0);
      expect(round2Deposit.totalShares).to.eq(0);
      // usdc deposits in round 2 should be of only user
      expect(round2UsdcBalance).to.eq(depositAmount);
    });

    it('Single User Deposit + partial executeBatch', async () => {
      const CONVERSION_BPS = 4_000;

      expect(await usdcBatchingManager.currentRound()).to.eq(1);
      expect(await usdcBatchingManager.roundGlpStaked()).to.eq(BigNumber.from(0));

      const depositAmount = parseUnits('100', 6);
      await usdc.connect(users[1]).approve(usdcBatchingManager.address, ethers.constants.MaxUint256);
      await usdcBatchingManager.connect(users[1]).depositUsdc(depositAmount, users[1].address);

      expect(await usdcBatchingManager.currentRound()).to.eq(1);
      expect(await usdcBatchingManager.roundGlpStaked()).to.eq(BigNumber.from(0));

      const roundUsdcBalance = await usdcBatchingManager.roundUsdcBalance();

      expect(roundUsdcBalance).to.eq(depositAmount);

      expect(await usdcBatchingManager.paused()).to.be.false;

      await expect(usdcBatchingManager.executeBatch(roundUsdcBalance.mul(CONVERSION_BPS).div(MAX_CONVERSION_BPS)))
        .to.changeTokenBalance(usdc, usdcBatchingManager, roundUsdcBalance.mul(-CONVERSION_BPS).div(MAX_CONVERSION_BPS))
        .to.emit(usdcBatchingManager, 'BatchStake')
        .to.emit(usdcBatchingManager, 'PartialBatchDeposit');

      expect(await usdcBatchingManager.paused()).to.be.true;
      expect(await usdcBatchingManager.currentRound()).to.eq(1);

      const roundGlpStaked = await usdcBatchingManager.roundGlpStaked();

      // should be non-zero
      expect(roundGlpStaked).to.not.eq(0);
      // should not have any sglp at all, all should be converted to shares
      expect(await fsGlp.balanceOf(usdcBatchingManager.address)).to.eq(0);

      let round1Deposit = await usdcBatchingManager.roundDeposits(1);
      let user1Deposit = await usdcBatchingManager.userDeposits(users[1].address);
      let unclaimedShares = await usdcBatchingManager.unclaimedShares(users[1].address);

      let batchingManagerTotalSharesBal = await dnGmxJuniorVault.balanceOf(usdcBatchingManager.address);

      expect(user1Deposit.round).to.eq(1);
      // totalUsdc should be usdc amount that is converted to shares in ongoing round
      expect(round1Deposit.totalUsdc).to.eq(roundUsdcBalance.mul(CONVERSION_BPS).div(MAX_CONVERSION_BPS));
      // since user has not made any deposit after initial deposit
      // and because userDeposits mapping is lazily updated,
      // unclaimed shares should not be reflected until next interaction of user
      expect(user1Deposit.unclaimedShares).to.eq(0);
      // unclaimed shares should also be zero, since currentRound has not yet finshed
      expect(unclaimedShares).to.eq(0);
      // total shares should be non-zero, since some usdc in that round is converted
      expect(round1Deposit.totalShares).to.not.eq(0);
      expect(round1Deposit.totalShares).to.eq(batchingManagerTotalSharesBal);

      // complete rest of the batch
      await expect(usdcBatchingManager.executeBatch(roundUsdcBalance))
        .to.changeTokenBalance(
          usdc,
          usdcBatchingManager,
          roundUsdcBalance.mul(-MAX_CONVERSION_BPS + CONVERSION_BPS).div(MAX_CONVERSION_BPS),
        )
        .to.emit(usdcBatchingManager, 'BatchStake')
        .to.emit(usdcBatchingManager, 'BatchDeposit')
        .to.emit(usdcBatchingManager, 'PartialBatchDeposit');

      expect(await usdcBatchingManager.paused()).to.be.false;

      round1Deposit = await usdcBatchingManager.roundDeposits(1);
      user1Deposit = await usdcBatchingManager.userDeposits(users[1].address);
      unclaimedShares = await usdcBatchingManager.unclaimedShares(users[1].address);

      batchingManagerTotalSharesBal = await dnGmxJuniorVault.balanceOf(usdcBatchingManager.address);

      expect(user1Deposit.round).to.eq(1);
      // totalUsdc should be now roundUsdcBalance since all usdc in round is converted
      expect(round1Deposit.totalUsdc).to.eq(roundUsdcBalance);
      // since user has not made any deposit after initial deposit
      // and because userDeposits mapping is lazily updated,
      // unclaimed shares should not be reflected until next interaction of user
      expect(user1Deposit.unclaimedShares).to.eq(0);
      expect(round1Deposit.totalShares).to.eq(unclaimedShares);
      expect(round1Deposit.totalShares).to.eq(batchingManagerTotalSharesBal);
    });

    it('Multiple User Deposit + executeBatch', async () => {
      const depositAmount = parseUnits('100', 6);
      await usdc.connect(users[1]).approve(usdcBatchingManager.address, depositAmount);

      expect(await usdcBatchingManager.currentRound()).to.eq(1);

      await expect(() =>
        usdcBatchingManager.connect(users[1]).depositUsdc(depositAmount, users[1].address),
      ).to.changeTokenBalance(usdc, users[1], depositAmount.mul(-1n));

      const usdcBalanceAfterUser1Deposit = await usdc.balanceOf(usdcBatchingManager.address);

      await generateErc20Balance(usdc, depositAmount, dnGmxJuniorVault.address);

      const glpBalanceAfterVaultDeposit = await fsGlp.balanceOf(usdcBatchingManager.address);
      await usdc.connect(users[2]).approve(usdcBatchingManager.address, depositAmount);
      await generateErc20Balance(usdc, depositAmount, users[2].address);

      await expect(() =>
        usdcBatchingManager.connect(users[2]).depositUsdc(depositAmount, users[2].address),
      ).to.changeTokenBalance(usdc, users[2], depositAmount.mul(-1n));

      const usdcBalanceAfterUser2Deposit = await usdc.balanceOf(usdcBatchingManager.address);

      expect(await usdcBatchingManager.roundUsdcBalance()).to.eq(usdcBalanceAfterUser2Deposit);

      // Check sGlp transfer and dnGmxJuniorVault share transfer
      await expect(() => usdcBatchingManager.executeBatch(usdcBalanceAfterUser2Deposit)).to.changeTokenBalance(
        usdc,
        usdcBatchingManager,
        usdcBalanceAfterUser2Deposit.mul(-1),
      );

      expect(await usdcBatchingManager.currentRound()).to.eq(2);

      const roundGlpStaked = await usdcBatchingManager.roundGlpStaked();
      expect(await fsGlp.balanceOf(usdcBatchingManager.address)).to.eq(roundGlpStaked.add(glpBalanceAfterVaultDeposit));

      const user1Deposit = await usdcBatchingManager.userDeposits(users[1].address);
      const user2Deposit = await usdcBatchingManager.userDeposits(users[2].address);

      const user1UnclaimedShares = await usdcBatchingManager.unclaimedShares(users[1].address);
      const user2UnclaimedShares = await usdcBatchingManager.unclaimedShares(users[2].address);

      const round1Deposit = await usdcBatchingManager.roundDeposits(1);

      expect(user1Deposit.round).to.eq(1);
      expect(user1Deposit.unclaimedShares).to.eq(0);
      expect(user1Deposit.usdcBalance).to.eq(usdcBalanceAfterUser1Deposit);

      expect(user2Deposit.round).to.eq(1);
      expect(user2Deposit.unclaimedShares).to.eq(0);
      expect(user2Deposit.usdcBalance).to.eq(usdcBalanceAfterUser2Deposit.sub(usdcBalanceAfterUser1Deposit));

      // because after executing batch, new round is created
      expect(await usdcBatchingManager.roundUsdcBalance()).to.eq(0);

      // sum of usdc amounts of all users
      expect(round1Deposit.totalUsdc).to.eq(depositAmount.add(depositAmount));
      expect(user1UnclaimedShares).to.gt(0);
      expect(user2UnclaimedShares).to.gt(0);
      expect(round1Deposit.totalShares).to.eq(user1UnclaimedShares.add(user2UnclaimedShares));
    });

    it('Single User Deposit + hitting minUsdcConversionAmount checks', async () => {});
  });

  describe('Claim', () => {
    it('Fails - Receiver Address 0', async () => {
      const claimAmount = parseUnits('100', 6);

      await expect(usdcBatchingManager.connect(users[1]).claim(ethers.constants.AddressZero, claimAmount))
        .to.be.revertedWithCustomError(usdcBatchingManager, 'InvalidInput')
        .withArgs(16);
    });
    it('Fails - Amount 0', async () => {
      await expect(usdcBatchingManager.connect(users[1]).claim(users[1].address, 0))
        .to.be.revertedWithCustomError(usdcBatchingManager, 'InvalidInput')
        .withArgs(17);
    });
    it('Single User Claim', async () => {
      await dnGmxSeniorVault.connect(users[1]).deposit(parseUnits('10000', 6), users[1].address);

      const depositAmount = parseUnits('100', 6);
      await usdc.connect(users[1]).approve(usdcBatchingManager.address, depositAmount);

      await usdcBatchingManager.connect(users[1]).depositUsdc(depositAmount, users[1].address);

      await usdcBatchingManager.executeBatch(depositAmount);

      // await glpBatchingManager.executeBatchDeposit(parseUnits('1000000000000', 18));

      const roundDeposit = await usdcBatchingManager.roundDeposits(1);

      await expect(usdcBatchingManager.connect(users[1]).claim(users[1].address, roundDeposit.totalShares.add(1)))
        .to.be.revertedWithCustomError(usdcBatchingManager, 'InsufficientShares')
        .withArgs(roundDeposit.totalShares);

      await expect(() =>
        usdcBatchingManager.connect(users[1]).claim(users[1].address, roundDeposit.totalShares),
      ).to.changeTokenBalances(
        dnGmxJuniorVault,
        [usdcBatchingManager, users[1]],
        [roundDeposit.totalShares.mul(-1), roundDeposit.totalShares],
      );

      const user1Deposit = await usdcBatchingManager.userDeposits(users[1].address);

      expect(user1Deposit.round).to.eq(1);
      expect(user1Deposit.usdcBalance).to.eq(0);
      expect(user1Deposit.unclaimedShares).to.eq(0);
      expect(await usdcBatchingManager.paused()).to.be.false;
    });

    it('Single User Claim After another deposit', async () => {
      await dnGmxSeniorVault.connect(users[1]).deposit(parseUnits('10000', 6), users[1].address);

      const depositAmount = parseUnits('100', 6);
      await usdc.connect(users[1]).approve(usdcBatchingManager.address, depositAmount);

      await usdcBatchingManager.connect(users[1]).depositUsdc(depositAmount, users[1].address);

      await usdcBatchingManager.executeBatch(depositAmount);

      await usdc.connect(users[1]).approve(usdcBatchingManager.address, depositAmount);

      await usdcBatchingManager.connect(users[1]).depositUsdc(depositAmount, users[1].address);

      const roundDeposit = await usdcBatchingManager.roundDeposits(1);

      await expect(() =>
        usdcBatchingManager.connect(users[1]).claim(users[1].address, roundDeposit.totalShares),
      ).to.changeTokenBalances(
        dnGmxJuniorVault,
        [usdcBatchingManager, users[1]],
        [roundDeposit.totalShares.mul(-1), roundDeposit.totalShares],
      );

      const user1Deposit = await usdcBatchingManager.userDeposits(users[1].address);

      expect(user1Deposit.round).to.eq(2);
      expect(user1Deposit.usdcBalance).to.eq(depositAmount);
      expect(user1Deposit.unclaimedShares).to.eq(0);
      expect(await usdcBatchingManager.paused()).to.be.false;
    });

    it('Single User Claim To Receiver', async () => {
      await dnGmxSeniorVault.connect(users[1]).deposit(parseUnits('10000', 6), users[1].address);

      const depositAmount = parseUnits('100', 6);
      await usdc.connect(users[1]).approve(usdcBatchingManager.address, depositAmount);

      await usdcBatchingManager.connect(users[1]).depositUsdc(depositAmount, users[1].address);

      await usdcBatchingManager.executeBatch(depositAmount);

      const roundDeposit = await usdcBatchingManager.roundDeposits(1);

      await expect(usdcBatchingManager.connect(users[1]).claim(users[1].address, roundDeposit.totalShares.add(1)))
        .to.be.revertedWithCustomError(usdcBatchingManager, 'InsufficientShares')
        .withArgs(roundDeposit.totalShares);

      await expect(() =>
        usdcBatchingManager.connect(users[1]).claim(users[1].address, roundDeposit.totalShares),
      ).to.changeTokenBalances(
        dnGmxJuniorVault,
        [usdcBatchingManager, users[1]],
        [roundDeposit.totalShares.mul(-1), roundDeposit.totalShares],
      );

      const user1Deposit = await usdcBatchingManager.userDeposits(users[1].address);
      const user2Deposit = await usdcBatchingManager.userDeposits(users[2].address);

      expect(user1Deposit.round).to.eq(1);
      expect(user1Deposit.usdcBalance).to.eq(0);
      expect(user1Deposit.unclaimedShares).to.eq(0);

      expect(user2Deposit.round).to.eq(0);
      expect(user2Deposit.usdcBalance).to.eq(0);
      expect(user2Deposit.unclaimedShares).to.eq(0);

      expect(await usdcBatchingManager.paused()).to.be.false;
    });

    it('Partial Single User Claim', async () => {
      await dnGmxSeniorVault.connect(users[1]).deposit(parseUnits('10000', 6), users[1].address);

      const depositAmount = parseUnits('100', 6);

      await usdc.connect(users[1]).approve(usdcBatchingManager.address, depositAmount);

      await usdcBatchingManager.connect(users[1]).depositUsdc(depositAmount, users[1].address);

      await usdcBatchingManager.executeBatch(depositAmount);

      const user1Share = await usdcBatchingManager.unclaimedShares(users[1].address);
      const shareAmountWithdrawn = user1Share.div(5);

      await expect(() =>
        usdcBatchingManager.connect(users[1]).claim(users[1].address, shareAmountWithdrawn),
      ).to.changeTokenBalances(
        dnGmxJuniorVault,
        [usdcBatchingManager, users[1]],
        [shareAmountWithdrawn.mul(-1), shareAmountWithdrawn],
      );

      const user1Deposit = await usdcBatchingManager.userDeposits(users[1].address);

      expect(user1Deposit.round).to.eq(1);
      expect(user1Deposit.usdcBalance).to.eq(0);
      expect(user1Deposit.unclaimedShares).to.eq(user1Share.sub(shareAmountWithdrawn));
    });
  });

  describe('Claim & Redeem', () => {
    it('claimAndRedeem - when user has unclaimed shares', async () => {
      await dnGmxSeniorVault.connect(users[1]).deposit(parseUnits('20000', 6), users[1].address);

      const amount = parseEther('10000');
      const glpAmount = parseEther('100');
      const depositAmount = parseUnits('100', 6);

      await sGlp.connect(users[0]).transfer(dnGmxJuniorVault.address, amount);

      await generateErc20Balance(usdc, depositAmount, users[1].address);
      await usdc.connect(users[1]).approve(usdcBatchingManager.address, depositAmount);
      await usdcBatchingManager.connect(users[1]).depositUsdc(depositAmount, users[1].address);

      await usdcBatchingManager.executeBatch(depositAmount);

      const unclaimedShares = await usdcBatchingManager.unclaimedShares(users[1].address);
      expect(unclaimedShares).to.gt(0);

      await mintBurnRouter.connect(users[1]).mintAndStakeGlpETH(0, 0, {
        value: parseEther('0.5'),
      });
      await sGlp.connect(users[1]).approve(dnGmxJuniorVault.address, ethers.constants.MaxUint256);
      await dnGmxJuniorVault.connect(users[1]).approve(usdcBatchingManager.address, ethers.constants.MaxUint256);

      await dnGmxJuniorVault.connect(users[1]).deposit(glpAmount, users[1].address);
      const sharesDirect = await dnGmxJuniorVault.balanceOf(users[1].address);

      const glpBalBefore = await fsGlp.balanceOf(users[1].address);

      const tx = await usdcBatchingManager.connect(users[1]).claimAndRedeem(users[1].address);
      const receipt = await tx.wait();

      const glpBalAfter = await fsGlp.balanceOf(users[1].address);

      let shares, assetsReceived;

      for (const log of receipt.logs) {
        if (log.topics[0] === usdcBatchingManager.interface.getEventTopic('ClaimedAndRedeemed')) {
          const args = usdcBatchingManager.interface.parseLog(log).args;
          shares = args.shares;
          assetsReceived = args.assetsReceived;
        }
      }

      expect(shares).to.eq(unclaimedShares.add(sharesDirect));
      expect(glpBalAfter.sub(glpBalBefore)).to.eq(assetsReceived);

      expect(await usdcBatchingManager.unclaimedShares(users[1].address)).to.eq(0);
      expect(await dnGmxJuniorVault.balanceOf(users[1].address)).to.eq(0);
    });

    it('claimAndRedeem - when user does not have any unclaimed shares', async () => {
      await dnGmxSeniorVault.connect(users[1]).deposit(parseUnits('20000', 6), users[1].address);

      const glpAmount = parseEther('100');

      await mintBurnRouter.connect(users[1]).mintAndStakeGlpETH(0, 0, {
        value: parseEther('0.5'),
      });

      await sGlp.connect(users[1]).approve(dnGmxJuniorVault.address, ethers.constants.MaxUint256);
      await dnGmxJuniorVault.connect(users[1]).approve(usdcBatchingManager.address, ethers.constants.MaxUint256);

      await dnGmxJuniorVault.connect(users[1]).deposit(glpAmount, users[1].address);

      await expect(usdcBatchingManager.connect(users[1]).claimAndRedeem(users[1].address))
        .to.be.revertedWithCustomError(usdcBatchingManager, 'InvalidInput')
        .withArgs(17);
    });

    it('claimAndRedeem - receiver different than msg.sender', async () => {
      await dnGmxSeniorVault.connect(users[1]).deposit(parseUnits('20000', 6), users[1].address);

      const amount = parseEther('10000');
      const glpAmount = parseEther('100');
      const depositAmount = parseUnits('100', 6);

      await sGlp.connect(users[0]).transfer(dnGmxJuniorVault.address, amount);

      await generateErc20Balance(usdc, depositAmount, users[1].address);
      await usdc.connect(users[1]).approve(usdcBatchingManager.address, depositAmount);
      await usdcBatchingManager.connect(users[1]).depositUsdc(depositAmount, users[1].address);

      await usdcBatchingManager.executeBatch(depositAmount);

      const unclaimedShares = await usdcBatchingManager.unclaimedShares(users[1].address);
      expect(unclaimedShares).to.gt(0);

      await mintBurnRouter.connect(users[1]).mintAndStakeGlpETH(0, 0, {
        value: parseEther('0.5'),
      });

      await sGlp.connect(users[1]).approve(dnGmxJuniorVault.address, ethers.constants.MaxUint256);
      await dnGmxJuniorVault.connect(users[1]).approve(usdcBatchingManager.address, ethers.constants.MaxUint256);

      await dnGmxJuniorVault.connect(users[1]).deposit(glpAmount, users[1].address);
      const sharesDirect = await dnGmxJuniorVault.balanceOf(users[1].address);

      const glpBalBefore = await fsGlp.balanceOf(users[5].address);

      const tx = await usdcBatchingManager.connect(users[1]).claimAndRedeem(users[5].address);
      const receipt = await tx.wait();

      const glpBalAfter = await fsGlp.balanceOf(users[5].address);

      let shares, assetsReceived;

      for (const log of receipt.logs) {
        if (log.topics[0] === usdcBatchingManager.interface.getEventTopic('ClaimedAndRedeemed')) {
          const args = usdcBatchingManager.interface.parseLog(log).args;
          shares = args.shares;
          assetsReceived = args.assetsReceived;
        }
      }

      expect(shares).to.eq(unclaimedShares.add(sharesDirect));
      expect(glpBalAfter.sub(glpBalBefore)).to.eq(assetsReceived);

      expect(await usdcBatchingManager.unclaimedShares(users[1].address)).to.eq(0);
      expect(await dnGmxJuniorVault.balanceOf(users[1].address)).to.eq(0);
    });
  });
});
