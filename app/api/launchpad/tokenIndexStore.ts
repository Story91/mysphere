import 'server-only';
import { getAdminDb } from '../../utils/auth/firebaseAdmin';
import {
  indexDocId,
  mergeIndex,
  TOKEN_INDEX_COLLECTION,
  type IndexedToken,
} from './tokenIndexShape';

/**
 * INDEKS TOKENOW W FIRESTORE - jeden dokument na siec.
 *
 * Uzasadnienie i jedyna wlasnosc, na ktorej to stoi ("raz zapisany token nie
 * moze wypasc z listy"), sa przy `tokenIndexShape`. Tutaj jest wylacznie
 * dojscie do bazy.
 *
 * Dokument jest MALY z natury: piec startow to piec wpisow po ~150 bajtow.
 * Nawet tysiac tokenow zmiesci sie w suficie 1 MB, wiec nie tniemy go na
 * kawalki jak historii transakcji.
 */

export type TokenIndex = {
  chainId: number;
  tokens: IndexedToken[];
  /** Do ktorego bloku zeskanowano zdarzenia `Launched`. */
  lastBlock: bigint;
  updatedAt: number;
};

export async function isTokenIndexAvailable(): Promise<boolean> {
  return (await getAdminDb()) !== null;
}

export async function readTokenIndex(chainId: number): Promise<TokenIndex | null> {
  const db = await getAdminDb();
  if (!db) return null;

  try {
    const snapshot = await db.collection(TOKEN_INDEX_COLLECTION).doc(indexDocId(chainId)).get();
    if (!snapshot.exists) return null;
    const data = snapshot.data() as { tokens?: unknown; lastBlock?: unknown; updatedAt?: unknown };
    return {
      chainId,
      tokens: Array.isArray(data.tokens) ? (data.tokens as IndexedToken[]) : [],
      lastBlock: typeof data.lastBlock === 'string' && /^\d+$/.test(data.lastBlock) ? BigInt(data.lastBlock) : 0n,
      updatedAt: typeof data.updatedAt === 'number' ? data.updatedAt : 0,
    };
  } catch {
    // Awaria bazy ma znaczyc "zeskanuj sam", a nie "nie ma tokenow".
    return null;
  }
}

/**
 * Dokleja to, co zobaczyl skan, i przesuwa `lastBlock`.
 *
 * `lastBlock` przesuwamy TYLKO w gore. Skan moze przyjsc z zakresu, ktory juz
 * mamy (np. po awarii albo z drugiej karty) i cofniecie znacznika kazaloby
 * kolejnym wejsciom robic te sama robote jeszcze raz.
 */
export async function writeTokenIndex(input: {
  chainId: number;
  scanned: IndexedToken[];
  lastBlock: bigint;
}): Promise<IndexedToken[]> {
  const current = await readTokenIndex(input.chainId);
  const tokens = mergeIndex(current?.tokens ?? [], input.scanned);

  const db = await getAdminDb();
  if (!db) return tokens;

  const lastBlock = current && current.lastBlock > input.lastBlock ? current.lastBlock : input.lastBlock;

  try {
    await db.collection(TOKEN_INDEX_COLLECTION).doc(indexDocId(input.chainId)).set(
      {
        chainId: input.chainId,
        tokens,
        lastBlock: lastBlock.toString(),
        updatedAt: Date.now(),
      },
      { merge: true }
    );
  } catch {
    // Nieudany zapis znaczy tylko tyle, ze nastepne wejscie zeskanuje ten sam
    // zakres jeszcze raz. Lista, ktora wlasnie zlozylismy, i tak wraca do
    // wolajacego.
  }

  return tokens;
}
