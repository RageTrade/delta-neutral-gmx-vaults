// SPDX-License-Identifier: MIT

pragma solidity ^0.8.9;

import { IPool } from '@aave/core-v3/contracts/interfaces/IPool.sol';
import { IAToken } from '@aave/core-v3/contracts/interfaces/IAToken.sol';

import { IBorrowerVault } from 'contracts/interfaces/IBorrowerVault.sol';

import { ERC4626Upgradeable } from 'contracts/ERC4626/ERC4626Upgradeable.sol';
import { OwnableUpgradeable } from '@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol';
import { PausableUpgradeable } from '@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol';

contract AaveVault is ERC4626Upgradeable, OwnableUpgradeable, PausableUpgradeable {
    error CallerNotVault();
    error UsageCapExceeded();

    event VaultCapUpdated(address vault, uint256 newCap);

    IPool internal pool;
    IAToken internal aUsdc;

    uint8 public vaultCount;
    IBorrowerVault[10] public vaults;

    mapping(address => uint256) internal vaultCaps;

    modifier onlyVault() {
        if (vaultCaps[msg.sender] <= 0) revert CallerNotVault();
        _;
    }

    function initialize() external initializer {
        __Ownable_init();
        __Pausable_init();
        __ERC4626Upgradeable_init(IERC20Metadata(address(_tokenAddrs.sGlp)), _name, _symbol);

        /** init code goes here */
    }

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
        if (vaultCaps[address(vault)] == 0) _addVaultToWhitelist(vault);

        if (vault.getUsdcBorrowed() < cap) {
            vaultCaps[address(vault)] = cap;
            emit VaultCapUpdated(address(vault), cap);
        }
        if (cap == 0) _removeVaultFromWhitelist(vault);
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
