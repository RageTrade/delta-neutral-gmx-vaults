// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.0;

import '../vaults/DnGmxTraderHedgeStrategy.sol';

contract DnGmxTraderHedgeStrategyTest is DnGmxTraderHedgeStrategy {
    function getMaxTokenHedgeAmount(address token, uint256 glpDeposited) external view returns (int256) {
        return _getMaxTokenHedgeAmount(token, glpDeposited);
    }

    function getTokenHedgeAmount(
        address token,
        uint256 glpDeposited,
        uint256 glpTotalSupply,
        uint16 _traderOIHedgeBps
    ) external view returns (int256) {
        return _getTokenHedgeAmount(token, glpDeposited, glpTotalSupply, _traderOIHedgeBps);
    }
}
