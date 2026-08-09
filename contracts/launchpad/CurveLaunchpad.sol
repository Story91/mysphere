// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import {IB20Asset, IB20AssetFactory, B20AssetCreateParams} from "./interfaces/IB20Asset.sol";
import {IPoolManagerV4, PoolKey, PoolStateReader} from "./interfaces/IPoolManagerV4.sol";
import {LiquidityVault, ILiquidityVault} from "./LiquidityVault.sol";
import {FullMath} from "./lib/FullMath.sol";

/**
 * CURVE LAUNCHPAD - krzywa wiazana dla tokenow B20 bez wlasciciela.
 *
 * ===========================================================================
 * CO TEN KONTRAKT OBIECUJE I CZYM TO WYMUSZA
 * ===========================================================================
 * 1. NIKT NIE DODRUKUJE. Token powstaje z `initialAdmin = address(0)`, a podaz
 *    jest wybijana w oknie bootstrapu, w TEJ SAMEJ transakcji. Zaraz potem
 *    czytamy z lancucha, ze zadnej roli nie ma - i kazdy falsz rewertuje caly
 *    start. Obietnica, ktorej sie nie sprawdza, jest regulaminem, nie kodem.
 * 2. NIKT NIE RUSZY REZERWY. Nie ma tu `owner`, `pause`, `upgrade`,
 *    `delegatecall`, `rescue`, `withdraw`, `sweep`, `setFee`, `setRecipient`.
 *    Oplata i jej odbiorca sa `immutable` z twardym sufitem w konstruktorze.
 * 3. NIKT NIE JEST UWIEZIONY. W kazdym stanie poza `Graduated` sprzedaz do
 *    krzywej dziala; po `Graduated` istnieje pula. Nie ma stanu, w ktorym
 *    posiadacz nie moze wyjsc.
 *
 * Czego ten kontrakt o sobie NIE MOWI: ze chroni przed tworca kupujacym
 * z drugiego adresu (sybil jest darmowy i zawsze bedzie), ze limit w oknie
 * startowym jest anty-botem (nie jest - zmusza tylko snajpera do rozbicia
 * zakupu na wiele adresow i blokow, czyli do zrobienia tego na widoku), ani ze
 * token bedzie na DexScreenerze przed awansem (indeksery reaguja na powstanie
 * PULI, nie tokena).
 *
 * ===========================================================================
 * KRZYWA: STALY ILOCZYN Z WIRTUALNA REZERWA ETH
 * ===========================================================================
 * Stan: `ethReserve` (realne wei), `tokenReserve` (realne jednostki bazowe).
 * `R = R_VIRT + ethReserve`, niezmiennik `R * tokenReserve = k`, gdzie `k` jest
 * NIEMALEJACE. To jedno zdanie zastepuje dowod wyplacalnosci: odsprzedaz calej
 * podazy w obiegu daje dokladnie `ethReserve`, ani wei wiecej.
 *
 * REZERW NIGDY NIE PRZELICZAMY Z `k`. Zmieniaja sie dokladnie o to, co
 * fizycznie sie przemiescilo. Odtworzenie `T = k/R` skasowaloby narosly
 * margines zaokragleniowy, a nastepna operacja wyssalaby go z powrotem.
 *
 * ZADEN odczyt `balanceOf` ani `address(this).balance` nie wchodzi do wyceny
 * ani do warunku progu. To domyka wektor "dotacja ETH przesuwa cene albo
 * wyzwala awans w wybranym przez napastnika bloku".
 *
 * ===========================================================================
 * DLACZEGO AWANS NIE DZIEJE SIE W `buy` - NAJWAZNIEJSZA DECYZJA W TYM PLIKU
 * ===========================================================================
 * Specyfikacja dopuszczala awans atomowy wewnatrz kupna przekraczajacego prog,
 * opakowany w `try/catch`. Zostal USUNIETY i to jest swiadoma zmiana.
 *
 * Powod jest jeden i nie da sie go obejsc kodem: ta sama calldata `buy`
 * kosztuje ~85k gazu normalnie i kilkaset tysiecy do ponad miliona, gdy
 * przekroczy prog. Portfel wola `eth_estimateGas` na stanie sprzed progu, ktos
 * inny kupuje przed nami, i nasza transakcja laduje w nastepnym bloku juz jako
 * ta przekraczajaca - z limitem gazu wyliczonym dla wersji taniej. Wynik: albo
 * spalona transakcja uzytkownika, albo `try/catch`, ktory lyka blad braku gazu
 * i wpada w `Locked`. Dzialoby sie to przy KAZDYM tokenie dochodzacym do progu
 * w ruchu - czyli dokladnie przy tych kilku procentach, ktore stanowia
 * wiekszosc obrotu.
 *
 * Wiec: kupno, ktore sprowadza `tokenReserve` do `T_MIN`, po prostu ZAMYKA
 * krzywe (stan `Locked`). Awans jest osobnym, bezuprawnieniowym wywolaniem
 * `graduate()` z nagroda dla wolajacego.
 *
 * Co to kosztuje i dlaczego to nie jest problem: powstaje okno miedzy
 * zamknieciem a awansem. Okno bylo grozne tylko dlatego, ze pozwalalo KUPIC
 * tuz pod cena puli i sprzedac w puli po awansie - darmowa opcja. W stanie
 * `Locked` kupno rewertuje, wiec opcji nie ma. Sprzedaz zostaje otwarta, bo
 * alternatywa to stan zakladniczy.
 *
 * Co zyskujemy poza przewidywalnym gazem: znika `try/catch` wokol sciezki,
 * przez ktora przechodza wszystkie pieniadze. `catch` nie odroznia "pula jest
 * zatruta" od "w tej wersji kodu jest blad" i cichoby zamienil drugie
 * w pierwsze.
 *
 * Nagroda 0.05 ETH dla wolajacego `graduate()` jest ~500x kosztu gazu na Base
 * i owszem, wywola wyscig botow - ale wyscig o WYWOLANIE, nie o bycie ostatnim
 * kupujacym. Nie przesuwa ceny nikomu i nie zmienia niczyjej pozycji.
 */
contract CurveLaunchpad {
    /* ====================================================================== */
    /*  STALE - PODAZ I KRZYWA                                                 */
    /* ====================================================================== */

    /** Cala podaz, mintowana RAZ, w calosci do tego kontraktu. */
    uint256 public constant T0 = 1_000_000_000e18;

    /**
     * Rezerwa awansu. Krzywa sprzedaje 800M (80%), reszta idzie do puli
     * i na adres martwy. Prog jest na TOKENIE, nie na ETH: warunek
     * `ethReserve >= 3 ether` moglby wyladowac na 2.9999... przez zaokraglenia
     * w dol i nigdy nie trafic.
     */
    uint256 public constant T_MIN = 200_000_000e18;

    /**
     * Wirtualna rezerwa ETH. NIGDY nie jest wyplacana i wlasnie dlatego bilans
     * sie domyka. Wyznacza jednoczesnie: kurs startowy 7.5e-10 ETH/token,
     * mnoznik ceny na krzywej 25x = (T0/(T0-C))^2 i zbiorke do awansu
     * G = R_VIRT * C/(T0-C) = 3.00 ETH DOKLADNIE.
     *
     * Cena doktryny "zero administracji": ta stala jest w ETH, a percepcja
     * uzytkownika w dolarach. Naprawa zlej stalej = nowa fabryka pod nowym
     * adresem. Wyrocznia ceny ETH jest zakazana przez te sama zasade, co role.
     */
    uint256 public constant R_VIRT = 0.75 ether;

    /* ====================================================================== */
    /*  STALE - OPLATY                                                         */
    /* ====================================================================== */

    /** Twardy sufit w KODZIE, nie w konfiguracji deployu: ma ograniczac takze wdrazajacego. */
    uint16 public constant MAX_FEE_BPS = 200;

    uint16 public immutable FEE_BPS;
    /** PODZBIOR FEE_BPS, nie dodatek. 40 z 100 znaczy 0.4% dla tworcy z 1% oplaty. */
    uint16 public immutable CREATOR_FEE_BPS;
    address public immutable FEE_RECIPIENT;

    /** Wdrozony przez wlasny konstruktor - patrz uzasadnienie przy konstruktorze. */
    address public immutable VAULT;

    /* ====================================================================== */
    /*  STALE - AWANS                                                          */
    /* ====================================================================== */

    /** Pobierane raz, z `ethReserve`, przy awansie. */
    uint256 public constant GRAD_FEE = 0.1 ether;
    /** Polowa dla wolajacego `graduate()`, polowa dla protokolu. */
    uint256 public constant GRAD_CALLER_REWARD = 0.05 ether;

    /**
     * sqrt(T_MIN / (R_VIRT + G)) * 2^96, gdzie G = 3 ETH.
     * = floor(sqrt(2e26 * 2^192 / 3.75e18)) = 578600690649970598590869571498871
     *
     * To jest DOKLADNIE cena zamkniecia krzywej. Pula otwiera sie tam, gdzie
     * krzywa sie skonczyla - bez tego otwiera sie ~23% nizej i kazdy, kto kupil
     * na koncu krzywej, jest pod woda w bloku awansu, czyli pierwszy handlujacy
     * w puli dostaje darmowe pieniadze.
     *
     * Kierunek waluty: v4 liczy cene jako amount1/amount0, u nas token/ETH,
     * czyli ODWROTNIE niz krzywa (ETH/token). Stad T_MIN w liczniku.
     */
    uint160 public constant SQRT_PRICE_TERMINAL = 578600690649970598590869571498871;

    /* ====================================================================== */
    /*  STALE - LIMITY HANDLU                                                  */
    /* ====================================================================== */

    /**
     * Granica analizy przepelnienia, 33x cala zbiorka. Nigdy nie zadziala
     * w praktyce - istnieje po to, zeby `tokenReserve * ethIn` mialo domkniety
     * zakres, a nie zeby cokolwiek regulowac.
     */
    uint256 public constant MAX_BUY = 100 ether;

    uint256 public constant LAUNCH_WINDOW = 300;
    /**
     * 2% podazy krzywej, NA ADRES, w oknie startowym. Jest to jednoczesnie
     * limit dev-buya: tworca jest w oknie zwyklym adresem, jedna stala, zero
     * wyjatkow. Kupno ponad limit REWERTUJE, a nie przycina - wolajacy nie
     * dostaje cichej podmiany intencji.
     */
    uint256 public constant WINDOW_ADDR_CAP = 16_000_000e18;

    /* ====================================================================== */
    /*  STALE - B20                                                            */
    /* ====================================================================== */

    /**
     * Fabryka B20 to precompile pod stalym adresem na kazdej sieci Base.
     * `eth_getCode` zwraca tu pustke, bo precompile zyje w oprogramowaniu wezla,
     * a nie jako bajtkod EVM. Brak kodu NIE znaczy, ze fabryki nie ma.
     *
     * Adres jest `constant`, a nie parametrem konstruktora, celowo: parametr
     * znaczylby, ze testujemy i wdrazamy dwa rozne kontrakty.
     */
    address public constant B20_FACTORY = 0xB20f000000000000000000000000000000000000;

    /**
     * Wariant ASSET. Wartosc odczytana z formatu adresow produkcyjnych tokenow
     * B20 (bajt nr 10 adresu to numer wariantu; wszystkie obserwowane tokeny
     * ASSET maja tam 0x00).
     *
     * NIE jest to zalozenie przyjete na slowo: `launch` sprawdza, ze token
     * NIE MA selektora `SEIZE_ROLE()`. Konfiskata istnieje w wariancie
     * STABLECOIN, a w ASSET jej nie ma - potwierdzone odczytem (selektor
     * 0x3c7e9ba5 odbija sie od precompile'a). To jest asercja, ktora POTRAFI
     * odpasc, w odroznieniu od porownania adresu z samym soba.
     */
    uint8 public constant VARIANT_ASSET = 0;

    /**
     * Identyfikatory rol AccessControl w B20.
     *
     * Wyliczone z keccak256 nazwy i ZGODNE co do bitu z wartosciami odczytanymi
     * z mainnetu (MINT_ROLE zaczyna sie 0x154c0081 i konczy 6c3686,
     * PAUSE_ROLE 0x139c2898 ... 816e46d). Zapisane wzorem, a nie literalem,
     * zeby nie dalo sie ich przekrecic literowka.
     */
    bytes32 public constant DEFAULT_ADMIN_ROLE = 0x00;
    bytes32 public constant MINT_ROLE = keccak256("MINT_ROLE");
    bytes32 public constant PAUSE_ROLE = keccak256("PAUSE_ROLE");

    /* ====================================================================== */
    /*  STALE - UNISWAP V4                                                     */
    /* ====================================================================== */

    address public constant POOL_MANAGER = 0x498581fF718922c3f8e6A244956aF099B2652b2b;

    /**
     * Cztery kandydujace warstwy oplat, w kolejnosci preferencji. Przy awansie
     * bierzemy PIERWSZA, ktorej cena jest dokladnie terminalna.
     *
     * Klucze pul nie sa nigdzie zapisywane - sa w calosci wyznaczone przez
     * (token, numer warstwy), bo currency0 i hooks sa u nas z definicji zerowe.
     * Zapis czterech `PoolKey` w pamieci trwalej kosztowalby ~240k gazu na
     * KAZDYM starcie, w tym na tych 99%, ktore nigdy nie awansuja.
     */
    uint256 public constant TIER_COUNT = 4;

    /* ====================================================================== */
    /*  STAN                                                                   */
    /* ====================================================================== */

    enum State {
        None, // nieznany token
        Curve, // handel na krzywej
        Locked, // krzywa domknieta na T_MIN, czeka na graduate(); kupno stop, sprzedaz dziala
        Graduated // terminalny
    }

    /**
     * Jeden start. Trzy sloty, ani jednego wiecej.
     *
     * `ethReserve` i `tokenReserve` jako uint128: `tokenReserve <= T0 = 1e27`,
     * a `ethReserve` nie przekroczy zbiorki do progu (~3e18) plus pyl -
     * oba z zapasem 20 rzedow wielkosci wzgledem 3.4e38.
     */
    struct Launch {
        address creator; // 160
        State state; //   8
        uint8 poolsMask; //   8 - bit i = warstwe i zainicjalizowalismy MY
        uint40 startedAt; //  40
        uint128 ethReserve;
        uint128 tokenReserve;
        bytes32 launchId; // == salt uzyty przy tworzeniu tokena
    }

    mapping(address => Launch) private _launches;

    /**
     * Licznik startow na tworce. Wchodzi do salta, wiec dwa starty tego samego
     * adresu nie moga dac tego samego tokena.
     */
    mapping(address => uint256) public creatorNonce;

    /** Ile kto kupil w oknie startowym, per token. */
    mapping(address => mapping(address => uint256)) public windowBought;

    /**
     * Komu ile sie nalezy w ETH. JEDYNE zrodlo prawdy o tym, czyje sa oplaty.
     *
     * Saldo NIE MA zadnej sciezki powrotu do kogokolwiek innego: brak clawbacku,
     * przedawnienia, escheatu. Kazdy taki termin waznosci bylby uprawnieniem do
     * zabrania cudzego zarobku, a takie uprawnienie predzej czy pozniej zostanie
     * uzyte albo wyludzone.
     */
    mapping(address => uint256) public claimable;

    /**
     * Suma wszystkiego, co kontrakt jest komus winien: rezerwy wszystkich
     * krzywych PLUS wszystkie salda `claimable`.
     *
     * NIEZMIENNIK: `address(this).balance >= totalLiabilities`, zawsze.
     * To jedyne miejsce w calym produkcie, gdzie w ogole pada slowo `balance` -
     * i nic z niego nie jest wyliczane. Istnieje po to, zeby ktokolwiek
     * z zewnatrz sprawdzil wyplacalnosc DWOMA odczytami, bez indeksowania
     * zdarzen i bez zaufania do nas.
     */
    uint256 public totalLiabilities;

    /* ====================================================================== */
    /*  ZDARZENIA - CALA HISTORIA MA DAC SIE ODTWORZYC Z SAMYCH LOGOW           */
    /* ====================================================================== */

    event Launched(
        address indexed token,
        address indexed creator,
        bytes32 indexed launchId,
        string name,
        string symbol,
        uint256 totalSupply,
        uint256 curveSupply,
        uint256 tMin,
        uint256 rVirt,
        uint16 feeBps,
        uint16 creatorFeeBps,
        uint40 startedAt
    );

    event PoolPrepared(
        address indexed token,
        bytes32 indexed poolId,
        uint24 fee,
        int24 tickSpacing,
        uint160 sqrtPriceX96,
        bool initializedByUs
    );

    /**
     * Wykres krzywej rysuje sie z `(R_VIRT + ethReserveAfter) / tokenReserveAfter`
     * po kazdym `Bought`/`Sold`. Zaden zewnetrzny indekser tego nie pokaze przed
     * awansem, wiec to jest JEDYNE zrodlo wykresu i ma byc kompletne.
     */
    event Bought(
        address indexed token,
        address indexed buyer,
        uint256 ethIn,
        uint256 ethNet,
        uint256 feeEth,
        uint256 tokensOut,
        uint256 refund,
        uint256 ethReserveAfter,
        uint256 tokenReserveAfter
    );

    event Sold(
        address indexed token,
        address indexed seller,
        uint256 tokensIn,
        uint256 ethGross,
        uint256 feeEth,
        uint256 ethOut,
        uint256 ethReserveAfter,
        uint256 tokenReserveAfter
    );

    /** kind: 0 = handel/protokol, 1 = handel/tworca, 2 = awans/protokol, 3 = awans/wolajacy */
    event FeeAccrued(address indexed token, address indexed account, uint256 amount, uint8 kind);

    /** Krzywa domknieta na progu. Od tej chwili kupno rewertuje, sprzedaz dziala, `graduate()` jest otwarte. */
    event CurveLocked(address indexed token, uint256 ethReserve, uint256 tokenReserve);

    event Graduated(
        address indexed token,
        bytes32 indexed poolId,
        address indexed caller,
        uint256 ethToPool,
        uint256 tokensToPool,
        uint256 tokensToDead,
        uint256 gradFee,
        uint160 sqrtPriceX96
    );

    event Claimed(address indexed account, uint256 amount, address indexed caller);

    /* ====================================================================== */
    /*  BLEDY                                                                  */
    /* ====================================================================== */

    error ZeroAddress();
    error FeeTooHigh();
    error CreatorFeeTooHigh();
    error UnknownToken();
    error Expired();
    error SlippageRequired();
    error Slippage();
    error ZeroAmount();
    error DustTrade();
    error BuyTooLarge();
    error WindowCap();
    error CreatorLocked();
    error CurveIsLocked();
    error AlreadyGraduated();
    error NotLocked();
    error NotB20();
    error WrongVariant();
    error WrongTokenAddress();
    error RolesAlive(bytes32 role);
    error SupplyMismatch();
    error CapMismatch();
    error PoolStateUnreadable();
    error NoCleanPool();
    error ReserveTooSmallToGraduate();
    error Arithmetic();
    error NothingToClaim();
    error EthTransferFailed();
    error TokenTransferFailed();
    error Reentrancy();

    /* ====================================================================== */
    /*  OCHRONA PRZED WEJSCIEM POWROTNYM                                       */
    /* ====================================================================== */

    /**
     * Reentrancja jest tu zamknieta DWIEMA niezaleznymi warstwami, bo
     * poprawnosc nie powinna zalezec od jednej.
     *
     * 1. STRUKTURALNIE: kolejnosc checks-effects-interactions wszedzie, gdzie
     *    cokolwiek wychodzi na zewnatrz. Wyplata ETH jest ZAWSZE ostatnia
     *    operacja funkcji, a stan jest juz koncowy, gdy sterowanie oddajemy.
     * 2. JAWNIE: ten straznik na kazdej funkcji, ktora wykonuje wywolanie
     *    zewnetrzne.
     *
     * Straznika NIE MA na czystych odczytach i na `_accrueFee`, bo nie robia
     * ani jednego wywolania zewnetrznego - `nonReentrant` na takiej funkcji
     * kosztuje gaz i daje falszywa pewnosc, ze wejscie jest zamkniete tutaj,
     * podczas gdy prawdziwe jest gdzie indziej.
     */
    uint256 private _lock = 1;

    modifier nonReentrant() {
        if (_lock != 1) revert Reentrancy();
        _lock = 2;
        _;
        _lock = 1;
    }

    /* ====================================================================== */
    /*  KONSTRUKTOR                                                            */
    /* ====================================================================== */

    /**
     * Vault jest WDRAZANY TUTAJ, a nie podawany adresem.
     *
     * Powod: wiazanie jest obustronne (launchpad musi znac vault, vault musi
     * wiedziec, kto ma prawo zasilac pule). Przy dwoch osobnych deployach jedna
     * strona zawsze wskazuje na adres przewidziany, a nie istniejacy - i albo
     * potrzebny jest setter, albo poprawnosc opiera sie na tym, ze skrypt
     * wdrozeniowy sie nie pomylil. Setter odpada z definicji tego repo.
     *
     * Tak wiazanie powstaje w jednej transakcji, jest nieodwracalne i da sie
     * je sprawdzic dwoma odczytami: `launchpad.VAULT()` i `vault.LAUNCHPAD()`.
     */
    constructor(uint16 feeBps_, uint16 creatorFeeBps_, address feeRecipient_, uint16 protocolShareBps_) {
        if (feeRecipient_ == address(0)) revert ZeroAddress();
        if (feeBps_ > MAX_FEE_BPS) revert FeeTooHigh();
        if (creatorFeeBps_ > feeBps_) revert CreatorFeeTooHigh();

        FEE_BPS = feeBps_;
        CREATOR_FEE_BPS = creatorFeeBps_;
        FEE_RECIPIENT = feeRecipient_;
        VAULT = address(new LiquidityVault(feeRecipient_, protocolShareBps_));
    }

    /* ====================================================================== */
    /*  ODCZYTY                                                                */
    /* ====================================================================== */

    function launchOf(address token)
        external
        view
        returns (
            address creator,
            State state,
            uint256 ethReserve,
            uint256 tokenReserve,
            uint40 startedAt,
            bytes32 launchId
        )
    {
        Launch memory l = _launches[token];
        return (l.creator, l.state, l.ethReserve, l.tokenReserve, l.startedAt, l.launchId);
    }

    /** (fee, tickSpacing) warstwy o numerze i. Kolejnosc = kolejnosc preferencji przy awansie. */
    function tierAt(uint256 i) public pure returns (uint24 fee, int24 tickSpacing) {
        if (i == 0) return (10000, 200);
        if (i == 1) return (3000, 60);
        if (i == 2) return (500, 10);
        return (100, 1);
    }

    function poolKeyAt(address token, uint256 i) public pure returns (PoolKey memory) {
        (uint24 fee, int24 tickSpacing) = tierAt(i);
        // currency0 = natywne ETH. Adres B20 zaczyna sie od 0xb2, wiec token
        // jest ZAWSZE currency1 - kolejnosc jest deterministyczna, nie sortujemy.
        return PoolKey({
            currency0: address(0),
            currency1: token,
            fee: fee,
            tickSpacing: tickSpacing,
            hooks: address(0)
        });
    }

    function poolKeys(address token) external pure returns (PoolKey[4] memory keys) {
        for (uint256 i; i < TIER_COUNT; ++i) {
            keys[i] = poolKeyAt(token, i);
        }
    }

    /**
     * Adres tokena z salta. Da sie tym sprawdzic PO FAKCIE, ze token z rejestru
     * naprawde pochodzi z salta zapisanego w `launchId`, bez zaufania do nas.
     *
     * Odpowiednika "przewidz adres PRZED transakcja" tu nie ma i to jest
     * decyzja - patrz `launch()`, akapit o salcie.
     */
    function tokenAddressForSalt(bytes32 salt) public view returns (address) {
        return IB20AssetFactory(B20_FACTORY).getB20Address(VARIANT_ASSET, address(this), salt);
    }

    /**
     * Cena spot krzywej w wei za JEDEN caly token (1e18 jednostek bazowych).
     *
     * Po awansie krzywej nie ma - jest pula, i to ona jest zrodlem ceny.
     * Zwracanie tu zera albo ostatniej ceny bylo by liczba bez pokrycia.
     */
    function spotPriceWeiPerToken(address token) external view returns (uint256) {
        Launch memory l = _launches[token];
        if (l.state == State.None) revert UnknownToken();
        if (l.state == State.Graduated) revert AlreadyGraduated();
        return FullMath.mulDivDown(R_VIRT + l.ethReserve, 1e18, l.tokenReserve);
    }

    /**
     * Dokladnie ta sama arytmetyka, co `buy` - lacznie z dociagnieciem do progu
     * i zwrotem nadwyzki. Jedna definicja zamiast dwoch, ktore rozjada sie przy
     * pierwszej zmianie.
     *
     * Rewertuje w tych samych stanach, w ktorych rewertuje `buy`. Wycena kupna,
     * ktorego nie da sie wykonac, to liczba, ktora klamie interfejsowi.
     */
    function quoteBuy(address token, uint256 ethIn)
        public
        view
        returns (uint256 tokensOut, uint256 fee, uint256 refund)
    {
        Launch memory l = _launches[token];
        if (l.state == State.None) revert UnknownToken();
        if (l.state == State.Locked) revert CurveIsLocked();
        if (l.state == State.Graduated) revert AlreadyGraduated();
        return _quoteBuy(l.ethReserve, l.tokenReserve, ethIn);
    }

    function quoteSell(address token, uint256 tokensIn) public view returns (uint256 ethOut, uint256 fee) {
        Launch memory l = _launches[token];
        if (l.state == State.None) revert UnknownToken();
        if (l.state == State.Graduated) revert AlreadyGraduated();
        uint256 gross = FullMath.mulDivDown(R_VIRT + l.ethReserve, tokensIn, uint256(l.tokenReserve) + tokensIn);
        fee = FullMath.mulDivUp(gross, FEE_BPS, 10_000);
        ethOut = gross - fee;
    }

    /* ====================================================================== */
    /*  START                                                                  */
    /* ====================================================================== */

    /**
     * Tworzy token, zabija wszystkie role, przygotowuje cztery pule i - jesli
     * przyszlo ETH - wykonuje dev-buy TA SAMA sciezka, co wszyscy.
     *
     * Tworca nie dostaje ani jednego tokena za darmo. Kupuje na tej samej
     * krzywej, z ta sama oplata i tym samym limitem w oknie startowym.
     *
     * ---------------------------------------------------------------------
     * SALT ZAWIERA `blockhash(block.number - 1)` - ZMIANA WOBEC SPECYFIKACJI
     * ---------------------------------------------------------------------
     * Specyfikacja wyprowadzala salt z (launchpad, tworca, nonce, chainid).
     * Wszystkie te skladniki sa znane z gory, wiec adres tokena tez byl znany
     * z gory - a adres tokena jest czescia `PoolKey`. Napastnik mogl wiec
     * WCZESNIEJ zainicjalizowac wszystkie cztery pule po absurdalnej cenie za
     * kilka centow i trwale odebrac temu tworcy mozliwosc awansu. Blokowanie
     * startu tez nie pomagalo: nieudana transakcja nie zwieksza `nonce`, wiec
     * ten sam adres tworcy zostalby zablokowany na zawsze.
     *
     * Skrot ostatniego bloku nie jest znany na tyle wczesnie, zeby zdazyc
     * przygotowac cztery transakcje `initialize` - a wsuniecie ich PRZED nasza
     * transakcje, ktora sekwencer juz przyjal, nie jest mozliwe.
     *
     * Cena: nie da sie pokazac adresu tokena w interfejsie przed wyslaniem
     * transakcji. To jest strata mala i - biorac pod uwage, ze przewidywalny
     * adres byl tu wektorem, a nie funkcja - warta zaplacenia. Adres czyta sie
     * ze zdarzenia `Launched`.
     */
    function launch(string calldata name_, string calldata symbol_, uint256 minTokensOut, uint256 deadline)
        external
        payable
        nonReentrant
        returns (address token, bytes32 launchId)
    {
        if (block.timestamp > deadline) revert Expired();

        launchId = keccak256(
            abi.encode(
                address(this),
                msg.sender,
                creatorNonce[msg.sender]++,
                block.chainid,
                blockhash(block.number - 1)
            )
        );

        token = _createToken(name_, symbol_, launchId);

        uint40 startedAt = uint40(block.timestamp);
        _launches[token] = Launch({
            creator: msg.sender,
            state: State.Curve,
            poolsMask: 0,
            startedAt: startedAt,
            ethReserve: 0,
            tokenReserve: uint128(T0),
            launchId: launchId
        });

        emit Launched(
            token,
            msg.sender,
            launchId,
            name_,
            symbol_,
            T0,
            T0 - T_MIN,
            T_MIN,
            R_VIRT,
            FEE_BPS,
            CREATOR_FEE_BPS,
            startedAt
        );

        // Pule przygotowujemy MY, w tej samej transakcji, co token. Napastnik
        // nie ma jak byc pierwszy, bo adres tokena poznaje dopiero teraz.
        // Po `Launched`, zeby zdarzenia `PoolPrepared` opisywaly token, ktory
        // czytajacy logi juz zna. Drugi zapis trafia w ten sam, cieply slot.
        _launches[token].poolsMask = _preparePools(token);

        if (msg.value != 0) {
            _buy(token, msg.value, minTokensOut);
        }
    }

    /**
     * Tworzenie tokena + WSZYSTKIE asercje post-warunkow.
     *
     * Kazdy falsz rewertuje caly start. Nie istnieje sciezka, w ktorej token
     * z zywa rola trafia do rejestru krzywej.
     *
     * Czego tu NIE asertujemy i dlaczego - to jest wazniejsze od tego, co
     * asertujemy:
     *
     * - `policyId(TRANSFER_SENDER) == 0` (blocklista). Specyfikacja tego zadala,
     *   my tego nie robimy. Numer slotu polityki jest ENUMEM, ktorego wartosci
     *   nie odczytalismy z lancucha. Zle zgadniety numer wskazalby na INNY slot,
     *   ktory takze jest zerem - wiec asercja by przeszla i niczego nie
     *   dowiodla. Asercja, ktora nie potrafi odpasc, jest teatrem i czyta sie
     *   jak zabezpieczenie, ktorym nie jest. To, co ja zastepuje, jest
     *   mocniejsze: `updatePolicy` wymaga DEFAULT_ADMIN_ROLE, ktorego nie ma
     *   u nikogo (asertowane nizej) i ktorego nie da sie odtworzyc, bo
     *   `grantRole` tez jest za ta rola.
     * - `BURN_ROLE` / `METADATA_ROLE`. Nie wiemy, czy te selektory istnieja
     *   w wariancie ASSET. Wywolanie nieistniejacej roli rewertuje, wiec
     *   asercja "na wszelki wypadek" zablokowalaby kazdy start. Brak roli MINT
     *   i brak admina i tak zamykaja wszystko, co dotyczy podazy; METADATA
     *   pozostaje jako ryzyko, ktore ma byc NAPISANE na stronie tokena,
     *   a nie przemilczane.
     */
    function _createToken(string calldata name_, string calldata symbol_, bytes32 salt)
        private
        returns (address token)
    {
        bytes memory params = abi.encode(
            B20AssetCreateParams({
                version: 1,
                name: name_,
                symbol: symbol_,
                initialAdmin: address(0), // token bez wlasciciela OD PIERWSZEJ SEKUNDY
                decimals: 18
            })
        );

        // Wykonywane w oknie bootstrapu, czyli zanim bramki rol cokolwiek
        // zablokuja. To jedyny moment, w ktorym da sie wybic podaz tokenowi,
        // ktory nigdy nie mial administratora.
        bytes[] memory initCalls = new bytes[](2);
        initCalls[0] = abi.encodeWithSignature("mint(address,uint256)", address(this), T0);
        initCalls[1] = abi.encodeWithSignature("updateSupplyCap(uint256)", T0);

        // value: 0 OBOWIAZKOWO - fabryka rewertuje NonPayable() (0x6fb1b0e9)
        // na kazde wei, mimo ze jej interfejs jest `payable`.
        token = IB20AssetFactory(B20_FACTORY).createB20{value: 0}(VARIANT_ASSET, salt, params, initCalls);

        // Adres musi zgadzac sie z tym, co fabryka sama wylicza dla NASZEGO
        // adresu, tego salta i tego wariantu. Zamyka to podmiane zwracanego
        // adresu i wiaze `VARIANT_ASSET` z wynikiem - bez wklejania wzoru
        // adresu do kodu.
        if (token != IB20AssetFactory(B20_FACTORY).getB20Address(VARIANT_ASSET, address(this), salt)) {
            revert WrongTokenAddress();
        }

        // isB20Initialized, a NIE isB20: isB20 sprawdza sam FORMAT adresu
        // i zwraca true takze dla tokena, ktorego nie ma.
        if (!IB20AssetFactory(B20_FACTORY).isB20Initialized(token)) revert NotB20();

        // Wariant ASSET nie ma SEIZE_ROLE - konfiskata to sprawa wariantu
        // STABLECOIN. Nieznany selektor odbija sie od precompile'a, wiec
        // POWODZENIE tego wywolania znaczy, ze stworzylismy zly wariant.
        (bool seizeExists,) = token.staticcall(abi.encodeWithSignature("SEIZE_ROLE()"));
        if (seizeExists) revert WrongVariant();

        if (IB20Asset(token).totalSupply() != T0) revert SupplyMismatch();
        if (IB20Asset(token).balanceOf(address(this)) != T0) revert SupplyMismatch();
        // supplyCap == totalSupply domyka "nikt nie dodrukuje" na poziomie
        // niezmiennika, a nie tylko braku roli. Dwie niezalezne przyczyny.
        if (IB20Asset(token).supplyCap() != T0) revert CapMismatch();

        // address(0) jako POSIADACZ roli tez jest sprawdzany: "rola nalezy do
        // nikogo" i "rola nalezy do adresu zerowego" to dwa rozne stany
        // i tylko pierwszy jest tym, o co nam chodzi.
        _requireNoRole(token, DEFAULT_ADMIN_ROLE, address(0));
        _requireNoRole(token, DEFAULT_ADMIN_ROLE, address(this));
        _requireNoRole(token, DEFAULT_ADMIN_ROLE, B20_FACTORY);
        _requireNoRole(token, DEFAULT_ADMIN_ROLE, msg.sender);
        _requireNoRole(token, MINT_ROLE, address(this));
        _requireNoRole(token, MINT_ROLE, msg.sender);
        _requireNoRole(token, PAUSE_ROLE, address(this));
        _requireNoRole(token, PAUSE_ROLE, msg.sender);
    }

    function _requireNoRole(address token, bytes32 role, address account) private view {
        if (IB20Asset(token).hasRole(role, account)) revert RolesAlive(role);
    }

    /**
     * Inicjalizuje cztery pule po cenie TERMINALNEJ i zwraca maske tych,
     * ktore naprawde sa nasze.
     *
     * `try/catch` jest tu na `initialize`, a nie na sciezce pieniedzy: jedyne,
     * co moze odpasc, to `PoolAlreadyInitialized`, a wtedy pula po prostu nie
     * jest nasza i nie bedziemy do niej wkladac plynnosci.
     *
     * Odczyt ceny ZARAZ PO wlasnym `initialize` nie jest ostroznoscia - jest
     * jedynym miejscem, w ktorym weryfikujemy, ze potrafimy czytac stan
     * PoolManagera (numer slotu `_pools` to szczegol ukladu pamieci, nie ABI).
     * Bledne wyprowadzenie wywala wiec PIERWSZY start na testnecie, a nie awans
     * po zebraniu cudzych pieniedzy.
     */
    function _preparePools(address token) private returns (uint8 mask) {
        for (uint256 i; i < TIER_COUNT; ++i) {
            PoolKey memory key = poolKeyAt(token, i);
            bool ours;

            try IPoolManagerV4(POOL_MANAGER).initialize(key, SQRT_PRICE_TERMINAL) returns (int24 openTick) {
                openTick; // tick startowy wynika z ceny, wiec nie niesie nowej informacji
                if (PoolStateReader.sqrtPriceX96(POOL_MANAGER, key) != SQRT_PRICE_TERMINAL) {
                    revert PoolStateUnreadable();
                }
                ours = true;
                mask |= uint8(1 << i);
            } catch {
                ours = false;
            }

            emit PoolPrepared(
                token,
                PoolStateReader.poolId(key),
                key.fee,
                key.tickSpacing,
                PoolStateReader.sqrtPriceX96(POOL_MANAGER, key),
                ours
            );
        }
    }

    /* ====================================================================== */
    /*  KUPNO                                                                  */
    /* ====================================================================== */

    function buy(address token, uint256 minTokensOut, uint256 deadline)
        external
        payable
        nonReentrant
        returns (uint256 tokensOut)
    {
        if (block.timestamp > deadline) revert Expired();
        return _buy(token, msg.value, minTokensOut);
    }

    /**
     * Sciezka kupna - jedna dla wszystkich, lacznie z dev-buyem tworcy.
     *
     * `minTokensOut == 0` REWERTUJE. Brak wartosci domyslnej jest tu celowy:
     * na krzywej kazde kupno rusza cene, nie ma glebokosci, w ktorej mozna sie
     * schowac, wiec kupno bez ograniczenia poslizgu to zaproszenie do
     * sandwicza. Hojne domyslne poslizgi w interfejsie "zeby transakcje
     * przechodzily" sa dokladnie tym samym atakiem, tylko wlaczonym przez nas.
     */
    function _buy(address token, uint256 valueIn, uint256 minTokensOut) private returns (uint256 out) {
        Launch storage l = _launches[token];
        State state = l.state;

        if (state == State.None) revert UnknownToken();
        if (state == State.Locked) revert CurveIsLocked();
        if (state == State.Graduated) revert AlreadyGraduated();

        if (valueIn == 0) revert ZeroAmount();
        if (valueIn > MAX_BUY) revert BuyTooLarge();
        if (minTokensOut == 0) revert SlippageRequired();

        uint256 ethReserve = l.ethReserve;
        uint256 tokenReserve = l.tokenReserve;

        uint256 fee;
        uint256 refund;
        (out, fee, refund) = _quoteBuy(ethReserve, tokenReserve, valueIn);

        // Pyl rewertuje. Na Base gaz jest tani, wiec petla mikro-kupien
        // wykorzystujaca zaokraglenie bylaby oplacalna - a poza tym transakcja,
        // ktora nic nie kupuje, wyglada w historii jak kupno, ktore sie odbylo.
        if (out == 0) revert DustTrade();
        if (out < minTokensOut) revert Slippage();

        uint256 eIn = valueIn - fee - refund;

        // Limit w oknie startowym. Obejmuje tworce - jest w oknie zwyklym adresem.
        if (block.timestamp < uint256(l.startedAt) + LAUNCH_WINDOW) {
            uint256 acc = windowBought[token][msg.sender] + out;
            if (acc > WINDOW_ADDR_CAP) revert WindowCap();
            windowBought[token][msg.sender] = acc;
        }

        // ---- EFFECTS ----
        uint256 tokenAfter = tokenReserve - out;
        uint256 ethAfter = ethReserve + eIn;
        l.ethReserve = uint128(ethAfter);
        l.tokenReserve = uint128(tokenAfter);
        // Do rezerwy wchodzi eIn, do sald oplat fee; reszta wraca do kupujacego.
        totalLiabilities += eIn + fee;
        _accrueFee(token, l.creator, fee, 0);

        emit Bought(token, msg.sender, valueIn, eIn, fee, out, refund, ethAfter, tokenAfter);

        // Zapadka. Od tej chwili nie ma powrotu do stanu Curve: sprzedaz podnosi
        // `tokenReserve` powyzej T_MIN, ale kupno jest juz zablokowane, wiec
        // krzywa nie moze sie "odawansowac" i nie da sie bujac stanem wokol progu.
        if (tokenAfter == T_MIN) {
            l.state = State.Locked;
            emit CurveLocked(token, ethAfter, tokenAfter);
        }

        // ---- INTERACTIONS ----
        _safeTransfer(token, msg.sender, out);
        // Zwrot nadwyzki jako ABSOLUTNIE ostatnia operacja.
        if (refund != 0) _sendEth(msg.sender, refund);
    }

    /**
     * Cala arytmetyka kupna w jednym miejscu - uzywana i przez `buy`, i przez
     * `quoteBuy`, wiec interfejs nie ma jak pokazac innej liczby niz lancuch.
     */
    function _quoteBuy(uint256 ethReserve, uint256 tokenReserve, uint256 valueIn)
        private
        view
        returns (uint256 out, uint256 fee, uint256 refund)
    {
        // Oplata W GORE - na niekorzysc wolajacego.
        fee = FullMath.mulDivUp(valueIn, FEE_BPS, 10_000);
        if (fee > valueIn) return (0, 0, 0); // nieosiagalne przy FEE_BPS <= 200; strzeze przed odejmowaniem ponizej
        uint256 eIn = valueIn - fee;
        uint256 R = R_VIRT + ethReserve;

        // Tokeny W DOL - na niekorzysc wolajacego. To zaokraglenie zostawia
        // w kontrakcie WIECEJ tokena, czyli podnosi k.
        out = FullMath.mulDivDown(tokenReserve, eIn, R + eIn);

        // Dociagniecie ostatniego kupna: `tokenReserve` ma wyladowac na T_MIN
        // CO DO JEDNOSTKI, zeby prog byl trafialny dokladnie, a nie "mniej wiecej".
        if (tokenReserve - out < T_MIN) {
            out = tokenReserve - T_MIN;
            // ETH wymagane W GORE - znowu na niekorzysc wolajacego.
            uint256 need = FullMath.mulDivUp(R, out, T_MIN);
            fee = FullMath.mulDivUp(need, FEE_BPS, 10_000);
            // Asercja, nie warunek biznesowy: `need` jest z konstrukcji mniejsze
            // od `eIn` (kupujemy MNIEJ tokena niz wynikalo z pelnej kwoty),
            // a oplata liczona od mniejszej podstawy nie moze urosnac. Jesli to
            // kiedykolwiek odpadnie, znaczy ze arytmetyka nie jest tym, czym ja opisano.
            if (need + fee > valueIn) revert Arithmetic();
            refund = valueIn - need - fee;
        }
    }

    /* ====================================================================== */
    /*  SPRZEDAZ                                                               */
    /* ====================================================================== */

    function sell(address token, uint256 tokensIn, uint256 minEthOut, uint256 deadline)
        external
        nonReentrant
        returns (uint256 ethOut)
    {
        if (block.timestamp > deadline) revert Expired();
        return _sell(token, tokensIn, minEthOut);
    }

    /**
     * B20 ma ERC-2612, wiec sprzedaz miesci sie w jednej transakcji zamiast
     * dwoch. Blad `permit` jest LYKANY: podpis mogl zostac zuzyty przez kogos
     * innego w wyscigu, a wtedy allowance i tak juz jest. Jesli go nie ma,
     * `transferFrom` nizej i tak odpadnie - wiec nic nie zostaje zamiecione.
     */
    function sellWithPermit(
        address token,
        uint256 tokensIn,
        uint256 minEthOut,
        uint256 deadline,
        uint256 permitDeadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external nonReentrant returns (uint256 ethOut) {
        if (block.timestamp > deadline) revert Expired();
        if (_launches[token].state == State.None) revert UnknownToken();
        try IB20Asset(token).permit(msg.sender, address(this), tokensIn, permitDeadline, v, r, s) {} catch {}
        return _sell(token, tokensIn, minEthOut);
    }

    function _sell(address token, uint256 tokensIn, uint256 minEthOut) private returns (uint256 net) {
        Launch storage l = _launches[token];
        State state = l.state;

        if (state == State.None) revert UnknownToken();
        // Po awansie krzywej nie ma - jest pula. Sprzedaz idzie tam.
        if (state == State.Graduated) revert AlreadyGraduated();
        // W stanie Locked sprzedaz DZIALA. To jedyna rzecz, ktora musi dzialac
        // zawsze: alternatywa jest stanem zakladniczym.

        if (tokensIn == 0) revert ZeroAmount();
        if (minEthOut == 0) revert SlippageRequired();
        // Blokada dotyczy adresu, o ktorym WIEMY, ze jest tworcy. Nie twierdzimy,
        // ze zapobiega to sprzedazy tworcy z drugiego adresu - sybil jest darmowy.
        if (msg.sender == l.creator) revert CreatorLocked();

        uint256 ethReserve = l.ethReserve;
        uint256 tokenReserve = l.tokenReserve;

        // ETH W DOL - na niekorzysc wolajacego; zostawia w kontrakcie wiecej ETH.
        uint256 gross = FullMath.mulDivDown(R_VIRT + ethReserve, tokensIn, tokenReserve + tokensIn);
        if (gross == 0) revert DustTrade();
        // Straznik wyplacalnosci. Z niezmiennika k wynika, ze odsprzedaz CALEJ
        // podazy w obiegu daje dokladnie `ethReserve`, wiec to nie moze odpasc -
        // i wlasnie dlatego jest tanie i zostaje.
        if (gross > ethReserve) revert Arithmetic();

        uint256 fee = FullMath.mulDivUp(gross, FEE_BPS, 10_000);
        net = gross - fee;
        if (net < minEthOut) revert Slippage();

        // ---- EFFECTS ----
        uint256 tokenAfter = tokenReserve + tokensIn;
        uint256 ethAfter = ethReserve - gross;
        l.tokenReserve = uint128(tokenAfter);
        l.ethReserve = uint128(ethAfter);
        // Z rezerwy schodzi `gross`, do sald wchodzi `fee`, na zewnatrz idzie `net`.
        totalLiabilities -= net;
        _accrueFee(token, l.creator, fee, 0);

        emit Sold(token, msg.sender, tokensIn, gross, fee, net, ethAfter, tokenAfter);

        // ---- INTERACTIONS ----
        // Kolejnosc odwrotna niz w szkicu specyfikacji (tam transferFrom szedl
        // przed zmiana stanu). Trzymamy CEI bez wyjatkow: gdyby `transferFrom`
        // odpadl, cofa sie cala transakcja razem z zapisem stanu, wiec wczesniejszy
        // transfer niczego nie zabezpiecza, a lamie regule, ktora ma obowiazywac
        // takze wtedy, gdy ktos dolozy tu kiedys kolejne wywolanie.
        _safeTransferFrom(token, msg.sender, address(this), tokensIn);
        // Wyplata ETH jako ABSOLUTNIE ostatnia operacja.
        _sendEth(msg.sender, net);
    }

    /* ====================================================================== */
    /*  AWANS - BEZUPRAWNIENIOWY                                               */
    /* ====================================================================== */

    /**
     * Przenosi domknieta krzywe do puli Uniswap v4. Wolac moze KTOKOLWIEK.
     *
     * Nagroda 0.05 ETH nie jest zwrotem kosztu gazu (ten jest rzedu centa na
     * Base) - jest cena za to, zeby wywolanie na pewno nastapilo w tym samym
     * bloku, bez naszego udzialu i bez zadnego relayera, ktory moglby paść.
     * Ksiegowana do `claimable`, nie pushowana: wolajacy-kontrakt, ktory
     * rewertuje na odbiorze ETH, nie ma prawa zablokowac awansu.
     *
     * DO PULI IDZIE CALE ETH, TOKEN JEST LUZEM. Pula otwiera sie po cenie
     * terminalnej krzywej. Jesli w stanie Locked byly sprzedaze, cena krzywej
     * jest NIZSZA niz terminalna - zasilamy i tak po terminalnej, wiec luka jest
     * na niekorzysc pierwszego handlujacego w puli, nie na korzysc. To jest
     * wymagany kierunek: kazda luka w druga strone to darmowe pieniadze dla bota.
     */
    function graduate(address token) external nonReentrant {
        Launch storage l = _launches[token];
        State state = l.state;

        if (state == State.None) revert UnknownToken();
        if (state == State.Graduated) revert AlreadyGraduated();
        if (state != State.Locked) revert NotLocked();

        uint256 ethReserve = l.ethReserve;
        uint256 tokenReserve = l.tokenReserve;

        // Krzywa, ktora zostala odsprzedana ponizej oplaty awansowej, nie ma
        // z czego otworzyc puli. Zostaje w Locked na zawsze - sprzedaz dziala,
        // nikt nie jest uwieziony, po prostu nie ma czego awansowac.
        if (ethReserve <= GRAD_FEE) revert ReserveTooSmallToGraduate();

        // Pula wybrana PRZED zmiana stanu, zeby nieudany wybor nie zostawil
        // krzywej w stanie Graduated bez puli.
        PoolKey memory key = _pickCleanPool(token, l.poolsMask);

        uint256 eLp = ethReserve - GRAD_FEE;

        // ---- EFFECTS (zapadka PRZED jakimkolwiek wyjsciem na zewnatrz) ----
        l.state = State.Graduated;
        l.ethReserve = 0;
        l.tokenReserve = 0;
        // Z rezerwy schodzi calosc; GRAD_FEE zostaje w kontrakcie jako salda.
        totalLiabilities -= eLp;
        _accrueFee(token, msg.sender, GRAD_FEE, 2);

        // ---- INTERACTIONS ----
        _safeTransfer(token, VAULT, tokenReserve);
        (, uint256 amount0, uint256 amount1, uint256 toDead) =
            ILiquidityVault(VAULT).seed{value: eLp}(token, l.creator, key, SQRT_PRICE_TERMINAL);

        emit Graduated(
            token,
            PoolStateReader.poolId(key),
            msg.sender,
            amount0,
            amount1,
            toDead,
            GRAD_FEE,
            SQRT_PRICE_TERMINAL
        );
    }

    /**
     * Pierwsza warstwa, ktora jest NASZA i ktorej cena jest dokladnie
     * terminalna. Bez tolerancji, bez progu procentowego - rownosc bitowa.
     *
     * Dwa niezalezne warunki, bo kazdy zamyka co innego:
     *  - maska: pule, ktorej nie zainicjalizowalismy sami, nie dotykamy w ogole;
     *  - cena: pule bez plynnosci DA SIE przesunac. Swap w takiej puli konsumuje
     *    zero wejscia i przesuwa cene do zadanego limitu. Specyfikacja twierdzila
     *    tu odwrotnie ("pula bez plynnosci nie moze zmienic ceny") - to jest
     *    nieprawda, i wlasnie dlatego ten warunek NIE jest nadmiarowy.
     *
     * Klucze nie sa czytane z `getPool()` w chwili awansu - sa wyliczone ze
     * stalych. Czytamy wylacznie cene.
     */
    function _pickCleanPool(address token, uint8 mask) private view returns (PoolKey memory) {
        for (uint256 i; i < TIER_COUNT; ++i) {
            if (mask & uint8(1 << i) == 0) continue;
            PoolKey memory key = poolKeyAt(token, i);
            if (PoolStateReader.sqrtPriceX96(POOL_MANAGER, key) == SQRT_PRICE_TERMINAL) {
                return key;
            }
        }
        revert NoCleanPool();
    }

    /* ====================================================================== */
    /*  OPLATY                                                                 */
    /* ====================================================================== */

    /**
     * Oplaty NIGDY nie sa wysylane w trakcie operacji - sa ksiegowane.
     *
     * Push do odbiorcy oplaty wewnatrz `buy`/`sell` bylby wywolaniem zewnetrznym
     * w srodku ksiegowania krzywej, czyli drugim, mniej oczywistym wejsciem
     * powrotnym. Do tego odbiorca, ktory rewertuje, wywracalby handel wszystkim.
     *
     * `kind == 0` to oplata handlowa (dzielona z tworca), `kind == 2` to oplata
     * awansowa (polowa dla protokolu, polowa dla wolajacego). Podzial liczy
     * udzial mniejszej strony W DOL, a wiekszej jako RESZTE, wiec obie nogi
     * sumuja sie do calosci co do wei - nie gubimy pyla i nie tworzymy go.
     */
    function _accrueFee(address token, address counterparty, uint256 amount, uint8 kind) private {
        if (amount == 0) return;

        uint256 counterpartyCut;
        if (kind == 0) {
            // FEE_BPS == 0 nie moze tu wystapic, bo wtedy amount == 0.
            counterpartyCut = FullMath.mulDivDown(amount, CREATOR_FEE_BPS, FEE_BPS);
        } else {
            counterpartyCut = GRAD_CALLER_REWARD;
        }
        uint256 protocolCut = amount - counterpartyCut;

        if (protocolCut != 0) {
            claimable[FEE_RECIPIENT] += protocolCut;
            emit FeeAccrued(token, FEE_RECIPIENT, protocolCut, kind);
        }
        if (counterpartyCut != 0) {
            claimable[counterparty] += counterpartyCut;
            emit FeeAccrued(token, counterparty, counterpartyCut, kind + 1);
        }
    }

    function claim() external {
        _payout(msg.sender);
    }

    /**
     * Ktokolwiek moze zaplacic gaz za dostarczenie CUDZEGO salda, ale kierunek
     * przelewu jest zaszyty w kodzie: ETH idzie do `account`, nigdy do
     * msg.sender. Kazde wywolanie jest osobna transakcja, wiec jeden odbiorca,
     * ktory rewertuje, nie przewraca dostawy pozostalym.
     */
    function claimFor(address account) external {
        _payout(account);
    }

    function _payout(address account) private nonReentrant {
        uint256 amount = claimable[account];
        // Rewert zamiast cichego przejscia: pusta transakcja wygladalaby
        // w historii jak wyplata, ktora sie odbyla.
        if (amount == 0) revert NothingToClaim();

        claimable[account] = 0;
        totalLiabilities -= amount;

        emit Claimed(account, amount, msg.sender);

        _sendEth(account, amount);
    }

    /* ====================================================================== */
    /*  NISKI POZIOM                                                           */
    /* ====================================================================== */

    function _sendEth(address to, uint256 amount) private {
        (bool ok,) = to.call{value: amount}("");
        if (!ok) revert EthTransferFailed();
    }

    /**
     * B20 rewertuje przy niepowodzeniu, ale token, ktory oddaje `false` zamiast
     * rewertowac, przepuscilby kupno jako udane, a kupujacy nie dostalby nic.
     * Sprawdzamy oba warianty - jak w AskEscrow.
     */
    function _safeTransfer(address token, address to, uint256 amount) private {
        (bool ok, bytes memory ret) = token.call(abi.encodeCall(IB20Asset.transfer, (to, amount)));
        if (!ok || (ret.length != 0 && !abi.decode(ret, (bool)))) revert TokenTransferFailed();
    }

    function _safeTransferFrom(address token, address from, address to, uint256 amount) private {
        (bool ok, bytes memory ret) =
            token.call(abi.encodeCall(IB20Asset.transferFrom, (from, to, amount)));
        if (!ok || (ret.length != 0 && !abi.decode(ret, (bool)))) revert TokenTransferFailed();
    }
}
