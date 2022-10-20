// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import { IERC4626 } from './IERC4626.sol';

interface IDnGmxSeniorVault is IERC4626 {
    error CallerNotBorrower();

    error InvalidCapUpdate();
    error InvalidBorrowAmount();
    error InvalidBorrowerAddress();

    error DepositCapExceeded();
    error MaxUtilizationBreached();

    event AllowancesGranted();
    event DepositCapUpdated(uint256 _newDepositCap);
    event BorrowCapUpdated(address vault, uint256 newCap);

    function borrow(uint256 amount) external;

    function repay(uint256 amount) external;

    function depositCap() external view returns (uint256);

    function getPriceX128() external view returns (uint256);

    function getEthRewardsSplitRate() external returns (uint256);

    function getVaultMarketValue() external view returns (uint256);

    function availableBorrow(address borrower) external returns (uint256);
}
