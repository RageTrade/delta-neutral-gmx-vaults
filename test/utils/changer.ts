import hre, { ethers } from 'hardhat';
import addresses from '../fixtures/addresses';
import { increaseBlockTimestamp } from './shared';
import { AggregatorV3Interface__factory, NonfungiblePositionManager__factory } from '../../typechain-types';
import { formatUnits, parseUnits } from 'ethers/lib/utils';
import { dnGmxJuniorVaultFixture } from '../fixtures/dn-gmx-junior-vault';
import { tickToNearestInitializableTick, priceToTick } from '@ragetrade/sdk';
import { generateErc20Balance } from './generator';

type Asset = 'WETH' | 'WBTC';

export class Changer {
  public static seperator = '--------------------------------';

  constructor(public opts: Awaited<ReturnType<typeof dnGmxJuniorVaultFixture>>) {
    opts = opts;
  }

  addLiquidity = async () => {
    const nfpm = NonfungiblePositionManager__factory.connect(
      '0xC36442b4a4522E871399CD717aBDD847Ab11FE88',
      this.opts.users[0],
    );

    let decimals1 = 6;
    let decimals0 = 18;

    let amount1 = 100_000_000;
    let amount0 = 100_000_000 / 1_600;

    await generateErc20Balance(
      this.opts.weth,
      parseUnits(amount0.toFixed(decimals0), decimals0),
      this.opts.users[0].address,
    );
    await generateErc20Balance(
      this.opts.usdc,
      parseUnits(amount1.toFixed(decimals1), decimals1),
      this.opts.users[0].address,
    );

    await this.opts.usdc.connect(this.opts.users[0]).approve(nfpm.address, ethers.constants.MaxUint256);
    await this.opts.weth.connect(this.opts.users[0]).approve(nfpm.address, ethers.constants.MaxUint256);

    let tickLower = tickToNearestInitializableTick(
      await priceToTick((amount1 / amount0) * 100, decimals1, decimals0, true),
      10,
    );

    let tickUpper = tickToNearestInitializableTick(
      await priceToTick((amount1 / amount0) * 0.01, decimals1, decimals0, true),
      10,
    );

    await nfpm.connect(this.opts.users[0]).mint({
      token0: this.opts.weth.address,
      token1: this.opts.usdc.address,
      fee: 500,
      tickLower: Math.min(tickLower, tickUpper),
      tickUpper: Math.max(tickLower, tickUpper),
      amount0Desired: parseUnits(amount0.toFixed(decimals0), decimals0),
      amount1Desired: parseUnits(amount1.toFixed(decimals1), decimals1),
      amount0Min: 0,
      amount1Min: 0,
      recipient: this.opts.users[0].address,
      deadline: (await ethers.provider.getBlock('latest')).timestamp + 1000,
    });

    decimals0 = 8;
    decimals1 = 18;

    amount1 = 100_000_000 / 21_000;
    amount0 = 100_000_000 / 1_600;

    await generateErc20Balance(
      this.opts.wbtc,
      parseUnits(amount0.toFixed(decimals0), decimals0),
      this.opts.users[0].address,
    );
    await generateErc20Balance(
      this.opts.weth,
      parseUnits(amount1.toFixed(decimals1), decimals1),
      this.opts.users[0].address,
    );

    await this.opts.usdc.connect(this.opts.users[0]).approve(nfpm.address, ethers.constants.MaxUint256);
    await this.opts.weth.connect(this.opts.users[0]).approve(nfpm.address, ethers.constants.MaxUint256);

    tickLower = tickToNearestInitializableTick(
      await priceToTick((amount1 / amount0) * 100, decimals1, decimals0, true),
      10,
    );

    tickUpper = tickToNearestInitializableTick(
      await priceToTick((amount1 / amount0) * 0.01, decimals1, decimals0, true),
      10,
    );

    await nfpm.connect(this.opts.users[0]).mint({
      token0: this.opts.wbtc.address,
      token1: this.opts.weth.address,
      fee: 500,
      tickLower: Math.min(tickLower, tickUpper),
      tickUpper: Math.max(tickLower, tickUpper),
      amount0Desired: parseUnits(amount0.toFixed(decimals0), decimals0),
      amount1Desired: parseUnits(amount1.toFixed(decimals1), decimals1),
      amount0Min: 0,
      amount1Min: 0,
      recipient: this.opts.users[0].address,
      deadline: (await ethers.provider.getBlock('latest')).timestamp + 1000,
    });

    console.log('liquidity added successfully');
    console.log(Changer.seperator);
  };

  changePriceToken = async (asset: Asset, price: number) => {
    const contractAddr =
      asset == 'WBTC' ? '0x942d00008D658dbB40745BBEc89A93c253f9B882' : '0x3607e46698d218B3a5Cae44bF381475C0a5e2ca7';

    const slot =
      asset == 'WBTC'
        ? '0xa5c78c6509e472525490c2b0ff2459c307d7b604b01075c4f9ac7885888b2ea4'
        : '0xf06beb13170e449f12e8666db7687134d704bb840ae1096a61582a93ea5b8795';

    await hre.network.provider.send('hardhat_setStorageAt', [
      contractAddr, // address
      slot, // slot
      ethers.utils.hexZeroPad(ethers.utils.parseUnits(price.toString(), 8).toHexString(), 32), // new value
    ]);

    await increaseBlockTimestamp(310);

    console.log(`${asset} price changed to ${price}`);
    console.log(Changer.seperator);
  };

  changeTargetWeight = async (asset: Asset, weight: number) => {
    const [tokenAddr, tokenDecimals] = asset === 'WBTC' ? [this.opts.wbtc.address, 8] : [this.opts.weth.address, 18];

    const [minProfitBasisPoints, maxUsdgAmounts] = await Promise.resolve([
      this.opts.gmxVault.minProfitBasisPoints(tokenAddr),
      this.opts.gmxVault.maxUsdgAmounts(tokenAddr),
    ]);

    const gov = await hre.ethers.getSigner(this.opts.gov);

    await this.opts.gmxVault
      .connect(gov)
      .setTokenConfig(tokenAddr, tokenDecimals, weight, minProfitBasisPoints, maxUsdgAmounts, false, true);

    console.log(`${asset} weight changed to ${weight}`);
    console.log(Changer.seperator);
  };

  changeCurrentWeights = async (asset: Asset, newAmount: number) => {
    const [tokenAddr, tokenDecimals] = asset === 'WBTC' ? [this.opts.wbtc.address, 8] : [this.opts.weth.address, 18];

    const oracle =
      asset == 'WBTC'
        ? AggregatorV3Interface__factory.connect(addresses.WBTC_ORACLE, ethers.provider)
        : AggregatorV3Interface__factory.connect(addresses.WETH_ORACLE, ethers.provider);

    const price = Number(formatUnits((await oracle.latestRoundData()).answer, 8));

    const oldAmount = Number(formatUnits(await this.opts.gmxVault.usdgAmounts(tokenAddr)));
    const diff = newAmount - oldAmount;

    const poolAmount = await this.opts.gmxVault.poolAmounts(tokenAddr);

    const usdgAmountSlot =
      asset == 'WBTC'
        ? '0xb025994595b47a13944cacd3720394d16e12d8ae8bb4b04bcb0e8d2bf2d222d8'
        : '0x9de8a6d40d7108278fd05d4d403f26abef3a4efb68d3b57239e2e07ff45b0ab';

    const poolAmountSlot =
      asset == 'WBTC'
        ? '0x59910028135492f60329149ab5f217583540ae9e12791dfb7be530e5c9736a3e'
        : '0x3e83a15c1bc6dd7a60c94002578f2794c5e38637de18c8ed57da7ec968d7c81b';

    const additionalPoolAmount = parseUnits((diff / price).toFixed(tokenDecimals), tokenDecimals);

    await hre.network.provider.send('hardhat_setStorageAt', [
      this.opts.gmxVault.address, // address
      usdgAmountSlot, // slot
      ethers.utils.hexZeroPad(ethers.utils.parseUnits(newAmount.toString(), 18).toHexString(), 32), // new value
    ]);

    await hre.network.provider.send('hardhat_setStorageAt', [
      this.opts.gmxVault.address, // address
      poolAmountSlot, // slot
      ethers.utils.hexZeroPad(poolAmount.add(additionalPoolAmount).toHexString(), 32), // new value
    ]);

    console.log(`${asset} usdg amount changed to ${newAmount}`);
    console.log(`${asset} pool amount changed to ${poolAmount.add(additionalPoolAmount)}`);

    console.log(Changer.seperator);
  };
}
