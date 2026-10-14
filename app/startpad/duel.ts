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
  /** Obrazek z `metadataURI` w lancuchu (starty sprzed 14.10 niosly go tam); nowe: null, logo idzie przez profil. */
  image: string | null;
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

/**
 * FAZY STARCIA. Kapitalizacja w USD to cena w perpie razy NAV perpa, wiec zanim
 * ktokolwiek cos kupi, jedna strona "prowadzi" tylko dlatego, ze jej perp ma
 * wyzszy NAV (ETH2xS $1.05 vs ETH2xL $0.84 dawalo "BEAR LEADS 56%" bez jednego
 * zakupu). Dlatego:
 *   warmup - ktoras strona nie dostala jeszcze zadnego zakupu: wynik nic nie mowi;
 *   brawl  - obie strony mialy zakup: kapitalizacja i handel cos znacza;
 *   ko     - dokladnie jedna strona zapelnila krzywa (Locked / Graduated).
 */
export type ClashPhase = 'warmup' | 'brawl' | 'ko';

/** Ruch ceny mema (w %) uznawany za "ktos kupil" - nizej to zaokraglenie, nie handel. */
export const TRADED_MIN_PCT = 0.005;

export function sideTraded(token: ClashToken | null): boolean {
  if (!token) return false;
  if (token.state !== 'Curve') return true;
  return token.raised > 0 && token.sinceLaunchPct >= TRADED_MIN_PCT;
}

export function clashPhase(clash: Clash): ClashPhase {
  const { a, b } = clash;
  if (!a || !b) return 'warmup';
  if ((a.state !== 'Curve') !== (b.state !== 'Curve')) return 'ko';
  return sideTraded(a) && sideTraded(b) ? 'brawl' : 'warmup';
}

/** Zwyciezca KO: strona, ktora pierwsza zapelnila krzywa (null poza faza 'ko'). */
export function clashKoWinner(clash: Clash): ClashSide | null {
  if (clashPhase(clash) !== 'ko') return null;
  return clash.a && clash.a.state !== 'Curve' ? 'a' : 'b';
}

/**
 * WERDYKT dwoch sedziow z pol, ktore juz mamy: kapitalizacja w USD (z NAV perpa)
 * i handel (ruch ceny mema w perpie od startu - bez NAV). Zgodni = 'unanimous',
 * rozne strony = 'split'. Poza fazą 'brawl' albo przy remisie handlu - 'early'.
 */
export type ClashVerdict = { kind: 'early' | 'unanimous' | 'split'; cap: ClashSide | null; trading: ClashSide | null };

export function clashVerdict(clash: Clash): ClashVerdict {
  const { a, b } = clash;
  if (!a || !b || clashPhase(clash) !== 'brawl') return { kind: 'early', cap: null, trading: null };
  const cap = clashLeader(clash);
  const trading: ClashSide | null = Math.abs(a.sinceLaunchPct - b.sinceLaunchPct) < TRADED_MIN_PCT ? null : a.sinceLaunchPct > b.sinceLaunchPct ? 'a' : 'b';
  if (!cap || !trading) return { kind: 'early', cap, trading };
  return { kind: cap === trading ? 'unanimous' : 'split', cap, trading };
}

/**
 * "Fight of the day" na hubie: spomiedzy starc z obiema stronami to w bijatyce,
 * ktore jest najblizej 50/50; gdy zadne jeszcze nie ruszylo - najnowsze (API
 * oddaje je od najnowszego).
 */
export function fightOfTheDay(clashes: Clash[]): Clash | null {
  const full = clashes.filter((c) => c.a && c.b);
  if (full.length === 0) return null;
  const brawls = full.filter((c) => clashPhase(c) === 'brawl');
  if (brawls.length === 0) return full[0];
  return brawls.reduce((best, c) => (Math.abs(clashSharePct(c) - 50) < Math.abs(clashSharePct(best) - 50) ? c : best));
}

/** Para, do ktorej nalezy token: starcie i strona (null, gdy token nie jest w zadnym). */
export function findClashOf(clashes: Clash[], token: string): { clash: Clash; side: ClashSide } | null {
  const key = token.toLowerCase();
  for (const clash of clashes) {
    if (clash.a?.address.toLowerCase() === key) return { clash, side: 'a' };
    if (clash.b?.address.toLowerCase() === key) return { clash, side: 'b' };
  }
  return null;
}

/**
 * Udzial strony A w pasku (0-100). Przed pierwszymi zakupami po obu stronach albo
 * bez wyceny jednej z nich pasek stoi na 50/50: inaczej rozpietosc NAV perpow
 * udawalaby przewage.
 */
export function clashSharePct(clash: Clash): number {
  const a = clash.a?.mcapUsd ?? null;
  const b = clash.b?.mcapUsd ?? null;
  if (a === null || b === null || a + b <= 0) return 50;
  if (clashPhase(clash) === 'warmup') return 50;
  return (a / (a + b)) * 100;
}
