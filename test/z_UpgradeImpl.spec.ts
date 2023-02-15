import { expect } from 'chai';
import hre, { ethers } from 'hardhat';
import { formatEther, formatUnits, parseEther, parseUnits } from 'ethers/lib/utils';
import { dnGmxJuniorVaultFixture } from './fixtures/dn-gmx-update-impl';
import {
  deltaNeutralGmxVaults,
  DnGmxBatchingManager__factory,
  formatUsdc,
  fromQ128,
  parseUsdc,
  tokens,
  toQ128,
} from '@ragetrade/sdk';
import { DepositEvent } from '../typechain-types/contracts/interfaces/IERC4626';
import { BigNumber } from 'ethers';
import { impersonateAccount, setBalance } from '@nomicfoundation/hardhat-network-helpers';
import { arb } from './utils/arb';
import { TransparentUpgradeableProxy__factory } from '../typechain-types';
import { generateErc20Balance } from './utils/generator';

const proxyAdminAddr = '0x90066f5EeABd197433411E8dEc935a2d28BC28De';

const dnGmxRouter = '0x96ca304a7cd4afd6121f8917d2cdeb8da1175d5b';
const usdcBatchingManager = '0x519Eb01fa6Ed3d72E96e40770a45b13531CEf63d';
const oldDnGmxJuniorVault = '0x8478AB5064EbAC770DdCE77E7D31D969205F041E';

const juniorVaultDepositor = '0x04808a3aa9507f2354d3f411f86208ba9fa38093';
const existingBMUser = '0x9f7D3CECf8F857C10fa0B1BEED96DCFE52625454';

describe('Update Implementation', () => {
  it('dn gmx junior vault', async () => {
    const opts = await dnGmxJuniorVaultFixture();

    const IExecuteBatch = [
      'function executeBatchDeposit(uint256) external',
      'function keeper() external view returns (address)',
    ];

    const bm = new ethers.Contract(usdcBatchingManager, IExecuteBatch, hre.ethers.provider);
    const vaultWithImplAbi = await ethers.getContractAt('DnGmxJuniorVault', oldDnGmxJuniorVault);
    const vaultWithProxyAbi = await ethers.getContractAt('TransparentUpgradeableProxy', oldDnGmxJuniorVault);
    const bmWithProxyAbi = await ethers.getContractAt('TransparentUpgradeableProxy', usdcBatchingManager);

    const proxyAdmin = await hre.ethers.getContractAt('ProxyAdmin', proxyAdminAddr);
    const owner = await proxyAdmin.owner();
    const juniorVaultKeeper = (await vaultWithImplAbi.getAdminParams()).keeper;
    const batchingManagerKeeper = await bm.keeper();
    const timelock = await vaultWithImplAbi.owner();

    await impersonateAccount(proxyAdmin.address);
    await impersonateAccount(owner);
    await impersonateAccount(dnGmxRouter);
    await impersonateAccount(juniorVaultKeeper);
    await impersonateAccount(juniorVaultDepositor);
    await impersonateAccount(timelock);

    const proxyAdminSigner = await ethers.getSigner(proxyAdmin.address);
    const ownerSigner = await ethers.getSigner(owner);
    const batchingManagerKeeperSigner = await ethers.getSigner(batchingManagerKeeper);
    const juniorVaultKeeperSigner = await ethers.getSigner(juniorVaultKeeper);
    const juniorVaultDepositorSigner = await ethers.getSigner(juniorVaultDepositor);
    const timelockSigner = await ethers.getSigner(timelock);

    /**
     * Upgrade
     */

    // before upgrade
    await bm.connect(batchingManagerKeeperSigner).executeBatchDeposit(0);
    const totalAssetsBeforeUpgrade = await vaultWithImplAbi.totalAssets();
    console.log('totalAssetsBeforeUpgrade', formatEther(totalAssetsBeforeUpgrade));

    // upgrade implementation
    await proxyAdmin.connect(ownerSigner).upgrade(vaultWithProxyAbi.address, opts.dnGmxJuniorVault.address);
    await proxyAdmin.connect(ownerSigner).upgrade(bmWithProxyAbi.address, opts.glpBatchingManager.address);
    const totalAssetsAfterUpgradeBeforeRebalance = await vaultWithImplAbi.totalAssets();
    console.log('totalAssetsAfterUpgradeBeforeRebalance', formatEther(totalAssetsAfterUpgradeBeforeRebalance));
    // console.log(await vaultWithImplAbi.getCurrentBorrows());
    // console.log(await vaultWithImplAbi['getOptimalBorrows()']());

    /**
     * Post upgrade
     */

    await vaultWithImplAbi.connect(timelockSigner).setParamsV1(0n, opts.dnGmxTraderHedgeStrategy.address);
    await vaultWithImplAbi.connect(timelockSigner).grantAllowances();

    const adminParams = await vaultWithImplAbi.getAdminParams();
    await vaultWithImplAbi
      .connect(timelockSigner)
      .setAdminParams(
        adminParams.keeper,
        adminParams.dnGmxSeniorVault,
        adminParams.depositCap_.mul(10000000),
        adminParams.withdrawFeeBps,
        adminParams.feeTierWethWbtcPool,
      );

    // await generateErc20Balance(opts.usdc, parseUsdc('1000000'), opts.users[0].address);
    // await opts.usdc.connect(opts.users[0]).approve(opts.dnGmxSeniorVault.address, parseUsdc('1000000'));
    // await opts.dnGmxSeniorVault.connect(opts.users[0]).deposit(parseUsdc('1000000'), opts.users[0].address);

    const seniorVaultOwner = await impersonate(await opts.dnGmxSeniorVault.owner());
    const depositCap = await opts.dnGmxSeniorVault.depositCap();
    await opts.dnGmxSeniorVault.connect(seniorVaultOwner).setDepositCap(depositCap.add(parseUsdc('2000000')));

    await generateErc20Balance(opts.usdc, parseUsdc('1000000'), opts.users[0].address);
    await opts.usdc.connect(opts.users[0]).approve(opts.dnGmxSeniorVault.address, parseUsdc('2000000'));
    await opts.dnGmxSeniorVault.connect(opts.users[0]).deposit(parseUsdc('1000000'), opts.users[0].address);

    const borrowCap = await opts.dnGmxSeniorVault.borrowCaps(opts.dnGmxJuniorVault.address);
    await opts.dnGmxSeniorVault
      .connect(seniorVaultOwner)
      .updateBorrowCap(opts.dnGmxJuniorVault.address, borrowCap.add(parseUsdc('1000000')));

    /**
     * pre rebalance actions
     */

    const govSigner = await impersonate('0x7b1FFdDEEc3C4797079C7ed91057e399e9D43a8B');
    const IVaultPriceFeed = ['function setMaxStrictPriceDeviation(uint256 _maxStrictPriceDeviation) external'];
    const priceFeed = new ethers.Contract(await opts.gmxVault.priceFeed(), IVaultPriceFeed, govSigner);

    // @dev changing price of USDC on gmx to be 1$
    // because we are minting lot of glp with eth to give to users[1,2, 3] and redeeming it for usdc in scenarios
    await priceFeed.setMaxStrictPriceDeviation(ethers.constants.MaxUint256);

    const keeperBMSigner = await impersonate(opts.usdcBatchingManager.keeper());
    const batchingManagerOwner = await impersonate(opts.usdcBatchingManager.owner());

    const dnGmxBatchingManager_ = new ethers.Contract(
      opts.usdcBatchingManager.address,
      ['function setParamsV1(address _weth, address _rewardsHarvestingRouter) external '],
      opts.usdcBatchingManager.signer,
    );

    await dnGmxBatchingManager_
      .connect(batchingManagerOwner)
      .setParamsV1(opts.weth.address, '0xA906F338CB21815cBc4Bc87ace9e68c87eF8d8F1');

    // await opts.usdcBatchingManager.connect(batchingManagerOwner).rescueFees();

    /**
     * Rebalance
     */

    async function rebalance() {
      const res = await opts.dnGmxSeniorVault.availableBorrow(opts.dnGmxJuniorVault.address);
      console.log('availableBorrow', formatUsdc(res));
      const result = await hre.ethers.provider.getStorageAt(opts.dnGmxJuniorVault.address, 255);
      console.log('unhedged glp', formatEther(result));
      await vaultWithImplAbi.isValidRebalance();
      await vaultWithImplAbi.connect(juniorVaultKeeperSigner).rebalance();

      const cb = await vaultWithImplAbi.getCurrentBorrows();
      console.log({
        currentBtcBorrow: formatUnits(cb.currentBtcBorrow, 8),
        currentEthBorrow: formatUnits(cb.currentEthBorrow, 18),
      });
      const ob = await vaultWithImplAbi.getOptimalBorrows(vaultWithImplAbi.totalAssets());
      console.log({
        optimalBtcBorrow: formatUnits(ob.optimalBtcBorrow, 8),
        optimalEthBorrow: formatUnits(ob.optimalEthBorrow, 18),
      });
    }
    await rebalance();

    for (let i = 0; i < 15; i++) {
      try {
        await rebalance();
        console.log('\nRebalanced', i);
        await arb(opts.users[0], opts.weth.address, opts.usdc.address, 500, true);
        await arb(opts.users[0], opts.wbtc.address, opts.weth.address, 500, true);
      } catch (e) {
        console.log('rebalanced for', i, 'times');
        console.error(e);
        break;
      }
    }

    await generateErc20Balance(opts.usdc, parseUsdc('1000000'), opts.users[0].address);
    await opts.usdc.connect(opts.users[0]).approve(opts.dnGmxSeniorVault.address, parseUsdc('1000000'));
    await opts.dnGmxSeniorVault.connect(opts.users[0]).deposit(parseUsdc('1000000'), opts.users[0].address);

    // await arb(opts.users[0], opts.wbtc.address, opts.weth.address, 500, true);
    // await arb(opts.users[0], opts.weth.address, opts.usdc.address, 500);

    await vaultWithImplAbi.connect(juniorVaultKeeperSigner).rebalance();

    const totalAssetsAfterRebalance = await vaultWithImplAbi.totalAssets();
    console.log('totalAssetsAfterRebalance', formatEther(totalAssetsAfterRebalance));
    // without gmx st
    // 10K -> 0.0008602170049 %
    // 1.035826704139061373
    // 1.035817793781610636

    // 100K -> 0.008544901781 %
    // 1.035829002571729652
    // 1.035740499563332996

    //
    // 100K -> 0.008544901781 %
    // 1.035829002571729652
    // 1.035740499563332996
    /**
     * Deposit
     */

    const depositAssets = parseEther('100000'); // there is an error with 2000

    // before deposit
    const maxWithdrawBefore = await vaultWithImplAbi.maxWithdraw(juniorVaultDepositor);
    const totalAssetsBefore = await vaultWithImplAbi.totalAssets();
    // console.log('totalAssetsBefore', formatEther(totalAssetsBefore));
    await opts.sGlp.connect(opts.users[0]).approve(vaultWithImplAbi.address, depositAssets);
    // console.log('balance', formatEther(await opts.fsGlp.balanceOf(opts.users[0].address)));

    const sharesPreview = await vaultWithImplAbi.connect(opts.users[0]).previewDeposit(depositAssets);

    // deposit
    const tx = await vaultWithImplAbi.connect(opts.users[0]).deposit(depositAssets, opts.users[0].address);
    const rc = await tx.wait();

    // state after deposit
    const maxWithdrawAfter = await vaultWithImplAbi.maxWithdraw(juniorVaultDepositor);
    const totalAssetsAfter = await vaultWithImplAbi.totalAssets();
    console.log('totalAssetsAfter', formatEther(totalAssetsAfter));

    const depositLog = rc.logs.find(l => l.topics[0] === vaultWithImplAbi.filters.Deposit().topics![0]);
    if (!depositLog) throw new Error('Deposit log not found');
    const depositEvent = vaultWithImplAbi.interface.parseLog(depositLog) as unknown as DepositEvent;

    console.log('maxWithdrawBefore', formatEther(maxWithdrawBefore));
    console.log('maxWithdrawAfter', formatEther(maxWithdrawAfter));
    expectEqualWithRelativeError(depositEvent.args.shares, sharesPreview, 0.05);
    expectEqualWithRelativeError(maxWithdrawBefore, maxWithdrawAfter, 0.05);
    expectEqualWithRelativeError(totalAssetsBefore.add(depositAssets), totalAssetsAfter, 0.2);
  });

  it('dn gmx batching manager', async () => {
    const opts = await dnGmxJuniorVaultFixture();

    const IExecuteBatch = [
      'function executeBatchDeposit(uint256) external',
      'function keeper() external view returns (address)',
    ];

    const bm = new ethers.Contract(usdcBatchingManager, IExecuteBatch, hre.ethers.provider);

    const proxyAdmin = await hre.ethers.getContractAt('ProxyAdmin', proxyAdminAddr);
    const owner = await proxyAdmin.owner();

    await impersonateAccount(proxyAdmin.address);
    await impersonateAccount(owner);
    await impersonateAccount(dnGmxRouter);
    await impersonateAccount(existingBMUser);

    const ownerSigner = await ethers.getSigner(owner);
    const keeperSigner = await ethers.getSigner(dnGmxRouter);
    const proxyAdminSigner = await ethers.getSigner(proxyAdmin.address);
    const existingBMUserSigner = await ethers.getSigner(existingBMUser);

    const bmWithImplAbi = await ethers.getContractAt('DnGmxBatchingManager', usdcBatchingManager);
    const bmWithProxyAbi = await ethers.getContractAt('TransparentUpgradeableProxy', usdcBatchingManager);

    const vaultWithImplAbi = await ethers.getContractAt('DnGmxJuniorVault', oldDnGmxJuniorVault);
    const vaultWithProxyAbi = await ethers.getContractAt('TransparentUpgradeableProxy', oldDnGmxJuniorVault);

    await bm.connect(keeperSigner).executeBatchDeposit(0);

    console.log('before update');
    console.log('impl addr', await bmWithProxyAbi.connect(proxyAdminSigner).callStatic.implementation());

    await proxyAdmin.connect(ownerSigner).upgrade(vaultWithProxyAbi.address, opts.dnGmxJuniorVault.address);
    await proxyAdmin.connect(ownerSigner).upgrade(bmWithProxyAbi.address, opts.glpBatchingManager.address);

    console.log('after update');
    console.log('impl addr', await bmWithProxyAbi.connect(proxyAdminSigner).callStatic.implementation());

    const taBeforeRescue = await vaultWithImplAbi.totalAssets();

    console.log(
      'claimable',
      formatUnits(
        await opts.stakedGmxTracker
          .attach('0x1aDDD80E6039594eE970E5872D247bf0414C8903')
          .claimable(bmWithImplAbi.address),
      ),
    );

    // await bmWithImplAbi.connect(ownerSigner).setParamsV1(addresses.WETH, GMX_ECOSYSTEM_ADDRESSES.RewardRouter);
    // await bmWithImplAbi.connect(ownerSigner).rescueFees();

    const taAfterRescue = await vaultWithImplAbi.totalAssets();

    console.log('glp received from resuced fees: ', formatUnits(taAfterRescue.sub(taBeforeRescue)));

    const unclaimed = await bmWithImplAbi.unclaimedShares(existingBMUser);

    expect(() => bmWithImplAbi.connect(existingBMUserSigner).claim(existingBMUser, unclaimed)).to.changeTokenBalance(
      vaultWithImplAbi,
      existingBMUser,
      unclaimed,
    );

    expect(await vaultWithImplAbi.balanceOf(existingBMUser)).to.eq(unclaimed);
  });

  it('batching manager deposit', async () => {
    const fixtureDeployments = await dnGmxJuniorVaultFixture();
    const { users } = fixtureDeployments;

    const mainnetContracts = deltaNeutralGmxVaults.getContractsSync('arbmain', hre.ethers.provider);

    const ownerAddress = await mainnetContracts.proxyAdmin.owner();
    const keeperAddress = await mainnetContracts.dnGmxBatchingManager.keeper();
    const timelockAddress = await mainnetContracts.dnGmxJuniorVault.owner();

    await impersonateAccount(ownerAddress);
    await impersonateAccount(keeperAddress);
    await impersonateAccount(timelockAddress);
    await impersonateAccount(mainnetContracts.proxyAdmin.address);
    await impersonateAccount(mainnetContracts.proxyAdmin.address);
    const ownerSigner = await hre.ethers.getSigner(ownerAddress);
    const proxyAdminSigner = await hre.ethers.getSigner(mainnetContracts.proxyAdmin.address);
    const keeperSigner = await hre.ethers.getSigner(keeperAddress);
    const timelockSigner = await hre.ethers.getSigner(timelockAddress);

    const oldDepositor = '0x04808a3aa9507f2354d3f411f86208ba9fa38093';

    // state before upgrade
    const unclaimedSharesBefore = await mainnetContracts.dnGmxBatchingManager.unclaimedShares(oldDepositor);
    const roundIdBefore = await mainnetContracts.dnGmxBatchingManager.currentRound();

    const oldImpl = await TransparentUpgradeableProxy__factory.connect(
      mainnetContracts.dnGmxBatchingManager.address,
      proxyAdminSigner,
    ).callStatic.implementation();
    expect(oldImpl).to.equal(mainnetContracts.dnGmxBatchingManagerLogic.address);

    const newDnGmxBatchingManager = await hre.ethers.deployContract('DnGmxBatchingManager');

    // perform upgrade
    await mainnetContracts.dnGmxBatchingManager.connect(keeperSigner).pauseDeposit();
    await mainnetContracts.proxyAdmin
      .connect(ownerSigner)
      .upgrade(mainnetContracts.dnGmxBatchingManager.address, newDnGmxBatchingManager.address);
    await mainnetContracts.dnGmxBatchingManager.connect(keeperSigner).unpauseDeposit();

    const newImplAddress = await TransparentUpgradeableProxy__factory.connect(
      mainnetContracts.dnGmxBatchingManager.address,
      proxyAdminSigner,
    ).callStatic.implementation();
    expect(newImplAddress).to.equal(newDnGmxBatchingManager.address);

    // using new interface
    const dnGmxBatchingManager = DnGmxBatchingManager__factory.connect(
      mainnetContracts.dnGmxBatchingManager.address,
      hre.ethers.provider,
    );

    // state before upgrade
    const unclaimedSharesAfter = await dnGmxBatchingManager.unclaimedShares(oldDepositor);
    const roundIdAfter = await dnGmxBatchingManager.currentRound();
    expect(unclaimedSharesBefore).to.be.eq(unclaimedSharesAfter);
    expect(roundIdBefore).to.be.eq(roundIdAfter);
  });
});

function expectEqualWithRelativeError(a: BigNumber, b: BigNumber, error: number) {
  const errorBN = toQ128(error * 100);
  const diff = toQ128(100).mul(b.sub(a)).div(a).abs();
  try {
    expect(diff.lte(errorBN)).to.be.true;
  } catch (e) {
    try {
      expect(a).to.be.eq(b); // for printing error
    } catch (e: any) {
      e.message += `by ${fromQ128(diff)} percent.`;
      throw e;
    }
  }
}

export async function impersonate(address: string | Promise<string>) {
  address = await address;
  await impersonateAccount(address);
  await giveBalance(address);
  return hre.ethers.getSigner(address);
}

export async function giveBalance(address: string) {
  await setBalance(address, parseEther('120000').toHexString());
}
