// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

/**
 * Podzbior Uniswap v4, ktorego naprawde uzywamy - i nic ponad to.
 *
 * ===========================================================================
 * DLACZEGO PODZBIOR, A NIE IMPORT `@uniswap/v4-core`
 * ===========================================================================
 * Ta sama zasada, co w AskEscrow i MemoPay: zero zaleznosci z npm. Pelny
 * `IPoolManager` niesie kilkanascie funkcji, z ktorych uzywamy szesciu, plus
 * typy `Currency`, `IHooks`, `BalanceDelta`, `PoolId` - wszystkie to opakowania
 * na `address` / `int256` / `bytes32`, wiec ABI jest identyczne, a czytelnosc
 * dla audytora wyzsza, gdy w sygnaturze stoi `address`.
 *
 * Ksztalt kazdej z tych funkcji zostal potwierdzony PRZEBIEGIEM na Base
 * mainnet (raport integracyjny, sekcja 4): initialize -> unlock ->
 * modifyLiquidity -> settle/sync -> take. To nie jest przepisane z dokumentacji.
 *
 * ===========================================================================
 * BalanceDelta JAKO int256
 * ===========================================================================
 * v4 pakuje dwie liczby int128 w jedno slowo: amount0 w gornych 128 bitach,
 * amount1 w dolnych. Rozpakowanie robimy sami (patrz `BalanceDeltaLib`), zeby
 * nie ciagnac typu zdefiniowanego przez uzytkownika tylko po to, zeby zaraz go
 * rozlozyc. Znak: WARTOSC UJEMNA znaczy "jestesmy winni pule", dodatnia -
 * "pula jest winna nam".
 */

/**
 * Klucz puli. Kolejnosc pol jest czescia ABI - poolId to keccak256 tej
 * struktury, wiec przestawienie pol daje inna pule, nie blad kompilacji.
 *
 * U nas ZAWSZE: currency0 = address(0) (natywne ETH), currency1 = token B20,
 * hooks = address(0). Kolejnosc walut jest deterministyczna, bo adres B20
 * zaczyna sie od 0xb2, wiec zawsze przebija adres zerowy.
 */
struct PoolKey {
    address currency0;
    address currency1;
    uint24 fee;
    int24 tickSpacing;
    address hooks;
}

struct ModifyLiquidityParams {
    int24 tickLower;
    int24 tickUpper;
    /** Ujemna wartosc wyjmuje plynnosc. Patrz LiquidityVault - u nas nie ma sciezki, ktora moze ja podac. */
    int256 liquidityDelta;
    bytes32 salt;
}

/**
 * Parametry wymiany. Nie wolamy `swap` ani razu - ta struktura istnieje po to,
 * zeby hook mogl przeczytac, o co chodzilo w wymianie, ktora wlasnie przeszla.
 *
 * ZNAK `amountSpecified` JEST TU CALA TRESCIA:
 *   < 0  wolajacy podal WEJSCIE  ("mam tyle ETH, daj ile wyjdzie")
 *   > 0  wolajacy podal WYJSCIE  ("chce tyle tokena, wezmij ile trzeba")
 * Ktora waluta jest "podana", a ktora "niepodana", zalezy wiec od znaku
 * ORAZ od kierunku - rozstrzyga to `B20LaunchHook._unspecifiedIsCurrency1`.
 */
struct SwapParams {
    bool zeroForOne;
    int256 amountSpecified;
    uint160 sqrtPriceLimitX96;
}

interface IPoolManagerV4 {
    /** Rewertuje `PoolAlreadyInitialized`, jesli ktos byl tu przed nami. */
    function initialize(PoolKey memory key, uint160 sqrtPriceX96) external returns (int24 tick);

    /** Oddaje sterowanie do `unlockCallback` wolajacego; po powrocie wszystkie salda musza byc zerowe. */
    function unlock(bytes calldata data) external returns (bytes memory);

    function modifyLiquidity(
        PoolKey memory key,
        ModifyLiquidityParams memory params,
        bytes calldata hookData
    ) external returns (int256 callerDelta, int256 feesAccrued);

    /**
     * Wymiana. NASZ kod produkcyjny nie wola tego ani razu - deklaracja istnieje
     * dla sondy testowej, ktora musi wykonac prawdziwa wymiane na forku, zeby
     * zmierzyc zachowanie hooka.
     *
     * Zwracana delta jest JUZ PO korekcie hooka: PoolManager oddaje `afterSwap`
     * sterowanie, bierze od niego poprawke i dopiero potem ksieguje wynik
     * wolajacemu. Wolajacy rozlicza sie wiec dokladnie z tego, co tu wraca.
     */
    function swap(PoolKey memory key, SwapParams memory params, bytes calldata hookData)
        external
        returns (int256 swapDelta);

    /** Natywne ETH placi sie tu wartoscia wywolania; token - przez sync + transfer + settle(). */
    function settle() external payable returns (uint256 paid);

    /** Dla tokena MUSI byc zawolane PRZED transferem; dla natywnego ETH jest zbedne. */
    function sync(address currency) external;

    function take(address currency, address to, uint256 amount) external;

    /** Surowy odczyt slotu. Uzywamy do przeczytania ceny puli bez zaleznosci od peryferii. */
    function extsload(bytes32 slot) external view returns (bytes32);
}

interface IUnlockCallback {
    function unlockCallback(bytes calldata data) external returns (bytes memory);
}

/** Rozpakowanie spakowanej pary int128. */
library BalanceDeltaLib {
    function amount0(int256 delta) internal pure returns (int128) {
        // Przesuniecie arytmetyczne zachowuje znak gornej polowki.
        return int128(delta >> 128);
    }

    function amount1(int256 delta) internal pure returns (int128) {
        // Obciecie do 128 bitow z reinterpretacja znaku - odpowiednik signextend(15, x).
        return int128(delta);
    }
}

/**
 * Odczyt ceny puli prosto ze stanu PoolManagera.
 *
 * ===========================================================================
 * DLACZEGO extsload, A NIE KONTRAKT `StateView`
 * ===========================================================================
 * `StateView` to kolejny adres do zaufania i kolejna rzecz, ktora moze zostac
 * wdrozona inaczej na innej sieci. `extsload` jest czescia samego
 * PoolManagera, ktoremu i tak powierzamy cala plynnosc.
 *
 * Cena tego wyboru jest jedna i trzeba ja nazwac: numer slotu `_pools` (6) to
 * SZCZEGOL UKLADU PAMIECI PoolManagera, a nie czesc jego ABI. Wyliczony jest
 * z kolejnosci dziedziczenia (Owned.owner=0, ProtocolFees=1..2, ERC6909=3..5,
 * PoolManager._pools=6) i zgadza sie ze stala `POOLS_SLOT` z `StateLibrary`.
 *
 * Zeby to nie bylo zalozenie, `CurveLaunchpad.launch` czyta cene ZARAZ PO
 * WLASNYM `initialize` i rewertuje, jesli nie widzi tam ceny, ktora sam
 * przed chwila ustawil. Bledne wyprowadzenie slotu wywala wiec PIERWSZY start
 * na testnecie, a nie awans po zebraniu cudzych pieniedzy.
 */
library PoolStateReader {
    uint256 internal constant POOLS_SLOT = 6;

    function poolId(PoolKey memory key) internal pure returns (bytes32) {
        return keccak256(abi.encode(key));
    }

    function sqrtPriceX96(address poolManager, PoolKey memory key) internal view returns (uint160) {
        bytes32 stateSlot = keccak256(abi.encodePacked(poolId(key), POOLS_SLOT));
        // Slot0 pakuje: [24 puste | 24 lpFee | 24 protocolFee | 24 tick | 160 sqrtPriceX96].
        // Cena siedzi w DOLNYCH 160 bitach, wiec zwykle obciecie wystarczy.
        return uint160(uint256(IPoolManagerV4(poolManager).extsload(stateSlot)));
    }
}
