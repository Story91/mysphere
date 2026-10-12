// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import {
    IPoolManagerV4,
    IUnlockCallback,
    PoolKey,
    SwapParams,
    BalanceDeltaLib
} from "../interfaces/IPoolManagerV4.sol";

interface IPerpZapLaunchpad {
    function QUOTE() external view returns (address);

    function buyFor(address token, uint256 quoteIn, uint256 minTokensOut, uint256 deadline, address recipient)
        external
        returns (uint256 tokensOut);

    function sell(address token, uint256 tokensIn, uint256 minEthOut, uint256 deadline) external returns (uint256 ethOut);
}

interface IPerpZapToken {
    function balanceOf(address account) external view returns (uint256);
    function approve(address spender, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

/**
 * ZAP v2: ETH <-> mem na krzywej launchpada Q, w JEDNEJ transakcji w obie strony.
 *
 *   buyWithEth:  ETH -> USDC (pula ETH/USDC) -> perp (pula Flash) -> launchpad.buyFor(recipient)
 *   sellForEth:  mem -> launchpad.sell -> perp -> USDC (pula Flash) -> ETH (pula ETH/USDC) -> recipient
 *
 * v1 (PerpBuyZap, 0xBDBe...6b9A) umial tylko kupowac. Kupno jest tu 1:1 z v1.
 *
 * SPRZEDAZ PRZEZ ZAP A HISTORIA. Launchpad emituje `Sold(seller = msg.sender)`,
 * czyli zap - kontrakt launchpada jest niezmienny i nie ma `sellFor`. Dlatego
 * zap emituje `ZapSell(token, seller, ...)` w tej samej transakcji, a front
 * podstawia prawdziwego sprzedajacego: w skanie historii z `Transfer`
 * (mem od sprzedajacego do zapa), na zywo z `ZapSell`.
 *
 * ZAP NIE TRZYMA SRODKOW miedzy transakcjami: wszystko, co wejdzie, wychodzi w
 * tej samej transakcji (perp i USDC do odbiorcy, ETH do odbiorcy/wolajacego).
 * Zgody zap->launchpad sa na dokladna kwote i zerowane. Klucze pul podaje
 * wolajacy; zly wybor szkodzi tylko jego srodkom, a pule musza laczyc USDC
 * (currency1 puli ETH) z `QUOTE()` launchpada.
 */
contract PerpZap is IUnlockCallback {
    using BalanceDeltaLib for int256;

    IPoolManagerV4 public immutable POOL_MANAGER;

    uint160 private constant MIN_SQRT_LIMIT = 4295128740;
    uint160 private constant MAX_SQRT_LIMIT = 1461446703485210103287273052203988822378723970341;

    uint256 private _entered;

    event ZapBuy(
        address indexed launchpad,
        address indexed token,
        address indexed recipient,
        uint256 ethIn,
        uint256 perpIn,
        uint256 tokensOut
    );

    event ZapSell(
        address indexed launchpad,
        address indexed token,
        address indexed seller,
        address recipient,
        uint256 tokensIn,
        uint256 perpOut,
        uint256 ethOut
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

    struct Route {
        bool sell;
        PoolKey ethPool;
        PoolKey perpPool;
        address mid;
        address perp;
        uint256 amountIn; // kupno: ETH; sprzedaz: perp
        address recipient;
    }

    modifier guarded() {
        if (_entered != 0) revert Reentrancy();
        _entered = 1;
        _;
        _entered = 0;
    }

    /* ===================================================================== */
    /*  KUPNO                                                                 */
    /* ===================================================================== */

    function buyWithEth(
        address launchpad,
        address token,
        PoolKey calldata ethPool,
        PoolKey calldata perpPool,
        uint256 minPerpOut,
        uint256 minTokensOut,
        uint256 deadline,
        address recipient
    ) external payable guarded returns (uint256 perpIn, uint256 tokensOut) {
        if (block.timestamp > deadline) revert Expired();
        if (msg.value == 0) revert ZeroAmount();
        if (minPerpOut == 0 || minTokensOut == 0) revert SlippageRequired();
        if (recipient == address(0)) recipient = msg.sender;
        (address perp, address mid) = _checkRoute(launchpad, ethPool, perpPool);

        uint256 perpBefore = IPerpZapToken(perp).balanceOf(address(this));
        uint256 perpOut = abi.decode(
            POOL_MANAGER.unlock(abi.encode(Route(false, ethPool, perpPool, mid, perp, msg.value, recipient))), (uint256)
        );
        if (perpOut < minPerpOut) revert Slippage();

        _approve(perp, launchpad, perpOut);
        tokensOut = IPerpZapLaunchpad(launchpad).buyFor(token, perpOut, minTokensOut, deadline, recipient);
        _approve(perp, launchpad, 0);

        uint256 perpLeft = IPerpZapToken(perp).balanceOf(address(this)) - perpBefore;
        perpIn = perpOut - perpLeft;
        if (perpLeft != 0) _transfer(perp, recipient, perpLeft);

        uint256 ethLeft = address(this).balance;
        if (ethLeft != 0) _sendEth(msg.sender, ethLeft);

        emit ZapBuy(launchpad, token, recipient, msg.value - ethLeft, perpIn, tokensOut);
    }

    /* ===================================================================== */
    /*  SPRZEDAZ                                                              */
    /* ===================================================================== */

    /**
     * Sprzedaz mema za ETH. Wymaga zgody `token.approve(zap, tokensIn)`.
     * `minPerpOut` chroni krzywa, `minEthOut` cala trase do ETH.
     */
    function sellForEth(
        address launchpad,
        address token,
        uint256 tokensIn,
        PoolKey calldata ethPool,
        PoolKey calldata perpPool,
        uint256 minPerpOut,
        uint256 minEthOut,
        uint256 deadline,
        address recipient
    ) external guarded returns (uint256 perpOut, uint256 ethOut) {
        if (block.timestamp > deadline) revert Expired();
        if (tokensIn == 0) revert ZeroAmount();
        if (minPerpOut == 0 || minEthOut == 0) revert SlippageRequired();
        if (recipient == address(0)) recipient = msg.sender;
        (address perp, address mid) = _checkRoute(launchpad, ethPool, perpPool);

        // Mem od sprzedajacego (ten Transfer front czyta jako "kto sprzedal").
        uint256 tokBefore = IPerpZapToken(token).balanceOf(address(this));
        _transferFrom(token, msg.sender, address(this), tokensIn);
        if (IPerpZapToken(token).balanceOf(address(this)) - tokBefore != tokensIn) revert TransferFailed();

        uint256 perpBefore = IPerpZapToken(perp).balanceOf(address(this));
        _approve(token, launchpad, tokensIn);
        IPerpZapLaunchpad(launchpad).sell(token, tokensIn, minPerpOut, deadline);
        _approve(token, launchpad, 0);
        perpOut = IPerpZapToken(perp).balanceOf(address(this)) - perpBefore;
        if (perpOut < minPerpOut) revert Slippage();

        ethOut = abi.decode(
            POOL_MANAGER.unlock(abi.encode(Route(true, ethPool, perpPool, mid, perp, perpOut, recipient))), (uint256)
        );
        if (ethOut < minEthOut) revert Slippage();

        emit ZapSell(launchpad, token, msg.sender, recipient, tokensIn, perpOut, ethOut);
    }

    /* ===================================================================== */
    /*  POOLMANAGER                                                           */
    /* ===================================================================== */

    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        if (msg.sender != address(POOL_MANAGER)) revert NotPoolManager();
        if (_entered != 1) revert Reentrancy();
        Route memory r = abi.decode(data, (Route));
        return r.sell ? _unlockSell(r) : _unlockBuy(r);
    }

    function _unlockBuy(Route memory r) private returns (bytes memory) {
        // ETH -> mid (ETH to currency0 puli ETH).
        int256 d1 = POOL_MANAGER.swap(
            r.ethPool, SwapParams({zeroForOne: true, amountSpecified: -int256(r.amountIn), sqrtPriceLimitX96: MIN_SQRT_LIMIT}), ""
        );
        uint256 ethPaid = uint256(uint128(-d1.amount0()));
        uint256 midOut = uint256(uint128(d1.amount1()));
        if (midOut == 0) revert ZeroAmount();

        // mid -> perp.
        (uint256 midPaid, uint256 perpOut) = _swapExactIn(r.perpPool, r.mid, midOut);

        POOL_MANAGER.settle{value: ethPaid}();
        if (perpOut != 0) POOL_MANAGER.take(r.perp, address(this), perpOut);
        if (midOut > midPaid) POOL_MANAGER.take(r.mid, r.recipient, midOut - midPaid);
        return abi.encode(perpOut);
    }

    function _unlockSell(Route memory r) private returns (bytes memory) {
        // perp -> mid.
        (uint256 perpPaid, uint256 midOut) = _swapExactIn(r.perpPool, r.perp, r.amountIn);
        if (midOut == 0) revert ZeroAmount();

        // mid -> ETH (mid to currency1 puli ETH, wiec oneForZero).
        int256 d2 = POOL_MANAGER.swap(
            r.ethPool, SwapParams({zeroForOne: false, amountSpecified: -int256(midOut), sqrtPriceLimitX96: MAX_SQRT_LIMIT}), ""
        );
        uint256 ethOut = uint256(uint128(d2.amount0()));
        uint256 midPaid = uint256(uint128(-d2.amount1()));

        // Rozliczenie perpa: sync -> przelew -> settle.
        POOL_MANAGER.sync(r.perp);
        _transfer(r.perp, address(POOL_MANAGER), perpPaid);
        POOL_MANAGER.settle();
        if (ethOut != 0) POOL_MANAGER.take(address(0), r.recipient, ethOut);
        if (midOut > midPaid) POOL_MANAGER.take(r.mid, r.recipient, midOut - midPaid);
        // Perp, ktorego pula nie przyjela (wyczerpana plynnosc), wraca do odbiorcy.
        if (r.amountIn > perpPaid) _transfer(r.perp, r.recipient, r.amountIn - perpPaid);
        return abi.encode(ethOut);
    }

    /** Exact-in na puli laczacej `tokenIn` z druga waluta; zwraca (zaplacone, otrzymane). */
    function _swapExactIn(PoolKey memory key, address tokenIn, uint256 amountIn)
        private
        returns (uint256 paid, uint256 received)
    {
        bool inIsZero = key.currency0 == tokenIn;
        int256 d = POOL_MANAGER.swap(
            key,
            SwapParams({
                zeroForOne: inIsZero,
                amountSpecified: -int256(amountIn),
                sqrtPriceLimitX96: inIsZero ? MIN_SQRT_LIMIT : MAX_SQRT_LIMIT
            }),
            ""
        );
        (int128 dIn, int128 dOut) = inIsZero ? (d.amount0(), d.amount1()) : (d.amount1(), d.amount0());
        paid = uint256(uint128(-dIn));
        received = uint256(uint128(dOut));
    }

    function _checkRoute(address launchpad, PoolKey calldata ethPool, PoolKey calldata perpPool)
        private
        view
        returns (address perp, address mid)
    {
        perp = IPerpZapLaunchpad(launchpad).QUOTE();
        mid = ethPool.currency1;
        if (ethPool.currency0 != address(0) || mid == address(0) || mid == perp) revert BadRoute();
        if (
            !(perpPool.currency0 == mid && perpPool.currency1 == perp)
                && !(perpPool.currency0 == perp && perpPool.currency1 == mid)
        ) revert BadRoute();
    }

    function _approve(address token, address spender, uint256 amount) private {
        (bool ok, bytes memory ret) = token.call(abi.encodeCall(IPerpZapToken.approve, (spender, amount)));
        if (!ok || (ret.length != 0 && !abi.decode(ret, (bool)))) revert TransferFailed();
    }

    function _transfer(address token, address to, uint256 amount) private {
        (bool ok, bytes memory ret) = token.call(abi.encodeCall(IPerpZapToken.transfer, (to, amount)));
        if (!ok || (ret.length != 0 && !abi.decode(ret, (bool)))) revert TransferFailed();
    }

    function _transferFrom(address token, address from, address to, uint256 amount) private {
        (bool ok, bytes memory ret) = token.call(abi.encodeCall(IPerpZapToken.transferFrom, (from, to, amount)));
        if (!ok || (ret.length != 0 && !abi.decode(ret, (bool)))) revert TransferFailed();
    }

    function _sendEth(address to, uint256 amount) private {
        (bool ok,) = to.call{value: amount}("");
        if (!ok) revert TransferFailed();
    }
}
