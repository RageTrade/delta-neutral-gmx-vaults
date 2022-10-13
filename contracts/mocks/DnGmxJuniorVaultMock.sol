// SPDX-License-Identifier: MIT

pragma solidity ^0.8.9;

import { DnGmxJuniorVault } from '../vaults/DnGmxJuniorVault.sol';
import { IERC20Metadata } from '@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol';

import { IStableSwap } from '../interfaces/curve/IStableSwap.sol';
import { ISwapRouter } from '@uniswap/v3-periphery/contracts/interfaces/ISwapRouter.sol';

contract DnGmxJuniorVaultMock is DnGmxJuniorVault {
    function dnUsdcDepositedExternal() external view returns (int256) {
        return dnUsdcDeposited;
    }

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

    function isValidRebalanceHF() external view returns (bool) {
        return _isValidRebalanceHF();
    }

    function swapToken(
        address token,
        uint256 tokenAmount,
        uint256 minUsdcAmount
    ) external returns (uint256 usdcAmount) {
        return _swapToken(token, tokenAmount, minUsdcAmount);
    }

    function swapUSDC(
        address token,
        uint256 tokenAmount,
        uint256 maxUsdcAmount
    ) external returns (uint256 usdcAmount, uint256 tokensReceived) {
        return _swapUSDC(token, tokenAmount, maxUsdcAmount);
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

    function executeBorrowFromDnGmxSeniorVault(uint256 amount) external {
        dnGmxSeniorVault.borrow(amount);
    }

    function executeRepayFromDnGmxSeniorVault(uint256 amount) external {
        dnGmxSeniorVault.repay(amount);
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
        return _flashloanAmounts(token, optimalBorrow, currentBorrow);
    }

    function rebalanceProfit(uint256 borrowValue) external {
        return _rebalanceProfit(borrowValue);
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
        return _rebalanceBorrow(optimalBtcBorrow, currentBtcBorrow, optimalEthBorrow, currentEthBorrow);
    }

    function getPriceExternal() external view returns (uint256) {
        return getPrice();
    }

    function getPrice(IERC20Metadata token) external view returns (uint256) {
        return _getPrice(token);
    }

    function getPrice(IERC20Metadata token, bool isUsdc) external view returns (uint256) {
        return _getPrice(token, isUsdc);
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

    function getTokenReservesInGlp(address token, uint256 glpDeposited) external view returns (uint256) {
        return _getTokenReservesInGlp(token, glpDeposited);
    }

    function isWithinAllowedDelta(uint256 optimalBorrow, uint256 currentBorrow) external view returns (bool) {
        return _isWithinAllowedDelta(optimalBorrow, currentBorrow);
    }

    function rebalanceHedge(uint256 currentBtcBorrow, uint256 currentEthBorrow) external {
        return _rebalanceHedge(currentBtcBorrow, currentEthBorrow, totalAssets());
    }

    function convertAssetToAUsdc(uint256 usdcAmountDesired) external returns (uint256 usdcAmount) {
        return _convertAssetToAUsdc(usdcAmountDesired);
    }

    function convertAUsdcToAsset(uint256 amount) external {
        return _convertAUsdcToAsset(amount);
    }

    function setMocks(ISwapRouter _swapRouter, IStableSwap _stableSwap) external {
        swapRouter = _swapRouter;
        tricryptoPool = _stableSwap;
    }

    function depositToken(
        address token,
        uint256 amount,
        uint256 minUsdg
    ) external {
        batchingManager.depositToken(token, amount, minUsdg);
    }
}
