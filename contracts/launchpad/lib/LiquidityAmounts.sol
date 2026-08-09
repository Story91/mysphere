// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import {FullMath} from "./FullMath.sol";

/**
 * Przeliczenie "ile ETH kupuje ile plynnosci" - jedna funkcja, ta jedna, ktorej
 * uzywamy przy awansie.
 *
 * ===========================================================================
 * DLACZEGO STRONA WIAZACA JEST ETH, A NIE TOKEN
 * ===========================================================================
 * Do puli wchodzi CALE zebrane ETH (poza pylem rzedu wei), a token jest luzem:
 * ile go trzeba, tyle idzie, reszta na adres martwy. Odwrotny wybor - wiazac
 * po tokenie - zostawilby w vaulcie ETH, ktorego nie da sie ani wlozyc do puli,
 * ani wyjac (nie ma takiej funkcji), czyli ETH uzytkownikow zamrozone bez celu.
 *
 * ===========================================================================
 * DLACZEGO ARGUMENTEM JEST CENA BIEZACA, A NIE DOLNA GRANICA
 * ===========================================================================
 * Specyfikacja pisala `getLiquidityForAmount0(sqrtLower, sqrtUpper, eLp)`.
 * To jest blad i zostal poprawiony. Wzor Uniswapa dziala dla podprzedzialu,
 * w ktorym pozycja sklada sie WYLACZNIE z token0. Nasza pozycja obejmuje cene
 * biezaca, wiec ETH siedzi tylko w polowce [cena biezaca, gora]; podstawienie
 * dolnej granicy zaniza L o kilkanascie rzedow wielkosci i do puli poszedlby
 * pyl zamiast 2.9 ETH.
 */
library LiquidityAmounts {
    error LiquidityOverflow();

    uint256 internal constant Q96 = 0x1000000000000000000000000;

    /**
     * L = amount0 * (sqrtA * sqrtB / 2^96) / (sqrtB - sqrtA)
     *
     * ZAOKRAGLENIE W DOL, dwukrotnie. Kierunek jest tu wyjatkiem od reguly
     * "na niekorzysc wolajacego", bo wolajacym jest sam protokol: mniejsze L
     * znaczy, ze pula zazada MNIEJ ETH niz mamy, a nie wiecej. To domyka
     * `owed0 <= eLp` bez zadnej dodatkowej asercji: L <= eLp * X, a pula liczy
     * z powrotem ceil(L / X) <= eLp.
     */
    function getLiquidityForAmount0(uint160 sqrtA, uint160 sqrtB, uint256 amount0)
        internal
        pure
        returns (uint128)
    {
        if (sqrtA > sqrtB) (sqrtA, sqrtB) = (sqrtB, sqrtA);
        uint256 intermediate = FullMath.mulDivDown(sqrtA, sqrtB, Q96);
        uint256 liquidity = FullMath.mulDivDown(amount0, intermediate, uint256(sqrtB) - sqrtA);
        // v4 trzyma plynnosc w uint128; przepelnienie nie ma prawa wystapic przy
        // 2.9 ETH, ale cichy cast obcinajacy dawalby pozycje o innym rozmiarze
        // niz policzona - a to jest dokladnie ta klasa bledu, ktora kosztuje cala pule.
        if (liquidity > type(uint128).max) revert LiquidityOverflow();
        return uint128(liquidity);
    }
}
