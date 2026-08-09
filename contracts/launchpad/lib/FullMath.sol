// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

/**
 * FullMath - mnozenie z dzieleniem przez posrednika 512-bitowego.
 *
 * ===========================================================================
 * PO CO TO TUTAJ, A NIE Z NPM
 * ===========================================================================
 * Reszta tego repo (AskEscrow, MemoPay) nie importuje NICZEGO z zewnatrz -
 * zeby to, co czyta audytor, bylo calym kodem, ktory sie wykona. Krzywa liczy
 * `tokenReserve * ethIn / (R + ethIn)`, gdzie licznik siega 1e27 * 1e20 = 1e47.
 * To nie przepelnia uint256, ale margines jest funkcja tego, ile ETH ktos
 * wysle - czyli wielkosci, ktorej NIE kontrolujemy. Posrednik 512-bitowy
 * zdejmuje ten warunek z listy rzeczy, ktore trzeba pilnowac gdzie indziej.
 *
 * ===========================================================================
 * DLACZEGO DWIE FUNKCJE, A NIE JEDNA Z PARAMETREM `Rounding`
 * ===========================================================================
 * Kierunek zaokraglenia jest tu regula bezpieczenstwa, nie szczegolem: kazde
 * zaokraglenie ma isc na niekorzysc wolajacego, nigdy puli. Enum w argumencie
 * da sie pomylic bez sladu w kodzie wolajacym; `mulDivUp` vs `mulDivDown`
 * widac w KAZDYM miejscu uzycia i widac w diffie, gdy ktos to zmieni.
 *
 * Algorytm: klasyczne 512/256 Remco Bloemena (Uniswap v3 FullMath), przepisane
 * na 0.8 z jawnym `unchecked` tam, gdzie nadmiar jest czescia metody.
 */
library FullMath {
    /** Dzielnik zerowy albo wynik nie miesci sie w uint256. */
    error MulDivFailed();

    /**
     * floor(a * b / denominator), pelna dokladnosc posrednia.
     *
     * Zaokraglenie W DOL - uzywane tam, gdzie mniejszy wynik jest gorszy dla
     * wolajacego: tokeny wydane przy kupnie, ETH wyplacone przy sprzedazy,
     * plynnosc wyliczana z ETH.
     */
    function mulDivDown(uint256 a, uint256 b, uint256 denominator) internal pure returns (uint256 result) {
        unchecked {
            // Iloczyn 512-bitowy jako para (prod1, prod0) = a * b.
            uint256 prod0;
            uint256 prod1;
            assembly {
                let mm := mulmod(a, b, not(0))
                prod0 := mul(a, b)
                prod1 := sub(sub(mm, prod0), lt(mm, prod0))
            }

            // Sciezka szybka: iloczyn miesci sie w 256 bitach.
            if (prod1 == 0) {
                // `div` w assembly przy zerze zwraca 0 zamiast rewertowac,
                // wiec dzielnik trzeba sprawdzic samemu.
                if (denominator == 0) revert MulDivFailed();
                assembly {
                    result := div(prod0, denominator)
                }
                return result;
            }

            // Wynik musi zmiescic sie w uint256; to zamyka takze denominator == 0.
            if (denominator <= prod1) revert MulDivFailed();

            // Odejmujemy reszte, zeby iloczyn stal sie podzielny przez dzielnik.
            uint256 remainder;
            assembly {
                remainder := mulmod(a, b, denominator)
                prod1 := sub(prod1, gt(remainder, prod0))
                prod0 := sub(prod0, remainder)
            }

            // Wyciagamy potegi dwojki z dzielnika - reszta jest nieparzysta,
            // wiec ma odwrotnosc modulo 2^256.
            uint256 twos = denominator & (0 - denominator);
            assembly {
                denominator := div(denominator, twos)
                prod0 := div(prod0, twos)
                twos := add(div(sub(0, twos), twos), 1)
            }
            prod0 |= prod1 * twos;

            // Newton-Raphson: kazda iteracja podwaja liczbe poprawnych bitow,
            // start ma 4 bity, szesc iteracji daje 256.
            uint256 inv = (3 * denominator) ^ 2;
            inv *= 2 - denominator * inv;
            inv *= 2 - denominator * inv;
            inv *= 2 - denominator * inv;
            inv *= 2 - denominator * inv;
            inv *= 2 - denominator * inv;
            inv *= 2 - denominator * inv;

            result = prod0 * inv;
        }
    }

    /**
     * ceil(a * b / denominator).
     *
     * Zaokraglenie W GORE - uzywane tam, gdzie wiekszy wynik jest gorszy dla
     * wolajacego: oplata, oraz ETH wymagane przy dociagnieciu ostatniego kupna
     * do progu.
     */
    function mulDivUp(uint256 a, uint256 b, uint256 denominator) internal pure returns (uint256 result) {
        result = mulDivDown(a, b, denominator);
        // mulDivDown juz odrzucil denominator == 0, wiec mulmod jest tu bezpieczne.
        if (mulmod(a, b, denominator) != 0) {
            if (result == type(uint256).max) revert MulDivFailed();
            unchecked {
                result += 1;
            }
        }
    }
}
