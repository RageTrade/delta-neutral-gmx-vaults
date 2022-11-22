// SPDX-License-Identifier: MIT

pragma solidity ^0.8.9;

import { IERC4626 } from '../interfaces/IERC4626.sol';
import { Ownable } from '@openzeppelin/contracts/access/Ownable.sol';
import { IERC20 } from '@openzeppelin/contracts/interfaces/IERC20.sol';

/**
 * @title batching manager bypass contract
 * @notice it acts as circuit breaker to prevent cooldown on batching manager by receiving sGlp and depositing it into juniorVault
 * @author RageTrade
 **/

contract BatchingManagerBypass is Ownable {
    IERC20 internal sGlp;
    IERC4626 internal juniorVault;

    /// @notice sets the junior vault address, only owner can call this function
    /// @param _juniorVault address of DnGmxJuniorVault
    function setJuniorVault(IERC4626 _juniorVault) external onlyOwner {
        juniorVault = _juniorVault;
    }

    /// @notice sets the junior staked glp address, only owner can call this function
    /// @param _sGlp address of StakedGlp
    function setSglp(IERC20 _sGlp) external onlyOwner {
        sGlp = _sGlp;
        sGlp.approve(address(juniorVault), type(uint256).max);
    }

    /// @notice receives sGlp from batching manager and deposits it into juniorVault
    /// @param glpAmount amount of staked glp sent by batching manager
    /// @param receiver address of receiver of juniorVault shares
    function deposit(uint256 glpAmount, address receiver) external returns (uint256) {
        return juniorVault.deposit(glpAmount, receiver);
    }
}
