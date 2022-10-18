// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import { IPool } from '@aave/core-v3/contracts/interfaces/IPool.sol';
import { IAToken } from '@aave/core-v3/contracts/interfaces/IAToken.sol';
import { IPriceOracle } from '@aave/core-v3/contracts/interfaces/IPriceOracle.sol';
import { IPoolAddressesProvider } from '@aave/core-v3/contracts/interfaces/IPoolAddressesProvider.sol';
import { IRewardsController } from '@aave/periphery-v3/contracts/rewards/interfaces/IRewardsController.sol';
import { DataTypes } from '@aave/core-v3/contracts/protocol/libraries/types/DataTypes.sol';
import { ReserveConfiguration } from '@aave/core-v3/contracts/protocol/libraries/configuration/ReserveConfiguration.sol';

import { IERC20 } from '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import { IERC20Metadata } from '@openzeppelin/contracts/interfaces/IERC20Metadata.sol';

import { FixedPointMathLib } from '@rari-capital/solmate/src/utils/FixedPointMathLib.sol';

import { ISwapRouter } from '@uniswap/v3-periphery/contracts/interfaces/ISwapRouter.sol';

import { IVault } from '../interfaces/gmx/IVault.sol';
import { IGlpManager } from '../interfaces/gmx/IGlpManager.sol';
import { IRewardRouterV2 } from '../interfaces/gmx/IRewardRouterV2.sol';
import { IDnGmxJuniorVault } from '../interfaces/IDnGmxJuniorVault.sol';
import { IDnGmxSeniorVault } from '../interfaces/IDnGmxSeniorVault.sol';
import { IBalancerVault } from '../interfaces/IBalancerVault.sol';
import { IDnGmxBatchingManager } from '../interfaces/IDnGmxBatchingManager.sol';
import { IDebtToken } from '../interfaces/IDebtToken.sol';
import { IRewardTracker } from '../interfaces/gmx/IRewardTracker.sol';

import { SafeCast } from '../libraries/SafeCast.sol';

library SwapManager {
    using SwapManager for State;
    using ReserveConfiguration for DataTypes.ReserveConfigurationMap;

    using FixedPointMathLib for uint256;
    using SafeCast for uint256;

    uint16 constant MAX_BPS = 10_000;

    uint256 constant USDG_DECIMALS = 18;
    uint256 constant WETH_DECIMALS = 18;

    uint256 constant PRICE_PRECISION = 1e30;
    uint256 constant VARIABLE_INTEREST_MODE = 2;

    address internal constant wbtc = 0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f;
    address internal constant weth = 0x82aF49447D8a07e3bd95BD0d56f35241523fBab1;
    address internal constant usdc = 0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8;

    bytes internal constant USDC_TO_WETH = abi.encodePacked(weth, uint24(500), usdc);
    bytes internal constant USDC_TO_WBTC = abi.encodePacked(wbtc, uint24(3000), weth, uint24(500), usdc);

    bytes internal constant WETH_TO_USDC = abi.encodePacked(weth, uint24(500), usdc);
    bytes internal constant WBTC_TO_USDC = abi.encodePacked(wbtc, uint24(3000), weth, uint24(500), usdc);

    struct State {
        uint256 feeBps; // = 1000;
        address keeper;
        IDnGmxSeniorVault dnGmxSeniorVault;
        address feeRecipient;
        uint256 withdrawFeeBps;
        uint256 protocolFee;
        uint256 protocolEsGmx;
        uint256 unhedgedGlpInUsdc;
        uint256 seniorVaultWethRewards;
        uint256 wethConversionThreshold;
        uint256 hedgeUsdcAmountThreshold;
        uint256 hfThreshold;
        uint256 depositCap;
        int256 dnUsdcDeposited;
        bool _hasFlashloaned;
        uint64 lastRebalanceTS;
        uint32 rebalanceTimeThreshold;
        uint16 rebalanceDeltaThreshold;
        ///@dev storage for hedge strategy
        IPool pool;
        IPriceOracle oracle;
        IPoolAddressesProvider poolAddressProvider;
        IAToken aUsdc;
        IDebtToken vWbtc;
        IDebtToken vWeth;
        ISwapRouter swapRouter;
        IBalancerVault balancerVault;
        uint256 targetHealthFactor;
        IRewardsController aaveRewardsController;
        ///@dev storage for yield strategy
        uint16 slippageThresholdGmx;
        uint16 slippageThresholdSwap;
        uint208 usdcConversionThreshold;
        IERC20 fsGlp;
        IRewardTracker sGmx;
        IERC20Metadata glp;
        IERC20Metadata usdc;
        IERC20Metadata usdt;
        IERC20Metadata weth;
        IERC20Metadata wbtc;
        IVault gmxVault;
        IGlpManager glpManager;
        IRewardRouterV2 rewardRouter;
        IDnGmxBatchingManager batchingManager;
    }

    /* ##################################################################
                            REBALANCE HELPERS
    ################################################################## */

    function rebalanceProfit(State storage state, uint256 borrowValue) external {
        return _rebalanceProfit(state, borrowValue);
    }

    function _rebalanceProfit(State storage state, uint256 borrowValue) private {
        int256 borrowVal = borrowValue.toInt256();

        // console.log('borrowVal');
        // console.logInt(borrowVal);
        // console.log('dnUsdcDeposited');
        // console.logInt(dnUsdcDeposited);

        if (borrowVal > state.dnUsdcDeposited) {
            // If glp goes up - there is profit on GMX and loss on AAVE
            // So convert some glp to usdc and deposit to AAVE
            state.dnUsdcDeposited += _convertAssetToAUsdc(state, uint256(borrowVal - state.dnUsdcDeposited)).toInt256();
        } else if (borrowVal < state.dnUsdcDeposited) {
            // If glp goes down - there is profit on AAVE and loss on GMX
            // So withdraw some aave usdc and convert to glp
            _convertAUsdcToAsset(state, uint256(state.dnUsdcDeposited - borrowVal));
            state.dnUsdcDeposited = borrowVal;
        }
    }

    function rebalanceBorrow(
        State storage state,
        uint256 optimalBtcBorrow,
        uint256 currentBtcBorrow,
        uint256 optimalEthBorrow,
        uint256 currentEthBorrow
    ) external {
        return _rebalanceBorrow(state, optimalBtcBorrow, currentBtcBorrow, optimalEthBorrow, currentEthBorrow);
    }

    function _rebalanceBorrow(
        State storage state,
        uint256 optimalBtcBorrow,
        uint256 currentBtcBorrow,
        uint256 optimalEthBorrow,
        uint256 currentEthBorrow
    ) private {
        address[] memory assets;
        uint256[] memory amounts;

        (uint256 btcTokenAmount, uint256 btcUsdcAmount, bool repayDebtBtc) = _flashloanAmounts(
            state,
            address(state.wbtc),
            optimalBtcBorrow,
            currentBtcBorrow
        );
        (uint256 ethTokenAmount, uint256 ethUsdcAmount, bool repayDebtEth) = _flashloanAmounts(
            state,
            address(state.weth),
            optimalEthBorrow,
            currentEthBorrow
        );

        // console.log('repayDebtBtc', repayDebtBtc);
        // console.log('repayDebtEth', repayDebtEth);

        // console.log('btcTokenAmount', btcTokenAmount);
        // console.log('btcUsdcAmount', btcUsdcAmount);
        // console.log('ethTokenAmount', ethTokenAmount);
        // console.log('ethUsdcAmount', ethUsdcAmount);
        // console.log('hedgeUsdcAmountThreshold', hedgeUsdcAmountThreshold);

        if (btcUsdcAmount < state.hedgeUsdcAmountThreshold) {
            // console.log('BTC Below Threshold');
            btcTokenAmount = 0;
            btcUsdcAmount = 0;
        }
        if (ethUsdcAmount < state.hedgeUsdcAmountThreshold) {
            // console.log('ETH Below Threshold');
            ethTokenAmount = 0;
            ethUsdcAmount = 0;
        }

        // console.log('btcBeyondThreshold', btcBeyondThreshold);
        // console.log('ethBeyondThreshold', ethBeyondThreshold);

        uint256 btcAssetAmount = repayDebtBtc ? btcUsdcAmount : btcTokenAmount;
        uint256 ethAssetAmount = repayDebtEth ? ethUsdcAmount : ethTokenAmount;

        // If both eth and btc swap amounts are not beyond the threshold then no flashloan needs to be executed | case 1
        if (btcAssetAmount == 0 && ethAssetAmount == 0) return;

        if (repayDebtBtc && repayDebtEth) {
            // console.log('### BOTH REPAY CASE ###');
            assets = new address[](1);
            amounts = new uint256[](1);

            assets[0] = address(state.usdc);
            amounts[0] = (btcAssetAmount + ethAssetAmount);
            // console.log('asset[0] from if', assets[0]);
            // console.log('amounts[0] from if', amounts[0]);
        } else if (btcAssetAmount == 0 || ethAssetAmount == 0) {
            // Exactly one would be true since case-1 excluded (both false) | case-2
            // console.log('### CASE-2 ###');
            assets = new address[](1);
            amounts = new uint256[](1);

            if (btcAssetAmount == 0) {
                assets[0] = (repayDebtBtc ? address(state.usdc) : address(state.wbtc));
                amounts[0] = btcAssetAmount;
            } else {
                assets[0] = (repayDebtEth ? address(state.usdc) : address(state.weth));
                amounts[0] = ethAssetAmount;
            }
        } else {
            // console.log('### CASE-3 ###');
            // Both are true | case-3
            assets = new address[](2);
            amounts = new uint256[](2);

            assets[0] = repayDebtBtc ? address(state.usdc) : address(state.wbtc);
            // console.log('assets[0]', assets[0]);
            assets[1] = repayDebtEth ? address(state.usdc) : address(state.weth);
            // console.log('assets[1]', assets[1]);

            // ensure that assets and amount tuples are in sorted order of addresses
            if (assets[0] > assets[1]) {
                address tempAsset = assets[0];
                assets[0] = assets[1];
                assets[1] = tempAsset;

                amounts[0] = ethAssetAmount;
                // console.log('amounts[0]', amounts[0]);
                amounts[1] = btcAssetAmount;
                // console.log('amounts[1]', amounts[1]);
            } else {
                amounts[0] = btcAssetAmount;
                // console.log('amounts[0]*', amounts[0]);
                amounts[1] = ethAssetAmount;
                // console.log('amounts[1]*', amounts[1]);
            }
        }
        _executeFlashloan(
            state,
            assets,
            amounts,
            btcTokenAmount,
            btcUsdcAmount,
            ethTokenAmount,
            ethUsdcAmount,
            repayDebtBtc,
            repayDebtEth
        );
    }

    /// @notice settles collateral for the vault
    /// @dev to be called after settle profits only (since vaultMarketValue if after settlement of profits)
    /// @param currentBtcBorrow The amount of USDC collateral token deposited to LB Protocol
    /// @param currentEthBorrow The market value of ETH/BTC part in sGLP
    function rebalanceHedge(
        State storage state,
        uint256 currentBtcBorrow,
        uint256 currentEthBorrow,
        uint256 glpDeposited
    ) external {
        // console.log('totalAssets()', totalAssets());
        (uint256 optimalBtcBorrow, uint256 optimalEthBorrow) = _getOptimalBorrows(state, glpDeposited);
        // console.log('optimalBtcBorrow', optimalBtcBorrow);
        // console.log('optimalEthBorrow', optimalEthBorrow);

        uint256 optimalBorrowValue = _getBorrowValue(state, optimalBtcBorrow, optimalEthBorrow);
        // console.log('optimalBorrowValue', optimalBorrowValue);

        uint256 usdcLiquidationThreshold = _getLiquidationThreshold(state, address(state.usdc));

        // Settle net change in market value and deposit/withdraw collateral tokens
        // Vault market value is just the collateral value since profit has been settled
        uint256 targetDnGmxSeniorVaultAmount = (state.targetHealthFactor - usdcLiquidationThreshold).mulDivDown(
            optimalBorrowValue,
            usdcLiquidationThreshold
        );

        uint256 currentDnGmxSeniorVaultAmount = _getUsdcBorrowed(state);

        // console.log('targetDnGmxSeniorVaultAmount', targetDnGmxSeniorVaultAmount);
        // console.log('currentDnGmxSeniorVaultAmount', currentDnGmxSeniorVaultAmount);
        // console.log(optimalBtcBorrow, currentBtcBorrow, optimalEthBorrow, currentEthBorrow);

        if (targetDnGmxSeniorVaultAmount > currentDnGmxSeniorVaultAmount) {
            // console.log('IF');
            uint256 amountToBorrow = targetDnGmxSeniorVaultAmount - currentDnGmxSeniorVaultAmount;
            uint256 availableBorrow = state.dnGmxSeniorVault.availableBorrow(address(this));
            if (amountToBorrow > availableBorrow) {
                uint256 optimalUncappedEthBorrow = optimalEthBorrow;
                (optimalBtcBorrow, optimalEthBorrow) = _getOptimalCappedBorrows(
                    state,
                    currentDnGmxSeniorVaultAmount + availableBorrow,
                    usdcLiquidationThreshold
                );
                _rebalanceUnhedgedGlp(state, optimalUncappedEthBorrow, optimalEthBorrow);
                // console.log("Optimal token amounts 1",optimalBtcBorrow, optimalEthBorrow);
                if (availableBorrow > 0) {
                    state.dnGmxSeniorVault.borrow(availableBorrow);
                }
            } else {
                //No unhedged glp remaining so just pass same value in capped and uncapped (should convert back any ausdc back to sglp)
                _rebalanceUnhedgedGlp(state, optimalEthBorrow, optimalEthBorrow);

                // Take from LB Vault
                state.dnGmxSeniorVault.borrow(targetDnGmxSeniorVaultAmount - currentDnGmxSeniorVaultAmount);
            }

            // console.log("Optimal token amounts 2",optimalBtcBorrow, optimalEthBorrow);
            // Rebalance Position
            _rebalanceBorrow(state, optimalBtcBorrow, currentBtcBorrow, optimalEthBorrow, currentEthBorrow);
        } else {
            // console.log('ELSE');
            // Rebalance Position
            _rebalanceBorrow(state, optimalBtcBorrow, currentBtcBorrow, optimalEthBorrow, currentEthBorrow);
            uint256 totalCurrentBorrowValue;
            {
                (uint256 currentBtc, uint256 currentEth) = _getCurrentBorrows(state);
                totalCurrentBorrowValue = _getBorrowValue(state, currentBtc, currentEth);
            }
            _rebalanceProfit(state, totalCurrentBorrowValue);
            // Deposit to LB Vault
            // console.log('dnUsdcDeposited');
            // console.logInt(dnUsdcDeposited);
            // console.log('ausdc bal', aUsdc.balanceOf(address(this)));
            state.dnGmxSeniorVault.repay(currentDnGmxSeniorVaultAmount - targetDnGmxSeniorVaultAmount);
        }
    }

    /// @notice withdraws LP tokens from gauge, sells LP token for usdc
    /// @param usdcAmountDesired amount of USDC desired
    function _convertAssetToAUsdc(State storage state, uint256 usdcAmountDesired)
        private
        returns (uint256 usdcAmountOut)
    {
        /// @dev if usdcAmountDesired < 10, then there is precision issue in gmx contracts while redeeming for usdg

        if (usdcAmountDesired < state.usdcConversionThreshold) return 0;
        address _usdc = address(state.usdc);

        // @dev using max price of usdc becausing buying usdc for glp
        uint256 usdcPrice = state.gmxVault.getMaxPrice(_usdc);

        uint256 minUsdcOut = usdcAmountDesired.mulDivDown(usdcPrice, PRICE_PRECISION);

        // @dev adjusting slippage on glp input amount to receive atleast 'minUsdcOut'
        uint256 glpAmountInput = minUsdcOut.mulDivDown(
            PRICE_PRECISION * (MAX_BPS + state.slippageThresholdGmx),
            _getGlpPrice(state, false) * MAX_BPS
        );

        usdcAmountOut = state.rewardRouter.unstakeAndRedeemGlp(_usdc, glpAmountInput, usdcAmountDesired, address(this));

        _executeSupply(state, _usdc, usdcAmountOut);
    }

    /// @notice sells usdc for LP tokens and then stakes LP tokens
    /// @param amount amount of usdc
    function _convertAUsdcToAsset(State storage state, uint256 amount) private {
        _executeWithdraw(state, address(state.usdc), amount, address(this));
        // USDG has 18 decimals and usdc has 6 decimals => 18-6 = 12
        uint256 price = state.gmxVault.getMinPrice(address(state.usdc));
        uint256 usdgAmount = amount.mulDivDown(
            price * (MAX_BPS - state.slippageThresholdGmx),
            PRICE_PRECISION * MAX_BPS
        );

        usdgAmount = usdgAmount.mulDivDown(10**USDG_DECIMALS, 10**IERC20Metadata(address(state.usdc)).decimals());

        state.batchingManager.depositToken(address(state.usdc), amount, usdgAmount);
    }

    function _rebalanceUnhedgedGlp(
        State storage state,
        uint256 uncappedTokenHedge,
        uint256 cappedTokenHedge
    ) private {
        // console.log('uncappedTokenHedge',uncappedTokenHedge);
        // console.log('cappedTokenHedge',cappedTokenHedge);
        // console.log('totalAssets',totalAssets());

        uint256 unhedgedGlp = _totalAssets(state, false).mulDivDown(
            uncappedTokenHedge - cappedTokenHedge,
            uncappedTokenHedge
        );
        uint256 unhedgedGlpUsdcAmount = unhedgedGlp.mulDivDown(_getGlpPrice(state, false), PRICE_PRECISION);
        // console.log('unhedgedGlp',unhedgedGlp);
        // console.log('unhedgedGlpUsdcAmount',unhedgedGlpUsdcAmount);
        if (unhedgedGlpUsdcAmount > state.unhedgedGlpInUsdc) {
            uint256 glpToUsdcAmount = unhedgedGlpUsdcAmount - state.unhedgedGlpInUsdc;
            state.unhedgedGlpInUsdc += _convertAssetToAUsdc(state, glpToUsdcAmount);
        } else if (unhedgedGlpUsdcAmount < state.unhedgedGlpInUsdc) {
            uint256 usdcToGlpAmount = state.unhedgedGlpInUsdc - unhedgedGlpUsdcAmount;
            state.unhedgedGlpInUsdc -= usdcToGlpAmount;
            _convertAUsdcToAsset(state, usdcToGlpAmount);
        }
    }

    /* ##################################################################
                            AAVE HELPERS
    ################################################################## */

    function _executeBorrow(
        State storage state,
        address token,
        uint256 amount
    ) private {
        state.pool.borrow(token, amount, VARIABLE_INTEREST_MODE, 0, address(this));
    }

    function _executeRepay(
        State storage state,
        address token,
        uint256 amount
    ) private {
        state.pool.repay(token, amount, VARIABLE_INTEREST_MODE, address(this));
    }

    function _executeSupply(
        State storage state,
        address token,
        uint256 amount
    ) private {
        state.pool.supply(token, amount, address(this), 0);
    }

    function _executeWithdraw(
        State storage state,
        address token,
        uint256 amount,
        address receiver
    ) private {
        state.pool.withdraw(token, amount, receiver);
    }

    function _getLiquidationThreshold(State storage state, address asset) private view returns (uint256) {
        DataTypes.ReserveConfigurationMap memory config = state.pool.getConfiguration(asset);
        (
            ,
            /** uint256 ltv **/
            uint256 liquidationThreshold, /** uint256 liquidationBonus */ /** uint256 decimals */ /** uint256 reserveFactor */
            ,
            ,
            ,

        ) = config.getParams();

        return liquidationThreshold;
    }

    /* ##################################################################
                            BALANCER HELPERS
    ################################################################## */

    function _executeFlashloan(
        State storage state,
        address[] memory assets,
        uint256[] memory amounts,
        uint256 _btcTokenAmount,
        uint256 _btcUsdcAmount,
        uint256 _ethTokenAmount,
        uint256 _ethUsdcAmount,
        bool _repayDebtBtc,
        bool _repayDebtEth
    ) private {
        if (assets.length != amounts.length) revert IDnGmxJuniorVault.ArraysLengthMismatch();

        state._hasFlashloaned = true;

        state.balancerVault.flashLoan(
            address(this),
            assets,
            amounts,
            abi.encode(_btcTokenAmount, _btcUsdcAmount, _ethTokenAmount, _ethUsdcAmount, _repayDebtBtc, _repayDebtEth)
        );

        state._hasFlashloaned = false;
    }

    /* ##################################################################
                            VIEW FUNCTIONS
    ################################################################## */

    function _getUsdcBorrowed(State storage state) private view returns (uint256 usdcAmount) {
        return
            uint256(
                state.aUsdc.balanceOf(address(this)).toInt256() -
                    state.dnUsdcDeposited -
                    state.unhedgedGlpInUsdc.toInt256()
            );
    }

    function totalAssets(State storage state) external view returns (uint256) {
        return _totalAssets(state, false);
    }

    function totalAssets(State storage state, bool maximize) external view returns (uint256) {
        return _totalAssets(state, maximize);
    }

    function _totalAssets(State storage state, bool maximize) private view returns (uint256) {
        uint256 unhedgedGlp = state.unhedgedGlpInUsdc.mulDivDown(PRICE_PRECISION, _getGlpPrice(state, !maximize));
        if (!maximize) unhedgedGlp = unhedgedGlp.mulDivDown(MAX_BPS - state.slippageThresholdGmx, MAX_BPS);
        return state.fsGlp.balanceOf(address(this)) + state.batchingManager.dnGmxJuniorVaultGlpBalance() + unhedgedGlp;
    }

    /* solhint-disable not-rely-on-time */
    function isValidRebalanceTime(State storage state) external view returns (bool) {
        return (block.timestamp - state.lastRebalanceTS) > state.rebalanceTimeThreshold;
    }

    function isValidRebalanceHF(State storage state) external view returns (bool) {
        (, , , , , uint256 healthFactor) = state.pool.getUserAccountData(address(this));
        // console.log('healthFactor', healthFactor);
        // console.log('hfThreshold', hfThreshold);

        return healthFactor < (state.hfThreshold * 1e14);
    }

    function isValidRebalanceDeviation(State storage state) external view returns (bool) {
        (uint256 currentBtcBorrow, uint256 currentEthBorrow) = _getCurrentBorrows(state);

        (uint256 optimalBtcBorrow, uint256 optimalEthBorrow) = _getOptimalBorrows(state, _totalAssets(state, false));

        return
            !(_isWithinAllowedDelta(state, optimalBtcBorrow, currentBtcBorrow) &&
                _isWithinAllowedDelta(state, optimalEthBorrow, currentEthBorrow));
    }

    function getTokenPrice(State storage state, IERC20Metadata token) external view returns (uint256) {
        return _getTokenPrice(state, token);
    }

    function _getTokenPrice(State storage state, IERC20Metadata token) private view returns (uint256) {
        uint256 decimals = token.decimals();
        uint256 price = state.oracle.getAssetPrice(address(token));

        // @dev aave returns from same source as chainlink (which is 8 decimals)
        return price.mulDivDown(PRICE_PRECISION, 10**(decimals + 2));
    }

    function getGlpPrice(State storage state, bool maximize) external view returns (uint256) {
        return _getGlpPrice(state, maximize);
    }

    function _getGlpPrice(State storage state, bool maximize) private view returns (uint256) {
        uint256 aum = state.glpManager.getAum(maximize);
        uint256 totalSupply = state.glp.totalSupply();

        return aum.mulDivDown(PRICE_PRECISION, totalSupply * 1e24);
    }

    function getTokenPriceInUsdc(
        State storage state,
        IERC20Metadata token,
        bool isUsdc
    ) external view returns (uint256 scaledPrice) {
        return _getTokenPriceInUsdc(state, token, isUsdc);
    }

    function _getTokenPriceInUsdc(
        State storage state,
        IERC20Metadata token,
        bool isUsdc
    ) private view returns (uint256 scaledPrice) {
        uint256 decimals = token.decimals();
        uint256 price = state.oracle.getAssetPrice(address(token));

        // @dev aave returns from same source as chainlink (which is 8 decimals)
        uint256 quotePrice;

        isUsdc ? quotePrice = state.oracle.getAssetPrice(address(state.usdc)) : quotePrice = state.oracle.getAssetPrice(
            address(state.usdt)
        );

        scaledPrice = price.mulDivDown(PRICE_PRECISION, quotePrice * 10**(decimals - 6));
    }

    // @dev returns price in terms of usdc
    function getTokenPrice(
        State storage state,
        IERC20Metadata token,
        bool isUsdc
    ) external view returns (uint256 scaledPrice) {
        uint256 decimals = token.decimals();
        uint256 price = state.oracle.getAssetPrice(address(token));

        // @dev aave returns from same source as chainlink (which is 8 decimals)
        uint256 quotePrice;

        isUsdc ? quotePrice = state.oracle.getAssetPrice(address(state.usdc)) : quotePrice = state.oracle.getAssetPrice(
            address(state.usdt)
        );

        scaledPrice = price.mulDivDown(PRICE_PRECISION, quotePrice * 10**(decimals - 6));
    }

    /// @dev returns the borrow value in USDC
    function getBorrowValue(
        State storage state,
        uint256 btcAmount,
        uint256 ethAmount
    ) external view returns (uint256 borrowValue) {
        return _getBorrowValue(state, btcAmount, ethAmount);
    }

    function _getBorrowValue(
        State storage state,
        uint256 btcAmount,
        uint256 ethAmount
    ) private view returns (uint256 borrowValue) {
        borrowValue =
            btcAmount.mulDivDown(_getTokenPrice(state, state.wbtc), PRICE_PRECISION) +
            ethAmount.mulDivDown(_getTokenPrice(state, state.weth), PRICE_PRECISION);
        borrowValue = borrowValue.mulDivDown(PRICE_PRECISION, _getTokenPrice(state, state.usdc));
    }

    function flashloanAmounts(
        State storage state,
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
        return _flashloanAmounts(state, token, optimalBorrow, currentBorrow);
    }

    function _flashloanAmounts(
        State storage state,
        address token,
        uint256 optimalBorrow,
        uint256 currentBorrow
    )
        private
        view
        returns (
            uint256 tokenAmount,
            uint256 usdcAmount,
            bool repayDebt
        )
    {
        // check the delta between optimal position and actual position in token terms
        // take that position using swap
        // To Increase
        if (optimalBorrow > currentBorrow) {
            tokenAmount = optimalBorrow - currentBorrow;
            // To swap with the amount in specified hence usdcAmount should be the min amount out
            usdcAmount = _getTokenPriceInUsdc(state, IERC20Metadata(token), true).mulDivDown(
                tokenAmount * (MAX_BPS - state.slippageThresholdSwap),
                MAX_BPS * PRICE_PRECISION
            );

            repayDebt = false;
            // Flash loan ETH/BTC from AAVE
            // In callback: Sell loan for USDC and repay debt
        } else {
            // To Decrease
            tokenAmount = (currentBorrow - optimalBorrow);
            // To swap with amount out specified hence usdcAmount should be the max amount in
            usdcAmount = _getTokenPriceInUsdc(state, IERC20Metadata(token), true).mulDivDown(
                tokenAmount * (MAX_BPS + state.slippageThresholdSwap),
                MAX_BPS * PRICE_PRECISION
            );
            // console.log('currentBorrow', currentBorrow);
            // console.log('optimalBorrow', optimalBorrow);
            // console.log('tokenAmount __', tokenAmount);
            // console.log('usdcAmount __', usdcAmount);

            repayDebt = true;
            // In callback: Swap to ETH/BTC and deposit to AAVE
            // Send back some aUSDC to LB vault
        }
    }

    function getCurrentBorrows(State storage state)
        external
        view
        returns (uint256 currentBtcBorrow, uint256 currentEthBorrow)
    {
        return _getCurrentBorrows(state);
    }

    function _getCurrentBorrows(State storage state)
        private
        view
        returns (uint256 currentBtcBorrow, uint256 currentEthBorrow)
    {
        return (state.vWbtc.balanceOf(address(this)), state.vWeth.balanceOf(address(this)));
    }

    function getOptimalBorrows(State storage state, uint256 glpDeposited)
        external
        view
        returns (uint256 optimalBtcBorrow, uint256 optimalEthBorrow)
    {
        return _getOptimalBorrows(state, glpDeposited);
    }

    function _getOptimalBorrows(State storage state, uint256 glpDeposited)
        private
        view
        returns (uint256 optimalBtcBorrow, uint256 optimalEthBorrow)
    {
        optimalBtcBorrow = _getTokenReservesInGlp(state, address(state.wbtc), glpDeposited);
        optimalEthBorrow = _getTokenReservesInGlp(state, address(state.weth), glpDeposited);
        // console.log('optimalEthBorrow', optimalEthBorrow);
        // console.log('optimalBtcBorrow', optimalBtcBorrow);
    }

    function getOptimalCappedBorrows(
        State storage state,
        uint256 availableBorrowAmount,
        uint256 usdcLiquidationThreshold
    ) external view returns (uint256 optimalBtcBorrow, uint256 optimalEthBorrow) {
        return _getOptimalCappedBorrows(state, availableBorrowAmount, usdcLiquidationThreshold);
    }

    function _getOptimalCappedBorrows(
        State storage state,
        uint256 availableBorrowAmount,
        uint256 usdcLiquidationThreshold
    ) private view returns (uint256 optimalBtcBorrow, uint256 optimalEthBorrow) {
        // console.log("availableBorrowAmount",availableBorrowAmount);

        uint256 maxBorrowValue = availableBorrowAmount.mulDivDown(
            usdcLiquidationThreshold,
            state.targetHealthFactor - usdcLiquidationThreshold
        );
        // console.log("maxBorrowValue",maxBorrowValue);

        uint256 btcWeight = state.gmxVault.tokenWeights(address(state.wbtc));
        uint256 ethWeight = state.gmxVault.tokenWeights(address(state.weth));
        // console.log("btcWeight",btcWeight);
        // console.log("ethWeight",ethWeight);

        uint256 btcPrice = _getTokenPrice(state, state.wbtc);
        uint256 ethPrice = _getTokenPrice(state, state.weth);

        optimalBtcBorrow = maxBorrowValue.mulDivDown(btcWeight * PRICE_PRECISION, (btcWeight + ethWeight) * btcPrice);
        optimalEthBorrow = maxBorrowValue.mulDivDown(ethWeight * PRICE_PRECISION, (btcWeight + ethWeight) * ethPrice);
        // console.log("optimalBtcBorrow",optimalBtcBorrow);
        // console.log("optimalEthBorrow",optimalEthBorrow);
    }

    function getTokenReservesInGlp(
        State storage state,
        address token,
        uint256 glpDeposited
    ) external view returns (uint256) {
        return _getTokenReservesInGlp(state, token, glpDeposited);
    }

    function _getTokenReservesInGlp(
        State storage state,
        address token,
        uint256 glpDeposited
    ) private view returns (uint256) {
        uint256 targetWeight = state.gmxVault.tokenWeights(token);
        uint256 totalTokenWeights = state.gmxVault.totalTokenWeights();

        uint256 glpPrice = _getGlpPrice(state, false);
        uint256 tokenPrice = _getTokenPrice(state, IERC20Metadata(token));

        return targetWeight.mulDivDown(glpDeposited * glpPrice, totalTokenWeights * tokenPrice);
    }

    function isWithinAllowedDelta(
        State storage state,
        uint256 optimalBorrow,
        uint256 currentBorrow
    ) external view returns (bool) {
        return _isWithinAllowedDelta(state, optimalBorrow, currentBorrow);
    }

    function _isWithinAllowedDelta(
        State storage state,
        uint256 optimalBorrow,
        uint256 currentBorrow
    ) private view returns (bool) {
        // console.log('optimalBorrow', optimalBorrow);
        // console.log('currentBorrow', currentBorrow);

        uint256 diff = optimalBorrow > currentBorrow ? optimalBorrow - currentBorrow : currentBorrow - optimalBorrow;
        // console.log('diff', diff);
        // console.log('RHS', uint256(rebalanceDeltaThreshold).mulDivDown(currentBorrow, MAX_BPS));
        return diff <= uint256(state.rebalanceDeltaThreshold).mulDivDown(currentBorrow, MAX_BPS);
    }

    function _getOptimalCappedBorrow(
        uint256 requiredBorrow,
        uint256 availableBorrow,
        uint256 optimalTokenBorrow
    ) private pure returns (uint256 optimalCappedTokenBorrow) {
        // console.log("availableBorrowAmount",availableBorrowAmount);
        optimalCappedTokenBorrow = optimalTokenBorrow.mulDivDown(availableBorrow, requiredBorrow);
        // console.log("optimalBtcBorrow",optimalBtcBorrow);
        // console.log("optimalEthBorrow",optimalEthBorrow);
    }

    // ISwapRouter internal constant swapRouter = ISwapRouter(0xE592427A0AEce92De3Edee1F18E0157C05861564);

    function swapToken(
        State storage state,
        address token,
        uint256 tokenAmount,
        uint256 minUsdcAmount
    ) external returns (uint256 usdcReceived, uint256 tokensUsed) {
        ISwapRouter swapRouter = state.swapRouter;

        bytes memory path = token == weth ? WETH_TO_USDC : WBTC_TO_USDC;

        ISwapRouter.ExactInputParams memory params = ISwapRouter.ExactInputParams({
            path: path,
            recipient: address(this),
            deadline: block.timestamp,
            amountIn: tokenAmount,
            amountOutMinimum: minUsdcAmount
        });

        tokensUsed = tokenAmount;
        usdcReceived = swapRouter.exactInput(params);
    }

    function swapUSDC(
        State storage state,
        address token,
        uint256 tokenAmount,
        uint256 maxUsdcAmount
    ) external returns (uint256 usdcPaid, uint256 tokensReceived) {
        ISwapRouter swapRouter = state.swapRouter;

        bytes memory path = token == weth ? USDC_TO_WETH : USDC_TO_WBTC;

        ISwapRouter.ExactOutputParams memory params = ISwapRouter.ExactOutputParams({
            path: path,
            recipient: address(this),
            deadline: block.timestamp,
            amountOut: tokenAmount,
            amountInMaximum: maxUsdcAmount
        });

        tokensReceived = tokenAmount;
        usdcPaid = swapRouter.exactOutput(params);
    }
}
