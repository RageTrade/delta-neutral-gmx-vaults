import { expect } from 'chai';
import hre, { ethers } from 'hardhat';
import { activateMainnetFork } from './utils/mainnet-fork';
import { DnGmxJuniorVault, TransparentUpgradeableProxy } from '../typechain-types';

describe('Update Junior Vault Implementation - Sunset withdrawToMultisig', () => {
  before(async () => {
    await activateMainnetFork({
      network: 'arbitrum-mainnet',
      blockNumber: 361418349, // block where the implementation was deployed +2 blocks
    });
  });

  it('tests updating implementation and withdrawToMultisig function', async () => {
    // Same addresses from reference test since they're shared
    const proxyAdmin = '0x90066f5EeABd197433411E8dEc935a2d28BC28De';

    // DnGmxJuniorVault addresses from deployment
    const juniorVaultProxy = '0x8478AB5064EbAC770DdCE77E7D31D969205F041E';
    const prevImplementation = '0x24C9f3386E224052ec6FB492418189e6aBa4A047';

    // Impersonate required accounts
    await hre.network.provider.request({
      method: 'hardhat_impersonateAccount',
      params: [proxyAdmin],
    });

    const proxyAdminSigner = await hre.ethers.getSigner(proxyAdmin);

    // Get contract instances
    const vaultWithLogicAbi = (await hre.ethers.getContractAt(
      'DnGmxJuniorVault',
      juniorVaultProxy,
    )) as DnGmxJuniorVault;

    const vaultWithProxyAbi = (await hre.ethers.getContractAt(
      'TransparentUpgradeableProxy',
      juniorVaultProxy,
    )) as TransparentUpgradeableProxy;

    // Get current implementation before upgrade
    const prevImpl = await vaultWithProxyAbi.connect(proxyAdminSigner).callStatic.implementation();

    // Use existing deployed implementation with withdrawToMultisig function
    const newVaultLogicAddress = '0x2A51A3eD31D1d7cbbBA161A13FECE40B0c123050';

    //
    //  UPGRADE TX BELOW
    //
    await vaultWithProxyAbi.connect(proxyAdminSigner).upgradeTo(newVaultLogicAddress);
    //
    //  UPGRADE TX ABOVE
    //

    // Get implementation after upgrade
    const postImpl = await vaultWithProxyAbi.connect(proxyAdminSigner).callStatic.implementation();

    // Verify upgrade worked correctly
    if (prevImpl.toLowerCase() !== prevImplementation.toLowerCase()) {
      console.log('prevImpl', prevImpl);
      console.log('prevImplementation', prevImplementation);
      throw new Error('prevImpl does not match prevImplementation');
    }
    if (postImpl.toLowerCase() !== newVaultLogicAddress.toLowerCase()) {
      console.log('postImpl', postImpl);
      console.log('newVaultLogicAddress', newVaultLogicAddress);
      throw new Error('postImpl does not match newVaultLogicAddress');
    }

    // Token addresses for Junior Vault
    const gmxTokenAddress = '0xfc5A1A6EB076a2C7aD06eD22C90d7E710E35ad0a'; // GMX token
    const wethTokenAddress = '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1'; // WETH token
    const withdrawAddress = '0xee2A909e3382cdF45a0d391202Aff3fb11956Ad1';

    // Get token contract instances
    const gmxToken = await ethers.getContractAt(
      '@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20',
      gmxTokenAddress,
    );
    const wethToken = await ethers.getContractAt(
      '@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20',
      wethTokenAddress,
    );

    // Check balances BEFORE withdrawToMultisig
    const vaultWethBalanceBefore = await wethToken.balanceOf(juniorVaultProxy);

    const withdrawAddressGmxBalanceBefore = await gmxToken.balanceOf(withdrawAddress);
    const withdrawAddressWethBalanceBefore = await wethToken.balanceOf(withdrawAddress);

    console.log('📊 Token balances BEFORE withdrawToMultisig:');
    console.log(`   Vault WETH balance: ${vaultWethBalanceBefore.toString()}`);
    console.log(`   Withdraw address GMX balance: ${withdrawAddressGmxBalanceBefore.toString()}`);
    console.log(`   Withdraw address WETH balance: ${withdrawAddressWethBalanceBefore.toString()}`);
    console.log('--------------------------------\n');

    // Test that withdrawToMultisig function works correctly
    // It should claim rewards and transfer extractable tokens to withdraw address
    // Note: esGMX cannot be transferred due to GMX protocol restrictions
    const tx = await vaultWithLogicAbi.withdrawToMultisig();
    await tx.wait();

    // Check balances AFTER withdrawToMultisig
    const vaultGmxBalanceAfter = await gmxToken.balanceOf(juniorVaultProxy);
    const vaultWethBalanceAfter = await wethToken.balanceOf(juniorVaultProxy);

    const withdrawAddressGmxBalanceAfter = await gmxToken.balanceOf(withdrawAddress);
    const withdrawAddressWethBalanceAfter = await wethToken.balanceOf(withdrawAddress);

    console.log('📊 Token balances AFTER withdrawToMultisig:');
    console.log(`   Vault WETH balance: ${vaultWethBalanceAfter.toString()}`);
    console.log(`   Withdraw address GMX balance: ${withdrawAddressGmxBalanceAfter.toString()}`);
    console.log(`   Withdraw address WETH balance: ${withdrawAddressWethBalanceAfter.toString()}`);
    console.log('--------------------------------\n');

    const gmxReceived = withdrawAddressGmxBalanceAfter.sub(withdrawAddressGmxBalanceBefore);
    const wethReceived = withdrawAddressWethBalanceAfter.sub(withdrawAddressWethBalanceBefore);

    console.log('💰 Transfer summary:');
    console.log(`   GMX received: ${gmxReceived.toString()}`);
    console.log(`   WETH received: ${wethReceived.toString()}`);
    console.log('--------------------------------\n');

    // Verify that vault balances are now 0 for the transferred tokens
    expect(vaultGmxBalanceAfter).to.equal(
      0,
      `Vault should have 0 GMX balance after withdrawToMultisig, but has ${vaultGmxBalanceAfter}`,
    );
    expect(vaultWethBalanceAfter).to.equal(
      0,
      `Vault should have 0 WETH balance after withdrawToMultisig, but has ${vaultWethBalanceAfter}`,
    );

    console.log('✅ Junior Vault sunset upgrade successful!');
    console.log(`📝 New implementation: ${newVaultLogicAddress}`);
    console.log(`🔄 Proxy upgraded: ${juniorVaultProxy}`);
    console.log(`🆕 withdrawToMultisig function extracts all transferable tokens:`);
    console.log(`   - Transfers: GMX, WETH`);
    console.log(`ℹ️  esGMX remains in vault due to GMX protocol transfer restrictions`);
  });
});
