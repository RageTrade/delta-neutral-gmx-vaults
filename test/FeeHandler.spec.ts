import { expect } from 'chai';
import { parseEther, parseUnits } from 'ethers/lib/utils';
import { dnGmxJuniorVaultFixture } from './fixtures/dn-gmx-junior-vault';
import { activateMainnetFork } from './utils/mainnet-fork';
import { increaseBlockTimestamp } from './utils/shared';

describe('Fee Handlers', () => {
  before(async () => {
    // Set mainnet to recent block
    await activateMainnetFork({ blockNumber: 29650000 });
  });

  after(async () => {
    // Reset to default block
    await activateMainnetFork();
  });

  it('Protocol EsGmx Handlers & EsGmx Harvest', async () => {
    const { dnGmxJuniorVault, dnGmxSeniorVault, feeRecipient, gmx, esGmx, stakedGmxTracker, glpVester, users } =
      await dnGmxJuniorVaultFixture();
    await dnGmxSeniorVault.connect(users[1]).deposit(parseUnits('150', 6), users[1].address);

    const amount = parseEther('100');

    await dnGmxJuniorVault.connect(users[0]).deposit(amount, users[0].address);

    await increaseBlockTimestamp(1000000);

    // console.log("staked es gmx:", await stakedGmxTracker.depositBalances(dnGmxJuniorVault.address,esGmx.address));
    // console.log('#### Harvest Fees ####');
    await dnGmxJuniorVault.harvestFees();
    const stakedEsGmxAmountHarvested = await stakedGmxTracker.depositBalances(dnGmxJuniorVault.address, esGmx.address);
    const protocolEsGmxHarvested = await dnGmxJuniorVault.protocolEsGmx();
    // console.log("staked es gmx:", await stakedGmxTracker.depositBalances(dnGmxJuniorVault.address,esGmx.address));
    // console.log("protocolEsGmx", await dnGmxJuniorVault.protocolEsGmx());
    expect(protocolEsGmxHarvested).to.eq(stakedEsGmxAmountHarvested.mul(await dnGmxJuniorVault.feeBps()).div(10_000));

    await increaseBlockTimestamp(1000000);

    // console.log("esGmx in vesting", await glpVester.balances(dnGmxJuniorVault.address));
    // console.log('#### Unstake and Vest EsGMX ####');
    await dnGmxJuniorVault.unstakeAndVestEsGmx();
    const stakedEsGmxAmountAfterVesting = await stakedGmxTracker.depositBalances(
      dnGmxJuniorVault.address,
      esGmx.address,
    );
    const esGmxInVesting = await glpVester.balances(dnGmxJuniorVault.address);
    const protocolEsGmxAfterVesting = await dnGmxJuniorVault.protocolEsGmx();

    expect(protocolEsGmxHarvested).to.eq(esGmxInVesting);
    expect(stakedEsGmxAmountAfterVesting).to.eq(stakedEsGmxAmountHarvested.sub(protocolEsGmxHarvested));
    expect(protocolEsGmxAfterVesting).to.eq(0);
    // console.log("staked es gmx:", await stakedGmxTracker.depositBalances(dnGmxJuniorVault.address,esGmx.address));
    // console.log("esGmx in vesting", await glpVester.balances(dnGmxJuniorVault.address));

    await increaseBlockTimestamp(1000000);

    // console.log("Fee Recipient Gmx Balance:", await gmx.balanceOf(feeRecipient.address));
    // console.log('#### Claim Vested GMX ####');
    await dnGmxJuniorVault.claimVestedGmx();
    const vestedEsGmxAfterPartialVesting = await glpVester.balances(dnGmxJuniorVault.address);
    const feeRecipientGmxBalance = await gmx.balanceOf(feeRecipient.address);
    expect(feeRecipientGmxBalance).gt(0);
    expect(vestedEsGmxAfterPartialVesting).to.eq(esGmxInVesting.sub(feeRecipientGmxBalance));

    // console.log("Fee Recipient Gmx Balance:", await gmx.balanceOf(feeRecipient.address));

    // console.log("esGmx in vesting", await glpVester.balances(dnGmxJuniorVault.address));
    // console.log("staked es gmx:", await stakedGmxTracker.depositBalances(dnGmxJuniorVault.address,esGmx.address));

    // console.log('#### Stop Vest and Stake GMX ####');
    await dnGmxJuniorVault.stopVestAndStakeEsGmx();
    await dnGmxJuniorVault.claimVestedGmx();
    const protocolEsGmxAfterStopVesting = await dnGmxJuniorVault.protocolEsGmx();
    const stakedEsGmxAmountAfterStopVesting = await stakedGmxTracker.depositBalances(
      dnGmxJuniorVault.address,
      esGmx.address,
    );
    const vestedEsGmxAfterStopVesting = await glpVester.balances(dnGmxJuniorVault.address);

    expect(stakedEsGmxAmountAfterStopVesting).to.eq(stakedEsGmxAmountAfterVesting.add(protocolEsGmxAfterStopVesting));
    expect(vestedEsGmxAfterStopVesting).to.eq(0);
    // console.log("Fee Recipient Gmx Balance:", await gmx.balanceOf(feeRecipient.address));
    // console.log("esGmx in vesting", await glpVester.balances(dnGmxJuniorVault.address));
    // console.log("staked es gmx:", await stakedGmxTracker.depositBalances(dnGmxJuniorVault.address,esGmx.address));
    // console.log("protocolEsGmx", await dnGmxJuniorVault.protocolEsGmx());
  });
});
