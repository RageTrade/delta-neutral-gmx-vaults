// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;

interface IDnGmxRouter {
    function deposit(uint256 amount, address receiver) external returns (uint256);

    function executeBatchDeposit() external;
}
