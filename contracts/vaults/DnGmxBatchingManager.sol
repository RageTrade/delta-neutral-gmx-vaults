// SPDX-License-Identifier: MIT

pragma solidity ^0.8.9;

import { IERC20 } from '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import { IERC20Metadata } from '@openzeppelin/contracts/interfaces/IERC20Metadata.sol';

import { SafeCast } from '../libraries/SafeCast.sol';
import { FullMath } from '@uniswap/v3-core-0.8-support/contracts/libraries/FullMath.sol';

import { OwnableUpgradeable } from '@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol';
import { PausableUpgradeable } from '@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol';

import { IERC4626 } from 'contracts/interfaces/IERC4626.sol';
import { IGlpManager } from 'contracts/interfaces/gmx/IGlpManager.sol';
import { IRewardRouterV2 } from 'contracts/interfaces/gmx/IRewardRouterV2.sol';
import { IDnGmxBatchingManager } from 'contracts/interfaces/IDnGmxBatchingManager.sol';
import { IDnGmxJuniorVault } from '../interfaces/IDnGmxJuniorVault.sol';

contract DnGmxBatchingManager is IDnGmxBatchingManager, OwnableUpgradeable, PausableUpgradeable {
    using FullMath for uint256;
    using FullMath for uint128;
    using SafeCast for uint256;

    struct VaultBatchingState {
        uint256 currentRound;
        uint256 roundUsdcBalance;
        uint256 roundGlpStaked;
        mapping(address => UserDeposit) userDeposits;
        mapping(uint256 => RoundDeposit) roundDeposits;
    }

    uint256[100] private _gaps;

    address public keeper;
    IDnGmxJuniorVault public dnGmxJuniorVault; // used for depositing harvested rewards

    uint16 public vaultCount;
    uint256 public dnGmxJuniorVaultGlpBalance;

    IERC20 private sGlp;
    IERC20 private usdc;
    IGlpManager private glpManager;
    IRewardRouterV2 private rewardRouter;

    VaultBatchingState public vaultBatchingState;

    uint256[100] private _gaps2;

    modifier onlyDnGmxJuniorVault() {
        if (msg.sender != address(dnGmxJuniorVault)) revert CallerNotVault();
        _;
    }

    modifier onlyKeeper() {
        if (msg.sender != keeper) revert CallerNotKeeper();
        _;
    }

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
        rewardRouter = _rewardRouter;
        glpManager = _glpManager;

        dnGmxJuniorVault = IDnGmxJuniorVault(_dnGmxJuniorVault);

        keeper = _keeper;
        emit KeeperUpdated(_keeper);
    }

    /// @notice grants the allowance to the vault to pull sGLP (via safeTransfer from in vault.deposit)
    /// @dev allowance is granted while vault is added via addVault, this is only failsafe if that allowance is exhausted
    function grantAllowances() external onlyOwner {
        sGlp.approve(address(dnGmxJuniorVault), type(uint256).max);
    }

    /// @notice sets the keeper address (to pause & unpause deposits)
    /// @param _keeper address of keeper
    function setKeeper(address _keeper) external onlyOwner {
        keeper = _keeper;
        emit KeeperUpdated(_keeper);
    }

    /// @notice pauses deposits (to prevent DOS due to GMX 15 min cooldown)
    function pauseDeposit() external onlyKeeper {
        _pause();
    }

    /// @notice unpauses the deposit function
    function unpauseDeposit() external onlyKeeper {
        _unpause();
    }

    /// @notice convert the token into glp and obtain staked glp
    /// @dev this function should be only called by staking manager
    /// @param token address of input token (should be supported on gmx)
    /// @param amount amount of token to be used
    /// @param minUSDG minimum output of swap in terms of USDG
    function depositToken(
        address token,
        uint256 amount,
        uint256 minUSDG
    ) external whenNotPaused onlyDnGmxJuniorVault returns (uint256 glpStaked) {
        if (token == address(0)) revert InvalidInput(0x30);
        if (amount == 0) revert InvalidInput(0x31);

        IERC20(token).transferFrom(msg.sender, address(this), amount);

        // Convert tokens to glp
        glpStaked = _stakeGlp(token, amount, minUSDG);
        dnGmxJuniorVaultGlpBalance += glpStaked.toUint128();

        emit DepositToken(0, token, msg.sender, amount, glpStaked);
    }

    // /// @notice convert the token into glp and obtain staked glp and deposits sGLP into vault
    // /// @param token address of input token (should be supported on gmx)
    // /// @param amount amount of token to be used
    // /// @param minUSDG minimum output of swap in terms of USDG
    // /// @param receiver address which will receive shares from vault+
    // function depositToken(
    //     address token,
    //     uint256 amount,
    //     uint256 minUSDG,
    //     address receiver
    // ) external whenNotPaused returns (uint256 glpStaked) {
    //     if (token == address(0)) revert InvalidInput(0x20);
    //     if (amount == 0) revert InvalidInput(0x21);
    //     if (receiver == address(0)) revert InvalidInput(0x22);

    //     // Transfer Tokens To Manager
    //     IERC20(token).transferFrom(msg.sender, address(this), amount);

    //     UserDeposit storage userDeposit = vaultBatchingState.userDeposits[receiver];
    //     uint128 userUsdcBalance = userDeposit.usdcBalance;

    //     //Convert previous round glp balance into unredeemed shares
    //     uint256 userDepositRound = userDeposit.round;
    //     if (userDepositRound < vaultBatchingState.currentRound && userUsdcBalance > 0) {
    //         RoundDeposit storage roundDeposit = vaultBatchingState.roundDeposits[userDepositRound];
    //         userDeposit.unclaimedShares += userDeposit
    //             .usdcBalance
    //             .mulDiv(roundDeposit.totalShares, roundDeposit.totalUsdc)
    //             .toUint128();
    //         userUsdcBalance = 0;
    //     }

    //     // Convert tokens to glp
    //     glpStaked = _stakeGlp(token, amount, minUSDG);

    //     //Update round and glp balance for current round
    //     userDeposit.round = vaultBatchingState.currentRound;
    //     userDeposit.usdcBalance = userUsdcBalance + glpStaked.toUint128();
    //     vaultBatchingState.roundUsdcBalance += glpStaked.toUint128();

    //     emit DepositToken(vaultBatchingState.currentRound, token, receiver, amount, glpStaked);
    // }

    function depositUsdc(uint256 amount, address receiver) external whenNotPaused returns (uint256 glpStaked) {
        if (amount == 0) revert InvalidInput(0x21);
        if (receiver == address(0)) revert InvalidInput(0x22);

        // Transfer Tokens To Manager
        usdc.transferFrom(msg.sender, address(this), amount);

        UserDeposit storage userDeposit = vaultBatchingState.userDeposits[receiver];
        uint128 userUsdcBalance = userDeposit.usdcBalance;

        //Convert previous round glp balance into unredeemed shares
        uint256 userDepositRound = userDeposit.round;
        if (userDepositRound < vaultBatchingState.currentRound && userUsdcBalance > 0) {
            RoundDeposit storage roundDeposit = vaultBatchingState.roundDeposits[userDepositRound];
            userDeposit.unclaimedShares += userDeposit
                .usdcBalance
                .mulDiv(roundDeposit.totalShares, roundDeposit.totalUsdc)
                .toUint128();
            userUsdcBalance = 0;
        }

        // Convert tokens to glp
        // glpStaked = _stakeGlp(token, amount, minUSDG);

        //Update round and glp balance for current round
        userDeposit.round = vaultBatchingState.currentRound;
        userDeposit.usdcBalance = userUsdcBalance + amount.toUint128();
        vaultBatchingState.roundUsdcBalance += amount.toUint128();

        emit DepositToken(vaultBatchingState.currentRound, address(usdc), receiver, amount, glpStaked);
    }

    /// @notice executes batch and deposits into appropriate vault with/without minting shares
    function executeBatchStake() external {
        // Transfer vault glp directly
        // Needs to be called only for dnGmxJuniorVault
        // if (dnGmxJuniorVaultGlpBalance > 0) {
        //     uint256 glpToTransfer = dnGmxJuniorVaultGlpBalance;
        //     dnGmxJuniorVaultGlpBalance = 0;
        //     sGlp.transfer(address(dnGmxJuniorVault), glpToTransfer);
        //     emit VaultDeposit(glpToTransfer);
        // }

        _executeVaultUserBatchStake();
        // If the deposit is unpaused then pause on execute batch stake
        // To be unpaused when the staked amount is deposited
        if (!paused()) {
            _pause();
        }
    }

    /// @notice executes batch and deposits into appropriate vault with/without minting shares
    function executeBatchDeposit() external {
        // Transfer vault glp directly
        // Needs to be called only for dnGmxJuniorVault
        if (dnGmxJuniorVaultGlpBalance > 0) {
            uint256 glpToTransfer = dnGmxJuniorVaultGlpBalance;
            dnGmxJuniorVaultGlpBalance = 0;
            sGlp.transfer(address(dnGmxJuniorVault), glpToTransfer);
            emit VaultDeposit(glpToTransfer);
        }

        _executeVaultUserBatchDeposit();
        // If the deposit is paused then unpause on execute batch deposit
        if (paused()) {
            _unpause();
        }
    }

    function _executeVaultUserBatchStake() internal {
        if (vaultBatchingState.roundUsdcBalance > 0) {
            uint256 minUsdg = 0; // TODO: add handling for minUsdg calculation
            vaultBatchingState.roundGlpStaked = _stakeGlp(address(usdc), vaultBatchingState.roundUsdcBalance, minUsdg);
            emit BatchStake(
                vaultBatchingState.currentRound,
                vaultBatchingState.roundUsdcBalance,
                vaultBatchingState.roundGlpStaked
            );
        } else {
            revert NoUsdcBalance();
        }
    }

    function _executeVaultUserBatchDeposit() internal {
        // Transfer user glp through deposit
        if (vaultBatchingState.roundGlpStaked > 0) {
            uint256 totalShares = dnGmxJuniorVault.deposit(vaultBatchingState.roundGlpStaked, address(this));

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

            vaultBatchingState.roundUsdcBalance = 0;
            vaultBatchingState.roundGlpStaked = 0;
            ++vaultBatchingState.currentRound;
        }
    }

    /// @notice get the glp balance for a given vault and account address
    /// @param account address of user
    function usdcBalance(address account) public view returns (uint256 balance) {
        balance = vaultBatchingState.userDeposits[account].usdcBalance;
    }

    /// @notice get the unclaimed shares for a given vault and account address
    /// @param account address of user
    function unclaimedShares(address account) external view returns (uint256 shares) {
        UserDeposit memory userDeposit = vaultBatchingState.userDeposits[account];
        shares = userDeposit.unclaimedShares;

        if (userDeposit.round < vaultBatchingState.currentRound && userDeposit.usdcBalance > 0) {
            RoundDeposit memory roundDeposit = vaultBatchingState.roundDeposits[userDeposit.round];
            shares += userDeposit.usdcBalance.mulDiv(roundDeposit.totalShares, roundDeposit.totalUsdc).toUint128();
        }
    }

    /// @notice claim the shares received from depositing batch
    /// @param receiver address of receiver
    /// @param amount amount of shares
    function claim(address receiver, uint256 amount) external {
        if (receiver == address(0)) revert InvalidInput(0x10);
        if (amount == 0) revert InvalidInput(0x11);

        UserDeposit storage userDeposit = vaultBatchingState.userDeposits[msg.sender];
        uint128 userUnclaimedShares = userDeposit.unclaimedShares;
        uint128 userUsdcBalance = userDeposit.usdcBalance;
        {
            //Convert previous round glp balance into unredeemed shares
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
        dnGmxJuniorVault.transfer(receiver, amount);

        emit SharesClaimed(msg.sender, receiver, amount);
    }

    /// @notice gets the current active round
    function currentRound() external view returns (uint256) {
        return vaultBatchingState.currentRound;
    }

    /// @notice get the glp balance for current active round
    function roundUsdcBalance() external view returns (uint256) {
        return vaultBatchingState.roundUsdcBalance;
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

    function _stakeGlp(
        address token,
        uint256 amount,
        uint256 minUSDG
    ) internal returns (uint256 glpStaked) {
        // Convert tokens to glp and stake glp to obtain sGLP
        IERC20(token).approve(address(glpManager), amount);
        glpStaked = rewardRouter.mintAndStakeGlp(token, amount, minUSDG, 0);
    }
}
