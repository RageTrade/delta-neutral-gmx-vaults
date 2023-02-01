// SPDX-License-Identifier: agpl-3.0

pragma solidity >=0.8.0;

import { FullMath } from '@uniswap/v3-core/contracts/libraries/FullMath.sol';

/**
 * @title FeeSplitStrategy library
 * @notice Implements the calculation of the eth reward split depending on the utilization of reserve
 * @dev The model of interest rate is based on 2 slopes, one before the `OPTIMAL_UTILIZATION_RATE`
 * point of utilization and another from that one to 100%
 * @author adapted from https://github.com/aave/protocol-v2/blob/6f57232358af0fd41d9dcf9309d7a8c0b9aa3912/contracts/protocol/lendingpool/DefaultReserveInterestRateStrategy.sol
 **/

library FeeSplitStrategy {
    using FullMath for uint128;
    using FullMath for uint256;

    uint256 internal constant RATE_PRECISION = 1e30;

    struct Info {
        /**
         * @dev this constant represents the utilization rate at which the pool aims to obtain most competitive borrow rates.
         * Expressed in ray
         **/
        uint128 optimalUtilizationRate;
        // Base variable borrow rate when Utilization rate = 0. Expressed in ray
        uint128 baseVariableBorrowRate;
        // Slope of the variable interest curve when utilization rate > 0 and <= OPTIMAL_UTILIZATION_RATE. Expressed in ray
        uint128 variableRateSlope1;
        // Slope of the variable interest curve when utilization rate > OPTIMAL_UTILIZATION_RATE. Expressed in ray
        uint128 variableRateSlope2;
    }

    function getMaxVariableBorrowRate(Info storage feeStrategyInfo) internal view returns (uint256) {
        return
            feeStrategyInfo.baseVariableBorrowRate +
            feeStrategyInfo.variableRateSlope1 +
            feeStrategyInfo.variableRateSlope2;
    }

    /**
     * @dev Calculates the interest rates depending on the reserve's state and configurations.
     * NOTE This function is kept for compatibility with the previous DefaultInterestRateStrategy interface.
     * New protocol implementation uses the new calculateInterestRates() interface
     * @param availableLiquidity The liquidity available in the corresponding aToken
     * @param usedLiquidity The total borrowed from the reserve at a variable rate
     **/
    function calculateFeeSplit(
        Info storage feeStrategy,
        uint256 availableLiquidity,
        uint256 usedLiquidity
    ) internal view returns (uint256 feeSplitRate) {
        uint256 utilizationRate = usedLiquidity == 0
            ? 0
            : usedLiquidity.mulDiv(RATE_PRECISION, availableLiquidity + usedLiquidity);

        uint256 excessUtilizationRate = RATE_PRECISION - feeStrategy.optimalUtilizationRate;

        if (utilizationRate > feeStrategy.optimalUtilizationRate) {
            uint256 excessUtilizationRateRatio = (utilizationRate - feeStrategy.optimalUtilizationRate).mulDiv(
                RATE_PRECISION,
                excessUtilizationRate
            );

            feeSplitRate =
                feeStrategy.baseVariableBorrowRate +
                feeStrategy.variableRateSlope1 +
                feeStrategy.variableRateSlope2.mulDiv(excessUtilizationRateRatio, RATE_PRECISION);
        } else {
            feeSplitRate =
                feeStrategy.baseVariableBorrowRate +
                utilizationRate.mulDiv(feeStrategy.variableRateSlope1, feeStrategy.optimalUtilizationRate);
        }
    }
}
