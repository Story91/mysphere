// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import {
    IPoolManagerV4,
    IUnlockCallback,
    PoolKey,
    ModifyLiquidityParams,
    BalanceDeltaLib,
    PoolStateReader
} from "../interfaces/IPoolManagerV4.sol";
import {HOOK_ALL_MASK, HOOK_REQUIRED_FLAGS} from "../B20LaunchHook.sol";
import {QuoteLaunchHook} from "./QuoteLaunchHook.sol";
import {QuoteLiquidityMath} from "./QuoteLiquidityMath.sol";
import {TickMath} from "../lib/TickMath.sol";
import {FullMath} from "../lib/FullMath.sol";

interface IQuoteLiquidityVault {
    function seedWithConfig(
        address token,
        address creator,
        PoolKey calldata key,
        uint160 sqrtPriceX96,
        uint16 buybackBps,
        uint256 quoteAmount
    ) external returns (uint128 liquidity, uint256 quoteUsed, uint256 tokenUsed, uint256 toDead);

    function HOOK() external view returns (address);

    function POOL_MANAGER() external view returns (address);
}

interface IERC20Balance {
    function balanceOf(address account) external view returns (uint256);
}

/**
 * LIQUIDITY VAULT Q - wlasciciel pozycji LP tokenow awansowanych na krzywej Q.
 *
 * Ta sama konstrukcja co `LiquidityVault` (pelne uzasadnienie tam): plynnosc
 * zamknieta w kontrakcie bez wyjscia - w calym pliku sa dokladnie dwa
 * `modifyLiquidity`, jedno z delta z uint128 (nie ma wartosci ujemnej), drugie
 * z literalnym zerem. Brak `owner`, `pause`, `withdraw`, `sweep`.
 *
 * Roznice wobec wersji ETH:
 *
 * 1. KWOTA QUOTE Z PARAMETRU, nie z `msg.value`. Launchpad przelewa QUOTE przed
 *    wywolaniem. Z salda jej NIE liczymy, bo ten kontrakt trzyma tez narosle
 *    oplaty LP w QUOTE - saldo nie mowi, ile przyszlo z krzywej. W zamian
 *    asercja po zasileniu: pula nie wziela wiecej QUOTE, niz podal launchpad.
 *    Inaczej nadwyzka szlaby z cudzych oplat.
 * 2. ORIENTACJA PULI per token (`QUOTE < token` -> QUOTE jest currency0).
 * 3. ROZLICZENIE obu walut jako ERC-20: `sync` -> `transfer` -> `settle()`.
 *    Nie ma `receive()` - ten kontrakt nie ma po co dostawac natywnego ETH.
 */
contract QuoteLiquidityVault is IUnlockCallback {
    using BalanceDeltaLib for int256;

    address public constant DEAD = 0x000000000000000000000000000000000000dEaD;
    uint16 public constant MAX_PROTOCOL_SHARE_BPS = 8000;

    address public immutable POOL_MANAGER;
    address public immutable QUOTE;
    address public immutable LAUNCHPAD;
    address public immutable FEE_RECIPIENT;
    uint16 public immutable PROTOCOL_SHARE_BPS;
    address public immutable HOOK;

    struct Position {
        uint24 fee;
        int24 tickSpacing;
        int24 tickLower;
        int24 tickUpper;
        uint128 liquidity;
    }

    mapping(address => Position) public positions;
    mapping(address => bool) public seeded;
    mapping(address => address) public creatorOf;

    mapping(address => uint256) public claimableEth;
    mapping(address => mapping(address => uint256)) public claimableToken;

    /** amount0/amount1 w kolejnosci PULI, `ethDust` = pyl QUOTE (sygnatura jak w wersji ETH). */
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
    event Harvested(address indexed token, bytes32 indexed poolId, address indexed caller, uint256 fee0, uint256 fee1);
    /** `ethAmount` = kwota w QUOTE. */
    event LpFeeAccrued(address indexed token, address indexed account, uint256 ethAmount, uint256 tokenAmount);
    /** Kwota w QUOTE - nazwa i sygnatura jak w `LiquidityVault`, zeby front mial jedno ABI. */
    event EthClaimed(address indexed account, uint256 amount, address indexed caller);
    event TokenClaimed(address indexed token, address indexed account, uint256 amount, address indexed caller);

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
    error NotEnoughQuote();
    error UnexpectedDelta();
    error NothingToClaim();
    error TokenTransferFailed();
    error Reentrancy();

    uint256 private _lock = 1;
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

    /** Wdrazany przez konstruktor launchpada Q - `LAUNCHPAD = msg.sender`, jak w wersji ETH. */
    constructor(address poolManager_, address feeRecipient_, uint16 protocolShareBps_, bytes32 hookSalt_, address quote_) {
        if (feeRecipient_ == address(0) || quote_ == address(0) || poolManager_ == address(0)) revert ZeroAddress();
        if (protocolShareBps_ > MAX_PROTOCOL_SHARE_BPS) revert ProtocolShareTooHigh();
        uint256 pmCodeSize;
        assembly {
            pmCodeSize := extcodesize(poolManager_)
        }
        if (pmCodeSize == 0) revert PoolManagerHasNoCode();

        POOL_MANAGER = poolManager_;
        QUOTE = quote_;
        LAUNCHPAD = msg.sender;
        FEE_RECIPIENT = feeRecipient_;
        PROTOCOL_SHARE_BPS = protocolShareBps_;

        address hook = address(new QuoteLaunchHook{salt: hookSalt_}(poolManager_, feeRecipient_, protocolShareBps_, quote_));
        // Zly salt wywala WDROZENIE, nie pierwszy awans - patrz `LiquidityVault`.
        if (uint160(hook) & HOOK_ALL_MASK != HOOK_REQUIRED_FLAGS) revert BadHookAddress();
        QuoteLaunchHook h = QuoteLaunchHook(hook);
        if (h.FEE_RECIPIENT() != feeRecipient_) revert HookConfigMismatch();
        if (h.PROTOCOL_SHARE_BPS() != protocolShareBps_) revert HookConfigMismatch();
        if (h.POOL_MANAGER() != poolManager_) revert HookConfigMismatch();
        if (h.QUOTE() != quote_) revert HookConfigMismatch();

        HOOK = hook;
    }

    /* ---------------------------------------------------------------------- */
    /*  ODCZYTY                                                                */
    /* ---------------------------------------------------------------------- */

    function quoteIsCurrency0(address token) public view returns (bool) {
        return QUOTE < token;
    }

    function poolKeyOf(address token) public view returns (PoolKey memory) {
        Position memory p = positions[token];
        (address c0, address c1) = QUOTE < token ? (QUOTE, token) : (token, QUOTE);
        return PoolKey({currency0: c0, currency1: c1, fee: p.fee, tickSpacing: p.tickSpacing, hooks: HOOK});
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
     * Wklada `quoteAmount` QUOTE (przelane chwile wczesniej przez launchpad) do
     * puli i zamyka pozycje na zawsze. Token: ile trzeba, reszta na `DEAD`.
     * Saldo tokena moze byc tylko WIEKSZE od tego, co przyszlo z krzywej -
     * patrz poprawka znaleziska #6 w `LiquidityVault.seed`.
     *
     * Zwraca kwoty w znaczeniu launchpada (QUOTE, token), a nie w kolejnosci puli.
     */
    function seedWithConfig(
        address token,
        address creator,
        PoolKey calldata key,
        uint160 sqrtPriceX96,
        uint16 buybackBps_,
        uint256 quoteAmount
    ) external nonReentrant returns (uint128 liquidity, uint256 quoteUsed, uint256 tokenUsed, uint256 toDead) {
        if (msg.sender != LAUNCHPAD) revert NotLaunchpad();
        if (buybackBps_ > 10_000) revert BadPoolKey();
        if (seeded[token]) revert AlreadySeeded();
        if (token == address(0) || creator == address(0)) revert ZeroAddress();
        if (token == QUOTE) revert BadPoolKey();

        bool quoteIs0 = QUOTE < token;
        (address c0, address c1) = quoteIs0 ? (QUOTE, token) : (token, QUOTE);
        if (key.currency0 != c0 || key.currency1 != c1 || key.hooks != HOOK) revert BadPoolKey();
        if (key.tickSpacing <= 0) revert BadPoolKey();

        QuoteLaunchHook(HOOK).configureToken(token, buybackBps_);

        // Pula powstaje dopiero teraz, jedna, za brama hooka - patrz `LiquidityVault._seed`.
        IPoolManagerV4(POOL_MANAGER).initialize(key, sqrtPriceX96);
        if (PoolStateReader.sqrtPriceX96(POOL_MANAGER, key) != sqrtPriceX96) revert PoolStateUnreadable();

        int24 tickUpper = (TickMath.MAX_TICK / key.tickSpacing) * key.tickSpacing;
        int24 tickLower = -tickUpper;

        liquidity = QuoteLiquidityMath.liquidityForQuote(
            quoteIs0,
            sqrtPriceX96,
            TickMath.getSqrtPriceAtTick(tickLower),
            TickMath.getSqrtPriceAtTick(tickUpper),
            quoteAmount
        );
        if (liquidity == 0) revert ZeroLiquidity();

        seeded[token] = true;
        creatorOf[token] = creator;
        positions[token] = Position({
            fee: key.fee,
            tickSpacing: key.tickSpacing,
            tickLower: tickLower,
            tickUpper: tickUpper,
            liquidity: liquidity
        });

        uint256 tokenHeld = IERC20Balance(token).balanceOf(address(this));

        _action = ACTION_SEED;
        bytes memory ret = IPoolManagerV4(POOL_MANAGER).unlock(abi.encode(ACTION_SEED, token));
        _action = ACTION_NONE;
        (uint256 owed0, uint256 owed1) = abi.decode(ret, (uint256, uint256));

        (quoteUsed, tokenUsed) = quoteIs0 ? (owed0, owed1) : (owed1, owed0);
        // Pula nie moze wziac wiecej QUOTE, niz przyszlo z krzywej - nadwyzka
        // szlaby z narosych oplat LP innych tokenow. Z zaokraglen w dol nie
        // powinno sie to zdarzyc; asercja zamienia "nie powinno" w "nie moze".
        if (quoteUsed > quoteAmount) revert NotEnoughQuote();
        if (tokenUsed > tokenHeld) revert NotEnoughToken();
        toDead = tokenHeld - tokenUsed;
        if (toDead != 0) _safeTransfer(token, DEAD, toDead);

        emit Seeded(
            token,
            PoolStateReader.poolId(key),
            creator,
            liquidity,
            owed0,
            owed1,
            quoteAmount - quoteUsed,
            toDead,
            tickLower,
            tickUpper
        );
    }

    /* ---------------------------------------------------------------------- */
    /*  ZBIOR OPLAT LP - BEZUPRAWNIENIOWE                                      */
    /* ---------------------------------------------------------------------- */

    function harvest(address token) external nonReentrant {
        if (!seeded[token]) revert NotSeeded();

        _action = ACTION_HARVEST;
        bytes memory ret = IPoolManagerV4(POOL_MANAGER).unlock(abi.encode(ACTION_HARVEST, token));
        _action = ACTION_NONE;

        (uint256 fee0, uint256 fee1) = abi.decode(ret, (uint256, uint256));
        (uint256 feeQuote, uint256 feeTok) = QUOTE < token ? (fee0, fee1) : (fee1, fee0);

        address creator = creatorOf[token];
        uint256 protoQuote = FullMath.mulDivDown(feeQuote, PROTOCOL_SHARE_BPS, 10_000);
        uint256 protoTok = FullMath.mulDivDown(feeTok, PROTOCOL_SHARE_BPS, 10_000);
        uint256 creatorQuote = feeQuote - protoQuote;
        uint256 creatorTok = feeTok - protoTok;

        if (protoQuote != 0) claimableEth[FEE_RECIPIENT] += protoQuote;
        if (creatorQuote != 0) claimableEth[creator] += creatorQuote;
        if (protoTok != 0) claimableToken[token][FEE_RECIPIENT] += protoTok;
        if (creatorTok != 0) claimableToken[token][creator] += creatorTok;

        emit LpFeeAccrued(token, FEE_RECIPIENT, protoQuote, protoTok);
        emit LpFeeAccrued(token, creator, creatorQuote, creatorTok);
        emit Harvested(token, PoolStateReader.poolId(poolKeyOf(token)), msg.sender, fee0, fee1);
    }

    /* ---------------------------------------------------------------------- */
    /*  CALLBACK POOL MANAGERA                                                 */
    /* ---------------------------------------------------------------------- */

    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        if (msg.sender != POOL_MANAGER) revert NotPoolManager();
        if (_action == ACTION_NONE) revert NotUnlocking();
        (uint8 action, address token) = abi.decode(data, (uint8, address));
        if (action != _action) revert NotUnlocking();
        if (action == ACTION_SEED) return _seedCallback(token);
        return _harvestCallback(token);
    }

    /** JEDYNE `modifyLiquidity` z delta zmienna - uint128 -> int256 nie ma wartosci ujemnej. */
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

        int128 d0 = callerDelta.amount0();
        int128 d1 = callerDelta.amount1();
        if (d0 > 0 || d1 > 0) revert UnexpectedDelta();

        uint256 owed0 = uint256(uint128(-d0));
        uint256 owed1 = uint256(uint128(-d1));
        _pay(key.currency0, owed0);
        _pay(key.currency1, owed1);
        return abi.encode(owed0, owed1);
    }

    /** DRUGIE i ostatnie `modifyLiquidity` - delta wpisana literalnie: same narosle oplaty. */
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
        if (d0 < 0 || d1 < 0) revert UnexpectedDelta();

        uint256 fee0 = uint256(uint128(d0));
        uint256 fee1 = uint256(uint128(d1));
        if (fee0 != 0) IPoolManagerV4(POOL_MANAGER).take(key.currency0, address(this), fee0);
        if (fee1 != 0) IPoolManagerV4(POOL_MANAGER).take(key.currency1, address(this), fee1);
        return abi.encode(fee0, fee1);
    }

    /** ERC-20: `sync` PRZED transferem, potem `settle()` bez wartosci - kolejnosc z wersji ETH. */
    function _pay(address currency, uint256 amount) private {
        if (amount == 0) return;
        IPoolManagerV4(POOL_MANAGER).sync(currency);
        _safeTransfer(currency, POOL_MANAGER, amount);
        IPoolManagerV4(POOL_MANAGER).settle();
    }

    /* ---------------------------------------------------------------------- */
    /*  ODBIOR                                                                 */
    /* ---------------------------------------------------------------------- */

    function claimEth() external {
        _payoutEth(msg.sender);
    }

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
        _safeTransfer(QUOTE, account, amount);
    }

    function _payoutToken(address token, address account) private nonReentrant {
        uint256 amount = claimableToken[token][account];
        if (amount == 0) revert NothingToClaim();
        claimableToken[token][account] = 0;
        emit TokenClaimed(token, account, amount, msg.sender);
        _safeTransfer(token, account, amount);
    }

    function _safeTransfer(address token, address to, uint256 amount) private {
        (bool ok, bytes memory ret) = token.call(abi.encodeWithSignature("transfer(address,uint256)", to, amount));
        if (!ok || (ret.length != 0 && !abi.decode(ret, (bool)))) revert TokenTransferFailed();
    }
}
