import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { BigNumber } from 'ethers';
import { getAddress, hexlify, parseUnits, randomBytes } from 'ethers/lib/utils';
import hre, { ethers } from 'hardhat';
import { DnGmxBatchingManager, DnGmxJuniorVaultMock, DnGmxSeniorVault, ERC20Upgradeable } from '../typechain-types';
import addresses from './fixtures/addresses';
import { dnGmxJuniorVaultFixture } from './fixtures/dn-gmx-vault';
import { generateErc20Balance } from './utils/erc20';
import { increaseBlockTimestamp } from './utils/vault-helpers';

describe('DnGmx Senior Vault', () => {
  let dnGmxJuniorVault: DnGmxJuniorVaultMock;
  let glpBatchingManager: DnGmxBatchingManager;
  let users: SignerWithAddress[];
  let aUSDC: ERC20Upgradeable;
  let usdc: ERC20Upgradeable;
  let fsGlp: ERC20Upgradeable;
  let dnGmxJuniorVaultSigner: SignerWithAddress;

  let dnGmxSeniorVault: DnGmxSeniorVault;

  beforeEach(async () => {
    ({ dnGmxJuniorVault, dnGmxSeniorVault, glpBatchingManager, users, fsGlp, aUSDC, usdc } =
      await dnGmxJuniorVaultFixture());
  });

  describe('Deposit', () => {
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
  });

  describe('Batch Stake', () => {
    it('Single User Batch Deposit', async () => {
      const depositAmount = parseUnits('100', 6);
      await usdc.connect(users[1]).approve(glpBatchingManager.address, depositAmount);
      await glpBatchingManager.connect(users[1]).depositUsdc(depositAmount, users[1].address);

      // await increaseBlockTimestamp(15 * 60); //15 mins

      const roundUsdcBalance = await glpBatchingManager.roundUsdcBalance();
      //Check sGlp transfer and vault share transfer
      await expect(() => glpBatchingManager.executeBatchStake()).to.changeTokenBalance(
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
  });

  describe('Batch Deposit', () => {
    it('Single User Batch Deposit', async () => {
      await dnGmxSeniorVault.connect(users[1]).deposit(parseUnits('10000', 6), users[1].address);
      const depositAmount = parseUnits('100', 6);
      await usdc.connect(users[1]).approve(glpBatchingManager.address, depositAmount);
      await glpBatchingManager.connect(users[1]).depositUsdc(depositAmount, users[1].address);
      await glpBatchingManager.executeBatchStake();
      await increaseBlockTimestamp(15 * 60); //15 mins

      const roundUsdcBalance = await glpBatchingManager.roundUsdcBalance();
      const roundGlpStaked = await glpBatchingManager.roundGlpStaked();
      //Check sGlp transfer and vault share transfer
      await expect(() => glpBatchingManager.executeBatchDeposit()).to.changeTokenBalance(
        fsGlp,
        glpBatchingManager,
        roundGlpStaked.mul(-1),
      );

      expect(await dnGmxJuniorVault.balanceOf(glpBatchingManager.address)).to.eq(roundGlpStaked); //Since share:asset would be 1:1 initially

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
  });
});
