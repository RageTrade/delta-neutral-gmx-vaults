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
  IVault,
} from '../typechain-types';
import { dnGmxJuniorVaultFixture } from './fixtures/dn-gmx-junior-vault';
import { Changer } from './utils/changer';
import { generateErc20Balance } from './utils/generator';
import { increaseBlockTimestamp } from './utils/shared';

describe('Dn Gmx Batching Manager', () => {
  let dnGmxJuniorVault: DnGmxJuniorVaultMock;
  let glpBatchingManager: DnGmxBatchingManager;
  let rewardRouter: IRewardRouterV2;
  let users: SignerWithAddress[];
  let sGlp: ERC20Upgradeable;
  let usdc: ERC20Upgradeable;
  let fsGlp: ERC20Upgradeable;
  let gmxVault: IVault;

  let dnGmxSeniorVault: DnGmxSeniorVault;

  let DEFAULT_CONVERSION_BPS = 5_000;

  beforeEach(async () => {
    ({ dnGmxJuniorVault, dnGmxSeniorVault, glpBatchingManager, users, fsGlp, usdc, sGlp, gmxVault, rewardRouter } =
      await dnGmxJuniorVaultFixture());
  });

  describe('Deposit', () => {
    it('default state - unpaused', async () => {
      expect(await glpBatchingManager.paused()).to.be.false;
    });

    it('Fails - Amount 0', async () => {
      const depositAmount = parseUnits('100', 6);

      await expect(glpBatchingManager.connect(users[1]).depositUsdc(0, users[1].address)).to.be.revertedWith(
        'InvalidInput(33)',
      );
    });
    it('Fails - Receiver Address 0', async () => {
      const depositAmount = parseUnits('100', 6);

      await expect(
        glpBatchingManager.connect(users[1]).depositUsdc(depositAmount, ethers.constants.AddressZero),
      ).to.be.revertedWith('InvalidInput(34)');
    });

    it('Single User Deposit', async () => {
      const depositAmount = parseUnits('100', 6);
      await usdc.connect(users[1]).approve(glpBatchingManager.address, depositAmount);
      await expect(() =>
        glpBatchingManager.connect(users[1]).depositUsdc(depositAmount, users[1].address),
      ).to.changeTokenBalances(usdc, [users[1], glpBatchingManager], [depositAmount.mul(-1n), depositAmount]);

      const user1Deposit = await glpBatchingManager.userDeposits(users[1].address);
      // console.log(user1Deposit);
      expect(user1Deposit.round).to.eq(1);
      expect(user1Deposit.usdcBalance).to.eq(depositAmount);
      expect(user1Deposit.unclaimedShares).to.eq(0);

      expect(await glpBatchingManager.roundUsdcBalance()).to.eq(user1Deposit.usdcBalance);
      expect(await fsGlp.balanceOf(glpBatchingManager.address)).to.eq(0);
    });

    it('Single User Deposit To Receiver', async () => {
      const depositAmount = parseUnits('100', 6);
      await usdc.connect(users[1]).approve(glpBatchingManager.address, depositAmount);
      await expect(() =>
        glpBatchingManager.connect(users[1]).depositUsdc(depositAmount, users[2].address),
      ).to.changeTokenBalances(usdc, [users[1], glpBatchingManager], [depositAmount.mul(-1n), depositAmount]);

      const user2Deposit = await glpBatchingManager.userDeposits(users[2].address);
      // console.log(user2Deposit);
      expect(user2Deposit.round).to.eq(1);
      expect(user2Deposit.usdcBalance).to.eq(depositAmount);
      expect(user2Deposit.unclaimedShares).to.eq(0);

      expect(await glpBatchingManager.roundUsdcBalance()).to.eq(user2Deposit.usdcBalance);
      expect(await fsGlp.balanceOf(glpBatchingManager.address)).to.eq(0);
    });

    it('Single Vault Deposit', async () => {
      const depositAmount = parseUnits('100', 6);

      await generateErc20Balance(usdc, depositAmount, dnGmxJuniorVault.address);
      await expect(() => dnGmxJuniorVault.depositToken(usdc.address, depositAmount, 0)).to.changeTokenBalances(
        usdc,
        [dnGmxJuniorVault, glpBatchingManager],
        [depositAmount.mul(-1n), 0],
      );

      const vaultDeposit = await glpBatchingManager.dnGmxJuniorVaultGlpBalance();
      // console.log(vaultDeposit);
      expect(vaultDeposit).to.eq(await fsGlp.balanceOf(glpBatchingManager.address));

      expect(await glpBatchingManager.roundUsdcBalance()).to.eq(0);
      expect(await fsGlp.balanceOf(glpBatchingManager.address)).to.eq(vaultDeposit);
    });

    it('Multiple User & Vault Deposit', async () => {
      const depositAmount = parseUnits('100', 6);
      await usdc.connect(users[1]).approve(glpBatchingManager.address, depositAmount);

      await expect(() =>
        glpBatchingManager.connect(users[1]).depositUsdc(depositAmount, users[1].address),
      ).to.changeTokenBalance(usdc, users[1], depositAmount.mul(-1n));

      const usdcBalanceAfterUser1Deposit = await usdc.balanceOf(glpBatchingManager.address);

      await generateErc20Balance(usdc, depositAmount, dnGmxJuniorVault.address);
      await expect(() => dnGmxJuniorVault.depositToken(usdc.address, depositAmount, 0)).to.changeTokenBalance(
        usdc,
        dnGmxJuniorVault,
        depositAmount.mul(-1n),
      );

      const glpBalanceAfterVaultDeposit = await fsGlp.balanceOf(glpBatchingManager.address);
      await usdc.connect(users[2]).approve(glpBatchingManager.address, depositAmount);
      await generateErc20Balance(usdc, depositAmount, users[2].address);

      await expect(() =>
        glpBatchingManager.connect(users[2]).depositUsdc(depositAmount, users[2].address),
      ).to.changeTokenBalance(usdc, users[2], depositAmount.mul(-1n));

      const usdcBalanceAfterUser2Deposit = await usdc.balanceOf(glpBatchingManager.address);

      const vaultDeposit = await glpBatchingManager.dnGmxJuniorVaultGlpBalance();

      const user1Deposit = await glpBatchingManager.userDeposits(users[1].address);

      const user2Deposit = await glpBatchingManager.userDeposits(users[2].address);
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

      expect(await glpBatchingManager.roundUsdcBalance()).to.eq(usdcBalanceAfterUser2Deposit);
      expect(await glpBatchingManager.roundGlpStaked()).to.eq(0);
      expect(await fsGlp.balanceOf(glpBatchingManager.address)).to.eq(glpBalanceAfterVaultDeposit);
    });
  });

  describe('Batch Stake', () => {
    it('No Usdc Deposit', async () => {
      //Check sGlp transfer and dnGmxJuniorVault share transfer
      await expect(glpBatchingManager.executeBatch(DEFAULT_CONVERSION_BPS)).to.revertedWith('NoUsdcBalance()');
    });
    it('Single User Batch Stake', async () => {
      const depositAmount = parseUnits('100', 6);
      await usdc.connect(users[1]).approve(glpBatchingManager.address, depositAmount);
      await glpBatchingManager.connect(users[1]).depositUsdc(depositAmount, users[1].address);

      // await increaseBlockTimestamp(15 * 60); //15 mins

      const roundUsdcBalance = await glpBatchingManager.roundUsdcBalance();
      //Check sGlp transfer and dnGmxJuniorVault share transfer
      await expect(() => glpBatchingManager.executeBatch(DEFAULT_CONVERSION_BPS)).to.changeTokenBalance(
        usdc,
        glpBatchingManager,
        roundUsdcBalance.mul(-1),
      );

      expect(await fsGlp.balanceOf(glpBatchingManager.address)).to.eq(await glpBatchingManager.roundGlpStaked());

      const user1Deposit = await glpBatchingManager.userDeposits(users[1].address);
      const round1Deposit = await glpBatchingManager.roundDeposits(1);

      expect(user1Deposit.round).to.eq(1);
      expect(user1Deposit.unclaimedShares).to.eq(0);
      expect(await glpBatchingManager.currentRound()).to.eq(1);
      expect(await glpBatchingManager.roundUsdcBalance()).to.eq(roundUsdcBalance);

      expect(round1Deposit.totalUsdc).to.eq(0);
      expect(round1Deposit.totalShares).to.eq(0);
    });

    it('Multiple User & Vault Batch Stake', async () => {
      const depositAmount = parseUnits('100', 6);
      await usdc.connect(users[1]).approve(glpBatchingManager.address, depositAmount);

      await expect(() =>
        glpBatchingManager.connect(users[1]).depositUsdc(depositAmount, users[1].address),
      ).to.changeTokenBalance(usdc, users[1], depositAmount.mul(-1n));

      const usdcBalanceAfterUser1Deposit = await usdc.balanceOf(glpBatchingManager.address);

      await generateErc20Balance(usdc, depositAmount, dnGmxJuniorVault.address);
      await expect(() => dnGmxJuniorVault.depositToken(usdc.address, depositAmount, 0)).to.changeTokenBalance(
        usdc,
        dnGmxJuniorVault,
        depositAmount.mul(-1n),
      );

      const glpBalanceAfterVaultDeposit = await fsGlp.balanceOf(glpBatchingManager.address);
      await usdc.connect(users[2]).approve(glpBatchingManager.address, depositAmount);
      await generateErc20Balance(usdc, depositAmount, users[2].address);

      await expect(() =>
        glpBatchingManager.connect(users[2]).depositUsdc(depositAmount, users[2].address),
      ).to.changeTokenBalance(usdc, users[2], depositAmount.mul(-1n));

      const usdcBalanceAfterUser2Deposit = await usdc.balanceOf(glpBatchingManager.address);

      // console.log(user2Deposit);
      await increaseBlockTimestamp(15 * 60); //15 mins

      //Check sGlp transfer and dnGmxJuniorVault share transfer
      await expect(() => glpBatchingManager.executeBatch(DEFAULT_CONVERSION_BPS)).to.changeTokenBalance(
        usdc,
        glpBatchingManager,
        usdcBalanceAfterUser2Deposit.mul(-1),
      );

      const roundGlpStaked = await glpBatchingManager.roundGlpStaked();
      expect(await fsGlp.balanceOf(glpBatchingManager.address)).to.eq(roundGlpStaked.add(glpBalanceAfterVaultDeposit));

      const vaultDeposit = await glpBatchingManager.dnGmxJuniorVaultGlpBalance();

      const user1Deposit = await glpBatchingManager.userDeposits(users[1].address);

      const user2Deposit = await glpBatchingManager.userDeposits(users[2].address);

      const round1Deposit = await glpBatchingManager.roundDeposits(1);

      expect(user1Deposit.round).to.eq(1);
      expect(user1Deposit.unclaimedShares).to.eq(0);
      expect(user1Deposit.usdcBalance).to.eq(usdcBalanceAfterUser1Deposit);

      expect(user2Deposit.round).to.eq(1);
      expect(user2Deposit.unclaimedShares).to.eq(0);
      expect(user2Deposit.usdcBalance).to.eq(usdcBalanceAfterUser2Deposit.sub(usdcBalanceAfterUser1Deposit));

      expect(await glpBatchingManager.currentRound()).to.eq(1);
      expect(await glpBatchingManager.roundUsdcBalance()).to.eq(usdcBalanceAfterUser2Deposit);

      expect(round1Deposit.totalUsdc).to.eq(0);
      expect(round1Deposit.totalShares).to.eq(0);
    });
  });

  describe('Batch Deposit', () => {
    it('Single User Batch Deposit', async () => {
      await dnGmxSeniorVault.connect(users[1]).deposit(parseUnits('10000', 6), users[1].address);

      const depositAmount = parseUnits('100', 6);
      await usdc.connect(users[1]).approve(glpBatchingManager.address, depositAmount);

      await glpBatchingManager.connect(users[1]).depositUsdc(depositAmount, users[1].address);
      await glpBatchingManager.executeBatch(DEFAULT_CONVERSION_BPS);

      await increaseBlockTimestamp(15 * 60); //15 mins

      const roundUsdcBalance = await glpBatchingManager.roundUsdcBalance();
      const roundGlpStaked = await glpBatchingManager.roundGlpStaked();

      // Check sGlp transfer and dnGmxJuniorVault share transfer
      // await expect(() => glpBatchingManager.executeBatchDeposit(roundGlpStaked)).to.changeTokenBalance(
      //   fsGlp,
      //   glpBatchingManager,
      //   roundGlpStaked.mul(-1),
      // );

      // Since share:asset would be 1:1 initially
      expect(await dnGmxJuniorVault.balanceOf(glpBatchingManager.address)).to.eq(roundGlpStaked);

      const user1Deposit = await glpBatchingManager.userDeposits(users[1].address);
      const round1Deposit = await glpBatchingManager.roundDeposits(1);

      expect(user1Deposit.round).to.eq(1);
      expect(user1Deposit.unclaimedShares).to.eq(0);
      expect(await glpBatchingManager.currentRound()).to.eq(2);
      expect(await glpBatchingManager.roundUsdcBalance()).to.eq(0);
      expect(await glpBatchingManager.roundGlpStaked()).to.eq(0);

      expect(round1Deposit.totalUsdc).to.eq(depositAmount);
      expect(round1Deposit.totalShares).to.eq(roundGlpStaked);
    });

    it('Single User Partial Batch Deposit', async () => {
      await dnGmxSeniorVault.connect(users[1]).deposit(parseUnits('10000', 6), users[1].address);

      const depositAmount = parseUnits('100', 6);
      await usdc.connect(users[1]).approve(glpBatchingManager.address, depositAmount);

      await glpBatchingManager.connect(users[1]).depositUsdc(depositAmount, users[1].address);
      await glpBatchingManager.executeBatch(DEFAULT_CONVERSION_BPS);

      await increaseBlockTimestamp(15 * 60); //15 mins

      const roundUsdcBalance = await glpBatchingManager.roundUsdcBalance();
      const roundGlpStaked = await glpBatchingManager.roundGlpStaked();
      // console.log(roundGlpStaked);

      const glpToDeposit1 = roundGlpStaked.div(3);
      // Check sGlp transfer and dnGmxJuniorVault share transfer
      // await expect(() => glpBatchingManager.executeBatchDeposit(glpToDeposit1)).to.changeTokenBalance(
      //   fsGlp,
      //   glpBatchingManager,
      //   glpToDeposit1.mul(-1),
      // );

      expect(await glpBatchingManager.paused()).to.be.true;

      expect(await glpBatchingManager.currentRound()).to.eq(1);
      expect(await glpBatchingManager.roundUsdcBalance()).to.eq(roundUsdcBalance);
      expect(await glpBatchingManager.roundGlpStaked()).to.eq(roundGlpStaked);
      expect(await glpBatchingManager.roundGlpDepositPending()).to.eq(roundGlpStaked.sub(glpToDeposit1));
      expect(await glpBatchingManager.roundSharesMinted()).to.eq(glpToDeposit1);

      const glpToDeposit2 = glpToDeposit1;
      // await expect(() => glpBatchingManager.executeBatchDeposit(glpToDeposit2)).to.changeTokenBalance(
      //   fsGlp,
      //   glpBatchingManager,
      //   glpToDeposit2.mul(-1),
      // );

      expect(await glpBatchingManager.paused()).to.be.true;

      expect(await glpBatchingManager.currentRound()).to.eq(1);
      expect(await glpBatchingManager.roundUsdcBalance()).to.eq(roundUsdcBalance);
      expect(await glpBatchingManager.roundGlpStaked()).to.eq(roundGlpStaked);
      expect(await glpBatchingManager.roundGlpDepositPending()).to.eq(
        roundGlpStaked.sub(glpToDeposit1.add(glpToDeposit2)),
      );
      expect(await glpBatchingManager.roundSharesMinted()).to.eq(
        await dnGmxJuniorVault.balanceOf(glpBatchingManager.address),
      );

      const glpToDeposit3 = roundGlpStaked.sub(glpToDeposit1.add(glpToDeposit2));
      // await expect(() => glpBatchingManager.executeBatchDeposit(glpToDeposit3)).to.changeTokenBalance(
      //   fsGlp,
      //   glpBatchingManager,
      //   glpToDeposit3.mul(-1),
      // );
      // Since share:asset would be 1:1 initially
      // expect(await dnGmxJuniorVault.balanceOf(glpBatchingManager.address)).to.eq(roundGlpStaked);
      expect(await glpBatchingManager.paused()).to.be.false;

      const user1Deposit = await glpBatchingManager.userDeposits(users[1].address);
      const round1Deposit = await glpBatchingManager.roundDeposits(1);

      expect(user1Deposit.round).to.eq(1);
      expect(user1Deposit.unclaimedShares).to.eq(0);
      expect(await glpBatchingManager.currentRound()).to.eq(2);
      expect(await glpBatchingManager.roundUsdcBalance()).to.eq(0);
      expect(await glpBatchingManager.roundGlpStaked()).to.eq(0);
      expect(await glpBatchingManager.roundGlpDepositPending()).to.eq(0);
      expect(await glpBatchingManager.roundSharesMinted()).to.eq(0);

      expect(round1Deposit.totalUsdc).to.eq(depositAmount);
      expect(round1Deposit.totalShares).to.eq(await dnGmxJuniorVault.balanceOf(glpBatchingManager.address));
    });

    it('Single User Partial Batch Deposit (Last Deposit Slightly Lower)', async () => {
      await dnGmxSeniorVault.connect(users[1]).deposit(parseUnits('10000', 6), users[1].address);

      const depositAmount = parseUnits('100', 6);
      await usdc.connect(users[1]).approve(glpBatchingManager.address, depositAmount);

      await glpBatchingManager.connect(users[1]).depositUsdc(depositAmount, users[1].address);
      await glpBatchingManager.executeBatch(DEFAULT_CONVERSION_BPS);

      await increaseBlockTimestamp(15 * 60); //15 mins

      const roundUsdcBalance = await glpBatchingManager.roundUsdcBalance();
      const roundGlpStaked = await glpBatchingManager.roundGlpStaked();
      // console.log(roundGlpStaked);

      const glpToDeposit1 = roundGlpStaked.div(3).mul(2);
      // Check sGlp transfer and dnGmxJuniorVault share transfer
      // await expect(() => glpBatchingManager.executeBatchDeposit(glpToDeposit1)).to.changeTokenBalance(
      //   fsGlp,
      //   glpBatchingManager,
      //   glpToDeposit1.mul(-1),
      // );

      expect(await glpBatchingManager.currentRound()).to.eq(1);
      expect(await glpBatchingManager.roundUsdcBalance()).to.eq(roundUsdcBalance);
      expect(await glpBatchingManager.roundGlpStaked()).to.eq(roundGlpStaked);
      expect(await glpBatchingManager.roundGlpDepositPending()).to.eq(roundGlpStaked.sub(glpToDeposit1));
      expect(await glpBatchingManager.roundSharesMinted()).to.eq(glpToDeposit1);

      const glpToDeposit2 = roundGlpStaked.sub(glpToDeposit1);
      // await expect(() => glpBatchingManager.executeBatchDeposit(glpToDeposit2.sub(1))).to.changeTokenBalance(
      //   fsGlp,
      //   glpBatchingManager,
      //   glpToDeposit2.mul(-1),
      // );

      const user1Deposit = await glpBatchingManager.userDeposits(users[1].address);
      const round1Deposit = await glpBatchingManager.roundDeposits(1);

      expect(user1Deposit.round).to.eq(1);
      expect(user1Deposit.unclaimedShares).to.eq(0);
      expect(await glpBatchingManager.currentRound()).to.eq(2);
      expect(await glpBatchingManager.roundUsdcBalance()).to.eq(0);
      expect(await glpBatchingManager.roundGlpStaked()).to.eq(0);
      expect(await glpBatchingManager.roundGlpDepositPending()).to.eq(0);
      expect(await glpBatchingManager.roundSharesMinted()).to.eq(0);

      expect(round1Deposit.totalUsdc).to.eq(depositAmount);
      expect(round1Deposit.totalShares).to.eq(await dnGmxJuniorVault.balanceOf(glpBatchingManager.address));
    });

    it('Single User Partial Batch Deposit (Last Deposit Higher)', async () => {
      await dnGmxSeniorVault.connect(users[1]).deposit(parseUnits('10000', 6), users[1].address);

      const depositAmount = parseUnits('100', 6);
      await usdc.connect(users[1]).approve(glpBatchingManager.address, depositAmount);

      await glpBatchingManager.connect(users[1]).depositUsdc(depositAmount, users[1].address);
      await glpBatchingManager.executeBatch(DEFAULT_CONVERSION_BPS);

      await increaseBlockTimestamp(15 * 60); //15 mins

      const roundUsdcBalance = await glpBatchingManager.roundUsdcBalance();
      const roundGlpStaked = await glpBatchingManager.roundGlpStaked();
      // console.log(roundGlpStaked);

      const glpToDeposit1 = roundGlpStaked.div(3).mul(2);
      // Check sGlp transfer and dnGmxJuniorVault share transfer
      // await expect(() => glpBatchingManager.executeBatchDeposit(glpToDeposit1)).to.changeTokenBalance(
      //   fsGlp,
      //   glpBatchingManager,
      //   glpToDeposit1.mul(-1),
      // );

      expect(await glpBatchingManager.currentRound()).to.eq(1);
      expect(await glpBatchingManager.roundUsdcBalance()).to.eq(roundUsdcBalance);
      expect(await glpBatchingManager.roundGlpStaked()).to.eq(roundGlpStaked);
      expect(await glpBatchingManager.roundGlpDepositPending()).to.eq(roundGlpStaked.sub(glpToDeposit1));
      expect(await glpBatchingManager.roundSharesMinted()).to.eq(glpToDeposit1);

      const glpToDeposit2 = roundGlpStaked.sub(glpToDeposit1);
      // await expect(() => glpBatchingManager.executeBatchDeposit(glpToDeposit2.add(1))).to.changeTokenBalance(
      //   fsGlp,
      //   glpBatchingManager,
      //   glpToDeposit2.mul(-1),
      // );

      const user1Deposit = await glpBatchingManager.userDeposits(users[1].address);
      const round1Deposit = await glpBatchingManager.roundDeposits(1);

      expect(user1Deposit.round).to.eq(1);
      expect(user1Deposit.unclaimedShares).to.eq(0);
      expect(await glpBatchingManager.currentRound()).to.eq(2);
      expect(await glpBatchingManager.roundUsdcBalance()).to.eq(0);
      expect(await glpBatchingManager.roundGlpStaked()).to.eq(0);
      expect(await glpBatchingManager.roundGlpDepositPending()).to.eq(0);
      expect(await glpBatchingManager.roundSharesMinted()).to.eq(0);

      expect(round1Deposit.totalUsdc).to.eq(depositAmount);
      expect(round1Deposit.totalShares).to.eq(await dnGmxJuniorVault.balanceOf(glpBatchingManager.address));
    });

    it('Vault User Batch Deposit', async () => {
      const depositAmount = parseUnits('100', 6);
      await generateErc20Balance(usdc, depositAmount, dnGmxJuniorVault.address);

      await dnGmxJuniorVault.depositToken(usdc.address, depositAmount, 0);

      await increaseBlockTimestamp(15 * 60); //15 mins

      const vaultBalanceBefore = await glpBatchingManager.dnGmxJuniorVaultGlpBalance();
      //Check sGlp transfer and dnGmxJuniorVault share transfer
      // await expect(() => glpBatchingManager.executeBatchDeposit(0)).to.changeTokenBalances(
      //   fsGlp,
      //   [glpBatchingManager, dnGmxJuniorVault],
      //   [vaultBalanceBefore.mul(-1), vaultBalanceBefore],
      // );
      const vaultBalance = await glpBatchingManager.dnGmxJuniorVaultGlpBalance();
      expect(vaultBalance).to.eq(0);

      expect(await dnGmxJuniorVault.balanceOf(glpBatchingManager.address)).to.eq(0);

      expect(await glpBatchingManager.currentRound()).to.eq(1);
      expect(await glpBatchingManager.roundUsdcBalance()).to.eq(0);
      expect(await glpBatchingManager.roundGlpStaked()).to.eq(0);
    });

    it('Multiple User & Vault Batch Deposit', async () => {
      await dnGmxSeniorVault.connect(users[1]).deposit(parseUnits('10000', 6), users[1].address);

      const depositAmount = parseUnits('100', 6);
      await usdc.connect(users[1]).approve(glpBatchingManager.address, depositAmount);

      await expect(() =>
        glpBatchingManager.connect(users[1]).depositUsdc(depositAmount, users[1].address),
      ).to.changeTokenBalance(usdc, users[1], depositAmount.mul(-1n));

      const usdcBalanceAfterUser1Deposit = await usdc.balanceOf(glpBatchingManager.address);

      await generateErc20Balance(usdc, depositAmount, dnGmxJuniorVault.address);
      await expect(() => dnGmxJuniorVault.depositToken(usdc.address, depositAmount, 0)).to.changeTokenBalance(
        usdc,
        dnGmxJuniorVault,
        depositAmount.mul(-1n),
      );

      const glpBalanceAfterVaultDeposit = await fsGlp.balanceOf(glpBatchingManager.address);
      await usdc.connect(users[2]).approve(glpBatchingManager.address, depositAmount);
      await generateErc20Balance(usdc, depositAmount, users[2].address);

      await expect(() =>
        glpBatchingManager.connect(users[2]).depositUsdc(depositAmount, users[2].address),
      ).to.changeTokenBalance(usdc, users[2], depositAmount.mul(-1n));

      const usdcBalanceAfterUser2Deposit = await usdc.balanceOf(glpBatchingManager.address);

      // console.log(user2Deposit);

      //Check sGlp transfer and dnGmxJuniorVault share transfer
      await expect(() => glpBatchingManager.executeBatch(DEFAULT_CONVERSION_BPS)).to.changeTokenBalance(
        usdc,
        glpBatchingManager,
        usdcBalanceAfterUser2Deposit.mul(-1),
      );

      await increaseBlockTimestamp(15 * 60); //15 mins

      const roundGlpStaked = await glpBatchingManager.roundGlpStaked();
      expect(await fsGlp.balanceOf(glpBatchingManager.address)).to.eq(roundGlpStaked.add(glpBalanceAfterVaultDeposit));

      //Check sGlp transfer and dnGmxJuniorVault share transfer
      // await expect(() => glpBatchingManager.executeBatchDeposit(roundGlpStaked)).to.changeTokenBalances(
      //   fsGlp,
      //   [glpBatchingManager, dnGmxJuniorVault],
      //   [roundGlpStaked.add(glpBalanceAfterVaultDeposit).mul(-1), roundGlpStaked.add(glpBalanceAfterVaultDeposit)],
      // );

      const vaultDeposit = await glpBatchingManager.dnGmxJuniorVaultGlpBalance();

      const user1Deposit = await glpBatchingManager.userDeposits(users[1].address);

      const user2Deposit = await glpBatchingManager.userDeposits(users[2].address);

      const round1Deposit = await glpBatchingManager.roundDeposits(1);

      expect(user1Deposit.round).to.eq(1);
      expect(user1Deposit.unclaimedShares).to.eq(0);

      expect(vaultDeposit).to.eq(0);

      expect(user2Deposit.round).to.eq(1);
      expect(user2Deposit.unclaimedShares).to.eq(0);

      expect(round1Deposit.totalUsdc).to.eq(usdcBalanceAfterUser2Deposit);
      expect(round1Deposit.totalShares).to.eq(roundGlpStaked);

      expect(await dnGmxJuniorVault.balanceOf(glpBatchingManager.address)).to.eq(roundGlpStaked);

      expect(await glpBatchingManager.currentRound()).to.eq(2);
      expect(await glpBatchingManager.roundGlpStaked()).to.eq(0);
      expect(await glpBatchingManager.roundUsdcBalance()).to.eq(0);
    });
  });

  describe('Claim', () => {
    it('Fails - Receiver Address 0', async () => {
      const claimAmount = parseUnits('100', 6);

      await expect(
        glpBatchingManager.connect(users[1]).claim(ethers.constants.AddressZero, claimAmount),
      ).to.be.revertedWith('InvalidInput(16)');
    });
    it('Fails - Amount 0', async () => {
      await expect(glpBatchingManager.connect(users[1]).claim(users[1].address, 0)).to.be.revertedWith(
        'InvalidInput(17)',
      );
    });
    it('Single User Claim', async () => {
      await dnGmxSeniorVault.connect(users[1]).deposit(parseUnits('10000', 6), users[1].address);

      const depositAmount = parseUnits('100', 6);
      await usdc.connect(users[1]).approve(glpBatchingManager.address, depositAmount);

      await glpBatchingManager.connect(users[1]).depositUsdc(depositAmount, users[1].address);

      // await glpBatchingManager.pauseDeposit();

      // expect(await glpBatchingManager.paused()).to.be.true;

      await glpBatchingManager.executeBatch(DEFAULT_CONVERSION_BPS);

      await increaseBlockTimestamp(15 * 60); //15 mins

      // await glpBatchingManager.executeBatchDeposit(parseUnits('1000000000000', 18));

      const roundDeposit = await glpBatchingManager.roundDeposits(1);

      await expect(
        glpBatchingManager.connect(users[1]).claim(users[1].address, roundDeposit.totalShares.add(1)),
      ).to.be.revertedWith(`InsufficientShares(${roundDeposit.totalShares})`);

      await expect(() =>
        glpBatchingManager.connect(users[1]).claim(users[1].address, roundDeposit.totalShares),
      ).to.changeTokenBalances(
        dnGmxJuniorVault,
        [glpBatchingManager, users[1]],
        [roundDeposit.totalShares.mul(-1), roundDeposit.totalShares],
      );

      const user1Deposit = await glpBatchingManager.userDeposits(users[1].address);

      expect(user1Deposit.round).to.eq(1);
      expect(user1Deposit.usdcBalance).to.eq(0);
      expect(user1Deposit.unclaimedShares).to.eq(0);
      expect(await glpBatchingManager.paused()).to.be.false;
    });

    it('Single User Claim After another deposit', async () => {
      await dnGmxSeniorVault.connect(users[1]).deposit(parseUnits('10000', 6), users[1].address);

      const depositAmount = parseUnits('100', 6);
      await usdc.connect(users[1]).approve(glpBatchingManager.address, depositAmount);

      await glpBatchingManager.connect(users[1]).depositUsdc(depositAmount, users[1].address);

      await glpBatchingManager.executeBatch(DEFAULT_CONVERSION_BPS);
      await increaseBlockTimestamp(15 * 60); //15 mins

      // await glpBatchingManager.executeBatchDeposit(parseUnits('1000000000000', 18));

      const balanceBeforeDeposit = await fsGlp.balanceOf(glpBatchingManager.address);

      await usdc.connect(users[1]).approve(glpBatchingManager.address, depositAmount);

      await glpBatchingManager.connect(users[1]).depositUsdc(depositAmount, users[1].address);

      const depositGlpAmount = (await fsGlp.balanceOf(glpBatchingManager.address)).sub(balanceBeforeDeposit);

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
      expect(user1Deposit.usdcBalance).to.eq(depositAmount);
      expect(user1Deposit.unclaimedShares).to.eq(0);
      expect(await glpBatchingManager.paused()).to.be.false;
    });

    it('Single User Claim To Receiver', async () => {
      await dnGmxSeniorVault.connect(users[1]).deposit(parseUnits('10000', 6), users[1].address);

      const depositAmount = parseUnits('100', 6);
      await usdc.connect(users[1]).approve(glpBatchingManager.address, depositAmount);

      await glpBatchingManager.connect(users[1]).depositUsdc(depositAmount, users[1].address);

      // await glpBatchingManager.pauseDeposit();

      // expect(await glpBatchingManager.paused()).to.be.true;

      await glpBatchingManager.executeBatch(DEFAULT_CONVERSION_BPS);

      await increaseBlockTimestamp(15 * 60); //15 mins

      // await glpBatchingManager.executeBatchDeposit(parseUnits('1000000000000', 18));

      const roundDeposit = await glpBatchingManager.roundDeposits(1);

      await expect(
        glpBatchingManager.connect(users[1]).claim(users[1].address, roundDeposit.totalShares.add(1)),
      ).to.be.revertedWith(`InsufficientShares(${roundDeposit.totalShares})`);

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
      expect(user1Deposit.usdcBalance).to.eq(0);
      expect(user1Deposit.unclaimedShares).to.eq(0);

      expect(user2Deposit.round).to.eq(0);
      expect(user2Deposit.usdcBalance).to.eq(0);
      expect(user2Deposit.unclaimedShares).to.eq(0);

      expect(await glpBatchingManager.paused()).to.be.false;
    });

    it('Partial Single User Claim', async () => {
      await dnGmxSeniorVault.connect(users[1]).deposit(parseUnits('10000', 6), users[1].address);

      const depositAmount = parseUnits('100', 6);

      await usdc.connect(users[1]).approve(glpBatchingManager.address, depositAmount);

      await glpBatchingManager.connect(users[1]).depositUsdc(depositAmount, users[1].address);

      await glpBatchingManager.executeBatch(DEFAULT_CONVERSION_BPS);

      await increaseBlockTimestamp(15 * 60); //15 mins
      const user1Share = await fsGlp.balanceOf(glpBatchingManager.address);

      // await glpBatchingManager.executeBatchDeposit(parseUnits('1000000000000', 18));

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
      expect(user1Deposit.usdcBalance).to.eq(0);
      expect(user1Deposit.unclaimedShares).to.eq(user1Share.sub(shareAmountWithdrawn));
    });
  });

  describe('Stake & Execute', () => {
    it('execute batch', async () => {
      const amount = parseEther('10000');
      const depositAmount = parseUnits('100', 6);

      // console.log('price of usdc from glp (min)', await gmxVault.getMinPrice(usdc.address));
      // console.log('price of usdc from glp (max)', await gmxVault.getMaxPrice(usdc.address));
      // console.log('get price', await dnGmxJuniorVault['getPrice(address)'](usdc.address));

      await sGlp.connect(users[0]).transfer(dnGmxJuniorVault.address, amount);
      await increaseBlockTimestamp(60 * 60 * 480);

      // console.log('price of usdc from glp (min)', await gmxVault.getMinPrice(usdc.address));
      // console.log('price of usdc from glp (max)', await gmxVault.getMaxPrice(usdc.address));
      // console.log('get price', await dnGmxJuniorVault['getPrice(address)'](usdc.address));

      await generateErc20Balance(usdc, depositAmount, users[1].address);
      await usdc.connect(users[1]).approve(glpBatchingManager.address, depositAmount);
      await glpBatchingManager.connect(users[1]).depositUsdc(depositAmount, users[1].address);

      await glpBatchingManager.executeBatch(DEFAULT_CONVERSION_BPS);
      await increaseBlockTimestamp(15 * 60 + 1);

      expect(await glpBatchingManager.paused()).to.true;

      const prevRound = await glpBatchingManager.currentRound();
      // await glpBatchingManager.executeBatchDeposit(parseUnits('1000000000000', 18));
      const postRound = await glpBatchingManager.currentRound();

      expect(postRound).to.eq(prevRound.add(1));
    });
  });

  describe('Claim & Withdraw', () => {
    it('claimAndWithdraw - when user has unclaimed shares', async () => {
      await dnGmxSeniorVault.connect(users[1]).deposit(parseUnits('20000', 6), users[1].address);

      const amount = parseEther('10000');
      const glpAmount = parseEther('100');
      const depositAmount = parseUnits('100', 6);

      await sGlp.connect(users[0]).transfer(dnGmxJuniorVault.address, amount);
      await increaseBlockTimestamp(60 * 60 * 480);

      await generateErc20Balance(usdc, depositAmount, users[1].address);
      await usdc.connect(users[1]).approve(glpBatchingManager.address, depositAmount);
      await glpBatchingManager.connect(users[1]).depositUsdc(depositAmount, users[1].address);

      await glpBatchingManager.executeBatch(DEFAULT_CONVERSION_BPS);
      await increaseBlockTimestamp(15 * 60);
      // await glpBatchingManager.executeBatchDeposit(parseUnits('1000000000000', 18));
      await dnGmxJuniorVault.rebalance();

      const unclaimedShares = await glpBatchingManager.unclaimedShares(users[1].address);
      expect(unclaimedShares).to.gt(0);

      await rewardRouter.connect(users[1]).mintAndStakeGlpETH(0, 0, {
        value: parseEther('0.5'),
      });
      await increaseBlockTimestamp(15 * 60);

      await sGlp.connect(users[1]).approve(dnGmxJuniorVault.address, ethers.constants.MaxUint256);
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

    it('claimAndWithdraw - when user does not have any unclaimed shares', async () => {
      await dnGmxSeniorVault.connect(users[1]).deposit(parseUnits('20000', 6), users[1].address);

      const glpAmount = parseEther('100');

      await rewardRouter.connect(users[1]).mintAndStakeGlpETH(0, 0, {
        value: parseEther('0.5'),
      });
      await increaseBlockTimestamp(15 * 60);

      await sGlp.connect(users[1]).approve(dnGmxJuniorVault.address, ethers.constants.MaxUint256);
      await dnGmxJuniorVault.connect(users[1]).approve(glpBatchingManager.address, ethers.constants.MaxUint256);

      await dnGmxJuniorVault.connect(users[1]).deposit(glpAmount, users[1].address);

      await expect(glpBatchingManager.connect(users[1]).claimAndRedeem(users[1].address)).to.be.revertedWith(
        `VM Exception while processing transaction: reverted with custom error 'InvalidInput(17)'`,
      );
    });

    it('claimAndWithdraw - receiver different than msg.sender', async () => {
      await dnGmxSeniorVault.connect(users[1]).deposit(parseUnits('20000', 6), users[1].address);

      const amount = parseEther('10000');
      const glpAmount = parseEther('100');
      const depositAmount = parseUnits('100', 6);

      await sGlp.connect(users[0]).transfer(dnGmxJuniorVault.address, amount);
      await increaseBlockTimestamp(60 * 60 * 480);

      await generateErc20Balance(usdc, depositAmount, users[1].address);
      await usdc.connect(users[1]).approve(glpBatchingManager.address, depositAmount);
      await glpBatchingManager.connect(users[1]).depositUsdc(depositAmount, users[1].address);

      await glpBatchingManager.executeBatch(DEFAULT_CONVERSION_BPS);
      await increaseBlockTimestamp(15 * 60);
      // await glpBatchingManager.executeBatchDeposit(parseUnits('1000000000000', 18));
      await dnGmxJuniorVault.rebalance();

      const unclaimedShares = await glpBatchingManager.unclaimedShares(users[1].address);
      expect(unclaimedShares).to.gt(0);

      await rewardRouter.connect(users[1]).mintAndStakeGlpETH(0, 0, {
        value: parseEther('0.5'),
      });
      await increaseBlockTimestamp(15 * 60);

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
