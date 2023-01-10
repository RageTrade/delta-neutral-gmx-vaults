// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.0;

import { IERC20Metadata } from '@openzeppelin/contracts/interfaces/IERC20Metadata.sol';

import { IQuoterV3 } from '@uniswap/v3-periphery/contracts/interfaces/IQuoterV3.sol';

import '../libraries/DnGmxJuniorVaultManager.sol';

contract DnGmxJuniorVaultManagerTest {
    DnGmxJuniorVaultManager.State state;

    constructor(
        IERC20Metadata usdc,
        IERC20Metadata weth,
        IERC20Metadata wbtc,
        IQuoterV3 quoter
    ) {
        state.usdc = usdc;
        state.weth = weth;
        state.wbtc = wbtc;

        state.uniswapV3Quoter = quoter;
        state.feeTierWethWbtcPool = 3000;
    }

    function getQuote(
        int256 tokenAmount,
        bytes memory sellPath,
        bytes memory buyPath
    ) public view returns (int256 otherTokenAmount) {
        return DnGmxJuniorVaultManager._getQuote(state, tokenAmount, sellPath, buyPath);
    }

    function quoteSwapSlippage(int256 btcAmountInBtcSwap, int256 ethAmountInEthSwap) public view returns (uint256) {
        return DnGmxJuniorVaultManager._quoteSwapSlippage(state, btcAmountInBtcSwap, ethAmountInEthSwap);
    }

    function USDC_TO_WETH() public view returns (bytes memory) {
        return abi.encodePacked(state.usdc, uint24(500), state.weth);
    }

    function USDC_TO_WBTC() public view returns (bytes memory) {
        return abi.encodePacked(state.usdc, uint24(500), state.weth, state.feeTierWethWbtcPool, state.wbtc);
    }

    function WETH_TO_USDC() public view returns (bytes memory) {
        return abi.encodePacked(state.weth, uint24(500), state.usdc);
    }

    function WBTC_TO_USDC() public view returns (bytes memory) {
        return abi.encodePacked(state.wbtc, state.feeTierWethWbtcPool, state.weth, uint24(500), state.usdc);
    }
}
