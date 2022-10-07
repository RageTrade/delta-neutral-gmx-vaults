// SPDX-License-Identifier: MIT

pragma solidity ^0.8.9;

import { IERC20 } from '@openzeppelin/contracts/token/ERC20/IERC20.sol';

contract StableSwapMock {
    error SwapNotAllowed();
    error InsufficientOutput();

    uint256 price; // usd per 1e8 wbtc;

    mapping(uint256 => IERC20) public coins;

    function setPrice(uint256 _price) external {
        price = _price;
    }

    constructor() {
        // USDT = 0, WBTC = 1, WETH = 2
        coins[0] = IERC20(0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9);
        coins[1] = IERC20(0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f);
        coins[2] = IERC20(0x82aF49447D8a07e3bd95BD0d56f35241523fBab1);
    }

    function exchange(
        uint256 i,
        uint256 j,
        uint256 dx,
        uint256 min_dy,
        bool use_eth
    ) external {
        if (use_eth) revert SwapNotAllowed();
        if (!((i == 0 && j == 1) || (i == 1 && j == 0))) revert SwapNotAllowed();

        coins[i].transferFrom(msg.sender, address(this), dx);

        uint256 dy = i == 0 ? (dx * 1e8) / price : (dx * price) / 1e8;

        if (dy < min_dy) revert InsufficientOutput();

        coins[j].transfer(msg.sender, dy);
    }
}
