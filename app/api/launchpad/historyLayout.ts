import {
  chunk,
  parseBalances,
  parseTrades,
  serializeBalances,
  serializeTrades,
} from '../../startpad/[address]/historyScan';
import type { TradeEntry } from '../../startpad/[address]/detailShared';

/**
 * UKLAD CACHE'U HISTORII TOKENA W FIRESTORE - czysta arytmetyka, bez bazy.
 *
 * ===========================================================================
 * DLACZEGO KAWALKI, A NIE JEDEN DOKUMENT
 * ===========================================================================
 * Dokument Firestore ma sufit 1 MB. Jedna transakcja w naszym zapisie to ~180
 * bajtow, wiec jeden dokument peka w okolicach 5-6 tysiecy transakcji. Token z
 * realnym ruchem dojdzie tam w kilka dni i historia PRZESTALABY sie zapisywac
 * dokladnie w chwili, w ktorej jest najbardziej potrzebna.
 *
 * Wiec: dokument-naglowek trzyma liczniki i ostatni zeskanowany blok, a same
 * wiersze leza w podkolekcji `parts`, po `TRADE_CHUNK_SIZE` transakcji na
 * dokument.
 *
 * ===========================================================================
 * DLACZEGO NIE PRZEPISUJEMY WSZYSTKICH KAWALKOW PRZY KAZDYM DOCIAGU
 * ===========================================================================
 * Historia jest z natury append-only: raz zapisany PELNY kawalek nigdy sie nie
 * zmienia. `changedChunks` wskazuje wiec tylko te dokumenty, ktorych dotyka
 * nowy skan - zwykle jeden. Bez tego kazde odswiezenie tokena z 5 tysiacami
 * transakcji kosztowaloby 6 zapisow zamiast jednego.
 */

/** ~180 B na wiersz razy 1000 to ~180 kB - z zapasem pod sufit 1 MB. */
export const TRADE_CHUNK_SIZE = 1_000;
/** Wiersz salda jest krotszy (~70 B), wiec kawalek moze byc wiekszy. */
export const BALANCE_CHUNK_SIZE = 2_000;

export const HISTORY_COLLECTION = 'launchpadHistory';
export const PARTS_SUBCOLLECTION = 'parts';

export const TRADE_PREFIX = 't';
export const BALANCE_PREFIX = 'b';

/**
 * ID dokumentu MUSI byc deterministyczne i male literami - inaczej ten sam
 * token dostaje dwa dokumenty, zaleznie od tego, czy adres przyszedl w
 * checksumie. Ta sama zasada, co `tokenDocId` w profileStore.
 */
export function historyDocId(chainId: number, token: string): string {
  return `${chainId}-${token.trim().toLowerCase()}`;
}

/** Zera wiodace, zeby kawalki sortowaly sie po nazwie tak jak po numerze. */
export function partId(prefix: string, index: number): string {
  return `${prefix}${String(index).padStart(4, '0')}`;
}

export type HistoryPart = { id: string; rows: string[] };

export function buildParts(
  trades: TradeEntry[],
  balances: Map<string, bigint>,
  sizes: { tradeChunkSize?: number; balanceChunkSize?: number } = {}
): { parts: HistoryPart[]; tradeChunks: number; balanceChunks: number } {
  const tradeSize = sizes.tradeChunkSize ?? TRADE_CHUNK_SIZE;
  const balanceSize = sizes.balanceChunkSize ?? BALANCE_CHUNK_SIZE;

  const tradeChunks = chunk(serializeTrades(trades), tradeSize);
  const balanceChunks = chunk(serializeBalances(balances), balanceSize);

  const parts: HistoryPart[] = [
    ...tradeChunks.map((rows, index) => ({ id: partId(TRADE_PREFIX, index), rows })),
    ...balanceChunks.map((rows, index) => ({ id: partId(BALANCE_PREFIX, index), rows })),
  ];

  return { parts, tradeChunks: tradeChunks.length, balanceChunks: balanceChunks.length };
}

/**
 * Sklada historie z kawalkow. Kolejnosc bierze sie z ID (`t0000`, `t0001`...),
 * a nie z kolejnosci przyjscia - Firestore nie obiecuje niczego o kolejnosci
 * dokumentow w `getAll`.
 */
export function composeParts(parts: HistoryPart[]): {
  trades: TradeEntry[];
  balances: Map<string, bigint>;
} {
  const sorted = [...parts].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const tradeRows: string[] = [];
  const balanceRows: string[] = [];
  for (const part of sorted) {
    if (part.id.startsWith(TRADE_PREFIX)) tradeRows.push(...part.rows);
    else if (part.id.startsWith(BALANCE_PREFIX)) balanceRows.push(...part.rows);
  }
  return { trades: parseTrades(tradeRows), balances: parseBalances(balanceRows) };
}

/**
 * Zakres kawalkow transakcji, ktorych dotyka nowy stan. Null, gdy nic nie
 * przybylo - wtedy zapis do `parts` w ogole nie leci.
 */
export function changedChunks(
  oldCount: number,
  newCount: number,
  size: number
): { first: number; last: number } | null {
  if (newCount === oldCount) return null;
  const first = Math.floor(Math.min(oldCount, newCount) / size);
  const last = Math.max(0, Math.ceil(newCount / size) - 1);
  return { first, last };
}

/**
 * Co zostalo do zeskanowania, przy stanie cache'u `meta`.
 *
 * To jest sedno calej naprawy: przy zapelnionym cache wychodzi stad JEDEN
 * waski przedzial - od ostatniego zapisanego bloku do glowy lancucha - zamiast
 * kilkudziesieciu okien wstecz az do startu tokena.
 *
 * Uciety skan (`complete: false`) zostawia dziure NA DOLE historii, nie na
 * gorze. Dlatego sa dwa przedzialy: swieze bloki nad `highBlock` oraz dalszy
 * ciag ogona pod `lowBlock`. Kazde wejscie na strone pcha ogon o kolejny kawal
 * w dol, a postep jest trwaly, bo `lowBlock` ladue w bazie.
 */
export type HistoryScanState = {
  highBlock: bigint;
  lowBlock: bigint;
  complete: boolean;
};

export function planScan(
  meta: HistoryScanState | null,
  bounds: { head: bigint; launchFloor: bigint; maxSpan?: bigint }
): { head: bigint; floor: bigint }[] {
  if (!meta) return [{ head: bounds.head, floor: bounds.launchFloor }];

  const span = bounds.maxSpan;
  const ranges: { head: bigint; floor: bigint }[] = [];

  if (bounds.head > meta.highBlock) {
    // Zaleglosc wieksza niz jedno zadanie uniesie NIE jest przeskakiwana, tylko
    // przycinana od gory: przedzial musi PRZYLEGAC do tego, co juz jest w
    // cache. Inaczej zostalaby dziura w srodku historii, ktorej zapis w
    // naglowku (jeden ciagly zakres) nie umie opisac ani odrobic.
    const floor = meta.highBlock + 1n;
    const head = span !== undefined && bounds.head - floor >= span ? floor + span - 1n : bounds.head;
    ranges.push({ head, floor });
  }

  if (!meta.complete && meta.lowBlock > bounds.launchFloor) {
    const head = meta.lowBlock - 1n;
    const deepest = span !== undefined && head - bounds.launchFloor >= span ? head - span + 1n : bounds.launchFloor;
    ranges.push({ head, floor: deepest });
  }

  return ranges;
}

/** Kawalki, ktore zostaly po krotszej historii - do skasowania. */
export function stalePartIds(prefix: string, oldChunks: number, newChunks: number): string[] {
  const out: string[] = [];
  for (let index = newChunks; index < oldChunks; index += 1) out.push(partId(prefix, index));
  return out;
}
