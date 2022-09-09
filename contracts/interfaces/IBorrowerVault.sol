// SPDX-License-Identifier: MIT

pragma solidity ^0.8.9;

interface IBorrowerVault {
    function getUsdcBorrowed() external view returns (uint256);
}
