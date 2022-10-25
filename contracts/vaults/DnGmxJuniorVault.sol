// SPDX-License-Identifier: MIT

pragma solidity ^0.8.9;

import { SafeCast } from '../libraries/SafeCast.sol';
import { FeeSplitStrategy } from '../libraries/FeeSplitStrategy.sol';
import { DnGmxJuniorVaultManager } from '../libraries/DnGmxJuniorVaultManager.sol';
import { FixedPointMathLib } from '@rari-capital/solmate/src/utils/FixedPointMathLib.sol';

import { IVault } from '../interfaces/gmx/IVault.sol';
import { IVester } from '../interfaces/gmx/IVester.sol';
import { IGlpManager } from '../interfaces/gmx/IGlpManager.sol';
import { ISglpExtended } from '../interfaces/gmx/ISglpExtended.sol';
import { IRewardTracker } from '../interfaces/gmx/IRewardTracker.sol';
import { IRewardRouterV2 } from '../interfaces/gmx/IRewardRouterV2.sol';

import { IDebtToken } from '../interfaces/IDebtToken.sol';
import { IPool } from '@aave/core-v3/contracts/interfaces/IPool.sol';
import { IAToken } from '@aave/core-v3/contracts/interfaces/IAToken.sol';
import { IPriceOracle } from '@aave/core-v3/contracts/interfaces/IPriceOracle.sol';
import { WadRayMath } from '@aave/core-v3/contracts/protocol/libraries/math/WadRayMath.sol';
import { IPoolAddressesProvider } from '@aave/core-v3/contracts/interfaces/IPoolAddressesProvider.sol';
import { IRewardsController } from '@aave/periphery-v3/contracts/rewards/interfaces/IRewardsController.sol';

import { IBalancerVault } from '../interfaces/balancer/IBalancerVault.sol';

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

        state.glp = IERC20Metadata(ISglpExtended(asset).glp());
        state.glpManager = IGlpManager(ISglpExtended(asset).glpManager());
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

    /// @notice set admin paramters
    /// @param newKeeper keeper address
    /// @param dnGmxSeniorVault senior vault address
    /// @param newDepositCap deposit cap
    /// @param batchingManager batching manager (responsible for staking tokens into GMX)
    /// @param withdrawFeeBps fees bps on withdrawals and redeems
    function setAdminParams(
        address newKeeper,
        address dnGmxSeniorVault,
        uint256 newDepositCap,
        address batchingManager,
        uint16 withdrawFeeBps
    ) external onlyOwner {
        state.keeper = newKeeper;
        state.dnGmxSeniorVault = IDnGmxSeniorVault(dnGmxSeniorVault);
        state.depositCap = newDepositCap;
        state.batchingManager = IDnGmxBatchingManager(batchingManager);
        state.withdrawFeeBps = withdrawFeeBps;
        emit AdminParamsUpdated(newKeeper, dnGmxSeniorVault, newDepositCap, batchingManager, withdrawFeeBps);
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

    /// @notice set rebalance paramters
    /// @param rebalanceTimeThreshold (seconds) minimum time difference required between two rebalance calls
    /// @dev a partial rebalance (rebalance where partial hedge gets taken) does not count
    /// @param rebalanceDeltaThresholdBps (BPS) threshold difference between optimal and current token hedges for triggering a rebalance
    /// @param rebalanceHfThresholdBps (BPS) threshold amount of health factor on AAVE below which a rebalance is triggered
    function setRebalanceParams(
        uint32 rebalanceTimeThreshold,
        uint16 rebalanceDeltaThresholdBps,
        uint16 rebalanceHfThresholdBps
    ) external onlyOwner {
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
        state.rewardRouter.unstakeEsGmx(state.protocolEsGmx);
        IVester(state.rewardRouter.glpVester()).deposit(state.protocolEsGmx);
        state.protocolEsGmx = 0;
    }

    /// @notice claims vested gmx tokens (i.e. stops vesting esGmx so that the relevant glp amount is unlocked)
    /// @dev when esGmx is vested some GlP tokens are locked on a pro-rata basis, in case that leads to issue in withdrawal this function can be called
    function stopVestAndStakeEsGmx() external onlyOwner {
        IVester(state.rewardRouter.glpVester()).withdraw();
        uint256 esGmxWithdrawn = IERC20(state.rewardRouter.esGmx()).balanceOf(address(this));
        state.rewardRouter.stakeEsGmx(esGmxWithdrawn);
        state.protocolEsGmx += esGmxWithdrawn;
    }

    /// @notice claims vested gmx tokens to feeRecipient
    /// @dev vested esGmx gets converted to GMX every second, so whatever amount is vested gets claimed
    function claimVestedGmx() external onlyOwner {
        uint256 gmxClaimed = IVester(state.rewardRouter.glpVester()).claim();

        //Transfer all of the gmx received to fee recipient
        IERC20Metadata(state.rewardRouter.gmx()).safeTransfer(state.feeRecipient, gmxClaimed);
    }

    /// @notice stakes the rewards from the staked Glp and claims WETH to buy glp
    /// @notice also update protocolEsGmx fees which can be vested and claimed
    /// @notice divides the fees between senior and junior tranches based on senior tranche util
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
                price * (MAX_BPS - state.slippageThresholdGmxBps),
                PRICE_PRECISION * MAX_BPS
            );

            uint256 glpReceived = state.batchingManager.depositToken(address(state.weth), dnGmxWethShare, usdgAmount);

            // console.log('_seniorVaultWethRewards', _seniorVaultWethRewards);
            if (_seniorVaultWethRewards > state.wethConversionThreshold) {
                // Deposit aave vault share to AAVE in usdc
                uint256 minUsdcAmount = state.getTokenPriceInUsdc(state.weth).mulDivDown(
                    _seniorVaultWethRewards * (MAX_BPS - state.slippageThresholdSwapEthBps),
                    MAX_BPS * PRICE_PRECISION
                );
                (uint256 aaveUsdcAmount, uint256 tokensUsed) = state.swapToken(
                    address(state.weth),
                    _seniorVaultWethRewards,
                    minUsdcAmount
                );
                tokensUsed; // silence warning
                state._executeSupply(address(state.usdc), aaveUsdcAmount);
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
    /// @notice checks if the rebalance can be run (3 thresholds - time, hedge deviation and AAVE HF )
    function isValidRebalance() public view returns (bool) {
        // console.log('_isValidRebalanceTime', _isValidRebalanceTime());
        // console.log('_isValidRebalanceDeviation', _isValidRebalanceDeviation());
        return state.isValidRebalanceTime() || state.isValidRebalanceDeviation() || state.isValidRebalanceHF();
    }

    /* solhint-disable not-rely-on-time */
    /// @notice harvests glp rewards & rebalances the hedge positions, profits on AAVE and Gmx.
    /// @notice run only if valid rebalance is true
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

        return aum.mulDivDown(1 << 128, totalSupply * 1e24);
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
        uint256 glpBalance = state.fsGlp.balanceOf(address(this)) + state.batchingManager.dnGmxJuniorVaultGlpBalance();
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
        return state.depositCap - state.totalAssets(true);
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

        return supply == 0 ? assets : assets.mulDivUp(supply, state.totalAssets(false));
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
            IDnGmxBatchingManager batchingManager,
            uint16 withdrawFeeBps
        )
    {
        return (state.keeper, state.dnGmxSeniorVault, state.depositCap, state.batchingManager, state.withdrawFeeBps);
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
        state.rebalanceHedge(currentBtc, currentEth, totalAssets() - assets, false);
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
        state.rebalanceHedge(currentBtc, currentEth, totalAssets(), false);
    }

    /*
        BALANCER HELPERS
    */

    ///@notice executes relevant token hedge update on receiving the flashloan from Balancer
    ///@dev if "repayDebt = true" then usdc flashloaned, swapped for token, repay token debt, withdraw usdc from AAVE and pay back usdc with premium
    ///@dev if "repayDebt = false" then token flashloaned, swapped for usdc, supply usdc, borrow tokens from AAVE and pay back tokens with premium
    ///@param token address of token to increase/decrease hedge by
    ///@param tokenAmount amount of tokens to swap
    ///@param usdcAmount if "repayDebt = false" then = minimum amount of usdc | if "repayDebt = true" then = maximum amount of usdc
    ///@param premium additional tokens/usdc to be repaid to balancer to cover flashloan fees
    ///@param repayDebt true if token hedge needs to be reduced
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
            state._executeSupply(address(state.usdc), usdcReceived);
            state._executeBorrow(token, amountWithPremium);
            IERC20(token).transfer(address(state.balancerVault), amountWithPremium);
            state.dnUsdcDeposited += usdcReceived.toInt256();
        } else {
            // console.log('swapUSDCToToken');
            (uint256 usdcPaid, uint256 tokensReceived) = state.swapUSDC(token, tokenAmount, usdcAmount);
            uint256 amountWithPremium = usdcPaid + premium;
            // console.log('amountWithPremium', amountWithPremium, token);
            state.dnUsdcDeposited -= amountWithPremium.toInt256();
            // console.log('tokensReceived', tokensReceived);
            state._executeRepay(token, tokensReceived);
            //withdraws to balancerVault
            state._executeWithdraw(address(state.usdc), amountWithPremium, address(this));
            state.usdc.transfer(address(state.balancerVault), usdcAmount + premium);
        }
    }
}
