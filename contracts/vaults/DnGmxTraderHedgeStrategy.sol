// SPDX-License-Identifier: MIT

pragma solidity ^0.8.9;

import { IVault } from '../interfaces/gmx/IVault.sol';

import { SafeCast } from '../libraries/SafeCast.sol';
import { IGlpManager } from '../interfaces/gmx/IGlpManager.sol';
import { IDnGmxTraderHedgeStrategy } from '../interfaces/IDnGmxTraderHedgeStrategy.sol';

import { FixedPointMathLib } from '@rari-capital/solmate/src/utils/FixedPointMathLib.sol';

import { OwnableUpgradeable } from '@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol';

import { IERC20Metadata } from '@openzeppelin/contracts/interfaces/IERC20Metadata.sol';
import { IDnGmxJuniorVault } from '../interfaces/IDnGmxJuniorVault.sol';

import { SignedFixedPointMathLib } from '../libraries/SignedFixedPointMathLib.sol';

contract DnGmxTraderHedgeStrategy is OwnableUpgradeable, IDnGmxTraderHedgeStrategy {
    using FixedPointMathLib for uint256;
    using SafeCast for int256;
    using SafeCast for uint256;
    using SignedFixedPointMathLib for int256;

    uint256 internal constant MAX_BPS = 10_000;
    uint256 internal constant PRICE_PRECISION = 1e30;

    uint16 traderOIHedgeBps;
    address public keeper;

    IVault public gmxVault;

    IGlpManager public glpManager;

    IDnGmxJuniorVault public juniorVault;

    IERC20Metadata public glp;

    IERC20Metadata public weth;

    IERC20Metadata public wbtc;

    int128 public btcTraderOIHedge; // wbtc token decimals (8 decimals)
    int128 public ethTraderOIHedge; // weth token deceimals (18 decimals)

    // these gaps are added to allow adding new variables without shifting down inheritance chain
    uint256[50] private __gaps;

    error InvalidTraderOIHedgeBps(uint256 traderOIHedgeBps);
    error InvalidTraderOIHedges(int128 btcTraderOIHedge, int128 ethTraderOIHedge);
    error OnlyKeeperAllowed(address msgSender, address authorisedKeeperAddress);

    event TraderOIHedgeBpsUpdated(uint256 traderOIHedgeBps);
    event TraderOIHedgesUpdated(int256 btcTraderOIHedge, int256 ethTraderOIHedge);

    event KeeperUpdated(address indexed oldKeeper, address indexed newKeeper);

    modifier onlyKeeper() {
        if (msg.sender != keeper) revert OnlyKeeperAllowed(msg.sender, keeper);
        _;
    }

    function initialize(
        address _keeper,
        IVault _gmxVault,
        IGlpManager _glpManager,
        IDnGmxJuniorVault _juniorVault,
        IERC20Metadata _glp,
        IERC20Metadata _weth,
        IERC20Metadata _wbtc
    ) external initializer {
        __Ownable_init();
        __DnGmxTraderHedgeStrategy_init(_keeper, _gmxVault, _glpManager, _juniorVault, _glp, _weth, _wbtc);
    }

    function __DnGmxTraderHedgeStrategy_init(
        address _keeper,
        IVault _gmxVault,
        IGlpManager _glpManager,
        IDnGmxJuniorVault _juniorVault,
        IERC20Metadata _glp,
        IERC20Metadata _weth,
        IERC20Metadata _wbtc
    ) internal onlyInitializing {
        keeper = _keeper;
        gmxVault = _gmxVault;
        glpManager = _glpManager;
        juniorVault = _juniorVault;
        glp = _glp;
        weth = _weth;
        wbtc = _wbtc;
    }

    function setKeeper(address _keeper) external onlyOwner {
        emit KeeperUpdated(keeper, _keeper);
        keeper = _keeper;
    }

    /// @notice set hedge adjustments basis trader OIs
    /// @param _btcTraderOIHedge btc trader OI hedge for whole glp supply
    /// @param _ethTraderOIHedge eth trader OI hedge for whole glp supply
    function overrideTraderOIHedges(int128 _btcTraderOIHedge, int128 _ethTraderOIHedge) external onlyOwner {
        if (!_checkHedgeAmounts(_btcTraderOIHedge, _ethTraderOIHedge))
            revert InvalidTraderOIHedges(_btcTraderOIHedge, _ethTraderOIHedge);
        btcTraderOIHedge = _btcTraderOIHedge;
        ethTraderOIHedge = _ethTraderOIHedge;

        emit TraderOIHedgesUpdated(_btcTraderOIHedge, _ethTraderOIHedge);
    }

    function setTraderOIHedgeBps(uint16 _traderOIHedgeBps) external onlyOwner {
        if (_traderOIHedgeBps > MAX_BPS) revert InvalidTraderOIHedgeBps(_traderOIHedgeBps);
        traderOIHedgeBps = _traderOIHedgeBps;
        emit TraderOIHedgeBpsUpdated(_traderOIHedgeBps);
    }

    /// @notice set hedge adjustments basis trader OIs
    function setTraderOIHedges() external onlyKeeper {
        int128 _btcTraderOIHedge = _getTokenHedgeAmount(address(wbtc), traderOIHedgeBps).toInt128();
        int128 _ethTraderOIHedge = _getTokenHedgeAmount(address(weth), traderOIHedgeBps).toInt128();

        btcTraderOIHedge = _btcTraderOIHedge;
        ethTraderOIHedge = _ethTraderOIHedge;

        emit TraderOIHedgesUpdated(_btcTraderOIHedge, _ethTraderOIHedge);
    }

    ///@notice returns token amount underlying glp amount deposited
    ///@param token address of token
    ///@return amount of tokens of the supplied address underlying the given amount of glp
    function _getTokenHedgeAmount(address token, uint16 _traderOIHedgeBps) private view returns (int256) {
        uint256 tokenPrecision = 10 ** IERC20Metadata(token).decimals();

        uint256 globalShort = gmxVault.globalShortSizes(token).mulDivDown(_traderOIHedgeBps, MAX_BPS);
        uint256 globalAveragePrice = glpManager.getGlobalShortAveragePrice(token);
        uint256 reservedAmount = gmxVault.reservedAmounts(token).mulDivDown(_traderOIHedgeBps, MAX_BPS);
        // uint256 poolAmount = gmxVault.poolAmounts(token);

        int256 tokenReserve = (reservedAmount.mulDivDown(PRICE_PRECISION, tokenPrecision)).toInt256() -
            globalShort.mulDivDown(PRICE_PRECISION, globalAveragePrice).toInt256();

        return tokenReserve.mulDivDown(traderOIHedgeBps * tokenPrecision, PRICE_PRECISION * MAX_BPS);
    }

    function _checkHedgeAmounts(int128 _btcTraderOIHedge, int128 _ethTraderOIHedge) internal view returns (bool) {
        int256 btcTraderOIMax = _getMaxTokenHedgeAmount(address(wbtc));
        int256 ethTraderOIMax = _getMaxTokenHedgeAmount(address(weth));

        if (
            !(_checkTokenHedgeAmount(_btcTraderOIHedge, btcTraderOIMax) &&
                _checkTokenHedgeAmount(_ethTraderOIHedge, ethTraderOIMax))
        ) return false;

        return true;
    }

    function _checkTokenHedgeAmount(int256 tokenTraderOIHedge, int256 tokenTraderOIMax) private pure returns (bool) {
        if (tokenTraderOIHedge.sign() * tokenTraderOIMax.sign() < 0) return false;
        if (tokenTraderOIHedge.abs() > tokenTraderOIMax.abs()) return false;

        return true;
    }

    ///@notice returns token amount underlying glp amount deposited
    ///@param token address of token
    ///@return amount of tokens of the supplied address underlying the given amount of glp
    function _getMaxTokenHedgeAmount(address token) private view returns (int256) {
        uint256 globalShort = gmxVault.globalShortSizes(token);
        uint256 globalAveragePrice = glpManager.getGlobalShortAveragePrice(token);
        uint256 reservedAmount = gmxVault.reservedAmounts(token);
        // uint256 poolAmount = gmxVault.poolAmounts(token);

        int256 tokenReserve = (reservedAmount * PRICE_PRECISION).toInt256() -
            globalShort.mulDivDown(PRICE_PRECISION, globalAveragePrice).toInt256();

        return tokenReserve.mulDivDown((10 ** IERC20Metadata(token).decimals()), PRICE_PRECISION);
    }
}
