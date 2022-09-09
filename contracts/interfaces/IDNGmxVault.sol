// SPDX-License-Identifier: MIT

pragma solidity ^0.8.9;

import { IERC4626 } from './IERC4626.sol';

interface IDNGmxVault is IERC4626 {
    function getUsdcBorrowed() external returns (uint256);

    function getMarketValue(uint256 assetAmount) external view returns (uint256 marketValue);
}
