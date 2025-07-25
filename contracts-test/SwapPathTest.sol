// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.0;

import '../libraries/SwapPath.sol';

contract SwapPathTest {
    function generate1(
        IERC20Metadata tokenIn,
        uint24 fee,
        IERC20Metadata tokenOut,
        bool isExactIn
    ) external pure returns (bytes memory) {
        return SwapPath.generate(tokenIn, fee, tokenOut, isExactIn);
    }

    function generate2(
        IERC20Metadata tokenIn,
        uint24 feeIn,
        IERC20Metadata tokenIntermediate,
        uint24 feeOut,
        IERC20Metadata tokenOut,
        bool isExactIn
    ) external pure returns (bytes memory) {
        return SwapPath.generate(tokenIn, feeIn, tokenIntermediate, feeOut, tokenOut, isExactIn);
    }
}
