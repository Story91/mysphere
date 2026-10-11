import { NextRequest, NextResponse } from 'next/server';
import { LAUNCHPAD_NETWORKS } from '../../../startpad/config';

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

const TTL_MS = 60_000;
const FETCH_TIMEOUT_MS = 5_000;
const FLASH_PERPS_URL = 'https://api.tryflash.app/v1/perps';
const CACHE_HEADERS = { 'Cache-Control': 'public, max-age=30, stale-while-revalidate=120' } as const;
const NO_STORE = { 'Cache-Control': 'no-store' } as const;

let cached: { at: number; byToken: Map<string, number> } | null = null;

function knownQuotes() {
  const out = new Map<string, { kind: string }>();
  for (const net of Object.values(LAUNCHPAD_NETWORKS)) {
    for (const m of net.markets ?? []) out.set(m.quote.address.toLowerCase(), { kind: m.quote.kind });
  }
  return out;
}

async function flashNavs(): Promise<Map<string, number>> {
  if (cached && Date.now() - cached.at < TTL_MS) return cached.byToken;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(FLASH_PERPS_URL, { signal: controller.signal, cache: 'no-store' });
    if (!response.ok) return cached?.byToken ?? new Map();
    const body = (await response.json()) as { items?: Array<{ token?: string; navPriceUsd?: number; priceUsd?: number }> };
    const byToken = new Map<string, number>();
    for (const item of body.items ?? []) {
      const price = typeof item.navPriceUsd === 'number' ? item.navPriceUsd : item.priceUsd;
      if (item.token && typeof price === 'number' && Number.isFinite(price) && price > 0) byToken.set(item.token.toLowerCase(), price);
    }
    cached = { at: Date.now(), byToken };
    return byToken;
  } catch {
    // Zostaje ostatni znany kurs - lepszy niz brak dopisku dolarowego.
    return cached?.byToken ?? new Map();
  } finally {
    clearTimeout(timer);
  }
}

export async function GET(request: NextRequest) {
  const token = (request.nextUrl.searchParams.get('token') ?? '').toLowerCase();
  const known = knownQuotes().get(token);
  if (!known) return NextResponse.json({ ok: false, error: 'Unknown quote asset.' }, { status: 404, headers: NO_STORE });
  if (known.kind === 'stable') return NextResponse.json({ ok: true, usd: 1, at: Date.now() }, { headers: CACHE_HEADERS });

  const usd = (await flashNavs()).get(token);
  if (usd === undefined) return NextResponse.json({ ok: false, error: 'Price unavailable.' }, { status: 502, headers: NO_STORE });
  return NextResponse.json({ ok: true, usd, at: cached?.at ?? Date.now() }, { headers: CACHE_HEADERS });
}
