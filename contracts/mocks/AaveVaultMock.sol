// SPDX-License-Identifier: MIT

pragma solidity ^0.8.9;

import { AaveVault } from 'contracts/vaults/AaveVault.sol';

contract AaveVaultMock is AaveVault {
    function addVaultToWhitelist(IBorrowerVault vault) external {
        return _addVaultToWhitelist(vault);
    }

    function removeVaultFromWhitelist(IBorrowerVault vault) external {
        return _removeVaultFromWhitelist(vault);
    }

    function beforeWithdraw(
        uint256 assets,
        uint256 shares,
        address receiver
    ) external {
        return beforeWithdraw(assets, shares, receiver);
    }

    function afterDeposit(
        uint256 assets,
        uint256 shares,
        address receiver
    ) external {
        afterDeposit(assets, shares, receiver);
    }
}
