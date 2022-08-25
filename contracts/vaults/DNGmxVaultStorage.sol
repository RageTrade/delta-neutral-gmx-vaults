// SPDX-License-Identifier: MIT

pragma solidity ^0.8.9;

import { IERC20 } from '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import { IERC20Metadata } from '@openzeppelin/contracts/interfaces/IERC20Metadata.sol';

import { IVault } from 'contracts/interfaces/gmx/IVault.sol';
import { IGlpManager } from 'contracts/interfaces/gmx/IGlpManager.sol';
import { IRewardRouterV2 } from 'contracts/interfaces/gmx/IRewardRouterV2.sol';
import { IGlpStakingManager } from 'contracts/interfaces/gmx/IGlpStakingManager.sol';

import { IClearingHouse } from '@ragetrade/core/contracts/interfaces/IClearingHouse.sol';
import { ClearingHouseLens } from '@ragetrade/core/contracts/lens/ClearingHouseLens.sol';
import { IUniswapV3Pool } from '@ragetrade/core/contracts/libraries/UniswapV3PoolHelper.sol';

import { ERC20PresetMinterPauser as CollateralToken } from '@openzeppelin/contracts/token/ERC20/presets/ERC20PresetMinterPauser.sol';

contract DNGmxVaultStorage {
    ///@dev constants

    uint16 public constant MAX_BPS = 10_000;

    ///@dev common storage

    uint64 public lastRebalanceTS;
    uint32 public rebalanceTimeThreshold;
    uint16 public rebalanceDeltaThreshold;

    uint256 public depositCap;

    address public keeper;
    address public marketMakerVault;

    IClearingHouse public rageClearingHouse;

    ClearingHouseLens internal lens;
    IERC20Metadata internal rageSettlementToken;
    CollateralToken internal rageCollateralToken;

    ///@dev storage for range strategy

    uint32 public ethPoolId;
    uint32 public btcPoolId;

    uint256 public rageAccountNo;

    uint32 internal collateralId;

    IUniswapV3Pool public ethVPool;
    IUniswapV3Pool public btcVPool;

    ///@dev storage for yield strategy

    uint16 public usdcReedemSlippage;
    uint240 public usdcConversionThreshold;

    IERC20 internal glp;
    IERC20 internal fsGlp;

    IERC20 internal weth;
    IERC20 internal wbtc;

    IVault internal gmxVault;
    IGlpManager internal glpManager;
    IRewardRouterV2 internal rewardRouter;
    IGlpStakingManager internal stakingManager;

    /// @dev structs used to initialize

    struct TokenAddresses {
        IERC20 weth;
        IERC20 wbtc;
        IERC20 sGlp;
    }

    struct RageUIDs {
        uint32 ethPoolId;
        uint32 btcPoolId;
        uint256 rageAccountNo;
    }

    struct ExternalAddresses {
        ClearingHouseLens lens;
        IRewardRouterV2 rewardRouter;
        IClearingHouse rageClearingHouse;
        IERC20Metadata rageSettlementToken;
        CollateralToken rageCollateralToken;
    }

    struct YieldStrategyParams {
        uint16 usdcReedemSlippage;
        uint240 usdcConversionThreshold;
    }

    struct RebalanceStrategyParams {
        uint32 rebalanceTimeThreshold;
        uint16 rebalanceDeltaThreshold;
    }
}
