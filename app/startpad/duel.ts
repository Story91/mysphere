import type { Address } from 'viem';

/**
 * BULL VS BEAR - jeden start, dwa tokeny: `<TICKER>BULL` na ETH2xL i
 * `<TICKER>BEAR` na ETH2xS. Gdy ETH rosnie, BULL zyskuje w dolarach sam z
 * siebie (krzywa i pula trzymaja ETH2xL), BEAR traci - i odwrotnie.
 *
 * Para nie potrzebuje rejestru ani backendu: oba tokeny niosa w NIEZMIENNYCH
 * metadanych ten sam `duel.id` i swoja strone. /api/launchpad/duels sklada
 * pary z `LaunchMetadataSet` obu launchpadow i sprawdza, ze tworca jest ten sam
 * (inaczej ktos moglby "doklejac" sie cudzym tokenem do pojedynku).
 */

export const DUEL_MARKETS = { bull: 'eth2xl', bear: 'eth2xs' } as const;
export type DuelSide = keyof typeof DUEL_MARKETS;

export type DuelToken = {
  address: Address;
  name: string;
  symbol: string;
  state: 'Curve' | 'Locked' | 'Graduated';
  /** Zebrany perp (jednostki calkowite) i cena spot w perpie za token. */
  raised: number;
  priceInPerp: number;
  /** Kapitalizacja w USD = cena w perpie * NAV perpa * 1e9 tokenow. */
  mcapUsd: number | null;
  launchpad: Address;
};

export type Duel = {
  id: string;
  ticker: string;
  creator: Address;
  image: string | null;
  description: string | null;
  startedAt: number;
  bull: DuelToken | null;
  bear: DuelToken | null;
};

/** Losowy identyfikator pojedynku (male litery i cyfry, 16 znakow). */
export function newDuelId(): string {
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => (b % 36).toString(36)).join('').padEnd(16, '0').slice(0, 16);
}

/** Ticker pojedynku: litery i cyfry, wielkie, najwyzej 8 znakow (BULL/BEAR dokleja 4). */
export function cleanDuelTicker(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
}

export function duelSymbol(ticker: string, side: DuelSide): string {
  return `${ticker}${side === 'bull' ? 'BULL' : 'BEAR'}`;
}

/** Kto prowadzi: strona z wieksza kapitalizacja w USD (null = remis albo brak danych). */
export function duelLeader(duel: Duel): DuelSide | null {
  const a = duel.bull?.mcapUsd ?? null;
  const b = duel.bear?.mcapUsd ?? null;
  if (a === null || b === null || a === b) return null;
  return a > b ? 'bull' : 'bear';
}
