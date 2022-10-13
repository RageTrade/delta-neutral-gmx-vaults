import { expect } from 'chai';
import { BigNumber, BigNumberish, ContractTransaction } from 'ethers';
import { dnGmxJuniorVaultFixture } from '../fixtures/dn-gmx-junior-vault';

export class Checker {
  constructor(public opts: Awaited<ReturnType<typeof dnGmxJuniorVaultFixture>>) {
    opts = opts;
  }

  checkTotalAssets = async (expected: BigNumberish, variance: BigNumberish = 0, forJuniorVault = true) => {
    const { dnGmxJuniorVault, dnGmxSeniorVault } = this.opts;

    forJuniorVault
      ? expect((await dnGmxJuniorVault.totalAssets()).sub(expected).abs()).to.lte(variance)
      : expect((await dnGmxSeniorVault.totalAssets()).sub(expected).abs()).to.lte(variance);
  };

  checkTotalSupply = async (expected: BigNumberish, variance: BigNumberish = 0, forJuniorVault = true) => {
    const { dnGmxJuniorVault, dnGmxSeniorVault } = this.opts;

    forJuniorVault
      ? expect((await dnGmxJuniorVault.totalSupply()).sub(expected).abs()).to.lte(variance)
      : expect((await dnGmxSeniorVault.totalSupply()).sub(expected).abs()).to.lte(variance);
  };

  checkVaultMktValue = async (expected: BigNumberish, variance: BigNumberish = 0) => {
    const { dnGmxJuniorVault } = this.opts;

    expect((await dnGmxJuniorVault.getVaultMarketValue()).sub(expected).abs()).to.lte(variance);
  };

  checkCurrentBorrowed = async (
    expected: [BigNumberish, BigNumberish],
    variance: [BigNumberish, BigNumberish] = [0, 0],
  ) => {
    const { dnGmxJuniorVault } = this.opts;

    const currentBorrowed = await dnGmxJuniorVault.getCurrentBorrows();

    expect(currentBorrowed[0].sub(expected[0]).abs()).to.lte(variance[0]);
    expect(currentBorrowed[1].sub(expected[1]).abs()).to.lte(variance[1]);
  };

  checkFlashloanedAmounts = async (tx: ContractTransaction, expected: BigNumber[], variance: BigNumberish[]) => {
    const confirmed = await tx.wait();

    const emitted: BigNumber[] = [];

    for (const log of confirmed.logs) {
      if (log.topics[0] === this.opts.balancer.interface.getEventTopic('FlashLoan')) {
        const args = this.opts.balancer.interface.parseLog(log).args;
        console.log('flashloaned: ', args.amount);
        emitted.push((args.amount as BigNumber).add(args.feeAmount as BigNumber));
      }
    }

    for (const index of emitted.keys()) {
      expect(expected[index].sub(emitted[index]).abs()).to.lte(variance[index]);
    }
  };

  checkBorrowValue = async (expected: BigNumberish, variance: BigNumberish = 0) => {
    const { dnGmxJuniorVault } = this.opts;

    const borrows = await dnGmxJuniorVault.getCurrentBorrows();
    const currentBorrowed = await dnGmxJuniorVault.getBorrowValue(borrows[0], borrows[1]);

    expect(currentBorrowed.sub(expected).abs()).to.lte(variance);
  };

  checkUsdcBorrwed = async (expected: BigNumberish, variance: BigNumberish = 0) => {
    const { dnGmxJuniorVault } = this.opts;

    const usdcBorrowed = await dnGmxJuniorVault.getUsdcBorrowed();
    expect(usdcBorrowed.sub(expected).abs()).to.lte(variance);
  };

  checkAaveDebt = async (expected: [BigNumberish, BigNumberish], variance: [BigNumberish, BigNumberish] = [0, 0]) => {
    const { vdWBTC, vdWETH, dnGmxJuniorVault } = this.opts;
    const balBtc = await vdWBTC.balanceOf(dnGmxJuniorVault.address);
    const balEth = await vdWETH.balanceOf(dnGmxJuniorVault.address);

    expect(balBtc.sub(expected[0]).abs()).to.lte(variance[0]);
    expect(balEth.sub(expected[1]).abs()).to.lte(variance[1]);
  };

  checkAaveSupplied = async (expected: BigNumberish, variance: BigNumberish = 0, forJuniorVault = true) => {
    const { aUSDC, dnGmxJuniorVault, dnGmxSeniorVault } = this.opts;

    forJuniorVault
      ? expect((await aUSDC.balanceOf(dnGmxJuniorVault.address)).sub(expected).abs()).to.lte(variance)
      : expect((await aUSDC.balanceOf(dnGmxSeniorVault.address)).sub(expected).abs()).to.lte(variance);
  };

  checkRewardsAccrued = async (
    tx: ContractTransaction,
    expected: [BigNumberish, BigNumberish],
    variance: [BigNumberish, BigNumberish] = [0, 0],
  ) => {
    const confirmed = await tx.wait();

    for (const log of confirmed.logs) {
      if (log.topics[0] === this.opts.dnGmxJuniorVault.interface.getEventTopic('RewardsHarvested')) {
        const args = this.opts.dnGmxJuniorVault.interface.parseLog(log).args;

        expect((args.totalEthAmount as BigNumber).sub(expected[0])).to.lte(variance[0]);
        expect((args.juniorVaultShare as BigNumber).sub(expected[1])).to.lte(variance[1]);
      }
    }
  };
}
