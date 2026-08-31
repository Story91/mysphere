import { NextResponse } from 'next/server';

/**
 * Kurs ETH/USD dla dopiskow w interfejsie launchpada.
 *
 * GET /api/launchpad/eth-price -> { usd: number, at: number }
 *
 * Zewnetrzne API pytamy najwyzej raz na minute NIEZALEZNIE od liczby
 * klientow - cache siedzi w pamieci modulu, bo kazdy klient i tak polluje
 * co 60 s i swiezszy kurs nic by nie wnosil. Przy awarii zrodel oddajemy
 * ostatnia znana cene ze `stale: true` - stary kurs jako dopisek jest
 * lepszy niz znikniecie wszystkich dopiskow. Dopiero brak JAKIEJKOLWIEK
 * ceny konczy sie 503, ktore klient traktuje jak "pomin dopisek".
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TTL_MS = 60_000;
const FETCH_TIMEOUT_MS = 5_000;

/** Krotki cache CDN zdejmuje czesc ruchu, ale to pamiec modulu jest zamkiem. */
const CACHE_HEADERS = { 'Cache-Control': 'public, max-age=30, stale-while-revalidate=120' } as const;
const NO_STORE = { 'Cache-Control': 'no-store' } as const;

let cached: { usd: number; at: number } | null = null;

async function fetchJson(url: string): Promise<unknown> {
  // AbortController zamiast czekania w nieskonczonosc - wiszacy zewnetrzny
  // endpoint nie moze trzymac naszej odpowiedzi dluzej niz 5 s.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal, cache: 'no-store' });
    if (!response.ok) return null;
    return (await response.json()) as unknown;
  } finally {
    clearTimeout(timer);
  }
}

async function fromCoinbase(): Promise<number | null> {
  try {
    const payload = (await fetchJson('https://api.coinbase.com/v2/prices/ETH-USD/spot')) as {
      data?: { amount?: string };
    } | null;
    const amount = Number(payload?.data?.amount);
    return Number.isFinite(amount) && amount > 0 ? amount : null;
  } catch {
    return null;
  }
}

async function fromCoinGecko(): Promise<number | null> {
  try {
    const payload = (await fetchJson(
      'https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd'
    )) as { ethereum?: { usd?: number } } | null;
    const amount = Number(payload?.ethereum?.usd);
    return Number.isFinite(amount) && amount > 0 ? amount : null;
  } catch {
    return null;
  }
}

export async function GET() {
  const now = Date.now();
  if (cached && now - cached.at < TTL_MS) {
    return NextResponse.json(cached, { headers: CACHE_HEADERS });
  }

  // Coinbase pierwszy - bez klucza i bez limitow, ktore bolaly na CoinGecko.
  const usd = (await fromCoinbase()) ?? (await fromCoinGecko());
  if (usd !== null) {
    cached = { usd, at: now };
    return NextResponse.json(cached, { headers: CACHE_HEADERS });
  }
  if (cached) {
    return NextResponse.json({ ...cached, stale: true }, { headers: NO_STORE });
  }
  return NextResponse.json(
    { error: 'No ETH/USD price source is reachable right now.' },
    { status: 503, headers: NO_STORE }
  );
}
