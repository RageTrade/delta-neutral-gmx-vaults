// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0;

import { FixedPointMathLib } from '@rari-capital/solmate/src/utils/FixedPointMathLib.sol';

library SignedFixedPointMathLib {
    function abs(int256 a) internal pure returns (uint256) {
        return a < 0 ? uint256(-a) : uint256(a);
    }

    function sign(int256 a) internal pure returns (int256) {
        return a < 0 ? -1 : int256(1);
    }

    function mulDivDown(
        int256 x,
        uint256 y,
        uint256 denominator
    ) internal pure returns (int256 z) {
        z = sign(x) * int256(FixedPointMathLib.mulDivDown(abs(x), y, denominator));
    }
}
