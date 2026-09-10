// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import {PriceOracleRegistry} from "./PriceOracleRegistry.sol";
import {DerivativeMarket} from "./DerivativeMarket.sol";
import {FeeDistributor} from "./FeeDistributor.sol";
import {InsuranceFund} from "./InsuranceFund.sol";

/**
 * FABRYKA RYNKOW - jeden vAMM na jeden feed, tworzony przez tworce feedu.
 *
 * Fabryka wdraza WLASNY FeeDistributor i WLASNY InsuranceFund w konstruktorze,
 * dokladnie tak, jak CurveLaunchpad wdraza swoj LiquidityVault. Powod jest ten
 * sam: oba kontrakty musza znac adres fabryki jako `immutable`, a fabryka ich
 * adresy - kolejnosc "fabryka pierwsza, reszta z jej konstruktora" zamyka to
 * bez ani jednego settera i bez przewidywania adresow z nonce.
 *
 * Fabryka nie ma zadnego uprawnienia nad rynkami po ich powstaniu.
 * `GOVERNANCE` sluzy do jednej rzeczy: podpiecia feedu Chainlinka, gdy taki
 * dla danego aktywa powstanie. Tworca feedu nie moze tego zrobic sam, bo
 * wskazanie dowolnego adresu jako "Chainlinka" byloby wskazaniem wlasnego
 * kontraktu zwracajacego dowolna cene.
 *
 * ===========================================================================
 * PO WDROZENIU TRZEBA ZROBIC DWIE RZECZY - I NIE SA OPCJONALNE
 * ===========================================================================
 * 1. GOVERNANCE wola `oracle.setInsuranceFund(address(FEES_INSURANCE))`.
 *    Bez tego przepadle kaucje zgloszen ida do skarbca zamiast do funduszu.
 * 2. Ktokolwiek ZASILA fundusz (`INSURANCE.notifyDeposit` po przelewie).
 *    Fundusz pusty przy niezerowym OI znaczy pauze na nowe pozycje - to jest
 *    zachowanie zamierzone (fail closed), ale swiezy deploy bez zasilenia
 *    przyjmie dokladnie jedna pozycje i zamknie sie na kolejne.
 */
contract DerivativeMarketFactory {
    /** 1 000 USD - ponizej tej glebokosci poslizg zjada kazda sensowna pozycje. */
    uint256 public constant MIN_VIRTUAL_LIQUIDITY = 1_000e18;
    uint256 public constant MAX_VIRTUAL_LIQUIDITY = 100_000_000e18;

    PriceOracleRegistry public immutable ORACLE;
    FeeDistributor public immutable FEES;
    InsuranceFund public immutable INSURANCE;
    address public immutable USDC;
    address public immutable GOVERNANCE;

    mapping(uint256 => address) public marketOf;
    /** Czytane przez InsuranceFund - tylko rynek z tej fabryki raportuje OI. */
    mapping(address => bool) public isMarket;
    address[] public allMarkets;

    event MarketCreated(
        uint256 indexed oracleMarketId,
        address indexed market,
        address indexed creator,
        uint256 initialPrice,
        uint256 virtualLiquidity
    );

    error ZeroAddress();
    error NotCreator();
    error MarketExists();
    error BadLiquidity();
    error OracleInactive();
    error FeedNeedsGovernance();

    constructor(address usdc, address oracle, address treasury, address governance) {
        if (usdc == address(0) || oracle == address(0) || treasury == address(0) || governance == address(0)) {
            revert ZeroAddress();
        }
        USDC = usdc;
        ORACLE = PriceOracleRegistry(oracle);
        GOVERNANCE = governance;
        INSURANCE = new InsuranceFund(usdc, governance, address(this));
        FEES = new FeeDistributor(usdc, treasury, address(this), address(INSURANCE));
    }

    function marketCount() external view returns (uint256) {
        return allMarkets.length;
    }

    /**
     * Tworzy vAMM dla zarejestrowanego feedu. Cena startowa vAMM to BIEZACA
     * cena feedu - nie parametr. Wolno ja wybrac tylko raz i tylko przez
     * rejestracje feedu, inaczej tworca ustawialby mark daleko od indeksu
     * i zbieral funding od pierwszej minuty.
     *
     * `chainlinkFeed` niezerowy wymaga GOVERNANCE - patrz naglowek.
     */
    function createMarket(uint256 oracleMarketId, uint256 virtualLiquidityWad, address chainlinkFeed)
        external
        returns (address market)
    {
        if (marketOf[oracleMarketId] != address(0)) revert MarketExists();
        if (virtualLiquidityWad < MIN_VIRTUAL_LIQUIDITY || virtualLiquidityWad > MAX_VIRTUAL_LIQUIDITY) {
            revert BadLiquidity();
        }
        if (chainlinkFeed != address(0) && msg.sender != GOVERNANCE) revert FeedNeedsGovernance();

        (address creator,,, uint256 price,,,) = ORACLE.getMarket(oracleMarketId);
        if (msg.sender != creator && msg.sender != GOVERNANCE) revert NotCreator();
        if (!ORACLE.isActive(oracleMarketId)) revert OracleInactive();

        market = address(
            new DerivativeMarket(
                USDC,
                address(ORACLE),
                address(FEES),
                address(INSURANCE),
                oracleMarketId,
                creator,
                chainlinkFeed,
                price,
                virtualLiquidityWad
            )
        );

        marketOf[oracleMarketId] = market;
        isMarket[market] = true;
        allMarkets.push(market);
        FEES.registerMarket(market);

        emit MarketCreated(oracleMarketId, market, creator, price, virtualLiquidityWad);
    }
}
