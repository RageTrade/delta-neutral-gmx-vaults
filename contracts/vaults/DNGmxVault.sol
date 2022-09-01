// SPDX-License-Identifier: MIT

pragma solidity ^0.8.9;

import { SafeCast } from 'contracts/libraries/SafeCast.sol';

import { ERC4626Upgradeable } from 'contracts/ERC4626/ERC4626Upgradeable.sol';

import { DNGmxVaultStorage } from 'contracts/vaults/DNGmxVaultStorage.sol';

import { SignedMath } from '@ragetrade/core/contracts/libraries/SignedMath.sol';
import { SignedFullMath } from '@ragetrade/core/contracts/libraries/SignedFullMath.sol';

import { FullMath } from '@uniswap/v3-core-0.8-support/contracts/libraries/FullMath.sol';
import { FixedPoint128 } from '@uniswap/v3-core-0.8-support/contracts/libraries/FixedPoint128.sol';

import { IVault } from 'contracts/interfaces/gmx/IVault.sol';
import { IGlpManager } from 'contracts/interfaces/gmx/IGlpManager.sol';
import { ISGLPExtended } from 'contracts/interfaces/gmx/ISGLPExtended.sol';
import { IRewardRouterV2 } from 'contracts/interfaces/gmx/IRewardRouterV2.sol';
import { IGlpStakingManager } from 'contracts/interfaces/gmx/IGlpStakingManager.sol';

import { ILPVault } from 'contracts/interfaces/ILPVault.sol';
import { ISwapRouter } from '@uniswap/v3-periphery/contracts/interfaces/ISwapRouter.sol';

import { IERC20 } from '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import { IERC20Metadata } from '@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol';

import { OwnableUpgradeable } from '@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol';
import { PausableUpgradeable } from '@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol';

contract DNGmxVault is ERC4626Upgradeable, OwnableUpgradeable, PausableUpgradeable, DNGmxVaultStorage {
    using FullMath for uint256;
    using SafeCast for uint256;

    using SignedMath for int256;
    using SignedFullMath for int256;

    error InvalidRebalance();
    error DepositCap(uint256 depositCap, uint256 depositAmount);
    error OnlyKeeperAllowed(address msgSender, address authorisedKeeperAddress);

    error ArraysLengthMismatch();
    error FlashloanNotInitiated();

    event Rebalanced();
    event AllowancesGranted();

    event KeeperUpdated(address _newKeeper);
    event DepositCapUpdated(uint256 _newDepositCap);
    event LPVaultUpdated(address _lpVault);
    event StakingManagerUpdated(address _stakingManager);

    event YieldParamsUpdated(uint16 indexed usdcReedemSlippage, uint240 indexed usdcConversionThreshold);
    event RebalanceParamsUpdated(uint32 indexed rebalanceTimeThreshold, uint16 indexed rebalanceDeltaThreshold);

    modifier onlyKeeper() {
        if (msg.sender != keeper) revert OnlyKeeperAllowed(msg.sender, keeper);
        _;
    }

    modifier onlyAavePool() {
        _;
    }

    modifier onlyAaveVault() {
        _;
    }

    function initialize(
        string calldata _name,
        string calldata _symbol,
        address _rewardRouter,
        TokenAddresses calldata _tokenAddrs
    ) external initializer {
        __Ownable_init();
        __Pausable_init();
        __ERC4626Upgradeable_init(IERC20Metadata(address(_tokenAddrs.sGlp)), _name, _symbol);

        weth = _tokenAddrs.weth;
        wbtc = _tokenAddrs.wbtc;
        usdc = _tokenAddrs.usdc;

        rewardRouter = IRewardRouterV2(_rewardRouter);

        glp = IERC20(ISGLPExtended(address(asset)).glp());
        fsGlp = IERC20(ISGLPExtended(address(asset)).stakedGlpTracker());
        glpManager = IGlpManager(ISGLPExtended(address(asset)).glpManager());

        gmxVault = IVault(glpManager.vault());
    }

    function grantAllowances() external onlyOwner {
        asset.approve(address(stakingManager), type(uint256).max);

        usdc.approve(address(stakingManager), type(uint256).max);

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

    function setLPVault(address _lpVault) external onlyOwner {
        lpVault = ILPVault(_lpVault);
        emit LPVaultUpdated(_lpVault);
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

    function _getBorrowValue(uint256 btcAmount, uint256 ethAmount) internal view returns (uint256 borrowValue) {
        borrowValue =
            btcAmount.mulDiv(getPriceX128(address(wbtc)), 1 << 128) +
            ethAmount.mulDiv(getPriceX128(address(weth)), 1 << 128);
    }

    function _rebalance(uint256 glpDeposited) internal {
        //harvest fees
        stakingManager.harvestFees();

        uint256 collateralDeposited; // = get collateral deposited to LB protocol
        (uint256 currentBtc, uint256 currentEth) = _getCurrentBorrows();
        uint256 totalCurrentBorrowValue = _getBorrowValue(currentBtc, currentEth); // = total position value of current btc and eth position
        uint256 totalOptimalBorrowValue; // = total position value of final btc and eth position

        //rebalance profit
        _rebalanceProfit(totalCurrentBorrowValue);

        //calculate current btc and eth positions in GLP
        //get the position value and calculate the collateral needed to borrow that
        //transfer collateral from LB vault to DN vault
        _rebalanceSupplyAndBorrow(collateralDeposited, totalOptimalBorrowValue);

        emit Rebalanced();
    }

    function rebalance() external onlyKeeper {
        if (!isValidRebalance()) revert InvalidRebalance();

        _rebalance(totalAssets());
    }

    function totalAssets() public view override returns (uint256) {
        return stakingManager.maxWithdraw(address(this));
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
        //TODO: include any other pnls
        vaultMarketValue = (getMarketValue(totalAssets())).toInt256();
    }

    function isValidRebalance() public view returns (bool) {
        return _isValidRebalanceTime() || _isValidRebalanceDeviation();
    }

    function _isValidRebalanceTime() internal view returns (bool) {
        return (block.timestamp - lastRebalanceTS) > rebalanceTimeThreshold;
    }

    function _isValidRebalanceDeviation() internal view returns (bool) {
        (uint256 currentBtcBorrow, uint256 currentEthBorrow) = _getCurrentBorrows();

        (uint256 optimalBtcBorrow, uint256 optimalEthBorrow) = _getOptimalBorrows(totalAssets());

        return
            !(_isWithinAllowedDelta(optimalEthBorrow, currentEthBorrow) &&
                _isWithinAllowedDelta(optimalBtcBorrow, currentBtcBorrow));
    }

    function _swapTokenToUSDC(address token, uint256 tokenAmount) internal returns (uint256 usdcAmount) {
        bytes memory path = abi.encodePacked(token, uint24(500), usdc);

        ISwapRouter.ExactInputParams memory params = ISwapRouter.ExactInputParams({
            path: path,
            amountIn: tokenAmount,
            amountOutMinimum: 0,
            recipient: address(this),
            deadline: block.timestamp
        });

        usdcAmount = swapRouter.exactInput(params);
    }

    function _swapUSDCToToken(address token, uint256 tokenAmount) internal returns (uint256 outputAmount) {
        bytes memory path = abi.encodePacked(usdc, uint24(500), token);

        ISwapRouter.ExactOutputParams memory params = ISwapRouter.ExactOutputParams({
            path: path,
            amountInMaximum: 0,
            amountOut: tokenAmount,
            recipient: address(this),
            deadline: block.timestamp
        });

        outputAmount = swapRouter.exactOutput(params);
    }

    function _executeFlashloan(
        address[] memory assets,
        uint256[] memory amounts,
        bool repayDebt
    ) internal {
        if (assets.length != amounts.length) revert ArraysLengthMismatch();

        uint256[] memory modes;
        for (uint256 i; i < assets.length; ++i) {
            modes[i] = VARIABLE_INTEREST_MODE;
        }

        pool.flashLoan(
            address(this), // receiverAddress
            assets, // assets
            amounts, // amounts
            modes, // interest modes
            address(this), // onBehalfOf
            abi.encodePacked(repayDebt), // params
            0 // referralCode
        );
    }

    function _executeRepay(address token, uint256 amount) internal {
        pool.repay(token, amount, VARIABLE_INTEREST_MODE, address(this));
    }

    function _executeSupply(address token, uint256 amount) internal {
        pool.supply(token, amount, address(this), 0);
    }

    function _executeWithdraw(address token, uint256 amount) internal {
        pool.withdraw(token, amount, address(this));
    }

    function executeOperation(
        address[] calldata assets,
        uint256[] calldata amounts,
        uint256[] calldata premiums,
        address initiator,
        bytes calldata params
    ) external onlyAavePool {
        if (initiator != address(this)) revert FlashloanNotInitiated();

        bool repayDebt = abi.decode(params, (bool));

        if (repayDebt) {
            uint256 usdcLoaned = amounts[0];
            // swap some portion to btc
            uint256 btcAmount = _swapUSDCToToken(address(wbtc), usdcLoaned / 2);
            // repay outstanding borrwed btc
            pool.repay(address(wbtc), btcAmount, VARIABLE_INTEREST_MODE, address(this));

            // swap some porition to eth
            uint256 wethAmount = _swapUSDCToToken(address(weth), usdcLoaned / 2);
            // repay outstanding borrowed eth
            pool.repay(address(weth), wethAmount, VARIABLE_INTEREST_MODE, address(this));

            return;
        }

        // sell btc for usdc
        uint256 usdcAmountBtc = _swapTokenToUSDC(assets[0], amounts[0]);
        // sell eth for usdc
        uint256 usdcAmountEth = _swapTokenToUSDC(assets[1], amounts[1]);
        // supply converted usdc as collateral
        pool.supply(address(usdc), usdcAmountBtc + usdcAmountEth, address(this), 0);
        // TODO: do something with received aUSDC, transfer to AaveVault?
    }

    function getPriceX128(address token) internal view returns (uint256) {
        //TODO: return price of the token (eth or btc)
    }

    function _flashloanAmounts(
        address token,
        uint256 optimalBorrow,
        uint256 currentBorrow
    ) internal view returns (uint256 amount, bool repayDebt) {
        // check the delta between optimal position and actual position in token terms
        // take that position using swap
        // To Increase
        if (optimalBorrow > currentBorrow) {
            amount = optimalBorrow - currentBorrow;
            repayDebt = false;
            // Flash loan ETH/BTC from AAVE
            // In callback: Sell loan for USDC and repay debt
        } else {
            // To Decrease
            amount = (currentBorrow - optimalBorrow).mulDiv(getPriceX128(token), 1 << 128);
            repayDebt = true;
            // In callback: Swap to ETH/BTC and deposit to AAVE
            // Send back some aUSDC to LB vault
        }
    }

    function _rebalanceProfit(uint256 borrowValue) internal {
        if (borrowValue > dnUsdcDeposited) {
            // If glp goes up - there is profit on GMX and loss on AAVE
            // So convert some glp to usdc and deposit to AAVE
            _convertAssetToAUsdc(borrowValue - dnUsdcDeposited);
        } else {
            // If glp goes down - there is profit on AAVE and loss on GMX
            // So withdraw some aave usdc and convert to glp
            _convertAUsdcToAsset(dnUsdcDeposited - borrowValue);
        }
    }

    function _rebalanceBorrow(
        uint256 btcOptimalBorrow,
        uint256 btcCurrentBorrow,
        uint256 ethOptimalBorrow,
        uint256 ethCurrentBorrow
    ) internal {
        address[] memory assets;
        uint256[] memory amounts;

        (uint256 btcAssetAmount, bool repayDebtBtc) = _flashloanAmounts(
            address(wbtc),
            btcOptimalBorrow,
            btcCurrentBorrow
        );
        (uint256 ethAssetAmount, bool repayDebtEth) = _flashloanAmounts(
            address(weth),
            ethOptimalBorrow,
            ethCurrentBorrow
        );

        if (repayDebtBtc && repayDebtEth) {
            assets = new address[](1);
            amounts = new uint256[](1);

            assets[0] = address(usdc);
            amounts[0] = (btcAssetAmount + ethAssetAmount);
        } else {
            assets[0] = repayDebtBtc ? address(usdc) : address(wbtc);
            assets[1] = repayDebtEth ? address(usdc) : address(weth);

            amounts[0] = btcAssetAmount;
            amounts[1] = ethAssetAmount;
        }

        _executeFlashloan(assets, amounts, repayDebtBtc && repayDebtEth);
    }

    function _getCurrentBorrows() internal view returns (uint256 currentBtcBorrow, uint256 currentEthBorrow) {
        //TODO: protodev - get current eth and btc borrow amounts;
    }

    //TODO: make this to use glpDeposited as input.
    function _getOptimalBorrows(uint256 glpDeposited)
        internal
        view
        returns (uint256 optimalBtcBorrow, uint256 optimalEthBorrow)
    {
        uint256 ethReservesOfGlp = _getTokenReservesInGlp(address(weth));
        uint256 btcReservesOfGlp = _getTokenReservesInGlp(address(wbtc));

        uint256 glpTotalSupply = asset.totalSupply();

        optimalEthBorrow = ethReservesOfGlp.mulDiv(glpDeposited, glpTotalSupply);
        optimalBtcBorrow = btcReservesOfGlp.mulDiv(glpDeposited, glpTotalSupply);
    }

    function _getTokenReservesInGlp(address token) internal view returns (uint256) {
        uint256 poolAmount = gmxVault.poolAmounts(token);
        uint256 reservedAmount = gmxVault.reservedAmounts(token);

        return (poolAmount - reservedAmount);
    }

    function _isWithinAllowedDelta(uint256 optimalBorrow, uint256 currentBorrow) internal view returns (bool) {
        uint256 diff = optimalBorrow > currentBorrow ? optimalBorrow - currentBorrow : currentBorrow - optimalBorrow;
        return diff < uint256(rebalanceDeltaThreshold).mulDiv(currentBorrow, MAX_BPS);
    }

    function beforeWithdraw(
        uint256 assets,
        uint256,
        address
    ) internal override {
        stakingManager.withdraw(assets, address(this), address(this));
        //TODO: add decrease of short (rebalance basis the final assets)
    }

    function afterDeposit(
        uint256 assets,
        uint256,
        address
    ) internal override {
        // TODO: add deposit cap in after deposit hook by querying from staking manager
        stakingManager.deposit(assets, address(this));
        //TODO: add increase of short (rebalance basis the final assets)
    }

    /// @notice settles collateral for the vault
    /// @dev to be called after settle profits only (since vaultMarketValue if after settlement of profits)
    /// @param supplyValue The amount of USDC collateral token deposited to LB Protocol
    /// @param borrowValue The market value of ETH/BTC part in sGLP
    function _rebalanceSupplyAndBorrow(uint256 supplyValue, uint256 borrowValue) internal {
        // Settle net change in market value and deposit/withdraw collateral tokens
        // Vault market value is just the collateral value since profit has been settled
        uint256 borrowValueDiff;
        if (borrowValue > supplyValue) {
            //TODO: normalize to get correct value of aUSDC amount to take from LB vault
            borrowValueDiff = borrowValue - supplyValue;

            // Take from LB Vault
            lpVault.borrow(borrowValueDiff);
            // Rebalance Position
            // _rebalanceBorrow();
        } else {
            //TODO: normalize to get correct value of aUSDC amount to take from LB vault
            borrowValueDiff = supplyValue - borrowValue;
            // Rebalance Position
            // _rebalanceBorrow();
            // Deposit to LB Vault
            lpVault.repay(borrowValueDiff);
        }
    }

    /// @notice withdraws LP tokens from gauge, sells LP token for usdc
    /// @param usdcAmountDesired amount of USDC desired
    function _convertAssetToAUsdc(uint256 usdcAmountDesired) internal returns (uint256 usdcAmount) {
        /// @dev if usdcAmountDesired < 10, then there is precision issue in gmx contracts while redeeming for usdg
        if (usdcAmountDesired < usdcConversionThreshold) return 0;
        uint256 glpAmountDesired = usdcAmountDesired.mulDiv(1 << 128, getPriceX128());
        // USDG has 18 decimals and usdc has 6 decimals => 18-6 = 12
        stakingManager.withdraw(glpAmountDesired, address(this), address(this));
        rewardRouter.unstakeAndRedeemGlp(
            address(usdc),
            glpAmountDesired, // glp amount
            usdcAmountDesired.mulDiv(usdcReedemSlippage, MAX_BPS), // usdc
            address(this)
        );

        usdcAmount = usdc.balanceOf(address(this));

        _executeSupply(address(usdc), usdcAmount);
    }

    /// @notice sells usdc for LP tokens and then stakes LP tokens
    /// @param amount amount of usdc
    function _convertAUsdcToAsset(uint256 amount) internal {
        _executeWithdraw(address(usdc), amount);
        //USDG has 18 decimals and usdc has 6 decimals => 18-6 = 12
        stakingManager.depositToken(address(usdc), amount);
    }

    //TODO: add withdrawToken and redeemToken functions
}
