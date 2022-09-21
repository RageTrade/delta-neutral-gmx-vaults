import { expect } from 'chai';
import { BigNumber } from 'ethers';
import { changePrice } from './utils/price-helpers';
import { parseEther, parseUnits } from 'ethers/lib/utils';
import { dnGmxVaultFixture } from './fixtures/dn-gmx-vault';
import { increaseBlockTimestamp } from './utils/vault-helpers';

describe('Rebalance Scenarios', () => {
  it('Rebalance (External)', async () => {
    const { dnGmxVault, glpBatchingManager, users, aUSDC } = await dnGmxVaultFixture();

    // becauses price are not changed on uniswap
    await dnGmxVault.setThresholds({
      usdcReedemSlippage: 10_000,
      usdcConversionThreshold: parseUnits('20', 6),
    });

    const amount = parseEther('100');

    let usdcBorrowed = await dnGmxVault.getUsdcBorrowed();
    let aUSDCBal = await aUSDC.balanceOf(dnGmxVault.address);
    let [currentBtc_, currentEth_] = await dnGmxVault.getCurrentBorrows();

    console.log('aUSDC balance before deposit: ', aUSDCBal);
    console.log('usdc borrowed from aave vault: ', usdcBorrowed);
    console.log(`current borrows before deposit: btc: ${currentBtc_}, eth: ${currentEth_}`);
    console.log('borrow value before deposit', await dnGmxVault.getBorrowValue(currentBtc_, currentEth_));

    // ETH: 1,547$ BTC: 19,929$
    await dnGmxVault.connect(users[0]).deposit(amount, users[0].address);

    usdcBorrowed = await dnGmxVault.getUsdcBorrowed();
    aUSDCBal = await aUSDC.balanceOf(dnGmxVault.address);
    [currentBtc_, currentEth_] = await dnGmxVault.getCurrentBorrows();

    console.log('aUSDC balance after deposit: ', aUSDCBal);
    console.log('usdc borrowed from aave vault: ', usdcBorrowed);
    console.log(`current borrows after deposit: btc: ${currentBtc_}, eth: ${currentEth_}`);
    console.log('borrow value after deposit', await dnGmxVault.getBorrowValue(currentBtc_, currentEth_));

    await increaseBlockTimestamp(15 * 60);
    await glpBatchingManager.executeBatchDeposit();

    await increaseBlockTimestamp(24 * 60 * 60);

    // ETH: 2,000$ BTC: 25,000$
    await changePrice('WBTC', 25000);
    await changePrice('WETH', 2000);

    await dnGmxVault.rebalance();

    usdcBorrowed = await dnGmxVault.getUsdcBorrowed();
    aUSDCBal = await aUSDC.balanceOf(dnGmxVault.address);
    [currentBtc_, currentEth_] = await dnGmxVault.getCurrentBorrows();

    console.log('aUSDC balance after rebalance: ', aUSDCBal);
    console.log('usdc borrowed from aave vault: ', usdcBorrowed);
    console.log(`current borrows after rebalance: btc: ${currentBtc_}, eth: ${currentEth_}`);
    console.log('borrow value after rebalance', await dnGmxVault.getBorrowValue(currentBtc_, currentEth_));

    await increaseBlockTimestamp(15 * 60);
    await glpBatchingManager.executeBatchDeposit();

    await increaseBlockTimestamp(24 * 60 * 60);

    // ETH: 1,350$ BTC: 18,000$
    await changePrice('WBTC', 18000);
    await changePrice('WETH', 1350);

    await dnGmxVault.rebalance();

    usdcBorrowed = await dnGmxVault.getUsdcBorrowed();
    aUSDCBal = await aUSDC.balanceOf(dnGmxVault.address);
    [currentBtc_, currentEth_] = await dnGmxVault.getCurrentBorrows();

    console.log('aUSDC balance after rebalance: ', aUSDCBal);
    console.log('usdc borrowed from aave vault: ', usdcBorrowed);
    console.log(`current borrows after rebalance: btc: ${currentBtc_}, eth: ${currentEth_}`);
    console.log('borrow value after rebalance', await dnGmxVault.getBorrowValue(currentBtc_, currentEth_));
  });
});
