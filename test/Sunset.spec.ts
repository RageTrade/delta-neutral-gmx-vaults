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
      dnGmxSeniorVault,
      proxyAdmin,
      dnGmxTraderHedgeStrategy,
    } = deltaNeutralGmxVaults.getContractsSync('arbmain', hre.ethers.provider);

    const { aUsdc, poolAddressProvider } = aave.getContractsSync('arbmain', hre.ethers.provider);
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

    await dnGmxJuniorVault.connect(owner).setParamsV1(parseUnits('1', 6), dnGmxTraderHedgeStrategy.address);

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
      console.log('total_assets_junior:', formatUnits(ta));
      console.log('total_assets_senior:', formatUnits(await dnGmxSeniorVault.totalAssets(), 6));
      console.log('aUsdc_bal:', formatUnits(await aUsdc.balanceOf(dnGmxJuniorVault.address), 6));
      console.log('------------------');

      if (isChanged) {
        const glpBal = await fsGLP.balanceOf(dnGmxJuniorVault.address);
        const [btcBorrow, ethBorrow] = await dnGmxJuniorVault.getCurrentBorrows();

        const btcAmount = btcBorrow;
        const ethAmount = ethBorrow;
        console.log('btc external amount:', btcBorrow);
        console.log('eth external amount:', ethBorrow);

        const usdcBorrowed = await dnGmxJuniorVault.getUsdcBorrowed();
        const available = await aUsdc.balanceOf(dnGmxJuniorVault.address);
        //
        const diff = usdcBorrowed.sub(available);
        console.log('diff', diff.toString());

        if (btcAmount.gt(0)) {
          await wbtc.connect(signers[0]).approve(pool.address, btcAmount);
          await generateErc20Balance(wbtc, btcAmount, signers[0].address);
          await pool.connect(signers[0]).repay(wbtc.address, btcAmount, 2, dnGmxJuniorVault.address);
          console.log('repaid btc externally');
        }

        if (ethAmount.gt(0)) {
          await weth.connect(signers[0]).approve(pool.address, ethAmount);
          await generateErc20Balance(weth, ethAmount, signers[0].address);
          await pool.connect(signers[0]).repay(weth.address, ethAmount, 2, dnGmxJuniorVault.address);
          console.log('repaid eth externally');
        }

        if (diff.gt(0)) {
          await usdc.connect(signers[0]).approve(pool.address, diff);
          await pool.supply(usdc.address, diff, dnGmxJuniorVault.address, 0);
          console.log('diff > 0, supplying usdc externally');
        }
        await dnGmxJuniorVault.connect(owner).repay();

        console.log('repaid');

        await dnGmxJuniorVault.connect(owner).setParamsV1(parseUnits('200', 6), dnGmxTraderHedgeStrategy.address);
        console.log('changing threshold to 200$');

        // to make is valid rebalance false;
        await dnGmxJuniorVault.connect(keeperDNVault).rebalance();
        console.log('external rebalance done');

        const ta = await dnGmxJuniorVault.totalAssets();
        const ub = await dnGmxJuniorVault.getUsdcBorrowed();

        const [newBtcBorrow, newEthBorrow] = await dnGmxJuniorVault.getCurrentBorrows();

        console.log('iteration:', i);
        console.log('glp_bal:', formatUnits(glpBal));
        console.log('token_borrows:', formatUnits(newBtcBorrow, 8), formatUnits(newEthBorrow));
        console.log('usdc_borrowed:', formatUnits(ub, 6));
        console.log('total_assets_junior:', formatUnits(ta));
        console.log('total_assets_senior:', formatUnits(await dnGmxSeniorVault.totalAssets(), 6));
        console.log('dnUsdcDeposited:', formatUnits(await dnGmxJuniorVault.dnUsdcDeposited(), 6));
        console.log('aUsdc_bal:', formatUnits(await aUsdc.balanceOf(dnGmxJuniorVault.address), 6));
        console.log('------------------');

        break;
      }

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

      i++;
    }

    const juniorLp = '0xfb40932271fc9db9dbf048e80697e2da4aa57250';
    await dnGmxJuniorVault
      .connect(await impersonate(juniorLp))
      .redeem(dnGmxJuniorVault.balanceOf(juniorLp), juniorLp, juniorLp);
    console.log('junior vault lp withdraw');

    const seniorLp = '0x8ce0d9060263b1b5ad3eff2e1e21736b5ef36936';
    await dnGmxSeniorVault
      .connect(await impersonate(seniorLp))
      .redeem(dnGmxSeniorVault.balanceOf(seniorLp), seniorLp, seniorLp);
    console.log('senior vault lp withdraw');
  });
});

async function impersonate(address: string | Promise<string>): Promise<Signer> {
  address = await address;
  await impersonateAccount(address);
  return hre.ethers.getSigner(address);
}
