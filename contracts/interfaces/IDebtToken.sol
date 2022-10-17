// SPDX-License-Identifier: MIT

pragma solidity ^0.8.9;

import { IVariableDebtToken } from '@aave/core-v3/contracts/interfaces/IVariableDebtToken.sol';

interface IDebtToken is IVariableDebtToken {
    function balanceOf(address user) external view returns (uint256);
}
