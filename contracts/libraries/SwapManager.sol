// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import { ISwapRouter } from '@uniswap/v3-periphery/contracts/interfaces/ISwapRouter.sol';
import { IERC20Metadata } from '@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol';

interface ISwapRouterGetter {
    function swapRouter() external view returns (ISwapRouter);
}

library SwapManager {
    address internal constant wbtc = 0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f;
    address internal constant weth = 0x82aF49447D8a07e3bd95BD0d56f35241523fBab1;
    address internal constant usdc = 0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8;

    bytes internal constant USDC_TO_WETH = abi.encodePacked(weth, uint24(500), usdc);
    bytes internal constant USDC_TO_WBTC = abi.encodePacked(wbtc, uint24(3000), weth, uint24(500), usdc);

    bytes internal constant WETH_TO_USDC = abi.encodePacked(weth, uint24(500), usdc);
    bytes internal constant WBTC_TO_USDC = abi.encodePacked(wbtc, uint24(3000), weth, uint24(500), usdc);

    // ISwapRouter internal constant swapRouter = ISwapRouter(0xE592427A0AEce92De3Edee1F18E0157C05861564);

    function swapToken(
        address token,
        uint256 tokenAmount,
        uint256 minUsdcAmount
    ) external returns (uint256 usdcReceived, uint256 tokensUsed) {
        ISwapRouter swapRouter = ISwapRouterGetter(address(this)).swapRouter();

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
        address token,
        uint256 tokenAmount,
        uint256 maxUsdcAmount
    ) external returns (uint256 usdcPaid, uint256 tokensReceived) {
        ISwapRouter swapRouter = ISwapRouterGetter(address(this)).swapRouter();

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
