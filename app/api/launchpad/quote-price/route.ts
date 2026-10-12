import { NextRequest, NextResponse } from 'next/server';
import { LAUNCHPAD_NETWORKS } from '../../../startpad/config';
import { flashFetchedAt, flashItems, flashPriceUsd } from '../flashFeed';

/**
 * GET /api/launchpad/quote-price?token=0x... - kurs USD aktywa pary rynku Q.
 *
 * Na rynku Q wszystkie kwoty sa w jednostkach aktywa (ETH2xL, NVDA2xL...), wiec
 * dopiski dolarowe musza mnozyc przez JEGO kurs, nie przez kurs ETH. Perpy Flash
 * maja cene = NAV na udzial (zabezpieczenie na Morpho minus dlug, przez podaz);
 * bierzemy ja z publicznego API Flash, tego samego, z ktorego korzysta ich
 * aplikacja. Stablecoin = 1.
 *
 * Tylko adresy zapisane w konfiguracji rynkow - trasa nie jest ogolnym proxy
 * do cudzego API.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CACHE_HEADERS = { 'Cache-Control': 'public, max-age=30, stale-while-revalidate=120' } as const;
const NO_STORE = { 'Cache-Control': 'no-store' } as const;

function knownQuotes() {
  const out = new Map<string, { kind: string }>();
  for (const net of Object.values(LAUNCHPAD_NETWORKS)) {
    for (const m of net.markets ?? []) out.set(m.quote.address.toLowerCase(), { kind: m.quote.kind });
  }
  return out;
}

export async function GET(request: NextRequest) {
  const token = (request.nextUrl.searchParams.get('token') ?? '').toLowerCase();
  const known = knownQuotes().get(token);
  if (!known) return NextResponse.json({ ok: false, error: 'Unknown quote asset.' }, { status: 404, headers: NO_STORE });
  if (known.kind === 'stable') return NextResponse.json({ ok: true, usd: 1, at: Date.now() }, { headers: CACHE_HEADERS });

  const usd = flashPriceUsd((await flashItems()).get(token));
  if (usd === null) return NextResponse.json({ ok: false, error: 'Price unavailable.' }, { status: 502, headers: NO_STORE });
  return NextResponse.json({ ok: true, usd, at: flashFetchedAt() }, { headers: CACHE_HEADERS });
}
