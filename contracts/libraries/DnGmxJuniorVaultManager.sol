// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import { IVault } from '../interfaces/gmx/IVault.sol';
import { IGlpManager } from '../interfaces/gmx/IGlpManager.sol';
import { IRewardTracker } from '../interfaces/gmx/IRewardTracker.sol';
import { IRewardRouterV2 } from '../interfaces/gmx/IRewardRouterV2.sol';

import { IDebtToken } from '../interfaces/IDebtToken.sol';
import { IPool } from '@aave/core-v3/contracts/interfaces/IPool.sol';
import { IAToken } from '@aave/core-v3/contracts/interfaces/IAToken.sol';
import { IPriceOracle } from '@aave/core-v3/contracts/interfaces/IPriceOracle.sol';
import { DataTypes } from '@aave/core-v3/contracts/protocol/libraries/types/DataTypes.sol';
import { IPoolAddressesProvider } from '@aave/core-v3/contracts/interfaces/IPoolAddressesProvider.sol';
import { IRewardsController } from '@aave/periphery-v3/contracts/rewards/interfaces/IRewardsController.sol';
import { ReserveConfiguration } from '@aave/core-v3/contracts/protocol/libraries/configuration/ReserveConfiguration.sol';

import { IBalancerVault } from '../interfaces/balancer/IBalancerVault.sol';

import { IERC20 } from '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import { IERC20Metadata } from '@openzeppelin/contracts/interfaces/IERC20Metadata.sol';

import { IDnGmxJuniorVault } from '../interfaces/IDnGmxJuniorVault.sol';
import { IDnGmxSeniorVault } from '../interfaces/IDnGmxSeniorVault.sol';
import { IDnGmxBatchingManager } from '../interfaces/IDnGmxBatchingManager.sol';
import { SafeCast } from '../libraries/SafeCast.sol';
import { FixedPointMathLib } from '@rari-capital/solmate/src/utils/FixedPointMathLib.sol';

import { ISwapRouter } from '@uniswap/v3-periphery/contracts/interfaces/ISwapRouter.sol';

// import 'hardhat/console.sol';

library DnGmxJuniorVaultManager {
    using DnGmxJuniorVaultManager for State;
    using ReserveConfiguration for DataTypes.ReserveConfigurationMap;

    using FixedPointMathLib for uint256;
    using SafeCast for uint256;

    uint256 internal constant MAX_BPS = 10_000;
    uint256 internal constant USDG_DECIMALS = 18;

    uint256 internal constant PRICE_PRECISION = 1e30;
    uint256 internal constant VARIABLE_INTEREST_MODE = 2;

    struct Tokens {
        IERC20Metadata weth;
        IERC20Metadata wbtc;
        IERC20Metadata sGlp;
        IERC20Metadata usdc;
    }

    // prettier-ignore
    struct State {
        // core protocol roles
        address keeper;
        address feeRecipient;

        // accounting
        int256 dnUsdcDeposited;
        uint256 unhedgedGlpInUsdc;
        uint256 targetHealthFactor;

        // accumulators
        uint256 protocolFee;
        uint256 protocolEsGmx;
        uint256 seniorVaultWethRewards;

        // locks
        bool hasFlashloaned;
        uint48 lastRebalanceTS;

        // fees
        uint16 feeBps;
        uint16 withdrawFeeBps;

        // thresholds
        uint256 depositCap;

        uint16 slippageThresholdGmxBps; // bps
        uint16 slippageThresholdSwapBtcBps; // bps
        uint16 slippageThresholdSwapEthBps; // bps
        uint16 rebalanceHfThresholdBps; // bps
        uint32 rebalanceTimeThreshold; // seconds between rebalance
        uint16 rebalanceDeltaThresholdBps; // bps
        uint128 wethConversionThreshold; // eth amount

        uint128 usdcConversionThreshold; // usdc amount
        uint128 hedgeUsdcAmountThreshold; // usdc amount

        uint128 partialBtcHedgeUsdcAmountThreshold; // usdc amount
        uint128 partialEthHedgeUsdcAmountThreshold; // usdc amount

        // token addrs
        IERC20 fsGlp;
        IERC20Metadata glp;
        IERC20Metadata usdc;
        IERC20Metadata weth;
        IERC20Metadata wbtc;

        // aave protocol addrs
        IPool pool;
        IAToken aUsdc;
        IDebtToken vWbtc;
        IDebtToken vWeth;
        IPriceOracle oracle;
        IRewardsController aaveRewardsController;
        IPoolAddressesProvider poolAddressProvider;

        // gmx protocol addrs
        IVault gmxVault;
        IRewardTracker sGmx;
        IGlpManager glpManager;
        IRewardRouterV2 rewardRouter;

        // other external protocols
        ISwapRouter swapRouter;
        IBalancerVault balancerVault;

        // core protocol addrs
        IDnGmxSeniorVault dnGmxSeniorVault;
        IDnGmxBatchingManager batchingManager;

        uint256[50] __gaps;
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

    function _getOptimalPartialBorrows(
        State storage state,
        IERC20Metadata token,
        uint256 optimalTokenBorrow,
        uint256 currentTokenBorrow
    ) internal view returns (uint256 optimalPartialTokenBorrow, bool isPartialTokenHedge) {
        bool isOptimalHigher = optimalTokenBorrow > currentTokenBorrow;
        uint256 diff = isOptimalHigher
            ? optimalTokenBorrow - currentTokenBorrow
            : currentTokenBorrow - optimalTokenBorrow;

        uint256 threshold = address(token) == address(state.wbtc)
            ? state.partialBtcHedgeUsdcAmountThreshold
            : state.partialEthHedgeUsdcAmountThreshold;
        uint256 tokenThreshold = threshold.mulDivDown(PRICE_PRECISION, _getTokenPriceInUsdc(state, token));
        if (diff > tokenThreshold) {
            // console.log('threshold',threshold);
            // console.log('diff',diff,'tokenThreshold',tokenThreshold);
            optimalPartialTokenBorrow = isOptimalHigher
                ? currentTokenBorrow + tokenThreshold
                : currentTokenBorrow - tokenThreshold;
            isPartialTokenHedge = true;
        } else {
            optimalPartialTokenBorrow = optimalTokenBorrow;
        }
    }

    /// @notice settles collateral for the vault
    /// @dev to be called after settle profits only (since vaultMarketValue if after settlement of profits)
    /// @param currentBtcBorrow The amount of USDC collateral token deposited to LB Protocol
    /// @param currentEthBorrow The market value of ETH/BTC part in sGLP
    function rebalanceHedge(
        State storage state,
        uint256 currentBtcBorrow,
        uint256 currentEthBorrow,
        uint256 glpDeposited,
        bool isPartialAllowed
    ) external returns (bool isPartialHedge) {
        // console.log('totalAssets()', totalAssets());
        (uint256 optimalBtcBorrow, uint256 optimalEthBorrow) = _getOptimalBorrows(state, glpDeposited);
        // console.log('currentBtcBorrow', currentBtcBorrow);
        // console.log('currentEthBorrow', currentEthBorrow);
        // console.log('optimalBtcBorrow', optimalBtcBorrow);
        // console.log('optimalEthBorrow', optimalEthBorrow);
        if (isPartialAllowed) {
            bool isPartialBtcHedge;
            bool isPartialEthHedge;
            (optimalBtcBorrow, isPartialBtcHedge) = _getOptimalPartialBorrows(
                state,
                state.wbtc,
                optimalBtcBorrow,
                currentBtcBorrow
            );
            (optimalEthBorrow, isPartialEthHedge) = _getOptimalPartialBorrows(
                state,
                state.weth,
                optimalEthBorrow,
                currentEthBorrow
            );
            isPartialHedge = isPartialBtcHedge || isPartialEthHedge;
            // console.log('isPartialBtcHedge');
            // console.log(isPartialBtcHedge);
            // console.log('isPartialEthHedge');
            // console.log(isPartialEthHedge);
            // console.log('isPartialHedge');
            // console.log(isPartialHedge);
        }

        // console.log('optimalBtcBorrow after partial check', optimalBtcBorrow);
        // console.log('optimalEthBorrow after partial check', optimalEthBorrow);

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
            {
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
        internal
        returns (uint256 usdcAmountOut)
    {
        /// @dev if usdcAmountDesired < 10, then there is precision issue in gmx contracts while redeeming for usdg

        if (usdcAmountDesired < state.usdcConversionThreshold) return 0;
        address _usdc = address(state.usdc);

        // @dev using max price of usdc becausing buying usdc for glp
        uint256 usdcPrice = state.gmxVault.getMaxPrice(_usdc);

        uint256 minUsdcOut = usdcAmountDesired.mulDivDown(
            usdcPrice * (MAX_BPS - state.slippageThresholdGmxBps),
            PRICE_PRECISION * MAX_BPS
        );

        uint256 glpAmountInput = usdcAmountDesired.mulDivDown(PRICE_PRECISION, _getGlpPrice(state, false));

        // console.log('usdcAmountDesired', usdcAmountDesired);
        // console.log('usdcPrice', usdcPrice);
        // console.log('minUsdcOut', minUsdcOut);
        // console.log('priceOfGlp', _getGlpPrice(state, false));
        // console.log('glpAmountInput', glpAmountInput);

        usdcAmountOut = state.rewardRouter.unstakeAndRedeemGlp(_usdc, glpAmountInput, minUsdcOut, address(this));

        _executeSupply(state, _usdc, usdcAmountOut);
    }

    /// @notice sells usdc for LP tokens and then stakes LP tokens
    /// @param amount amount of usdc
    function _convertAUsdcToAsset(State storage state, uint256 amount) internal {
        _executeWithdraw(state, address(state.usdc), amount, address(this));
        // USDG has 18 decimals and usdc has 6 decimals => 18-6 = 12
        uint256 price = state.gmxVault.getMinPrice(address(state.usdc));
        uint256 usdgAmount = amount.mulDivDown(
            price * (MAX_BPS - state.slippageThresholdGmxBps),
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
        // console.log('uncappedTokenHedge', uncappedTokenHedge);
        // console.log('cappedTokenHedge', cappedTokenHedge);
        // console.log('totalAssets', IERC4626(address(this)).totalAssets());

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
    /*
        AAVE HELPERS
    */

    ///@notice executes borrow of "token" of "amount" quantity to AAVE at variable interest rate
    ///@param token address of token to borrow
    ///@param amount amount of token to borrow
    function _executeBorrow(
        State storage state,
        address token,
        uint256 amount
    ) internal {
        state.pool.borrow(token, amount, VARIABLE_INTEREST_MODE, 0, address(this));
    }

    ///@notice executes repay of "token" of "amount" quantity to AAVE at variable interest rate
    ///@param token address of token to borrow
    ///@param amount amount of token to borrow
    function _executeRepay(
        State storage state,
        address token,
        uint256 amount
    ) internal {
        state.pool.repay(token, amount, VARIABLE_INTEREST_MODE, address(this));
    }

    ///@notice executes supply of "token" of "amount" quantity to AAVE
    ///@param token address of token to borrow
    ///@param amount amount of token to borrow
    function _executeSupply(
        State storage state,
        address token,
        uint256 amount
    ) internal {
        state.pool.supply(token, amount, address(this), 0);
    }

    ///@notice executes withdraw of "token" of "amount" quantity to AAVE
    ///@param token address of token to borrow
    ///@param amount amount of token to borrow
    ///@param receiver address to which withdrawn tokens should be sent
    function _executeWithdraw(
        State storage state,
        address token,
        uint256 amount,
        address receiver
    ) internal {
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
    ) internal {
        if (assets.length != amounts.length) revert IDnGmxJuniorVault.ArraysLengthMismatch();

        state.hasFlashloaned = true;

        state.balancerVault.flashLoan(
            address(this),
            assets,
            amounts,
            abi.encode(_btcTokenAmount, _btcUsdcAmount, _ethTokenAmount, _ethUsdcAmount, _repayDebtBtc, _repayDebtEth)
        );

        state.hasFlashloaned = false;
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
        if (!maximize) unhedgedGlp = unhedgedGlp.mulDivDown(MAX_BPS - state.slippageThresholdGmxBps, MAX_BPS);
        return state.fsGlp.balanceOf(address(this)) + state.batchingManager.dnGmxJuniorVaultGlpBalance() + unhedgedGlp;
    }

    /* solhint-disable not-rely-on-time */
    function isValidRebalanceTime(State storage state) external view returns (bool) {
        return (block.timestamp - state.lastRebalanceTS) > state.rebalanceTimeThreshold;
    }

    function isValidRebalanceHF(State storage state) external view returns (bool) {
        (, , , , , uint256 healthFactor) = state.pool.getUserAccountData(address(this));
        // console.log('healthFactor', healthFactor);
        // console.log('rebalanceHfThresholdBps', rebalanceHfThresholdBps);

        return healthFactor < (uint256(state.rebalanceHfThresholdBps) * 1e14);
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

    function getTokenPriceInUsdc(State storage state, IERC20Metadata token)
        external
        view
        returns (uint256 scaledPrice)
    {
        return _getTokenPriceInUsdc(state, token);
    }

    function _getTokenPriceInUsdc(State storage state, IERC20Metadata token)
        private
        view
        returns (uint256 scaledPrice)
    {
        uint256 decimals = token.decimals();
        uint256 price = state.oracle.getAssetPrice(address(token));

        // @dev aave returns from same source as chainlink (which is 8 decimals)
        uint256 quotePrice = state.oracle.getAssetPrice(address(state.usdc));

        scaledPrice = price.mulDivDown(PRICE_PRECISION, quotePrice * 10**(decimals - 6));
    }

    function getLiquidationThreshold(State storage state, address asset) external view returns (uint256) {
        return _getLiquidationThreshold(state, asset);
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
        uint256 slippageThresholdSwap = token == address(state.wbtc)
            ? state.slippageThresholdSwapBtcBps
            : state.slippageThresholdSwapEthBps;
        // check the delta between optimal position and actual position in token terms
        // take that position using swap
        // To Increase
        if (optimalBorrow > currentBorrow) {
            tokenAmount = optimalBorrow - currentBorrow;
            // To swap with the amount in specified hence usdcAmount should be the min amount out
            usdcAmount = _getTokenPriceInUsdc(state, IERC20Metadata(token)).mulDivDown(
                tokenAmount * (MAX_BPS - slippageThresholdSwap),
                MAX_BPS * PRICE_PRECISION
            );

            repayDebt = false;
            // Flash loan ETH/BTC from AAVE
            // In callback: Sell loan for USDC and repay debt
        } else {
            // To Decrease
            tokenAmount = (currentBorrow - optimalBorrow);
            // To swap with amount out specified hence usdcAmount should be the max amount in
            usdcAmount = _getTokenPriceInUsdc(state, IERC20Metadata(token)).mulDivDown(
                tokenAmount * (MAX_BPS + slippageThresholdSwap),
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
        // console.log('RHS', uint256(rebalanceDeltaThresholdBps).mulDivDown(currentBorrow, MAX_BPS));
        return diff <= uint256(state.rebalanceDeltaThresholdBps).mulDivDown(currentBorrow, MAX_BPS);
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

        bytes memory path = token == address(state.weth) ? WETH_TO_USDC(state) : WBTC_TO_USDC(state);

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

        bytes memory path = token == address(state.weth) ? USDC_TO_WETH(state) : USDC_TO_WBTC(state);

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

    function USDC_TO_WETH(State storage state) internal view returns (bytes memory) {
        return abi.encodePacked(state.weth, uint24(500), state.usdc);
    }

    function USDC_TO_WBTC(State storage state) internal view returns (bytes memory) {
        return abi.encodePacked(state.wbtc, uint24(3000), state.weth, uint24(500), state.usdc);
    }

    function WETH_TO_USDC(State storage state) internal view returns (bytes memory) {
        return abi.encodePacked(state.weth, uint24(500), state.usdc);
    }

    function WBTC_TO_USDC(State storage state) internal view returns (bytes memory) {
        return abi.encodePacked(state.wbtc, uint24(3000), state.weth, uint24(500), state.usdc);
    }
}
