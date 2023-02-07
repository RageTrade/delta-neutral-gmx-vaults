import { expect } from 'chai';
import { BigNumber } from 'ethers';
import { formatEther, parseEther } from 'ethers/lib/utils';
import hre from 'hardhat';

import { impersonateAccount } from '@nomicfoundation/hardhat-network-helpers';
import { deltaNeutralGmxVaults, fromQ128, toQ128 } from '@ragetrade/sdk';
import { DepositEvent } from '@ragetrade/sdk/dist/typechain/delta-neutral-gmx-vaults/contracts/ERC4626/ERC4626Upgradeable';

import { TransparentUpgradeableProxy__factory } from '../typechain-types';
import { dnGmxJuniorVaultFixture } from './fixtures/dn-gmx-junior-vault';
import { activateMainnetFork } from './utils/mainnet-fork';

describe('Mainnet fork', () => {
  before(async () => {
    await activateMainnetFork({
      network: 'arbitrum-mainnet',
      blockNumber: 58718695,
    });
  });

  it('junior vault', async () => {
    const fixtureDeployments = await dnGmxJuniorVaultFixture();
    const { users, dnGmxJuniorVault } = fixtureDeployments;

    const mainnetContracts = deltaNeutralGmxVaults.getContractsSync('arbmain', hre.ethers.provider);

    const ownerAddress = await mainnetContracts.proxyAdmin.owner();
    const keeperAddress = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';

    await impersonateAccount(ownerAddress);
    await impersonateAccount(keeperAddress);
    await impersonateAccount(mainnetContracts.proxyAdmin.address);
    await impersonateAccount(mainnetContracts.proxyAdmin.address);
    const ownerSigner = await hre.ethers.getSigner(ownerAddress);
    const proxyAdminSigner = await hre.ethers.getSigner(mainnetContracts.proxyAdmin.address);
    const keeperSigner = await hre.ethers.getSigner(keeperAddress);

    const oldImpl = await TransparentUpgradeableProxy__factory.connect(
      mainnetContracts.dnGmxJuniorVault.address,
      proxyAdminSigner,
    ).callStatic.implementation();
    expect(oldImpl).to.equal(mainnetContracts.dnGmxJuniorVaultLogic.address);

    // perform upgrade
    await mainnetContracts.proxyAdmin
      .connect(ownerSigner)
      .upgrade(mainnetContracts.dnGmxJuniorVault.address, fixtureDeployments.dnGmxJuniorVault.address);

    const newImpl = await TransparentUpgradeableProxy__factory.connect(
      mainnetContracts.dnGmxJuniorVault.address,
      proxyAdminSigner,
    ).callStatic.implementation();
    expect(newImpl).to.equal(fixtureDeployments.dnGmxJuniorVault.address);

    // 0.5%

    const totalAssetsBeforeV = await mainnetContracts.dnGmxJuniorVault.totalAssets();
    console.log('totalAssetsBeforeRebalance', formatEther(totalAssetsBeforeV));

    // trigger rebalance
    await dnGmxJuniorVault.connect(keeperSigner).rebalance();

    const depositAssets = parseEther('2000');
    const oldDepositor = '0x04808a3aa9507f2354d3f411f86208ba9fa38093';

    // state before deposit
    const maxWithdrawBefore = await mainnetContracts.dnGmxJuniorVault.maxWithdraw(oldDepositor);
    const totalAssetsBefore = await mainnetContracts.dnGmxJuniorVault.totalAssets();
    console.log('totalAssetsBefore', formatEther(totalAssetsBefore));
    await mainnetContracts.dnGmxJuniorVault
      .connect(fixtureDeployments.users[0])
      .approve(mainnetContracts.dnGmxJuniorVault.address, depositAssets);
    const sharesPreview = await dnGmxJuniorVault.connect(users[0]).previewDeposit(depositAssets);

    // deposit
    const tx = await dnGmxJuniorVault.connect(users[0]).deposit(depositAssets, users[0].address);
    const rc = await tx.wait();

    await dnGmxJuniorVault.connect(keeperSigner).rebalance();
    // state after deposit
    const maxWithdrawAfter = await mainnetContracts.dnGmxJuniorVault.maxWithdraw(oldDepositor);
    const totalAssetsAfter = await mainnetContracts.dnGmxJuniorVault.totalAssets();
    console.log('totalAssetsAfter', formatEther(totalAssetsAfter));

    const depositLog = rc.logs.find(l => l.topics[0] === dnGmxJuniorVault.filters.Deposit().topics![0]);
    if (!depositLog) throw new Error('Deposit log not found');
    const depositEvent = dnGmxJuniorVault.interface.parseLog(depositLog) as unknown as DepositEvent;

    expect(depositEvent.args.shares).to.be.eq(sharesPreview);
    expectEqualWithRelativeError(maxWithdrawBefore, maxWithdrawAfter, 0.05);
    expectEqualWithRelativeError(totalAssetsBefore /*.add(depositAssets)*/, totalAssetsAfter, 0.05);
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
