// SPDX-License-Identifier: MIT

pragma solidity ^0.8.9;

import { IVault } from '../interfaces/gmx/IVault.sol';
import { IGlpManager } from '../interfaces/gmx/IGlpManager.sol';
import { ISglpExtended } from '../interfaces/gmx/ISglpExtended.sol';
import { IRewardRouterV2 } from '../interfaces/gmx/IRewardRouterV2.sol';

import { Ownable } from '@openzeppelin/contracts/access/Ownable.sol';
import { IERC20 } from '@openzeppelin/contracts/interfaces/IERC20.sol';
import { IERC20Metadata } from '@openzeppelin/contracts/interfaces/IERC20Metadata.sol';

import { IDnGmxJuniorVault } from '../interfaces/IDnGmxJuniorVault.sol';

import { FullMath } from '@uniswap/v3-core/contracts/libraries/FullMath.sol';

/**
 * @title Periphery to convert tokens to junior vault shares
 * @notice uses a fixed max slippage threshold
 * @notice primarily constructed to be used from frontend
 * @author RageTrade
 **/

contract DepositPeriphery is Ownable {
    using FullMath for uint256;

    event TokenDeposited(
        address indexed from,
        address indexed receiver,
        address token,
        uint256 assets,
        uint256 shares,
        uint256 tokensSpent
    );

    event SlippageThresholdUpdated(uint256 newSlippageThreshold);

    event AddressesUpdated(address juniorVault, address rewardRouter);

    uint256 internal constant MAX_BPS = 10_000;
    // same price precision is used in gmx's Vault (Vault.sol)
    uint256 internal constant PRICE_PRECISION = 1e30;

    // max allowed slippage threshold (in bps) when sGlp to output token
    uint256 public slippageThreshold;

    // staked glp
    ISglpExtended internal sGlp;

    // gmx's Vault (vault.sol) contract
    IVault internal gmxVault;
    // gmx's GlpManager (GlpManager.sol), which can burn/mint glp
    IGlpManager internal glpManager;
    // gmx's RewardRouterV2 (RewardRouterV2.sol) contract
    IRewardRouterV2 internal rewardRouter;

    // delta neutral junior tranche
    IDnGmxJuniorVault internal dnGmxJuniorVault;

    /// @notice sets the maximum slippage threshold to be used for converting glp for asset
    /// @param _slippageThreshold slippage threshold value in bps
    function setSlippageThreshold(uint256 _slippageThreshold) external onlyOwner {
        slippageThreshold = _slippageThreshold;
        emit SlippageThresholdUpdated(_slippageThreshold);
    }

    /// @notice sets the required external contract address in order to swap glp for tokens
    /// @dev only owner call this setter function
    /// @param _dnGmxJuniorVault junior tranche of delta neutral vault
    /// @param _rewardRouter reward router v2 of gmx protocol
    /// @param _glpManager glp manager of gmx protocol
    function setAddresses(
        IDnGmxJuniorVault _dnGmxJuniorVault,
        IRewardRouterV2 _rewardRouter,
        IGlpManager _glpManager
    ) external onlyOwner {
        rewardRouter = _rewardRouter;
        dnGmxJuniorVault = _dnGmxJuniorVault;

        // query sGlp direclty from junior tranche
        sGlp = ISglpExtended(dnGmxJuniorVault.asset());

        glpManager = _glpManager;

        // query gmxVault from glpManager
        gmxVault = IVault(glpManager.vault());

        // give allowance to glpManager to pull & burn sGlp
        sGlp.approve(address(_dnGmxJuniorVault), type(uint256).max);

        emit AddressesUpdated(address(_dnGmxJuniorVault), address(_rewardRouter));
    }

    /// @notice allows to use tokens to deposit into junior vault
    /// @param token input token
    /// @param receiver address of the receiver
    /// @param tokenAmount amount of token to deposit
    /// @return sharesReceived shares received in exchange of token
    function depositToken(
        address token,
        address receiver,
        uint256 tokenAmount
    ) external returns (uint256 sharesReceived) {
        IERC20(token).transferFrom(msg.sender, address(this), tokenAmount);

        uint256 glpReceived = _convertToSglp(token, tokenAmount);

        sharesReceived = dnGmxJuniorVault.deposit(glpReceived, receiver);

        emit TokenDeposited(msg.sender, receiver, token, glpReceived, sharesReceived, tokenAmount);
    }

    function _convertToSglp(address token, uint256 tokenAmount) internal returns (uint256 glpReceived) {
        IERC20(token).approve(address(glpManager), tokenAmount);

        uint8 decimals = IERC20Metadata(token).decimals();

        uint256 price = gmxVault.getMinPrice(token);

        // USDG has 18 decimals
        uint256 minUsdgOut = tokenAmount.mulDiv(
            price * (MAX_BPS - slippageThreshold) * 10**(18 - decimals),
            PRICE_PRECISION * MAX_BPS
        );

        // will revert if notional output is less than minUsdgOut
        glpReceived = rewardRouter.mintAndStakeGlp(token, tokenAmount, minUsdgOut, 0);
    }
}
