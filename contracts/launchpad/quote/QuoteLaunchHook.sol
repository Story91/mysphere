// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import {IPoolManagerV4, PoolKey, SwapParams, BalanceDeltaLib, PoolStateReader} from "../interfaces/IPoolManagerV4.sol";
import {FullMath} from "../lib/FullMath.sol";
import {HOOK_ALL_MASK, HOOK_REQUIRED_FLAGS} from "../B20LaunchHook.sol";

interface IQuoteVaultView {
    function creatorOf(address token) external view returns (address);
    function poolKeyOf(address token) external view returns (PoolKey memory);
}

/**
 * HOOK LAUNCHPADA Q - to samo co `B20LaunchHook`, ale para to QUOTE (ERC-20)
 * przeciw tokenowi, w DOWOLNEJ kolejnosci.
 *
 * Pelne uzasadnienie obu zadan (brama w `beforeInitialize`, udzial 1% w
 * `afterSwap`), znaku delty, buybacku finansowanego z dzialki tworcy i granicy
 * ceny buybacku stoi w `B20LaunchHook.sol`. Tu sa opisane WYLACZNIE roznice:
 *
 * 1. ORIENTACJA. ETH mialo adres 0x0, wiec zawsze bylo `currency0`. QUOTE nie:
 *    v4 sortuje waluty po adresie, a akcje Coinbase sa B20 (`0xB200...`) tak
 *    jak nasze memy, wiec QUOTE wypada raz jako currency0, raz jako currency1.
 *    Token to zawsze ta waluta, ktora NIE jest QUOTE - liczone z klucza przy
 *    kazdym wywolaniu, nigdy nie zapamietywane.
 * 2. ROZLICZENIE QUOTE to `sync` -> `transfer` -> `settle()`, jak kazdego ERC-20.
 *    Nie ma `receive()` - ten hook nigdy nie dostaje natywnego ETH.
 * 3. BUYBACK idzie QUOTE -> token. Gdy QUOTE jest currency1, to jest `oneForZero`
 *    i cena v4 (amount1/amount0) ROSNIE, wiec granica ceny lezy POWYZEJ spotu.
 *
 * Flagi adresu te same co w wersji ETH (0x2044) - importowane, nie przepisane.
 * `QUOTE` jest argumentem konstruktora, wiec wchodzi do kodu tworzacego: kazde
 * aktywo wymaga osobnego kopania salta.
 */
contract QuoteLaunchHook {
    /* ====================================================================== */
    /*  STALE                                                                  */
    /* ====================================================================== */

    uint16 public constant HOOK_FEE_BPS = 100;
    uint16 public constant MAX_HOOK_FEE_BPS = 200;

    // Granice v4: TickMath.MIN_SQRT_PRICE i MAX_SQRT_PRICE. Limit wymiany musi
    // lezec OSTRO wewnatrz tego przedzialu.
    uint160 private constant MIN_SQRT_PRICE_X96 = 4_295_128_739;
    uint160 private constant MAX_SQRT_PRICE_X96 = 1_461_446_703_485_210_103_287_273_052_203_988_822_378_723_970_342;

    /** Patrz `B20LaunchHook.MAX_BUYBACK_SLIPPAGE_BPS` - limit na PIERWIASTKU ceny. */
    uint16 private constant MAX_BUYBACK_SLIPPAGE_BPS = 150;
    address private constant DEAD = address(0x000000000000000000000000000000000000dEaD);

    address public immutable POOL_MANAGER;
    /** Aktywo po drugiej stronie kazdej puli tego hooka. */
    address public immutable QUOTE;
    uint16 public immutable PROTOCOL_SHARE_BPS;
    address public immutable FEE_RECIPIENT;
    address public immutable VAULT;

    /* ====================================================================== */
    /*  STAN                                                                   */
    /* ====================================================================== */

    mapping(address => uint256) public pendingQuote;
    mapping(address => uint256) public pendingToken;
    mapping(address => uint16) public buybackBps;
    mapping(address => uint256) public pendingBuybackQuote;
    mapping(address => uint256) public buybackTokens;

    mapping(address => uint256) public claimableQuote;
    mapping(address => mapping(address => uint256)) public claimableToken;

    /* ====================================================================== */
    /*  ZDARZENIA - TE SAME SYGNATURY CO W WERSJI ETH                          */
    /* ====================================================================== */

    // `isEth` znaczy tu "oplata w QUOTE", a pola `eth*` - kwoty w QUOTE. Ta sama
    // sygnatura co w `B20LaunchHook`, wiec skan tablicy dziala bez zmian.
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
    uint256 private _buybackQuote;
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

    /** Vault wdraza ten kontrakt w swoim konstruktorze - `VAULT = msg.sender`, jak w wersji ETH. */
    constructor(address poolManager_, address feeRecipient_, uint16 protocolShareBps_, address quote_) {
        if (poolManager_ == address(0) || feeRecipient_ == address(0) || quote_ == address(0)) revert ZeroAddress();
        if (HOOK_FEE_BPS > MAX_HOOK_FEE_BPS) revert FeeTooHigh();

        POOL_MANAGER = poolManager_;
        QUOTE = quote_;
        VAULT = msg.sender;
        FEE_RECIPIENT = feeRecipient_;
        PROTOCOL_SHARE_BPS = protocolShareBps_;
    }

    function ALL_HOOK_MASK() external pure returns (uint160) {
        return HOOK_ALL_MASK;
    }

    function HOOK_FLAGS() external pure returns (uint160) {
        return HOOK_REQUIRED_FLAGS;
    }

    function hasValidHookAddress() external view returns (bool) {
        return uint160(address(this)) & HOOK_ALL_MASK == HOOK_REQUIRED_FLAGS;
    }

    function configureToken(address token, uint16 buybackBps_) external onlyVault {
        if (token == address(0) || token == QUOTE || buybackBps_ > 10_000) revert BadPoolShape();
        buybackBps[token] = buybackBps_;
        emit BuybackConfigured(token, buybackBps_);
    }

    /* ====================================================================== */
    /*  BRAMA                                                                  */
    /* ====================================================================== */

    /**
     * Pule otwiera wylacznie vault, i wylacznie w ksztalcie QUOTE/token.
     * Dokladnie jedna strona to QUOTE - inaczej akumulatory nizej nie mialyby
     * sensu (para QUOTE/QUOTE nie istnieje, para bez QUOTE to cudzy rynek).
     */
    function beforeInitialize(address sender, PoolKey calldata key, uint160) external onlyPoolManager returns (bytes4) {
        if (sender != VAULT) revert NotVault();
        if (key.hooks != address(this)) revert BadPoolShape();

        bool quoteIs0 = key.currency0 == QUOTE;
        bool quoteIs1 = key.currency1 == QUOTE;
        if (quoteIs0 == quoteIs1) revert BadPoolShape();
        address token = quoteIs0 ? key.currency1 : key.currency0;
        if (token == address(0)) revert BadPoolShape();

        emit PoolOpened(token, keccak256(abi.encode(key)), key.fee, key.tickSpacing);
        return this.beforeInitialize.selector;
    }

    /* ====================================================================== */
    /*  UDZIAL W WYMIANIE                                                      */
    /* ====================================================================== */

    /**
     * `HOOK_FEE_BPS` z WALUTY NIEPODANEJ - uzasadnienie i znak delty w
     * `B20LaunchHook.afterSwap`. Roznica: ktora waluta jest QUOTE, wynika z klucza.
     */
    function afterSwap(address, PoolKey calldata key, SwapParams calldata params, int256 delta, bytes calldata)
        external
        onlyPoolManager
        returns (bytes4, int128)
    {
        // Buyback protokolu idzie przez te sama pule - bez oplaty od samego siebie.
        if (_buybackAction != 0) return (this.afterSwap.selector, int128(0));

        bool unspecifiedIsCurrency1 = params.amountSpecified < 0 ? params.zeroForOne : !params.zeroForOne;
        int128 moved = unspecifiedIsCurrency1 ? BalanceDeltaLib.amount1(delta) : BalanceDeltaLib.amount0(delta);

        int256 movedWide = int256(moved);
        uint256 magnitude = movedWide >= 0 ? uint256(movedWide) : uint256(-movedWide);
        if (magnitude == 0) return (this.afterSwap.selector, int128(0));

        uint256 fee = FullMath.mulDivUp(magnitude, HOOK_FEE_BPS, 10_000);
        if (fee == 0) return (this.afterSwap.selector, int128(0));
        if (fee > uint256(uint128(type(int128).max))) revert FeeOverflow();

        address currency = unspecifiedIsCurrency1 ? key.currency1 : key.currency0;
        address token = key.currency0 == QUOTE ? key.currency1 : key.currency0;
        IPoolManagerV4(POOL_MANAGER).take(currency, address(this), fee);

        bool inQuote = currency == QUOTE;
        if (inQuote) {
            pendingQuote[token] += fee;
        } else {
            pendingToken[token] += fee;
        }
        emit HookFeeTaken(token, inQuote, fee);

        return (this.afterSwap.selector, int128(int256(fee)));
    }

    /* ====================================================================== */
    /*  BUYBACK                                                                */
    /* ====================================================================== */

    function executeBuyback(address token, uint256 minTokensOut, uint256 deadline)
        external
        nonReentrant
        returns (uint256 tokensOut)
    {
        if (block.timestamp > deadline) revert Expired();
        uint256 quoteIn = pendingBuybackQuote[token];
        if (quoteIn == 0) revert NothingToBuyback();

        pendingBuybackQuote[token] = 0;
        _buybackAction = 1;
        _buybackToken = token;
        _buybackQuote = quoteIn;
        _buybackMinOut = minTokensOut;
        bytes memory ret = IPoolManagerV4(POOL_MANAGER).unlock(abi.encode(token, quoteIn, minTokensOut));
        _buybackAction = 0;
        _buybackToken = address(0);
        _buybackQuote = 0;
        _buybackMinOut = 0;

        uint256 spent;
        (tokensOut, spent) = abi.decode(ret, (uint256, uint256));
        if (tokensOut < minTokensOut) revert Slippage();
        // Wymiana z granica ceny bywa czesciowa - reszta wraca do kolejki buybacku.
        if (spent < quoteIn) pendingBuybackQuote[token] += quoteIn - spent;
        buybackTokens[token] += tokensOut;
        _safeTransfer(token, DEAD, tokensOut);
        emit AutoBuyback(token, spent, tokensOut, msg.sender);
    }

    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        if (msg.sender != POOL_MANAGER) revert NotPoolManager();
        if (_buybackAction != 1) revert NotUnlocking();

        (address token, uint256 quoteIn, uint256 minTokensOut) = abi.decode(data, (address, uint256, uint256));
        if (token != _buybackToken || quoteIn != _buybackQuote || minTokensOut != _buybackMinOut) revert BadPoolShape();

        PoolKey memory key = IQuoteVaultView(VAULT).poolKeyOf(token);
        bool quoteIs0 = key.currency0 == QUOTE;

        uint160 spot = PoolStateReader.sqrtPriceX96(POOL_MANAGER, key);
        if (spot == 0) revert BadPoolShape();

        // Kupujemy token za QUOTE. QUOTE jako currency0 -> zeroForOne, cena v4
        // spada, granica PONIZEJ spotu. QUOTE jako currency1 -> oneForZero, cena
        // rosnie, granica POWYZEJ spotu. W obu przypadkach ten sam limit
        // odleglosci na pierwiastku ceny.
        uint160 limit;
        if (quoteIs0) {
            limit = uint160((uint256(spot) * (10_000 - MAX_BUYBACK_SLIPPAGE_BPS)) / 10_000);
            if (limit <= MIN_SQRT_PRICE_X96) limit = MIN_SQRT_PRICE_X96 + 1;
        } else {
            uint256 up = (uint256(spot) * (10_000 + MAX_BUYBACK_SLIPPAGE_BPS)) / 10_000;
            limit = up >= MAX_SQRT_PRICE_X96 ? MAX_SQRT_PRICE_X96 - 1 : uint160(up);
        }

        int256 delta = IPoolManagerV4(POOL_MANAGER).swap(
            key,
            SwapParams({zeroForOne: quoteIs0, amountSpecified: -int256(quoteIn), sqrtPriceLimitX96: limit}),
            ""
        );
        int128 quoteDelta = quoteIs0 ? BalanceDeltaLib.amount0(delta) : BalanceDeltaLib.amount1(delta);
        int128 tokenDelta = quoteIs0 ? BalanceDeltaLib.amount1(delta) : BalanceDeltaLib.amount0(delta);

        uint256 spent;
        if (quoteDelta < 0) {
            spent = uint256(uint128(-quoteDelta));
            IPoolManagerV4(POOL_MANAGER).sync(QUOTE);
            _safeTransfer(QUOTE, POOL_MANAGER, spent);
            IPoolManagerV4(POOL_MANAGER).settle();
        } else if (quoteDelta > 0) {
            IPoolManagerV4(POOL_MANAGER).take(QUOTE, address(this), uint256(uint128(quoteDelta)));
        }
        if (tokenDelta < 0) revert BadPoolShape();
        uint256 bought = uint256(uint128(tokenDelta));
        if (bought < minTokensOut) revert Slippage();
        if (bought != 0) IPoolManagerV4(POOL_MANAGER).take(token, address(this), bought);
        return abi.encode(bought, spent);
    }

    /* ====================================================================== */
    /*  PODZIAL I ODBIOR                                                       */
    /* ====================================================================== */

    /** Bezuprawnieniowe - patrz `B20LaunchHook.settle`. Buyback tylko z dzialki tworcy w QUOTE. */
    function settle(address token) external nonReentrant {
        uint256 q = pendingQuote[token];
        uint256 tok = pendingToken[token];
        if (q == 0 && tok == 0) revert NothingToSettle();

        address creator = IQuoteVaultView(VAULT).creatorOf(token);
        // Nieosiagalne dzis (pending rosnie tylko dla pul otwartych przez `seed`,
        // ktory zapisuje tworce) - zostaje, bo bez tego udzial tworcy poszedlby
        // na adres zerowy bez drogi powrotu.
        if (creator == address(0)) revert UnknownToken();

        pendingQuote[token] = 0;
        pendingToken[token] = 0;

        uint256 protoQuote = FullMath.mulDivDown(q, PROTOCOL_SHARE_BPS, 10_000);
        uint256 protoTok = FullMath.mulDivDown(tok, PROTOCOL_SHARE_BPS, 10_000);
        uint256 creatorTok = tok - protoTok;

        uint256 creatorGrossQuote = q - protoQuote;
        uint256 buybackCut = FullMath.mulDivDown(creatorGrossQuote, buybackBps[token], 10_000);
        uint256 creatorQuote = creatorGrossQuote - buybackCut;
        if (buybackCut != 0) pendingBuybackQuote[token] += buybackCut;

        if (protoQuote != 0) claimableQuote[FEE_RECIPIENT] += protoQuote;
        if (creatorQuote != 0) claimableQuote[creator] += creatorQuote;
        if (protoTok != 0) claimableToken[token][FEE_RECIPIENT] += protoTok;
        if (creatorTok != 0) claimableToken[token][creator] += creatorTok;

        emit HookFeeSettled(token, protoQuote, creatorQuote, buybackCut, protoTok, creatorTok);
    }

    function claimQuote() external {
        _payoutQuote(msg.sender);
    }

    /** Wyplata cudzego salda, zawsze DO wlasciciela - kierunek zaszyty w kodzie. */
    function claimQuoteFor(address account) external {
        _payoutQuote(account);
    }

    function claimToken(address token) external {
        _payoutToken(token, msg.sender);
    }

    function claimTokenFor(address token, address account) external {
        _payoutToken(token, account);
    }

    function _payoutQuote(address account) private nonReentrant {
        uint256 amount = claimableQuote[account];
        if (amount == 0) revert NothingToClaim();
        claimableQuote[account] = 0;
        emit Claimed(account, QUOTE, amount, msg.sender);
        _safeTransfer(QUOTE, account, amount);
    }

    function _payoutToken(address token, address account) private nonReentrant {
        uint256 amount = claimableToken[token][account];
        if (amount == 0) revert NothingToClaim();
        claimableToken[token][account] = 0;
        emit Claimed(account, token, amount, msg.sender);
        _safeTransfer(token, account, amount);
    }

    function _safeTransfer(address token, address to, uint256 amount) private {
        (bool ok, bytes memory ret) = token.call(abi.encodeWithSignature("transfer(address,uint256)", to, amount));
        if (!ok || (ret.length != 0 && !abi.decode(ret, (bool)))) revert TokenTransferFailed();
    }
}
