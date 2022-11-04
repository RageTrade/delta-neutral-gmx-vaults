// SPDX-License-Identifier: MIT

pragma solidity ^0.8.9;

import { IERC4626 } from '../interfaces/IERC4626.sol';
import { Ownable } from '@openzeppelin/contracts/access/Ownable.sol';
import { IERC20 } from '@openzeppelin/contracts/interfaces/IERC20.sol';

contract BatchingManagerBypass is Ownable {
    IERC20 internal sGlp;
    IERC4626 internal juniorVault;

    function setJuniorVault(IERC4626 _juniorVault) external onlyOwner {
        juniorVault = _juniorVault;
    }

    function setSglp(IERC20 _sGlp) external onlyOwner {
        sGlp = _sGlp;
        sGlp.approve(address(juniorVault), type(uint256).max);
    }

    function deposit(uint256 glpAmount, address receiver) external returns (uint256) {
        return juniorVault.deposit(glpAmount, receiver);
    }
}
