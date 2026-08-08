import { NextResponse } from 'next/server';
import { CACHE_SECONDS, STALE_SECONDS, getEligibleVaults } from '../../../utils/morpho/cache';

/**
 * Lista skarbcow, z ktorych wolno wybierac w kompozytorze.
 *
 * === PO CO TA TRASA, SKORO ENDPOINT MORPHO JEST PUBLICZNY ===
 * Zeby cache stal w JEDNYM miejscu i byl WSPOLNY. Gdyby kompozytor wolal
 * api.morpho.org wprost z przegladarki, kazdy czytelnik mialby wlasny zimny
 * cache i wlasne zapytanie - a to jest strona, ktora otwiera sie najczesciej.
 * Pelne uzasadnienie stoi w app/utils/morpho/cache.ts.
 *
 * Wolno pytac bez logowania: to sa dane publiczne, ktore i tak stoja na
 * morpho.org. Nie ma tu nic, czego trzeba pilnowac przed odczytem - a jest
 * cache, ktory chroni zrodlo przed nami.
 */

// Bez tego Next moglby wygenerowac te trase raz, przy budowaniu - i podawac
// oprocentowanie z dnia wdrozenia az do nastepnego wdrozenia. Swiezoscia
// steruje wylacznie naglowek `Cache-Control` nizej.
export const dynamic = 'force-dynamic';

export async function GET() {
  const result = await getEligibleVaults();

  if (!result.ok) {
    // AWARIA MA WLASNE WYJSCIE - nie pusta lista z kodem 200. Pusta lista
    // znaczy "nie ma skarbcow do wyboru" i kompozytor narysowalby ja jako
    // fakt o Morpho. `reason` jedzie do klienta, zeby UI mogl napisac, CO sie
    // stalo, zamiast zgadywac.
    return NextResponse.json(result, {
      status: result.reason === 'unavailable' ? 503 : 502,
      // Awarii NIE WOLNO wpuscic do cache CDN. Bez tego jedna nieudana odpowiedz
      // zostalaby przypieta na cale okno i przetrwalaby powrot Morpho do zycia.
      headers: { 'Cache-Control': 'no-store' },
    });
  }

  return NextResponse.json(result, {
    status: 200,
    headers: {
      // === DRUGA WARSTWA CACHE, TA PRZED INSTANCJAMI ===
      // `s-maxage` trzyma odpowiedz na CDN, wiec dziala takze dla zimnego startu
      // i przy kilku egzemplarzach funkcji naraz - czego pamiec procesu z natury
      // nie potrafi.
      //
      // `stale-while-revalidate` jest tu z tego samego powodu, co laska dla
      // starej wartosci w cache.ts: gdy odswiezenie sie nie uda, czytelnik
      // dostaje ostatnia dobra liste zamiast bledu. Dane starzeja sie
      // w godzinach, wiec podanie tej sprzed kilku minut nikogo nie wprowadza
      // w blad - a `fetchedAt` przy kazdym skarbcu niesie prawdziwy czas pomiaru.
      'Cache-Control': `public, s-maxage=${CACHE_SECONDS}, stale-while-revalidate=${STALE_SECONDS}`,
    },
  });
}
