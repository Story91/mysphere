// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import {FullMath} from "../lib/FullMath.sol";
import {LiquidityAmounts} from "../lib/LiquidityAmounts.sol";

/**
 * Plynnosc z calego QUOTE - w obu orientacjach puli.
 *
 * QUOTE jako currency0: dokladnie `LiquidityAmounts.getLiquidityForAmount0`
 * (cena biezaca -> gora przedzialu), bez zmian.
 *
 * QUOTE jako currency1: lustro. Currency1 siedzi w polowce [dol, cena biezaca],
 * wiec argumentami sa dolna granica i cena biezaca:
 *
 *     L = amount1 * 2^96 / (sqrtB - sqrtA)
 *
 * ZAOKRAGLENIE W DOL z tego samego powodu co dla amount0: wolajacym jest
 * protokol, mniejsze L znaczy, ze pula zazada MNIEJ QUOTE niz mamy. Pula liczy
 * z powrotem ceil(L * (sqrtB - sqrtA) / 2^96) <= amount1.
 *
 * Osobny plik, a nie nowa funkcja w `LiquidityAmounts`: tamten plik wchodzi do
 * metadanych bajtkodu wdrozonego `LiquidityVault`, a jego edycja utrudnilaby
 * weryfikacje juz wdrozonych kontraktow w eksploratorze.
 */
library QuoteLiquidityMath {
    error LiquidityOverflow();

    uint256 internal constant Q96 = 0x1000000000000000000000000;

    function getLiquidityForAmount1(uint160 sqrtA, uint160 sqrtB, uint256 amount1) internal pure returns (uint128) {
        if (sqrtA > sqrtB) (sqrtA, sqrtB) = (sqrtB, sqrtA);
        uint256 liquidity = FullMath.mulDivDown(amount1, Q96, uint256(sqrtB) - sqrtA);
        if (liquidity > type(uint128).max) revert LiquidityOverflow();
        return uint128(liquidity);
    }

    /** Pelna pozycja z calego QUOTE, w orientacji wynikajacej z klucza. */
    function liquidityForQuote(bool quoteIs0, uint160 sqrtPrice, uint160 sqrtLower, uint160 sqrtUpper, uint256 quoteAmount)
        internal
        pure
        returns (uint128)
    {
        return quoteIs0
            ? LiquidityAmounts.getLiquidityForAmount0(sqrtPrice, sqrtUpper, quoteAmount)
            : getLiquidityForAmount1(sqrtLower, sqrtPrice, quoteAmount);
    }
}
