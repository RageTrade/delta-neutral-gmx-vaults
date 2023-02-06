import { expect } from 'chai';
import { BigNumber, constants, ContractTransaction } from 'ethers';
import { parseEther, parseUnits } from 'ethers/lib/utils';
import { DnGmxJuniorVault, DnGmxJuniorVaultManager, DnGmxJuniorVaultMock, ERC20Upgradeable } from '../typechain-types';
import { dnGmxJuniorVaultFixture } from './fixtures/dn-gmx-junior-vault';
import { generateErc20Balance } from './utils/generator';

describe('Junior Vault ERC4646 functions', () => {
  const MAX_BPS = BigNumber.from(10_000);
  it('Deposit', async () => {
    const opts = await dnGmxJuniorVaultFixture();
    const { dnGmxJuniorVault, dnGmxSeniorVault, dnGmxJuniorVaultManager, wbtc, weth, fsGlp, users, admin } = opts;
    await dnGmxJuniorVault.setAdminParams(admin.address, dnGmxSeniorVault.address, constants.MaxUint256, 0, 3000);

    const PRICE_PRECISION = BigNumber.from(10).pow(30);

    await dnGmxSeniorVault.connect(users[1]).deposit(parseUnits('100', 6), users[1].address);

    const amount = parseEther('100');
    const preview = await dnGmxJuniorVault.previewDeposit(amount);

    // const glpPriceBeforeDeposit = await dnGmxJuniorVault.getPriceExternal();

    const tx = await dnGmxJuniorVault.connect(users[0]).deposit(amount, users[0].address);
    const slippageAmount = await calculateSlippage(tx, dnGmxJuniorVaultManager, dnGmxJuniorVault, wbtc, weth);

    const glpPrice = await dnGmxJuniorVault.getGlpPriceInUsdc(false);
    const glpBalance = await fsGlp.balanceOf(dnGmxJuniorVault.address);

    const dnUsdcDeposited = await dnGmxJuniorVault.dnUsdcDeposited();

    let vmv;
    const borrowValues = await dnGmxJuniorVault.getCurrentBorrows();

    const thresholds = await dnGmxJuniorVault.getThresholds();

    // glp notional value
    vmv = glpBalance.mul(glpPrice).div(PRICE_PRECISION);
    // dn usdc deposited
    vmv = vmv.add(dnUsdcDeposited);
    // borrowed notional from aave
    const borrowValueInUsd = await dnGmxJuniorVault.getBorrowValue(borrowValues[0], borrowValues[1]);
    vmv = vmv.sub(borrowValueInUsd);
    // batching manager glp & unHedgedGlp components are 0

    console.log('amount', amount);
    console.log('slippageAmount', slippageAmount);
    console.log('diff', amount.sub(slippageAmount));

    const totalSupply = await dnGmxJuniorVault.totalSupply();
    // console.log("### Total Assets Min ###");
    const totalAssets = await dnGmxJuniorVault.totalAssets();
    // console.log("### Total Assets Max ###");
    // const totalAssetsMax = await dnGmxJuniorVault.totalAssetsMax();

    // const slippageAmountWithGmxThreshold = slippageAmount.mul(MAX_BPS.add(thresholds.slippageThresholdGmxBps)).div(MAX_BPS);

    const aaveLossGlp = borrowValueInUsd.sub(dnUsdcDeposited).mul(PRICE_PRECISION).div(glpPrice);
    const aaveLossGlpWithGmxThreshold = aaveLossGlp.mul(MAX_BPS.add(thresholds.slippageThresholdGmxBps)).div(MAX_BPS);
    // const totalAssetsMaxExpected = glpBalance.sub(aaveLossGlp);
    const totalAssetsMinExpected = glpBalance.sub(aaveLossGlpWithGmxThreshold);

    const amountAfterSlippage = amount.sub(slippageAmount);
    // console.log({amountAfterSlippage, totalSupply, totalAssets, totalAssetsMax,glpPrice, slippageAmountWithGmxThreshold,glpBalance, dnUsdcDeposited,borrowValues, borrowValueInUsd, aaveLossGlp,aaveLossGlpWithGmxThreshold ,totalAssetsMaxExpected, totalAssetsMinExpected});

    expect(totalSupply).to.eq(amountAfterSlippage);
    expect(totalAssets).to.eq(totalAssetsMinExpected);

    expect(await dnGmxJuniorVault.unhedgedGlpInUsdc()).to.eq(0);
    expect(await dnGmxJuniorVault.getVaultMarketValue()).to.eq(vmv);

    expect(preview).to.eq(amountAfterSlippage);
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

    const glpPrice = await dnGmxJuniorVault.getGlpPriceInUsdc(false);
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
  });

  it('Full Withdraw', async () => {
    const opts = await dnGmxJuniorVaultFixture();
    const { dnGmxJuniorVault, dnGmxSeniorVault, dnGmxJuniorVaultManager, admin, users, weth, wbtc } = opts;

    await dnGmxJuniorVault.setThresholds(
      100, //_slippageThresholdSwapBtcBps
      100, //_slippageThresholdSwapEthBps
      100, //_slippageThresholdGmxBps
      100n, //_usdcConversionThreshold
      10n ** 8n, //_wethConversionThreshold
      0n, //_hedgeUsdcAmountThreshold
      parseUnits('1000000', 6), //partialBtcHedgeUsdcAmountThreshold
      parseUnits('1000000', 6), //partialEthHedgeUsdcAmountThreshold
    );
    await dnGmxJuniorVault.setAdminParams(admin.address, dnGmxSeniorVault.address, constants.MaxUint256, 50, 3000);

    await dnGmxSeniorVault.connect(users[1]).deposit(parseUnits('150', 6), users[1].address);

    const amount = parseEther('100');

    await dnGmxJuniorVault.connect(users[0]).deposit(amount, users[0].address);

    const userAssets = await (await dnGmxJuniorVault.convertToAssets(dnGmxJuniorVault.balanceOf(users[0].address)))
      .mul(MAX_BPS.sub(50))
      .div(MAX_BPS);
    const totalAssetsBeforeRedeem = await dnGmxJuniorVault.totalAssets();

    const preview = await dnGmxJuniorVault.previewRedeem(dnGmxJuniorVault.balanceOf(users[0].address));

    const tx = await dnGmxJuniorVault
      .connect(users[0])
      .redeem(dnGmxJuniorVault.maxRedeem(users[0].address), users[0].address, users[0].address);
    const slippageAmount = await calculateSlippage(tx, dnGmxJuniorVaultManager, dnGmxJuniorVault, wbtc, weth);

    expect(await dnGmxJuniorVault.balanceOf(users[0].address)).to.eq(0);
    expect(await dnGmxJuniorVault.totalSupply()).to.eq(0);
    expect(await dnGmxJuniorVault.totalAssets()).to.gt(totalAssetsBeforeRedeem.sub(preview));

    console.log({ userAssets, preview, slippageAmount });
    expect(userAssets.sub(slippageAmount)).to.eq(preview);
  });

  it('Partial Withdraw', async () => {
    const opts = await dnGmxJuniorVaultFixture();
    const { dnGmxJuniorVault, dnGmxSeniorVault, dnGmxJuniorVaultManager, admin, users, weth, wbtc } = opts;
    await dnGmxSeniorVault.connect(users[1]).deposit(parseUnits('150', 6), users[1].address);

    await dnGmxJuniorVault.setAdminParams(admin.address, dnGmxSeniorVault.address, constants.MaxUint256, 100, 3000);

    const amount = parseEther('100');

    await dnGmxJuniorVault.connect(users[0]).deposit(amount, users[0].address);

    const userShares = await dnGmxJuniorVault.balanceOf(users[0].address);
    const userAssets = await dnGmxJuniorVault.convertToAssets(dnGmxJuniorVault.balanceOf(users[0].address));
    const totalAssetsBefore = await dnGmxJuniorVault.totalAssets();

    const withdrawAmount = parseEther('50');

    const preview = await dnGmxJuniorVault.previewWithdraw(withdrawAmount);

    const tx = await dnGmxJuniorVault.connect(users[0]).withdraw(withdrawAmount, users[0].address, users[0].address);
    const slippageAmount = await calculateSlippage(tx, dnGmxJuniorVaultManager, dnGmxJuniorVault, wbtc, weth);

    expect(await dnGmxJuniorVault.balanceOf(users[0].address)).to.eq(userShares.sub(preview));
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

    await expect(
      dnGmxSeniorVault.connect(users[2]).deposit(remaining.add(2), users[2].address),
    ).to.be.revertedWithCustomError(dnGmxSeniorVault, 'DepositCapExceeded');
  });

  it('maxDeposit overflow', async () => {
    const opts = await dnGmxJuniorVaultFixture();
    const { dnGmxJuniorVault, dnGmxSeniorVault, vdWBTC, vdWETH, aUSDC, fsGlp, admin, users, glpBatchingManager } = opts;

    await dnGmxSeniorVault.connect(users[1]).deposit(parseUnits('100', 6), users[1].address);

    const amount = parseEther('100');

    await dnGmxJuniorVault.connect(users[0]).deposit(amount, users[0].address);

    expect(await dnGmxJuniorVault.maxDeposit(users[0].address)).to.eq(
      (await dnGmxJuniorVault.depositCap()).sub(await dnGmxJuniorVault.totalAssetsMax()),
    );
    await dnGmxJuniorVault.setAdminParams(admin.address, dnGmxSeniorVault.address, 0, 50, 3000);
    expect(await dnGmxJuniorVault.maxDeposit(users[0].address)).to.eq(0);
  });

  it('getPriceX128 - does not revert', async () => {
    const opts = await dnGmxJuniorVaultFixture();
    const { dnGmxJuniorVault, dnGmxSeniorVault, users } = opts;

    await dnGmxSeniorVault.connect(users[1]).deposit(parseUnits('100', 6), users[1].address);

    const amount = parseEther('100');
    await dnGmxJuniorVault.connect(users[0]).deposit(amount, users[0].address);

    await expect(dnGmxJuniorVault.getPriceX128()).to.be.not.reverted;
  });

  async function calculateSlippage(
    tx: ContractTransaction,
    dnGmxJuniorVaultManager: DnGmxJuniorVaultManager,
    dnGmxJuniorVault: DnGmxJuniorVaultMock,
    wbtc: ERC20Upgradeable,
    weth: ERC20Upgradeable,
  ): Promise<BigNumber> {
    const receipt = await tx.wait();
    let slippage: BigNumber = BigNumber.from(0);
    let totalSlippage: BigNumber = BigNumber.from(0);
    const PRICE_PRECISION = BigNumber.from(10).pow(30);

    console.log('Token Swapped Topic', dnGmxJuniorVaultManager.interface.getEventTopic('TokenSwapped'));

    for (const log of receipt.logs) {
      if (log.topics[0] === dnGmxJuniorVaultManager.interface.getEventTopic('TokenSwapped')) {
        const args = dnGmxJuniorVaultManager.interface.parseLog(log).args;
        console.log(args);

        if (args.fromToken.toLowerCase() == wbtc.address.toLowerCase()) {
          const btcPrice = await dnGmxJuniorVault['getPrice(address,bool)'](wbtc.address, true);
          console.log('btcPrice', btcPrice);

          //Adding 1 to roundUp the slippage
          slippage = BigNumber.from(args.fromQuantity)
            .mul(btcPrice)
            .div(PRICE_PRECISION)
            .sub(BigNumber.from(args.toQuantity));
        }

        if (args.fromToken.toLowerCase() == weth.address.toLowerCase()) {
          const ethPrice = await dnGmxJuniorVault['getPrice(address,bool)'](weth.address, true);
          console.log('ethPrice', ethPrice);

          //Adding 1 to roundUp the slippage
          slippage = BigNumber.from(args.fromQuantity)
            .mul(ethPrice)
            .div(PRICE_PRECISION)
            .sub(BigNumber.from(args.toQuantity));
        }

        if (args.toToken.toLowerCase() == wbtc.address.toLowerCase()) {
          const btcPrice = await dnGmxJuniorVault['getPrice(address,bool)'](wbtc.address, true);
          console.log('btcPrice', btcPrice);
          //Adding 1 to roundUp the slippage
          slippage = BigNumber.from(args.fromQuantity).sub(
            BigNumber.from(args.toQuantity).mul(btcPrice).div(PRICE_PRECISION),
          );
        }

        if (args.toToken.toLowerCase() == weth.address.toLowerCase()) {
          const ethPrice = await dnGmxJuniorVault['getPrice(address,bool)'](weth.address, true);
          console.log('ethPrice', ethPrice);

          //Adding 1 to roundUp the slippage
          slippage = BigNumber.from(args.fromQuantity).sub(
            BigNumber.from(args.toQuantity).mul(ethPrice).div(PRICE_PRECISION),
          );
        }

        totalSlippage = slippage.gt(0) ? totalSlippage.add(slippage).add(1n) : totalSlippage;

        console.log('slippage', slippage);
      }
    }

    const glpPrice = await dnGmxJuniorVault.getGlpPriceInUsdc(false);
    console.log({
      slippageInDollars: totalSlippage,
      glpPrice,
      slippageInGlp: totalSlippage.mul(PRICE_PRECISION).div(glpPrice),
    });
    // total slippage in terms of asset (adding 1 to round up)
    return totalSlippage.eq(0n) ? BigNumber.from(0) : totalSlippage.mul(PRICE_PRECISION).div(glpPrice).add(1);
  }
});
