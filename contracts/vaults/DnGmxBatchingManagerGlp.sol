// SPDX-License-Identifier: MIT

pragma solidity ^0.8.9;

import { IERC20 } from '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import { OwnableUpgradeable } from '@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol';
import { PausableUpgradeable } from '@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol';

import { FullMath } from '@uniswap/v3-core/contracts/libraries/FullMath.sol';

import { IDnGmxJuniorVault } from '../interfaces/IDnGmxJuniorVault.sol';
import { IDnGmxBatchingManagerGlp } from '../interfaces/IDnGmxBatchingManagerGlp.sol';
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

contract DnGmxBatchingManagerGlp is IDnGmxBatchingManagerGlp, OwnableUpgradeable, PausableUpgradeable {
    using FullMath for uint256;
    using FullMath for uint128;
    using SafeCast for uint256;

    struct VaultBatchingState {
        // round indentifier
        uint256 currentRound;
        // junior vault shares minted in current roudn
        uint256 roundSharesMinted;
        // amount of sGlp received in current round
        uint256 roundGlpDeposited;
        // amount of usdc recieved in current round
        uint256 roundAssetBalance;
        // stores junior vault shares accumuated for user
        mapping(address user => UserDeposit) userDeposits;
        // stores total glp received in a given round
        mapping(uint256 roundId => RoundDeposit) roundDeposits;
    }

    uint256 private constant MAX_BPS = 10_000;

    // keeper can be EOA or smart contracts which executes stake and batch
    address public keeper;
    // delta neutral junior tranche
    IDnGmxJuniorVault public dnGmxJuniorVault;

    uint256 public depositCap;

    // !!! previously this variable was glpDepositPendingThreshold
    // re-using same storage slot for storing threshold on usdc (instead of glp compared to previous version)
    uint256 public minGlpDepositThreshold;

    // staked glp
    IERC20 private sGlp;

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
    /// @param _rewardRouter gmx protocol's reward router v2
    /// @param _dnGmxJuniorVault address of delta neutral junior tranche
    function initialize(
        IERC20 _sGlp,
        IRewardRouterV2 _rewardRouter,
        IGlpManager _glpManager,
        address _dnGmxJuniorVault,
        address _keeper
    ) external initializer {
        __Ownable_init();
        __Pausable_init();
        __GMXBatchingManager_init(_sGlp, _rewardRouter, _glpManager, _dnGmxJuniorVault, _keeper);
    }

    /* solhint-disable-next-line func-name-mixedcase */
    function __GMXBatchingManager_init(
        IERC20 _sGlp,
        IRewardRouterV2 _rewardRouter,
        IGlpManager _glpManager,
        address _dnGmxJuniorVault,
        address _keeper
    ) internal onlyInitializing {
        sGlp = _sGlp;
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
    function setThresholds(uint256 _minGlpDepositThreshold) external onlyOwner {
        minGlpDepositThreshold = _minGlpDepositThreshold;
        emit ThresholdsUpdated(_minGlpDepositThreshold);
    }

    function setDepositCap(uint256 _depositCap) external onlyOwner {
        depositCap = _depositCap;
        emit DepositCapUpdated(_depositCap);
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

    function deposit(uint256 amount, address receiver) external whenNotPaused {
        // revert for zero values
        if (amount == 0) revert InvalidInput(0x21);
        if (receiver == address(0)) revert InvalidInput(0x22);

        // revert if deposit amount is too low,
        // such that it would revert while converting to glp if it was only deposit in batch
        if (amount < minGlpDepositThreshold) revert InvalidInput(0x23);

        if (vaultBatchingState.roundAssetBalance + amount > depositCap) revert DepositCapBreached();

        // user gives approval to batching manager to spend usdc
        sGlp.transferFrom(msg.sender, address(this), amount);

        UserDeposit storage userDeposit = vaultBatchingState.userDeposits[receiver];
        uint128 userAssetBalance = userDeposit.assetBalance;

        // Convert previous round glp balance into unredeemed shares
        uint256 userDepositRound = userDeposit.round;
        if (userDepositRound < vaultBatchingState.currentRound && userAssetBalance > 0) {
            // update user's unclaimed shares with previous executed batch
            RoundDeposit storage roundDeposit = vaultBatchingState.roundDeposits[userDepositRound];
            userDeposit.unclaimedShares += userDeposit
                .assetBalance
                .mulDiv(roundDeposit.totalShares, roundDeposit.totalAssets)
                .toUint128();
            userAssetBalance = 0;
        }

        // Update round and glp balance for current round
        userDeposit.round = vaultBatchingState.currentRound;
        userDeposit.assetBalance = userAssetBalance + amount.toUint128();
        vaultBatchingState.roundAssetBalance += amount.toUint128();

        emit DepositToken(vaultBatchingState.currentRound, address(sGlp), receiver, amount, 0);
    }

    function executeBatch(uint128 sGlpToDeposit) external onlyKeeper {
        if (!paused()) _pause();

        if (sGlpToDeposit == 0) revert InvalidInput(0x40);

        uint128 _roundAssetBalance = vaultBatchingState.roundAssetBalance.toUint128();

        uint128 _sGlpToDeposit = sGlpToDeposit < _roundAssetBalance ? sGlpToDeposit : _roundAssetBalance;

        if (_sGlpToDeposit == 0) revert NoAssetBalance();

        // ensure we are atleast swapping minGlpDepositThreshold units of usdc
        //
        // here, _roundAssetBalance will be always >= _sGlpToDeposit, because:
        // 1) usdcConversionFractionBps <= MAX_BPS
        //
        // here, _roundAssetBalance will be always >= minGlpDepositThreshold because:
        // 1) when swapping first time in round, due to checks in depositUsdc
        // 2) when swapping subsequent times, due to checks below (which ensure remaining usdc >= minGlpDepositThreshold)
        if (_sGlpToDeposit < minGlpDepositThreshold.toUint128()) _sGlpToDeposit = minGlpDepositThreshold.toUint128();

        if ((_roundAssetBalance - _sGlpToDeposit) <= minGlpDepositThreshold) _sGlpToDeposit = _roundAssetBalance;

        // eventually, vaultBatchingState.roundAssetBalance should become 0 for current round
        // (due to above conditions)
        vaultBatchingState.roundAssetBalance = _roundAssetBalance - _sGlpToDeposit;

        vaultBatchingState.roundGlpDeposited += _sGlpToDeposit;
        ////
        uint128 sharesReceived = _executeVaultUserBatchDeposit(_sGlpToDeposit);
        uint128 assetRemainingInRound = vaultBatchingState.roundAssetBalance.toUint128();

        vaultBatchingState.roundDeposits[vaultBatchingState.currentRound].totalAssets += _sGlpToDeposit;
        vaultBatchingState.roundDeposits[vaultBatchingState.currentRound].totalShares += sharesReceived;

        // move current round to roundDeposits and reset state variables when batch is executed
        if (assetRemainingInRound == 0) {
            emit BatchDeposit(
                vaultBatchingState.currentRound,
                vaultBatchingState.roundDeposits[vaultBatchingState.currentRound].totalAssets,
                vaultBatchingState.roundGlpDeposited,
                vaultBatchingState.roundSharesMinted
            );

            // reset curret round's bal and increase round id
            vaultBatchingState.roundGlpDeposited = 0;
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

    /*//////////////////////////////////////////////////////////////
                                GETTERS
    //////////////////////////////////////////////////////////////*/

    /// @notice gets the current active round
    function currentRound() external view returns (uint256) {
        return vaultBatchingState.currentRound;
    }

    /// @notice get the glp balance for a given vault and account address
    /// @param account address of user
    function assetBalance(address account) public view returns (uint256 balance) {
        balance = vaultBatchingState.userDeposits[account].assetBalance;
    }

    /// @notice get the unclaimed shares for a given vault and account address
    /// @param account address of user
    function unclaimedShares(address account) public view returns (uint256 shares) {
        UserDeposit memory userDeposit = vaultBatchingState.userDeposits[account];
        shares = userDeposit.unclaimedShares;

        if (userDeposit.round < vaultBatchingState.currentRound && userDeposit.assetBalance > 0) {
            RoundDeposit memory roundDeposit = vaultBatchingState.roundDeposits[userDeposit.round];
            shares += userDeposit.assetBalance.mulDiv(roundDeposit.totalShares, roundDeposit.totalAssets).toUint128();
        }
    }

    /// @notice get the glp balance for current active round
    function roundAssetBalance() external view returns (uint256) {
        return vaultBatchingState.roundAssetBalance;
    }

    /// @notice get the glp balance for current active round
    function roundGlpDeposited() external view returns (uint256) {
        return vaultBatchingState.roundGlpDeposited;
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

        uint128 userAssetBalance = userDeposit.assetBalance;
        uint128 userUnclaimedShares = userDeposit.unclaimedShares;

        {
            // Convert previous round glp balance into unredeemed shares
            uint256 userDepositRound = userDeposit.round;
            if (userDepositRound < vaultBatchingState.currentRound && userAssetBalance > 0) {
                RoundDeposit storage roundDeposit = vaultBatchingState.roundDeposits[userDepositRound];
                userUnclaimedShares += userAssetBalance
                    .mulDiv(roundDeposit.totalShares, roundDeposit.totalAssets)
                    .toUint128();
                userDeposit.assetBalance = 0;
            }
        }

        if (userUnclaimedShares < amount.toUint128()) revert InsufficientShares(userUnclaimedShares);
        userDeposit.unclaimedShares = userUnclaimedShares - amount.toUint128();

        // transfer junior vault shares to user
        dnGmxJuniorVault.transfer(receiver, amount);

        emit SharesClaimed(claimer, receiver, amount);
    }
}
