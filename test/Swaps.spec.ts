import { expect } from 'chai';
import { BigNumber } from 'ethers';
import { generateErc20Balance } from './utils/generator';
import { formatEther, formatUnits, parseEther, parseUnits } from 'ethers/lib/utils';
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

    await dnGmxJuniorVault.swapUSDC(wbtc.address, parseUnits('1', 8), parseUnits('100000', 6));
    await dnGmxJuniorVault.swapUSDC(weth.address, parseUnits('1', 18), parseUnits('100000', 6));

    expect(await wbtc.balanceOf(dnGmxJuniorVault.address)).to.eq(swapToWBTC.tokensReceived);
    expect(await weth.balanceOf(dnGmxJuniorVault.address)).to.eq(swapToWETH.tokensReceived);
  });

  it('swaps with mock', async () => {
    const { dnGmxJuniorVault, usdc, wbtc, weth, mocks } = await dnGmxJuniorVaultFixture();

    await mocks.stableSwapMock.setPrice(parseUnits('19929', 6));
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

    await dnGmxJuniorVault.swapUSDC(wbtc.address, parseUnits('1', 8), parseUnits('100000', 6));
    await dnGmxJuniorVault.swapUSDC(weth.address, parseUnits('1', 18), parseUnits('100000', 6));

    expect(await wbtc.balanceOf(dnGmxJuniorVault.address)).to.eq(swapToWBTC.tokensReceived);
    expect(await weth.balanceOf(dnGmxJuniorVault.address)).to.eq(swapToWETH.tokensReceived);
  });

  it('convert asset to aUSDC', async () => {
    const { dnGmxJuniorVault, aUSDC, users, sGlp } = await dnGmxJuniorVaultFixture();

    const assets = parseEther('150');
    const usdcAmount = parseUnits('100', 6);

    const price = await dnGmxJuniorVault['getPrice()']();
    const PRICE_PRECISION = BigNumber.from(10).pow(30);

    await sGlp.connect(users[0]).transfer(dnGmxJuniorVault.address, assets);

    expect(await aUSDC.balanceOf(dnGmxJuniorVault.address)).to.eq(0);
    expect(await dnGmxJuniorVault.totalAssets()).to.eq(assets);

    await dnGmxJuniorVault.convertAssetToAUsdc(usdcAmount); // usdcRedeemSlippage = 1% (from fixture)

    const glpToUnstakeAndRedeem = usdcAmount.mul(PRICE_PRECISION).div(price);
    const minUsdcOut = usdcAmount.mul(99).div(100);

    // console.log('glpToUnstakeAndRedeem', formatEther(glpToUnstakeAndRedeem))
    // console.log('totalAssets', formatEther(await dnGmxJuniorVault.totalAssets()))
    // console.log('ausdc bal', formatUnits((await aUSDC.balanceOf(dnGmxJuniorVault.address)), 6))
    // console.log('minUsdcOut', formatUnits(minUsdcOut, 6))

    expect(await aUSDC.balanceOf(dnGmxJuniorVault.address)).to.gt(minUsdcOut);
    expect(await dnGmxJuniorVault.totalAssets()).to.eq(assets.sub(glpToUnstakeAndRedeem));
  });

  it('convert asset to aUSDC - fail slippage', async () => {
    const { dnGmxJuniorVault, aUSDC, users, sGlp } = await dnGmxJuniorVaultFixture();

    const assets = parseEther('150');
    const usdcAmount = parseUnits('100', 6);

    await dnGmxJuniorVault.setThresholds({
      slippageThreshold: 100,
      usdcRedeemSlippage: 10,
      hfThreshold: 12_000,
      usdcConversionThreshold: parseUnits('1', 6),
      wethConversionThreshold: 10n ** 15n,
      hedgeUsdcAmountThreshold: parseUnits('1', 6),
    });

    await sGlp.connect(users[0]).transfer(dnGmxJuniorVault.address, assets);

    expect(await aUSDC.balanceOf(dnGmxJuniorVault.address)).to.eq(0);
    expect(await dnGmxJuniorVault.totalAssets()).to.eq(assets);

    // usdcRedeemSlippage = 0.1%
    expect(dnGmxJuniorVault.convertAssetToAUsdc(usdcAmount)).to.be.revertedWith(
      `VM Exception while processing transaction: reverted with reason string 'GlpManager: insufficient output'`,
    );
  });

  it.only('convert aUSDC to asset', async () => {
    const { dnGmxJuniorVault, dnGmxSeniorVault, usdc, aUSDC, users, gmxVault, sGlp } = await dnGmxJuniorVaultFixture();
    await dnGmxSeniorVault.connect(users[1]).deposit(parseUnits('150', 6), users[1].address);

    const aUSDCAmount = parseUnits('100', 6);

    const slippageThreshold = BigNumber.from(100); // 1%
    const MAX_BPS = BigNumber.from(10_000);
    const PRICE_PRECISION = BigNumber.from(10).pow(30);

    const priceOfUsdc = await gmxVault.getMinPrice(usdc.address);
    const priceOfGlp = await dnGmxJuniorVault['getPrice()']();

    const minUsdgOut = aUSDCAmount
      .mul(priceOfUsdc)
      .mul(MAX_BPS.sub(slippageThreshold))
      .div(MAX_BPS)
      .div(PRICE_PRECISION);
    const minGlpOUt = minUsdgOut.mul(PRICE_PRECISION).div(priceOfGlp);

    await dnGmxJuniorVault.executeBorrowFromDnGmxSeniorVault(aUSDCAmount);

    expect(await aUSDC.balanceOf(dnGmxJuniorVault.address)).to.eq(aUSDCAmount);
    expect(await dnGmxJuniorVault.totalAssets()).to.eq(0);

    await dnGmxJuniorVault.convertAUsdcToAsset(aUSDCAmount); // usdcRedeemSlippage = 1% (from fixture)

    console.log('min usdg out', formatEther(minUsdgOut));
    console.log('min glp out', formatEther(minGlpOUt));

    expect(await aUSDC.balanceOf(dnGmxJuniorVault.address)).to.eq(0);
    expect(await dnGmxJuniorVault.totalAssets()).to.gt(minGlpOUt);
  });

  it('convert aUSDC to asset - fail', async () => {});
});
