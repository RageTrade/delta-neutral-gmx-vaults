// SPDX-License-Identifier: MIT

import { IERC4626 } from './IERC4626.sol';

pragma solidity ^0.8.0;

interface IDnGmxBatchingManagerGlp {
    error NoAssetBalance();

    error CallerNotVault();
    error CallerNotKeeper();

    error InvalidInput(uint256 errorCode);
    error InsufficientShares(uint256 balance);

    error DepositCapBreached();

    event DepositToken(
        uint256 indexed round,
        address indexed token,
        address indexed receiver,
        uint256 amount,
        uint256 glpStaked
    );

    event KeeperUpdated(address newKeeper);
    event ThresholdsUpdated(uint256 minGlpDepositThreshold);

    event SharesClaimed(address indexed from, address indexed receiver, uint256 claimAmount);
    event BatchDeposit(uint256 indexed round, uint256 totalAssets, uint256 userGlpAmount, uint256 userShareAmount);

    event ClaimedAndRedeemed(address indexed claimer, address indexed receiver, uint256 shares, uint256 assetsReceived);
    event DepositCapUpdated(uint256 newDepositCap);
    event PartialBatchDeposit(uint256 indexed round, uint256 partialGlpAmount, uint256 partialShareAmount);

    struct UserDeposit {
        uint256 round;
        uint128 assetBalance;
        uint128 unclaimedShares;
    }
    struct RoundDeposit {
        uint128 totalAssets;
        uint128 totalShares;
    }

    function executeBatch(uint128 sGlpToDeposit) external;

    function currentRound() external view returns (uint256);

    function claim(address receiver, uint256 amount) external;

    function roundAssetBalance() external view returns (uint256);

    function assetBalance(address account) external view returns (uint256 balance);

    function unclaimedShares(address account) external view returns (uint256 shares);

    function roundDeposits(uint256 round) external view returns (RoundDeposit memory);

    function deposit(uint256 amount, address receiver) external;
}
