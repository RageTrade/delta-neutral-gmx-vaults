// SPDX-License-Identifier: MIT

pragma solidity ^0.8.9;

import { SafeCast } from 'contracts/libraries/SafeCast.sol';

import { ERC4626Upgradeable } from 'contracts/ERC4626/ERC4626Upgradeable.sol';

import { DNGmxVaultStorage } from 'contracts/vaults/DNGmxVaultStorage.sol';

import { SignedMath } from '@ragetrade/core/contracts/libraries/SignedMath.sol';
import { SignedFullMath } from '@ragetrade/core/contracts/libraries/SignedFullMath.sol';

import { FullMath } from '@uniswap/v3-core-0.8-support/contracts/libraries/FullMath.sol';
import { FixedPoint128 } from '@uniswap/v3-core-0.8-support/contracts/libraries/FixedPoint128.sol';

import { AddressHelper } from '@ragetrade/core/contracts/libraries/AddressHelper.sol';
import { ClearingHouseExtsload } from '@ragetrade/core/contracts/extsloads/ClearingHouseExtsload.sol';

import { IVault } from 'contracts/interfaces/gmx/IVault.sol';
import { IGlpManager } from 'contracts/interfaces/gmx/IGlpManager.sol';
import { IGMXBatchingManager } from 'contracts/interfaces/gmx/IGMXBatchingManager.sol';

import { ISGLPExtended } from 'contracts/interfaces/gmx/ISGLPExtended.sol';
import { IRewardRouterV2 } from 'contracts/interfaces/gmx/IRewardRouterV2.sol';
import { IGlpStakingManager } from 'contracts/interfaces/gmx/IGlpStakingManager.sol';
import { ILPVault } from 'contracts/interfaces/ILPVault.sol';
import { IClearingHouse } from '@ragetrade/core/contracts/interfaces/IClearingHouse.sol';
import { ISwapRouter } from '@uniswap/v3-periphery/contracts/interfaces/ISwapRouter.sol';
import { IAToken } from '@aave/core-v3/contracts/interfaces/IAToken.sol';
import { IDNGmxVault } from 'contracts/interfaces/IDNGmxVault.sol';
import { IVariableDebtToken } from '@aave/core-v3/contracts/interfaces/IVariableDebtToken.sol';

import { IERC20 } from '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import { IERC20Metadata } from '@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol';

import { OwnableUpgradeable } from '@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol';
import { PausableUpgradeable } from '@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol';

interface IDebtToken is IVariableDebtToken {
    function balanceOf(address user) external view returns (uint256);

    function totalSupply() external view returns (uint256);
}

contract LeverageVault is OwnableUpgradeable, PausableUpgradeable {
    using FullMath for uint256;
    using FullMath for uint128;
    using SafeCast for uint256;

    error UsageCapExceeded();
    error CallerNotVault();
    error InvalidCollateralFactor();
    error NotEnoughMargin();

    struct UserDeposit {
        uint256 round;
        uint128 glpBalance;
        uint128 depositedShares;
    }

    IDebtToken internal rUsdc;
    IDNGmxVault internal dnGmxVault;
    IGMXBatchingManager internal batchingManager;
    ILPVault internal lpVault;
    address usdc;

    uint128 borrowIndex;
    uint32 borrowRateBps;
    uint96 lastUpdateTs;

    uint16 initialCfBps;
    uint16 maintainanceCfBps;
    uint16 constant MAX_BPS = 10000;

    mapping(address => UserDeposit) userDeposits;

    function initialize() external initializer {
        __Ownable_init();
        __Pausable_init();
        __LeverageVault_init();
    }

    function __LeverageVault_init() internal onlyInitializing {
        borrowIndex = 1;
        borrowRateBps = 0;
    }

    function updateBorrowRate() internal {}

    function _updateIndex() internal {
        uint256 diff = block.timestamp - lastUpdateTs;
        if (rUsdc.scaledTotalSupply() != 0) {
            //TODO: change to compound interest
            borrowIndex = borrowIndex.mulDiv(365 days + diff, 365 days).mulDiv(borrowRateBps, MAX_BPS).toUint128();
            lastUpdateTs = uint96(block.timestamp);
        }
    }

    function _checkMargin() internal view {
        UserDeposit storage userDeposit = userDeposits[msg.sender];
        uint256 collateralValue = dnGmxVault.getMarketValue(
            dnGmxVault.convertToAssets(userDeposit.depositedShares) + userDeposit.glpBalance
        );
        if (collateralValue.mulDiv(maintainanceCfBps, MAX_BPS) < rUsdc.balanceOf(msg.sender)) revert NotEnoughMargin();
    }

    function getUsdcBorrowed() external view returns (uint256) {
        return rUsdc.totalSupply();
    }

    function depositShare() external {}

    function depositShareAndBorrow(uint128 shareAmount, uint256 usdcAmount) external {
        UserDeposit storage userDeposit = userDeposits[msg.sender];
        uint256 userDepositRound = userDeposit.round;
        uint256 userGlpBalance = userDeposit.glpBalance;
        uint256 currentRound = batchingManager.currentRound(dnGmxVault);

        if (userDepositRound < currentRound && userGlpBalance > 0) {
            IGMXBatchingManager.RoundDeposit memory roundDeposit = batchingManager.roundDeposits(
                dnGmxVault,
                userDepositRound
            );
            userDeposit.depositedShares += userDeposit
                .glpBalance
                .mulDiv(roundDeposit.totalShares, roundDeposit.totalGlp)
                .toUint128();
            userGlpBalance = 0;
        }

        dnGmxVault.transferFrom(msg.sender, address(this), shareAmount);

        _updateIndex();
        rUsdc.mint(msg.sender, msg.sender, usdcAmount, borrowIndex);

        lpVault.borrow(usdcAmount);

        uint256 glpStaked = batchingManager.depositToken(dnGmxVault, usdc, usdcAmount, 0, address(this));

        userDeposit.glpBalance = (userGlpBalance + glpStaked).toUint128();
        userDeposit.depositedShares += shareAmount;
        userDeposit.round = currentRound;

        _checkMargin();
    }

    function repay(uint256 amount) external {}

    function liquidate() external onlyOwner {}
}
