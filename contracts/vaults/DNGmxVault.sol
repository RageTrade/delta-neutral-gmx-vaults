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
import { ISGLPExtended } from 'contracts/interfaces/gmx/ISGLPExtended.sol';
import { IRewardRouterV2 } from 'contracts/interfaces/gmx/IRewardRouterV2.sol';
import { IGlpStakingManager } from 'contracts/interfaces/gmx/IGlpStakingManager.sol';
import { IClearingHouse } from '@ragetrade/core/contracts/interfaces/IClearingHouse.sol';

import { IERC20 } from '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import { IERC20Metadata } from '@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol';

import { OwnableUpgradeable } from '@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol';
import { PausableUpgradeable } from '@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol';

contract DNGmxVault is ERC4626Upgradeable, OwnableUpgradeable, PausableUpgradeable, DNGmxVaultStorage {
    using FullMath for uint256;
    using SafeCast for uint256;

    using SignedMath for int256;
    using SignedFullMath for int256;

    using AddressHelper for address;
    using ClearingHouseExtsload for IClearingHouse;

    error InvalidRebalance();
    error DepositCap(uint256 depositCap, uint256 depositAmount);
    error OnlyKeeperAllowed(address msgSender, address authorisedKeeperAddress);

    event Rebalanced();
    event AllowancesGranted();

    event KeeperUpdated(address _newKeeper);
    event DepositCapUpdated(uint256 _newDepositCap);
    event MarketMakerVaultUpdated(address _mmVault);
    event StakingManagerUpdated(address _stakingManager);

    event YieldParamsUpdated(uint16 indexed usdcReedemSlippage, uint240 indexed usdcConversionThreshold);
    event RebalanceParamsUpdated(uint32 indexed rebalanceTimeThreshold, uint16 indexed rebalanceDeltaThreshold);

    modifier onlyKeeper() {
        if (msg.sender != keeper) revert OnlyKeeperAllowed(msg.sender, keeper);
        _;
    }

    function initialize(
        string calldata _name,
        string calldata _symbol,
        RageUIDs calldata _rageUIDs,
        TokenAddresses calldata _tokenAddrs,
        ExternalAddresses calldata _extAddrs
    ) external initializer {
        __Ownable_init();
        __Pausable_init();
        __ERC4626Upgradeable_init(IERC20Metadata(address(_tokenAddrs.sGlp)), _name, _symbol);

        ethPoolId = _rageUIDs.ethPoolId;
        btcPoolId = _rageUIDs.btcPoolId;
        rageAccountNo = _rageUIDs.rageAccountNo;
        collateralId = address(_extAddrs.rageCollateralToken).truncate();

        lens = _extAddrs.lens;
        rageClearingHouse = _extAddrs.rageClearingHouse;
        rageCollateralToken = _extAddrs.rageCollateralToken;
        rageSettlementToken = _extAddrs.rageSettlementToken;

        ethVPool = rageClearingHouse.getVPool(ethPoolId);
        btcVPool = rageClearingHouse.getVPool(btcPoolId);

        weth = _tokenAddrs.weth;
        wbtc = _tokenAddrs.wbtc;

        rewardRouter = _extAddrs.rewardRouter;

        glp = IERC20(ISGLPExtended(address(asset)).glp());
        fsGlp = IERC20(ISGLPExtended(address(asset)).stakedGlpTracker());
        glpManager = IGlpManager(ISGLPExtended(address(asset)).glpManager());

        gmxVault = IVault(glpManager.vault());
    }

    function grantAllowances() external onlyOwner {
        asset.approve(address(glpManager), type(uint256).max);
        asset.approve(address(stakingManager), type(uint256).max);

        rageSettlementToken.approve(address(glpManager), type(uint256).max);
        rageSettlementToken.approve(address(stakingManager), type(uint256).max);

        rageCollateralToken.approve(address(rageClearingHouse), type(uint256).max);
        rageSettlementToken.approve(address(rageClearingHouse), type(uint256).max);

        emit AllowancesGranted();
    }

    function setKeeper(address _newKeeper) external onlyOwner {
        keeper = _newKeeper;
        emit KeeperUpdated(_newKeeper);
    }

    function setDepositCap(uint256 _newDepositCap) external onlyOwner {
        depositCap = _newDepositCap;
        emit DepositCapUpdated(_newDepositCap);
    }

    function setMarketMakerVault(address _mmVault) external onlyOwner {
        marketMakerVault = _mmVault;
        emit MarketMakerVaultUpdated(_mmVault);
    }

    function setStakingManager(address _stakingManager) external onlyOwner {
        stakingManager = IGlpStakingManager(_stakingManager);
        emit StakingManagerUpdated(_stakingManager);
    }

    function setYieldParams(YieldStrategyParams calldata _ysParams) external onlyOwner {
        usdcReedemSlippage = _ysParams.usdcReedemSlippage;
        usdcConversionThreshold = _ysParams.usdcConversionThreshold;
        emit YieldParamsUpdated(_ysParams.usdcReedemSlippage, _ysParams.usdcConversionThreshold);
    }

    function setRebalanceParams(RebalanceStrategyParams calldata _rsParams) external onlyOwner {
        rebalanceTimeThreshold = _rsParams.rebalanceTimeThreshold;
        rebalanceDeltaThreshold = _rsParams.rebalanceDeltaThreshold;
        emit RebalanceParamsUpdated(_rsParams.rebalanceTimeThreshold, _rsParams.rebalanceDeltaThreshold);
    }

    function rebalance() external onlyKeeper {
        if (!isValidRebalance()) revert InvalidRebalance();

        stakingManager.harvestFees();

        {
            uint256 collateralDeposited = lens.getAccountCollateralBalance(rageAccountNo, collateralId);
            int256 vaultMarketValue = getVaultMarketValue();
            _settleCollateral(collateralDeposited, vaultMarketValue);
        }

        _rebalancePosition();

        emit Rebalanced();
    }

    function totalAssets() public view override returns (uint256) {
        return stakingManager.maxRedeem(address(this));
    }

    function getPriceX128() public view returns (uint256 priceX128) {
        uint256 aum = glpManager.getAum(false);
        uint256 totalSupply = glp.totalSupply();

        return aum.mulDiv(FixedPoint128.Q128, totalSupply * 1e24);
    }

    function getMarketValue(uint256 assetAmount) public view returns (uint256 marketValue) {
        marketValue = assetAmount.mulDiv(getPriceX128(), FixedPoint128.Q128);
    }

    function getVaultMarketValue() public view returns (int256 vaultMarketValue) {
        vaultMarketValue = rageClearingHouse.getAccountNetProfit(rageAccountNo);
        vaultMarketValue += (getMarketValue(totalAssets())).toInt256();
    }

    function isValidRebalance() public view returns (bool) {
        return _isValidRebalanceTime() || _isValidRebalanceDeviation();
    }

    function _isValidRebalanceTime() internal view returns (bool) {
        return (block.timestamp - lastRebalanceTS) > rebalanceTimeThreshold;
    }

    function _isValidRebalanceDeviation() internal view returns (bool) {
        (, int256 netEthTraderPosition, ) = lens.getAccountTokenPositionInfo(rageAccountNo, ethPoolId);
        (, int256 netBtcTraderPosition, ) = lens.getAccountTokenPositionInfo(rageAccountNo, btcPoolId);

        (int256 optimalEthPosition, int256 optimalBtcPosition) = _getOptimalPositions();

        return
            !(_isWithinAllowedDelta(optimalEthPosition, netEthTraderPosition) &&
                _isWithinAllowedDelta(optimalBtcPosition, netBtcTraderPosition));
    }

    function _rebalancePosition() internal {
        //check the delta between optimal position and actual position
        //take that position using swap
    }

    function _getOptimalPositions() internal view returns (int256 optimalEthPosition, int256 optimalBtcPosition) {
        uint256 glpDeposited = totalAssets();

        uint256 ethReservesOfGlp = _getTokenReservesInGlp(address(weth));
        uint256 btcReservesOfGlp = _getTokenReservesInGlp(address(wbtc));

        uint256 glpTotalSupply = asset.totalSupply();

        optimalEthPosition = -ethReservesOfGlp.mulDiv(glpDeposited, glpTotalSupply).toInt256();
        optimalBtcPosition = -btcReservesOfGlp.mulDiv(glpDeposited, glpTotalSupply).toInt256();
    }

    function _getTokenReservesInGlp(address token) internal view returns (uint256) {
        uint256 poolAmount = gmxVault.poolAmounts(token);
        uint256 reservedAmount = gmxVault.reservedAmounts(token);

        return (poolAmount - reservedAmount);
    }

    function _isWithinAllowedDelta(int256 _optimalPosition, int256 _currentPosition) internal view returns (bool) {
        return
            (_optimalPosition - _currentPosition).absUint() <
            uint256(rebalanceDeltaThreshold).mulDiv(_optimalPosition.absUint(), MAX_BPS);
    }

    function beforeWithdraw(
        uint256 assets,
        uint256 shares,
        address receiver
    ) internal override {
        // TODO: is anything required ? if not, delete func.
    }

    function afterDeposit(
        uint256 assets,
        uint256 shares,
        address receiver
    ) internal override {
        // TODO: add deposit cap in after deposit hook by querying from staking manager
    }

    /// @notice settles collateral for the vault
    /// @dev to be called after settle profits only (since vaultMarketValue if after settlement of profits)
    /// @param collateralDeposited The amount of rage collateral token deposited to rage core
    /// @param vaultMarketValue The market value of the vault in USDC
    function _settleCollateral(uint256 collateralDeposited, int256 vaultMarketValue) internal {
        // Settle net change in market value and deposit/withdraw collateral tokens
        // Vault market value is just the collateral value since profit has been settled
        int256 vaultMarketValueDiff;
        if (collateralDeposited > 0) {
            // assert(address(stablecoinDeposit.collateral) == address(rageCollateralToken));
            vaultMarketValueDiff =
                vaultMarketValue -
                collateralDeposited.toInt256().mulDiv(
                    10**rageSettlementToken.decimals(),
                    10**rageCollateralToken.decimals()
                );
        } else {
            vaultMarketValueDiff = vaultMarketValue;
        }

        int256 normalizedVaultMarketValueDiff = vaultMarketValueDiff.mulDiv(
            10**rageCollateralToken.decimals(),
            10**rageSettlementToken.decimals()
        );
        uint256 normalizedVaultMarketValueDiffAbs = normalizedVaultMarketValueDiff.absUint();

        if (normalizedVaultMarketValueDiff > 0) {
            // Mint collateral coins and deposit into rage trade
            rageCollateralToken.mint(address(this), normalizedVaultMarketValueDiffAbs);
            rageClearingHouse.updateMargin(rageAccountNo, collateralId, int256(normalizedVaultMarketValueDiffAbs));
        } else if (normalizedVaultMarketValueDiff < 0) {
            // Withdraw rage trade deposits
            rageClearingHouse.updateMargin(rageAccountNo, collateralId, -int256(normalizedVaultMarketValueDiffAbs));
            rageCollateralToken.burn(normalizedVaultMarketValueDiffAbs);
        }
    }

    /// @notice withdraws LP tokens from gauge, sells LP token for rageSettlementToken
    /// @param usdcAmountDesired amount of USDC desired
    function _convertAssetToSettlementToken(uint256 usdcAmountDesired) internal returns (uint256 usdcAmount) {
        /// @dev if usdcAmountDesired < 10, then there is precision issue in gmx contracts while redeeming for usdg
        if (usdcAmountDesired < usdcConversionThreshold) return 0;
        uint256 glpAmountDesired = usdcAmountDesired.mulDiv(1 << 128, getPriceX128());
        // USDG has 18 decimals and usdc has 6 decimals => 18-6 = 12
        stakingManager.withdraw(glpAmountDesired, address(this), address(this));
        rewardRouter.unstakeAndRedeemGlp(
            address(rageSettlementToken),
            glpAmountDesired, // glp amount
            usdcAmountDesired.mulDiv(usdcReedemSlippage, MAX_BPS), // usdc
            address(this)
        );

        usdcAmount = rageSettlementToken.balanceOf(address(this));
    }

    /// @notice sells rageSettlementToken for LP tokens and then stakes LP tokens
    /// @param amount amount of rageSettlementToken
    function _convertSettlementTokenToAsset(uint256 amount) internal {
        //USDG has 18 decimals and usdc has 6 decimals => 18-6 = 12
        stakingManager.depositToken(address(rageSettlementToken), amount);
    }
}
