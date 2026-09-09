// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

/**
 * DerivMath - JEDNO miejsce, w ktorym zyja przeliczniki skal.
 *
 * W calym module derywatow obowiazuja dokladnie trzy jednostki:
 *
 *   WAD   1e18  - cena w USD, wielkosc pozycji (jednostki bazowe), KAZDA
 *                 wewnetrzna kwota USD (margin, notional, PnL, funding).
 *   USDC  1e6   - realny token ERC-20 USDC. Wystepuje WYLACZNIE na granicy:
 *                 `transferFrom` przy wplacie i `transfer` przy wyplacie.
 *   BPS   1e4   - stawki oplat.
 *
 * Uwaga na Arc: jednostka natywna (gaz, msg.value) to takze USDC, ale
 * z 18 miejscami. Ten modul NIE dotyka jednostki natywnej ani razu - caly
 * kolateral chodzi przez ERC-20 z SZESCIOMA miejscami. Jesli kiedys pojawi sie
 * tu `msg.value`, to jest blad, a nie funkcja.
 *
 * Kierunek zaokraglen: wplata w gore po stronie uzytkownika nie istnieje
 * (przyjmujemy dokladnie tyle, ile przyszlo), wyplata w dol - reszta ponizej
 * 1e-6 USDC zostaje w kontrakcie zamiast wypisywac zobowiazanie, ktorego
 * nie da sie przelac.
 */
library DerivMath {
    uint256 internal constant WAD = 1e18;
    uint256 internal constant BPS = 10_000;

    /** 1e18 / 1e6. Jedyna liczba, ktora zamienia jedna skale USD w druga. */
    uint256 internal constant USDC_TO_WAD = 1e12;

    error NegativeToUint();

    /** USDC (6 miejsc) -> WAD. Bezstratne, mnozenie. */
    function usdcToWad(uint256 usdcAmount) internal pure returns (uint256) {
        return usdcAmount * USDC_TO_WAD;
    }

    /** WAD -> USDC (6 miejsc), W DOL. Reszta zostaje w kontrakcie. */
    function wadToUsdc(uint256 wadAmount) internal pure returns (uint256) {
        return wadAmount / USDC_TO_WAD;
    }

    /** a * b / 1e18 w dol. */
    function mulWad(uint256 a, uint256 b) internal pure returns (uint256) {
        return (a * b) / WAD;
    }

    /** a * 1e18 / b w dol. */
    function divWad(uint256 a, uint256 b) internal pure returns (uint256) {
        return (a * WAD) / b;
    }

    /** Wersja ze znakiem - funding i PnL sa ujemne rownie czesto jak dodatnie. */
    function mulWadInt(int256 a, int256 b) internal pure returns (int256) {
        return (a * b) / int256(WAD);
    }

    function abs(int256 x) internal pure returns (uint256) {
        return x >= 0 ? uint256(x) : uint256(-x);
    }

    function toUint(int256 x) internal pure returns (uint256) {
        if (x < 0) revert NegativeToUint();
        return uint256(x);
    }

    /**
     * Cena z Chainlinka (zwykle 8 miejsc) sprowadzona do WAD.
     * Feed z wieksza liczba miejsc niz 18 nie istnieje w praktyce, ale
     * dzielenie jest tu i tak, zeby brak przypadku nie byl zalozeniem.
     */
    function scalePriceToWad(int256 answer, uint8 feedDecimals) internal pure returns (uint256) {
        if (answer <= 0) revert NegativeToUint();
        uint256 p = uint256(answer);
        if (feedDecimals == 18) return p;
        if (feedDecimals < 18) return p * (10 ** (18 - feedDecimals));
        return p / (10 ** (feedDecimals - 18));
    }
}
