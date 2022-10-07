// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import { IERC4626 } from './IERC4626.sol';

interface IDnGmxSeniorVault is IERC4626 {
    function borrow(uint256 amount) external;

    function repay(uint256 amount) external;

    function getEthRewardsSplitRate() external returns (uint256);

    function getPriceX128() external view returns (uint256);

    function getVaultMarketValue() external view returns (uint256);

    function depositCap() external view returns (uint256);
}
