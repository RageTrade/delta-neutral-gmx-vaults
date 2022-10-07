// SPDX-License-Identifier: MIT

pragma solidity ^0.8.9;

import { IERC4626 } from './IERC4626.sol';
import { IBorrower } from './IBorrower.sol';

interface IDnGmxJuniorVault is IERC4626, IBorrower {
    function getMarketValue(uint256 assetAmount) external view returns (uint256 marketValue);

    function harvestFees() external;

    function getPriceX128() external view returns (uint256);

    function getVaultMarketValue() external view returns (uint256);

    function depositCap() external view returns(uint256);
}
