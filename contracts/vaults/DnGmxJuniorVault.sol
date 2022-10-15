// SPDX-License-Identifier: MIT

pragma solidity ^0.8.9;

import { WadRayMath } from '@aave/core-v3/contracts/protocol/libraries/math/WadRayMath.sol';
import { IPool } from '@aave/core-v3/contracts/interfaces/IPool.sol';
import { IAToken } from '@aave/core-v3/contracts/interfaces/IAToken.sol';
import { IPriceOracle } from '@aave/core-v3/contracts/interfaces/IPriceOracle.sol';
import { DataTypes } from '@aave/core-v3/contracts/protocol/libraries/types/DataTypes.sol';
import { IPoolAddressesProvider } from '@aave/core-v3/contracts/interfaces/IPoolAddressesProvider.sol';
import { ReserveConfiguration } from '@aave/core-v3/contracts/protocol/libraries/configuration/ReserveConfiguration.sol';
import { IRewardsController } from '@aave/periphery-v3/contracts/rewards/interfaces/IRewardsController.sol';

import { IERC20 } from '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import { IERC20Metadata } from '@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol';
import { SafeERC20 } from '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';
import { OwnableUpgradeable } from '@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol';
import { PausableUpgradeable } from '@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol';

import { FixedPointMathLib } from '@rari-capital/solmate/src/utils/FixedPointMathLib.sol';

import { FullMath } from '@uniswap/v3-core-0.8-support/contracts/libraries/FullMath.sol';
import { ISwapRouter } from '@uniswap/v3-periphery/contracts/interfaces/ISwapRouter.sol';

import { IVault } from '../interfaces/gmx/IVault.sol';
import { IGlpManager } from '../interfaces/gmx/IGlpManager.sol';
import { IStableSwap } from '../interfaces/curve/IStableSwap.sol';
import { ISGLPExtended } from '../interfaces/gmx/ISGLPExtended.sol';
import { IRewardRouterV2 } from '../interfaces/gmx/IRewardRouterV2.sol';
import { IRewardTracker } from '../interfaces/gmx/IRewardTracker.sol';
import { IVester } from '../interfaces/gmx/IVester.sol';
import { IBalancerVault } from '../interfaces/IBalancerVault.sol';
import { IDnGmxSeniorVault } from '../interfaces/IDnGmxSeniorVault.sol';
import { IDnGmxBatchingManager } from '../interfaces/IDnGmxBatchingManager.sol';

import { FeeSplitStrategy } from '../libraries/FeeSplitStrategy.sol';
import { SwapManager } from '../libraries/SwapManager.sol';
import { SafeCast } from '../libraries/SafeCast.sol';

import { ERC4626Upgradeable } from '../ERC4626/ERC4626Upgradeable.sol';
import { DnGmxJuniorVaultStorage, IDebtToken } from '../vaults/DnGmxJuniorVaultStorage.sol';

// import 'hardhat/console.sol';

contract DnGmxJuniorVault is ERC4626Upgradeable, OwnableUpgradeable, PausableUpgradeable, DnGmxJuniorVaultStorage {
    using SafeCast for uint256;

    using WadRayMath for uint256;
    using ReserveConfiguration for DataTypes.ReserveConfigurationMap;
    using SafeERC20 for IERC20Metadata;
    using FixedPointMathLib for uint256;

    error InvalidRebalance();
    error DepositCapExceeded();
    error OnlyKeeperAllowed(address msgSender, address authorisedKeeperAddress);

    error NotDnGmxSeniorVault();
    error NotBalancerVault();

    error ArraysLengthMismatch();
    error FlashloanNotInitiated();

    error InvalidFeeRecipient();

    event Rebalanced();
    event AllowancesGranted();

    event DnGmxSeniorVaultUpdated(address _dnGmxSeniorVault);
    event KeeperUpdated(address _newKeeper);
    event FeeRecipientUpdated(address _newFeeRecipient);
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

    modifier onlyKeeper() {
        if (msg.sender != keeper) revert OnlyKeeperAllowed(msg.sender, keeper);
        _;
    }

    modifier onlyDnGmxSeniorVault() {
        if (msg.sender != address(dnGmxSeniorVault)) revert NotDnGmxSeniorVault();
        _;
    }

    modifier whenFlashloaned() {
        if (!_hasFlashloaned) revert FlashloanNotInitiated();
        _;
    }

    modifier onlyBalancerVault() {
        if (msg.sender != address(balancerVault)) revert NotBalancerVault();
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
        Tokens calldata _tokens,
        IPoolAddressesProvider _poolAddressesProvider
    ) external initializer {
        __Ownable_init();
        __Pausable_init();
        __ERC4626Upgradeable_init(_tokens.sGlp, _name, _symbol);

        weth = _tokens.weth;
        wbtc = _tokens.wbtc;
        usdc = _tokens.usdc;
        usdt = _tokens.usdt;

        swapRouter = ISwapRouter(_swapRouter);
        rewardRouter = IRewardRouterV2(_rewardRouter);

        poolAddressProvider = _poolAddressesProvider;

        glp = IERC20Metadata(ISGLPExtended(address(asset)).glp());
        glpManager = IGlpManager(ISGLPExtended(address(asset)).glpManager());
        fsGlp = IERC20(ISGLPExtended(address(asset)).stakedGlpTracker());

        gmxVault = IVault(glpManager.vault());

        pool = IPool(poolAddressProvider.getPool());
        oracle = IPriceOracle(poolAddressProvider.getPriceOracle());

        aUsdc = IAToken(pool.getReserveData(address(usdc)).aTokenAddress);

        vWbtc = IDebtToken(pool.getReserveData(address(wbtc)).variableDebtTokenAddress);
        vWeth = IDebtToken(pool.getReserveData(address(weth)).variableDebtTokenAddress);
    }

    /* ##################################################################
                                ADMIN FUNCTIONS
    ################################################################## */

    function grantAllowances() external onlyOwner {
        address aavePool = address(pool);
        address swapRouter = address(swapRouter);

        wbtc.approve(aavePool, type(uint256).max);
        wbtc.approve(swapRouter, type(uint256).max);

        weth.approve(aavePool, type(uint256).max);
        weth.approve(swapRouter, type(uint256).max);
        weth.approve(address(batchingManager), type(uint256).max);

        usdc.approve(aavePool, type(uint256).max);
        usdc.approve(address(swapRouter), type(uint256).max);
        usdc.approve(address(batchingManager), type(uint256).max);

        aUsdc.approve(address(dnGmxSeniorVault), type(uint256).max);

        asset.approve(address(glpManager), type(uint256).max);

        emit AllowancesGranted();
    }

    function setAdminParams(
        address _newKeeper,
        address _dnGmxSeniorVault,
        uint256 _newDepositCap,
        address _batchingManager,
        uint256 _withdrawFeeBps
    ) external onlyOwner {
        keeper = _newKeeper;
        dnGmxSeniorVault = IDnGmxSeniorVault(_dnGmxSeniorVault);
        depositCap = _newDepositCap;
        batchingManager = IDnGmxBatchingManager(_batchingManager);
        withdrawFeeBps = _withdrawFeeBps;
    }

    function setThresholds(
        uint16 _slippageThresholdSwap,
        uint16 _slippageThresholdGmx,
        uint208 _usdcConversionThreshold,
        uint256 _hfThreshold,
        uint256 _wethConversionThreshold,
        uint256 _hedgeUsdcAmountThreshold
    ) external onlyOwner {
        slippageThresholdSwap = _slippageThresholdSwap;
        slippageThresholdGmx = _slippageThresholdGmx;
        usdcConversionThreshold = _usdcConversionThreshold;
        wethConversionThreshold = _wethConversionThreshold;
        hedgeUsdcAmountThreshold = _hedgeUsdcAmountThreshold;
        hfThreshold = _hfThreshold;
    }

    function setRebalanceParams(uint32 _rebalanceTimeThreshold, uint16 _rebalanceDeltaThreshold) external onlyOwner {
        rebalanceTimeThreshold = _rebalanceTimeThreshold;
        rebalanceDeltaThreshold = _rebalanceDeltaThreshold;
    }

    function setHedgeParams(
        IBalancerVault _vault,
        ISwapRouter _swapRouter,
        uint256 _targetHealthFactor,
        IRewardsController _aaveRewardsController
    ) external onlyOwner {
        balancerVault = _vault;
        swapRouter = _swapRouter;
        targetHealthFactor = _targetHealthFactor;
        aaveRewardsController = _aaveRewardsController;
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function setFeeRecipient(address _feeRecipient) external onlyOwner {
        if (feeRecipient != _feeRecipient) {
            feeRecipient = _feeRecipient;
        } else revert InvalidFeeRecipient();

        emit FeeRecipientUpdated(_feeRecipient);
    }

    /// @notice withdraw accumulated WETH fees
    function withdrawFees() external {
        uint256 amount = protocolFee;
        protocolFee = 0;
        weth.transfer(feeRecipient, amount);
        emit FeesWithdrawn(amount);
    }

    function unstakeAndVestEsGmx() external onlyOwner {
        rewardRouter.unstakeEsGmx(protocolEsGmx);
        IVester(rewardRouter.glpVester()).deposit(protocolEsGmx);
        protocolEsGmx = 0;
    }

    function stopVestAndStakeEsGmx() external onlyOwner {
        IVester(rewardRouter.glpVester()).withdraw();
        uint256 esGmxWithdrawn = IERC20(rewardRouter.esGmx()).balanceOf(address(this));
        rewardRouter.stakeEsGmx(esGmxWithdrawn);
        protocolEsGmx += esGmxWithdrawn;
    }

    function claimVestedGmx() external onlyOwner {
        uint256 gmxClaimed = IVester(rewardRouter.glpVester()).claim();

        //Transfer all of the gmx received to fee recipient
        IERC20Metadata(rewardRouter.gmx()).safeTransfer(feeRecipient, gmxClaimed);
    }

    /// @notice stakes the rewards from the staked Glp and claims WETH to buy glp
    function harvestFees() public {
        address esGmx = rewardRouter.esGmx();
        IRewardTracker sGmx = IRewardTracker(rewardRouter.stakedGmxTracker());

        uint256 sGmxPrevBalance = sGmx.depositBalances(address(this), esGmx);

        rewardRouter.handleRewards(
            false, // _shouldClaimGmx
            false, // _shouldStakeGmx
            true, // _shouldClaimEsGmx
            true, // _shouldStakeEsGmx
            true, // _shouldStakeMultiplierPoints
            true, // _shouldClaimWeth
            false // _shouldConvertWethToEth
        );

        uint256 sGmxHarvested = sGmx.depositBalances(address(this), esGmx) - sGmxPrevBalance;
        protocolEsGmx += sGmxHarvested.mulDivDown(FEE, MAX_BPS);
        // console.log('sGmxHarvested', sGmxHarvested);
        // console.log('protocolEsGmx', protocolEsGmx);

        // console.log('gmx balance', sGmx.depositBalances(address(this), rewardRouter.gmx()));
        uint256 wethHarvested = weth.balanceOf(address(this)) - protocolFee - seniorVaultWethRewards;
        // console.log('wethHarvested', wethHarvested);

        if (wethHarvested > wethConversionThreshold) {
            uint256 protocolFeeHarvested = (wethHarvested * FEE) / MAX_BPS;
            protocolFee += protocolFeeHarvested;

            uint256 wethToCompound = wethHarvested - protocolFeeHarvested;

            uint256 dnGmxSeniorVaultWethShare = dnGmxSeniorVault.getEthRewardsSplitRate().mulDivDown(
                wethToCompound,
                FeeSplitStrategy.RATE_PRECISION
            );
            uint256 dnGmxWethShare = wethToCompound - dnGmxSeniorVaultWethShare;

            uint256 _seniorVaultWethRewards = seniorVaultWethRewards + dnGmxSeniorVaultWethShare;

            // console.log('ethRewardsSplitRate', dnGmxSeniorVault.getEthRewardsSplitRate());
            // console.log('wethToCompound', wethToCompound);
            // console.log('dnGmxWethShare', dnGmxWethShare);
            // console.log('dnGmxSeniorVaultWethShare', dnGmxSeniorVaultWethShare);

            uint256 price = gmxVault.getMinPrice(address(weth));

            uint256 usdgAmount = dnGmxWethShare.mulDivDown(
                price * (MAX_BPS - slippageThresholdSwap),
                PRICE_PRECISION * MAX_BPS
            );

            // console.log('usdgAmount', usdgAmount);

            usdgAmount = usdgAmount.mulDivDown(10**USDG_DECIMALS, 10**WETH_DECIMALS);

            uint256 glpReceived = batchingManager.depositToken(address(weth), dnGmxWethShare, usdgAmount);

            // console.log('_seniorVaultWethRewards', _seniorVaultWethRewards);
            if (_seniorVaultWethRewards > wethConversionThreshold) {
                // Deposit aave vault share to AAVE in usdc
                uint256 minUsdcAmount = _getPrice(weth, true).mulDivDown(
                    _seniorVaultWethRewards * (MAX_BPS - slippageThresholdSwap),
                    MAX_BPS * PRICE_PRECISION
                );
                (uint256 aaveUsdcAmount, uint256 tokensUsed) = SwapManager.swapToken(
                    address(weth),
                    _seniorVaultWethRewards,
                    minUsdcAmount
                );
                tokensUsed; // silence warning
                _executeSupply(address(usdc), aaveUsdcAmount);
                seniorVaultWethRewards = 0;
                emit RewardsHarvested(
                    wethHarvested,
                    sGmxHarvested,
                    dnGmxWethShare,
                    dnGmxSeniorVaultWethShare,
                    glpReceived,
                    aaveUsdcAmount
                );
            } else {
                seniorVaultWethRewards = _seniorVaultWethRewards;
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
        return _isValidRebalanceTime() || _isValidRebalanceDeviation() || _isValidRebalanceHF();
    }

    /* solhint-disable not-rely-on-time */
    function rebalance() external onlyKeeper {
        if (!isValidRebalance()) revert InvalidRebalance();

        // harvest fees
        harvestFees();

        (uint256 currentBtc, uint256 currentEth) = _getCurrentBorrows();
        uint256 totalCurrentBorrowValue = _getBorrowValue(currentBtc, currentEth); // = total position value of current btc and eth position

        // rebalance profit
        _rebalanceProfit(totalCurrentBorrowValue);

        // console.log('currentBtc', currentBtc);
        // console.log('currentEth', currentEth);
        // console.log('totalAssets()', totalAssets());
        // console.log('totalCurrentBorrowValue', totalCurrentBorrowValue);

        // calculate current btc and eth positions in GLP
        // get the position value and calculate the collateral needed to borrow that
        // transfer collateral from LB vault to DN vault
        _rebalanceHedge(currentBtc, currentEth, totalAssets());

        lastRebalanceTS = uint64(block.timestamp);
        emit Rebalanced();
    }

    /* ##################################################################
                                USER FUNCTIONS
    ################################################################## */

    function deposit(uint256 amount, address to) public virtual override whenNotPaused returns (uint256 shares) {
        _rebalanceBeforeShareAllocation();
        shares = super.deposit(amount, to);
    }

    function mint(uint256 shares, address to) public virtual override whenNotPaused returns (uint256 amount) {
        _rebalanceBeforeShareAllocation();
        amount = super.mint(shares, to);
    }

    function withdraw(
        uint256 assets,
        address receiver,
        address owner
    ) public override whenNotPaused returns (uint256 shares) {
        _rebalanceBeforeShareAllocation();
        shares = previewWithdraw(assets); // No need to check for rounding error, previewWithdraw rounds up.

        if (msg.sender != owner) {
            uint256 allowed = allowance(owner, msg.sender); // Saves gas for limited approvals.

            if (allowed != type(uint256).max) _approve(owner, msg.sender, allowed - shares);
        }
        uint256 assetsAfterFees = assets.mulDivDown(MAX_BPS - withdrawFeeBps, MAX_BPS);

        beforeWithdraw(assetsAfterFees, shares, receiver);

        _burn(owner, shares);

        emit Withdraw(msg.sender, receiver, owner, assetsAfterFees, shares);

        asset.safeTransfer(receiver, assetsAfterFees);
    }

    function redeem(
        uint256 shares,
        address receiver,
        address owner
    ) public override whenNotPaused returns (uint256 assets) {
        _rebalanceBeforeShareAllocation();

        if (msg.sender != owner) {
            uint256 allowed = allowance(owner, msg.sender); // Saves gas for limited approvals.

            if (allowed != type(uint256).max) _approve(owner, msg.sender, allowed - shares);
        }

        // Check for rounding error since we round down in previewRedeem.
        require((assets = previewRedeem(shares)) != 0, 'ZERO_ASSETS');

        uint256 assetsAfterFees = assets.mulDivDown(MAX_BPS - withdrawFeeBps, MAX_BPS);

        beforeWithdraw(assetsAfterFees, shares, receiver);

        _burn(owner, shares);

        emit Withdraw(msg.sender, receiver, owner, assetsAfterFees, shares);

        // console.log('assets bal', fsGlp.balanceOf(address(this)));
        // console.log('withdrawing', assets);
        // console.log('assetsAfterFees', assetsAfterFees);
        // console.log('batchingManager.dnGmxJuniorVaultGlpBalance()', batchingManager.dnGmxJuniorVaultGlpBalance());

        asset.safeTransfer(receiver, assetsAfterFees);
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
            if (repayDebtBtc ? tokens[0] == usdc : tokens[0] == wbtc) btcFirst = true;
            btcAssetPremium = feeAmounts[btcFirst ? 0 : 1];
            ethAssetPremium = feeAmounts[btcFirst ? 1 : 0];
        } else {
            // console.log('CASE 3');

            if (btcTokenAmount != 0) btcAssetPremium = feeAmounts[0];
            else ethAssetPremium = feeAmounts[0];
        }

        if (btcTokenAmount > 0)
            _executeOperationToken(address(wbtc), btcTokenAmount, btcUsdcAmount, btcAssetPremium, repayDebtBtc);
        if (ethTokenAmount > 0)
            _executeOperationToken(address(weth), ethTokenAmount, ethUsdcAmount, ethAssetPremium, repayDebtEth);
    }

    /* ##################################################################
                                VIEW FUNCTIONS
    ################################################################## */

    function totalAssets() public view override returns (uint256) {
        return _totalAssets(false);
    }

    function getPrice(bool maximize) public view returns (uint256) {
        uint256 aum = glpManager.getAum(maximize);
        uint256 totalSupply = glp.totalSupply();

        return aum.mulDivDown(PRICE_PRECISION, totalSupply * 1e24);
    }

    function getPriceX128() public view returns (uint256) {
        uint256 aum = glpManager.getAum(false);
        uint256 totalSupply = glp.totalSupply();

        return aum.mulDivDown(1 << 128, totalSupply * 1e24);
    }

    function getMarketValue(uint256 assetAmount) public view returns (uint256 marketValue) {
        marketValue = assetAmount.mulDivDown(getPrice(false), PRICE_PRECISION);
    }

    function getVaultMarketValue() public view returns (int256 vaultMarketValue) {
        (uint256 currentBtc, uint256 currentEth) = _getCurrentBorrows();
        uint256 totalCurrentBorrowValue = _getBorrowValue(currentBtc, currentEth);
        uint256 glpBalance = fsGlp.balanceOf(address(this)) + batchingManager.dnGmxJuniorVaultGlpBalance();
        vaultMarketValue = ((getMarketValue(glpBalance).toInt256() + dnUsdcDeposited + unhedgedGlpInUsdc.toInt256()) -
            totalCurrentBorrowValue.toInt256());
    }

    function getUsdcBorrowed() public view returns (uint256 usdcAmount) {
        return uint256(aUsdc.balanceOf(address(this)).toInt256() - dnUsdcDeposited - unhedgedGlpInUsdc.toInt256());
    }

    function maxDeposit(address) public view override returns (uint256) {
        return depositCap - _totalAssets(true);
    }

    function maxMint(address receiver) public view override returns (uint256) {
        return convertToShares(maxDeposit(receiver));
    }

    function convertToShares(uint256 assets) public view override returns (uint256) {
        uint256 supply = totalSupply(); // Saves an extra SLOAD if totalSupply is non-zero.

        return supply == 0 ? assets : assets.mulDivDown(supply, _totalAssets(true));
    }

    function convertToAssets(uint256 shares) public view override returns (uint256) {
        uint256 supply = totalSupply(); // Saves an extra SLOAD if totalSupply is non-zero.

        return supply == 0 ? shares : shares.mulDivDown(_totalAssets(false), supply);
    }

    function previewMint(uint256 shares) public view override returns (uint256) {
        uint256 supply = totalSupply(); // Saves an extra SLOAD if totalSupply is non-zero.

        return supply == 0 ? shares : shares.mulDivUp(_totalAssets(true), supply);
    }

    function previewWithdraw(uint256 assets) public view override returns (uint256) {
        uint256 supply = totalSupply(); // Saves an extra SLOAD if totalSupply is non-zero.

        return supply == 0 ? assets : assets.mulDivUp(supply, _totalAssets(false));
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

        (uint256 currentBtc, uint256 currentEth) = _getCurrentBorrows();
        uint256 totalCurrentBorrowValue = _getBorrowValue(currentBtc, currentEth); // = total position value of current btc and eth position

        // rebalance profit
        _rebalanceProfit(totalCurrentBorrowValue);
    }

    function beforeWithdraw(
        uint256 assets,
        uint256,
        address
    ) internal override {
        (uint256 currentBtc, uint256 currentEth) = _getCurrentBorrows();

        //rebalance of hedge based on assets after withdraw (before withdraw assets - withdrawn assets)
        _rebalanceHedge(currentBtc, currentEth, totalAssets() - assets);
    }

    function afterDeposit(
        uint256,
        uint256,
        address
    ) internal override {
        if (totalAssets() > depositCap) revert DepositCapExceeded();
        (uint256 currentBtc, uint256 currentEth) = _getCurrentBorrows();
        // console.log('currentBtc', currentBtc);
        // console.log('currentEth', currentEth);
        // console.log('totalAssets()', totalAssets());

        //rebalance of hedge based on assets after deposit (after deposit assets)
        _rebalanceHedge(currentBtc, currentEth, totalAssets());
    }

    /*
        REBALANCE HELPERS
    */

    function _rebalanceProfit(uint256 borrowValue) internal {
        int256 borrowVal = borrowValue.toInt256();

        // console.log('borrowVal');
        // console.logInt(borrowVal);
        // console.log('dnUsdcDeposited');
        // console.logInt(dnUsdcDeposited);

        if (borrowVal > dnUsdcDeposited) {
            // If glp goes up - there is profit on GMX and loss on AAVE
            // So convert some glp to usdc and deposit to AAVE
            dnUsdcDeposited += _convertAssetToAUsdc(uint256(borrowVal - dnUsdcDeposited)).toInt256();
        } else if (borrowVal < dnUsdcDeposited) {
            // If glp goes down - there is profit on AAVE and loss on GMX
            // So withdraw some aave usdc and convert to glp
            _convertAUsdcToAsset(uint256(dnUsdcDeposited - borrowVal));
            dnUsdcDeposited = borrowVal;
        }
    }

    function _rebalanceBorrow(
        uint256 optimalBtcBorrow,
        uint256 currentBtcBorrow,
        uint256 optimalEthBorrow,
        uint256 currentEthBorrow
    ) internal {
        address[] memory assets;
        uint256[] memory amounts;

        (uint256 btcTokenAmount, uint256 btcUsdcAmount, bool repayDebtBtc) = _flashloanAmounts(
            address(wbtc),
            optimalBtcBorrow,
            currentBtcBorrow
        );
        (uint256 ethTokenAmount, uint256 ethUsdcAmount, bool repayDebtEth) = _flashloanAmounts(
            address(weth),
            optimalEthBorrow,
            currentEthBorrow
        );

        // console.log('repayDebtBtc', repayDebtBtc);
        // console.log('repayDebtEth', repayDebtEth);

        // console.log('btcTokenAmount', btcTokenAmount);
        // console.log('btcUsdcAmount', btcUsdcAmount);
        // console.log('ethTokenAmount', ethTokenAmount);
        // console.log('ethUsdcAmount', ethUsdcAmount);
        // console.log('hedgeUsdcAmountThreshold', hedgeUsdcAmountThreshold);

        if (btcUsdcAmount < hedgeUsdcAmountThreshold) {
            // console.log('BTC Below Threshold');
            btcTokenAmount = 0;
            btcUsdcAmount = 0;
        }
        if (ethUsdcAmount < hedgeUsdcAmountThreshold) {
            // console.log('ETH Below Threshold');
            ethTokenAmount = 0;
            ethUsdcAmount = 0;
        }

        // console.log('btcBeyondThreshold', btcBeyondThreshold);
        // console.log('ethBeyondThreshold', ethBeyondThreshold);

        uint256 btcAssetAmount = repayDebtBtc ? btcUsdcAmount : btcTokenAmount;
        uint256 ethAssetAmount = repayDebtEth ? ethUsdcAmount : ethTokenAmount;

        // If both eth and btc swap amounts are not beyond the threshold then no flashloan needs to be executed | case 1
        if (btcAssetAmount == 0 && ethAssetAmount == 0) return;

        if (repayDebtBtc && repayDebtEth) {
            // console.log('### BOTH REPAY CASE ###');
            assets = new address[](1);
            amounts = new uint256[](1);

            assets[0] = address(usdc);
            amounts[0] = (btcAssetAmount + ethAssetAmount);
            // console.log('asset[0] from if', assets[0]);
            // console.log('amounts[0] from if', amounts[0]);
        } else if (btcAssetAmount == 0 || ethAssetAmount == 0) {
            // Exactly one would be true since case-1 excluded (both false) | case-2
            // console.log('### CASE-2 ###');
            assets = new address[](1);
            amounts = new uint256[](1);

            if (btcAssetAmount == 0) {
                assets[0] = (repayDebtBtc ? address(usdc) : address(wbtc));
                amounts[0] = btcAssetAmount;
            } else {
                assets[0] = (repayDebtEth ? address(usdc) : address(weth));
                amounts[0] = ethAssetAmount;
            }
        } else {
            // console.log('### CASE-3 ###');
            // Both are true | case-3
            assets = new address[](2);
            amounts = new uint256[](2);

            assets[0] = repayDebtBtc ? address(usdc) : address(wbtc);
            // console.log('assets[0]', assets[0]);
            assets[1] = repayDebtEth ? address(usdc) : address(weth);
            // console.log('assets[1]', assets[1]);

            // ensure that assets and amount tuples are in sorted order of addresses
            if (assets[0] > assets[1]) {
                address tempAsset = assets[0];
                assets[0] = assets[1];
                assets[1] = tempAsset;

                amounts[0] = ethAssetAmount;
                // console.log('amounts[0]', amounts[0]);
                amounts[1] = btcAssetAmount;
                // console.log('amounts[1]', amounts[1]);
            } else {
                amounts[0] = btcAssetAmount;
                // console.log('amounts[0]*', amounts[0]);
                amounts[1] = ethAssetAmount;
                // console.log('amounts[1]*', amounts[1]);
            }
        }
        _executeFlashloan(
            assets,
            amounts,
            btcTokenAmount,
            btcUsdcAmount,
            ethTokenAmount,
            ethUsdcAmount,
            repayDebtBtc,
            repayDebtEth
        );
    }

    /// @notice settles collateral for the vault
    /// @dev to be called after settle profits only (since vaultMarketValue if after settlement of profits)
    /// @param currentBtcBorrow The amount of USDC collateral token deposited to LB Protocol
    /// @param currentEthBorrow The market value of ETH/BTC part in sGLP
    function _rebalanceHedge(
        uint256 currentBtcBorrow,
        uint256 currentEthBorrow,
        uint256 glpDeposited
    ) internal {
        // console.log('totalAssets()', totalAssets());
        (uint256 optimalBtcBorrow, uint256 optimalEthBorrow) = _getOptimalBorrows(glpDeposited);
        // console.log('optimalBtcBorrow', optimalBtcBorrow);
        // console.log('optimalEthBorrow', optimalEthBorrow);

        uint256 optimalBorrowValue = _getBorrowValue(optimalBtcBorrow, optimalEthBorrow);
        // console.log('optimalBorrowValue', optimalBorrowValue);

        uint256 usdcLiquidationThreshold = _getLiquidationThreshold(address(usdc));

        // Settle net change in market value and deposit/withdraw collateral tokens
        // Vault market value is just the collateral value since profit has been settled
        uint256 targetDnGmxSeniorVaultAmount = (targetHealthFactor - usdcLiquidationThreshold).mulDivDown(
            optimalBorrowValue,
            usdcLiquidationThreshold
        );

        uint256 currentDnGmxSeniorVaultAmount = getUsdcBorrowed();

        // console.log('targetDnGmxSeniorVaultAmount', targetDnGmxSeniorVaultAmount);
        // console.log('currentDnGmxSeniorVaultAmount', currentDnGmxSeniorVaultAmount);
        // console.log(optimalBtcBorrow, currentBtcBorrow, optimalEthBorrow, currentEthBorrow);

        if (targetDnGmxSeniorVaultAmount > currentDnGmxSeniorVaultAmount) {
            // console.log('IF');
            uint256 amountToBorrow = targetDnGmxSeniorVaultAmount - currentDnGmxSeniorVaultAmount;
            uint256 availableBorrow = dnGmxSeniorVault.availableBorrow(address(this));
            if (amountToBorrow > availableBorrow) {
                uint256 optimalUncappedEthBorrow = optimalEthBorrow;
                (optimalBtcBorrow, optimalEthBorrow) = _getOptimalCappedBorrows(
                    currentDnGmxSeniorVaultAmount + availableBorrow,
                    usdcLiquidationThreshold
                );
                _rebalanceUnhedgedGlp(optimalUncappedEthBorrow, optimalEthBorrow);
                // console.log("Optimal token amounts 1",optimalBtcBorrow, optimalEthBorrow);
                if (availableBorrow > 0) {
                    dnGmxSeniorVault.borrow(availableBorrow);
                }
            } else {
                //No unhedged glp remaining so just pass same value in capped and uncapped (should convert back any ausdc back to sglp)
                _rebalanceUnhedgedGlp(optimalEthBorrow, optimalEthBorrow);

                // Take from LB Vault
                dnGmxSeniorVault.borrow(targetDnGmxSeniorVaultAmount - currentDnGmxSeniorVaultAmount);
            }

            // console.log("Optimal token amounts 2",optimalBtcBorrow, optimalEthBorrow);
            // Rebalance Position
            _rebalanceBorrow(optimalBtcBorrow, currentBtcBorrow, optimalEthBorrow, currentEthBorrow);
        } else {
            // console.log('ELSE');
            // Rebalance Position
            _rebalanceBorrow(optimalBtcBorrow, currentBtcBorrow, optimalEthBorrow, currentEthBorrow);
            uint256 totalCurrentBorrowValue;
            {
                (uint256 currentBtc, uint256 currentEth) = _getCurrentBorrows();
                totalCurrentBorrowValue = _getBorrowValue(currentBtc, currentEth);
            }
            _rebalanceProfit(totalCurrentBorrowValue);
            // Deposit to LB Vault
            // console.log('dnUsdcDeposited');
            // console.logInt(dnUsdcDeposited);
            // console.log('ausdc bal', aUsdc.balanceOf(address(this)));
            dnGmxSeniorVault.repay(currentDnGmxSeniorVaultAmount - targetDnGmxSeniorVaultAmount);
        }
    }

    /// @notice withdraws LP tokens from gauge, sells LP token for usdc
    /// @param usdcAmountDesired amount of USDC desired
    function _convertAssetToAUsdc(uint256 usdcAmountDesired) internal returns (uint256 usdcAmount) {
        /// @dev if usdcAmountDesired < 10, then there is precision issue in gmx contracts while redeeming for usdg
        if (usdcAmountDesired < usdcConversionThreshold) return 0;
        uint256 glpAmountDesired = usdcAmountDesired.mulDivDown(PRICE_PRECISION, getPrice(false));
        // USDG has 18 decimals and usdc has 6 decimals => 18-6 = 12
        // console.log('GLP PRICE: ', getPrice());
        // console.log('glpAmountDesired', glpAmountDesired);
        // console.log('TA', totalAssets());
        rewardRouter.unstakeAndRedeemGlp(
            address(usdc),
            glpAmountDesired, // glp amount
            usdcAmountDesired.mulDivDown(MAX_BPS - slippageThresholdGmx, MAX_BPS), // usdc
            address(this)
        );

        usdcAmount = usdc.balanceOf(address(this));

        _executeSupply(address(usdc), usdcAmount);
    }

    /// @notice sells usdc for LP tokens and then stakes LP tokens
    /// @param amount amount of usdc
    function _convertAUsdcToAsset(uint256 amount) internal {
        _executeWithdraw(address(usdc), amount, address(this));
        // USDG has 18 decimals and usdc has 6 decimals => 18-6 = 12
        uint256 price = gmxVault.getMinPrice(address(usdc));
        uint256 usdgAmount = amount.mulDivDown(price * (MAX_BPS - slippageThresholdGmx), PRICE_PRECISION * MAX_BPS);

        usdgAmount = usdgAmount.mulDivDown(10**USDG_DECIMALS, 10**IERC20Metadata(address(usdc)).decimals());

        batchingManager.depositToken(address(usdc), amount, usdgAmount);
    }

    function _rebalanceUnhedgedGlp(uint256 uncappedTokenHedge, uint256 cappedTokenHedge) internal {
        // console.log('uncappedTokenHedge',uncappedTokenHedge);
        // console.log('cappedTokenHedge',cappedTokenHedge);
        // console.log('totalAssets',totalAssets());

        uint256 unhedgedGlp = totalAssets().mulDivDown(uncappedTokenHedge - cappedTokenHedge, uncappedTokenHedge);
        uint256 unhedgedGlpUsdcAmount = unhedgedGlp.mulDivDown(getPrice(false), PRICE_PRECISION);
        // console.log('unhedgedGlp',unhedgedGlp);
        // console.log('unhedgedGlpUsdcAmount',unhedgedGlpUsdcAmount);
        if (unhedgedGlpUsdcAmount > unhedgedGlpInUsdc) {
            uint256 glpToUsdcAmount = unhedgedGlpUsdcAmount - unhedgedGlpInUsdc;
            unhedgedGlpInUsdc += _convertAssetToAUsdc(glpToUsdcAmount);
        } else if (unhedgedGlpUsdcAmount < unhedgedGlpInUsdc) {
            uint256 usdcToGlpAmount = unhedgedGlpInUsdc - unhedgedGlpUsdcAmount;
            unhedgedGlpInUsdc -= usdcToGlpAmount;
            _convertAUsdcToAsset(usdcToGlpAmount);
        }
    }

    /*
        AAVE HELPERS
    */

    function _executeBorrow(address token, uint256 amount) internal {
        pool.borrow(token, amount, VARIABLE_INTEREST_MODE, 0, address(this));
    }

    function _executeRepay(address token, uint256 amount) internal {
        pool.repay(token, amount, VARIABLE_INTEREST_MODE, address(this));
    }

    function _executeSupply(address token, uint256 amount) internal {
        pool.supply(token, amount, address(this), 0);
    }

    function _executeWithdraw(
        address token,
        uint256 amount,
        address receiver
    ) internal {
        pool.withdraw(token, amount, receiver);
    }

    function _getLiquidationThreshold(address asset) internal view returns (uint256) {
        DataTypes.ReserveConfigurationMap memory config = pool.getConfiguration(asset);
        (
            ,
            /** uint256 ltv **/
            uint256 liquidationThreshold, /** uint256 liquidationBonus */ /** uint256 decimals */ /** uint256 reserveFactor */
            ,
            ,
            ,

        ) = config.getParams();

        return liquidationThreshold;
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
            (uint256 usdcReceived, uint256 tokensUsed) = SwapManager.swapToken(token, tokenAmount, usdcAmount);
            tokensUsed; // silence warning
            _executeSupply(address(usdc), usdcReceived);
            _executeBorrow(token, amountWithPremium);
            IERC20(token).transfer(address(balancerVault), amountWithPremium);
            dnUsdcDeposited += usdcReceived.toInt256();
        } else {
            // console.log('swapUSDCToToken');
            (uint256 usdcPaid, uint256 tokensReceived) = SwapManager.swapUSDC(token, tokenAmount, usdcAmount);
            uint256 amountWithPremium = usdcPaid + premium;
            // console.log('amountWithPremium', amountWithPremium, token);
            dnUsdcDeposited -= amountWithPremium.toInt256();
            // console.log('tokensReceived', tokensReceived);
            _executeRepay(token, tokensReceived);
            //withdraws to balancerVault
            _executeWithdraw(address(usdc), amountWithPremium, address(this));
            usdc.transfer(address(balancerVault), usdcAmount + premium);
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

        _hasFlashloaned = true;

        balancerVault.flashLoan(
            address(this),
            assets,
            amounts,
            abi.encode(_btcTokenAmount, _btcUsdcAmount, _ethTokenAmount, _ethUsdcAmount, _repayDebtBtc, _repayDebtEth)
        );

        _hasFlashloaned = false;
    }

    /* ##################################################################
                            INTERNAL VIEW FUNCTIONS
    ################################################################## */

    function _totalAssets(bool maximize) internal view returns (uint256) {
        uint256 unhedgedGlp = unhedgedGlpInUsdc.mulDivDown(PRICE_PRECISION, getPrice(!maximize));
        if (!maximize) unhedgedGlp = unhedgedGlp.mulDivDown(MAX_BPS - slippageThresholdGmx, MAX_BPS);
        return fsGlp.balanceOf(address(this)) + batchingManager.dnGmxJuniorVaultGlpBalance() + unhedgedGlp;
    }

    /* solhint-disable not-rely-on-time */
    function _isValidRebalanceTime() internal view returns (bool) {
        return (block.timestamp - lastRebalanceTS) > rebalanceTimeThreshold;
    }

    function _isValidRebalanceHF() internal view returns (bool) {
        (, , , , , uint256 healthFactor) = pool.getUserAccountData(address(this));
        // console.log('healthFactor', healthFactor);
        // console.log('hfThreshold', hfThreshold);

        return healthFactor < (hfThreshold * 1e14);
    }

    function _isValidRebalanceDeviation() internal view returns (bool) {
        (uint256 currentBtcBorrow, uint256 currentEthBorrow) = _getCurrentBorrows();

        (uint256 optimalBtcBorrow, uint256 optimalEthBorrow) = _getOptimalBorrows(totalAssets());

        return
            !(_isWithinAllowedDelta(optimalBtcBorrow, currentBtcBorrow) &&
                _isWithinAllowedDelta(optimalEthBorrow, currentEthBorrow));
    }

    function _getPrice(IERC20Metadata token) internal view returns (uint256) {
        uint256 decimals = token.decimals();
        uint256 price = oracle.getAssetPrice(address(token));

        // @dev aave returns from same source as chainlink (which is 8 decimals)
        return price.mulDivDown(PRICE_PRECISION, 10**(decimals + 2));
    }

    // @dev returns price in terms of usdc
    function _getPrice(IERC20Metadata token, bool isUsdc) internal view returns (uint256 scaledPrice) {
        uint256 decimals = token.decimals();
        uint256 price = oracle.getAssetPrice(address(token));

        // @dev aave returns from same source as chainlink (which is 8 decimals)
        uint256 quotePrice;

        isUsdc ? quotePrice = oracle.getAssetPrice(address(usdc)) : quotePrice = oracle.getAssetPrice(address(usdt));

        scaledPrice = price.mulDivDown(PRICE_PRECISION, quotePrice * 10**(decimals - 6));
    }

    /// @dev returns the borrow value in USDC
    function _getBorrowValue(uint256 btcAmount, uint256 ethAmount) internal view returns (uint256 borrowValue) {
        borrowValue =
            btcAmount.mulDivDown(_getPrice(wbtc), PRICE_PRECISION) +
            ethAmount.mulDivDown(_getPrice(weth), PRICE_PRECISION);
        borrowValue = borrowValue.mulDivDown(PRICE_PRECISION, _getPrice(usdc));
    }

    function _flashloanAmounts(
        address token,
        uint256 optimalBorrow,
        uint256 currentBorrow
    )
        internal
        view
        returns (
            uint256 tokenAmount,
            uint256 usdcAmount,
            bool repayDebt
        )
    {
        // check the delta between optimal position and actual position in token terms
        // take that position using swap
        // To Increase
        if (optimalBorrow > currentBorrow) {
            tokenAmount = optimalBorrow - currentBorrow;
            // To swap with the amount in specified hence usdcAmount should be the min amount out
            usdcAmount = _getPrice(IERC20Metadata(token), true).mulDivDown(
                tokenAmount * (MAX_BPS - slippageThresholdSwap),
                MAX_BPS * PRICE_PRECISION
            );

            repayDebt = false;
            // Flash loan ETH/BTC from AAVE
            // In callback: Sell loan for USDC and repay debt
        } else {
            // To Decrease
            tokenAmount = (currentBorrow - optimalBorrow);
            // To swap with amount out specified hence usdcAmount should be the max amount in
            usdcAmount = _getPrice(IERC20Metadata(token), true).mulDivDown(
                tokenAmount * (MAX_BPS + slippageThresholdSwap),
                MAX_BPS * PRICE_PRECISION
            );
            // console.log('currentBorrow', currentBorrow);
            // console.log('optimalBorrow', optimalBorrow);
            // console.log('tokenAmount __', tokenAmount);
            // console.log('usdcAmount __', usdcAmount);

            repayDebt = true;
            // In callback: Swap to ETH/BTC and deposit to AAVE
            // Send back some aUSDC to LB vault
        }
    }

    function _getCurrentBorrows() internal view returns (uint256 currentBtcBorrow, uint256 currentEthBorrow) {
        return (vWbtc.balanceOf(address(this)), vWeth.balanceOf(address(this)));
    }

    function _getOptimalBorrows(uint256 glpDeposited)
        internal
        view
        returns (uint256 optimalBtcBorrow, uint256 optimalEthBorrow)
    {
        optimalBtcBorrow = _getTokenReservesInGlp(address(wbtc), glpDeposited);
        optimalEthBorrow = _getTokenReservesInGlp(address(weth), glpDeposited);
        // console.log('optimalEthBorrow', optimalEthBorrow);
        // console.log('optimalBtcBorrow', optimalBtcBorrow);
    }

    function _getOptimalCappedBorrows(uint256 availableBorrowAmount, uint256 usdcLiquidationThreshold)
        internal
        view
        returns (uint256 optimalBtcBorrow, uint256 optimalEthBorrow)
    {
        // console.log("availableBorrowAmount",availableBorrowAmount);

        uint256 maxBorrowValue = availableBorrowAmount.mulDivDown(
            usdcLiquidationThreshold,
            targetHealthFactor - usdcLiquidationThreshold
        );
        // console.log("maxBorrowValue",maxBorrowValue);

        uint256 btcWeight = gmxVault.tokenWeights(address(wbtc));
        uint256 ethWeight = gmxVault.tokenWeights(address(weth));
        // console.log("btcWeight",btcWeight);
        // console.log("ethWeight",ethWeight);

        uint256 btcPrice = _getPrice(wbtc);
        uint256 ethPrice = _getPrice(weth);

        optimalBtcBorrow = maxBorrowValue.mulDivDown(btcWeight * PRICE_PRECISION, (btcWeight + ethWeight) * btcPrice);
        optimalEthBorrow = maxBorrowValue.mulDivDown(ethWeight * PRICE_PRECISION, (btcWeight + ethWeight) * ethPrice);
        // console.log("optimalBtcBorrow",optimalBtcBorrow);
        // console.log("optimalEthBorrow",optimalEthBorrow);
    }

    function _getTokenReservesInGlp(address token, uint256 glpDeposited) internal view returns (uint256) {
        uint256 targetWeight = gmxVault.tokenWeights(token);
        uint256 totalTokenWeights = gmxVault.totalTokenWeights();

        uint256 glpPrice = getPrice(false);
        uint256 tokenPrice = _getPrice(IERC20Metadata(token));

        return targetWeight.mulDivDown(glpDeposited * glpPrice, totalTokenWeights * tokenPrice);
    }

    function _isWithinAllowedDelta(uint256 optimalBorrow, uint256 currentBorrow) internal view returns (bool) {
        // console.log('optimalBorrow', optimalBorrow);
        // console.log('currentBorrow', currentBorrow);

        uint256 diff = optimalBorrow > currentBorrow ? optimalBorrow - currentBorrow : currentBorrow - optimalBorrow;
        // console.log('diff', diff);
        // console.log('RHS', uint256(rebalanceDeltaThreshold).mulDivDown(currentBorrow, MAX_BPS));
        return diff <= uint256(rebalanceDeltaThreshold).mulDivDown(currentBorrow, MAX_BPS);
    }
}
