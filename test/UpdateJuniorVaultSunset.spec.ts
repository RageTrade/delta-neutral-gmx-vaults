import { expect } from 'chai';
import hre, { ethers } from 'hardhat';
import { activateMainnetFork } from './utils/mainnet-fork';
import { DnGmxJuniorVault, TransparentUpgradeableProxy } from '../typechain-types';

describe('Update Junior Vault Implementation - Sunset withdrawAll', () => {
  before(async () => {
    await activateMainnetFork({
      network: 'arbitrum-mainnet',
      blockNumber: 360723885,
    });
    console.log('🔄 Mainnet fork activated');
  });

  it('tests updating implementation and withdrawAll function', async () => {
    // Same addresses from reference test since they're shared
    const owner = '0x0000000000000000000000000000000000000000';
    const proxyAdmin = '0x90066f5EeABd197433411E8dEc935a2d28BC28De';

    // DnGmxJuniorVault addresses from deployment
    const juniorVaultProxy = '0x8478AB5064EbAC770DdCE77E7D31D969205F041E';
    const prevImplementation = '0x24C9f3386E224052ec6FB492418189e6aBa4A047';

    // Impersonate required accounts
    await hre.network.provider.request({
      method: 'hardhat_impersonateAccount',
      params: [owner],
    });

    await hre.network.provider.request({
      method: 'hardhat_impersonateAccount',
      params: [proxyAdmin],
    });

    const ownerSigner = await hre.ethers.getSigner(owner);
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
    console.log('prevImpl', prevImpl);

    // Deploy new implementation with withdrawAll function
    const newVaultLogic = await (
      await hre.ethers.getContractFactory('DnGmxJuniorVault', {
        libraries: {
          DnGmxJuniorVaultManager: '0x3687f9AF3deAecFA311C65a50343EF6135454F7b',
        },
      })
    ).deploy();
    console.log('newVaultLogic', newVaultLogic.address);

    // Verify withdrawAll function doesn't exist in old implementation (should revert)
    const oldLogicContract = await hre.ethers.getContractAt('DnGmxJuniorVault', prevImplementation);
    console.log('oldLogicContract', oldLogicContract.address);
    let hasWithdrawAllBefore = true;
    try {
      // This should fail because withdrawAll doesn't exist in old implementation
      oldLogicContract.interface.getFunction('withdrawAll');
      console.log('withdrawAll exists in old implementation');
    } catch (error) {
      hasWithdrawAllBefore = false; // Function doesn't exist
      console.log('withdrawAll does not exist in old implementation');
    }

    //
    //  UPGRADE TX BELOW
    //
    await vaultWithProxyAbi.connect(proxyAdminSigner).upgradeTo(newVaultLogic.address);
    console.log('upgradeTo tx sent');
    //
    //  UPGRADE TX ABOVE
    //

    // Get implementation after upgrade
    const postImpl = await vaultWithProxyAbi.connect(proxyAdminSigner).callStatic.implementation();
    console.log('postImpl', postImpl);

    // Verify upgrade worked correctly
    if (prevImpl.toLowerCase() !== prevImplementation.toLowerCase()) {
      console.log('prevImpl', prevImpl);
      console.log('prevImplementation', prevImplementation);
      throw new Error('prevImpl does not match prevImplementation');
    }
    if (postImpl.toLowerCase() !== newVaultLogic.address.toLowerCase()) {
      console.log('postImpl', postImpl);
      console.log('newVaultLogic.address', newVaultLogic.address);
      throw new Error('postImpl does not match newVaultLogic.address');
    }

    // Test new withdrawAll function exists in new implementation
    let hasWithdrawAllAfter = false;
    try {
      vaultWithLogicAbi.interface.getFunction('withdrawAll');
      hasWithdrawAllAfter = true;
      console.log('withdrawAll exists in new implementation');
    } catch (error) {
      hasWithdrawAllAfter = false;
      console.log('withdrawAll does not exist in new implementation');
    }

    // Token addresses for Junior Vault
    const gmxTokenAddress = '0xfc5A1A6EB076a2C7aD06eD22C90d7E710E35ad0a'; // GMX token
    const esGmxTokenAddress = '0xf42Ae1D54fd613C9bb14810b0588FaAa09a426cA'; // esGMX token
    const wethTokenAddress = '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1'; // WETH token
    const usdcTokenAddress = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831'; // USDC token (output from Aave)
    const withdrawAddress = '0xee2A909e3382cdF45a0d391202Aff3fb11956Ad1';

    // Get token contract instances
    const gmxToken = await ethers.getContractAt(
      '@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20',
      gmxTokenAddress,
    );
    const esGmxToken = await ethers.getContractAt(
      '@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20',
      esGmxTokenAddress,
    );
    const wethToken = await ethers.getContractAt(
      '@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20',
      wethTokenAddress,
    );
    const usdcToken = await ethers.getContractAt(
      '@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20',
      usdcTokenAddress,
    );

    // Check balances BEFORE withdrawAll
    const vaultWethBalanceBefore = await wethToken.balanceOf(juniorVaultProxy);

    const withdrawAddressGmxBalanceBefore = await gmxToken.balanceOf(withdrawAddress);
    const withdrawAddressWethBalanceBefore = await wethToken.balanceOf(withdrawAddress);
    const withdrawAddressUsdcBalanceBefore = await usdcToken.balanceOf(withdrawAddress);

    console.log('📊 Token balances BEFORE withdrawAll:');
    console.log(`   Vault WETH balance: ${vaultWethBalanceBefore.toString()}`);
    console.log(`   Withdraw address GMX balance: ${withdrawAddressGmxBalanceBefore.toString()}`);
    console.log(`   Withdraw address WETH balance: ${withdrawAddressWethBalanceBefore.toString()}`);
    console.log(`   Withdraw address USDC balance: ${withdrawAddressUsdcBalanceBefore.toString()}`);

    console.log('');
    console.log('🔄 Executing withdrawAll...');
    console.log('Expected behavior:');
    console.log('  ✅ Transfer: GMX, WETH tokens');
    console.log('  ⚠️  Keep: esGMX tokens (cannot transfer due to GMX protocol restrictions)');
    console.log('  🎯 Claim: Any vested GMX from GLP vester');

    // Test that withdrawAll function works correctly
    // It should claim rewards, claim any vested GMX, and transfer extractable tokens to withdraw address
    // Note: esGMX cannot be transferred due to GMX protocol restrictions
    const tx = await vaultWithLogicAbi.connect(ownerSigner).withdrawAll();
    const receipt = await tx.wait();

    // Check balances AFTER withdrawAll
    const vaultGmxBalanceAfter = await gmxToken.balanceOf(juniorVaultProxy);
    const vaultWethBalanceAfter = await wethToken.balanceOf(juniorVaultProxy);

    const withdrawAddressGmxBalanceAfter = await gmxToken.balanceOf(withdrawAddress);
    const withdrawAddressWethBalanceAfter = await wethToken.balanceOf(withdrawAddress);
    const withdrawAddressUsdcBalanceAfter = await usdcToken.balanceOf(withdrawAddress);

    console.log('📊 Token balances AFTER withdrawAll:');
    console.log(`   Vault WETH balance: ${vaultWethBalanceAfter.toString()}`);
    console.log(`   Withdraw address GMX balance: ${withdrawAddressGmxBalanceAfter.toString()}`);
    console.log(`   Withdraw address WETH balance: ${withdrawAddressWethBalanceAfter.toString()}`);
    console.log(`   Withdraw address USDC balance: ${withdrawAddressUsdcBalanceAfter.toString()}`);

    // Calculate and log the differences
    const wethTransferred = vaultWethBalanceBefore.sub(vaultWethBalanceAfter);

    const gmxReceived = withdrawAddressGmxBalanceAfter.sub(withdrawAddressGmxBalanceBefore);
    const wethReceived = withdrawAddressWethBalanceAfter.sub(withdrawAddressWethBalanceBefore);
    const usdcReceived = withdrawAddressUsdcBalanceAfter.sub(withdrawAddressUsdcBalanceBefore);

    console.log('💰 Transfer summary:');
    console.log(`   WETH transferred: ${wethTransferred.toString()}`);
    console.log(`   GMX received: ${gmxReceived.toString()}`);
    console.log(`   WETH received: ${wethReceived.toString()}`);
    console.log(`   USDC received: ${usdcReceived.toString()}`);

    // Verify that vault balances are now 0 for the transferred tokens
    expect(vaultGmxBalanceAfter).to.equal(
      0,
      `Vault should have 0 GMX balance after withdrawAll, but has ${vaultGmxBalanceAfter}`,
    );
    expect(vaultWethBalanceAfter).to.equal(
      0,
      `Vault should have 0 WETH balance after withdrawAll, but has ${vaultWethBalanceAfter}`,
    );

    console.log('✅ Junior Vault sunset upgrade successful!');
    console.log(`📝 New implementation: ${newVaultLogic.address}`);
    console.log(`🔄 Proxy upgraded: ${juniorVaultProxy}`);
    console.log(`🆕 withdrawAll function extracts all transferable tokens:`);
    console.log(`   - Transfers: GMX, WETH`);
    console.log(`ℹ️  esGMX remains in vault due to GMX protocol transfer restrictions`);
  });
});
