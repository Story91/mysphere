/**
 * KIEDY WOLNO SKASOWAC TOKEN Z TABLICY.
 *
 * ===========================================================================
 * OBJAW, KTORY TO WYWOLAL
 * ===========================================================================
 * 13 sierpnia 2026: przy zywszym ruchu tokeny znikaly z /startpad. Dla kogos,
 * kto trzyma tam pieniadze, zniknieciе tokena z listy nie wyglada jak usterka
 * wyswietlania - wyglada jak utrata srodkow.
 *
 * ===========================================================================
 * PRZYCZYNA
 * ===========================================================================
 * Okno skanu, ktore padlo dwa razy pod rzad, oddawalo PUSTA LISTE zamiast
 * bledu. Skan konczyl sie wiec jako kompletny (`lowestScanned` dochodzil do
 * bloku wdrozenia), znacznik uciecia byl wylaczony, a regula scalania
 * wyrzucala kazdy token starszy niz kwadrans, ktorego zdarzenie `Launched`
 * bylo akurat w tym oknie.
 *
 * Awaria odczytu udawala fakt. To jest ta klasa bledu, ktora tu naprawiamy:
 * BRAK DANYCH NIE JEST DANYMI. Skan ma prawo skasowac wiersz tylko wtedy, gdy
 * naprawde przeczytal caly zakres - a nie wtedy, gdy tak mu sie wydaje.
 *
 * Wiersz spoza skanu ZOSTAJE, dopoki skan nie jest wiarygodny. Wyrzucamy go
 * dopiero przy skanie kompletnym, bo wtedy jego nieobecnosc znaczy cos realnego:
 * token pochodzi z martwego wdrozenia i zaden skan go juz nie odda.
 */

import type { Address } from 'viem';

export type ScanHealth = {
  /** Ile okien nie przeszlo mimo ponowienia. */
  failedWindows: number;
  /** Najnizszy blok, ktory skan objal. */
  lowestScanned: bigint;
  /** Blok wdrozenia launchpada - nizej logow z definicji nie ma. */
  deployBlock: bigint;
};

/**
 * Czy temu skanowi wolno rozstrzygac o NIEOBECNOSCI tokena.
 *
 * Wymaga obu rzeczy naraz: zadne okno nie padlo ORAZ zakres siega bloku
 * wdrozenia. Samo dojscie do dna nie wystarcza, bo dziura w srodku zakresu
 * wyglada z zewnatrz dokladnie tak samo jak brak zdarzen.
 */
export function scanIsTrustworthy(health: ScanHealth): boolean {
  return health.failedWindows === 0 && health.lowestScanned <= health.deployBlock;
}

/** Tyle czasu po starcie RPC potrafi jeszcze nie oddawac zdarzenia `Launched`. */
const RECENT_SEC = 15 * 60;

export type BoardRow = {
  /** Falsz albo brak = wiersz podgladowy (mock), nie token z lancucha. */
  live?: boolean;
  address?: string | null;
  startedAt?: number | null;
};

/**
 * Czy zachowac wiersz, ktorego biezacy skan NIE zwrocil.
 *
 * Trzy powody, dla ktorych token moze nie byc w wyniku skanu, i tylko jeden z
 * nich znaczy "tego tokena nie ma":
 *   1. wystartowal przed chwila i RPC jeszcze go nie indeksuje  -> zostaje;
 *   2. skan jest niepelny (padniete okno albo sufit okien)      -> zostaje;
 *   3. skan jest kompletny i mimo to go nie widzi               -> znika.
 */
export function shouldKeepUnscanned(
  row: BoardRow,
  context: { now: number; scanned: Set<string>; trustworthy: boolean }
): boolean {
  if (!row.live || !row.address) return false;
  if (context.scanned.has(row.address.toLowerCase())) return false;
  const fresh = typeof row.startedAt === 'number' && context.now - row.startedAt < RECENT_SEC;
  return fresh || !context.trustworthy;
}

/* ========================================================================== */
/*  AGREGAT TABLICY - co skan zebral, w formie, ktora WOLNO DOSUMOWAC          */
/* ========================================================================== */

/**
 * PO CO TABLICA MA AGREGAT, A NIE TYLKO WIERSZE.
 *
 * Do 15 sierpnia 2026 `/startpad` przy KAZDYM wejsciu skanowal lancuch od glowy
 * az do bloku wdrozenia launchpada. To nie jest staly koszt, tylko rosnacy:
 * przy oknie 9500 blokow i bloku co 2 s Base dokłada ~4,5 okna na dobe. Pomiar
 * z 15 sierpnia (glowa 49 982 248, wdrozenie 49 843 030): 15 okien dzis, 47 za
 * tydzien, 79 za dwa tygodnie, a po ~16,6 dnia sufit `maxScanWindows` (90) i
 * skan przestaje siegac startu - wtedy najstarsze tokeny traca wolumen i ceny.
 *
 * Wszystko, co tablica liczy z logow, jest ADDYTYWNE: wolumen, liczba
 * transakcji, zbior handlujacych, naliczenia oplat. Wystarczy wiec zapamietac
 * WYNIK plus blok, do ktorego jest policzony, a nastepnym razem doliczyc same
 * nowe bloki. Ta sama zasada, co przy historii tokena, tylko w localStorage
 * zamiast w bazie - tablica nie ma prawa kosztowac ani jednego odczytu bazy.
 *
 * WARUNEK POPRAWNOSCI: zakresy NIE MOGA na siebie zachodzic. Pokrycie jest
 * jednym ciaglym przedzialem od bloku wdrozenia, a delta zaczyna sie dokladnie
 * jeden blok nad nim. Ceny i tasma sa dodatkowo odporne same z siebie
 * (deduplikacja po kluczu `order` i `id`), ale wolumenu nikt nie odkreci - stad
 * regula "albo cala delta, albo zadna" po stronie wolajacego.
 */

export type LaunchMeta = { name: string; symbol: string; creator: Address; startedAt: number };
export type FeedTone = 'buy' | 'sell' | 'launch' | 'graduate';
export type FeedEntry = { id: string; token: Address; label: string; eth?: number; tone: FeedTone; order: number };
export type PricePoint = { order: number; price: number };

export type BoardAggregate = {
  launched: Map<Address, LaunchMeta>;
  buyers: Map<Address, Set<Address>>;
  activity: Map<Address, { volume: number; trades: number }>;
  hookCreatorEth: Map<Address, bigint>;
  /** konto (lowercase) -> token -> wei naliczone stronie tworcy (FeeAccrued kind 1). */
  creatorSideEarned: Map<string, Map<Address, bigint>>;
  /** konto (lowercase) -> ten sam adres w checksumie, do wyswietlenia. */
  accountDisplay: Map<string, Address>;
  priceEntries: Map<Address, PricePoint[]>;
  feed: FeedEntry[];
};

/**
 * Sufity zapisu. Sparkline czyta 12 ostatnich cen, tasma pokazuje 24 wpisy -
 * trzymamy z zapasem, ale nie bez konca, bo localStorage ma ~5 MB na cala
 * domene i dzieli je z migawkami historii tokenow.
 */
export const MAX_PRICES_PER_TOKEN = 48;
export const MAX_FEED_ENTRIES = 48;
/**
 * Sufit zbioru handlujacych na token. Po jego przekroczeniu liczba w kolumnie
 * "holders" przestaje rosnac i NIE jest to ukryte: tablica i tak bierze wyzsza
 * z dwoch liczb (ta i indeks Blockscouta), wiec token z realnym tlumem dostaje
 * prawdziwa liczbe z indeksu, a nie nasze nasycenie.
 */
export const MAX_BUYERS_PER_TOKEN = 500;

export function emptyAggregate(): BoardAggregate {
  return {
    launched: new Map(),
    buyers: new Map(),
    activity: new Map(),
    hookCreatorEth: new Map(),
    creatorSideEarned: new Map(),
    accountDisplay: new Map(),
    priceEntries: new Map(),
    feed: [],
  };
}

/** Log tak, jak widzi go ten modul: tyle, ile naprawde czytamy. */
export type BoardLog = {
  eventName?: string;
  args: Record<string, unknown>;
  transactionHash?: string;
  blockNumber: bigint | null;
  logIndex: number | null;
};

const orderOf = (log: BoardLog) => Number(log.blockNumber ?? 0n) * 10_000 + Number(log.logIndex ?? 0);

function addBuyer(agg: BoardAggregate, token: Address, account: Address | undefined) {
  if (!account) return;
  const set = agg.buyers.get(token) ?? new Set<Address>();
  if (set.size < MAX_BUYERS_PER_TOKEN) set.add(account);
  agg.buyers.set(token, set);
}

function addTrade(agg: BoardAggregate, token: Address, eth: number) {
  const current = agg.activity.get(token) ?? { volume: 0, trades: 0 };
  agg.activity.set(token, { volume: current.volume + eth, trades: current.trades + 1 });
}

/**
 * Logi -> agregat. Kolejnosc logow nie ma znaczenia: kazdy wpis niesie klucz
 * (blok, logIndex), a ceny i tasma sortuja sie po nim dopiero przy uzyciu.
 *
 * `ethOf` i `priceOf` przychodza argumentami, bo skala krzywej i jednostka sa
 * wlasnoscia SIECI, a ten modul nie ma prawa jej znac - inaczej Arc liczylby
 * ceny wirtualna rezerwa Base.
 */
export function reduceBoardLogs(
  logs: BoardLog[],
  helpers: {
    ethOf: (wei: bigint) => number;
    priceOf: (ethReserveAfter: bigint, tokenReserveAfter: bigint) => number;
  },
  into: BoardAggregate = emptyAggregate()
): BoardAggregate {
  const agg = into;

  for (const log of logs) {
    const token = log.args.token as Address | undefined;
    if (!token) continue;
    const order = orderOf(log);
    const hash = log.transactionHash ?? '';

    const pushPrice = () => {
      const ethReserveAfter = log.args.ethReserveAfter as bigint | undefined;
      const tokenReserveAfter = log.args.tokenReserveAfter as bigint | undefined;
      if (ethReserveAfter === undefined || tokenReserveAfter === undefined || tokenReserveAfter <= 0n) return;
      const list = agg.priceEntries.get(token) ?? [];
      list.push({ order, price: helpers.priceOf(ethReserveAfter, tokenReserveAfter) });
      agg.priceEntries.set(token, list);
    };

    if (log.eventName === 'Launched') {
      agg.launched.set(token, {
        name: log.args.name as string,
        symbol: log.args.symbol as string,
        creator: log.args.creator as Address,
        startedAt: Number(log.args.startedAt ?? 0),
      });
      agg.feed.push({ id: `${hash}-launch`, token, label: 'Launched', tone: 'launch', order });
    } else if (log.eventName === 'Bought') {
      addBuyer(agg, token, log.args.buyer as Address | undefined);
      const eth = helpers.ethOf(log.args.ethNet as bigint);
      addTrade(agg, token, eth);
      pushPrice();
      agg.feed.push({ id: `${hash}-buy`, token, label: 'Buy', eth, tone: 'buy', order });
    } else if (log.eventName === 'Sold') {
      addBuyer(agg, token, log.args.seller as Address | undefined);
      const eth = helpers.ethOf(log.args.ethOut as bigint);
      addTrade(agg, token, eth);
      pushPrice();
      agg.feed.push({ id: `${hash}-sell`, token, label: 'Sell', eth, tone: 'sell', order });
    } else if (log.eventName === 'HookFeeSettled') {
      // Hook rozlicza tworcy jego czesc oplat puli JUZ PO potraceniu
      // auto-buybacku (buyback schodzi wylacznie z dzialki tworcy), wiec
      // ethToCreator sumujemy wprost - bez odtwarzania podzialu.
      const ethToCreator = log.args.ethToCreator as bigint | undefined;
      if (ethToCreator) agg.hookCreatorEth.set(token, (agg.hookCreatorEth.get(token) ?? 0n) + ethToCreator);
    } else if (log.eventName === 'FeeAccrued') {
      // kind 1 = strona TWORCY oplaty handlowej, per faktyczny ODBIORCA. To
      // rozlicza splity miedzy odbiorcow co do wei, w przeciwienstwie do
      // mnozenia feeEth przez konfiguracje.
      const kind = Number(log.args.kind ?? 255);
      const account = log.args.account as Address | undefined;
      const amount = log.args.amount as bigint | undefined;
      if (kind === 1 && account && amount) {
        const key = account.toLowerCase();
        agg.accountDisplay.set(key, account);
        const perToken = agg.creatorSideEarned.get(key) ?? new Map<Address, bigint>();
        perToken.set(token, (perToken.get(token) ?? 0n) + amount);
        agg.creatorSideEarned.set(key, perToken);
      }
    }
  }

  return agg;
}

/**
 * Scala agregat zapamietany z agregatem swiezej delty.
 *
 * Sumy sa addytywne, zbiory ida w unie, a ceny i tasma sa dodatkowo
 * deduplikowane po kluczu zdarzenia - to ostatnie jest siatka bezpieczenstwa na
 * wypadek zachodzacych zakresow, a nie pozwoleniem na nie.
 */
export function mergeAggregates(base: BoardAggregate, delta: BoardAggregate): BoardAggregate {
  const out = emptyAggregate();

  for (const [token, meta] of base.launched) out.launched.set(token, meta);
  // Swiezy odczyt wygrywa: identyczne dane, ale pochodza z tej samej rundy co
  // reszta delty.
  for (const [token, meta] of delta.launched) out.launched.set(token, meta);

  for (const source of [base.buyers, delta.buyers]) {
    for (const [token, set] of source) {
      const target = out.buyers.get(token) ?? new Set<Address>();
      for (const account of set) {
        if (target.size >= MAX_BUYERS_PER_TOKEN) break;
        target.add(account);
      }
      out.buyers.set(token, target);
    }
  }

  for (const source of [base.activity, delta.activity]) {
    for (const [token, entry] of source) {
      const current = out.activity.get(token) ?? { volume: 0, trades: 0 };
      out.activity.set(token, { volume: current.volume + entry.volume, trades: current.trades + entry.trades });
    }
  }

  for (const source of [base.hookCreatorEth, delta.hookCreatorEth]) {
    for (const [token, wei] of source) out.hookCreatorEth.set(token, (out.hookCreatorEth.get(token) ?? 0n) + wei);
  }

  for (const source of [base.creatorSideEarned, delta.creatorSideEarned]) {
    for (const [account, perToken] of source) {
      const target = out.creatorSideEarned.get(account) ?? new Map<Address, bigint>();
      for (const [token, wei] of perToken) target.set(token, (target.get(token) ?? 0n) + wei);
      out.creatorSideEarned.set(account, target);
    }
  }

  for (const source of [base.accountDisplay, delta.accountDisplay]) {
    for (const [key, display] of source) out.accountDisplay.set(key, display);
  }

  for (const source of [base.priceEntries, delta.priceEntries]) {
    for (const [token, points] of source) {
      const target = out.priceEntries.get(token) ?? [];
      target.push(...points);
      out.priceEntries.set(token, target);
    }
  }
  for (const [token, points] of out.priceEntries) {
    const byOrder = new Map<number, PricePoint>();
    for (const point of points) byOrder.set(point.order, point);
    out.priceEntries.set(
      token,
      [...byOrder.values()].sort((a, b) => a.order - b.order).slice(-MAX_PRICES_PER_TOKEN)
    );
  }

  const feedById = new Map<string, FeedEntry>();
  for (const entry of [...base.feed, ...delta.feed]) feedById.set(entry.id, entry);
  out.feed = [...feedById.values()].sort((a, b) => b.order - a.order).slice(0, MAX_FEED_ENTRIES);

  return out;
}

/**
 * Od ktorego bloku skanowac przy tym wejsciu.
 *
 * `resume: true` znaczy, ze zapamietany agregat wolno DOSUMOWAC - a to jest
 * jedyna rzecz w calym tym mechanizmie, ktora naprawde musi byc poprawna.
 * Trzy powody, dla ktorych agregatowi nie wolno wierzyc:
 *   1. nie siega bloku wdrozenia (pokrycie nie jest ciagle od poczatku);
 *   2. glowa cofnela sie pod nim (inny endpoint, inna siec, reorganizacja);
 *   3. zaleglosc jest wieksza niz jedno zadanie uniesie - delta zostawilaby
 *      dziure, ktorej pozniej nikt nie odrozni od prawdy.
 */
export function planBoardScan(input: {
  cachedLastBlock: bigint | null;
  head: bigint;
  deployBlock: bigint;
  maxSpan: bigint;
}): { floor: bigint; resume: boolean } {
  const { cachedLastBlock, head, deployBlock, maxSpan } = input;
  if (cachedLastBlock === null) return { floor: deployBlock, resume: false };
  if (cachedLastBlock < deployBlock) return { floor: deployBlock, resume: false };
  const behind = head - cachedLastBlock;
  if (behind < 0n || behind > maxSpan) return { floor: deployBlock, resume: false };
  return { floor: cachedLastBlock + 1n, resume: true };
}

/* ========================================================================== */
/*  ZAPIS I ODCZYT AGREGATU                                                    */
/* ========================================================================== */

/**
 * Postac do JSON-a: mapy jako pary, biginty dziesietnie. Ta sama zasada, co
 * przy historii tokena - jeden format zapisu, zeby nie istnial drugi, ktory
 * moglby sie z nim rozjechac.
 */
export type SerializedAggregate = {
  launched: Array<[Address, LaunchMeta]>;
  buyers: Array<[Address, Address[]]>;
  activity: Array<[Address, { volume: number; trades: number }]>;
  hookCreatorEth: Array<[Address, string]>;
  creatorSideEarned: Array<[string, Array<[Address, string]>]>;
  accountDisplay: Array<[string, Address]>;
  priceEntries: Array<[Address, PricePoint[]]>;
  feed: FeedEntry[];
};

export function serializeAggregate(agg: BoardAggregate): SerializedAggregate {
  return {
    launched: [...agg.launched.entries()],
    buyers: [...agg.buyers.entries()].map(([token, set]) => [token, [...set]] as [Address, Address[]]),
    activity: [...agg.activity.entries()],
    hookCreatorEth: [...agg.hookCreatorEth.entries()].map(([token, wei]) => [token, wei.toString()] as [Address, string]),
    creatorSideEarned: [...agg.creatorSideEarned.entries()].map(
      ([account, perToken]) =>
        [account, [...perToken.entries()].map(([token, wei]) => [token, wei.toString()] as [Address, string])] as [
          string,
          Array<[Address, string]>,
        ]
    ),
    accountDisplay: [...agg.accountDisplay.entries()],
    priceEntries: [...agg.priceEntries.entries()].map(
      ([token, points]) => [token, points.slice(-MAX_PRICES_PER_TOKEN)] as [Address, PricePoint[]]
    ),
    feed: agg.feed.slice(0, MAX_FEED_ENTRIES),
  };
}

/**
 * Odczyt jest NIEUFNY: to jest cudzy JSON z localStorage, ktory przezyl zmiane
 * wersji aplikacji, tryb prywatny i reczne grzebanie. Cokolwiek nie pasuje do
 * ksztaltu - oddajemy `null`, czyli "nie ma migawki", a wolajacy robi pelny
 * skan. Polowiczny agregat bylby gorszy niz jego brak, bo dosumowalby sie do
 * kolejnych i juz nigdy nie wrocil do prawdy.
 */
export function parseAggregate(raw: unknown): BoardAggregate | null {
  if (!raw || typeof raw !== 'object') return null;
  const input = raw as Partial<SerializedAggregate>;
  const pairs = <T,>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : []);

  try {
    const agg = emptyAggregate();

    for (const [token, meta] of pairs<[Address, LaunchMeta]>(input.launched)) {
      if (typeof token !== 'string' || !meta || typeof meta !== 'object') return null;
      agg.launched.set(token, meta);
    }
    for (const [token, accounts] of pairs<[Address, Address[]]>(input.buyers)) {
      if (typeof token !== 'string' || !Array.isArray(accounts)) return null;
      agg.buyers.set(token, new Set(accounts.slice(0, MAX_BUYERS_PER_TOKEN)));
    }
    for (const [token, entry] of pairs<[Address, { volume: number; trades: number }]>(input.activity)) {
      if (typeof token !== 'string' || !entry) return null;
      if (!Number.isFinite(entry.volume) || !Number.isFinite(entry.trades)) return null;
      // Ujemny wolumen albo ujemna liczba transakcji znaczy uszkodzony zapis,
      // a nie maly rynek - taki agregat nie ma prawa isc dalej.
      if (entry.volume < 0 || entry.trades < 0) return null;
      agg.activity.set(token, { volume: entry.volume, trades: entry.trades });
    }
    for (const [token, wei] of pairs<[Address, string]>(input.hookCreatorEth)) {
      agg.hookCreatorEth.set(token, BigInt(wei));
    }
    for (const [account, perToken] of pairs<[string, Array<[Address, string]>]>(input.creatorSideEarned)) {
      const target = new Map<Address, bigint>();
      for (const [token, wei] of pairs<[Address, string]>(perToken)) target.set(token, BigInt(wei));
      agg.creatorSideEarned.set(account, target);
    }
    for (const [key, display] of pairs<[string, Address]>(input.accountDisplay)) {
      agg.accountDisplay.set(key, display);
    }
    for (const [token, points] of pairs<[Address, PricePoint[]]>(input.priceEntries)) {
      if (!Array.isArray(points)) return null;
      agg.priceEntries.set(
        token,
        points.filter((point) => point && Number.isFinite(point.order) && Number.isFinite(point.price))
      );
    }
    agg.feed = pairs<FeedEntry>(input.feed).filter((entry) => entry && typeof entry.id === 'string');

    return agg;
  } catch {
    // BigInt() na smieciu, brakujace pole, cokolwiek - migawki nie ma.
    return null;
  }
}
