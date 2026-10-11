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

/**
 * `launchpad` - adres wdrozenia, ktore wyemitowalo `Launched` (od 2026-10 siec
 * moze miec kilka, patrz `LaunchpadDeployment`). Agregaty zapisane wczesniej
 * nie maja tego pola - wszystkie ich tokeny pochodza z pierwszego wdrozenia.
 */
export type LaunchMeta = { name: string; symbol: string; creator: Address; startedAt: number; launchpad?: Address };
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
  /** Kontrakt, ktory wyemitowal log - przy kilku wdrozeniach mowi, z ktorego jest token. */
  address?: string;
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
        ...(log.address ? { launchpad: log.address as Address } : {}),
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

/* ========================================================================== */
/*  LICZBA POSIADACZY I WOLUMEN PULI - to, czego krzywa z definicji nie wie    */
/* ========================================================================== */

/**
 * DWIE LICZBY, KTORE PO GRADUACJI PRZESTAWALY BYC PRAWDZIWE.
 *
 * ===========================================================================
 * OBJAW
 * ===========================================================================
 * 10 wrzesnia 2026 karta $SPHERE na /startpad glosila:
 *
 *     5.54 ETH ($13,677) vol · 40 holders · 8 d
 *
 * Token byl wtedy po graduacji od osmiu dni i handlowal wylacznie w puli
 * Uniswap v4. Zmierzone tego samego dnia, wprost z logow Base mainnet:
 *
 *     wolumen puli    135.56 ETH   (2 528 swapow)   - karta pokazywala 5.54
 *     posiadacze      147 adresow  (6 063 Transfer) - karta pokazywala 40
 *
 * ===========================================================================
 * SKAD SIE BRALA KAZDA Z TYCH POMYLEK
 * ===========================================================================
 * WOLUMEN liczyl sie z `Bought`/`Sold` krzywej. Krzywa po graduacji nie
 * handluje, wiec ta liczba nie byla zla - ona po prostu ZAMARLA w chwili
 * awansu i od tego dnia opisywala przeszlosc pod nazwa terazniejszosci.
 *
 * "HOLDERS" nigdy nie byli posiadaczami. To bylo `buyers.get(token)?.size`,
 * czyli liczba KONT, KTORE HANDLOWALY NA KRZYWEJ. Kto kupil i sprzedal
 * wszystko, liczyl sie dalej; kto kupil w puli, nie liczyl sie wcale.
 *
 * ===========================================================================
 * DLACZEGO TO WOLNO DOLICZAC OKNAMI, TAK JAK RESZTE AGREGATU
 * ===========================================================================
 * Obie wielkosci sa ADDYTYWNE po rozlacznych zakresach blokow - dokladnie jak
 * wolumen krzywej i naliczenia oplat wyzej:
 *   - saldo konta to suma delt z `Transfer` (+do, -od). Suma delt z zakresu A
 *     i z zakresu B daje to samo, co suma z A u B, o ile A i B sa rozlaczne;
 *   - wolumen puli to suma `|amount0|` po swapach, czyli zwykla suma.
 * Obowiazuje wiec ta sama regula, co przy `planBoardScan`: albo cala delta,
 * albo zadna, i zakresy nie moga na siebie zachodzic.
 *
 * ===========================================================================
 * DLACZEGO TO ZYJE OBOK `BoardAggregate`, A NIE W NIM
 * ===========================================================================
 * `BoardAggregate` przychodzi takze Z SERWERA (`/api/launchpad/board/stats`) i
 * `pickAggregateBase` potrafi wybrac wlasnie tamten, bo siega wyzej. Serwer
 * tych dwoch rzeczy nie liczy. Gdyby siedzialy w tym samym obiekcie, wybor
 * serwerowej podstawy dawalby PUSTE salda z `lastBlock` gdzies wysoko - a
 * kolejna delta doliczylaby do nich same swieze transfery i tablica pokazalaby
 * garstke kont jako "wszystkich posiadaczy". Polowa zakresu pod nazwa calosci
 * to ten sam blad, ktory tu naprawiamy, tylko z drugiej strony.
 *
 * Osobny obiekt ma wiec WLASNY znacznik pokrycia i wlasny klucz w
 * `localStorage`, a `complete === false` znaczy "jeszcze nie wiem" - i wtedy
 * karta ma pokazac liczbe z krzywej POD JEJ WLASNA NAZWA, a nie te sama
 * liczbe pod nazwa "holders".
 */

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

/**
 * `0x...dead` NIE JEST SPALENIEM - to zwykly przelew na adres bez klucza.
 *
 * Zmierzone 10 wrzesnia 2026 na $SPHERE: 59 332 928 tokenow lezy na `0x...dead`,
 * a `totalSupply` stoi caly czas na okraglym miliardzie. Podaz zmniejsza tylko
 * przelew na adres ZEROWY, bo tylko on jest w ERC-20 spaleniem.
 *
 * Ma to konkretny skutek dla `supplyReconciles`: liczac `0x...dead` jako
 * spalenie, rownanie rozjezdzalo sie dokladnie o te 59 mln i dowod nie
 * przechodzil NIGDY - czyli liczba posiadaczy nie pokazalaby sie nigdy, mimo
 * ze salda byly policzone poprawnie.
 *
 * Saldo `0x...dead` prowadzimy wiec normalnie (ono istnieje), a z LICZENIA
 * ludzi wypada dopiero na koncu, przez `exclude` - razem z pula i skarbcem.
 * Tam jego miejsce: to saldo, ktore nie nalezy do nikogo, a nie saldo, ktorego
 * nie ma.
 */
export const BURN_SINK = '0x000000000000000000000000000000000000dead';

export type TokenExtras = {
  /** token (lowercase) -> konto (lowercase) -> saldo w jednostkach bazowych. */
  balances: Map<string, Map<string, bigint>>;
  /** token (lowercase) -> suma `|amount0|` swapow puli, w wei. */
  poolVolumeWei: Map<string, bigint>;
  /**
   * Adresy tokenow (lowercase), ktore ten skan naprawde OBEJMOWAL.
   *
   * Bez tego pola migawka klamalaby przy kazdym nowym tokenie: skan lecial po
   * konkretnej liscie adresow, wiec token dopisany do tablicy pozniej ma w
   * `balances` co najwyzej swoje NAJSWIEZSZE transfery, a wygladalby jak token
   * policzony od poczatku. Zero transferow w zakresie i "nie bylo cie w tym
   * zakresie" to z zewnatrz ta sama pusta mapa - i tylko ten zbior je rozroznia.
   */
  tokens: Set<string>;
  /**
   * token -> ile wyemitowano (Transfer OD adresu zerowego) i ile spalono
   * (Transfer DO adresu zerowego albo `0x...dead`) w objetym zakresie.
   *
   * To jest DOWOD, a nie statystyka. Patrz `supplyReconciles`.
   */
  minted: Map<string, bigint>;
  burned: Map<string, bigint>;
  /** Blok, OD ktorego to jest policzone. Ponizej niego danych nie ma. */
  fromBlock: bigint;
  /** Blok, DO ktorego to jest policzone. */
  lastBlock: bigint;
  /**
   * Czy zakres `[fromBlock, lastBlock]` domyka sie do glowy lancucha, czyli
   * czy te liczby wolno pokazac pod ich wlasna nazwa. Dopoki `false`, karta
   * nie ma prawa mowic "holders" ani doliczac wolumenu puli.
   */
  complete: boolean;
};

export function emptyExtras(fromBlock: bigint, tokens: Iterable<string> = []): TokenExtras {
  return {
    balances: new Map(),
    poolVolumeWei: new Map(),
    tokens: new Set([...tokens].map((t) => t.toLowerCase())),
    minted: new Map(),
    burned: new Map(),
    fromBlock,
    lastBlock: fromBlock - 1n,
    complete: false,
  };
}

/**
 * CZY TE SALDA NA PEWNO OBEJMUJA CALA HISTORIE TOKENA.
 *
 * ===========================================================================
 * PROBLEM: DNO SKANU JEST OSZACOWANE, A WYNIK MA BYC PEWNY
 * ===========================================================================
 * Blok, w ktorym token wystartowal, znamy tylko wtedy, gdy glowny skan zszedl
 * az do jego zdarzenia `Launched`. Kiedy nie zszedl (a na Base przy limicie
 * 2 000 blokow na zapytanie zwykle nie schodzi), dno wyliczamy z czasu startu
 * i tempa blokow - czyli SZACUJEMY. Szacunek za niski kosztuje kilka okien
 * wiecej i nic wiecej. Szacunek za wysoki jest grozny: gubimy pierwsze
 * transfery, a niepelne salda wygladaja dokladnie tak samo jak pelne.
 *
 * ===========================================================================
 * DOWOD ZAMIAST ZALOZENIA
 * ===========================================================================
 * Kazdy token ma jedna wielkosc, ktora lancuch podaje wprost i ktora MUSI sie
 * zgodzic, jesli widzielismy wszystkie transfery:
 *
 *     wyemitowane - spalone == totalSupply
 *
 * Emisja to Transfer OD adresu zerowego, spalenie - DO adresu zerowego (i tylko
 * tam, patrz `BURN_SINK`). Jesli nasze dno bylo za wysokie, ucieklismy czesci
 * emisji i lewa strona wychodzi mniejsza. Rownosc jest wiec dowodem na to, ze
 * zakres obejmuje cala historie tokena - niezaleznie od tego, czy dno bylo
 * trafione, czy tylko dostatecznie nisko.
 *
 * Zmierzone na $SPHERE 10 wrzesnia 2026, dnem 50 552 093 (o ~197 tys. blokow
 * ponizej startu): 6 068 transferow, emisja 1e27, spalenie 0, `totalSupply`
 * 1e27 - rownanie sie domyka.
 *
 * `false` znaczy "nie wiem", nie "zle" - i wtedy karta zostaje przy liczbach
 * krzywej pod ich wlasna nazwa.
 */
export function supplyReconciles(extras: TokenExtras, token: string, totalSupply: bigint | undefined): boolean {
  if (totalSupply === undefined) return false;
  const key = token.toLowerCase();
  if (!extras.tokens.has(key)) return false;
  return (extras.minted.get(key) ?? 0n) - (extras.burned.get(key) ?? 0n) === totalSupply;
}

/**
 * Delty sald z logow `Transfer`. Skan leci JEDNYM zapytaniem po tablicy adresow
 * tokenow naraz (patrz wolajacy), wiec kazdy log niesie swoj `address` i to on
 * rozdziela wynik na tokeny.
 */
export function applyTransferLogs(extras: TokenExtras, logs: ExtrasLog[]): void {
  for (const log of logs) {
    const token = log.address?.toLowerCase();
    const from = log.from?.toLowerCase();
    const to = log.to?.toLowerCase();
    const value = log.value;
    if (!token || !from || !to || value === undefined) continue;

    const perToken = extras.balances.get(token) ?? new Map<string, bigint>();
    // Zerowy adres to mennica i spalarnia, nie konto - jego "saldo" byloby
    // ujemna suma calego obrotu. Nie prowadzimy go w ogole, ale ZLICZAMY, ile
    // przez niego przeszlo: to jest material dowodowy dla `supplyReconciles`.
    if (from === ZERO_ADDRESS) extras.minted.set(token, (extras.minted.get(token) ?? 0n) + value);
    else perToken.set(from, (perToken.get(from) ?? 0n) - value);

    if (to === ZERO_ADDRESS) extras.burned.set(token, (extras.burned.get(token) ?? 0n) + value);
    else perToken.set(to, (perToken.get(to) ?? 0n) + value);

    extras.balances.set(token, perToken);
  }
}

/**
 * Wolumen puli z logow `Swap` PoolManagera. `amount0` jest ze strony
 * swapujacego (ujemne = zaplacil ETH, czyli kupil), wiec bierzemy wartosc
 * bezwzgledna: interesuje nas obrot, nie kierunek.
 *
 * Token jest zawsze `currency1`, a natywny ETH `currency0` - `LiquidityVault`
 * seeduje pule z `address(0)` jako zerowa waluta i sprawdza to przy zakladaniu,
 * wiec `amount0` to ZAWSZE noga ETH.
 */
export function applySwapLogs(extras: TokenExtras, logs: SwapLog[], tokenOfPool: Map<string, string>): void {
  for (const log of logs) {
    const poolId = log.poolId?.toLowerCase();
    if (!poolId || log.amount0 === undefined) continue;
    const token = tokenOfPool.get(poolId);
    if (!token) continue;
    const abs = log.amount0 < 0n ? -log.amount0 : log.amount0;
    extras.poolVolumeWei.set(token, (extras.poolVolumeWei.get(token) ?? 0n) + abs);
  }
}

/** Log `Transfer` w postaci, w ktorej ten modul go potrzebuje. */
export type ExtrasLog = { address?: string; from?: string; to?: string; value?: bigint };
/** Log `Swap` PoolManagera - tyle, ile naprawde czytamy. */
export type SwapLog = { poolId?: string; amount0?: bigint };

/**
 * Ilu ludzi NAPRAWDE trzyma ten token. Liczymy konta z saldem dodatnim, a
 * `exclude` wypisuje adresy, ktore saldo maja, ale posiadaczami nie sa -
 * przede wszystkim sam PoolManager, bo salda AMM nikt nie nazywa posiadaczem:
 * to jest rynek, a nie jego uczestnik.
 *
 * `null` znaczy "zakres jeszcze nie domkniety", a nie "zero" - i tak ma byc
 * czytane wyzej.
 */
export function holderCount(
  extras: TokenExtras,
  token: string,
  options: { exclude?: Iterable<string>; totalSupply?: bigint } = {}
): number | null {
  const key = token.toLowerCase();
  if (!extras.complete || !extras.tokens.has(key)) return null;
  // Bez zgodnosci z podazia nie wiemy, czy dno skanu bylo dosc nisko - a
  // niepelne salda wygladaja jak pelne. Wtedy uczciwa odpowiedzia jest "nie wiem".
  if (!supplyReconciles(extras, key, options.totalSupply)) return null;
  // Token objety skanem, ktory nie ma ani jednego transferu, ma zero posiadaczy
  // - i to jest odpowiedz, a nie brak odpowiedzi.
  const perToken = extras.balances.get(key) ?? new Map<string, bigint>();
  const skip = new Set([...(options.exclude ?? [])].map((a) => a.toLowerCase()));
  let count = 0;
  for (const [account, balance] of perToken) {
    if (balance > 0n && !skip.has(account)) count += 1;
  }
  return count;
}

/** Wolumen puli w ETH. `null` = zakres niedomkniety, czyli "nie wiem". */
export function poolVolumeEth(extras: TokenExtras, token: string): number | null {
  const key = token.toLowerCase();
  if (!extras.complete || !extras.tokens.has(key)) return null;
  return Number(extras.poolVolumeWei.get(key) ?? 0n) / 1e18;
}

export type SerializedExtras = {
  balances: Array<[string, Array<[string, string]>]>;
  poolVolumeWei: Array<[string, string]>;
  tokens: string[];
  minted: Array<[string, string]>;
  burned: Array<[string, string]>;
  fromBlock: string;
  lastBlock: string;
  complete: boolean;
};

const weiPairs = (map: Map<string, bigint>): Array<[string, string]> =>
  [...map.entries()].map(([key, wei]) => [key, wei.toString()] as [string, string]);

export function serializeExtras(extras: TokenExtras): SerializedExtras {
  return {
    // Konta z saldem zero to slad po kims, kto wyszedl - do liczenia sa
    // niepotrzebne, a w `localStorage` zajmuja tyle samo, co posiadacz.
    balances: [...extras.balances.entries()].map(
      ([token, perToken]) =>
        [
          token,
          [...perToken.entries()].filter(([, wei]) => wei !== 0n).map(([account, wei]) => [account, wei.toString()] as [string, string]),
        ] as [string, Array<[string, string]>]
    ),
    poolVolumeWei: weiPairs(extras.poolVolumeWei),
    tokens: [...extras.tokens],
    minted: weiPairs(extras.minted),
    burned: weiPairs(extras.burned),
    fromBlock: extras.fromBlock.toString(),
    lastBlock: extras.lastBlock.toString(),
    complete: extras.complete,
  };
}

/**
 * Odczyt tak samo NIEUFNY, jak przy `parseAggregate`: cokolwiek nie pasuje do
 * ksztaltu, oddajemy `null`. Polowiczne salda sa tu grozniejsze niz polowiczny
 * wolumen - z nich liczy sie liczba ludzi, a ta ma stac na karcie pod slowem
 * "holders".
 */
export function parseExtras(raw: unknown): TokenExtras | null {
  if (!raw || typeof raw !== 'object') return null;
  const input = raw as Partial<SerializedExtras>;
  if (typeof input.fromBlock !== 'string' || typeof input.lastBlock !== 'string') return null;
  if (!/^\d+$/.test(input.fromBlock) || !/^\d+$/.test(input.lastBlock)) return null;

  try {
    if (!Array.isArray(input.tokens) || input.tokens.some((t) => typeof t !== 'string')) return null;
    const extras = emptyExtras(BigInt(input.fromBlock), input.tokens);
    extras.lastBlock = BigInt(input.lastBlock);
    extras.complete = input.complete === true;
    if (extras.lastBlock < extras.fromBlock - 1n) return null;

    for (const [token, perTokenRaw] of Array.isArray(input.balances) ? input.balances : []) {
      if (typeof token !== 'string' || !Array.isArray(perTokenRaw)) return null;
      const perToken = new Map<string, bigint>();
      for (const [account, wei] of perTokenRaw) {
        if (typeof account !== 'string' || typeof wei !== 'string') return null;
        perToken.set(account, BigInt(wei));
      }
      extras.balances.set(token, perToken);
    }
    // Wolumen, emisja i spalenie to sumy wartosci bezwzglednych - ujemna
    // wartosc znaczy uszkodzony zapis, a nie maly rynek.
    for (const [field, target] of [
      [input.poolVolumeWei, extras.poolVolumeWei],
      [input.minted, extras.minted],
      [input.burned, extras.burned],
    ] as Array<[unknown, Map<string, bigint>]>) {
      for (const [token, wei] of Array.isArray(field) ? (field as Array<[string, string]>) : []) {
        if (typeof token !== 'string' || typeof wei !== 'string') return null;
        const value = BigInt(wei);
        if (value < 0n) return null;
        target.set(token, value);
      }
    }
    return extras;
  } catch {
    return null;
  }
}

/**
 * Od ktorego bloku dociagac salda przy tym wejsciu - i czy wolno dosumowac.
 *
 * Ta sama regula, co w `planBoardScan`, plus jeden warunek wiecej: zapamietane
 * salda wolno kontynuowac TYLKO wtedy, gdy zaczynaja sie nie wyzej niz tam,
 * gdzie zaczac chcemy. Migawka policzona od bloku graduacji nie stanie sie
 * migawka od bloku startu tokena przez dosumowanie swiezych blokow - brakowaloby
 * jej srodka, a z zewnatrz wygladalaby identycznie jak pelna.
 */
export function planExtrasScan(input: {
  cached: TokenExtras | null;
  head: bigint;
  floor: bigint;
  /** Tokeny, ktore ten skan ma objac - migawka bez ktoregos z nich nie nadaje sie do kontynuacji. */
  tokens: string[];
}): { from: bigint; base: TokenExtras } {
  const { cached, head, floor, tokens } = input;
  const wanted = tokens.map((t) => t.toLowerCase());
  const fresh = () => ({ from: floor, base: emptyExtras(floor, wanted) });

  if (!cached || cached.fromBlock > floor) return fresh();
  // Glowa ponizej naszego znacznika znaczy inna siec albo reorganizacje - takiej
  // migawki nie wolno dosumowac, bo jej zakres nie jest juz tym, co mowi.
  if (head < cached.lastBlock) return fresh();
  // Token spoza pokrycia migawki mialby policzone tylko swieze bloki, a
  // wygladalby na policzonego od poczatku. Wtedy liczymy caly zbior od nowa.
  if (wanted.some((token) => !cached.tokens.has(token))) return fresh();
  return { from: cached.lastBlock + 1n, base: cached };
}

/* ========================================================================== */
/*  ILE BLOKOW NA JEDNO `eth_getLogs` - PYTAMY RPC, ZAMIAST ZGADYWAC          */
/* ========================================================================== */

/**
 * OKNO SKANU JEST WLASNOSCIA ENDPOINTU, A NIE SIECI - I POTRAFI SIE ZMIENIC.
 *
 * ===========================================================================
 * OBJAW
 * ===========================================================================
 * 10 wrzesnia 2026 KAZDE okno skanu tablicy na Base konczylo sie bledem.
 * Zmierzone wprost na `mainnet.base.org`, oknem z konfiguracji (9 500 blokow):
 *
 *     HTTP 413  {"code":-32614,"message":"eth_getLogs is limited to a 2,000 range"}
 *
 * Nie bylo tego widac, bo degradacja dziala jak powinna: padniete okno
 * podbija `failedWindows`, skan przestaje byc wiarygodny, agregat nie jest
 * zapisywany, a wiersze zostaja na ekranie. Tablica wygladala wiec zdrowo,
 * tylko skan z przegladarki nie wnosil do niej NIC - wszystko, co bylo widac,
 * pochodzilo z agregatu serwera. Stad "stare staty": nie bylo zadnej sciezki,
 * ktora doniosla by swiezsze liczby.
 *
 * ===========================================================================
 * DLACZEGO NIE WPISUJEMY PO PROSTU 2 000
 * ===========================================================================
 * W `config.ts` stoi 9 500 z komentarzem "ZMIERZONE 2026-08-13: limit to
 * 10 000, nie 2 000". Ten pomiar byl prawdziwy w dniu, w ktorym go zrobiono -
 * Base zaciesnil limit pozniej. Wpisanie teraz 2 000 na sztywno to ta sama
 * pomylka o miesiac pozniej: nasze wlasne endpointy (CDP) nadal daja 10 000,
 * wiec staly zjazd do 2 000 spowolnilby skan pieciokrotnie tam, gdzie nie ma
 * takiej potrzeby.
 *
 * Dlatego okna nie zgadujemy ani nie pamietamy - PYTAMY o nie endpoint. RPC
 * podaje swoj limit wprost w tresci bledu, wiec bierzemy go stamtad, a gdy nie
 * poda, schodzimy do najostrozniejszej wartosci, jaka spotykamy w praktyce.
 */

/** Okno, do ktorego schodzimy, gdy RPC odmawia i nie mowi, ile wolno. */
export const SAFE_LOG_WINDOW = 2_000n;

/**
 * Limit zakresu wyluskany z tresci bledu RPC, albo `null`, gdy to nie jest
 * blad o zakresie. Rozpoznajemy zapis z separatorem tysiecy ("2,000") i bez.
 *
 * `null` znaczy "ten blad nie mowi nic o oknie" - wtedy wolajacy ma go
 * potraktowac jak zwykla awarie okna (ponowienie, `failedWindows`), a NIE jak
 * powod do zmiany rozmiaru. Blad sieci nie jest informacja o limicie.
 */
export function logRangeLimitFrom(error: unknown): bigint | null {
  const text =
    error instanceof Error ? `${error.message} ${(error as { details?: string }).details ?? ''}` : String(error ?? '');
  if (!/\b(range|block range|limited to)\b/i.test(text)) return null;
  const match = text.match(/limited to (?:a )?([\d,_ ]+)\s*(?:block\s*)?range/i) ?? text.match(/range of ([\d,_ ]+)/i);
  if (match) {
    const digits = match[1].replace(/[,_ ]/g, '');
    if (/^\d+$/.test(digits)) {
      const limit = BigInt(digits);
      if (limit > 0n) return limit;
    }
  }
  // Blad JEST o zakresie, ale bez liczby - schodzimy do bezpiecznej wartosci.
  return SAFE_LOG_WINDOW;
}
