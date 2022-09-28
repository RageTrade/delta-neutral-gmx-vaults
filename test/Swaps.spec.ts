import { expect } from 'chai';
import { BigNumber } from 'ethers';
import hre, { ethers } from 'hardhat';
import { generateErc20Balance } from './utils/erc20';
import { parseEther, parseUnits } from 'ethers/lib/utils';
import { increaseBlockTimestamp } from './utils/vault-helpers';
import { dnGmxJuniorVaultFixture } from './fixtures/dn-gmx-vault';
import addresses from './fixtures/addresses';
import { IStableSwap__factory } from '../typechain-types';

describe('Rebalance & its utils', () => {
  it('Swap Token To USDC', async () => {
    const { dnGmxJuniorVault, usdc, wbtc, weth } = await dnGmxJuniorVaultFixture();
    await generateErc20Balance(weth, parseUnits('1', 18), dnGmxJuniorVault.address);
    await generateErc20Balance(wbtc, parseUnits('1', 8), dnGmxJuniorVault.address);

    await dnGmxJuniorVault.swapToken(wbtc.address, parseUnits('1', 8), 0);
    await dnGmxJuniorVault.swapToken(weth.address, parseUnits('1', 18), 0);

    console.log('Vault wbtc balance:', await wbtc.balanceOf(dnGmxJuniorVault.address));
    console.log('Vault weth balance:', await weth.balanceOf(dnGmxJuniorVault.address));
    console.log('Vault usdc balance:', await usdc.balanceOf(dnGmxJuniorVault.address));
  });

  it('Swap USDC To Token', async () => {
    const { dnGmxJuniorVault, usdc, wbtc, weth } = await dnGmxJuniorVaultFixture();
    await generateErc20Balance(usdc, parseUnits('100000', 6), dnGmxJuniorVault.address);

    await dnGmxJuniorVault.swapUSDC(wbtc.address, parseUnits('1', 8), parseUnits('100000', 6));
    await dnGmxJuniorVault.swapUSDC(weth.address, parseUnits('1', 18), parseUnits('100000', 6));

    console.log('Vault wbtc balance:', await wbtc.balanceOf(dnGmxJuniorVault.address));
    console.log('Vault weth balance:', await weth.balanceOf(dnGmxJuniorVault.address));
    console.log('Vault usdc balance:', await usdc.balanceOf(dnGmxJuniorVault.address));
  });
});
