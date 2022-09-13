// SPDX-License-Identifier: MIT

pragma solidity ^0.8.9;

import { DNGmxVault } from 'contracts/vaults/DNGmxVault.sol';

contract DNGmxVaultMock is DNGmxVault {
    function getBorrowValue(uint256 btcAmount, uint256 ethAmount) external view returns (uint256 borrowValue) {
        return _getBorrowValue(btcAmount, ethAmount);
    }

    function rebalanceBeforeShareAllocation() external {
        return _rebalanceBeforeShareAllocation();
    }

    function isValidRebalanceTime() external view returns (bool) {
        return _isValidRebalanceTime();
    }

    function isValidRebalanceDeviation() external view returns (bool) {
        return _isValidRebalanceDeviation();
    }

    function swapTokenToUSDC(address token, uint256 tokenAmount) external returns (uint256 usdcAmount) {
        return _swapTokenToUSDC(token, tokenAmount);
    }

    function swapUSDCToToken(address token, uint256 tokenAmount) external returns (uint256 outputAmount) {
        return _swapUSDCToToken(token, tokenAmount);
    }

    function executeFlashloan(
        address[] memory assets,
        uint256[] memory amounts,
        uint256 _btcAssetAmount,
        uint256 _ethAssetAmount,
        bool _repayDebtBtc,
        bool _repayDebtEth
    ) external {
        return _executeFlashloan(assets, amounts, _btcAssetAmount, _ethAssetAmount, _repayDebtBtc, _repayDebtEth);
    }

    function executeBorrow(address token, uint256 amount) external {
        pool.borrow(token, amount, VARIABLE_INTEREST_MODE, 0, address(this));
    }

    function executeRepay(address token, uint256 amount) external {
        pool.repay(token, amount, VARIABLE_INTEREST_MODE, address(this));
    }

    function executeSupply(address token, uint256 amount) external {
        pool.supply(token, amount, address(this), 0);
    }

    function executeWithdraw(address token, uint256 amount) external {
        pool.withdraw(token, amount, address(this));
    }

    function executeOperationToken(
        address token,
        uint256 amount,
        uint256 premium,
        bool repayDebt
    ) external {
        return _executeOperationToken(token, amount, premium, repayDebt);
    }

    function flashloanAmounts(
        address token,
        uint256 optimalBorrow,
        uint256 currentBorrow
    ) external view returns (uint256 amount, bool repayDebt) {
        return _flashloanAmounts(token, optimalBorrow, currentBorrow);
    }

    function rebalanceProfit(uint256 borrowValue) external {
        return _rebalanceProfit(borrowValue);
    }

    function rebalanceBorrow(
        uint256 optimalBtcBorrow,
        uint256 currentBtcBorrow,
        uint256 optimalEthBorrow,
        uint256 currentEthBorrow
    ) external {
        return _rebalanceBorrow(optimalBtcBorrow, currentBtcBorrow, optimalEthBorrow, currentEthBorrow);
    }

    function getCurrentBorrows() external view returns (uint256 currentBtcBorrow, uint256 currentEthBorrow) {
        return _getCurrentBorrows();
    }

    function getOptimalBorrows(uint256 glpDeposited)
        external
        view
        returns (uint256 optimalBtcBorrow, uint256 optimalEthBorrow)
    {
        return _getOptimalBorrows(glpDeposited);
    }

    function getTokenReservesInGlp(address token) external view returns (uint256) {
        return _getTokenReservesInGlp(token);
    }

    function isWithinAllowedDelta(uint256 optimalBorrow, uint256 currentBorrow) external view returns (bool) {
        return _isWithinAllowedDelta(optimalBorrow, currentBorrow);
    }

    function rebalanceHedge(uint256 currentBtcBorrow, uint256 currentEthBorrow) external {
        return _rebalanceHedge(currentBtcBorrow, currentEthBorrow);
    }

    function convertAssetToAUsdc(uint256 usdcAmountDesired) external returns (uint256 usdcAmount) {
        return _convertAssetToAUsdc(usdcAmountDesired);
    }

    function convertAUsdcToAsset(uint256 amount) external {
        return _convertAUsdcToAsset(amount);
    }
}
