import hre, { ethers } from 'hardhat';
import { increaseBlockTimestamp } from './shared';
import { dnGmxJuniorVaultFixture } from '../fixtures/dn-gmx-junior-vault';
import { parseUnits } from 'ethers/lib/utils';

type Asset = 'WETH' | 'WBTC';

export class Changer {
  public static seperator = '--------------------------------';

  constructor(public opts: Awaited<ReturnType<typeof dnGmxJuniorVaultFixture>>) {
    opts = opts;
  }

  changePriceToken = async (asset: Asset, price: number) => {
    const contractAddr =
      asset == 'WBTC' ? '0x942d00008D658dbB40745BBEc89A93c253f9B882' : '0x3607e46698d218B3a5Cae44bF381475C0a5e2ca7';

    const slot =
      asset == 'WBTC'
        ? '0xefc52eb5bcce9ceaaebf0054002d7e364b5b15977eb33576623ae2e3d120addb'
        : '0x12f79f2c07f3244fa8d6a85e976563a6abab49e9ff994b701b665f333f8a0e6b';

    await hre.network.provider.send('hardhat_setStorageAt', [
      contractAddr, // address
      slot, // slot
      ethers.utils.hexZeroPad(ethers.utils.parseUnits(price.toString(), 8).toHexString(), 32), // new value
    ]);

    await increaseBlockTimestamp(310);

    console.log(`${asset} price changed to ${price}`);
    console.log(Changer.seperator);
  };

  changePriceGlp = async (price: number) => {
    await hre.network.provider.send('hardhat_setStorageAt', [
      '0x3607e46698d218B3a5Cae44bF381475C0a5e2ca7', // address
      '0x265b84761fa8813caeca7f721d05ef6bdf526034306315bc1279417cc7c803ba', // slot
      ethers.utils.hexZeroPad(ethers.utils.parseUnits(price.toString(), 8).toHexString(), 32), // new value
    ]);

    await increaseBlockTimestamp(310);

    console.log(`GLP price changed to ${price}`);
    console.log(Changer.seperator);
  };

  changeWeight = async (asset: Asset, weight: number) => {
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
}
