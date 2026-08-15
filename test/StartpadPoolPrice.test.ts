export {};

const { expect } = require('chai');
const { poolPriceWeiFromSqrt, hasPool } = require('../app/startpad/[address]/poolPrice');

/**
 * CENA Z PULI PO GRADUACJI.
 *
 * Po graduacji `spotPriceWeiPerToken` rewertuje, wiec strona tokena
 * zatrzymywala sie na ostatniej cenie krzywej, a wykres konczyl sie w tym samym
 * miejscu. Akurat te tokeny, ktorym sie udalo, wygladaly na martwe.
 *
 * `sqrtPriceX96` koduje pierwiastek ceny `amount1/amount0` w jednostkach
 * surowych. `LiquidityVault` tworzy pule z `currency0 = address(0)` (natywny
 * ETH) i `currency1 = token`, i sprawdza to przy seedowaniu, wiec token jest
 * ZAWSZE currency1 i kolejnosci nie trzeba zgadywac.
 */

/** sqrt(cena) * 2^96 dla ceny podanej jako surowe tokeny za jedno wei. */
const sqrtX96 = (rawPrice: number) => BigInt(Math.round(Math.sqrt(rawPrice) * 2 ** 96));

describe('poolPriceWeiFromSqrt', () => {
  it('cena 1:1 to jeden ETH za token', () => {
    // rawPrice = 1 surowy token za 1 wei, oba po 18 miejsc -> 1e18 wei za token.
    const price = poolPriceWeiFromSqrt(sqrtX96(1), 18);

    expect(price).to.equal(10n ** 18n);
  });

  it('miliard surowych tokenow za wei to nanoETH za token - skala krzywej', () => {
    // Tak wyglada realna cena tokena z launchpada: rzedu 1e-9 ETH.
    const price = poolPriceWeiFromSqrt(sqrtX96(1e9), 18);

    // 1e18 / 1e9 = 1e9 wei = 0,000000001 ETH.
    const asEth = Number(price) / 1e18;
    expect(asEth).to.be.greaterThan(0.9e-9);
    expect(asEth).to.be.lessThan(1.1e-9);
  });

  it('mniej surowych tokenow za wei znaczy DROZSZY token', () => {
    const tanszy = poolPriceWeiFromSqrt(sqrtX96(1e9), 18);
    const drozszy = poolPriceWeiFromSqrt(sqrtX96(1e8), 18);

    expect(drozszy > tanszy).to.equal(true);
  });

  it('token o innej liczbie miejsc dziesietnych nie przesuwa ceny o rzedy wielkosci', () => {
    // 6 miejsc zamiast 18: przy tej samej cenie surowej caly token jest
    // 1e12 razy "mniejszy", wiec i jego cena jest 1e12 razy nizsza.
    const osiemnascie = poolPriceWeiFromSqrt(sqrtX96(1), 18);
    const szesc = poolPriceWeiFromSqrt(sqrtX96(1), 6);

    expect(osiemnascie / szesc).to.equal(10n ** 12n);
  });

  it('pusta pula nie ma ceny, a nie cene zero', () => {
    // Zero jest w tym projekcie umowa na "brak ceny" i tak jest czytane wyzej.
    expect(poolPriceWeiFromSqrt(0n, 18)).to.equal(0n);
  });

  it('bezsensowna liczba miejsc nie produkuje bezsensownej ceny', () => {
    expect(poolPriceWeiFromSqrt(sqrtX96(1), -1)).to.equal(0n);
    expect(poolPriceWeiFromSqrt(sqrtX96(1), 99)).to.equal(0n);
  });

  it('liczy w bigintach, wiec nie gubi cyfr przy cenach rzedu 1e-9', () => {
    // Dwie ceny rozne o 1 w 96-bitowym pierwiastku musza dac rozne wyniki.
    const a = poolPriceWeiFromSqrt(2n ** 96n, 18);
    const b = poolPriceWeiFromSqrt(2n ** 96n + 1_000_000n, 18);

    expect(a === b).to.equal(false);
  });
});

describe('hasPool', () => {
  it('zerowy poolId znaczy, ze puli jeszcze nie ma', () => {
    expect(hasPool(`0x${'0'.repeat(64)}`)).to.equal(false);
  });

  it('prawdziwy poolId przechodzi', () => {
    expect(hasPool(`0x${'a'.repeat(64)}`)).to.equal(true);
  });

  it('brak i smiec to nie jest pula', () => {
    expect(hasPool(null)).to.equal(false);
    expect(hasPool('0xabc')).to.equal(false);
  });
});
