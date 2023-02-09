import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { parseEther, parseUnits } from 'ethers/lib/utils';
import { ethers } from 'hardhat';
import {
  DnGmxBatchingManagerGlp,
  DnGmxJuniorVaultMock,
  DnGmxSeniorVault,
  ERC20Upgradeable,
  IRewardRouterV2,
} from '../typechain-types';
import { dnGmxJuniorVaultFixture } from './fixtures/dn-gmx-junior-vault';
import { generateErc20Balance } from './utils/generator';
import { BigNumber } from 'ethers';

describe('Dn Gmx Batching Manager Glp', () => {
  let dnGmxJuniorVault: DnGmxJuniorVaultMock;
  let glpBatchingManager: DnGmxBatchingManagerGlp;
  let mintBurnRouter: IRewardRouterV2;
  let users: SignerWithAddress[];
  let sGlp: ERC20Upgradeable;
  let usdc: ERC20Upgradeable;
  let fsGlp: ERC20Upgradeable;

  let dnGmxSeniorVault: DnGmxSeniorVault;

  let MAX_CONVERSION_BPS = 10_000;

  beforeEach(async () => {
    ({ dnGmxJuniorVault, dnGmxSeniorVault, glpBatchingManager, users, fsGlp, usdc, sGlp, mintBurnRouter } =
      await dnGmxJuniorVaultFixture());
  });

  describe('Deposit', () => {
    it('default state - unpaused', async () => {
      expect(await glpBatchingManager.paused()).to.be.false;
    });

    it('Fails - Amount 0', async () => {
      await expect(glpBatchingManager.connect(users[1]).deposit(0, users[1].address))
        .to.be.revertedWithCustomError(glpBatchingManager, 'InvalidInput')
        .withArgs(33);
    });
    it('Fails - Receiver Address 0', async () => {
      const depositAmount = parseUnits('100', 18);

      await expect(glpBatchingManager.connect(users[1]).deposit(depositAmount, ethers.constants.AddressZero))
        .to.be.revertedWithCustomError(glpBatchingManager, 'InvalidInput')
        .withArgs(34);
    });

    it('Single User Deposit', async () => {
      const depositAmount = parseUnits('100', 18);
      await sGlp.connect(users[1]).approve(glpBatchingManager.address, depositAmount);
      await expect(() =>
        glpBatchingManager.connect(users[1]).deposit(depositAmount, users[1].address),
      ).to.changeTokenBalances(fsGlp, [users[1], glpBatchingManager], [depositAmount.mul(-1n), depositAmount]);

      const user1Deposit = await glpBatchingManager.userDeposits(users[1].address);
      // console.log(user1Deposit);
      expect(user1Deposit.round).to.eq(1);
      expect(user1Deposit.assetBalance).to.eq(depositAmount);
      expect(user1Deposit.unclaimedShares).to.eq(0);

      expect(await glpBatchingManager.roundAssetBalance()).to.eq(user1Deposit.assetBalance);
    });

    it('Single User Deposit To Receiver', async () => {
      const depositAmount = parseUnits('100', 18);
      await sGlp.connect(users[1]).approve(glpBatchingManager.address, depositAmount);
      await expect(() =>
        glpBatchingManager.connect(users[1]).deposit(depositAmount, users[2].address),
      ).to.changeTokenBalances(fsGlp, [users[1], glpBatchingManager], [depositAmount.mul(-1n), depositAmount]);

      const user2Deposit = await glpBatchingManager.userDeposits(users[2].address);
      // console.log(user2Deposit);
      expect(user2Deposit.round).to.eq(1);
      expect(user2Deposit.assetBalance).to.eq(depositAmount);
      expect(user2Deposit.unclaimedShares).to.eq(0);

      expect(await glpBatchingManager.roundAssetBalance()).to.eq(user2Deposit.assetBalance);
    });

    it('Multiple User Deposit', async () => {
      await mintBurnRouter.connect(users[2]).mintAndStakeGlpETH(0, 0, {
        value: parseEther('10'),
      });

      const depositAmount = parseUnits('100', 18);
      await sGlp.connect(users[1]).approve(glpBatchingManager.address, depositAmount);
      await sGlp.connect(users[2]).approve(glpBatchingManager.address, depositAmount);

      await expect(() =>
        glpBatchingManager.connect(users[1]).deposit(depositAmount, users[1].address),
      ).to.changeTokenBalance(fsGlp, users[1], depositAmount.mul(-1n));

      const assetBalanceAfterUser1Deposit = await fsGlp.balanceOf(glpBatchingManager.address);

      await generateErc20Balance(usdc, depositAmount, dnGmxJuniorVault.address);

      await usdc.connect(users[2]).approve(glpBatchingManager.address, depositAmount);
      await generateErc20Balance(usdc, depositAmount, users[2].address);

      await expect(() =>
        glpBatchingManager.connect(users[2]).deposit(depositAmount, users[2].address),
      ).to.changeTokenBalance(fsGlp, users[2], depositAmount.mul(-1n));

      const assetBalanceAfterUser2Deposit = await fsGlp.balanceOf(glpBatchingManager.address);

      const user1Deposit = await glpBatchingManager.userDeposits(users[1].address);

      const user2Deposit = await glpBatchingManager.userDeposits(users[2].address);
      // console.log(user2Deposit);

      // console.log(user1Deposit);
      expect(user1Deposit.round).to.eq(1);
      expect(user1Deposit.assetBalance).to.eq(assetBalanceAfterUser1Deposit);
      expect(user1Deposit.unclaimedShares).to.eq(0);

      expect(user2Deposit.round).to.eq(1);
      expect(user2Deposit.assetBalance).to.eq(assetBalanceAfterUser2Deposit.sub(assetBalanceAfterUser1Deposit));
      expect(user2Deposit.unclaimedShares).to.eq(0);

      expect(await glpBatchingManager.roundAssetBalance()).to.eq(assetBalanceAfterUser2Deposit);
      expect(await glpBatchingManager.roundGlpDeposited()).to.eq(0);
    });
  });

  describe('Execute Batch', () => {
    /**
     * add checks for roundGlpDeposited
     * balanceOf gmxBatchingManagerGlp
     * pause statuses
     */
    it('fails - No usdc deposits when executing batch', async () => {
      await expect(glpBatchingManager.executeBatch(MAX_CONVERSION_BPS)).to.revertedWithCustomError(
        glpBatchingManager,
        'NoAssetBalance',
      );
    });
    it('fails - Zero amount when depositing usdc', async () => {
      const depositAmount = 0;
      await sGlp.connect(users[1]).approve(glpBatchingManager.address, ethers.constants.MaxUint256);
      await expect(glpBatchingManager.connect(users[1]).deposit(depositAmount, users[1].address))
        .to.be.revertedWithCustomError(glpBatchingManager, 'InvalidInput')
        .withArgs(33);
    });
    it('fails - zero conversion bps', async () => {
      await expect(glpBatchingManager.executeBatch(0))
        .to.be.revertedWithCustomError(glpBatchingManager, 'InvalidInput')
        .withArgs(64);
    });
    it('fails - Less than threshold amount when depositing usdc', async () => {
      const depositAmount = parseUnits('9', 6);
      await sGlp.connect(users[1]).approve(glpBatchingManager.address, ethers.constants.MaxUint256);
      await expect(glpBatchingManager.connect(users[1]).deposit(depositAmount, users[1].address))
        .to.be.revertedWithCustomError(glpBatchingManager, 'InvalidInput')
        .withArgs(35);
    });
    it('Single User Deposit (multiple times) + full executeBatch', async () => {
      expect(await glpBatchingManager.currentRound()).to.eq(1);
      expect(await glpBatchingManager.roundGlpDeposited()).to.eq(BigNumber.from(0));

      const depositAmount = parseUnits('100', 18);
      await sGlp.connect(users[1]).approve(glpBatchingManager.address, ethers.constants.MaxUint256);
      await glpBatchingManager.connect(users[1]).deposit(depositAmount, users[1].address);

      expect(await glpBatchingManager.currentRound()).to.eq(1);
      expect(await glpBatchingManager.roundGlpDeposited()).to.eq(BigNumber.from(0));

      const roundAssetBalance = await glpBatchingManager.roundAssetBalance();

      expect(roundAssetBalance).to.eq(depositAmount);

      expect(await glpBatchingManager.paused()).to.be.false;

      await expect(glpBatchingManager.executeBatch(depositAmount))
        .to.changeTokenBalance(fsGlp, glpBatchingManager, roundAssetBalance.mul(-1))
        .to.emit(glpBatchingManager, 'BatchDeposit')
        .to.emit(glpBatchingManager, 'PartialBatchDeposit');

      expect(await glpBatchingManager.paused()).to.be.false;
      expect(await glpBatchingManager.currentRound()).to.eq(2);

      const roundGlpDeposited = await glpBatchingManager.roundGlpDeposited();

      // because current round has changed and hence reset to 0
      expect(roundGlpDeposited).to.eq(0);
      expect(await fsGlp.balanceOf(glpBatchingManager.address)).to.eq(0);

      const round1Deposit = await glpBatchingManager.roundDeposits(1);
      const user1Deposit = await glpBatchingManager.userDeposits(users[1].address);
      const unclaimedShares = await glpBatchingManager.unclaimedShares(users[1].address);

      const batchingManagerTotalSharesBal = await dnGmxJuniorVault.balanceOf(glpBatchingManager.address);

      expect(user1Deposit.round).to.eq(1);
      expect(round1Deposit.totalAssets).to.eq(roundAssetBalance);
      // since user has not made any deposit after initial deposit
      // and because userDeposits mapping is lazily updated,
      // unclaimed shares should not be reflected until next interaction of user
      expect(user1Deposit.unclaimedShares).to.eq(0);
      // but it should be account if unclaimed shares function is called
      expect(unclaimedShares).to.gt(0);
      expect(unclaimedShares).to.eq(round1Deposit.totalShares);
      expect(unclaimedShares).to.eq(batchingManagerTotalSharesBal);

      await glpBatchingManager.connect(users[1]).deposit(depositAmount, users[1].address);

      const round2Deposit = await glpBatchingManager.roundDeposits(2);
      const round2UsdcBalance = await glpBatchingManager.roundAssetBalance();
      const user1NextDeposit = await glpBatchingManager.userDeposits(users[1].address);

      expect(user1NextDeposit.round).to.eq(2);
      expect(user1NextDeposit.assetBalance).to.eq(depositAmount);
      expect(user1NextDeposit.unclaimedShares).to.eq(unclaimedShares);
      expect(await glpBatchingManager.unclaimedShares(users[1].address)).eq(unclaimedShares);

      // because batch execution has not yet taken place
      expect(round2Deposit.totalAssets).to.eq(0);
      expect(round2Deposit.totalShares).to.eq(0);
      // usdc deposits in round 2 should be of only user
      expect(round2UsdcBalance).to.eq(depositAmount);
    });

    it('Single User Deposit + partial executeBatch', async () => {
      const CONVERSION_BPS = 4_000;

      expect(await glpBatchingManager.currentRound()).to.eq(1);
      expect(await glpBatchingManager.roundGlpDeposited()).to.eq(BigNumber.from(0));

      const depositAmount = parseUnits('100', 18);
      await sGlp.connect(users[1]).approve(glpBatchingManager.address, ethers.constants.MaxUint256);
      await glpBatchingManager.connect(users[1]).deposit(depositAmount, users[1].address);

      expect(await glpBatchingManager.currentRound()).to.eq(1);
      expect(await glpBatchingManager.roundGlpDeposited()).to.eq(BigNumber.from(0));

      const roundAssetBalance = await glpBatchingManager.roundAssetBalance();

      expect(roundAssetBalance).to.eq(depositAmount);

      expect(await glpBatchingManager.paused()).to.be.false;

      await expect(glpBatchingManager.executeBatch(roundAssetBalance.mul(CONVERSION_BPS).div(MAX_CONVERSION_BPS)))
        .to.changeTokenBalance(
          fsGlp,
          glpBatchingManager,
          roundAssetBalance.mul(-CONVERSION_BPS).div(MAX_CONVERSION_BPS),
        )
        .to.emit(glpBatchingManager, 'PartialBatchDeposit');

      expect(await glpBatchingManager.paused()).to.be.true;
      expect(await glpBatchingManager.currentRound()).to.eq(1);

      const roundGlpDeposited = await glpBatchingManager.roundGlpDeposited();

      // should be non-zero
      expect(roundGlpDeposited).to.not.eq(0);

      let round1Deposit = await glpBatchingManager.roundDeposits(1);
      let user1Deposit = await glpBatchingManager.userDeposits(users[1].address);
      let unclaimedShares = await glpBatchingManager.unclaimedShares(users[1].address);

      let batchingManagerTotalSharesBal = await dnGmxJuniorVault.balanceOf(glpBatchingManager.address);

      expect(user1Deposit.round).to.eq(1);
      // totalAssets should be usdc amount that is converted to shares in ongoing round
      expect(round1Deposit.totalAssets).to.eq(roundAssetBalance.mul(CONVERSION_BPS).div(MAX_CONVERSION_BPS));
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
      await expect(glpBatchingManager.executeBatch(roundAssetBalance))
        .to.changeTokenBalance(
          fsGlp,
          glpBatchingManager,
          roundAssetBalance.mul(-MAX_CONVERSION_BPS + CONVERSION_BPS).div(MAX_CONVERSION_BPS),
        )
        .to.emit(glpBatchingManager, 'BatchDeposit')
        .to.emit(glpBatchingManager, 'PartialBatchDeposit');

      expect(await glpBatchingManager.paused()).to.be.false;

      round1Deposit = await glpBatchingManager.roundDeposits(1);
      user1Deposit = await glpBatchingManager.userDeposits(users[1].address);
      unclaimedShares = await glpBatchingManager.unclaimedShares(users[1].address);

      batchingManagerTotalSharesBal = await dnGmxJuniorVault.balanceOf(glpBatchingManager.address);

      expect(user1Deposit.round).to.eq(1);
      // totalAssets should be now roundAssetBalance since all usdc in round is converted
      expect(round1Deposit.totalAssets).to.eq(roundAssetBalance);
      // since user has not made any deposit after initial deposit
      // and because userDeposits mapping is lazily updated,
      // unclaimed shares should not be reflected until next interaction of user
      expect(user1Deposit.unclaimedShares).to.eq(0);
      expect(round1Deposit.totalShares).to.eq(unclaimedShares);
      expect(round1Deposit.totalShares).to.eq(batchingManagerTotalSharesBal);
    });

    it('Multiple User Deposit + executeBatch', async () => {
      await mintBurnRouter.connect(users[2]).mintAndStakeGlpETH(0, 0, {
        value: parseEther('10'),
      });

      const depositAmount = parseUnits('100', 18);
      await sGlp.connect(users[1]).approve(glpBatchingManager.address, depositAmount);
      await sGlp.connect(users[2]).approve(glpBatchingManager.address, depositAmount);

      expect(await glpBatchingManager.currentRound()).to.eq(1);

      await expect(() =>
        glpBatchingManager.connect(users[1]).deposit(depositAmount, users[1].address),
      ).to.changeTokenBalance(fsGlp, users[1], depositAmount.mul(-1n));

      const assetBalanceAfterUser1Deposit = await fsGlp.balanceOf(glpBatchingManager.address);

      await generateErc20Balance(usdc, depositAmount, dnGmxJuniorVault.address);

      await usdc.connect(users[2]).approve(glpBatchingManager.address, depositAmount);
      await generateErc20Balance(usdc, depositAmount, users[2].address);

      await expect(() =>
        glpBatchingManager.connect(users[2]).deposit(depositAmount, users[2].address),
      ).to.changeTokenBalance(fsGlp, users[2], depositAmount.mul(-1n));

      const assetBalanceAfterUser2Deposit = await fsGlp.balanceOf(glpBatchingManager.address);

      expect(await glpBatchingManager.roundAssetBalance()).to.eq(assetBalanceAfterUser2Deposit);

      // Check sGlp transfer and dnGmxJuniorVault share transfer
      await expect(() => glpBatchingManager.executeBatch(assetBalanceAfterUser2Deposit)).to.changeTokenBalance(
        fsGlp,
        glpBatchingManager,
        assetBalanceAfterUser2Deposit.mul(-1),
      );

      expect(await glpBatchingManager.currentRound()).to.eq(2);

      // batching execution makes sglp 0 and shares non-zero
      expect(await fsGlp.balanceOf(glpBatchingManager.address)).to.eq(0);
      expect(await dnGmxJuniorVault.balanceOf(glpBatchingManager.address)).to.not.eq(0);

      const user1Deposit = await glpBatchingManager.userDeposits(users[1].address);
      const user2Deposit = await glpBatchingManager.userDeposits(users[2].address);

      const user1UnclaimedShares = await glpBatchingManager.unclaimedShares(users[1].address);
      const user2UnclaimedShares = await glpBatchingManager.unclaimedShares(users[2].address);

      const round1Deposit = await glpBatchingManager.roundDeposits(1);

      expect(user1Deposit.round).to.eq(1);
      expect(user1Deposit.unclaimedShares).to.eq(0);
      expect(user1Deposit.assetBalance).to.eq(assetBalanceAfterUser1Deposit);

      expect(user2Deposit.round).to.eq(1);
      expect(user2Deposit.unclaimedShares).to.eq(0);
      expect(user2Deposit.assetBalance).to.eq(assetBalanceAfterUser2Deposit.sub(assetBalanceAfterUser1Deposit));

      // because after executing batch, new round is created
      expect(await glpBatchingManager.roundAssetBalance()).to.eq(0);

      // sum of usdc amounts of all users
      expect(round1Deposit.totalAssets).to.eq(depositAmount.add(depositAmount));
      expect(user1UnclaimedShares).to.gt(0);
      expect(user2UnclaimedShares).to.gt(0);
      expect(round1Deposit.totalShares).to.eq(user1UnclaimedShares.add(user2UnclaimedShares));
    });

    it('Single User Deposit + hitting minUsdcConversionAmount checks', async () => {});
  });

  describe('Claim', () => {
    it('Fails - Receiver Address 0', async () => {
      const claimAmount = parseUnits('100', 6);

      await expect(glpBatchingManager.connect(users[1]).claim(ethers.constants.AddressZero, claimAmount))
        .to.be.revertedWithCustomError(glpBatchingManager, 'InvalidInput')
        .withArgs(16);
    });
    it('Fails - Amount 0', async () => {
      await expect(glpBatchingManager.connect(users[1]).claim(users[1].address, 0))
        .to.be.revertedWithCustomError(glpBatchingManager, 'InvalidInput')
        .withArgs(17);
    });
    it('Single User Claim', async () => {
      await dnGmxSeniorVault.connect(users[1]).deposit(parseUnits('10000', 6), users[1].address);

      const depositAmount = parseUnits('100', 18);
      await sGlp.connect(users[1]).approve(glpBatchingManager.address, depositAmount);

      await glpBatchingManager.connect(users[1]).deposit(depositAmount, users[1].address);

      await glpBatchingManager.executeBatch(depositAmount);

      // await gmxBatchingManagerGlp.executeBatchDeposit(parseUnits('1000000000000', 18));

      const roundDeposit = await glpBatchingManager.roundDeposits(1);

      await expect(glpBatchingManager.connect(users[1]).claim(users[1].address, roundDeposit.totalShares.add(1)))
        .to.be.revertedWithCustomError(glpBatchingManager, 'InsufficientShares')
        .withArgs(roundDeposit.totalShares);

      await expect(() =>
        glpBatchingManager.connect(users[1]).claim(users[1].address, roundDeposit.totalShares),
      ).to.changeTokenBalances(
        dnGmxJuniorVault,
        [glpBatchingManager, users[1]],
        [roundDeposit.totalShares.mul(-1), roundDeposit.totalShares],
      );

      const user1Deposit = await glpBatchingManager.userDeposits(users[1].address);

      expect(user1Deposit.round).to.eq(1);
      expect(user1Deposit.assetBalance).to.eq(0);
      expect(user1Deposit.unclaimedShares).to.eq(0);
      expect(await glpBatchingManager.paused()).to.be.false;
    });

    it('Single User Claim After another deposit', async () => {
      await dnGmxSeniorVault.connect(users[1]).deposit(parseUnits('10000', 6), users[1].address);

      const depositAmount = parseUnits('100', 18);
      await sGlp.connect(users[1]).approve(glpBatchingManager.address, depositAmount);

      await glpBatchingManager.connect(users[1]).deposit(depositAmount, users[1].address);

      await glpBatchingManager.executeBatch(depositAmount);

      await sGlp.connect(users[1]).approve(glpBatchingManager.address, depositAmount);

      await glpBatchingManager.connect(users[1]).deposit(depositAmount, users[1].address);

      const roundDeposit = await glpBatchingManager.roundDeposits(1);

      await expect(() =>
        glpBatchingManager.connect(users[1]).claim(users[1].address, roundDeposit.totalShares),
      ).to.changeTokenBalances(
        dnGmxJuniorVault,
        [glpBatchingManager, users[1]],
        [roundDeposit.totalShares.mul(-1), roundDeposit.totalShares],
      );

      const user1Deposit = await glpBatchingManager.userDeposits(users[1].address);

      expect(user1Deposit.round).to.eq(2);
      expect(user1Deposit.assetBalance).to.eq(depositAmount);
      expect(user1Deposit.unclaimedShares).to.eq(0);
      expect(await glpBatchingManager.paused()).to.be.false;
    });

    it('Single User Claim To Receiver', async () => {
      await dnGmxSeniorVault.connect(users[1]).deposit(parseUnits('10000', 6), users[1].address);

      const depositAmount = parseUnits('100', 18);
      await sGlp.connect(users[1]).approve(glpBatchingManager.address, depositAmount);

      await glpBatchingManager.connect(users[1]).deposit(depositAmount, users[1].address);

      await glpBatchingManager.executeBatch(depositAmount);

      const roundDeposit = await glpBatchingManager.roundDeposits(1);

      await expect(glpBatchingManager.connect(users[1]).claim(users[1].address, roundDeposit.totalShares.add(1)))
        .to.be.revertedWithCustomError(glpBatchingManager, 'InsufficientShares')
        .withArgs(roundDeposit.totalShares);

      await expect(() =>
        glpBatchingManager.connect(users[1]).claim(users[1].address, roundDeposit.totalShares),
      ).to.changeTokenBalances(
        dnGmxJuniorVault,
        [glpBatchingManager, users[1]],
        [roundDeposit.totalShares.mul(-1), roundDeposit.totalShares],
      );

      const user1Deposit = await glpBatchingManager.userDeposits(users[1].address);
      const user2Deposit = await glpBatchingManager.userDeposits(users[2].address);

      expect(user1Deposit.round).to.eq(1);
      expect(user1Deposit.assetBalance).to.eq(0);
      expect(user1Deposit.unclaimedShares).to.eq(0);

      expect(user2Deposit.round).to.eq(0);
      expect(user2Deposit.assetBalance).to.eq(0);
      expect(user2Deposit.unclaimedShares).to.eq(0);

      expect(await glpBatchingManager.paused()).to.be.false;
    });

    it('Partial Single User Claim', async () => {
      await dnGmxSeniorVault.connect(users[1]).deposit(parseUnits('10000', 6), users[1].address);

      const depositAmount = parseUnits('100', 18);

      await sGlp.connect(users[1]).approve(glpBatchingManager.address, depositAmount);

      await glpBatchingManager.connect(users[1]).deposit(depositAmount, users[1].address);

      await glpBatchingManager.executeBatch(depositAmount);

      const user1Share = await glpBatchingManager.unclaimedShares(users[1].address);
      const shareAmountWithdrawn = user1Share.div(5);

      await expect(() =>
        glpBatchingManager.connect(users[1]).claim(users[1].address, shareAmountWithdrawn),
      ).to.changeTokenBalances(
        dnGmxJuniorVault,
        [glpBatchingManager, users[1]],
        [shareAmountWithdrawn.mul(-1), shareAmountWithdrawn],
      );

      const user1Deposit = await glpBatchingManager.userDeposits(users[1].address);

      expect(user1Deposit.round).to.eq(1);
      expect(user1Deposit.assetBalance).to.eq(0);
      expect(user1Deposit.unclaimedShares).to.eq(user1Share.sub(shareAmountWithdrawn));
    });
  });

  describe('Claim & Redeem', () => {
    it('claimAndRedeem - when user has unclaimed shares', async () => {
      await dnGmxSeniorVault.connect(users[1]).deposit(parseUnits('20000', 6), users[1].address);

      const glpAmount = parseEther('100');
      const depositAmount = parseUnits('100', 18);

      await sGlp.connect(users[0]).approve(dnGmxJuniorVault.address, ethers.constants.MaxUint256);
      await sGlp.connect(users[1]).approve(dnGmxJuniorVault.address, ethers.constants.MaxUint256);

      await dnGmxJuniorVault.connect(users[0]).deposit(depositAmount, users[0].address);

      await sGlp.connect(users[1]).approve(glpBatchingManager.address, ethers.constants.MaxUint256);
      await glpBatchingManager.connect(users[1]).deposit(depositAmount, users[1].address);

      await glpBatchingManager.executeBatch(depositAmount);

      const unclaimedShares = await glpBatchingManager.unclaimedShares(users[1].address);
      expect(unclaimedShares).to.gt(0);

      await mintBurnRouter.connect(users[1]).mintAndStakeGlpETH(0, 0, {
        value: parseEther('0.5'),
      });

      await dnGmxJuniorVault.connect(users[1]).approve(glpBatchingManager.address, ethers.constants.MaxUint256);
      await dnGmxJuniorVault.connect(users[1]).deposit(glpAmount, users[1].address);

      const sharesDirect = await dnGmxJuniorVault.balanceOf(users[1].address);

      const glpBalBefore = await fsGlp.balanceOf(users[1].address);

      const tx = await glpBatchingManager.connect(users[1]).claimAndRedeem(users[1].address);
      const receipt = await tx.wait();

      const glpBalAfter = await fsGlp.balanceOf(users[1].address);

      let shares, assetsReceived;

      for (const log of receipt.logs) {
        if (log.topics[0] === glpBatchingManager.interface.getEventTopic('ClaimedAndRedeemed')) {
          const args = glpBatchingManager.interface.parseLog(log).args;
          shares = args.shares;
          assetsReceived = args.assetsReceived;
        }
      }

      expect(shares).to.eq(unclaimedShares.add(sharesDirect));
      expect(glpBalAfter.sub(glpBalBefore)).to.eq(assetsReceived);

      expect(await glpBatchingManager.unclaimedShares(users[1].address)).to.eq(0);
      expect(await dnGmxJuniorVault.balanceOf(users[1].address)).to.eq(0);
    });

    it('claimAndRedeem - when user does not have any unclaimed shares', async () => {
      await dnGmxSeniorVault.connect(users[1]).deposit(parseUnits('20000', 6), users[1].address);

      const glpAmount = parseEther('100');

      await mintBurnRouter.connect(users[1]).mintAndStakeGlpETH(0, 0, {
        value: parseEther('0.5'),
      });

      await sGlp.connect(users[1]).approve(dnGmxJuniorVault.address, ethers.constants.MaxUint256);
      await dnGmxJuniorVault.connect(users[1]).approve(glpBatchingManager.address, ethers.constants.MaxUint256);

      await dnGmxJuniorVault.connect(users[1]).deposit(glpAmount, users[1].address);

      await expect(glpBatchingManager.connect(users[1]).claimAndRedeem(users[1].address))
        .to.be.revertedWithCustomError(glpBatchingManager, 'InvalidInput')
        .withArgs(17);
    });

    it('claimAndRedeem - receiver different than msg.sender', async () => {
      await dnGmxSeniorVault.connect(users[1]).deposit(parseUnits('20000', 6), users[1].address);

      const glpAmount = parseEther('100');
      const depositAmount = parseUnits('100', 18);

      await sGlp.connect(users[0]).approve(dnGmxJuniorVault.address, ethers.constants.MaxUint256);
      await sGlp.connect(users[1]).approve(dnGmxJuniorVault.address, ethers.constants.MaxUint256);

      await dnGmxJuniorVault.connect(users[0]).deposit(depositAmount, users[0].address);

      await sGlp.connect(users[1]).approve(glpBatchingManager.address, ethers.constants.MaxUint256);
      await glpBatchingManager.connect(users[1]).deposit(depositAmount, users[1].address);

      await glpBatchingManager.executeBatch(depositAmount);

      const unclaimedShares = await glpBatchingManager.unclaimedShares(users[1].address);
      expect(unclaimedShares).to.gt(0);

      await mintBurnRouter.connect(users[1]).mintAndStakeGlpETH(0, 0, {
        value: parseEther('0.5'),
      });

      await sGlp.connect(users[1]).approve(dnGmxJuniorVault.address, ethers.constants.MaxUint256);
      await dnGmxJuniorVault.connect(users[1]).approve(glpBatchingManager.address, ethers.constants.MaxUint256);

      await dnGmxJuniorVault.connect(users[1]).deposit(glpAmount, users[1].address);
      const sharesDirect = await dnGmxJuniorVault.balanceOf(users[1].address);

      const glpBalBefore = await fsGlp.balanceOf(users[5].address);

      const tx = await glpBatchingManager.connect(users[1]).claimAndRedeem(users[5].address);
      const receipt = await tx.wait();

      const glpBalAfter = await fsGlp.balanceOf(users[5].address);

      let shares, assetsReceived;

      for (const log of receipt.logs) {
        if (log.topics[0] === glpBatchingManager.interface.getEventTopic('ClaimedAndRedeemed')) {
          const args = glpBatchingManager.interface.parseLog(log).args;
          shares = args.shares;
          assetsReceived = args.assetsReceived;
        }
      }

      expect(shares).to.eq(unclaimedShares.add(sharesDirect));
      expect(glpBalAfter.sub(glpBalBefore)).to.eq(assetsReceived);

      expect(await glpBatchingManager.unclaimedShares(users[1].address)).to.eq(0);
      expect(await dnGmxJuniorVault.balanceOf(users[1].address)).to.eq(0);
    });
  });
});
