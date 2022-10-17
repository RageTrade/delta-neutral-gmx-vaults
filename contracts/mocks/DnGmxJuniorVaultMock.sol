// SPDX-License-Identifier: MIT

pragma solidity ^0.8.9;

import { ISwapRouter } from '@uniswap/v3-periphery/contracts/interfaces/ISwapRouter.sol';
import { IERC20Metadata } from '@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol';

import { IStableSwap } from '../interfaces/curve/IStableSwap.sol';
import { DnGmxJuniorVaultHelpers } from '../libraries/DnGmxJuniorVaultHelpers.sol';
import { SwapManager } from '../libraries/SwapManager.sol';
import { DnGmxJuniorVault } from '../vaults/DnGmxJuniorVault.sol';

contract DnGmxJuniorVaultMock is DnGmxJuniorVault {
    using DnGmxJuniorVaultHelpers for DnGmxJuniorVaultHelpers.State;

    function dnUsdcDepositedExternal() external view returns (int256) {
        return state.dnUsdcDeposited;
    }

    function getBorrowValue(uint256 btcAmount, uint256 ethAmount) external view returns (uint256 borrowValue) {
        return state.getBorrowValue(btcAmount, ethAmount);
    }

    function rebalanceBeforeShareAllocation() external {
        return _rebalanceBeforeShareAllocation();
    }

    function isValidRebalanceTime() external view returns (bool) {
        return state.isValidRebalanceTime();
    }

    function isValidRebalanceDeviation() external view returns (bool) {
        return state.isValidRebalanceDeviation();
    }

    function isValidRebalanceHF() external view returns (bool) {
        return state.isValidRebalanceHF();
    }

    function swapToken(
        address token,
        uint256 tokenAmount,
        uint256 minUsdcAmount
    ) external returns (uint256 usdcReceived, uint256 tokensUsed) {
        return SwapManager.swapToken(token, tokenAmount, minUsdcAmount);
    }

    function swapUSDC(
        address token,
        uint256 tokenAmount,
        uint256 maxUsdcAmount
    ) external returns (uint256 usdcPaid, uint256 tokensReceived) {
        return SwapManager.swapUSDC(token, tokenAmount, maxUsdcAmount);
    }

    function executeFlashloan(
        address[] memory assets,
        uint256[] memory amounts,
        uint256 _btcTokenAmount,
        uint256 _btcUsdcAmount,
        uint256 _ethTokenAmount,
        uint256 _ethUsdcAmount,
        bool _repayDebtBtc,
        bool _repayDebtEth
    ) external {
        return
            _executeFlashloan(
                assets,
                amounts,
                _btcTokenAmount,
                _btcUsdcAmount,
                _ethTokenAmount,
                _ethUsdcAmount,
                _repayDebtBtc,
                _repayDebtEth
            );
    }

    function executeBorrow(address token, uint256 amount) external {
        state.pool.borrow(token, amount, VARIABLE_INTEREST_MODE, 0, address(this));
    }

    function executeRepay(address token, uint256 amount) external {
        state.pool.repay(token, amount, VARIABLE_INTEREST_MODE, address(this));
    }

    function executeSupply(address token, uint256 amount) external {
        state.pool.supply(token, amount, address(this), 0);
    }

    function executeWithdraw(address token, uint256 amount) external {
        state.pool.withdraw(token, amount, address(this));
    }

    function executeBorrowFromDnGmxSeniorVault(uint256 amount) external {
        state.dnGmxSeniorVault.borrow(amount);
    }

    function executeRepayFromDnGmxSeniorVault(uint256 amount) external {
        state.dnGmxSeniorVault.repay(amount);
    }

    function executeOperationToken(
        address token,
        uint256 tokenAmount,
        uint256 usdcAmount,
        uint256 premium,
        bool repayDebt
    ) external {
        return _executeOperationToken(token, tokenAmount, usdcAmount, premium, repayDebt);
    }

    function flashloanAmounts(
        address token,
        uint256 optimalBorrow,
        uint256 currentBorrow
    )
        external
        view
        returns (
            uint256 tokenAmount,
            uint256 usdcAmount,
            bool repayDebt
        )
    {
        return state.flashloanAmounts(token, optimalBorrow, currentBorrow);
    }

    function rebalanceProfit(uint256 borrowValue) external {
        return state.rebalanceProfit(borrowValue);
    }

    function getLiquidationThreshold(address asset) internal view returns (uint256) {
        return _getLiquidationThreshold(asset);
    }

    function rebalanceBorrow(
        uint256 optimalBtcBorrow,
        uint256 currentBtcBorrow,
        uint256 optimalEthBorrow,
        uint256 currentEthBorrow
    ) external {
        return state.rebalanceBorrow(optimalBtcBorrow, currentBtcBorrow, optimalEthBorrow, currentEthBorrow);
    }

    function getPriceExternal() external view returns (uint256) {
        return getPrice(false);
    }

    function getPrice(IERC20Metadata token) external view returns (uint256) {
        return state.getTokenPrice(token);
    }

    function getPrice(IERC20Metadata token, bool isUsdc) external view returns (uint256) {
        return state.getTokenPriceInUsdc(token, isUsdc);
    }

    function getCurrentBorrows() external view returns (uint256 currentBtcBorrow, uint256 currentEthBorrow) {
        return state.getCurrentBorrows();
    }

    function getOptimalBorrows(uint256 glpDeposited)
        external
        view
        returns (uint256 optimalBtcBorrow, uint256 optimalEthBorrow)
    {
        return state.getOptimalBorrows(glpDeposited);
    }

    function getOptimalCappedBorrows(uint256 availableBorrowAmount, uint256 usdcLiquidationThreshold)
        external
        view
        returns (uint256 optimalBtcBorrow, uint256 optimalEthBorrow)
    {
        return state.getOptimalCappedBorrows(availableBorrowAmount, usdcLiquidationThreshold);
    }

    function getTokenReservesInGlp(address token, uint256 glpDeposited) external view returns (uint256) {
        return state.getTokenReservesInGlp(token, glpDeposited);
    }

    function isWithinAllowedDelta(uint256 optimalBorrow, uint256 currentBorrow) external view returns (bool) {
        return state.isWithinAllowedDelta(optimalBorrow, currentBorrow);
    }

    function rebalanceHedge(uint256 currentBtcBorrow, uint256 currentEthBorrow) external {
        return state.rebalanceHedge(currentBtcBorrow, currentEthBorrow, totalAssets());
    }

    function convertAssetToAUsdc(uint256 usdcAmountDesired) external returns (uint256 usdcAmount) {
        return _convertAssetToAUsdc(usdcAmountDesired);
    }

    function convertAUsdcToAsset(uint256 amount) external {
        return _convertAUsdcToAsset(amount);
    }

    function setMocks(ISwapRouter _swapRouter) external {
        state.swapRouter = _swapRouter;
    }

    function depositToken(
        address token,
        uint256 amount,
        uint256 minUsdg
    ) external {
        state.batchingManager.depositToken(token, amount, minUsdg);
    }
}
