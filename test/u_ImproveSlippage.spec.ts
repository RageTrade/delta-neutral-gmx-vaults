import { impersonateAccount, reset } from '@nomicfoundation/hardhat-network-helpers';
import { deltaNeutralGmxVaults } from '@ragetrade/sdk';
import { Signer } from 'ethers';
import hre from 'hardhat';
import { DnGmxJuniorVault__factory } from '../typechain-types';

describe('Improve slippage', () => {
  it('check', async () => {
    await reset(hre.config.networks.hardhat.forking?.url, 68786823);

    // real mainnet contract instances
    const { dnGmxJuniorVault: _dnGmxJuniorVault, proxyAdmin } = deltaNeutralGmxVaults.getContractsSync(
      'arbmain',
      hre.ethers.provider,
    );

    // deploy implementation
    const dnGmxJuniorVaultManager = await hre.ethers.deployContract('DnGmxJuniorVaultManager');
    const dnGmxJuniorVaultNewLogic = await hre.ethers.deployContract('DnGmxJuniorVault', {
      libraries: {
        DnGmxJuniorVaultManager: dnGmxJuniorVaultManager.address,
      },
    });

    // upgrade
    const owner = await impersonate(proxyAdmin.owner());
    await proxyAdmin.connect(owner).upgrade(_dnGmxJuniorVault.address, dnGmxJuniorVaultNewLogic.address);

    // rebalance
    const dnGmxJuniorVault = DnGmxJuniorVault__factory.connect(_dnGmxJuniorVault.address, hre.ethers.provider);
    await dnGmxJuniorVault.connect(owner).setDirectConversion(false);

    const ap = await dnGmxJuniorVault.getAdminParams();
    const st = await dnGmxJuniorVault.getThresholds();

    console.log('st', st);

    await dnGmxJuniorVault
      .connect(owner)
      .setThresholds(
        st.slippageThresholdSwapBtcBps,
        50,
        50,
        st.usdcConversionThreshold,
        st.wethConversionThreshold,
        st.hedgeUsdcAmountThreshold,
        st.partialBtcHedgeUsdcAmountThreshold,
        st.partialEthHedgeUsdcAmountThreshold,
      );

    const keeper = await impersonate(ap.keeper);

    await dnGmxJuniorVault.connect(keeper).rebalanceProfit();

    console.log('rebalance profit done');

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
