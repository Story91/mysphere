import { NextRequest, NextResponse } from 'next/server';
import { DEFAULT_LAUNCHPAD_CHAIN_ID, LAUNCHPAD_NETWORKS } from '../../../startpad/config';

/**
 * GET /api/launchpad/perps?chainId=8453 - perpy, na ktorych da sie startowac memy.
 *
 * Zrodlem LISTY jest nasza konfiguracja (`markets` sieci) - tylko na tych
 * aktywach stoja nasze launchpady. Z publicznego API Flash dochodzi wylacznie
 * to, czego lancuch nie mowi wprost: NAV na udzial (cena), zmiana 24h,
 * aktualna dzwignia i kapitalizacja perpa. Brak odpowiedzi Flash = karty bez
 * tych liczb, nie pusta strona.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TTL_MS = 60_000;
const FETCH_TIMEOUT_MS = 5_000;
const FLASH_PERPS_URL = 'https://api.tryflash.app/v1/perps';
const CACHE_HEADERS = { 'Cache-Control': 'public, max-age=30, stale-while-revalidate=120' } as const;

type FlashItem = {
  token?: string;
  name?: string;
  direction?: string;
  navPriceUsd?: number;
  priceUsd?: number;
  change24hPct?: number;
  currentLeverageWad?: string;
  targetLeverageWad?: string;
  marketCapUsd?: number;
};

let cached: { at: number; byToken: Map<string, FlashItem> } | null = null;

async function flashItems(): Promise<Map<string, FlashItem>> {
  if (cached && Date.now() - cached.at < TTL_MS) return cached.byToken;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(FLASH_PERPS_URL, { signal: controller.signal, cache: 'no-store' });
    if (!response.ok) return cached?.byToken ?? new Map();
    const body = (await response.json()) as { items?: FlashItem[] };
    const byToken = new Map<string, FlashItem>();
    for (const item of body.items ?? []) if (item.token) byToken.set(item.token.toLowerCase(), item);
    cached = { at: Date.now(), byToken };
    return byToken;
  } catch {
    return cached?.byToken ?? new Map();
  } finally {
    clearTimeout(timer);
  }
}

const wad = (value: string | undefined) => {
  if (!value || !/^\d+$/.test(value)) return null;
  return Number(BigInt(value) / 10n ** 14n) / 10_000;
};

export async function GET(request: NextRequest) {
  const asked = Number(request.nextUrl.searchParams.get('chainId') ?? DEFAULT_LAUNCHPAD_CHAIN_ID);
  const net = LAUNCHPAD_NETWORKS[asked];
  const markets = net?.markets ?? [];
  const flash = markets.length ? await flashItems() : new Map<string, FlashItem>();

  const perps = markets.map((m) => {
    const f = flash.get(m.quote.address.toLowerCase());
    const price = f?.navPriceUsd ?? f?.priceUsd;
    return {
      id: m.id,
      symbol: m.quote.symbol,
      address: m.quote.address,
      name: f?.name ?? m.label,
      direction: f?.direction === 'short' ? 'short' : 'long',
      priceUsd: typeof price === 'number' && Number.isFinite(price) ? price : null,
      change24hPct: typeof f?.change24hPct === 'number' ? f.change24hPct : null,
      leverage: wad(f?.currentLeverageWad),
      targetLeverage: wad(f?.targetLeverageWad),
      marketCapUsd: typeof f?.marketCapUsd === 'number' ? f.marketCapUsd : null,
      launchpad: m.launchpad,
      rVirt: m.rVirt,
    };
  });

  return NextResponse.json({ ok: true, chainId: asked, perps, at: cached?.at ?? Date.now() }, { headers: CACHE_HEADERS });
}
