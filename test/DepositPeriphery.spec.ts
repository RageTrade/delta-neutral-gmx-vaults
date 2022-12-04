import { expect } from 'chai';
import { BigNumber, constants } from 'ethers';
import { parseEther, parseUnits } from 'ethers/lib/utils';
import hre, { ethers } from 'hardhat';
import { dnGmxJuniorVaultFixture } from './fixtures/dn-gmx-junior-vault';
import { generateErc20Balance } from './utils/generator';

describe('Deposit Periphery', () => {
  const PRICE_PRECISION = BigNumber.from(10).pow(30);

  it('setters', async () => {
    const { users, depositPeriphery, rewardRouter, dnGmxJuniorVault } = await dnGmxJuniorVaultFixture();

    await expect(depositPeriphery.setSlippageThreshold(100))
      .to.emit(depositPeriphery, 'SlippageThresholdUpdated')
      .withArgs(BigNumber.from(100));

    await expect(depositPeriphery.setAddresses(dnGmxJuniorVault.address, rewardRouter.address))
      .to.emit(depositPeriphery, 'AddressesUpdated')
      .withArgs(dnGmxJuniorVault.address, rewardRouter.address);

    await expect(depositPeriphery.connect(users[5]).setSlippageThreshold(100)).to.be.revertedWith(
      `VM Exception while processing transaction: reverted with reason string 'Ownable: caller is not the owner'`,
    );

    await expect(
      depositPeriphery.connect(users[5]).setAddresses(dnGmxJuniorVault.address, rewardRouter.address),
    ).to.be.revertedWith(
      `VM Exception while processing transaction: reverted with reason string 'Ownable: caller is not the owner'`,
    );
  });

  it('depositToken - revert due to allowance', async () => {
    const { usdc, users, depositPeriphery, dnGmxJuniorVault, glpManager, dnGmxSeniorVault } =
      await dnGmxJuniorVaultFixture();

    const govAddr = await glpManager.gov();

    await hre.network.provider.request({
      method: 'hardhat_impersonateAccount',
      params: [govAddr],
    });

    const gov = await ethers.getSigner(govAddr);
    await glpManager.connect(gov).setCooldownDuration(0);

    await dnGmxSeniorVault.connect(users[1]).deposit(parseUnits('100', 6), users[1].address);

    const amount = parseUnits('100', 6);
    await generateErc20Balance(usdc, amount, users[0].address);

    await expect(
      depositPeriphery.connect(users[0]).depositToken(usdc.address, users[0].address, amount),
    ).to.be.revertedWith(
      `VM Exception while processing transaction: reverted with reason string 'ERC20: transfer amount exceeds allowance'`,
    );
  });

  it('depositToken - non registered token', async () => {
    const { aUSDC, users, depositPeriphery, dnGmxJuniorVault, glpManager, dnGmxSeniorVault } =
      await dnGmxJuniorVaultFixture();

    const govAddr = await glpManager.gov();

    await hre.network.provider.request({
      method: 'hardhat_impersonateAccount',
      params: [govAddr],
    });

    const gov = await ethers.getSigner(govAddr);
    await glpManager.connect(gov).setCooldownDuration(0);

    await dnGmxSeniorVault.connect(users[1]).deposit(parseUnits('100', 6), users[1].address);

    const amount = parseUnits('100', 6);

    dnGmxSeniorVault.connect(users[1]).approve(depositPeriphery.address, ethers.constants.MaxUint256);

    await expect(
      depositPeriphery.connect(users[1]).depositToken(dnGmxSeniorVault.address, users[0].address, amount),
    ).to.be.revertedWith(
      `VM Exception while processing transaction: reverted with reason string 'VaultPriceFeed: invalid price feed'`,
    );
  });

  it('depositToken - usdc', async () => {
    const { usdc, users, depositPeriphery, dnGmxJuniorVault, glpManager, dnGmxSeniorVault } =
      await dnGmxJuniorVaultFixture();

    const govAddr = await glpManager.gov();

    await hre.network.provider.request({
      method: 'hardhat_impersonateAccount',
      params: [govAddr],
    });

    const gov = await ethers.getSigner(govAddr);
    await glpManager.connect(gov).setCooldownDuration(0);

    await dnGmxSeniorVault.connect(users[1]).deposit(parseUnits('100', 6), users[1].address);

    const amount = parseUnits('100', 6);

    await usdc.connect(users[0]).approve(depositPeriphery.address, ethers.constants.MaxUint256);

    const glpPrice = await dnGmxJuniorVault.getGlpPriceInUsdc(true);
    const sharesReceived = amount.mul(PRICE_PRECISION).div(glpPrice);
    // console.log({ glpPrice, sharesReceived });

    await expect(() =>
      depositPeriphery.connect(users[0]).depositToken(usdc.address, users[0].address, amount),
    ).to.changeTokenBalance(usdc, users[0], amount.mul(-1n));

    expect(await dnGmxJuniorVault.balanceOf(users[0].address)).to.lt(sharesReceived);
    expect(await dnGmxJuniorVault.balanceOf(users[0].address)).to.gt(sharesReceived.mul(99n).div(100n));
  });

  it('depositToken - weth', async () => {
    const { weth, users, gmxVault, depositPeriphery, dnGmxJuniorVault, glpManager, dnGmxSeniorVault } =
      await dnGmxJuniorVaultFixture();

    const govAddr = await glpManager.gov();

    await hre.network.provider.request({
      method: 'hardhat_impersonateAccount',
      params: [govAddr],
    });

    const gov = await ethers.getSigner(govAddr);
    await glpManager.connect(gov).setCooldownDuration(0);

    await dnGmxSeniorVault.connect(users[1]).deposit(parseUnits('100', 6), users[1].address);

    const amount = parseEther('0.5');
    await generateErc20Balance(weth, amount, users[0].address);

    await weth.connect(users[0]).approve(depositPeriphery.address, ethers.constants.MaxUint256);

    const glpPrice = await dnGmxJuniorVault['getPrice(bool)'](true);
    const wethPrice = await gmxVault.getMinPrice(weth.address);

    const sharesReceived = amount
      .mul(wethPrice)
      .div(glpPrice)
      .mul(10n ** 18n)
      .div(PRICE_PRECISION);

    // console.log({ glpPrice, wethPrice, sharesReceived });

    await expect(() =>
      depositPeriphery.connect(users[0]).depositToken(weth.address, users[0].address, amount),
    ).to.changeTokenBalance(weth, users[0], amount.mul(-1n));

    expect(await dnGmxJuniorVault.balanceOf(users[0].address)).to.lt(sharesReceived);
    expect(await dnGmxJuniorVault.balanceOf(users[0].address)).to.gt(sharesReceived.mul(99n).div(100n));
  });

  it('depositToken -  usdc - fail slippage', async () => {
    const { usdc, users, depositPeriphery, dnGmxJuniorVault, glpManager, dnGmxSeniorVault } =
      await dnGmxJuniorVaultFixture();

    const govAddr = await glpManager.gov();

    await hre.network.provider.request({
      method: 'hardhat_impersonateAccount',
      params: [govAddr],
    });

    await depositPeriphery.setSlippageThreshold(1);

    const gov = await ethers.getSigner(govAddr);
    await glpManager.connect(gov).setCooldownDuration(0);

    await dnGmxSeniorVault.connect(users[1]).deposit(parseUnits('100', 6), users[1].address);

    const amount = parseUnits('100', 6);

    await usdc.connect(users[0]).approve(depositPeriphery.address, ethers.constants.MaxUint256);

    await expect(
      depositPeriphery.connect(users[0]).depositToken(usdc.address, users[0].address, amount),
    ).to.be.revertedWith(
      `VM Exception while processing transaction: reverted with reason string 'GlpManager: insufficient USDG output'`,
    );
  });

  it('depositToken - weth - fail slippage', async () => {
    const { weth, users, depositPeriphery, glpManager, dnGmxSeniorVault } = await dnGmxJuniorVaultFixture();

    const govAddr = await glpManager.gov();

    await hre.network.provider.request({
      method: 'hardhat_impersonateAccount',
      params: [govAddr],
    });

    await depositPeriphery.setSlippageThreshold(1);

    const gov = await ethers.getSigner(govAddr);
    await glpManager.connect(gov).setCooldownDuration(0);

    await dnGmxSeniorVault.connect(users[1]).deposit(parseUnits('100', 6), users[1].address);

    const amount = parseEther('0.5');
    await generateErc20Balance(weth, amount, users[0].address);

    await weth.connect(users[0]).approve(depositPeriphery.address, ethers.constants.MaxUint256);

    await expect(
      depositPeriphery.connect(users[0]).depositToken(weth.address, users[0].address, amount),
    ).to.be.revertedWith(
      `VM Exception while processing transaction: reverted with reason string 'GlpManager: insufficient USDG output'`,
    );
  });

  it('depositToken - different receiver than msg.sender', async () => {
    const { usdc, users, depositPeriphery, dnGmxJuniorVault, glpManager, dnGmxSeniorVault } =
      await dnGmxJuniorVaultFixture();

    const govAddr = await glpManager.gov();

    await hre.network.provider.request({
      method: 'hardhat_impersonateAccount',
      params: [govAddr],
    });

    const gov = await ethers.getSigner(govAddr);
    await glpManager.connect(gov).setCooldownDuration(0);

    await dnGmxSeniorVault.connect(users[1]).deposit(parseUnits('100', 6), users[1].address);

    const amount = parseUnits('100', 6);

    await usdc.connect(users[0]).approve(depositPeriphery.address, ethers.constants.MaxUint256);

    const glpPrice = await dnGmxJuniorVault.getGlpPriceInUsdc(true);
    const sharesReceived = amount.mul(PRICE_PRECISION).div(glpPrice);
    // console.log({ glpPrice, sharesReceived });

    await expect(() =>
      depositPeriphery.connect(users[0]).depositToken(usdc.address, users[1].address, amount),
    ).to.changeTokenBalance(usdc, users[0], amount.mul(-1n));

    expect(await dnGmxJuniorVault.balanceOf(users[0].address)).to.eq(0);
    expect(await dnGmxJuniorVault.balanceOf(users[1].address)).to.lt(sharesReceived);
    expect(await dnGmxJuniorVault.balanceOf(users[1].address)).to.gt(sharesReceived.mul(99n).div(100n));
  });
});
