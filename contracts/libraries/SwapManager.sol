// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import { ISwapRouter } from '@uniswap/v3-periphery/contracts/interfaces/ISwapRouter.sol';
import { IERC20Metadata } from '@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol';

library SwapManager {
    address internal constant usdc = 0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8;
    ISwapRouter internal constant swapRouter = ISwapRouter(0xE592427A0AEce92De3Edee1F18E0157C05861564);

    function swapToken(
        address token,
        uint256 tokenAmount,
        uint256 minUsdcAmount
    ) external returns (uint256 usdcReceived, uint256 tokensUsed) {
        ISwapRouter.ExactInputSingleParams memory params = ISwapRouter.ExactInputSingleParams({
            tokenIn: token,
            tokenOut: address(usdc),
            fee: uint24(3000),
            recipient: address(this),
            deadline: block.timestamp,
            amountIn: tokenAmount,
            amountOutMinimum: minUsdcAmount,
            sqrtPriceLimitX96: 0
        });

        tokensUsed = tokenAmount;
        usdcReceived = swapRouter.exactInputSingle(params);
    }

    function swapUSDC(
        address token,
        uint256 tokenAmount,
        uint256 maxUsdcAmount
    ) external returns (uint256 usdcPaid, uint256 tokensReceived) {
        ISwapRouter.ExactOutputSingleParams memory params = ISwapRouter.ExactOutputSingleParams({
            tokenIn: address(usdc),
            tokenOut: token,
            fee: uint24(3000),
            recipient: address(this),
            deadline: block.timestamp,
            amountOut: tokenAmount,
            amountInMaximum: maxUsdcAmount,
            sqrtPriceLimitX96: 0
        });

        tokensReceived = tokenAmount;
        usdcPaid = swapRouter.exactOutputSingle(params);
    }
}
