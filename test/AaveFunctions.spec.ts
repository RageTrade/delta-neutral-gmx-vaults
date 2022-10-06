import { expect } from 'chai';
import { generateErc20Balance } from './utils/generator';
import { parseEther, parseUnits } from 'ethers/lib/utils';
import { dnGmxJuniorVaultFixture } from './fixtures/dn-gmx-junior-vault';

describe('Aave interactions & functions', () => {
  it('executeSupply', async () => {
    const amount = parseUnits('100', 6);
    const { dnGmxJuniorVault, usdc, aUSDC } = await dnGmxJuniorVaultFixture();

    await generateErc20Balance(usdc, amount, dnGmxJuniorVault.address);

    expect(await aUSDC.balanceOf(dnGmxJuniorVault.address)).to.eq(0);
    expect(await usdc.balanceOf(dnGmxJuniorVault.address)).to.eq(amount);

    await dnGmxJuniorVault.executeSupply(usdc.address, amount);

    expect(await usdc.balanceOf(dnGmxJuniorVault.address)).to.eq(0);
    expect(await aUSDC.balanceOf(dnGmxJuniorVault.address)).to.eq(amount);
  });

  it('executeWithdraw', async () => {
    const amount = parseUnits('100', 6);
    const { dnGmxJuniorVault, usdc, aUSDC } = await dnGmxJuniorVaultFixture();
    await generateErc20Balance(usdc, amount, dnGmxJuniorVault.address);

    expect(await aUSDC.balanceOf(dnGmxJuniorVault.address)).to.eq(0);
    expect(await usdc.balanceOf(dnGmxJuniorVault.address)).to.eq(amount);

    await dnGmxJuniorVault.executeSupply(usdc.address, amount);

    expect(await usdc.balanceOf(dnGmxJuniorVault.address)).to.eq(0);
    expect(await aUSDC.balanceOf(dnGmxJuniorVault.address)).to.eq(amount);

    await dnGmxJuniorVault.executeWithdraw(usdc.address, amount);

    expect(await aUSDC.balanceOf(dnGmxJuniorVault.address)).to.eq(0);
    expect(await usdc.balanceOf(dnGmxJuniorVault.address)).to.eq(amount);
  });

  it.only('executeBorrow & executeRepay', async () => {
    const amount = parseUnits('100', 6);
    const btcAmount = parseUnits('0.002', 8);
    const ethAmount = parseEther('0.02');

    const { dnGmxJuniorVault, usdc, wbtc, weth, aUSDC, vdWBTC, vdWETH, lendingPool } = await dnGmxJuniorVaultFixture();
    await generateErc20Balance(usdc, amount, dnGmxJuniorVault.address);

    expect(await aUSDC.balanceOf(dnGmxJuniorVault.address)).to.eq(0);
    expect(await usdc.balanceOf(dnGmxJuniorVault.address)).to.eq(amount);

    await dnGmxJuniorVault.executeSupply(usdc.address, amount);

    expect(await usdc.balanceOf(dnGmxJuniorVault.address)).to.eq(0);
    expect(await aUSDC.balanceOf(dnGmxJuniorVault.address)).to.eq(amount);

    const txBtc = await dnGmxJuniorVault.executeBorrow(wbtc.address, btcAmount);
    const txEth = await dnGmxJuniorVault.executeBorrow(weth.address, ethAmount);

    // console.log('logging hf', (await lendingPool.getUserAccountData(dnGmxJuniorVault.address)).healthFactor);

    expect(
      await vdWBTC.balanceOf(dnGmxJuniorVault.address, {
        blockTag: txBtc.blockNumber,
      }),
    ).to.eq(btcAmount);

    await dnGmxJuniorVault.executeRepay(wbtc.address, parseUnits('0.002', 8));
    expect(await vdWBTC.balanceOf(dnGmxJuniorVault.address)).to.eq(0);

    expect(
      await vdWETH.balanceOf(dnGmxJuniorVault.address, {
        blockTag: txEth.blockNumber,
      }),
    ).to.eq(ethAmount);

    await dnGmxJuniorVault.executeRepay(weth.address, parseEther('0.02'));
    expect(await vdWETH.balanceOf(dnGmxJuniorVault.address)).to.lte(parseUnits('1', 8));
  });
});
