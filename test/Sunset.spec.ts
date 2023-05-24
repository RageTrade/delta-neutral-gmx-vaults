import hre from 'hardhat';
import { Signer } from 'ethers';
import { arb } from './utils/arb';
import { generateErc20Balance } from './utils/generator';
import { formatUnits, parseUnits } from 'ethers/lib/utils';
import { DnGmxJuniorVault__factory } from '../typechain-types';
import { impersonateAccount } from '@nomicfoundation/hardhat-network-helpers';
import { deltaNeutralGmxVaults, tokens, aave, typechain } from '@ragetrade/sdk';

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

    while (await dnGmxJuniorVault.isValidRebalance()) {
      if (i == 9) {
        const pool = typechain.deltaNeutralGmxVaults.IPool__factory.connect(
          await poolAddressProvider.getPool(),
          signers[0],
        );

        const amount = parseUnits('0.005', 8);

        await wbtc.connect(signers[0]).approve(pool.address, amount);
        await generateErc20Balance(wbtc, amount, signers[0].address);

        await pool.connect(signers[0]).repay(wbtc.address, amount, 2, dnGmxJuniorVault.address);
      }
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
      console.log('total_assets:', formatUnits(ta));
      console.log('------------------');

      i++;
    }

    const lp = '0x25330e5588DbA5A22444AaA8A237aa4Dd0744F30';

    await dnGmxJuniorVault.connect(await impersonate(lp)).redeem(dnGmxJuniorVault.balanceOf(lp), lp, lp);
  });
});

async function impersonate(address: string | Promise<string>): Promise<Signer> {
  address = await address;
  await impersonateAccount(address);
  return hre.ethers.getSigner(address);
}
