import 'server-only';
import { getAdminDb } from '../../utils/auth/firebaseAdmin';
import { DB_DEADLINE_MS, withDeadline } from './dbDeadline';
import type { TradeEntry } from '../../startpad/[address]/detailShared';
import {
  BALANCE_CHUNK_SIZE,
  BALANCE_PREFIX,
  buildParts,
  changedChunks,
  composeParts,
  historyDocId,
  HISTORY_COLLECTION,
  PARTS_SUBCOLLECTION,
  stalePartIds,
  TRADE_CHUNK_SIZE,
  TRADE_PREFIX,
  type HistoryPart,
} from './historyLayout';

/**
 * Cache historii tokena launchpada - kolekcja `launchpadHistory`.
 *
 * === CO TU JEST ===
 * Odtworzona z logow historia jednego tokena: transakcje krzywej i salda
 * holderow, razem z zakresem blokow, ktory te dane pokrywaja. Zapis robi
 * WYLACZNIE `/api/launchpad/history`, po skanie lancucha.
 *
 * === CZY TO JEST ZRODLO PRAWDY ===
 * Nie. Zrodlem prawdy jest lancuch. To jest wylacznie przyspieszenie: ta sama
 * historia, ktora przegladarka umie sobie zeskanowac sama (i skanuje, gdy tego
 * cache'u nie ma). Gdyby ktos podmienil te dokumenty, zaklamalby WYKRES i
 * liste transakcji - nie stan handlu. Cena, rezerwa i salda, od ktorych zalezy
 * czyjs pieniadz, czytane sa z lancucha bezposrednio, w `useTokenCore` i
 * `TradePanel`.
 *
 * Ta sama uwaga o `firestore.rules`, co przy profileStore: dopoki na koncu
 * regul stoi `match /{document=**} { allow read, write: if true; }`, ta
 * kolekcja jest otwarta dla przegladarki. Dlatego stoi tu akapit wyzej -
 * podmiana cache'u nie moze przelozyc sie na zla wycene.
 */

/**
 * Ile sekund cache uchodzi za swiezy. Ponizej tego progu odpowiadamy tym, co
 * lezy, bez dotykania RPC - inaczej dziesiatka ogladajacych ten sam token
 * wywolalaby dziesiatke skanow na sekunde.
 */
export const FRESH_FOR_MS = 12_000;

/**
 * Blokada na czas skanu. Dwoch odwiedzajacych naraz nie robi tej samej roboty
 * dwa razy: drugi dostaje to, co juz jest w bazie, i wraca po nowe za chwile.
 * Wartosc to sufit realnego skanu, nie jego oczekiwany czas - wygasla blokada
 * MUSI sie odblokowac sama, bo padniety proces nie posprzata po sobie.
 */
export const SCAN_LOCK_MS = 45_000;

export type HistoryMeta = {
  chainId: number;
  token: string;
  /** Najwyzszy zeskanowany blok. */
  highBlock: bigint;
  /** Najnizszy zeskanowany blok. */
  lowBlock: bigint;
  /** Skan dosiegnal startu tokena - nizej logow nie ma. */
  complete: boolean;
  launchBlock: bigint | null;
  graduatedTs: number | null;
  tradeCount: number;
  tradeChunks: number;
  balanceChunks: number;
  updatedAt: number;
  scanLockUntil: number;
};

export type HistoryRecord = {
  meta: HistoryMeta;
  trades: TradeEntry[];
  balances: Map<string, bigint>;
};

type MetaDoc = Record<string, unknown>;

const toBigInt = (value: unknown, fallback: bigint): bigint => {
  if (typeof value === 'string' && /^\d+$/.test(value)) return BigInt(value);
  return fallback;
};

function readMeta(chainId: number, token: string, data: MetaDoc): HistoryMeta {
  return {
    chainId,
    token: token.toLowerCase(),
    highBlock: toBigInt(data.highBlock, 0n),
    lowBlock: toBigInt(data.lowBlock, 0n),
    complete: data.complete === true,
    launchBlock: typeof data.launchBlock === 'string' ? toBigInt(data.launchBlock, 0n) : null,
    graduatedTs: typeof data.graduatedTs === 'number' ? data.graduatedTs : null,
    tradeCount: typeof data.tradeCount === 'number' ? data.tradeCount : 0,
    tradeChunks: typeof data.tradeChunks === 'number' ? data.tradeChunks : 0,
    balanceChunks: typeof data.balanceChunks === 'number' ? data.balanceChunks : 0,
    updatedAt: typeof data.updatedAt === 'number' ? data.updatedAt : 0,
    scanLockUntil: typeof data.scanLockUntil === 'number' ? data.scanLockUntil : 0,
  };
}

export async function isHistoryStoreAvailable(): Promise<boolean> {
  return (await getAdminDb()) !== null;
}

/**
 * Caly cache tokena: naglowek plus wszystkie kawalki. Null, gdy bazy nie ma
 * albo token nigdy nie byl skanowany.
 *
 * Kawalki czytamy `getAll` po ID - bez indeksu i bez skanowania kolekcji.
 */
export async function readHistory(chainId: number, token: string): Promise<HistoryRecord | null> {
  const db = await getAdminDb();
  if (!db) return null;

  try {
    const docRef = db.collection(HISTORY_COLLECTION).doc(historyDocId(chainId, token));
    // Termin, a nie samo `catch`: przy wyczerpanym limicie Firestore SDK
    // ponawia `RESOURCE_EXHAUSTED` z narastajacym odstepem i do `catch`
    // dochodzi po minutach. Patrz `dbDeadline`.
    const snapshot = await withDeadline(docRef.get(), DB_DEADLINE_MS, null);
    if (!snapshot) return null;
    if (!snapshot.exists) return null;
    const meta = readMeta(chainId, token, snapshot.data() as MetaDoc);

    const ids: string[] = [];
    for (let index = 0; index < meta.tradeChunks; index += 1) ids.push(`${TRADE_PREFIX}${String(index).padStart(4, '0')}`);
    for (let index = 0; index < meta.balanceChunks; index += 1) ids.push(`${BALANCE_PREFIX}${String(index).padStart(4, '0')}`);
    if (ids.length === 0) return { meta, trades: [], balances: new Map() };

    const refs = ids.map((id) => docRef.collection(PARTS_SUBCOLLECTION).doc(id));
    const docs = await withDeadline(db.getAll(...refs), DB_DEADLINE_MS, null);
    // NAGLOWEK BEZ KAWALKOW TO NIE JEST CACHE, TYLKO KLAMSTWO O NIM.
    //
    // Stalo tu `return { meta, trades: [], balances: new Map() }` i kosztowalo
    // to puste zakladki Trades i Holders na dobe: naglowek mowil "komplet, 141
    // transakcji", lista byla pusta, trasa uznawala cache za gotowy, a
    // przegladarka zapisywala te pustke jako PELNA migawke i od tej pory
    // prosila juz tylko o roznice - czyli o nic.
    //
    // Nieprzeczytane kawalki znacza, ze cache'u nie ma. Skan lancucha policzy
    // to samo w dwie sekundy.
    if (!docs) return null;
    const parts: HistoryPart[] = [];
    for (const doc of docs) {
      if (!doc.exists) continue;
      const rows = (doc.data() as { rows?: unknown }).rows;
      parts.push({ id: doc.id, rows: Array.isArray(rows) ? (rows as string[]) : [] });
    }

    const { trades, balances } = composeParts(parts);
    return { meta, trades, balances };
  } catch {
    // Cache jest przyspieszeniem, nie danymi. Awaria odczytu ma skonczyc sie
    // skanem lancucha, a nie bledem na stronie tokena.
    return null;
  }
}

/**
 * Probuje przejac blokade skanu. `false` znaczy: ktos inny wlasnie skanuje ten
 * token, nie powielaj roboty.
 *
 * Transakcja, a nie zwykly zapis - dwa rownolegle zadania musza zobaczyc
 * NAWZAJEM swoja proba, a nie kazde swoja.
 */
export async function claimScanLock(chainId: number, token: string): Promise<boolean> {
  const db = await getAdminDb();
  if (!db) return false;

  const docRef = db.collection(HISTORY_COLLECTION).doc(historyDocId(chainId, token));
  const now = Date.now();
  try {
    return await withDeadline(db.runTransaction(async (tx: any) => {
      const snapshot = await tx.get(docRef);
      const until = snapshot.exists ? (snapshot.data() as MetaDoc).scanLockUntil : 0;
      if (typeof until === 'number' && until > now) return false;
      tx.set(docRef, { chainId, token: token.toLowerCase(), scanLockUntil: now + SCAN_LOCK_MS }, { merge: true });
      return true;
    }), DB_DEADLINE_MS, false);
  } catch {
    return false;
  }
}

export async function releaseScanLock(chainId: number, token: string): Promise<void> {
  const db = await getAdminDb();
  if (!db) return;
  try {
    await db
      .collection(HISTORY_COLLECTION)
      .doc(historyDocId(chainId, token))
      .set({ scanLockUntil: 0 }, { merge: true });
  } catch {
    // Blokada wygasa sama po SCAN_LOCK_MS - nieudane zwolnienie kosztuje
    // najwyzej jedno pominiete odswiezenie.
  }
}

/**
 * Zapisuje stan po skanie. Przepisuje TYLKO te kawalki transakcji, ktorych
 * dotknal nowy skan (patrz `changedChunks`), i komplet kawalkow sald - te
 * zmieniaja sie rozproszone po calej mapie, wiec nie da sie ich dopisywac.
 */
export async function writeHistory(input: {
  chainId: number;
  token: string;
  previous: HistoryMeta | null;
  trades: TradeEntry[];
  balances: Map<string, bigint>;
  highBlock: bigint;
  lowBlock: bigint;
  complete: boolean;
  launchBlock: bigint | null;
  graduatedTs: number | null;
}): Promise<void> {
  const db = await getAdminDb();
  if (!db) return;

  const { parts, tradeChunks, balanceChunks } = buildParts(input.trades, input.balances);
  const oldCount = input.previous?.tradeCount ?? 0;
  const changed = changedChunks(oldCount, input.trades.length, TRADE_CHUNK_SIZE);

  const docRef = db.collection(HISTORY_COLLECTION).doc(historyDocId(input.chainId, input.token));
  const partsRef = docRef.collection(PARTS_SUBCOLLECTION);

  try {
    const batch = db.batch();

    for (const part of parts) {
      const isTrade = part.id.startsWith(TRADE_PREFIX);
      if (isTrade) {
        if (!changed) continue;
        const index = Number(part.id.slice(TRADE_PREFIX.length));
        if (index < changed.first || index > changed.last) continue;
      }
      batch.set(partsRef.doc(part.id), { rows: part.rows });
    }

    for (const id of stalePartIds(TRADE_PREFIX, input.previous?.tradeChunks ?? 0, tradeChunks)) {
      batch.delete(partsRef.doc(id));
    }
    for (const id of stalePartIds(BALANCE_PREFIX, input.previous?.balanceChunks ?? 0, balanceChunks)) {
      batch.delete(partsRef.doc(id));
    }

    batch.set(
      docRef,
      {
        chainId: input.chainId,
        token: input.token.toLowerCase(),
        highBlock: input.highBlock.toString(),
        lowBlock: input.lowBlock.toString(),
        complete: input.complete,
        launchBlock: input.launchBlock === null ? null : input.launchBlock.toString(),
        graduatedTs: input.graduatedTs,
        tradeCount: input.trades.length,
        tradeChunks,
        balanceChunks,
        holderCount: input.balances.size,
        updatedAt: Date.now(),
        scanLockUntil: 0,
      },
      { merge: true }
    );

    await withDeadline(batch.commit(), DB_DEADLINE_MS, undefined);
  } catch {
    // Nieudany zapis znaczy tylko tyle, ze nastepny odwiedzajacy zeskanuje to
    // samo jeszcze raz. Zadanie i tak odda swiezo zeskanowana historie.
  }
}

export { BALANCE_CHUNK_SIZE, TRADE_CHUNK_SIZE };
