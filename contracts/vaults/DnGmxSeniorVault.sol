// SPDX-License-Identifier: MIT

pragma solidity ^0.8.9;

import { IBorrower } from '../interfaces/IBorrower.sol';

import { IPool } from '@aave/core-v3/contracts/interfaces/IPool.sol';
import { IERC20 } from '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import { IAToken } from '@aave/core-v3/contracts/interfaces/IAToken.sol';
import { IPriceOracle } from '@aave/core-v3/contracts/interfaces/IPriceOracle.sol';
import { IPoolAddressesProvider } from '@aave/core-v3/contracts/interfaces/IPoolAddressesProvider.sol';

import { FeeSplitStrategy } from '../libraries/FeeSplitStrategy.sol';
import { FullMath } from '@uniswap/v3-core-0.8-support/contracts/libraries/FullMath.sol';

import { IERC4626 } from '../interfaces/IERC4626.sol';
import { IDnGmxSeniorVault } from '../interfaces/IDnGmxSeniorVault.sol';
import { ERC4626Upgradeable } from '../ERC4626/ERC4626Upgradeable.sol';
import { OwnableUpgradeable } from '@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol';
import { PausableUpgradeable } from '@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol';

contract DnGmxSeniorVault is IDnGmxSeniorVault, ERC4626Upgradeable, OwnableUpgradeable, PausableUpgradeable {
    using FullMath for uint256;
    using FeeSplitStrategy for FeeSplitStrategy.Info;

    uint16 internal constant MAX_BPS = 10_000;

    uint256 public depositCap;
    uint256 public maxUtilizationBps;

    IBorrower public leveragePool;
    IBorrower public dnGmxJuniorVault;

    FeeSplitStrategy.Info public feeStrategy;

    IPool internal pool;
    IAToken internal aUsdc;
    IPriceOracle internal oracle;
    IPoolAddressesProvider internal poolAddressProvider;

    mapping(address => uint256) public borrowCaps;

    // these gaps are added to allow adding new variables without shifting down inheritance chain
    uint256[50] private __gaps;

    modifier onlyBorrower() {
        if (msg.sender != address(dnGmxJuniorVault) && msg.sender != address(leveragePool)) revert CallerNotBorrower();
        _;
    }

    /*//////////////////////////////////////////////////////////////
                            INIT FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    function initialize(
        address _usdc,
        string calldata _name,
        string calldata _symbol,
        address _poolAddressesProvider
    ) external initializer {
        __Ownable_init();
        __Pausable_init();
        __ERC4626Upgradeable_init(_usdc, _name, _symbol);

        poolAddressProvider = IPoolAddressesProvider(_poolAddressesProvider);

        pool = IPool(poolAddressProvider.getPool());
        aUsdc = IAToken(pool.getReserveData(_usdc).aTokenAddress);
        oracle = IPriceOracle(poolAddressProvider.getPriceOracle());

        aUsdc.approve(address(pool), type(uint256).max);
        IERC20(asset).approve(address(pool), type(uint256).max);
    }

    function grantAllowances() external onlyOwner {
        address aavePool = address(pool);

        IERC20(asset).approve(aavePool, type(uint256).max);
        aUsdc.approve(aavePool, type(uint256).max);

        emit AllowancesGranted();
    }

    /*//////////////////////////////////////////////////////////////
                             ADMIN SETTERS
    //////////////////////////////////////////////////////////////*/

    function setDepositCap(uint256 _newDepositCap) external onlyOwner {
        depositCap = _newDepositCap;
        emit DepositCapUpdated(_newDepositCap);
    }

    function setLeveragePool(IBorrower _leveragePool) external onlyOwner {
        leveragePool = _leveragePool;
        emit LeveragePoolUpdated(_leveragePool);
    }

    function setDnGmxJuniorVault(IBorrower _dnGmxJuniorVault) external onlyOwner {
        dnGmxJuniorVault = _dnGmxJuniorVault;
        emit DnGmxJuniorVaultUpdated(_dnGmxJuniorVault);
    }

    function setMaxUtilizationBps(uint256 _maxUtilizationBps) external onlyOwner {
        maxUtilizationBps = _maxUtilizationBps;
        emit MaxUtilizationBpsUpdated(_maxUtilizationBps);
    }

    /*//////////////////////////////////////////////////////////////
                      STRATEGY PARAMETERS SETTERS
    //////////////////////////////////////////////////////////////*/

    function updateBorrowCap(address borrowerAddress, uint256 cap) external onlyOwner {
        if (borrowerAddress != address(dnGmxJuniorVault) && borrowerAddress != address(leveragePool))
            revert InvalidBorrowerAddress();

        if (IBorrower(borrowerAddress).getUsdcBorrowed() >= cap) revert InvalidCapUpdate();

        borrowCaps[borrowerAddress] = cap;
        aUsdc.approve(borrowerAddress, cap);

        emit BorrowCapUpdated(borrowerAddress, cap);
    }

    function updateFeeStrategyParams(FeeSplitStrategy.Info calldata _feeStrategy) external onlyOwner {
        feeStrategy = _feeStrategy;
    }

    /*//////////////////////////////////////////////////////////////
                            PROTOCOL FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    function borrow(uint256 amount) external onlyBorrower {
        if (amount == 0 || amount > availableBorrow(msg.sender)) revert InvalidBorrowAmount();

        dnGmxJuniorVault.harvestFees();
        aUsdc.transfer(msg.sender, amount);
    }

    function repay(uint256 amount) external onlyBorrower {
        dnGmxJuniorVault.harvestFees();
        aUsdc.transferFrom(msg.sender, address(this), amount);
    }

    function deposit(uint256 amount, address to)
        public
        virtual
        override(IERC4626, ERC4626Upgradeable)
        whenNotPaused
        returns (uint256 shares)
    {
        dnGmxJuniorVault.harvestFees();
        shares = super.deposit(amount, to);
    }

    function mint(uint256 shares, address to)
        public
        virtual
        override(IERC4626, ERC4626Upgradeable)
        whenNotPaused
        returns (uint256 amount)
    {
        dnGmxJuniorVault.harvestFees();
        amount = super.mint(shares, to);
    }

    function withdraw(
        uint256 assets,
        address receiver,
        address owner
    ) public override(IERC4626, ERC4626Upgradeable) whenNotPaused returns (uint256 shares) {
        dnGmxJuniorVault.harvestFees();
        shares = super.withdraw(assets, receiver, owner);
    }

    function redeem(
        uint256 shares,
        address receiver,
        address owner
    ) public override(IERC4626, ERC4626Upgradeable) whenNotPaused returns (uint256 assets) {
        dnGmxJuniorVault.harvestFees();
        assets = super.redeem(shares, receiver, owner);
    }

    /*//////////////////////////////////////////////////////////////
                         ERC4626 HOOKS OVERRIDE
    //////////////////////////////////////////////////////////////*/

    function beforeWithdraw(
        uint256 assets,
        uint256,
        address
    ) internal override {
        /// @dev withdrawal will fail if the utilization goes above maxUtilization value due to a withdrawal
        if (totalUsdcBorrowed() > ((totalAssets() - assets) * maxUtilizationBps) / MAX_BPS)
            revert MaxUtilizationBreached();
        pool.withdraw(address(asset), assets, address(this));
    }

    function afterDeposit(
        uint256 assets,
        uint256,
        address
    ) internal override {
        if (totalAssets() > depositCap) revert DepositCapExceeded();

        pool.supply(address(asset), assets, address(this), 0);
    }

    /*//////////////////////////////////////////////////////////////
                                GETTERS
    //////////////////////////////////////////////////////////////*/

    function getPriceX128() public view returns (uint256) {
        uint256 price = oracle.getAssetPrice(address(asset));

        // @dev aave returns from same source as chainlink (which is 8 decimals)
        // usdc decimals - (chainlink decimals + asset decimals) = 6-8-6 = 8
        return price.mulDiv(1 << 128, 1e8);
    }

    function getVaultMarketValue() public view returns (uint256) {
        uint256 price = oracle.getAssetPrice(address(asset));

        return totalAssets().mulDiv(price, 1e8);
    }

    function totalUsdcBorrowed() public view returns (uint256 usdcBorrowed) {
        if (address(leveragePool) != address(0)) usdcBorrowed += leveragePool.getUsdcBorrowed();
        if (address(dnGmxJuniorVault) != address(0)) usdcBorrowed += dnGmxJuniorVault.getUsdcBorrowed();
    }

    function getEthRewardsSplitRate() public view returns (uint256 feeSplitRate) {
        feeSplitRate = feeStrategy.calculateFeeSplit(aUsdc.balanceOf(address(this)), totalUsdcBorrowed());
    }

    function availableBorrow(address borrower) public view returns (uint256 availableAUsdc) {
        uint256 availableBasisCap = borrowCaps[borrower] - IBorrower(borrower).getUsdcBorrowed();
        uint256 availableBasisBalance = aUsdc.balanceOf(address(this));

        availableAUsdc = availableBasisCap < availableBasisBalance ? availableBasisCap : availableBasisBalance;
    }

    /*//////////////////////////////////////////////////////////////
                       ERC4626 GETTERS OVERRIDES
    //////////////////////////////////////////////////////////////*/

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function totalAssets() public view override(IERC4626, ERC4626Upgradeable) returns (uint256 amount) {
        amount = aUsdc.balanceOf(address(this));
        amount += totalUsdcBorrowed();
    }

    function maxDeposit(address) public view override(IERC4626, ERC4626Upgradeable) returns (uint256) {
        uint256 cap = depositCap;
        uint256 total = totalAssets();

        return total < cap ? cap - total : 0;
    }

    function maxMint(address) public view override(IERC4626, ERC4626Upgradeable) returns (uint256) {
        return convertToShares(maxDeposit(address(0)));
    }

    function maxWithdraw(address owner) public view override(IERC4626, ERC4626Upgradeable) returns (uint256) {
        uint256 total = totalAssets();
        uint256 borrowed = totalUsdcBorrowed();

        uint256 maxAvailable = (total * maxUtilizationBps) / MAX_BPS;
        maxAvailable = borrowed < maxAvailable ? maxAvailable - borrowed : 0;

        uint256 maxOfUser = convertToAssets(balanceOf(owner));

        return maxOfUser < maxAvailable ? maxOfUser : maxAvailable;
    }

    function maxRedeem(address owner) public view override(IERC4626, ERC4626Upgradeable) returns (uint256) {
        return convertToShares(maxWithdraw(owner));
    }
}
