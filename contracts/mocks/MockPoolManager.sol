// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import {
    IPoolManagerV4,
    IUnlockCallback,
    PoolKey,
    ModifyLiquidityParams,
    PoolStateReader
} from "../launchpad/interfaces/IPoolManagerV4.sol";
import {TickMath} from "../launchpad/lib/TickMath.sol";
import {FullMath} from "../launchpad/lib/FullMath.sol";

interface IMockToken {
    function transfer(address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

/**
 * Atrapa Uniswap v4 PoolManager.
 *
 * ===========================================================================
 * PO CO I - WAZNIEJSZE - CZEGO NIE DOWODZI
 * ===========================================================================
 * Awans to miejsce, przez ktore przechodza WSZYSTKIE pieniadze krzywej, wiec
 * musi dac sie go przejsc lokalnie choc raz, zanim ktokolwiek wlozy tam ETH.
 * Ale atrapa nie jest dowodem: prawdziwy PoolManager ma 24 kB kodu, wlasna
 * ksiegowosc tickow i wlasne zaokraglenia. Poziomem dowodu jest fork mainnetu
 * z PRAWDZIWYM PoolManagerem (i atrapa B20), potem Sepolia.
 *
 * Co ta atrapa odwzorowuje WIERNIE, bo od tego zalezy poprawnosc naszego kodu:
 *  1. UKLAD PAMIECI. `_pools` siedzi pod slotem 6, dokladnie jak w oryginale
 *     (Owned.owner=0, ProtocolFees=1..2, ERC6909=3..5, PoolManager._pools=6),
 *     a `extsload` czyta surowy slot. Dzieki temu wyprowadzenie slotu ceny
 *     w `PoolStateReader` jest naprawde testowane, a nie porownywane samo
 *     ze soba.
 *  2. ZAOKRAGLENIA `getAmount0Delta` / `getAmount1Delta` - W GORE, na korzysc
 *     puli. To jest ta strona, ktora decyduje, czy `owed0 <= eLp`.
 *  3. Semantyke `unlock`: na koniec wszystkie salda musza byc wyzerowane,
 *     inaczej rewert. Bez tego test "settle dziala" niczego by nie sprawdzal.
 *  4. `initialize` odbija sie od puli, ktora juz istnieje, a puste pule DAJA
 *     SIE przesunac cenowo (`poisonPrice`) - bo tak jest naprawde: swap
 *     w puli bez plynnosci konsumuje zero wejscia i idzie do limitu ceny.
 *
 * Czego atrapa NIE ma: prawdziwej ksiegowosci tickow, swapow, hookow, oplat
 * protokolu, ERC-6909. Narosle oplaty LP sa TU WSTRZYKIWANE przez
 * `setPendingFees`, bo bez swapow nie ma z czego im narosnac.
 */
contract MockPoolManager is IPoolManagerV4 {
    /* ---------------------------------------------------------------------- */
    /*  UKLAD PAMIECI - ODWZOROWANY, NIE PRZYPADKOWY                           */
    /* ---------------------------------------------------------------------- */

    mapping(address => mapping(address => bool)) private _pad0_isOperator; // slot 0
    mapping(address => mapping(uint256 => uint256)) private _pad1_balanceOf; // slot 1
    mapping(address => mapping(address => mapping(uint256 => uint256))) private _pad2_allowance; // slot 2
    address private _pad3_owner; // slot 3
    mapping(address => uint256) private _pad4_protocolFeesAccrued; // slot 4
    address private _pad5_protocolFeeController; // slot 5

    /**
     * Odpowiednik `mapping(PoolId => Pool.State) _pools`. Wartoscia jest
     * spakowany Slot0: [24 puste | 24 lpFee | 24 protocolFee | 24 tick |
     * 160 sqrtPriceX96]. Reszta struktury Pool.State nas nie interesuje,
     * bo czytamy wylacznie offset 0.
     */
    mapping(bytes32 => uint256) private _pools; // slot 6

    /* ---------------------------------------------------------------------- */
    /*  STAN POMOCNICZY ATRAPY (za slotem 6, wiec nie psuje wyprowadzenia)     */
    /* ---------------------------------------------------------------------- */

    mapping(bytes32 => uint128) public liquidityOf;
    mapping(bytes32 => uint128) public pendingFee0;
    mapping(bytes32 => uint128) public pendingFee1;

    bool private _unlocked;
    /** Salda biezacego `unlock`. Ujemne = wolajacy jest winien puli. */
    int256 private _delta0;
    int256 private _delta1;
    address private _syncedToken;
    uint256 private _syncedReserve;

    error AlreadyUnlocked();
    error NotUnlocked();
    error PoolAlreadyInitialized();
    error PoolNotInitialized();
    error CurrencyNotSettled();
    error TickMisaligned();

    event Initialize(bytes32 indexed poolId, uint160 sqrtPriceX96);
    event ModifyLiquidity(bytes32 indexed poolId, int256 liquidityDelta);

    receive() external payable {}

    /* ---------------------------------------------------------------------- */
    /*  ODCZYT SUROWEGO SLOTU                                                  */
    /* ---------------------------------------------------------------------- */

    function extsload(bytes32 slot) external view returns (bytes32 value) {
        assembly {
            value := sload(slot)
        }
    }

    /* ---------------------------------------------------------------------- */
    /*  INICJALIZACJA                                                          */
    /* ---------------------------------------------------------------------- */

    function initialize(PoolKey memory key, uint160 sqrtPriceX96) external returns (int24) {
        bytes32 id = PoolStateReader.poolId(key);
        if (_pools[id] != 0) revert PoolAlreadyInitialized();
        _pools[id] = uint256(sqrtPriceX96);
        emit Initialize(id, sqrtPriceX96);
        return 0;
    }

    /**
     * Przesuwa cene PUSTEJ puli - tak jak zrobilby to napastnik swapem.
     *
     * Nie jest to uproszczenie atrapy: w v4 swap w puli o zerowej plynnosci
     * przechodzi kolejne slowa bitmapy tickow, konsumuje zero wejscia i konczy
     * na zadanym limicie ceny. Kosztuje wiec tylko gaz. Dokladnie dlatego
     * `graduate()` sprawdza cene co do bitu tuz przed zasileniem.
     */
    function poisonPrice(PoolKey memory key, uint160 sqrtPriceX96) external {
        bytes32 id = PoolStateReader.poolId(key);
        if (_pools[id] == 0) revert PoolNotInitialized();
        _pools[id] = uint256(sqrtPriceX96);
    }

    function setPendingFees(PoolKey memory key, uint128 fee0, uint128 fee1) external {
        bytes32 id = PoolStateReader.poolId(key);
        pendingFee0[id] = fee0;
        pendingFee1[id] = fee1;
    }

    /* ---------------------------------------------------------------------- */
    /*  UNLOCK                                                                 */
    /* ---------------------------------------------------------------------- */

    function unlock(bytes calldata data) external returns (bytes memory result) {
        if (_unlocked) revert AlreadyUnlocked();
        _unlocked = true;
        _delta0 = 0;
        _delta1 = 0;

        result = IUnlockCallback(msg.sender).unlockCallback(data);

        // Bez tego warunku test "settle dziala" nie sprawdzalby niczego.
        if (_delta0 != 0 || _delta1 != 0) revert CurrencyNotSettled();
        _unlocked = false;
        _syncedToken = address(0);
        _syncedReserve = 0;
    }

    function modifyLiquidity(PoolKey memory key, ModifyLiquidityParams memory params, bytes calldata)
        external
        returns (int256 callerDelta, int256 feesAccrued)
    {
        if (!_unlocked) revert NotUnlocked();
        bytes32 id = PoolStateReader.poolId(key);
        uint160 sqrtP = uint160(_pools[id]);
        if (sqrtP == 0) revert PoolNotInitialized();

        // Prawdziwy PoolManager odrzuca granice nie lezace na siatce puli.
        if (params.tickLower % key.tickSpacing != 0 || params.tickUpper % key.tickSpacing != 0) {
            revert TickMisaligned();
        }

        int128 amt0;
        int128 amt1;

        if (params.liquidityDelta > 0) {
            uint128 L = uint128(uint256(params.liquidityDelta));
            uint160 sqrtLower = TickMath.getSqrtPriceAtTick(params.tickLower);
            uint160 sqrtUpper = TickMath.getSqrtPriceAtTick(params.tickUpper);

            // Cena biezaca lezy w przedziale, wiec pozycja pobiera obie strony.
            // ZAOKRAGLENIE W GORE - pula nigdy nie bierze mniej, niz jej sie nalezy.
            uint256 owed0 = _amount0Delta(sqrtP, sqrtUpper, L);
            uint256 owed1 = _amount1Delta(sqrtLower, sqrtP, L);

            liquidityOf[id] += L;
            amt0 = -int128(int256(owed0));
            amt1 = -int128(int256(owed1));
        } else {
            // Delta 0 (i tylko taka - atrapa nie obsluguje ujemnej, bo produkcja
            // nie ma sciezki, ktora by ja podala): same narosle oplaty.
            require(params.liquidityDelta == 0, "mock: no removal");
            amt0 = int128(int256(uint256(pendingFee0[id])));
            amt1 = int128(int256(uint256(pendingFee1[id])));
            pendingFee0[id] = 0;
            pendingFee1[id] = 0;
        }

        _delta0 += amt0;
        _delta1 += amt1;

        callerDelta = (int256(amt0) << 128) | (int256(uint256(uint128(amt1))));
        feesAccrued = params.liquidityDelta == 0 ? callerDelta : int256(0);
        emit ModifyLiquidity(id, params.liquidityDelta);
    }

    /* ---------------------------------------------------------------------- */
    /*  ROZLICZENIE                                                            */
    /* ---------------------------------------------------------------------- */

    function settle() external payable returns (uint256 paid) {
        if (!_unlocked) revert NotUnlocked();
        if (msg.value != 0) {
            _delta0 += int256(msg.value);
            return msg.value;
        }
        // Token: ksiegujemy PRZYROST salda od czasu `sync`. Tak samo jak
        // oryginal - i dlatego kolejnosc sync -> transfer -> settle ma znaczenie.
        uint256 balance = IMockToken(_syncedToken).balanceOf(address(this));
        paid = balance - _syncedReserve;
        _delta1 += int256(paid);
        _syncedReserve = balance;
    }

    function sync(address currency) external {
        if (currency == address(0)) {
            _syncedToken = address(0);
            _syncedReserve = 0;
            return;
        }
        _syncedToken = currency;
        _syncedReserve = IMockToken(currency).balanceOf(address(this));
    }

    function take(address currency, address to, uint256 amount) external {
        if (!_unlocked) revert NotUnlocked();
        if (currency == address(0)) {
            _delta0 -= int256(amount);
            (bool ok,) = to.call{value: amount}("");
            require(ok, "mock: eth");
        } else {
            _delta1 -= int256(amount);
            require(IMockToken(currency).transfer(to, amount), "mock: token");
        }
    }

    /* ---------------------------------------------------------------------- */
    /*  ARYTMETYKA POZYCJI - ZAOKRAGLENIA JAK W ORYGINALE                      */
    /* ---------------------------------------------------------------------- */

    /** amount0 = ceil( L * 2^96 * (sqrtB - sqrtA) / (sqrtB * sqrtA) ) */
    function _amount0Delta(uint160 sqrtA, uint160 sqrtB, uint128 L) private pure returns (uint256) {
        if (sqrtA > sqrtB) (sqrtA, sqrtB) = (sqrtB, sqrtA);
        uint256 numerator1 = uint256(L) << 96;
        uint256 numerator2 = uint256(sqrtB) - sqrtA;
        uint256 inner = FullMath.mulDivUp(numerator1, numerator2, sqrtB);
        // dzielenie w gore
        return (inner + sqrtA - 1) / sqrtA;
    }

    /** amount1 = ceil( L * (sqrtB - sqrtA) / 2^96 ) */
    function _amount1Delta(uint160 sqrtA, uint160 sqrtB, uint128 L) private pure returns (uint256) {
        if (sqrtA > sqrtB) (sqrtA, sqrtB) = (sqrtB, sqrtA);
        return FullMath.mulDivUp(L, uint256(sqrtB) - sqrtA, 1 << 96);
    }
}
