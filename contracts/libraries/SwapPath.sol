// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.0;

import { IERC20Metadata } from '@openzeppelin/contracts/interfaces/IERC20Metadata.sol';

library SwapPath {
    function generate(
        IERC20Metadata tokenIn,
        uint24 fee,
        IERC20Metadata tokenOut,
        bool isExactIn
    ) internal pure returns (bytes memory) {
        if (isExactIn) {
            return abi.encodePacked(tokenIn, fee, tokenOut);
        } else {
            return abi.encodePacked(tokenOut, fee, tokenIn);
        }
    }

    function generate(
        IERC20Metadata tokenIn,
        uint24 feeIn,
        IERC20Metadata tokenIntermediate,
        uint24 feeOut,
        IERC20Metadata tokenOut,
        bool isExactIn
    ) internal pure returns (bytes memory) {
        if (isExactIn) {
            return abi.encodePacked(tokenIn, feeIn, tokenIntermediate, feeOut, tokenOut);
        } else {
            return abi.encodePacked(tokenOut, feeOut, tokenIntermediate, feeIn, tokenIn);
        }
    }
}
