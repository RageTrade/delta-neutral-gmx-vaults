import { parseUnits } from 'ethers/lib/utils';
import { deployments } from 'hardhat';
import addresses from './addresses';

export const dnGmxSeniorVaultFixture = deployments.createFixture(async hre => {
  const dnGmxSeniorVault = await (await hre.ethers.getContractFactory('DnGmxSeniorVaultMock')).deploy();

  await dnGmxSeniorVault.initialize(
    addresses.USDC, // _usdc
    'Delta Netural GMX Vault (Senior)', // name
    'DN_GMX_SENIOR', // symbol
    addresses.AAVE_POOL_ADDRESS_PROVIDER,
  );

  await dnGmxSeniorVault.grantAllowances();

  await dnGmxSeniorVault.setDepositCap(parseUnits('1000000', 6));

  return dnGmxSeniorVault;
});
