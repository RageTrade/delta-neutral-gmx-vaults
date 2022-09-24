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
import { IVault } from '../interfaces/gmx/IVault.sol';
import { IGlpManager } from '../interfaces/gmx/IGlpManager.sol';
import { IRewardRouterV2 } from '../interfaces/gmx/IRewardRouterV2.sol';
import { IGMXBatchingManager } from '../interfaces/gmx/IGMXBatchingManager.sol';
import { IDnGmxSeniorVault } from '../interfaces/IDnGmxSeniorVault.sol';
import { IBalancerVault } from '../interfaces/IBalancerVault.sol';

interface IDebtToken is IVariableDebtToken {
    function balanceOf(address user) external view returns (uint256);
}

contract DnGmxJuniorVaultStorage {
    ///@dev constants

    uint16 public constant MAX_BPS = 10_000;
    uint256 public constant PRICE_PRECISION = 10e30;
    uint256 public constant VARIABLE_INTEREST_MODE = 2;

    /* solhint-disable var-name-mixedcase */
    uint256 public FEE = 1000;

    uint256 public constant USDG_DECIMALS = 18;
    uint256 public constant WETH_DECIMALS = 18;

    ///@dev common storage

    address public keeper;
    IDnGmxSeniorVault public dnGmxSeniorVault;
    address public feeRecipient;
    uint256 public withdrawFeeBps;
    uint256 public protocolFee;
    uint256 public seniorVaultWethRewards;
    uint256 public seniorVaultWethConversionThreshold;
    uint256 public wethThreshold;
    uint256 public slippageThreshold;

    uint256 public depositCap;
    int256 internal dnUsdcDeposited;

    bool internal _hasFlashloaned;

    uint64 public lastRebalanceTS;
    uint32 public rebalanceTimeThreshold;
    uint16 public rebalanceDeltaThreshold;

    ///@dev storage for hedge strategy

    IPool internal pool;
    IPriceOracle internal oracle;
    IPoolAddressesProvider internal poolAddressProvider;

    IAToken internal aUsdc;
    IDebtToken internal vWbtc;
    IDebtToken internal vWeth;

    ISwapRouter internal swapRouter;
    IBalancerVault internal balancerVault;

    uint256 internal targetHealthFactor;

    ///@dev storage for yield strategy

    uint16 public usdcRedeemSlippage;
    uint240 public usdcConversionThreshold;

    IERC20Metadata internal glp;
    IERC20Metadata internal usdc;
    IERC20Metadata internal weth;
    IERC20Metadata internal wbtc;
    IERC20 internal fsGlp;

    IVault internal gmxVault;
    IGlpManager internal glpManager;
    IRewardRouterV2 internal rewardRouter;
    IGMXBatchingManager internal batchingManager;

    /// @dev structs used to initialize

    struct Tokens {
        IERC20Metadata weth;
        IERC20Metadata wbtc;
        IERC20Metadata sGlp;
        IERC20Metadata usdc;
    }

    struct YieldStrategyParams {
        uint16 usdcRedeemSlippage;
        uint240 usdcConversionThreshold;
    }

    struct HedgeStrategyParams {
        IBalancerVault vault;
        ISwapRouter swapRouter;
        uint256 targetHealthFactor;
    }

    struct RebalanceStrategyParams {
        uint32 rebalanceTimeThreshold;
        uint16 rebalanceDeltaThreshold;
    }
}
