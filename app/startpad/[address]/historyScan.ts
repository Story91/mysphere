import { getAbiItem } from 'viem';
import { erc20Abi, launchpadAbi } from '../config';
import { priceWeiAfter, SUPPLY_WEI, ZERO_ADDRESS, type TradeEntry } from './detailShared';

/**
 * Historia tokena z logow - CZYSTA logika, bez Reacta i bez stanu.
 *
 * ===========================================================================
 * PO CO TO STOI OSOBNO
 * ===========================================================================
 * Ten sam skan robia dwa miejsca: serwer (`/api/launchpad/history`, ktory
 * napelnia cache) i przegladarka (`useTokenHistory`, gdy cache jest niedostepny).
 * Dwie kopie tego dekodowania znaczylyby dwie rozne historie tego samego
 * tokena, zaleznie od tego, ktora sciezka zadziala - a historia jest tu
 * podstawa wykresu i listy transakcji.
 *
 * Modul NIE importuje aktywnej sieci. Adres launchpada, dno skanu i tempo
 * blokow przychodza argumentami, bo serwer obsluguje wszystkie sieci naraz, a
 * `ACTIVE_LAUNCHPAD_NETWORK` jest pojeciem przegladarki (siedzi w localStorage).
 */

export const LAUNCHED_EVENT = getAbiItem({ abi: launchpadAbi, name: 'Launched' });
export const BOUGHT_EVENT = getAbiItem({ abi: launchpadAbi, name: 'Bought' });
export const SOLD_EVENT = getAbiItem({ abi: launchpadAbi, name: 'Sold' });
export const LOCKED_EVENT = getAbiItem({ abi: launchpadAbi, name: 'CurveLocked' });
export const GRADUATED_EVENT = getAbiItem({ abi: launchpadAbi, name: 'Graduated' });
export const TRANSFER_EVENT = getAbiItem({ abi: erc20Abi, name: 'Transfer' });

const LAUNCHPAD_EVENTS = [LAUNCHED_EVENT, BOUGHT_EVENT, SOLD_EVENT, LOCKED_EVENT, GRADUATED_EVENT];

/** Log tak, jak go widzi ten modul: tyle, ile naprawde czytamy. */
export type ScanLog = {
  eventName?: string;
  address?: string;
  args?: Record<string, unknown>;
  blockNumber?: bigint | null;
  logIndex?: number | null;
  transactionHash?: `0x${string}` | null;
};

/**
 * Klient odczytu - tylko `getLogs`.
 *
 * Argument jest celowo nieopisany: `getLogs` z viem jest generyczne po ABI
 * zdarzen i ma kilka przeciazen, wiec kazdy wezszy typ tutaj konczy sie tym,
 * ze PublicClient przestaje pasowac i trzeba go rzutowac w wywolaniu. Ksztalt
 * argumentu i tak buduje wylacznie ten modul (patrz `scanBackward`), a odpowiedz
 * czytamy przez `ScanLog`, czyli ostroznie i pole po polu.
 */
export type ScanClient = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getLogs: (args: any) => Promise<ScanLog[]>;
  /**
   * Opcjonalny - gdy jest, salda holderow DOMYKAMY odczytem `balanceOf`
   * zamiast zostawiac je zsumowane z roznic. Patrz `settleBalancesOnchain`.
   * Kliencie viem (serwerowy i przegladarkowy) maja go zawsze; testy podaja
   * atrape albo nie podaja wcale.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  multicall?: (args: any) => Promise<any[]>;
};

export function tradeId(txHash: string | null | undefined, logIndex: number): string {
  return `${txHash ?? 'log'}-${logIndex}`;
}

/**
 * DOMKNIECIE SALD ODCZYTEM `balanceOf` - poprawka z 16 wrzesnia 2026.
 *
 * ===========================================================================
 * DLACZEGO SUMOWANIE ROZNIC NIE WYSTARCZA
 * ===========================================================================
 * Mapa sald powstaje z roznic (`applyTransferLogs`, `applyTradeToBalances`)
 * startujac od zera. To dziala tylko wtedy, gdy zobaczylismy KAZDE zdarzenie
 * dotyczace danego adresu - a skan chodzi oknami i ma sufit okien na wizyte.
 * Wystarczy, ze jeden log wypadnie poza zakres, i saldo zostaje przesuniete
 * NA ZAWSZE, bo nic go pozniej nie koryguje.
 *
 * Widac to bylo goly okiem na Arc: strona tokena ARPE pokazywala w wierszu
 * `BONDING CURVE` 999,7M (99,96%), podczas gdy lancuch dawal rowno 1 000,0M
 * (100,0000%) - zgodnie w `balanceOf(launchpad)` i w `tokenReserve`. Roznica
 * ~300 tys. tokenow wzieta znikad. Co gorsza, komentarz przy `holdersAreExact`
 * OBIECYWAL, ze "salda czyta `balanceOf`, wiec mapa jest dokladna co do wei" -
 * kod tej obietnicy nie dotrzymywal.
 *
 * Teraz dotrzymuje: po skanie czytamy `balanceOf` dla KAZDEGO adresu, ktory
 * skan znalazl, i nadpisujemy nim wynik sumowania. Rekonstrukcja z roznic
 * zostaje wylacznie jako sposob na ZNALEZIENIE adresow - do czego nadaje sie
 * dobrze - a nie jako zrodlo kwot.
 *
 * Gdy klient nie ma `multicall` albo odczyt padnie, zostaja liczby z roznic:
 * przyblizenie jest lepsze niz pusta tabela. Zwracamy wtedy `false`.
 */
export async function settleBalancesOnchain(
  client: ScanClient,
  token: string,
  balances: Map<string, bigint>,
): Promise<boolean> {
  if (typeof client.multicall !== 'function' || balances.size === 0) return false;
  const holders = Array.from(balances.keys());
  try {
    const results = await client.multicall({
      contracts: holders.map((holder) => ({
        address: token as `0x${string}`,
        abi: erc20Abi,
        functionName: 'balanceOf',
        args: [holder as `0x${string}`],
      })),
      allowFailure: true,
    });
    let any = false;
    results.forEach((entry, i) => {
      // `allowFailure` daje {status, result}; pojedyncza nieudana pozycja nie
      // ma prawa wywalic calosci - zostaje przy niej liczba z roznic.
      const value = entry && typeof entry === 'object' && 'status' in entry
        ? (entry as { status: string; result?: unknown }).status === 'success'
          ? (entry as { result?: unknown }).result
          : undefined
        : entry;
      if (typeof value === 'bigint') {
        balances.set(holders[i], value);
        any = true;
      }
    });
    return any;
  } catch {
    return false;
  }
}

/** Salda trzymamy pod adresem malymi literami - inaczej ten sam holder ma dwa wiersze. */
export function applyBalanceDelta(balances: Map<string, bigint>, account: string, delta: bigint) {
  const key = account.toLowerCase();
  if (key === ZERO_ADDRESS) return;
  balances.set(key, (balances.get(key) ?? 0n) + delta);
}

export function applyTransferLogs(balances: Map<string, bigint>, logs: ScanLog[]) {
  for (const log of logs) {
    const args = log.args ?? {};
    const from = args.from as string | undefined;
    const to = args.to as string | undefined;
    const value = args.value as bigint | undefined;
    if (value === undefined) continue;
    if (from) applyBalanceDelta(balances, from, -value);
    if (to) applyBalanceDelta(balances, to, value);
  }
}

/** Skutek transakcji dla sald: krzywa oddaje tokeny kupujacemu, odbiera sprzedajacemu. */
export function applyTradeToBalances(balances: Map<string, bigint>, trade: TradeEntry, curve: string) {
  if (trade.kind === 'buy') {
    applyBalanceDelta(balances, trade.account, trade.tokens);
    applyBalanceDelta(balances, curve, -trade.tokens);
  } else {
    applyBalanceDelta(balances, trade.account, -trade.tokens);
    applyBalanceDelta(balances, curve, trade.tokens);
  }
}

/**
 * SALDA SA STANEM, A NIE SUMA ROZNIC - i to jest jedyny sposob, zeby to
 * sprawdzic bez pytania lancucha.
 *
 * Cache historii dokleja do mapy sald roznice z KOLEJNYCH zeskanowanych
 * przedzialow. Dopoki podstawa jest cala, wynik sie zgadza. Gdy podstawa
 * przepadnie (14 sierpnia 2026 Firestore wyczerpal dzienny limit odczytow i
 * `readHistory` oddawal naglowek bez kawalkow), zostaja same roznice z
 * przedzialow zeskanowanych PO stracie - i taka mapa nie naprawia sie juz
 * nigdy, bo skan przyrostowy zna wylacznie nastepne roznice.
 *
 * Tak wygladal token GLIFE na Base: cztery transakcje w cache, zero wierszy
 * sald, potem trzy wiersze z krzywa na MINUSIE 6,5 mln tokenow. Strona
 * pokazywala jednego holdera przy czterech kupujacych.
 *
 * Trzy niezmienniki, ktore trzymaja tylko dla zdrowej mapy:
 *   - saldo ERC-20 nie bywa ujemne;
 *   - historia z transakcjami nie ma pustej mapy sald (kupiec albo trzyma, albo
 *     odsprzedal krzywej, wiec ktos zawsze ma niezerowe saldo);
 *   - suma sald nie przekracza calej podazy (to lapie policzenie tego samego
 *     przedzialu dwa razy).
 *
 * Brak konta z transakcji CELOWO nie jest tu bledem: kto sprzedal wszystko, ma
 * saldo zero, a zerowych wierszy nie zapisujemy.
 */
export function balancesArePoisoned(balances: Map<string, bigint>, trades: TradeEntry[]): boolean {
  if (trades.length > 0 && balances.size === 0) return true;
  let total = 0n;
  for (const value of balances.values()) {
    if (value < 0n) return true;
    total += value;
  }
  return total > SUPPLY_WEI;
}

/**
 * Konta, ktorych saldo warto przeczytac z lancucha - w kolejnosci waznosci.
 *
 * Skan logow sluzy do tego, zeby wiedziec KTO, a nie ILE: adresy systemowe
 * (krzywa, vault, hook, pula, adres spalenia), potem kupujacy i sprzedajacy od
 * najswiezszego, a na koncu reszta znanych sald od najwiekszego. Limit tnie
 * ogon, nie czolo - przy tokenie z tysiacami kont tabela holderow i tak
 * pokazuje pierwsza dwudziestke, a laczna liczba posiadaczy idzie z indeksu
 * (Blockscout), nie z tej listy.
 */
export function balanceCandidates(
  balances: Map<string, bigint>,
  trades: TradeEntry[],
  system: string[],
  limit: number
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();

  const push = (raw: string | null | undefined) => {
    if (!raw || out.length >= limit) return;
    const key = raw.toLowerCase();
    if (key === ZERO_ADDRESS || seen.has(key)) return;
    seen.add(key);
    out.push(key);
  };

  for (const address of system) push(address);
  for (let index = trades.length - 1; index >= 0; index -= 1) push(trades[index].account);
  const known = [...balances.entries()].sort((a, b) => (a[1] === b[1] ? 0 : a[1] < b[1] ? 1 : -1));
  for (const [address] of known) push(address);

  return out;
}

/** Bought/Sold -> wpis historii. Null, gdy log nie niesie kompletu pol. */
export function decodeTradeLog(log: ScanLog, estTs: (block: bigint) => number): TradeEntry | null {
  const isBuy = log.eventName === 'Bought';
  if (!isBuy && log.eventName !== 'Sold') return null;
  const args = log.args ?? {};
  const account = (isBuy ? args.buyer : args.seller) as `0x${string}` | undefined;
  const eth = (isBuy ? args.ethNet : args.ethOut) as bigint | undefined;
  const tokens = (isBuy ? args.tokensOut : args.tokensIn) as bigint | undefined;
  const reserveAfter = args.ethReserveAfter as bigint | undefined;
  const tokenReserveAfter = args.tokenReserveAfter as bigint | undefined;
  if (!account || eth === undefined || tokens === undefined) return null;
  if (reserveAfter === undefined || tokenReserveAfter === undefined) return null;
  const block = log.blockNumber ?? 0n;
  const logIndex = Number(log.logIndex ?? 0);
  return {
    id: tradeId(log.transactionHash ?? null, logIndex),
    kind: isBuy ? 'buy' : 'sell',
    account,
    eth,
    tokens,
    priceWei: priceWeiAfter(reserveAfter, tokenReserveAfter),
    ethReserveAfter: reserveAfter,
    block,
    logIndex,
    ts: estTs(block),
    txHash: log.transactionHash ?? null,
  };
}

/**
 * Scalanie dwoch list w jedna, rosnaco po bloku. Klucz to `id`
 * (txHash-logIndex), wiec ta sama transakcja z cache'u i ze swiezego skanu
 * pojawi sie raz - wygrywa wersja swiezsza, bo cache mogl zapisac czas
 * estymowany przy innej kotwicy bloku.
 */
export function mergeTrades(existing: TradeEntry[], incoming: TradeEntry[]): TradeEntry[] {
  const byId = new Map<string, TradeEntry>();
  for (const trade of existing) byId.set(trade.id, trade);
  for (const trade of incoming) byId.set(trade.id, trade);
  return [...byId.values()].sort((a, b) =>
    a.block === b.block ? a.logIndex - b.logIndex : a.block < b.block ? -1 : 1
  );
}

/**
 * Wiersz zapisu: jeden STRING, nie tablica. Firestore nie przyjmuje tablicy w
 * tablicy, a mapa na wpis kosztowalaby kilka razy wiecej miejsca. Biginty ida
 * dziesietnie, bo JSON i Firestore nie znaja bigintow.
 */
const ROW_FIELDS = 10;

export function serializeTrade(trade: TradeEntry): string {
  return [
    trade.kind === 'buy' ? 'b' : 's',
    trade.account,
    trade.eth.toString(),
    trade.tokens.toString(),
    trade.priceWei.toString(),
    trade.ethReserveAfter.toString(),
    trade.block.toString(),
    String(trade.logIndex),
    String(trade.ts),
    trade.txHash ?? '',
  ].join('|');
}

export function parseTrade(row: unknown): TradeEntry | null {
  if (typeof row !== 'string') return null;
  const parts = row.split('|');
  if (parts.length !== ROW_FIELDS) return null;
  const [kind, account, eth, tokens, priceWei, reserve, block, logIndex, ts, txHash] = parts;
  if (kind !== 'b' && kind !== 's') return null;
  try {
    const index = Number(logIndex);
    const hash = txHash === '' ? null : (txHash as `0x${string}`);
    return {
      id: tradeId(hash, index),
      kind: kind === 'b' ? 'buy' : 'sell',
      account: account as `0x${string}`,
      eth: BigInt(eth),
      tokens: BigInt(tokens),
      priceWei: BigInt(priceWei),
      ethReserveAfter: BigInt(reserve),
      block: BigInt(block),
      logIndex: index,
      ts: Number(ts),
      txHash: hash,
    };
  } catch {
    // Uszkodzony wiersz nie moze wywrocic odczytu calego kawalka - lepiej
    // stracic jedna transakcje niz cala historie tokena.
    return null;
  }
}

export function serializeTrades(trades: TradeEntry[]): string[] {
  return trades.map(serializeTrade);
}

export function parseTrades(rows: unknown[]): TradeEntry[] {
  const out: TradeEntry[] = [];
  for (const row of rows) {
    const trade = parseTrade(row);
    if (trade) out.push(trade);
  }
  return out;
}

/** Zerowe salda nie ida do zapisu - po sprzedazach to wiekszosc mapy. */
export function serializeBalances(balances: Map<string, bigint>): string[] {
  const out: string[] = [];
  for (const [address, value] of balances) {
    if (value === 0n) continue;
    out.push(`${address}|${value.toString()}`);
  }
  return out;
}

export function parseBalances(rows: unknown[]): Map<string, bigint> {
  const balances = new Map<string, bigint>();
  for (const row of rows) {
    if (typeof row !== 'string') continue;
    const split = row.indexOf('|');
    if (split <= 0) continue;
    try {
      balances.set(row.slice(0, split).toLowerCase(), BigInt(row.slice(split + 1)));
    } catch {
      continue;
    }
  }
  return balances;
}

/**
 * Tnie liste na kawalki. Z pustej listy robi JEDEN pusty kawalek - zapis musi
 * miec co nadpisac, inaczej po wyczyszczeniu historii zostalyby stare wiersze.
 */
export function chunk<T>(items: T[], size: number): T[][] {
  if (items.length === 0) return [[]];
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export type ScanResult = {
  trades: TradeEntry[];
  balances: Map<string, bigint>;
  /**
   * Czy kwoty w `balances` pochodza z `balanceOf`, czy tylko z sumowania
   * roznic. `false` znaczy przyblizenie - patrz `settleBalancesOnchain`.
   */
  balancesSettled: boolean;
  graduatedTs: number | null;
  /** Blok zdarzenia Launched, jesli skan go dosiegnal. */
  launchBlock: bigint | null;
  /** Skan zszedl do dna albo zobaczyl Launched - starszych logow juz nie ma. */
  complete: boolean;
  /** Najnizszy zeskanowany blok. */
  scannedFrom: bigint;
};

export type ScanOptions = {
  /** Jeden adres albo wszystkie wdrozenia sieci - zdarzenia maja to samo ABI. */
  launchpad: string | string[];
  token: string;
  /** Gorny blok skanu (wlacznie). */
  head: bigint;
  /** Dolny blok skanu (wlacznie). */
  floor: bigint;
  /** Ile blokow na jedno `getLogs` - limit RPC danej sieci. */
  window: bigint;
  maxWindows: number;
  estTs: (block: bigint) => number;
  /** Przerwa przed PIERWSZYM ponowieniem okna; kolejne podwajaja. Testy podaja 0. */
  retryDelayMs?: number;
  /**
   * Ile prob na okno lacznie (z pierwsza). Domyslnie 3 - tyle wystarcza, by
   * przejsc przez chwilowy "rate limit exceeded" oficjalnego RPC Arc.
   */
  retryAttempts?: number;
  /**
   * Przerwa miedzy PARTIAMI okien. Tempo RPC tej sieci - patrz `scanPaceMs`
   * w config.ts. Domyslnie 0, czyli bez przerwy (Base).
   */
  paceMs?: number;
  /**
   * Czy po skanie domknac salda odczytem `balanceOf` (patrz
   * `settleBalancesOnchain`). Wlacza to PRZEGLADARKA, bo tam nie ma nic
   * innego, co by to robilo. Serwer zostawia `false`, bo ma wlasny
   * `holderBalances.ts` - wlaczenie tutaj kazaloby mu czytac dwa razy.
   */
  settleBalances?: boolean;
  /**
   * Ile okien naraz. Domyslnie 1, czyli okno po oknie.
   *
   * TO JEST GLOWNY REGULATOR CZASU ZIMNEGO SKANU, i to nie z teorii: zmierzone
   * na tokenie z 11 sierpnia (78 tys. blokow, dziewiec okien) - 3,8 s, przy
   * czym OBA `getLogs` w oknie i tak leca rownolegle, wiec usuwanie ktoregos
   * z nich nie daje nic (sprawdzone: -15 ms). Czekanie robia KOLEJNE RUNDY.
   *
   * Wyzej niz 1 idzie serwer, ktory ma wlasny endpoint z zapasem tempa.
   * Przegladarka zostaje na 1 - tam skan jest awaryjny i leci przez publiczny
   * RPC, ktory przy serii odpowiada "over rate limit".
   */
  concurrency?: number;
};

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type Window = { fromBlock: bigint; toBlock: bigint };

/** Okna od glowy w dol, do dna wlacznie. Lista powstaje ZANIM cokolwiek poleci. */
function planWindows(opts: ScanOptions): Window[] {
  const windows: Window[] = [];
  let toBlock = opts.head;
  for (let index = 0; index < opts.maxWindows && toBlock >= opts.floor; index += 1) {
    const fromBlock = toBlock >= opts.floor + opts.window ? toBlock - opts.window + 1n : opts.floor;
    windows.push({ fromBlock, toBlock });
    if (fromBlock === opts.floor) break;
    toBlock = fromBlock - 1n;
  }
  return windows;
}

/**
 * Skan wstecz, oknami, od `head` do `floor`.
 *
 * Idzie od gory, bo najswiezsze transakcje sa najwazniejsze, a zdarzenie
 * Launched urywa petle - ponizej bloku startu tokena logow z definicji nie ma.
 * Ta sama funkcja obsluguje doklejanie: przy dociaganiu `floor` to ostatni
 * zapisany blok plus jeden, wiec petla robi zwykle jedno okno.
 */
export async function scanBackward(client: ScanClient, opts: ScanOptions): Promise<ScanResult> {
  const wanted = opts.token.toLowerCase();
  const trades: TradeEntry[] = [];
  const balances = new Map<string, bigint>();
  let graduatedTs: number | null = null;
  let launchBlock: bigint | null = null;
  let complete = false;
  /**
   * Najnizszy blok, ktory NAPRAWDE przeszedl przez `getLogs`. Startuje POWYZEJ
   * glowy, czyli "nic jeszcze nie pokryte" - inaczej skan, ktoremu padlo juz
   * pierwsze okno, meldowalby pokrycie bloku, ktorego nie przeczytal, a cache
   * zapisalby go jako zrobiony i transakcja z niego przepadlaby na zawsze.
   */
  let scannedFrom = opts.head + 1n;

  const windows = planWindows(opts);
  const batchSize = Math.max(1, Math.floor(opts.concurrency ?? 1));
  /*
   * PRZERWA MIEDZY PARTIAMI. Rozmiar okna mowi, ILE blokow wolno wziac na raz;
   * to mowi, JAK SZYBKO wolno pytac - dwa rozne limity. Na Arc zmierzone:
   * 12 zapytan w locie daje 9-10 bledow "rate limit exceeded", a odstep
   * 1200 ms zero. Bez tego same ponowienia nie pomagaja, bo odpalaja sie dla
   * wszystkich okien partii ROWNOCZESNIE i kazda runda znowu bije w sufit.
   */
  const paceMs = Math.max(0, opts.paceMs ?? 0);

  /** Jedno okno, z jedna ponowna proba. `null` = okno nie przeszlo. */
  const fetchWindow = async (window: Window): Promise<[ScanLog[], ScanLog[]] | null> => {
    const once = () =>
      Promise.all([
        client.getLogs({
          address: opts.launchpad,
          events: LAUNCHPAD_EVENTS,
          fromBlock: window.fromBlock,
          toBlock: window.toBlock,
        }),
        client.getLogs({
          address: opts.token,
          event: TRANSFER_EVENT,
          fromBlock: window.fromBlock,
          toBlock: window.toBlock,
        }),
      ]);
    /*
     * PONOWIENIA Z NARASTAJACA PRZERWA - poprawka z 16 wrzesnia 2026.
     *
     * Publiczne RPC odmawiaja przy szybkiej serii `getLogs`. Do dzis byla tu
     * JEDNA proba wiecej po 400 ms i to wystarczalo na Base. Na Arc nie
     * wystarcza: zmierzone na `rpc.mainnet.arc.io` - okno pierwsze przechodzi,
     * a od drugiego leci "rate limit exceeded" i trzyma dluzej niz 400 ms.
     * Skutek byl taki, ze strona tokena ARPE pokazywala "No trades yet" przy
     * szesciu transakcjach na lancuchu, z przypisem o ucietej historii.
     *
     * Trzy proby z przerwa 400/800/1600 ms kosztuja w najgorszym razie ~2,8 s
     * na okno, ktorego i tak nie da sie przeczytac - a ratuja skan tam, gdzie
     * limit jest chwilowy. Liczbe prob i przerwe da sie podac z zewnatrz;
     * testy podaja 0, zeby nie czekac.
     */
    const attempts = Math.max(1, opts.retryAttempts ?? 3);
    const baseDelay = opts.retryDelayMs ?? 400;
    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        return await once();
      } catch {
        if (attempt === attempts) return null;
        await wait(baseDelay * 2 ** (attempt - 1));
      }
    }
    return null;
  };

  outer: for (let start = 0; start < windows.length; start += batchSize) {
    // Przerwa PRZED kolejna partia, nie przed pierwsza - pierwsze zapytanie ma
    // isc od razu, inaczej kazde wejscie na strone zaczynaloby od czekania.
    if (start > 0 && paceMs > 0) await wait(paceMs);
    const batch = windows.slice(start, start + batchSize);
    const fetched = await Promise.all(batch.map(fetchWindow));

    // Wyniki bierzemy TYLKO z nieprzerwanego poczatku partii. Okno, ktore
    // padlo, urywa pokrycie - to, co zeskanowalo sie pod nim, lezy za dziura i
    // zapisanie tego jako ciagly zakres byloby klamstwem cache'u.
    for (let index = 0; index < batch.length; index += 1) {
      const result = fetched[index];
      if (!result) break outer;
      const window = batch[index];
      const [launchpadLogs, transferLogs] = result;
      scannedFrom = window.fromBlock;

      applyTransferLogs(balances, transferLogs);

      for (const log of launchpadLogs) {
        const token = log.args?.token as string | undefined;
        if (!token || token.toLowerCase() !== wanted) continue;
        if (log.eventName === 'Launched') {
          launchBlock = log.blockNumber ?? null;
          complete = true;
        } else if (log.eventName === 'Graduated') {
          graduatedTs = opts.estTs(log.blockNumber ?? 0n);
        } else {
          const trade = decodeTradeLog(log, opts.estTs);
          if (trade) trades.push(trade);
        }
      }

      // Zdarzenie Launched konczy sprawe: ponizej bloku startu tokena logow z
      // definicji nie ma. Dno przedzialu tak samo - nizej nie mielismy isc.
      if (complete) break outer;
      if (window.fromBlock === opts.floor) {
        complete = true;
        break outer;
      }
    }
  }

  /*
   * Domkniecie sald TYLKO NA ZYCZENIE - i to nie z ostroznosci, tylko zeby nie
   * czytac dwa razy. Serwer (`/api/launchpad/history`) ma do tego wlasny,
   * lepszy modul `holderBalances.ts`: batchuje po 250, ma sufit kont i wybiera
   * kandydatow. Przegladarka (`useTokenHistory`) nie ma nic - i to ona
   * pokazywala na Arc zdryfowane 999,7M zamiast 1000M.
   */
  const balancesSettled = opts.settleBalances === true
    ? await settleBalancesOnchain(client, opts.token, balances)
    : false;

  return {
    trades: mergeTrades([], trades),
    balances,
    balancesSettled,
    graduatedTs,
    launchBlock,
    complete,
    scannedFrom,
  };
}
