import { BigNumber, ContractTransaction } from 'ethers';
import { dnGmxJuniorVaultFixture } from '../fixtures/dn-gmx-junior-vault';

export class Logger {
  public static seperator = '--------------------------------';

  constructor(public opts: Awaited<ReturnType<typeof dnGmxJuniorVaultFixture>>) {
    opts = opts;
  }

  logGlpPrice = async () => {
    const { glpManager, glp } = this.opts;

    const minAum = await glpManager.getAum(false);
    const maxAum = await glpManager.getAum(true);

    const totalSupply = await glp.totalSupply();

    const minPrice = minAum.div(totalSupply).div(10 ** 6);
    const maxPrice = maxAum.div(totalSupply).div(10 ** 6);

    console.log('glpPrice(min)', minPrice);
    console.log('glpPrice(max)', maxPrice);

    console.log(Logger.seperator);
  };

  logBorrowParams = async () => {
    const { dnGmxJuniorVault } = this.opts;

    const currentBorrowed = await dnGmxJuniorVault.getCurrentBorrows();

    const [usdcBorrowed, optimalBorrows, borrowValue] = await Promise.all([
      dnGmxJuniorVault.getUsdcBorrowed(),
      dnGmxJuniorVault.getOptimalBorrows(dnGmxJuniorVault.totalAssets()),
      dnGmxJuniorVault.getBorrowValue(currentBorrowed[0], currentBorrowed[1]),
    ]);

    console.log('current borrows', currentBorrowed.toString());
    console.log('optimal borrows (for totalAssets)', optimalBorrows.toString());
    console.log('current total borrow value', borrowValue.toString());
    console.log('usdc borrowed from senior vault', usdcBorrowed.toString());

    console.log(Logger.seperator);
  };

  logAavePosition = async () => {
    const { aUSDC, vdWBTC, vdWETH, dnGmxJuniorVault, dnGmxSeniorVault } = this.opts;

    console.log('senior vault:');
    console.log(
      'aUSDC (bal, scaled bal): ',
      await aUSDC.balanceOf(dnGmxSeniorVault.address),
      await aUSDC.scaledBalanceOf(dnGmxSeniorVault.address),
    );
    console.log(
      'variable debt wBTC (bal, scaled bal): ',
      await vdWBTC.balanceOf(dnGmxSeniorVault.address),
      await vdWBTC.scaledBalanceOf(dnGmxSeniorVault.address),
    );
    console.log(
      'variable debt wETH (bal, scaled bal): ',
      await vdWETH.balanceOf(dnGmxSeniorVault.address),
      await vdWETH.scaledBalanceOf(dnGmxSeniorVault.address),
    );

    console.log('junior vault:');
    console.log(
      'aUSDC (bal, scaled bal): ',
      await aUSDC.balanceOf(dnGmxJuniorVault.address),
      await aUSDC.scaledBalanceOf(dnGmxJuniorVault.address),
    );
    console.log(
      'variable debt wBTC (bal, scaled bal): ',
      await vdWBTC.balanceOf(dnGmxJuniorVault.address),
      await vdWBTC.scaledBalanceOf(dnGmxJuniorVault.address),
    );
    console.log(
      'variable debt wETH (bal, scaled bal): ',
      await vdWETH.balanceOf(dnGmxJuniorVault.address),
      await vdWETH.scaledBalanceOf(dnGmxJuniorVault.address),
    );

    console.log(Logger.seperator);
  };

  logTargetWeights = async () => {
    const btcWeights = await this.opts.gmxVault.tokenWeights(this.opts.wbtc.address);
    const ethWeights = await this.opts.gmxVault.tokenWeights(this.opts.weth.address);

    const totalWeights = await this.opts.gmxVault.totalTokenWeights();

    console.log('btcWeights', btcWeights);
    console.log('ethWeights', ethWeights);
    console.log('totalWeights', totalWeights);

    console.log(Logger.seperator);
  };

  logProtocolParamsAndHoldings = async () => {
    console.log('senior vault:');

    const { dnGmxSeniorVault, dnGmxJuniorVault } = this.opts;

    const [
      totalAssetsSenior,
      totalSupplyySenior,
      maxUtilizationBps,
      totalUsdcBorrowed,
      ethRewardsFeeSplit,
      borrowCapOfJunior,
    ] = await Promise.all([
      dnGmxSeniorVault.totalAssets(),
      dnGmxSeniorVault.totalSupply(),
      dnGmxSeniorVault.maxUtilizationBps(),
      dnGmxSeniorVault.totalUsdcBorrowed(),
      dnGmxSeniorVault.getEthRewardsSplitRate(),
      dnGmxSeniorVault.vaultCaps(dnGmxJuniorVault.address),
    ]);

    console.log('totalAssets', totalAssetsSenior.toString());
    console.log('totalSupply', totalSupplyySenior.toString());
    console.log('maxUtilizationBps', maxUtilizationBps.toString());
    console.log('totalUsdcBorrowed', totalUsdcBorrowed.toString());
    console.log('ethRewardsFeeSplit', ethRewardsFeeSplit.toString());
    console.log('borrowCapOfJunior', borrowCapOfJunior.toString());

    console.log('junior vault:');

    const [
      totalAssetsJunior,
      totalSupplyJunior,
      vaultMktValue,
      usdcBorrowed,
      withdrawFee,
      protocolFee,
      depositCap,
      dnUsdcDeposited,
    ] = await Promise.all([
      dnGmxJuniorVault.totalAssets(),
      dnGmxJuniorVault.totalSupply(),
      dnGmxJuniorVault.getVaultMarketValue(),
      dnGmxJuniorVault.getUsdcBorrowed(),
      dnGmxJuniorVault.withdrawFeeBps(),
      dnGmxJuniorVault.protocolFee(),
      dnGmxJuniorVault.depositCap(),
      dnGmxJuniorVault.dnUsdcDepositedExternal(),
    ]);

    console.log('totalAssets', totalAssetsJunior.toString());
    console.log('totalSupply', totalSupplyJunior.toString());
    console.log('vaultMktValue', vaultMktValue.toString());
    console.log('usdcBorrowed', usdcBorrowed.toString());
    console.log('withdrawFee', withdrawFee.toString());
    console.log('protocolFee', protocolFee.toString());
    console.log('depositCap', depositCap.toString());
    console.log('dnUsdcDeposited', dnUsdcDeposited.toString());

    console.log(Logger.seperator);
  };

  logGlpRewards = async (tx: ContractTransaction) => {
    const confirmed = await tx.wait();

    for (const log of confirmed.logs) {
      if (log.topics[0] === this.opts.dnGmxJuniorVault.interface.getEventTopic('RewardsHarvested')) {
        const args = this.opts.dnGmxJuniorVault.interface.parseLog(log).args;

        console.log('total eth harvested (including fees): ', args.wethHarvested);
        console.log('junior vault eth share: ', args.juniorVaultWeth);
        console.log('senior vault eth share: ', args.seniorVaultWeth);
        console.log('glp received (junior vault): ', args.juniorVaultGlp);
        console.log('usdc received (senior vault): ', args.seniorVaultAUsdc);
      }
    }

    console.log(Logger.seperator);
  };
}
