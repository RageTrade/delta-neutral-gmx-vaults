import hre from 'hardhat';
import { expect } from 'chai';
import { BigNumber } from 'ethers';
import { formatUnits, parseEther, parseUnits } from 'ethers/lib/utils';
import { dnGmxJuniorVaultFixture } from './fixtures/dn-gmx-junior-vault';
import { generateErc20Balance } from './utils/generator';

describe('Swaps', () => {
  it('Swap Token To USDC', async () => {
    const { dnGmxJuniorVault, dnGmxSeniorVault, dnGmxJuniorVaultSigner, usdc, wbtc, weth } =
      await dnGmxJuniorVaultFixture();

    const MAX_BPS = BigNumber.from(10_000);
    const PRICE_PRECISION = BigNumber.from(10).pow(30);

    const slippageThresholdSwap = BigNumber.from(100);

    await generateErc20Balance(weth, parseUnits('1', 18), dnGmxJuniorVault.address);
    await generateErc20Balance(wbtc, parseUnits('1', 8), dnGmxJuniorVault.address);

    const btcPrice = await dnGmxJuniorVault['getPrice(address,bool)'](wbtc.address, true);

    let minUsdcOut = btcPrice
      .mul(parseUnits('1', 8))
      .mul(MAX_BPS.sub(slippageThresholdSwap))
      .div(PRICE_PRECISION)
      .div(MAX_BPS);

    await dnGmxJuniorVault.swapToken(wbtc.address, parseUnits('1', 8), minUsdcOut);
    let usdcBal = await usdc.balanceOf(dnGmxJuniorVault.address);

    expect(usdcBal).gt(minUsdcOut);
    expect(await wbtc.balanceOf(dnGmxJuniorVault.address)).to.eq(0);

    // reset usdc bal to 0
    await usdc
      .connect(dnGmxJuniorVaultSigner)
      .transfer(dnGmxSeniorVault.address, usdc.balanceOf(dnGmxJuniorVault.address));

    const ethPrice = await dnGmxJuniorVault['getPrice(address)'](weth.address);

    minUsdcOut = ethPrice
      .mul(parseUnits('1', 18))
      .mul(MAX_BPS.sub(slippageThresholdSwap))
      .div(PRICE_PRECISION)
      .div(MAX_BPS);

    await dnGmxJuniorVault.swapToken(weth.address, parseUnits('1', 18), minUsdcOut);
    usdcBal = await usdc.balanceOf(dnGmxJuniorVault.address);

    expect(usdcBal).to.gt(minUsdcOut);
    expect(await weth.balanceOf(dnGmxJuniorVault.address)).to.eq(0);
  });

  it('Swap USDC To Token - with exact out', async () => {
    const { dnGmxJuniorVault, dnGmxSeniorVault, dnGmxJuniorVaultSigner, usdc, wbtc, weth } =
      await dnGmxJuniorVaultFixture();

    const MAX_BPS = BigNumber.from(10_000);
    const PRICE_PRECISION = BigNumber.from(10).pow(30);

    const slippageThresholdSwap = BigNumber.from(100);

    const btcPrice = await dnGmxJuniorVault['getPrice(address,bool)'](wbtc.address, true);

    let maxUsdcIn = btcPrice
      .mul(parseUnits('1', 8))
      .mul(MAX_BPS.add(slippageThresholdSwap))
      .div(PRICE_PRECISION)
      .div(MAX_BPS);

    await generateErc20Balance(usdc, maxUsdcIn, dnGmxJuniorVault.address);
    await dnGmxJuniorVault.swapUSDC(true, wbtc.address, parseUnits('1', 8), maxUsdcIn);

    expect(await wbtc.balanceOf(dnGmxJuniorVault.address)).to.eq(parseUnits('1', 8));

    // reset usdc bal to 0
    await usdc
      .connect(dnGmxJuniorVaultSigner)
      .transfer(dnGmxSeniorVault.address, usdc.balanceOf(dnGmxJuniorVault.address));

    const ethPrice = await dnGmxJuniorVault['getPrice(address,bool)'](wbtc.address, true);

    maxUsdcIn = ethPrice
      .mul(parseUnits('1', 8))
      .mul(MAX_BPS.add(slippageThresholdSwap))
      .div(PRICE_PRECISION)
      .div(MAX_BPS);

    await generateErc20Balance(usdc, maxUsdcIn, dnGmxJuniorVault.address);
    await dnGmxJuniorVault.swapUSDC(true, weth.address, parseUnits('1', 18), parseUnits('100000', 6));

    expect(await weth.balanceOf(dnGmxJuniorVault.address)).to.eq(parseUnits('1', 18));
  });

  it('Swap USDC To Token - with exact in', async () => {
    const { dnGmxJuniorVault, dnGmxSeniorVault, dnGmxJuniorVaultSigner, usdc, wbtc, weth } =
      await dnGmxJuniorVaultFixture();

    const MAX_BPS = BigNumber.from(10_000);
    const PRICE_PRECISION = BigNumber.from(10).pow(30);

    const slippageThresholdSwap = BigNumber.from(100);

    const btcPrice = await dnGmxJuniorVault['getPrice(address,bool)'](wbtc.address, true);
    // console.log({btcPrice})

    let usdcIn = parseUnits('1000', 6);

    let minBtcOut = usdcIn.mul(PRICE_PRECISION).mul(MAX_BPS.sub(slippageThresholdSwap)).div(btcPrice).div(MAX_BPS);

    // console.log({ minBtcOut });

    await generateErc20Balance(usdc, usdcIn, dnGmxJuniorVault.address);
    await dnGmxJuniorVault.swapUSDC(false, wbtc.address, minBtcOut, usdcIn);

    // console.log("actual btc out", formatUnits(await wbtc.balanceOf(dnGmxJuniorVault.address), 8))

    expect(await wbtc.balanceOf(dnGmxJuniorVault.address)).to.gt(minBtcOut);

    // reset usdc bal to 0
    await usdc
      .connect(dnGmxJuniorVaultSigner)
      .transfer(dnGmxSeniorVault.address, usdc.balanceOf(dnGmxJuniorVault.address));

    const ethPrice = await dnGmxJuniorVault['getPrice(address,bool)'](weth.address, true);
    // console.log({ethPrice})

    let minEthOut = usdcIn
      .mul(PRICE_PRECISION)
      .mul(MAX_BPS.sub(slippageThresholdSwap))
      .mul(1n ** 10n)
      .div(ethPrice)
      .div(MAX_BPS);

    // console.log({ minEthOut });

    await generateErc20Balance(usdc, usdcIn, dnGmxJuniorVault.address);
    await dnGmxJuniorVault.swapUSDC(false, weth.address, minEthOut, usdcIn);

    expect(await weth.balanceOf(dnGmxJuniorVault.address)).to.gt(minEthOut);
  });

  it('convert asset to aUSDC', async () => {
    const { dnGmxJuniorVault, usdc, aUSDC, users, sGlp, gmxVault } = await dnGmxJuniorVaultFixture();

    const MAX_BPS = BigNumber.from(10_000);
    const slippageThresholdGmxBps = BigNumber.from(100);
    const PRICE_PRECISION = BigNumber.from(10).pow(30);

    const usdcAmount = parseUnits('100', 6);

    const glpPrice = await dnGmxJuniorVault.getGlpPriceInUsdc(false);
    // console.log('glpPrice', formatUnits(glpPrice, 30))

    const usdcPrice = await gmxVault.getMaxPrice(usdc.address);
    // console.log('usdcPrice', formatUnits(usdcPrice, 30))

    const minUsdcOut = usdcAmount
      .mul(usdcPrice)
      .mul(MAX_BPS.sub(slippageThresholdGmxBps))
      .div(PRICE_PRECISION)
      .div(MAX_BPS);

    const glpInput = usdcAmount.mul(PRICE_PRECISION).div(glpPrice);

    await sGlp.connect(users[0]).transfer(dnGmxJuniorVault.address, glpInput);

    expect(await aUSDC.balanceOf(dnGmxJuniorVault.address)).to.eq(0);
    expect(await dnGmxJuniorVault.totalAssets()).to.eq(glpInput);

    // console.log('glpInput', formatEther(glpInput))
    // console.log('totalAssets', formatEther(await dnGmxJuniorVault.totalAssets()))
    // console.log('ausdc bal', formatUnits((await aUSDC.balanceOf(dnGmxJuniorVault.address)), 6))
    // console.log('minUsdcOut', formatUnits(minUsdcOut, 6))

    await dnGmxJuniorVault.convertAssetToAUsdc(usdcAmount);

    expect(await aUSDC.balanceOf(dnGmxJuniorVault.address)).to.gt(minUsdcOut);
    expect(await aUSDC.balanceOf(dnGmxJuniorVault.address)).to.lt(usdcAmount);

    expect(await dnGmxJuniorVault.totalAssets()).to.eq(0);
  });

  it('convert asset to aUSDC - fail slippage', async () => {
    const { dnGmxJuniorVault, aUSDC, users, sGlp } = await dnGmxJuniorVaultFixture();

    const assets = parseEther('150');
    const usdcAmount = parseUnits('100', 6);

    await dnGmxJuniorVault.setThresholds(
      100, //_slippageThresholdSwapBtcBps
      100, //_slippageThresholdSwapEthBps
      10, //slippageThresholdGmxBps
      parseUnits('1', 6), //usdcConversionThreshold
      10n ** 15n, //wethConversionThreshold
      parseUnits('1', 6), //hedgeUsdcAmountThreshold
      parseUnits('1000000', 6), //partialBtcHedgeUsdcAmountThreshold
      parseUnits('1000000', 6), //partialEthHedgeUsdcAmountThreshold
    );

    await dnGmxJuniorVault.setRebalanceParams(
      86400, //rebalanceTimeThreshold:
      500, // 5% in bps rebalanceDeltaThresholdBps:
      12_000,
    );

    await sGlp.connect(users[0]).transfer(dnGmxJuniorVault.address, assets);

    expect(await aUSDC.balanceOf(dnGmxJuniorVault.address)).to.eq(0);
    expect(await dnGmxJuniorVault.totalAssets()).to.eq(assets);

    // slippageThresholdGmxBps = 0.1%
    expect(dnGmxJuniorVault.convertAssetToAUsdc(usdcAmount)).to.be.revertedWith('GlpManager: insufficient output');
  });

  it('convert aUSDC to asset - with indirect route', async () => {
    const { dnGmxJuniorVault, dnGmxSeniorVault, usdc, aUSDC, users, gmxVault, sGlp } = await dnGmxJuniorVaultFixture();
    await dnGmxSeniorVault.connect(users[1]).deposit(parseUnits('150', 6), users[1].address);

    await dnGmxJuniorVault.setDirectConversion(true, false);

    const aUSDCAmount = parseUnits('100', 6);

    const slippageThresholdGmxBps = BigNumber.from(100); // 1%
    const MAX_BPS = BigNumber.from(10_000);
    const PRICE_PRECISION = BigNumber.from(10).pow(30);

    const priceOfUsdc = await gmxVault.getMinPrice(usdc.address);
    const priceOfGlp = await dnGmxJuniorVault.getPriceExternal();

    const USDC_DECIMALS = 6;
    const USDG_DECIMALS = 18;

    let minUsdgOut = aUSDCAmount
      .mul(priceOfUsdc)
      .mul(MAX_BPS.sub(slippageThresholdGmxBps))
      .div(MAX_BPS)
      .div(PRICE_PRECISION);

    // console.log('minUsdgOut (intermidiate)', formatEther(minUsdgOut))

    minUsdgOut = minUsdgOut.mul(BigNumber.from(10).pow(USDG_DECIMALS)).div(BigNumber.from(10).pow(USDC_DECIMALS));

    // console.log('minUsdgOut (final)', formatEther(minUsdgOut))

    const minGlpOut = minUsdgOut
      .mul(PRICE_PRECISION)
      .div(priceOfGlp)
      .div(BigNumber.from(10).pow(USDG_DECIMALS - USDC_DECIMALS));

    await dnGmxJuniorVault.executeBorrowFromDnGmxSeniorVault(aUSDCAmount);

    expect(await aUSDC.balanceOf(dnGmxJuniorVault.address)).to.eq(aUSDCAmount);
    expect(await dnGmxJuniorVault.totalAssets()).to.eq(0);

    await dnGmxJuniorVault.convertAUsdcToAsset(aUSDCAmount); // slippageThresholdGmxBps = 1% (from fixture)

    // console.log('min glp out', formatEther(minGlpOut));

    // console.log('price of usdc (from get price)', formatUnits(await dnGmxJuniorVault['getPrice(address)'](usdc.address), 30 - 6))
    // console.log('price of usdc (from gmx)', formatUnits(priceOfUsdc, 30 - 6))
    // console.log('price of glp', formatUnits(priceOfGlp, 30 - 18))

    expect(await aUSDC.balanceOf(dnGmxJuniorVault.address)).to.closeTo(0n, 10n);
    expect(await dnGmxJuniorVault.totalAssets()).to.gt(minGlpOut);
  });

  it('convert aUSDC to asset - with indirect route', async () => {
    const { dnGmxJuniorVault, dnGmxSeniorVault, usdc, aUSDC, users, gmxVault, sGlp } = await dnGmxJuniorVaultFixture();
    await dnGmxSeniorVault.connect(users[1]).deposit(parseUnits('150', 6), users[1].address);

    await dnGmxJuniorVault.setDirectConversion(true, false);

    const aUSDCAmount = parseUnits('100', 6);

    const slippageThresholdGmxBps = BigNumber.from(100); // 1%
    const MAX_BPS = BigNumber.from(10_000);
    const PRICE_PRECISION = BigNumber.from(10).pow(30);

    const priceOfUsdc = await gmxVault.getMinPrice(usdc.address);
    const priceOfGlp = await dnGmxJuniorVault.getPriceExternal();

    const USDC_DECIMALS = 6;
    const USDG_DECIMALS = 18;

    let minUsdgOut = aUSDCAmount
      .mul(priceOfUsdc)
      .mul(MAX_BPS.sub(slippageThresholdGmxBps))
      .div(MAX_BPS)
      .div(PRICE_PRECISION);

    // console.log('minUsdgOut (intermidiate)', formatEther(minUsdgOut))

    minUsdgOut = minUsdgOut.mul(BigNumber.from(10).pow(USDG_DECIMALS)).div(BigNumber.from(10).pow(USDC_DECIMALS));

    // console.log('minUsdgOut (final)', formatEther(minUsdgOut))

    const minGlpOut = minUsdgOut
      .mul(PRICE_PRECISION)
      .div(priceOfGlp)
      .div(BigNumber.from(10).pow(USDG_DECIMALS - USDC_DECIMALS));

    await dnGmxJuniorVault.executeBorrowFromDnGmxSeniorVault(aUSDCAmount);

    expect(await aUSDC.balanceOf(dnGmxJuniorVault.address)).to.eq(aUSDCAmount);
    expect(await dnGmxJuniorVault.totalAssets()).to.eq(0);

    await dnGmxJuniorVault.convertAUsdcToAsset(aUSDCAmount); // slippageThresholdGmxBps = 1% (from fixture)

    // console.log('min glp out', formatEther(minGlpOut));

    // console.log('price of usdc (from get price)', formatUnits(await dnGmxJuniorVault['getPrice(address)'](usdc.address), 30 - 6))
    // console.log('price of usdc (from gmx)', formatUnits(priceOfUsdc, 30 - 6))
    // console.log('price of glp', formatUnits(priceOfGlp, 30 - 18))

    expect(await aUSDC.balanceOf(dnGmxJuniorVault.address)).to.closeTo(0n, 10n);
    expect(await dnGmxJuniorVault.totalAssets()).to.gt(minGlpOut);
  });

  it('convert aUSDC to asset - with indirect route - fail slippage', async () => {
    const { dnGmxJuniorVault, dnGmxSeniorVault, usdc, aUSDC, users, gmxVault, sGlp } = await dnGmxJuniorVaultFixture();

    const amount = parseUnits('20000', 6);

    await dnGmxSeniorVault.connect(users[1]).deposit(amount, users[1].address);

    await hre.network.provider.request({
      method: 'hardhat_impersonateAccount',
      params: [dnGmxSeniorVault.address],
    });

    const seniorSigner = await hre.ethers.getSigner(dnGmxSeniorVault.address);
    await aUSDC.connect(seniorSigner).transfer(dnGmxJuniorVault.address, amount);

    await dnGmxJuniorVault.setDirectConversion(true, false);

    // decrease slippage threshold for eth
    await dnGmxJuniorVault.setThresholds(
      100, //_slippageThresholdSwapBtcBps
      1, //_slippageThresholdSwapEthBps
      100, //slippageThresholdGmxBps
      parseUnits('1', 6), //usdcConversionThreshold
      10n ** 15n, //wethConversionThreshold
      parseUnits('1', 6), //hedgeUsdcAmountThreshold
      parseUnits('1000000', 6), //partialBtcHedgeUsdcAmountThreshold
      parseUnits('1000000', 6), //partialEthHedgeUsdcAmountThreshold
    );

    await expect(dnGmxJuniorVault.convertAUsdcToAsset(amount)).to.be.revertedWith('Too little received');

    // decrease slippage threshold for gmx
    await dnGmxJuniorVault.setThresholds(
      100, //_slippageThresholdSwapBtcBps
      100, //_slippageThresholdSwapEthBps
      10, //slippageThresholdGmxBps
      parseUnits('1', 6), //usdcConversionThreshold
      10n ** 15n, //wethConversionThreshold
      parseUnits('1', 6), //hedgeUsdcAmountThreshold
      parseUnits('1000000', 6), //partialBtcHedgeUsdcAmountThreshold
      parseUnits('1000000', 6), //partialEthHedgeUsdcAmountThreshold
    );

    await expect(dnGmxJuniorVault.convertAUsdcToAsset(amount)).to.be.revertedWith(
      'GlpManager: insufficient USDG output',
    );
  });

  it('convert aUSDC to asset', async () => {
    const { dnGmxJuniorVault, dnGmxSeniorVault, usdc, aUSDC, users, gmxVault, sGlp } = await dnGmxJuniorVaultFixture();
    await dnGmxSeniorVault.connect(users[1]).deposit(parseUnits('150', 6), users[1].address);

    const aUSDCAmount = parseUnits('100', 6);

    const slippageThresholdGmxBps = BigNumber.from(100); // 1%
    const MAX_BPS = BigNumber.from(10_000);
    const PRICE_PRECISION = BigNumber.from(10).pow(30);

    const priceOfUsdc = await gmxVault.getMinPrice(usdc.address);
    const priceOfGlp = await dnGmxJuniorVault.getPriceExternal();

    const USDC_DECIMALS = 6;
    const USDG_DECIMALS = 18;

    let minUsdgOut = aUSDCAmount
      .mul(priceOfUsdc)
      .mul(MAX_BPS.sub(slippageThresholdGmxBps))
      .div(MAX_BPS)
      .div(PRICE_PRECISION);

    // console.log('minUsdgOut (intermidiate)', formatEther(minUsdgOut))

    minUsdgOut = minUsdgOut.mul(BigNumber.from(10).pow(USDG_DECIMALS)).div(BigNumber.from(10).pow(USDC_DECIMALS));

    // console.log('minUsdgOut (final)', formatEther(minUsdgOut))

    const minGlpOut = minUsdgOut
      .mul(PRICE_PRECISION)
      .div(priceOfGlp)
      .div(BigNumber.from(10).pow(USDG_DECIMALS - USDC_DECIMALS));

    await dnGmxJuniorVault.executeBorrowFromDnGmxSeniorVault(aUSDCAmount);

    expect(await aUSDC.balanceOf(dnGmxJuniorVault.address)).to.eq(aUSDCAmount);
    expect(await dnGmxJuniorVault.totalAssets()).to.eq(0);

    await dnGmxJuniorVault.convertAUsdcToAsset(aUSDCAmount); // slippageThresholdGmxBps = 1% (from fixture)

    // console.log('min glp out', formatEther(minGlpOut));

    // console.log('price of usdc (from get price)', formatUnits(await dnGmxJuniorVault['getPrice(address)'](usdc.address), 30 - 6))
    // console.log('price of usdc (from gmx)', formatUnits(priceOfUsdc, 30 - 6))
    // console.log('price of glp', formatUnits(priceOfGlp, 30 - 18))

    expect(await aUSDC.balanceOf(dnGmxJuniorVault.address)).to.closeTo(0n, 10n);
    expect(await dnGmxJuniorVault.totalAssets()).to.gt(minGlpOut);
  });

  it('convert aUSDC to asset - fail', async () => {
    const { dnGmxJuniorVault, dnGmxSeniorVault, usdc, aUSDC, users, gmxVault, sGlp } = await dnGmxJuniorVaultFixture();
    await dnGmxSeniorVault.connect(users[1]).deposit(parseUnits('150', 6), users[1].address);

    const aUSDCAmount = parseUnits('100', 6);

    await dnGmxJuniorVault.setThresholds(
      100, //_slippageThresholdSwapBtcBps
      100, //_slippageThresholdSwapEthBps
      10, //slippageThresholdGmxBps
      parseUnits('1', 6), //usdcConversionThreshold
      10n ** 15n, //wethConversionThreshold
      parseUnits('1', 6), //hedgeUsdcAmountThreshold
      parseUnits('1000000', 6), //partialBtcHedgeUsdcAmountThreshold
      parseUnits('1000000', 6), //partialEthHedgeUsdcAmountThreshold
    );

    await dnGmxJuniorVault.setRebalanceParams(
      86400, //rebalanceTimeThreshold:
      500, // 5% in bps rebalanceDeltaThresholdBps:
      12_000,
    );

    await dnGmxJuniorVault.executeBorrowFromDnGmxSeniorVault(aUSDCAmount);

    expect(await aUSDC.balanceOf(dnGmxJuniorVault.address)).to.eq(aUSDCAmount);
    expect(await dnGmxJuniorVault.totalAssets()).to.eq(0);

    // slippageThresholdGmxBps = 0.1%
    expect(dnGmxJuniorVault.convertAssetToAUsdc(aUSDCAmount)).to.be.revertedWith('GlpManager: insufficient output');
  });
});
