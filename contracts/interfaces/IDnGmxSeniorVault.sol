// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import { IBorrower } from './IBorrower.sol';
import { IERC4626 } from './IERC4626.sol';

interface IDnGmxSeniorVault is IERC4626 {
    error InvalidMaxUtilizationBps();

    error CallerNotBorrower();

    error InvalidCapUpdate();
    error InvalidBorrowAmount();
    error InvalidBorrowerAddress();

    error DepositCapExceeded();
    error MaxUtilizationBreached();

    event AllowancesGranted();
    event DepositCapUpdated(uint256 _newDepositCap);
    event BorrowCapUpdated(address vault, uint256 newCap);

    event LeveragePoolUpdated(IBorrower leveragePool);
    event DnGmxJuniorVaultUpdated(IBorrower dnGmxJuniorVault);
    event MaxUtilizationBpsUpdated(uint256 maxUtilizationBps);

    event FeeStrategyUpdated(
        uint128 optimalUtilizationRate,
        uint128 baseVariableBorrowRate,
        uint128 variableRateSlope1,
        uint128 variableRateSlope2
    );

    // eventType - 0 = start of txn | 1 = end of txn
    event VaultState(uint256 indexed eventType, uint256 juniorVaultAusdc, uint256 seniorVaultAusdc);

    function borrow(uint256 amount) external;

    function repay(uint256 amount) external;

    function depositCap() external view returns (uint256);

    function getPriceX128() external view returns (uint256);

    function getEthRewardsSplitRate() external returns (uint256);

    function getVaultMarketValue() external view returns (uint256);

    function availableBorrow(address borrower) external view returns (uint256);
}
