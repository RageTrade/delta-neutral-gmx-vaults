// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.0;

import '../libraries/SafeCast.sol';

contract SafeCastTest {
    function toUint128(uint256 y) public pure returns (uint128 z) {
        return SafeCast.toUint128(y);
    }

    function toInt128(int256 y) public pure returns (int128 z) {
        return SafeCast.toInt128(y);
    }

    function toInt256(uint256 y) public pure returns (int256 z) {
        return SafeCast.toInt256(y);
    }
}
