// SPDX-License-Identifier: MIT

pragma solidity ^0.8.9;
import { FullMath } from '@uniswap/v3-core-0.8-support/contracts/libraries/FullMath.sol';
import { IPool } from '@aave/core-v3/contracts/interfaces/IPool.sol';
import { IAToken } from '@aave/core-v3/contracts/interfaces/IAToken.sol';
import { IPoolAddressesProvider } from '@aave/core-v3/contracts/interfaces/IPoolAddressesProvider.sol';
import { IERC20 } from '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import { IERC20Metadata } from '@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol';
import { OwnableUpgradeable } from '@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol';
import { PausableUpgradeable } from '@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol';
import { ERC4626Upgradeable } from '../ERC4626/ERC4626Upgradeable.sol';
import { FeeSplitStrategy } from '../libraries/FeeSplitStrategy.sol';
import { IDnGmxJuniorVault } from '../interfaces/IDnGmxJuniorVault.sol';
import { ILeveragePool } from '../interfaces/ILeveragePool.sol';
import { IBorrower } from '../interfaces/IBorrower.sol';
import { IPriceOracle } from '@aave/core-v3/contracts/interfaces/IPriceOracle.sol';

import 'hardhat/console.sol';

contract DnGmxSeniorVault is ERC4626Upgradeable, OwnableUpgradeable, PausableUpgradeable {
    using FeeSplitStrategy for FeeSplitStrategy.Info;
    using FullMath for uint256;

    error CallerNotBorrower();
    error UsageCapExceeded();
    error InvalidBorrowAmount();
    error InvalidBorrowerAddress();
    error InvalidCapUpdate();
    error MaxUtilizationBreached();
    error DepositCapExceeded();

    event AllowancesGranted();
    event BorrowCapUpdated(address vault, uint256 newCap);
    event DepositCapUpdated(uint256 _newDepositCap);

    uint16 internal constant MAX_BPS = 10_000;

    IPool internal pool;
    IAToken internal aUsdc;
    IPoolAddressesProvider internal poolAddressProvider;
    FeeSplitStrategy.Info public feeStrategy;
    IDnGmxJuniorVault public dnGmxJuniorVault;
    ILeveragePool public leveragePool;
    IPriceOracle internal oracle;

    uint16 public maxUtilizationBps;
    uint256 public depositCap;

    mapping(address => uint256) public borrowCaps;

    modifier onlyBorrower() {
        if (msg.sender != address(dnGmxJuniorVault) && msg.sender != address(leveragePool)) revert CallerNotBorrower();
        _;
    }

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
        IERC20Metadata(asset).approve(address(pool), type(uint256).max);
    }

    function setDnGmxJuniorVault(address _dnGmxJuniorVault) external onlyOwner {
        dnGmxJuniorVault = IDnGmxJuniorVault(_dnGmxJuniorVault);
    }

    function setDepositCap(uint256 _newDepositCap) external onlyOwner {
        depositCap = _newDepositCap;
        emit DepositCapUpdated(_newDepositCap);
    }

    function setMaxUtilizationBps(uint16 _maxUtilizationBps) external onlyOwner {
        maxUtilizationBps = _maxUtilizationBps;
    }

    function grantAllowances() external onlyOwner {
        address aavePool = address(pool);

        IERC20Metadata(asset).approve(aavePool, type(uint256).max);
        aUsdc.approve(aavePool, type(uint256).max);

        emit AllowancesGranted();
    }

    function updateBorrowCap(address borrowerAddress, uint256 cap) external onlyOwner {
        if (borrowerAddress != address(dnGmxJuniorVault) && borrowerAddress != address(leveragePool))
            revert InvalidBorrowerAddress();

        if (IBorrower(borrowerAddress).getUsdcBorrowed() < cap) {
            borrowCaps[borrowerAddress] = cap;

            aUsdc.approve(borrowerAddress, cap);

            emit BorrowCapUpdated(borrowerAddress, cap);
        } else {
            revert InvalidCapUpdate();
        }
    }

    function updateFeeStrategyParams(FeeSplitStrategy.Info calldata _feeStrategy) external onlyOwner {
        feeStrategy = _feeStrategy;
    }

    function getEthRewardsSplitRate() public view returns (uint256 feeSplitRate) {
        feeSplitRate = feeStrategy.calculateFeeSplit(aUsdc.balanceOf(address(this)), totalUsdcBorrowed());
    }

    function availableBorrow(address borrower) public view returns (uint256 availableAUsdc) {
        uint256 availableBasisCap = borrowCaps[borrower] - IBorrower(borrower).getUsdcBorrowed();
        uint256 availableBasisBalance = aUsdc.balanceOf(address(this));

        availableAUsdc = availableBasisCap < availableBasisBalance ? availableBasisCap : availableBasisBalance;
    }

    function borrow(uint256 amount) external onlyBorrower {
        dnGmxJuniorVault.harvestFees();
        if (amount == 0 || amount > availableBorrow(msg.sender)) {
            revert InvalidBorrowAmount();
        } else {
            aUsdc.transfer(msg.sender, amount);
        }
    }

    function repay(uint256 amount) external onlyBorrower {
        console.log('msg.sender bal', aUsdc.balanceOf(msg.sender));
        console.log('amount_', amount);
        dnGmxJuniorVault.harvestFees();
        aUsdc.transferFrom(msg.sender, address(this), amount);
    }

    function deposit(uint256 amount, address to) public virtual override whenNotPaused returns (uint256 shares) {
        dnGmxJuniorVault.harvestFees();
        shares = super.deposit(amount, to);
    }

    function mint(uint256 shares, address to) public virtual override whenNotPaused returns (uint256 amount) {
        dnGmxJuniorVault.harvestFees();
        amount = super.mint(shares, to);
    }

    function withdraw(
        uint256 assets,
        address receiver,
        address owner
    ) public override whenNotPaused returns (uint256 shares) {
        dnGmxJuniorVault.harvestFees();
        shares = super.withdraw(assets, receiver, owner);
    }

    function redeem(
        uint256 shares,
        address receiver,
        address owner
    ) public override whenNotPaused returns (uint256 assets) {
        dnGmxJuniorVault.harvestFees();
        assets = super.redeem(shares, receiver, owner);
    }

    /// @dev withdrawal will fail if the utilization goes above maxUtilization value due to a withdrawal
    function beforeWithdraw(
        uint256 assets,
        uint256,
        address
    ) internal override {
        // check if the utilization goes above limit due to this withdrawal
        if (totalUsdcBorrowed() > ((totalAssets() - assets) * maxUtilizationBps) / MAX_BPS) {
            revert MaxUtilizationBreached();
        }
        pool.withdraw(address(asset), assets, address(this));
    }

    function afterDeposit(
        uint256 assets,
        uint256,
        address
    ) internal override {
        pool.supply(address(asset), assets, address(this), 0);

        if (totalAssets() > depositCap) revert DepositCapExceeded();
    }

    function totalAssets() public view override returns (uint256 amount) {
        amount = aUsdc.balanceOf(address(this));

        amount += totalUsdcBorrowed();
    }

    function totalUsdcBorrowed() public view returns (uint256 usdcBorrowed) {
        if (address(dnGmxJuniorVault) != address(0)) usdcBorrowed += dnGmxJuniorVault.getUsdcBorrowed();
        if (address(leveragePool) != address(0)) usdcBorrowed += leveragePool.getUsdcBorrowed();
    }

    function getPriceX128() public view returns (uint256) {
        uint256 price = oracle.getAssetPrice(address(asset));

        // @dev aave returns from same source as chainlink (which is 8 decimals)
        return price.mulDiv(1 << 128, 1e20); // usdc decimals - (chainlink decimals + asset decimals) = 6-8-18 = 20
    }

    function getVaultMarketValue() public view returns (uint256) {
        uint256 price = oracle.getAssetPrice(address(asset));

        return totalAssets().mulDiv(price, 1e8);
    }
}
