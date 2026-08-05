import { collection, getDocs, limit, query, where } from 'firebase/firestore';
import { getPublicDb as getDb } from '../publicFirestore';

/**
 * Odczyt pojedynczego tipa PO STRONIE SERWERA, na potrzeby trasy /tip/[txHash].
 *
 * PO CO: tip byl dotad zdarzeniem widocznym tylko wewnatrz aplikacji. Nie bylo
 * niczego, co da sie komus pokazac - a to jest jedyna rzecz w tym produkcie,
 * ktora jest jednoczesnie zdarzeniem spolecznym i sprawdzalnym faktem.
 *
 * Czemu to jest wazne akurat teraz: wzrost rynkow predykcyjnych w 2026 napedzaja
 * podglady linkow pokazujace ZYWY STAN, a nie tresc. Kwota z linkiem do
 * eksploratora jest dokladnie takim obiektem: nie deklaracja "zarobilem", tylko
 * fakt, ktory kazdy moze zweryfikowac w dwie sekundy.
 *
 * Czemu osobny plik, a nie app/utils/firebase.ts: tamten modul ma ~5800 linii i
 * ciagnie logike kliencka. Ten sam powod, dla ktorego osobno stoja
 * getPostForShare.ts i profile/getProfile.ts.
 */

export type TipReceipt = {
  txHash: string;
  senderAddress: string;
  recipientAddress: string;
  amount: string;
  token: string;
  network: string;
  timestamp: number;
  postId?: string;
};

const TX_HASH_RE = /^0x[a-fA-F0-9]{64}$/;

/**
 * Tip po hashu transakcji.
 *
 * Hash zapisywany jest tak, jak podal go portfel - raz w oryginalnej wielkosci
 * liter, raz malymi. Odpytujemy oba warianty, tak samo jak przy adresach w
 * getProfile.ts. Bez tego czesc paragonow zwracalaby 404 mimo istniejacego tipa.
 */
export async function getTipReceipt(rawTxHash: string): Promise<TipReceipt | null> {
  if (!rawTxHash || !TX_HASH_RE.test(rawTxHash)) return null;

  const lower = rawTxHash.toLowerCase();
  const variants = rawTxHash === lower ? [rawTxHash] : [rawTxHash, lower];

  try {
    const snapshot = await getDocs(
      query(collection(getDb(), 'tips'), where('txHash', 'in', variants), limit(1))
    );

    const entry = snapshot.docs[0];
    if (!entry) return null;

    const data = entry.data() as Record<string, any>;

    return {
      txHash: typeof data.txHash === 'string' ? data.txHash : rawTxHash,
      senderAddress: data.senderAddress ?? '',
      recipientAddress: data.recipientAddress ?? '',
      amount: String(data.amount ?? '0'),
      token: typeof data.token === 'string' ? data.token : 'ETH',
      network: typeof data.network === 'string' ? data.network : 'base',
      timestamp: typeof data.timestamp === 'number' ? data.timestamp : 0,
      postId: typeof data.postId === 'string' ? data.postId : undefined,
    };
  } catch (error) {
    console.error('[getTipReceipt] Nie udalo sie odczytac tipa:', error);
    return null;
  }
}
