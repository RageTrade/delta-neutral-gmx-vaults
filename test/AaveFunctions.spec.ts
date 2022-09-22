import { expect } from 'chai';
import hre, { ethers } from 'hardhat';
import { generateErc20Balance } from './utils/erc20';
import { parseEther, parseUnits } from 'ethers/lib/utils';
import { dnGmxJuniorVaultFixture } from './fixtures/dn-gmx-vault';

describe('Aave interactions & functions', () => {
  it('executeSupply', async () => {
    const amount = parseUnits('100', 6);
    const { dnGmxJuniorVault, usdc } = await dnGmxJuniorVaultFixture();

    await generateErc20Balance(usdc, amount, dnGmxJuniorVault.address);

    await dnGmxJuniorVault.executeSupply(usdc.address, amount);
  });

  it('executeWithdraw', async () => {
    const amount = parseUnits('100', 6);
    const { dnGmxJuniorVault, usdc } = await dnGmxJuniorVaultFixture();
    await generateErc20Balance(usdc, amount, dnGmxJuniorVault.address);

    await dnGmxJuniorVault.executeSupply(usdc.address, amount);
    await dnGmxJuniorVault.executeWithdraw(usdc.address, amount);
  });

  it('executeBorrow & executeRepay', async () => {
    const amount = parseUnits('100', 6);
    const { dnGmxJuniorVault, usdc, wbtc, weth } = await dnGmxJuniorVaultFixture();
    await generateErc20Balance(usdc, amount, dnGmxJuniorVault.address);

    await dnGmxJuniorVault.executeSupply(usdc.address, amount);

    await dnGmxJuniorVault.executeBorrow(wbtc.address, parseUnits('0.002', 8));
    await dnGmxJuniorVault.executeBorrow(weth.address, parseEther('0.02'));

    await dnGmxJuniorVault.executeRepay(wbtc.address, parseUnits('0.002', 8));
    await dnGmxJuniorVault.executeRepay(weth.address, parseEther('0.02'));
  });
});
