// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import {IPoolManagerV4, PoolKey, SwapParams, BalanceDeltaLib, PoolStateReader} from "./interfaces/IPoolManagerV4.sol";
import {FullMath} from "./lib/FullMath.sol";

interface IVaultCreatorView {
    function creatorOf(address token) external view returns (address);
    function poolKeyOf(address token) external view returns (PoolKey memory);
}

/* -------------------------------------------------------------------------- */
/*  UPRAWNIENIA HOOKA - NA POZIOMIE PLIKU, ZEBY DALO SIE JE ZAIMPORTOWAC        */
/* -------------------------------------------------------------------------- */

// Maska uprawnien z `Uniswap/v4-core/src/libraries/Hooks.sol`: v4 czyta
// uprawnienia hooka z DOLNYCH 14 BITOW jego adresu.
uint160 constant HOOK_ALL_MASK = uint160((1 << 14) - 1);

uint160 constant HOOK_BEFORE_INITIALIZE_FLAG = uint160(1 << 13);
uint160 constant HOOK_AFTER_SWAP_FLAG = uint160(1 << 6);
uint160 constant HOOK_AFTER_SWAP_RETURNS_DELTA_FLAG = uint160(1 << 2);

// Dokladnie trzy bity, ani jednego wiecej. = 0x2044 = 8260.
//
// `AFTER_SWAP` bez `AFTER_SWAP_RETURNS_DELTA` pozwala hookowi tylko PATRZEC.
// Dopiero druga flaga pozwala mu zmienic rozliczenie, czyli wziac udzial.
// Flaga `*_RETURNS_DELTA` bez odpowiadajacej flagi akcji jest przez v4
// odrzucana - stad obie albo zadna.
//
// Stale stoja NA POZIOMIE PLIKU, a nie w kontrakcie, z jednego powodu:
// `LiquidityVault` musi porownac je z adresem hooka w swoim konstruktorze,
// a stalej zamknietej w kontrakcie nie da sie zaimportowac - trzeba by ja
// przepisac po drugiej stronie albo zawolac getter na kontrakcie, ktory
// wlasnie sie wdraza. Przepisana stala rozjedzie sie przy pierwszej zmianie
// uprawnien, i to cicho.
uint160 constant HOOK_REQUIRED_FLAGS =
    HOOK_BEFORE_INITIALIZE_FLAG | HOOK_AFTER_SWAP_FLAG | HOOK_AFTER_SWAP_RETURNS_DELTA_FLAG;

/**
 * HOOK LAUNCHPADA - brama do puli i udzial w kazdej wymianie.
 *
 * ===========================================================================
 * DWA ZADANIA, I TO PIERWSZE JEST WAZNIEJSZE OD DRUGIEGO
 * ===========================================================================
 *
 * 1. BRAMA (`beforeInitialize`). Pule z tym hookiem w kluczu moze otworzyc
 *    WYLACZNIE nasz vault. Kazdy inny wolajacy dostaje rewert.
 *
 *    To nie jest ozdoba. Poprzednia wersja awansu inicjalizowala cztery pule
 *    z gory (`hooks = address(0)`) i musiala potem zgadywac, ktora z nich nie
 *    zostala zatruta - bo pule BEZ PLYNNOSCI kazdy moze przesunac cenowo za
 *    darmo (swap w pustej puli konsumuje zero wejscia i idzie do zadanego
 *    limitu). Wrogi audyt wypisal z tego trzy osobne znaleziska:
 *      #1 trwale zablokowanie awansu za ~2 centy, powtarzalne w kazdym bloku,
 *      #2 `poolsMask` jako dzwignia DoS przy wyscigu w bloku startu,
 *      #3 napastnik wybiera warstwe oplat i scina przychod LP stukrotnie.
 *    Wszystkie trzy istnialy dlatego, ze OBCY mial dostep do naszej puli.
 *    Brama je kasuje u zrodla: pula z tym hookiem nie moze powstac cudza reka,
 *    wiec nie ma czego zatruwac ani z czego wybierac. Zamiast czterech pul
 *    i maski jest JEDNA pula, otwierana w chwili awansu.
 *
 * 2. UDZIAL W WYMIANIE (`afterSwap`). Bierzemy `HOOK_FEE_BPS` od kazdej
 *    wymiany w tej puli, bez konca i bez progu. Prowizja krzywej znika
 *    w chwili awansu; oplaty pozycji LP z vaulta rozwadniaja sie, gdy ktos
 *    dolozy do puli wlasna plynnosc. Ten strumien nie robi ani jednego, ani
 *    drugiego.
 *
 * ===========================================================================
 * ADRES TEGO KONTRAKTU NIE JEST DOWOLNY
 * ===========================================================================
 * v4 czyta uprawnienia hooka z DOLNYCH 14 BITOW jego adresu i rewertuje
 * `HookAddressNotValid`, gdy bity nie zgadzaja sie z tym, co hook naprawde
 * robi. Adres musi wiec zostac WYKOPANY (CREATE2) tak, zeby
 * `uint160(adres) & 0x3FFF == HOOK_FLAGS`.
 *
 * Kopalnia: `scripts/mineHookAddress.ts`. Wynik (salt) wchodzi do konstruktora
 * launchpada, a `LiquidityVault` sprawdza bity ZARAZ PO wdrozeniu hooka
 * i rewertuje caly deploy, gdy sie nie zgadzaja. Zly salt wywala wiec
 * WDROZENIE, a nie pierwszy awans po zebraniu cudzych pieniedzy.
 *
 * ===========================================================================
 * KONSTRUKTOR BEZ ARGUMENTOW - I DLACZEGO TO JEST KONIECZNE
 * ===========================================================================
 * Argumenty konstruktora wchodza do kodu tworzacego, wiec adres CREATE2
 * zalezalby od adresu vaulta - a vault musi znac adres hooka. Kolo sie nie
 * domyka i konczy sie setterem albo przewidywaniem adresu; oba sa w tym repo
 * zakazane.
 *
 * Rozwiazanie: hook nie przyjmuje NICZEGO i bierze `VAULT = msg.sender`,
 * bo wdraza go sam vault, w swoim konstruktorze. Kod tworzacy jest wtedy staly,
 * jego hash tez, wiec salt da sie wykopac offline, zanim cokolwiek stanie na
 * lancuchu. Wiazanie powstaje w jednej transakcji i sprawdza sie dwoma
 * odczytami: `hook.VAULT()` i `vault.HOOK()`.
 *
 * ===========================================================================
 * CZEGO TEN KONTRAKT O SOBIE NIE MOWI
 * ===========================================================================
 * Nie twierdzi, ze token nie moze byc handlowany gdzie indziej. Kazdy moze
 * otworzyc DRUGA pule na te sama pare bez naszego hooka i handlowac tam -
 * i nie ma sposobu, zeby tego zakazac, ani u nas, ani u Clankera. Ten hook
 * bierze udzial w wymianach w NASZEJ puli, w tej, w ktorej lezy zamknieta
 * plynnosc z awansu, i tyle o sobie mowi.
 */
contract B20LaunchHook {
    /* ====================================================================== */
    /*  UPRAWNIENIA - MUSZA ZGADZAC SIE Z DOLNYMI 14 BITAMI ADRESU             */
    /* ====================================================================== */

    /** Odczyty dla kogokolwiek z zewnatrz - definicje stoja na poziomie pliku. */
    function ALL_HOOK_MASK() external pure returns (uint160) {
        return HOOK_ALL_MASK;
    }

    function HOOK_FLAGS() external pure returns (uint160) {
        return HOOK_REQUIRED_FLAGS;
    }

    /**
     * Adres tego kontraktu MUSI niesc swoje uprawnienia w dolnych 14 bitach.
     * Sprawdza to `LiquidityVault` zaraz po wdrozeniu; ta funkcja istnieje po
     * to, zeby to samo dalo sie sprawdzic jednym odczytem z zewnatrz.
     */
    function hasValidHookAddress() external view returns (bool) {
        return uint160(address(this)) & HOOK_ALL_MASK == HOOK_REQUIRED_FLAGS;
    }

    /* ====================================================================== */
    /*  STALE                                                                  */
    /* ====================================================================== */

    /**
     * PoolManager tej sieci. `immutable`, a NIE `constant` - i to jest zmiana
     * wobec poprzedniej wersji.
     *
     * Przedtem staly tu na sztywno bajty adresu Base mainnet. Doktryna byla
     * dobra ("ma byc wiadomo, gdzie leza pieniadze"), ale skutek juz nie: kod
     * nie dawal sie wdrozyc NA ZADNA inna siec bez edycji zrodla, a edycja
     * zrodla hooka zmienia jego kod tworzacy, czyli uniewaznia wykopany salt.
     * Testy tego nie pokazywaly, bo `hardhat_setCode` wstawia atrape pod ten
     * sam adres - zielona suita nie mowila o przenosnosci nic.
     *
     * Cena tej zmiany jest nazwana wprost: wdrazajacy moze teraz wpisac zly
     * adres. Zamykaja to dwie rzeczy, obie w konstruktorze `LiquidityVault`:
     * asercja `extcodesize > 0` (adres bez kodu wywala deploy) oraz to, ze
     * vault i hook dostaja TEN SAM adres z jednego zrodla i nie da sie ich
     * rozjechac. Reszta jest do sprawdzenia jednym odczytem po wdrozeniu:
     * `hook.POOL_MANAGER() == vault.POOL_MANAGER()`.
     */
    address public immutable POOL_MANAGER;

    /**
     * Nasz udzial w wymianie: 1%. Sufit w KODZIE, nie w konfiguracji - ma
     * ograniczac takze wdrazajacego, bo tu nie ma nikogo, kto moglby go pozniej
     * podniesc.
     *
     * Dla porownania, zmierzone u konkurencji: Clanker bierze 20% oplaty LP,
     * czyli przy warstwie 1% jest to 0.2% wymiany. Nasz 1% liczy sie od tej
     * samej podstawy, ale jest jedynym naszym udzialem w puli poza pozycja
     * LP - u Clankera dochodzi jeszcze oplata tworcy 1-3%.
     */
    uint16 public constant HOOK_FEE_BPS = 100;
    uint16 public constant MAX_HOOK_FEE_BPS = 200;
    // v4 MIN_SQRT_PRICE = getSqrtPriceAtTick(MIN_TICK = -887272) = 4295128739.
    // Bylo 4_295_128_740 (min+1) - poprawka nitu z audytu wewnetrznego; clamp
    // "+1" ponizej daje wtedy min+1, czyli poprawne "ostro wieksze niz MIN".
    uint160 private constant MIN_SQRT_PRICE_X96 = 4_295_128_739;

    /**
     * O ile najwyzej wolno przesunac PIERWIASTEK ceny w jednym auto-buybacku.
     *
     * ===========================================================================
     * OGRANICZA STRATE Z KANAPKI (NIE ELIMINUJE JEJ) - DLATEGO JEST CIASNE
     * ===========================================================================
     * `executeBuyback` jest bezuprawnieniowe i `minTokensOut` podaje WOLAJACY.
     * Dopoki wymiana szla z `sqrtPriceLimitX96 = MIN_SQRT_PRICE_X96`, czyli bez
     * zadnej granicy ceny, napastnik mogl wywolac ja z `minTokensOut = 1`
     * wewnatrz kanapki: najpierw wypycha cene w gore, potem nasz buyback kupuje
     * po tej cenie za CALE `pendingBuybackEth`, a kupione tokeny ida na `DEAD`.
     * Pieniadze protokolu i tworcy wychodzily do napastnika, a spalenie bylo
     * bez wartosci. Skrypt keepera wymagal recznego minimum wlasnie dlatego -
     * ale nikt nie musi uzywac naszego skryptu.
     *
     * Granica liczona jest TUTAJ, z ceny odczytanej w tej samej transakcji, wiec
     * nie da sie jej podac z zewnatrz.
     *
     * CO TA GRANICA ROBI, A CZEGO NIE: ogranicza STRATE NA JEDNO WYWOLANIE, nie
     * eliminuje kanapki. Liczona jest ze spotu w TEJ SAMEJ transakcji, wiec
     * napastnik, ktory najpierw pcha cene, przesuwa tez punkt odniesienia -
     * dlatego trzymamy granice CIASNO. Audyt wewnetrzny (2026-08) zalecil
     * zejscie z 500 do 150 bps: buyback jest re-wywolywalny, wiec ciasniejsza
     * granica to tylko czesciowe wypelnienia i ponowienia, a najgorszy wyciek
     * na jedno wywolanie spada z ~9.75% do ~3% ceny.
     *
     * UWAGA NA KWADRAT: to jest limit na PIERWIASTKU ceny. 150 bps na
     * pierwiastku to okolo 3% na samej cenie, bo (1 - 0.015)^2 = 0.9702.
     */
    uint16 private constant MAX_BUYBACK_SLIPPAGE_BPS = 150;
    address private constant DEAD = address(0x000000000000000000000000000000000000dEaD);

    /** Udzial protokolu w tym, co wezmie hook. Reszta idzie do tworcy tokena. */
    uint16 public immutable PROTOCOL_SHARE_BPS;
    address public immutable FEE_RECIPIENT;

    /**
     * Jedyny adres, ktory moze otworzyc pule z tym hookiem, i jedyne zrodlo
     * prawdy o tym, kto jest tworca danego tokena.
     */
    address public immutable VAULT;

    /* ====================================================================== */
    /*  STAN                                                                   */
    /* ====================================================================== */

    /**
     * Zebrane, jeszcze nie rozdzielone. Dwa akumulatory wystarcza, bo brama
     * wpuszcza wylacznie pule ETH/token: `currency0` jest zawsze natywnym ETH,
     * `currency1` zawsze tokenem.
     *
     * DLACZEGO NIE DZIELIMY OD RAZU: podzial wymaga odczytu tworcy z vaulta,
     * czyli wywolania zewnetrznego W SRODKU KAZDEJ WYMIANY. Tak jest jeden
     * zapis do pamieci na wymiane, a podzial robi bezuprawnieniowe `settle`,
     * ktore ktokolwiek wola raz na jakis czas.
     */
    mapping(address => uint256) public pendingEth;
    mapping(address => uint256) public pendingToken;
    mapping(address => uint16) public buybackBps;
    mapping(address => uint256) public pendingBuybackEth;
    mapping(address => uint256) public buybackTokens;

    /** Rozdzielone i gotowe do odbioru. Bez clawbacku, przedawnienia i escheatu. */
    mapping(address => uint256) public claimableEth;
    mapping(address => mapping(address => uint256)) public claimableToken;

    /* ====================================================================== */
    /*  ZDARZENIA                                                              */
    /* ====================================================================== */

    event PoolOpened(address indexed token, bytes32 indexed poolId, uint24 fee, int24 tickSpacing);
    event HookFeeTaken(address indexed token, bool indexed isEth, uint256 amount);
    event HookFeeSettled(address indexed token, uint256 ethToProtocol, uint256 ethToCreator, uint256 ethToBuyback, uint256 tokenToProtocol, uint256 tokenToCreator);
    event Claimed(address indexed account, address indexed token, uint256 amount, address indexed caller);
    event BuybackConfigured(address indexed token, uint16 buybackBps);
    event AutoBuyback(address indexed token, uint256 ethIn, uint256 tokensBought, address indexed caller);

    /* ====================================================================== */
    /*  BLEDY                                                                  */
    /* ====================================================================== */

    error NotPoolManager();
    error NotVault();
    error BadPoolShape();
    error FeeTooHigh();
    error ZeroAddress();
    error UnknownToken();
    error NothingToClaim();
    error NothingToSettle();
    error EthTransferFailed();
    error TokenTransferFailed();
    error FeeOverflow();
    error Reentrancy();
    error Expired();
    error Slippage();
    error NothingToBuyback();
    error NotUnlocking();

    uint256 private _lock = 1;
    uint8 private _buybackAction;
    address private _buybackToken;
    uint256 private _buybackEth;
    uint256 private _buybackMinOut;

    modifier nonReentrant() {
        if (_lock != 1) revert Reentrancy();
        _lock = 2;
        _;
        _lock = 1;
    }

    modifier onlyPoolManager() {
        if (msg.sender != POOL_MANAGER) revert NotPoolManager();
        _;
    }

    modifier onlyVault() {
        if (msg.sender != VAULT) revert NotVault();
        _;
    }

    /* ====================================================================== */
    /*  KONSTRUKTOR                                                            */
    /* ====================================================================== */

    /**
     * Vault wdraza ten kontrakt sam, w swoim konstruktorze, wiec `msg.sender`
     * JEST vaultem i nie ma sposobu, zeby bylo inaczej. Adres vaulta NIE jest
     * argumentem - i wlasnie to lamie kolo zaleznosci opisane w naglowku.
     *
     * ---------------------------------------------------------------------
     * DLACZEGO ODBIORCA OPLATY JEST ARGUMENTEM, A NIE ODCZYTEM Z VAULTA
     * ---------------------------------------------------------------------
     * Pierwsza wersja czytala `FEE_RECIPIENT` i `PROTOCOL_SHARE_BPS` prosto
     * z vaulta i BYLA BLEDNA: w chwili, gdy vault wdraza hooka, vault siedzi
     * jeszcze we wlasnym konstruktorze i POD JEGO ADRESEM NIE MA KODU. Kazde
     * wywolanie oczekujace danych zwrotnych odpada wtedy na dekoderze ABI
     * (`returndatasize == 0`), czyli caly deploy rewertuje.
     *
     * Argumenty sa wiec konieczne. Kosztuja tyle, ze wchodza do kodu
     * tworzacego i zmieniaja adres CREATE2 - ale to nie jest problem, bo
     * wszystkie trzy wartosci (PoolManager, odbiorca oplaty, udzial protokolu)
     * sa znane offline, zanim cokolwiek stanie na lancuchu; kopalnia bierze je
     * na wejsciu. Skutek, o ktorym trzeba pamietac przy wdrazaniu: ZMIANA
     * KTOREJKOLWIEK z nich uniewaznia wykopany salt i trzeba kopac od nowa. Rozjazd z vaultem zamyka ASERCJA po drugiej
     * stronie: `LiquidityVault` sprawdza zaraz po wdrozeniu, ze hook oddaje
     * dokladnie te wartosci, ktore ma sam.
     */
    constructor(address poolManager_, address feeRecipient_, uint16 protocolShareBps_) {
        if (poolManager_ == address(0)) revert ZeroAddress();
        if (feeRecipient_ == address(0)) revert ZeroAddress();
        if (HOOK_FEE_BPS > MAX_HOOK_FEE_BPS) revert FeeTooHigh();

        POOL_MANAGER = poolManager_;
        VAULT = msg.sender;
        FEE_RECIPIENT = feeRecipient_;
        PROTOCOL_SHARE_BPS = protocolShareBps_;
    }

    /**
     * `PoolManager.take` placi natywne ETH zwyklym `call`, wiec bez tego hook
     * nie mialby jak odebrac swojego udzialu w ETH.
     *
     * Konsekwencja, ktora trzeba nazwac: ETH przyslane tu przez kogokolwiek
     * innego jest NIE DO ODZYSKANIA - nie ma funkcji ratunkowej i nie bedzie.
     * Ksiegowosc nie czyta `address(this).balance` ani razu, wiec taka wplata
     * nie zmienia zadnego wyliczenia.
     */
    receive() external payable {}

    function configureToken(address token, uint16 buybackBps_) external onlyVault {
        if (token == address(0) || buybackBps_ > 10_000) revert BadPoolShape();
        buybackBps[token] = buybackBps_;
        emit BuybackConfigured(token, buybackBps_);
    }

    function executeBuyback(address token, uint256 minTokensOut, uint256 deadline)
        external
        nonReentrant
        returns (uint256 tokensOut)
    {
        if (block.timestamp > deadline) revert Expired();
        uint256 ethIn = pendingBuybackEth[token];
        if (ethIn == 0) revert NothingToBuyback();

        pendingBuybackEth[token] = 0;
        _buybackAction = 1;
        _buybackToken = token;
        _buybackEth = ethIn;
        _buybackMinOut = minTokensOut;
        bytes memory ret = IPoolManagerV4(POOL_MANAGER).unlock(abi.encode(token, ethIn, minTokensOut));
        _buybackAction = 0;
        _buybackToken = address(0);
        _buybackEth = 0;
        _buybackMinOut = 0;

        uint256 spentEth;
        (tokensOut, spentEth) = abi.decode(ret, (uint256, uint256));
        if (tokensOut < minTokensOut) revert Slippage();
        // Niewydane ETH wraca do puli buybacku, a nie znika w saldzie hooka.
        if (spentEth < ethIn) pendingBuybackEth[token] += ethIn - spentEth;
        buybackTokens[token] += tokensOut;
        _safeTransfer(token, DEAD, tokensOut);
        // W zdarzeniu WYDANE ETH, nie zamowione - inaczej przy wymianie
        // czesciowej zdarzenie klamaloby o kwocie.
        emit AutoBuyback(token, spentEth, tokensOut, msg.sender);
    }

    /* ====================================================================== */
    /*  BRAMA                                                                  */
    /* ====================================================================== */

    /**
     * Pule z tym hookiem otwiera wylacznie vault, i wylacznie w ksztalcie,
     * ktory ten hook umie obsluzyc.
     *
     * `sender` to adres, ktory zawolal `PoolManager.initialize` - nie
     * `tx.origin` i nie posrednik. Dokladnie ta wlasnosc czyni z tego brame,
     * a nie sugestie.
     */
    function beforeInitialize(address sender, PoolKey calldata key, uint160)
        external
        onlyPoolManager
        returns (bytes4)
    {
        if (sender != VAULT) revert NotVault();

        // Ksztalt puli jest tu sprawdzany, a nie zakladany - dwa akumulatory
        // ponizej maja sens tylko dla pary ETH/token, i to w tej kolejnosci.
        // Natywne ETH ma adres 0x0, a v4 wymaga currency0 < currency1, wiec ta
        // kolejnosc jest jedyna mozliwa; sprawdzamy ja mimo to, bo od niej
        // zalezy, ktory akumulator dostaje pieniadze.
        if (key.currency0 != address(0)) revert BadPoolShape();
        if (key.currency1 == address(0)) revert BadPoolShape();
        if (key.hooks != address(this)) revert BadPoolShape();

        emit PoolOpened(key.currency1, _poolId(key), key.fee, key.tickSpacing);
        return this.beforeInitialize.selector;
    }

    /* ====================================================================== */
    /*  UDZIAL W WYMIANIE                                                      */
    /* ====================================================================== */

    /**
     * Bierze `HOOK_FEE_BPS` z WALUTY NIEPODANEJ w tej wymianie.
     *
     * ---------------------------------------------------------------------
     * DLACZEGO Z NIEPODANEJ, A NIE ZAWSZE Z WEJSCIA
     * ---------------------------------------------------------------------
     * Bo tylko ta strona da sie policzyc jedna regula dla obu rodzajow
     * wymiany. Przy `exactInput` wolajacy podal wejscie, wiec niepodane jest
     * WYJSCIE - dostaje o `fee` mniej. Przy `exactOutput` podal wyjscie, wiec
     * niepodane jest WEJSCIE - placi o `fee` wiecej. W obu przypadkach zwracamy
     * DODATNIA delte, ktora znaczy "hookowi sie nalezy", i w obu przypadkach
     * roznica idzie z kieszeni wolajacego, nigdy z puli.
     *
     * Wariant "zawsze od wejscia" wymagalby liczenia oplaty w `beforeSwap`,
     * gdzie przy `exactOutput` wejscie NIE JEST JESZCZE ZNANE. Skonczyloby sie
     * albo zgadywaniem, albo odrzucaniem `exactOutput` - a to druga polowa
     * ruchu z agregatorow.
     *
     * ---------------------------------------------------------------------
     * NIEPOTWIERDZONE NA LANCUCHU - DO ZAMKNIECIA PRZED MAINNETEM
     * ---------------------------------------------------------------------
     * Znak zwracanej delty (dodatnia == hook jest uznany) jest wyprowadzony
     * ze zrodel v4, nie zmierzony. To jest DOKLADNIE ten punkt, ktory
     * `docs/B20-DECYZJA-BEZ-KRZYWEJ.md` §6.1 kaze sprawdzic wywolaniem, i test
     * na forku Base z prawdziwym PoolManagerem jest tu jedynym wlasciwym
     * dowodem. Zly znak nie kradnie pieniedzy - wywala wymiane na
     * `CurrencyNotSettled`, czyli fail-closed.
     */
    function afterSwap(
        address,
        PoolKey calldata key,
        SwapParams calldata params,
        int256 delta,
        bytes calldata
    ) external onlyPoolManager returns (bytes4, int128) {
        address token = key.currency1;

        // Wlasny buyback przechodzi przez te sama pule i ten sam hook. Nie
        // naliczamy oplaty od operacji protokolowej, zeby buyback nie tworzyl
        // nieskonczonej petli oplat i nie kupowal sam siebie.
        if (_buybackAction != 0) return (this.afterSwap.selector, int128(0));

        bool unspecifiedIsCurrency1 = _unspecifiedIsCurrency1(params);
        int128 moved = unspecifiedIsCurrency1 ? BalanceDeltaLib.amount1(delta) : BalanceDeltaLib.amount0(delta);

        // Bierzemy udzial od WIELKOSCI przeplywu, bez wzgledu na to, w ktora
        // strone szedl. Znak `moved` mowi tylko, kto komu byl winien.
        //
        // Przez int256, a nie przez negacje int128: `-type(int128).min` nie
        // istnieje w int128 i wywrocilby te linie. Wartosc taka nie powinna
        // wyjsc z puli, ale "nie powinna" nie jest powodem, zeby zostawiac
        // rzutowanie, ktore przy niej odpada.
        int256 movedWide = int256(moved);
        uint256 magnitude = movedWide >= 0 ? uint256(movedWide) : uint256(-movedWide);
        if (magnitude == 0) return (this.afterSwap.selector, int128(0));

        // W GORE na niekorzysc wolajacego - ta sama regula, co na krzywej.
        uint256 fee = FullMath.mulDivUp(magnitude, HOOK_FEE_BPS, 10_000);
        if (fee == 0) return (this.afterSwap.selector, int128(0));
        // `magnitude` miesci sie w int128 (pochodzi z int128), a `fee` jest od
        // niego mniejsze przy kazdym HOOK_FEE_BPS <= 10000. Asercja jest tania
        // i zamyka rzutowanie, ktore inaczej trzeba by przyjac na slowo.
        if (fee > uint256(uint128(type(int128).max))) revert FeeOverflow();

        // Delta dodatnia uznaje hooka w PoolManagerze; `take` zamienia to
        // uznanie na realne srodki tutaj. Bez `take` saldo nie domknelo by sie
        // na koncu odblokowania i cala wymiana by odpadla.
        address currency = unspecifiedIsCurrency1 ? token : address(0);
        IPoolManagerV4(POOL_MANAGER).take(currency, address(this), fee);

        // Buyback NIE jest odejmowany tutaj. Kiedys byl - scinany z CALEJ
        // oplaty przed podzialem, czyli w wiekszosci z pieniedzy protokolu:
        // tworca ustawiajac 10_000 bps zerowal przychod protokolu z puli.
        // Od 2026-08-10 buyback jest finansowany WYLACZNIE z dzialki tworcy
        // i liczony w `settle` - dzieki temu sciezka wymiany ma jeden zapis
        // do pamieci, a udzial protokolu nie zalezy od decyzji tworcy.
        if (unspecifiedIsCurrency1) {
            pendingToken[token] += fee;
        } else {
            pendingEth[token] += fee;
        }
        emit HookFeeTaken(token, !unspecifiedIsCurrency1, fee);

        return (this.afterSwap.selector, int128(int256(fee)));
    }

    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        if (msg.sender != POOL_MANAGER) revert NotPoolManager();
        if (_buybackAction != 1) revert NotUnlocking();

        (address token, uint256 ethIn, uint256 minTokensOut) = abi.decode(data, (address, uint256, uint256));
        if (token != _buybackToken || ethIn != _buybackEth || minTokensOut != _buybackMinOut) revert BadPoolShape();

        PoolKey memory key = IVaultCreatorView(VAULT).poolKeyOf(token);

        // Granica ceny z ceny BIEZACEJ, odczytanej w tej samej transakcji.
        // Kupujemy ETH -> token, czyli `zeroForOne`, wiec cena idzie W DOL i
        // granica musi lezec ponizej spotu. Patrz MAX_BUYBACK_SLIPPAGE_BPS.
        uint160 spot = PoolStateReader.sqrtPriceX96(POOL_MANAGER, key);
        if (spot == 0) revert BadPoolShape();
        uint160 limit = uint160((uint256(spot) * (10_000 - MAX_BUYBACK_SLIPPAGE_BPS)) / 10_000);
        // v4 wymaga granicy OSTRO powyzej minimum; przy skrajnie niskiej cenie
        // powyzsze mnozenie moze zejsc do samego dna.
        if (limit <= MIN_SQRT_PRICE_X96) limit = MIN_SQRT_PRICE_X96 + 1;

        int256 delta = IPoolManagerV4(POOL_MANAGER).swap(
            key,
            SwapParams({zeroForOne: true, amountSpecified: -int256(ethIn), sqrtPriceLimitX96: limit}),
            ""
        );
        int128 amount0 = BalanceDeltaLib.amount0(delta);
        int128 amount1 = BalanceDeltaLib.amount1(delta);

        if (amount0 < 0) {
            IPoolManagerV4(POOL_MANAGER).settle{value: uint256(uint128(-amount0))}();
        } else if (amount0 > 0) {
            IPoolManagerV4(POOL_MANAGER).take(address(0), address(this), uint256(uint128(amount0)));
        }
        if (amount1 < 0) revert BadPoolShape();
        uint256 bought = uint256(uint128(amount1));
        if (bought < minTokensOut) revert Slippage();
        if (bought != 0) IPoolManagerV4(POOL_MANAGER).take(token, address(this), bought);
        // Przy granicy ceny wymiana moze byc CZESCIOWA, wiec wydane ETH nie
        // musi rownac sie `ethIn`. Oddajemy prawdziwa kwote, zeby wolajacy
        // dopisal reszte z powrotem do `pendingBuybackEth` - inaczej ta reszta
        // zostalaby na kontrakcie poza ksiegowaniem.
        uint256 spent = amount0 < 0 ? uint256(uint128(-amount0)) : 0;
        return abi.encode(bought, spent);
    }

    /**
     * Ktora waluta jest "niepodana" w tej wymianie.
     *
     *   exactInput  (amountSpecified < 0): podane WEJSCIE,  niepodane wyjscie
     *   exactOutput (amountSpecified > 0): podane WYJSCIE,  niepodane wejscie
     *
     * a przy `zeroForOne` wejsciem jest currency0. Sklejenie obu warunkow daje
     * jedno wyrazenie i zadnej tablicy przypadkow.
     */
    function _unspecifiedIsCurrency1(SwapParams calldata params) private pure returns (bool) {
        return params.amountSpecified < 0 ? params.zeroForOne : !params.zeroForOne;
    }

    /* ====================================================================== */
    /*  PODZIAL I ODBIOR                                                       */
    /* ====================================================================== */

    /**
     * Rozdziela to, co hook zebral na tokenie, miedzy protokol i tworce.
     *
     * Bezuprawnieniowe i bez nagrody: kierunek ksiegowania jest zaszyty
     * (`FEE_RECIPIENT` immutable, tworca czytany z vaulta), wiec wolajacy nie
     * ma czego przekierowac. Dzieki temu udzial tworcy narasta bez tego, zeby
     * tworca musial miec gaz albo w ogole zyc.
     */
    function settle(address token) external nonReentrant {
        uint256 eth = pendingEth[token];
        uint256 tok = pendingToken[token];
        if (eth == 0 && tok == 0) revert NothingToSettle();

        address creator = IVaultCreatorView(VAULT).creatorOf(token);

        // Ten warunek jest DZIS NIEOSIAGALNY i zostaje swiadomie.
        //
        // Nieosiagalny, bo `pending*` rosnie wylacznie w `afterSwap`, a ten
        // wola sie tylko dla puli z naszym hookiem; taka pula powstaje wylacznie
        // przez `seed`, ktory zapisuje `creatorOf` w tej samej transakcji.
        //
        // Zostaje, bo skutek jego zlamania jest nieodwracalny: bez niego udzial
        // tworcy poszedlby na `claimableEth[address(0)]`, skad nikt go nigdy nie
        // wyjmie - nie ma tu funkcji ratunkowej i nie bedzie. To nie jest wiec
        // asercja-teatr w rodzaju tych, ktore usunelismy z `PlainTokenFactory`:
        // tamte nie mialy czego chronic, ta chroni pieniadze przed cichym
        // spaleniem, gdyby ktos kiedys rozerwal powyzszy lancuch.
        if (creator == address(0)) revert UnknownToken();

        pendingEth[token] = 0;
        pendingToken[token] = 0;

        // Udzial protokolu w dol, tworca dostaje RESZTE - obie nogi sumuja sie
        // do zebranej kwoty co do wei, a pyl z dzielenia trafia do tworcy.
        uint256 protoEth = FullMath.mulDivDown(eth, PROTOCOL_SHARE_BPS, 10_000);
        uint256 protoTok = FullMath.mulDivDown(tok, PROTOCOL_SHARE_BPS, 10_000);
        uint256 creatorTok = tok - protoTok;

        // Buyback wychodzi WYLACZNIE z dzialki tworcy, po odjeciu udzialu
        // protokolu. `buybackBps` znaczy wiec "ile procent SWOJEJ czesci oplat
        // tworca oddaje na skup i spalenie" - jak suwak we Flaunch. Protokol
        // dostaje pelne PROTOCOL_SHARE_BPS niezaleznie od tej decyzji.
        // Tylko noga ETH: skup placi ETH, wiec z oplat tokenowych nie ma czego
        // finansowac.
        uint256 creatorGrossEth = eth - protoEth;
        uint256 buybackCut = FullMath.mulDivDown(creatorGrossEth, buybackBps[token], 10_000);
        uint256 creatorEth = creatorGrossEth - buybackCut;
        if (buybackCut != 0) pendingBuybackEth[token] += buybackCut;

        if (protoEth != 0) claimableEth[FEE_RECIPIENT] += protoEth;
        if (creatorEth != 0) claimableEth[creator] += creatorEth;
        if (protoTok != 0) claimableToken[token][FEE_RECIPIENT] += protoTok;
        if (creatorTok != 0) claimableToken[token][creator] += creatorTok;

        emit HookFeeSettled(token, protoEth, creatorEth, buybackCut, protoTok, creatorTok);
    }

    function claimEth() external {
        _payoutEth(msg.sender);
    }

    /**
     * Wyplata na CUDZY adres, ale zawsze DO NIEGO - kierunek jest zaszyty,
     * wiec wolajacy nie moze przekierowac cudzych pieniedzy do siebie.
     * Dzieki temu tworca bez gazu i tak dostanie swoje.
     */
    function claimEthFor(address account) external {
        _payoutEth(account);
    }

    function claimToken(address token) external {
        _payoutToken(token, msg.sender);
    }

    function claimTokenFor(address token, address account) external {
        _payoutToken(token, account);
    }

    function _payoutEth(address account) private nonReentrant {
        uint256 amount = claimableEth[account];
        if (amount == 0) revert NothingToClaim();
        claimableEth[account] = 0;

        emit Claimed(account, address(0), amount, msg.sender);

        (bool ok,) = account.call{value: amount}("");
        if (!ok) revert EthTransferFailed();
    }

    function _payoutToken(address token, address account) private nonReentrant {
        uint256 amount = claimableToken[token][account];
        if (amount == 0) revert NothingToClaim();
        claimableToken[token][account] = 0;

        emit Claimed(account, token, amount, msg.sender);

        (bool ok, bytes memory ret) =
            token.call(abi.encodeWithSignature("transfer(address,uint256)", account, amount));
        if (!ok || (ret.length != 0 && !abi.decode(ret, (bool)))) revert TokenTransferFailed();
    }

    function _safeTransfer(address token, address to, uint256 amount) private {
        (bool ok, bytes memory ret) = token.call(abi.encodeWithSignature("transfer(address,uint256)", to, amount));
        if (!ok || (ret.length != 0 && !abi.decode(ret, (bool)))) revert TokenTransferFailed();
    }

    function _poolId(PoolKey calldata key) private pure returns (bytes32) {
        return keccak256(abi.encode(key));
    }
}
