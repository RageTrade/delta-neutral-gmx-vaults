// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.0;

import '../vaults/DnGmxTraderHedgeStrategy.sol';

contract DnGmxTraderHedgeStrategyTest is DnGmxTraderHedgeStrategy {
    function getTokenHedgeAmount(
        address token,
        uint256 glpDeposited,
        uint256 glpTotalSupply,
        uint16 _traderOIHedgeBps
    ) external view returns (int256) {
        return _getTokenHedgeAmount(token, glpDeposited, glpTotalSupply, _traderOIHedgeBps);
    }

    function checkHedgeAmounts(int128 _btcTraderOIHedge, int128 _ethTraderOIHedge) external view returns (bool) {
        return _checkHedgeAmounts(_btcTraderOIHedge, _ethTraderOIHedge);
    }

    function checkTokenHedgeAmount(int256 tokenTraderOIHedge, int256 tokenTraderOIMax) external pure returns (bool) {
        return _checkTokenHedgeAmount(tokenTraderOIHedge, tokenTraderOIMax);
    }

    function getMaxTokenHedgeAmount(address token, uint256 glpDeposited) external view returns (int256) {
        return _getMaxTokenHedgeAmount(token, glpDeposited);
    }
}
