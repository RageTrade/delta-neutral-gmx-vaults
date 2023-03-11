import { impersonateAccount, reset } from '@nomicfoundation/hardhat-network-helpers';
import { deltaNeutralGmxVaults } from '@ragetrade/sdk';
import { Signer } from 'ethers';
import hre from 'hardhat';

describe('Improve slippage', () => {
  it('check', async () => {
    await reset(hre.config.networks.hardhat.forking?.url, 68786823);

    // real mainnet contract instances
    const { dnGmxJuniorVault, proxyAdmin } = deltaNeutralGmxVaults.getContractsSync('arbmain', hre.ethers.provider);

    // deploy implementation
    const dnGmxJuniorVaultManager = await hre.ethers.deployContract('DnGmxJuniorVaultManager');
    const dnGmxJuniorVaultNewLogic = await hre.ethers.deployContract('DnGmxJuniorVault', {
      libraries: {
        DnGmxJuniorVaultManager: dnGmxJuniorVaultManager.address,
      },
    });

    // upgrade
    const owner = await impersonate(proxyAdmin.owner());
    await proxyAdmin.connect(owner).upgrade(dnGmxJuniorVault.address, dnGmxJuniorVaultNewLogic.address);

    // rebalance
    const keeper = await impersonate((await dnGmxJuniorVault.getAdminParams()).keeper);
    const tx = await dnGmxJuniorVault.connect(keeper).rebalance();
    const rc = await tx.wait();
    const parsedLogs = rc.logs
      .map(log => {
        try {
          return [log, dnGmxJuniorVaultNewLogic.interface.parseLog(log)] as const;
        } catch {
          return null;
        }
      })
      .filter(e => {
        return e !== null && e;
      });
  });
});

async function impersonate(address: string | Promise<string>): Promise<Signer> {
  address = await address;
  await impersonateAccount(address);
  return hre.ethers.getSigner(address);
}
