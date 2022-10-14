// SPDX-License-Identifier: MIT

pragma solidity ^0.8.9;

import { IERC20 } from '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import { ISwapRouter } from '@uniswap/v3-periphery/contracts/interfaces/ISwapRouter.sol';

import { SwapManager } from '../libraries/SwapManager.sol';

contract SwapRouterMock {
    function exactOutputSingle(ISwapRouter.ExactOutputSingleParams calldata params)
        external
        returns (uint256 amountIn)
    {
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

        if (keccak256(path) == keccak256(SwapManager.USDC_TO_WETH)) {
            from = SwapManager.usdc;
            to = SwapManager.weth;
        } else {
            from = SwapManager.usdc;
            to = SwapManager.wbtc;
        }

        IERC20(from).transferFrom(msg.sender, address(this), params.amountInMaximum);
        IERC20(to).transfer(msg.sender, params.amountOut);
        return params.amountInMaximum;
    }

    function exactInput(ISwapRouter.ExactInputParams calldata params) external returns (uint256 amountOut) {
        address to;
        address from;

        bytes memory path = params.path;

        if (keccak256(path) == keccak256(SwapManager.WETH_TO_USDC)) {
            from = SwapManager.weth;
            to = SwapManager.usdc;
        } else {
            from = SwapManager.wbtc;
            to = SwapManager.usdc;
        }

        IERC20(from).transferFrom(msg.sender, address(this), params.amountIn);
        IERC20(to).transfer(msg.sender, params.amountOutMinimum);
        return params.amountOutMinimum;
    }
}
