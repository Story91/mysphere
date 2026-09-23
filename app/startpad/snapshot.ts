/**
 * Migawka tablicy w localStorage - zeby wejscie/odswiezenie pokazywalo od razu
 * ostatni znany stan (z logami), a nie czekalo na pelny skan lancucha. Skan i
 * eventy na zywo lecą dalej w tle i aktualizuja to, co widac.
 *
 * Trzymamy per SIEC (chainId). Zdarzenia na zywo (ticker) NIE sa cache'owane -
 * te maja byc swieze, zeby launchpad zyl.
 */

const KEY = (chainId: number) => `startpad.snapshot.${chainId}`;
// Po dobie migawka jest za stara nawet jako placeholder - i tak dociagnie ja
// skan, ale nie chcemy mignac tygodniowym stanem.
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

/**
 * Zapisuje TYLKO to, co da sie zserializowac: `flash` (animacja) i
 * `creatorAccruedWei` (bigint, i tak przeliczany przez skan) sa odrzucane.
 */
export function saveSnapshot(chainId: number, tokens: unknown[]): void {
  if (typeof window === 'undefined') return;
  try {
    const clean = tokens.map((token) => {
      const { flash, creatorAccruedWei, ...rest } = token as Record<string, unknown>;
      return rest;
    });
    window.localStorage.setItem(KEY(chainId), JSON.stringify({ savedAt: Date.now(), tokens: clean }));
  } catch {
    // Brak miejsca / prywatny tryb - migawka to wygoda, nie dane. Cisza.
  }
}

export function loadSnapshot<T>(chainId: number): T[] | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(KEY(chainId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { savedAt?: number; tokens?: T[] };
    if (!parsed.tokens || !Array.isArray(parsed.tokens)) return null;
    if (typeof parsed.savedAt !== 'number' || Date.now() - parsed.savedAt > MAX_AGE_MS) return null;
    return parsed.tokens;
  } catch {
    return null;
  }
}

/* -------------------------------------------------------------------------- */
/*  AGREGAT TABLICY - to, co pozwala skanowac SAME NOWE BLOKI                  */
/* -------------------------------------------------------------------------- */

/**
 * Migawka wierszy wyzej jest PLACEHOLDEREM: maluje ostatni znany widok i czeka,
 * az skan ja nadpisze. To nizej jest czyms innym - PUNKTEM KONTROLNYM. Trzyma
 * wynik skanu razem z blokiem, do ktorego jest policzony, wiec kolejne wejscie
 * nie powtarza pracy, tylko dolicza nowe bloki.
 *
 * Klucz niesie SIEC i ADRES LAUNCHPADA. Adresy w config.ts maja fallbacki, ktore
 * zmieniaja sie przy kolejnych wdrozeniach - agregat z martwego wdrozenia
 * doliczylby wolumen tokenow, ktorych ten launchpad nigdy nie widzial.
 *
 * Wersja w kluczu, bo zmiana ksztaltu agregatu nie moze przeczytac sie po cichu
 * jako "stan sprzed" i dosumowac do nowego.
 */
const AGG_KEY = (chainId: number, launchpad: string) =>
  `startpad.agg.v1.${chainId}.${launchpad.toLowerCase()}`;

/**
 * Tydzien, a nie doba jak przy wierszach. Wiersze po dobie sa nieaktualne jako
 * podglad; agregat sie nie starzeje, bo opisuje zamkniety przedzial blokow.
 * Sufit jest tu wylacznie po to, zeby ewentualna pomylka (reorganizacja
 * lancucha przy samej glowie) nie zostala w liczbach na zawsze.
 */
const AGG_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export type BoardAggregateSnapshot = {
  /** Najwyzszy blok policzony w tym agregacie. */
  lastBlock: bigint;
  /** Ksztalt z `serializeAggregate`; ten modul go nie interpretuje. */
  aggregate: unknown;
};

export function saveBoardAggregate(
  chainId: number,
  launchpad: string,
  snapshot: { lastBlock: bigint; aggregate: unknown }
): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      AGG_KEY(chainId, launchpad),
      JSON.stringify({ savedAt: Date.now(), lastBlock: snapshot.lastBlock.toString(), aggregate: snapshot.aggregate })
    );
  } catch {
    // Brak miejsca / tryb prywatny - wtedy po prostu wracamy do pelnego skanu.
  }
}

export function loadBoardAggregate(chainId: number, launchpad: string): BoardAggregateSnapshot | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(AGG_KEY(chainId, launchpad));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { savedAt?: number; lastBlock?: string; aggregate?: unknown };
    if (typeof parsed.savedAt !== 'number' || Date.now() - parsed.savedAt > AGG_MAX_AGE_MS) return null;
    if (typeof parsed.lastBlock !== 'string' || !/^\d+$/.test(parsed.lastBlock)) return null;
    const lastBlock = BigInt(parsed.lastBlock);
    if (lastBlock <= 0n) return null;
    return { lastBlock, aggregate: parsed.aggregate };
  } catch {
    return null;
  }
}

export function dropBoardAggregate(chainId: number, launchpad: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(AGG_KEY(chainId, launchpad));
  } catch {
    // Nic nie szkodzi: nieprzeczytany agregat i tak konczy sie pelnym skanem.
  }
}

/**
 * MIGAWKA HISTORII TOKENA - wykres i lista transakcji od razu przy wejsciu.
 *
 * Wiersze trzymamy w TYM SAMYM kodowaniu, co cache serwerowy (`historyScan`),
 * wiec nie istnieje drugi format, ktory moglby sie z pierwszym rozjechac. Do
 * tego rozwiazuje to problem bigintow: JSON ich nie zna, a cena i salda to
 * wylacznie biginty.
 */
const HISTORY_KEY = (chainId: number, token: string) =>
  `startpad.history.${chainId}.${token.toLowerCase()}`;

/**
 * Sufit wpisow w jednej migawce. localStorage ma okolo 5 MB na cala domene, a
 * to jest wygoda jednego tokena - nie wolno jej zjesc calej.
 */
const MAX_HISTORY_ROWS = 4_000;

export type HistorySnapshot = {
  /** Najwyzszy blok pokryty przez te migawke; od niego dociagamy reszte. */
  highBlock: string;
  /** Historia siega startu tokena. */
  complete: boolean;
  graduatedTs: number | null;
  trades: string[];
  balances: string[];
  /** Migawka trzyma KOMPLET transakcji, nie sam ogon. */
  full: boolean;
};

/**
 * Przycina do sufitu, zostawiajac NAJNOWSZE wpisy - wykres i lista czytaja sie
 * od konca. `full: false` jest wazniejsze niz sam ogon: mowi wolajacemu, ze
 * nie wolno mu prosic serwera o sama roznice, bo poczatku historii nie ma.
 */
export function capRows(rows: string[], max: number): { rows: string[]; full: boolean } {
  if (rows.length <= max) return { rows, full: true };
  return { rows: rows.slice(rows.length - max), full: false };
}

export function saveTokenHistory(chainId: number, token: string, snapshot: HistorySnapshot): void {
  if (typeof window === 'undefined') return;
  try {
    const trades = capRows(snapshot.trades, MAX_HISTORY_ROWS);
    const balances = capRows(snapshot.balances, MAX_HISTORY_ROWS);
    window.localStorage.setItem(
      HISTORY_KEY(chainId, token),
      JSON.stringify({
        savedAt: Date.now(),
        highBlock: snapshot.highBlock,
        complete: snapshot.complete,
        graduatedTs: snapshot.graduatedTs,
        trades: trades.rows,
        balances: balances.rows,
        // Komplet znaczy dwie rzeczy naraz: wolajacy mial cala historie ORAZ
        // zmiescila sie w suficie. Doszlo do przyciecia - migawka przestaje
        // uprawniac do proszenia serwera o sama roznice.
        full: snapshot.full && trades.full && balances.full,
      })
    );
  } catch {
    // Brak miejsca / tryb prywatny - migawka to wygoda, nie dane. Cisza.
  }
}

export function loadTokenHistory(chainId: number, token: string): HistorySnapshot | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(HISTORY_KEY(chainId, token));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<HistorySnapshot> & { savedAt?: number };
    if (!Array.isArray(parsed.trades) || !Array.isArray(parsed.balances)) return null;
    if (typeof parsed.savedAt !== 'number' || Date.now() - parsed.savedAt > MAX_AGE_MS) return null;
    return {
      highBlock: typeof parsed.highBlock === 'string' ? parsed.highBlock : '0',
      complete: parsed.complete === true,
      graduatedTs: typeof parsed.graduatedTs === 'number' ? parsed.graduatedTs : null,
      trades: parsed.trades as string[],
      balances: parsed.balances as string[],
      full: parsed.full === true,
    };
  } catch {
    return null;
  }
}

/**
 * Migawka LIVE TAPE (ostatnie zdarzenia). Sama tasma ma byc swieza, ale przy
 * WEJSCIU lepiej pokazac ostatni znany pasek od razu i odswiezyc, niz trzymac
 * pusto przez caly skan. Skan i subskrypcja i tak nadpisza to sekundy pozniej.
 */
const FEED_KEY = (chainId: number) => `startpad.feed.${chainId}`;

export function saveFeedSnapshot(chainId: number, feed: unknown[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(FEED_KEY(chainId), JSON.stringify({ savedAt: Date.now(), feed: feed.slice(0, 24) }));
  } catch {
    // Tasma to wygoda, nie dane. Cisza.
  }
}

export function loadFeedSnapshot<T>(chainId: number): T[] | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(FEED_KEY(chainId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { savedAt?: number; feed?: T[] };
    if (!parsed.feed || !Array.isArray(parsed.feed)) return null;
    if (typeof parsed.savedAt !== 'number' || Date.now() - parsed.savedAt > MAX_AGE_MS) return null;
    return parsed.feed;
  } catch {
    return null;
  }
}

/**
 * MIGAWKA PASKA Z /basechat - osobna od tasmy tablicy.
 *
 * Pasek czytal do 23.09.2026 tasme tablicy (`startpad.feed.*`). Jej wiersze
 * nie maja czasu zdarzenia, a cala migawka mogla miec dobe - wiec pasek
 * pokazywal jako "na zywo" transakcje, o ktorych nie wiedzial nawet, z ktorego
 * dnia sa. Pasek trzyma teraz wlasne wiersze, KAZDY z czasem zdarzenia, i przy
 * odczycie odrzuca to, co wypadlo z okna (tickerSource.sanitizeTickerItems).
 *
 * Ten modul tylko przechowuje; ksztalt sprawdza tickerSource, bo localStorage
 * moze trzymac cokolwiek, w tym wersje sprzed zmiany ksztaltu.
 */
const TICKER_KEY = (chainId: number) => `startpad.ticker.v1.${chainId}`;

export function saveTickerTape(chainId: number, items: unknown[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(TICKER_KEY(chainId), JSON.stringify({ savedAt: Date.now(), items: items.slice(0, 24) }));
  } catch {
    // Pasek to wygoda, nie dane. Cisza.
  }
}

export function loadTickerTape(chainId: number): unknown[] | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(TICKER_KEY(chainId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { items?: unknown };
    return Array.isArray(parsed.items) ? parsed.items : null;
  } catch {
    return null;
  }
}
