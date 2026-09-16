// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import {DerivMath} from "./DerivMath.sol";
import {PriceOracleRegistry} from "./PriceOracleRegistry.sol";
import {FeeDistributor} from "./FeeDistributor.sol";
import {InsuranceFund} from "./InsuranceFund.sol";

interface IAggregatorV3 {
    function decimals() external view returns (uint8);
    function latestRoundData()
        external
        view
        returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound);
}

/**
 * DERIVATIVE MARKET - vAMM na jeden rynek, bez wlasciciela.
 *
 * ===========================================================================
 * CO TU JEST WIRTUALNE, A CO PRAWDZIWE
 * ===========================================================================
 * Wirtualne sa REZERWY: `quoteReserve` (USD) i `baseReserve` (jednostki
 * bazowe), obie w WAD. Nikt ich nie wplacil i nikt ich nie wyplaci - istnieja
 * po to, zeby staly iloczyn `quote * base = k` wyznaczal cene i poslizg.
 * Cena mark to po prostu `quote / base`.
 *
 * Prawdziwe jest DOKLADNIE JEDNO: USDC ERC-20 z szescioma miejscami, ktore
 * lezy na tym kontrakcie jako depozyt zabezpieczajacy. Konwersja 6 <-> 18
 * dzieje sie w DWOCH miejscach i nigdzie indziej: przy przyjeciu depozytu i
 * przy wyplacie. Wszystko pomiedzy jest w WAD.
 *
 * (Uwaga dla czytajacego pod Arc: jednostka NATYWNA tego lancucha to takze
 * USDC, ale z 18 miejscami. Ten kontrakt nie tyka `msg.value` ani razu.)
 *
 * ===========================================================================
 * FUNDING - PO CO I W KTORA STRONE
 * ===========================================================================
 * vAMM sam z siebie nie ma zadnego powodu, zeby jego cena miala cokolwiek
 * wspolnego z rynkiem. Wiaze je funding, liczony jak w Perpetual Protocol v1:
 *
 *     premia            = mark - index
 *     funding na 1 jedn. = premia * elapsed / 1 dzien
 *     cumFunding        += funding na 1 jedn.
 *
 * Pozycja placi `size * (cumFunding_teraz - cumFunding_wejscia)`. Dla longa
 * `size` jest dodatni, wiec przy mark > index long PLACI, a short (size ujemny)
 * DOSTAJE. Przy mark < index odwrotnie. To jest cala mechanika przyciagania
 * marku do indeksu - nie ma tu zadnego arbitra, ktory "poprawia" cene.
 *
 * Premia jest przycinana do MAX_PREMIUM_BPS indeksu, zeby jedna szalona
 * swieczka na vAMM nie wyzerowala wszystkich depozytow po drugiej stronie.
 *
 * Index bierzemy z Chainlinka, jesli feed dla tego rynku istnieje; jesli nie -
 * z TWAP-a PriceOracleRegistry. Na Arc dzis nie ma opublikowanych adresow
 * feedow, wiec praktycznie zawsze dziala druga sciezka.
 *
 * ===========================================================================
 * LIMIT OI - DWA STOPNIE, LICZONE Z KAUCJI
 * ===========================================================================
 * Lekcja z HIP-3: rynek wystawiony przez kogokolwiek moze byc duzy tylko
 * na tyle, na ile jego tworca ma cos do stracenia. Limit OI NIE jest tu stala,
 * tylko funkcja KAUCJI feedu:
 *
 *     maxOI = kaucja * mnoznik
 *
 * a mnoznik zalezy od dojrzalosci rynku:
 *
 *   PROBACJA (OI_MULTIPLIER_PROBATION) - rynek mlodszy niz PROBATION_AGE
 *     ALBO z mniej niz PROBATION_UPDATES przyjetymi cenami, albo taki, ktory
 *     ma za soba jakiekolwiek zgloszenie ceny, albo wlasnie zamrozony.
 *   DOJRZALY (OI_MULTIPLIER_MATURE) - przezyl oba progi z czysta kartoteka.
 *
 * Swiezy rynek jest wiec z zalozenia maly. Manipulacja feedem w pierwszym
 * tygodniu ma po drugiej stronie kilkukrotnie mniej pieniedzy do zabrania,
 * a probka historii cen jest juz na tyle dluga, ze pojedynczy skok widac.
 *
 * ===========================================================================
 * SAMOOBSLUGA TWORCY
 * ===========================================================================
 * Tworca feedu MOZE handlowac na swoim rynku, ale tylko do
 * CREATOR_OI_CAP_BPS biezacego limitu OI. To ten sam adres, ktory podaje cene -
 * bez tego progu manipulacja feedem i pozycja po wlasciwej stronie byly by
 * jedna transakcja (Mango Markets, wrzesien 2022).
 *
 * ===========================================================================
 * CZEGO TEN KONTRAKT NIE MA - I JEST TO SWIADOME
 * ===========================================================================
 * - Nie ma dokladania i czesciowego zamykania pozycji. Jeden adres = jedna
 *   pozycja, zamykana w calosci. Kazda dodatkowa sciezka to kolejny sposob na
 *   pomylke w `openNotional`, a MVP nie potrzebuje jej do niczego.
 * - Nie ma wlasciciela, pauzy wlasnej ani zadnego settera. Jedyna pauza jest
 *   GLOBALNA i mieszka w InsuranceFund - patrz `openPosition`.
 * - Nie ma geoblokowania ani KYC. To warstwa frontendu i ToS, nie kontraktu.
 */
contract DerivativeMarket is ReentrancyGuard {
    using SafeERC20 for IERC20;
    using DerivMath for uint256;

    /* ====================================================================== */
    /*  PARAMETRY                                                              */
    /* ====================================================================== */

    /** 0,3% od notionalu, przy otwarciu i przy zamknieciu. */
    uint16 public constant TRADE_FEE_BPS = 30;

    uint8 public constant MAX_LEVERAGE = 10;

    /** 10 USDC. Ponizej tego oplata i zaokraglenia zjadaja pozycje. */
    uint256 public constant MIN_MARGIN_USDC = 10e6;

    /** 6,25% - ponizej tego poziomu pozycje moze zamknac kazdy. */
    uint16 public constant MAINTENANCE_MARGIN_BPS = 625;

    /** Nagroda dla likwidatora, liczona od notionalu wyjscia. */
    uint16 public constant LIQUIDATION_FEE_BPS = 125;

    uint32 public constant FUNDING_INTERVAL = 1 hours;
    uint32 private constant FUNDING_PERIOD = 1 days;
    /** Sufit premii wchodzacej do fundingu: 5% indeksu. */
    uint16 public constant MAX_PREMIUM_BPS = 500;

    /** Mnozniki kaucji - patrz naglowek, sekcja o limicie OI. */
    uint8 public constant OI_MULTIPLIER_PROBATION = 2;
    uint8 public constant OI_MULTIPLIER_MATURE = 8;
    uint32 public constant PROBATION_AGE = 7 days;
    uint32 public constant PROBATION_UPDATES = 50;

    /** 2% limitu OI - tyle wolno tworcy feedu na wlasnym rynku. */
    uint16 public constant CREATOR_OI_CAP_BPS = 200;

    /* ====================================================================== */
    /*  NIEZMIENNE                                                             */
    /* ====================================================================== */

    IERC20 public immutable USDC;
    PriceOracleRegistry public immutable ORACLE;
    FeeDistributor public immutable FEES;
    InsuranceFund public immutable INSURANCE;
    uint256 public immutable ORACLE_MARKET_ID;
    address public immutable CREATOR;
    /** address(0) = brak feedu, index bierze sie z TWAP-a rejestru. */
    address public immutable CHAINLINK_FEED;
    /** Feed starszy niz to jest traktowany jak jego brak (patrz oracleActive). */
    uint256 public constant MAX_FEED_AGE = 1 hours;

    /* ====================================================================== */
    /*  STAN                                                                   */
    /* ====================================================================== */

    uint256 public quoteReserve; // WAD USD
    uint256 public baseReserve; // WAD jednostek bazowych

    /** Skumulowany funding na 1 jednostke bazowa, WAD USD, ze znakiem. */
    int256 public cumFunding;
    uint64 public lastFundingAt;

    struct Position {
        int256 size; // WAD, dodatni long / ujemny short
        uint256 margin; // WAD USD, juz po oplacie wejsciowej
        uint256 openNotional; // WAD USD, wartosc bezwzgledna
        uint256 entryPrice; // WAD USD
        int256 entryFunding; // cumFunding w chwili otwarcia
    }

    mapping(address => Position) private _positions;
    /** Suma rozmiarow - dodatnia znaczy przewage longow. Do UI i do analiz. */
    int256 public netSize;
    uint256 public openInterestNotional;
    /** Ile zlego dlugu fundusz musial pokryc na tym rynku. Do UI i audytu. */
    uint256 public coveredBadDebtUsdc;

    /* ====================================================================== */
    /*  ZDARZENIA I BLEDY                                                      */
    /* ====================================================================== */

    event PositionOpened(
        address indexed trader, bool isLong, uint256 marginUsdc, uint256 notional, uint256 size, uint256 entryPrice
    );
    event PositionClosed(
        address indexed trader, uint256 exitNotional, int256 pnl, int256 funding, uint256 payoutUsdc
    );
    event Liquidated(address indexed trader, address indexed keeper, uint256 keeperRewardUsdc, uint256 payoutUsdc);
    event FundingSettled(int256 premium, int256 fundingPerUnit, int256 cumFunding);
    event BadDebt(address indexed trader, uint256 shortfallWad, uint256 coveredUsdc);

    error ZeroAddress();
    error PositionAlreadyOpen();
    error NoPosition();
    error BadLeverage();
    error MarginTooSmall();
    error OracleInactive();
    error NotionalTooLarge();
    error MarginRatioTooLow();
    error PositionHealthy();
    error FundingTooSoon();
    error BadReserves();
    error OiCapExceeded();
    error CreatorCapExceeded();
    error SystemPaused();

    constructor(
        address usdc,
        address oracle,
        address fees,
        address insurance,
        uint256 oracleMarketId,
        address creator,
        address chainlinkFeed,
        uint256 initialPriceWad,
        uint256 virtualLiquidityWad
    ) {
        if (
            usdc == address(0) || oracle == address(0) || fees == address(0) || insurance == address(0)
                || creator == address(0)
        ) {
            revert ZeroAddress();
        }
        if (initialPriceWad == 0 || virtualLiquidityWad == 0) revert BadReserves();

        USDC = IERC20(usdc);
        ORACLE = PriceOracleRegistry(oracle);
        FEES = FeeDistributor(fees);
        INSURANCE = InsuranceFund(insurance);
        ORACLE_MARKET_ID = oracleMarketId;
        CREATOR = creator;
        CHAINLINK_FEED = chainlinkFeed;

        // Glebokosc podana w USD wyznacza obie rezerwy: quote = L,
        // base = L / cena. Iloczyn ustala poslizg - im wieksze L, tym plaska
        // krzywa. Cena startowa to dokladnie L / (L/p) = p.
        quoteReserve = virtualLiquidityWad;
        baseReserve = DerivMath.divWad(virtualLiquidityWad, initialPriceWad);
        if (baseReserve == 0) revert BadReserves();

        lastFundingAt = uint64(block.timestamp);
    }

    /* ====================================================================== */
    /*  CENY                                                                   */
    /* ====================================================================== */

    /** Cena vAMM: quote / base. */
    function markPrice() public view returns (uint256) {
        return DerivMath.divWad(quoteReserve, baseReserve);
    }

    /**
     * Cena referencyjna. Feed (Chainlink albo adapter Pytha), gdy istnieje i
     * jest swiezy; inaczej TWAP rejestru. Adapter Pytha sam oddaje zera po
     * swoim MAX_AGE, ale prawdziwy Chainlink oddaje ostatnia runde bez konca,
     * wiec wiek sprawdzamy tu jeszcze raz, nie ufajac feedowi.
     */
    function indexPrice() public view returns (uint256) {
        (uint256 price, bool fresh) = _feedPrice();
        if (fresh) return price;
        return ORACLE.getTwap(ORACLE_MARKET_ID);
    }

    /**
     * Czy rynek przyjmuje nowe pozycje.
     *
     * DLACZEGO NIE SAMO `ORACLE.isActive`: rejestr wymaga wpisu wystawcy co
     * MAX_PRICE_AGE (heartbeat z keepera). Rynek z feedem ma cene z zewnatrz -
     * heartbeat rejestru nic mu nie dodaje, a jego brak (laptop keepera
     * wylaczony - 16.09.2026 12 h "halted" na testnecie) zatrzymywal handel
     * bez powodu. Wiec: feed swiezy = rynek aktywny, o ile rejestr nie scial
     * wystawcy (slashed - to jest sygnal o oszustwie, nie o wieku ceny).
     * Rynek bez feedu zachowuje sie jak dotad.
     */
    function oracleActive() public view returns (bool) {
        (, bool fresh) = _feedPrice();
        if (fresh) {
            (,,,,, bool slashed) = ORACLE.marketStats(ORACLE_MARKET_ID);
            return !slashed;
        }
        return ORACLE.isActive(ORACLE_MARKET_ID);
    }

    /** (cena WAD, czy feed istnieje i jest dodatni oraz nie starszy niz MAX_FEED_AGE). */
    function _feedPrice() private view returns (uint256 price, bool fresh) {
        if (CHAINLINK_FEED == address(0)) return (0, false);
        (, int256 answer,, uint256 updatedAt,) = IAggregatorV3(CHAINLINK_FEED).latestRoundData();
        if (answer <= 0 || updatedAt == 0 || updatedAt + MAX_FEED_AGE < block.timestamp) return (0, false);
        return (DerivMath.scalePriceToWad(answer, IAggregatorV3(CHAINLINK_FEED).decimals()), true);
    }

    /* ====================================================================== */
    /*  LIMIT OI                                                               */
    /* ====================================================================== */

    /**
     * Rynek dojrzaly: przezyl PROBATION_AGE, przyjal PROBATION_UPDATES cen,
     * nie ma za soba ani jednego zgloszenia i nie jest wlasnie zamrozony.
     * Kazdy z tych warunkow osobno cofa rynek na probacje.
     */
    function isMature() public view returns (bool) {
        (, uint64 createdAt, uint32 updateCount, uint32 challengesOpened, bool frozen,) =
            ORACLE.marketStats(ORACLE_MARKET_ID);
        if (frozen || challengesOpened != 0) return false;
        if (block.timestamp < createdAt + PROBATION_AGE) return false;
        return updateCount >= PROBATION_UPDATES;
    }

    /** Limit OI w WAD USD: kaucja feedu razy mnoznik stopnia dojrzalosci. */
    function maxOpenInterest() public view returns (uint256) {
        (uint256 bond,,,,, bool slashed) = ORACLE.marketStats(ORACLE_MARKET_ID);
        if (slashed) return 0;
        uint256 multiplier = isMature() ? OI_MULTIPLIER_MATURE : OI_MULTIPLIER_PROBATION;
        return DerivMath.usdcToWad(bond) * multiplier;
    }

    /** Sufit dla pozycji tworcy feedu na wlasnym rynku, WAD USD. */
    function creatorOiCap() public view returns (uint256) {
        return (maxOpenInterest() * CREATOR_OI_CAP_BPS) / DerivMath.BPS;
    }

    /* ====================================================================== */
    /*  FUNDING                                                                */
    /* ====================================================================== */

    function settleFunding() external {
        if (block.timestamp < lastFundingAt + FUNDING_INTERVAL) revert FundingTooSoon();
        _settleFunding();
    }

    function _settleFunding() private {
        uint256 elapsed = block.timestamp - lastFundingAt;
        if (elapsed == 0) return;
        // Dluga przerwa nie ma prawa naliczyc kilkudniowego fundingu naraz.
        if (elapsed > FUNDING_PERIOD) elapsed = FUNDING_PERIOD;

        uint256 index = indexPrice();
        uint256 mark = markPrice();
        int256 premium = int256(mark) - int256(index);

        int256 cap = int256((index * MAX_PREMIUM_BPS) / DerivMath.BPS);
        if (premium > cap) premium = cap;
        if (premium < -cap) premium = -cap;

        int256 perUnit = (premium * int256(elapsed)) / int256(uint256(FUNDING_PERIOD));
        cumFunding += perUnit;
        lastFundingAt = uint64(block.timestamp);

        emit FundingSettled(premium, perUnit, cumFunding);
    }

    /** Ile pozycja jest winna z tytulu fundingu. Dodatnie = trader placi. */
    function pendingFunding(address trader) public view returns (int256) {
        Position storage p = _positions[trader];
        if (p.size == 0) return 0;
        return DerivMath.mulWadInt(p.size, cumFunding - p.entryFunding);
    }

    /* ====================================================================== */
    /*  HANDEL                                                                 */
    /* ====================================================================== */

    /**
     * Otwiera pozycje. `marginUsdc` w SZESCIU miejscach (realny token),
     * `leverage` to calkowity mnoznik 1..MAX_LEVERAGE.
     *
     * Oplata wejsciowa liczona jest od notionalu BRUTTO i schodzi z depozytu,
     * wiec faktyczna dzwignia pozycji jest odrobine wyzsza od zadanej. To jest
     * swiadome: alternatywa (notional liczony od depozytu netto) jest rownaniem
     * z oplata po obu stronach.
     */
    function openPosition(bool isLong, uint256 marginUsdc, uint8 leverage)
        external
        nonReentrant
        returns (uint256 size, uint256 entryPrice)
    {
        if (_positions[msg.sender].size != 0) revert PositionAlreadyOpen();
        if (leverage == 0 || leverage > MAX_LEVERAGE) revert BadLeverage();
        if (marginUsdc < MIN_MARGIN_USDC) revert MarginTooSmall();
        if (!oracleActive()) revert OracleInactive();
        // Jedyna pauza w calym module: fundusz nie pokrywa juz OI systemu.
        if (INSURANCE.newPositionsPaused()) revert SystemPaused();

        _pokeFunding();

        uint256 notional = DerivMath.usdcToWad(marginUsdc) * leverage;
        uint256 cap = maxOpenInterest();
        if (openInterestNotional + notional > cap) revert OiCapExceeded();
        if (msg.sender == CREATOR && notional > (cap * CREATOR_OI_CAP_BPS) / DerivMath.BPS) {
            revert CreatorCapExceeded();
        }

        USDC.safeTransferFrom(msg.sender, address(this), marginUsdc);

        uint256 feeUsdc = DerivMath.wadToUsdc((notional * TRADE_FEE_BPS) / DerivMath.BPS);
        if (feeUsdc >= marginUsdc) revert MarginTooSmall();
        uint256 marginWad = DerivMath.usdcToWad(marginUsdc - feeUsdc);

        size = _swap(isLong, notional);
        entryPrice = DerivMath.divWad(notional, size);

        _positions[msg.sender] = Position({
            size: isLong ? int256(size) : -int256(size),
            margin: marginWad,
            openNotional: notional,
            entryPrice: entryPrice,
            entryFunding: cumFunding
        });
        netSize += isLong ? int256(size) : -int256(size);
        openInterestNotional += notional;

        _payFee(feeUsdc);
        INSURANCE.reportOi(openInterestNotional);

        // Pozycja, ktora rodzi sie juz pod woda (poslizg zjadl bufor), nie ma
        // prawa powstac - inaczej likwidator zabiera ja w tym samym bloku.
        if (_marginRatioBps(msg.sender) < int256(uint256(MAINTENANCE_MARGIN_BPS))) revert MarginRatioTooLow();

        emit PositionOpened(msg.sender, isLong, marginUsdc, notional, size, entryPrice);
    }

    function closePosition() external nonReentrant returns (uint256 payoutUsdc) {
        if (_positions[msg.sender].size == 0) revert NoPosition();
        _pokeFunding();
        (payoutUsdc,) = _close(msg.sender, address(0));
    }

    /**
     * Likwidacja. Otwarta dla KAZDEGO adresu - kto pierwszy, ten bierze
     * LIQUIDATION_FEE_BPS od notionalu wyjscia. Tworca feedu nie ma tu ani
     * uprawnienia, ani mozliwosci zablokowania cudzej likwidacji. Reszta
     * kapitalu, jesli cokolwiek zostalo, wraca do wlasciciela pozycji.
     */
    function liquidate(address trader) external nonReentrant returns (uint256 keeperRewardUsdc) {
        if (_positions[trader].size == 0) revert NoPosition();
        _pokeFunding();
        if (_marginRatioBps(trader) >= int256(uint256(MAINTENANCE_MARGIN_BPS))) revert PositionHealthy();
        (, keeperRewardUsdc) = _close(trader, msg.sender);
    }

    /* ====================================================================== */
    /*  WNETRZE                                                                */
    /* ====================================================================== */

    function _pokeFunding() private {
        if (block.timestamp >= lastFundingAt + FUNDING_INTERVAL) _settleFunding();
    }

    /**
     * Wymiana na krzywej stalego iloczynu. `k` liczymy z BIEZACYCH rezerw, nie
     * z zapamietanej stalej - rezerwy zmieniaja sie tylko o to, co faktycznie
     * przeszlo, wiec `k` moze rosnac o zaokraglenia i tak ma byc.
     *
     * Kupno bazy (long): quote rosnie, base spada, wynik W DOL.
     * Sprzedaz bazy (short): quote spada, base rosnie, wynik W GORE - obie
     * strony na niekorzysc wolajacego.
     */
    function _swap(bool isLong, uint256 quoteAmount) private returns (uint256 baseAmount) {
        uint256 q = quoteReserve;
        uint256 b = baseReserve;
        uint256 k = q * b;

        if (isLong) {
            uint256 newQ = q + quoteAmount;
            uint256 newB = k / newQ;
            baseAmount = b - newB;
            quoteReserve = newQ;
            baseReserve = newB;
        } else {
            if (quoteAmount >= q) revert NotionalTooLarge();
            uint256 newQ = q - quoteAmount;
            uint256 newB = (k + newQ - 1) / newQ;
            baseAmount = newB - b;
            quoteReserve = newQ;
            baseReserve = newB;
        }
        if (baseAmount == 0) revert BadReserves();
    }

    /** Odwrotnosc `_swap` - zwraca notional USD za oddanie `baseAmount`. */
    function _unswap(bool wasLong, uint256 baseAmount) private returns (uint256 quoteAmount) {
        uint256 q = quoteReserve;
        uint256 b = baseReserve;
        uint256 k = q * b;

        if (wasLong) {
            // Long oddaje baze: base rosnie, quote spada.
            uint256 newB = b + baseAmount;
            uint256 newQ = k / newB;
            quoteAmount = q - newQ;
            quoteReserve = newQ;
            baseReserve = newB;
        } else {
            if (baseAmount >= b) revert NotionalTooLarge();
            uint256 newB = b - baseAmount;
            uint256 newQ = (k + newB - 1) / newB;
            quoteAmount = newQ - q;
            quoteReserve = newQ;
            baseReserve = newB;
        }
    }

    function _close(address trader, address keeper) private returns (uint256 payoutUsdc, uint256 keeperRewardUsdc) {
        Position memory p = _positions[trader];
        bool wasLong = p.size > 0;
        uint256 absSize = DerivMath.abs(p.size);

        int256 funding = DerivMath.mulWadInt(p.size, cumFunding - p.entryFunding);
        uint256 exitNotional = _unswap(wasLong, absSize);

        int256 pnl = wasLong
            ? int256(exitNotional) - int256(p.openNotional)
            : int256(p.openNotional) - int256(exitNotional);

        uint256 feeWad = (exitNotional * TRADE_FEE_BPS) / DerivMath.BPS;
        uint256 liqFeeWad = keeper == address(0) ? 0 : (exitNotional * LIQUIDATION_FEE_BPS) / DerivMath.BPS;

        delete _positions[trader];
        netSize -= p.size;
        openInterestNotional -= p.openNotional;

        int256 equity = int256(p.margin) + pnl - funding - int256(feeWad) - int256(liqFeeWad);
        if (equity < 0) {
            // Dziura idzie na fundusz, NIE na depozyty pozostalych traderow.
            // Pokrycie moze byc czesciowe - wtedy reszta zostaje strata modulu
            // i jest widoczna w zdarzeniu.
            uint256 shortfallWad = uint256(-equity);
            uint256 covered = INSURANCE.coverShortfall(DerivMath.wadToUsdc(shortfallWad) + 1);
            coveredBadDebtUsdc += covered;
            emit BadDebt(trader, shortfallWad, covered);
            equity = 0;
        }

        uint256 feeUsdc = DerivMath.wadToUsdc(feeWad);
        keeperRewardUsdc = DerivMath.wadToUsdc(liqFeeWad);
        payoutUsdc = DerivMath.wadToUsdc(uint256(equity));

        _payFee(feeUsdc);
        INSURANCE.reportOi(openInterestNotional);
        if (keeperRewardUsdc != 0) USDC.safeTransfer(keeper, keeperRewardUsdc);
        if (payoutUsdc != 0) USDC.safeTransfer(trader, payoutUsdc);

        if (keeper == address(0)) {
            emit PositionClosed(trader, exitNotional, pnl, funding, payoutUsdc);
        } else {
            emit Liquidated(trader, keeper, keeperRewardUsdc, payoutUsdc);
            emit PositionClosed(trader, exitNotional, pnl, funding, payoutUsdc);
        }
    }

    /** Najpierw przelew, potem `notifyFee` - dystrybutor sprawdza pokrycie. */
    function _payFee(uint256 feeUsdc) private {
        if (feeUsdc == 0) return;
        USDC.safeTransfer(address(FEES), feeUsdc);
        FEES.notifyFee(CREATOR, feeUsdc);
    }

    /* ====================================================================== */
    /*  ODCZYT DLA UI I LIKWIDATOROW                                           */
    /* ====================================================================== */

    function getPosition(address trader)
        external
        view
        returns (int256 size, uint256 margin, uint256 openNotional, uint256 entryPrice, int256 funding)
    {
        Position storage p = _positions[trader];
        return (p.size, p.margin, p.openNotional, p.entryPrice, pendingFunding(trader));
    }

    /** Niezrealizowany wynik po cenie mark (bez poslizgu wyjscia). */
    function unrealizedPnl(address trader) public view returns (int256) {
        Position storage p = _positions[trader];
        if (p.size == 0) return 0;
        uint256 notionalNow = DerivMath.mulWad(DerivMath.abs(p.size), markPrice());
        return p.size > 0
            ? int256(notionalNow) - int256(p.openNotional)
            : int256(p.openNotional) - int256(notionalNow);
    }

    /**
     * Kapital pozycji jako czesc notionalu biezacego, w bps.
     * Moze byc ujemny - wtedy pozycja jest juz zlym dlugiem.
     */
    function marginRatioBps(address trader) external view returns (int256) {
        return _marginRatioBps(trader);
    }

    function _marginRatioBps(address trader) private view returns (int256) {
        Position storage p = _positions[trader];
        if (p.size == 0) return type(int256).max;
        uint256 notionalNow = DerivMath.mulWad(DerivMath.abs(p.size), markPrice());
        if (notionalNow == 0) return type(int256).max;
        int256 equity = int256(p.margin) + unrealizedPnl(trader) - pendingFunding(trader);
        return (equity * int256(DerivMath.BPS)) / int256(notionalNow);
    }

    /**
     * Cena, przy ktorej kapital spada do progu utrzymania. Wyprowadzenie
     * (dla longa, `s` = rozmiar, `mm` = MAINTENANCE_MARGIN_BPS):
     *
     *   margin + (s*P - openNotional) - funding = mm/1e4 * s*P
     *   s*P*(1 - mm/1e4) = openNotional + funding - margin
     *
     * Dla shorta znak przy `s*P` sie odwraca i mianownik rosnie o `mm`.
     * Zero znaczy "nieosiagalna w tym kierunku" (np. long z depozytem
     * wiekszym niz notional).
     */
    function liquidationPrice(address trader) external view returns (uint256) {
        Position storage p = _positions[trader];
        if (p.size == 0) return 0;
        uint256 absSize = DerivMath.abs(p.size);
        int256 funding = pendingFunding(trader);
        int256 mm = int256(uint256(MAINTENANCE_MARGIN_BPS));

        if (p.size > 0) {
            int256 num = int256(p.openNotional) + funding - int256(p.margin);
            if (num <= 0) return 0;
            uint256 perUnit = (uint256(num) * DerivMath.WAD) / absSize;
            return (perUnit * DerivMath.BPS) / uint256(int256(DerivMath.BPS) - mm);
        } else {
            int256 num = int256(p.openNotional) + int256(p.margin) - funding;
            if (num <= 0) return 0;
            uint256 perUnit = (uint256(num) * DerivMath.WAD) / absSize;
            return (perUnit * DerivMath.BPS) / uint256(int256(DerivMath.BPS) + mm);
        }
    }
}
