// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

/**
 * TickMath - jedna funkcja z biblioteki tickow Uniswapa: cena z numeru ticka.
 *
 * ===========================================================================
 * PO CO NAM TO
 * ===========================================================================
 * Pozycja LP jest PELNOZAKRESOWA, ale "pelny zakres" nie jest jedna liczba -
 * granice trzeba wyrownac do `tickSpacing` puli, a `tickSpacing` rozni sie
 * miedzy czterema warstwami oplat (200 / 60 / 10 / 1). Zeby policzyc, ile
 * plynnosci kupuje nasze ETH, potrzebujemy `sqrtPriceX96` GORNEJ granicy.
 *
 * Alternatywa byla wpisanie czterech stalych z palca. Odrzucona: literowka
 * w jednej z nich nie rewertuje, tylko cicho zmienia stosunek zasilenia puli,
 * czyli oddaje pieniadze pierwszemu handlujacemu. Funkcja liczy to samo, co
 * PoolManager, i da sie ja porownac z oryginalem linia po linii.
 *
 * DOLNA granica NIE jest tu potrzebna: strona wiazaca jest ETH (currency0),
 * a ilosc ETH w pozycji zalezy wylacznie od przedzialu [cena biezaca, gora].
 *
 * ===========================================================================
 * ZRODLO
 * ===========================================================================
 * Przepisane z `Uniswap/v4-core/src/libraries/TickMath.sol` (identyczne stale
 * co v3). Nazwa `getSqrtPriceAtTick` jest ta z v4. Zmiany wobec oryginalu:
 * jawne `unchecked` i wlasny blad zamiast `require` z napisem - reszta bit
 * w bit taka sama, celowo, zeby porownanie z upstreamem bylo mechaniczne.
 */
library TickMath {
    error InvalidTick();

    /** Skrajne ticki v4. Poza nimi cena nie miesci sie w uint160. */
    int24 internal constant MIN_TICK = -887272;
    int24 internal constant MAX_TICK = 887272;

    /**
     * sqrt(1.0001^tick) * 2^96.
     *
     * Metoda: tick rozbity na bity, kazdy bit to jeden staly czynnik
     * w Q128.128; iloczyn tych czynnikow to sqrt(1.0001^|tick|). Dla dodatnich
     * tickow bierzemy odwrotnosc, bo stale sa policzone dla ujemnych.
     */
    function getSqrtPriceAtTick(int24 tick) internal pure returns (uint160 sqrtPriceX96) {
        unchecked {
            uint256 absTick = tick < 0 ? uint256(-int256(tick)) : uint256(int256(tick));
            if (absTick > uint256(int256(MAX_TICK))) revert InvalidTick();

            uint256 ratio = absTick & 0x1 != 0
                ? 0xfffcb933bd6fad37aa2d162d1a594001
                : 0x100000000000000000000000000000000;
            if (absTick & 0x2 != 0) ratio = (ratio * 0xfff97272373d413259a46990580e213a) >> 128;
            if (absTick & 0x4 != 0) ratio = (ratio * 0xfff2e50f5f656932ef12357cf3c7fdcc) >> 128;
            if (absTick & 0x8 != 0) ratio = (ratio * 0xffe5caca7e10e4e61c3624eaa0941cd0) >> 128;
            if (absTick & 0x10 != 0) ratio = (ratio * 0xffcb9843d60f6159c9db58835c926644) >> 128;
            if (absTick & 0x20 != 0) ratio = (ratio * 0xff973b41fa98c081472e6896dfb254c0) >> 128;
            if (absTick & 0x40 != 0) ratio = (ratio * 0xff2ea16466c96a3843ec78b326b52861) >> 128;
            if (absTick & 0x80 != 0) ratio = (ratio * 0xfe5dee046a99a2a811c461f1969c3053) >> 128;
            if (absTick & 0x100 != 0) ratio = (ratio * 0xfcbe86c7900a88aedcffc83b479aa3a4) >> 128;
            if (absTick & 0x200 != 0) ratio = (ratio * 0xf987a7253ac413176f2b074cf7815e54) >> 128;
            if (absTick & 0x400 != 0) ratio = (ratio * 0xf3392b0822b70005940c7a398e4b70f3) >> 128;
            if (absTick & 0x800 != 0) ratio = (ratio * 0xe7159475a2c29b7443b29c7fa6e889d9) >> 128;
            if (absTick & 0x1000 != 0) ratio = (ratio * 0xd097f3bdfd2022b8845ad8f792aa5825) >> 128;
            if (absTick & 0x2000 != 0) ratio = (ratio * 0xa9f746462d870fdf8a65dc1f90e061e5) >> 128;
            if (absTick & 0x4000 != 0) ratio = (ratio * 0x70d869a156d2a1b890bb3df62baf32f7) >> 128;
            if (absTick & 0x8000 != 0) ratio = (ratio * 0x31be135f97d08fd981231505542fcfa6) >> 128;
            if (absTick & 0x10000 != 0) ratio = (ratio * 0x9aa508b5b7a84e1c677de54f3e99bc9) >> 128;
            if (absTick & 0x20000 != 0) ratio = (ratio * 0x5d6af8dedb81196699c329225ee604) >> 128;
            if (absTick & 0x40000 != 0) ratio = (ratio * 0x2216e584f5fa1ea926041bedfe98) >> 128;
            if (absTick & 0x80000 != 0) ratio = (ratio * 0x48a170391f7dc42444e8fa2) >> 128;

            if (tick > 0) ratio = type(uint256).max / ratio;

            // Q128.128 -> Q64.96 z zaokragleniem W GORE. Kierunek jest tu
            // ODWROTNY niz w reszcie kontraktow i to jest celowe: to nie jest
            // kwota nikogo, tylko granica przedzialu. Zaokraglenie w gore
            // gwarantuje, ze `getTickAtSqrtPrice(getSqrtPriceAtTick(t)) == t`,
            // czyli ze granica nie osuwa sie o jeden tick w dol.
            sqrtPriceX96 = uint160((ratio >> 32) + (ratio % (1 << 32) == 0 ? 0 : 1));
        }
    }
}
