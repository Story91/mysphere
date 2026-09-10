// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import {DerivMath} from "./DerivMath.sol";

interface IInsuranceSink {
    function notifyDeposit(uint256 amount) external;
}

/**
 * PRICE ORACLE REGISTRY - kazdy moze wystawic feed, ale nie za darmo.
 *
 * Arc dolaczyl do Chainlink Scale, wiec BTC/ETH/FX dostana kanoniczne feedy.
 * Nie dostana ich aktywa dlugiego ogona - a to o nie tu chodzi. Feed wystawia
 * tworca, wklada KAUCJE w USDC i od tej pory ma dwa powody, zeby nie klamac:
 * kaucje mozna sciac, a oplaty z rynku plyna do niego tak dlugo, jak rynek zyje.
 *
 * Trzy bezpieczniki na kazdej aktualizacji, i zaden z nich nie jest opcjonalny:
 *   1. WYLACZNIK. Skok wiekszy niz MAX_DEVIATION_BPS od ostatniej ceny
 *      rewertuje. Manipulacja musi wiec isc malymi krokami, a kazdy krok
 *      kosztuje osobna transakcje i czas.
 *   2. ODSTEP. MIN_UPDATE_INTERVAL miedzy zapisami. Bez tego caly TWAP dalby
 *      sie zasypac w jednym bloku. To DRUGI, niezalezny warunek - sam limit
 *      skoku bez odstepu da sie obejsc serią malych krokow w jednym bloku.
 *   3. TWAP. Rynek nie czyta ceny biezacej, tylko srednia wazona czasem
 *      z okna obserwacji - patrz `getTwap`.
 *
 * Do tego dochodzi ZGLOSZENIE (challenge): kazdy adres moze zakwestionowac
 * konkretna aktualizacje, wplacajac wlasna kaucje. Zgloszenie ZAMRAZA dalsze
 * aktualizacje ceny tego rynku (handel chodzi dalej) do rozstrzygniecia.
 *
 * CENY SA W WAD (1e18 USD). Kaucje sa w USDC (1e6). Te dwie skale nie
 * spotykaja sie w tym pliku ani razu.
 *
 * CZEGO TU NIE MA: prawdziwego rozstrzygania sporow. `resolveChallenge` jest
 * za `governance`, czyli MVP-owym multisigiem. Pelna, bezuprawnieniowa sciezka
 * (optimistic oracle: okno sporu, zaklad po obu stronach, glosowanie) to praca
 * na pozniej i jest tu opisana jako BRAK, a nie jako "wkrotce".
 */
contract PriceOracleRegistry is ReentrancyGuard {
    using SafeERC20 for IERC20;

    /* ====================================================================== */
    /*  PARAMETRY                                                              */
    /* ====================================================================== */

    /**
     * DOLNA GRANICA kaucji feedu, 100 USDC (6 miejsc). Tworca moze wlozyc
     * wiecej i zwykle bedzie chcial: limit OI jego rynku jest wprost
     * proporcjonalny do kaucji (patrz DerivativeMarket.maxOpenInterest).
     */
    uint256 public constant MIN_BOND_AMOUNT = 100e6;

    /** Kaucja zglaszajacego. Nizsza niz kaucja feedu - zgloszenie ma byc realne. */
    uint256 public constant CHALLENGE_BOND = 25e6;

    /** Ile czasu po aktualizacji mozna ja zakwestionowac. */
    uint32 public constant CHALLENGE_WINDOW = 1 hours;

    /** 10% - maksymalny skok jednej aktualizacji wzgledem poprzedniej. */
    uint16 public constant MAX_DEVIATION_BPS = 1000;

    /** Minimalny odstep miedzy aktualizacjami. */
    uint32 public constant MIN_UPDATE_INTERVAL = 60;

    /** Powyzej tego wieku cena jest martwa - rynek ma sie o tym dowiedziec. */
    uint32 public constant MAX_PRICE_AGE = 1 hours;

    /** Dlugosc bufora cyklicznego obserwacji. */
    uint8 public constant TWAP_CARDINALITY = 8;

    /* ====================================================================== */
    /*  STAN                                                                   */
    /* ====================================================================== */

    /**
     * Obserwacja w stylu Uniswap v2: nie cena, tylko SKUMULOWANA cena razy
     * czas. Roznica dwoch kumulatow podzielona przez roznice czasow jest
     * srednia wazona czasem i nie wymaga przechowywania niczego wiecej.
     */
    struct Observation {
        uint256 cumulative;
        uint64 timestamp;
    }

    struct Challenge {
        address challenger;
        uint256 bond;
        uint64 openedAt;
        /** Cena, ktora zostala zakwestionowana - do sladu w zdarzeniach. */
        uint256 disputedPrice;
        bool open;
    }

    struct Market {
        address creator;
        /** Adres upowazniony do wysylania cen; domyslnie tworca. */
        address publisher;
        string symbol;
        uint256 price; // WAD
        uint64 updatedAt;
        uint64 createdAt;
        /** Ile cen przyjeto po rejestracji - wchodzi do progu dojrzalosci rynku. */
        uint32 updateCount;
        /** Ile razy feed byl kwestionowany. Jedno zgloszenie kasuje dojrzalosc. */
        uint32 challengesOpened;
        uint256 bond; // USDC 1e6
        bool slashed;
        uint256 cumulative;
        uint8 head; // indeks OSTATNIO zapisanej obserwacji
        uint8 filled; // ile pozycji bufora ma dane (<= TWAP_CARDINALITY)
    }

    IERC20 public immutable USDC;

    /**
     * Jedyny adres z uprawnieniem - i tylko do rozstrzygania sporow. Multisig.
     * Nie ma tu `setGovernance`, `pause` ani mozliwosci dotkniecia cen.
     */
    address public immutable GOVERNANCE;

    /** Odbiorca resztek scietej kaucji. */
    address public immutable TREASURY;

    /**
     * Fundusz ubezpieczeniowy, do ktorego przepadaja kaucje przegranych
     * zgloszen. Ustawiany RAZ, bo fundusz powstaje dopiero razem z fabryka -
     * czyli po tym rejestrze. Dopoki jest zerowy, kaucje ida do skarbca.
     */
    address public insuranceFund;

    uint256 public marketCount;
    mapping(uint256 => Market) private _markets;
    mapping(uint256 => Challenge) private _challenges;
    mapping(uint256 => Observation[TWAP_CARDINALITY]) private _obs;

    /* ====================================================================== */
    /*  ZDARZENIA I BLEDY                                                      */
    /* ====================================================================== */

    event MarketRegistered(uint256 indexed marketId, address indexed creator, string symbol, uint256 price);
    event PriceSubmitted(uint256 indexed marketId, uint256 price, uint64 timestamp);
    event PublisherSet(uint256 indexed marketId, address indexed publisher);
    event MarketSlashed(uint256 indexed marketId, address indexed reporter, uint256 bond);
    event ChallengeOpened(uint256 indexed marketId, address indexed challenger, uint256 disputedPrice, uint256 bond);
    event ChallengeResolved(uint256 indexed marketId, address indexed challenger, bool upheld, uint256 reward);
    event InsuranceFundSet(address indexed fund);
    event BondToppedUp(uint256 indexed marketId, address indexed from, uint256 amount, uint256 bond);

    error ZeroAddress();
    error EmptySymbol();
    error ZeroPrice();
    error UnknownMarket();
    error NotCreator();
    error NotPublisher();
    error NotGovernance();
    error MarketIsSlashed();
    error TooSoon();
    error DeviationTooLarge();
    error TimestampInFuture();
    error TimestampStale();
    error NoBond();
    error BondTooSmall();
    error PriceFrozen();
    error ChallengeWindowClosed();
    error ChallengeAlreadyOpen();
    error NoChallenge();
    error AlreadySet();

    constructor(address usdc, address governance, address treasury) {
        if (usdc == address(0) || governance == address(0) || treasury == address(0)) revert ZeroAddress();
        USDC = IERC20(usdc);
        GOVERNANCE = governance;
        TREASURY = treasury;
    }

    /** Jednorazowe podpiecie funduszu; kolejnosc wdrozenia wymusza osobny krok. */
    function setInsuranceFund(address fund) external {
        if (msg.sender != GOVERNANCE) revert NotGovernance();
        if (fund == address(0)) revert ZeroAddress();
        if (insuranceFund != address(0)) revert AlreadySet();
        insuranceFund = fund;
        emit InsuranceFundSet(fund);
    }

    /* ====================================================================== */
    /*  REJESTRACJA                                                            */
    /* ====================================================================== */

    /**
     * Rejestruje feed. `bondAmount` (>= MIN_BOND_AMOUNT) musi byc wczesniej
     * zatwierdzone; im wieksza kaucja, tym wiekszy limit OI rynku.
     * `initialPrice` w WAD - 1 USD to 1e18, nie 1e8 i nie 1e6.
     */
    function registerMarket(string calldata symbol, uint256 initialPrice, uint256 bondAmount)
        external
        nonReentrant
        returns (uint256 marketId)
    {
        if (bytes(symbol).length == 0) revert EmptySymbol();
        if (initialPrice == 0) revert ZeroPrice();
        if (bondAmount < MIN_BOND_AMOUNT) revert BondTooSmall();

        USDC.safeTransferFrom(msg.sender, address(this), bondAmount);

        marketId = ++marketCount;
        Market storage m = _markets[marketId];
        m.creator = msg.sender;
        m.publisher = msg.sender;
        m.symbol = symbol;
        m.price = initialPrice;
        m.updatedAt = uint64(block.timestamp);
        m.createdAt = uint64(block.timestamp);
        m.bond = bondAmount;
        m.cumulative = 0;
        m.head = 0;
        m.filled = 1;
        _obs[marketId][0] = Observation({cumulative: 0, timestamp: uint64(block.timestamp)});

        emit MarketRegistered(marketId, msg.sender, symbol, initialPrice);
    }

    /**
     * Dokladanie kaucji. Otwarte dla KAZDEGO - kaucja jest zabezpieczeniem
     * traderow, wiec kto chce podniesc limit OI rynku, moze go doplacic.
     * Nie ma sciezki wyjscia: kaucji nie da sie wycofac. Rynek, ktory raz
     * urosl, nie kurczy sie w chwili, gdy tworca zmienia zdanie.
     */
    function topUpBond(uint256 marketId, uint256 amount) external nonReentrant {
        Market storage m = _requireMarket(marketId);
        if (m.slashed) revert MarketIsSlashed();
        if (amount == 0) revert NoBond();
        USDC.safeTransferFrom(msg.sender, address(this), amount);
        m.bond += amount;
        emit BondToppedUp(marketId, msg.sender, amount, m.bond);
    }

    function setPublisher(uint256 marketId, address publisher) external {
        Market storage m = _requireMarket(marketId);
        if (msg.sender != m.creator) revert NotCreator();
        if (publisher == address(0)) revert ZeroAddress();
        m.publisher = publisher;
        emit PublisherSet(marketId, publisher);
    }

    /* ====================================================================== */
    /*  AKTUALIZACJA CENY                                                      */
    /* ====================================================================== */

    /**
     * `observedAt` to moment ODCZYTU u zrodla, deklarowany przez wystawce.
     * Sluzy WYLACZNIE do odrzucenia danych przeterminowanych i cofnietych;
     * do TWAP-a wchodzi `block.timestamp`, bo tylko on jest nie do podrobienia.
     */
    function submitPrice(uint256 marketId, uint256 price, uint64 observedAt) external {
        Market storage m = _requireMarket(marketId);
        if (m.slashed) revert MarketIsSlashed();
        if (_challenges[marketId].open) revert PriceFrozen();
        if (msg.sender != m.publisher && msg.sender != m.creator) revert NotPublisher();
        if (price == 0) revert ZeroPrice();
        if (observedAt > block.timestamp) revert TimestampInFuture();
        if (observedAt + MAX_PRICE_AGE < block.timestamp) revert TimestampStale();
        if (observedAt <= m.updatedAt) revert TimestampStale();

        uint64 last = m.updatedAt;
        if (block.timestamp < last + MIN_UPDATE_INTERVAL) revert TooSoon();

        uint256 prev = m.price;
        uint256 diff = price > prev ? price - prev : prev - price;
        if (diff * DerivMath.BPS > prev * MAX_DEVIATION_BPS) revert DeviationTooLarge();

        // Kumulator narasta STARA cena przez czas, przez ktory obowiazywala.
        unchecked {
            m.cumulative += prev * (block.timestamp - last);
        }
        m.price = price;
        m.updatedAt = uint64(block.timestamp);
        m.updateCount += 1;

        uint8 next = (m.head + 1) % TWAP_CARDINALITY;
        m.head = next;
        if (m.filled < TWAP_CARDINALITY) m.filled += 1;
        _obs[marketId][next] = Observation({cumulative: m.cumulative, timestamp: uint64(block.timestamp)});

        emit PriceSubmitted(marketId, price, uint64(block.timestamp));
    }

    /* ====================================================================== */
    /*  ODCZYT                                                                 */
    /* ====================================================================== */

    function getPrice(uint256 marketId) external view returns (uint256 price, uint64 updatedAt) {
        Market storage m = _requireMarket(marketId);
        return (m.price, m.updatedAt);
    }

    /**
     * Srednia wazona czasem od najstarszej obserwacji w buforze do TERAZ.
     *
     * Bufor jest cykliczny, wiec najstarsza obserwacja lezy na `head + 1`
     * dopiero po zapelnieniu; dopoki `filled < TWAP_CARDINALITY`, najstarsza
     * jest po prostu pod indeksem 0. Pomylenie tych dwoch przypadkow czytaloby
     * puste sloty jako cene zero - stad jawny podzial.
     *
     * Do kumulatora z ostatniej obserwacji doliczamy jeszcze odcinek "ostatnia
     * cena od ostatniego zapisu do teraz", inaczej TWAP zamarzalby w chwili
     * ostatniej aktualizacji.
     */
    function getTwap(uint256 marketId) public view returns (uint256) {
        Market storage m = _requireMarket(marketId);

        uint8 oldestIdx = m.filled < TWAP_CARDINALITY ? 0 : (m.head + 1) % TWAP_CARDINALITY;
        Observation storage oldest = _obs[marketId][oldestIdx];

        uint256 elapsed = block.timestamp - oldest.timestamp;
        if (elapsed == 0) return m.price;

        uint256 cumNow = m.cumulative + m.price * (block.timestamp - m.updatedAt);
        return (cumNow - oldest.cumulative) / elapsed;
    }

    /** Rynek jest zdatny do uzycia, gdy nie jest sciety i cena nie jest martwa. */
    function isActive(uint256 marketId) external view returns (bool) {
        Market storage m = _requireMarket(marketId);
        return !m.slashed && m.updatedAt + MAX_PRICE_AGE >= block.timestamp;
    }

    function getMarket(uint256 marketId)
        external
        view
        returns (
            address creator,
            address publisher,
            string memory symbol,
            uint256 price,
            uint64 updatedAt,
            uint256 bond,
            bool slashed
        )
    {
        Market storage m = _requireMarket(marketId);
        return (m.creator, m.publisher, m.symbol, m.price, m.updatedAt, m.bond, m.slashed);
    }

    /**
     * Wszystko, co rynek potrzebuje do policzenia wlasnego limitu OI:
     * wysokosc kaucji, wiek, licznik przyjetych cen i slad sporow.
     */
    function marketStats(uint256 marketId)
        external
        view
        returns (uint256 bond, uint64 createdAt, uint32 updateCount, uint32 challengesOpened, bool frozen, bool slashed)
    {
        Market storage m = _requireMarket(marketId);
        return (m.bond, m.createdAt, m.updateCount, m.challengesOpened, _challenges[marketId].open, m.slashed);
    }

    function getChallenge(uint256 marketId)
        external
        view
        returns (address challenger, uint256 bond, uint64 openedAt, uint256 disputedPrice, bool open)
    {
        Challenge storage c = _challenges[marketId];
        return (c.challenger, c.bond, c.openedAt, c.disputedPrice, c.open);
    }

    /* ====================================================================== */
    /*  ZGLOSZENIE CENY                                                        */
    /* ====================================================================== */

    /**
     * Kwestionuje OSTATNIA aktualizacje. Otwarte dla kazdego adresu - tworca
     * feedu nie ma tu zadnego uprawnienia, takze do zamrozenia swojego rynku
     * (zamrozenie kosztuje kaucje i jest widoczne).
     *
     * Od tej chwili `submitPrice` rewertuje, wiec cena stoi i po MAX_PRICE_AGE
     * rynek sam zrobi sie nieaktywny dla NOWYCH pozycji. Handel na istniejacych
     * pozycjach i likwidacje chodza dalej.
     */
    function challengePrice(uint256 marketId) external nonReentrant {
        Market storage m = _requireMarket(marketId);
        if (m.slashed) revert MarketIsSlashed();
        Challenge storage c = _challenges[marketId];
        if (c.open) revert ChallengeAlreadyOpen();
        if (block.timestamp > m.updatedAt + CHALLENGE_WINDOW) revert ChallengeWindowClosed();

        USDC.safeTransferFrom(msg.sender, address(this), CHALLENGE_BOND);

        c.challenger = msg.sender;
        c.bond = CHALLENGE_BOND;
        c.openedAt = uint64(block.timestamp);
        c.disputedPrice = m.price;
        c.open = true;
        m.challengesOpened += 1;

        emit ChallengeOpened(marketId, msg.sender, m.price, CHALLENGE_BOND);
    }

    /**
     * MVP: multisig stwierdza, czy zgloszenie mialo racje.
     *
     * UZNANE   - kaucja feedu przepada: polowa idzie do zglaszajacego jako
     *            nagroda, reszta do skarbca. Zglaszajacy odbiera takze swoja
     *            kaucje. Feed przestaje byc aktywny NA ZAWSZE - nie ma sciezki
     *            odzyskania, rynek ma poznac inny feed, nie ten sam.
     * ODRZUCONE - kaucja zglaszajacego przepada do funduszu ubezpieczeniowego,
     *            aktualizacje ceny odmarzaja.
     *
     * To jest STUB i tak ma byc czytany: decyzja jest tu ludzka i zaufana.
     * Docelowo w to miejsce wchodzi bezuprawnieniowy spor z zakladem po obu
     * stronach; do tego czasu kaucja chroni tylko o tyle, o ile multisig dziala.
     */
    function resolveChallenge(uint256 marketId, bool upheld) external nonReentrant {
        if (msg.sender != GOVERNANCE) revert NotGovernance();
        Market storage m = _requireMarket(marketId);
        Challenge storage c = _challenges[marketId];
        if (!c.open) revert NoChallenge();

        address challenger = c.challenger;
        uint256 challengerBond = c.bond;
        c.open = false;
        c.bond = 0;

        uint256 reward;
        if (upheld) {
            uint256 bond = m.bond;
            m.slashed = true;
            m.bond = 0;
            reward = bond / 2;
            USDC.safeTransfer(challenger, challengerBond + reward);
            uint256 rest = bond - reward;
            if (rest != 0) USDC.safeTransfer(TREASURY, rest);
            emit MarketSlashed(marketId, challenger, bond);
        } else {
            _forfeit(challengerBond);
        }

        emit ChallengeResolved(marketId, challenger, upheld, reward);
    }

    /**
     * Sciezka awaryjna multisigu, gdy manipulacja wyszla po zamknieciu okna
     * zgloszen i nikt nie wplacil kaucji. Zachowana obok `resolveChallenge`,
     * bo okno CHALLENGE_WINDOW jest krotkie, a kaucja ma dzialac takze pozniej.
     */
    function slash(uint256 marketId, address reporter) external nonReentrant {
        if (msg.sender != GOVERNANCE) revert NotGovernance();
        if (reporter == address(0)) revert ZeroAddress();
        Market storage m = _requireMarket(marketId);
        if (m.slashed) revert MarketIsSlashed();
        uint256 bond = m.bond;
        if (bond == 0) revert NoBond();

        m.slashed = true;
        m.bond = 0;

        uint256 half = bond / 2;
        USDC.safeTransfer(reporter, half);
        USDC.safeTransfer(TREASURY, bond - half);

        emit MarketSlashed(marketId, reporter, bond);
    }

    /** Przepadla kaucja: fundusz, a gdy jeszcze nie istnieje - skarbiec. */
    function _forfeit(uint256 amount) private {
        if (amount == 0) return;
        address fund = insuranceFund;
        if (fund == address(0)) {
            USDC.safeTransfer(TREASURY, amount);
            return;
        }
        USDC.safeTransfer(fund, amount);
        IInsuranceSink(fund).notifyDeposit(amount);
    }

    function _requireMarket(uint256 marketId) private view returns (Market storage m) {
        if (marketId == 0 || marketId > marketCount) revert UnknownMarket();
        m = _markets[marketId];
    }
}
