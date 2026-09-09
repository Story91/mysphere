// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import {
    IPoolManagerV4,
    IUnlockCallback,
    PoolKey,
    ModifyLiquidityParams,
    BalanceDeltaLib,
    PoolStateReader
} from "./interfaces/IPoolManagerV4.sol";
import {IB20Asset} from "./interfaces/IB20Asset.sol";
import {B20LaunchHook, HOOK_ALL_MASK, HOOK_REQUIRED_FLAGS} from "./B20LaunchHook.sol";
import {TickMath} from "./lib/TickMath.sol";
import {LiquidityAmounts} from "./lib/LiquidityAmounts.sol";
import {FullMath} from "./lib/FullMath.sol";

interface ILiquidityVault {
    function seed(address token, address creator, PoolKey calldata key, uint160 sqrtPriceX96)
        external
        payable
        returns (uint128 liquidity, uint256 amount0, uint256 amount1, uint256 toDead);

    function seedWithConfig(
        address token,
        address creator,
        PoolKey calldata key,
        uint160 sqrtPriceX96,
        uint16 buybackBps
    ) external payable returns (uint128 liquidity, uint256 amount0, uint256 amount1, uint256 toDead);

    function HOOK() external view returns (address);

    function POOL_MANAGER() external view returns (address);
}

/**
 * LIQUIDITY VAULT - wlasciciel pozycji LP kazdego awansowanego tokena.
 *
 * ===========================================================================
 * CZYM DOKLADNIE ZAMKNIETA JEST TA PLYNNOSC
 * ===========================================================================
 * Nie NFT wyslanym na adres martwy. Nie blokada czasowa. Nie obietnica.
 *
 * Na Uniswap v4 pozycja nie ma zadnego tokena wlasnosci: jest kluczowana przez
 * `(owner, tickLower, tickUpper, salt)`, gdzie `owner` to adres, ktory zawolal
 * `modifyLiquidity`. Wlascicielem jest wiec TEN kontrakt, i pytanie "czy da sie
 * ja wyjac" sprowadza sie do jednego, sprawdzalnego czytaniem: czy istnieje tu
 * sciezka wykonania, ktora poda `liquidityDelta < 0`.
 *
 * W calym pliku sa DOKLADNIE DWA wywolania `modifyLiquidity`:
 *   1. `_seedCallback` - delta = `int256(uint256(liquidity))`, gdzie `liquidity`
 *      jest typu uint128. Konwersja uint128 -> int256 nie ma reprezentacji
 *      liczby ujemnej. Osiagalne raz na token (zapadka `seeded`) i tylko
 *      z adresu LAUNCHPAD (immutable).
 *   2. `_harvestCallback` - delta wpisana LITERALNIE jako `int256(0)`.
 *      Nie jest parametrem, nie pochodzi z calldaty, nie pochodzi z pamieci.
 *
 * Nie ma tu `owner`, `pause`, `upgrade`, `delegatecall`, `selfdestruct`,
 * `rescue`, `withdraw`, `sweep`, `setFee`, `setRecipient`. Nie ma funkcji,
 * ktora przyjmuje `int256` od kogokolwiek.
 *
 * Czego wolno o tym powiedziec: plynnosc jest ZAMKNIETA W KONTRAKCIE BEZ
 * WYJSCIA. Czego NIE wolno: ze jest "spalona". To dwa rozne zdania i tylko
 * pierwsze jest prawdziwe - z tego kontraktu wychodza narosle oplaty LP,
 * i wlasnie po to on istnieje zamiast adresu 0xdEaD.
 *
 * ===========================================================================
 * DLACZEGO NIE PALIMY LP
 * ===========================================================================
 * Spalone LP kosztuje dokladnie tyle: oplaty handlowe narosle na pozycji sa
 * nieodbieralne przez NIKOGO, wiec przychod protokolu umiera w chwili, gdy
 * token zaczyna zyc. Odczyt z mainnetu pokazal, ze `modifyLiquidity` z delta 0
 * zwraca same narosle oplaty (feesAccrued0 = 99999999999999 po jednym swapie).
 * Ta konstrukcja daje wiec jedno i drugie naraz: kapitalu nie da sie ruszyc,
 * a oplaty plyna - dzielone wedlug `PROTOCOL_SHARE_BPS` miedzy protokol i
 * tworce, w ETH i w tokenie. Kazde wdrozenie do tej pory ustawilo 3000, czyli
 * 30% protokol i 70% tworca; stalo tu "60/40" z czasow przed zmiana proporcji
 * i bylo to juz nieprawda o samym sobie.
 *
 * ===========================================================================
 * ZERO PUSHA
 * ===========================================================================
 * `harvest` nie wysyla nikomu ani wei - ksieguje do `claimableEth` /
 * `claimableToken`, a wysylka to osobna transakcja (`claim*`). Wzorzec
 * z AskEscrow i ten sam powod: odbiorca, ktory rewertuje, nie ma prawa
 * zablokowac operacji, ktora dotyczy takze kogos innego.
 */
contract LiquidityVault is IUnlockCallback {
    using BalanceDeltaLib for int256;

    /* ---------------------------------------------------------------------- */
    /*  STALE                                                                  */
    /* ---------------------------------------------------------------------- */

    /**
     * Znany adres Uniswap v4 PoolManager na Base mainnet - 24 009 bajtow kodu,
     * sprawdzone `eth_getCode`. NIE jest to juz wartosc uzywana przez kontrakt,
     * tylko punkt odniesienia dla skryptu wdrozeniowego i dla kazdego, kto
     * sprawdza wdrozenie na Base po fakcie: `vault.POOL_MANAGER()` ma tu byc
     * rowne temu.
     */
    address public constant POOL_MANAGER_BASE_MAINNET = 0x498581fF718922c3f8e6A244956aF099B2652b2b;

    /**
     * PoolManager tej sieci. `immutable`, a NIE `constant` - zmiana wobec
     * poprzedniej wersji, w ktorej staly tu na sztywno bajty adresu Base.
     *
     * Powod, dla ktorego to bylo `constant`, byl dobry: ma byc wiadomo, gdzie
     * leza pieniadze, bez zaufania do tego, kto wdrazal. Skutek juz nie byl:
     * kontraktu nie dalo sie wdrozyc na ZADNA inna siec bez edycji zrodla,
     * a edycja zrodla hooka uniewaznia wykopany salt. Base Sepolia i Robinhood
     * byly przez to niedostepne, mimo ze caly `ITokenFactory` powstal wlasnie
     * po to, zeby byly - naglowek `CurveLaunchpad` twierdzil, ze fabryka jest
     * JEDYNA rzecza rozniaca sieci, i bylo to nieprawda.
     *
     * To, co gwarantowala stala, zastepuja tu trzy rzeczy naraz:
     *  1. asercja `extcodesize > 0` ponizej - adres bez kodu wywala WDROZENIE,
     *     a nie pierwszy awans po zebraniu cudzych pieniedzy;
     *  2. jedno zrodlo: vault i hook dostaja ten sam adres z tej samej zmiennej,
     *     wiec nie da sie ich rozjechac;
     *  3. `immutable` - po wdrozeniu nie ma settera i nigdy nie bedzie.
     *
     * Czego to NIE gwarantuje i trzeba nazwac: adres z kodem, ale nie ten,
     * przechodzi te asercje. Broni przed literowka i przed adresem pustym,
     * nie przed zla wola wdrazajacego. Na to jest odczyt po wdrozeniu.
     */
    address public immutable POOL_MANAGER;

    /**
     * Smietnik na nadmiar tokena (~45.33M sztuk, 4.53% podazy).
     *
     * NIE jest to spalenie: wariant ASSET nie daje nam BURN_ROLE (nie mamy
     * zadnej roli), wiec `totalSupply` sie nie zmienia. To jest transfer na
     * adres bez klucza prywatnego i tylko tak wolno go opisywac.
     */
    address public constant DEAD = 0x000000000000000000000000000000000000dEaD;

    /**
     * Sufit udzialu protokolu w oplatach LP - czyli PODLOGA udzialu tworcy.
     *
     * Twardy limit w KODZIE, nie w konfiguracji deployu, dokladnie jak
     * MAX_FEE_BPS w AskEscrow: ma ograniczac takze tego, kto wdraza. 8000 znaczy
     * "tworcy nie da sie zejsc ponizej 20%, nawet literowka przy deployu".
     */
    uint16 public constant MAX_PROTOCOL_SHARE_BPS = 8000;

    /* ---------------------------------------------------------------------- */
    /*  KONFIGURACJA - NIEZMIENNA                                              */
    /* ---------------------------------------------------------------------- */

    /**
     * Jedyny adres, ktory moze zasilic pule.
     *
     * Ustawiany na `msg.sender` w konstruktorze, bo ten kontrakt jest wdrazany
     * PRZEZ konstruktor `CurveLaunchpad`. Dzieki temu nie istnieje ani jeden
     * blok, w ktorym vault wskazuje na zly launchpad, i nie ma settera, ktory
     * by to kiedykolwiek zmienil. Wiazanie jest sprawdzalne jednym odczytem.
     */
    address public immutable LAUNCHPAD;

    address public immutable FEE_RECIPIENT;
    uint16 public immutable PROTOCOL_SHARE_BPS;

    /**
     * Nasz hook. Wdrazany PRZEZ TEN KONTRAKT, w konstruktorze, pod adresem
     * wykopanym wczesniej offline.
     *
     * ---------------------------------------------------------------------
     * DLACZEGO TO VAULT WDRAZA HOOKA, A NIE ODWROTNIE
     * ---------------------------------------------------------------------
     * Bo inaczej zaleznosc jest kolem. Hook musi wiedziec, kto ma prawo otworzyc
     * pule (vault), a vault musi znac adres hooka, bo ten adres wchodzi do
     * `PoolKey`. Przy dwoch osobnych deployach jedna strona zawsze wskazuje na
     * adres przewidziany, a nie istniejacy - i konczy sie setterem.
     *
     * Kolo lamie sie tak: hook nie przyjmuje adresu vaulta, tylko bierze
     * `msg.sender`. Jego kod tworzacy nie zalezy wiec od niczego, czego jeszcze
     * nie ma, a caly lancuch adresow da sie policzyc offline PRZED pierwsza
     * transakcja:
     *
     *   adres wdrazajacego + nonce  ->  adres launchpada
     *   adres launchpada  + nonce 1 ->  adres vaulta        (CREATE, bez argumentow w adresie)
     *   adres vaulta + salt + kod   ->  adres hooka         (CREATE2, kopany)
     *
     * Wiazanie powstaje w JEDNEJ transakcji i sprawdza sie dwoma odczytami:
     * `vault.HOOK()` i `hook.VAULT()`.
     */
    address public immutable HOOK;

    /* ---------------------------------------------------------------------- */
    /*  STAN                                                                   */
    /* ---------------------------------------------------------------------- */

    /**
     * Pozycja LP jednego tokena. Piec pol = 224 bity = JEDEN slot.
     *
     * Czego tu NIE MA: `poolId` (to keccak klucza, wiec przechowywanie byloby
     * drugim zrodlem prawdy) ani calego `PoolKey` - `currency0` jest u nas
     * z definicji zerowe, a `hooks` to `HOOK`, ktory jest `immutable`. Trzymanie
     * ich w pamieci na token pozwalaloby kiedys wpisac tam cos innego.
     */
    struct Position {
        uint24 fee;
        int24 tickSpacing;
        int24 tickLower;
        int24 tickUpper;
        uint128 liquidity;
    }

    mapping(address => Position) public positions;

    /** Zapadka jednokierunkowa: drugi `seed` tego samego tokena rewertuje. */
    mapping(address => bool) public seeded;

    /** Komu naliczyc dzialke tworcy z oplat LP. Zapisane raz, przy zasileniu. */
    mapping(address => address) public creatorOf;

    mapping(address => uint256) public claimableEth;
    mapping(address => mapping(address => uint256)) public claimableToken;

    /* ---------------------------------------------------------------------- */
    /*  ZDARZENIA                                                              */
    /* ---------------------------------------------------------------------- */

    event Seeded(
        address indexed token,
        bytes32 indexed poolId,
        address indexed creator,
        uint128 liquidity,
        uint256 amount0,
        uint256 amount1,
        uint256 ethDust,
        uint256 tokensToDead,
        int24 tickLower,
        int24 tickUpper
    );

    event Harvested(
        address indexed token, bytes32 indexed poolId, address indexed caller, uint256 fee0, uint256 fee1
    );

    event LpFeeAccrued(address indexed token, address indexed account, uint256 ethAmount, uint256 tokenAmount);

    event EthClaimed(address indexed account, uint256 amount, address indexed caller);
    event TokenClaimed(address indexed token, address indexed account, uint256 amount, address indexed caller);

    /* ---------------------------------------------------------------------- */
    /*  BLEDY                                                                  */
    /* ---------------------------------------------------------------------- */

    error ZeroAddress();
    error ProtocolShareTooHigh();
    error PoolManagerHasNoCode();
    error BadHookAddress();
    error HookConfigMismatch();
    error PoolStateUnreadable();
    error NotLaunchpad();
    error NotPoolManager();
    error NotUnlocking();
    error AlreadySeeded();
    error NotSeeded();
    error BadPoolKey();
    error ZeroLiquidity();
    error NotEnoughToken();
    error UnexpectedDelta();
    error NothingToClaim();
    error EthTransferFailed();
    error TokenTransferFailed();
    error Reentrancy();

    /* ---------------------------------------------------------------------- */
    /*  OCHRONA PRZED WEJSCIEM POWROTNYM                                       */
    /* ---------------------------------------------------------------------- */

    /** Startuje od 1, zeby pierwsze uzycie nie placilo 20k za zapis zerowego slotu. */
    uint256 private _lock = 1;

    /**
     * Flaga wejscia do `unlock`. `unlockCallback` jest publiczne z koniecznosci
     * (PoolManager musi je zawolac), wiec samo `msg.sender == POOL_MANAGER` nie
     * wystarcza: PoolManager wola callback na TYM, kto zawolal `unlock`,
     * a `unlock` moze zawolac ktokolwiek. Bez tej flagi ktos postronny
     * odblokowalby PoolManagera i kazal nam wykonac nasza wlasna sciezke
     * w wybranym przez siebie momencie.
     */
    uint8 private _action;
    uint8 private constant ACTION_NONE = 0;
    uint8 private constant ACTION_SEED = 1;
    uint8 private constant ACTION_HARVEST = 2;

    modifier nonReentrant() {
        if (_lock != 1) revert Reentrancy();
        _lock = 2;
        _;
        _lock = 1;
    }

    /* ---------------------------------------------------------------------- */
    /*  KONSTRUKTOR                                                            */
    /* ---------------------------------------------------------------------- */

    /**
     * @param hookSalt_ salt CREATE2 wykopany przez `scripts/mineHookAddress.ts`.
     *
     * ZLY SALT WYWALA WDROZENIE, A NIE PIERWSZY AWANS. To jest cala tresc
     * dwoch asercji ponizej i jedyny powod, dla ktorego one tu sa.
     *
     * Bez sprawdzenia bitow adresu deploy przeszedlby, launchpad zaczalby
     * przyjmowac pieniadze, a `HookAddressNotValid` odpadloby dopiero przy
     * PIERWSZYM awansie - czyli po zebraniu 3 ETH od ludzi, w kontrakcie,
     * ktorego nie da sie ani poprawic, ani zatrzymac. Sprawdzenie kosztuje
     * jedna operacje bitowa.
     */
    constructor(address poolManager_, address feeRecipient_, uint16 protocolShareBps_, bytes32 hookSalt_) {
        if (feeRecipient_ == address(0)) revert ZeroAddress();
        if (protocolShareBps_ > MAX_PROTOCOL_SHARE_BPS) revert ProtocolShareTooHigh();

        // Adres bez kodu wywala WDROZENIE. Bez tego literowka w adresie
        // PoolManagera przeszlaby przez deploy, launchpad zaczalby przyjmowac
        // pieniadze, a `initialize` odbiloby sie od pustego adresu dopiero przy
        // pierwszym awansie - w kontrakcie, ktorego nie da sie ani poprawic,
        // ani zatrzymac. Dokladnie ten sam powod, dla ktorego bity adresu hooka
        // sprawdzamy tutaj, a nie w `seed`.
        if (poolManager_ == address(0)) revert ZeroAddress();
        uint256 pmCodeSize;
        assembly {
            pmCodeSize := extcodesize(poolManager_)
        }
        if (pmCodeSize == 0) revert PoolManagerHasNoCode();

        POOL_MANAGER = poolManager_;
        LAUNCHPAD = msg.sender;
        FEE_RECIPIENT = feeRecipient_;
        PROTOCOL_SHARE_BPS = protocolShareBps_;

        address hook =
            address(new B20LaunchHook{salt: hookSalt_}(poolManager_, feeRecipient_, protocolShareBps_));

        // v4 czyta uprawnienia hooka z dolnych 14 bitow jego adresu. Nie zgadzaja
        // sie - kazda pula z tym hookiem odpada na `HookAddressNotValid`.
        if (uint160(hook) & HOOK_ALL_MASK != HOOK_REQUIRED_FLAGS) {
            revert BadHookAddress();
        }

        // Hook dostaje odbiorce oplaty i udzial protokolu wlasnymi argumentami
        // (patrz uzasadnienie w jego konstruktorze), wiec da sie je przekrecic
        // niezaleznie od tego, co ma vault. Tu sie to zamyka: dwa rozne
        // podzialy oplat w jednym systemie nie przejda przez deploy.
        if (B20LaunchHook(payable(hook)).FEE_RECIPIENT() != feeRecipient_) revert HookConfigMismatch();
        if (B20LaunchHook(payable(hook)).PROTOCOL_SHARE_BPS() != protocolShareBps_) revert HookConfigMismatch();
        // PoolManager tez. Hook wola `take` na SWOIM adresie, wiec rozjazd
        // znaczylby, ze oplata hooka jest sciagana z innej ksiegowosci niz ta,
        // w ktorej stoi nasza plynnosc - i wyszloby to dopiero na pierwszej
        // wymianie. Argument idzie z tej samej zmiennej, wiec dzis nie ma jak
        // sie rozjechac; asercja pilnuje tego, zeby nie zaczelo byc inaczej.
        if (B20LaunchHook(payable(hook)).POOL_MANAGER() != poolManager_) revert HookConfigMismatch();

        HOOK = hook;
    }

    /**
     * Istnieje WYLACZNIE dlatego, ze `PoolManager.take` placi natywne ETH
     * zwyklym `call` - bez tego `harvest` nie mialby jak odebrac oplat w ETH.
     *
     * Konsekwencja, ktora trzeba nazwac: ETH przyslane tu przez kogokolwiek
     * innego jest NIE DO ODZYSKANIA, bo nie ma funkcji ratunkowej i nie bedzie.
     * Ksiegowosc nie czyta `address(this).balance` ani razu, wiec taka wplata
     * nie zmienia zadnego wyliczenia - zwieksza tylko saldo ponad zobowiazania.
     */
    receive() external payable {}

    /* ---------------------------------------------------------------------- */
    /*  ODCZYTY                                                                */
    /* ---------------------------------------------------------------------- */

    function poolKeyOf(address token) public view returns (PoolKey memory) {
        Position memory p = positions[token];
        return PoolKey({
            currency0: address(0),
            currency1: token,
            fee: p.fee,
            tickSpacing: p.tickSpacing,
            hooks: HOOK
        });
    }

    function positionOf(address token)
        external
        view
        returns (bytes32 poolId, uint128 liquidity, int24 tickLower, int24 tickUpper)
    {
        Position memory p = positions[token];
        if (!seeded[token]) return (bytes32(0), 0, 0, 0);
        return (PoolStateReader.poolId(poolKeyOf(token)), p.liquidity, p.tickLower, p.tickUpper);
    }

    /* ---------------------------------------------------------------------- */
    /*  ZASILENIE PULI - RAZ NA TOKEN, TYLKO Z LAUNCHPADA                      */
    /* ---------------------------------------------------------------------- */

    /**
     * Wklada CALE przyslane ETH do puli i zamyka pozycje na zawsze.
     *
     * Wolajacy (launchpad) przed tym wywolaniem przelewa tu CALA reszte tokena
     * z krzywej. Ile go trzeba, liczy pula; nadmiar idzie na adres martwy.
     *
     * Ile tokena dostalismy, czytamy z `balanceOf(address(this))`, a nie
     * z parametru: parametr dalby launchpadowi mozliwosc pomylenia sie o liczbe,
     * ktorej vault i tak nie moze zweryfikowac inaczej niz saldem.
     *
     * ---------------------------------------------------------------------
     * CO TO SALDO NAPRAWDE ZNACZY - poprawka znaleziska #6
     * ---------------------------------------------------------------------
     * Poprzednia wersja tego akapitu twierdzila, ze w chwili `seed` ten kontrakt
     * NIE MOZE trzymac tego tokena z zadnego innego tytulu. To bylo NIEPRAWDA:
     * kazdy, kto kupil na krzywej, moze zwyklym `transfer` przyslac tu tokeny
     * przed awansem - ani B20, ani `LaunchToken` nie maja zadnej bramki na
     * przychodzacy transfer i miec nie moga.
     *
     * Prawdziwe zdanie jest slabsze, ale wystarczajace: saldo moze byc tylko
     * WIEKSZE od tego, co przyszlo z krzywej, nigdy mniejsze. Ile tokena idzie
     * do puli, liczy `modifyLiquidity` z plynnosci, a nie z tego salda; caly
     * nadmiar leci na `DEAD`. Kierunek bledu jest wiec bezpieczny dla puli
     * i dla protokolu - traci wylacznie ten, kto przyslal tokeny w prezencie.
     *
     * To jest ZALOZENIE, ktore nadal obowiazuje, i dlatego zostalo przepisane
     * zamiast usuniete: gdyby ktos kiedys uzaleznil od tego salda cokolwiek
     * poza `toDead`, powyzsze przestaje wystarczac.
     */
    function seed(address token, address creator, PoolKey calldata key, uint160 sqrtPriceX96)
        external
        payable
        nonReentrant
        returns (uint128 liquidity, uint256 amount0, uint256 amount1, uint256 toDead)
    {
        return _seed(token, creator, key, sqrtPriceX96, 0);
    }

    function seedWithConfig(
        address token,
        address creator,
        PoolKey calldata key,
        uint160 sqrtPriceX96,
        uint16 buybackBps_
    ) external payable nonReentrant returns (uint128 liquidity, uint256 amount0, uint256 amount1, uint256 toDead) {
        return _seed(token, creator, key, sqrtPriceX96, buybackBps_);
    }

    function _seed(
        address token,
        address creator,
        PoolKey calldata key,
        uint160 sqrtPriceX96,
        uint16 buybackBps_
    ) internal returns (uint128 liquidity, uint256 amount0, uint256 amount1, uint256 toDead) {
        if (msg.sender != LAUNCHPAD) revert NotLaunchpad();
        if (buybackBps_ > 10_000) revert BadPoolKey();
        if (seeded[token]) revert AlreadySeeded();
        if (token == address(0) || creator == address(0)) revert ZeroAddress();

        // Ksztalt klucza jest tu sprawdzany, a nie zakladany. Vault ma byc
        // czytelny bez czytania launchpada: para jest natywnym ETH przeciw temu
        // tokenowi, z NASZYM hookiem i zadnym innym.
        if (key.currency0 != address(0) || key.currency1 != token || key.hooks != HOOK) {
            revert BadPoolKey();
        }
        if (key.tickSpacing <= 0) revert BadPoolKey();

        B20LaunchHook(payable(HOOK)).configureToken(token, buybackBps_);

        // ------------------------------------------------------------------
        // PULA POWSTAJE TUTAJ, W CHWILI AWANSU - I TO JEST ZMIANA WOBEC
        // POPRZEDNIEJ WERSJI, KTORA KASUJE TRZY ZNALEZISKA AUDYTU
        // ------------------------------------------------------------------
        // Przedtem launchpad inicjalizowal CZTERY pule bez hooka juz przy
        // starcie tokena, a tu trzeba bylo sprawdzac, ktora z nich nie zostala
        // po drodze zatruta - bo pule bez plynnosci kazdy moze przesunac cenowo
        // za darmo. Stad bral sie `poolsMask`, `_pickCleanPool` i trzy osobne
        // znaleziska wrogiego przegladu (#1, #2, #3).
        //
        // Z hookiem w kluczu to okno nie istnieje: `beforeInitialize` odrzuca
        // kazdego poza tym kontraktem, wiec puli z naszym hookiem NIKT OBCY
        // NIE OTWORZY - ani wczesniej, ani w tym samym bloku. Nie ma czego
        // zatruwac i nie ma z czego wybierac, wiec pula moze powstac dopiero
        // teraz, jedna, i od razu z plynnoscia.
        //
        // Skutek uboczny wart nazwania: start tokena przestaje placic ~240k
        // gazu za cztery `initialize`, w tym te 99% startow, ktore nigdy nie
        // awansuja.
        //
        // `initialize` rewertuje `PoolAlreadyInitialized`, gdy pula juz istnieje.
        // Nie lapiemy tego w `try/catch`: jedyna droga do takiego stanu wiedzie
        // przez nasz wlasny `seed`, ktory jest za zapadka `seeded`, wiec rewert
        // znaczy "w tym kodzie jest blad", a nie "ktos nas ubiegl".
        IPoolManagerV4(POOL_MANAGER).initialize(key, sqrtPriceX96);

        // Odczyt ceny ZARAZ PO wlasnym `initialize` nie jest ostroznoscia - jest
        // jedynym miejscem, w ktorym weryfikujemy, ze w ogole POTRAFIMY czytac
        // stan PoolManagera. Numer slotu `_pools` (6) to szczegol ukladu pamieci,
        // nie czesc ABI. Bledne wyprowadzenie wywala tu pierwszy awans na
        // testnecie, zamiast dac cicho zla liczbe na mainnecie.
        if (PoolStateReader.sqrtPriceX96(POOL_MANAGER, key) != sqrtPriceX96) revert PoolStateUnreadable();

        // Pelny zakres, wyrownany do siatki tej puli. Symetrycznie, wiec
        // pozycja obejmuje cene biezaca z ogromnym zapasem w obie strony.
        int24 tickUpper = (TickMath.MAX_TICK / key.tickSpacing) * key.tickSpacing;
        int24 tickLower = -tickUpper;

        liquidity = LiquidityAmounts.getLiquidityForAmount0(
            sqrtPriceX96, TickMath.getSqrtPriceAtTick(tickUpper), msg.value
        );
        if (liquidity == 0) revert ZeroLiquidity();

        // EFFECTS przed jakimkolwiek wyjsciem na zewnatrz. Zapadka `seeded`
        // ustawiona TUTAJ, a nie po udanym `unlock`: gdyby PoolManager kiedys
        // oddal nam sterowanie, zastanie stan koncowy.
        seeded[token] = true;
        creatorOf[token] = creator;
        positions[token] = Position({
            fee: key.fee,
            tickSpacing: key.tickSpacing,
            tickLower: tickLower,
            tickUpper: tickUpper,
            liquidity: liquidity
        });

        uint256 heldBefore = IB20Asset(token).balanceOf(address(this));

        _action = ACTION_SEED;
        bytes memory ret = IPoolManagerV4(POOL_MANAGER).unlock(abi.encode(ACTION_SEED, token));
        _action = ACTION_NONE;
        (amount0, amount1) = abi.decode(ret, (uint256, uint256));

        // Nadmiar tokena na adres martwy. Ostatnia operacja, zeby awans byl
        // atomowy: gdyby ten transfer kiedykolwiek odpadl, cofa sie takze
        // zasilenie puli i krzywa zostaje w stanie Locked - sprzedaze dzialaja,
        // nikt nie jest uwieziony.
        if (amount1 > heldBefore) revert NotEnoughToken();
        toDead = heldBefore - amount1;
        if (toDead != 0) _safeTransfer(token, DEAD, toDead);

        emit Seeded(
            token,
            PoolStateReader.poolId(key),
            creator,
            liquidity,
            amount0,
            amount1,
            msg.value - amount0, // pyl ETH: zostaje tu na zawsze, patrz receive()
            toDead,
            tickLower,
            tickUpper
        );
    }

    /* ---------------------------------------------------------------------- */
    /*  ZBIOR OPLAT LP - BEZUPRAWNIENIOWE                                      */
    /* ---------------------------------------------------------------------- */

    /**
     * Sciaga narosle oplaty LP i ksieguje je wedlug `PROTOCOL_SHARE_BPS`
     * (dotad zawsze 30% protokol / 70% tworca).
     *
     * Wolac moze ktokolwiek i nie dostaje za to nic - kierunek ksiegowania jest
     * zaszyty (`FEE_RECIPIENT` immutable, `creatorOf[token]` zapisane przy
     * zasileniu), wiec wolajacy nie ma czego przekierowac. Dzieki temu tworca
     * nie potrzebuje gazu ani zycia, zeby jego udzial narastal.
     */
    function harvest(address token) external nonReentrant {
        if (!seeded[token]) revert NotSeeded();

        _action = ACTION_HARVEST;
        bytes memory ret = IPoolManagerV4(POOL_MANAGER).unlock(abi.encode(ACTION_HARVEST, token));
        _action = ACTION_NONE;

        (uint256 fee0, uint256 fee1) = abi.decode(ret, (uint256, uint256));

        address creator = creatorOf[token];

        // Udzial protokolu liczony w dol, tworca dostaje RESZTE - dzieki temu
        // obie nogi sumuja sie do zebranej kwoty co do wei, a pyl z dzielenia
        // trafia do tworcy, nie do nas.
        uint256 protoEth = FullMath.mulDivDown(fee0, PROTOCOL_SHARE_BPS, 10_000);
        uint256 protoTok = FullMath.mulDivDown(fee1, PROTOCOL_SHARE_BPS, 10_000);
        uint256 creatorEth = fee0 - protoEth;
        uint256 creatorTok = fee1 - protoTok;

        if (protoEth != 0) claimableEth[FEE_RECIPIENT] += protoEth;
        if (creatorEth != 0) claimableEth[creator] += creatorEth;
        if (protoTok != 0) claimableToken[token][FEE_RECIPIENT] += protoTok;
        if (creatorTok != 0) claimableToken[token][creator] += creatorTok;

        emit LpFeeAccrued(token, FEE_RECIPIENT, protoEth, protoTok);
        emit LpFeeAccrued(token, creator, creatorEth, creatorTok);
        emit Harvested(token, PoolStateReader.poolId(poolKeyOf(token)), msg.sender, fee0, fee1);
    }

    /* ---------------------------------------------------------------------- */
    /*  CALLBACK POOL MANAGERA                                                 */
    /* ---------------------------------------------------------------------- */

    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        if (msg.sender != POOL_MANAGER) revert NotPoolManager();
        if (_action == ACTION_NONE) revert NotUnlocking();

        (uint8 action, address token) = abi.decode(data, (uint8, address));
        // Akcja z calldaty musi zgadzac sie z ta, ktora sami przed chwila
        // ustawilismy - inaczej dane z callbacku bylyby drugim, niezaleznym
        // zrodlem prawdy o tym, co robimy.
        if (action != _action) revert NotUnlocking();

        if (action == ACTION_SEED) return _seedCallback(token);
        return _harvestCallback(token);
    }

    /**
     * JEDYNE w tym kontrakcie wywolanie `modifyLiquidity` z delta zmienna.
     *
     * `liquidityDelta` powstaje z `uint128` przez `int256(uint256(...))`.
     * W tej konwersji nie istnieje wartosc ujemna - to jest wlasnie ta wlasnosc,
     * ktora zamyka plynnosc, i jest ona wlasnoscia BAJTKODU, nie komentarza.
     */
    function _seedCallback(address token) private returns (bytes memory) {
        Position memory p = positions[token];
        PoolKey memory key = poolKeyOf(token);

        (int256 callerDelta,) = IPoolManagerV4(POOL_MANAGER).modifyLiquidity(
            key,
            ModifyLiquidityParams({
                tickLower: p.tickLower,
                tickUpper: p.tickUpper,
                liquidityDelta: int256(uint256(p.liquidity)),
                salt: bytes32(0)
            }),
            ""
        );

        // Dodanie plynnosci moze nas tylko OBCIAZYC. Dodatnia delta znaczy, ze
        // rozumiemy stan puli inaczej niz PoolManager - wtedy przerywamy zamiast
        // zgadywac, co z tym zrobic.
        int128 d0 = callerDelta.amount0();
        int128 d1 = callerDelta.amount1();
        if (d0 > 0 || d1 > 0) revert UnexpectedDelta();

        uint256 owed0 = uint256(uint128(-d0));
        uint256 owed1 = uint256(uint128(-d1));

        // Natywne ETH: bez `sync`, wartosc idzie prosto w wywolaniu.
        if (owed0 != 0) IPoolManagerV4(POOL_MANAGER).settle{value: owed0}();

        // Token: `sync` PRZED transferem, potem `settle` bez wartosci -
        // PoolManager ksieguje roznice sald. Kolejnosc potwierdzona przebiegiem
        // na mainnecie (paid == owed co do wei).
        if (owed1 != 0) {
            IPoolManagerV4(POOL_MANAGER).sync(token);
            _safeTransfer(token, POOL_MANAGER, owed1);
            IPoolManagerV4(POOL_MANAGER).settle();
        }

        return abi.encode(owed0, owed1);
    }

    /**
     * DRUGIE i ostatnie wywolanie `modifyLiquidity`. Delta wpisana literalnie.
     *
     * `modifyLiquidity` z delta 0 nie rusza kapitalu - zwraca wylacznie oplaty
     * narosle na pozycji. Potwierdzone odczytem na mainnecie.
     */
    function _harvestCallback(address token) private returns (bytes memory) {
        Position memory p = positions[token];
        PoolKey memory key = poolKeyOf(token);

        (int256 callerDelta,) = IPoolManagerV4(POOL_MANAGER).modifyLiquidity(
            key,
            ModifyLiquidityParams({
                tickLower: p.tickLower,
                tickUpper: p.tickUpper,
                liquidityDelta: int256(0),
                salt: bytes32(0)
            }),
            ""
        );

        int128 d0 = callerDelta.amount0();
        int128 d1 = callerDelta.amount1();
        // Przy delcie 0 kontrakt nie moze byc niczego winien puli. Gdyby byl,
        // znaczyloby to, ze nie rozumiemy semantyki `modifyLiquidity`.
        if (d0 < 0 || d1 < 0) revert UnexpectedDelta();

        uint256 fee0 = uint256(uint128(d0));
        uint256 fee1 = uint256(uint128(d1));

        if (fee0 != 0) IPoolManagerV4(POOL_MANAGER).take(address(0), address(this), fee0);
        if (fee1 != 0) IPoolManagerV4(POOL_MANAGER).take(token, address(this), fee1);

        return abi.encode(fee0, fee1);
    }

    /* ---------------------------------------------------------------------- */
    /*  ODBIOR                                                                 */
    /* ---------------------------------------------------------------------- */

    function claimEth() external {
        _payoutEth(msg.sender);
    }

    /** Ktokolwiek moze zaplacic gaz za cudza wyplate; kierunek jest zaszyty w kodzie. */
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
        emit EthClaimed(account, amount, msg.sender);
        (bool ok,) = account.call{value: amount}("");
        if (!ok) revert EthTransferFailed();
    }

    function _payoutToken(address token, address account) private nonReentrant {
        uint256 amount = claimableToken[token][account];
        if (amount == 0) revert NothingToClaim();
        claimableToken[token][account] = 0;
        emit TokenClaimed(token, account, amount, msg.sender);
        _safeTransfer(token, account, amount);
    }

    /**
     * B20 rewertuje przy niepowodzeniu, ale token, ktory oddaje `false`,
     * przepuscilby operacje jako udana - a tutaj "udana" znaczy "pula dostala
     * zaplate". Sprawdzamy oba warianty, jak w AskEscrow.
     */
    function _safeTransfer(address token, address to, uint256 amount) private {
        (bool ok, bytes memory ret) = token.call(abi.encodeCall(IB20Asset.transfer, (to, amount)));
        if (!ok || (ret.length != 0 && !abi.decode(ret, (bool)))) revert TokenTransferFailed();
    }
}
