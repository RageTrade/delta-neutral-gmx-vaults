// SPDX-License-Identifier: MIT

pragma solidity ^0.8.9;

interface IBatchingManagerBypass {
    function deposit(uint256 glpAmount, address receiver) external returns (uint256);
}
