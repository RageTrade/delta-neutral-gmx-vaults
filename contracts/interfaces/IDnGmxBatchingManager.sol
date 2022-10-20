// SPDX-License-Identifier: MIT

import { IERC4626 } from './IERC4626.sol';

pragma solidity ^0.8.0;

interface IDnGmxBatchingManager {
    error NoUsdcBalance();

    error CallerNotVault();
    error CallerNotKeeper();

    error InvalidInput(uint256 errorCode);
    error InsufficientShares(uint256 balance);

    event DepositToken(
        uint256 indexed round,
        address indexed token,
        address indexed receiver,
        uint256 amount,
        uint256 glpStaked
    );

    event VaultDeposit(uint256 vaultGlpAmount);

    event KeeperUpdated(address newKeeper);
    event ThresholdsUpdated(uint256 newSlippageThresholdGmx);

    event BatchStake(uint256 indexed round, uint256 userUsdcAmount, uint256 userGlpAmount);
    event SharesClaimed(address indexed from, address indexed receiver, uint256 claimAmount);
    event BatchDeposit(uint256 indexed round, uint256 userUsdcAmount, uint256 userGlpAmount, uint256 userShareAmount);

    struct UserDeposit {
        uint256 round;
        uint128 usdcBalance;
        uint128 unclaimedShares;
    }
    struct RoundDeposit {
        uint128 totalUsdc;
        uint128 totalShares;
    }

    function depositToken(
        address token,
        uint256 amount,
        uint256 minUSDG
    ) external returns (uint256 glpStaked);

    function executeBatchStake() external;

    function executeBatchDeposit() external;

    function currentRound() external view returns (uint256);

    function claim(address receiver, uint256 amount) external;

    function usdcBalance(address account) external view returns (uint256 balance);

    function dnGmxJuniorVaultGlpBalance() external view returns (uint256 balance);

    function unclaimedShares(address account) external view returns (uint256 shares);

    function roundDeposits(uint256 round) external view returns (RoundDeposit memory);

    function depositUsdc(uint256 amount, address receiver) external returns (uint256 glpStaked);
}
