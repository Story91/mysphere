import type { Address } from 'viem';

/**
 * ASSET CLASH - jeden mem, dwa tokeny na DWOCH ROZNYCH perpach wybranych przez
 * tworce, np. $PEPEETH na ETH2xL vs $PEPENVDA na NVDA2xL. Krypto vs Wall
 * Street: krzywa i pula kazdej strony trzymaja jej perpa, wiec rynek sam
 * codziennie rozstrzyga, ktore aktywo mocniej niesie mema (dzwignia 2x).
 *
 * Para bez rejestru i backendu: oba tokeny niosa w NIEZMIENNYCH metadanych ten
 * sam `duel.id` i swoja strone ('a' | 'b'). /api/launchpad/clashes sklada pary
 * z `LaunchMetadataSet` launchpadow perpow i wymaga tego samego tworcy.
 * (Do 2026-10-13 bylo tu Bull vs Bear na ETH2xL/ETH2xS - wlasciciel zrezygnowal
 * z shortow; zaden pojedynek nie powstal, wiec format zmieniony bez migracji.)
 */

export type ClashSide = 'a' | 'b';

export type ClashToken = {
  address: Address;
  name: string;
  symbol: string;
  marketId: string;
  perpSymbol: string;
  state: 'Curve' | 'Locked' | 'Graduated';
  raised: number;
  priceInPerp: number;
  /**
   * Ruch ceny mema od startu, w PERPIE (%): czysty efekt handlu, bez NAV perpa.
   * Obie strony startuja z tej samej ceny w perpie, wiec to uczciwa miara sily.
   */
  sinceLaunchPct: number;
  /** Kapitalizacja w USD = cena w perpie * NAV perpa * 1e9 tokenow. */
  mcapUsd: number | null;
  /** Zmiana perpa z 24 h (Flash) - to ona przesuwa szale bez handlu. */
  perpChange24h: number | null;
  launchpad: Address;
};

export type Clash = {
  id: string;
  ticker: string;
  creator: Address;
  image: string | null;
  description: string | null;
  startedAt: number;
  a: ClashToken | null;
  b: ClashToken | null;
};

/** Losowy identyfikator starcia (male litery i cyfry, 16 znakow). */
export function newClashId(): string {
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => (b % 36).toString(36)).join('').padEnd(16, '0').slice(0, 16);
}

/** Ticker starcia: litery i cyfry, wielkie, najwyzej 7 znakow (aktywo dokleja do 4). */
export function cleanClashTicker(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 7);
}

/** Baza perpa: ETH2xL -> ETH, NVDA2xL -> NVDA. */
export function perpBaseOf(perpSymbol: string): string {
  return perpSymbol.replace(/\d+x[LS]$/i, '').replace(/MAX[LS]$/i, '').toUpperCase();
}

/**
 * BULL VS BEAR = szczegolny przypadek starcia: ETH2xL (long) kontra ETH2xS
 * (short). Tickery TICKERBULL / TICKERBEAR zamiast TICKERETH / TICKERETH.
 */
export function isShortPerp(perpSymbol: string): boolean {
  return /2x[S]$/i.test(perpSymbol) || /MAXS$/i.test(perpSymbol);
}

export function isBullBear(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b) return false;
  return (isShortPerp(a) !== isShortPerp(b)) && perpBaseOf(a) === perpBaseOf(b);
}

/** Slowo strony: bull/bear w Bull vs Bear, inaczej baza aktywa (ETH, NVDA...). */
export function sideWord(perpSymbol: string, bullBear: boolean): string {
  if (!bullBear) return perpBaseOf(perpSymbol);
  return isShortPerp(perpSymbol) ? 'BEAR' : 'BULL';
}

export function clashSymbol(ticker: string, perpSymbol: string, bullBear = false): string {
  return `${ticker}${sideWord(perpSymbol, bullBear)}`;
}

/** Kto prowadzi: strona z wieksza kapitalizacja w USD (null = remis albo brak danych). */
export function clashLeader(clash: Clash): ClashSide | null {
  const a = clash.a?.mcapUsd ?? null;
  const b = clash.b?.mcapUsd ?? null;
  if (a === null || b === null || a === b) return null;
  return a > b ? 'a' : 'b';
}
