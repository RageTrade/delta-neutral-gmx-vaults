// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

interface IStableSwap {
    ///@dev Get the amount of coin j one would receive for swapping _dx of coin i.
    function get_dy(
        uint256 i,
        uint256 j,
        uint256 dx
    ) external returns (uint256);

    /**
    Perform an exchange between two coins.

    i: Index value for the coin to send
    j: Index value of the coin to receive
    _dx: Amount of i being exchanged
    _min_dy: Minimum amount of j to receive

    Returns the actual amount of coin j received. Index values can be found via the coins public getter method.
    */
    function exchange(
        uint256 i,
        uint256 j,
        uint256 dx,
        uint256 min_dy,
        bool use_eth
    ) external payable;
}
