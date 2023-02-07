import { ContractTransaction } from 'ethers';
import { formatUnits } from 'ethers/lib/utils';
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

  logBorrowParams = async (tx?: ContractTransaction) => {
    const { dnGmxJuniorVault } = this.opts;

    const currentBorrowed = await dnGmxJuniorVault.getCurrentBorrows();

    const [usdcBorrowed, optimalBorrows, borrowValue] = await Promise.all([
      dnGmxJuniorVault.getUsdcBorrowed({ blockTag: tx?.blockNumber }),
      dnGmxJuniorVault.getOptimalBorrows(dnGmxJuniorVault.totalAssets({ blockTag: tx?.blockNumber }), {
        blockTag: tx?.blockNumber,
      }),
      dnGmxJuniorVault.getBorrowValue(currentBorrowed[0], currentBorrowed[1], { blockTag: tx?.blockNumber }),
    ]);

    console.log('current borrows', currentBorrowed.toString());
    console.log('optimal borrows (for totalAssets)', optimalBorrows.toString());
    console.log('current total borrow value', borrowValue.toString());
    console.log('usdc borrowed from senior vault', usdcBorrowed.toString());

    console.log(Logger.seperator);
  };

  logAavePosition = async (tx?: ContractTransaction) => {
    const { aUSDC, vdWBTC, vdWETH, dnGmxJuniorVault, dnGmxSeniorVault } = this.opts;

    console.log('senior vault:');
    console.log(
      'aUSDC (bal, scaled bal): ',
      await aUSDC.balanceOf(dnGmxSeniorVault.address, { blockTag: tx?.blockNumber }),
      await aUSDC.scaledBalanceOf(dnGmxSeniorVault.address, { blockTag: tx?.blockNumber }),
    );
    console.log(
      'variable debt wBTC (bal, scaled bal): ',
      await vdWBTC.balanceOf(dnGmxSeniorVault.address, { blockTag: tx?.blockNumber }),
      await vdWBTC.scaledBalanceOf(dnGmxSeniorVault.address, { blockTag: tx?.blockNumber }),
    );
    console.log(
      'variable debt wETH (bal, scaled bal): ',
      await vdWETH.balanceOf(dnGmxSeniorVault.address, { blockTag: tx?.blockNumber }),
      await vdWETH.scaledBalanceOf(dnGmxSeniorVault.address, { blockTag: tx?.blockNumber }),
    );

    console.log('junior vault:');
    console.log(
      'aUSDC (bal, scaled bal): ',
      await aUSDC.balanceOf(dnGmxJuniorVault.address, { blockTag: tx?.blockNumber }),
      await aUSDC.scaledBalanceOf(dnGmxJuniorVault.address, { blockTag: tx?.blockNumber }),
    );
    console.log(
      'variable debt wBTC (bal, scaled bal): ',
      await vdWBTC.balanceOf(dnGmxJuniorVault.address, { blockTag: tx?.blockNumber }),
      await vdWBTC.scaledBalanceOf(dnGmxJuniorVault.address, { blockTag: tx?.blockNumber }),
    );
    console.log(
      'variable debt wETH (bal, scaled bal): ',
      await vdWETH.balanceOf(dnGmxJuniorVault.address, { blockTag: tx?.blockNumber }),
      await vdWETH.scaledBalanceOf(dnGmxJuniorVault.address, { blockTag: tx?.blockNumber }),
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
      dnGmxSeniorVault.borrowCaps(dnGmxJuniorVault.address),
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
      if (log.topics[0] === this.opts.dnGmxJuniorVaultManager.interface.getEventTopic('RewardsHarvested')) {
        const args = this.opts.dnGmxJuniorVaultManager.interface.parseLog(log).args;

        console.log('total eth harvested (including fees): ', args.wethHarvested);
        console.log('junior vault eth share: ', args.juniorVaultWeth);
        console.log('senior vault eth share: ', args.seniorVaultWeth);
        console.log('glp received (junior vault): ', args.juniorVaultGlp);
        console.log('usdc received (senior vault): ', args.seniorVaultAUsdc);
      }
    }

    console.log(Logger.seperator);
  };

  logUsdgAmounts = async () => {
    const { gmxVault } = this.opts;

    let totalUsdgAmounts = 0;

    const tokens = [
      '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f',
      '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
      '0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8',
      '0xf97f4df75117a78c1A5a0DBb814Af92458539FB4',
      '0xFa7F8980b0f1E64A2062791cc3b0871572f1F7f0',
      '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
      '0xFEa7a6a0B346362BF88A9e4A88416B77a57D6c2A',
      '0x17FC002b466eEc40DaE837Fc4bE5c67993ddBd6F',
      '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1',
    ];

    const usdgAmounts = await Promise.all(tokens.map(tk => gmxVault.usdgAmounts(tk)));

    console.log('USDG AMOUNTS:');

    for (const [index, amount] of usdgAmounts.entries()) {
      if (index == 0) console.log('WBTC: ', formatUnits(amount));
      if (index == 1) console.log('WETH: ', formatUnits(amount));
      if (index == 2) console.log('USDC: ', formatUnits(amount));

      totalUsdgAmounts += Number(formatUnits(amount));
    }

    console.log('TOTAL: ', totalUsdgAmounts.toString());
    console.log(Logger.seperator);
  };

  logPoolAmounts = async () => {
    const { gmxVault } = this.opts;

    const tokens = [
      '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f',
      '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
      '0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8',
      '0xf97f4df75117a78c1A5a0DBb814Af92458539FB4',
      '0xFa7F8980b0f1E64A2062791cc3b0871572f1F7f0',
      '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
      '0xFEa7a6a0B346362BF88A9e4A88416B77a57D6c2A',
      '0x17FC002b466eEc40DaE837Fc4bE5c67993ddBd6F',
      '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1',
    ];

    const poolAmounts = await Promise.all(tokens.map(tk => gmxVault.poolAmounts(tk)));

    console.log('POOL AMOUNTS:');

    for (const [index, amount] of poolAmounts.entries()) {
      if (index == 0) console.log('WBTC: ', formatUnits(amount, 8));
      if (index == 1) console.log('WETH: ', formatUnits(amount, 18));
      if (index == 2) console.log('USDC: ', formatUnits(amount, 6));
    }

    console.log(Logger.seperator);
  };
}
