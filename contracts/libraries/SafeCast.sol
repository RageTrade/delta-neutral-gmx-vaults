// SPDX-License-Identifier: MIT

pragma solidity >=0.8.0;

/// @title safe casting methods
/// @notice contains methods for safely casting between types
/// @author adapted from https://github.com/OpenZeppelin/openzeppelin-contracts/blob/master/contracts/utils/math/SafeCast.sol

/**
 * @dev Wrappers over Solidity's uintXX/intXX casting operators with added overflow
 * checks.
 *
 * Downcasting from uint256/int256 in Solidity does not revert on overflow. This can
 * easily result in undesired exploitation or bugs, since developers usually
 * assume that overflows raise errors. `SafeCast` restores this intuition by
 * reverting the transaction when such an operation overflows.
 *
 * Using this library instead of the unchecked operations eliminates an entire
 * class of bugs, so it's recommended to use it always.
 *
 */
library SafeCast {
    /// @notice Cast a uint256 to a uint128, revert on overflow
    /// @param y The uint256 to be downcasted
    /// @return z The downcasted integer, now type uint160
    function toUint128(uint256 y) internal pure returns (uint128 z) {
        unchecked {
            /* solhint-disable reason-string */
            require((z = uint128(y)) == y);
        }
    }

    /// @notice Cast a uint256 to a int256, revert on overflow
    /// @param y The uint256 to be casted
    /// @return z The casted integer, now type int256
    function toInt256(uint256 y) internal pure returns (int256 z) {
        unchecked {
            require(y < 2**255, 'Overflow');
            z = int256(y);
        }
    }
}
