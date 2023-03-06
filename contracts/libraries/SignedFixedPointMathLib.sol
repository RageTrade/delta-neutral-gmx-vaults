// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0;

import { FixedPointMathLib } from '@rari-capital/solmate/src/utils/FixedPointMathLib.sol';
import { SignedMathUpgradeable } from '@openzeppelin/contracts-upgradeable/utils/math/SignedMathUpgradeable.sol';

library SignedFixedPointMathLib {
    function sign(int256 a) internal pure returns (int256) {
        return a < 0 ? -1 : int256(1);
    }

    function mulDivDown(int256 x, uint256 y, uint256 denominator) internal pure returns (int256 z) {
        int256 _sign = sign(x);
        z = _sign * int256(FixedPointMathLib.mulDivDown(SignedMathUpgradeable.abs(x), y, denominator));
        if (_sign < 0) {
            z--;
        }
    }
}
