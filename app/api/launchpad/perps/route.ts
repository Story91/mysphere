import { NextRequest, NextResponse } from 'next/server';
import { DEFAULT_LAUNCHPAD_CHAIN_ID } from '../../../startpad/config';
import { flashFetchedAt, perpMarkets } from '../flashFeed';

/**
 * GET /api/launchpad/perps?chainId=8453 - perpy, na ktorych da sie startowac memy.
 *
 * Zrodlem LISTY jest nasza konfiguracja (`markets` sieci) - tylko na tych
 * aktywach stoja nasze launchpady. Z publicznego API Flash dochodzi wylacznie
 * to, czego lancuch nie mowi wprost: NAV na udzial (cena), zmiana 24h,
 * aktualna dzwignia i kapitalizacja perpa. Brak odpowiedzi Flash = karty bez
 * tych liczb, nie pusta strona. Pobranie i cache: ../flashFeed.ts.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CACHE_HEADERS = { 'Cache-Control': 'public, max-age=30, stale-while-revalidate=120' } as const;

export async function GET(request: NextRequest) {
  const asked = Number(request.nextUrl.searchParams.get('chainId') ?? DEFAULT_LAUNCHPAD_CHAIN_ID);
  const perps = await perpMarkets(asked);
  return NextResponse.json({ ok: true, chainId: asked, perps, at: flashFetchedAt() }, { headers: CACHE_HEADERS });
}
