// SPDX-License-Identifier: MIT

pragma solidity ^0.8.9;

import { IERC20 } from '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import { IERC20Metadata } from '@openzeppelin/contracts/interfaces/IERC20Metadata.sol';
import { ISwapRouter } from '@uniswap/v3-periphery/contracts/interfaces/ISwapRouter.sol';

import { DnGmxJuniorVaultManager } from '../libraries/DnGmxJuniorVaultManager.sol';
import { SwapPath } from '../libraries/SwapPath.sol';

contract SwapRouterMock {
    address internal constant wbtc = 0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f;
    address internal constant weth = 0x82aF49447D8a07e3bd95BD0d56f35241523fBab1;
    address internal constant usdc = 0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8;

    bytes internal USDC_TO_WETH;
    bytes internal USDC_TO_WBTC;

    bytes internal WETH_TO_USDC;
    bytes internal WBTC_TO_USDC;

    constructor() {
        USDC_TO_WETH = SwapPath.generate({
            tokenIn: IERC20Metadata(usdc),
            fee: 500,
            tokenOut: IERC20Metadata(weth),
            isExactIn: false
        });
        USDC_TO_WBTC = SwapPath.generate({
            tokenIn: IERC20Metadata(usdc),
            feeIn: 500,
            tokenIntermediate: IERC20Metadata(weth),
            feeOut: 500,
            tokenOut: IERC20Metadata(wbtc),
            isExactIn: false
        });

        WETH_TO_USDC = SwapPath.generate({
            tokenIn: IERC20Metadata(weth),
            fee: 500,
            tokenOut: IERC20Metadata(usdc),
            isExactIn: true
        });
        WBTC_TO_USDC = SwapPath.generate({
            tokenIn: IERC20Metadata(wbtc),
            feeIn: 500,
            tokenIntermediate: IERC20Metadata(weth),
            feeOut: 500,
            tokenOut: IERC20Metadata(usdc),
            isExactIn: true
        });
    }

    function exactOutputSingle(
        ISwapRouter.ExactOutputSingleParams calldata params
    ) external returns (uint256 amountIn) {
        IERC20(params.tokenIn).transferFrom(msg.sender, address(this), params.amountInMaximum);
        IERC20(params.tokenOut).transfer(msg.sender, params.amountOut);
        return params.amountInMaximum;
    }

    function exactInputSingle(ISwapRouter.ExactInputSingleParams calldata params) external returns (uint256 amountOut) {
        IERC20(params.tokenIn).transferFrom(msg.sender, address(this), params.amountIn);
        IERC20(params.tokenOut).transfer(msg.sender, params.amountOutMinimum);
        return params.amountOutMinimum;
    }

    function exactOutput(ISwapRouter.ExactOutputParams calldata params) external returns (uint256 amountIn) {
        address to;
        address from;

        bytes memory path = params.path;

        if (keccak256(path) == keccak256(USDC_TO_WETH)) {
            from = usdc;
            to = weth;
        } else {
            from = usdc;
            to = wbtc;
        }

        IERC20(from).transferFrom(msg.sender, address(this), params.amountInMaximum);
        IERC20(to).transfer(msg.sender, params.amountOut);
        return params.amountInMaximum;
    }

    function exactInput(ISwapRouter.ExactInputParams calldata params) external returns (uint256 amountOut) {
        address to;
        address from;

        bytes memory path = params.path;

        if (keccak256(path) == keccak256(WETH_TO_USDC)) {
            from = weth;
            to = usdc;
        } else {
            from = wbtc;
            to = usdc;
        }

        IERC20(from).transferFrom(msg.sender, address(this), params.amountIn);
        IERC20(to).transfer(msg.sender, params.amountOutMinimum);
        return params.amountOutMinimum;
    }
}
