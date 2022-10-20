// SPDX-License-Identifier: MIT

pragma solidity ^0.8.9;

import { SafeCast } from '../libraries/SafeCast.sol';
import { FeeSplitStrategy } from '../libraries/FeeSplitStrategy.sol';
import { DnGmxJuniorVaultManager } from '../libraries/DnGmxJuniorVaultManager.sol';
import { FixedPointMathLib } from '@rari-capital/solmate/src/utils/FixedPointMathLib.sol';

import { IVault } from '../interfaces/gmx/IVault.sol';
import { IVester } from '../interfaces/gmx/IVester.sol';
import { IGlpManager } from '../interfaces/gmx/IGlpManager.sol';
import { ISGLPExtended } from '../interfaces/gmx/ISGLPExtended.sol';
import { IRewardTracker } from '../interfaces/gmx/IRewardTracker.sol';
import { IRewardRouterV2 } from '../interfaces/gmx/IRewardRouterV2.sol';

import { IDebtToken } from '../interfaces/IDebtToken.sol';
import { IPool } from '@aave/core-v3/contracts/interfaces/IPool.sol';
import { IAToken } from '@aave/core-v3/contracts/interfaces/IAToken.sol';
import { IPriceOracle } from '@aave/core-v3/contracts/interfaces/IPriceOracle.sol';
import { WadRayMath } from '@aave/core-v3/contracts/protocol/libraries/math/WadRayMath.sol';
import { IPoolAddressesProvider } from '@aave/core-v3/contracts/interfaces/IPoolAddressesProvider.sol';
import { IRewardsController } from '@aave/periphery-v3/contracts/rewards/interfaces/IRewardsController.sol';

import { IBalancerVault } from '../interfaces/IBalancerVault.sol';

import { ERC4626Upgradeable } from '../ERC4626/ERC4626Upgradeable.sol';

import { IDnGmxSeniorVault } from '../interfaces/IDnGmxSeniorVault.sol';
import { IDnGmxBatchingManager } from '../interfaces/IDnGmxBatchingManager.sol';
import { IDnGmxJuniorVault, IERC4626 } from '../interfaces/IDnGmxJuniorVault.sol';

import { IERC20 } from '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import { SafeERC20 } from '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';
import { IERC20Metadata } from '@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol';

import { ISwapRouter } from '@uniswap/v3-periphery/contracts/interfaces/ISwapRouter.sol';

import { OwnableUpgradeable } from '@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol';
import { PausableUpgradeable } from '@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol';

contract DnGmxJuniorVault is IDnGmxJuniorVault, ERC4626Upgradeable, OwnableUpgradeable, PausableUpgradeable {
    using SafeCast for uint256;
    using WadRayMath for uint256;
    using SafeERC20 for IERC20Metadata;
    using FixedPointMathLib for uint256;

    using DnGmxJuniorVaultManager for DnGmxJuniorVaultManager.State;

    uint256 internal constant MAX_BPS = 10_000;
    uint256 internal constant USDG_DECIMALS = 18;

    uint256 internal constant PRICE_PRECISION = 1e30;
    uint256 internal constant VARIABLE_INTEREST_MODE = 2;

    DnGmxJuniorVaultManager.State internal state;

    modifier onlyKeeper() {
        if (msg.sender != state.keeper) revert OnlyKeeperAllowed(msg.sender, state.keeper);
        _;
    }

    modifier onlyDnGmxSeniorVault() {
        if (msg.sender != address(state.dnGmxSeniorVault)) revert NotDnGmxSeniorVault();
        _;
    }

    modifier whenFlashloaned() {
        if (!state.hasFlashloaned) revert FlashloanNotInitiated();
        _;
    }

    modifier onlyBalancerVault() {
        if (msg.sender != address(state.balancerVault)) revert NotBalancerVault();
        _;
    }

    /* ##################################################################
                                SYSTEM FUNCTIONS
    ################################################################## */

    function initialize(
        string calldata _name,
        string calldata _symbol,
        address _swapRouter,
        address _rewardRouter,
        DnGmxJuniorVaultManager.Tokens calldata _tokens,
        IPoolAddressesProvider _poolAddressesProvider
    ) external initializer {
        __Ownable_init();
        __Pausable_init();
        __ERC4626Upgradeable_init(address(_tokens.sGlp), _name, _symbol);

        state.weth = _tokens.weth;
        state.wbtc = _tokens.wbtc;
        state.usdc = _tokens.usdc;

        state.swapRouter = ISwapRouter(_swapRouter);
        state.rewardRouter = IRewardRouterV2(_rewardRouter);

        state.poolAddressProvider = _poolAddressesProvider;

        state.glp = IERC20Metadata(ISGLPExtended(asset).glp());
        state.glpManager = IGlpManager(ISGLPExtended(asset).glpManager());
        state.fsGlp = IERC20(ISGLPExtended(asset).stakedGlpTracker());

        state.gmxVault = IVault(state.glpManager.vault());

        state.pool = IPool(state.poolAddressProvider.getPool());
        state.oracle = IPriceOracle(state.poolAddressProvider.getPriceOracle());

        state.aUsdc = IAToken(state.pool.getReserveData(address(state.usdc)).aTokenAddress);

        state.vWbtc = IDebtToken(state.pool.getReserveData(address(state.wbtc)).variableDebtTokenAddress);
        state.vWeth = IDebtToken(state.pool.getReserveData(address(state.weth)).variableDebtTokenAddress);
    }

    /* ##################################################################
                                ADMIN FUNCTIONS
    ################################################################## */

    function grantAllowances() external onlyOwner {
        address aavePool = address(state.pool);
        address swapRouter = address(state.swapRouter);

        state.wbtc.approve(aavePool, type(uint256).max);
        state.wbtc.approve(swapRouter, type(uint256).max);

        state.weth.approve(aavePool, type(uint256).max);
        state.weth.approve(swapRouter, type(uint256).max);
        state.weth.approve(address(state.batchingManager), type(uint256).max);

        state.usdc.approve(aavePool, type(uint256).max);
        state.usdc.approve(address(swapRouter), type(uint256).max);
        state.usdc.approve(address(state.batchingManager), type(uint256).max);

        state.aUsdc.approve(address(state.dnGmxSeniorVault), type(uint256).max);

        IERC20Metadata(asset).approve(address(state.glpManager), type(uint256).max);

        emit AllowancesGranted();
    }

    function setAdminParams(
        address _newKeeper,
        address _dnGmxSeniorVault,
        uint256 _newDepositCap,
        address _batchingManager,
        uint256 _withdrawFeeBps
    ) external onlyOwner {
        state.keeper = _newKeeper;
        state.dnGmxSeniorVault = IDnGmxSeniorVault(_dnGmxSeniorVault);
        state.depositCap = _newDepositCap;
        state.batchingManager = IDnGmxBatchingManager(_batchingManager);
        state.withdrawFeeBps = _withdrawFeeBps;
    }

    function setThresholds(
        uint16 _slippageThresholdSwap,
        uint16 _slippageThresholdGmx,
        uint208 _usdcConversionThreshold,
        uint256 _hfThreshold,
        uint256 _wethConversionThreshold,
        uint256 _hedgeUsdcAmountThreshold
    ) external onlyOwner {
        state.slippageThresholdSwap = _slippageThresholdSwap;
        state.slippageThresholdGmx = _slippageThresholdGmx;
        state.usdcConversionThreshold = _usdcConversionThreshold;
        state.wethConversionThreshold = _wethConversionThreshold;
        state.hedgeUsdcAmountThreshold = _hedgeUsdcAmountThreshold;
        state.hfThreshold = _hfThreshold;
    }

    function setRebalanceParams(uint32 _rebalanceTimeThreshold, uint16 _rebalanceDeltaThreshold) external onlyOwner {
        state.rebalanceTimeThreshold = _rebalanceTimeThreshold;
        state.rebalanceDeltaThreshold = _rebalanceDeltaThreshold;
    }

    function setHedgeParams(
        IBalancerVault _vault,
        ISwapRouter _swapRouter,
        uint256 _targetHealthFactor,
        IRewardsController _aaveRewardsController
    ) external onlyOwner {
        state.balancerVault = _vault;
        state.swapRouter = _swapRouter;
        state.targetHealthFactor = _targetHealthFactor;
        state.aaveRewardsController = _aaveRewardsController;
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function setFeeParams(uint256 _feeBps, address _feeRecipient) external onlyOwner {
        if (state.feeRecipient != _feeRecipient) {
            state.feeRecipient = _feeRecipient;
        } else revert InvalidFeeRecipient();

        if (_feeBps > 3000) revert InvalidFeeBps();
        state.feeBps = _feeBps;

        emit FeeParamsUpdated(_feeBps, _feeRecipient);
    }

    /// @notice withdraw accumulated WETH fees
    function withdrawFees() external {
        uint256 amount = state.protocolFee;
        state.protocolFee = 0;
        state.weth.transfer(state.feeRecipient, amount);
        emit FeesWithdrawn(amount);
    }

    function unstakeAndVestEsGmx() external onlyOwner {
        state.rewardRouter.unstakeEsGmx(state.protocolEsGmx);
        IVester(state.rewardRouter.glpVester()).deposit(state.protocolEsGmx);
        state.protocolEsGmx = 0;
    }

    function stopVestAndStakeEsGmx() external onlyOwner {
        IVester(state.rewardRouter.glpVester()).withdraw();
        uint256 esGmxWithdrawn = IERC20(state.rewardRouter.esGmx()).balanceOf(address(this));
        state.rewardRouter.stakeEsGmx(esGmxWithdrawn);
        state.protocolEsGmx += esGmxWithdrawn;
    }

    function claimVestedGmx() external onlyOwner {
        uint256 gmxClaimed = IVester(state.rewardRouter.glpVester()).claim();

        //Transfer all of the gmx received to fee recipient
        IERC20Metadata(state.rewardRouter.gmx()).safeTransfer(state.feeRecipient, gmxClaimed);
    }

    /// @notice stakes the rewards from the staked Glp and claims WETH to buy glp
    function harvestFees() public {
        address esGmx = state.rewardRouter.esGmx();
        IRewardTracker sGmx = IRewardTracker(state.rewardRouter.stakedGmxTracker());

        uint256 sGmxPrevBalance = sGmx.depositBalances(address(this), esGmx);

        state.rewardRouter.handleRewards({
            shouldClaimGmx: false,
            shouldStakeGmx: false,
            shouldClaimEsGmx: true,
            shouldStakeEsGmx: true,
            shouldStakeMultiplierPoints: true,
            shouldClaimWeth: true,
            shouldConvertWethToEth: false
        });

        uint256 sGmxHarvested = sGmx.depositBalances(address(this), esGmx) - sGmxPrevBalance;
        state.protocolEsGmx += sGmxHarvested.mulDivDown(state.feeBps, MAX_BPS);
        // console.log('feeBps', state.feeBps);
        // console.log('sGmxHarvested', sGmxHarvested);
        // console.log('protocolEsGmx state', state.protocolEsGmx);

        // console.log('gmx balance', sGmx.depositBalances(address(this), rewardRouter.gmx()));
        uint256 wethHarvested = state.weth.balanceOf(address(this)) - state.protocolFee - state.seniorVaultWethRewards;
        // console.log('wethHarvested', wethHarvested);

        if (wethHarvested > state.wethConversionThreshold) {
            uint256 protocolFeeHarvested = (wethHarvested * state.feeBps) / MAX_BPS;
            state.protocolFee += protocolFeeHarvested;

            uint256 wethToCompound = wethHarvested - protocolFeeHarvested;

            uint256 dnGmxSeniorVaultWethShare = state.dnGmxSeniorVault.getEthRewardsSplitRate().mulDivDown(
                wethToCompound,
                FeeSplitStrategy.RATE_PRECISION
            );
            uint256 dnGmxWethShare = wethToCompound - dnGmxSeniorVaultWethShare;

            uint256 _seniorVaultWethRewards = state.seniorVaultWethRewards + dnGmxSeniorVaultWethShare;

            // console.log('ethRewardsSplitRate', dnGmxSeniorVault.getEthRewardsSplitRate());
            // console.log('wethToCompound', wethToCompound);
            // console.log('dnGmxWethShare', dnGmxWethShare);
            // console.log('dnGmxSeniorVaultWethShare', dnGmxSeniorVaultWethShare);

            uint256 price = state.gmxVault.getMinPrice(address(state.weth));

            uint256 usdgAmount = dnGmxWethShare.mulDivDown(
                price * (MAX_BPS - state.slippageThresholdSwap),
                PRICE_PRECISION * MAX_BPS
            );

            uint256 glpReceived = state.batchingManager.depositToken(address(state.weth), dnGmxWethShare, usdgAmount);

            // console.log('_seniorVaultWethRewards', _seniorVaultWethRewards);
            if (_seniorVaultWethRewards > state.wethConversionThreshold) {
                // Deposit aave vault share to AAVE in usdc
                uint256 minUsdcAmount = state.getTokenPriceInUsdc(state.weth).mulDivDown(
                    _seniorVaultWethRewards * (MAX_BPS - state.slippageThresholdSwap),
                    MAX_BPS * PRICE_PRECISION
                );
                (uint256 aaveUsdcAmount, uint256 tokensUsed) = state.swapToken(
                    address(state.weth),
                    _seniorVaultWethRewards,
                    minUsdcAmount
                );
                tokensUsed; // silence warning
                _executeSupply(address(state.usdc), aaveUsdcAmount);
                state.seniorVaultWethRewards = 0;
                emit RewardsHarvested(
                    wethHarvested,
                    sGmxHarvested,
                    dnGmxWethShare,
                    dnGmxSeniorVaultWethShare,
                    glpReceived,
                    aaveUsdcAmount
                );
            } else {
                state.seniorVaultWethRewards = _seniorVaultWethRewards;
                emit RewardsHarvested(
                    wethHarvested,
                    sGmxHarvested,
                    dnGmxWethShare,
                    dnGmxSeniorVaultWethShare,
                    glpReceived,
                    0
                );
            }
        } else {
            emit RewardsHarvested(wethHarvested, sGmxHarvested, 0, 0, 0, 0);
        }
    }

    /* ##################################################################
                                KEEPER FUNCTIONS
    ################################################################## */

    function isValidRebalance() public view returns (bool) {
        // console.log('_isValidRebalanceTime', _isValidRebalanceTime());
        // console.log('_isValidRebalanceDeviation', _isValidRebalanceDeviation());
        return state.isValidRebalanceTime() || state.isValidRebalanceDeviation() || state.isValidRebalanceHF();
    }

    /* solhint-disable not-rely-on-time */
    function rebalance() external onlyKeeper {
        if (!isValidRebalance()) revert InvalidRebalance();

        // harvest fees
        harvestFees();

        (uint256 currentBtc, uint256 currentEth) = state.getCurrentBorrows();
        uint256 totalCurrentBorrowValue = state.getBorrowValue(currentBtc, currentEth); // = total position value of current btc and eth position

        // rebalance profit
        state.rebalanceProfit(totalCurrentBorrowValue);

        // console.log('currentBtc', currentBtc);
        // console.log('currentEth', currentEth);
        // console.log('totalAssets()', totalAssets());
        // console.log('totalCurrentBorrowValue', totalCurrentBorrowValue);

        // calculate current btc and eth positions in GLP
        // get the position value and calculate the collateral needed to borrow that
        // transfer collateral from LB vault to DN vault
        state.rebalanceHedge(currentBtc, currentEth, totalAssets());

        state.lastRebalanceTS = uint64(block.timestamp);
        emit Rebalanced();
    }

    /* ##################################################################
                                USER FUNCTIONS
    ################################################################## */

    function deposit(uint256 amount, address to)
        public
        virtual
        override(IERC4626, ERC4626Upgradeable)
        whenNotPaused
        returns (uint256 shares)
    {
        _rebalanceBeforeShareAllocation();
        shares = super.deposit(amount, to);
    }

    function mint(uint256 shares, address to)
        public
        virtual
        override(IERC4626, ERC4626Upgradeable)
        whenNotPaused
        returns (uint256 amount)
    {
        _rebalanceBeforeShareAllocation();
        amount = super.mint(shares, to);
    }

    function withdraw(
        uint256 assets,
        address receiver,
        address owner
    ) public override(IERC4626, ERC4626Upgradeable) whenNotPaused returns (uint256 shares) {
        _rebalanceBeforeShareAllocation();
        shares = previewWithdraw(assets); // No need to check for rounding error, previewWithdraw rounds up.

        if (msg.sender != owner) {
            uint256 allowed = allowance(owner, msg.sender); // Saves gas for limited approvals.

            if (allowed != type(uint256).max) _approve(owner, msg.sender, allowed - shares);
        }
        uint256 assetsAfterFees = assets.mulDivDown(MAX_BPS - state.withdrawFeeBps, MAX_BPS);

        beforeWithdraw(assetsAfterFees, shares, receiver);

        _burn(owner, shares);

        emit Withdraw(msg.sender, receiver, owner, assetsAfterFees, shares);

        IERC20Metadata(asset).safeTransfer(receiver, assetsAfterFees);
    }

    function redeem(
        uint256 shares,
        address receiver,
        address owner
    ) public override(IERC4626, ERC4626Upgradeable) whenNotPaused returns (uint256 assets) {
        _rebalanceBeforeShareAllocation();

        if (msg.sender != owner) {
            uint256 allowed = allowance(owner, msg.sender); // Saves gas for limited approvals.

            if (allowed != type(uint256).max) _approve(owner, msg.sender, allowed - shares);
        }

        // Check for rounding error since we round down in previewRedeem.
        require((assets = previewRedeem(shares)) != 0, 'ZERO_ASSETS');

        uint256 assetsAfterFees = assets.mulDivDown(MAX_BPS - state.withdrawFeeBps, MAX_BPS);

        beforeWithdraw(assetsAfterFees, shares, receiver);

        _burn(owner, shares);

        emit Withdraw(msg.sender, receiver, owner, assetsAfterFees, shares);

        // console.log('assets bal', fsGlp.balanceOf(address(this)));
        // console.log('withdrawing', assets);
        // console.log('assetsAfterFees', assetsAfterFees);
        // console.log('batchingManager.dnGmxJuniorVaultGlpBalance()', batchingManager.dnGmxJuniorVaultGlpBalance());

        IERC20Metadata(asset).safeTransfer(receiver, assetsAfterFees);
    }

    //TODO: add withdrawToken and redeemToken functions

    /* ##################################################################
                            FLASHLOAN RECEIVER
    ################################################################## */
    function receiveFlashLoan(
        IERC20[] memory tokens,
        uint256[] memory amounts,
        uint256[] memory feeAmounts,
        bytes memory userData
    ) external onlyBalancerVault whenFlashloaned {
        (
            uint256 btcTokenAmount,
            uint256 btcUsdcAmount,
            uint256 ethTokenAmount,
            uint256 ethUsdcAmount,
            bool repayDebtBtc,
            bool repayDebtEth
        ) = abi.decode(userData, (uint256, uint256, uint256, uint256, bool, bool));

        // console.log('### RECEIVE FLASHLOAN ###');
        // console.log('btcTokenAmount', btcTokenAmount);
        // console.log('ethTokenAmount', ethTokenAmount);
        // console.log('btcUsdcAmount', btcUsdcAmount);
        // console.log('ethUsdcAmount', ethUsdcAmount);
        // console.log('repayDebtBtc', repayDebtBtc);
        // console.log('repayDebtEth', repayDebtEth);

        uint256 btcAssetPremium;
        uint256 ethAssetPremium;
        // adjust asset amounts for premiums (zero for balancer at the time of dev)
        if (repayDebtBtc && repayDebtEth) {
            // console.log('CASE 1');
            // Here amounts[0] should be equal to btcTokenAmount+ethTokenAmount
            btcAssetPremium = feeAmounts[0].mulDivDown(btcUsdcAmount, amounts[0]);
            // console.log('btcAssetPremium', btcAssetPremium);
            ethAssetPremium = (feeAmounts[0] - btcAssetPremium);
            // console.log('ethAssetPremium', ethAssetPremium);
        } else if (btcTokenAmount != 0 && ethTokenAmount != 0) {
            // console.log('CASE 2');

            // Here amounts[0] should be equal to btcTokenAmount and amounts[1] should be equal to ethTokenAmount
            bool btcFirst = false;
            if (repayDebtBtc ? tokens[0] == state.usdc : tokens[0] == state.wbtc) btcFirst = true;
            btcAssetPremium = feeAmounts[btcFirst ? 0 : 1];
            ethAssetPremium = feeAmounts[btcFirst ? 1 : 0];
        } else {
            // console.log('CASE 3');

            if (btcTokenAmount != 0) btcAssetPremium = feeAmounts[0];
            else ethAssetPremium = feeAmounts[0];
        }

        if (btcTokenAmount > 0)
            _executeOperationToken(address(state.wbtc), btcTokenAmount, btcUsdcAmount, btcAssetPremium, repayDebtBtc);
        if (ethTokenAmount > 0)
            _executeOperationToken(address(state.weth), ethTokenAmount, ethUsdcAmount, ethAssetPremium, repayDebtEth);
    }

    /* ##################################################################
                                VIEW FUNCTIONS
    ################################################################## */

    function totalAssets() public view override(IERC4626, ERC4626Upgradeable) returns (uint256) {
        return state.totalAssets();
    }

    function getPrice(bool maximize) public view returns (uint256) {
        uint256 aum = state.glpManager.getAum(maximize);
        uint256 totalSupply = state.glp.totalSupply();

        return aum.mulDivDown(PRICE_PRECISION, totalSupply * 1e24);
    }

    function getPriceX128() public view returns (uint256) {
        uint256 aum = state.glpManager.getAum(false);
        uint256 totalSupply = state.glp.totalSupply();

        return aum.mulDivDown(1 << 128, totalSupply * 1e24);
    }

    function getMarketValue(uint256 assetAmount) public view returns (uint256 marketValue) {
        marketValue = assetAmount.mulDivDown(getPrice(false), PRICE_PRECISION);
    }

    function getVaultMarketValue() public view returns (int256 vaultMarketValue) {
        (uint256 currentBtc, uint256 currentEth) = state.getCurrentBorrows();
        uint256 totalCurrentBorrowValue = state.getBorrowValue(currentBtc, currentEth);
        uint256 glpBalance = state.fsGlp.balanceOf(address(this)) + state.batchingManager.dnGmxJuniorVaultGlpBalance();
        vaultMarketValue = ((getMarketValue(glpBalance).toInt256() +
            state.dnUsdcDeposited +
            state.unhedgedGlpInUsdc.toInt256()) - totalCurrentBorrowValue.toInt256());
    }

    function getUsdcBorrowed() public view returns (uint256 usdcAmount) {
        return
            uint256(
                state.aUsdc.balanceOf(address(this)).toInt256() -
                    state.dnUsdcDeposited -
                    state.unhedgedGlpInUsdc.toInt256()
            );
    }

    function maxDeposit(address) public view override(IERC4626, ERC4626Upgradeable) returns (uint256) {
        return state.depositCap - state.totalAssets(true);
    }

    function maxMint(address receiver) public view override(IERC4626, ERC4626Upgradeable) returns (uint256) {
        return convertToShares(maxDeposit(receiver));
    }

    function convertToShares(uint256 assets) public view override(IERC4626, ERC4626Upgradeable) returns (uint256) {
        uint256 supply = totalSupply(); // Saves an extra SLOAD if totalSupply is non-zero.

        return supply == 0 ? assets : assets.mulDivDown(supply, state.totalAssets(true));
    }

    function convertToAssets(uint256 shares) public view override(IERC4626, ERC4626Upgradeable) returns (uint256) {
        uint256 supply = totalSupply(); // Saves an extra SLOAD if totalSupply is non-zero.

        return supply == 0 ? shares : shares.mulDivDown(state.totalAssets(false), supply);
    }

    function previewMint(uint256 shares) public view override(IERC4626, ERC4626Upgradeable) returns (uint256) {
        uint256 supply = totalSupply(); // Saves an extra SLOAD if totalSupply is non-zero.

        return supply == 0 ? shares : shares.mulDivUp(state.totalAssets(true), supply);
    }

    function previewWithdraw(uint256 assets) public view override(IERC4626, ERC4626Upgradeable) returns (uint256) {
        uint256 supply = totalSupply(); // Saves an extra SLOAD if totalSupply is non-zero.

        return supply == 0 ? assets : assets.mulDivUp(supply, state.totalAssets(false));
    }

    function depositCap() external view returns (uint256) {
        return state.depositCap;
    }

    function getCurrentBorrows() external view returns (uint256 currentBtcBorrow, uint256 currentEthBorrow) {
        return state.getCurrentBorrows();
    }

    function getOptimalBorrows(uint256 glpDeposited)
        external
        view
        returns (uint256 optimalBtcBorrow, uint256 optimalEthBorrow)
    {
        return state.getOptimalBorrows(glpDeposited);
    }

    function dnUsdcDeposited() external view returns (int256) {
        return state.dnUsdcDeposited;
    }

    /* ##################################################################
                            INTERNAL FUNCTIONS
    ################################################################## */

    /*
        DEPOSIT/WITHDRAW HELPERS
    */

    function _rebalanceBeforeShareAllocation() internal {
        // harvest fees
        harvestFees();

        (uint256 currentBtc, uint256 currentEth) = state.getCurrentBorrows();
        uint256 totalCurrentBorrowValue = state.getBorrowValue(currentBtc, currentEth); // = total position value of current btc and eth position

        // rebalance profit
        state.rebalanceProfit(totalCurrentBorrowValue);
    }

    function beforeWithdraw(
        uint256 assets,
        uint256,
        address
    ) internal override {
        (uint256 currentBtc, uint256 currentEth) = state.getCurrentBorrows();

        //rebalance of hedge based on assets after withdraw (before withdraw assets - withdrawn assets)
        state.rebalanceHedge(currentBtc, currentEth, totalAssets() - assets);
    }

    function afterDeposit(
        uint256,
        uint256,
        address
    ) internal override {
        if (totalAssets() > state.depositCap) revert DepositCapExceeded();
        (uint256 currentBtc, uint256 currentEth) = state.getCurrentBorrows();
        // console.log('currentBtc', currentBtc);
        // console.log('currentEth', currentEth);
        // console.log('totalAssets()', totalAssets());

        //rebalance of hedge based on assets after deposit (after deposit assets)
        state.rebalanceHedge(currentBtc, currentEth, totalAssets());
    }

    /*
        AAVE HELPERS
    */

    function _executeBorrow(address token, uint256 amount) internal {
        state.pool.borrow(token, amount, VARIABLE_INTEREST_MODE, 0, address(this));
    }

    function _executeRepay(address token, uint256 amount) internal {
        state.pool.repay(token, amount, VARIABLE_INTEREST_MODE, address(this));
    }

    function _executeSupply(address token, uint256 amount) internal {
        state.pool.supply(token, amount, address(this), 0);
    }

    function _executeWithdraw(
        address token,
        uint256 amount,
        address receiver
    ) internal {
        state.pool.withdraw(token, amount, receiver);
    }

    /*
        BALANCER HELPERS
    */

    function _executeOperationToken(
        address token,
        uint256 tokenAmount,
        uint256 usdcAmount,
        uint256 premium,
        bool repayDebt
    ) internal {
        if (!repayDebt) {
            // console.log('swapTokenToUSD');
            uint256 amountWithPremium = tokenAmount + premium;
            // console.log('amountWithPremium borrow', amountWithPremium, token);
            (uint256 usdcReceived, uint256 tokensUsed) = state.swapToken(token, tokenAmount, usdcAmount);
            tokensUsed; // silence warning
            _executeSupply(address(state.usdc), usdcReceived);
            _executeBorrow(token, amountWithPremium);
            IERC20(token).transfer(address(state.balancerVault), amountWithPremium);
            state.dnUsdcDeposited += usdcReceived.toInt256();
        } else {
            // console.log('swapUSDCToToken');
            (uint256 usdcPaid, uint256 tokensReceived) = state.swapUSDC(token, tokenAmount, usdcAmount);
            uint256 amountWithPremium = usdcPaid + premium;
            // console.log('amountWithPremium', amountWithPremium, token);
            state.dnUsdcDeposited -= amountWithPremium.toInt256();
            // console.log('tokensReceived', tokensReceived);
            _executeRepay(token, tokensReceived);
            //withdraws to balancerVault
            _executeWithdraw(address(state.usdc), amountWithPremium, address(this));
            state.usdc.transfer(address(state.balancerVault), usdcAmount + premium);
        }
    }

    function _executeFlashloan(
        address[] memory assets,
        uint256[] memory amounts,
        uint256 _btcTokenAmount,
        uint256 _btcUsdcAmount,
        uint256 _ethTokenAmount,
        uint256 _ethUsdcAmount,
        bool _repayDebtBtc,
        bool _repayDebtEth
    ) internal {
        if (assets.length != amounts.length) revert ArraysLengthMismatch();

        state.hasFlashloaned = true;

        state.balancerVault.flashLoan(
            address(this),
            assets,
            amounts,
            abi.encode(_btcTokenAmount, _btcUsdcAmount, _ethTokenAmount, _ethUsdcAmount, _repayDebtBtc, _repayDebtEth)
        );

        state.hasFlashloaned = false;
    }
}
