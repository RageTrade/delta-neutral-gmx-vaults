import { expect } from 'chai';
import { BigNumber, constants } from 'ethers';
import { parseEther, parseUnits } from 'ethers/lib/utils';
import { dnGmxJuniorVaultFixture } from './fixtures/dn-gmx-junior-vault';

describe('Withdraw Periphery', () => {
  const MAX_BPS = BigNumber.from(10_000);
  const PRICE_PRECISION = BigNumber.from(10).pow(30);
  const slippageThresholdGmxBps = BigNumber.from(100);

  it('setters', async () => {
    const { users, periphery, rewardRouter, dnGmxJuniorVault } = await dnGmxJuniorVaultFixture();

    await expect(periphery.setSlippageThreshold(100))
      .to.emit(periphery, 'SlippageThresholdUpdated')
      .withArgs(BigNumber.from(100));

    await expect(periphery.setAddresses(dnGmxJuniorVault.address, rewardRouter.address))
      .to.emit(periphery, 'AddressesUpdated')
      .withArgs(dnGmxJuniorVault.address, rewardRouter.address);

    await expect(periphery.connect(users[5]).setSlippageThreshold(100)).to.be.revertedWith(
      `VM Exception while processing transaction: reverted with reason string 'Ownable: caller is not the owner'`,
    );

    await expect(
      periphery.connect(users[5]).setAddresses(dnGmxJuniorVault.address, rewardRouter.address),
    ).to.be.revertedWith(
      `VM Exception while processing transaction: reverted with reason string 'Ownable: caller is not the owner'`,
    );
  });

  it('withdrawToken - revert due to allowance', async () => {
    const { usdc, users, periphery, dnGmxJuniorVault, dnGmxSeniorVault } = await dnGmxJuniorVaultFixture();

    await dnGmxSeniorVault.connect(users[1]).deposit(parseUnits('100', 6), users[1].address);

    const amount = parseEther('100');

    await dnGmxJuniorVault.connect(users[0]).deposit(amount, users[0].address);

    await expect(
      periphery.connect(users[0]).withdrawToken(users[0].address, usdc.address, users[0].address, parseEther('10')),
    ).to.be.reverted;
  });

  it('withdrawToken - non registered token', async () => {
    const { aUSDC, users, periphery, dnGmxJuniorVault, dnGmxSeniorVault } = await dnGmxJuniorVaultFixture();

    await dnGmxSeniorVault.connect(users[1]).deposit(parseUnits('100', 6), users[1].address);

    const amount = parseEther('100');

    await dnGmxJuniorVault.connect(users[0]).deposit(amount, users[0].address);
    await dnGmxJuniorVault.connect(users[0]).approve(periphery.address, constants.MaxUint256);

    await expect(
      periphery.connect(users[0]).withdrawToken(users[0].address, aUSDC.address, users[0].address, parseEther('10')),
    ).to.be.reverted;
  });

  it('withdrawToken - usdc', async () => {
    const { usdc, users, periphery, gmxVault, dnGmxJuniorVault, dnGmxSeniorVault } = await dnGmxJuniorVaultFixture();

    await dnGmxSeniorVault.connect(users[1]).deposit(parseUnits('100', 6), users[1].address);

    const amount = parseEther('100');
    const withdrawAmount = parseEther('10');

    await dnGmxJuniorVault.connect(users[0]).deposit(amount, users[0].address);
    await dnGmxJuniorVault.connect(users[0]).approve(periphery.address, constants.MaxUint256);

    const usdcBalBefore = await usdc.balanceOf(users[0].address);

    const tx = periphery
      .connect(users[0])
      .withdrawToken(users[0].address, usdc.address, users[0].address, withdrawAmount);

    await expect(tx).to.emit(periphery, 'TokenWithdrawn');

    const usdcBalAfter = await usdc.balanceOf(users[0].address);

    const glpPrice = await dnGmxJuniorVault.getPriceExternal();
    const usdcPrice = await gmxVault.getMaxPrice(usdc.address);

    const minUsdcOut = withdrawAmount
      .mul(glpPrice)
      .mul(MAX_BPS.sub(slippageThresholdGmxBps))
      .div(usdcPrice)
      .div(MAX_BPS);

    const usdcWithoutSlippage = withdrawAmount.mul(glpPrice).div(PRICE_PRECISION);

    expect(usdcBalAfter.sub(usdcBalBefore)).to.gt(minUsdcOut);
    expect(usdcBalAfter.sub(usdcBalBefore)).to.lt(usdcWithoutSlippage);
  });

  it('redeemToken - weth', async () => {
    const { weth, users, admin, gmxVault, glpBatchingManager, periphery, dnGmxJuniorVault, dnGmxSeniorVault } =
      await dnGmxJuniorVaultFixture();

    await dnGmxJuniorVault.setAdminParams(
      admin.address,
      dnGmxSeniorVault.address,
      constants.MaxUint256,
      glpBatchingManager.address,
      100,
    );

    await dnGmxSeniorVault.connect(users[1]).deposit(parseUnits('100', 6), users[1].address);

    const amount = parseEther('100');
    const withdrawAmount = parseEther('10');

    await dnGmxJuniorVault.connect(users[0]).deposit(amount, users[0].address);
    await dnGmxJuniorVault.connect(users[0]).approve(periphery.address, constants.MaxUint256);

    const wethBalBefore = await weth.balanceOf(users[0].address);

    const tx = periphery
      .connect(users[0])
      .redeemToken(users[0].address, weth.address, users[0].address, dnGmxJuniorVault.balanceOf(users[0].address));

    await expect(tx).to.emit(periphery, 'TokenRedeemed');

    const wethBalAfter = await weth.balanceOf(users[0].address);

    const glpPrice = await dnGmxJuniorVault.getPriceExternal();
    const ethPrice = await gmxVault.getMaxPrice(weth.address);

    const minWethOut = withdrawAmount
      .mul(glpPrice)
      .mul(MAX_BPS.sub(slippageThresholdGmxBps))
      .mul(BigNumber.from(10).pow(12)) // 18 decimals & 6 decimals
      .div(ethPrice)
      .div(MAX_BPS);

    const wethOutWithoutSlippage = withdrawAmount
      .mul(glpPrice)
      .mul(BigNumber.from(10).pow(12)) // 18 decimals & 6 decimals
      .div(PRICE_PRECISION);

    expect(wethBalAfter.sub(wethBalBefore)).to.gt(minWethOut);
    expect(wethBalAfter.sub(wethBalBefore)).to.lt(wethOutWithoutSlippage);
  });

  it('redeemToken - weth - fail slippage', async () => {
    const { weth, users, admin, gmxVault, glpBatchingManager, periphery, dnGmxJuniorVault, dnGmxSeniorVault } =
      await dnGmxJuniorVaultFixture();

    await dnGmxJuniorVault.setAdminParams(
      admin.address,
      dnGmxSeniorVault.address,
      constants.MaxUint256,
      glpBatchingManager.address,
      100,
    );

    await dnGmxSeniorVault.connect(users[1]).deposit(parseUnits('100', 6), users[1].address);
    await periphery.setSlippageThreshold(1);

    const amount = parseEther('100');
    const withdrawAmount = parseEther('10');

    await dnGmxJuniorVault.connect(users[0]).deposit(amount, users[0].address);
    await dnGmxJuniorVault.connect(users[0]).approve(periphery.address, constants.MaxUint256);

    const wethBalBefore = await weth.balanceOf(users[0].address);

    const tx = periphery
      .connect(users[0])
      .redeemToken(users[0].address, weth.address, users[0].address, dnGmxJuniorVault.balanceOf(users[0].address));

    await expect(tx).to.be.revertedWith(
      `VM Exception while processing transaction: reverted with reason string 'GlpManager: insufficient output'`,
    );
  });

  it('withdrawToken - different receiver than msg.sender', async () => {
    const { usdc, users, periphery, gmxVault, dnGmxJuniorVault, dnGmxSeniorVault } = await dnGmxJuniorVaultFixture();

    await dnGmxSeniorVault.connect(users[1]).deposit(parseUnits('100', 6), users[1].address);

    const amount = parseEther('100');
    const withdrawAmount = parseEther('10');

    await dnGmxJuniorVault.connect(users[0]).deposit(amount, users[0].address);
    await dnGmxJuniorVault.connect(users[0]).approve(periphery.address, constants.MaxUint256);

    const usdcBalBefore = await usdc.balanceOf(users[5].address);

    const tx = periphery
      .connect(users[0])
      .withdrawToken(users[0].address, usdc.address, users[5].address, withdrawAmount);

    await expect(tx).to.emit(periphery, 'TokenWithdrawn');

    const usdcBalAfter = await usdc.balanceOf(users[5].address);

    const glpPrice = await dnGmxJuniorVault.getPriceExternal();
    const usdcPrice = await gmxVault.getMaxPrice(usdc.address);

    const minUsdcOut = withdrawAmount
      .mul(glpPrice)
      .mul(MAX_BPS.sub(slippageThresholdGmxBps))
      .div(usdcPrice)
      .div(MAX_BPS);

    const usdcWithoutSlippage = withdrawAmount.mul(glpPrice).div(PRICE_PRECISION);

    expect(usdcBalAfter.sub(usdcBalBefore)).to.gt(minUsdcOut);
    expect(usdcBalAfter.sub(usdcBalBefore)).to.lt(usdcWithoutSlippage);
  });

  it('redeemToken - fail due to slippage', async () => {
    const { usdc, users, periphery, gmxVault, dnGmxJuniorVault, dnGmxSeniorVault } = await dnGmxJuniorVaultFixture();
    await periphery.setSlippageThreshold(0);

    await dnGmxSeniorVault.connect(users[1]).deposit(parseUnits('100', 6), users[1].address);

    const amount = parseEther('100');
    const withdrawAmount = parseEther('10');

    await dnGmxJuniorVault.connect(users[0]).deposit(amount, users[0].address);
    await dnGmxJuniorVault.connect(users[0]).approve(periphery.address, constants.MaxUint256);

    await expect(
      periphery.connect(users[0]).withdrawToken(users[0].address, usdc.address, users[0].address, withdrawAmount),
    ).to.be.revertedWith(
      `VM Exception while processing transaction: reverted with reason string 'GlpManager: insufficient output'`,
    );
  });
});
