// SPDX-License-Identifier: MIT

pragma solidity ^0.8.9;

import { IRewardsController } from '@aave/periphery-v3/contracts/rewards/interfaces/IRewardsController.sol';
import { IPoolAddressesProvider } from '@aave/core-v3/contracts/interfaces/IPoolAddressesProvider.sol';
import { IPool } from '@aave/core-v3/contracts/interfaces/IPool.sol';
import { IPriceOracle } from '@aave/core-v3/contracts/interfaces/IPriceOracle.sol';
import { ISwapRouter } from '@uniswap/v3-periphery/contracts/interfaces/ISwapRouter.sol';
import { IERC4626 } from './IERC4626.sol';
import { IBorrower } from './IBorrower.sol';
import { IBalancerVault } from './balancer/IBalancerVault.sol';
import { IDnGmxTraderHedgeStrategy } from './IDnGmxTraderHedgeStrategy.sol';

interface IDnGmxJuniorVault is IERC4626, IBorrower {
    error InvalidWithdrawFeeBps();
    error InvalidSlippageThresholdSwapBtc();
    error InvalidSlippageThresholdSwapEth();
    error InvalidSlippageThresholdGmx();
    error InvalidRebalanceTimeThreshold();
    error InvalidRebalanceDeltaThresholdBps();
    error InvalidRebalanceHfThresholdBps();
    error InvalidTargetHealthFactor();

    error InvalidRebalance();
    error DepositCapExceeded();
    error OnlyKeeperAllowed(address msgSender, address authorisedKeeperAddress);
    error OnlyTraderHedgeStrategyAllowed(address msgSender, address authorisedKeeperAddress);
    error NotDnGmxSeniorVault();
    error NotBalancerVault();

    error ArraysLengthMismatch();
    error FlashloanNotInitiated();

    error InvalidFeeRecipient();
    error InvalidFeeBps();

    error InvalidTraderOIHedges(int128 btcTraderOIHedge, int128 ethTraderOIHedge);

    event Rebalanced();
    event AllowancesGranted();

    event DnGmxSeniorVaultUpdated(address _dnGmxSeniorVault);
    event KeeperUpdated(address _newKeeper);
    event FeeParamsUpdated(uint256 feeBps, address _newFeeRecipient);
    event WithdrawFeeUpdated(uint256 _withdrawFeeBps);
    event FeesWithdrawn(uint256 feeAmount);

    event DepositCapUpdated(uint256 _newDepositCap);

    event AdminParamsUpdated(
        address newKeeper,
        address dnGmxSeniorVault,
        uint256 newDepositCap,
        address batchingManager,
        uint16 withdrawFeeBps
    );
    event ThresholdsUpdated(
        uint16 slippageThresholdSwapBtcBps,
        uint16 slippageThresholdSwapEthBps,
        uint16 slippageThresholdGmxBps,
        uint128 usdcConversionThreshold,
        uint128 wethConversionThreshold,
        uint128 hedgeUsdcAmountThreshold,
        uint128 partialBtcHedgeUsdcAmountThreshold,
        uint128 partialEthHedgeUsdcAmountThreshold
    );

    event ParamsV1Updated(
        uint128 rebalanceProfitUsdcAmountThreshold,
        IDnGmxTraderHedgeStrategy dnGmxTraderHedgeStrategy
    );
    event RebalanceParamsUpdated(
        uint32 rebalanceTimeThreshold,
        uint16 rebalanceDeltaThresholdBps,
        uint16 rebalanceHfThresholdBps
    );

    event HedgeParamsUpdated(
        IBalancerVault vault,
        ISwapRouter swapRouter,
        uint256 targetHealthFactor,
        IRewardsController aaveRewardsController,
        IPool pool,
        IPriceOracle oracle
    );

    event EsGmxVested(uint256 amount);

    event EsGmxStaked(uint256 amount);

    event GmxClaimed(uint256 amount);

    event TraderOIHedgesUpdated(int256 btcTraderOIHedge, int256 ethTraderOIHedge);

    function harvestFees() external;

    function depositCap() external view returns (uint256);

    function getPriceX128() external view returns (uint256);

    function getVaultMarketValue() external view returns (int256);

    function getMarketValue(uint256 assetAmount) external view returns (uint256 marketValue);
}
