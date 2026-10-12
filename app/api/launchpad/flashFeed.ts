import 'server-only';
import { LAUNCHPAD_NETWORKS } from '../../startpad/config';

/**
 * Publiczne API Flash (api.tryflash.app/v1/perps) - jedno pobranie na minute
 * dla calego procesu.
 *
 * Czytaja to: /api/launchpad/perps (tablica rynkow), /api/launchpad/quote-price
 * (kurs aktywa pary), karta OG tokena z rynku perpa i karta OG /perps.
 * Wczesniej obie trasy mialy wlasna kopie tego kodu i wlasny cache.
 *
 * Z Flash bierzemy tylko to, czego lancuch nie mowi wprost: NAV na udzial,
 * zmiane 24h, dzwignie i kapitalizacje perpa. Lista rynkow zyje w naszej
 * konfiguracji (`markets` sieci) - tylko tam stoja nasze launchpady. Brak
 * odpowiedzi Flash = pusta mapa, a nie wyjatek: kazdy odbiorca ma pokazac
 * swoje bez tych liczb.
 */

const TTL_MS = 60_000;
const FETCH_TIMEOUT_MS = 5_000;
const FLASH_PERPS_URL = 'https://api.tryflash.app/v1/perps';

export type FlashItem = {
  token?: string;
  name?: string;
  direction?: string;
  navPriceUsd?: number;
  priceUsd?: number;
  change24hPct?: number;
  currentLeverageWad?: string;
  targetLeverageWad?: string;
  marketCapUsd?: number;
  poolKey?: { currency0: string; currency1: string; fee: number; tickSpacing: number; hooks: string };
};

let cached: { at: number; byToken: Map<string, FlashItem> } | null = null;

/** Pozycje Flash po adresie tokena perpa (male litery). */
export async function flashItems(): Promise<Map<string, FlashItem>> {
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

/** Kiedy ostatnio udalo sie pobrac dane (do pola `at` w odpowiedziach tras). */
export function flashFetchedAt(): number {
  return cached?.at ?? Date.now();
}

/** Cena udzialu w USD: NAV, a gdy go brak - cena z puli. */
export function flashPriceUsd(item: FlashItem | undefined): number | null {
  const price = item?.navPriceUsd ?? item?.priceUsd;
  return typeof price === 'number' && Number.isFinite(price) && price > 0 ? price : null;
}

const wad = (value: string | undefined) => {
  if (!value || !/^\d+$/.test(value)) return null;
  return Number(BigInt(value) / 10n ** 14n) / 10_000;
};

export type PerpMarketSnapshot = {
  id: string;
  symbol: string;
  address: string;
  name: string;
  direction: 'long' | 'short';
  priceUsd: number | null;
  change24hPct: number | null;
  leverage: number | null;
  targetLeverage: number | null;
  marketCapUsd: number | null;
  launchpad: string;
  rVirt: number;
  poolKey: FlashItem['poolKey'] | null;
};

/** Rynki perpow sieci z doklejonymi liczbami Flash. Siec bez rynkow = pusta lista. */
export async function perpMarkets(chainId: number): Promise<PerpMarketSnapshot[]> {
  const markets = LAUNCHPAD_NETWORKS[chainId]?.markets ?? [];
  if (markets.length === 0) return [];
  const flash = await flashItems();

  return markets.map((m) => {
    const f = flash.get(m.quote.address.toLowerCase());
    return {
      id: m.id,
      symbol: m.quote.symbol,
      address: m.quote.address,
      name: f?.name ?? m.label,
      direction: f?.direction === 'short' ? 'short' : 'long',
      priceUsd: flashPriceUsd(f),
      change24hPct: typeof f?.change24hPct === 'number' ? f.change24hPct : null,
      leverage: wad(f?.currentLeverageWad),
      targetLeverage: wad(f?.targetLeverageWad),
      marketCapUsd: typeof f?.marketCapUsd === 'number' ? f.marketCapUsd : null,
      launchpad: m.launchpad,
      rVirt: m.rVirt,
      poolKey: f?.poolKey ?? null,
    };
  });
}
