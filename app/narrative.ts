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
 * Na X widac: obrazek (HEADLINE + SUBLINE + naklejki), pod nim jeden pasek
 * (SOCIAL_TITLE) i czasem opis (APP_DESCRIPTION). Obrazek mowi CO, pasek mowi
 * CZYM JEST MIEJSCE, opis wylicza reszte. Zmieniajac jeden, przeczytaj dwa
 * pozostale.
 *
 * === CO JEST PRAWDA DZIS ===
 * - Rynki perpow: `markets` wpisu Base w app/startpad/config.ts (2026-10-12:
 *   ETH long i short, BTC, Nvidia, SpaceX, Apple, Meta). Naklejki liczy
 *   PERP_STICKERS prosto z tej listy, wiec nowy rynek pojawia sie na kartach sam.
 * - "Stocks" w hasle to tokeny Flash sledzace akcje (NVDA2xL, SPCX2xL,
 *   AAPL2xL, META2xL), a nie akcje. Opis mowi "perps", nie "shares".
 * - Siec postowania (dziewiec) i napiwkow (osiem) - uzasadnienie liczb jest
 *   w historii app/layout.tsx; tu tylko jedno zdanie o feedzie.
 */

/** Naglowek karty strony glownej - kazdy element to osobna linijka (~11 znakow przy 104 px). */
export const HEADLINE_LINES = ['Memes', '× perps', '× stocks.'];
export const HEADLINE = HEADLINE_LINES.join(' ');

/** Zdanie pod naglowkiem. Jedna linijka w kolumnie 560 px przy 30 px - do ~36 znakow. */
export const SUBLINE = 'Launch a meme on 2x leverage.';

/**
 * Nazwa aktywa na naklejce, z symbolu perpa Flash ("SPCX2xL" -> "SpaceX").
 * Ticker, ktorego tu nie ma, idzie na naklejke tak, jak jest.
 */
const ASSET_NAMES: Record<string, string> = { ETH: 'ETH', BTC: 'BTC', NVDA: 'Nvidia', SPCX: 'SpaceX', AAPL: 'Apple', META: 'Meta' };
/** W kolazu jest szesc miejsc (SLOTS w app/components/og/sticker.tsx). */
const MAX_STICKERS = 6;

/**
 * Naklejki aktywow rynkow perpow sieci domyslnej ("ETH 2x", "Nvidia 2x"...).
 * Long i short tego samego aktywa to jedna naklejka. Lista liczona z
 * `markets` w config.ts, wiec nowy rynek pojawia sie na kartach sam; ponad
 * szesc - ostatnia naklejka mowi "+N more". Bez liczb, wiec karta moze stac
 * w CDN tydzien i nie klamac.
 */
export const PERP_STICKERS: readonly string[] = (() => {
  const markets = LAUNCHPAD_NETWORKS[DEFAULT_LAUNCHPAD_CHAIN_ID]?.markets ?? [];
  const assets = Array.from(new Set(markets.map((m) => m.quote.symbol.replace(/\d+x[LS]$/i, '').toUpperCase())));
  const labels = assets.map((a) => `${ASSET_NAMES[a] ?? a} 2x`);
  return labels.length > MAX_STICKERS ? [...labels.slice(0, MAX_STICKERS - 1), `+${labels.length - MAX_STICKERS + 1} more`] : labels;
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
