import { expect } from 'chai';
import hre, { ethers } from 'hardhat';
import { parseEther, parseUnits } from 'ethers/lib/utils';
import { dnGmxVaultFixture } from './fixtures/dn-gmx-vault';
import { generateErc20Balance } from './utils/erc20';

describe('Aave interactions & functions', () => {
  it('executeSupply', async () => {
    const amount = parseUnits('100', 6);
    const { dnGmxVault, usdc } = await dnGmxVaultFixture();

    await generateErc20Balance(usdc, amount, dnGmxVault.address);

    await dnGmxVault.executeSupply(usdc.address, amount);
  });

  it('executeWithdraw', async () => {
    const amount = parseUnits('100', 6);
    const { dnGmxVault, usdc } = await dnGmxVaultFixture();
    await generateErc20Balance(usdc, amount, dnGmxVault.address);

    await dnGmxVault.executeSupply(usdc.address, amount);
    await dnGmxVault.executeWithdraw(usdc.address, amount);
  });

  it.only('executeBorrow & executeRepay', async () => {
    const amount = parseUnits('100', 6);
    const { dnGmxVault, usdc, wbtc, weth } = await dnGmxVaultFixture();
    await generateErc20Balance(usdc, amount, dnGmxVault.address);

    await dnGmxVault.executeSupply(usdc.address, amount);

    await dnGmxVault.executeBorrow(wbtc.address, parseUnits('0.002', 8));
    await dnGmxVault.executeBorrow(weth.address, parseEther('0.02'));

    await dnGmxVault.executeRepay(wbtc.address, parseUnits('0.002', 8));
    await dnGmxVault.executeRepay(weth.address, parseEther('0.02'));
  });
});
