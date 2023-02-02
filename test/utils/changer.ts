import hre, { ethers } from 'hardhat';
import addresses from '../fixtures/addresses';
import { increaseBlockTimestamp } from './shared';
import { AggregatorV3Interface__factory } from '../../typechain-types';
import { formatUnits, parseEther, parseUnits } from 'ethers/lib/utils';
import { dnGmxJuniorVaultFixture } from '../fixtures/dn-gmx-junior-vault';

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

  changeUsdgAmount = async (asset: Asset, newAmount: number) => {
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
      ethers.utils.hexZeroPad(
        ethers.utils.parseUnits(poolAmount.add(additionalPoolAmount).toString(), tokenDecimals).toHexString(),
        32,
      ), // new value
    ]);

    console.log(`${asset} usdg amount changed to ${newAmount}`);
    console.log(Changer.seperator);
  };
}
