import hre from 'hardhat';
import { expect } from 'chai';
import { formatUnits } from 'ethers/lib/utils';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';

describe('Sunset Again', () => {
  it.only('check', async () => {
    const ownerAddress = '0xee2A909e3382cdF45a0d391202Aff3fb11956Ad1';
    const proxyAdminAddress = '0x90066f5EeABd197433411E8dEc935a2d28BC28De';
    const dnGmxJuniorVaultAddress = '0x8478AB5064EbAC770DdCE77E7D31D969205F041E';
    const dnGmxJuniorVaultManagerAddress = '0x67d1ab726403935814ea0e3a0364bb739810f5d4';

    const juniorLpAddress = '0xd915C1a7DBfBa962DA395087620345714df8Ae5C';
    const otherJuniorLPAddress = '0xd00612c9718324bdfb443e84660940dffbc8e665';

    const newRewardRouterAddress = '0x159854e14A862Df9E39E1D128b8e5F70B4A3cE9B';
    const newMintBurnRouterAddress = '0xB95DB5B167D75e6d04227CfFFA61069348d271F5';

    const impersonatedOwner = await impersonateAccount(ownerAddress);
    const impersonatedJuniorLP = await impersonateAccount(juniorLpAddress);
    const impersonatedOtherJuniorLP = await impersonateAccount(otherJuniorLPAddress);

    const proxyAdmin = await hre.ethers.getContractAt('ProxyAdmin', proxyAdminAddress, impersonatedOwner);
    const dnGmxJuniorVault = await hre.ethers.getContractAt(
      'DnGmxJuniorVault',
      dnGmxJuniorVaultAddress,
      impersonatedJuniorLP,
    );

    console.log('total mkt val before', formatUnits(await dnGmxJuniorVault.getVaultMarketValue(), 6));

    await expect(
      dnGmxJuniorVault.redeem(dnGmxJuniorVault.balanceOf(juniorLpAddress), juniorLpAddress, juniorLpAddress),
    ).to.be.revertedWith('RewardTracker: forbidden');
    console.log('revert before upgrade #1');

    await expect(
      dnGmxJuniorVault
        .connect(impersonatedOtherJuniorLP)
        .redeem(dnGmxJuniorVault.balanceOf(otherJuniorLPAddress), otherJuniorLPAddress, otherJuniorLPAddress),
    ).to.be.revertedWith('RewardTracker: forbidden');
    console.log('revert before upgrade #2');

    const dnGmxJuniorVaultNewLogic = await hre.ethers.deployContract('DnGmxJuniorVault', {
      libraries: {
        DnGmxJuniorVaultManager: dnGmxJuniorVaultManagerAddress,
      },
    });
    console.log('deploy new logic');

    await proxyAdmin.upgrade(dnGmxJuniorVaultAddress, dnGmxJuniorVaultNewLogic.address);
    console.log('upgraded');

    await dnGmxJuniorVault.connect(impersonatedOwner).setRouters(newRewardRouterAddress, newMintBurnRouterAddress);
    console.log('set routers');

    await dnGmxJuniorVault.redeem(dnGmxJuniorVault.balanceOf(juniorLpAddress), juniorLpAddress, juniorLpAddress);
    console.log('sucess after update #1');

    await dnGmxJuniorVault
      .connect(impersonatedOtherJuniorLP)
      .redeem(dnGmxJuniorVault.balanceOf(otherJuniorLPAddress), otherJuniorLPAddress, otherJuniorLPAddress);
    console.log('sucess after update #2');

    expect(await dnGmxJuniorVault.balanceOf(juniorLpAddress)).to.be.eq(0);
    expect(await dnGmxJuniorVault.balanceOf(otherJuniorLPAddress)).to.be.eq(0);
    console.log('balances checks out');

    console.log();

    console.log('total mkt val after', formatUnits(await dnGmxJuniorVault.getVaultMarketValue(), 6));
  });
});

async function impersonateAccount(address: string): Promise<SignerWithAddress> {
  // Impersonate the specified address
  await hre.network.provider.request({
    method: 'hardhat_impersonateAccount',
    params: [address],
  });

  return hre.ethers.getSigner(address);
}
