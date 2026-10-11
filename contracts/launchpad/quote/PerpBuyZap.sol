// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import {
    IPoolManagerV4,
    IUnlockCallback,
    PoolKey,
    SwapParams,
    BalanceDeltaLib
} from "../interfaces/IPoolManagerV4.sol";

interface IZapQuoteLaunchpad {
    function QUOTE() external view returns (address);

    function buyFor(address token, uint256 quoteIn, uint256 minTokensOut, uint256 deadline, address recipient)
        external
        returns (uint256 tokensOut);
}

interface IZapToken {
    function balanceOf(address account) external view returns (uint256);
    function approve(address spender, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
}

/**
 * ZAP ETH -> perp -> mem na krzywej launchpada Q, w JEDNEJ transakcji.
 *
 * Rynki Q (para z perpem Flash, np. ETH2xL) przyjmuja wylacznie perpa. Kupujacy
 * z samym ETH musialby najpierw kupic perpa na Flash, a potem dac zgode i kupic
 * mema. Zap robi to w jednym wywolaniu:
 *
 *   1. ETH -> waluta posrednia (USDC) w bezhakowej puli v4 (`ethPool`),
 *   2. USDC -> perp w puli Flash (`perpPool`, hook Flash mintuje po NAV),
 *   3. `launchpad.buyFor(token, perp, ..., recipient)` - mem i limit okna
 *      startowego naleza do kupujacego, nie do zapa.
 *
 * Obie wymiany ida jednym `unlock` PoolManagera, wiec USDC nigdy nie opuszcza
 * PoolManagera (flash accounting): wyjscie pierwszej wymiany splaca wejscie
 * drugiej. To ta sama trasa, ktora Flash buduje przez Universal Router
 * (`V4_SWAP`, ETH -> USDC -> perp), tylko z kupnem mema doklejonym na koncu.
 *
 * ZAP NIE TRZYMA SRODKOW miedzy transakcjami. Wszystko, co zostanie po kupnie
 * (zwrot nadwyzki z krzywej przy jej zapelnieniu, niezuzyte ETH lub USDC przy
 * wyczerpanej plynnosci), wraca w tej samej transakcji: perp i USDC do
 * `recipient`, ETH do wolajacego. Klucze pul i launchpad podaje wolajacy - zly
 * wybor szkodzi tylko jego wlasnym srodkom, a launchpad musi zwrocic perpa
 * zgodnego z `QUOTE()`, inaczej transakcja odpada.
 *
 * Ochrona ceny: `minPerpOut` (Flash) i `minTokensOut` (krzywa) - obie po
 * stronie wolajacego, obie wymagane > 0.
 */
contract PerpBuyZap is IUnlockCallback {
    using BalanceDeltaLib for int256;

    IPoolManagerV4 public immutable POOL_MANAGER;

    // Granice ceny v4 (TickMath.MIN/MAX_SQRT_PRICE +/- 1) - wymiana "do skutku",
    // ochrona ceny jest w `minPerpOut`.
    uint160 private constant MIN_SQRT_LIMIT = 4295128740;
    uint160 private constant MAX_SQRT_LIMIT = 1461446703485210103287273052203988822378723970341;

    // Blokada wejscia i jednoczesnie znacznik "unlock zlecony przez nas".
    uint256 private _entered;

    event ZapBuy(
        address indexed launchpad,
        address indexed token,
        address indexed recipient,
        uint256 ethIn,
        uint256 perpIn,
        uint256 tokensOut
    );

    error Expired();
    error ZeroAmount();
    error SlippageRequired();
    error Slippage();
    error BadRoute();
    error NotPoolManager();
    error Reentrancy();
    error TransferFailed();

    constructor(address poolManager) {
        POOL_MANAGER = IPoolManagerV4(poolManager);
    }

    struct SwapRoute {
        PoolKey ethPool;
        PoolKey perpPool;
        address mid;
        address perp;
        uint256 ethIn;
        address recipient;
    }

    /**
     * Kupno mema za ETH. `msg.value` to cale ETH; zwraca ilosc perpa wydana na
     * krzywej i ilosc kupionych tokenow (oba po zwrotach).
     */
    function buyWithEth(
        address launchpad,
        address token,
        PoolKey calldata ethPool,
        PoolKey calldata perpPool,
        uint256 minPerpOut,
        uint256 minTokensOut,
        uint256 deadline,
        address recipient
    ) external payable returns (uint256 perpIn, uint256 tokensOut) {
        if (_entered != 0) revert Reentrancy();
        _entered = 1;
        if (block.timestamp > deadline) revert Expired();
        if (msg.value == 0) revert ZeroAmount();
        if (minPerpOut == 0 || minTokensOut == 0) revert SlippageRequired();
        if (recipient == address(0)) recipient = msg.sender;

        address perp = IZapQuoteLaunchpad(launchpad).QUOTE();
        address mid = ethPool.currency1;
        if (ethPool.currency0 != address(0) || mid == address(0) || mid == perp) revert BadRoute();
        if (
            !(perpPool.currency0 == mid && perpPool.currency1 == perp)
                && !(perpPool.currency0 == perp && perpPool.currency1 == mid)
        ) revert BadRoute();

        uint256 perpBefore = IZapToken(perp).balanceOf(address(this));
        uint256 perpOut = abi.decode(
            POOL_MANAGER.unlock(abi.encode(SwapRoute(ethPool, perpPool, mid, perp, msg.value, recipient))), (uint256)
        );
        if (perpOut < minPerpOut) revert Slippage();

        // Zgoda dokladnie na te kwote i zerowanie po kupnie - zap nie zostawia
        // otwartych zgod.
        _approve(perp, launchpad, perpOut);
        tokensOut = IZapQuoteLaunchpad(launchpad).buyFor(token, perpOut, minTokensOut, deadline, recipient);
        _approve(perp, launchpad, 0);

        // Zwrot nadwyzki z krzywej trafia do placacego, czyli do zapa - oddajemy.
        uint256 perpLeft = IZapToken(perp).balanceOf(address(this)) - perpBefore;
        perpIn = perpOut - perpLeft;
        if (perpLeft != 0) _transfer(perp, recipient, perpLeft);

        uint256 ethLeft = address(this).balance;
        if (ethLeft != 0) {
            (bool ok,) = msg.sender.call{value: ethLeft}("");
            if (!ok) revert TransferFailed();
        }

        emit ZapBuy(launchpad, token, recipient, msg.value - ethLeft, perpIn, tokensOut);
        _entered = 0;
    }

    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        if (msg.sender != address(POOL_MANAGER)) revert NotPoolManager();
        if (_entered != 1) revert Reentrancy();
        SwapRoute memory r = abi.decode(data, (SwapRoute));

        // 1. ETH -> mid (ETH to zawsze currency0).
        int256 d1 = POOL_MANAGER.swap(
            r.ethPool, SwapParams({zeroForOne: true, amountSpecified: -int256(r.ethIn), sqrtPriceLimitX96: MIN_SQRT_LIMIT}), ""
        );
        uint256 ethPaid = uint256(uint128(-d1.amount0()));
        uint256 midOut = uint256(uint128(d1.amount1()));
        if (midOut == 0) revert ZeroAmount();

        // 2. mid -> perp, exact input calym wyjsciem pierwszej wymiany.
        bool midIsZero = r.perpPool.currency0 == r.mid;
        int256 d2 = POOL_MANAGER.swap(
            r.perpPool,
            SwapParams({
                zeroForOne: midIsZero,
                amountSpecified: -int256(midOut),
                sqrtPriceLimitX96: midIsZero ? MIN_SQRT_LIMIT : MAX_SQRT_LIMIT
            }),
            ""
        );
        (int128 midDelta, int128 perpDelta) = midIsZero ? (d2.amount0(), d2.amount1()) : (d2.amount1(), d2.amount0());
        uint256 midPaid = uint256(uint128(-midDelta));
        uint256 perpOut = uint256(uint128(perpDelta));

        // 3. Rozliczenie: ETH wartoscia (reszta `msg.value` zostaje w zapie i
        // wraca do wolajacego), perp do zapa, ewentualna reszta USDC (plynnosc
        // Flash wyczerpana przed koncem wejscia) prosto do `recipient`.
        POOL_MANAGER.settle{value: ethPaid}();
        if (perpOut != 0) POOL_MANAGER.take(r.perp, address(this), perpOut);
        if (midOut > midPaid) POOL_MANAGER.take(r.mid, r.recipient, midOut - midPaid);

        return abi.encode(perpOut);
    }

    function _approve(address token, address spender, uint256 amount) private {
        (bool ok, bytes memory ret) = token.call(abi.encodeCall(IZapToken.approve, (spender, amount)));
        if (!ok || (ret.length != 0 && !abi.decode(ret, (bool)))) revert TransferFailed();
    }

    function _transfer(address token, address to, uint256 amount) private {
        (bool ok, bytes memory ret) = token.call(abi.encodeCall(IZapToken.transfer, (to, amount)));
        if (!ok || (ret.length != 0 && !abi.decode(ret, (bool)))) revert TransferFailed();
    }
}
