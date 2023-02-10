// SPDX-License-Identifier: MIT

pragma solidity ^0.8.9;

import { IERC20Metadata } from '@openzeppelin/contracts/interfaces/IERC20Metadata.sol';

import { DnGmxJuniorVaultManager } from '../libraries/DnGmxJuniorVaultManager.sol';
import { SwapPath } from '../libraries/SwapPath.sol';

import { IPriceOracle } from '@aave/core-v3/contracts/interfaces/IPriceOracle.sol';
import { IPoolAddressesProvider } from '@aave/core-v3/contracts/interfaces/IPoolAddressesProvider.sol';

contract QuoterV3Mock {
    using DnGmxJuniorVaultManager for DnGmxJuniorVaultManager.State;

    uint256 internal constant MAX_BPS = 10_000;
    uint256 internal constant PRICE_PRECISION = 1e30;

    DnGmxJuniorVaultManager.State internal state;

    bytes public USDC_TO_WETH;
    bytes public USDC_TO_WBTC;

    bytes public USDC_TO_WETH_;
    bytes public WETH_TO_USDC;
    bytes public WBTC_TO_USDC;

    uint256 slippageThresholdSwapBtcBps;
    uint256 slippageThresholdSwapEthBps;

    constructor() {
        state.feeTierWethWbtcPool = 500;

        state.wbtc = IERC20Metadata(0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f);
        state.weth = IERC20Metadata(0x82aF49447D8a07e3bd95BD0d56f35241523fBab1);
        state.usdc = IERC20Metadata(0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8);

        USDC_TO_WETH = SwapPath.generate({ tokenIn: state.usdc, fee: 500, tokenOut: state.weth, isExactIn: false });
        USDC_TO_WETH_ = SwapPath.generate({ tokenIn: state.usdc, fee: 500, tokenOut: state.weth, isExactIn: true });
        USDC_TO_WBTC = SwapPath.generate({
            tokenIn: state.usdc,
            feeIn: 500,
            tokenIntermediate: state.weth,
            feeOut: 3000,
            tokenOut: state.wbtc,
            isExactIn: false
        });

        WETH_TO_USDC = SwapPath.generate({ tokenIn: state.weth, fee: 500, tokenOut: state.usdc, isExactIn: true });
        WBTC_TO_USDC = SwapPath.generate({
            tokenIn: state.wbtc,
            feeIn: 3000,
            tokenIntermediate: state.weth,
            feeOut: 500,
            tokenOut: state.usdc,
            isExactIn: true
        });

        state.poolAddressProvider = IPoolAddressesProvider(0xa97684ead0e402dC232d5A977953DF7ECBaB3CDb);
        state.oracle = IPriceOracle(state.poolAddressProvider.getPriceOracle());
    }

    function setSlippages(uint256 _slippageThresholdSwapBtcBps, uint256 _slippageThresholdSwapEthBps) external {
        slippageThresholdSwapBtcBps = _slippageThresholdSwapBtcBps;
        slippageThresholdSwapEthBps = _slippageThresholdSwapEthBps;
    }

    function quoteExactInput(bytes memory path, uint256 amountIn) external view returns (uint256 amountOut) {
        uint256 btcPrice = state.getTokenPriceInUsdc(state.wbtc);
        uint256 ethPrice = state.getTokenPriceInUsdc(state.weth);
        if (keccak256(path) == keccak256(USDC_TO_WETH_)) {
            return (amountIn * PRICE_PRECISION * (MAX_BPS - slippageThresholdSwapEthBps)) / MAX_BPS / ethPrice;
        }
        return
            keccak256(path) == keccak256(WETH_TO_USDC)
                ? (ethPrice * amountIn * (MAX_BPS - slippageThresholdSwapEthBps)) / MAX_BPS / PRICE_PRECISION
                : (btcPrice * amountIn * (MAX_BPS - slippageThresholdSwapBtcBps)) / MAX_BPS / PRICE_PRECISION;
    }

    function quoteExactOutput(bytes memory path, uint256 amountOut) external view returns (uint256 amountIn) {
        uint256 btcPrice = state.getTokenPriceInUsdc(state.wbtc);
        uint256 ethPrice = state.getTokenPriceInUsdc(state.weth);
        if (keccak256(path) == keccak256(USDC_TO_WETH_)) {
            return (amountOut * PRICE_PRECISION * (MAX_BPS + slippageThresholdSwapEthBps)) / MAX_BPS / ethPrice;
        }
        return
            keccak256(path) == keccak256(USDC_TO_WETH)
                ? (ethPrice * amountOut * (MAX_BPS + slippageThresholdSwapEthBps)) / MAX_BPS / PRICE_PRECISION
                : (btcPrice * amountOut * (MAX_BPS + slippageThresholdSwapBtcBps)) / MAX_BPS / PRICE_PRECISION;
    }
}
