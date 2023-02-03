// SPDX-License-Identifier: MIT

pragma solidity ^0.8.9;

import { ISwapRouter } from '@uniswap/v3-periphery/contracts/interfaces/ISwapRouter.sol';
import { IERC20Metadata } from '@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol';

import { DnGmxJuniorVaultManager } from '../libraries/DnGmxJuniorVaultManager.sol';
import { DnGmxJuniorVault } from '../vaults/DnGmxJuniorVault.sol';

import { IDnGmxBatchingManager } from '../interfaces/IDnGmxBatchingManager.sol';
import { FixedPointMathLib } from '@rari-capital/solmate/src/utils/FixedPointMathLib.sol';

import { IERC4626 } from '../interfaces/IERC4626.sol';
import { ERC4626Upgradeable } from '../ERC4626/ERC4626Upgradeable.sol';

contract DnGmxJuniorVaultMock is DnGmxJuniorVault {
    uint256 internal constant VARIABLE_INTEREST_MODE = 2;
    IDnGmxBatchingManager batchingManager;

    using FixedPointMathLib for uint256;

    using DnGmxJuniorVaultManager for DnGmxJuniorVaultManager.State;

    function dnUsdcDepositedExternal() external view returns (int256) {
        return state.dnUsdcDeposited;
    }

    function protocolEsGmx() external view returns (uint256) {
        return state.protocolEsGmx;
    }

    function protocolFee() external view returns (uint256) {
        return state.protocolFee;
    }

    function withdrawFeeBps() external view returns (uint256) {
        return state.withdrawFeeBps;
    }

    function feeBps() external view returns (uint256) {
        return state.feeBps;
    }

    function slippageThresholdSwapBtcBps() external view returns (uint256) {
        return state.slippageThresholdSwapBtcBps;
    }

    function slippageThresholdSwapEthBps() external view returns (uint256) {
        return state.slippageThresholdSwapEthBps;
    }

    function unhedgedGlpInUsdc() external view returns (uint256) {
        return state.unhedgedGlpInUsdc;
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
        return state._swapToken(token, tokenAmount, minUsdcAmount);
    }

    function swapUSDC(
        address token,
        uint256 tokenAmount,
        uint256 maxUsdcAmount
    ) external returns (uint256 usdcPaid, uint256 tokensReceived) {
        return state._swapUSDC(token, tokenAmount, maxUsdcAmount);
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
            state._executeFlashloan(
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
        return state._executeOperationToken(token, tokenAmount, usdcAmount, premium, repayDebt);
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
        return state.getLiquidationThreshold(asset);
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

    function getGlpPriceInUsdc(bool maximize) external view returns (uint256) {
        return state.getGlpPriceInUsdc(maximize);
    }

    function getPrice(IERC20Metadata token) external view returns (uint256) {
        return state.getTokenPrice(token);
    }

    function getPrice(IERC20Metadata token, bool) external view returns (uint256) {
        return state.getTokenPriceInUsdc(token);
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

    function rebalanceHedge(uint256 currentBtcBorrow, uint256 currentEthBorrow) external returns (bool) {
        return state.rebalanceHedge(currentBtcBorrow, currentEthBorrow, totalAssets(), false);
    }

    function totalAssetsMax() external view returns (uint256) {
        return state.totalAssets(true);
    }

    function totalAssetsComponents(bool maximize)
        external
        view
        returns (
            uint256 fsGlpBal,
            uint256 aaveProfitGlp,
            uint256 aaveLossGlp,
            uint256 unhedgedGlp
        )
    {
        fsGlpBal = state.fsGlp.balanceOf(address(this));

        int256 dnUsdcDeposited = state.dnUsdcDeposited;

        // calculate current borrow amounts
        (uint256 currentBtc, uint256 currentEth) = state.getCurrentBorrows();

        // total borrow value is the value of ETH and BTC required to be paid off
        uint256 totalCurrentBorrowValue = state.getBorrowValue(currentBtc, currentEth);

        uint256 glpPrice = state.getGlpPriceInUsdc(maximize);

        {
            // convert it into two uints basis the sign
            uint256 aaveProfit = dnUsdcDeposited > int256(0) ? uint256(dnUsdcDeposited) : 0;
            uint256 aaveLoss = dnUsdcDeposited < int256(0)
                ? uint256(-dnUsdcDeposited) + totalCurrentBorrowValue
                : totalCurrentBorrowValue;

            if (aaveProfit > aaveLoss) {
                aaveProfitGlp = (aaveProfit - aaveLoss).mulDivDown(PRICE_PRECISION, glpPrice);
                if (!maximize)
                    aaveProfitGlp = aaveProfitGlp.mulDivDown(MAX_BPS - state.slippageThresholdGmxBps, MAX_BPS);
                aaveLossGlp = 0;
            } else {
                aaveLossGlp = (aaveLoss - aaveProfit).mulDivDown(PRICE_PRECISION, glpPrice);
                if (!maximize) aaveLossGlp = aaveLossGlp.mulDivDown(MAX_BPS + state.slippageThresholdGmxBps, MAX_BPS);
                aaveProfitGlp = 0;
            }
        }

        unhedgedGlp = (state.unhedgedGlpInUsdc).mulDivDown(PRICE_PRECISION, state.getGlpPriceInUsdc(!maximize));

        if (!maximize) unhedgedGlp = unhedgedGlp.mulDivDown(MAX_BPS - state.slippageThresholdGmxBps, MAX_BPS);
    }

    function convertAssetToAUsdc(uint256 usdcAmountDesired) external returns (uint256 usdcAmount) {
        return state._convertAssetToAUsdc(usdcAmountDesired);
    }

    function convertAUsdcToAsset(uint256 amount) external {
        return state._convertAUsdcToAsset(amount);
    }

    function setMocks(ISwapRouter _swapRouter) external {
        state.swapRouter = _swapRouter;
    }

    function _quoteSwapSlippageLoss(int256 btcAmount, int256 ethAmount) internal view returns (uint256) {
        uint256 btcPrice = state.getTokenPriceInUsdc(state.wbtc);
        uint256 ethPrice = state.getTokenPriceInUsdc(state.weth);

        uint256 netUsdc = (uint256(btcAmount) * btcPrice * (MAX_BPS - state.slippageThresholdSwapBtcBps)) /
            MAX_BPS /
            PRICE_PRECISION /
            100;
        netUsdc +=
            (uint256(ethAmount) * ethPrice * (MAX_BPS - state.slippageThresholdSwapEthBps)) /
            MAX_BPS /
            PRICE_PRECISION /
            100;
        return netUsdc;
    }

    function getSlippageAdjustedAssets(uint256 assets, bool isDeposit) public view returns (uint256) {
        // get change in borrow positions to calculate amount to swap on uniswap
        (int256 netBtcBorrowChange, int256 netEthBorrowChange) = state.getNetPositionChange(assets, isDeposit);

        uint256 dollarsLostDueToSlippage = _quoteSwapSlippageLoss(netBtcBorrowChange, netEthBorrowChange);

        // netSlippage returned is in glp (asset) terms
        uint256 glpPrice = state.getGlpPriceInUsdc(false);
        uint256 netSlippage = dollarsLostDueToSlippage.mulDivUp(PRICE_PRECISION, glpPrice);

        // subtract slippage from assets, and calculate shares basis that slippage adjusted asset amount
        assets -= uint256(netSlippage);

        return assets;
    }

    function setBatchingManager(IDnGmxBatchingManager _batchingManager) external {
        batchingManager = _batchingManager;
        state.weth.approve(address(_batchingManager), type(uint256).max);
        state.usdc.approve(address(_batchingManager), type(uint256).max);
    }

    function previewDeposit(uint256 assets) public view override(DnGmxJuniorVault) returns (uint256) {
        uint256 netAssets = getSlippageAdjustedAssets({ assets: assets, isDeposit: true });
        return convertToShares(netAssets);
    }

    /// @notice preview function for minting of shares
    /// @param shares number of shares to mint
    /// @return assets that would be taken from the user
    function previewMint(uint256 shares) public view virtual override(DnGmxJuniorVault) returns (uint256) {
        uint256 supply = totalSupply();

        if (supply == 0) return shares;

        uint256 assets = convertToAssets(shares);
        uint256 netAssets = getSlippageAdjustedAssets({ assets: assets, isDeposit: true });

        return netAssets;
    }

    /// @notice preview function for withdrawal of assets
    /// @param assets that would be given to the user
    /// @return shares that would be burnt
    function previewWithdraw(uint256 assets) public view virtual override(DnGmxJuniorVault) returns (uint256) {
        uint256 supply = totalSupply();

        if (supply == 0) return assets;

        uint256 netAssets = getSlippageAdjustedAssets({ assets: assets, isDeposit: false });

        return netAssets.mulDivUp(supply * MAX_BPS, state.totalAssets(false) * (MAX_BPS - state.withdrawFeeBps));
    }

    /// @notice preview function for redeeming shares
    /// @param shares that would be taken from the user
    /// @return assets that user would get
    function previewRedeem(uint256 shares) public view virtual override(DnGmxJuniorVault) returns (uint256) {
        uint256 supply = totalSupply();

        if (supply == 0) return shares;

        uint256 assets = convertToAssets(shares);
        uint256 netAssets = getSlippageAdjustedAssets({ assets: assets, isDeposit: false });

        return netAssets.mulDivDown(MAX_BPS - state.withdrawFeeBps, MAX_BPS);
    }
}
