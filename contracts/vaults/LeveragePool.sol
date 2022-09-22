// SPDX-License-Identifier: MIT

pragma solidity ^0.8.9;

import { SafeCast } from 'contracts/libraries/SafeCast.sol';

import { FullMath } from '@uniswap/v3-core-0.8-support/contracts/libraries/FullMath.sol';

import { IGMXBatchingManager } from 'contracts/interfaces/gmx/IGMXBatchingManager.sol';

import { ISGLPExtended } from 'contracts/interfaces/gmx/ISGLPExtended.sol';
import { IRewardRouterV2 } from 'contracts/interfaces/gmx/IRewardRouterV2.sol';
import { IGlpStakingManager } from 'contracts/interfaces/gmx/IGlpStakingManager.sol';
import { IDnGmxSeniorVault } from 'contracts/interfaces/IDnGmxSeniorVault.sol';
import { ISwapRouter } from '@uniswap/v3-periphery/contracts/interfaces/ISwapRouter.sol';
import { IAToken } from '@aave/core-v3/contracts/interfaces/IAToken.sol';
import { IDnGmxJuniorVault } from 'contracts/interfaces/IDnGmxJuniorVault.sol';
import { IVariableDebtToken } from '@aave/core-v3/contracts/interfaces/IVariableDebtToken.sol';

import { IERC20 } from '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import { IERC20Metadata } from '@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol';

import { OwnableUpgradeable } from '@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol';
import { PausableUpgradeable } from '@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol';

interface IDebtToken is IVariableDebtToken {
    function balanceOf(address user) external view returns (uint256);

    function totalSupply() external view returns (uint256);
}

contract LeveragePool is OwnableUpgradeable, PausableUpgradeable {
    using FullMath for uint256;
    using FullMath for uint128;
    using SafeCast for uint256;

    error CallerNotVault();
    error NotEnoughMargin();
    error UsageCapExceeded();
    error InvalidCollateralFactor();
    error InvalidLiquidation(address user);

    struct UserDeposit {
        uint256 round;
        uint128 glpBalance;
        uint128 depositedShares;
    }

    address public usdc;

    uint16 public constant MAX_BPS = 10000;

    IDnGmxSeniorVault internal lpVault;
    IDebtToken internal rUsdc;
    IDnGmxJuniorVault internal dnGmxJuniorVault;
    IGMXBatchingManager internal batchingManager;

    uint96 public lastUpdateTs;
    uint128 public borrowIndex;

    uint32 public borrowRateBps;

    uint16 public initialCfBps;
    uint16 public maintainanceCfBps;

    mapping(address => UserDeposit) public userDeposits;

    function initialize() external initializer {
        __Ownable_init();
        __Pausable_init();

        borrowIndex = 1;
        borrowRateBps = 0;
    }

    function updateBorrowRate() internal {}

    /* solhint-disable not-rely-on-time */
    function _updateIndex() internal {
        uint256 diff = block.timestamp - lastUpdateTs;
        if (rUsdc.scaledTotalSupply() != 0) {
            //TODO: change to compound interest
            borrowIndex = borrowIndex.mulDiv(365 days + diff, 365 days).mulDiv(borrowRateBps, MAX_BPS).toUint128();
            lastUpdateTs = uint96(block.timestamp);
        }
    }

    function _isEnoughMargin(address user) internal view returns (bool) {
        UserDeposit storage userDeposit = userDeposits[user];

        uint256 collateralValue = dnGmxJuniorVault.getMarketValue(
            dnGmxJuniorVault.convertToAssets(userDeposit.depositedShares) + userDeposit.glpBalance
        );
        return collateralValue.mulDiv(maintainanceCfBps, MAX_BPS) < rUsdc.balanceOf(user);
    }

    function _convertGlpStakedToShares(UserDeposit memory userDeposit, uint256 currentRound)
        internal
        view
        returns (UserDeposit memory updatedUserDeposit)
    {
        updatedUserDeposit = userDeposit;
        if (userDeposit.round < currentRound && userDeposit.glpBalance > 0) {
            IGMXBatchingManager.RoundDeposit memory roundDeposit = batchingManager.roundDeposits(
                dnGmxJuniorVault,
                userDeposit.round
            );
            updatedUserDeposit.depositedShares += userDeposit
                .glpBalance
                .mulDiv(roundDeposit.totalShares, roundDeposit.totalGlp)
                .toUint128();
            updatedUserDeposit.glpBalance = 0;
        }
    }

    function getUsdcBorrowed() external view returns (uint256) {
        return rUsdc.totalSupply();
    }

    function depositShare(uint128 shareAmount) external {
        UserDeposit memory userDeposit = userDeposits[msg.sender];
        uint256 currentRound = batchingManager.currentRound(dnGmxJuniorVault);

        userDeposit = _convertGlpStakedToShares(userDeposit, currentRound);

        dnGmxJuniorVault.transferFrom(msg.sender, address(this), shareAmount);

        userDeposits[msg.sender] = UserDeposit(
            currentRound,
            userDeposit.glpBalance,
            userDeposit.depositedShares + shareAmount
        );
    }

    function withdrawShare(uint128 shareAmount) external {
        UserDeposit memory userDeposit = userDeposits[msg.sender];
        uint256 currentRound = batchingManager.currentRound(dnGmxJuniorVault);

        userDeposit = _convertGlpStakedToShares(userDeposit, currentRound);

        userDeposits[msg.sender] = UserDeposit(
            currentRound,
            userDeposit.glpBalance,
            userDeposit.depositedShares - shareAmount
        );

        if (!_isEnoughMargin(msg.sender)) revert NotEnoughMargin();

        batchingManager.claim(
            dnGmxJuniorVault,
            address(this),
            batchingManager.unclaimedShares(dnGmxJuniorVault, address(this))
        );
        dnGmxJuniorVault.transfer(msg.sender, shareAmount);
    }

    function depositShareAndBorrow(uint128 shareAmount, uint128 usdcAmount) external {
        UserDeposit memory userDeposit = userDeposits[msg.sender];
        uint256 currentRound = batchingManager.currentRound(dnGmxJuniorVault);

        // Convert staked glp in previous rounds to shares
        userDeposit = _convertGlpStakedToShares(userDeposit, currentRound);

        // Transfer the shares to be deposited to vault
        dnGmxJuniorVault.transferFrom(msg.sender, address(this), shareAmount);

        // Update indexes and mint the borrow amount of usdc
        _updateIndex();
        rUsdc.mint(msg.sender, msg.sender, usdcAmount, borrowIndex);

        lpVault.borrow(usdcAmount);

        // stake borrowed usdc through batching manager
        uint128 glpStaked = batchingManager
            .depositToken(dnGmxJuniorVault, usdc, usdcAmount, 0, address(this))
            .toUint128();

        userDeposits[msg.sender] = UserDeposit(
            currentRound,
            userDeposit.glpBalance + glpStaked,
            userDeposit.depositedShares + shareAmount
        );

        if (!_isEnoughMargin(msg.sender)) revert NotEnoughMargin();
    }

    function repay(uint256 amount) external {
        //TODO: see if repay needs to done by selling of shares or transfer of usdc
    }

    function liquidate(address user) external onlyOwner {
        if (_isEnoughMargin(user)) revert InvalidLiquidation(user);
        //TODO: add liquidation code
    }
}
