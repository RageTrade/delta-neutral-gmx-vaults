import { expect } from 'chai';
import hre, { ethers } from 'hardhat';
import { activateMainnetFork } from './utils/mainnet-fork';
import { DnGmxJuniorVault, IRewardRouterV2, TransparentUpgradeableProxy } from '../typechain-types';

describe('Update Junior Vault Implementation - Sunset withdrawToMultisig', () => {
  before(async () => {
    await activateMainnetFork({
      network: 'arbitrum-mainnet',
      blockNumber: 362807054, // block where the implementation was deployed +2 blocks
    });
  });

  it('tests updating implementation and withdrawToMultisig function', async () => {
    // Same addresses from reference test since they're shared
    const proxyAdmin = '0x90066f5EeABd197433411E8dEc935a2d28BC28De';
    const owner = '0xee2A909e3382cdF45a0d391202Aff3fb11956Ad1';

    // DnGmxJuniorVault addresses from deployment
    const juniorVaultProxy = '0x8478AB5064EbAC770DdCE77E7D31D969205F041E';
    const prevImplementation = '0x24C9f3386E224052ec6FB492418189e6aBa4A047';

    // Impersonate required accounts
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

    // Get current implementation before upgrade
    const prevImpl = await vaultWithProxyAbi.connect(proxyAdminSigner).callStatic.implementation();

    // Use existing deployed implementation with withdrawToMultisig function
    const newVaultLogicAddress = '0xa121D6e494ce7505863AfBd5Ed865681476B4164';

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
    const bnGmxAddress = '0x35247165119B69A40edD5304969560D0ef486921'; // BN-GMX token
    const esGmxAddress = '0xf42Ae1D54fd613C9bb14810b0588FaAa09a426cA'; // es-GMX token
    const gmxDaoAddress = '0x2A29D3a792000750807cc401806d6fd539928481'; // GMX DAO token
    const sbfGmxAddress = '0xd2D1162512F927a7e282Ef43a362659E4F2a728F'; // sbf-GMX token

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
    const bnGmxToken = await ethers.getContractAt(
      '@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20',
      bnGmxAddress,
    );
    const esGmxToken = await ethers.getContractAt(
      '@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20',
      esGmxAddress,
    );
    const gmxDaoToken = await ethers.getContractAt(
      '@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20',
      gmxDaoAddress,
    );
    const sbfGmxToken = await ethers.getContractAt(
      '@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20',
      sbfGmxAddress,
    );

    // Check balances BEFORE withdrawToMultisig
    const vaultWethBalanceBefore = await wethToken.balanceOf(juniorVaultProxy);
    const vaultGmxBalanceBefore = await gmxToken.balanceOf(juniorVaultProxy);
    const vaultBnGmxBalanceBefore = await bnGmxToken.balanceOf(juniorVaultProxy);
    const vaultEsGmxBalanceBefore = await esGmxToken.balanceOf(juniorVaultProxy);
    const vaultGmxDaoBalanceBefore = await gmxDaoToken.balanceOf(juniorVaultProxy);
    const vaultSbfGmxBalanceBefore = await sbfGmxToken.balanceOf(juniorVaultProxy);

    const withdrawAddressGmxBalanceBefore = await gmxToken.balanceOf(withdrawAddress);
    const withdrawAddressBnGmxBalanceBefore = await bnGmxToken.balanceOf(withdrawAddress);
    const withdrawAddressEsGmxBalanceBefore = await esGmxToken.balanceOf(withdrawAddress);
    const withdrawAddressGmxDaoBalanceBefore = await gmxDaoToken.balanceOf(withdrawAddress);
    const withdrawAddressSbfGmxBalanceBefore = await sbfGmxToken.balanceOf(withdrawAddress);
    const withdrawAddressWethBalanceBefore = await wethToken.balanceOf(withdrawAddress);

    console.log('📊 Token balances BEFORE withdrawToMultisig:');
    console.log(`   Vault WETH balance: ${vaultWethBalanceBefore.toString()}`);
    console.log(`   Vault GMX balance: ${vaultGmxBalanceBefore.toString()}`);
    console.log(`   Vault BN-GMX balance: ${vaultBnGmxBalanceBefore.toString()}`);
    console.log(`   Vault es-GMX balance: ${vaultEsGmxBalanceBefore.toString()}`);
    console.log(`   Vault GMX DAO balance: ${vaultGmxDaoBalanceBefore.toString()}`);
    console.log(`   Vault sbf-GMX balance: ${vaultSbfGmxBalanceBefore.toString()}`);
    console.log(`   Withdraw address GMX balance: ${withdrawAddressGmxBalanceBefore.toString()}`);
    console.log(`   Withdraw address WETH balance: ${withdrawAddressWethBalanceBefore.toString()}`);
    console.log(`   Withdraw address BN-GMX balance: ${withdrawAddressBnGmxBalanceBefore.toString()}`);
    console.log(`   Withdraw address es-GMX balance: ${withdrawAddressEsGmxBalanceBefore.toString()}`);
    console.log(`   Withdraw address GMX DAO balance: ${withdrawAddressGmxDaoBalanceBefore.toString()}`);
    console.log(`   Withdraw address sbf-GMX balance: ${withdrawAddressSbfGmxBalanceBefore.toString()}`);
    console.log('--------------------------------\n');

    // Test that withdrawToMultisig function works correctly
    // It should claim rewards and transfer extractable tokens to withdraw address
    // Note: esGMX cannot be transferred due to GMX protocol restrictions
    const tx = await vaultWithLogicAbi.connect(ownerSigner).withdrawToMultisig();
    await tx.wait();

    // Check balances AFTER withdrawToMultisig
    const vaultGmxBalanceAfter = await gmxToken.balanceOf(juniorVaultProxy);
    const vaultBnGmxBalanceAfter = await bnGmxToken.balanceOf(juniorVaultProxy);
    const vaultEsGmxBalanceAfter = await esGmxToken.balanceOf(juniorVaultProxy);
    const vaultGmxDaoBalanceAfter = await gmxDaoToken.balanceOf(juniorVaultProxy);
    const vaultSbfGmxBalanceAfter = await sbfGmxToken.balanceOf(juniorVaultProxy);
    const vaultWethBalanceAfter = await wethToken.balanceOf(juniorVaultProxy);

    const withdrawAddressGmxBalanceAfter = await gmxToken.balanceOf(withdrawAddress);
    const withdrawAddressWethBalanceAfter = await wethToken.balanceOf(withdrawAddress);
    const withdrawAddressBnGmxBalanceAfter = await bnGmxToken.balanceOf(withdrawAddress);
    const withdrawAddressEsGmxBalanceAfter = await esGmxToken.balanceOf(withdrawAddress);
    const withdrawAddressGmxDaoBalanceAfter = await gmxDaoToken.balanceOf(withdrawAddress);
    const withdrawAddressSbfGmxBalanceAfter = await sbfGmxToken.balanceOf(withdrawAddress);

    console.log('📊 Token balances AFTER withdrawToMultisig:');
    console.log(`   Vault WETH balance: ${vaultWethBalanceAfter.toString()}`);
    console.log(`   Vault GMX balance: ${vaultGmxBalanceAfter.toString()}`);
    console.log(`   Vault BN-GMX balance: ${vaultBnGmxBalanceAfter.toString()}`);
    console.log(`   Vault es-GMX balance: ${vaultEsGmxBalanceAfter.toString()}`);
    console.log(`   Vault GMX DAO balance: ${vaultGmxDaoBalanceAfter.toString()}`);
    console.log(`   Vault sbf-GMX balance: ${vaultSbfGmxBalanceAfter.toString()}`);
    console.log(`   Withdraw address GMX balance: ${withdrawAddressGmxBalanceAfter.toString()}`);
    console.log(`   Withdraw address WETH balance: ${withdrawAddressWethBalanceAfter.toString()}`);
    console.log(`   Withdraw address BN-GMX balance: ${withdrawAddressBnGmxBalanceAfter.toString()}`);
    console.log(`   Withdraw address es-GMX balance: ${withdrawAddressEsGmxBalanceAfter.toString()}`);
    console.log(`   Withdraw address GMX DAO balance: ${withdrawAddressGmxDaoBalanceAfter.toString()}`);
    console.log(`   Withdraw address sbf-GMX balance: ${withdrawAddressSbfGmxBalanceAfter.toString()}`);
    console.log('--------------------------------\n');

    const gmxReceived = withdrawAddressGmxBalanceAfter.sub(withdrawAddressGmxBalanceBefore);
    const wethReceived = withdrawAddressWethBalanceAfter.sub(withdrawAddressWethBalanceBefore);
    const bnGmxReceived = withdrawAddressBnGmxBalanceAfter.sub(withdrawAddressBnGmxBalanceBefore);
    const esGmxReceived = withdrawAddressEsGmxBalanceAfter.sub(withdrawAddressEsGmxBalanceBefore);
    const gmxDaoReceived = withdrawAddressGmxDaoBalanceAfter.sub(withdrawAddressGmxDaoBalanceBefore);
    const sbfGmxReceived = withdrawAddressSbfGmxBalanceAfter.sub(withdrawAddressSbfGmxBalanceBefore);

    console.log('💰 Transfer summary for withdraw address:');
    console.log(`   GMX received: ${gmxReceived.toString()}`);
    console.log(`   WETH received: ${wethReceived.toString()}`);
    console.log(`   BN-GMX received: ${bnGmxReceived.toString()}`);
    console.log(`   es-GMX received: ${esGmxReceived.toString()}`);
    console.log(`   GMX DAO received: ${gmxDaoReceived.toString()}`);
    console.log(`   sbf-GMX received: ${sbfGmxReceived.toString()}`);
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
  });
});
