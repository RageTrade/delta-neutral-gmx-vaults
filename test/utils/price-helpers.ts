import hre, { ethers } from 'hardhat';
import { parseUnits } from 'ethers/lib/utils';
import addresses, { GMX_ECOSYSTEM_ADDRESSES } from '../fixtures/addresses';
import { increaseBlockTimestamp } from './vault-helpers';
import {
  DnGmxJuniorVault,
  DnGmxJuniorVaultMock,
  DnGmxSeniorVault,
  DnGmxSeniorVaultMock,
  IERC20__factory,
  IGlpManager__factory,
  IPool,
  IVault,
  IVault__factory,
} from '../../typechain-types';
import { ContractTransaction } from 'ethers';

import { RewardsHarvestedEvent } from '../../typechain-types/contracts/mocks/DnGmxJuniorVaultMock';
import { getErc20 } from './erc20';

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

  const minAum = await glpManager.getAum(false);
  const maxAum = await glpManager.getAum(true);

  const totalSupply = await glp.totalSupply();

  const minPrice = minAum.div(totalSupply).div(10 ** 6);
  const maxPrice = maxAum.div(totalSupply).div(10 ** 6);

  console.log('glpPrice(min)', minPrice);
  console.log('glpPrice(max)', maxPrice);
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

export const logAavePositions = async (
  juniorVault: DnGmxJuniorVault | DnGmxJuniorVaultMock,
  seniorVault: DnGmxSeniorVault | DnGmxSeniorVaultMock,
  pool: IPool,
) => {
  const aUSDC = await getErc20((await pool.getReserveData(addresses.USDC)).aTokenAddress);
  const vWBTC = await getErc20((await pool.getReserveData(addresses.WBTC)).variableDebtTokenAddress);
  const vWETH = await getErc20((await pool.getReserveData(addresses.WETH)).variableDebtTokenAddress);

  console.log('SENIOR TRANCHE');
  console.log('aave aUSDC postion', aUSDC.balanceOf(seniorVault.address));

  console.log('JUNIOR TRANCHE');
  console.log('aave aUSDC postion', aUSDC.balanceOf(juniorVault.address));
};

export const logGlpRewards = async (tx: ContractTransaction, juniorVault: DnGmxJuniorVault | DnGmxJuniorVaultMock) => {
  const confirmed = await tx.wait();
  for (const log of confirmed.logs) {
    if (log.topics[0] === juniorVault.interface.getEventTopic('RewardsHarvested')) {
      const args = juniorVault.interface.parseLog(log).args;
      console.log('total eth harvested (rewards): ', args.totalEthAmount);
      console.log('junior vault eth share (rewards): ', args.juniorVaultShare);
    }
  }
};

export const changeTargetWeights = async (asset: 'WETH' | 'WBTC', newWeight: number, gmxUnderlingVault: IVault) => {
  const [tokenAddr, tokenDecimals] = asset === 'WETH' ? [addresses.WETH, 18] : [addresses.WBTC, 8];

  const [minProfitBasisPoints, maxUsdgAmounts] = await Promise.resolve([
    gmxUnderlingVault.minProfitBasisPoints(tokenAddr),
    gmxUnderlingVault.maxUsdgAmounts(tokenAddr),
  ]);

  const gov = await hre.ethers.getSigner(GMX_ECOSYSTEM_ADDRESSES.GOV);

  await gmxUnderlingVault
    .connect(gov)
    .setTokenConfig(tokenAddr, tokenDecimals, newWeight, minProfitBasisPoints, maxUsdgAmounts, false, true);
};
