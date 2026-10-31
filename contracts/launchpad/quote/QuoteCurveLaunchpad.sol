// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import {IB20Asset} from "../interfaces/IB20Asset.sol";
import {ITokenFactory} from "../interfaces/ITokenFactory.sol";
import {PoolKey, PoolStateReader} from "../interfaces/IPoolManagerV4.sol";
import {QuoteLiquidityVault, IQuoteLiquidityVault} from "./QuoteLiquidityVault.sol";
import {FullMath} from "../lib/FullMath.sol";

interface IQuoteToken {
    function balanceOf(address account) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function decimals() external view returns (uint8);
    function permit(address owner, address spender, uint256 value, uint256 deadline, uint8 v, bytes32 r, bytes32 s)
        external;
}

/**
 * CURVE LAUNCHPAD Q - krzywa wiazana z dowolnym tokenem ERC-20 (QUOTE) po
 * drugiej stronie pary. Specyfikacja: docs/LAUNCHPAD-QUOTE-ERC20.md.
 *
 * ===========================================================================
 * TO JEST `CurveLaunchpad` Z INNA WALUTA - I NIC WIECEJ
 * ===========================================================================
 * Krzywa (staly iloczyn z wirtualna rezerwa), prog na tokenie (T_MIN), zamkniecie
 * w `Locked` zamiast awansu w `buy`, bezuprawnieniowe `graduate()` z nagroda,
 * oplaty ksiegowane zamiast pushowanych, okno startowe, vanity, brak blokady
 * tworcy, brak wlasciciela - wszystko identyczne, a uzasadnienie kazdej z tych
 * decyzji stoi w `CurveLaunchpad.sol` i nie jest tu przepisywane. Arytmetyka
 * krzywej (`_quoteBuy`, sprzedaz, awans, podzial oplat) jest przeniesiona
 * linia w linie.
 *
 * Roznice:
 *
 * 1. `QUOTE` immutable zamiast natywnego ETH. Jedno wdrozenie na jedno aktywo,
 *    bez listy dozwolonych i bez settera.
 * 2. KAZDE PRZYJECIE QUOTE SPRAWDZA PRZYROST SALDA. Token z oplata od transferu
 *    dalby nam mniej, niz zaksiegowalibysmy w rezerwie, i niezmiennik
 *    wyplacalnosci pekalby cicho. Tu peka transakcja (`QuoteTransferMismatch`).
 *    Rebase sald (zmiana bez transferu) NIE jest do wykrycia kodem - to punkt
 *    listy kontrolnej przed wdrozeniem.
 * 3. `buyFor` (placi wolajacy, tokeny i limit okna dla odbiorcy) i
 *    `buyWithPermit` (ERC-2612 na QUOTE). Zwrot nadwyzki idzie zawsze do PLACACEGO.
 * 4. ORIENTACJA PULI per token - dwie ceny otwarcia liczone w konstruktorze.
 * 5. Awans przelewa QUOTE do vaulta i podaje kwote parametrem.
 *
 * Zdarzenia maja te same sygnatury co w wersji ETH (pola `eth*` = jednostki
 * QUOTE), wiec skan historii, tablica i wykres dzialaja bez zmian.
 *
 * NIEZMIENNIK: `QUOTE.balanceOf(this) >= totalLiabilities`, zawsze - o ile
 * QUOTE nie robi rebase w dol i emitent nie zabierze nam salda (blokada
 * z konfiskata w B20). Oba to ryzyka aktywa, nie tego kontraktu.
 */
contract QuoteCurveLaunchpad {
    /* ====================================================================== */
    /*  STALE - JAK W CurveLaunchpad                                           */
    /* ====================================================================== */

    uint256 public constant T0 = 1_000_000_000e18;
    uint256 public constant T_MIN = 200_000_000e18;
    uint16 public constant MAX_FEE_BPS = 100;
    uint16 public constant MAX_CREATOR_SHARE_BPS = 7000;
    uint8 public constant MAX_FEE_RECIPIENTS = 8;
    uint16 public constant MAX_BUYBACK_BPS = 10_000;
    uint16 public constant GRAD_FEE_BPS = 300;
    uint16 public constant MAX_GRAD_FEE_BPS = 500;
    uint256 public constant LAUNCH_WINDOW = 300;
    /** Sprzedaz w `Locked` dopiero po dobie - pelne uzasadnienie w `CurveLaunchpad.LOCKED_SELL_DELAY`. */
    uint256 public constant LOCKED_SELL_DELAY = 1 days;
    uint256 public constant WINDOW_ADDR_CAP = 16_000_000e18;
    uint24 public constant POOL_FEE = 3000;
    int24 public constant POOL_TICK_SPACING = 60;

    // Granice ceny v4 - otwarcie puli musi lezec w srodku.
    uint160 private constant MIN_SQRT_PRICE_X96 = 4_295_128_739;
    uint160 private constant MAX_SQRT_PRICE_X96 = 1_461_446_703_485_210_103_287_273_052_203_988_822_378_723_970_342;

    /** Aktywo po drugiej stronie kazdej krzywej tego wdrozenia. */
    address public immutable QUOTE;
    /** Liczba miejsc po przecinku QUOTE - zapamietana dla interfejsu, kontrakt jej nie uzywa. */
    uint8 public immutable QUOTE_DECIMALS;

    /** Skala krzywej w jednostkach QUOTE. Dla USDC 2500e6 daje zbiorke 10 000 USDC. */
    uint256 public immutable R_VIRT;
    uint256 public immutable MIN_LP_ETH;
    uint256 public immutable MAX_BUY;

    /** Cena otwarcia, gdy QUOTE jest currency0: v4 liczy token/QUOTE. */
    uint160 public immutable SQRT_PRICE_TERMINAL_Q0;
    /** Cena otwarcia, gdy QUOTE jest currency1: v4 liczy QUOTE/token. */
    uint160 public immutable SQRT_PRICE_TERMINAL_Q1;

    uint16 public immutable FEE_BPS;
    uint16 public immutable CREATOR_FEE_BPS;
    address public immutable FEE_RECIPIENT;
    address public immutable VAULT;
    ITokenFactory public immutable TOKEN_FACTORY;

    /* ====================================================================== */
    /*  STAN - JAK W CurveLaunchpad                                            */
    /* ====================================================================== */

    enum State {
        None,
        Curve,
        Locked,
        Graduated
    }

    /** `ethReserve` = rezerwa w jednostkach QUOTE (nazwa pola dla zgodnosci ABI). */
    struct Launch {
        address creator;
        State state;
        uint40 startedAt;
        uint40 lockedAt;
        uint128 ethReserve;
        uint128 tokenReserve;
        bytes32 launchId;
    }

    struct FeeReceiver {
        address account;
        uint16 shareBps;
    }

    mapping(address => Launch) private _launches;
    mapping(address => uint16) public launchFeeBps;
    mapping(address => uint16) public launchCreatorFeeBps;
    mapping(address => uint16) public launchBuybackBps;
    mapping(address => uint256) public launchWindowCap;
    mapping(address => FeeReceiver[]) private _feeReceivers;
    mapping(address => string) public metadataURI;
    mapping(address => uint256) public creatorNonce;
    mapping(address => mapping(address => uint256)) public windowBought;
    /** Saldo do odbioru w QUOTE. */
    mapping(address => uint256) public claimable;
    /** Rezerwy wszystkich krzywych + wszystkie `claimable`, w QUOTE. */
    uint256 public totalLiabilities;

    /* ====================================================================== */
    /*  ZDARZENIA - TE SAME SYGNATURY CO W CurveLaunchpad                      */
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
    event FeeAccrued(address indexed token, address indexed account, uint256 amount, uint8 kind);
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
    event LaunchMetadataSet(address indexed token, string metadataURI);
    event LaunchConfigured(address indexed token, uint16 buybackBps, uint256 windowCap);

    /* ====================================================================== */
    /*  BLEDY                                                                  */
    /* ====================================================================== */

    error ZeroAddress();
    error FeeTooHigh();
    error CreatorFeeTooHigh();
    error InvalidFeeConfig();
    error TooManyFeeRecipients();
    error InvalidFeeReceiver();
    error UnknownToken();
    error Expired();
    error SlippageRequired();
    error Slippage();
    error ZeroAmount();
    error DustTrade();
    error BuyTooLarge();
    error WindowCap();
    error CurveIsLocked();
    error AlreadyGraduated();
    error NotLocked();
    error WrongTokenAddress();
    error SupplyMismatch();
    error ReserveTooSmallToGraduate();
    error Arithmetic();
    error NothingToClaim();
    error TokenTransferFailed();
    error Reentrancy();
    error QuoteHasNoCode();
    error BadQuoteDecimals();
    error BadScale();
    error QuoteTransferMismatch();

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

    constructor(
        address poolManager_,
        address quote_,
        uint16 feeBps_,
        uint16 creatorFeeBps_,
        address feeRecipient_,
        uint16 protocolShareBps_,
        ITokenFactory tokenFactory_,
        bytes32 hookSalt_,
        uint256 rVirt_
    ) {
        if (feeRecipient_ == address(0) || quote_ == address(0)) revert ZeroAddress();
        if (address(tokenFactory_) == address(0)) revert ZeroAddress();
        if (feeBps_ > MAX_FEE_BPS) revert FeeTooHigh();
        if (creatorFeeBps_ > feeBps_) revert CreatorFeeTooHigh();
        if (uint256(creatorFeeBps_) * 10_000 > uint256(feeBps_) * MAX_CREATOR_SHARE_BPS) revert CreatorFeeTooHigh();
        if (GRAD_FEE_BPS > MAX_GRAD_FEE_BPS) revert FeeTooHigh();

        // Aktywo bez kodu albo z dziwna liczba miejsc wywala WDROZENIE, nie
        // pierwsze kupno. Zakres 6..18 obejmuje USDC, akcje B20 i perpy.
        uint256 quoteCode;
        assembly {
            quoteCode := extcodesize(quote_)
        }
        if (quoteCode == 0) revert QuoteHasNoCode();
        uint8 dec = IQuoteToken(quote_).decimals();
        if (dec < 6 || dec > 18) revert BadQuoteDecimals();

        // Podloga z wersji ETH (MIN_LP nie zaokragla sie do zera) i sufit, ktory
        // trzyma `ethReserve` w uint128 z zapasem: zbiorka to 4 * R_VIRT.
        if (rVirt_ < 75 || rVirt_ > type(uint120).max) revert BadScale();

        R_VIRT = rVirt_;
        MIN_LP_ETH = rVirt_ / 75;
        MAX_BUY = rVirt_ * 132;

        // Cena terminalna krzywej to (R_VIRT + G) / T_MIN = 5 * R_VIRT / T_MIN
        // (QUOTE za token). v4 liczy amount1/amount0, wiec w orientacji Q0 jest
        // to odwrotnosc, a w Q1 - wprost. mulDiv, bo 5R * 2^192 przekracza 2^256.
        uint160 q0 = uint160(_sqrt(FullMath.mulDivDown(T_MIN, 1 << 192, rVirt_ * 5)));
        uint160 q1 = uint160(_sqrt(FullMath.mulDivDown(rVirt_ * 5, 1 << 192, T_MIN)));
        if (q0 <= MIN_SQRT_PRICE_X96 || q0 >= MAX_SQRT_PRICE_X96) revert BadScale();
        if (q1 <= MIN_SQRT_PRICE_X96 || q1 >= MAX_SQRT_PRICE_X96) revert BadScale();
        SQRT_PRICE_TERMINAL_Q0 = q0;
        SQRT_PRICE_TERMINAL_Q1 = q1;

        QUOTE = quote_;
        QUOTE_DECIMALS = dec;
        FEE_BPS = feeBps_;
        CREATOR_FEE_BPS = creatorFeeBps_;
        FEE_RECIPIENT = feeRecipient_;
        TOKEN_FACTORY = tokenFactory_;

        VAULT = address(new QuoteLiquidityVault(poolManager_, feeRecipient_, protocolShareBps_, hookSalt_, quote_));
    }

    function POOL_MANAGER() external view returns (address) {
        return IQuoteLiquidityVault(VAULT).POOL_MANAGER();
    }

    function HOOK() external view returns (address) {
        return IQuoteLiquidityVault(VAULT).HOOK();
    }

    /* ====================================================================== */
    /*  ODCZYTY                                                                */
    /* ====================================================================== */

    function launchOf(address token)
        external
        view
        returns (address creator, State state, uint256 ethReserve, uint256 tokenReserve, uint40 startedAt, bytes32 launchId)
    {
        Launch memory l = _launches[token];
        return (l.creator, l.state, l.ethReserve, l.tokenReserve, l.startedAt, l.launchId);
    }

    /** Od kiedy w `Locked` mozna sprzedawac; 0 = krzywa nie jest zamknieta. */
    function lockedSellOpensAt(address token) external view returns (uint256) {
        Launch memory l = _launches[token];
        if (l.state != State.Locked) return 0;
        return uint256(l.lockedAt) + LOCKED_SELL_DELAY;
    }

    /** Klucz JEDYNEJ puli tego tokena. Kolejnosc walut z adresow - v4 wymaga currency0 < currency1. */
    function poolKeyOf(address token) public view returns (PoolKey memory) {
        (address c0, address c1) = QUOTE < token ? (QUOTE, token) : (token, QUOTE);
        return PoolKey({
            currency0: c0,
            currency1: c1,
            fee: POOL_FEE,
            tickSpacing: POOL_TICK_SPACING,
            hooks: IQuoteLiquidityVault(VAULT).HOOK()
        });
    }

    /** Cena otwarcia puli tego tokena - zalezy od orientacji. */
    function sqrtPriceTerminalOf(address token) public view returns (uint160) {
        return QUOTE < token ? SQRT_PRICE_TERMINAL_Q0 : SQRT_PRICE_TERMINAL_Q1;
    }

    function tokenAddressForSalt(bytes32 salt) public view returns (address) {
        return TOKEN_FACTORY.predictToken(salt);
    }

    /** Cena spot w jednostkach QUOTE za JEDEN caly token (nazwa dla zgodnosci ABI). */
    function spotPriceWeiPerToken(address token) external view returns (uint256) {
        Launch memory l = _launches[token];
        if (l.state == State.None) revert UnknownToken();
        if (l.state == State.Graduated) revert AlreadyGraduated();
        return FullMath.mulDivDown(R_VIRT + l.ethReserve, 1e18, l.tokenReserve);
    }

    function quoteBuy(address token, uint256 quoteIn) public view returns (uint256 tokensOut, uint256 fee, uint256 refund) {
        Launch memory l = _launches[token];
        if (l.state == State.None) revert UnknownToken();
        if (l.state == State.Locked) revert CurveIsLocked();
        if (l.state == State.Graduated) revert AlreadyGraduated();
        return _quoteBuy(l.ethReserve, l.tokenReserve, quoteIn, launchFeeBps[token]);
    }

    function gradFeeOf(address token) external view returns (uint256 fee, uint256 callerReward) {
        Launch memory l = _launches[token];
        if (l.state == State.None) revert UnknownToken();
        fee = FullMath.mulDivDown(l.ethReserve, GRAD_FEE_BPS, 10_000);
        callerReward = fee / 2;
    }

    function quoteSell(address token, uint256 tokensIn) public view returns (uint256 ethOut, uint256 fee) {
        Launch memory l = _launches[token];
        if (l.state == State.None) revert UnknownToken();
        if (l.state == State.Graduated) revert AlreadyGraduated();
        uint256 gross = FullMath.mulDivDown(R_VIRT + l.ethReserve, tokensIn, uint256(l.tokenReserve) + tokensIn);
        fee = FullMath.mulDivUp(gross, launchFeeBps[token], 10_000);
        ethOut = gross - fee;
    }

    function feeConfigOf(address token) external view returns (uint16 feeBps, uint16 creatorFeeBps, uint256 receiverCount) {
        if (_launches[token].state == State.None) revert UnknownToken();
        return (launchFeeBps[token], launchCreatorFeeBps[token], _feeReceivers[token].length);
    }

    function feeReceiverOf(address token, uint256 index) external view returns (address account, uint16 shareBps) {
        if (index >= _feeReceivers[token].length) revert InvalidFeeReceiver();
        FeeReceiver memory receiver = _feeReceivers[token][index];
        return (receiver.account, receiver.shareBps);
    }

    /* ====================================================================== */
    /*  START                                                                  */
    /* ====================================================================== */

    /** Jak `CurveLaunchpad.launch`, dev-buy za `quoteIn` QUOTE zamiast `msg.value`. */
    function launch(string calldata name_, string calldata symbol_, uint256 quoteIn, uint256 minTokensOut, uint256 deadline)
        external
        nonReentrant
        returns (address token, bytes32 launchId)
    {
        address[] memory receivers = new address[](1);
        uint16[] memory shares = new uint16[](1);
        receivers[0] = msg.sender;
        shares[0] = 10_000;
        return _launch(
            _defaultLaunchId(), name_, symbol_, quoteIn, minTokensOut, deadline, FEE_BPS, CREATOR_FEE_BPS, 0, WINDOW_ADDR_CAP, receivers, shares, ""
        );
    }

    function launchAdvanced(
        string calldata name_,
        string calldata symbol_,
        uint256 quoteIn,
        uint256 minTokensOut,
        uint256 deadline,
        uint16 feeBps_,
        uint16 creatorFeeBps_,
        uint16 buybackBps_,
        uint256 windowCap_,
        address[] calldata receiverAccounts_,
        uint16[] calldata receiverSharesBps_,
        string calldata metadataURI_
    ) external nonReentrant returns (address token, bytes32 launchId) {
        return _launch(
            _defaultLaunchId(),
            name_,
            symbol_,
            quoteIn,
            minTokensOut,
            deadline,
            feeBps_,
            creatorFeeBps_,
            buybackBps_,
            windowCap_,
            receiverAccounts_,
            receiverSharesBps_,
            metadataURI_
        );
    }

    /** Vanity - uzasadnienie i kompromis z przewidywalnym adresem w `CurveLaunchpad.launchVanity`. */
    function launchVanity(
        bytes32 vanitySalt,
        string calldata name_,
        string calldata symbol_,
        uint256 quoteIn,
        uint256 minTokensOut,
        uint256 deadline,
        uint16 feeBps_,
        uint16 creatorFeeBps_,
        uint16 buybackBps_,
        uint256 windowCap_,
        address[] calldata receiverAccounts_,
        uint16[] calldata receiverSharesBps_,
        string calldata metadataURI_
    ) external nonReentrant returns (address token, bytes32 launchId) {
        return _launch(
            _vanityLaunchId(msg.sender, vanitySalt),
            name_,
            symbol_,
            quoteIn,
            minTokensOut,
            deadline,
            feeBps_,
            creatorFeeBps_,
            buybackBps_,
            windowCap_,
            receiverAccounts_,
            receiverSharesBps_,
            metadataURI_
        );
    }

    function predictVanityToken(address creator, bytes32 vanitySalt) external view returns (address) {
        return TOKEN_FACTORY.predictToken(_vanityLaunchId(creator, vanitySalt));
    }

    function _defaultLaunchId() private returns (bytes32) {
        return keccak256(
            abi.encode(address(this), msg.sender, creatorNonce[msg.sender]++, block.chainid, blockhash(block.number - 1))
        );
    }

    function _vanityLaunchId(address creator, bytes32 vanitySalt) private view returns (bytes32) {
        return keccak256(abi.encode(address(this), creator, vanitySalt, block.chainid));
    }

    function _launch(
        bytes32 launchId_,
        string memory name_,
        string memory symbol_,
        uint256 quoteIn,
        uint256 minTokensOut,
        uint256 deadline,
        uint16 feeBps_,
        uint16 creatorFeeBps_,
        uint16 buybackBps_,
        uint256 windowCap_,
        address[] memory receiverAccounts_,
        uint16[] memory receiverSharesBps_,
        string memory metadataURI_
    ) internal returns (address token, bytes32 launchId) {
        if (block.timestamp > deadline) revert Expired();
        if (feeBps_ > MAX_FEE_BPS || creatorFeeBps_ > feeBps_) revert InvalidFeeConfig();
        if (uint256(creatorFeeBps_) * 10_000 > uint256(feeBps_) * MAX_CREATOR_SHARE_BPS) revert InvalidFeeConfig();
        if (buybackBps_ > MAX_BUYBACK_BPS || windowCap_ > T0) revert InvalidFeeConfig();
        if (windowCap_ == 0) revert InvalidFeeConfig();
        if (receiverAccounts_.length == 0 || receiverAccounts_.length != receiverSharesBps_.length) revert InvalidFeeConfig();
        if (receiverAccounts_.length > MAX_FEE_RECIPIENTS) revert TooManyFeeRecipients();

        uint256 shareTotal;
        for (uint256 index = 0; index < receiverAccounts_.length; index++) {
            if (receiverAccounts_[index] == address(0) || receiverSharesBps_[index] == 0) revert InvalidFeeReceiver();
            shareTotal += receiverSharesBps_[index];
        }
        if (shareTotal != 10_000) revert InvalidFeeConfig();

        launchId = launchId_;
        token = TOKEN_FACTORY.createToken(name_, symbol_, T0, launchId, address(this), msg.sender);
        if (token != TOKEN_FACTORY.predictToken(launchId)) revert WrongTokenAddress();
        if (IB20Asset(token).balanceOf(address(this)) != T0) revert SupplyMismatch();
        // Token o adresie QUOTE nie ma prawa powstac (adres jest zajety), ale para
        // QUOTE/QUOTE zepsulaby orientacje puli - jedna linia zamyka to na pewno.
        if (token == QUOTE) revert WrongTokenAddress();

        uint40 startedAt = uint40(block.timestamp);
        _launches[token] = Launch({
            creator: msg.sender,
            state: State.Curve,
            startedAt: startedAt,
            lockedAt: 0,
            ethReserve: 0,
            tokenReserve: uint128(T0),
            launchId: launchId
        });
        launchFeeBps[token] = feeBps_;
        launchCreatorFeeBps[token] = creatorFeeBps_;
        launchBuybackBps[token] = buybackBps_;
        launchWindowCap[token] = windowCap_;
        for (uint256 index = 0; index < receiverAccounts_.length; index++) {
            _feeReceivers[token].push(FeeReceiver({account: receiverAccounts_[index], shareBps: receiverSharesBps_[index]}));
        }
        metadataURI[token] = metadataURI_;

        emit Launched(token, msg.sender, launchId, name_, symbol_, T0, T0 - T_MIN, T_MIN, R_VIRT, feeBps_, creatorFeeBps_, startedAt);
        if (bytes(metadataURI_).length != 0) emit LaunchMetadataSet(token, metadataURI_);
        emit LaunchConfigured(token, buybackBps_, windowCap_);

        if (quoteIn != 0) {
            _pullQuote(msg.sender, quoteIn);
            _buy(token, quoteIn, minTokensOut, msg.sender, msg.sender);
        }
    }

    /* ====================================================================== */
    /*  KUPNO                                                                  */
    /* ====================================================================== */

    function buy(address token, uint256 quoteIn, uint256 minTokensOut, uint256 deadline)
        external
        nonReentrant
        returns (uint256 tokensOut)
    {
        if (block.timestamp > deadline) revert Expired();
        _pullQuote(msg.sender, quoteIn);
        return _buy(token, quoteIn, minTokensOut, msg.sender, msg.sender);
    }

    /**
     * Placi `msg.sender`, a tokeny, limit okna startowego i `Bought.buyer` naleza
     * do `recipient`. Pod zap ETH -> QUOTE -> mem: bez tego kupujacym bylby zap,
     * a limit okna bylby wspolny dla wszystkich jego uzytkownikow.
     *
     * Nie otwiera nic nowego: kupno "dla kogos" i tak dalo sie zrobic, kupujac
     * i przelewajac tokeny. Limit okna nie jest anty-botem (sybil jest darmowy),
     * patrz naglowek `CurveLaunchpad`.
     */
    function buyFor(address token, uint256 quoteIn, uint256 minTokensOut, uint256 deadline, address recipient)
        external
        nonReentrant
        returns (uint256 tokensOut)
    {
        if (block.timestamp > deadline) revert Expired();
        if (recipient == address(0)) revert ZeroAddress();
        _pullQuote(msg.sender, quoteIn);
        return _buy(token, quoteIn, minTokensOut, recipient, msg.sender);
    }

    /**
     * ERC-2612 na QUOTE - jedna transakcja zamiast approve + buy. Blad `permit`
     * jest lykany z tego samego powodu co w `sellWithPermit`: podpis mogl zostac
     * zuzyty w wyscigu, a allowance juz jest. Jesli go nie ma, `_pullQuote` odpadnie.
     */
    function buyWithPermit(
        address token,
        uint256 quoteIn,
        uint256 minTokensOut,
        uint256 deadline,
        uint256 permitDeadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external nonReentrant returns (uint256 tokensOut) {
        if (block.timestamp > deadline) revert Expired();
        try IQuoteToken(QUOTE).permit(msg.sender, address(this), quoteIn, permitDeadline, v, r, s) {} catch {}
        _pullQuote(msg.sender, quoteIn);
        return _buy(token, quoteIn, minTokensOut, msg.sender, msg.sender);
    }

    /**
     * Arytmetyka i strazniki 1:1 z `CurveLaunchpad._buy`. QUOTE jest juz u nas
     * (`_pullQuote` przed wywolaniem), wiec zwrot nadwyzki to przelew do placacego.
     */
    function _buy(address token, uint256 valueIn, uint256 minTokensOut, address recipient, address payer)
        private
        returns (uint256 out)
    {
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
        (out, fee, refund) = _quoteBuy(ethReserve, tokenReserve, valueIn, launchFeeBps[token]);

        if (out == 0) revert DustTrade();
        if (out < minTokensOut) revert Slippage();

        uint256 eIn = valueIn - fee - refund;

        if (block.timestamp < uint256(l.startedAt) + LAUNCH_WINDOW) {
            uint256 acc = windowBought[token][recipient] + out;
            if (acc > launchWindowCap[token]) revert WindowCap();
            windowBought[token][recipient] = acc;
        }

        uint256 tokenAfter = tokenReserve - out;
        uint256 ethAfter = ethReserve + eIn;
        l.ethReserve = uint128(ethAfter);
        l.tokenReserve = uint128(tokenAfter);
        totalLiabilities += eIn + fee;
        _accrueFee(token, l.creator, fee, 0);

        emit Bought(token, recipient, valueIn, eIn, fee, out, refund, ethAfter, tokenAfter);

        if (tokenAfter == T_MIN) {
            l.state = State.Locked;
            l.lockedAt = uint40(block.timestamp);
            emit CurveLocked(token, ethAfter, tokenAfter);
        }

        _safeTransfer(token, recipient, out);
        if (refund != 0) _sendQuote(payer, refund);
    }

    function _quoteBuy(uint256 ethReserve, uint256 tokenReserve, uint256 valueIn, uint16 feeBps_)
        private
        view
        returns (uint256 out, uint256 fee, uint256 refund)
    {
        fee = FullMath.mulDivUp(valueIn, feeBps_, 10_000);
        if (fee > valueIn) return (0, 0, 0);
        uint256 eIn = valueIn - fee;
        uint256 R = R_VIRT + ethReserve;

        out = FullMath.mulDivDown(tokenReserve, eIn, R + eIn);

        if (tokenReserve - out < T_MIN) {
            out = tokenReserve - T_MIN;
            uint256 need = FullMath.mulDivUp(R, out, T_MIN);
            fee = FullMath.mulDivUp(need, feeBps_, 10_000);
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

    /** 1:1 z `CurveLaunchpad._sell` - bez blokady tworcy; w `Locked` dopiero po `LOCKED_SELL_DELAY`. */
    function _sell(address token, uint256 tokensIn, uint256 minEthOut) private returns (uint256 net) {
        Launch storage l = _launches[token];
        State state = l.state;

        if (state == State.None) revert UnknownToken();
        if (state == State.Graduated) revert AlreadyGraduated();
        if (state == State.Locked && block.timestamp < uint256(l.lockedAt) + LOCKED_SELL_DELAY) revert CurveIsLocked();
        if (tokensIn == 0) revert ZeroAmount();
        if (minEthOut == 0) revert SlippageRequired();

        uint256 ethReserve = l.ethReserve;
        uint256 tokenReserve = l.tokenReserve;

        uint256 gross = FullMath.mulDivDown(R_VIRT + ethReserve, tokensIn, tokenReserve + tokensIn);
        if (gross == 0) revert DustTrade();
        if (gross > ethReserve) revert Arithmetic();

        uint256 fee = FullMath.mulDivUp(gross, launchFeeBps[token], 10_000);
        net = gross - fee;
        if (net < minEthOut) revert Slippage();

        uint256 tokenAfter = tokenReserve + tokensIn;
        uint256 ethAfter = ethReserve - gross;
        l.tokenReserve = uint128(tokenAfter);
        l.ethReserve = uint128(ethAfter);
        totalLiabilities -= net;
        _accrueFee(token, l.creator, fee, 0);

        emit Sold(token, msg.sender, tokensIn, gross, fee, net, ethAfter, tokenAfter);

        _safeTransferFrom(token, msg.sender, address(this), tokensIn);
        _sendQuote(msg.sender, net);
    }

    /* ====================================================================== */
    /*  AWANS                                                                  */
    /* ====================================================================== */

    /** Jak `CurveLaunchpad.graduate` - QUOTE i reszta tokena ida do vaulta przed `seed`. */
    function graduate(address token) external nonReentrant {
        Launch storage l = _launches[token];
        State state = l.state;

        if (state == State.None) revert UnknownToken();
        if (state == State.Graduated) revert AlreadyGraduated();
        if (state != State.Locked) revert NotLocked();

        uint256 ethReserve = l.ethReserve;
        uint256 tokenReserve = l.tokenReserve;

        uint256 gradFee = FullMath.mulDivDown(ethReserve, GRAD_FEE_BPS, 10_000);
        PoolKey memory key = poolKeyOf(token);
        uint160 sqrtPrice = sqrtPriceTerminalOf(token);

        uint256 eLp = ethReserve - gradFee;
        if (eLp < MIN_LP_ETH) revert ReserveTooSmallToGraduate();

        l.state = State.Graduated;
        l.ethReserve = 0;
        l.tokenReserve = 0;
        totalLiabilities -= eLp;
        _accrueFee(token, msg.sender, gradFee, 2);

        _safeTransfer(token, VAULT, tokenReserve);
        _sendQuote(VAULT, eLp);
        (, uint256 quoteUsed, uint256 tokenUsed, uint256 toDead) = IQuoteLiquidityVault(VAULT).seedWithConfig(
            token, l.creator, key, sqrtPrice, launchBuybackBps[token], eLp
        );

        emit Graduated(token, PoolStateReader.poolId(key), msg.sender, quoteUsed, tokenUsed, toDead, gradFee, sqrtPrice);
    }

    /* ====================================================================== */
    /*  OPLATY                                                                 */
    /* ====================================================================== */

    /** 1:1 z `CurveLaunchpad._accrueFee`. */
    function _accrueFee(address token, address counterparty, uint256 amount, uint8 kind) private {
        if (amount == 0) return;

        uint256 counterpartyCut;
        if (kind == 0) {
            uint16 feeBps_ = launchFeeBps[token];
            uint16 creatorFeeBps_ = launchCreatorFeeBps[token];
            counterpartyCut = feeBps_ == 0 ? 0 : FullMath.mulDivDown(amount, creatorFeeBps_, feeBps_);
        } else {
            counterpartyCut = amount / 2;
        }
        uint256 protocolCut = amount - counterpartyCut;

        if (protocolCut != 0) {
            claimable[FEE_RECIPIENT] += protocolCut;
            emit FeeAccrued(token, FEE_RECIPIENT, protocolCut, kind);
        }
        if (counterpartyCut != 0) {
            if (kind != 0) {
                claimable[counterparty] += counterpartyCut;
                emit FeeAccrued(token, counterparty, counterpartyCut, kind + 1);
            } else {
                FeeReceiver[] storage receivers = _feeReceivers[token];
                uint256 distributed;
                for (uint256 index = 0; index < receivers.length; index++) {
                    uint256 receiverCut = index + 1 == receivers.length
                        ? counterpartyCut - distributed
                        : FullMath.mulDivDown(counterpartyCut, receivers[index].shareBps, 10_000);
                    if (receiverCut == 0) continue;
                    distributed += receiverCut;
                    claimable[receivers[index].account] += receiverCut;
                    emit FeeAccrued(token, receivers[index].account, receiverCut, kind + 1);
                }
            }
        }
    }

    function claim() external {
        _payout(msg.sender);
    }

    function claimFor(address account) external {
        _payout(account);
    }

    function _payout(address account) private nonReentrant {
        uint256 amount = claimable[account];
        if (amount == 0) revert NothingToClaim();
        claimable[account] = 0;
        totalLiabilities -= amount;
        emit Claimed(account, amount, msg.sender);
        _sendQuote(account, amount);
    }

    /* ====================================================================== */
    /*  NISKI POZIOM                                                           */
    /* ====================================================================== */

    /**
     * Przyjecie QUOTE z kontrola przyrostu salda. Token z oplata od transferu
     * (albo taki, ktory oddaje `true` bez przelewu) odpada tutaj, zanim cokolwiek
     * zostanie zaksiegowane.
     */
    function _pullQuote(address from, uint256 amount) private {
        if (amount == 0) revert ZeroAmount();
        uint256 before = IQuoteToken(QUOTE).balanceOf(address(this));
        _safeTransferFrom(QUOTE, from, address(this), amount);
        if (IQuoteToken(QUOTE).balanceOf(address(this)) != before + amount) revert QuoteTransferMismatch();
    }

    function _sendQuote(address to, uint256 amount) private {
        _safeTransfer(QUOTE, to, amount);
    }

    function _sqrt(uint256 x) private pure returns (uint256) {
        if (x == 0) return 0;
        uint256 xx = x;
        uint256 r = 1;
        if (xx >= 0x100000000000000000000000000000000) { xx >>= 128; r <<= 64; }
        if (xx >= 0x10000000000000000) { xx >>= 64; r <<= 32; }
        if (xx >= 0x100000000) { xx >>= 32; r <<= 16; }
        if (xx >= 0x10000) { xx >>= 16; r <<= 8; }
        if (xx >= 0x100) { xx >>= 8; r <<= 4; }
        if (xx >= 0x10) { xx >>= 4; r <<= 2; }
        if (xx >= 0x4) { r <<= 1; }
        r = (r + x / r) >> 1;
        r = (r + x / r) >> 1;
        r = (r + x / r) >> 1;
        r = (r + x / r) >> 1;
        r = (r + x / r) >> 1;
        r = (r + x / r) >> 1;
        r = (r + x / r) >> 1;
        uint256 down = x / r;
        return r < down ? r : down;
    }

    function _safeTransfer(address token, address to, uint256 amount) private {
        (bool ok, bytes memory ret) = token.call(abi.encodeCall(IB20Asset.transfer, (to, amount)));
        if (!ok || (ret.length != 0 && !abi.decode(ret, (bool)))) revert TokenTransferFailed();
    }

    function _safeTransferFrom(address token, address from, address to, uint256 amount) private {
        (bool ok, bytes memory ret) = token.call(abi.encodeCall(IB20Asset.transferFrom, (from, to, amount)));
        if (!ok || (ret.length != 0 && !abi.decode(ret, (bool)))) revert TokenTransferFailed();
    }
}
