// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import {
    IPoolManagerV4,
    IUnlockCallback,
    PoolKey,
    SwapParams,
    BalanceDeltaLib,
    PoolStateReader
} from "../interfaces/IPoolManagerV4.sol";
import {FullMath} from "../lib/FullMath.sol";


/**
 * SphereBuyback - skup SPHERE z przychodu protokolu (spec sekcje 5 i 8).
 *
 * ===========================================================================
 * KLUCZOWA SPRZECZNOSC, KTORA TEN KONTRAKT ROZSTRZYGA W KODZIE
 * ===========================================================================
 * "Permissionless execute + losowe transze keepera" nie sklada sie: skoro
 * kazdy moze zawolac skup, napastnik nie czeka na keepera, tylko odpala go
 * w zmanipulowanym momencie. Dlatego limity egzekwuje KONTRAKT, nie keeper:
 *  - TRANCHE_MAX: sufit jednej transzy,
 *  - WINDOW_BUDGET / WINDOW_SECONDS: budzet okna czasowego,
 *  - checkpoint ceny (OPERATOR, maks. wiek CHECKPOINT_MAX_AGE) + MAX_DEV_BPS:
 *    wykonanie musi dac co najmniej rate_checkpointu * (1 - dev) tokenow
 *    za kazde wei - sandwich, ktory zepchnie cene nizej, REWERTUJE.
 *    Checkpoint jest referencja SPOZA transakcji wykonania - dokladnie to,
 *    czego clampowi hooka brakuje (jego komentarz mowi to wprost).
 *
 * Podzial kupionego: BURN_BPS na 0xdEaD (narracyjna, mierzalna deflacja),
 * reszta do DISTRIBUTORA (buyback-and-redistribute - pula nagrod tworcow).
 *
 * NOGI TEAM-RUN, nazwane uczciwie (spec: tylko to, co wymusza lancuch, wolno
 * komunikowac jako gwarancje), ROZDZIELONE na dwa klucze (recenzja
 * przedwdrozeniowa 2026-09-02): checkpoint() nalezy do CHECKPOINTERA -
 * goracego klucza keepera, bo checkpoint musi byc swiezy (CHECKPOINT_MAX_AGE)
 * i Safe nie zrobi go co godzine; cancel() nalezy do OPERATORA (Safe)
 * i zwraca NIEWYDANE ETH wylacznie do OPERATORA - to jego wlasny przychod.
 * Checkpointer nie ma zadnej drogi do srodkow: moze tylko wybrac MOMENT
 * odczytu spotu, a zly moment ogranicza MAX_DEV_BPS i budzet okna.
 */
contract SphereBuyback is IUnlockCallback {
    address public constant DEAD = 0x000000000000000000000000000000000000dEaD;

    address public immutable POOL_MANAGER;
    /** Kanoniczna pula SPHERE: currency0 = natywne ETH(0), currency1 = SPHERE. */
    address public immutable SPHERE;
    uint24 public immutable POOL_FEE;
    int24 public immutable TICK_SPACING;
    address public immutable HOOKS;

    address public immutable DISTRIBUTOR;
    address public immutable OPERATOR;
    address public immutable CHECKPOINTER; // goracy klucz keepera: tylko checkpoint()

    uint16 public immutable BURN_BPS; // czesc kupionego palona (reszta -> distributor)
    uint256 public immutable TRANCHE_MAX; // wei na jedno wykonanie
    uint256 public immutable WINDOW_BUDGET; // wei na okno
    uint64 public immutable WINDOW_SECONDS;
    uint64 public immutable CHECKPOINT_MAX_AGE;
    uint16 public immutable MAX_DEV_BPS; // dopuszczalne odchylenie od checkpointu

    uint160 internal constant MIN_SQRT_PRICE_X96 = 4295128739;

    /** Referencja ceny: ile tokenow za 1e18 wei wg checkpointu OPERATORA. */
    uint256 public checkpointTokensPerEthE18;
    uint64 public checkpointAt;

    mapping(uint256 => uint256) public windowSpent; // okno -> wydane wei

    uint256 public totalBurned;
    uint256 public totalToDistributor;
    uint256 public totalEthSpent;

    uint8 private _unlocking;
    uint256 private _pendingEthIn;
    uint256 private _pendingMinOut;

    event Checkpointed(uint256 tokensPerEthE18, address indexed caller);
    event BuybackExecuted(uint256 ethSpent, uint256 bought, uint256 burned, uint256 toDistributor, address indexed caller);
    event Cancelled(uint256 amount, address indexed operator);

    error ZeroAddress();
    error BadConfig();
    error NotOperator();
    error NotCheckpointer();
    error NotPoolManager();
    error NotUnlocking();
    error Expired();
    error TrancheTooBig();
    error WindowBudgetExceeded();
    error CheckpointStale();
    error PriceGuard();
    error Slippage();
    error NothingToDo();
    error EthTransferFailed();
    error TokenTransferFailed();

    constructor(
        address poolManager_,
        address sphere_,
        uint24 poolFee_,
        int24 tickSpacing_,
        address hooks_,
        address distributor_,
        address operator_,
        address checkpointer_,
        uint16 burnBps_,
        uint256 trancheMax_,
        uint256 windowBudget_,
        uint64 windowSeconds_,
        uint64 checkpointMaxAge_,
        uint16 maxDevBps_
    ) {
        if (
            poolManager_ == address(0) || sphere_ == address(0) || distributor_ == address(0) || operator_ == address(0)
                || checkpointer_ == address(0)
        ) {
            revert ZeroAddress();
        }
        if (burnBps_ > 10_000 || maxDevBps_ >= 10_000 || trancheMax_ == 0 || windowBudget_ < trancheMax_ || windowSeconds_ == 0 || checkpointMaxAge_ == 0) {
            revert BadConfig();
        }
        POOL_MANAGER = poolManager_;
        SPHERE = sphere_;
        POOL_FEE = poolFee_;
        TICK_SPACING = tickSpacing_;
        HOOKS = hooks_;
        DISTRIBUTOR = distributor_;
        OPERATOR = operator_;
        CHECKPOINTER = checkpointer_;
        BURN_BPS = burnBps_;
        TRANCHE_MAX = trancheMax_;
        WINDOW_BUDGET = windowBudget_;
        WINDOW_SECONDS = windowSeconds_;
        CHECKPOINT_MAX_AGE = checkpointMaxAge_;
        MAX_DEV_BPS = maxDevBps_;
    }

    /** Przyjmuje ETH z transz Safe / SphereRewards.pull. */
    receive() external payable {}

    function poolKey() public view returns (PoolKey memory) {
        return PoolKey({currency0: address(0), currency1: SPHERE, fee: POOL_FEE, tickSpacing: TICK_SPACING, hooks: HOOKS});
    }

    function currentWindow() public view returns (uint256) {
        return block.timestamp / WINDOW_SECONDS;
    }

    /**
     * Checkpoint referencji ceny - TEAM-RUN (OPERATOR/keeper Safe). Odczyt
     * spotu robi kontrakt sam; operator tylko wybiera MOMENT (spokojny rynek).
     * Wykonanie skupu porownuje sie do TEGO odczytu, nie do spotu w swojej
     * wlasnej transakcji.
     */
    function checkpoint() external {
        if (msg.sender != CHECKPOINTER) revert NotCheckpointer();
        uint160 sqrtP = PoolStateReader.sqrtPriceX96(POOL_MANAGER, poolKey());
        if (sqrtP == 0) revert BadConfig();
        // Uniswap v4: sqrtPriceX96 = sqrt(currency1 / currency0) * 2^96. W puli
        // kanonicznej currency0 = ETH, currency1 = SPHERE (CurveLaunchpad
        // buduje klucz z address(0) jako currency0), wiec
        //   tokens/ETH = (sqrtP / 2^96)^2 = sqrtP^2 / 2^192.
        // Poprzednia wersja liczyla ODWROTNOSC (2^192 / sqrtP^2), czyli ETH/token
        // - testy tego nie lapaly, bo pula 1:1 daje ten sam wynik w obie strony,
        // a na mainnecie straznik mialby prog ~1e16 razy za niski. Dwa mulDiv
        // po 2^96, zeby sqrtP^2 (do 320 bitow) nie przepelnilo uint256.
        uint256 sq = FullMath.mulDivDown(uint256(sqrtP), uint256(sqrtP), uint256(1) << 96);
        uint256 priceTokensPerEth = FullMath.mulDivDown(sq, 1e18, uint256(1) << 96);
        checkpointTokensPerEthE18 = priceTokensPerEth;
        checkpointAt = uint64(block.timestamp);
        emit Checkpointed(priceTokensPerEth, msg.sender);
    }

    /**
     * Wykonanie transzy - BEZUPRAWNIENIOWE, bo wszystkie decyzje sa w kodzie:
     * sufit transzy, budzet okna, swiezosc checkpointu i minimalny kurs.
     * Napastnik nie ma czego przekierowac ani czego zepchnac.
     */
    function execute(uint256 ethIn, uint256 minTokensOut, uint256 deadline) external returns (uint256 bought) {
        if (block.timestamp > deadline) revert Expired();
        if (ethIn == 0 || address(this).balance == 0) revert NothingToDo();
        if (ethIn > TRANCHE_MAX) revert TrancheTooBig();
        if (ethIn > address(this).balance) ethIn = address(this).balance;

        uint256 window = currentWindow();
        if (windowSpent[window] + ethIn > WINDOW_BUDGET) revert WindowBudgetExceeded();

        if (checkpointAt == 0 || block.timestamp - checkpointAt > CHECKPOINT_MAX_AGE) revert CheckpointStale();
        // Minimalny akceptowalny kurs: checkpoint minus dopuszczalne odchylenie.
        uint256 guardMinOut = (ethIn * checkpointTokensPerEthE18 * (10_000 - MAX_DEV_BPS)) / (1e18 * 10_000);

        _unlocking = 1;
        _pendingEthIn = ethIn;
        _pendingMinOut = minTokensOut;
        bytes memory ret = IPoolManagerV4(POOL_MANAGER).unlock(abi.encode(ethIn, minTokensOut));
        _unlocking = 0;
        _pendingEthIn = 0;
        _pendingMinOut = 0;

        uint256 spent;
        (bought, spent) = abi.decode(ret, (uint256, uint256));
        if (bought < minTokensOut || bought < (guardMinOut * spent) / (ethIn == 0 ? 1 : ethIn)) revert PriceGuard();

        windowSpent[window] += spent;
        totalEthSpent += spent;

        uint256 burned = (bought * BURN_BPS) / 10_000;
        uint256 toDist = bought - burned;
        totalBurned += burned;
        totalToDistributor += toDist;
        if (burned != 0) _safeTransfer(SPHERE, DEAD, burned);
        if (toDist != 0) _safeTransfer(SPHERE, DISTRIBUTOR, toDist);

        emit BuybackExecuted(spent, bought, burned, toDist, msg.sender);
    }

    /** Zwrot NIEWYDANEGO ETH do OPERATORA (jego wlasny przychod). TEAM-RUN. */
    function cancel(uint256 amount) external {
        if (msg.sender != OPERATOR) revert NotOperator();
        if (amount == 0 || amount > address(this).balance) revert NothingToDo();
        emit Cancelled(amount, msg.sender);
        (bool ok, ) = OPERATOR.call{value: amount}("");
        if (!ok) revert EthTransferFailed();
    }

    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        if (msg.sender != POOL_MANAGER) revert NotPoolManager();
        if (_unlocking != 1) revert NotUnlocking();
        (uint256 ethIn, uint256 minOut) = abi.decode(data, (uint256, uint256));
        if (ethIn != _pendingEthIn || minOut != _pendingMinOut) revert NotUnlocking();

        PoolKey memory key = poolKey();
        uint160 spot = PoolStateReader.sqrtPriceX96(POOL_MANAGER, key);
        uint160 limit = spot == 0 ? MIN_SQRT_PRICE_X96 + 1 : uint160((uint256(spot) * (10_000 - MAX_DEV_BPS)) / 10_000);
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
        if (amount1 < 0) revert Slippage();
        uint256 bought = uint256(uint128(amount1));
        if (bought != 0) IPoolManagerV4(POOL_MANAGER).take(SPHERE, address(this), bought);
        uint256 spent = amount0 < 0 ? uint256(uint128(-amount0)) : 0;
        return abi.encode(bought, spent);
    }

    function _safeTransfer(address token, address to, uint256 amount) private {
        (bool ok, bytes memory ret) = token.call(abi.encodeWithSignature("transfer(address,uint256)", to, amount));
        if (!ok || (ret.length != 0 && !abi.decode(ret, (bool)))) revert TokenTransferFailed();
    }
}
