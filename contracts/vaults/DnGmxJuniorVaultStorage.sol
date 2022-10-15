// SPDX-License-Identifier: MIT

pragma solidity ^0.8.9;

import { IERC20 } from '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import { IERC20Metadata } from '@openzeppelin/contracts/interfaces/IERC20Metadata.sol';
import { ISwapRouter } from '@uniswap/v3-periphery/contracts/interfaces/ISwapRouter.sol';
import { IPool } from '@aave/core-v3/contracts/interfaces/IPool.sol';
import { IAToken } from '@aave/core-v3/contracts/interfaces/IAToken.sol';
import { IPriceOracle } from '@aave/core-v3/contracts/interfaces/IPriceOracle.sol';
import { IVariableDebtToken } from '@aave/core-v3/contracts/interfaces/IVariableDebtToken.sol';
import { IPoolAddressesProvider } from '@aave/core-v3/contracts/interfaces/IPoolAddressesProvider.sol';
import { IRewardsController } from '@aave/periphery-v3/contracts/rewards/interfaces/IRewardsController.sol';
import { IVault } from '../interfaces/gmx/IVault.sol';
import { IGlpManager } from '../interfaces/gmx/IGlpManager.sol';
import { IRewardRouterV2 } from '../interfaces/gmx/IRewardRouterV2.sol';
import { IDnGmxSeniorVault } from '../interfaces/IDnGmxSeniorVault.sol';
import { IBalancerVault } from '../interfaces/IBalancerVault.sol';
import { IDnGmxBatchingManager } from '../interfaces/IDnGmxBatchingManager.sol';
import { IRewardTracker } from '../interfaces/gmx/IRewardTracker.sol';

interface IDebtToken is IVariableDebtToken {
    function balanceOf(address user) external view returns (uint256);
}

contract DnGmxJuniorVaultStorage {
    ///@dev constants

    uint16 internal constant MAX_BPS = 10_000;

    uint256 internal constant USDG_DECIMALS = 18;
    uint256 internal constant WETH_DECIMALS = 18;

    uint256 internal constant PRICE_PRECISION = 1e30;
    uint256 internal constant VARIABLE_INTEREST_MODE = 2;

    ///@dev common storage

    /* solhint-disable var-name-mixedcase */
    uint256 internal FEE = 1000;

    address internal keeper;
    IDnGmxSeniorVault internal dnGmxSeniorVault;
    address internal feeRecipient;
    uint256 internal withdrawFeeBps;
    uint256 internal protocolFee;
    uint256 internal protocolEsGmx;
    uint256 internal unhedgedGlpInUsdc;
    uint256 internal seniorVaultWethRewards;
    uint256 internal wethConversionThreshold;
    uint256 internal hedgeUsdcAmountThreshold;
    uint256 internal hfThreshold;

    uint256 internal depositCap;
    int256 internal dnUsdcDeposited;

    bool internal _hasFlashloaned;

    uint64 internal lastRebalanceTS;
    uint32 internal rebalanceTimeThreshold;
    uint16 internal rebalanceDeltaThreshold;

    ///@dev storage for hedge strategy

    IPool internal pool;
    IPriceOracle internal oracle;
    IPoolAddressesProvider internal poolAddressProvider;

    IAToken internal aUsdc;
    IDebtToken internal vWbtc;
    IDebtToken internal vWeth;

    ISwapRouter public swapRouter;
    IBalancerVault internal balancerVault;

    uint256 internal targetHealthFactor;
    IRewardsController internal aaveRewardsController;

    ///@dev storage for yield strategy

    uint16 internal slippageThresholdGmx;
    uint16 internal slippageThresholdSwap;
    uint208 internal usdcConversionThreshold;

    IERC20 internal fsGlp;
    IRewardTracker internal sGmx;

    IERC20Metadata internal glp;
    IERC20Metadata internal usdc;
    IERC20Metadata internal usdt;
    IERC20Metadata internal weth;
    IERC20Metadata internal wbtc;

    IVault internal gmxVault;
    IGlpManager internal glpManager;
    IRewardRouterV2 internal rewardRouter;
    IDnGmxBatchingManager internal batchingManager;

    /// @dev structs used to initialize

    struct Tokens {
        IERC20Metadata weth;
        IERC20Metadata wbtc;
        IERC20Metadata sGlp;
        IERC20Metadata usdc;
        IERC20Metadata usdt;
    }
}
