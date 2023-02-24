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
import { IDnGmxTraderHedgeStrategy } from '../interfaces/IDnGmxTraderHedgeStrategy.sol';

import { SafeCast } from '../libraries/SafeCast.sol';
import { FeeSplitStrategy } from '../libraries/FeeSplitStrategy.sol';
import { SignedFixedPointMathLib } from '../libraries/SignedFixedPointMathLib.sol';
import { QuoterLib } from '../libraries/QuoterLib.sol';
import { SwapPath } from '../libraries/SwapPath.sol';

import { FixedPointMathLib } from '@rari-capital/solmate/src/utils/FixedPointMathLib.sol';

import { Simulate } from '@uniswap/v3-core/contracts/libraries/Simulate.sol';
import { ISwapRouter } from '@uniswap/v3-periphery/contracts/interfaces/ISwapRouter.sol';

/**
 * @title Helper library for junior vault
 * @dev junior vault delegates calls to this library for logic
 * @author RageTrade
 */

library DnGmxJuniorVaultManager {
    event RewardsHarvested(
        uint256 wethHarvested,
        uint256 esGmxStaked,
        uint256 juniorVaultWeth,
        uint256 seniorVaultWeth,
        uint256 juniorVaultGlp,
        uint256 seniorVaultAUsdc
    );

    event ProtocolFeeAccrued(uint256 fees);

    event GlpSwapped(uint256 glpQuantity, uint256 usdcQuantity, bool fromGlpToUsdc);

    event TokenSwapped(address indexed fromToken, address indexed toToken, uint256 fromQuantity, uint256 toQuantity);

    event VaultState(
        uint256 indexed eventType,
        uint256 btcBorrows,
        uint256 ethBorrows,
        uint256 glpPrice,
        uint256 glpBalance,
        uint256 totalAssets,
        int256 dnUsdcDeposited,
        uint256 unhedgedGlpInUsdc,
        uint256 juniorVaultAusdc,
        uint256 seniorVaultAusdc
    );

    using DnGmxJuniorVaultManager for State;
    using ReserveConfiguration for DataTypes.ReserveConfigurationMap;

    using FixedPointMathLib for uint256;
    using SafeCast for uint256;
    using SignedFixedPointMathLib for int256;

    uint256 internal constant MAX_BPS = 10_000;

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
        // amount of usdc deposited by junior tranche into AAVE
        int256 dnUsdcDeposited;
        // amount of asset which is in usdc (due to borrow limits / availability issue some glp might remain unhedged)
        uint256 unhedgedGlpInUsdc;
        // health factor to be targetted on AAVE
        uint256 targetHealthFactor;

        // accumulators
        // protocol fee taken from ETH rewards
        uint256 protocolFee;
        // protocol fee taken from esGMX rewards
        uint256 protocolEsGmx;
        // senior tranche part of eth rewards which is not converted to usdc
        uint256 seniorVaultWethRewards;

        // locks
        // true if a flashloan has been initiated by the vault
        bool hasFlashloaned;
        // ensures that the rebalance can be run only after certain intervals
        uint48 lastRebalanceTS;

        // fees
        // protocol fees charged on the eth and esGmx rewards
        uint16 feeBps;
        // fees on the withdrawn assets
        uint16 withdrawFeeBps;
        // fee tier for uniswap path
        uint24 feeTierWethWbtcPool;

        // thresholds
        uint256 depositCap;

        // slippage threshold on asset conversion into glp
        uint16 slippageThresholdGmxBps; // bps
        // slippage threshold on btc swap on uniswap
        uint16 slippageThresholdSwapBtcBps; // bps
        // slippage threshold on eth swap on uniswap
        uint16 slippageThresholdSwapEthBps; // bps
        // health factor treshold below which rebalance can be called
        uint16 rebalanceHfThresholdBps; // bps
        // time threshold beyond which on top of last rebalance, rebalance can be called
        uint32 rebalanceTimeThreshold; // seconds between rebalance
        // difference between current and optimal amounts beyond which rebalance can be called
        uint16 rebalanceDeltaThresholdBps; // bps
        // eth amount of weth rewards accrued beyond which they can be compounded
        uint128 wethConversionThreshold; // eth amount

        // usdc amount beyond which usdc can be converted to assets
        uint128 usdcConversionThreshold; // usdc amount
        // usdc value of token hedges below which hedges are not taken
        uint128 hedgeUsdcAmountThreshold; // usdc amount

        // usdc amount of btc hedge beyond which partial hedges are taken over multiple rebalances
        uint128 partialBtcHedgeUsdcAmountThreshold; // usdc amount
        // usdc amount of eth hedge beyond which partial hedges are taken over multiple rebalances
        uint128 partialEthHedgeUsdcAmountThreshold; // usdc amount

        // token addrs
        IERC20 fsGlp;
        IERC20Metadata glp;
        IERC20Metadata usdc;
        IERC20Metadata weth;
        IERC20Metadata wbtc;

        // aave protocol addrs
        // lending pool for liqudity market
        IPool pool;
        // aave interest bearing usdc
        IAToken aUsdc;
        // variable-rate debt accruing btc
        IDebtToken vWbtc;
        // variable-rate debt accruing eth
        IDebtToken vWeth;
        // cannocial oracle used by aave
        IPriceOracle oracle;
        // rewards controller to claim any emissions (for future use)
        IRewardsController aaveRewardsController;
        // immutable address provider to obtain various addresses
        IPoolAddressesProvider poolAddressProvider;

        // gmx protocol addrs
        // core gmx vault
        IVault gmxVault;
        // staked gmx
        IRewardTracker sGmx;
        // glp manager (for giving assets allowance and fetching AUM)
        IGlpManager glpManager;
        // old rewardRouter for all actions except minting and burning glp
        IRewardRouterV2 rewardRouter;
        // new rewardRouter to be used for mintAndStakeGlp and unstakeAndRedeem
        // ref: https://medium.com/@gmx.io/gmx-deployment-updates-nov-2022-16572314874d
        IRewardRouterV2 mintBurnRewardRouter;

        // other external protocols
        // uniswap swap router for token swaps
        ISwapRouter swapRouter;
        // balancer vault for flashloans
        IBalancerVault balancerVault;

        // core protocol addrs
        // senior tranche address
        IDnGmxSeniorVault dnGmxSeniorVault;
        // batching manager address
        IDnGmxBatchingManager batchingManager;

        // !!! STORAGE EXTENSIONS !!! (reduced gaps by no. of slots added here)
        uint128 btcPoolAmount;
        uint128 ethPoolAmount;

        int128 btcTraderOIHedge;
        int128 ethTraderOIHedge;

        IDnGmxTraderHedgeStrategy dnGmxTraderHedgeStrategy;

        uint128 rebalanceProfitUsdcAmountThreshold;

        // gaps for extending struct (if required during upgrade)
        uint256[46] __gaps;
    }

    /// @notice stakes the rewards from the staked Glp and claims WETH to buy glp
    /// @notice also update protocolEsGmx fees which can be vested and claimed
    /// @notice divides the fees between senior and junior tranches based on senior tranche util
    /// @notice for junior tranche weth is deposited to batching manager which handles conversion to sGLP
    /// @notice for senior tranche weth is converted into usdc and deposited on AAVE which increases the borrowed amount
    function harvestFees(State storage state) public {
        uint256 sGmxHarvested;
        {
            address esGmx = state.rewardRouter.esGmx();
            IRewardTracker sGmx = IRewardTracker(state.rewardRouter.stakedGmxTracker());

            // existing staked gmx balance
            uint256 sGmxPrevBalance = sGmx.depositBalances(address(this), esGmx);

            // handles claiming and staking of esGMX, staking of multiplier points and claim of WETH rewards on GMX
            state.rewardRouter.handleRewards({
                shouldClaimGmx: false,
                shouldStakeGmx: false,
                shouldClaimEsGmx: true,
                shouldStakeEsGmx: true,
                shouldStakeMultiplierPoints: true,
                shouldClaimWeth: true,
                shouldConvertWethToEth: false
            });

            // harvested staked gmx
            sGmxHarvested = sGmx.depositBalances(address(this), esGmx) - sGmxPrevBalance;
        }
        // protocol esGMX fees
        state.protocolEsGmx += sGmxHarvested.mulDivDown(state.feeBps, MAX_BPS);

        // total weth harvested which is not compounded
        // its possible that this is accumulated value over multiple rebalance if in all of those it was below threshold
        uint256 wethHarvested = state.weth.balanceOf(address(this)) - state.protocolFee - state.seniorVaultWethRewards;

        if (wethHarvested > state.wethConversionThreshold) {
            // weth harvested > conversion threshold
            uint256 protocolFeeHarvested = (wethHarvested * state.feeBps) / MAX_BPS;
            // protocol fee incremented
            state.protocolFee += protocolFeeHarvested;
            emit ProtocolFeeAccrued(protocolFeeHarvested);

            // protocol fee to be kept in weth
            // remaining amount needs to be compounded
            uint256 wethToCompound = wethHarvested - protocolFeeHarvested;

            // share of the wethToCompound that belongs to senior tranche
            uint256 dnGmxSeniorVaultWethShare = state.dnGmxSeniorVault.getEthRewardsSplitRate().mulDivDown(
                wethToCompound,
                FeeSplitStrategy.RATE_PRECISION
            );
            // share of the wethToCompound that belongs to junior tranche
            uint256 dnGmxWethShare = wethToCompound - dnGmxSeniorVaultWethShare;

            // total senior tranche weth which is not compounded
            uint256 _seniorVaultWethRewards = state.seniorVaultWethRewards + dnGmxSeniorVaultWethShare;

            uint256 glpReceived;
            {
                // converts junior tranche share of weth into glp using batching manager
                // we need to use batching manager since there is a cooldown period on sGLP
                // if deposited directly for next 15mins withdrawals would fail
                uint256 price = state.gmxVault.getMinPrice(address(state.weth));

                uint256 usdgAmount = dnGmxWethShare.mulDivDown(
                    price * (MAX_BPS - state.slippageThresholdGmxBps),
                    PRICE_PRECISION * MAX_BPS
                );

                // deposits weth into batching manager which handles the conversion into glp
                // can be taken back through batch execution
                glpReceived = _stakeGlp(state, address(state.weth), dnGmxWethShare, usdgAmount);
            }

            if (_seniorVaultWethRewards > state.wethConversionThreshold) {
                // converts senior tranche share of weth into usdc and deposit into AAVE
                // Deposit aave vault share to AAVE in usdc
                uint256 minUsdcAmount = _getTokenPriceInUsdc(state, state.weth).mulDivDown(
                    _seniorVaultWethRewards * (MAX_BPS - state.slippageThresholdSwapEthBps),
                    MAX_BPS * PRICE_PRECISION
                );
                // swaps weth into usdc
                (uint256 aaveUsdcAmount, ) = state._swapToken(
                    address(state.weth),
                    _seniorVaultWethRewards,
                    minUsdcAmount
                );

                // supplies usdc into AAVE
                state._executeSupply(address(state.usdc), aaveUsdcAmount);

                // resets senior tranche rewards
                state.seniorVaultWethRewards = 0;

                emit RewardsHarvested(
                    wethHarvested,
                    sGmxHarvested,
                    dnGmxWethShare,
                    dnGmxSeniorVaultWethShare,
                    glpReceived,
                    aaveUsdcAmount
                );
            } else {
                state.seniorVaultWethRewards = _seniorVaultWethRewards;
                emit RewardsHarvested(
                    wethHarvested,
                    sGmxHarvested,
                    dnGmxWethShare,
                    dnGmxSeniorVaultWethShare,
                    glpReceived,
                    0
                );
            }
        } else {
            emit RewardsHarvested(wethHarvested, sGmxHarvested, 0, 0, 0, 0);
        }
    }

    /* ##################################################################
                            REBALANCE HELPERS
    ################################################################## */

    ///@notice rebalances pnl on AAVE againts the sGLP assets
    ///@param state set of all state variables of vault
    ///@param borrowValue value of the borrowed assests(ETH + BTC) from AAVE in USDC
    function rebalanceProfit(State storage state, uint256 borrowValue) external {
        return _rebalanceProfit(state, borrowValue);
    }

    ///@notice rebalances pnl on AAVE againts the sGLP assets
    ///@dev converts assets into usdc and deposits to AAVE if profit on GMX and loss on AAVE
    ///@dev withdraws usdc from aave and converts to GLP if loss on GMX and profits on AAVE
    ///@param state set of all state variables of vault
    ///@param borrowValue value of the borrowed assests(ETH + BTC) from AAVE in USDC
    function _rebalanceProfit(State storage state, uint256 borrowValue) private {
        int256 borrowVal = borrowValue.toInt256();

        if (borrowVal > state.dnUsdcDeposited) {
            uint256 diff = uint256(borrowVal - state.dnUsdcDeposited);
            if (diff < state.rebalanceProfitUsdcAmountThreshold && !_isValidRebalanceHF(state)) return;
            // If glp goes up - there is profit on GMX and loss on AAVE
            // So convert some glp to usdc and deposit to AAVE
            state.dnUsdcDeposited += _convertAssetToAUsdc(state, diff).toInt256();
        } else if (borrowVal < state.dnUsdcDeposited) {
            uint256 diff = uint256(state.dnUsdcDeposited - borrowVal);
            if (diff < state.rebalanceProfitUsdcAmountThreshold) return;
            // If glp goes down - there is profit on AAVE and loss on GMX
            // So withdraw some aave usdc and convert to glp
            _convertAUsdcToAsset(state, diff);
            state.dnUsdcDeposited = borrowVal;
        }
    }

    ///@notice rebalances the assets borrowed from AAVE to hedge ETH and BTC underlying the assets
    ///@param state set of all state variables of vault
    ///@param optimalBtcBorrow optimal btc amount to hedge sGLP btc underlying completely
    ///@param currentBtcBorrow current btc amount borrowed from AAVE
    ///@param optimalEthBorrow optimal eth amount to hedge sGLP btc underlying completely
    ///@param currentEthBorrow current eth amount borrowed from AAVE
    function rebalanceBorrow(
        State storage state,
        uint256 optimalBtcBorrow,
        uint256 currentBtcBorrow,
        uint256 optimalEthBorrow,
        uint256 currentEthBorrow
    ) external {
        return _rebalanceBorrow(state, optimalBtcBorrow, currentBtcBorrow, optimalEthBorrow, currentEthBorrow);
    }

    ///@notice rebalances the assets borrowed from AAVE to hedge ETH and BTC underlying the assets
    ///@param state set of all state variables of vault
    ///@param optimalBtcBorrow optimal btc amount to hedge sGLP btc underlying completely
    ///@param currentBtcBorrow current btc amount borrowed from AAVE
    ///@param optimalEthBorrow optimal eth amount to hedge sGLP btc underlying completely
    ///@param currentEthBorrow current eth amount borrowed from AAVE
    function _rebalanceBorrow(
        State storage state,
        uint256 optimalBtcBorrow,
        uint256 currentBtcBorrow,
        uint256 optimalEthBorrow,
        uint256 currentEthBorrow
    ) private {
        address[] memory assets;
        uint256[] memory amounts;

        // calculate the token/usdc amount to be flashloaned from balancer
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

        // no swap needs to happen if the amount to hedge < threshold
        if (btcUsdcAmount < state.hedgeUsdcAmountThreshold) {
            btcTokenAmount = 0;
            btcUsdcAmount = 0;
        }
        if (ethUsdcAmount < state.hedgeUsdcAmountThreshold) {
            ethTokenAmount = 0;
            ethUsdcAmount = 0;
        }

        // get asset amount basis increase/decrease of token amounts
        uint256 btcAssetAmount = repayDebtBtc ? btcUsdcAmount : btcTokenAmount;
        uint256 ethAssetAmount = repayDebtEth ? ethUsdcAmount : ethTokenAmount;

        // If both eth and btc swap amounts are not beyond the threshold then no flashloan needs to be executed | case 1
        if (btcAssetAmount == 0 && ethAssetAmount == 0) return;

        if (repayDebtBtc && repayDebtEth) {
            // case where both the token assets are USDC
            // only one entry required which is combined asset amount for both tokens
            assets = new address[](1);
            amounts = new uint256[](1);

            assets[0] = address(state.usdc);
            amounts[0] = (btcAssetAmount + ethAssetAmount);
        } else if (btcAssetAmount == 0 || ethAssetAmount == 0) {
            // Exactly one would be true since case-1 excluded (both false) | case-2
            // One token amount = 0 and other token amount > 0
            // only one entry required for the non-zero amount token
            assets = new address[](1);
            amounts = new uint256[](1);

            if (btcAssetAmount != 0) {
                assets[0] = (repayDebtBtc ? address(state.usdc) : address(state.wbtc));
                amounts[0] = btcAssetAmount;
            } else {
                assets[0] = (repayDebtEth ? address(state.usdc) : address(state.weth));
                amounts[0] = ethAssetAmount;
            }
        } else {
            // Both are true | case-3
            assets = new address[](2);
            amounts = new uint256[](2);

            assets[0] = repayDebtBtc ? address(state.usdc) : address(state.wbtc);

            assets[1] = repayDebtEth ? address(state.usdc) : address(state.weth);

            // ensure that assets and amount tuples are in sorted order of addresses
            // (required for balancer flashloans)
            if (assets[0] > assets[1]) {
                // if the order is descending
                // switch the order for assets tupe
                // assign amounts in opposite order
                address tempAsset = assets[0];
                assets[0] = assets[1];
                assets[1] = tempAsset;

                amounts[0] = ethAssetAmount;

                amounts[1] = btcAssetAmount;
            } else {
                // if the order is ascending
                // assign amount in same order
                amounts[0] = btcAssetAmount;

                amounts[1] = ethAssetAmount;
            }
        }
        // execute the flashloan
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

    ///@notice returns the optimal borrow amounts based on a swap threshold
    ///@dev if the swap amount is less than threshold then that is returned
    ///@dev if the swap amount is greater than threshold then threshold amount is returned
    ///@param state set of all state variables of vault
    ///@param token ETH / BTC token
    ///@param optimalTokenBorrow optimal btc amount to hedge sGLP btc underlying completely
    ///@param currentTokenBorrow current btc amount borrowed from AAVE
    ///@return optimalPartialTokenBorrow optimal token hedge if threshold is breached
    ///@return isPartialTokenHedge true if partial hedge needs to be executed for token
    function _getOptimalPartialBorrows(
        State storage state,
        IERC20Metadata token,
        uint256 optimalTokenBorrow,
        uint256 currentTokenBorrow
    ) internal view returns (uint256 optimalPartialTokenBorrow, bool isPartialTokenHedge) {
        // checks if token hedge needs to be increased or decreased
        bool isOptimalHigher = optimalTokenBorrow > currentTokenBorrow;
        // difference = amount of swap to be done for complete hedge
        uint256 diff = isOptimalHigher
            ? optimalTokenBorrow - currentTokenBorrow
            : currentTokenBorrow - optimalTokenBorrow;

        // get the correct threshold basis the token
        uint256 threshold = address(token) == address(state.wbtc)
            ? state.partialBtcHedgeUsdcAmountThreshold
            : state.partialEthHedgeUsdcAmountThreshold;

        // convert usdc threshold into token amount threshold
        uint256 tokenThreshold = threshold.mulDivDown(PRICE_PRECISION, _getTokenPriceInUsdc(state, token));

        if (diff > tokenThreshold) {
            // amount to swap > threshold
            // swap only the threshold amount in this rebalance (partial hedge)
            optimalPartialTokenBorrow = isOptimalHigher
                ? currentTokenBorrow + tokenThreshold
                : currentTokenBorrow - tokenThreshold;
            isPartialTokenHedge = true;
        } else {
            // amount to swap < threshold
            // swap the full amount in this rebalance (complete hedge)
            optimalPartialTokenBorrow = optimalTokenBorrow;
        }
    }

    function _getOptimalBorrowsFinal(
        State storage state,
        uint256 currentBtcBorrow,
        uint256 currentEthBorrow,
        uint256 glpDeposited,
        bool[2] memory conditions // (isPartialAllowed, useUpdatedPoolAmounts)
    )
        internal
        view
        returns (
            uint256 optimalBtcBorrow,
            uint256 optimalEthBorrow,
            uint256 targetDnGmxSeniorVaultAmount,
            uint256 optimalUncappedEthBorrow,
            bool isPartialHedge
        )
    {
        bool isPartialAllowed = conditions[0];
        bool useUpdatedPoolAmounts = conditions[1];

        // optimal btc and eth borrows
        // calculated basis the underlying token weights in glp

        (optimalBtcBorrow, optimalEthBorrow) = _getOptimalBorrows(state, glpDeposited, useUpdatedPoolAmounts);

        if (isPartialAllowed) {
            // if partial hedges are allowed (i.e. rebalance call and not deposit/withdraw)
            // check if swap amounts>threshold then basis that do a partial hedge
            bool isPartialBtcHedge;
            bool isPartialEthHedge;
            // get optimal borrows basis hedge thresholds
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
            // if some token is partially hedged then set that this rebalance is partial
            // lastRebalanceTime not updated in this case so a rebalance can be called again
            isPartialHedge = isPartialBtcHedge || isPartialEthHedge;
        }

        // calculate usdc value of optimal borrows
        uint256 optimalBorrowValue = _getBorrowValue(state, optimalBtcBorrow, optimalEthBorrow);

        // get liquidation threshold of usdc on AAVE
        uint256 usdcLiquidationThreshold = _getLiquidationThreshold(state, address(state.usdc));

        // Settle net change in market value and deposit/withdraw collateral tokens
        // Vault market value is just the collateral value since profit has been settled
        // AAVE target health factor = (usdc supply value * usdc liquidation threshold)/borrow value
        // whatever tokens we borrow from AAVE (ETH/BTC) we sell for usdc and deposit that usdc into AAVE
        // assuming 0 slippage borrow value of tokens = usdc deposit value (this leads to very small variation in hf)
        // usdc supply value = usdc borrowed from senior tranche + borrow value
        // replacing usdc supply value formula above in AAVE target health factor formula
        // we can derive usdc amount to borrow from senior tranche i.e. targetDnGmxSeniorVaultAmount
        targetDnGmxSeniorVaultAmount = (state.targetHealthFactor - usdcLiquidationThreshold).mulDivDown(
            optimalBorrowValue,
            usdcLiquidationThreshold
        );

        // current usdc borrowed from senior tranche
        uint256 currentDnGmxSeniorVaultAmount = _getUsdcBorrowed(state);

        if (targetDnGmxSeniorVaultAmount > currentDnGmxSeniorVaultAmount) {
            // case where we need to borrow more usdc
            // To get more usdc from senior tranche, so usdc is borrowed first and then hedge is updated on AAVE
            {
                uint256 amountToBorrow = targetDnGmxSeniorVaultAmount - currentDnGmxSeniorVaultAmount;
                uint256 availableBorrow = state.dnGmxSeniorVault.availableBorrow(address(this));
                if (amountToBorrow > availableBorrow) {
                    // if amount to borrow > available borrow amount
                    // we won't be able to hedge glp completely
                    // convert some glp into usdc to keep the vault delta neutral
                    // hedge the btc/eth of remaining amount
                    optimalUncappedEthBorrow = optimalEthBorrow;

                    // optimal btc and eth borrows basis the hedged part of glp
                    (optimalBtcBorrow, optimalEthBorrow) = _getOptimalCappedBorrows(
                        state,
                        currentDnGmxSeniorVaultAmount + availableBorrow,
                        usdcLiquidationThreshold
                    );
                }
            }
        }

        return (
            optimalBtcBorrow,
            optimalEthBorrow,
            targetDnGmxSeniorVaultAmount,
            optimalUncappedEthBorrow,
            isPartialHedge
        );
    }

    ///@notice rebalances btc and eth hedges according to underlying glp token weights
    ///@notice updates the borrowed amount from senior tranche basis the target health factor
    ///@notice if the amount of swap for a token > theshold then a partial hedge is taken and remaining is taken separately
    ///@notice if the amount of swap for a token < threshold complete hedge is taken
    ///@notice in case there is not enough money in senior tranche then relevant amount of glp is converted into usdc
    ///@dev to be called after settle profits only (since vaultMarketValue if after settlement of profits)
    ///@param state set of all state variables of vault
    ///@param currentBtcBorrow The amount of USDC collateral token deposited to LB Protocol
    ///@param currentEthBorrow The market value of ETH/BTC part in sGLP
    ///@param glpDeposited amount of glp deposited into the vault
    ///@param isPartialAllowed true if partial hedge is allowed
    ///@return isPartialHedge true if partial hedge is executed
    function rebalanceHedge(
        State storage state,
        uint256 currentBtcBorrow,
        uint256 currentEthBorrow,
        uint256 glpDeposited,
        bool isPartialAllowed
    ) external returns (bool isPartialHedge) {
        {
            uint256 optimalBtcBorrow;
            uint256 optimalEthBorrow;
            uint256 targetDnGmxSeniorVaultAmount;
            uint256 currentDnGmxSeniorVaultAmount;
            uint256 optimalUncappedEthBorrow;
            (
                optimalBtcBorrow,
                optimalEthBorrow,
                targetDnGmxSeniorVaultAmount,
                optimalUncappedEthBorrow,
                isPartialHedge
            ) = _getOptimalBorrowsFinal(
                state,
                currentBtcBorrow,
                currentEthBorrow,
                glpDeposited,
                [isPartialAllowed, false]
            );
            // current usdc borrowed from senior tranche
            currentDnGmxSeniorVaultAmount = _getUsdcBorrowed(state);
            if (targetDnGmxSeniorVaultAmount > currentDnGmxSeniorVaultAmount) {
                // case where we need to borrow more usdc
                // To get more usdc from senior tranche, so usdc is borrowed first and then hedge is updated on AAVE
                {
                    uint256 amountToBorrow = targetDnGmxSeniorVaultAmount - currentDnGmxSeniorVaultAmount;
                    uint256 availableBorrow = state.dnGmxSeniorVault.availableBorrow(address(this));

                    if (amountToBorrow > availableBorrow) {
                        // if amount to borrow > available borrow amount
                        // we won't be able to hedge glp completely
                        // convert some glp into usdc to keep the vault delta neutral
                        // hedge the btc/eth of remaining amount

                        // rebalance the unhedged glp (increase/decrease basis the capped optimal token hedges)
                        _rebalanceUnhedgedGlp(state, optimalUncappedEthBorrow, optimalEthBorrow);

                        if (availableBorrow > 0) {
                            // borrow whatever is available since required > available
                            state.dnGmxSeniorVault.borrow(availableBorrow);
                        }
                    } else {
                        //No unhedged glp remaining so just pass same value in capped and uncapped (should convert back any ausdc back to sglp)
                        _rebalanceUnhedgedGlp(state, optimalEthBorrow, optimalEthBorrow);

                        // Take from LB Vault
                        state.dnGmxSeniorVault.borrow(targetDnGmxSeniorVaultAmount - currentDnGmxSeniorVaultAmount);
                    }
                }

                // Rebalance Position
                // Executes a flashloan from balancer and btc/eth borrow updates on AAVE
                _rebalanceBorrow(state, optimalBtcBorrow, currentBtcBorrow, optimalEthBorrow, currentEthBorrow);
            } else {
                //No unhedged glp remaining so just pass same value in capped and uncapped (should convert back any ausdc back to sglp)
                _rebalanceUnhedgedGlp(state, optimalEthBorrow, optimalEthBorrow);

                // Executes a flashloan from balancer and btc/eth borrow updates on AAVE
                // To repay usdc to senior tranche so update the hedges on AAVE first
                // then remove usdc to pay back to senior tranche
                _rebalanceBorrow(state, optimalBtcBorrow, currentBtcBorrow, optimalEthBorrow, currentEthBorrow);
                uint256 totalCurrentBorrowValue;
                {
                    (uint256 currentBtc, uint256 currentEth) = _getCurrentBorrows(state);
                    totalCurrentBorrowValue = _getBorrowValue(state, currentBtc, currentEth);
                }
                _rebalanceProfit(state, totalCurrentBorrowValue);
                // Deposit to LB Vault

                state.dnGmxSeniorVault.repay(currentDnGmxSeniorVaultAmount - targetDnGmxSeniorVaultAmount);
            }
        }
    }

    ///@notice withdraws LP tokens from gauge, sells LP token for usdc
    ///@param state set of all state variables of vault
    ///@param usdcAmountDesired amount of USDC desired
    ///@return usdcAmountOut usdc amount returned by gmx
    function _convertAssetToAUsdc(
        State storage state,
        uint256 usdcAmountDesired
    ) internal returns (uint256 usdcAmountOut) {
        ///@dev if usdcAmountDesired < 10, then there is precision issue in gmx contracts while redeeming for usdg

        if (usdcAmountDesired < state.usdcConversionThreshold) return 0;
        address _usdc = address(state.usdc);

        // calculate the minimum required amount basis the set slippage param
        // uses current usdc max price from GMX and adds slippage on top
        uint256 minUsdcOut = usdcAmountDesired.mulDivDown((MAX_BPS - state.slippageThresholdGmxBps), MAX_BPS);

        // calculate the amount of glp to be converted to get the desired usdc amount
        uint256 glpAmountInput = usdcAmountDesired.mulDivDown(PRICE_PRECISION, _getGlpPriceInUsdc(state, false));

        usdcAmountOut = state.mintBurnRewardRouter.unstakeAndRedeemGlp(
            _usdc,
            glpAmountInput,
            minUsdcOut,
            address(this)
        );

        emit GlpSwapped(glpAmountInput, usdcAmountOut, true);

        _executeSupply(state, _usdc, usdcAmountOut);
    }

    ///@notice sells usdc for LP tokens and then stakes LP tokens
    ///@param state set of all state variables of vault
    ///@param amount amount of usdc
    function _convertAUsdcToAsset(State storage state, uint256 amount) internal {
        _executeWithdraw(state, address(state.usdc), amount, address(this));

        uint256 price = state.gmxVault.getMinPrice(address(state.usdc));

        // USDG has 18 decimals and usdc has 6 decimals => 18-6 = 12
        uint256 usdgAmount = amount.mulDivDown(
            price * (MAX_BPS - state.slippageThresholdGmxBps) * 1e12,
            PRICE_PRECISION * MAX_BPS
        );

        // conversion of token into glp using batching manager
        // batching manager handles the conversion due to the cooldown
        // glp transferred to the vault on batch execution

        uint256 glpReceived = _stakeGlp(state, address(state.usdc), amount, usdgAmount);

        emit GlpSwapped(glpReceived, amount, false);
    }

    function _stakeGlp(
        State storage state,
        address token,
        uint256 amount,
        uint256 minUSDG
    ) internal returns (uint256 glpStaked) {
        // will revert if notional output is less than minUSDG
        glpStaked = state.mintBurnRewardRouter.mintAndStakeGlp(token, amount, minUSDG, 0);
    }

    ///@notice rebalances unhedged glp amount
    ///@notice converts some glp into usdc if there is lesser amount of usdc to back the hedges than required
    ///@notice converts some usdc into glp if some part of the unhedged glp can be hedged
    ///@notice used when there is not enough usdc available in senior tranche
    ///@param state set of all state variables of vault
    ///@param uncappedTokenHedge token hedge if there was no asset cap
    ///@param cappedTokenHedge token hedge if given there is limited about of assets available in senior tranche
    function _rebalanceUnhedgedGlp(State storage state, uint256 uncappedTokenHedge, uint256 cappedTokenHedge) private {
        // early return if optimal amounts are zero
        if (uncappedTokenHedge == 0) return;

        // part of glp assets to be kept unhedged
        // calculated basis the uncapped amount (assumes unlimited borrow availability)
        // and capped amount (basis available borrow)

        // uncappedTokenHedge is required to hedge totalAssets
        // cappedTokenHedge can be taken basis available borrow
        // so basis what % if hedge cannot be taken, same % of glp is converted to usdc
        uint256 unhedgedGlp = _totalGlp(state, false).mulDivDown(
            uncappedTokenHedge - cappedTokenHedge,
            uncappedTokenHedge
        );

        // usdc value of unhedged glp assets
        uint256 unhedgedGlpUsdcAmount = unhedgedGlp.mulDivDown(_getGlpPriceInUsdc(state, false), PRICE_PRECISION);

        if (unhedgedGlpUsdcAmount > state.unhedgedGlpInUsdc) {
            // if target unhedged amount > current unhedged amount
            // convert glp to aUSDC
            uint256 glpToUsdcAmount = unhedgedGlpUsdcAmount - state.unhedgedGlpInUsdc;
            state.unhedgedGlpInUsdc += _convertAssetToAUsdc(state, glpToUsdcAmount);
        } else if (unhedgedGlpUsdcAmount < state.unhedgedGlpInUsdc) {
            // if target unhedged amount < current unhedged amount
            // convert aUSDC to glp
            uint256 usdcToGlpAmount = state.unhedgedGlpInUsdc - unhedgedGlpUsdcAmount;
            state.unhedgedGlpInUsdc -= usdcToGlpAmount;
            _convertAUsdcToAsset(state, usdcToGlpAmount);
        }
    }

    /* ##################################################################
                            FLASHLOAN RECEIVER
    ################################################################## */

    ///@notice flashloan receiver for balance vault
    ///@notice receives flashloaned tokens(WETH or WBTC or USDC) from balancer, swaps on uniswap and borrows/repays on AAVE
    ///@dev only allows balancer vault to call this
    ///@dev only runs when _hasFlashloaned is set to true (prevents someone else from initiating flashloan to vault)
    ///@param tokens list of tokens flashloaned
    ///@param amounts amounts of token flashloans in same order
    ///@param feeAmounts amounts of fee/premium charged for flashloan
    ///@param userData data passed to balancer for flashloan (includes token amounts, token usdc value and swap direction)
    function receiveFlashLoan(
        State storage state,
        IERC20[] memory tokens,
        uint256[] memory amounts,
        uint256[] memory feeAmounts,
        bytes memory userData
    ) external {
        // Decode user data containing btc/eth token & usdc amount
        // RepayDebt true means we need to reduce token hedge else we need to increase hedge
        (
            uint256 btcTokenAmount,
            uint256 btcUsdcAmount,
            uint256 ethTokenAmount,
            uint256 ethUsdcAmount,
            bool repayDebtBtc,
            bool repayDebtEth
        ) = abi.decode(userData, (uint256, uint256, uint256, uint256, bool, bool));

        // Asset premium charged for taking the flashloan from balancer
        uint256 btcAssetPremium;
        uint256 ethAssetPremium;

        // adjust asset amounts for premiums (zero for balancer at the time of dev)
        if (repayDebtBtc && repayDebtEth) {
            // Both token amounts are non zero
            // The assets are same (usdc only)
            // Here amounts[0] should be equal to btcTokenAmount+ethTokenAmount
            // Total premium on USDC is divided on a prorata basis for btc and eth usdc amounts
            btcAssetPremium = feeAmounts[0].mulDivDown(btcUsdcAmount, amounts[0]);

            ethAssetPremium = (feeAmounts[0] - btcAssetPremium);
        } else if (btcTokenAmount != 0 && ethTokenAmount != 0) {
            // Both token amounts are non zero
            // The assets are different (either usdc/btc, usdc/eth, btc/eth)
            // Here amounts[0] should be equal to btcTokenAmount and amounts[1] should be equal to ethTokenAmount
            bool btcFirst = false;

            // Checks if btc or eth is first since they are sorted basis token address when taking flashloan
            if (repayDebtBtc ? tokens[0] == state.usdc : tokens[0] == state.wbtc) btcFirst = true;

            // Premiums are assigned basis the token amount orders
            btcAssetPremium = feeAmounts[btcFirst ? 0 : 1];
            ethAssetPremium = feeAmounts[btcFirst ? 1 : 0];
        } else {
            // One of the token amounts is zero
            // The asset for non zero token can be both token or usdc
            // Premium is assigned to the non-zero amount token
            if (btcTokenAmount != 0) btcAssetPremium = feeAmounts[0];
            else ethAssetPremium = feeAmounts[0];
        }

        // Execute the token swap (usdc to token / token to usdc) and repay the debt
        if (btcTokenAmount > 0)
            _executeOperationToken(
                state,
                address(state.wbtc),
                btcTokenAmount,
                btcUsdcAmount,
                btcAssetPremium,
                repayDebtBtc
            );
        if (ethTokenAmount > 0)
            _executeOperationToken(
                state,
                address(state.weth),
                ethTokenAmount,
                ethUsdcAmount,
                ethAssetPremium,
                repayDebtEth
            );
    }

    /* ##################################################################
                            AAVE HELPERS
    ################################################################## */

    ///@notice executes borrow of "token" of "amount" quantity to AAVE at variable interest rate
    ///@param state set of all state variables of vault
    ///@param token address of token to borrow
    ///@param amount amount of token to borrow
    function _executeBorrow(State storage state, address token, uint256 amount) internal {
        state.pool.borrow(token, amount, VARIABLE_INTEREST_MODE, 0, address(this));
    }

    ///@notice executes repay of "token" of "amount" quantity to AAVE at variable interest rate
    ///@param state set of all state variables of vault
    ///@param token address of token to borrow
    ///@param amount amount of token to borrow
    function _executeRepay(State storage state, address token, uint256 amount) internal {
        state.pool.repay(token, amount, VARIABLE_INTEREST_MODE, address(this));
    }

    ///@notice executes supply of "token" of "amount" quantity to AAVE
    ///@param state set of all state variables of vault
    ///@param token address of token to borrow
    ///@param amount amount of token to borrow
    function _executeSupply(State storage state, address token, uint256 amount) internal {
        state.pool.supply(token, amount, address(this), 0);
    }

    ///@notice executes withdraw of "token" of "amount" quantity to AAVE
    ///@param state set of all state variables of vault
    ///@param token address of token to borrow
    ///@param amount amount of token to borrow
    ///@param receiver address to which withdrawn tokens should be sent
    function _executeWithdraw(State storage state, address token, uint256 amount, address receiver) internal {
        state.pool.withdraw(token, amount, receiver);
    }

    ///@notice returns liquidation threshold of the selected asset's AAVE pool
    ///@param state set of all state variables of vault
    ///@param asset address of asset to check liquidation threshold for
    function _getLiquidationThreshold(State storage state, address asset) private view returns (uint256) {
        DataTypes.ReserveConfigurationMap memory config = state.pool.getConfiguration(asset);
        (, uint256 liquidationThreshold, , , , ) = config.getParams();

        return liquidationThreshold;
    }

    /* ##################################################################
                            BALANCER HELPERS
    ################################################################## */

    ///@notice executes flashloan from balancer
    ///@dev assets should be ordered in ascending order of addresses
    ///@param assets list of token addresses
    ///@param amounts amount of tokens to be flashloaned in same order as assets
    ///@param _btcTokenAmount token amount of btc token by which hedge amount should be increased (if repayDebt false) or decreased (if repayDebt true)
    ///@param _btcUsdcAmount usdc value of btc token considering swap slippage. Minimum amount (if repayDebt false) or maximum amount (if repayDebt true)
    ///@param _ethTokenAmount token amount of eth token by which hedge amount should be increased (if repayDebt false) or decreased (if repayDebt true)
    ///@param _ethUsdcAmount usdc value of eth token considering swap slippage. Minimum amount (if repayDebt false) or maximum amount (if repayDebt true)
    ///@param _repayDebtBtc repay debt for btc token
    ///@param _repayDebtEth repay debt for eth token
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

        // to ensure that only vault originated flashloans should be able to work with receive flashloan
        state.hasFlashloaned = true;

        state.balancerVault.flashLoan(
            address(this),
            assets,
            amounts,
            abi.encode(_btcTokenAmount, _btcUsdcAmount, _ethTokenAmount, _ethUsdcAmount, _repayDebtBtc, _repayDebtEth)
        );

        // receive flashloan has passed so the variable can be made false again
        state.hasFlashloaned = false;
    }

    ///@notice executes relevant token hedge update on receiving the flashloan from Balancer
    ///@dev if "repayDebt = true" then usdc flashloaned, swapped for token, repay token debt, withdraw usdc from AAVE and pay back usdc with premium
    ///@dev if "repayDebt = false" then token flashloaned, swapped for usdc, supply usdc, borrow tokens from AAVE and pay back tokens with premium
    ///@param token address of token to increase/decrease hedge by
    ///@param tokenAmount amount of tokens to swap
    ///@param usdcAmount if "repayDebt = false" then = minimum amount of usdc | if "repayDebt = true" then = maximum amount of usdc
    ///@param premium additional tokens/usdc to be repaid to balancer to cover flashloan fees
    ///@param repayDebt true if token hedge needs to be reduced
    function _executeOperationToken(
        State storage state,
        address token,
        uint256 tokenAmount,
        uint256 usdcAmount,
        uint256 premium,
        bool repayDebt
    ) internal {
        if (!repayDebt) {
            // increase token hedge amount
            // add premium to token amount (to be paid back to balancer)
            uint256 amountWithPremium = tokenAmount + premium;

            // swap token to usdc
            (uint256 usdcReceived, ) = state._swapToken(token, tokenAmount, usdcAmount);

            // supply received usdc to AAVE
            state._executeSupply(address(state.usdc), usdcReceived);

            // borrow amount with premium amount of tokens from AAVE
            state._executeBorrow(token, amountWithPremium);

            // increase junior tranche usdc deposits by usdc received
            state.dnUsdcDeposited += usdcReceived.toInt256();

            // transfer token amount borrowed with premium back to balancer pool
            IERC20(token).transfer(address(state.balancerVault), amountWithPremium);
        } else {
            // decrease token hedge amount
            // usdcAmount = amount flashloaned from balancer
            // usdcPaid = amount paid for receiving given token amount
            // usdcAmount-usdcPaid = amount of usdc remaining after the swap
            // so we just need to withdraw usdcPaid to transfer usdcAmount

            // swap usdc amount to token
            (uint256 usdcPaid, uint256 tokensReceived) = state._swapUSDC(token, tokenAmount, usdcAmount);

            // amount of usdc that got charged for the token required
            uint256 amountWithPremium = usdcPaid + premium;

            // reduce delta neutral usdc amount by amount with premium
            state.dnUsdcDeposited -= amountWithPremium.toInt256();

            // repay token debt on AAVE
            state._executeRepay(token, tokensReceived);

            // withdraw amount with premium supplied to AAVE
            state._executeWithdraw(address(state.usdc), amountWithPremium, address(this));

            // transfer usdc amount flashloaned + premium back to balancer
            state.usdc.transfer(address(state.balancerVault), usdcAmount + premium);
        }
    }

    /* ##################################################################
                            VIEW FUNCTIONS
    ################################################################## */

    ///@notice returns the usdc amount borrowed by junior tranche from senior tranche
    ///@param state set of all state variables of vault
    ///@return usdcAmount amount of usdc borrowed by junior tranche
    function _getUsdcBorrowed(State storage state) private view returns (uint256 usdcAmount) {
        // all the aave interest goes to senior tranche
        // so, usdc borrowed from senior tranche =
        // total aUSDC balance - (usdc deposited by delta neutral vault into AAVE) - (unhedged amount of glp in usdc)
        return
            uint256(
                state.aUsdc.balanceOf(address(this)).toInt256() -
                    state.dnUsdcDeposited -
                    state.unhedgedGlpInUsdc.toInt256()
            );
    }

    ///@notice returns the total assets deposited to the vault (in glp amount)
    ///@param state set of all state variables of vault
    ///@return total asset amount (glp + usdc (in glp terms))
    function totalAssets(State storage state) external view returns (uint256) {
        return _totalAssets(state, false);
    }

    ///@notice returns the total assets deposited to the vault (in glp amount)
    ///@param state set of all state variables of vault
    ///@param maximize true for maximizing the total assets value and false to minimize
    ///@return total asset amount (glp + usdc (in glp terms))
    function totalAssets(State storage state, bool maximize) external view returns (uint256) {
        return _totalAssets(state, maximize);
    }

    ///@notice returns the total assets deposited to the vault (in glp amount)
    ///@param state set of all state variables of vault
    ///@param maximize true for maximizing the total assets value and false to minimize
    ///@return total asset amount (glp + usdc (in glp terms))
    function _totalAssets(State storage state, bool maximize) private view returns (uint256) {
        // usdc deposited by junior tranche (can be negative)
        int256 dnUsdcDeposited = state.dnUsdcDeposited;

        // calculate current borrow amounts
        (uint256 currentBtc, uint256 currentEth) = _getCurrentBorrows(state);
        // total borrow value is the value of ETH and BTC required to be paid off
        uint256 totalCurrentBorrowValue = _getBorrowValue(state, currentBtc, currentEth);
        uint256 aaveProfitGlp;
        uint256 aaveLossGlp;
        {
            // convert it into two uints basis the sign
            uint256 aaveProfit = dnUsdcDeposited > int256(0) ? uint256(dnUsdcDeposited) : 0;
            uint256 aaveLoss = dnUsdcDeposited < int256(0)
                ? uint256(-dnUsdcDeposited) + totalCurrentBorrowValue
                : totalCurrentBorrowValue;

            if (aaveProfit > aaveLoss) {
                aaveProfitGlp = (aaveProfit - aaveLoss).mulDivDown(
                    PRICE_PRECISION,
                    _getGlpPriceInUsdc(state, maximize)
                );
                if (!maximize)
                    aaveProfitGlp = aaveProfitGlp.mulDivDown(MAX_BPS - state.slippageThresholdGmxBps, MAX_BPS);
                aaveLossGlp = 0;
            } else {
                aaveLossGlp = (aaveLoss - aaveProfit).mulDivDown(PRICE_PRECISION, _getGlpPriceInUsdc(state, maximize));
                if (!maximize) aaveLossGlp = aaveLossGlp.mulDivDown(MAX_BPS + state.slippageThresholdGmxBps, MAX_BPS);
                aaveProfitGlp = 0;
            }
        }

        // total assets considers 3 parts
        // part1: glp balance in vault
        // part2: usdc balance in vault (unhedged glp)
        // part3: pnl on AAVE (i.e. aaveProfitGlp - aaveLossGlp)
        return _totalGlp(state, maximize) + aaveProfitGlp - aaveLossGlp;
    }

    ///@notice returns the total assets deposited to the vault (in glp amount)
    ///@param state set of all state variables of vault
    ///@param maximize true for maximizing the total assets value and false to minimize
    ///@return total asset amount (glp + usdc (in glp terms))
    function totalGlp(State storage state, bool maximize) external view returns (uint256) {
        return _totalGlp(state, maximize);
    }

    function _totalGlp(State storage state, bool maximize) private view returns (uint256) {
        // convert usdc amount into glp amount
        // unhedged glp is kept in usdc so there would be conversion slippage on that
        uint256 unhedgedGlp = (state.unhedgedGlpInUsdc).mulDivDown(
            PRICE_PRECISION,
            _getGlpPriceInUsdc(state, !maximize)
        );

        // if we need to minimize then add additional slippage
        if (!maximize) unhedgedGlp = unhedgedGlp.mulDivDown(MAX_BPS - state.slippageThresholdGmxBps, MAX_BPS);

        // total assets considers 3 parts
        // part1: glp balance in vault
        // part2: usdc balance in vault (unhedged glp)
        return state.fsGlp.balanceOf(address(this)) + unhedgedGlp;
    }

    ///@notice returns if the rebalance is valid basis last rebalance time and rebalanceTimeThreshold
    ///@param state set of all state variables of vault
    ///@return true if the rebalance is valid basis time threshold
    /* solhint-disable not-rely-on-time */
    function isValidRebalanceTime(State storage state) external view returns (bool) {
        // check if rebalanceTimeThreshold has passed since last rebalance time
        return (block.timestamp - state.lastRebalanceTS) > state.rebalanceTimeThreshold;
    }

    ///@notice returns if the rebalance is valid basis health factor on AAVE
    ///@notice retunrs true if current health factor < threshold
    ///@param state set of all state variables of vault
    ///@return true if the rebalance is valid basis AAVE health factor
    function isValidRebalanceHF(State storage state) external view returns (bool) {
        return _isValidRebalanceHF(state);
    }

    function _isValidRebalanceHF(State storage state) private view returns (bool) {
        // check if health factor on AAVE is below rebalanceHfThreshold
        (, , , , , uint256 healthFactor) = state.pool.getUserAccountData(address(this));

        return healthFactor < (uint256(state.rebalanceHfThresholdBps) * 1e14);
    }

    ///@notice returns if the rebalance is valid basis the difference between the current and optimal hedges of tokens(ETH/BTC)
    ///@param state set of all state variables of vault
    ///@return true if the rebalance is valid basis diffeence (current and optimal) threshold
    function isValidRebalanceDeviation(State storage state) external view returns (bool) {
        (uint256 currentBtcBorrow, uint256 currentEthBorrow) = _getCurrentBorrows(state);

        (uint256 optimalBtcBorrow, uint256 optimalEthBorrow, , , ) = _getOptimalBorrowsFinal(
            state,
            currentBtcBorrow,
            currentEthBorrow,
            _totalGlp(state, false),
            [false, true]
        );

        return
            !(_isWithinAllowedDelta(state, optimalBtcBorrow, currentBtcBorrow) &&
                _isWithinAllowedDelta(state, optimalEthBorrow, currentEthBorrow));
    }

    function isValidRebalanceDueToChangeInHedges(State storage state) external view returns (bool) {
        return _isValidRebalanceDueToChangeInHedges(state);
    }

    function _isValidRebalanceDueToChangeInHedges(State storage state) private view returns (bool) {
        (int128 currentBtcTraderOIHedge, int128 currentEthTraderOIHedge) = _getTraderOIHedgeAmounts(state);
        return
            !(currentBtcTraderOIHedge == state.btcTraderOIHedge && currentEthTraderOIHedge == state.ethTraderOIHedge);
    }

    function getTraderOIHedgeAmounts(
        State storage state
    ) external view returns (int128 currentBtcTraderOIHedge, int128 currentEthTraderOIHedge) {
        return _getTraderOIHedgeAmounts(state);
    }

    function _getTraderOIHedgeAmounts(
        State storage state
    ) private view returns (int128 currentBtcTraderOIHedge, int128 currentEthTraderOIHedge) {
        currentBtcTraderOIHedge = state.dnGmxTraderHedgeStrategy.btcTraderOIHedge();
        currentEthTraderOIHedge = state.dnGmxTraderHedgeStrategy.ethTraderOIHedge();
    }

    ///@notice returns the price of given token basis AAVE oracle
    ///@param state set of all state variables of vault
    ///@param token the token for which price is expected
    ///@return token price in usd
    function getTokenPrice(State storage state, IERC20Metadata token) external view returns (uint256) {
        return _getTokenPrice(state, token);
    }

    ///@notice returns the price of given token basis AAVE oracle
    ///@param state set of all state variables of vault
    ///@param token the token for which price is expected
    ///@return token price in usd
    function _getTokenPrice(State storage state, IERC20Metadata token) private view returns (uint256) {
        uint256 decimals = token.decimals();

        // AAVE oracle
        uint256 price = state.oracle.getAssetPrice(address(token));

        // @dev aave returns from same source as chainlink (which is 8 decimals)
        return price.mulDivDown(PRICE_PRECISION, 10 ** (decimals + 2));
    }

    ///@notice returns the price of glp token
    ///@param state set of all state variables of vault
    ///@param maximize true to get maximum price and flase to get minimum
    ///@return glp price in usd
    function getGlpPrice(State storage state, bool maximize) external view returns (uint256) {
        return _getGlpPrice(state, maximize);
    }

    ///@notice returns the price of glp token
    ///@param state set of all state variables of vault
    ///@param maximize true to get maximum price and flase to get minimum
    ///@return glp price in usd
    function _getGlpPrice(State storage state, bool maximize) private view returns (uint256) {
        uint256 aum = state.glpManager.getAum(maximize);
        uint256 totalSupply = state.glp.totalSupply();

        // price per glp token = (total AUM / total supply)
        return aum.mulDivDown(PRICE_PRECISION, totalSupply * 1e24);
    }

    ///@notice returns the price of glp token in usdc
    ///@param state set of all state variables of vault
    ///@param maximize true to get maximum price and flase to get minimum
    ///@return glp price in usd
    function getGlpPriceInUsdc(State storage state, bool maximize) external view returns (uint256) {
        return _getGlpPriceInUsdc(state, maximize);
    }

    ///@notice returns the price of glp token in usdc
    ///@param state set of all state variables of vault
    ///@param maximize true to get maximum price and flase to get minimum
    ///@return glp price in usd
    function _getGlpPriceInUsdc(State storage state, bool maximize) private view returns (uint256) {
        uint256 aum = state.glpManager.getAum(maximize);
        uint256 totalSupply = state.glp.totalSupply();

        // @dev aave returns from same source as chainlink (which is 8 decimals)
        uint256 quotePrice = state.oracle.getAssetPrice(address(state.usdc));

        // price per glp token = (total AUM / total supply)
        // scaling factor = 30(aum) -18(totalSupply) -8(quotePrice) +18(glp) -6(usdc) = 16
        return aum.mulDivDown(PRICE_PRECISION, totalSupply * quotePrice * 1e16);
    }

    ///@notice returns the price of given token in USDC using AAVE oracle
    ///@param state set of all state variables of vault
    ///@param token the token for which price is expected
    ///@return scaledPrice token price in usdc
    function getTokenPriceInUsdc(
        State storage state,
        IERC20Metadata token
    ) external view returns (uint256 scaledPrice) {
        return _getTokenPriceInUsdc(state, token);
    }

    ///@notice returns the price of given token in USDC using AAVE oracle
    ///@param state set of all state variables of vault
    ///@param token the token for which price is expected
    ///@return scaledPrice token price in usdc
    function _getTokenPriceInUsdc(
        State storage state,
        IERC20Metadata token
    ) internal view returns (uint256 scaledPrice) {
        uint256 decimals = token.decimals();
        uint256 price = state.oracle.getAssetPrice(address(token));

        // @dev aave returns from same source as chainlink (which is 8 decimals)
        uint256 quotePrice = state.oracle.getAssetPrice(address(state.usdc));

        // token price / usdc price
        scaledPrice = price.mulDivDown(PRICE_PRECISION, quotePrice * 10 ** (decimals - 6));
    }

    ///@notice returns liquidation threshold of the selected asset's AAVE pool
    ///@param state set of all state variables of vault
    ///@param asset address of asset to check liquidation threshold for
    ///@return liquidation threshold
    function getLiquidationThreshold(State storage state, address asset) external view returns (uint256) {
        return _getLiquidationThreshold(state, asset);
    }

    ///@notice returns the borrow value for a given amount of tokens
    ///@param state set of all state variables of vault
    ///@param btcAmount amount of btc
    ///@param ethAmount amount of eth
    ///@return borrowValue value of the given token amounts
    function getBorrowValue(
        State storage state,
        uint256 btcAmount,
        uint256 ethAmount
    ) external view returns (uint256 borrowValue) {
        return _getBorrowValue(state, btcAmount, ethAmount);
    }

    ///@notice returns the borrow value for a given amount of tokens
    ///@param state set of all state variables of vault
    ///@param btcAmount amount of btc
    ///@param ethAmount amount of eth
    ///@return borrowValue value of the given token amounts
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

    function getSlippageAdjustedAssets(
        State storage state,
        uint256 assets,
        bool isDeposit
    ) external view returns (uint256) {
        return _getSlippageAdjustedAssets(state, assets, isDeposit);
    }

    function _getSlippageAdjustedAssets(
        State storage state,
        uint256 assets,
        bool isDeposit
    ) private view returns (uint256) {
        // get change in borrow positions to calculate amount to swap on uniswap
        (int256 netBtcBorrowChange, int256 netEthBorrowChange) = _getNetPositionChange(state, assets, isDeposit);

        uint256 dollarsLostDueToSlippage = _quoteSwapSlippageLoss(state, netBtcBorrowChange, netEthBorrowChange);

        // netSlippage returned is in glp (asset) terms
        uint256 glpPrice = _getGlpPriceInUsdc(state, false);
        uint256 netSlippage = dollarsLostDueToSlippage.mulDivUp(PRICE_PRECISION, glpPrice);

        // subtract slippage from assets, and calculate shares basis that slippage adjusted asset amount
        if (netSlippage >= assets) revert IDnGmxJuniorVault.TooMuchSlippage(netSlippage, assets);
        assets -= uint256(netSlippage);

        return assets;
    }

    function getNetPositionChange(
        State storage state,
        uint256 assetAmount,
        bool isDeposit
    ) external view returns (int256, int256) {
        return _getNetPositionChange(state, assetAmount, isDeposit);
    }

    function _getNetPositionChange(
        State storage state,
        uint256 assetAmount,
        bool isDeposit
    ) private view returns (int256 netBtcBorrowChange, int256 netEthBorrowChange) {
        // get current borrows
        (uint256 currentBtcBorrow, uint256 currentEthBorrow) = _getCurrentBorrows(state);

        // calculate new total assets basis assetAmount
        uint256 total = _totalGlp(state, true);
        uint256 totalAssetsAfter = isDeposit ? total + assetAmount : total - assetAmount;

        // get optimal borrows accounting for incoming glp deposit
        (uint256 optimalBtcBorrow, uint256 optimalEthBorrow, , , ) = _getOptimalBorrowsFinal(
            state,
            currentBtcBorrow,
            currentEthBorrow,
            totalAssetsAfter,
            [false, false]
        );

        // calculate the diff, i.e token amounts to be swapped on uniswap
        // if optimal > current, swapping token to usdc
        // if optimal < current, swapping usdc to token
        netBtcBorrowChange = optimalBtcBorrow.toInt256() - currentBtcBorrow.toInt256();
        netEthBorrowChange = optimalEthBorrow.toInt256() - currentEthBorrow.toInt256();
    }

    function quoteSwapSlippageLoss(
        State storage state,
        int256 btcAmount,
        int256 ethAmount
    ) external view returns (uint256) {
        return _quoteSwapSlippageLoss(state, btcAmount, ethAmount);
    }

    function _calculateSwapLoss(
        int256 tokenAmount,
        int256 otherTokenAmount,
        uint256 tokenPrice,
        uint256 otherTokenPrice
    ) internal pure returns (uint256) {
        uint256 dollarsPaid;
        uint256 dollarsReceived;
        if (tokenAmount > 0) {
            dollarsPaid = uint256(tokenAmount).mulDivUp(tokenPrice, PRICE_PRECISION);
            dollarsReceived = uint256(-otherTokenAmount).mulDivDown(otherTokenPrice, PRICE_PRECISION);
        } else if (tokenAmount < 0) {
            dollarsPaid = uint256(otherTokenAmount).mulDivUp(otherTokenPrice, PRICE_PRECISION);
            dollarsReceived = uint256(-tokenAmount).mulDivDown(tokenPrice, PRICE_PRECISION);
        }
        return (dollarsPaid > dollarsReceived) ? uint256(dollarsPaid - dollarsReceived) : 0;
    }

    /// @notice returns the amount of glp to be charged as slippage loss
    /// @param state set of all state variables of vault
    /// @param btcAmountInBtcSwap if positive btc sell amount else if negative btc buy amount
    /// @param ethAmountInEthSwap if positive eth sell amount else if negative eth buy amount
    function _quoteSwapSlippageLoss(
        State storage state,
        int256 btcAmountInBtcSwap,
        int256 ethAmountInEthSwap
    ) internal view returns (uint256 dollarsLostDueToSlippage) {
        (int256 usdcAmountInBtcSwap, int256 usdcAmountInEthSwap) = QuoterLib.quoteCombinedSwap(
            btcAmountInBtcSwap,
            ethAmountInEthSwap,
            SwapPath.generate({
                tokenIn: state.wbtc,
                feeIn: state.feeTierWethWbtcPool,
                tokenIntermediate: state.weth,
                feeOut: 500,
                tokenOut: state.usdc,
                isExactIn: true
            }),
            SwapPath.generate({ tokenIn: state.weth, fee: 500, tokenOut: state.usdc, isExactIn: true })
        );

        uint256 btcPrice = _getTokenPriceInUsdc(state, state.wbtc);
        uint256 ethPrice = _getTokenPriceInUsdc(state, state.weth);
        uint256 usdcPrice = _getTokenPriceInUsdc(state, state.usdc);

        return
            _calculateSwapLoss(btcAmountInBtcSwap, usdcAmountInBtcSwap, btcPrice, usdcPrice) +
            _calculateSwapLoss(ethAmountInEthSwap, usdcAmountInEthSwap, ethPrice, usdcPrice);
    }

    ///@notice returns the amount of flashloan for a given token
    ///@notice if token amount needs to be increased then usdcAmount is minimum amount
    ///@notice if token amount needs to be decreased then usdcAmount is maximum amount
    ///@param state set of all state variables of vault
    ///@param token address of token
    ///@param optimalBorrow optimal token borrow to completely hedge sGlp
    ///@param currentBorrow curret token borrow from AAVE
    ///@return tokenAmount amount of tokens to be swapped
    ///@return usdcAmount minimum/maximum amount of usdc basis swap direction
    ///@return repayDebt true then reduce token hedge, false then increase token hedge
    function flashloanAmounts(
        State storage state,
        address token,
        uint256 optimalBorrow,
        uint256 currentBorrow
    ) external view returns (uint256 tokenAmount, uint256 usdcAmount, bool repayDebt) {
        return _flashloanAmounts(state, token, optimalBorrow, currentBorrow);
    }

    ///@notice returns the amount of flashloan for a given token
    ///@notice if token amount needs to be increased then usdcAmount is minimum amount
    ///@notice if token amount needs to be decreased then usdcAmount is maximum amount
    ///@param state set of all state variables of vault
    ///@param token address of token
    ///@param optimalBorrow optimal token borrow to completely hedge sGlp
    ///@param currentBorrow curret token borrow from AAVE
    ///@return tokenAmount amount of tokens to be swapped
    ///@return usdcAmount minimum/maximum amount of usdc basis swap direction
    ///@return repayDebt true then reduce token hedge, false then increase token hedge
    function _flashloanAmounts(
        State storage state,
        address token,
        uint256 optimalBorrow,
        uint256 currentBorrow
    ) private view returns (uint256 tokenAmount, uint256 usdcAmount, bool repayDebt) {
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

            repayDebt = true;
            // In callback: Swap to ETH/BTC and deposit to AAVE
            // Send back some aUSDC to LB vault
        }
    }

    ///@notice returns the amount of current borrows of btc and eth token from AAVE
    ///@param state set of all state variables of vault
    ///@return currentBtcBorrow amount of btc currently borrowed from AAVE
    ///@return currentEthBorrow amount of eth currently borrowed from AAVE
    function getCurrentBorrows(
        State storage state
    ) external view returns (uint256 currentBtcBorrow, uint256 currentEthBorrow) {
        return _getCurrentBorrows(state);
    }

    ///@notice returns the amount of current borrows of btc and eth token from AAVE
    ///@param state set of all state variables of vault
    ///@return currentBtcBorrow amount of btc currently borrowed from AAVE
    ///@return currentEthBorrow amount of eth currently borrowed from AAVE
    function _getCurrentBorrows(
        State storage state
    ) private view returns (uint256 currentBtcBorrow, uint256 currentEthBorrow) {
        return (state.vWbtc.balanceOf(address(this)), state.vWeth.balanceOf(address(this)));
    }

    ///@notice returns optimal borrows for BTC and ETH respectively basis glpDeposited amount and stored pool amount
    ///@param state set of all state variables of vault
    ///@param glpDeposited amount of glp for which optimal borrow needs to be calculated
    ///@return optimalBtcBorrow optimal amount of btc borrowed from AAVE
    ///@return optimalEthBorrow optimal amount of eth borrowed from AAVE
    function getOptimalBorrows(
        State storage state,
        uint256 glpDeposited,
        bool withUpdatedPoolAmounts
    ) external view returns (uint256 optimalBtcBorrow, uint256 optimalEthBorrow) {
        return _getOptimalBorrows(state, glpDeposited, withUpdatedPoolAmounts);
    }

    ///@notice returns optimal borrows for BTC and ETH respectively basis glpDeposited amount and stored pool amount
    ///@param state set of all state variables of vault
    ///@param glpDeposited amount of glp for which optimal borrow needs to be calculated
    ///@return optimalBtcBorrow optimal amount of btc borrowed from AAVE
    ///@return optimalEthBorrow optimal amount of eth borrowed from AAVE
    function _getOptimalBorrows(
        State storage state,
        uint256 glpDeposited,
        bool withUpdatedPoolAmounts
    ) private view returns (uint256 optimalBtcBorrow, uint256 optimalEthBorrow) {
        optimalBtcBorrow = _getTokenReservesInGlp(state, address(state.wbtc), glpDeposited, withUpdatedPoolAmounts);
        optimalEthBorrow = _getTokenReservesInGlp(state, address(state.weth), glpDeposited, withUpdatedPoolAmounts);
    }

    ///@notice returns optimal borrows for BTC and ETH respectively basis available borrow amount
    ///@param state set of all state variables of vault
    ///@param availableBorrowAmount available borrow amount from senior vault
    ///@param usdcLiquidationThreshold the usdc liquidation threshold on AAVE
    ///@return optimalBtcBorrow optimal amount of btc borrowed from AAVE
    ///@return optimalEthBorrow optimal amount of eth borrowed from AAVE
    function getOptimalCappedBorrows(
        State storage state,
        uint256 availableBorrowAmount,
        uint256 usdcLiquidationThreshold
    ) external view returns (uint256 optimalBtcBorrow, uint256 optimalEthBorrow) {
        return _getOptimalCappedBorrows(state, availableBorrowAmount, usdcLiquidationThreshold);
    }

    ///@notice returns optimal borrows for BTC and ETH respectively basis available borrow amount
    ///@param state set of all state variables of vault
    ///@param availableBorrowAmount available borrow amount from senior vault
    ///@param usdcLiquidationThreshold the usdc liquidation threshold on AAVE
    ///@return optimalBtcBorrow optimal amount of btc borrowed from AAVE
    ///@return optimalEthBorrow optimal amount of eth borrowed from AAVE
    function _getOptimalCappedBorrows(
        State storage state,
        uint256 availableBorrowAmount,
        uint256 usdcLiquidationThreshold
    ) private view returns (uint256 optimalBtcBorrow, uint256 optimalEthBorrow) {
        // The value of max possible value of ETH+BTC borrow
        // calculated basis available borrow amount, liqudation threshold and target health factor
        // AAVE target health factor = (usdc supply value * usdc liquidation threshold)/borrow value
        // whatever tokens we borrow from AAVE (ETH/BTC) we sell for usdc and deposit that usdc into AAVE
        // assuming 0 slippage borrow value of tokens = usdc deposit value (this leads to very small variation in hf)
        // usdc supply value = usdc borrowed from senior tranche + borrow value
        // replacing usdc supply value formula above in AAVE target health factor formula
        // we can replace usdc borrowed from senior tranche with available borrow amount
        // we can derive max borrow value of tokens possible i.e. maxBorrowValue
        uint256 maxBorrowValue = availableBorrowAmount.mulDivDown(
            usdcLiquidationThreshold,
            state.targetHealthFactor - usdcLiquidationThreshold
        );

        uint256 btcWeight;
        uint256 ethWeight;

        // get eth and btc price in usdc
        uint256 btcPrice = _getTokenPriceInUsdc(state, state.wbtc);
        uint256 ethPrice = _getTokenPriceInUsdc(state, state.weth);

        {
            int128 btcTokenTraderOIHedge = state.btcTraderOIHedge;
            int128 ethTokenTraderOIHedge = state.ethTraderOIHedge;

            uint256 btcPoolAmount = state.btcPoolAmount;
            uint256 ethPoolAmount = state.ethPoolAmount;

            // token reserve is the amount we short
            // tokenTraderOIHedge if >0 then we need to go long because of OI hence less short (i.e. subtract if value +ve)
            // tokenTraderOIHedge if <0 then we need to go short because of OI hence more long (i.e. add if value -ve)
            uint256 btcTokenReserve = btcTokenTraderOIHedge > 0
                ? btcPoolAmount - uint256(int256(btcTokenTraderOIHedge))
                : btcPoolAmount + uint256(int256(-btcTokenTraderOIHedge));

            uint256 ethTokenReserve = ethTokenTraderOIHedge > 0
                ? ethPoolAmount - uint256(int256(ethTokenTraderOIHedge))
                : ethPoolAmount + uint256(int256(-ethTokenTraderOIHedge));

            // calculate the borrow value of eth & btc using their weights
            btcWeight = btcTokenReserve.mulDivDown(btcPrice, PRICE_PRECISION);
            ethWeight = ethTokenReserve.mulDivDown(ethPrice, PRICE_PRECISION);
        }

        // get token amounts from usdc amount
        // total borrow should be divided basis the token weights
        // using that we can calculate the borrow value for each token
        // dividing that with token prices we can calculate the optimal token borrow amounts
        optimalBtcBorrow = maxBorrowValue.mulDivDown(btcWeight * PRICE_PRECISION, (btcWeight + ethWeight) * btcPrice);
        optimalEthBorrow = maxBorrowValue.mulDivDown(ethWeight * PRICE_PRECISION, (btcWeight + ethWeight) * ethPrice);
    }

    ///@notice returns token amount underlying glp amount deposited and stored pool amount
    ///@param state set of all state variables of vault
    ///@param token address of token
    ///@param glpDeposited amount of glp for which underlying token amount is being calculated
    ///@return amount of tokens of the supplied address underlying the given amount of glp
    function getTokenReservesInGlp(
        State storage state,
        address token,
        uint256 glpDeposited,
        bool withUpdatedPoolAmounts
    ) external view returns (uint256) {
        return _getTokenReservesInGlp(state, token, glpDeposited, withUpdatedPoolAmounts);
    }

    ///@notice returns token amount underlying glp amount deposited and stored pool amount
    ///@param state set of all state variables of vault
    ///@param token address of token
    ///@param glpDeposited amount of glp for which underlying token amount is being calculated
    ///@return amount of tokens of the supplied address underlying the given amount of glp
    function _getTokenReservesInGlp(
        State storage state,
        address token,
        uint256 glpDeposited,
        bool withUpdatedPoolAmounts
    ) private view returns (uint256) {
        uint256 poolAmount = withUpdatedPoolAmounts
            ? state.gmxVault.poolAmounts(token)
            : (token == address(state.wbtc) ? state.btcPoolAmount : state.ethPoolAmount);

        uint256 totalSupply = state.glp.totalSupply();

        int128 tokenTraderOIHedge = token == address(state.wbtc) ? state.btcTraderOIHedge : state.ethTraderOIHedge;

        // token reserve is the amount we short
        // tokenTraderOIHedge if >0 then we need to go long because of OI hence less short (i.e. subtract if value +ve)
        // tokenTraderOIHedge if <0 then we need to go short because of OI hence more long (i.e. add if value -ve)
        uint256 tokenReserve = tokenTraderOIHedge > 0
            ? poolAmount - uint256(int256(tokenTraderOIHedge))
            : poolAmount + uint256(int256(-tokenTraderOIHedge));

        return tokenReserve.mulDivDown(glpDeposited, totalSupply);
    }

    ///@notice returns token amount underlying glp amount deposited
    ///@param state set of all state variables of vault
    ///@param optimalBorrow optimal borrow amount basis glp deposits
    ///@param currentBorrow current borrow amount from AAVE
    ///@return true if the difference is below allowed threshold else false
    function isWithinAllowedDelta(
        State storage state,
        uint256 optimalBorrow,
        uint256 currentBorrow
    ) external view returns (bool) {
        return _isWithinAllowedDelta(state, optimalBorrow, currentBorrow);
    }

    ///@notice returns token amount underlying glp amount deposited
    ///@param state set of all state variables of vault
    ///@param optimalBorrow optimal borrow amount basis glp deposits
    ///@param currentBorrow current borrow amount from AAVE
    ///@return true if the difference is below allowed threshold else false
    function _isWithinAllowedDelta(
        State storage state,
        uint256 optimalBorrow,
        uint256 currentBorrow
    ) private view returns (bool) {
        // calcualte the absolute difference between the optimal and current borrows
        // optimal borrow is what we should borrow from AAVE
        // curret borrow is what is already borrowed from AAVE
        uint256 diff = optimalBorrow > currentBorrow ? optimalBorrow - currentBorrow : currentBorrow - optimalBorrow;

        // if absolute diff < threshold return true
        // if absolute diff > threshold return false
        return diff <= uint256(state.rebalanceDeltaThresholdBps).mulDivDown(currentBorrow, MAX_BPS);
    }

    // ISwapRouter internal constant swapRouter = ISwapRouter(0xE592427A0AEce92De3Edee1F18E0157C05861564);
    ///@notice swaps token into usdc
    ///@param state set of all state variables of vault
    ///@param token address of token
    ///@param tokenAmount token amount to be sold
    ///@param minUsdcAmount minimum amount of usdc required
    ///@return usdcReceived amount of usdc received on swap
    ///@return tokensUsed amount of tokens paid for swap
    function _swapToken(
        State storage state,
        address token,
        uint256 tokenAmount,
        uint256 minUsdcAmount
    ) internal returns (uint256 usdcReceived, uint256 tokensUsed) {
        ISwapRouter swapRouter = state.swapRouter;

        // path of the token swap
        bytes memory path = token == address(state.weth)
            ? SwapPath.generate({ tokenIn: state.weth, fee: 500, tokenOut: state.usdc, isExactIn: true })
            : SwapPath.generate({
                tokenIn: state.wbtc,
                feeIn: state.feeTierWethWbtcPool,
                tokenIntermediate: state.weth,
                feeOut: 500,
                tokenOut: state.usdc,
                isExactIn: true
            });

        // executes the swap on uniswap pool
        // exact input swap to convert exact amount of tokens into usdc
        ISwapRouter.ExactInputParams memory params = ISwapRouter.ExactInputParams({
            path: path,
            recipient: address(this),
            deadline: block.timestamp,
            amountIn: tokenAmount,
            amountOutMinimum: minUsdcAmount
        });

        // since exact input swap tokens used = token amount passed
        tokensUsed = tokenAmount;
        usdcReceived = swapRouter.exactInput(params);

        emit TokenSwapped(token, address(state.usdc), tokenAmount, usdcReceived);
    }

    ///@notice swaps usdc into token
    ///@param state set of all state variables of vault
    ///@param token address of token
    ///@param tokenAmount token amount to be bought
    ///@param maxUsdcAmount maximum amount of usdc that can be sold
    ///@return usdcPaid amount of usdc paid for swap
    ///@return tokensReceived amount of tokens received on swap
    function _swapUSDC(
        State storage state,
        address token,
        uint256 tokenAmount,
        uint256 maxUsdcAmount
    ) internal returns (uint256 usdcPaid, uint256 tokensReceived) {
        ISwapRouter swapRouter = state.swapRouter;

        bytes memory path = token == address(state.weth)
            ? SwapPath.generate({ tokenIn: state.usdc, fee: 500, tokenOut: state.weth, isExactIn: false })
            : SwapPath.generate({
                tokenIn: state.usdc,
                feeIn: 500,
                tokenIntermediate: state.weth,
                feeOut: state.feeTierWethWbtcPool,
                tokenOut: state.wbtc,
                isExactIn: false
            });

        // exact output swap to ensure exact amount of tokens are received
        ISwapRouter.ExactOutputParams memory params = ISwapRouter.ExactOutputParams({
            path: path,
            recipient: address(this),
            deadline: block.timestamp,
            amountOut: tokenAmount,
            amountInMaximum: maxUsdcAmount
        });

        // since exact output swap tokensReceived = tokenAmount passed
        tokensReceived = tokenAmount;
        usdcPaid = swapRouter.exactOutput(params);

        emit TokenSwapped(address(state.usdc), token, usdcPaid, tokensReceived);
    }

    function emitVaultState(State storage state, uint256 eventType) external {
        (uint256 currentBtc, uint256 currentEth) = _getCurrentBorrows(state);

        emit VaultState(
            eventType,
            currentBtc,
            currentEth,
            _getGlpPriceInUsdc(state, false),
            _totalAssets(state, false),
            state.fsGlp.balanceOf(address(this)),
            state.dnUsdcDeposited,
            state.unhedgedGlpInUsdc,
            state.aUsdc.balanceOf(address(this)),
            state.aUsdc.balanceOf(address(state.dnGmxSeniorVault))
        );
    }
}
