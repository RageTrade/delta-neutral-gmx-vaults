// SPDX-License-Identifier: MIT

pragma solidity ^0.8.9;

import { SafeCast } from 'contracts/libraries/SafeCast.sol';

import { ERC4626Upgradeable } from 'contracts/ERC4626/ERC4626Upgradeable.sol';

import { DNGmxVaultStorage } from 'contracts/vaults/DNGmxVaultStorage.sol';

import { SignedMath } from '@ragetrade/core/contracts/libraries/SignedMath.sol';
import { SignedFullMath } from '@ragetrade/core/contracts/libraries/SignedFullMath.sol';

import { FullMath } from '@uniswap/v3-core-0.8-support/contracts/libraries/FullMath.sol';
import { FixedPoint128 } from '@uniswap/v3-core-0.8-support/contracts/libraries/FixedPoint128.sol';

import { AddressHelper } from '@ragetrade/core/contracts/libraries/AddressHelper.sol';
import { ClearingHouseExtsload } from '@ragetrade/core/contracts/extsloads/ClearingHouseExtsload.sol';

import { ILPVault } from 'contracts/interfaces/ILPVault.sol';

import { IAToken } from '@aave/core-v3/contracts/interfaces/IAToken.sol';
import { IDNGmxVault } from 'contracts/interfaces/IDNGmxVault.sol';
import { IBorrowerVault } from 'contracts/interfaces/IBorrowerVault.sol';
import { IPool } from '@aave/core-v3/contracts/interfaces/IPool.sol';

import { IERC20 } from '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import { IERC20Metadata } from '@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol';

import { OwnableUpgradeable } from '@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol';
import { PausableUpgradeable } from '@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol';

contract AaveVault is ERC4626Upgradeable, OwnableUpgradeable, PausableUpgradeable {
    error UsageCapExceeded();
    error CallerNotVault();

    event VaultCapUpdated(address vault, uint256 newCap);

    IAToken internal aUsdc;
    IPool internal pool;

    mapping(address => uint256) internal vaultCaps;
    uint8 vaultCount;
    IBorrowerVault[10] vaults;

    modifier onlyVault() {
        if (vaultCaps[msg.sender] <= 0) revert CallerNotVault();
        _;
    }

    function initialize() external initializer {
        __Ownable_init();
        __Pausable_init();
        __AaveVault_init();
    }

    function __AaveVault_init() internal onlyInitializing {}

    function _addVaultToWhitelist(IBorrowerVault vault) internal {
        vaults[vaultCount] = vault;
        vaultCount++;
    }

    function _removeVaultFromWhitelist(IBorrowerVault vault) internal {
        uint8 i = 0;
        for (i; i < vaultCount; i++) {
            if (vaults[i] == vault) {
                vaultCount--;
                vaults[i] = vaults[vaultCount];
                delete vaults[vaultCount];
                break;
            }
        }
    }

    function updateVaultCap(IBorrowerVault vault, uint256 cap) external onlyOwner {
        if (vaultCaps[address(vault)] == 0) {
            _addVaultToWhitelist(vault);
        }
        if (vault.getUsdcBorrowed() < cap) {
            vaultCaps[address(vault)] = cap;
            emit VaultCapUpdated(address(vault), cap);
        }
        if (cap == 0) {
            _removeVaultFromWhitelist(vault);
        }
    }

    function borrow(uint256 amount) external onlyVault {
        uint256 currentVaultUsage = IBorrowerVault(msg.sender).getUsdcBorrowed();
        if (currentVaultUsage + amount < vaultCaps[msg.sender]) {
            aUsdc.transfer(msg.sender, amount);
        } else {
            revert UsageCapExceeded();
        }
    }

    function repay(uint256 amount) external onlyVault {
        aUsdc.transferFrom(msg.sender, address(this), amount);
    }

    function beforeWithdraw(
        uint256 assets,
        uint256,
        address
    ) internal override {
        pool.withdraw(address(asset), assets, address(this));
    }

    function afterDeposit(
        uint256 assets,
        uint256,
        address
    ) internal override {
        pool.supply(address(asset), assets, address(this), 0);
    }

    function totalAssets() public view override returns (uint256 amount) {
        amount = aUsdc.balanceOf(address(this));
        for (uint8 i = 0; i < vaultCount; i++) {
            amount += vaults[i].getUsdcBorrowed();
        }
    }
}
