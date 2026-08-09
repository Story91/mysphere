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
import {TickMath} from "./lib/TickMath.sol";
import {LiquidityAmounts} from "./lib/LiquidityAmounts.sol";
import {FullMath} from "./lib/FullMath.sol";

interface ILiquidityVault {
    function seed(address token, address creator, PoolKey calldata key, uint160 expectedSqrtPriceX96)
        external
        payable
        returns (uint128 liquidity, uint256 amount0, uint256 amount1, uint256 toDead);
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
 * a oplaty plyna - dzielone 60/40 miedzy protokol i tworce, w ETH i w tokenie.
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
     * Uniswap v4 PoolManager na Base mainnet. 24 009 bajtow kodu, sprawdzone
     * `eth_getCode`. Stala, a nie parametr konstruktora: parametr znaczy, ze
     * wdrozony kontrakt moze wskazywac na cokolwiek, a caly sens tego pliku
     * polega na tym, ze wiadomo, gdzie leza pieniadze.
     */
    address public constant POOL_MANAGER = 0x498581fF718922c3f8e6A244956aF099B2652b2b;

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

    /* ---------------------------------------------------------------------- */
    /*  STAN                                                                   */
    /* ---------------------------------------------------------------------- */

    /**
     * Pozycja LP jednego tokena. Piec pol = 224 bity = JEDEN slot.
     *
     * Czego tu NIE MA: `poolId` (to keccak klucza, wiec przechowywanie byloby
     * drugim zrodlem prawdy) ani calego `PoolKey` (currency0 i hooks sa u nas
     * z definicji zerowe - trzymanie ich w pamieci pozwalaloby kiedys wpisac
     * tam cos innego).
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

    /** Komu naliczyc 40% oplat LP. Zapisane raz, przy zasileniu. */
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
    error NotLaunchpad();
    error NotPoolManager();
    error NotUnlocking();
    error AlreadySeeded();
    error NotSeeded();
    error BadPoolKey();
    error PriceMoved();
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

    constructor(address feeRecipient_, uint16 protocolShareBps_) {
        if (feeRecipient_ == address(0)) revert ZeroAddress();
        if (protocolShareBps_ > MAX_PROTOCOL_SHARE_BPS) revert ProtocolShareTooHigh();
        LAUNCHPAD = msg.sender;
        FEE_RECIPIENT = feeRecipient_;
        PROTOCOL_SHARE_BPS = protocolShareBps_;
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
            hooks: address(0)
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
     * z parametru. Powod: w chwili `seed` ten kontrakt NIE MOZE trzymac tego
     * tokena z zadnego innego tytulu - `harvest` wymaga `seeded[token]`, ktore
     * jeszcze nie jest ustawione, wiec saldo jest dokladnie tym, co przyszlo
     * z krzywej. Parametr dalby launchpadowi mozliwosc pomylenia sie o liczbe,
     * ktorej vault i tak nie moze zweryfikowac inaczej niz saldem.
     */
    function seed(address token, address creator, PoolKey calldata key, uint160 expectedSqrtPriceX96)
        external
        payable
        nonReentrant
        returns (uint128 liquidity, uint256 amount0, uint256 amount1, uint256 toDead)
    {
        if (msg.sender != LAUNCHPAD) revert NotLaunchpad();
        if (seeded[token]) revert AlreadySeeded();
        if (token == address(0) || creator == address(0)) revert ZeroAddress();

        // Ksztalt klucza jest tu sprawdzany, a nie zakladany. Vault ma byc
        // czytelny bez czytania launchpada: para jest natywnym ETH przeciw temu
        // tokenowi, bez hooka. Hook mialby dostep do kazdego naszego wywolania.
        if (key.currency0 != address(0) || key.currency1 != token || key.hooks != address(0)) {
            revert BadPoolKey();
        }
        if (key.tickSpacing <= 0) revert BadPoolKey();

        // Cena puli sprawdzana CO DO BITU tuz przed zasileniem.
        //
        // To NIE jest ostroznosc na wszelki wypadek. Pula bez plynnosci daje sie
        // przesunac: swap w takiej puli konsumuje zero wejscia i przesuwa cene
        // az do zadanego limitu. Gdyby ktos to zrobil miedzy startem a awansem,
        // nasze L (policzone dla ceny terminalnej) nie pasowaloby do ceny
        // faktycznej i pula wzielaby zupelnie inny stosunek aktywow.
        // Rownosc bitowa, bez tolerancji: pule zainicjalizowalismy sami, wiec
        // kazda inna wartosc znaczy "ktos tu byl".
        if (PoolStateReader.sqrtPriceX96(POOL_MANAGER, key) != expectedSqrtPriceX96) revert PriceMoved();

        // Pelny zakres, wyrownany do siatki tej puli. Symetrycznie, wiec
        // pozycja obejmuje cene biezaca z ogromnym zapasem w obie strony.
        int24 tickUpper = (TickMath.MAX_TICK / key.tickSpacing) * key.tickSpacing;
        int24 tickLower = -tickUpper;

        liquidity = LiquidityAmounts.getLiquidityForAmount0(
            expectedSqrtPriceX96, TickMath.getSqrtPriceAtTick(tickUpper), msg.value
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
     * Sciaga narosle oplaty LP i ksieguje je 60/40.
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
