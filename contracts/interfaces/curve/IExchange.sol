// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

interface IExchange {
    function get_exchange_amount(
        address _pool,
        address _from,
        address _to,
        uint256 _amount
    ) external view returns (uint256);

    function exchange(
        address _pool,
        address _from,
        address _to,
        uint256 _amount,
        uint256 _expected
    ) external returns (uint256);

    function get_best_rate(
        address _from,
        address _to,
        uint256 _amount,
        address[8] calldata _exclude_pools
    ) external view returns (address, uint256);
}
