// SPDX-License-Identifier: MIT

pragma solidity ^0.8.9;

import { SafeCast } from 'contracts/libraries/SafeCast.sol';
import { FullMath } from '@uniswap/v3-core-0.8-support/contracts/libraries/FullMath.sol';

import { DNGmxVaultStorage } from 'contracts/vaults/DNGmxVaultStorage.sol';
import { ERC4626Upgradeable } from 'contracts/ERC4626/ERC4626Upgradeable.sol';

import { IVault } from 'contracts/interfaces/gmx/IVault.sol';
import { IGlpManager } from 'contracts/interfaces/gmx/IGlpManager.sol';
import { ISGLPExtended } from 'contracts/interfaces/gmx/ISGLPExtended.sol';
import { IRewardRouterV2 } from 'contracts/interfaces/gmx/IRewardRouterV2.sol';
import { IGlpStakingManager } from 'contracts/interfaces/gmx/IGlpStakingManager.sol';

import { ILPVault } from 'contracts/interfaces/ILPVault.sol';
import { ISwapRouter } from '@uniswap/v3-periphery/contracts/interfaces/ISwapRouter.sol';

import { IBalancerVault } from 'contracts/interfaces/IBalancerVault.sol';

import { IERC20 } from '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import { IERC20Metadata } from '@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol';

import { OwnableUpgradeable } from '@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol';
import { PausableUpgradeable } from '@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol';

import { IPool } from '@aave/core-v3/contracts/interfaces/IPool.sol';
import { IAToken } from '@aave/core-v3/contracts/interfaces/IAToken.sol';
import { IPriceOracle } from '@aave/core-v3/contracts/interfaces/IPriceOracle.sol';
import { IPoolAddressesProvider } from '@aave/core-v3/contracts/interfaces/IPoolAddressesProvider.sol';

contract DNGmxVault is ERC4626Upgradeable, OwnableUpgradeable, PausableUpgradeable, DNGmxVaultStorage {
    using FullMath for uint256;
    using SafeCast for uint256;

    error InvalidRebalance();
    error DepositCapExceeded();
    error OnlyKeeperAllowed(address msgSender, address authorisedKeeperAddress);

    error NotLpVault();
    error NotBalancerVault();

    error ArraysLengthMismatch();
    error FlashloanNotInitiated();

    event Rebalanced();
    event AllowancesGranted();

    event LPVaultUpdated(address _lpVault);
    event KeeperUpdated(address _newKeeper);
    event DepositCapUpdated(uint256 _newDepositCap);
    event StakingManagerUpdated(address _stakingManager);

    event YieldParamsUpdated(uint16 indexed usdcReedemSlippage, uint240 indexed usdcConversionThreshold);
    event RebalanceParamsUpdated(uint32 indexed rebalanceTimeThreshold, uint16 indexed rebalanceDeltaThreshold);

    modifier onlyKeeper() {
        if (msg.sender != keeper) revert OnlyKeeperAllowed(msg.sender, keeper);
        _;
    }

    modifier onlyAaveVault() {
        if (msg.sender != address(lpVault)) revert NotLpVault();
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
        address _poolAddressesProvider,
        TokenAddresses calldata _tokenAddrs
    ) external initializer {
        __Ownable_init();
        __Pausable_init();
        __ERC4626Upgradeable_init(IERC20Metadata(address(_tokenAddrs.sGlp)), _name, _symbol);

        weth = _tokenAddrs.weth;
        wbtc = _tokenAddrs.wbtc;
        usdc = _tokenAddrs.usdc;

        swapRouter = ISwapRouter(_swapRouter);
        rewardRouter = IRewardRouterV2(_rewardRouter);

        glp = IERC20(ISGLPExtended(address(asset)).glp());
        glpManager = IGlpManager(ISGLPExtended(address(asset)).glpManager());

        gmxVault = IVault(glpManager.vault());

        poolAddressProvider = IPoolAddressesProvider(_poolAddressesProvider);

        pool = IPool(poolAddressProvider.getPool());
        oracle = IPriceOracle(poolAddressProvider.getPriceOracle());

        aUsdc = IAToken(pool.getReserveData(address(usdc)).aTokenAddress);
    }

    /* ##################################################################
                                ADMIN FUNCTIONS
    ################################################################## */

    function grantAllowances() external onlyOwner {
        address aavePool = address(pool);

        wbtc.approve(aavePool, type(uint256).max);
        weth.approve(aavePool, type(uint256).max);

        usdc.approve(aavePool, type(uint256).max);
        usdc.approve(address(stakingManager), type(uint256).max);

        aUsdc.approve(address(lpVault), type(uint256).max);

        asset.approve(address(glpManager), type(uint256).max);
        asset.approve(address(stakingManager), type(uint256).max);

        emit AllowancesGranted();
    }

    function setKeeper(address _newKeeper) external onlyOwner {
        keeper = _newKeeper;
        emit KeeperUpdated(_newKeeper);
    }

    function setLPVault(address _lpVault) external onlyOwner {
        lpVault = ILPVault(_lpVault);
        emit LPVaultUpdated(_lpVault);
    }

    function setDepositCap(uint256 _newDepositCap) external onlyOwner {
        depositCap = _newDepositCap;
        emit DepositCapUpdated(_newDepositCap);
    }

    function setStakingManager(address _stakingManager) external onlyOwner {
        stakingManager = IGlpStakingManager(_stakingManager);
        emit StakingManagerUpdated(_stakingManager);
    }

    function setThresholds(YieldStrategyParams calldata _ysParams) external onlyOwner {
        usdcReedemSlippage = _ysParams.usdcReedemSlippage;
        usdcConversionThreshold = _ysParams.usdcConversionThreshold;
        emit YieldParamsUpdated(_ysParams.usdcReedemSlippage, _ysParams.usdcConversionThreshold);
    }

    function setRebalanceParams(RebalanceStrategyParams calldata _rsParams) external onlyOwner {
        rebalanceTimeThreshold = _rsParams.rebalanceTimeThreshold;
        rebalanceDeltaThreshold = _rsParams.rebalanceDeltaThreshold;
        emit RebalanceParamsUpdated(_rsParams.rebalanceTimeThreshold, _rsParams.rebalanceDeltaThreshold);
    }

    function setHedgeParams(HedgeStrategyParams calldata _hedgeParams) external onlyOwner {
        balancerVault = _hedgeParams.vault;
        swapRouter = _hedgeParams.swapRouter;
        targetHealthFactor = _hedgeParams.targetHealthFactor;
        liquidationThreshold = _hedgeParams.liquidationThreshold;
    }

    function getUsdcBorrowed() public view returns (uint256 usdcAmount) {
        return aUsdc.balanceOf(address(this)) - dnUsdcDeposited;
    }
    /* ##################################################################
                                KEEPER FUNCTIONS
    ################################################################## */

    function isValidRebalance() public view returns (bool) {
        return _isValidRebalanceTime() || _isValidRebalanceDeviation();
    }

    function rebalance() external onlyKeeper {
        if (!isValidRebalance()) revert InvalidRebalance();

        // harvest fees
        stakingManager.harvestFees();

        (uint256 currentBtc, uint256 currentEth) = _getCurrentBorrows();
        uint256 totalCurrentBorrowValue = _getBorrowValue(currentBtc, currentEth); // = total position value of current btc and eth position

        // rebalance profit
        _rebalanceProfit(totalCurrentBorrowValue);

        // calculate current btc and eth positions in GLP
        // get the position value and calculate the collateral needed to borrow that
        // transfer collateral from LB vault to DN vault
        _rebalanceHedge(currentBtc, currentEth);

        lastRebalanceTS = uint64(block.timestamp);
        emit Rebalanced();
    }

    /* ##################################################################
                                USER FUNCTIONS
    ################################################################## */

    function deposit(uint256 amount, address to) public virtual override returns (uint256 shares) {
        _rebalanceBeforeShareAllocation();
        shares = super.deposit(amount, to);
    }

    function mint(uint256 shares, address to) public virtual override returns (uint256 amount) {
        _rebalanceBeforeShareAllocation();
        amount = super.mint(shares, to);
    }

    function withdraw(
        uint256 amount,
        address to,
        address from
    ) public override returns (uint256 shares) {
        _rebalanceBeforeShareAllocation();
        shares = super.withdraw(amount, to, from);
    }

    function redeem(
        uint256 shares,
        address to,
        address from
    ) public override returns (uint256 amount) {
        _rebalanceBeforeShareAllocation();
        amount = super.redeem(shares, to, from);
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
        (uint256 btcAssetAmount, uint256 ethAssetAmount, bool repayDebtBtc, bool repayDebtEth) = abi.decode(
            userData,
            (uint256, uint256, bool, bool)
        );

        uint256 btcAssetPremium;
        uint256 ethAssetPremium;
        // adjust asset amounts for premiums (zero for balancer at the time of dev)
        if (repayDebtBtc && repayDebtEth) {
            // Here amounts[0] should be equal to btcAssetAmount+ethAssetAmount
            btcAssetPremium = feeAmounts[0].mulDiv(btcAssetAmount, amounts[0]);
            ethAssetPremium = (feeAmounts[0] - btcAssetPremium);
        } else {
            // Here amounts[0] should be equal to btcAssetAmount and amounts[1] should be equal to ethAssetAmount
            bool btcFirst = false;
            if (repayDebtBtc ? tokens[0] == usdc : tokens[0] == wbtc) btcFirst = true;
            btcAssetPremium = feeAmounts[btcFirst ? 0 : 1];
            ethAssetPremium = feeAmounts[btcFirst ? 1 : 0];
        }

        _executeOperationToken(address(wbtc), btcAssetAmount, btcAssetPremium, repayDebtBtc);
        _executeOperationToken(address(weth), ethAssetAmount, ethAssetPremium, repayDebtEth);
    }

    /* ##################################################################
                                VIEW FUNCTIONS
    ################################################################## */

    function totalAssets() public view override returns (uint256) {
        return stakingManager.maxWithdraw(address(this));
    }

    function getPrice() public view returns (uint256) {
        uint256 aum = glpManager.getAum(false);
        uint256 totalSupply = glp.totalSupply();

        return aum / (totalSupply * 1e24);
    }

    function getMarketValue(uint256 assetAmount) public view returns (uint256 marketValue) {
        marketValue = assetAmount * getPrice();
    }

    function getVaultMarketValue() public view returns (int256 vaultMarketValue) {
        (uint256 currentBtc, uint256 currentEth) = _getCurrentBorrows();
        uint256 totalCurrentBorrowValue = _getBorrowValue(currentBtc, currentEth);
        vaultMarketValue = ((getMarketValue(totalAssets()) + dnUsdcDeposited) - totalCurrentBorrowValue).toInt256();
    }

    function getUsdcBorrowed() public view returns (uint256 usdcAmount) {
        return aUsdc.balanceOf(address(this)) - dnUsdcDeposited;
    }

    /* ##################################################################
                            INTERNAL FUNCTIONS
    ################################################################## */

    /*
        DEPOSIT/WITHDRAW HELPERS
    */

    function _rebalanceBeforeShareAllocation() internal {
        // harvest fees
        stakingManager.harvestFees();

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
        stakingManager.withdraw(assets, address(this), address(this));
        (uint256 currentBtc, uint256 currentEth) = _getCurrentBorrows();

        //rebalance of hedge based on assets after withdraw (before withdraw assets - withdrawn assets)
        _rebalanceHedge(currentBtc, currentEth);
    }

    function afterDeposit(
        uint256 assets,
        uint256,
        address
    ) internal override {
        stakingManager.deposit(assets, address(this));
        if (totalAssets() > depositCap) revert DepositCapExceeded();
        (uint256 currentBtc, uint256 currentEth) = _getCurrentBorrows();

        //rebalance of hedge based on assets after deposit (after deposit assets)
        _rebalanceHedge(currentBtc, currentEth);
    }

    /*
        REBALANCE HELPERS
    */

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
        uint256 optimalBtcBorrow,
        uint256 currentBtcBorrow,
        uint256 optimalEthBorrow,
        uint256 currentEthBorrow
    ) internal {
        address[] memory assets;
        uint256[] memory amounts;

        (uint256 btcAssetAmount, bool repayDebtBtc) = _flashloanAmounts(
            address(wbtc),
            optimalBtcBorrow,
            currentBtcBorrow
        );
        (uint256 ethAssetAmount, bool repayDebtEth) = _flashloanAmounts(
            address(weth),
            optimalEthBorrow,
            currentEthBorrow
        );

        if (repayDebtBtc && repayDebtEth) {
            assets[0] = address(usdc);
            amounts[0] = (btcAssetAmount + ethAssetAmount);
        } else {
            assets[0] = repayDebtBtc ? address(usdc) : address(wbtc);
            assets[1] = repayDebtEth ? address(usdc) : address(weth);

            // ensure that assets and amount tuples are in sorted order of addresses
            if (assets[0] > assets[1]) {
                address tempAsset = assets[0];
                assets[0] = assets[1];
                assets[1] = tempAsset;

                amounts[0] = ethAssetAmount;
                amounts[1] = btcAssetAmount;
            } else {
                amounts[0] = btcAssetAmount;
                amounts[1] = ethAssetAmount;
            }
        }

        _executeFlashloan(assets, amounts, btcAssetAmount, ethAssetAmount, repayDebtBtc, repayDebtEth);
    }

    /// @notice settles collateral for the vault
    /// @dev to be called after settle profits only (since vaultMarketValue if after settlement of profits)
    /// @param currentBtcBorrow The amount of USDC collateral token deposited to LB Protocol
    /// @param currentEthBorrow The market value of ETH/BTC part in sGLP
    function _rebalanceHedge(uint256 currentBtcBorrow, uint256 currentEthBorrow) internal {
        (uint256 optimalBtcBorrow, uint256 optimalEthBorrow) = _getOptimalBorrows(totalAssets());
        uint256 optimalBorrowValue = _getBorrowValue(optimalBtcBorrow, optimalEthBorrow);
        // Settle net change in market value and deposit/withdraw collateral tokens
        // Vault market value is just the collateral value since profit has been settled
        uint256 targetLpVaultAmount = (targetHealthFactor - liquidationThreshold).mulDiv(
            optimalBorrowValue,
            liquidationThreshold
        );
        uint256 currentLpVaultAmount = aUsdc.balanceOf(address(this)) - dnUsdcDeposited;

        if (targetLpVaultAmount > currentLpVaultAmount) {
            // Take from LB Vault
            lpVault.borrow(targetLpVaultAmount - currentLpVaultAmount);
            // Rebalance Position
            _rebalanceBorrow(optimalBtcBorrow, currentBtcBorrow, optimalEthBorrow, currentEthBorrow);
        } else {
            // Rebalance Position
            _rebalanceBorrow(optimalBtcBorrow, currentBtcBorrow, optimalEthBorrow, currentEthBorrow);
            // Deposit to LB Vault
            lpVault.repay(currentLpVaultAmount - targetLpVaultAmount);
        }
    }

    /*
        SWAP HELPERS
    */

    function _swapTokenToUSDC(address token, uint256 tokenAmount) internal returns (uint256 usdcAmount) {
        bytes memory path = abi.encodePacked(token, uint24(500), usdc);

        uint256 minAmountOut = getPrice(token).mulDiv(tokenAmount * (MAX_BPS - usdcReedemSlippage), MAX_BPS);

        ISwapRouter.ExactInputParams memory params = ISwapRouter.ExactInputParams({
            path: path,
            amountIn: tokenAmount,
            amountOutMinimum: minAmountOut,
            recipient: address(this),
            deadline: block.timestamp
        });

        usdcAmount = swapRouter.exactInput(params);
    }

    /* solhint-disable not-rely-on-time */
    function _swapUSDCToToken(address token, uint256 tokenAmount) internal returns (uint256 outputAmount) {
        bytes memory path = abi.encodePacked(usdc, uint24(500), token);

        uint256 maxAmountIn = getPrice(token).mulDiv(tokenAmount * (MAX_BPS + usdcReedemSlippage), MAX_BPS);

        ISwapRouter.ExactOutputParams memory params = ISwapRouter.ExactOutputParams({
            path: path,
            amountInMaximum: maxAmountIn,
            amountOut: tokenAmount,
            recipient: address(this),
            deadline: block.timestamp
        });

        outputAmount = swapRouter.exactOutput(params);
    }

    /// @notice withdraws LP tokens from gauge, sells LP token for usdc
    /// @param usdcAmountDesired amount of USDC desired
    function _convertAssetToAUsdc(uint256 usdcAmountDesired) internal returns (uint256 usdcAmount) {
        /// @dev if usdcAmountDesired < 10, then there is precision issue in gmx contracts while redeeming for usdg
        if (usdcAmountDesired < usdcConversionThreshold) return 0;
        uint256 glpAmountDesired = usdcAmountDesired / getPrice();
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
        _executeWithdraw(address(usdc), amount, address(this));
        //USDG has 18 decimals and usdc has 6 decimals => 18-6 = 12
        stakingManager.depositToken(address(usdc), amount);
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

    /*
        BALANCER HELPERS
    */

    function _executeOperationToken(
        address token,
        uint256 amount,
        uint256 premium,
        bool repayDebt
    ) internal {
        uint256 amountWithPremium = amount + premium;
        if (!repayDebt) {
            uint256 usdcReceived = _swapTokenToUSDC(token, amount);
            dnUsdcDeposited += usdcReceived;
            _executeSupply(address(usdc), usdcReceived);
            _executeBorrow(token, amountWithPremium);
            IERC20(token).transfer(address(balancerVault), amountWithPremium);
        } else {
            uint256 tokenReceived = _swapUSDCToToken(token, amount);
            _executeRepay(token, tokenReceived);
            dnUsdcDeposited -= amountWithPremium;
            //withdraws to balancerVault
            _executeWithdraw(address(usdc), amountWithPremium, address(balancerVault));
        }
    }

    function _executeFlashloan(
        address[] memory assets,
        uint256[] memory amounts,
        uint256 _btcAssetAmount,
        uint256 _ethAssetAmount,
        bool _repayDebtBtc,
        bool _repayDebtEth
    ) internal {
        if (assets.length != amounts.length) revert ArraysLengthMismatch();

        _hasFlashloaned = true;

        balancerVault.flashLoan(
            address(this),
            assets,
            amounts,
            abi.encode(_btcAssetAmount, _ethAssetAmount, _repayDebtBtc, _repayDebtEth)
        );

        _hasFlashloaned = false;
    }

    /* ##################################################################
                            INTERNAL VIEW FUNCTIONS
    ################################################################## */
    /* solhint-disable not-rely-on-time */
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

    // @dev returns price in terms of usdc
    function getPrice(address token) internal view returns (uint256) {
        uint256 price = oracle.getAssetPrice(token);

        // @dev aave returns from same source as chainlink (which is 8 decimals)
        return price / 10**2;
    }

    /// @dev returns the borrow value in USDC
    function _getBorrowValue(uint256 btcAmount, uint256 ethAmount) internal view returns (uint256 borrowValue) {
        borrowValue = (btcAmount * getPrice(address(wbtc))) + (ethAmount * getPrice(address(weth)));
        borrowValue = borrowValue / getPrice(address(usdc));
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
            amount = (currentBorrow - optimalBorrow) * getPrice(token);
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
}
