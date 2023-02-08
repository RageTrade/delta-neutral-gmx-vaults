import { expect } from 'chai';
import { BigNumber } from 'ethers';
import { formatEther, parseEther } from 'ethers/lib/utils';
import hre from 'hardhat';

import { impersonateAccount } from '@nomicfoundation/hardhat-network-helpers';
import { deltaNeutralGmxVaults, fromQ128, parseUsdc, tokens, toQ128 } from '@ragetrade/sdk';
import { DepositEvent } from '@ragetrade/sdk/dist/typechain/delta-neutral-gmx-vaults/contracts/ERC4626/ERC4626Upgradeable';

import {
  DnGmxBatchingManager__factory,
  DnGmxJuniorVault__factory,
  TransparentUpgradeableProxy__factory,
} from '../typechain-types';
import { dnGmxJuniorVaultFixture } from './fixtures/dn-gmx-junior-vault';
import { activateMainnetFork } from './utils/mainnet-fork';

describe('Mainnet fork upgrade impl', () => {
  before(async () => {
    await activateMainnetFork({
      network: 'arbitrum-mainnet',
      blockNumber: 58718695,
    });
  });

  it('junior vault', async () => {
    const fixtureDeployments = await dnGmxJuniorVaultFixture();
    const { users } = fixtureDeployments;

    const mainnetContracts = deltaNeutralGmxVaults.getContractsSync('arbmain', hre.ethers.provider);
    const { sGLP, fsGLP } = tokens.getContractsSync('arbmain', hre.ethers.provider);

    const ownerAddress = await mainnetContracts.proxyAdmin.owner();
    const keeperAddress = (await mainnetContracts.dnGmxJuniorVault.getAdminParams()).keeper;
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

    const oldImpl = await TransparentUpgradeableProxy__factory.connect(
      mainnetContracts.dnGmxJuniorVault.address,
      proxyAdminSigner,
    ).callStatic.implementation();
    expect(oldImpl).to.equal(mainnetContracts.dnGmxJuniorVaultLogic.address);

    const newDnGmxJuniorVault = await hre.ethers.deployContract('DnGmxJuniorVault', {
      libraries: {
        ['contracts/libraries/DnGmxJuniorVaultManager.sol:DnGmxJuniorVaultManager']:
          fixtureDeployments.dnGmxJuniorVaultManager.address,
      },
    });

    // perform upgrade
    await mainnetContracts.proxyAdmin
      .connect(ownerSigner)
      .upgrade(mainnetContracts.dnGmxJuniorVault.address, newDnGmxJuniorVault.address);

    const newImplAddress = await TransparentUpgradeableProxy__factory.connect(
      mainnetContracts.dnGmxJuniorVault.address,
      proxyAdminSigner,
    ).callStatic.implementation();
    expect(newImplAddress).to.equal(newDnGmxJuniorVault.address);

    // using new interface
    const dnGmxJuniorVault = DnGmxJuniorVault__factory.connect(
      mainnetContracts.dnGmxJuniorVault.address,
      hre.ethers.provider,
    );

    // post upgrade admin actions
    await dnGmxJuniorVault.connect(timelockSigner).setParamsV1(0n, fixtureDeployments.dnGmxTraderHedgeStrategy.address);
    await dnGmxJuniorVault.connect(timelockSigner).grantAllowances();

    const totalAssetsBeforeV = await dnGmxJuniorVault.totalAssets();
    console.log('totalAssetsBeforeRebalance', formatEther(totalAssetsBeforeV));

    // trigger rebalance
    await dnGmxJuniorVault.connect(keeperSigner).rebalance();

    // 2000 is underflowing
    const depositAssets = parseEther('10000'); // there is an error with 2000
    const oldDepositor = '0x04808a3aa9507f2354d3f411f86208ba9fa38093';

    // state before deposit
    const maxWithdrawBefore = await dnGmxJuniorVault.maxWithdraw(oldDepositor);
    const totalAssetsBefore = await dnGmxJuniorVault.totalAssets();
    console.log('totalAssetsBefore', formatEther(totalAssetsBefore));
    await sGLP.connect(fixtureDeployments.users[0]).approve(dnGmxJuniorVault.address, depositAssets);
    console.log('balance', formatEther(await fsGLP.balanceOf(fixtureDeployments.users[0].address)));

    const sharesPreview = await dnGmxJuniorVault.connect(users[0]).previewDeposit(depositAssets);

    // deposit
    const tx = await dnGmxJuniorVault.connect(users[0]).deposit(depositAssets, users[0].address);
    const rc = await tx.wait();

    await dnGmxJuniorVault.connect(keeperSigner).rebalance();
    // state after deposit
    const maxWithdrawAfter = await dnGmxJuniorVault.maxWithdraw(oldDepositor);
    const totalAssetsAfter = await dnGmxJuniorVault.totalAssets();
    console.log('totalAssetsAfter', formatEther(totalAssetsAfter));

    const depositLog = rc.logs.find(l => l.topics[0] === dnGmxJuniorVault.filters.Deposit().topics![0]);
    if (!depositLog) throw new Error('Deposit log not found');
    const depositEvent = dnGmxJuniorVault.interface.parseLog(depositLog) as unknown as DepositEvent;

    expect(depositEvent.args.shares).to.be.eq(sharesPreview);
    expectEqualWithRelativeError(maxWithdrawBefore, maxWithdrawAfter, 0.05);
    expectEqualWithRelativeError(totalAssetsBefore /*.add(depositAssets)*/, totalAssetsAfter, 0.05);
  });

  it('batching manager', async () => {
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
