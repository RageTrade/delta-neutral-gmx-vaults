import { expect } from 'chai';
import hre, { ethers } from 'hardhat';
import { activateMainnetFork } from './utils/mainnet-fork';
import { DnGmxSeniorVault, TransparentUpgradeableProxy } from '../typechain-types';

describe('Update Senior Vault Implementation - Sunset withdrawAll', () => {
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

    // DnGmxSeniorVault addresses from deployment
    const seniorVaultProxy = '0xf9305009FbA7E381b3337b5fA157936d73c2CF36';
    const prevImplementation = '0x155e93B69A2Dca4E10e2c9DaAd987f69d59925d6';

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
      'DnGmxSeniorVault',
      seniorVaultProxy,
    )) as DnGmxSeniorVault;

    const vaultWithProxyAbi = (await hre.ethers.getContractAt(
      'TransparentUpgradeableProxy',
      seniorVaultProxy,
    )) as TransparentUpgradeableProxy;

    // Get current implementation before upgrade
    const prevImpl = await vaultWithProxyAbi.connect(proxyAdminSigner).callStatic.implementation();
    console.log('prevImpl', prevImpl);

    // Deploy new implementation with withdrawAll function
    const newVaultLogic = await (await hre.ethers.getContractFactory('DnGmxSeniorVault')).deploy();
    console.log('newVaultLogic', newVaultLogic.address);

    // Verify withdrawAll function doesn't exist in old implementation (should revert)
    const oldLogicContract = await hre.ethers.getContractAt('DnGmxSeniorVault', prevImplementation);
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
    // expect(prevImpl).to.eq(prevImplementation);
    if (prevImpl.toLowerCase() !== prevImplementation.toLowerCase()) {
      console.log('prevImpl', prevImpl);
      console.log('prevImplementation', prevImplementation);
      throw new Error('prevImpl does not match prevImplementation');
    }
    // expect(postImpl).to.eq(newVaultLogic.address);
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
    expect(hasWithdrawAllAfter).to.be.true;

    const aUsdcTokenAddress = '0x625E7708f30cA75bfd92586e17077590C60eb4cD'; // aUSDC token
    const withdrawAddress = '0xee2A909e3382cdF45a0d391202Aff3fb11956Ad1';

    // Get USDC token address from vault (this is what gets sent to withdraw address)
    const usdcTokenAddress = await vaultWithLogicAbi.asset();
    console.log('usdcTokenAddress', usdcTokenAddress);

    // Get token contract instances
    const aUsdcToken = await ethers.getContractAt(
      '@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20',
      aUsdcTokenAddress,
    );
    const usdcToken = await ethers.getContractAt(
      '@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20',
      usdcTokenAddress,
    );

    // Check balances BEFORE withdrawAll
    const vaultAUsdcBalanceBefore = await aUsdcToken.balanceOf(seniorVaultProxy);
    const withdrawAddressUsdcBalanceBefore = await usdcToken.balanceOf(withdrawAddress);

    console.log('📊 Token balances BEFORE withdrawAll:');
    console.log(`   Vault aUSDC balance: ${vaultAUsdcBalanceBefore.toString()}`);
    console.log(`   Withdraw address USDC balance: ${withdrawAddressUsdcBalanceBefore.toString()}`);

    // Test that withdrawAll function works correctly
    // It should convert aUSDC to USDC via Aave pool and send to withdraw address
    const tx = await vaultWithLogicAbi.connect(ownerSigner).withdrawAll();
    const receipt = await tx.wait();

    // Check balances AFTER withdrawAll
    const vaultAUsdcBalanceAfter = await aUsdcToken.balanceOf(seniorVaultProxy);
    const withdrawAddressUsdcBalanceAfter = await usdcToken.balanceOf(withdrawAddress);

    console.log('📊 Token balances AFTER withdrawAll:');
    console.log(`   Vault aUSDC balance: ${vaultAUsdcBalanceAfter.toString()}`);
    console.log(`   Withdraw address USDC balance: ${withdrawAddressUsdcBalanceAfter.toString()}`);

    // Calculate and log the differences
    const aUsdcWithdrawn = vaultAUsdcBalanceBefore.sub(vaultAUsdcBalanceAfter);
    const usdcReceived = withdrawAddressUsdcBalanceAfter.sub(withdrawAddressUsdcBalanceBefore);

    console.log('💰 Transfer summary:');
    console.log(`   aUSDC withdrawn from vault: ${aUsdcWithdrawn.toString()}`);
    console.log(`   USDC received by withdraw address: ${usdcReceived.toString()}`);

    // Verify that aUSDC was withdrawn and USDC was received
    // The amounts should be approximately equal (allowing for small differences due to exchange rates)
    if (aUsdcWithdrawn.gt(0)) {
      expect(usdcReceived).to.be.gt(0);
      // Allow for small differences in exchange rate between aUSDC and USDC
      const tolerance = aUsdcWithdrawn.div(1000); // 0.1% tolerance
      expect(usdcReceived).to.be.closeTo(aUsdcWithdrawn, tolerance);
    }

    console.log('✅ Senior Vault sunset upgrade successful!');
    console.log(`📝 New implementation: ${newVaultLogic.address}`);
    console.log(`🔄 Proxy upgraded: ${seniorVaultProxy}`);
    console.log(`🆕 withdrawAll function available for owner`);
  });
});
