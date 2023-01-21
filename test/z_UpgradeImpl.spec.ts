import { expect } from 'chai';
import hre, { ethers } from 'hardhat';
import { formatUnits } from 'ethers/lib/utils';
import { activateMainnetFork } from './utils/mainnet-fork';
import addresses, { GMX_ECOSYSTEM_ADDRESSES } from './fixtures/addresses';
import { dnGmxJuniorVaultFixture } from './fixtures/dn-gmx-update-impl';

const proxyAdminAddr = '0x90066f5EeABd197433411E8dEc935a2d28BC28De';

const dnGmxRouter = '0x96ca304a7cd4afd6121f8917d2cdeb8da1175d5b';
const usdcBatchingManager = '0x519Eb01fa6Ed3d72E96e40770a45b13531CEf63d';
const oldDnGmxJuniorVault = '0x8478AB5064EbAC770DdCE77E7D31D969205F041E';

const existingBMUser = '0x9f7D3CECf8F857C10fa0B1BEED96DCFE52625454';

describe('Update Implementation', () => {
  before(async () => {
    await activateMainnetFork({
      network: 'arbitrum-mainnet',
      blockNumber: 54434500,
    });
  });

  it('dn gmx junior vault', async () => {
    const opts = await dnGmxJuniorVaultFixture();

    const IExecuteBatch = [
      'function executeBatchDeposit(uint256) external',
      'function keeper() external view returns (address)',
    ];

    const bm = new ethers.Contract(usdcBatchingManager, IExecuteBatch, hre.ethers.provider);

    const proxyAdmin = await hre.ethers.getContractAt('ProxyAdmin', proxyAdminAddr);
    const owner = await proxyAdmin.owner();

    await hre.network.provider.request({
      method: 'hardhat_impersonateAccount',
      params: [proxyAdmin.address],
    });
    await hre.network.provider.request({
      method: 'hardhat_impersonateAccount',
      params: [owner],
    });
    await hre.network.provider.request({
      method: 'hardhat_impersonateAccount',
      params: [dnGmxRouter],
    });

    const ownerSigner = await ethers.getSigner(owner);
    const keeperSigner = await ethers.getSigner(dnGmxRouter);
    const proxyAdminSigner = await ethers.getSigner(proxyAdmin.address);

    const vaultWithImplAbi = await ethers.getContractAt('DnGmxJuniorVault', oldDnGmxJuniorVault);
    const vaultWithProxyAbi = await ethers.getContractAt('TransparentUpgradeableProxy', oldDnGmxJuniorVault);

    console.log('before update');
    console.log('impl addr', await vaultWithProxyAbi.connect(proxyAdminSigner).callStatic.implementation());
    console.log('total assets', formatUnits(await vaultWithImplAbi.totalAssets()));

    await bm.connect(keeperSigner).executeBatchDeposit(0);

    await proxyAdmin.connect(ownerSigner).upgrade(vaultWithProxyAbi.address, opts.dnGmxJuniorVault.address);

    console.log('after update');
    console.log('impl addr', await vaultWithProxyAbi.connect(proxyAdminSigner).callStatic.implementation());
    console.log('total assets', formatUnits(await vaultWithImplAbi.totalAssets()));
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

    await hre.network.provider.request({
      method: 'hardhat_impersonateAccount',
      params: [proxyAdmin.address],
    });
    await hre.network.provider.request({
      method: 'hardhat_impersonateAccount',
      params: [owner],
    });
    await hre.network.provider.request({
      method: 'hardhat_impersonateAccount',
      params: [dnGmxRouter],
    });

    const ownerSigner = await ethers.getSigner(owner);
    const keeperSigner = await ethers.getSigner(dnGmxRouter);
    const proxyAdminSigner = await ethers.getSigner(proxyAdmin.address);

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

    await bmWithImplAbi.connect(ownerSigner).setParamsV1(addresses.WETH, GMX_ECOSYSTEM_ADDRESSES.RewardRouter);
    await bmWithImplAbi.connect(ownerSigner).rescueFees();

    const taAfterRescue = await vaultWithImplAbi.totalAssets();

    console.log('glp received from resuced fees: ', formatUnits(taAfterRescue.sub(taBeforeRescue)));

    const unclaimed = await bmWithImplAbi.unclaimedShares(existingBMUser);

    await hre.network.provider.request({
      method: 'hardhat_impersonateAccount',
      params: [existingBMUser],
    });

    const existingBMUserSigner = await ethers.getSigner(existingBMUser);

    expect(() => bmWithImplAbi.connect(existingBMUserSigner).claim(existingBMUser, unclaimed)).to.changeTokenBalance(
      vaultWithImplAbi,
      existingBMUser,
      unclaimed,
    );

    expect(await vaultWithImplAbi.balanceOf(existingBMUser)).to.eq(unclaimed);
  });
});
