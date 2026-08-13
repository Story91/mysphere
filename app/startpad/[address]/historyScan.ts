import { getAbiItem } from 'viem';
import { erc20Abi, launchpadAbi } from '../config';
import { priceWeiAfter, ZERO_ADDRESS, type TradeEntry } from './detailShared';

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
};

export function tradeId(txHash: string | null | undefined, logIndex: number): string {
  return `${txHash ?? 'log'}-${logIndex}`;
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
  graduatedTs: number | null;
  /** Blok zdarzenia Launched, jesli skan go dosiegnal. */
  launchBlock: bigint | null;
  /** Skan zszedl do dna albo zobaczyl Launched - starszych logow juz nie ma. */
  complete: boolean;
  /** Najnizszy zeskanowany blok. */
  scannedFrom: bigint;
};

export type ScanOptions = {
  launchpad: string;
  token: string;
  /** Gorny blok skanu (wlacznie). */
  head: bigint;
  /** Dolny blok skanu (wlacznie). */
  floor: bigint;
  /** Ile blokow na jedno `getLogs` - limit RPC danej sieci. */
  window: bigint;
  maxWindows: number;
  estTs: (block: bigint) => number;
  /** Przerwa przed jedyna ponowna proba okna. Testy podaja 0. */
  retryDelayMs?: number;
};

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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
  let toBlock = opts.head;
  /**
   * Najnizszy blok, ktory NAPRAWDE przeszedl przez `getLogs`. Startuje POWYZEJ
   * glowy, czyli "nic jeszcze nie pokryte" - inaczej skan, ktoremu padlo juz
   * pierwsze okno, meldowalby pokrycie bloku, ktorego nie przeczytal, a cache
   * zapisalby go jako zrobiony i transakcja z niego przepadlaby na zawsze.
   */
  let scannedFrom = opts.head + 1n;

  for (let window = 0; window < opts.maxWindows && toBlock >= opts.floor; window += 1) {
    const fromBlock =
      toBlock >= opts.floor + opts.window ? toBlock - opts.window + 1n : opts.floor;

    const fetchWindow = () =>
      Promise.all([
        client.getLogs({
          address: opts.launchpad,
          events: LAUNCHPAD_EVENTS,
          fromBlock,
          toBlock,
        }),
        client.getLogs({ address: opts.token, event: TRANSFER_EVENT, fromBlock, toBlock }),
      ]);

    let launchpadLogs: ScanLog[];
    let transferLogs: ScanLog[];
    try {
      [launchpadLogs, transferLogs] = await fetchWindow();
    } catch {
      // Publiczne RPC Base odmawia przy szybkiej serii `getLogs` ("over rate
      // limit"). To zwykle chwilowe, wiec jedna proba wiecej po krotkiej
      // przerwie - bez niej cale wejscie uzytkownika konczyloby sie bez
      // najmniejszego postepu.
      try {
        await wait(opts.retryDelayMs ?? 400);
        [launchpadLogs, transferLogs] = await fetchWindow();
      } catch {
        // Druga odmowa konczy skan, ale NIE kasuje tego, co juz zebrane:
        // oddajemy historie ucieta od dolu, a reszte dociagnie nastepne
        // wejscie. `scannedFrom` zostaje na ostatnim oknie, ktore NAPRAWDE
        // przeszlo - inaczej cache zapisalby pokrycie, ktorego nie ma.
        break;
      }
    }
    scannedFrom = fromBlock;

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

    if (complete) break;
    if (fromBlock === opts.floor) {
      complete = true;
      break;
    }
    toBlock = fromBlock - 1n;
  }

  return {
    trades: mergeTrades([], trades),
    balances,
    graduatedTs,
    launchBlock,
    complete,
    scannedFrom,
  };
}
