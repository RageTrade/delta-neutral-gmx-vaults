// SPDX-License-Identifier: MIT

pragma solidity ^0.8.9;

import { IVault } from '../interfaces/gmx/IVault.sol';
import { IGlpManager } from '../interfaces/gmx/IGlpManager.sol';
import { ISglpExtended } from '../interfaces/gmx/ISglpExtended.sol';
import { IRewardRouterV2 } from '../interfaces/gmx/IRewardRouterV2.sol';

import { Ownable } from '@openzeppelin/contracts/access/Ownable.sol';
import { IERC20 } from '@openzeppelin/contracts/interfaces/IERC20.sol';

import { IDnGmxJuniorVault } from '../interfaces/IDnGmxJuniorVault.sol';

import { FullMath } from '@uniswap/v3-core-0.8-support/contracts/libraries/FullMath.sol';

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
    uint256 internal constant PRICE_PRECISION = 1e30;

    uint256 public slippageThreshold;

    IERC20 internal glp;
    IERC20 internal fsGlp;
    ISglpExtended internal sGlp;

    IVault internal gmxVault;
    IGlpManager internal glpManager;
    IRewardRouterV2 internal rewardRouter;

    IDnGmxJuniorVault internal dnGmxJuniorVault;

    function setSlippageThreshold(uint256 _slippageThreshold) external onlyOwner {
        slippageThreshold = _slippageThreshold;
        emit SlippageThresholdUpdated(_slippageThreshold);
    }

    function setAddresses(IDnGmxJuniorVault _dnGmxJuniorVault, IRewardRouterV2 _rewardRouter) external onlyOwner {
        dnGmxJuniorVault = _dnGmxJuniorVault;

        sGlp = ISglpExtended(dnGmxJuniorVault.asset());

        glp = IERC20(sGlp.glp());
        fsGlp = IERC20(sGlp.stakedGlpTracker());

        rewardRouter = _rewardRouter;
        glpManager = IGlpManager(sGlp.glpManager());

        gmxVault = IVault(glpManager.vault());

        sGlp.approve(address(glpManager), type(uint256).max);

        emit AddressesUpdated(address(_dnGmxJuniorVault), address(_rewardRouter));
    }

    /// @notice allows to withdraw junior vault shares to any token available on gmx
    /// @param from address which is giving shares
    /// @param token output token
    /// @param receiver address of the receiver
    /// @param sGlpAmount amount of sGLP(asset) to withdraw
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
        uint256 outputGlp = fsGlp.balanceOf(address(this));

        uint256 glpPrice = _getGlpPrice(false);
        uint256 tokenPrice = gmxVault.getMaxPrice(token);

        uint256 minTokenOut = outputGlp.mulDiv(glpPrice * (MAX_BPS - slippageThreshold), tokenPrice * MAX_BPS);

        amountOut = rewardRouter.unstakeAndRedeemGlp(address(token), outputGlp, minTokenOut, receiver);
    }

    function _getGlpPrice(bool maximize) private view returns (uint256) {
        uint256 aum = glpManager.getAum(maximize);
        uint256 totalSupply = glp.totalSupply();

        return aum.mulDiv(PRICE_PRECISION, totalSupply * 1e24);
    }
}
