// SPDX-License-Identifier: MIT

pragma solidity ^0.8.9;

import { IPool } from '@aave/core-v3/contracts/interfaces/IPool.sol';
import { IAToken } from '@aave/core-v3/contracts/interfaces/IAToken.sol';
import { IPoolAddressesProvider } from '@aave/core-v3/contracts/interfaces/IPoolAddressesProvider.sol';

import { IBorrowerVault } from 'contracts/interfaces/IBorrowerVault.sol';

import { IERC20 } from '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import { IERC20Metadata } from '@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol';

import { ERC4626Upgradeable } from 'contracts/ERC4626/ERC4626Upgradeable.sol';
import { OwnableUpgradeable } from '@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol';
import { PausableUpgradeable } from '@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol';

contract AaveVault is ERC4626Upgradeable, OwnableUpgradeable, PausableUpgradeable {
    error CallerNotVault();
    error UsageCapExceeded();

    event AllowancesGranted();
    event VaultCapUpdated(address vault, uint256 newCap);

    IPool internal pool;
    IAToken internal aUsdc;
    IPoolAddressesProvider internal poolAddressProvider;

    uint8 public vaultCount;
    IBorrowerVault[10] public vaults;

    mapping(address => uint256) internal vaultCaps;

    modifier onlyVault() {
        if (vaultCaps[msg.sender] <= 0) revert CallerNotVault();
        _;
    }

    function initialize(
        address _usdc,
        string calldata _name,
        string calldata _symbol,
        address _poolAddressesProvider
    ) external initializer {
        __Ownable_init();
        __Pausable_init();
        __ERC4626Upgradeable_init(IERC20Metadata(_usdc), _name, _symbol);

        poolAddressProvider = IPoolAddressesProvider(_poolAddressesProvider);

        pool = IPool(poolAddressProvider.getPool());
        aUsdc = IAToken(pool.getReserveData(_usdc).aTokenAddress);

        aUsdc.approve(address(pool), type(uint256).max);
        asset.approve(address(pool), type(uint256).max);
    }

    function grantAllowances() external onlyOwner {
        address aavePool = address(pool);

        aUsdc.approve(aavePool, type(uint256).max);
        asset.approve(aavePool, type(uint256).max);

        emit AllowancesGranted();
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
