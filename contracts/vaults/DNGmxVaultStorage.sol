// SPDX-License-Identifier: MIT

pragma solidity ^0.8.9;

import { IERC20 } from '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import { IERC20Metadata } from '@openzeppelin/contracts/interfaces/IERC20Metadata.sol';

import { IVault } from 'contracts/interfaces/gmx/IVault.sol';
import { IGlpManager } from 'contracts/interfaces/gmx/IGlpManager.sol';
import { IRewardRouterV2 } from 'contracts/interfaces/gmx/IRewardRouterV2.sol';
import { IGlpStakingManager } from 'contracts/interfaces/gmx/IGlpStakingManager.sol';

import { ILPVault } from 'contracts/interfaces/ILPVault.sol';
import { ISwapRouter } from '@uniswap/v3-periphery/contracts/interfaces/ISwapRouter.sol';

import { IPool } from '@aave/core-v3/contracts/interfaces/IPool.sol';
import { IPoolAddressesProvider } from '@aave/core-v3/contracts/interfaces/IPoolAddressesProvider.sol';

import { ERC20PresetMinterPauser as CollateralToken } from '@openzeppelin/contracts/token/ERC20/presets/ERC20PresetMinterPauser.sol';

contract DNGmxVaultStorage {
    ///@dev constants

    uint16 public constant MAX_BPS = 10_000;
    uint256 public constant VARIABLE_INTEREST_MODE = 2;

    ///@dev common storage

    uint64 public lastRebalanceTS;
    uint32 public rebalanceTimeThreshold;
    uint16 public rebalanceDeltaThreshold;

    uint256 public depositCap;
    uint256 public dnUsdcDeposited;

    address public keeper;
    ILPVault public lpVault;

    ///@dev storage for hedge strategy

    IPool internal pool;
    IPoolAddressesProvider internal poolAddressProvider;

    ISwapRouter internal swapRouter;

    ///@dev storage for yield strategy

    uint16 public usdcReedemSlippage;
    uint240 public usdcConversionThreshold;

    IERC20 internal glp;
    IERC20 internal fsGlp;

    IERC20 internal usdc;
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
        IERC20 usdc;
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
