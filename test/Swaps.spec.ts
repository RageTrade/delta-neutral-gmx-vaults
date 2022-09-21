import { expect } from 'chai';
import { BigNumber } from 'ethers';
import hre, { ethers } from 'hardhat';
import { changePrice } from './utils/price-helpers';
import { parseEther, parseUnits } from 'ethers/lib/utils';
import { dnGmxVaultFixture } from './fixtures/dn-gmx-vault';
import { increaseBlockTimestamp } from './utils/vault-helpers';
import { generateErc20Balance } from './utils/erc20';

describe('Rebalance & its utils', () => {
  it('Swap Token To USDC', async () => {
    const { dnGmxVault, usdc, wbtc, weth } = await dnGmxVaultFixture();
    await generateErc20Balance(wbtc, parseUnits('5', 8), dnGmxVault.address);
    await dnGmxVault.swapTokenToUSDC(wbtc.address, parseUnits('1', 8), 0);

    console.log('Vault wbtc balance:', await wbtc.balanceOf(dnGmxVault.address));
    console.log('Vault usdc balance:', await usdc.balanceOf(dnGmxVault.address));
  });

  it('Swap USDC To Token', async () => {
    const { dnGmxVault, usdc, wbtc, weth } = await dnGmxVaultFixture();
    await generateErc20Balance(usdc, parseUnits('100000', 6), dnGmxVault.address);
    await dnGmxVault.swapUSDCToToken(wbtc.address, parseUnits('1', 8), parseUnits('100000', 6), { gasLimit: 30000000 });

    console.log('Vault wbtc balance:', await wbtc.balanceOf(dnGmxVault.address));
    console.log('Vault usdc balance:', await usdc.balanceOf(dnGmxVault.address));
  });
});
