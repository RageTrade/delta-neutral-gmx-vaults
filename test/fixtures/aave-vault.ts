import addresses from './addresses';
import { deployments } from 'hardhat';
import { parseUnits } from 'ethers/lib/utils';

export const dnGmxSeniorVaultFixture = deployments.createFixture(async hre => {
  const dnGmxSeniorVault = await (await hre.ethers.getContractFactory('DnGmxSeniorVaultMock')).deploy();

  await dnGmxSeniorVault.initialize(
    addresses.USDC, // _usdc
    'Aave LP Vault', // _name
    'Aave_LP', // _symbol
    addresses.AAVE_POOL_ADDRESS_PROVIDER,
  );

  await dnGmxSeniorVault.grantAllowances();

  await dnGmxSeniorVault.setDepositCap(parseUnits('1000000', 6));

  return dnGmxSeniorVault;
});
