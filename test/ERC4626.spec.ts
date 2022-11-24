import { expect } from 'chai';
import { BigNumber, constants } from 'ethers';
import { parseEther, parseUnits } from 'ethers/lib/utils';
import { dnGmxJuniorVaultFixture } from './fixtures/dn-gmx-junior-vault';
import { generateErc20Balance } from './utils/generator';

describe('Junior Vault ERC4646 functions', () => {
  it('Deposit', async () => {
    const opts = await dnGmxJuniorVaultFixture();
    const { dnGmxJuniorVault, dnGmxSeniorVault, vdWBTC, vdWETH, aUSDC, fsGlp, users } = opts;

    const withdrawFeeBps = await dnGmxJuniorVault.withdrawFeeBps();

    const MAX_BPS = BigNumber.from(10_000);
    const PRICE_PRECISION = BigNumber.from(10).pow(30);

    await dnGmxSeniorVault.connect(users[1]).deposit(parseUnits('100', 6), users[1].address);

    const amount = parseEther('100');
    const preview = await dnGmxJuniorVault.previewDeposit(amount);

    await dnGmxJuniorVault.connect(users[0]).deposit(amount, users[0].address);

    const glpPrice = await dnGmxJuniorVault.getPriceExternal();
    const glpBalance = await fsGlp.balanceOf(dnGmxJuniorVault.address);

    const dnUsdcDeposited = await dnGmxJuniorVault.dnUsdcDeposited();

    let vmv;
    const borrowValues = await dnGmxJuniorVault.getCurrentBorrows();

    // glp notional value
    vmv = glpBalance.mul(glpPrice).div(PRICE_PRECISION);
    // dn usdc deposited
    vmv = vmv.add(dnUsdcDeposited);
    // borrowed notional from aave
    vmv = vmv.sub(await dnGmxJuniorVault.getBorrowValue(borrowValues[0], borrowValues[1]));
    // batching manager glp & unHedgedGlp components are 0

    // await checker.checkTotalSupply(amount);

    expect(preview).to.eq(amount);

    expect(await dnGmxJuniorVault.unhedgedGlpInUsdc()).to.eq(0);
    expect(await dnGmxJuniorVault.getVaultMarketValue()).to.eq(vmv);

    expect(await dnGmxJuniorVault.totalSupply()).to.eq(amount);
    expect(await dnGmxJuniorVault.totalAssets()).to.gt(amount.mul(MAX_BPS.sub(withdrawFeeBps).div(MAX_BPS)));

    // const borrows = await dnGmxJuniorVault.getCurrentBorrows()
    // console.log('vmv', vmv)
    // console.log('vault market value', await dnGmxJuniorVault.getVaultMarketValue())
    // console.log('vault glp balance', await fsGlp.balanceOf(dnGmxJuniorVault.address));
    // console.log('dnUsdcDeposited', await dnGmxJuniorVault.dnUsdcDepositedExternal())
    // console.log('unhedgedGlpInUsdc', await dnGmxJuniorVault.unhedgedGlpInUsdc())
    // console.log('total current borrow value', await dnGmxJuniorVault.getBorrowValue(borrows[0], borrows[1]))

    // await logger.logAavePosition();
  });

  it('Mint', async () => {
    const opts = await dnGmxJuniorVaultFixture();
    const { dnGmxJuniorVault, dnGmxSeniorVault, vdWBTC, vdWETH, aUSDC, fsGlp, users } = opts;

    const withdrawFeeBps = await dnGmxJuniorVault.withdrawFeeBps();

    const MAX_BPS = BigNumber.from(10_000);
    const PRICE_PRECISION = BigNumber.from(10).pow(30);

    await dnGmxSeniorVault.connect(users[1]).deposit(parseUnits('100', 6), users[1].address);

    const amount = parseEther('100');
    const preview = await dnGmxJuniorVault.previewMint(amount);

    await dnGmxJuniorVault.connect(users[0]).mint(amount, users[0].address);

    const glpPrice = await dnGmxJuniorVault.getPriceExternal();
    const glpBalance = await fsGlp.balanceOf(dnGmxJuniorVault.address);

    const dnUsdcDeposited = await dnGmxJuniorVault.dnUsdcDeposited();

    let vmv;
    const borrowValues = await dnGmxJuniorVault.getCurrentBorrows();

    // glp notional value
    vmv = glpBalance.mul(glpPrice).div(PRICE_PRECISION);
    // dn usdc deposited
    vmv = vmv.add(dnUsdcDeposited);
    // borrowed notional from aave
    vmv = vmv.sub(await dnGmxJuniorVault.getBorrowValue(borrowValues[0], borrowValues[1]));
    // batching manager glp & unHedgedGlp components are 0

    expect(preview).to.eq(amount);

    expect(await dnGmxJuniorVault.unhedgedGlpInUsdc()).to.eq(0);
    expect(await dnGmxJuniorVault.getVaultMarketValue()).to.eq(vmv);

    expect(await dnGmxJuniorVault.totalSupply()).to.eq(amount);
    expect(await dnGmxJuniorVault.totalAssets()).to.gt(amount.mul(MAX_BPS.sub(withdrawFeeBps).div(MAX_BPS)));

    // const borrows = await dnGmxJuniorVault.getCurrentBorrows()
    // console.log('vmv', vmv)
    // console.log('vault market value', await dnGmxJuniorVault.getVaultMarketValue())
    // console.log('vault glp balance', await fsGlp.balanceOf(dnGmxJuniorVault.address));
    // console.log('dnUsdcDeposited', await dnGmxJuniorVault.dnUsdcDepositedExternal())
    // console.log('unhedgedGlpInUsdc', await dnGmxJuniorVault.unhedgedGlpInUsdc())
    // console.log('total current borrow value', await dnGmxJuniorVault.getBorrowValue(borrows[0], borrows[1]))

    // await logger.logAavePosition();
  });

  it('Full Withdraw', async () => {
    const opts = await dnGmxJuniorVaultFixture();
    const {
      dnGmxJuniorVault,
      dnGmxSeniorVault,
      glpBatchingManager,
      dnGmxJuniorVaultManager,
      admin,
      users,
      weth,
      wbtc,
      fsGlp,
    } = opts;
    await dnGmxSeniorVault.connect(users[1]).deposit(parseUnits('150', 6), users[1].address);

    await dnGmxJuniorVault.setAdminParams(
      admin.address,
      dnGmxSeniorVault.address,
      constants.MaxUint256,
      glpBatchingManager.address,
      150,
      3000,
    );

    const PRICE_PRECISION = BigNumber.from(10).pow(30);

    const amount = parseEther('100');
    const glpPrice = await dnGmxJuniorVault['getPrice(bool)'](false);

    await dnGmxJuniorVault.connect(users[0]).deposit(amount, users[0].address);

    expect(await dnGmxJuniorVault.balanceOf(users[0].address)).to.eq(amount);

    const totalAssetsBeforeRedeem = await dnGmxJuniorVault.totalAssets();
    const preview = await dnGmxJuniorVault.previewRedeem(dnGmxJuniorVault.balanceOf(users[0].address));

    const withdrawFeeBps = await dnGmxJuniorVault.withdrawFeeBps();
    const MAX_BPS = BigNumber.from(10_000);

    const givenToUser = totalAssetsBeforeRedeem.mul(MAX_BPS.sub(withdrawFeeBps)).div(MAX_BPS);

    // console.log('givenToUser', givenToUser);
    // console.log('totalAssetsBeforeRedeem', totalAssetsBeforeRedeem);
    // console.log('preview', preview);

    const tx = await dnGmxJuniorVault
      .connect(users[0])
      .redeem(dnGmxJuniorVault.balanceOf(users[0].address), users[5].address, users[0].address);

    const receipt = await tx.wait();

    let wbtcUsdcSlippage: BigNumber = BigNumber.from(0);
    let wethUsdcSlippage: BigNumber = BigNumber.from(0);

    let shares, assets;

    for (const log of receipt.logs) {
      if (log.topics[0] === dnGmxJuniorVault.interface.getEventTopic('Withdraw')) {
        const args = dnGmxJuniorVault.interface.parseLog(log).args;
        shares = args.shares;
        assets = args.assets;
      }
    }

    // console.log('shares', shares);
    // console.log('assets', assets);

    for (const log of receipt.logs) {
      if (log.topics[0] === dnGmxJuniorVaultManager.interface.getEventTopic('TokenSwapped')) {
        const args = dnGmxJuniorVaultManager.interface.parseLog(log).args;

        if (args.toToken.toLowerCase() == wbtc.address.toLowerCase()) {
          const btcPrice = await dnGmxJuniorVault['getPrice(address,bool)'](wbtc.address, true);
          wbtcUsdcSlippage = BigNumber.from(args.toQuantity)
            .mul(btcPrice)
            .div(PRICE_PRECISION)
            .sub(BigNumber.from(args.fromQuantity))
            .abs();
        }

        if (args.toToken.toLowerCase() == weth.address.toLowerCase()) {
          const ethPrice = await dnGmxJuniorVault['getPrice(address,bool)'](weth.address, true);
          wethUsdcSlippage = BigNumber.from(args.toQuantity)
            .mul(ethPrice)
            .div(PRICE_PRECISION)
            .sub(BigNumber.from(args.fromQuantity))
            .abs();
        }
      }
    }

    // total slippage in terms of asset
    const totalSlippage = wbtcUsdcSlippage.add(wethUsdcSlippage).mul(PRICE_PRECISION).div(glpPrice);
    // console.log('totalSlippage', totalSlippage);

    expect(await dnGmxJuniorVault.balanceOf(users[0].address)).to.eq(0);

    expect(shares).to.eq(amount);
    expect(await fsGlp.balanceOf(users[5].address)).to.eq(assets);

    expect(givenToUser).to.eq(preview);
    expect(await dnGmxJuniorVault.totalSupply()).to.eq(0);
    expect(await dnGmxJuniorVault.totalAssets()).to.gt(totalAssetsBeforeRedeem.sub(givenToUser).sub(totalSlippage));
  });

  it('Partial Withdraw & withdrawFeeBps', async () => {
    const opts = await dnGmxJuniorVaultFixture();
    const {
      dnGmxJuniorVault,
      dnGmxSeniorVault,
      glpBatchingManager,
      users,
      fsGlp,
      dnGmxJuniorVaultManager,
      usdc,
      wbtc,
      weth,
    } = opts;

    const PRICE_PRECISION = BigNumber.from(10).pow(30);

    const amount = parseEther('100');
    const glpPrice = await dnGmxJuniorVault['getPrice(bool)'](false);

    await dnGmxSeniorVault.connect(users[1]).deposit(parseUnits('150', 6), users[1].address);

    await dnGmxJuniorVault.connect(users[0]).deposit(amount, users[0].address);

    expect(await dnGmxJuniorVault.balanceOf(users[0].address)).to.eq(amount);

    const totalAssetsBefore = await dnGmxJuniorVault.totalAssets();
    const dnUsdcDepositedBefore = await dnGmxJuniorVault.dnUsdcDeposited();

    expect(dnUsdcDepositedBefore).to.not.eq(0);
    expect(await dnGmxJuniorVault.unhedgedGlpInUsdc()).to.eq(0);
    expect(await glpBatchingManager.dnGmxJuniorVaultGlpBalance()).to.eq(0);

    const borrowsBefore = await dnGmxJuniorVault.getCurrentBorrows();

    // console.log('borrowsBefore', borrowsBefore);
    // console.log('borrowValueBefore', await dnGmxJuniorVault.getBorrowValue(borrowsBefore[0], borrowsBefore[1]));

    // withdrawing to user[5]
    const tx = await dnGmxJuniorVault.connect(users[0]).withdraw(amount.div(2), users[5].address, users[0].address);
    const receipt = await tx.wait();

    let shares, assets;

    for (const log of receipt.logs) {
      if (log.topics[0] === dnGmxJuniorVault.interface.getEventTopic('Withdraw')) {
        const args = dnGmxJuniorVault.interface.parseLog(log).args;
        shares = args.shares;
        assets = args.assets;
      }
    }

    let wbtcUsdcSlippage: BigNumber = BigNumber.from(0);
    let wethUsdcSlippage: BigNumber = BigNumber.from(0);

    for (const log of receipt.logs) {
      if (log.topics[0] === dnGmxJuniorVaultManager.interface.getEventTopic('TokenSwapped')) {
        const args = dnGmxJuniorVaultManager.interface.parseLog(log).args;

        if (args.toToken.toLowerCase() == wbtc.address.toLowerCase()) {
          const btcPrice = await dnGmxJuniorVault['getPrice(address,bool)'](wbtc.address, true);
          wbtcUsdcSlippage = BigNumber.from(args.toQuantity)
            .mul(btcPrice)
            .div(PRICE_PRECISION)
            .sub(BigNumber.from(args.fromQuantity))
            .abs();
        }

        if (args.toToken.toLowerCase() == weth.address.toLowerCase()) {
          const ethPrice = await dnGmxJuniorVault['getPrice(address,bool)'](weth.address, true);
          wethUsdcSlippage = BigNumber.from(args.toQuantity)
            .mul(ethPrice)
            .div(PRICE_PRECISION)
            .sub(BigNumber.from(args.fromQuantity))
            .abs();
        }
      }
    }

    // total slippage in terms of asset
    const totalSlippage = wbtcUsdcSlippage.add(wethUsdcSlippage).mul(PRICE_PRECISION).div(glpPrice);
    // console.log('totalSlippage', totalSlippage)

    // console.log('totalAssetsBefore', totalAssetsBefore);
    // console.log('totalAssetsAfter', await dnGmxJuniorVault.totalAssets());

    // console.log('shares', shares);
    // console.log('assets', assets);
    // console.log('sharesUsed', sharesUsed);

    // console.log('unhedgedGlpInUsdc', await dnGmxJuniorVault.unhedgedGlpInUsdc());
    // console.log('dnGmxJuniorVaultGlpBalance', await glpBatchingManager.dnGmxJuniorVaultGlpBalance());
    // console.log('dnUsdcDeposited', await dnGmxJuniorVault.dnUsdcDeposited());

    // const borrowsAfter = await dnGmxJuniorVault.getCurrentBorrows();

    // console.log('borrowsAfter', borrowsAfter);
    // console.log('borrowValueAfter', await dnGmxJuniorVault.getBorrowValue(borrowsAfter[0], borrowsAfter[1]));

    expect(assets).to.eq(amount.div(2));

    expect(await dnGmxJuniorVault.unhedgedGlpInUsdc()).to.eq(0);
    expect(await glpBatchingManager.dnGmxJuniorVaultGlpBalance()).to.eq(0);

    // should have recevied exact glp
    expect(await fsGlp.balanceOf(users[5].address)).to.eq(amount.div(2));

    // user should have shares left
    expect(await dnGmxJuniorVault.totalSupply()).to.eq(await dnGmxJuniorVault.balanceOf(users[0].address));

    expect(await dnGmxJuniorVault.totalSupply()).to.eq(amount.sub(shares));
    expect(await dnGmxJuniorVault.totalAssets()).to.gt(totalAssetsBefore.sub(assets).sub(totalSlippage));
  });

  it('MaxWithdraw & MaxRedeem - Senior Vault', async () => {
    const opts = await dnGmxJuniorVaultFixture();
    const { dnGmxJuniorVault, dnGmxSeniorVault, users, usdc } = opts;

    const MAX_BPS = BigNumber.from(10_000);
    const maxUtilization = BigNumber.from(9_000);

    const amount = parseEther('100');
    const seniorVaultDeposit = parseUnits('150', 6);

    await dnGmxSeniorVault.setMaxUtilizationBps(maxUtilization);

    await dnGmxSeniorVault.connect(users[1]).deposit(seniorVaultDeposit, users[1].address);
    expect(await dnGmxJuniorVault.getUsdcBorrowed()).to.eq(0);

    await dnGmxJuniorVault.connect(users[0]).deposit(amount, users[0].address);

    const totalBorrowed = await dnGmxSeniorVault.totalUsdcBorrowed();
    const totalAssetsAvailable = await dnGmxSeniorVault.totalAssets();

    expect(totalBorrowed).to.lt(seniorVaultDeposit);
    expect(await dnGmxJuniorVault.getUsdcBorrowed()).to.eq(totalBorrowed);

    // only single user, so max(user'shares, avaiable) = available
    expect(await dnGmxSeniorVault.maxWithdraw(users[1].address)).to.eq(
      totalAssetsAvailable.sub(totalBorrowed.mul(MAX_BPS).div(maxUtilization)),
    );
    expect(await dnGmxSeniorVault.maxRedeem(users[1].address)).to.eq(
      await dnGmxSeniorVault.convertToShares(totalAssetsAvailable.sub(totalBorrowed.mul(MAX_BPS).div(maxUtilization))),
    );

    await generateErc20Balance(usdc, seniorVaultDeposit.mul(5), users[2].address);
    await usdc.connect(users[2]).approve(dnGmxSeniorVault.address, constants.MaxUint256);

    await dnGmxSeniorVault.connect(users[2]).deposit(seniorVaultDeposit.mul(5), users[2].address);

    // max(user'shares, avaiable) = user's share after other user deposits
    expect(await dnGmxSeniorVault.maxWithdraw(users[1].address)).to.eq(
      await dnGmxSeniorVault.convertToAssets(seniorVaultDeposit),
    );
    expect(await dnGmxSeniorVault.maxWithdraw(users[1].address)).to.eq(
      await dnGmxSeniorVault.previewRedeem(seniorVaultDeposit),
    );

    // off by one due to round down
    expect(await dnGmxSeniorVault.maxRedeem(users[1].address)).to.closeTo(
      await dnGmxSeniorVault.balanceOf(users[1].address),
      1,
    );
  });

  it('Max Withdraw - Senior Vault', async () => {
    const opts = await dnGmxJuniorVaultFixture();
    const { dnGmxJuniorVault, dnGmxSeniorVault, users, usdc } = opts;

    const MAX_BPS = BigNumber.from(10_000);
    const maxUtilization = BigNumber.from(9_000);

    const amount = parseEther('100');
    const seniorVaultDeposit = parseUnits('150', 6);

    await dnGmxSeniorVault.setMaxUtilizationBps(maxUtilization);

    await dnGmxSeniorVault.connect(users[1]).deposit(seniorVaultDeposit, users[1].address);

    // should be able to withdraw everything if nothing is borrowed
    expect(await dnGmxSeniorVault.maxWithdraw(users[1].address)).to.eq(seniorVaultDeposit);

    // deposit 1
    await dnGmxJuniorVault.connect(users[0]).deposit(amount, users[0].address);

    let totalBorrowed = await dnGmxSeniorVault.totalUsdcBorrowed();
    let totalAssetsAvailable = await dnGmxSeniorVault.totalAssets();
    let maxWithdraw = await dnGmxSeniorVault.maxWithdraw(users[1].address);

    expect(totalAssetsAvailable.sub(maxWithdraw).mul(maxUtilization).div(MAX_BPS)).to.closeTo(totalBorrowed, 1n);

    // deposit 2
    await dnGmxJuniorVault.connect(users[0]).deposit(amount, users[0].address);

    totalBorrowed = await dnGmxSeniorVault.totalUsdcBorrowed();
    totalAssetsAvailable = await dnGmxSeniorVault.totalAssets();
    maxWithdraw = await dnGmxSeniorVault.maxWithdraw(users[1].address);

    expect(totalAssetsAvailable.sub(maxWithdraw).mul(maxUtilization).div(MAX_BPS)).to.closeTo(totalBorrowed, 1n);
  });

  it('MaxDeposit & MaxMint - Senior Vault', async () => {
    const opts = await dnGmxJuniorVaultFixture();
    const { dnGmxSeniorVault, users, usdc } = opts;

    const cap = parseUnits('500', 6);
    const seniorVaultDeposit = parseUnits('150', 6);

    await dnGmxSeniorVault.setDepositCap(cap);

    await dnGmxSeniorVault.connect(users[1]).deposit(seniorVaultDeposit, users[1].address);

    expect(await dnGmxSeniorVault.maxDeposit(users[1].address)).to.eq(cap.sub(seniorVaultDeposit));
    expect(await dnGmxSeniorVault.maxDeposit(users[2].address)).to.eq(cap.sub(seniorVaultDeposit));
    expect(await dnGmxSeniorVault.maxMint(users[2].address)).to.eq(
      await dnGmxSeniorVault.convertToShares(cap.sub(seniorVaultDeposit)),
    );

    await generateErc20Balance(usdc, cap, users[2].address);
    await usdc.connect(users[2]).approve(dnGmxSeniorVault.address, constants.MaxUint256);

    await dnGmxSeniorVault.connect(users[2]).deposit(seniorVaultDeposit, users[2].address);

    const remaining = cap.sub(seniorVaultDeposit.mul(2));

    expect(await dnGmxSeniorVault.maxDeposit(users[1].address)).to.closeTo(remaining, 2);
    expect(await dnGmxSeniorVault.maxDeposit(users[2].address)).to.closeTo(remaining, 2);
    expect(await dnGmxSeniorVault.maxMint(users[2].address)).to.closeTo(
      await dnGmxSeniorVault.convertToShares(remaining),
      1,
    );

    await expect(dnGmxSeniorVault.connect(users[2]).deposit(remaining.add(1), users[2].address)).to.be.revertedWith(
      `VM Exception while processing transaction: reverted with custom error 'DepositCapExceeded()'`,
    );
  });

  it('getPriceX128 - does not revert', async () => {
    const opts = await dnGmxJuniorVaultFixture();
    const { dnGmxJuniorVault, dnGmxSeniorVault, vdWBTC, vdWETH, aUSDC, fsGlp, users } = opts;

    const withdrawFeeBps = await dnGmxJuniorVault.withdrawFeeBps();

    const MAX_BPS = BigNumber.from(10_000);
    const PRICE_PRECISION = BigNumber.from(10).pow(30);

    await dnGmxSeniorVault.connect(users[1]).deposit(parseUnits('100', 6), users[1].address);

    const amount = parseEther('100');
    const preview = await dnGmxJuniorVault.previewDeposit(amount);

    await dnGmxJuniorVault.connect(users[0]).deposit(amount, users[0].address);

    await expect(dnGmxJuniorVault.getPriceX128()).to.be.not.reverted;
  });
});
