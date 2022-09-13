import addresses from './addresses';
import { deployments } from 'hardhat';
import { parseUnits } from 'ethers/lib/utils';

export const aaveVaultFixture = deployments.createFixture(async hre => {
  const aaveVault = await (await hre.ethers.getContractFactory('AaveVaultMock')).deploy();

  await aaveVault.initialize(
    addresses.USDC, // _usdc
    'Aave LP Vault', // _name
    'Aave_LP', // _symbol
    addresses.AAVE_POOL_ADDRESS_PROVIDER,
  );

  await aaveVault.grantAllowances();

  return aaveVault;
});
