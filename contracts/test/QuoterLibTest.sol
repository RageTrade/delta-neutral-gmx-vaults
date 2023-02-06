// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.0;

import { IPriceOracle } from '@aave/core-v3/contracts/interfaces/IPriceOracle.sol';
import { IERC20Metadata } from '@openzeppelin/contracts/interfaces/IERC20Metadata.sol';

import { DnGmxJuniorVaultManager } from '../libraries/DnGmxJuniorVaultManager.sol';
import '../libraries/QuoterLib.sol';
import '../libraries/SwapPath.sol';

contract QuoterLibTest {
    DnGmxJuniorVaultManager.State state;

    constructor(IERC20Metadata usdc, IERC20Metadata weth, IERC20Metadata wbtc) {
        state.usdc = usdc;
        state.weth = weth;
        state.wbtc = wbtc;

        state.feeTierWethWbtcPool = 3000;
        state.oracle = IPriceOracle(0xb56c2F0B653B2e0b10C9b928C8580Ac5Df02C7C7);
    }

    function getQuote(int256 tokenAmount, bytes memory swapPath) public view returns (int256 otherTokenAmount) {
        Simulate.State[] memory states;
        (otherTokenAmount, , ) = QuoterLib._getQuote(tokenAmount, swapPath, states);
    }

    function quoteCombinedSwap(
        int256 btcAmountInBtcSwap,
        int256 ethAmountInEthSwap
    ) public view returns (int256 usdcAmountInBtcSwap, int256 usdcAmountInEthSwap) {
        return QuoterLib._quoteCombinedSwap(btcAmountInBtcSwap, ethAmountInEthSwap, WBTC_TO_USDC(), WETH_TO_USDC());
    }

    function getTokenPriceInUsdc(IERC20Metadata token) external view returns (uint256 scaledPrice) {
        return DnGmxJuniorVaultManager._getTokenPriceInUsdc(state, token);
    }

    function USDC_TO_WETH() public view returns (bytes memory) {
        return SwapPath.generate({ tokenIn: state.usdc, fee: 500, tokenOut: state.weth, isExactIn: true });
    }

    function WETH_TO_USDC() public view returns (bytes memory) {
        return SwapPath.generate({ tokenIn: state.weth, fee: 500, tokenOut: state.usdc, isExactIn: true });
    }

    function USDC_TO_WBTC() public view returns (bytes memory) {
        return
            SwapPath.generate({
                tokenIn: state.usdc,
                feeIn: 500,
                tokenIntermediate: state.weth,
                feeOut: state.feeTierWethWbtcPool,
                tokenOut: state.wbtc,
                isExactIn: true
            });
    }

    function WBTC_TO_USDC() public view returns (bytes memory) {
        return
            SwapPath.generate({
                tokenIn: state.wbtc,
                feeIn: state.feeTierWethWbtcPool,
                tokenIntermediate: state.weth,
                feeOut: 500,
                tokenOut: state.usdc,
                isExactIn: true
            });
    }
}
