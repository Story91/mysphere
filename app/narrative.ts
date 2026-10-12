import { DEFAULT_LAUNCHPAD_CHAIN_ID, LAUNCHPAD_NETWORKS } from './startpad/config';

/**
 * Narracja MySphere w JEDNYM miejscu.
 *
 * Czytaja to: metadane korzenia (app/layout.tsx), karta strony glownej
 * i karta miniappki (app/components/og/HomeShareCard.tsx), przycisk embeddu
 * Farcastera. Zmiana hasla = zmiana tego pliku, nic wiecej.
 *
 * === KIERUNEK (wlasciciel, 2026-10-12) ===
 * "New social, all in one". Na pierwszym planie Startpad i rynki perpow:
 * mem na krzywej sparowany z tokenem Flash 2x (ETH, BTC, Nvidia, SpaceX).
 * Feed i Aski zostaja, ale na drugim planie - wymienione w opisie, nie na
 * obrazku.
 *
 * === TRZY TEKSTY, KTORE SIE NIE POWTARZAJA ===
 * Na X widac: obrazek (HEADLINE + SUBLINE + chipy), pod nim jeden pasek
 * (SOCIAL_TITLE) i czasem opis (APP_DESCRIPTION). Obrazek mowi CO, pasek mowi
 * CZYM JEST MIEJSCE, opis wylicza reszte. Zmieniajac jeden, przeczytaj dwa
 * pozostale.
 *
 * === CO JEST PRAWDA DZIS ===
 * - Rynki perpow: `markets` wpisu Base w app/startpad/config.ts (2026-10-12:
 *   ETH long i short, BTC, Nvidia, SpaceX, Apple, Meta). Chipy liczy
 *   PERP_CHIPS prosto z tej listy, wiec nowy rynek pojawia sie na kartach sam.
 * - "Stocks" w hasle to tokeny Flash sledzace akcje (NVDA2xL, SPCX2xL,
 *   AAPL2xL, META2xL), a nie akcje. Opis mowi "perps", nie "shares".
 * - Siec postowania (dziewiec) i napiwkow (osiem) - uzasadnienie liczb jest
 *   w historii app/layout.tsx; tu tylko jedno zdanie o feedzie.
 */

/** Naglowek karty strony glownej. Limit ~23 znakow przy 88 px (nowrap). */
export const HEADLINE = 'Memes × perps × stocks.';

/** Druga linijka karty. Limit ~40 znakow przy 48 px. */
export const SUBLINE = 'Launch a meme paired with 2x leverage.';

/** Ticker z symbolu perpa Flash: "ETH2xL" -> "ETH". Tylko tam, gdzie skrot nic nie mowi, pelna nazwa. */
const TICKER_NAMES: Record<string, string> = { SPCX: 'SPACEX' };
/** Chipow miesci sie w kolumnie karty ~6 - reszta idzie do chipu "+N". */
const MAX_CHIPS = 6;

/**
 * Chipy na dole karty - po jednym na AKTYWO z rynkow perpow sieci domyslnej
 * (long i short tego samego aktywa to jeden chip). Bez liczb, wiec karta moze
 * stac w CDN tydzien i nie klamac.
 */
export const PERP_CHIPS: readonly string[] = (() => {
  const markets = LAUNCHPAD_NETWORKS[DEFAULT_LAUNCHPAD_CHAIN_ID]?.markets ?? [];
  const tickers = Array.from(
    new Set(markets.map((m) => m.quote.symbol.replace(/\d+x[LS]$/i, '').toUpperCase()).map((t) => TICKER_NAMES[t] ?? t))
  );
  return tickers.length > MAX_CHIPS ? [...tickers.slice(0, MAX_CHIPS - 1), `+${tickers.length - MAX_CHIPS + 1}`] : tickers;
})();

/**
 * Pasek pod obrazkiem na X i <title> strony glownej. X urywa go w okolicach
 * 70 znakow na pulpicie, wczesniej na telefonie - trzymac ponizej 50.
 */
export const SOCIAL_TITLE = 'MySphere - the all-in-one social app on Base';

export const APP_DESCRIPTION =
  'Launch a meme on a bonding curve and pair it with a Flash 2x perp on ETH, Bitcoin or stocks like Nvidia, SpaceX, Apple and Meta - buy with plain ETH in one transaction. Plus $SPHERE, a feed that posts across nine networks, tips and Asks with a budget.';

/** Wspolne zdanie o rynkach perpow dla /perps, /startpad i /how. */
export const PERPS_LINE = 'Flash 2x perps on ETH, Bitcoin and stocks like Nvidia, SpaceX, Apple and Meta';

/** Przycisk embeddu Farcastera - limit 32 znaki, bez wiodacej spacji. */
export const MINIAPP_BUTTON = 'Launch a meme on 2x';
