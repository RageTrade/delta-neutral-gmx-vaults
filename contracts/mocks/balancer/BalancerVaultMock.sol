// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.0;

import { IERC20 } from '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import { SafeERC20 } from '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';

import { IBalancerVault } from '../../interfaces/balancer/IBalancerVault.sol';
import { IFlashLoanRecipient } from '../../interfaces/balancer/IFlashLoanRecipient.sol';

contract BalancerVaultMock is IBalancerVault {
    using SafeERC20 for IERC20;

    function flashLoan(
        address recipient,
        address[] memory tokens,
        uint256[] memory amounts,
        bytes memory userData
    ) external override {
        uint256[] memory preLoanBalances = new uint256[](tokens.length);
        uint256[] memory feeAmounts = new uint256[](tokens.length);

        address previousToken = address(0);
        for (uint256 i = 0; i < tokens.length; i++) {
            require(tokens[i] > previousToken, 'BalancerVaultMock: tokens must be sorted');
            previousToken = tokens[i];

            preLoanBalances[i] = IERC20(tokens[i]).balanceOf(address(this));

            require(preLoanBalances[i] >= amounts[i], 'BalancerVaultMock: insufficient balance to flashloan');
            IERC20(tokens[i]).safeTransfer(recipient, amounts[i]);
            feeAmounts[i] = 0; // fee is zero
        }

        IFlashLoanRecipient(recipient).receiveFlashLoan(tokens, amounts, feeAmounts, userData);

        for (uint256 i = 0; i < tokens.length; i++) {
            uint256 postLoanBalance = IERC20(tokens[i]).balanceOf(address(this));

            require(postLoanBalance >= preLoanBalances[i], 'BalancerVaultMock: amount not returned');
        }
    }
}
