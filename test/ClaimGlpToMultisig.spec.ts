import { expect } from 'chai';
import hre, { ethers } from 'hardhat';
import { activateMainnetFork } from './utils/mainnet-fork';
import { DnGmxJuniorVault, TransparentUpgradeableProxy } from '../typechain-types';

describe('Claim GLP to Multisig as WBTC', () => {
  before(async () => {
    await activateMainnetFork({
      network: 'arbitrum-mainnet',
      blockNumber: 385636799,
    });
  });

  it('upgrades to deployed implementation and claims GLP as WBTC to multisig', async () => {
    const proxyAdmin = '0x90066f5EeABd197433411E8dEc935a2d28BC28De';
    const owner = '0xee2A909e3382cdF45a0d391202Aff3fb11956Ad1';
    const juniorVaultProxy = '0x8478AB5064EbAC770DdCE77E7D31D969205F041E';
    const wbtcTokenAddress = '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f'; // WBTC on Arbitrum
    const fsGlpAddress = '0x1aDDD80E6039594eE970E5872D247bf0414C8903'; // fsGLP (staked GLP tracker)
    const multisigAddress = '0xee2A909e3382cdF45a0d391202Aff3fb11956Ad1';

    // Use the already deployed implementation
    const newVaultLogicAddress = '0xff133d39Cc5E83295F91AF83d7c0217C51c112E3';

    // Impersonate accounts
    await hre.network.provider.request({
      method: 'hardhat_impersonateAccount',
      params: [proxyAdmin],
    });
    await hre.network.provider.request({
      method: 'hardhat_impersonateAccount',
      params: [owner],
    });

    const proxyAdminSigner = await hre.ethers.getSigner(proxyAdmin);
    const ownerSigner = await hre.ethers.getSigner(owner);

    // Get contract instances
    const vaultWithLogicAbi = (await hre.ethers.getContractAt(
      'DnGmxJuniorVault',
      juniorVaultProxy,
    )) as DnGmxJuniorVault;

    const vaultWithProxyAbi = (await hre.ethers.getContractAt(
      'TransparentUpgradeableProxy',
      juniorVaultProxy,
    )) as TransparentUpgradeableProxy;

    console.log('📝 Using deployed implementation at:', newVaultLogicAddress);

    // Get previous implementation
    const prevImpl = await vaultWithProxyAbi.connect(proxyAdminSigner).callStatic.implementation();
    console.log('📝 Previous implementation:', prevImpl);

    // Upgrade to new implementation
    console.log('📝 Upgrading proxy to new implementation...');
    await vaultWithProxyAbi.connect(proxyAdminSigner).upgradeTo(newVaultLogicAddress);
    const postImpl = await vaultWithProxyAbi.connect(proxyAdminSigner).callStatic.implementation();

    console.log('✅ Upgraded to:', postImpl);

    // Verify upgrade worked correctly
    if (postImpl.toLowerCase() !== newVaultLogicAddress.toLowerCase()) {
      console.log('postImpl', postImpl);
      console.log('newVaultLogicAddress', newVaultLogicAddress);
      throw new Error('postImpl does not match newVaultLogicAddress');
    }

    // Get token contracts
    const wbtcToken = await ethers.getContractAt(
      '@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20',
      wbtcTokenAddress,
    );
    const fsGlpToken = await ethers.getContractAt(
      '@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20',
      fsGlpAddress,
    );

    // Check balances BEFORE
    const vaultGlpBalanceBefore = await fsGlpToken.balanceOf(juniorVaultProxy);
    const vaultWbtcBalanceBefore = await wbtcToken.balanceOf(juniorVaultProxy);
    const multisigWbtcBalanceBefore = await wbtcToken.balanceOf(multisigAddress);

    console.log('\n📊 Balances BEFORE claimGlpToMultisig:');
    console.log(`   Vault fsGLP balance: ${ethers.utils.formatUnits(vaultGlpBalanceBefore, 18)} fsGLP`);
    console.log(`   Vault WBTC balance: ${ethers.utils.formatUnits(vaultWbtcBalanceBefore, 8)} WBTC`);
    console.log(`   Multisig WBTC balance: ${ethers.utils.formatUnits(multisigWbtcBalanceBefore, 8)} WBTC`);
    console.log('--------------------------------');

    // Verify vault has GLP before claiming
    if (vaultGlpBalanceBefore.eq(0)) {
      console.log('⚠️  WARNING: Vault has 0 fsGLP balance. Test may not be meaningful.');
    }

    // Call claimGlpToMultisig
    console.log('\n📝 Calling claimGlpToMultisig...');
    const tx = await vaultWithLogicAbi.connect(ownerSigner).claimGlpToMultisig();
    await tx.wait();
    console.log('✅ claimGlpToMultisig executed successfully');

    // Check balances AFTER
    const vaultGlpBalanceAfter = await fsGlpToken.balanceOf(juniorVaultProxy);
    const vaultWbtcBalanceAfter = await wbtcToken.balanceOf(juniorVaultProxy);
    const multisigWbtcBalanceAfter = await wbtcToken.balanceOf(multisigAddress);

    console.log('\n📊 Balances AFTER claimGlpToMultisig:');
    console.log(`   Vault fsGLP balance: ${ethers.utils.formatUnits(vaultGlpBalanceAfter, 18)} fsGLP`);
    console.log(`   Vault WBTC balance: ${ethers.utils.formatUnits(vaultWbtcBalanceAfter, 8)} WBTC`);
    console.log(`   Multisig WBTC balance: ${ethers.utils.formatUnits(multisigWbtcBalanceAfter, 8)} WBTC`);
    console.log('--------------------------------');

    const wbtcReceived = multisigWbtcBalanceAfter.sub(multisigWbtcBalanceBefore);
    console.log(`\n💰 WBTC received by multisig: ${ethers.utils.formatUnits(wbtcReceived, 8)} WBTC`);

    // Verify results
    if (!vaultGlpBalanceAfter.eq(0)) {
      throw new Error(`Vault should have 0 fsGLP after claiming, but has ${vaultGlpBalanceAfter}`);
    }

    // Only check WBTC received if vault had GLP to begin with
    if (vaultGlpBalanceBefore.gt(0)) {
      if (!wbtcReceived.gt(0)) {
        throw new Error(`Multisig should have received WBTC, but received ${wbtcReceived}`);
      }
      console.log('✅ All assertions passed!');
    } else {
      console.log('⚠️  Vault had no GLP, so no WBTC was transferred');
    }
  });
});
