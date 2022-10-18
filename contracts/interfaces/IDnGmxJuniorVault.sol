// SPDX-License-Identifier: MIT

pragma solidity ^0.8.9;

import { IERC4626 } from './IERC4626.sol';
import { IBorrower } from './IBorrower.sol';

interface IDnGmxJuniorVault is IERC4626, IBorrower {
    error InvalidRebalance();
    error DepositCapExceeded();
    error OnlyKeeperAllowed(address msgSender, address authorisedKeeperAddress);

    error NotDnGmxSeniorVault();
    error NotBalancerVault();

    error ArraysLengthMismatch();
    error FlashloanNotInitiated();

    error InvalidFeeRecipient();
    error InvalidFeeBps();

    event Rebalanced();
    event AllowancesGranted();

    event DnGmxSeniorVaultUpdated(address _dnGmxSeniorVault);
    event KeeperUpdated(address _newKeeper);
    event FeeParamsUpdated(uint256 feeBps, address _newFeeRecipient);
    event WithdrawFeeUpdated(uint256 _withdrawFeeBps);
    event FeesWithdrawn(uint256 feeAmount);
    event RewardsHarvested(
        uint256 wethHarvested,
        uint256 esGmxStaked,
        uint256 juniorVaultWeth,
        uint256 seniorVaultWeth,
        uint256 juniorVaultGlp,
        uint256 seniorVaultAUsdc
    );
    event DepositCapUpdated(uint256 _newDepositCap);
    event BatchingManagerUpdated(address _batchingManager);

    event YieldParamsUpdated(
        uint16 slippageThresholdGmx,
        uint240 usdcConversionThreshold,
        uint256 wethConversionThreshold,
        uint256 hedgeUsdcAmountThreshold,
        uint256 hfThreshold
    );
    event RebalanceParamsUpdated(uint32 indexed rebalanceTimeThreshold, uint16 indexed rebalanceDeltaThreshold);

    function getMarketValue(uint256 assetAmount) external view returns (uint256 marketValue);

    function harvestFees() external;

    function getPriceX128() external view returns (uint256);

    function getVaultMarketValue() external view returns (int256);

    function depositCap() external view returns (uint256);
}
