// SPDX-License-Identifier: MIT

pragma solidity ^0.8.9;

interface IBorrower {
    function getUsdcBorrowed() external view returns (uint256);
}
