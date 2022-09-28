// SPDX-License-Identifier: MIT

pragma solidity ^0.8.9;

import { FeeSplitStrategy } from '../libraries/FeeSplitStrategy.sol';

contract FeeSplitStrategyMock {
    using FeeSplitStrategy for FeeSplitStrategy.Info;

    FeeSplitStrategy.Info public info;

    function setFeeSplitStrategy(FeeSplitStrategy.Info calldata _info) external {
        info = _info;
    }

    function getMaxVariableBorrowRate() external view returns (uint256) {
        return info.getMaxVariableBorrowRate();
    }

    function calculateFeeSplit(uint256 availableLiquidity, uint256 usedLiquidity)
        external
        view
        returns (uint256 feeSplitRate)
    {
        feeSplitRate = info.calculateFeeSplit(availableLiquidity, usedLiquidity);
    }
}
