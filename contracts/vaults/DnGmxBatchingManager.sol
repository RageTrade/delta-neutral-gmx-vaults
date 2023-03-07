// SPDX-License-Identifier: MIT

pragma solidity ^0.8.9;

import { IERC20 } from '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import { OwnableUpgradeable } from '@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol';
import { PausableUpgradeable } from '@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol';

import { FullMath } from '@uniswap/v3-core/contracts/libraries/FullMath.sol';

import { IDnGmxJuniorVault } from '../interfaces/IDnGmxJuniorVault.sol';
import { IDnGmxBatchingManager } from '../interfaces/IDnGmxBatchingManager.sol';
import { IDnGmxBatchingManagerGlp } from '../interfaces/IDnGmxBatchingManagerGlp.sol';
import { IGlpManager } from '../interfaces/gmx/IGlpManager.sol';
import { IRewardRouterV2 } from '../interfaces/gmx/IRewardRouterV2.sol';
import { IVault } from '../interfaces/gmx/IVault.sol';

import { IBatchingManagerBypass } from '../interfaces/IBatchingManagerBypass.sol';

import { SafeCast } from '../libraries/SafeCast.sol';

/**
 * @title Batching Manager to avoid glp transfer cooldown
 * @notice batches the incoming deposit token deposits after converting them to glp
 * @notice It is upgradable contract (via TransparentUpgradeableProxy proxy owned by ProxyAdmin)
 * @author RageTrade
 **/

contract DnGmxBatchingManager is IDnGmxBatchingManager, OwnableUpgradeable, PausableUpgradeable {
    using FullMath for uint256;
    using FullMath for uint128;
    using SafeCast for uint256;

    struct VaultBatchingState {
        // round indentifier
        uint256 currentRound;
        // !!! roundGlpDepositPending is deprecated !!!
        uint256 roundGlpDepositPending;
        // junior vault shares minted in current round
        uint256 roundSharesMinted;
        // amount of sGlp received in current round
        uint256 roundGlpStaked;
        // amount of usdc recieved in current round
        uint256 roundUsdcBalance;
        // stores junior vault shares accumulated for user
        mapping(address user => UserDeposit) userDeposits;
        // stores total glp received in a given round
        mapping(uint256 roundId => RoundDeposit) roundDeposits;
    }

    uint256 private constant MAX_BPS = 10_000;

    // keeper can be EOA or smart contracts which executes stake and batch
    address public keeper;
    // delta neutral junior tranche
    IDnGmxJuniorVault public dnGmxJuniorVault;

    // max allowed slippage threshold (in bps) when converting usdc to sGlp
    uint256 public slippageThresholdGmxBps;
    // accumulator to keep track of sGlp direclty (as a means of compounding) send by junior vault
    uint256 public dnGmxJuniorVaultGlpBalance;
    // max allowed usdc to be deposited per round
    uint256 public depositCap;

    // !!! previously this variable was glpDepositPendingThreshold
    // re-using same storage slot for storing threshold on usdc (instead of glp compared to previous version)
    uint256 public minUsdcConversionAmount;

    // staked glp
    IERC20 private sGlp;
    // usdc
    IERC20 private usdc;

    // gmx's GlpManager (GlpManager.sol), which can burn/mint glp
    IGlpManager private glpManager;
    // gmx's Vault (vault.sol) contract
    IVault private gmxUnderlyingVault;
    // gmx's RewardRouterV2 (RewardRouterV2.sol) contract
    IRewardRouterV2 private rewardRouter;

    // batching manager bypass contract !!! deprecated !!!
    IBatchingManagerBypass private bypass;

    // batching manager's state
    VaultBatchingState public vaultBatchingState;

    // wrapped eth
    IERC20 private weth;

    // gmx's reward router used for harvesting rewards
    IRewardRouterV2 private rewardsHarvestingRouter;

    // glp
    IERC20 private glp;
    // combined targetCap from both batching managers to be achieved
    uint256 public targetAssetCap;
    // glp batching manager
    IDnGmxBatchingManagerGlp private glpBatchingManager;

    // these gaps are added to allow adding new variables without shifting down inheritance chain
    uint256[45] private __gaps;

    /// @dev ensures caller is junior vault
    modifier onlyDnGmxJuniorVault() {
        if (msg.sender != address(dnGmxJuniorVault)) revert CallerNotVault();
        _;
    }

    /// @dev ensures caller is keeper
    modifier onlyKeeper() {
        if (msg.sender != keeper) revert CallerNotKeeper();
        _;
    }

    /*//////////////////////////////////////////////////////////////
                            INIT FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /// @notice initializes the proxy state
    /// @dev this function is supposed to be called only once
    /// @param _sGlp address of staked glp
    /// @param _usdc address of usdc
    /// @param _rewardRouter gmx protocol's reward router v2
    /// @param _dnGmxJuniorVault address of delta neutral junior tranche
    function initialize(
        IERC20 _sGlp,
        IERC20 _usdc,
        IRewardRouterV2 _rewardRouter,
        IGlpManager _glpManager,
        address _dnGmxJuniorVault,
        address _keeper
    ) external initializer {
        __Ownable_init();
        __Pausable_init();
        __GMXBatchingManager_init(_sGlp, _usdc, _rewardRouter, _glpManager, _dnGmxJuniorVault, _keeper);
    }

    /* solhint-disable-next-line func-name-mixedcase */
    function __GMXBatchingManager_init(
        IERC20 _sGlp,
        IERC20 _usdc,
        IRewardRouterV2 _rewardRouter,
        IGlpManager _glpManager,
        address _dnGmxJuniorVault,
        address _keeper
    ) internal onlyInitializing {
        sGlp = _sGlp;
        usdc = _usdc;
        glpManager = _glpManager;
        rewardRouter = _rewardRouter;

        gmxUnderlyingVault = IVault(glpManager.vault());
        dnGmxJuniorVault = IDnGmxJuniorVault(_dnGmxJuniorVault);

        keeper = _keeper;
        emit KeeperUpdated(_keeper);

        vaultBatchingState.currentRound = 1;
    }

    /// @notice grants the allowance to the vault to pull sGLP (via safeTransfer from in vault.deposit)
    /// @dev allowance is granted while vault is added via addVault, this is only failsafe if that allowance is exhausted
    function grantAllowances() external onlyOwner {
        sGlp.approve(address(dnGmxJuniorVault), type(uint256).max);
    }

    /*//////////////////////////////////////////////////////////////
                             ADMIN SETTERS
    //////////////////////////////////////////////////////////////*/

    function setGlp(IERC20 _glp) external onlyOwner {
        glp = _glp;
    }

    function setGlpBatchingManager(IDnGmxBatchingManagerGlp _glpBatchingManager) external onlyOwner {
        glpBatchingManager = _glpBatchingManager;
    }

    /// @notice sets the keeper address (to pause & unpause deposits)
    /// @param _keeper address of keeper
    function setKeeper(address _keeper) external onlyOwner {
        keeper = _keeper;
        emit KeeperUpdated(_keeper);
    }

    function setParamsV1(address _weth, address _rewardsHarvestingRouter) external onlyOwner {
        weth = IERC20(_weth);
        rewardsHarvestingRouter = IRewardRouterV2(_rewardsHarvestingRouter);
        emit ParamsV1Updated(_rewardsHarvestingRouter, _weth);
    }

    /// @notice sets the slippage (in bps) to use while staking on gmx
    /// @param _slippageThresholdGmxBps slippage (in bps)
    function setThresholds(uint256 _slippageThresholdGmxBps, uint256 _minUsdcConversionAmount) external onlyOwner {
        slippageThresholdGmxBps = _slippageThresholdGmxBps;
        minUsdcConversionAmount = _minUsdcConversionAmount;
        emit ThresholdsUpdated(_slippageThresholdGmxBps, _minUsdcConversionAmount);
    }

    function setDepositCap(uint256 _depositCap) external onlyOwner {
        depositCap = _depositCap;
        emit DepositCapUpdated(_depositCap);
    }

    function setTargetAssetCap(uint256 _targetAssetCap) external onlyOwner {
        targetAssetCap = _targetAssetCap;
        emit TargeAssetCapUpdated(_targetAssetCap);
    }

    /// @notice pauses deposits (to prevent DOS due to GMX 15 min cooldown)
    function pauseDeposit() external onlyKeeper {
        _pause();
    }

    /// @notice unpauses the deposit function
    function unpauseDeposit() external onlyKeeper {
        _unpause();
    }

    /*//////////////////////////////////////////////////////////////
                            PROTOCOL FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    function depositUsdc(uint256 amount, address receiver) external whenNotPaused {
        // revert for zero values
        if (amount == 0) revert InvalidInput(0x21);
        if (receiver == address(0)) revert InvalidInput(0x22);

        // revert if deposit amount is too low,
        // such that it would revert while converting to glp if it was only deposit in batch
        if (amount < minUsdcConversionAmount) revert InvalidInput(0x23);

        // revert if batch capacity is already reached
        if (vaultBatchingState.roundUsdcBalance + amount > depositCap) revert DepositCapBreached();

        // here, depositCap is in usdc terms
        uint256 totalAssetsDeposited = dnGmxJuniorVault.totalAssets() +
            glpBatchingManager.roundAssetBalance() +
            _usdcToGlp(vaultBatchingState.roundUsdcBalance);

        if (totalAssetsDeposited + _usdcToGlp(amount) > targetAssetCap)
            revert TargetAssetCapBreached(totalAssetsDeposited, _usdcToGlp(amount), targetAssetCap);

        // user gives approval to batching manager to spend usdc
        usdc.transferFrom(msg.sender, address(this), amount);

        UserDeposit storage userDeposit = vaultBatchingState.userDeposits[receiver];
        uint128 userUsdcBalance = userDeposit.usdcBalance;

        // Convert previous round usdc balance into unredeemed shares
        uint256 userDepositRound = userDeposit.round;
        if (userDepositRound < vaultBatchingState.currentRound && userUsdcBalance > 0) {
            // update user's unclaimed shares with previous executed batch
            RoundDeposit storage roundDeposit = vaultBatchingState.roundDeposits[userDepositRound];
            userDeposit.unclaimedShares += userDeposit
                .usdcBalance
                .mulDiv(roundDeposit.totalShares, roundDeposit.totalUsdc)
                .toUint128();
            userUsdcBalance = 0;
        }

        // Update round and usdc balance for current round
        userDeposit.round = vaultBatchingState.currentRound;
        userDeposit.usdcBalance = userUsdcBalance + amount.toUint128();
        vaultBatchingState.roundUsdcBalance += amount.toUint128();

        emit DepositToken(vaultBatchingState.currentRound, address(usdc), receiver, amount, 0);
    }

    function executeBatch(uint128 usdcAmountToConvert) external onlyKeeper {
        if (!paused()) _pause();

        if (usdcAmountToConvert == 0) revert InvalidInput(0x40);

        (uint128 glpReceived, uint128 usdcUsed) = _executeVaultUserBatchStake(usdcAmountToConvert);

        uint128 sharesReceived = _executeVaultUserBatchDeposit(glpReceived);
        uint128 usdcRemainingInRound = vaultBatchingState.roundUsdcBalance.toUint128();

        vaultBatchingState.roundDeposits[vaultBatchingState.currentRound].totalUsdc += usdcUsed;
        vaultBatchingState.roundDeposits[vaultBatchingState.currentRound].totalShares += sharesReceived;

        // move current round to roundDeposits and reset state variables when batch is executed
        if (usdcRemainingInRound == 0) {
            emit BatchDeposit(
                vaultBatchingState.currentRound,
                vaultBatchingState.roundDeposits[vaultBatchingState.currentRound].totalUsdc,
                vaultBatchingState.roundGlpStaked,
                vaultBatchingState.roundSharesMinted
            );

            // reset curret round's bal and increase round id
            vaultBatchingState.roundGlpStaked = 0;
            vaultBatchingState.roundSharesMinted = 0;
            ++vaultBatchingState.currentRound;

            // unpause when batch is executed
            _unpause();
        }
    }

    /// @notice claim the shares received from depositing batch
    /// @param receiver address of receiver
    /// @param amount amount of shares
    function claim(address receiver, uint256 amount) external {
        _claim(msg.sender, receiver, amount);
    }

    function claimAndRedeem(address receiver) external returns (uint256 glpReceived) {
        // claimed shares would be transfered back to msg.sender and later user's complete balance is pulled
        _claim(msg.sender, msg.sender, unclaimedShares(msg.sender));

        uint256 shares = dnGmxJuniorVault.balanceOf(msg.sender);
        if (shares == 0) return 0;

        // withdraw all shares from user
        // user should have given approval to batching manager to spend dnGmxJuniorVault shares
        glpReceived = dnGmxJuniorVault.redeem(shares, receiver, msg.sender);

        emit ClaimedAndRedeemed(msg.sender, receiver, shares, glpReceived);
    }

    function rescueFees() external onlyOwner {
        rewardsHarvestingRouter.handleRewards({
            shouldClaimGmx: false,
            shouldStakeGmx: false,
            shouldClaimEsGmx: true,
            shouldStakeEsGmx: true,
            shouldStakeMultiplierPoints: true,
            shouldClaimWeth: true,
            shouldConvertWethToEth: false
        });

        uint256 wethHarvested = weth.balanceOf(address(this));

        uint256 price = gmxUnderlyingVault.getMinPrice(address(weth));

        uint256 usdgAmount = wethHarvested.mulDiv(price * (MAX_BPS - slippageThresholdGmxBps), 1e30 * MAX_BPS);

        uint256 glpReceived = _stakeGlp(address(weth), wethHarvested, usdgAmount);

        sGlp.transfer(address(dnGmxJuniorVault), glpReceived);
    }

    /*//////////////////////////////////////////////////////////////
                                GETTERS
    //////////////////////////////////////////////////////////////*/

    /// @notice gets the current active round
    function currentRound() external view returns (uint256) {
        return vaultBatchingState.currentRound;
    }

    /// @notice get the usdc balance for a given vault and account address
    /// @param account address of user
    function usdcBalance(address account) public view returns (uint256 balance) {
        balance = vaultBatchingState.userDeposits[account].usdcBalance;
    }

    /// @notice get the unclaimed shares for a given vault and account address
    /// @param account address of user
    function unclaimedShares(address account) public view returns (uint256 shares) {
        UserDeposit memory userDeposit = vaultBatchingState.userDeposits[account];
        shares = userDeposit.unclaimedShares;

        if (userDeposit.round < vaultBatchingState.currentRound && userDeposit.usdcBalance > 0) {
            RoundDeposit memory roundDeposit = vaultBatchingState.roundDeposits[userDeposit.round];
            shares += userDeposit.usdcBalance.mulDiv(roundDeposit.totalShares, roundDeposit.totalUsdc).toUint128();
        }
    }

    /// @notice get the usdc balance for current active round
    function roundUsdcBalance() external view returns (uint256) {
        return vaultBatchingState.roundUsdcBalance;
    }

    /// @notice get the usdc balance for current active round
    function roundGlpStaked() external view returns (uint256) {
        return vaultBatchingState.roundGlpStaked;
    }

    function roundGlpDepositPending() external view returns (uint256) {
        return vaultBatchingState.roundGlpDepositPending;
    }

    function roundSharesMinted() external view returns (uint256) {
        return vaultBatchingState.roundSharesMinted;
    }

    /// @notice get the vaultBatchingState of user deposits
    /// @param account address of user
    function userDeposits(address account) external view returns (UserDeposit memory) {
        return vaultBatchingState.userDeposits[account];
    }

    /// @notice get the info for given vault and round
    /// @param round address of user
    function roundDeposits(uint256 round) external view returns (RoundDeposit memory) {
        return vaultBatchingState.roundDeposits[round];
    }

    /*//////////////////////////////////////////////////////////////
                             INTERNAL LOGIC
    //////////////////////////////////////////////////////////////*/

    function _usdcToGlp(uint256 amount) private view returns (uint256) {
        // aum is in 1e30
        uint256 aum = glpManager.getAum(false);
        // totalSupply is in 1e18
        uint256 totalSupply = glp.totalSupply();

        // 6 + 18 + 24 - 30 = 18 (glp decimals)
        return amount.mulDiv(totalSupply * 1e24, aum);
    }

    function _stakeGlp(address token, uint256 amount, uint256 minUSDG) internal returns (uint256 glpStaked) {
        // swap token to obtain sGLP
        IERC20(token).approve(address(glpManager), amount);
        // will revert if notional output is less than minUSDG
        glpStaked = rewardRouter.mintAndStakeGlp(token, amount, minUSDG, 0);
    }

    function _executeVaultUserBatchStake(
        uint128 usdcAmountToConvert
    ) internal returns (uint128 _roundGlpStaked, uint128 _usdcToConvert) {
        uint128 _roundUsdcBalance = vaultBatchingState.roundUsdcBalance.toUint128();

        _usdcToConvert = usdcAmountToConvert < _roundUsdcBalance ? usdcAmountToConvert : _roundUsdcBalance;

        if (_usdcToConvert == 0) revert NoUsdcBalance();

        // ensure we are atleast swapping minUsdcConversionAmount units of usdc
        //
        // here, _roundUsdcBalance will be always >= _usdcToConvert, because:
        // 1) when swapping first time in round, due to checks in depositUsdc
        // 2) when swapping subsequent times, due to checks below (which ensure remaining usdc >= minUsdcConversionAmount)
        if (_usdcToConvert < minUsdcConversionAmount.toUint128()) _usdcToConvert = minUsdcConversionAmount.toUint128();

        if ((_roundUsdcBalance - _usdcToConvert) <= minUsdcConversionAmount) _usdcToConvert = _roundUsdcBalance;

        // eventually, vaultBatchingState.roundUsdcBalance should become 0 for current round
        // (due to above conditions)
        vaultBatchingState.roundUsdcBalance = _roundUsdcBalance - _usdcToConvert;

        // use min price of usdc, because we are selling usdc
        uint256 price = gmxUnderlyingVault.getMinPrice(address(usdc));

        // adjust for decimals and max possible slippage
        uint256 minUsdg = _usdcToConvert.mulDiv(price * 1e12 * (MAX_BPS - slippageThresholdGmxBps), 1e30 * MAX_BPS);

        _roundGlpStaked = _stakeGlp(address(usdc), _usdcToConvert, minUsdg).toUint128();
        vaultBatchingState.roundGlpStaked += _roundGlpStaked;

        emit BatchStake(vaultBatchingState.currentRound, _roundUsdcBalance, _roundGlpStaked);
    }

    function _executeVaultUserBatchDeposit(uint256 depositAmount) internal returns (uint128 _sharesReceived) {
        _sharesReceived = dnGmxJuniorVault.deposit(depositAmount, address(this)).toUint128();
        vaultBatchingState.roundSharesMinted += _sharesReceived;

        emit PartialBatchDeposit(vaultBatchingState.currentRound, depositAmount, _sharesReceived);
    }

    function _claim(address claimer, address receiver, uint256 amount) internal {
        // revert for zero values
        if (receiver == address(0)) revert InvalidInput(0x10);
        if (amount == 0) revert InvalidInput(0x11);

        UserDeposit storage userDeposit = vaultBatchingState.userDeposits[claimer];

        uint128 userUsdcBalance = userDeposit.usdcBalance;
        uint128 userUnclaimedShares = userDeposit.unclaimedShares;

        {
            // Convert previous round usdc balance into unredeemed shares
            uint256 userDepositRound = userDeposit.round;
            if (userDepositRound < vaultBatchingState.currentRound && userUsdcBalance > 0) {
                RoundDeposit storage roundDeposit = vaultBatchingState.roundDeposits[userDepositRound];
                userUnclaimedShares += userUsdcBalance
                    .mulDiv(roundDeposit.totalShares, roundDeposit.totalUsdc)
                    .toUint128();
                userDeposit.usdcBalance = 0;
            }
        }

        if (userUnclaimedShares < amount.toUint128()) revert InsufficientShares(userUnclaimedShares);
        userDeposit.unclaimedShares = userUnclaimedShares - amount.toUint128();

        // transfer junior vault shares to user
        dnGmxJuniorVault.transfer(receiver, amount);

        emit SharesClaimed(claimer, receiver, amount);
    }
}
