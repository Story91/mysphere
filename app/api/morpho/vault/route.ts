import { NextResponse } from 'next/server';
import { CACHE_SECONDS, STALE_SECONDS, getVaultFacts } from '../../../utils/morpho/cache';

/**
 * Fakty o JEDNYM skarbcu - dla karty, ktora juz stoi w feedzie.
 *
 * === DLACZEGO OSOBNO OD /api/morpho/vaults ===
 * Lista zwraca WYLACZNIE notowane skarbce (24 na Base). Post moze byc starszy
 * niz zmiana tej listy: skarbiec wybrany miesiac temu moze dzis nie byc juz
 * notowany, a karta w feedzie nadal musi umiec pokazac, co sie z nim dzieje -
 * i to jest wtedy najbardziej potrzebna informacja, jaka mamy.
 * Wyciaganie faktow z listy zamieniloby takiego skarbca w pustke.
 */

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const address = new URL(request.url).searchParams.get('address');

  if (!address) {
    return NextResponse.json(
      { ok: false, reason: 'not-found' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  const result = await getVaultFacts(address);

  if (!result.ok) {
    // Trzy powody, trzy rozne kody - bo to sa trzy rozne zdania o skarbcu.
    // 404 znaczy "sprawdzilismy, nie ma takiego" (wiedza).
    // 503 znaczy "nie udalo sie sprawdzic" (brak wiedzy).
    // 502 znaczy "zrodlo odpowiedzialo czyms, czego nie umiemy uzyc".
    const status =
      result.reason === 'not-found' ? 404 : result.reason === 'unavailable' ? 503 : 502;

    return NextResponse.json(result, {
      status,
      headers: { 'Cache-Control': 'no-store' },
    });
  }

  return NextResponse.json(result, {
    status: 200,
    headers: {
      'Cache-Control': `public, s-maxage=${CACHE_SECONDS}, stale-while-revalidate=${STALE_SECONDS}`,
    },
  });
}
