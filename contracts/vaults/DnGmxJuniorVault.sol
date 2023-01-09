// SPDX-License-Identifier: MIT

pragma solidity ^0.8.9;

import { IAToken } from '@aave/core-v3/contracts/interfaces/IAToken.sol';
import { IPool } from '@aave/core-v3/contracts/interfaces/IPool.sol';
import { IPoolAddressesProvider } from '@aave/core-v3/contracts/interfaces/IPoolAddressesProvider.sol';
import { IPriceOracle } from '@aave/core-v3/contracts/interfaces/IPriceOracle.sol';
import { IRewardsController } from '@aave/periphery-v3/contracts/rewards/interfaces/IRewardsController.sol';
import { WadRayMath } from '@aave/core-v3/contracts/protocol/libraries/math/WadRayMath.sol';

import { IERC20 } from '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import { IERC20Metadata } from '@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol';
import { OwnableUpgradeable } from '@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol';
import { PausableUpgradeable } from '@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol';
import { SafeERC20 } from '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';

import { FixedPointMathLib } from '@rari-capital/solmate/src/utils/FixedPointMathLib.sol';

import { FullMath } from '@uniswap/v3-core-0.8-support/contracts/libraries/FullMath.sol';
import { ISwapRouter } from '@uniswap/v3-periphery/contracts/interfaces/ISwapRouter.sol';

import { IBalancerVault } from '../interfaces/balancer/IBalancerVault.sol';
import { IDnGmxSeniorVault } from '../interfaces/IDnGmxSeniorVault.sol';
import { IDnGmxJuniorVault, IERC4626 } from '../interfaces/IDnGmxJuniorVault.sol';
import { IDebtToken } from '../interfaces/IDebtToken.sol';
import { IGlpManager } from '../interfaces/gmx/IGlpManager.sol';
import { ISglpExtended } from '../interfaces/gmx/ISglpExtended.sol';
import { IRewardRouterV2 } from '../interfaces/gmx/IRewardRouterV2.sol';
import { IRewardTracker } from '../interfaces/gmx/IRewardTracker.sol';
import { IVault } from '../interfaces/gmx/IVault.sol';
import { IVester } from '../interfaces/gmx/IVester.sol';

import { DnGmxJuniorVaultManager } from '../libraries/DnGmxJuniorVaultManager.sol';
import { SafeCast } from '../libraries/SafeCast.sol';

import { ERC4626Upgradeable } from '../ERC4626/ERC4626Upgradeable.sol';

/**
 * @title Delta Neutral GMX Junior Tranche contract
 * @notice Implements the handling of junior tranche which maintains hedges for btc and eth
 * basis the target weights on GMX
 * @notice It is upgradable contract (via TransparentUpgradeableProxy proxy owned by ProxyAdmin)
 * @author RageTrade
 **/
contract DnGmxJuniorVault is IDnGmxJuniorVault, ERC4626Upgradeable, OwnableUpgradeable, PausableUpgradeable {
    using SafeCast for uint256;
    using FullMath for uint256;
    using WadRayMath for uint256;
    using SafeERC20 for IERC20Metadata;
    using FixedPointMathLib for uint256;

    using DnGmxJuniorVaultManager for DnGmxJuniorVaultManager.State;

    uint256 internal constant MAX_BPS = 10_000;
    uint256 internal constant PRICE_PRECISION = 1e30;

    DnGmxJuniorVaultManager.State internal state;

    // these gaps are added to allow adding new variables without shifting down inheritance chain
    uint256[50] private __gaps;

    modifier onlyKeeper() {
        if (msg.sender != state.keeper) revert OnlyKeeperAllowed(msg.sender, state.keeper);
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

    /// @notice initializer
    /// @param _name name of vault share token
    /// @param _symbol symbol of vault share token
    /// @param _swapRouter uniswap swap router address
    /// @param _rewardRouter gmx reward router address
    /// @param _tokens addresses of tokens used
    /// @param _poolAddressesProvider add
    function initialize(
        string calldata _name,
        string calldata _symbol,
        address _swapRouter,
        address _rewardRouter,
        address _mintBurnRewardRouter,
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
        state.mintBurnRewardRouter = IRewardRouterV2(_mintBurnRewardRouter);

        state.poolAddressProvider = _poolAddressesProvider;

        state.glp = IERC20Metadata(ISglpExtended(asset).glp());
        state.glpManager = IGlpManager(IRewardRouterV2(_mintBurnRewardRouter).glpManager());
        state.fsGlp = IERC20(ISglpExtended(asset).stakedGlpTracker());

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

    /// @notice grants allowances for tokens to relevant external contracts
    /// @dev to be called once the vault is deployed
    function grantAllowances() external onlyOwner {
        address aavePool = address(state.pool);
        address swapRouter = address(state.swapRouter);

        // allowance to aave pool for wbtc for repay and supply
        state.wbtc.approve(aavePool, type(uint256).max);
        // allowance to uniswap swap router for wbtc for swap
        state.wbtc.approve(swapRouter, type(uint256).max);

        // allowance to aave pool for weth for repay and supply
        state.weth.approve(aavePool, type(uint256).max);
        // allowance to uniswap swap router for weth for swap
        state.weth.approve(swapRouter, type(uint256).max);
        // allowance to batching manager for weth
        state.weth.approve(address(state.glpManager), type(uint256).max);

        // allowance to aave pool for usdc for supply
        state.usdc.approve(aavePool, type(uint256).max);
        // allowance to swap router for usdc for swap
        state.usdc.approve(address(swapRouter), type(uint256).max);
        // allowance to batching manager for usdc deposits when rebalancing profits
        state.usdc.approve(address(state.glpManager), type(uint256).max);

        // allowance to aave pool for aUSDC transfers to senior tranche
        state.aUsdc.approve(address(state.dnGmxSeniorVault), type(uint256).max);

        // allowance for sGLP to glpManager
        IERC20Metadata(asset).approve(address(state.glpManager), type(uint256).max);

        emit AllowancesGranted();
    }

    /// @notice set admin paramters
    /// @param newKeeper keeper address
    /// @param dnGmxSeniorVault senior vault address
    /// @param newDepositCap deposit cap
    /// @param withdrawFeeBps fees bps on withdrawals and redeems
    function setAdminParams(
        address newKeeper,
        address dnGmxSeniorVault,
        uint256 newDepositCap,
        uint16 withdrawFeeBps,
        uint24 feeTierWethWbtcPool
    ) external onlyOwner {
        if (withdrawFeeBps > MAX_BPS) revert InvalidWithdrawFeeBps();

        state.keeper = newKeeper;
        state.depositCap = newDepositCap;
        state.withdrawFeeBps = withdrawFeeBps;
        state.feeTierWethWbtcPool = feeTierWethWbtcPool;

        state.dnGmxSeniorVault = IDnGmxSeniorVault(dnGmxSeniorVault);

        emit AdminParamsUpdated(newKeeper, dnGmxSeniorVault, newDepositCap, withdrawFeeBps);
    }

    /// @notice set thresholds
    /// @param slippageThresholdSwapBtcBps (BPS) slippage threshold on btc swaps
    /// @param slippageThresholdSwapEthBps (BPS) slippage threshold on eth swaps
    /// @param slippageThresholdGmxBps (BPS) slippage threshold on sGlp mint and redeem
    /// @param usdcConversionThreshold (usdc amount) threshold amount for conversion of usdc into sGlp
    /// @param wethConversionThreshold (weth amount) threshold amount for weth fees to be compounded into sGlp
    /// @param hedgeUsdcAmountThreshold (usdc amount) threshold amount below which ETH/BTC hedges are not executed
    /// @param partialBtcHedgeUsdcAmountThreshold (usdc amount) threshold amount above which BTC hedge is not fully taken (gets executed in blocks over multiple rebalances)
    /// @param partialEthHedgeUsdcAmountThreshold (usdc amount) threshold amount above which ETH hedge is not fully taken (gets executed in blocks over multiple rebalances)
    function setThresholds(
        uint16 slippageThresholdSwapBtcBps,
        uint16 slippageThresholdSwapEthBps,
        uint16 slippageThresholdGmxBps,
        uint128 usdcConversionThreshold,
        uint128 wethConversionThreshold,
        uint128 hedgeUsdcAmountThreshold,
        uint128 partialBtcHedgeUsdcAmountThreshold,
        uint128 partialEthHedgeUsdcAmountThreshold
    ) external onlyOwner {
        if (slippageThresholdSwapBtcBps > MAX_BPS) revert InvalidSlippageThresholdSwapBtc();
        if (slippageThresholdSwapEthBps > MAX_BPS) revert InvalidSlippageThresholdSwapEth();
        if (slippageThresholdGmxBps > MAX_BPS) revert InvalidSlippageThresholdGmx();

        state.slippageThresholdSwapBtcBps = slippageThresholdSwapBtcBps;
        state.slippageThresholdSwapEthBps = slippageThresholdSwapEthBps;
        state.slippageThresholdGmxBps = slippageThresholdGmxBps;
        state.usdcConversionThreshold = usdcConversionThreshold;
        state.wethConversionThreshold = wethConversionThreshold;
        state.hedgeUsdcAmountThreshold = hedgeUsdcAmountThreshold;
        state.partialBtcHedgeUsdcAmountThreshold = partialBtcHedgeUsdcAmountThreshold;
        state.partialEthHedgeUsdcAmountThreshold = partialEthHedgeUsdcAmountThreshold;

        emit ThresholdsUpdated(
            slippageThresholdSwapBtcBps,
            slippageThresholdSwapEthBps,
            slippageThresholdGmxBps,
            usdcConversionThreshold,
            wethConversionThreshold,
            hedgeUsdcAmountThreshold,
            partialBtcHedgeUsdcAmountThreshold,
            partialEthHedgeUsdcAmountThreshold
        );
    }

    /// @notice set thresholds
    /// @param rebalanceProfitUsdcAmountThreshold (BPS) slippage threshold on btc swaps
    function setThresholdsV1(uint128 rebalanceProfitUsdcAmountThreshold) external onlyOwner {
        state.rebalanceProfitUsdcAmountThreshold = rebalanceProfitUsdcAmountThreshold;

        emit ThresholdsV1Updated(rebalanceProfitUsdcAmountThreshold);
    }

    /// @notice set rebalance paramters
    /// @param rebalanceTimeThreshold (seconds) minimum time difference required between two rebalance calls
    /// @dev a partial rebalance (rebalance where partial hedge gets taken) does not count.
    /// @dev setHedgeParams should already have been called.
    /// @param rebalanceDeltaThresholdBps (BPS) threshold difference between optimal and current token hedges for triggering a rebalance
    /// @param rebalanceHfThresholdBps (BPS) threshold amount of health factor on AAVE below which a rebalance is triggered
    function setRebalanceParams(
        uint32 rebalanceTimeThreshold,
        uint16 rebalanceDeltaThresholdBps,
        uint16 rebalanceHfThresholdBps
    ) external onlyOwner {
        if (rebalanceTimeThreshold > 3 days) revert InvalidRebalanceTimeThreshold();
        if (rebalanceDeltaThresholdBps > MAX_BPS) revert InvalidRebalanceDeltaThresholdBps();
        if (rebalanceHfThresholdBps < MAX_BPS || rebalanceHfThresholdBps > state.targetHealthFactor)
            revert InvalidRebalanceHfThresholdBps();

        state.rebalanceTimeThreshold = rebalanceTimeThreshold;
        state.rebalanceDeltaThresholdBps = rebalanceDeltaThresholdBps;
        state.rebalanceHfThresholdBps = rebalanceHfThresholdBps;

        emit RebalanceParamsUpdated(rebalanceTimeThreshold, rebalanceDeltaThresholdBps, rebalanceHfThresholdBps);
    }

    /// @notice set hedge parameters
    /// @param vault balancer vault for ETH and BTC flashloans
    /// @param swapRouter uniswap swap router for swapping ETH/BTC to USDC and viceversa
    /// @param targetHealthFactor health factor to target on AAVE after every rebalance
    /// @param aaveRewardsController AAVE rewards controller for handling additional reward distribution on AAVE
    function setHedgeParams(
        IBalancerVault vault,
        ISwapRouter swapRouter,
        uint256 targetHealthFactor,
        IRewardsController aaveRewardsController
    ) external onlyOwner {
        if (targetHealthFactor > 20_000) revert InvalidTargetHealthFactor();

        state.balancerVault = vault;
        state.swapRouter = swapRouter;
        state.targetHealthFactor = targetHealthFactor;
        state.aaveRewardsController = aaveRewardsController;

        // update aave pool and oracle if their addresses have updated
        IPoolAddressesProvider poolAddressProvider = state.poolAddressProvider;
        IPool pool = IPool(poolAddressProvider.getPool());
        state.pool = pool;
        IPriceOracle oracle = IPriceOracle(poolAddressProvider.getPriceOracle());
        state.oracle = oracle;

        emit HedgeParamsUpdated(vault, swapRouter, targetHealthFactor, aaveRewardsController, pool, oracle);
    }

    /// @notice set GMX parameters
    /// @param _glpManager GMX glp manager
    function setGmxParams(IGlpManager _glpManager) external onlyOwner {
        state.glpManager = _glpManager;
    }

    function setDirectConversion(bool _useDirectConversion) external onlyOwner {
        state.useDirectConversion = _useDirectConversion;
    }

    /// @notice pause deposit, mint, withdraw and redeem
    function pause() external onlyOwner {
        _pause();
    }

    /// @notice unpause deposit, mint, withdraw and redeem
    function unpause() external onlyOwner {
        _unpause();
    }

    /// @notice sets feeBps and feeRecipient
    /// @param _feeBps the part of eth rewards earned from GMX earned deducted as protocol fees
    /// @param _feeRecipient recipient address for protocol fees and protocol esGmx
    function setFeeParams(uint16 _feeBps, address _feeRecipient) external onlyOwner {
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

    /// @notice unstakes and vest protocol esGmx to convert it to Gmx
    function unstakeAndVestEsGmx() external onlyOwner {
        // unstakes the protocol esGMX and starts vesting it
        // this encumbers some glp deposits
        // can stop vesting to enable glp withdraws
        state.rewardRouter.unstakeEsGmx(state.protocolEsGmx);
        IVester(state.rewardRouter.glpVester()).deposit(state.protocolEsGmx);
        state.protocolEsGmx = 0;
    }

    /// @notice claims vested gmx tokens (i.e. stops vesting esGmx so that the relevant glp amount is unlocked)
    /// @dev when esGmx is vested some GlP tokens are locked on a pro-rata basis, in case that leads to issue in withdrawal this function can be called
    function stopVestAndStakeEsGmx() external onlyOwner {
        // stops vesting and stakes the remaining esGMX
        // this enables glp withdraws
        IVester(state.rewardRouter.glpVester()).withdraw();
        uint256 esGmxWithdrawn = IERC20(state.rewardRouter.esGmx()).balanceOf(address(this));
        state.rewardRouter.stakeEsGmx(esGmxWithdrawn);
        state.protocolEsGmx += esGmxWithdrawn;
    }

    /// @notice claims vested gmx tokens to feeRecipient
    /// @dev vested esGmx gets converted to GMX every second, so whatever amount is vested gets claimed
    function claimVestedGmx() external onlyOwner {
        // stops vesting and stakes the remaining esGMX
        // this can be used in case glp withdraws are hampered
        uint256 gmxClaimed = IVester(state.rewardRouter.glpVester()).claim();

        //Transfer all of the gmx received to fee recipient
        IERC20Metadata(state.rewardRouter.gmx()).safeTransfer(state.feeRecipient, gmxClaimed);
    }

    function rebalanceProfit() external onlyOwner {
        (uint256 currentBtc, uint256 currentEth) = state.getCurrentBorrows();
        uint256 totalCurrentBorrowValue = state.getBorrowValue(currentBtc, currentEth); // = total position value of current btc and eth position

        // rebalance profit
        state.rebalanceProfit(totalCurrentBorrowValue);
    }

    function harvestFees() external {
        state.harvestFees();
    }

    /* ##################################################################
                                KEEPER FUNCTIONS
    ################################################################## */
    /// @notice checks if the rebalance can be run (3 thresholds - time, hedge deviation and AAVE HF )
    function isValidRebalance() public view returns (bool) {
        return state.isValidRebalanceTime() || state.isValidRebalanceDeviation() || state.isValidRebalanceHF();
    }

    /* solhint-disable not-rely-on-time */
    /// @notice harvests glp rewards & rebalances the hedge positions, profits on AAVE and Gmx.
    /// @notice run only if valid rebalance is true
    function rebalance() external onlyKeeper {
        if (!isValidRebalance()) revert InvalidRebalance();

        // harvest fees
        state.harvestFees();

        (uint256 currentBtc, uint256 currentEth) = state.getCurrentBorrows();
        uint256 totalCurrentBorrowValue = state.getBorrowValue(currentBtc, currentEth); // = total position value of current btc and eth position

        // rebalance profit
        state.rebalanceProfit(totalCurrentBorrowValue);

        // calculate current btc and eth positions in GLP
        // get the position value and calculate the collateral needed to borrow that
        // transfer collateral from LB vault to DN vault
        bool isPartialHedge = state.rebalanceHedge(currentBtc, currentEth, totalAssets(), true);

        if (!isPartialHedge) state.lastRebalanceTS = uint48(block.timestamp);
        emit Rebalanced();
    }

    /* ##################################################################
                                USER FUNCTIONS
    ################################################################## */
    /// @notice deposits sGlp token and returns vault shares
    /// @param amount amount of sGlp (asset) tokens to deposit
    /// @param to receiver address for share allocation
    /// @return shares amount of shares allocated for deposit
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

    /// @notice mints "shares" amount of vault shares and pull relevant amount of sGlp tokens
    /// @param shares amount of vault shares to mint
    /// @param to receiver address for share allocation
    /// @return amount amount of sGlp tokens required for given number of shares
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

    ///@notice withdraws "assets" amount of sGlp tokens and burns relevant amount of vault shares
    ///@notice deducts some assets for the remaining shareholders to cover the cost of opening and closing of hedge
    ///@param assets amount of assets to withdraw
    ///@param receiver receiver address for the assets
    ///@param owner owner address of the shares to be burnt
    ///@return shares number of shares burnt
    function withdraw(
        uint256 assets,
        address receiver,
        address owner
    ) public override(IERC4626, ERC4626Upgradeable) whenNotPaused returns (uint256 shares) {
        _rebalanceBeforeShareAllocation();
        shares = super.withdraw(assets, receiver, owner);
    }

    ///@notice burns "shares" amount of vault shares and withdraws relevant amount of sGlp tokens
    ///@notice deducts some assets for the remaining shareholders to cover the cost of opening and closing of hedge
    ///@param shares amount of shares to redeem
    ///@param receiver receiver address for the assets
    ///@param owner owner address of the shares to be burnt
    ///@return assets number of assets sent
    function redeem(
        uint256 shares,
        address receiver,
        address owner
    ) public override(IERC4626, ERC4626Upgradeable) whenNotPaused returns (uint256 assets) {
        _rebalanceBeforeShareAllocation();
        assets = super.redeem(shares, receiver, owner);
    }

    /* ##################################################################
                            FLASHLOAN RECEIVER
    ################################################################## */

    ///@notice flashloan receiver for balance vault
    ///@notice receives flashloaned tokens(WETH or WBTC or USDC) from balancer, swaps on uniswap and borrows/repays on AAVE
    ///@dev only allows balancer vault to call this
    ///@dev only runs when _hasFlashloaned is set to true (prevents someone else from initiating flashloan to vault)
    ///@param tokens list of tokens flashloaned
    ///@param amounts amounts of token flashloans in same order
    ///@param feeAmounts amounts of fee/premium charged for flashloan
    ///@param userData data passed to balancer for flashloan (includes token amounts, token usdc value and swap direction)
    function receiveFlashLoan(
        IERC20[] memory tokens,
        uint256[] memory amounts,
        uint256[] memory feeAmounts,
        bytes memory userData
    ) external onlyBalancerVault whenFlashloaned {
        state.receiveFlashLoan(tokens, amounts, feeAmounts, userData);
    }

    /* ##################################################################
                                VIEW FUNCTIONS
    ################################################################## */

    ///@notice gives total asset tokens available in vault
    ///@dev some unhedged part of glp might be converted to USDC (its value in GLP is added to total glp assets)
    function totalAssets() public view override(IERC4626, ERC4626Upgradeable) returns (uint256) {
        return state.totalAssets();
    }

    ///@notice returns price of glp token
    ///@param maximize specifies aum used is minimum(false) or maximum(true)
    ///@return price of glp token in PRICE_PRECISION
    function getPrice(bool maximize) public view returns (uint256) {
        uint256 aum = state.glpManager.getAum(maximize);
        uint256 totalSupply = state.glp.totalSupply();

        return aum.mulDivDown(PRICE_PRECISION, totalSupply * 1e24);
    }

    ///@notice returns price of glp token
    ///@return price of glp token in X128
    function getPriceX128() public view returns (uint256) {
        uint256 aum = state.glpManager.getAum(false);
        uint256 totalSupply = state.glp.totalSupply();

        return aum.mulDiv(1 << 128, totalSupply * 1e24);
    }

    ///@notice returns the minimum market value of "assetAmount" of asset (sGlp) tokens
    ///@dev uses minimum price i.e. minimum AUM of glp tokens
    ///@param assetAmount amount of sGlp tokens
    ///@return marketValue of given amount of glp assets
    function getMarketValue(uint256 assetAmount) public view returns (uint256 marketValue) {
        marketValue = assetAmount.mulDivDown(getPrice(false), PRICE_PRECISION);
    }

    ///@notice returns vault market value (USD terms & 6 decimals) basis glp and usdc tokens in vault
    ///@dev Part 1. adds value of glp tokens basis minimum glp aum from gmx
    ///@dev Part 2. adds value of junior vault usdc deposit in AAVE (swap outputs + unhedged GLP)
    ///@dev Part 3. subtracts value of WETH & WBTC borrows from AAVE
    ///@return vaultMarketValue : market value of vault assets
    function getVaultMarketValue() public view returns (int256 vaultMarketValue) {
        (uint256 currentBtc, uint256 currentEth) = state.getCurrentBorrows();
        uint256 totalCurrentBorrowValue = state.getBorrowValue(currentBtc, currentEth);
        uint256 glpBalance = state.fsGlp.balanceOf(address(this));
        vaultMarketValue = ((getMarketValue(glpBalance).toInt256() +
            state.dnUsdcDeposited +
            state.unhedgedGlpInUsdc.toInt256()) - totalCurrentBorrowValue.toInt256());
    }

    /// @notice returns total amount of usdc borrowed from senior vault
    /// @dev all aUSDC yield from AAVE goes to the senior vault
    /// @dev deducts junior vault usdc (swapped + unhedged glp) from overall balance
    /// @return usdcAmount borrowed from senior tranche
    function getUsdcBorrowed() public view returns (uint256 usdcAmount) {
        return
            uint256(
                state.aUsdc.balanceOf(address(this)).toInt256() -
                    state.dnUsdcDeposited -
                    state.unhedgedGlpInUsdc.toInt256()
            );
    }

    /// @notice returns maximum amount of shares that a user can deposit
    /// @return maximum asset amount
    function maxDeposit(address) public view override(IERC4626, ERC4626Upgradeable) returns (uint256) {
        uint256 depositCap = state.depositCap;
        uint256 totalAssets = state.totalAssets(true);
        return depositCap > totalAssets ? depositCap - totalAssets : 0;
    }

    /// @notice returns maximum amount of shares that can be minted for a given user
    /// @param receiver address of the user
    /// @return maximum share amount
    function maxMint(address receiver) public view override(IERC4626, ERC4626Upgradeable) returns (uint256) {
        return convertToShares(maxDeposit(receiver));
    }

    /// @notice converts asset amount to share amount
    /// @param assets asset amount to convert to shares
    /// @return share amount corresponding to given asset amount
    function convertToShares(uint256 assets) public view override(IERC4626, ERC4626Upgradeable) returns (uint256) {
        uint256 supply = totalSupply(); // Saves an extra SLOAD if totalSupply is non-zero.

        return supply == 0 ? assets : assets.mulDivDown(supply, state.totalAssets(true));
    }

    /// @notice converts share amount to asset amount
    /// @param shares asset amount to convert to assets
    /// @return asset amount corresponding to given share amount
    function convertToAssets(uint256 shares) public view override(IERC4626, ERC4626Upgradeable) returns (uint256) {
        uint256 supply = totalSupply(); // Saves an extra SLOAD if totalSupply is non-zero.

        return supply == 0 ? shares : shares.mulDivDown(state.totalAssets(false), supply);
    }

    /// @notice preview function for minting of shares
    /// @param shares number of shares to mint
    /// @return assets that would be taken from the user
    function previewMint(uint256 shares) public view override(IERC4626, ERC4626Upgradeable) returns (uint256) {
        uint256 supply = totalSupply(); // Saves an extra SLOAD if totalSupply is non-zero.

        return supply == 0 ? shares : shares.mulDivUp(state.totalAssets(true), supply);
    }

    /// @notice preview function for withdrawal of assets
    /// @param assets that would be given to the user
    /// @return shares that would be burnt
    function previewWithdraw(uint256 assets) public view override(IERC4626, ERC4626Upgradeable) returns (uint256) {
        uint256 supply = totalSupply(); // Saves an extra SLOAD if totalSupply is non-zero.

        return
            supply == 0
                ? assets
                : assets.mulDivUp(supply * MAX_BPS, state.totalAssets(false) * (MAX_BPS - state.withdrawFeeBps));
    }

    /// @notice preview function for redeeming shares
    /// @param shares that would be taken from the user
    /// @return assets that user would get
    function previewRedeem(uint256 shares) public view override(IERC4626, ERC4626Upgradeable) returns (uint256) {
        uint256 supply = totalSupply(); // Saves an extra SLOAD if totalSupply is non-zero.

        return
            supply == 0
                ? shares
                : shares.mulDivDown(state.totalAssets(false) * (MAX_BPS - state.withdrawFeeBps), supply * MAX_BPS);
    }

    /// @notice returns deposit cap in terms of asset tokens
    function depositCap() external view returns (uint256) {
        return state.depositCap;
    }

    /// @notice returns current borrows for BTC and ETH respectively
    /// @return currentBtcBorrow amount of btc borrowed from AAVE
    /// @return currentEthBorrow amount of eth borrowed from AAVE
    function getCurrentBorrows() external view returns (uint256 currentBtcBorrow, uint256 currentEthBorrow) {
        return state.getCurrentBorrows();
    }

    /// @notice returns optimal borrows for BTC and ETH respectively basis glpDeposited amount
    /// @param glpDeposited amount of glp for which optimal borrow needs to be calculated
    /// @return optimalBtcBorrow optimal amount of btc borrowed from AAVE
    /// @return optimalEthBorrow optimal amount of eth borrowed from AAVE
    function getOptimalBorrows(uint256 glpDeposited)
        external
        view
        returns (uint256 optimalBtcBorrow, uint256 optimalEthBorrow)
    {
        return state.getOptimalBorrows(glpDeposited);
    }

    /// @notice returns junior vault share of usdc deposited to AAVE
    function dnUsdcDeposited() external view returns (int256) {
        return state.dnUsdcDeposited;
    }

    function getAdminParams()
        external
        view
        returns (
            address keeper,
            IDnGmxSeniorVault dnGmxSeniorVault,
            uint256 depositCap,
            uint16 withdrawFeeBps,
            uint24 feeTierWethWbtcPool
        )
    {
        return (
            state.keeper,
            state.dnGmxSeniorVault,
            state.depositCap,
            state.withdrawFeeBps,
            state.feeTierWethWbtcPool
        );
    }

    function getThresholds()
        external
        view
        returns (
            uint16 slippageThresholdSwapBtcBps,
            uint16 slippageThresholdSwapEthBps,
            uint16 slippageThresholdGmxBps,
            uint128 usdcConversionThreshold,
            uint128 wethConversionThreshold,
            uint128 hedgeUsdcAmountThreshold,
            uint128 partialBtcHedgeUsdcAmountThreshold,
            uint128 partialEthHedgeUsdcAmountThreshold
        )
    {
        return (
            state.slippageThresholdSwapBtcBps,
            state.slippageThresholdSwapEthBps,
            state.slippageThresholdGmxBps,
            state.usdcConversionThreshold,
            state.wethConversionThreshold,
            state.hedgeUsdcAmountThreshold,
            state.partialBtcHedgeUsdcAmountThreshold,
            state.partialEthHedgeUsdcAmountThreshold
        );
    }

    function getRebalanceParams()
        external
        view
        returns (
            uint32 rebalanceTimeThreshold,
            uint16 rebalanceDeltaThresholdBps,
            uint16 rebalanceHfThresholdBps
        )
    {
        return (state.rebalanceTimeThreshold, state.rebalanceDeltaThresholdBps, state.rebalanceHfThresholdBps);
    }

    function getHedgeParams()
        external
        view
        returns (
            IBalancerVault balancerVault,
            ISwapRouter swapRouter,
            uint256 targetHealthFactor,
            IRewardsController aaveRewardsController
        )
    {
        return (state.balancerVault, state.swapRouter, state.targetHealthFactor, state.aaveRewardsController);
    }

    /* ##################################################################
                            INTERNAL FUNCTIONS
    ################################################################## */

    /*
        DEPOSIT/WITHDRAW HELPERS
    */

    /// @notice harvests fees and rebalances profits before deposits and withdrawals
    /// @dev called first on any deposit/withdrawals
    function _rebalanceBeforeShareAllocation() internal {
        // harvest fees
        state.harvestFees();

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
        state.rebalanceHedge(currentBtc, currentEth, totalAssets() - assets, false);
    }

    function afterDeposit(
        uint256,
        uint256,
        address
    ) internal override {
        if (totalAssets() > state.depositCap) revert DepositCapExceeded();
        (uint256 currentBtc, uint256 currentEth) = state.getCurrentBorrows();

        //rebalance of hedge based on assets after deposit (after deposit assets)
        state.rebalanceHedge(currentBtc, currentEth, totalAssets(), false);
    }
}
