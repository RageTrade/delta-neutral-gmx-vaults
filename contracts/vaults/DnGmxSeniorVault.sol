// SPDX-License-Identifier: MIT

pragma solidity ^0.8.9;

import { IAToken } from '@aave/core-v3/contracts/interfaces/IAToken.sol';
import { IPool } from '@aave/core-v3/contracts/interfaces/IPool.sol';
import { IPoolAddressesProvider } from '@aave/core-v3/contracts/interfaces/IPoolAddressesProvider.sol';
import { IPriceOracle } from '@aave/core-v3/contracts/interfaces/IPriceOracle.sol';

import { IERC20 } from '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import { OwnableUpgradeable } from '@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol';
import { PausableUpgradeable } from '@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol';

import { FullMath } from '@uniswap/v3-core-0.8-support/contracts/libraries/FullMath.sol';

import { IBorrower } from '../interfaces/IBorrower.sol';
import { IDnGmxSeniorVault } from '../interfaces/IDnGmxSeniorVault.sol';
import { IERC4626 } from '../interfaces/IERC4626.sol';

import { ERC4626Upgradeable } from '../ERC4626/ERC4626Upgradeable.sol';
import { FeeSplitStrategy } from '../libraries/FeeSplitStrategy.sol';

/**
 * @title Delta Neutral GMX Senior Tranche contract
 * @notice Implements the handling of senior tranche which acts as a lender of aUSDC for junior tranche to
 * borrow and hedge tokens using AAVE
 * @author Rage
 **/
contract DnGmxSeniorVault is IDnGmxSeniorVault, ERC4626Upgradeable, OwnableUpgradeable, PausableUpgradeable {
    using FullMath for uint256;
    using FeeSplitStrategy for FeeSplitStrategy.Info;

    uint16 internal constant MAX_BPS = 10_000;

    // maximum assets(usdc) that can be deposited into the vault
    uint256 public depositCap;
    // maximum utilizqtion that the vault can go upto due to a withdrawal
    uint256 public maxUtilizationBps;

    // leverage pool which can take usdc from senior tranche to lend against junior tranche shares
    IBorrower public leveragePool;

    // junior tranche which can take usdc from senior tranche against the GLP assets deposited to borrow for taking hedges on AAVE
    IBorrower public dnGmxJuniorVault;

    // fee split vs utilization curve
    // two sloped curve similar to the one used by AAVE
    FeeSplitStrategy.Info public feeStrategy;

    // AAVE pool
    IPool internal pool;
    // AAVE usdc supply token
    IAToken internal aUsdc;
    // AAVE oracle
    IPriceOracle internal oracle;
    // AAVE pool address provider
    IPoolAddressesProvider internal poolAddressProvider;
    // Borrow caps on leverage pool and junior tranche
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
    /// @notice initializer
    /// @param _name name of vault share token
    /// @param _symbol symbol of vault share token
    /// @param _usdc address of usdc token
    /// @param _poolAddressesProvider add
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

    /// @notice grants allowances for tokens to relevant external contracts
    /// @dev to be called once the vault is deployed
    function grantAllowances() external onlyOwner {
        address aavePool = address(pool);

        IERC20(asset).approve(aavePool, type(uint256).max);
        aUsdc.approve(aavePool, type(uint256).max);

        emit AllowancesGranted();
    }

    /*//////////////////////////////////////////////////////////////
                             ADMIN SETTERS
    //////////////////////////////////////////////////////////////*/

    /// @notice sets deposit cap (6 decimals)
    /// @param _newDepositCap: updated deposit cap
    /// @dev depositCap = limit on the asset amount (usdc) that can be deposited into the vault
    function setDepositCap(uint256 _newDepositCap) external onlyOwner {
        depositCap = _newDepositCap;
        emit DepositCapUpdated(_newDepositCap);
    }

    /// @notice sets leverage pool address
    /// @param _leveragePool: updated deposit cap
    function setLeveragePool(IBorrower _leveragePool) external onlyOwner {
        leveragePool = _leveragePool;
        emit LeveragePoolUpdated(_leveragePool);
    }

    /// @notice sets junior tranche address
    /// @param _dnGmxJuniorVault: updated deposit cap
    function setDnGmxJuniorVault(IBorrower _dnGmxJuniorVault) external onlyOwner {
        dnGmxJuniorVault = _dnGmxJuniorVault;
        emit DnGmxJuniorVaultUpdated(_dnGmxJuniorVault);
    }

    /// @notice sets max utilization bps
    /// @dev maximum utilization that vault is allowed to go upto on withdrawals (beyond this withdrawals would fail)
    /// @param _maxUtilizationBps: updated max utilization bps
    function setMaxUtilizationBps(uint256 _maxUtilizationBps) external onlyOwner {
        if (_maxUtilizationBps > MAX_BPS) revert InvalidMaxUtilizationBps();
        maxUtilizationBps = _maxUtilizationBps;
        emit MaxUtilizationBpsUpdated(_maxUtilizationBps);
    }

    /*//////////////////////////////////////////////////////////////
                      STRATEGY PARAMETERS SETTERS
    //////////////////////////////////////////////////////////////*/

    /// @notice updates borrow cap for junior tranche or leverage pool
    /// @notice borrowCap = max amount a borrower can take from senior tranche
    /// @param borrowerAddress: address of borrower for whom cap needs to be updated
    /// @param cap: new cap for the borrower
    function updateBorrowCap(address borrowerAddress, uint256 cap) external onlyOwner {
        if (borrowerAddress != address(dnGmxJuniorVault) && borrowerAddress != address(leveragePool))
            revert InvalidBorrowerAddress();

        if (IBorrower(borrowerAddress).getUsdcBorrowed() >= cap) revert InvalidCapUpdate();

        borrowCaps[borrowerAddress] = cap;
        aUsdc.approve(borrowerAddress, cap);

        emit BorrowCapUpdated(borrowerAddress, cap);
    }

    /// @notice updates fee split strategy
    /// @notice this determines how eth rewards should be split between junior and senior tranche
    /// @notice basis the utilization of senior tranche
    /// @param _feeStrategy: new fee strategy
    function updateFeeStrategyParams(FeeSplitStrategy.Info calldata _feeStrategy) external onlyOwner {
        feeStrategy = _feeStrategy;
    }

    /*//////////////////////////////////////////////////////////////
                            PROTOCOL FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /// @notice borrow aUSDC
    /// @dev harvests fees from junior tranche since utilization changes
    /// @param amount amount of aUSDC to transfer from senior tranche to borrower
    function borrow(uint256 amount) external onlyBorrower {
        if (amount == 0 || amount > availableBorrow(msg.sender)) revert InvalidBorrowAmount();

        dnGmxJuniorVault.harvestFees();
        aUsdc.transfer(msg.sender, amount);
    }

    /// @notice repay aUSDC
    /// @dev harvests fees from junior tranche since utilization changes
    /// @param amount amount of aUSDC to transfer from borrower to senior tranche
    function repay(uint256 amount) external onlyBorrower {
        dnGmxJuniorVault.harvestFees();
        aUsdc.transferFrom(msg.sender, address(this), amount);
    }

    /// @notice deposit usdc
    /// @dev harvests fees from junior tranche since utilization changes
    /// @param amount amount of usdc to be deposited
    /// @param to receiver of shares
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

    /// @notice deposit usdc
    /// @dev harvests fees from junior tranche since utilization changes
    /// @param shares amount of shares to be minted
    /// @param to receiver of shares
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

    /// @notice withdraw usdc
    /// @dev harvests fees from junior tranche since utilization changes
    /// @param assets amount of usdc to be transferred
    /// @param receiver receiver of assets
    /// @param owner owner of the shares to be burnt
    function withdraw(
        uint256 assets,
        address receiver,
        address owner
    ) public override(IERC4626, ERC4626Upgradeable) whenNotPaused returns (uint256 shares) {
        dnGmxJuniorVault.harvestFees();
        shares = super.withdraw(assets, receiver, owner);
    }

    /// @notice withdraw usdc
    /// @dev harvests fees from junior tranche since utilization changes
    /// @param shares amount of shares to be burnt
    /// @param receiver receiver of assets
    /// @param owner owner of the shares to be burnt
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
    /// @notice converts aUSDC to USDC before assets are withdrawn to receiver
    /// @notice also check if the maxUtilization is not being breached (reverts if it does)
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

    /// @notice converts USDC to aUSDC after assets are taken from depositor
    /// @notice also check if the depositCap is not being breached (reverts if it does)
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

    /// @notice returns price of a single asset token in X128
    function getPriceX128() public view returns (uint256) {
        uint256 price = oracle.getAssetPrice(address(asset));

        // @dev aave returns from same source as chainlink (which is 8 decimals)
        // usdc decimals - (chainlink decimals + asset decimals) = 6-8-6 = 8
        return price.mulDiv(1 << 128, 1e8);
    }

    /// @notice returns overall vault market value for the vault by valueing the underlying assets
    function getVaultMarketValue() public view returns (uint256) {
        uint256 price = oracle.getAssetPrice(address(asset));

        return totalAssets().mulDiv(price, 1e8);
    }

    /// @notice returns total usdc borrowed from the vault
    function totalUsdcBorrowed() public view returns (uint256 usdcBorrowed) {
        if (address(leveragePool) != address(0)) usdcBorrowed += leveragePool.getUsdcBorrowed();
        if (address(dnGmxJuniorVault) != address(0)) usdcBorrowed += dnGmxJuniorVault.getUsdcBorrowed();
    }

    /// @notice returns eth reward split rate basis utilization in E30
    /// @notice returned part should go to the senior tranche and remaining to junior tranche
    function getEthRewardsSplitRate() public view returns (uint256 feeSplitRate) {
        feeSplitRate = feeStrategy.calculateFeeSplit(aUsdc.balanceOf(address(this)), totalUsdcBorrowed());
    }

    /// @notice return the available borrow amount for a given borrower address
    function availableBorrow(address borrower) public view returns (uint256 availableAUsdc) {
        uint256 availableBasisCap = borrowCaps[borrower] - IBorrower(borrower).getUsdcBorrowed();
        uint256 availableBasisBalance = aUsdc.balanceOf(address(this));

        availableAUsdc = availableBasisCap < availableBasisBalance ? availableBasisCap : availableBasisBalance;
    }

    /*//////////////////////////////////////////////////////////////
                       ERC4626 GETTERS OVERRIDES
    //////////////////////////////////////////////////////////////*/

    /// @notice decimals of vault shares (= usdc decimals)
    function decimals() public pure override returns (uint8) {
        return 6;
    }

    /// @notice returns total assets in vault
    function totalAssets() public view override(IERC4626, ERC4626Upgradeable) returns (uint256 amount) {
        amount = aUsdc.balanceOf(address(this));
        amount += totalUsdcBorrowed();
    }

    /// @notice returns max deposit amount in assets into the vault
    function maxDeposit(address) public view override(IERC4626, ERC4626Upgradeable) returns (uint256) {
        uint256 cap = depositCap;
        uint256 total = totalAssets();

        return total < cap ? cap - total : 0;
    }

    /// @notice returns max mintable amount of shares for the vault
    function maxMint(address) public view override(IERC4626, ERC4626Upgradeable) returns (uint256) {
        return convertToShares(maxDeposit(address(0)));
    }

    /// @notice returns max withdrawable amount of assets for a given owner address
    /// @dev checks the max amount basis user balance and maxUtilizationBps and gives the minimum of the two
    function maxWithdraw(address owner) public view override(IERC4626, ERC4626Upgradeable) returns (uint256) {
        uint256 total = totalAssets();
        uint256 borrowed = totalUsdcBorrowed();

        // checks the max withdrawable amount until which the vault remains below max utilization
        uint256 maxAvailable = (total * maxUtilizationBps) / MAX_BPS;
        maxAvailable = borrowed < maxAvailable ? maxAvailable - borrowed : 0;

        // checks the balance of the user
        uint256 maxOfUser = convertToAssets(balanceOf(owner));

        return maxOfUser < maxAvailable ? maxOfUser : maxAvailable;
    }

    /// @notice returns max redeemable amount of shares for a given owner address
    function maxRedeem(address owner) public view override(IERC4626, ERC4626Upgradeable) returns (uint256) {
        return convertToShares(maxWithdraw(owner));
    }
}
