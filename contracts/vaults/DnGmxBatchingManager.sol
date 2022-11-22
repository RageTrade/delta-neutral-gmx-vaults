// SPDX-License-Identifier: MIT

pragma solidity ^0.8.9;

import { IERC20 } from '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import { OwnableUpgradeable } from '@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol';
import { PausableUpgradeable } from '@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol';

import { FullMath } from '@uniswap/v3-core-0.8-support/contracts/libraries/FullMath.sol';

import { IDnGmxJuniorVault } from '../interfaces/IDnGmxJuniorVault.sol';
import { IDnGmxBatchingManager } from '../interfaces/IDnGmxBatchingManager.sol';
import { IGlpManager } from '../interfaces/gmx/IGlpManager.sol';
import { IRewardRouterV2 } from '../interfaces/gmx/IRewardRouterV2.sol';
import { IVault } from '../interfaces/gmx/IVault.sol';

import { IBatchingManagerBypass } from '../interfaces/IBatchingManagerBypass.sol';

import { SafeCast } from '../libraries/SafeCast.sol';

/**
 * @title Batching Manager to avoid glp transfer cooldowm
 * @notice batches the incoming deposit token depoists after converting them to glp
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
        // amount of sGlp received in current round
        uint256 roundGlpStaked;
        // amount of usdc recieved in current round
        uint256 roundUsdcBalance;
        // stores junior vault shares accumuated for user
        mapping(address => UserDeposit) userDeposits;
        // stores total glp received in a given round
        mapping(uint256 => RoundDeposit) roundDeposits;
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

    // batching mangager bypass contract
    IBatchingManagerBypass private bypass;

    // batching manager's state
    VaultBatchingState public vaultBatchingState;

    // these gaps are added to allow adding new variables without shifting down inheritance chain
    uint256[50] private __gaps;

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

    /// @notice sets the keeper address (to pause & unpause deposits)
    /// @param _keeper address of keeper
    function setKeeper(address _keeper) external onlyOwner {
        keeper = _keeper;
        emit KeeperUpdated(_keeper);
    }

    function setBypass(IBatchingManagerBypass _bypass) external onlyOwner {
        bypass = _bypass;
    }

    /// @notice sets the slippage (in bps) to use while staking on gmx
    /// @param _slippageThresholdGmxBps slippage (in bps)
    function setThresholds(uint256 _slippageThresholdGmxBps) external onlyOwner {
        slippageThresholdGmxBps = _slippageThresholdGmxBps;
        emit ThresholdsUpdated(_slippageThresholdGmxBps);
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

    /// @notice convert the token into glp and obtain staked glp
    /// @dev this function should be only called by junior vault
    /// @param token address of input token (should be supported on gmx)
    /// @param amount amount of token to be used
    /// @param minUSDG minimum output of swap in terms of USDG
    function depositToken(
        address token,
        uint256 amount,
        uint256 minUSDG
    ) external whenNotPaused onlyDnGmxJuniorVault returns (uint256 glpStaked) {
        // revert for zero values
        if (token == address(0)) revert InvalidInput(0x30);
        if (amount == 0) revert InvalidInput(0x31);

        // dnGmxJuniorVault gives approval to batching manager to spend token
        IERC20(token).transferFrom(msg.sender, address(this), amount);

        // convert tokens to glp
        glpStaked = _stakeGlp(token, amount, minUSDG);
        dnGmxJuniorVaultGlpBalance += glpStaked.toUint128();

        emit DepositToken(0, token, msg.sender, amount, glpStaked);
    }

    function depositUsdc(uint256 amount, address receiver) external whenNotPaused {
        // revert for zero values
        if (amount == 0) revert InvalidInput(0x21);
        if (receiver == address(0)) revert InvalidInput(0x22);

        // user gives approval to batching manager to spend usdc
        usdc.transferFrom(msg.sender, address(this), amount);

        UserDeposit storage userDeposit = vaultBatchingState.userDeposits[receiver];
        uint128 userUsdcBalance = userDeposit.usdcBalance;

        // Convert previous round glp balance into unredeemed shares
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

        // Update round and glp balance for current round
        userDeposit.round = vaultBatchingState.currentRound;
        userDeposit.usdcBalance = userUsdcBalance + amount.toUint128();
        vaultBatchingState.roundUsdcBalance += amount.toUint128();

        emit DepositToken(vaultBatchingState.currentRound, address(usdc), receiver, amount, 0);
    }

    /// @notice executes batch and deposits into appropriate vault with/without minting shares
    function executeBatchStake() external whenNotPaused onlyKeeper {
        // Harvest fees prior to executing batch deposit to prevent cooldown
        dnGmxJuniorVault.harvestFees();

        // Convert usdc in round to sglp
        _executeVaultUserBatchStake();

        // To be unpaused when the staked amount is deposited
        _pause();
    }

    /// @notice executes batch and deposits into appropriate vault with/without minting shares
    function executeBatchDeposit() external {
        // If the deposit is paused then unpause on execute batch deposit
        if (paused()) _unpause();

        // Transfer vault glp directly, Needs to be called only for dnGmxJuniorVault
        if (dnGmxJuniorVaultGlpBalance > 0) {
            uint256 glpToTransfer = dnGmxJuniorVaultGlpBalance;
            dnGmxJuniorVaultGlpBalance = 0;
            sGlp.transfer(address(dnGmxJuniorVault), glpToTransfer);
            emit VaultDeposit(glpToTransfer);
        }

        _executeVaultUserBatchDeposit();
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

    /*//////////////////////////////////////////////////////////////
                                GETTERS
    //////////////////////////////////////////////////////////////*/

    /// @notice gets the current active round
    function currentRound() external view returns (uint256) {
        return vaultBatchingState.currentRound;
    }

    /// @notice get the glp balance for a given vault and account address
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

    /// @notice get the glp balance for current active round
    function roundUsdcBalance() external view returns (uint256) {
        return vaultBatchingState.roundUsdcBalance;
    }

    /// @notice get the glp balance for current active round
    function roundGlpStaked() external view returns (uint256) {
        return vaultBatchingState.roundGlpStaked;
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

    function _stakeGlp(
        address token,
        uint256 amount,
        uint256 minUSDG
    ) internal returns (uint256 glpStaked) {
        // swap token to obtain sGLP
        IERC20(token).approve(address(glpManager), amount);
        // will revert if notional output is less than minUSDG
        glpStaked = rewardRouter.mintAndStakeGlp(token, amount, minUSDG, 0);
    }

    function _executeVaultUserBatchStake() internal {
        uint256 _roundUsdcBalance = vaultBatchingState.roundUsdcBalance;

        if (_roundUsdcBalance == 0) revert NoUsdcBalance();

        // use min price, because we are sending in usdc
        uint256 price = gmxUnderlyingVault.getMinPrice(address(usdc));

        // adjust for decimals and max possible slippage
        uint256 minUsdg = _roundUsdcBalance.mulDiv(price * 1e12 * (MAX_BPS - slippageThresholdGmxBps), 1e30 * MAX_BPS);

        vaultBatchingState.roundGlpStaked = _stakeGlp(address(usdc), _roundUsdcBalance, minUsdg);

        emit BatchStake(vaultBatchingState.currentRound, _roundUsdcBalance, vaultBatchingState.roundGlpStaked);
    }

    function _executeVaultUserBatchDeposit() internal {
        // Transfer user glp through deposit
        if (vaultBatchingState.roundGlpStaked == 0) return;

        sGlp.transfer(address(bypass), vaultBatchingState.roundGlpStaked);
        uint256 totalShares = bypass.deposit(vaultBatchingState.roundGlpStaked, address(this));

        // Update round data
        vaultBatchingState.roundDeposits[vaultBatchingState.currentRound] = RoundDeposit(
            vaultBatchingState.roundUsdcBalance.toUint128(),
            totalShares.toUint128()
        );

        emit BatchDeposit(
            vaultBatchingState.currentRound,
            vaultBatchingState.roundUsdcBalance,
            vaultBatchingState.roundGlpStaked,
            totalShares
        );

        // reset curret round's bal and increase round id
        vaultBatchingState.roundUsdcBalance = 0;
        vaultBatchingState.roundGlpStaked = 0;
        ++vaultBatchingState.currentRound;
    }

    function _claim(
        address claimer,
        address receiver,
        uint256 amount
    ) internal {
        // revert for zero values
        if (receiver == address(0)) revert InvalidInput(0x10);
        if (amount == 0) revert InvalidInput(0x11);

        UserDeposit storage userDeposit = vaultBatchingState.userDeposits[claimer];

        uint128 userUsdcBalance = userDeposit.usdcBalance;
        uint128 userUnclaimedShares = userDeposit.unclaimedShares;

        {
            // Convert previous round glp balance into unredeemed shares
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
