// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

interface IGlpManager {
    function glp() external view returns (address);

    function gov() external view returns (address);

    function cooldownDuration() external returns (uint256);

    function lastAddedAt(address _account) external returns (uint256);

    function setCooldownDuration(uint256 _cooldownDuration) external;

    function addLiquidity(
        address _token,
        uint256 _amount,
        uint256 _minUsdg,
        uint256 _minGlp
    ) external returns (uint256);

    function addLiquidityForAccount(
        address _fundingAccount,
        address _account,
        address _token,
        uint256 _amount,
        uint256 _minUsdg,
        uint256 _minGlp
    ) external returns (uint256);

    function removeLiquidity(
        address _tokenOut,
        uint256 _glpAmount,
        uint256 _minOut,
        address _receiver
    ) external returns (uint256);

    function removeLiquidityForAccount(
        address _account,
        address _tokenOut,
        uint256 _glpAmount,
        uint256 _minOut,
        address _receiver
    ) external returns (uint256);

    function getAums() external view returns (uint256[] memory);

    function vault() external view returns (address);

    function getAumInUsdg(bool maximise) external view returns (uint256);

    function getAum(bool maximise) external view returns (uint256);

    function getGlobalShortAveragePrice(address token) external view returns (uint256);
}
