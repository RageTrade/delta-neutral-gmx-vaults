// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.0;

import { IPriceOracle } from '@aave/core-v3/contracts/interfaces/IPriceOracle.sol';
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
        state.oracle = IPriceOracle(0xb56c2F0B653B2e0b10C9b928C8580Ac5Df02C7C7);
    }

    function getQuote(int256 tokenAmount, bytes memory swapPath) public view returns (int256 otherTokenAmount) {
        return DnGmxJuniorVaultManager._getQuote(state, tokenAmount, swapPath);
    }

    function quoteSwapSlippageLoss(int256 btcAmountInBtcSwap, int256 ethAmountInEthSwap) public view returns (uint256) {
        return DnGmxJuniorVaultManager._quoteSwapSlippageLoss(state, btcAmountInBtcSwap, ethAmountInEthSwap);
    }

    function getTokenPriceInUsdc(IERC20Metadata token) external view returns (uint256 scaledPrice) {
        return DnGmxJuniorVaultManager._getTokenPriceInUsdc(state, token);
    }

    function USDC_TO_WETH() public view returns (bytes memory) {
        return abi.encodePacked(state.usdc, uint24(500), state.weth);
    }

    function WETH_TO_USDC() public view returns (bytes memory) {
        return abi.encodePacked(state.weth, uint24(500), state.usdc);
    }

    function USDC_TO_WBTC() public view returns (bytes memory) {
        return abi.encodePacked(state.usdc, uint24(500), state.weth, state.feeTierWethWbtcPool, state.wbtc);
    }

    function WBTC_TO_USDC() public view returns (bytes memory) {
        return abi.encodePacked(state.wbtc, state.feeTierWethWbtcPool, state.weth, uint24(500), state.usdc);
    }
}
