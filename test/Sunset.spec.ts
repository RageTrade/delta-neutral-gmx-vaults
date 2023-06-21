import hre from 'hardhat';
import { Signer } from 'ethers';
import { arb } from './utils/arb';
import { generateErc20Balance } from './utils/generator';
import { formatUnits, parseUnits } from 'ethers/lib/utils';
import { DnGmxJuniorVault__factory } from '../typechain-types';
import { impersonateAccount } from '@nomicfoundation/hardhat-network-helpers';
import { deltaNeutralGmxVaults, tokens, aave, chainlink, typechain } from '@ragetrade/sdk';

describe('Sunset', () => {
  it.only('check', async () => {
    // real mainnet contract instances
    const {
      dnGmxJuniorVault: _dnGmxJuniorVault,
      proxyAdmin,
      dnGmxTraderHedgeStrategy,
    } = deltaNeutralGmxVaults.getContractsSync('arbmain', hre.ethers.provider);

    const { aUsdc, poolAddressProvider } = await aave.getContracts(hre.ethers.provider);
    const { fsGLP, weth, wbtc, usdc } = tokens.getContractsSync('arbmain', hre.ethers.provider);

    // deploy implementation

    const quoterLib = await hre.ethers.deployContract('QuoterLib');

    const dnGmxJuniorVaultManager = await hre.ethers.deployContract('DnGmxJuniorVaultManager', {
      libraries: {
        QuoterLib: quoterLib.address,
      },
    });

    const dnGmxJuniorVaultNewLogic = await hre.ethers.deployContract('DnGmxJuniorVault', {
      libraries: {
        DnGmxJuniorVaultManager: dnGmxJuniorVaultManager.address,
      },
    });

    const { ethUsdAggregator, btcUsdAggregator } = chainlink.getContractsSync('arbmain', hre.ethers.provider);

    const usdcUsdAggregator = ethUsdAggregator.attach('0x50834F3163758fcC1Df9973b6e91f0F0F0434aD3');

    async function price(addr: string, blockNumber: number) {
      switch (addr.toLowerCase()) {
        case weth.address.toLowerCase():
          return Number(formatUnits((await ethUsdAggregator.latestRoundData({ blockTag: blockNumber })).answer, 8));
        case wbtc.address.toLowerCase():
          return Number(formatUnits((await btcUsdAggregator.latestRoundData({ blockTag: blockNumber })).answer, 8));
        case usdc.address.toLowerCase():
          return Number(formatUnits((await usdcUsdAggregator.latestRoundData({ blockTag: blockNumber })).answer, 8));
        default:
          throw new Error('i dont know');
      }
    }

    // upgrade

    const owner = await impersonate(proxyAdmin.owner());
    await proxyAdmin.connect(owner).upgrade(_dnGmxJuniorVault.address, dnGmxJuniorVaultNewLogic.address);
    const dnGmxJuniorVault = DnGmxJuniorVault__factory.connect(_dnGmxJuniorVault.address, hre.ethers.provider);

    const ap = await dnGmxJuniorVault.getAdminParams();

    const st = await dnGmxJuniorVault.getThresholds();

    await dnGmxJuniorVault.connect(owner).setThresholds(
      st.slippageThresholdSwapBtcBps,
      35,
      45,
      0, // st.usdcConversionThreshold,
      st.wethConversionThreshold,
      0, // st.hedgeUsdcAmountThreshold,
      st.partialBtcHedgeUsdcAmountThreshold,
      st.partialEthHedgeUsdcAmountThreshold,
    );

    await dnGmxJuniorVault.connect(owner).setParamsV1(parseUnits('200', 6), dnGmxTraderHedgeStrategy.address);

    const signers = await hre.ethers.getSigners();
    const keeperDNVault = await impersonate(ap.keeper);
    const keeperHedgeStrategy = await impersonate(await dnGmxTraderHedgeStrategy.keeper());

    await dnGmxTraderHedgeStrategy.connect(keeperHedgeStrategy).setTraderOIHedgeBps(0);
    await dnGmxTraderHedgeStrategy.connect(keeperHedgeStrategy).setTraderOIHedges();

    let i = 0;

    const glpBal = await fsGLP.balanceOf(dnGmxJuniorVault.address);
    const [btcBorrow, ethBorrow] = await dnGmxJuniorVault.getCurrentBorrows();

    const ta = await dnGmxJuniorVault.totalAssets();
    const ub = await dnGmxJuniorVault.getUsdcBorrowed();

    console.log('::start::');
    console.log('glp_bal:', formatUnits(glpBal));
    console.log('token_borrows:', formatUnits(btcBorrow, 8), formatUnits(ethBorrow));
    console.log('usdc_borrowed:', formatUnits(ub, 6));
    console.log('total_assets:', formatUnits(ta));
    console.log('------------------');

    const pool = typechain.deltaNeutralGmxVaults.IPool__factory.connect(
      await poolAddressProvider.getPool(),
      signers[0],
    );

    let isChanged = false;

    while (await dnGmxJuniorVault.isValidRebalance()) {
      await dnGmxJuniorVault.connect(keeperDNVault).rebalance();

      if (isChanged) {
        const glpBal = await fsGLP.balanceOf(dnGmxJuniorVault.address);
        const [btcBorrow, ethBorrow] = await dnGmxJuniorVault.getCurrentBorrows();

        // const btcAmount = btcBorrow;
        // console.log('btc external amount:', btcBorrow);
        // const ethAmount = ethBorrow;

        // const usdcBorrowed = await dnGmxJuniorVault.getUsdcBorrowed()
        // const available = await aUsdc.balanceOf(dnGmxJuniorVault.address)
        //
        // const diff = usdcBorrowed.sub(available);
        // console.log('diff', diff.toString())

        // await usdc.connect(signers[0]).approve(pool.address, diff);
        // await wbtc.connect(signers[0]).approve(pool.address, btcAmount);
        // await weth.connect(signers[0]).approve(pool.address, ethAmount);

        // await generateErc20Balance(wbtc, btcAmount, signers[0].address);
        // await generateErc20Balance(weth, ethAmount, signers[0].address);

        // await pool.connect(signers[0]).repay(wbtc.address, btcAmount, 2, dnGmxJuniorVault.address);
        // await pool.connect(signers[0]).repay(weth.address, ethAmount, 2, dnGmxJuniorVault.address);

        // console.log('tokens repaid');

        // await pool.supply(usdc.address, diff, dnGmxJuniorVault.address, 0);

        await dnGmxJuniorVault.connect(owner).repay();

        console.log('usdc repaid');

        const ta = await dnGmxJuniorVault.totalAssets();
        const ub = await dnGmxJuniorVault.getUsdcBorrowed();

        console.log('iteration:', i);
        console.log('glp_bal:', formatUnits(glpBal));
        console.log('token_borrows:', formatUnits(btcBorrow, 8), formatUnits(ethBorrow));
        console.log('usdc_borrowed:', formatUnits(ub, 6));
        console.log('total_assets:', formatUnits(ta));
        console.log('dnUsdcDeposited:', await dnGmxJuniorVault.dnUsdcDeposited());
        console.log('ausdc bal:', await aUsdc.balanceOf(dnGmxJuniorVault.address));
        console.log('------------------');

        break;
      }

      await arb(signers[0], wbtc.address, weth.address, 500, true);
      await arb(signers[0], weth.address, usdc.address, 500, true);

      const glpBal = await fsGLP.balanceOf(dnGmxJuniorVault.address);
      const [btcBorrow, ethBorrow] = await dnGmxJuniorVault.getCurrentBorrows();

      const ta = await dnGmxJuniorVault.totalAssets();
      const ub = await dnGmxJuniorVault.getUsdcBorrowed();

      console.log('iteration:', i);
      console.log('glp_bal:', formatUnits(glpBal));
      console.log('token_borrows:', formatUnits(btcBorrow, 8), formatUnits(ethBorrow));
      console.log('usdc_borrowed:', formatUnits(ub, 6));
      console.log('total_assets:', formatUnits(ta));
      console.log('------------------');

      const btcPrice = await price(wbtc.address, await hre.ethers.provider.getBlockNumber());
      const btcNotional = parseUnits((Number(formatUnits(btcBorrow, 8)) * btcPrice).toFixed(6).toString(), 6);

      console.log('btcPrice', btcPrice);
      console.log('btcNotional', btcNotional.toString());

      const ethPrice = await price(weth.address, await hre.ethers.provider.getBlockNumber());
      const ethNotional = parseUnits((Number(formatUnits(ethBorrow, 18)) * ethPrice).toFixed(6).toString(), 6);

      console.log('ethPrice', ethPrice);
      console.log('ethNotional', ethNotional.toString());

      if (
        btcNotional.lt(st.partialBtcHedgeUsdcAmountThreshold) &&
        ethNotional.lt(st.partialEthHedgeUsdcAmountThreshold)
      ) {
        isChanged = true;

        await dnGmxJuniorVault.connect(owner).setThresholds(
          st.slippageThresholdSwapBtcBps,
          35,
          45,
          0, // st.usdcConversionThreshold,
          st.wethConversionThreshold,
          0, // st.hedgeUsdcAmountThreshold,
          btcNotional.sub(parseUnits('10', 6)),
          ethNotional.sub(parseUnits('10', 6)),
        );

        console.log('chainging...');
      }

      // if(i==2) {
      // await dnGmxJuniorVault.connect(owner).rebalanceProfit();
      // break;
      // }

      i++;
    }
    //
    // const lp = '0x25330e5588DbA5A22444AaA8A237aa4Dd0744F30';
    //
    // await dnGmxJuniorVault.connect(await impersonate(lp)).redeem(dnGmxJuniorVault.balanceOf(lp), lp, lp);
  });
});

async function impersonate(address: string | Promise<string>): Promise<Signer> {
  address = await address;
  await impersonateAccount(address);
  return hre.ethers.getSigner(address);
}
