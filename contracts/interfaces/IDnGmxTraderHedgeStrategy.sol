// SPDX-License-Identifier: MIT

import { IERC20 } from '@openzeppelin/contracts/token/ERC20/IERC20.sol';

pragma solidity ^0.8.9;

interface IDnGmxTraderHedgeStrategy {
    function overrideTraderOIHedges(int128 btcTraderOIHedge, int128 ethTraderOIHedge) external;

    function setTraderOIHedgeBps(uint16 _traderOIHedgeBps) external;

    function setTraderOIHedges() external;

    function btcTraderOIHedge() external view returns (int128);

    function ethTraderOIHedge() external view returns (int128);
}
