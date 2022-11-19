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

import { FullMath } from '@uniswap/v3-core-0.8-support/contracts/libraries/FullMath.sol';

/**
 * @title Periphery to convert junior vault shares to tokens
 * @notice uses a fixed max slippage threshold
 * @notice primarily constructed to be used from frontend
 * @author RageTrade
 **/

contract WithdrawPeriphery is Ownable {
    using FullMath for uint256;

    event TokenWithdrawn(
        address indexed from,
        address indexed receiver,
        address token,
        uint256 sGlpAmount,
        uint256 tokensRecevied
    );

    event TokenRedeemed(
        address indexed from,
        address indexed receiver,
        address token,
        uint256 sharesAmount,
        uint256 tokensRecevied
    );

    event SlippageThresholdUpdated(uint256 newSlippageThreshold);

    event AddressesUpdated(address juniorVault, address rewardRouter);

    uint256 internal constant MAX_BPS = 1000;
    // same price precision is used in gmx's Vault (Vault.sol)
    uint256 internal constant PRICE_PRECISION = 1e30;

    // max allowed slippage threshold (in bps) when sGlp to output token
    uint256 public slippageThreshold;

    // gmx's Glp (requird to query totalSupply)
    IERC20 internal glp;
    // staked glp tracker is requred to query balanceOf staked glp
    // since staked glp returns 0 when balanceOf is called on it
    IERC20 internal fsGlp;
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
    function setAddresses(IDnGmxJuniorVault _dnGmxJuniorVault, IRewardRouterV2 _rewardRouter) external onlyOwner {
        dnGmxJuniorVault = _dnGmxJuniorVault;

        // query sGlp direclty from junior tranche
        sGlp = ISglpExtended(dnGmxJuniorVault.asset());

        // query glp from sGlp
        glp = IERC20(sGlp.glp());
        // query sGlp direclty from junior tranche
        fsGlp = IERC20(sGlp.stakedGlpTracker());

        rewardRouter = _rewardRouter;
        // query glpManager from sGlp
        glpManager = IGlpManager(sGlp.glpManager());

        // query gmxVault from glpManager
        gmxVault = IVault(glpManager.vault());

        // give allowance to glpManager to pull & burn sGlp
        sGlp.approve(address(glpManager), type(uint256).max);

        emit AddressesUpdated(address(_dnGmxJuniorVault), address(_rewardRouter));
    }

    /// @notice allows to withdraw junior vault shares to any token available on gmx
    /// @param from address which is giving shares
    /// @param token output token
    /// @param receiver address of the receiver
    /// @param sGlpAmount amount of sGLP(asset) to withdraw
    /// @return amountOut tokens received in exchange of glp
    function withdrawToken(
        address from,
        address token,
        address receiver,
        uint256 sGlpAmount
    ) external returns (uint256 amountOut) {
        // user has approved periphery to use junior vault shares
        dnGmxJuniorVault.withdraw(sGlpAmount, address(this), from);

        amountOut = _convertToToken(token, receiver);

        emit TokenWithdrawn(from, receiver, token, sGlpAmount, amountOut);
    }

    /// @notice allows to redeem junior vault shares to any token available on gmx
    /// @param from address which is giving shares
    /// @param token output token
    /// @param receiver address of the receiver
    /// @param sharesAmount amount of shares to burn
    /// @return amountOut tokens received in exchange of glp
    function redeemToken(
        address from,
        address token,
        address receiver,
        uint256 sharesAmount
    ) external returns (uint256 amountOut) {
        // user has approved periphery to use junior vault shares
        dnGmxJuniorVault.redeem(sharesAmount, address(this), from);

        amountOut = _convertToToken(token, receiver);

        emit TokenRedeemed(from, receiver, token, sharesAmount, amountOut);
    }

    function _convertToToken(address token, address receiver) internal returns (uint256 amountOut) {
        // this value should be whatever glp is received by calling withdraw/redeem to junior vault
        uint256 outputGlp = fsGlp.balanceOf(address(this));

        // using min price of glp because giving in glp
        uint256 glpPrice = _getGlpPrice(false);
        // using max price of token because taking token out of gmx
        uint256 tokenPrice = gmxVault.getMaxPrice(token);

        // apply slippage threshold on top of estimated output amount
        uint256 minTokenOut = outputGlp.mulDiv(glpPrice * (MAX_BPS - slippageThreshold), tokenPrice * MAX_BPS);
        minTokenOut = minTokenOut * 10**(IERC20Metadata(token).decimals() - 6);

        // will revert if atleast minTokenOut is not received
        amountOut = rewardRouter.unstakeAndRedeemGlp(address(token), outputGlp, minTokenOut, receiver);
    }

    function _getGlpPrice(bool maximize) private view returns (uint256) {
        // aum is in 1e30
        uint256 aum = glpManager.getAum(maximize);
        // totalSupply is in 1e18
        uint256 totalSupply = glp.totalSupply();

        // price per glp token = (total AUM / total supply)
        // div by 1e24 because of usdc unit (30 - 6)
        return aum.mulDiv(PRICE_PRECISION, totalSupply * 1e24);
    }
}
