// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.0;

import { SafeCast } from '@uniswap/v3-core/contracts/libraries/SafeCast.sol';
import { TickMath } from '@uniswap/v3-core/contracts/libraries/TickMath.sol';
import { IUniswapV3Pool } from '@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol';
import { IUniswapV3SwapCallback } from '@uniswap/v3-core/contracts/interfaces/callback/IUniswapV3SwapCallback.sol';

import { Path } from '@uniswap/v3-periphery/contracts/libraries/Path.sol';
import { PoolAddress } from '@uniswap/v3-periphery/contracts/libraries/PoolAddress.sol';
import { CallbackValidation } from '@uniswap/v3-periphery/contracts/libraries/CallbackValidation.sol';

import { Simulate } from './Simulate.sol';

/// @title Provides quotes for swaps
/// @notice Allows getting the expected amount out or amount in for a given swap without executing the swap
/// @dev These functions are not gas efficient and should _not_ be called on chain. Instead, optimistically execute
/// the swap and check the amounts in the callback.
library QuoterLib {
    using Path for bytes;
    using SafeCast for uint256;
    using Simulate for IUniswapV3Pool;

    address constant factory = 0x1F98431c8aD98523631AE4a59f267346ea31F984;

    function _getPool(
        address tokenA,
        address tokenB,
        uint24 fee
    ) internal pure returns (IUniswapV3Pool) {
        return IUniswapV3Pool(PoolAddress.computeAddress(factory, PoolAddress.getPoolKey(tokenA, tokenB, fee)));
    }

    function _decodeFirstPool(bytes memory path, bool exactIn)
        internal
        pure
        returns (IUniswapV3Pool pool, bool zeroForOne)
    {
        (address tokenA, address tokenB, uint24 fee) = path.decodeFirstPool();
        pool = _getPool(tokenA, tokenB, fee);
        zeroForOne = exactIn == (tokenA < tokenB);
    }

    function _quoteExactInputSingle(
        IUniswapV3Pool pool,
        bool zeroForOne,
        uint256 amountIn,
        uint160 sqrtPriceLimitX96,
        Simulate.State memory swapState
    ) internal view returns (uint256 amountOut) {
        (int256 amount0, int256 amount1) = pool.simulateSwap(
            zeroForOne,
            amountIn.toInt256(),
            sqrtPriceLimitX96 == 0
                ? (zeroForOne ? TickMath.MIN_SQRT_RATIO + 1 : TickMath.MAX_SQRT_RATIO - 1)
                : sqrtPriceLimitX96,
            swapState
        );
        return zeroForOne ? uint256(-amount1) : uint256(-amount0);
    }

    function _quoteExactInput(
        bytes memory path,
        uint256 amountIn,
        Simulate.State[] memory swapStates
    ) internal view returns (uint256[] memory amounts, Simulate.State[] memory swapStatesEnd) {
        uint256 i = path.numPools();
        amounts = new uint256[](i + 1);
        if (swapStates.length == 0) {
            swapStates = new Simulate.State[](i);
        }
        amounts[i] = amountIn;
        while (true) {
            (IUniswapV3Pool pool, bool zeroForOne) = _decodeFirstPool(path, true);

            // the outputs of prior swaps become the inputs to subsequent ones
            --i;
            amounts[i] = _quoteExactInputSingle(pool, zeroForOne, amounts[i + 1], 0, swapStates[i]);

            // decide whether to continue or terminate
            if (i > 0) {
                path = path.skipToken();
            } else {
                break;
            }
        }
        return (amounts, swapStates);
    }

    function _quoteExactOutputSingle(
        IUniswapV3Pool pool,
        bool zeroForOne,
        uint256 amountOut,
        uint160 sqrtPriceLimitX96,
        Simulate.State memory swapState
    ) internal view returns (uint256 amountIn) {
        (int256 amount0, int256 amount1) = pool.simulateSwap(
            zeroForOne,
            -amountOut.toInt256(),
            sqrtPriceLimitX96 == 0
                ? (zeroForOne ? TickMath.MIN_SQRT_RATIO + 1 : TickMath.MAX_SQRT_RATIO - 1)
                : sqrtPriceLimitX96,
            swapState
        );
        return zeroForOne ? uint256(amount0) : uint256(amount1);
    }

    function _quoteExactOutput(
        bytes memory path,
        uint256 amountOut,
        Simulate.State[] memory swapStates
    ) internal view returns (uint256[] memory amounts, Simulate.State[] memory swapStatesEnd) {
        uint256 i = path.numPools();
        amounts = new uint256[](i + 1);
        if (swapStates.length == 0) {
            swapStates = new Simulate.State[](i);
        }
        amounts[i] = amountOut;
        while (true) {
            (IUniswapV3Pool pool, bool zeroForOne) = _decodeFirstPool(path, false);

            // the inputs of prior swaps become the outputs of subsequent ones
            --i;
            amounts[i] = _quoteExactOutputSingle(pool, zeroForOne, amounts[i + 1], 0, swapStates[i]);

            // decide whether to continue or terminate
            if (i > 0) {
                path = path.skipToken();
            } else {
                break;
            }
        }
        return (amounts, swapStates);
    }

    function _getQuote(
        int256 tokenAmount,
        bytes memory swapPath,
        Simulate.State[] memory swapStates
    )
        internal
        view
        returns (
            int256,
            int256,
            Simulate.State[] memory
        )
    {
        if (tokenAmount > 0) {
            // swap wbtc to usdc
            (uint256[] memory otherTokenAmounts, Simulate.State[] memory swapStatesEnd) = _quoteExactInput(
                swapPath,
                uint256(tokenAmount),
                swapStates
            );
            return (-int256(otherTokenAmounts[0]), int256(otherTokenAmounts[1]), swapStatesEnd); // pool looses usdc hence negative
        } else if (tokenAmount < 0) {
            // swap usdc to wbtc
            (uint256[] memory otherTokenAmounts, Simulate.State[] memory swapStatesEnd) = _quoteExactOutput(
                swapPath,
                uint256(-tokenAmount),
                swapStates
            );
            return (int256(otherTokenAmounts[0]), -int256(otherTokenAmounts[1]), swapStatesEnd); // pool gains usdc hence positive
        } else {
            return (0, 0, swapStates);
        }
    }

    function _quoteCombinedSwap(
        int256 btcAmountInBtcSwap,
        int256 ethAmountInEthSwap,
        bytes memory btcSellPath,
        bytes memory ethSellPath
    ) internal view returns (int256 usdcAmountInBtcSwap, int256 usdcAmountInEthSwap) {
        // btc swap
        int256 ethAmountInBtcSwap;
        Simulate.State[] memory swapStates;
        (usdcAmountInBtcSwap, ethAmountInBtcSwap, swapStates) = _getQuote(
            btcAmountInBtcSwap,
            btcSellPath, // WBTC_TO_USDC(state),
            swapStates
        );

        // eth swap (also accounting for price change in btc swap)
        Simulate.State[] memory swapStates2 = new Simulate.State[](1);
        if (ethAmountInBtcSwap != 0) {
            swapStates2[0] = swapStates[0];
        }
        (usdcAmountInEthSwap, , ) = _getQuote(
            ethAmountInEthSwap,
            ethSellPath, // WETH_TO_USDC(state),
            swapStates2
        );

        // ensure ethAmountInEthSwap and usdcAmountInEthSwap are of opposite sign when they are both non-zero
        assert(
            ethAmountInEthSwap == 0 || usdcAmountInEthSwap == 0 || ethAmountInEthSwap > 0 != usdcAmountInEthSwap > 0
        );
    }

    function quoteCombinedSwap(
        int256 btcAmountInBtcSwap,
        int256 ethAmountInEthSwap,
        bytes memory btcSellPath,
        bytes memory ethSellPath
    ) external view returns (int256 usdcAmountInBtcSwap, int256 usdcAmountInEthSwap) {
        return _quoteCombinedSwap(btcAmountInBtcSwap, ethAmountInEthSwap, btcSellPath, ethSellPath);
    }
}
