import { impersonateAccount, reset } from '@nomicfoundation/hardhat-network-helpers';
import { deltaNeutralGmxVaults, tokens } from '@ragetrade/sdk';
import { Signer } from 'ethers';
import hre from 'hardhat';
import { DnGmxJuniorVault__factory } from '../typechain-types';
import { arb } from './utils/arb';

describe('Improve slippage', () => {
  it('check', async () => {
    await reset(hre.config.networks.hardhat.forking?.url, 68786823);

    // real mainnet contract instances
    const { dnGmxJuniorVault: _dnGmxJuniorVault, proxyAdmin } = deltaNeutralGmxVaults.getContractsSync(
      'arbmain',
      hre.ethers.provider,
    );
    const { weth, usdc } = tokens.getContractsSync('arbmain', hre.ethers.provider);

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
        35,
        45,
        st.usdcConversionThreshold,
        st.wethConversionThreshold,
        st.hedgeUsdcAmountThreshold,
        st.partialBtcHedgeUsdcAmountThreshold,
        st.partialEthHedgeUsdcAmountThreshold,
      );

    await dnGmxJuniorVault.connect(owner).setDirectConversion(false);

    const keeper = await impersonate(ap.keeper);

    const signers = await hre.ethers.getSigners();

    await dnGmxJuniorVault.connect(owner).rebalanceProfit();

    console.log('rebalance profit done');
    await arb(signers[0], weth.address, usdc.address, 500, true);

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
