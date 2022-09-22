import hre, { ethers } from 'hardhat';
import { parseUnits } from 'ethers/lib/utils';
import addresses, { GMX_ECOSYSTEM_ADDRESSES } from '../fixtures/addresses';
import { increaseBlockTimestamp } from './vault-helpers';
import {
  AggregatorV3Interface__factory,
  IERC20__factory,
  IGlpManager__factory,
  IVault__factory,
} from '../../typechain-types';

export const changePrice = async (asset: 'WETH' | 'WBTC', price: number) => {
  const signer = (await hre.ethers.getSigners())[0];

  const oracleAddr = asset == 'WBTC' ? addresses.WBTC_ORACLE : addresses.WETH_ORACLE;
  const contractAddr =
    asset == 'WBTC' ? '0x942d00008D658dbB40745BBEc89A93c253f9B882' : '0x3607e46698d218B3a5Cae44bF381475C0a5e2ca7';
  const slot =
    asset == 'WBTC'
      ? '0xefc52eb5bcce9ceaaebf0054002d7e364b5b15977eb33576623ae2e3d120addb'
      : '0x12f79f2c07f3244fa8d6a85e976563a6abab49e9ff994b701b665f333f8a0e6b';

  await hre.network.provider.send('hardhat_setStorageAt', [
    contractAddr, // address
    slot, // slot
    ethers.utils.hexZeroPad(parseUnits(price.toString(), 8).toHexString(), 32), // new value
  ]);

  await increaseBlockTimestamp(310);
};

export const logGlpPrice = async () => {
  const signer = await ethers.getSigners();
  const glp = IERC20__factory.connect(GMX_ECOSYSTEM_ADDRESSES.GLP, signer[0]);
  const glpManager = IGlpManager__factory.connect(GMX_ECOSYSTEM_ADDRESSES.GlpManager, signer[0]);

  const aum = await glpManager.getAum(false);
  const totalSupply = await glp.totalSupply();

  const price = aum.div(totalSupply).div(10 ** 6);
  console.log('glpPrice', price);
};

export const logTargetWeights = async () => {
  const signer = await ethers.getSigners();

  const vault = IVault__factory.connect(GMX_ECOSYSTEM_ADDRESSES.Vault, signer[0]);
  const btcWeights = await vault.tokenWeights(addresses.WBTC);
  const ethWeights = await vault.tokenWeights(addresses.WETH);

  const totalWeights = await vault.totalTokenWeights();

  console.log('btcWeights', btcWeights);
  console.log('ethWeights', ethWeights);
  console.log('totalWeights', totalWeights);
};
