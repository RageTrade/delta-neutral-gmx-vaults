import { expect } from 'chai';
import { BigNumber } from 'ethers';
import hre, { ethers } from 'hardhat';
import { increaseBlockTimestamp } from './utils/shared';
import { generateErc20Balance } from './utils/generator';
import { parseEther, parseUnits } from 'ethers/lib/utils';
import { dnGmxJuniorVaultFixture } from './fixtures/dn-gmx-junior-vault';

describe('Swaps', () => {
  it('Swap Token To USDC', async () => {
    const { dnGmxJuniorVault, usdc, wbtc, weth } = await dnGmxJuniorVaultFixture();

    await generateErc20Balance(weth, parseUnits('1', 18), dnGmxJuniorVault.address);
    await generateErc20Balance(wbtc, parseUnits('1', 8), dnGmxJuniorVault.address);

    expect(await usdc.balanceOf(dnGmxJuniorVault.address)).to.eq(0);

    const btcPrice = await dnGmxJuniorVault['getPrice(address)'](wbtc.address);
    await dnGmxJuniorVault.swapToken(wbtc.address, parseUnits('1', 8), 0);
    const usdcBal1 = await usdc.balanceOf(dnGmxJuniorVault.address);

    expect(usdcBal1.sub(btcPrice.div(BigNumber.from(10).pow(30 - 8))).abs()).to.lte(BigNumber.from(10).pow(8));
    expect(await wbtc.balanceOf(dnGmxJuniorVault.address)).to.eq(0);

    const ethPrice = await dnGmxJuniorVault['getPrice(address)'](weth.address);
    await dnGmxJuniorVault.swapToken(weth.address, parseUnits('1', 18), 0);
    const usdcBal2 = await usdc.balanceOf(dnGmxJuniorVault.address);

    expect(
      usdcBal2
        .sub(usdcBal1)
        .sub(ethPrice.div(BigNumber.from(10).pow(30 - 18)))
        .abs(),
    ).to.lte(BigNumber.from(10).pow(8));
    expect(await weth.balanceOf(dnGmxJuniorVault.address)).to.eq(0);
  });

  it('Swap USDC To Token', async () => {
    const { dnGmxJuniorVault, usdc, wbtc, weth } = await dnGmxJuniorVaultFixture();
    await generateErc20Balance(usdc, parseUnits('100000', 6), dnGmxJuniorVault.address);

    expect(await wbtc.balanceOf(dnGmxJuniorVault.address)).to.eq(0);
    expect(await weth.balanceOf(dnGmxJuniorVault.address)).to.eq(0);

    const swapToWBTC = await dnGmxJuniorVault.callStatic.swapUSDC(
      wbtc.address,
      parseUnits('1', 8),
      parseUnits('100000', 6),
    );
    const swapToWETH = await dnGmxJuniorVault.callStatic.swapUSDC(
      weth.address,
      parseUnits('1', 18),
      parseUnits('100000', 6),
    );

    await dnGmxJuniorVault.swapUSDC(
      wbtc.address,
      parseUnits('1', 8),
      parseUnits('100000', 6),
    );
    await dnGmxJuniorVault.swapUSDC(
      weth.address,
      parseUnits('1', 18),
      parseUnits('100000', 6),
    );

    expect(await wbtc.balanceOf(dnGmxJuniorVault.address)).to.eq(swapToWBTC.tokensReceived);
    expect(await weth.balanceOf(dnGmxJuniorVault.address)).to.eq(swapToWETH.tokensReceived);
  });

  it.only('swaps with mock', async () => {
    const { dnGmxJuniorVault, usdc, wbtc, weth, mocks } = await dnGmxJuniorVaultFixture();

    await mocks.stableSwapMock.setPrice(parseUnits('19929', 6))
    await dnGmxJuniorVault.setMocks(mocks.swapRouterMock.address, mocks.stableSwapMock.address);
    await dnGmxJuniorVault.grantAllowances();

    await generateErc20Balance(usdc, parseUnits('200000', 6), dnGmxJuniorVault.address);

    expect(await wbtc.balanceOf(dnGmxJuniorVault.address)).to.eq(0);
    expect(await weth.balanceOf(dnGmxJuniorVault.address)).to.eq(0);

    const swapToWBTC = await dnGmxJuniorVault.callStatic.swapUSDC(
      wbtc.address,
      parseUnits('1', 8),
      parseUnits('100000', 6),
    );
    const swapToWETH = await dnGmxJuniorVault.callStatic.swapUSDC(
      weth.address,
      parseUnits('1', 18),
      parseUnits('100000', 6),
    );

    await dnGmxJuniorVault.swapUSDC(
      wbtc.address,
      parseUnits('1', 8),
      parseUnits('100000', 6),
    );
    await dnGmxJuniorVault.swapUSDC(
      weth.address,
      parseUnits('1', 18),
      parseUnits('100000', 6),
    );

    expect(await wbtc.balanceOf(dnGmxJuniorVault.address)).to.eq(swapToWBTC.tokensReceived);
    expect(await weth.balanceOf(dnGmxJuniorVault.address)).to.eq(swapToWETH.tokensReceived);
  });
});
